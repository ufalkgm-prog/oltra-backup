# KAYAK integration — plan for review

Status: **proposal, nothing built.** Written 2026-10-01 for Ulrik's review. No code, no Directus change, nothing committed.
Inputs: the two sandbox tests (`kayak-sandbox-test/REPORT.md`, git-ignored), KAYAK's RAML specs (`hapi_affiliate.raml`, `iris_affiliate_flights_v1.raml`), KAYAK's "Getting Started" page, and a read of the current code (paths below are under `hotels-beta/`).

**Ground rules this plan is built on**
- **myOLTRA is never the merchant of record.** KAYAK is search plus a click-out to the airline, hotel or agency. The KAYAK API has no booking endpoints, so there is nothing to wall off — but no step below adds a payment, a guest-details form, or a booking write.
- **Everything is switchable off.** Two flags, both off in Production by default. With a flag off, the site behaves exactly as today, byte for byte in what users see.
- **RateHawk does not change.** KAYAK hotel rates appear only on hotels RateHawk cannot sell.
- **Duffel does not change.** KAYAK flights sit beside it behind a flag.

---

## 1. What exists today (the parts KAYAK touches)

### Flights
- **There is already a supplier seam.** `src/lib/flights/itinerary.ts` defines a supplier-neutral `Itinerary` / `FlightLeg` / `Segment` model and a `FlightConnector { id; search(q): Promise<Itinerary[]> }` interface (:162). Duffel is one implementation, `src/lib/flights/providers/duffel.ts`, whose header already names Kayak as a future sibling.
- **The UI consumes only our own types.** It never sees Duffel shapes. That covers FlightsView, FlightCardContent, FlightDetailsPopup, FlightResultRow, LandingSummary, AiResultFrames, SavedTripsView and TripComBookButton. Two small leaks remain: `CabinClass` is imported from `@duffel/api/types` in `SavedTripsView.tsx:18` and `flights/test/page.tsx:4`.
- **Search is one synchronous call.** `POST /api/flights/search` calls `duffelConnector.search` and keeps a 15-minute in-memory cache. There is no polling anywhere.
- **BOOK goes to Trip.com.** It is a link built from legs, cabin and passengers only (`tripComHandoff.ts` → `tripCom.ts`), logged by `recordBookClick` as `flight_tripcom`. The Duffel price is shown as an approximation ("~", rounded).
- **Not shown today:** the fare brand (`FlightLeg.fareBrand` is parsed but rendered nowhere) and the operating carrier (only `marketing_carrier` is read).
- `/api/flights/offer/[id]` and `/api/flights/inquiry` have no callers. This plan leaves them alone.
- **The landing-page teaser** (`LandingSummary.tsx:205-240`) fires one search **per candidate airport × per cabin**. That matters for KAYAK's rate limits (§5).
- No feature flag exists on flights. `DUFFEL_ACCESS_TOKEN` is read only in `duffelClient.ts`.

### Hotels
- **Status:** `ratehawk_status` (`active` / `passive` / `not_integrated`, §42). The Hotels page branches on `=== "passive"`, and nothing branches on `not_integrated`. Passive hotels are excluded from every availability batch: the results list (`HotelsView.tsx:2372`), the landing page (`LandingSummary.tsx:367`), the concierge frames (`AiResultFrames.tsx:264`) and `rankAvailabilityFor` (`lib/ai/tools.ts`). They show "Book on website" (a `www` link) or the unlinked text "Check availability on website".
- **Images:** `cardHelpers.ts` uses Directus `hotel_images` first, else `ratehawk_image_1` (and lazily 1–50 via `/api/hotels/[id]/ratehawk-images`). A hotel with neither shows a placeholder and is left out of the featured pool (`hasHotelPhotos`). `next.config.ts` allows only `cdn.worldota.net` and the Directus host.
- **Booking links:** `buildBookingLink.ts` handles `official` / `booking` / `cj_booking`. In practice no published hotel has these fields set, so cards fall back to `www`.
- **Taxes:** RateHawk's non-included taxes are kept separate ("+ taxes at hotel").

