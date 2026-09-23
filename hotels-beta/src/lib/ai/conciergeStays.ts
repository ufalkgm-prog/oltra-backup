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
 * wrote must not turn into "the visitor's choice" the moment it is gone. */

const KEY = "oltra_ai_concierge_stays_v1";
const MAX_KEPT = 50;

export function stayKey(from: string, to: string): string {
  return `${from}|${to}`;
}

export function rememberedConciergeStays(): Set<string> {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return new Set(
      Array.isArray(list) ? list.filter((v): v is string => typeof v === "string") : []
    );
  } catch {
    return new Set();
  }
}

export function rememberConciergeStays(keys: Set<string>) {
  if (!keys.size) return;
  const all = rememberedConciergeStays();
  const before = all.size;
  keys.forEach((key) => all.add(key));
  if (all.size === before) return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify([...all].slice(-MAX_KEPT)));
  } catch {
    // Storage full or blocked: the in-conversation check still applies.
  }
}

export function isConciergeStay(from: string, to: string): boolean {
  return Boolean(from && to) && rememberedConciergeStays().has(stayKey(from, to));
}
