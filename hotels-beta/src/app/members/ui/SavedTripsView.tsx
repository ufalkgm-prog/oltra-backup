"use client";

import { useEffect, useMemo, useState } from "react";
import OltraSelect from "@/components/site/OltraSelect";
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
  status: string;
  thumbnail: string;
  hasOverlapWarning?: boolean;
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

export default function SavedTripsView() {
  const [trips, setTrips] = useState<SavedTrip[]>([]);
  const [selectedTripId, setSelectedTripId] = useState("");
  const [warningItemId, setWarningItemId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setIsLoading(true);
        setErrorMessage("");
        setStatusMessage("");

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

  const selectedTrip = useMemo(
    () => trips.find((trip) => trip.id === selectedTripId) ?? trips[0] ?? null,
    [selectedTripId, trips]
  );

  const tripOptions = useMemo(
    () =>
      trips.map((trip) => ({
        value: trip.id,
        label: trip.name,
      })),
    [trips]
  );

  async function deleteTrip(tripId: string) {
    try {
      setErrorMessage("");
      setStatusMessage("");

      await deleteSavedTripBrowser(tripId);

      const next = trips.filter((trip) => trip.id !== tripId);
      setTrips(next);

      if (tripId === selectedTripId) {
        setSelectedTripId(next[0]?.id ?? "");
      }

      setStatusMessage("Trip deleted.");
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
      setStatusMessage("");

      const tableMap = {
        hotels: "member_trip_hotels",
        restaurants: "member_trip_restaurants",
        flights: "member_trip_flights",
      } as const;

      await deleteSavedTripItemBrowser(tableMap[section], itemId);

      setTrips((prev) =>
        prev.map((trip) =>
          trip.id !== selectedTrip.id
            ? trip
            : {
                ...trip,
                [section]: trip[section].filter((item) => item.id !== itemId),
              }
        )
      );

      setStatusMessage("Trip item deleted.");
    } catch {
      setErrorMessage("Could not delete trip item.");
    }
  }

  function handleBook(itemId: string, hasOverlapWarning?: boolean) {
    if (hasOverlapWarning) {
      setWarningItemId(itemId);
      return;
    }

    alert("Booking flow will be connected in the next phase.");
  }

  function proceedWithWarning() {
    setWarningItemId(null);
    alert(
      "Proceeding despite overlap warning. Booking flow will be connected in the next phase."
    );
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

  return (
    <div className="members-stack">
      <section className="oltra-glass members-section members-trip-summary">
        <div className="members-trip-line">
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

          <div className="members-trip-inline-field">
            <div className="oltra-label">DESTINATION</div>
            <div
              className="members-summary-card__value"
              title={selectedTrip.destination || "—"}
            >
              <span className="members-summary-card__text">
                {selectedTrip.destination || "—"}
              </span>
            </div>
          </div>

          <div className="members-trip-inline-field">
            <div className="oltra-label">PERIOD</div>
            <div
              className="members-summary-card__value"
              title={selectedTrip.period || "—"}
            >
              <span className="members-summary-card__text">
                {selectedTrip.period || "—"}
              </span>
            </div>
          </div>

          <div className="members-trip-inline-field">
            <div className="oltra-label">TRAVELERS</div>
            <div
              className="members-summary-card__value"
              title={selectedTrip.travelers || "—"}
            >
              <span className="members-summary-card__text">
                {selectedTrip.travelers || "—"}
              </span>
            </div>
          </div>
        </div>

        <div className="members-trip-actions">
          <button
            type="button"
            className="oltra-button-secondary members-action-button"
            onClick={() => deleteTrip(selectedTrip.id)}
          >
            Delete trip
          </button>
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

      {errorMessage || statusMessage ? (
        <section className="oltra-glass members-section">
          <div className="members-note">{errorMessage || statusMessage}</div>
        </section>
      ) : null}

      <section className="members-trip-grid">
        <TripSection
          title="ACCOMMODATION"
          items={selectedTrip.hotels.map((item) => ({
            id: item.id,
            primary: item.name,
            secondary: item.location,
            meta: item.stay,
            status: statusLabel(item.status),
            thumbnail: item.thumbnail,
            hasOverlapWarning: item.hasOverlapWarning,
          }))}
          onDelete={(itemId) => deleteTripItem("hotels", itemId)}
          onBook={handleBook}
        />

        <TripSection
          title="RESTAURANTS"
          items={selectedTrip.restaurants.map((item) => ({
            id: item.id,
            primary: item.name,
            secondary: item.location,
            meta: item.time,
            status: statusLabel(item.status),
            thumbnail: item.thumbnail,
            hasOverlapWarning: item.hasOverlapWarning,
          }))}
          onDelete={(itemId) => deleteTripItem("restaurants", itemId)}
          onBook={handleBook}
        />

        <TripSection
          title="FLIGHTS"
          items={selectedTrip.flights.map((item) => ({
            id: item.id,
            primary: item.route,
            secondary: item.cabin,
            meta: item.timing,
            status: statusLabel(item.status),
            thumbnail: item.thumbnail,
            hasOverlapWarning: item.hasOverlapWarning,
          }))}
          onDelete={(itemId) => deleteTripItem("flights", itemId)}
          onBook={handleBook}
        />
      </section>
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
  onBook: (itemId: string, hasOverlapWarning?: boolean) => void;
}) {
  return (
    <section className="oltra-glass members-section members-trip-column">
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
                      <div className="members-item__location">
                        {item.secondary}
                      </div>
                    </div>
                    <div className="members-item__status">{item.status}</div>
                  </div>

                  <div className="members-item__meta">{item.meta}</div>

                  {item.hasOverlapWarning ? (
                    <div className="members-item__warning">
                      Warning: overlaps another saved date range.
                    </div>
                  ) : null}

                  <div className="members-item__actions">
                    <button
                      type="button"
                      className="oltra-button-primary members-action-button"
                      onClick={() => onBook(item.id, item.hasOverlapWarning)}
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
    </section>
  );
}