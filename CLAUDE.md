# OLTRA — AI CONTEXT (UPDATED)

## 0. REPOSITORY STRUCTURE

All application code lives in the `/workspaces/oltra-beta/hotels-beta/` subdirectory. The repo root (`/workspaces/oltra-beta/`) contains only top-level config (CLAUDE.md, GitHub workflows, etc.).

**Git paths must be relative to the repo root**, so always use `hotels-beta/src/...` when staging files — e.g. `git add hotels-beta/src/app/hotels/ui/HotelsView.tsx`.

---

## 1. PROJECT OVERVIEW

OLTRA is a curated luxury travel platform focused on high-end hotels and restaurants, designed for an affluent, design-conscious, international audience.

Core principles:

* Editorial-first (not OTA-first)
* Luxury UX with minimal clutter
* Highly structured taxonomy-driven filtering
* Server-driven data (Directus as canonical source)
* Clean, scalable architecture with minimal technical debt

---

## 2. TECH STACK

Frontend:

* Next.js 15 (App Router)
* TypeScript
* Tailwind v4
* Server Components by default

Backend / Data:

* Directus (hosted on Railway) — canonical CMS
* REST API via `/src/lib/directus`

Auth / Members:

* Supabase (auth + user-specific data only)

AI:

* Placeholder layer (no direct Directus querying)

Strict rules:

* No schema redesign unless explicitly requested
* No new libraries unless explicitly requested
* Minimal-diff, production-grade changes only

---

## 3. CORE DATA MODEL (DIRECTUS)

### Hotels

> Schema migrated 2026-06: `hotelid` was removed (use `id`), `editor_rank_13` → `editor_rank`, the old double-underscore state field → single underscore, and `activities`/`awards`/`settings`/`styles` went from M2M relations to flat multiselect tag fields (`setting`/`style` are now **singular**). See section 4 for the taxonomy details.

Key fields:

* id (bigint, primary key)
* hotel_name
* country
* region
* city
* local_area
* state_province_county_island
* affiliation

Editorial:

* highlights
* description

Stats:

* editor_rank
* ext_points
* total_rooms_suites_villas

Taxonomy — flat multiselect tags, not relational (see section 4):

* activities
* awards
* setting
* style

Editorial single-select companions (not yet wired into app code):

* primary_setting / secondary_setting
* primary_style / secondary_style

Award boolean flags (one column per accolade):

* best50, cn, forbes5, michelin3keys, telegraph, tl100, aaa5d

Links:

* www
* insta

Booking:

* booking_provider
* booking_URL (capital URL — `official_website_booking_url` does not exist)
* booking_enabled
* booking_label
* booking_hotel_ref
* booking_notes

Agoda:

* agoda_hotel_id
* agoda_photo1 – agoda_photo5

Geo:

* lat / lng

---

### Restaurants

Separate Directus collection (`restaurants`). Key fields:

* id (bigint, primary key)
* status (`published` / `draft`)
* rank (integer — display order within city)
* restaurant_name
* slug (kebab-case, unique — used as upsert key by the import script)
* description, highlights
* restaurant_type (`Fine dining` | `High-end casual` | `Informal local favorite` | `Beach club`)
* cuisine, restaurant_setting, restaurant_style
* country, region, city, local_area, state_province_county_island
* lat / lng
* www, insta
* awards (JSON array — values: `michelin_3`, `michelin_2`, `michelin_1`, `worlds_50`, `laliste100`)
* sources, hotel_name_hint

### Restaurant data files (v3 format)

Source JSON files live in `hotels-beta/scripts/restaurants/[city]_restaurants.json` (e.g. `amsterdam_restaurants.json`). Old v2 files (`rest_[city].json`) are archived in `olddata/`.

**Current coverage (2026-06-27): 23 cities, 804 records loaded into Directus.**

Cities loaded: Amsterdam, Bangkok, Barcelona, Copenhagen, Florence, Geneva, Hong Kong, Lisbon, London, Los Angeles, Madrid, Miami, Milan, Paris, Rome, Seoul, Singapore, Stockholm, Sydney, Tokyo, Venice, Vienna, Zurich.

### Still to add

