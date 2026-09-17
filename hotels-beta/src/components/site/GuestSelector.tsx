"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import OltraSelect from "@/components/site/OltraSelect";
import ResidencyPicker from "@/components/site/ResidencyPicker";
import {
  clampAdultsCount,
  clampKidsCount,
  CHILD_AGE_MISSING_MESSAGE,
  guestSelectionIssue,
  maxAdultsFor,
  maxKidsFor,
  OCCUPANCY_LIMIT_MESSAGE,
  type GuestSelection,
} from "@/lib/guests";
import { useDropdownDismiss } from "@/lib/useDropdownDismiss";
import styles from "./GuestSelector.module.css";

type Props = {
  initialValue: GuestSelection;
  className?: string;
  placeholder?: string;
  onChange?: (selection: GuestSelection) => void;
  defaultOpen?: boolean;
  /* Hotel searches only. With `rooms`, the steppers stop at ETG's per-room
     occupancy limit (§32); with `residency`, the panel asks for the guests'
     passport country. Flights passes neither and is unchanged. */
  rooms?: number;
  residency?: { value: string; onChange: (code: string) => void };
  /* Which edge of the field the panel lines up with. "right" opens it leftwards,
     for a field near the right edge of its frame (the Hotels page). */
  align?: "left" | "right";
};

/* One age slot per child, whatever the array held. The ages array is resized a
 * render after the count changes, so the same selection could key two ways in
 * between — {2 kids, no ages} and {2 kids, two blank ages} — and a key that
 * depends on that timing cannot tell a real change from a resize. */
function selectionKey(selection: GuestSelection): string {
  return JSON.stringify({
    adults: selection.adults,
    kids: selection.kids,
    kidAges: Array.from({ length: selection.kids }, (_, i) => selection.kidAges[i] ?? ""),
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
  defaultOpen = false,
  rooms,
  residency,
  align = "left",
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
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
  /* The value the parent just handed down, until this component's own state has
     caught up with it. See the emit effect below. */
  const pendingSyncKeyRef = useRef<string | null>(null);
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
    pendingSyncKeyRef.current = initialValueKey;

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

  const dismissHoverProps = useDropdownDismiss({
    open,
    onClose: () => setOpen(false),
    refs: rootRef,
  });


  const currentSelection = useMemo<GuestSelection>(
    () => ({ adults, kids, kidAges }),
    [adults, kids, kidAges]
  );

  useEffect(() => {
    const nextKey = selectionKey(currentSelection);

    /* NEVER REPORT THE STATE A SYNC IS REPLACING (2026-09-15). The sync above
       and this effect run in the same commit, before the synced state renders,
       so this one saw the OLD selection, found it different from the key the
       sync had just recorded, and sent it back up to the parent. The parent
       then handed that down, the next sync emitted the value before it, and
       the two alternated for ever — the landing page froze the moment a
       concierge answer's party differed from the one its saved search
       restored. Wait for the synced value to render, then carry on. */
    if (pendingSyncKeyRef.current !== null) {
      if (nextKey !== pendingSyncKeyRef.current) return;
      pendingSyncKeyRef.current = null;
    }

    if (lastEmittedKeyRef.current === nextKey) return;

    lastEmittedKeyRef.current = nextKey;
    onChangeRef.current?.(currentSelection);
  }, [currentSelection]);

  const summaryLabel = useMemo(() => {
    if (currentSelection.adults === 0 && currentSelection.kids === 0) return placeholder;
    if (currentSelection.kids > 0) return `${currentSelection.adults}+${currentSelection.kids}`;
    return String(currentSelection.adults);
  }, [currentSelection, placeholder]);

  const adultsMax = rooms != null ? maxAdultsFor(rooms) : 8;
  const kidsMax = rooms != null ? maxKidsFor(rooms) : 6;
  // The room limit, not the general 8/6 cap, is what stopped the stepper.
  const atRoomLimit =
    rooms != null && ((adults >= adultsMax && adultsMax < 8) || (kids >= kidsMax && kidsMax < 6));

  const issue = guestSelectionIssue(currentSelection, rooms);

  function changeAdults(delta: number) {
    setAdults((prev) => Math.min(adultsMax, clampAdultsCount(prev + delta)));
  }

  function changeKids(delta: number) {
    setKids((prev) => Math.min(kidsMax, clampKidsCount(prev + delta)));
  }

  return (
    <div
      ref={rootRef}
      className={`${styles.root} ${className}`}
      data-oltra-control="true"
      {...dismissHoverProps}
    >
      <input type="hidden" name="adults" value={String(adults)} />
      <input type="hidden" name="kids" value={String(kids)} />
      {residency ? <input type="hidden" name="residency" value={residency.value} /> : null}

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
        <div
          className={`oltra-dropdown-panel ${styles.panel} ${align === "right" ? styles.panelAlignRight : ""}`}
        >
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
                    disabled={adults >= adultsMax}
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
                    disabled={kids >= kidsMax}
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

                {issue === CHILD_AGE_MISSING_MESSAGE ? (
                  <div className={styles.helper} role="status">
                    {CHILD_AGE_MISSING_MESSAGE}
                  </div>
                ) : null}
              </div>
            ) : null}

            {atRoomLimit || issue === OCCUPANCY_LIMIT_MESSAGE ? (
              <div
                className={issue === OCCUPANCY_LIMIT_MESSAGE ? styles.issue : styles.helper}
                role="status"
              >
                {OCCUPANCY_LIMIT_MESSAGE}
              </div>
            ) : null}

            {residency ? (
              <div className={styles.agesBlock}>
                <div className="oltra-dropdown-group-label">Passport country</div>
                <ResidencyPicker
                  variant="field"
                  value={residency.value}
                  onChange={residency.onChange}
                />
                <div className={styles.helper}>
                  Prices can vary by the guests&rsquo; passport country.
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : issue ? (
        // Closed, the reason still shows under the field, so a search that
        // will not run says why without the panel having to be reopened.
        <div
          className={
            issue === CHILD_AGE_MISSING_MESSAGE
              ? `${styles.issue} ${styles.issueOneLine}`
              : styles.issue
          }
          role="status"
        >
          {issue}
        </div>
      ) : null}
    </div>
  );
}