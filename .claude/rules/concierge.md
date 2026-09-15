---
paths:
  - "**/src/lib/ai/**"
  - "**/src/components/ai/**"
  - "**/src/app/api/chat/**"
  - "**/src/app/AiResultFrames.tsx"
  - "**/src/app/api/ai/**"
---

<!-- Split out of CLAUDE.md on 2026-09-12. The text is moved verbatim and the
     section numbers are unchanged, so every §N cross-reference still resolves.
     This file loads automatically when Claude reads a file matching `paths`
     above; CLAUDE.md keeps a one-line pointer to it for the cases where the
     work starts before any such file is opened. -->

# CONCIERGE

The AI concierge's rules — the structural no-prices guarantee, the tool set, the caps, and the prompt's own failure history. CLAUDE-AI.md holds the mechanics and the bug log; read that too before changing anything here.

---

## 50. THE AI CONCIERGE

**Design history, mechanics and the bug log are in `CLAUDE-AI.md`. Read that file before changing anything in `src/lib/ai` or `src/components/ai` — it carries the failures this feature already had.**

### Status

**On `main` since 2026-09-10** — merged as a fast-forward of the 31 `ai-chat` commits, so the history stays the linear series §14 asks for. `ai-chat` is now a stale pointer at the same commit; work on `main` like everything else.

Behind `NEXT_PUBLIC_AI_CHAT_ENABLED`, **default off**, which is what made merging safe: the flag gates the route, the modal and the entry button, so the code sits on production invisibly until the variable is set. **It is not set on Vercel** — setting it there is a deliberate, separate act, and needs a redeploy because Next inlines it at build time.

It was first built as a *mode* on the landing page behind a Classic/AI toggle; `5622166` made it a modal the whole site can open, and **everything below describes the current design**.

**Local prerequisite that is easy to lose an hour to**: `NEXT_PUBLIC_AI_CHAT_ENABLED=1` is in no committed environment — it goes in `.env.local` by hand. Without it the button doesn't render and `/api/chat` answers 404, which looks exactly like the feature being broken rather than switched off. Inlined at build time, so a change needs a dev-server restart locally and a redeploy on Vercel.

### What it is

A second way into the site: describe the trip in prose, get curated hotels, flights and restaurants back in the existing cards. Discovery and steering only — it never books, never takes payment, and every tool it reaches is read-only.

### The one design decision that matters

**The no-prices rule is structural, not a prompt promise.** `searchHotels`, `checkAvailability` and `searchFlights` fetch real rates, use them to rank and to test any ceiling the visitor named, then **discard the amount**. The model receives `{available, priceRank, withinBudget}` and never a figure, so it cannot leak a price it was never given — under any framing, including direct pressure. Every number on screen is fetched by the card from the same batch route the structured search uses.

If a future change hands the model a raw amount "just for context", that guarantee is gone and the prompt becomes the only defence. Don't.

### Route and tools

`src/app/api/chat/route.ts` holds `ANTHROPIC_API_KEY` and nothing else does. Guard order is deliberate: **flag** (404) → **session** (401, before the key check, so an unauthenticated caller learns nothing about our configuration) → **rate limit** → **input caps** → **triage**.

Triage is `claude-haiku-4-5` classifying travel / probe / other before any Opus spend, and a second independent judgement: a jailbreak that talks the main model round still has to pass a classifier with no tools.

**It sees the concierge's previous reply as fenced context (2026-09-13), and must.** With the new message alone, "List the others" — accepting the concierge's own offer to show the other decorated Paris hotels — read as off-topic and was declined. `previousReplyText` in the route passes the last assistant prose plus its `presentResults` framing and follow-up, tail-capped at 700 characters; the classifier is told it is context only and cannot turn a probe into travel. Verified: the follow-up now answers, and a mid-conversation system-prompt probe and a homework request are still declined. It **fails open** on error — refusing everyone during a transient outage is worse. A decline streams back as a normal assistant message, not a JSON error, so the client has one code path.

