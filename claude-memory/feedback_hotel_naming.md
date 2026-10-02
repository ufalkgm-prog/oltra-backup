---
name: feedback-hotel-naming
description: "Ulrik's hotel-name rule — official name wins (city included when the hotel uses it), no parent-brand phrases, brand spelling (Bvlgari)"
metadata:
  node_type: memory
  type: feedback
  originSessionId: ee9f4d77-16e0-4916-b9cf-a8c954458563
  modified: 2026-10-02T19:48:48.270Z
---

Hotel names follow the hotel's own official name (Ulrik, 2026-10-02):

- The official name wins, even when it carries a city ("Four Seasons Hotel George V, Paris"); a city/country we appended ourselves is removed.
- Never add a parent-brand phrase ("A Belmond Hotel", "A Four Seasons Hotel", "A Rosewood Hotel", "A Taj Hotel") and drop a Belmond/Rosewood prefix the hotel itself doesn't lead with; collection tags (Autograph Collection, Relais & Châteaux, LHW, SLH, "by Hyatt") stay out.
- Spelling and punctuation follow the brand: Bvlgari, "The Langham, London", Monte-Carlo, andBeyond.

**Why:** names should read the way the hotel presents itself; brand phrases are marketing, cities we invented are noise.
**How to apply:** when creating or renaming hotels; the full rule is in `.claude/rules/hotel-data.md` and the tooling in `hotels-beta/scripts/hotels/name-check/`. The 7 held-back renames were resolved 2026-10-02 (Le Guanahani → Airelles incl. affiliation and URL; Salamander DC deleted). Le Guanahani (1251) is UNPUBLISHED until it reopens as Airelles on 2026-11-01: then check KAYAK 71661 shows the Airelles name and rates, and republish (booking_partner kayak; RateHawk carries no Airelles hotels). A rename also updates the hotel's name in its description (and affiliation on a rebrand).
