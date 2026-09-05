"use client";

import { useAiSearch } from "@/lib/ai/aiSearchStore";
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
 * afterwards restores its own results exactly. */
export default function LandingResults({ summary }: { summary: React.ReactNode }) {
  const { results, presentedAt, searchedAt } = useAiSearch();

  const hasAiResults =
    results.hotelIds.length > 0 ||
    results.flights.length > 0 ||
    results.restaurantIds.length > 0;

  // Whichever happened last wins. Without the comparison, running a classic
  // search after an AI answer left the AI frames on screen and the new search
  // looked like it had done nothing — the URL had changed and the page had
  // not. Neither result set is discarded, so both stay one action away.
  if (hasAiResults && presentedAt >= searchedAt) return <AiResultFrames />;
  return <>{summary}</>;
}
