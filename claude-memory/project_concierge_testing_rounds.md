---
name: concierge-testing-rounds
description: "Ulrik is running one-question-at-a-time AI concierge test rounds in the dev browser; five questions done 2026-09-14, resume with question six"
metadata: 
  node_type: memory
  type: project
  originSessionId: 630d0a83-c8d7-41b7-b9a0-32e95b4da724
  modified: 2026-09-15T20:55:33.190Z
---

Since 2026-09-14 Ulrik tests the AI concierge by having Claude open the dev server in Chrome, ask ONE query on a varied page (landing, Hotels, Flights, Restaurants, Inspire), relay the panel text plus which tools ran, and flag what might warrant a code or prompt change. He reviews each answer and decides; fixes are verified in the same browser session, then committed and pushed on his word.

Done on 2026-09-14 (all fixes pushed, last commit fb6a3b9): Inspire diving in February; Restaurants anniversary in Paris; Flights business class to Tokyo plus hotels; Hotels family ski at Easter with a budget; landing Lisbon long weekend with hotel, dinner and flights. Resume with question six on 2026-09-15.

On 2026-09-15 questions 6–14 ran, plus a multi-stop test (London → Nice/Cannes → Porto Cervo → London) that led to the whole-trip landing layout; all pushed, last commit ec387d0. Resume with question fifteen.

Later on 2026-09-15 questions 15–24 ran, all pushed, last commit f2c66e1. Resume with question twenty-five.

- Wait for an answer with a Bash until-loop on the dev log (`POST /api/chat` count rising), not a long in-page JS wait — the Chrome tool's JS call times out at 45s.
- An answer that shows nothing: log `finishReason` per step (`onStepFinish`) before guessing; "length" meant the output cap, which counts the model's thinking.
- Commit only on his word in THAT message — "fix all" alone is not a commit instruction (slipped once on 2026-09-15).

- Typing into the concierge via the Chrome extension can be swallowed by the Next dev error overlay; setting the textarea value with the native setter plus an input event, then clicking Ask, is reliable.
- `npm run dev` stopped with TaskStop leaves an orphan node on :3000 — kill it by PID after checking it is node.

**Why:** the concierge's failures are silent (CLAUDE-AI.md), so answers are reviewed by a person rather than by tsc or lint.

**How to apply:**
- This session-scoped request is the "explicitly asked" exception to the no-unsolicited-browser-testing rule ([[project_no_unsolicited_ui_testing]]).
- Clear the conversation before each new question.
- Read the store (`oltra_ai_concierge_v1`) for the tool calls, not just the screen.
- Check for a stray dev server on :3000 before starting a new one; one orphan survived a TaskStop.
- Things he has already settled: model-chosen dates from a loose month are acceptable if stated; the AI inserts no filters other than dates and guests (only the "AI curated results" token); production still uses a duffel_test Duffel token.