* More cities — produce new `[city]_restaurants.json` files matching the v3 schema (see prompt template: `scripts/restaurants/myOLTRA - restaurant prompt v3.txt`), then run the upsert script
* Geocoding — `lat`/`lng` are populated for some records but many are `null`; map markers only appear for records with coordinates
* Saint Tropez — no v3 file yet; when added, filename must be `saint_tropez_restaurants.json` (alias already registered in the upsert script)

### Upsert script

`hotels-beta/scripts/restaurants/directus-upsert-restaurants-batch.mjs` — slug-based upsert, safe to re-run. Handles both old `rest_[city].json` and new `[city]_restaurants.json` naming. Excludes `geocode-*.json` files automatically.

```bash
# from hotels-beta/
DIRECTUS_URL=... DIRECTUS_TOKEN=... node scripts/restaurants/directus-upsert-restaurants-batch.mjs --dir scripts/restaurants
# dry run first:
... --dry-run
# single city:
... --only amsterdam_restaurants.json
```

---

## 4. TAXONOMY SYSTEM

**As of 2026-06, `activities`/`awards`/`setting`/`style` are flat multiselect tag fields directly on `hotels`** (native Postgres `text[]` columns) — not relational M2M fields. The old `activities`/`awards`/`settings`/`styles` Directus collections (M2M join targets) no longer exist; `GET /collections` returns only `hotels`.

