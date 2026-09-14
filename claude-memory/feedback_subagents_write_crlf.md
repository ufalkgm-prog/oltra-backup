---
name: subagents-write-crlf
description: Subagents editing files on this Windows machine can rewrite whole files with CRLF line endings; normalize to LF before handing work over
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 630d0a83-c8d7-41b7-b9a0-32e95b4da724
  modified: 2026-09-14T10:26:42.244Z
---

On 2026-09-14 four parallel migration subagents left 7 of ~30 edited files converted wholesale to CRLF (the repo is `eol=lf`), which made every line of those files show as changed. Git's "CRLF will be replaced by LF" warning on `git diff --stat` was the only signal.

**Why:** a whole-file line-ending flip hides the real diff from review and would land as a noisy commit.

**How to apply:** after any subagent edits, run `file <changed files> | grep -i crlf` (or watch for the git warning) and strip `\r` from those files before reviewing the diff. Relatedly, [[feedback-bash-heredoc-eats-backslashes]] — write patch scripts with the Write tool, and give `cut`/replace helpers an explicit meaning for an empty end marker.
