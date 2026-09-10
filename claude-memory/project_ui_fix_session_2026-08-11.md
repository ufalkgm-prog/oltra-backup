---
name: project-ui-fix-session-2026-08-11
description: "2026-08-11 landing/hotels/flights UI fix session — rollback map lives in CLAUDE.md §33, not here"
metadata: 
  node_type: memory
  type: project
  originSessionId: cb435996-82d6-4ade-b533-ea111ba700f3
  modified: 2026-08-11T21:37:03.945Z
---

Two commits landed 2026-08-11, both pushed to `main`: `c507f57` (landing page
header/limit/date-format/availability-auto-refresh fixes across
landing+hotels+flights) and `799e614` (Hotels page: passport-country UI
de-emphasized, results-pane squeeze fixed, Ritz Paris thumbnail lazy-load
bug, taxonomy-filter optimistic-update fix).

**Why this memory is just a pointer, not the detail**: per
[[feedback-claude-md-source-of-truth]], this project keeps all substantive
change history inline in CLAUDE.md, not in separate docs. The full rollback
map — exact files, what each fix changed, and known tradeoffs/risks per
item (e.g. nested scrollbars in the left pane, `loading="lazy"` removed
from one thumbnail grid, `RelDropdown`'s optimistic local state and how it
self-heals) — is in **CLAUDE.md §33**.

**How to apply:** if something from this session needs rolling back, read
§33 first — it's written specifically as a per-fix revert guide. Don't
re-derive intent from `git diff` alone before checking there.
