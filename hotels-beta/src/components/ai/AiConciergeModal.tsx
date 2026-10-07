"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { useAiSearch } from "@/lib/ai/aiSearchStore";
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

/* The landing search panel's box, for pages that do not have one.
 *
 * Mirrors page.module.css's .heroPanel — width min(1120px, 100vw - 3rem), or
 * 2.5rem at 1280px and below, centred — and sits at --oltra-page-top-padding,
 * where that panel starts. The height is the panel's own, remembered from the
 * last time the landing page measured it; before that the panel is as tall as
 * its content. */
const LANDING_HEIGHT_KEY = "oltra_ai_landing_panel_height";

function rememberLandingPanelHeight(height: number) {
  try {
    window.sessionStorage.setItem(LANDING_HEIGHT_KEY, String(Math.round(height)));
  } catch {
    /* sessionStorage may be unavailable; the box is still right, just shorter */
  }
}

function landingPanelBox() {
  const root = document.documentElement;
  const style = window.getComputedStyle(root);
  const rem = parseFloat(style.fontSize) || 16;
  const gutter = (window.innerWidth <= 1280 ? 2.5 : 3) * rem;
  const width = Math.min(1120, window.innerWidth - gutter);
  const top = parseFloat(style.getPropertyValue("--oltra-page-top-padding")) || 110;
  let height = 0;
  try {
    height = Number(window.sessionStorage.getItem(LANDING_HEIGHT_KEY)) || 0;
  } catch {
    height = 0;
  }
  return { top, left: Math.max(0, (root.clientWidth - width) / 2), width, height };
}