Tools, all read-only: `searchHotels`, `getHotelDetails`, `checkAvailability`, `searchFlights`, `nearestAirport`, `searchRestaurants`, `webSearch`, plus `presentResults` — not a data tool but how the model hands the UI a structured result set. The client renders from that tool call rather than parsing names out of prose, which would break the moment the model rephrased.

`nearestAirport` costs nothing — `cityAirports.ts` already covers every hotel city. **Do not add a Google Places call for this.** `checkAvailability` skips passive hotels (§42).

**A tool parameter whose valid values are a closed set should be an `enum`, not a described string.** Live testing had the model inventing plausible taxonomy tags — "quiet", "secluded", "wellness" — matching nothing and spending two extra round trips recovering, silently, on every query. `lib/ai/taxonomy.ts` mirrors the locked §44 vocabularies as JSON Schema enums. Safe to hardcode because those fields are `allowOther: false`; refresh from `GET /fields/hotels/{field}` if they move, since a stale entry silently matches nothing.

`searchRestaurants` searches one city, built on `getRestaurantsByCity` so the concierge sees exactly what the Restaurants page would, alias fallback included. Cuisine and type narrow in JS, because a Directus `_eq` would miss "Modern French" for "French". An empty result distinguishes **"we do not cover this city"** from **"nothing matched those filters"**, because only the first should send the visitor elsewhere. Restaurants follow the **same in-inventory rule hotels have**: never name one that did not come back from the tool, however well known.

### Ranking: fit, not decoration (2026-09-10)

**`ext_points` must never order a candidate list.** It counts external accreditations, which is orthogonal to what was asked, and sorting by it turned every answer into a trophy cabinet. Asked for a family ski trip, the tool matched 53, cut to 40 by awards rank, and the 13 it dropped were the least decorated — eight of them carrying the `Family` tag, including Suvretta House, Les Fermes de Marie and Rosewood Courchevel. The model then picked four grand hotels from what survived, having never seen the family-strongest.

Order is now **tag-match count → `editor_rank` → `ext_points` as a last tiebreak only**, in `relevanceSort`. `filterHotelsByTags` ORs within a field (§4), so a hotel matching one of three requested tags passes the same test as one matching all three: right for inclusion, wrong for ordering.

Awards survive only as `awards` labels on each candidate, and the prompt says they are not a ranking — name them **only when the visitor asks about accreditation itself** ("which are Michelin-starred", "the Forbes five-star ones"), or in passing when an award is the reason a hotel fits a stated need. The model is never given the `ext_points` number.

### Caps, and the broad-set gate

| Constant | Value | Why |
|---|---|---|
| `MAX_HOTEL_CANDIDATES` | 120 | Context ceiling, not an editorial one. Narrowing is the concierge's job. |
| `BROAD_RESULT_LIMIT` | 20 | Above this, ask before showing |
| `MAX_AVAILABILITY_IDS` | 120 | Matches the candidate cap so the availability count covers every candidate |

**`/api/ai/hotels` imports `MAX_HOTEL_CANDIDATES` and must never sit below it.** It held its own literal `40`, which agreed with the old tool cap by coincidence rather than construction — so raising the tool cap silently truncated a 67-hotel answer to 40 cards, with nothing in the UI to say so.

**Above `BROAD_RESULT_LIMIT`, `searchHotels` returns counts and `narrowBy` axes INSTEAD of properties**, with `tooBroadToShow: true`. The model cannot present a set it was not given, so "ask before showing a directory" is structural rather than a prompt line — and §50's own testing shows prompt-only rules of this shape get skipped. Counted on what the visitor would see: available properties when dates are known, matches otherwise. `showAll: true` is the escape hatch, and it is **required** — without it "just show me all of them" loops forever.

Each `narrowBy` axis reports `covers` out of `of`. Not every axis explains the whole set: `state_province_county_island` is null for a major city (§3), so it described half of Italy and read Tuscany as 2 where 10 hotels sit. `admin_region` is never null and is the axis to prefer.

