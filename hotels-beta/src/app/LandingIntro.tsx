"use client";

import { useEffect, useState } from "react";
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

  if (hidden || resultsShown || isMember !== false) return null;

  return (
    <section
      className={`oltra-glass oltra-panel oltra-over-image ${styles.landingGlass} ${styles.introPanel}`}
      aria-labelledby="landing-intro-title"
    >
      <button
        type="button"
        className={styles.introClose}
        aria-label="Close introduction"
        onClick={() => setHidden(true)}
      >
        ×
      </button>

      <h2 id="landing-intro-title" className={styles.introTagline}>
        {LANDING_INTRO.tagline}
      </h2>

      <div className={styles.introBody}>
        {LANDING_INTRO.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>

      <p className={styles.introClosing}>{LANDING_INTRO.closing}</p>

      <div className={styles.introActions}>
        <Link href={LANDING_INTRO.ctaHref} className="oltra-btn oltra-btn--ai">
          {LANDING_INTRO.ctaLabel}
        </Link>
      </div>
    </section>
  );
}
