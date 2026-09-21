"use client";

import { aiResultsAreCurrent, useAiSearch } from "@/lib/ai/aiSearchStore";
import { aiPanes } from "@/lib/ai/resultPanes";
import { expandCityAliases } from "@/lib/locationAliases";
import type { SmallCardColumns } from "@/components/hotels/HotelSmallCard";
import AiResultFrames from "./AiResultFrames";
import { LandingPanesProvider } from "./landingPanes";
import styles from "./page.module.css";

/* Which results the landing page is showing.
 *
 * The structured summary is driven by the URL (`?submitted=1` plus a
 * destination) and rendered on the server; the concierge's frames are driven
 * by the store.
 *
 * THEY USED TO BE ALTERNATIVES, and mostly still are — an answer about
 * somewhere else replaces the summary outright, because the old results are
 * then about a place the visitor has moved on from. That is the same rule as
 * before: whichever happened last wins, and neither set is discarded, so both
 * stay one action away.
 *
 * WHAT CHANGED (Ulrik, 2026-09-21): an answer about the place already on
 * screen joins it instead. Asked to add restaurants to a classic hotel search,
 * the concierge picked the city up correctly and then took the hotels and
 * flights down with it, because any answer replaced the whole summary. Now the
 * panes share one row: the concierge's hotels replace the summary's hotels,
 * its flights replace the summary's flights, and a vertical the summary does
 * not have — restaurants, or flights added to a hotel search — arrives as
 * another pane beside them.
 *
 * The URL is left untouched either way, so a classic search run afterwards
 * restores its own results exactly. */
export default function LandingResults({
  summary,
  classicCity,
  classicPanes,
}: {
  summary: React.ReactNode;
  /** The city the structured summary is showing, "" when none is live. */
  classicCity: string;
  /** Which panes that summary would draw, so the row can be counted before
   * anything renders. */
  classicPanes: { hotels: boolean; flights: boolean };
}) {
  const { results, query, presentedAt, searchedAt, conciergeOpen } = useAiSearch();

  /* Nothing while the concierge is open (Ulrik, 2026-09-15). The panel opens
     over the search frame with no blur, and results sitting half-visible
     below it read as part of the conversation. They appear when the panel
     closes and go again when it reopens. */
  if (conciergeOpen) return null;

  const classicLive = classicPanes.hotels || classicPanes.flights;

  // Whichever happened last wins. Without the comparison, running a classic
  // search after an AI answer left the AI frames on screen and the new search
  // looked like it had done nothing — the URL had changed and the page had
  // not. Removing the "AI curated results" token counts as that later act too.
  if (!aiResultsAreCurrent(results, presentedAt, searchedAt)) return <>{summary}</>;

  const ai = aiPanes(results);

  /* The summary's panes survive only when the answer is about the same place.
   *
   * A trip through several places is broader than the one city the summary is
   * showing, so it replaces rather than joins — the same reasoning as a
   * different city. */
  const keepClassic =
    classicLive &&
    !(results.laterStops ?? []).length &&
    sameArea(query.destination.city, classicCity);

  if (!keepClassic) return <AiResultFrames />;

  const showClassicHotels = classicPanes.hotels && !ai.hotels;
  const showClassicFlights = classicPanes.flights && !ai.flights;
  const columns = Math.min(
    3,
    Math.max(
      1,
      [showClassicHotels, showClassicFlights, ai.hotels, ai.flights, ai.restaurants].filter(Boolean)
        .length
    )
  ) as SmallCardColumns;

  /* One grid, both components' panes inside it. Each still renders its own
     wrapper; those wrappers go `display: contents` while composed, so their
     panes become direct children of this grid rather than sitting in two
     grids stacked one above the other. */
  return (
    <LandingPanesProvider
      value={{ columns, aiCovers: { hotels: ai.hotels, flights: ai.flights } }}
    >
      <div
        className={styles.landingPaneGrid}
        style={{ "--panes": columns } as React.CSSProperties}
      >
        {summary}
        <AiResultFrames />
      </div>
    </LandingPanesProvider>
  );
}

/** Same place, with Saint Tropez and Ramatuelle counted as one (Ulrik,
 * 2026-09-21) — they are a single cluster everywhere else on the site (§7),
 * and a restaurant answer for one beside hotels in the other is the same trip.
 * `expandCityAliases` is that cluster's one definition. */
function sameArea(aiCity: string, classicCity: string): boolean {
  const left = aiCity.trim().toLowerCase();
  if (!left || !classicCity.trim()) return false;
  return expandCityAliases([classicCity]).some(
    (value) => value.trim().toLowerCase() === left
  );
}
