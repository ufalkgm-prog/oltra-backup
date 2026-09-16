---
paths:
  - "**/src/lib/ratehawk/**"
  - "**/src/app/api/ratehawk/**"
  - "**/etg-proxy/**"
  - "**/etg-static-sync/**"
---

<!-- Split out of CLAUDE.md on 2026-09-12. The text is moved verbatim and the
     section numbers are unchanged, so every §N cross-reference still resolves.
     This file loads automatically when Claude reads a file matching `paths`
     above; CLAUDE.md keeps a one-line pointer to it for the cases where the
     work starts before any such file is opened. -->

# ETG RATEHAWK

Everything ETG/RateHawk: what is BLOCKED and must not be built, the display rules certification depends on, the forwarding proxy that holds the credentials, and the offline static-content sync. Read the BLOCKED list before writing any booking code.

---

## 32. RATEHAWK / ETG INTEGRATION

**This is the live section for anything ETG.** §26–§30 are the build history.

### Model

Affiliate API, contract AFF-392026. ZenHotels is the consumer brand, RateHawk the partner API layer, same inventory. **Use Affiliate API documentation only** — never B2B/wholesale endpoints, `deposit` payment type, net pricing, or fake-gross commission. myOLTRA is never merchant of record.

Agreed architecture: myOLTRA owns discovery (search, hotel pages, rate display). ZenHotels owns checkout at `hotels.myoltra.com` via CNAME and is merchant of record.

### Certification scope — confirmed by ETG (2026-09-16)

Under the White Label model we complete **only the General, Static Data and Search step sections** of the certification checklist. **Booking and card tokenisation do not apply.** Seseg confirmed myOLTRA calls Prebook to obtain the hash the White Label redirect carries, so Prebook is ours and everything after it is ZenHotels'.

### Out of scope — do not build

Create / Start / Check booking process; credit card tokens, `pay_uuid` / `init_uuid` / `return_path`, 3DS; booking status webhooks or state machines; Retrieve or Cancel booking. **These endpoints are active on our key** (`/overview/`, 2026-09-16) — the proxy allowlist is what keeps them unreachable (§47).

**Still unknown: the redirect itself.** ETG have not specified the URL, which parameters accompany the p- hash, or whether anything is posted rather than linked. The code stops at a marked seam (`WHITE LABEL REDIRECT SEAM` in `HotelsView.tsx`) — **do not guess the format.**

**Sandbox and test bookings are treated as real orders.** Do not execute any booking call without explicit confirmation from Ulrik in-session.

### Hosts and credentials

`RATEHAWK_API_URL` is a single config value read from env, never hardcoded per call. **Since 2026-08-19 deployed environments point it at the Railway proxy** (§47), which holds the credentials and gives ETG fixed source IPs. Local dev calls ETG directly. The single-config-value rule is what made that a one-variable change.

ETG's stated production host is `api.ratehawk.com` (migrated from `api.worldota.net`, same auth and payloads). Host configuration was established during live testing — **the code wins over documentation**; note a discrepancy rather than "correcting" it.

Sandbox key: RateHawk Backoffice → Settings → API tab. One key covers search, booking and content. Never mix keys, IDs or static content across environments.

#### What this key reaches — Content API enabled 2026-08-24

| Endpoint | Status | Rate limit (our key) | Docs claim |
|---|---|---|---|
| `GET /api/content/v1/filter_values` | 200 | 30 / 60s | 60 QPM |
| `POST /api/content/v1/hotel_ids_by_filter/` | 200 | 30 / 60s | 60 QPM |
| `POST /api/content/v1/hotel_content_by_ids/` | 200 | 30 / 60s | 1200 QPM, max 100 hids |
| `POST /api/b2b/v3/hotel/info/` | 200 | 30 / 60s | — |
| `POST /api/b2b/v3/hotel/info/dump/` | 200 | 5 / 60s | — |
| `POST /api/b2b/v3/hotel/info/incremental_dump/` | 200 | 5 / 60s | — |

**The real per-key limit is what `debug.api_endpoint` reports, not what the docs say** — the docs advertise 1200 QPM for `hotel_content_by_ids` and our key returns 30. Read the limit off the response.

**A 524 is not a 403 — do not read it as "still not enabled".** A Cloudflare `524` after 100s with no ETG `debug` block means the request *reached* ETG and the backend took too long. Cause was the body: `hotel_ids_by_filter` takes `country` / `kind` / `star_rating` / `serp_filter` / `updated_since` / `supplier_type` / `preferable` / `top` **and nothing else**. There is no `limit`, no `region_id`, no `inventory`; unknown keys are silently ignored, so `{inventory, limit, region_id}` is an unfiltered global query over ~3.16M hotels that times out at the edge. Any real filter answers in 1–7s.

