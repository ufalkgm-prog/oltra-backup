"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import InspireMapView from "./InspireMapView";
import styles from "./InspireView.module.css";
import { filterInspireCities } from "@/lib/inspire/filterCities";
import type {
  InspireCity,
  InspireCityMatch,
  InspireMonth,
  InspirePurpose,
} from "@/lib/inspire/types";

const MONTHS: InspireMonth[] = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

const PURPOSES: Array<{ value: InspirePurpose | ""; label: string }> = [
  { value: "", label: "All" },
  { value: "beach", label: "Beach" },
  { value: "ski", label: "Ski" },
  { value: "city_break", label: "City break" },
  { value: "safari", label: "Safari" },
  { value: "mountains", label: "Mountains" },
];

const FLIGHT_HOURS = Array.from({ length: 18 }, (_, i) => i + 1);

const ORIGIN_CITIES = [
  { label: "Dubai", lat: 25.2048, lng: 55.2708 },
  { label: "London", lat: 51.5072, lng: -0.1276 },
  { label: "Paris", lat: 48.8566, lng: 2.3522 },
  { label: "New York", lat: 40.7128, lng: -74.006 },
  { label: "Tokyo", lat: 35.6762, lng: 139.6503 },
  { label: "Singapore", lat: 1.3521, lng: 103.8198 },
  { label: "Hong Kong", lat: 22.3193, lng: 114.1694 },
  { label: "Bangkok", lat: 13.7563, lng: 100.5018 },
  { label: "Los Angeles", lat: 34.0522, lng: -118.2437 },
  { label: "Chicago", lat: 41.8781, lng: -87.6298 },
  { label: "Toronto", lat: 43.6532, lng: -79.3832 },
  { label: "Frankfurt", lat: 50.1109, lng: 8.6821 },
  { label: "Amsterdam", lat: 52.3676, lng: 4.9041 },
  { label: "Madrid", lat: 40.4168, lng: -3.7038 },
  { label: "Barcelona", lat: 41.3874, lng: 2.1686 },
  { label: "Rome", lat: 41.9028, lng: 12.4964 },
  { label: "Milan", lat: 45.4642, lng: 9.19 },
  { label: "Zurich", lat: 47.3769, lng: 8.5417 },
  { label: "Geneva", lat: 46.2044, lng: 6.1432 },
  { label: "Vienna", lat: 48.2082, lng: 16.3738 },
  { label: "Munich", lat: 48.1351, lng: 11.582 },
  { label: "Berlin", lat: 52.52, lng: 13.405 },
  { label: "Copenhagen", lat: 55.6761, lng: 12.5683 },
  { label: "Stockholm", lat: 59.3293, lng: 18.0686 },
  { label: "Oslo", lat: 59.9139, lng: 10.7522 },
  { label: "Helsinki", lat: 60.1699, lng: 24.9384 },
  { label: "Istanbul", lat: 41.0082, lng: 28.9784 },
  { label: "Athens", lat: 37.9838, lng: 23.7275 },
  { label: "Lisbon", lat: 38.7223, lng: -9.1393 },
  { label: "Dublin", lat: 53.3498, lng: -6.2603 },
  { label: "Brussels", lat: 50.8503, lng: 4.3517 },
  { label: "Doha", lat: 25.2854, lng: 51.531 },
  { label: "Abu Dhabi", lat: 24.4539, lng: 54.3773 },
  { label: "Riyadh", lat: 24.7136, lng: 46.6753 },
  { label: "Jeddah", lat: 21.4858, lng: 39.1925 },
  { label: "Mumbai", lat: 19.076, lng: 72.8777 },
  { label: "Delhi", lat: 28.6139, lng: 77.209 },
  { label: "Bengaluru", lat: 12.9716, lng: 77.5946 },
  { label: "Seoul", lat: 37.5665, lng: 126.978 },
  { label: "Shanghai", lat: 31.2304, lng: 121.4737 },
  { label: "Beijing", lat: 39.9042, lng: 116.4074 },
  { label: "Sydney", lat: -33.8688, lng: 151.2093 },
  { label: "Melbourne", lat: -37.8136, lng: 144.9631 },
  { label: "Johannesburg", lat: -26.2041, lng: 28.0473 },
  { label: "Cape Town", lat: -33.9249, lng: 18.4241 },
  { label: "Nairobi", lat: -1.2921, lng: 36.8219 },
  { label: "São Paulo", lat: -23.5558, lng: -46.6396 },
  { label: "Mexico City", lat: 19.4326, lng: -99.1332 },
  { label: "Miami", lat: 25.7617, lng: -80.1918 },
  { label: "San Francisco", lat: 37.7749, lng: -122.4194 },
];

