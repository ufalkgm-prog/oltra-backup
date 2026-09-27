"use client";

import type { AirlineRef, FlightLeg } from "@/lib/flights/itinerary";
import styles from "./FlightsView.module.css";

/* ONE LEG CARD, ON THE FLIGHTS PAGE AND THE LANDING PAGE ALIKE (Ulrik,
 * 2026-09-27). Moved out of FlightsView unchanged so the landing page's flight
 * rows - the structured search and the concierge's - draw the Flights page's
 * card rather than a lookalike: airline marks, times and duration on one line,
 * airline and stops on the next. */

export type ReturnMatchTier = "alliance" | null;

export function formatDuration(totalMinutes: number): string {
  return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
}

/* Written out rather than Intl's "short" month: en-GB gives "Sept", and the
   format is dd mmm, three letters every month. */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "05 Nov" — the leg's departure date as the airport's local calendar has
 * it. Duffel's departing_at is local time with no offset, so the date part is
 * read as written, never shifted through the viewer's time zone. */
export function legDate(flight: FlightLeg): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(flight.segments[0]?.departIso ?? "");
  if (!match) return "";
  const month = MONTHS[Number(match[2]) - 1];
  return month ? `${match[3]} ${month}` : "";
}

function matchTierLabel(tier: ReturnMatchTier): string {
  if (tier === "alliance") return "Alliance partner";
  return "";
}

function AirlineMarks({ airlines }: { airlines: AirlineRef[] }) {
  // Up to four, in the fixed box (see .airlineMarks); none still keeps the
  // box, so the text beside it never moves.
  const withLogo = airlines.filter(a => a.logoUrl).slice(0, 4);
  return (
    <span
      className={`${styles.airlineMarks}${
        withLogo.length === 1 ? ` ${styles.airlineMarksSingle}` : ""
      }`}
    >
      {withLogo.map(a => (
        // Plain <img>: Duffel's logo host is not in images.remotePatterns, and
        // onError hides a logo that fails rather than showing a broken image.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={a.iataCode || a.name}
          src={a.logoUrl!}
          alt=""
          className={styles.airlineMark}
          onError={e => { e.currentTarget.style.display = "none"; }}
        />
      ))}
    </span>
  );
}

export default function FlightCardContent({
  flight,
  matchTier,
  onInfo,
  compact,
  showAirlineMarks = true,
  onDeselect,
  deselectLabel,
}: {
  flight: FlightLeg;
  matchTier?: ReturnMatchTier;
  onInfo?: (flight: FlightLeg) => void;
  compact?: boolean;
  /** The airline logos. Off in a multi-city grid, where a leg column is about
   * 240px and the logo takes 30 of them from the row that carries the airline
   * NAME - which says the same thing, and was the text being ellipsised
   * (Ulrik, 2026-09-21). */
  showAirlineMarks?: boolean;
  onDeselect?: () => void;
  deselectLabel?: string;
}) {
  const airlineLabel = flight.airlines.length
    ? flight.airlines.map(a => a.name).join(" + ")
    : flight.airline;
  const label = matchTierLabel(matchTier ?? null);
  const timeStyle = compact ? { fontSize: "0.82rem" } : undefined;
  const date = legDate(flight);
  return (
    <>
      {onInfo ? (
        <button
          type="button"
          className={styles.infoButton}
          onClick={e => { e.stopPropagation(); onInfo(flight); }}
          aria-label="Flight details"
        >
          info
        </button>
      ) : null}
      {onDeselect ? (
        <button
          type="button"
          className={styles.deselectButton}
          onClick={e => { e.stopPropagation(); onDeselect(); }}
          aria-label={deselectLabel ?? "Deselect flight"}
          title={deselectLabel ?? "Deselect flight"}
        >
          ×
        </button>
      ) : null}
      <div className={styles.flightCardInner}>
        {showAirlineMarks ? <AirlineMarks airlines={flight.airlines} /> : null}
        <div className={styles.flightCardText}>
          <div className={styles.flightTimesRow}>
            <span className={styles.flightDepart} style={timeStyle}>{flight.departTime}</span>
            <span className={styles.flightArrow}>→</span>
            <span className={styles.flightArrive} style={timeStyle}>{flight.arriveTime}</span>
            <span className={styles.flightMetaDot}>·</span>
            <span className={styles.flightDuration} style={timeStyle}>{formatDuration(flight.durationMinutes)}</span>
          </div>
          <div className={styles.flightStopsRow}>
            {/* The date leads the line (Ulrik, 2026-09-27), and never gives
                way: when the column is tight the airline name is what
                ellipsises. */}
            {date ? (
              <>
                <span className={`${styles.flightMetaText} ${styles.flightDateText}`}>{date}</span>
                <span className={styles.flightMetaDot}>·</span>
              </>
            ) : null}
            <span className={`${styles.flightMetaText} ${styles.flightAirlineText}`}>{airlineLabel}</span>
            {flight.stopSummary ? (
              <>
                <span className={styles.flightMetaDot}>·</span>
                <span className={styles.flightMetaText}>{flight.stopSummary}</span>
              </>
            ) : null}
            {/* The match badge sits HERE, not on the times row above, which is
                where it used to be and where it did not fit: that row is the
                only one the Info pill overlaps, so it gives up 38px to clear
                it, and "19:00 -> 08:10 +1 · 13h 10m · Alliance partner" was
                cut by 12px even at 1440 - above any breakpoint, so moving the
                sidebar could not reach it (Ulrik, 2026-09-21). This row kept
                its full width when that reservation moved off it, and has
                180-260px spare against the badge's 104. It is also where
                section 7B always said the badge belonged, beside the airline
                it qualifies. */}
            {label ? (
              <span className={styles.matchBadgeWeak}>
                {label}
              </span>
            ) : null}
            {/* Cabin and fare brand used to sit here too. The row is
                flex-wrap: nowrap with every child ellipsised, so four facts in
                a 251px multi-city column meant all four clipped - at 1440 as
                badly as at 1024, because the column barely widens. Both are
                available elsewhere: the cabin is a search field the member just
                set, and the fare brand is in the info popup. Dropping them lets
                the airline and the stops fit (Ulrik, 2026-09-21). */}

          </div>
        </div>
      </div>
    </>
  );
}
