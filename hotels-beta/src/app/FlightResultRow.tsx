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

function totalMinutes(itinerary: Itinerary): number {
  return itinerary.outbound.durationMinutes + (itinerary.inbound?.durationMinutes ?? 0);
}

/* Best price, and fastest — unless the cheapest is already the fastest, in
 * which case there is only one row and it says so.
 *
 * This used to fall back to the SECOND fastest whenever the quickest itinerary
 * was also the cheapest, purely so the two rows were never the same object.
 * That produced the thing it was avoiding: a "Fastest" row showing the same
 * departure, the same arrival and the same duration as the row above it, for
 * more money — a different ticket, but not a faster one, and labelled as
 * though it were.
 *
 * So the test is duration, not identity. If nothing is strictly quicker than
 * the cheapest fare, `fastest` is null and `bestIsAlsoFastest` is set; the one
 * row that remains is headed "Best price and fastest", which is both shorter
 * and truer than printing it twice. */
export function pickHeadlineItineraries(itineraries: Itinerary[]): {
  bestPrice: Itinerary | null;
  fastest: Itinerary | null;
  bestIsAlsoFastest: boolean;
} {
  if (!itineraries.length) {
    return { bestPrice: null, fastest: null, bestIsAlsoFastest: false };
  }

  const byPrice = [...itineraries].sort((a, b) => a.priceEur - b.priceEur);
  const byDuration = [...itineraries].sort((a, b) => totalMinutes(a) - totalMinutes(b));

  const bestPrice = byPrice[0];
  const quickest = byDuration[0];

  if (totalMinutes(bestPrice) <= totalMinutes(quickest)) {
    return { bestPrice, fastest: null, bestIsAlsoFastest: true };
  }

  return { bestPrice, fastest: quickest, bestIsAlsoFastest: false };
}

/* The stop line, and it is always present — every card is four lines whether
 * the flight is direct or not, so a return trip's two cards are the same
 * height and a row of them does not go ragged.
 *
 * Names the airport you actually wait in and how long for, which is what a
 * stop costs you. The leg's own stopSummary ("1 stop · Frankfurt 2h 15m") had
 * the same facts in an order that led with a count. */
export function describeStops(flight: FlightLeg): string {
  const stops = flight.layovers;

  if (!stops.length) {
    // The count wins over an empty list: a leg with stops we hold no layover
    // detail for must not go out claiming to be direct.
    return flight.stops > 0
      ? `${flight.stops} ${flight.stops === 1 ? "stop" : "stops"}`
      : "Direct";
  }

  if (stops.length === 1) {
    return `via ${stops[0].code}, ${formatDurationMinutes(stops[0].durationMinutes)} layover`;
  }

  const codes = stops.map((stop) => stop.code);
  const total = stops.reduce((sum, stop) => sum + stop.durationMinutes, 0);
  return `via ${codes.slice(0, -1).join(", ")} and ${codes[codes.length - 1]}, ${formatDurationMinutes(
    total
  )} total layover`;
}

/* Four lines, in this order:
 *
 *   CPH–ORY  14:42 → 17:49
 *   Duration: 2h 7m
 *   Air France
 *   via FRA, 2h 15m layover
 *
 * The route leads, because on a return trip the two cards were otherwise told
 * apart only by their times — which direction you were reading was left to be
 * inferred from the order they sat in. Duration moved off the end of the times
 * line onto its own: right-aligned there it drifted away from the times it
 * describes, and it was the first thing to wrap as the column narrowed. */
export function FlightDetailCard({ flight }: { flight: FlightLeg }) {
  const airlineLabel = flight.airlines.length
    ? flight.airlines.map((a) => a.name).join(" + ")
    : flight.airline;

  return (
    <div className={styles.flightCardInner}>
      <div className={styles.flightCardTimes}>
        <span className={styles.flightCardRoute}>
          {flight.originCode}–{flight.destinationCode}
        </span>
        <span className={styles.flightCardTime}>{flight.departTime}</span>
        <span className={styles.flightCardArrow}>→</span>
        <span className={styles.flightCardTime}>{flight.arriveTime}</span>
      </div>
      <div className={styles.flightCardDuration}>
        Duration: {formatDurationMinutes(flight.durationMinutes)}
      </div>
      <div className={styles.flightCardMeta}>{airlineLabel}</div>
      <div className={styles.flightCardStops}>{describeStops(flight)}</div>
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
        {/* The pair travels as one unit. As siblings of the label and price
            they were free to be split by the flex wrap: at three frames the
            legend is 291px, so a row labelled "Best price" pushed SAVE onto a
            second line at the far left while BOOK stayed top right, and the
            shorter "Fastest" row beside it kept both on one line. Grouping
            them means they wrap together or not at all, and line up with each
            other and across rows either way. */}
        <div className={styles.flightRowActions}>
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
