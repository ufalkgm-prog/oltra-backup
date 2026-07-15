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
* Server-driven data (Supabase as canonical store, accessed via Directus CMS layer)
* Clean, scalable architecture with minimal technical debt

---

## 2. TECH STACK

Frontend:

* Next.js 15 (App Router)
* TypeScript
* Tailwind v4
* Server Components by default

Backend / Data:

* Supabase (OLTRA account, "Hotel database") — canonical data store for all hotel and restaurant records
* Directus (hosted on Railway) — CMS layer on top of Supabase; all content reads/writes go via Directus REST API (`/src/lib/directus`), never directly to Supabase for content

Auth / Members:

* Supabase (OLTRA account, separate from the Hotel database) — auth + user-specific data only

AI:

* Placeholder layer (no direct Directus querying)

Strict rules:

* No schema redesign unless explicitly requested
* No new libraries unless explicitly requested
* Minimal-diff, production-grade changes only

---

## 3. CORE DATA MODEL (SUPABASE / DIRECTUS)

> **Architecture note:** All hotel and restaurant data lives in Supabase (OLTRA account, "Hotel database"). Directus is a CMS layer running on top of that Supabase instance — it adds structured field definitions, permissions, and the REST API that the app uses. Never write directly to Supabase for content; always go via the Directus API.

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

Source JSON files are organised in two folders:

* `hotels-beta/scripts/restaurants/updated_restaurants/` — the original 23 cities, re-geocoded 2026-06-28
* `hotels-beta/scripts/restaurants/newrestaurants/` — all cities added from 2026-06-28 onwards

Old v2 files (`rest_[city].json`) are archived in `olddata/`.

**Current coverage (2026-06-28): 63 cities, 2,192 records loaded into Directus. All records have Google Maps–geocoded `lat`/`lng` coordinates.**

Cities: Abu Dhabi, Amsterdam, Athens, Auckland, Bangkok, Barcelona, Berlin, Brussels, Budapest, Buenos Aires, Cannes, Cape Town, Chicago, Copenhagen, Doha, Dubai, Edinburgh, Florence, Forte dei Marmi, Frankfurt, Geneva, Hamburg, Helsinki, Hong Kong, Istanbul, Jakarta, Kuala Lumpur, Kyoto, Las Vegas, Lima, Lisbon, London, Los Angeles, Madrid, Marrakech, Marseille, Melbourne, Mexico City, Miami, Milan, Monaco, Munich, New York, Nice, Osaka, Oslo, Paris, Rio de Janeiro, Rome, Saint-Tropez – Ramatuelle, San Francisco, Santiago, Seoul, Singapore, Stockholm, Sydney, São Paulo, Tokyo, Toronto, Vancouver, Venice, Vienna, Zurich.

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

### Geocoding restaurants (lat/lng)

`GOOGLE_MAPS_API_KEY` is present in `hotels-beta/.env.local` and confirmed working (tested 2026-06-28).

**Field types confirmed safe** (checked 2026-06-28): `restaurants.lat` and `restaurants.lng` are `numeric(10,5)` in Postgres with no Directus integer-cast override (`meta.type: null`) — decimal coordinates round-trip correctly to 5 d.p. (~1 m precision). No field-type fix needed before writing.

**Workflow:**

1. User downloads current restaurant data and reviews lat/lng correctness.
2. User specifies which cities need geocoding/correction.
3. Run Geocoding API (`maps.googleapis.com/maps/api/geocode/json`) with query `restaurant_name + city + country` for each restaurant in the specified cities where `lat`/`lng` is null or incorrect.
4. Patch corrected coordinates back to Directus via `PATCH /items/restaurants/:id`.

**Workflow for new cities:**

1. Add geocoded JSON file to `scripts/restaurants/newrestaurants/` (file can have `oltra_` prefix — upsert script handles it).
2. Run geocoding script: `GOOGLE_MAPS_API_KEY=... node scripts/restaurants/geocode-new-restaurants.mjs --only "City Name"` — updates lat/lng in the JSON file in place.
3. Upsert: `DIRECTUS_URL=... DIRECTUS_TOKEN=... node scripts/restaurants/directus-upsert-restaurants-batch.mjs --dir scripts/restaurants/newrestaurants --only [filename]`
4. Add the new city to the CITIES array in `geocode-new-restaurants.mjs` so future re-runs cover it.

**Cost:** ~$5/1000 requests (Geocoding API). A city of 35 restaurants costs ~$0.18.

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

### Writing these fields via the Directus API (confirmed 2026-07-07, corrected 2026-07-07)

`GET /fields/hotels/activities` shows Directus's own schema introspector tags these columns `type: "unknown"` (it has no first-class concept of a native Postgres array column, even though `schema.data_type` is correctly `text[]`). This is harmless for **reads** — Postgres's wire protocol returns proper arrays regardless of Directus's type metadata.

