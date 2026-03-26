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
};

export default function GuestSelector({
  initialValue,
  className = "",
  placeholder = "Guests",
}: Props) {
  const [open, setOpen] = useState(false);
  const [adults, setAdults] = useState(initialValue.adults);
  const [kids, setKids] = useState(initialValue.kids);
  const [kidAges, setKidAges] = useState<string[]>(initialValue.kidAges);

  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
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

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const summaryLabel = useMemo(() => {
    const selection: GuestSelection = { adults, kids, kidAges };
    const label = buildGuestSummaryLabel(selection);
    return label || placeholder;
  }, [adults, kids, kidAges, placeholder]);

  function changeAdults(delta: number) {
    setAdults((prev) => clampAdultsCount(prev + delta));
  }

  function changeKids(delta: number) {
    setKids((prev) => clampKidsCount(prev + delta));
  }

  return (
    <div ref={rootRef} className={`${styles.root} ${className}`}>
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