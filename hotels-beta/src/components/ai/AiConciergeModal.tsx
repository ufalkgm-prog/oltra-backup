"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useAiSearch } from "@/lib/ai/aiSearchStore";
import { voiceFont } from "@/lib/ai/fonts";
import { flightsHref, hotelsHref, restaurantsHref } from "@/lib/ai/handoff";
import AiConversation from "./AiConversation";
import styles from "./AiConcierge.module.css";

/* The concierge, as a modal over the page.
 *
 * Built on the hotel photo lightbox's pattern rather than a new one: portalled
 * to document.body, .oltra-modal-scrim over the whole viewport, .oltra-modal-panel
 * inside it, click-outside and Esc to close. Same tokens, same radius, same
 * border — it reads as part of the site rather than a widget bolted onto it.
 *
 * Portalled for a concrete reason, not tidiness: .oltra-page__content is
 * position: relative; z-index: 1 and therefore its own stacking context, so a
 * panel rendered inside it can never rise above the fixed header however high
 * its z-index. §45 records the itinerary overlay learning this the hard way.
 *
 * The one addition over the lightbox is the blur. The brief asks for the page
 * behind to be blurred, which is also what makes the in-chat summary
 * necessary — the cards are there, they are simply not readable while this is
 * open. */

type Vertical = "hotels" | "flights" | "restaurants";

const VERTICAL_LABEL: Record<Vertical, string> = {
  hotels: "hotels",
  flights: "flights",
  restaurants: "restaurants",
};

export default function AiConciergeModal() {
  const { conciergeOpen, setConciergeOpen, query, results, pageContext } = useAiSearch();
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => setConciergeOpen(false), [setConciergeOpen]);

  /* Esc closes, and the page underneath stops scrolling entirely.
   *
   * Locking <body> alone was not enough — the scrolling element is usually
   * <html>, so a wheel over the scrim still moved the page behind. Both are
   * locked, and the scrim carries overscroll-behavior: contain so a scroll
   * that reaches the end of the conversation does not chain outward either.
   *
   * Removing the scrollbar reflows the page a few pixels narrower, which reads
   * as the whole site twitching as the modal opens, so its width is added back
   * as padding for exactly as long as the lock is held.
   *
   * Everything is restored on cleanup, including when the component unmounts
   * mid-navigation — a stray overflow: hidden left on <html> would silently
   * freeze the next page. */
  useEffect(() => {
    if (!conciergeOpen) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);

    const root = document.documentElement;
    const body = document.body;
    const previous = {
      rootOverflow: root.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyPadding: body.style.paddingRight,
    };

    const scrollbar = window.innerWidth - root.clientWidth;
    root.style.overflow = "hidden";
    body.style.overflow = "hidden";
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;

    panelRef.current?.querySelector("textarea")?.focus();

    return () => {
      window.removeEventListener("keydown", onKey);
      root.style.overflow = previous.rootOverflow;
      body.style.overflow = previous.bodyOverflow;
      body.style.paddingRight = previous.bodyPadding;
    };
  }, [conciergeOpen, close]);

  /* One offer, chosen by how the answer sits against the page it was asked
   * from.
   *
   *  - The answer is exactly this page's own subject → send them to that page,
   *    "See relevant hotels".
   *  - The answer is wider than this page, or about something else entirely →
   *    the only place that can show all of it at once is the main page, which
   *    renders a frame per vertical.
   *
   * A single option rather than one per vertical: three links under a
   * conversation is a menu, and the answer has already said what it found.
   *
   * The landing page gets none. It IS the combined page, its frames are
   * already rendering behind this panel, and offering to go somewhere you are
   * standing is noise. */
  const handoff = useMemo(() => {
    const covered: Vertical[] = [];
    if (results.hotelIds.length) covered.push("hotels");
    if (results.flights.length) covered.push("flights");
    if (results.restaurantIds.length) covered.push("restaurants");
    if (!covered.length) return null;

    const page = pageContext?.page ?? "landing";
    const pageVertical: Vertical | null =
      page === "hotels" || page === "flights" || page === "restaurants" ? page : null;

    // Specific to the page it was asked from.
    if (pageVertical && covered.length === 1 && covered[0] === pageVertical) {
      const href =
        pageVertical === "hotels"
          ? hotelsHref(query, results)
          : pageVertical === "flights"
            ? flightsHref(query, results)
            : restaurantsHref(query);
      return { href, label: `See relevant ${VERTICAL_LABEL[pageVertical]}` };
    }

    if (page === "landing") return null;

    // Broader than the page, so the combined view is the only one that fits.
    // Plain "/" — the landing frames read the answer from the store, not from
    // the URL, and leaving the URL clean keeps any earlier classic search out
    // of the way.
    return { href: "/", label: "Go to combined results on main page" };
  }, [query, results, pageContext]);

  if (!conciergeOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`oltra-modal-scrim ${styles.scrim}`}
      onClick={close}
      role="presentation"
    >
      <div
        ref={panelRef}
        /* voiceFont.variable scopes --oltra-font-voice to this panel, which is
           the only place the concierge's serif is used. */
        className={`oltra-modal-panel ${voiceFont.variable} ${styles.panel}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="myOLTRA concierge"
      >
        <div className={styles.header}>
          <span className="oltra-label">Concierge</span>
          <button
            type="button"
            className={`oltra-button-secondary ${styles.exit}`}
            onClick={close}
          >
            Exit
          </button>
        </div>

        <AiConversation />

        {handoff ? (
          <div className={styles.handoffs}>
            <button
              type="button"
              className={styles.handoff}
              onClick={() => {
                // Close first, then navigate: the results are already in the
                // store, so there is nothing to wait for — and leaving the
                // modal open over a page transition looks like the click did
                // nothing.
                close();
                router.push(handoff.href);
              }}
            >
              {handoff.label}
            </button>
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
