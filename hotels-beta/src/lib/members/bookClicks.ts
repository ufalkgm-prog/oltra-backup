/* BOOK clicks — the booking-intent signal (member_book_clicks).
 *
 * The last click on our side of a booking: Continue to checkout for a hotel we
 * sell, BOOK to the website of one we cannot, Proceed to Trip.com for a flight.
 * Card-level BOOK buttons that only open the Hotels page are navigation, not
 * intent, and are not recorded.
 *
 * No "use client" and no "server-only": the parser is shared with the route. */

export type BookClickKind = "hotel_checkout" | "hotel_external" | "flight_tripcom";

export type BookClick = {
  kind: BookClickKind;
  hotelId?: number;
  flightRoute?: string;
  /** Whether the click came from a concierge answer; omitted when unknown. */
  source?: "concierge" | "classic";
};

const KINDS: BookClickKind[] = ["hotel_checkout", "hotel_external", "flight_tripcom"];

/** Validated, or null. The body comes from the browser. */
export function parseBookClick(input: unknown): BookClick | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const kind = KINDS.find((k) => k === raw.kind);
  if (!kind) return null;
  const hotelId =
    typeof raw.hotelId === "number" && Number.isInteger(raw.hotelId) && raw.hotelId > 0 && raw.hotelId < 1e9
      ? raw.hotelId
      : undefined;
  const flightRoute =
    typeof raw.flightRoute === "string" && /^[A-Z]{3}-[A-Z]{3}( \/ [A-Z]{3}-[A-Z]{3}){0,5}$/.test(raw.flightRoute)
      ? raw.flightRoute
      : undefined;
  const source = raw.source === "concierge" || raw.source === "classic" ? raw.source : undefined;
  return { kind, hotelId, flightRoute, source };
}

/** Fire and forget: never delays the handoff, never throws. */
export function recordBookClick(click: BookClick): void {
  try {
    const body = new Blob([JSON.stringify(click)], { type: "application/json" });
    if (typeof navigator !== "undefined" && navigator.sendBeacon?.("/api/members/book-click", body)) return;
    void fetch("/api/members/book-click", { method: "POST", body, keepalive: true }).catch(() => {});
  } catch {
    // Recording a click must never get in the way of the click.
  }
}
