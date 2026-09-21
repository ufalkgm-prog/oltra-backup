# OLTRA — AI CONTEXT

## WHERE THE CONTEXT LIVES

This file is loaded at the start of every session, which is what makes it
expensive: every line here competes for attention with every other line, and
Claude Code's own guidance is that a long file *reduces* adherence rather than
adding knowledge. So it holds only what must be known **before** anything is
opened, and the rest loads when it becomes relevant.

| Where | Holds | Loaded |
|---|---|---|
| `CLAUDE.md` | The map, and the rules you can break by accident before you have opened a file | **Every session** |
| `.claude/rules/*.md` | The five bodies of detail, each scoped to the paths it governs | **Automatically, when Claude reads a file the rule covers** |
| `CLAUDE-AI.md` | The concierge's mechanics and bug log | On demand |
| `CLAUDE-ARCHIVE.md` | Completed work: what was done and what it cost | On demand |

The five rule files, and what opens each:

| Rule file | Sections | Loads when you touch |
|---|---|---|
| `hotel-data.md` | §3, §4, §42B | Directus, the hotel/restaurant scripts, filters, the editor |
| `airports-and-flights.md` | §7B, §51, §52 | `scripts/airports`, the geography scripts, `lib/flights`, the Flights page |
| `etg-ratehawk.md` | §32, §42, §47, §48 | `lib/ratehawk`, the ETG proxy, the static sync |
| `concierge.md` | §50 | `lib/ai`, `components/ai`, the chat route |
| `design-system.md` | §35, §35A (buttons) | any `.tsx` or `.css` |

**Section numbers are global and unchanged.** §26 is §26 wherever it lives, and
every moved section leaves a one-line pointer here, so a `§N` reference always
resolves.

**A rule loads when Claude READS a matching file, which is sometimes a beat too
late.** Planning work, answering a question, or deciding what to change all
happen before any file is opened. So when a task obviously sits on one of those
five grounds, go and read the rule file first — the pointer names it. Not being
in context does not make it optional; it makes it something to fetch. The traps
in those files cost real sessions to find.

**Claude's own memory is a further store, and it lives outside the repo** — `C:\Users\ufalk\.claude\projects\C--Users-ufalk-dev-oltra-beta\memory\`, on one machine, not in git. `claude-memory/` is a backup copy of it with a README covering restore and re-sync. It is a copy, so it drifts: **after a session that changes how Claude should work, re-sync it**, or the backup quietly becomes a way to restore a superseded instruction.

### The 150,000-character ceiling was not real

This header used to open by saying the file "stops at 150,000 characters" and
that at 304k it had been "rejected outright". **Checked against Claude Code's
documentation on 2026-09-12: the actual limit is 4 MiB, and a file over it is
skipped entirely rather than truncated.** At its largest this file was 0.29 MiB
— about 7% of the cap. Whatever happened at 304k, it was not that ceiling, and
no setting exists to raise one.

The real cost was never capacity. It is stated plainly in the docs — *"target
under 200 lines per CLAUDE.md file. Longer files consume more context and reduce
adherence"* — and this file already had the evidence twice over: §50 records,
from measurement, that prompt-only rules get skipped, which is why the
no-prices guarantee and the transfer-route gap were both moved into code. At
1,771 lines the same thing was happening to the instructions themselves.

**So the size rule is now about attention, not about a limit.** Keep this file
short enough to be read in full — a few hundred lines. When a body of detail
grows, give it a rule file scoped to the paths it governs rather than another
screen here. Block-level HTML comments are stripped before injection, so
maintainer notes cost nothing, and `/doctor` will propose trims.

---

## 0. REPOSITORY STRUCTURE

All application code lives in `hotels-beta/`. The repo root holds only top-level config (the three CLAUDE files above, GitHub workflows).

**Git paths are relative to the repo root** — stage as `hotels-beta/src/...`.

| | |
|---|---|
| This repo | `C:\Users\ufalk\dev\oltra-beta` |
| App code | `C:\Users\ufalk\dev\oltra-beta\hotels-beta` |
| Sibling data repo (§41) | `C:\Users\ufalk\dev\oltra-agents` |

