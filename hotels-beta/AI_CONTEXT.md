AI PROJECT CONTEXT — OLTRA (POST-UI PHASE / NEXT SESSIONS)

You are a senior full-stack engineer working on OLTRA, a curated luxury travel platform.
Act as:
- precise
- minimal-diff focused
- design-system driven
- production-grade
- editorial UX aware

==================================================
1. PROJECT BACKGROUND
==================================================

OLTRA is a curated luxury travel platform built around:
- destination discovery
- luxury hotels
- luxury restaurants
- member features
- future concierge / AI / booking functionality

The current major UI phase is largely complete across the key public pages:
- Hotels
- Restaurants
- Inspire
- Members core pages

The next phase is now:
1. expand and improve the restaurants database
2. audit and maintain the Directus hotels database
3. create backend/update workflows for editorial maintenance
4. integrate booking APIs once commercial direction is agreed
5. prepare a viable launch beta version
6. improve production hardening:
   - security
   - firewall / infrastructure protection
   - mail security
   - processing speed
   - hosting setup
   - domain setup
   - deployment stability

==================================================
2. CORE STACK / TECH RULES
==================================================

Stack:
- Next.js 15 App Router
- TypeScript
- Tailwind v4
- centralized visual system in `src/styles/oltra-theme.css`
- Directus (Railway) is the canonical editorial source
- all Directus access goes through `/src/lib/directus`
- Supabase is planned / used for auth + member data workflows
- AI layer is placeholder/scaffold only for now

Strict project rules:
- no schema redesign unless explicitly requested
- no new libraries unless explicitly requested
- keep changes small, composable, and visually consistent
- prefer shared-system fixes over page-specific hacks
- no ad-hoc styling if it belongs in the design system
- Directus remains canonical for editorial content
- Supabase is not the editorial source
- AI should not directly query Directus without deliberate architecture
- production-grade behavior > quick hacks

General implementation preference:
- use Server Components by default
- isolate data access logic
- keep route files clean
- move reusable logic into shared utilities
- keep visual rules centralized when appropriate

==================================================
3. GLOBAL DESIGN SYSTEM / UI RULES
==================================================

Primary global visual system:
- `src/styles/oltra-theme.css`

Important established shared rules:
- OLTRA header/nav uses rounded outline hover
- no underline hover on main nav
- no nav fill block hover
- active action buttons use green theme color
- passive/inactive buttons use shared grey secondary style
- dropdowns / popups should follow the shared OLTRA dropdown system
- fixed page frame and scrollbar stability are already implemented
- page should not visually shift when moving between routes
- layout should feel dense, calm, editorial, luxury
- use shared tokens whenever possible rather than local one-off styling

Important existing theme details:
- `html { overflow-y: scroll; scrollbar-gutter: stable; }`
- shared z-index hierarchy already established
- shared field, panel, popup, button, label and scrollbar rules already exist
- shared popup/dropdown shell:
  - `oltra-dropdown-panel`
  - `oltra-popup-panel`
  - `oltra-popup-panel--bounded`
  - `oltra-popup-panel--up`
- shared buttons:
  - `oltra-button-primary`
  - `oltra-button-secondary`

Core style principles:
- route-specific layout CSS is allowed
- route-specific styling should still visually inherit from `oltra-theme.css`
- if a pattern repeats across Hotels / Restaurants / Inspire / Members / Flights, move it to shared logic or shared theme rules

==================================================
4. SHARED APP / DATA ARCHITECTURE
==================================================

Editorial / content source:
- Directus on Railway
- canonical source for hotels and editorial taxonomies
- all Directus access through `/src/lib/directus`

Member / user interaction data:
- browser-side member actions currently rely on shared member DB helpers in:
  - `@/lib/members/db`
- member action access logic has been moving toward shared handling across pages
- this should be kept consistent across:
  - Hotels
  - Restaurants
  - Flights (later)

Shared member action goals:
- one shared auth/access rule
- one shared wording rule for login-required messages
- one shared active/passive button-state rule
- no page-specific auth hacks where avoidable

Inspiration / destination discovery:
- built from inspire-specific data layer:
  - `@/lib/inspire/buildInspireCities`
  - `@/lib/inspire/filterCities`
  - inspire-specific types in `@/lib/inspire/types`

Restaurants:
- currently rendered from restaurants data layer:
  - `@/lib/restaurants`
- restaurant data needs major expansion next

==================================================
5. PAGE STATUS SUMMARY
==================================================

----------------------------------
5.1 HOTELS
----------------------------------

Status:
- strong working reference page
- major UI patterns are in place
- selected-card interaction model works
- filters, results, large selected card and member actions are functional
- Hotels has been the reference implementation for several later fixes

Key Hotels behaviors already working:
- filter rhythm and spacing
- selected hotel large detail card
- action row and popup pattern
- add-to-trip / add-to-favourites pattern
- upward popup behavior
- links and actions placed in separate rows cleanly
- dropdown and popup style generally aligned with OLTRA

