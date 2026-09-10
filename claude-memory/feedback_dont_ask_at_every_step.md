---
name: feedback-dont-ask-at-every-step
description: Carry a task through its implied follow-through steps without asking for confirmation at each one
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 07870f2b-2429-4f9b-92e6-5ac1441a5ee8
  modified: 2026-08-16T13:54:55.168Z
---

Once Ulrik has said to do something, carry it through its obvious
follow-on steps without stopping to confirm each one. Merging a PR
implies deleting the merged branch; "work on a branch and open a PR"
implies the branch gets merged when the work is approved; a branch
protection rule that blocks the merge is an obstacle to report *and
route around*, not a new decision to escalate.

**Why:** on 2026-08-16 Ulrik pushed back — "why am I asked about this
all the time?" — after being asked separately to merge a PR, then to
use `--admin` when protection blocked it, then to delete the branch,
then to merge a second branch. Each question was individually
defensible; the sequence was not.

**Standing authorisation, given 2026-08-16:** merge PRs without asking.
Branch → PR → merge (with `--admin`, since `main` requires a review that
the PR author cannot supply) → delete the merged branch is one motion,
not four decisions. "Work on a branch and open a PR" still holds — it is
about not committing straight to `main`, not about pausing before each
merge.

**How to apply:** ask when the *answer changes what gets built* (scope,
vocabulary, which of two readings is meant, whether to write live data).
Do not ask for permission to complete a step already implied by an
instruction Ulrik has given. If a step is one-way and consequential
(writing to Directus, deleting data), still confirm — that is a
different thing from procedural ceremony. See
[[feedback-diagnose-before-fixing]] for the related rule on verifying
rather than asking.

A specific trap to avoid repeating: if a suggestion of mine changes the
shape of what Ulrik expects to happen — e.g. rebasing a branch onto main
silently dropped two commits he assumed were coming along — say so
plainly at the time, rather than letting it surface later as "I thought
you already did this."
