/* Drops a property's name off the front of its own rationale.
 *
 * Lives here rather than beside the panel that renders it so it can be
 * exercised on its own — the model writes a different variant every run, and
 * the only honest way to know a case is handled is to run it.
 */

const WORDS = /[^\p{L}\p{N}]+/u;

/* "Shall I price the flights to M\u00e1laga…" (2026-09-14, live).
 *
 * Nothing in our data holds an escape: every airport and city label is stored
 * as real UTF-8, and the framing of the same answer said "Málaga" correctly.
 * The model occasionally writes a non-ASCII character in a tool argument as a
 * JSON escape and then escapes the backslash too, so after parsing the string
 * carries a literal backslash-u sequence. A prompt line cannot reliably stop an
 * encoding slip, so the display decodes it: every string the model authors for
 * the panel passes through here. Only the \uXXXX form — nothing else of that
 * kind has been seen, and decoding more would risk altering real text. */
export function decodeStrayEscapes(text: string): string {
  if (!text.includes("\\u")) return text;
  return text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16))
  );
}

/* "Held for 15–18 October" (2026-09-15, live), weeks after "held for" went on
 * the prompt's never-list: nothing is held, and it reads as a reservation. A
 * prompt rule of this shape gets skipped, so the display rewrites the few
 * phrases that keep coming back. Narrow on purpose — "reserved for adults" is a
 * real fact about a pool, so "reserved" is not touched. */
const HOUSE_WORDING: Array<[RegExp, string]> = [
  [/\b(held|set aside) for\b/gi, "for"],
  [/\btagged for\b/gi, "good for"],
  /* Hotels do not run their own ski schools (Ulrik, 2026-09-15), and "with
     ski school" still came back in five answers of the model test
     (2026-09-30). "With (a/its own) ski school" becomes "near a ski school"
     unless the sentence already places it ("with a ski school nearby"). */
  [/\bwith (?:a |an |its own |their own |its )?(?:in-house )?ski[- ]school(?!s?\s+(?:nearby|close by|close to|in the resort|next door|a short))/gi, "near a ski school"],
];

function keepCase(original: string, replacement: string): string {
  return /^[A-Z]/.test(original)
    ? replacement.charAt(0).toUpperCase() + replacement.slice(1)
    : replacement;
}

/* "Two easy, well-run rooms for lunch" (2026-09-23, live) — restaurants called
 * "rooms", weeks after "rooms"/"kitchens" went on the prompt's never-list.
 * Only where no hotel is being described, so hotel rooms are never touched,
 * and never when the word names a real feature: a dining room, a private room,
 * a chef's table room. Singular "kitchen" is left alone too — "the kitchen
 * leans Japanese" and "an open kitchen" are real. */
