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

* Pool: all hotels with at least one real photo — `hasHotelPhotos()` in `cardHelpers.ts`, Ratehawk (`ratehawk_image_1`) preferred, Agoda (`agoda_photo1`–`agoda_photo5`) as fallback (§29) — no ext_points restriction
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

## 26. RATEHAWK INTEGRATION — HOTEL MATCHING (matching complete 2026-08-07; images + booking integration next)

### Goal

Add Ratehawk (Emerging Travel Group / ETG) as a booking data source, following the same shape as the existing Agoda integration (§23/§24): **hotel-matching comes first** — match Ratehawk's inventory against the OLTRA `hotels` Directus collection (~850 hotels) before building search/booking-link UI. No app code references Ratehawk yet; this section covers only the data-matching groundwork.

### Credentials & API access

* `hotels-beta/.env.local`: `RATEHAWK_KEY`, `RATEHAWK_KEY_ID`, `RATEHAWK_API_URL=https://api.ratehawk.com`.
* **Auth**: HTTP Basic — `key_id` as username, `key` as password (`curl --user '<KEY_ID>:<KEY>'`).
* **Host**: `https://api.ratehawk.com` is the current production host as of a 2026-07-14 partner email (moved from the legacy `https://api.worldota.net`, which still works identically — same paths, same credentials, just the old domain). Both hosts authenticate successfully with our key; `api.ratehawk.com` is the one to standardize on going forward.
* **Important caveat — this is a "Sandbox Key" per ETG's onboarding email, but it authenticates against the live production host, not an isolated sandbox subdomain.** (A dedicated `api-sandbox.worldota.net` host exists per ETG's public docs, but our specific key returns `401 incorrect_credentials` there — it's simply not provisioned for that tier.) ETG's own email explicitly warns: test *bookings* are treated as real orders and must be manually cancelled. Read-only content endpoints (used so far) carry no such risk.
* Confirmed working test call: `POST /api/b2b/v3/hotel/info/` with body `{"hid": 8473727, "language": "en"}` → returns ETG's fixture "Test Hotel (Do Not Book) test" in Tegucigalpa, Honduras. Use `hid` (integer), not `id` (string slug) — the numeric id from the onboarding email is a `hid`.
* **Content API v1** (`/api/content/v1/hotel_ids_by_filter/`, `/api/content/v1/hotel_content_by_ids/` — filter-by-country/region, avoids downloading the full global dump) is **not enabled** for this key (`403 endpoint_not_found`, `is_active: false`). Would need to be requested from ETG support (`apisupport@ratehawk.com`) if we want it later — it's the documented alternative to the full dump approach.
* Docs at `docs.emergingtravel.com` block direct fetch (403, same bot-protection pattern as other sites noted in §25) — use web search against the docs domain to extract specifics instead; a Wayback Machine fallback (used successfully for other blocked sites in §25) did **not** work here, this tool's WebFetch refuses `web.archive.org` outright.

### Data pipeline built this session (all in `hotels-beta/scripts/ratehawk/`)

Since Content API v1 isn't available, the working approach is ETG's **full hotel dump** endpoint:

1. `POST /api/b2b/v3/hotel/info/dump/` with `{"inventory": "all", "language": "en"}` → returns a signed S3 URL (`partner_feed__en_v3.jsonl.zst`, ~1hr expiry) + `last_update` timestamp. This is ETG's **entire global partner inventory**, not scoped to us — confirmed size **2,797,718,014 bytes (~2.8GB) compressed**, reportedly 20GB+ decompressed. Updated weekly by ETG; there's also a documented incremental/daily-diff dump endpoint (`retrieve-hotel-incremental-dump`) not yet used.
2. Downloaded to `scripts/ratehawk/partner_feed__en_v3.jsonl.zst` (gitignored — see below). Format: newline-delimited JSON, Zstandard-compressed. **Node 24's built-in `zlib` module has native Zstandard streaming support** (`createZstdDecompress`) — no new npm dependency needed, consistent with this project's scripts convention.
3. `filter-dump-by-country.mjs` streams the file end-to-end (never holding the full decompressed feed in memory or on disk) and keeps only records whose `region.country_code` maps to one of the OLTRA `hotels` collection's countries, writing a slim record (`hid`, `id`, `name`, `country`, `country_code`, `city`, `region_id`, `latitude`, `longitude`, `star_rating`, `kind`, `address`) per line to `scripts/ratehawk/output/filtered-hotels.jsonl`.
4. `country-map.mjs` — hand-built ISO 3166-1 alpha-2 → OLTRA-country-string lookup table, one entry per country in `oltra-countries.json` (the distinct-country snapshot pulled from Directus, kept in sync with the DB — see cleanup below). This is the join key between Ratehawk's `region.country_code` and our `hotels.country` field.
5. **Full run result**: of 3,166,880 total hotels in the global dump, **2,944,537 matched** one of our then-87 countries, plus a **3,629-hotel Nepal append** (targeted single-country scan, not a full re-filter) after the DB fix below added Nepal as an 88th country — **final total: 2,948,166 hotels** in `scripts/ratehawk/output/filtered-hotels.jsonl`.

