"use client";

import { Fragment, forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import GuestSelector from "@/components/site/GuestSelector";
import OltraSelect from "@/components/site/OltraSelect";
import { mergeHotelFlightSearch, readHotelFlightSearch } from "@/lib/searchSession";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { addFlightToTripBrowser, getMemberActionAccessBrowser } from "@/lib/members/db";
import { type Itinerary, type FlightLeg, type AirlineRef, normalizeOffers } from "@/lib/flights/duffelNormalizer";
import { getAlliance, sharedAlliance } from "@/lib/flights/airlineAlliances";
import FlightDetailsPopup from "./FlightDetailsPopup";
import { useCurrency } from "@/lib/currency/useCurrency";
import { AIRPORT_OPTIONS } from "@/lib/airportOptions";
import AirportAutocomplete from "./AirportAutocomplete";
import DateRangePicker from "@/components/site/DateRangePicker";
import { useDropdownDismiss } from "@/lib/useDropdownDismiss";
import styles from "./FlightsView.module.css";

type PageSearchParams = Record<string, string | string[] | undefined>;
type CabinClass = "Economy" | "Premium Economy" | "Business" | "First";
type TripType = "one-way" | "return" | "multiple";

type SearchState = {
  tripType: TripType;
  from: string;
  to: string;
  departDate: string;
  returnDate: string;
  adults: number;
  children: number;
  cabin: CabinClass;
  multiCity: MultiCityLeg[];
};

type MultiCityLeg = {
  id: string;
  from: string;
  to: string;
  date: string;
};

type LegFilter = {
  maxDurationHours: number;
  departStartHour: number;
  departEndHour: number;
};

type FilterState = {
  maxStops: "any" | "direct" | "1";
  airlines: string[];
  layoverAirports: string[];
  outbound: LegFilter;
  inbound: LegFilter;
  multi: LegFilter[];
};

type Props = {
  searchParams: PageSearchParams;
};

const DEFAULT_LEG_FILTER: LegFilter = {
  maxDurationHours: 24,
  departStartHour: 8,
  departEndHour: 24,
};

const INITIAL_SEARCH: SearchState = {
  tripType: "return",
  from: "",
  to: "",
  departDate: "",
  returnDate: "",
  adults: 2,
  children: 0,
  cabin: "Economy",
  multiCity: [
    { id: "multi-1", from: "", to: "", date: "" },
    { id: "multi-2", from: "", to: "", date: "" },
    { id: "multi-3", from: "", to: "", date: "" },
  ],
};

const INITIAL_FILTERS: FilterState = {
  maxStops: "any",
  airlines: [],
  layoverAirports: [],
  outbound: DEFAULT_LEG_FILTER,
  inbound: DEFAULT_LEG_FILTER,
  multi: [DEFAULT_LEG_FILTER, DEFAULT_LEG_FILTER, DEFAULT_LEG_FILTER],
};

const CABIN_CLASS_MAP: Record<CabinClass, string> = {
  Economy: "economy",
  "Premium Economy": "premium_economy",
  Business: "business",
  First: "first",
};

function normalizeParam(v: string | string[] | undefined): string {
  if (!v) return "";
  return Array.isArray(v) ? v[0] ?? "" : v;
}

function hasFlightSearchParams(searchParams: PageSearchParams): boolean {
  return Boolean(
    normalizeParam(searchParams.q) ||
      normalizeParam(searchParams.city) ||
      normalizeParam(searchParams.country) ||
      normalizeParam(searchParams.region) ||
      normalizeParam(searchParams.from) ||
      normalizeParam(searchParams.to) ||
      normalizeParam(searchParams.adults) ||
      normalizeParam(searchParams.kids)
  );
}

function cityForCode(code: string): string {
  if (!code) return "";
  const label = AIRPORT_OPTIONS.find(o => o.value === code)?.label ?? "";
  const cityPart = label.split("·")[1]?.trim();
  return cityPart || code;
}

function resolveAirportCode(value: string): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const upper = trimmed.toUpperCase();
  if (AIRPORT_OPTIONS.some(o => o.value === upper)) return upper;
  const lower = trimmed.toLowerCase();
  for (const opt of AIRPORT_OPTIONS) {
    const cityPart = opt.label.split("·")[1]?.trim().toLowerCase() ?? "";
    if (cityPart.startsWith(lower)) return opt.value;
  }
  return "";
}

function buildInitialSearch(searchParams: PageSearchParams): SearchState {
  const saved =
    typeof window !== "undefined" && !hasFlightSearchParams(searchParams)
      ? readHotelFlightSearch()
      : null;

  const source = saved ?? searchParams;

  // Falls back to session storage (source.origin) same as the destination
  // below - previously only ever read from the URL, so the origin airport
  // silently reverted to blank on any revisit that didn't carry it as a URL
  // param (e.g. navigating back via the header "Flights" link).
  const originParam = normalizeParam(searchParams.origin) || normalizeParam(source.origin);
  const cityHandover = normalizeParam(source.city) || normalizeParam(source.q);
  const resolvedTo = cityHandover ? resolveAirportCode(cityHandover) : "";

  const cabinParam = normalizeParam(searchParams.cabin);
  const validCabins = ["Economy", "Premium Economy", "Business", "First"] as const;
  type Cabin = typeof validCabins[number];
  const cabin: Cabin = validCabins.includes(cabinParam as Cabin)
    ? (cabinParam as Cabin)
    : INITIAL_SEARCH.cabin;

  const tripTypeParam = normalizeParam(searchParams.tripType);
  const tripType = (["oneway", "return", "multiple"].includes(tripTypeParam)
    ? tripTypeParam
    : INITIAL_SEARCH.tripType) as TripType;

  return {
    ...INITIAL_SEARCH,
    tripType,
    from: originParam || "",
    to: resolvedTo,
    departDate: normalizeParam(source.from) || "",
    returnDate: normalizeParam(source.to) || "",
    adults: Number(normalizeParam(source.adults)) || INITIAL_SEARCH.adults,
    children: Number(normalizeParam(source.kids)) || INITIAL_SEARCH.children,
    cabin,
    multiCity: INITIAL_SEARCH.multiCity.map((leg, i) =>
      i === 0 ? { ...leg, from: originParam || "" } : leg
    ),
  };
}

function formatDuration(totalMinutes: number): string {
  return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
}

function getHour(time: string): number {
  return Number(time.split(":")[0] ?? 0);
}

function getLayoverAirport(leg: FlightLeg): string {
  return leg.layovers[0]?.code ?? "";
}

function legMatchesFilters(leg: FlightLeg, filters: FilterState, legFilter: LegFilter): boolean {
  if (filters.maxStops === "direct" && leg.stops !== 0) return false;
  if (filters.maxStops === "1" && leg.stops > 1) return false;
  if (leg.durationMinutes > legFilter.maxDurationHours * 60) return false;
  const hour = getHour(leg.departTime);
  if (hour < legFilter.departStartHour || hour > legFilter.departEndHour) return false;
  if (filters.airlines.length > 0 && !filters.airlines.includes(leg.airline)) return false;
  const layover = getLayoverAirport(leg);
  if (layover && filters.layoverAirports.length > 0 && !filters.layoverAirports.includes(layover)) return false;
  return true;
}

function sortTopFirst<T extends { id: string }>(items: T[], topId: string): T[] {
  if (!topId) return items;
  return [...items].sort((a, b) => (a.id === topId ? -1 : b.id === topId ? 1 : 0));
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

// departTime is always a zero-padded "HH:MM" string, so a plain string sort
// is a correct chronological (same-day) sort.
function sortByDepartTime<T extends { departTime: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.departTime.localeCompare(b.departTime));
}

// Departure/Return/each multi-city leg now scroll independently (their own
// container each), so the "does this pane's scrollbar eat into its width"
// check (which drives the header's matching right-padding) has to be
// tracked per-pane rather than once globally. `content` is whatever list is
// currently rendered in that pane - passing it as the effect's dependency
// re-runs the check whenever the pane's row count changes.
function useScrollGutter(content: unknown): [React.MutableRefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [hasGutter, setHasGutter] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setHasGutter(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    Array.from(el.children).forEach(c => ro.observe(c));
    return () => ro.disconnect();
  }, [content]);

  return [ref, hasGutter];
}

type ReturnMatchTier = "alliance" | null;

function getReturnMatchTier(outbound: FlightLeg, inbound: FlightLeg): ReturnMatchTier {
  const allCodes = [...outbound.airlines, ...inbound.airlines].map(a => a.iataCode);
  if (allCodes.length >= 2 && sharedAlliance(allCodes)) {
    const outAlliance = outbound.airlines.length ? getAlliance(outbound.airlines[0]?.iataCode) : null;
    const inAlliance = inbound.airlines.length ? getAlliance(inbound.airlines[0]?.iataCode) : null;
    if (outAlliance && outAlliance === inAlliance) return "alliance";
  }
  return null;
}

