"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RESIDENCY_COUNTRIES } from "@/lib/countries";
import { useDropdownDismiss } from "@/lib/useDropdownDismiss";

/* The guests' passport country ("residency" in ETG's API).
 *
 * Deliberately not an OltraSelect: that has no search box, and this list is
 * every country in the world (200 entries), which is unusable as a plain
 * scroll.
 *
 * Two looks. `field` is the labelled control inside the guest selector — ETG's
 * certification runs a mandatory test case for a specific citizenship, so a
 * tester must be able to choose one without editing the URL (§32). `inline` is
 * the older understated "Prices assume booking from X. Change" sentence, kept
 * for any caller that wants the assumption stated rather than asked. */

type Props = {
  value: string;
  onChange: (code: string) => void;
  variant?: "inline" | "field";
};

function ChevronDown() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="pointer-events-none h-3 w-3 shrink-0 opacity-90">
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

export default function ResidencyPicker({ value, onChange, variant = "inline" }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const dismissProps = useDropdownDismiss({
    open,
    onClose: () => setOpen(false),
    refs: rootRef,
    // A search panel must not close because the pointer drifted off it while
    // the user is typing.
    closeOnHoverOutside: false,
  });

  const selectedLabel =
    RESIDENCY_COUNTRIES.find((c) => c.code === value)?.label ?? value;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return RESIDENCY_COUNTRIES;
    // Name first, then code, so typing "de" puts Germany above Denmark's
    // neighbours rather than burying it among substring hits.
    return RESIDENCY_COUNTRIES.filter(
      (c) => c.label.toLowerCase().includes(q) || c.code === q
    ).sort((a, b) => {
      const aStarts = a.label.toLowerCase().startsWith(q) ? 0 : 1;
      const bStarts = b.label.toLowerCase().startsWith(q) ? 0 : 1;
      return aStarts - bStarts || a.label.localeCompare(b.label);
    });
  }, [query]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else setQuery("");
  }, [open]);

  function select(code: string) {
    onChange(code);
    setOpen(false);
  }

  return (
    <span
      ref={rootRef}
      className={variant === "field" ? "relative block" : "relative inline-block"}
      {...dismissProps}
    >
      {variant === "field" ? (
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="oltra-select flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left"
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className="truncate">{value ? selectedLabel : "Choose a country"}</span>
          <ChevronDown />
        </button>
      ) : (
        <>
          Prices assume booking from {selectedLabel}.{" "}
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            className="underline underline-offset-2 transition-colors hover:text-[color:var(--oltra-text-primary)]"
          >
            Change
          </button>
        </>
      )}

      {open ? (
        <div className="oltra-popup-panel absolute left-0 top-full z-50 mt-2 w-[260px]">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              // This panel renders inside the Hotels search <form>, whose own
              // onChange marks the availability search dirty. Without this,
              // typing a country name reset every result card to "Select
              // dates" - searching the list is not editing the search.
              e.stopPropagation();
              setQuery(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && matches.length) {
                e.preventDefault();
                select(matches[0].code);
              }
            }}
            placeholder="Search countries"
            className="oltra-input"
            aria-label="Search countries"
          />

          <div className="oltra-dropdown-list mt-2">
            {matches.length ? (
              matches.map((country) => (
                <button
                  key={country.code}
                  type="button"
                  onClick={() => select(country.code)}
                  className="oltra-dropdown-item"
                  aria-current={country.code === value ? "true" : undefined}
                >
                  {country.label}
                </button>
              ))
            ) : (
              <div className="px-2 py-1 text-[12px] text-[color:var(--oltra-text-muted)]">
                No matching country.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </span>
  );
}
