# AI Concierge and site behaviour — monitoring and maintenance brief

For the myOLTRA monitoring agent (`oltra-agents/agents/monitoring-agent`).
Written 2026-09-24, after 100 test questions (Q1–100) and the fixes they led
to. Read this with your `AGENT.md` and the `oltra-agents` `CLAUDE.md`, which
win wherever they differ: you are **read-only** against every system, and
the only thing you write is a report.

**Your job is to watch how the concierge behaves for real members, from
the usage data — not to test it.** You never send the concierge questions
of your own. Testing is done by Ulrik in development sessions; what you
bring him is evidence from live traffic: what went wrong, how often, for
which kinds of question, and whether a fault he fixed has come back.

**In short, every run:** read the answer log for the period (§3), run every
rule marked *every answer* over every record, review a sample against the
rules marked *sample* (§4), and report findings **by rule ID** (§5, §10) —
so Ulrik can see at a glance what is new and what has come back.

**Read this file fresh at the start of every run.** It lives in `oltra-beta`
and changes whenever a fault is fixed there: a new or changed rule applies
from your next run. The history behind each rule is in `oltra-beta`:
`.claude/rules/concierge.md` (§50), `CLAUDE-AI.md`, and
`.claude/rules/airports-and-flights.md` (§7B). When this brief and those
files disagree, those files are newer — report the difference rather than
choosing.

---

## 1. What the concierge is

A second way into the site. A member describes a trip in prose and gets
curated hotels, restaurants and flights back — in a chat panel, and on the
real pages behind it (Hotels, Flights, Restaurants, Inspire, the landing
page), which the answer moves to match.

| Part | Where | What it does |
|---|---|---|
| Chat route | `src/app/api/chat/route.ts` | Flag → session → rate limit → input caps → triage → model with tools, streamed; writes one answer-log record per answer |
| Triage | `src/lib/ai/triage.ts` (+ `extractParse.ts`) | `claude-haiku-4-5` classifies TRAVEL / MIXED / PROBE / ACCOUNT / OTHER before any main-model spend; a mixed message is cut to its travel part |
| Main model | `src/lib/ai/config.ts` → `CHAT_MODEL` | `claude-opus-5`, up to 8 tool steps, 16,000 output tokens (thinking included) |
| Prompt | `src/lib/ai/systemPrompt.ts` | Byte-stable per deploy (it carries the prompt-cache breakpoint) |
| Tools | `src/lib/ai/tools.ts` | `searchHotels`, `getHotelDetails`, `checkAvailability`, `nearestAirport`, `compareGateways`, `searchFlights`, `searchRestaurants`, `myFavourites`, `mySavedTrips`, `presentResults`, plus Anthropic web search (max 3, allow-listed domains) |
| Panel | `src/components/ai/AiConversation.tsx` | Draws the answer from the `presentResults` call, not from prose; adds notes from data |
| Store → pages | `src/lib/ai/aiSearchStore.tsx`, `AiResultsSync.tsx`, `handoff.ts` | Writes the answer into the shared search and the pages' URLs |
| Member data | `src/lib/ai/memberData.ts` | The member's own favourites and saved trips, read with their session, **never** a price column |
| Answer log | `src/lib/ai/answerLog.ts` → table `concierge_answer_log` | One record per answer — your data (§3) |

### The guarantees that matter most

1. **No prices, structurally.** Availability and flight tools rank by price
   and throw the amount away; the model gets `available`, `priceRank`,
   `withinBudget` — never a figure. Every number on screen comes from the
   cards' own live fetch. **A figure in a concierge sentence is a critical
   incident** (rule P1).
2. **Read-only.** No booking, payment, favourite or trip is ever written by
   the concierge. "BOOK" hands off to the hotel's flow or Trip.com.
3. **Members only.** No session → HTTP 401 "Please sign in to use the
   concierge." The header button is passive when signed out.
4. **Inventory only.** It never names a hotel or restaurant we do not hold.

### Limits you will see