### Concierge
- **Flights:** `lib/ai/flightSearch.ts:86` calls `duffelConnector.search` directly.
- **Hotel availability:** `rankAvailabilityFor` calls `fetchRatehawkSerpBatch` directly.
- **No-price guarantee:** tools return `priceRank` / `available` only, never an amount. Prices are rendered client-side by `AiResultFrames`, which calls `/api/ratehawk/availability/batch` and `/api/flights/search`.
- **No booking writes:** every tool is read-only by construction, and no tool can book.
- **Flag:** the concierge sits behind `NEXT_PUBLIC_AI_CHAT_ENABLED`.

---

## 2. Shared foundation — `src/lib/kayak/` (server-only)

One small client module used by both hotels and flights, following the `ratehawk/availability.ts` pattern for host variables.

| Env var | Where | Meaning |
|---|---|---|
| `KAYAK_API` | Vercel Preview + Production (server-only), local `.env.local` | API key. The existing name is kept. Never `NEXT_PUBLIC_`, never logged. |
| `KAYAK_API_HOST` | same | e.g. `https://sandbox-en-us.kayakaffiliates.com`. **Empty or unset means KAYAK is off**, whatever the flags say. |
| `KAYAK_HOTELS_ENABLED` | same | `1` turns on hotel rates and click-outs. Anything else means off. |
| `KAYAK_FLIGHTS_ENABLED` | same | `1` turns on KAYAK as the flight search provider. Anything else means Duffel, as today. |

- **The flags are server-read, not `NEXT_PUBLIC_`.** The server decides, and pages receive a boolean prop from their server component. That way one variable gates both the API routes (404 when off) and the UI, and a client bundle can never turn a feature on by itself. (On Vercel, any env var change takes effect after a redeploy. See the kill-switch checklist in §6.)
- **Headers KAYAK requires** (learned the hard way: their absence gave a blanket 403):
  - `User-Agent`: the visitor's own, forwarded from the request.
  - `x-original-client-ip`: the visitor's IP, from `x-forwarded-for` on Vercel.
- **`userTrackId`:** a random UUID per visitor session, held in an httpOnly session cookie (`oltra_ktid`) that the server creates on first KAYAK use. It is never a constant: KAYAK lists constant or shared values as a reason to rate-limit or block. Server-side concierge calls use the same visitor's cookie.
- **Sandbox guard (production safety):**
  - `kayakEnabled()` returns false when `VERCEL_ENV === "production"` and `KAYAK_API_HOST` contains `sandbox`. It also logs one error line per cold start.
  - Every outbound link (`bookUri`, `bookingUrl`) passes `isAllowedKayakLink(url)`. In production that means `https:`, and a host that contains no `sandbox` and isn't `affiliates.kayak.com/sandbox-clickout`. A failing option is **dropped**, not shown with a dead link.
  - Both checks get unit tests in `src/lib/kayak/guard.test.ts`, which runs in the existing `npm test` (`node --test`).
- **Fail fast, no retry**, like the RateHawk proxy decision. Each API call has its own timeout, and the error states never say "unavailable" when the truth is "KAYAK didn't answer".
- **Rate-limit awareness:** stop and surface on HTTP 429. A small in-memory counter logs when the hourly budget is 80% used.

---

## 3. Hotels

### 3.1 Which hotels get KAYAK
**Rule:** KAYAK is called for a hotel only if `kayak_hotel_id` is set **and** `ratehawk_status !== "active"`.

- Active RateHawk hotels never touch KAYAK, so the RateHawk flow, Prebook and the White Label seam are unchanged.
- The passive exclusion from the RateHawk batch stays exactly as it is. KAYAK gets its **own** batch.
- **Scope today:** 147 published hotels are not `active` (135 passive, 5 not_integrated, 7 with no status). Part A matched them; the staged CSV is in `oltra-agents/agents/database-agent/hotels/pending/kayak-hotel-matches.csv`.
  - **High confidence: 85.** Every word of our name is in KAYAK's name, same country, within 1 km.
  - **Medium: 41.** Review list in `…/flagged/kayak-hotel-matches-REVIEW-2026-10-01.md`.
  - **Not matched: 21.** Mostly African safari lodges (&Beyond, Singita, Wilderness, Mombo) plus North Island, Aman Le Mélézin, Airelles Saint-Tropez and The Danai.
  - **So KAYAK fills about 126 of the 147 gaps,** but not the safari lodges, which are the largest group RateHawk can't sell either.

