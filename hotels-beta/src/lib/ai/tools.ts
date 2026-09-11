import "server-only";
import { tool, jsonSchema } from "ai";
import { getHotels, type HotelRecord } from "@/lib/directus";
import { filterHotelsByTags } from "@/lib/hotelFilters";
import { getAirportsForCity, pickPrimaryAirportForCity } from "@/lib/cityAirports";
import { getTransferRoute, hasAirportChange } from "@/lib/transferRoutes";
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
    "not an error and not an empty result: it means ask, then search again.",
  inputSchema: jsonSchema<{
    macroRegion?: string;
    region?: string;
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

const nearestAirport = tool({
  description:
    "Which airports serve a destination we cover, how far they are, and how a " +
    "guest gets from the airport to the door. REQUIRED before answering any " +
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
    const airports = getAirportsForCity(city);
    const primary = pickPrimaryAirportForCity(city);
    /* The arrival airport is not the journey. For a reserve or an island the
     * onward leg often departs from a DIFFERENT airport — Nairobi to Wilson to
     * a Mara airstrip — and that leg is the part a guest has to arrange.
     *
     * `transfer: null` is a real answer and the prompt treats it as one. The
     * model is handed nothing rather than asked not to guess, because a
     * prompt-only rule of this shape gets skipped (§50) and an invented boat
     * is something a guest can act on. */
    const route = getTransferRoute(city);
    return asUntrustedData("airports", {
      city,
      found: airports.length > 0,
      primary: primary
        ? { iata: primary.iata, label: primary.label, distKm: primary.distKm }
        : null,
      airports: airports.map((a) => ({
        iata: a.iata,
        label: a.label,
        distKm: a.distKm,
      })),
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
        description: "One or two editorial sentences. No prices, no lists.",
      },
      // Calling this tool ENDS YOUR TURN — say everything here. A separate
      // message afterwards cost a whole extra model round trip (measured at
      // ~2.4s) to emit a single sentence, so there is no longer one.
      followUp: {
        type: "string",
        description:
          "Optional. One short question to continue the conversation, e.g. " +
          "'Shall I price it in business too?'. Omit it if nothing useful " +
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
                "One short clause saying why it suits them. Do NOT begin " +
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
  searchFlights,
  searchRestaurants,
  presentResults,
};
