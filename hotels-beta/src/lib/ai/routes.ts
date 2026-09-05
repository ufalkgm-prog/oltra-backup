import type { AiPageType } from "./types";

/* The five pages the concierge appears on, and nowhere else.
 *
 * An allow-list on purpose. The members area must never carry it, and a
 * deny-list would admit every route added after this one — including the next
 * members sub-page. Exact paths only: /hotels/[hotelid] is a separate,
 * Agoda-era page that is not part of the intended flow (CLAUDE.md §15), so it
 * is not matched by /hotels.
 *
 * Shared between the root mount and the pages themselves so the button and the
 * modal can never disagree about where the feature exists. */
const PATH_TO_PAGE: Record<string, AiPageType> = {
  "/": "landing",
  "/hotels": "hotels",
  "/flights": "flights",
  "/restaurants": "restaurants",
  "/inspire": "inspire",
};

export function aiPageForPath(pathname: string | null): AiPageType | null {
  if (!pathname) return null;
  // Trailing slash only, so a nested route is never mistaken for its parent.
  const normalised =
    pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return PATH_TO_PAGE[normalised] ?? null;
}

export function isAiConciergePath(pathname: string | null): boolean {
  return aiPageForPath(pathname) !== null;
}

/** True when the flag is on. The value is inlined at build time, so it cannot
 * be read through a variable — this wrapper exists to keep the literal in one
 * place, not to make it dynamic. */
export const AI_CHAT_ENABLED = process.env.NEXT_PUBLIC_AI_CHAT_ENABLED === "1";
