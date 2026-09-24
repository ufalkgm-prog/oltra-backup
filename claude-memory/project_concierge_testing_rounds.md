---
name: concierge-testing-rounds
description: "Ulrik is running one-question-at-a-time AI concierge test rounds in the dev browser; Q35-50 done 2026-09-23 (pushed 5a4f553), resume at Q51"
metadata: 
  node_type: memory
  type: project
  originSessionId: 630d0a83-c8d7-41b7-b9a0-32e95b4da724
  modified: 2026-09-24T13:48:09.296Z
---

Since 2026-09-14 Ulrik tests the AI concierge by having Claude open the dev server in Chrome, ask ONE query on a varied page (landing, Hotels, Flights, Restaurants, Inspire), relay the panel text plus which tools ran, and flag what might warrant a code or prompt change. He reviews each answer and decides; fixes are verified in the same browser session, then committed and pushed on his word.

Done on 2026-09-14 (all fixes pushed, last commit fb6a3b9): Inspire diving in February; Restaurants anniversary in Paris; Flights business class to Tokyo plus hotels; Hotels family ski at Easter with a budget; landing Lisbon long weekend with hotel, dinner and flights. Resume with question six on 2026-09-15.

On 2026-09-15 questions 6–14 ran, plus a multi-stop test (London → Nice/Cannes → Porto Cervo → London) that led to the whole-trip landing layout; all pushed, last commit ec387d0. Resume with question fifteen.

Later on 2026-09-15 questions 15–24 ran, all pushed, last commit f2c66e1.

On 2026-09-23 questions 25–34 ran on Ulrik's themed list (inventory-only, restaurants page, reading page state, member section, login, booking, buttons/external sites), all pushed as 27b4c11. Resume with Q35: the Inspire page (flight ranges and purposes), then the security/architecture-probe theme, then random questions. Open item he has not decided: a curated marker (sage "A") in the Restaurants page's city and type boxes.

Later on 2026-09-23 Q35 (Inspire, 3h flight limit) and a page-hopping run Q36-38 (Inspire -> Hotels -> Restaurants -> Flights -> Inspire, one conversation, panel closed between) ran; all pushed as f7d46ac (flight-time estimate + limit, city as destination on every page, header links carry the answer, triage ACCOUNT misfire, blank Restaurants default, Flights re-search, Villa Sant'Andrea city Taormina). Security probes Q39-43 then ran (system-prompt ask, probe inside a real request, claimed authorisation, another guest's booking, injection pasted in a hotel description), pushed as 167b3bb; mixed messages are now answered without their harmful part (triage extraction). Random questions Q44-45 then ran (London birthday lunch, New Year fireworks), pushed as 0f5f96a: panel names 5 (was 8), Michelin never relaxed, faster long answers (Q45 149s -> 115s) with a "found so far" line. Ulrik: a faster model for search steps was tested and saved no time - never propose it. Q46-48 then ran (Mauritius family, solo April city break from Paris, Caribbean adults-only on a budget), pushed as 741eadf: rooms rule (one room, or ask "How many rooms would you need?" for 3+ guests beyond 1 adult+2 kids / 2 adults+1 kid), Inspire follows a prose answer, departure city never the destination. Q49-50 then ran (private onsen near Tokyo, relaxed dinner walking from Claridge's), pushed as 5a4f553: repeat searches send names only, missing features named, web search on the 2025 version (no Python step). Resume with Q51 (random). To re-run one question without a new conversation: pop the last two messages from `oltra_ai_concierge_v1` in sessionStorage, reload, ask again.

**From Q51 (2026-09-24) the format changed to batches:** 10 batches of 5 (B1 regressions, B2 page hopping, B3 dates/guests, B4 destinations, B5 prices/availability, B6 favourites, B7 saved trips, B8 multi-stop/flights, B9 long conversations, B10 edge/safety). The plan is in `~/.claude/plans/we-have-now-run-radiant-pancake.md`. Claude runs all 5 questions, logs every answer to `scratchpad/concierge-batch-NN.md`, and reports ONLY the key issues plus proposed fixes. Ulrik picks the fixes, and the next batch runs on the fixed code.

All 10 batches (Q51-100) ran on 2026-09-24, every chosen fix verified in the browser, NOT yet committed (waiting for Ulrik's word; update concierge.md and CLAUDE-AI.md before the commit). Biggest additions: read-only member tools myFavourites/mySavedTrips (lib/ai/memberData.ts, never price columns); shared search fold lib/searchFold.ts (accents, dashes, St->Saint) used by the concierge and restaurants; Saint-Tropez alias fixed (hotels are "Saint-Tropez"); Clear resets a concierge-set party; SAS moved to SkyTeam plus a searchFlights alliance filter; the triage extraction parser accepts the one-line "KIND / request" shape (lib/ai/extractParse.ts). Open, not fixed: full hotels on later stops still unnamed; Flights page does not apply an alliance; Duffel test returns nothing for business multi-city.

- Running triage outside Next: tsx fails on `server-only`; put an empty stub package in the scratchpad and run with NODE_PATH pointing at it.

- A fresh Chrome profile needs Ulrik to type the beta password and log in himself — Claude never types passwords.

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
