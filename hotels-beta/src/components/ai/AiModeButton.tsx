"use client";

import { useAiSearch } from "@/lib/ai/aiSearchStore";
import { AI_CHAT_ENABLED } from "@/lib/ai/routes";
import { useIsMember } from "@/lib/members/useIsMember";
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
 *    frames. Labelled "AI Concierge" there (2026-09-16).
 *  - `inline` sits at the right-hand end of the landing page's destination
 *    field, the one search box that kept it. Labelled "Ask AI".
 *
 * MEMBERS ONLY (Ulrik, 2026-09-16). The concierge needs a signed-in session
 * (the chat route answers 401 without one), so only a member sees the AI
 * button. Anyone else sees it grey — passive rim and label, upright rather than
 * the AI italic — with "Members only" beneath in the same grey, and it opens
 * nothing. Until the session has been read it keeps its place but stays
 * invisible, so a member's page does not flash "Members only" on every load.
 *
 * It renders nothing when the flag is off, so a disabled feature leaves no
 * trace on any page. */

type Props = {
  placement: "inline" | "header";
  /** Overrides the label where a page needs a shorter one. */
  label?: string;
};

export default function AiModeButton({ placement, label }: Props) {
  const { conciergeOpen, setConciergeOpen } = useAiSearch();
  const isMember = useIsMember();

  if (!AI_CHAT_ENABLED) return null;

  const text = label ?? (placement === "header" ? "AI Concierge" : "Ask AI");
  const placementClass = placement === "header" ? styles.header : styles.inline;

  if (isMember !== true) {
    return (
      <span
        className={`${styles.membersOnly} ${placementClass}`}
        style={isMember === null ? { visibility: "hidden" } : undefined}
      >
        <button
          type="button"
          className={`oltra-btn oltra-btn--ai ${styles.passive}`}
          aria-disabled="true"
          aria-describedby={`ai-members-only-${placement}`}
          onClick={(event) => {
            // Opens nothing, and — inside the destination field's
            // click-to-focus box — must not open the suggestions either.
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          {text}
        </button>
        <span id={`ai-members-only-${placement}`} className={styles.membersOnlyNote}>
          Members only
        </span>
      </span>
    );
  }

  return (
    <button
      type="button"
      // Inside a <form> on the landing and Hotels pages, so the type matters:
      // a default-type button there submits the search on click.
      className={`oltra-btn oltra-btn--ai ${placementClass}`}
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
      {text}
    </button>
  );
}
