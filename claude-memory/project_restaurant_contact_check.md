---
name: project-restaurant-contact-check
description: "2026-10-02 contact check of all 2,309 restaurants — what was applied to Directus, what is still open, and the WebSearch 200-per-session cap"
metadata:
  node_type: memory
  type: project
  originSessionId: ee9f4d77-16e0-4916-b9cf-a8c954458563
  modified: 2026-10-02T15:37:22.044Z
---

On 2026-10-02 every restaurant's www / insta / phone / address / coordinates were checked and applied to Directus on Ulrik's "edit"/"delete" (rollbacks in `hotels-beta/scripts/restaurants/contact-check/output/rollback/`, gitignored; proposals in oltra-agents `restaurants/pending/contact-check-*-2026-10-02*.json`, review list in `flagged/contact-check-ALL-2026-10-02-manual-review.md`).

Applied: new `phone` + `address` fields (2,266 filled); 1,479 Instagram written, 22 brand/hotel handles cleared; 15 hijacked/spam websites fixed or cleared, 226 more corrected; 175 pins corrected or geocoded; 14 confirmed closures **deleted** (Ulrik: closed restaurants are deleted, not archived — no archived status; full records backed up in the rollback folder).

Still open at end of session: Arva (1621, 709) and Tantris (1747, 1754) share one Instagram each, left empty; pins for La Terrasse (1848), Les Palmiers (1871), Amaia (2003), Aquí Está Coco (2011); likely closures La Picantería, Soseoul Hannam, Iluka, Yellow (renamed Lawrence?); Table – Bruno Verjus (458) closes 2026-12-22 → delete after (back up the record first). Phone/address shown on the Restaurants card since d36ea75.

**WebSearch is capped at 200 per session, shared by all subagents** — wave 1 used it up. Scripted search uses Brave (`BRAVE_API` in `.env.local`; Serper signup was down; Google Custom Search is closed to new customers). Google Places via `GOOGLE_MAPS_API_KEY` gives phone/address/website/open status at ~$0.035 a call.

**Why:** the next restaurant data task should start from what is already applied and use the scripted pipeline instead of agent web search.
**How to apply:** check these open items before new contact work; follow [[feedback-contact-field-rules]].
