"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import OltraSelect from "@/components/site/OltraSelect";
import { submitReviewBrowser } from "@/lib/members/db";

type ReviewType = "hotel" | "restaurant";

type ReviewTargetOption = {
  id: string;
  label: string;
  name: string;
  city?: string | null;
  country?: string | null;
};

type Option = {
  value: string;
  label: string;
  selectedLabel?: string;
};

type Props = {
  hotelOptions: ReviewTargetOption[];
  restaurantOptions: ReviewTargetOption[];
};

const TYPE_OPTIONS: Option[] = [
  { value: "hotel", label: "Hotel" },
  { value: "restaurant", label: "Restaurant" },
];

const RATING_OPTIONS: Option[] = [
  {
    value: "not_observed",
    label: "Not observed",
    selectedLabel: "Not observed",
  },
  { value: "1", label: "1 - lowest", selectedLabel: "1" },
  { value: "2", label: "2", selectedLabel: "2" },
  { value: "3", label: "3", selectedLabel: "3" },
  { value: "4", label: "4", selectedLabel: "4" },
  { value: "5", label: "5 - highest", selectedLabel: "5" },
];

const HOTEL_RATING_FIELDS = [
  "Overall",
  "Service",
  "Room",
  "Facilities",
  "Decor",
  "Location",
] as const;

const RESTAURANT_RATING_FIELDS = [
  "Overall",
  "Service",
  "Food",
  "Ambience",
  "Style",
  "Location",
] as const;

type HotelRatingField = (typeof HOTEL_RATING_FIELDS)[number];
type RestaurantRatingField = (typeof RESTAURANT_RATING_FIELDS)[number];
type RatingField = HotelRatingField | RestaurantRatingField;

function emptyRatings(): Record<RatingField, string> {
  return {
    Overall: "",
    Service: "",
    Room: "",
    Facilities: "",
    Decor: "",
    Food: "",
    Ambience: "",
    Style: "",
    Location: "",
  };
}

function ratingToNumber(value: string): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 1 && numeric <= 5 ? numeric : 0;
}

function hasAtLeastOneNumericRating(ratings: Record<RatingField, string>) {
  return Object.values(ratings).some((value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 1 && numeric <= 5;
  });
}

