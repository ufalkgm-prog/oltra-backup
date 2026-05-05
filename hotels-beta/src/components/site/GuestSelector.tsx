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
  const [kidAges, setKidAges] = useState<string[]>(
    Array.from(
      { length: initialValue.kids },
      (_, index) => initialValue.kidAges[index] ?? ""
    )
  );

  const rootRef = useRef<HTMLDivElement | null>(null);
  const lastInitialKeyRef = useRef(selectionKey(initialValue));
  const lastEmittedKeyRef = useRef(selectionKey(initialValue));
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const initialValueKey = useMemo(
    () => selectionKey(initialValue),
    [initialValue]
  );

  useEffect(() => {
    if (lastInitialKeyRef.current === initialValueKey) return;

    lastInitialKeyRef.current = initialValueKey;
    lastEmittedKeyRef.current = initialValueKey;

    setAdults(initialValue.adults);
    setKids(initialValue.kids);
    setKidAges(
      Array.from(
        { length: initialValue.kids },
        (_, index) => initialValue.kidAges[index] ?? ""
      )
    );
  }, [initialValueKey, initialValue.adults, initialValue.kids, initialValue.kidAges]);

  useEffect(() => {
    setKidAges((prev) => {
      const next = Array.from({ length: kids }, (_, index) => prev[index] ?? "");

      return selectionKey({ adults, kids, kidAges: prev }) ===
        selectionKey({ adults, kids, kidAges: next })
        ? prev
        : next;
    });
  }, [adults, kids]);

  useEffect(() => {
    function handleMouseDown(event: MouseEvent) {
      if (!rootRef.current) return;

      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  
  const currentSelection = useMemo<GuestSelection>(
    () => ({ adults, kids, kidAges }),
    [adults, kids, kidAges]
  );

  useEffect(() => {
    const nextKey = selectionKey(currentSelection);

    if (lastEmittedKeyRef.current === nextKey) return;

    lastEmittedKeyRef.current = nextKey;
    onChangeRef.current?.(currentSelection);
  }, [currentSelection]);

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

      {Array.from({ length: 6 }, (_, index) => {
        const key = index + 1;

        return (
          <input
            key={`kid-age-hidden-${key}`}
            type="hidden"
            name={`kid_age_${key}`}
            value={kidAges[index] ?? ""}
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
                  {Array.from({ length: kids }, (_, index) => (
                    <div
                      key={`kid-age-${index + 1}`}
                      className={styles.ageItem}
                    >
                      <OltraSelect
                        name={`kid_age_visible_${index + 1}`}
                        value={kidAges[index] ?? ""}
                        placeholder="Age"
                        align="left"
                        closeOnHoverOutside={false}
                        closeOnFocusOutside={false}
                        onValueChange={(value) => {
                          setKidAges((prev) => {
                            const next = [...prev];
                            next[index] = value;
                            return next;
                          });
                        }}
                        options={Array.from({ length: 18 }, (_, age) => ({
                          value: String(age),
                          label: String(age),
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