`country` takes ETG's own **integer** country ids (Monaco 120, France 59, UK 190 — 234 total), not ISO codes. Get them from `filter_values`, which is a **GET with no body**, unlike everything else here.

#### `hotel_content_by_ids` vs `/hotel/info/`

Compared field-by-field on three hotels: **36 keys from `/hotel/info/`, 35 from `hotel_content_by_ids`, zero differing values on the 35 shared keys.** The single omission is the top-level `images` array — the deprecated one byte-identical to `images_ext`. Costs nothing.

**`rg_ext` is present and identical** (33,519/33,519 room groups across the roster), which is what room-image matching depends on. Room-group images, `room_group_id`, `name_struct`, `room_amenities`, `size`, `metapolicy_struct` and `metapolicy_extra_info` are all present too — so swapping the static source is a source change only.

Request body is `{hids: [Int], language: "en"}`. **`ids` (the legacy string form) is deprecated** — use `hids`, which is what `hotels.ratehawk_hid` already stores.

#### Measured cost of a full static pull

853 hotels with a hid → **853 returned, zero missing, 9 requests, 8.5s, 58.7 MB**, covering 33,519 room groups and 160,972 room images. 101 hids returns `400 invalid_params`.

**This replaced the full dump as the sync source** — the dump is ~2.8 GB and ~10 minutes for the same 853 hotels. `updated_since` on `hotel_ids_by_filter` works for incremental refresh, but returns hids across **all** of ETG's inventory matching the filter (France alone: 199,074 total), so intersect locally — and at 8.5s for a full refresh, incremental may not be needed.

**The offline-sync rule is unchanged.** ETG's docs: *"Do not call this endpoint during live user search sessions or when displaying hotel lists. This endpoint is intended exclusively for scheduled, offline content synchronization."*

### ETG source IPs

Supplied 17 Aug 2026 as the addresses to whitelist **on our side**: `95.213.146.120/29`, `5.8.78.64/29`, plus Cloudflare's published ranges. **Only relevant if ETG calls us, i.e. webhooks** — still open pending the handoff answer, so no action yet. The two `/29` blocks are the meaningful ones; the Cloudflare list is far too broad to be a real control.

### Flow (our scope)

Search by hotel IDs → Retrieve hotelpage → Prebook → [White Label redirect — format not yet specified]. Hash chain: `h-…` from hotelpage (valid 24h) → Prebook → returns `p-…` (valid 6h). **Prebook is part of the search step** and must be excluded from the booking flow. We never call `/serp/region/`, `/serp/geo/` or `/serp/prebook/`.

### Prebook (built 2026-09-16)

`lib/ratehawk/prebook.ts` → `POST /api/ratehawk/prebook` → the proxy (only while `ETG_PREBOOK_ENABLED=1`, §47).

* **Fires only on the guest's Continue click** in the Hotels panel — never on load, never on a selection change. Our key allows **5 prebooks / 60s** site-wide.
* `HotelpageHash` / `PrebookHash` template types keep the chain explicit; the route refuses anything not shaped `h-…`, the library anything not returning `p-…`.
* **`price_increase_percent: 10`**, and **every** change is shown before the guest continues — up or down, price or terms. Within the tolerance ETG may substitute a rate of the same room and meal type that **swaps refundable for non-refundable**, which `changes.price_changed` does not report; so `rateChanges.ts` compares price, currency, meal, free-cancellation date and `match_hash`. The tolerance never decides what the guest accepts — a lower one would only turn small movements into `no_available_rates` dead ends.
* The prebooked rate is normalised by `toGroupedRoom()`, the same function as the hotelpage list, so a change shown can never be two parsers disagreeing.
* Error mapping: `rate_not_found` → expired, `no_available_rates` → unavailable (both refresh the rooms), `endpoint_exceeded_limit` → busy, proxy 404 → disabled.
* **The seam explains itself**: a confirmed rate shows "Your rate is confirmed. Checkout is being configured and is not live yet. Nothing has been booked or charged." with a passive Continue — no supplier or partner named (Ulrik: how the partner is named at checkout is decided separately).
* Flag `NEXT_PUBLIC_RATEHAWK_PREBOOK=1` — **on in Vercel Production**, because ETG review the live site. It is build-inlined, so turning it off needs a redeploy; the no-deploy kill switch is the proxy variable.
* Verified live 2026-09-16 on 8473727: `h-f198…` → `p-4f07…`, price, meal, cancellation and `match_hash` unchanged, `price_changed: false`, ~0.9s, `Cache-Control: no-store`.

### One rate covers every room searched (measured 2026-09-16)

