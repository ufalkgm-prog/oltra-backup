---
name: project-ratehawk-integration
description: "RateHawk/ETG status — certification scope confirmed 2026-09-16 (General/Static/Search only), Prebook built up to an unspecified redirect seam; details live in .claude/rules/etg-ratehawk.md §32/§47"
metadata:
  node_type: memory
  type: project
  modified: 2026-09-16T10:37:08.311Z
  originSessionId: ec11e773-664e-4b97-8a48-7a4721ad81e9
---

RateHawk (Emerging Travel Group) integration is documented in **`.claude/rules/etg-ratehawk.md` §32 (live section), §42, §47, §48**; build history §26–§30 in CLAUDE-ARCHIVE.md. Read those rather than this memory for specifics (see [[feedback-claude-md-source-of-truth]]).

**As of 2026-09-16** (work left uncommitted for Ulrik's review):
- ETG confirmed certification under the White Label model covers **General, Static Data and Search only**; booking and card tokenisation do not apply. Prebook is ours; the redirect after it is not yet specified by ETG — the code stops at a marked `WHITE LABEL REDIRECT SEAM`. Do not guess the redirect format.
- Prebook built (10% tolerance, every price/terms change shown), metapolicy displayed, search `timeout: 30` sent, 300-hid chunking (sequential), visible passport-country field, child ages required, 6A+4C per room enforced, hardcoded `"gb"` removed from the concierge.
- **A rate's price covers every room searched** (measured 2026-09-16); the old ×N headline was wrong, saved trips from before hold inflated totals.
- Our key's limits: `hp` and `prebook` **5/min site-wide**, serp 15/min — raise with ETG.
- Booking endpoints are active on our key; the proxy allowlist (§47) is the control. `ETG_PREBOOK_ENABLED` on Railway is the no-deploy kill switch.
- Certification deliverable drafts: `etg-certification/` at the repo root.

**How to apply**: before touching ETG code read §32 in the rules file; never execute a booking call without Ulrik's in-session confirmation (test bookings are real orders on the live host).
