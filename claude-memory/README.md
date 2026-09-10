# Claude memory — backup copy

**This is a copy, not the live files.** Nothing here is read at session start.

The live memory lives outside the repo, on one machine only:

```
C:\Users\ufalk\.claude\projects\C--Users-ufalk-dev-oltra-beta\memory\
```

That directory is where Claude actually reads and writes. It is not in git, not
in `oltra-backup`, and not synced anywhere — so until this copy existed, a disk
failure would have taken every standing instruction with it. That is the only
reason this folder is here.

## What it holds

Nine files: `MEMORY.md` is the index loaded each session, one line per memory,
and the rest are one fact each — who Ulrik is, corrections he has given, and
project context not derivable from the code. No credentials; checked before
committing, and worth re-checking before any future sync.

## Restoring

Copy the files back and Claude picks them up on the next session:

```bash
cp claude-memory/*.md "/c/Users/ufalk/.claude/projects/C--Users-ufalk-dev-oltra-beta/memory/"
```

## Re-syncing — this copy goes stale

Memory is written during sessions, so this folder drifts the moment anything is
learned or corrected. **A stale backup that looks current is worse than none**,
because it invites restoring an old instruction over a newer one. To refresh:

```bash
cp "/c/Users/ufalk/.claude/projects/C--Users-ufalk-dev-oltra-beta/memory/"*.md claude-memory/
git status --short claude-memory/
```

If that prints nothing, the copy is current. Run it whenever a session has
changed how Claude should work — the git log for this folder then doubles as a
history of those instructions, which the live directory does not keep.

Copied 2026-09-10, byte-identical to source at that point.