It breaks on **both create (`POST /items/hotels`) and update (`PATCH /items/hotels/:id`)**: sending a plain JS array (e.g. `["Spa","Fitness"]`) gets JSON-stringified by Directus and Postgres rejects it — `malformed array literal: "[\"Spa\",\"Fitness\"]"`. (An earlier version of this note claimed PATCH was fine with a plain JS array — that was wrong; confirmed failing live during the 2026-07-07 award-review apply step, see `hotels-beta/scripts/hotels/new-hotels-2026/apply-award-review-2026-07-07.mjs`.) The fix works the same for both verbs: send a **Postgres array-literal string** instead, e.g. `'{"Spa","Fitness"}'`. Reusable helper (`toPgArrayLiteral`) is in `hotels-beta/scripts/hotels/new-hotels-2026/create-hotels-batch.mjs` (also duplicated in the apply-award-review script above) — any future script that *creates or updates* hotel rows with `activities`/`awards`/`setting`/`style` needs this conversion.

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
* Hotel awards: full-collection audit completed 2026-07-15 across all 7 award codes (Michelin 3 Keys, AAA/CAA Five Diamond, Condé Nast Gold List, World's 50 Best, Forbes 5 Star, Travel + Leisure 100, Telegraph) — see §25 for results, algorithm fixes, and follow-up items
* Hotels data model: app code fixed (2026-06-24) to match the migrated Directus schema — taxonomy fields are flat multiselect tags now (not M2M), field renames applied across hotels/landing/inspire/editor code (`hotelid`→`id`, `editor_rank_13`→`editor_rank`, state field underscore fix, `booking_URL` casing). Verified via `tsc --noEmit`, live Directus queries, and a dev-server smoke test.
* Restaurants data: 63 cities, 2,192 records as of 2026-06-28 — all with `restaurant_type` field and Google Maps–geocoded coordinates. Source files in `scripts/restaurants/updated_restaurants/` (original 23 cities) and `scripts/restaurants/newrestaurants/` (40 new cities). See §3 for full schema, upsert, and geocoding instructions.
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

## 20. HOTEL LAT/LNG GEOCODING

### Status (updated 2026-07-07)

Both blockers below are **resolved**: `GOOGLE_MAPS_API_KEY` in `.env.local` is now a valid 39-char `AIza...` key (confirmed `status: OK` against the Geocoding API), and lat/lng round-trip through Directus as exact decimals (e.g. `46.571428`) with no integer truncation — no field-type fix was needed.

The script is `hotels-beta/scripts/hotels/new-hotels-2026/google-geocode-hotels.mjs` (uses the **Places API — Find Place from Text**, per the cost/accuracy tradeoff below). It builds fallback query variants (name+area+city+region+country down to name+country), scores candidates by country/city string-match against the returned address, and flags mismatches for manual review. Supports `--ids`, `--countries`, `--cities`, `--dry-run`, `--force` (re-geocode hotels that already have coordinates), `--verify`, `--out <report.json>`. Safe to re-run — skips any hotel that already has `lat`/`lng` unless `--force` is passed.

**Known false-positive noise in the mismatch flags:** the country/city string-match is naive (plain substring check after accent-stripping), so it routinely flags correct results as mismatches when Google's formatted address uses a different name for the same place — country abbreviations (`UK`/`USA`/`UAE` vs the DB's full name), transliterations (`Wien`/`München`/`Bakı`/`Lisboa`/`Krung Thep Maha Nakhon`), post-2022 renames (`Türkiye` vs `Turkey`), or the DB's `city` field being a broader area/resort name than the specific town Google returns (`Alta Badia`→`San Cassiano`, `Ise-Shima`→`Shima`, `Maui`→`Kihei`). Always spot-check flagged results against the coordinates and formatted address before treating a mismatch as a real error — don't assume the flag means the geocode is wrong.

**2026-07-07 run:** geocoded the 67 new hotels from §23 (IDs 2001–2067) — see that section for results.

### Remaining scope — legacy hotels (~800, pre-dating §23's batch)

The original goal of this section was a from-scratch backfill across the whole `hotels` collection (0 of 806 hotels had `lat`/`lng` as of 2026-06-25, before the §23 batch existed). That larger backfill has **not** been run yet — only the 67 new hotels have been geocoded so far. To resume for the rest:

1. Confirm current count still missing `lat`/`lng` (may have changed since 2026-06-25).
2. **EnterPlanMode** before the bulk write (hundreds of hotels, real API cost) — per the standing rule to plan before any Directus data change.
3. Run `google-geocode-hotels.mjs` (no `--ids` scope, or `--countries`/`--cities` in batches) using the same Places API approach, spot-check results (esp. flagged mismatches per the note above), then update this section.