**A rate's `show_amount` is the total for the whole `guests` array, not one room.** The same rate searched for 2 rooms returned exactly 2.000× its 1-room price and `daily_prices` on Bulgari Paris, George V and Fouquet's. §30's "N copies of the cheapest room" formula multiplied by the room count again, so **every multi-room price was overstated by a factor of N** — headlines on results, landing and concierge cards, and the Hotels panel total.

Fixed: `computeHeadlinePrice` no longer multiplies; the quantity steppers are gone — the guest picks **one room type** for all rooms searched, labelled "total stay, N rooms"; a note tells multi-room guests to search one room at a time for different types.

* **Saved trips created before 2026-09-16 hold inflated totals** (×N for multi-room saves, and the headline fallback was ×N²). New saves store the whole-party total split evenly across `quantity` so `SavedTripsView`'s `price × quantity` sums back to ETG's figure. Old rows were not rewritten; "Update price and availability" re-prices one correctly.
* **Product gap, not a closed question: different occupancy per room** (Room 1: 2A+1C, Room 2: 2A). Search takes a total party plus a room count and spreads it round-robin, so the checklist's multi-room test case is answered "not supported". Two rooms with different occupancy is a normal family booking in our segment — wanted later, not now.

### Guest information (2026-09-16)

* **Passport country is a visible field** in `GuestSelector` (hotel searches only), searchable, defaulting from the browser locale and round-tripping as `?residency=`. ETG's mandatory test case — 1 room, 2 adults + child aged 5, **Uzbekistan citizenship** — must be executable without editing a URL. Verified live on 8473727 with `uz`. (§39 had demoted it to an understated line because the price effect is ≤3%; nothing else argued against the field.)
* **A child's age is never defaulted.** `buildGuestsArray` used to send 10 for a missing age, and two callers hit it silently: the landing summary sent `childrenAges: []` always, and Hotels read ages from the URL while reading counts live. Now search does not run, with helper text; the routes return 400; `buildGuestsArray` throws; the concierge's availability tool tells the model to ask.
* **6 adults + 4 children per room** enforced in the selector (steppers stop, helper text) and by the routes (400). The rule is `adults ≤ 6 × rooms`, `kids ≤ 4 × rooms`, since the party is spread round-robin. Shared as `guestSelectionIssue()` in `lib/guests.ts`.
* **No hardcoded residency left.** `AiResultFrames` and the concierge's own availability call sent `"gb"` for everyone; they now use the guest-selector choice from the URL, else locale (`currentResidency()`), passed to the chat route beside `pageContext` — never to the model.

### Static content

Built 2026-08-24 — `etg-static-sync/`, §48. Daily job, Content API, 853 hotels in 9 requests. The dump (weekly) and incremental dump (daily) remain a fallback. **The live path no longer calls ETG for static data at all** — the only `/hotel/info/` references under `src/` are comments.

### Display rules (all certification-checked)

* **Pricing is gross** — `amount` / `show_amount` already include ETG's commission. Never add markup. Verified: `ratePrice()` reads `show_amount`/`show_currency_code` directly.
* **Non-included taxes shown separately**, never folded into the price. `tax_data.taxes` lives on the rate's **primary payment type** (`payment_options.payment_types[0].tax_data.taxes`), not on the rate. Each room row shows "+ taxes at hotel" when a non-included tax exists; the detail popup lists included taxes (informational) separately from not-included ones, in their own currency (a Dubai city tax in AED beside a USD room price) and never converted into the headline.
* **Cancellation policies** parsed from `cancellation_penalties.policies`, shown unmodified. Like `tax_data`, this lives on the **primary payment type**, not the rate — before that was found, `freeCancellationBefore` read as `undefined` on every rate and the popup always said "Non-refundable". `free_cancellation_before: null` means no free cancellation. The popup renders the full schedule — every window and its charge, with `0` shown as "no charge" rather than omitted.
  * ETG returns bare no-offset UTC timestamps. `new Date()` on `"2026-09-22T11:00:00"` parses as **local** per the JS spec — append a "Z" first. `formatRatehawkUtcDateTime()` converts to browser-local with an explicit `GMT±N` label.
  * **`Intl`'s `toLocaleString` throws `RangeError` if `dateStyle`/`timeStyle` are combined with `timeZoneName`** — a hard crash on opening the popup, not a silent no-op. Spell out `year`/`month`/`day`/`hour`/`minute` individually instead.
