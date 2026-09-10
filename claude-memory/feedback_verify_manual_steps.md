---
name: feedback_verify_manual_steps
description: "When Ulrik runs a manual step you handed him (SQL, dashboard change), verify the result yourself with a read-only probe before building on it"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 29e17a6d-07ff-4fda-bfdd-ab61a18533e7
  modified: 2026-08-17T16:03:29.023Z
---

A "done, I ran it" report is a starting point for verification, not proof. On
2026-08-17 a Supabase migration was reported as run twice and had not been
applied either time — first the wrong project/paste (nothing ran), then the
wrong SQL entirely (the older §30 snippet was still in the editor).

**Why:** manual dashboard steps fail silently in ways the person running them
cannot see. The SQL Editor runs only the selected text, and a stale paste looks
identical to a fresh one. Meanwhile the app code had already shipped the
columns, so every failed attempt left saving broken.

**How to apply:** after handing over any manual step, probe the result directly
(for Supabase: a PostgREST `select=` on each new column — a missing column
returns Postgres `42703`, while a stale schema cache returns `PGRST204`, so the
two are distinguishable). Report the actual state, not the reported one. When
writing the SQL, prefer forms that are safe to re-run and whose failure modes
identify themselves — `add column if not exists` cannot raise `42701`, so that
error proves the wrong script is loaded.

Related: [[feedback_diagnose_before_fixing]], [[project_ratehawk_integration]].