### 3.2 Directus — additive fields only
New script `scripts/kayak/add-kayak-fields.mjs`, copied from `scripts/ratehawk/add-ratehawk-content-flag-fields.mjs`:
- `GET /schema/snapshot` before and after.
- `isAlreadyExists()` accepting both 400 and 409.
- Diff the snapshots to confirm **N additions, 0 modifications, 0 removals**.

| Field | Type | Meaning |
|---|---|---|
| `kayak_hotel_id` | integer (bigInteger), nullable | KAYAK's hotel id (e.g. 7848107). Null means "not linked". |
| `kayak_match_confidence` | select-dropdown, `allowOther: false`: `high` / `medium` / `manual` | How the link was confirmed. `manual` = Ulrik checked it by hand. |
| `kayak_matched_at` | timestamp | When the id was written. |

**Writing the ids:** `scripts/kayak/apply-kayak-matches.mjs --csv <approved file>`.
- **Dry run by default.** `--confirm` to write. Every write goes through the Directus REST API.
- **Never overwrites.** It PATCHes only rows whose `kayak_hotel_id` is currently null, and it re-reads each row just before writing.
- Only rows whose confidence was approved, and only rows Ulrik approved.
- Writes `scripts/kayak/output/rollback-<date>.json`, listing every id it touched with the prior (null) values.
- **Readback check after writing:** every intended row holds the expected id, and no other field changed (compare a before/after export of those rows).
- **Duplicates:** two Directus hotels mapped to the same KAYAK id means the script refuses both. This already happens once: KAYAK id 315929, "Phinda Forest Lodge", is the nearest candidate for Phinda Rock, Forest and Vlei (3008/3009/3010). It sits 557 m from our *Rock* Lodge coordinates and 13.4 km from our *Forest* Lodge coordinates. **One side has the Phinda positions wrong. Check the Directus coordinates for 3008/3009 before trusting either.**

`kayak_hotel_id` is a small integer, so it is safe to add to the bulk field lists: `hotels/page.tsx` `hotelFields`, `app/page.tsx`, `api/ai/hotels` `CARD_FIELDS`, `lib/ai/tools.ts` `CANDIDATE_FIELDS`. It is also added to `HotelRecord`.

