---
paths:
  - "**/*.tsx"
  - "**/*.css"
---

<!-- Split out of CLAUDE.md on 2026-09-12. The text is moved verbatim and the
     section numbers are unchanged, so every §N cross-reference still resolves.
     This file loads automatically when Claude reads a file matching `paths`
     above; CLAUDE.md keeps a one-line pointer to it for the cases where the
     work starts before any such file is opened. -->

# DESIGN SYSTEM

The shipped palette, the token names and what each role is for, and the list of things deliberately NOT tokenised — check that list before 'finishing' any of them.

---

## 35. FINAL PALETTE + TOKEN MIGRATION (2026-08-13, completed 2026-08-16)

Supersedes §34's shipped text colours. A fully prescriptive spec from Ulrik, shipped straight to bare `:root` as `a2b1c30`, with the live-component migration in `15c8ea8`. §34's radius scale is unaffected.

**Surfaces**: base `--oltra-bg-color: #2c3634`; raised panel/card `--oltra-field-bg-solid: #374240`; recessed field `--oltra-field-bg: #232c2a`; field border `--oltra-field-border: #3e4947`.

**Text — three solid roles, no opacity variants**: primary `--oltra-text-primary: #f5f2ec` (headings, body, values, labels on outline buttons); muted `--oltra-text-secondary` / `--oltra-text-muted: #cbd0cb` (secondary and metadata only — the two names alias one value, there is no third tier); placeholder `--oltra-text-placeholder: #c0c6c1`; disabled `--oltra-text-disabled: #787774` (deliberately sub-AA, only where nothing essential is carried by the text alone).

**Fields are solid recessed, not translucent** — every form field is `--oltra-field-bg` + 1px `--oltra-field-border`. Translucency survives **only** where glass does real work over imagery: map popups, the featured-mode hero search panel, the featured hotel card, the map container.

**Dropdowns and popups are raised, not recessed** — `--oltra-field-bg-solid` panel, `--oltra-dropdown-border` (`1px solid #738783`), hover `#414c4a`, selected `#4c5754` + primary text.

**Badges/chips** are recessed like fields, with their own `--oltra-badge-text` token (aliases muted) so badge colour can't drift from body text by accident.

**Buttons** — superseded by §35A. The sage fill `#7ba079` survives only as `--oltra-button-active-bg` / `--oltra-favorite-mark` for non-button uses (the date-range fill, the favourite mark). **Gold buttons were never shipped and are not pending.**

**Error**: `--oltra-error-text: #ff8a71`. **Type size**: metadata/secondary raised from 11px to 12px wherever it appears.

### Live-component migration

Changing what a token *resolves to* does nothing for components holding literal `text-white/NN` utilities. Migrating those to `text-[color:var(--oltra-text-primary)]` — the Tailwind-v4-without-a-config convention here, since there's no config file or `@theme` block — is separate work, now complete.

**Methodology for future passes**: primary for headings, body copy, values and icon glyphs on solid fills; muted for metadata, status and helper text; the recessed field treatment for filter/status pills; and a **two-step muted→primary hover** for small utility links and icon-only buttons, since a solid three-role system has no continuous opacity scale to step through. The hotel Description body is **primary** (it is "body"); smaller highlights blurbs are **muted**.

### New tokens (2026-08-16)

`--oltra-border-subtle/-soft/-medium/-strong` and `--oltra-surface-lift-soft/-lift/-lift-strong`, banded from the values actually in use. **Deliberately kept translucent**, unlike the solid text and field tokens: they sit inside glass over imagery where a relative lift is correct, and it means the pass preserved rendering rather than shifting it. Making them solid is a separate, visible decision.

`--oltra-border-field` and `--oltra-border-panel` were **removed** — sandbox duplicates gone stale (`-panel` still held `#738783` after the pane border softened to `#545F5D`, so `/theme-test` drew borders the live site no longer used).

### A panel that must escape the glass is portalled, not z-indexed (2026-09-21)

Two things in this layout trap an absolutely-positioned panel, and **no z-index can climb out of either**:

* **`.oltra-glass` carries `backdrop-filter`**, which creates a new stacking context. A dropdown inside it cannot clear anything painted outside it, however high its `z-index`.
* **`main.oltra-page` is `overflow-x: hidden`**, which makes it a clipping ancestor on both axes (one axis hidden forces the other to `auto`). A panel taller or wider than its column is cut by it.

So the fix for a panel that renders behind something, or gets clipped, is **`createPortal` to `document.body` plus measured placement** — not another z-index token. `SaveToTripControl` is the worked example: it portals, measures the trigger, and flips the panel up when there is no room below. The Hotels detail pane had its own hand-rolled picker that did none of that and opened 120px below the fold; replacing it with the shared control fixed it and deleted 215 lines.

