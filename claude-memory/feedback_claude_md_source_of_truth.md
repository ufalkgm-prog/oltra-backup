---
name: feedback-claude-md-source-of-truth
description: "Project context is three files — CLAUDE.md (loaded at start), CLAUDE-ARCHIVE.md and CLAUDE-AI.md (read on demand). Keep content inline in whichever file owns it; never invent a fourth."
metadata:
  node_type: memory
  type: feedback
---

Project documentation lives in exactly three files at the repo root, split by
**liveness**, not topic:

* `CLAUDE.md` — rules a session can break by accident today. The only one loaded
  automatically, and capped at 150,000 characters.
* `CLAUDE-ARCHIVE.md` — completed work (22 sections).
* `CLAUDE-AI.md` — the concierge's mechanics and bug log.

Section numbers are global; an archived section leaves a one-line pointer in
CLAUDE.md so every `§N` reference still resolves.

**Why:** the original rule (2026-08-10) was that CLAUDE.md is the single source
of truth and must never point at another doc — "docs/etg-integration-brief.md
should not exist... Don't create a stub." That rule assumed CLAUDE.md *can* hold
everything. By 2026-09-10 it had grown to 304k, was being rejected against the
150k limit, and a 51% compression left only ~800 characters of headroom. The
premise had expired, and Ulrik approved the split explicitly, asking that the AI
material be its own file.

**How to apply:** keep content inline in whichever of the three owns it — still
never split a section out "for length" to a fourth file. Before adding to
CLAUDE.md, check its size in *characters* (`node -e "console.log(require('fs').readFileSync('CLAUDE.md','utf8').length)"`);
`wc -c` overstates it because of accented characters. Past ~140k, move a closed
section to the archive rather than compressing a live one. Read
`CLAUDE-ARCHIVE.md` or `CLAUDE-AI.md` when a task touches their ground — not
being in context makes them something to go and get, not optional. See
[[project_ratehawk_integration]].