* **Room static data matched on `rg_ext`**, compared **field-by-field**. Never compare `rg_ext` via `JSON.stringify()` — `/search/hp/` and `/hotel/info/` serialize the same object in different key orders, so identical data fails. (The earlier "0/5 matches, use room_name" finding was this bug plus a `RawRoomGroup` type that never declared `rg_ext`.) `room_name` containment is now only a fallback, and logs a warning.
* Rate name from `room_name`; meal type from `meal_data.value`, never presented as better than what ETG sent.
* First search step shows one or two lowest rates per hotel; all rates only on the hotel page.
* ETG is our only supplier. Upsells (early check-in / late check-out) are not applicable to the Affiliate API — skip.
* **`residency` collected on the first search step** and sent on all `/search/serp/*/` and `/search/hp/` requests. Hardcoding a default counts as not implementing it. Defaulted from the browser locale, chosen in the guest selector's "Passport country" field (restored 2026-09-16 — §39 had removed it after measuring the effect at ≤3%), and sent on every request.
* **`metapolicy_struct` and `metapolicy_extra_info` are both displayed** (2026-09-16) — "Hotel policies" in the Hotels panel, via `GET /api/hotels/[id]/ratehawk-policy` (per hotel, never a bulk field list) and `lib/ratehawk/metapolicy.ts`. Every key was profiled across all 853 hotels first. Amounts shown as sent in their own currency; `unspecified` omitted; a zero price with no currency reads "charge not specified", never "free"; extra_info (118 of 761 carry HTML) is reduced to plain paragraphs and never rendered as HTML. Check-in/out times shown, `00:00:00` treated as unspecified.

### Caching

Never cache Retrieve hotelpage or Prebook responses — prohibited. Hotelpage rates are storable ~1 hour for display only. Verified: `/api/ratehawk/availability` fetches fresh every request.

### Limits and timeouts

* Max 300 hotels per Search by hotel IDs request — **enforced**: `fetchRatehawkSerpBatch` splits into chunks of 300, sent **sequentially** (`SERP_CHUNK_CONCURRENCY = 1`). ETG document per-window counts, not a concurrency cap, but do not rule one out; raise only if they confirm. It already mattered — a country search or the concierge can exceed 300. Verified: 301 hids → 2 requests, 248 priced, a hid from the second chunk present, 19.7s.
* Max 9 rooms per rate, same room type only.
* Max 6 adults + 4 children per room; children are 17 and under, ages passed as an array (`"children": [7]`) — **enforced** (Guest information above).
* Stays up to 30 nights — **enforced** (2026-09-16; the forms allowed 42): helper text under the dates on Hotels and landing, SEARCH passive with the same reason, no pricing on landing or concierge cards, 400 from the availability and saved-trip routes, and a tool error telling the concierge to shorten or split the stay. Shared as `lib/stay.ts` (nights counted in UTC, so a daylight-saving change cannot miscount). Check-in no more than 730 days out is **not** enforced.
* Search `timeout: 30` — **sent** on `/search/serp/hotels/` and `/search/hp/` (`ETG_SEARCH_TIMEOUT_S`). HTTP timeouts sit above it: proxy 40s, Vercel 45s (§47).
* Prebook takes no timeout parameter; ETG recommend 60s, 30s minimum. Proxy 60s, Vercel 65s, route `maxDuration = 75`.
* `price_increase_percent` **10**, every change shown (Prebook above).

#### Our key's request limits (from `/api/b2b/v3/overview/`, 2026-09-16)

| Endpoint | Limit |
|---|---|
| `/search/hp/`, `/hotel/prebook/` | **5 / 60s** |
| `/search/serp/hotels/`, `/serp/region/`, `/serp/geo/` | 15 / 60s |
| `/hotel/info/`, Content API | 30 / 60s |

Site-wide, not per user. **At 5/min the sixth hotel opened in a minute gets no rooms.** `hp` is now debounced 450ms like the results batch (2026-09-16) — before that every form edit while a hotel was open cost a request, and a date range cost two. A probe run hit `429 endpoint_exceeded_limit` itself. Possibly test-key limits that rise at certification — raise with ETG either way. Headers are `x-ratelimit-limit/-per/-remaining/-reset`; the proxy does not forward them, but the body's `debug.api_endpoint` carries the same.

### Certification deliverables (non-code)

Test hotel `hid` 8473727 / `test_hotel_do_not_book` must be mapped — confirmed present, and still returns rates on our key (2026-09-16). ETG's generic certification page lists `10004834` and `8819557`: those are **sandbox** fixtures; 8473727 came from Valeriy for our test key. Not a conflict.

Certification is conducted **in writing over 14–30 days**; for a website ETG want live site access or a video of the flow, plus the mandatory Pre-certification Checklist and test-case results.

**Drafts for Ulrik's review** (uncommitted until he says): `etg-certification/` at the repo root — `endpoint-diagram.md`, `workflow-table.md`, `rpm-estimates.md`.

