---
paths:
  - "**/scripts/airports/**"
  - "**/scripts/hotels/geo-2026/**"
  - "**/src/lib/cityAirports.ts"
  - "**/src/lib/transferRoutes.ts"
  - "**/src/lib/transferTimes.ts"
  - "**/src/lib/airportOptions.ts"
  - "**/src/lib/flights/**"
  - "**/src/app/flights/**"
  - "**/src/app/api/flights/**"
---

<!-- Split out of CLAUDE.md on 2026-09-12. The text is moved verbatim and the
     section numbers are unchanged, so every §N cross-reference still resolves.
     This file loads automatically when Claude reads a file matching `paths`
     above; CLAUDE.md keeps a one-line pointer to it for the cases where the
     work starts before any such file is opened. -->

# AIRPORTS AND FLIGHTS

How an airport is chosen for a destination, how the last leg is measured, the Duffel data model, and the standing open items from the geography workflow. Run both audits before picking any of it up.

---

## 7B. FLIGHTS PAGE LOGIC (DUFFEL)

### Data model — single ticket per offer

A return trip is **one Duffel offer with two `slices`** at a single `total_amount`. There is no "two one-way tickets" scenario. Inside a slice, `segments[]` are the legs; a slice can legitimately mix carriers. Slices may carry `duration` directly, segments may not — fall back to arriving_at − departing_at.

### `FlightLeg` (`duffelNormalizer.ts`)

Beyond the obvious: `airlines[]` (distinct marketing carriers in segment order, for the combined card label), `longHaulAirline` (carrier of the longest segment, for Tier-A matching), `layovers[]` (`code` for filter logic, `name` for display), `segments[]` (incl. raw `departIso`/`arriveIso` with offset for TZ math), `stopSummary`.

### Return-trip matching (`getReturnMatchTier`)

* **Tier A** — same `longHaulAirline.iataCode` → strong highlight + "Same airline".
* **Tier C** — all carriers across both legs in one alliance (`airlineAlliances.ts`) → light highlight + "Alliance partner".
* The selected card's white outline overrides match styling visually.

### Smart defaults

Max-duration sliders auto-set per result set to `clamp(6, 24, ceil(minDuration × 1.5))`, tracked by `autoDurationKeyRef` so user adjustments survive rerenders but a new search re-applies. Airline filter prefills with all airlines present. Layover filter keys on IATA, displays city names via `layoverAirportMap`. Default departure interval 08:00–24:00 (slider `max=24` so end-of-day is reachable).

### Column alignment

Only `.resultsScroll` scrolls; headers and pinned rows sit outside it. A `ResizeObserver` toggles `hasScrollGutter`, applying `.withScrollGutter { padding-right: 12px }` so columns stay aligned when the scrollbar appears.

### Booking

`BookingBar` was removed. The only book action is the BOOK button inside each `PriceCard`, active only for the Top pick / Fastest rows and the user-selected itinerary.

**BOOK hands the member to Trip.com, and myOLTRA never takes the payment (2026-09-21).** It is an `<a target="_blank" rel="noopener">` built by `buildTripComUrl` (`lib/flights/tripCom.ts`), with the affiliate identifiers in `lib/flights/partners.ts` and nowhere else. **`/api/flights/book-link` was deleted in the same change** — it opened Duffel's hosted checkout, where Duffel took the card, and removing the route rather than only the buttons is what makes that unreachable. Duffel still supplies the search results.

The link lands on a filtered Trip.com *search*, never on the chosen flight: their post-selection URL carries session state that expires and cannot be constructed (`docs/trip-com-handoff-spec.md` §4). There is no airline filter parameter, confirmed by testing — so the copy beside the link must name the carrier and flight numbers, and must not say "book this flight". Prices we show come from a different source than Trip.com's and are labelled **indicative** beside the figure.

**Every handoff renders the flight it means, from the data (2026-09-21).** `TripComMatchNote` (`components/flights/`) prints each leg`s route, date, local departure time and carrier + flight numbers, plus our indicative price, under every BOOK — on the Flights page inside `.pinnedRow` (the price column is a fixed 140px and cannot hold it) and under the leg cards on the landing and concierge rows. Spec §4 asks the *concierge* to name the carrier and flight numbers; that would be a prompt-only rule, and §50`s record is that those get skipped, so it is rendered from `identifyItinerary` (`lib/flights/flightIdentity.ts`) instead. The model is not responsible for it and cannot omit it. Consecutive segments on one carrier group into `Thai Airways TG951, TG471`; a change of carrier reads `Lufthansa LH800 + Swiss LX123`.

`npm test` covers the builder and the identity block (32 cases: all three trip types, four cabins, infants, `rdate` omitted on one-way, the tracking parameters, the currency fallback). What it cannot cover is whether a click registers in the Trip.com affiliate dashboard — that is the silent failure, since broken tracking still opens a working page, and only a human clicking a generated link can check it.

### Cards and popup

Cards are fixed `height: 96px`, three rows: `dep → arr` + duration + (i); airline names + match badge; stop summary. The (i) opens `FlightDetailsPopup` with per-segment detail, layovers, total travel time, and time-zone change computed from the ISO offsets.

### Autocomplete

`AirportAutocomplete` clears on focus, needs ≥2 chars, restores the previous label on blur if nothing new was picked. Panel `min-width: 320px`, `white-space: nowrap`.

### Deep links

`buildInitialSearch` reads `cabin` and `tripType`. Cabins: `Economy | Premium Economy | Business | First`. Trip types: `oneway` (or `one-way`) `| return | multiple`.

