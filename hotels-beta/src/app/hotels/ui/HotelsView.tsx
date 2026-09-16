"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import GuestSelector from "@/components/site/GuestSelector";
import OltraSelect from "@/components/site/OltraSelect";
import DateRangePicker from "@/components/site/DateRangePicker";
import { useDropdownDismiss } from "@/lib/useDropdownDismiss";
import {
  buildBookingLink,
  type BookingSearchParams,
} from "@/lib/hotels/buildBookingLink";
import StructuredDestinationField from "@/components/site/StructuredDestinationField";
import AiResultsSync from "@/lib/ai/AiResultsSync";
import { useAiPageContext } from "@/lib/ai/useAiPageContext";
import {
  guestSelectionIssue,
  normalizeParam,
  readGuestSelection,
  type GuestSelection,
} from "@/lib/guests";
import { guessResidencyFromLocale } from "@/lib/countries";
import { isStayTooLong, MAX_STAY_NIGHTS, STAY_TOO_LONG_MESSAGE } from "@/lib/stay";
import type { HotelSuggestionDataset } from "@/lib/hotelSearchSuggestions";
import {
  addFavoriteHotelBrowser,
  addHotelToTripBrowser,
  createTripBrowser,
  fetchFavoriteHotelsBrowser,
  fetchTripChoicesBrowser,
  getMemberActionAccessBrowser,
} from "@/lib/members/db";
import {
  MAX_TRIPS_PER_MEMBER,
  TRIP_LIMIT_MESSAGE,
  getCreateTripBlockedReason,
  isTripLimitError,
  MAX_TRIP_NAME_CHARS,
} from "@/lib/members/tripLimits";
import type { HotelRecord } from "@/lib/directus";
import type { AwardCode } from "@/lib/hotels/awardCodes";
import {
  getHotelImageSet,
  HOTEL_CARD_PLACEHOLDERS as PLACEHOLDERS,
  hasHotelPhotos,
  RATEHAWK_FULL_SIZE,
  RATEHAWK_LARGE_SIZE,
  RATEHAWK_THUMB_SIZE,
  resolveRatehawkUrl,
} from "@/lib/hotels/cardHelpers";
import { getMemberActionLoginMessage } from "@/lib/members/memberActionUi";
import {
  clearHotelFlightDestination,
  mergeHotelFlightSearch,
  readHotelFlightSearch,
} from "@/lib/searchSession";
import { aiResultsAreCurrent, useAiActions, useAiSearch } from "@/lib/ai/aiSearchStore";
import type { RatehawkGroupedRoom, RatehawkHeadline } from "@/lib/ratehawk/types";
import type { PrebookFailureReason, PrebookHash } from "@/lib/ratehawk/prebook";
import { compareRates, type RateChange } from "@/lib/ratehawk/rateChanges";
import type { HotelPolicies } from "@/lib/ratehawk/metapolicy";

type PageSearchParams = Record<string, string | string[] | undefined>;

type Options = {
  country: string[];
  city: string[];
  region: string[];
  local_area: string[];
  affiliation: string[];
};

type TaxMaps = {
  activities: Map<string, string>;
  settings: Map<string, string>;
};

type ViewMode = "details" | "map" | "featured";

/** Images shown side by side in the featured strip. */
const FEATURED_IMAGE_COUNT = 3;

/** Pulls an image into the browser cache ahead of time. Resolves on error too
 * - a warm cache is an optimisation, never a reason to hold up the revolver. */
function preloadImage(url: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve();
      return;
    }
    const img = new window.Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = url;
  });
}

type RatehawkResultAvailability =
  | { status: "available"; headline: RatehawkHeadline }
  | { status: "unavailable" };

type RatehawkDetailState = {
  status: "idle" | "loading" | "loaded" | "error";
  rooms: RatehawkGroupedRoom[];
  headline: RatehawkHeadline;
};

// Prebook in the panel: the h- hash of the chosen rate goes in, a p- hash
// comes out. "changed" holds a confirmed rate the guest has not yet accepted.
type PrebookState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "failed"; reason: PrebookFailureReason }
  | {
      status: "changed";
      original: RatehawkGroupedRoom;
      changes: RateChange[];
      prebookHash: PrebookHash;
      rate: RatehawkGroupedRoom;
      prebookedAt: number;
    }
  | { status: "confirmed"; prebookHash: PrebookHash; rate: RatehawkGroupedRoom; prebookedAt: number };

type PrebookResponseBody =
  | { ok: true; prebookHash: PrebookHash; rate: RatehawkGroupedRoom; priceChanged: boolean }
  | { ok: false; reason?: PrebookFailureReason };

// Set on in Vercel Production (§32): certification reviews the live site.
// NEXT_PUBLIC_ is inlined at build, so turning it off needs a redeploy — the
// no-deploy kill switch is ETG_PREBOOK_ENABLED on the proxy (§47).
const PREBOOK_ENABLED = process.env.NEXT_PUBLIC_RATEHAWK_PREBOOK === "1";

// Same wait as the results batch's debounce — see the room-list effect.
const HOTELPAGE_DEBOUNCE_MS = 450;
/* How long result prices already fetched for a stay are reused when the hotel
   list changes under it (a filter applied or removed). Well inside the ~1 hour
   ETG allow rates to be kept for display (§32). */
const RESULT_AVAILABILITY_REUSE_MS = 30 * 60 * 1000;

const PREBOOK_FAILURE_MESSAGE: Record<PrebookFailureReason, string> = {
  expired: "This rate has expired. The rooms have been refreshed — please choose again.",
  unavailable:
    "This rate is no longer available at a comparable price. The rooms have been refreshed — please choose again.",
  busy: "Rate checks are busy right now. Please try again in a minute.",
  disabled: "Rate confirmation is temporarily unavailable.",
  failed: "We could not confirm this rate. Please try again.",
};

const CURRENCY_STORAGE_KEY = "oltra_currency";
const MAP_FALLBACK_CENTER: [number, number] = [103.8198, 1.3521];

const FEATURED_AWARDS: Array<{
  code: AwardCode;
  label: string;
  badge: string;
  gold?: boolean;
}> = [
  {
    code: "forbes5",
    label: "Forbes 5 Star (2026)",
    badge: "F5",
  },
  {
    code: "michelin3keys",
    label: "Michelin 3 Keys (2026)",
    badge: "M3",
    gold: true,
  },
  {
    code: "best50",
    label: "The World's 50 Best (2025)",
    badge: "50",
    gold: true,
  },
  {
    code: "cn",
    label: "Condé Nast Gold List (2025)",
    badge: "CN",
  },
  {
    code: "tl100",
    label: "T+L 100 (2025)",
    badge: "TL",
  },
  {
    code: "telegraph",
    label: "The Telegraph Top 50 (2024)",
    badge: "T",
  },
  {
    code: "aaa5d",
    label: "AAA Five Diamond Award (2025)",
    badge: "5D",
  },
];

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
      style={{ width: 12, height: 12, display: "block" }}
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

function serializeList(values: string[]): string {
  return values.join(",");
}

function buildHrefWithParam(
  current: PageSearchParams,
  key: string,
  nextValues: string[],
  extraParams?: Record<string, string>
): string {
  const params = new URLSearchParams();

  for (const [k, v] of Object.entries(current)) {
    if (k === key) continue;
    if (v === undefined) continue;

    if (Array.isArray(v)) {
      for (const vv of v) params.append(k, vv);
    } else {
      params.set(k, String(v));
    }
  }

  if (nextValues.length) {
    params.set(key, serializeList(nextValues));
  } else {
    params.delete(key);
  }

  if (extraParams) {
    for (const [k, v] of Object.entries(extraParams)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
  }

  if (!params.get("search_submitted")) {
    params.set("search_submitted", "1");
  }

  return params.toString() ? `/hotels?${params.toString()}` : "/hotels";
}

function removeSingleValueHref(
  current: PageSearchParams,
  key: string,
  valueToRemove: string
): string {
  const currentValue = normalizeParam(current[key]);
  const nextValues = currentValue
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x) => x !== valueToRemove);

  return buildHrefWithParam(current, key, nextValues, { filters_open: "1" });
}

