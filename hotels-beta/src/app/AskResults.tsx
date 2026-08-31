"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import HotelSmallCard, {
  type SmallCardAvailability,
} from "@/components/hotels/HotelSmallCard";
import type { HotelRecord } from "@/lib/directus";
import { buildBookingLink } from "@/lib/hotels/buildBookingLink";
import { queryStateToParams } from "@/lib/ai/aiSearchStore";
import { voiceFont } from "@/lib/ai/fonts";
import { normalizeOffers, type Itinerary } from "@/lib/flights/duffelNormalizer";
import FlightResultRow, { pickHeadlineItineraries } from "./FlightResultRow";
import type { AiHotelCard, AiQueryState, AiResultSet } from "@/lib/ai/types";
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

type Props = {
  framing: string;
  results: AiResultSet;
  query: AiQueryState;
};

export default function AskResults({ framing, results, query }: Props) {
  const [hotels, setHotels] = useState<AiHotelCard[]>([]);
  const [availability, setAvailability] = useState<Record<string, SmallCardAvailability>>({});
  const [loading, setLoading] = useState(false);

  type FlightState =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "empty" }
    | { status: "error" }
    | { status: "ready"; bestPrice: Itinerary | null; fastest: Itinerary | null; isOneWay: boolean };
  const [flights, setFlights] = useState<FlightState>({ status: "idle" });

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

  // One route, because the concierge has already chosen the airport — unlike
  // the structured summary, which fans out across every airport serving the
  // destination. Same endpoint, same normaliser, same best/fastest selection.
  const flightKey = results.flights
    ? `${results.flights.origin}|${results.flights.destination}|${results.flights.departureDate}|${results.flights.returnDate}|${results.flights.cabin}`
    : "";

  useEffect(() => {
    const f = results.flights;
    if (!f?.origin || !f?.destination || !f?.departureDate) {
      setFlights({ status: "idle" });
      return;
    }

    let cancelled = false;
    setFlights({ status: "loading" });
    const isOneWay = !f.returnDate;

    fetch("/api/flights/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origin: f.origin,
        destination: f.destination,
        departureDate: f.departureDate,
        returnDate: f.returnDate || undefined,
        adults: Math.max(1, query.adults),
        children: Math.max(0, query.kids),
        cabinClass: f.cabin || "economy",
      }),
    })
      .then((res) => res.json())
      .then((json: { ok?: boolean; offers?: unknown[] }) => {
        if (cancelled) return;
        if (!json.ok) {
          setFlights({ status: "error" });
          return;
        }
        const itineraries = normalizeOffers(
          (json.offers ?? []) as never,
          isOneWay ? "one-way" : "return"
        );
        if (!itineraries.length) {
          setFlights({ status: "empty" });
          return;
        }
        const { bestPrice, fastest } = pickHeadlineItineraries(itineraries);
        setFlights({ status: "ready", bestPrice, fastest, isOneWay });
      })
      .catch(() => {
        if (!cancelled) setFlights({ status: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [flightKey, results.flights, query.adults, query.kids]);

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

  const flightsHref = useMemo(() => {
    const params = queryStateToParams(query);
    if (results.flights) {
      params.set("origin", results.flights.origin);
      params.set("tripType", results.flights.returnDate ? "return" : "oneway");
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
  const showFlights = Boolean(results.flights);
  const hotelsOnly = showHotels && !showFlights;

  if (!showHotels && !showFlights && !framing) return null;

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
      {framing ? (
        <p className={`${styles.askFraming} ${voiceFont.className}`}>{framing}</p>
      ) : null}

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
                Flights {results.flights?.origin} → {results.flights?.destination}
              </div>
              <Link
                href={flightsHref}
                className={`oltra-button-primary ${styles.summaryTopButton}`}
                prefetch={false}
              >
                Go to flights
              </Link>
            </div>
            {flights.status === "loading" ? (
              <div className={styles.summaryLine}>Checking fares…</div>
            ) : null}
            {flights.status === "empty" ? (
              <div className={styles.summaryLine}>
                No flights found on that route for those dates.
              </div>
            ) : null}
            {flights.status === "error" ? (
              <div className={styles.summaryLine}>
                Couldn&apos;t check fares just now.
              </div>
            ) : null}
            {flights.status === "ready" ? (
              <div className={styles.flightDetailList}>
                <FlightResultRow
                  label="Best price"
                  flight={flights.bestPrice}
                  isOneWay={flights.isOneWay}
                  tripDefaults={tripDefaults}
                />
                <FlightResultRow
                  label="Fastest"
                  flight={flights.fastest}
                  isOneWay={flights.isOneWay}
                  tripDefaults={tripDefaults}
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
