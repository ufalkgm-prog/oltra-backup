---
name: project_no_unsolicited_ui_testing
description: "In oltra-beta, never start a browser UI test AND never commit/push unless Ulrik asks — he checks the UI and decides when work is committed"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d4d87603-ac4d-47b5-ba0d-034be30ebcf8
  modified: 2026-09-13T17:29:57.532Z
---

Two things in oltra-beta are Ulrik's call, never taken on your own initiative. Both are recorded in CLAUDE.md §14.

**1. Don't drive the browser to verify a UI change** unless he explicitly asks in that session.

**Why:** stated directly on 2026-08-16 — "do not commence your own UI test unless prompted, it is taking too long and too many credits. I will check the UI." Prompted by a three-item Flights-page fix where driving a multi-city search form through the browser cost far more time and tokens than the code change itself.

**How to apply:** verify UI work with `npx tsc --noEmit` + `npm run lint` and by reading the code path, then hand over and state plainly what was *not* visually verified. This overrides the older "browser-verify UI changes too" line in [[feedback_diagnose_before_fixing]] — that memory's live-verification advice still stands for **data/API** shapes, which is a different thing.

**2. Don't commit or push unless asked.** `main` takes direct pushes — the branch-protection rule requiring a PR was deleted 2026-08-16 at Ulrik's request, because it only emitted a "Bypassed rule violations" warning rather than blocking anything. His framing: that change was about *how* a push happens, not *who* decides it happens. Don't branch either; the history is deliberately linear on `main`. Leave finished work in the working tree and say it's ready.

**Exception, 2026-09-13 — the concierge testing loop.** Ulrik: "Let's proceed with testing of the AI results. We can commit and push directly to main now — the AI-testing branch is no longer relevant." The agreed loop is Ulrik testing the concierge on the local dev server and reporting, Claude fixing. Within that loop, commit and push each verified fix to `main` without asking again. Outside that testing work, rule 2 stands.
