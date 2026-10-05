---
name: project-test-pass-2026-10-05
description: "Non-AI browser test pass of all pages (2026-10-05) — done and pushed through 7a93073, incl. lhr1 region and phone menu; only TEST rows left to delete"
metadata:
  node_type: memory
  type: project
  originSessionId: 2c0b2c33-2d62-4d3a-922c-ec4d43afbe95
  modified: 2026-10-05T21:54:56.419Z
---

Ulrik asked for a speed review plus a page-by-page browser test pass (Landing, Hotels, Flights, Restaurants, Inspire, Members, cross-cutting), run like the concierge rounds: one pass, report, he picks fixes ("fix 1-N, then next pass"). All seven passes done 2026-10-05, every chosen fix pushed (ea596be … 7a93073).

Settled the same day:
- **Vercel functions run in lhr1** (`hotels-beta/vercel.json`), moved from iad1. Members Supabase is Ireland, the hotel DB London, Directus and the ETG proxy Amsterdam. Measured after: description/policy routes 0.17–0.43s (were 0.4–1.2), Restaurants city 0.4–0.5s cold (1.0–1.7), Hotels page 0.5–0.85s, ETG batch for 19 Paris hotels on fresh dates 2.3–3.7s (2.6–10s with 16–27s outliers).
- **Phone menu**: below 700px the header links sit behind a menu button, panel overlays the page.
- Landing photos 58 → 52 (duplicates and two photos he named removed, renumbered with BRIGHT_TOP).
- Second-tab logout: Ulrik tested — logging out in one tab logs out every tab; correct.

Left for Ulrik: delete the TEST row in member_reviews (Romazzino, 5 Oct) and the TEST member_feedback row + its e-mail.

Measured, so not worth re-investigating: ETG answers the 19-hotel Paris serp in 0.5–5s direct whatever the timeout, so cutting ETG_SEARCH_TIMEOUT_S does not help.

Related: [[project-open-actions]], [[project-no-unsolicited-ui-testing]].
