"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import GuestSelector from "@/components/site/GuestSelector";
import OltraSelect from "@/components/site/OltraSelect";
import { readHotelFlightSearch, saveHotelFlightSearch } from "@/lib/searchSession";
import { type Itinerary, type FlightLeg, normalizeOffers } from "@/lib/flights/duffelNormalizer";
import { useCurrency } from "@/lib/currency/useCurrency";
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
  flexDays: "none" | "+/- 1 day" | "+/- 2 days";
  outbound: LegFilter;
  inbound: LegFilter;
  multi: LegFilter[];
};

type Props = {
  searchParams: PageSearchParams;
};

const DEFAULT_LEG_FILTER: LegFilter = {
  maxDurationHours: 20,
  departStartHour: 5,
  departEndHour: 23,
};

const INITIAL_SEARCH: SearchState = {
  tripType: "return",
  from: "CPH",
  to: "HKT",
  departDate: "2026-07-04",
  returnDate: "2026-07-15",
  adults: 2,
  children: 0,
  cabin: "Economy",
  multiCity: [
    { id: "multi-1", from: "CPH", to: "BKK", date: "2026-07-04" },
    { id: "multi-2", from: "BKK", to: "HKT", date: "2026-07-07" },
    { id: "multi-3", from: "HKT", to: "CPH", date: "2026-07-15" },
  ],
};

