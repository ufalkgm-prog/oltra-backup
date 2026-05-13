# OLTRA — AI CONTEXT (UPDATED)

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

Key fields:

* hotel_name
* hotelid
* country
* region
* city
* local_area
* affiliation

Editorial:

* highlights
* description

Stats:

* editor_rank_13
* ext_points

Relational fields:

* activities
* awards
* settings
* styles

Links:

* www
* insta

Booking:

* booking_provider
* booking_url
* booking_enabled
* booking_label

---

### Restaurants

Structure mirrors hotels conceptually but is simpler:

* name
* city
* country
* category / cuisine (if used)

Filtering is primarily city-based.

---

## 4. TAXONOMY SYSTEM

All major filters are relational and resolved via taxonomy maps:

* activities
* awards
* settings
* styles

Each consists of:

* id (UUID)
* name (label)

Frontend uses:

```ts
Map<string, string>
```

for id → label mapping.

---

## 5. KEY ARCHITECTURE FILES

### Hotels

Page:

* `/src/app/hotels/page.tsx`

Main UI:

* `/src/app/hotels/ui/HotelsView.tsx`

Helpers:

* `/src/lib/directus`
* `/src/lib/hotelFilters`
* `/src/lib/hotelOptions`
* `/src/lib/hotelSearchSuggestions`

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

1. Read `city` from URL
2. Resolve against available city options
3. Fetch restaurants by city
4. Render map + list via `RestaurantsMapView`

---

### City Alias Logic (NEW)

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
* Restaurants UI: functional and aligned
* Flights UI: Duffel-backed search, return-trip airline matching (same airline / alliance), per-segment detail popup, smart max-duration defaults, scrollbar-aware column alignment, cabin + tripType URL params for deep-linking from Saved Trips
* Landing page: no dark overlay, hotel cards link to main /hotels page, "Add flights" label correct
* Members UI: Personal Information, Saved Trips (with localStorage trip notes + Book redirect URLs), Favorites — complete
* Login: three-view panel (login / signup / forgot), Google OAuth only, active button state validation
* Auth header: race-condition-free, OAuth name fallback, instant greeting on login
* Location alias system implemented (Saint Tropez ↔ Ramatuelle)
* Build: passes `npm run build` and `npx tsc --noEmit` clean (warnings only, no errors)

---

This document serves as the baseline context for all future OLTRA development sessions.