function clampText(s: string | undefined | null, max = 160): string {
  const t = (s ?? "").trim();
  if (!t) return "";
  if (t.length <= max) return t;
  return t.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

/** What removing the "AI curated results" token takes out of the URL: the
 * pinned set and any destination or tag params that came with it. Dates,
 * guests and rooms are the visitor's stay, not the answer, so they stay. */
const CURATED_DROPS = new Set([
  "ids",
  "q",
  "city",
  "state",
  "admin_region",
  "country",
  "region",
  "macro_region",
  "local_area",
  "activities",
  "settings",
  "search_submitted",
]);

function hasHotelSearchContext(params: PageSearchParams): boolean {
  return Boolean(
    // The concierge's pinned set is a search in its own right. Without this a
    // curated URL carrying no dates read as bare, and the session restore
    // replaced it with the answer's city as tags.
    normalizeParam(params.ids) ||
    normalizeParam(params.q) ||
      normalizeParam(params.city) ||
      normalizeParam(params.state) ||
      normalizeParam(params.admin_region) ||
      normalizeParam(params.country) ||
      normalizeParam(params.region) ||
      normalizeParam(params.macro_region) ||
      normalizeParam(params.from) ||
      normalizeParam(params.to) ||
      normalizeParam(params.adults) ||
      normalizeParam(params.kids) ||
      normalizeParam(params.bedrooms)
  );
}

function getCoord(hotel: HotelRecord, key: "lat" | "lng"): number | null {
  const raw = (hotel as Record<string, unknown>)[key];
  if (raw == null || raw === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function RelDropdown(props: {
  title: string;
  paramKey: string;
  selectedIds: string[];
  map: Map<string, string>;
  searchParams: PageSearchParams;
  open: boolean;
  onToggle: () => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Optimistic local mirror of the selection: clicking a checkbox navigates
  // (a full server round-trip re-fetching hotels), which can take a second
  // or more - without this, a quick second click before that round-trip
  // resolves looked like it "did nothing" since props.selectedIds hadn't
  // caught up yet. Local state updates instantly; the effect below
  // reconciles it once the URL/server state actually changes.
  const [localSelectedIds, setLocalSelectedIds] = useState(props.selectedIds);
  useEffect(() => {
    setLocalSelectedIds(props.selectedIds);
  }, [props.selectedIds]);

  const selected = useMemo(() => new Set(localSelectedIds), [localSelectedIds]);

  const dismissHoverProps = useDropdownDismiss({
    open: props.open,
    onClose: props.onToggle,
    refs: rootRef,
  });

  const options = useMemo(() => {
    const out: Array<{ id: string; label: string; active: boolean }> = [];

    for (const [id, label] of props.map.entries()) {
      out.push({
        id,
        label,
        active: selected.has(id),
      });
    }

    out.sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return a.label.localeCompare(b.label);
    });

    return out;
  }, [props.map, selected]);

  return (
    <div
      ref={rootRef}
      className="border-t border-[var(--oltra-field-border)] py-2"
      data-oltra-control="true"
      {...dismissHoverProps}
    >
      <button
        type="button"
        onClick={props.onToggle}
        className="flex w-full items-center justify-between px-[14px] text-left"
      >
        <span className="text-[12px] uppercase tracking-[0.14em] text-[color:var(--oltra-text-muted)]">
          {props.title}
        </span>
        <span
          className="flex h-4 w-4 items-center justify-center text-[color:var(--oltra-text-muted)] transition-transform duration-150"
          style={{ transform: props.open ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          <ChevronDown />
        </span>
      </button>

      {props.open ? (
        <div className="mt-2">
          <div className="oltra-popup-panel oltra-popup-panel--inline oltra-scrollbar !relative !left-auto !right-auto !top-auto z-0 !p-2">
            <div className="oltra-dropdown-list max-h-[220px]">
              {options.map((opt) => {
                const next = opt.active
                  ? Array.from(selected).filter((x) => x !== opt.id)
                  : Array.from(new Set([...selected, opt.id]));

                return (
                  <button
                    key={`${props.paramKey}-${opt.id}`}
                    type="button"
                    onClick={() => {
                      setLocalSelectedIds(next);
                      const href = buildHrefWithParam(
                        props.searchParams,
                        props.paramKey,
                        next,
                        { filters_open: "1" }
                      );
                      startTransition(() => {
                        router.push(href, { scroll: false });
                      });
                    }}
                    className={[
                      "oltra-dropdown-item flex w-full items-center gap-2 text-left",
                      opt.active ? "bg-[var(--oltra-dropdown-item-selected-bg)] text-[color:var(--oltra-text-primary)]" : "",
                    ].join(" ")}
                  >
                    <span className="w-4 shrink-0 text-[color:var(--oltra-text-primary)]">
                      {opt.active ? "✓" : ""}
                    </span>
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function HiddenPreserveParams(props: {
  searchParams: PageSearchParams;
  excludeKeys?: string[];
}) {
  const exclude = new Set(props.excludeKeys ?? []);
  const entries: Array<[string, string]> = [];

  for (const [k, v] of Object.entries(props.searchParams)) {
    if (exclude.has(k)) continue;
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      for (const vv of v) entries.push([k, vv]);
    } else {
      entries.push([k, v]);
    }
  }

  return (
    <>
      {entries.map(([k, v], idx) => (
        <input key={`${k}-${idx}`} type="hidden" name={k} value={v} />
      ))}
    </>
  );
}

function locationLine(h: HotelRecord): string {
  return [h.local_area, h.city, h.region, h.country].filter(Boolean).join(" · ");
}

function formatRoomCapacity(capacity: number): string {
  return `Sleeps ${capacity}`;
}

function formatRoomLayout(room: RatehawkGroupedRoom): string {
  const parts: string[] = [];
  if (room.beds.length) {
    parts.push(
      room.beds.map((b) => `${b.count} ${b.bed} bed${b.count > 1 ? "s" : ""}`).join(", ")
    );
  } else if (room.bedding) {
    parts.push(room.bedding);
  }
  if (room.miscRoomType) parts.push(room.miscRoomType);
  return parts.join(" · ") || "—";
}

// A rate's price is the whole stay for every room searched (§32), so the label
// says so rather than leaving it to read as one room's price.
function formatRoomTotalLabel(rooms: number): string {
  return rooms === 1 ? "total stay" : `total stay, ${rooms} rooms`;
}

// ETG's cancellation timestamps have no timezone offset (e.g.
// "2026-09-22T11:00:00") and are documented as UTC+0 — see CLAUDE.md §32.
// `new Date()` on a bare no-offset ISO string parses as LOCAL time per the
// JS spec, which would silently misread these, so "Z" is appended first.
// timeZoneName: "short" makes the local conversion explicit, per the
// certification requirement to label the timezone rather than leave it
// ambiguous.
function formatRatehawkUtcDateTime(isoNoOffset: string): string {
  const date = new Date(
    /[Z+-]\d{2}:?\d{2}$|Z$/.test(isoNoOffset) ? isoNoOffset : `${isoNoOffset}Z`
  );
  if (Number.isNaN(date.getTime())) return isoNoOffset;

  // Intl throws if dateStyle/timeStyle are combined with timeZoneName (a
  // real RangeError caught live in the browser, not just a lint concern) —
  // so the date/time parts are spelled out individually here instead.
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function nonIncludedTaxes(room: RatehawkGroupedRoom) {
  return room.taxes.filter((tax) => !tax.includedBySupplier);
}

function includedTaxNames(room: RatehawkGroupedRoom): string {
  return room.taxes
    .filter((tax) => tax.includedBySupplier)
    .map((tax) => tax.name.replace(/_/g, " "))
    .join(", ");
}

// Never presented as better than what ETG sent (§32).
function formatMeal(room: Pick<RatehawkGroupedRoom, "hasBreakfast" | "mealValue">): string {
  return room.hasBreakfast
    ? "Breakfast included"
    : room.mealValue === "nomeal"
      ? "Room only"
      : room.mealValue;
}

function formatFreeCancellation(freeCancellationBefore: string | null): string {
  return freeCancellationBefore
    ? `Free cancellation until ${formatRatehawkUtcDateTime(freeCancellationBefore)}`
    : "No free cancellation";
}

/* A rate's cancellation schedule and taxes, exactly as ETG sent them (§32).
 * Two col-span-2 blocks for a two-column grid — shared by the room detail
 * popup and the Prebook change sheet, so a changed rate is shown by the same
 * code as the one it replaced. */
function RateTerms({ room }: { room: RatehawkGroupedRoom }) {
  return (
    <>
      <div className="col-span-2">
        <div className="text-[12px] uppercase tracking-[0.1em] text-[color:var(--oltra-text-muted)]">
          Cancellation
        </div>
        <div className="mt-0.5">{formatFreeCancellation(room.freeCancellationBefore)}</div>
        {room.cancellationPolicies.map((policy, i) => {
          const charge =
            policy.amountShow === 0
              ? "no charge"
              : policy.amountShow != null
                ? `${room.currency} ${Math.round(policy.amountShow).toLocaleString()} charge`
                : "charge amount unavailable";
          const window =
            policy.startAt && policy.endAt
              ? `${formatRatehawkUtcDateTime(policy.startAt)} – ${formatRatehawkUtcDateTime(policy.endAt)}`
              : policy.endAt
                ? `Until ${formatRatehawkUtcDateTime(policy.endAt)}`
                : policy.startAt
                  ? `From ${formatRatehawkUtcDateTime(policy.startAt)}`
                  : "Full stay";
          return (
            <div key={i} className="mt-0.5 text-[12px] text-[color:var(--oltra-text-muted)]">
              {window}: {charge}
            </div>
          );
        })}
      </div>
      {nonIncludedTaxes(room).length > 0 || includedTaxNames(room) ? (
        <div className="col-span-2">
          <div className="text-[12px] uppercase tracking-[0.1em] text-[color:var(--oltra-text-muted)]">
            Taxes &amp; fees
          </div>
          {includedTaxNames(room) ? (
            <div className="mt-0.5">Included in price: {includedTaxNames(room)}</div>
          ) : null}
          {nonIncludedTaxes(room).map((tax, i) => (
            <div key={i} className="mt-0.5">
              + {tax.currency} {tax.amount.toLocaleString()} {tax.name.replace(/_/g, " ")} — pay at hotel
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

function describeRateChange(change: RateChange): string {
  switch (change.kind) {
    case "price":
      return `Price: ${change.currency} ${Math.round(change.from).toLocaleString()} → ${change.currency} ${Math.round(change.to).toLocaleString()}`;
    case "currency":
      return `Currency: ${change.from} → ${change.to}`;
    case "meal":
      return `Meal: ${formatMeal({ mealValue: change.from, hasBreakfast: false })} → ${formatMeal({ mealValue: change.to, hasBreakfast: false })}`;
    case "cancellation":
      return `Cancellation: ${formatFreeCancellation(change.from)} → ${formatFreeCancellation(change.to)}`;
    case "conditions":
      return "The rate's conditions have changed. Please review the terms below.";
  }
}

function getFeaturedAwardsForHotel(hotel: HotelRecord) {
  return FEATURED_AWARDS.filter((award) => Boolean(hotel[award.code]));
}

const BADGE_GOLD = "rgba(196, 158, 72, 0.88)";
const BADGE_SILVER = "rgba(148, 162, 174, 0.80)";

function getHotelBadges(hotel: HotelRecord): { key: string; title: string; bg: string }[] {
  const badges: { key: string; title: string; bg: string }[] = [];

  // Fixed front order: M3, 50
  const FRONT_CODES = ["michelin3keys", "best50"] as const;
  for (const code of FRONT_CODES) {
    const award = FEATURED_AWARDS.find((a) => a.code === code);
    if (award && hotel[award.code]) {
      badges.push({ key: award.badge, title: award.label, bg: BADGE_GOLD });
    }
  }

  // Editor rank: only 2 or 3
  const rank = Number(hotel.editor_rank ?? 0);
  if (Number.isFinite(rank) && rank >= 2 && rank <= 3) {
    badges.push({ key: `E${rank}`, title: `Editor's Rank ${rank}`, bg: rank === 3 ? BADGE_GOLD : BADGE_SILVER });
  }

  // Remaining awards in FEATURED_AWARDS order
  const frontCodeSet = new Set<string>(FRONT_CODES);
  for (const award of FEATURED_AWARDS) {
    if (!frontCodeSet.has(award.code) && hotel[award.code]) {
      badges.push({ key: award.badge, title: award.label, bg: award.gold ? BADGE_GOLD : BADGE_SILVER });
    }
  }

  return badges;
}


function getFeaturedAwardsFilterMap(): Map<string, string> {
  return new Map(FEATURED_AWARDS.map((award) => [award.code, award.label]));
}

function getAwardLabelById(id: string, map: Map<string, string>): string {
  return map.get(id) ?? id;
}

function getPriceSummary(searchParams: PageSearchParams, currency: string): string[] {
  const min = normalizeParam(searchParams.min_price);
  const max = normalizeParam(searchParams.max_price);
  if (!min && !max) return [];
  if (min && max) return [`Price / total stay: ${min}–${max} ${currency}`];
  if (min) return [`Price / total stay: from ${min} ${currency}`];
  return [`Price / total stay: up to ${max} ${currency}`];
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


let _ml: typeof maplibregl | null = null;
async function loadMaplibre(): Promise<typeof maplibregl> {
  if (!_ml) _ml = (await import("maplibre-gl")).default;
  return _ml;
}

export default function HotelsView(props: {
  hotels: HotelRecord[];
  options: Options;
  tax: TaxMaps;
  suggestions: HotelSuggestionDataset;
  searchParams: PageSearchParams;
  selected: {
    q: string;
    country: string[];
    city: string[];
    state: string[];
    admin_region: string[];
    /** Set only by the AI concierge handoff (`?ids=`), which pins the page to
     * exactly the properties it recommended. Empty for every normal search. */
    ids: string[];
    region: string[];
    /** A colloquial region ("The Alps") from the destination field. */
    macro_region: string[];
    local_area: string[];
    affiliation: string[];
    activities: string[];
    awards: string[];
    settings: string[];
    styles: string[];
    filters_open: string;
    search_submitted: string;
    landing_handoff: string;
  };  
}) {
  const { hotels, tax, searchParams, selected } = props;

  const hasMeaningfulFilters =
    (selected.search_submitted === "1" || selected.landing_handoff === "1") &&
    Boolean(
      selected.q ||
        selected.country.length ||
        selected.city.length ||
        selected.state.length ||
        selected.admin_region.length ||
        selected.ids.length ||
        selected.region.length ||
        selected.macro_region.length ||
        selected.local_area.length ||
        selected.affiliation.length ||
        selected.activities.length ||
        selected.awards.length ||
        selected.settings.length ||
        selected.styles.length
    );

  const hasDirectHotelSelection = Boolean(
    selected.q &&
      hotels.some(
        (hotel) =>
          String(hotel.hotel_name ?? "").trim().toLowerCase() ===
          String(selected.q).trim().toLowerCase()
      )
  );


  const hasCountrySelected = selected.country.length > 0;
  const shouldShowResults =
    hasMeaningfulFilters &&
    (hasDirectHotelSelection || hasCountrySelected || hotels.length <= 50);

  const visibleHotels = useMemo(
    () => (shouldShowResults ? hotels : []),
    [shouldShowResults, hotels]
  );
  const shouldShowFeatured = !shouldShowResults;

  const [pinnedHotelId, setPinnedHotelId] = useState<string>("");

  const showNarrowFurtherMessage =
    hasMeaningfulFilters &&
    !hasDirectHotelSelection &&
    !hasCountrySelected &&
    hotels.length > 50;

  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const tripPickerRef = useRef<HTMLDivElement | null>(null);
  // Wrappers around the date and guest controls, so a click on the passive
  // SEARCH button can focus the first incomplete one.
  const datesFieldRef = useRef<HTMLDivElement | null>(null);
  const guestsFieldRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const selectionFromMapRef = useRef(false);

  const featuredAwardsFilterMap = useMemo(() => getFeaturedAwardsFilterMap(), []);

  const bookingSearchParams = useMemo<BookingSearchParams>(
    () => ({
      from: normalizeParam(searchParams.from) || null,
      to: normalizeParam(searchParams.to) || null,
      adults: normalizeParam(searchParams.adults) || null,
      kids: normalizeParam(searchParams.kids) || null,
      bedrooms: normalizeParam(searchParams.bedrooms) || null,
    }),
    [searchParams]
  );

  const [filtersOpen, setFiltersOpen] = useState(selected.filters_open === "1");
  const [priceOpen, setPriceOpen] = useState(false);
  const [activitiesOpen, setActivitiesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [awardsOpen, setAwardsOpen] = useState(false);
  const [activeCurrency, setActiveCurrency] = useState("EUR");
  const [memberActionMessage, setMemberActionMessage] = useState("");
  const [memberActionError, setMemberActionError] = useState("");
  const [memberActionLoading, setMemberActionLoading] = useState<
    "trip" | "favorite" | null
  >(null);
  const [isMemberLoggedIn, setIsMemberLoggedIn] = useState(false);
  const [ratehawkResultAvailability, setRatehawkResultAvailability] = useState<
    Record<string, RatehawkResultAvailability>
  >({});

  const [ratehawkResultAvailabilityStatus, setRatehawkResultAvailabilityStatus] =
    useState<"idle" | "loading" | "loaded" | "error">("idle");

  /* Result prices already fetched, by hid, for one stay (dates, currency,
     residency, party, rooms). A headline of null means asked and not
     available. See the batch effect. */
  const resultAvailabilityCacheRef = useRef<{
    stayKey: string;
    fetchedAt: number;
    headlines: Map<number, RatehawkHeadline | null>;
  } | null>(null);

  const ratehawkResultAvailabilityLoading =
    ratehawkResultAvailabilityStatus === "loading";

  // Result-card ordering: bookable hotels first, everything we couldn't price
  // (no dates yet, no Ratehawk match, check failed) in the middle, explicitly
  // unavailable hotels last. The pinned hotel still wins outright so clicking a
  // card never makes it jump away under the cursor.
  const orderedVisibleHotels = useMemo(() => {
    const rank = (h: HotelRecord) => {
      const availability = ratehawkResultAvailability[String(h.id)];
      if (availability?.status === "available" && availability.headline) return 0;
      // Passive sits above sold-out: it isn't a dead end, the guest can still
      // book on the hotel's own site.
      if (h.ratehawk_status === "passive") return 2;
      if (availability?.status === "unavailable") return 3;
      return 1;
    };
    // Array.prototype.sort is stable, so hotels of equal rank keep the
    // editorial order they arrived in.
    const ordered = [...visibleHotels].sort((a, b) => rank(a) - rank(b));
    if (!pinnedHotelId) return ordered;
    const idx = ordered.findIndex((h) => String(h.id) === pinnedHotelId);
    if (idx <= 0) return ordered;
    const [picked] = ordered.splice(idx, 1);
    ordered.unshift(picked);
    return ordered;
  }, [visibleHotels, pinnedHotelId, ratehawkResultAvailability]);

  const [ratehawkRooms, setRatehawkRooms] = useState<RatehawkDetailState>({
    status: "idle",
    rooms: [],
    headline: null,
  });

  // One rate covers every room searched (§32), so the guest picks a room type,
  // not a quantity per type.
  const [selectedRoomKey, setSelectedRoomKey] = useState<string | null>(null);
  const [openRoomDetailKey, setOpenRoomDetailKey] = useState<string | null>(null);

  const [availabilitySearchDirty, setAvailabilitySearchDirty] = useState(false);

  const [tripChoices, setTripChoices] = useState<
    Array<{ id: string; name: string; label: string }>
  >([]);
  const [selectedTripIdForAdd, setSelectedTripIdForAdd] = useState("");
  const [showTripPicker, setShowTripPicker] = useState(false);
  const [favoriteHotelIds, setFavoriteHotelIds] = useState<Set<string>>(new Set());
  const [newTripName, setNewTripName] = useState("");
  const tripLimitReached = tripChoices.length >= MAX_TRIPS_PER_MEMBER;

  const [tripPickerNotice, setTripPickerNotice] = useState("");

  const createTripBlockedReason = getCreateTripBlockedReason({
    name: newTripName,
    existingNames: tripChoices.map((trip) => trip.name),
    tripCount: tripChoices.length,
  });
  const [creatingTrip, setCreatingTrip] = useState(false);

  const [fromValue, setFromValue] = useState(normalizeParam(searchParams.from));
  const [toValue, setToValue] = useState(normalizeParam(searchParams.to));
  const [guestSelection, setGuestSelection] = useState<GuestSelection>(
    readGuestSelection(searchParams)
  );

  const todayIso = new Date().toISOString().slice(0, 10);

  const [bedroomsValue, setBedroomsValue] = useState(
    normalizeParam(searchParams.bedrooms) || "1"
  );

  // Passport country ("residency" in ETG's API), not country of residence —
  // sent on every /search/serp/*/ and /search/hp/ request, one value applied
  // to all guests in the search. Starts empty (SSR-safe — see the
  // locale-default effect below) and is a real, user-changeable form field,
  // not a hardcoded constant. See CLAUDE.md §30/§32.
  const [residencyValue, setResidencyValue] = useState(
    normalizeParam(searchParams.residency) || ""
  );

  const fromDate = fromValue ? new Date(fromValue) : null;
  const toDate = toValue ? new Date(toValue) : null;

  const stayLengthMs =
    fromDate && toDate ? toDate.getTime() - fromDate.getTime() : 0;

  // ETG's 30-night maximum (§32). The form used to allow 42.
  const stayTooLong = isStayTooLong(fromValue, toValue);

  const hasGuestDetails = guestSelection.adults > 0;

  // A child without an age, or more guests than ETG allow per room (§32).
  // Neither is defaulted: nothing is priced until the guest fixes it.
  const guestIssue = guestSelectionIssue(
    guestSelection,
    Math.max(1, Number(bedroomsValue) || 1)
  );

  const hasRequiredStayDetails =
    Boolean(fromValue) &&
    Boolean(toValue) &&
    hasGuestDetails &&
    !guestIssue &&
    Boolean(bedroomsValue) &&
    Boolean(residencyValue);

  const datesAreValid =
    Boolean(fromDate) &&
    Boolean(toDate) &&
    stayLengthMs > 0 &&
    !stayTooLong;

  const resultCountTooLarge =
    hasMeaningfulFilters &&
    !hasDirectHotelSelection &&
    !hasCountrySelected &&
    hotels.length > 50;

  const searchDisabledReason = resultCountTooLarge
    ? "Please limit no of results"
    : !hasRequiredStayDetails || !datesAreValid
      ? "Please select dates and guest details to check availability"
      : "";

  const searchIsActive = searchDisabledReason === "";

  const topAvailabilityChecked =
    ratehawkResultAvailabilityStatus === "loaded" && !availabilitySearchDirty;

  // The SEARCH button is busy (a real `disabled`) only while a check runs.
  // Otherwise it stays clickable and goes passive with a hover reason; a click
  // on a passive button with missing entries moves focus to the first one.
  // Bedrooms defaults to 1 and residency is auto-detected, so in practice only
  // dates and guests go missing.
  const searchBusy = ratehawkResultAvailabilityStatus === "loading";
  const searchNeedsDates = !datesAreValid;
  const searchNeedsGuests = !hasGuestDetails || Boolean(guestIssue);
  const searchPassiveReason = resultCountTooLarge
    ? "Narrow your search to 50 hotels or fewer to check availability"
    : searchNeedsDates && searchNeedsGuests
      ? "Add dates and guests to continue"
      : searchNeedsDates
        ? fromValue && toValue
          ? STAY_TOO_LONG_MESSAGE
          : "Add dates to continue"
        : searchNeedsGuests
          ? guestIssue ?? "Add guests to continue"
          : !searchIsActive
            ? "Add stay details to continue"
            : topAvailabilityChecked
              ? "Availability already checked for these dates and guests"
              : "";

  const [selectedHotelId, setSelectedHotelId] = useState<string | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [ratehawkGallery, setRatehawkGallery] = useState<
    { url: string; category: string | null }[] | null
  >(null);
  const [viewMode, setViewMode] = useState<ViewMode>("featured");
  const [descExpanded, setDescExpanded] = useState(false);

  const [isSubmittingSearch, setIsSubmittingSearch] = useState(false);
  const [simpleSearchSubmitted, setSimpleSearchSubmitted] = useState("0");

  const compactTopMode = shouldShowFeatured;
  const effectiveView: ViewMode = shouldShowFeatured ? "featured" : viewMode;

  useEffect(() => {
    setIsSubmittingSearch(false);
    setSimpleSearchSubmitted("0");
    setAvailabilitySearchDirty(false);
  }, [searchParams]);

  useEffect(() => {
    setFiltersOpen(selected.filters_open === "1");
  }, [selected.filters_open]);

  useEffect(() => {
    if (!hasHotelSearchContext(searchParams)) return;

    setFromValue(normalizeParam(searchParams.from));
    setToValue(normalizeParam(searchParams.to));
    setGuestSelection(readGuestSelection(searchParams));
    setBedroomsValue(normalizeParam(searchParams.bedrooms) || "1");
  }, [searchParams]);

  /* The concierge, as far as this page is concerned: whether its hotel answer
     is still the current one, and how to mark it dismissed. Reads the search
     context, not the transcript, so a streaming reply does not re-render the
     page. */
  const { markClassicSearch } = useAiActions();
  const {
    ready: aiReady,
    results: aiResults,
    presentedAt: aiPresentedAt,
    searchedAt: aiSearchedAt,
    clearSignal: aiClearSignal,
  } = useAiSearch();
  const aiHotelsPending =
    aiResults.hotelIds.length > 0 && aiResultsAreCurrent(aiResults, aiPresentedAt, aiSearchedAt);

  /* "AI curated results" as the one token in the destination box while the
     page is pinned to the concierge's set (`?ids=`). Removing it drops the set
     and the concierge's destination with it; the dates and guests stay. */
  const curatedIds = selected.ids.join(",");
  const dropCuratedSet = () => {
    clearHotelFlightDestination();
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (value === undefined || CURATED_DROPS.has(key)) continue;
      for (const v of Array.isArray(value) ? value : [value]) params.append(key, v);
    }
    startTransition(() => {
      router.replace(params.toString() ? `/hotels?${params.toString()}` : "/hotels", {
        scroll: false,
      });
    });
  };
  const curatedDestination = curatedIds
    ? {
        key: curatedIds,
        ids: curatedIds,
        onRemove: () => {
          markClassicSearch();
          dropCuratedSet();
        },
      }
    : undefined;

  /* CLEARING THE CONVERSATION CLEARS ITS SET HERE TOO (2026-09-15). The page
     is pinned to an answer through the URL, which Clear never touched: after a
     cleared Morocco conversation and a new question about Paris restaurants,
     this page still showed Kasbah Tamadot under "AI curated results" — a hotel
     from a conversation that no longer existed, labelled as the new answer's.
     Keyed on the Clear signal rather than on the store being empty, so a
     shared link carrying `?ids=` still opens with no conversation behind it. */
  const seenClearSignal = useRef(aiClearSignal);
  useEffect(() => {
    if (aiClearSignal === seenClearSignal.current) return;
    seenClearSignal.current = aiClearSignal;
    if (curatedIds) dropCuratedSet();
    // Only the signal decides; the params it reads are this render's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiClearSignal]);

  useEffect(() => {
    if (hasHotelSearchContext(searchParams)) return;
    // Not before the concierge store has loaded from sessionStorage: until
    // then an empty store reads as "no answer waiting", and the restore ran on
    // the first render and landed a previous answer's city as tags (found
    // 2026-09-14, after the guard below had passed its first test by timing).
    if (!aiReady) return;
    // A concierge answer is about to be written in by AiResultsSync. Restoring
    // the shared session here would race it and land the answer's city as tags.
    if (aiHotelsPending) return;

    const saved = readHotelFlightSearch();
    if (!saved) return;

    const params = new URLSearchParams();

    if (saved.q) params.set("q", saved.q);
    if (saved.city) params.set("city", saved.city);
    if (saved.state) params.set("state", saved.state);
    if (saved.admin_region) params.set("admin_region", saved.admin_region);
    if (saved.country) params.set("country", saved.country);
    if (saved.region) params.set("region", saved.region);
    if (saved.macro_region) params.set("macro_region", saved.macro_region);
    if (saved.from) params.set("from", saved.from);
    if (saved.to) params.set("to", saved.to);
    if (saved.adults) params.set("adults", saved.adults);
    if (saved.kids) params.set("kids", saved.kids);
    if (saved.bedrooms) params.set("bedrooms", saved.bedrooms);

    for (let i = 1; i <= 6; i += 1) {
      const key = `kid_age_${i}` as keyof typeof saved;
      const value = saved[key];
      if (value) params.set(`kid_age_${i}`, String(value));
    }

    if (!params.toString()) return;

    params.set("search_submitted", "1");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [searchParams, router, pathname, aiReady, aiHotelsPending]);

  useEffect(() => {
    const hasAnythingToSave =
      hasHotelSearchContext(searchParams) ||
      Boolean(fromValue) ||
      Boolean(toValue) ||
      Boolean(bedroomsValue);

    if (!hasAnythingToSave) return;

    mergeHotelFlightSearch({
      q: normalizeParam(searchParams.q),
      city: normalizeParam(searchParams.city),
      state: normalizeParam(searchParams.state),
      admin_region: normalizeParam(searchParams.admin_region),
      country: normalizeParam(searchParams.country),
      region: normalizeParam(searchParams.region),
      macro_region: normalizeParam(searchParams.macro_region),
      from: fromValue,
      to: toValue,
      adults: String(guestSelection.adults),
      kids: String(guestSelection.kids),
      bedrooms: bedroomsValue,
      kid_age_1: normalizeParam(searchParams.kid_age_1),
      kid_age_2: normalizeParam(searchParams.kid_age_2),
      kid_age_3: normalizeParam(searchParams.kid_age_3),
      kid_age_4: normalizeParam(searchParams.kid_age_4),
      kid_age_5: normalizeParam(searchParams.kid_age_5),
      kid_age_6: normalizeParam(searchParams.kid_age_6),
    });
  }, [searchParams, fromValue, toValue, guestSelection, bedroomsValue]);

  useEffect(() => {
    function readCurrency() {
      if (typeof window === "undefined") return;
      const stored = window.localStorage.getItem(CURRENCY_STORAGE_KEY);
      setActiveCurrency(stored || "EUR");
    }

    function handleCurrencyChange(event: Event) {
      const customEvent = event as CustomEvent<{ currency?: string }>;
      const nextCurrency = customEvent.detail?.currency;
      if (nextCurrency) setActiveCurrency(nextCurrency);
      else readCurrency();
    }

    readCurrency();

    window.addEventListener(
      "oltra:currency-change",
      handleCurrencyChange as EventListener
    );

    return () => {
      window.removeEventListener(
        "oltra:currency-change",
        handleCurrencyChange as EventListener
      );
    };
  }, []);

  // Client-only locale-derived default for residency — mirrors the currency
  // effect above. Runs once on mount; only fills in when nothing was already
  // set from the URL, so a submitted search's `residency` param always wins.
  useEffect(() => {
    setResidencyValue((prev) => prev || guessResidencyFromLocale());
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!tripPickerRef.current) {
        setShowTripPicker(false);
        return;
      }

      if (!tripPickerRef.current.contains(event.target as Node)) {
        setShowTripPicker(false);
      }
    }

    if (showTripPicker) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showTripPicker]);

  useEffect(() => {
    if (!showTripPicker) return;

    function handleMouseOver(e: MouseEvent) {
      const target = e.target as Element | null;
      if (!target) return;
      if (tripPickerRef.current?.contains(target)) return;
      if (target.closest("button, a, input, [data-oltra-control]")) {
        setShowTripPicker(false);
      }
    }

    document.addEventListener("mouseover", handleMouseOver);
    return () => document.removeEventListener("mouseover", handleMouseOver);
  }, [showTripPicker]);

  useEffect(() => {
    if (!isMemberLoggedIn) {
      setFavoriteHotelIds(new Set());
      return;
    }

    let active = true;

    async function loadFavorites() {
      try {
        const list = await fetchFavoriteHotelsBrowser();
        if (!active) return;
        // hotelDirectusId, not id: `id` is the favourite row's own uuid, which
        // can never equal a hotel id - so "ALREADY IN FAVOURITES" never showed
        // and the same hotel could be favourited twice.
        setFavoriteHotelIds(
          new Set(
            list
              .map((f) => f.hotelDirectusId)
              .filter((id): id is string => Boolean(id))
              .map(String)
          )
        );
      } catch {
        // not critical
      }
    }

    void loadFavorites();
    return () => { active = false; };
  }, [isMemberLoggedIn]);

  useEffect(() => {
    let active = true;

    async function loadMemberAccess() {
      try {
        const result = await getMemberActionAccessBrowser();
        if (!active) return;
        setIsMemberLoggedIn(result.isLoggedIn);
      } catch {
        if (!active) return;
        setIsMemberLoggedIn(false);
      }
    }

    void loadMemberAccess();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadTripChoices() {
      try {
        const trips = await fetchTripChoicesBrowser();
        if (!active) return;

        setTripChoices(trips);
        setSelectedTripIdForAdd((prev) => prev || trips[0]?.id || "");
      } catch {
        if (!active) return;
        setTripChoices([]);
        setSelectedTripIdForAdd("");
      }
    }

    void loadTripChoices();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!shouldShowResults || visibleHotels.length === 0) {
      setSelectedHotelId(null);
      return;
    }

    const firstHotelId = String(visibleHotels[0].id);

    if (!selectedHotelId) {
      setSelectedHotelId(firstHotelId);
      return;
    }

    const stillExists = visibleHotels.some(
      (hotel) => String(hotel.id) === selectedHotelId
    );

    if (!stillExists) {
      setSelectedHotelId(firstHotelId);
    }
  }, [shouldShowResults, visibleHotels, selectedHotelId]);

  useEffect(() => {
    setSelectedImageIndex(0);
    setLightboxOpen(false);
    setRatehawkGallery(null);
  }, [selectedHotelId]);

  useEffect(() => {
    if (!shouldShowFeatured && viewMode === "featured") {
      setViewMode("details");
    }
  }, [shouldShowFeatured, viewMode]);

  useEffect(() => {
    if (effectiveView === "featured") {
      setSelectedImageIndex(0);
    }
  }, [effectiveView]);

  useEffect(() => {
    if (!memberActionMessage && !memberActionError) return;

    const timer = window.setTimeout(() => {
      setMemberActionMessage("");
      setMemberActionError("");
    }, 3200);

    return () => window.clearTimeout(timer);
  }, [memberActionMessage, memberActionError]);

  useEffect(() => {
    setRatehawkRooms({ status: "idle", rooms: [], headline: null });
    setSelectedRoomKey(null);
    setOpenRoomDetailKey(null);
    setPrebook({ status: "idle" });
  }, [
    selectedHotelId,
    fromValue,
    toValue,
    guestSelection.adults,
    guestSelection.kids,
    bedroomsValue,
    activeCurrency,
  ]);

  useEffect(() => {
    if (!availabilitySearchDirty) return;

    setRatehawkResultAvailability({});
    setRatehawkResultAvailabilityStatus("idle");
    setRatehawkRooms({ status: "idle", rooms: [], headline: null });
  }, [availabilitySearchDirty]);

  const selectedHotel = useMemo(() => {
    if (!shouldShowResults) return null;
    if (visibleHotels.length === 0) return null;

    const byId = selectedHotelId
      ? visibleHotels.find((hotel) => String(hotel.id) === selectedHotelId)
      : null;

    if (byId) return byId;

    return visibleHotels[0] ?? null;
  }, [shouldShowResults, visibleHotels, selectedHotelId]);

  useEffect(() => {
    setDescExpanded(false);
  }, [selectedHotel?.id]);

  /* What the concierge should assume if it is opened from this page.
     The selected hotel is the important part: "somewhere quieter" asked while
     looking at a property means an alternative to that property. */
  useAiPageContext({
    page: "hotels",
    hotelName: selectedHotel?.hotel_name ?? "",
    hotelId: selectedHotel ? Number(selectedHotel.id) : undefined,
    city: selectedHotel?.city ?? normalizeParam(searchParams.city),
    country: selectedHotel?.country ?? normalizeParam(searchParams.country),
    from: fromValue,
    to: toValue,
    adults: guestSelection.adults,
    kids: guestSelection.kids,
    rooms: Math.max(1, Number(bedroomsValue) || 1),
  });

  // Lets the Restaurants page show this hotel on its map (with a link back)
  // when reached via the shared session (e.g. the top-nav Restaurants link).
  useEffect(() => {
    if (!selectedHotel) return;
    mergeHotelFlightSearch({ hotelId: String(selectedHotel.id) });
  }, [selectedHotel]);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current || effectiveView !== "map") {
      return;
    }

    const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
    if (!key) {
      console.error("Missing NEXT_PUBLIC_MAPTILER_KEY");
      return;
    }

    let cancelled = false;
    let map: maplibregl.Map | null = null;

    loadMaplibre().then((ml) => {
      if (cancelled || !mapRef.current) return;

      map = new ml.Map({
        container: mapRef.current,
        style: `https://api.maptiler.com/maps/streets-v4/style.json?key=${key}`,
        center: MAP_FALLBACK_CENTER,
        zoom: 11,
      });

      map.addControl(new ml.NavigationControl(), "top-right");

      map.on("load", () => {
        map!.resize();
        window.setTimeout(() => map!.resize(), 100);
        window.setTimeout(() => map!.resize(), 350);
      });

      mapInstanceRef.current = map;

      const onWindowResize = () => {
        map!.resize();
      };

      window.addEventListener("resize", onWindowResize);

      if (typeof ResizeObserver !== "undefined" && mapRef.current) {
        const observer = new ResizeObserver(() => {
          map!.resize();
        });
        observer.observe(mapRef.current);
        resizeObserverRef.current = observer;
      }

      setMapReady(true);
    });

    return () => {
      cancelled = true;

      window.removeEventListener("resize", () => map?.resize());

      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }

      markersRef.current.forEach((marker) => {
        try {
          marker.remove();
        } catch {}
      });
      markersRef.current = [];

      if (map) {
        try {
          map.remove();
        } catch {}
      }

      mapInstanceRef.current = null;
      setMapReady(false);
    };
  }, [effectiveView]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const ml = _ml;
    if (!map || !ml || effectiveView !== "map") return;

    markersRef.current.forEach((marker) => {
      try {
        marker.remove();
      } catch {}
    });
    markersRef.current = [];

    const bounds = new ml.LngLatBounds();
    let hasBounds = false;

    for (const hotel of visibleHotels) {
      const lat = getCoord(hotel, "lat");
      const lng = getCoord(hotel, "lng");
      if (lat === null || lng === null) continue;

      const el = document.createElement("button");
      el.type = "button";
      el.className = "hotel-marker";
      el.dataset.hotelId = String(hotel.id);
      el.dataset.selected = String(String(hotel.id) === selectedHotelId);
      el.setAttribute("aria-label", hotel.hotel_name ?? "Hotel");

      el.innerHTML = `
        <span class="hotel-marker__inner" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path d="M4 11.2 12 4l8 7.2v8.3a.5.5 0 0 1-.5.5h-5v-5.4h-5V20h-5a.5.5 0 0 1-.5-.5v-8.3Z" fill="currentColor"/>
          </svg>
        </span>
      `;

      const popupImage = getHotelImageSet(hotel)[0] ?? PLACEHOLDERS[0];
      const popupHasPhoto = hasHotelPhotos(hotel);
      const popupTitle = (hotel.hotel_name ?? "Untitled hotel").replace(/</g, "&lt;");
      const popupMeta = (locationLine(hotel) || "—").replace(/</g, "&lt;");

      const popup = new ml.Popup({
        closeButton: false,
        closeOnClick: false,
        closeOnMove: false,
        offset: 14,
        className: "oltra-map-popup",
      }).setHTML(`
        <div class="oltra-map-popup__box">
          ${
            popupHasPhoto
              ? `<img class="oltra-map-popup__image" src="${popupImage}" alt="" />`
              : `<div class="oltra-map-popup__placeholder">Photos coming soon</div>`
          }
          <div class="oltra-map-popup__title">${popupTitle}</div>
          <div class="oltra-map-popup__meta">${popupMeta}</div>
        </div>
      `);

      const marker = new ml.Marker({ element: el })
        .setLngLat([lng, lat])
        .setPopup(popup)
        .addTo(map);

      el.addEventListener("mouseenter", () => {
        try {
          popup.addTo(map);
          marker.togglePopup();
          if (!popup.isOpen()) {
            marker.togglePopup();
          }
        } catch {}
      });

      el.addEventListener("mouseleave", () => {
        if (popup.isOpen()) {
          try {
            popup.remove();
          } catch {}
        }
      });

      el.addEventListener("click", (event) => {
        event.stopPropagation();
        selectionFromMapRef.current = true;
        const id = String(hotel.id);
        setSelectedHotelId(id);
        setPinnedHotelId(id);
      });

      markersRef.current.push(marker);
      bounds.extend([lng, lat]);
      hasBounds = true;
    }

    if (hasBounds) {
      map.fitBounds(bounds, {
        padding: { top: 72, right: 72, bottom: 72, left: 72 },
        maxZoom: 14,
        duration: 0,
      });
    } else {
      map.jumpTo({
        center: MAP_FALLBACK_CENTER,
        zoom: 11,
      });
    }

    map.resize();
    // selectedHotelId is read above only to mark the initial selection. The
    // effect after this one keeps data-selected in step on every selection;
    // depending on it here would rebuild every marker and refit the map each
    // time a hotel is picked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveView, visibleHotels, mapReady]);

  useEffect(() => {
    markersRef.current.forEach((marker) => {
      const el = marker.getElement() as HTMLElement | null;
      if (!el) return;
      el.dataset.selected = String(el.dataset.hotelId === selectedHotelId);
    });
  }, [selectedHotelId]);

    useEffect(() => {
    if (selectionFromMapRef.current) {
      selectionFromMapRef.current = false;
      return;
    }

    const map = mapInstanceRef.current;
    if (!map || effectiveView !== "map" || !selectedHotel) return;

    const lat = getCoord(selectedHotel, "lat");
    const lng = getCoord(selectedHotel, "lng");
    if (lat === null || lng === null) return;

    map.easeTo({
      center: [lng, lat],
      zoom: map.getZoom(),
      duration: 500,
      essential: true,
    });
  }, [selectedHotel, effectiveView]);
  
  const featuredHotels = useMemo(() => {
    if (!hotels.length) return [];
    return hotels.filter((hotel) => hasHotelPhotos(hotel));
  }, [hotels]);

  const featuredCycleRef = useRef<number[]>([]);
  const featuredTailRef = useRef<number[]>([]);
  // Everything already shown, in order, plus where in it we currently are.
  // The arrows walk this rather than stepping the pool by ±1: "previous" has
  // to mean "the hotel I just saw", and the auto-revolve order is a shuffle,
  // so pool order would send Back somewhere the viewer has never been.
  const featuredHistoryRef = useRef<number[]>([]);
  const featuredHistoryPosRef = useRef(0);
  const featuredBuildCycleRef = useRef<((prevTail: number[]) => number[]) | null>(null);
  // Bumped by the arrows so the auto-advance interval restarts - otherwise a
  // manual step could be followed a fraction of a second later by an automatic
  // one.
  const [featuredTimerNonce, setFeaturedTimerNonce] = useState(0);

  useEffect(() => {
    if (effectiveView !== "featured") return;
    if (featuredHotels.length <= 1) return;

    const n = featuredHotels.length;
    const GAP = Math.min(30, n);

    function shuffle(): number[] {
      const a = Array.from({ length: n }, (_, i) => i);
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    function buildCycle(prevTail: number[]): number[] {
      const all = shuffle();
      const tail = new Set(prevTail);
      const block = Math.min(GAP, all.length);
      for (let i = 0; i < block; i++) {
        if (tail.has(all[i])) {
          for (let j = block; j < all.length; j++) {
            if (!tail.has(all[j])) {
              [all[i], all[j]] = [all[j], all[i]];
              break;
            }
          }
        }
      }
      return all;
    }

    featuredBuildCycleRef.current = buildCycle;

    const initial = buildCycle([]);
    featuredTailRef.current = [];
    const first = initial.shift() ?? 0;
    featuredCycleRef.current = initial;
    featuredTailRef.current = [first];
    featuredHistoryRef.current = [first];
    featuredHistoryPosRef.current = 0;
    setSelectedImageIndex(first);
  }, [effectiveView, featuredHotels]);

  // Pulls the next hotel out of the shuffled cycle, or replays forward history
  // when the viewer has stepped back with the arrows.
  const advanceFeatured = useCallback(() => {
    const history = featuredHistoryRef.current;
    if (featuredHistoryPosRef.current < history.length - 1) {
      featuredHistoryPosRef.current += 1;
      setSelectedImageIndex(history[featuredHistoryPosRef.current]);
      return;
    }

    const buildCycle = featuredBuildCycleRef.current;
    if (!buildCycle) return;
    if (featuredCycleRef.current.length === 0) {
      featuredCycleRef.current = buildCycle(featuredTailRef.current);
    }
    const next = featuredCycleRef.current.shift();
    if (next === undefined) return;

    const GAP = Math.min(30, Math.max(featuredHotels.length, 1));
    featuredTailRef.current = [...featuredTailRef.current, next].slice(-GAP);
    // Capped so an idle page left running overnight doesn't grow this forever.
    featuredHistoryRef.current = [...history, next].slice(-200);
    featuredHistoryPosRef.current = featuredHistoryRef.current.length - 1;
    setSelectedImageIndex(next);
  }, [featuredHotels.length]);

  const stepFeaturedBack = useCallback(() => {
    if (featuredHistoryPosRef.current <= 0) return;
    featuredHistoryPosRef.current -= 1;
    setSelectedImageIndex(featuredHistoryRef.current[featuredHistoryPosRef.current]);
    setFeaturedTimerNonce((n) => n + 1);
  }, []);

  const stepFeaturedForward = useCallback(() => {
    advanceFeatured();
    setFeaturedTimerNonce((n) => n + 1);
  }, [advanceFeatured]);

  useEffect(() => {
    if (effectiveView !== "featured") return;
    if (featuredHotels.length <= 1) return;
    // 7.5s - the auto-revolve stays live alongside the arrows, just slower.
    const timer = window.setInterval(advanceFeatured, 7500);
    return () => window.clearInterval(timer);
  }, [effectiveView, featuredHotels.length, advanceFeatured, featuredTimerNonce]);

  const featuredHotel =
    featuredHotels[selectedImageIndex % Math.max(featuredHotels.length, 1)] ??
    hotels[0] ??
    {
      hotel_name: "Featured hotel",
      city: "",
      country: "",
      highlights: "",
      awards: [],
      ext_points: 0,
      editor_rank: 0,
    };

  // The featured strip shows three images of the current hotel, but the bulk
  // hotels fetch only carries ratehawk_image_1 (§29 - pulling all 50 slots for
  // ~870 hotels measured at ~4.5MB), so the rest come from the same per-hotel
  // route the detail panel uses. Cached by hotel id: the revolver returns to
  // hotels it has already shown, and the arrows make that common.
  const featuredImagesCacheRef = useRef<Map<string, string[]>>(new Map());
  // Tagged with the hotel it belongs to: without the id, a hotel whose fetch
  // is still in flight would render the previous hotel's images for a frame.
  const [featuredExtraImages, setFeaturedExtraImages] = useState<{
    id: string;
    urls: string[];
  }>({ id: "", urls: [] });
  const featuredHotelId = (featuredHotel as HotelRecord).id;

  // Resolves one hotel's strip URLs and waits for the browser to actually
  // fetch them, so a later render can paint them in the same frame it swaps
  // the text. Cached by hotel id - the revolver returns to hotels it has
  // already shown, and the arrows make that common.
  const loadFeaturedImages = useCallback(
    async (hotel: HotelRecord | undefined): Promise<string[]> => {
      const key = String(hotel?.id ?? "");
      if (!key || !hotel?.ratehawk_image_1) return [];

      const cached = featuredImagesCacheRef.current.get(key);
      if (cached) return cached;

      try {
        const res = await fetch(`/api/hotels/${key}/ratehawk-images`);
        const data = (await res.json()) as {
          ok?: boolean;
          images?: { url: string }[];
        };
        if (!data?.ok) return [];
        const urls = (data.images ?? [])
          .slice(0, FEATURED_IMAGE_COUNT)
          .map((image) => resolveRatehawkUrl(image.url, RATEHAWK_FULL_SIZE));
        featuredImagesCacheRef.current.set(key, urls);
        await Promise.all(urls.map(preloadImage));
        return urls;
      } catch {
        return [];
      }
    },
    []
  );

  useEffect(() => {
    const key = String(featuredHotelId ?? "");
    let cancelled = false;

    void loadFeaturedImages(featuredHotel as HotelRecord).then((urls) => {
      if (!cancelled) setFeaturedExtraImages({ id: key, urls });
    });

    // Warm the *next* hotel in the revolver during the current one's 5s dwell.
    // This is what makes the swap atomic: by the time the index advances, the
    // three URLs are in the cache (read synchronously below, in the same
    // render that changes the text) and the bytes are in the browser's, so
    // the images and the detail box change together instead of the strip
    // showing one image and then popping to three.
    const nextIndex = featuredCycleRef.current[0];
    if (typeof nextIndex === "number") {
      void loadFeaturedImages(featuredHotels[nextIndex] as HotelRecord);
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featuredHotelId, featuredHotels, loadFeaturedImages]);

  // Agoda hotels already carry up to 5 images in the bulk fetch, so they need
  // no extra request. Whatever is available is shown - 1, 2 or 3 - rather than
  // padding the row with repeats.
  const featuredStripImages = useMemo(() => {
    const key = String(featuredHotelId ?? "");
    // Cache first, and synchronously: the state below only lands a render
    // later, which is exactly the gap that made the strip lag the text.
    const fromRoute =
      (key ? featuredImagesCacheRef.current.get(key) : undefined) ??
      (featuredExtraImages.id === key ? featuredExtraImages.urls : []);

    const fromSet = getHotelImageSet(featuredHotel as HotelRecord).slice(
      0,
      FEATURED_IMAGE_COUNT
    );
    if (fromRoute.length > fromSet.length) return fromRoute;
    return fromSet.length ? fromSet : [PLACEHOLDERS[0]];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featuredHotelId, featuredExtraImages]);

  const selectedPriceLabels = useMemo(
    () => getPriceSummary(searchParams, activeCurrency),
    [searchParams, activeCurrency]
  );

  const resultsCount = visibleHotels.length;

  const selectedHotelSettings = useMemo(
    () => selectedHotel?.setting ?? [],
    [selectedHotel]
  );

  const selectedHotelActivities = useMemo(
    () => selectedHotel?.activities ?? [],
    [selectedHotel]
  );

  const selectedHotelAwards = useMemo(
    () =>
      selectedHotel
        ? getFeaturedAwardsForHotel(selectedHotel).map((award) => award.label)
        : [],
    [selectedHotel]
  );

  const selectedHotelStyles = useMemo(
    () => selectedHotel?.style ?? [],
    [selectedHotel]
  );

  const selectedHotelBookingHref = useMemo(
    () => (selectedHotel ? buildBookingLink(selectedHotel, bookingSearchParams) : null),
    [selectedHotel, bookingSearchParams]
  );

  const selectedHotelBookingLabel = useMemo(
    () => selectedHotel?.booking_label?.trim() || "BOOK",
    [selectedHotel]
  );

  const selectedRatehawkHid = useMemo(() => {
    const raw = selectedHotel?.ratehawk_hid;
    if (!raw) return null;

    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [selectedHotel]);

  function getRatehawkHidForHotel(hotel: HotelRecord): number | null {
    const raw = hotel.ratehawk_hid;
    if (!raw) return null;

    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  const selectedRoom = useMemo(
    () => ratehawkRooms.rooms.find((room) => room.roomKey === selectedRoomKey) ?? null,
    [ratehawkRooms.rooms, selectedRoomKey]
  );

  // The number of rooms the loaded rates were priced for.
  const searchedRoomCount = Math.max(1, Number(bedroomsValue) || 1);

  // A rate's price is already the total for every room searched — never
  // multiplied by the room count (§32).
  const roomSelectionTotal = selectedRoom?.pricePerStay ?? 0;

  const roomSelectionCurrency = selectedRoom?.currency ?? ratehawkRooms.rooms[0]?.currency ?? activeCurrency;

  const selectedHotelHeadlineTotal = ratehawkRooms.headline?.pricePerStay ?? null;

  // Saved trips keep their existing {roomName, quantity, pricePerStay} shape,
  // and SavedTripsView sums pricePerStay × quantity. So the whole-party total
  // is stored split evenly across the rooms, which multiplies back to exactly
  // the total ETG quoted. Trips saved before 2026-09-16 hold totals inflated
  // by the room count (§32).
  const selectedRoomSelectionEntries = useMemo(() => {
    if (!selectedRoom) return [];
    return [
      {
        roomName: selectedRoom.roomName,
        quantity: searchedRoomCount,
        pricePerStay: selectedRoom.pricePerStay / searchedRoomCount,
        currency: selectedRoom.currency,
      },
    ];
  }, [selectedRoom, searchedRoomCount]);

  /* PREBOOK — part of the search step, never a booking (lib/ratehawk/prebook.ts).
   *
   * Fires only from the Continue click below: never on load, never on a
   * selection change. Our key allows 5 prebooks a minute site-wide. */
  const [prebook, setPrebook] = useState<PrebookState>({ status: "idle" });
  // Bumped to re-run the room fetch after a rate turns out to be gone.
  const [roomsRefreshKey, setRoomsRefreshKey] = useState(0);

  // A confirmation belongs to one rate: choosing another, or the rooms
  // reloading, drops it. A failure message stays until the next Continue or a
  // change of hotel, dates or guests — it has to survive the refresh it
  // triggers, since it tells the guest why the rooms changed.
  useEffect(() => {
    setPrebook((prev) => (prev.status === "failed" ? prev : { status: "idle" }));
  }, [selectedRoomKey, ratehawkRooms.rooms]);

  async function handleContinueToCheckout() {
    if (!selectedRoom || prebook.status === "checking") return;
    const original = selectedRoom;
    setPrebook({ status: "checking" });

    let data: PrebookResponseBody;
    try {
      const res = await fetch("/api/ratehawk/prebook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        // The h- hash from Retrieve hotelpage. Prebook returns the p- hash.
        body: JSON.stringify({ hash: original.bookHash }),
      });
      data = (await res.json()) as PrebookResponseBody;
    } catch {
      setPrebook({ status: "failed", reason: "failed" });
      return;
    }

    if (!data.ok) {
      const reason = data.reason ?? "failed";
      setPrebook({ status: "failed", reason });
      // The chosen rate is gone: show the guest what can be had now.
      if (reason === "expired" || reason === "unavailable") {
        setRoomsRefreshKey((n) => n + 1);
      }
      return;
    }

    const confirmed = {
      prebookHash: data.prebookHash,
      rate: data.rate,
      prebookedAt: Date.now(),
    };
    const changes = compareRates(original, data.rate, data.priceChanged);
    setPrebook(
      changes.length
        ? { status: "changed", original, changes, ...confirmed }
        : { status: "confirmed", ...confirmed }
    );
  }

  function acceptChangedRate() {
    if (prebook.status !== "changed") return;
    const { prebookHash, rate, prebookedAt } = prebook;
    setPrebook({ status: "confirmed", prebookHash, rate, prebookedAt });
  }

  // ── WHITE LABEL REDIRECT SEAM ─────────────────────────────────────────────
  // A confirmed prebook ends here. `prebook.prebookHash` (p-…, valid 6 hours
  // from `prebook.prebookedAt`) is what the White Label checkout will receive.
  //
  // ETG have NOT specified the redirect: not the URL, not which parameters
  // accompany the hash, not whether anything is posted rather than linked. Do
  // not guess the format. When ETG confirm it, the handoff goes in a function
  // called from the confirmed-rate callout below, which today explains that
  // checkout is not live yet.
  // ──────────────────────────────────────────────────────────────────────────

  /* The selected hotel's description, fetched on selection rather than carried
     in the page's hotel list — which it made too large to cache (see the note
     on hotelFields in hotels/page.tsx). Cached per hotel for the session. */
  const descriptionCacheRef = useRef(new Map<string, string>());
  const [selectedDescription, setSelectedDescription] = useState<{
    id: string;
    text: string;
  }>({ id: "", text: "" });

  useEffect(() => {
    const id = selectedHotel?.id != null ? String(selectedHotel.id) : "";
    if (!id) return;
    const cached = descriptionCacheRef.current.get(id);
    if (cached !== undefined) {
      setSelectedDescription({ id, text: cached });
      return;
    }
    let cancelled = false;
    fetch(`/api/hotels/${id}/description`)
      .then((res) => res.json())
      .then((data: { ok?: boolean; description?: string }) => {
        const text = data?.ok ? (data.description ?? "") : "";
        descriptionCacheRef.current.set(id, text);
        if (!cancelled) setSelectedDescription({ id, text });
      })
      .catch(() => {
        if (!cancelled) setSelectedDescription({ id, text: "" });
      });
    return () => {
      cancelled = true;
    };
  }, [selectedHotel?.id]);

  /* The selected hotel's ETG policies (metapolicy_struct and
     metapolicy_extra_info, §32), fetched and cached per session the same way
     as the description — never part of the bulk hotels fetch. */
  const policiesCacheRef = useRef(new Map<string, HotelPolicies | null>());
  const [selectedPolicies, setSelectedPolicies] = useState<{
    id: string;
    policies: HotelPolicies | null;
  }>({ id: "", policies: null });

  useEffect(() => {
    const id = selectedHotel?.id != null ? String(selectedHotel.id) : "";
    if (!id || !selectedHotel?.ratehawk_hid) return;
    const cached = policiesCacheRef.current.get(id);
    if (cached !== undefined) {
      setSelectedPolicies({ id, policies: cached });
      return;
    }
    let cancelled = false;
    fetch(`/api/hotels/${id}/ratehawk-policy`)
      .then((res) => res.json())
      .then((data: { ok?: boolean; policies?: HotelPolicies }) => {
        const policies = data?.ok ? (data.policies ?? null) : null;
        policiesCacheRef.current.set(id, policies);
        if (!cancelled) setSelectedPolicies({ id, policies });
      })
      .catch(() => {
        if (!cancelled) setSelectedPolicies({ id, policies: null });
      });
    return () => {
      cancelled = true;
    };
  }, [selectedHotel?.id, selectedHotel?.ratehawk_hid]);

  useEffect(() => {
    if (!selectedHotel?.ratehawk_image_1) return;
    let cancelled = false;

    fetch(`/api/hotels/${selectedHotel.id}/ratehawk-images`)
      .then((res) => res.json())
      .then((data: { ok?: boolean; images?: { url: string; category: string | null }[] }) => {
        if (!cancelled && data?.ok) setRatehawkGallery(data.images ?? []);
      })
      .catch(() => {
        if (!cancelled) setRatehawkGallery([]);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedHotel?.id, selectedHotel?.ratehawk_image_1]);

  // Children's ages from the live guest selection — the same source as the
  // adults and children counts the fetches below send — as one value those
  // effects can depend on. They used to come from the URL while the counts
  // were live, so a child added before SEARCH went out with no age and ETG was
  // sent a default of 10. Nothing is sent now until every age is set
  // (guestIssue).
  const childrenAgesKey = guestSelection.kidAges.slice(0, guestSelection.kids).join("|");
  const childrenAges = useMemo(() => {
    const ages: number[] = [];
    for (const raw of childrenAgesKey.split("|")) {
      if (raw.trim() === "") continue;
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) ages.push(Math.max(0, Math.floor(parsed)));
    }
    return ages;
  }, [childrenAgesKey]);

  // Auto-fetches the selected hotel's room list (no button — rooms should
  // just be displayed). Pre-selects the headline room (the cheapest one that
  // fits the party) once loaded.
  //
  // Debounced like the results batch (450ms). Our key allows /search/hp/ only
  // 5 times a minute site-wide (§32), and without this every form edit while a
  // hotel is open cost a request — a date range, which sets check-in and
  // check-out separately, cost two. "Loading" shows at once; only the request
  // waits, and any change inside the window restarts it.
  useEffect(() => {
    if (!selectedRatehawkHid || !fromValue || !toValue || !datesAreValid || !residencyValue || guestIssue) return;

    let cancelled = false;
    setRatehawkRooms({ status: "loading", rooms: [], headline: null });

    const rooms = Math.max(1, Number(bedroomsValue) || 1);

    const debounceTimer = window.setTimeout(() => {
      fetch("/api/ratehawk/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hid: selectedRatehawkHid,
          checkInDate: fromValue,
          checkOutDate: toValue,
          currency: activeCurrency,
          residency: residencyValue,
          adults: guestSelection.adults,
          kids: guestSelection.kids,
          childrenAges,
          rooms,
        }),
      })
        .then((res) => res.json())
        .then(
          (data: {
            ok?: boolean;
            rooms?: RatehawkGroupedRoom[];
            headline?: RatehawkHeadline;
          }) => {
            if (cancelled) return;
            if (data?.ok) {
              const loadedRooms = data.rooms ?? [];
              setRatehawkRooms({ status: "loaded", rooms: loadedRooms, headline: data.headline ?? null });
              if (data.headline) {
                setSelectedRoomKey(data.headline.roomKey);
              }
            } else {
              setRatehawkRooms({ status: "error", rooms: [], headline: null });
            }
          }
        )
        .catch(() => {
          if (!cancelled) setRatehawkRooms({ status: "error", rooms: [], headline: null });
        });
    }, HOTELPAGE_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(debounceTimer);
    };
  }, [
    selectedRatehawkHid,
    fromValue,
    toValue,
    datesAreValid,
    activeCurrency,
    residencyValue,
    guestIssue,
    roomsRefreshKey,
    guestSelection.adults,
    guestSelection.kids,
    childrenAges,
    bedroomsValue,
  ]);

  // {url, category} pairs, url unresolved ({size} template intact for
  // Ratehawk, already-concrete for Agoda) — the shared source both the
  // full-size and thumbnail-size views below derive from. While the full
  // ratehawk-images fetch is pending (or for non-Ratehawk hotels), falls
  // back to the single hero image already available synchronously from the
  // bulk fetch, so the main image renders with no loading flash.
  const selectedHotelGalleryRaw = useMemo(() => {
    if (!selectedHotel) {
      return PLACEHOLDERS.map((url) => ({ url, category: null as string | null }));
    }

    if (selectedHotel.ratehawk_image_1) {
      if (ratehawkGallery && ratehawkGallery.length > 0) return ratehawkGallery;
      return [
        {
          url: selectedHotel.ratehawk_image_1,
          category: selectedHotel.ratehawk_image_1_category ?? null,
        },
      ];
    }

    return getHotelImageSet(selectedHotel).map((url) => ({ url, category: null as string | null }));
  }, [selectedHotel, ratehawkGallery]);

  const selectedHotelGallery = useMemo(
    () =>
      selectedHotelGalleryRaw.map((image) => ({
        url: resolveRatehawkUrl(image.url, RATEHAWK_LARGE_SIZE),
        category: image.category,
      })),
    [selectedHotelGalleryRaw]
  );

  const selectedHotelThumbGallery = useMemo(
    () =>
      selectedHotelGalleryRaw.map((image) => ({
        url: resolveRatehawkUrl(image.url, RATEHAWK_THUMB_SIZE),
        category: image.category,
      })),
    [selectedHotelGalleryRaw]
  );

  const selectedHotelImages = useMemo(
    () => selectedHotelGallery.map((image) => image.url),
    [selectedHotelGallery]
  );

  const isFavorited = Boolean(
    selectedHotel && favoriteHotelIds.has(String(selectedHotel.id))
  );

  useEffect(() => {
    if (!shouldShowResults || !visibleHotels.length) {
      setRatehawkResultAvailability({});
      setRatehawkResultAvailabilityStatus("idle");
      return;
    }

    if (!fromValue || !toValue || !datesAreValid || !residencyValue || guestIssue) {
      setRatehawkResultAvailability({});
      setRatehawkResultAvailabilityStatus("idle");
      return;
    }

    // Passive hotels are excluded from the request entirely - Ratehawk cannot
    // price them for any date, so asking is pure latency (and ~17% of the
    // published inventory).
    const hotelsWithRatehawkHids = visibleHotels
      .filter((hotel) => hotel.ratehawk_status !== "passive")
      .map((hotel) => ({
        directusId: String(hotel.id),
        hid: getRatehawkHidForHotel(hotel),
      }))
      .filter((item): item is { directusId: string; hid: number } => item.hid !== null);

    if (!hotelsWithRatehawkHids.length) {
      setRatehawkResultAvailability({});
      setRatehawkResultAvailabilityStatus("loaded");
      return;
    }

    let cancelled = false;
    const rooms = Math.max(1, Number(bedroomsValue) || 1);

    /* REUSE WHAT THIS STAY ALREADY PRICED. Applying or removing a filter
       re-runs the server page, which hands down a new hotel list and new
       searchParams — and this effect used to re-search the whole list, with
       SEARCHING… on the button, for prices it already held. Now only hids not
       yet asked about for this exact stay are sent: narrowing costs no request
       at all, widening asks only for the hotels it added. A different stay, or
       prices older than RESULT_AVAILABILITY_REUSE_MS, start afresh. A failed
       batch stores nothing, so RETRY still asks again. */
    const stayKey = JSON.stringify([
      fromValue,
      toValue,
      activeCurrency,
      residencyValue,
      guestSelection.adults,
      guestSelection.kids,
      childrenAges,
      rooms,
    ]);
    let cache = resultAvailabilityCacheRef.current;
    if (
      !cache ||
      cache.stayKey !== stayKey ||
      Date.now() - cache.fetchedAt > RESULT_AVAILABILITY_REUSE_MS
    ) {
      cache = { stayKey, fetchedAt: Date.now(), headlines: new Map() };
      resultAvailabilityCacheRef.current = cache;
    }
    const stayCache = cache;

    const availabilityFromCache = () => {
      const byDirectusId: Record<string, RatehawkResultAvailability> = {};
      for (const item of hotelsWithRatehawkHids) {
        const headline = stayCache.headlines.get(item.hid);
        byDirectusId[item.directusId] = headline
          ? { status: "available", headline }
          : { status: "unavailable" };
      }
      return byDirectusId;
    };

    const missingHids = hotelsWithRatehawkHids
      .map((item) => item.hid)
      .filter((hid) => !stayCache.headlines.has(hid));

    if (!missingHids.length) {
      setRatehawkResultAvailability(availabilityFromCache());
      setRatehawkResultAvailabilityStatus("loaded");
      setAvailabilitySearchDirty(false);
      return;
    }

    // Debounced: rapid guest/bedroom stepper clicks or date changes shouldn't
    // each fire their own request - only the settled value should.
    setRatehawkResultAvailabilityStatus("loading");
    const debounceTimer = window.setTimeout(() => {
      void loadResultAvailability();
    }, 450);

    async function loadResultAvailability() {
      try {
        setRatehawkResultAvailabilityStatus("loading");

        const response = await fetch("/api/ratehawk/availability/batch", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            hids: missingHids,
            checkInDate: fromValue,
            checkOutDate: toValue,
            currency: activeCurrency,
            residency: residencyValue,
            adults: guestSelection.adults,
            kids: guestSelection.kids,
            childrenAges,
            rooms,
          }),
        });

        const json = (await response.json()) as {
          ok?: boolean;
          results?: Array<{ hid: number; headline: RatehawkHeadline }>;
        };

        if (cancelled) return;

        if (!response.ok || !json.ok) {
          setRatehawkResultAvailability({});
          setRatehawkResultAvailabilityStatus("error");
          return;
        }

        // Every hid asked is recorded, so one with no rate is not asked again.
        for (const hid of missingHids) {
          if (!stayCache.headlines.has(hid)) stayCache.headlines.set(hid, null);
        }
        for (const result of json.results ?? []) {
          const hid = Number(result.hid);
          if (!missingHids.includes(hid) || !result.headline) continue;
          stayCache.headlines.set(hid, result.headline);
        }

        setRatehawkResultAvailability(availabilityFromCache());
        setRatehawkResultAvailabilityStatus("loaded");
        setAvailabilitySearchDirty(false);
      } catch {
        if (!cancelled) {
          setRatehawkResultAvailability({});
          setRatehawkResultAvailabilityStatus("error");
        }
      }
    }

    return () => {
      cancelled = true;
      window.clearTimeout(debounceTimer);
    };
  }, [
    shouldShowResults,
    visibleHotels,
    fromValue,
    toValue,
    datesAreValid,
    activeCurrency,
    residencyValue,
    guestIssue,
    guestSelection.adults,
    guestSelection.kids,
    childrenAges,
    bedroomsValue,
    searchParams,
  ]);

  function saveCurrentHotelFlightSearch() {
    mergeHotelFlightSearch({
      q: normalizeParam(searchParams.q),
      city: normalizeParam(searchParams.city),
      state: normalizeParam(searchParams.state),
      admin_region: normalizeParam(searchParams.admin_region),
      country: normalizeParam(searchParams.country),
      region: normalizeParam(searchParams.region),
      macro_region: normalizeParam(searchParams.macro_region),
      from: fromValue,
      to: toValue,
      adults: String(guestSelection.adults),
      kids: String(guestSelection.kids),
      bedrooms: bedroomsValue,
      kid_age_1: normalizeParam(searchParams.kid_age_1),
      kid_age_2: normalizeParam(searchParams.kid_age_2),
      kid_age_3: normalizeParam(searchParams.kid_age_3),
      kid_age_4: normalizeParam(searchParams.kid_age_4),
      kid_age_5: normalizeParam(searchParams.kid_age_5),
      kid_age_6: normalizeParam(searchParams.kid_age_6),
    });
  }

  function updateFiltersOpen(nextOpen: boolean) {
    setFiltersOpen(nextOpen);

    const params = new URLSearchParams();

    for (const [k, v] of Object.entries(searchParams)) {
      if (v === undefined) continue;

      if (Array.isArray(v)) {
        for (const vv of v) params.append(k, vv);
      } else {
        params.set(k, String(v));
      }
    }

    params.set("filters_open", nextOpen ? "1" : "0");

    /* Opening or closing the filters is not a search. router.replace re-ran the
       server page — every hotel fetched again, a new searchParams, and so a new
       availability batch — for what is only a panel. The native history call
       records the state in the URL (so a reload or a shared link keeps it)
       without a server round trip. */
    const href = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    window.history.replaceState(null, "", href);
  }

  async function handleAddHotelToTrip(tripId?: string) {
    if (!selectedHotel) return;

    if (!isMemberLoggedIn) {
      setShowTripPicker(false);
      setMemberActionError(getMemberActionLoginMessage("trip"));
      return;
    }

    try {
      setMemberActionLoading("trip");
      setMemberActionMessage("");
      setMemberActionError("");

      const result = await addHotelToTripBrowser({
        tripId: tripId || selectedTripIdForAdd || null,
        hotelDirectusId: String(selectedHotel.id),
        name: selectedHotel.hotel_name ?? "Untitled hotel",
        location: locationLine(selectedHotel),
        stayLabel: fromValue && toValue ? `${formatDisplayDate(fromValue)} – ${formatDisplayDate(toValue)}` : null,
        thumbnail: selectedHotel && hasHotelPhotos(selectedHotel) ? selectedHotelImages[0] : null,
        checkIn: fromValue || null,
        checkOut: toValue || null,
        roomSelection: selectedRoomSelectionEntries,
        // The search behind the price, so Saved trips can re-run it. Null
        // when the member never filled it in - saving a hotel with no dates,
        // rooms or guests is allowed, and then there is no price either.
        rooms: bedroomsValue ? Number(bedroomsValue) : null,
        adults: hasGuestDetails ? guestSelection.adults : null,
        kids: hasGuestDetails ? guestSelection.kids : null,
        childrenAges,
        // The headline total is stored alongside the room picks so Saved
        // trips can show a price even for a hotel saved without choosing
        // rooms. Indicative only - rates are re-fetched live at booking.
        priceAmount: roomSelectionTotal > 0 ? roomSelectionTotal : selectedHotelHeadlineTotal,
        priceCurrency: roomSelectionCurrency,
      });

      if (result.status === "already_exists") {
        setMemberActionMessage("Already in this trip.");
      } else if (result.overlapWarning) {
        setMemberActionMessage("Added with overlap warning.");
      } else {
        setMemberActionMessage("Added.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";

      if (
        message.includes("auth") ||
        message.includes("login") ||
        message.includes("sign in") ||
        message.includes("unauthorized") ||
        message.includes("not authenticated")
      ) {
        setMemberActionError("Log in to add to trip.");
      } else {
        setMemberActionError("Could not add hotel to trip.");
      }
    } finally {
      setMemberActionLoading(null);
    }
  }

async function handleCreateTripAndAddHotel() {
  if (!selectedHotel) return;

  if (!isMemberLoggedIn) {
    setShowTripPicker(false);
    setMemberActionError(getMemberActionLoginMessage("trip"));
    return;
  }

  const cleanTripName = newTripName.trim();

  if (!cleanTripName) {
    setMemberActionError("Please name your trip before creating it.");
    return;
  }

  try {
    setCreatingTrip(true);
    setMemberActionMessage("");
    setMemberActionError("");

    const createdTrip = await createTripBrowser({
      name: cleanTripName,
      destination:
        [selectedHotel.city, selectedHotel.country].filter(Boolean).join(" · ") ||
        null,
      periodLabel: fromValue && toValue ? `${formatDisplayDate(fromValue)} – ${formatDisplayDate(toValue)}` : null,
    });

    setTripChoices((prev) => [...prev, createdTrip]);
    setSelectedTripIdForAdd(createdTrip.id);

    const result = await addHotelToTripBrowser({
      tripId: createdTrip.id,
      hotelDirectusId: String(selectedHotel.id),
      name: selectedHotel.hotel_name ?? "Untitled hotel",
      location: locationLine(selectedHotel),
      stayLabel: fromValue && toValue ? `${formatDisplayDate(fromValue)} – ${formatDisplayDate(toValue)}` : null,
      thumbnail: selectedHotel && hasHotelPhotos(selectedHotel) ? selectedHotelImages[0] : null,
      checkIn: fromValue || null,
      checkOut: toValue || null,
      roomSelection: selectedRoomSelectionEntries,
      rooms: bedroomsValue ? Number(bedroomsValue) : null,
      adults: hasGuestDetails ? guestSelection.adults : null,
      kids: hasGuestDetails ? guestSelection.kids : null,
      childrenAges,
      priceAmount: roomSelectionTotal > 0 ? roomSelectionTotal : selectedHotelHeadlineTotal,
      priceCurrency: roomSelectionCurrency,
    });

    setNewTripName("");
    setShowTripPicker(false);

    if (result.overlapWarning) {
      setMemberActionMessage("Created and added with overlap warning.");
    } else {
      setMemberActionMessage("Added.");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";

    if (isTripLimitError(error)) {
      setMemberActionError(TRIP_LIMIT_MESSAGE);
    } else if (
      message.includes("auth") ||
      message.includes("login") ||
      message.includes("sign in") ||
      message.includes("unauthorized") ||
      message.includes("not authenticated")
    ) {
      setMemberActionError("Log in to add to trip.");
    } else {
      setMemberActionError("Could not create trip.");
    }
  } finally {
    setCreatingTrip(false);
  }
}

  async function handleAddHotelToFavorites() {
    if (!selectedHotel) return;

    if (!isMemberLoggedIn) {
      setMemberActionError(getMemberActionLoginMessage("favorite"));
      return;
    }

    try {
      setMemberActionLoading("favorite");
      setMemberActionMessage("");
      setMemberActionError("");

      const result = await addFavoriteHotelBrowser({
        hotelDirectusId: String(selectedHotel.id),
        name: selectedHotel.hotel_name ?? "Untitled hotel",
        location: locationLine(selectedHotel),
        meta: selectedHotel.affiliation?.trim() || "",
        thumbnail: selectedHotel && hasHotelPhotos(selectedHotel) ? selectedHotelImages[0] : null,
      });

      if (result.status !== "already_exists") {
        setFavoriteHotelIds((prev) => new Set([...prev, String(selectedHotel.id)]));
        setMemberActionMessage("Added to favourites.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";

      if (
        message.includes("auth") ||
        message.includes("login") ||
        message.includes("sign in") ||
        message.includes("unauthorized") ||
        message.includes("not authenticated")
      ) {
        setMemberActionError("Log in to add favourites.");
      } else {
        setMemberActionError("Could not add to favourites.");
      }
    } finally {
      setMemberActionLoading(null);
    }
  }

  return (
    <div className="w-full">
      {/* Renders nothing. If the visitor arrives here on a bare URL after the
          concierge has found something, it writes that answer into the URL
          once so this page shows it — the page stays URL-driven either way. */}
      <AiResultsSync page="hotels" />

      <div
        className={[
          "grid gap-4",
          shouldShowFeatured
            ? "grid-cols-1"
            : "oltra-hotels-layout lg:grid-cols-[minmax(360px,0.95fr)_minmax(0,1.45fr)]",
        ].join(" ")}
      >
        {!shouldShowFeatured ? (
          <section className="flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto">
          <div className="relative z-30 oltra-glass oltra-panel !p-4 flex-none">
            <form
              action="/hotels"
              method="GET"
              className="grid gap-[14px] md:grid-cols-12 md:gap-[14px]"
              onChange={() => {
                setAvailabilitySearchDirty(true);
              }}
              onSubmit={(e) => {
                e.preventDefault();
                const params = new URLSearchParams();
                new FormData(e.currentTarget).forEach((value, key) => {
                  if (typeof value === "string" && value) params.append(key, value);
                });
                startTransition(() => {
                  router.replace(`/hotels?${params.toString()}`, { scroll: false });
                });
              }}
            >
              <HiddenPreserveParams
                searchParams={searchParams}
                excludeKeys={[
                  "q",
                  "city",
                  "state",
                  "admin_region",
                  "ids",
                  "country",
                  "region",
                  "macro_region",
                  "activities",
                  "settings",
                  "from",
                  "to",
                  "adults",
                  "kids",
                  "bedrooms",
                  "residency",
                  "filters_open",
                  "search_submitted",
                  "kid_age_1",
                  "kid_age_2",
                  "kid_age_3",
                  "kid_age_4",
                  "kid_age_5",
                  "kid_age_6",
                ]}
              />

              <input
                type="hidden"
                name="filters_open"
                value={filtersOpen ? "1" : "0"}
              />

              <input
                type="hidden"
                name="search_submitted"
                value={hasMeaningfulFilters ? "1" : simpleSearchSubmitted}
              />

              <StructuredDestinationField
                label="Destination / purpose"
                placeholder="Type first 2 letters of hotel, city, country, or purpose"
                searchParams={searchParams}
                dataset={props.suggestions}
                wrapperClassName="md:col-span-12 pt-[2px]"
                busy={isPending}
                curated={curatedDestination}
              />

              {!compactTopMode ? (
                <>
                  {(selected.awards.length > 0 || selectedPriceLabels.length > 0) ? (
                    <div className="md:col-span-12 flex flex-wrap gap-2">
                      {selected.awards.map((awardId) => {
                        const label = getAwardLabelById(awardId, featuredAwardsFilterMap);

                        return (
                          <Link
                            key={`selected-award-${awardId}`}
                            href={removeSingleValueHref(searchParams, "awards", awardId)}
                            className="inline-flex items-center gap-2 rounded-full border border-[var(--oltra-field-border)] bg-[var(--oltra-field-bg)] px-3 py-[3px] text-[12px] text-[color:var(--oltra-badge-text)] hover:bg-[var(--oltra-field-bg-strong)]"
                            prefetch={false}
                          >
                            <span>{label}</span>
                            <span className="text-[color:var(--oltra-badge-text)]">×</span>
                          </Link>
                        );
                      })}

                      {selectedPriceLabels.map((label) => (
                        <div
                          key={`selected-price-${label}`}
                          className="inline-flex items-center rounded-full border border-[var(--oltra-field-border)] bg-[var(--oltra-field-bg)] px-3 py-[3px] text-[12px] text-[color:var(--oltra-badge-text)]"
                        >
                          {label}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="md:col-span-12 grid gap-[14px] md:grid-cols-[minmax(0,1.45fr)_minmax(0,1.45fr)_minmax(0,0.85fr)_minmax(0,0.85fr)]">
                    <div ref={datesFieldRef} className="md:col-span-2 min-w-0" data-oltra-control="true">
                      <DateRangePicker
                        fromValue={fromValue}
                        toValue={toValue}
                        fromMinDate={todayIso}
                        onFromChange={(value) => {
                          setFromValue(value);
                          setAvailabilitySearchDirty(true);
                        }}
                        onToChange={(value) => {
                          setToValue(value);
                          setAvailabilitySearchDirty(true);
                        }}
                      />
                      {stayTooLong ? (
                        <div className="mt-1 text-[12px] leading-snug text-[color:var(--oltra-error-text)]" role="status">
                          {STAY_TOO_LONG_MESSAGE}
                        </div>
                      ) : null}
                    </div>

                    <div ref={guestsFieldRef} className="relative min-w-0" data-oltra-control="true">
                      <div className="oltra-label">Guests</div>
                      <GuestSelector
                        initialValue={guestSelection}
                        // Opens leftwards: the field sits third of four, and a
                        // 280px panel from its left edge ran past the frame.
                        align="right"
                        rooms={Math.max(1, Number(bedroomsValue) || 1)}
                        // Passport country is guest information, asked here
                        // rather than on the search bar. Changing it re-prices
                        // immediately: both availability effects list
                        // residencyValue in their dependencies.
                        residency={{
                          value: residencyValue,
                          onChange: (code) => {
                            setResidencyValue(code);
                            setAvailabilitySearchDirty(true);
                          },
                        }}
                        onChange={(selection) => {
                          setGuestSelection(selection);
                          setAvailabilitySearchDirty(true);
                        }}
                      />
                    </div>

                    <div className="relative min-w-0" data-oltra-control="true">
                      <div className="oltra-label">Bedrooms</div>
                      <OltraSelect
                        name="bedrooms"
                        value={bedroomsValue}
                        placeholder="#"
                        align="left"
                        onValueChange={(value) => {
                          setBedroomsValue(value);
                          setAvailabilitySearchDirty(true);
                        }}
                        options={[1, 2, 3, 4].map((n) => ({
                          value: String(n),
                          label: String(n),
                        }))}
                      />
                    </div>
                  </div>

                </>
              ) : null}

              {showNarrowFurtherMessage ? (
                <div className="md:col-span-12 text-[12px] leading-relaxed text-[color:var(--oltra-text-muted)]">
                  Narrow results further by adding region, country, city or setting.
                </div>
              ) : null}

              {!compactTopMode ? (
                /* Filters left, SEARCH right, one width. That width is the first
                   track of the field grid above (1.45fr of 4.6fr, less its three
                   14px gaps), so Filters still lines up under the date field. */
                <div className="md:col-span-12 flex flex-col gap-[14px] md:flex-row md:items-start md:justify-between">
                  <button
                    type="button"
                    onClick={() => updateFiltersOpen(!filtersOpen)}
                    aria-expanded={filtersOpen}
                    className="oltra-btn w-full md:w-[calc((100%_-_42px)*1.45/4.6)]"
                  >
                    Filters
                  </button>

                  <button
                    type="submit"
                    onClick={(e) => {
                      // aria-disabled does not block the click (or the form's
                      // implicit Enter submit, which arrives as a click here).
                      if (searchPassiveReason) {
                        e.preventDefault();
                        if (resultCountTooLarge) return;
                        const field = searchNeedsDates
                          ? datesFieldRef.current
                          : searchNeedsGuests
                            ? guestsFieldRef.current
                            : null;
                        field
                          ?.querySelector<HTMLElement>(
                            'button:not([disabled]), input:not([type="hidden"]):not([disabled])'
                          )
                          ?.focus();
                        return;
                      }
                      saveCurrentHotelFlightSearch();
                    }}
                    disabled={searchBusy}
                    aria-disabled={!searchBusy && Boolean(searchPassiveReason)}
                    data-reason={!searchBusy && searchPassiveReason ? searchPassiveReason : undefined}
                    className="oltra-btn w-full md:w-[calc((100%_-_42px)*1.45/4.6)]"
                  >
                    {searchBusy || isSubmittingSearch ? (
                      <span
                        className="inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border border-current border-t-transparent"
                        aria-hidden="true"
                      />
                    ) : null}
                    {searchBusy
                      ? "SEARCHING…"
                      : !searchPassiveReason && ratehawkResultAvailabilityStatus === "error"
                        ? "RETRY"
                        : "SEARCH"}
                  </button>
                </div>
              ) : null}

              {!compactTopMode && filtersOpen ? (
                <div className="md:col-span-12 pt-3">
                  <div className="border-t border-[var(--oltra-field-border)] py-2">
                    <button
                      type="button"
                      onClick={() => setPriceOpen((prev) => !prev)}
                      className="flex w-full items-center justify-between px-[14px] text-left"
                    >
                      <span className="text-[12px] uppercase tracking-[0.14em] text-[color:var(--oltra-text-muted)]">
                        PRICE / TOTAL STAY ({activeCurrency})
                      </span>
                      <span
                        className="flex h-4 w-4 items-center justify-center text-[color:var(--oltra-text-muted)] transition-transform duration-150"
                        style={{ transform: priceOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                      >
                        <ChevronDown />
                      </span>
                    </button>

                    {priceOpen ? (
                      <div className="mt-2">
                        <div className="oltra-popup-panel oltra-popup-panel--inline !relative !left-auto !right-auto !top-auto z-0 !p-2">
                          <div className="grid grid-cols-2 gap-2.5">
                            <input
                              name="min_price"
                              placeholder="Min"
                              className="oltra-input"
                            />
                            <input
                              name="max_price"
                              placeholder="Max"
                              className="oltra-input"
                            />
                          </div>

                          <div className="mt-2 text-[11px] text-[color:var(--oltra-text-muted)]">
                            (Illustrative for now — will connect when pricing fields exist)
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <RelDropdown
                    title="Activities"
                    paramKey="activities"
                    selectedIds={selected.activities}
                    map={tax.activities}
                    searchParams={searchParams}
                    open={activitiesOpen}
                    onToggle={() => setActivitiesOpen((prev) => !prev)}
                  />

                  <RelDropdown
                    title="Settings"
                    paramKey="settings"
                    selectedIds={selected.settings}
                    map={tax.settings}
                    searchParams={searchParams}
                    open={settingsOpen}
                    onToggle={() => setSettingsOpen((prev) => !prev)}
                  />

                  <RelDropdown
                    title="Accolades"
                    paramKey="awards"
                    selectedIds={selected.awards}
                    map={featuredAwardsFilterMap}
                    searchParams={searchParams}
                    open={awardsOpen}
                    onToggle={() => setAwardsOpen((prev) => !prev)}
                  />
                </div>
              ) : null}
            </form>
          </div>

          {shouldShowResults ? (
            /* Fills what the search panel leaves of the column, rather than a
               fixed 50vh (2026-09-15). The page is bounded to the viewport and
               never scrolls itself; with 50vh the list ran ~45px past the
               bottom of the screen, so its last cards sat below the edge while
               the wheel only moved the list inside it. The floor keeps it
               usable when the filters are open, and the column scrolls then. */
            <div className="oltra-glass oltra-panel flex min-h-[280px] flex-1 flex-col">
              <div className="flex flex-none items-baseline justify-between">
                <div className="oltra-label">Results</div>
                <div className="text-xs text-[color:var(--oltra-text-muted)]">{resultsCount} matching hotels found</div>
              </div>

              <div className="oltra-scrollbar mt-3.5 min-h-0 flex-1 space-y-3 overflow-y-auto pr-2">
                {orderedVisibleHotels.map((h) => {
                  const active = String(h.id) === selectedHotelId;
                  const img = getHotelImageSet(h)[0] ?? PLACEHOLDERS[0];
                  const hasPhoto = hasHotelPhotos(h);
                  const ratehawkCardAvailability = ratehawkResultAvailability[String(h.id)];
                  const featuredAwards = getFeaturedAwardsForHotel(h);
                  const hotelBadges = getHotelBadges(h);
                  const nameAndLocation = [h.city, h.country].filter(Boolean).join(" · ");
                  const cardAvailable =
                    ratehawkCardAvailability?.status === "available" &&
                    Boolean(ratehawkCardAvailability.headline);
                  // Passive is a stored property fact, not a live result, so it
                  // takes precedence over whatever the batch check returned.
                  const cardPassive = h.ratehawk_status === "passive";
                  const cardUnavailable =
                    !cardPassive && ratehawkCardAvailability?.status === "unavailable";

                  const selectCard = () => {
                    const id = String(h.id);
                    setSelectedHotelId(id);
                    setPinnedHotelId(id);
                  };

                  // A div, not a <button>: a passive hotel's card holds a
                  // website link, and a link inside a button is invalid HTML.
                  return (
                    <div
                      key={String(h.id)}
                      role="button"
                      tabIndex={0}
                      onClick={selectCard}
                      onKeyDown={(e) => {
                        if (e.target !== e.currentTarget) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          selectCard();
                        }
                      }}
                      className={[
                        "oltra-output w-full cursor-pointer text-left transition",
                        active
                          ? "bg-[var(--oltra-field-bg-strong)] hotel-result-card--active"
                          : "bg-[var(--oltra-field-bg)] hover:bg-[var(--oltra-field-bg-strong)]",
                        cardAvailable ? "hotel-result-card--available" : "",
                        cardUnavailable ? "hotel-result-card--unavailable" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      style={
                        active
                          ? {
                              borderColor: "rgba(255,255,255,0.38)",
                              boxShadow:
                                "0 16px 32px rgba(10,24,36,0.22), inset 0 0 0 1px rgba(255,255,255,0.18)",
                            }
                          : undefined
                      }
                    >
                      <div className="grid grid-cols-[132px_1fr] gap-3.5">
                        <div>
                          <div className="hotel-result-card__fade overflow-hidden rounded-[var(--oltra-radius-md)]">
                            {hasPhoto ? (
                              <Image src={img} alt="" width={132} height={80} className="h-20 w-full object-cover" sizes="132px" />
                            ) : (
                              <div className="oltra-photo-placeholder h-20 w-full">Photos coming soon</div>
                            )}
                          </div>

                          <div className="mt-2">
                            {cardPassive ? (
                              /* Never bookable through Ratehawk for any date -
                                 "No availability" would wrongly read as "sold
                                 out for your dates". */
                              h.www ? (
                                <a
                                  href={h.www}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  onKeyDown={(e) => e.stopPropagation()}
                                  className="oltra-btn oltra-btn--neutral oltra-btn--condensed oltra-btn--block"
                                >
                                  Check availability on website
                                </a>
                              ) : (
                                <div className="hotel-availability-note">
                                  Check availability on website
                                </div>
                              )
                            ) : ratehawkResultAvailabilityLoading ? (
                              <div className="rounded-[var(--oltra-radius-sm)] border border-[var(--oltra-field-border)] bg-[var(--oltra-field-bg)] px-2 py-1.5 text-center text-[11px] leading-tight text-[color:var(--oltra-text-muted)]">
                                Checking availability...
                              </div>
                            ) : ratehawkCardAvailability?.status === "available" && ratehawkCardAvailability.headline ? (
                              <div className="px-2 py-1.5 text-center">
                                <div className="text-[13px] font-light leading-tight tracking-wide text-[color:var(--oltra-text-primary)]">
                                  {ratehawkCardAvailability.headline.currency}{" "}
                                  {Math.round(ratehawkCardAvailability.headline.pricePerStay).toLocaleString()}
                                </div>
                                <div className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-[color:var(--oltra-text-muted)]">
                                  total stay
                                </div>
                              </div>
                            ) : cardUnavailable ? (
                              <div className="hotel-availability-pill">No availability</div>
                            ) : getRatehawkHidForHotel(h) ? (
                              <div className="rounded-[var(--oltra-radius-sm)] border border-[var(--oltra-field-border)] bg-[var(--oltra-field-bg)] px-2 py-1.5 text-center text-[11px] leading-tight text-[color:var(--oltra-text-muted)]">
                                {ratehawkResultAvailabilityStatus === "error"
                                  ? "Couldn't check availability"
                                  : stayTooLong
                                    ? `Up to ${MAX_STAY_NIGHTS} nights`
                                    : "Select dates"}
                              </div>
                            ) : (
                              <div className="rounded-[var(--oltra-radius-sm)] border border-[var(--oltra-field-border)] bg-[var(--oltra-field-bg)] px-2 py-1.5 text-center text-[11px] leading-tight text-[color:var(--oltra-text-muted)]">
                                No Ratehawk match
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="hotel-result-card__fade flex min-h-[80px] min-w-0 flex-col">
                          <div className="flex items-start gap-1.5">
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-base font-light tracking-wide text-[color:var(--oltra-text-primary)]">
                                {h.hotel_name ?? "Untitled hotel"}
                              </div>
                              <div className="mt-0.5 text-xs text-[color:var(--oltra-text-muted)]">
                                {nameAndLocation || "—"}
                              </div>
                            </div>
                            {hotelBadges.length > 0 ? (
                              <div className="flex shrink-0 flex-wrap justify-end gap-0.5" style={{ maxWidth: "62px" }}>
                                {hotelBadges.map(({ key, title, bg }) => (
                                  <span
                                    key={key}
                                    title={title}
                                    className="inline-flex items-center justify-center rounded-full text-[color:var(--oltra-text-primary)]"
                                    style={{ width: "18px", height: "18px", background: bg, fontSize: "0.46rem", fontWeight: 700, flexShrink: 0, lineHeight: 1 }}
                                  >
                                    {key}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>

                          {h.highlights ? (
                            <div className="mt-2 text-xs leading-relaxed text-[color:var(--oltra-text-muted)]">
                              {clampText(h.highlights, 170)}
                            </div>
                          ) : null}

                          <div className="mt-auto pt-2">
                            {featuredAwards.length ? (
                              <div className="truncate text-[11px] text-[color:var(--oltra-text-muted)]">
                                {featuredAwards.map((award) => award.label).join(" · ")}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </section>
        ) : null}

        <section
          className={[
            "oltra-glass oltra-panel min-w-0",
            shouldShowFeatured ? "self-start overflow-visible" : "oltra-hotels-right-pane",
          ].join(" ")}
        >
          {effectiveView === "featured" ? (
            /* Search and featured-hotel details sit side by side on one row,
               stretched to a common height, with the revolving images below.
               (This replaced a full-bleed hero with both boxes floated on top
               of it.) */
            <div className="flex flex-col gap-4">
              {/* Same 3-column track and gap as the image strip below, so the
                  search box lines up with image 1 and the detail box with
                  image 3; the middle column is deliberately left empty.
                  No min-height: the row is only as tall as the detail box's
                  three lines need, and the search box stretches to match it
                  rather than both being padded out to the images' 300px. */}
              <div className="grid items-stretch gap-3 sm:grid-cols-3">
              <div className="flex flex-col justify-center rounded-[var(--oltra-radius-lg)] border border-[var(--oltra-field-border)] bg-[var(--oltra-field-bg)] p-4">
                <form
                  action="/hotels"
                  method="GET"
                  className="grid gap-[14px]"
                  onChange={() => {
                    setAvailabilitySearchDirty(true);
                  }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const params = new URLSearchParams();
                    new FormData(e.currentTarget).forEach((value, key) => {
                      if (typeof value === "string" && value) params.append(key, value);
                    });
                    startTransition(() => {
                      router.replace(`/hotels?${params.toString()}`, { scroll: false });
                    });
                  }}
                >
                  <HiddenPreserveParams
                    searchParams={searchParams}
                    excludeKeys={[
                      "q",
                      "city",
                      "state",
                      "admin_region",
                      "ids",
                      "country",
                      "region",
                      "macro_region",
                      "activities",
                      "settings",
                      "from",
                      "to",
                      "adults",
                      "kids",
                      "bedrooms",
                      "filters_open",
                      "search_submitted",
                      "kid_age_1",
                      "kid_age_2",
                      "kid_age_3",
                      "kid_age_4",
                      "kid_age_5",
                      "kid_age_6",
                    ]}
                  />

                  <input
                    type="hidden"
                    name="filters_open"
                    value={filtersOpen ? "1" : "0"}
                  />
                  <input
                    type="hidden"
                    name="search_submitted"
                    value={hasMeaningfulFilters ? "1" : simpleSearchSubmitted}
                  />

                  <StructuredDestinationField
                    label="Destination / purpose"
                    placeholder="Type first 2 letters of hotel, city, country, or purpose"
                    searchParams={searchParams}
                    dataset={props.suggestions}
                    busy={isPending}
                    curated={curatedDestination}
                  />

                  {showNarrowFurtherMessage ? (
                    <div className="text-[12px] leading-relaxed text-[color:var(--oltra-text-muted)]">
                      Narrow results further by adding region, country, city or setting.
                    </div>
                  ) : null}
                </form>
              </div>

              {/* Third column, matching image 3's width and height. */}
              <a
                href={featuredHotel.hotel_name ? `/hotels?q=${encodeURIComponent(featuredHotel.hotel_name)}&search_submitted=1` : "/hotels"}
                className="flex cursor-pointer flex-col justify-center rounded-[var(--oltra-radius-lg)] border border-[var(--oltra-field-border)] bg-[var(--oltra-field-bg)] px-4 py-3 transition-colors hover:border-white/22 hover:bg-[var(--oltra-field-bg-strong)] sm:col-start-3"
              >
                <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--oltra-text-muted)]">
                  Featured hotel
                </div>
                <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-[1.15rem] font-light tracking-wide text-[color:var(--oltra-text-primary)]">
                    {featuredHotel.hotel_name ?? "Featured hotel"}
                  </span>
                  <span className="text-[12px] text-[color:var(--oltra-text-muted)]">
                    {[featuredHotel.city, featuredHotel.country].filter(Boolean).join(" · ") || "Curated selection"}
                  </span>
                </div>
                <div className="mt-1 text-[12px] leading-relaxed text-[color:var(--oltra-text-muted)]">
                  {getFeaturedAwardsForHotel(featuredHotel as HotelRecord)
                    .map((award) => award.label)
                    .join(" · ") || "Curated featured selection"}
                </div>
              </a>
              </div>

              <div className="relative">
                <div className="grid gap-3 sm:grid-cols-3">
                  {featuredStripImages.map((image, index) => (
                    // Plain <img> for supplier photos throughout this file: the
                    // Ratehawk/Agoda CDNs already serve the requested size, and
                    // next/image would re-optimise (and bill) each one again.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={`${featuredHotelId}-${index}`}
                      src={image}
                      alt={featuredHotel.hotel_name ?? "Featured hotel"}
                      className="h-[300px] w-full rounded-[var(--oltra-radius-lg)] object-cover"
                    />
                  ))}
                </div>

                {featuredHotels.length > 1 ? (
                  <>
                    <button
                      type="button"
                      onClick={stepFeaturedBack}
                      aria-label="Previous featured hotel"
                      className="oltra-featured-arrow left-3"
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      onClick={stepFeaturedForward}
                      aria-label="Next featured hotel"
                      className="oltra-featured-arrow right-3"
                    >
                      ›
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          ) : effectiveView === "map" ? (
            <div className="relative">
              <div className="overflow-hidden rounded-[var(--oltra-radius-lg)] border border-white/12 bg-[rgba(18,28,36,0.22)]">
                <div ref={mapRef} className="h-[760px] w-full" />

                <div className="oltra-over-image pointer-events-none absolute inset-x-0 top-4 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setViewMode("details")}
                    className="oltra-btn pointer-events-auto"
                  >
                    Switch to hotel view
                  </button>
                </div>
              </div>
            </div>
          ) : selectedHotel ? (
            <div className="relative">
              <div className="grid grid-cols-12 gap-3">
                {/* Row 1 left: hotel name + city */}
                <div className="col-span-12 min-w-0 lg:col-span-8">
                  <div className="oltra-subheader">Selected hotel</div>

                  <h2 className="mt-2 truncate text-2xl font-light tracking-wide text-[color:var(--oltra-text-primary)] md:text-3xl">
                    {selectedHotel.hotel_name ?? "Untitled hotel"}
                  </h2>

                  <div className="mt-1 text-sm text-[color:var(--oltra-text-muted)]">
                    {[selectedHotel.city, selectedHotel.country]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </div>
                </div>

                {/* Row 1 right: switch button — the full width of this
                    col-span-4 track, the same track and width as SAVE TO TRIP
                    further down. */}
                <div className="col-span-12 lg:col-span-4">
                  <button
                    type="button"
                    onClick={() => setViewMode("map")}
                    className="oltra-btn oltra-btn--block"
                  >
                    Switch to map view
                  </button>
                </div>

                {/* Row 2 left: highlights — same row as links for vertical alignment */}
                {selectedHotel.highlights?.trim() ? (
                  <div className="col-span-12 text-sm leading-relaxed text-[color:var(--oltra-text-muted)] lg:col-span-8">
                    {clampText(selectedHotel.highlights, 320)}
                  </div>
                ) : null}

                {/* Row 2 right: Website + Instagram — left-aligned, same column as thumbnails/metadata */}
                {(selectedHotel.www || selectedHotel.insta) ? (
                  <div className="col-span-12 flex gap-4 text-sm lg:col-start-9 lg:col-span-4">
                    {selectedHotel.www ? (
                      <a
                        className="underline underline-offset-4 text-[color:var(--oltra-text-primary)]"
                        href={selectedHotel.www}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Website
                      </a>
                    ) : null}
                    {selectedHotel.insta ? (
                      <a
                        className="underline underline-offset-4 text-[color:var(--oltra-text-primary)]"
                        href={selectedHotel.insta}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Instagram
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="mt-4 grid grid-cols-12 gap-3">
                <div
                  className={[
                    "col-span-12 overflow-hidden rounded-[var(--oltra-radius-lg)]",
                    selectedHotel && hasHotelPhotos(selectedHotel) ? "lg:col-span-8" : "",
                  ].join(" ")}
                >
                  {selectedHotel && hasHotelPhotos(selectedHotel) ? (
                    <button
                      type="button"
                      onClick={() => setLightboxOpen(true)}
                      className="block w-full overflow-hidden rounded-[var(--oltra-radius-lg)]"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- supplier CDN photo, see the featured strip */}
                      <img
                        src={
                          selectedHotelImages[selectedImageIndex] ??
                          selectedHotelImages[0]
                        }
                        alt=""
                        className="h-[340px] w-full object-cover"
                      />
                    </button>
                  ) : (
                    <div className="oltra-photo-placeholder h-[340px] w-full">Photos coming soon</div>
                  )}
                </div>

                {selectedHotel && hasHotelPhotos(selectedHotel) ? (
                  <div className="col-span-12 lg:col-span-4">
                    <div className="oltra-scrollbar grid h-[340px] auto-rows-min grid-cols-2 gap-2 overflow-y-auto pr-2 content-start">
                      {selectedHotelThumbGallery.map((image, index) => (
                        <button
                          key={`${image.url}-${index}`}
                          type="button"
                          onClick={() => setSelectedImageIndex(index)}
                          className={[
                            "overflow-hidden rounded-[var(--oltra-radius-md)] text-left transition",
                            selectedImageIndex === index
                              ? "bg-[var(--oltra-field-bg-strong)]"
                              : "bg-[var(--oltra-field-bg)] hover:bg-[var(--oltra-field-bg-strong)]",
                          ].join(" ")}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element -- supplier CDN photo, see the featured strip */}
                          <img
                            src={image.url}
                            alt=""
                            className="aspect-[4/3] w-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="mt-4 grid grid-cols-12 items-stretch gap-3">
                {/* col-span-8: Description + bottom-aligned action buttons */}
                <div className="col-span-12 flex flex-col gap-4 lg:col-span-8">
                  <div>
                    <div className="oltra-subheader">Description</div>
                    <div className="mt-1.5 text-sm leading-relaxed text-[color:var(--oltra-text-primary)]">
                      {selectedDescription.id === String(selectedHotel.id) &&
                      selectedDescription.text.trim() ? (() => {
                        const full = selectedDescription.text.trim();
                        const needsExpand = full.length > 520;
                        const displayText = descExpanded || !needsExpand
                          ? full
                          : clampText(full, 520);
                        const paras = displayText.split(/\n+/).filter(Boolean);
                        return (
                          <>
                            {paras.map((para, i) => (
                              <p key={i} className={i > 0 ? "mt-2.5" : ""}>
                                {para}
                                {i === paras.length - 1 && needsExpand && (
                                  <>
                                    {" "}
                                    <button
                                      type="button"
                                      onClick={() => setDescExpanded(!descExpanded)}
                                      className="text-[color:var(--oltra-text-muted)] hover:text-[color:var(--oltra-text-primary)] transition-colors"
                                    >
                                      {descExpanded ? "less" : "more"}
                                    </button>
                                  </>
                                )}
                              </p>
                            ))}
                          </>
                        );
                      })() : "—"}
                    </div>
                  </div>

                  {selectedRatehawkHid ? (
                    <div>
                      <div className="oltra-subheader">Rooms</div>
                      {ratehawkRooms.status === "loading" ? (
                        <div className="mt-2 text-sm text-[color:var(--oltra-text-muted)]">Loading room options…</div>
                      ) : ratehawkRooms.status === "error" ? (
                        <div className="mt-2 text-sm text-[color:var(--oltra-text-muted)]">Could not load room options.</div>
                      ) : ratehawkRooms.rooms.length === 0 ? (
                        <div className="mt-2 text-sm text-[color:var(--oltra-text-muted)]">
                          {fromValue && toValue && datesAreValid
                            ? "No rooms available for these dates."
                            : stayTooLong
                              ? STAY_TOO_LONG_MESSAGE
                              : "Select dates to see room options."}
                        </div>
                      ) : (
                        <>
                        {searchedRoomCount > 1 ? (
                          // One rate covers every room searched, so all of
                          // them are the same type (§32).
                          <div className="mt-1 text-[12px] text-[color:var(--oltra-text-muted)]">
                            Prices are for all {searchedRoomCount} rooms, all of one room type. To book
                            different room types, search for one room and book each separately.
                          </div>
                        ) : null}
                        <div
                          role="radiogroup"
                          aria-label="Room type"
                          className="mt-2 flex flex-col gap-2"
                        >
                          {ratehawkRooms.rooms.map((room) => {
                            const isSelected = room.roomKey === selectedRoomKey;
                            const thumb = room.images[0]
                              ? resolveRatehawkUrl(room.images[0].url, RATEHAWK_THUMB_SIZE)
                              : null;

                            // A selectable row is a control, not an action
                            // (§35A), so it keeps the card shape and marks the
                            // choice with the shared choice rim.
                            return (
                              <div
                                key={room.roomKey}
                                role="radio"
                                aria-checked={isSelected}
                                tabIndex={isSelected || (!selectedRoomKey && room === ratehawkRooms.rooms[0]) ? 0 : -1}
                                onClick={() => setSelectedRoomKey(room.roomKey)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    setSelectedRoomKey(room.roomKey);
                                  }
                                }}
                                className={`flex cursor-pointer items-center gap-3 rounded-[var(--oltra-radius-md)] border bg-[var(--oltra-field-bg)] p-2.5 ${
                                  isSelected
                                    ? "border-[var(--oltra-choice-rim-selected)]"
                                    : "border-[var(--oltra-field-border)] hover:border-[var(--oltra-choice-rim-hover)]"
                                }`}
                              >
                                <div className="h-16 w-20 shrink-0 overflow-hidden rounded-[var(--oltra-radius-sm)]">
                                  {thumb ? (
                                    // eslint-disable-next-line @next/next/no-img-element -- supplier CDN photo, see the featured strip
                                    <img
                                      src={thumb}
                                      alt=""
                                      loading="lazy"
                                      className="h-full w-full object-cover"
                                    />
                                  ) : (
                                    <div className="oltra-photo-placeholder h-full w-full text-[9px]">
                                      No photo
                                    </div>
                                  )}
                                </div>

                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-sm font-light text-[color:var(--oltra-text-primary)]">
                                    {room.roomName}
                                  </div>
                                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[color:var(--oltra-text-muted)]">
                                    <span>{formatRoomCapacity(room.capacity)}</span>
                                    {room.balcony ? <span>· Balcony</span> : null}
                                    {room.sizeSquareMeters ? (
                                      <span>· {room.sizeSquareMeters} m²</span>
                                    ) : null}
                                    <span>· {formatRoomLayout(room)}</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenRoomDetailKey(room.roomKey);
                                    }}
                                    onKeyDown={(e) => e.stopPropagation()}
                                    className="mt-1 text-[11px] text-[color:var(--oltra-text-muted)] underline underline-offset-2 hover:text-[color:var(--oltra-text-primary)]"
                                  >
                                    More details
                                  </button>
                                </div>

                                <div className="shrink-0 text-right">
                                  <div className="text-sm font-light text-[color:var(--oltra-text-primary)]">
                                    {room.currency} {Math.round(room.pricePerStay).toLocaleString()}
                                  </div>
                                  <div className="text-[10px] text-[color:var(--oltra-text-muted)]">
                                    {formatRoomTotalLabel(searchedRoomCount)}
                                  </div>
                                  {nonIncludedTaxes(room).length > 0 ? (
                                    <div className="text-[10px] text-[color:var(--oltra-text-muted)]">+ taxes at hotel</div>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        </>
                      )}

                      {openRoomDetailKey && typeof document !== "undefined"
                        ? createPortal(
                            (() => {
                              const room = ratehawkRooms.rooms.find(
                                (r) => r.roomKey === openRoomDetailKey
                              );
                              if (!room) return null;
                              return (
                                <div
                                  className="oltra-modal-scrim fixed inset-0 z-[1000] flex justify-center overflow-y-auto px-6 py-10"
                                  onClick={() => setOpenRoomDetailKey(null)}
                                >
                                  <div
                                    className="oltra-modal-panel relative h-fit w-full max-w-[720px] rounded-[var(--oltra-radius-xl)] border border-[var(--oltra-field-border)] p-6 pt-14"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => setOpenRoomDetailKey(null)}
                                      className="absolute right-4 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--oltra-field-bg-strong)] text-[color:var(--oltra-text-muted)] hover:bg-[var(--oltra-field-bg-solid)] hover:text-[color:var(--oltra-text-primary)]"
                                      aria-label="Close"
                                    >
                                      ×
                                    </button>

                                    <div className="oltra-subheader pr-10">{room.roomName}</div>

                                    {room.images.length ? (
                                      <div
                                        className={`mt-3 grid gap-2 ${
                                          room.images.length === 1
                                            ? "grid-cols-1"
                                            : room.images.length === 2
                                              ? "grid-cols-2"
                                              : "grid-cols-3"
                                        }`}
                                      >
                                        {room.images.map((img, i) => (
                                          // eslint-disable-next-line @next/next/no-img-element -- supplier CDN photo, see the featured strip
                                          <img
                                            key={i}
                                            src={resolveRatehawkUrl(img.url, RATEHAWK_LARGE_SIZE)}
                                            alt=""
                                            loading="lazy"
                                            className="aspect-[4/3] w-full rounded-[var(--oltra-radius-sm)] object-cover"
                                          />
                                        ))}
                                      </div>
                                    ) : (
                                      <div className="oltra-photo-placeholder mt-3 h-32 w-full">
                                        No photos available
                                      </div>
                                    )}

                                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-[color:var(--oltra-text-primary)]">
                                      <div>
                                        <div className="text-[12px] uppercase tracking-[0.1em] text-[color:var(--oltra-text-muted)]">
                                          Occupancy
                                        </div>
                                        <div className="mt-0.5">{formatRoomCapacity(room.capacity)}</div>
                                      </div>
                                      <div>
                                        <div className="text-[12px] uppercase tracking-[0.1em] text-[color:var(--oltra-text-muted)]">
                                          Layout
                                        </div>
                                        <div className="mt-0.5">{formatRoomLayout(room)}</div>
                                      </div>
                                      <div>
                                        <div className="text-[12px] uppercase tracking-[0.1em] text-[color:var(--oltra-text-muted)]">
                                          Meal
                                        </div>
                                        <div className="mt-0.5">{formatMeal(room)}</div>
                                      </div>
                                      <RateTerms room={room} />
                                      {room.amenities.length ? (
                                        <div className="col-span-2">
                                          <div className="text-[12px] uppercase tracking-[0.1em] text-[color:var(--oltra-text-muted)]">
                                            Amenities
                                          </div>
                                          <div className="mt-0.5">{room.amenities.join(", ")}</div>
                                        </div>
                                      ) : null}
                                    </div>

                                    <div className="mt-4 text-right text-base font-light text-[color:var(--oltra-text-primary)]">
                                      {room.currency} {Math.round(room.pricePerStay).toLocaleString()}
                                      <div className="text-[12px] text-[color:var(--oltra-text-muted)]">
                                        {formatRoomTotalLabel(searchedRoomCount)}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })(),
                            document.body
                          )
                        : null}
                    </div>
                  ) : null}

                  {/* ETG hotel policies: metapolicy_struct and metapolicy_extra_info,
                      both displayed (§32), plus check-in/out times. Hidden when
                      the hotel has none of them. */}
                  {selectedPolicies.id === String(selectedHotel.id) &&
                  selectedPolicies.policies &&
                  (selectedPolicies.policies.checkIn ||
                    selectedPolicies.policies.checkOut ||
                    selectedPolicies.policies.sections.length > 0 ||
                    selectedPolicies.policies.extraInfo.length > 0) ? (
                    <div>
                      <div className="oltra-subheader">Hotel policies</div>
                      <div className="mt-2 grid grid-cols-1 gap-3 text-[12px] leading-relaxed text-[color:var(--oltra-text-primary)] sm:grid-cols-2">
                        {selectedPolicies.policies.checkIn || selectedPolicies.policies.checkOut ? (
                          <div>
                            <div className="uppercase tracking-[0.1em] text-[color:var(--oltra-text-muted)]">
                              Check-in and check-out
                            </div>
                            {selectedPolicies.policies.checkIn ? (
                              <div className="mt-0.5">Check-in from {selectedPolicies.policies.checkIn}</div>
                            ) : null}
                            {selectedPolicies.policies.checkOut ? (
                              <div className="mt-0.5">Check-out until {selectedPolicies.policies.checkOut}</div>
                            ) : null}
                          </div>
                        ) : null}
                        {selectedPolicies.policies.sections.map((section) => (
                          <div key={section.label}>
                            <div className="uppercase tracking-[0.1em] text-[color:var(--oltra-text-muted)]">
                              {section.label}
                            </div>
                            {section.lines.map((line, i) => (
                              <div key={i} className="mt-0.5">
                                {line}
                              </div>
                            ))}
                          </div>
                        ))}
                        {selectedPolicies.policies.extraInfo.length > 0 ? (
                          <div className="sm:col-span-2">
                            <div className="uppercase tracking-[0.1em] text-[color:var(--oltra-text-muted)]">
                              From the hotel
                            </div>
                            {selectedPolicies.policies.extraInfo.map((para, i) => (
                              <p key={i} className="mt-0.5">
                                {para}
                              </p>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {/* Bottom action row inside left pane: room-selection total / booking link */}
                  <div className="mt-auto">
                    {roomSelectionTotal > 0 ? (
                      <div className="flex h-[var(--oltra-button-height)] w-full items-center justify-between rounded-[var(--oltra-radius-md)] border border-[var(--oltra-field-border)] bg-[var(--oltra-field-bg)] px-3 text-sm text-[color:var(--oltra-text-primary)]">
                        <span className="text-[12px] text-[color:var(--oltra-text-muted)]">
                          {searchedRoomCount === 1 ? "Total" : `Total for ${searchedRoomCount} rooms`}
                        </span>
                        <span className="font-light text-[color:var(--oltra-text-primary)]">
                          {roomSelectionCurrency} {Math.round(roomSelectionTotal).toLocaleString()}
                        </span>
                      </div>
                    ) : selectedHotelBookingHref ? (
                      <a
                        href={selectedHotelBookingHref}
                        target="_blank"
                        rel="noreferrer"
                        className="oltra-btn oltra-btn--block"
                      >
                        {selectedHotelBookingLabel}
                      </a>
                    ) : null}

                    {PREBOOK_ENABLED && ratehawkRooms.status === "loaded" && ratehawkRooms.rooms.length > 0 ? (
                      prebook.status === "confirmed" ? (
                        /* The redirect seam, made legible: a reviewer seeing this
                           cold should read a known, pending step, not a broken
                           flow. No supplier or partner is named. */
                        <div
                          className="mt-2 rounded-[var(--oltra-radius-md)] border border-[var(--oltra-field-border)] bg-[var(--oltra-field-bg)] p-3 text-sm text-[color:var(--oltra-text-primary)]"
                          role="status"
                        >
                          <div className="text-[12px] uppercase tracking-[0.1em] text-[color:var(--oltra-text-muted)]">
                            Rate confirmed
                          </div>
                          <div className="mt-1">{prebook.rate.roomName}</div>
                          <div className="mt-0.5 text-[12px] text-[color:var(--oltra-text-muted)]">
                            {formatMeal(prebook.rate)} · {formatFreeCancellation(prebook.rate.freeCancellationBefore)}
                          </div>
                          <div className="mt-1 font-light">
                            {prebook.rate.currency} {Math.round(prebook.rate.pricePerStay).toLocaleString()}{" "}
                            <span className="text-[12px] text-[color:var(--oltra-text-muted)]">
                              {formatRoomTotalLabel(searchedRoomCount)}
                            </span>
                          </div>
                          <p className="mt-2 text-[12px] leading-relaxed text-[color:var(--oltra-text-muted)]">
                            Your rate is confirmed. Checkout is being configured and is not live yet.
                            Nothing has been booked or charged.
                          </p>
                          <button
                            type="button"
                            className="oltra-btn oltra-btn--block mt-2"
                            aria-disabled="true"
                            data-reason="Checkout is not live yet"
                          >
                            Continue
                          </button>
                          <div className="mt-1 text-[12px] text-[color:var(--oltra-text-muted)]">
                            Checkout is not live yet
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2">
                          <button
                            type="button"
                            className="oltra-btn oltra-btn--block"
                            onClick={() => {
                              // aria-disabled does not block the click.
                              if (!selectedRoom) return;
                              void handleContinueToCheckout();
                            }}
                            disabled={prebook.status === "checking"}
                            aria-disabled={!selectedRoom ? "true" : undefined}
                            data-reason={!selectedRoom ? "Choose a room to continue" : undefined}
                          >
                            {prebook.status === "checking" ? (
                              <span
                                className="inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border border-current border-t-transparent"
                                aria-hidden="true"
                              />
                            ) : null}
                            {prebook.status === "checking" ? "Checking rate…" : "Continue"}
                          </button>
                          {!selectedRoom ? (
                            <div className="mt-1 text-[12px] text-[color:var(--oltra-text-muted)]">
                              Choose a room to continue.
                            </div>
                          ) : null}
                          {prebook.status === "failed" ? (
                            <div className="mt-1 text-[12px] text-[color:var(--oltra-error-text)]" role="status">
                              {PREBOOK_FAILURE_MESSAGE[prebook.reason]}
                            </div>
                          ) : null}
                        </div>
                      )
                    ) : null}

                    {prebook.status === "changed" && typeof document !== "undefined"
                      ? createPortal(
                          /* Any change is shown before the guest continues —
                             up or down, price or terms (§32). Closing the sheet
                             is "Back to rooms": nothing is accepted by default. */
                          <div
                            className="oltra-modal-scrim fixed inset-0 z-[1000] flex justify-center overflow-y-auto px-6 py-10"
                            onClick={() => setPrebook({ status: "idle" })}
                          >
                            <div
                              className="oltra-modal-panel relative h-fit w-full max-w-[620px] rounded-[var(--oltra-radius-xl)] border border-[var(--oltra-field-border)] p-6"
                              onClick={(e) => e.stopPropagation()}
                              role="dialog"
                              aria-modal="true"
                              aria-labelledby="prebook-change-title"
                            >
                              <div id="prebook-change-title" className="oltra-subheader">
                                This rate has changed
                              </div>
                              <p className="mt-2 text-sm text-[color:var(--oltra-text-muted)]">
                                The hotel updated this rate since your search. Please review it before you continue.
                              </p>

                              <div className="mt-3 text-sm text-[color:var(--oltra-text-primary)]">
                                {prebook.rate.roomName}
                              </div>
                              <ul className="mt-2 flex flex-col gap-1 text-sm text-[color:var(--oltra-text-primary)]">
                                {prebook.changes.map((change, i) => (
                                  <li key={i}>{describeRateChange(change)}</li>
                                ))}
                              </ul>

                              <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-[color:var(--oltra-text-primary)]">
                                <div>
                                  <div className="text-[12px] uppercase tracking-[0.1em] text-[color:var(--oltra-text-muted)]">
                                    Meal
                                  </div>
                                  <div className="mt-0.5">{formatMeal(prebook.rate)}</div>
                                </div>
                                <div className="text-right">
                                  <div className="text-[12px] uppercase tracking-[0.1em] text-[color:var(--oltra-text-muted)]">
                                    New total
                                  </div>
                                  <div className="mt-0.5">
                                    {prebook.rate.currency} {Math.round(prebook.rate.pricePerStay).toLocaleString()}
                                  </div>
                                  <div className="text-[12px] text-[color:var(--oltra-text-muted)]">
                                    {formatRoomTotalLabel(searchedRoomCount)}
                                  </div>
                                </div>
                                <RateTerms room={prebook.rate} />
                              </div>

                              <div className="oltra-btn-pair mt-5">
                                <button
                                  type="button"
                                  className="oltra-btn"
                                  onClick={() => setPrebook({ status: "idle" })}
                                >
                                  Back to rooms
                                </button>
                                <button type="button" className="oltra-btn" onClick={acceptChangedRate}>
                                  Continue at this price
                                </button>
                              </div>
                            </div>
                          </div>,
                          document.body
                        )
                      : null}

                    {ratehawkRooms.status === "error" ? (
                      <div className="mt-2 text-[12px] text-[color:var(--oltra-text-muted)]">
                        Could not load room availability.
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* col-span-4: Metadata aligned with thumbnail column */}
                <div className="col-span-12 lg:col-span-4 space-y-4">
                  <div>
                    <div className="oltra-subheader">Setting</div>
                    <div className="mt-1.5 text-sm leading-relaxed text-[color:var(--oltra-text-primary)]">
                      {selectedHotelSettings.length
                        ? selectedHotelSettings.slice(0, 8).join(" · ")
                        : "—"}
                    </div>
                  </div>

                  <div>
                    <div className="oltra-subheader">Style</div>
                    <div className="mt-1.5 text-sm leading-relaxed text-[color:var(--oltra-text-primary)]">
                      {selectedHotelStyles.length
                        ? selectedHotelStyles.slice(0, 8).join(" · ")
                        : "—"}
                    </div>
                  </div>

                  <div>
                    <div className="oltra-subheader">Activities</div>
                    <div className="mt-1.5 text-sm leading-relaxed text-[color:var(--oltra-text-primary)]">
                      {selectedHotelActivities.length
                        ? selectedHotelActivities.slice(0, 10).join(" · ")
                        : "—"}
                    </div>
                  </div>

                  <div>
                    <div className="oltra-subheader">Accolades</div>
                    <div className="mt-1.5 text-sm leading-relaxed text-[color:var(--oltra-text-primary)]">
                      {selectedHotelAwards.length
                        ? selectedHotelAwards.slice(0, 8).join(" · ")
                        : "—"}
                    </div>
                  </div>

                  <div>
                    <div className="oltra-subheader">Brand</div>
                    <div className="mt-1.5 text-sm leading-relaxed text-[color:var(--oltra-text-primary)]">
                      {selectedHotel.affiliation?.trim() || "—"}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <div ref={tripPickerRef} className="relative">
                      {showTripPicker && (
                        <div
                          className="oltra-popup-panel oltra-popup-panel--bounded absolute left-0 right-0 z-50 mt-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="oltra-subheader">Select trip</div>

                          <div className="mt-2 flex flex-col gap-2">
                            {tripChoices.length ? (
                              tripChoices.map((trip) => (
                                <button
                                  key={trip.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedTripIdForAdd(trip.id);
                                    setShowTripPicker(false);
                                    void handleAddHotelToTrip(trip.id);
                                  }}
                                  className="oltra-dropdown-item"
                                >
                                  {trip.label}
                                </button>
                              ))
                            ) : (
                              <div className="text-[12px] text-[color:var(--oltra-text-muted)]">
                                No trips available.
                              </div>
                            )}

                            <div className="mt-3 border-t border-[var(--oltra-field-border)] pt-3">
                              <div className="oltra-subheader">Create new trip</div>

                              <div className="mt-2 flex flex-col gap-2">
                                <input
                                  type="text"
                                  value={newTripName}
                                  maxLength={MAX_TRIP_NAME_CHARS}
                                  onChange={(e) => {
                                    setNewTripName(e.target.value);
                                    setMemberActionError("");
                                  }}
                                  placeholder="Trip name"
                                  className="oltra-input"
                                  disabled={tripLimitReached}
                                />

                                {/* Stays clickable when blocked so it can say
                                    why - see getCreateTripBlockedReason. */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (createTripBlockedReason) {
                                      setTripPickerNotice(createTripBlockedReason);
                                      return;
                                    }
                                    setTripPickerNotice("");
                                    handleCreateTripAndAddHotel();
                                  }}
                                  disabled={creatingTrip}
                                  aria-disabled={Boolean(createTripBlockedReason)}
                                  data-reason={createTripBlockedReason ?? undefined}
                                  className="oltra-btn oltra-btn--condensed oltra-btn--block"
                                >
                                  {creatingTrip ? "Creating..." : "Create new trip"}
                                </button>

                                {tripPickerNotice ? (
                                  <div className="text-[12px] leading-snug text-[color:var(--oltra-error-text)]">
                                    {tripPickerNotice}
                                  </div>
                                ) : null}

                                {tripLimitReached ? (
                                  <div className="text-[12px] leading-snug text-[color:var(--oltra-text-muted)]">
                                    {TRIP_LIMIT_MESSAGE}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setMemberActionMessage("");
                          setMemberActionError("");

                          if (!isMemberLoggedIn) {
                            setShowTripPicker(false);
                            setMemberActionError(
                              getMemberActionLoginMessage("trip")
                            );
                            return;
                          }

                          setShowTripPicker((prev) => !prev);
                        }}
                        className="oltra-btn oltra-btn--block"
                        aria-disabled={!isMemberLoggedIn}
                        data-reason={isMemberLoggedIn ? undefined : "Log in to save to a trip"}
                      >
                        SAVE TO TRIP
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        // Passive when already favourited: nothing to do.
                        if (isMemberLoggedIn && isFavorited) return;

                        setMemberActionMessage("");
                        setMemberActionError("");

                        if (!isMemberLoggedIn) {
                          setMemberActionError(
                            getMemberActionLoginMessage("favorite")
                          );
                          return;
                        }

                        void handleAddHotelToFavorites();
                      }}
                      disabled={memberActionLoading !== null}
                      className="oltra-btn oltra-btn--block"
                      aria-disabled={
                        memberActionLoading === null && (!isMemberLoggedIn || isFavorited)
                      }
                      data-reason={
                        memberActionLoading !== null
                          ? undefined
                          : !isMemberLoggedIn
                            ? "Log in to add favourites"
                            : isFavorited
                              ? "Already in favourites"
                              : undefined
                      }
                    >
                      {memberActionLoading === "favorite"
                        ? "ADDING..."
                        : isFavorited
                          ? "ALREADY IN FAVOURITES"
                          : "ADD TO FAVOURITES"}
                    </button>

                    {(memberActionError || memberActionMessage) ? (
                      <div className="text-[12px] text-[color:var(--oltra-text-muted)]">
                        {memberActionError || memberActionMessage}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              {lightboxOpen && typeof document !== "undefined"
                ? createPortal(
                    <div
                      className="oltra-modal-scrim fixed inset-0 z-[1000] flex justify-center px-6"
                      onClick={() => setLightboxOpen(false)}
                    >
                      <div
                        className="oltra-modal-panel relative mt-[110px] h-fit w-full max-w-[1100px] rounded-[var(--oltra-radius-xl)] border border-[var(--oltra-field-border)] p-5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => setLightboxOpen(false)}
                          className="absolute right-4 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--oltra-field-bg-strong)] text-[color:var(--oltra-text-muted)] hover:bg-[var(--oltra-field-bg-solid)] hover:text-[color:var(--oltra-text-primary)]"
                          aria-label="Close"
                        >
                          ×
                        </button>

                        <div className="flex items-center gap-4">
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedImageIndex((prev) =>
                                prev === 0
                                  ? selectedHotelImages.length - 1
                                  : prev - 1
                              )
                            }
                            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--oltra-field-bg-strong)] text-[color:var(--oltra-text-muted)] hover:bg-[var(--oltra-field-bg-solid)] hover:text-[color:var(--oltra-text-primary)]"
                            aria-label="Previous image"
                          >
                            ‹
                          </button>

                          <div className="flex h-[min(72vh,720px)] min-w-0 flex-1 items-center justify-center overflow-hidden">
                            {/* eslint-disable-next-line @next/next/no-img-element -- supplier CDN photo at its own intrinsic size (object-contain) */}
                            <img
                              src={
                                selectedHotelImages[selectedImageIndex] ??
                                selectedHotelImages[0]
                              }
                              alt=""
                              className="max-h-full max-w-full object-contain"
                            />
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              setSelectedImageIndex((prev) =>
                                prev === selectedHotelImages.length - 1
                                  ? 0
                                  : prev + 1
                              )
                            }
                            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--oltra-field-bg-strong)] text-[color:var(--oltra-text-muted)] hover:bg-[var(--oltra-field-bg-solid)] hover:text-[color:var(--oltra-text-primary)]"
                            aria-label="Next image"
                          >
                            ›
                          </button>
                        </div>
                      </div>
                    </div>,
                    document.body
                  )
                : null}
            </div>
          ) : (
            <div className="p-10 text-[color:var(--oltra-text-muted)]">Select a hotel to view details.</div>
          )}
        </section>
      </div>
    </div>
  );
}