**Both one-way spellings only since 2026-09-04** — the URL value has always been `oneway` but the page's own `TripType` is `"one-way"`, so `?tripType=oneway` selected nothing (§50).

**Multi-city legs travel as `leg1`…`leg5`**, each `ORIGIN-DEST-YYYY-MM-DD`. Added 2026-09-04; before that `multiple` mode could not be reached by link. Real legs override `tripType`. The form searches only when every leg is complete — send whole legs and let the array be trimmed to what arrived.

---

---

## 51. OPEN ITEMS — THE GEOGRAPHY WORKFLOW, PAUSED 2026-09-12

Everything below was found and deliberately NOT fixed, each with the reason.
Nothing here is a regression. Two standing audits answer "is anything broken"
in two commands. **They were both at zero at the pause; the airport audit is
went to 56 and back to zero on 2026-09-13 — see *Unpublished hotels leave
parked keys* below**:

```bash
node scripts/hotels/geo-2026/audit-local-area.mjs   # 6 classes, 340 populated
node scripts/airports/audit-airports.mjs            # 4 classes, 0 unreviewed
```

**Run both before picking this up**, and treat a non-zero DEFECT as the whole
task until it is zero again. This list is the separate question: "what did we
choose to leave".

**State at the pause**: 517 destinations, 60 gateway overrides, 59 transfer
routes, `local_area` 340, the airport research queue empty (0 never-reviewed,
so a destination appearing there is genuinely new rather than backlog).

### Decisions someone has to take (not bugs)

* **Hong Kong is stored at ISLAND level** — 10 rows read `Hong Kong Island` or
  `Kowloon`. Finer districts (Central, Wan Chai, Admiralty, Tsim Sha Tsui) are
  defensible and were deliberately not used, because mixing two levels in one
  city is the Midtown defect. Converting means all 10 or none.
* **Rome is stored as LANDMARKS** — `Spanish Steps` ×5, `Colosseum`,
  `Via Veneto` ×2, `Piazza della Repubblica`. Its rioni (Campo Marzio, Ludovisi,
  Trevi, Monti) are the district-level answer. Converting touches 12 rows, and
  the landmarks arguably serve a guest better. Same all-or-none shape.
* **Abu Dhabi's three weakest values** — `Ras Al Akhdar` (Emirates Palace),
  `Al Maqta` (Ritz-Carlton Grand Canal), `Al Khubeirah` (St. Regis). All tier B,
  none named in the hotel's own description, and Abu Dhabi's districts are
  poorly known. First to override if any of the 88 are wrong.

### `local_area` values that would not pass the rules, left alone

Reported by the audit as **candidates**, not defects — the run does not fail on
them:

| value | hotel | why it is questionable |
|---|---|---|
| `Hyde Park Corner` | The Lanesborough | a road junction; the district is Belgravia or Knightsbridge |
| `Village centre` | Pan Deï Palais | a lowercase descriptor, not a name |
| `Moyo Satonda National Park` | Amanwana | a national park |
| `Mo Chu riverbank` | COMO Uma Punakha | a riverbank |
| `Sand Hill Road` · `Midosuji Boulevard` | Rosewood Sand Hill · St. Regis Osaka | roads |
| `Piazza del Popolo` · `Trafalgar Square` | Hotel de Russie · Corinthia London | squares |

`Times Square` and `Madison Square` are **correct** — genuine New York district
names — and should be left.

### Coverage gaps that are real

**21 cities have 3+ published hotels and no `local_area` at all**, and the split
is close to even — an earlier draft of this section named only four urban ones
and undercounted by half, so here is the whole list.

*Correctly empty per §3*, a ski village, resort or reserve having no
neighbourhoods (10): St. Moritz (5), Riviera Maya (5),
Sabi Sand Reserve (4), Lech Am Arlberg (4), Oia (4), Zermatt (3), Grumeti Game
Reserve (3), Phinda Private Game Reserve (3), Providenciales (3), San Jose del
Cabo (3).

*Genuinely urban and therefore a real gap* (8): **Las Vegas (6)** — the Strip is
the obvious value — **Amsterdam (5), Barcelona (5), Geneva (4), Kuala Lumpur
(4), Cape Town (3), Berlin (3), Boston (3)**.

*Marginal, decide when you get there* (2): **Beverly Hills (3)**, a small city
where only the Golden Triangle is a named district, and **Monte Carlo (3)**,
which is already a ward of Monaco rather than a city with wards below it.

### Airport mapping (`cityAirports.ts`) — both closed 2026-09-12

**Menlo Park was already fixed** in the queue pass of 2026-09-12 (`SFO`, `SJC`,
`OAK`) and this list simply had not been updated — it sat here as open while
the queue paragraph below listed it among the 24 fixed. Worth a note because
the contradiction was *inside one section*: when a pass closes items, the open
list is where the update gets forgotten.

**The Grumeti entry understated it by a factor of four.** It reads as one
destination with a Kenyan airstrip among its three. In fact **the Serengeti is
one national park stored under five `city` values** — `Grumeti Game Reserve`
(the three Singita lodges), `Kirawira` (&Beyond Grumeti River), `Serengeti`
(Four Seasons), `Namiri Plains`, and nothing at all for the area key — so the
park had **four independent answers**, three of them bush strips. The Volcanoes
National Park lesson verbatim: fixing one lodge in a park leaves the park
inconsistent. All four now read **`JRO` then `MWZ`**.

* **Kilimanjaro first everywhere**, per the *best-first, not nearest-first*
  contract the concierge tool documents — it is the northern circuit's
  international gateway.