### Open

* Check-in over 730 days out is not enforced in the search form.
* Different occupancy per room — product gap (above).
* `hp` at 5/min site-wide — ask ETG for post-certification limits.
* The White Label redirect format (ETG).

Resolved and no longer open: IP whitelisting (mandatory — §47), where the sync runs (Railway — §48), Content API provisioning, live static fetching (§48), residency (now a visible field), taxes, cancellation, `rg_ext`, metapolicy display, 300-hid chunking, the search `timeout` parameter, Prebook, child ages and per-room occupancy limits, the 30-night stay limit, `hp` debounce.

### Contacts

Valeriy Korobov (integration) — apisupport@ratehawk.com · Sofia Kamalova (integration launch, handles IP whitelisting) · Seseg Shuianova (commercial) — s.shuianova@emergingtravel.com

---

---

## 42. RATEHAWK HOTEL STATUS — ACTIVE / PASSIVE / NOT INTEGRATED (2026-08-16)

### The problem

Hotels Ratehawk cannot price showed **"No availability"**, which reads as "sold out for your dates". For a large minority of the roster that is simply wrong — the property isn't sold through Ratehawk at all, for any date.

### Not a sandbox artefact — verified, not assumed

Probing the published inventory across four windows: **664 active · 136 passive · 53 not integrated**. The passive set is almost entirely safari lodges, private islands and remote luxury — Singita, &Beyond, Wilderness, Londolozi, Royal Malewane, North Island, Aman Bhutan, Ritz Paris — exactly the properties that sell direct or via specialist agents rather than bedbanks. A sandbox restriction would not selectively exclude *those* while returning rates for hundreds of city hotels on the same key. **Going live will not change this; do not wait for it.**

### The probe-design trap — read before re-running

The intuitive design ("probe far out so nothing is merely sold out") **gives the wrong answer**:

| Check-in | Hotels with rates (of 800) |
|---|---|
| +45 days | 570 |
| +90 days | 561 |
| +150 days | 559 |
| +270 days | 567 |
| **~14 months** | **96** ← collapse |

A window ~14 months out measures *how far ahead inventory is loaded*, not whether a hotel is on Ratehawk. Several windows are still needed: each sits near 560, well below the 664 bookable on at least one, so ~100 hotels are merely sold out on any given window and a single probe would mislabel them. The script generates windows from *today* so this can't creep back as the file ages.

### Field and scripts

`ratehawk_status` — `select-dropdown`, `allowOther: false`, values `active` / `passive` / `not_integrated`. `not_integrated` = no `ratehawk_hid` **or** no `ratehawk_image_1`. Deliberately **not** the pre-existing free-text `status_notes` — a value the app branches on must not be free text (§40, §44).

