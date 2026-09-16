import "server-only";
import { MACRO_REGION_TERMS, normaliseRegionTerm as normalise } from "./macroRegionTerms";

/* Geography a traveller uses that the database does not store.
 *
 * "The Alps", "the Caribbean", "Scandinavia" are how people describe where they
 * want to go, and none of them is a value in any hotels column: `country` is a
 * country, `admin_region` an administrative unit, `state_province_county_island`
 * a local traveller area (CLAUDE.md §3). A search for area "Alps" therefore
 * matched nothing at all — the concierge burned a round trip discovering that
 * and retried without it, which is the good case. The bad case is a term where
 * it does not think to retry.
 *
 * So each entry below maps one colloquial term onto the real column values it
 * covers. Membership is a UNION of the identity lists (any one is enough),
 * optionally intersected with `requireSetting`.
 *
 * `requireSetting` is what makes the mountain ranges honest. Defining the Alps
 * as its administrative regions alone drags in Munich, Lausanne and Vevey —
 * all genuinely in Bavaria, Vaud, Haute-Savoie, and none of them the Alps.
 * Requiring the "Mountains" tag as well removes exactly those and keeps every
 * real one: measured against the collection, Savoie 12/12, Graubünden 6/6,
 * Valais 5/5 and South Tyrol 4/4 survive, and the three Lausanne/Vevey lakeside
 * hotels plus the two Munich city hotels do not.
 *
 * These lists are built from the values actually present in the collection, so
 * a new hotel in a region already listed is picked up automatically — but a new
 * ADMINISTRATIVE region is not, and adding one means adding it here.
 *
 * SOME VALUES BELOW MATCH NOTHING TODAY, AND THAT IS DELIBERATE. Tyrol, Idaho,
 * Trentino, Malta, Finland, Andorra, Zambia and Belgium among them: the
 * collection has no hotels there yet, and an `_in` value that matches nothing
 * costs nothing. They are the boundary as a person would draw it, so the day a
 * hotel is added in Tyrol it is in the Alps without anyone remembering to do
 * this. Do not "clean" them out — verified as genuine absences, not typos
 * (Austria's admin regions here are Vorarlberg, Vienna and Salzburg; the USA's
 * do not include Idaho).
 *
 * Every entry was checked to resolve to a non-empty set against the live
 * collection, and the Mediterranean was checked not to include Paris. */

export type MacroRegion = {
  /** Canonical name, and what the model passes. */
  name: string;
  /** Everything else a visitor might call it, matched case- and accent-blind. */
  aliases: string[];
  /** Values of the `region` column — the continent field, which already holds
   * "Caribbean" and "South Pacific" as first-class values. */
  regions?: string[];
  countries?: string[];
  adminRegions?: string[];
  /** Values of `state_province_county_island`. */
  areas?: string[];
  /** Narrows the union: a hotel must also carry one of these `setting` tags. */
  requireSetting?: string[];
};

