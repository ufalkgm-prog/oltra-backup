---
name: project-oltra-agents-split
description: "New hotel and restaurant content is generated and staged in the sibling oltra-agents repo, not in oltra-beta"
metadata: 
  node_type: memory
  type: project
  originSessionId: 07870f2b-2429-4f9b-92e6-5ac1441a5ee8
  modified: 2026-08-16T12:54:57.958Z
---

`C:\Users\ufalk\dev\oltra-agents` is a sibling checkout to `oltra-beta`.
Data retrieval, content generation and workflow state live there;
`oltra-beta` holds the application code, import scripts and schema
conventions. Staged records sit in
`agents/database-agent/{hotels,restaurants}/{pending,flagged}`.

**Why:** on 2026-08-16 a session was one step from re-researching and
drafting editorial content for 34 brand-delta hotels that had already
been fully staged there the day before. The work looks missing from
inside `oltra-beta` because its inputs are not in `oltra-beta`.

**How to apply:** before generating any hotel or restaurant content,
check `oltra-agents` first. Full detail is in CLAUDE.md §41 (layout,
what is staged, and the import-order gotcha where `ratehawk_hid` lives
in a separate file from the hotel records). `oltra-agents` has its own
stricter CLAUDE.md — read-only by default, protected actions gated on
literal keywords — and forbids copying content between the two repos,
so keep references to it as pointers. See
[[feedback-claude-md-source-of-truth]].
