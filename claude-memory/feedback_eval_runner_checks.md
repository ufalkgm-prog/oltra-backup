---
name: feedback-eval-runner-checks
description: "When running concierge evals from the browser tab, confirm the first record lands within a minute; run tsc/lint/test alone, not in a parallel tool batch"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 794aedac-5a8a-4991-b61c-06038955a0fb
  modified: 2026-09-30T15:18:26.001Z
---

Two failures on 2026-09-30 while re-running concierge questions through the in-page runner:

- **An eval run died silently.** Adding the harness file made the dev server reload the Members tab, which wiped `window.__eval`. I then waited 10 minutes on a record count that could never arrive, and Ulrik had to ask "What is taking so long".
  - Always confirm the first JSONL record lands within about 90 seconds of starting.
  - Check `window.__eval.status()` before leaving a long wait.
- **Checks sent in a parallel batch didn't run in the repo.** Twice, `npx tsc` / `npm run lint` in a batch alongside other calls hit "This is not the tsc command you are looking for" and "not a git repository". Run the final checks as a single, standalone call.

**Why:** a silent failure wastes Ulrik's time and money, and reads as slowness.

**How to apply:** any browser-driven eval run (see [[project-concierge-model-test]]), and every end-of-batch check.
