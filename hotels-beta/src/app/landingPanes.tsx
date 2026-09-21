"use client";

import { createContext, useContext } from "react";
import type { SmallCardColumns } from "@/components/hotels/HotelSmallCard";

/* ONE ROW OF PANES, WHOEVER FILLED THEM.
 *
 * The landing page shows hotels, flights and restaurants side by side. Some of
 * those panes come from the structured search and some from the concierge, and
 * until 2026-09-21 that was an either/or: any concierge answer replaced the
 * whole summary, so asking for restaurants in the city already on screen took
 * the hotels and flights down with it (Ulrik).
 *
 * They now share a row. `LandingSummary` and `AiResultFrames` still own their
 * own panes and their own data; this is the small amount they have to agree
 * on — how many panes are sharing the row, and which verticals the concierge
 * has answered so the structured summary stands down on those.
 *
 * Null outside the provider, and both components then behave exactly as they
 * did before: their own grid, their own count. */
export type LandingPanes = {
  /** Panes sharing the row. Drives card density, not the track count — the
   * grid derives that itself. */
  columns: SmallCardColumns;
  /** Verticals the concierge answered. The structured summary skips these:
   * two hotel panes side by side, one from each source, is two answers to one
   * question. */
  aiCovers: { hotels: boolean; flights: boolean };
};

const LandingPanesContext = createContext<LandingPanes | null>(null);

export const LandingPanesProvider = LandingPanesContext.Provider;

export function useLandingPanes(): LandingPanes | null {
  return useContext(LandingPanesContext);
}
