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
 *  - `header` sits first in the site header's navigation, on every page — the
 *    way in everywhere since 2026-09-15, when it left the pages' own search
 *    frames.
 *  - `inline` sits at the right-hand end of the landing page's destination
 *    field, the one search box that kept it.
 *
 * It renders nothing when the flag is off, so a disabled feature leaves no
 * trace on any page. */

type Props = {
  placement: "inline" | "header";
  /** Overrides the label where a page needs a shorter one. */
  label?: string;
};

export default function AiModeButton({ placement, label = "Ask AI" }: Props) {
  const { conciergeOpen, setConciergeOpen } = useAiSearch();

  if (!AI_CHAT_ENABLED) return null;

  const button = (
    <button
      type="button"
      // Inside a <form> on the landing and Hotels pages, so the type matters:
      // a default-type button there submits the search on click.
      className={`oltra-btn oltra-btn--ai ${
        placement === "header" ? styles.header : styles.inline
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

  return button;
}