* **Mwanza second, and it is genuinely the nearer one** for the western
  corridor: measured, 146km from Kirawira and 159km from the Singita lodges
  against 347km and 343km to Kilimanjaro. A 3,113m large airport with real
  scheduled service, but regional rather than intercontinental, which is why
  it is second and not first.
* **Arusha (`ARK`) is deliberately absent, and it is the judgement call here.**
  It has scheduled service and much of the Serengeti light-aircraft traffic
  leaves from it — which makes it the **Wilson of Tanzania**, and §3 settled
  Wilson: the international ticket lands at the international airport and the
  light-aircraft hub belongs in the transfer route. It is named in all four
  routes instead.

**Why four destinations covering six lodges read as healthy for a year, and the
reason this is the most useful thing in this entry: Seronera's runway is
2,280m.** That clears `audit-airports.mjs`'s 2,200m jet test, at 27–83km, which
clears its 120km test. Both screens passed. SEU is a gravel strip in the middle
of the park with no international service and no ticket sellable from Europe —
**length and distance cannot separate a small international airport from a long
airstrip.**

So the audit gained a **third screen, on airport TYPE**: OurAirports calls
Seronera and Musoma `small_airport`, while Florence, Santorini and Mykonos —
the false positives the other screens generate — are `medium_airport`. A
`medium` field over 2,200m is not flagged, so Bolzano and Santorini do not
re-enter the queue.

**§37 records that filtering on type was tried and REVERTED** (it sent Missoula
to Spokane, 319km). That is not this, and the distinction is the one §51
already draws: there, type decided *which airport a guest is offered*; here it
decides *which destination a human looks at*. A signal too crude to select an
airport is fine for raising a question — a false positive costs a glance, not a
wrong answer.

**Measured before it was added**: 47 destinations have a small best airport, and
**44 were already in `REVIEWED`** — the Maldivian hops, Mykonos, St Barth, Sabi
Sand, Kruger, Phinda, Bora Bora, Lanai, Tswalu. The three genuinely new ones
were the Serengeti keys. So the screen is almost entirely redundant with the
existing queue *except* for the case that slipped through it, which is the best
possible result: the blind spot has exactly one occurrence and it is now closed.
Candidates 81 → 84, checked 20 → 23, still **0 never-reviewed**.

**The screen was nearly inert on arrival, and that is its own lesson.** The
audit's parser captured `iata`, `distKm` and `runwayM` — **not `size`** — so the
type test would have read `undefined` on every airport and reported a clean
queue, exactly the failure §3 describes: *a check which cannot see a defect
reports zero as confidently as a clean collection does*. The parser now
captures `size` and the audit **aborts** if any airport parses without a size or
runway, rather than screening on a field it failed to read.

**Transfer routes: four added, and they are deliberately NOT a copy of the Mara
entry above them.** The Mara carries a hard road leg to Wilson because every
scheduled Mara flight leaves from there — a fact. The Serengeti does not work
that way: light aircraft run from Kilimanjaro *and* from Arusha depending on
operator and day, so copying the Mara's shape would have invented a mandatory
hour-long transfer many guests never make. The flight is the first leg and
Arusha is a possibility in the note. **The airstrip is left unnamed** — the park
has Seronera, Sasakwa, Kogatende and Grumeti, and which one a given lodge uses
is in our data for none of the six. A vague route beats a guess a guest could
act on. Routes 53 → 57, overrides 56 → 59.

### Unpublished hotels leave parked keys — kept, on Ulrik's decision (2026-09-13)

Between the pause and 2026-09-13 the published count fell **853 → 801**, and
the airport audit went from 0 to 56 defects without a line of code changing.
The trigger was one new gap: **Aman Sveti Stefan was published with no airport
entry.** Fixed from the resort's own "Getting here" page, confirmed by Ulrik —
`"Sveti Stefan": ["TIV", "TGD", "DBV"]` plus a transfer route. Measured to the
door: Tivat 46min, Podgorica 1h14, Dubrovnik 2h26. Aman's own range for
Dubrovnik is 2.5–4 hours, **because of the border**, which a no-traffic drive
time cannot see, so the route's note carries it. Dubrovnik is in Croatia and
is not the Pamushana case: the resort names it as a gateway.

**The rebuild that fixed it also dropped 35 keys**, one per destination whose
hotels are all now unpublished (the Serengeti lodges, Necker, Moscow,
Saint-Barth, Pylos…). That is the generator's contract, not a loss:
`build-transfer-times.mjs` pruned their measured pairs with them (~$0.25 to
re-measure, and git has the old values). **Kruger's centroid moved** when one
of its hotels went, gaining HDS and PHW, so all three of its pairs were
re-measured.

**That left 9 gateway overrides and 12 transfer routes keyed on destinations
with no published hotel.** Ulrik: *"Keep the unpublished entries, they'll come
back."* So `audit-airports.mjs` now reports a key whose destination exists only
among UNPUBLISHED hotels as **parked** (15 keys), not as a defect. **Do not
delete a parked entry.** On republish nothing needs doing to it: the rebuild
restores the key, and the audit fails on the missing last-leg pairs until
`build-transfer-times.mjs` has measured them.

