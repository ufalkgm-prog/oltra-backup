"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import HotelSmallCard, {
  type SmallCardAvailability,
  type SmallCardColumns,
} from "@/components/hotels/HotelSmallCard";
import RestaurantSmallCard from "@/components/restaurants/RestaurantSmallCard";
import type { HotelRecord } from "@/lib/directus";
import { buildBookingLink } from "@/lib/hotels/buildBookingLink";
import { getHotelThumbnail } from "@/lib/hotels/cardHelpers";
import SaveToTripControl, {
  type SaveToTripResult,
} from "@/components/members/SaveToTripControl";
import { addHotelToTripBrowser } from "@/lib/members/db";
import { useAiSearch } from "@/lib/ai/aiSearchStore";
import { useAiResultRecords } from "@/lib/ai/useAiResultRecords";
import { allHotelsHref, flightsHref, hotelsHref, restaurantsHref } from "@/lib/ai/handoff";
import { normalizeOffers, type Itinerary } from "@/lib/flights/duffelNormalizer";
import FlightResultRow, { pickHeadlineItineraries } from "./FlightResultRow";
import type { AiFlightLeg } from "@/lib/ai/types";
import styles from "./page.module.css";

/* The concierge's results, on the landing page.
 *
 * One, two or three frames side by side — hotels, flights, restaurants —
 * depending on what the conversation actually covered. The restaurant frame
 * appears only when restaurants were asked for; it is not a permanent third
 * column waiting to be filled.
 *
 * Deliberately reuses the structured landing summary's own frames: the same
 * .summaryColumn glass panel, the same .smallCardsList scroll box, the same
 * HotelSmallCard and FlightResultRow. Results from the concierge should look
 * identical to results from the search bar, because they are the same hotels
 * shown for the same reason. What changes with the frame count is density, not
 * content — see SmallCardColumns.
 *
 * Every price and availability figure is fetched here and rendered by the
 * card, exactly as the structured search does it. The model never sees those
 * numbers, and the summary inside the concierge modal cannot state one. */

const MONTH_DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

/* Same fallback chain the structured landing summary uses: the real booking
 * link, then the hotel's own site. Without the fallback a hotel with no
 * provider had no BOOK at all, so its actions column held a lone SAVE. */
function bookingHrefFor(
  hotel: HotelRecord,
  params: { from: string; to: string; adults: number; kids: number }
): string | null {
  const link = buildBookingLink(hotel, params);
  if (link) return link;
  const site = (hotel.www ?? "").trim();
  if (!site) return null;
  return /^https?:\/\//i.test(site) ? site : `https://${site}`;
}

function legDateLabel(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split("-").map(Number);
  return MONTH_DAY.format(new Date(Date.UTC(y, m - 1, d)));
}

/* One journey: its own header, its own fare search, its own Best price and
 * Fastest rows.
 *
 * A component per leg rather than a map of states in the parent, so each owns
 * its hooks and one slow route cannot hold up another — the same reason the
 * structured summary gives each airport its own block (§38). Stacking them is
 * also what makes an open jaw expressible at all: fly into Nice, home out of
 * Marseille is two blocks, not one route with a return date. */
