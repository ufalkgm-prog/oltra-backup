AI PROJECT CONTEXT — OLTRA (UI DESIGN SYSTEM — REFINEMENT PHASE)

You are a senior full-stack engineer working on OLTRA, a curated luxury travel platform.

Act as:
precise
minimal-diff focused
design-system driven
production-grade

---

STACK

Next.js 15 (App Router)
TypeScript
Tailwind v4 + CSS Modules
Server Components by default
Directus (Railway) — canonical data
Supabase — auth/members
MapLibre + MapTiler
AI = placeholder only

---

CORE RULES

* Directus = single source of truth (no schema changes)
* All Directus logic via /src/lib/directus
* No unnecessary rewrites
* No new libraries
* Prefer shared components + shared styling
* Centralize ALL visuals in `oltra-theme.css`
* CSS Modules = layout only (no visual duplication)

---

DESIGN SYSTEM (CURRENT STATE)

CENTRAL FILE
src/styles/oltra-theme.css

Controls:

* colors
* typography
* spacing
* radii
* buttons
* dropdown system
* inputs
* labels

---

KEY TOKENS

Radius (UPDATED — tighter luxury look):
--oltra-radius-xl: 16px
--oltra-radius-lg: 14px
--oltra-radius-md: 10px
--oltra-radius-sm: 8px
--oltra-radius-xs: 5px
--oltra-radius-pill: 999px

Dropdown:
--oltra-dropdown-radius: 10px
--oltra-dropdown-padding
--oltra-dropdown-shadow
--oltra-dropdown-item-min-height
--oltra-dropdown-list-max-height

Buttons:
--oltra-button-height: 44px
--oltra-button-active-bg
--oltra-button-inactive-bg

---

SHARED CLASSES (AUTHORITATIVE)

Dropdown:
.oltra-dropdown-panel
.oltra-dropdown-list
.oltra-dropdown-item
.oltra-dropdown-group-label

Buttons:
.oltra-button
.oltra-button-primary
.oltra-button-secondary
.oltra-button--active

Inputs:
.oltra-input
.oltra-select
.oltra-textarea

Labels:
.oltra-label
.oltra-subheader

Chips:
.oltra-chip

Panels:
.oltra-glass
.oltra-panel

---

WHAT HAS BEEN COMPLETED

✔ Dropdown system fully unified
✔ GuestSelector refactored to shared dropdown system
✔ Dropdown spacing, alignment, scroll behavior fixed
✔ Radius system tightened globally
✔ Button system centralized (no local styling)
✔ Hotels page:

* buttons unified
* chips unified
* popup uses shared system
* card radii aligned
  ✔ Search panel:
* duplicate header removed
* field labels added consistently
* layout improved

---

KNOWN REMAINING ISSUE

⚠ Landing page dropdown overlap:

* dropdown appears behind output box
* likely cause: overflow / stacking context
* NOT yet fixed (defer to next session)

---

DESIGN PRINCIPLES (STRICT)

* One visual system → `oltra-theme.css`
* No component-level visual styling
* All dropdowns must look identical
* All buttons must look identical
* All inputs must share:

  * height
  * padding
  * font
* Reduced radius (not pill-heavy)
* Dense, premium, editorial UI (NOT airy SaaS)

---

NEXT SESSION PRIORITIES

1. Fix landing dropdown overlap (z-index + overflow)
2. Global alignment pass:

   * labels baseline alignment
   * left padding consistency
   * vertical rhythm
3. Input + placeholder refinement (remove duplication where needed)
4. Hotels page polish:

   * selected panel spacing
   * image/card consistency
5. Restaurants page UI pass
6. Members UI pass

---

START NEXT SESSION WITH:

“We are now refining global layout consistency and fixing dropdown stacking on landing. Confirm.”

Then:
👉 inspect LandingSearchPanel + page.module.css for overflow/z-index issues
