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

## 15. CURRENT STATE SUMMARY

* Hotels UI: complete and stable
* Restaurants UI: functional and aligned
* Shared dropdown behavior implemented
* Location alias system implemented (Saint Tropez ↔ Ramatuelle)

---

This document serves as the baseline context for all future OLTRA development sessions.