const SORTED_ORIGIN_CITIES = [...ORIGIN_CITIES].sort((a, b) =>
  a.label.localeCompare(b.label)
);

type OriginCity = (typeof ORIGIN_CITIES)[number];

type Props = {
  cities: InspireCity[];
};

type DropdownFieldProps = {
  label: string;
  valueLabel: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
};

function ChevronDown({
  className = "",
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={className}
      style={{ display: "block" }}
    >
      <path
        d="M5.5 7.5 10 12l4.5-4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DropdownField({
  label,
  valueLabel,
  open,
  onToggle,
  children,
}: DropdownFieldProps) {
  return (
    <div className={`${styles.field} ${open ? styles.fieldOpen : ""}`}>
      <div className="oltra-label">{label}</div>
      <div className={styles.dropdownWrap}>
        <button
          type="button"
          onClick={onToggle}
          className={`${styles.dropdownTrigger} ${
            open ? styles.dropdownTriggerOpen : ""
          }`}
        >
          <span className={styles.dropdownValue}>{valueLabel}</span>
          <ChevronDown
            className={`${styles.dropdownChevron} ${
              open ? styles.dropdownChevronOpen : ""
            }`}
          />
        </button>
        {open ? <div className={styles.dropdownPanel}>{children}</div> : null}
      </div>
    </div>
  );
}

function purposeToQueryLabel(purpose: InspirePurpose | ""): string {
  switch (purpose) {
    case "beach":
      return "beach";
    case "ski":
      return "ski";
    case "city_break":
      return "city break";
    case "safari":
      return "safari";
    case "mountains":
      return "mountains";
    default:
      return "";
  }
}

