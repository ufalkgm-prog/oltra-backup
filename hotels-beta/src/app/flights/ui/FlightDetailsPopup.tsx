"use client";

import { useEffect } from "react";
import type { FlightLeg } from "@/lib/flights/duffelNormalizer";
import styles from "./FlightsView.module.css";

type Props = {
  flight: FlightLeg;
  onClose: () => void;
};

function formatDur(mins: number): string {
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function tzOffsetHours(iso: string): number | null {
  const m = iso.match(/([+-])(\d{2}):(\d{2})$/);
  if (!m) return null;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) + Number(m[3]) / 60);
}

function formatTzDiff(diff: number): string {
  if (diff === 0) return "Same timezone";
  const sign = diff > 0 ? "+" : "−";
  const abs = Math.abs(diff);
  const hours = Math.floor(abs);
  const mins = Math.round((abs - hours) * 60);
  return `${sign}${hours}h${mins ? ` ${mins}m` : ""}`;
}

function formatDateLong(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(d);
}

export default function FlightDetailsPopup({ flight, onClose }: Props) {
  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  const firstSeg = flight.segments[0];
  const lastSeg = flight.segments[flight.segments.length - 1];
  const originTzOffset = firstSeg ? tzOffsetHours(firstSeg.departIso) : null;
  const destTzOffset = lastSeg ? tzOffsetHours(lastSeg.arriveIso) : null;
  const tzDiff =
    originTzOffset != null && destTzOffset != null ? destTzOffset - originTzOffset : null;

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <div>
            <div className={styles.modalTitle}>
              {firstSeg?.originName ?? flight.originCode} → {lastSeg?.destinationName ?? flight.destinationCode}
            </div>
            <div className={styles.modalSubtitle}>
              {formatDur(flight.durationMinutes)} · {flight.stops === 0 ? "Direct" : `${flight.stops} stop${flight.stops > 1 ? "s" : ""}`}
            </div>
          </div>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className={styles.modalBody}>
          {flight.segments.map((seg, i) => {
            const layover = i < flight.segments.length - 1 ? flight.layovers[i] : null;
            return (
              <div key={`${seg.flightNumber}-${i}`}>
                <div className={styles.segmentBlock}>
                  <div className={styles.segmentAirline}>
                    {seg.airline.name} · {seg.flightNumber}
                    {seg.aircraft ? <span className={styles.segmentAircraft}> · {seg.aircraft}</span> : null}
                  </div>

                  <div className={styles.segmentRow}>
                    <div className={styles.segmentTime}>
                      <div className={styles.segmentHour}>{seg.departTime}</div>
                      <div className={styles.segmentDate}>{formatDateLong(seg.departIso)}</div>
                    </div>
                    <div className={styles.segmentMidLine}>
                      <div className={styles.segmentDuration}>{formatDur(seg.durationMinutes)}</div>
                    </div>
                    <div className={styles.segmentTime}>
                      <div className={styles.segmentHour}>{seg.arriveTime}</div>
                      <div className={styles.segmentDate}>{formatDateLong(seg.arriveIso)}</div>
                    </div>
                  </div>

                  <div className={styles.segmentAirports}>
                    <div>
                      <div className={styles.segmentAirport}>{seg.originName}</div>
                      <div className={styles.segmentCode}>{seg.originCode}</div>
                    </div>
                    <div className={styles.segmentAirportRight}>
                      <div className={styles.segmentAirport}>{seg.destinationName}</div>
                      <div className={styles.segmentCode}>{seg.destinationCode}</div>
                    </div>
                  </div>
                </div>

                {layover ? (
                  <div className={styles.layoverBlock}>
                    Layover · {layover.name} ({layover.code}) · {formatDur(layover.durationMinutes)}
                  </div>
                ) : null}
              </div>
            );
          })}

          <div className={styles.modalSummary}>
            <div className={styles.summaryRow}>
              <span>Total travel time</span>
              <span>{formatDur(flight.durationMinutes)}</span>
            </div>
            {tzDiff != null ? (
              <div className={styles.summaryRow}>
                <span>Time zone change</span>
                <span>{formatTzDiff(tzDiff)}</span>
              </div>
            ) : null}
            <div className={styles.summaryRow}>
              <span>Airlines</span>
              <span>{flight.airlines.map(a => a.name).join(", ")}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
