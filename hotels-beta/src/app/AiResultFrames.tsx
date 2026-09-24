"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import HotelSmallCard, {
  sellableFirst,
  smallCardHasTopAction,
  type SmallCardAvailability,
  type SmallCardColumns,
} from "@/components/hotels/HotelSmallCard";
import RestaurantSmallCard from "@/components/restaurants/RestaurantSmallCard";
import type { HotelRecord } from "@/lib/directus";
import { buildBookingLink } from "@/lib/hotels/buildBookingLink";
import { getHotelThumbnail } from "@/lib/hotels/cardHelpers";
import SaveToTripControl, {
  HOTEL_SAVED_HINT,
  hotelSaveKey,
  type SaveToTripResult,
} from "@/components/members/SaveToTripControl";
import { addHotelToTripBrowser, addRestaurantToTripBrowser } from "@/lib/members/db";
import type { RestaurantRecord } from "@/app/restaurants/types";
import { useAiSearch } from "@/lib/ai/aiSearchStore";
import { useFavouriteIds } from "@/lib/members/favourites";
import { hotelPriceBasis } from "@/lib/priceBasis";
import { currentResidency } from "@/lib/countries";
import { guestSelectionIssue } from "@/lib/guests";
import { isStayTooLong, MAX_STAY_NIGHTS } from "@/lib/stay";
import { useAiResultRecords } from "@/lib/ai/useAiResultRecords";
import { MAX_NAMED, completeLegsForHotels, namedHotels } from "@/lib/ai/hotelGateways";
import { allHotelsHref, flightsHref, hotelsHref, restaurantsHref } from "@/lib/ai/handoff";
import { aiPanes } from "@/lib/ai/resultPanes";
import { useLandingPanes } from "./landingPanes";
import type { Itinerary } from "@/lib/flights/itinerary";
import FlightResultRow, { pickHeadlineItineraries, type TripDefaults } from "./FlightResultRow";
import type { AiFlightLeg, AiHotelCard, AiQueryState } from "@/lib/ai/types";
import { flightPassengers } from "@/lib/flights/passengers";
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
  childrenAges,
  tripDefaults,
  columns,
}: {
  leg: AiFlightLeg;
  adults: number;
  kids: number;
  /** Under-2s fly as lap infants (lib/flights/passengers.ts). */
  childrenAges: number[];
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

  /* The party and the cabin the concierge actually searched, so BOOK hands
     Trip.com the same search the cards below were priced on. `concierge-chat`
     is what the affiliate report will call a click that started here. */
  const handoff = {
    cabin: leg.cabin || "economy",
    passengers: flightPassengers(adults, kids, childrenAges),
    placement: "concierge-chat" as const,
  };
  // The ages as a string, so the search re-runs when they change and not on
  // every render (the array is rebuilt each time).
  const agesKey = childrenAges.join(",");

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
        ...flightPassengers(adults, kids, agesKey ? agesKey.split(",") : []),
        cabinClass: leg.cabin || "economy",
      }),
    })
      .then((res) => res.json())
      .then((json: { ok?: boolean; itineraries?: Itinerary[] }) => {
        if (cancelled) return;
        if (!json.ok) {
          setState({ status: "error" });
          return;
        }
        const itineraries = json.itineraries ?? [];
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
  }, [leg.origin, leg.destination, leg.departureDate, leg.returnDate, leg.cabin, adults, kids, agesKey, isOneWay]);

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
            handoff={handoff}
          />
          <FlightResultRow
            label="Fastest"
            flight={state.fastest}
            isOneWay={state.isOneWay}
            tripDefaults={tripDefaults}
            columns={columns}
            handoff={handoff}
          />
        </div>
      ) : null}
    </div>
  );
}

/* One stay's hotels: its own live prices for its own dates, and its own SAVE
 * carrying those dates into the trip. A component per stay since 2026-09-15,
 * when the landing page began showing a whole multi-stop trip at once — each
 * group under a header naming its place and dates, priced for that stay, so the
 * Atlas hotels are never priced on the Marrakech nights. A single-place answer
 * is one stay with no header, exactly as before. */
