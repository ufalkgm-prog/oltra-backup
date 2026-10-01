---
name: feedback-js-replace-dollar-patterns
description: "Patch scripts using String.replace(a, b) corrupt files when b contains $` $' $& — use split/join or a function replacer"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 0478c4ca-a156-4ba9-afd6-8f5f81fcd1ce
  modified: 2026-10-01T10:52:12.737Z
---

When patching a file with a throwaway `node -e` script, `s.replace(anchor, replacement)` interprets `$\``, `$'`, `$&` and `$1` inside the *replacement string*. On 2026-10-01 a replacement containing the regex text `(.*)$\`` pasted the whole file prefix into the middle of a script (it still looked plausible until grep showed duplicated imports).

**Why:** JS special replacement patterns apply to any string replacement, and code containing regexes or template literals hits them easily.

**How to apply:** in patch scripts use `s.split(anchor).join(replacement)` (after asserting the anchor occurs exactly once) or `s.replace(anchor, () => replacement)`; or use the Edit tool. After any scripted patch, `node --check` and grep for duplicated header lines. Related: [[feedback-bash-heredoc-eats-backslashes]].
