"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import HotelSmallCard, {
  type SmallCardAvailability,
} from "@/components/hotels/HotelSmallCard";
import type { HotelRecord } from "@/lib/directus";
import { buildBookingLink } from "@/lib/hotels/buildBookingLink";
import { queryStateToParams, useAiSearch } from "@/lib/ai/aiSearchStore";
import { normalizeOffers, type Itinerary } from "@/lib/flights/duffelNormalizer";
import FlightResultRow, { pickHeadlineItineraries } from "./FlightResultRow";
import type { AiFlightLeg, AiHotelCard } from "@/lib/ai/types";
import styles from "./page.module.css";

/* The results region below the conversation.
 *
 * Deliberately reuses the structured landing summary's own frames — the same
 * `.summaryGrid` / `.summaryColumn` glass panel, the same `.smallCardsList`
 * scroll box, the same `HotelSmallCard` at its normal size. An earlier version
 * of this file invented its own card grid; results from the concierge should
 * look identical to results from the search bar, because they are the same
 * hotels shown for the same reason.
 *
 * The one deliberate difference: when the answer is hotels only, the panel
 * takes the full width and the cards run in two columns inside a single scroll
 * container, rather than leaving half the row empty where the flights panel
 * would otherwise sit.
 *
 * The framing line is the only thing the model wrote. Every price and
 * availability figure is fetched here and rendered by the card, exactly as the
 * structured search does it — the model never sees those numbers. */

/** The concierge speaks Duffel's cabin values; the Flights page's `cabin` param
 * takes its own display labels. */
const FLIGHTS_PAGE_CABIN: Record<string, string> = {
  economy: "Economy",
  premium_economy: "Premium Economy",
  business: "Business",
  first: "First",
};

const MONTH_DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

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
}: {
  leg: AiFlightLeg;
  adults: number;
  kids: number;
  tripDefaults: { destination: string | null; periodLabel: string | null };
}) {
  type FlightState =
    | { status: "loading" }
    | { status: "empty" }
    | { status: "error" }
    | { status: "ready"; bestPrice: Itinerary | null; fastest: Itinerary | null; isOneWay: boolean };
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
        const { bestPrice, fastest } = pickHeadlineItineraries(itineraries);
        setState({ status: "ready", bestPrice, fastest, isOneWay });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [leg.origin, leg.destination, leg.departureDate, leg.returnDate, leg.cabin, adults, kids, isOneWay]);

  return (
    <div className={styles.askFlightLeg}>
      <div className={styles.askFlightLegHead}>
        <span className={styles.askFlightLegRoute}>
          {leg.origin} &rarr; {leg.destination}
        </span>
        <span className={styles.askFlightLegDate}>
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
          <FlightResultRow
            label="Best price"
            flight={state.bestPrice}
            isOneWay={state.isOneWay}
            tripDefaults={tripDefaults}
          />
          <FlightResultRow
            label="Fastest"
            flight={state.fastest}
            isOneWay={state.isOneWay}
            tripDefaults={tripDefaults}
          />
        </div>
      ) : null}
    </div>
  );
}

/* No props: it reads the shared store directly, so it can sit outside the AI
 * panel as its own frame — the same relationship LandingSummary has to the
 * search panel in the structured layout. */
