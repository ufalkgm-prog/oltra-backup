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


### The 2026-09-10 session — five silent failures

Every one of these passed `tsc`, lint and a build, and four were invisible on screen. The session began with a question about an *answer*, not an error: four hotels for a family ski trip, where most of the Alps roster fits.

**The narrowing was accidental, and it was three separate cuts.** 853 published → 53 by tag filter → 40 by `MAX_HOTEL_CANDIDATES` → 4 by the model. The middle cut was the damaging one: sorted by `-ext_points`, it removed the 13 least-decorated, of which 8 carried `Family`. The user's own hypothesis — that `activities: ["Skiing","Family"]` had over-filtered — was wrong; tags OR within a field, so `Family` *widened* it. **Read `filterHotelsByTags` before believing a filter narrowed something.**

**A second cap nobody remembered.** `/api/ai/hotels` declared its own `MAX_IDS = 40`. It matched the tool's cap by coincidence, so raising one truncated a 67-hotel answer to 40 cards with no error, no warning, and a framing line confidently saying "All 67". Two constants that must agree, agreeing by luck, is the same shape as `CARD_LIMIT` in §33.

**The panel rendered the previous answer under the new framing.** `useAiResultRecords` kept `records` while a new id list loaded, and the "Gathering those…" guard only fires when `hotels.length` is 0 — which it wasn't, because the stale set was still there. So "All 67 Italian properties" appeared over a list of Alpine ski hotels, with their old rationales still attached, looking entirely deliberate. Rationales are keyed by id, which is what made it convincing. Now `setRecords(EMPTY)` before the fetch.

**Three numbers, and the model quoted whichever it liked.** One run said "Thirty-nine Alpine properties" while passing 20 ids of which 10 were bookable. An earlier run had got it right by luck. The prompt had never said which number goes in the framing — it said to name the picks and to state a total, without connecting either to `hotelIds.length`.

**`didYouMean` returned empty for the exact case it exists for.** The scorer did exact match, containment and whole-word overlap; "Tirol" against "South Tyrol" scores zero on all three, one letter apart. Bounded Levenshtein added. The model recovered anyway by guessing `country: "Austria"` — **a feature can fail completely while the answer still looks fine**, which is why the store, not the screenshot, is the evidence.

**And one introduced mid-session:** removing invented dates left the footnote still promising "all with prices and availability" when no `stay` is passed and the cards render blank. Caught by reading the store after the fix, not before.

### Reading the store is the whole technique

`JSON.parse(sessionStorage.getItem("oltra_ai_concierge_v1"))` distinguishes, every time, between "the model chose differently" and "the code dropped it" — which look identical on screen. In this session it produced:

* `matched: 53, returned: 40, truncated: true` — proving the cap, not the filter, was the cut.
* `{"macroRegion":"The Alps", …} matched=39` in **one** call where there had been two.
* `tooBroadToShow: true, matched: 67, availableForTheseDates: 30` with `narrowBy` counts that then matched Directus exactly — proving the model quoted the tool rather than inventing plausible numbers.
* `stay=undefined` on turn one and `2027-07-01` on turn two, proving the date rule held while stale dates sat in the form.

**Verify counts against Directus, not against plausibility.** Every figure the model quoted was checked with a throwaway script: Italy 67, Amalfi Coast 6, Lake Como 5 — all exact. That check is what would have caught an invented number, and it is cheap.

### The date feedback loop

Worth understanding because it makes a guess look like consent. `AiResultsSync` writes the answer's dates into the URL; `LandingSearchPanel` reads its controls into page context; page context is a **system block**, the highest-trust position in the request. So a date the concierge invented on turn one arrives on turn three indistinguishable from something the visitor typed — and the prompt's "say which dates you used" made it *sound* deliberate.

The fix is wording, not plumbing: page context says "filled into the search form" rather than "for", and the prompt treats form dates as an offer. The loop itself is intentional (§8, URL-driven state) and was not changed.

### Macro-regions were built from the data, not from memory

Every value in `macroRegions.ts` was validated against the live collection before shipping: all 18 resolve non-empty, and the Mediterranean was checked not to contain Paris. The checks that shaped the design:

* Alpine admin regions alone return Munich, Lausanne and Vevey; `+ Mountains` returns exactly the right 44 (Savoie 12/12, Graubünden 6/6, Valais 5/5).
* The Mediterranean by country would file Paris and Biarritz as Mediterranean, and Spain would bring in the Atlantic Canaries — so it is admin-regions for the big countries, whole-country only for Greece, Cyprus, Malta, Monaco and Montenegro. Resolves to 129, zero of them Île-de-France.
* 17 values match nothing today and are kept deliberately. Austria's admin regions here are Vorarlberg, Vienna and Salzburg — so "Tyrol" is a real absence, not a typo, and the USA's contain no Idaho.