### Cost reference

* **Geocoding API** (~$5/1000 requests) — address-string based; cheaper, but may fall back to a city-centroid point for remote lodges/resorts that don't parse well as a postal address.
* **Places API — Find Place from Text** (~$17/1000 requests, the one this script uses) — searches by business/POI name, more likely to land on the actual property pin rather than the city center. Better fit for a luxury-property map (§12: "Markers built from hotel coordinates").

---

## 21. HOTEL DESCRIPTION PARAGRAPH REFORMATTER — PENDING API KEY

### Goal

Add natural paragraph breaks to hotel descriptions in Directus using Claude's API. Current state (2026-06-27):

| Paragraphs | Hotels | Status |
|---|---|---|
| 1 (single block) | 39 | Needs splitting |
| 2 paragraphs | 219 | Needs splitting |
| 3 paragraphs | 504 | Probably fine |
| 4 paragraphs | 42 | Fine |

Target: 3–4 paragraphs per description, split at natural topic transitions (setting/location → architecture/rooms → dining/activities → atmosphere).

### Blocker

`ANTHROPIC_API_KEY` is not present in `hotels-beta/.env.local`. Add it before starting:
```
ANTHROPIC_API_KEY=sk-ant-...
```
Get the key from console.anthropic.com → API Keys (account: ufalkgm@gmail.com).

### Script to build

`hotels-beta/scripts/hotels/reformat-descriptions.mjs`

- Zero new npm dependencies — raw `fetch` only
- Model: `claude-haiku-4-5-20251001` (fast, cheap — estimated < $0.10 for all 762 hotels)
- Flags: `--dry-run` (default) / `--apply` / `--only <id>` / `--limit N` / `--min-paras N` (default 4)
- Separator convention: `\n\n` between paragraphs (matches existing data)
- Validates response: same word count ±5% to catch rewriting

### System prompt for Claude

```
You are an editorial assistant for a luxury travel platform. Your job is to add paragraph breaks to hotel descriptions.

Rules:
- Split the text into paragraphs at natural topic transitions (e.g. location/setting → architecture/rooms → dining/activities → atmosphere).
- Aim for 3–4 paragraphs.
- Do NOT rewrite, rephrase, or change any words. Preserve the exact wording.
- Separate paragraphs with a single blank line (\n\n).
- Return ONLY the reformatted description text — no commentary, no labels, no extra whitespace.
```

### Run order (once key is available)

1. `--dry-run --only <id>` on one 0-newline hotel → confirm 3–4 paragraphs with natural breaks
2. `--dry-run --only <id>` on a 3-paragraph hotel → confirm it is skipped
3. `--apply --only <id>` on one hotel → verify Directus patched and dev server renders correctly
4. `--dry-run --limit 10` → review sample before bulk
5. `--apply` full run (762 hotels)

---

---

## 22. NEXT SESSION — HOTEL DESCRIPTION PARAGRAPH SPACING (planned 2026-06-29)

Add natural paragraph breaks to hotel descriptions in Directus. Full background and script spec are in §21 above. The only blocker is the `ANTHROPIC_API_KEY` — add it to `hotels-beta/.env.local` before starting:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Get from console.anthropic.com → API Keys (account: ufalkgm@gmail.com).

Once the key is in place, follow the run order in §21 exactly: dry-run one hotel, verify output, apply to one hotel, check the dev server renders correctly, then bulk run.

---

## 23. NEW HOTEL BATCH — 67 HOTELS ADDED (2026-07-07)

67 new hotels were created in Directus, **IDs 2001–2067**, all `published: false`. Source files and scripts live in `hotels-beta/scripts/hotels/new-hotels-2026/`: `new_hotels_batch1.json`–`new_hotels_batch14.json`, `create-hotels-batch.mjs` (creation, safe to re-run — skips any ID that already exists, doubles as the reference implementation for the array-field write fix in §4), and `google-geocode-hotels.mjs` (lat/lng geocoding, relocated here 2026-07-07 — see §20 for how it works).

### Fields already populated for all 67

`hotel_name`, `published`, `country`, `region`, `state_province_county_island`, `city`, `local_area`, `affiliation`, `highlights`, `description`, `editor_rank`, `ext_points`, `total_rooms_suites_villas`, `activities`, `awards` (tag field), `setting`, `style`, the 7 award boolean flags (`best50`, `cn`, `forbes5`, `michelin3keys`, `telegraph`, `tl100`, `aaa5d`), `www`, `insta`, and (as of 2026-07-07) `lat`/`lng` via the Places API — see §20.

### Still to do for each hotel (same pattern as §19)