`.gitignore` additions: `scripts/ratehawk/*.zst`, `scripts/ratehawk/*.jsonl`, `scripts/ratehawk/output/` — the raw dump and filtered output never get committed (multi-GB, regenerable, and the raw dump is ETG's proprietary global inventory, not ours to publish).

### Country-mapping audit (prompted by a valid user concern about silent mismatches)

Before trusting the country-level filter, cross-checked every one of the 87 target countries against the actual dump for zero-match cases (a real risk: a country whose Ratehawk `country_code` isn't in `country-map.mjs` would be silently dropped with no error). Findings:

* **Hong Kong** — turned out to be a non-issue: Ratehawk itself files Hong Kong hotels under `country_code: "CN"` (with `region.name: "Hong Kong"`, `iata: "HKG"`), i.e. lumped into China — same as the OLTRA DB already does. No mismatch.
* **Macau** — Ratehawk does give Macau its own `MO` code (confirmed 80+ real records), but `country-map.mjs` already maps `MO → "China"` to match the DB's existing grouping, so these aren't dropped.
* **St. Martin** — the one OLTRA hotel here (La Samanna, Marigot) is genuinely on the French side of the island; `MF` is the correct code, no Sint Maarten/Dutch-side split issue in practice.
* **Russia** — the only country with a genuine zero-match, and it's not a mapping bug: the full dump (all 3.16M records) contains **zero** `RU`-coded hotels at all, almost certainly ETG (a European company) excluding Russian inventory for sanctions reasons. The one OLTRA hotel in Russia (Barvikha Hotel & Spa, Moscow, id 1505) simply won't have a Ratehawk match available — expected, not broken.
* **All other 85 countries** — real matches found, ranging from 413,826 (China) down to 35 (Monaco).

**Takeaway for extending `country-map.mjs` later**: if a new OLTRA country is added, verify it against the dump the same way (grep the raw stream for the expected `country_code`, or check the filtered output's per-country counts) rather than assuming a code — don't trust ISO-standard assumptions blindly, since ETG's own classification has at least one real deviation (Hong Kong under `CN` rather than a separate `HK`).

### Directus data cleanup done alongside this (2026-08-05)

Found while auditing `hotels.country` for the country-map work — all normalized to the majority spelling already in use:

| Hotel(s) | Was | Now |
|---|---|---|
| ids 1105, 1107 | `"China "` (trailing space) | `"China"` |
| id 1106 (Four Seasons HK) | `"China "` + `hotel_name` `"Four Seasons Hotel Hong Kong "` (trailing space) | `"China"` + trimmed name |
| id 1148 (Mandarin Oriental Tokyo) | `"Japan "` + trailing-space `hotel_name` | `"Japan"` + trimmed name |
| id 1149 | `"Japan "` | `"Japan"` |
| ids 2029, 2039 | `"UAE"` | `"United Arab Emirates"` (majority: 20 vs 2) |
| id 1578 | `"The Netherlands"` | `"Netherlands"` (majority: 5 vs 1) |
| id 1088 (Shinta Mani Mustang, city Jomsom — actually Mustang, **Nepal**) | `"China"` (pre-existing unrelated data error, unrelated to Ratehawk, just spotted during this audit) | `"Nepal"` |

`oltra-countries.json` and `country-map.mjs` updated to include `"Nepal"` / `NP` after the last fix; a targeted append-only pass (scan the dump for `"NP"` only, not a full re-filter) backfilled Nepal into `filtered-hotels.jsonl` without re-running the ~10-minute full stream.

### Matching algorithm (`match-ratehawk-hotels.mjs`, built 2026-08-07)

Mirrors `scripts/agoda/match-agoda-hotels.mjs` and the CONFIRMED/NEAR/UNCERTAIN tiering from `match-hotel-awards.mjs`, adapted for Ratehawk's scale:

* **Country is a hard filter** and, unlike the Agoda script, needs no fuzzy normalization — `filtered-hotels.jsonl` already carries the exact OLTRA country string (via `country-map.mjs`), so grouping is an exact-string match.
* **City is deliberately NOT a filter**, only a soft scoring bonus — Ratehawk's `city` field is actually `region.name`, which is sometimes a broader area than OLTRA's `city` (e.g. "Kruger National Park" vs "Sabi Sand Reserve") and occasionally just wrong (see Bateleur Camp below).
* **Name matching**: strip generic hospitality words (hotel/resort/spa/villa/lodge/palace/suites/residence/collection/boutique/the/a/an/and/by), Jaccard token-overlap score, plus a brand-prefix-containment bonus (smaller token set ⊂ larger, ≥2 tokens, same idea as the awards script's "near" tier) and a rare-token (≥5 chars) bonus.
* **Lat/lng haversine distance** added as a scoring signal not present in the Agoda script: ≤1km strong bonus, ≤5km smaller bonus, ≤25km tiny bonus, >100km penalty.
* **Tiers**: `CONFIRMED` (score ≥85, ≥15 clear of runner-up) / `LIKELY` (≥60, ≥8 clear) / `QUESTIONABLE` / `NO_MATCH` (best <40 or no candidate scored ≥20). Keeps top 3 candidates per OLTRA hotel.
* Run end-to-end against the full ~2.95M-row filtered dump in a few minutes (single readline stream, country-grouped candidates kept small in memory).

### Review tooling (`build-review-tool.mjs` → `output/review-tool.html`)

Self-contained offline HTML page (embeds the match results as a JS const, no server needed) for confirm/reject review at hotel scale:

* Per hotel: shows top-3 candidates with score/notes/distance; **Confirm** / **Not this** / **None of these match** (→ rejected) / **Mark unsure** buttons.
* Autosaves decisions to `localStorage` (`ratehawk_match_decisions_v1`, keyed by `oltra_id`); **Export decisions JSON** downloads them; **Import decisions** re-loads a JSON file.
* Filters: status tier, reviewed/pending, text search. Default view is "All statuses" / "All (incl. reviewed)" so a full pass can scroll continuously rather than tier-by-tier.
* **Gotcha**: hotels with zero candidates originally rendered with no action buttons at all (no way to mark "no match") — fixed by adding Confirm-no-match/Mark-unsure buttons to the empty-candidates branch too.
* **Browser-automation gotcha**: the Claude-in-Chrome extension cannot navigate to `file://` URLs. Workaround used: `python -m http.server` from `scripts/ratehawk/output/` and open `http://localhost:<port>/review-tool.html` instead.
* To bulk-inject decisions (e.g. after a re-match) without re-clicking everything: `fetch` the decisions JSON from the local server and write it into `localStorage` via the JS console/`javascript_tool`, then reload — far faster than re-driving the UI.

### Manual-lookup verification (`test-manual-matches.mjs`)

For hotels the algorithm couldn't confidently match, the user searched Ratehawk's public site by hand and supplied alternate names/addresses; this script tests those leads against `filtered-hotels.jsonl` (name+address token-overlap scoring, country-scoped) to find the real `hid`. Recovered 27 of 30 manually-supplied leads (3 were "Unpublish"/"duplicate" data-cleanup notes, not match leads).

### Key bugs and lessons from this session (read before extending)

* **Decisions-merge bug**: when bulk-writing the 27 manually-verified matches into the decisions file, the update script pulled `candidates[0]` from the *automatic* matcher's `ratehawk_match_results.json` instead of from `manual_match_test_results.json` — silently overwriting several correct manual matches with the automatic matcher's (wrong) top guess, e.g. `The Biltmore Hotel` (Miami) got replaced with "Biltmore Suites Hotel" in **Baltimore**. Caught by the Stage-1 distance QA check below, not by the matching logic itself. **Lesson: when merging match results from two different sources, double-check which source's candidate list you're actually reading — a matching `oltra_id` doesn't guarantee you grabbed the right hid.**
* **Country misclassification isn't limited to the Hong-Kong/Macau case already documented above.** Found the same pattern for St. Barthélemy: Ratehawk splits genuine island properties inconsistently between `country_code: "BL"` and `"FR"` (e.g. Rosewood Le Guanahani is FR-coded despite being on the island). Fixed via a geographic bounding-box scan (`scan-st-barth.mjs`) rather than a country-code remap, since only ~6 of the many FR-coded records were genuinely on the island — most FR hits for "st barth"-like text were unrelated mainland-France false positives. **Lesson: when a country-hard-filtered match comes back NO_MATCH for a hotel you're confident should be in the dump, check for this pattern before concluding it's absent — scan the raw dump by name/geography across *all* country codes, not just the expected one.**
* **Google Places re-geocoding is not independent verification** when the coordinate being checked was *originally sourced* the same way (per §20, OLTRA's lat/lng were populated via this same Places "Find Place from Text" method). Re-querying today can reproduce the exact same (wrong) answer Google gave originally, which looks like confirmation but isn't. Caught this for 2 of the largest distance-outliers (`Bulgari Hotel Shanghai` — Google matched an unrelated address in Qinhuangdao, ~1000km off, exactly reproducing OLTRA's stored error; `Casa Chablé` — Google matched a same-brand sibling property, "Chablé Yucatán", instead). Both resolved via plain web search for the hotel's real address instead. **Lesson: a "verification" that uses the same method/data source as the original data creation only proves consistency, not correctness — treat it as low-confidence when the two should be independent, and cross-check outliers via a genuinely different source.**
* **Directus data-entry bugs surfaced along the way** (not Ratehawk-related, just found while cross-referencing): `hotel_name` fields with junk appended (`"One&Only Kéa Island, Greece"`, `"One&Only Reethi Rah, Maldvies"` — note the misspelling) and a plain typo (`"Senses Lanai"` → should be `"Sensei Lanai"`), plus a duplicate `Caruso` (Ravello) row (ids 1426/1449, both `published: true` simultaneously) and 4 hotels genuinely in Anguilla mistagged `country: "British Virgin Islands"` (ids 1237/1238/1239/1240) — `state_province_county_island` already correctly said "Anguilla" for all 4, only `country` was wrong.

### Final results (2026-08-07)

Of 871 OLTRA hotels: **829 confirmed matches** (630 automatic CONFIRMED-tier + 91 automatic LIKELY-tier with location corroboration, bulk-accepted after spot-check + 27 from manual lookup, 4 of which needed the St. Barth/Anguilla fixes above to even find a candidate), **31 marked unsure**, **11 confirmed no-match** (genuinely absent from Ratehawk's inventory — includes Russia per the sanctions exclusion above, and several ultra-exclusive independent brands like Cheval Blanc and Eden Rock St-Barths that don't appear anywhere in the 3.16M-row dump under any country code).

**Pre-write-back QA** (`build-writeback-review.mjs` → `output/writeback_review.csv`) cross-checked all 829 confirmed matches on three axes before touching Directus:

1. **Distance** (haversine, OLTRA vs Ratehawk lat/lng): 322 of 829 >50m apart, but 285 of those are <1km (GPS-pin precision, not investigated further). Of the 37 >1km outliers, independently verified via Google Places (`verify-distance-outliers.mjs`) + web search for the worst two — **9 confirmed as OLTRA coordinate errors**, fixed in Directus (see table search-worthy hotel names: Bulgari Hotel Shanghai, Casa Chablé, Excellence Oyster Bay, Four Seasons Hotel Boston, Nihi Sumba, Royal Malewane, Ritz-Carlton Ras Al Khaimah, Ritz-Carlton Shanghai, Upper House Chengdu). The other 28 outliers left as-is (see the Google-Places-circularity lesson above for why those verdicts are lower-confidence, not wrong).
2. **Name**: 221 of 829 differ after normalization. Cross-checked each OLTRA `description` (sourced from official hotel websites) for which name it actually validates — **216 of 221 (98%) validated OLTRA's existing name** (Ratehawk's "difference" is almost always just a distribution-channel suffix like "- The Leading Hotels of the World" or "By Hyatt"). Only 3 pointed the other way, and all 3 turned out to be the Directus typos/junk listed above — fixed, no bulk renaming needed.
3. **City**: 288 of 829 differ. 15 had a blank OLTRA `city` (14 backfilled from Ratehawk — 1 skipped, Ratehawk's value was garbled hotel-name text, not a real place). The other 273 (both sides non-blank) showed **no consistent direction** — sometimes OLTRA is more precise (ski-resort sub-villages, named reserves), sometimes Ratehawk is (the actual town vs. a broader named area) — left untouched as a blanket update would make roughly half of them worse, not better.

**Directus schema change**: added `ratehawk_hid` (integer, nullable) to the `hotels` collection, same pattern as `agoda_hotel_id`. Backfilled for all 829 confirmed matches, 0 failures.

**Files** (all in `hotels-beta/scripts/ratehawk/`): `export-oltra-hotels.mjs` (fresh OLTRA snapshot incl. `affiliation`/lat/lng), `match-ratehawk-hotels.mjs`, `build-review-tool.mjs`, `test-manual-matches.mjs`, `scan-st-barth.mjs`, `append-country-to-filtered.mjs` (generic targeted-country backfill, used for both Nepal and Anguilla), `fix-anguilla-country.mjs`, `build-writeback-review.mjs`, `verify-distance-outliers.mjs`, `export-non-confirmed-csv.mjs`, `apply-ratehawk-hid.mjs` (the only script here that writes `ratehawk_hid` — everything else is review/report-only). `.env.local` also now has `GOOGLE_MAPS_API_KEY` (re-added 2026-08-07; was present as of §20's 2026-07-07 note but had since been removed).

---

## 27. NEXT PHASES — RATEHAWK IMAGES & BOOKING INTEGRATION (not started, planned 2026-08-07)

With hotel-matching done and `ratehawk_hid` populated for 829 hotels, the two next pieces of work:

### 1. Hotel images from Ratehawk

Not yet scoped. The slim records in `filtered-hotels.jsonl` (from the full dump) don't include image URLs — that field wasn't captured by `filter-dump-by-country.mjs`'s slim-record projection (see the field list in the pipeline section above). Before starting:

* Check whether the full dump's raw JSONL rows (pre-slimming) actually contain an images field — if so, a targeted re-scan keyed by our 829 known `hid`s (same streaming pattern as `append-country-to-filtered.mjs`) can pull them without re-downloading.
* If the dump doesn't carry images, the per-hotel `POST /api/b2b/v3/hotel/info/` endpoint (already confirmed working, see credentials section) is the fallback — 829 individual calls, so check for rate limits.
* Existing precedent to follow: `scripts/agoda/backfill-agoda-lite-images.mjs` for how Agoda photos were pulled into `agoda_photo1`–`agoda_photo5`; decide whether Ratehawk images get parallel `ratehawk_photo*` fields or a different storage shape (array field, like the taxonomy tags?).

### 2. Room selection, availability check, and booking integration

Mirrors the existing Duffel flights integration architecture (§7B) in spirit — search/offer/book — but for hotel rooms:

* Ratehawk/ETG's booking API endpoints haven't been explored yet this session (only the content/dump endpoints used for matching). Will need: availability search (dates + `hid` → room/rate options), rate/room selection, and a booking-confirmation flow.
* **Careful**: per the credentials section above, this key is a "Sandbox Key" that hits the *live production* host — ETG's onboarding email explicitly warns that test bookings are treated as real orders and must be manually cancelled. Read-only search/availability calls are presumably safe; anything that creates a booking needs explicit care and probably a confirmation step before ever calling it, even in testing.
* UI shape: likely a new `/hotels/[id]/book` flow or a booking panel on the existing hotel detail view, following the `FlightsView`/`PriceCard` pattern of showing options with a clear book action — but hotel booking has a different shape (room types, occupancy, cancellation policy) than flight offers, so don't force-fit the flights component structure.

Before resuming either: re-verify `RATEHAWK_KEY`/`RATEHAWK_KEY_ID` are still valid (§26 credentials section) and check whether ETG's weekly dump refresh means `filtered-hotels.jsonl` should be re-pulled if picking this up much later.

---

## 28. RATEHAWK HOTEL IMAGES — BACKFILL COMPLETE (2026-08-08)

### What was done

Completed phase 1 of §27 ("Hotel images from Ratehawk") for the 829 hotels confirmed matched in §26. **Data-only phase, same precedent as `ratehawk_hid`**: no app code, no `HotelRecord` TypeScript changes, no gallery UI — those come later, once a consumer is actually built.

### Schema: 100 flat fields, not a JSON blob

Added `ratehawk_image_1` … `ratehawk_image_50` (Directus `string`, the image URL) and `ratehawk_image_1_category` … `ratehawk_image_50_category` (Directus `string`, the `category_slug`, e.g. `exterior`, `guest_rooms`, `pool`) to the `hotels` collection. **Deliberately not a `json`-type array field** (that was the first draft of this plan) — flat numbered fields stay editable/browsable in the Directus admin UI, where a JSON blob would be opaque. **Deliberately not capped at a smaller number either** — the true per-hotel max is 50, and since these are just URL strings there's no real cost to keeping all of them; capping would silently drop real editorial value (a pool/spa shot sorted late in Ratehawk's list). No category-priority curation or truncation logic — every image Ratehawk returns for a hotel gets a slot, in Ratehawk's own native order.

Script: `hotels-beta/scripts/ratehawk/add-ratehawk-image-fields.mjs` (idempotent, 409-safe re-run, same `createField` pattern as `scripts/restaurants/create-restaurants-collection.mjs`).

### Data source and pipeline

The full dump already on disk (`scripts/ratehawk/partner_feed__en_v3.jsonl.zst`, §26) carries hotel images in `images_ext: [{url, category_slug}]` (the plain `images: [String]` field is deprecated per ETG's own docs and always identical in content/order — confirmed 0 mismatches across all 829 hotels this session, so only `images_ext` is used).

1. `scripts/ratehawk/extract-images-for-matched.mjs` — targeted re-scan of the dump (no re-download) keyed by the 829 confirmed `hid`s from `ratehawk_match_decisions.json`. Direct hid→oltra_id join per line (not index-based) — found 829/829, written to `scripts/ratehawk/output/matched-hotel-images.jsonl`.
2. `scripts/ratehawk/apply-ratehawk-images.mjs` — walks each hotel's `images_ext` in Ratehawk's native order, maps `images_ext[0]` → `ratehawk_image_1`/`_1_category`, `images_ext[1]` → `_2`/`_2_category`, etc. Dry-run by default, `--confirm` to write, `--only <id>`/`--limit N` for scoped runs.

**Result: 811/829 updated (≥1 image), 18 skipped (confirmed match, zero images available from Ratehawk), 0 failures.** Verified `ratehawk_image_1 IS NOT NULL` count in Directus = 811, matching exactly. Per-hotel image counts range up to the full 50 (e.g. id 1602, Four Seasons Dubai at Jumeirah Beach). Spot-checked one hotel (id 1602) against a **live** `POST /api/b2b/v3/hotel/info/` call for its `hid` — slots 1, 2, and 50 matched byte-for-byte (URL + category) against what was stored, confirming no drift between the dump snapshot and live data and no join/index errors in the pipeline.

### `{size}` URL template — documented values

Every image URL has an unresolved `{size}` placeholder (stored as-is — not pre-resolved, so one stored URL serves both a thumbnail grid and a full-size lightbox depending on what a future consumer substitutes). Confirmed via ETG's official docs (`docs.emergingtravel.com/docs/b2b-api/static-content/retrieve-hotel-content/` — like other ETG pages per §25/§26, blocked for plain `WebFetch`/`curl` with a default UA; fetched successfully with `curl -A "Mozilla/5.0 ..."`, a browser User-Agent) — the CDN accepts a **fixed whitelist**, not arbitrary `WxH`:

* Square crop: `40x40`, `80x80`, `100x100`, `120x120`, `154x105`, `240x240`, `241x241`, `900x900`
* Fit-by-height: `x220`, `x500`, `x768`, `x1080`, `x1920`, `768x1024`, `1080x1920`
* Fit-by-width: `326x220`, `1920x`, `1080x`
* Full fit: `1024x768`, `1920x1080`

(An arbitrary `640x400` also returned 200 in ad-hoc testing — the CDN is lenient beyond the documented list — but stick to documented tokens for anything production-facing.)

### Room images — deferred, and a real gotcha for whoever builds booking next

**Do not backfill room images the same way — they don't belong in this phase.** Each `room_groups[]` entry in the static-content dump does carry its own `images`/`images_ext` (same `{size}`-template shape), but the field that would link a room group to search/booking results, **`room_group_id`, is explicitly marked `deprecated`** in ETG's current docs (both the static-content page and `b2b-api/hotel-search/retrieve-hotelpage/`). The documented, non-deprecated linkage is **`rg_ext`** — a room-characteristics object (`class`, `quality`, `bathroom`, `bedding`, `family`, `capacity`, `club`, `bedrooms`, `balcony`, `floor`, `view`) present on both the static content's `room_groups[]` and the live hotelpage rate objects. ETG's own docs say directly: *"rg_ext — Use this field to get extra data on the room from the hotel static data. For example, room images, descriptions."*

**Implication for §27 phase 2 (booking integration)**: match a live search/hotelpage rate's `rg_ext` against the static content's `room_groups[].rg_ext` at request time to find that room's images — don't key anything off `room_group_id`. Since room offers are inherently live/per-search (not a fixed list), pre-storing room images in Directus now would either duplicate this matching logic later or go stale before booking is built — so it wasn't done.

### Files (`hotels-beta/scripts/ratehawk/`)

`add-ratehawk-image-fields.mjs` (schema, one-shot/idempotent), `extract-images-for-matched.mjs` (dump re-scan → `output/matched-hotel-images.jsonl`), `apply-ratehawk-images.mjs` (the only script here that writes `ratehawk_image_*` — dry-run by default).

---

## 29. RATEHAWK IMAGES — DISPLAYED IN THE APP (2026-08-08)

### What was done

Wired the §28 backfill into the UI. Ratehawk images now take priority everywhere; Agoda is only a fallback for hotels with no Ratehawk images.

### Priority logic centralized in `cardHelpers.ts`

`getRawHotelImages(hotel)` (private) is the single source of truth: returns Ratehawk (as one `{url, category}` entry — see lazy-load below) if `hotel.ratehawk_image_1` is set, else the up-to-5 Agoda photos (`category: null`), else `[]`. Built on top of it:
* `hasHotelPhotos(hotel)` — replaces `hasAgodaPhotos()` at every *display-gating* call site in `HotelsView.tsx` (map popup, featured-mode pool eligibility, results-row, detail-panel layout, the three member add-to-trip/add-to-favorites thumbnail picks) and in `HotelSmallCard.tsx`. `hasAgodaPhotos()` itself is untouched/still exported (still meaningful as "does this hotel have Agoda data").
* `getHotelThumbnail(hotel)` — single nullable URL, no placeholder fallback (used by Inspire).
* `getHotelImageSet(hotel)` — unchanged signature (`string[]`, placeholder-fallback), reimplemented on top of the same raw list. Every pre-existing call site that only ever read `[0]` needed no changes at all.
* `resolveRatehawkUrl(url, size)` / `RATEHAWK_THUMB_SIZE` ("240x240") / `RATEHAWK_FULL_SIZE` ("1024x768") — the `{size}` template resolver and the two size tiers actually used (see §28 for the full documented token whitelist). Only two tiers are used app-wide: thumbnails at 240x240, everything else (hero/card/popup/lightbox/main panel image) at 1024x768 — no per-call-site size parameter, keeps the API surface small.

### Bulk fetch vs. lazy full gallery

The Hotels page fetches all ~870 published hotels in one request (`limit: -1`) for list/map/featured-pool/detail-panel alike. Adding all 100 `ratehawk_image_*` fields to that fetch measured at **~4.5MB** of extra JSON per page load — rejected. Instead:
* `HotelRecord` (`src/lib/directus.ts`) and the three bulk `fields` lists (`src/app/hotels/page.tsx`, `src/app/page.tsx`, `src/lib/inspire/buildInspireCities.ts`) only gained **`ratehawk_image_1` + `ratehawk_image_1_category`** — enough for the hero image everywhere except the selected-hotel gallery.
* New route `src/app/api/hotels/[id]/ratehawk-images/route.ts` (GET) fetches one hotel's full `ratehawk_image_1..50`/`_category` set on demand (local 100-field type, not added to the shared `HotelRecord`) and returns `{ok, images: [{url, category}]}`, URLs still unresolved.
* `HotelsView.tsx`: a `useEffect` keyed on `selectedHotel?.id` fires this fetch **only when `selectedHotel.ratehawk_image_1` is set** (zero extra calls for Agoda-only/photo-less hotels — confirmed via the browser network tab during testing). While pending, `selectedHotelGalleryRaw` falls back to the single hero entry already available from the bulk fetch, so the main image renders with no loading flash; `selectedHotelGallery` (full-size) and `selectedHotelThumbGallery` (thumb-size) both derive from that one raw array via `resolveRatehawkUrl`.

### Thumbnail strip and category badge

The selected-hotel detail panel's thumbnail grid (`grid-cols-2`, ~8 visible) kept its exact thumbnail sizing. **Updated 2026-08-08**: the initial version added flat ▲/▼ scroll-arrow buttons above/below the grid, but the user asked for these to be removed in favor of the native scrollbar, and for the panel to be a fixed `h-[340px]` matching the large image's height exactly (was `max-h-[340px]`, which left a gap for hotels with few images). **Caught a real CSS Grid gotcha making that change**: switching to a definite `height` (from `max-height`) caused all thumbnail rows to compress to fit instead of scrolling — a known issue where `grid-auto-rows: auto` rows can shrink under a fixed-height scroll container. Fixed by adding `auto-rows-min` (forces rows to their natural min-content size regardless of container height). Thumbnails still use `loading="lazy"` (up to 50 now, vs. Agoda's 5).

A small pill badge (`.oltra-status-badge` — existing CSS, previously unused anywhere in the app — combined with a dark glass background) shows the current image's category bottom-right, on both the detail-panel hero and the lightbox. Hidden when `category` is `null` (always true for Agoda) or the literal string `"unspecified"` (~17% of Ratehawk images, per §28's session data — not useful to show). Label formatting: `guest_rooms` → "Guest Rooms" (`formatImageCategory()` in `HotelsView.tsx`).

### `next.config.ts` — a real bug caught during browser testing

`next/image` throws (and freezes the tab) on any hostname not in `images.remotePatterns`. Agoda's `*.agoda.net` was already allowlisted; **`cdn.worldota.net` (Ratehawk's image CDN) was missing** — added alongside it. Required a dev-server restart to take effect (Next.js reads `next.config.ts` once at startup, not hot-reloaded).

### Explicitly out of scope

* `src/app/hotels/[hotelid]/page.tsx` — untouched. Per §15 it's not part of the intended UX flow, and it already runs on a wholly separate Agoda-CSV-based image system (`getAgodaPhotos`), not `cardHelpers`/Directus fields.
* No `SavedTripsView.tsx`/`FavoriteHotelsView.tsx` code changes — both only ever render a flat `thumbnail` string persisted to Supabase at add-time, sourced from the `hasHotelPhotos(selectedHotel) ? selectedHotelImages[0] : null` calls in `HotelsView.tsx`. Once those prefer Ratehawk, new saves automatically do too. **Already-saved trips/favorites keep their old Agoda thumbnail — not retroactively backfilled.**
* No Inspire category badge — the hover popup is a small, no-interaction card; only the thumbnail source changed there (`buildInspireCities.ts` now imports `normalizeAgodaImage`/`resolveRatehawkUrl` from `cardHelpers.ts` instead of a locally-duplicated copy, and prefers `ratehawk_image_1` at thumb size).
* Room images: still not displayed anywhere — see §28's `rg_ext`-not-`room_group_id` note for the booking-integration phase.

---

## 30. RATEHAWK AVAILABILITY, PRICING & ROOM SELECTION (2026-08-08)

### What was done

Ratehawk now handles all availability/pricing/room-selection on the Hotels page — **Agoda's price-fetch and booking are fully disabled there** (Agoda is untouched everywhere else — the homepage teaser cards in `LandingSummary.tsx` still use it; `/hotels/[hotelid]` is still the separate Agoda-CSV system per §15/§29). This is data-and-selection only — **no real booking/payment call is made anywhere**, matching the sandbox-key-hits-production caution in §26. Booking integration is a distinct next phase.

### API split: SERP (headline) vs. hotelpage (room list)

Two ETG endpoints, mirroring how Agoda had a batch check (list-row price) and a single check (selected-hotel detail):
* `POST /api/b2b/v3/search/serp/hotels/` — batch, one call for all visible results' `ratehawk_hid`s, returns a headline price per hotel. ETG's own docs say not to let users pick rates from this response directly.
* `POST /api/b2b/v3/search/hp/` — detail, one call for the selected hotel only, returns the full list of selectable room rates. ETG's "Recommended Flow" call.
* Both take `guests: [{adults, children}]` — **one array entry per room**, built by `buildGuestsArray()` in `src/lib/ratehawk/availability.ts`, which evenly splits the search form's `adults`/`kids`/bedroom count across that many room slots.
* Auth is HTTP Basic (`key_id:key`), unlike Agoda's custom header.
* `residency` (passport country) is a real, user-changeable search-form field
  as of 2026-08-10 (§32) — an `OltraSelect` on the Hotels results-mode search
  form, backed by `RESIDENCY_COUNTRIES` in
  `src/lib/countries.ts` (full ISO 3166-1 alpha-2 list). Defaults to a
  best-effort guess from the browser locale (`guessResidencyFromLocale()`,
  client-only to avoid an SSR/hydration mismatch — see the effect in
  `HotelsView.tsx`), but that default is not the only path: it's a real `name="residency"`
  form field like `from`/`to`/`bedrooms`, round-trips through the `residency`
  URL param, and is required (400 if missing/invalid) on both
  `/api/ratehawk/availability` and `/api/ratehawk/availability/batch`. One
  residency per search, applied to all guests, passed to both `search/hp/`
  and `search/serp/hotels/`. Previously hardcoded to `"gb"` — that was flagged
  as failing ETG certification ("hardcoding a default counts as not
  implementing it") and has been replaced, not just documented as a gap.
  **UI de-emphasized 2026-08-11 (§33)** — no longer its own full-width row
  labeled "Passport country" next to Bedrooms (user feedback: reads like a
  booking prerequisite, unlike any mainstream OTA). Now a small "Pricing for"
  inline control. The underlying field/data behavior above is unchanged —
  still auto-detected, still sent on every request, still overridable.
* Added `ratehawk_hid?: number | null` to `HotelRecord` (`src/lib/directus.ts`) and `hotels/page.tsx`'s field list — this hid already existed in Directus per §26 but, like `ratehawk_image_1` before §29, had never been wired into the TS layer.

### Headline price formula

Cheapest available room whose `rg_ext.capacity` covers `ceil(totalGuests / bedroomsRequested)`, × `bedroomsRequested` — "book N copies of the cheapest room that fits." Not a true mixed-room-type bin-pack; a documented simplification (`computeHeadlinePrice()` in `availability.ts`). The room-selection UI lets the user override it room-by-room afterward. The API itself returns a **flat list of individual room rates**, confirmed via live testing — it does not pre-combine a multi-room booking, so this app does the aggregation.

### Room images: a real deviation from ETG's own docs

§28 flagged that room images would need `rg_ext` matching (ETG's documented approach) once this phase arrived. **Tested against live data — it doesn't work**: `rg_ext` values differ slightly between the `search/hp/` rate objects and the `hotel/info/` static-content `room_groups[]`, so exact-equality matching found 0/5 correct matches on a real hotel. **What actually works: matching by `room_name` containment** (`rate.room_name.includes(roomGroup.name)`, longest match wins) — 5/5 correct matches, each pulling real images. This is `matchRoomImages()` in `availability.ts`. `/api/ratehawk/availability` calls `search/hp/` (rates) and `hotel/info/` (room images) in parallel for every request — not cached separately, so dates-only changes re-fetch images unnecessarily; acceptable simplicity for this phase, not optimized.

Room `size` (m²) exists in ETG's schema but is feature-gated — their docs say it needs a supplementary account-manager agreement; confirmed `null` in a live response for this account. `sizeSquareMeters` is always `null` today; the room card/popup render it conditionally so it'll pick up automatically if the feature is ever enabled.

### `HotelsView.tsx` — what changed

* All Agoda availability/booking state, effects, and JSX removed: `agodaAvailability`, `agodaResultAvailability(Status)`, `handleCheckAgodaAvailability`, `selectedAgodaHotelId`, `getAgodaHotelIdForHotel`, `selectedHotelBatchAvailability`/`HasBatchAvailability`/`AgodaResult`/`AgodaUnavailable`/`CanCheckAgoda`, the "CHECK AGODA AVAILABILITY"/"BOOK WITH AGODA" JSX, and the Agoda price pill/error block. `src/app/api/agoda/*` and `src/lib/agoda/*` are untouched (still used by `LandingSummary.tsx`).
* `agodaSearchDirty` renamed to `availabilitySearchDirty` throughout (mechanical) — the "search inputs changed, refetch" concept is provider-agnostic, just happened to be named after Agoda.
* New Ratehawk batch effect (results-row headline price) and a new **auto-fetching** detail effect (no manual button — rooms should just be displayed) keyed on `selectedHotel?.id, fromValue, toValue, guestSelection, bedroomsValue`. Pre-selects the headline combo (`roomSelection` state) whenever the room list reloads.
* New "Rooms" section inserted between Description and the action-buttons row: one card per grouped room (thumbnail via `resolveRatehawkUrl(..., RATEHAWK_THUMB_SIZE)`, capacity, balcony, bed/layout line, price, a 0..N quantity stepper, an "(i)"-equivalent "More details" link). A running total (`roomSelectionTotal`) replaces the old Agoda price pill in the action row; the hotel's own fallback `booking_URL` link (unrelated to Agoda) now shows there instead, only when nothing is selected.
* Room detail popup (mirrors the app's `createPortal`/fixed-inset lightbox pattern already used for photos, not the Flights page's separate CSS-module popup): full matched image gallery at `RATEHAWK_LARGE_SIZE`, occupancy, layout, meal, cancellation policy, amenities.
* A real bug caught during testing: `rg_ext.capacity` can be `0` (not just missing) for some rates (e.g. suites) — `?? 1` doesn't catch that (nullish coalescing only replaces `null`/`undefined`), so it rendered "Sleeps 0". Fixed with `|| 1`.

### Layout: left pane fixed, right pane scrolls independently

New `.oltra-hotels-layout`/`.oltra-hotels-right-pane` classes in `oltra-theme.css`, mirroring the existing fixed-sidebar pattern in `restaurants.css`: the outer two-pane grid gets a bounded height (`calc(100vh - top/bottom page padding)`) + `overflow: hidden`; the right `<section>` becomes the one that scrolls. The left pane's results-list `flex-1 min-h-0 overflow-y-auto` classes were already present but inert (no ancestor had a bounded height) — they now work as originally intended once the ancestor is bounded. (Featured Mode, which has no left pane, keeps its original unbounded/full-page behavior — the new classes only apply in Results/Details mode.)

### Save to Trip — `room_selection` column

**Migration applied (2026-08-08).** Ran via the Supabase Dashboard SQL Editor against the Members project (no service-role key / linked CLI available to run it directly from this session — see §31 for why "the Members project" wasn't obvious):
```sql
alter table member_trip_hotels
  add column room_selection jsonb;

comment on column member_trip_hotels.room_selection is
  'Ratehawk room picks at save time: [{room_name, quantity, price_per_stay, currency}], null if no rooms were selected.';
```
`src/lib/supabase/database.types.ts` hand-edited to add `room_selection: Json | null` (no CLI link to regenerate from). `addHotelToTripBrowser` (`src/lib/members/db.ts`) takes an optional `roomSelection` param; `SavedHotel`/`RoomSelectionEntry` types (`src/lib/members/types.ts`) and `mapSavedTrips` carry it through to the read side. `SavedTripsView.tsx` renders a `2× Deluxe Double room, 1× Executive Suite`-style summary line under the existing stay-date line when present — no card redesign.

Column confirmed present via a direct read-only PostgREST call (`.../rest/v1/member_trip_hotels?select=id,room_selection` → 200, not the `column ... does not exist` error seen before the migration). **Full end-to-end verification (Add to Trip → Saved Trips) not yet done — deferred to next session**, since it requires a real member login, which this session couldn't perform (session automation doesn't authenticate as the user, even in their own dev environment).

### Explicitly out of scope

* Any real booking/prebook/payment call — `book_hash` is fetched and stored on each grouped room but never sent anywhere. Next phase.
* `LandingSummary.tsx` (homepage teaser) and `/hotels/[hotelid]` — untouched, same reasoning as §29.
* Optimizing the redundant `hotel/info` call on every rate refetch.

---

---

## 31. `.env.local` HAD THE WRONG SUPABASE PROJECT — FIXED (2026-08-08)

### The bug

Per §2, OLTRA uses **two separate Supabase accounts/projects**: one is the "Hotel database" (canonical hotel/restaurant store, sat under Directus — the app never talks to it directly, only via Directus's own REST API), the other is a separate project for **auth + member data only** (`member_trips`, `member_trip_hotels`, `member_favorite_hotels`, etc.).

This session's `hotels-beta/.env.local` had `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` set to the **Hotel database** project (ref `slejwbswlzgoeogpxixc`) instead of the Members project. Confirmed by a direct read-only PostgREST call: `.../rest/v1/member_trip_hotels` on that ref returned `PGRST205 Could not find the table 'public.member_trip_hotels'... Perhaps you meant the table 'public.hotels'` — i.e. that project genuinely only has hotel-content tables, not the members schema.

**Practical effect while broken**: every member-auth-dependent feature (login, Add to Trip, Favorites, Personal Information, the header's login greeting) was pointed at a Supabase project with no members schema at all — these would have failed outright in this local checkout, unrelated to any application code bug.

### Why this was easy to miss

* There is exactly **one** Supabase client code path in the app (`src/lib/supabase/client.ts`, `server.ts`, `middleware.ts`), all reading the same two `NEXT_PUBLIC_SUPABASE_*` variable names — there's no naming distinction in code between "the hotel one" and "the members one," so a value mix-up during `.env.local` setup produces no error until something tries to query a members table.
* Supabase renamed the anon key to **"Publishable key"** in their dashboard UI (same purpose, same place in Project Settings → API) — worth knowing so a future session doesn't go looking for a field literally labeled "anon key" and conclude it's missing.

### The fix

Corrected `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local` to the Members project (ref `hrlvtzcapsqkgrcawluf`). Verified via the same PostgREST probe — `member_trip_hotels` now resolves (200, empty result set — RLS-gated, expected with the publishable key and no session). Dev server needed a restart to pick up the change (same as any `.env.local`/`next.config.ts` edit — not hot-reloaded).

**For any future fresh checkout**: don't assume "the Supabase URL/key" in a shared `.env.local` template is correct without checking — ask the user directly which of their two projects it should be (per the general fresh-checkout credential guidance in §25), or verify with the same read-only `member_trip_hotels` probe before trusting it.

---

## 32. RATEHAWK / ETG INTEGRATION

### Model
Affiliate API, contract AFF-392026. ZenHotels = consumer brand, RateHawk =
partner API layer, same inventory. Use Affiliate API documentation only — never
B2B/wholesale endpoints, `deposit` payment type, net pricing, or fake-gross
commission. myOLTRA is never merchant of record.

Agreed architecture: myOLTRA owns discovery (search, hotel pages, rate display).
ZenHotels owns checkout at `hotels.myoltra.com` via CNAME and is merchant of record.

### BLOCKED — do not build
The handoff mechanism to the ZenHotels checkout is not documented and is pending
written confirmation from ETG (asked 10 Aug 2026). Until it arrives, do not write:
- Create booking process, Start booking process, Check booking process
- Create credit card token, `pay_uuid`/`init_uuid`/`return_path`, 3DS handling
- Booking status webhooks or booking-status state machines
- Retrieve bookings, Cancel booking

Unknown until answered: at what point we redirect, what we pass across (prebook
hash, rate identifiers, guest/search params), and whether any booking endpoint
stays on our side.

Everything below is confirmed by ETG documentation and safe to build now.

### Hosts and credentials
Base URL must remain a single config value, never hardcoded per call. **Verified
against live code (`hotels-beta/src/lib/ratehawk/availability.ts`):** already
follows this — `RATEHAWK_API_URL` is read from env with a fallback to
`https://api.ratehawk.com`, matching ETG's stated production host below. No
change needed.

Host configuration was established during live API testing — treat the working
values already in the codebase and existing §26 as authoritative. Do not
change them based on documentation alone. For reference, ETG's stated production
host is `api.ratehawk.com` (migrated from `api.worldota.net`, same auth and payload
format); if what's in the code differs, the code wins and the discrepancy should be
noted rather than "corrected."

Sandbox key: RateHawk Backoffice → Settings → API tab. One key covers search,
booking and content — no separate content key exists. **Note the nuance vs. §26**:
this key returned `403 endpoint_not_found` / `is_active: false` on the Content
API v1 endpoints (`hotel_ids_by_filter`, `hotel_content_by_ids`) — that's an
account/contract enablement gap, not evidence of a separate "content key" the
account is missing. The full-dump endpoint (`hotel/info/dump`) and single-hotel
`hotel/info` both work fine on this same key. Worth re-testing Content API v1
once/if ETG confirms the contract covers it.

Never mix keys, IDs or static content across environments.

**Sandbox and test bookings are treated as real orders.** Do not execute any
booking call without explicit confirmation from Ulrik in-session.

### Flow (our scope)
Search by hotel IDs / region / geo → Retrieve hotelpage → Prebook from hotelpage
step → [handoff to ZenHotels checkout — mechanism TBC]

Hash chain: `h-…` from Retrieve hotelpage → passed to Prebook → returns `p-…`.
Prebook is part of the search step and must be excluded from the booking flow.

**Implementation gap, not a contradiction**: the current code (§30) never calls a
separate Prebook endpoint — `book_hash` is read directly off each `search/hp/`
rate and stored unused (per §30's "Explicitly out of scope"). Adding the actual
Prebook call (`h-…` → `p-…`) is new scope from this section, still pending the
BLOCKED handoff question above before it's worth building.

### Static content
- Retrieve hotel dump weekly; Retrieve hotel incremental dump daily.
- Content API is for scheduled offline sync into Supabase/Directus **only** —
  never called during a live user search. Explicitly checked at certification.
- Use `updated_since` on Retrieve hotel IDs by filter for incremental updates.
- Region IDs from the regions' dump or hotel dump.

### Display rules (all certification-checked)
- Pricing is **gross** — `amount` / `show_amount` already include ETG's
  commission. Never add markup. Commission is calculated on ETG's side.
  **Verified consistent**: `ratePrice()` in `availability.ts` reads
  `show_amount`/`show_currency_code` directly, adds nothing on top.
- Non-included taxes (`included_by_supplier: false`) shown separately, never
  folded into the displayed price. **Resolved 2026-08-10.** `tax_data.taxes`
  turned out to live on the rate's primary payment type
  (`payment_options.payment_types[0].tax_data.taxes`), not on the rate
  itself — confirmed 2026-08-10 via a one-off read-only diagnostic script
  (`scripts/ratehawk/diagnose-tax-cancellation.mjs`, deleted after use — no
  longer needed once the fix landed). Each
  room row shows a "+ taxes at hotel" note when a non-included tax exists;
  the "More details" popup lists included taxes (informational — already in
  the shown price, not re-added) separately from not-included ones (shown in
  their own currency, e.g. a Dubai city tax quoted in AED alongside a
  USD-displayed room price — never converted into the headline price).
  `groupRoomOptions()`/`rateTaxes()` in `availability.ts`.
- `residency` (passport country) collected on the **first** search step and sent
  on all `/search/serp/*/` and `/search/hp/` requests. Hardcoding a default counts
  as not implementing it. **Resolved 2026-08-10** (was flagged as a
  contradiction against §30's earlier hardcoded `"gb"`). Replaced with a real
  "Passport country" selector on the Hotels search form — see §30 for the
  implementation. Not just a certification fix: residency-based price
  adjustments are real in Gulf/Russian/some Asian markets, so the hardcode was
  a correctness bug, not only a documentation gap.

- Cancellation policies parsed from `cancellation_penalties.policies` and shown
  unmodified in either direction. API returns UTC+0 — decide and document whether
  the UI shows UTC+0 or converts to local. `free_cancellation_before: null` means
  no free cancellation. **Resolved 2026-08-10.** Two real bugs found and fixed
  along the way, both caught only by testing in the actual browser (not by
  `tsc`/lint, which stayed clean throughout):
  1. `cancellation_penalties` was being read straight off the rate
     (`rate.cancellation_penalties`) — that path doesn't exist. Like
     `tax_data`, it lives on the primary payment type
     (`payment_options.payment_types[0].cancellation_penalties`). This means
     `freeCancellationBefore` had silently read as `undefined` on every
     single rate before this fix — the room popup always said
     "Non-refundable" regardless of the real policy.
  2. `Intl`'s `toLocaleString` throws a `RangeError` ("Invalid option :
     option") if `dateStyle`/`timeStyle` are combined with `timeZoneName` in
     the same options object — not a silent no-op, a hard crash on opening
     the room detail popup. Fixed by spelling out the date/time parts
     individually (`year`/`month`/`day`/`hour`/`minute`) alongside
     `timeZoneName: "short"` instead.

  `formatRatehawkUtcDateTime()` in `HotelsView.tsx` converts ETG's raw
  no-offset UTC timestamps (`new Date()` on a bare "2026-09-22T11:00:00"
  string parses as **local** time per the JS spec — a "Z" is appended first)
  to the browser's local time with an explicit `GMT±N` label. The room
  detail popup renders the full `policies` schedule unmodified — every
  window and its charge amount (`0` = "no charge", not silently omitted),
  not just a single collapsed before/after date.
  `rateCancellationPolicies()` in `availability.ts`.
- Parse and display **both** `metapolicy_struct` and `metapolicy_extra_info`.
  Neither is read anywhere in the current code — implementation gap.
- Room static data matched on `rg_ext` only — not `room_name`, not `room_group_id`.
  **Resolved 2026-08-10** (was flagged as a contradiction against §30's earlier
  "0/5 correct matches, use room_name instead" finding). Re-tested live via a
  one-off read-only diagnostic script (`scripts/ratehawk/diagnose-rg-ext.mjs`,
  deleted after use) against both the
  ETG test hotel and a real, varied hotel (Four Seasons Dubai at Jumeirah
  Beach): `rg_ext` matched field-by-field on 10/10 rooms tested, including
  varied real values (`view: 5` vs `37`, `quality: 6` vs `17`). The original
  "0/5" result was a comparison-method bug, not a data incompatibility —
  `RawRoomGroup` never even declared an `rg_ext` field (so it read as
  `undefined` regardless of the real data), and a raw `JSON.stringify()`
  equality check would fail on identical data anyway since `/search/hp/` and
  `/hotel/info/` serialize the object in different key orders. **Never compare
  `rg_ext` via `JSON.stringify()` — always compare field-by-field (or
  key-sorted).** Matching logic fixed in `availability.ts`
  (`matchRoomImages()`/`rgExtEquals()`) to compare `rg_ext` field-by-field;
  `room_name` containment is now only a fallback for when `rg_ext` is missing
  from the rate or every room group, and logs a warning when it fires.

- Rate name from `room_name` in `/search/hp/`. **Verified consistent** with
  current code.
- Meal type from `meal_data.value`. Never present a meal type as better than what
  ETG sent. **Verified consistent** — `mealValue: rate.meal_data?.value`.
- First search step shows one or two lowest rates per hotel; all rates only on the
  hotel page.
- ETG is our only supplier.
- Upsells (early check-in / late check-out): not applicable to Affiliate API. Skip.

### Caching
Never cache Retrieve hotelpage or Prebook responses — prohibited. Hotelpage rates
are storable for roughly 1 hour for display purposes only. **Verified consistent**:
§30 already notes `/api/ratehawk/availability` fetches fresh on every request,
no caching layer exists.

### Limits and timeouts
- Max 300 hotels per Search by hotel IDs request.
- Max 9 rooms per rate, same room type only.
- Max 6 adults + 4 children per room; children are 17 and under, ages passed as an
  array e.g. `"children": [7]`. Current `buildGuestsArray()` already sends
  children as an age array (consistent), but enforces none of the 300/9/6+4
  limits above — implementation gap, not a contradiction (nothing in the code
  claims otherwise).
- Stays up to 30 nights; check-in no more than 730 days out. Not enforced in the
  search form yet — gap.
- Search timeout 30s recommended, sent as an explicit `timeout` parameter.
- Prebook timeout 60s recommended, 30s minimum. Prebook does not accept an
  incoming timeout — set on ETG's side.
- `price_increase_percent` 0–100. Any value above 0 requires showing the price
  change to the user before proceeding. Default TBC.

### Certification deliverables (non-code)
- Test hotel `hid` 8473727 / `test_hotel_do_not_book` must be mapped. **Verified
  consistent** — §26 already confirms this exact `hid` returns ETG's "Test Hotel
  (Do Not Book) test" fixture.
- Diagram comparing ETG endpoints against the myOLTRA flow.
- Workflow table: step name, triggering user action, ETG endpoint(s).
- RPM estimates for `/serp/hotels`, `/serp/region`, `/serp/geo`, `/search/hp`,
  `/hotel/prebook`, `/serp/prebook`.
- IP whitelisting is mandatory on ETG's side. Vercel serverless egress is not
  static — unresolved, raised with ETG 10 Aug 2026.
- Scope of certification under the white-label model is itself unconfirmed.

### TODO — before certification (deferred, not actioned yet)
Real certification requirements, lower stakes than the items already fixed
above — do a cleanup pass on these before certification, not now.

- Parse and display `metapolicy_struct` / `metapolicy_extra_info` — neither is
  read anywhere in the current code.
- Enforce the Limits and timeouts above (300 hotels/request, 9 rooms/rate,
  6 adults + 4 children/room, 30-night max stay, 730-day advance window) —
  none are enforced in the search form today.
- **Static content is fetched live, not synced offline.**
  `fetchRatehawkRoomImages()` in `availability.ts` calls `/api/b2b/v3/hotel/info/`
  live on every hotel-page request. ETG Best Practices requires static content
  to be synced offline and cached, never called during a live user search —
  this is a graded certification point, and it's also a real latency and
  rate-limit risk on hotel pages as-is. Needs moving to a scheduled sync into
  Supabase/Directus (same shape as the existing weekly/incremental dump
  pipeline in §26/§28) rather than a per-request call.

  **Schema for this landed 2026-08-10** (data sync itself has not — this was
  additive schema only, approved and created via
  `scripts/ratehawk/add-ratehawk-static-content-fields.mjs`, idempotent/safe
  to re-run): 4 new nullable fields on `hotels`, none populated yet —
  `ratehawk_room_groups` (`json` — array of `{name, rg_ext, images}`, one
  entry per room group; a JSON blob rather than flat numbered fields like
  `ratehawk_image_*` because room-group count and image count both vary per
  hotel, unlike the fixed 50-slot hotel-image list), `ratehawk_metapolicy_struct`
  (`json`, raw structured policy object), `ratehawk_metapolicy_extra_info`
  (`text` — long free-form notes, confirmed 2026-08-10 via a one-off
  read-only diagnostic script, `scripts/ratehawk/diagnose-metapolicy.mjs`,
  deleted after use — not `string`), and
  `ratehawk_static_synced_at` (`timestamp`, shared "last synced" marker for
  all of the above). Full Directus schema snapshots taken before and after
  via `GET /schema/snapshot`, saved to `scripts/ratehawk/output/` (gitignored,
  local only). **A real finding from the pre-proposal investigation**:
  `metapolicy_struct`/`metapolicy_extra_info` turned out to live entirely on
  `/hotel/info/` (hotel-level static content), not on live `/search/hp/`
  rates — unlike taxes/cancellation (§32 Display rules), which are genuinely
  live per-search pricing data and must never be cached, metapolicy was a
  legitimate schema candidate. The actual sync script that populates these 4
  fields and writes `ratehawk_static_synced_at` is separate follow-up work,
  not done yet — this section only added the columns.
- **Content API v1 returns 403 for our key** (see Hosts and credentials
  above). ETG Best Practices assumes Content API for static sync, so this may
  block the item above until resolved. Ulrik is raising it with Valeriy
  Korobov.

### Contacts
Valeriy Korobov (integration) — apisupport@ratehawk.com
Seseg Shuianova (commercial) — s.shuianova@emergingtravel.com

---

## 33. LANDING/HOTELS/FLIGHTS UI FIX SESSION (2026-08-11)

Two commits, both pushed to `main`. Listed here mainly as a rollback map —
each item names the exact file(s)/behavior touched so a future session can
revert a single fix in isolation if it turns out to cause a regression,
without having to re-derive intent from the diff alone.

### Commit `c507f57` — landing page + cross-page date/availability fixes

Files: `src/app/page.tsx`, `src/app/LandingSummary.tsx`,
`src/app/LandingSearchPanel.tsx`, `src/app/hotels/ui/HotelsView.tsx`,
`src/app/flights/ui/FlightsView.tsx`, `src/components/hotels/HotelSmallCard.tsx`.

* **Real bug fix, high confidence**: `page.tsx`'s landing-summary hotel fetch
  was missing `limit: -1`, so it silently capped at Directus's default page
  size (100) before the JS-side setting/style/activity filter ran. Once no
  location param narrowed the query, any matching hotel outside that first
  page was invisible to the filter — root cause of "0 hotels identified"
  after clearing destination and picking a taxonomy-only filter (e.g.
  Setting=Beach). Fix is a one-line `limit: -1` add. Low rollback risk;
  if reverted, the 0-hotels bug returns.
* Landing hotel-summary header changed from a static "Hotels" label to a
  dynamic string built from the actual selected params (`city`/`country`/
  `region`/`settings`/`activities`), e.g. "24 hotels in London", "4 hotels
  with beach setting". New `buildHotelsHeaderLabel()`/`joinWithAnd()` in
  `page.tsx`; the previously-used `pickHotelGeographyLabel()` and the
  `geography` field on `HotelSummary` were removed as dead code once nothing
  read them anymore.
* Landing `CARD_LIMIT` raised 20 → 40 in both `page.tsx` and
  `LandingSummary.tsx` (must stay in sync between the two — there's no
  shared constant, they're independently declared).
* From-date pickers now call `openDatePicker(toRef)` (wrapped in
  `requestAnimationFrame`) on change, on landing, hotels, and flights
  (Depart→Return only, not the multi-city single-date fields). Flights
  needed `DateField` converted to `forwardRef`/`useImperativeHandle`
  (exports `DateFieldHandle`) since it's a shared component instantiated
  3× in `FlightsView.tsx`. **Not visually confirmed** — this environment's
  browser automation can't screenshot native `<input type=date>` popups on
  Windows, so this was verified by code-path/console-error inspection only,
  not a real click-through. Worth a manual sanity check next time someone's
  in the actual UI.
* Hotels page: the Ratehawk batch-availability `useEffect` had an early
  `if (availabilitySearchDirty) { reset to idle; return; }` guard that
  blocked auto-refetch until the user clicked "CHECK AVAILABILITY" —
  removed that guard (dependency array already covered dates/guests/
  bedrooms/currency/residency, so the effect just needed to be allowed to
  run) and added a 450ms debounce so rapid stepper clicks don't fire one
  request per click. This was the single fix behind two user-reported
  symptoms in two different sessions ("select dates" stuck after landing
  handoff, and "changing guests didn't update availability") — see §34
  below, task 8, for the second confirmation pass.
* Saved Trips date labels (`stayLabel`/`periodLabel` in
  `handleAddHotelToTrip`/`handleCreateTripAndAddHotel`, `HotelsView.tsx`;
  the flight `timing` string in `FlightsView.tsx`) were building raw ISO
  `${fromValue} – ${toValue}` strings — switched to the existing
  `formatDisplayDate()` helper each file already had for its own date
  pickers, so trips/flights display "10 Sept 2026" instead of "2026-09-10".
* `HotelSmallCard.tsx`'s `no-id` availability status ("No Agoda ID") now
  renders `null` instead of the label — landing-page-only component, not
  used on the Hotels page (that page has no Agoda references left post-§30).

### Commit `799e614` — Hotels page filter/layout/image fixes

Files: `src/app/hotels/ui/HotelsView.tsx` only.

* **Passport country UI**: moved off its own full-width row (peer to
  From/To/Guests/Bedrooms) into a small "Pricing for [country]" inline
  control under the main fields. Purely a JSX/className change — same
  `OltraSelect`, same `name="residency"`, same auto-detect-from-locale
  default. See §32's residency entry for the still-unchanged data behavior.
* **Results-pane squeeze**: when the Filters panel (Activities/Settings/
  Accolades/Price) expanded, the results-card list — previously
  `flex-1 min-h-0` — got compressed to a sliver because the outer left
  `<section>` had a bounded height with no overflow of its own. Changed the
  results list from `flex-1 min-h-0` to a fixed `max-h-[50vh]` (stays a
  stable, comfortable size regardless of filter state) and gave the left
  `<section>` `overflow-y-auto` (removed a `[contain:size]` utility that
  was there previously, no comment on original intent) so the whole left
  column scrolls as a bounded unit — same pattern `.oltra-hotels-right-pane`
  already used for the right pane. Net effect: nested scrollbars (outer
  left-pane scroll + inner results-list scroll) when both are needed —
  intentional, not a bug, but worth knowing if it looks odd on a future pass.
* **Ritz Paris thumbnails intermittently blank**: the hotel-detail thumbnail
  grid (`selectedHotelThumbGallery.map(...)`, up to 50 images) had
  `loading="lazy"` on each `<img>`. Images landing right at the fold
  boundary during the async full-gallery fetch (which replaces a 1-image
  fallback with up to 50 once `/api/hotels/[id]/ratehawk-images` resolves)
  intermittently never triggered native lazy-load. Confirmed the CDN URLs
  themselves were fine (loaded directly via `fetch` and via direct
  navigation) — this was a browser lazy-load timing issue, not bad data.
  Removed `loading="lazy"` from that one grid only (thumbnails are small
  240×240 JPEGs; the room-detail-popup image grid elsewhere in the same
  file still lazy-loads and was left alone, different component/context).
  If a future session wants lazy-loading back for perf reasons, consider
  re-adding it only for images beyond the first visible row, or switching
  to an `IntersectionObserver`-driven approach instead of the native
  attribute.
* **Taxonomy filter checkboxes (Activities/Settings/Accolades) felt broken
  on a second click**: each option was a `<Link>` doing a full server
  round-trip (Directus re-fetch) with zero optimistic UI — a quick second
  click before the first navigation resolved looked like nothing happened.
  `RelDropdown` now keeps a local `localSelectedIds` state (initialized
  from and reconciled via `useEffect` against `props.selectedIds`), updates
  it synchronously on click for instant checkbox/pill feedback, and
  triggers the actual navigation via `router.push` wrapped in
  `startTransition` instead of `<Link>`. If this ever drifts from the URL
  (e.g. a failed navigation), the reconciling `useEffect` will pull it back
  in line with `props.selectedIds` on the next render — no separate
  rollback state needed, it self-heals. Rollback would mean reverting to
  the plain `<Link>` version and accepting the latency-reads-as-broken UX.

### What was not independently re-verified this round
Task 8 ("select dates" stuck) could not be reproduced against current code
in either session — both times it traced back to the same
`availabilitySearchDirty`-blocking bug fixed in commit `c507f57` above. If
it's still seen after this, it's most likely a stale deployment/browser
cache rather than a new bug — check the Vercel deploy timestamp against the
commit before spending time re-diagnosing from scratch.

---

## 34. DESIGN-SYSTEM AUDIT & DARK-SURFACE REFINEMENT (2026-08-11 to 2026-08-13)

### What this was

Ulrik proposed moving the site to a two-surface theme — a tinted dark for
editorial/browse pages, a warm ivory for transactional ones — and asked for
an audit of what it would break *before* any code changed. The audit (8
checklist items: color definitions, maps, native controls, overlays,
third-party surfaces, Duffel logos, RateHawk imagery, WCAG contrast) was
delivered as findings only, no code. What actually shipped by the end of
the session is much narrower than the original proposal: the ivory surface
was reviewed and rejected, and only two refinements to the existing dark
theme landed — a tighter corner-radius scale and a dimmer/warmer primary
text color. Final commit: **`ae62e5b`**, pushed to `origin/main`.

### Resequencing Ulrik set, in order

1. Pure tokenization refactor first (no visual change), so a later "the
   palette is wrong" reaction could be told apart from "this component
   isn't wired to tokens at all."
2. Token *value* fixes (ivory border split, scrollbar surface-awareness).
3. Answer the map-surface question before touching any MapTiler style URL.
4. Build `/theme-test` last, once the above made it meaningful to look at.

### Step 1 — tokenization refactor (zero visual change)

Moved ~30 hardcoded `rgba()`/hex literals into `--oltra-*` tokens in
`oltra-theme.css`, across exactly the areas flagged in the audit and no
more:

* HotelsView room-detail modal + photo lightbox → `--oltra-modal-scrim`,
  `--oltra-modal-bg`, `--oltra-modal-shadow`, plus two new helper classes
  (`.oltra-modal-scrim`, `.oltra-modal-panel`) replacing the Tailwind
  arbitrary-value `bg-[rgba(...)]`/`shadow-[rgba(...)]` literals in the JSX.
* `FlightsView.module.css` `.modalBackdrop`/`.modal` → `--oltra-flights-modal-backdrop`/`-bg`/`-border`.
  **Kept as a separate token pair from the HotelsView modal above** even
  though they serve the same role — the two had genuinely different rgba
  values (not just historical drift assumed to be mergeable), and unifying
  them would have been a real, if tiny, visual change.
* Map popup/marker chrome and badge colours (`oltra-theme.css` — hotel
  markers, city markers, origin marker, `.maplibregl-popup` variants,
  `.oltra-photo-placeholder`) → `--oltra-marker-*`, `--oltra-city-marker-*`,
  `--oltra-origin-marker-*`, `--oltra-map-popup-*`, `--oltra-hotel-popup-meta`,
  `--oltra-photo-placeholder-*`.

Found along the way and deliberately **not** touched: `.hotel-marker`/
`.hotel-map-popup` exist as two byte-identical duplicate rule blocks in
`oltra-theme.css` — harmless redundancy, out of scope for a pure refactor.

Verified pixel-identical via `git stash`/`stash pop` before/after screenshot
pairs (photo lightbox, hotel-map popup) rather than just trusting the
diff — this was Ulrik's explicit acceptance test for the step.

### Step 2 — token value fixes

* Ivory border split into `--oltra-border-decorative` (#E2DBCD, unchanged —
  cards/dividers where the card background already distinguishes the
  boundary, no 3:1 requirement) vs `--oltra-border-functional` (#908C83,
  **computed** — lightest warm grey on the same hue as the decorative
  border that still clears 3:1 against both `#F6F2EA` and `#FFFDF9`, for
  input outlines/focus rings/checkbox edges where WCAG's 3:1 *does* apply).
* Scrollbar rules made surface-aware: extracted `--oltra-scrollbar-thumb`/
  `-track` tokens out of one hardcoded global rule, added an ivory override
  reusing the functional-border colour.
* Map question resolved without touching any style URL: "just go with the
  standard map format... need to see the final layout before deciding" —
  reconfirmed after ivory was dropped ("maps look fine on dark as they
  are"). `streets-v4` stays the basemap everywhere, no dark MapTiler
  variant was ever added.

### `/theme-test` — built, survived, still exists

`hotels-beta/src/app/theme-test/{page.tsx, ThemeTestView.tsx,
ThemeTestView.module.css}`. Prod-guarded (`notFound()` when
`NODE_ENV=production`), not linked from any nav. Renders **real** app
components (`OltraSelect`, `GuestSelector`, `HotelSmallCard`, the actual
modal/lightbox markup, a live MapLibre instance) wrapped via
`[data-oltra-surface="dark"]`, not replicas — this is why building it kept
surfacing real bugs rather than just showing a mockup. `OltraSelect`/
`GuestSelector` both gained a small additive `defaultOpen` prop so the page
can render them pre-opened for review.

Building the two-surface (dark + ivory) version required expanding the
token system with full accent/error/button/field/glass/border roles for
*both* surfaces, computed rather than eyeballed:

* Ivory accent split into two distinct values that came out too close to
  merge: `accent-text` #876B32 (4.50/4.95 vs page/card — lightest bronze on
  the gold's own hue/saturation, H40/S46, that still clears 4.5:1 as text)
  and `accent-fill` #8C6F34 (darker than "3:1 vs page" alone would ever
  require — the actual binding constraint turned out to be near-white
  *text on top of* the fill needing 4.5:1, not the fill-vs-page ratio by
  itself).
* Dark accent needed no change (#C8A96A already 8.08/7.24 vs page/card),
  but its filled-button text has to be **dark** (`#0E1719`), not
  near-white — near-white on that gold only reached ~2:1. Opposite pattern
  from ivory, confirmed and kept.
* A derived error/red colour for both surfaces — not part of Ulrik's
  original brief, and no error colour existed anywhere in the codebase
  before this either. Flagged explicitly as an unreviewed proposal, unlike
  the accent which was verified. Dark: `#D66452`. (Ivory's `#C4422E` is now
  dead code — see below.)
* Building the page surfaced two more hardcoded-white-text bugs beyond
  what the original audit found: `.oltra-dropdown-item`
  (`color: rgba(255,255,255,0.86)`, hardcoded) and `HotelSmallCard`'s title
  and price (`text-white` Tailwind literals) — both went white-on-white,
  effectively invisible, on the ivory column. Flagged in-page first
  (`/theme-test`'s own "known gap" notes), fixed for real once brought
  into scope in a later turn (see below).

**Recurring dev-server flakiness this session** (not a code defect, worth
knowing about for future long sessions with heavy file churn): hit a bare
500 on `/theme-test` and, later, a Flights page whose CSS module had
silently stopped applying (`grid-template-columns: none` despite the
correct class name being present — traced to
`/_next/static/css/app/flights/page.css` returning a 404). Both times,
spinning up a clean `next dev` on a scratch port confirmed the *source* was
correct and the problem was purely accumulated `.next` build state. Fixed
for good by killing the port-3000 `next` process tree, `rm -rf .next`, and
restarting via `npm run dev`.

### Decision: drop ivory entirely (2026-08-12)

Ulrik's verdict after looking at the built page: *"the ivory column reads
too mainstream — it's the standard luxury-travel white-and-black look I
deliberately moved away from, and it doesn't earn its place on the results
grid or the forms."* Removed the entire `[data-oltra-surface="ivory"]`
block, the bronze accent tokens, and the ivory border split. The
`[data-oltra-surface]` attribute mechanism itself was kept (cheap to leave
in, `/theme-test` still needs it as a sandbox) — there's just no `"ivory"`
variant registered against it anymore.

### Two refinements, requested and shipped

**1. Corner-radius scale.** Computed by grepping every real consumer of
each radius token first, not guessed:

| Token(s) | Was | Now | Used for |
|---|---|---|---|
| `--oltra-radius-xl`, `--oltra-radius-lg` | 16px / 14px | **6px** (both) | Large panels, modals, lightbox — deliberately not 0 ("crisp, not crude") |
| `--oltra-radius-md`, `--oltra-dropdown-radius` | 10px | **4px** | Cards, dropdowns, map popups, inputs, buttons — these already shared `radius-md` before this, so no restructuring was needed |
| `--oltra-radius-sm`, `--oltra-radius-xs`, `--oltra-dropdown-item-radius` | 8px / 5px | **2px** | Badges, chips, small pills, thumbnails, dropdown option rows |

`--oltra-radius-pill` (999px) untouched — it's a shape keyword, not a
rounding amount.

**2. Primary/muted text colour.** Three candidates were computed and
rendered live in `/theme-test` (not picked by eye), all **solid hex**, not
white at reduced opacity — Ulrik's explicit constraint, since opacity
renders inconsistently between the base and the raised panel:

| Candidate | Primary | vs page/panel | Muted companion | vs page/panel |
|---|---|---|---|---|
| A — same cool family, moderate dim | `#C2CBCB` | 10.99:1 / 9.85:1 | `#708F8E` | 5.20:1 / 4.66:1 |
| B — same cool family, deeper dim | `#A7B4B3` | 8.50:1 / 7.62:1 | `#708F8E` | 5.20:1 / 4.66:1 |
| **C — warm variant (SELECTED)** | **`#D9D4C9`** | 12.30:1 / 11.02:1 | **`#978869`** | 5.23:1 / 4.68:1 |

Muted companions are each the dimmest value on that hue that still clears
4.5:1 against both base and panel — computed, not eyeballed. A and B share
one companion since they're the same hue family. Candidate C — shifted
onto the gold accent's own hue (H40) at low saturation, i.e. warm against
the cool blue-green base — is what Ulrik picked.

### Shipped to bare `:root` 2026-08-13 — deliberately narrow scope

Only the radius scale and `--oltra-text-primary`/`-secondary`/`-muted`
went live site-wide. **Not** pushed: the accent-driven button recolour
(gold fill), the glass-bg/field-bg retint, `--oltra-border-functional`, or
the derived error colour — none of those were ever explicitly reviewed as
a "ship this" decision the way radius and text were; they were built only
to make the (now-dropped) two-surface `/theme-test` render correctly.
**`--oltra-button-active-bg` is still live sage green
`rgb(182, 204, 168)`** — the gold button treatment never shipped. If a
future session is asked to "finish" this, check with Ulrik before assuming
those sandboxed tokens should go live too — that's a real, visible decision
(sage green → gold buttons site-wide), not a mechanical follow-on.

The now-redundant duplicate overrides (radius + text-primary/secondary/
muted) were removed from the `[data-oltra-surface="dark"]` block once
`:root` matched them exactly, to avoid the file implying they're still
sandbox-only. `--oltra-surface-page/card/text/muted/accent` stay defined
in that block regardless — `/theme-test`'s own CSS module reads those
names directly, independent of the shared component tokens.

The two hardcoded-white-text bugs found while building `/theme-test` were
fixed for real in this pass: `.oltra-dropdown-item` and `HotelSmallCard`'s
title/price now read `var(--oltra-text-primary)`. **Not quite
byte-pixel-identical** — the old hardcoded values were
`rgba(255,255,255,0.86)`/pure white, not exactly whatever
`--oltra-text-primary` held at the time — flagged as a real if visually
negligible delta rather than claimed as a clean refactor.

### Files

* `hotels-beta/src/styles/oltra-theme.css` — the bulk of the change; see
  above for the token inventory.
* `hotels-beta/src/app/hotels/ui/HotelsView.tsx` — modal/lightbox markup
  repointed to the new helper classes (step 1 only).
* `hotels-beta/src/app/flights/ui/FlightsView.module.css` — modal tokens
  (step 1 only).
* `hotels-beta/src/components/hotels/HotelSmallCard.tsx` — title/price
  hardcoded-white fix.
* `hotels-beta/src/components/site/OltraSelect.tsx`,
  `GuestSelector.tsx` — added `defaultOpen` prop for `/theme-test`.
* New: `hotels-beta/src/app/theme-test/{page.tsx, ThemeTestView.tsx,
  ThemeTestView.module.css}` — kept as a standing review route for future
  design-system work, not a one-off scaffold to delete.

### What's still outstanding

* The sandboxed-but-unshipped tokens above (accent/button-active-bg/
  glass-bg/field-bg/border-functional/error-colour) — still only live
  inside `[data-oltra-surface="dark"]`, real decisions pending.
* The step-1 modal tokens (`--oltra-modal-scrim`/`-bg`) were never made
  surface-aware — moot now that there's only one surface, but worth
  knowing they're a distinct token pair from the general
  `--oltra-text-primary`/etc. pushed this session.
* Ivory's derived error colour (`#C4422E`) and everything else ivory-only
  is gone from the codebase entirely, not just unused — if a warm surface
  ever comes back, it isn't a matter of re-enabling something dormant.

---

This document serves as the baseline context for all future OLTRA development sessions.
