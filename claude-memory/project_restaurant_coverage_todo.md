---
name: restaurant-coverage-todo
description: Restaurant cities Ulrik wants added — Reykjavik has hotels but no restaurants; relaxed options to be added for large cities
metadata: 
  node_type: memory
  type: project
  originSessionId: 630d0a83-c8d7-41b7-b9a0-32e95b4da724
  modified: 2026-09-15T19:07:35.378Z
---

Open data tasks for the restaurants collection, raised during concierge testing on 2026-09-15:

- **Reykjavik**: we hold The Reykjavik EDITION but no restaurants, so the concierge can only say "we don't cover restaurants in Reykjavik yet". Ulrik: "we need to find a few restaurants in Reykjavik".
- **Relaxed restaurants in larger cities**: Ulrik will add more non-starred ("relaxed") restaurants for all larger cities, because the concierge now suggests two starred and two relaxed per city, and in London the relaxed pair came from Soho rather than near Hyde Park.

**Why:** the concierge may only name restaurants we hold, so coverage gaps show directly in answers.

**How to apply:** new restaurant records are researched and staged in oltra-agents, not here ([[project_oltra_agents_split]]); raise these when restaurant data work comes up, and do not generate content without checking oltra-agents first.
