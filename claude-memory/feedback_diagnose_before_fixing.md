---
name: feedback-diagnose-before-fixing
description: "In oltra-beta, verify assumed API/data shapes live before writing fix code, and flag contradictions between docs and code instead of silently resolving them — validated repeatedly in the 2026-08-10 RateHawk certification-prep session"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: ec11e773-664e-4b97-8a48-7a4721ad81e9
  modified: 2026-08-16T14:40:12.917Z
---

Before writing code against an assumed external-API field shape (especially RateHawk/ETG), run a small read-only diagnostic script against live data first, rather than coding to what documentation or existing code comments claim. Once the fix is verified working, delete the one-off diagnostic script — don't leave it in the repo as "reusable tooling" unless the user says to keep it.

**Why:** validated three times in one session (2026-08-10). Each time, a live check surfaced the real bug instead of a plausible-but-wrong guess:
- `rg_ext` room-matching was believed broken from a prior session's finding ("0/5 correct matches") — a live diagnostic showed 10/10 matches were actually correct, and the real bug was a `JSON.stringify()` order-sensitive comparison plus a TypeScript type that never captured the field at all.
- `cancellation_penalties` and `tax_data` were assumed to live directly on the rate object (matching the existing, wrong, code) — live diagnosis showed they actually live nested under the rate's primary payment type.
- `metapolicy_struct`/`metapolicy_extra_info` were assumed to be live per-search rate data (grouped with taxes/cancellation in the docs) — a live check showed they're actually static hotel-level content from a different endpoint entirely, which changed whether they belonged in a Directus schema proposal at all.

Also validated: when new documentation (an ETG integration brief) contradicted existing, live-tested CLAUDE.md content, the user's explicit instruction was "flag any contradictions to me instead of silently resolving them" — inline `⚠️ CONTRADICTION` callouts in CLAUDE.md were the right move, not picking a side unilaterally.

And: after each diagnostic script did its job and the resulting fix was verified (via `tsc`, and separately via a real browser session), the user asked for the script to be deleted, along with cleaning up any stale CLAUDE.md references to it ("deleted after use" rather than a dangling pointer) — don't assume a diagnostic script is meant to become permanent tooling.

**How to apply:** for any RateHawk/ETG (or similar external-API) work in this repo — write a throwaway script hitting the real endpoint, print the raw shape, compare against what the code/docs assume, *then* write the fix.

**Scope limit (2026-08-16):** this applies to **data/API** behaviour only. Do NOT extend it to driving the UI in Chrome — Ulrik checks the UI himself and asked that browser testing not be started unsolicited, because it is slow and expensive. Verify UI changes with `tsc`/lint plus the code path, then say what wasn't visually checked. See [[project_no_unsolicited_ui_testing]] and CLAUDE.md §14.
