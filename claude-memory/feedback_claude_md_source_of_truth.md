---
name: feedback-claude-md-source-of-truth
description: "Project context is CLAUDE.md (loaded every session) plus five path-scoped .claude/rules/ files, with CLAUDE-AI.md and CLAUDE-ARCHIVE.md on demand. Keep content in whichever one owns it."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 8abe7555-4684-42d1-98a0-2cac8a8ca1fe
  modified: 2026-09-12T16:47:47.388Z
---

Project context lives in four places, split by **when it is needed** rather than
by topic:

* `CLAUDE.md` — the map, and rules breakable before any file is opened. Loaded
  every session; keep it short enough to read in full (a few hundred lines).
* `.claude/rules/*.md` — five files, each with `paths:` frontmatter, loaded
  automatically when Claude reads a file they cover: `hotel-data.md` (§3, §4,
  §42B), `airports-and-flights.md` (§7B, §51, §52), `etg-ratehawk.md` (§32, §42,
  §47, §48), `concierge.md` (§50), `design-system.md` (§35).
* `CLAUDE-AI.md` — concierge mechanics and bug log, on demand.
* `CLAUDE-ARCHIVE.md` — completed work, on demand.

Section numbers are global; every moved section leaves a one-line pointer in
CLAUDE.md, so every `§N` reference still resolves.

**Why:** the file reached 1,771 lines and 144k characters, and the 150,000-char
ceiling it claimed to be fighting **does not exist** — checked against Claude
Code's docs 2026-09-12, the real limit is 4 MiB and a larger file is skipped
entirely. The genuine cost is adherence: the docs target under 200 lines because
a long file *reduces* instruction-following, which is the same effect §50 had
already measured inside the concierge's own prompt. Ulrik approved the split
after that was established.

**How to apply:** put detail in the rule file whose paths govern it, not in
another screen of CLAUDE.md. A rule loads when Claude READS a matching file, so
for planning or a question that starts before any file is open, read the rule
file directly — the CLAUDE.md pointer names it. Three pointers (§32 BLOCKED
bookings, §50 no-prices, §51 run both audits) carry their headline inline
because those can be broken before any covered file is opened. Re-sync
`claude-memory/` after a session that changes how Claude should work. See
[[project_ratehawk_integration]].