### Colloquial geography — `lib/ai/macroRegions.ts`

"The Alps", "the Caribbean", "Scandinavia" are how people describe where they want to go and **none is a value in any column**. `area: "Alps"` matched nothing, cost a wasted round trip every time, and the blind retry searched the world — returning Colorado and Alberta for an Alpine question.

18 terms, exposed as a `macroRegion` **enum** (the §44 lesson: a closed set is an enum, not a described string). `region` — the continent column, which already holds "Caribbean" and "South Pacific" — is exposed too, and had never been reachable. A macro term is also resolved out of `country`/`area`/`adminRegion`/`city`, because the model does not always reach for a new parameter.

* **Mountain ranges intersect with a `setting` tag.** Administrative regions alone put Munich, Lausanne and Vevey in the Alps; requiring `Mountains` strips exactly those and keeps every real one.
* **Values matching nothing today are deliberate** — Tyrol, Idaho, Trentino, Malta, Finland, Belgium. They are the boundary as a person draws it, so a future hotel there needs no code change. Verified as genuine absences, not typos. **Do not "clean" them out.**
* A search that still matches nothing returns `didYouMean`: real values with the parameter each belongs to, matched by bounded Levenshtein — containment alone scores "Tirol" against "Tyrol" at zero, which is the case the feature exists for.

**`area` and `adminRegion` are one geography slot** — each matches *both* columns, OR'd. They are separate fields with separate meanings (§3), but they legitimately hold the same value (Tuscany, Bali, Sicily), and the traveller field is deliberately null for a major city. Matching `area: "Tuscany"` against the traveller column alone returned **2 hotels of the 10 in Tuscany**, dropping every Florence property plus Il Pellicano and Forte dei Marmi, which sit under their own sub-areas. The model cannot know which of two near-identical fields holds the name it wants, and guessing wrong must widen the search rather than gut it. Narrowing a region to what was meant is then the model's job, via `settings` — which is what it does: the same query now searches Tuscany with `Countryside`/`Hillside` and says so.

### Never say aloud the words we use to explain the data

The concierge told a visitor "an open jaw works nicely here". That is airline trade jargon for flying into one city and home from another, and it came **from our own tool description** — `returnDate` said "leave unset on the legs of an open jaw". Vocabulary written to describe a data shape to the model got reused as house voice.

The prompt now carries a general rule, because this class recurs: instructions and tool descriptions name things precisely so the model can act on them, and much of that vocabulary is jargon a guest has never met. Not "open jaw"; not "passive" or "not integrated" (§42) — "we can't book that one here"; never "macroRegion", "setting tags", "candidates", "the tool", or a supplier's name. **If a phrase would look at home in a schema, it does not go in an answer.** When adding a tool description, write it so that a sentence lifted from it verbatim would still sound like a concierge.

### Dates: never invent one (2026-09-10)

**A question about which hotels we have is not a question about a particular week.** Answering it against a week the model chose prices the wrong stay and hides everything sold out then.

No timing given — no dates, month, season — means **omit `stay`** from `searchHotels` and `presentResults`. Cards render without prices, which is the honest answer, and the follow-up asks when. Asked about price with no dates: ask for timing, do not guess a week to produce a figure.

**Dates in the page's search form are an offer, not an assumption.** They may be dates the concierge itself proposed earlier: `AiResultsSync` writes an answer's dates into the URL (§8), `LandingSearchPanel` reads them back and republishes them as page context, and the model then treats its own guess as the visitor's stated wish. A leftover ski week priced a beach question in France. `pageContext` now says "filled into the search form" rather than "for", so the model can tell form contents from intent.

### What the panel says, and what the page shows

`hotelIds` is **every** property that fits and becomes the cards; `rationales` is the **five to eight** the panel names. They are the same list only when the set is small.

