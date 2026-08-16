"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { HotelRecord } from "@/lib/directus";
import type { RatehawkHeadline } from "@/lib/ratehawk/types";
import { guessResidencyFromLocale } from "@/lib/countries";
import { getAirportsForCity } from "@/lib/cityAirports";
import { buildBookingLink } from "@/lib/hotels/buildBookingLink";
import { getHotelThumbnail } from "@/lib/hotels/cardHelpers";
import {
  addFlightToTripBrowser,
  addHotelToTripBrowser,
  getMemberActionAccessBrowser,
} from "@/lib/members/db";
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
  bedrooms: number;
  hasFullStayDetails: boolean;
  hotelsHref: string;
  flightsHref: string;
  narrowSuggestion: "city" | "purpose" | null;
};

const CARD_LIMIT = 40;
const HARD_LIMIT = 50;

type SaveState = "saving" | "saved" | "duplicate" | "error" | "login";

type CabinKey = "economy" | "business";
// Short labels because they are folded into each row's own header
// ("Standard · Best price") rather than sitting on a line of their own.
const CABINS: { key: CabinKey; label: string }[] = [
  { key: "economy", label: "Standard" },
  { key: "business", label: "Business" },
];

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

// buildBookingLink returns null unless a hotel has booking_provider configured,
// and as of 2026-08-16 none of the 853 published hotels does (see CLAUDE.md
// §23 - the booking fields were never populated), so on its own it would mean
// no card ever shows a BOOK button. Falling back to the hotel's own website
// gives a real destination now, and buildBookingLink takes precedence
// automatically once those fields do get filled in.
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

