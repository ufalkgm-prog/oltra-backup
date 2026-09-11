# OLTRA — AI CONTEXT

## WHERE THE CONTEXT LIVES — THREE FILES

Only this one is loaded automatically at session start. It stops at 150,000
characters, and in September 2026 it hit that ceiling: at 304k it was being
rejected outright, and a 51% compression brought it to 149,199 — 800 characters
of headroom, which is about ten lines. So it was split by **liveness**.

| File | Holds | Loaded at start |
|---|---|---|
| `CLAUDE.md` | Rules you can break by accident today | **Yes** |
| `CLAUDE-ARCHIVE.md` | Completed work: 22 sections of what was done and what it cost | No — read on demand |
| `CLAUDE-AI.md` | The concierge's mechanics and bug log | No — read on demand |

**Section numbers are global and unchanged.** §26 is §26 wherever it lives; an
archived section leaves a one-line pointer here, so a `§N` reference always
resolves.

**Read the other file when your task touches its ground** — before an awards
pass, a geography change, a taxonomy edit, or anything under `src/lib/ai`. Not
being in context does not make it optional; it makes it something you have to
go and get. The traps recorded there cost real sessions to find.

**Claude's own memory is a fourth store, and it lives outside the repo** — `C:\Users\ufalk\.claude\projects\C--Users-ufalk-dev-oltra-beta\memory\`, on one machine, not in git. `claude-memory/` is a backup copy of it with a README covering restore and re-sync. It is a copy, so it drifts: **after a session that changes how Claude should work, re-sync it**, or the backup quietly becomes a way to restore a superseded instruction.

**When you add to this file, check the size.** `node -e "console.log(require('fs').readFileSync('CLAUDE.md','utf8').length)"` — characters, not bytes; `wc -c` overstates it because of the accented characters. Past ~140k, move a closed section out rather than compressing a live one.

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

Never write directly to Supabase for content; always go via Directus.

### Hotels

Schema migrated 2026-06: `hotelid` removed (use `id`), `editor_rank_13` → `editor_rank`, the double-underscore state field → single underscore, and `activities`/`awards`/`settings`/`styles` went from M2M relations to flat multiselect tag fields (`setting`/`style` are now **singular**). See §4.

Geography — five fields, each with one meaning (split 2026-08-31, §49):

| Field | Holds | Examples |
|---|---|---|
| `region` | Continent. 10 fixed values. | Europe, Africa, Asia |
| `country` | Country. | Italy, Switzerland |
| `admin_region` | The **administrative** unit — state, province, canton, prefecture, emirate, county. **Never null** (all 903 rows). | Lombardy, Valais, Kyoto Prefecture |
| `state_province_county_island` | The **traveller-facing area** — what someone types into a search box. **Null for a major city**, where `city` does the job. 470 of 903 populated. | Lake Como, Amalfi Coast, Masai Mara |
| `city` | Town, or for a lodge the reserve/area name. | Cernobbio, Sabi Sand Reserve |

Three things that look like bugs and aren't:

* **`admin_region` and `state_province_county_island` may hold the same value** — wherever the administrative unit is also what a traveller types (Tuscany, Bali, Sicily, Rajasthan).
* **`region` means continent.** A user searching "Tuscany" matches the traveller-area field.
* **A major city's traveller area is deliberately empty** (Rome, Tokyo, Marrakech, Geneva). Filling it would repeat `city`.

Both are searchable levels in the destination dropdown (`StructuredDestinationField`), narrowing hotel > city > area > admin_region > country > region. `local_area` is **not** searchable — it holds neighbourhoods (Mayfair, Kowloon).

**`local_area` is strictly sub-city** — neighbourhoods and districts only: Mayfair, Meatpacking, the Paris arrondissements. **Not** a travel area. 19 rows were cleared on 2026-09-11 for holding a region-level value, `Lake Como` among them appearing as a "neighbourhood" across five different towns, which is the inverse of a district: one area spanning many towns rather than one town divided. 17 of the 19 were exact duplicates of `state_province_county_island`, so nothing was lost.

Three were kept that the same test flagged, because they are genuinely below city level and only matched for appearing in the area field too: Capella Singapore's **Sentosa Island**, Amanera's **Playa Grande**, and Fasano's **Punta del Este** — the last because `city` there reads "Maldonado", the department, so `local_area` holds the more accurate of the two.

**Coverage is uneven and that is not all a gap.** 227 of 903 rows carry one. London (30/30), New York (21/21), Paris (19/19), Milan and Venice are complete; Bangkok (1/15), Dubai (2/14), Marrakech (1/10) and Tokyo (1/9) are not. But ~33 cities are correctly empty — Courchevel, Zermatt, Oia, Sabi Sand — because a ski village or a game reserve has no neighbourhoods. Judge coverage against whether the city HAS districts, not against the row count.

**Known problems, not yet fixed** (from the same screen): `Meatpackling District` on two New York rows; **SoHo and Soho inverted** — New York's is SoHo, London's is Soho, and the collection has them the wrong way round; 10 rows repeating the city verbatim (six Phinda lodges, Ngala, Suyian); and three cities disagreeing with themselves — New York carrying `Midtown`, `Midtown East`, `Midtown West` *and* `Midtown Manhattan`, Venice `Giudecca` and `Giudecca Island`.

**`admin_region` is LOCKED** as of 2026-09-11 — `select-dropdown`, `allowOther: false`, **291 choices** built from the stored values. A hotel in a genuinely new administrative region will not save until the list is extended (`scripts/hotels/geo-2026/lock-admin-region-2026-09-11.mjs` holds the pattern and a snapshot of the prior meta). `state_province_county_island` stays free text on purpose: traveller areas gain an entry with every new destination, so locking it trades one problem for another.

**`city` held a region name on three rows**, fixed 2026-09-11: Four Seasons Hampshire → `Dogmersfield`, The Windsor Toya → `Toyako`, Etéreo → `Riviera Maya` (matching five siblings, including the EDITION in the same Kanai development). `admin_region` was right on all three and was left alone. The other 107 rows where `city` equals `admin_region` are correct — city-states and cantons that share their city's name.

