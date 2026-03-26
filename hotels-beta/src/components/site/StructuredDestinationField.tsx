"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
};

type Props = {
  label: string;
  placeholder: string;
  searchParams: SearchParams;
  dataset: HotelSuggestionDataset;
  wrapperClassName?: string;
  allowedTypes?: SuggestionType[];
  onStateChange?: (state: StructuredDestinationState) => void;
};

function normalizeParam(v: string | string[] | undefined): string {
  if (!v) return "";
  return Array.isArray(v) ? v[0] ?? "" : v;
}

function getTaxLabel(
  list: Array<{ id: string; label: string }>,
  id: string
): string {
  return list.find((item) => item.id === id)?.label ?? id;
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

  const activityId = normalizeParam(searchParams.activities);
  if (activityId) {
    out.push({
      type: "purpose",
      label: getTaxLabel(dataset.purposes, activityId),
      value: activityId,
      id: activityId,
    });
  }

  const settingId = normalizeParam(searchParams.settings);
  if (settingId) {
    out.push({
      type: "setting",
      label: getTaxLabel(dataset.settings, settingId),
      value: settingId,
      id: settingId,
    });
  }

  const q = normalizeParam(searchParams.q);
  const hasStructured =
    city || country || region || activityId || settingId;

  if (q && !hasStructured) {
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

function getExternalSyncKey(
  searchParams: SearchParams,
  allowedTypes: SuggestionType[]
): string {
  return JSON.stringify({
    q: normalizeParam(searchParams.q),
    city: normalizeParam(searchParams.city),
    country: normalizeParam(searchParams.country),
    region: normalizeParam(searchParams.region),
    activities: normalizeParam(searchParams.activities),
    settings: normalizeParam(searchParams.settings),
    allowedTypes,
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
      normalizeParam(searchParams.activities) ||
      normalizeParam(searchParams.settings);

    setTypedValue(hasStructured ? "" : q);
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

      // ignore if still inside destination field
      if (rootRef.current?.contains(target)) return;

      // ONLY close if hovering another interactive control
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

    const nextState = {
      activeHotelCount: activeHotels.length,
      hasSelection: tokens.length > 0,
      selectedTypes: tokens.map((t) => t.type),
    };

    const nextKey = JSON.stringify(nextState);
    if (lastReportedStateRef.current === nextKey) return;

    lastReportedStateRef.current = nextKey;
    onStateChange(nextState);
  }, [activeHotels, onStateChange, tokens]);

  const suggestions = useMemo(() => {
    const q = typedValue.trim().toLowerCase();

    const selectedTypes = new Set(tokens.map((token) => token.type));
    const selectedKeys = new Set(
      tokens.map((token) => `${token.type}:${token.value.toLowerCase()}`)
    );

    const items: SuggestionItem[] = [];

    if (allowedTypes.includes("hotel") && !selectedTypes.has("hotel")) {
      items.push(
        ...uniq(activeHotels.map((hotel) => hotel.hotel_name)).map((value) => ({
          type: "hotel" as const,
          label: value,
          value,
        }))
      );
    }

    if (allowedTypes.includes("city") && !selectedTypes.has("city")) {
      items.push(
        ...uniq(activeHotels.map((hotel) => hotel.city)).map((value) => ({
          type: "city" as const,
          label: value,
          value,
        }))
      );
    }

    if (allowedTypes.includes("country") && !selectedTypes.has("country")) {
      items.push(
        ...uniq(activeHotels.map((hotel) => hotel.country)).map((value) => ({
          type: "country" as const,
          label: value,
          value,
        }))
      );
    }

    if (allowedTypes.includes("region") && !selectedTypes.has("region")) {
      items.push(
        ...uniq(activeHotels.map((hotel) => hotel.region)).map((value) => ({
          type: "region" as const,
          label: value,
          value,
        }))
      );
    }

    if (allowedTypes.includes("purpose") && !selectedTypes.has("purpose")) {
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

    if (allowedTypes.includes("setting") && !selectedTypes.has("setting")) {
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
      .filter((item) => !selectedKeys.has(`${item.type}:${item.value.toLowerCase()}`))
      .filter((item) => (q ? item.label.toLowerCase().includes(q) : true));
  }, [activeHotels, dataset.purposes, dataset.settings, tokens, typedValue, allowedTypes]);

  const groupedSuggestions = useMemo(() => {
    const order: SuggestionType[] = [
      "hotel",
      "city",
      "country",
      "region",
      "purpose",
      "setting",
    ];

    return order
      .filter((type) => allowedTypes.includes(type))
      .map((type) => ({
        type,
        items: suggestions.filter((item) => item.type === type).slice(0, 50),
      }))
      .filter((group) => group.items.length > 0);
  }, [suggestions, allowedTypes]);

  const cityToken = tokens.find((token) => token.type === "city");
  const countryToken = tokens.find((token) => token.type === "country");
  const regionToken = tokens.find((token) => token.type === "region");
  const purposeToken = tokens.find((token) => token.type === "purpose");
  const settingToken = tokens.find((token) => token.type === "setting");
  const hotelToken = tokens.find((token) => token.type === "hotel");

  const inputPlaceholder =
    tokens.length > 0 ? helperPrompt(tokens) || placeholder : placeholder;

function addToken(item: SuggestionItem) {
  setTokens((prev) => {
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
  });
}

function removeToken(type: SuggestionType) {
  suppressNextFocusOpenRef.current = true;
  setTokens((prev) => prev.filter((token) => token.type !== type));
  setOpen(false);

  requestAnimationFrame(() => {
    inputRef.current?.focus();
  });
}

  return (
    <div ref={rootRef} className={`${styles.wrapper} ${wrapperClassName}`}>
      <div className="oltra-label mb-2">{label}</div>

      <div className={styles.inputWrap}>
        <input
          ref={inputRef}
          value={typedValue}
          onChange={(e) => {
            setTypedValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (suppressNextFocusOpenRef.current) {
              suppressNextFocusOpenRef.current = false;
              return;
            }

            if (groupedSuggestions.length > 0) setOpen(true);
          }}
          onClick={() => {
            if (suppressNextFocusOpenRef.current) {
              suppressNextFocusOpenRef.current = false;
              return;
            }

            if (groupedSuggestions.length > 0) setOpen(true);
          }}
          onKeyDown={() => {
            if (!open && groupedSuggestions.length > 0) {
              setOpen(true);
            }
          }}
          placeholder={inputPlaceholder}
          className="oltra-input w-full"
          autoComplete="off"
          spellCheck={false}
        />

        {open && groupedSuggestions.length > 0 ? (
          <div className={`${styles.suggestionPanel} oltra-dropdown-panel`}>
            {groupedSuggestions.map((group) => (
              <div key={group.type} className={`${styles.suggestionGroup} oltra-dropdown-group`}>
                <div className={`${styles.suggestionGroupLabel} oltra-dropdown-group-label`}>
                  {typeLabel(group.type)}
                </div>

                <div className={styles.suggestionList}>
                  {group.items.map((item) => (
                    <button
                      key={`${item.type}-${item.value}`}
                      type="button"
                      onClick={() => addToken(item)}
                      className={`${styles.suggestionItem} oltra-dropdown-item`}
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

      {tokens.length > 0 ? (
        <div className={styles.tokenRow}>
          {tokens.map((token) => (
            <button
              key={`${token.type}-${token.value}`}
              type="button"
              onClick={() => removeToken(token.type)}
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
      <input type="hidden" name="activities" value={purposeToken?.id ?? ""} />
      <input type="hidden" name="settings" value={settingToken?.id ?? ""} />
    </div>
  );
}