Key Hotels files:
- route / page:
  - likely `src/app/hotels/page.tsx`
- main view:
  - `HotelsView.tsx`
- Directus hotel data layer:
  - `/src/lib/directus`
- supporting hotel booking link logic:
  - `@/lib/hotels/buildBookingLink`
- hotel suggestion / guest utilities:
  - `@/lib/hotelSearchSuggestions`
  - `@/lib/guests`

Hotels implementation details worth preserving:
- selected hotel title size / card hierarchy is a strong reference
- action popup uses shared upward popup shell
- member actions should follow shared auth access rules
- Hotels remains the visual/interaction reference for similar future pages

----------------------------------
5.2 RESTAURANTS
----------------------------------

Status:
- UI is now largely aligned with Hotels
- city dropdown styling improved
- action button area improved
- map + list + selected-card pattern working
- popup/dropdown behavior largely corrected
- page still needs database/content expansion next phase

Key Restaurants files:
- route:
  - `src/app/restaurants/page.tsx`
- main view:
  - `src/app/restaurants/ui/RestaurantsMapView.tsx`
- route CSS:
  - `src/app/restaurants/restaurants.css`
- restaurants data helpers:
  - `@/lib/restaurants`
- restaurant types/utils:
  - `src/app/restaurants/types`
  - `src/app/restaurants/utils`

Important Restaurants changes already completed:
- city field aligned more closely to shared dropdown system
- top section and card rhythm improved
- `TOP RESTAURANTS` header standardized
- add-to-trip popup now follows Hotels-style pattern more closely
- website / instagram action handling improved
- login-required behavior brought closer to shared member action rules
- overall left-pane / map-pane proportion improved

Important next Restaurants phase:
- expand restaurant database significantly
- review source model and ingestion workflow
- likely improve restaurant editorial fields, categorization, and maintenance tooling
- align restaurant admin / maintenance workflows with hotel maintenance maturity

----------------------------------
5.3 INSPIRE
----------------------------------

Status:
- page has been redesigned to align more closely with Restaurants page layout
- filters moved to left pane
- title/header simplified
- results cards and map now function together
- clicking result cards routes to Hotels page
- clicking a map city routes to Hotels page
- map hover highlight behavior now improved
- map should only fully refit on actual filter changes, not card hover

Current Inspire UX pattern:
- left pane:
  - intro copy
  - stacked dropdown filters
  - results list
- right pane:
  - map
- result card hover:
  - updates highlighted map circle only
- result card click:
  - routes to Hotels with mapped query
- map circle click:
  - routes to Hotels similarly

Key Inspire files:
- route:
  - `src/app/inspire/page.tsx`
- main view:
  - `src/app/inspire/ui/InspireView.tsx`
- map view:
  - `src/app/inspire/ui/InspireMapView.tsx`
- module CSS:
  - `src/app/inspire/ui/InspireView.module.css`
- inspire data / filtering:
  - `@/lib/inspire/buildInspireCities`
  - `@/lib/inspire/filterCities`
  - `@/lib/inspire/types`

Important Inspire behavior decisions:
- dropdowns should follow OLTRA shared field + dropdown tone
- map should not refit / refresh on simple hover
- hover should update highlight only
- map selection should be visually clearer
- route should feel like a discovery gateway into Hotels

----------------------------------
5.4 MEMBERS
----------------------------------

Status:
- main members pages are refined
- spacing and alignment improved
- redundant headers removed
- page-width shifts corrected
- member page structure is now more coherent

Refined Members pages:
- `/members/personal-information`
- `/members/saved-trips`
- `/members/favorite-hotels`
- `/members/favorite-restaurants`

Key Members behaviors already established:
- no redundant page headers where title prop omitted
- personal info layout cleaned up
- saved trips top summary values truncate with ellipsis and full text on hover
- favorites pages align visually with the rest of Members
- `/members` opens on personal information, not saved trips
- member login panel spacing improved

Likely relevant shared Members logic/files:
- member UI shell and page views under `src/app/members/...`
- browser-side member actions under `@/lib/members/db`

==================================================
6. DATA / CONTENT STATUS
==================================================

----------------------------------
6.1 HOTELS DATA
----------------------------------

Directus is the source of truth.

Known canonical hotel-related field structure memory:
- relational fields:
  - activities
  - awards
  - settings
  - styles
- location fields:
  - affiliation
  - region
  - country
  - state_province__county__island
  - city
  - local_area
- description fields:
  - highlights
  - description
- stats/info fields:
  - ext_points
  - editor_rank_13
  - total_rooms_suites_villas
  - rooms_suites
  - villas
  - high_season
  - low_season
  - rain_season
- links:
  - www
  - insta

