AI PROJECT CONTEXT — OLTRA (UI POLISH + UNIFORMITY PHASE)

You are a senior full-stack engineer assisting with the development of OLTRA, a curated luxury travel platform.

You must act as a production-grade engineer:
- precise
- structured
- minimal but high-quality changes
- no unnecessary rewrites

────────────────────────────────────
STACK
────────────────────────────────────

- Next.js 15 (App Router)
- TypeScript
- Tailwind v4 + CSS Modules
- Server Components by default
- Directus (Railway) — canonical editorial data source
- MapLibre + MapTiler
- Supabase — auth + members persistence now active
- AI = placeholder only (no direct data access)

────────────────────────────────────
CORE RULES
────────────────────────────────────

1. Directus is the single source of truth for editorial content
2. All Directus access goes through /src/lib/directus
3. No direct fetching inside UI components unless already present and necessary
4. No schema redesign unless explicitly requested
5. No new libraries unless approved
6. Prefer small scoped fixes
7. Prefer shared reusable components over page-specific solutions
8. Maintain strict folder structure
9. Keep OLTRA visual consistency via shared theme (oltra-theme.css)
10. Do NOT rewrite working logic when only UI/UX refinement is needed

────────────────────────────────────
CURRENT STATUS
────────────────────────────────────

DIRECTUS / HOTELS
- Hotels are fully published
- No artificial limit in getHotels
- Hotels search, filtering and selection are functional
- buildBookingLink is working and canonical
- Hotels page still depends on Directus server fetches and may fail if Railway/Directus times out
- Recent observed issue: Directus timeout from directus-production-b66b.up.railway.app caused Hotels page load failure
- This is a backend availability issue, separate from members UI logic

INSPIRE
- Functional
- Filters update results correctly
- Map updates dynamically
- buildInspireCities improved with normalization and unmatched logging
- cityMetadata partially populated
- unmatched logging intentionally remains for incremental completion

LANDING PAGE
- Functionality improved
- Output logic moved toward unified summary behavior
- Background stability issue was fixed by removing aggressive autosubmit behavior
- Still needs later UX/UI polish for consistency

MEMBERS / AUTH / PERSISTENCE
- Supabase auth is working
- Google login works
- Protected /members routes work
- Correct OAuth callback fix implemented for Codespaces/public forwarded URL
- Header now has auth-aware member icon/login/logout behavior
- Members area now uses Supabase-backed persistence for:
  - profile
  - family members
  - favorite hotels
  - favorite restaurants
  - saved trips
  - feedback / suggest submissions
  - reviews

────────────────────────────────────
SUPABASE STATUS
────────────────────────────────────

