/* Every stay a concierge answer has presented, as "checkIn|checkOut", for the
 * browser session (2026-09-23).
 *
 * Those are the dates the results sync may have written into a page's search
 * form; any other dates there were put in by hand. Two readers:
 *  - AiConversation tells the model whether the form's dates are the visitor's
 *    own (use them) or the concierge's (offer them);
 *  - the Hotels page takes the concierge's dates back out of its form on Clear.
 *
 * Kept past Clear on purpose: Clear empties the transcript, and the dates it
 * wrote must not turn into "the visitor's choice" the moment it is gone.
 *
 * The same for the PARTY (2026-09-24): six adults in three rooms from a cleared
 * conversation stayed in the Hotels form, where the next question would have
 * been priced for them. A party an answer wrote is taken back on Clear too;
 * one picked by hand stays. */

const KEY = "oltra_ai_concierge_stays_v1";
const PARTY_KEY = "oltra_ai_concierge_parties_v1";
const MAX_KEPT = 50;

export function stayKey(from: string, to: string): string {
  return `${from}|${to}`;
}

function readList(key: string): Set<string> {
  try {
    const raw = window.sessionStorage.getItem(key);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return new Set(
      Array.isArray(list) ? list.filter((v): v is string => typeof v === "string") : []
    );
  } catch {
    return new Set();
  }
}

function addToList(key: string, keys: Set<string>) {
  if (!keys.size) return;
  const all = readList(key);
  const before = all.size;
  keys.forEach((k) => all.add(k));
  if (all.size === before) return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify([...all].slice(-MAX_KEPT)));
  } catch {
    // Storage full or blocked: the in-conversation check still applies.
  }
}

export function rememberedConciergeStays(): Set<string> {
  return readList(KEY);
}

export function rememberConciergeStays(keys: Set<string>) {
  addToList(KEY, keys);
}

export function isConciergeStay(from: string, to: string): boolean {
  return Boolean(from && to) && rememberedConciergeStays().has(stayKey(from, to));
}

/** The party every page starts on, which there is nothing to take back from. */
export const DEFAULT_PARTY = { adults: 2, kids: 0, kidAges: [] as string[], rooms: 1 };

export function partyKey(adults: number, kids: number, kidAges: (string | number)[], rooms: number): string {
  return `${adults}|${kids}|${kidAges.map(String).join(",")}|${rooms}`;
}

export function rememberConciergeParty(adults: number, kids: number, kidAges: (string | number)[], rooms: number) {
  if (adults === DEFAULT_PARTY.adults && kids === 0 && rooms === DEFAULT_PARTY.rooms) return;
  addToList(PARTY_KEY, new Set([partyKey(adults, kids, kidAges, rooms)]));
}

export function isConciergeParty(adults: number, kids: number, kidAges: (string | number)[], rooms: number): boolean {
  return readList(PARTY_KEY).has(partyKey(adults, kids, kidAges, rooms));
}
