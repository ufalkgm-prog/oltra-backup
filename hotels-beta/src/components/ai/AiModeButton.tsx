"use client";

import { useEffect, useState } from "react";
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
 * Since 2026-09-23 the two look different: the header one is transparent with a
 * white label and (since 2026-09-26) a sage rim, the inline one a transparent
 * sage-rim button.
 *
 * MEMBERS ONLY (Ulrik, 2026-09-16). The concierge needs a signed-in session
 * (the chat route answers 401 without one), so only a member sees the AI
 * button. Anyone else sees it grey — passive rim and label, upright rather than
 * the AI italic — and it opens nothing. Why is the standard passive popup on
 * hover (data-reason), which replaced a "Members only" note printed beneath
 * the button (Ulrik, 2026-09-16). Until the session has been read it shows as
 * the member's button and keeps a click for when it knows (see below).
 *
 * It renders nothing when the flag is off, so a disabled feature leaves no
 * trace on any page. */

const MEMBERS_ONLY_REASON = "The AI Concierge is only available for members";

type Props = {
  placement: "inline" | "header";
  /** Overrides the label where a page needs a shorter one. */
  label?: string;
};

export default function AiModeButton({ placement, label }: Props) {
  const { conciergeOpen, setConciergeOpen } = useAiSearch();
  const isMember = useIsMember();

  /* A CLICK BEFORE THE SESSION IS READ IS KEPT, NOT LOST (2026-09-28).
     Reading the session takes a moment after every page load — about two
     seconds on the dev server — and the button used to be invisible and
     inert for all of it, so a click there fell through to the destination
     field behind it. It now shows as the member's button straight away, and a
     click in that window opens the concierge as soon as membership is
     confirmed; a visitor who turns out not to be signed in gets the passive
     button, and nothing opens. */
  const [openWhenKnown, setOpenWhenKnown] = useState(false);
  useEffect(() => {
    if (!openWhenKnown || isMember === null) return;
    setOpenWhenKnown(false);
    if (isMember) setConciergeOpen(true);
  }, [openWhenKnown, isMember, setConciergeOpen]);

  if (!AI_CHAT_ENABLED) return null;

  const text = label ?? (placement === "header" ? "AI Concierge" : "Ask AI");
  // Header: transparent, sage rim, white label. Inline: a sage-rim active button, small
  // and bold italic (Ulrik, 2026-09-23).
  const placementClass =
    placement === "header"
      ? `oltra-btn--ai-concierge ${styles.header}`
      : `oltra-btn--ai-ask ${styles.inline}`;

  if (isMember === false) {
    return (
      <button
        type="button"
        className={`oltra-btn oltra-btn--ai ${styles.passive} ${placementClass}`}
        aria-disabled="true"
        data-reason={MEMBERS_ONLY_REASON}
        aria-label={`${text}. ${MEMBERS_ONLY_REASON}`}
        onClick={(event) => {
          // Opens nothing, and — inside the destination field's
          // click-to-focus box — must not open the suggestions either.
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        {text}
      </button>
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
        if (isMember) setConciergeOpen(true);
        else setOpenWhenKnown(true);
      }}
    >
      {text}
    </button>
  );
}
