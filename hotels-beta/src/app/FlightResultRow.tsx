"use client";

import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import FlightDetailsPopup from "./flights/ui/FlightDetailsPopup";
import flightsStyles from "./flights/ui/FlightsView.module.css";
import { SMALL_CARD_ACTION_WIDTH } from "@/components/hotels/HotelSmallCard";
import SaveToTripControl, {
  type SaveToTripResult,
} from "@/components/members/SaveToTripControl";
import { addFlightToTripBrowser } from "@/lib/members/db";
import type { FlightLeg, Itinerary, PassengerCounts } from "@/lib/flights/itinerary";
import type { TripComPlacement } from "@/lib/flights/partners";
import { tripComHref, TRIP_COM_LINK_REL } from "@/lib/flights/tripComHandoff";
import { useCurrency } from "@/lib/currency/useCurrency";
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
 * would drift.
 *
 * BOOK LEAVES THE SITE. myOLTRA does not sell flights: the member is handed to
 * Trip.com, who are merchant of record, and we take no payment and do no
 * servicing. The link opens a filtered SEARCH on their site, not the exact
 * flight this row describes - their post-selection URL carries session state
 * that expires and cannot be constructed - so the row's own carrier, times and
 * stops are what the member matches against once they are there. */

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
export function FlightDetailCard({
  flight,
  onInfo,
}: {
  flight: FlightLeg;
  /** Opens the Flights page's details popup for this leg — the same "info"
   * pill and popup, on the landing page's cards too (Ulrik, 2026-09-15). */
  onInfo?: (flight: FlightLeg) => void;
}) {
  const airlineLabel = flight.airlines.length
    ? flight.airlines.map((a) => a.name).join(" + ")
    : flight.airline;

  return (
    <div className={`${styles.flightCardInner} ${onInfo ? styles.flightCardWithInfo : ""}`}>
      {onInfo ? (
        <button
          type="button"
          className={flightsStyles.infoButton}
          onClick={(event) => {
            event.stopPropagation();
            onInfo(flight);
          }}
          aria-label="Flight details"
        >
          info
        </button>
      ) : null}
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
  /** What BOOK needs that the itinerary does not carry: who is travelling, in
   * which cabin, and which button this is for the affiliate report. The
   * itinerary holds the journey; a search does not know its own passengers. */
  handoff: {
    cabin: string;
    passengers: PassengerCounts;
    placement: TripComPlacement;
  };
};

export default function FlightResultRow({
  label,
  flight,
  isOneWay,
  tripDefaults,
  columns = 1,
  handoff,
}: Props) {
  const [detail, setDetail] = useState<FlightLeg | null>(null);
  const { currency } = useCurrency();

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

  const bookHref = tripComHref(flight, { ...handoff, currency });

  return (
    <div className={styles.flightDetailRow}>
      {/* Portalled: the row sits inside a glass frame whose backdrop-filter
          makes it the containing block for fixed elements, so the popup's
          full-screen backdrop would otherwise be clipped to the frame. */}
      {detail && typeof document !== "undefined"
        ? createPortal(
            <FlightDetailsPopup flight={detail} onClose={() => setDetail(null)} />,
            document.body
          )
        : null}
      <div
        className={`${styles.flightRowLegend} ${
          columns === 3 ? styles.flightRowLegendTight : ""
        }`}
      >
        <span className={styles.flightLineLabel}>{label}</span>
        <span className={styles.flightRowPrice}>
          {formatPrice(flight.priceEur, flight.currency)}
          {/* Our fares and Trip.com's come from different sources and will
              differ. The member pays Trip.com, so ours is an indication of
              what this journey costs, never a quoted price — and it has to say
              so beside the figure rather than in a footnote, because the figure
              is what gets read. */}
          <span className={styles.flightRowPriceNote}>indicative</span>
        </span>
        {/* The pair travels as one unit. As siblings of the label and price
            they were free to be split by the flex wrap: at three frames the
            legend is 291px, so a row labelled "Best price" pushed SAVE onto a
            second line at the far left while BOOK stayed top right, and the
            shorter "Fastest" row beside it kept both on one line. Grouping
            them means they wrap together or not at all, and line up with each
            other and across rows either way. */}
        <div className={styles.flightRowActions}>
          {/* Each in the hotel card's action width, so every BOOK and SAVE on
              the page is one width (Ulrik, 2026-09-16). */}
          {bookHref ? (
            <div className={SMALL_CARD_ACTION_WIDTH[columns]}>
              {/* A real anchor, not a scripted window.open: the member can see
                  where BOOK goes before pressing it. See tripComHandoff.ts for
                  why the rel is noopener and not noopener noreferrer. */}
              <a
                href={bookHref}
                target="_blank"
                rel={TRIP_COM_LINK_REL}
                className="oltra-btn oltra-btn--condensed oltra-btn--block"
              >
                BOOK
              </a>
            </div>
          ) : null}
          <div className={SMALL_CARD_ACTION_WIDTH[columns]}>
            <SaveToTripControl
              onSave={(tripId) => handleSave(tripId, flight)}
              newTripDefaults={tripDefaults}
              label="SAVE"
              compact
              align="right"
              className="oltra-btn oltra-btn--condensed oltra-btn--block"
            />
          </div>
        </div>
      </div>
      <div
        className={`${styles.flightLegsGrid} ${
          columns === 3 ? styles.flightLegsStacked : ""
        }`}
      >
        <FlightDetailCard flight={flight.outbound} onInfo={setDetail} />
        {!isOneWay && flight.inbound ? (
          <FlightDetailCard flight={flight.inbound} onInfo={setDetail} />
        ) : null}
      </div>
    </div>
  );
}
