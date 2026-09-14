/* The colloquial region names the concierge understands — "The Alps", "the
 * Caribbean", "Scandinavia" — and what else a visitor might call each.
 *
 * Split out of macroRegions.ts (2026-09-14) because that module is server-only
 * and the browser needs to recognise these names too: the concierge sometimes
 * passes one as the answer's "destination" (area "The Alps"), and no hotel row
 * holds that value, so written into a page URL or the shared search session it
 * searched a place that does not exist. macroRegions.ts builds its regions from
 * this list and asserts at load that every region has an entry here, so the two
 * cannot drift apart. */

export type MacroRegionTerm = { name: string; aliases: string[] };

export const MACRO_REGION_TERMS: MacroRegionTerm[] = [
  { name: "The Alps", aliases: ["alps", "the alps", "alpine", "alpes", "alpen", "european alps"] },
  { name: "The Dolomites", aliases: ["dolomites", "the dolomites", "dolomiti", "dolomiten"] },
  { name: "The Rocky Mountains", aliases: ["rockies", "the rockies", "rocky mountains", "the rocky mountains"] },
  { name: "The Caribbean", aliases: ["caribbean", "the caribbean", "west indies", "the west indies"] },
  { name: "The South Pacific", aliases: ["south pacific", "the south pacific", "oceania", "polynesia", "the pacific islands"] },
  { name: "The Mediterranean", aliases: ["mediterranean", "the mediterranean", "the med", "med"] },
  { name: "Scandinavia", aliases: ["scandinavia", "scandinavian", "nordics", "the nordics", "nordic countries", "norden"] },
  { name: "Iberia", aliases: ["iberia", "iberian peninsula", "the iberian peninsula", "spain and portugal"] },
  { name: "The British Isles", aliases: ["british isles", "the british isles", "britain", "uk and ireland"] },
  { name: "The Indian Ocean", aliases: ["indian ocean", "the indian ocean"] },
  { name: "Southeast Asia", aliases: ["southeast asia", "south east asia", "south-east asia", "se asia"] },
  { name: "East Africa", aliases: ["east africa", "eastern africa"] },
  { name: "Southern Africa", aliases: ["southern africa", "south africa region"] },
  { name: "The Middle East", aliases: ["middle east", "the middle east", "the gulf", "gulf states", "arabian gulf"] },
  { name: "The Greek Islands", aliases: ["greek islands", "the greek islands", "greek isles", "aegean"] },
  { name: "Patagonia", aliases: ["patagonia", "patagonian"] },
  { name: "The Balkans", aliases: ["balkans", "the balkans", "western balkans"] },
  { name: "The Benelux", aliases: ["benelux", "the benelux", "low countries", "the low countries"] },
];

/** Accent- and case-blind, and tolerant of a leading "the". Directus values
 * keep their accents (Graubünden, Côte d'Azur); what a visitor types often
 * does not. */
export function normaliseRegionTerm(term: string): string {
  return term
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^the /, "");
}

const TERMS = new Set(
  MACRO_REGION_TERMS.flatMap((t) => [t.name, ...t.aliases]).map(normaliseRegionTerm)
);

/** True when a value is one of our colloquial regions rather than a place a
 * hotel row can hold. */
export function isMacroRegionTerm(term: string | undefined | null): boolean {
  return Boolean(term && TERMS.has(normaliseRegionTerm(term)));
}