* **The count in the framing is `hotelIds.length`** — not how many matched, not how many are free. Three numbers are in play and only one is the answer; say two only when both matter ("Ten of the thirty-nine have rooms that week").
* **Named properties lead the card order.** `highlightsFirst` reorders `hotelIds` before it reaches the store, so the footnote's promise — "these come first on the page behind, with the other N below" — is one the page keeps.
* `MAX_NAMED = 8` is a hard UI cap, independent of how many rationales arrive.
* **One property is an answer, not a list (2026-09-13).** A lone hotel or restaurant gets no heading and no bullet — `ResultSummary` draws a group only above one entry — and the prompt puts the whole answer, name included, in `framing`. It used to print "Hotel" over a single bullet repeating a name the answer had just given.
* **"Not available at myOLTRA yet." — the standard for a hotel we cannot price (2026-09-13).** Ulrik's wording, italic, the last sentence under that hotel, and never in the framing. Drawn by `ResultSummary` from the record (`ratehawk_status === "passive"` or no `ratehawk_hid`, the same test as `bookableHere`), not written by the model — its own version ("two of the five aren't sold through us, so they appear without a price") read as though the panel carried prices and never said which two. A lone hotel gets the note as a line under the framing. The prompt forbids mentioning pricing or where prices appear, and uses the exact sentence when asked in prose.
* **What to do and see is answered, not declined (2026-09-13).** Attractions, museums, exhibitions, bars, nightclubs, musicals, opera, concerts, matches, day trips — Ulrik: "an obvious adjacency". The prompt answers them anchored to the destination, never states a dated event (a show, a fixture, an exhibition run) from memory, never books or prices a ticket, and keeps restaurants in inventory while bars and clubs may come from general knowledge. Triage's TRAVEL definition lists the same, or it would decline them first.
* **"The airport guests use" only where a person decided it (2026-09-13).** `compareGateways`' no-comparison basis (one airport, or the Duffel test token) used to say the first-listed airport "is the one guests use" for every destination; for a non-curated list that is merely the nearest, so the concierge said "London City is the one our guests use from Copenhagen". It now keeps the claim for `hasCuratedGatewayOrder` keys only, leads other lists with `pickPrimaryAirportForCity`, and says nobody chose it; the prompt forbids "guests use" without that basis.
* **No rankings the data does not hold (2026-09-13).** "The most serious spa on the lake", "one of the largest on this coast", "the quietest of the five" were all the model's own: a description giving one spa's size says nothing about the others. The prompt's "never" list and the `rationales` description now say to state what a place HAS and compare only where the tool results give the fact for every property compared. Prompt-only, so re-check after prompt edits; verified on "Hotels on Lake Como with a spa", which still presents all five.
* **Earlier answers stay in the transcript (2026-09-13).** Only the latest answer was drawn, from the store; a turn that answered purely through `presentResults` has no prose, so a newer answer made it vanish. Each such turn is now redrawn from its own call (`readPresentation` + `ResultSummary past`), without the footnote — the window behind shows only the latest answer.
* **Flights say what they are (2026-09-13).** `searchFlights` returns one entry per schedule (not six fare brands of one flight), flagged `civilisedHours` (leave ≥07:00, land <23:00 same day) and ordered civilised → fewest stops → shortest; the fare survives only as a rank. Each `flights` leg carries `details` — airlines, direct or via, departure times each way — shown under the leg. **Details are shown only when a `searchFlights` in the same turn matches the leg's airports and dates**: the first live run searched Linate and presented Malpensa, putting Linate's times under the Malpensa line. Locally the Duffel test token invents the schedules, so times and airlines there are not real.
* **"AI curated results" is the only token after an AI session (2026-09-14).** The landing and Hotels destination boxes show that one token while `aiResultsAreCurrent` holds, never tags approximating the answer; removing it stamps `searchedAt`, clears the shared-session destination and drops the set. `hotelsHref` carries `ids` and the stay only. See CLAUDE-AI.md before touching AiResultsSync or the Hotels session restore — they race.
* **Counts are counted, and offers are things it can do (2026-09-15).** "The one relaxed lunch address we hold" was the nearest of five; "a dozen more inside twenty minutes" was five more. The prompt's never-list now forbids a count or "the only one" not counted from tool results, and any offer to move the visitor to a page ("Shall I show these on the Restaurants page?"); the `followUp` description says the same. Prompt-only; re-verified on the Le Bristol question. **Clear also drops the Hotels page's `?ids=` set** (HotelsView, keyed on `clearSignal`), which had left a cleared conversation's hotel under "AI curated results" beside the next answer.
* **A trip in several places is shown whole on the landing page (Ulrik, 2026-09-15 — replacing "one destination at a time" from earlier that day).** `presentResults.laterStops` (`{place, checkIn, checkOut, hotelIds, restaurantIds}[]`) carries every place after the first; `hotelIds`/`restaurantIds`/`stay`/`destination` are the first place. **Landing** (`AiResultFrames`): the hotel pane lists every stay under a "Place · dates" header (`HotelStayGroup`, each group priced and saved on its OWN dates), the restaurant pane lists restaurants under each city with a SAVE control (new on `RestaurantSmallCard`), flights unchanged; the search form's dates are blanked for a multi-stop answer. **Hotels, Flights, Restaurants** show the first place only. **Panel**: lists each place, then code explains the layout, says on other pages that the full trip is only on the main page (the modal always offers the main-page button for a multi-stop answer), and tells the visitor to SAVE each choice so the itinerary appears under Members, Saved trips. Not for alternatives spread across places. Restaurants are grouped by each restaurant's own city (a stop called "Côte d'Azur" holds Cannes and Nice); "each under its dates" is said only when the stops have dates; the party (adults, rooms) travels in `stay` even with no dates, and the landing form takes the rooms too. `searchHotels` resolves "French Riviera" to the area "Côte d'Azur" (`AREA_ALIASES`).
* **A departure city searches all its airports (Ulrik, 2026-09-15).** `searchFlights.originCity` expands through `departureAirportsForCity` (`lib/ai/departureAirports.ts`): hotel-city airports that are large within 60 km or medium within 25 km (London → LHR, LGW, LTN, STN, LCY; not Southend; Copenhagen → CPH, not Roskilde), else the Flights page's airport list by municipality. Routes are origins × destinations, capped at 8, searched in parallel; the result carries `departureAirports` and `searchedRoutes` (the panel matches flight details against those), and the prompt requires every airport to be named. Verified: "business from London" searched all five and presented Gatwick.
* **Preferred airlines lead flight answers (Ulrik, 2026-09-15).** The chat route reads `member_profiles.preferred_airlines` (one element, comma-separated, as Personal Information saves it) for the signed-in member and builds the tools per request (`buildConciergeTools`), so the list never comes from the browser. `searchFlightOffers` sorts an itinerary on one of them first when it is sensible — at most one stop more and 1.5× the duration of the best option, civilised if any option is — and marks it `preferredAirline`; names map to IATA codes in `lib/ai/preferredAirlines.ts`. A system note tells the model to name those first. Not yet seen on a route where one applies.
* **Where it opens, and what stays visible (Ulrik, 2026-09-15).** "Ask AI" sits first in the site header on every page; the landing destination field keeps its inline one, also "Ask AI"; the page frames lost theirs. The panel's own header says only "AI Concierge". The scrim covers the whole screen, header row included, and the header is raised above it (`is-concierge-open`, z 1001), so on blurred pages the logo and links stay sharp on the blurred page with "AI Concierge" as the route label. The panel opens in the landing search panel's exact box on every page — measured there (at least its height, so it covers it), rebuilt elsewhere from `.heroPanel`'s width rule, `--oltra-page-top-padding` and the last measured height — with no drop shadow; a header nav click closes the panel. On the landing page the scrim has no dim or blur, the panel is solid, and `LandingResults` renders nothing while the panel is open — results show when it closes, and the footnote there says so ("appear on this page when you close this window"). Clear, Exit, Ask and Stop share `.action`'s min-width.
* **Every restaurant named carries its Michelin standing (Ulrik, 2026-09-15).** "Michelin 1/2/3 stars", "Michelin Bib Gourmand" or "Not Michelin" — `michelinStatus()` in `app/restaurants/utils.ts`. The panel draws it after each restaurant line (and under a lone restaurant) from the record; `searchRestaurants` returns it as `michelin` so prose answers can say it. The prompt forbids stars from memory and tells the model not to repeat it in rationales. This is separate from the hotel rule below that awards are named only when asked.
* **Activity tags lead, and the model may add with conviction (Ulrik, 2026-09-15).** A hotel's `activities`/`setting` are the main guide for choosing and for what the answer says it offers. The model may add something the tags do not list only when highly confident and nothing in the highlights or description contradicts it, reading the description first when the addition is the reason for the choice. Prompt-only.
* **"Where would you send us?" gets destinations before a question (2026-09-15).** Over `BROAD_RESULT_LIMIT` the model still presents nothing, but when the visitor asked where to go it suggests two or three cities from the new `narrowBy.city` axis (up to 20 values; the other axes stay at 8), each with a reason, names no hotel, then asks. When it says where the set sits it must name every place, or group the small ones — the first run listed Vienna and Prague (1 each) and dropped Oslo (2), and cities had to be inferred from admin regions.
* **"Near a place" is measured, not remembered (2026-09-15).** Asked for a hotel "within walking distance of the Pantheon", the model chose from general knowledge and called a twenty-minute walk easy. `searchHotels` and `searchRestaurants` take `near` ("Pantheon, Rome"): `lib/ai/nearPlace.ts` looks the place up once with Google Find Place (`GOOGLE_MAPS_API_KEY`, server-only, cached 24h in memory; Find Place rather than the Geocoding API, which put "MoMA, New York" in the middle of Manhattan), and every result gets `distanceKm` (straight line) and `walkMinutes` (×1.3 for streets at 5 km/h, null past 5 km), nearest first. With `near` found, hotels are cut to the nearest `BROAD_RESULT_LIMIT` and the directory gate is skipped. A lookup failure says "no distances — do not estimate", and a place over 50 km from every result is flagged as possibly the wrong one. The prompt forbids distances from memory. **On Vercel the key must be set for Preview and Production**, or `near` quietly returns no distances.
* **The Restaurants page shows the picks as "AI curated results" (2026-09-15).** Asked there for somewhere to eat in Rome, the answer named three while the page went on listing all 35. The type selector now offers "AI curated results" — the answer's restaurants in this city, in its order — and opens on it while `aiResultsAreCurrent` holds; choosing another type leaves it without touching the answer. A new answer about another city moves the page there. The panel's footnote counts restaurants as behind the panel on that page, and the modal gives no link for a restaurants-only answer there.
* **Hotels in several places get a flight to each of their airports (2026-09-14).** Each hotel's airport comes from our data (`airport` on searchHotels candidates, `airports` on `/api/ai/hotels` records, both from `standingGatewaysForHotel`), and the panel prints "Fly into … (IATA)." after its reason whenever the answer has flights. `completeLegsForHotels` adds a leg for any named hotel's airport that no presented leg covers, for an outbound set only — never to an open jaw. `searchFlights` takes `destinations` so the model searches them all in one call. Every model-authored string passes `decodeStrayEscapes` (a live answer printed `M\u00e1laga`). See CLAUDE-AI.md.
* **Several: the lines answer the question per property, the framing only introduces the set** (count, dates) plus anything true of the whole trip or area. Asked about spa and sea access on the Amalfi Coast, each line now says what that hotel has for both, and the framing carries only how swimming works on that coast.
* The footnote claims prices **only when a stay was passed**; without one the cards are blank.