**The check got sharper, not looser**, and it proved that on its first run. A
key matching no hotel at all, published or not, is still a defect, and exactly
one was: **`Amboseli National Park`**. Angama Amboseli's row had gained city
`Kimana Sanctuary`, the private sanctuary east of the park where the lodge
stands, so both the override and the route were answering for nothing. Among
21 standing defects it would have been invisible. Both were re-keyed to
`Kimana Sanctuary`. The route still flies Wilson → Amboseli airstrip, because
that is where the scheduled flights land, about 45 minutes' drive from the
lodge. Kimana's own strip takes private charters only, so it went into the note.
**The row's traveller area had been left blank**, so a search for "Amboseli"
no longer found the lodge. Set to `Amboseli` on Ulrik's instruction the same day
(`set-angama-amboseli-area-2026-09-13.mjs`, rollback file beside it), the
Cernobbio / Lake Como shape. The airport key stays `Kimana Sanctuary`, because
the generator keys on `city` whenever there is one.

### Rule 1 hides a metro's second airport — Tokyo, Kyoto and Taipei fixed (2026-09-14)

Found in concierge testing: "flying from Copenhagen, everything comes in through
Haneda". **Tokyo listed HND alone.** `selectAirports` rule 1 keeps every
airport within 25km, or within 60km whose name or municipality starts with the
city name — and a same-city hit ends the search. Haneda (14km, municipality
Tokyo) qualified; Narita (58km, municipality Narita) never entered the pool.
`GATEWAY_OVERRIDE` now reads `Tokyo: ["HND", "NRT"]`, which also makes Tokyo
hand-ordered (Haneda first: far nearer the city, and where the Copenhagen direct
lands). Transfer measured, `Tokyo|NRT` 63min; audit clean; invariant ok.

**The same blind spot, checked across 31 big metros, found two more, fixed the
same day with the INTERNATIONAL airport first:** **Kyoto** had Itami alone and
now reads `KIX, ITM` (Kansai 91min by road); **Taipei** had Songshan alone and
now reads `TPE, TSA` (Taoyuan 40min). 55 hand-ordered destinations. The audit
cannot see this class: the listed airport is large, near and scheduled, so every
screen passes. Checking a metro means asking "is its main INTERNATIONAL airport
in the list", not "is the listed one plausible".

### Settled, so nobody re-opens them

* ~~**Rosewood Doha stays `city: "Doha"`**~~ — **RE-OPENED AND CHANGED on
  Ulrik's instruction, 2026-09-12.** It now reads `city: "Lusail"` with the
  traveller area carrying `Doha`. The original reasoning is kept because it is
  still true and still the argument the other way: 10.8km from central Doha,
  shares DOH, named "Rosewood Doha", and it does not distort the Doha centroid
  the way the Ras Al Khaimah row distorted Dubai's (removing it moves DOH 10.0
  → 8.4km, both airports unchanged; RAK crossed an emirate line 90km out and
  moved DXB 12 → 19km). **Being defensible was not the same as being right**:
  Lusail is a city and the row now says so.

  **The half that carries the lesson is `state_province_county_island`, not
  `city`.** Setting `city: "Lusail"` alone would have made a hotel *called*
  Rosewood Doha unfindable by searching Doha — the dropdown narrows hotel >
  city > area > admin_region, and "Doha" would have vanished from the row at
  every level. §3's rule is that the traveller area is null for a major city
  "where `city` does the job"; the moment `city` says Lusail it stops doing
  that job, because nobody types Lusail. So Doha moves up a level — the
  Cernobbio/Lake Como shape, which is what the field is for. **A `city` fix
  that drops the name the hotel is marketed under is half a fix.**

  Measured before choosing it: that makes "Doha" a `city` on two rows and an
  `area` on one, and **64 such collisions already exist** — Zermatt, Monte
  Carlo, Riviera Maya, Kruger, Los Cabos — so it follows the collection's
  dominant pattern rather than introducing a shape. The dropdown labels by
  type, so the two entries read "Doha - City" and "Doha - Area".

  **Still open, and deliberately so: `admin_region` stays `Doha Municipality`.**
  Lusail is usually placed in **Al Daayen**, which would make this the Ras Al
  Khaimah shape where *both* fields were wrong — but Lusail Marina is the
  southernmost district, hard against West Bay Lagoon, and nothing available
  here establishes which side of the municipal line it falls. The field is
  locked (292 choices, `allowOther: false`) with no Al Daayen entry, so
  changing it means extending the vocabulary first (§3's order — Directus does
  not validate writes, so patching first succeeds and renders the value blank
  and unselectable). **Extending a locked list to a value nobody has verified
  is the wrong trade**, and leaving it keeps the concierge's never-null
  narrowing axis pointing where a traveller thinks the hotel is. Whoever
  settles the municipality closes this.

  **And whoever publishes 1593 must rebuild `cityAirports.ts`.** The row is
  unpublished and the generator filters `published=true`, so `Lusail` is no key
  at all today. DOH at 14.4km will be the right answer once it is one — but
  until the rebuild runs the flight teaser resolves Lusail to nothing.
  `audit-airports.mjs` fires on exactly that, so the net exists.
* **The eight lodges keep a blank `city`** (§3), and their airports come from
  the traveller-area fallback.
* **The `highlights` voice pass is declined**, not pending — 409 of 903 rows use
  a filler word (*beautiful* 226, *stunning* 135, *amazing* 113), and only 1 of
  the 99 rows added since id 2000 does. Ulrik reviewed rewrites and kept the
  existing copy: "I find the new suggestions too colourless."

### Transfer routes for the concierge — 11 done, the rest open

`src/lib/transferRoutes.ts` (2026-09-11, see CLAUDE-AI.md) holds the
arrival-to-door route per destination, so the concierge stops answering "how do
I get to the Masai Mara" with Nairobi and a full stop. **59 routes populated**
(Zermatt and Marmaris were added 2026-09-12, §52);
an absent entry makes it decline rather than guess, which is the point.

Two candidate groups, both measurable by re-running the same check:

