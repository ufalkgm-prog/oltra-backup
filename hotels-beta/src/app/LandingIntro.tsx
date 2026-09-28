"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { aiResultsAreCurrent, useAiSearch } from "@/lib/ai/aiSearchStore";
import { useIsMember } from "@/lib/members/useIsMember";
import { LANDING_INTRO } from "./landingIntroContent";
import styles from "./page.module.css";

/* The introduction under the landing search panel, for visitors who are not
 * signed in. Wording lives in landingIntroContent.ts.
 *
 * Signed in never sees it: nothing renders until the session has been read
 * (useIsMember is null), so a member's page does not flash it on load, and it
 * goes the moment a session arrives.
 *
 * Once hidden it stays hidden for the page view — by the close control, or by
 * the first results box, from a classic search or the concierge. "A results
 * box is showing" is the same test LandingResults uses to choose what to draw.
 * The landing search navigates with router.push, so this state survives the
 * search that clears results again. Deliberately not persisted: a fresh load
 * shows it again. */
export default function LandingIntro({ summaryShown }: { summaryShown: boolean }) {
  const isMember = useIsMember();
  const { results, presentedAt, searchedAt, conciergeOpen } = useAiSearch();
  const [hidden, setHidden] = useState(false);

  const resultsShown =
    !conciergeOpen &&
    (aiResultsAreCurrent(results, presentedAt, searchedAt) || summaryShown);

  useEffect(() => {
    if (resultsShown) setHidden(true);
  }, [resultsShown]);

  const visible = !hidden && !resultsShown && isMember === false;

  /* The letter scrolls with no visible scrollbar, so arrows say there is more
     (Ulrik, 2026-09-28): down at the bottom centre until the end is reached,
     up at the top only once it has been scrolled. Re-read on scroll and when
     the box or its text changes size. */
  const letterRef = useRef<HTMLDivElement | null>(null);
  const [scrollState, setScrollState] = useState({ canUp: false, canDown: false });
  useEffect(() => {
    const el = letterRef.current;
    if (!visible || !el) return;
    const update = () => {
      const canUp = el.scrollTop > 2;
      const canDown = el.scrollTop + el.clientHeight < el.scrollHeight - 2;
      setScrollState((prev) =>
        prev.canUp === canUp && prev.canDown === canDown ? prev : { canUp, canDown }
      );
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [visible]);

  const scrollLetter = (direction: 1 | -1) => {
    const el = letterRef.current;
    if (el) el.scrollBy({ top: direction * el.clientHeight * 0.7, behavior: "smooth" });
  };

  if (!visible) return null;

  return (
    /* The whole panel is the letter: a pale sheet, no dark frame, with the
       tagline and buttons as its header and the text scrolling beneath them
       (Ulrik, 2026-09-26). So none of the landing glass classes. */
    <section className={styles.introPanel} aria-labelledby="landing-intro-title">
      {/* "Become a member" at the top right, beside the close control, rather
          than at the foot (Ulrik, 2026-09-24). */}
      <div className={styles.introHeader}>
        <h2 id="landing-intro-title" className={styles.introTagline}>
          {LANDING_INTRO.tagline}
        </h2>

        <Link
          href={LANDING_INTRO.ctaHref}
          className={`oltra-btn oltra-btn--ai ${styles.introCta}`}
        >
          {LANDING_INTRO.ctaLabel}
        </Link>

        <button
          type="button"
          className={styles.introClose}
          aria-label="Close introduction"
          onClick={() => setHidden(true)}
        >
          {/* Drawn, not the "×" character: a glyph sits wherever the font's
              metrics put it, which was off-centre in the circle (Ulrik,
              2026-09-28). 12px, a little larger than the glyph was. */}
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path
              d="M2 2 L10 10 M10 2 L2 10"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* The letter's text, scrolling under the header row with no visible
          scrollbar. Focusable so the keyboard can scroll it too, since
          nothing shows that it scrolls. */}
      <div className={styles.introBody}>
      {scrollState.canUp ? (
        <button
          type="button"
          className={`${styles.introScroll} ${styles.introScrollUp}`}
          aria-label="Scroll up"
          onClick={() => scrollLetter(-1)}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2 8 L6 4 L10 8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : null}
      <div
        ref={letterRef}
        className={styles.introLetter}
        tabIndex={0}
        role="region"
        aria-label="Welcome letter"
      >
        {LANDING_INTRO.paragraphs.map(({ label, text }) => (
          <p key={text}>
            {label ? <span className={styles.introLabel}>{label} – </span> : null}
            {text}
          </p>
        ))}

        <p className={styles.introClosing}>{LANDING_INTRO.closing}</p>
      </div>
      {scrollState.canDown ? (
        <button
          type="button"
          className={`${styles.introScroll} ${styles.introScrollDown}`}
          aria-label="Scroll down"
          onClick={() => scrollLetter(1)}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2 4 L6 8 L10 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : null}
      </div>
    </section>
  );
}