### Water-proximity tags are inconsistent — §42B

`Beachfront`, `Beach`, `Seaside`, `Coastal`, `Oceanfront`, `Waterfront`, `Clifftop` are not applied consistently, and the §42B reclassification has never run. The whole Côte d'Azur is `Waterfront` or `Coastal` and **none of it `Beachfront`**, so "beachfront hotels in France" returned 3 — Deauville, La Baule, Biarritz — and missed Hôtel du Cap Eden-Roc, Cheval Blanc Saint-Tropez and the rest.

The `settings` parameter description tells the model to pass the whole family for anything by the sea, which took that answer from 3 to 17. **That is a patch over the data, not a fix.** §42B is still the real answer.

### The system prompt

Read-only tools, no booking or payment, the confidentiality block, the non-travel decline wording, the no-result wording, adjacent questions bounded to inventory, the restaurant in-inventory rule, page context, answer-then-offer-the-handoff, the in-chat summary rule, and the `searchTags` requirement.

**Keep `SYSTEM_PROMPT` byte-stable per deploy.** It carries the prompt cache breakpoint. Anything per-request — the date, the page context — goes in a *later* system block. The call-level `cacheControl` this replaced caches the **last** cacheable block, which would have been the volatile one: the cache would have missed on every request while looking correctly configured. **If `usage.cache_read_input_tokens` is persistently zero, check this first.**

