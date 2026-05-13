"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { HotelRecord } from "@/lib/directus";
import { AIRPORT_OPTIONS } from "@/lib/airportOptions";
import { normalizeOffers, type Itinerary, type FlightLeg } from "@/lib/flights/duffelNormalizer";
import HotelSmallCard, { type SmallCardAvailability } from "@/components/hotels/HotelSmallCard";
import styles from "./page.module.css";

type HotelSummary = {
  count: number;
  geography: string;
  names: string[];
  hotels: HotelRecord[];
};

type Props = {
  hotelSummary: HotelSummary | null;
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

const CARD_LIMIT = 20;
const HARD_LIMIT = 50;

function findAirportForCity(city: string): string {
  if (!city) return "";
  const target = city.toLowerCase().trim();
  for (const opt of AIRPORT_OPTIONS) {
    const cityPart = opt.label.split("·")[1]?.toLowerCase().trim() ?? "";
    if (cityPart && cityPart.includes(target)) return opt.value;
  }
  return "";
}

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

  const destinationAirport = useMemo(
    () => findAirportForCity(destinationCity),
    [destinationCity]
  );

  const canSearchFlights =
    Boolean(destinationAirport) &&
    Boolean(origin) &&
    Boolean(fromDate) &&
    origin !== destinationAirport;

  const [flightState, setFlightState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "ready"; recommended: Itinerary | null; fastest: Itinerary | null; isOneWay: boolean }
    | { status: "empty" }
    | { status: "error"; message: string }
  >({ status: "idle" });

  useEffect(() => {
    if (!showFlights) {
      setFlightState({ status: "idle" });
      return;
    }
    if (!canSearchFlights) {
      setFlightState({ status: "idle" });
      return;
    }

    let cancelled = false;
    setFlightState({ status: "loading" });
    const controller = new AbortController();
    const isOneWay = !toDate;

    fetch("/api/flights/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        origin,
        destination: destinationAirport,
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
          setFlightState({ status: "error", message: json.error || "Flight search failed" });
          return;
        }
        const itineraries = normalizeOffers(
          json.offers ?? [],
          isOneWay ? "one-way" : "return"
        );
        if (itineraries.length === 0) {
          setFlightState({ status: "empty" });
          return;
        }
        const byScore = [...itineraries].sort((a, b) => b.score - a.score);
        const byDuration = [...itineraries].sort((a, b) => {
          const ad = a.outbound.durationMinutes + (a.inbound?.durationMinutes ?? 0);
          const bd = b.outbound.durationMinutes + (b.inbound?.durationMinutes ?? 0);
          return ad - bd;
        });
        const recommended = byScore[0] ?? null;
        const fastest =
          byDuration[0]?.id !== recommended?.id
            ? byDuration[0] ?? null
            : byDuration[1] ?? null;
        setFlightState({ status: "ready", recommended, fastest, isOneWay });
      })
      .catch((err) => {
        if (cancelled || err?.name === "AbortError") return;
        setFlightState({
          status: "error",
          message: err instanceof Error ? err.message : "Flight search failed",
        });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [showFlights, canSearchFlights, origin, destinationAirport, fromDate, toDate, adults, kids]);

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
  const hotelGeography = hotelSummary?.geography ?? "selected destination";

  let hotelLine: string | null = null;
  let showCards = false;

  if (hotelCount === 0) {
    hotelLine = `0 hotels identified in ${hotelGeography}`;
  } else if (hotelCount <= CARD_LIMIT) {
    hotelLine = null;
    showCards = true;
  } else if (hotelCount <= HARD_LIMIT) {
    hotelLine =
      "More than 20 hotels match your criteria. Please narrow criteria to see here or go to hotels page.";
  } else {
    const suggestion = narrowSuggestion ?? "additional criteria";
    hotelLine = `More than ${HARD_LIMIT} hotels match your criteria. Please narrow by adding ${suggestion}.`;
  }

  return (
    <div className={styles.summaryGrid}>
      {showHotels ? (
        <div className={`oltra-glass oltra-panel ${styles.summaryColumn}`}>
          <div className={styles.summaryHeaderRow}>
            <div className="oltra-label">Hotels</div>
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
        <div className={`oltra-glass oltra-panel ${styles.summaryColumn}`}>
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
          ) : flightState.status === "loading" || flightState.status === "idle" ? (
            <div className={styles.summaryLine}>Searching flights…</div>
          ) : flightState.status === "ready" ? (
            <div className={styles.flightDetailList}>
              {flightState.recommended ? (
                <div className={styles.flightDetailRow}>
                  <div className={styles.flightRowLegend}>
                    <span className={styles.flightLineLabel}>Recommended</span>
                    <span className={styles.flightRowPrice}>
                      {formatPrice(
                        flightState.recommended.priceEur,
                        flightState.recommended.currency
                      )}
                    </span>
                    <button
                      type="button"
                      className={`oltra-button-primary ${styles.flightBookButton}`}
                      onClick={() =>
                        flightState.recommended &&
                        handleBookFlight(flightState.recommended.offerId)
                      }
                    >
                      BOOK
                    </button>
                  </div>
                  <div className={styles.flightLegsGrid}>
                    <FlightDetailCard flight={flightState.recommended.outbound} />
                    {!flightState.isOneWay && flightState.recommended.inbound ? (
                      <FlightDetailCard flight={flightState.recommended.inbound} />
                    ) : null}
                  </div>
                </div>
              ) : null}
              {flightState.fastest ? (
                <div className={styles.flightDetailRow}>
                  <div className={styles.flightRowLegend}>
                    <span className={styles.flightLineLabel}>Fastest</span>
                    <span className={styles.flightRowPrice}>
                      {formatPrice(
                        flightState.fastest.priceEur,
                        flightState.fastest.currency
                      )}
                    </span>
                    <button
                      type="button"
                      className={`oltra-button-primary ${styles.flightBookButton}`}
                      onClick={() =>
                        flightState.fastest &&
                        handleBookFlight(flightState.fastest.offerId)
                      }
                    >
                      BOOK
                    </button>
                  </div>
                  <div className={styles.flightLegsGrid}>
                    <FlightDetailCard flight={flightState.fastest.outbound} />
                    {!flightState.isOneWay && flightState.fastest.inbound ? (
                      <FlightDetailCard flight={flightState.fastest.inbound} />
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : flightState.status === "empty" ? (
            <div className={styles.summaryLine}>
              No flights returned for {origin} → {destinationAirport} on {fromDate}
              {toDate ? ` (return ${toDate})` : ""}.
            </div>
          ) : flightState.status === "error" ? (
            <div className={styles.summaryLine}>
              Could not load flights ({flightState.message}).
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
