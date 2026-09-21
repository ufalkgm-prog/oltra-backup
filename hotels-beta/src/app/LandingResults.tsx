"use client";

import { aiResultsAreCurrent, useAiSearch } from "@/lib/ai/aiSearchStore";
import type { AiResultSet } from "@/lib/ai/types";
import AiResultFrames from "./AiResultFrames";

/* Which results the landing page is showing.
 *
 * The two are alternatives, not layers. The structured summary is driven by
 * the URL (`?submitted=1` plus a destination) and rendered on the server; the
 * concierge's frames are driven by the store. Showing both at once stacks two
 * result regions saying different things, which is what the old AskModeGate
 * was groping at when it hid the summary while "Ask mode" was on.
 *
 * That gate keyed on the mode, so closing the concierge brought the stale
 * structured results straight back over the answer the visitor had just been
 * given. This keys on whether the concierge has produced anything, which is
 * the thing that actually decides what should be on screen — and it means the
 * AI results survive exiting the modal, which is the point of item 8.
 *
 * The URL is deliberately left untouched either way, so a classic search run
 * afterwards restores its own results exactly.
 *
 * THE ONE CASE WHERE THEY ARE NOT ALTERNATIVES is below: an answer that only
 * adds restaurants to the city already on screen. */
export default function LandingResults({
  summary,
  classicCity,
}: {
  summary: React.ReactNode;
  /** The city the structured summary is showing, or "" when no classic search
   * is live on this page. */
  classicCity: string;
}) {
  const { results, query, presentedAt, searchedAt, conciergeOpen } = useAiSearch();

  /* Nothing while the concierge is open (Ulrik, 2026-09-15). The panel opens
     over the search frame with no blur, and results sitting half-visible
     below it read as part of the conversation. They appear when the panel
     closes and go again when it reopens. */
  if (conciergeOpen) return null;

  // Whichever happened last wins. Without the comparison, running a classic
  // search after an AI answer left the AI frames on screen and the new search
  // looked like it had done nothing — the URL had changed and the page had
  // not. Removing the "AI curated results" token counts as that later act too.
  // Neither result set is discarded, so both stay one action away.
  if (!aiResultsAreCurrent(results, presentedAt, searchedAt)) return <>{summary}</>;

  /* "Add somewhere to eat" is an addition, not a new answer. Asked for
     restaurants in the city a classic search was already showing, the frames
     replaced the whole summary and the hotels and flights went with it
     (Ulrik, 2026-09-21). Both are drawn instead: the structured results stay
     where they are and the restaurants arrive under them. */
  if (addsToClassicSearch(results, query.destination.city, classicCity)) {
    return (
      <>
        {summary}
        <AiResultFrames />
      </>
    );
  }

  return <AiResultFrames />;
}

function sameCity(a: string, b: string): boolean {
  const left = a.trim().toLowerCase();
  return Boolean(left) && left === b.trim().toLowerCase();
}

/** Whether this answer only adds to what the page already shows.
 *
 * Every condition is a way the answer could be about something OTHER than the
 * search on screen, and any one of them means it replaces rather than joins:
 *
 *   no classic search  - there is nothing to add to
 *   no restaurants     - not the additive kind of answer at all
 *   its own hotels     - it answered the hotel question too, so it IS the answer
 *   its own flights    - same
 *   later stops        - a trip through several places, which is broader than
 *                        the one city the summary is showing
 *   a different city   - the visitor moved the conversation somewhere else
 *
 * Deliberately strict: showing the old hotels beside restaurants for somewhere
 * else would be worse than replacing them, so anything short of certain falls
 * back to the old behaviour. City matching is a plain normalised compare and
 * does not expand aliases — "Saint Tropez" beside "Ramatuelle" replaces rather
 * than joins, which is the safe direction to be wrong in. */
function addsToClassicSearch(
  results: AiResultSet,
  aiCity: string,
  classicCity: string
): boolean {
  if (!classicCity.trim()) return false;
  if (!results.restaurantIds.length) return false;
  if (results.hotelIds.length) return false;
  if (results.flights.length) return false;
  if ((results.laterStops ?? []).length) return false;
  return sameCity(aiCity, classicCity);
}
