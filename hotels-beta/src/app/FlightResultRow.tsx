"use client";

import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import FlightDetailsPopup from "./flights/ui/FlightDetailsPopup";
import FlightCardContent from "./flights/ui/FlightCardContent";
import flightsStyles from "./flights/ui/FlightsView.module.css";
import { SMALL_CARD_ACTION_WIDTH } from "@/components/hotels/HotelSmallCard";
import SaveToTripControl, {
  type SaveToTripResult,
} from "@/components/members/SaveToTripControl";
import TripComBookButton from "@/components/flights/TripComBookButton";
import { addFlightToTripBrowser } from "@/lib/members/db";
import { flightSegmentsForSave } from "@/lib/members/savedFlights";
import type { FlightLeg, Itinerary, PassengerCounts } from "@/lib/flights/itinerary";
import type { TripComPlacement } from "@/lib/flights/partners";
import { useApproxPrice } from "@/lib/flights/useApproxPrice";
import { flightPriceBasisShort } from "@/lib/priceBasis";
import styles from "./page.module.css";

/* One flight result row: label and what the fare covers, the leg cards, and
 * the price over BOOK and SAVE.
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
  /* THE FARE IS SHOWN IN THE MEMBER'S CURRENCY, like everywhere else.
   *
   * These rows used to print whatever the supplier quoted, so with USD
   * selected the same journey read "USD ~1,140" on the Flights page and
   * "~€1,030" here (Ulrik, 2026-09-21). One hook now formats both. */
  const { currency, approx } = useApproxPrice();

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
        // Both ends of the stay, as the Flights page saves them, so the
        // itinerary shows the flight home too.
        destinationArriveAt: lastOut?.arriveIso ?? null,
        returnDepartAt: itinerary.inbound?.segments[0]?.departIso ?? null,
        segments: flightSegmentsForSave(itinerary),
      });
      return {
        message: result.status === "already_exists" ? "Already in that trip." : "Saved to trip.",
      };
    },
    []
  );

  if (!flight) return null;

  /* At three frames the times and duration come down to the hotel name's 13px
     and the info button moves to the end of the second line (Ulrik,
     2026-09-28). */
  const denseCard = columns === 3 ? { compact: true, infoOnStopsRow: true } : {};

  return (
    <div
      className={`${styles.flightDetailRow}${
        columns === 3 ? ` ${styles.flightDetailRowDense}` : ""
      }`}
    >
      {/* Portalled: the row sits inside a glass frame whose backdrop-filter
          makes it the containing block for fixed elements, so the popup's
          full-screen backdrop would otherwise be clipped to the frame. */}
      {detail && typeof document !== "undefined"
        ? createPortal(
            <FlightDetailsPopup flight={detail} onClose={() => setDetail(null)} />,
            document.body
          )
        : null}
      {/* THE FLIGHTS PAGE'S CARD, WITH THE HOTEL CARD'S ACTIONS (Ulrik,
          2026-09-27). The label, then the Flights page's own leg cards; on
          the right, as on a hotel card, the price with what it covers under
          it ("2 pax · return", lib/priceBasis.ts), both centred over BOOK and
          SAVE, stacked in the hotel card's action width so every BOOK and
          SAVE on the landing page lines up with every other. */}
      <div className={styles.flightRowMain}>
        <span
          className={`${styles.flightLineLabel}${
            columns === 3 ? ` ${styles.flightLineLabelDense}` : ""
          }`}
        >
          {label}
        </span>
        <div
          className={`${styles.flightLegsGrid} ${
            columns === 3 ? styles.flightLegsStacked : ""
          }`}
        >
          <div className={flightsStyles.staticCard}>
            <FlightCardContent flight={flight.outbound} onInfo={setDetail} {...denseCard} />
          </div>
          {!isOneWay && flight.inbound ? (
            <div className={flightsStyles.staticCard}>
              <FlightCardContent flight={flight.inbound} onInfo={setDetail} {...denseCard} />
            </div>
          ) : null}
        </div>
      </div>
      <div className={styles.flightRowActions}>
        <div className={styles.flightRowPrice}>
          {currency} {approx(flight.priceEur, flight.currency)}
          {/* "2 pax" over "return", no dot, at every density (Ulrik,
              2026-09-28 — three frames first): one line set the action
              column's width, and the leg cards beside it get what that frees. */}
          {flightPriceBasisShort(handoff.passengers, isOneWay ? "one-way" : "return")
            .split(" · ")
            .map((line, i) => (
            <div key={i} className={styles.flightRowPriceBasis}>
              {line}
            </div>
          ))}
        </div>
        {/* The buttons at the hotel card's width; the price above them takes
            what it needs, which is wider than the buttons since they narrowed
            (2026-09-28). */}
        <div className={`${styles.flightRowButtons} ${SMALL_CARD_ACTION_WIDTH[columns]}`}>
        {/* Opens the "find this flight on Trip.com" dialog; PROCEED there is
            what leaves the site. */}
        <TripComBookButton
          itinerary={flight}
          price={`${currency} ${approx(flight.priceEur, flight.currency)}`}
          handoff={handoff}
          currency={currency}
          className="oltra-btn oltra-btn--condensed oltra-btn--block oltra-btn--stack-top"
        />
        <SaveToTripControl
          onSave={(tripId) => handleSave(tripId, flight)}
          newTripDefaults={tripDefaults}
          /* An offer belongs to one search, so new dates or passengers are a
             new offer id and SAVE comes back. */
          savedKey={`flight|${flight.offerId}`}
          savedHint="Change the dates or passengers to save another."
          label="SAVE"
          compact
          align="right"
          className="oltra-btn oltra-btn--condensed oltra-btn--block oltra-btn--stack-bottom"
        />
        </div>
      </div>
    </div>
  );
}
