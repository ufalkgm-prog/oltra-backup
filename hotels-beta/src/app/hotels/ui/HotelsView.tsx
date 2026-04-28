"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import GuestSelector from "@/components/site/GuestSelector";
import OltraSelect from "@/components/site/OltraSelect";
import {
  buildBookingLink,
  type BookingSearchParams,
} from "@/lib/hotels/buildBookingLink";
import StructuredDestinationField from "@/components/site/StructuredDestinationField";
import {
  normalizeParam,
  readGuestSelection,
  type GuestSelection,
} from "@/lib/guests";
import type { HotelSuggestionDataset } from "@/lib/hotelSearchSuggestions";
import {
  addFavoriteHotelBrowser,
  addHotelToTripBrowser,
  createTripBrowser,
  fetchTripChoicesBrowser,
  getMemberActionAccessBrowser,
} from "@/lib/members/db";
import type { HotelRecord } from "@/lib/directus";
import {
  getMemberActionButtonClass,
  getMemberActionLoginMessage,
} from "@/lib/members/memberActionUi";

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
  awards: Map<string, string>;
  settings: Map<string, string>;
  styles: Map<string, string>;
};

type ViewMode = "details" | "map" | "featured";

const CURRENCY_STORAGE_KEY = "oltra_currency";
const MAP_FALLBACK_CENTER: [number, number] = [103.8198, 1.3521];

const PLACEHOLDERS = [
  "/images/hotel-placeholder-1.jpg",
  "/images/hotel-placeholder-2.jpg",
  "/images/hotel-placeholder-3.jpg",
  "/images/hotel-placeholder-4.jpg",
];

