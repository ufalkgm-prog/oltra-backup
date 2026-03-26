"use client";

import { useEffect, useMemo, useState } from "react";
import PageShell from "@/components/site/PageShell";
import styles from "./FlightsView.module.css";

type CabinClass = "Economy" | "Premium Economy" | "Business" | "First";

type SearchState = {
  from: string;
  to: string;
  departDate: string;
  returnDate: string;
  adults: number;
  children: number;
  cabin: CabinClass;
};

type FilterState = {
  maxStops: "any" | "direct" | "1";
  airlines: string[];
  maxDurationHours: number;
  departTime: "any" | "morning" | "afternoon" | "evening";
  returnTime: "any" | "morning" | "afternoon" | "evening";
  flexDays: "none" | "+/- 1 day" | "+/- 2 days";
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

const INITIAL_SEARCH: SearchState = {
  from: "Copenhagen",
  to: "Phuket",
  departDate: "2026-07-04",
  returnDate: "2026-07-15",
  adults: 2,
  children: 0,
  cabin: "Business",
};

const INITIAL_FILTERS: FilterState = {
  maxStops: "any",
  airlines: [],
  maxDurationHours: 20,
  departTime: "any",
  returnTime: "any",
  flexDays: "none",
};

const MOCK_ITINERARIES: Itinerary[] = [
  {
    id: "iti-1",
    priceEur: 1240,
    score: 96,
    tags: ["Recommended"],
    outbound: {
      id: "out-1",
      airline: "SAS",
      flightNumber: "SK 975",
      originCode: "CPH",
      destinationCode: "BKK",
      departTime: "09:10",
      arriveTime: "05:45",
      durationMinutes: 755,
      stops: 1,
      stopSummary: "1 stop · Vienna 1h 25m",
    },
    inbound: {
      id: "in-1",
      airline: "SAS",
      flightNumber: "SK 976",
      originCode: "BKK",
      destinationCode: "CPH",
      departTime: "11:30",
      arriveTime: "19:10",
      durationMinutes: 790,
      stops: 1,
      stopSummary: "1 stop · Vienna 1h 15m",
    },
  },
  {
    id: "iti-2",
    priceEur: 1460,
    score: 90,
    tags: ["Fastest"],
    outbound: {
      id: "out-2",
      airline: "Lufthansa",
      flightNumber: "LH 829",
      originCode: "CPH",
      destinationCode: "HKT",
      departTime: "07:20",
      arriveTime: "22:10",
      durationMinutes: 680,
      stops: 1,
      stopSummary: "1 stop · Munich 55m",
    },
    inbound: {
      id: "in-2",
      airline: "Lufthansa",
      flightNumber: "LH 830",
      originCode: "HKT",
      destinationCode: "CPH",
      departTime: "10:25",
      arriveTime: "20:15",
      durationMinutes: 695,
      stops: 1,
      stopSummary: "1 stop · Munich 1h 05m",
    },
  },
  {
    id: "iti-3",
    priceEur: 1185,
    score: 84,
    outbound: {
      id: "out-3",
      airline: "Qatar Airways",
      flightNumber: "QR 160",
      originCode: "CPH",
      destinationCode: "HKT",
      departTime: "15:05",
      arriveTime: "12:20",
      durationMinutes: 890,
      stops: 1,
      stopSummary: "1 stop · Doha 2h 20m",
    },
    inbound: {
      id: "in-3",
      airline: "Qatar Airways",
      flightNumber: "QR 161",
      originCode: "HKT",
      destinationCode: "CPH",
      departTime: "20:05",
      arriveTime: "13:30",
      durationMinutes: 905,
      stops: 1,
      stopSummary: "1 stop · Doha 2h 10m",
    },
  },
  {
    id: "iti-4",
    priceEur: 1020,
    score: 80,
    outbound: {
      id: "out-4",
      airline: "Turkish Airlines",
      flightNumber: "TK 1786",
      originCode: "CPH",
      destinationCode: "HKT",
      departTime: "12:10",
      arriveTime: "09:50",
      durationMinutes: 910,
      stops: 1,
      stopSummary: "1 stop · Istanbul 2h 45m",
    },
    inbound: {
      id: "in-4",
      airline: "Turkish Airlines",
      flightNumber: "TK 1787",
      originCode: "HKT",
      destinationCode: "CPH",
      departTime: "21:40",
      arriveTime: "14:10",
      durationMinutes: 930,
      stops: 1,
      stopSummary: "1 stop · Istanbul 2h 55m",
    },
  },
  {
    id: "iti-5",
    priceEur: 980,
    score: 72,
    outbound: {
      id: "out-5",
      airline: "Emirates",
      flightNumber: "EK 152",
      originCode: "CPH",
      destinationCode: "HKT",
      departTime: "14:45",
      arriveTime: "11:35",
      durationMinutes: 950,
      stops: 1,
      stopSummary: "1 stop · Dubai 3h 10m",
    },
    inbound: {
      id: "in-5",
      airline: "Emirates",
      flightNumber: "EK 153",
      originCode: "HKT",
      destinationCode: "CPH",
      departTime: "22:50",
      arriveTime: "13:20",
      durationMinutes: 965,
      stops: 1,
      stopSummary: "1 stop · Dubai 2h 50m",
    },
  },
];

function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat("en-GB", {
    maximumFractionDigits: 0,
  }).format(price);
}