**A prompt change is a code change, and it regresses like one.** Two fixes were caused by the fix before them: tightening for brevity produced wording the model read as permission to ask *instead of* showing results, so it replied helpfully and rendered no cards. Nothing failed; there was simply no `presentResults` call — invisible unless you notice `/api/chat` wasn't followed by `/api/ai/hotels`. **After editing `systemPrompt.ts`, run a real query in a browser and check the tool fired.**

**"The best" — the one question answered with a question.** Asked "the 3 best hotels in Paris" it named three and called them "the three that stand above the rest". **There is no ranking behind the collection, so that was invented.** It now answers with "I can highly recommend all hotels on myOLTRA" plus a request for something to judge on, and holds it under pressure. **The exception is deliberately narrow and the prompt says so twice**, per the regression above: it applies only when there is nothing to rank by. "Hotels in Paris" still searches and shows, as does any request carrying a quarter, a spa, a brand, a budget or a date.

### AI SDK v7 — where training priors are wrong

`ai@7` + `@ai-sdk/anthropic@4` + `@ai-sdk/react`. Verified against the installed `.d.ts`, not recalled:

* `useChat` is in **`@ai-sdk/react`**, not `ai`.
* Tool params are **`inputSchema`**, not `parameters`.
* **`convertToModelMessages` is async** — await it.
* `useChat` does not manage input; the caller owns the text state and calls `sendMessage({ text })`. Per-request data goes in the second argument: `sendMessage({text}, {body: {...}})`.
* **`role: "system"` is rejected inside `messages`.** It goes through `instructions`, which accepts a string, one system message, or an **array** — the array form is what makes a cached prefix plus volatile suffixes possible.
* A `ToolUIPart` in state `input-streaming` has `input?: DeepPartial<…>` — partial, and typed as such.
* `stopWhen` takes an array; `hasToolCall(name)` is exported alongside `stepCountIs(n)`.
* `TripType` in `duffelNormalizer.ts` is `'one-way'`, not `'oneway'`.
* `buildGuestsArray(adults, kids, ages, rooms)` is positional.

### Prerequisites

* `ANTHROPIC_API_KEY` — server-only, never `NEXT_PUBLIC`. On Vercel: Sensitive, **Preview and Production** (Preview included, or the preview cannot answer).
* `NEXT_PUBLIC_AI_CHAT_ENABLED` — public flag, inlined at build time.
* **A spend cap and usage alerts in the Anthropic Console.** The in-memory rate limiter is per serverless instance, so the real ceiling is (instances × cap) — a cost backstop, not a control. Swap the Map for Upstash if the site ever opens past `/beta-login`.

### Deliberately not built

Chat on `/hotels/[hotelid]` or in the members area, any booking/payment/write tool, fine-tuning, pgvector, and any markup on prices. The Restaurants page was on this list until 2026-09-15; it now shows an answer's picks (below).

---