const FEATURED_AWARDS = [
  {
    code: "forbes5",
    id: "cb4f80af-963d-4f09-a8aa-213718e399fb",
    label: "Forbes 5 Star (2026)",
  },
  {
    code: "michelin3keys",
    id: "fd18110a-9764-4c20-90f4-fd149d890ead",
    label: "Michelin 3 Keys (2026)",
  },
  {
    code: "best50",
    id: "74a666bf-f7fb-4fff-b550-52eccfa98c4b",
    label: "The World's 50 Best (2025)",
  },
  {
    code: "cn",
    id: "902c14cc-50a7-4be9-a4ee-b582afb9112e",
    label: "Condé Nast Gold List (2025)",
  },
  {
    code: "tl100",
    id: "f8ac8e9c-397e-4e44-ba71-b1f9224e7c3f",
    label: "T+L 100 (2025)",
  },
  {
    code: "telegraph",
    id: "d292cfb3-a88f-44dd-b052-2980cfd3bac8",
    label: "The Telegraph Top 50 (2024)",
  },
  {
    code: "aaa",
    id: "32f0e878-e188-4ed1-98f8-6b22914f8f22",
    label: "AAA Five Diamond Award (2025)",
  },
] as const;

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
  const selected = useMemo(() => new Set(props.selectedIds), [props.selectedIds]);

  useEffect(() => {
    function handlePointerOver(event: PointerEvent) {
      if (!props.open) return;

      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (rootRef.current?.contains(target)) return;

      const hoveredInteractive = target.closest(
        'input, button, select, textarea, a, [role="button"], [data-oltra-control="true"]'
      );

      if (hoveredInteractive) props.onToggle();
    }

    document.addEventListener("pointerover", handlePointerOver);
    return () => {
      document.removeEventListener("pointerover", handlePointerOver);
    };
  }, [props.open, props.onToggle]);

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
    <div ref={rootRef} className="border-t border-white/10 py-2">
      <button
        type="button"
        onClick={props.onToggle}
        className="flex w-full items-center justify-between px-[14px] text-left"
      >
        <span className="text-[12px] uppercase tracking-[0.14em] text-white/70">
          {props.title}
        </span>
        <span
          className="flex h-4 w-4 items-center justify-center text-white/55 transition-transform duration-150"
          style={{ transform: props.open ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          <ChevronDown />
        </span>
      </button>

      {props.open ? (
        <div className="mt-2">
          <div className="oltra-popup-panel oltra-scrollbar !relative !left-auto !right-auto !top-auto z-0 !p-2">
            <div className="oltra-dropdown-list max-h-[220px]">
              {options.map((opt) => {
                const next = opt.active
                  ? Array.from(selected).filter((x) => x !== opt.id)
                  : Array.from(new Set([...selected, opt.id]));

                return (
                  <Link
                    key={`${props.paramKey}-${opt.id}`}
                    href={buildHrefWithParam(
                      props.searchParams,
                      props.paramKey,
                      next,
                      { filters_open: "1" }
                    )}
                    className={[
                      "oltra-dropdown-item flex items-center gap-2",
                      opt.active ? "bg-white/10 text-white" : "",
                    ].join(" ")}
                    prefetch={false}
                  >
                    <span className="w-4 shrink-0 text-white/72">
                      {opt.active ? "✓" : ""}
                    </span>
                    <span>{opt.label}</span>
                  </Link>
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

function relationIds(items: unknown[] | null | undefined, key: string): string[] {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const rel = (item as Record<string, unknown>)[key];
      if (!rel || typeof rel !== "object") return null;
      const id = (rel as Record<string, unknown>).id;
      return id == null ? null : String(id);
    })
    .filter((value): value is string => Boolean(value));
}

function relationLabels(
  items: unknown[] | null | undefined,
  key: string,
  taxMap: Map<string, string>
): string[] {
  return relationIds(items, key)
    .map((id) => taxMap.get(id) ?? id)
    .filter(Boolean);
}

function getFeaturedAwardsForHotel(hotel: HotelRecord) {
  const hotelAwardIds = new Set(relationIds(hotel.awards, "awards_id"));
  return FEATURED_AWARDS.filter((award) => hotelAwardIds.has(award.id));
}

function getTotalPoints(hotel: HotelRecord): number {
  const extPoints = Number(hotel.ext_points ?? 0);
  const editorRank = Number(hotel.editor_rank_13 ?? 0);

  const safeExtPoints = Number.isFinite(extPoints) ? extPoints : 0;
  const safeEditorRank = Number.isFinite(editorRank) ? editorRank : 0;

  return safeExtPoints + safeEditorRank * 3;
}

function getFeaturedAwardsFilterMap(): Map<string, string> {
  return new Map(FEATURED_AWARDS.map((award) => [award.id, award.label]));
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

function normalizeAgodaImage(url: string | null | undefined): string | null {
  if (!url) return null;

  try {
    const u = new URL(url);

    // remove ALL query params (Agoda uses them for resizing/compression)
    u.search = "";

    // force https
    u.protocol = "https:";

    return u.toString();
  } catch {
    return url;
  }
}

function getHotelImageSet(hotel: HotelRecord): string[] {
  const agodaImages = [
    hotel.agoda_photo1,
    hotel.agoda_photo2,
    hotel.agoda_photo3,
    hotel.agoda_photo4,
    hotel.agoda_photo5,
  ]
    .map((value) => normalizeAgodaImage(value))
    .filter((value): value is string => Boolean(value))
    .filter((value, index, array) => array.indexOf(value) === index);

  if (agodaImages.length > 0) {
    return agodaImages;
  }

  return PLACEHOLDERS;
}

function formHasMeaningfulSearchInput(form: HTMLFormElement): boolean {
  const data = new FormData(form);

  const keys = [
    "q",
    "city",
    "country",
    "region",
    "local_area",
    "affiliation",
    "activities",
    "awards",
    "settings",
    "styles",
  ];

  return keys.some((key) => {
    const value = data.get(key);
    return typeof value === "string" && value.trim() !== "";
  });
}

function setParamOrDelete(params: URLSearchParams, key: string, value: string) {
  if (value.trim()) params.set(key, value);
  else params.delete(key);
}

function accoladeTier(hotel: HotelRecord): "gold" | "silver" | null {
  const totalPoints = getTotalPoints(hotel);
  if (totalPoints > 25) return "gold";
  if (totalPoints >= 10) return "silver";
  return null;
}

function AccoladeBadge({ hotel }: { hotel: HotelRecord }) {
  const tier = accoladeTier(hotel);
  if (!tier) return null;

  const totalPoints = getTotalPoints(hotel);

  return (
    <div
      className={[
        "oltra-status-badge",
        tier === "gold" ? "oltra-status-badge--gold" : "oltra-status-badge--silver",
      ].join(" ")}
    >
      {tier === "gold"
        ? `Top Accolades ${totalPoints}`
        : `Highly Accredited ${totalPoints}`}
    </div>
  );
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
    region: string[];
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
        selected.region.length ||
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

  const hasPendingSearchInput = Boolean(
    normalizeParam(searchParams.q) ||
      normalizeParam(searchParams.city) ||
      normalizeParam(searchParams.country) ||
      normalizeParam(searchParams.region) ||
      normalizeParam(searchParams.local_area) ||
      normalizeParam(searchParams.affiliation) ||
      normalizeParam(searchParams.activities) ||
      normalizeParam(searchParams.awards) ||
      normalizeParam(searchParams.settings) ||
      normalizeParam(searchParams.styles)
  );

  const hasCountrySelected = selected.country.length > 0;
  const shouldShowResults =
    hasMeaningfulFilters &&
    (hasDirectHotelSelection || hasCountrySelected || hotels.length <= 50);

  const visibleHotels = shouldShowResults ? hotels : [];
  const shouldShowFeatured = !shouldShowResults;

  const showNarrowFurtherMessage =
    hasMeaningfulFilters &&
    !hasDirectHotelSelection &&
    !hasCountrySelected &&
    hotels.length > 50;

  const router = useRouter();
  const pathname = usePathname();
  const tripPickerRef = useRef<HTMLDivElement | null>(null);
  const fromRef = useRef<HTMLInputElement | null>(null);
  const toRef = useRef<HTMLInputElement | null>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
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

  const [tripChoices, setTripChoices] = useState<
    Array<{ id: string; name: string; label: string }>
  >([]);
  const [selectedTripIdForAdd, setSelectedTripIdForAdd] = useState("");
  const [showTripPicker, setShowTripPicker] = useState(false);
  const [newTripName, setNewTripName] = useState("");
  const [creatingTrip, setCreatingTrip] = useState(false);

  const [fromValue, setFromValue] = useState(normalizeParam(searchParams.from));
  const [toValue, setToValue] = useState(normalizeParam(searchParams.to));
  const [guestSelection, setGuestSelection] = useState<GuestSelection>(
    readGuestSelection(searchParams)
  );

  const todayIso = new Date().toISOString().slice(0, 10);

  const minToIso = fromValue
    ? new Date(new Date(fromValue).getTime() + 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10)
    : new Date(Date.now() + 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

  const [bedroomsValue, setBedroomsValue] = useState(
    normalizeParam(searchParams.bedrooms)
  );

  const fromDate = fromValue ? new Date(fromValue) : null;
  const toDate = toValue ? new Date(toValue) : null;

  const stayLengthMs =
    fromDate && toDate ? toDate.getTime() - fromDate.getTime() : 0;

  const maxStayLengthMs = 42 * 24 * 60 * 60 * 1000;

  const hasGuestDetails = guestSelection.adults > 0;

  const hasRequiredStayDetails =
    Boolean(fromValue) &&
    Boolean(toValue) &&
    hasGuestDetails &&
    Boolean(bedroomsValue);

  const datesAreValid =
    Boolean(fromDate) &&
    Boolean(toDate) &&
    stayLengthMs > 0 &&
    stayLengthMs <= maxStayLengthMs;

  const resultCountTooLarge =
    hasMeaningfulFilters &&
    !hasDirectHotelSelection &&
    !hasCountrySelected &&
    hotels.length > 50;

  const searchDisabledReason = resultCountTooLarge
    ? "Please limit no of results"
    : !hasRequiredStayDetails || !datesAreValid
      ? "Please select dates and guest details"
      : "";

  const searchIsActive = searchDisabledReason === "";

  function openDatePicker(ref: React.RefObject<HTMLInputElement | null>) {
    ref.current?.focus();
    ref.current?.showPicker?.();
  }

  const [selectedHotelId, setSelectedHotelId] = useState<string | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("featured");

  const [hasPendingSearchInputLocal, setHasPendingSearchInputLocal] = useState(
    hasPendingSearchInput
  );
  const [isSubmittingSearch, setIsSubmittingSearch] = useState(false);
  const [simpleSearchSubmitted, setSimpleSearchSubmitted] = useState("0");

  const compactTopMode = shouldShowFeatured;
  const effectiveView: ViewMode = shouldShowFeatured ? "featured" : viewMode;

  useEffect(() => {
    setIsSubmittingSearch(false);
    setHasPendingSearchInputLocal(hasPendingSearchInput);
    setSimpleSearchSubmitted("0");
  }, [searchParams, hasPendingSearchInput]);

  useEffect(() => {
    setFiltersOpen(selected.filters_open === "1");
  }, [selected.filters_open]);

  useEffect(() => {
    setFromValue(normalizeParam(searchParams.from));
    setToValue(normalizeParam(searchParams.to));
    setGuestSelection(readGuestSelection(searchParams));
    setBedroomsValue(normalizeParam(searchParams.bedrooms));
  }, [searchParams]);

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
    if (!mapRef.current || mapInstanceRef.current || effectiveView !== "map") {
      return;
    }

    const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
    if (!key) {
      console.error("Missing NEXT_PUBLIC_MAPTILER_KEY");
      return;
    }

    const map = new maplibregl.Map({
      container: mapRef.current,
      style: `https://api.maptiler.com/maps/streets-v4/style.json?key=${key}`,
      center: MAP_FALLBACK_CENTER,
      zoom: 11,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("load", () => {
      map.resize();
      window.setTimeout(() => map.resize(), 100);
      window.setTimeout(() => map.resize(), 350);
    });

    mapInstanceRef.current = map;

    const onWindowResize = () => {
      map.resize();
    };

    window.addEventListener("resize", onWindowResize);

    if (typeof ResizeObserver !== "undefined" && mapRef.current) {
      const observer = new ResizeObserver(() => {
        map.resize();
      });
      observer.observe(mapRef.current);
      resizeObserverRef.current = observer;
    }

    return () => {
      window.removeEventListener("resize", onWindowResize);

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

      try {
        map.remove();
      } catch {}

      mapInstanceRef.current = null;
    };
  }, [effectiveView]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || effectiveView !== "map") return;

    markersRef.current.forEach((marker) => {
      try {
        marker.remove();
      } catch {}
    });
    markersRef.current = [];

    const bounds = new maplibregl.LngLatBounds();
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

      const inner = document.createElement("span");
      inner.className = "hotel-marker__inner";
      inner.textContent = "✦";
      el.appendChild(inner);

      const popupImage = getHotelImageSet(hotel)[0] ?? PLACEHOLDERS[0];

      const popupRoot = document.createElement("div");
      popupRoot.className = "oltra-glass oltra-output hotel-map-popup";
      popupRoot.style.minWidth = "260px";

      const imageWrap = document.createElement("div");
      imageWrap.style.marginBottom = "12px";
      imageWrap.style.overflow = "hidden";
      imageWrap.style.borderRadius = "12px";

      const imageEl = document.createElement("img");
      imageEl.src = popupImage;
      imageEl.alt = "";
      imageEl.style.display = "block";
      imageEl.style.width = "100%";
      imageEl.style.height = "120px";
      imageEl.style.objectFit = "cover";

      imageWrap.appendChild(imageEl);
      popupRoot.appendChild(imageWrap);

      const titleEl = document.createElement("div");
      titleEl.className = "hotel-map-popup__title";
      titleEl.textContent = hotel.hotel_name ?? "Untitled hotel";
      popupRoot.appendChild(titleEl);

      const metaEl = document.createElement("div");
      metaEl.className = "hotel-map-popup__meta";
      metaEl.textContent = locationLine(hotel) || "—";
      popupRoot.appendChild(metaEl);

      if (hotel.highlights?.trim()) {
        const descEl = document.createElement("div");
        descEl.className = "hotel-map-popup__desc";
        descEl.textContent = clampText(hotel.highlights, 120);
        popupRoot.appendChild(descEl);
      }

      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        closeOnMove: false,
        offset: 14,
      }).setDOMContent(popupRoot);

      const marker = new maplibregl.Marker({ element: el })
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
        setSelectedHotelId(String(hotel.id));
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
  }, [effectiveView, visibleHotels, selectedHotelId]);

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

    return [...hotels]
      .sort((a, b) => getTotalPoints(b) - getTotalPoints(a))
      .filter((hotel) => {
        const images = getHotelImageSet(hotel);
        return images.length > 0;
      })
      .slice(0, 12);
  }, [hotels]);

  useEffect(() => {
    if (effectiveView !== "featured") return;
    if (featuredHotels.length <= 1) return;

    const timer = window.setInterval(() => {
      setSelectedImageIndex((prev) => (prev + 1) % featuredHotels.length);
    }, 5000);

    return () => window.clearInterval(timer);
  }, [effectiveView, featuredHotels.length]);

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
      editor_rank_13: 0,
    };

  const featuredHeroImage =
    getHotelImageSet(featuredHotel as HotelRecord)[0] ?? PLACEHOLDERS[0];

  const selectedPriceLabels = useMemo(
    () => getPriceSummary(searchParams, activeCurrency),
    [searchParams, activeCurrency]
  );

  const resultsCount = visibleHotels.length;

  const selectedHotelSettings = useMemo(
    () => relationLabels(selectedHotel?.settings, "settings_id", tax.settings),
    [selectedHotel, tax.settings]
  );

  const selectedHotelActivities = useMemo(
    () => relationLabels(selectedHotel?.activities, "activities_id", tax.activities),
    [selectedHotel, tax.activities]
  );

  const selectedHotelAwards = useMemo(
    () =>
      selectedHotel
        ? getFeaturedAwardsForHotel(selectedHotel).map((award) => award.label)
        : [],
    [selectedHotel]
  );

  const selectedHotelStyles = useMemo(
    () => relationLabels(selectedHotel?.styles, "styles_id", tax.styles),
    [selectedHotel, tax.styles]
  );

  const selectedHotelBookingHref = useMemo(
    () => (selectedHotel ? buildBookingLink(selectedHotel, bookingSearchParams) : null),
    [selectedHotel, bookingSearchParams]
  );

  const selectedHotelBookingLabel = useMemo(
    () => selectedHotel?.booking_label?.trim() || "BOOK",
    [selectedHotel]
  );

  const selectedHotelImages = useMemo(
    () => (selectedHotel ? getHotelImageSet(selectedHotel) : PLACEHOLDERS),
    [selectedHotel]
  );

    function replaceSearchParams(
    updates: Record<string, string>,
    extraDeletes: string[] = []
  ) {
    const params = new URLSearchParams();

    for (const [k, v] of Object.entries(searchParams)) {
      if (v === undefined) continue;

      if (Array.isArray(v)) {
        for (const vv of v) params.append(k, vv);
      } else {
        params.set(k, String(v));
      }
    }

    for (const key of extraDeletes) {
      params.delete(key);
    }

    for (const [key, value] of Object.entries(updates)) {
      if (value.trim()) params.set(key, value);
      else params.delete(key);
    }

    params.set("search_submitted", "1");

    const href = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(href, { scroll: false });
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

    const href = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(href, { scroll: false });
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
        stayLabel: fromValue && toValue ? `${fromValue} – ${toValue}` : null,
        thumbnail: selectedHotelImages[0] ?? PLACEHOLDERS[0],
        checkIn: fromValue || null,
        checkOut: toValue || null,
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

    try {
      setCreatingTrip(true);
      setMemberActionMessage("");
      setMemberActionError("");

      const createdTrip = await createTripBrowser({
        name: newTripName || "New trip",
        destination:
          [selectedHotel.city, selectedHotel.country].filter(Boolean).join(" · ") ||
          null,
        periodLabel: fromValue && toValue ? `${fromValue} – ${toValue}` : null,
      });

      setTripChoices((prev) => [...prev, createdTrip]);
      setSelectedTripIdForAdd(createdTrip.id);

      const result = await addHotelToTripBrowser({
        tripId: createdTrip.id,
        hotelDirectusId: String(selectedHotel.id),
        name: selectedHotel.hotel_name ?? "Untitled hotel",
        location: locationLine(selectedHotel),
        stayLabel: fromValue && toValue ? `${fromValue} – ${toValue}` : null,
        thumbnail: selectedHotelImages[0] ?? PLACEHOLDERS[0],
        checkIn: fromValue || null,
        checkOut: toValue || null,
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

      if (
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
        thumbnail: selectedHotelImages[0] ?? PLACEHOLDERS[0],
      });

      if (result.status === "already_exists") {
        setMemberActionMessage("Already in your favorites list.");
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
        setMemberActionError("Log in to add favorites.");
      } else {
        setMemberActionError("Could not add hotel to favourites.");
      }
    } finally {
      setMemberActionLoading(null);
    }
  }

  return (
    <div className="w-full">
      <div
        className={[
          "grid gap-4",
          shouldShowFeatured
            ? "grid-cols-1"
            : "lg:grid-cols-[minmax(360px,0.95fr)_minmax(0,1.45fr)]",
        ].join(" ")}
      >
        {!shouldShowFeatured ? (
          <section className="grid min-w-0 gap-4">
          <div className="relative z-30 overflow-visible oltra-glass oltra-panel !p-4">
            <form
              action="/hotels"
              method="GET"
              className="grid gap-[14px] md:grid-cols-12 md:gap-[14px] overflow-visible"
              onChange={(e) => {
                const form = e.currentTarget;
                setHasPendingSearchInputLocal(formHasMeaningfulSearchInput(form));
              }}
            >
              <HiddenPreserveParams
                searchParams={searchParams}
                excludeKeys={[
                  "q",
                  "city",
                  "country",
                  "region",
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
                placeholder="Input hotel name, city, country, and/or purpose of trip"
                searchParams={searchParams}
                dataset={props.suggestions}
                wrapperClassName="md:col-span-12 pt-[2px]"
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
                            className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-[3px] text-[12px] text-white/74 hover:bg-white/12"
                            prefetch={false}
                          >
                            <span>{label}</span>
                            <span className="text-white/62">×</span>
                          </Link>
                        );
                      })}

                      {selectedPriceLabels.map((label) => (
                        <div
                          key={`selected-price-${label}`}
                          className="inline-flex items-center rounded-full border border-white/12 bg-white/8 px-3 py-[3px] text-[12px] text-white/74"
                        >
                          {label}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="relative md:col-span-3" data-oltra-control="true">
                    <div className="oltra-label">From</div>
                    <div
                      className="relative cursor-pointer"
                      onClick={() => openDatePicker(fromRef)}
                    >
                      <input
                        ref={fromRef}
                        type="date"
                        name="from"
                        min={todayIso}
                        value={fromValue}
                        onChange={(e) => setFromValue(e.target.value)}
                        onKeyDown={(e) => e.preventDefault()}
                        onBeforeInput={(e) => e.preventDefault()}
                        className={[
                          "oltra-input w-full cursor-pointer",
                          fromValue ? "text-white" : "text-transparent caret-transparent",
                        ].join(" ")}
                      />
                      {!fromValue ? (
                        <span className="pointer-events-none absolute left-0 top-0 flex h-full items-center px-[14px] text-white/62">
                          date
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="relative md:col-span-3" data-oltra-control="true">
                    <div className="oltra-label">To</div>
                    <div
                      className="relative cursor-pointer"
                      onClick={() => openDatePicker(toRef)}
                    >
                      <input
                        ref={toRef}
                        type="date"
                        name="to"
                        min={minToIso}
                        value={toValue}
                        onChange={(e) => setToValue(e.target.value)}
                        onKeyDown={(e) => e.preventDefault()}
                        onBeforeInput={(e) => e.preventDefault()}
                        className={[
                          "oltra-input w-full cursor-pointer",
                          toValue ? "text-white" : "text-transparent caret-transparent",
                        ].join(" ")}
                      />
                      {!toValue ? (
                        <span className="pointer-events-none absolute left-0 top-0 flex h-full items-center px-[14px] text-white/62">
                          date
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="relative md:col-span-3" data-oltra-control="true">
                    <div className="oltra-label">Guests</div>
                    <GuestSelector
                      initialValue={guestSelection}
                      onChange={(selection) => {
                        setGuestSelection(selection);
                      }}
                    />
                  </div>

                  <div className="relative md:col-span-3" data-oltra-control="true">
                    <div className="oltra-label">Bedrooms</div>
                    <OltraSelect
                      name="bedrooms"
                      value={bedroomsValue}
                      placeholder="#"
                      align="left"
                      onValueChange={setBedroomsValue}
                      options={[1, 2, 3, 4].map((n) => ({
                        value: String(n),
                        label: `${n} bedroom${n === 1 ? "" : "s"}`,
                      }))}
                    />
                  </div>
                </>
              ) : null}

              {showNarrowFurtherMessage ? (
                <div className="md:col-span-12 text-[12px] leading-relaxed text-white/64">
                  Narrow results further by adding region, country, city or setting.
                </div>
              ) : null}

              <div className="md:col-span-12 grid gap-3 md:grid-cols-4">
                {!compactTopMode && (
                  <>
                    <button
                      type="button"
                      onClick={() => updateFiltersOpen(!filtersOpen)}
                      className="oltra-button-function w-full"
                    >
                      Filters
                    </button>

                    <button
                      type="submit"
                      disabled={!searchIsActive}
                      title={searchDisabledReason || undefined}
                      className={[
                        "w-full md:col-start-3 md:col-span-2",
                        searchIsActive ? "oltra-button-primary" : "oltra-button-secondary",
                      ].join(" ")}
                    >
                      <span className="inline-flex items-center justify-center gap-2">
                        {isSubmittingSearch ? (
                          <span
                            className="inline-block h-3.5 w-3.5 animate-spin rounded-full border border-current border-t-transparent"
                            aria-hidden="true"
                          />
                        ) : null}
                        <span>
                          {searchIsActive
                            ? "CHECK AVAILABILITY"
                            : searchDisabledReason.charAt(0) +
                              searchDisabledReason.slice(1).toLowerCase()}
                        </span>
                      </span>
                    </button>
                  </>
                )}
              </div>

              {!compactTopMode && filtersOpen ? (
                <div className="md:col-span-12 border-t border-white/10 pt-3">
                  <div className="border-t border-white/10 py-2">
                    <button
                      type="button"
                      onClick={() => setPriceOpen((prev) => !prev)}
                      className="flex w-full items-center justify-between px-[14px] text-left"
                    >
                      <span className="text-[12px] uppercase tracking-[0.14em] text-white/70">
                        PRICE / TOTAL STAY ({activeCurrency})
                      </span>
                      <span
                        className="flex h-4 w-4 items-center justify-center text-white/55 transition-transform duration-150"
                        style={{ transform: priceOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                      >
                        <ChevronDown />
                      </span>
                    </button>

                    {priceOpen ? (
                      <div className="mt-2">
                        <div className="oltra-popup-panel !relative !left-auto !right-auto !top-auto z-0 !p-2">
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

                          <div className="mt-2 text-[11px] text-white/45">
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
            <div className="oltra-glass oltra-panel">
              <div className="flex items-baseline justify-between">
                <div className="oltra-label">Results</div>
                <div className="text-xs text-white/50">{resultsCount} found</div>
              </div>

              <div className="oltra-scrollbar mt-3.5 max-h-[62vh] space-y-3 overflow-y-auto pr-2">
                {visibleHotels.map((h) => {
                  const active = String(h.id) === selectedHotelId;
                  const img = getHotelImageSet(h)[0] ?? PLACEHOLDERS[0];
                  const bookingHref = buildBookingLink(h, bookingSearchParams);
                  const bookingLabel = h.booking_label?.trim() || "BOOK";
                  const featuredAwards = getFeaturedAwardsForHotel(h);
                  const nameAndLocation = [h.city, h.country].filter(Boolean).join(" · ");

                  return (
                    <button
                      key={String(h.id)}
                      type="button"
                      onClick={() => setSelectedHotelId(String(h.id))}
                      className={[
                        "oltra-output w-full text-left transition",
                        active
                          ? "bg-[var(--oltra-field-bg-strong)] hotel-result-card--active"
                          : "bg-[var(--oltra-field-bg)] hover:bg-[var(--oltra-field-bg-strong)]",
                      ].join(" ")}
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
                        <div className="overflow-hidden rounded-[var(--oltra-radius-md)]">
                          <img src={img} alt="" className="h-20 w-full object-cover" />
                        </div>

                        <div className="flex min-h-[80px] min-w-0 flex-col">
                          <div className="min-w-0">
                            <div className="truncate text-base font-light tracking-wide text-white">
                              {h.hotel_name ?? "Untitled hotel"}
                            </div>
                            <div className="mt-0.5 text-xs text-white/55">
                              {nameAndLocation || "—"}
                            </div>
                            <div className="mt-1.5">
                              <AccoladeBadge hotel={h} />
                            </div>
                          </div>

                          {h.highlights ? (
                            <div className="mt-2 text-xs leading-relaxed text-white/65">
                              {clampText(h.highlights, 170)}
                            </div>
                          ) : null}

                          <div className="mt-auto pt-2">
                            {featuredAwards.length ? (
                              <div className="truncate text-[11px] text-white/60">
                                {featuredAwards.map((award) => award.label).join(" · ")}
                              </div>
                            ) : null}

                            {bookingHref ? (
                              <div className="mt-3 flex justify-end">
                                <a
                                  href={bookingHref}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex min-h-9 items-center justify-center rounded-full border border-white/18 px-3.5 py-1.5 text-[11px] tracking-[0.16em] text-white/85 transition hover:bg-white/12 hover:text-white"
                                >
                                  {bookingLabel}
                                </a>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </section>
        ) : null}

        <section className="oltra-glass oltra-panel min-w-0 overflow-visible">
          {effectiveView === "featured" ? (
            <div className="relative -m-4 min-h-[820px] overflow-hidden rounded-[var(--oltra-radius-xl)]">
              <img
                src={featuredHeroImage}
                alt={featuredHotel.hotel_name ?? "Featured hotel"}
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-black/24 via-black/8 to-black/34" />

              <div className="absolute left-5 top-5 z-10 w-[min(420px,calc(100%-40px))] rounded-[var(--oltra-radius-lg)] border border-white/12 bg-[rgba(24,34,42,0.22)] p-4 backdrop-blur-[14px]">
                <form
                  action="/hotels"
                  method="GET"
                  className="grid gap-[14px]"
                  onChange={(e) => {
                    const form = e.currentTarget;
                    setHasPendingSearchInputLocal(formHasMeaningfulSearchInput(form));
                  }}
                >
                  <HiddenPreserveParams
                    searchParams={searchParams}
                    excludeKeys={[
                      "q",
                      "city",
                      "country",
                      "region",
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
                    placeholder="Input hotel name, city, country, and/or purpose of trip"
                    searchParams={searchParams}
                    dataset={props.suggestions}
                  />

                  {showNarrowFurtherMessage ? (
                    <div className="text-[12px] leading-relaxed text-white/72">
                      Narrow results further by adding region, country, city or setting.
                    </div>
                  ) : null}
                </form>
              </div>

              <div className="absolute right-5 top-5 z-10 w-[min(360px,calc(100%-40px))] rounded-[var(--oltra-radius-lg)] border border-white/12 bg-[rgba(24,34,42,0.22)] px-4 py-3 backdrop-blur-[14px]">
                <div className="text-[11px] uppercase tracking-[0.16em] text-white/72">
                  Featured hotel
                </div>
                <div className="mt-2 text-[1.15rem] font-light tracking-wide text-white">
                  {featuredHotel.hotel_name ?? "Featured hotel"}
                </div>
                <div className="mt-1 text-[12px] text-white/78">
                  {[featuredHotel.city, featuredHotel.country].filter(Boolean).join(" · ") || "Curated selection"}
                </div>
                <div className="mt-2 text-[12px] leading-relaxed text-white/74">
                  {getFeaturedAwardsForHotel(featuredHotel as HotelRecord)
                    .map((award) => award.label)
                    .join(" · ") || "Curated featured selection"}
                </div>
              </div>
            </div>
          ) : effectiveView === "map" ? (
            <div className="relative">
              <div className="overflow-hidden rounded-[var(--oltra-radius-lg)] border border-white/12 bg-[rgba(18,28,36,0.22)]">
                <div ref={mapRef} className="h-[760px] w-full" />

                <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setViewMode("details")}
                    className="oltra-button-map-toggle pointer-events-auto"
                  >
                    Switch to hotel view
                  </button>
                </div>
              </div>
            </div>
          ) : selectedHotel ? (
            <div className="relative">
              <div className="flex items-start justify-between gap-6">
                <div className="min-w-0">
                  <div className="oltra-subheader">Selected hotel</div>

                  <h2 className="mt-2 truncate text-2xl font-light tracking-wide text-white md:text-3xl">
                    {selectedHotel.hotel_name ?? "Untitled hotel"}
                  </h2>

                  <div className="mt-1 text-sm text-white/60">
                    {[selectedHotel.city, selectedHotel.country]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </div>

                  {selectedHotel.highlights?.trim() ? (
                    <div className="mt-2 text-sm leading-relaxed text-white/72">
                      {clampText(selectedHotel.highlights, 320)}
                    </div>
                  ) : null}
                </div>

                <div className="shrink-0">
                  <button
                    type="button"
                    onClick={() => setViewMode("map")}
                    className="oltra-button-function"
                  >
                    Switch to map view
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-12 gap-3">
                <div className="col-span-12 overflow-hidden rounded-[var(--oltra-radius-lg)] lg:col-span-8">
                  <button
                    type="button"
                    onClick={() => setLightboxOpen(true)}
                    className="block w-full overflow-hidden rounded-[var(--oltra-radius-lg)]"
                  >
                    <img
                      src={
                        selectedHotelImages[selectedImageIndex] ??
                        selectedHotelImages[0]
                      }
                      alt=""
                      className="h-[340px] w-full object-cover"
                    />
                  </button>
                </div>

                <div className="col-span-12 lg:col-span-4">
                  <div className="oltra-scrollbar grid max-h-[340px] grid-cols-2 gap-2 overflow-y-auto pr-2 content-start">
                    {selectedHotelImages.map((src, index) => (
                      <button
                        key={src}
                        type="button"
                        onClick={() => setSelectedImageIndex(index)}
                        className={[
                          "overflow-hidden rounded-[var(--oltra-radius-md)] text-left transition",
                          selectedImageIndex === index
                            ? "bg-[var(--oltra-field-bg-strong)]"
                            : "bg-[var(--oltra-field-bg)] hover:bg-[var(--oltra-field-bg-strong)]",
                        ].join(" ")}
                      >
                        <img
                          src={src}
                          alt=""
                          className="aspect-[4/3] w-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-6 grid items-start gap-6 md:grid-cols-[7fr_3fr]">
                <div className="space-y-5">
                  <div>
                    <div className="oltra-subheader">Description</div>
                    <div className="mt-1.5 text-sm leading-relaxed text-white/75">
                      {selectedHotel.description?.trim()
                        ? clampText(selectedHotel.description, 520)
                        : "—"}
                    </div>
                  </div>

                  <div className="oltra-output p-4">
                    <div className="oltra-subheader">Relevant available rooms</div>
                    <div className="mt-2 text-sm text-white/65">
                      Placeholder section — will be fed by availability logic later.
                    </div>
                  </div>
                </div>

                <div className="space-y-5">
                  <div>
                    <div className="oltra-subheader">Setting</div>
                    <div className="mt-1.5 text-sm leading-relaxed text-white/75">
                      {selectedHotelSettings.length
                        ? selectedHotelSettings.slice(0, 8).join(" · ")
                        : "—"}
                    </div>
                  </div>

                  <div>
                    <div className="oltra-subheader">Style</div>
                    <div className="mt-1.5 text-sm leading-relaxed text-white/75">
                      {selectedHotelStyles.length
                        ? selectedHotelStyles.slice(0, 8).join(" · ")
                        : "—"}
                    </div>
                  </div>

                  <div>
                    <div className="oltra-subheader">Activities</div>
                    <div className="mt-1.5 text-sm leading-relaxed text-white/75">
                      {selectedHotelActivities.length
                        ? selectedHotelActivities.slice(0, 10).join(" · ")
                        : "—"}
                    </div>
                  </div>

                  <div>
                    <div className="oltra-subheader">Accolades</div>
                    <div className="mt-1.5 text-sm leading-relaxed text-white/75">
                      {selectedHotelAwards.length
                        ? selectedHotelAwards.slice(0, 8).join(" · ")
                        : "—"}
                    </div>
                  </div>

                  <div>
                    <div className="oltra-subheader">Brand</div>
                    <div className="mt-1.5 text-sm leading-relaxed text-white/75">
                      {selectedHotel.affiliation?.trim() || "—"}
                    </div>
                  </div>

                  <div>
                    <div className="oltra-subheader">Links</div>
                    <div className="mt-1.5 flex flex-wrap gap-3 text-sm text-white/75">
                      {selectedHotel.www ? (
                        <a
                          className="underline underline-offset-4 text-white/80 hover:text-white"
                          href={selectedHotel.www}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Website
                        </a>
                      ) : null}

                      {selectedHotel.insta ? (
                        <a
                          className="underline underline-offset-4 text-white/80 hover:text-white"
                          href={selectedHotel.insta}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Instagram
                        </a>
                      ) : null}

                      <Link
                        href={`/hotels/${encodeURIComponent(
                          String(selectedHotel.hotelid ?? selectedHotel.id)
                        )}`}
                        className="underline underline-offset-4 text-white/80 hover:text-white"
                        prefetch={false}
                      >
                        Open detail route
                      </Link>
                    </div>
                  </div>

                  <div ref={tripPickerRef} className="relative pt-1">
                    {showTripPicker && (
                      <div
                        className="oltra-popup-panel oltra-popup-panel--bounded oltra-popup-panel--up absolute left-0 right-0 z-50 mb-2"
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
                            <div className="text-[12px] text-white/65">
                              No trips available.
                            </div>
                          )}

                          <div className="mt-3 border-t border-white/10 pt-3">
                            <div className="oltra-subheader">Create new trip</div>

                            <div className="mt-2 flex flex-col gap-2">
                              <input
                                type="text"
                                value={newTripName}
                                onChange={(e) => setNewTripName(e.target.value)}
                                placeholder="Trip name"
                                className="oltra-input"
                              />

                              <button
                                type="button"
                                onClick={handleCreateTripAndAddHotel}
                                disabled={creatingTrip}
                                className="oltra-dropdown-item"
                              >
                                {creatingTrip ? "Creating..." : "Create new trip"}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
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
                        className={`${getMemberActionButtonClass(
                          isMemberLoggedIn
                        )} w-full`}
                        aria-disabled={!isMemberLoggedIn}
                      >
                        ADD TO TRIP
                      </button>
                      <button
                        type="button"
                        onClick={() => {
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
                        className={`${getMemberActionButtonClass(
                          isMemberLoggedIn
                        )} w-full`}
                        aria-disabled={!isMemberLoggedIn}
                      >
                        {memberActionLoading === "favorite"
                          ? "ADDING..."
                          : "ADD TO FAVOURITES"}
                      </button>
                    </div>
                  </div>

                  {(memberActionError || memberActionMessage) ? (
                    <div className="pt-2 text-[12px] text-white/65">
                      {memberActionError || memberActionMessage}
                    </div>
                  ) : null}

                  {selectedHotelBookingHref ? (
                    <div className="pt-2">
                      <a
                        href={selectedHotelBookingHref}
                        target="_blank"
                        rel="noreferrer"
                        className="oltra-button-secondary w-full rounded-full"
                      >
                        {selectedHotelBookingLabel}
                      </a>
                    </div>
                  ) : null}
                </div>
              </div>

              {lightboxOpen ? (
                <div className="absolute left-0 right-0 top-[108px] z-[500] bg-[rgba(10,18,26,0.58)] py-3">
                  <div className="relative mx-auto w-[calc(100%-24px)] max-w-none rounded-[var(--oltra-radius-xl)] border border-white/12 bg-[rgba(20,32,42,0.94)] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.38)] backdrop-blur-[18px]">
                    <button
                      type="button"
                      onClick={() => setLightboxOpen(false)}
                      className="absolute right-4 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/16"
                    >
                      ×
                    </button>

                    <div className="flex items-center gap-4">
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedImageIndex((prev) =>
                            prev === 0 ? selectedHotelImages.length - 1 : prev - 1
                          )
                        }
                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/16"
                      >
                        ‹
                      </button>

                      <div className="flex h-[700px] min-w-0 flex-1 items-center justify-center overflow-hidden">
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
                            prev === selectedHotelImages.length - 1 ? 0 : prev + 1
                          )
                        }
                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/16"
                      >
                        ›
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="p-10 text-white/60">Select a hotel to view details.</div>
          )}
        </section>
      </div>
    </div>
  );
}