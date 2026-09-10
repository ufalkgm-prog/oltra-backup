# OLTRA — AI CONCIERGE (design history)

How the concierge is built and what broke while building it. CLAUDE.md §50 keeps
the rules you can violate by accident; this file keeps the mechanics and the bug
log.

**Every defect here passed `tsc`, lint and a build.** They were all silent. If you
are changing the concierge, read this first.

Split out of CLAUDE.md on 2026-09-10, when that file reached the 150,000-character
context limit. Text is moved verbatim; section numbers are unchanged so every
cross-reference in CLAUDE.md still resolves.

---

### Where it mounts, and how members are excluded

`AiSearchProvider` wraps `{children}` in **`src/app/layout.tsx`**, so the store outlives navigation; `children` passes straight through, so pages stay server components.

`AiConciergeRoot` gates the modal on an **exact-path allow-list** in `lib/ai/routes.ts` — `/`, `/hotels`, `/flights`, `/restaurants`, `/inspire`. Everything else gets nothing: members, login, editor, beta-login, partners, `/hotels/[hotelid]`. **An allow-list, not a deny-list** — a deny-list silently admits every route added later, which for a members area is the wrong default. Landing on a non-allowed path also *closes* it rather than hiding it, or `conciergeOpen` stays true behind the members area and the modal reappears unbidden on the way back. The transcript survives either way.

The route is **members-only** (401), so the button appears to signed-out visitors and the panel tells them to sign in.

### Entry, exit, and the modal

One `AiModeButton`, two placements, no toggle — the concierge opens *over* the page, so there is no mode to switch back to.

* **`inline`** — landing and Hotels, via an optional `trailingControl` slot on `StructuredDestinationField`, so the shared component knows nothing about the concierge. The slot sits *inside* the chip box with `margin-left: auto`, so when chips wrap the button follows.
* **`corner`** — Flights, Restaurants, Inspire: **its own row at the top of the frame, in normal flow, NOT an absolute corner.** Each of those frames opens with a full-width control that an absolute button overlapped at some width. A row costs 34px and cannot overlap anything.

Exit is a labelled button, not a bare glyph — the visitor is mid-conversation and needs to know the exchange survives leaving.

The modal reuses the hotel photo lightbox's pattern: `createPortal` to `document.body`, `.oltra-modal-scrim`, `.oltra-modal-panel`, Esc and click-outside. **Portalled for a concrete reason**: `.oltra-page__content` is `position: relative; z-index: 1` and therefore its own stacking context, so a panel inside it can never clear the fixed header however high its z-index (§45). The one addition is **blur** — `--oltra-modal-blur`, on this scrim only, since blurring behind the photo lightbox would blur the photo's own context.

**Scroll containment.** Locking `<body>` alone was not enough: the scrolling element is usually `<html>`, so a wheel over the scrim still moved the page. Both are locked, with `overscroll-behavior: contain` on the scrim and transcript, and the scrollbar's width added back as body padding while the lock holds. Everything is restored on cleanup **including unmount** — a stray `overflow: hidden` on `<html>` would silently freeze the next page.

### The answer, and the in-chat summary

The page behind is blurred, so the answer in the panel is the only readable thing: it names each pick and says why. **It is set as one piece of text**, not a sentence plus a results widget — framing line and picks share one face and size, with small-caps headings and bullets for structure and no container. The face is the site's own sans, upright; the closing question is italic.

**Names come from the same records the cards render from**, never from anything the model wrote, so a name in the summary cannot disagree with the card beside it. The rationale is the model's, via `presentResults`' `rationales`.

The footnote is conditional, which is correctness not polish: only landing and Hotels/Flights actually render the result set behind the modal, so from Inspire or Restaurants "on the cards behind this panel" sent the visitor looking for cards that weren't there.

### Page context

`lib/ai/pageContext.ts` plus `useAiPageContext`. Each page publishes what it already holds — the selected hotel on Hotels, the active city on Restaurants, the route on Flights, the month on Inspire, the form state on landing. **Not persisted** (it describes now, not the conversation) and cleared on unmount, so the previous page's hotel isn't attached to the next question. It travels in the `useChat` request body and becomes a **third system block**, after the date — folding it into `SYSTEM_PROMPT` would invalidate the cached prefix for every user.

**Security note.** It originates in the browser and lands in a system block — the highest-trust position in the request. `sanitisePageContext` whitelists fields by name, strips each to a narrow character set and caps length; what survives cannot express a sentence, let alone a directive. Tool results take the opposite route deliberately: supplier text is genuinely prose, so it is wrapped in `<untrusted-data>` markers rather than scrubbed.

The prompt treats it as a default scope, never a fence: a question naming its own destination overrides the page, and any vertical may be asked from any page.

### Results reach the pages they belong to

One conversation site-wide, in `sessionStorage` under `oltra_ai_concierge_v1`; closing the tab clears it.

