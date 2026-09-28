---
name: feedback_check_tab_visibility
description: "Before trusting Chrome UI-test results, check document.visibilityState — a hidden tab throttles timers and drops CDP clicks/typing"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 000ac8af-1424-4df4-84d4-6bb997564295
  modified: 2026-09-28T19:34:53.469Z
---

Check `document.visibilityState` (and `document.hasFocus()`) at the start of any Claude-in-Chrome UI test. On 2026-09-28 the test tab was **hidden** for a whole session: timers were throttled so short polling scripts hit the 45s CDP timeout ("renderer frozen"), and real CDP clicks and typing were silently dropped — which produced several false findings ("lost clicks", "Ask AI does nothing", "page freezes").

**Why:** a background tab looks like an app bug from the outside; it cost a round of investigation and a code change based partly on artefacts.

**How to apply:** if hidden, either ask Ulrik to bring the Chrome window to the front, or drive the page with scripted `element.click()` / native value setter + `input` event and read state directly, and don't judge timing, animation or rendering (maps render blank too). Complements [[feedback_drive_the_ui_with_real_events]] — real events are only reliable in a visible tab.
