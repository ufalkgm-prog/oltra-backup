"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RESIDENCY_COUNTRIES } from "@/lib/countries";
import { useDropdownDismiss } from "@/lib/useDropdownDismiss";

/* The "Prices assume booking from X. Change" line on the Hotels search form.
 *
 * Deliberately not an OltraSelect: that has no search box, and this list is
 * every country in the world (200 entries), which is unusable as a plain
 * scroll. It is also deliberately understated rather than a labelled form
 * field - residency affects ETG rates by 0-3% at most (measured, see CLAUDE.md
 * §39), so it should read as a correctable assumption, not a prerequisite. */

type Props = {
  value: string;
  onChange: (code: string) => void;
};

export default function ResidencyPicker({ value, onChange }: Props) {
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
    <span ref={rootRef} className="relative inline-block" {...dismissProps}>
      Prices assume booking from {selectedLabel}.{" "}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="underline underline-offset-2 transition-colors hover:text-[color:var(--oltra-text-primary)]"
      >
        Change
      </button>

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
