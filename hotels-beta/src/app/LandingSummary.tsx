"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { HotelRecord } from "@/lib/directus";
import type { RatehawkHeadline } from "@/lib/ratehawk/types";
import { guessResidencyFromLocale } from "@/lib/countries";
import { getAirportsForCity } from "@/lib/cityAirports";
import { buildBookingLink } from "@/lib/hotels/buildBookingLink";
import { addHotelToTripBrowser } from "@/lib/members/db";
import { getHotelThumbnail } from "@/lib/hotels/cardHelpers";
import SaveToTripControl, {
  HOTEL_SAVED_HINT,
  hotelSaveKey,
  type SaveToTripResult,
} from "@/components/members/SaveToTripControl";
import FlightResultRow, { pickHeadlineItineraries } from "./FlightResultRow";
import type { Itinerary } from "@/lib/flights/itinerary";
import {
  factsFromDurations,
  formatJourneyMinutes,
  rankGateways,
  type GatewayFlightFacts,
  type RankedGateway,
} from "@/lib/flights/gatewayRanking";
import HotelSmallCard, {
  sellableFirst,
  smallCardHasTopAction,
  type SmallCardAvailability,
} from "@/components/hotels/HotelSmallCard";
import { useLandingPanes } from "./landingPanes";
import { flightPassengers } from "@/lib/flights/passengers";
import { useFavouriteIds } from "@/lib/members/favourites";
import { hotelPriceBasis } from "@/lib/priceBasis";
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
  // Every child's age — the page only sets hasFullStayDetails when all are
  // present, so this is never padded or defaulted.
  childrenAges: number[];
  // The passport country chosen in the guest selector, via the URL. "" when
  // the URL has none, and the browser locale fills in.
  residency: string;
  hasFullStayDetails: boolean;
  hotelsHref: string;
  flightsHref: string;
  narrowSuggestion: "city" | "purpose" | null;
};

const CARD_LIMIT = 40;
const HARD_LIMIT = 50;

