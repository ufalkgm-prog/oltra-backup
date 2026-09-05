"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAiSearch } from "./aiSearchStore";
import { flightsHref, hotelsHref } from "./handoff";

/* Puts the concierge's answer onto the page it belongs to.
 *
 * Two jobs, and they need different rules:
 *
 * 1. ARRIVAL. The visitor exits the concierge and clicks through to Hotels or
 *    Flights. The store knows the answer, but these pages are URL-driven
 *    (CLAUDE.md §8) and the header's nav links carry no params — so they would
 *    show an empty search. Here the answer is written in, but only if the URL
 *    is bare: a real search, a bookmark or the concierge's own handoff link
 *    must never be overwritten by something the visitor did earlier.
 *
 * 2. A NEW ANSWER, produced while this page is already open. That is a
 *    deliberate act happening now, so it wins outright — including over an
 *    existing search, which it is explicitly replacing. This is what makes the
 *    page behind the modal track the conversation rather than only catch up
 *    with it on the next visit.
 *
 * `presentedAt` is what separates the two: it advances only when the model
 * presents something new, so comparing it against what has already been
 * applied distinguishes "an answer from earlier" from "an answer just now".
 *
 * router.replace throughout, so Back goes where the visitor came from rather
 * than through states they never chose to look at.
 *
 * window.location.search rather than useSearchParams: this reads once, inside
 * an effect, and useSearchParams would drag a Suspense boundary requirement
 * into two pages for nothing.
 *
 * NOT mounted on the Restaurants page, deliberately. That page already
 * resolves its city from the shared cross-page session when it arrives without
 * a ?city= param, and the concierge store mirrors its destination into exactly
 * that session — so restaurants are already handled, by a mechanism that
 * predates this one. Mounting both would give two effects racing to
 * router.replace the same param. */

type Page = "hotels" | "flights";

/** Params that mean "this page already has a search". Anything else — a
 * tracking param, an open panel's state — should not count as one. */
const MEANINGFUL: Record<Page, string[]> = {
  hotels: [
    "q",
    "ids",
    "city",
    "state",
    "admin_region",
    "country",
    "region",
    "activities",
    "settings",
    "awards",
    "search_submitted",
  ],
  flights: ["origin", "from", "to", "tripType", "leg1", "cabin"],
};

export default function AiResultsSync({ page }: { page: Page }) {
  const { ready, results, query, presentedAt } = useAiSearch();
  const router = useRouter();

  /** The newest presentation this page has already reflected. Anything above
   * it is new and gets applied; anything at or below it has been dealt with,
   * or predates our arrival on a page that already had a search. */
  const appliedAt = useRef<number | null>(null);

  useEffect(() => {
    // The store hydrates from sessionStorage in an effect, so before `ready`
    // an empty result set means "not loaded yet", not "nothing to show".
    if (!ready) return;

    if (appliedAt.current === null) {
      const current = new URLSearchParams(window.location.search);
      const hasSearch = MEANINGFUL[page].some((key) => current.get(key));
      // Arriving on a page that already has a search: treat whatever the
      // concierge said earlier as already dealt with, and wait for something
      // genuinely new.
      appliedAt.current = hasSearch ? presentedAt : 0;
    }

    if (presentedAt <= appliedAt.current) return;

    let href: string | null = null;
    if (page === "hotels" && results.hotelIds.length) {
      href = hotelsHref(query, results);
    } else if (page === "flights" && results.flights.length) {
      href = flightsHref(query, results);
    }

    // Nothing for this page in that answer — a hotels-only reply says nothing
    // about flights. Mark it seen so it is not reconsidered on every render.
    appliedAt.current = presentedAt;
    if (!href) return;

    router.replace(href);
  }, [ready, page, results, query, presentedAt, router]);

  return null;
}