### 3.3 Rates and the click-out
- **New route `GET /api/kayak/hotels/batch`.** It takes up to 250 KAYAK ids (KAYAK's `khotels:` limit), with dates, party and currency, and calls `/api/3.0/hotels` with:
  - `destination=khotels:…`, `onlyIfComplete=true`, repeated while HTTP 202 (max ~20s);
  - `responseOptions=multipleHotelsAllRates,rateBreakdown`, `includeTaxesInTotal=true`, `includeLocalTaxesInTotal=true`, `currencyCode=<display currency>`.
  - It returns a normalised shape (`KayakHotelOffer`), never KAYAK's raw response.
- **Party format:** KAYAK's `rooms` is a party string, `adults:childAges|…` per room. (Note that `rooms=2` means *one room, two adults*, a trap found in testing.) We build it from the same round-robin spread the RateHawk path uses (`buildGuestsArray`), so both paths price the same party. KAYAK could price different occupancy per room, which RateHawk can't (§32). That is not used now, to keep the two paths consistent.
- **Provider choice per hotel:**
  1. Prefer providers with `isDirect: true` (the hotel's own site or chain) when their price is within **5% or €50, whichever is larger,** of the cheapest.
  2. Otherwise take the cheapest.
  3. Show at most three providers, named, with the direct one labelled "Hotel's own website".
- **Taxes, shown clearly:**
  - The headline is the **total stay price including all taxes and fees**, labelled exactly that way ("Total for 3 nights, incl. taxes and fees").
  - Where `rateBreakdown` gives `taxes` / `localTaxes`, the detail panel lists base rate, taxes, and local taxes (payable at the hotel).
  - We never fold in or hide a figure, and never add a markup.
- **Other rate details:**
  - **Free cancellation:** `hasFreeCancellation`, shown as "Free cancellation (per provider's terms)". KAYAK gives a yes/no only, not a schedule.
  - **Breakfast:** inclusion code `0`. The other inclusion codes are 1 lunch, 2 dinner, 3 meals, 4 all-inclusive.
- **Click-out:**
  - A plain `<a href={bookUri} target="_blank" rel="noopener noreferrer sponsored">`, passed through `isAllowedKayakLink`.
  - Logged with `recordBookClick` as a new kind, `hotel_kayak`.
  - **Superseded 2026-10-01 (Ulrik):** the button is the shared **BOOK** (`components/hotels/HotelBookButton.tsx`, built that day). It opens a pop-up naming the booking site and showing the KAYAK rate; its Continue opens `bookUri`. No checkout UI of ours sits in between. Until KAYAK is live, the same pop-up sends KAYAK hotels to their own website (`KAYAK_BOOKING_LIVE` in `lib/hotels/bookingPartner.ts`).
- **Where it renders:**
  - The HotelsView results card (the passive branch, :3040-3207). When KAYAK has a rate, it replaces "Book on website" / "Check availability on website". Otherwise today's copy stays.
  - The selected-hotel panel (:3880-3913).
  - `HotelSmallCard` (landing and concierge cards).
  - Each takes a `kayakEnabled` prop. With it false, the code path is the current one.
- **Caching:** rates are cached ≤15 minutes per (ids, stay, party, currency), with links included. This is pending KAYAK's answer on caching (§8).

### 3.4 Images — fetch live or store?
KAYAK returns a gallery per hotel with `responseOptions=images`: an array of `{large, small}` URLs, 22–60 per hotel in the sandbox, all placeholders there.

**Measured in Part A: galleries don't depend on availability.** A dated search only returns hotels that have rates on those dates; 10 of 20 sampled hotels were missing for 14–17 Jun 2027. The same 20 ids searched **without dates** all came back, and 19 had a gallery. So images are fetched by an **undated `khotels:` search with `responseOptions=images`**, one call for up to 250 hotels, separate from the rate search.

| | Fetch live by id, when needed | Store URLs in Directus |
|---|---|---|
| Freshness | Always current. Removed photos disappear. | Goes stale. KAYAK image URLs may rotate or expire (unknown). |
| Speed | One extra call per view. Cards in a list would need one batched call per page. | Instant, like `ratehawk_image_1` today. |
| Rate limits | Counts against KAYAK's hourly limit. | No calls after the sync. |
| Terms | Hotlinking may need KAYAK's permission. Caching certainly might. | Storing is a form of caching: **most likely to breach terms if they forbid it.** |
| Reversibility | Turn the flag off and the images are gone. | Needs a cleanup script. |
| What we can test now | URL shape only. The sandbox serves one placeholder image. | Same. |

**Recommendation: live, behind the hotels flag, with a short server cache (≤24h), and nothing written to Directus until KAYAK confirms caching and hotlinking.**
- KAYAK images become a **third tier** in `cardHelpers.ts`, after Directus images and RateHawk.
  - They are used only for hotels with a `kayak_hotel_id` that currently have **no** photo. That is mainly the `not_integrated` and no-status rows; most passive hotels already have `ratehawk_image_1`.
  - Shown with a "Photos: KAYAK" credit, like `hotelImageCredit`.
- **Kept out of the featured-mode pool** (`hasHotelPhotos`) at first, so the landing hero never depends on a third party.
- **`next.config.ts` `remotePatterns`:** gains the production image host only once known (the sandbox uses `content.r9cdn.net`, and the spec example uses `www.kayak.ch/h/run/api/image`). Until then, plain `<img>` without Next optimisation.
- **If KAYAK permits storing:** a later, separate step adds `kayak_image_1..N`, mirroring the RateHawk image fields, through the same additive-script pattern.

---

## 4. Flights

### 4.1 Provider switch
- **New** `src/lib/flights/providers/kayak.ts` exporting `kayakConnector: FlightConnector`. It is a sibling of `duffel.ts`, as the existing comment anticipates.
- **New** `getFlightConnector()`, which returns `kayakConnector` when `KAYAK_FLIGHTS_ENABLED` is on (and the guard passes), else `duffelConnector`. It is used in the two places that call Duffel today:
  - `api/flights/search/route.ts:201`
  - `lib/ai/flightSearch.ts:86`
- Duffel code, the token, the normaliser and the Trip.com builder are **untouched**. Flag off means the same function returns the same connector as today.

### 4.2 Where Duffel and KAYAK differ

| | Duffel (today) | KAYAK |
|---|---|---|
| What it is | One offer source (airline NDC/GDS fares), one price per offer | Metasearch: many sellers per itinerary (airline sites and agencies), each with its own price and link |
| Call pattern | One synchronous call | Start, then poll through first-phase → second-phase → complete (~15s in testing) |
| Re-fetch an offer | `offers.get(id)` (route exists, unused) | Only within the search session (`/details` with `searchId` + `resultId`) |
| Times | ISO with time zones, terminals, aircraft | Local times without offsets, aircraft name, no terminals |
| Baggage | Quantity per passenger per segment | Included / fee / unavailable flags, bag fees in money, airline bag-size policy |
| Conditions | Refund / change before departure (tri-state) | Fare family amenities: refundable, change, seat, legroom, **lounge access**, wifi… |
| Fare brand | Parsed, not shown | `fareFamilies[].displayName`, per leg or whole trip |
| Operating carrier | Not read | `operationalDisplay` / `operationalIATA`, **must be shown** |
| Passengers | Children by exact age | Types: ADT, SNR 65+, YTH 12–17, CHD 2–11, INS / INL (infant in seat / lap) |
| Price basis | `total_amount`, whole party (stored as `priceEur`, misnamed) | `priceMode` `perPerson` by default. **We request `total`** to match. |
| Booking | We send people to Trip.com | We send people to the seller KAYAK returns (`bookingUrl`) |
| Test mode | `duffel_test` token marks data synthetic | Sandbox: real schedules, fake prices, USD and US market only |

**What Duffel does that KAYAK won't:**
- time zones and terminals in the popup;
- retrievable offer ids for saved trips (`externalFlightId`);
- per-passenger baggage quantities;
- exact child ages;
- one fast call rather than a 10–20 second poll.

Saved trips made from KAYAK results store the itinerary and an approximate price only. KAYAK's links expire with the search, so a saved trip must re-search rather than reuse a link.

### 4.3 Polling and paging
- **Start:**
  - Body: `searchStartParameters {cabin, passengers, legs[{origin, destination, date, flex:"exact"}]}`. No `filters.includeSplit`, so split bookings stay excluded, which is the default.
  - `resultParameters {currency, priceMode:"total", pageSize:200, sort:{key:"price", direction:"asc"}}`.
  - Currency goes in the body. The query parameter was ignored in testing.
- **Poll** with `{searchId}` and `&cluster=` every 1.5–2s.
  - Return to the caller when `status === "complete"`, or when the 20s budget runs out after `second-phase`. KAYAK's spec says second-phase results are to be shown "as if they were complete".
  - First version: the route polls on the server and answers once, so `FlightConnector.search()` keeps its current signature and the UI keeps its loading state.
  - A later step can stream progressive results.
- **`pageSize`:** default 50, maximum 999. **200** keeps a business search (209–1,160 results in testing) within one page after server-side filtering. Measure the response size in sandbox: 50 results were ~225–700 KB.
- **Cache:** the route's existing 15-minute cache applies. Shorten it for KAYAK if their answer on link lifetime requires (§8).

### 4.4 Filtering for premium searches
**Proposal: hide by default, label on request.**
- **Default:** show only itineraries where **every segment's** `segmentFares[].cabin.code` is the requested cabin or higher (`first` counts for `business`). Anything with an `economy`, `premiumEconomy` or `mixed` segment is hidden.
- **Opt-in:** a quiet link, "Show N options with part of the journey in a lower cabin". Those then show a clear chip, "Economy on CPH–ARN", per affected segment.
- **Why hide:** in testing, 3 of the 5 cheapest "business" results to Doha and Singapore had an economy leg. Shown by default, the cheapest-first list would lead with them.
- **Always excluded, with no toggle:**
  - `type: "split"` (never requested);
  - any option with a `virtualInterline` or `selfTransferProtection` badge;
  - any segment with `isSelfTransfer: true`;
  - segments of `type` `train` / `bus`, unless the leg is all ground transport (rare; logged).
- **Also send `includeLongFlights: false`** (KAYAK's own "bad itinerary" filter).

### 4.5 Choosing the seller for each itinerary
- Among an itinerary's surviving booking options, let **P** = the cheapest price.
- **Prefer the airline's own site** if its price is **≤ P × 1.05 or ≤ P + €75, whichever is larger.** An airline site is a `direct` ("Book direct") badge, or a `providerCode` that is an airline in the response's `airlines` map.
- Otherwise use the cheapest.
- The itinerary's headline price is the chosen seller's price, not P. So we never show a price, then send the user somewhere dearer without saying so. If the chosen price is above P, the card says "From €X at {agency}" under "More sellers".
- **"More sellers":** up to 4 others, each with name, price and link.
- Both thresholds are named constants, so they can be tuned without a rewrite.

### 4.6 What the flight card shows (additions only when KAYAK is the provider)
- **Fare family name** per leg or trip (`fareFamilies`). The existing `FlightLeg.fareBrand` field carries it, finally rendered.
- **Amenity chips:**
  - checked bag, seat selection, change, refund, lounge access, legroom;
  - each marked Included / Fee / Not allowed / Flexible.
  - A missing amenity is shown as "Not specified", never as "No".
- **Bags:** included or fee, with the fee (`fees.checkedBag` / `carryOnBag`), and a link to the airline's bag-policy page (`airlineFeeUrl`).
- **Operating carrier disclosure (required by KAYAK):** under each segment, "Operated by {operationalDisplay}" whenever present. That is the code-share case, where the operator differs from the seller.
- **Non-refundable disclosure (required by KAYAK):** `fees.nonRefundableDisclosure`, shown **verbatim** next to the BOOK button whenever present. It is not truncated or paraphrased.
- **BOOK:** "Continue to {seller}", linking to `bookingUrl` through `isAllowedKayakLink`. It is logged as `flight_kayak` and replaces `TripComBookButton` **only** while the KAYAK flag is on. With the flag off, Trip.com is exactly as today.
- Prices keep today's approximate display ("~", rounded), labelled as the seller's price at the time of search.
- **Not changed in this phase:** Duffel results still don't show operating carrier or fare brand. Both would be good small fixes there too, as a separate change.

### 4.7 Concierge
- `lib/ai/flightSearch.ts` switches from `duffelConnector` to `getFlightConnector()`. Nothing else in the concierge changes shape:
  - **Prices still never reach the model.** `searchFlightOffers` returns `priceRank` only, computed from the chosen seller's price after the cabin and self-transfer filters.
  - **Price display** stays in `AiResultFrames`, which calls `/api/flights/search` and therefore gets KAYAK when the flag is on, rendering through `FlightResultRow`.
  - **No booking writes:** KAYAK has no booking endpoint. The concierge never receives `bookingUrl` either; links render only in the card component. This is a structural rule, enforced by the normaliser returning links in a field the tool's projection does not copy.
  - **Time budget:** a KAYAK search takes ~15s inside a tool call. The tool passes a 20s budget and, on timeout, returns "searching took too long — offer to try again". It never makes up an answer.
- **Hotels in the concierge:**
  - `rankAvailabilityFor` stays RateHawk-only.
  - KAYAK hotels appear in concierge answers as cards, with their price rendered client-side by `HotelSmallCard` through the KAYAK batch route.
  - The model learns only `available` / `priceRank` for them, through a parallel KAYAK projection with the same no-amount rule.
  - Phase 4, not phase 2.

---

## 5. Rate limits — the risk worth designing for

Sandbox limits are 250 searches per hour each for flights and hotels, site-wide. Production limits are unknown (§8). Today's code would exhaust that quickly:
- **The landing teaser** searches every candidate airport × every cabin. With KAYAK on, it should run **one** search: the top gateway from `rankGateways`, requested cabin only. It should share the route cache, and show "Search flights" rather than a price when the budget is low.
- **The Hotels results list** sends one KAYAK batch per result page (≤250 ids per call), never one call per card.
- **The concierge** reuses the route cache, keyed identically.
- **429 from KAYAK** means stop: the UI says "Prices are temporarily unavailable — try again shortly". It never shows "No availability".

---

## 6. Rollback safety

### 6.1 Flags and host
- **`KAYAK_HOTELS_ENABLED` and `KAYAK_FLIGHTS_ENABLED`:** separate, default **unset (off) in Production**, set to `1` in Preview for testing.
- **`KAYAK_API_HOST`:** sandbox in Preview. In Production it stays **unset** until affiliate approval, then is set to the production host KAYAK gives us. Moving from sandbox to production, or turning KAYAK off, is an env var change only.
- **Defence in depth:** even if a flag were set in Production with the sandbox host, the guard in §2 disables KAYAK. Any individual link pointing at a sandbox domain is dropped in Production regardless.

### 6.2 Code and release order

> **Note:** CLAUDE.md §14 says this repo uses no branches, only linear commits on `main`. **This plan follows your instruction to use a branch instead**, because the work spans weeks and must not reach `main` before approval. Please confirm, and I'll add a one-line exception to §14 when we start.

1. All work on branch **`kayak-integration`**. Vercel builds a Preview deployment for each push.
2. Preview env vars: `KAYAK_API`, `KAYAK_API_HOST` (sandbox), both flags `1`. Testing happens on the Preview URL.
3. Merge to `main` **only after your approval.** Production then has the code with both flags off, so it behaves as today. Verify: flights show Trip.com BOOK, and passive hotels show "Book on website".
4. **After affiliate approval:** set Production `KAYAK_API` (production key) and `KAYAK_API_HOST` (production host). Redeploy. Still no visible change.
5. Flip `KAYAK_HOTELS_ENABLED=1` in Production. Redeploy and verify. Later, separately, do the same for `KAYAK_FLIGHTS_ENABLED=1`.

### 6.3 Directus rollback
The three fields are new and nothing existing depends on them, so rollback can't touch other data.
1. **Empty them:**
   - `node scripts/kayak/apply-kayak-matches.mjs --rollback scripts/kayak/output/rollback-<date>.json --confirm` sets the three fields back to null on exactly the rows the apply touched.
   - Readback confirms every one is null.
2. **Or remove them entirely:**
   - Directus admin → Settings → Data Model → `hotels` → `kayak_hotel_id` → Delete Field. Repeat for `kayak_match_confidence` and `kayak_matched_at`.
   - This drops only those columns.
   - First remove `kayak_hotel_id` from the bulk field lists in code (or turn the hotels flag off and deploy), or Directus will reject requests that ask for a missing field.
3. Take a `GET /schema/snapshot` before and after either step, and diff to confirm only those fields changed.

### 6.4 Kill-switch checklist (for Ulrik, no developer needed)
**To turn KAYAK hotel prices off:**
1. Open vercel.com → the oltra project → **Settings** → **Environment Variables**.
2. Find `KAYAK_HOTELS_ENABLED` in the **Production** environment. Click ⋯ → **Edit**, change the value to `0`, and click **Save**.
3. Go to **Deployments**. On the top deployment marked **Production**, click ⋯ → **Redeploy** → confirm. Env var changes only take effect on a new deployment.
4. Wait until it shows **Ready**, about 2–4 minutes.
5. **What you should see:** on Hotels, hotels like Cheval Blanc Paris show "Book on website" again, with no KAYAK prices or "Continue to …" buttons. Every other hotel is unchanged.

**To turn KAYAK flights off:** the same steps with `KAYAK_FLIGHTS_ENABLED`.
- **What you should see:** flight results come from Duffel again. The BOOK button opens the Trip.com dialog, and there are no "Continue to {seller}" buttons, fare-family chips or "More sellers".

**To turn all of KAYAK off at once:** set `KAYAK_API_HOST` to empty (or delete it) in Production, then redeploy. Both features switch off.

**If something is badly wrong and a redeploy isn't fast enough:** Deployments → open the last deployment from **before** KAYAK went live → ⋯ → **Instant Rollback**. That takes seconds, but it also undoes any other code changes made since. Use it only as an emergency brake.

*(A switch that works without a redeploy would need a runtime config store such as Vercel's Global Config: a new library and service. Not proposed, since the rules say no new libraries unless asked. Say if you want it.)*

---

## 7. Phases, effort, and what can be done now

| Phase | Work | Rough effort | Sandbox now? |
|---|---|---|---|
| 0 | Approve the staged matches. Additive Directus fields + apply script (dry run, then write). | 0.5 day + your review time | **Yes.** The ids are real in the sandbox. |
| 1 | `lib/kayak` client: headers, userTrackId cookie, sandbox guard, link guard, tests. Env vars on Preview. | 1 day | **Yes** |
| 2 | Hotels: batch route, normaliser, provider choice, tax display, click-out in list / panel / small card, live images as a third tier. | 3–4 days | **Mostly.** Structure, flags, links and image plumbing can be built. Prices and real images can't be judged. |
| 3 | Flights: connector, polling, `pageSize`, cabin and self-transfer filters, seller choice, fare family / amenities / disclosures / "More sellers" UI, BOOK click-out. | 4–5 days | **Mostly.** Real schedules, fare families and disclosures come back. Prices are fake and USD only. |
| 4 | Concierge (flights through `getFlightConnector`, KAYAK hotel projection), landing teaser rate-limit changes. | 1–2 days | **Yes** (with the concierge flag on in Preview) |
| 5 | Production: key, host, link-domain check against real links, `remotePatterns`, flag flips one at a time. | 0.5 day + monitoring | **No.** Needs affiliate approval. |

**Waits for affiliate approval:**
- real prices, and any judgement of KAYAK's price competitiveness (e.g. QR160 vs Amadeus);
- EUR and a European point of sale for flights;
- the production host and link domains;
- production image hosts;
- commission tracking actually recording our clicks;
- production rate limits.

**Total build:** roughly 10–13 working days, plus review rounds.

---

## 8. Open questions for KAYAK that affect the build

1. **Rate limits in production** for hotel and flight search, per key or per userTrackId? Is there a separate allowance for server-side concierge searches?
2. **Caching:** how long may we cache search results, and do `bookUri` / `bookingUrl` expire? (This decides the 15-minute cache.)
3. **Images:** may we display hotel images by hotlinking the returned URLs? May we store the URLs, or the images? Is attribution required? Which hosts will production use?
4. **AI concierge use:** may results feed an AI assistant's ranking (prices withheld from the model, shown only in our UI)? Any conditions on server-initiated searches and the `User-Agent` / `x-original-client-ip` we send for them?
5. **Commission tracking:** how are clicks attributed (affiliate id in the link, userTrackId, cookies)? How do we see reporting? Any sub-id parameter for placement, like Trip.com's `trip_sub1`?
6. **Market and currency:** in production, can flight searches use a European point of sale and EUR? Is there a European host (e.g. `…-en-gb` or `…-de-de`)?
7. **Hotel `totalRate` for multi-room searches:** is it the total for all rooms searched, or per room? (RateHawk's equivalent once overstated prices ×N, §32.)
8. **`isDirect` coverage:** do luxury independents (Cheval Blanc, Aman, Airelles) appear as direct providers in production?
9. **Display requirements:** beyond `operationalDisplay` and `nonRefundableDisclosure`, are there mandatory labels, logos or "Powered by KAYAK" attribution, and rules on provider ordering?
10. **Premium filtering:** is there a server-side filter for "all segments in requested cabin" or "no self-transfer", so we don't fetch and discard?
11. **Sandbox key expiry:** sandbox keys last 3 months. Confirm our issue date, and whether production keys expire.