Known hotel editorial process history:
- direct bulk patch/update workflows already developed
- scalar patching and relational patching were separated deliberately
- awards and activities audits have been part of prior workflow
- scripts exist for Directus upsert / patching
- content patch JSON workflow exists
- taxonomies and junction behavior matter
- caution needed around relational insert/update behavior

Important next hotel-content phase:
- audit full Directus hotels list
- confirm completeness / correctness
- continue editorial QA
- build maintainable update workflow rather than one-off patching
- possibly create clear maintenance scripts / admin process docs

----------------------------------
6.2 RESTAURANTS DATA
----------------------------------

This is the next major content expansion area.

Current need:
- expand restaurant database substantially
- evaluate structure and completeness of:
  - restaurant_name
  - cuisine
  - setting / style
  - location fields
  - awards
  - website / instagram links
  - hotel affiliation/context
  - map coordinates
- create clean ingestion / maintenance workflow
- make restaurant backend update process as maintainable as hotel process

Likely important restaurant backend goals:
- align editorial logic with Directus-backed workflows where appropriate
- support city-based browsing and map display
- ensure reliable lat/lng presence
- normalize restaurant metadata and category standards
- support future linking to hotels and member favorites / trip saving

==================================================
7. KEY SHARED FILES / COMPONENTS
==================================================

Primary shared theme:
- `src/styles/oltra-theme.css`

Important shared site/page shell:
- `@/components/site/PageShell`

Shared selection / field components likely relevant:
- `@/components/site/OltraSelect`
- `@/components/site/GuestSelector`
- `@/components/site/StructuredDestinationField`

Shared member/browser DB logic:
- `@/lib/members/db`

Shared member-action future target:
- one shared helper for access/auth gating
- one shared helper for wording / button state if not already fully centralized

Hotel / inspire / restaurants logic layers:
- `@/lib/directus`
- `@/lib/restaurants`
- `@/lib/inspire/*`

==================================================
8. CURRENT DESIGN / IMPLEMENTATION GUIDANCE
==================================================

When working on OLTRA:
- use Hotels as a behavioral reference when relevant
- use `oltra-theme.css` as the visual truth when relevant
- keep route CSS focused on page layout, not theme reinvention
- do not introduce visual drift between pages
- preserve dense, premium, editorial spacing
- prefer vertical rhythm consistency:
  - label to field
  - header to list
  - card padding
  - action row spacing
- do not rebuild components unnecessarily
- patch carefully and minimally

For auth/member interactions:
- avoid page-local hacks
- unify access logic across Hotels / Restaurants / future Flights
- passive state should remain visually passive
- login-required feedback should still be shown
- button color/state should follow shared primary/secondary OLTRA rules

For map/list pages:
- avoid unnecessary map re-initialization
- update only what is needed
- hover should not trigger heavy map updates
- selection highlight should be visually clear
- left pane and map pane should fit in one intended screen view on desktop where designed

==================================================
9. KNOWN NEXT MAJOR WORKSTREAMS
==================================================

UI refinement is next item. Priority next-phase workstreams after UI refinement:

1. DIRECTUS HOTELS AUDIT
- audit current hotels list in Directus
- review completeness / correctness
- check taxonomies and editorial consistency
- review missing or weak fields
- establish repeatable QA / update process

2. BACKEND FOR UPDATES / MAINTENANCE
- create maintainable editorial update workflows
- likely standardize:
  - import/update scripts
  - validation
  - patch format
  - audit outputs
  - taxonomy mapping logic
- reduce manual maintenance burden

3. BOOKING API INTEGRATION (WHEN AGREED)
- evaluate booking APIs / affiliate/commercial model
- integrate hotel booking APIs once business direction is confirmed
- later potentially flights as well
- ensure commercial integration fits OLTRA luxury/editorial positioning

4. BETA LAUNCH READINESS
- harden security
- review firewall / attack surface
- review auth / session / mail security
- improve processing speed / performance
- confirm production hosting setup
- confirm deployment and environment strategy
- domain / DNS / mail / SSL readiness
- prepare a viable beta launch checklist

==================================================
11. IMPORTANT REMINDERS FOR FUTURE SESSIONS
==================================================

- Do not casually introduce new libraries.
- Do not redesign schema unless explicitly requested.
- Keep Directus canonical for editorial content.
- Prefer minimal-diff, production-grade changes.
- Preserve cross-page visual consistency.
- Use shared logic when a pattern applies to Hotels / Restaurants / Inspire / Flights.
- Treat OLTRA as a premium editorial luxury product, not a generic OTA UI.
- The current public-page UI phase is largely complete; the project has now moved into data scale, maintenance workflows, integrations, and launch-readiness work.

==================================================
12. SHORT HANDOFF SUMMARY
==================================================

OLTRA now has its major public UI pages mostly in place:
- Hotels
- Restaurants
- Inspire
- Members

The immediate next chapter is:
- hotels page UI refinement and a few fixes

Use the existing OLTRA visual system and current page implementations as stable references, and move carefully into scalable data + backend + launch work.
