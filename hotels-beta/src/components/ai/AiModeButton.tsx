"use client";

import { useAiSearch } from "@/lib/ai/aiSearchStore";
import { AI_CHAT_ENABLED } from "@/lib/ai/routes";
import styles from "./AiModeButton.module.css";

/* The way in. There is no way out here — the modal owns Exit.
 *
 * This replaced a two-segment Classic search / AI mode toggle. A toggle made
 * sense when AI mode replaced the page beneath it; now the concierge opens
 * over the page and closes again, so the page is never in a "mode" and there
 * is nothing to switch back to.
 *
 * Two placements, one component:
 *  - `inline` sits at the right-hand end of the destination field, on the
 *    landing and Hotels pages, where that field is the main input.
 *  - `corner` sits top-right inside the search frame on Flights, Restaurants
 *    and Inspire, which have no single input box to sit inside.
 *
 * It renders nothing when the flag is off, so a disabled feature leaves no
 * trace on any page. */

type Props = {
  placement: "inline" | "corner";
  /** Overrides the label where a page needs a shorter one. */
  label?: string;
};

export default function AiModeButton({ placement, label = "AI mode" }: Props) {
  const { conciergeOpen, setConciergeOpen } = useAiSearch();

  if (!AI_CHAT_ENABLED) return null;

  const button = (
    <button
      type="button"
      // Inside a <form> on the landing and Hotels pages, so the type matters:
      // a default-type button there submits the search on click.
      className={`oltra-btn oltra-btn--ai ${
        placement === "corner" ? styles.corner : styles.inline
      }`}
      aria-haspopup="dialog"
      aria-expanded={conciergeOpen}
      onClick={(event) => {
        // The inline placement sits inside the destination field's click-to-
        // focus box; without this, opening the concierge also opens the
        // suggestions dropdown behind it.
        event.preventDefault();
        event.stopPropagation();
        setConciergeOpen(true);
      }}
    >
      {label}
    </button>
  );

  if (placement === "corner") {
    return <div className={styles.cornerRow}>{button}</div>;
  }

  return button;
}