function FlightLegPanel({
  leg,
  adults,
  kids,
  tripDefaults,
  columns,
}: {
  leg: AiFlightLeg;
  adults: number;
  kids: number;
  tripDefaults: { destination: string | null; periodLabel: string | null };
  columns: SmallCardColumns;
}) {
  type FlightState =
    | { status: "loading" }
    | { status: "empty" }
    | { status: "error" }
    | {
        status: "ready";
        bestPrice: Itinerary | null;
        fastest: Itinerary | null;
        bestIsAlsoFastest: boolean;
        isOneWay: boolean;
      };
  const [state, setState] = useState<FlightState>({ status: "loading" });

  const isOneWay = !leg.returnDate;

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    fetch("/api/flights/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origin: leg.origin,
        destination: leg.destination,
        departureDate: leg.departureDate,
        returnDate: leg.returnDate || undefined,
        adults: Math.max(1, adults),
        children: Math.max(0, kids),
        cabinClass: leg.cabin || "economy",
      }),
    })
      .then((res) => res.json())
      .then((json: { ok?: boolean; offers?: unknown[] }) => {
        if (cancelled) return;
        if (!json.ok) {
          setState({ status: "error" });
          return;
        }
        const itineraries = normalizeOffers(
          (json.offers ?? []) as never,
          isOneWay ? "one-way" : "return"
        );
        if (!itineraries.length) {
          setState({ status: "empty" });
          return;
        }
        const { bestPrice, fastest, bestIsAlsoFastest } =
          pickHeadlineItineraries(itineraries);
        setState({ status: "ready", bestPrice, fastest, bestIsAlsoFastest, isOneWay });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [leg.origin, leg.destination, leg.departureDate, leg.returnDate, leg.cabin, adults, kids, isOneWay]);

  return (
    <div className={styles.aiFlightLeg}>
      <div className={styles.aiFlightLegHead}>
        <span className={styles.aiFlightLegRoute}>
          {/* Double arrow for a return: this block already carries both
              directions and both dates, so a single arrow described it as a
              one-way it is not. */}
          {leg.origin} {leg.returnDate ? "⇆" : "→"} {leg.destination}
        </span>
        <span className={styles.aiFlightLegDate}>
          {legDateLabel(leg.departureDate)}
          {leg.returnDate ? ` – ${legDateLabel(leg.returnDate)}` : ""}
        </span>
      </div>

      {state.status === "loading" ? (
        <div className={styles.summaryLine}>Checking fares…</div>
      ) : null}
      {state.status === "empty" ? (
        <div className={styles.summaryLine}>
          No flights found on that route for those dates.
        </div>
      ) : null}
      {state.status === "error" ? (
        <div className={styles.summaryLine}>Couldn&apos;t check fares just now.</div>
      ) : null}
      {state.status === "ready" ? (
        <div className={styles.flightDetailList}>
          {/* One row when the cheapest fare is also the quickest — the second
              would have repeated its times and its duration for more money. */}
          <FlightResultRow
            label={state.bestIsAlsoFastest ? "Best price and fastest" : "Best price"}
            flight={state.bestPrice}
            isOneWay={state.isOneWay}
            tripDefaults={tripDefaults}
            columns={columns}
          />
          <FlightResultRow
            label="Fastest"
            flight={state.fastest}
            isOneWay={state.isOneWay}
            tripDefaults={tripDefaults}
            columns={columns}
          />
        </div>
      ) : null}
    </div>
  );
}

/* No props: it reads the shared store directly, so it can sit as its own frame
 * below the search panel — the same relationship LandingSummary has to it. */