**Not a licence to portal everything.** Audited across 1440/1280/1024/834/502 on 2026-09-21: every dropdown rendered on screen and on top, so there is no present defect to chase. Converting the remaining panels would mean writing measured positioning six more times for no observed gain. The rule is what to do **when one does** misbehave.

### Deliberately NOT tokenised — check here before "finishing" any of them

* **Map and photo-overlay chrome**: `.oltra-temp-controls__*` and `PageShell`'s `.intro` (it carries a `text-shadow` and sits over a hero image — overlay chrome, and that question is settled).
* **Functional borders at alpha 0.32+** — checkbox edges, focus rings, the selected flight-card outline. These are the only cue for what they enclose.
* **The Info pill** (`.infoButton`: `background:#fff; color:#111`) — a deliberately inverted control, not a theme colour.
* **`@media print` `#000`/`#fff`** in `members.css` — paper is white.
* **`/editor/*` and `TopNav.tsx`** — an internal tool that doesn't follow the design system, and dead code (`TopNav` is never imported anywhere).

---

## 35A. THE BUTTON STANDARD (2026-09-14)

Supersedes every earlier button instruction, including §35's filled sage. Specified by Ulrik, audited on `/theme-test` (the full inventory is `src/app/theme-test/buttonInventory.ts`), and every open point settled on a decision sheet before anything shipped. **The template is one block in `oltra-theme.css`** — tokens `--oltra-btn-*`, classes `.oltra-btn*` — and every page draws from it. Never restyle a button locally: no fill, shadow, radius, height, padding, font-size or italic utility on a `.oltra-btn`.

**Construction**: transparent, 2px rim, 999px pill, uppercase with tracking. Pills are for actions only; fields, cards, panels, dropdowns and badges keep the crisp radius scale.

| Variant | Class | Rim | Label | When |
|---|---|---|---|---|
| Primary | `.oltra-btn` | `#8AA884` | `#F5F2EC` | every action, including secondary ones (Cancel, No, Exit, Log out, Close) |
| Destructive | `--destructive` | **`#C98479`** | `#F5F2EC` | delete, remove, terminate, Clear |
| Passive | `aria-disabled="true"` + `data-reason` | **`#67716E`** | `#7E8783` | entries incomplete, or nothing to do |
| Neutral | `--neutral` | `#9AA39E` | `#CBD0CB` | active grey: leaving OLTRA for a hotel we cannot sell ("Book on website" — shortened from "Check availability on website" 2026-09-21), caveat inside the button. **These cards sort last in every list** (`sellableFirst`) |
| AI | `--ai` | rim **`#D27B3F`** over fill **`#B0541E`** | **`#F5F2EC`**, bold italic | the concierge entry point only: "AI Concierge" first in the site header on every page (renamed from "Ask AI" 2026-09-16), plus "Ask AI" inside the landing destination field (2026-09-15; it left the Hotels, Flights, Restaurants and Inspire frames). **Members only (2026-09-16):** signed out, both render passive and upright (not bold italic) and open nothing — rim and label in `--oltra-text-secondary`, the landing field labels' pale white, rather than the standard passive grey (Ulrik, 2026-09-16); hovering shows the standard passive popup "The AI Concierge is only available for members" (it replaced a "Members only" note beneath the button, 2026-09-16), opening below the header button rather than above it. The header one sits a nav link's padding + rim (14px) further from Hotels, so the spacing counts from its rim rather than its text. **One deliberate exception (Ulrik, 2026-09-16):** "Become a member" in the landing intro panel wears this variant too, at his choice — do not "fix" it back. **A SOLID ORANGE PILL WITH A WHITE LABEL since 2026-09-21 (Ulrik)** — see below the table. The panel's own "AI Concierge" heading and the site header's route label while it is open take the label orange too (`.oltra-route-label--ai`) |

**Formats**: Full **6/20 + 12px on a 14px line (= 30px)** for page, modal, form and search actions — **four less than the 34px control height since 2026-09-21 (Ulrik)**, so a button is deliberately a little shorter than an input rather than flush with it, and a row holding both centres them (`.oltra-field-row`; never `align-self` on the button, which would also apply in a flex column and shrink every stacked `--block` button to its label). Almost every Full button already sits on its own line under a field grid, so that rule has few users today. `--oltra-button-height` follows the button (30px) and is **not** the control height (34px, inputs). The 44px hit area is centred and unaffected. It was 8/20 + 13px = 34px. Condensed (`--condensed`) for anything inside a card or list row: **22px, 0 6px, 0.58rem, 0.14em** — the old `.oltra-button--xs`, which the landing/concierge Book and Save already shared; the /flights price-card pair (24px, and not matching each other) was brought onto it. No fixed widths on buttons; `--block` fills a column.

**States**: hover rim +8% lightness; pressed rim −4% and label `#EAE4D8`; focus a 2px `#F5F2EC` ring offset 2px (never a rim change); passive has neither. Pressed is the smaller step because darkening is what fails 3:1.