Any `/workspaces/oltra-beta/...` path in this file is a historical record of the Codespace era, not a current location.

### Two sibling checkouts — use absolute paths

`oltra-beta` and `oltra-agents` each have their own `CLAUDE.md`, and §41's is deliberately stricter. Reading the wrong one is a real failure.

`~/.bashrc` contains `cd /c/Users/ufalk/dev/oltra-agents`, which Git Bash runs for **non-interactive** shells too — so a tool-opened shell starts in the wrong repo and a bare `CLAUDE.md` resolves to the wrong file. Until it is guarded (`case $- in *i*) cd ... ;; esac`):

* check `pwd` before trusting a relative path, and prefer absolute paths;
* prefer edits that **fail loudly** on a wrong-file match (anchor-text assertions) over ones that silently no-op (`sed -i`);
* the PowerShell tool is unaffected and starts in the correct directory.

---

## 1. PROJECT OVERVIEW

OLTRA is a curated luxury travel platform — high-end hotels and restaurants, for an affluent, design-conscious, international audience.

* Editorial-first (not OTA-first)
* Luxury UX with minimal clutter
* Highly structured taxonomy-driven filtering
* Server-driven data (Supabase as canonical store, accessed via Directus)
* Clean, scalable architecture with minimal technical debt

---

## 2. TECH STACK

**Frontend**: Next.js 15 (App Router), TypeScript, Tailwind v4, Server Components by default.

**Backend / data**: Supabase (OLTRA account, "Hotel database") is the canonical store for all hotel and restaurant records. Directus (on Railway) is a CMS layer on top of it; all content reads/writes go via the Directus REST API (`/src/lib/directus`), never directly to Supabase.

**Auth / members**: a *separate* Supabase project — auth and user data only. See §31, which is the mix-up that costs a session if unread.

**AI**: the concierge (§50). Placeholder elsewhere.

Strict rules: no schema redesign unless asked, no new libraries unless asked, minimal-diff production-grade changes only.

---

## 3. CORE DATA MODEL (SUPABASE / DIRECTUS)

Moved to `.claude/rules/hotel-data.md` — it loads by itself when you open a file it covers, and you can read it directly when the work starts before that.

---
## 4. TAXONOMY SYSTEM

Moved to `.claude/rules/hotel-data.md` — it loads by itself when you open a file it covers, and you can read it directly when the work starts before that.

---
## 5. KEY ARCHITECTURE FILES

**Hotels** — page `/src/app/hotels/page.tsx`, UI `/src/app/hotels/ui/HotelsView.tsx`. Helpers: `/src/lib/directus`, `/src/lib/hotelFilters` (Directus filter builder + `filterHotelsByTags`), `/src/lib/hotelOptions`, `/src/lib/hotelSearchSuggestions`, `/src/lib/hotels/awardCodes`, `/src/lib/hotels/buildBookingLink`, `/src/lib/hotels/cardHelpers`, `/src/lib/editorHotels`.

**Restaurants** — `/src/app/restaurants/page.tsx`, `/src/app/restaurants/ui/RestaurantsMapView.tsx`, `/src/lib/restaurants`.

**Flights** — `/src/app/flights/page.tsx`, `ui/FlightsView.tsx`, `ui/FlightDetailsPopup.tsx`, `ui/AirportAutocomplete.tsx`. Data: `/src/lib/flights/duffelNormalizer.ts`, `/src/lib/flights/airlineAlliances.ts`, `/src/lib/airportOptions.ts`. Routes: `/src/app/api/flights/{search,inquiry,offer/[id]}`. Handoff: `/src/lib/flights/{itinerary,partners,tripCom,tripComHandoff}.ts` — BOOK goes to Trip.com, who are merchant of record; `book-link` (Duffel checkout) was deleted 2026-09-21.

**Ratehawk** — `/src/lib/ratehawk/availability.ts`, `/src/app/api/ratehawk/availability{,/batch}`.

**Concierge** — `/src/app/api/chat/route.ts`, `/src/lib/ai/*` (§50).