- [x] `lat` / `lng` — geocoded 2026-07-07 via `google-geocode-hotels.mjs`, all 67 populated
- [x] Awards — audited and applied 2026-07-07, see §24
- [x] `published: true` — applied 2026-07-07 via `publish-new-hotels-2026-07-07.mjs` to 66 of the 67 (all except **id 2020, Mandarin Oriental Cortina**, which stays `published: false` per explicit instruction). Note this was done *ahead of* Agoda/booking fields below, out of the original planned order.
- [ ] Agoda matching — `agoda_hotel_id`, photos, booking URL. **Explicitly aborted 2026-07-07** — the existing pipeline (`scripts/agoda/match-agoda-hotels.mjs`) needs a bulk Agoda hotel-list export to fuzzy-match against, which isn't available for this batch, and Agoda's affiliate API has no name-search endpoint (ID-lookup only — see `GetHotelInformation` in `test-agoda-content.mjs`). GIATA's ID-mapping API (which could bridge this) returns 403, needs a special agreement. Revisit only when a fresh bulk export is available, or with an explicit decision to do manual per-hotel lookups.
- [ ] Booking fields (`booking_provider`, `booking_URL`, etc.) or explicitly set `booking_provider: "none"` — not started.

---

## 24. HOTEL AWARDS REVIEW WORKFLOW (2026-07-07)

### What this is

The 7 award boolean flags (`best50`, `cn`, `forbes5`, `michelin3keys`, `telegraph`, `tl100`, `aaa5d`) on `hotels` are set at hotel-creation time from whatever source the editor had, and can drift out of sync with the real award lists (wrong, stale, or simply unverified). This workflow cross-checks a batch of hotels against curated source lists and corrects the flags + the `awards` tag array.

Scripts (all in `hotels-beta/scripts/hotels/new-hotels-2026/`):

* `match-hotel-awards.mjs` — **read-only**. Loads `awards-2026/*.json`, fetches the target hotels from Directus, matches by name/location, writes both a plain-text report and a structured JSON report (`award-review-<code>-<date>.{txt,json}`). **As of 2026-07-15 this is general-purpose and reusable**, not scoped to one batch: takes `--award <code>` (required, one of the 7 codes — run one at a time) and an optional `--ids <from>,<to>` to restrict scope (default is the full `hotels` collection). Four buckets: **confirmed** (exact core-name match, no location conflict), **near** (brand-prefix-agnostic containment match, e.g. "Tamarindo" vs "Four Seasons Resort Tamarindo"), **uncertain** (weaker signal — needs a human call), **removal candidates** (flag/tag currently set but no source-list match found). Also flags **drift** (boolean column and `awards` tag array disagree with each other, independent of source-list matching). Safe to re-run anytime. See §25 for the algorithm fixes made 2026-07-15 and the full-collection results.
* `apply-award-review-2026-07-07.mjs` — **writes** to Directus. Dry-run by default; `--confirm` to actually patch. Takes hardcoded lists of exactly what to change (`CONFIRMED` additions, `RENAMES` to the award list's official naming, `REMOVALS` for flags that couldn't be confirmed) — this is a one-time record of a specific reviewed session, not a general tool. Copy this file's pattern (Directus fetch/patch helpers + `toPgArrayLiteral`) as the starting point for the next award-review round rather than editing this one's hardcoded lists.
* `recalc-ext-points-2026-07-07.mjs` — **writes** to Directus. Run this *after* any award-flag change (from `apply-award-review-*.mjs` or a manual edit) — `ext_points` is not auto-derived, so a stale value silently lingers until recomputed. Dry-run by default; `--confirm` to write. General-purpose as-is (reusable — no hardcoded per-hotel data, just the formula and the hardcoded ID range filter): `ext_points = editor_rank + sum of award points`, where `editor_rank` is a stored field (not recomputed) and award points are `michelin3keys`=5, `best50`=5, `cn`=3, `tl100`=3, `forbes5`=3, `aaa5d`=3, `telegraph`=3. Only patches hotels where the computed value differs from the current one.

### Workflow order

1. Run `match-hotel-awards.mjs` (read-only) to get the review report.
2. Resolve Section C uncertain candidates (web research) and Section B unconfirmed-existing flags (human call) with the user.
3. Write/run an apply script (`apply-award-review-<date>.mjs` pattern) to patch the confirmed award flags + `awards` tag array.
4. **Run `recalc-ext-points-2026-07-07.mjs` (or its successor) — award flags changed in step 3 make `ext_points` stale until this runs.** Easy to forget since it's a separate field from `awards`/the boolean columns.

### Award source files (`awards-2026/*.json`)

One file per award code, each a flat JSON array of source entries (`hotel_name`, `city`/`location`, `state_region`, `country`, plus source-specific fields). **These files can be stale or incomplete** — always sanity-check the entry count against the award org's own published total before trusting a file. In this session: Forbes had only 109 of the real 343 five-star hotels, Travel+Leisure had 89 of 100, Condé Nast's Gold List was a full year stale (2025 file vs. the already-published 2026 list), and Michelin Keys had 130 of the true 143 (never fully resolved — see below).

