AI PROJECT CONTEXT — OLTRA (NEXT SESSION: INSPIRE + RESTAURANTS ACTION POPUPS)

You are a senior full-stack engineer working on OLTRA, a curated luxury travel platform.

Act as:
- precise
- minimal-diff focused
- design-system driven
- production-grade

-----------------------------------
CURRENT STACK / RULES
-----------------------------------

- Next.js 15 App Router + TypeScript
- Tailwind v4
- centralized visual system in `src/styles/oltra-theme.css`
- Directus (Railway) is the single canonical editorial data source
- all Directus access goes through `/src/lib/directus`
- no schema redesign unless explicitly requested
- no new libraries unless explicitly requested
- keep changes small, composable, and visually consistent
- no ad-hoc visual styling if it should belong in the shared system

-----------------------------------
CURRENT GLOBAL UI STATUS
-----------------------------------

Stable shared rules now include:
- header nav uses rounded outline hover, no underline, no fill
- Members section spacing is denser and improved
- active buttons use green theme color
- shared controls use OLTRA theme tokens
- `/members` opens on personal information, not saved trips
- global scrollbar/page-width fix has already been added in `src/styles/oltra-theme.css`:
  `html { overflow-y: scroll; scrollbar-gutter: stable; }`

Important shared principle:
- prefer shared system fixes over page-specific hacks
- use `oltra-theme.css` for visual rules when appropriate
- only use local CSS for layout/section-specific adjustments

-----------------------------------
MEMBERS STATUS
-----------------------------------

Refined pages:
- `/members/personal-information`
- `/members/saved-trips`
- `/members/favorite-hotels`
- `/members/favorite-restaurants`

MembersShell:
- redundant page title headers removed where `title` prop is omitted
- sidebar/content alignment improved

Personal Information:
- no page header
- left column = member name, email, phone, birthday, home airport
- right column = preferred hotel styles, preferred airlines
- preferred hotel styles sourced from Directus taxonomy styles
- preferred airlines mock options: SAS, Lufthansa, Emirates, easyJet
- currency removed
- additional members reduced to name + birthday
- unsaved changes prompt added: “Do you want to save changes?” Yes/No

Saved Trips:
- no page header
- top summary values truncate with ellipsis and show full text on hover via `title`

Favorite Hotels / Favorite Restaurants:
- page headers removed
- aligned visually with Personal Information / Saved Trips

-----------------------------------
RESTAURANTS STATUS
-----------------------------------

Restaurants page only needed small tweaks and is close to correct.

Files involved:
- `src/app/restaurants/page.tsx`
- `src/app/restaurants/ui/RestaurantsMapView.tsx`
- `src/app/restaurants/restaurants.css`

What was already addressed:
1. city dropdown was moved toward the shared dropdown visual system
2. city label was aligned to the field edge instead of inner text alignment
3. spacing between labels and fields was tightened toward Members/Hotels rhythm
4. `TOP RESTAURANTS` replaced dynamic “X selected top restaurant” text

Important remaining Restaurants issue for next session:
- the `Add to trip` and `Add to favourites` popup/dropdown behavior is not correct near the bottom of the selected-card area
- the popup opens downward and can extend below the visible container area
- this makes the dropdown/popup partially inaccessible
- this needs to be fixed carefully with minimal diff

Likely cause:
- popup is absolutely positioned downward inside a constrained scroll/container context
- relevant selectors include:
  - `.restaurant-detail-card__actions--relative`
  - `.restaurant-trip-popup`
  - `.restaurant-detail-card`
  - `.restaurants-sidebar__detail`

Goal next session:
- make add-to-trip / add-to-favourites interaction fully accessible
- popup should not drop below the bottom edge of the usable panel area
- likely fix is one of:
  - open upward instead of downward in this context
  - anchor differently inside the action area
  - adjust overflow/positioning context carefully
- keep styling aligned with shared dropdown/popup system

Do NOT do a large rewrite unless clearly necessary.

-----------------------------------
INSPIRE PAGE — NEXT SESSION MAIN FOCUS
-----------------------------------

Main next-session focus is now the Inspire page.

Need a consistency and usability pass on:
- map view
- text boxes
- dropdowns
- pop-ups
- header / overall layout rhythm
- visual consistency with Hotels / Members / Restaurants

Prior Inspire requirements from earlier sessions:
- map view, text boxes, dropdowns and pop-ups should be uniform across all pages
- Inspire should be in the main menu if not already completed
- page scroll should not visually move behind the OLTRA header/menu icon
- there should be a proper fixed header background layer on top of the underlying page
- maintain dense, calm, editorial luxury spacing

Need to verify current Inspire state next session before patching.

-----------------------------------
SHARED FILES / SYSTEM FILES
-----------------------------------

Likely relevant shared files:
- `src/styles/oltra-theme.css`
- any Inspire route/view files
- any shared dropdown component files if Inspire uses them
- possibly `src/components/site/OltraSelect.tsx` if a true shared dropdown inconsistency is found

Already relevant shared theme details:
- `html { overflow-y: scroll; scrollbar-gutter: stable; }`
- shared dropdown/popup system exists in `oltra-theme.css`
- use shared classes/tokens where possible rather than local one-off styling

-----------------------------------
NEXT SESSION TASKS
-----------------------------------

1. Fix Restaurants page
2. Fix Inspire page