export default function InspireView({ cities }: Props) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement | null>(null);

  const [month, setMonth] = useState<InspireMonth>("june");
  const [purpose, setPurpose] = useState<InspirePurpose | "">("");
  const [maxFlightHours, setMaxFlightHours] = useState<number>(4);
  const [origin, setOrigin] = useState<OriginCity>(
    SORTED_ORIGIN_CITIES.find((item) => item.label === "Copenhagen") ??
      SORTED_ORIGIN_CITIES[0]
  );

  const [openMenu, setOpenMenu] = useState<
    null | "month" | "purpose" | "flight" | "origin"
  >(null);
  const [activeCityId, setActiveCityId] = useState<string | null>(null);

  useEffect(() => {
    function handleOutside(event: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenMenu(null);
    }

    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const matches = useMemo(() => {
    return filterInspireCities(cities, {
      originLat: origin.lat,
      originLng: origin.lng,
      month,
      maxFlightHours,
      purpose,
    });
  }, [cities, month, purpose, maxFlightHours, origin]);

  useEffect(() => {
    if (!matches.length) {
      setActiveCityId(null);
      return;
    }

    if (!activeCityId || !matches.some((match) => match.city.id === activeCityId)) {
      setActiveCityId(matches[0].city.id);
    }
  }, [matches, activeCityId]);

  const selectedPurposeLabel =
    PURPOSES.find((item) => item.value === purpose)?.label ?? "All";

  const monthLabel = month.charAt(0).toUpperCase() + month.slice(1);

  const goToHotels = useCallback(
    (match: InspireCityMatch) => {
      const params = new URLSearchParams();
      params.set("city", match.city.city);

      const q = purposeToQueryLabel(purpose);
      if (q) {
        params.set("q", q);
      }

      router.push(`/hotels?${params.toString()}`);
    },
    [router, purpose]
  );

  return (
    <div ref={rootRef} className={styles.page}>
      <section className={styles.content}>
        <aside className={`oltra-glass oltra-panel ${styles.sidebar}`}>
          <div className={styles.filters}>
            <div className={styles.filtersHeader}>
              <p className={styles.intro}>
                Explore destinations by season, trip purpose, and direct-flight
                radius.
              </p>
            </div>

            <div className={styles.filterGrid}>
              <DropdownField
                label="Month"
                valueLabel={monthLabel}
                open={openMenu === "month"}
                onToggle={() =>
                  setOpenMenu((prev) => (prev === "month" ? null : "month"))
                }
              >
                <div className={styles.dropdownScroll}>
                  {MONTHS.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={`${styles.dropdownOption} ${
                        month === item ? styles.dropdownOptionActive : ""
                      }`}
                      onClick={() => {
                        setMonth(item);
                        setOpenMenu(null);
                      }}
                    >
                      {item.charAt(0).toUpperCase() + item.slice(1)}
                    </button>
                  ))}
                </div>
              </DropdownField>

              <DropdownField
                label="Purpose"
                valueLabel={selectedPurposeLabel}
                open={openMenu === "purpose"}
                onToggle={() =>
                  setOpenMenu((prev) => (prev === "purpose" ? null : "purpose"))
                }
              >
                <div className={styles.dropdownScroll}>
                  {PURPOSES.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      className={`${styles.dropdownOption} ${
                        purpose === item.value ? styles.dropdownOptionActive : ""
                      }`}
                      onClick={() => {
                        setPurpose(item.value);
                        setOpenMenu(null);
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </DropdownField>

              <DropdownField
                label="Max direct flight time"
                valueLabel={`${maxFlightHours} hour${
                  maxFlightHours > 1 ? "s" : ""
                }`}
                open={openMenu === "flight"}
                onToggle={() =>
                  setOpenMenu((prev) => (prev === "flight" ? null : "flight"))
                }
              >
                <div className={styles.dropdownScroll}>
                  {FLIGHT_HOURS.map((hour) => (
                    <button
                      key={hour}
                      type="button"
                      className={`${styles.dropdownOption} ${
                        maxFlightHours === hour
                          ? styles.dropdownOptionActive
                          : ""
                      }`}
                      onClick={() => {
                        setMaxFlightHours(hour);
                        setOpenMenu(null);
                      }}
                    >
                      {hour} hour{hour > 1 ? "s" : ""}
                    </button>
                  ))}
                </div>
              </DropdownField>

              <DropdownField
                label="Starting point"
                valueLabel={origin.label}
                open={openMenu === "origin"}
                onToggle={() =>
                  setOpenMenu((prev) => (prev === "origin" ? null : "origin"))
                }
              >
                <div className={styles.dropdownScroll}>
                  {SORTED_ORIGIN_CITIES.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      className={`${styles.dropdownOption} ${
                        origin.label === item.label
                          ? styles.dropdownOptionActive
                          : ""
                      }`}
                      onClick={() => {
                        setOrigin(item);
                        setOpenMenu(null);
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </DropdownField>
            </div>
          </div>

          <div className={styles.resultsBlock}>
            <div className={styles.sidebarHeader}>
              <div className="oltra-label">Results</div>
              <div className={styles.resultCount}>
                {matches.length} destination{matches.length === 1 ? "" : "s"}
              </div>
            </div>

            <div className={styles.destinationList}>
              {matches.length === 0 ? (
                <div className={`oltra-output ${styles.destinationCard}`}>
                  <div className={styles.destinationTitle}>
                    No matching destinations
                  </div>
                  <div className={styles.destinationMeta}>
                    Try increasing max direct flight time or changing purpose/month.
                  </div>
                </div>
              ) : (
                matches.map((match) => {
                  const isActive = activeCityId === match.city.id;

                  return (
                    <button
                      key={match.city.id}
                      type="button"
                      className={`oltra-output ${styles.destinationCard} ${
                        isActive ? styles.destinationCardActive : ""
                      }`}
                      onMouseEnter={() => setActiveCityId(match.city.id)}
                      onFocus={() => setActiveCityId(match.city.id)}
                      onClick={() => goToHotels(match)}
                    >
                      <div className={styles.destinationTitle}>
                        {match.city.city}, {match.city.country}
                      </div>
                      <div className={styles.destinationMeta}>
                        {match.city.region} · {match.city.hotelCount} hotels
                      </div>
                      <div className={styles.destinationMeta}>
                        {match.selectedMonthTempC}°C avg ·{" "}
                        {match.estimatedFlightHours}h approx.
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </aside>

        <section className={styles.mapPane}>
          <InspireMapView
            matches={matches}
            activeCityId={activeCityId}
            onSelectCity={(match) => {
              setActiveCityId(match.city.id);
              goToHotels(match);
            }}
          />
        </section>
      </section>
    </div>
  );
}