* Each field's stored value **is** the display label (e.g. `["Hiking", "Diving"]`) — no id → name resolution needed.
* The allowed/canonical choices for each field are configured directly on the field in Directus: `meta.interface = "select-multiple-dropdown"`, `meta.options.choices = [{text, value}, ...]`, `meta.options.allowOther = false` (locked to the defined list — editors can't introduce new typos).
* Field names are **singular**: `setting`, `style` (not `settings`/`styles`). `activities`/`awards` keep their plural names.

### Filtering mechanics

Directus's `_contains`/`_in` filter operators throw `500` errors against these native array columns (confirmed by live testing) — they cannot be used for server-side filtering.

* `activities` / `setting` / `style` filtering happens as a **JS-side post-fetch pass**: `filterHotelsByTags()` in `/src/lib/hotelFilters.ts`. Fetch hotels filtered on the other (scalar) criteria, then narrow in application code — a hotel matches if its tag array overlaps at least one selected value per field (OR within a field, AND across fields).
* `awards` filtering (the "Accolades" UI facet) instead uses the **7 boolean flag columns** (`best50`, `cn`, `forbes5`, `michelin3keys`, `telegraph`, `tl100`, `aaa5d`), which Directus *can* filter natively (`_eq: true`, OR'd together). The allow-list of valid codes lives in `/src/lib/hotels/awardCodes.ts`, shared between the server filter builder and the client award-badge UI so they can't drift apart.
* The general `awards` multiselect tag field (separate from the 7 curated booleans) has its own choices in Directus but isn't wired into any UI yet — hotel-card award badges and the Accolades filter both key off the boolean columns + `FEATURED_AWARDS` in `HotelsView.tsx`.

### Editor tool

The internal `/editor/hotels/[id]` tool sources its taxonomy checkbox options live from each field's `meta.options.choices` (`GET /fields/hotels/{field}`) rather than a separate collection — see `getEditorTaxonomies()` in `/src/lib/editorHotels.ts`.

---

## 5. KEY ARCHITECTURE FILES

### Hotels

Page:

* `/src/app/hotels/page.tsx`

Main UI:

* `/src/app/hotels/ui/HotelsView.tsx`

Helpers:

* `/src/lib/directus`
* `/src/lib/hotelFilters` — Directus filter builder + `filterHotelsByTags` (JS-side activities/setting/style filter)
* `/src/lib/hotelOptions`
* `/src/lib/hotelSearchSuggestions`
* `/src/lib/hotels/awardCodes` — shared allow-list of the 7 award boolean-column codes
* `/src/lib/hotels/buildBookingLink`
* `/src/lib/hotels/cardHelpers`
* `/src/lib/editorHotels` — data layer for the internal `/editor/hotels` tool

---

### Restaurants

Page:

* `/src/app/restaurants/page.tsx`

Main UI:

* `/src/app/restaurants/ui/RestaurantsMapView.tsx`

Helpers:

* `/src/lib/restaurants`

---

### Flights

Page:

* `/src/app/flights/page.tsx`

Main UI:

* `/src/app/flights/ui/FlightsView.tsx`
* `/src/app/flights/ui/FlightDetailsPopup.tsx`
* `/src/app/flights/ui/AirportAutocomplete.tsx`

Helpers / data:

* `/src/lib/flights/duffelNormalizer.ts` — Duffel offer → `Itinerary` + `FlightLeg`
* `/src/lib/flights/airlineAlliances.ts` — IATA → Star / OneWorld / SkyTeam map
* `/src/lib/airportOptions.ts` — labelled airport list (`"CPH · Copenhagen"` format; no coordinates)

API routes:

* `/src/app/api/flights/search/route.ts` — POST → Duffel offer request
* `/src/app/api/flights/book-link/route.ts` — opens partner booking link
* `/src/app/api/flights/offer/[id]/route.ts`

---

### Shared

Location logic:

* `/src/lib/locationAliases.ts`

Guests:

* `/src/lib/guests`

Members:

* `/src/lib/members`

---

## 6. HOTELS PAGE LOGIC

### Modes

The Hotels page operates in 3 modes:

1. **Featured Mode**

   * No filters OR >50 results
   * Full-screen hero
   * Floating search (top-left)
   * Floating featured hotel card (top-right)

2. **Results Mode**

   * Active filters AND ≤50 results
   * Left panel: filters + list
   * Right panel: selected hotel

3. **Map Mode**

   * Toggle from results
   * MapLibre map

---

### Key Logic Variables

```ts
const shouldShowResults
const shouldShowFeatured
const effectiveView
```

---

### Selection Logic

* First hotel auto-selected when results load
* Selected hotel persists if still in result set
* Falls back to first result if invalid

---

### Featured Mode — hotel cycling

* Pool: all hotels with at least one real agoda photo (`agoda_photo1`–`agoda_photo5` any truthy) — no ext_points restriction
* Cycle: random shuffle of the pool indices, with ≥30 positions between any repeat across cycle boundaries — same gap-guarantee algorithm as `LandingBackground.buildCycle`
* Implemented with `featuredCycleRef` (remaining indices queue) and `featuredTailRef` (last N shown) refs; `setSelectedImageIndex` advances the display every 5 s via `setInterval`
* Hotels without images are excluded regardless of points

---

## 7. RESTAURANTS PAGE LOGIC

### Flow

1. Read `city` from URL (defaults to Paris if absent)
2. Resolve against available city options (with alias expansion)
3. Fetch all restaurants for the city from Directus
4. Render map + list via `RestaurantsMapView`

### Restaurant type filter

Client-side filter in `RestaurantsMapView`. State: `selectedType` (default `"All"`). Options: All / Fine dining / High-end casual / Informal local favorite / Beach club — match the `restaurant_type` field values exactly.

* Filters both the sidebar list and the map markers
* Map refits bounds to the filtered set on each change
* Resets to "All" when the city changes
* Count label is dynamic (`N RESTAURANTS`)

---

### City Alias Logic

Saint Tropez and Ramatuelle are treated as a shared cluster.

Implemented via:

```ts
expandCityAliases([city])
```

Behavior:

* Selecting "Saint Tropez" includes Ramatuelle
* Selecting "Ramatuelle" includes Saint Tropez
* Results merged and deduplicated by `id`

---

## 7B. FLIGHTS PAGE LOGIC (DUFFEL)

### Duffel data model — single ticket per offer

* A return-trip offer = **one Duffel offer with two `slices`** (`slices[0]` outbound, `slices[1]` inbound) sold at a single `total_amount`. There is **no "two one-way tickets" scenario** in this flow — every bookable result is a single ticket.
* Inside a slice, `segments[]` represents the flight legs of that direction. A direct flight has one segment; multi-stop has N. Each segment has its own `marketing_carrier` (airline) — so a slice can legitimately mix carriers (long-haul + local feeder).
* Per-segment fields used: `marketing_carrier.{name,iata_code}`, `marketing_carrier_flight_number`, `origin/destination.{iata_code,name,city.name,time_zone}`, `departing_at`, `arriving_at`, `duration` (ISO 8601), `aircraft.name`.
* Slices may also have `duration` directly; segments may not — fall back to computing from arriving_at − departing_at.

### `FlightLeg` type (in `duffelNormalizer.ts`)

Normalized from a Duffel slice. Important computed fields beyond the obvious:

* `airlines: AirlineRef[]` — distinct marketing carriers across all segments, in segment order. Used for the card's combined label (e.g. "Lufthansa + Bangkok Airways").
* `longHaulAirline: AirlineRef | null` — carrier of the **longest segment** (used for Tier-A return matching).
* `layovers: { code, name, durationMinutes }[]` — structured stops; `code` is IATA (for filter logic), `name` is city/airport display name (for cards and popup).
* `segments: Segment[]` — full per-segment data including `departIso/arriveIso` (raw ISO with offset for TZ math), aircraft, origin/destination timezones. Drives the FlightDetailsPopup.
* `stopSummary: string` — display string `"N stop(s) · City Hh Mm, City Hh Mm..."` listing **all** layovers (plural-aware).

### Return-trip airline matching (highlighting)

Two-tier match between the selected outbound's leg and each return candidate (`getReturnMatchTier` in FlightsView):

* **Tier A — long-haul match**: outbound.longHaulAirline.iataCode === inbound.longHaulAirline.iataCode → stronger highlight (`selectCardMatchStrong`) + "Same airline" badge.
* **Tier C — alliance match**: all carriers across BOTH legs sit in the same alliance (via `airlineAlliances.ts` — Star / OneWorld / SkyTeam IATA sets) → lighter highlight (`selectCardMatchWeak`) + "Alliance partner" badge.
* No match → default card. The selected card uses a white 2px outline + dark tinted bg (`selectCardActive`), which overrides match styling visually.

### Smart defaults after results land

* **Max duration sliders** auto-set on each new result set to `clamp(6, 24, ceil(minDuration × 1.5))` for outbound and (if return) inbound. Tracked with `autoDurationKeyRef` (keyed by itinerary IDs) so user adjustments aren't overwritten on rerenders, but a new search re-applies the default.
* **Airline filter** prefills with all airlines present in results; preserved across rerenders if non-empty.
* **Layover airports filter** uses IATA codes as keys but displays city names via `layoverAirportMap` (Map<code, name>) passed to `MultiSelectDropdown`.
* Default departure time interval: 08:00–24:00. The TimeIntervalFilter slider has `max=24` so end-of-day is reachable.

### Column alignment when scrollbar appears

* Only the `.resultsScroll` (the flight-card grid) scrolls. Headers + pinned rows (Top pick / Fastest) sit outside it.
* A `ResizeObserver` on `.resultsScroll` toggles `hasScrollGutter` state when `scrollHeight > clientHeight`. That state applies `.withScrollGutter { padding-right: 12px }` to the column headers and pinned stack so the columns stay aligned with the scrollable grid when the scrollbar appears, and revert to full width when it disappears.

### Booking flow

* The `BookingBar` component (formerly at the bottom of the page) was removed. The **only book action** is the BOOK button inside each `PriceCard`. The button is active (sage-green `--oltra-button-active-bg`) only for:
  * the Top pick + Fastest rows
  * the user-selected itinerary in the price column (selected outbound for one-way; selected return for return-trip)
  * inactive elsewhere (outlined / disabled).
* Click opens the Duffel/partner booking URL via `/api/flights/book-link`.

### Cards & info popup

* Flight cards: fixed `height: 96px`. Three rows:
  1. `dep → arr` + `Duration: Xh Ym` + small inline (i) button
  2. Airline names + match badge (inline)
  3. Stop summary (`N stops · City Hh Mm, …`)
* The (i) button opens `FlightDetailsPopup` with per-segment details, layover blocks, total travel time, time-zone change (computed from ISO offset diff: parse `+HH:MM` from departIso/arriveIso), and airline summary.

### From/To autocomplete

* `AirportAutocomplete` clears on focus, requires ≥2 chars to show suggestions, restores the previously-selected label on blur/outside-click if no new selection was made. Dropdown panel has `min-width: 320px` and `white-space: nowrap` so full "CPH · Copenhagen" labels show on one line.

### Header & UX

* Header city names: `cityForCode(code)` parses the part after `·` in `AIRPORT_OPTIONS` labels.
* `AIRPORT_OPTIONS` has **no coordinates** — great-circle calculations require expanding it. Avoided so far.
* Airline logos: not currently used. If added, public sources are Daisycon (`https://daisycon.io/images/airline/?iata=XX`) and Google flights static (`https://www.gstatic.com/flights/airline_logos/70px/XX.png`).

### Deep-link from Saved Trips

* `buildInitialSearch` in `FlightsView.tsx` reads `cabin` and `tripType` from URL params so that the Saved Trips "Book" button can land the user on the flights page with the correct cabin class and trip type pre-selected. Valid cabin values: `"Economy" | "Premium Economy" | "Business" | "First"`. Valid tripType values: `"oneway" | "return" | "multiple"`. Falls back to `INITIAL_SEARCH` defaults if param is absent or invalid.

---

## 8. FILTERING PRINCIPLES

* URL-driven state (searchParams)
* No local-only filtering state
* All filters reflected in URL
* `search_submitted=1` controls activation

---

## 9. UI / DESIGN SYSTEM (OLTRA THEME)

Central file:

* `/src/styles/oltra-theme.css`

Principles:

* Glassmorphism panels
* Soft borders
* Subtle transparency
* Uppercase micro-labels
* Tight spacing consistency

Key tokens:

* `--oltra-glass-bg`
* `--oltra-radius-*`
* `--oltra-text-*`

---

## 10. DROPDOWN / FILTER BEHAVIOR

* Vertical sliders
* Sub-sections per taxonomy
* Max 4 visible items per section
* Scroll inside dropdown
* Controlled open/close state

---

## 11. SEARCH BEHAVIOR

* StructuredDestinationField drives input
* Suggestions dataset used for autocomplete
* No execution until meaningful input

---

## 12. MAP BEHAVIOR

* MapLibre GL
* Markers built from hotel coordinates
* Hover = popup
* Click = select hotel
* Auto-fit bounds

---

## 13. MEMBER FEATURES

* Add to trip
* Add to favourites
* Trip creation

All handled via:

* `/src/lib/members/db`

---

## 14. KEY RULES FOR DEVELOPMENT

* Minimal diffs only
* No duplication of logic
* Centralize reusable logic (e.g. location aliases)
* Keep UI consistent with Hotels as reference
* Do not break editorial hierarchy

---

## 15. LANDING PAGE LOGIC

Key files:

* `/src/components/site/LandingBackground.tsx` — full-screen image slideshow
* `/src/app/LandingSearchPanel.tsx` — floating search panel (destination, dates, guests, flights toggle)
* `/src/app/LandingSummary.tsx` — results panel showing hotel cards + flight previews

### LandingBackground

* 49 images in `/public/images/landing/landing-01.jpg … -49.jpg`
* Cycles with cross-fade + Ken Burns motion (zoom-in / zoom-out / pan-left / pan-right / fly-over)
* Shuffle algorithm (`buildCycle`) guarantees ≥20 positions between any repeat across cycle boundaries
* **No dark overlay** — the `rgba(0,0,0,0.34)` overlay was removed; images display at full brightness

### LandingSummary — hotel card links

* Each hotel card links to `/hotels?q=<hotel_name>&from=<date>&to=<date>&adults=N&submitted=1`
* This lands on the main Hotels page with that hotel filtered/selected — **not** the standalone `/hotels/[hotelid]` page (which exists but is not part of the intended UX flow)

### LandingSearchPanel

* "Add flights" checkbox (lowercase f) — activates flight search when destination, dates and guests are filled
* When active, shows home airport selector; origin IATA resolved from `AIRPORT_OPTIONS`

---

## 16. AUTH & MEMBERS

### Login page (`/src/app/login/LoginView.tsx`)

Three views rendered in the same panel:

* **login** — email + password; LOG IN button is `oltra-button-primary` only when email is valid (has `@`, `.`, letters before/between/after) AND password non-empty; CREATE NEW ACCOUNT and CONTINUE WITH GOOGLE always primary; no Facebook
* **signup** — email, password (≥7 chars, must contain letters and numbers), confirm password; Supabase `signUp` handles duplicate-email detection natively
* **forgot** — email field; email sending deferred until Vercel deployment (Vercel server function); shows placeholder message for now

### SiteHeader greeting

* Uses `supabase.auth.onAuthStateChange` only (no separate `getUser()` call — removed to fix race condition where `getUser()` could overwrite state with null during token refresh)
* Name resolution order: `memberName` from DB profile → `user.user_metadata.full_name` → `user.user_metadata.name` → shows "Hello" without name
* Shows "Members" when logged out, "Hello [FirstName]" when logged in

### Member profile name for OAuth users

* `fetchMemberProfileBrowser` in `/src/lib/members/db.ts` falls back to `user.user_metadata.full_name ?? user.user_metadata.name` when `member_profiles.member_name` is null
* This means Google OAuth users see their name pre-filled in Personal Information and in the header immediately after first login, before they have saved a profile

### OAuth redirect URLs (Supabase config required)

* Code uses `window.location.origin` dynamically for the `redirectTo` URL
* Both the Vercel production URL and `http://localhost:3000` must be in Supabase Dashboard → Authentication → URL Configuration → Redirect URLs, and in Google Cloud Console → Authorized redirect URIs
* Site URL in Supabase should be set to the production Vercel URL after deployment

---

## 17. CURRENT STATE SUMMARY

* Hotels UI: complete and stable; featured mode cycles all hotels with ext_points > 10 in random order with ≥40-position repeat gap
* Hotels data model: app code fixed (2026-06-24) to match the migrated Directus schema — taxonomy fields are flat multiselect tags now (not M2M), field renames applied across hotels/landing/inspire/editor code (`hotelid`→`id`, `editor_rank_13`→`editor_rank`, state field underscore fix, `booking_URL` casing). Verified via `tsc --noEmit`, live Directus queries, and a dev-server smoke test.
* Restaurants data: v3 database loaded 2026-06-27 — 23 cities, 804 records, all with `restaurant_type` field. Source files at `scripts/restaurants/[city]_restaurants.json`. See §3 for full schema and upsert instructions.
* Restaurants UI: enabled (was temporarily disabled during data migration); city filter + restaurant-type pill filter (All / Fine dining / High-end casual / Informal local favorite / Beach club); map + list both respond to type filter
* Flights UI: Duffel-backed search, return-trip airline matching (same airline / alliance), per-segment detail popup, smart max-duration defaults, scrollbar-aware column alignment, cabin + tripType URL params for deep-linking from Saved Trips
* Landing page: no dark overlay, hotel cards link to main /hotels page, "Add flights" label correct
* Members UI: Personal Information, Saved Trips (with localStorage trip notes + Book redirect URLs), Favorites — complete
* Login: three-view panel (login / signup / forgot), Google OAuth only, active button state validation
* Auth header: race-condition-free, OAuth name fallback, instant greeting on login
* Location alias system implemented (Saint Tropez ↔ Ramatuelle)
* Build: passes `npm run build` and `npx tsc --noEmit` clean (warnings only, no errors)

---

## 18. BACKUP WORKFLOW

### How it works

* Primary repo: `ufalkgm-prog/oltra-beta` (this repo)
* Backup repo: `ufalkgm-prog/oltra-backup`
* Workflow file: `.github/workflows/backup.yml`
* Trigger: every push to `main` — fully automatic, no manual steps needed
* Auth: SSH deploy key — **does not expire**
  * Public key added to `oltra-backup` → Settings → Deploy keys (write access)
  * Private key stored (base64-encoded) as secret `BACKUP_SSH_KEY` in `oltra-beta`

### Viewing workflow status and errors

1. Go to **github.com/ufalkgm-prog/oltra-beta → Actions tab**
2. Find the latest "Backup to oltra-backup" run
3. Click it to expand, then click the "backup" job to see the full log
4. A red ✗ next to the job means the push actually failed

### Common errors and fixes

**"error in libcrypto" or "Permission denied (publickey)"**
→ The `BACKUP_SSH_KEY` secret is corrupted. Regenerate and re-set it:
1. In the codespace terminal: `ssh-keygen -t ed25519 -C "oltra-backup-deploy-key" -f /tmp/backup-deploy-key -N ""`
2. Add the new public key to oltra-backup → Settings → Deploy keys (write access): `cat /tmp/backup-deploy-key.pub`
3. Get the base64 private key from the terminal (not from chat): `cat /tmp/backup-deploy-key | base64 -w 0`
4. Copy that output from your terminal and paste into oltra-beta → Settings → Secrets → `BACKUP_SSH_KEY` → Update
5. **IMPORTANT**: always copy the base64 string from your raw terminal, never from chat (markdown rendering corrupts it)

**"Repository not found"**
→ The `oltra-backup` repo was deleted or renamed.
Fix: re-create it at github.com/ufalkgm-prog/oltra-backup (private, empty), re-add the deploy key, then re-run the workflow.

**Re-running a failed workflow**
1. Actions tab → find the failed run → click "Re-run all jobs" (top right)

### Manual backup push (if workflow keeps failing)

```bash
eval $(ssh-agent -s)
cat /tmp/backup-deploy-key | ssh-add -
git push git@github.com:ufalkgm-prog/oltra-backup.git main --force
```

### Verify backup is current

```bash
gh api repos/ufalkgm-prog/oltra-beta/commits/main --jq '.sha'
gh api repos/ufalkgm-prog/oltra-backup/commits/main --jq '.sha'
```

Both SHAs should match.

---

## 19. HOTEL DATA BACKFILL — IN PROGRESS (started 2026-05-22)

### Background

16 new hotels were inserted into Directus on 2026-05-22 (IDs 1825–1840, all `published: false`). The following fields are already populated for all 16: `hotel_name`, `affiliation`, `country`, `city`, `local_area`, `region`, `primary_setting`, `secondary_setting`, `primary_style`, `secondary_style`, `highlights`, `www`, `activities1`–`activities7` (raw input fields, no underscore), and the `setting`/`style`/`activities` multiselect tags (these are now flat fields, not M2M relations — see section 4).

### Still to do for each hotel

- [ ] `description` — 2–4 sentence editorial description (next task)
- [ ] `lat` / `lng` — coordinates for map mode
- [ ] Agoda matching — `agoda_hotel_id`, `agoda_hotel_name`, photos, booking URL
- [ ] Scoring — `ext_points`, `editor_rank`
- [ ] Awards — boolean flag columns (`best50`, `cn`, `forbes5`, `michelin3keys`, `telegraph`, `tl100`, `aaa5d`)
- [ ] `published: true` — only after all above are complete and reviewed

### The 16 hotels (Directus IDs)

| ID | hotel_name | country | city |
|---|---|---|---|
| 1825 | Atlantis The Royal | United Arab Emirates | Dubai |
| 1826 | Chablé Yucatán | Mexico | Mérida |
| 1827 | Upper House Hong Kong | China | Hong Kong |
| 1828 | Belmond Copacabana Palace | Brazil | Rio de Janeiro |
| 1829 | Mandarin Oriental Qianmen, Beijing | China | Beijing |
| 1830 | Jumeirah Marsa Al Arab | United Arab Emirates | Dubai |
| 1831 | Hotel Il Pellicano | Italy | Porto Ercole |
| 1832 | The Emory | England | London |
| 1833 | Maroma, A Belmond Hotel | Mexico | Riviera Maya |
| 1834 | The Lana | United Arab Emirates | Dubai |
| 1835 | Janu Tokyo | Japan | Tokyo |
| 1836 | One&Only Mandarina | Mexico | Puerto Vallarta |
| 1837 | Las Ventanas al Paraíso, A Rosewood Resort | Mexico | San José del Cabo |
| 1838 | Estelle Manor | England | Oxford |
| 1839 | Grand Park Hotel Rovinj | Croatia | Rovinj |
| 1840 | Mandapa, a Ritz-Carlton Reserve | Indonesia | Ubud |

### Description guidelines

* 2–4 sentences, editorial tone, first-person-plural avoided
* Focus on what makes the property distinctive — setting, architecture, USP
* No marketing superlatives ("world's best", "unparalleled")
* Cross-reference `highlights` field (max 15 words) — description expands on it, does not repeat it verbatim
* Target length: 60–100 words

### Website URLs (for fetching description content)

| ID | URL |
|---|---|
| 1825 | https://www.atlantis.com/atlantis-the-royal |
| 1826 | https://yucatan.chablehotels.com/ |
| 1827 | https://www.upperhouse.com/en/hongkong/ |
| 1828 | https://www.belmond.com/hotels/south-america/brazil/rio-de-janeiro/belmond-copacabana-palace/ |
| 1829 | https://www.mandarinoriental.com/en/beijing/qianmen |
| 1830 | https://www.jumeirah.com/en/stay/dubai/jumeirah-marsa-al-arab |
| 1831 | https://www.pellicanohotels.com/en/hotels/hotel-il-pellicano/ |
| 1832 | https://www.maybourne.com/en/hotels/the-emory |
| 1833 | https://www.belmond.com/hotels/north-america/mexico/riviera-maya/belmond-maroma-resort-and-spa/ |
| 1834 | https://www.dorchestercollection.com/dubai/the-lana |
| 1835 | https://www.janu.com/janu-tokyo/ |
| 1836 | https://www.oneandonlyresorts.com/mandarina |
| 1837 | https://www.rosewoodhotels.com/en/las-ventanas-los-cabos |
| 1838 | https://estellemanor.com/ |
| 1839 | https://www.maistra.com/properties/grand-park-hotel-rovinj/ |
| 1840 | https://www.ritzcarlton.com/en/hotels/dpsub-mandapa-a-ritz-carlton-reserve/overview/ |

---

## 20. HOTEL LAT/LNG GEOCODING — PAUSED, BLOCKED ON API KEY (as of 2026-06-25)

### Goal

Backfill `lat`/`lng` for hotels in Directus using the Google Maps Platform, via `GOOGLE_MAPS_API_KEY` in `.env.local`. **0 of 806 hotels currently have `lat`/`lng` populated** — this is a from-scratch backfill, not a fix to existing data, so there is nothing to corrupt by waiting.

### Blocker — fix this first before resuming

`GOOGLE_MAPS_API_KEY` is currently **invalid**. Tested read-only (no Directus involved) against three separate Google Maps Platform endpoints — Geocoding API, Places API (Find Place from Text), and even the plain Static Maps API — all three returned the same rejection:

```
"error_message": "The provided API key is invalid.",
"status": "REQUEST_DENIED"
```

The key is 36 characters and does **not** start with `AIza`, which is atypical for a real Google Maps Platform key (those are normally 39 chars, `AIza...`) — it may be a stale/placeholder value rather than a live key. Rejection across multiple unrelated APIs points to the key itself being bad, not just "Geocoding API not enabled" on an otherwise-valid key.

**Before resuming:** get a working key (generate/fix in Google Cloud Console — ensure billing is attached and the relevant API(s) are enabled), update `.env.local`, then re-test with the snippet above before doing any bulk work.

### Second issue found — verify before bulk-writing coordinates

In Directus, `hotels.lat` and `hotels.lng` are typed `integer` at the **Directus metadata layer** (`meta.type`), but the underlying Postgres column (`schema.data_type`) is actually `numeric` with no precision/scale constraint — so the real column *can* store decimals, but Directus's own field-type casting might still truncate decimal values to whole numbers on write because it thinks the field is an integer (unconfirmed — a test write was correctly blocked mid-session for lacking plan approval, so this still needs to be verified).

**Before the bulk run:** test-write a decimal value (e.g. `48.856613`) to one hotel via the Directus API and read it back. If it round-trips exactly, no fix needed. If it gets truncated/rounded, change the field's Directus metadata `type` from `integer` to `decimal`/`float` (via `PATCH /fields/hotels/lat` and `/fields/hotels/lng`) before writing real data — otherwise every pin would be off by up to ~100km (whole-degree rounding).

### Open decision — not yet made

Which Google API to use for the lookup, once the key works:

* **Geocoding API** (~$5/1000 requests) — address-string based; cheaper, but may fall back to a city-centroid point for remote lodges/resorts that don't parse well as a postal address.
* **Places API — Find Place from Text** (~$17/1000 requests) — searches by business/POI name, more likely to land on the actual property pin rather than the city center. Better fit for a luxury-property map (CLAUDE.md §12: "Markers built from hotel coordinates") but costs more.

Address/name fields available per hotel to build the lookup query: `hotel_name`, `local_area`, `city`, `region`, `state_province_county_island`, `country` (see §3).

### Resume plan (once key + decision are sorted)

1. Re-test the API key (snippet above) — confirm `status: OK`.
2. Test-write a decimal lat/lng to one hotel, read back, fix the Directus field type if truncated (see above).
3. Decide Geocoding vs Places API for the lookup (cost/accuracy tradeoff above).
4. **EnterPlanMode** before the actual bulk write (806 hotels, ~$4–14 in API cost depending on choice) — per the standing rule to plan before any Directus data change, even though this collection has zero existing data to lose.
5. Run the geocode + write pass, spot-check a sample of results on the map, then update this section to reflect completion.

---

This document serves as the baseline context for all future OLTRA development sessions.
