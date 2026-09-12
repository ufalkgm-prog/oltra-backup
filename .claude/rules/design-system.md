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

**Buttons** keep the sage family, recomputed: active `--oltra-button-active-bg: #7ba079` with **dark** text `#232c2a`; inactive transparent fill, `--oltra-button-inactive-border: #6c8c6a`, primary text. **Gold buttons were never shipped and are not pending** — §34 flagged that as an open decision; §35 settled it as recomputed sage.

**Error**: `--oltra-error-text: #ff8a71`. **Type size**: metadata/secondary raised from 11px to 12px wherever it appears.

### Live-component migration

Changing what a token *resolves to* does nothing for components holding literal `text-white/NN` utilities. Migrating those to `text-[color:var(--oltra-text-primary)]` — the Tailwind-v4-without-a-config convention here, since there's no config file or `@theme` block — is separate work, now complete.

**Methodology for future passes**: primary for headings, body copy, values and icon glyphs on solid fills; muted for metadata, status and helper text; the recessed field treatment for filter/status pills; and a **two-step muted→primary hover** for small utility links and icon-only buttons, since a solid three-role system has no continuous opacity scale to step through. The hotel Description body is **primary** (it is "body"); smaller highlights blurbs are **muted**.

### New tokens (2026-08-16)

`--oltra-border-subtle/-soft/-medium/-strong` and `--oltra-surface-lift-soft/-lift/-lift-strong`, banded from the values actually in use. **Deliberately kept translucent**, unlike the solid text and field tokens: they sit inside glass over imagery where a relative lift is correct, and it means the pass preserved rendering rather than shifting it. Making them solid is a separate, visible decision.

`--oltra-border-field` and `--oltra-border-panel` were **removed** — sandbox duplicates gone stale (`-panel` still held `#738783` after the pane border softened to `#545F5D`, so `/theme-test` drew borders the live site no longer used).

### Deliberately NOT tokenised — check here before "finishing" any of them

* **Map and photo-overlay chrome**: `.oltra-temp-controls__*` and `PageShell`'s `.intro` (it carries a `text-shadow` and sits over a hero image — overlay chrome, and that question is settled).
* **Functional borders at alpha 0.32+** — checkbox edges, focus rings, the selected flight-card outline. These are the only cue for what they enclose.
* **The Info pill** (`.infoButton`: `background:#fff; color:#111`) — a deliberately inverted control, not a theme colour.
* **`@media print` `#000`/`#fff`** in `members.css` — paper is white.
* **`/editor/*` and `TopNav.tsx`** — an internal tool that doesn't follow the design system, and dead code (`TopNav` is never imported anywhere).

---