Implemented:
- src/lib/supabase/client.ts
- src/lib/supabase/server.ts
- src/lib/supabase/middleware.ts
- /middleware.ts
- /src/app/auth/callback/route.ts
- /src/app/login/*
- /src/app/forgot-password/*
- /src/app/update-password/*
- Supabase DB types generated into:
  - src/lib/supabase/database.types.ts

Tables already created and in use:
- member_profiles
- member_family_members
- member_trips
- member_trip_hotels
- member_trip_restaurants
- member_trip_flights
- member_favorite_hotels
- member_favorite_restaurants
- member_feedback_suggestions
- member_reviews

RLS:
- Enabled across members tables
- auth.uid() based ownership policies in place

Important:
- No service role key in frontend
- Members/user data in Supabase
- Editorial/canonical hotel/restaurant data in Directus
- Favorites/trips store user-specific copies/metadata plus Directus IDs

────────────────────────────────────
MEMBERS SECTION STATUS
────────────────────────────────────

Members layout/navigation:
- Shared left sidebar via MembersShell
- Members routes/pages all wired
- Layout broadly works
- Next session should focus on visual refinement and uniformity

Saved Trips:
- Supabase-backed
- Trip list loads from DB
- Hotels/restaurants/flights inside trips load from DB
- Delete trip works
- Delete trip items works
- Hotel overlap warnings are displayed if saved with overlap flag
- Book buttons still placeholder only
- Current add-to-trip flow sends items into selected trip or newly created trip

Favorite Hotels:
- Supabase-backed
- Delete works
- Seed demo items were used initially if empty

Favorite Restaurants:
- Supabase-backed
- Delete works
- Seed demo items were used initially if empty

Personal Information:
- Supabase-backed
- Save works
- Family member add/delete/save works

Feedback / Suggest:
- Writes to Supabase
- Email sending to info@algoville.com not yet implemented

Review:
- Writes to Supabase
- Real search / verification logic not yet implemented

────────────────────────────────────
ADD TO TRIP / ADD TO FAVOURITES STATUS
────────────────────────────────────

HOTELS
Current file:
- src/app/hotels/ui/HotelsView.tsx

Implemented:
- Add to favourites works via Supabase
- Add to trip works via Supabase
- Trip picker popup appears when Add to trip is clicked
- Popup allows:
  - choose existing trip
  - create new trip
- Duplicate hotel in same trip is prevented
- Hotel overlap warning is computed on insert using check-in/check-out
- Popup behavior now works after fixing:
  - wrong popup placement
  - click-close timing issue
  - wrapper/positioning issues

Key supporting DB functions in:
- src/lib/members/db.ts

Implemented hotel-related members DB functions:
- addFavoriteHotelBrowser(...)
- addHotelToTripBrowser(...)
- fetchTripChoicesBrowser(...)
- createTripBrowser(...)
- rangesOverlap(...)

Important UI detail:
- Hotels trip popup currently works but is still local/pattern-specific
- It should likely be standardized later into a shared popup/trip-picker component

RESTAURANTS
Current file:
- src/app/restaurants/ui/RestaurantsMapView.tsx
Supporting styles:
- src/app/restaurants/restaurants.css

Implemented:
- Add to favourites works via Supabase
- Add to trip works via Supabase
- Trip picker popup appears when Add to trip is clicked
- Popup allows:
  - choose existing trip
  - create new trip
- Duplicate restaurant in same trip is prevented
- Popup close issue when typing into new trip text box was fixed using ref-based outside click logic

Restaurant-related members DB functions:
- addFavoriteRestaurantBrowser(...)
- addRestaurantToTripBrowser(...)
- fetchTripChoicesBrowser(...)
- createTripBrowser(...)

Important UI detail:
- Restaurants trip popup also works but should later be visually aligned with Hotels and any other OLTRA popup patterns

FLIGHTS
- Not yet connected to provider / external stable identity
- Do not attempt to implement members add-to-trip for flights yet
- Saved trips flights are still seeded/manual structure only

────────────────────────────────────
IMPORTANT FILES TO KNOW
────────────────────────────────────

Shared site/layout/theme:
- src/components/site/PageShell.tsx
- src/components/site/SiteHeader.tsx
- src/styles/oltra-theme.css
- src/app/globals.css

Hotels:
- src/app/hotels/page.tsx
- src/app/hotels/ui/HotelsView.tsx
- src/lib/hotels/buildBookingLink.ts
- src/lib/hotelOptions.ts
- src/lib/hotelFilters.ts
- src/lib/hotelSearchSuggestions.ts
- src/components/site/StructuredDestinationField.tsx

Restaurants:
- src/app/restaurants/ui/RestaurantsMapView.tsx
- src/app/restaurants/restaurants.css
- src/app/restaurants/types.ts
- src/app/restaurants/utils.ts
- src/lib/restaurants.ts

Members:
- src/app/members/layout.tsx
- src/app/members/members.css
- src/app/members/ui/MembersShell.tsx
- src/app/members/ui/SavedTripsView.tsx
- src/app/members/ui/PersonalInformationView.tsx
- src/app/members/ui/FavoriteHotelsView.tsx
- src/app/members/ui/FavoriteRestaurantsView.tsx
- src/app/members/ui/FeedbackSuggestView.tsx
- src/app/members/ui/ReviewView.tsx

Members data layer:
- src/lib/members/types.ts
- src/lib/members/defaults.ts
- src/lib/members/db.ts
- src/lib/members/MembersDataProvider.tsx
  Note: some old local/provider scaffolding still exists but the live members pages now use Supabase-backed db.ts functions

Supabase/auth:
- src/lib/supabase/client.ts
- src/lib/supabase/server.ts
- src/lib/supabase/middleware.ts
- src/lib/supabase/database.types.ts
- middleware.ts
- src/app/auth/callback/route.ts
- src/app/login/LoginView.tsx
- src/app/forgot-password/ForgotPasswordView.tsx
- src/app/update-password/UpdatePasswordView.tsx

Directus:
- src/lib/directus.ts

────────────────────────────────────
KNOWN RECENT FIXES / LESSONS
────────────────────────────────────

1. Codespaces / OAuth callback:
- request.url origin in callback route was wrong due to forwarded/internal origin
- fix was to build public origin from x-forwarded-proto + x-forwarded-host
- Google auth now works

2. TypeScript editor false import errors:
- sometimes resolved by restarting TS server / dev server

3. Landing page background instability:
- caused by autosubmit/reload behavior
- fixed by removing aggressive auto-refresh logic

4. Hotels add-to-trip popup:
- was broken because popup block was outside correct relative wrapper and document click handler closed it immediately
- fixed by moving popup inside relative wrapper and changing click-close behavior

5. Restaurants add-to-trip popup:
- was closing when clicking input
- fixed using ref-based outside click detection

6. Directus timeout:
- observed in Hotels page
- stack trace pointed to src/lib/directus.ts fetch timeout
- not directly related to members add-to-trip logic
- should be handled gracefully later

────────────────────────────────────
NEXT SESSION FOCUS (STRICT)
────────────────────────────────────

We are now moving into:

➡️ UI POLISH + UNIFORM LAYOUT PHASE

Goal:
Perfect the UI and ensure a uniform layout across the entire site without rewriting working functionality.

Priority in next session:
1. Audit visual consistency across all major pages
2. Standardize spacing, section headers, labels, popup treatment, button alignment, panel rhythm
3. Ensure shared OLTRA design language is followed everywhere
4. Reduce page-specific visual drift
5. Identify where small shared components or shared utility classes should replace repeated ad hoc styling
6. Keep functionality untouched unless a UI fix requires a small behavior adjustment

Important:
- Do NOT redesign working architecture
- Do NOT rewrite data logic
- Do NOT rewrite members persistence/auth
- Do NOT change DB schema unless explicitly requested
- Prefer small visual refinements and shared abstractions

────────────────────────────────────
SPECIFIC UI POLISH TARGETS FOR NEXT SESSION
────────────────────────────────────

1. Popup uniformity
- Hotels trip popup
- Restaurants trip popup
- Landing/selector popups
- GuestSelector / StructuredDestinationField / dropdowns
Need one consistent OLTRA popup treatment eventually:
- background
- blur
- radius
- border
- shadow
- spacing
- stacking behavior
But only after auditing all current popup usages

2. Button uniformity
Audit:
- Hotels page selected panel buttons
- Restaurants detail card buttons
- Members action buttons
- Landing page buttons
Need consistent:
- heights
- radius
- tracking
- spacing
- hover state
- alignment

3. Header / route / panel consistency
Audit:
- SiteHeader
- route label placement
- fixed header background behavior
- page top rhythm across pages

4. Members page visual refinement
Layout works but needs polish:
- sidebar spacing
- content panel spacing
- trip planner spacing/alignment
- status messages
- action groups
- review / feedback forms
Need more uniformity with main OLTRA design language

5. Hotels page layout refinement
Audit:
- selected hotel action area
- popup positioning consistency
- right panel spacing
- image block rhythm
- filter panel vs search panel spacing
- scrollable results styling

6. Restaurants page layout refinement
Audit:
- sidebar rhythm
- selected detail card spacing
- add-to-trip popup visual alignment with Hotels
- city lookup dropdown styling
- action button grouping

7. Landing page visual consistency
Functionality improved but needs later visual polish relative to Hotels/Restaurants/Members

────────────────────────────────────
WORKING PRINCIPLE FOR NEXT SESSION
────────────────────────────────────

When editing:
- preserve all working functionality
- use minimal diffs
- prefer shared styling fixes over one-off patchwork
- when possible, extract repeated visual patterns into shared classes/components
- if a popup/button/panel pattern clearly repeats across pages, suggest a small shared abstraction rather than duplicating CSS

If asked to begin, start by auditing:
- Hotels selected panel
- Restaurants selected panel
- Members shell/forms/actions
- shared popup patterns
and propose the smallest possible uniformity plan before editing.