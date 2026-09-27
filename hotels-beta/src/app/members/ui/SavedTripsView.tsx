"use client";

import { useEffect, useMemo, useState } from "react";
import OltraSelect from "@/components/site/OltraSelect";
import { pickPrimaryAirportForCity } from "@/lib/cityAirports";
import { DEFAULT_TRIPS } from "@/lib/members/defaults";
import {
  deleteSavedTripBrowser,
  deleteSavedTripItemBrowser,
  fetchSavedTripsBrowser,
  seedSavedTripsIfEmptyBrowser,
  updateTripItemPriceBrowser,
} from "@/lib/members/db";
import type { SavedTrip } from "@/lib/members/types";
import { buildTripWarnings } from "@/lib/members/tripWarnings";
import { guessResidencyFromLocale } from "@/lib/countries";
import type { Itinerary } from "@/lib/flights/itinerary";
import type { CabinClass } from "@duffel/api/types";
import { SMALL_CARD_ACTION_WIDTH } from "@/components/hotels/HotelSmallCard";
import { flightPriceBasisShort, hotelPriceBasis } from "@/lib/priceBasis";
import TripItineraryDocument from "./TripItineraryDocument";

type TripItemCard = {
  id: string;
  primary: string;
  secondary: string;
  meta: string;
  travelers: string;
  thumbnail: string;
  hasPhoto?: boolean;
  hasOverlapWarning?: boolean;
  bookUrl?: string;
  roomsSummary?: string;
  /** "EUR 1,234" — the figure saved, or last updated. */
  priceLabel?: string;
  /** What it covers, as on the landing cards: "2 rooms – 3 nights", "2 pax ·
   * return". */
  priceBasis?: string;
  priceCurrency?: string;
  /** Set when the item can be re-priced against its live source. */
  refresh?: RefreshTarget;
};

/* What "Update price and availability" needs to re-run the original query.
 * Hotels go back to Ratehawk, flights to Duffel. */
type RefreshTarget =
  | {
      kind: "hotel";
      hotelDirectusId: string;
      checkIn: string;
      checkOut: string;
      rooms: number;
      adults: number;
      kids: number;
      childrenAges: number[];
    }
  | {
      kind: "flight";
      origin: string;
      destination: string;
      departureDate: string;
      cabinClass: CabinClass;
      adults: number;
      children: number;
    };

type RefreshState = {
  status: "loading" | "done" | "error";
  message?: string;
};

const CABIN_CLASS_BY_LABEL: Record<string, CabinClass> = {
  economy: "economy",
  "premium economy": "premium_economy",
  business: "business",
  first: "first",
};

function summarizeRoomSelection(
  roomSelection: SavedTrip["hotels"][number]["roomSelection"]
): string | undefined {
  if (!roomSelection?.length) return undefined;
  return roomSelection
    .map((room) => `${room.quantity}× ${room.roomName}`)
    .join(", ");
}

/* Price stored on the item at save time. Falls back to summing the saved room
 * picks for hotels saved before price_amount existed. The amount alone: what
 * it covers is its own line under it, as on the landing cards. */
function formatSavedPrice(
  amount: number | null | undefined,
  currency: string | null | undefined
): string | undefined {
  if (!amount || !currency) return undefined;
  return `${currency} ${Math.round(amount).toLocaleString()}`;
}

/* The guests and rooms actually saved with this hotel, e.g. "2 adults, 1 child
 * · 2 rooms". Returns undefined when the hotel was saved without a search, so
 * the card falls back to the trip's own travellers line. */
function describeStayParty(
  item: SavedTrip["hotels"][number]
): string | undefined {
  const parts: string[] = [];

  if (item.adults) {
    parts.push(`${item.adults} adult${item.adults === 1 ? "" : "s"}`);
  }
  if (item.kids) {
    const ages = item.childrenAges?.length
      ? ` (${item.childrenAges.join(", ")})`
      : "";
    parts.push(`${item.kids} child${item.kids === 1 ? "" : "ren"}${ages}`);
  }

  const guests = parts.join(", ");
  const rooms = item.rooms
    ? `${item.rooms} room${item.rooms === 1 ? "" : "s"}`
    : "";

  if (!guests && !rooms) return undefined;
  return [guests, rooms].filter(Boolean).join(" · ");
}