export const MACRO_REGIONS: MacroRegion[] = [
  {
    name: "The Alps",
    aliases: ["alps", "the alps", "alpine", "alpes", "alpen", "european alps"],
    adminRegions: [
      "Savoie",
      "Haute-Savoie",
      "Graubünden",
      "Valais",
      "Vorarlberg",
      "South Tyrol",
      "Bern",
      "Nidwalden",
      "Vaud",
      "Bavaria",
      "Aosta Valley",
      "Uri",
      "Salzburg",
      "Tyrol",
      "Trentino",
    ],
    areas: ["French Alps", "Swiss Alps", "Italian Alps", "Bavarian Alps", "Dolomites"],
    requireSetting: ["Mountains"],
  },
  {
    // Part of the Alps, and also asked for on its own.
    name: "The Dolomites",
    aliases: ["dolomites", "the dolomites", "dolomiti", "dolomiten"],
    areas: ["Dolomites"],
    adminRegions: ["South Tyrol", "Trentino", "Belluno"],
    requireSetting: ["Mountains"],
  },
  {
    name: "The Rocky Mountains",
    aliases: ["rockies", "the rockies", "rocky mountains", "the rocky mountains"],
    adminRegions: [
      "Colorado",
      "Montana",
      "Utah",
      "Wyoming",
      "Idaho",
      "Alberta",
      "British Columbia",
    ],
    requireSetting: ["Mountains"],
  },
  {
    name: "The Caribbean",
    aliases: ["caribbean", "the caribbean", "west indies", "the west indies"],
    // The `region` column carries most of them; Bahamas and Puerto Rico are
    // filed under North America there, so they are named explicitly.
    regions: ["Caribbean"],
    countries: ["Bahamas", "Puerto Rico"],
  },
  {
    name: "The South Pacific",
    aliases: [
      "south pacific",
      "the south pacific",
      "oceania",
      "polynesia",
      "the pacific islands",
    ],
    // New Zealand is split across both region values in the data, so both are
    // listed rather than trusting either alone.
    regions: ["South Pacific", "Oceania"],
  },
  {
    name: "The Mediterranean",
    aliases: ["mediterranean", "the mediterranean", "the med", "med"],
    // Deliberately the Mediterranean-facing administrative regions rather than
    // whole countries: France by country would file Paris and Biarritz under
    // the Mediterranean, and Spain would bring in the Canaries, which are
    // Atlantic. Greece, Cyprus, Malta, Monaco and Montenegro are wholly
    // Mediterranean and stay whole-country.
    countries: ["Greece", "Cyprus", "Malta", "Monaco", "Montenegro"],
    adminRegions: [
      "Provence-Alpes-Côte d'Azur",
      "Corsica",
      "Var",
      "Balearic Islands",
      "Catalonia",
      "Andalusia",
      "Campania",
      "Liguria",
      "Sicily",
      "Sardinia",
      "Tuscany",
      "Lazio",
      "Veneto",
      "Muğla Province",
      "Tanger-Tetouan-Al Hoceima",
    ],
  },
  {
    name: "Scandinavia",
    aliases: [
      "scandinavia",
      "scandinavian",
      "nordics",
      "the nordics",
      "nordic countries",
      "norden",
    ],
    // Strictly Scandinavia is Denmark, Norway and Sweden; Iceland and Finland
    // are Nordic rather than Scandinavian. Both terms reach the same handful of
    // hotels here, and splitting them would mean answering "nothing in
    // Scandinavia" to someone who would happily have taken Iceland.
    countries: ["Denmark", "Norway", "Sweden", "Iceland", "Finland"],
  },
  {
    name: "Iberia",
    aliases: ["iberia", "iberian peninsula", "the iberian peninsula", "spain and portugal"],
    countries: ["Spain", "Portugal", "Andorra"],
  },
  {
    name: "The British Isles",
    aliases: ["british isles", "the british isles", "britain", "uk and ireland"],
    countries: ["United Kingdom", "Ireland"],
  },
  {
    name: "The Indian Ocean",
    aliases: ["indian ocean", "the indian ocean"],
    countries: ["Maldives", "Seychelles", "Mauritius", "Sri Lanka"],
  },
  {
    name: "Southeast Asia",
    aliases: ["southeast asia", "south east asia", "south-east asia", "se asia"],
    countries: [
      "Thailand",
      "Vietnam",
      "Cambodia",
      "Laos",
      "Myanmar",
      "Malaysia",
      "Singapore",
      "Indonesia",
      "Philippines",
    ],
  },
  {
    name: "East Africa",
    aliases: ["east africa", "eastern africa"],
    countries: ["Kenya", "Tanzania", "Rwanda", "Uganda", "Ethiopia"],
  },
  {
    name: "Southern Africa",
    aliases: ["southern africa", "south africa region"],
    countries: [
      "South Africa",
      "Botswana",
      "Namibia",
      "Zimbabwe",
      "Zambia",
      "Mozambique",
    ],
  },
  {
    name: "The Middle East",
    aliases: ["middle east", "the middle east", "the gulf", "gulf states", "arabian gulf"],
    regions: ["Middle East"],
  },
  {
    name: "The Greek Islands",
    aliases: ["greek islands", "the greek islands", "greek isles", "aegean"],
    adminRegions: ["South Aegean", "Crete", "Ionian Islands"],
  },
  {
    name: "Patagonia",
    aliases: ["patagonia", "patagonian"],
    adminRegions: ["Magallanes Region", "Río Negro Province"],
  },
  {
    name: "The Balkans",
    aliases: ["balkans", "the balkans", "western balkans"],
    countries: [
      "Croatia",
      "Montenegro",
      "Serbia",
      "Slovenia",
      "Bosnia and Herzegovina",
      "Albania",
      "North Macedonia",
    ],
  },
  {
    name: "The Benelux",
    aliases: ["benelux", "the benelux", "low countries", "the low countries"],
    countries: ["Netherlands", "Belgium", "Luxembourg"],
  },
];

