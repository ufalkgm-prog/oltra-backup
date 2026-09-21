---
name: project-open-actions
description: "The open actions carried out of the 2026-09-21 UI sweep, in the order to take them"
metadata: 
  node_type: memory
  type: project
  originSessionId: 113be546-0d38-4348-be9c-ff9b034556a4
  modified: 2026-09-21T22:11:22.684Z
---

Outstanding after the 2026-09-21 session, highest value first. Everything else from that session is on `main` (through `ca4ead4`) and backed up.

**1. Two Supabase dashboard steps only Ulrik can do (members project `hrlvtzcapsqkgrcawluf`).**
- Add `/auth/callback` to Authentication → URL Configuration → Redirect URLs, for `http://localhost:3000` **and** the Vercel domain. Without it the signup confirmation link silently falls back to the Site URL and lands on the landing page instead of Members — which looks exactly like the code failing.
- Authentication → Email Templates → Confirm signup: subject `myOLTRA member authentication`, body `Follow this link to confirm your membership`, keeping `{{ .ConfirmationURL }}` untouched. The "Supabase Auth" **sender** name needs custom SMTP, which §16 already flags as a pre-production job.

**2. Click a generated Trip.com link and confirm it registers in the affiliate dashboard.** The one failure mode nothing in code can catch — broken tracking opens a perfectly good search page and earns nothing. See [[project-ratehawk-integration]] for the neighbouring ETG work.

**3. Multi-city flights still clip below ~1230px, and it needs a decision.** N leg columns side by side cannot fit a narrow viewport however the sidebar is placed, and it worsens with 4 or 5 legs. The column template is an inline style built from `N` in three places in `FlightsView.tsx` (`gridCols`, plus the pinned grid), so no media query reaches it. The two options are computing the template from a measured container width, or letting the leg grid scroll horizontally. Recorded in `.claude/rules/airports-and-flights.md` §7B.

**4. Filtering map results to the map window** (Part B item 10, unbuilt). Needs Ulrik's decision first: once the map is panned, what does the count say — "7 in this view, 19 matching"? And does panning away from everything empty the list or reset it? §12 documents auto-fit bounds only; nothing listens to `moveend`.

**5. Two small leftovers, both named and deliberately left.**
- The multi-city leg picker still ellipsises two rows, where `InlinePrice` shares the row with the card by design.
- **Infants have no collector anywhere in the UI** — `babyqty` is built and tested in the Trip.com link, but nothing asks how many infants are travelling, so it is always 0.

**Closed 2026-09-21, noted so they are not re-raised:** the browser normalising nothing (the wire format is ours); the fixed header covering the search panel at 502; the landing leg cards cutting the arrival time; the Flights results clipping between 1181 and 1400 for one-way and return. Portalling every dropdown was decided against — the rule for when one misbehaves is in `.claude/rules/design-system.md` §35.
