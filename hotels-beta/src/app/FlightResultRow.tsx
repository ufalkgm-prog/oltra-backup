"use client";

import { useCallback } from "react";
import SaveToTripControl, {
  type SaveToTripResult,
} from "@/components/members/SaveToTripControl";
import { addFlightToTripBrowser } from "@/lib/members/db";
import type { FlightLeg, Itinerary } from "@/lib/flights/duffelNormalizer";
import styles from "./page.module.css";

/* One flight result row: label, price, BOOK, SAVE, and the leg cards.
 *
 * Extracted from LandingSummary so the AI concierge renders flights in exactly
 * the same frame as the structured search rather than a lookalike — same
 * markup, same classes, same book and save behaviour. It stays in src/app/
 * beside its two callers because the styles it uses live in the landing page's
 * own module, and the concierge is landing-page-only.
 *
 * Book and save are owned here rather than passed in: both are entirely
 * self-contained, and duplicating them at each call site is how the two copies
 * would drift. */

export function formatDurationMinutes(total: number): string {
  if (!Number.isFinite(total) || total <= 0) return "—";
  const h = Math.floor(total / 60);
  const m = Math.round(total % 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function formatPrice(value: number, currency: string): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  const symbol =
    currency === "EUR" ? "€" : currency === "USD" ? "$" : currency === "GBP" ? "£" : `${currency} `;
  return `${symbol}${Math.round(value).toLocaleString()}`;
}

/** Best price and fastest, chosen the way the landing summary has always
 * chosen them: cheapest by fare, then the shortest total that is not already
 * the cheapest (so the two rows are never the same itinerary). */
export function pickHeadlineItineraries(itineraries: Itinerary[]): {
  bestPrice: Itinerary | null;
  fastest: Itinerary | null;
} {
  if (!itineraries.length) return { bestPrice: null, fastest: null };

  const byPrice = [...itineraries].sort((a, b) => a.priceEur - b.priceEur);
  const byDuration = [...itineraries].sort((a, b) => {
    const ad = a.outbound.durationMinutes + (a.inbound?.durationMinutes ?? 0);
    const bd = b.outbound.durationMinutes + (b.inbound?.durationMinutes ?? 0);
    return ad - bd;
  });

  const bestPrice = byPrice[0] ?? null;
  const fastest =
    byDuration[0]?.id !== bestPrice?.id ? byDuration[0] ?? null : byDuration[1] ?? null;

  return { bestPrice, fastest };
}

export function FlightDetailCard({ flight }: { flight: FlightLeg }) {
  const airlineLabel = flight.airlines.length
    ? flight.airlines.map((a) => a.name).join(" + ")
    : flight.airline;

  return (
    <div className={styles.flightCardInner}>
      <div className={styles.flightCardTimes}>
        <span className={styles.flightCardTime}>{flight.departTime}</span>
        <span className={styles.flightCardArrow}>→</span>
        <span className={styles.flightCardTime}>{flight.arriveTime}</span>
        <span className={styles.flightCardDuration}>
          Duration: {formatDurationMinutes(flight.durationMinutes)}
        </span>
      </div>
      <div className={styles.flightCardMeta}>{airlineLabel}</div>
      {flight.stopSummary ? (
        <div className={styles.flightCardStops}>{flight.stopSummary}</div>
      ) : null}
    </div>
  );
}

export type TripDefaults = {
  destination: string | null;
  periodLabel: string | null;
};

type Props = {
  /** "Best price" / "Fastest". */
  label: string;
  flight: Itinerary | null;
  isOneWay: boolean;
  tripDefaults: TripDefaults;
  /** Result frames sharing the row — 1, 2 or 3. Density only: the same fields,
   * the same book and save actions, at three widths. A return trip's two leg
   * cards stop sitting side by side at 3, because 380px cannot hold them. */
  columns?: 1 | 2 | 3;
};

export default function FlightResultRow({
  label,
  flight,
  isOneWay,
  tripDefaults,
  columns = 1,
}: Props) {
  const handleBook = useCallback(async (offerId: string) => {
    try {
      const res = await fetch("/api/flights/book-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId }),
      });
      const data = await res.json();
      if (data.ok && data.url) {
        window.open(data.url, "_blank", "noopener");
      }
    } catch {
      /* swallow */
    }
  }, []);

  const handleSave = useCallback(
    async (tripId: string, itinerary: Itinerary): Promise<SaveToTripResult> => {
      const out = itinerary.outbound;
      const lastOut = out.segments[out.segments.length - 1];
      const lastIn = itinerary.inbound?.segments[itinerary.inbound.segments.length - 1];
      const result = await addFlightToTripBrowser({
        tripId,
        route: `${out.originCode} → ${lastOut?.destinationName || out.destinationCode}`,
        timing: `${out.segments[0]?.departIso?.slice(0, 10) ?? ""} · ${out.departTime} → ${out.arriveTime}`,
        cabin: "",
        departAt: out.segments[0]?.departIso ?? null,
        arriveAt: (lastIn ?? lastOut)?.arriveIso ?? null,
        externalFlightId: itinerary.offerId,
      });
      return {
        message: result.status === "already_exists" ? "Already in that trip." : "Saved to trip.",
      };
    },
    []
  );

  if (!flight) return null;

  return (
    <div className={styles.flightDetailRow}>
      <div
        className={`${styles.flightRowLegend} ${
          columns === 3 ? styles.flightRowLegendTight : ""
        }`}
      >
        <span className={styles.flightLineLabel}>{label}</span>
        <span className={styles.flightRowPrice}>
          {formatPrice(flight.priceEur, flight.currency)}
        </span>
        <button
          type="button"
          className={`oltra-button-primary oltra-button--xs ${styles.flightBookButton}`}
          onClick={() => handleBook(flight.offerId)}
        >
          BOOK
        </button>
        <SaveToTripControl
          onSave={(tripId) => handleSave(tripId, flight)}
          newTripDefaults={tripDefaults}
          label="SAVE"
          compact
          align="right"
          className={`oltra-button-secondary oltra-button--xs ${styles.flightBookButton}`}
        />
      </div>
      <div
        className={`${styles.flightLegsGrid} ${
          columns === 3 ? styles.flightLegsStacked : ""
        }`}
      >
        <FlightDetailCard flight={flight.outbound} />
        {!isOneWay && flight.inbound ? <FlightDetailCard flight={flight.inbound} /> : null}
      </div>
    </div>
  );
}