/** Names the model may pass, for the tool's JSON Schema enum. A closed set is
 * the difference between the model using this and the model guessing (§50). */
export const MACRO_REGION_NAMES = MACRO_REGIONS.map((r) => r.name);

/* The browser recognises these names from macroRegionTerms.ts, which cannot
 * import this server-only module. Fail loudly at load if a region is added,
 * renamed or given a new alias here without the same change there. */
{
  const key = (name: string, aliases: string[]) => [name, ...aliases].join("|");
  const shared = new Set(MACRO_REGION_TERMS.map((t) => key(t.name, t.aliases)));
  const drift = MACRO_REGIONS.filter((r) => !shared.has(key(r.name, r.aliases)));
  if (drift.length || shared.size !== MACRO_REGIONS.length) {
    throw new Error(
      `macroRegionTerms.ts is out of step with macroRegions.ts: ${drift.map((r) => r.name).join(", ") || "count differs"}`
    );
  }
}

const BY_TERM = new Map<string, MacroRegion>();
for (const region of MACRO_REGIONS) {
  BY_TERM.set(normalise(region.name), region);
  for (const alias of region.aliases) BY_TERM.set(normalise(alias), region);
}

/** The macro-region a term names, or null if it is ordinary geography. */
export function resolveMacroRegion(term: string | undefined | null): MacroRegion | null {
  if (!term) return null;
  return BY_TERM.get(normalise(term)) ?? null;
}

/** The Directus filter for a macro-region's identity lists, OR'd together.
 *
 * `requireSetting` is NOT part of this: `setting` is a native Postgres text[]
 * column and Directus cannot filter it at all (§4), so that half runs in JS —
 * see matchesMacroSetting. */
export function macroRegionFilter(region: MacroRegion): Record<string, unknown> {
  const any: Record<string, unknown>[] = [];
  if (region.regions?.length) any.push({ region: { _in: region.regions } });
  if (region.countries?.length) any.push({ country: { _in: region.countries } });
  if (region.adminRegions?.length) any.push({ admin_region: { _in: region.adminRegions } });
  if (region.areas?.length) {
    any.push({ state_province_county_island: { _in: region.areas } });
  }
  return any.length === 1 ? any[0] : { _or: any };
}

/** Whether one hotel row belongs to a macro-region — macroRegionFilter and
 * matchesMacroSetting together, evaluated on a row already in memory. The
 * destination dropdown uses it to offer only regions that hold a hotel, and to
 * narrow its own counts once one is chosen; the pages filter with the Directus
 * half plus matchesMacroSetting, so both must stay this same rule. */
export function hotelInMacroRegion(
  hotel: {
    region?: string | null;
    country?: string | null;
    admin_region?: string | null;
    state?: string | null;
    setting?: string[] | null;
  },
  region: MacroRegion
): boolean {
  const inIdentity =
    Boolean(hotel.region && region.regions?.includes(hotel.region)) ||
    Boolean(hotel.country && region.countries?.includes(hotel.country)) ||
    Boolean(hotel.admin_region && region.adminRegions?.includes(hotel.admin_region)) ||
    Boolean(hotel.state && region.areas?.includes(hotel.state));
  return inIdentity && matchesMacroSetting(hotel, region);
}

/** The JS half of the filter. True when the macro-region asks for no particular
 * setting, or the hotel carries one it asks for. */
export function matchesMacroSetting(
  hotel: { setting?: string[] | null },
  region: MacroRegion
): boolean {
  if (!region.requireSetting?.length) return true;
  const tags = new Set(hotel.setting ?? []);
  return region.requireSetting.some((tag) => tags.has(tag));
}