### The AI variant is FILLED, and that changes four things (2026-09-21)

Ulrik replaced the sage `#A8C4A2` with orange earlier the same day, then replaced the transparent orange-rim/orange-label version with a **solid two-tone pill**: fill `#B0541E`, rim `#D27B3F` (the line around BETA in the myOLTRA logo), carrying the standard white label `#F5F2EC` — in the header and in the landing destination field alike. It is the one variant that is filled rather than transparent, so four of the standard's rules do not carry over. All four measured:

* **Rim and fill move in OPPOSITE directions on hover and press,** because they answer to different backgrounds. The rim is the edge against the dark page, so it follows the standard and lightens: `#D27B3F` → `#DA9260` → `#CC7030`, measuring 3.95 / 4.90 / 3.52 against `#2C3634`. The fill is what the white label sits on, so it does the reverse and darkens: `#B0541E` → `#9C4A1A` → `#8D4216`, measuring 4.55 / 5.51 / 6.43 against `#F5F2EC`. A single set moving one way breaks one of the two — a fill that lightened on hover left the label at **2.27:1, worse than resting**.
* **Two tones are why it passes, and collapsing them to one would break it.** A 12px bold label needs 4.5:1 and a control edge needs 3:1, against different backgrounds. `#D27B3F` used for both left the label at **2.83:1**; darkening that single value to fix the label took the edge to **2.45:1**. Split, each clears its own test — label 4.55:1 on the fill, edge 3.95:1 on the page — and the two oranges are only 1.61:1 apart, so the rim reads as a lighter highlight around the pill rather than as a second colour. **Do not "tidy" the fill and rim back into one token.**
* **`.oltra-over-image .oltra-btn--ai` must carry the fill explicitly.** It outranks `.oltra-btn--ai`, so deleting the old transparent reset did not hand the button its orange — it handed it `--oltra-btn-over-image-bg`, the site background, and "Ask AI" went dark on the landing photo.
* **Passive resets `background: transparent`** (`AiModeButton.module.css`). An orange pill that opens nothing would read as the live one.

### The values that moved from the spec, and why

* **Destructive `#C0756A` → `#C98479`.** The specified value was 2.97:1 on the panel, which is where confirmations live. The new one is 3.50:1, and its pressed step lands back on `#C0756A`.
* **Passive rim `#3E4947` → `#67716E`, same 2px as the others.** The field border was 1.12:1 on the panel and read as a thinner line than the active rims. It is still deliberately under 3:1 (2.07 panel) — WCAG 1.4.11 exempts inactive controls — but visible.
* `#A8C4A2` passes as text (5.50:1 on panel, 4.98 pressed), so the AI label needed no brighter value.

### Behaviour that is part of the standard

* **Passive is an attribute, not a class.** `aria-disabled` still takes a click, so a form can move focus to the first missing field; `data-reason` renders as a hover popup (`::before` — `::after` is the 44px hit area). A real `disabled` is only for busy states and keeps the variant's look. "Nothing to do" states (already checked, no changes, a cap, logged out) are passive with a reason and no focus move.
* **Hit areas** reach 44px via `::after`, never padding. Two stacked card buttons use `--stack-top` / `--stack-bottom`, which split the gap between them instead of overlapping.
* **Yes/No pairs are always the same width** — `.oltra-btn-pair`.
* **Over photography a button gets a solid fill — the one exception to "transparent" (2026-09-14).** A surface carrying `.oltra-over-image` gives its buttons `--oltra-btn-over-image-bg` (the site background, `#2C3634`) and no shadow, so every rim and label sits on exactly the ground its contrast was measured against. It replaced a translucent scrim with a halo, which still let the photo through; on the brightest hero photo the bare sage rim had fallen to about 1.5:1 through the 72% landing glass. The AI button (inside the field) and buttons inside popups stay transparent.
* **No clickable italic anywhere except the AI button** — italic now means AI. The italic delete links became Destructive pills, and the /flights "info" pill stayed inverted but upright.
* **Selection controls share one look (`--oltra-choice-*`)**: the Flights trip-type tabs. **The header menu no longer shows an edge on hover or on the current page (2026-09-15)** — the 2px border is kept transparent so the click area is unchanged; the rest of this bullet now describes the tabs. Semisquare (`--oltra-radius-md`), 2px edge. The chosen one is sage (`#8AA884`, standard label); unchosen tabs wear passive colours, while unchosen header items have no edge. Hover lifts the edge to neutral grey `#9AA39E`. The current page stays sage while another item is hovered.
* **Controls are not actions** and keep their shapes: tabs, steppers, carousel arrows, close icons, calendar cells, nav links, selectable rows, disclosures, text links in prose. The destination-field chip keeps its pill as a declared exception.
* The Hotels search button says **SEARCH**; what's missing is the popup, not the label.

---
