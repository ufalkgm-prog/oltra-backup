---
name: project-restaurant-contact-check
description: "2026-10-02 contact check of all 2,309 restaurants — what was applied to Directus, what is still open, and the WebSearch 200-per-session cap"
metadata:
  node_type: memory
  type: project
  originSessionId: ee9f4d77-16e0-4916-b9cf-a8c954458563
  modified: 2026-10-02T17:54:16.724Z
---

On 2026-10-02 every restaurant's www / insta / phone / address / coordinates were checked and applied to Directus on Ulrik's "edit"/"delete" (rollbacks in `hotels-beta/scripts/restaurants/contact-check/output/rollback/`, gitignored; proposals in oltra-agents `restaurants/pending/contact-check-*-2026-10-02*.json`, review list in `flagged/contact-check-ALL-2026-10-02-manual-review.md`).

Applied: new `phone` + `address` fields (2,266 filled); 1,479 Instagram written, 22 brand/hotel handles cleared; 15 hijacked/spam websites fixed or cleared, 226 more corrected; 175 pins corrected or geocoded; 14 confirmed closures **deleted** (Ulrik: closed restaurants are deleted, not archived — no archived status; full records backed up in the rollback folder).

Later the same day Ulrik worked through the review page (https://claude.ai/artifact/MRXcaaaeSpjCmFNPJq5Yo3, decisions in its db collection `decisions`): 16 more restaurants deleted (incl. Table, so its December note is moot), 124 unverifiable website links and 86 phone numbers that differed from Google cleared, 5 links he found applied. The 164 Instagram items wait in oltra-agents `flagged/contact-check-instagram-to-check-2026-10-02.md`.

Still open: the 164 Instagram items above; Arva (1621, 709) and Tantris (1747, 1754) share one Instagram each, left empty; 124 restaurants now have no website and 86 no phone pending a later check. All status and pin questions were settled on the review page. Phone/address shown on the Restaurants card since d36ea75.

**WebSearch is capped at 200 per session, shared by all subagents** — wave 1 used it up. Scripted search uses Brave (`BRAVE_API` in `.env.local`; Serper signup was down; Google Custom Search is closed to new customers). Google Places via `GOOGLE_MAPS_API_KEY` gives phone/address/website/open status at ~$0.035 a call.

**Why:** the next restaurant data task should start from what is already applied and use the scripted pipeline instead of agent web search.
**How to apply:** check these open items before new contact work; follow [[feedback-contact-field-rules]].