function itineraryTotalDuration(item: Itinerary, tripType: TripType): number {
  if (tripType === "one-way") return item.outbound.durationMinutes;
  if (tripType === "multiple") return item.slices.reduce((s, l) => s + l.durationMinutes, 0);
  return item.outbound.durationMinutes + (item.inbound?.durationMinutes ?? 0);
}

function getPinnedItineraries(itineraries: Itinerary[], tripType: TripType) {
  const byScore = [...itineraries].sort((a, b) => b.score - a.score);
  const byDuration = [...itineraries].sort(
    (a, b) => itineraryTotalDuration(a, tripType) - itineraryTotalDuration(b, tripType)
  );
  const recommended = byScore[0] ?? null;
  const fastest = byDuration[0]?.id !== recommended?.id ? byDuration[0] ?? null : byDuration[1] ?? null;
  return { recommended, fastest };
}

export default function FlightsView({ searchParams }: Props) {
  const [search, setSearch] = useState<SearchState>(() => buildInitialSearch(searchParams));
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);
  const [selectedOutboundId, setSelectedOutboundId] = useState("");
  const [selectedReturnId, setSelectedReturnId] = useState("");
  const [selectedMultiLegIds, setSelectedMultiLegIds] = useState<string[]>([]);
  const [itineraries, setItineraries] = useState<Itinerary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDirty, setIsDirty] = useState(true);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [detailFlight, setDetailFlight] = useState<FlightLeg | null>(null);
  const [isMemberLoggedIn, setIsMemberLoggedIn] = useState(false);
  const [saveStateByOffer, setSaveStateByOffer] = useState<Record<string, string>>({});

  const isReturnTrip = search.tripType === "return";
  const isOneWay = search.tripType === "one-way";
  const isMultiple = search.tripType === "multiple";

  const todayIso = new Date().toISOString().slice(0, 10);

  function markDirty() {
    setIsDirty(true);
    setItineraries([]);
    setSelectedOutboundId("");
    setSelectedReturnId("");
    setSelectedMultiLegIds([]);
    setSearchError(null);
  }

  useEffect(() => {
    let active = true;
    getMemberActionAccessBrowser()
      .then(r => { if (active) setIsMemberLoggedIn(r.isLoggedIn); })
      .catch(() => { if (active) setIsMemberLoggedIn(false); });
    return () => { active = false; };
  }, []);

  const getSaveLabel = useCallback((offerId: string): string => {
    const s = saveStateByOffer[offerId];
    if (s === 'saving') return 'SAVING...';
    if (s === 'saved') return 'SAVED';
    if (s === 'duplicate') return 'IN TRIP';
    if (s === 'error') return 'TRY AGAIN';
    if (s === 'login') return 'LOG IN FIRST';
    return 'SAVE';
  }, [saveStateByOffer]);

  const handleSaveToTrip = useCallback(async (offerId: string) => {
    const clearAfter = (state: string) => {
      setSaveStateByOffer(prev => ({ ...prev, [offerId]: state }));
      setTimeout(() => setSaveStateByOffer(prev => { const n = { ...prev }; delete n[offerId]; return n; }), 3000);
    };
    if (!isMemberLoggedIn) { clearAfter('login'); return; }
    const itinerary = itineraries.find(it => it.offerId === offerId);
    if (!itinerary) return;
    setSaveStateByOffer(prev => ({ ...prev, [offerId]: 'saving' }));
    try {
      const outSeg0 = itinerary.outbound.segments[0];
      const outLastSeg = itinerary.outbound.segments[itinerary.outbound.segments.length - 1];
      const inLastSeg = itinerary.inbound?.segments[itinerary.inbound.segments.length - 1];
      const route = `${itinerary.outbound.originCode} → ${outLastSeg?.destinationName || itinerary.outbound.destinationCode}`;
      const timing = `${formatDisplayDate(outSeg0?.departIso?.slice(0, 10) ?? '')} · ${itinerary.outbound.departTime} → ${itinerary.outbound.arriveTime}`;
      const result = await addFlightToTripBrowser({
        route,
        timing,
        cabin: search.cabin,
        departAt: outSeg0?.departIso ?? null,
        arriveAt: (inLastSeg ?? outLastSeg)?.arriveIso ?? null,
        externalFlightId: offerId,
      });
      clearAfter(result.status === 'already_exists' ? 'duplicate' : 'saved');
    } catch {
      clearAfter('error');
    }
  }, [isMemberLoggedIn, itineraries, search.cabin]);

  useEffect(() => {
    const originParam = normalizeParam(searchParams.origin);
    const cityHandover = normalizeParam(searchParams.city) || normalizeParam(searchParams.q);
    setSearch(current => ({
      ...current,
      from: originParam || current.from,
      to: cityHandover ? resolveAirportCode(cityHandover) : current.to,
      departDate: normalizeParam(searchParams.from) || current.departDate,
      returnDate: normalizeParam(searchParams.to) || current.returnDate,
      adults: Number(normalizeParam(searchParams.adults)) || current.adults,
      children: Number(normalizeParam(searchParams.kids)) || current.children,
      multiCity: current.multiCity.map((leg, i) =>
        i === 0 ? { ...leg, from: originParam || leg.from } : leg
      ),
    }));
  }, [searchParams]);

  const autoSearchedRef = useRef(false);

  useEffect(() => {
    const supabase = createSupabaseClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from("member_profiles")
        .select("home_airport")
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          const airport = (data as { home_airport?: string } | null)?.home_airport;
          if (!airport) return;
          setSearch(current => ({
            ...current,
            from: current.from || airport,
            multiCity: current.multiCity.map((leg, i) =>
              i === 0 ? { ...leg, from: leg.from || airport } : leg
            ),
          }));
        });
    });
  }, []);

  useEffect(() => {
    if (autoSearchedRef.current) return;
    if (normalizeParam(searchParams.include_flights) !== "1") return;
    autoSearchedRef.current = true;
    handleSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    mergeHotelFlightSearch({
      q: normalizeParam(searchParams.q),
      // Destination typed directly into this page's own AirportAutocomplete
      // (search.to) has to win over a stale/absent URL `city` param, or the
      // destination silently fails to round-trip through session storage on
      // navigation away and back (e.g. logging in, then returning via the
      // header "Flights" link).
      city: cityForCode(search.to) || normalizeParam(searchParams.city),
      country: normalizeParam(searchParams.country),
      region: normalizeParam(searchParams.region),
      from: search.departDate,
      to: isReturnTrip ? search.returnDate : "",
      adults: String(search.adults),
      kids: String(search.children),
      origin: search.from,
    });
  }, [search, searchParams, isReturnTrip]);

  const allAirlines = useMemo(
    () => [...new Set(itineraries.flatMap(item => item.slices.map(l => l.airline)))].sort(),
    [itineraries]
  );

  const layoverAirportMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const it of itineraries) {
      for (const leg of it.slices) {
        for (const lay of leg.layovers) if (lay.code) map.set(lay.code, lay.name || lay.code);
      }
    }
    return map;
  }, [itineraries]);

  const layoverAirports = useMemo(
    () => Array.from(layoverAirportMap.keys()).sort((a, b) =>
      (layoverAirportMap.get(a) ?? a).localeCompare(layoverAirportMap.get(b) ?? b)
    ),
    [layoverAirportMap]
  );

  useEffect(() => {
    if (!allAirlines.length) return;
    setFilters(current => {
      if (current.airlines.length) return current;
      return { ...current, airlines: allAirlines, layoverAirports };
    });
  }, [allAirlines, layoverAirports]);


  const filteredItineraries = useMemo(() => {
    return itineraries
      .filter(item => {
        if (isMultiple) {
          return item.slices.every((leg, i) =>
            legMatchesFilters(leg, filters, filters.multi[i] ?? DEFAULT_LEG_FILTER)
          );
        }
        const outOk = legMatchesFilters(item.outbound, filters, filters.outbound);
        if (isOneWay || !item.inbound) return outOk;
        return outOk && legMatchesFilters(item.inbound, filters, filters.inbound);
      })
      .sort((a, b) => b.score - a.score);
  }, [filters, itineraries, isOneWay, isMultiple]);

  const { recommended, fastest } = useMemo(
    () => getPinnedItineraries(filteredItineraries, search.tripType),
    [filteredItineraries, search.tripType]
  );

  const pinnedIds = useMemo(
    () => new Set([recommended?.id, fastest?.id].filter(Boolean) as string[]),
    [recommended, fastest]
  );

  const standardItineraries = useMemo(
    () => filteredItineraries.filter(item => !pinnedIds.has(item.id)),
    [filteredItineraries, pinnedIds]
  );

  // Sourced from the full filtered set (not standardItineraries), so a
  // Top pick / Fastest itinerary's own departure or return leg - which may
  // not exist under any other, non-pinned itinerary - stays selectable and
  // doesn't get silently cleared by the "still valid?" effect below.
  const outboundOptions = useMemo(
    () => sortByDepartTime(dedupeById(filteredItineraries.map(item => item.outbound))),
    [filteredItineraries]
  );

  // Leg ids already carried by at least one non-pinned itinerary - used to
  // keep the plain scrollable list free of rows that would otherwise only
  // be there because a pinned (Top pick / Fastest) itinerary uses that leg.
  const standardOutboundLegIds = useMemo(
    () => new Set(standardItineraries.map(item => item.outbound.id)),
    [standardItineraries]
  );

  const itineraryByOutboundId = useMemo(() => {
    const map = new Map<string, Itinerary>();
    for (const it of filteredItineraries) {
      if (!map.has(it.outbound.id)) map.set(it.outbound.id, it);
    }
    return map;
  }, [filteredItineraries]);

  useEffect(() => {
    if (!outboundOptions.length) { setSelectedOutboundId(""); return; }
    if (outboundOptions.some(f => f.id === selectedOutboundId)) return;
    setSelectedOutboundId("");
  }, [outboundOptions, selectedOutboundId]);

  const visibleReturnItineraries = useMemo(() => {
    if (!selectedOutboundId) return [];
    return filteredItineraries.filter(item => item.outbound.id === selectedOutboundId);
  }, [selectedOutboundId, filteredItineraries]);

  // Remembers the physical return flight (by its leg fingerprint, not the
  // offer id, which is specific to one outbound+inbound pairing) so that
  // switching to a different but still-compatible departure can re-select
  // the equivalent itinerary instead of always blanking the return choice.
  const lastReturnLegIdRef = useRef<string>("");

  useEffect(() => {
    // Preserve the previously-selected return flight if it's still
    // compatible with the newly-selected departure; otherwise auto-select
    // the sole compatible return (nothing to choose between) or clear.
    setSelectedReturnId(() => {
      const preserved = lastReturnLegIdRef.current
        ? visibleReturnItineraries.find(it => it.inbound?.id === lastReturnLegIdRef.current)
        : undefined;
      if (preserved) return preserved.id;
      if (visibleReturnItineraries.length === 1) return visibleReturnItineraries[0].id;
      return "";
    });
  }, [visibleReturnItineraries]);

  const selectedOutboundLeg = useMemo(
    () => outboundOptions.find(f => f.id === selectedOutboundId) ?? null,
    [outboundOptions, selectedOutboundId]
  );

  const selectedReturnItinerary = useMemo(
    () => selectedReturnId ? visibleReturnItineraries.find(it => it.id === selectedReturnId) ?? null : null,
    [selectedReturnId, visibleReturnItineraries]
  );

  const selectedReturnLeg = useMemo(
    () => selectedReturnItinerary?.inbound ?? null,
    [selectedReturnItinerary]
  );

  useEffect(() => {
    if (selectedReturnLeg) lastReturnLegIdRef.current = selectedReturnLeg.id;
  }, [selectedReturnLeg]);

  const selectedFullItinerary = useMemo(() => {
    if (!selectedOutboundId) return null;
    if (isOneWay) return itineraryByOutboundId.get(selectedOutboundId) ?? null;
    return selectedReturnItinerary;
  }, [selectedOutboundId, isOneWay, itineraryByOutboundId, selectedReturnItinerary]);

  // Departure pane (also used as the single pane for one-way) and the
  // Return+Price pane now scroll independently, so each tracks its own
  // scrollbar-gutter state for its own header's padding.
  const [departureScrollRef, departureHasGutter] = useScrollGutter(outboundOptions);
  const [returnScrollRef, returnHasGutter] = useScrollGutter(visibleReturnItineraries);

  // Cheapest full itinerary containing each departure, across every
  // compatible return - Duffel has no standalone per-slice price on a
  // return-trip offer (see CLAUDE.md §7B), so this "from €X" is the closest
  // real equivalent, shown inline on each departure card.
  const departureFromPriceMap = useMemo(() => {
    const map = new Map<string, { priceEur: number; currency: string }>();
    if (isOneWay || isMultiple) return map;
    for (const it of filteredItineraries) {
      const existing = map.get(it.outbound.id);
      if (!existing || it.priceEur < existing.priceEur) {
        map.set(it.outbound.id, { priceEur: it.priceEur, currency: it.currency });
      }
    }
    return map;
  }, [filteredItineraries, isOneWay, isMultiple]);

  const canSearch = useMemo(() => {
    if (isMultiple) {
      return search.multiCity.every(l => l.from && l.to && l.date) && search.adults > 0;
    }
    if (!search.from || !search.to || !search.departDate || search.adults < 1) return false;
    if (isReturnTrip && !search.returnDate) return false;
    return true;
  }, [isMultiple, isReturnTrip, search]);

  const handleSearch = useCallback(async () => {
    if (isMultiple) {
      const valid = search.multiCity.every(l => l.from && l.to && l.date);
      if (!valid) return;
    } else {
      if (!search.from || !search.to) return;
    }
    setIsLoading(true);
    setIsDirty(false);
    setSearchError(null);
    setSelectedOutboundId("");
    setSelectedReturnId("");
    setSelectedMultiLegIds([]);
    setItineraries([]);
    lastReturnLegIdRef.current = "";
    setFilters(f => ({ ...f, airlines: [], layoverAirports: [] }));
    try {
      const requestBody = isMultiple
        ? {
            slices: search.multiCity.map(l => ({ origin: l.from, destination: l.to, departureDate: l.date })),
            adults: search.adults,
            children: search.children,
            cabinClass: CABIN_CLASS_MAP[search.cabin],
          }
        : {
            origin: search.from,
            destination: search.to,
            departureDate: search.departDate,
            returnDate: isReturnTrip ? search.returnDate : undefined,
            adults: search.adults,
            children: search.children,
            cabinClass: CABIN_CLASS_MAP[search.cabin],
          };

      const res = await fetch("/api/flights/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setSearchError(data.error ?? "Search failed");
      } else {
        const normalized = normalizeOffers(data.offers ?? [], search.tripType);
        setItineraries(normalized);
        if (!normalized.length) setSearchError("No flights found for this route and date.");
      }
    } catch {
      setSearchError("Could not reach the flights service. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [search, isReturnTrip, isMultiple]);

  const handleBook = useCallback(async (offerId: string) => {
    try {
      const res = await fetch("/api/flights/book-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId }),
      });
      const data = await res.json();
      if (data.ok && data.url) {
        window.open(data.url, "_blank", "noopener");
      } else {
        console.error("[book-link]", data.error);
      }
    } catch {
      console.error("[book-link] network error");
    }
  }, []);

  function toggleAirline(airline: string) {
    setFilters(current => ({
      ...current,
      airlines: current.airlines.includes(airline)
        ? current.airlines.filter(v => v !== airline)
        : [...current.airlines, airline],
    }));
  }

  function toggleLayoverAirport(airport: string) {
    setFilters(current => ({
      ...current,
      layoverAirports: current.layoverAirports.includes(airport)
        ? current.layoverAirports.filter(v => v !== airport)
        : [...current.layoverAirports, airport],
    }));
  }

  function updateLegFilter(key: "outbound" | "inbound", patch: Partial<LegFilter>) {
    setFilters(current => ({ ...current, [key]: { ...current[key], ...patch } }));
  }

  function updateMultiLegFilter(index: number, patch: Partial<LegFilter>) {
    setFilters(current => ({
      ...current,
      multi: current.multi.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));
  }

  function setTripType(tripType: TripType) {
    setSearch(current => {
      if (tripType === "multiple") {
        const fromCity = current.from;
        return {
          ...current,
          tripType,
          multiCity: [
            { id: "multi-1", from: fromCity, to: "", date: "" },
            { id: "multi-2", from: "", to: "", date: "" },
            { id: "multi-3", from: "", to: "", date: "" },
          ],
        };
      }
      return { ...current, tripType };
    });
    markDirty();
    if (tripType === "multiple") {
      setFilters(current => ({
        ...current,
        multi: [DEFAULT_LEG_FILTER, DEFAULT_LEG_FILTER, DEFAULT_LEG_FILTER],
      }));
    }
  }

  function updateMultiCityLeg(id: string, patch: Partial<MultiCityLeg>) {
    setSearch(current => {
      const index = current.multiCity.findIndex(leg => leg.id === id);
      if (index === -1) return current;
      let newLegs = current.multiCity.map((leg, i) => {
        if (i === index) return { ...leg, ...patch };
        if (i === index + 1 && "to" in patch && !leg.from) return { ...leg, from: patch.to ?? "" };
        return leg;
      });
      if ("date" in patch && patch.date) {
        newLegs = newLegs.map((leg, i) =>
          i > index && leg.date && leg.date < patch.date! ? { ...leg, date: "" } : leg
        );
      }
      return { ...current, multiCity: newLegs };
    });
    markDirty();
  }

  function addMultiCityLeg() {
    if (search.multiCity.length >= 5) return;
    const lastLeg = search.multiCity[search.multiCity.length - 1];
    setSearch(current => ({
      ...current,
      multiCity: [...current.multiCity, { id: `multi-${Date.now()}`, from: lastLeg?.to ?? "", to: "", date: "" }],
    }));
    setFilters(current => ({
      ...current,
      multi: [...current.multi, DEFAULT_LEG_FILTER].slice(0, 5),
    }));
    markDirty();
  }

  function deleteLastMultiCityLeg() {
    setSearch(current => {
      const newLegs = current.multiCity.slice(0, -1);
      if (!newLegs.length) return current;
      const newTripType: TripType = newLegs.length <= 1 ? "one-way" : "multiple";
      return { ...current, multiCity: newLegs, tripType: newTripType };
    });
    setFilters(current => ({ ...current, multi: current.multi.slice(0, -1) }));
    markDirty();
  }

  const multiActiveLegIndex = isMultiple ? selectedMultiLegIds.length : 0;

  // Per-column options: column k shows unique slices[k] from itineraries matching selections 0..k-1
  const multiAllLegOptions = useMemo(() => {
    if (!isMultiple) return [];
    return search.multiCity.map((_, k) => {
      if (k > selectedMultiLegIds.length) return [];
      const prevSelections = selectedMultiLegIds.slice(0, k);
      const matching = filteredItineraries.filter(it =>
        prevSelections.every((legId, i) => it.slices[i]?.id === legId)
      );
      return sortByDepartTime(dedupeById(matching.map(it => it.slices[k]).filter((l): l is FlightLeg => Boolean(l))));
    });
  }, [filteredItineraries, selectedMultiLegIds, isMultiple, search.multiCity]);

  // Price map for the currently active column (cheapest full itinerary per option)
  const multiOptionPriceMap = useMemo(() => {
    const activeOptions = multiAllLegOptions[multiActiveLegIndex] ?? [];
    const map = new Map<string, { priceEur: number; currency: string }>();
    for (const option of activeOptions) {
      const candidates = filteredItineraries.filter(it => {
        return (
          selectedMultiLegIds.every((legId, i) => it.slices[i]?.id === legId) &&
          it.slices[multiActiveLegIndex]?.id === option.id
        );
      });
      if (!candidates.length) continue;
      const best = candidates.reduce((a, b) => (a.priceEur < b.priceEur ? a : b));
      map.set(option.id, { priceEur: best.priceEur, currency: best.currency });
    }
    return map;
  }, [multiAllLegOptions, multiActiveLegIndex, filteredItineraries, selectedMultiLegIds]);

  // Final itinerary when all legs are selected
  const multiSelectedItinerary = useMemo(() => {
    if (!isMultiple || multiActiveLegIndex < search.multiCity.length) return null;
    return filteredItineraries.find(it =>
      selectedMultiLegIds.every((legId, i) => it.slices[i]?.id === legId)
    ) ?? null;
  }, [isMultiple, multiActiveLegIndex, search.multiCity.length, filteredItineraries, selectedMultiLegIds]);

  useEffect(() => {
    if (!isMultiple) return;
    setSelectedMultiLegIds(current => {
      if (!current.length) return current;
      if (!filteredItineraries.length) return [];
      const isValid = filteredItineraries.some(it =>
        current.every((legId, i) => it.slices[i]?.id === legId)
      );
      return isValid ? current : [];
    });
  }, [filteredItineraries, isMultiple]);

  return (
    <section className={styles.page}>
      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <div className={`${styles.searchPanel} oltra-glass oltra-panel`}>
            <div className={styles.sectionStack}>
              <div className={styles.tripTypeTabs}>
                {([["one-way", "One-way"], ["return", "Return"], ["multiple", "Multiple"]] as const).map(
                  ([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setTripType(value)}
                      className={[
                        "oltra-button-secondary",
                        search.tripType === value ? styles.segmentButtonActive : "",
                      ].join(" ")}
                    >
                      {label}
                    </button>
                  )
                )}
              </div>

              {isMultiple ? (
                <div className={styles.multiCityStack}>
                  {search.multiCity.map((leg, index) => {
                    const prevDate = index > 0 ? search.multiCity[index - 1]?.date : undefined;
                    const minLegDate = prevDate ?? todayIso;
                    return (
                      <div key={leg.id} className={styles.multiCityRow}>
                        <AirportAutocomplete
                          label={`From ${index + 1}`}
                          value={leg.from}
                          onChange={v => updateMultiCityLeg(leg.id, { from: v })}
                        />
                        <AirportAutocomplete
                          label="To"
                          value={leg.to}
                          onChange={v => updateMultiCityLeg(leg.id, { to: v })}
                        />
                        <DateField
                          label="Date"
                          value={leg.date}
                          min={minLegDate}
                          onChange={v => updateMultiCityLeg(leg.id, { date: v })}
                        />
                      </div>
                    );
                  })}
                  <div className={styles.multiCityButtons}>
                    <button
                      type="button"
                      className={search.multiCity.length < 5 ? "oltra-button-primary" : "oltra-button-secondary"}
                      onClick={addMultiCityLeg}
                      disabled={search.multiCity.length >= 5}
                    >
                      Add flight
                    </button>
                    <button
                      type="button"
                      className={search.multiCity.length > 1 ? "oltra-button-primary" : "oltra-button-secondary"}
                      onClick={deleteLastMultiCityLeg}
                      disabled={search.multiCity.length <= 1}
                    >
                      Delete flight
                    </button>
                  </div>
                </div>
              ) : (
                <div className={styles.fieldGrid}>
                  <AirportAutocomplete
                    label="From"
                    value={search.from}
                    onChange={v => { setSearch(c => ({ ...c, from: v })); markDirty(); }}
                  />
                  <AirportAutocomplete
                    label="To"
                    value={search.to}
                    onChange={v => { setSearch(c => ({ ...c, to: v })); markDirty(); }}
                  />
                  {isReturnTrip ? (
                    <div className={styles.fieldGridSpan2}>
                      <DateRangePicker
                        fromValue={search.departDate}
                        toValue={search.returnDate}
                        fromMinDate={todayIso}
                        onFromChange={v => { setSearch(c => ({ ...c, departDate: v })); markDirty(); }}
                        onToChange={v => { setSearch(c => ({ ...c, returnDate: v })); markDirty(); }}
                      />
                    </div>
                  ) : (
                    <DateField
                      label="Depart"
                      value={search.departDate}
                      min={todayIso}
                      onChange={v => { setSearch(c => ({ ...c, departDate: v })); markDirty(); }}
                    />
                  )}
                </div>
              )}

              <div className={styles.guestCabinGrid}>
                <div>
                  <label className="oltra-label">Guests</label>
                  <GuestSelector
                    initialValue={{ adults: search.adults, kids: search.children, kidAges: [] }}
                    onChange={selection => {
                      setSearch(c => ({ ...c, adults: selection.adults, children: selection.kids }));
                      markDirty();
                    }}
                  />
                </div>
                <div>
                  <label className="oltra-label">Cabin</label>
                  <OltraSelect
                    name="cabin"
                    value={search.cabin}
                    placeholder="Cabin"
                    align="left"
                    onValueChange={v => { setSearch(c => ({ ...c, cabin: v as CabinClass })); markDirty(); }}
                    options={["Economy", "Premium Economy", "Business", "First"].map(v => ({ value: v, label: v }))}
                  />
                </div>
              </div>

              <button
                type="button"
                className={isDirty && canSearch ? "oltra-button-primary" : "oltra-button-secondary"}
                onClick={handleSearch}
                disabled={isLoading || !canSearch}
              >
                {isLoading ? "Searching…" : "Search"}
              </button>
            </div>
          </div>

          <div className="oltra-glass oltra-panel">
            <div className={styles.sectionStack}>
              <SelectField
                label="Stops"
                value={filters.maxStops}
                onChange={v => setFilters(c => ({ ...c, maxStops: v as FilterState["maxStops"] }))}
                options={["any", "direct", "1"]}
                labels={{ any: "Any", direct: "Direct only", "1": "Max 1 stop" }}
              />

              {isMultiple ? (
                search.multiCity.map((leg, index) => (
                  <div key={`filters-${leg.id}`} className={styles.legFilterBlock}>
                    <div className={styles.legFilterTitle}>Flight {index + 1}</div>
                    <div className={styles.legFilterTimeGroup}>
                      <DurationFilter
                        label="Max duration"
                        value={filters.multi[index]?.maxDurationHours ?? 20}
                        onChange={v => updateMultiLegFilter(index, { maxDurationHours: v })}
                      />
                      <TimeIntervalFilter
                        label="Departure time"
                        value={filters.multi[index] ?? DEFAULT_LEG_FILTER}
                        onChange={patch => updateMultiLegFilter(index, patch)}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <div className={styles.legFilterTimeGroup}>
                  <div className={styles.legFilterSubGroup}>
                    <DurationFilter
                      label="Departure max duration"
                      value={filters.outbound.maxDurationHours}
                      onChange={v => updateLegFilter("outbound", { maxDurationHours: v })}
                    />
                    {isReturnTrip ? (
                      <DurationFilter
                        label="Return max duration"
                        value={filters.inbound.maxDurationHours}
                        onChange={v => updateLegFilter("inbound", { maxDurationHours: v })}
                      />
                    ) : null}
                  </div>

                  <div className={styles.legFilterSubGroup}>
                    <TimeIntervalFilter
                      label="Departure time"
                      value={filters.outbound}
                      onChange={patch => updateLegFilter("outbound", patch)}
                    />
                    {isReturnTrip ? (
                      <TimeIntervalFilter
                        label="Return time"
                        value={filters.inbound}
                        onChange={patch => updateLegFilter("inbound", patch)}
                      />
                    ) : null}
                  </div>
                </div>
              )}

              {allAirlines.length > 0 && (
                <MultiSelectDropdown
                  label="Airlines"
                  items={allAirlines}
                  selected={filters.airlines}
                  onToggle={toggleAirline}
                />
              )}

              {layoverAirports.length > 0 && (
                <MultiSelectDropdown
                  label="Lay-over airports"
                  items={layoverAirports}
                  selected={filters.layoverAirports}
                  onToggle={toggleLayoverAirport}
                  labelMap={layoverAirportMap}
                />
              )}
            </div>
          </div>
        </aside>

        <div className="oltra-glass oltra-panel">
          <div className={styles.resultsStack}>
            <div className={styles.resultsMeta}>
              <div className={styles.route}>
                {isMultiple ? (
                  "Multi-city itinerary"
                ) : (() => {
                  const fromCity = cityForCode(search.from) || search.from;
                  const toCity = cityForCode(search.to) || search.to;
                  const hasFrom = Boolean(search.from);
                  const hasTo = Boolean(search.to);
                  if (!hasFrom && !hasTo) return isReturnTrip ? "Return trip" : "One-way trip";
                  const showOutbound = hasFrom;
                  const showInbound = isReturnTrip && hasTo;
                  return (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3em" }}>
                      <span>{fromCity}</span>
                      {(showOutbound || showInbound) ? (
                        <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", lineHeight: 0.75, fontSize: "0.62em", opacity: 0.85, margin: "0 0.05em", fontWeight: 900 }}>
                          {showInbound && <span>←</span>}
                          {showOutbound && <span>→</span>}
                        </span>
                      ) : null}
                      <span>{toCity}</span>
                    </span>
                  );
                })()}
              </div>
            </div>

            {searchError && (
              <div className="oltra-output" style={{ color: "var(--oltra-accent, #f87171)", padding: "12px 0" }}>
                {searchError}
              </div>
            )}

            {!isLoading && itineraries.length > 0 && (
              isMultiple ? (
                <div className={styles.multiResultsScoped}>
                  <MultipleResults
                    searchLegs={search.multiCity}
                    activeLegIndex={multiActiveLegIndex}
                    allLegOptions={multiAllLegOptions}
                    selectedLegIds={selectedMultiLegIds}
                    optionPriceMap={multiOptionPriceMap}
                    selectedItinerary={multiSelectedItinerary}
                    recommended={recommended}
                    fastest={fastest}
                    onSelectLeg={(col, legId) => setSelectedMultiLegIds(prev => [...prev.slice(0, col), legId])}
                    onBook={handleBook}
                    onInfo={setDetailFlight}
                    onSave={handleSaveToTrip}
                    getSaveLabel={getSaveLabel}
                  />
                </div>
              ) : isOneWay ? (
                <>
                  <div className={`${styles.columnLabel} ${styles.paneHeader} ${departureHasGutter ? styles.withScrollGutter : ""}`}>
                    Departure
                  </div>

                  <div className={styles.pinnedStack}>
                    {fastest ? (
                      <PinnedRow
                        label="Fastest"
                        itinerary={fastest}
                        oneWay
                        selectedOutboundId={selectedOutboundId}
                        selectedReturnId={selectedReturnId}
                        visibleReturnItineraries={visibleReturnItineraries}
                        departureHasGutter={departureHasGutter}
                        returnHasGutter={returnHasGutter}
                        onSelectOutbound={setSelectedOutboundId}
                        onSelectReturn={setSelectedReturnId}
                        onBook={handleBook}
                        onInfo={setDetailFlight}
                        onSave={handleSaveToTrip}
                        getSaveLabel={getSaveLabel}
                      />
                    ) : null}
                    {recommended ? (
                      <PinnedRow
                        label="Best price"
                        itinerary={recommended}
                        oneWay
                        selectedOutboundId={selectedOutboundId}
                        selectedReturnId={selectedReturnId}
                        visibleReturnItineraries={visibleReturnItineraries}
                        departureHasGutter={departureHasGutter}
                        returnHasGutter={returnHasGutter}
                        onSelectOutbound={setSelectedOutboundId}
                        onSelectReturn={setSelectedReturnId}
                        onBook={handleBook}
                        onInfo={setDetailFlight}
                        onSave={handleSaveToTrip}
                        getSaveLabel={getSaveLabel}
                      />
                    ) : null}
                    {selectedOutboundLeg ? (
                      <SelectedRow
                        outbound={selectedOutboundLeg}
                        inbound={selectedReturnLeg}
                        itinerary={selectedFullItinerary}
                        oneWay
                        departureHasGutter={departureHasGutter}
                        returnHasGutter={returnHasGutter}
                        onBook={handleBook}
                        onInfo={setDetailFlight}
                        onSave={handleSaveToTrip}
                        getSaveLabel={getSaveLabel}
                      />
                    ) : null}
                  </div>

                  <div className={styles.resultsScroll} ref={departureScrollRef}>
                    <div className={styles.cardStack}>
                      {(() => {
                        const displayedOutbound = sortTopFirst(outboundOptions, selectedOutboundId)
                          .filter(f => f.id !== selectedOutboundId && standardOutboundLegIds.has(f.id));
                        if (!displayedOutbound.length) {
                          return <div className={styles.emptyHint}>No departure flights match the selected filters.</div>;
                        }
                        return displayedOutbound.map(flight => {
                          const it = itineraryByOutboundId.get(flight.id);
                          return (
                            <div
                              key={flight.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => setSelectedOutboundId(flight.id)}
                              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") setSelectedOutboundId(flight.id); }}
                              className={`${styles.selectCard} ${styles.selectCardRow}`}
                            >
                              <FlightCardContent flight={flight} onInfo={setDetailFlight} />
                              {it ? <InlinePrice priceEur={it.priceEur} currency={it.currency} showFrom={false} /> : null}
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className={styles.splitPanes}>
                    <div className={`${styles.columnLabel} ${styles.paneHeader} ${departureHasGutter ? styles.withScrollGutter : ""}`}>
                      Departure
                    </div>
                    <div className={`${styles.columnHeadersOneWay} ${returnHasGutter ? styles.withScrollGutter : ""}`}>
                      <div className={styles.columnLabel}>Return</div>
                      <div className={`${styles.columnLabel} ${styles.columnLabelRight}`}>Total price</div>
                    </div>
                  </div>

                  <div className={styles.pinnedStack}>
                    {fastest ? (
                      <PinnedRow
                        label="Fastest"
                        itinerary={fastest}
                        oneWay={false}
                        selectedOutboundId={selectedOutboundId}
                        selectedReturnId={selectedReturnId}
                        visibleReturnItineraries={visibleReturnItineraries}
                        departureHasGutter={departureHasGutter}
                        returnHasGutter={returnHasGutter}
                        onSelectOutbound={setSelectedOutboundId}
                        onSelectReturn={setSelectedReturnId}
                        onBook={handleBook}
                        onInfo={setDetailFlight}
                        onSave={handleSaveToTrip}
                        getSaveLabel={getSaveLabel}
                      />
                    ) : null}
                    {recommended ? (
                      <PinnedRow
                        label="Best price"
                        itinerary={recommended}
                        oneWay={false}
                        selectedOutboundId={selectedOutboundId}
                        selectedReturnId={selectedReturnId}
                        visibleReturnItineraries={visibleReturnItineraries}
                        departureHasGutter={departureHasGutter}
                        returnHasGutter={returnHasGutter}
                        onSelectOutbound={setSelectedOutboundId}
                        onSelectReturn={setSelectedReturnId}
                        onBook={handleBook}
                        onInfo={setDetailFlight}
                        onSave={handleSaveToTrip}
                        getSaveLabel={getSaveLabel}
                      />
                    ) : null}
                    {selectedOutboundLeg ? (
                      <SelectedRow
                        outbound={selectedOutboundLeg}
                        inbound={selectedReturnLeg}
                        itinerary={selectedFullItinerary}
                        oneWay={false}
                        departureHasGutter={departureHasGutter}
                        returnHasGutter={returnHasGutter}
                        onBook={handleBook}
                        onInfo={setDetailFlight}
                        onSave={handleSaveToTrip}
                        getSaveLabel={getSaveLabel}
                      />
                    ) : null}
                  </div>

                  <div className={styles.splitPanes}>
                    {/* Departure pane - its own scroll, own "from €X" price per card */}
                    <div className={styles.resultsScroll} ref={departureScrollRef}>
                      <div className={styles.cardStack}>
                        {(() => {
                          const displayedOutbound = sortTopFirst(outboundOptions, selectedOutboundId)
                            .filter(f => f.id !== selectedOutboundId && standardOutboundLegIds.has(f.id));
                          if (!displayedOutbound.length) {
                            return <div className={styles.emptyHint}>No departure flights match the selected filters.</div>;
                          }
                          return displayedOutbound.map(flight => {
                            const price = departureFromPriceMap.get(flight.id);
                            return (
                              <div
                                key={flight.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => setSelectedOutboundId(flight.id)}
                                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") setSelectedOutboundId(flight.id); }}
                                className={`${styles.selectCard} ${styles.selectCardRow}`}
                              >
                                <FlightCardContent flight={flight} onInfo={setDetailFlight} />
                                {price ? <InlinePrice priceEur={price.priceEur} currency={price.currency} showFrom /> : null}
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>

                    {/* Return + Total price pane - its own scroll, unchanged pairing */}
                    <div className={`${styles.resultsScroll} ${styles.resultsScrollSpan2}`} ref={returnScrollRef}>
                      <div className={styles.resultsGridOneWay}>
                        {(() => {
                          const displayedReturn = sortTopFirst(visibleReturnItineraries, selectedReturnId)
                            .filter(it => it.id !== selectedReturnId && !pinnedIds.has(it.id));
                          return (
                            <>
                              <div className={styles.columnBox}>
                                <div className={styles.cardStack}>
                                  {!selectedOutboundId ? (
                                    <div className={styles.emptyHint}>Select a departure flight to see return options.</div>
                                  ) : displayedReturn.length ? (
                                    displayedReturn.map(item => {
                                      const tier = item.inbound && selectedOutboundLeg
                                        ? getReturnMatchTier(selectedOutboundLeg, item.inbound)
                                        : null;
                                      const matchClass = tier === "alliance" ? styles.selectCardMatchWeak : "";
                                      return (
                                        <div
                                          key={item.id}
                                          role="button"
                                          tabIndex={0}
                                          onClick={() => setSelectedReturnId(item.id)}
                                          onKeyDown={e => { if (e.key === "Enter" || e.key === " ") setSelectedReturnId(item.id); }}
                                          className={`${styles.selectCard} ${matchClass}`}
                                        >
                                          {item.inbound ? <FlightCardContent flight={item.inbound} matchTier={tier} onInfo={setDetailFlight} /> : null}
                                        </div>
                                      );
                                    })
                                  ) : !visibleReturnItineraries.length ? (
                                    <div className={styles.emptyHint}>No compatible return flights found.</div>
                                  ) : visibleReturnItineraries.length === 1 ? (
                                    <div className={styles.emptyHint}>No other return flights match the selected departure flight.</div>
                                  ) : null}
                                </div>
                              </div>

                              <div className={styles.priceColumn}>
                                <div className={styles.cardStack}>
                                  {selectedOutboundId
                                    ? displayedReturn.map(it => (
                                        <PriceCard
                                          key={it.id}
                                          itinerary={it}
                                          onBook={handleBook}
                                          priceOnly
                                        />
                                      ))
                                    : null}
                                </div>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </>
              )
            )}
          </div>
        </div>
      </div>
      {detailFlight ? (
        <FlightDetailsPopup flight={detailFlight} onClose={() => setDetailFlight(null)} />
      ) : null}
    </section>
  );
}

function formatDisplayDate(value: string): string {
  if (!value) return "";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

export type DateFieldHandle = { open: () => void };

const DateField = forwardRef<DateFieldHandle, { label: string; value: string; onChange: (v: string) => void; min?: string }>(
  function DateField({ label, value, onChange, min }, forwardedRef) {
  const ref = useRef<HTMLInputElement | null>(null);
  useImperativeHandle(forwardedRef, () => ({
    open: () => ref.current?.showPicker?.(),
  }));
  return (
    <div className="relative min-w-0" data-oltra-control="true">
      <label className="oltra-label">{label}</label>
      <div
        className="hotel-date-field relative cursor-pointer"
        onMouseDown={e => e.preventDefault()}
        onClick={() => ref.current?.showPicker?.()}
      >
        <input
          ref={ref}
          type="date"
          value={value}
          min={min}
          tabIndex={-1}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => e.preventDefault()}
          onBeforeInput={e => e.preventDefault()}
          className="oltra-input hotel-date-field__input w-full cursor-pointer"
          data-has-value={value ? "true" : "false"}
        />
        <span
          className="hotel-date-field__display pointer-events-none absolute left-0 top-0 flex h-full items-center px-[14px] overflow-hidden"
          data-has-value={value ? "true" : "false"}
        >
          <span className="truncate">{formatDisplayDate(value) || "date"}</span>
        </span>
      </div>
    </div>
  );
  }
);

function SelectField({
  label, value, onChange, options, labels,
}: {
  label: string; value: string; onChange: (v: string) => void; options: string[]; labels?: Record<string, string>;
}) {
  return (
    <div>
      <label className="oltra-label">{label}</label>
      <OltraSelect
        name={label.toLowerCase().replaceAll(" ", "-")}
        value={value}
        placeholder={labels?.[value] ?? value}
        align="left"
        onValueChange={onChange}
        options={options.map(o => ({ value: o, label: labels?.[o] ?? o }))}
      />
    </div>
  );
}

function DurationFilter({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="oltra-label">{label} · {value}h</label>
      <input
        type="range" min={6} max={24} step={1} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className={styles.range}
      />
    </div>
  );
}

function TimeIntervalFilter({
  label, value, onChange,
}: {
  label: string; value: LegFilter; onChange: (patch: Partial<LegFilter>) => void;
}) {
  return (
    <div>
      <label className="oltra-label">
        {label} · {String(value.departStartHour).padStart(2, "0")}:00–{String(value.departEndHour).padStart(2, "0")}:00
      </label>
      <div
        className={styles.rangeSlider}
        style={{ "--start": `${(value.departStartHour / 24) * 100}%`, "--end": `${(value.departEndHour / 24) * 100}%` } as React.CSSProperties}
      >
        <input
          type="range" min={0} max={24} step={1} value={value.departStartHour}
          onChange={e => onChange({ departStartHour: Math.min(Number(e.target.value), value.departEndHour - 1) })}
          className={styles.rangeThumb}
        />
        <input
          type="range" min={0} max={24} step={1} value={value.departEndHour}
          onChange={e => onChange({ departEndHour: Math.max(Number(e.target.value), value.departStartHour + 1) })}
          className={styles.rangeThumb}
        />
      </div>
    </div>
  );
}

function MultiSelectDropdown({
  label, items, selected, onToggle, labelMap,
}: {
  label: string; items: string[]; selected: string[]; onToggle: (v: string) => void;
  labelMap?: Map<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const dismissHoverProps = useDropdownDismiss({
    open,
    onClose: () => setOpen(false),
    refs: rootRef,
  });

  const labelFor = (v: string) => labelMap?.get(v) ?? v;
  const allSelected = selected.length === items.length;
  const display = !items.length
    ? "—"
    : allSelected
    ? "All"
    : selected.length === 0
    ? "None"
    : selected.length <= 2
    ? selected.map(labelFor).join(", ")
    : `${selected.length} selected`;

  return (
    <div
      ref={rootRef}
      className={styles.multiSelectRoot}
      data-oltra-control="true"
      {...dismissHoverProps}
    >
      <label className="oltra-label">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`oltra-select ${styles.multiSelectTrigger}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={styles.multiSelectValue}>{display}</span>
        <svg viewBox="0 0 20 20" aria-hidden="true" className={styles.multiSelectChevron}>
          <path d="M5.5 7.5 10 12l4.5-4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div className={`oltra-popup-panel oltra-popup-panel--up ${styles.multiSelectPanel}`}>
          <div className="oltra-dropdown-list" style={{ maxHeight: "260px" }}>
            {items.map(item => {
              const active = selected.includes(item);
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => onToggle(item)}
                  className={`oltra-dropdown-item flex items-center gap-2 ${active ? "bg-white/10 text-white" : ""}`}
                  role="option"
                  aria-selected={active}
                >
                  <span className="w-4 shrink-0 text-white/72">
                    {active ? "✓" : ""}
                  </span>
                  <span>{labelFor(item)}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MultipleResults({
  searchLegs,
  activeLegIndex,
  allLegOptions,
  selectedLegIds,
  optionPriceMap,
  selectedItinerary,
  recommended,
  fastest,
  onSelectLeg,
  onBook,
  onInfo,
  onSave,
  getSaveLabel,
}: {
  searchLegs: MultiCityLeg[];
  activeLegIndex: number;
  allLegOptions: FlightLeg[][];
  selectedLegIds: string[];
  optionPriceMap: Map<string, { priceEur: number; currency: string }>;
  selectedItinerary: Itinerary | null;
  recommended: Itinerary | null;
  fastest: Itinerary | null;
  onSelectLeg: (colIndex: number, legId: string) => void;
  onBook: (offerId: string) => void;
  onInfo: (flight: FlightLeg) => void;
  onSave?: (id: string) => void;
  getSaveLabel?: (id: string) => string;
}) {
  const N = searchLegs.length;
  const compact = N >= 4;
  const allSelected = activeLegIndex >= N;
  const isLastStep = activeLegIndex === N - 1;
  const gridCols = `repeat(${N}, minmax(0, 1fr)) 140px`;

  // Each leg column (up to the fixed max of 5, per addMultiCityLeg) scrolls
  // independently, same as Departure/Return on the return-trip page - hooks
  // must be called unconditionally, so all 5 are always declared and only
  // the first N are actually rendered.
  const legGutters = [
    useScrollGutter(allLegOptions[0]),
    useScrollGutter(allLegOptions[1]),
    useScrollGutter(allLegOptions[2]),
    useScrollGutter(allLegOptions[3]),
    useScrollGutter(allLegOptions[4]),
  ];
  const [priceScrollRef, priceHasGutter] = useScrollGutter(selectedItinerary);

  return (
    <>
      {/* Column headers — one per leg pane, plus the final total-price pane */}
      <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: "var(--oltra-gap-md)", alignItems: "end", padding: "0 13px", marginBottom: "-4px" }}>
        {searchLegs.map((leg, i) => (
          <div key={i} className={`${styles.columnLabel} ${legGutters[i]?.[1] ? styles.withScrollGutter : ""}`}>
            {`Flight ${i + 1}${leg.from ? ` · ${leg.from} → ${leg.to || "?"}` : ""}`}
          </div>
        ))}
        <div className={`${styles.columnLabel} ${styles.columnLabelRight} ${priceHasGutter ? styles.withScrollGutter : ""}`}>Total price</div>
      </div>

      {/* Pinned rows — same visual style as Return page */}
      <div className={styles.pinnedStack}>
        {fastest ? (
          <MultiPinnedRow
            label="Fastest"
            itinerary={fastest}
            columnCount={N}
            compact={compact}
            allLegOptions={allLegOptions}
            selectedLegIds={selectedLegIds}
            onSelectLeg={onSelectLeg}
            onBook={onBook}
            onInfo={onInfo}
            onSave={onSave}
            getSaveLabel={getSaveLabel}
          />
        ) : null}
        {recommended ? (
          <MultiPinnedRow
            label="Best price"
            itinerary={recommended}
            columnCount={N}
            compact={compact}
            allLegOptions={allLegOptions}
            selectedLegIds={selectedLegIds}
            onSelectLeg={onSelectLeg}
            onBook={onBook}
            onInfo={onInfo}
            onSave={onSave}
            getSaveLabel={getSaveLabel}
          />
        ) : null}
      </div>

      {/* Standard results — N independently-scrolling leg panes + a final
          price pane, same pattern as Return page's split panes */}
      <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: "var(--oltra-gap-md)", alignItems: "start" }}>
        {searchLegs.map((_, k) => {
          const colOptions = allLegOptions[k] ?? [];
          const colSelected = selectedLegIds[k] ?? "";
          const displayOptions = k <= activeLegIndex ? sortTopFirst(colOptions, colSelected) : colOptions;
          const [colScrollRef] = legGutters[k] ?? [];
          const isActive = k === activeLegIndex;
          return (
            <div key={k} className={styles.resultsScroll} ref={colScrollRef}>
              <div className={styles.cardStack}>
                {k > activeLegIndex ? (
                  k === activeLegIndex + 1 ? (
                    <div className={styles.emptyHint}>Select flight {activeLegIndex + 1} to see options.</div>
                  ) : null
                ) : displayOptions.length ? (
                  displayOptions.map(legOpt => {
                    const price = isActive ? optionPriceMap.get(legOpt.id) : undefined;
                    return (
                      <div
                        key={legOpt.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => onSelectLeg(k, legOpt.id)}
                        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") onSelectLeg(k, legOpt.id); }}
                        className={`${styles.selectCard} ${price ? styles.selectCardRow : ""} ${compact ? styles.selectCardCompact : ""} ${colSelected === legOpt.id ? styles.selectCardActive : ""}`}
                      >
                        <FlightCardContent flight={legOpt} onInfo={onInfo} compact={compact} />
                        {price ? <InlinePrice priceEur={price.priceEur} currency={price.currency} showFrom={!isLastStep} /> : null}
                      </div>
                    );
                  })
                ) : (
                  <div className={styles.emptyHint}>No flights match the filters.</div>
                )}
              </div>
            </div>
          );
        })}

        {/* Total price — only meaningful once every leg is picked; the
            active leg's own price is already inline on its cards above. */}
        <div className={styles.resultsScroll} ref={priceScrollRef}>
          <div className={styles.cardStack}>
            {allSelected && selectedItinerary ? (
              <PriceCard itinerary={selectedItinerary} onBook={onBook} onSave={onSave} getSaveLabel={getSaveLabel} active compact={compact} />
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

function MultiPinnedRow({
  label,
  itinerary,
  columnCount,
  compact,
  allLegOptions,
  selectedLegIds,
  onSelectLeg,
  onBook,
  onInfo,
  onSave,
  getSaveLabel,
}: {
  label: string;
  itinerary: Itinerary;
  columnCount: number;
  compact?: boolean;
  allLegOptions: FlightLeg[][];
  selectedLegIds: string[];
  onSelectLeg: (colIndex: number, legId: string) => void;
  onBook: (id: string) => void;
  onInfo: (flight: FlightLeg) => void;
  onSave?: (id: string) => void;
  getSaveLabel?: (id: string) => string;
}) {
  return (
    <div className={styles.pinnedRow}>
      <span className={styles.pinnedLegend}>{label}</span>
      <div
        className={styles.multiPinnedGrid}
        style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr)) 140px` }}
      >
        {itinerary.slices.slice(0, columnCount).map((leg, i) => {
          const tier = i === 0 ? null : getReturnMatchTier(itinerary.slices[0]!, leg);
          // Only reachable if this leg option is actually available given the
          // legs already locked in for column i - otherwise selecting it
          // wouldn't correspond to any real fetched itinerary.
          const reachable = (allLegOptions[i] ?? []).some(opt => opt.id === leg.id);
          if (!reachable) {
            return (
              <div key={i} className={`${styles.staticCard} ${compact ? styles.staticCardCompact : ""}`}>
                <FlightCardContent flight={leg} matchTier={tier} onInfo={onInfo} compact={compact} />
              </div>
            );
          }
          return (
            <div
              key={i}
              role="button"
              tabIndex={0}
              onClick={() => onSelectLeg(i, leg.id)}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") onSelectLeg(i, leg.id); }}
              className={`${styles.selectCard} ${compact ? styles.selectCardCompact : ""} ${selectedLegIds[i] === leg.id ? styles.selectCardActive : ""}`}
            >
              <FlightCardContent flight={leg} matchTier={tier} onInfo={onInfo} compact={compact} />
            </div>
          );
        })}
        <PriceCard itinerary={itinerary} onBook={onBook} onSave={onSave} getSaveLabel={getSaveLabel} active compact={compact} />
      </div>
    </div>
  );
}

function InlinePrice({ priceEur, currency, showFrom }: { priceEur: number; currency: string; showFrom: boolean }) {
  const { currency: displayCurrency, format } = useCurrency();
  return (
    <span className={styles.inlinePrice}>
      {showFrom ? <span className={styles.inlinePriceFrom}>from</span> : null}
      <span className={styles.inlinePriceAmount}>{displayCurrency} {format(priceEur, currency)}</span>
    </span>
  );
}

function PinnedRow({
  label,
  itinerary,
  oneWay,
  selectedOutboundId,
  selectedReturnId,
  visibleReturnItineraries,
  departureHasGutter,
  returnHasGutter,
  onSelectOutbound,
  onSelectReturn,
  onBook,
  onInfo,
  onSave,
  getSaveLabel,
}: {
  label: string;
  itinerary: Itinerary;
  oneWay: boolean;
  selectedOutboundId: string;
  selectedReturnId: string;
  visibleReturnItineraries: Itinerary[];
  departureHasGutter: boolean;
  returnHasGutter: boolean;
  onSelectOutbound: (id: string) => void;
  onSelectReturn: (id: string) => void;
  onBook: (id: string) => void;
  onInfo: (flight: FlightLeg) => void;
  onSave?: (id: string) => void;
  getSaveLabel?: (id: string) => string;
}) {
  const tier = !oneWay && itinerary.inbound
    ? getReturnMatchTier(itinerary.outbound, itinerary.inbound)
    : null;
  const matchingReturn = !oneWay && itinerary.inbound
    ? visibleReturnItineraries.find(it => it.inbound?.id === itinerary.inbound?.id) ?? null
    : null;
  const outboundCard = (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelectOutbound(itinerary.outbound.id)}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") onSelectOutbound(itinerary.outbound.id); }}
      className={`${styles.selectCard} ${itinerary.outbound.id === selectedOutboundId ? styles.selectCardActive : ""}`}
    >
      <FlightCardContent flight={itinerary.outbound} onInfo={onInfo} />
    </div>
  );

  if (oneWay) {
    return (
      <div className={styles.pinnedRow}>
        <span className={styles.pinnedLegend}>{label}</span>
        <div className={styles.pinnedGridOneWay}>
          {outboundCard}
          <PriceCard itinerary={itinerary} onBook={onBook} onSave={onSave} getSaveLabel={getSaveLabel} active />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.pinnedRow}>
      <span className={styles.pinnedLegend}>{label}</span>
      {/* Same outer split as the Departure / Return+Price panes below, so
          this row's cells line up with the panes it sits above. */}
      <div className={styles.splitPanes}>
        <div className={departureHasGutter ? styles.withScrollGutter : ""}>{outboundCard}</div>
        <div className={`${styles.pinnedGridOneWay} ${returnHasGutter ? styles.withScrollGutter : ""}`}>
          {itinerary.inbound ? (
            matchingReturn ? (
              <div
                role="button"
                tabIndex={0}
                onClick={() => onSelectReturn(matchingReturn.id)}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") onSelectReturn(matchingReturn.id); }}
                className={`${styles.selectCard} ${matchingReturn.id === selectedReturnId ? styles.selectCardActive : ""}`}
              >
                <FlightCardContent flight={itinerary.inbound} matchTier={tier} onInfo={onInfo} />
              </div>
            ) : (
              <div className={styles.staticCard}><FlightCardContent flight={itinerary.inbound} matchTier={tier} onInfo={onInfo} /></div>
            )
          ) : <div />}
          <PriceCard itinerary={itinerary} onBook={onBook} onSave={onSave} getSaveLabel={getSaveLabel} active />
        </div>
      </div>
    </div>
  );
}


function SelectedRow({ outbound, inbound, itinerary, oneWay, departureHasGutter, returnHasGutter, onBook, onInfo, onSave, getSaveLabel }: {
  outbound: FlightLeg;
  inbound: FlightLeg | null;
  itinerary: Itinerary | null;
  oneWay: boolean;
  departureHasGutter: boolean;
  returnHasGutter: boolean;
  onBook: (id: string) => void;
  onInfo: (flight: FlightLeg) => void;
  onSave?: (id: string) => void;
  getSaveLabel?: (id: string) => string;
}) {
  const priceCell = itinerary ? (
    <PriceCard itinerary={itinerary} onBook={onBook} onSave={onSave} getSaveLabel={getSaveLabel} active />
  ) : (
    <div className={styles.priceCard}>
      <span style={{ fontSize: "0.8rem", color: "var(--oltra-text-secondary)", textAlign: "center" }}>—</span>
    </div>
  );

  if (oneWay) {
    return (
      <div className={styles.pinnedRow}>
        <span className={styles.pinnedLegend}>Selected</span>
        <div className={styles.pinnedGridOneWay}>
          <div className={styles.staticCard}>
            <FlightCardContent flight={outbound} onInfo={onInfo} />
          </div>
          {priceCell}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.pinnedRow}>
      <span className={styles.pinnedLegend}>Selected</span>
      <div className={styles.splitPanes}>
        <div className={`${styles.staticCard} ${departureHasGutter ? styles.withScrollGutter : ""}`}>
          <FlightCardContent flight={outbound} onInfo={onInfo} />
        </div>
        <div className={`${styles.pinnedGridOneWay} ${returnHasGutter ? styles.withScrollGutter : ""}`}>
          {inbound ? (
            <div className={styles.staticCard}>
              <FlightCardContent flight={inbound} onInfo={onInfo} />
            </div>
          ) : (
            <div className={styles.staticCard}>
              <span style={{ fontSize: "0.78rem", color: "var(--oltra-text-secondary)" }}>
                Select a return flight
              </span>
            </div>
          )}
          {priceCell}
        </div>
      </div>
    </div>
  );
}

function PriceCard({
  itinerary,
  onBook,
  onSave,
  getSaveLabel,
  active = false,
  compact,
  priceOnly = false,
}: {
  itinerary: Itinerary;
  onBook: (id: string) => void;
  onSave?: (id: string) => void;
  getSaveLabel?: (id: string) => string;
  active?: boolean;
  compact?: boolean;
  priceOnly?: boolean;
}) {
  const { currency, format } = useCurrency();
  return (
    <div className={`${styles.priceCard} ${active ? styles.priceCardActive : ""} ${compact ? styles.selectCardCompact : ""}`}>
      <span className={styles.priceCardAmount}>
        {currency} {format(itinerary.priceEur, itinerary.currency)}
      </span>
      {!priceOnly && (
        <div className={styles.priceCardButtonRow}>
          <button
            type="button"
            className={active ? styles.bookButtonActive : styles.bookButtonInactive}
            onClick={() => active && onBook(itinerary.offerId)}
            disabled={!active}
          >
            BOOK
          </button>
          <button
            type="button"
            className={active ? styles.savePillButton : styles.bookButtonInactive}
            disabled={!active}
            onClick={() => active && onSave?.(itinerary.offerId)}
          >
            {getSaveLabel?.(itinerary.offerId) ?? 'SAVE'}
          </button>
        </div>
      )}
    </div>
  );
}

function matchTierLabel(tier: ReturnMatchTier): string {
  if (tier === "alliance") return "Alliance partner";
  return "";
}

function AirlineMarks({ airlines }: { airlines: AirlineRef[] }) {
  const withLogo = airlines.filter(a => a.logoUrl).slice(0, 2);
  if (!withLogo.length) return null;
  return (
    <span className={styles.airlineMarks}>
      {withLogo.map(a => (
        <img
          key={a.iataCode || a.name}
          src={a.logoUrl!}
          alt=""
          className={styles.airlineMark}
          onError={e => { e.currentTarget.style.display = "none"; }}
        />
      ))}
    </span>
  );
}

function FlightCardContent({
  flight,
  matchTier,
  onInfo,
  compact,
}: {
  flight: FlightLeg;
  matchTier?: ReturnMatchTier;
  onInfo?: (flight: FlightLeg) => void;
  compact?: boolean;
}) {
  const airlineLabel = flight.airlines.length
    ? flight.airlines.map(a => a.name).join(" + ")
    : flight.airline;
  const cabinClass = flight.segments[0]?.cabinClassMarketingName || "";
  const label = matchTierLabel(matchTier ?? null);
  const timeStyle = compact ? { fontSize: "0.82rem" } : undefined;
  return (
    <>
      {onInfo ? (
        <button
          type="button"
          className={styles.infoButton}
          onClick={e => { e.stopPropagation(); onInfo(flight); }}
          aria-label="Flight details"
        >
          info
        </button>
      ) : null}
      <div className={styles.flightCardInner}>
        <AirlineMarks airlines={flight.airlines} />
        <div className={styles.flightCardText}>
          <div className={styles.flightTimesRow}>
            <span className={styles.flightDepart} style={timeStyle}>{flight.departTime}</span>
            <span className={styles.flightArrow}>→</span>
            <span className={styles.flightArrive} style={timeStyle}>{flight.arriveTime}</span>
            <span className={styles.flightMetaDot}>·</span>
            <span className={styles.flightDuration} style={timeStyle}>{formatDuration(flight.durationMinutes)}</span>
            {label ? (
              <span className={styles.matchBadgeWeak}>
                {label}
              </span>
            ) : null}
          </div>
          <div className={styles.flightStopsRow}>
            <span className={`${styles.flightMetaText} ${styles.flightAirlineText}`}>{airlineLabel}</span>
            {flight.stopSummary ? (
              <>
                <span className={styles.flightMetaDot}>·</span>
                <span className={styles.flightMetaText}>{flight.stopSummary}</span>
              </>
            ) : null}
            {cabinClass ? (
              <>
                <span className={styles.flightMetaDot}>·</span>
                <span className={styles.flightMetaText}>{cabinClass}</span>
              </>
            ) : null}
            {flight.fareBrand ? (
              <>
                <span className={styles.flightMetaDot}>·</span>
                <span className={styles.flightMetaText}>{flight.fareBrand}</span>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
