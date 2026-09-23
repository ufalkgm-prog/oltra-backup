"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import OltraSpinner from "./OltraSpinner";
import { useDropdownDismiss } from "@/lib/useDropdownDismiss";
import type {
  HotelSuggestionDataset,
  SuggestionType,
} from "@/lib/hotelSearchSuggestions";
import styles from "./StructuredDestinationField.module.css";

type SearchParams = Record<string, string | string[] | undefined>;

type Token = {
  type: SuggestionType;
  label: string;
  value: string;
  id?: string;
};

type SuggestionItem = {
  type: SuggestionType;
  label: string;
  value: string;
  id?: string;
};

type StructuredDestinationState = {
  activeHotelCount: number;
  hasSelection: boolean;
  selectedTypes: SuggestionType[];
  selectedValues: Partial<Record<SuggestionType, string[]>>;
};

type Props = {
  label: string;
  placeholder: string;
  searchParams: SearchParams;
  dataset: HotelSuggestionDataset;
  wrapperClassName?: string;
  allowedTypes?: SuggestionType[];
  onStateChange?: (state: StructuredDestinationState) => void;
  busy?: boolean;
  /** Rendered at the right-hand end of the input box, after the chips and the
   * typing area.
   *
   * A slot rather than the control itself: this field is shared by the landing
   * and Hotels pages, and it should not know what is being put in it. Both
   * callers happen to pass the concierge button; a third could pass nothing
   * and be unaffected. */
  trailingControl?: React.ReactNode;
  /** Set while the page is showing the AI concierge's curated results.
   *
   * The box then holds ONE token, "AI curated results", instead of tags that
   * approximate the answer (Ulrik, 2026-09-14): a city plus Beachfront plus
   * Coastal is not what the concierge chose, and editing those tags edited a
   * search nobody ran. Removing the token calls `onRemove`, which is how the
   * page drops the curated set. Choosing a destination instead replaces it with
   * an ordinary search.
   *
   * `key` changes when a new answer arrives, so a token dismissed earlier does
   * not stay dismissed for a later answer. `ids`, when given, is posted as a
   * hidden field so the page's own form submits (a date change) keep the set. */
  curated?: { key: string; ids?: string; onRemove: () => void };
};

const CURATED_LABEL = "AI curated results";

/* One shared empty list while the curated token shows, so the memos and the
   state-report effect below see a stable dependency rather than a new array on
   every render. */
const NO_TOKENS: Token[] = [];

function normalizeParam(v: string | string[] | undefined): string {
  if (!v) return "";
  return Array.isArray(v) ? v[0] ?? "" : v;
}

