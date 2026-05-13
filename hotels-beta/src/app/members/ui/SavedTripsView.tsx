"use client";

import { useEffect, useMemo, useState } from "react";
import OltraSelect from "@/components/site/OltraSelect";
import { AIRPORT_OPTIONS } from "@/lib/airportOptions";
import { DEFAULT_TRIPS } from "@/lib/members/defaults";
import {
  deleteSavedTripBrowser,
  deleteSavedTripItemBrowser,
  fetchSavedTripsBrowser,
  seedSavedTripsIfEmptyBrowser,
} from "@/lib/members/db";
import type { SavedTrip } from "@/lib/members/types";

type TripItemCard = {
  id: string;
  primary: string;
  secondary: string;
  meta: string;
  travelers: string;
  status: string;
  thumbnail: string;
  hasOverlapWarning?: boolean;
  bookUrl?: string;
};

function statusLabel(status: "confirmed" | "pending" | "saved") {
  switch (status) {
    case "confirmed":
      return "Confirmed";
    case "pending":
      return "Inquiry pending";
    case "saved":
      return "Saved";
    default:
      return "";
  }
}

function notesKey(tripId: string) {
  return `oltra_trip_notes_${tripId}`;
}

function cityToIata(city: string): string {
  if (!city) return "";
  const lower = city.trim().toLowerCase();
  for (const opt of AIRPORT_OPTIONS) {
    const cityPart = opt.label.split("·")[1]?.trim().toLowerCase() ?? "";
    if (cityPart.startsWith(lower)) return opt.value;
  }
  return "";
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
  return `/flights?${params.toString()}`;
}

export default function SavedTripsView() {
  const [trips, setTrips] = useState<SavedTrip[]>([]);
  const [selectedTripId, setSelectedTripId] = useState("");
  const [currentNotes, setCurrentNotes] = useState("");
  const [warningItemId, setWarningItemId] = useState<string | null>(null);
  const [tripPendingDelete, setTripPendingDelete] = useState<SavedTrip | null>(null);
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
    travelers,
    status: statusLabel(item.status),
    thumbnail: item.thumbnail,
    hasOverlapWarning: item.hasOverlapWarning,
    bookUrl: buildHotelBookUrl(item.name, item.checkIn, item.checkOut, travelers),
  }));

  const flightItems: TripItemCard[] = selectedTrip.flights.map((item) => ({
    id: item.id,
    primary: item.route,
    secondary: item.cabin,
    meta: item.timing,
    travelers,
    status: statusLabel(item.status),
    thumbnail: item.thumbnail,
    hasOverlapWarning: item.hasOverlapWarning,
    bookUrl: buildFlightBookUrl(item.route, item.timing, item.departAt, item.cabin, travelers),
  }));

  const restaurantItems: TripItemCard[] = selectedTrip.restaurants.map((item) => ({
    id: item.id,
    primary: item.name,
    secondary: item.location,
    meta: item.time,
    travelers: "",
    status: statusLabel(item.status),
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

          <button
            type="button"
            className="oltra-button-secondary members-action-button"
            onClick={() => setTripPendingDelete(selectedTrip)}
          >
            Delete trip
          </button>
        </div>

        <div className="members-form-field members-trip-notes-field">
          <label className="oltra-label">TRIP NOTES</label>
          <textarea
            className="oltra-input members-textarea members-trip-notes"
            value={currentNotes}
            onChange={(e) => handleNotesChange(e.target.value)}
            placeholder="Add notes for this trip..."
          />
        </div>

        <div className="members-trip-columns">
          <TripSection
            title="HOTELS"
            items={hotelItems}
            onDelete={(id) => deleteTripItem("hotels", id)}
            onBook={handleBook}
          />
          <TripSection
            title="FLIGHTS"
            items={flightItems}
            onDelete={(id) => deleteTripItem("flights", id)}
            onBook={handleBook}
          />
          <TripSection
            title="RESTAURANTS"
            items={restaurantItems}
            onDelete={(id) => deleteTripItem("restaurants", id)}
            onBook={handleBook}
          />
        </div>
      </section>

      {warningItemId ? (
        <section className="oltra-glass members-warning-panel">
          <div className="members-warning-panel__text">
            Dates overlap with another saved item in this trip. You can still
            proceed with booking.
          </div>
          <div className="members-warning-panel__actions">
            <button
              type="button"
              className="oltra-button-secondary members-action-button"
              onClick={() => setWarningItemId(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="oltra-button-primary members-action-button"
              onClick={proceedWithWarning}
            >
              Proceed anyway
            </button>
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
              <button
                type="button"
                className="members-confirm-danger-button members-action-button"
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
                className="oltra-button-primary members-action-button"
                onClick={() => setTripPendingDelete(null)}
              >
                No
              </button>
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
  onDelete,
  onBook,
}: {
  title: string;
  items: TripItemCard[];
  onDelete: (itemId: string) => void;
  onBook: (itemId: string, bookUrl?: string, hasOverlapWarning?: boolean) => void;
}) {
  return (
    <div className="members-trip-col">
      <div className="members-section__header">
        <div className="oltra-label">{title}</div>
      </div>

      <div className="members-section__body">
        {items.length ? (
          items.map((item) => (
            <article key={item.id} className="members-item members-trip-item">
              <div className="members-item__layout">
                <div
                  className="members-item__thumb"
                  style={{ backgroundImage: `url(${item.thumbnail})` }}
                />

                <div className="members-item__content">
                  <div className="members-item__top">
                    <div className="members-item__head">
                      <div className="members-item__title">{item.primary}</div>
                      <div className="members-item__location">{item.secondary}</div>
                    </div>
                    <div className="members-item__status">{item.status}</div>
                  </div>

                  {item.meta ? (
                    <div className="members-item__meta">{item.meta}</div>
                  ) : null}

                  {item.travelers ? (
                    <div className="members-item__meta">{item.travelers}</div>
                  ) : null}

                  {item.hasOverlapWarning ? (
                    <div className="members-item__warning">
                      Warning: overlaps another saved date range.
                    </div>
                  ) : null}

                  <div className="members-item__actions">
                    <button
                      type="button"
                      className="oltra-button-primary members-action-button"
                      onClick={() => onBook(item.id, item.bookUrl, item.hasOverlapWarning)}
                    >
                      Book
                    </button>
                    <button
                      type="button"
                      className="oltra-button-secondary members-action-button"
                      onClick={() => onDelete(item.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))
        ) : (
          <div className="members-empty">Nothing saved yet.</div>
        )}
      </div>
    </div>
  );
}