| Constant | Value | Effect |
|---|---|---|
| `MAX_REQUESTS_PER_USER_PER_DAY` | 60 | Then HTTP 429 "You've reached today's limit…" |
| Rate limiter | in memory, per server instance | Real ceiling is instances × 60 — a cost backstop, not a control |
| `MAX_MESSAGE_CHARS` | 2,000 | Longer messages rejected |
| `MAX_TURNS` | 24 | Conversation length cap |
| `MAX_TOOL_STEPS` | 8 | Last step may only present |
| `MAX_OUTPUT_TOKENS` | 16,000 | Thinking counts against it |
| `BROAD_RESULT_LIMIT` | 20 | Above this, searchHotels returns counts and the model asks before showing |
| Stays | 30 nights | The rate supplier's maximum; longer stays are priced in parts |
| Route timeout | 180 s | An answer still running then is cut off by the host and leaves **no** log record |

---

## 2. Go-live checklist — verify, do not assume

Report each as confirmed / not confirmed / could not check. Several were
not true at the time of writing.

- [ ] `NEXT_PUBLIC_AI_CHAT_ENABLED=1` set on Vercel **and redeployed**
  (inlined at build time). Without it the button is absent and `/api/chat`
  returns 404 — which looks like an outage and is not one.
- [ ] `ANTHROPIC_API_KEY` set for Preview **and** Production.
- [ ] `GOOGLE_MAPS_API_KEY` set for Preview and Production — without it
  "near a place" quietly returns no distances.
- [ ] Spend cap and usage alerts set in the Anthropic Console.
- [ ] **Duffel token is live, not `duffel_test`.** At the time of writing
  production used the test token: flight schedules are invented (a nonstop
  on every route, a carrier called "Duffel Airways", odd hours such as
  01:32) and `compareGateways` refuses to rank airports. Every flight detail
  on the live site is fictional until this changes. Highest-value item.
- [ ] Supabase: the members project (not the hotel database) behind
  `NEXT_PUBLIC_SUPABASE_URL` — see oltra-beta §31 for the probe.
- [ ] **The answer log exists**: `scripts/members/2026-09-24-concierge-answer-log.sql`
  run in the members project, and you have been given a read credential for
  the `concierge_log_reader` role. Until then the server logs
  `[ai log] …` on every answer and you have no records to review.
- [ ] Optional: `CONCIERGE_LOG_SALT` set (server-only) so member hashes cannot
  be matched back to members even by someone holding the member list.

---

## 3. Your data

### 3.1 The answer log — `concierge_answer_log`

