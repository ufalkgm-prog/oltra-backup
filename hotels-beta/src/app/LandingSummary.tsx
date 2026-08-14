"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { HotelRecord } from "@/lib/directus";
import { getAirportsForCity } from "@/lib/cityAirports";
import { normalizeOffers, type Itinerary, type FlightLeg } from "@/lib/flights/duffelNormalizer";
import HotelSmallCard, { type SmallCardAvailability } from "@/components/hotels/HotelSmallCard";
import styles from "./page.module.css";

type HotelSummary = {
  count: number;
  names: string[];
  hotels: HotelRecord[];
};

type Props = {
  hotelSummary: HotelSummary | null;
  hotelHeaderLabel?: string;
  includeHotels: boolean;
  includeFlights: boolean;
  origin: string;
  destinationCity: string;
  fromDate: string;
  toDate: string;
  adults: number;
  kids: number;
  hasFullStayDetails: boolean;
  hotelsHref: string;
  flightsHref: string;
  narrowSuggestion: "city" | "purpose" | null;
};

const CARD_LIMIT = 40;
const HARD_LIMIT = 50;


function formatDurationMinutes(total: number): string {
  if (!Number.isFinite(total) || total <= 0) return "—";
  const h = Math.floor(total / 60);
  const m = Math.round(total % 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatPrice(value: number, currency: string): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  const symbol =
    currency === "EUR" ? "€" : currency === "USD" ? "$" : currency === "GBP" ? "£" : `${currency} `;
  return `${symbol}${Math.round(value).toLocaleString()}`;
}

function getAgodaId(hotel: HotelRecord): number | null {
  const raw = (hotel as any).agoda_hotel_id;
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function FlightDetailCard({ flight }: { flight: FlightLeg }) {
  const airlineLabel = flight.airlines.length
    ? flight.airlines.map((a) => a.name).join(" + ")
    : flight.airline;

  return (
    <div className={styles.flightCardInner}>
      <div className={styles.flightCardTimes}>
        <span className={styles.flightCardTime}>{flight.departTime}</span>
        <span className={styles.flightCardArrow}>→</span>
        <span className={styles.flightCardTime}>{flight.arriveTime}</span>
        <span className={styles.flightCardDuration}>
          Duration: {formatDurationMinutes(flight.durationMinutes)}
        </span>
      </div>
      <div className={styles.flightCardMeta}>{airlineLabel}</div>
      {flight.stopSummary ? (
        <div className={styles.flightCardStops}>{flight.stopSummary}</div>
      ) : null}
    </div>
  );
}

export default function LandingSummary({
  hotelSummary,
  hotelHeaderLabel,
  includeHotels,
  includeFlights,
  origin,
  destinationCity,
  fromDate,
  toDate,
  adults,
  kids,
  hasFullStayDetails,
  hotelsHref,
  flightsHref,
  narrowSuggestion,
}: Props) {
  const showHotels = includeHotels;
  const showFlights = includeFlights;

  // A destination city can resolve to more than one relevant airport (a
  // multi-airport city like London, or an area served by two comparably
  // distant hub airports like an Alpine ski resort) - see
  // src/lib/cityAirports.ts for the selection rule. Each candidate gets its
  // own independent search below rather than picking a single "winner".
  const candidateAirports = useMemo(() => {
    const all = getAirportsForCity(destinationCity);
    return all.filter((a) => a.iata !== origin);
  }, [destinationCity, origin]);

  const canSearchFlights =
    Boolean(origin) && Boolean(fromDate) && candidateAirports.length > 0;

  type FlightBlockState =
    | { status: "loading" }
    | { status: "ready"; recommended: Itinerary | null; isOneWay: boolean }
    | { status: "empty" }
    | { status: "error"; message: string };

  const [flightBlocks, setFlightBlocks] = useState<Record<string, FlightBlockState>>({});

  useEffect(() => {
    if (!showFlights || !canSearchFlights) {
      setFlightBlocks({});
      return;
    }

    let cancelled = false;
    const isOneWay = !toDate;
    const controllers: AbortController[] = [];

    setFlightBlocks(
      Object.fromEntries(
        candidateAirports.map((a) => [a.iata, { status: "loading" } as FlightBlockState])
      )
    );

    for (const airport of candidateAirports) {
      const controller = new AbortController();
      controllers.push(controller);

      fetch("/api/flights/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          origin,
          destination: airport.iata,
          departureDate: fromDate,
          returnDate: toDate || undefined,
          adults: Math.max(1, adults),
          children: kids,
          cabinClass: "economy",
        }),
      })
        .then(async (res) => {
          const json = await res.json();
          if (cancelled) return;
          if (!json.ok) {
            setFlightBlocks((prev) => ({
              ...prev,
              [airport.iata]: { status: "error", message: json.error || "Flight search failed" },
            }));
            return;
          }
          const itineraries = normalizeOffers(
            json.offers ?? [],
            isOneWay ? "one-way" : "return"
          );
          if (itineraries.length === 0) {
            setFlightBlocks((prev) => ({ ...prev, [airport.iata]: { status: "empty" } }));
            return;
          }
          const recommended = [...itineraries].sort((a, b) => b.score - a.score)[0] ?? null;
          setFlightBlocks((prev) => ({
            ...prev,
            [airport.iata]: { status: "ready", recommended, isOneWay },
          }));
        })
        .catch((err) => {
          if (cancelled || err?.name === "AbortError") return;
          setFlightBlocks((prev) => ({
            ...prev,
            [airport.iata]: {
              status: "error",
              message: err instanceof Error ? err.message : "Flight search failed",
            },
          }));
        });
    }

    return () => {
      cancelled = true;
      controllers.forEach((c) => c.abort());
    };
  }, [showFlights, canSearchFlights, candidateAirports, origin, fromDate, toDate, adults, kids]);

  const [availabilityById, setAvailabilityById] = useState<Record<string, SmallCardAvailability>>({});

  const visibleHotels = useMemo(
    () =>
      hotelSummary && hotelSummary.count <= CARD_LIMIT
        ? hotelSummary.hotels.slice(0, CARD_LIMIT)
        : [],
    [hotelSummary]
  );

  useEffect(() => {
    if (!showHotels) return;
    if (!hasFullStayDetails) {
      setAvailabilityById({});
      return;
    }
    if (visibleHotels.length === 0) {
      setAvailabilityById({});
      return;
    }

    const withIds = visibleHotels
      .map((h) => ({ directusId: String(h.id), agodaHotelId: getAgodaId(h) }))
      .filter((x): x is { directusId: string; agodaHotelId: number } => x.agodaHotelId !== null);

    if (withIds.length === 0) {
      const map: Record<string, SmallCardAvailability> = {};
      for (const h of visibleHotels) map[String(h.id)] = { status: "no-id" };
      setAvailabilityById(map);
      return;
    }

    let cancelled = false;

    const initial: Record<string, SmallCardAvailability> = {};
    for (const h of visibleHotels) {
      const id = getAgodaId(h);
      initial[String(h.id)] = id ? { status: "loading" } : { status: "no-id" };
    }
    setAvailabilityById(initial);

    fetch("/api/agoda/availability/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hotelIds: withIds.map((x) => x.agodaHotelId),
        checkInDate: fromDate,
        checkOutDate: toDate,
        currency: "EUR",
        adults,
        kids,
        childrenAges: [],
      }),
    })
      .then(async (res) => {
        const json = (await res.json()) as {
          ok?: boolean;
          results?: Array<{
            hotelId: number;
            dailyRate: number;
            currency: string;
            landingURL?: string;
          }>;
        };
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          const next: Record<string, SmallCardAvailability> = {};
          for (const h of visibleHotels) next[String(h.id)] = { status: "error" };
          setAvailabilityById(next);
          return;
        }
        const agodaToDirectus = new Map(withIds.map((x) => [x.agodaHotelId, x.directusId]));
        const next: Record<string, SmallCardAvailability> = {};
        for (const h of visibleHotels) {
          const aid = getAgodaId(h);
          if (!aid) {
            next[String(h.id)] = { status: "no-id" };
            continue;
          }
          next[String(h.id)] = { status: "unavailable" };
        }
        for (const r of json.results ?? []) {
          const dId = agodaToDirectus.get(r.hotelId);
          if (dId) {
            next[dId] = {
              status: "available",
              currency: r.currency,
              dailyRate: r.dailyRate,
              landingURL: r.landingURL,
            };
          }
        }
        setAvailabilityById(next);
      })
      .catch(() => {
        if (cancelled) return;
        const next: Record<string, SmallCardAvailability> = {};
        for (const h of visibleHotels) next[String(h.id)] = { status: "error" };
        setAvailabilityById(next);
      });

    return () => {
      cancelled = true;
    };
  }, [showHotels, hasFullStayDetails, visibleHotels, fromDate, toDate, adults, kids]);

  const handleBookFlight = useCallback(async (offerId: string) => {
    try {
      const res = await fetch("/api/flights/book-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId }),
      });
      const data = await res.json();
      if (data.ok && data.url) {
        window.open(data.url, "_blank", "noopener");
      }
    } catch {
      /* swallow */
    }
  }, []);

  if (!showHotels && !showFlights) return null;

  const hotelCount = hotelSummary?.count ?? 0;

  let hotelLine: string | null = null;
  let showCards = false;

  if (hotelCount === 0) {
    hotelLine = null;
  } else if (hotelCount <= CARD_LIMIT) {
    hotelLine = null;
    showCards = true;
  } else if (hotelCount <= HARD_LIMIT) {
    hotelLine =
      `More than ${CARD_LIMIT} hotels match your criteria. Please narrow criteria to see here or go to hotels page.`;
  } else {
    const suggestion = narrowSuggestion ?? "additional criteria";
    hotelLine = `More than ${HARD_LIMIT} hotels match your criteria. Please narrow by adding ${suggestion}.`;
  }

  return (
    <div className={styles.summaryGrid}>
      {showHotels ? (
        <div className={`oltra-glass oltra-panel ${styles.summaryColumn} ${styles.landingGlass}`}>
          <div className={styles.summaryHeaderRow}>
            <div className="oltra-label">{hotelHeaderLabel || "Hotels"}</div>
            <Link
              href={hotelsHref}
              className={`oltra-button-primary ${styles.summaryTopButton}`}
              prefetch={false}
            >
              Go to hotels
            </Link>
          </div>

          {hotelLine ? (
            <div className={styles.summaryLine}>{hotelLine}</div>
          ) : null}

          {showCards ? (
            <div className={styles.smallCardsList}>
              {visibleHotels.map((h) => {
                const hotelParams = new URLSearchParams();
                hotelParams.set("q", h.hotel_name ?? "");
                if (fromDate) hotelParams.set("from", fromDate);
                if (toDate) hotelParams.set("to", toDate);
                if (adults > 0) hotelParams.set("adults", String(adults));
                if (kids > 0) hotelParams.set("kids", String(kids));
                hotelParams.set("submitted", "1");
                const hotelHref = `/hotels?${hotelParams.toString()}`;
                return (
                <HotelSmallCard
                  key={String(h.id)}
                  hotel={h}
                  href={hotelHref}
                  availability={
                    hasFullStayDetails
                      ? availabilityById[String(h.id)] ?? { status: "loading" }
                      : { status: "idle" }
                  }
                />
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      {showFlights ? (
        <div className={`oltra-glass oltra-panel ${styles.summaryColumn} ${styles.landingGlass}`}>
          <div className={styles.summaryHeaderRow}>
            <div className="oltra-label">Flights</div>
            <Link
              href={flightsHref}
              className={`oltra-button-primary ${styles.summaryTopButton}`}
              prefetch={false}
            >
              Go to flights
            </Link>
          </div>

          {!canSearchFlights ? (
            <div className={styles.summaryLine}>
              Please be more specific to find relevant flights
            </div>
          ) : (
            <div className={styles.flightDetailList}>
              {candidateAirports.map((airport) => {
                const state = flightBlocks[airport.iata];
                const viaLabel = `${airport.label} (${airport.iata})`;

                if (!state || state.status === "loading") {
                  return (
                    <div className={styles.summaryLine} key={airport.iata}>
                      Searching flights via {viaLabel}…
                    </div>
                  );
                }

                if (state.status === "empty") {
                  return (
                    <div className={styles.summaryLine} key={airport.iata}>
                      No flights found via {viaLabel} on {fromDate}
                      {toDate ? ` (return ${toDate})` : ""}.
                    </div>
                  );
                }

                if (state.status === "error") {
                  return (
                    <div className={styles.summaryLine} key={airport.iata}>
                      Could not load flights via {viaLabel} ({state.message}).
                    </div>
                  );
                }

                if (!state.recommended) return null;
                const flight = state.recommended;

                return (
                  <div className={styles.flightDetailRow} key={airport.iata}>
                    <div className={styles.flightRowLegend}>
                      <span className={styles.flightLineLabel}>Via {viaLabel}</span>
                      <span className={styles.flightRowPrice}>
                        {formatPrice(flight.priceEur, flight.currency)}
                      </span>
                      <button
                        type="button"
                        className={`oltra-button-primary ${styles.flightBookButton}`}
                        onClick={() => handleBookFlight(flight.offerId)}
                      >
                        BOOK
                      </button>
                    </div>
                    <div className={styles.flightLegsGrid}>
                      <FlightDetailCard flight={flight.outbound} />
                      {!state.isOneWay && flight.inbound ? (
                        <FlightDetailCard flight={flight.inbound} />
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