type CabinKey = "economy" | "business";
// Short labels because they are folded into each row's own header
// ("Standard · Best price") rather than sitting on a line of their own.
const CABINS: { key: CabinKey; label: string }[] = [
  { key: "economy", label: "Standard" },
  { key: "business", label: "Business" },
];

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
  childrenAges,
  residency: residencyParam,
  hasFullStayDetails,
  hotelsHref,
  flightsHref,
  narrowSuggestion,
}: Props) {
  /* Null unless this summary is sharing a row with the concierge's panes.
     When it is, the concierge's answer wins the verticals it covers: two hotel
     panes side by side, one from each source, is two answers to one question
     (Ulrik, 2026-09-21). */
  const panes = useLandingPanes();
  const favouriteHotels = useFavouriteIds().hotels;
  const showHotels = includeHotels && !panes?.aiCovers.hotels;
  const showFlights = includeFlights && !panes?.aiCovers.flights;
  /* Density only. Left alone at the classic two-pane width, so a summary on
     its own renders exactly as it always has; it tightens only when a
     concierge pane joins the row and makes it three. */
  const cardColumns = panes && panes.columns >= 3 ? panes.columns : undefined;

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
    | {
        status: "ready";
        bestPrice: Itinerary | null;
        fastest: Itinerary | null;
        bestIsAlsoFastest: boolean;
        isOneWay: boolean;
        /* Every outbound found, not just the two headline rows, because the
         * gateway ranking below needs the quickest flight and the fewest stops
         * on the route - and the quickest itinerary is regularly not one of the
         * two the cards show. */
        durations: { minutes: number; stops: number }[];
      }
    | { status: "empty" }
    | { status: "error"; message: string };

  const cabinKey = (iata: string, cabin: CabinKey) => `${iata}__${cabin}`;

  const [flightResults, setFlightResults] = useState<Record<string, CabinResult>>({});
  /* Set by the search route when the offers came from Duffel's test
   * environment, which invents a nonstop on every route. The ordering below
   * would then be real drives against invented flights, so it is not applied at
   * all - the blocks stay in their curated order and nothing is labelled
   * quickest. See duffelClient.flightDataIsSynthetic. */
  const [syntheticFlights, setSyntheticFlights] = useState(false);

  // The children's ages as a string, so the flights re-search when an age
  // changes (a baby flies as a lap infant) and not on every render.
  const flightAgesKey = childrenAges.join(",");

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
            // Under-2s as lap infants, the rest at their real ages.
            ...flightPassengers(adults, kids, flightAgesKey ? flightAgesKey.split(",") : []),
            cabinClass: cabin.key,
          }),
        })
          .then(async (res) => {
            const json = await res.json();
            if (cancelled) return;
            if (json.synthetic) setSyntheticFlights(true);
            if (!json.ok) {
              setFlightResults((prev) => ({
                ...prev,
                [key]: { status: "error", message: json.error || "Flight search failed" },
              }));
              return;
            }
            const itineraries: Itinerary[] = json.itineraries ?? [];
            if (itineraries.length === 0) {
              setFlightResults((prev) => ({ ...prev, [key]: { status: "empty" } }));
              return;
            }
            const { bestPrice, fastest, bestIsAlsoFastest } =
              pickHeadlineItineraries(itineraries);
            const durations = itineraries
              .map((itinerary) => itinerary.outbound)
              .filter(Boolean)
              .map((leg) => ({ minutes: leg.durationMinutes, stops: leg.stops }));
            setFlightResults((prev) => ({
              ...prev,
              [key]: {
                status: "ready",
                bestPrice,
                fastest,
                bestIsAlsoFastest,
                isOneWay,
                durations,
              },
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
  }, [showFlights, canSearchFlights, candidateAirports, origin, fromDate, toDate, adults, kids, flightAgesKey]);

  /* THE SAME RANKING THE CONCIERGE USES, on the results this page has already
   * fetched.
   *
   * The point of item three: the concierge now weighs the flight and the
   * transfer together, and the classic page must not answer differently. It
   * costs no extra request - every candidate airport is already searched here,
   * so the durations are in hand and only the ordering changes.
   *
   * Null while any candidate is still searching, so the blocks stay in their
   * curated order until there is something real to rank on rather than
   * reshuffling as each response lands. */
  const gatewayRanking = useMemo(() => {
    if (candidateAirports.length === 0 || syntheticFlights) return null;
    const facts: Record<string, GatewayFlightFacts> = {};
    for (const airport of candidateAirports) {
      const states = CABINS.map((cabin) => flightResults[cabinKey(airport.iata, cabin.key)]);
      if (states.some((state) => !state || state.status === "loading")) return null;
      const durations = states.flatMap((state) =>
        state && state.status === "ready" ? state.durations : []
      );
      facts[airport.iata] = factsFromDurations(durations);
    }
    return rankGateways(destinationCity, facts, candidateAirports);
  }, [candidateAirports, flightResults, destinationCity, syntheticFlights]);

  /* Ordered blocks, each with its ranking if there is one. One list so the
   * header and the rows cannot disagree about which airport they describe. */
  const airportBlocks = useMemo(() => {
    if (!gatewayRanking) {
      return candidateAirports.map((airport) => ({ airport, ranked: null as RankedGateway | null }));
    }
    return gatewayRanking.ranked.flatMap((ranked) => {
      const airport = candidateAirports.find((a) => a.iata === ranked.iata);
      return airport ? [{ airport, ranked }] : [];
    });
  }, [gatewayRanking, candidateAirports]);

  const [availabilityById, setAvailabilityById] = useState<Record<string, SmallCardAvailability>>({});

  /* sellableFirst keeps the editorial order and moves the hotels we cannot
     sell to the bottom of the list (Ulrik, 2026-09-21). Applied after the
     slice, so which hotels appear is unchanged - only where they sit. */
  const visibleHotels = useMemo(
    () =>
      hotelSummary && hotelSummary.count <= CARD_LIMIT
        ? sellableFirst(hotelSummary.hotels.slice(0, CARD_LIMIT))
        : [],
    [hotelSummary]
  );

  // Residency is required by the Ratehawk endpoints. The guest's choice from
  // the guest selector wins; without one it is detected from the browser
  // locale, in an effect rather than at init so the server and first client
  // render agree.
  const [localeResidency, setLocaleResidency] = useState("");
  useEffect(() => {
    setLocaleResidency((prev) => prev || guessResidencyFromLocale());
  }, []);
  const residency = residencyParam || localeResidency;
  const childrenAgesKey = childrenAges.join(",");

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

    // Passive hotels are left out of the request - Ratehawk cannot price them
    // for any date, so the card shows "Book on website" instead
    // and asking would be pure latency.
    const withIds = visibleHotels
      .filter((h) => h.ratehawk_status !== "passive")
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
        // This used to send [], which the server silently priced as age 10.
        childrenAges: childrenAgesKey ? childrenAgesKey.split(",").map(Number) : [],
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
    childrenAgesKey,
    bedrooms,
  ]);

  // Both card types use the same SaveToTripControl as Hotels/Restaurants, so
  // the member picks (or creates) the trip. These used to write straight to
  // whatever getOrCreateDefaultTripIdBrowser returned, which saved successfully
  // but gave no indication of where the item had gone.
  const handleSaveHotel = useCallback(
    async (tripId: string, hotel: HotelRecord): Promise<SaveToTripResult> => {
      const result = await addHotelToTripBrowser({
        tripId,
        hotelDirectusId: String(hotel.id),
        name: hotel.hotel_name ?? "Hotel",
        location: [hotel.city, hotel.country].filter(Boolean).join(" · "),
        stayLabel: fromDate && toDate ? `${fromDate} – ${toDate}` : null,
        thumbnail: getHotelThumbnail(hotel),
        checkIn: fromDate || null,
        checkOut: toDate || null,
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
    [fromDate, toDate]
  );

  const tripDefaults = useMemo(
    () => ({
      destination: destinationCity || null,
      periodLabel: fromDate && toDate ? `${fromDate} – ${toDate}` : null,
    }),
    [destinationCity, fromDate, toDate]
  );

  // The row itself lives in FlightResultRow so the AI concierge renders
  // flights in exactly this frame rather than a lookalike. Book and save are
  // owned there too.
  function renderFlightRow(
    key: string,
    label: string,
    flight: Itinerary | null,
    isOneWay: boolean,
    cabin: CabinKey
  ) {
    if (!flight) return null;
    return (
      <FlightResultRow
        key={key}
        label={label}
        flight={flight}
        isOneWay={isOneWay}
        tripDefaults={tripDefaults}
        columns={cardColumns}
        /* The cabin this row was searched in — each airport is searched in
           both, so the cabin belongs to the row and not to the page. */
        handoff={{
          cabin,
          passengers: flightPassengers(adults, kids, childrenAges),
          placement: "flight-results",
        }}
      />
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
    /* display: contents while composed, so these panes become children of
       the shared grid in LandingResults rather than a second grid stacked
       under the concierge's. The class stays on the element either way, so the
       :has() rules that key on it still match. */
    <div
      className={`${styles.summaryGrid}${panes ? ` ${styles.paneGroupContents}` : ""}`}
    >
      {showHotels ? (
        <div className={`oltra-glass oltra-panel oltra-over-image ${styles.summaryColumn} ${styles.summaryColumnWithFooter} ${styles.landingGlass}`}>
          <div className={styles.summaryBody}>
          <div className={styles.summaryHeaderRow}>
            <div className="oltra-label">{hotelHeaderLabel || "Hotels"}</div>
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
                // The room count, ages and passport country too: BOOK lands
                // on room selection, which prices exactly this party.
                if (bedrooms > 1) hotelParams.set("bedrooms", String(bedrooms));
                childrenAges.slice(0, 6).forEach((age, i) => {
                  hotelParams.set(`kid_age_${i + 1}`, String(age));
                });
                if (residency) hotelParams.set("residency", residency);
                hotelParams.set("submitted", "1");
                const hotelHref = `/hotels?${hotelParams.toString()}`;
                const bookingHref = bookingHrefFor(h, {
                  from: fromDate,
                  to: toDate,
                  adults,
                  kids,
                });
                return (
                <HotelSmallCard
                  key={String(h.id)}
                  hotel={h}
                  isFavourite={favouriteHotels.has(String(h.id))}
                  priceBasis={hotelPriceBasis(fromDate, toDate, bedrooms)}
                  columns={cardColumns}
                  href={hotelHref}
                  availability={
                    hasFullStayDetails
                      ? availabilityById[String(h.id)] ?? { status: "loading" }
                      : { status: "idle" }
                  }
                  bookingHref={bookingHref}
                  renderSaveControl={() => (
                    <SaveToTripControl
                      onSave={(tripId) => handleSaveHotel(tripId, h)}
                      newTripDefaults={tripDefaults}
                      savedKey={hotelSaveKey({
                        hotelId: h.id,
                        from: fromDate,
                        to: toDate,
                        adults,
                        kids,
                        childrenAges,
                        rooms: bedrooms,
                      })}
                      savedHint={HOTEL_SAVED_HINT}
                      label="SAVE"
                      compact
                      align="right"
                      /* Condensed, matching the button the card renders above
                         it; stacked with it only when there is one. */
                      className={`oltra-btn oltra-btn--condensed oltra-btn--block${
                        smallCardHasTopAction(h, hotelHref, bookingHref)
                          ? " oltra-btn--stack-bottom"
                          : ""
                      }`}
                    />
                  )}
                />
                );
              })}
            </div>
          ) : null}
          </div>

          {/* The way on sits under what it leads to (Ulrik, 2026-09-16). */}
          <div className={styles.summaryFooter}>
            <Link
              href={hotelsHref}
              className={`oltra-btn ${styles.summaryFooterMain}`}
              prefetch={false}
            >
              Go to hotels
            </Link>
          </div>
        </div>
      ) : null}

      {showFlights ? (
        <div className={`oltra-glass oltra-panel oltra-over-image ${styles.summaryColumn} ${styles.summaryColumnWithFooter} ${styles.landingGlass}`}>
          <div className={styles.summaryBody}>
          <div className={styles.summaryHeaderRow}>
            <div className="oltra-label">Flights</div>
          </div>

          {!canSearchFlights ? (
            <div className={styles.summaryLine}>
              Please be more specific to find relevant flights
            </div>
          ) : (
            <div className={styles.flightDetailList}>
              {airportBlocks.map(({ airport, ranked }) => (
                <div className={styles.airportBlock} key={airport.iata}>
                  <div className={styles.airportBlockHeader}>
                    <span className={styles.airportBlockTitle}>
                      {airport.label} ({airport.iata})
                      {/* Only claimed when every candidate had both halves of
                          the journey, and only worth saying when there is more
                          than one airport to be quickest of. */}
                      {ranked?.recommended &&
                      gatewayRanking?.comparable &&
                      airportBlocks.length > 1 ? (
                        <span className={styles.airportBlockBest}>
                          Quickest overall
                          {ranked.totalMinutes !== null
                            ? ` · ${formatJourneyMinutes(ranked.totalMinutes)} door to door`
                            : ""}
                        </span>
                      ) : null}
                    </span>
                    <span className={styles.airportBlockDistance}>
                      {/* The road time when we have measured it, because the
                          straight-line figure this used to show is the number
                          that once answered Turin for Val d'Isere: 59km across
                          the Alps, three hours around them. */}
                      {ranked?.transferMinutes !== null && ranked?.transferMinutes !== undefined
                        ? `${formatJourneyMinutes(ranked.transferMinutes)} by road to ${destinationCity}`
                        : `${airport.distKm} km from ${destinationCity} centre`}
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
                            {/* One row when the cheapest fare is also the
                                quickest: the second repeated its times and its
                                duration for more money. */}
                            {renderFlightRow(
                              `${airport.iata}-${cabin.key}-price`,
                              `${cabin.label} · ${
                                state.bestIsAlsoFastest
                                  ? "Best price and fastest"
                                  : "Best price"
                              }`,
                              state.bestPrice,
                              state.isOneWay,
                              cabin.key
                            )}
                            {renderFlightRow(
                              `${airport.iata}-${cabin.key}-fastest`,
                              `${cabin.label} · Fastest`,
                              state.fastest,
                              state.isOneWay,
                              cabin.key
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

          <div className={styles.summaryFooter}>
            <Link
              href={flightsHref}
              className={`oltra-btn ${styles.summaryFooterMain}`}
              prefetch={false}
            >
              Go to flights
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