function getRatehawkHid(hotel: HotelRecord): number | null {
  const raw = hotel.ratehawk_hid;
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
  bedrooms,
  hasFullStayDetails,
  hotelsHref,
  flightsHref,
  narrowSuggestion,
}: Props) {
  const showHotels = includeHotels;
  const showFlights = includeFlights;

  // A destination city can resolve to more than one relevant airport (a
  // multi-airport city like London, or an area served by several comparably
  // distant hub airports like an Alpine ski resort) - see
  // src/lib/cityAirports.ts for the selection rule (up to 3 hubs, or every
  // airport belonging to the city itself). Each candidate gets its own
  // independent search below rather than picking a single "winner", and
  // each is searched in both cabins so Best price + Fastest can be shown
  // for Standard and Business separately (up to 4 flight rows per airport).
  const candidateAirports = useMemo(() => {
    const all = getAirportsForCity(destinationCity);
    return all.filter((a) => a.iata !== origin);
  }, [destinationCity, origin]);

  const canSearchFlights =
    Boolean(origin) && Boolean(fromDate) && candidateAirports.length > 0;

  type CabinResult =
    | { status: "loading" }
    | { status: "ready"; bestPrice: Itinerary | null; fastest: Itinerary | null; isOneWay: boolean }
    | { status: "empty" }
    | { status: "error"; message: string };

  const cabinKey = (iata: string, cabin: CabinKey) => `${iata}__${cabin}`;

  const [flightResults, setFlightResults] = useState<Record<string, CabinResult>>({});

  useEffect(() => {
    if (!showFlights || !canSearchFlights) {
      setFlightResults({});
      return;
    }

    let cancelled = false;
    const isOneWay = !toDate;
    const controllers: AbortController[] = [];

    setFlightResults(
      Object.fromEntries(
        candidateAirports.flatMap((a) =>
          CABINS.map((cabin) => [cabinKey(a.iata, cabin.key), { status: "loading" } as CabinResult])
        )
      )
    );

    for (const airport of candidateAirports) {
      for (const cabin of CABINS) {
        const key = cabinKey(airport.iata, cabin.key);
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
            cabinClass: cabin.key,
          }),
        })
          .then(async (res) => {
            const json = await res.json();
            if (cancelled) return;
            if (!json.ok) {
              setFlightResults((prev) => ({
                ...prev,
                [key]: { status: "error", message: json.error || "Flight search failed" },
              }));
              return;
            }
            const itineraries = normalizeOffers(
              json.offers ?? [],
              isOneWay ? "one-way" : "return"
            );
            if (itineraries.length === 0) {
              setFlightResults((prev) => ({ ...prev, [key]: { status: "empty" } }));
              return;
            }
            const byPrice = [...itineraries].sort((a, b) => a.priceEur - b.priceEur);
            const byDuration = [...itineraries].sort((a, b) => {
              const ad = a.outbound.durationMinutes + (a.inbound?.durationMinutes ?? 0);
              const bd = b.outbound.durationMinutes + (b.inbound?.durationMinutes ?? 0);
              return ad - bd;
            });
            const bestPrice = byPrice[0] ?? null;
            const fastest =
              byDuration[0]?.id !== bestPrice?.id ? byDuration[0] ?? null : byDuration[1] ?? null;
            setFlightResults((prev) => ({
              ...prev,
              [key]: { status: "ready", bestPrice, fastest, isOneWay },
            }));
          })
          .catch((err) => {
            if (cancelled || err?.name === "AbortError") return;
            setFlightResults((prev) => ({
              ...prev,
              [key]: {
                status: "error",
                message: err instanceof Error ? err.message : "Flight search failed",
              },
            }));
          });
      }
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

  // Residency is required by the Ratehawk endpoints and is auto-detected from
  // the browser locale rather than asked for (see CLAUDE.md §39). Set in an
  // effect, not at init, so the server and first client render agree.
  const [residency, setResidency] = useState("");
  useEffect(() => {
    setResidency((prev) => prev || guessResidencyFromLocale());
  }, []);

  // Prices come from Ratehawk, matching the Hotels page (§30). This used to
  // call Agoda's batch endpoint, which is why the cards showed no prices at
  // all: the Hotels page moved to Ratehawk and these hotels are matched by
  // `ratehawk_hid`, not by the Agoda ids this page was still keying off.
  useEffect(() => {
    if (!showHotels) return;
    if (!hasFullStayDetails || !residency) {
      setAvailabilityById({});
      return;
    }
    if (visibleHotels.length === 0) {
      setAvailabilityById({});
      return;
    }

    const withIds = visibleHotels
      .map((h) => ({ directusId: String(h.id), hid: getRatehawkHid(h) }))
      .filter((x): x is { directusId: string; hid: number } => x.hid !== null);

    if (withIds.length === 0) {
      const map: Record<string, SmallCardAvailability> = {};
      for (const h of visibleHotels) map[String(h.id)] = { status: "no-id" };
      setAvailabilityById(map);
      return;
    }

    let cancelled = false;

    const initial: Record<string, SmallCardAvailability> = {};
    for (const h of visibleHotels) {
      initial[String(h.id)] = getRatehawkHid(h)
        ? { status: "loading" }
        : { status: "no-id" };
    }
    setAvailabilityById(initial);

    fetch("/api/ratehawk/availability/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hids: withIds.map((x) => x.hid),
        checkInDate: fromDate,
        checkOutDate: toDate,
        currency: "EUR",
        residency,
        adults,
        kids,
        childrenAges: [],
        rooms: bedrooms,
      }),
    })
      .then(async (res) => {
        const json = (await res.json()) as {
          ok?: boolean;
          results?: Array<{ hid: number; headline: RatehawkHeadline }>;
        };
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          const next: Record<string, SmallCardAvailability> = {};
          for (const h of visibleHotels) next[String(h.id)] = { status: "error" };
          setAvailabilityById(next);
          return;
        }
        const hidToDirectus = new Map(withIds.map((x) => [x.hid, x.directusId]));
        const next: Record<string, SmallCardAvailability> = {};
        for (const h of visibleHotels) {
          next[String(h.id)] = getRatehawkHid(h)
            ? { status: "unavailable" }
            : { status: "no-id" };
        }
        for (const r of json.results ?? []) {
          const dId = hidToDirectus.get(Number(r.hid));
          if (!dId || !r.headline) continue;
          next[dId] = {
            status: "available",
            currency: r.headline.currency,
            pricePerStay: r.headline.pricePerStay,
          };
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
  }, [
    showHotels,
    hasFullStayDetails,
    residency,
    visibleHotels,
    fromDate,
    toDate,
    adults,
    kids,
    bedrooms,
  ]);

  // Save-to-trip on both card types goes to the member's default trip
  // (getOrCreateDefaultTripIdBrowser inside the db helpers) - these are teaser
  // cards, so they deliberately don't carry the Hotels page's trip picker.
  const [isMemberLoggedIn, setIsMemberLoggedIn] = useState(false);
  const [saveState, setSaveState] = useState<Record<string, SaveState>>({});

  useEffect(() => {
    let active = true;
    getMemberActionAccessBrowser()
      .then((r) => { if (active) setIsMemberLoggedIn(r.isLoggedIn); })
      .catch(() => { if (active) setIsMemberLoggedIn(false); });
    return () => { active = false; };
  }, []);

  const markSaveState = useCallback((key: string, state: SaveState) => {
    setSaveState((prev) => ({ ...prev, [key]: state }));
    setTimeout(() => {
      setSaveState((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }, 3000);
  }, []);

  const saveLabelFor = useCallback(
    (key: string): string => {
      switch (saveState[key]) {
        case "saving": return "SAVING";
        case "saved": return "SAVED";
        case "duplicate": return "IN TRIP";
        case "error": return "RETRY";
        case "login": return "LOG IN";
        default: return "SAVE";
      }
    },
    [saveState]
  );

  const handleSaveHotel = useCallback(
    async (hotel: HotelRecord) => {
      const key = `hotel-${hotel.id}`;
      if (!isMemberLoggedIn) { markSaveState(key, "login"); return; }
      setSaveState((prev) => ({ ...prev, [key]: "saving" }));
      try {
        const result = await addHotelToTripBrowser({
          hotelDirectusId: String(hotel.id),
          name: hotel.hotel_name ?? "Hotel",
          location: [hotel.city, hotel.country].filter(Boolean).join(" · "),
          stayLabel: fromDate && toDate ? `${fromDate} – ${toDate}` : null,
          thumbnail: getHotelThumbnail(hotel),
          checkIn: fromDate || null,
          checkOut: toDate || null,
        });
        markSaveState(key, result.status === "already_exists" ? "duplicate" : "saved");
      } catch {
        markSaveState(key, "error");
      }
    },
    [isMemberLoggedIn, markSaveState, fromDate, toDate]
  );

  const handleSaveFlight = useCallback(
    async (itinerary: Itinerary) => {
      const key = `flight-${itinerary.offerId}`;
      if (!isMemberLoggedIn) { markSaveState(key, "login"); return; }
      setSaveState((prev) => ({ ...prev, [key]: "saving" }));
      try {
        const out = itinerary.outbound;
        const lastOut = out.segments[out.segments.length - 1];
        const lastIn = itinerary.inbound?.segments[itinerary.inbound.segments.length - 1];
        const result = await addFlightToTripBrowser({
          route: `${out.originCode} → ${lastOut?.destinationName || out.destinationCode}`,
          timing: `${out.segments[0]?.departIso?.slice(0, 10) ?? ""} · ${out.departTime} → ${out.arriveTime}`,
          cabin: "",
          departAt: out.segments[0]?.departIso ?? null,
          arriveAt: (lastIn ?? lastOut)?.arriveIso ?? null,
          externalFlightId: itinerary.offerId,
        });
        markSaveState(key, result.status === "already_exists" ? "duplicate" : "saved");
      } catch {
        markSaveState(key, "error");
      }
    },
    [isMemberLoggedIn, markSaveState]
  );

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

  function renderFlightRow(
    key: string,
    label: string,
    flight: Itinerary | null,
    isOneWay: boolean
  ) {
    if (!flight) return null;

    const saveKey = `flight-${flight.offerId}`;

    return (
      <div className={styles.flightDetailRow} key={key}>
        <div className={styles.flightRowLegend}>
          <span className={styles.flightLineLabel}>{label}</span>
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
          <button
            type="button"
            className={`oltra-button-secondary ${styles.flightBookButton}`}
            onClick={() => handleSaveFlight(flight)}
          >
            {saveLabelFor(saveKey)}
          </button>
        </div>
        <div className={styles.flightLegsGrid}>
          <FlightDetailCard flight={flight.outbound} />
          {!isOneWay && flight.inbound ? <FlightDetailCard flight={flight.inbound} /> : null}
        </div>
      </div>
    );
  }

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
                  bookingHref={bookingHrefFor(h, {
                    from: fromDate,
                    to: toDate,
                    adults,
                    kids,
                  })}
                  onSave={() => handleSaveHotel(h)}
                  saveLabel={saveLabelFor(`hotel-${h.id}`)}
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
              {candidateAirports.map((airport) => (
                <div className={styles.airportBlock} key={airport.iata}>
                  <div className={styles.airportBlockHeader}>
                    <span className={styles.airportBlockTitle}>
                      {airport.label} ({airport.iata})
                    </span>
                    <span className={styles.airportBlockDistance}>
                      {airport.distKm} km from {destinationCity} centre
                    </span>
                  </div>

                  {CABINS.map((cabin) => {
                    const state = flightResults[cabinKey(airport.iata, cabin.key)];

                    return (
                      // No separate cabin heading row - the cabin is folded
                      // into each row's own header ("Standard · Best price"),
                      // which is a line of vertical space saved per cabin.
                      <div className={styles.cabinGroup} key={cabin.key}>
                        {!state || state.status === "loading" ? (
                          <div className={styles.summaryLine}>
                            Searching {cabin.label.toLowerCase()} flights…
                          </div>
                        ) : state.status === "empty" ? (
                          <div className={styles.summaryLine}>
                            No {cabin.label.toLowerCase()} cabin flights found.
                          </div>
                        ) : state.status === "error" ? (
                          <div className={styles.summaryLine}>
                            Could not load {cabin.label.toLowerCase()} flights ({state.message}).
                          </div>
                        ) : (
                          <>
                            {renderFlightRow(
                              `${airport.iata}-${cabin.key}-price`,
                              `${cabin.label} · Best price`,
                              state.bestPrice,
                              state.isOneWay
                            )}
                            {renderFlightRow(
                              `${airport.iata}-${cabin.key}-fastest`,
                              `${cabin.label} · Fastest`,
                              state.fastest,
                              state.isOneWay
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