* **The "jet gateway, far away" group is CLOSED** (2026-09-11). Six needed a
  `GATEWAY_OVERRIDE`; **two needed nothing and are recorded as such so nobody
  overrides them later** — Lake Louise already resolves to Calgary, and
  Philipsburg to Missoula, which §37 records as the answer an earlier
  airport-type filter got wrong by sending it to Spokane 319km off.

  | destination | was | now | why |
  |---|---|---|---|
  | Pamushana | VPY, PHW, BEW | **HRE** | **all three were in the wrong country** — Chimoio and Beira are Mozambique, Hendrik Van Eck is South Africa. The lodge is in Zimbabwe |
  | Nikko | FKS, IBR, NRT | **NRT + HND** | Fukushima and Ibaraki came first on distance; Nikko is reached from Tokyo, by train |
  | Sesriem | LUD, WVB, ERS | **WDH** | Lüderitz is 80km closer and a small southern town nobody routes through |
  | Sonop Farm | LUD | **WDH** | same |
  | Big Island | MUE | **KOA** | Kona is 8km further and the island's actual gateway, 3,353m against 1,584m |
  | Chongzou | AEB, NNG | **NNG** | Nanning has the international service; Baise Bama was 15km closer |

  **Sesriem and Sonop Farm also got transfer routes**, because the override
  alone would have left the concierge saying "fly to Windhoek" and stopping
  300km short. Both are the Nairobi shape exactly: Windhoek has two airports
  and the light aircraft leaves from the other one, Eros.

  **Sonop is the weakest entry in `transferRoutes.ts`** and the first to check
  if any prove wrong. Unlike almost every other route there is **no in-data
  evidence at all** — neither its description nor Sossusvlei's mentions
  arriving. It rests on Eros being Namibia's light-aircraft hub, the same
  mechanism already encoded for Sesriem in the same region, and on the lodge
  sitting on a 13,800-acre private reserve with no scheduled service near it.
  The road figure is deliberately loose ("the better part of a day") because
  360km of largely gravel road is not a number worth faking.
* **The ~93 with no jet-capable airport listed are worked through** — the queue
  reached 0 never-reviewed on 2026-09-12. Much of it was noise, as suspected:
  Florence, Mykonos and Santorini are genuine international arrivals that
  merely have short runways. The real ones all have either an override or a
  route now — Phinda, the Maldivian islands off Malé, St. Barthélemy off St
  Maarten, Canouan, Praslin-served Seychelles, Big Island, Arenal, and the
  Serengeti, which turned out to be four keys rather than the one this bullet
  named.

Populate only what is not in reasonable doubt. A wrong route is worse than an
absent one — a guest can act on a boat that does not run.

### `audit-airports.mjs` — the research queue for the 96% nobody checked

Built 2026-09-11 after a fair challenge: this session's airport fixes were all
**exception entries**, so the nearest-wins algorithm's flaw is intact wherever
nobody looked — and what got looked at was whatever Ulrik flagged, biasing
coverage towards the places he can evaluate.

**It is a research queue, NOT an output signal, and that was the decision.**
Surfacing a confidence flag to the guest would hedge on ~14% of the roster,
mostly on false positives, and a hedge the guest cannot act on is noise — they
have no better source than we do. On the Turin case a hedge would have produced
"Turin, though worth confirming", still the wrong airport. The same flag as a
queue gets it **fixed**. Unknowns should become knowns, not caveats.

Same split as `audit-local-area.mjs`. **DEFECTS** (any hit fails the run, all at
zero): a gateway override or transfer route whose destination no longer exists,
a route whose `arriveAt` is not among that destination's airports, a published
destination with no airport at all. **CANDIDATES**: no jet-capable airport
listed, or the jet airport over 120km away — the signature every real error has
carried.

**The audit's first finding was a bug in itself**, which is the right lesson
about screens: Marmaris parsed as having *no airports*, because its label is
`"Rhodes \"Diagoras\""` and the inner quote ended the regex capture early. The
data was fine. It now parses only the fields it uses.

**Top slice worked: 95 → 85 open, 123 → 107 hotels, 21 → 33 overrides.**

| fixed | was | now | why |
|---|---|---|---|
| Saint-Tropez, Ramatuelle, La Croix-Valmer | LTT | **NCE + TLN** | La Môle is a 1,071m private-jet strip with no sellable scheduled service — a flight search against it returns nothing |
| Lake Como ×5 (Blevio, Cernobbio, Moltrasio, Torno, Tremezzina) | LUG | **MXP + LIN + BGY** | Lugano wins on distance and is a 1,415m Swiss field with almost no service |
| Cabo San Lucas | CSW | **SJD** | Cabo San Lucas Intl is the small field; Los Cabos is 28km further and where flights land |
| Arenal | FON | **SJO + LIR** | La Fortuna is an 800m strip |
| Stresa | LUG=MXP tie | **MXP** | tie broken towards 7,840m of runway |
| Andermatt | LUG first | **ZRH** | Zurich was third at 91km |

**Arenal's transfer route moved with it** — it read `arriveAt: "FON"`, which the
airport change would have made invalid. That is the invariant this file broke
once on Sabi Sand, and the audit now checks it.

**Four big hits were FALSE POSITIVES and are deliberately not overridden**,
because a real international airport can have a short runway: Florence (1560m),
Santorini (2197m), Mykonos (1902m), Bristol for Bath (2011m). Sabi Sand,
Kruger, Okavango, Bora Bora, Lanai and St Barth flag too, but there the small
airport **is** the arrival airport and each already has a transfer route.
**Phinda is left alone on purpose**: Mkuze takes the light-aircraft leg from
Johannesburg and its route says so, and Durban at 228km would be a worse
primary, not a better one.