* **Landing** reads the store directly and renders one to three frames via `AiResultFrames`. Track count comes from `--ai-frames`, set from the same number that sets each card's density, so the two cannot drift.
* **Hotels and Flights** stay URL-driven (§8). `AiResultsSync` writes the answer into the query string with two rules: **on arrival**, only if the URL is bare — a real search, a bookmark or the concierge's own handoff link must not be overwritten by something the visitor did earlier; **on a new answer while the page is open**, always, because that is a deliberate act happening now. `presentedAt` separates them. `router.replace`, so Back goes where the visitor came from.
* **Restaurants is deliberately NOT synced.** It already resolves its city from the shared cross-page session when it arrives without `?city=`, and the store mirrors the destination into exactly that session. Mounting both would give two effects racing to `router.replace` the same param.
* **Inspire** holds filters in local state and cannot be handed a URL — it sets its own Month and Purpose instead.

`lib/ai/handoff.ts` is the single implementation of every handoff URL, so the modal's link and a frame's button cannot disagree. **The handoff offers one option, chosen by scope**: answer matches the page's subject → "See relevant hotels / flights / restaurants"; wider or about something else → "Go to combined results on main page"; on landing, none — it *is* the combined page. Three links under a conversation is a menu, and the answer has already said what it found.

### Inspire mirrors the query, via `searchTags`

Exiting leaves Inspire showing what was asked. `presentResults` gained **`searchTags`** — the locked setting and activity tags actually searched on, since geography and dates alone cannot express *what kind of trip* it is — and `lib/ai/inspireMirror.ts` maps them to Inspire's five purposes, keyed on `presentedAt` so it applies once per answer and never fights a hand-picked filter. `queryStateToParams` now also emits `settings` and `activities`, so the Hotels handoff arrives with those facets pre-selected.

Two lessons: **adding the field was not enough — the model ignored it**, verified by reading the stored tool input where `searchTags` simply wasn't among the keys. **An optional field the prompt does not demand gets skipped.** And **rule order matters**: a ski hotel is nearly always tagged `Mountains` too, so `ski` is tested first or every ski answer lands on Mountains. An answer fitting none of the five leaves the selector alone.

### Recency: which results the landing page shows

The classic search lives in the URL and the concierge's answer in the store, and **neither can see the other change**. Without arbitration, a classic search after an AI answer left the AI frames on screen and the new search looked ignored. `presentedAt` / `searchedAt` decide; nothing is discarded, so both views stay one action away.

**`markClassicSearch()` is gated on the search actually naming a destination, and that is not a nicety.** `submitted` alone was enough at first, and the landing auto-submit fires on any field change — so a guests-only navigation, or the session restore on mount, counted as a search, displaced a good answer, and rendered nothing in its place because the structured summary needs a destination too. Measured live: `searchedAt` stamped 11 minutes after the answer by a phantom search, hiding 3 hotels, 3 restaurants and a flight leg. **A search that can show nothing must not supersede one that can.**

### The store is three contexts, for a measured reason

`useAiActions()` (setters only, stable), `useAiSearch()` (query, results, framing, timestamps, page context), `useAiConversation()` (the message list).

The conversation persists on **every streamed token**. With the provider at the root, a page component reading the full context would re-render several times a second while the concierge streams, and `HotelsView` is 3,600 lines. Pages read `useAiActions`; frames read `useAiSearch`; only the panel reads the transcript, and anything the header needs is exposed as a scalar — `hasConversation` is a **boolean**, not the message list.

**The results context is memoised on individual fields, not on `state`.** Appending a token replaces `state` but leaves `state.query`/`state.results` identical, so the value keeps its identity. Depending on `state` would undo the whole split silently.

### Card density variants

`HotelSmallCard` and `FlightResultRow` take `columns?: 1 | 2 | 3`; `RestaurantSmallCard` (new) mirrors it. A **density** switch only — same fields, same data, same actions; only image size, track widths and line count change. Default 1, so every pre-existing call site is untouched.

**Nothing in a card may force it wider than its column.** The restaurant card did: a flex pair of a truncating name and a `shrink-0` badge, and **`truncate` cannot shrink a flex child without `min-w-0`** — 413px of content in a 329px box, and a horizontal scrollbar. Wrap, never clip and never overflow; the hotel name is the one exception, capped at two lines with `line-clamp`.

Flight cards are **four lines, always** — route, times, duration, airline, stop line (`via CAN, 8h 20m layover`, or "Direct") — always rendered, so every card is one height and a return pair doesn't go ragged. The route is there because the two cards of a return were otherwise told apart only by their times; the times row is `nowrap`, which is what holds it to four lines.

### What testing taught

**A green `tsc`, lint and build are not evidence this feature works.** Every significant defect passed all three, and the pattern held every time: **the failure was silent.** No exception, no red state, nothing in the console — a request that 400s at validation, a conversation that breaks permanently one turn later, a card with no price, a tool call applied half-streamed, an optional field the model never sends. **Where a value crosses a boundary — model to tool, tool to store, store to card — assume nothing tells you when it fails to arrive, and go and look.**

