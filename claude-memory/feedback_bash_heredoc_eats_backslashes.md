---
name: feedback-bash-heredoc-eats-backslashes
description: "Bash heredocs in this environment collapse one level of backslashes even when quoted, so write patch scripts to a file instead"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 8abe7555-4684-42d1-98a0-2cac8a8ca1fe
  modified: 2026-09-12T15:20:29.104Z
---

In this environment a Bash heredoc mangles backslashes even in the quoted form
(`<<'PY'`, `<<'EOF'`): one level is stripped before the shell writes the body. So
`"\\n"` intended as a literal backslash-n arrives as a real newline, and a regex
like `/[^"\\]/` arrives as `/[^"\]/` and fails to parse. A long heredoc can also
die with "unexpected EOF while looking for matching `''`" for no visible reason.

**Why:** it cost two debugging cycles in the 2026-09-12 airport session —
generated JavaScript with literal newlines inside string literals, and a probe
script that would not parse — each looking like a logic bug rather than a
transport one.

**How to apply:** for anything containing backslashes, quotes or more than a few
lines, use the Write tool to put the script in the scratchpad directory (or the
project, if it is a real deliverable) and run it by path. Reserve heredocs for
short, backslash-free bodies. If a heredoc-written file misbehaves, check the
file on disk with `cat -A` before suspecting the code. See
[[feedback-diagnose-before-fixing]].