* `probe-ratehawk-status.mjs` — **read-only**, writes a JSON report. Batches hids 300 at a time (§32's limit), so the whole inventory is ~12 requests. **A failed request throws rather than being read as "no rates"** — that would silently mark hotels passive.
* `add-ratehawk-status-field.mjs` — one-shot, idempotent, schema snapshots either side.
* `apply-ratehawk-status-2026-08-16.mjs` — dry-run by default. Unlike the `apply-award-review-*` scripts it is **not** a hardcoded one-time record: it reads whatever `--report` it's given, so the quarterly re-probe reuses it as-is.

### App behaviour and caveats

A passive hotel shows **"Check availability on website"** linked to `www` (deliberately neutral rather than the error-toned pill), is **excluded from the availability batch** on both the Hotels page and the landing summary (~17% fewer hids per call), and sorts **between** available and sold-out — it isn't a dead end.

* **Re-probe quarterly (§43)** — a passive hotel can start distributing.
* **`active` means "bookable at least once", not "bookable now".** A live "No availability" is still correct for an active hotel on sold-out dates — the stored status and the live check are complementary.
* Probe occupancy is 2 adults / 1 room, residency `gb`. A property selling only family rooms could in principle be misfiled; not observed.

---

---

## 47. ETG FORWARDING PROXY ON RAILWAY (live since 2026-08-20)

### Why

ETG confirmed IP whitelisting is **mandatory**. Vercel serverless egress rotates, so ETG calls needed a fixed origin. Railway assigns a service three static outbound IPs at no extra cost, and Directus already runs there — so it was already a hard dependency on every hotel page load and this adds no new failure domain. Measured before choosing: the added hop is ~2% of a search (~55–65ms against a ~3s serp call), and a long-lived Railway process keeps TLS warm to ETG where Vercel re-handshakes per cold instance. The rejected alternative was Vercel's paid static IPs at $100/month, which would not have avoided Railway anyway.

```
browser → Vercel route → lib/ratehawk/availability.ts → Railway proxy → ETG
                         (all parsing stays here)       (creds live here)
```

### The service — `etg-proxy/`

Top-level directory, sibling to `hotels-beta/`. Railway's root directory is `etg-proxy`; Vercel's is still `hotels-beta`. Zero dependencies.

It forwards the body byte-for-byte and returns the upstream status and body unmodified — except that it **strips any inbound `Authorization` and injects its own**, so Vercel never holds the ETG key.

**Only five paths are proxied**: `/api/b2b/v3/search/serp/hotels/`, `/api/b2b/v3/search/hp/`, `/api/b2b/v3/hotel/info/`, `/api/content/v1/hotel_content_by_ids/`, and `/api/b2b/v3/hotel/prebook/` **only while `ETG_PREBOOK_ENABLED=1`**. Everything else is 404, and every `/api/b2b/v3/hotel/order/` path is refused by name before the allowlist is even consulted.

**This allowlist is load-bearing, not tidiness.** An open forwarder holding our credentials would let anyone with the shared secret reach any ETG endpoint, including the booking endpoints §32 puts out of scope — **which are active on our key** (`/overview/` lists `order/booking/form`, `finish`, `finish/status`, `cancel` at 30/60s) — and our key hits ETG's **live production** host, where test bookings are real orders needing manual cancellation.

**The test a new path must pass**: is it read-only, and does admitting it leave every booking endpoint just as unreachable? `hotel_content_by_ids` passes — it returns static content and creates nothing, and its purpose is the opposite of widening: it lets the §48 sync egress from the already-whitelisted IPs instead of standing up a second service with a second set of addresses. `hotel_ids_by_filter` was deliberately **not** added — the sync does a full refresh and never calls it.

**`/hotel/prebook/` passes the same test** (added 2026-09-16, deliberately, after ETG confirmed the White Label certification scope and that myOLTRA calls Prebook for the redirect hash). **Prebook validates a rate and returns a hash; it does not create an order**, takes no guest or card data, and ETG's workflow places it in the search step. Admitting it leaves `/order/booking/form/`, `/order/booking/finish/` and `/order/booking/finish/status/` exactly as unreachable. It sits behind `ETG_PREBOOK_ENABLED` so it can be switched off **without a Vercel deploy** — changing a Railway variable restarts the proxy in seconds; unset means 404, so admitting it is an explicit act on Railway too.

Verified locally 2026-09-16 with the upstream pointed at a dead port (so nothing could reach ETG): with the variable unset, prebook and all four booking paths → 404; with it set, prebook → 502 "Could not reach ETG." (forwarded) and all four booking paths still → 404; no secret → 401.

`GET /healthz` is unauthenticated and cannot reach ETG. The service exits at boot if any required env var is missing, so a misconfiguration fails the healthcheck loudly rather than serving errors under load.

### `GET /whoami` — confirm the static IPs, don't trust the panel

Reports the outbound IP the service **actually presents**, behind the same shared secret, touching neither ETG nor the credentials.

**Enabling the toggle is not enough — the service must be redeployed before the static IPs take effect.** This is the one thing to get right here, and it cost real debugging time. The Networking panel lists the three addresses the moment the toggle is flipped, which reads as if they're live; they are not. Until a redeploy, `/whoami` returns **an address not in Railway's listed set at all** — so the natural conclusion is that the feature is broken or `/whoami` is lying. **If the observed address isn't one of the three, redeploy before investigating anything else.**

**One call returns one address, and that is correct.** Railway assigns an outbound address **per instance**, not per request — it does not rotate, and repeated calls will not enumerate the other two.

Re-run `/whoami` and re-notify ETG after any region change or Railway maintenance — moving region reassigns the IPs.

### Auth and env

Vercel sends `x-oltra-proxy-secret`. The proxy compares it in constant time against a SHA-256 digest of `PROXY_SHARED_SECRET` (hashing both sides, so the comparison leaks neither content nor length). Missing or wrong is a 401 before any ETG call. Transport is public HTTPS — Railway private networking is project-internal.

| Variable | Railway | Vercel | Local `.env.local` |
|---|---|---|---|
| `RATEHAWK_KEY` / `RATEHAWK_KEY_ID` | ✅ | ❌ | ✅ |
| `PROXY_SHARED_SECRET` | ✅ | — | — |
| `RATEHAWK_PROXY_SECRET` | — | ✅ | ❌ |
| `RATEHAWK_API_URL` | — | Railway URL | `https://api.ratehawk.com` |
| `ETG_PREBOOK_ENABLED` | `1` to admit prebook | — | — |
| `NEXT_PUBLIC_RATEHAWK_PREBOOK` | — | `1` (Production + Preview) | `1` to see Continue |

**Set `RATEHAWK_PROXY_SECRET` and the `RATEHAWK_API_URL` override on Vercel's Production and Preview only, never Development** — `vercel env pull` writes Development values into `.env.local` and would silently flip local dev into proxy mode.

ETG credentials are **removed from Vercel entirely** — not blanked, not left on an unused environment. The proxy is the only place they exist outside Ulrik's machine. Local `.env.local` stays in direct mode, so local dev is never gated on Railway being up.

### Two modes, selected by env vars alone

`ratehawkPost()` branches on whether `RATEHAWK_PROXY_SECRET` is set: **proxy mode** sends the secret header and no `Authorization`; **direct mode** sends HTTP Basic exactly as before. `assertRatehawkConfig()` requires *either* credentials or a proxy secret. Nothing else changed.

**When ETG start enforcing**, calls from Ulrik's machine get rejected too — both local dev and `probe-ratehawk-status.mjs` (§43), which calls `/search/serp/hotels/` directly. Either whitelist that IP or flip to proxy mode. Deliberately deferred, not overlooked.

### Failure behaviour — fail fast, no retry

No automatic retry, by decision: serp already takes ~3s so a retry doubles the worst case with the user waiting, ETG rate-limits, and the UI already has an explicit user-driven retry. **Verified**: with the proxy down the batch route returns 500 in ~38ms and the existing error states render — and **none of them claims the hotel is unavailable**, preserving the §42 distinction.

`ratehawkPost()` previously passed **no timeout at all**. The proxy always fails first and returns a real status rather than leaving Vercel on a dangling socket. **Per path since 2026-09-16**: search 40s proxy→ETG / 45s Vercel→proxy (above ETG's own `timeout: 30` budget, so ETG answers first); prebook 60s / 65s (ETG's recommendation); everything else 30s. A 301-hid batch took 19.7s end to end, so the search margin is real.

### Deployment

Service Settings → Networking → Enable Static IPs, **then redeploy**. Region **EU West (Amsterdam)**, fixed before the addresses were sent.

```
208.77.244.241
152.55.184.241
152.55.185.190
```

Confirmed via `/whoami` against the redeployed service, then sent to Sofia Kamalova — she handles whitelisting, not Valeriy. Also: healthcheck `/healthz`, and **App Sleeping must stay off** — with no retry, a cold start on the first search after an idle period surfaces as a failed availability check.

Three caveats: moving region changes the IPs; **static IPs are per service, not per project** (a future service needs its own toggle and its own notification); and Railway does not guarantee the addresses are *dedicated* — fine for a whitelist, but don't describe them to ETG as dedicated.

---

---

## 48. ETG STATIC-CONTENT SYNC — OFFLINE, AND OFF THE HOT PATH (2026-08-24)

### What this closes

`/api/ratehawk/availability` called `/hotel/info/` live on every hotel-detail view. Two problems, and the second would have bitten first:

1. ETG grade "static content fetched during a live user search" as a certification failure.
2. `/hotel/info/` is **30 requests / 60s on our key**, so that call was a site-wide ceiling of 30 hotel-detail views per minute across all users. It hadn't bitten only because traffic is low.

Now a daily Railway job writes ETG static content into Directus and the availability route reads from there. Room-matching logic is untouched.

### Directus fields

The 4 from §32 (created 2026-08-10, empty until now) plus 4 more via `add-ratehawk-content-flag-fields.mjs` — additive only, before/after `GET /schema/snapshot` diffed to confirm exactly 4 additions, 0 modifications, 0 removals.

| Field | Type | ETG source |
|---|---|---|
| `ratehawk_room_groups` | json | trimmed `room_groups[]` |
| `ratehawk_metapolicy_struct` | json | `metapolicy_struct` |
| `ratehawk_metapolicy_extra_info` | text | `metapolicy_extra_info` |
| `ratehawk_static_synced_at` | timestamp | stamped by the job |
| `ratehawk_check_in_time` / `_check_out_time` | string | `check_in_time` / `check_out_time` |
| `ratehawk_is_closed` / `ratehawk_deleted` | boolean | `is_closed` / `deleted` |

`null` on any of them means **never synced**, which is not the same as a real `false` or a real empty list.

**The times are strings, not a Directus `time` column.** 4 of 853 hotels report `"00:00:00"`, which almost certainly means "unspecified" rather than a real midnight check-in; a `time` column would launder that into a legitimate-looking value.

**`is_closed`/`deleted` are deliberately not folded into `ratehawk_status`** (§42). That field is a quarterly live-rate verdict; these are daily content flags. One shared column would let the daily job overwrite the quarterly one. Both are advisory — the sync never changes `published`. Validation on first run: the single `is_closed = true` is Four Seasons The Biltmore Santa Barbara (id 1682), genuinely closed and already unpublished.

### A duplicate field is a 400, not a 409

**Directus answers a duplicate field with `400 INVALID_PAYLOAD` and an "already exists" message, not `409`** — verified live. Every field-creation script here had inherited a `409` check and a header calling itself "409-safe", so a perfectly clean re-run printed `FAILED` on every field it skipped — 100 of them in the image script's case. Harmless in effect, but **a clean re-run that looks broken is the kind of thing that gets "investigated" for an hour.**

All three now share an `isAlreadyExists(status, data)` helper accepting both codes. Copy that helper in any future field-creation script rather than the old shape, which still exists in `scripts/restaurants/create-restaurants-collection.mjs` — left alone as a run-once script, and untested.

### The trimmed `ratehawk_room_groups` shape

Exactly the three keys `RawRoomGroup` declares: `{name, rg_ext, images: string[]}`. Dropped, each **measured** on live data rather than assumed: room-group `images` (byte-identical to `images_ext[].url`, 36.9% of the bytes); `category_slug` on room images (`"unspecified"` on 51,838 of 51,838 sampled); `name_struct`, `room_amenities`, `size` (never read; `size` is feature-gated and always null); `room_group_id` (deprecated, never read).

18.9 MB stored for 853 hotels, from a 58.7 MB raw response. Per hotel p50 11.8 KB / p95 153 KB / max 367 KB.

### The job — `etg-static-sync/`

Top-level directory, sibling to `etg-proxy/`. Zero dependencies. Daily on Railway's cron. Flags: `--dry-run`, `--only <hid>`, `--limit <n>`.

Per run: load every hotel with a `ratehawk_hid` → batch 100 hids through the proxy to `hotel_content_by_ids` → trim → compare against what's stored → PATCH only what changed → stamp `ratehawk_static_synced_at` on every row in the run, once, at the end.

Points that matter if this is rewritten:

* **`data` comes back as a flat array and is NOT in request order.** Verified: `[8473727, 7855756]` returned 7855756 first. **Join on `hid`, never on position.**
* **Compare canonically, never by raw `JSON.stringify`.** Key order differs between what we send and what Directus returns — same lesson as `rg_ext` (§32). The diff sorts keys recursively.
* **Change detection is the expensive half, not the fetch.** The 9 ETG requests take ~8.5s; 853 Directus PATCHes take ~3 minutes. ETG content is stable, so after the first run most days write nothing — an immediate second run reported **0 of 853 changed** in 11.1s.
* **The timestamp is stamped separately from content**, so per-row freshness stays meaningful without rewriting 19 MB daily.
* **A failed batch aborts the run before anything is stamped**, so a partial sync surfaces as stale timestamps rather than a silent mix. No retry. Stored content is never deleted on a failed fetch, and a hid we asked for and didn't get back is reported, not overwritten with nulls.
* Local runs use direct mode, deployment uses proxy mode.

### The read path

`fetchRatehawkRoomImages()` → **`loadRatehawkRoomGroups()`**, renamed because it no longer fetches from ETG and the old name would mislead. It reads `ratehawk_room_groups` filtered on `ratehawk_hid` and maps stored `images: string[]` back to `images_ext: [{url, category_slug: null}]`, so `RawRoomGroup` is unchanged and `matchRoomImages()` / `rgExtEquals()` / `groupRoomOptions()` are untouched. Unsynced or room-group-less hotels return `[]` and render rooms without images — 24 of 853 legitimately have zero room groups.

**Never add `ratehawk_room_groups` to a bulk hotel field list** — ~19 MB across the roster, and the Hotels page fetches every published hotel in one request. Guard comments sit in `HotelRecord` and above all three bulk `fields` lists.

### Verified

Full run: 853/853 returned, 0 missing, 852 written; an immediate re-run reported 0 changed. The assertion that proves nothing user-visible changed: the same `/api/ratehawk/availability` request run against the old code (via `git stash`) and the new returned **the same 11 rooms with byte-identical `images[]` on all 11**, the only difference being the deliberately dropped `category: "unspecified"` → `null`.

### Not done — deployment

The Railway service has **not** been created: no `etg-static-sync` service, no cron schedule, no env vars there. The code is verified locally end to end. Deploying needs: a new service with root directory `etg-static-sync`, `DIRECTUS_URL`/`DIRECTUS_TOKEN`/`RATEHAWK_API_URL`/`RATEHAWK_PROXY_SECRET`, a cron schedule, and **no static-IP toggle of its own** — it egresses through `etg-proxy`, which is the whole reason the allowlist gained a path.

---
