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
  selectedIncludes: string[];
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

export default function LandingSearchPanel({
  initialSearchParams,
  selectedIncludes,
  dataset,
}: Props) {
  const [includes, setIncludes] = useState<string[]>(
    selectedIncludes.length ? selectedIncludes : ["hotels"]
  );

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

  const restaurantsOnly = useMemo(
    () => includes.length === 1 && includes[0] === "restaurants",
    [includes]
  );

  const hotelsSelected = includes.includes("hotels");
  const noVerticalSelected = includes.length === 0;

  const allowedTypes = useMemo<SuggestionType[]>(
    () =>
      hotelsSelected
        ? ["hotel", "city", "country", "region", "purpose", "setting"]
        : ["city"],
    [hotelsSelected]
  );

  const searchDisabledReason = useMemo(() => {
    if (noVerticalSelected) {
      return "Please select Hotels, Flights and/or Restaurants";
    }

    if (!hotelsSelected) {
      if (!destinationState.selectedTypes.includes("city")) {
        return "Please select a city";
      }
      return "";
    }

    if (
      !destinationState.hasSelection ||
      destinationState.activeHotelCount > 50
    ) {
      return "Add more precise destination or purpose to limit search results.";
    }

    return "";
  }, [noVerticalSelected, hotelsSelected, destinationState]);

  const searchIsActive = searchDisabledReason === "";

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

  function toggleInclude(value: string) {
    setIncludes((prev) => {
      const next = prev.includes(value)
        ? prev.filter((item) => item !== value)
        : [...prev, value];

      window.setTimeout(() => {
        scheduleAutoSubmit();
      }, 0);

      return next;
    });
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
            <span className="oltra-label">
              {restaurantsOnly ? "Date" : "From"}
            </span>
            <div className={styles.dateFieldWrap}>
              <input
                type="date"
                name="from"
                value={fromValue}
                onChange={(e) => {
                  setFromValue(e.target.value);
                  scheduleAutoSubmit();
                }}
                onKeyDown={(e) => e.preventDefault()}
                onBeforeInput={(e) => e.preventDefault()}
                className={[
                  "oltra-input w-full",
                  fromValue ? "text-white" : "text-transparent caret-transparent",
                ].join(" ")}
              />
              {!fromValue ? (
                <span className={styles.datePlaceholder}>date</span>
              ) : null}
            </div>
          </div>

          {!restaurantsOnly ? (
            <div className={styles.landingField}>
              <span className="oltra-label">To</span>
              <div className={styles.dateFieldWrap}>
                <input
                  type="date"
                  name="to"
                  value={toValue}
                  onChange={(e) => {
                    setToValue(e.target.value);
                    scheduleAutoSubmit();
                  }}
                  onKeyDown={(e) => e.preventDefault()}
                  onBeforeInput={(e) => e.preventDefault()}
                  className={[
                    "oltra-input w-full",
                    toValue ? "text-white" : "text-transparent caret-transparent",
                  ].join(" ")}
                />
                {!toValue ? (
                  <span className={styles.datePlaceholder}>date</span>
                ) : null}
              </div>
            </div>
          ) : null}

          {!restaurantsOnly ? (
            <>
              <div className={styles.landingField}>
                <span className="oltra-label">Guests</span>
                <GuestSelector
                  initialValue={guestSelection}
                  className={styles.guestSelectorField}
                />
              </div>

              <div className={styles.landingField}>
                <span className="oltra-label">Bedrooms</span>
                <OltraSelect
                  name="bedrooms"
                  value={normalizeParam(initialSearchParams.bedrooms)}
                  placeholder="#"
                  align="left"
                  options={[1, 2, 3, 4].map((n) => ({
                    value: String(n),
                    label: String(n),
                  }))}
                />
              </div>
            </>
          ) : null}

          <div className={styles.searchButtonWrap}>
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
              Search
            </button>
          </div>
        </div>

        <div className={styles.includeRow}>
          <div className={`${styles.includeLabel} oltra-subheader`}>Search in</div>

          <label className={styles.includeOption}>
            <input
              type="checkbox"
              name="include"
              value="hotels"
              checked={includes.includes("hotels")}
              onChange={() => toggleInclude("hotels")}
            />
            <span>Hotels</span>
          </label>

          <label className={styles.includeOption}>
            <input
              type="checkbox"
              name="include"
              value="flights"
              checked={includes.includes("flights")}
              onChange={() => toggleInclude("flights")}
            />
            <span>Flights</span>
          </label>

          <label className={styles.includeOption}>
            <input
              type="checkbox"
              name="include"
              value="restaurants"
              checked={includes.includes("restaurants")}
              onChange={() => toggleInclude("restaurants")}
            />
            <span>Restaurants</span>
          </label>
        </div>
      </form>
    </div>
  );
}