const RESTAURANT_NOUNS =
  /(?<!\b(?:dining|private|guest|hotel|tasting|chef's|chef’s|table|tea|back|function|event|wine|cocktail|garden|drawing|living)\s)\b(rooms?|kitchens)\b/gi;

function restaurantNoun(match: string): string {
  const lower = match.toLowerCase();
  return keepCase(match, lower === "room" ? "place" : "places");
}

/** Every model-authored string the panel shows: stray escapes decoded, and the
 * phrases that sound like a booking or read like our data rewritten.
 * `restaurantsOnly` marks text about restaurants and no hotel, where "rooms"
 * can only mean the restaurants themselves. */
/* No long dashes in the panel (Ulrik, 2026-10-07): an em dash reads as
 * machine-written. A plain hyphen keeps the meaning wherever the model put one,
 * which a comma or colon would not always; the prompt asks for commas and
 * colons, and this catches what it skips. A dash opening a line stays a list
 * marker. */
export function plainDashes(text: string): string {
  return text.replace(/[ \t]*—[ \t]*/g, " - ").replace(/(^|\n) - /g, "$1- ");
}

export function panelText(text: string, options: { restaurantsOnly?: boolean } = {}): string {
  let out = plainDashes(decodeStrayEscapes(text));
  for (const [pattern, replacement] of HOUSE_WORDING) {
    out = out.replace(pattern, (match) => keepCase(match, replacement));
  }
  if (options.restaurantsOnly) out = out.replace(RESTAURANT_NOUNS, restaurantNoun);
  return out;
}

/* "I've moved your Ski 2027 stay at La Sivolière to 1–8 March" (2026-09-30,
 * model test, twice from Sonnet). The concierge reads saved trips and
 * favourites and cannot change them; the prompt says so, and a prompt rule of
 * this shape gets skipped. Rewriting the sentence would guess at its grammar,
 * so the panel adds a plain sentence instead — only on a turn that read the
 * member's data (AiConversation), since "I've moved the search to Rome" is
 * true and fine. */
const MEMBER_CHANGE_CLAIM =
  /\b(?:I(?:'|’)ve|I have|I(?:'|’)ll|I will|I)\s+(?:now\s+)?(?:moved|changed|updated|added|saved|removed|rebooked|shifted|swapped)\b/i;

export const MEMBER_DATA_UNCHANGED =
  "Your saved trips and favourites are unchanged: SAVE TO TRIP and ADD TO FAVOURITES on each hotel, restaurant and flight record it.";

export function claimsMemberChange(text: string): boolean {
  return MEMBER_CHANGE_CLAIM.test(text);
}

export function tokens(value: string): string[] {
  return value.toLowerCase().split(WORDS).filter(Boolean);
}

function squash(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

/* Drops the property's name off the front of its own rationale.
 *
 * The model leads with the name whatever the prompt says — it is writing a
 * sentence, and a sentence needs a subject — so the row rendered as
 * "Le Meurice — Le Meurice — grand old Paris". The prompt asks it not to, but
 * a prompt is guidance and this is the display: doing it here means the row
 * cannot read wrong even when the model ignores the instruction.
 *
 * Matched on tokens rather than exact text, because what it writes is a
 * variant, not a copy — "Mandarin Oriental Lutetia" for a record named
 * "Mandarin Oriental, Lutetia, Paris". A leading clause is dropped only when
 * most of its words belong to the name, so a genuine opening clause that
 * happens to share a word survives. */
export function stripLeadingName(reason: string, name: string): string {
  const text = reason.trim();
  const nameTokens = new Set(tokens(name));
  if (!nameTokens.size) return text;

  // The usual shape: "<name variant> — <the actual reason>".
  const split = text.split(/\s+[—–-]\s+/);
  if (split.length > 1) {
    const head = tokens(split[0]);
    const overlap = head.filter((token) => nameTokens.has(token)).length;
    if (head.length && overlap / head.length >= 0.6) {
      const rest = split.slice(1).join(" - ").trim();
      if (rest) return rest;
    }
  }

  /* "<name variant>: <the actual reason>" — the same shape with different
     punctuation, and the dash pass cannot catch it: a rationale reading
     "Le Bristol: the city's most complete grand hotel — courtyard garden,
     two Michelin rooms" splits on the LATER dash, whose head is that whole
     first clause and barely overlaps the name at all.

     Bounded to a colon near the start, so one used mid-sentence is never
     mistaken for this. */
  const colon = text.indexOf(":");
  if (colon > 0 && colon <= 60) {
    const head = tokens(text.slice(0, colon));
    const overlap = head.filter((token) => nameTokens.has(token)).length;
    if (head.length && overlap / head.length >= 0.6) {
      const rest = text.slice(colon + 1).trim();
      if (rest) return rest;
    }
  }

  // No dash and no colon, but it still opens with the name verbatim.
  const squashedName = squash(name);
  if (squashedName && squash(text).startsWith(squashedName)) {
    let seen = "";
    for (let i = 0; i < text.length; i += 1) {
      seen += squash(text[i]);
      if (seen === squashedName) {
        const rest = text.slice(i + 1).replace(/^[\s—–\-:,·|]+/, "").trim();
        if (rest) return rest;
        break;
      }
    }
  }

  return text;
}