const INITIAL_FILTERS: FilterState = {
  maxStops: "any",
  airlines: [],
  layoverAirports: [],
  flexDays: "none",
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

function buildInitialSearch(searchParams: PageSearchParams): SearchState {
  const saved =
    typeof window !== "undefined" && !hasFlightSearchParams(searchParams)
      ? readHotelFlightSearch()
      : null;

  const source = saved ?? searchParams;

  return {
    ...INITIAL_SEARCH,
    to: normalizeParam(source.city) || normalizeParam(source.q) || INITIAL_SEARCH.to,
    departDate: normalizeParam(source.from) || INITIAL_SEARCH.departDate,
    returnDate: normalizeParam(source.to) || INITIAL_SEARCH.returnDate,
    adults: Number(normalizeParam(source.adults)) || INITIAL_SEARCH.adults,
    children: Number(normalizeParam(source.kids)) || INITIAL_SEARCH.children,
  };
}

function formatDuration(totalMinutes: number): string {
  return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(price);
}

function getHour(time: string): number {
  return Number(time.split(":")[0] ?? 0);
}

function getLayoverAirport(leg: FlightLeg): string {
  if (leg.stops === 0) return "";
  const match = leg.stopSummary.match(/·\s*([A-Z]{3})\s/);
  return match?.[1]?.trim() ?? "";
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

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function getPinnedItineraries(itineraries: Itinerary[], tripType: TripType) {
  const byScore = [...itineraries].sort((a, b) => b.score - a.score);
  const byDuration = [...itineraries].sort((a, b) => {
    const aDur = tripType === "one-way"
      ? a.outbound.durationMinutes
      : a.outbound.durationMinutes + (a.inbound?.durationMinutes ?? 0);
    const bDur = tripType === "one-way"
      ? b.outbound.durationMinutes
      : b.outbound.durationMinutes + (b.inbound?.durationMinutes ?? 0);
    return aDur - bDur;
  });
  const recommended = byScore[0] ?? null;
  const fastest = byDuration[0]?.id !== recommended?.id ? byDuration[0] ?? null : byDuration[1] ?? null;
  return { recommended, fastest };
}

export default function FlightsView({ searchParams }: Props) {
  const [search, setSearch] = useState<SearchState>(() => buildInitialSearch(searchParams));
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);
  const [selectedOutboundId, setSelectedOutboundId] = useState("");
  const [selectedReturnId, setSelectedReturnId] = useState("");
  const [itineraries, setItineraries] = useState<Itinerary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDirty, setIsDirty] = useState(true);
  const [searchError, setSearchError] = useState<string | null>(null);

  const isReturnTrip = search.tripType === "return";
  const isOneWay = search.tripType === "one-way";
  const isMultiple = search.tripType === "multiple";

  function markDirty() {
    setIsDirty(true);
  }

  useEffect(() => {
    setSearch(current => ({
      ...current,
      to: normalizeParam(searchParams.city) || normalizeParam(searchParams.q) || current.to,
      departDate: normalizeParam(searchParams.from) || current.departDate,
      returnDate: normalizeParam(searchParams.to) || current.returnDate,
      adults: Number(normalizeParam(searchParams.adults)) || current.adults,
      children: Number(normalizeParam(searchParams.kids)) || current.children,
    }));
  }, [searchParams]);

  useEffect(() => {
    saveHotelFlightSearch({
      q: normalizeParam(searchParams.q),
      city: normalizeParam(searchParams.city) || search.to,
      country: normalizeParam(searchParams.country),
      region: normalizeParam(searchParams.region),
      from: search.departDate,
      to: isReturnTrip ? search.returnDate : "",
      adults: String(search.adults),
      kids: String(search.children),
    });
  }, [search, searchParams, isReturnTrip]);

  const allAirlines = useMemo(
    () => [...new Set(itineraries.map(item => item.outbound.airline))].sort(),
    [itineraries]
  );

  const layoverAirports = useMemo(
    () =>
      [...new Set(
        itineraries.flatMap(item => [
          getLayoverAirport(item.outbound),
          item.inbound ? getLayoverAirport(item.inbound) : "",
        ]).filter(Boolean)
      )].sort(),
    [itineraries]
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
        const outOk = legMatchesFilters(item.outbound, filters, filters.outbound);
        if (isOneWay || isMultiple || !item.inbound) return outOk;
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

  const selectedItinerary = useMemo(() => {
    if (!selectedOutboundId) return null;
    if (isOneWay) return standardItineraries.find(i => i.outbound.id === selectedOutboundId) ?? null;
    if (!selectedReturnId) return null;
    return standardItineraries.find(i => i.id === selectedReturnId) ?? null;
  }, [selectedOutboundId, selectedReturnId, isOneWay, standardItineraries]);

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
    setSearch(current => ({ ...current, tripType }));
    markDirty();
    setFilters(current => ({
      ...current,
      multi: current.multi.length
        ? current.multi
        : Array.from({ length: search.multiCity.length }, () => DEFAULT_LEG_FILTER),
    }));
  }

  function updateMultiCityLeg(id: string, patch: Partial<MultiCityLeg>) {
    setSearch(current => ({
      ...current,
      multiCity: current.multiCity.map(leg => (leg.id === id ? { ...leg, ...patch } : leg)),
    }));
    markDirty();
  }

  function addMultiCityLeg() {
    if (search.multiCity.length >= 5) return;
    setSearch(current => ({
      ...current,
      multiCity: [...current.multiCity, { id: `multi-${Date.now()}`, from: "", to: "", date: "" }],
    }));
    setFilters(current => ({
      ...current,
      multi: [...current.multi, DEFAULT_LEG_FILTER].slice(0, 5),
    }));
    markDirty();
  }

  const multiColumns = useMemo(() => {
    return search.multiCity.map((leg, index) => ({
      leg,
      options: itineraries.map(item => {
        const base = index % 2 === 0 ? item.outbound : (item.inbound ?? item.outbound);
        return {
          ...base,
          id: `${base.id}-multi-${index}`,
          originCode: leg.from.slice(0, 3).toUpperCase() || base.originCode,
          destinationCode: leg.to.slice(0, 3).toUpperCase() || base.destinationCode,
        };
      }).filter(flight => legMatchesFilters(flight, filters, filters.multi[index] ?? DEFAULT_LEG_FILTER)),
    }));
  }, [search.multiCity, itineraries, filters]);

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
                  {search.multiCity.map((leg, index) => (
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
                        onChange={v => updateMultiCityLeg(leg.id, { date: v })}
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    className="oltra-button-secondary"
                    onClick={addMultiCityLeg}
                    disabled={search.multiCity.length >= 5}
                  >
                    Add flight
                  </button>
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
                    onChange={v => { setSearch(c => ({ ...c, departDate: v })); markDirty(); }}
                  />
                  {isReturnTrip ? (
                    <DateField
                      label="Return"
                      value={search.returnDate}
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
                className={isDirty ? "oltra-button-primary" : "oltra-button-secondary"}
                onClick={handleSearch}
                disabled={isLoading}
              >
                {isLoading ? "Searching…" : "Search"}
              </button>
            </div>
          </div>

          <div className="oltra-glass oltra-panel">
            <div className={styles.sectionStack}>
              <div className={styles.filterGrid}>
                <SelectField
                  label="Stops"
                  value={filters.maxStops}
                  onChange={v => setFilters(c => ({ ...c, maxStops: v as FilterState["maxStops"] }))}
                  options={["any", "direct", "1"]}
                  labels={{ any: "Any", direct: "Direct only", "1": "Max 1 stop" }}
                />
                <SelectField
                  label="Flex dates"
                  value={filters.flexDays}
                  onChange={v => setFilters(c => ({ ...c, flexDays: v as FilterState["flexDays"] }))}
                  options={["none", "+/- 1 day", "+/- 2 days"]}
                  labels={{ none: "None", "+/- 1 day": "+/- 1 day", "+/- 2 days": "+/- 2 days" }}
                />
              </div>

              {isMultiple ? (
                search.multiCity.map((leg, index) => (
                  <div key={`filters-${leg.id}`} className={styles.legFilterBlock}>
                    <div className={styles.legFilterTitle}>Flight {index + 1}</div>
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
                ))
              ) : (
                <>
                  <DurationFilter
                    label="Departure max duration"
                    value={filters.outbound.maxDurationHours}
                    onChange={v => updateLegFilter("outbound", { maxDurationHours: v })}
                  />
                  <TimeIntervalFilter
                    label="Departure time"
                    value={filters.outbound}
                    onChange={patch => updateLegFilter("outbound", patch)}
                  />
                  {isReturnTrip ? (
                    <>
                      <DurationFilter
                        label="Return max duration"
                        value={filters.inbound.maxDurationHours}
                        onChange={v => updateLegFilter("inbound", { maxDurationHours: v })}
                      />
                      <TimeIntervalFilter
                        label="Return time"
                        value={filters.inbound}
                        onChange={patch => updateLegFilter("inbound", patch)}
                      />
                    </>
                  ) : null}
                </>
              )}

              {allAirlines.length > 0 && (
                <ChipGroup
                  label="Airlines"
                  items={allAirlines}
                  selected={filters.airlines}
                  onToggle={toggleAirline}
                />
              )}

              {layoverAirports.length > 0 && (
                <ChipGroup
                  label="Lay-over airports"
                  items={layoverAirports}
                  selected={filters.layoverAirports}
                  onToggle={toggleLayoverAirport}
                />
              )}
            </div>
          </div>
        </aside>

        <div className="oltra-glass oltra-panel">
          <div className={styles.resultsStack}>
            <div className={styles.resultsMeta}>
              <div className={styles.route}>
                {isMultiple ? "Multi-city itinerary" : `${search.from} → ${search.to}`}
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
                <div
                  className={styles.multiResultsScoped}
                  style={{ "--multi-columns": multiColumns.length } as React.CSSProperties}
                >
                  <MultipleResults columns={multiColumns} />
                </div>
              ) : (
                <>
                  <div className={styles.pinnedStack}>
                    {recommended ? (
                      <PinnedRow label="Recommended" variant="recommended" itinerary={recommended} oneWay={isOneWay} onBook={handleBook} />
                    ) : null}
                    {fastest ? (
                      <PinnedRow label="Fastest" variant="fastest" itinerary={fastest} oneWay={isOneWay} onBook={handleBook} />
                    ) : null}
                  </div>

                  <div className={isOneWay ? styles.resultsGridOneWay : styles.resultsGrid}>
                    <div className={styles.columnBox}>
                      <div className={styles.columnLabel}>Departure</div>
                      <div className={styles.cardStack}>
                        {outboundOptions.length ? (
                          outboundOptions.map(flight => (
                            <button
                              key={flight.id}
                              type="button"
                              onClick={() => setSelectedOutboundId(flight.id)}
                              className={`${styles.selectCard} ${flight.id === selectedOutboundId ? styles.selectCardActive : ""}`}
                            >
                              <FlightCardContent flight={flight} />
                            </button>
                          ))
                        ) : (
                          <div className={styles.emptyHint}>No departure flights match the selected filters.</div>
                        )}
                      </div>
                    </div>

                    {!isOneWay ? (
                      <div className={styles.columnBox}>
                        <div className={styles.columnLabel}>Return</div>
                        <div className={styles.cardStack}>
                          {!selectedOutboundId ? (
                            <div className={styles.emptyHint}>Select a departure flight to see return options.</div>
                          ) : visibleReturnItineraries.length ? (
                            visibleReturnItineraries.map(item => (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => setSelectedReturnId(item.id)}
                                className={`${styles.selectCard} ${item.id === selectedReturnId ? styles.selectCardActive : ""}`}
                              >
                                {item.inbound ? <FlightCardContent flight={item.inbound} /> : null}
                              </button>
                            ))
                          ) : (
                            <div className={styles.emptyHint}>No compatible return flights found.</div>
                          )}
                        </div>
                      </div>
                    ) : null}

                    <div className={styles.priceColumn}>
                      <div className={styles.columnLabel}>Price</div>
                      <div className={styles.cardStack}>
                        {isOneWay
                          ? outboundOptions
                              .map(flight => itineraryByOutboundId.get(flight.id))
                              .filter((it): it is Itinerary => Boolean(it))
                              .map(it => {
                                const isSelected = it.outbound.id === selectedOutboundId;
                                return (
                                  <PriceCard
                                    key={it.id}
                                    itinerary={it}
                                    onBook={handleBook}
                                    active={isSelected}
                                    lit={isSelected}
                                  />
                                );
                              })
                          : selectedOutboundId
                          ? visibleReturnItineraries.map(it => {
                              const isSelected = it.id === selectedReturnId;
                              return (
                                <PriceCard
                                  key={it.id}
                                  itinerary={it}
                                  onBook={handleBook}
                                  active={isSelected}
                                  lit={isSelected}
                                />
                              );
                            })
                          : null}
                      </div>
                    </div>
                  </div>

                  {selectedItinerary ? (
                    <BookingBar itinerary={selectedItinerary} onBook={handleBook} />
                  ) : null}
                </>
              )
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="oltra-label">{label}</label>
      <input type="date" value={value} onChange={e => onChange(e.target.value)} className="oltra-input" />
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
        style={{ "--start": `${(value.departStartHour / 23) * 100}%`, "--end": `${(value.departEndHour / 23) * 100}%` } as React.CSSProperties}
      >
        <input
          type="range" min={0} max={23} step={1} value={value.departStartHour}
          onChange={e => onChange({ departStartHour: Math.min(Number(e.target.value), value.departEndHour - 1) })}
          className={styles.rangeThumb}
        />
        <input
          type="range" min={0} max={23} step={1} value={value.departEndHour}
          onChange={e => onChange({ departEndHour: Math.max(Number(e.target.value), value.departStartHour + 1) })}
          className={styles.rangeThumb}
        />
      </div>
    </div>
  );
}

function ChipGroup({
  label, items, selected, onToggle,
}: {
  label: string; items: string[]; selected: string[]; onToggle: (v: string) => void;
}) {
  return (
    <div>
      <label className="oltra-label">{label}</label>
      <div className={styles.chips}>
        {items.map(item => {
          const active = selected.includes(item);
          return (
            <button
              key={item} type="button" onClick={() => onToggle(item)}
              className={`${styles.airlineChip} ${active ? styles.airlineChipActive : ""}`}
            >
              {item}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MultipleResults({ columns }: { columns: { leg: MultiCityLeg; options: FlightLeg[] }[] }) {
  const recommendedFlights = columns.map(c => c.options[0]).filter(Boolean) as FlightLeg[];
  const fastestFlights = columns.map(c => c.options[1] ?? c.options[0]).filter(Boolean) as FlightLeg[];

  return (
    <>
      <div className={styles.multiResultsHeader}>
        {columns.map((col, i) => (
          <div key={col.leg.id} className={styles.columnHeader}>
            Flight {i + 1} · {col.leg.from || "From"} → {col.leg.to || "To"}
          </div>
        ))}
        <div className={`${styles.columnHeader} ${styles.columnHeaderRight}`}>Price</div>
      </div>
      <div className={styles.pinnedStack}>
        <MultiPinnedRow label="Recommended" flights={recommendedFlights} />
        <MultiPinnedRow label="Fastest" flights={fastestFlights} />
      </div>
      <div className={styles.multiResultsGridFixed}>
        {columns.map(col => (
          <div key={col.leg.id} className={styles.columnBox}>
            <div className={styles.cardStack}>
              {col.options.length ? (
                col.options.map(f => (
                  <div key={f.id} className="oltra-output"><FlightCardContent flight={f} /></div>
                ))
              ) : (
                <div className="oltra-output">No flights match the selected filters.</div>
              )}
            </div>
          </div>
        ))}
        <div className={styles.priceColumn}>
          <div className={styles.cardStack}>
            <div className={`oltra-output ${styles.priceCard}`}>
              <div className={styles.priceCurrency}>—</div>
              <div className={styles.priceValue}>—</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function MultiPinnedRow({ label, flights }: { label: string; flights: FlightLeg[] }) {
  return (
    <div className={styles.pinnedRow}>
      <div className={styles.pinnedLabel}>{label}</div>
      <div
        className={styles.multiPinnedGrid}
        style={{ gridTemplateColumns: `repeat(${flights.length}, minmax(0, 1fr)) 112px` }}
      >
        {flights.map(f => (
          <div key={f.id} className="oltra-output"><FlightCardContent flight={f} /></div>
        ))}
        <div className={`oltra-output ${styles.priceCard}`}>
          <div className={styles.priceCurrency}>—</div>
          <div className={styles.priceValue}>—</div>
        </div>
      </div>
    </div>
  );
}

function PinnedRow({ label, variant, itinerary, oneWay, onBook }: { label: string; variant: "recommended" | "fastest"; itinerary: Itinerary; oneWay: boolean; onBook: (id: string) => void }) {
  const rowClass = variant === "recommended" ? styles.pinnedRowRecommended : styles.pinnedRowFastest;
  const labelClass = variant === "recommended" ? styles.pinnedLabelRecommended : styles.pinnedLabelFastest;
  return (
    <div className={`${styles.pinnedRow} ${rowClass}`}>
      <div className={`${styles.pinnedLabel} ${labelClass}`}>{label}</div>
      <div className={oneWay ? styles.pinnedGridOneWay : styles.pinnedGrid}>
        <div className={styles.staticCard}><FlightCardContent flight={itinerary.outbound} /></div>
        {!oneWay && itinerary.inbound ? (
          <div className={styles.staticCard}><FlightCardContent flight={itinerary.inbound} /></div>
        ) : null}
        <PriceCard itinerary={itinerary} onBook={onBook} active />
      </div>
    </div>
  );
}

function BookingBar({ itinerary, onBook }: { itinerary: Itinerary; onBook: (id: string) => void }) {
  const { currency, format } = useCurrency();
  return (
    <div className={styles.bookingBar}>
      <div className={styles.bookingBarInfo}>
        <span className={styles.bookingBarCurrency}>{currency}</span>
        <span className={styles.bookingBarAmount}>{format(itinerary.priceEur, itinerary.currency)}</span>
      </div>
      <button
        type="button"
        className="oltra-button-primary"
        onClick={() => onBook(itinerary.offerId)}
      >
        Book
      </button>
    </div>
  );
}

function PriceCard({
  itinerary,
  onBook,
  active = false,
  lit = false,
}: {
  itinerary: Itinerary;
  onBook: (id: string) => void;
  active?: boolean;
  lit?: boolean;
}) {
  const { currency, format } = useCurrency();
  return (
    <div className={`oltra-output ${styles.priceCard} ${lit ? styles.priceCardLit : ""}`}>
      <div className={styles.priceCurrency}>{currency}</div>
      <div className={styles.priceValue}>{format(itinerary.priceEur, itinerary.currency)}</div>
      <button
        type="button"
        className={`${styles.bookButton} ${active ? styles.bookButtonActive : ""}`}
        onClick={() => onBook(itinerary.offerId)}
      >
        Book
      </button>
    </div>
  );
}

function FlightCardContent({ flight }: { flight: FlightLeg }) {
  const stopsLabel = flight.stops === 0 ? "Direct" : `${flight.stops} stop${flight.stops > 1 ? "s" : ""}`;
  return (
    <div className={styles.flightCardInner}>
      <div className={styles.flightTimesRow}>
        <span className={styles.flightDepart}>{flight.departTime}</span>
        <span className={styles.flightArrow}>→</span>
        <span className={styles.flightArrive}>{flight.arriveTime}</span>
        <span className={styles.flightDurStop}>{formatDuration(flight.durationMinutes)} · {stopsLabel}</span>
      </div>
      <div className={styles.flightMetaRow}>
        <span className={styles.flightMetaText}>{flight.airline}</span>
        {flight.stopSummary ? (
          <>
            <span className={styles.flightMetaDot}>·</span>
            <span className={styles.flightMetaText}>{flight.stopSummary}</span>
          </>
        ) : null}
      </div>
    </div>
  );
}