export default function AiResultFrames() {
  const { results, query } = useAiSearch();
  const { hotels, restaurants, loading } = useAiResultRecords();
  const [availability, setAvailability] = useState<Record<string, SmallCardAvailability>>({});

  // Live prices, via the same batch route the structured landing summary uses.
  // Skipped without dates — a price needs a stay to be a price.
  useEffect(() => {
    const priceable = hotels.filter(
      (h) => h.ratehawk_hid && h.ratehawk_status !== "passive"
    );
    if (!priceable.length || !query.from || !query.to) {
      setAvailability({});
      return;
    }

    let cancelled = false;
    setAvailability(
      Object.fromEntries(priceable.map((h) => [String(h.id), { status: "loading" as const }]))
    );

    fetch("/api/ratehawk/availability/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hids: priceable.map((h) => h.ratehawk_hid),
        checkInDate: query.from,
        checkOutDate: query.to,
        adults: query.adults,
        kids: query.kids,
        childrenAges: query.childrenAges,
        rooms: query.bedrooms,
        currency: query.currency,
        residency: "gb",
      }),
    })
      .then(async (res) => {
        const json = (await res.json()) as {
          ok?: boolean;
          results?: Array<{ hid: number; headline: { pricePerStay: number; currency: string } | null }>;
        };
        if (cancelled) return;

        const next: Record<string, SmallCardAvailability> = {};
        for (const hotel of priceable) next[String(hotel.id)] = { status: "unavailable" };

        if (res.ok && json.ok) {
          const hidToId = new Map(
            priceable.map((h) => [Number(h.ratehawk_hid), String(h.id)])
          );
          for (const entry of json.results ?? []) {
            const id = hidToId.get(Number(entry.hid));
            if (!id || !entry.headline) continue;
            next[id] = {
              status: "available",
              pricePerStay: entry.headline.pricePerStay,
              currency: entry.headline.currency,
            };
          }
        }

        setAvailability(next);
      })
      .catch(() => {
        if (cancelled) return;
        setAvailability(
          Object.fromEntries(priceable.map((h) => [String(h.id), { status: "error" as const }]))
        );
      });

    return () => {
      cancelled = true;
    };
  }, [hotels, query.from, query.to, query.adults, query.kids, query.bedrooms, query.currency, query.childrenAges]);

  /* Hotels get the same BOOK and SAVE pair the flight rows have, through the
   * same SaveToTripControl every other surface uses — the card already
   * supported both, the concierge frame was simply never passing the save
   * control in, so its hotels were the one result type here you could not put
   * in a trip. */
  const handleSaveHotel = useCallback(
    async (tripId: string, hotel: HotelRecord): Promise<SaveToTripResult> => {
      const result = await addHotelToTripBrowser({
        tripId,
        hotelDirectusId: String(hotel.id),
        name: hotel.hotel_name ?? "Hotel",
        location: [hotel.city, hotel.country].filter(Boolean).join(" · "),
        stayLabel: query.from && query.to ? `${query.from} – ${query.to}` : null,
        thumbnail: getHotelThumbnail(hotel),
        checkIn: query.from || null,
        checkOut: query.to || null,
      });
      return {
        message:
          result.status === "already_exists"
            ? "Already in that trip."
            : result.overlapWarning
              ? "Saved — dates overlap another item."
              : "Saved to trip.",
      };
    },
    [query.from, query.to]
  );

  const tripDefaults = useMemo(
    () => ({
      destination:
        query.destination.city ||
        query.destination.area ||
        query.destination.country ||
        null,
      periodLabel: query.from && query.to ? `${query.from} – ${query.to}` : null,
    }),
    [query.destination, query.from, query.to]
  );

  const destinationLabel =
    query.destination.city ||
    query.destination.area ||
    query.destination.adminRegion ||
    query.destination.country;

  const showHotels = results.hotelIds.length > 0;
  const showFlights = results.flights.length > 0;
  const showRestaurants = results.restaurantIds.length > 0;

  // Nothing to frame yet — the concierge panel carries the conversation.
  if (!showHotels && !showFlights && !showRestaurants) return null;

  // 1, 2 or 3. Drives both the CSS grid's track count and each card's density,
  // from one number, so the two can never disagree.
  const frameCount = ((showHotels ? 1 : 0) +
    (showFlights ? 1 : 0) +
    (showRestaurants ? 1 : 0)) as SmallCardColumns;

  const hotelCardParams = (name: string) => {
    const p = new URLSearchParams();
    p.set("q", name);
    if (query.from) p.set("from", query.from);
    if (query.to) p.set("to", query.to);
    if (query.adults > 0) p.set("adults", String(query.adults));
    if (query.kids > 0) p.set("kids", String(query.kids));
    p.set("submitted", "1");
    return `/hotels?${p.toString()}`;
  };

  return (
    <section className={styles.aiResults}>
      {loading ? <p className={styles.aiResultsNote}>Gathering those…</p> : null}

      <div
        className={styles.aiFrameGrid}
        style={{ "--ai-frames": frameCount } as React.CSSProperties}
      >
        {showHotels ? (
          <div
            className={`oltra-glass oltra-panel oltra-over-image ${styles.summaryColumn} ${styles.landingGlass}`}
          >
            <div className={styles.summaryHeaderRow}>
              <div className="oltra-label">
                {hotels.length} {hotels.length === 1 ? "hotel" : "hotels"}
                {destinationLabel ? ` in ${destinationLabel}` : ""}
              </div>
              <Link
                href={hotelsHref(query, results)}
                className="oltra-btn"
                prefetch={false}
              >
                Go to hotels
              </Link>
            </div>

            <div className={styles.smallCardsList}>
              {hotels.map((hotel) => {
                const record = hotel as unknown as HotelRecord;
                const bookingHref = bookingHrefFor(record, {
                  from: query.from,
                  to: query.to,
                  adults: query.adults,
                  kids: query.kids,
                });
                return (
                  <HotelSmallCard
                    key={String(hotel.id)}
                    hotel={record}
                    href={hotelCardParams(hotel.hotel_name ?? "")}
                    columns={frameCount}
                    availability={
                      query.from && query.to
                        ? availability[String(hotel.id)] ?? { status: "loading" }
                        : { status: "idle" }
                    }
                    bookingHref={bookingHref}
                    renderSaveControl={() => (
                      <SaveToTripControl
                        onSave={(tripId) => handleSaveHotel(tripId, record)}
                        newTripDefaults={tripDefaults}
                        label="SAVE"
                        compact
                        align="right"
                        /* Condensed and block, matching the button rendered
                           inside the card so the pair is one size; stacked
                           with it only when there is one. */
                        className={`oltra-btn oltra-btn--condensed oltra-btn--block${
                          bookingHref ? " oltra-btn--stack-bottom" : ""
                        }`}
                      />
                    )}
                  />
                );
              })}
            </div>

            {destinationLabel ? (
              <Link
                href={allHotelsHref(query)}
                className={`oltra-btn ${styles.aiEscape}`}
                prefetch={false}
              >
                See all hotels in {destinationLabel}
              </Link>
            ) : null}
          </div>
        ) : null}

        {showFlights ? (
          <div
            className={`oltra-glass oltra-panel oltra-over-image ${styles.summaryColumn} ${styles.landingGlass}`}
          >
            <div className={styles.summaryHeaderRow}>
              {/* Just "Flights". Every leg block below states its own route
                  and dates, so naming the route here too printed the same
                  pair of airports twice, one line apart. */}
              <div className="oltra-label">Flights</div>
              <Link
                href={flightsHref(query, results)}
                className="oltra-btn"
                prefetch={false}
              >
                Go to flights
              </Link>
            </div>

            {/* One block per journey, stacked. With a single leg this reads
                exactly as it did before; with two it is how an open jaw gets
                shown at all. */}
            <div className={styles.aiFlightLegs}>
              {results.flights.map((leg) => (
                <FlightLegPanel
                  key={`${leg.origin}-${leg.destination}-${leg.departureDate}-${leg.returnDate}`}
                  leg={leg}
                  adults={query.adults}
                  kids={query.kids}
                  tripDefaults={tripDefaults}
                  columns={frameCount}
                />
              ))}
            </div>
          </div>
        ) : null}

        {showRestaurants ? (
          <div
            className={`oltra-glass oltra-panel oltra-over-image ${styles.summaryColumn} ${styles.landingGlass}`}
          >
            <div className={styles.summaryHeaderRow}>
              <div className="oltra-label">
                {restaurants.length}{" "}
                {restaurants.length === 1 ? "restaurant" : "restaurants"}
                {query.destination.city ? ` in ${query.destination.city}` : ""}
              </div>
              {query.destination.city ? (
                <Link
                  href={restaurantsHref(query)}
                  className="oltra-btn"
                  prefetch={false}
                >
                  Go to restaurants
                </Link>
              ) : null}
            </div>

            <div className={styles.smallCardsList}>
              {restaurants.map((restaurant) => (
                <RestaurantSmallCard
                  key={String(restaurant.id)}
                  restaurant={restaurant}
                  href={restaurantsHref(query)}
                  columns={frameCount}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