export default function AskResults() {
  const { results, query } = useAiSearch();
  const [hotels, setHotels] = useState<AiHotelCard[]>([]);
  const [availability, setAvailability] = useState<Record<string, SmallCardAvailability>>({});
  const [loading, setLoading] = useState(false);

  const idKey = results.hotelIds.join(",");

  useEffect(() => {
    if (!results.hotelIds.length) {
      setHotels([]);
      return;
    }
    let cancelled = false;
    setLoading(true);

    fetch("/api/ai/hotels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: results.hotelIds }),
    })
      .then((res) => res.json())
      .then((json: { ok?: boolean; hotels?: AiHotelCard[] }) => {
        if (cancelled) return;
        setHotels(json.ok && json.hotels ? json.hotels : []);
      })
      .catch(() => {
        if (!cancelled) setHotels([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [idKey, results.hotelIds]);

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

  const hotelsHref = useMemo(() => {
    const params = queryStateToParams(query);
    if (results.hotelIds.length) params.set("ids", results.hotelIds.join(","));
    params.set("search_submitted", "1");
    return `/hotels?${params.toString()}`;
  }, [query, results.hotelIds]);

  const allInDestinationHref = useMemo(() => {
    const params = queryStateToParams(query);
    params.set("search_submitted", "1");
    return `/hotels?${params.toString()}`;
  }, [query]);

  // More than one journey hands off as multi-city, which is precisely what
  // that mode on the Flights page is for — an open jaw flattened into a return
  // would send the traveller home from an airport they are not in.
  const flightsHref = useMemo(() => {
    const params = queryStateToParams(query);
    const legs = results.flights;
    const first = legs[0];
    if (!first) return `/flights?${params.toString()}`;

    params.set("origin", first.origin);
    params.set("cabin", FLIGHTS_PAGE_CABIN[first.cabin] ?? "Economy");

    if (legs.length > 1) {
      params.set("tripType", "multiple");
      // The form takes at most 5, and only searches when every leg is
      // complete — so send whole legs, and no more than it can hold.
      legs.slice(0, 5).forEach((leg, i) => {
        params.set(`leg${i + 1}`, `${leg.origin}-${leg.destination}-${leg.departureDate}`);
      });
      // The single depart/return pair means nothing for a multi-city trip, and
      // leaving the hotel stay in them shows dates that belong to a room.
      params.delete("from");
      params.delete("to");
    } else {
      params.set("tripType", first.returnDate ? "return" : "oneway");
      params.set("from", first.departureDate);
      if (first.returnDate) params.set("to", first.returnDate);
      else params.delete("to");
    }
    return `/flights?${params.toString()}`;
  }, [query, results.flights]);

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
  const hotelsOnly = showHotels && !showFlights;

  // Nothing to frame yet — the panel above carries the conversation.
  if (!showHotels && !showFlights) return null;

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
    <section className={styles.askResults}>
      {loading ? <p className={styles.askResultsNote}>Gathering those…</p> : null}

      <div className={hotelsOnly ? styles.askResultsFull : styles.summaryGrid}>
        {showHotels ? (
          <div
            className={`oltra-glass oltra-panel ${styles.summaryColumn} ${styles.landingGlass}`}
          >
            <div className={styles.summaryHeaderRow}>
              <div className="oltra-label">
                {hotels.length} {hotels.length === 1 ? "hotel" : "hotels"}
                {destinationLabel ? ` in ${destinationLabel}` : ""}
              </div>
              <Link
                href={hotelsHref}
                className={`oltra-button-primary ${styles.summaryTopButton}`}
                prefetch={false}
              >
                Go to hotels
              </Link>
            </div>

            <div
              className={`${styles.smallCardsList} ${hotelsOnly ? styles.askCardsTwoCol : ""}`}
            >
              {hotels.map((hotel) => {
                const record = hotel as unknown as HotelRecord;
                return (
                  <HotelSmallCard
                    key={String(hotel.id)}
                    hotel={record}
                    href={hotelCardParams(hotel.hotel_name ?? "")}
                    availability={
                      query.from && query.to
                        ? availability[String(hotel.id)] ?? { status: "loading" }
                        : { status: "idle" }
                    }
                    bookingHref={buildBookingLink(record)}
                  />
                );
              })}
            </div>

            {destinationLabel ? (
              <Link href={allInDestinationHref} className={styles.askEscape} prefetch={false}>
                See all hotels in {destinationLabel}
              </Link>
            ) : null}
          </div>
        ) : null}

        {showFlights ? (
          <div
            className={`oltra-glass oltra-panel ${styles.summaryColumn} ${styles.landingGlass}`}
          >
            <div className={styles.summaryHeaderRow}>
              <div className="oltra-label">
                {results.flights.length > 1 ? "Flights" : `Flights ${results.flights[0].origin} → ${results.flights[0].destination}`}
              </div>
              <Link
                href={flightsHref}
                className={`oltra-button-primary ${styles.summaryTopButton}`}
                prefetch={false}
              >
                Go to flights
              </Link>
            </div>

            {/* One block per journey, stacked. With a single leg this reads
                exactly as it did before; with two it is how an open jaw gets
                shown at all. */}
            <div className={styles.askFlightLegs}>
              {results.flights.map((leg) => (
                <FlightLegPanel
                  key={`${leg.origin}-${leg.destination}-${leg.departureDate}-${leg.returnDate}`}
                  leg={leg}
                  adults={query.adults}
                  kids={query.kids}
                  tripDefaults={tripDefaults}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