**Changing a `city` means rebuilding `cityAirports.ts` in the same pass** (§37, §43, and §49's "geography values are join keys, not display strings"). All three old values were live keys there; the rebuild swapped them for the new ones, 514 → 513 cities. Etéreo joining `Riviera Maya` moved that group's centroid and earned it **CUN at 33km**, which it had not been offered before. Verify after: every published `city` must have an airport entry, or the landing flight teaser resolves it to nothing.

Both are plain `text` columns. `admin_region` is now constrained by a locked choice list (below); `state_province_county_island` is still unconstrained, and §44 records what unconstrained text fields do here — this one had already drifted into `Giorgia` and `Boca Raton`.

Other fields:

* Editorial: `highlights`, `description`
* Stats: `editor_rank`, `ext_points`, `total_rooms_suites_villas`
* Taxonomy tags (flat, §4): `activities`, `awards`, `setting`, `style`
* Editorial single-selects: `primary_setting` / `secondary_setting` / `primary_style` / `secondary_style` (locked to choice lists as of §44; not wired into app code)
* Award booleans, one column per accolade: `best50`, `cn`, `forbes5`, `michelin3keys`, `telegraph`, `tl100`, `aaa5d`
* Links: `www`, `insta`
* Booking: `booking_provider`, `booking_URL` (capital URL — `official_website_booking_url` does not exist), `booking_enabled`, `booking_label`, `booking_hotel_ref`, `booking_notes`
* Agoda: `agoda_hotel_id`, `agoda_photo1`–`5`
* Ratehawk: `ratehawk_hid`, `ratehawk_image_1`–`50` (+ `_category`), `ratehawk_status` (§42), and the static-content fields in §48
* Geo: `lat` / `lng` — Directus reports these as `type: "integer"` but `schema.data_type` is `numeric` and decimals round-trip intact. **Never `Math.trunc` a coordinate** (§40).

### Restaurants

Separate Directus collection (`restaurants`): `id`, `status`, `rank`, `restaurant_name`, `slug` (kebab-case, unique — the upsert key), `description`, `highlights`, `restaurant_type` (`Fine dining` | `High-end casual` | `Informal local favorite` | `Beach club`), `cuisine`, `restaurant_setting`, `restaurant_style`, geography fields, `lat`/`lng`, `www`, `insta`, `awards` (JSON array: `michelin_3`, `michelin_2`, `michelin_1`, `worlds_50`, `laliste100`), `sources`, `hotel_name_hint`.

**Coverage: 63 cities, 2,192 records (2026-06-28), all Google Maps–geocoded.** Source JSON lives in `hotels-beta/scripts/restaurants/updated_restaurants/` (the original 23 cities) and `newrestaurants/` (everything added since). Old v2 files are archived in `olddata/`.

`restaurants.lat`/`lng` are `numeric(10,5)` with no Directus integer-cast override — decimals round-trip to 5 d.p.

### Scripts

```bash
# from hotels-beta/ — slug-based upsert, safe to re-run, --dry-run first
DIRECTUS_URL=... DIRECTUS_TOKEN=... node scripts/restaurants/directus-upsert-restaurants-batch.mjs --dir scripts/restaurants
```

New city: add geocoded JSON to `newrestaurants/` → `node scripts/restaurants/geocode-new-restaurants.mjs --only "City Name"` (updates lat/lng in place) → upsert → add the city to that script's CITIES array. Geocoding is ~$5/1000 requests; a 35-restaurant city costs ~$0.18.

---

## 4. TAXONOMY SYSTEM

`activities`/`awards`/`setting`/`style` are flat multiselect tag fields on `hotels` (native Postgres `text[]`), not relational. The old M2M collections no longer exist.

* Each stored value **is** the display label — no id → name resolution.
* Canonical choices live on the field in Directus: `meta.interface = "select-multiple-dropdown"`, `meta.options.choices`, `allowOther: false`.
* Field names are **singular**: `setting`, `style`. `activities`/`awards` stay plural.

### Filtering mechanics

Directus `_contains`/`_in` throw `500` against native array columns — they cannot be used for server-side filtering.

* `activities` / `setting` / `style` filter as a **JS-side post-fetch pass**: `filterHotelsByTags()` in `/src/lib/hotelFilters.ts`. OR within a field, AND across fields.
* `awards` (the "Accolades" facet) instead uses the **7 boolean columns**, which Directus can filter natively (`_eq: true`, OR'd). Allow-list in `/src/lib/hotels/awardCodes.ts`, shared between the server filter builder and the client badge UI so they can't drift.
* The general `awards` tag field is separate from the 7 booleans and isn't wired into any UI.

The `/editor/hotels/[id]` tool sources its checkbox options live from each field's `meta.options.choices` — `getEditorTaxonomies()` in `/src/lib/editorHotels.ts`.

### Writing these fields via the API — the trap

Directus tags these columns `type: "unknown"` (it has no concept of a native array column). Harmless for reads. It breaks on **both `POST` and `PATCH`**: a plain JS array gets JSON-stringified and Postgres rejects it — `malformed array literal`. Send a **Postgres array-literal string** instead, e.g. `{"Spa","Fitness"}` wrapped in quotes. Helper `toPgArrayLiteral` is in `scripts/hotels/new-hotels-2026/create-hotels-batch.mjs`. Any script that creates or updates these fields needs it.

---

## 5. KEY ARCHITECTURE FILES

**Hotels** — page `/src/app/hotels/page.tsx`, UI `/src/app/hotels/ui/HotelsView.tsx`. Helpers: `/src/lib/directus`, `/src/lib/hotelFilters` (Directus filter builder + `filterHotelsByTags`), `/src/lib/hotelOptions`, `/src/lib/hotelSearchSuggestions`, `/src/lib/hotels/awardCodes`, `/src/lib/hotels/buildBookingLink`, `/src/lib/hotels/cardHelpers`, `/src/lib/editorHotels`.

**Restaurants** — `/src/app/restaurants/page.tsx`, `/src/app/restaurants/ui/RestaurantsMapView.tsx`, `/src/lib/restaurants`.

**Flights** — `/src/app/flights/page.tsx`, `ui/FlightsView.tsx`, `ui/FlightDetailsPopup.tsx`, `ui/AirportAutocomplete.tsx`. Data: `/src/lib/flights/duffelNormalizer.ts`, `/src/lib/flights/airlineAlliances.ts`, `/src/lib/airportOptions.ts`. Routes: `/src/app/api/flights/{search,book-link,offer/[id]}`.

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

Featured-mode cycling: the pool is every hotel with at least one real photo — `hasHotelPhotos()` in `cardHelpers.ts`, Ratehawk preferred, Agoda fallback (§29) — with no ext_points restriction. Random shuffle with ≥30 positions between repeats across cycle boundaries (same algorithm as `LandingBackground.buildCycle`), via `featuredCycleRef` / `featuredTailRef`, advancing every 5s.

---

## 7. RESTAURANTS PAGE LOGIC

Read `city` from the URL (default Paris) → resolve against available cities with alias expansion → fetch all restaurants for the city → render map + list via `RestaurantsMapView`.

**Type filter**: client-side `selectedType` (default `"All"`), values matching `restaurant_type` exactly. Filters both list and markers, refits map bounds on change, resets to All when the city changes, count label dynamic.

**City aliases**: Saint Tropez and Ramatuelle are one cluster via `expandCityAliases([city])` — selecting either includes the other, merged and deduped by `id`.

---

## 7B. FLIGHTS PAGE LOGIC (DUFFEL)

### Data model — single ticket per offer

A return trip is **one Duffel offer with two `slices`** at a single `total_amount`. There is no "two one-way tickets" scenario. Inside a slice, `segments[]` are the legs; a slice can legitimately mix carriers. Slices may carry `duration` directly, segments may not — fall back to arriving_at − departing_at.

### `FlightLeg` (`duffelNormalizer.ts`)

Beyond the obvious: `airlines[]` (distinct marketing carriers in segment order, for the combined card label), `longHaulAirline` (carrier of the longest segment, for Tier-A matching), `layovers[]` (`code` for filter logic, `name` for display), `segments[]` (incl. raw `departIso`/`arriveIso` with offset for TZ math), `stopSummary`.

### Return-trip matching (`getReturnMatchTier`)

* **Tier A** — same `longHaulAirline.iataCode` → strong highlight + "Same airline".
* **Tier C** — all carriers across both legs in one alliance (`airlineAlliances.ts`) → light highlight + "Alliance partner".
* The selected card's white outline overrides match styling visually.

### Smart defaults

Max-duration sliders auto-set per result set to `clamp(6, 24, ceil(minDuration × 1.5))`, tracked by `autoDurationKeyRef` so user adjustments survive rerenders but a new search re-applies. Airline filter prefills with all airlines present. Layover filter keys on IATA, displays city names via `layoverAirportMap`. Default departure interval 08:00–24:00 (slider `max=24` so end-of-day is reachable).

### Column alignment

Only `.resultsScroll` scrolls; headers and pinned rows sit outside it. A `ResizeObserver` toggles `hasScrollGutter`, applying `.withScrollGutter { padding-right: 12px }` so columns stay aligned when the scrollbar appears.

### Booking

`BookingBar` was removed. The only book action is the BOOK button inside each `PriceCard`, active only for the Top pick / Fastest rows and the user-selected itinerary. Opens the partner URL via `/api/flights/book-link`.

### Cards and popup

Cards are fixed `height: 96px`, three rows: `dep → arr` + duration + (i); airline names + match badge; stop summary. The (i) opens `FlightDetailsPopup` with per-segment detail, layovers, total travel time, and time-zone change computed from the ISO offsets.

### Autocomplete

`AirportAutocomplete` clears on focus, needs ≥2 chars, restores the previous label on blur if nothing new was picked. Panel `min-width: 320px`, `white-space: nowrap`.

### Deep links

`buildInitialSearch` reads `cabin` and `tripType`. Cabins: `Economy | Premium Economy | Business | First`. Trip types: `oneway` (or `one-way`) `| return | multiple`.

**Both one-way spellings only since 2026-09-04** — the URL value has always been `oneway` but the page's own `TripType` is `"one-way"`, so `?tripType=oneway` selected nothing (§50).

**Multi-city legs travel as `leg1`…`leg5`**, each `ORIGIN-DEST-YYYY-MM-DD`. Added 2026-09-04; before that `multiple` mode could not be reached by link. Real legs override `tripType`. The form searches only when every leg is complete — send whole legs and let the array be trimmed to what arrived.

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

**LandingBackground** — 49 images in `/public/images/landing/`, cross-fade + Ken Burns motion, `buildCycle` guarantees ≥20 positions between repeats. **No dark overlay** — the `rgba(0,0,0,0.34)` layer was removed.

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

**This is the live section for anything ETG.** §26–§30 are the build history.

### Model

Affiliate API, contract AFF-392026. ZenHotels is the consumer brand, RateHawk the partner API layer, same inventory. **Use Affiliate API documentation only** — never B2B/wholesale endpoints, `deposit` payment type, net pricing, or fake-gross commission. myOLTRA is never merchant of record.

Agreed architecture: myOLTRA owns discovery (search, hotel pages, rate display). ZenHotels owns checkout at `hotels.myoltra.com` via CNAME and is merchant of record.

### BLOCKED — do not build

The handoff to the ZenHotels checkout is undocumented and pending written confirmation from ETG (asked 10 Aug 2026). Until it arrives, do not write: Create / Start / Check booking process; credit card tokens, `pay_uuid` / `init_uuid` / `return_path`, 3DS; booking status webhooks or state machines; Retrieve or Cancel booking.

Unknown until answered: at what point we redirect, what we pass across, and whether any booking endpoint stays on our side.

**Sandbox and test bookings are treated as real orders.** Do not execute any booking call without explicit confirmation from Ulrik in-session.

### Hosts and credentials

`RATEHAWK_API_URL` is a single config value read from env, never hardcoded per call. **Since 2026-08-19 deployed environments point it at the Railway proxy** (§47), which holds the credentials and gives ETG fixed source IPs. Local dev calls ETG directly. The single-config-value rule is what made that a one-variable change.

ETG's stated production host is `api.ratehawk.com` (migrated from `api.worldota.net`, same auth and payloads). Host configuration was established during live testing — **the code wins over documentation**; note a discrepancy rather than "correcting" it.

Sandbox key: RateHawk Backoffice → Settings → API tab. One key covers search, booking and content. Never mix keys, IDs or static content across environments.

#### What this key reaches — Content API enabled 2026-08-24

| Endpoint | Status | Rate limit (our key) | Docs claim |
|---|---|---|---|
| `GET /api/content/v1/filter_values` | 200 | 30 / 60s | 60 QPM |
| `POST /api/content/v1/hotel_ids_by_filter/` | 200 | 30 / 60s | 60 QPM |
| `POST /api/content/v1/hotel_content_by_ids/` | 200 | 30 / 60s | 1200 QPM, max 100 hids |
| `POST /api/b2b/v3/hotel/info/` | 200 | 30 / 60s | — |
| `POST /api/b2b/v3/hotel/info/dump/` | 200 | 5 / 60s | — |
| `POST /api/b2b/v3/hotel/info/incremental_dump/` | 200 | 5 / 60s | — |

**The real per-key limit is what `debug.api_endpoint` reports, not what the docs say** — the docs advertise 1200 QPM for `hotel_content_by_ids` and our key returns 30. Read the limit off the response.

**A 524 is not a 403 — do not read it as "still not enabled".** A Cloudflare `524` after 100s with no ETG `debug` block means the request *reached* ETG and the backend took too long. Cause was the body: `hotel_ids_by_filter` takes `country` / `kind` / `star_rating` / `serp_filter` / `updated_since` / `supplier_type` / `preferable` / `top` **and nothing else**. There is no `limit`, no `region_id`, no `inventory`; unknown keys are silently ignored, so `{inventory, limit, region_id}` is an unfiltered global query over ~3.16M hotels that times out at the edge. Any real filter answers in 1–7s.

`country` takes ETG's own **integer** country ids (Monaco 120, France 59, UK 190 — 234 total), not ISO codes. Get them from `filter_values`, which is a **GET with no body**, unlike everything else here.

#### `hotel_content_by_ids` vs `/hotel/info/`

Compared field-by-field on three hotels: **36 keys from `/hotel/info/`, 35 from `hotel_content_by_ids`, zero differing values on the 35 shared keys.** The single omission is the top-level `images` array — the deprecated one byte-identical to `images_ext`. Costs nothing.

**`rg_ext` is present and identical** (33,519/33,519 room groups across the roster), which is what room-image matching depends on. Room-group images, `room_group_id`, `name_struct`, `room_amenities`, `size`, `metapolicy_struct` and `metapolicy_extra_info` are all present too — so swapping the static source is a source change only.

Request body is `{hids: [Int], language: "en"}`. **`ids` (the legacy string form) is deprecated** — use `hids`, which is what `hotels.ratehawk_hid` already stores.

#### Measured cost of a full static pull

853 hotels with a hid → **853 returned, zero missing, 9 requests, 8.5s, 58.7 MB**, covering 33,519 room groups and 160,972 room images. 101 hids returns `400 invalid_params`.

**This replaced the full dump as the sync source** — the dump is ~2.8 GB and ~10 minutes for the same 853 hotels. `updated_since` on `hotel_ids_by_filter` works for incremental refresh, but returns hids across **all** of ETG's inventory matching the filter (France alone: 199,074 total), so intersect locally — and at 8.5s for a full refresh, incremental may not be needed.

**The offline-sync rule is unchanged.** ETG's docs: *"Do not call this endpoint during live user search sessions or when displaying hotel lists. This endpoint is intended exclusively for scheduled, offline content synchronization."*

### ETG source IPs

Supplied 17 Aug 2026 as the addresses to whitelist **on our side**: `95.213.146.120/29`, `5.8.78.64/29`, plus Cloudflare's published ranges. **Only relevant if ETG calls us, i.e. webhooks** — still open pending the handoff answer, so no action yet. The two `/29` blocks are the meaningful ones; the Cloudflare list is far too broad to be a real control.

### Flow (our scope)

Search by hotel IDs / region / geo → Retrieve hotelpage → Prebook → [handoff to ZenHotels — mechanism TBC]. Hash chain: `h-…` from hotelpage → Prebook → returns `p-…`. **Prebook is part of the search step** and must be excluded from the booking flow.

**Implementation gap**: the current code never calls a separate Prebook endpoint — `book_hash` is read off each `search/hp/` rate and stored unused. Adding the real Prebook call is new scope, still pending the BLOCKED question.

### Static content

Built 2026-08-24 — `etg-static-sync/`, §48. Daily job, Content API, 853 hotels in 9 requests. The dump (weekly) and incremental dump (daily) remain a fallback. **The live path no longer calls ETG for static data at all** — the only `/hotel/info/` references under `src/` are comments.

### Display rules (all certification-checked)

* **Pricing is gross** — `amount` / `show_amount` already include ETG's commission. Never add markup. Verified: `ratePrice()` reads `show_amount`/`show_currency_code` directly.
* **Non-included taxes shown separately**, never folded into the price. `tax_data.taxes` lives on the rate's **primary payment type** (`payment_options.payment_types[0].tax_data.taxes`), not on the rate. Each room row shows "+ taxes at hotel" when a non-included tax exists; the detail popup lists included taxes (informational) separately from not-included ones, in their own currency (a Dubai city tax in AED beside a USD room price) and never converted into the headline.
* **Cancellation policies** parsed from `cancellation_penalties.policies`, shown unmodified. Like `tax_data`, this lives on the **primary payment type**, not the rate — before that was found, `freeCancellationBefore` read as `undefined` on every rate and the popup always said "Non-refundable". `free_cancellation_before: null` means no free cancellation. The popup renders the full schedule — every window and its charge, with `0` shown as "no charge" rather than omitted.
  * ETG returns bare no-offset UTC timestamps. `new Date()` on `"2026-09-22T11:00:00"` parses as **local** per the JS spec — append a "Z" first. `formatRatehawkUtcDateTime()` converts to browser-local with an explicit `GMT±N` label.
  * **`Intl`'s `toLocaleString` throws `RangeError` if `dateStyle`/`timeStyle` are combined with `timeZoneName`** — a hard crash on opening the popup, not a silent no-op. Spell out `year`/`month`/`day`/`hour`/`minute` individually instead.
* **Room static data matched on `rg_ext`**, compared **field-by-field**. Never compare `rg_ext` via `JSON.stringify()` — `/search/hp/` and `/hotel/info/` serialize the same object in different key orders, so identical data fails. (The earlier "0/5 matches, use room_name" finding was this bug plus a `RawRoomGroup` type that never declared `rg_ext`.) `room_name` containment is now only a fallback, and logs a warning.
* Rate name from `room_name`; meal type from `meal_data.value`, never presented as better than what ETG sent.
* First search step shows one or two lowest rates per hotel; all rates only on the hotel page.
* ETG is our only supplier. Upsells (early check-in / late check-out) are not applicable to the Affiliate API — skip.
* **`residency` collected on the first search step** and sent on all `/search/serp/*/` and `/search/hp/` requests. Hardcoding a default counts as not implementing it. Auto-detected from browser locale and sent on every request; the visible selector was removed after measuring the effect at ≤3% (§39).
* **Parse and display `metapolicy_struct` and `metapolicy_extra_info`** — neither is read anywhere in the current code. Implementation gap.

### Caching

Never cache Retrieve hotelpage or Prebook responses — prohibited. Hotelpage rates are storable ~1 hour for display only. Verified: `/api/ratehawk/availability` fetches fresh every request.

### Limits and timeouts

* Max 300 hotels per Search by hotel IDs request.
* Max 9 rooms per rate, same room type only.
* Max 6 adults + 4 children per room; children are 17 and under, ages passed as an array (`"children": [7]`). `buildGuestsArray()` already sends ages as an array but enforces none of these limits.
* Stays up to 30 nights; check-in no more than 730 days out. Not enforced in the search form.
* Search timeout 30s recommended, sent as an explicit `timeout` parameter — **not currently sent**. Distinct from the HTTP client timeouts in §47.
* Prebook timeout 60s recommended, 30s minimum; set on ETG's side.
* `price_increase_percent` 0–100. Any value above 0 requires showing the price change before proceeding. Default TBC.

### Certification deliverables (non-code)

Test hotel `hid` 8473727 / `test_hotel_do_not_book` must be mapped — confirmed present. Plus a diagram comparing ETG endpoints against the myOLTRA flow, a workflow table (step, triggering user action, endpoints), and RPM estimates for `/serp/hotels`, `/serp/region`, `/serp/geo`, `/search/hp`, `/hotel/prebook`, `/serp/prebook`. Scope of certification under the white-label model is itself unconfirmed.

### TODO before certification (deferred)

* Parse and display `metapolicy_struct` / `metapolicy_extra_info`.
* Enforce the limits above — none are enforced in the search form today.
* **No chunking at the 300-hotel limit** in `api/ratehawk/availability/batch/route.ts` — it forwards whatever it's given. Doesn't bite today (results mode caps at 50, landing at 40); would bite if either cap rises or a region-wide search is added.
* **No explicit ETG `timeout` parameter** on search requests.

Resolved and no longer open: IP whitelisting (mandatory — §47), where the sync runs (Railway — §48), Content API provisioning, live static fetching (§48), residency, taxes, cancellation, `rg_ext`.

### Contacts

Valeriy Korobov (integration) — apisupport@ratehawk.com · Sofia Kamalova (integration launch, handles IP whitelisting) · Seseg Shuianova (commercial) — s.shuianova@emergingtravel.com

---

## 33. LANDING/HOTELS/FLIGHTS UI FIX SESSION (2026-08-11)

Moved to `CLAUDE-ARCHIVE.md` — completed work. Read it there if this task touches it.

---
## 34. DESIGN-SYSTEM AUDIT & DARK-SURFACE REFINEMENT (2026-08-11 to 2026-08-13)

Moved to `CLAUDE-ARCHIVE.md` — completed work. Read it there if this task touches it.

---
## 35. FINAL PALETTE + TOKEN MIGRATION (2026-08-13, completed 2026-08-16)

Supersedes §34's shipped text colours. A fully prescriptive spec from Ulrik, shipped straight to bare `:root` as `a2b1c30`, with the live-component migration in `15c8ea8`. §34's radius scale is unaffected.

**Surfaces**: base `--oltra-bg-color: #2c3634`; raised panel/card `--oltra-field-bg-solid: #374240`; recessed field `--oltra-field-bg: #232c2a`; field border `--oltra-field-border: #3e4947`.

**Text — three solid roles, no opacity variants**: primary `--oltra-text-primary: #f5f2ec` (headings, body, values, labels on outline buttons); muted `--oltra-text-secondary` / `--oltra-text-muted: #cbd0cb` (secondary and metadata only — the two names alias one value, there is no third tier); placeholder `--oltra-text-placeholder: #c0c6c1`; disabled `--oltra-text-disabled: #787774` (deliberately sub-AA, only where nothing essential is carried by the text alone).

**Fields are solid recessed, not translucent** — every form field is `--oltra-field-bg` + 1px `--oltra-field-border`. Translucency survives **only** where glass does real work over imagery: map popups, the featured-mode hero search panel, the featured hotel card, the map container.

**Dropdowns and popups are raised, not recessed** — `--oltra-field-bg-solid` panel, `--oltra-dropdown-border` (`1px solid #738783`), hover `#414c4a`, selected `#4c5754` + primary text.

**Badges/chips** are recessed like fields, with their own `--oltra-badge-text` token (aliases muted) so badge colour can't drift from body text by accident.

**Buttons** keep the sage family, recomputed: active `--oltra-button-active-bg: #7ba079` with **dark** text `#232c2a`; inactive transparent fill, `--oltra-button-inactive-border: #6c8c6a`, primary text. **Gold buttons were never shipped and are not pending** — §34 flagged that as an open decision; §35 settled it as recomputed sage.

**Error**: `--oltra-error-text: #ff8a71`. **Type size**: metadata/secondary raised from 11px to 12px wherever it appears.

### Live-component migration

Changing what a token *resolves to* does nothing for components holding literal `text-white/NN` utilities. Migrating those to `text-[color:var(--oltra-text-primary)]` — the Tailwind-v4-without-a-config convention here, since there's no config file or `@theme` block — is separate work, now complete.

**Methodology for future passes**: primary for headings, body copy, values and icon glyphs on solid fills; muted for metadata, status and helper text; the recessed field treatment for filter/status pills; and a **two-step muted→primary hover** for small utility links and icon-only buttons, since a solid three-role system has no continuous opacity scale to step through. The hotel Description body is **primary** (it is "body"); smaller highlights blurbs are **muted**.

### New tokens (2026-08-16)

`--oltra-border-subtle/-soft/-medium/-strong` and `--oltra-surface-lift-soft/-lift/-lift-strong`, banded from the values actually in use. **Deliberately kept translucent**, unlike the solid text and field tokens: they sit inside glass over imagery where a relative lift is correct, and it means the pass preserved rendering rather than shifting it. Making them solid is a separate, visible decision.

`--oltra-border-field` and `--oltra-border-panel` were **removed** — sandbox duplicates gone stale (`-panel` still held `#738783` after the pane border softened to `#545F5D`, so `/theme-test` drew borders the live site no longer used).

### Deliberately NOT tokenised — check here before "finishing" any of them

* **Map and photo-overlay chrome**: `.oltra-temp-controls__*` and `PageShell`'s `.intro` (it carries a `text-shadow` and sits over a hero image — overlay chrome, and that question is settled).
* **Functional borders at alpha 0.32+** — checkbox edges, focus rings, the selected flight-card outline. These are the only cue for what they enclose.
* **The Info pill** (`.infoButton`: `background:#fff; color:#111`) — a deliberately inverted control, not a theme colour.
* **`@media print` `#000`/`#fff`** in `members.css` — paper is white.
* **`/editor/*` and `TopNav.tsx`** — an internal tool that doesn't follow the design system, and dead code (`TopNav` is never imported anywhere).

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

32 records (ids 3001–3032) were promoted in three passes — create, write `ratehawk_hid`, apply images — each verified by an independent readback, no failures. A subset was then **unpublished**: ETG carried no images for them and Agoda photos were empty, so they were live with no image source.

**The rule is no longer "published tracks the ETG match". It is:**

> **published requires a `hid` AND an image source.**

**Import-order gotcha — a recorded outcome, not a prediction.** The create → hid → images order *was* followed and still left hotels briefly published with no photo, because whether ETG has images isn't knowable until the image pass runs. Either create unpublished and flip after the image pass, or expect a cleanup pass. Correct ordering is necessary but not sufficient.

**A confirmed `hid` also does not mean the property is bookable.** Read-only `/search/hp/` probes returned rates for some hotels with a confirmed hid and none for others — including two lodges and one Aman, while a *different* Aman and an Airelles returned rates on the same window. **Rate availability is per property, not per brand** — never generalise a zero to a brand, and a zero on one window is not proof a property is never bookable.

**Probe gotcha**: `/search/hp/` takes **`hid`**, not `id`. Sending `id` returns HTTP 400 with zero rates — indistinguishable at a glance from a genuine zero-availability result, and a good way to manufacture a false "nothing is bookable" conclusion. Always run a known-good control in the same batch.

---

## 42. RATEHAWK HOTEL STATUS — ACTIVE / PASSIVE / NOT INTEGRATED (2026-08-16)

### The problem

Hotels Ratehawk cannot price showed **"No availability"**, which reads as "sold out for your dates". For a large minority of the roster that is simply wrong — the property isn't sold through Ratehawk at all, for any date.

### Not a sandbox artefact — verified, not assumed

Probing the published inventory across four windows: **664 active · 136 passive · 53 not integrated**. The passive set is almost entirely safari lodges, private islands and remote luxury — Singita, &Beyond, Wilderness, Londolozi, Royal Malewane, North Island, Aman Bhutan, Ritz Paris — exactly the properties that sell direct or via specialist agents rather than bedbanks. A sandbox restriction would not selectively exclude *those* while returning rates for hundreds of city hotels on the same key. **Going live will not change this; do not wait for it.**

### The probe-design trap — read before re-running

The intuitive design ("probe far out so nothing is merely sold out") **gives the wrong answer**:

| Check-in | Hotels with rates (of 800) |
|---|---|
| +45 days | 570 |
| +90 days | 561 |
| +150 days | 559 |
| +270 days | 567 |
| **~14 months** | **96** ← collapse |

A window ~14 months out measures *how far ahead inventory is loaded*, not whether a hotel is on Ratehawk. Several windows are still needed: each sits near 560, well below the 664 bookable on at least one, so ~100 hotels are merely sold out on any given window and a single probe would mislabel them. The script generates windows from *today* so this can't creep back as the file ages.

### Field and scripts

`ratehawk_status` — `select-dropdown`, `allowOther: false`, values `active` / `passive` / `not_integrated`. `not_integrated` = no `ratehawk_hid` **or** no `ratehawk_image_1`. Deliberately **not** the pre-existing free-text `status_notes` — a value the app branches on must not be free text (§40, §44).

* `probe-ratehawk-status.mjs` — **read-only**, writes a JSON report. Batches hids 300 at a time (§32's limit), so the whole inventory is ~12 requests. **A failed request throws rather than being read as "no rates"** — that would silently mark hotels passive.
* `add-ratehawk-status-field.mjs` — one-shot, idempotent, schema snapshots either side.
* `apply-ratehawk-status-2026-08-16.mjs` — dry-run by default. Unlike the `apply-award-review-*` scripts it is **not** a hardcoded one-time record: it reads whatever `--report` it's given, so the quarterly re-probe reuses it as-is.

### App behaviour and caveats

A passive hotel shows **"Check availability on website"** linked to `www` (deliberately neutral rather than the error-toned pill), is **excluded from the availability batch** on both the Hotels page and the landing summary (~17% fewer hids per call), and sorts **between** available and sold-out — it isn't a dead end.

* **Re-probe quarterly (§43)** — a passive hotel can start distributing.
* **`active` means "bookable at least once", not "bookable now".** A live "No availability" is still correct for an active hotel on sold-out dates — the stored status and the live check are complementary.
* Probe occupancy is 2 adults / 1 room, residency `gb`. A property selling only family rooms could in principle be misfiled; not observed.

---

## 42B. WATER-PROXIMITY SETTING RECLASSIFICATION (redefined and started 2026-09-10)

**These definitions replace the ones agreed 2026-08-16, and one pair is inverted — read the table, do not go from memory.**

| Value | Means |
|---|---|
| `Beachfront` | On an actual sandy beach, **nothing between** the hotel and the sand |
| `Beach` | Overlooking the beach with a **road or small obstruction** between — under 5 minutes' walk |
| `Oceanfront` | On the ocean but **not a beach**, including clifftops a limited distance above it |
| `Waterfront` | **All other water** — rivers, lakes, canals. Absorbs `Lakeside`, `Riverside`, `Canalside` |
| `Coastal` | Near the ocean but not on it — a clifftop 20+ minutes from reaching the water |
| `Seaside`, `Clifftop` | **To be retired**, reclassified into the above |

**`Beach` and `Beachfront` swapped meaning.** August had `Beachfront` = "truly on the beach" and `Beach` = "walking distance". September makes `Beach` the *weaker* value. Ulrik was offered both directions and chose this one deliberately, because the existing 163 `Beachfront` rows mostly do sit on sand and stay correct — the alternative moved ~130 records for no gain. A guest filtering "Beachfront" gets the stronger set.

**`Waterfront` is now the generic for fresh water**, so `Lakeside` (34), `Riverside` (29) and `Canalside` (8) retire into it. This removes Lakeside as a filter facet, which was flagged and accepted.

### Progress

| Batch | Scope | Status |
|---|---|---|
| 1 | the 37 tagged `Waterfront` | **Applied 2026-09-10** — 36 written, 1 no-op, 0 failures, verified by re-read |
| 2 | `Lakeside` + `Riverside` + `Canalside` (71) | **Applied 2026-09-11** — 71 published + 4 unpublished written, 0 failures. All three values **retired from the choice lists** |
| 3 | `Coastal` + `Oceanfront` (99) | **Applied 2026-09-11** — 13 written, 86 unchanged, plus 4 contradictory pairs the triage missed. **0 rows now carry two water values** |
| 4 | `Seaside` + `Clifftop` (8 rows) | **Applied 2026-09-11** — 8 written, 0 failures. Both **retired from the choice lists** |
| 5 | `Beachfront` (200) | **Applied 2026-09-11** — `Beach` retired into it, one bad row retagged. §42B complete |

Batch 2 artefacts: `apply-freshwater-batch2-2026-09-11.mjs` + rollback. Batch 1: `scripts/hotels/settings-2026/apply-waterfront-batch1-2026-09-10.mjs` and its appending rollback record. **A one-time record of a reviewed session, not a tool** — copy the pattern for the next batch, per §24.

**Only the water tag is touched.** A hotel tagged `["City","Waterfront"]` keeps `City`; the water value is replaced in the array and in whichever of `primary_setting`/`secondary_setting` held it. Explicit instruction, and it is what makes a batch safe against rows whose other tags were never reviewed.

**"Mechanical" was wrong, and checking cost one query.** Batch 2 was called a straight rename needing no review. Ten of the 71 turned out to be SALT water wearing a freshwater tag: the Oberoi Mumbai tagged `Riverside` while facing the Arabian Sea, three Bosphorus hotels the same, and Loch Torridon — a sea loch — tagged `Lakeside`, its own highlights calling it a "lakeside escape". A merge is only mechanical once you have looked at what is being merged.

The three Bosphorus hotels were set to `Oceanfront` to match Mandarin Oriental Bosphorus from batch 1. **Four hotels on one strait had to agree**, and only the review surfaced that they did not.

**A contradictory PAIR hides where a wrong tag does not.** Batch 3 found four hotels carrying two water values that cannot both hold — `Beachfront` + `Coastal` claims a private beach *and* twenty minutes from the water. Each half looks defensible alone, which is why they survived every earlier pass, and why text-signal triage misses them: nothing in the prose is wrong.

**Check for them directly, and check the whole collection, not the batch's scope.** Batch 3's triage looked for `Coastal` + `Oceanfront` overlap and found none — but a row tagged `Beachfront` + `Coastal` enters the scope through its `Coastal` half while the contradiction sits in the other, so it read as a clean single-value row. Four more surfaced only in the post-write verification, which scanned all 903 rows for "more than one water value" rather than checking the ids the batch had touched. **Write that check into the verification of every batch.**

### What the machine cannot decide, measured not assumed

**OSM is not a usable signal for this roster.** Tested live 2026-09-10: Velaa Private Island returned **zero** `natural=beach` polygons — a Maldivian resort that is nothing but sand — confirming §42B's original worry about coverage outside Europe. Measuring to a polygon's `center` also put One&Only Le Saint Géran 637m from a beach it sits on; distance must be to the nearest vertex, not the centroid. Both Overpass mirrors then returned 504 partway through six queries, so 268 of them was never realistic.

**Our own editorial text does not settle it either.** Across the 268 in-scope hotels, "direct beach access" appears 8 times and "across the road" **zero**. The descriptions are evocative, not diagnostic — they establish that there is a beach, never what lies between it and the hotel.

So the Beachfront/Beach line is a human call in every case, which is why batches go through a review artifact (the §25 awards pattern) with a proposed value, the quoted evidence, and a confidence flag. In batch 1 Ulrik overrode 4 of 37 proposals — Six Senses Samui and Cap Estel to `Beachfront`, Fouquet's Saint-Barth to `Oceanfront`, and Baku left as `Waterfront`.

Retiring a value means converting the arrays **then** removing the choice from the field's `meta.options.choices`, or the filter keeps offering a dead option (§44). All five retirements are done — `Lakeside`, `Riverside`, `Canalside`, `Seaside` and `Clifftop` **removed from all three fields**, `setting`, `primary_setting` and `secondary_setting`, which §44 locked to one shared list. The `setting` vocabulary went 22 → 17.

**§42B is complete.** Final vocabulary — `Beachfront` (200), `Waterfront` (75), `Oceanfront` (62), `Coastal` (25). Four values, one meaning each, `setting` down from 22 choices to 16, and **0 rows carrying a retired value, two water values, a duplicate tag or an empty setting**.

**`Beach` was retired rather than populated**, and that is the interesting decision. It was meant to hold "a road between the hotel and the sand" — but settling that needs a per-hotel judgement across 194 rows, OSM cannot answer it for this roster, and our own editorial text says "across the road" ZERO times in 268 descriptions. The distinction cost more than it was worth, so `Beachfront` now means at or on the beach without claiming how many metres. **A category nobody can populate reliably is worse than no category**: it looks like information and is noise.

**`Beach` is STILL a valid `activities` value.** Only the `setting` one retired. Removing both from `taxonomy.ts` would have silently broken the Inspire beach purpose, whose mapping uses the activity — caught by reading the grep hits rather than acting on the count.

**A retire has more consumers than the Directus field, and the grep is not optional.** `lib/ai/taxonomy.ts` mirrors this vocabulary as a JSON Schema enum for the concierge, where a stale entry hands the model a value that silently matches nothing (§50). Batch 4 found two more: `lib/ai/inspireMirror.ts` mapped `Seaside` into its beach purpose, and `tools.ts` named all seven old water values in the `settings` parameter description. **Three files, none of which the Directus change touches.** Always `grep -rn "<value>" src/` before calling a retire finished — and read the hits, since `members/defaults.ts` mentions "Lakeside estate" as demo prose and correctly stays.

**Scan unpublished rows when retiring, not just published.** Batch 2 scoped `published: true`, because every count in the review was about the live collection — so four unpublished hotels kept their fresh tags and the retire script refused. That guard is the whole point of it: Four Seasons Bangkok at Chao Phraya River, &Beyond Lake Manyara, Sandibe Okavango and Punakha River Lodge, all unambiguously fresh water, merged in `apply-freshwater-unpublished-2026-09-11.mjs`. An orphaned value on an unpublished row is exactly the one nobody notices.

### Editorial follow-ups

Three factual corrections to `highlights`, applied 2026-09-11 in `fix-highlights-copy-2026-09-11.mjs` — each a single phrase, voice untouched, and each asserted against the stored text before writing so a hand-edit aborts the run rather than being overwritten:

* **1135 St. Regis Bali** — "perched on a cliff" → "set on the beachfront". Nusa Dua is flat.
* **1579 Çırağan Palace** — "on the river" → "on the Bosphorus". A strait, and naming it is better copy.
* **1511 The Torridon** — "lakeside" → "lochside". Loch Torridon is a sea loch; the Scottish word is accurate and sidesteps the fresh-or-salt question that made the row a judgement call.

**Two pairs of hotels shared an identical `highlights` line** — found by frequency-mapping the field across all 903 rows, the only duplicates in the collection, and both pairs in Abu Dhabi, which reads like one editing session rather than coincidence. The line is what a results card shows, so each pair looked like the same hotel in a list. Differentiated 2026-09-11 in `fix-duplicate-highlights-2026-09-11.mjs`, drafted from each hotel's own description and approved before writing: 1601/1610 on the art collection versus the Cantonese kitchen, 1615/1616 on the Corniche underpass versus the Saadiyat dunes. **0 duplicates remain.**

### House style for `highlights`, measured not assumed

Worth knowing before writing one: **no terminal full stop** (0 of 903 rows have one), median length **76 characters** with p75 at 93, noun phrase first. Entries from id 2000 onward are the model — specific and concrete, e.g. "Contemporary Alpine sanctuary with cinematic Dolomite views, serious spa rituals and mountain dining".

**113 rows still say "amazing"**, which the newer entries avoid and which reads as the salesy register §50's prompt rules out elsewhere. Not a correctness bug and not touched — a voice pass across 113 lines is editorial work, and §41 puts that with Ulrik.

---

## 43. RECURRING DATA MAINTENANCE — SCHEDULE

Data that goes stale on a clock rather than when someone changes something. **When you run one, update its row — that is the only record.**

| What | Interval | Last run | Next due | How |
|---|---|---|---|---|
| Ratehawk hotel status (§42) | Quarterly | 2026-08-16 | **2026-11-16** | `probe-ratehawk-status.mjs` then `apply-ratehawk-status-*.mjs --confirm` (~12 requests) |
| Ratehawk static content (§48) | Daily | 2026-08-24 | automatic (Railway cron) | `etg-static-sync` — no manual step; check the Railway run log if room images go missing |
| Award source files (§25) | When each org publishes | 2026-07-14 | check annually | rebuild `awards-2026/*.json`, then `match-hotel-awards.mjs` per code |
| City → airport mapping (§37) | When the roster's city list changes | 2026-09-11 | on demand | `build-city-airports.mjs` |
| Airport options list (§39) | With the above | 2026-08-31 | on demand | `build-airport-options.mjs` |

* **Ratehawk status is the one needing a human to remember it.** The static-content row runs itself; it's listed so its existence and failure point are on the record.
* Award refreshes are event-driven — T+L published its 2026 list a week before a session happened to check. Annually is a reminder to *look*, not a deadline.
* Re-run the two airport builds after any meaningful batch of new hotels, or destinations resolve to the wrong nearest airport.

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

### Why

ETG confirmed IP whitelisting is **mandatory**. Vercel serverless egress rotates, so ETG calls needed a fixed origin. Railway assigns a service three static outbound IPs at no extra cost, and Directus already runs there — so it was already a hard dependency on every hotel page load and this adds no new failure domain. Measured before choosing: the added hop is ~2% of a search (~55–65ms against a ~3s serp call), and a long-lived Railway process keeps TLS warm to ETG where Vercel re-handshakes per cold instance. The rejected alternative was Vercel's paid static IPs at $100/month, which would not have avoided Railway anyway.

```
browser → Vercel route → lib/ratehawk/availability.ts → Railway proxy → ETG
                         (all parsing stays here)       (creds live here)
```

### The service — `etg-proxy/`

Top-level directory, sibling to `hotels-beta/`. Railway's root directory is `etg-proxy`; Vercel's is still `hotels-beta`. Zero dependencies.

It forwards the body byte-for-byte and returns the upstream status and body unmodified — except that it **strips any inbound `Authorization` and injects its own**, so Vercel never holds the ETG key.

**Only four paths are proxied**: `/api/b2b/v3/search/serp/hotels/`, `/api/b2b/v3/search/hp/`, `/api/b2b/v3/hotel/info/`, `/api/content/v1/hotel_content_by_ids/`. Everything else is 404.

**This allowlist is load-bearing, not tidiness.** An open forwarder holding our credentials would let anyone with the shared secret reach any ETG endpoint, including the booking endpoints §32 marks BLOCKED — and our key hits ETG's **live production** host, where test bookings are real orders needing manual cancellation.

**The test a new path must pass**: is it read-only, and does admitting it leave every BLOCKED endpoint just as unreachable? `hotel_content_by_ids` passes — it returns static content and creates nothing, and its purpose is the opposite of widening: it lets the §48 sync egress from the already-whitelisted IPs instead of standing up a second service with a second set of addresses. `hotel_ids_by_filter` was deliberately **not** added — the sync does a full refresh and never calls it. Verified after: `/hotel/prebook/`, `/order/booking/form/` and `hotel_ids_by_filter` all still 404 with a valid secret.

`GET /healthz` is unauthenticated and cannot reach ETG. The service exits at boot if any required env var is missing, so a misconfiguration fails the healthcheck loudly rather than serving errors under load.

### `GET /whoami` — confirm the static IPs, don't trust the panel

Reports the outbound IP the service **actually presents**, behind the same shared secret, touching neither ETG nor the credentials.

**Enabling the toggle is not enough — the service must be redeployed before the static IPs take effect.** This is the one thing to get right here, and it cost real debugging time. The Networking panel lists the three addresses the moment the toggle is flipped, which reads as if they're live; they are not. Until a redeploy, `/whoami` returns **an address not in Railway's listed set at all** — so the natural conclusion is that the feature is broken or `/whoami` is lying. **If the observed address isn't one of the three, redeploy before investigating anything else.**

**One call returns one address, and that is correct.** Railway assigns an outbound address **per instance**, not per request — it does not rotate, and repeated calls will not enumerate the other two.

Re-run `/whoami` and re-notify ETG after any region change or Railway maintenance — moving region reassigns the IPs.

### Auth and env

Vercel sends `x-oltra-proxy-secret`. The proxy compares it in constant time against a SHA-256 digest of `PROXY_SHARED_SECRET` (hashing both sides, so the comparison leaks neither content nor length). Missing or wrong is a 401 before any ETG call. Transport is public HTTPS — Railway private networking is project-internal.

| Variable | Railway | Vercel | Local `.env.local` |
|---|---|---|---|
| `RATEHAWK_KEY` / `RATEHAWK_KEY_ID` | ✅ | ❌ | ✅ |
| `PROXY_SHARED_SECRET` | ✅ | — | — |
| `RATEHAWK_PROXY_SECRET` | — | ✅ | ❌ |
| `RATEHAWK_API_URL` | — | Railway URL | `https://api.ratehawk.com` |

**Set `RATEHAWK_PROXY_SECRET` and the `RATEHAWK_API_URL` override on Vercel's Production and Preview only, never Development** — `vercel env pull` writes Development values into `.env.local` and would silently flip local dev into proxy mode.

ETG credentials are **removed from Vercel entirely** — not blanked, not left on an unused environment. The proxy is the only place they exist outside Ulrik's machine. Local `.env.local` stays in direct mode, so local dev is never gated on Railway being up.

### Two modes, selected by env vars alone

`ratehawkPost()` branches on whether `RATEHAWK_PROXY_SECRET` is set: **proxy mode** sends the secret header and no `Authorization`; **direct mode** sends HTTP Basic exactly as before. `assertRatehawkConfig()` requires *either* credentials or a proxy secret. Nothing else changed.

**When ETG start enforcing**, calls from Ulrik's machine get rejected too — both local dev and `probe-ratehawk-status.mjs` (§43), which calls `/search/serp/hotels/` directly. Either whitelist that IP or flip to proxy mode. Deliberately deferred, not overlooked.

### Failure behaviour — fail fast, no retry

No automatic retry, by decision: serp already takes ~3s so a retry doubles the worst case with the user waiting, ETG rate-limits, and the UI already has an explicit user-driven retry. **Verified**: with the proxy down the batch route returns 500 in ~38ms and the existing error states render — and **none of them claims the hotel is unavailable**, preserving the §42 distinction.

`ratehawkPost()` previously passed **no timeout at all**. Now 35s Vercel→proxy against 30s proxy→ETG, so the proxy always fails first and returns a real status rather than leaving Vercel on a dangling socket.

### Deployment

Service Settings → Networking → Enable Static IPs, **then redeploy**. Region **EU West (Amsterdam)**, fixed before the addresses were sent.

```
208.77.244.241
152.55.184.241
152.55.185.190
```

Confirmed via `/whoami` against the redeployed service, then sent to Sofia Kamalova — she handles whitelisting, not Valeriy. Also: healthcheck `/healthz`, and **App Sleeping must stay off** — with no retry, a cold start on the first search after an idle period surfaces as a failed availability check.

Three caveats: moving region changes the IPs; **static IPs are per service, not per project** (a future service needs its own toggle and its own notification); and Railway does not guarantee the addresses are *dedicated* — fine for a whitelist, but don't describe them to ETG as dedicated.

---

## 48. ETG STATIC-CONTENT SYNC — OFFLINE, AND OFF THE HOT PATH (2026-08-24)

### What this closes

`/api/ratehawk/availability` called `/hotel/info/` live on every hotel-detail view. Two problems, and the second would have bitten first:

1. ETG grade "static content fetched during a live user search" as a certification failure.
2. `/hotel/info/` is **30 requests / 60s on our key**, so that call was a site-wide ceiling of 30 hotel-detail views per minute across all users. It hadn't bitten only because traffic is low.

Now a daily Railway job writes ETG static content into Directus and the availability route reads from there. Room-matching logic is untouched.

### Directus fields

The 4 from §32 (created 2026-08-10, empty until now) plus 4 more via `add-ratehawk-content-flag-fields.mjs` — additive only, before/after `GET /schema/snapshot` diffed to confirm exactly 4 additions, 0 modifications, 0 removals.

| Field | Type | ETG source |
|---|---|---|
| `ratehawk_room_groups` | json | trimmed `room_groups[]` |
| `ratehawk_metapolicy_struct` | json | `metapolicy_struct` |
| `ratehawk_metapolicy_extra_info` | text | `metapolicy_extra_info` |
| `ratehawk_static_synced_at` | timestamp | stamped by the job |
| `ratehawk_check_in_time` / `_check_out_time` | string | `check_in_time` / `check_out_time` |
| `ratehawk_is_closed` / `ratehawk_deleted` | boolean | `is_closed` / `deleted` |

`null` on any of them means **never synced**, which is not the same as a real `false` or a real empty list.

**The times are strings, not a Directus `time` column.** 4 of 853 hotels report `"00:00:00"`, which almost certainly means "unspecified" rather than a real midnight check-in; a `time` column would launder that into a legitimate-looking value.

**`is_closed`/`deleted` are deliberately not folded into `ratehawk_status`** (§42). That field is a quarterly live-rate verdict; these are daily content flags. One shared column would let the daily job overwrite the quarterly one. Both are advisory — the sync never changes `published`. Validation on first run: the single `is_closed = true` is Four Seasons The Biltmore Santa Barbara (id 1682), genuinely closed and already unpublished.

### A duplicate field is a 400, not a 409

**Directus answers a duplicate field with `400 INVALID_PAYLOAD` and an "already exists" message, not `409`** — verified live. Every field-creation script here had inherited a `409` check and a header calling itself "409-safe", so a perfectly clean re-run printed `FAILED` on every field it skipped — 100 of them in the image script's case. Harmless in effect, but **a clean re-run that looks broken is the kind of thing that gets "investigated" for an hour.**

All three now share an `isAlreadyExists(status, data)` helper accepting both codes. Copy that helper in any future field-creation script rather than the old shape, which still exists in `scripts/restaurants/create-restaurants-collection.mjs` — left alone as a run-once script, and untested.

### The trimmed `ratehawk_room_groups` shape

Exactly the three keys `RawRoomGroup` declares: `{name, rg_ext, images: string[]}`. Dropped, each **measured** on live data rather than assumed: room-group `images` (byte-identical to `images_ext[].url`, 36.9% of the bytes); `category_slug` on room images (`"unspecified"` on 51,838 of 51,838 sampled); `name_struct`, `room_amenities`, `size` (never read; `size` is feature-gated and always null); `room_group_id` (deprecated, never read).

18.9 MB stored for 853 hotels, from a 58.7 MB raw response. Per hotel p50 11.8 KB / p95 153 KB / max 367 KB.

### The job — `etg-static-sync/`

Top-level directory, sibling to `etg-proxy/`. Zero dependencies. Daily on Railway's cron. Flags: `--dry-run`, `--only <hid>`, `--limit <n>`.

Per run: load every hotel with a `ratehawk_hid` → batch 100 hids through the proxy to `hotel_content_by_ids` → trim → compare against what's stored → PATCH only what changed → stamp `ratehawk_static_synced_at` on every row in the run, once, at the end.

Points that matter if this is rewritten:

* **`data` comes back as a flat array and is NOT in request order.** Verified: `[8473727, 7855756]` returned 7855756 first. **Join on `hid`, never on position.**
* **Compare canonically, never by raw `JSON.stringify`.** Key order differs between what we send and what Directus returns — same lesson as `rg_ext` (§32). The diff sorts keys recursively.
* **Change detection is the expensive half, not the fetch.** The 9 ETG requests take ~8.5s; 853 Directus PATCHes take ~3 minutes. ETG content is stable, so after the first run most days write nothing — an immediate second run reported **0 of 853 changed** in 11.1s.
* **The timestamp is stamped separately from content**, so per-row freshness stays meaningful without rewriting 19 MB daily.
* **A failed batch aborts the run before anything is stamped**, so a partial sync surfaces as stale timestamps rather than a silent mix. No retry. Stored content is never deleted on a failed fetch, and a hid we asked for and didn't get back is reported, not overwritten with nulls.
* Local runs use direct mode, deployment uses proxy mode.

### The read path

`fetchRatehawkRoomImages()` → **`loadRatehawkRoomGroups()`**, renamed because it no longer fetches from ETG and the old name would mislead. It reads `ratehawk_room_groups` filtered on `ratehawk_hid` and maps stored `images: string[]` back to `images_ext: [{url, category_slug: null}]`, so `RawRoomGroup` is unchanged and `matchRoomImages()` / `rgExtEquals()` / `groupRoomOptions()` are untouched. Unsynced or room-group-less hotels return `[]` and render rooms without images — 24 of 853 legitimately have zero room groups.

**Never add `ratehawk_room_groups` to a bulk hotel field list** — ~19 MB across the roster, and the Hotels page fetches every published hotel in one request. Guard comments sit in `HotelRecord` and above all three bulk `fields` lists.

### Verified

Full run: 853/853 returned, 0 missing, 852 written; an immediate re-run reported 0 changed. The assertion that proves nothing user-visible changed: the same `/api/ratehawk/availability` request run against the old code (via `git stash`) and the new returned **the same 11 rooms with byte-identical `images[]` on all 11**, the only difference being the deliberately dropped `category: "unspecified"` → `null`.

### Not done — deployment

The Railway service has **not** been created: no `etg-static-sync` service, no cron schedule, no env vars there. The code is verified locally end to end. Deploying needs: a new service with root directory `etg-static-sync`, `DIRECTUS_URL`/`DIRECTUS_TOKEN`/`RATEHAWK_API_URL`/`RATEHAWK_PROXY_SECRET`, a cron schedule, and **no static-IP toggle of its own** — it egresses through `etg-proxy`, which is the whole reason the allowlist gained a path.

---

## 49. HOTEL GEOGRAPHY SPLIT — `admin_region` + TRAVELLER AREA (2026-08-31)

Moved to `CLAUDE-ARCHIVE.md` — completed work. Read it there if this task touches it.

---
## 50. THE AI CONCIERGE

**Design history, mechanics and the bug log are in `CLAUDE-AI.md`. Read that file before changing anything in `src/lib/ai` or `src/components/ai` — it carries the failures this feature already had.**

### Status

**On `main` since 2026-09-10** — merged as a fast-forward of the 31 `ai-chat` commits, so the history stays the linear series §14 asks for. `ai-chat` is now a stale pointer at the same commit; work on `main` like everything else.

Behind `NEXT_PUBLIC_AI_CHAT_ENABLED`, **default off**, which is what made merging safe: the flag gates the route, the modal and the entry button, so the code sits on production invisibly until the variable is set. **It is not set on Vercel** — setting it there is a deliberate, separate act, and needs a redeploy because Next inlines it at build time.

It was first built as a *mode* on the landing page behind a Classic/AI toggle; `5622166` made it a modal the whole site can open, and **everything below describes the current design**.

**Local prerequisite that is easy to lose an hour to**: `NEXT_PUBLIC_AI_CHAT_ENABLED=1` is in no committed environment — it goes in `.env.local` by hand. Without it the button doesn't render and `/api/chat` answers 404, which looks exactly like the feature being broken rather than switched off. Inlined at build time, so a change needs a dev-server restart locally and a redeploy on Vercel.

### What it is

A second way into the site: describe the trip in prose, get curated hotels, flights and restaurants back in the existing cards. Discovery and steering only — it never books, never takes payment, and every tool it reaches is read-only.

### The one design decision that matters

**The no-prices rule is structural, not a prompt promise.** `searchHotels`, `checkAvailability` and `searchFlights` fetch real rates, use them to rank and to test any ceiling the visitor named, then **discard the amount**. The model receives `{available, priceRank, withinBudget}` and never a figure, so it cannot leak a price it was never given — under any framing, including direct pressure. Every number on screen is fetched by the card from the same batch route the structured search uses.

If a future change hands the model a raw amount "just for context", that guarantee is gone and the prompt becomes the only defence. Don't.

### Route and tools

`src/app/api/chat/route.ts` holds `ANTHROPIC_API_KEY` and nothing else does. Guard order is deliberate: **flag** (404) → **session** (401, before the key check, so an unauthenticated caller learns nothing about our configuration) → **rate limit** → **input caps** → **triage**.

Triage is `claude-haiku-4-5` classifying travel / probe / other before any Opus spend, and a second independent judgement: a jailbreak that talks the main model round still has to pass a classifier with no tools and no history. It **fails open** on error — refusing everyone during a transient outage is worse. A decline streams back as a normal assistant message, not a JSON error, so the client has one code path.

Tools, all read-only: `searchHotels`, `getHotelDetails`, `checkAvailability`, `searchFlights`, `nearestAirport`, `searchRestaurants`, `webSearch`, plus `presentResults` — not a data tool but how the model hands the UI a structured result set. The client renders from that tool call rather than parsing names out of prose, which would break the moment the model rephrased.

`nearestAirport` costs nothing — `cityAirports.ts` already covers every hotel city. **Do not add a Google Places call for this.** `checkAvailability` skips passive hotels (§42).

**A tool parameter whose valid values are a closed set should be an `enum`, not a described string.** Live testing had the model inventing plausible taxonomy tags — "quiet", "secluded", "wellness" — matching nothing and spending two extra round trips recovering, silently, on every query. `lib/ai/taxonomy.ts` mirrors the locked §44 vocabularies as JSON Schema enums. Safe to hardcode because those fields are `allowOther: false`; refresh from `GET /fields/hotels/{field}` if they move, since a stale entry silently matches nothing.

`searchRestaurants` searches one city, built on `getRestaurantsByCity` so the concierge sees exactly what the Restaurants page would, alias fallback included. Cuisine and type narrow in JS, because a Directus `_eq` would miss "Modern French" for "French". An empty result distinguishes **"we do not cover this city"** from **"nothing matched those filters"**, because only the first should send the visitor elsewhere. Restaurants follow the **same in-inventory rule hotels have**: never name one that did not come back from the tool, however well known.

### Ranking: fit, not decoration (2026-09-10)

**`ext_points` must never order a candidate list.** It counts external accreditations, which is orthogonal to what was asked, and sorting by it turned every answer into a trophy cabinet. Asked for a family ski trip, the tool matched 53, cut to 40 by awards rank, and the 13 it dropped were the least decorated — eight of them carrying the `Family` tag, including Suvretta House, Les Fermes de Marie and Rosewood Courchevel. The model then picked four grand hotels from what survived, having never seen the family-strongest.

Order is now **tag-match count → `editor_rank` → `ext_points` as a last tiebreak only**, in `relevanceSort`. `filterHotelsByTags` ORs within a field (§4), so a hotel matching one of three requested tags passes the same test as one matching all three: right for inclusion, wrong for ordering.

Awards survive only as `awards` labels on each candidate, and the prompt says they are not a ranking — name them **only when the visitor asks about accreditation itself** ("which are Michelin-starred", "the Forbes five-star ones"), or in passing when an award is the reason a hotel fits a stated need. The model is never given the `ext_points` number.

### Caps, and the broad-set gate

| Constant | Value | Why |
|---|---|---|
| `MAX_HOTEL_CANDIDATES` | 120 | Context ceiling, not an editorial one. Narrowing is the concierge's job. |
| `BROAD_RESULT_LIMIT` | 20 | Above this, ask before showing |
| `MAX_AVAILABILITY_IDS` | 120 | Matches the candidate cap so the availability count covers every candidate |

**`/api/ai/hotels` imports `MAX_HOTEL_CANDIDATES` and must never sit below it.** It held its own literal `40`, which agreed with the old tool cap by coincidence rather than construction — so raising the tool cap silently truncated a 67-hotel answer to 40 cards, with nothing in the UI to say so.

**Above `BROAD_RESULT_LIMIT`, `searchHotels` returns counts and `narrowBy` axes INSTEAD of properties**, with `tooBroadToShow: true`. The model cannot present a set it was not given, so "ask before showing a directory" is structural rather than a prompt line — and §50's own testing shows prompt-only rules of this shape get skipped. Counted on what the visitor would see: available properties when dates are known, matches otherwise. `showAll: true` is the escape hatch, and it is **required** — without it "just show me all of them" loops forever.

Each `narrowBy` axis reports `covers` out of `of`. Not every axis explains the whole set: `state_province_county_island` is null for a major city (§3), so it described half of Italy and read Tuscany as 2 where 10 hotels sit. `admin_region` is never null and is the axis to prefer.

### Colloquial geography — `lib/ai/macroRegions.ts`

"The Alps", "the Caribbean", "Scandinavia" are how people describe where they want to go and **none is a value in any column**. `area: "Alps"` matched nothing, cost a wasted round trip every time, and the blind retry searched the world — returning Colorado and Alberta for an Alpine question.

18 terms, exposed as a `macroRegion` **enum** (the §44 lesson: a closed set is an enum, not a described string). `region` — the continent column, which already holds "Caribbean" and "South Pacific" — is exposed too, and had never been reachable. A macro term is also resolved out of `country`/`area`/`adminRegion`/`city`, because the model does not always reach for a new parameter.

* **Mountain ranges intersect with a `setting` tag.** Administrative regions alone put Munich, Lausanne and Vevey in the Alps; requiring `Mountains` strips exactly those and keeps every real one.
* **Values matching nothing today are deliberate** — Tyrol, Idaho, Trentino, Malta, Finland, Belgium. They are the boundary as a person draws it, so a future hotel there needs no code change. Verified as genuine absences, not typos. **Do not "clean" them out.**
* A search that still matches nothing returns `didYouMean`: real values with the parameter each belongs to, matched by bounded Levenshtein — containment alone scores "Tirol" against "Tyrol" at zero, which is the case the feature exists for.

**`area` and `adminRegion` are one geography slot** — each matches *both* columns, OR'd. They are separate fields with separate meanings (§3), but they legitimately hold the same value (Tuscany, Bali, Sicily), and the traveller field is deliberately null for a major city. Matching `area: "Tuscany"` against the traveller column alone returned **2 hotels of the 10 in Tuscany**, dropping every Florence property plus Il Pellicano and Forte dei Marmi, which sit under their own sub-areas. The model cannot know which of two near-identical fields holds the name it wants, and guessing wrong must widen the search rather than gut it. Narrowing a region to what was meant is then the model's job, via `settings` — which is what it does: the same query now searches Tuscany with `Countryside`/`Hillside` and says so.

### Never say aloud the words we use to explain the data

The concierge told a visitor "an open jaw works nicely here". That is airline trade jargon for flying into one city and home from another, and it came **from our own tool description** — `returnDate` said "leave unset on the legs of an open jaw". Vocabulary written to describe a data shape to the model got reused as house voice.

The prompt now carries a general rule, because this class recurs: instructions and tool descriptions name things precisely so the model can act on them, and much of that vocabulary is jargon a guest has never met. Not "open jaw"; not "passive" or "not integrated" (§42) — "we can't book that one here"; never "macroRegion", "setting tags", "candidates", "the tool", or a supplier's name. **If a phrase would look at home in a schema, it does not go in an answer.** When adding a tool description, write it so that a sentence lifted from it verbatim would still sound like a concierge.

### Dates: never invent one (2026-09-10)

**A question about which hotels we have is not a question about a particular week.** Answering it against a week the model chose prices the wrong stay and hides everything sold out then.

No timing given — no dates, month, season — means **omit `stay`** from `searchHotels` and `presentResults`. Cards render without prices, which is the honest answer, and the follow-up asks when. Asked about price with no dates: ask for timing, do not guess a week to produce a figure.

**Dates in the page's search form are an offer, not an assumption.** They may be dates the concierge itself proposed earlier: `AiResultsSync` writes an answer's dates into the URL (§8), `LandingSearchPanel` reads them back and republishes them as page context, and the model then treats its own guess as the visitor's stated wish. A leftover ski week priced a beach question in France. `pageContext` now says "filled into the search form" rather than "for", so the model can tell form contents from intent.

### What the panel says, and what the page shows

`hotelIds` is **every** property that fits and becomes the cards; `rationales` is the **five to eight** the panel names. They are the same list only when the set is small.

* **The count in the framing is `hotelIds.length`** — not how many matched, not how many are free. Three numbers are in play and only one is the answer; say two only when both matter ("Ten of the thirty-nine have rooms that week").
* **Named properties lead the card order.** `highlightsFirst` reorders `hotelIds` before it reaches the store, so the footnote's promise — "these come first on the page behind, with the other N below" — is one the page keeps.
* `MAX_NAMED = 8` is a hard UI cap, independent of how many rationales arrive.
* The footnote claims prices **only when a stay was passed**; without one the cards are blank.

### Water-proximity tags are inconsistent — §42B

`Beachfront`, `Beach`, `Seaside`, `Coastal`, `Oceanfront`, `Waterfront`, `Clifftop` are not applied consistently, and the §42B reclassification has never run. The whole Côte d'Azur is `Waterfront` or `Coastal` and **none of it `Beachfront`**, so "beachfront hotels in France" returned 3 — Deauville, La Baule, Biarritz — and missed Hôtel du Cap Eden-Roc, Cheval Blanc Saint-Tropez and the rest.

The `settings` parameter description tells the model to pass the whole family for anything by the sea, which took that answer from 3 to 17. **That is a patch over the data, not a fix.** §42B is still the real answer.

### The system prompt

Read-only tools, no booking or payment, the confidentiality block, the non-travel decline wording, the no-result wording, adjacent questions bounded to inventory, the restaurant in-inventory rule, page context, answer-then-offer-the-handoff, the in-chat summary rule, and the `searchTags` requirement.

**Keep `SYSTEM_PROMPT` byte-stable per deploy.** It carries the prompt cache breakpoint. Anything per-request — the date, the page context — goes in a *later* system block. The call-level `cacheControl` this replaced caches the **last** cacheable block, which would have been the volatile one: the cache would have missed on every request while looking correctly configured. **If `usage.cache_read_input_tokens` is persistently zero, check this first.**

**A prompt change is a code change, and it regresses like one.** Two fixes were caused by the fix before them: tightening for brevity produced wording the model read as permission to ask *instead of* showing results, so it replied helpfully and rendered no cards. Nothing failed; there was simply no `presentResults` call — invisible unless you notice `/api/chat` wasn't followed by `/api/ai/hotels`. **After editing `systemPrompt.ts`, run a real query in a browser and check the tool fired.**

**"The best" — the one question answered with a question.** Asked "the 3 best hotels in Paris" it named three and called them "the three that stand above the rest". **There is no ranking behind the collection, so that was invented.** It now answers with "I can highly recommend all hotels on myOLTRA" plus a request for something to judge on, and holds it under pressure. **The exception is deliberately narrow and the prompt says so twice**, per the regression above: it applies only when there is nothing to rank by. "Hotels in Paris" still searches and shows, as does any request carrying a quarter, a spa, a brand, a budget or a date.

### AI SDK v7 — where training priors are wrong

`ai@7` + `@ai-sdk/anthropic@4` + `@ai-sdk/react`. Verified against the installed `.d.ts`, not recalled:

* `useChat` is in **`@ai-sdk/react`**, not `ai`.
* Tool params are **`inputSchema`**, not `parameters`.
* **`convertToModelMessages` is async** — await it.
* `useChat` does not manage input; the caller owns the text state and calls `sendMessage({ text })`. Per-request data goes in the second argument: `sendMessage({text}, {body: {...}})`.
* **`role: "system"` is rejected inside `messages`.** It goes through `instructions`, which accepts a string, one system message, or an **array** — the array form is what makes a cached prefix plus volatile suffixes possible.
* A `ToolUIPart` in state `input-streaming` has `input?: DeepPartial<…>` — partial, and typed as such.
* `stopWhen` takes an array; `hasToolCall(name)` is exported alongside `stepCountIs(n)`.
* `TripType` in `duffelNormalizer.ts` is `'one-way'`, not `'oneway'`.
* `buildGuestsArray(adults, kids, ages, rooms)` is positional.

### Prerequisites

* `ANTHROPIC_API_KEY` — server-only, never `NEXT_PUBLIC`. On Vercel: Sensitive, **Preview and Production** (Preview included, or the preview cannot answer).
* `NEXT_PUBLIC_AI_CHAT_ENABLED` — public flag, inlined at build time.
* **A spend cap and usage alerts in the Anthropic Console.** The in-memory rate limiter is per serverless instance, so the real ceiling is (instances × cap) — a cost backstop, not a control. Swap the Map for Upstash if the site ever opens past `/beta-login`.

### Deliberately not built

Chat on `/hotels/[hotelid]` or in the members area, any booking/payment/write tool, fine-tuning, pgvector, any markup on prices, and any change to the standalone Restaurants page.

---

This document is the baseline context for all OLTRA development sessions.