function HotelStayGroup({
  heading,
  hotels,
  from,
  to,
  query,
  columns,
  tripDefaults,
}: {
  heading: { place: string; dates: string } | null;
  hotels: AiHotelCard[];
  from: string;
  to: string;
  query: AiQueryState;
  columns: SmallCardColumns;
  tripDefaults: TripDefaults;
}) {
  const favouriteHotels = useFavouriteIds().hotels;
  const [availability, setAvailability] = useState<Record<string, SmallCardAvailability>>({});

  // Live prices, via the same batch route the structured landing summary uses.
  // Skipped without dates — a price needs a stay to be a price.
  // The visitor's passport country — their guest-selector choice via the URL,
  // else the browser locale — set in an effect so the server and first client
  // render agree. This used to be a hardcoded "gb" (§32).
  const [residency, setResidency] = useState("");
  useEffect(() => {
    setResidency(currentResidency());
  }, []);

  useEffect(() => {
    const priceable = hotels.filter(
      (h) => h.ratehawk_hid && h.ratehawk_status !== "passive"
    );
    // No price without every child's age and a party the rooms can hold —
    // nothing is defaulted (§32).
    const occupancyIssue = guestSelectionIssue(
      {
        adults: query.adults,
        kids: query.kids,
        kidAges: query.childrenAges.map(String),
      },
      Math.max(1, query.bedrooms || 1)
    );
    /* A price skipped on purpose says so, rather than leaving the card on
       "Checking availability…" for good (2026-09-24: two months in Bali). A
       stay over 30 nights reads as the Hotels page does; a party still missing
       a rooms answer or a child's age, or a hotel we cannot price, shows no
       price line. Only the residency is transient - it arrives in an effect. */
    const settled = (entry: SmallCardAvailability) =>
      setAvailability(Object.fromEntries(hotels.map((h) => [String(h.id), entry])));
    if (!from || !to) {
      setAvailability({});
      return;
    }
    if (isStayTooLong(from, to)) {
      settled({ status: "note", text: `Up to ${MAX_STAY_NIGHTS} nights` });
      return;
    }
    if (!priceable.length || occupancyIssue) {
      settled({ status: "no-id" });
      return;
    }
    if (!residency) {
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
        checkInDate: from,
        checkOutDate: to,
        adults: query.adults,
        kids: query.kids,
        childrenAges: query.childrenAges,
        rooms: query.bedrooms,
        currency: query.currency,
        residency,
      }),
    })
      .then(async (res) => {
        const json = (await res.json()) as {
          ok?: boolean;
          results?: Array<{ hid: number; headline: { pricePerStay: number; currency: string } | null }>;
        };
        if (cancelled) return;

        const next: Record<string, SmallCardAvailability> = {};
        // A hotel with nothing to price has no price line, not a spinner.
        for (const hotel of hotels) next[String(hotel.id)] = { status: "no-id" };
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
  }, [hotels, from, to, residency, query.adults, query.kids, query.bedrooms, query.currency, query.childrenAges]);

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
        stayLabel: from && to ? `${from} – ${to}` : null,
        thumbnail: getHotelThumbnail(hotel),
        checkIn: from || null,
        checkOut: to || null,
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
    [from, to]
  );

  const hotelCardParams = (name: string) => {
    const p = new URLSearchParams();
    p.set("q", name);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (query.adults > 0) p.set("adults", String(query.adults));
    if (query.kids > 0) p.set("kids", String(query.kids));
    // The room count, ages and passport country too: BOOK lands on room
    // selection, which prices exactly this party.
    if (query.bedrooms > 1) p.set("bedrooms", String(query.bedrooms));
    query.childrenAges.slice(0, 6).forEach((age, i) => {
      p.set(`kid_age_${i + 1}`, String(age));
    });
    if (residency) p.set("residency", residency);
    p.set("submitted", "1");
    return `/hotels?${p.toString()}`;
  };

  return (
    <>
      {heading ? <StayHeading place={heading.place} dates={heading.dates} /> : null}
      {/* The concierge's own ranking, with the hotels we cannot sell moved to
          the bottom (Ulrik, 2026-09-21). The sort is stable, so everything
          else keeps the order the model chose — including highlightsFirst,
          which puts the named properties ahead of the rest. A named hotel we
          cannot sell is the one case where the panel's reading order and the
          card order part company; the panel already marks it "Not available at
          myOLTRA yet", so it is findable. */}
      {sellableFirst(hotels).map((hotel) => {
        const record = hotel as unknown as HotelRecord;
        const bookingHref = bookingHrefFor(record, {
          from,
          to,
          adults: query.adults,
          kids: query.kids,
        });
        const hotelHref = hotelCardParams(hotel.hotel_name ?? "");
        return (
          <HotelSmallCard
            key={String(hotel.id)}
            hotel={record}
            isFavourite={favouriteHotels.has(String(record.id))}
            priceBasis={hotelPriceBasis(from, to, query.bedrooms)}
            href={hotelHref}
            columns={columns}
            availability={
              from && to
                ? availability[String(hotel.id)] ?? { status: "loading" }
                : { status: "idle" }
            }
            bookingHref={bookingHref}
            renderSaveControl={() => (
              <SaveToTripControl
                onSave={(tripId) => handleSaveHotel(tripId, record)}
                newTripDefaults={tripDefaults}
                savedKey={hotelSaveKey({
                  hotelId: record.id,
                  from,
                  to,
                  adults: query.adults,
                  kids: query.kids,
                  childrenAges: query.childrenAges,
                  rooms: query.bedrooms,
                })}
                savedHint={HOTEL_SAVED_HINT}
                label="SAVE"
                compact
                align="right"
                /* Condensed and block, matching the button rendered
                   inside the card so the pair is one size; stacked
                   with it only when there is one. */
                className={`oltra-btn oltra-btn--condensed oltra-btn--block${
                  smallCardHasTopAction(record, hotelHref, bookingHref)
                    ? " oltra-btn--stack-bottom"
                    : ""
                }`}
              />
            )}
          />
        );
      })}
    </>
  );
}

