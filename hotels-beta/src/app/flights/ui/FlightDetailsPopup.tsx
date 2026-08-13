"use client";

import { useEffect } from "react";
import type { FlightLeg, Segment, Baggage, SliceConditionFlag } from "@/lib/flights/duffelNormalizer";
import styles from "./FlightsView.module.css";

type Props = {
  flight: FlightLeg;
  onClose: () => void;
};

function formatDur(mins: number): string {
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function formatFlag(flag: SliceConditionFlag): string {
  if (flag === true) return "Yes";
  if (flag === false) return "No";
  return "Not specified by airline";
}

function formatSeatType(type: string | null): string {
  if (!type || type === "n/a") return "";
  return type
    .split("_")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function formatWifi(seg: Segment): string {
  if (seg.amenities?.wifiAvailable === false) return "Not available";
  if (seg.amenities?.wifiAvailable !== true) return "Not specified by airline";
  const cost = seg.amenities?.wifiCost;
  if (cost === "free") return "Available · Free";
  if (cost === "paid") return "Available · Paid";
  if (cost === "free or paid") return "Available · Free or paid";
  return "Available";
}

function formatBaggages(baggages: Baggage[]): string {
  if (!baggages.length) return "Not specified by airline";
  const parts = baggages
    .filter(b => b.quantity > 0)
    .map(b => `${b.quantity} ${b.type === "checked" ? "checked" : "carry-on"}`);
  return parts.length ? parts.join(", ") : "None included";
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
                      <div className={styles.segmentCode}>
                        {seg.originCode}
                        {seg.originTerminal ? ` · Terminal ${seg.originTerminal}` : ""}
                      </div>
                    </div>
                    <div className={styles.segmentAirportRight}>
                      <div className={styles.segmentAirport}>{seg.destinationName}</div>
                      <div className={styles.segmentCode}>
                        {seg.destinationCode}
                        {seg.destinationTerminal ? ` · Terminal ${seg.destinationTerminal}` : ""}
                      </div>
                    </div>
                  </div>

                  <div className={styles.modalSummary}>
                    {seg.cabinClassMarketingName ? (
                      <div className={styles.summaryRow}>
                        <span>Cabin</span>
                        <span>{seg.cabinClassMarketingName}</span>
                      </div>
                    ) : null}
                    {formatSeatType(seg.amenities?.seatType ?? null) ? (
                      <div className={styles.summaryRow}>
                        <span>Seat type</span>
                        <span>{formatSeatType(seg.amenities?.seatType ?? null)}</span>
                      </div>
                    ) : null}
                    <div className={styles.summaryRow}>
                      <span>Wi-Fi</span>
                      <span>{formatWifi(seg)}</span>
                    </div>
                    <div className={styles.summaryRow}>
                      <span>Power</span>
                      <span>{formatFlag(seg.amenities?.powerAvailable ?? null)}</span>
                    </div>
                    <div className={styles.summaryRow}>
                      <span>Bags included</span>
                      <span>{formatBaggages(seg.baggages)}</span>
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
            <div className={styles.summaryRow}>
              <span>Refundable</span>
              <span>{formatFlag(flight.conditions.refundable)}</span>
            </div>
            <div className={styles.summaryRow}>
              <span>Changeable</span>
              <span>{formatFlag(flight.conditions.changeable)}</span>
            </div>
            <div className={styles.summaryRow}>
              <span>Priority boarding</span>
              <span>{formatFlag(flight.conditions.priorityBoarding)}</span>
            </div>
            <div className={styles.summaryRow}>
              <span>Priority check-in</span>
              <span>{formatFlag(flight.conditions.priorityCheckIn)}</span>
            </div>
            <div className={styles.summaryRow}>
              <span>Advance seat selection</span>
              <span>{formatFlag(flight.conditions.advanceSeatSelection)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
