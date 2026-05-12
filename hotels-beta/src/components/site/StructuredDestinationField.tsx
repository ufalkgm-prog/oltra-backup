"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import OltraSpinner from "./OltraSpinner";
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
};

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

  const city = normalizeParam(searchParams.city);
  if (city) out.push({ type: "city", label: city, value: city });

  const country = normalizeParam(searchParams.country);
  if (country) out.push({ type: "country", label: country, value: country });

  const region = normalizeParam(searchParams.region);
  if (region) out.push({ type: "region", label: region, value: region });

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
  if (last.type === "country") return "Add city or purpose";
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
    case "country":
      return "Country";
    case "region":
      return "Region";
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
  "country",
  "region",
  "purpose",
  "setting",
];

const GROUP_ORDER: SuggestionType[] = [
  "hotel",
  "city",
  "country",
  "region",
  "purpose",
  "setting",
];

function getExternalSyncKey(
  searchParams: SearchParams,
  allowedTypes: SuggestionType[]
): string {
  return JSON.stringify({
    q: normalizeParam(searchParams.q),
    city: normalizeParam(searchParams.city),
    country: normalizeParam(searchParams.country),
    region: normalizeParam(searchParams.region),
    activities: listFromParam(searchParams.activities),
    settings: listFromParam(searchParams.settings),
    allowedTypes,
  });
}

function getVisibleTypes(tokens: Token[], allowedTypes: SuggestionType[]) {
  const hasHotel = tokens.some((token) => token.type === "hotel");
  const hasCity = tokens.some((token) => token.type === "city");
  const hasCountry = tokens.some((token) => token.type === "country");

  return allowedTypes.filter((type) => {
    if (hasHotel && (type === "city" || type === "country" || type === "region")) {
      return false;
    }

    if (hasCity && (type === "country" || type === "region")) {
      return false;
    }

    if (hasCountry && type === "region") {
      return false;
    }

    return true;
  });
}