/** The header over one stay (or one city's restaurants): the same place-and-
 * date line the flight legs use, so the three panes read as one itinerary. */
function StayHeading({ place, dates }: { place: string; dates: string }) {
  return (
    <div className={`${styles.aiFlightLegHead} ${styles.aiStayHead}`}>
      <span className={styles.aiFlightLegRoute}>{place}</span>
      {dates ? <span className={styles.aiFlightLegDate}>{dates}</span> : null}
    </div>
  );
}

function stayDates(from: string, to: string): string {
  return from && to ? `${legDateLabel(from)} – ${legDateLabel(to)}` : "";
}

/* No props: it reads the shared store directly, so it can sit as its own frame
 * below the search panel — the same relationship LandingSummary has to it. */
export default function AiResultFrames() {
  const { results, query } = useAiSearch();
  const favouriteRestaurants = useFavouriteIds().restaurants;
  const { hotels, restaurants, loading } = useAiResultRecords();

  /* THE WHOLE TRIP, STAY BY STAY (Ulrik, 2026-09-15). An answer about several
     places carries the first in hotelIds/restaurantIds and the query's stay,
     and every later place in `laterStops`. The landing page is the one page
     that lists them all; Hotels, Flights and Restaurants show the first. */
  const laterStops = useMemo(() => results.laterStops ?? [], [results.laterStops]);
  const multiStop = laterStops.length > 0;
  const later = useAiResultRecords({
    hotelIds: laterStops.flatMap((stop) => stop.hotelIds),
    restaurantIds: laterStops.flatMap((stop) => stop.restaurantIds),
  });

  const destinationLabel =
    query.destination.city ||
    query.destination.area ||
    query.destination.adminRegion ||
    query.destination.country;

  const stays = useMemo(() => {
    const pick = <T extends { id: number | string }>(ids: number[], records: T[]) =>
      ids
        .map((id) => records.find((record) => String(record.id) === String(id)))
        .filter((record): record is T => Boolean(record));
    return [
      {
        key: "first",
        place: destinationLabel,
        from: query.from,
        to: query.to,
        hotels,
        restaurants,
      },
      ...laterStops.map((stop, index) => ({
        key: `stop-${index}-${stop.place}`,
        place: stop.place,
        from: stop.checkIn,
        to: stop.checkOut,
        hotels: pick(stop.hotelIds, later.hotels),
        restaurants: pick(stop.restaurantIds, later.restaurants),
      })),
    ];
  }, [destinationLabel, query.from, query.to, hotels, restaurants, laterStops, later.hotels, later.restaurants]);

  const lastStay = stays[stays.length - 1];
  const tripDefaults = useMemo(
    () => ({
      destination: destinationLabel || null,
      // The whole trip's span, so a new trip made from any card covers every stay.
      periodLabel:
        query.from && (lastStay.to || query.to)
          ? `${query.from} – ${lastStay.to || query.to}`
          : null,
    }),
    [destinationLabel, query.from, query.to, lastStay.to]
  );

  const handleSaveRestaurant = useCallback(
    async (tripId: string, restaurant: RestaurantRecord): Promise<SaveToTripResult> => {
      const result = await addRestaurantToTripBrowser({
        tripId,
        restaurantDirectusId: String(restaurant.id),
        name: restaurant.restaurant_name,
        location: [restaurant.local_area, restaurant.city].filter(Boolean).join(" · "),
        reservationLabel: null,
        thumbnail: "/images/hero-lp.jpg",
      });
      return {
        message: result.duplicate ? "Already in that trip." : "Saved to trip.",
      };
    },
    []
  );

  /* The flight legs to draw: the answer's own, plus one to every airport the
     hotels the panel names are reached through — the same completion the panel
     applies, so the frame and the panel list the same journeys. */
  const flightLegs = completeLegsForHotels(
    results.flights,
    namedHotels(hotels, results.highlightIds),
    MAX_NAMED,
    results.flightsForHotels && !(results.laterStops ?? []).length ? hotels : undefined
  );

  const restaurantCityGroups = (() => {
    const groups = new Map<string, RestaurantRecord[]>();
    for (const stay of stays) {
      for (const restaurant of stay.restaurants) {
        const city = restaurant.city?.trim() || stay.place || "";
        groups.set(city, [...(groups.get(city) ?? []), restaurant]);
      }
    }
    return [...groups.entries()].map(([city, list]) => ({ city, restaurants: list }));
  })();

  const totalHotels = stays.reduce((sum, stay) => sum + stay.hotels.length, 0);
  const totalRestaurants = stays.reduce((sum, stay) => sum + stay.restaurants.length, 0);
  /* The same helper LandingResults counted the row with, so the two cannot
     disagree about which panes this answer fills. */
  const { hotels: showHotels, flights: showFlights, restaurants: showRestaurants } =
    aiPanes(results);

  /* Above the early return: a hook cannot sit behind one. Null unless this
     answer is sharing a row with the structured summary, in which case the
     frame count is the WHOLE row's — a restaurants pane beside two summary
     panes is a third of the width, not all of it. */
  const panes = useLandingPanes();

  // Nothing to frame yet — the concierge panel carries the conversation.
  if (!showHotels && !showFlights && !showRestaurants) return null;

  const frameCount =
    panes?.columns ??
    (((showHotels ? 1 : 0) +
      (showFlights ? 1 : 0) +
      (showRestaurants ? 1 : 0)) as SmallCardColumns);

  const contents = panes ? ` ${styles.paneGroupContents}` : "";

  return (
    <section className={`${styles.aiResults}${contents}`}>
      {loading ? (
        <p className={`${styles.aiResultsNote}${panes ? ` ${styles.paneGroupFullRow}` : ""}`}>
          Gathering those…
        </p>
      ) : null}

      <div
        className={`${styles.aiFrameGrid}${contents}`}
        style={{ "--ai-frames": frameCount } as React.CSSProperties}
      >
        {showHotels ? (
          <div
            className={`oltra-glass oltra-panel oltra-over-image ${styles.summaryColumn} ${styles.summaryColumnWithFooter} ${styles.landingGlass}`}
          >
            <div className={styles.summaryBody}>
            <div className={styles.summaryHeaderRow}>
              <div className="oltra-label">
                {totalHotels} {totalHotels === 1 ? "hotel" : "hotels"}
                {multiStop ? " for your trip" : destinationLabel ? ` in ${destinationLabel}` : ""}
              </div>
            </div>

            <div className={styles.smallCardsList}>
              {stays
                .filter((stay) => stay.hotels.length)
                .map((stay) => (
                  <HotelStayGroup
                    key={stay.key}
                    heading={multiStop ? { place: stay.place, dates: stayDates(stay.from, stay.to) } : null}
                    hotels={stay.hotels}
                    from={stay.from}
                    to={stay.to}
                    query={query}
                    columns={frameCount}
                    tripDefaults={tripDefaults}
                  />
                ))}
            </div>
            </div>

            {/* The way on sits under what it leads to (Ulrik, 2026-09-16). */}
            <div className={styles.summaryFooter}>
              {destinationLabel && !multiStop ? (
                <Link
                  href={allHotelsHref(query)}
                  className={`oltra-btn ${styles.aiEscape}`}
                  prefetch={false}
                >
                  See all hotels in {destinationLabel}
                </Link>
              ) : null}
              <Link
                href={hotelsHref(query, results)}
                className={`oltra-btn ${styles.summaryFooterMain}`}
                prefetch={false}
              >
                Go to hotels
              </Link>
            </div>
          </div>
        ) : null}

        {showFlights ? (
          <div
            className={`oltra-glass oltra-panel oltra-over-image ${styles.summaryColumn} ${styles.summaryColumnWithFooter} ${styles.landingGlass}`}
          >
            <div className={styles.summaryBody}>
            <div className={styles.summaryHeaderRow}>
              {/* Just "Flights". Every leg block below states its own route
                  and dates, so naming the route here too printed the same
                  pair of airports twice, one line apart. */}
              <div className="oltra-label">Flights</div>
            </div>

            {/* One block per journey, stacked. With a single leg this reads
                exactly as it did before; with two it is how an open jaw gets
                shown at all. */}
            <div className={styles.aiFlightLegs}>
              {flightLegs.map((leg) => (
                <FlightLegPanel
                  key={`${leg.origin}-${leg.destination}-${leg.departureDate}-${leg.returnDate}`}
                  leg={leg}
                  adults={query.adults}
                  kids={query.kids}
                  childrenAges={query.childrenAges}
                  tripDefaults={tripDefaults}
                  columns={frameCount}
                />
              ))}
            </div>
            </div>

            <div className={styles.summaryFooter}>
              <Link
                href={flightsHref(query, results)}
                className={`oltra-btn ${styles.summaryFooterMain}`}
                prefetch={false}
              >
                Go to flights
              </Link>
            </div>
          </div>
        ) : null}

        {showRestaurants ? (
          <div
            className={`oltra-glass oltra-panel oltra-over-image ${styles.summaryColumn} ${styles.summaryColumnWithFooter} ${styles.landingGlass}`}
          >
            <div className={styles.summaryBody}>
            <div className={styles.summaryHeaderRow}>
              <div className="oltra-label">
                {totalRestaurants}{" "}
                {totalRestaurants === 1 ? "restaurant" : "restaurants"}
                {multiStop ? " for your trip" : query.destination.city ? ` in ${query.destination.city}` : ""}
              </div>
            </div>

            <div className={styles.smallCardsList}>
              {/* Under each restaurant's own city (Ulrik, 2026-09-15), not
                  under the stop: a stop named "Côte d'Azur" held Nice and
                  Cannes under one header. Trip order, then first appearance. */}
              {restaurantCityGroups.map((group) => (
                  <Fragment key={group.city}>
                    {multiStop ? <StayHeading place={group.city} dates="" /> : null}
                    {group.restaurants.map((restaurant) => (
                      <RestaurantSmallCard
                        key={String(restaurant.id)}
                        restaurant={restaurant}
                        isFavourite={favouriteRestaurants.has(String(restaurant.id))}
                        href={`/restaurants?city=${encodeURIComponent(restaurant.city ?? "")}`}
                        columns={frameCount}
                        renderSaveControl={() => (
                          <SaveToTripControl
                            onSave={(tripId) => handleSaveRestaurant(tripId, restaurant)}
                            newTripDefaults={tripDefaults}
                            /* A restaurant is saved without a date, so once
                               saved there is nothing left to change. */
                            savedKey={`restaurant|${restaurant.id}`}
                            label="SAVE"
                            compact
                            align="right"
                            className="oltra-btn oltra-btn--condensed oltra-btn--block"
                          />
                        )}
                      />
                    ))}
                  </Fragment>
                ))}
            </div>
            </div>

            {query.destination.city ? (
              <div className={styles.summaryFooter}>
                <Link
                  href={restaurantsHref(query, results.nearHotelId)}
                  className={`oltra-btn ${styles.summaryFooterMain}`}
                  prefetch={false}
                >
                  Go to restaurants
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