function listFromParam(v: string | string[] | undefined): string[] {
  const raw = Array.isArray(v) ? v.join(",") : v ?? "";

  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getTaxLabel(
  list: Array<{ id: string; label: string; value?: string }>,
  raw: string
): string {
  const normalized = String(raw).trim().toLowerCase();

  const match = list.find((item) => {
    const itemId = String(item.id).trim().toLowerCase();
    const itemLabel = String(item.label).trim().toLowerCase();
    const itemValue = String(item.value ?? "").trim().toLowerCase();

    return (
      itemId === normalized ||
      itemLabel === normalized ||
      itemValue === normalized
    );
  });

  return match?.label ?? raw;
}

function buildInitialTokens(
  searchParams: SearchParams,
  dataset: HotelSuggestionDataset
): Token[] {
  const out: Token[] = [];

  // Only ever surface a city/country/region as a selectable token if it's
  // real - i.e. some hotel in our own dataset actually has it. Destination
  // params can arrive here from outside sources (e.g. the Flights page's
  // shared search-session handoff), and this field must never offer
  // something like an airport's descriptive name ("Venice Marco Polo") as
  // if it were one of our hotel cities.
  const city = normalizeParam(searchParams.city);
  if (city && dataset.hotels.some((hotel) => hotel.city === city)) {
    out.push({ type: "city", label: city, value: city });
  }

  const state = normalizeParam(searchParams.state);
  if (state && dataset.hotels.some((hotel) => hotel.state === state)) {
    out.push({ type: "state", label: state, value: state });
  }

  const adminRegion = normalizeParam(searchParams.admin_region);
  if (
    adminRegion &&
    dataset.hotels.some((hotel) => hotel.admin_region === adminRegion)
  ) {
    out.push({ type: "admin_region", label: adminRegion, value: adminRegion });
  }

  const country = normalizeParam(searchParams.country);
  if (country && dataset.hotels.some((hotel) => hotel.country === country)) {
    out.push({ type: "country", label: country, value: country });
  }

  const macroRegion = normalizeParam(searchParams.macro_region);
  if (
    macroRegion &&
    dataset.hotels.some((hotel) => hotel.macro_regions.includes(macroRegion))
  ) {
    out.push({ type: "macro_region", label: macroRegion, value: macroRegion });
  }

  const region = normalizeParam(searchParams.region);
  if (region && dataset.hotels.some((hotel) => hotel.region === region)) {
    out.push({ type: "region", label: region, value: region });
  }

  const activityIds = listFromParam(searchParams.activities);
  for (const activityId of activityIds) {
    out.push({
      type: "purpose",
      label: getTaxLabel(dataset.purposes, activityId),
      value: activityId,
      id: activityId,
    });
  }

  const settingIds = listFromParam(searchParams.settings);
  for (const settingId of settingIds) {
    out.push({
      type: "setting",
      label: getTaxLabel(dataset.settings, settingId),
      value: settingId,
      id: settingId,
    });
  }

  const q = normalizeParam(searchParams.q).trim();
  const qMatchesHotel = q
    ? dataset.hotels.some((hotel) => hotel.hotel_name === q)
    : false;

  if (q && qMatchesHotel) {
    out.push({ type: "hotel", label: q, value: q });
  }

  return out;
}

function helperPrompt(tokens: Token[]): string {
  if (tokens.length === 0) return "";

  const last = tokens[tokens.length - 1];

  if (last.type === "city") return "Add setting or purpose";
  if (last.type === "state") return "Add city or purpose";
  if (last.type === "admin_region") return "Add city or purpose";
  if (last.type === "country") return "Add city or purpose";
  if (last.type === "macro_region") return "Add country or setting";
  if (last.type === "region") return "Add city or setting";
  if (last.type === "purpose") return "Add city or country";
  if (last.type === "setting") return "Add city or purpose";
  if (last.type === "hotel") return "Add purpose or setting";

  return "";
}

function typeLabel(type: SuggestionType): string {
  switch (type) {
    case "hotel":
      return "Hotel";
    case "city":
      return "City";
    case "state":
      // Directus `state_province_county_island` — states, provinces, counties
      // and islands alike, so a neutral label. "Region" is taken: it means
      // continent in this dataset.
      return "Area";
    case "admin_region":
      // Directus `admin_region` — the administrative unit (Lombardy, Valais).
      // Broader than "Area", narrower than "Country".
      return "State / Province";
    case "country":
      return "Country";
    case "macro_region":
      // A colloquial region spanning several columns ("The Alps", "The
      // Mediterranean") — lib/ai/macroRegions.ts.
      return "Region";
    case "region":
      // The `region` column holds continents; "Region" now names the
      // colloquial regions above.
      return "Continent";
    case "purpose":
      return "Purpose";
    case "setting":
      return "Setting";
    default:
      return "";
  }
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

const ALL_TYPES: SuggestionType[] = [
  "hotel",
  "city",
  "state",
  "admin_region",
  "country",
  "macro_region",
  "region",
  "purpose",
  "setting",
];

/* FOUR GROUPS, IN THIS ORDER (Ulrik, 2026-09-16): Geography, Hotel, Setting,
 * Purpose. Geography gathers every place level a hotel row holds except
 * local_area (neighbourhoods, §3) plus the colloquial regions the concierge
 * understands — so "Me" lists Mexico, New Mexico and the Mediterranean
 * together, each marked with what it is. Typing two letters usually means
 * "where", so it leads.
 *
 * Geography is listed broad and traveller-facing first — regions, countries,
 * areas — then cities, then administrative units and continents. Only four
 * rows show before scrolling (§10), and measured on the collection "Me" found
 * eight small cities (Medhufaru Island, Megali Ammos…) ahead of Mexico, which
 * came twelfth. */
const GEOGRAPHY_TYPES: SuggestionType[] = [
  "macro_region",
  "country",
  "state",
  "city",
  "admin_region",
  "region",
];

const SUGGESTION_GROUPS: { key: string; label: string; types: SuggestionType[] }[] = [
  { key: "geography", label: "Geography", types: GEOGRAPHY_TYPES },
  { key: "hotel", label: "Hotel", types: ["hotel"] },
  { key: "setting", label: "Setting", types: ["setting"] },
  { key: "purpose", label: "Purpose", types: ["purpose"] },
];

const TYPE_RANK = SUGGESTION_GROUPS.flatMap((group) => group.types);

/* Narrowest place first. Decides which row survives when one name is several
 * levels at once ("Mexico City" is a city and an admin region; "Alif Dhaal
 * Atoll" an area and an admin region) — the dropdown shows it once — and what
 * Enter picks for an exact name, so "london" is still the city. */
const NARROWEST_FIRST: SuggestionType[] = [
  "city",
  "state",
  "admin_region",
  "country",
  "macro_region",
  "region",
  "hotel",
  "setting",
  "purpose",
];

function simplifyForMatch(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase();
}

/* True when the typed text starts a WORD of the label — "me" finds Mexico,
 * New Mexico and The Mediterranean, but not Palermo or Jumeirah. A word starts
 * the label or follows anything that is not a letter or digit (space, hyphen,
 * apostrophe: "az" finds Côte d'Azur). Accent- and case-blind. */
function matchesWordStart(label: string, typed: string): boolean {
  const text = simplifyForMatch(label);
  const q = simplifyForMatch(typed);
  if (!q) return true;
  let from = 0;
  for (;;) {
    const at = text.indexOf(q, from);
    if (at < 0) return false;
    if (at === 0 || !/[\p{L}\p{N}]/u.test(text[at - 1])) return true;
    from = at + 1;
  }
}

function getExternalSyncKey(
  searchParams: SearchParams,
  allowedTypes: SuggestionType[]
): string {
  return JSON.stringify({
    q: normalizeParam(searchParams.q),
    city: normalizeParam(searchParams.city),
    state: normalizeParam(searchParams.state),
    admin_region: normalizeParam(searchParams.admin_region),
    country: normalizeParam(searchParams.country),
    macro_region: normalizeParam(searchParams.macro_region),
    region: normalizeParam(searchParams.region),
    activities: listFromParam(searchParams.activities),
    settings: listFromParam(searchParams.settings),
    allowedTypes,
  });
}

function getVisibleTypes(tokens: Token[], allowedTypes: SuggestionType[]) {
  const hasHotel = tokens.some((token) => token.type === "hotel");
  const hasCity = tokens.some((token) => token.type === "city");
  const hasState = tokens.some((token) => token.type === "state");
  const hasAdminRegion = tokens.some((token) => token.type === "admin_region");
  const hasCountry = tokens.some((token) => token.type === "country");

  // Geography narrows hotel > city > state (traveller area) > admin_region >
  // country > region (continent). Picking one level hides every broader one,
  // since they can only be redundant. Note `state` and `admin_region` often
  // hold the same value (Tuscany, Bali) — that is intended, and the narrower
  // of the two wins.
  // A colloquial region crosses countries (the Alps), so a country or admin
  // region still narrows it — only a city, area or hotel makes it redundant.
  const BROADER: Record<string, SuggestionType[]> = {
    hotel: ["city", "state", "admin_region", "country", "macro_region", "region"],
    city: ["state", "admin_region", "country", "macro_region", "region"],
    state: ["admin_region", "country", "macro_region", "region"],
    admin_region: ["country", "region"],
    country: ["region"],
  };

  const hidden = new Set<SuggestionType>();
  if (hasHotel) BROADER.hotel.forEach((t) => hidden.add(t));
  if (hasCity) BROADER.city.forEach((t) => hidden.add(t));
  if (hasState) BROADER.state.forEach((t) => hidden.add(t));
  if (hasAdminRegion) BROADER.admin_region.forEach((t) => hidden.add(t));
  if (hasCountry) BROADER.country.forEach((t) => hidden.add(t));

  return allowedTypes.filter((type) => !hidden.has(type));
}

/* When a chip is added or removed the field focuses its input and submits.
   On the Hotels page that submit can flip Results <-> Featured, and each mode
   renders its own copy of this field — so the copy that had the cursor is
   unmounted and the new one would start unfocused (Ulrik, 2026-09-23). The
   timestamp lets whichever copy mounts next take the cursor back. A copy that
   stays mounted clears it when the new URL arrives, and it expires anyway, so
   a field mounted later for an unrelated reason never steals focus. */
const REFOCUS_WINDOW_MS = 15000;
let refocusRequestedAt = 0;

export default function StructuredDestinationField({
  label,
  placeholder,
  searchParams,
  dataset,
  wrapperClassName = "",
  allowedTypes = ALL_TYPES,
  onStateChange,
  busy = false,
  trailingControl,
  curated,
}: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const suppressNextFocusOpenRef = useRef(false);
  const lastReportedStateRef = useRef<string>("");
  const externalSyncKeyRef = useRef("");

  const [storedTokens, setTokens] = useState<Token[]>(() =>
    buildInitialTokens(searchParams, dataset).filter((t) =>
      allowedTypes.includes(t.type)
    )
  );

  /* The curated token replaces the destination tokens entirely — for display
     AND for the hidden fields below, so an auto-submit while it is showing
     cannot post the page's older city or tags back as a search. Dismissal is
     remembered per answer (`curated.key`). */
  const [dismissedCuratedKey, setDismissedCuratedKey] = useState<string | null>(null);
  const showCurated = Boolean(curated) && dismissedCuratedKey !== curated?.key;
  const tokens = showCurated ? NO_TOKENS : storedTokens;
  const [typedValue, setTypedValue] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (Date.now() - refocusRequestedAt > REFOCUS_WINDOW_MS) return;
    refocusRequestedAt = 0;
    if (!inputRef.current) return;
    suppressNextFocusOpenRef.current = true;
    inputRef.current.focus();
  }, []);

  useEffect(() => {
    const nextExternalKey = getExternalSyncKey(searchParams, allowedTypes);

    if (externalSyncKeyRef.current === nextExternalKey) return;
    externalSyncKeyRef.current = nextExternalKey;
    // Runs after the refocus effect above, so a fresh copy has already used it.
    refocusRequestedAt = 0;

    const nextTokens = buildInitialTokens(searchParams, dataset).filter((t) =>
      allowedTypes.includes(t.type)
    );

    setTokens(nextTokens);

    const q = normalizeParam(searchParams.q).trim();
    const hasStructured =
      normalizeParam(searchParams.city) ||
      normalizeParam(searchParams.state) ||
      normalizeParam(searchParams.admin_region) ||
      normalizeParam(searchParams.country) ||
      normalizeParam(searchParams.macro_region) ||
      normalizeParam(searchParams.region) ||
      listFromParam(searchParams.activities).length > 0 ||
      listFromParam(searchParams.settings).length > 0;

    const hasHotelToken = nextTokens.some((token) => token.type === "hotel");

    setTypedValue(hasStructured || hasHotelToken ? "" : q);
    setOpen(false);
  }, [searchParams, dataset, allowedTypes]);

  const dismissHoverProps = useDropdownDismiss({
    open,
    onClose: () => setOpen(false),
    refs: rootRef,
  });

  const activeHotels = useMemo(() => {
    return dataset.hotels.filter((hotel) => {
      return tokens.every((token) => {
        switch (token.type) {
          case "hotel":
            return hotel.hotel_name === token.value;
          case "city":
            return hotel.city === token.value;
          case "state":
            return hotel.state === token.value;
          case "admin_region":
            return hotel.admin_region === token.value;
          case "country":
            return hotel.country === token.value;
          case "macro_region":
            return hotel.macro_regions.includes(token.value);
          case "region":
            return hotel.region === token.value;
          case "purpose":
            return hotel.activities.includes(token.id ?? token.value);
          case "setting":
            return hotel.settings.includes(token.id ?? token.value);
          default:
            return true;
        }
      });
    });
  }, [dataset.hotels, tokens]);

  useEffect(() => {
    if (!onStateChange) return;

    const selectedValues: Partial<Record<SuggestionType, string[]>> = {};
    tokens.forEach((t) => {
      const bucket = selectedValues[t.type] ?? [];
      if (!bucket.includes(t.value)) bucket.push(t.value);
      selectedValues[t.type] = bucket;
    });

    const nextState = {
      activeHotelCount: activeHotels.length,
      hasSelection: tokens.length > 0,
      selectedTypes: Array.from(new Set(tokens.map((t) => t.type))),
      selectedValues,
    };

    const nextKey = JSON.stringify(nextState);
    if (lastReportedStateRef.current === nextKey) return;

    lastReportedStateRef.current = nextKey;
    onStateChange(nextState);
  }, [activeHotels, onStateChange, tokens]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.hidden) {
        setOpen(false);
        suppressNextFocusOpenRef.current = true;
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const visibleTypes = useMemo(
    () => getVisibleTypes(tokens, allowedTypes),
    [tokens, allowedTypes]
  );

  const minimumCharsReached = typedValue.trim().length >= 2;

  const selectableItems = useMemo(() => {
    const selectedTypes = new Set(tokens.map((token) => token.type));
    const selectedKeys = new Set(
      tokens.map(
        (token) =>
          `${token.type}:${String(token.id ?? token.value).toLowerCase()}`
      )
    );

    const items: SuggestionItem[] = [];

    if (
      visibleTypes.includes("hotel") &&
      !selectedTypes.has("hotel")
    ) {
      items.push(
        ...uniq(activeHotels.map((hotel) => hotel.hotel_name)).map((value) => ({
          type: "hotel" as const,
          label: value,
          value,
        }))
      );
    }

    if (
      visibleTypes.includes("city") &&
      !selectedTypes.has("city")
    ) {
      items.push(
        ...uniq(activeHotels.map((hotel) => hotel.city)).map((value) => ({
          type: "city" as const,
          label: value,
          value,
        }))
      );
    }

    if (
      visibleTypes.includes("state") &&
      !selectedTypes.has("state")
    ) {
      items.push(
        ...uniq(activeHotels.map((hotel) => hotel.state)).map((value) => ({
          type: "state" as const,
          label: value,
          value,
        }))
      );
    }

    if (
      visibleTypes.includes("admin_region") &&
      !selectedTypes.has("admin_region")
    ) {
      items.push(
        ...uniq(activeHotels.map((hotel) => hotel.admin_region)).map((value) => ({
          type: "admin_region" as const,
          label: value,
          value,
        }))
      );
    }

    if (
      visibleTypes.includes("country") &&
      !selectedTypes.has("country")
    ) {
      items.push(
        ...uniq(activeHotels.map((hotel) => hotel.country)).map((value) => ({
          type: "country" as const,
          label: value,
          value,
        }))
      );
    }

    if (
      visibleTypes.includes("macro_region") &&
      !selectedTypes.has("macro_region")
    ) {
      items.push(
        ...uniq(activeHotels.flatMap((hotel) => hotel.macro_regions)).map((value) => ({
          type: "macro_region" as const,
          label: value,
          value,
        }))
      );
    }

    // Traveller names for a stored area — "French Riviera" is the Côte d'Azur.
    // Chosen, it is that area (the same URL a click on Côte d'Azur makes); the
    // id only keeps the two rows distinct in the list.
    if (visibleTypes.includes("state") && !selectedTypes.has("state")) {
      const areas = new Set(activeHotels.map((hotel) => hotel.state));
      items.push(
        ...dataset.areaAliases
          .filter((alias) => areas.has(alias.area))
          .map((alias) => ({
            type: "state" as const,
            label: alias.label,
            value: alias.area,
            id: `alias:${alias.label}`,
          }))
      );
    }

    if (
      visibleTypes.includes("region") &&
      !selectedTypes.has("region")
    ) {
      items.push(
        ...uniq(activeHotels.map((hotel) => hotel.region)).map((value) => ({
          type: "region" as const,
          label: value,
          value,
        }))
      );
    }

    if (visibleTypes.includes("purpose")) {
      const ids = uniq(activeHotels.flatMap((hotel) => hotel.activities));
      items.push(
        ...ids
          .map((id) => {
            const itemLabel = getTaxLabel(dataset.purposes, id);
            return {
              type: "purpose" as const,
              label: itemLabel,
              value: id,
              id,
            };
          })
          .filter((item) => item.label)
      );
    }

    if (visibleTypes.includes("setting")) {
      const ids = uniq(activeHotels.flatMap((hotel) => hotel.settings));
      items.push(
        ...ids
          .map((id) => {
            const itemLabel = getTaxLabel(dataset.settings, id);
            return {
              type: "setting" as const,
              label: itemLabel,
              value: id,
              id,
            };
          })
          .filter((item) => item.label)
      );
    }

    return items.filter((item) => {
      const itemKey = `${item.type}:${String(item.id ?? item.value).toLowerCase()}`;
      return !selectedKeys.has(itemKey);
    });
  }, [
    activeHotels,
    dataset.areaAliases,
    dataset.purposes,
    dataset.settings,
    tokens,
    visibleTypes,
  ]);

  const suggestions = useMemo(() => {
    const q = typedValue.trim();
    return q
      ? selectableItems.filter((item) => matchesWordStart(item.label, q))
      : selectableItems;
  }, [selectableItems, typedValue]);

  /* ENTER TURNS WHAT WAS TYPED INTO A TAG, OR CLEARS IT (Ulrik, 2026-09-15).
     Typing "london" and pressing Enter used to submit the raw text: the page
     did search London, but the box kept a loose word that looked like a filter
     and was not one. Now Enter picks the tag the text names — an exact label,
     accent- and case-blind, in the dropdown's own group order, so "london" is
     the city before anything else called London; failing that, the one
     suggestion left when only one matches — and adds it like a click would.
     Text that names no tag is removed rather than searched. */
  function resolveTypedValue(): SuggestionItem | null {
    const typed = simplifyForMatch(typedValue);
    if (!typed) return null;

    const rank = (item: SuggestionItem) => NARROWEST_FIRST.indexOf(item.type);
    const exact = selectableItems
      .filter((item) => simplifyForMatch(item.label) === typed)
      .sort((a, b) => rank(a) - rank(b));
    if (exact.length) return exact[0];

    const partial = selectableItems.filter((item) => matchesWordStart(item.label, typed));
    return partial.length === 1 ? partial[0] : null;
  }

  /* Within a group: by level (TYPE_RANK), then names the text STARTS — a
     leading "The" ignored, so The Mediterranean starts with "me" — before names
     it starts a later word of (Mexico before New Mexico), then alphabetically.
     A name held at several levels is listed once, at its narrowest. */
  const groupedSuggestions = useMemo(() => {
    const typed = simplifyForMatch(typedValue);
    const startsName = (item: SuggestionItem) =>
      typed && simplifyForMatch(item.label).replace(/^the /, "").startsWith(typed) ? 0 : 1;
    return SUGGESTION_GROUPS.map((group) => {
      const inGroup = suggestions.filter(
        (item) => group.types.includes(item.type) && visibleTypes.includes(item.type)
      );
      const narrowest = new Map<string, SuggestionItem>();
      for (const item of inGroup) {
        const key = simplifyForMatch(item.label);
        const kept = narrowest.get(key);
        if (!kept || NARROWEST_FIRST.indexOf(item.type) < NARROWEST_FIRST.indexOf(kept.type)) {
          narrowest.set(key, item);
        }
      }
      return {
        ...group,
        items: [...narrowest.values()].sort(
          (a, b) =>
            TYPE_RANK.indexOf(a.type) - TYPE_RANK.indexOf(b.type) ||
            startsName(a) - startsName(b) ||
            a.label.localeCompare(b.label)
        ),
      };
    }).filter((group) => group.items.length > 0);
  }, [suggestions, typedValue, visibleTypes]);

  const cityToken = tokens.find((token) => token.type === "city");
  const stateToken = tokens.find((token) => token.type === "state");
  const adminRegionToken = tokens.find((token) => token.type === "admin_region");
  const countryToken = tokens.find((token) => token.type === "country");
  const macroRegionToken = tokens.find((token) => token.type === "macro_region");
  const regionToken = tokens.find((token) => token.type === "region");
  const hotelToken = tokens.find((token) => token.type === "hotel");
  const purposeTokens = tokens.filter((token) => token.type === "purpose");
  const settingTokens = tokens.filter((token) => token.type === "setting");

  const isSingleHotel = tokens.length === 1 && tokens[0].type === "hotel";

  const inputPlaceholder = isSingleHotel
    ? ""
    : tokens.length > 0
    ? helperPrompt(tokens) || placeholder
    : placeholder;

  function submitParentForm() {
    const form = rootRef.current?.closest("form");
    if (form instanceof HTMLFormElement) {
      form.requestSubmit();
    }
  }

  function removeCurated() {
    if (!curated) return;
    suppressNextFocusOpenRef.current = true;
    setDismissedCuratedKey(curated.key);
    setTokens([]);
    setTypedValue("");
    setOpen(false);
    refocusRequestedAt = Date.now();
    inputRef.current?.focus();
    // The page decides what dropping the curated set means (and navigates),
    // so this does not submit the form as removing an ordinary token does.
    curated.onRemove();
  }

  function addToken(item: SuggestionItem) {
    // Choosing a destination while the curated token shows starts an ordinary
    // search from scratch: the page's older tokens are not revived under it.
    const replacingCurated = showCurated;
    if (replacingCurated && curated) setDismissedCuratedKey(curated.key);

    setTokens((stored) => {
      const prev = replacingCurated ? [] : stored;
      const isMulti = item.type === "purpose" || item.type === "setting";

      if (isMulti) {
        const exists = prev.some(
          (token) =>
            token.type === item.type &&
            String(token.id ?? token.value) === String(item.id ?? item.value)
        );

        if (exists) return prev;

        return [
          ...prev,
          {
            type: item.type,
            label: item.label,
            value: item.value,
            id: item.id,
          },
        ];
      }

      const withoutSameType = prev.filter((token) => token.type !== item.type);

      return [
        ...withoutSameType,
        {
          type: item.type,
          label: item.label,
          value: item.value,
          id: item.id,
        },
      ];
    });

    setTypedValue("");
    setOpen(false);
    suppressNextFocusOpenRef.current = true;

    requestAnimationFrame(() => {
      inputRef.current?.focus();
      refocusRequestedAt = Date.now();
      submitParentForm();
    });
  }

  function removeToken(target: Token) {
    suppressNextFocusOpenRef.current = true;

    setTokens((prev) =>
      prev.filter(
        (token) =>
          !(
            token.type === target.type &&
            String(token.id ?? token.value) === String(target.id ?? target.value)
          )
      )
    );

    setTypedValue("");
    setOpen(false);

    requestAnimationFrame(() => {
      inputRef.current?.focus();
      refocusRequestedAt = Date.now();
      submitParentForm();
    });
  }

  return (
    <div
      ref={rootRef}
      className={`${styles.wrapper} ${wrapperClassName}`}
      data-oltra-control="true"
      {...dismissHoverProps}
    >
      <div className="oltra-label">{label}</div>

      <div className={styles.inputWrap}>
        <div
          className={styles.chipInputBox}
          onClick={() => {
            if (!isSingleHotel) inputRef.current?.focus();
          }}
        >
          {showCurated ? (
            <button
              type="button"
              onClick={removeCurated}
              className={styles.tokenPill}
              title={`${CURATED_LABEL} — remove to clear them`}
            >
              <span className={styles.tokenPillLabel}>{CURATED_LABEL}</span>
              <span className={styles.tokenPillClose}>×</span>
            </button>
          ) : null}

          {tokens.map((token) => (
            <button
              key={`${token.type}-${token.id ?? token.value}`}
              type="button"
              onClick={() => removeToken(token)}
              className={styles.tokenPill}
              title={
                isSingleHotel ? token.label : `${typeLabel(token.type)}: ${token.label}`
              }
            >
              <span className={styles.tokenPillLabel}>
                {isSingleHotel ? token.label : `${typeLabel(token.type)}: ${token.label}`}
              </span>
              <span className={styles.tokenPillClose}>×</span>
            </button>
          ))}

          {!isSingleHotel ? (
            <input
              ref={inputRef}
              value={typedValue}
              onChange={(e) => {
                const nextValue = e.target.value;
                setTypedValue(nextValue);
                setOpen(nextValue.trim().length >= 2);
              }}
              onFocus={() => {
                if (suppressNextFocusOpenRef.current) {
                  suppressNextFocusOpenRef.current = false;
                  return;
                }

                if (minimumCharsReached && groupedSuggestions.length > 0) {
                  setOpen(true);
                }
              }}
              onClick={() => {
                if (suppressNextFocusOpenRef.current) {
                  suppressNextFocusOpenRef.current = false;
                  return;
                }

                if (minimumCharsReached && groupedSuggestions.length > 0) {
                  setOpen(true);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  // Never submit the loose text; see resolveTypedValue.
                  event.preventDefault();
                  const match = resolveTypedValue();
                  if (match) {
                    addToken(match);
                  } else {
                    setTypedValue("");
                    setOpen(false);
                  }
                  return;
                }
                if (!open && minimumCharsReached && groupedSuggestions.length > 0) {
                  setOpen(true);
                }
              }}
              placeholder={inputPlaceholder}
              className={styles.chipInputField}
              autoComplete="off"
              spellCheck={false}
              style={busy && !trailingControl ? { paddingRight: 36 } : undefined}
            />
          ) : null}

          {/* Inside the box, at the end of the flex run — so when chips wrap to
              a second line it follows them down rather than floating over
              them. The busy spinner comes with it: the absolutely-positioned
              one below sits exactly where this control now is, and the two
              would overlap. */}
          {trailingControl ? (
            <div className={styles.trailingSlot}>
              {busy ? <OltraSpinner size={14} /> : null}
              {trailingControl}
            </div>
          ) : null}
        </div>

        {busy && !trailingControl ? (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              right: 12,
              top: 17,
              transform: "translateY(-50%)",
              display: "inline-flex",
              alignItems: "center",
              pointerEvents: "none",
            }}
          >
            <OltraSpinner size={14} />
          </span>
        ) : null}

        {open && minimumCharsReached && groupedSuggestions.length > 0 ? (
          <div
            className={`${styles.suggestionPanel} oltra-popup-panel oltra-scrollbar`}
            style={{ maxHeight: "min(680px, calc(100vh - 160px))", overflowY: "auto" }}
          >
            {groupedSuggestions.map((group) => (
              <div
                key={group.key}
                className={`${styles.suggestionGroup} oltra-dropdown-group`}
              >
                <div
                  className={`${styles.suggestionGroupLabel} oltra-dropdown-group-label`}
                >
                  {group.label}
                </div>

                {/* Four rows visible per group (§10), then scroll. */}
                <div
                  className={`oltra-scrollbar ${styles.suggestionList}`}
                  style={{ scrollbarWidth: "thin" }}
                >
                  {group.items.map((item) => (
                    <button
                      key={`${item.type}-${item.id ?? item.value}`}
                      type="button"
                      onClick={() => addToken(item)}
                      className={`${styles.suggestionItem} oltra-dropdown-item w-full text-left`}
                      title={
                        group.key === "geography"
                          ? `${typeLabel(item.type)}: ${item.label}`
                          : item.label
                      }
                    >
                      <span className={styles.suggestionItemLabel}>{item.label}</span>
                      {group.key === "geography" ? (
                        <span className={styles.suggestionItemType}>{typeLabel(item.type)}</span>
                      ) : null}
                    </button>
                  ))}
                </div>                
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <input
        type="hidden"
        name="q"
        value={hotelToken?.value ?? (tokens.length === 0 ? typedValue : "")}
      />
      <input type="hidden" name="city" value={cityToken?.value ?? ""} />
      <input type="hidden" name="state" value={stateToken?.value ?? ""} />
      <input
        type="hidden"
        name="admin_region"
        value={adminRegionToken?.value ?? ""}
      />
      <input type="hidden" name="country" value={countryToken?.value ?? ""} />
      <input type="hidden" name="macro_region" value={macroRegionToken?.value ?? ""} />
      <input type="hidden" name="region" value={regionToken?.value ?? ""} />
      <input
        type="hidden"
        name="activities"
        value={purposeTokens.map((token) => token.id ?? token.value).join(",")}
      />
      <input
        type="hidden"
        name="settings"
        value={settingTokens.map((token) => token.id ?? token.value).join(",")}
      />
      {showCurated && curated?.ids ? (
        <input type="hidden" name="ids" value={curated.ids} />
      ) : null}
    </div>
  );
}