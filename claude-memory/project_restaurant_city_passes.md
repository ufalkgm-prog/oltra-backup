---
name: project_restaurant_city_passes
description: "High-end casual v2 city passes (2026-10-04) — which cities are inserted, Rome insert awaiting confirm, open Ulrik decisions, remaining cities"
metadata:
  node_type: memory
  type: project
  originSessionId: eb19d6a2-ae31-4575-b3f1-2fc5ad0ab01c
  modified: 2026-10-04T20:48:05.611Z
---

Restaurant High-end casual v2 passes run city by city in oltra-agents on Ulrik's "run <city>", each insert only on his "confirm". Method: `restaurants/pending/2026-09-26-handover-remaining-cities.md` + `2026-10-04-city-pass-contact-and-status-addendum.md` (contact check: own website, own Instagram, site phone wins, Google-style address, OPERATIONAL).

**Inserted 2026-10-04 (all readback 0 diffs):** Berlin 2316–2323, Chicago 2324–2329, Lisbon 2330, London 2331–2344, Los Angeles 2345–2351, Madrid 2352–2357, Milan 2358–2361, New York 2362–2375. Marrakech: nothing passed EUR 100.

**Rome: staged, NOT inserted** — 3 records (Giano, Osteria Fernanda, Casa Coppelle, ranks 36–38); payload was in the session scratchpad (`rome/insert-rome-2026-10-04.json`), which does not survive. If Ulrik says "confirm" in a new session, rebuild it from `pending/rome-high-end-casual-2026-10-04-v2-decisions.md` (+ 2026-09-24 drafts) and re-validate before inserting.

**Open Ulrik decisions (flag files in restaurants/flagged/):** eins44 (Berlin), The Connaught Grill (London), Zalacaín + O'Pazo (Madrid), Marrakech spend gate, Marea + Café Carmellini + Oceans (New York), Le Jardin de Russie (Rome).

**Remaining:** San Francisco (Gary Danko is rank 36 → start 37), Vancouver, then beach-club files Miami, Dubai, Doha.

**Why:** the scratchpad helpers (directus-insert/readback/validate/places/brave/sitecheck .mjs) are session-scoped; a new session must recreate them from the handover's §8a pattern.
**How to apply:** start a new city from the handover method; nothing in oltra-agents is committed without Ulrik's instruction (114 files uncommitted at end of 2026-10-04). Related: [[project_restaurant_contact_check]], [[feedback_contact_field_rules]], [[project_oltra_agents_split]].