* **Read the store, not the screenshot**: `JSON.parse(sessionStorage.getItem("oltra_ai_concierge_v1"))`. Its `messages[].parts` hold each tool call's `input`, `state` and `output`, so "the model chose differently" and "the code dropped it" are distinguishable — and they look identical on screen.
* **Measure before optimising latency.** "It feels slow" had a specific shape (four serial round trips, 2.4s of it to emit one sentence) that reading the code would not have revealed, and the plausible culprit — a cache that wasn't hitting — turned out to be fine. Temporary `[perf]` logging with `onStepFinish` gives per-step time, tool names and cache-token counts. Speed went **26.6s → 14.4s** by removing round trips, not tuning them; the only large lever left is `CHAT_MODEL`, which trades against the editorial voice.
* **A helper the model's output feeds into belongs in its own file, testable.** `lib/ai/flightLegs.ts` and `lib/ai/rationale.ts` exist because the model writes a different variant every run, so the only honest way to know a shape is handled is to run it. `stripLeadingName` is the example: a dash pass could not catch `Le Bristol: the city's most complete grand hotel — courtyard garden…`, where the split lands on the LATER dash; a separate colon pass within the first 60 characters, using the same 0.6 token-overlap test, does.

### Bugs worth not repeating

* **One unreachable domain in the web-search allow-list breaks every request** — Anthropic rejects the *whole* request at validation, so a query that would never have searched the web fails too. `cntraveler.com` and `travelandleisure.com` both fail (§25 recorded them as bot-blocked).
* **The route does not trust the history the browser sends.** `sanitiseHistory.ts` strips orphaned tool calls, because the client cannot always avoid persisting one (the loop can stop at `MAX_TOOL_STEPS` mid-call). Without it a conversation breaks *permanently* and reloading doesn't help.
* **Never read a streaming tool input without checking `state`.** `framing` is first in the schema, so it completes while `hotelIds` and `stay` are still absent, giving a framing line with no cards. **And never use a value as a change key when an identity is available** - the guard compared framing text, so once the half-formed version was stored the completed call read as "no change" and was dropped entirely.

### Web search poisoned the conversation — fixed

Web search was the one path never exercised at runtime. It has now been exercised, and it took the feature down again.

**Symptom.** A question triggering Anthropic's server-side search answers fine; every turn after it fails with the generic "I couldn't answer that just now" — so **answering the concierge's own follow-up is what kills the conversation**, and a reload doesn't help, because the history is in sessionStorage.

**Cause.** Web search is a PROVIDER-EXECUTED tool: it returns a `dynamic-tool` part with `providerExecuted: true` and a `srvtoolu_` id — not a call we answer — and replaying it produces a result block with no `server_tool_use` before it. `dropUnansweredToolCalls` cannot catch this: the part **has** its output, it is simply not replayable. **Fix**, in `sanitiseHistory.ts`: `dropProviderExecutedTools`, applied to the UI messages **before** `convertToModelMessages`, where `providerExecuted` is still visible on the part.

**The reasoning goes with it — the first version traded one 400 for another** (`thinking blocks in the latest assistant message cannot be modified`). That turn interleaved reasoning with its tool calls, so removing a block from the middle left thinking that no longer matched what was sent. Reasoning is therefore dropped **only from the messages actually being edited**; a turn we don't touch keeps its thinking and stays valid. Nothing is lost — what the model learned from the search is already in the answer it wrote.

**Verified against the poisoned conversation itself**, not a fresh one: the transcript that had been failing answered its own follow-up correctly. **A fix here has to heal, not just avoid.**

### Home airport

Trips start from the member's home airport. The column has existed since the members area was built and the Flights page has read it since, but the landing page kept its own copy in localStorage and the concierge knew nothing about it — so the same member got three answers to "where do you fly from". `lib/members/useHomeAirport.ts` is now the single reader: an `origin` in the URL or an airport picked in the popover, then the profile, then whatever the browser remembered.

**Two things had to be got right.** The column is free text and has held three shapes — `CPH`, `CPH · Copenhagen Kastrup, DK`, and `Copenhagen (CPH)` — so `readAirportCode` covers all three and refuses anything it cannot read confidently (a bare `[A-Z]{3}` sweep turns "San Francisco" into SAN). And the profile value kept losing to a stale LHR, because the auto-submit writes `origin` into the URL and the searchParams effect reads it back, so a value applied while an older URL was in flight was overwritten by an echo of what it had just replaced. **The effect therefore asserts rather than fills a blank**, with `homeAirport` in its dependencies, and calls `scheduleAutoSubmit()` when it changes the value.

The concierge gets the code in its page context (sanitised as IATA) and the prompt tells it to assume it, say so in one clause, and ask when there is none.