**Shared** — `/src/lib/locationAliases.ts`, `/src/lib/guests`, `/src/lib/members`, `/src/lib/cityAirports.ts`.

---

## 6. HOTELS PAGE LOGIC

Three modes:

1. **Featured** — no filters or >50 results. Full-screen hero, floating search (top-left), floating featured card (top-right).
2. **Results** — active filters and ≤50 results. Left panel filters + list, right panel selected hotel.
3. **Map** — toggle from results. MapLibre.

Key variables: `shouldShowResults`, `shouldShowFeatured`, `effectiveView`.

Selection: first hotel auto-selected when results load; selection persists if still in the result set, else falls back to the first result.

Featured-mode cycling: the pool is every hotel with at least one real photo — `hasHotelPhotos()` in `cardHelpers.ts`, Ratehawk images (§29) — with no ext_points restriction. Random shuffle with ≥30 positions between repeats across cycle boundaries (same algorithm as `LandingBackground.buildCycle`), via `featuredCycleRef` / `featuredTailRef`, advancing every 5s.

---

## 7. RESTAURANTS PAGE LOGIC

Read `city` from the URL (default Paris) → resolve against available cities with alias expansion → fetch all restaurants for the city → render map + list via `RestaurantsMapView`.

**Type filter**: client-side `selectedType` (default `"All"`), values matching `restaurant_type` exactly. Filters both list and markers, refits map bounds on change, resets to All when the city changes, count label dynamic.

**City aliases**: Saint Tropez and Ramatuelle are one cluster via `expandCityAliases([city])` — selecting either includes the other, merged and deduped by `id`.

---

## 7B. FLIGHTS PAGE LOGIC (DUFFEL)

Moved to `.claude/rules/airports-and-flights.md` — it loads by itself when you open a file it covers, and you can read it directly when the work starts before that.

---
## 8. FILTERING PRINCIPLES

URL-driven state (searchParams). No local-only filtering state; all filters reflected in the URL. `search_submitted=1` controls activation.

---

## 9. UI / DESIGN SYSTEM

