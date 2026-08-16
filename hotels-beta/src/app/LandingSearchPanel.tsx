"use client";

import OltraSelect from "@/components/site/OltraSelect";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import GuestSelector from "@/components/site/GuestSelector";
import DateRangePicker from "@/components/site/DateRangePicker";
import StructuredDestinationField from "@/components/site/StructuredDestinationField";
import AirportAutocomplete from "@/app/flights/ui/AirportAutocomplete";
import { getCityForAirportIata } from "@/lib/cityAirports";
import { mergeHotelFlightSearch } from "@/lib/searchSession";
import {
  normalizeParam,
  readGuestSelection,
  type GuestSelection,
} from "@/lib/guests";
import type {
  HotelSuggestionDataset,
  SuggestionType,
} from "@/lib/hotelSearchSuggestions";
import styles from "./page.module.css";

const HOME_AIRPORT_STORAGE_KEY = "oltra_home_airport";
// Stored alongside the code so "Flights from {city}" can name a place for an
// airport that no OLTRA hotel city maps to (a home airport in a city we don't
// list hotels in), without this page importing the full airport dataset.
const HOME_AIRPORT_CITY_STORAGE_KEY = "oltra_home_airport_city";
const SEARCH_STATE_KEY = "oltra_landing_search";

const SINGLE_AIRPORT_COUNTRIES = new Set(
  ["Maldives", "Bhutan", "Brunei"].map((c) => c.toLowerCase())
);

// Prefer the curated hotel-city mapping over the airport's own municipality -
// see the matching helper in FlightsView. Never parsed out of the label (§39).
function cityForAirportCode(code: string, fallbackCity: string): string {
  if (!code) return "";
  return getCityForAirportIata(code) || fallbackCity || code;
}

type PageSearchParams = Record<string, string | string[] | undefined>;

type Props = {
  initialSearchParams: PageSearchParams;
  dataset: HotelSuggestionDataset;
};

function buildComparableSearchKey(params: PageSearchParams): string {
  const out = new URLSearchParams();

  for (const [key, raw] of Object.entries(params)) {
    if (key === "submitted") continue;

    if (Array.isArray(raw)) {
      for (const value of raw) {
        if (value) out.append(key, value);
      }
    } else if (raw) {
      out.set(key, raw);
    }
  }

  return out.toString();
}

function formatDisplayDate(value: string): string {
  if (!value) return "";

  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
    .format(new Date(year, month - 1, day))
    .replace(/ /g, " ");
}