Re-run that validation after any roster expansion: a macro-region silently narrowing is exactly the §26 country-map failure in a new place.

### Two findings from reviewing a finished answer (2026-09-10)

Both came from Ulrik reading an answer that looked entirely fine — a Venice → Tuscany → Rome trip, 18 properties, well written. Neither would have surfaced from a screenshot.

**"Are these exhaustive?"** Venice 6/6 and Rome 10/10 were complete; **Tuscany found 2 of 10**. The model had searched `area: "Tuscany"`, and only two rows carry that in `state_province_county_island` — the six Florence hotels leave it null (§3), and Il Pellicano and Principe Forte dei Marmi hold their own sub-areas (`Monte Argentario`, `Versilia`).

This was the *same* `area`-vs-`admin_region` gap found an hour earlier in the `narrowBy` facets, where the fix was to make the payload **report** its coverage. That fix was too narrow: it made the broad-set path honest and left the ordinary geography path silently missing 80% of a region. **A gap found in one code path is worth checking in every path that reads the same field.**

After widening, the same query searched Tuscany with `Countryside`/`Hillside` and returned 3 — the pool complete at 10, the narrowing now a stated editorial choice rather than an accident, and Collegio alla Querce (previously invisible) among the picks.

**"What does 'an open jaw' mean — is that slang?"** It is airline trade jargon, and it was in a tool description: `returnDate` read "leave unset on the legs of an open jaw". Eight other occurrences are code comments, which the model never sees and where the precise term is correct — so the leak was one string. Worth grepping the prose the model actually receives (`SYSTEM_PROMPT` plus every `description:` in `tools.ts`) separately from the comments around them.

**And a self-inflicted one worth recording.** The first exhaustiveness check reported all 18 as missing, because it built `new Set([1479, …])` of numbers and compared against Directus ids, which come back as **strings** (§44). The script ran clean and told me nothing — the same shape §44 warns about, hit while verifying something else. `Number(h.id)` on both sides.

### "How do I get there" — the arrival airport is not the journey (2026-09-11)

Asked how to reach the Masai Mara, the concierge named Nairobi and stopped. It
said nothing about the road transfer to **Wilson** or the light aircraft into
the reserve — which is the half a guest actually has to arrange. It was not
being careless: `cityAirports.ts` told it NBO, 214km, and nothing else exists.

`src/lib/transferRoutes.ts` now holds the arrival-to-door route per
DESTINATION, and `nearestAirport` returns it as a `transfer` field.

**The two sources disagree on purpose, and that is the thing to understand
before editing either.** `cityAirports.ts` deliberately EXCLUDES the Mara lodge
airstrip (`MRE`) and North Caicos (`NCA`), because an airport there has to be
one an international ticket can be priced to. `transferRoutes.ts` is the
opposite — the airstrip is where the final leg lands. Don't reconcile them.

**The invariant, which the first draft broke on four entries:** `arriveAt` is
always an airport `CITY_AIRPORTS` lists for the same key, because that is what
a flight card prices to. Sabi Sand was written `arriveAt: "JNB"` with a hop to
Skukuza — so the concierge would have said "fly into Johannesburg" while the
card beside it priced Skukuza. Connecting through a hub is ordinary routing the
flight search already shows; it belongs in `note`, never in `legs`. **`legs` is
strictly what happens after you land on the ticket.** Caught by a key-and-
arrival check, not by reading the table.

**The negative entries matter as much as the positive ones.** Volcanoes
National Park, Kinigi and Ruhengeri record "by road from Kigali — there is no
onward flight". Without a row the model is free to invent a hop, and a guest
waiting for a plane that does not exist is the failure this table exists to
prevent.

**`transfer: null` is structural, not a prompt promise** — the same shape as
the broad-set gate. The model is handed nothing rather than asked not to guess,
because this file's own record is that prompt-only rules of that shape get
skipped. The prompt says: for a city, answer normally; for anywhere reached by
boat, light aircraft or a long drive, say you will confirm the transfer rather
than describe one.

**IT DID NOT WORK ON THE FIRST TRY, AND THE REASON IS THE REUSABLE PART.** The
data was right, the tool returned it, and the concierge still hedged: *"the
light aircraft usually leaves from a different Nairobi field... let me confirm
the exact transfer."* A temporary `console.log` in the tool's `execute` settled
it in one line — **`nearestAirport` was never called at all.** The model knew
enough about Nairobi to answer unaided and did.