export default function AiConciergeModal() {
  const {
    conciergeOpen,
    setConciergeOpen,
    results,
    pageContext,
    hasConversation,
    requestClear,
  } = useAiSearch();
  const router = useRouter();
  const pathname = usePathname();
  /* The landing page shows the concierge in place of its results rather than
     over them (2026-09-15): LandingResults hides while this is open, so there
     is nothing behind to blur or dim, and the page's photograph stays as it
     is. Every other page keeps the blur. */
  const onLanding = pathname === "/";
  const panelRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => setConciergeOpen(false), [setConciergeOpen]);

  /* Where the panel opens: exactly over the landing page's search panel, on
   * every page (Ulrik, 2026-09-15). The landing page marks that frame with
   * data-ai-concierge-anchor and the panel takes its left edge, width, top and
   * height — at least that tall, so it covers the frame completely. Other pages
   * have no such frame, so the same box is rebuilt from the rules that lay it
   * out (the landing hero's width and the page's top padding) and from the
   * frame's height as last measured on the landing page.
   *
   * A layout effect, so the first measurement lands before the first paint (no
   * jump from centred to anchored). The frame keeps moving after that — the
   * scroll lock below re-centres the page (the panel once sat 5px right of the
   * frame on a first-paint reading), and the results under it hide — which is
   * why the effect below tracks it rather than measuring once. */
  const [anchor, setAnchor] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);

  /* EXACTLY ON THE FRAME, FOR AS LONG AS IT IS OPEN (Ulrik, 2026-09-28).
   * Measured once, the panel sat 8px above the frame: the frame moves after
   * the first reading (the results below it hide as the panel opens), and it
   * grows and shrinks with the destination chips. So it is re-read every
   * animation frame while open — one getBoundingClientRect — and the state
   * changes only when the box does. A page scrolled past the frame goes back
   * to the top first, so the panel can sit exactly on it rather than being
   * clamped below the header, which is what it used to do. */
  useLayoutEffect(() => {
    if (!conciergeOpen) return;

    const frame = document.querySelector<HTMLElement>("[data-ai-concierge-anchor]");
    if (!frame) {
      setAnchor(landingPanelBox());
      const onResize = () => setAnchor(landingPanelBox());
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }

    if (frame.getBoundingClientRect().top < 0) window.scrollTo(0, 0);

    let last = "";
    let frameId = 0;
    const track = () => {
      const rect = frame.getBoundingClientRect();
      const key = `${rect.top}|${rect.left}|${rect.width}|${rect.height}`;
      if (key !== last) {
        last = key;
        rememberLandingPanelHeight(rect.height);
        setAnchor({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
      }
      frameId = window.requestAnimationFrame(track);
    };
    track();
    return () => window.cancelAnimationFrame(frameId);
  }, [conciergeOpen]);

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

    /* BACK AND FORWARD CLOSE THE PANEL (Ulrik, 2026-09-21).
     *
     * Two things closed it before and neither covered history. AiConciergeRoot
     * closes it when the new path is not on the allow-list, so Back between two
     * allowed pages leaves `allowed` true and the effect never fires; the
     * header's links close it in an onClick, which Back does not run. So the
     * panel stayed open over a page the visitor had navigated to, and - because
     * the modal never unmounted - the cleanup below never ran and <html> and
     * <body> kept overflow: hidden. The page could not be scrolled. Exactly the
     * freeze this file's own note warns about, which assumed unmount always
     * happens.
     *
     * popstate and NOT a pathname/searchParams watcher: AiResultsSync writes an
     * answer's own dates and ids into the URL, so closing on every URL change
     * would shut the panel the moment it answered. popstate fires only for
     * user-driven Back/Forward, never for the app's own router calls. */
    window.addEventListener("popstate", close);

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

    // Without scrolling: the box now sits at the end of the conversation, and
    // the panel opens on the latest answer, not on the box below it.
    panelRef.current?.querySelector("textarea")?.focus({ preventScroll: true });

    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("popstate", close);
      root.style.overflow = previous.rootOverflow;
      body.style.overflow = previous.bodyOverflow;
      body.style.paddingRight = previous.bodyPadding;
    };
  }, [conciergeOpen, close]);

  /* "GO TO RESULTS" (Ulrik, 2026-10-04): one button, in the chat under the
   * latest answer (2026-10-07), whenever the latest answer has results. Where it goes is
   * chosen by how the answer sits against the page it was asked from:
   *
   *  - The answer is already on this page — the landing page, which IS the
   *    combined page, or a vertical page answered about its own subject → it
   *    closes the panel, uncovering them. (null below.)
   *  - The answer is wider than this page, or about something else entirely →
   *    the main page, the only one that shows all of it at once.
   *
   * It used to be a link under the input row, offered only in the second case,
   * so on the landing page a visitor had to know that closing the window was
   * how to see what the concierge had found. */
  const handoff = useMemo((): { href: string | null } | null => {
    const covered: Vertical[] = [];
    if (results.hotelIds.length) covered.push("hotels");
    if (results.flights.length) covered.push("flights");
    if (results.restaurantIds.length) covered.push("restaurants");
    if (!covered.length) return null;

    const page = pageContext?.page ?? "landing";
    const pageVertical: Vertical | null =
      page === "hotels" || page === "flights" || page === "restaurants" ? page : null;

    /* A trip in several places is shown whole only on the main page (Ulrik,
       2026-09-15), so every other page offers the way there, even when the
       answer is purely its own vertical. */
    if ((results.laterStops ?? []).length > 0) {
      return { href: page === "landing" ? null : "/" };
    }

    // Specific to the page it was asked from.
    if (pageVertical && covered.length === 1 && covered[0] === pageVertical) {
      /* Every vertical page already shows its own part of the answer behind
         the panel — Hotels and Flights through AiResultsSync, Restaurants
         through its "AI curated results" type (2026-09-15) — so a link to the
         same page is a way to go where you are standing: the landing page's
         reason for having none, found 2026-09-14 on a hotels answer asked on
         Hotels. So the button only closes the panel. */
      return { href: null };
    }

    if (page === "landing") return { href: null };

    // Broader than the page, so the combined view is the only one that fits.
    // Plain "/" — the landing frames read the answer from the store, not from
    // the URL, and leaving the URL clean keeps any earlier classic search out
    // of the way.
    return { href: "/" };
  }, [results, pageContext]);

  const goToResults = useMemo(() => {
    if (!handoff) return undefined;
    return () => {
      // Close first, then navigate: the results are already in the store, so
      // there is nothing to wait for — and leaving the modal open over a page
      // transition looks like the click did nothing.
      close();
      if (handoff.href) router.push(handoff.href);
    };
  }, [handoff, close, router]);

  if (!conciergeOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`${onLanding ? styles.scrimClear : "oltra-modal-scrim"} ${styles.scrim} ${
        anchor ? styles.scrimAnchored : ""
      }`}
      onClick={close}
      role="presentation"
    >
      <div
        ref={panelRef}
        className={`oltra-modal-panel ${styles.panel}`}
        style={
          anchor
            ? {
                marginTop: anchor.top,
                marginLeft: anchor.left,
                width: anchor.width,
                minHeight: anchor.height || undefined,
              }
            : undefined
        }
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="myOLTRA AI Concierge"
      >
        <div className={styles.header}>
          {/* The name only: the myOLTRA wordmark is in the site header right
              above, which stays sharp while this is open (2026-09-15). */}
          <h2 className={`oltra-label ${styles.brandTitle}`}>AI Concierge</h2>
          {/* Clear sits beside Exit rather than down in the input row: both
              are things you do to the whole conversation, not to the message
              you are writing, and next to Ask it read as a third way to send.
              Shown only when there is something to clear. */}
          <div className={styles.headerActions}>
            {hasConversation ? (
              <button
                type="button"
                className={`oltra-btn oltra-btn--destructive ${styles.action}`}
                onClick={requestClear}
              >
                Clear
              </button>
            ) : null}
            <button type="button" className={`oltra-btn ${styles.action}`} onClick={close}>
              Close
            </button>
          </div>
        </div>

        <AiConversation onGoToResults={goToResults} />
      </div>
    </div>,
    document.body
  );
}