function buildTargetLabel(option: ReviewTargetOption): string {
  return (
    option.label ||
    [option.name, option.city, option.country].filter(Boolean).join(" · ")
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

export default function ReviewView({
  hotelOptions,
  restaurantOptions,
}: Props) {
  const [reviewType, setReviewType] = useState<ReviewType | "">("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [selectedItemLabel, setSelectedItemLabel] = useState("");
  const [dateVisited, setDateVisited] = useState("");
  const [ratings, setRatings] = useState<Record<RatingField, string>>(
    emptyRatings
  );
  const [comments, setComments] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const dateVisitedRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!errorMessage && !statusMessage) return;
    const t = setTimeout(() => {
      setErrorMessage("");
      setStatusMessage("");
    }, 5000);
    return () => clearTimeout(t);
  }, [errorMessage, statusMessage]);

  const todayIso = new Date().toISOString().slice(0, 10);

  const minDateVisitedIso = new Date(
    new Date().setMonth(new Date().getMonth() - 3)
  )
    .toISOString()
    .slice(0, 10);

  const targetOptions = useMemo(() => {
    if (reviewType === "hotel") return hotelOptions;
    if (reviewType === "restaurant") return restaurantOptions;
    return [];
  }, [hotelOptions, restaurantOptions, reviewType]);

  const ratingFields =
    reviewType === "restaurant" ? RESTAURANT_RATING_FIELDS : HOTEL_RATING_FIELDS;

  const targetHeading =
    reviewType === "hotel"
      ? "HOTEL"
      : reviewType === "restaurant"
        ? "RESTAURANT"
        : "HOTEL / RESTAURANT";

  const canChooseTarget = Boolean(reviewType);
  const canCompleteReview = Boolean(reviewType && selectedItemId);
  const canSubmit = canCompleteReview && Boolean(dateVisited) && !isSubmitting;

  function openDatePicker(ref: React.RefObject<HTMLInputElement | null>) {
    ref.current?.focus();
    ref.current?.showPicker?.();
  }

  function handleTypeChange(value: string) {
    const nextType = value as ReviewType;

    setReviewType(nextType);
    setSelectedItemId("");
    setSelectedItemLabel("");
    setDateVisited("");
    setRatings(emptyRatings());
    setComments("");
    setStatusMessage("");
    setErrorMessage("");
  }

  function handleTargetChange(option: ReviewTargetOption) {
    setSelectedItemId(option.id);
    setSelectedItemLabel(buildTargetLabel(option));
    setDateVisited("");
    setStatusMessage("");
    setErrorMessage("");
  }

  function handleRatingChange(field: RatingField, value: string) {
    setRatings((prev) => ({ ...prev, [field]: value }));
    setStatusMessage("");
    setErrorMessage("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!reviewType || !selectedItemId) {
      setErrorMessage("Please select type and hotel or restaurant.");
      setStatusMessage("");
      return;
    }

    try {
      setIsSubmitting(true);
      setStatusMessage("");
      setErrorMessage("");

      await submitReviewBrowser({
        reviewType,
        targetLabel: selectedItemLabel,
        targetDirectusId: selectedItemId,
        dateVisited: dateVisited || null,
        overallRating: ratingToNumber(ratings.Overall),
        serviceRating: ratingToNumber(ratings.Service),
        designRating:
          reviewType === "hotel"
            ? ratingToNumber(ratings.Decor)
            : ratingToNumber(ratings.Style),
        foodRating:
          reviewType === "restaurant"
            ? ratingToNumber(ratings.Food)
            : ratingToNumber(ratings.Facilities),
        locationRating: ratingToNumber(ratings.Location),
        valueRating:
          reviewType === "hotel"
            ? ratingToNumber(ratings.Room)
            : ratingToNumber(ratings.Ambience),
        comments,
      });

      setReviewType("");
      setSelectedItemId("");
      setSelectedItemLabel("");
      setDateVisited("");
      setComments("");
      setRatings(emptyRatings());
      setStatusMessage("Review submitted.");
    } catch {
      setErrorMessage("Could not submit review.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="oltra-glass members-section">
      <form className="members-form-stack" onSubmit={handleSubmit}>
        <div className="members-review-start">
          <div className="members-form-field members-form-field--rating-width">
            <label className="oltra-label">TYPE</label>
            <OltraSelect
              name="reviewType"
              value={reviewType}
              placeholder="Select type"
              options={TYPE_OPTIONS}
              align="left"
              onValueChange={handleTypeChange}
            />
          </div>

          <div className="members-review-target-row">
            <div
              className={[
                "members-form-field",
                "members-form-field--two-rating-width",
                !reviewType ? "members-form-disabled" : "",
              ].join(" ")}
            >
              <label className="oltra-label">{targetHeading}</label>
              <ReviewTargetSearchField
                value={selectedItemLabel}
                placeholder={
                  reviewType === "hotel"
                    ? "Search hotel by name, city or country"
                    : reviewType === "restaurant"
                      ? "Search restaurant by name, city or country"
                      : "Select type first"
                }
                options={targetOptions}
                disabled={!canChooseTarget}
                onSelect={handleTargetChange}
              />
            </div>

            <div
              className={[
                "members-form-field",
                "members-form-field--rating-width",
                !canCompleteReview ? "members-form-disabled" : "",
              ].join(" ")}
            >
              <label className="oltra-label">DATE VISITED</label>
              <div
                className="hotel-date-field relative cursor-pointer"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (canCompleteReview) openDatePicker(dateVisitedRef);
                }}
              >
                <input
                  ref={dateVisitedRef}
                  type="date"
                  value={dateVisited}
                  min={minDateVisitedIso}
                  max={todayIso}
                  disabled={!canCompleteReview}
                  tabIndex={-1}
                  aria-label="Date visited"
                  onChange={(e) => {
                    setDateVisited(e.target.value);
                    setStatusMessage("");
                    setErrorMessage("");
                  }}
                  onKeyDown={(e) => e.preventDefault()}
                  onBeforeInput={(e) => e.preventDefault()}
                  className="oltra-input hotel-date-field__input w-full cursor-pointer"
                  data-has-value={dateVisited ? "true" : "false"}
                />
                <span
                  className="hotel-date-field__display pointer-events-none absolute left-0 top-0 flex h-full items-center px-[14px]"
                  data-has-value={dateVisited ? "true" : "false"}
                >
                  {formatDisplayDate(dateVisited) || "date"}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div
          className={[
            "members-rating-grid",
            !canCompleteReview ? "members-form-disabled" : "",
          ].join(" ")}
        >
          {ratingFields.map((field) => (
            <div key={field} className="members-form-field">
              <label className="oltra-label">{field.toUpperCase()}</label>
              <OltraSelect
                name={`reviewRating${field}`}
                value={ratings[field]}
                placeholder="Rate 1-5"
                options={RATING_OPTIONS}
                align="left"
                onValueChange={(value) => handleRatingChange(field, value)}
              />
            </div>
          ))}
        </div>

        <div
          className={[
            "members-form-field",
            !canCompleteReview ? "members-form-disabled" : "",
          ].join(" ")}
        >
          <label className="oltra-label">COMMENTS</label>
          <textarea
            className="oltra-textarea members-textarea"
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder={
              canCompleteReview
                ? "Add specific comments"
                : "Select type and hotel / restaurant first"
            }
            disabled={!canCompleteReview}
          />
        </div>

        {errorMessage || statusMessage ? (
          <div className="members-note">{errorMessage || statusMessage}</div>
        ) : null}

        <div className="members-form-actions">
          <button
            type="submit"
            className={[
              canSubmit ? "oltra-button-primary" : "oltra-button-secondary",
              "members-action-button",
            ].join(" ")}
            disabled={!canSubmit}
          >
            {isSubmitting ? "Sending..." : "Send review"}
          </button>
        </div>
      </form>
    </section>
  );
}

