"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import GuestSelector from "@/components/site/GuestSelector";
import OltraSelect from "@/components/site/OltraSelect";
import { buildBookingLink, type BookingSearchParams } from "@/lib/hotels/buildBookingLink";
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
} from "@/lib/members/db";

type PageSearchParams = Record<string, string | string[] | undefined>;

function serializeList(values: string[]): string {
  return values.join(",");
}

function buildHrefWithParam(
  current: PageSearchParams,
  key: string,
  nextValues: string[]
): string {
  const params = new URLSearchParams();

  for (const [k, v] of Object.entries(current)) {
    if (k === key) continue;
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      for (const vv of v) params.append(k, vv);
    } else {
      params.set(k, v);
    }
  }

  if (nextValues.length) params.set(key, serializeList(nextValues));
  return `/hotels?${params.toString()}`;
}

function clampText(s: string | undefined | null, max = 160): string {
  const t = (s ?? "").trim();
  if (!t) return "";
  if (t.length <= max) return t;
  return t.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

function TogglePill(props: { label: string; active: boolean; href: string }) {
  return (
    <Link
      href={props.href}
      className={[
        "oltra-button",
        props.active ? "oltra-button--active" : "",
      ].join(" ")}
      prefetch={false}
    >
      {props.label}
    </Link>
  );
}

function RelDropdown(props: {
  title: string;
  paramKey: string;
  selectedIds: string[];
  map: Map<string, string>;
  searchParams: PageSearchParams;
  defaultOpen?: boolean;
}) {
  const selected = useMemo(() => new Set(props.selectedIds), [props.selectedIds]);

  const options = useMemo(() => {
    const out: Array<{ id: string; label: string }> = [];
    for (const [id, label] of props.map.entries()) {
      out.push({ id, label });
      if (out.length >= 60) break;
    }
    out.sort((a, b) => Number(selected.has(b.id)) - Number(selected.has(a.id)));
    return out;
  }, [props.map, selected]);

  return (
    <details
      className="border-t border-white/10 py-2"
      open={props.defaultOpen ?? false}
    >
      <summary className="ml-[14px] cursor-pointer select-none text-[12px] uppercase tracking-[0.14em] text-white/70">
        {props.title}
      </summary>

      <div className="mt-1.5 flex flex-wrap gap-2">
        {options.map((opt) => {
          const active = selected.has(opt.id);
          const next = active
            ? Array.from(selected).filter((x) => x !== opt.id)
            : Array.from(new Set([...selected, opt.id]));

          return (
            <TogglePill
              key={`${props.paramKey}-${opt.id}`}
              label={opt.label}
              active={active}
              href={buildHrefWithParam(props.searchParams, props.paramKey, next)}
            />
          );
        })}
      </div>
    </details>
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

type Hotel = {
  id: string | number;
  hotel_name?: string;
  hotelid?: string | number;
  affiliation?: string | null;
  country?: string | null;
  region?: string | null;
  city?: string | null;
  local_area?: string | null;
  highlights?: string | null;
  description?: string | null;
  www?: string | null;
  insta?: string | null;
  editor_rank_13?: number | string | null;
  ext_points?: number | string | null;
  activities?: any[] | null;
  settings?: any[] | null;
  awards?: any[] | null;
  styles?: any[] | null;

  booking_provider?: "booking" | "cj_booking" | "official" | "none" | null;
  booking_url?: string | null;
  booking_hotel_ref?: string | null;
  booking_enabled?: boolean | null;
  booking_label?: string | null;
  booking_notes?: string | null;
  official_website_booking_url?: string | null;
};

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

const PLACEHOLDERS = [
  "/images/hotel-placeholder-1.jpg",
  "/images/hotel-placeholder-2.jpg",
  "/images/hotel-placeholder-3.jpg",
  "/images/hotel-placeholder-4.jpg",
];

function locationLine(h: Hotel): string {
  return [h.local_area, h.city, h.region, h.country].filter(Boolean).join(" · ");
}

function distPlaceholder(h: Hotel): string {
  return h.city ? `Near ${h.city} centre` : "Central location";
}

function relationIds(items: any[] | null | undefined, key: string): string[] {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => {
      const rel = item?.[key];
      const id = rel?.id;
      return id == null ? null : String(id);
    })
    .filter(Boolean) as string[];
}

function relationLabels(
  items: any[] | null | undefined,
  key: string,
  taxMap: Map<string, string>
): string[] {
  return relationIds(items, key)
    .map((id) => taxMap.get(id) ?? id)
    .filter(Boolean);
}

export default function HotelsView(props: {
  hotels: Hotel[];
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
  };
}) {
  const { hotels, tax, searchParams, selected, suggestions } = props;

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

  const [memberActionMessage, setMemberActionMessage] = useState("");
  const [memberActionError, setMemberActionError] = useState("");
  const [memberActionLoading, setMemberActionLoading] = useState<
    "trip" | "favorite" | null
  >(null);

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

  useEffect(() => {
    setFromValue(normalizeParam(searchParams.from));
    setToValue(normalizeParam(searchParams.to));
    setGuestSelection(readGuestSelection(searchParams));
  }, [searchParams]);

  useEffect(() => {
    function handleClickOutside() {
      setShowTripPicker(false);
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

    loadTripChoices();

    return () => {
      active = false;
    };
  }, []);

  const [selectedHotelId, setSelectedHotelId] = useState<string | null>(
    hotels.length > 0 ? String(hotels[0].id) : null
  );

  const selectedHotel = useMemo(() => {
    if (!selectedHotelId) return hotels[0] ?? null;
    return hotels.find((h) => String(h.id) === selectedHotelId) ?? hotels[0] ?? null;
  }, [hotels, selectedHotelId]);

  const resultsCount = hotels.length;

const selectedHotelSettings = useMemo(
  () => relationLabels(selectedHotel?.settings, "settings_id", tax.settings),
  [selectedHotel, tax.settings]
);

const selectedHotelActivities = useMemo(
  () => relationLabels(selectedHotel?.activities, "activities_id", tax.activities),
  [selectedHotel, tax.activities]
);

const selectedHotelAwards = useMemo(
  () => relationLabels(selectedHotel?.awards, "awards_id", tax.awards),
  [selectedHotel, tax.awards]
);

const selectedHotelStyles = useMemo(
  () => relationLabels(selectedHotel?.styles, "styles_id", tax.styles),
  [selectedHotel, tax.styles]
);

const selectedHotelBookingHref = useMemo(
  () =>
    selectedHotel
      ? buildBookingLink(selectedHotel, bookingSearchParams)
      : null,
  [selectedHotel, bookingSearchParams]
);

const selectedHotelBookingLabel = useMemo(
  () => selectedHotel?.booking_label?.trim() || "BOOK",
  [selectedHotel]
);

  async function handleAddHotelToTrip(tripId?: string) {
    if (!selectedHotel) return;

    try {
      setMemberActionLoading("trip");
      setMemberActionMessage("");
      setMemberActionError("");

      const result = await addHotelToTripBrowser({
        tripId: tripId || selectedTripIdForAdd || null,
        hotelDirectusId: String(selectedHotel.id),
        name: selectedHotel.hotel_name ?? "Untitled hotel",
        location: locationLine(selectedHotel),
        stayLabel:
          fromValue && toValue ? `${fromValue} – ${toValue}` : null,
        thumbnail: PLACEHOLDERS[0],
        checkIn: fromValue || null,
        checkOut: toValue || null,
      });

      if (result.duplicate) {
        setMemberActionMessage("Hotel already exists in this trip.");
      } else if (result.overlapWarning) {
        setMemberActionMessage("Hotel added to trip with overlap warning.");
      } else {
        setMemberActionMessage("Hotel added to trip.");
      }
    } catch (error) {
      setMemberActionError("Could not add hotel to trip.");
    } finally {
      setMemberActionLoading(null);
    }
  }

  async function handleCreateTripAndAddHotel() {
    if (!selectedHotel) return;

    try {
      setCreatingTrip(true);
      setMemberActionMessage("");
      setMemberActionError("");

      const createdTrip = await createTripBrowser({
        name: newTripName || "New trip",
        destination:
          [selectedHotel.city, selectedHotel.country].filter(Boolean).join(" · ") ||
          null,
        periodLabel:
          fromValue && toValue ? `${fromValue} – ${toValue}` : null,
      });

      setTripChoices((prev) => [...prev, createdTrip]);
      setSelectedTripIdForAdd(createdTrip.id);

      const result = await addHotelToTripBrowser({
        tripId: createdTrip.id,
        hotelDirectusId: String(selectedHotel.id),
        name: selectedHotel.hotel_name ?? "Untitled hotel",
        location: locationLine(selectedHotel),
        stayLabel:
          fromValue && toValue ? `${fromValue} – ${toValue}` : null,
        thumbnail: PLACEHOLDERS[0],
        checkIn: fromValue || null,
        checkOut: toValue || null,
      });

      setNewTripName("");
      setShowTripPicker(false);

      if (result.overlapWarning) {
        setMemberActionMessage("New trip created and hotel added with overlap warning.");
      } else {
        setMemberActionMessage("New trip created and hotel added.");
      }
    } catch (error) {
      setMemberActionError("Could not create trip.");
    } finally {
      setCreatingTrip(false);
    }
  }

  async function handleAddHotelToFavorites() {
    if (!selectedHotel) return;

    try {
      setMemberActionLoading("favorite");
      setMemberActionMessage("");
      setMemberActionError("");

      await addFavoriteHotelBrowser({
        hotelDirectusId: String(selectedHotel.id),
        name: selectedHotel.hotel_name ?? "Untitled hotel",
        location: locationLine(selectedHotel),
        meta: selectedHotel.affiliation?.trim() || "",
        thumbnail: PLACEHOLDERS[0],
      });

      setMemberActionMessage("Hotel added to favourites.");
    } catch (error) {
      setMemberActionError("Could not add hotel to favourites.");
    } finally {
      setMemberActionLoading(null);
    }
  }

  return (
    <div className="w-full">
      <div className="grid gap-5 lg:grid-cols-[minmax(360px,0.95fr)_minmax(0,1.45fr)]">
        <section className="grid gap-5 min-w-0">
          <div className="relative z-30 overflow-visible oltra-glass oltra-panel !p-4">
            <form
              action="/hotels"
              method="GET"
              className="grid gap-2 md:gap-2.5 md:grid-cols-12 overflow-visible"
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
                  "kid_age_1",
                  "kid_age_2",
                  "kid_age_3",
                  "kid_age_4",
                  "kid_age_5",
                  "kid_age_6",
                ]}
              />

              <StructuredDestinationField
                label="Search"
                placeholder="Input hotel name, city, country, and/or purpose of trip"
                searchParams={searchParams}
                dataset={suggestions}
                wrapperClassName="md:col-span-6"
              />

              <div className="relative z-[400] md:col-span-3">
                <div className="oltra-label mb-1">Guests</div>
                <GuestSelector initialValue={guestSelection} />
              </div>

              <div className="relative md:col-span-3">
                <div className="oltra-label mb-1">From</div>
                <input
                  type="date"
                  name="from"
                  value={fromValue}
                  onChange={(e) => setFromValue(e.target.value)}
                  onKeyDown={(e) => e.preventDefault()}
                  onBeforeInput={(e) => e.preventDefault()}
                  className={[
                    "oltra-input w-full",
                    fromValue ? "text-white" : "text-transparent caret-transparent",
                  ].join(" ")}
                />
                {!fromValue ? (
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center px-[14px] text-white/62">
                    From
                  </span>
                ) : null}
              </div>

              <div className="relative z-[100] md:col-span-6">
                <div className="oltra-label mb-1">Bedrooms</div>
                <OltraSelect
                  name="bedrooms"
                  value={normalizeParam(searchParams.bedrooms)}
                  placeholder="Bedrooms"
                  align="left"
                  options={[1, 2, 3, 4].map((n) => ({
                    value: String(n),
                    label: `${n} bedroom${n === 1 ? "" : "s"}`,
                  }))}
                />
              </div>

              <div className="relative md:col-span-3">
                <div className="oltra-label mb-1">To</div>
                <input
                  type="date"
                  name="to"
                  value={toValue}
                  onChange={(e) => setToValue(e.target.value)}
                  onKeyDown={(e) => e.preventDefault()}
                  onBeforeInput={(e) => e.preventDefault()}
                  className={[
                    "oltra-input w-full",
                    toValue ? "text-white" : "text-transparent caret-transparent",
                  ].join(" ")}
                />
                {!toValue ? (
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center px-[14px] text-white/62">
                    To
                  </span>
                ) : null}
              </div>



              <div className="md:col-span-3 flex items-center">
                <Link
                  href="/hotels"
                  className="ml-[14px] text-[11px] tracking-[0.16em] text-white/65 underline underline-offset-4 hover:text-white"
                  prefetch={false}
                >
                  Reset
                </Link>
              </div>

              <div className="md:col-span-3 flex items-center justify-end">
                <button type="submit" className="oltra-button-primary">
                  Search
                </button>
              </div>
            </form>
          </div>

          <div className="relative z-10 oltra-glass oltra-panel !p-4">
            <div className="oltra-label mb-1">Filters</div>

            <details className="py-2" open>
              <summary className="ml-[14px] cursor-pointer select-none text-[12px] uppercase tracking-[0.14em] text-white/70">
                Price
              </summary>

              <div className="mt-2 grid grid-cols-2 gap-2.5">
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

              <div className="mt-1.5 text-[11px] text-white/45">
                (Illustrative for now — will connect when pricing fields exist)
              </div>
            </details>

            <RelDropdown
              title="Activities"
              paramKey="activities"
              selectedIds={selected.activities}
              map={tax.activities}
              searchParams={searchParams}
            />

            <RelDropdown
              title="Setting"
              paramKey="settings"
              selectedIds={selected.settings}
              map={tax.settings}
              searchParams={searchParams}
            />

            <RelDropdown
              title="Accolades"
              paramKey="awards"
              selectedIds={selected.awards}
              map={tax.awards}
              searchParams={searchParams}
            />
          </div>

          <div className="oltra-glass oltra-panel">
            <div className="flex items-baseline justify-between">
              <div className="oltra-label">Results</div>
              <div className="text-xs text-white/50">{resultsCount} found</div>
            </div>

            <div className="mt-4 max-h-[62vh] space-y-4 overflow-y-auto pr-2">
              {hotels.map((h, idx) => {
                const active = String(h.id) === selectedHotelId;
                const img = PLACEHOLDERS[idx % PLACEHOLDERS.length];
                const bookingHref = buildBookingLink(h, bookingSearchParams);
                const bookingLabel = h.booking_label?.trim() || "BOOK";

                return (
                  <button
                    key={String(h.id)}
                    type="button"
                    onClick={() => setSelectedHotelId(String(h.id))}
                    className={[
                      "oltra-output w-full text-left transition",
                      active ? "bg-white/16" : "hover:bg-white/10",
                    ].join(" ")}
                    style={
                      active
                        ? {
                            borderColor: "rgba(255,255,255,0.28)",
                            boxShadow:
                              "0 10px 24px rgba(10,24,36,0.14), inset 0 1px 0 rgba(255,255,255,0.08)",
                          }
                        : undefined
                    }
                  >
                    <div className="grid grid-cols-[132px_1fr] gap-3.5">
                      <div className="overflow-hidden rounded-[var(--oltra-radius-md)] border border-white/10">
                        <img src={img} alt="" className="h-20 w-full object-cover" />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="truncate text-base font-light tracking-wide text-white">
                              {h.hotel_name ?? "Untitled hotel"}
                            </div>
                            <div className="mt-0.5 text-xs text-white/55">
                              {locationLine(h) || "—"}
                            </div>
                            <div className="mt-1 text-xs text-white/45">
                              {distPlaceholder(h)}
                            </div>
                          </div>

                          <div className="shrink-0 text-xs text-white/60">
                            Rank{" "}
                            <span className="text-white/85">
                              {h.editor_rank_13 ?? "—"}
                            </span>
                          </div>
                        </div>

                        {h.highlights ? (
                          <div className="mt-1.5 text-xs leading-relaxed text-white/65">
                            {clampText(h.highlights, 170)}
                          </div>
                        ) : null}

                        {relationLabels(h.awards, "awards_id", tax.awards).length ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {relationLabels(h.awards, "awards_id", tax.awards)
                              .slice(0, 3)
                              .map((label) => (
                                <span
                                  key={label}
                                  className="oltra-chip"
                                >
                                  {label}
                                </span>
                              ))}
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
                  </button>
                );
              })}

              {hotels.length === 0 ? (
                <div className="oltra-output p-8 text-sm text-white/70">
                  No hotels match your filters. Try resetting or removing a
                  constraint.
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className="oltra-glass oltra-panel min-w-0 overflow-hidden">
          {selectedHotel ? (
            <div>
              <div className="flex items-start justify-between gap-6">
                <div className="min-w-0">
                  <div className="oltra-subheader">
                    Selected hotel
                  </div>

                  <h2 className="mt-2 truncate text-2xl font-light tracking-wide text-white md:text-3xl">
                    {selectedHotel.hotel_name ?? "Untitled hotel"}
                  </h2>

                  <div className="mt-1 text-sm text-white/60">
                    {[selectedHotel.city, selectedHotel.country]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </div>
                </div>

                <div className="shrink-0 text-sm text-white/70">
                  Editor rank{" "}
                  <span className="text-white/90">
                    {selectedHotel.editor_rank_13 ?? "—"}
                  </span>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-12 gap-3">
                <div className="col-span-12 overflow-hidden rounded-[var(--oltra-radius-lg)] border border-white/10 lg:col-span-8">
                  <img
                    src={PLACEHOLDERS[0]}
                    alt=""
                    className="h-[340px] w-full object-cover"
                  />
                </div>

                <div className="col-span-12 lg:col-span-4">
                  <div className="space-y-2.5">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="overflow-hidden rounded-[var(--oltra-radius-md)] border border-white/10"
                      >
                        <img
                          src={PLACEHOLDERS[i % PLACEHOLDERS.length]}
                          alt=""
                          className="h-[78px] w-full object-cover"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 text-xs text-white/45">
                    (Next: thumbnail slider with all hotel images)
                  </div>
                </div>
              </div>

              <div className="mt-6 grid items-start gap-8 md:grid-cols-2">
                <div className="space-y-6">
                  <div>
                    <div className="oltra-subheader">
                      Highlights
                    </div>
                    <div className="mt-1.5 text-sm leading-relaxed text-white/75">
                      {selectedHotel.highlights?.trim()
                        ? clampText(selectedHotel.highlights, 220)
                        : "—"}
                    </div>
                  </div>

                  <div>
                    <div className="oltra-subheader">
                      Description
                    </div>
                    <div className="mt-1.5 text-sm leading-relaxed text-white/75">
                      {selectedHotel.description?.trim()
                        ? clampText(selectedHotel.description, 520)
                        : "—"}
                    </div>
                  </div>

                  <div className="oltra-output p-4">
                    <div className="oltra-subheader">
                      Relevant available rooms
                    </div>
                    <div className="mt-2 text-sm text-white/65">
                      Placeholder section — will be fed by availability logic later.
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div>
                    <div className="oltra-subheader">
                      Setting
                    </div>
                    <div className="mt-1.5 text-sm leading-relaxed text-white/75">
                      {selectedHotelSettings.length
                        ? selectedHotelSettings.slice(0, 8).join(" · ")
                        : "—"}
                    </div>
                  </div>

                  <div>
                    <div className="oltra-subheader">
                      Style
                    </div>
                    <div className="mt-1.5 text-sm leading-relaxed text-white/75">
                      {selectedHotelStyles.length
                        ? selectedHotelStyles.slice(0, 8).join(" · ")
                        : "—"}
                    </div>
                  </div>

                  <div>
                    <div className="oltra-subheader">
                      Activities
                    </div>
                    <div className="mt-1.5 text-sm leading-relaxed text-white/75">
                      {selectedHotelActivities.length
                        ? selectedHotelActivities.slice(0, 10).join(" · ")
                        : "—"}
                    </div>
                  </div>

                  <div>
                    <div className="oltra-subheader">
                      Accolades
                    </div>
                    <div className="mt-1.5 text-sm leading-relaxed text-white/75">
                      {selectedHotelAwards.length
                        ? selectedHotelAwards.slice(0, 8).join(" · ")
                        : "—"}
                    </div>
                  </div>

                  <div>
                    <div className="oltra-subheader">
                      Brand
                    </div>
                    <div className="mt-1.5 text-sm leading-relaxed text-white/75">
                      {selectedHotel.affiliation?.trim() || "—"}
                    </div>
                  </div>

                  <div>
                    <div className="oltra-subheader">
                      Links
                    </div>
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
                


                  <div className="relative pt-1">
                    {showTripPicker && (
                      <div
                        className="oltra-popup-panel absolute left-0 right-0 top-full mt-2 z-50"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="oltra-subheader">
                          Select trip
                        </div>

                        <div className="flex flex-col gap-2">
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
                            <button
                              type="button"
                              onClick={() => {
                                handleAddHotelToTrip();
                                setShowTripPicker(false);
                              }}
                              className="oltra-dropdown-item"
                            >
                              My trip
                            </button>                       
                          )}
                          <div className="mt-3 border-t border-white/10 pt-3">
                            <div className="oltra-subheader">
                              Create new trip
                            </div>

                            <div className="flex flex-col gap-2">
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
                          setShowTripPicker((prev) => !prev);
                        }}
                        className="oltra-button-secondary w-full"
                      >
                        ADD TO TRIP
                      </button>
                      <button
                        type="button"
                        onClick={handleAddHotelToFavorites}
                        disabled={memberActionLoading !== null}
                        className="oltra-button-secondary w-full"
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
            </div>
          ) : (
            <div className="p-10 text-white/60">No selection.</div>
          )}
        </section>
      </div>
    </div>
  );
}