function matchesTimeBucket(time: string, bucket: FilterState["departTime"]): boolean {
  if (bucket === "any") return true;

  const hour = Number(time.split(":")[0] ?? 0);

  if (bucket === "morning") return hour >= 5 && hour < 12;
  if (bucket === "afternoon") return hour >= 12 && hour < 18;
  return hour >= 18 || hour < 5;
}

function legMatchesFilters(
  leg: FlightLeg,
  filters: FilterState,
  direction: "outbound" | "inbound"
): boolean {
  if (filters.maxStops === "direct" && leg.stops !== 0) return false;
  if (filters.maxStops === "1" && leg.stops > 1) return false;
  if (leg.durationMinutes > filters.maxDurationHours * 60) return false;

  if (filters.airlines.length > 0 && !filters.airlines.includes(leg.airline)) {
    return false;
  }

  if (direction === "outbound") {
    return matchesTimeBucket(leg.departTime, filters.departTime);
  }

  return matchesTimeBucket(leg.departTime, filters.returnTime);
}

function getPinnedItineraries(itineraries: Itinerary[]) {
  const recommended =
    itineraries.find((item) => item.tags?.includes("Recommended")) ?? null;

  const fastest =
    itineraries.find((item) => item.tags?.includes("Fastest")) ??
    [...itineraries].sort(
      (a, b) =>
        a.outbound.durationMinutes +
        a.inbound.durationMinutes -
        (b.outbound.durationMinutes + b.inbound.durationMinutes)
    )[0] ??
    null;

  return { recommended, fastest };
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();

  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export default function FlightsView() {
  const [search, setSearch] = useState<SearchState>(INITIAL_SEARCH);
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);
  const [selectedOutboundId, setSelectedOutboundId] = useState("");

  const allAirlines = useMemo(() => {
    return [...new Set(MOCK_ITINERARIES.map((item) => item.outbound.airline))].sort();
  }, []);

  const filteredItineraries = useMemo(() => {
    return MOCK_ITINERARIES.filter((item) => {
      return (
        legMatchesFilters(item.outbound, filters, "outbound") &&
        legMatchesFilters(item.inbound, filters, "inbound")
      );
    }).sort((a, b) => b.score - a.score);
  }, [filters]);

  const { recommended, fastest } = useMemo(
    () => getPinnedItineraries(filteredItineraries),
    [filteredItineraries]
  );

  const pinnedIds = useMemo(() => {
    return new Set([recommended?.id, fastest?.id].filter(Boolean) as string[]);
  }, [recommended, fastest]);

  const standardItineraries = useMemo(() => {
    return filteredItineraries.filter((item) => !pinnedIds.has(item.id));
  }, [filteredItineraries, pinnedIds]);

  const outboundOptions = useMemo(() => {
    return dedupeById(standardItineraries.map((item) => item.outbound));
  }, [standardItineraries]);

  useEffect(() => {
    if (!outboundOptions.length) {
      setSelectedOutboundId("");
      return;
    }

    const stillExists = outboundOptions.some((flight) => flight.id === selectedOutboundId);
    if (stillExists) return;

    setSelectedOutboundId(outboundOptions[0].id);
  }, [outboundOptions, selectedOutboundId]);

  const visibleReturnItineraries = useMemo(() => {
    if (!selectedOutboundId) return [];
    return standardItineraries.filter(
      (item) => item.outbound.id === selectedOutboundId
    );
  }, [selectedOutboundId, standardItineraries]);

  function toggleAirline(airline: string) {
    setFilters((current) => {
      const exists = current.airlines.includes(airline);

      return {
        ...current,
        airlines: exists
          ? current.airlines.filter((value) => value !== airline)
          : [...current.airlines, airline],
      };
    });
  }

  return (
    <PageShell current="flights">
      <section className={styles.page}>
        <div className="oltra-two-col">
          <aside className="oltra-stack">
            <div className="oltra-glass oltra-panel">
              <div className={styles.sectionStack}>
                <div className={styles.fieldGrid}>
                  <Field
                    label="From"
                    value={search.from}
                    onChange={(value) =>
                      setSearch((current) => ({ ...current, from: value }))
                    }
                  />
                  <Field
                    label="To"
                    value={search.to}
                    onChange={(value) =>
                      setSearch((current) => ({ ...current, to: value }))
                    }
                  />
                  <DateField
                    label="Depart"
                    value={search.departDate}
                    onChange={(value) =>
                      setSearch((current) => ({ ...current, departDate: value }))
                    }
                  />
                  <DateField
                    label="Return"
                    value={search.returnDate}
                    onChange={(value) =>
                      setSearch((current) => ({ ...current, returnDate: value }))
                    }
                  />
                </div>

                <div className={styles.compactGrid}>
                  <NumberField
                    label="Adults"
                    value={search.adults}
                    min={1}
                    onChange={(value) =>
                      setSearch((current) => ({ ...current, adults: value }))
                    }
                  />
                  <NumberField
                    label="Children"
                    value={search.children}
                    min={0}
                    onChange={(value) =>
                      setSearch((current) => ({ ...current, children: value }))
                    }
                  />
                  <SelectField
                    label="Cabin"
                    value={search.cabin}
                    onChange={(value) =>
                      setSearch((current) => ({
                        ...current,
                        cabin: value as CabinClass,
                      }))
                    }
                    options={[
                      "Economy",
                      "Premium Economy",
                      "Business",
                      "First",
                    ]}
                  />
                </div>

                <button type="button" className="oltra-button-primary">
                  Search
                </button>
              </div>
            </div>

            <div className="oltra-glass oltra-panel">
              <div className={styles.sectionStack}>
                <div className={styles.compactGrid}>
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
                    labels={{
                      any: "Any",
                      direct: "Direct only",
                      "1": "Max 1 stop",
                    }}
                  />

                  <SelectField
                    label="Departure time"
                    value={filters.departTime}
                    onChange={(value) =>
                      setFilters((current) => ({
                        ...current,
                        departTime: value as FilterState["departTime"],
                      }))
                    }
                    options={["any", "morning", "afternoon", "evening"]}
                    labels={{
                      any: "Any",
                      morning: "Morning",
                      afternoon: "Afternoon",
                      evening: "Evening",
                    }}
                  />

                  <SelectField
                    label="Return time"
                    value={filters.returnTime}
                    onChange={(value) =>
                      setFilters((current) => ({
                        ...current,
                        returnTime: value as FilterState["returnTime"],
                      }))
                    }
                    options={["any", "morning", "afternoon", "evening"]}
                    labels={{
                      any: "Any",
                      morning: "Morning",
                      afternoon: "Afternoon",
                      evening: "Evening",
                    }}
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

                <div>
                  <label className="oltra-label">
                    Max duration · {filters.maxDurationHours}h
                  </label>
                  <input
                    type="range"
                    min={6}
                    max={24}
                    step={1}
                    value={filters.maxDurationHours}
                    onChange={(e) =>
                      setFilters((current) => ({
                        ...current,
                        maxDurationHours: Number(e.target.value),
                      }))
                    }
                    className={styles.range}
                  />
                </div>

                <div>
                  <label className="oltra-label">Airlines</label>
                  <div className={styles.chips}>
                    {allAirlines.map((airline) => {
                      const active = filters.airlines.includes(airline);

                      return (
                        <button
                          key={airline}
                          type="button"
                          onClick={() => toggleAirline(airline)}
                          className={`${styles.airlineChip} ${active ? styles.airlineChipActive : ""}`}
                        >
                          {airline}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </aside>

          <div className="oltra-glass oltra-panel">
            <div className={styles.resultsStack}>
              <div className={styles.resultsMeta}>
                <div className={styles.route}>
                  {search.from} → {search.to}
                </div>
                <div className={styles.metaText}>
                  {filteredItineraries.length} itineraries · {search.adults} adults
                  {search.children > 0 ? `, ${search.children} children` : ""} · {search.cabin}
                </div>
              </div>

              <div className={styles.pinnedStack}>
                {recommended ? (
                  <PinnedRow label="Recommended" itinerary={recommended} />
                ) : null}

                {fastest && fastest.id !== recommended?.id ? (
                  <PinnedRow label="Fastest" itinerary={fastest} />
                ) : null}
              </div>

              <div className={styles.resultsColumnsHeader}>
                <div className={styles.columnHeader}>Departure flight</div>
                <div className={styles.columnHeader}>Return flight</div>
                <div className={`${styles.columnHeader} ${styles.columnHeaderRight}`}>
                  Price
                </div>
              </div>

              <div className="oltra-three-col">
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
                      <div className="oltra-output">No outbound flights match the selected filters.</div>
                    )}
                  </div>
                </div>

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

                <div className={styles.columnBox}>
                  <div className={styles.cardStack}>
                    {!selectedOutboundId ? (
                      <div className="oltra-output">Price appears when a departure flight is selected.</div>
                    ) : visibleReturnItineraries.length ? (
                      visibleReturnItineraries.map((item) => (
                        <div
                          key={item.id}
                          className={`oltra-output ${styles.priceCard}`}
                        >
                          {item.tags?.length ? (
                            <div className={styles.priceTags}>
                              {item.tags.map((tag) => (
                                <span key={tag} className={styles.inlineTag}>
                                  {tag}
                                </span>
                              ))}
                            </div>
                          ) : null}

                          <div className={styles.priceCurrency}>EUR</div>
                          <div className={styles.priceValue}>{formatPrice(item.priceEur)}</div>
                        </div>
                      ))
                    ) : (
                      <div className="oltra-output">No prices available.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="oltra-label">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="oltra-input"
      />
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="oltra-label">{label}</label>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="oltra-input"
      />
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
}) {
  return (
    <div>
      <label className="oltra-label">{label}</label>
      <input
        type="number"
        min={min}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="oltra-input"
      />
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
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="oltra-select"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {labels?.[option] ?? option}
          </option>
        ))}
      </select>
    </div>
  );
}

function PinnedRow({
  label,
  itinerary,
}: {
  label: string;
  itinerary: Itinerary;
}) {
  return (
    <div className={styles.pinnedRow}>
      <div className={styles.pinnedLabel}>{label}</div>

      <div className={styles.pinnedGrid}>
        <div className="oltra-output">
          <FlightCardContent flight={itinerary.outbound} />
        </div>
        <div className="oltra-output">
          <FlightCardContent flight={itinerary.inbound} />
        </div>
        <div className={`oltra-output ${styles.priceCard}`}>
          {itinerary.tags?.length ? (
            <div className={styles.priceTags}>
              {itinerary.tags.map((tag) => (
                <span key={tag} className={styles.inlineTag}>
                  {tag}
                </span>
              ))}
            </div>
          ) : null}

          <div className={styles.priceCurrency}>EUR</div>
          <div className={styles.priceValue}>{formatPrice(itinerary.priceEur)}</div>
        </div>
      </div>
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
        <div className={styles.flightStops}>
          {flight.stops === 0 ? "Direct" : `${flight.stops} stop`}
        </div>
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