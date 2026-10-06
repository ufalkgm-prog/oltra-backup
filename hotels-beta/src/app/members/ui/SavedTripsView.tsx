"use client";

import { useEffect, useMemo, useState } from "react";
import OltraSelect from "@/components/site/OltraSelect";
import { pickPrimaryAirportForCity } from "@/lib/cityAirports";
import {
  deleteSavedTripBrowser,
  deleteSavedTripItemBrowser,
  fetchSavedTripsBrowser,
  formatPeriodLabel,
  updateTripItemPriceBrowser,
} from "@/lib/members/db";
import { formatReturnDeparture, reverseRoute } from "@/lib/members/savedFlights";
import type { SavedTrip } from "@/lib/members/types";
import { buildTripWarnings } from "@/lib/members/tripWarnings";
import { guessResidencyFromLocale } from "@/lib/countries";
import type { Itinerary } from "@/lib/flights/itinerary";
import type { CabinClass } from "@duffel/api/types";
import { flightPriceBasisShort, hotelPriceBasis } from "@/lib/priceBasis";
import HotelSmallCard, {
  SMALL_CARD_ACTION_WIDTH,
  type SmallCardAvailability,
} from "@/components/hotels/HotelSmallCard";
import RestaurantSmallCard from "@/components/restaurants/RestaurantSmallCard";
import type { HotelRecord } from "@/lib/directus";
import type { RestaurantRecord } from "@/app/restaurants/types";
import {
  bookingOrWebsiteHref,
  type BookingSearchParams,
} from "@/lib/hotels/buildBookingLink";
import { useFavouriteIds } from "@/lib/members/favourites";
import { useApproxPrice } from "@/lib/flights/useApproxPrice";
import landing from "@/app/page.module.css";
import flightsStyles from "@/app/flights/ui/FlightsView.module.css";
import TripItineraryDocument from "./TripItineraryDocument";
import type { ItineraryDetails } from "@/lib/members/buildItinerary";

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
  /** A hotel saved without dates: BOOK is passive (Ulrik, 2026-09-28). */
  missingDates?: boolean;
  roomsSummary?: string;
  /** The hotel's or restaurant's Directus id, for the full record its landing
   * card draws (photo, highlights, who sells it). */
  recordId?: string;
  /** The stay behind a hotel's booking link. */
  bookingParams?: BookingSearchParams;
  /** The figure saved, or last updated, in priceCurrency. */
  priceAmount?: number;
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
      /** The room saved, repriced first (hotel-price route). */
      roomName?: string;
    }
  | {
      kind: "flight";
      origin: string;
      destination: string;
      departureDate: string;
      /** The flight home of a saved return; absent for a one-way. */
      returnDate?: string;
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

/* The saved room picks summed, for hotels saved before price_amount existed. */
function roomSelectionTotal(
  roomSelection: SavedTrip["hotels"][number]["roomSelection"]
): number | undefined {
  if (!roomSelection?.length) return undefined;
  const currency = roomSelection[0]?.currency;
  if (!currency) return undefined;
  // Mixed currencies would make a single total meaningless - skip rather than
  // add numbers that are not comparable.
  if (roomSelection.some((room) => room.currency !== currency)) return undefined;
  return roomSelection.reduce(
    (sum, room) => sum + room.pricePerStay * room.quantity,
    0
  );
}

const OUTDATED_REASON = "This trip's dates have passed";

/* What the landing card shows where the price goes: the saved figure, or the
   state of an Update in progress. Without dates, "Select dates" and a passive
   BOOK, exactly as on the landing page. */
function hotelAvailability(
  item: TripItemCard,
  refresh: RefreshState | undefined
): SmallCardAvailability | undefined {
  if (item.missingDates) return { status: "idle" };
  if (refresh?.status === "loading") return { status: "loading" };
  if (refresh?.status === "error") {
    return { status: "note", text: refresh.message ?? "Could not check availability." };
  }
  if (item.priceAmount && item.priceCurrency) {
    return {
      status: "available",
      currency: item.priceCurrency,
      pricePerStay: item.priceAmount,
    };
  }
  return undefined;
}

/* A stand-in record while the real one loads, or for a hotel no longer in
   Directus: the name, location and photo saved with the item. */
function fallbackHotel(item: TripItemCard): HotelRecord {
  return {
    id: item.recordId ?? item.id,
    hotel_name: item.primary,
    published: true,
    city: item.secondary,
    directus_images: item.hasPhoto ? [{ url: item.thumbnail, credit: null }] : undefined,
  };
}

/* The by-ids routes' lookup: a real (numeric) id, else the name. */
function lookupKey(id: string | null | undefined, name: string): string {
  const trimmed = id?.trim();
  return trimmed && /^\d+$/.test(trimmed) ? trimmed : nameKey(name);
}

/* Case kept: Directus matches the name exactly, so the key carries the name
   as it is sent. */
function nameKey(name: string | null | undefined): string {
  return `name:${(name ?? "").trim()}`;
}

function lookupBody(key: string): { ids: string[]; names: string[] } {
  const parts = key.split("\n").filter(Boolean);
  return {
    ids: parts.filter((part) => !part.startsWith("name:")),
    names: parts
      .filter((part) => part.startsWith("name:") && part.length > 5)
      .map((part) => part.slice(5)),
  };
}

function fallbackRestaurant(item: TripItemCard): RestaurantRecord {
  return {
    id: Number(item.recordId) || 0,
    restaurant_name: item.primary,
    city: item.secondary,
    lat: null,
    lng: null,
  };
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

/* BOOK ON A SAVED FLIGHT RE-SEARCHES THAT FLIGHT (2026-10-05 test pass). It
   was rebuilt from the trip's travellers label and the route text, always as a
   one-way: a CPH ⇄ LHR return for two came back one-way, for one, with no
   departure airport ("CPH" went through a city-to-airport lookup and is
   already a code). Now from what the flight row itself holds. */
function buildFlightBookUrl(flight: {
  route: string;
  timing: string;
  departAt?: string;
  returnDepartAt?: string | null;
  cabin: string;
  adults: number;
  kids: number;
}): string {
  const { from: fromPlace, to: toPlace } = parseRoute(flight.route);
  const origin = /^[A-Za-z]{3}$/.test(fromPlace) ? fromPlace.toUpperCase() : cityToIata(fromPlace);
  const departDate = flight.departAt ? flight.departAt.slice(0, 10) : parseDateFromTiming(flight.timing);
  const returnDate = (flight.returnDepartAt ?? "").slice(0, 10);
  const params = new URLSearchParams();
  if (origin) params.set("origin", origin);
  // A code or a city - the Flights page resolves either.
  if (toPlace) params.set("destination", toPlace);
  if (departDate) params.set("from", departDate);
  if (returnDate) params.set("to", returnDate);
  params.set("tripType", returnDate ? "return" : "oneway");
  if (flight.cabin) params.set("cabin", flight.cabin);
  if (flight.adults > 0) params.set("adults", String(flight.adults));
  if (flight.kids > 0) params.set("kids", String(flight.kids));
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
  /* The notes field shows while it holds text or has the cursor (Ulrik,
     2026-10-06); Add notes only while neither. */
  const [editingNotes, setEditingNotes] = useState(false);
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
        const next = await fetchSavedTripsBrowser();
        if (!active) return;
        setTrips(next);
        /* Opens on the trip something was last saved to (Ulrik, 2026-10-06),
           which replaced reopening the trip last looked at. */
        const lastSaved = next.reduce<SavedTrip | null>(
          (best, t) => (!best || t.lastSavedAt > best.lastSavedAt ? t : best),
          null
        );
        setSelectedTripId((prev) => prev || lastSaved?.id || "");
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

  /* The full records behind the saved items, so each draws the landing
     page's own card (Ulrik, 2026-10-04). Merged rather than replaced, so
     switching between trips does not blank cards already loaded. */
  const favourites = useFavouriteIds();
  const [hotelRecords, setHotelRecords] = useState<Record<string, HotelRecord>>({});
  const [restaurantRecords, setRestaurantRecords] = useState<
    Record<string, RestaurantRecord>
  >({});
  /* Ids, and the names of items with no real id: the seeded demo trips
     carry placeholder ids, so they are found by name (keyed "name:…"). Joined
     with a newline, which no id or name contains. */
  const hotelIdsKey = (selectedTrip?.hotels ?? [])
    .map((hotel) => lookupKey(hotel.hotelDirectusId, hotel.name))
    .join("\n");
  const restaurantIdsKey = (selectedTrip?.restaurants ?? [])
    .map((restaurant) => lookupKey(restaurant.restaurantDirectusId, restaurant.name))
    .join("\n");

  useEffect(() => {
    if (!hotelIdsKey) return;
    let active = true;
    fetch("/api/hotels/by-ids", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lookupBody(hotelIdsKey)),
    })
      .then((res) => res.json() as Promise<{ ok?: boolean; hotels?: HotelRecord[] }>)
      .then((data) => {
        if (!active || !data?.ok) return;
        setHotelRecords((prev) => ({
          ...prev,
          ...Object.fromEntries(
            (data.hotels ?? []).flatMap((h) => [
              [String(h.id), h],
              [nameKey(h.hotel_name), h],
            ])
          ),
        }));
      })
      .catch(() => {
        // The cards still render from what was saved with them.
      });
    return () => {
      active = false;
    };
  }, [hotelIdsKey]);

  useEffect(() => {
    if (!restaurantIdsKey) return;
    let active = true;
    fetch("/api/restaurants/by-ids", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lookupBody(restaurantIdsKey)),
    })
      .then(
        (res) => res.json() as Promise<{ ok?: boolean; restaurants?: RestaurantRecord[] }>
      )
      .then((data) => {
        if (!active || !data?.ok) return;
        setRestaurantRecords((prev) => ({
          ...prev,
          ...Object.fromEntries(
            (data.restaurants ?? []).flatMap((r) => [
              [String(r.id), r],
              [nameKey(r.restaurant_name), r],
            ])
          ),
        }));
      })
      .catch(() => {
        // The cards still render from what was saved with them.
      });
    return () => {
      active = false;
    };
  }, [restaurantIdsKey]);

  /* What the itinerary prints beyond the saved rows (2026-10-06): each
     hotel's address, phone, check-in times and destination (for the
     transfer), each restaurant's type and contacts, from the records above. */
  const itineraryDetails = useMemo<ItineraryDetails>(() => {
    const hotels: ItineraryDetails["hotels"] = {};
    for (const item of selectedTrip?.hotels ?? []) {
      const record = hotelRecords[lookupKey(item.hotelDirectusId, item.name)];
      if (!record) continue;
      hotels[item.id] = {
        city: record.city,
        address: record.ratehawk_address,
        phone: record.ratehawk_phone,
        checkInTime: record.ratehawk_check_in_time,
        checkOutTime: record.ratehawk_check_out_time,
      };
    }
    const restaurants: ItineraryDetails["restaurants"] = {};
    for (const item of selectedTrip?.restaurants ?? []) {
      const record = restaurantRecords[lookupKey(item.restaurantDirectusId, item.name)];
      if (!record) continue;
      restaurants[item.id] = {
        type: record.restaurant_type,
        address: record.address,
        phone: record.phone,
        website: record.www,
      };
    }
    return { hotels, restaurants };
  }, [selectedTrip, hotelRecords, restaurantRecords]);

  const tripWarnings = useMemo(
    () => (selectedTrip ? buildTripWarnings(selectedTrip) : []),
    [selectedTrip]
  );

  const lastDate = selectedTrip ? tripLastDate(selectedTrip) : "";
  const outdated = Boolean(lastDate) && lastDate < localToday();
  const notesVisible = editingNotes || Boolean(currentNotes.trim());

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
            roomName: target.roomName,
          }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          status?: string;
          priceAmount?: number;
          priceCurrency?: string;
          roomMatched?: boolean;
          roomName?: string | null;
          error?: string;
        };

        if (!data?.ok) return fail(data?.error ?? "Could not check availability.");
        if (data.status === "not_sold")
          return fail("Not sold through our supplier — check the hotel's own site.");
        if (data.status === "unavailable" || !data.priceAmount)
          return fail("No availability for these dates.");

        await store(
          data.priceAmount,
          data.priceCurrency ?? "EUR",
          target.roomName && !data.roomMatched
            ? `Your saved room is no longer offered — cheapest room now${data.roomName ? `: ${data.roomName}` : ""}`
            : "Updated just now"
        );
        return;
      }

      const res = await fetch("/api/flights/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: target.origin,
          destination: target.destination,
          departureDate: target.departureDate,
          // A saved return is priced as a return, as it was saved.
          returnDate: target.returnDate,
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
    // One date format, whichever page saved it (formatPeriodLabel).
    meta: formatPeriodLabel(item.stay),
    thumbnail: item.thumbnail,
    hasPhoto: Boolean(item.thumbnail) && item.thumbnail !== "/images/hero-lp.jpg",
    hasOverlapWarning: item.hasOverlapWarning,
    bookUrl: buildHotelBookUrl(item.name, item.checkIn, item.checkOut, travelers),
    missingDates: !item.checkIn || !item.checkOut,
    roomsSummary: summarizeRoomSelection(item.roomSelection),
    recordId: item.hotelDirectusId ?? undefined,
    bookingParams: {
      from: item.checkIn,
      to: item.checkOut,
      adults: item.adults ?? parseTravelersAdults(travelers),
      kids: item.kids ?? parseTravelersKids(travelers),
    },
    priceAmount: item.priceAmount ?? roomSelectionTotal(item.roomSelection),
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
            roomName: item.roomSelection?.[0]?.roomName,
          }
        : undefined,
  }));

  const flightItems: TripItemCard[] = selectedTrip.flights.map((item) => {
    // Both ends resolve through the curated city -> gateway airport map, the
    // same one buildFlightBookUrl uses. If either fails to resolve there is
    // nothing to search, so the item simply gets no refresh control.
    const { from: fromCity, to: toCity } = parseRoute(item.route);
    const origin = /^[A-Za-z]{3}$/.test(fromCity.trim())
      ? fromCity.trim().toUpperCase()
      : cityToIata(fromCity) || fromCity.trim().toUpperCase();
    const destination = /^[A-Za-z]{3}$/.test(toCity.trim())
      ? toCity.trim().toUpperCase()
      : cityToIata(toCity);
    const departureDate = item.departAt
      ? item.departAt.slice(0, 10)
      : parseDateFromTiming(item.timing);
    const adults = item.adults ?? parseTravelersAdults(travelers);
    const kids = item.kids ?? parseTravelersKids(travelers);
    // The flight home, which only this stamp records (lib/members/savedFlights).
    const returnLine = item.returnDepartAt
      ? `Return ${reverseRoute(item.route) || ""} · ${formatReturnDeparture(item.returnDepartAt)}`.replace("  ", " ")
      : "";

    return {
      id: item.id,
      primary: item.route,
      secondary: item.cabin,
      meta: returnLine ? [item.timing, returnLine].join(String.fromCharCode(10)) : item.timing,
      travelers,
      thumbnail: item.thumbnail,
      hasOverlapWarning: item.hasOverlapWarning,
      bookUrl: buildFlightBookUrl({
        route: item.route,
        timing: item.timing,
        departAt: item.departAt,
        returnDepartAt: item.returnDepartAt,
        cabin: item.cabin,
        adults,
        kids,
      }),
      priceAmount: item.priceAmount ?? undefined,
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
              returnDate: item.returnDepartAt ? item.returnDepartAt.slice(0, 10) : undefined,
              cabinClass:
                CABIN_CLASS_BY_LABEL[item.cabin.trim().toLowerCase()] ?? "economy",
              adults,
              children: kids,
            }
          : undefined,
    };
  });

  const restaurantItems: TripItemCard[] = selectedTrip.restaurants.map((item) => ({
    id: item.id,
    recordId: item.restaurantDirectusId ?? undefined,
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

          {/* Add notes, Itinerary and Delete trip: one width, level with the
              trip field (Ulrik, 2026-09-27). Add notes opens the notes field
              below and is gone while the field shows. */}
          <div className="members-trip-buttons">
            {notesVisible ? null : (
              <button
                type="button"
                className="oltra-btn oltra-btn--block"
                aria-disabled={outdated ? "true" : undefined}
                onClick={() => !outdated && setEditingNotes(true)}
              >
                Add notes
              </button>
            )}

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

        {/* Under the trip field, as wide as it: five lines, then it scrolls.
            Emptied, it closes once the cursor leaves it. */}
        {notesVisible ? (
          <div className="members-trip-notes-row">
            <div className="members-trip-inline-field members-trip-inline-field--trip">
              <label className="oltra-label" htmlFor="members-trip-notes">
                NOTES
              </label>
              <textarea
                id="members-trip-notes"
                className="oltra-input members-textarea members-trip-notes"
                value={currentNotes}
                onChange={(e) => handleNotesChange(e.target.value)}
                onFocus={() => setEditingNotes(true)}
                onBlur={() => setEditingNotes(false)}
                placeholder="Add notes for this trip..."
                readOnly={outdated}
                autoFocus={editingNotes && !currentNotes.trim()}
              />
            </div>
          </div>
        ) : null}

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

        {/* THE LANDING PAGE'S PANES AND CARDS (Ulrik, 2026-10-04): three
            equal columns with no rule between them, each item in the card the
            landing page draws at its three-pane density - without SAVE, and
            with this page's Update and Delete where SAVE was. */}
        <div className="members-trip-columns">
          <TripColumn title="Hotels" empty={!hotelItems.length}>
            {hotelItems.map((item) => {
              const hotel =
                (item.recordId && hotelRecords[item.recordId]) ||
                hotelRecords[nameKey(item.primary)] ||
                fallbackHotel(item);
              return (
                <HotelSmallCard
                  key={item.id}
                  hotel={hotel}
                  columns={3}
                  isFavourite={Boolean(item.recordId && favourites.hotels.has(item.recordId))}
                  href={item.bookUrl}
                  bookingHref={bookingOrWebsiteHref(hotel, item.bookingParams)}
                  availability={hotelAvailability(item, refreshStates[item.id])}
                  priceBasis={item.priceBasis}
                  details={<TripItemDetails item={item} />}
                  blockedReason={outdated ? OUTDATED_REASON : null}
                  renderSaveControl={() => (
                    <TripItemActions
                      item={item}
                      outdated={outdated}
                      refreshing={refreshStates[item.id]?.status === "loading"}
                      onRefresh={(target) => refreshItemPrice("hotels", target)}
                      onDelete={(id) => setItemPendingDelete({ section: "hotels", itemId: id })}
                    />
                  )}
                />
              );
            })}
          </TripColumn>

          <TripColumn title="Flights" empty={!flightItems.length}>
            {flightItems.map((item) => (
              <SavedFlightRow
                key={item.id}
                item={item}
                outdated={outdated}
                refresh={refreshStates[item.id]}
                onRefresh={(target) => refreshItemPrice("flights", target)}
                onBook={handleBook}
                onDelete={(id) => setItemPendingDelete({ section: "flights", itemId: id })}
              />
            ))}
          </TripColumn>

          <TripColumn title="Restaurants" empty={!restaurantItems.length}>
            {restaurantItems.map((item) => {
              const record =
                (item.recordId && restaurantRecords[item.recordId]) ||
                restaurantRecords[nameKey(item.primary)];
              return (
                <RestaurantSmallCard
                  key={item.id}
                  restaurant={record ?? fallbackRestaurant(item)}
                  columns={3}
                  isFavourite={Boolean(
                    item.recordId && favourites.restaurants.has(item.recordId)
                  )}
                  href={
                    record?.city
                      ? `/restaurants?city=${encodeURIComponent(record.city)}`
                      : undefined
                  }
                  renderSaveControl={() => (
                    <TripItemActions
                      item={item}
                      outdated={outdated}
                      onDelete={(id) =>
                        setItemPendingDelete({ section: "restaurants", itemId: id })
                      }
                    />
                  )}
                />
              );
            })}
          </TripColumn>
        </div>
      </section>

      {showItinerary ? (
        <TripItineraryDocument
          trip={selectedTrip}
          details={itineraryDetails}
          notes={currentNotes}
          onClose={() => setShowItinerary(false)}
        />
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

/* A column headed like a landing pane, its cards at the landing list's
   spacing. */
function TripColumn({
  title,
  empty,
  children,
}: {
  title: string;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="members-trip-col">
      <div className={landing.summaryHeaderRow}>
        <div className="oltra-label">{title}</div>
      </div>
      {empty ? (
        <div className="members-empty">Nothing saved yet.</div>
      ) : (
        <div className="members-trip-list">{children}</div>
      )}
    </div>
  );
}

/* What this trip saved that the landing card cannot know: the stay's dates,
   who it is for and the rooms picked. Under the location, as on a card. */
function TripItemDetails({ item }: { item: TripItemCard }) {
  const lines = [item.meta, item.travelers, item.roomsSummary].filter(Boolean);
  if (!lines.length) return null;
  return (
    <div className="mt-1.5 text-xs leading-relaxed text-[color:var(--oltra-text-muted)]">
      {lines.map((line) => (
        <div key={line}>{line}</div>
      ))}
    </div>
  );
}

/* Where SAVE sits on the landing card: Update (when the item can be
   re-priced) and Delete, condensed like BOOK beside them. Delete opens the
   "Remove this item" confirm. A trip whose dates have passed leaves only
   Delete trip live. */
function TripItemActions({
  item,
  outdated,
  refreshing = false,
  onRefresh,
  onDelete,
}: {
  item: TripItemCard;
  outdated: boolean;
  refreshing?: boolean;
  onRefresh?: (item: TripItemCard) => void;
  onDelete: (itemId: string) => void;
}) {
  const passive = outdated ? "true" : undefined;
  const reason = outdated ? OUTDATED_REASON : undefined;
  return (
    <>
      {item.refresh && onRefresh ? (
        <button
          type="button"
          className="oltra-btn oltra-btn--condensed oltra-btn--block"
          disabled={refreshing}
          aria-disabled={passive}
          data-reason={reason}
          onClick={() => !outdated && onRefresh(item)}
        >
          Update
        </button>
      ) : null}
      <button
        type="button"
        className="oltra-btn oltra-btn--destructive oltra-btn--condensed oltra-btn--block"
        aria-disabled={passive}
        data-reason={reason}
        onClick={() => !outdated && onDelete(item.id)}
      >
        Delete
      </button>
    </>
  );
}

/* THE LANDING PAGE'S FLIGHT ROW, from what a saved flight keeps. A saved
   flight holds its route, times and price but not the itinerary's legs, so
   the leg card shows the route and times rather than the Flights page's
   card. The label, the price with what it covers over the buttons, and the
   buttons at the hotel card's width are the landing row's own. */
function SavedFlightRow({
  item,
  outdated,
  refresh,
  onRefresh,
  onBook,
  onDelete,
}: {
  item: TripItemCard;
  outdated: boolean;
  refresh?: RefreshState;
  onRefresh: (item: TripItemCard) => void;
  onBook: (itemId: string, bookUrl?: string, hasOverlapWarning?: boolean) => void;
  onDelete: (itemId: string) => void;
}) {
  const { currency, approx } = useApproxPrice();
  const refreshing = refresh?.status === "loading";
  const canRefresh = Boolean(item.refresh);
  const passive = outdated ? "true" : undefined;
  const reason = outdated ? OUTDATED_REASON : undefined;

  return (
    <div className={`${landing.flightDetailRow} ${landing.flightDetailRowDense}`}>
      <div className={landing.flightRowMain}>
        <span className={`${landing.flightLineLabel} ${landing.flightLineLabelDense}`}>
          {item.secondary || "Flight"}
        </span>
        <div className={flightsStyles.staticCard}>
          <div className="min-w-0 text-[13px] font-light tracking-wide break-words text-[color:var(--oltra-text-primary)]">
            {item.primary}
          </div>
          {item.meta ? (
            // pre-line: a saved return carries its flight home on a second line.
            <div className="mt-0.5 min-w-0 whitespace-pre-line text-xs break-words text-[color:var(--oltra-text-muted)]">
              {item.meta}
            </div>
          ) : null}
        </div>
        {/* An Update replaces the saved fare with the cheapest on the route
            now, and says so. */}
        {refreshing || refresh?.message ? (
          <div
            className={
              refresh?.status === "error"
                ? "members-item__refresh-note members-item__refresh-note--error"
                : "members-item__refresh-note"
            }
          >
            {refreshing ? "Checking..." : refresh?.message}
          </div>
        ) : null}
      </div>

      <div className={landing.flightRowActions}>
        {item.priceAmount && item.priceCurrency ? (
          <div className={landing.flightRowPrice}>
            {currency} {approx(item.priceAmount, item.priceCurrency)}
            {(item.priceBasis ?? "").split(" · ").filter(Boolean).map((line, i) => (
              <div key={i} className={landing.flightRowPriceBasis}>
                {line}
              </div>
            ))}
          </div>
        ) : null}
        <div className={`${landing.flightRowButtons} ${SMALL_CARD_ACTION_WIDTH[3]}`}>
          {canRefresh ? (
            <button
              type="button"
              className="oltra-btn oltra-btn--condensed oltra-btn--block oltra-btn--stack-top"
              disabled={refreshing}
              aria-disabled={passive}
              data-reason={reason}
              onClick={() => !outdated && onRefresh(item)}
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
            data-reason={reason}
            onClick={() => !outdated && onBook(item.id, item.bookUrl, item.hasOverlapWarning)}
          >
            Book
          </button>
          <button
            type="button"
            className="oltra-btn oltra-btn--destructive oltra-btn--condensed oltra-btn--block oltra-btn--stack-bottom"
            aria-disabled={passive}
            data-reason={reason}
            onClick={() => !outdated && onDelete(item.id)}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