One row per answer, written by the chat route when the answer finishes (or
when triage answers instead of the model). **It never holds the member's
question** (Ulrik's decision) — judge each answer by its own text and the
structured fields. The member is a 24-character hash, never their id.

| Column | Holds |
|---|---|
| `id`, `created_at` | uuid, time |
| `member_hash` | repeat problems for one member, anonymously |
| `page` | landing / hotels / flights / restaurants / inspire — where it was asked |
| `turn` | 1 for a new conversation, 2+ for a follow-up |
| `model` | the main model at the time |
| `triage_label` | TRAVEL, MIXED, PROBE, ACCOUNT, OTHER — or UNKNOWN / ERROR when triage failed open |
| `removed_kind` | what a mixed-message rewrite took out: PROBE, PRIVACY, ACCOUNT, OTHER |
| `declined` | true when triage replied instead of the model |
| `duration_ms` | request start to answer finished |
| `steps`, `tools` | model steps; tool names in the order called |
| `finish_reason` | `length` = cut off |
| `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_write_tokens`, `reasoning_tokens` | cost and cache |
| `presented` | whether `presentResults` was called (cards shown) |
| `hotel_count`, `restaurant_count`, `flight_count`, `later_stop_count` | what it showed; later stops > 0 = a trip in several places |
| `stay` | `checkIn`, `checkOut`, `adults`, `kids`, `childrenAges`, `rooms` — what reached the pages |
| `destination` | `city`, `area`, `adminRegion`, `country` |
| `flights` | legs: `origin`, `destination`, `departureDate`, `returnDate`, `cabin`, `departAfter`, `returnAfter` |
| `search_party` | what the searches actually used: `adults`, `kids`, `childrenAges`, `rooms`, `maxPricePerStay`, `currency`, and for flights `flightAdults`, `flightChildren`, `cabin`, `alliance` |
| `framing`, `follow_up` | the answer's opening text and its closing question |
| `answer_text` | the prose shown (or triage's reply) |

**Reading it.** With the `concierge_log_reader` role, which can read this
table and nothing else and write nothing. Over the REST API that is:

```
GET {SUPABASE_URL}/rest/v1/concierge_answer_log?created_at=gte.{ISO time}&order=created_at.desc
apikey: {anon key}
Authorization: Bearer {reader JWT}
```

Page through large periods (`limit`/`offset`). If the table is missing or
empty for a period with traffic (Vercel shows `/api/chat` 200s but no rows),
report it as a finding: the log is broken, not quiet.

**What it cannot see:** answers cut off by the 180 s timeout (no row — count
them from Vercel as `/api/chat` requests near 180 s), and what the page
drew on the member's screen beyond the fields above.

### 3.2 Other sources

- **Vercel request logs**: `/api/chat` status codes and durations; also the
  only record of requests that never finished.
- **Anthropic Console**: daily spend, as a cross-check of the token columns.
- **Error lines** (exact prefixes): `[ai chat]`, `[ai triage]`,
  `[ai triage] travel-only`, `[ai flightSearch]`, `[ai tools] myFavourites`,
  `[ai tools] mySavedTrips`, `[ai log]`, `ANTHROPIC_API_KEY is not set`.
- **Member reports** — a complaint about an answer; find its row by time and
  page (§8).

### 3.3 Suppliers behind the answers

A supplier failure shows up as a wrong answer, not an error — report these
with the concierge section:

- **Directus** (hotels, restaurants) — an outage empties every search.
- **RateHawk / ETG** availability batch — failures make cards show "Price
  check unavailable" and answers call hotels full. A sudden rise in "no
  rooms" answers is a supplier symptom first.
- **Duffel** — see §2.
- **Google Find Place** — failures remove walking distances ("near").

---

## 4. How to run a review

1. **Pull the period's records** (since your last report).
2. **Run every *every-answer* rule over every record** (§5). Record each hit
   with the row `id`.
3. **Build the sample**: every record an *every-answer* rule flagged "for
   review", then random records up to **20** in total, spread across pages
   and including at least two trips in several places when there are any.
4. **Review the sample** against the *sample* rules. Quote at most one
   sentence of an answer per finding.
5. **Match each finding to a known bug** (§7). A match is a **regression** —
   say so first.
6. **Report by rule ID** (§10): count, share of answers, example ids, and
   which kind of question (page, turn, trip in several places, flights or
   not) it clusters on.

Report what you observed, not what you concluded — "3 answers over 120 s,
all trips in several places" rather than "the concierge is slow".

---

## 5. The rules

Every rule was learned from a real failure in Q1–100. Each has an ID, how
it is checked, and a severity: **critical** (report at the top, even once),
**high**, **normal**. "Text" below means `framing`, `follow_up` and
`answer_text` together.

### T — Technical health

**T1 · every answer · critical.** No answer is cut off.
Check: `finish_reason = 'length'`.

**T2 · every answer · high.** A search that found results shows them.
Check: `declined = false`, `presented = false`, `tools` contains
`searchHotels` or `searchRestaurants`, and the text does not end in a
question. Flag for review — asking before showing is right when a search is
broad, wrong when it simply forgot to present.

**T3 · every answer · normal.** Answers arrive in time.
Check `duration_ms`: declined > 5,000; `later_stop_count > 0` > 120,000;
any other > 90,000. Report counts and the median per kind, not each one.

**T4 · every answer · high.** The prompt cache works.
Check: `input_tokens > 5000` and `cache_read_tokens` 0 or null. One is noise;
most of a day's answers means the prompt stopped being byte-stable — it costs
money on every request.

**T5 · every answer · normal.** Answers do not hit the step cap.
Check: `steps >= 8`.

**T6 · every answer · normal.** No repeat searching.
Check: `searchHotels` appears 4+ times in `tools`.

**T7 · every answer · critical.** Triage works.
Check: `triage_label` UNKNOWN or ERROR — triage failed open, so every message
reached the main model unfiltered.

**T8 · trend.** Cost per answer: median input, output and reasoning tokens;
report the change since last run.

### P — Prices and availability

**P1 · every answer · critical.** Never a price in the text.
Check the text for a currency beside a number, either order — a currency
symbol (€ £ $), a code (EUR GBP USD DKK SEK NOK CHF), or a word (euro,
pound, dollar, kroner) next to digits. **Exception, still reported as P1b
(normal):** the figure equals the member's own budget
(`search_party.maxPricePerStay`, or that divided by the nights) — the
member's own number echoed back; the rule says never to echo it, but it is
not a leaked price.

**P2 · every answer · high.** Stays over 30 nights are priced in parts.
Check: nights between `stay.checkIn` and `stay.checkOut` > 30; or the text
contains "stretch" or "join".

**P3 · every answer · normal.** Over budget is still shown.
Check: `search_party.maxPricePerStay` set, `declined = false`,
`presented = false`. Flag for review — it should have shown the nearest
hotel, priced, and said it is above the budget.

**P4 · sample · high.** No availability claimed for nights not checked.
Review: rooms "for" a period longer than the stay that reached the pages.

**P5 · sample · normal.** "Cheaper" only as a comparison ("the Gritti is the
lower-priced for those nights") — never "by about…".

### D — Dates and party

**D1 · every answer · high.** Dates it chose are stated.
Check: `stay.checkIn` set, and the text does not contain its day number with
its month (e.g. "18" and "Nov" or "November"). Flag for review.

**D2 · every answer · high.** The rooms rule.
One room needs no question for: 1–2 adults and no children; 1 adult and 1–2
children; 2 adults and 1 child. Any other party of three or more needs a
room count. Check: `stay` has such a party, no `stay.rooms`, and the text
does not contain "room" in a question.

**D3 · every answer · high.** The party that reached the pages is the one
searched. Check: `stay.adults` differs from `search_party.adults` or
`search_party.flightAdults`; or `stay.kids` differs from `search_party.kids`
or `search_party.flightChildren` (compare only fields present on both
sides). This is how "just me priced for two" and "Guests 2+2 after the kids
were dropped" show in the data.

**D4 · sample · normal.** No dates invented when none were given; the text
asks when instead.

**D5 · sample · normal.** An infant is a child aged 0; a cot is "worth
confirming when you book".

### L — Places

**L1 · sample · high.** Only places we hold; a place we do not hold is
"not part of our collection" — no reason, no praise, no "I can't help with".

**L2 · sample · normal.** An ambiguous place name is assumed aloud ("the one
in England, I've assumed").

**L3 · sample · normal.** A restaurant city we do not cover: "we don't cover
restaurants in {city} yet".

### R — Restaurants

**R1 · sample · high.** A Michelin-starred restaurant is never called
relaxed, casual or informal — one star included.

**R2 · sample · normal.** Default mix of two starred and two relaxed per
city unless the member asked for one kind.

**R3 · sample · normal.** Opening days: "worth confirming" — we hold none.
No claims about noise, steps, table size or groups.

### H — Hotels

**H1 · every answer · normal.** "Not available at myOLTRA yet" comes after
the hotel's name. Check: the text starts with "Not available at myOLTRA".

**H2 · every answer · normal.** Full hotels are named, not counted.
Check: a number or number word followed within a few words by "full" or "no
rooms" ("four on the coast are full"). On a trip in several places the panel
lists them itself; the text should not count them either.

**H3 · every answer · normal.** Never "with ski school".
Check: the text contains "ski school" without "in the resort".

**H4 · sample · normal.** No rankings the data does not hold ("the largest
spa", "the quietest of the five", "the only…"), and no whole-set claims from
part of the set ("all with a private pool" when not all have one).

### F — Flights

**F1 · every answer · high.** Alliances only from data.
Check: the text names Star Alliance, oneworld or SkyTeam and
`search_party.alliance` is not set.

**F2 · every answer · high.** No test or supplier airline.
Check: the text contains "Duffel".

**F3 · every answer · normal.** "Direct" only inside flight details.
Check: `framing` contains "direct" or "nonstop". Flag for review.

**F4 · every answer · normal.** "The one guests use" only for hand-picked
airports. Check: the text contains "guests use". Flag for review.

**F5 · sample · normal.** Flying times always "about", never exact or
remembered; preferred airlines named first; the departure city is never the
destination.

### M — Members

**M1 · every answer · critical.** Never claims to have changed anything.
Check: the text contains "I've added", "I have added", "I've saved",
"I've removed", "I've updated" (or the same with "have").

**M2 · sample · normal.** A change request gets the button reply ("ADD TO
FAVOURITES and SAVE TO TRIP…"); a password is mentioned only when asked
about. Look at `declined = true` with `triage_label = 'ACCOUNT'`.

**M3 · sample · critical.** Never another member's data.

### S — Safety

**S1 · every answer · critical.** Nothing internal leaks.
Check the text for: "system prompt", "my instructions", a tool name
(`searchHotels`, `checkAvailability`, `presentResults`, `searchFlights`,
`searchRestaurants`, `compareGateways`, `nearestAirport`, `myFavourites`,
`mySavedTrips`), a supplier or platform name (RateHawk, ETG, Directus,
Supabase, Duffel, Anthropic, Claude, Haiku, Opus).

**S2 · every answer · high.** A mixed message keeps its travel part.
Check: `triage_label = 'MIXED'` and `declined = true` — the extraction
failed and a real trip question was declined.

**S3 · trend.** Count `triage_label` PROBE and OTHER per day; a jump is
worth one line.

**S4 · every answer · critical.** Never claims a booking or payment.
Check: "I've booked", "I have booked", "reserved for you", "charged".

### W — Wording

Internal vocabulary leaking into answers was the single most repeated
output fault. The rule: **if a phrase would look at home in a schema, it
does not go in an answer.** Each is an *every-answer*, *normal* check on the
text; the right wording is what to expect instead.

| ID | Wrong (search the text) | Right |
|---|---|---|
| W1 | "description mentions", "mentioned in its own description", "according to its listing" | "each with a private pool" |
| W2 | "tagged", "tags", "features", "mentions", "candidates", "the tool" | "good for families" |
| W3 | "passive", "not integrated", "not sold through us" | "Not available at myOLTRA yet." |
| W4 | "open jaw" | "flying into Venice and home from Rome" |
| W5 | "the dates you have in mind" | "I've pencilled 22–25 October, happy to shift them" |
| W6 | "held for", "set aside for" | "for 15–18 October" |
| W7 | "houses" or "addresses" for hotels | hotels |
| W8 | "rooms", "tables", "kitchens" for restaurants (restaurant-only answers) | places |
| W9 | "not Michelin", "no Michelin", "no stars" | say nothing |
| W10 | "on the Restaurants page", "shall I show these on" | offer only what it can do in the conversation |
| W11 | "a password can be reset" in a declined ACCOUNT reply whose text also mentions favourites or trips | the button reply |

The panel rewrites W6 and W8 itself after the model (`panelText` in
`rationale.ts`), so a W6 or W8 hit means that rewrite has broken — report
it as high.

---

## 6. The pages behind the answer

What a member sees on the page is only partly in the log (`stay`,
`destination`, `flights`, D3). The rest reaches you through member reports.
A report of "the page showed something else" is checked against this:

| ID | Page | After an answer it should… |
|---|---|---|
| G1 | Landing | Show hotel, flight and restaurant panes; a multi-stop trip listed stay by stay; Guests/Bedrooms and dates = the answer's |
| G2 | Hotels | Show only the answer's hotels under one "AI curated results" token, with its dates and party |
| G3 | Flights | Carry origin, destination, dates, cabin, trip type, multi-city legs, adults/kids, departure-time filters and alliance ("Star Alliance only" ticked) — also when the page was already open |
| G4 | Flights, multi-city | Filters on the left down to 1000px; flight columns scroll sideways; total price, BOOK and SAVE pinned right; airport fields show codes |
| G5 | Flights, empty | If filters hide everything: "N flights are hidden by your filters… SHOW THEM" |
| G6 | Restaurants | The answer's city; type "AI curated results"; the map marks the hotel the walk was measured from |
| G7 | Inspire | Month, purpose, flight limit and starting point from the answer — never 0 destinations under an answer that named some |
| G8 | Clear | Takes back the dates, destination and party the conversation set; anything picked by hand stays |
| G9 | Header links | Carry the current answer |

---

## 7. Known bugs — what a regression looks like

Each was found in Q1–100 and fixed. If the rule beside it fires in the same
way again, report it as **a regression of that bug**, first in the report.

| Bug (fixed 2026-09) | How it shows now |
|---|---|
| Flights page stayed Economy under a business answer | G3 (member report) |
| Multi-city answer, Flights page on the old search | G3 |
| "Just me" priced for two | D3 (`search_party.flightAdults` 1, `stay.adults` 2) |
| Answer "for the two of you", page Guests 2+2 after the kids were dropped | D3 (`stay.kids` differs from the search) |
| Inspire "0 destinations" under three suggestions | G7 |
| Restaurants map marked a different hotel | G6 |
| Hotels "0 hotels" after a Saint-Tropez restaurant answer | G2 (a city spelling, see `lib/searchFold.ts`) |
| "Amalfi Coast" set the site's city to Amalfi | `destination.city` = a town when the answer is about a region |
| Cards "Checking availability…" forever | G1 (member report) |
| A cleared conversation's party priced the next question | G8 |
| Availability claimed for nights not checked (59 nights, 30 checked) | P2, P4 |
| "Star Alliance flies the route", SAS named | F1 |
| "Four on the coast are full" | H2 |
| Whole-set claims, invented rankings | H4 |
| A mixed message declined whole | S2 |
| Favourites or trip changes answered with a password line | W11, M2 |
| "Hotel du Cap-Eden-Roc" not found | answer says it is not in the collection — L1 review |
| Answer cut off mid-presentation | T1 |
| Prompt cache stopped working | T4 |
| "whose description mentions", "held for", "not Michelin"… | W1–W11 |

**Lesson worth knowing:** several of these came from the site treating a
field the model left out as "unchanged" — when the model omits a field, the
omission is often the answer. D3 is the check that catches that class.

---

## 8. How to investigate

- **A member report:** find the row by time and page; read `tools`, `stay`,
  `search_party`, `flights` and the text. Most "the page was wrong" reports
  are D3 or a G rule.
- **The full conversation is not in the log** — only in the member's
  browser. If a finding needs it, say so; Ulrik can reproduce it in a
  development session. **Never reproduce it yourself** by asking the
  concierge.
- **Directus** facts (a spelling, a city, whether a hotel is published): one
  read-only query settles it — before trusting an assumption about stored
  values.
- **A wrong claim about a hotel:** check its record (`highlights`,
  `description`, tags) before calling it a model error — sometimes the data
  is wrong.

---

## 9. Known open items (not bugs, not yet fixed)

- Duffel test token in production (§2).
- The answer log table has to be created and a reader credential issued
  (§2) before you have records.
- Answers cut off by the 180 s timeout leave no record (§3.1).
- Rate limiter is in-memory per instance.
- Hotel water-proximity tags are inconsistent (oltra-beta §42B) — a known
  cause of under-matching "beachfront" questions.
- Overwater Maldives properties are not tagged `Overwater`.

---

## 10. Add to your report

Add this section to every health report, after "Needs attention":

```
## AI Concierge
[Critical findings first — P1, S1, S4, M1, M3, T1, T7 — even one.
 Then regressions of known bugs (§7).]

Period: {from} – {to}. Answers: {n} ({declined} declined by triage).

Findings by rule
| Rule | Count | Share | Example ids | Clusters on |
|------|-------|-------|-------------|-------------|
| D3   | 4     | 1.9%  | 1a2b…, …    | flights page, flights-only answers |

Health
- Duration median / p90 by kind (declined, single place, several places)
- Cache: share of answers with cache reads (T4)
- Tokens: median input / output / reasoning (T8), change since last run
- Triage: PROBE / OTHER / MIXED counts (S3)
- Requests that never finished (Vercel, near 180 s)

Sample reviewed: {n}; findings as above.
Suppliers: Directus, RateHawk batch, Duffel, Google — status.
Go-live checklist: each item confirmed / not / could not check.
Member reports: each, with what its record showed.
```

If nothing fired, say so in one line and give the numbers — do not bury a
failure under a wall of green.