function ReviewTargetSearchField({
  value,
  placeholder,
  options,
  disabled,
  onSelect,
}: {
  value: string;
  placeholder: string;
  options: ReviewTargetOption[];
  disabled: boolean;
  onSelect: (option: ReviewTargetOption) => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [typedValue, setTypedValue] = useState(value);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setTypedValue(value);
  }, [value]);

  useEffect(() => {
    if (disabled) {
      setOpen(false);
      setTypedValue("");
    }
  }, [disabled]);

  useEffect(() => {
    function handleOutside(event: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const filteredOptions = useMemo(() => {
    const normalize = (input: unknown) =>
      String(input ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();

    const q = normalize(typedValue);

    const searchableOptions = options.map((option) => {
      const label = buildTargetLabel(option);

      return {
        option,
        label,
        searchable: normalize(
          [option.name, option.city, option.country, label]
            .filter(Boolean)
            .join(" ")
        ),
      };
    });

    if (!q) return searchableOptions.slice(0, 40);

    return searchableOptions
      .filter((item) => item.searchable.includes(q))
      .slice(0, 40);
  }, [options, typedValue]);

  function openDropdown() {
    if (disabled) return;
    setOpen(true);
  }

  return (
    <div
      ref={rootRef}
      className="members-review-search"
      data-oltra-control="true"
    >
      <input
        className="oltra-input w-full"
        value={typedValue}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => {
          setTypedValue(event.target.value);
          setOpen(true);
        }}
        onFocus={openDropdown}
        onClick={openDropdown}
      />

      {open && !disabled ? (
        <div className="oltra-popup-panel oltra-scrollbar members-review-search__panel">
          <div className="oltra-dropdown-group">
            <div className="oltra-dropdown-group-label">Select</div>

            <div className="oltra-scrollbar members-review-search__list">
              {filteredOptions.length > 0 ? (
                filteredOptions.map(({ option, label }) => (
                  <button
                    key={option.id}
                    type="button"
                    className="oltra-dropdown-item w-full text-left"
                    title={label}
                    onClick={() => {
                      onSelect(option);
                      setTypedValue(label);
                      setOpen(false);
                    }}
                  >
                    {label}
                  </button>
                ))
              ) : (
                <div className="members-empty">No matches found.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}