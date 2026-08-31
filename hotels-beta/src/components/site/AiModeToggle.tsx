"use client";

import styles from "./AiModeToggle.module.css";

/* The mode mark: a small italic "AI" sitting at the right edge of the
 * destination field.
 *
 * It is rendered by the landing page's own wrapper, not by
 * StructuredDestinationField — that component is shared with the Hotels page,
 * which must not grow a toggle. Nothing here knows about the field it sits
 * over; positioning is the wrapper's job. */

type Props = {
  active: boolean;
  onToggle: (next: boolean) => void;
};

export default function AiModeToggle({ active, onToggle }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label={active ? "Switch back to search" : "Ask the concierge"}
      title={active ? "Back to search" : "Ask the concierge"}
      className={`${styles.mark} ${active ? styles.markActive : ""}`}
      onClick={() => onToggle(!active)}
    >
      <span className={styles.glyph}>AI</span>
    </button>
  );
}