Two things that misled me before the log, both worth remembering. Its answer
said "about 215 km", which matches our stored 214km closely enough that I read
it as proof the tool had fired; Nairobi–Mara simply *is* about that far, so the
number was coincidence. And the hedging itself looked like the new
`transfer: null` branch working, when it was just the model being careful.
**Neither the figures in an answer nor its tone tell you whether a tool ran.**

The fix was to make the call obligatory rather than available — the prompt said
what to do *with* `transfer`, never that it must fetch it, which is this file's
oldest lesson restated: an optional step the prompt does not demand gets
skipped. The tool description now says REQUIRED and that the model's own
knowledge is not a substitute; the prompt says call it before writing anything,
and names the reason (your knowledge is not specific to this property and
cannot know which field a light aircraft leaves from this season).

The parameter description changed too, and it mattered: it read "Exact myOLTRA
city name", but eight wilderness lodges have no city (§3) and the key is their
traveller area. It now says "a city or a traveller area". Asked about **Angama
Mara**, the model then passed **"Masai Mara"** — the log confirms
`route=FOUND NBO` — so it resolved a hotel name to the right destination key
unaided.

Verified in the browser across three shapes: **Masai Mara** names Wilson as a
separate airport and credits the camp with the last leg; **St Barthélemy**, which
has no entry, says it will confirm the routing rather than guess which link is
running and pivots to the four properties; **Paris** gives the ordinary answer,
CDG with the RER B and Orly, without over-hedging.

**48 routes as of 2026-09-11** — the Kenyan and Rwandan reserves, Okavango,
Sabi Sand and Kruger, Phinda, and the island hops: 20 Maldivian resorts, St
Barthélemy, Praslin and North Island, Canouan, the BVI private islands, Con
Dao, Sumba, Arenal, Bora Bora, Lanai, Desroches, Gisakura.

**The Maldives are a helper, not twenty literals** (`maldives(iata, label)`), so
a reviewer checks the shape once and then only the codes. And what it
deliberately does NOT claim per resort is the point: whether the final leg is a
seaplane from Malé or a domestic flight plus speedboat varies by resort and
season, so the note says both and leaves the resort to confirm. Guessing it
per property is the invention this file exists to stop.

### The model does not know our destination keys, and cannot be expected to

Asked "how do I reach Soneva Fushi?" it called the tool once with
`city: "Soneva Fushi"` and got nothing — the key is **"Kunfunadhoo Island"**.
Angama Mara had worked only by luck: its key is "Masai Mara", a name famous
enough to guess. Nobody guesses Kunfunadhoo.

Telling the model to look the city up first would be another optional step, and
this file's record is that those get skipped. So **the tool resolves it
server-side**: if the name matches no destination, it is tried as a hotel name
and that hotel's own `city` — or its traveller area, for the eight lodges with
no city (§3) — is used instead, reported back as `resolvedFrom`. Verified:
`asked="Soneva Fushi" matches=1 city="Kunfunadhoo Island"`, and the answer then
came back as the Maldives note verbatim.

### A stale conclusion in the transcript outlives the fix

Worth knowing when testing any of this. After the pre-fix turns where it had
said "I don't have the routing for Soneva Fushi", it kept refusing across three
more attempts — *"asking again doesn't change what I have"* — and the log shows
**it stopped calling the tool at all**, 5.2s round trips with no tool line. It
was reasoning from its own earlier answer in the transcript, not from the data.
One of those refusals even claimed "that last attempt landed in South Africa",
which no tool call supports.

Two consequences. **Test a fix in a fresh conversation** — CLEAR first, or you
are measuring the transcript rather than the code. And **the model's account of
what it just did is not evidence**: it also claimed earlier to have "asked again
under the resort's own name and under the atoll" when the log shows a single
call. Only the log settles it.

**Candidate list still open** — 10
destinations where we name a distant gateway and nothing else, ~93 where no
jet-capable airport is listed at all (partly noise: Florence, Mykonos and
Santorini are real international arrivals with short runways). See §51.

### The closing question lost its italic when it was not the last thing said

`AgentText` decided which line was the closing question with
`line.endsWith("?")`. The model routinely asks and then adds a short
instruction — *"Shall I price the Copenhagen–Nairobi flights? Tell me when
you're going."* — so the `?` sits mid-line and detection failed. Because
`.closingQuestion` carries both the italic and the `0.9rem` break, one missed
match lost both, and the question sat tight under the answer reading as one
more sentence of it: exactly what the styling exists to prevent.

Now **contains** a question mark, with a length cap so a long final paragraph
that happens to contain one is not set entirely in italic. Diagnosed by reading
`getComputedStyle` on the live element — `class=""`, `fontStyle=normal`,
`marginTop=0px` — which said in one line that the class was never applied,
rather than that the CSS was losing.

