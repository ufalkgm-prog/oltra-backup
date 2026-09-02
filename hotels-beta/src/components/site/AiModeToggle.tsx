"use client";

import styles from "./AiModeToggle.module.css";

/* The mode toggle: Classic search / AI mode.
 *
 * Two segments, both always visible, the current one filled — the same shape
 * as the Inspire map's C/F switch, so the site has one segmented-control idiom.
 * Its text matches the Hotels/Flights checkbox labels it sits beside.
 *
 * It replaced a single "Ask AI" mark that lived inside the destination field.
 * That worked as a way *in*, but in AI mode the same mark was the only way out
 * and read as the thing that had got you there — nothing said what pressing it
 * would do, or that you were in a mode at all. */

type Props = {
  /** True when AI mode is active. */
  active: boolean;
  onToggle: (next: boolean) => void;
};

export default function AiModeToggle({ active, onToggle }: Props) {
  return (
    <div className={styles.toggle} role="group" aria-label="Search mode">
      <button
        type="button"
        aria-pressed={!active}
        className={`${styles.segment} ${!active ? styles.segmentActive : ""}`}
        onClick={() => onToggle(false)}
      >
        Classic search
      </button>
      <button
        type="button"
        aria-pressed={active}
        className={`${styles.segment} ${active ? styles.segmentActive : ""}`}
        onClick={() => onToggle(true)}
      >
        AI mode
      </button>
    </div>
  );
}
