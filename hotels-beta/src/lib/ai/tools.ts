import "server-only";
import { tool, jsonSchema } from "ai";
import { getHotels, type HotelRecord } from "@/lib/directus";
import { filterHotelsByTags } from "@/lib/hotelFilters";
import { getAirportsForCity, pickPrimaryAirportForCity } from "@/lib/cityAirports";
import { getTransferRoute, hasAirportChange } from "@/lib/transferRoutes";
import {
  rankGateways,
  resolveTransfer,
  type TransferBasis,
} from "@/lib/flights/gatewayRanking";
import { getRestaurantCities, searchRestaurants as findRestaurants } from "@/lib/restaurants";
import {
  buildGuestsArray,
  fetchRatehawkSerpBatch,
  ratePrice,
} from "@/lib/ratehawk/availability";
import { asUntrustedData } from "./systemPrompt";
import {
  BROAD_RESULT_LIMIT,
  MAX_AVAILABILITY_IDS,
  MAX_HOTEL_CANDIDATES,
  MAX_RESTAURANT_CANDIDATES,
} from "./config";
import { ACTIVITY_VALUES, SETTING_VALUES, STYLE_VALUES } from "./taxonomy";
import {
  MACRO_REGION_NAMES,
  macroRegionFilter,
  matchesMacroSetting,
  resolveMacroRegion,
} from "./macroRegions";

/** The `region` column's fixed vocabulary — continents, plus the two basins
 * that are how people actually name those places (CLAUDE.md §3). */
const REGION_VALUES = [
  "Africa",
  "Asia",
  "Caribbean",
  "Central America",
  "Europe",
  "Middle East",
  "North America",
  "Oceania",
  "South America",
  "South Pacific",
] as const;

/* Tools for the concierge. Every one is read-only: they search and retrieve,
 * and nothing here writes, sends, charges, or mutates state (CLAUDE.md §50).
 *
 * The important design rule is in checkAvailability: it never returns a price
 * to the model. It returns an ordinal and a pass/fail against a ceiling the
 * user named. That makes "never quote a price" a property of the system rather
 * than a promise in a prompt — the model cannot leak a figure it was never
 * given, no matter how it is asked. Every number the visitor sees is rendered
 * by the card from its own live fetch. */

const CANDIDATE_FIELDS = [
  "id",
  "hotel_name",
  "city",
  "state_province_county_island",
  "admin_region",
  "country",
  "region",
  "affiliation",
  "highlights",
  "setting",
  "style",
  "activities",
  "ratehawk_status",
  "ratehawk_hid",
  "editor_rank",
  "ext_points",
  "best50",
  "cn",
  "forbes5",
  "michelin3keys",
  "telegraph",
  "tl100",
  "aaa5d",
] as const;

const AWARD_LABELS: Record<string, string> = {
  best50: "World's 50 Best",
  cn: "Condé Nast Gold List",
  forbes5: "Forbes 5 Star",
  michelin3keys: "Michelin 3 Keys",
  telegraph: "Telegraph Best Hotels",
  tl100: "Travel + Leisure 100",
  aaa5d: "AAA Five Diamond",
};

function awardsFor(hotel: HotelRecord): string[] {
  const record = hotel as unknown as Record<string, unknown>;
  return Object.keys(AWARD_LABELS).filter((code) => record[code] === true).map(
    (code) => AWARD_LABELS[code]
  );
}

function candidateShape(hotel: HotelRecord) {
  return {
    id: Number(hotel.id),
    name: hotel.hotel_name ?? "",
    city: hotel.city ?? "",
    area: hotel.state_province_county_island ?? "",
    adminRegion: (hotel as unknown as Record<string, string | null>).admin_region ?? "",
    country: hotel.country ?? "",
    brand: hotel.affiliation ?? "",
    highlights: hotel.highlights ?? "",
    setting: hotel.setting ?? [],
    style: hotel.style ?? [],
    activities: hotel.activities ?? [],
    awards: awardsFor(hotel),
    // "passive" means the property is not sold through our availability
    // supplier at all and never will be (CLAUDE.md §42) — not that it is sold
    // out. The model should still recommend these; it just must not promise
    // they can be priced here.
    bookableHere: hotel.ratehawk_status !== "passive" && Boolean(hotel.ratehawk_hid),
  };
}

/** Levenshtein distance, abandoned once it exceeds `max`.
 *
 * Bounded because the only question asked of it is "within two edits?", and
 * quitting early keeps a full-collection sweep cheap. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowBest = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost
      );
      current.push(value);
      if (value < rowBest) rowBest = value;
    }
    if (rowBest > max) return max + 1;
    previous = current;
  }
  return previous[b.length];
}

/** Real geography values closest to what was asked, for a search that matched
 * nothing.
 *
 * Runs only on the zero path, so the extra Directus read costs nothing in the
 * normal case. Four short columns across the collection is a cheap query, and
 * it is the difference between the model saying "we have nothing in Tuscany"
 * and it noticing the value it wanted was spelled differently. */
async function nearestGeography(terms: string[]) {
  const simplify = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const rows = await getHotels({
    fields: ["country", "admin_region", "state_province_county_island", "city"],
    filter: { published: { _eq: true } },
    limit: -1,
  });

  const known = new Map<string, string>();
  for (const row of rows) {
    const record = row as unknown as Record<string, string | null>;
    for (const field of [
      "country",
      "admin_region",
      "state_province_county_island",
      "city",
    ]) {
      const value = (record[field] ?? "").trim();
      if (value) known.set(`${field}:${value}`, value);
    }
  }

  const wanted = terms.map(simplify).filter(Boolean);
  const scored: { value: string; field: string; score: number }[] = [];

  for (const [key, value] of known) {
    const field = key.slice(0, key.indexOf(":"));
    const simple = simplify(value);
    let best = 0;
    for (const term of wanted) {
      if (!term) continue;
      let score = 0;
      if (simple === term) score = 100;
      else if (simple.includes(term) || term.includes(simple)) score = 70;
      else {
        // Shared words — "Tyrol" against "South Tyrol", "Como" against
        // "Lake Como".
        const words = simple.split(" ");
        const known = new Set(words);
        const termWords = term.split(" ");
        const shared = termWords.filter((word) => known.has(word)).length;
        if (shared) score = 30 + shared * 10;
        else {
          // Near-spellings, which is the case this whole function exists for.
          // Containment and whole-word overlap both score "Tirol" against
          // "South Tyrol" at zero — one letter apart, and the single most
          // likely thing for someone to type. Anything within two edits of a
          // word we hold counts.
          let best = 0;
          for (const termWord of termWords) {
            if (termWord.length < 4) continue;
            for (const word of words) {
              if (word.length < 4) continue;
              const distance = editDistance(termWord, word, 2);
              if (distance <= 2) best = Math.max(best, distance === 1 ? 55 : 45);
            }
          }
          score = best;
        }
      }
      if (score > best) best = score;
    }
    if (best) scored.push({ value, field, score: best });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.value.localeCompare(b.value))
    .slice(0, 8)
    .map(({ value, field }) => ({
      value,
      field:
        field === "state_province_county_island"
          ? "area"
          : field === "admin_region"
            ? "adminRegion"
            : field,
    }));
}

