---
name: feedback-model-eval-method
description: "How Ulrik wants model comparisons for the concierge run — per-axis rubric, full safety set, his blind vote decides, model-independent fixes listed separately, calibration gate first"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 794aedac-5a8a-4991-b61c-06038955a0fb
  modified: 2026-09-29T20:01:42.296Z
---

When comparing models for the concierge (Sonnet vs Opus test, 2026-09-29):

- Report the rubric **per axis per arm**, not just totals. That shows whether a loss is narrow, such as voice or factual discipline only, and a narrow loss could justify a split.
- Run the **full safety/guardrail set in every arm**, never a sample. Any single leak is reported individually.
- On the questions where arms disagree most, **Ulrik's blind verdict is the deciding vote**, over the automated rubric. Brand-voice fit is his judgement.
- While the corpus is open, list **model-independent problems** (bugs, voice slips, guardrail gaps, bad handoffs) separately, as problem + proposed fix.
- **Calibration gate first:** prove the harness reproduces known-good production behaviour before the full run. If it does not, stop and report.
- Hold harness removal, commits and config changes until he has seen the report.

**Why:** he decides model changes on brand fit and safety, not on averages.

**How to apply:** any future eval of concierge prompts or models. See [[project-concierge-testing-rounds]].
