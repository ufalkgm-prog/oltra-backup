/* ONE RULE FOR MATCHING WHAT A PERSON TYPES AGAINST WHAT WE STORE (Ulrik,
 * 2026-09-24).
 *
 * Case, accents, dashes, hyphens, apostrophes and other punctuation carry no
 * meaning in a search, and common abbreviations stand for their full word.
 * Both sides go through the same fold, so "Hotel du Cap-Eden-Roc" finds the
 * stored "Hôtel du Cap Eden-Roc", "St Tropez" finds "Saint-Tropez", and
 * "Zurich" finds "Zürich". The concierge used to miss these on an exact
 * Directus match and spend a round trip retrying.
 *
 * Use foldForSearch for equality and foldedContains for "the name contains
 * this"; never compare raw strings for a search. */

/** Whole words that stand for another, after folding. */
const ABBREVIATIONS: Record<string, string> = {
  st: "saint",
  ste: "sainte",
  sta: "santa",
  sto: "santo",
  mt: "mount",
  mtn: "mountain",
  ft: "fort",
  // Deliberately not single letters (N, S, W…) or "pt": "W Barcelona" is a
  // brand, and "pt" is Port as often as Point.
};

/** Lower case, no accents, "&" as "and", every other non-letter/digit a
 * space, abbreviations spelled out, single spaces, trimmed. */
export function foldForSearch(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((word) => ABBREVIATIONS[word] ?? word)
    .join(" ");
}

/** Whether `haystack` contains `needle` as whole words, both folded. "eden
 * roc" is in "Hôtel du Cap Eden-Roc"; "roc" alone is not in "Rocco Forte". */
export function foldedContains(haystack: string | null | undefined, needle: string | null | undefined): boolean {
  const n = foldForSearch(needle);
  if (!n) return false;
  return ` ${foldForSearch(haystack)} `.includes(` ${n} `);
}

/** Every value in `stored` the input names, folded equal. */
export function storedSpellings(input: string | null | undefined, stored: Iterable<string>): string[] {
  const want = foldForSearch(input);
  if (!want) return [];
  const out = new Set<string>();
  for (const value of stored) if (foldForSearch(value) === want) out.add(value);
  return [...out];
}