/** How many of the tags the visitor asked for this hotel actually carries.
 *
 * filterHotelsByTags is an OR within each field (§4), so a hotel matching one
 * of three requested activities passes the same test as one matching all three.
 * That is right for inclusion and wrong for ordering: asked for skiing AND a
 * family, a hotel tagged both should come first. */
function tagMatchScore(
  hotel: HotelRecord,
  requested: { activities: string[]; settings: string[]; styles: string[] }
): number {
  const count = (values: string[] | null | undefined, wanted: string[]) => {
    if (!wanted.length) return 0;
    const set = new Set(values ?? []);
    return wanted.filter((v) => set.has(v)).length;
  };
  return (
    count(hotel.activities, requested.activities) +
    count(hotel.setting, requested.settings) +
    count(hotel.style, requested.styles)
  );
}

/** Order candidates by how well they answer the question, not by how decorated
 * they are. Relevance first, then editorial rank, then accreditation count as a
 * last tiebreak only. The incoming array is already sorted by editor_rank and
 * name, and Array.prototype.sort is stable, so equal scores keep that order. */
function relevanceSort<T extends HotelRecord>(
  hotels: T[],
  requested: { activities: string[]; settings: string[]; styles: string[] }
): T[] {
  const asked =
    requested.activities.length + requested.settings.length + requested.styles.length;
  if (!asked) return hotels;

  const score = new Map<T, number>();
  for (const hotel of hotels) score.set(hotel, tagMatchScore(hotel, requested));

  return hotels.slice().sort((a, b) => {
    const diff = (score.get(b) ?? 0) - (score.get(a) ?? 0);
    if (diff) return diff;
    const points = (h: T) => Number((h as unknown as Record<string, unknown>).ext_points ?? 0);
    return points(b) - points(a);
  });
}

/** The axes a broad result set could be cut along, with real counts.
 *
 * This is what turns "that is too many, narrow it down" into a question worth
 * answering — "Switzerland (22), France (12), Austria (4)" gives the visitor
 * something to point at. Only axes that would actually divide the set are
 * returned: an axis where everything shares one value narrows nothing, and
 * offering it wastes the one question we get to ask.
 *
 * Tags the visitor already asked for are excluded — re-offering "Skiing" to
 * someone who asked about skiing is noise. */
function narrowingAxes(
  hotels: HotelRecord[],
  requested: { activities: string[]; settings: string[]; styles: string[] }
) {
  const tally = (values: (string | null | undefined)[]) => {
    const counts = new Map<string, number>();
    for (const value of values) {
      const key = (value ?? "").trim();
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  };

  type Axis = { covers: number; of: number; values: { value: string; count: number }[] };

  const shape = (counts: Map<string, number>, exclude: string[] = []): Axis | null => {
    const skip = new Set(exclude);
    const kept = [...counts.entries()].filter(([value]) => !skip.has(value));
    // One value covering the whole set is not a choice.
    if (kept.length < 2) return null;
    return {
      // How many of the set this axis actually accounts for. It is not always
      // all of them: `area` is deliberately null for a major city (§3), so
      // half of Italy is invisible on it and quoting its counts as if they
      // were the whole country understates Tuscany by a factor of five.
      // Saying so lets the model qualify the offer instead of guessing.
      covers: kept.reduce((sum, [, count]) => sum + count, 0),
      of: hotels.length,
      values: kept
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 8)
        .map(([value, count]) => ({ value, count })),
    };
  };

  const flat = (pick: (h: HotelRecord) => string[] | null | undefined) =>
    tally(hotels.flatMap((h) => pick(h) ?? []));
  const field = (key: string) =>
    tally(hotels.map((h) => (h as unknown as Record<string, string | null>)[key]));

  const axes: Record<string, Axis> = {};
  const add = (name: string, axis: Axis | null) => {
    if (axis) axes[name] = axis;
  };

  add("country", shape(tally(hotels.map((h) => h.country))));
  // Never null, so this one always partitions the whole set — the axis to
  // prefer when `area` covers only part of it.
  add("adminRegion", shape(field("admin_region")));
  add("area", shape(field("state_province_county_island")));
  add("style", shape(flat((h) => h.style), requested.styles));
  add("activities", shape(flat((h) => h.activities), requested.activities));

  return axes;
}

/* ------------------------------------------------------------------------- */