function summarizeRoomPrice(
  roomSelection: SavedTrip["hotels"][number]["roomSelection"]
): string | undefined {
  if (!roomSelection?.length) return undefined;
  const currency = roomSelection[0]?.currency;
  if (!currency) return undefined;
  // Mixed currencies would make a single total meaningless - skip rather than
  // add numbers that are not comparable.
  if (roomSelection.some((room) => room.currency !== currency)) return undefined;
  const total = roomSelection.reduce(
    (sum, room) => sum + room.pricePerStay * room.quantity,
    0
  );
  return formatSavedPrice(total, currency);
}

/* A TRIP WHOSE DATES HAVE PASSED (Ulrik, 2026-09-27). Its last date: the
   latest check-out, flight or table it holds. Measured on the END, not the
   start, so a trip under way keeps its itinerary and notes; once the last
   date is behind us there is nothing left to book, update or plan, and only
   Delete trip stays live. Undated trips are never outdated. */
function tripLastDate(trip: SavedTrip): string {
  const dates = [
    ...trip.hotels.map((hotel) => hotel.checkOut ?? hotel.checkIn ?? ""),
    ...trip.flights.map(
      (flight) =>
        flight.returnDepartAt ??
        flight.arriveAt ??
        flight.departAt ??
        parseDateFromTiming(flight.timing)
    ),
    ...trip.restaurants.map((restaurant) => restaurant.reservedAt ?? ""),
  ]
    .map((value) => (value ?? "").slice(0, 10))
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value));
  return dates.sort().at(-1) ?? "";
}

