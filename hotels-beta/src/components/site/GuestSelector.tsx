"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import OltraSelect from "@/components/site/OltraSelect";
import {
  buildGuestSummaryLabel,
  clampAdultsCount,
  clampKidsCount,
  type GuestSelection,
} from "@/lib/guests";
import styles from "./GuestSelector.module.css";

type Props = {
  initialValue: GuestSelection;
  className?: string;
  placeholder?: string;
  onChange?: (selection: GuestSelection) => void;
};

function selectionKey(selection: GuestSelection): string {
  return JSON.stringify({
    adults: selection.adults,
    kids: selection.kids,
    kidAges: selection.kidAges,
  });
}

function ChevronDown() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="pointer-events-none h-3 w-3 shrink-0 opacity-90"
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

export default function GuestSelector({
  initialValue,
  className = "",
  placeholder = "Guests",
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [adults, setAdults] = useState(initialValue.adults);
  const [kids, setKids] = useState(initialValue.kids);
  const [kidAges, setKidAges] = useState<string[]>(initialValue.kidAges);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const lastInitialKeyRef = useRef(selectionKey(initialValue));
  const lastEmittedKeyRef = useRef(selectionKey(initialValue));

  useEffect(() => {
    const nextKey = selectionKey(initialValue);

    if (lastInitialKeyRef.current === nextKey) return;

    lastInitialKeyRef.current = nextKey;
    lastEmittedKeyRef.current = nextKey;

    setAdults(initialValue.adults);
    setKids(initialValue.kids);
    setKidAges(initialValue.kidAges);
  }, [initialValue]);

  useEffect(() => {
    setKidAges((prev) =>
      Array.from({ length: kids }, (_, i) => prev[i] ?? "")
    );
  }, [kids]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleFocusIn(event: FocusEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
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

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("keydown", handleEscape);
    document.addEventListener("pointerover", handlePointerOver);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("pointerover", handlePointerOver);
    };
  }, [open]);

  const currentSelection = useMemo<GuestSelection>(
    () => ({ adults, kids, kidAges }),
    [adults, kids, kidAges]
  );

  useEffect(() => {
    const nextKey = selectionKey(currentSelection);

    if (lastEmittedKeyRef.current === nextKey) return;

    lastEmittedKeyRef.current = nextKey;
    onChange?.(currentSelection);
  }, [currentSelection, onChange]);

  const summaryLabel = useMemo(() => {
    const label = buildGuestSummaryLabel(currentSelection);
    return label || placeholder;
  }, [currentSelection, placeholder]);

  function changeAdults(delta: number) {
    setAdults((prev) => clampAdultsCount(prev + delta));
  }

  function changeKids(delta: number) {
    setKids((prev) => clampKidsCount(prev + delta));
  }

  return (
    <div
      ref={rootRef}
      className={`${styles.root} ${className}`}
      data-oltra-control="true"
    >
      <input type="hidden" name="adults" value={String(adults)} />
      <input type="hidden" name="kids" value={String(kids)} />
      {Array.from({ length: 6 }, (_, idx) => {
        const key = idx + 1;
        return (
          <input
            key={`kid-age-hidden-${key}`}
            type="hidden"
            name={`kid_age_${key}`}
            value={kidAges[idx] ?? ""}
          />
        );
      })}

      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={["oltra-select", styles.trigger].join(" ")}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={styles.triggerText}>{summaryLabel}</span>
        <ChevronDown />
      </button>

      {open ? (
        <div className={`oltra-dropdown-panel ${styles.panel}`}>
          <div className={styles.section}>
            <div className={`oltra-dropdown-list ${styles.counterList}`}>
              <div className={`oltra-dropdown-item ${styles.counterRow}`}>
                <div className={styles.counterLabel}>
                  <div className={styles.counterTitle}>Adults</div>
                  <div className={styles.counterSub}>Age 18+</div>
                </div>

                <div className={styles.counterControls}>
                  <button
                    type="button"
                    className={styles.counterButton}
                    onClick={() => changeAdults(-1)}
                    disabled={adults <= 1}
                    aria-label="Decrease adults"
                  >
                    −
                  </button>
                  <div className={styles.counterValue}>{adults}</div>
                  <button
                    type="button"
                    className={styles.counterButton}
                    onClick={() => changeAdults(1)}
                    disabled={adults >= 8}
                    aria-label="Increase adults"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className={`oltra-dropdown-item ${styles.counterRow}`}>
                <div className={styles.counterLabel}>
                  <div className={styles.counterTitle}>Children</div>
                  <div className={styles.counterSub}>Age 0–17</div>
                </div>

                <div className={styles.counterControls}>
                  <button
                    type="button"
                    className={styles.counterButton}
                    onClick={() => changeKids(-1)}
                    disabled={kids <= 0}
                    aria-label="Decrease children"
                  >
                    −
                  </button>
                  <div className={styles.counterValue}>{kids}</div>
                  <button
                    type="button"
                    className={styles.counterButton}
                    onClick={() => changeKids(1)}
                    disabled={kids >= 6}
                    aria-label="Increase children"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {kids > 0 ? (
              <div className={styles.agesBlock}>
                <div className="oltra-dropdown-group-label">Children’s ages</div>

                <div className={styles.agesGrid}>
                  {Array.from({ length: kids }, (_, idx) => (
                    <div key={`kid-age-${idx + 1}`} className={styles.ageItem}>
                      <OltraSelect
                        name={`kid_age_visible_${idx + 1}`}
                        value={kidAges[idx] ?? ""}
                        placeholder="Age"
                        align="left"
                        onValueChange={(value) => {
                          setKidAges((prev) => {
                            const next = [...prev];
                            next[idx] = value;
                            return next;
                          });
                        }}
                        options={Array.from({ length: 18 }, (_, n) => ({
                          value: String(n),
                          label: String(n),
                        }))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}