const searchHotels = tool({
  description:
    "Search the myOLTRA hotel collection by geography and character. Returns " +
    "candidate properties with their editorial detail so you can rank them " +
    "yourself. Never returns a price. Use the broadest " +
    "geography that fits, then narrow — city is often too tight, and `area` " +
    "(Lake Como, Amalfi Coast, Engadin) is usually what a traveller means.\n\n" +
    "For anything spanning areas or borders — the Alps, the Caribbean, the " +
    "Mediterranean, Scandinavia — use `macroRegion`, whose enum lists every " +
    "one supported. `country`/`area` hold single exact values and will not " +
    "match those names.\n\n" +
    "PASS `stay` WHENEVER THE VISITOR HAS TOLD YOU THE DATES — it costs " +
    "nothing extra and returns availability and price rank with the results, " +
    "so you do not need checkAvailability afterwards. But only then: dates " +
    "you picked yourself, or left over in the page's search form, narrow the " +
    "answer to a week nobody asked about.\n\n" +
    "Tags within a field are OR'd, not AND'd, so extra tags WIDEN the search. " +
    "Ask for the tags that genuinely matter and let the ranking do the rest — " +
    "results come back ordered by how many of your tags each one carries.\n\n" +
    "If the result is too broad to recommend you get counts and narrowing " +
    "options back instead of properties, with `tooBroadToShow: true`. That is " +
    "not an error and not an empty result: it means ask, then search again.\n\n" +
    "TO CHECK WHETHER WE HOLD A NAMED PROPERTY, pass `name` and nothing " +
    "else. Geography is the wrong instrument for that question and will tell " +
    "you we do not have a hotel we do: searching the city misses any sibling " +
    "filed under a neighbouring one. Never say a named property is outside " +
    "the collection without having searched its name.",
  inputSchema: jsonSchema<{
    macroRegion?: string;
    region?: string;
    name?: string;
    country?: string;
    adminRegion?: string;
    area?: string;
    city?: string;
    settings?: string[];
    styles?: string[];
    activities?: string[];
    limit?: number;
    showAll?: boolean;
    stay?: {
      checkIn: string;
      checkOut: string;
      adults?: number;
      kids?: number;
      childrenAges?: number[];
      rooms?: number;
      maxPricePerStay?: number;
      currency?: string;
    };
  }>({
    type: "object",
    properties: {
      // Geography a traveller names that no column holds. Enumerated for the
      // same reason the taxonomy tags are: a term outside the list matches
      // nothing, and the model reaching for a plausible one ("Alps") cost a
      // wasted round trip every time.
      macroRegion: {
        type: "string",
        enum: [...MACRO_REGION_NAMES],
        description:
          "A region spanning areas or borders — use this for the Alps, the " +
          "Caribbean, Scandinavia and the like, INSTEAD of country/area. " +
          "Combines with settings/styles/activities as usual.",
      },
      region: {
        type: "string",
        enum: [...REGION_VALUES],
        description: "Continent-level scope. Broader than country.",
      },
      country: { type: "string", description: "Exact country name, e.g. Italy." },
      adminRegion: {
        type: "string",
        description:
          "Administrative unit, e.g. Lombardy, Valais, Kyoto Prefecture. " +
          "Interchangeable with `area` — either one matches both fields, so " +
          "you do not have to guess which holds the name.",
      },
      area: {
        type: "string",
        description:
          "Traveller-facing area, e.g. Lake Como, Amalfi Coast, Engadin, " +
          "Masai Mara. Interchangeable with `adminRegion`. A region name like " +
          "Tuscany returns everything in it, cities included — narrow with " +
          "`settings` (Countryside, City) rather than by leaving hotels out.",
      },
      name: {
        type: "string",
        description:
          "Part of a hotel name. Use alone to answer whether we hold a named " +
          "property; matching is case-insensitive and partial.",
      },
      city: { type: "string", description: "Exact city name." },
      // Enumerated, not free text. These are locked vocabularies (§44), and a
      // tag outside them matches nothing — live testing had the model guessing
      // "quiet"/"secluded"/"wellness" and burning two round trips on an empty
      // result before broadening. An enum makes that impossible.
      settings: {
        type: "array",
        items: { type: "string", enum: [...SETTING_VALUES] },
        description:
          "Setting tags. Use only these exact values.\n" +
          "The water ones now mean something precise: Beachfront is ON the " +
          "sand, Beach has a road between, Oceanfront is the sea but no " +
          "beach, Coastal is near the sea but not on it, and Waterfront is " +
          "fresh water — rivers, lakes, canals. A sea question should still " +
          "pass the sea family (Beachfront, Beach, Oceanfront, Coastal) " +
          "rather than the one word the visitor used, because the line " +
          "between them is finer than most people mean; they are OR'd, so " +
          "that widens correctly. Pass Waterfront only for fresh water.",
      },
      styles: {
        type: "array",
        items: { type: "string", enum: [...STYLE_VALUES] },
        description: "Architectural/character tags. Use only these exact values.",
      },
      activities: {
        type: "array",
        items: { type: "string", enum: [...ACTIVITY_VALUES] },
        description: "Purpose tags. Use only these exact values.",
      },
      limit: { type: "number" },
      showAll: {
        type: "boolean",
        description:
          "Only when the visitor has been told the set is large and has asked " +
          "to see it anyway. Returns the properties instead of counts.",
      },
      stay: {
        type: "object",
        description:
          "The dates and party — ONLY when the visitor has said when they are " +
          "going. Supply it and the results come back with availability and " +
          "price rank attached. Omit it when they gave no timing: dates you " +
          "chose yourself filter the results against a week nobody asked " +
          "about, and hide everything sold out that week.",
        properties: {
          checkIn: { type: "string", description: "yyyy-mm-dd" },
          checkOut: { type: "string", description: "yyyy-mm-dd" },
          adults: { type: "number" },
          kids: { type: "number" },
          childrenAges: { type: "array", items: { type: "number" } },
          rooms: { type: "number" },
          maxPricePerStay: {
            type: "number",
            description:
              "Ceiling for the whole stay, if the visitor named one. Used " +
              "only to set withinBudget — the figure is never echoed back.",
          },
          currency: { type: "string" },
        },
        required: ["checkIn", "checkOut"],
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  }),
  async execute(input) {
    const and: Record<string, unknown>[] = [{ published: { _eq: true } }];

    // A macro-region may arrive in its own parameter or, because the model
    // does not always reach for a new parameter, inside one of the ordinary
    // geography fields. Accept it either way: "Alps" in `area` used to match
    // nothing and cost a retry.
    const macro =
      resolveMacroRegion(input.macroRegion) ??
      resolveMacroRegion(input.area) ??
      resolveMacroRegion(input.adminRegion) ??
      resolveMacroRegion(input.country) ??
      resolveMacroRegion(input.city);

    if (macro) and.push(macroRegionFilter(macro));

    // A field whose value WAS the macro-region must not also be applied
    // literally — "Alps" as both a macro-region and an exact area match is a
    // guaranteed zero.
    const literal = (value: string | undefined) =>
      value && !resolveMacroRegion(value) ? value : undefined;

    const country = literal(input.country);
    const adminRegion = literal(input.adminRegion);
    const area = literal(input.area);
    const city = literal(input.city);

    if (input.region) and.push({ region: { _eq: input.region } });
    if (country) and.push({ country: { _eq: country } });
    /* A name search, added 2026-09-11 after the concierge told a visitor that
     * "neither Cheval Blanc nor La Bouitte is in the myOLTRA collection" when
     * both are. There was no way for it to ask: this tool searched geography
     * only, so the model searched `city: "Courchevel"`, got the one property
     * filed under that exact value, and concluded the rest were not ours.
     * Cheval Blanc is filed under "Courchevel 1850" - a DIFFERENT city value
     * for the same resort - so a city search could never have found it.
     *
     * Denying real inventory is worse than anything else this tool can get
     * wrong: a guest is told we cannot offer a hotel we can. */
    if (input.name) and.push({ hotel_name: { _icontains: input.name } });
    if (city) and.push({ city: { _eq: city } });

    /* `area` and `adminRegion` are one geography slot, matched against BOTH
     * columns.
     *
     * They are separate fields with separate meanings (§3) but they overlap
     * constantly — Tuscany, Bali, Sicily and Rajasthan are legitimately both
     * the administrative unit and what a traveller types — and the traveller
     * field is deliberately null for a major city, so it holds a fifth of what
     * the region actually contains.
     *
     * Matching `area: "Tuscany"` against the traveller column alone returned 2
     * hotels of the 10 in Tuscany, silently dropping every Florence property
     * plus Il Pellicano and Forte dei Marmi, which sit under their own
     * sub-areas. The model has no way to know which of two near-identical
     * fields holds the value it wants, and picking wrong should widen the
     * search, not gut it. */
    for (const value of [adminRegion, area]) {
      if (!value) continue;
      and.push({
        _or: [
          { admin_region: { _eq: value } },
          { state_province_county_island: { _eq: value } },
        ],
      });
    }

    const rows = await getHotels({
      fields: CANDIDATE_FIELDS as unknown as string[],
      filter: and.length === 1 ? and[0] : { _and: and },
      // Editorial rank first, name second. ext_points is deliberately NOT here:
      // it is a count of external accreditations, and sorting by it made the
      // candidate list a trophy cabinet rather than an answer to the question
      // asked. It survives only as the last tiebreak in relevanceSort below,
      // and as `awards` labels the model may cite when accreditation is what
      // the visitor actually asked about.
      sort: ["-editor_rank", "hotel_name"],
      limit: -1,
    });

    // setting/style/activities are native Postgres text[] columns that Directus
    // cannot filter (CLAUDE.md §4), so this narrowing runs in JS — exactly as
    // the Hotels page does it.
    const requested = {
      activities: input.activities ?? [],
      settings: input.settings ?? [],
      styles: input.styles ?? [],
    };
    // The macro-region's own setting requirement is a separate AND pass, not
    // merged into `requested.settings` — filterHotelsByTags ORs within a field,
    // so folding "Mountains" in beside a visitor's own setting would widen the
    // search instead of narrowing it.
    const inRegion = macro ? rows.filter((h) => matchesMacroSetting(h, macro)) : rows;
    const narrowed = relevanceSort(filterHotelsByTags(inRegion, requested), requested);

    // Nothing matched, and geography was part of the ask. A bare zero is the
    // least useful thing we can say: the model cannot tell "we have none there"
    // from "that is not a name this database knows", so it either retries blind
    // or tells the visitor we have nothing. Hand back the real values closest
    // to what was asked instead, and let it correct in the same breath.
    if (!narrowed.length) {
      const asked = [input.macroRegion, country, adminRegion, area, city].filter(
        (v): v is string => Boolean(v)
      );
      if (asked.length) {
        const didYouMean = await nearestGeography(asked);
        return asUntrustedData("myoltra-hotels", {
          matched: 0,
          searchedFor: asked,
          didYouMean,
          guidance: didYouMean.length
            ? "No hotels matched that geography. Each entry in didYouMean is a " +
              "real value and the parameter it belongs to, closest first. " +
              "Search again using one of them EXACTLY — value and field " +
              "together. Do not try another spelling of your own: this list " +
              "is the collection's actual contents and a guess is another " +
              "empty result."
            : "No hotels matched that geography, and nothing in the " +
              "collection is close to that name. Widen the search yourself — " +
              "the surrounding country or macroRegion — rather than telling " +
              "them we have nothing, and say plainly that the place they " +
              "named is not one we cover.",
        });
      }
    }

    const capped = narrowed.slice(
      0,
      Math.min(input.limit ?? MAX_HOTEL_CANDIDATES, MAX_HOTEL_CANDIDATES)
    );

    const shaped = capped.map(candidateShape);

    // Availability in the same round trip when the dates are known. The model
    // asked for these two things back to back every single time, and the
    // second ask cost more than the supplier call it triggered.
    const ranked = input.stay?.checkIn && input.stay?.checkOut
      ? await rankAvailability({ ...input.stay, ids: shaped.map((h) => h.id) })
      : null;

    // What the visitor would actually end up looking at: the properties that
    // can be booked for their dates, or every match when no dates are known.
    // `ranked` is either a rejection (a past check-in, say) or a hotel list —
    // a rejection has no count to report, and must not read as "none available".
    const rankedHotels =
      ranked && "hotels" in ranked && Array.isArray(ranked.hotels) ? ranked.hotels : null;
    const availableCount = rankedHotels
      ? rankedHotels.filter((h) => "available" in h && h.available).length
      : null;
    const facing = availableCount ?? narrowed.length;

    // Too many to recommend: hand back counts and the axes that would cut it
    // down, and no properties at all. The model has nothing to present, so it
    // asks — which is the behaviour we want and could not get from the prompt
    // alone. `showAll` is the way back out for a visitor who wants the lot.
    if (facing > BROAD_RESULT_LIMIT && !input.showAll) {
      return asUntrustedData("myoltra-hotels", {
        tooBroadToShow: true,
        matched: narrowed.length,
        availableForTheseDates: availableCount,
        narrowBy: narrowingAxes(narrowed, requested),
        guidance:
          `${facing} properties is a directory, not a recommendation. Do NOT ` +
          `call presentResults. Tell the visitor the counts above, say what ` +
          `they have in common, and ask for ONE thing that would cut it down ` +
          `— use narrowBy for concrete options with real counts. Each axis ` +
          `reports "covers" out of "of": where those differ the axis explains ` +
          `only part of the set, so do not present its values as the full ` +
          `picture. Call this tool again with their answer, or with ` +
          `showAll: true if they ask to see everything regardless.`,
      });
    }

    return asUntrustedData("myoltra-hotels", {
      matched: narrowed.length,
      returned: shaped.length,
      truncated: narrowed.length > shaped.length,
      hotels: shaped,
      ...(ranked ? { availability: ranked } : {}),
    });
  },
});

const getHotelDetails = tool({
  description:
    "Full editorial description for one hotel, when you need more than the " +
    "highlights line to judge fit. Contains no prices.",
  inputSchema: jsonSchema<{ id: number }>({
    type: "object",
    properties: { id: { type: "number" } },
    required: ["id"],
    additionalProperties: false,
  }),
  async execute({ id }) {
    const rows = await getHotels({
      fields: [...CANDIDATE_FIELDS, "description", "total_rooms_suites_villas"] as unknown as string[],
      filter: { id: { _eq: id } },
      limit: 1,
    });
    const hotel = rows[0];
    if (!hotel) return asUntrustedData("myoltra-hotels", { found: false });

    return asUntrustedData("myoltra-hotels", {
      found: true,
      ...candidateShape(hotel),
      description: hotel.description ?? "",
      rooms: (hotel as unknown as Record<string, unknown>).total_rooms_suites_villas ?? null,
    });
  },
});

type StayInput = {
  ids: number[];
  checkIn: string;
  checkOut: string;
  adults?: number;
  kids?: number;
  childrenAges?: number[];
  rooms?: number;
  maxPricePerStay?: number;
  currency?: string;
};

/* The availability pass, shared by checkAvailability and by searchHotels'
 * inline mode.
 *
 * Extracted so searchHotels can return availability WITH the candidates. When
 * the two were separate tools the model always called them back to back, and
 * that second call is a whole extra model round trip — measured at 9.7s of a
 * 26.6s answer, far more than the supplier request it wraps. Deciding to ask
 * is the expensive part here, not the asking.
 *
 * Returns ranks and a within-budget flag. The amount is used to sort and to
 * test the ceiling and is then dropped: the model is never handed a figure, so
 * it cannot leak one (§50). */
async function rankAvailability(input: StayInput) {
  // The supplier rejects a past check-in outright, and the whole batch fails
  // with it. Catching it here turns a dead end into something the model can
  // act on — it gets told the year is wrong rather than that availability is
  // down, which is what the visitor was previously shown.
  const today = new Date().toISOString().slice(0, 10);
  if (input.checkIn < today) {
    return {
      error: "check-in is in the past",
      today,
      received: input.checkIn,
      fix: "Re-run with the next occurrence of that month, not one already past.",
    };
  }
  if (input.checkOut <= input.checkIn) {
    return {
      error: "check-out must be after check-in",
      received: { checkIn: input.checkIn, checkOut: input.checkOut },
    };
  }

  const ids = input.ids.slice(0, MAX_AVAILABILITY_IDS);
  if (!ids.length) return { hotels: [] };

  const rows = await getHotels({
    fields: ["id", "ratehawk_hid", "ratehawk_status"],
    filter: { id: { _in: ids } },
    limit: -1,
  });

  // Skip passive properties entirely — they will never return rates, so
  // asking wastes a request against a rate-limited supplier (§42).
  const priceable = rows.filter(
    (h) => h.ratehawk_status !== "passive" && h.ratehawk_hid
  );
  const hidToId = new Map<number, number>();
  for (const h of priceable) hidToId.set(Number(h.ratehawk_hid), Number(h.id));

  if (!hidToId.size) {
    return {
      hotels: rows.map((h) => ({
        id: Number(h.id),
        available: false,
        reason:
          h.ratehawk_status === "passive" ? "not-sold-here" : "no-supplier-record",
      })),
    };
  }

  const rooms = Math.max(1, input.rooms ?? 1);
  const serp = await fetchRatehawkSerpBatch({
    hids: [...hidToId.keys()],
    checkin: input.checkIn,
    checkout: input.checkOut,
    guests: buildGuestsArray(
      Math.max(1, input.adults ?? 2),
      Math.max(0, input.kids ?? 0),
      input.childrenAges ?? [],
      rooms
    ),
    currency: input.currency || "EUR",
    residency: "gb",
  });

  // Cheapest rate per hotel, used ONLY to rank and to test the ceiling.
  // The amount is deliberately dropped before anything reaches the model.
  const cheapest = new Map<number, number>();
  for (const hotel of serp) {
    const id = hidToId.get(Number(hotel.hid));
    if (!id) continue;
    for (const rate of hotel.rates ?? []) {
      const price = ratePrice(rate);
      if (!price) continue;
      const current = cheapest.get(id);
      if (current === undefined || price.amount < current) {
        cheapest.set(id, price.amount);
      }
    }
  }

  const ranked = [...cheapest.entries()].sort((a, b) => a[1] - b[1]);
  const rankById = new Map(ranked.map(([id], index) => [id, index + 1]));

  return {
    note: "Ranks only. No amounts are provided; the cards display live prices.",
    hotels: rows.map((h) => {
      const id = Number(h.id);
      const amount = cheapest.get(id);
      if (amount === undefined) {
        return {
          id,
          available: false,
          reason:
            h.ratehawk_status === "passive"
              ? "not-sold-here"
              : "no-rates-for-these-dates",
        };
      }
      return {
        id,
        available: true,
        priceRank: rankById.get(id) ?? null,
        withinBudget:
          input.maxPricePerStay == null ? null : amount <= input.maxPricePerStay,
      };
    }),
  };
}

const checkAvailability = tool({
  description:
    "Check which of these hotels can be booked for the given dates, and how " +
    "they rank against each other on price. Returns a rank and a within-budget " +
    "flag — never an amount. Use it to filter and order, never to state a " +
    "price: the cards show live figures.",
  inputSchema: jsonSchema<{
    ids: number[];
    checkIn: string;
    checkOut: string;
    adults?: number;
    kids?: number;
    childrenAges?: number[];
    rooms?: number;
    maxPricePerStay?: number;
    currency?: string;
  }>({
    type: "object",
    properties: {
      ids: { type: "array", items: { type: "number" } },
      checkIn: { type: "string", description: "yyyy-mm-dd" },
      checkOut: { type: "string", description: "yyyy-mm-dd" },
      adults: { type: "number" },
      kids: { type: "number" },
      childrenAges: { type: "array", items: { type: "number" } },
      rooms: { type: "number" },
      maxPricePerStay: {
        type: "number",
        description:
          "Ceiling for the whole stay, if the visitor named one. Used only to " +
          "set withinBudget — the figure is never echoed back to you.",
      },
      currency: { type: "string" },
    },
    required: ["ids", "checkIn", "checkOut"],
    additionalProperties: false,
  }),
  async execute(input) {
    return asUntrustedData("availability", await rankAvailability(input));
  },
});

/* A HOTEL NAME RESOLVED TO A DESTINATION KEY, because the model does not know
 * our keys and cannot be expected to.
 *
 * Measured, not guessed: asked "how do I reach Soneva Fushi?" the concierge
 * called nearestAirport once with city="Soneva Fushi" and got nothing, because
 * the key is "Kunfunadhoo Island". Angama Mara had worked only by luck - its
 * key is "Masai Mara", a name famous enough to guess. Nobody guesses
 * Kunfunadhoo.
 *
 * Telling the model to look the city up first would be another optional step,
 * and CLAUDE-AI.md's record is that those get skipped. So the tools are
 * forgiving instead. Shared by nearestAirport and compareGateways, or the two
 * would answer the same question differently depending on which one was asked
 * - and compareGateways is called on exactly the same names. */
async function resolveDestinationKey(
  city: string
): Promise<{ city: string; resolvedFrom: string | null }> {
  if (getAirportsForCity(city).length > 0 || getTransferRoute(city)) {
    return { city, resolvedFrom: null };
  }
  const matches = await getHotels({
    fields: ["hotel_name", "city", "state_province_county_island"] as unknown as string[],
    filter: { hotel_name: { _icontains: city } },
    limit: 2,
  });
  const hit = matches[0] as unknown as Record<string, string | null> | undefined;
  /* Its traveller area, for the eight wilderness lodges with no city (§3). */
  const candidate = (hit?.city ?? "").trim() || (hit?.state_province_county_island ?? "").trim();
  if (matches.length === 1 && candidate) return { city: candidate, resolvedFrom: city };
  return { city, resolvedFrom: null };
}

/** What to SAY about the last leg, not what we call it internally. §50's rule:
 * a phrase at home in a schema does not go in an answer, and "onward-leg" or
 * "unroutable" would have gone straight into one. */
function transferSentence(basis: TransferBasis, minutes: number | null): string {
  switch (basis) {
    case "road":
      return minutes !== null
        ? `About ${Math.round(minutes)} minutes by road.`
        : "By road.";
    case "onward-leg":
      return "The last stretch is not a drive - call nearestAirport for the route and give it as it stands. Do not put a time on it.";
    case "no-road-route":
      return "There is no road from this airport - say you will confirm how the last stretch works rather than describing one.";
    case "unroutable":
    case "implausible":
    case "unmeasured":
      return "We have not measured this transfer - say it will be confirmed rather than estimating it.";
  }
}

const nearestAirport = tool({
  description:
    "Which airports serve a destination we cover, how far they are, and how a " +
    "guest gets from the airport to the door. `airports` is ordered BEST FIRST, " +
    "not nearest first, and distKm is straight-line distance — so do not call " +
    "the first one the closest, and do not infer drive time from it: a road " +
    "through mountains is far longer than the line across them. REQUIRED before answering any " +
    "question about which airport to use or how to reach a property — your own " +
    "knowledge of the route is not a substitute, because the transfer detail " +
    "here is ours and yours may be out of date or wrong for this property.",
  inputSchema: jsonSchema<{ city: string }>({
    type: "object",
    properties: {
      city: {
        type: "string",
        description:
          "The destination as we name it — a city (\"Paris\") or a traveller " +
          "area (\"Masai Mara\", \"Okavango Delta\"). Use the obvious name; an " +
          "unknown one simply returns found: false.",
      },
    },
    required: ["city"],
    additionalProperties: false,
  }),
  async execute({ city }) {
    /* `resolvedFrom` reports the swap when a hotel name was resolved to its
     * destination, so an answer can say which destination it is describing. */
    const resolved = await resolveDestinationKey(city);
    const key = resolved.city;
    const resolvedFrom = resolved.resolvedFrom;

    const airports = getAirportsForCity(key);
    const primary = pickPrimaryAirportForCity(key);
    /* The arrival airport is not the journey. For a reserve or an island the
     * onward leg often departs from a DIFFERENT airport — Nairobi to Wilson to
     * a Mara airstrip — and that leg is the part a guest has to arrange.
     *
     * `transfer: null` is a real answer and the prompt treats it as one. The
     * model is handed nothing rather than asked not to guess, because a
     * prompt-only rule of this shape gets skipped (§50) and an invented boat
     * is something a guest can act on. */
    const route = getTransferRoute(key);
    return asUntrustedData("airports", {
      city: key,
      resolvedFrom,
      found: airports.length > 0,
      primary: primary
        ? { iata: primary.iata, label: primary.label, distKm: primary.distKm }
        : null,
      /* `transferMinutes` is the MEASURED drive from that airport to the
       * destination, and it is here rather than left to be inferred from
       * distKm because distKm is a straight line: Val d'Isere is 111km from
       * Geneva and three and a quarter hours by road, and reading the first
       * number as the second is what once answered Turin. Null means we do not
       * have a drive time - either because there is no road, or because the
       * last stretch is a flight or a boat, which is what `transfer` below
       * describes. Never fill it in from your own knowledge. */
      airports: airports.map((a) => {
        const leg = resolveTransfer(key, a.iata);
        return {
          iata: a.iata,
          label: a.label,
          distKm: a.distKm,
          transferMinutes: leg.minutes,
        };
      }),
      transfer: route
        ? {
            arriveAt: route.arriveAt,
            arriveAtLabel: route.arriveAtLabel,
            changesAirport: hasAirportChange(route),
            legs: route.legs,
            note: route.note ?? null,
          }
        : null,
    });
  },
});

/* WHICH AIRPORT, FOR THIS GUEST. The one question `nearestAirport` cannot
 * answer, because the answer depends on where they start.
 *
 * The failure it removes, reported by Ulrik: a destination with several airports
 * was being answered from the airport list alone, so the nearest or the
 * hand-first one won and the flight it took to get there was never weighed.
 * Courchevel is the clean case - Chambery is an hour closer by road than
 * Geneva, and from most origins you reach Chambery with a connection that costs
 * more than the hour. A shorter drive is not a shorter journey.
 *
 * THE RANKING IS COMPUTED, NOT PROMPTED. The model receives the order and the
 * totals already worked out, the same reason it receives price ranks instead of
 * prices: a rule it has to apply itself is a rule it can skip. */
const compareGateways = tool({
  description:
    "Compare the airports serving one destination BY TOTAL TRAVEL TIME from a " +
    "given departure airport — the flight and the transfer added together — and " +
    "return them in order, best first. REQUIRED before naming an airport, or " +
    "passing flight legs to presentResults, whenever the destination has more " +
    "than one airport and you know where the visitor is flying from. The " +
    "ordering is already done: take it. Never re-rank it on distance, and never " +
    "prefer an airport because the drive is shorter — that is the mistake this " +
    "exists to prevent, because the drive it saves is usually paid for twice " +
    "over by the change of planes needed to get there.",
  inputSchema: jsonSchema<{
    city: string;
    origin: string;
    departureDate: string;
    returnDate?: string;
    adults?: number;
    children?: number;
    cabinClass?: string;
  }>({
    type: "object",
    properties: {
      city: {
        type: "string",
        description:
          "The destination as we name it — a city (\"Courchevel 1850\") or a " +
          "traveller area (\"Masai Mara\"). A hotel name is resolved to its " +
          "destination, as in nearestAirport.",
      },
      origin: {
        type: "string",
        description:
          "IATA code the visitor departs from. Use the one they named, or their " +
          "home airport from the page context. Without it there is nothing to " +
          "compare and the tool says so.",
      },
      departureDate: { type: "string", description: "yyyy-mm-dd" },
      returnDate: { type: "string", description: "yyyy-mm-dd" },
      adults: { type: "number" },
      children: { type: "number" },
      cabinClass: {
        type: "string",
        enum: ["economy", "premium_economy", "business", "first"],
      },
    },
    required: ["city", "origin", "departureDate"],
    additionalProperties: false,
  }),
  async execute(input) {
    const { city, origin, ...rest } = input;
    const key = await resolveDestinationKey(city);
    const airports = getAirportsForCity(key.city);

    if (!airports.length) {
      return asUntrustedData("gateways", {
        city: key.city,
        resolvedFrom: key.resolvedFrom,
        found: false,
      });
    }

    const from = origin.trim().toUpperCase();
    const { flightDataIsSynthetic } = await import("@/lib/flights/duffelClient");

    /* TWO CASES WHERE NOTHING IS SEARCHED, and they must not be dressed up as a
     * comparison. Returning `rankGateways` over an empty set of flight facts
     * reads every airport as `flies: false` and says "nothing flies to any of
     * these airports on those dates" - which for a one-airport destination is
     * not a finding, it is the absence of a search.
     *
     *   * ONE AIRPORT. Nothing to compare, and two Duffel searches to discover
     *     that would be pure latency. The transfer still comes back, because
     *     "how far is the hotel from the airport" is asked here just as often.
     *   * A DUFFEL TEST TOKEN. That environment returns a fabricated nonstop on
     *     every route, so the totals would rank real drives against invented
     *     flights and hand back the shortest drive - the exact fault this tool
     *     exists to remove, stated with false confidence. */
    const synthetic = flightDataIsSynthetic();
    if (airports.length === 1 || synthetic) {
      return asUntrustedData("gateways", {
        city: key.city,
        resolvedFrom: key.resolvedFrom,
        found: true,
        from,
        compared: false,
        basis:
          airports.length === 1
            ? "One airport serves this destination, so there is nothing to compare - give it, with the transfer."
            : "Flight times cannot be compared in this environment, so this is our standing order for the destination: the airport listed first is the one guests use. Give it plainly and do not call it the quickest.",
        rankedOnWholeJourney: false,
        airports: airports.map((a) => {
          const leg = resolveTransfer(key.city, a.iata);
          return {
            iata: a.iata,
            label: a.label,
            transferMinutes: leg.minutes,
            transfer: transferSentence(leg.basis, leg.minutes),
          };
        }),
      });
    }

    const { gatewayFlightFacts } = await import("./flightSearch");
    const facts = await gatewayFlightFacts({
      ...rest,
      origin: from,
      destinations: airports.map((a) => a.iata).filter((iata) => iata !== from),
    });

    const comparison = rankGateways(key.city, facts, airports);
    return asUntrustedData("gateways", {
      city: key.city,
      resolvedFrom: key.resolvedFrom,
      found: true,
      from,
      compared: true,
      /* Named "basis" rather than "note" so it reads as the grounds for the
       * order, which is what the model needs to decide how firmly to state it. */
      basis: comparison.basis,
      rankedOnWholeJourney: comparison.comparable,
      airports: comparison.ranked.map((g) => ({
        iata: g.iata,
        label: g.label,
        recommended: g.recommended,
        flies: g.flies,
        nonstop: g.nonstop,
        /* The flight we would put them on - the nonstop where there is one,
         * even if some connection is quicker on paper. `totalMinutes` is built
         * from this, not from the quickest itinerary of any kind. */
        flightMinutes: g.flightMinutes,
        stops: g.minStops,
        transferMinutes: g.transferMinutes,
        totalMinutes: g.totalMinutes,
        /* Plain words, because §50's rule is that anything at home in a schema
         * must not reach an answer. The model is reading this to decide what to
         * SAY, so it is written as what to say. */
        transfer: transferSentence(g.transferBasis, g.transferMinutes),
      })),
    });
  },
});

const searchFlights = tool({
  description:
    "Check whether a route flies on given dates and how the options compare. " +
    "Returns routing, timings and a price rank — never an amount. The flight " +
    "cards show live fares.",
  inputSchema: jsonSchema<{
    origin: string;
    destination: string;
    departureDate: string;
    returnDate?: string;
    adults?: number;
    children?: number;
    cabinClass?: string;
  }>({
    type: "object",
    properties: {
      origin: { type: "string", description: "IATA code." },
      destination: { type: "string", description: "IATA code." },
      departureDate: { type: "string", description: "yyyy-mm-dd" },
      returnDate: { type: "string", description: "yyyy-mm-dd" },
      adults: { type: "number" },
      children: { type: "number" },
      cabinClass: {
        type: "string",
        enum: ["economy", "premium_economy", "business", "first"],
      },
    },
    required: ["origin", "destination", "departureDate"],
    additionalProperties: false,
  }),
  async execute(input) {
    const { searchFlightOffers } = await import("./flightSearch");
    const offers = await searchFlightOffers(input);
    return asUntrustedData("flights", offers);
  },
});

/** Not a data tool. This is how the model hands the UI a structured result set
 * to render, instead of the UI parsing hotel names out of prose. Calling it is
 * what makes cards appear. */
const RESTAURANT_TYPE_VALUES = [
  "Fine dining",
  "High-end casual",
  "Informal local favorite",
  "Beach club",
] as const;

const searchRestaurants = tool({
  description:
    "Search the myOLTRA restaurant collection for one city. Returns candidate " +
    "restaurants with their editorial detail so you can rank them yourself. " +
    "Coverage is by city, not by country or region — if the city is not " +
    "covered, the tool says so and lists nothing. Never returns a price.",
  inputSchema: jsonSchema<{
    city: string;
    cuisine?: string;
    restaurantType?: string;
    limit?: number;
  }>({
    type: "object",
    properties: {
      city: {
        type: "string",
        description:
          "Exact city name, e.g. Paris, Kyoto, Saint-Tropez - Ramatuelle.",
      },
      cuisine: {
        type: "string",
        description:
          "Optional. Matched loosely, so 'French' also finds 'Modern French'.",
      },
      // Enumerated for the same reason the hotel tags are (§44 / the taxonomy
      // enum fix): these are the four exact stored values, and anything else
      // silently matches nothing.
      restaurantType: {
        type: "string",
        enum: [...RESTAURANT_TYPE_VALUES],
        description: "Optional. Use only these exact values.",
      },
      limit: { type: "number" },
    },
    required: ["city"],
    additionalProperties: false,
  }),
  async execute(input) {
    const rows = await findRestaurants({
      city: input.city,
      cuisine: input.cuisine,
      restaurantType: input.restaurantType,
      limit: Math.min(input.limit ?? MAX_RESTAURANT_CANDIDATES, MAX_RESTAURANT_CANDIDATES),
    });

    // An empty result is ambiguous on its own — "no Japanese in Oslo" and "we
    // do not cover Oslo at all" call for different answers, and only the
    // second should send the visitor elsewhere. So say which it is.
    if (!rows.length) {
      const cities = await getRestaurantCities();
      const covered = cities.some(
        (city) => city.toLowerCase() === input.city.trim().toLowerCase()
      );
      return asUntrustedData("myoltra-restaurants", {
        returned: 0,
        cityCovered: covered,
        note: covered
          ? "We cover this city, but nothing matched those filters."
          : "We do not cover this city yet.",
      });
    }

    return asUntrustedData("myoltra-restaurants", {
      returned: rows.length,
      restaurants: rows.map((row) => ({
        id: Number(row.id),
        name: row.restaurant_name,
        type: row.restaurant_type ?? "",
        cuisine: row.cuisine ?? "",
        city: row.city ?? "",
        area: row.local_area ?? "",
        country: row.country ?? "",
        highlights: row.highlights ?? "",
        setting: row.restaurant_setting ?? "",
        style: row.restaurant_style ?? "",
        awards: row.awards ?? [],
      })),
    });
  },
});

const presentResults = tool({
  description:
    "Show results to the visitor. Call this once you have decided what to " +
    "recommend. The framing line appears above the cards in the editorial " +
    "voice; the cards themselves render live prices, so put no figures in it.",
  inputSchema: jsonSchema<{
    framing: string;
    followUp?: string;
    hotelIds?: number[];
    restaurantIds?: number[];
    rationales?: { id: number; reason: string }[];
    flights?: {
      origin: string;
      destination: string;
      departureDate: string;
      returnDate?: string;
      cabin?: string;
      details?: string;
    }[];
    stay?: {
      checkIn?: string;
      checkOut?: string;
      adults?: number;
      kids?: number;
      rooms?: number;
    };
    destination?: {
      city?: string;
      area?: string;
      adminRegion?: string;
      country?: string;
    };
    searchTags?: { settings?: string[]; activities?: string[] };
  }>({
    type: "object",
    properties: {
      framing: {
        type: "string",
        description:
          "One or two editorial sentences. No prices, no lists. With ONE " +
          "property this is the whole answer - name it and answer what they " +
          "asked about it here. With several it introduces the set and " +
          "anything true of the whole trip, and names NONE of the properties - " +
          "their names are printed beneath it; each property's own detail " +
          "goes in its rationale.",
      },
      // Calling this tool ENDS YOUR TURN — say everything here. A separate
      // message afterwards cost a whole extra model round trip (measured at
      // ~2.4s) to emit a single sentence, so there is no longer one.
      followUp: {
        type: "string",
        description:
          "Optional. One short, courteous offer or question to continue the " +
          "conversation, e.g. 'If you want me to check availability and " +
          "prices, please provide the dates for your stay.' or 'Shall I price " +
          "it in business too?'. Never a bare demand such as 'When are you " +
          "going?'. Omit it if nothing useful " +
          "remains to ask. Never put the answer here — that is the framing.",
      },
      hotelIds: {
        type: "array",
        items: { type: "number" },
        description:
          "EVERY hotel that genuinely fits, best first — not just the ones " +
          "you name. These become the cards the visitor browses, so a fitting " +
          "property left out here is one they never see. Give rationales for " +
          "the few you want to highlight; the rest still get a card.",
      },
      // Restaurant ids get their own frame beside the hotels and flights.
      // Only ids that came back from searchRestaurants — a restaurant we do
      // not hold has no card to render, and naming one is exactly what the
      // inventory rule forbids.
      restaurantIds: {
        type: "array",
        items: { type: "number" },
        description: "Directus restaurant ids from searchRestaurants, best first.",
      },
      // THE HIGHLIGHTS, AND THE ONLY PROPERTIES NAMED IN THE PANEL. The
      // concierge opens over a dimmed page, so the cards are not visible while
      // the visitor is reading — whatever you put here is the answer they see,
      // and the rest of hotelIds waits on the cards behind.
      //
      // Five to eight is the useful range, and eight is a hard ceiling — the
      // panel will not read out more than that however many you send. All of
      // them when the set is that small; a sample when it is larger. Put the
      // ones you name FIRST in hotelIds, in this order: they lead the page
      // behind, and the panel tells the visitor so. Never a price or an
      // availability claim; the cards carry those.
      rationales: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: {
              type: "number",
              description: "A hotel or restaurant id from the lists above.",
            },
            reason: {
              type: "string",
              description:
                "One short clause answering what they asked about THIS " +
                "property - why it suits them, or what it has for the spa, " +
                "beach or journey they asked about. Only when showing more " +
                "than one; a lone property is answered in the framing. What it " +
                "HAS, never how it ranks: no 'the largest', 'the most serious', " +
                "'the quietest of the five' unless the data gives that fact for " +
                "every property compared. Do NOT begin " +
                "with the property's name — it is printed immediately " +
                "before your words, so repeating it reads as a stutter. " +
                "Start with the reason itself. No prices.",
            },
          },
          required: ["id", "reason"],
          additionalProperties: false,
        },
      },
      // An ARRAY, one entry per journey, in travel order. A trip is not always
      // a there-and-back on one pair of airports: flying into Nice and home
      // out of Marseille is two one-way entries, neither carrying a
      // returnDate. A plain round trip is a single entry WITH returnDate —
      // do not split that into two, or the visitor loses the cheaper
      // round-trip fares.
      flights: {
        type: "array",
        items: {
          type: "object",
          properties: {
            origin: { type: "string", description: "IATA code." },
            destination: { type: "string", description: "IATA code." },
            departureDate: { type: "string", description: "yyyy-mm-dd" },
            returnDate: {
              type: "string",
              description:
                "yyyy-mm-dd. Only for a round trip on this same pair of " +
                "airports. Leave unset when the visitor flies into one city " +
                "and home from another — those are two separate one-way legs.",
            },
            cabin: { type: "string" },
            details: {
              type: "string",
              description:
                "One or two short sentences the visitor reads under this " +
                "journey: the most relevant options from searchFlights for " +
                "these exact airports and dates - the airlines, direct or with " +
                "stops (and where), and the departure times to choose from on " +
                "the way out and, for a round trip, on the way back. Prefer " +
                "options at civilised hours. Only what searchFlights returned; " +
                "leave it out if you did not search this journey. Never a fare.",
            },
          },
          required: ["origin", "destination", "departureDate"],
          additionalProperties: false,
        },
      },
      // The stay these results are for. WITHOUT THIS THE CARDS SHOW NO PRICE:
      // pricing needs check-in, check-out and occupancy, and nothing else in
      // the answer carries them. Fill it in whenever the visitor has given or
      // implied dates, even loosely — the same values you passed to
      // checkAvailability.
      stay: {
        type: "object",
        properties: {
          checkIn: { type: "string", description: "yyyy-mm-dd" },
          checkOut: { type: "string", description: "yyyy-mm-dd" },
          adults: { type: "number" },
          kids: { type: "number" },
          rooms: { type: "number" },
        },
        additionalProperties: false,
      },
      // Where these results are, so the page can offer "see all hotels in X"
      // and hand the destination on.
      destination: {
        type: "object",
        properties: {
          city: { type: "string" },
          area: { type: "string" },
          adminRegion: { type: "string" },
          country: { type: "string" },
        },
        additionalProperties: false,
      },
      // What the answer is ABOUT, beyond where and when. Pass the same tags
      // you searched on. The pages behind mirror these into their own
      // controls — the Inspire page's Purpose selector has nothing to show
      // without them, so "skiing in the Alps" would come back reading "All".
      searchTags: {
        type: "object",
        properties: {
          settings: {
            type: "array",
            items: { type: "string", enum: [...SETTING_VALUES] },
          },
          activities: {
            type: "array",
            items: { type: "string", enum: [...ACTIVITY_VALUES] },
          },
        },
        additionalProperties: false,
      },
    },
    required: ["framing"],
    additionalProperties: false,
  }),
  // The client renders from this tool call's INPUT, not its output — but the
  // tool still needs an execute. Without one the call has no tool_result, and
  // the Anthropic API rejects any later turn whose history contains an
  // unanswered tool_use ("Tool result is missing for tool call ..."). That made
  // every second turn in a conversation fail. The acknowledgement is
  // deliberately tiny; it exists to close the loop, not to inform the model.
  async execute() {
    return "shown";
  },
});

export const conciergeTools = {
  searchHotels,
  getHotelDetails,
  checkAvailability,
  nearestAirport,
  compareGateways,
  searchFlights,
  searchRestaurants,
  presentResults,
};