**The queue was then worked to empty, 2026-09-12.** All 85 remaining candidates reviewed: **24 more genuine errors fixed, 61 reviewed and deliberately left.** 56 overrides now, and the audit reports **0 never-reviewed** — so a destination appearing in that line from here is genuinely new, not backlog.

The 24: five US rows standing next to a bigger airport (**Menlo Park** on a 799m GA field with SFO 26km away, **Kapalua** on a 914m strip with Kahului at 26km, **Rancho Santa Fe**, **Palmetto Bluff**, **Dorado**); nine European fields with minimal service (**Casares** → Málaga, **Lamego** → Porto, **St Andrews** and **Fife** → Edinburgh, **Fort William** → Inverness, **Gordes** and **Le Baux** → Marseille, **Cerretto Langhe** → Turin, **Elounda** → Heraklion, since Sitia is the far end of Crete); **Perez Zeledón**, **Hua Hin**, **Natales** → Punta Arenas; four private-island resorts on their own strips (**Kokomo**, **Laucala**, **Turtle Island** → Nadi, **Amanpulo** → Manila), three of which name the gateway in their own descriptions.

**Two rows were pointing at a lodge airstrip in the wrong country.** **Namiri Plains** is in the eastern Serengeti, in Tanzania, and was mapped to `MRE` — the Mara Serena strip, in Kenya, across a border. Now Kilimanjaro. **Olarro Lodge** reached Nairobi through an override keyed on `Inakara Road` — because that is what its `city` held, and its own text confirms it is a *street*: "off Inakara Road near Ngoswani Village". **Both halves fixed 2026-09-12** (`fix-olarro-city-2026-09-12.mjs`): the city was cleared, so Olarro now reaches Nairobi through the `Masai Mara` area key its four siblings already use, and the `Inakara Road` override was deleted in the same pass. **56 overrides.** Clearing the row without removing the entry would have left the dead override the audit fires on — the `Perez Zeledón` defect again, one day later.

**I also reversed myself on Lugano.** I had left it alone as "its own airport, and correct" while moving the five Lake Como villages off `LUG`. But the reason they moved — Lugano has almost no scheduled service left — applies to Lugano itself. Malpensa first, its own airport second.

**The audit caught my own accent slip on its first real run**: I typed `Perez Zeledon` where the city is `Perez Zeledón`, which made the override a dead key answering for nothing. Exactly the §49 trap, caught by a machine rather than by eye.

Lugano now maps `MXP` then `LUG`.

**Two wine-country fixes, found in concierge testing 2026-09-15.** `Puligny-Montrachet` listed only Dijon and Dole — both "medium", both with next to no scheduled service, so no screen flagged them — and now reads **`LYS, GVA`** (1h45 and 2h28 by road). **`Montalcino` shows a blind spot of the size rule**: Florence was already listed first, but an uncurated list takes its primary by size then runway, and Perugia's 2,199m beat Peretola's 1,560m, so the concierge flew Copenhagen to Perugia. Hand-ordered **`FLR, PEG`**. Any uncurated key whose nearest large airport has a short runway can hide the same inversion — worth a sweep. 57 hand-ordered destinations; audit clean; invariant ok.

### Due on the clock, not from this workflow

**Ratehawk hotel status re-probe, due 2026-11-16** (§42, §43). It is the one
maintenance job with no automation behind it.

---

---

## 52. THE AIRPORT IS CHOSEN ON THE WHOLE JOURNEY (2026-09-12)

Three faults reported together, and they turned out to be one: **nothing in the
codebase knew how long the last leg takes**, so no airport choice anywhere could
weigh the flight against the drive.

`cityAirports.ts` holds straight-line `distKm` and forbids reading drive time
off it (§37, §51 — a line crosses the Alps, a road does not). `transferRoutes.ts`
holds modes, legs and who arranges them, and **not one duration**. So "which
airport" was answered by a rule about the PLACE, never about the journey, and
the concierge could recommend the airport with the shortest transfer while
adding a change of planes that cost more than it saved.

### The measured case, which is the whole argument

Courchevel 1850 from Copenhagen. Geneva is 2h49 by road, Chambéry 1h40 — so
anything reading the transfer alone answers **Chambéry**, which is largely winter
charter and reached with a connection. Door to door: **Geneva 4h54, Chambéry
6h42.**

### What was built

* **`src/lib/transferTimes.ts`** (generated) — driving time per (destination,
  airport) pair, measured by Google Distance Matrix to the same hotel centroid
  `distKm` uses. **671 timed pairs, 69 with no road, 4 the API cannot route.**
  743 elements, **$3.71**, on the key the restaurant geocoder already uses.
  Its own file rather than a field inside `cityAirports.ts`, because that file
  is rebuilt on every roster change and a rebuild without a Google key would
  silently drop every time it holds.
* **`src/lib/flights/gatewayRanking.ts`** — adds the flight and the transfer and
  ranks. Shared by the concierge and the classic pages, because two
  implementations of this is how the two halves came to disagree in the first
  place.
* **`compareGateways`** — a concierge tool; see `CLAUDE-AI.md`.
* **`scripts/airports/build-transfer-times.mjs`** and
  **`verify-gateway-ranking.mts`** (run with `npx tsx`, not a dependency).

**Per destination × airport, not per hotel** — the option that was on the table.
Ten Courchevel hotels share one road from Geneva, and a per-hotel copy of it is
ten values that can drift apart; it follows `transferRoutes.ts` for that reason.

