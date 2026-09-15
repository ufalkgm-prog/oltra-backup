---
name: concierge-testing-rounds
description: "Ulrik is running one-question-at-a-time AI concierge test rounds in the dev browser; five questions done 2026-09-14, resume with question six"
metadata: 
  node_type: memory
  type: project
  originSessionId: 630d0a83-c8d7-41b7-b9a0-32e95b4da724
  modified: 2026-09-15T12:07:34.207Z
---

Since 2026-09-14 Ulrik tests the AI concierge by having Claude open the dev server in Chrome, ask ONE query on a varied page (landing, Hotels, Flights, Restaurants, Inspire), relay the panel text plus which tools ran, and flag what might warrant a code or prompt change. He reviews each answer and decides; fixes are verified in the same browser session, then committed and pushed on his word.

Done on 2026-09-14 (all fixes pushed, last commit fb6a3b9): Inspire diving in February; Restaurants anniversary in Paris; Flights business class to Tokyo plus hotels; Hotels family ski at Easter with a budget; landing Lisbon long weekend with hotel, dinner and flights. Resume with question six on 2026-09-15.

On 2026-09-15 questions 6–10 ran (Inspire walking/countryside, Restaurants Rome family, landing 50th-birthday art trip), plus a UI change moving "Ask AI" into the site header; all pushed, last commit c2930d8. Resume with question eleven.

**Why:** the concierge's failures are silent (CLAUDE-AI.md), so answers are reviewed by a person rather than by tsc or lint.

**How to apply:**
- This session-scoped request is the "explicitly asked" exception to the no-unsolicited-browser-testing rule ([[project_no_unsolicited_ui_testing]]).
- Clear the conversation before each new question.
- Read the store (`oltra_ai_concierge_v1`) for the tool calls, not just the screen.
- Check for a stray dev server on :3000 before starting a new one; one orphan survived a TaskStop.
- Things he has already settled: model-chosen dates from a loose month are acceptable if stated; the AI inserts no filters other than dates and guests (only the "AI curated results" token); production still uses a duffel_test Duffel token.
