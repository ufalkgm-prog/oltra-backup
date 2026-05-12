"use client";

import OltraSelect from "@/components/site/OltraSelect";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import GuestSelector from "@/components/site/GuestSelector";
import StructuredDestinationField from "@/components/site/StructuredDestinationField";
import AirportAutocomplete from "@/app/flights/ui/AirportAutocomplete";
import { AIRPORT_OPTIONS } from "@/lib/airportOptions";
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

const SINGLE_AIRPORT_COUNTRIES = new Set(
  ["Maldives", "Bhutan", "Brunei"].map((c) => c.toLowerCase())
);

function cityForAirportCode(code: string): string {
  if (!code) return "";
  const opt = AIRPORT_OPTIONS.find((o) => o.value === code);
  if (!opt) return code;
  const after = opt.label.split("·")[1]?.trim() ?? "";
  return after.split(/\s+/)[0] || after || code;
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

  const [fromValue, setFromValue] = useState(
    normalizeParam(initialSearchParams.from)
  );

  const [toValue, setToValue] = useState(
    normalizeParam(initialSearchParams.to)
  );

  const [guestSelection, setGuestSelection] = useState<GuestSelection>(
    readGuestSelection(initialSearchParams)
  );

  const [includeFlights, setIncludeFlights] = useState(
    normalizeParam(initialSearchParams.include_flights) === "1" ||
      normalizeParam(initialSearchParams.origin) !== ""
  );
  const [homeAirport, setHomeAirport] = useState(
    normalizeParam(initialSearchParams.origin)
  );
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
  const fromRef = useRef<HTMLInputElement | null>(null);
  const toRef = useRef<HTMLInputElement | null>(null);
  const autoSubmitTimerRef = useRef<number | null>(null);
  const lastSubmittedKeyRef = useRef(
    buildComparableSearchKey(initialSearchParams)
  );

  useEffect(() => {
    setFromValue(normalizeParam(initialSearchParams.from));
    setToValue(normalizeParam(initialSearchParams.to));
    setGuestSelection(readGuestSelection(initialSearchParams));

    const nextOrigin = normalizeParam(initialSearchParams.origin);
    setHomeAirport(nextOrigin);
    setIncludeFlights(
      normalizeParam(initialSearchParams.include_flights) === "1" ||
        nextOrigin !== ""
    );
  }, [initialSearchParams]);

  useEffect(() => {
    if (homeAirport) return;
    const stored = window.localStorage.getItem(HOME_AIRPORT_STORAGE_KEY);
    if (stored) setHomeAirport(stored);
  }, [homeAirport]);

  useEffect(() => {
    if (homeAirport) {
      window.localStorage.setItem(HOME_AIRPORT_STORAGE_KEY, homeAirport);
    }
  }, [homeAirport]);

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

  const bedroomsValue = normalizeParam(initialSearchParams.bedrooms) || "1";

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

  const minToIso = fromValue
    ? new Date(new Date(fromValue).getTime() + 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10)
    : new Date(Date.now() + 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

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

  function openDatePicker(ref: React.RefObject<HTMLInputElement | null>) {
    ref.current?.focus();
    ref.current?.showPicker?.();
  }

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
    <div className={`oltra-glass oltra-panel ${styles.searchPanel}`}>
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
            searchParams={initialSearchParams}
            dataset={dataset}
            allowedTypes={allowedTypes}
            onStateChange={(state) => {
              setDestinationState(state);
              scheduleAutoSubmit();
            }}
            wrapperClassName={`${styles.landingField} ${styles.destinationField}`}
            busy={isPending}
          />

          <div className={styles.landingField}>
            <span className="oltra-label">From</span>
            <div
              className={styles.dateFieldWrap}
              onClick={() => openDatePicker(fromRef)}
            >
              <input
                ref={fromRef}
                type="date"
                name="from"
                min={todayIso}
                value={fromValue}
                onChange={(e) => {
                  setFromValue(e.target.value);
                  scheduleAutoSubmit();
                }}
                onKeyDown={(e) => e.preventDefault()}
                onBeforeInput={(e) => e.preventDefault()}
                className={`${styles.nativeDateInput} oltra-input w-full cursor-pointer`}
              />

              <span
                className={styles.dateDisplay}
                data-has-value={fromValue ? "true" : "false"}
                aria-hidden="true"
              >
                {fromValue ? formatDisplayDate(fromValue) : "date"}
              </span>
            </div>
          </div>

          <div className={styles.landingField}>
            <span className="oltra-label">To</span>
            <div
              className={styles.dateFieldWrap}
              onClick={() => openDatePicker(toRef)}
            >
              <input
                ref={toRef}
                type="date"
                name="to"
                min={minToIso}
                value={toValue}
                onChange={(e) => {
                  setToValue(e.target.value);
                  scheduleAutoSubmit();
                }}
                onKeyDown={(e) => e.preventDefault()}
                onBeforeInput={(e) => e.preventDefault()}
                className={`${styles.nativeDateInput} oltra-input w-full cursor-pointer`}
              />

              <span
                className={styles.dateDisplay}
                data-has-value={toValue ? "true" : "false"}
                aria-hidden="true"
              >
                {toValue ? formatDisplayDate(toValue) : "date"}
              </span>
            </div>
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
            <input type="hidden" name="include_hotels" value="1" />
            <input
              type="hidden"
              name="include_flights"
              value={effectiveIncludeFlights ? "1" : "0"}
            />
            {effectiveIncludeFlights ? (
              <input type="hidden" name="origin" value={homeAirport} />
            ) : null}

            <div className={styles.flightsCheckWrap} ref={flightsWrapRef}>
              <label
                className={[
                  styles.includeChecksItem,
                  !flightsCanActivate ? styles.includeChecksItemDisabled : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
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
                <span>
                  Add Flights
                  {!flightsCanActivate ? (
                    <> - To activate please fill in city or hotel, dates and guests</>
                  ) : effectiveIncludeFlights && homeAirport ? (
                    <>
                      {" from "}
                      <button
                        type="button"
                        className={styles.airportNameButton}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setAirportPopoverOpen((v) => !v);
                        }}
                      >
                        {cityForAirportCode(homeAirport)}
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
                    onChange={(code) => {
                      setHomeAirport(code);
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