Central file `/src/styles/oltra-theme.css`. Glassmorphism panels, soft borders, subtle transparency, uppercase micro-labels, tight spacing. Tokens `--oltra-glass-bg`, `--oltra-radius-*`, `--oltra-text-*`. Current palette and radius scale: §35 (which supersedes §34's values).

---

## 10. DROPDOWN / FILTER BEHAVIOR

Vertical sliders, sub-sections per taxonomy, max 4 visible items per section, scroll inside the dropdown, controlled open/close state.

---

## 11. SEARCH BEHAVIOR

`StructuredDestinationField` drives input; suggestions dataset for autocomplete; no execution until meaningful input.

---

## 12. MAP BEHAVIOR

MapLibre GL. Markers from hotel coordinates, hover = popup, click = select, auto-fit bounds. Basemap is `streets-v4` everywhere — no dark variant (§34).

---

## 13. MEMBER FEATURES

Add to trip, add to favourites, trip creation — all via `/src/lib/members/db`.

---

## 14. KEY RULES FOR DEVELOPMENT

* Minimal diffs only
* No duplication of logic; centralize reusable logic
* Keep UI consistent with Hotels as reference
* Do not break editorial hierarchy

### Do not run your own browser UI test unless asked

**Ulrik checks the UI himself.** Do not start a dev server and drive the page in Chrome to verify a change unless he explicitly asks in that session — it is slow and burns a lot of credits.

Default verification for a UI change is `npx tsc --noEmit` and `npm run lint`, plus reading the code path. Then hand it over and say what was *not* visually verified.

This supersedes any earlier note saying to browser-verify as a matter of course. Live verification of **data/API** behaviour (throwaway read-only scripts against Directus/RateHawk) is unaffected and still expected.

### Commit and push straight to `main` — but only when asked

`main` takes direct pushes; the pull-request requirement was removed 2026-08-16 precisely so this workflow needs no PR. Force-pushes and branch deletion on `main` are still blocked and should stay that way.

**Do not commit or push on your own initiative.** Wait for an explicit instruction in that session. Removing the PR requirement changed *how* a push happens, not *who* decides it happens. Leave finished work in the tree and say it's ready.

Do not create a branch either — this repo's history is a deliberate linear series of commits on `main`.

---

## 15. LANDING PAGE LOGIC

Files: `/src/components/site/LandingBackground.tsx`, `/src/app/LandingSearchPanel.tsx`, `/src/app/LandingSummary.tsx`.

**LandingBackground** — 49 images in `/public/images/landing/`, cross-fade + Ken Burns motion, `buildCycle` guarantees ≥20 positions between repeats. **A 5% dark overlay, nothing heavier** — the `rgba(0,0,0,0.34)` layer was removed, and the 10% one that outlived it was halved on 2026-09-14. Buttons over the photo get their legibility from `.oltra-over-image` (§35A), not from the overlay.

**LandingSummary** — each hotel card links to `/hotels?q=<name>&from=&to=&adults=N&submitted=1`, i.e. the main Hotels page, **not** the standalone `/hotels/[hotelid]` page (which exists but is not part of the intended UX flow).

**LandingSearchPanel** — Hotels and Flights checkboxes (§38). Flights activates when destination, dates and guests are filled; origin IATA resolves from `AIRPORT_OPTIONS`, defaulting to the member's home airport (§50).

---

## 16. AUTH & MEMBERS

### Login (`/src/app/login/LoginView.tsx`)

Four views in one panel:

* **login** — LOG IN is primary only when the email is valid and the password non-empty; CREATE NEW ACCOUNT and CONTINUE WITH GOOGLE always primary; no Facebook.
* **signup** — password ≥7 chars with letters and numbers; Supabase `signUp` detects duplicate emails natively.
* **forgot** — sends for real via `supabase.auth.resetPasswordForEmail`. Neutral "if an account exists" wording so the form can't be used to discover registered addresses. Two config prerequisites, both outside the code: `/login` must be in Supabase → Authentication → URL Configuration → Redirect URLs (localhost *and* Vercel), and the built-in mailer is rate-limited and not for production — real use needs custom SMTP. **The last hop, mail actually arriving, has never been confirmed.**
* **reset** — SET A NEW PASSWORD, entered via the `PASSWORD_RECOVERY` event.

### SiteHeader greeting

Uses `supabase.auth.onAuthStateChange` only — a separate `getUser()` call was removed because it could overwrite state with null during a token refresh. Name resolution: `memberName` from the DB profile → `user_metadata.full_name` → `user_metadata.name` → "Hello" with no name.

`fetchMemberProfileBrowser` falls back to the same metadata when `member_profiles.member_name` is null, so Google OAuth users see their name immediately after first login.

### OAuth redirect URLs

Code uses `window.location.origin` for `redirectTo`. Both the Vercel URL and `http://localhost:3000` must be in Supabase → Redirect URLs and in Google Cloud Console → Authorized redirect URIs.

---

## 17. CURRENT STATE

Hotels, Restaurants, Flights and Members UI are complete and stable on `main`, and the AI concierge (§50) merged into `main` on 2026-09-10 — still behind its flag, default off. Ratehawk supplies availability, pricing, room selection and images on the Hotels page; booking itself is still blocked (§32). Build passes `npm run build` and `npx tsc --noEmit` clean.

Live counts (hotel totals, published splits, per-award tallies) drift — query Directus rather than trusting a number written in this file.

---

## 18. BACKUP WORKFLOW

Primary `ufalkgm-prog/oltra-beta` → backup `ufalkgm-prog/oltra-backup`, via `.github/workflows/backup.yml` on every push to `main`. Auth is an SSH deploy key that does not expire (public key on the backup repo's Deploy keys with write access; private key base64-encoded as the `BACKUP_SSH_KEY` secret).

Status: **Actions tab → "Backup to oltra-backup" → the `backup` job**. A red ✗ means the push actually failed.

**"error in libcrypto" / "Permission denied (publickey)"** → the secret is corrupted. Regenerate: `ssh-keygen -t ed25519 -f /tmp/backup-deploy-key -N ""`, add the `.pub` to the backup repo's deploy keys, then `cat /tmp/backup-deploy-key | base64 -w 0` and paste into the secret. **Always copy that string from the raw terminal, never from chat** — markdown rendering corrupts it.

**"Repository not found"** → re-create the backup repo (private, empty), re-add the deploy key, re-run.

Manual push if the workflow keeps failing:

```bash
eval $(ssh-agent -s); cat /tmp/backup-deploy-key | ssh-add -
git push git@github.com:ufalkgm-prog/oltra-backup.git main --force
```

Verify in sync — **use the git protocol, not `gh`**. On Ulrik's Windows machine `gh api repos/.../oltra-beta/commits/main` 404s while the backup one works and `git` pushes fine: an authorization gap on the `gh` token (git uses Windows Credential Manager, `gh` its own keyring), not a missing repo. `gh auth refresh -h github.com` would likely clear it.

**The gap is narrower than "`gh` is broken here", measured 2026-09-12: `gh run list --workflow=backup.yml` works.** It returns each run's status, commit subject and duration, which is exactly what §18 says to go to the Actions tab for — so backup-workflow status is reachable from the terminal even though the commits API is not. Useful when a push has landed and the backup ref is still behind: `gh run list` distinguishes *in progress* from *failed*, where a bare `git ls-remote` cannot.

```bash
git ls-remote origin refs/heads/main
git ls-remote https://github.com/ufalkgm-prog/oltra-backup.git refs/heads/main
```

---
## 19. HOTEL DATA BACKFILL - 16 HOTELS (started 2026-05-22)

Moved to `CLAUDE-ARCHIVE.md` — completed work. Read it there if this task touches it.

---
## 20. HOTEL LAT/LNG GEOCODING

Moved to `CLAUDE-ARCHIVE.md` — completed work. Read it there if this task touches it.

---
## 21. HOTEL DESCRIPTION PARAGRAPH REFORMATTER - PLANNED, NOT RUN

Moved to `CLAUDE-ARCHIVE.md` — completed work. Read it there if this task touches it.

---
## 22. HOTEL DESCRIPTION PARAGRAPH SPACING

Moved to `CLAUDE-ARCHIVE.md` — completed work. Read it there if this task touches it.

---
## 23. NEW HOTEL BATCH — 67 HOTELS (2026-07-07)

Moved to `CLAUDE-ARCHIVE.md` — completed work. Read it there if this task touches it.

---
## 24. HOTEL AWARDS REVIEW WORKFLOW

Moved to `CLAUDE-ARCHIVE.md` — completed work. Read it there if this task touches it.

---
## 25. FULL-COLLECTION AWARDS AUDIT (completed 2026-07-15)

Moved to `CLAUDE-ARCHIVE.md` — completed work. Read it there if this task touches it.

---
## 26. RATEHAWK INTEGRATION — HOTEL MATCHING (complete 2026-08-07)

Moved to `CLAUDE-ARCHIVE.md` — completed work. Read it there if this task touches it.

---
## 27. RATEHAWK — NEXT PHASES

Moved to `CLAUDE-ARCHIVE.md` — completed work. Read it there if this task touches it.

---
## 28. RATEHAWK HOTEL IMAGES — BACKFILL (2026-08-08)

Moved to `CLAUDE-ARCHIVE.md` — completed work. Read it there if this task touches it.

---
## 29. RATEHAWK IMAGES IN THE APP (2026-08-08)

Moved to `CLAUDE-ARCHIVE.md` — completed work. Read it there if this task touches it.

---
## 30. RATEHAWK AVAILABILITY, PRICING & ROOM SELECTION (2026-08-08)

Moved to `CLAUDE-ARCHIVE.md` — completed work. Read it there if this task touches it.

---
## 31. `.env.local` HAD THE WRONG SUPABASE PROJECT (fixed 2026-08-08)

Per §2 there are **two separate Supabase projects**: the Hotel database (behind Directus) and a separate one for auth + member data. `.env.local` had `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` pointing at the **Hotel database** instead of the Members project, so every member feature — login, Add to Trip, Favourites, the header greeting — was aimed at a project with no members schema at all.

**Why it's easy to miss**: there is exactly one Supabase client code path, reading the same two variable names, with no naming distinction in code between "the hotel one" and "the members one". A mix-up produces no error until something queries a members table.

**The probe**: `GET .../rest/v1/member_trip_hotels?select=id` — on the wrong project it returns `PGRST205 Could not find the table ... Perhaps you meant 'public.hotels'`; on the right one, 200 with an empty RLS-gated result.

Also: Supabase renamed the anon key to **"Publishable key"** in the dashboard — same purpose, same place, so don't conclude it's missing.

**For any fresh checkout**: don't assume a shared `.env.local` value is correct. Ask which project, or run the probe first. A dev-server restart is needed after the change.

---
## 32. RATEHAWK / ETG INTEGRATION

Moved to `.claude/rules/etg-ratehawk.md` — it loads by itself when you open a file it covers, and you can read it directly when the work starts before that.

**Certification scope is confirmed (2026-09-16): General, Static Data and Search only — booking and card tokenisation do not apply under the White Label model.** We go as far as Prebook (the p- hash) and stop at a marked redirect seam whose format ETG have not specified — do not guess it. No Create/Start/Check booking process, no card tokens, no 3DS, no webhooks, no Retrieve or Cancel: those endpoints are active on our key and only the proxy allowlist (§47) keeps them unreachable. Sandbox and test bookings are treated as REAL orders — never execute a booking call without Ulrik confirming in that session. **A rate's price covers every room searched — never multiply it by the room count.**

---
## 33. LANDING/HOTELS/FLIGHTS UI FIX SESSION (2026-08-11)

Moved to `CLAUDE-ARCHIVE.md` — completed work. Read it there if this task touches it.

---
## 34. DESIGN-SYSTEM AUDIT & DARK-SURFACE REFINEMENT (2026-08-11 to 2026-08-13)

Moved to `CLAUDE-ARCHIVE.md` — completed work. Read it there if this task touches it.

---
## 35. FINAL PALETTE + TOKEN MIGRATION (2026-08-13, completed 2026-08-16)

Moved to `.claude/rules/design-system.md` — it loads by itself when you open a file it covers, and you can read it directly when the work starts before that.

---
## 36. LOCAL DEV — BETA-LOGIN GATE

The whole site sits behind a password gate: `hotels-beta/src/middleware.ts` redirects any request without a `beta_auth=oltra_beta_granted` cookie to `/beta-login`. This applies to browser navigation (including automated sessions) and to any `curl`/fetch without the cookie.

Password (hardcoded in `src/app/api/beta-login/route.ts` as `BETA_PASSWORD`, already plaintext-committed there): `Oltra2387`

---

## 37. PER-CITY NEAREST-AIRPORT MAPPING (2026-08-14)

Moved to `CLAUDE-ARCHIVE.md` — completed work. Read it there if this task touches it.

---
## 38. RICHER FLIGHT TEASER, CHECKBOXES, INLINE CHIPS (2026-08-14)

Moved to `CLAUDE-ARCHIVE.md` — completed work. Read it there if this task touches it.

---
## 39. HOTELS PAGE FIXES + RESIDENCY REMOVED (2026-08-14)

Moved to `CLAUDE-ARCHIVE.md` — completed work. Read it there if this task touches it.

---
## 40. CREATE-HOTELS-BATCH — MISSING COLUMNS AND VALUE CLEANUP (2026-08-16)

Moved to `CLAUDE-ARCHIVE.md` — completed work. Read it there if this task touches it.

---
## 41. WHERE DATA WORK LIVES — THE `oltra-agents` REPO

### Read this before generating any hotel or restaurant content

**New hotel and restaurant records are researched, generated and staged in `oltra-agents`, not here.** This repo holds application code, import/matching scripts and schema conventions.

**Check `oltra-agents` first.** A session was one step from researching editorial content for 34 hotels that had already been fully staged there the day before — descriptions, taxonomy, coordinates, award flags and all. The work looks missing from inside this repo because its inputs are not in this repo.

Layout (`oltra-agents/agents/`): `database-agent/hotels/{pending,flagged}/`, `database-agent/restaurants/{pending,flagged}/`, `code-agent/{tasks,completed}/`, `marketing-agent/{briefs,drafts}/`, `monitoring-agent/reports/`.

Convention: **everything lands in `pending/` or `flagged/` first, and the path from staging to live runs through Ulrik.** Nothing there is authorised for import by virtue of existing.

### `oltra-agents` has its own rules — do not carry habits across

Its `CLAUDE.md` is **stricter than this one**: read-only by default, with three protected actions (removing, overwriting, editing existing content) each requiring a specific literal keyword in Ulrik's own instruction. Synonyms, implication, prior authorisation and "the usual process" explicitly do not count. Read that file before doing anything there beyond reading.

It also says: *"Do not merge, copy, or move content between the two."* This section is a **pointer**, deliberately. Do not copy `oltra-agents` content into this file.

### What the 2026-08-16 promotion taught

32 records (ids 3001–3032) were promoted in three passes — create, write `ratehawk_hid`, apply images — each verified by an independent readback, no failures. A subset was then **unpublished**: ETG carried no images for them, so they were live with no image source.

**The rule is no longer "published tracks the ETG match". It is:**

> **published requires a `hid` AND an image source.**

**Import-order gotcha — a recorded outcome, not a prediction.** The create → hid → images order *was* followed and still left hotels briefly published with no photo, because whether ETG has images isn't knowable until the image pass runs. Either create unpublished and flip after the image pass, or expect a cleanup pass. Correct ordering is necessary but not sufficient.

**A confirmed `hid` also does not mean the property is bookable.** Read-only `/search/hp/` probes returned rates for some hotels with a confirmed hid and none for others — including two lodges and one Aman, while a *different* Aman and an Airelles returned rates on the same window. **Rate availability is per property, not per brand** — never generalise a zero to a brand, and a zero on one window is not proof a property is never bookable.

**Probe gotcha**: `/search/hp/` takes **`hid`**, not `id`. Sending `id` returns HTTP 400 with zero rates — indistinguishable at a glance from a genuine zero-availability result, and a good way to manufacture a false "nothing is bookable" conclusion. Always run a known-good control in the same batch.

---

## 42. RATEHAWK HOTEL STATUS — ACTIVE / PASSIVE / NOT INTEGRATED (2026-08-16)

Moved to `.claude/rules/etg-ratehawk.md` — it loads by itself when you open a file it covers, and you can read it directly when the work starts before that.

---
## 42B. WATER-PROXIMITY SETTING — COMPLETE (2026-09-11)

Moved to `.claude/rules/hotel-data.md` — it loads by itself when you open a file it covers, and you can read it directly when the work starts before that.

---
## 43. RECURRING DATA MAINTENANCE — SCHEDULE

Data that goes stale on a clock rather than when someone changes something. **When you run one, update its row — that is the only record.**

| What | Interval | Last run | Next due | How |
|---|---|---|---|---|
| Ratehawk hotel status (§42) | Quarterly | 2026-08-16 | **2026-11-16** | `probe-ratehawk-status.mjs` then `apply-ratehawk-status-*.mjs --confirm` (~12 requests) |
| Ratehawk static content (§48) | Daily | 2026-08-24 | automatic (Railway cron) | `etg-static-sync` — no manual step; check the Railway run log if room images go missing |
| Award source files (§25) | When each org publishes | 2026-07-14 | check annually | rebuild `awards-2026/*.json`, then `match-hotel-awards.mjs` per code |
| City → airport mapping (§37) | When the roster's city list changes | 2026-09-14 | on demand | `build-city-airports.mjs` |
| Airport options list (§39) | With the above | 2026-08-31 | on demand | `build-airport-options.mjs` |
| Last-leg transfer times (§52) | With the above | 2026-09-14 | on demand | `build-transfer-times.mjs` — incremental, so a re-run after one new destination costs cents |

* **Ratehawk status is the one needing a human to remember it.** The static-content row runs itself; it's listed so its existence and failure point are on the record.
* Award refreshes are event-driven — T+L published its 2026 list a week before a session happened to check. Annually is a reminder to *look*, not a deadline.
* Re-run the two airport builds after any meaningful batch of new hotels, or destinations resolve to the wrong nearest airport.
* **The invariant between them, verified 2026-09-12 and worth re-checking after
  either build: every IATA code `cityAirports.ts` references must also exist in
  `airportOptions.ts`.** They are generated by two different scripts on two
  different schedules, and the flight teaser resolves a hotel to an airport
  through the first while the search autocomplete offers airports from the
  second — so a code in one and not the other is a destination that resolves to
  an airport the search box cannot accept. Currently **424 referenced, 0
  missing**, which is why the Serengeti's move to JRO/MWZ needed no second
  build. One line to check:

  ```bash
  node -e 'const f=require("fs"),a=f.readFileSync("src/lib/cityAirports.ts","utf8"),o=f.readFileSync("src/lib/airportOptions.ts","utf8");const m=[...new Set([...a.matchAll(/iata: "(\w{3})"/g)].map(x=>x[1]))].filter(c=>!o.includes(`"${c}"`));console.log(m.length?"MISSING: "+m:"ok")'
  ```

* **A second invariant since §52: every (destination, airport) pair needs a
  last-leg answer.** `audit-airports.mjs` fails the run on a pair with none,
  because the gateway ranking then silently drops that airport out of the
  door-to-door comparison and falls back to air time. New destinations arrive
  with no transfer time at all, so **`build-transfer-times.mjs` belongs in the
  same pass as the other two builds** — it is incremental and only prices what
  it has no answer for.

---
## 44. TAXONOMY FIELDS LOCKED + HIGHLIGHTS TYPO PASS (2026-08-16)

Moved to `CLAUDE-ARCHIVE.md` — completed work. Read it there if this task touches it.

---
## 45. UI PASS + SAVED-TRIP SCHEMA (2026-08-17)

Moved to `CLAUDE-ARCHIVE.md` — completed work. Read it there if this task touches it.

---
## 46. SECOND UI PASS, VERIFIED AGAINST A REAL MEMBER (2026-08-17)

Moved to `CLAUDE-ARCHIVE.md` — completed work. Read it there if this task touches it.

---
## 47. ETG FORWARDING PROXY ON RAILWAY (live since 2026-08-20)

Moved to `.claude/rules/etg-ratehawk.md` — it loads by itself when you open a file it covers, and you can read it directly when the work starts before that.

---
## 48. ETG STATIC-CONTENT SYNC — OFFLINE, AND OFF THE HOT PATH (2026-08-24)

Moved to `.claude/rules/etg-ratehawk.md` — it loads by itself when you open a file it covers, and you can read it directly when the work starts before that.

---
## 49. HOTEL GEOGRAPHY SPLIT — `admin_region` + TRAVELLER AREA (2026-08-31)

Moved to `CLAUDE-ARCHIVE.md` — completed work. Read it there if this task touches it.

---
## 50. THE AI CONCIERGE

Moved to `.claude/rules/concierge.md` — it loads by itself when you open a file it covers, and you can read it directly when the work starts before that.

**Read `CLAUDE-AI.md` as well before changing anything under `src/lib/ai` or `src/components/ai`** — it carries the mechanics and the failures this feature already had, and every one of them passed tsc, lint and a build. The rule you are most likely to break without reading either file: the model is never given a price, and that is structural, not a promise in the prompt.

---
## 51. OPEN ITEMS — THE GEOGRAPHY WORKFLOW, PAUSED 2026-09-12

Moved to `.claude/rules/airports-and-flights.md` — it loads by itself when you open a file it covers, and you can read it directly when the work starts before that.

**Run both standing audits before picking this up**, and treat a non-zero DEFECT as the whole task until it is zero again:

```bash
node scripts/hotels/geo-2026/audit-local-area.mjs   # 6 classes
node scripts/airports/audit-airports.mjs            # 6 classes
```

---
## 52. THE AIRPORT IS CHOSEN ON THE WHOLE JOURNEY (2026-09-12)

Moved to `.claude/rules/airports-and-flights.md` — it loads by itself when you open a file it covers, and you can read it directly when the work starts before that.

---
