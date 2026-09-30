---
name: project-concierge-model-test
description: "2026-09-29/30 concierge model test — Opus 5.5 chosen (high 9.41, medium 9.39 at $0.080), Sonnet 8.8; report artifact, harness still in tree, pending Ulrik's effort decision and blind votes"
metadata:
  node_type: memory
  type: project
  originSessionId: 794aedac-5a8a-4991-b61c-06038955a0fb
  modified: 2026-09-30T08:18:48.562Z
---

Model test run 2026-09-29/30 on 32 conversations (Q51–100 picks, §50 hard cases, safety S1–S8), twice per setup, blind-graded.

- **Results:**
  - Opus 5: 8.88 at $0.149/answer.
  - Opus 5.5 high: 9.41 at $0.096–0.101.
  - Opus 5.5 medium: 9.39 at $0.080.
  - Sonnet 5.5: 8.78–8.83 at $0.048–0.053.
  - Hybrid (Haiku router): 9.34 at $0.080.
  - Zero guardrail failures anywhere.
- **Sonnet's weakness:** fit and follow-up, not facts. It twice claimed "I've moved your trip".
- **Report artifact:** https://claude.ai/artifact/RULaYkGMpYATrW8trB4pft (v2). It has blind votes (pairs 1–8 and E1–E5), whose keys are in the session scratchpad `pairs-key*.json`. If they are lost, re-derive them from the eval JSONL at `%TEMP%/oltra-concierge-eval.jsonl`.
- **Committed 102cc14 (not pushed):** `CHAT_MODEL = claude-opus-5-5`, `CHAT_EFFORT = "medium"`, `fallbacks: "default"`.
- **Committed 4fd4d33 (not pushed):** BOOK-click logging via `member_book_clicks` and `/api/members/book-click`. The SQL is at `scripts/members/2026-09-30-member-book-clicks.sql` and Ulrik runs it by hand.
- **Harness removed from the tree** (never committed). Copies are in the session scratchpad (`evalArm.saved.ts`, `route.with-harness.ts`, `runner.js`, `questions.json`).
- **Ulrik's tiering idea:** Opus for the first 50 answers AND the first month, then Sonnet for heavy users who rarely book. Parked; with medium effort it may not be worth it.

**Why:** cost vs quality decision for the concierge engine.

**How to apply:** before proposing model/effort changes, read CLAUDE-AI.md "Model test" and this note. See [[feedback-model-eval-method]], [[project-concierge-testing-rounds]].

**Follow-up, 2026-09-30:**
- **Fixes:** batches B1–B6 of cross-model fixes were committed and pushed (f81d169..65261ae), plus the CLAUDE.md note cd15eff.
- **Regression:** blind, mixed with the effort-test answers, it scored 9.44 against 8.89 with no safety failure.
- **B7 (data), no writes:** Ulrik will add Overwater himself, Terre Blanche stays under Provence, the ETG status flips wait for the 2026-11-16 run, and there is no opening-days field.
- **Open:** Duffel test key in production (#18); showAll bypass (H1); whether to soften the "never state availability" prompt rule (Q85).
