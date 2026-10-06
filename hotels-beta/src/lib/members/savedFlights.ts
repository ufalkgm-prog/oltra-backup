/* How a saved flight row reads its second leg (2026-10-05 test pass).
 *
 * A saved return is ONE row: `route` and `timing` describe the outbound,
 * and the flight home survives only as `return_depart_at`. Nothing showed
 * it, so a member who saved CPH ⇄ LHR saw a one-way to London. These read
 * the return back out of what every saved row already holds. */

import type { Baggage, Itinerary, Segment } from "@/lib/flights/itinerary";
import type { SavedFlightSegment, SavedFlightSegments } from "./types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "CPH → London" read the other way: "London → CPH". */
export function reverseRoute(route: string | null | undefined): string {
  const parts = (route ?? "").split(/\s*→\s*/).map((part) => part.trim());
  if (parts.length !== 2 || !parts[0] || !parts[1]) return "";
  return `${parts[1]} → ${parts[0]}`;
}

/** "08 Nov 2026 · 10:20" from the stored departure, in the airport's own
 * local time: the stamp carries its offset, and the wall-clock part is read
 * as written rather than converted to the viewer's zone. */
export function formatReturnDeparture(iso: string | null | undefined): string {
  const match = (iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}))?/);
  if (!match) return "";
  const [, y, m, d, time] = match;
  const day = `${d} ${MONTHS[Number(m) - 1] ?? ""} ${y}`;
  return time ? `${day} · ${time}` : day;
}

/* WHAT A SAVED FLIGHT REMEMBERS OF ITS FLIGHTS (2026-10-06). The search shows
   each segment's airline, flight number, terminals and baggage, and a saved
   row used to keep none of it, so the itinerary could not say which plane. */

function bagCount(segment: Segment, type: Baggage["type"]): number | null {
  const bags = segment.baggages.filter((bag) => bag.type === type);
  return bags.length ? bags.reduce((sum, bag) => sum + bag.quantity, 0) : null;
}

function toSavedSegment(segment: Segment): SavedFlightSegment {
  return {
    airline: segment.airline.name,
    flightNumber: segment.flightNumber,
    originCode: segment.originCode,
    originName: segment.originName,
    originTerminal: segment.originTerminal,
    destinationCode: segment.destinationCode,
    destinationName: segment.destinationName,
    destinationTerminal: segment.destinationTerminal,
    departIso: segment.departIso,
    arriveIso: segment.arriveIso,
    aircraft: segment.aircraft,
    carryOnBags: bagCount(segment, "carry_on"),
    checkedBags: bagCount(segment, "checked"),
  };
}

/** What addFlightToTripBrowser stores in `segments`. */
export function flightSegmentsForSave(itinerary: Itinerary): SavedFlightSegments {
  return {
    outbound: itinerary.outbound.segments.map(toSavedSegment),
    inbound: (itinerary.inbound?.segments ?? []).map(toSavedSegment),
  };
}

/** The stored jsonb read back, or null when absent or not the expected shape. */
export function parseFlightSegments(value: unknown): SavedFlightSegments | null {
  if (!value || typeof value !== "object") return null;
  const { outbound, inbound } = value as { outbound?: unknown; inbound?: unknown };
  if (!Array.isArray(outbound) || !outbound.length) return null;
  return {
    outbound: outbound as SavedFlightSegment[],
    inbound: Array.isArray(inbound) ? (inbound as SavedFlightSegment[]) : [],
  };
}