function localToday(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1] ?? ""} ${y}`;
}

function notesKey(tripId: string) {
  return `oltra_trip_notes_${tripId}`;
}

// Resolved through the curated hotel-city -> airport mapping (its main
// gateway), not by prefix-scanning airport labels: those labels are display
// strings, and the full airport list is ~4k entries where a bare prefix match
// would happily pick a same-named field on the other side of the world.
function cityToIata(city: string): string {
  if (!city) return "";
  return pickPrimaryAirportForCity(city)?.iata ?? "";
}

function parseRoute(route: string): { from: string; to: string } {
  const parts = route.split(/\s*→\s*/);
  return { from: parts[0]?.trim() ?? "", to: parts[1]?.trim() ?? "" };
}

function parseDateFromTiming(timing: string): string {
  const datePart = timing.split("·")[0]?.trim();
  if (!datePart) return "";
  const d = new Date(datePart);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function parseTravelersAdults(travelers: string): number {
  const m = travelers.match(/(\d+)\s+adult/i);
  return m ? parseInt(m[1], 10) : 1;
}

function parseTravelersKids(travelers: string): number {
  const m = travelers.match(/(\d+)\s+(child|kid)/i);
  return m ? parseInt(m[1], 10) : 0;
}

function buildHotelBookUrl(
  hotelName: string,
  checkIn: string | undefined,
  checkOut: string | undefined,
  travelers: string
): string {
  const adults = parseTravelersAdults(travelers);
  const kids = parseTravelersKids(travelers);
  const params = new URLSearchParams();
  if (hotelName) params.set("q", hotelName);
  if (checkIn) params.set("from", checkIn);
  if (checkOut) params.set("to", checkOut);
  if (adults > 0) params.set("adults", String(adults));
  if (kids > 0) params.set("kids", String(kids));
  params.set("submitted", "1");
  return `/hotels?${params.toString()}`;
}

function buildFlightBookUrl(
  route: string,
  timing: string,
  departAt: string | undefined,
  cabin: string,
  travelers: string
): string {
  const adults = parseTravelersAdults(travelers);
  const kids = parseTravelersKids(travelers);
  const { from: fromCity, to: toCity } = parseRoute(route);
  const fromIata = cityToIata(fromCity);
  const departDate = departAt ? departAt.slice(0, 10) : parseDateFromTiming(timing);
  const params = new URLSearchParams();
  if (fromIata) params.set("origin", fromIata);
  if (toCity) params.set("city", toCity);
  if (departDate) params.set("from", departDate);
  if (cabin) params.set("cabin", cabin);
  if (adults > 0) params.set("adults", String(adults));
  if (kids > 0) params.set("kids", String(kids));
  params.set("tripType", "oneway");
  params.set("include_flights", "1");
  // Booking a saved flight can't reuse the stored offer: Duffel offers expire
  // within hours, so by the time a trip is revisited the price has almost
  // certainly moved or the fare is gone. Rather than fail at the booking step,
  // the member lands back on Flights with their original search restored and a
  // notice explaining they need to pick again. See rebookNotice in FlightsView.
  params.set("rebook", "flight");
  return `/flights?${params.toString()}`;
}

export default function SavedTripsView() {
  const [trips, setTrips] = useState<SavedTrip[]>([]);
  const [selectedTripId, setSelectedTripId] = useState("");
  const [currentNotes, setCurrentNotes] = useState("");
  const [warningItemId, setWarningItemId] = useState<string | null>(null);
  const [tripPendingDelete, setTripPendingDelete] = useState<SavedTrip | null>(null);
  const [itemPendingDelete, setItemPendingDelete] = useState<{
    section: "hotels" | "restaurants" | "flights";
    itemId: string;
  } | null>(null);
  const [showItinerary, setShowItinerary] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [refreshStates, setRefreshStates] = useState<
    Record<string, RefreshState>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setIsLoading(true);
        setErrorMessage("");
        await seedSavedTripsIfEmptyBrowser(DEFAULT_TRIPS);
        const next = await fetchSavedTripsBrowser();
        if (!active) return;
        setTrips(next);
        setSelectedTripId((prev) => prev || next[0]?.id || "");
      } catch {
        if (!active) return;
        setErrorMessage("Could not load saved trips.");
      } finally {
        if (active) setIsLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedTripId) {
      setCurrentNotes("");
      return;
    }
    const stored = window.localStorage.getItem(notesKey(selectedTripId)) ?? "";
    setCurrentNotes(stored);
  }, [selectedTripId]);

  const selectedTrip = useMemo(
    () => trips.find((t) => t.id === selectedTripId) ?? trips[0] ?? null,
    [selectedTripId, trips]
  );

  const tripOptions = useMemo(
    () => trips.map((t) => ({ value: t.id, label: t.name })),
    [trips]
  );

  const tripWarnings = useMemo(
    () => (selectedTrip ? buildTripWarnings(selectedTrip) : []),
    [selectedTrip]
  );

  const lastDate = selectedTrip ? tripLastDate(selectedTrip) : "";
  const outdated = Boolean(lastDate) && lastDate < localToday();

  function handleNotesChange(value: string) {
    setCurrentNotes(value);
    if (selectedTripId) {
      window.localStorage.setItem(notesKey(selectedTripId), value);
    }
  }

  async function deleteTrip(tripId: string) {
    try {
      setErrorMessage("");
      await deleteSavedTripBrowser(tripId);
      const next = trips.filter((t) => t.id !== tripId);
      setTrips(next);
      if (tripId === selectedTripId) {
        setSelectedTripId(next[0]?.id ?? "");
      }
    } catch {
      setErrorMessage("Could not delete trip.");
    }
  }

  async function deleteTripItem(
    section: "hotels" | "restaurants" | "flights",
    itemId: string
  ) {
    if (!selectedTrip) return;
    try {
      setErrorMessage("");
      const tableMap = {
        hotels: "member_trip_hotels",
        restaurants: "member_trip_restaurants",
        flights: "member_trip_flights",
      } as const;
      await deleteSavedTripItemBrowser(tableMap[section], itemId);
      setTrips((prev) =>
        prev.map((t) =>
          t.id !== selectedTrip.id
            ? t
            : { ...t, [section]: t[section].filter((item) => item.id !== itemId) }
        )
      );
    } catch {
      setErrorMessage("Could not delete trip item.");
    }
  }

  /* Re-runs the original supplier query for one saved item and stores the
   * answer, replacing the flat number captured at save time. Hotels re-price
   * exactly (same property, same dates); flights cannot - a Duffel offer is
   * short-lived, so this is the cheapest fare on that route/date/cabin now,
   * and the card says so rather than implying the saved fare still stands. */
  async function refreshItemPrice(
    section: "hotels" | "flights",
    item: TripItemCard
  ) {
    const target = item.refresh;
    if (!target) return;

    setRefreshStates((prev) => ({ ...prev, [item.id]: { status: "loading" } }));

    function fail(message: string) {
      setRefreshStates((prev) => ({
        ...prev,
        [item.id]: { status: "error", message },
      }));
    }

    async function store(amount: number, currency: string, message: string) {
      await updateTripItemPriceBrowser({
        table: section === "hotels" ? "member_trip_hotels" : "member_trip_flights",
        itemId: item.id,
        priceAmount: amount,
        priceCurrency: currency,
      });
      setTrips((prev) =>
        prev.map((trip) => ({
          ...trip,
          [section]: trip[section].map((entry) =>
            entry.id === item.id
              ? { ...entry, priceAmount: amount, priceCurrency: currency }
              : entry
          ),
        }))
      );
      setRefreshStates((prev) => ({
        ...prev,
        [item.id]: { status: "done", message },
      }));
    }

    try {
      if (target.kind === "hotel") {
        const res = await fetch("/api/members/hotel-price", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            hotelDirectusId: target.hotelDirectusId,
            checkInDate: target.checkIn,
            checkOutDate: target.checkOut,
            // Re-priced in the currency the saved figure is in, so the two are
            // directly comparable.
            currency: item.priceCurrency || "EUR",
            residency: guessResidencyFromLocale(),
            adults: target.adults,
            kids: target.kids,
            childrenAges: target.childrenAges,
            rooms: target.rooms,
          }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          status?: string;
          priceAmount?: number;
          priceCurrency?: string;
          error?: string;
        };

        if (!data?.ok) return fail(data?.error ?? "Could not check availability.");
        if (data.status === "not_sold")
          return fail("Not sold through our supplier — check the hotel's own site.");
        if (data.status === "unavailable" || !data.priceAmount)
          return fail("No availability for these dates.");

        await store(data.priceAmount, data.priceCurrency ?? "EUR", "Updated just now");
        return;
      }

      const res = await fetch("/api/flights/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: target.origin,
          destination: target.destination,
          departureDate: target.departureDate,
          adults: target.adults,
          children: target.children,
          cabinClass: target.cabinClass,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; itineraries?: Itinerary[] };
      if (!data?.ok) return fail("Could not check fares.");

      const itineraries = data.itineraries ?? [];
      const cheapest = itineraries.reduce<(typeof itineraries)[number] | null>(
        (best, candidate) =>
          !best || candidate.priceEur < best.priceEur ? candidate : best,
        null
      );
      if (!cheapest) return fail("No fares found for this route and date.");

      await store(
        cheapest.priceEur,
        cheapest.currency,
        "Cheapest on this route now"
      );
    } catch {
      fail("Could not reach the supplier.");
    }
  }

  function handleBook(itemId: string, bookUrl?: string, hasOverlapWarning?: boolean) {
    if (hasOverlapWarning) {
      setWarningItemId(itemId);
      return;
    }
    if (bookUrl) {
      window.location.href = bookUrl;
      return;
    }
    alert("Booking flow will be connected in the next phase.");
  }

  function proceedWithWarning() {
    setWarningItemId(null);
    alert("Proceeding despite overlap warning. Booking flow will be connected in the next phase.");
  }

  if (isLoading) {
    return (
      <div className="oltra-glass members-section">
        <div className="members-empty">Loading saved trips...</div>
      </div>
    );
  }

  if (!selectedTrip) {
    return (
      <div className="oltra-glass members-section">
        <div className="members-empty">No saved trips yet.</div>
      </div>
    );
  }

  const travelers = selectedTrip.travelers;

  const hotelItems: TripItemCard[] = selectedTrip.hotels.map((item) => ({
    id: item.id,
    primary: item.name,
    secondary: item.location,
    meta: item.stay,
    thumbnail: item.thumbnail,
    hasPhoto: Boolean(item.thumbnail) && item.thumbnail !== "/images/hero-lp.jpg",
    hasOverlapWarning: item.hasOverlapWarning,
    bookUrl: buildHotelBookUrl(item.name, item.checkIn, item.checkOut, travelers),
    roomsSummary: summarizeRoomSelection(item.roomSelection),
    priceLabel:
      formatSavedPrice(item.priceAmount, item.priceCurrency) ??
      summarizeRoomPrice(item.roomSelection),
    priceBasis: hotelPriceBasis(item.checkIn, item.checkOut, item.rooms),
    priceCurrency: item.priceCurrency ?? item.roomSelection?.[0]?.currency,
    // The item's own saved guests/rooms win; the trip-level travellers label is
    // only a fallback for hotels saved before those were stored.
    travelers: describeStayParty(item) ?? travelers,
    refresh:
      item.hotelDirectusId && item.checkIn && item.checkOut
        ? {
            kind: "hotel",
            hotelDirectusId: item.hotelDirectusId,
            checkIn: item.checkIn,
            checkOut: item.checkOut,
            rooms: item.rooms ?? 1,
            adults: item.adults ?? parseTravelersAdults(travelers),
            kids: item.kids ?? parseTravelersKids(travelers),
            childrenAges: item.childrenAges ?? [],
          }
        : undefined,
  }));

  const flightItems: TripItemCard[] = selectedTrip.flights.map((item) => {
    // Both ends resolve through the curated city -> gateway airport map, the
    // same one buildFlightBookUrl uses. If either fails to resolve there is
    // nothing to search, so the item simply gets no refresh control.
    const { from: fromCity, to: toCity } = parseRoute(item.route);
    const origin = cityToIata(fromCity) || fromCity.trim().toUpperCase();
    const destination = cityToIata(toCity);
    const departureDate = item.departAt
      ? item.departAt.slice(0, 10)
      : parseDateFromTiming(item.timing);

    return {
      id: item.id,
      primary: item.route,
      secondary: item.cabin,
      meta: item.timing,
      travelers,
      thumbnail: item.thumbnail,
      hasOverlapWarning: item.hasOverlapWarning,
      bookUrl: buildFlightBookUrl(item.route, item.timing, item.departAt, item.cabin, travelers),
      priceLabel: formatSavedPrice(item.priceAmount, item.priceCurrency),
      priceBasis: flightPriceBasisShort(
        {
          adults: item.adults ?? parseTravelersAdults(travelers),
          children: item.kids ?? parseTravelersKids(travelers),
        },
        item.returnDepartAt ? "return" : "one-way"
      ),
      priceCurrency: item.priceCurrency ?? undefined,
      refresh:
        origin && destination && departureDate
          ? {
              kind: "flight",
              origin,
              destination,
              departureDate,
              cabinClass:
                CABIN_CLASS_BY_LABEL[item.cabin.trim().toLowerCase()] ?? "economy",
              adults: parseTravelersAdults(travelers),
              children: parseTravelersKids(travelers),
            }
          : undefined,
    };
  });

  const restaurantItems: TripItemCard[] = selectedTrip.restaurants.map((item) => ({
    id: item.id,
    primary: item.name,
    secondary: item.location,
    meta: item.time,
    travelers: "",
    thumbnail: item.thumbnail,
    hasOverlapWarning: item.hasOverlapWarning,
  }));

  return (
    <div className="members-stack">
      <section className="oltra-glass members-section members-trip-summary">
        <div className="members-trip-selector-row">
          <div className="members-trip-inline-field members-trip-inline-field--trip">
            <label className="oltra-label">TRIP</label>
            <OltraSelect
              name="savedTrip"
              value={selectedTrip.id}
              placeholder="Select trip"
              options={tripOptions}
              align="left"
              onValueChange={setSelectedTripId}
            />
          </div>

          {/* Notes, Itinerary and Delete trip: one width, level with the
              trip field (Ulrik, 2026-09-27). The notes moved from a field on
              the page into a popup behind the first. */}
          <div className="members-trip-buttons">
            <button
              type="button"
              className="oltra-btn oltra-btn--block"
              aria-disabled={outdated ? "true" : undefined}
              onClick={() => !outdated && setShowNotes(true)}
            >
              Notes
            </button>

            <button
              type="button"
              className="oltra-btn oltra-btn--block"
              aria-disabled={outdated ? "true" : undefined}
              onClick={() => !outdated && setShowItinerary(true)}
            >
              Itinerary
            </button>

            <button
              type="button"
              className="oltra-btn oltra-btn--destructive oltra-btn--block"
              onClick={() => setTripPendingDelete(selectedTrip)}
            >
              Delete trip
            </button>
          </div>
        </div>

        {/* Always present, directly under the trip row and above the columns
            it refers to. Soft: nothing here blocks saving or booking — except
            a trip whose dates have passed, which is said here and leaves only
            Delete trip live. */}
        <div className="members-editor-notes">
          <div className="oltra-label">CONCIERGE NOTES</div>
          {outdated ? (
            <p className="members-editor-note is-warning">
              This trip is outdated: its dates have passed (the last was{" "}
              {longDate(lastDate)}). It can no longer be booked or updated —
              only deleted.
            </p>
          ) : tripWarnings.length ? (
            tripWarnings.map((warning) => (
              <p className="members-editor-note is-warning" key={warning.id}>
                {warning.message}
              </p>
            ))
          ) : (
            <p className="members-editor-note">
              All good but prices may have changed since your last save
            </p>
          )}
        </div>

        <div className="members-trip-columns">
          {/* Only hotels keep a thumbnail - the flight and restaurant ones
              were a generic placeholder image carrying no information. */}
          <TripSection
            title="HOTELS"
            items={hotelItems}
            showThumb
            outdated={outdated}
            refreshStates={refreshStates}
            onRefreshPrice={(item) => refreshItemPrice("hotels", item)}
            onDelete={(id) => setItemPendingDelete({ section: "hotels", itemId: id })}
            onBook={handleBook}
          />
          <TripSection
            title="FLIGHTS"
            items={flightItems}
            outdated={outdated}
            refreshStates={refreshStates}
            onRefreshPrice={(item) => refreshItemPrice("flights", item)}
            onDelete={(id) => setItemPendingDelete({ section: "flights", itemId: id })}
            onBook={handleBook}
          />
          <TripSection
            title="RESTAURANTS"
            items={restaurantItems}
            outdated={outdated}
            onDelete={(id) =>
              setItemPendingDelete({ section: "restaurants", itemId: id })
            }
            onBook={handleBook}
          />
        </div>
      </section>

      {showItinerary ? (
        <TripItineraryDocument
          trip={selectedTrip}
          notes={currentNotes}
          onClose={() => setShowItinerary(false)}
        />
      ) : null}

      {showNotes ? (
        <div className="members-leave-overlay" onClick={() => setShowNotes(false)}>
          <div
            className="oltra-glass oltra-panel members-leave-modal members-trip-notes-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Trip notes"
          >
            <label className="oltra-label" htmlFor="members-trip-notes">
              TRIP NOTES
            </label>
            <textarea
              id="members-trip-notes"
              className="oltra-input members-textarea members-trip-notes"
              value={currentNotes}
              onChange={(e) => handleNotesChange(e.target.value)}
              placeholder="Add notes for this trip..."
              autoFocus
            />
            <div className="members-leave-modal__actions">
              <button type="button" className="oltra-btn" onClick={() => setShowNotes(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {warningItemId ? (
        <section className="oltra-glass members-warning-panel">
          <div className="members-warning-panel__text">
            Dates overlap with another saved item in this trip. You can still
            proceed with booking.
          </div>
          <div className="members-warning-panel__actions">
            <div className="oltra-btn-pair">
              <button
                type="button"
                className="oltra-btn"
                onClick={() => setWarningItemId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="oltra-btn"
                onClick={proceedWithWarning}
              >
                Proceed anyway
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {tripPendingDelete ? (
        <div className="members-leave-overlay">
          <div className="oltra-glass oltra-panel members-leave-modal">
            <div className="members-leave-modal__text">
              Are you sure you want to delete{" "}
              {tripPendingDelete.name
                ? `"${tripPendingDelete.name}"`
                : "this trip"}
              ?
            </div>
            <div className="members-leave-modal__actions">
              <div className="oltra-btn-pair">
                <button
                  type="button"
                  className="oltra-btn oltra-btn--destructive"
                  onClick={async () => {
                    const tripId = tripPendingDelete.id;
                    setTripPendingDelete(null);
                    await deleteTrip(tripId);
                  }}
                >
                  Yes
                </button>
                <button
                  type="button"
                  className="oltra-btn"
                  onClick={() => setTripPendingDelete(null)}
                >
                  No
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {itemPendingDelete ? (
        <div className="members-leave-overlay">
          <div className="oltra-glass oltra-panel members-leave-modal">
            <div className="members-leave-modal__text">
              Remove this item from the trip?
            </div>
            <div className="members-leave-modal__actions">
              <div className="oltra-btn-pair">
                <button
                  type="button"
                  className="oltra-btn oltra-btn--destructive"
                  onClick={async () => {
                    const { section, itemId } = itemPendingDelete;
                    setItemPendingDelete(null);
                    await deleteTripItem(section, itemId);
                  }}
                >
                  Yes
                </button>
                <button
                  type="button"
                  className="oltra-btn"
                  onClick={() => setItemPendingDelete(null)}
                >
                  No
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {errorMessage ? (
        <section className="oltra-glass members-section">
          <div className="members-note">{errorMessage}</div>
        </section>
      ) : null}
    </div>
  );
}

function TripSection({
  title,
  items,
  showThumb = false,
  outdated = false,
  refreshStates,
  onRefreshPrice,
  onDelete,
  onBook,
}: {
  title: string;
  items: TripItemCard[];
  showThumb?: boolean;
  /** The trip's dates have passed: every button here is passive. */
  outdated?: boolean;
  refreshStates?: Record<string, RefreshState>;
  onRefreshPrice?: (item: TripItemCard) => void;
  onDelete: (itemId: string) => void;
  onBook: (itemId: string, bookUrl?: string, hasOverlapWarning?: boolean) => void;
}) {
  const passive = outdated ? "true" : undefined;
  return (
    <div className="members-trip-col">
      <div className="members-section__header">
        <div className="oltra-label">{title}</div>
      </div>

      <div className="members-section__body">
        {items.length ? (
          items.map((item) => {
            const refreshing = refreshStates?.[item.id]?.status === "loading";
            const canRefresh = Boolean(item.refresh && onRefreshPrice);
            const lines = [item.meta, item.travelers, item.roomsSummary].filter(Boolean);
            return (
              /* THE LANDING PAGE'S CARD (Ulrik, 2026-09-27): HotelSmallCard's
                 frame, image, type and action column at its three-frame
                 density, which is about as wide as a trip column. The price
                 and what it covers over the buttons, stacked in the card's
                 action width. No status label (Saved / Inquiry pending). */
              <article key={item.id} className="oltra-output members-trip-card">
                <div
                  className={`grid gap-2.5 ${
                    showThumb ? "grid-cols-[88px_1fr_auto]" : "grid-cols-[1fr_auto]"
                  }`}
                >
                  {showThumb ? (
                    <div className="overflow-hidden rounded-[var(--oltra-radius-md)] self-start">
                      {item.hasPhoto === false ? (
                        <div className="oltra-photo-placeholder h-[58px] w-full">
                          Photos coming soon
                        </div>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.thumbnail} alt="" className="h-[58px] w-full object-cover" />
                      )}
                    </div>
                  ) : null}

                  <div className="flex min-h-[58px] min-w-0 flex-col">
                    <div className="min-w-0 line-clamp-2 text-base font-light tracking-wide break-words text-[color:var(--oltra-text-primary)]">
                      {item.primary}
                    </div>
                    {item.secondary ? (
                      <div className="mt-0.5 min-w-0 text-xs break-words text-[color:var(--oltra-text-muted)]">
                        {item.secondary}
                      </div>
                    ) : null}
                    {lines.length ? (
                      <div className="mt-2 text-xs leading-relaxed text-[color:var(--oltra-text-muted)]">
                        {lines.map((line) => (
                          <div key={line}>{line}</div>
                        ))}
                      </div>
                    ) : null}
                    {/* The saved price is a flat number from save time, so the
                        only way it moves is if the member asks (Update). */}
                    {refreshing || refreshStates?.[item.id]?.message ? (
                      <div
                        className={
                          refreshStates?.[item.id]?.status === "error"
                            ? "members-item__refresh-note members-item__refresh-note--error"
                            : "members-item__refresh-note"
                        }
                      >
                        {refreshing ? "Checking..." : refreshStates?.[item.id]?.message}
                      </div>
                    ) : null}
                    {/* No warning text on the card: every warning belongs in
                        the Concierge notes, so there is one place to read
                        them. hasOverlapWarning still gates the confirm step
                        on Book. */}
                  </div>

                  <div
                    className={`members-trip-card__actions flex ${SMALL_CARD_ACTION_WIDTH[3]} shrink-0 flex-col justify-center`}
                  >
                    {item.priceLabel ? (
                      <div className="w-full text-center">
                        <div className="text-[13px] font-light leading-tight tracking-wide text-[color:var(--oltra-text-primary)]">
                          {item.priceLabel}
                        </div>
                        {item.priceBasis ? (
                          <div className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-[color:var(--oltra-text-muted)]">
                            {item.priceBasis}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="mt-1.5 flex w-full flex-col gap-1.5">
                      {canRefresh ? (
                        <button
                          type="button"
                          className="oltra-btn oltra-btn--condensed oltra-btn--block oltra-btn--stack-top"
                          disabled={refreshing}
                          aria-disabled={passive}
                          onClick={() => !outdated && onRefreshPrice?.(item)}
                        >
                          Update
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className={`oltra-btn oltra-btn--condensed oltra-btn--block ${
                          canRefresh ? "members-trip-card__middle" : "oltra-btn--stack-top"
                        }`}
                        aria-disabled={passive}
                        onClick={() =>
                          !outdated && onBook(item.id, item.bookUrl, item.hasOverlapWarning)
                        }
                      >
                        Book
                      </button>
                      {/* Not immediate: onDelete opens the "Remove this item"
                          confirm in SavedTripsView. */}
                      <button
                        type="button"
                        className="oltra-btn oltra-btn--destructive oltra-btn--condensed oltra-btn--block oltra-btn--stack-bottom"
                        aria-disabled={passive}
                        onClick={() => !outdated && onDelete(item.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })
        ) : (
          <div className="members-empty">Nothing saved yet.</div>
        )}
      </div>
    </div>
  );
}
