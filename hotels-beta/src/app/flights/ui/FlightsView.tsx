"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import GuestSelector from "@/components/site/GuestSelector";
import OltraSelect from "@/components/site/OltraSelect";
import { readHotelFlightSearch, saveHotelFlightSearch } from "@/lib/searchSession";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { addFlightToTripBrowser, getMemberActionAccessBrowser } from "@/lib/members/db";
import { type Itinerary, type FlightLeg, normalizeOffers } from "@/lib/flights/duffelNormalizer";
import { getAlliance, sharedAlliance } from "@/lib/flights/airlineAlliances";
import FlightDetailsPopup from "./FlightDetailsPopup";
import { useCurrency } from "@/lib/currency/useCurrency";
import { AIRPORT_OPTIONS } from "@/lib/airportOptions";
import AirportAutocomplete from "./AirportAutocomplete";
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

  const originParam = normalizeParam(searchParams.origin);
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

type ReturnMatchTier = "long-haul" | "alliance" | null;

function getReturnMatchTier(outbound: FlightLeg, inbound: FlightLeg): ReturnMatchTier {
  const outLong = outbound.longHaulAirline?.iataCode ?? "";
  const inLong = inbound.longHaulAirline?.iataCode ?? "";
  if (outLong && inLong && outLong === inLong) return "long-haul";

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
  const minReturnIso = search.departDate
    ? new Date(new Date(search.departDate).getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    : todayIso;

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
    return 'SAVE TO TRIP';
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
      const timing = `${outSeg0?.departIso?.slice(0, 10) ?? ''} · ${itinerary.outbound.departTime} → ${itinerary.outbound.arriveTime}`;
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
    saveHotelFlightSearch({
      q: normalizeParam(searchParams.q),
      city: normalizeParam(searchParams.city),
      country: normalizeParam(searchParams.country),
      region: normalizeParam(searchParams.region),
      from: search.departDate,
      to: isReturnTrip ? search.returnDate : "",
      adults: String(search.adults),
      kids: String(search.children),
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

  const outboundOptions = useMemo(
    () => dedupeById(standardItineraries.map(item => item.outbound)),
    [standardItineraries]
  );

  const itineraryByOutboundId = useMemo(() => {
    const map = new Map<string, Itinerary>();
    for (const it of standardItineraries) {
      if (!map.has(it.outbound.id)) map.set(it.outbound.id, it);
    }
    return map;
  }, [standardItineraries]);

  useEffect(() => {
    if (!outboundOptions.length) { setSelectedOutboundId(""); return; }
    if (outboundOptions.some(f => f.id === selectedOutboundId)) return;
    setSelectedOutboundId("");
  }, [outboundOptions, selectedOutboundId]);

  useEffect(() => {
    setSelectedReturnId("");
  }, [selectedOutboundId]);

  const visibleReturnItineraries = useMemo(() => {
    if (!selectedOutboundId) return [];
    return standardItineraries.filter(item => item.outbound.id === selectedOutboundId);
  }, [selectedOutboundId, standardItineraries]);

  const selectedOutboundLeg = useMemo(
    () => outboundOptions.find(f => f.id === selectedOutboundId) ?? null,
    [outboundOptions, selectedOutboundId]
  );

  const resultsScrollRef = useRef<HTMLDivElement | null>(null);
  const [hasScrollGutter, setHasScrollGutter] = useState(false);

  useEffect(() => {
    const el = resultsScrollRef.current;
    if (!el) return;
    const check = () => setHasScrollGutter(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    Array.from(el.children).forEach(c => ro.observe(c));
    return () => ro.disconnect();
  }, [filteredItineraries, selectedOutboundId, visibleReturnItineraries]);

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
      return dedupeById(matching.map(it => it.slices[k]).filter((l): l is FlightLeg => Boolean(l)));
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
                  <DateField
                    label="Depart"
                    value={search.departDate}
                    min={todayIso}
                    onChange={v => { setSearch(c => ({ ...c, departDate: v })); markDirty(); }}
                  />
                  {isReturnTrip ? (
                    <DateField
                      label="Return"
                      value={search.returnDate}
                      min={minReturnIso}
                      onChange={v => { setSearch(c => ({ ...c, returnDate: v })); markDirty(); }}
                    />
                  ) : null}
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
              <div className={styles.metaText}>
                {isLoading
                  ? "Searching for flights…"
                  : itineraries.length
                  ? `${filteredItineraries.length} itineraries · ${search.adults} adults${search.children > 0 ? `, ${search.children} children` : ""} · ${search.cabin}`
                  : "Enter your route and press Search"}
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
                    resultsScrollRef={resultsScrollRef}
                    hasScrollGutter={hasScrollGutter}
                  />
                </div>
              ) : (
                <>
                  <div className={`${isOneWay ? styles.columnHeadersOneWay : styles.columnHeaders} ${hasScrollGutter ? styles.withScrollGutter : ""}`}>
                    <div className={styles.columnLabel}>
                      Departure
                      {!isOneWay ? (
                        <span aria-hidden="true" style={{ marginLeft: 6 }}>→</span>
                      ) : null}
                    </div>
                    {!isOneWay ? (
                      <div className={styles.columnLabel}>
                        <span aria-hidden="true" style={{ marginRight: 6 }}>←</span>
                        Return
                      </div>
                    ) : null}
                    <div className={`${styles.columnLabel} ${styles.columnLabelRight}`}>Price</div>
                  </div>

                  <div className={`${styles.pinnedStack} ${hasScrollGutter ? styles.withScrollGutter : ""}`}>
                    {recommended ? (
                      <PinnedRow label="Top pick" itinerary={recommended} oneWay={isOneWay} onBook={handleBook} onInfo={setDetailFlight} onSave={handleSaveToTrip} getSaveLabel={getSaveLabel} />
                    ) : null}
                    {fastest ? (
                      <PinnedRow label="Fastest" itinerary={fastest} oneWay={isOneWay} onBook={handleBook} onInfo={setDetailFlight} onSave={handleSaveToTrip} getSaveLabel={getSaveLabel} />
                    ) : null}
                  </div>

                  <div className={styles.resultsScroll} ref={resultsScrollRef}>
                  <div className={isOneWay ? styles.resultsGridOneWay : styles.resultsGrid}>
                    {(() => {
                      const sortedOutbound = sortTopFirst(outboundOptions, selectedOutboundId);
                      const sortedReturn = sortTopFirst(visibleReturnItineraries, selectedReturnId);
                      return (
                        <>
                          <div className={styles.columnBox}>
                            <div className={styles.cardStack}>
                              {sortedOutbound.length ? (
                                sortedOutbound.map(flight => (
                                  <div
                                    key={flight.id}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => setSelectedOutboundId(flight.id)}
                                    onKeyDown={e => { if (e.key === "Enter" || e.key === " ") setSelectedOutboundId(flight.id); }}
                                    className={`${styles.selectCard} ${flight.id === selectedOutboundId ? styles.selectCardActive : ""}`}
                                  >
                                    <FlightCardContent flight={flight} onInfo={setDetailFlight} />
                                  </div>
                                ))
                              ) : (
                                <div className={styles.emptyHint}>No departure flights match the selected filters.</div>
                              )}
                            </div>
                          </div>

                          {!isOneWay ? (
                            <div className={styles.columnBox}>
                              <div className={styles.cardStack}>
                                {!selectedOutboundId ? (
                                  <div className={styles.emptyHint}>Select a departure flight to see return options.</div>
                                ) : sortedReturn.length ? (
                                  sortedReturn.map(item => {
                                    const tier = item.inbound && selectedOutboundLeg
                                      ? getReturnMatchTier(selectedOutboundLeg, item.inbound)
                                      : null;
                                    const matchClass = item.id === selectedReturnId
                                      ? styles.selectCardActive
                                      : tier === "long-haul"
                                      ? styles.selectCardMatchStrong
                                      : tier === "alliance"
                                      ? styles.selectCardMatchWeak
                                      : "";
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
                                ) : (
                                  <div className={styles.emptyHint}>No compatible return flights found.</div>
                                )}
                              </div>
                            </div>
                          ) : null}

                          <div className={styles.priceColumn}>
                            <div className={styles.cardStack}>
                              {isOneWay
                                ? sortedOutbound
                                    .map(flight => itineraryByOutboundId.get(flight.id))
                                    .filter((it): it is Itinerary => Boolean(it))
                                    .map(it => (
                                      <PriceCard
                                        key={it.id}
                                        itinerary={it}
                                        onBook={handleBook}
                                        onSave={handleSaveToTrip}
                                        getSaveLabel={getSaveLabel}
                                        active={it.outbound.id === selectedOutboundId}
                                      />
                                    ))
                                : selectedOutboundId
                                ? sortedReturn.map(it => (
                                    <PriceCard
                                      key={it.id}
                                      itinerary={it}
                                      onBook={handleBook}
                                      onSave={handleSaveToTrip}
                                      getSaveLabel={getSaveLabel}
                                      active={it.id === selectedReturnId}
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

function DateField({ label, value, onChange, min }: { label: string; value: string; onChange: (v: string) => void; min?: string }) {
  const ref = useRef<HTMLInputElement | null>(null);
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

  useEffect(() => {
    function handleDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleDown);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleDown);
      document.removeEventListener("keydown", handleEsc);
    };
  }, []);

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
    <div ref={rootRef} className={styles.multiSelectRoot} data-oltra-control="true">
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
  resultsScrollRef,
  hasScrollGutter,
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
  resultsScrollRef: { current: HTMLDivElement | null };
  hasScrollGutter: boolean;
}) {
  const N = searchLegs.length;
  const compact = N >= 4;
  const allSelected = activeLegIndex >= N;
  const isLastStep = activeLegIndex === N - 1;
  const gridCols = `repeat(${N}, minmax(0, 1fr)) 140px`;
  const activeOptions = allLegOptions[activeLegIndex] ?? [];

  return (
    <>
      {/* Column headers — same format as Return page, span all legs */}
      <div
        className={hasScrollGutter ? styles.withScrollGutter : ""}
        style={{ display: "grid", gridTemplateColumns: gridCols, gap: "var(--oltra-gap-md)", alignItems: "end", padding: "0 13px", marginBottom: "-4px" }}
      >
        {searchLegs.map((leg, i) => (
          <div key={i} className={styles.columnLabel}>
            {`Flight ${i + 1}${leg.from ? ` · ${leg.from} → ${leg.to || "?"}` : ""}`}
          </div>
        ))}
        <div className={`${styles.columnLabel} ${styles.columnLabelRight}`}>Price</div>
      </div>

      {/* Pinned rows — same visual style as Return page */}
      <div className={`${styles.pinnedStack} ${hasScrollGutter ? styles.withScrollGutter : ""}`}>
        {recommended ? (
          <MultiPinnedRow label="Top pick" itinerary={recommended} columnCount={N} compact={compact} onBook={onBook} onInfo={onInfo} onSave={onSave} getSaveLabel={getSaveLabel} />
        ) : null}
        {fastest ? (
          <MultiPinnedRow label="Fastest" itinerary={fastest} columnCount={N} compact={compact} onBook={onBook} onInfo={onInfo} onSave={onSave} getSaveLabel={getSaveLabel} />
        ) : null}
      </div>

      {/* Standard results — N column stacks + price, same pattern as Return page */}
      <div className={styles.resultsScroll} ref={resultsScrollRef as React.RefObject<HTMLDivElement>}>
        <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: "var(--oltra-gap-md)", padding: "0 13px", alignItems: "start" }}>
          {searchLegs.map((_, k) => {
            const colOptions = allLegOptions[k] ?? [];
            const colSelected = selectedLegIds[k] ?? "";
            const displayOptions = k <= activeLegIndex ? sortTopFirst(colOptions, colSelected) : colOptions;
            return (
              <div key={k} className={styles.columnBox}>
                <div className={styles.cardStack}>
                  {k > activeLegIndex ? (
                    k === activeLegIndex + 1 ? (
                      <div className={styles.emptyHint}>Select flight {activeLegIndex + 1} to see options.</div>
                    ) : null
                  ) : displayOptions.length ? (
                    displayOptions.map(legOpt => (
                      <div
                        key={legOpt.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => onSelectLeg(k, legOpt.id)}
                        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") onSelectLeg(k, legOpt.id); }}
                        className={`${styles.selectCard} ${compact ? styles.selectCardCompact : ""} ${colSelected === legOpt.id ? styles.selectCardActive : ""}`}
                      >
                        <FlightCardContent flight={legOpt} onInfo={onInfo} compact={compact} />
                      </div>
                    ))
                  ) : (
                    <div className={styles.emptyHint}>No flights match the filters.</div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Price column — aligned with active column's options */}
          <div className={styles.priceColumn}>
            <div className={styles.cardStack}>
              {allSelected && selectedItinerary ? (
                <PriceCard itinerary={selectedItinerary} onBook={onBook} onSave={onSave} getSaveLabel={getSaveLabel} active compact={compact} />
              ) : (
                sortTopFirst(activeOptions, selectedLegIds[activeLegIndex] ?? "").map(legOpt => {
                  const p = optionPriceMap.get(legOpt.id);
                  return p ? (
                    <MultiOptionPriceCard key={legOpt.id} priceEur={p.priceEur} currency={p.currency} showFrom={!isLastStep} compact={compact} />
                  ) : null;
                })
              )}
            </div>
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
  onBook,
  onInfo,
  onSave,
  getSaveLabel,
}: {
  label: string;
  itinerary: Itinerary;
  columnCount: number;
  compact?: boolean;
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
          return (
            <div key={i} className={`${styles.staticCard} ${compact ? styles.staticCardCompact : ""}`}>
              <FlightCardContent flight={leg} matchTier={tier} onInfo={onInfo} compact={compact} />
            </div>
          );
        })}
        <PriceCard itinerary={itinerary} onBook={onBook} onSave={onSave} getSaveLabel={getSaveLabel} active compact={compact} />
      </div>
    </div>
  );
}

function MultiOptionPriceCard({ priceEur, currency, showFrom, compact }: { priceEur: number; currency: string; showFrom: boolean; compact?: boolean }) {
  const { format } = useCurrency();
  return (
    <div className={`${styles.priceCard} ${compact ? styles.selectCardCompact : ""}`}>
      {showFrom ? <span className={styles.priceCardFrom}>from</span> : null}
      <span className={styles.priceCardAmount}>{currency} {format(priceEur, currency)}</span>
    </div>
  );
}

function PinnedRow({ label, itinerary, oneWay, onBook, onInfo, onSave, getSaveLabel }: { label: string; itinerary: Itinerary; oneWay: boolean; onBook: (id: string) => void; onInfo: (flight: FlightLeg) => void; onSave?: (id: string) => void; getSaveLabel?: (id: string) => string }) {
  const tier = !oneWay && itinerary.inbound
    ? getReturnMatchTier(itinerary.outbound, itinerary.inbound)
    : null;
  return (
    <div className={styles.pinnedRow}>
      <span className={styles.pinnedLegend}>{label}</span>
      <div className={oneWay ? styles.pinnedGridOneWay : styles.pinnedGrid}>
        <div className={styles.staticCard}><FlightCardContent flight={itinerary.outbound} onInfo={onInfo} /></div>
        {!oneWay && itinerary.inbound ? (
          <div className={styles.staticCard}><FlightCardContent flight={itinerary.inbound} matchTier={tier} onInfo={onInfo} /></div>
        ) : null}
        <PriceCard itinerary={itinerary} onBook={onBook} onSave={onSave} getSaveLabel={getSaveLabel} active />
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
}: {
  itinerary: Itinerary;
  onBook: (id: string) => void;
  onSave?: (id: string) => void;
  getSaveLabel?: (id: string) => string;
  active?: boolean;
  compact?: boolean;
}) {
  const { currency, format } = useCurrency();
  return (
    <div className={`${styles.priceCard} ${active ? styles.priceCardActive : ""} ${compact ? styles.selectCardCompact : ""}`}>
      <span className={styles.priceCardAmount}>
        {currency} {format(itinerary.priceEur, itinerary.currency)}
      </span>
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
        {getSaveLabel?.(itinerary.offerId) ?? 'SAVE TO TRIP'}
      </button>
    </div>
  );
}

function matchTierLabel(tier: ReturnMatchTier): string {
  if (tier === "long-haul") return "Same airline";
  if (tier === "alliance") return "Alliance partner";
  return "";
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
          title="Flight details"
        >
          i
        </button>
      ) : null}
      <div className={styles.flightCardInner}>
        <div className={styles.flightTimesRow}>
          <span className={styles.flightDepart} style={timeStyle}>{flight.departTime}</span>
          <span className={styles.flightArrow}>→</span>
          <span className={styles.flightArrive} style={timeStyle}>{flight.arriveTime}</span>
        </div>
        <div className={styles.flightStopsRow}>
          <span className={styles.flightMetaText}>{formatDuration(flight.durationMinutes)}</span>
        </div>
        <div className={styles.flightMetaRow}>
          <span className={styles.flightMetaText}>{airlineLabel}</span>
          {label ? (
            <span className={matchTier === "long-haul" ? styles.matchBadgeStrong : styles.matchBadgeWeak}>
              {label}
            </span>
          ) : null}
        </div>
        {flight.stopSummary ? (
          <div className={styles.flightStopsRow}>
            <span className={styles.flightMetaText}>{flight.stopSummary}</span>
          </div>
        ) : null}
      </div>
    </>
  );
}