export default function LandingSearchPanel({
  initialSearchParams,
  dataset,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [effectiveSearchParams, setEffectiveSearchParams] =
    useState<PageSearchParams>(initialSearchParams);

  const [fromValue, setFromValue] = useState(
    normalizeParam(initialSearchParams.from)
  );

  const [toValue, setToValue] = useState(
    normalizeParam(initialSearchParams.to)
  );

  const [guestSelection, setGuestSelection] = useState<GuestSelection>(
    readGuestSelection(initialSearchParams)
  );

  const [includeHotels, setIncludeHotels] = useState(
    normalizeParam(initialSearchParams.include_hotels) !== "0"
  );
  // Off unless explicitly turned on. This used to also switch itself on when
  // an `origin` was present - but a home airport is remembered in
  // localStorage and written back into the URL as a hidden field, so once a
  // user had ever picked one, Flights re-armed itself on every search and
  // looked like it was checking itself the moment dates were filled in.
  const [includeFlights, setIncludeFlights] = useState(
    normalizeParam(initialSearchParams.include_flights) === "1"
  );
  const [homeAirport, setHomeAirport] = useState(
    normalizeParam(initialSearchParams.origin)
  );
  const [homeAirportCity, setHomeAirportCity] = useState("");
  const [airportPopoverOpen, setAirportPopoverOpen] = useState(false);
  const flightsWrapRef = useRef<HTMLDivElement | null>(null);

  const [destinationState, setDestinationState] = useState<{
    activeHotelCount: number;
    hasSelection: boolean;
    selectedTypes: SuggestionType[];
    selectedValues: Partial<Record<SuggestionType, string[]>>;
  }>({
    activeHotelCount: dataset.hotels.length,
    hasSelection: false,
    selectedTypes: [],
    selectedValues: {},
  });

  const formRef = useRef<HTMLFormElement | null>(null);
  const autoSubmitTimerRef = useRef<number | null>(null);
  const lastSubmittedKeyRef = useRef(
    buildComparableSearchKey(initialSearchParams)
  );

  useEffect(() => {
    const key = buildComparableSearchKey(initialSearchParams);
    if (key) {
      try {
        sessionStorage.setItem(SEARCH_STATE_KEY, JSON.stringify(initialSearchParams));
      } catch {}
    }
    setEffectiveSearchParams(initialSearchParams);
    setFromValue(normalizeParam(initialSearchParams.from));
    setToValue(normalizeParam(initialSearchParams.to));
    setGuestSelection(readGuestSelection(initialSearchParams));
    setIncludeHotels(normalizeParam(initialSearchParams.include_hotels) !== "0");

    setHomeAirport(normalizeParam(initialSearchParams.origin));
    setIncludeFlights(
      normalizeParam(initialSearchParams.include_flights) === "1"
    );
  }, [initialSearchParams]);

  // On mount: if the URL has no params, restore the last search from sessionStorage
  // so navigating away and back doesn't clear the form.
  useEffect(() => {
    if (buildComparableSearchKey(initialSearchParams)) return;
    try {
      const raw = sessionStorage.getItem(SEARCH_STATE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as PageSearchParams;
      if (!buildComparableSearchKey(saved)) return;
      setEffectiveSearchParams(saved);
      setFromValue(normalizeParam(saved.from));
      setToValue(normalizeParam(saved.to));
      setGuestSelection(readGuestSelection(saved));
      setIncludeHotels(normalizeParam(saved.include_hotels) !== "0");
      setHomeAirport(normalizeParam(saved.origin));
      setIncludeFlights(normalizeParam(saved.include_flights) === "1");
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const storedCity = window.localStorage.getItem(HOME_AIRPORT_CITY_STORAGE_KEY);
    if (storedCity) setHomeAirportCity((prev) => prev || storedCity);
    if (homeAirport) return;
    const stored = window.localStorage.getItem(HOME_AIRPORT_STORAGE_KEY);
    if (stored) setHomeAirport(stored);
  }, [homeAirport]);

  useEffect(() => {
    if (homeAirport) {
      window.localStorage.setItem(HOME_AIRPORT_STORAGE_KEY, homeAirport);
    }
    if (homeAirportCity) {
      window.localStorage.setItem(HOME_AIRPORT_CITY_STORAGE_KEY, homeAirportCity);
    }
  }, [homeAirport, homeAirportCity]);

  // Mirrors the equivalent save effects in HotelsView/FlightsView - keeps
  // the shared cross-page session (read by SiteHeader's nav links, and by
  // Hotels/Flights on a bare visit) in sync with the landing search,
  // including the departure airport, which previously had no path into
  // that shared session at all.
  useEffect(() => {
    const city = normalizeParam(effectiveSearchParams.city);
    const country = normalizeParam(effectiveSearchParams.country);
    const region = normalizeParam(effectiveSearchParams.region);
    const q = normalizeParam(effectiveSearchParams.q);

    const hasAnythingToSave =
      Boolean(city || country || region || q || fromValue || toValue || homeAirport);

    if (!hasAnythingToSave) return;

    mergeHotelFlightSearch({
      q,
      city,
      country,
      region,
      from: fromValue,
      to: toValue,
      adults: String(guestSelection.adults),
      kids: String(guestSelection.kids),
      origin: homeAirport,
    });
  }, [effectiveSearchParams, fromValue, toValue, guestSelection, homeAirport]);

  useEffect(() => {
    if (!airportPopoverOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (
        flightsWrapRef.current &&
        !flightsWrapRef.current.contains(e.target as Node)
      ) {
        setAirportPopoverOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [airportPopoverOpen]);

  useEffect(() => {
    lastSubmittedKeyRef.current = buildComparableSearchKey(initialSearchParams);
  }, [initialSearchParams]);

  useEffect(() => {
    return () => {
      if (autoSubmitTimerRef.current) {
        window.clearTimeout(autoSubmitTimerRef.current);
      }
    };
  }, []);

  const bedroomsValue = normalizeParam(effectiveSearchParams.bedrooms) || "1";

  const hasGuestDetails = guestSelection.adults > 0;
  const hasRequiredStayDetails =
    Boolean(fromValue) &&
    Boolean(toValue) &&
    hasGuestDetails &&
    Boolean(bedroomsValue);

  const fromDate = fromValue ? new Date(fromValue) : null;
  const toDate = toValue ? new Date(toValue) : null;

  const stayLengthMs =
    fromDate && toDate ? toDate.getTime() - fromDate.getTime() : 0;

  const maxStayLengthMs = 42 * 24 * 60 * 60 * 1000;

  const todayIso = new Date().toISOString().slice(0, 10);

  const datesAreValid =
    Boolean(fromDate) &&
    Boolean(toDate) &&
    stayLengthMs > 0 &&
    stayLengthMs <= maxStayLengthMs;

  const resultCountTooLarge =
    destinationState.hasSelection &&
    destinationState.activeHotelCount > 50;

  const flightsCanActivate = useMemo(() => {
    const types = destinationState.selectedTypes;
    const values = destinationState.selectedValues;

    const hasHotelOrCity = types.includes("hotel") || types.includes("city");

    const hasSingleAirportCountry =
      types.includes("country") &&
      (values.country ?? []).some((c) =>
        SINGLE_AIRPORT_COUNTRIES.has(c.trim().toLowerCase())
      );

    const destinationOk = hasHotelOrCity || hasSingleAirportCountry;
    const datesOk = Boolean(fromValue) && Boolean(toValue);
    const guestsOk = guestSelection.adults > 0;

    return destinationOk && datesOk && guestsOk;
  }, [
    destinationState.selectedTypes,
    destinationState.selectedValues,
    fromValue,
    toValue,
    guestSelection.adults,
  ]);

  const effectiveIncludeFlights = flightsCanActivate && includeFlights;

  useEffect(() => {
    if (!flightsCanActivate && airportPopoverOpen) {
      setAirportPopoverOpen(false);
    }
  }, [flightsCanActivate, airportPopoverOpen]);

  const allowedTypes = useMemo<SuggestionType[]>(
    () => ["hotel", "city", "country", "region", "purpose", "setting"],
    []
  );

  const searchDisabledReason = useMemo(() => {
    if (resultCountTooLarge) {
      return "PLEASE LIMIT NO OF RESULTS";
    }

    if (!hasRequiredStayDetails || !datesAreValid) {
      return "FOR AVAILABILITY PLEASE SELECT DATES AND GUEST DETAILS";
    }

    if (!destinationState.hasSelection) {
      return "PLEASE LIMIT NO OF RESULTS";
    }

    return "";
  }, [
    resultCountTooLarge,
    hasRequiredStayDetails,
    datesAreValid,
    destinationState.hasSelection,
  ]);

  const searchIsActive = searchDisabledReason === "";

  function buildUrlFromForm(form: HTMLFormElement, submitted: boolean): string {
    const formData = new FormData(form);
    const params = new URLSearchParams();

    for (const [key, value] of formData.entries()) {
      if (key === "submitted") continue;
      const stringValue = String(value);
      if (stringValue) params.append(key, stringValue);
    }

    if (submitted) params.set("submitted", "1");

    const qs = params.toString();
    return qs ? `/?${qs}` : "/";
  }

  function navigateWithParams(submitted: boolean) {
    if (!formRef.current) return;
    const url = buildUrlFromForm(formRef.current, submitted);
    startTransition(() => {
      router.push(url, { scroll: false });
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!searchIsActive) return;
    navigateWithParams(true);
  }

  function scheduleAutoSubmit() {
    if (!formRef.current) return;

    if (autoSubmitTimerRef.current) {
      window.clearTimeout(autoSubmitTimerRef.current);
    }

    autoSubmitTimerRef.current = window.setTimeout(() => {
      if (!formRef.current) return;

      const formData = new FormData(formRef.current);
      const params = new URLSearchParams();

      for (const [key, value] of formData.entries()) {
        if (key === "submitted") continue;
        const stringValue = String(value);
        if (stringValue) params.append(key, stringValue);
      }

      const nextKey = params.toString();
      if (!nextKey || nextKey === lastSubmittedKeyRef.current) return;

      lastSubmittedKeyRef.current = nextKey;
      navigateWithParams(true);
    }, 220);
  }

  return (
    <div className={`oltra-glass oltra-panel ${styles.searchPanel} ${styles.landingGlass}`}>
      <form
        ref={formRef}
        action="/"
        method="GET"
        onSubmit={handleSubmit}
        className={styles.searchForm}
      >

        <div className={styles.searchGrid}>
          <StructuredDestinationField
            label="Destination / purpose"
            placeholder="Type first 2 letters of hotel, city, country, or purpose"
            searchParams={effectiveSearchParams}
            dataset={dataset}
            allowedTypes={allowedTypes}
            onStateChange={(state) => {
              setDestinationState(state);
              scheduleAutoSubmit();
            }}
            wrapperClassName={`${styles.landingField} ${styles.destinationField}`}
            busy={isPending}
          />

          <div className={styles.dateRangeField}>
            <DateRangePicker
              fromValue={fromValue}
              toValue={toValue}
              fromMinDate={todayIso}
              onFromChange={(value) => {
                setFromValue(value);
                scheduleAutoSubmit();
              }}
              onToChange={(value) => {
                setToValue(value);
                scheduleAutoSubmit();
              }}
            />
          </div>

          <div className={styles.landingField}>
            <span className="oltra-label">Guests</span>
            <GuestSelector
              initialValue={guestSelection}
              className={styles.guestSelectorField}
              onChange={(selection) => {
                setGuestSelection(selection);
                scheduleAutoSubmit();
              }}
            />
          </div>

          <div className={styles.landingField}>
            <span className="oltra-label">Bedrooms</span>
            <OltraSelect
              name="bedrooms"
              value={bedroomsValue}
              placeholder="1"
              align="left"
              options={[1, 2, 3, 4].map((n) => ({
                value: String(n),
                label: String(n),
              }))}
            />
          </div>
        </div>

        <div className={styles.includeRow}>
          <div className={styles.includeLeft}>
            <input
              type="hidden"
              name="include_hotels"
              value={includeHotels ? "1" : "0"}
            />
            <input
              type="hidden"
              name="include_flights"
              value={effectiveIncludeFlights ? "1" : "0"}
            />
            {/* Always present, not gated on effectiveIncludeFlights - a
                previously-picked home airport should still hand off to
                Flights/the shared session even if the Flights box isn't
                currently checked (e.g. re-enabled later, or read via
                SiteHeader's saved-session nav links). */}
            <input type="hidden" name="origin" value={homeAirport} />

            <label className={styles.includeChecksItem}>
              <input
                type="checkbox"
                checked={includeHotels}
                onChange={(e) => {
                  setIncludeHotels(e.target.checked);
                  scheduleAutoSubmit();
                }}
              />
              <span>Hotels</span>
            </label>

            <div className={styles.flightsCheckWrap} ref={flightsWrapRef}>
              <label
                className={[
                  styles.includeChecksItem,
                  !flightsCanActivate ? styles.includeChecksItemDisabled : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                title={
                  !flightsCanActivate
                    ? "Fill in city or hotel, dates and guests to activate"
                    : undefined
                }
              >
                <input
                  type="checkbox"
                  checked={effectiveIncludeFlights}
                  disabled={!flightsCanActivate}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setIncludeFlights(checked);
                    if (checked && !homeAirport) {
                      setAirportPopoverOpen(true);
                    } else if (!checked) {
                      setAirportPopoverOpen(false);
                    }
                    scheduleAutoSubmit();
                  }}
                />
                {/* One line: "Flights from London". The origin used to sit on
                    its own second line under the checkbox. */}
                <span className={styles.flightsCheckLabel}>
                  Flights
                  {flightsCanActivate && effectiveIncludeFlights ? (
                    <>
                      {homeAirport ? " from " : " "}
                      <button
                        type="button"
                        className={styles.airportNameButton}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setAirportPopoverOpen((v) => !v);
                        }}
                      >
                        {homeAirport
                          ? cityForAirportCode(homeAirport, homeAirportCity)
                          : "— set home airport"}
                      </button>
                    </>
                  ) : null}
                </span>
              </label>

              {flightsCanActivate && effectiveIncludeFlights && airportPopoverOpen ? (
                <div className={styles.airportPopover}>
                  <AirportAutocomplete
                    label="Home airport"
                    value={homeAirport}
                    onChange={(code, option) => {
                      setHomeAirport(code);
                      setHomeAirportCity(option?.city ?? "");
                      setAirportPopoverOpen(false);
                      scheduleAutoSubmit();
                    }}
                  />
                </div>
              ) : null}
            </div>
          </div>

        </div>
      </form>
    </div>
  );
}