### `pickPrimaryAirportForCity` could not see the curation — the classic half

It sorted by size then runway, so **Val d'Isère and Courchevel resolved to LYON
and Zermatt to ZURICH** on the Flights page and in saved trips, while the
concierge read the same list in order and said Geneva. One roster, two answers.
The generator's own comment said the hand-ordering "only affects display order";
it did not. Overridden keys are now emitted as `CURATED_GATEWAY_ORDER` (59 of
517) and their first entry is the primary. **Not a blanket "first wins"** — for
everything else position one is the nearest strip, and New York has to stay JFK.

### `ZERO_RESULTS` IS A QUESTION, NOT AN ANSWER — three tables, not one

The first run reported 76 pairs with no road route, and **two different kinds of
wrong were hiding in it.**

**Seoul was in the list, from both its airports**, which cannot be true: Google
publishes no driving directions anywhere in South Korea. That one was caught
because it is absurd on its face. So `UNROUTABLE_BY_API` holds the four where a
road exists and the instrument cannot see it — Seoul ×2, Skukuza's unmapped
reserve tracks, Zhuhai across the Macau border — with the reason on each, so the
file never asserts something false and nobody "fixes" Seoul from memory.

**Zermatt was the other kind, and it took two corrections from Ulrik.** All five
points tested in the village returned ZERO_RESULTS, because no engine routes a
car into a car-free village. First reading: "there is no road" — wrong. Second:
"the road stops at Täsch" — also wrong; **Täsch is where you change if you come
by TRAIN.** The road runs to Zermatt's own transfer station, a permitted
transfer drives it, and an electric taxi covers the last ten minutes to any
hotel. So `ROAD_CONTINUES_PAST` measures to the last routable point and adds a
**stated allowance** for the rest (20 minutes), emitted as `ROAD_ALLOWANCES` so
a partly-stated figure is never read as fully measured. Zermatt now has real
numbers: **Geneva 3h10, Malpensa 3h09, Zurich 4h00.**

**The lesson generalises past both.** A routing engine's refusal describes the
engine's rules for private cars, not the world: it cannot see a mapping
restriction, a border checkpoint, an unmapped track, or a village that admits
only electric vehicles. The three tables are exclusive and the generator throws
if a destination lands in two.

**Transit mode is not the fix either, measured rather than assumed.** Google does
answer Seoul in transit (ICN 1h45, GMP 1h04) — and answered Zermatt at 5h37 from
Geneva where the rail time is about four hours, because a transit result depends
on the minute it was asked about. A baked value that moves with the timetable is
worse than an absent one.

### THE TRAP THAT MATTERS MOST: the Duffel token is `duffel_test`

**That environment fabricates a nonstop on every route.** Measured: CPH–AXA
returns a single segment, "Duffel Airways", **10h31 nonstop to Anguilla**;
CPH–CMF a nonstop British Airways to Chambéry. Real routes merely have more of
it — CPH–GVA returns 89 offers against 2 — and every one is one segment.

Everywhere else this is harmless, because a card displays what the supplier said
and a test fare is obviously a test fare. Here it **decides**: fed invented
nonstops, every airport looks equally reachable, the shortest drive wins, and
the environment reproduces the exact bug the ranking removes — looking like a
failed fix. So `flightDataIsSynthetic()` gates it: the tool declines to rank and
says so, and the landing page leaves its blocks in curated order. **Verify the
production token is a live one, or this feature does nothing in production
either.**

### A DIRECT FLIGHT OUTRANKS TOTAL TRAVEL TIME, and on a short flight it nearly always wins

Two tiers, both stated as **the saving a stop must deliver**, because that is the
figure with a meaning — the multiplier the comparator needs is derived from it
(requiring a saving of *s* means scoring the connection at `1/(1-s)` of its
length).

| | A stop is offered only if it cuts | Scored at |
|---|---|---|
| **`STOP_MUST_SAVE_SHARE`** | **25%** of the door-to-door time | 1.33× |
| **`SHORT_HAUL_STOP_MUST_SAVE_SHARE`** | **40%**, when the best direct flight is under 4 hours (`SHORT_HAUL_FLIGHT_MINUTES`) | 1.67× |

**The short-haul tier is the important half, and it is Ulrik's:** *"I would much
rather drive another hour than risk a stop."* On a short hop the change of planes
is most of the misery of the journey while the saving is small in absolute terms
whatever it looks like as a percentage, so the bar is deliberately near-prohibitive.
It is a high bar and not a ban — a stop saving 59% of a short journey still wins.

**The tier is chosen ONCE per comparison, from the best DIRECT flight** — "flights
under four hours", not journeys. It has to be decided once: a per-candidate test
would judge a 5h connection by the loose rule while judging the 2h direct it
competes with by the strict one. With no direct anywhere in the list every
candidate is penalised alike, so the tier changes no ordering and the fastest
flight of any kind stands in.

**Three wrong answers before this one, each overruled, and all three looked
reasonable when written.** 45 minutes let a stop win by saving three quarters of
an hour. A flat three hours could never be cleared on a short trip however much
of it was saved — Toulon direct at 4h beat Nice-with-a-stop at 3h. A flat fifth
then treated a two-hour flight and a twelve-hour one as the same problem.

**The penalty lives in the comparator, which is why it is minutes rather than a
rule** — adding a constant to one side is a transitive ordering, so the sort is
well defined. It replaced a promotion pass that was not, and a non-transitive
comparator returns a different answer depending on which pairs the sort happens
to compare.

