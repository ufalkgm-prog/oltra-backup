---
name: project_restaurant_city_passes
description: "High-end casual v2 city passes (2026-10-04) — which cities are inserted, Rome insert awaiting confirm, open Ulrik decisions, remaining cities"
metadata:
  node_type: memory
  type: project
  originSessionId: eb19d6a2-ae31-4575-b3f1-2fc5ad0ab01c
  modified: 2026-10-05T11:19:40.397Z
---

Restaurant High-end casual v2 passes run city by city in oltra-agents on Ulrik's "run <city>", each insert only on his "confirm". Method: `restaurants/pending/2026-09-26-handover-remaining-cities.md` + `2026-10-04-city-pass-contact-and-status-addendum.md` (contact check: own website, own Instagram, site phone wins, Google-style address, OPERATIONAL).

**Inserted 2026-10-04 (all readback 0 diffs):** Berlin 2316–2323, Chicago 2324–2329, Lisbon 2330, London 2331–2344, Los Angeles 2345–2351, Madrid 2352–2357, Milan 2358–2361, New York 2362–2375. Marrakech: nothing passed EUR 100.

**Rome inserted 2026-10-05:** Giano 2392, Osteria Fernanda 2393, Casa Coppelle 2394 (ranks 36–38), readback 0 diffs.

**Flag decisions settled 2026-10-05 (Ulrik: follow the agent's recommendations):** inserted HEC The Connaught Grill 2395, Zalacaín 2396, O'Pazo 2397, Marea 2398, Le Jardin (Hotel de Russie, official name) 2399 — readback 0 diffs. Excluded: Oceans, Miller & Lux, Riley's. eins44 (2400, Berlin 44) and Café Carmellini (2401, NY 51) then added as Fine dining on Ulrik's instruction; 3rd Cousin ruled Fine dining and not added. Marrakech keeps the EUR 100 gate.

**San Francisco inserted 2026-10-05:** ids 2376–2385 (ranks 37–46), readback 0 diffs. Flags for Ulrik: Miller & Lux, 3rd Cousin (restaurants/flagged/san-francisco-review-2026-10-05.md). Aziza's real site is azizasf.com (aziza-sf.com is a fan site).

**Vancouver inserted 2026-10-05:** Suyo id 2386 (rank 36), readback 0 diffs — inserted on Ulrik's confirm BEFORE the Michelin Vancouver 2026 selection (announced 2026-10-06). TODO: check the 2026 list; if Suyo got a star it must become Fine dining (needs Ulrik's "edit"); also check newly listed $$$/$$$$ places. Riley's flagged (single source, brand-wide insta).

**Miami beach clubs inserted 2026-10-05:** Joia Beach 2387 (36), Nikki Beach Miami Beach 2388 (37), readback 0 diffs.

**Dubai beach clubs inserted 2026-10-05:** DRIFT 2389 (36), Tagomago 2390 (37), Sirene by GAIA 2391 (38), readback 0 diffs. KYMA, Nikki Beach Dubai, La Plage not included (Ulrik). Later-pass list in the Dubai decisions file.

**Doha beach clubs (2026-10-05):** nothing qualifies; SUSHISAMBA Beach Club excluded by Ulrik (`flagged/doha-beach-clubs-review-2026-10-05.md`, scratchpad `doh/insert-doh.json`). Bagatelle Beach Doha closed permanently.

**Remaining:** none of the city/beach-club passes; open items are the Michelin 2026 Vancouver recheck, and committing oltra-agents.

**Why:** the scratchpad helpers (directus-insert/readback/validate/places/brave/sitecheck .mjs) are session-scoped; a new session must recreate them from the handover's §8a pattern.
**How to apply:** start a new city from the handover method; nothing in oltra-agents is committed without Ulrik's instruction (2026-10-04 work committed as 4365a44, 2026-10-05 work as 9c813dd + f1734e8 + e479b78; tree clean). Related: [[project_restaurant_contact_check]], [[feedback_contact_field_rules]], [[project_oltra_agents_split]].