**How to find a full/current list when the org's website only exposes a search widget:**
* Check the page's JS for an `ajax`/`fetch` call to a `.json` endpoint — Forbes Travel Guide's entire dataset is at `forbestravelguide.com/award-winners.json` (2,414 properties, filter by `propertyType`/`ratingDisplay`). Condé Nast Traveler's gallery/article pages embed a `window.__PRELOADED_STATE__` JSON blob containing the full `gallery.items` array (or the full article `body` as a hyperscript-like `["h3", "text"]` tree) — no need to scrape rendered HTML.
* If the site blocks direct `curl`/fetch (AWS WAF JS challenge on Michelin's `guide.michelin.com`; a 402/bot-block on `travelandleisure.com`), check the **Wayback Machine** for a snapshot of the specific article URL (`archive.org/wayback/available?url=...`) — this recovered the full Travel+Leisure Top 100 and World's 50 Best 51-100 list when the live site wouldn't serve either script or WebFetch.
* Some "full list" secondary sources (SEO blogs, affiliate sites) can be internally inconsistent (their own stated totals don't add up) — cross-check any secondary source's math before trusting it. When a user-supplied "new" source file doesn't reconcile with the current file (e.g. two supposedly-complete Michelin Keys lists sharing only ~1/3 of entries), that's a sign one of them is a different tier or year, not a data-quality bug to merge away — ask before incorporating.

### Matching-algorithm gotchas (already fixed in `match-hotel-awards.mjs`, keep in mind if extending it)

* Strip generic hospitality words (`hotel`, `resort`, `spa`, plurals) before the **exact**-match check, not just the fuzzy-scoring path — otherwise "Four Seasons Resort Tamarindo" never lines up with a source's "Four Seasons Tamarindo".
* Compare stripped tokens as a **sorted set**, not an ordered string — sources reorder the same words (our DB's "Rosewood Castiglion del Bosco" vs. Forbes's "Castiglion del Bosco, A Rosewood Hotel").
* A location-string mismatch should not hard-exclude a candidate whose core name matches exactly — surface it for human review instead (caught a real same-property case: DB city "Tamarindo" vs. source's "La Manzanilla", the specific coastal town name for the same resort).
* Chain brands (Mandarin Oriental, Four Seasons, Rosewood, ...) often have multiple distinct properties in the same city/region — a fuzzy brand-name match with country+city corroboration is still not proof of identity. Always verify uncertain chain-brand candidates against real-world facts (a web search) before treating them as the same hotel. This session found 4 genuinely different properties this way: Mandarin Oriental Wangfujing ≠ Qianmen (Beijing), Mandarin Oriental Dubai Downtown ≠ Jumeira, Naviva ≠ Four Seasons Resort Punta Mita (adjacent but separate resorts), Four Seasons Bali at Sayan ≠ at Jimbaran Bay.
* Once a fuzzy candidate is confirmed as a genuine match, the award list's name is often the *more complete/official* one — consider updating the DB's `hotel_name` (and `city`, if the source's location is more specific) to match, not just flipping the boolean.

### Directus write gotcha

Writing to `activities`/`awards`/`setting`/`style` (native Postgres `text[]` columns) requires the Postgres array-literal string (`toPgArrayLiteral`, see §4) on **both** `POST` and `PATCH` — an earlier version of §4 claimed PATCH was safe with a plain JS array; that was wrong and is now corrected.

**Update 2026-07-14:** the "Award source files" note above (Forbes 109/343, T+L 89/100, CN stale, Michelin 130/143) is now out of date — all 7 source files were re-verified/rebuilt this session. See §25 for current status and the in-progress full-collection audit that follows on from it.

---

## 25. HOTEL AWARDS — FULL-COLLECTION AUDIT (completed 2026-07-15)

### Where this picks up from

§24 covered a review scoped to the 67 new hotels (IDs 2001–2067). The natural next step — reviewing awards for the **entire hotels collection** (~806+ hotels) — was requested 2026-07-14. Before starting that, the 7 `awards-2026/*.json` source files themselves needed re-verification, since §24 already flagged several as incomplete/stale and one (Michelin) turned out to be badly wrong in a way nobody had caught.

### Source file status (as of 2026-07-14 — supersedes the stale note in §24)

All verified against **live, authoritative sources** (not secondary press write-ups). Commit `77e70bc` "Rebuild Michelin/AAA/T+L award source files against authoritative live data".

| File | Result | Detail |
|---|---|---|
| `forbes5.json` | **No change** | Exact match (343/343) vs `forbestravelguide.com/award-winners.json` |
| `best50.json` | **No change** | Exact match (100/100) vs `theworlds50best.com`'s live 2026 list |
| `cn.json` | **No change** | Exact match (73/73) vs CN Gold List 2026 gallery data |
| `telegraph.json` | **No change** | 49/50 exact (1 trivial naming variant); Telegraph hasn't published a newer edition — live page is still the Sept 2024 article |
| `tl100.json` | **Rebuilt** (100 entries) | Old file was the 2025 edition; T+L published 2026 results 2026-07-07 (a week before this session) — 78 of 100 hotels turned over |
| `aaa5d.json` | **Rebuilt** (151 entries, was 146) | Old file was stale; rebuilt from AAA's own 2026 PDF — 14 new designations, 9 properties no longer listed |
| `michelin3keys.json` | **Rebuilt** (143 entries, was 134 raw/133 unique) | Old file wasn't just incomplete — it had **badly wrong per-country counts** (29 "USA" entries vs the real 16, only 14 France vs the real 23, 8 UAE entries that shouldn't have been there at all). Root cause: originally built from secondary press write-ups conflating tiers/adjacent luxury hotels, not the verified Three-Key roster. |

### How to refresh each source file (techniques discovered 2026-07-14)

* **Forbes 5-Star**: `forbestravelguide.com/award-winners.json` — filter `propertyType === "HOTEL" && ratingDisplay === "5-Star Rated"`. Already documented in §24; confirmed still working.
* **World's 50 Best**: `theworlds50best.com/hotels/best-in-the-world/list/1-50` and `/51-100` — **client-rendered**, plain `curl`/WebFetch only sees a loading shell. Needs a headless browser (see "Puppeteer" note below). Simple `rank / name / city` text once rendered.
* **Condé Nast Gold List**: `cntraveler.com/gold-list` links to regional gallery articles (`/gallery/gold-list-europe-hotels`, `/gallery/gold-list-asia-hotels`, `/gallery/best-hotels-africa-middle-east-gold-list`, `/gallery/best-hotels-mexico-south-america-gold-list`, `/gallery/best-hotels-united-states-canada-gold-list`, `/gallery/the-gold-list-2026-the-top-hotels-and-resorts-in-australia` — 6 regions, no single master page). Each gallery page's `window.__PRELOADED_STATE__.transformed.gallery.items[]` has `dangerousHed` = `"Hotel Name — Country"` (or just the name if the country's already in the name).
* **Telegraph Best Hotels**: `telegraph.co.uk/travel/hotels/best-hotels-in-world-telegraph-awards/` is paywalled live (free-account gate after ~1 paragraph). Use the **Wayback Machine** (`archive.org/wayback/available?url=...`) for a pre-paywall or cached full snapshot — recovered the complete ranked list of 50 this way.
* **Travel + Leisure 100**: direct `curl` gets **HTTP 402** (bot-block, not a real paywall — a headless browser sails through). URL is `travelandleisure.com/worlds-best-awards-top-100-hotels-in-the-world-<id>` (find current slug via the hub page `travelandleisure.com/worlds-best-awards`, since the numeric ID suffix can change year to year). Full 100-entry list is present in the **initial** page load — no scroll-triggered lazy loading despite appearances.
* **AAA Five Diamond**: official PDF at `newsroom.aaa.com/wp-content/uploads/2024/04/AAA-Five-Diamond-Hotels-<YEAR>-1.pdf` (note the URL's `2024` stays fixed even as `<YEAR>` in the filename updates annually — AAA doesn't move the upload path). No scraping needed — `curl` it directly and read the PDF.
* **Michelin 3 Keys**: `guide.michelin.com` itself is WAF-blocked (per §24). Found a workaround: `finehotelsguide.com/three-key-hotels` client-renders from `finehotelsguide.com/api/hotels?page=1&limit=10000&keyTier=Three-Keys` (discovered by watching network requests in a headless browser — the endpoint isn't referenced anywhere in the static JS bundle, only called at runtime). Each returned entry includes a direct link to its own `guide.michelin.com` page, so this is effectively Michelin's own data, not a third party's interpretation of it.

**Puppeteer note**: none of the above JS-rendered sites (World's 50 Best, T+L, Condé Nast, Michelin via finehotelsguide) are fetchable with plain `curl`/WebFetch. This session installed `puppeteer` (bundled Chromium) via `npm install puppeteer` — but **only in the scratch working directory**, not as a project dependency, so it isn't available in the repo by default. Needed system libraries first (`sudo apt-get install libatk1.0-0 libatk-bridge2.0-0 libcups2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2t64 libpango-1.0-0 libcairo2 libnss3 libnspr4`) — without them Chrome fails with `libatk-1.0.so.0: cannot open shared object file`. A future session repeating this will need to redo both steps.

### Directus credentials — resolved 2026-07-15

`hotels-beta/.env.local` didn't exist in the 2026-07-14 codespace (a fresh checkout — correctly gitignored, never committed). The user provided `DIRECTUS_URL` and `DIRECTUS_TOKEN` directly (via Directus's own user-profile Token field, not any machine-level secret store) and the file was created 2026-07-15. **General guidance for any future fresh checkout still applies**: ask the user directly for credentials; do NOT go looking in Codespaces' own secret stores (e.g. `/workspaces/.codespaces/shared/.env-secrets`) even when they'd plausibly contain the answer — a different trust boundary than reading a project file, even when the motivation is legitimate.

### Full-collection match — completed 2026-07-15

Widened `match-hotel-awards.mjs` from the old hardcoded `filter[id][_between]=2001,2067` to the full `hotels` collection (873 hotels), with a `--award <code>` flag to run one award code at a time (per the requested workflow below) and an optional `--ids <from>,<to>` to restrict scope if ever needed again. Ran all 7 award codes in sequence: Michelin 3 Keys → AAA/CAA Five Diamond → Condé Nast Gold List → World's 50 Best → Forbes 5 Star → Travel + Leisure 100 → Telegraph.

**Workflow used, per the user's 2026-07-14 request:**
* Went award-by-award; the user manually reviewed and approved every change before any Directus write, via an interactive HTML artifact per award (4 buckets: confirmed / near / uncertain / removal candidates, each with per-row approve/reject controls and a copyable JSON decision summary) rather than a flat text report.
* Both additions and removals were in scope every round — a genuine re-audit, not just gap-filling.
* Brand-prefix-agnostic matching (ignore whether a brand-name prefix is present, e.g. "Four Seasons Resort Tamarindo" ≈ "Tamarindo") implemented as a new "near" tier using token-set containment (requires ≥2 tokens in the smaller set, to avoid one-word false positives like a single shared word "palace" or "grand").

**Final results, all reconciled against Directus (0 removal candidates / 0 drift) except best50, which has 3 hotels the user chose to keep `true` despite the algorithm not matching them to the current source list — see the "place-name variant" note below):**

| Award | Confirmed | Near | Uncertain | Total changes applied |
|---|---|---|---|---|
| Michelin 3 Keys | 59 | 10 | 19 | 110 (40 add, 70 remove) + 2 manual corrections post-apply |
| AAA/CAA Five Diamond | 46 | 9 | 3 | 11 (2 add, 9 remove) |
| Condé Nast Gold List | 21 | 3 | 2 | 66 (13 add, 53 remove) |
| World's 50 Best | 62 | 2 | 17 | 1 (1 remove) — user rejected the algorithm's recommendation to keep 3 place-name-variant matches |
| Forbes 5 Star | 135 | 25 | 21 | 135 (105 add, 30 remove) |
| Travel + Leisure 100 | 26 | 3 | 13 | 48 (30 add, 18 remove) |
| Telegraph | 14 | 1 | 3 | 3 (0 add, 3 remove) |

Every apply step also ran an ext_points recalc scoped to just the hotels touched that round (§24 step 4) — never skipped.

### Algorithm fixes made during the audit (in `match-hotel-awards.mjs`)

Two real bugs were found and fixed mid-audit — both were caught by cross-checking the algorithm's output against source-file entries directly and against real-world facts, not by inspection of the code alone. Re-ran already-completed award passes after each fix to confirm no regression (0 removal candidates / 0 drift held throughout).

1. **Country-label hard-exclusion.** A real country-label mismatch (DB `country` = "China" vs. source "Hong Kong" for the same Hong Kong hotel; DB "St. Barthelemy" vs. source's umbrella "French West Indies" for the same island) was excluding a candidate *before* name similarity was even checked — silently dropping genuine matches (caught via Rosewood Hong Kong and Cheval Blanc St-Barth, the latter only found after cross-checking a "hotels not in DB" delta file and discovering the hotel actually *was* in the DB, just wrongly excluded). Fixed: an exact-name or containment match now downgrades to `uncertain` on a country conflict instead of being silently dropped.
2. **Same-state-different-city false positive.** `cityStatus()` treated any overlap at the state/region level as a location match — too loose in city-dense states/countries: "Four Seasons Resort The Biltmore Santa Barbara" matched "Four Seasons Hotel San Francisco" purely because both are "California". Fixed with a three-tier signal (`match` / `state-only` / `conflict`): a real city-level match is required to trust a *weak* name signal (brand-token overlap); `state-only` is accepted as corroboration only for a *strong* signal (exact-name or containment match) — this preserves legitimate remote-resort matches where the DB's `city` is hyper-local but the source list (or the DB's own `state_province_county_island` field) uses the broader named area, e.g. Royal Malewane's DB city "Hoedspruit" vs. Michelin's "Kruger National Park".

### Recurring pattern that only real-world verification catches: chain-brand name collisions

Distinct hotels sharing a brand *and* a city are a persistent false-positive source that no string-matching fix resolves — both properties genuinely share every location field the algorithm has. Every instance below required a live web search or direct source-file cross-check to resolve, and recurred across nearly every award pass:

* Mandarin Oriental Wangfujing ≠ Qianmen (Beijing) — best50, forbes5
* Mandarin Oriental Dubai Downtown ≠ Jumeira — forbes5
* Jumeirah Burj Al Arab ≠ Marsa Al Arab — best50, forbes5
* Four Seasons Istanbul at the Bosphorus (1 Michelin Key) ≠ at Sultanahmet (3 Keys) — michelin3keys
* Naviva ≠ Four Seasons Resort Punta Mita (adjacent but separate resorts, per §24) — cn
* Hotel Le Lana (Courchevel, France) ≠ The Lana (Dubai) — best50
* The Peninsula Beverly Hills ≠ The Beverly Hills Hotel — and Peninsula Beverly Hills isn't actually on Forbes's list at all — forbes5
* The Fifth Avenue Hotel ≠ The Langham, New York, Fifth Avenue — coincidental "Fifth Avenue" word overlap (a containment false positive, not a brand-prefix case) — aaa5d

**Rule of thumb going forward**: any `near`/`uncertain` match between two hotels of the same chain brand in the same city needs a live check before approving — the "core name" match being confident is not evidence.

### Duplicate hotel records found and deleted

Found incidentally while auditing awards (not via a systematic sweep — worth doing one at some point):
* id 1841 "Hotel da Cataratas" — duplicate of id 1782 "Hotel das Cataratas" (identical Belmond `www`/`insta`/lat-lng). Deleted 1841; kept 1782 (has 5 Agoda photos, matters for Featured Mode per §6).
* id 1643 "Waldorf Astoria Los Cabos Pedregal" (city "Cabo San Lucas") — duplicate of id 1649 (city "Los Cabos"), identical `www`/`insta`/lat-lng/room count. Deleted 1643; kept 1649 (5 Agoda photos vs. 0).

### Follow-up — hotels on award lists but not in the OLTRA database

Cross-checked the Michelin 3 Keys source list (143 entries) against all 873 DB hotels for entries with **zero match at any tier** — **54 of 143 have no match in the DB at all**, output at `hotels-beta/scripts/hotels/new-hotels-2026/michelin3keys-not-in-db-2026-07-15.{json,txt}`. Spread across 21 countries (France 8, USA 8, UK 5, Italy 6, Japan 4, Spain 4, single entries elsewhere). Not run for the other 6 award codes — the delta script itself wasn't saved as a named file this session (built ad hoc importing from `match-hotel-awards.mjs`'s exported functions; see chat history 2026-07-15 to reconstruct if needed). This isn't a data-quality issue with the awards — mostly small independent luxury properties the DB hasn't catalogued yet. Worth doing as a follow-up if/when expanding hotel coverage, and worth repeating for the other 6 award codes.

### Scripts produced this session (all in `hotels-beta/scripts/hotels/new-hotels-2026/`)

* `match-hotel-awards.mjs` — generalized per above; now exports its normalization/matching functions (`loadAwardList`, `loadHotels`, `hotelLocationFields`, `coreTokenSet`, `matchHotelToAward`, `TIER_RANK`, `AWARD_DISPLAY`, `ALL_AWARD_CODES`, `DIRECTUS_URL`, `DIRECTUS_TOKEN`) so other scripts (like the "not in DB" delta check) can reuse them without duplicating matching logic — guarded with `if (import.meta.url === \`file://${process.argv[1]}\`)` so importing it doesn't also trigger its CLI `main()`.
* `apply-award-review-2026-07-15-<code>.mjs` — one per award code (michelin3keys, aaa5d, cn, best50, forbes5, tl100, telegraph). Same one-time hardcoded-list pattern as the 2026-07-07 predecessor (§24) — dry-run by default, `--confirm` to write, sets the boolean column and `awards` tag array together via `toPgArrayLiteral`. Follow this naming convention for any future re-audit round; don't edit these, copy the pattern.
* `recalc-ext-points-2026-07-15-<code>.mjs` — one per award code, scoped to just the hotels touched by that round's apply script (not a full-collection recalc, unlike the 2026-07-07 predecessor which recalculated across a fixed ID range).
* `award-review-<code>-2026-07-15-final.{json,txt}` — final reconciled report per award code, generated after all corrections were applied (0 removal candidates / 0 drift, except best50's 3 kept exceptions).

---

This document serves as the baseline context for all future OLTRA development sessions.
