/* A phrasing matches as whole words, allowing a plural (2026-09-30). As a bare
 * substring, "pool" matched "whirlpool" and "Liverpool", and "spa" matched
 * "spacious" and "space" — features claimed for hotels whose descriptions never
 * mentioned them. The phrase must start at a word boundary and end at one, or
 * run on only by "s" or "es" ("pools", "terraces", "spas"). Both sides are
 * folded to lower case without accents before this is called (tools.ts). */

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

function boundary(ch: string | undefined): boolean {
  return ch === undefined || !LETTER_OR_DIGIT.test(ch);
}

export function phraseAt(text: string, phrase: string): boolean {
  if (!phrase) return false;
  let from = 0;
  for (;;) {
    const at = text.indexOf(phrase, from);
    if (at < 0) return false;
    const end = at + phrase.length;
    const startsWord = boundary(text[at - 1]);
    const endsWord =
      boundary(text[end]) ||
      (text[end] === "s" && boundary(text[end + 1])) ||
      (text[end] === "e" && text[end + 1] === "s" && boundary(text[end + 2]));
    if (startsWord && endsWord) return true;
    from = at + 1;
  }
}