export default function StructuredDestinationField({
  label,
  placeholder,
  searchParams,
  dataset,
  wrapperClassName = "",
  allowedTypes = ALL_TYPES,
  onStateChange,
  busy = false,
}: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const suppressNextFocusOpenRef = useRef(false);
  const lastReportedStateRef = useRef<string>("");
  const externalSyncKeyRef = useRef("");

  const [tokens, setTokens] = useState<Token[]>(() =>
    buildInitialTokens(searchParams, dataset).filter((t) =>
      allowedTypes.includes(t.type)
    )
  );
  const [typedValue, setTypedValue] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const nextExternalKey = getExternalSyncKey(searchParams, allowedTypes);

    if (externalSyncKeyRef.current === nextExternalKey) return;
    externalSyncKeyRef.current = nextExternalKey;

    const nextTokens = buildInitialTokens(searchParams, dataset).filter((t) =>
      allowedTypes.includes(t.type)
    );

    setTokens(nextTokens);

    const q = normalizeParam(searchParams.q).trim();
    const hasStructured =
      normalizeParam(searchParams.city) ||
      normalizeParam(searchParams.country) ||
      normalizeParam(searchParams.region) ||
      listFromParam(searchParams.activities).length > 0 ||
      listFromParam(searchParams.settings).length > 0;

    const hasHotelToken = nextTokens.some((token) => token.type === "hotel");

    setTypedValue(hasStructured || hasHotelToken ? "" : q);
    setOpen(false);
  }, [searchParams, dataset, allowedTypes]);

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

  useEffect(() => {
    function handleFocusIn(event: FocusEvent) {
      const target = event.target as Node | null;
      if (!rootRef.current?.contains(target)) {
        setOpen(false);
      }
    }

    function handleMouseDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!rootRef.current?.contains(target)) {
        setOpen(false);
      }
    }

    function handlePointerOver(event: PointerEvent) {
      if (!open) return;

      const target = event.target as HTMLElement | null;
      if (!target) return;

      if (rootRef.current?.contains(target)) return;

      const hoveredInteractive = target.closest(
        'input, button, select, textarea, [role="button"], [data-oltra-control="true"]'
      );

      if (hoveredInteractive) {
        setOpen(false);
      }
    }

    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("pointerover", handlePointerOver);

    return () => {
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("pointerover", handlePointerOver);
    };
  }, [open]);

  const activeHotels = useMemo(() => {
    return dataset.hotels.filter((hotel) => {
      return tokens.every((token) => {
        switch (token.type) {
          case "hotel":
            return hotel.hotel_name === token.value;
          case "city":
            return hotel.city === token.value;
          case "country":
            return hotel.country === token.value;
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

  const suggestions = useMemo(() => {
    const q = typedValue.trim().toLowerCase();

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

    return items
      .filter((item) => {
        const itemKey = `${item.type}:${String(item.id ?? item.value).toLowerCase()}`;
        return !selectedKeys.has(itemKey);
      })
      .filter((item) => (q ? item.label.toLowerCase().includes(q) : true));
  }, [
    activeHotels,
    dataset.purposes,
    dataset.settings,
    tokens,
    typedValue,
    visibleTypes,
  ]);

  const groupedSuggestions = useMemo(() => {
    return GROUP_ORDER
      .filter((type) => visibleTypes.includes(type))
      .map((type) => ({
        type,
        items: suggestions.filter((item) => item.type === type),
      }))
      .filter((group) => group.items.length > 0);
  }, [suggestions, visibleTypes]);

  const cityToken = tokens.find((token) => token.type === "city");
  const countryToken = tokens.find((token) => token.type === "country");
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

  function addToken(item: SuggestionItem) {
    setTokens((prev) => {
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
      submitParentForm();
    });
  }

  return (
    <div ref={rootRef} className={`${styles.wrapper} ${wrapperClassName}`}>
      <div className="oltra-label">{label}</div>

      <div className={styles.inputWrap}>
        {isSingleHotel && hotelToken ? (
          <div className={`oltra-input w-full ${styles.inlineHotelChipWrap}`}>
            <button
              type="button"
              onClick={() => removeToken(hotelToken)}
              className={styles.tokenPill}
              title={`Hotel: ${hotelToken.label}`}
            >
              <span className={styles.tokenPillLabel}>{hotelToken.label}</span>
              <span className={styles.tokenPillClose}>×</span>
            </button>
          </div>
        ) : null}

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
          onKeyDown={() => {
            if (!open && minimumCharsReached && groupedSuggestions.length > 0) {
              setOpen(true);
            }
          }}
          placeholder={inputPlaceholder}
          className="oltra-input w-full"
          autoComplete="off"
          spellCheck={false}
          style={{
            ...(busy ? { paddingRight: 36 } : null),
            ...(isSingleHotel ? { display: "none" } : null),
          }}
        />

        {busy ? (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              right: 12,
              top: "50%",
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
                key={group.type}
                className={`${styles.suggestionGroup} oltra-dropdown-group`}
              >
                <div
                  className={`${styles.suggestionGroupLabel} oltra-dropdown-group-label`}
                >
                  {typeLabel(group.type)}
                </div>

                <div
                  className="oltra-scrollbar flex max-h-[112px] flex-col gap-1 overflow-y-auto pr-1"
                  style={{ scrollbarWidth: "thin" }}
                >
                  {group.items.map((item) => (
                    <button
                      key={`${item.type}-${item.id ?? item.value}`}
                      type="button"
                      onClick={() => addToken(item)}
                      className={`${styles.suggestionItem} oltra-dropdown-item w-full text-left`}
                      title={item.label}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>                
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {tokens.length > 0 && !isSingleHotel ? (
        <div className={styles.tokenRow}>
          {tokens.map((token) => (
            <button
              key={`${token.type}-${token.id ?? token.value}`}
              type="button"
              onClick={() => removeToken(token)}
              className={styles.tokenPill}
              title={`${typeLabel(token.type)}: ${token.label}`}
            >
              <span className={styles.tokenPillLabel}>
                {typeLabel(token.type)}: {token.label}
              </span>
              <span className={styles.tokenPillClose}>×</span>
            </button>
          ))}
        </div>
      ) : null}

      <input
        type="hidden"
        name="q"
        value={hotelToken?.value ?? (tokens.length === 0 ? typedValue : "")}
      />
      <input type="hidden" name="city" value={cityToken?.value ?? ""} />
      <input type="hidden" name="country" value={countryToken?.value ?? ""} />
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
    </div>
  );
}