### Turin for Val d'Isère: a straight line crosses the Alps, a road does not

Reported live. Asked how to reach Val d'Isère the concierge said **Turin** —
because Turin is 59km away as the crow flies. The crow does not use the Fréjus
tunnel. Geneva is 111km and about three hours by road, which is why everyone
actually flies there, and Ulrik's own search confirmed it.

Not one row. Checking all 68 Alpine destinations found the same fault
repeatedly, always the same shape: **a small regional field wins on distance and
the major hub every guest uses is absent from the list altogether.** Zermatt was
the starkest — Milan, Lugano and Turin, not one Swiss airport. Twelve
destinations got a `GATEWAY_OVERRIDE`.

**It is not "always pick Geneva", and the counter-example is the proof:**
Cervinia keeps **Turin**, because Cervinia is in the Aosta Valley on the Italian
side and Turin genuinely is its gateway. Chamonix, Megève and Andermatt already
listed their hub and were left alone.

**Then the ordering bit back.** Overridden entries are ordered by usefulness,
not distance — Geneva ahead of Chambéry even though Chambéry is closer, because
Chambéry is largely winter charter. The model read position one as nearest and
wrote *"Geneva … the closest of the three at around 111 km"*, then contradicted
itself one clause later with *"CMF nearer at 88 km"*. Fixed at the source rather
than by reordering: the tool description now says `airports` is **best-first,
not nearest-first**, that `distKm` is straight-line, and that a mountain road is
far longer than the line across it. Reordering by distance instead would have
made `pickPrimaryAirportForCity` — which favours the longest runway — answer
**Lyon**, which is worse.

**Val d'Isère then got a transfer route too**, and it is a NEGATIVE one of the
useful kind: no second airport, no onward flight, you land at Geneva and drive
about three hours up the Tarentaise, roughly 175km. That is the other half of
the Turin fix — the override moved the arrival airport, but without the route
the answer still ended at "fly to Geneva, I'll confirm the transfer", on the
least mysterious leg of the journey.

`arrangedByHotel` is deliberately unset there. Unlike a safari camp, a
Tarentaise transfer is as often a shared shuttle or a car the guest books as
something the hotel handles, so claiming the hotel arranges it would be wrong
for half the properties. **Chambéry and Lyon stay in the airport list and out of
the route**, because this file answers "how do I get there from the airport",
not "which airport" — holding that choice in two places is how the two drift
apart.

**Third sighting of the stale transcript.** The first two post-fix answers still
said Turin, quoting "about 59 km", our *old* stored value. It was not a stale
module: the conversation already contained Turin, and the model elaborated on
itself. CLEAR, and it answered Geneva immediately. Same lesson as Soneva Fushi
— **test in a fresh conversation or you are measuring the transcript.**

### It denied real inventory, and the cause was a missing parameter

Found while testing the Courchevel transfer routes. Asked "how do we get to
Cheval Blanc Courchevel, and to La Bouitte?" the concierge opened with
**"Neither Cheval Blanc nor La Bouitte is in the myOLTRA collection"**. Both
are — ids 1322 and 1347.

`searchHotels` had **no name parameter at all**: geography and character only.
So "is X in the collection?" was a question the tool could not be asked. The
model did the only thing available, searched `city: "Courchevel"`, got the one
property filed under that exact value, and concluded the rest were not ours.

**A data split made it certain rather than merely likely.** Cheval Blanc's city
is **"Courchevel 1850"** — a different city value for the same resort, with
eight hotels under it against Courchevel's one. A city search could never have
found it, however the model phrased the query.

`name` now exists, filtering `hotel_name` with `_icontains`, and the tool
description says geography is the wrong instrument for that question and never
to call a named property outside the collection without having searched its
name. After the fix: *"We have both — Cheval Blanc in Courchevel 1850 and La
Bouitte above Saint-Martin-de-Belleville"*, each with its Geneva route, and
Cheval Blanc correctly flagged as not bookable here.

**Denying real inventory deserves to sit above the other failures in this
file.** Naming a hotel we do not have is embarrassing; telling a guest we
cannot offer one we can loses the booking and reads as incompetence. It also
went unnoticed through every earlier test, because every one of those asked
about a destination rather than a property by name.

**Still open, and a data question rather than a code one:** Courchevel and
Courchevel 1850 are two `city` values for one resort, which is why the eight
1850 properties and Rosewood never appear in the same search. Merging them
would touch `cityAirports.ts` and the `local_area` work; splitting the
difference is what the `name` search now papers over.
