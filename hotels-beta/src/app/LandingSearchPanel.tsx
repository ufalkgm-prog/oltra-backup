"use client";

import OltraSelect from "@/components/site/OltraSelect";
import { useEffect, useMemo, useRef, useState } from "react";
import GuestSelector from "@/components/site/GuestSelector";
import StructuredDestinationField from "@/components/site/StructuredDestinationField";
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

  const [fromValue, setFromValue] = useState(
    normalizeParam(initialSearchParams.from)
  );

  const [toValue, setToValue] = useState(
    normalizeParam(initialSearchParams.to)
  );

  const [guestSelection, setGuestSelection] = useState<GuestSelection>(
    readGuestSelection(initialSearchParams)
  );

  const [destinationState, setDestinationState] = useState<{
    activeHotelCount: number;
    hasSelection: boolean;
    selectedTypes: SuggestionType[];
  }>({
    activeHotelCount: dataset.hotels.length,
    hasSelection: false,
    selectedTypes: [],
  });

  const formRef = useRef<HTMLFormElement | null>(null);
  const fromRef = useRef<HTMLInputElement | null>(null);
  const toRef = useRef<HTMLInputElement | null>(null);
  const autoSubmitTimerRef = useRef<number | null>(null);
  const lastSubmittedKeyRef = useRef(
    buildComparableSearchKey(initialSearchParams)
  );

  const hasSubmittedOnce =
    normalizeParam(initialSearchParams.submitted) === "1";

  useEffect(() => {
    setFromValue(normalizeParam(initialSearchParams.from));
    setToValue(normalizeParam(initialSearchParams.to));
    setGuestSelection(readGuestSelection(initialSearchParams));
  }, [initialSearchParams]);

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

  const allowedTypes = useMemo<SuggestionType[]>(
    () => ["hotel", "city", "country", "region", "purpose", "setting"],
    []
  );

  const searchDisabledReason = useMemo(() => {
    if (resultCountTooLarge) {
      return "PLEASE LIMIT NO OF RESULTS";
    }

    if (!hasRequiredStayDetails || !datesAreValid) {
      return "PLEASE SELECT DATES AND GUEST DETAILS";
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

  function scheduleAutoSubmit() {
    if (!hasSubmittedOnce) return;
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

      if (!nextKey || nextKey === lastSubmittedKeyRef.current) {
        return;
      }

      lastSubmittedKeyRef.current = nextKey;
      formRef.current.requestSubmit();
    }, 220);
  }

  return (
    <div className={`oltra-glass oltra-panel ${styles.searchPanel}`}>
      <form
        ref={formRef}
        action="/"
        method="GET"
        className={styles.searchForm}
      >
        <input type="hidden" name="submitted" value="1" />

        <div className={styles.searchGrid}>
          <StructuredDestinationField
            label="Destination / purpose"
            placeholder="Input hotel name, city, country, and/or purpose of trip"
            searchParams={initialSearchParams}
            dataset={dataset}
            allowedTypes={allowedTypes}
            onStateChange={setDestinationState}
            wrapperClassName={`${styles.landingField} ${styles.destinationField}`}
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
          <div className={styles.includeSearchButtonWrap}>
            <button
              type="submit"
              className={[
                styles.searchButton,
                searchIsActive
                  ? "oltra-button-primary"
                  : styles.searchButtonPassive,
              ].join(" ")}
              disabled={!searchIsActive}
              title={searchDisabledReason || undefined}
            >
              {searchIsActive
                ? "CHECK AVAILABILITY"
                : searchDisabledReason.charAt(0) +
                  searchDisabledReason.slice(1).toLowerCase()}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}