**`CURATED_GRACE_MINUTES = 45`** is the one promotion left: a hand-ordered first
choice keeps its place unless it loses by more than 45 minutes. From Copenhagen
both Geneva and Lyon are nonstop and the totals put **Lyon ahead for Courchevel
by nineteen minutes**; nineteen minutes, measured to a centroid on a no-traffic
estimate, is not grounds to overturn a recorded human decision.

**But curation may NOT put a change of planes ahead of a direct flight, at any
margin — and that limit is stated rather than left to the arithmetic.** The first
version compared raw totals and answered a connection over a direct 25 minutes
behind it; comparing PENALISED minutes fixed it only while the penalty was three
flat hours, and the moment it became proportional the connection came back,
landing 42 minutes behind, inside the grace. **Twice the same defect from two
different numbers means the rule was missing, not mistuned.** The two claims are
separate: curation records *which airport guests use for a place* and can settle
a close call between comparable journeys; whether *this* guest has to change
planes is not a fact about the place at all.

**Curation also applies where there is NO road time**, which is where it was
wrong for a different reason. Gating the promotion on having door-to-door totals
looked reasonable — no totals, nothing to be close on — but the destinations
without a road time are the reserves and the islands, **exactly the ones whose
gateway was chosen by hand**. The verifier caught it: the Serengeti answered
**MWZ**, because Mwanza came back 18 minutes quicker in the air than
Kilimanjaro, and §51 put Kilimanjaro first deliberately as the northern
circuit's international gateway. Eighteen minutes of air time is not a reason to
unpick that. Zermatt moved the same way and for the same reason — Zurich is 20
minutes quicker in the air, Geneva is the hand-ordered choice, and Geneva now
holds.

**A nonstop airport is timed on its NONSTOP.** An earlier version marked a
candidate direct if any itinerary was, while building its total from the
*quickest* itinerary — so an airport could be called direct and timed as a
connection. If we would book the nonstop, the nonstop's duration is the one that
goes in the total; `fastestFlightMinutes` still reports the quickest of any kind
separately.

All the constants are stated judgements, not measurements, and each is one named
export away from being retuned. `verify-gateway-ranking.mts` covers **nine cases
and four property assertions**, and has caught five real defects: the promotion
order, the direct-flight timing, curation overreaching at two different
penalties, and curation not applying at all where there is no road time. Four
cases exist purely to pin the margins on both sides of both tiers, so a future
retune cannot move a line silently.

**Every case says whether it is a REAL timetable or a CONSTRUCTED probe**, and
that labelling earns its keep: an earlier version had Toulon holding the
Copenhagen direct and Nice needing a connection, which is backwards, and reading
it against what you know of the route makes you doubt the logic rather than the
fixture. A probe must be shaped by the rule it probes without also pretending to
be a fact about a route.

### Never invent a transfer duration

A destination whose last leg is a light aircraft, boat or seaplane has no road
time worth adding — **the drive to Namiri Plains measures ten hours and nobody
makes it** — so those rank on flying time and say the transfer is still to be
confirmed. Same for no-road and unmeasured pairs, and for a measured figure that
cannot be true of any vehicle: Spanish Town from Tortola is 13km in 91 minutes,
9km/h, a ferry wait folded into a drive. `transferRoutes.ts` stays the answer a
guest is given.

### MEASURING THE TRANSFER IS A DETECTOR FOR THE WRONG AIRPORT — Marmaris

**Marmaris listed one airport and it was RHODES**: a Greek island, in another
country, 40km away as the line goes and **7h28 by road and ferry**. Dalaman, its
actual gateway, was not in the list at all.

**No existing screen could have found it.** `audit-airports.mjs` tests runway
length, distance and airport size, and RHO passes all three — a large airport
with a 3,306m runway, 40km away. It surfaced only because the last leg was
measured: a seven-and-a-half-hour drive to somewhere 40km off is a shape nothing
else in this file can see. **That is the argument for measuring the transfer even
where the airport list looks healthy**, and it is worth re-reading the
over-four-hours candidate list in that light rather than as noise.

Fixed 2026-09-12 from Ulrik's own knowledge of the coast — `Marmaris: ["DLM",
"BJV"]` plus a transfer route. Dalaman measures 1h28 / 95km to the town against
his "90–100km, 1h15–1h30", so the two agree; Bodrum stays as a second airport
and is the longer road either way, though **his three hours against a measured
1h55 is the traffic model we deliberately do not have** — trust his figure for a
summer drive.

Three things in it generalise:

* **Rhodes is DROPPED, not demoted** — the Pamushana rule. An airport in the
  wrong country is not a worse option, it is the wrong question. The 50-minute
  catamaran is real and belongs in the route's note.
* **The straight line disagrees with the road, again.** Bodrum is *closer* as
  the crow flies (64km against 67) and half an hour further by car, with nearly
  twice the runway — so the old size rule would have answered BODRUM. It answers
  Dalaman only because the key is now in `CURATED_GATEWAY_ORDER`. The two halves
  of this section work only together.
* **The property is not in the town.** Our one Marmaris hotel is D Maris Bay,
  out on the Hisarönü bay, so the stored figure is 1h58 and not the town's 1h28.
  Both are right; the stored one is to the door.

**No fares in the note, structurally.** It reaches the model through
`nearestAirport`, and §50's guarantee is that the concierge never receives a
figure it could quote — so the transfer price is left out and "booked in
advance" carries the useful half.

### Found by the new data, not fixed

* **Papas Beach** measures 5h05 from Paros and 3h36 from Naxos, both
  ferry-inclusive, which suggests the centroid is not on the island its airports
  are on. Worth ten minutes with a map.

---

This document is the baseline context for all OLTRA development sessions.
