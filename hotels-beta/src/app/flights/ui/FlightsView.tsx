"use client";

import { useEffect, useMemo, useState } from "react";
import GuestSelector from "@/components/site/GuestSelector";
import OltraSelect from "@/components/site/OltraSelect";
import { readHotelFlightSearch, saveHotelFlightSearch } from "@/lib/searchSession";
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

type FlightLeg = {
  id: string;
  airline: string;
  flightNumber: string;
  originCode: string;
  destinationCode: string;
  departTime: string;
  arriveTime: string;
  durationMinutes: number;
  stops: number;
  stopSummary: string;
};

type Itinerary = {
  id: string;
  outbound: FlightLeg;
  inbound: FlightLeg;
  priceEur: number;
  tags?: string[];
  score: number;
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
  from: "Copenhagen",
  to: "Phuket",
  departDate: "2026-07-04",
  returnDate: "2026-07-15",
  adults: 2,
  children: 0,
  cabin: "Business",
  multiCity: [
    { id: "multi-1", from: "Copenhagen", to: "Bangkok", date: "2026-07-04" },
    { id: "multi-2", from: "Bangkok", to: "Phuket", date: "2026-07-07" },
    { id: "multi-3", from: "Phuket", to: "Copenhagen", date: "2026-07-15" },
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

const MOCK_ITINERARIES: Itinerary[] = [
  makeItinerary("1", "SAS", "SK 975", "SK 976", "09:10", "11:30", 755, 790, "Vienna", 1240, 96, ["Recommended"]),
  makeItinerary("2", "Lufthansa", "LH 829", "LH 830", "07:20", "10:25", 680, 695, "Munich", 1460, 90, ["Fastest"]),
  makeItinerary("3", "Qatar Airways", "QR 160", "QR 161", "15:05", "20:05", 890, 905, "Doha", 1185, 84),
  makeItinerary("4", "Turkish Airlines", "TK 1786", "TK 1787", "12:10", "21:40", 910, 930, "Istanbul", 1020, 80),
  makeItinerary("5", "Emirates", "EK 152", "EK 153", "14:45", "22:50", 950, 965, "Dubai", 980, 72),
];

function makeItinerary(
  id: string,
  airline: string,
  outNo: string,
  inNo: string,
  outTime: string,
  inTime: string,
  outDuration: number,
  inDuration: number,
  layover: string,
  price: number,
  score: number,
  tags?: string[]
): Itinerary {
  return {
    id: `iti-${id}`,
    priceEur: price,
    score,
    tags,
    outbound: {
      id: `out-${id}`,
      airline,
      flightNumber: outNo,
      originCode: "CPH",
      destinationCode: id === "1" ? "BKK" : "HKT",
      departTime: outTime,
      arriveTime: id === "2" ? "22:10" : "11:35",
      durationMinutes: outDuration,
      stops: 1,
      stopSummary: `1 stop · ${layover} 1h 25m`,
    },
    inbound: {
      id: `in-${id}`,
      airline,
      flightNumber: inNo,
      originCode: id === "1" ? "BKK" : "HKT",
      destinationCode: "CPH",
      departTime: inTime,
      arriveTime: "19:10",
      durationMinutes: inDuration,
      stops: 1,
      stopSummary: `1 stop · ${layover} 1h 15m`,
    },
  };
}

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
    to:
      normalizeParam(source.city) ||
      normalizeParam(source.q) ||
      normalizeParam(source.country) ||
      normalizeParam(source.region) ||
      INITIAL_SEARCH.to,
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
  const match = leg.stopSummary.match(/·\s*([^0-9]+?)\s+\d/);
  return match?.[1]?.trim() ?? "";
}

function legMatchesFilters(
  leg: FlightLeg,
  filters: FilterState,
  legFilter: LegFilter
): boolean {
  if (filters.maxStops === "direct" && leg.stops !== 0) return false;
  if (filters.maxStops === "1" && leg.stops > 1) return false;
  if (leg.durationMinutes > legFilter.maxDurationHours * 60) return false;

  const hour = getHour(leg.departTime);
  if (hour < legFilter.departStartHour || hour > legFilter.departEndHour) return false;

  if (filters.airlines.length > 0 && !filters.airlines.includes(leg.airline)) return false;

  const layoverAirport = getLayoverAirport(leg);
  if (
    layoverAirport &&
    filters.layoverAirports.length > 0 &&
    !filters.layoverAirports.includes(layoverAirport)
  ) {
    return false;
  }

  return true;
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function getPinnedItineraries(itineraries: Itinerary[], tripType: TripType) {
  const recommended = itineraries.find((item) => item.tags?.includes("Recommended")) ?? null;
  const fastest =
    itineraries.find((item) => item.tags?.includes("Fastest")) ??
    [...itineraries].sort((a, b) => {
      const aDuration =
        tripType === "one-way"
          ? a.outbound.durationMinutes
          : a.outbound.durationMinutes + a.inbound.durationMinutes;
      const bDuration =
        tripType === "one-way"
          ? b.outbound.durationMinutes
          : b.outbound.durationMinutes + b.inbound.durationMinutes;
      return aDuration - bDuration;
    })[0] ??
    null;

  return { recommended, fastest };
}

export default function FlightsView({ searchParams }: Props) {
  const [search, setSearch] = useState<SearchState>(() => buildInitialSearch(searchParams));
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);
  const [selectedOutboundId, setSelectedOutboundId] = useState("");

  const isReturnTrip = search.tripType === "return";
  const isOneWay = search.tripType === "one-way";
  const isMultiple = search.tripType === "multiple";

  useEffect(() => {
    setSearch((current) => ({
      ...current,
      to:
        normalizeParam(searchParams.city) ||
        normalizeParam(searchParams.q) ||
        normalizeParam(searchParams.country) ||
        current.to,
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
    () => [...new Set(MOCK_ITINERARIES.map((item) => item.outbound.airline))].sort(),
    []
  );

  const layoverAirports = useMemo(
    () =>
      [
        ...new Set(
          MOCK_ITINERARIES.flatMap((item) => [
            getLayoverAirport(item.outbound),
            getLayoverAirport(item.inbound),
          ]).filter(Boolean)
        ),
      ].sort(),
    []
  );

  useEffect(() => {
    if (filters.airlines.length || filters.layoverAirports.length) return;
    setFilters((current) => ({
      ...current,
      airlines: allAirlines,
      layoverAirports,
    }));
  }, [allAirlines, layoverAirports, filters.airlines.length, filters.layoverAirports.length]);

  const filteredItineraries = useMemo(() => {
    return MOCK_ITINERARIES.filter((item) => {
      const outboundMatches = legMatchesFilters(item.outbound, filters, filters.outbound);
      if (isOneWay || isMultiple) return outboundMatches;
      return outboundMatches && legMatchesFilters(item.inbound, filters, filters.inbound);
    }).sort((a, b) => b.score - a.score);
  }, [filters, isOneWay, isMultiple]);

  const { recommended, fastest } = useMemo(
    () => getPinnedItineraries(filteredItineraries, search.tripType),
    [filteredItineraries, search.tripType]
  );

  const pinnedIds = useMemo(
    () => new Set([recommended?.id, fastest?.id].filter(Boolean) as string[]),
    [recommended, fastest]
  );

  const standardItineraries = useMemo(
    () => filteredItineraries.filter((item) => !pinnedIds.has(item.id)),
    [filteredItineraries, pinnedIds]
  );

  const outboundOptions = useMemo(
    () => dedupeById(standardItineraries.map((item) => item.outbound)),
    [standardItineraries]
  );

  useEffect(() => {
    if (!outboundOptions.length) {
      setSelectedOutboundId("");
      return;
    }

    if (outboundOptions.some((flight) => flight.id === selectedOutboundId)) return;
    setSelectedOutboundId(outboundOptions[0].id);
  }, [outboundOptions, selectedOutboundId]);

  const visibleReturnItineraries = useMemo(() => {
    if (!selectedOutboundId) return [];
    return standardItineraries.filter((item) => item.outbound.id === selectedOutboundId);
  }, [selectedOutboundId, standardItineraries]);

  const multiColumns = useMemo(() => {
    return search.multiCity.map((leg, index) => ({
      leg,
      options: MOCK_ITINERARIES.map((item) => {
        const base = index % 2 === 0 ? item.outbound : item.inbound;
        return {
          ...base,
          id: `${base.id}-multi-${index}`,
          originCode: leg.from.slice(0, 3).toUpperCase() || base.originCode,
          destinationCode: leg.to.slice(0, 3).toUpperCase() || base.destinationCode,
        };
      }).filter((flight) =>
        legMatchesFilters(flight, filters, filters.multi[index] ?? DEFAULT_LEG_FILTER)
      ),
    }));
  }, [search.multiCity, filters]);

  function toggleAirline(airline: string) {
    setFilters((current) => ({
      ...current,
      airlines: current.airlines.includes(airline)
        ? current.airlines.filter((value) => value !== airline)
        : [...current.airlines, airline],
    }));
  }

  function toggleLayoverAirport(airport: string) {
    setFilters((current) => ({
      ...current,
      layoverAirports: current.layoverAirports.includes(airport)
        ? current.layoverAirports.filter((value) => value !== airport)
        : [...current.layoverAirports, airport],
    }));
  }

  function updateLegFilter(key: "outbound" | "inbound", patch: Partial<LegFilter>) {
    setFilters((current) => ({
      ...current,
      [key]: {
        ...current[key],
        ...patch,
      },
    }));
  }

  function updateMultiLegFilter(index: number, patch: Partial<LegFilter>) {
    setFilters((current) => ({
      ...current,
      multi: current.multi.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      ),
    }));
  }

  function setTripType(tripType: TripType) {
    setSearch((current) => ({ ...current, tripType }));

    setFilters((current) => ({
      ...current,
      multi: current.multi.length
        ? current.multi
        : Array.from({ length: search.multiCity.length }, () => DEFAULT_LEG_FILTER),
    }));
  }

  function updateMultiCityLeg(id: string, patch: Partial<MultiCityLeg>) {
    setSearch((current) => ({
      ...current,
      multiCity: current.multiCity.map((leg) =>
        leg.id === id ? { ...leg, ...patch } : leg
      ),
    }));
  }

  function addMultiCityLeg() {
    if (search.multiCity.length >= 5) return;

    setSearch((current) => ({
      ...current,
      multiCity: [
        ...current.multiCity,
        {
          id: `multi-${Date.now()}`,
          from: "",
          to: "",
          date: "",
        },
      ],
    }));

    setFilters((current) => ({
      ...current,
      multi: [...current.multi, DEFAULT_LEG_FILTER].slice(0, 5),
    }));
  }

  return (
    <section className={styles.page}>
      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <div className={`${styles.searchPanel} oltra-glass oltra-panel`}>
            <div className={styles.sectionStack}>
              <div className={styles.tripTypeTabs}>
                {[
                  ["one-way", "One-way"],
                  ["return", "Return"],
                  ["multiple", "Multiple"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTripType(value as TripType)}
                    className={[
                      "oltra-button-secondary",
                      search.tripType === value ? styles.segmentButtonActive : "",
                    ].join(" ")}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {isMultiple ? (
                <div className={styles.multiCityStack}>
                  {search.multiCity.map((leg, index) => (
                    <div key={leg.id} className={styles.multiCityRow}>
                      <Field
                        label={`From ${index + 1}`}
                        value={leg.from}
                        onChange={(value) => updateMultiCityLeg(leg.id, { from: value })}
                      />
                      <Field
                        label="To"
                        value={leg.to}
                        onChange={(value) => updateMultiCityLeg(leg.id, { to: value })}
                      />
                      <DateField
                        label="Date"
                        value={leg.date}
                        onChange={(value) => updateMultiCityLeg(leg.id, { date: value })}
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
                  <Field
                    label="From"
                    value={search.from}
                    onChange={(value) => setSearch((current) => ({ ...current, from: value }))}
                  />
                  <Field
                    label="To"
                    value={search.to}
                    onChange={(value) => setSearch((current) => ({ ...current, to: value }))}
                  />
                  <DateField
                    label="Depart"
                    value={search.departDate}
                    onChange={(value) =>
                      setSearch((current) => ({ ...current, departDate: value }))
                    }
                  />
                  {isReturnTrip ? (
                    <DateField
                      label="Return"
                      value={search.returnDate}
                      onChange={(value) =>
                        setSearch((current) => ({ ...current, returnDate: value }))
                      }
                    />
                  ) : null}
                </div>
              )}

              <div className={styles.guestCabinGrid}>
                <div>
                  <label className="oltra-label">Guests</label>
                  <GuestSelector
                    initialValue={{
                      adults: search.adults,
                      kids: search.children,
                      kidAges: [],
                    }}
                    onChange={(selection) =>
                      setSearch((current) => ({
                        ...current,
                        adults: selection.adults,
                        children: selection.kids,
                      }))
                    }
                  />
                </div>

                <div>
                  <label className="oltra-label">Cabin</label>
                  <OltraSelect
                    name="cabin"
                    value={search.cabin}
                    placeholder="Cabin"
                    align="left"
                    onValueChange={(value) =>
                      setSearch((current) => ({ ...current, cabin: value as CabinClass }))
                    }
                    options={["Economy", "Premium Economy", "Business", "First"].map(
                      (value) => ({ value, label: value })
                    )}
                  />
                </div>
              </div>

              <button type="button" className="oltra-button-primary">
                Search
              </button>
            </div>
          </div>

          <div className="oltra-glass oltra-panel">
            <div className={styles.sectionStack}>
              <div className={styles.filterGrid}>
                <SelectField
                  label="Stops"
                  value={filters.maxStops}
                  onChange={(value) =>
                    setFilters((current) => ({
                      ...current,
                      maxStops: value as FilterState["maxStops"],
                    }))
                  }
                  options={["any", "direct", "1"]}
                  labels={{ any: "Any", direct: "Direct only", "1": "Max 1 stop" }}
                />

                <SelectField
                  label="Flex dates"
                  value={filters.flexDays}
                  onChange={(value) =>
                    setFilters((current) => ({
                      ...current,
                      flexDays: value as FilterState["flexDays"],
                    }))
                  }
                  options={["none", "+/- 1 day", "+/- 2 days"]}
                  labels={{
                    none: "None",
                    "+/- 1 day": "+/- 1 day",
                    "+/- 2 days": "+/- 2 days",
                  }}
                />
              </div>

              {isMultiple ? (
                search.multiCity.map((leg, index) => (
                  <div key={`filters-${leg.id}`} className={styles.legFilterBlock}>
                    <div className={styles.legFilterTitle}>Flight {index + 1}</div>
                    <DurationFilter
                      label="Max duration"
                      value={filters.multi[index]?.maxDurationHours ?? 20}
                      onChange={(value) => updateMultiLegFilter(index, { maxDurationHours: value })}
                    />
                    <TimeIntervalFilter
                      label="Departure time"
                      value={filters.multi[index] ?? DEFAULT_LEG_FILTER}
                      onChange={(patch) => updateMultiLegFilter(index, patch)}
                    />
                  </div>
                ))
              ) : (
                <>
                  <DurationFilter
                    label="Departure max duration"
                    value={filters.outbound.maxDurationHours}
                    onChange={(value) => updateLegFilter("outbound", { maxDurationHours: value })}
                  />
                  <TimeIntervalFilter
                    label="Departure time"
                    value={filters.outbound}
                    onChange={(patch) => updateLegFilter("outbound", patch)}
                  />

                  {isReturnTrip ? (
                    <>
                      <DurationFilter
                        label="Return max duration"
                        value={filters.inbound.maxDurationHours}
                        onChange={(value) =>
                          updateLegFilter("inbound", { maxDurationHours: value })
                        }
                      />
                      <TimeIntervalFilter
                        label="Return time"
                        value={filters.inbound}
                        onChange={(patch) => updateLegFilter("inbound", patch)}
                      />
                    </>
                  ) : null}
                </>
              )}

              <ChipGroup
                label="Airlines"
                items={allAirlines}
                selected={filters.airlines}
                onToggle={toggleAirline}
              />

              <ChipGroup
                label="Lay-over airports"
                items={layoverAirports}
                selected={filters.layoverAirports}
                onToggle={toggleLayoverAirport}
              />
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
                {filteredItineraries.length} itineraries · {search.adults} adults
                {search.children > 0 ? `, ${search.children} children` : ""} · {search.cabin}
              </div>
            </div>

            {isMultiple ? (
              <div
                className={styles.multiResultsScoped}
                style={{ "--multi-columns": multiColumns.length } as React.CSSProperties}
              >
                <MultipleResults columns={multiColumns} />
              </div>
            ) : (
              <>
                <div className={isOneWay ? styles.resultsColumnsHeaderOneWay : styles.resultsColumnsHeader}>
                  <div className={styles.columnHeader}>Departure flight</div>
                  {!isOneWay ? <div className={styles.columnHeader}>Return flight</div> : null}
                  <div className={`${styles.columnHeader} ${styles.columnHeaderRight}`}>Price</div>
                </div>

                <div className={styles.pinnedStack}>
                  {recommended ? (
                    <PinnedRow label="Recommended" itinerary={recommended} oneWay={isOneWay} />
                  ) : null}
                  {fastest && fastest.id !== recommended?.id ? (
                    <PinnedRow label="Fastest" itinerary={fastest} oneWay={isOneWay} />
                  ) : null}
                </div>

                <div className={isOneWay ? styles.resultsGridOneWay : styles.resultsGrid}>
                  <div className={styles.columnBox}>
                    <div className={styles.cardStack}>
                      {outboundOptions.length ? (
                        outboundOptions.map((flight) => (
                          <button
                            key={flight.id}
                            type="button"
                            onClick={() => setSelectedOutboundId(flight.id)}
                            className={`${styles.selectCard} ${
                              flight.id === selectedOutboundId ? styles.selectCardActive : ""
                            }`}
                          >
                            <FlightCardContent flight={flight} />
                          </button>
                        ))
                      ) : (
                        <div className="oltra-output">No departure flights match the selected filters.</div>
                      )}
                    </div>
                  </div>

                  {!isOneWay ? (
                    <div className={styles.columnBox}>
                      <div className={styles.cardStack}>
                        {!selectedOutboundId ? (
                          <div className="oltra-output">Select a departure flight to view return options.</div>
                        ) : visibleReturnItineraries.length ? (
                          visibleReturnItineraries.map((item) => (
                            <div key={item.id} className="oltra-output">
                              <FlightCardContent flight={item.inbound} />
                            </div>
                          ))
                        ) : (
                          <div className="oltra-output">No compatible return flights found.</div>
                        )}
                      </div>
                    </div>
                  ) : null}

                  <div className={styles.priceColumn}>
                    <div className={styles.cardStack}>
                      {!selectedOutboundId ? (
                        <div className="oltra-output">Price appears when a departure flight is selected.</div>
                      ) : visibleReturnItineraries.length ? (
                        visibleReturnItineraries.map((item) => (
                          <PriceCard key={item.id} itinerary={item} />
                        ))
                      ) : (
                        <div className="oltra-output">No prices available.</div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="oltra-label">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="oltra-input" />
    </div>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="oltra-label">{label}</label>
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="oltra-input" />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  labels,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  labels?: Record<string, string>;
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
        options={options.map((option) => ({ value: option, label: labels?.[option] ?? option }))}
      />
    </div>
  );
}

function DurationFilter({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div>
      <label className="oltra-label">
        {label} · {value}h
      </label>
      <input
        type="range"
        min={6}
        max={24}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={styles.range}
      />
    </div>
  );
}

function TimeIntervalFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: LegFilter;
  onChange: (patch: Partial<LegFilter>) => void;
}) {
  return (
    <div>
      <label className="oltra-label">
        {label} · {String(value.departStartHour).padStart(2, "0")}:00–
        {String(value.departEndHour).padStart(2, "0")}:00
      </label>

      <div
        className={styles.rangeSlider}
        style={
          {
            "--start": `${(value.departStartHour / 23) * 100}%`,
            "--end": `${(value.departEndHour / 23) * 100}%`,
          } as React.CSSProperties
        }
      >
        <input
          type="range"
          min={0}
          max={23}
          step={1}
          value={value.departStartHour}
          onChange={(e) => {
            const next = Math.min(Number(e.target.value), value.departEndHour - 1);
            onChange({ departStartHour: next });
          }}
          className={styles.rangeThumb}
        />

        <input
          type="range"
          min={0}
          max={23}
          step={1}
          value={value.departEndHour}
          onChange={(e) => {
            const next = Math.max(Number(e.target.value), value.departStartHour + 1);
            onChange({ departEndHour: next });
          }}
          className={styles.rangeThumb}
        />
      </div>
    </div>
  );
}

function ChipGroup({
  label,
  items,
  selected,
  onToggle,
}: {
  label: string;
  items: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div>
      <label className="oltra-label">{label}</label>
      <div className={styles.chips}>
        {items.map((item) => {
          const active = selected.includes(item);
          return (
            <button
              key={item}
              type="button"
              onClick={() => onToggle(item)}
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

function MultipleResults({
  columns,
}: {
  columns: { leg: MultiCityLeg; options: FlightLeg[] }[];
}) {
  const recommendedPrice = 1840;
  const fastestPrice = 1975;

  const recommendedFlights = columns.map((column) => column.options[0]).filter(Boolean);
  const fastestFlights = columns.map((column) => column.options[1] ?? column.options[0]).filter(Boolean);

  return (
    <>
      <div className={styles.multiResultsHeader}>
        {columns.map((column, index) => (
          <div key={column.leg.id} className={styles.columnHeader}>
            Flight {index + 1} · {column.leg.from || "From"} → {column.leg.to || "To"}
          </div>
        ))}
        <div className={`${styles.columnHeader} ${styles.columnHeaderRight}`}>Price</div>
      </div>

      <div className={styles.pinnedStack}>
        <MultiPinnedRow
          label="Recommended"
          flights={recommendedFlights}
          price={recommendedPrice}
        />

        <MultiPinnedRow
          label="Fastest"
          flights={fastestFlights}
          price={fastestPrice}
        />
      </div>

      <div className={styles.multiResultsGridFixed}>
        {columns.map((column) => (
          <div key={column.leg.id} className={styles.columnBox}>
            <div className={styles.cardStack}>
              {column.options.length ? (
                column.options.map((flight) => (
                  <div key={flight.id} className="oltra-output">
                    <FlightCardContent flight={flight} />
                  </div>
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
              <div className={styles.priceCurrency}>EUR</div>
              <div className={styles.priceValue}>{formatPrice(recommendedPrice)}</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function MultiPinnedRow({
  label,
  flights,
  price,
}: {
  label: string;
  flights: FlightLeg[];
  price: number;
}) {
  return (
    <div className={styles.pinnedRow}>
      <div className={styles.pinnedLabel}>{label}</div>

      <div
        className={styles.multiPinnedGrid}
        style={{ gridTemplateColumns: `repeat(${flights.length}, minmax(0, 1fr)) 112px` }}
      >
        {flights.map((flight) => (
          <div key={flight.id} className="oltra-output">
            <FlightCardContent flight={flight} />
          </div>
        ))}

        <div className={`oltra-output ${styles.priceCard}`}>
          <div className={styles.priceCurrency}>EUR</div>
          <div className={styles.priceValue}>{formatPrice(price)}</div>
        </div>
      </div>
    </div>
  );
}

function PinnedRow({ label, itinerary, oneWay }: { label: string; itinerary: Itinerary; oneWay: boolean }) {
  return (
    <div className={styles.pinnedRow}>
      <div className={styles.pinnedLabel}>{label}</div>
      <div className={oneWay ? styles.pinnedGridOneWay : styles.pinnedGrid}>
        <div className="oltra-output">
          <FlightCardContent flight={itinerary.outbound} />
        </div>
        {!oneWay ? (
          <div className="oltra-output">
            <FlightCardContent flight={itinerary.inbound} />
          </div>
        ) : null}
        <PriceCard itinerary={itinerary} />
      </div>
    </div>
  );
}

function PriceCard({ itinerary }: { itinerary: Itinerary }) {
  return (
    <div className={`oltra-output ${styles.priceCard}`}>
      <div className={styles.priceCurrency}>EUR</div>
      <div className={styles.priceValue}>{formatPrice(itinerary.priceEur)}</div>
    </div>
  );
}

function FlightCardContent({ flight }: { flight: FlightLeg }) {
  return (
    <div className={styles.flightCardInner}>
      <div className={styles.flightTop}>
        <div>
          <div className={styles.flightAirline}>{flight.airline}</div>
          <div className={styles.flightNumber}>{flight.flightNumber}</div>
        </div>
        <div className={styles.flightStops}>{flight.stops === 0 ? "Direct" : `${flight.stops} stop`}</div>
      </div>

      <div className={styles.flightTimes}>
        <div>
          <div className={styles.flightTime}>{flight.departTime}</div>
          <div className={styles.flightCode}>{flight.originCode}</div>
        </div>
        <div className={styles.flightDuration}>{formatDuration(flight.durationMinutes)}</div>
        <div className={styles.flightTimeBlockRight}>
          <div className={styles.flightTime}>{flight.arriveTime}</div>
          <div className={styles.flightCode}>{flight.destinationCode}</div>
        </div>
      </div>

      <div className={styles.flightSummary}>{flight.stopSummary}</div>
    </div>
  );
}