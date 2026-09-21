---
name: feedback-drive-the-ui-with-real-events
description: "When testing UI behaviour, use real mouse and keyboard events; programmatic click/scroll produces false findings"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 113be546-0d38-4348-be9c-ff9b034556a4
  modified: 2026-09-21T21:03:40.924Z
---

When testing UI behaviour in the browser, drive it with **real** input — the `computer` tool's clicks and keypresses — and use JavaScript only to *measure* afterwards.

**Why:** three of eleven findings in the 2026-09-21 sweep were artefacts of driving the page with JS, and each was nearly "fixed" as a real bug.

- `element.click()` fires `click` but **not `mousedown`**. `useDropdownDismiss` closes on `mousedown`, so programmatic clicks left every dropdown open and produced a "dropdowns don't close each other" finding that does not exist.
- `window.scrollTo` moves the *document*. On pages where the scroll container is `main.oltra-page` (Hotels, landing) it does nothing, which produced a "cannot scroll to content" finding when the content was perfectly reachable.
- A geometric audit (`scrollWidth > clientWidth`, overlapping rects) flags decorative and flex-shrunk elements. `LandingBackground` is a fixed `pointer-events:none` layer whose children overflow **by design**; a one-character select value reports 18px "lost" and renders in full. Confirm with `elementFromPoint` or a zoomed screenshot before reporting.

Everything reproduced with the mouse held up. See [[feedback-diagnose-before-fixing]] — same principle, UI side.

Also from that session: **never run `npm run build` while `npm run dev` is up.** They share `.next`, and the build leaves the dev server serving a broken app — no client JS, no prices, header stuck on the default currency. It looks exactly like a regression in whatever you just changed. Stop the dev server, `rm -rf .next`, restart. A stale-chunk `ChunkLoadError` after edits is the same family and clears on a reload.

## A geometric sweep only tests the content that happens to be on screen

Added 2026-09-21, and it is the sharpest lesson of that session. A full
clean sweep across six pages and six widths reported the Flights page fixed.
It was not: selecting a **long-haul** flight showed `19:00 → 08:10 +1 ·
13h 10m · ALLIANCE PARTNER` cut by 12px **at 1440**. Every earlier pass had a
short itinerary pinned, so the widest possible row never rendered.

**So vary the CONTENT as well as the viewport.** Before believing a layout is
clean, ask what the longest, widest, most-decorated instance of each component
would be, and put it on screen. Where that is awkward, compute capacity
instead: sum the children's widths plus gaps plus padding against
`clientWidth`, and substitute the longest value that exists in the data.

Also from that session, on the audit itself. `scrollWidth > clientWidth` is a
proxy that lies in four ways, and each cost a false finding:

- an element **scrolled below the fold of its own scroll container** is not
  obstructed — intersect with every clipping ancestor before hit-testing;
- a hidden hover overlay (`opacity: 0`, `pointer-events: none`) inflates its
  parent's `scrollWidth` while nothing is cut;
- content passes **under a fixed header** whenever the page is scrolled, which
  is the header working — test at `scrollTop = 0`, where content under it is a
  genuine reservation bug;
- **map pins overlap each other and sit outside the viewport** by design.

Measure a real cut instead: on a box that clips, check whether a descendant's
painted rect actually crosses its edge. Keep `scrollWidth` only for leaves and
inputs, which have no descendant rect to measure.
