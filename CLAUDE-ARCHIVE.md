# OLTRA — ARCHIVE

Completed work: what was done, what it cost, and the traps found along the way.
Nothing here governs a decision you make today — the live rules are in CLAUDE.md.
Read a section when your task touches that ground.

Split out of CLAUDE.md on 2026-09-10, when that file reached the 150,000-character
context limit. Text is moved verbatim; section numbers are unchanged so every
cross-reference in CLAUDE.md still resolves.

---

## 19. HOTEL DATA BACKFILL - 16 HOTELS (started 2026-05-22)

IDs 1825-1840, inserted `published: false`. Already populated: the editorial, geography and taxonomy fields plus `www`. Still to do per hotel: `description`, `lat`/`lng`, Agoda matching, `ext_points`/`editor_rank`, award booleans, then `published: true` only after review. Each hotel's official site is already in its `www` field - read it from Directus.

**Description guidelines**: 2-4 sentences, 60-100 words, editorial tone, focused on what makes the property distinctive. No marketing superlatives. The description expands on `highlights` rather than repeating it.

---

## 20. HOTEL LAT/LNG GEOCODING

`GOOGLE_MAPS_API_KEY` in `.env.local` is valid, and lat/lng round-trip through Directus as exact decimals — no field-type fix needed.

Script: `scripts/hotels/new-hotels-2026/google-geocode-hotels.mjs`. Uses the **Places API — Find Place from Text** (~$17/1000) rather than the Geocoding API (~$5/1000), because it searches by business name and lands on the actual property pin instead of a city centroid for remote lodges. Builds fallback query variants (name+area+city+region+country down to name+country), scores candidates by country/city string-match, flags mismatches. Flags: `--ids`, `--countries`, `--cities`, `--dry-run`, `--force`, `--verify`, `--out`. Skips hotels that already have coordinates unless `--force`.

**Known false-positive noise in the mismatch flags**: the country/city check is a plain substring match after accent-stripping, so it routinely flags correct results — abbreviations (`UK`/`USA`/`UAE`), transliterations (`Wien`, `München`, `Lisboa`), renames (`Türkiye` vs `Turkey`), or the DB's `city` being broader than what Google returns (`Alta Badia`→`San Cassiano`, `Maui`→`Kihei`). Always spot-check a flag against the coordinates and formatted address before treating it as a real error.

**Remaining scope**: only the 67 new hotels (§23) have been geocoded this way. The from-scratch backfill across the ~800 legacy hotels has **not** run. To resume: confirm the current count missing coordinates, **EnterPlanMode before the bulk write** (hundreds of hotels, real API cost), then run in `--countries`/`--cities` batches and spot-check the flags.

---

## 21. HOTEL DESCRIPTION PARAGRAPH REFORMATTER - PLANNED, NOT RUN

Add paragraph breaks to hotel descriptions via the Anthropic API. As of 2026-06-27: 39 hotels are a single block, 219 are 2 paragraphs, 504 are 3, 42 are 4. Target 3-4, split at topic transitions (setting -> architecture/rooms -> dining -> atmosphere), separator `

`.

Script to build: `scripts/hotels/reformat-descriptions.mjs` - zero new dependencies (raw `fetch`), model `claude-haiku-4-5-20251001`, flags `--dry-run` (default) / `--apply` / `--only <id>` / `--limit N` / `--min-paras N`. **Validate the response against the original word count +/-5%** to catch the model rewriting rather than reformatting, and dry-run a 3-paragraph hotel to confirm it is skipped. `ANTHROPIC_API_KEY` is no longer a blocker - it exists for the concierge (§50).

---

## 22. HOTEL DESCRIPTION PARAGRAPH SPACING

Merged into §21 — same task, same script spec, no separate blocker.

---

## 23. NEW HOTEL BATCH — 67 HOTELS (2026-07-07)

IDs 2001–2067. Sources and scripts in `scripts/hotels/new-hotels-2026/`: `new_hotels_batch1.json`–`batch14.json`, `create-hotels-batch.mjs` (safe to re-run, skips existing IDs; also the reference implementation for the array-field write fix in §4), `google-geocode-hotels.mjs`.

Populated for all 67: the editorial and taxonomy fields, the 7 award booleans, `www`/`insta`, and `lat`/`lng`.

* Awards audited and applied 2026-07-07 (§24).
* `published: true` applied to 66 of 67 — all except **id 2020, Mandarin Oriental Cortina**, which stays unpublished per explicit instruction. Done *ahead of* the Agoda/booking fields, out of the original planned order.
* **Agoda matching explicitly aborted.** The pipeline needs a bulk Agoda hotel-list export to fuzzy-match against, which is not available; Agoda's affiliate API has no name-search endpoint and GIATA's ID-mapping API returns 403 without a special agreement. Revisit only with a fresh export.
* Booking fields not started.

---

## 24. HOTEL AWARDS REVIEW WORKFLOW

The 7 award booleans are set at creation time from whatever source the editor had, and drift from the real award lists. This workflow cross-checks a batch against curated source lists and corrects both the booleans and the `awards` tag array.

Scripts, all in `scripts/hotels/new-hotels-2026/`:

* `match-hotel-awards.mjs` — **read-only**, general-purpose. Takes `--award <code>` (required, one at a time) and optional `--ids <from>,<to>` (default: the whole collection). Loads `awards-2026/*.json`, matches by name/location, writes `award-review-<code>-<date>.{txt,json}`. Four buckets: **confirmed** (exact core-name match, no location conflict), **near** (brand-prefix-agnostic containment, e.g. "Tamarindo" ≈ "Four Seasons Resort Tamarindo"), **uncertain**, **removal candidates** (flag set but no source match). Also flags **drift** — boolean and tag array disagreeing with each other. Exports its matching functions for reuse, guarded so importing doesn't trigger `main()`.
* `apply-award-review-<date>[-<code>].mjs` — **writes**, dry-run by default, `--confirm` to patch. Hardcoded lists of exactly what to change: a one-time record of a reviewed session, not a tool. **Copy the pattern for a new round; don't edit an old one.**
* `recalc-ext-points-<date>.mjs` — **writes**. `ext_points = editor_rank + award points`, where `michelin3keys`=5, `best50`=5, and `cn`/`tl100`/`forbes5`/`aaa5d`/`telegraph`=3 each. `editor_rank` is stored, not recomputed. Only patches where the value differs.

**Workflow order**: match (read-only) → resolve uncertain candidates and unconfirmed existing flags with the user → apply → **recalc ext_points**. That last step is easy to forget because it's a separate field, and a stale value lingers silently until it runs.

### Award source files (`awards-2026/*.json`)

One flat JSON array per award code. **These can be stale or incomplete — always sanity-check the entry count against the award org's own published total.** How to get a full, current list when the site only exposes a search widget:

* **Forbes 5-Star**: the whole dataset is at `forbestravelguide.com/award-winners.json` — filter `propertyType === "HOTEL" && ratingDisplay === "5-Star Rated"`.
* **World's 50 Best**: `theworlds50best.com/hotels/best-in-the-world/list/1-50` and `/51-100`, client-rendered — needs a headless browser.
* **Condé Nast Gold List**: six regional gallery articles, no master page. Each page's `window.__PRELOADED_STATE__.transformed.gallery.items[]` has `dangerousHed` = `"Hotel Name — Country"`.
* **Telegraph**: paywalled live — use the **Wayback Machine** for a pre-paywall snapshot.
* **Travel + Leisure 100**: direct `curl` gets HTTP 402 (a bot-block, not a paywall — a headless browser sails through). Find the current slug via `travelandleisure.com/worlds-best-awards`; the full 100 are in the initial page load.
* **AAA Five Diamond**: official PDF at `newsroom.aaa.com/wp-content/uploads/2024/04/AAA-Five-Diamond-Hotels-<YEAR>-1.pdf` — the `2024` in the path stays fixed as `<YEAR>` updates. `curl` it directly.
* **Michelin 3 Keys**: `guide.michelin.com` is WAF-blocked. Workaround: `finehotelsguide.com/api/hotels?page=1&limit=10000&keyTier=Three-Keys`, found by watching network requests in a headless browser — it isn't referenced in the static bundle. Each entry links to its own guide.michelin.com page, so it is effectively Michelin's own data.

**Puppeteer**: none of the JS-rendered sites are fetchable with plain `curl`/WebFetch. `npm install puppeteer` was done in a scratch directory only, not as a project dependency, and needed system libs first (`libatk1.0-0 libatk-bridge2.0-0 libcups2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2t64 libpango-1.0-0 libcairo2 libnss3 libnspr4`) — without them Chrome fails with `libatk-1.0.so.0: cannot open shared object file`.

Some "full list" secondary sources are internally inconsistent — cross-check their own math. When a supposedly-complete new source shares only a third of its entries with the current file, that's a sign it's a different tier or year, **not** a data-quality bug to merge away. Ask.

### Matching-algorithm rules (already in the script — keep in mind if extending)

* Strip generic hospitality words (`hotel`, `resort`, `spa`) before the **exact**-match check, not just the fuzzy path.
* Compare stripped tokens as a **sorted set**, not an ordered string — sources reorder the same words ("Rosewood Castiglion del Bosco" vs "Castiglion del Bosco, A Rosewood Hotel").
* A location mismatch must **not** hard-exclude a candidate whose core name matches exactly — surface it for review. A real country-label mismatch (DB "China" vs source "Hong Kong"; DB "St. Barthelemy" vs source's umbrella "French West Indies") was silently dropping genuine matches before this was fixed.
* `cityStatus()` is three-tier (`match` / `state-only` / `conflict`). State-level overlap alone is too loose in dense regions — "Four Seasons Santa Barbara" matched "Four Seasons San Francisco" purely on "California". A city-level match is required to trust a *weak* name signal; `state-only` corroborates only a *strong* one, which preserves legitimate remote-resort cases (Royal Malewane's "Hoedspruit" vs Michelin's "Kruger National Park").
* Once a fuzzy candidate is confirmed, the award list's name is often the more official one — consider updating `hotel_name` and `city` too.

### The pattern no string-matching fix resolves: chain-brand collisions

Distinct hotels sharing a brand *and* a city share every location field the algorithm has. Every one of these needed a live web search to resolve, and they recurred across nearly every award pass: Mandarin Oriental Wangfujing vs Qianmen (Beijing); Four Seasons Istanbul at the Bosphorus (1 Key) vs at Sultanahmet (3 Keys); The Peninsula Beverly Hills vs The Beverly Hills Hotel — where the Peninsula turned out not to be on Forbes's list at all. Naviva vs Four Seasons Punta Mita, Jumeirah Burj Al Arab vs Marsa Al Arab, Hotel Le Lana (Courchevel) vs The Lana (Dubai) and Four Seasons Bali at Sayan vs at Jimbaran Bay are the same shape.

**Rule: any `near`/`uncertain` match between two hotels of the same brand in the same city needs a live check before approving. A confident core-name match is not evidence.**

---

## 25. FULL-COLLECTION AWARDS AUDIT (completed 2026-07-15)

All 7 codes re-audited across the whole collection (873 hotels), one code at a time, with Ulrik approving every change via an interactive HTML artifact per award before any write. Both additions and removals were in scope.

Source files were re-verified first (commit `77e70bc`). `forbes5`, `best50`, `cn` and `telegraph` needed no change; `tl100` was rebuilt (the 2026 list published a week earlier, 78 of 100 turned over), `aaa5d` rebuilt from AAA's own PDF, and `michelin3keys` rebuilt — the old file wasn't merely incomplete, it had **badly wrong per-country counts** (29 "USA" entries against a real 16, 8 UAE entries that shouldn't have been there) because it had been built from secondary press write-ups conflating tiers.

Across the 7 codes: 363 confirmed, 53 near, 78 uncertain, and 374 changes applied (191 additions, 183 removals). All reconciled to 0 removal candidates / 0 drift, except best50, where Ulrik chose to keep 3 place-name-variant matches `true`. Every round ran its own scoped ext_points recalc. Artefacts: `apply-award-review-2026-07-15-<code>.mjs`, `recalc-ext-points-2026-07-15-<code>.mjs`, `award-review-<code>-2026-07-15-final.{json,txt}`.

Two duplicate records were found incidentally and deleted (id 1841, a duplicate of 1782; id 1643, a duplicate of 1649 — the surviving row kept in each case for its Agoda photos). Not found by a systematic sweep; one is still worth doing.

### Follow-up — award-listed hotels not in the database

**54 of the 143 Michelin 3 Keys entries have no match in the DB at any tier**, across 21 countries (France 8, USA 8, Italy 6, UK 5, Japan 4, Spain 4). Output at `michelin3keys-not-in-db-2026-07-15.{json,txt}`. Not a data-quality issue — mostly small independent properties not yet catalogued. Not run for the other 6 codes; worth repeating when expanding coverage.

### Credentials for a fresh checkout

`.env.local` is correctly gitignored and never committed. Ask Ulrik directly for `DIRECTUS_URL`/`DIRECTUS_TOKEN` (his Directus user-profile Token field). **Do NOT go looking in Codespaces' own secret stores** even when they'd plausibly contain the answer — a different trust boundary than reading a project file, even with legitimate motivation.

---

## 26. RATEHAWK INTEGRATION — HOTEL MATCHING (complete 2026-08-07)

Matching Ratehawk's inventory against the OLTRA `hotels` collection, ahead of any search/booking UI. Credentials and current API status are in §32; this section is the matching groundwork and its lessons.

### The dump pipeline (`scripts/ratehawk/`)

Content API v1 wasn't provisioned when this was built, so it used ETG's **full hotel dump**: `POST /api/b2b/v3/hotel/info/dump/` returns a signed S3 URL (~1hr expiry) for `partner_feed__en_v3.jsonl.zst` — ETG's **entire global inventory**, ~2.8 GB compressed, 20 GB+ decompressed, refreshed weekly. **Node 24's built-in `zlib` has native Zstandard streaming** (`createZstdDecompress`) — no npm dependency needed.

`filter-dump-by-country.mjs` streams it end to end (never holding the decompressed feed in memory or on disk) and keeps records whose `region.country_code` maps to an OLTRA country, writing a slim record per line to `output/filtered-hotels.jsonl`. `country-map.mjs` is the hand-built ISO alpha-2 → OLTRA-country-string lookup that is the join key. Result: 2,948,166 of 3,166,880 hotels kept.

`.gitignore` covers `scripts/ratehawk/*.zst`, `*.jsonl`, `output/` — multi-GB, regenerable, and ETG's proprietary inventory rather than ours to publish.

**Content API is now enabled and is the preferred source — see §32.** The dump pipeline still works and stays as a fallback.

### Country mapping — don't trust ISO assumptions

A country whose code isn't in `country-map.mjs` is **silently dropped with no error**. Audited all 87 target countries against the dump for zero-match cases:

* **Hong Kong** is a non-issue: Ratehawk files HK hotels under `country_code: "CN"`, same as our DB does. **Macau** gets `MO`, which `country-map.mjs` maps to `"China"` to match. **Russia** is the one genuine zero, and not a mapping bug — the dump contains **no** `RU` hotels at all, almost certainly a sanctions exclusion, so Barvikha (id 1505) simply has no Ratehawk match available. All other 85 countries had real matches, from 413,826 (China) down to 35 (Monaco).

**When adding a new OLTRA country, verify its code against the dump** rather than assuming — ETG's classification has real deviations. Sri Lanka was later found missing entirely (§49), which is exactly this failure mode.

### Matching algorithm (`match-ratehawk-hotels.mjs`)

* **Country is a hard filter** and needs no fuzzy normalization — the filtered file already carries the exact OLTRA string.
* **City is deliberately NOT a filter**, only a scoring bonus — Ratehawk's `city` is really `region.name`, sometimes broader than ours ("Kruger National Park" vs "Sabi Sand Reserve") and occasionally wrong.
* **Name**: strip generic words, Jaccard token overlap, plus a brand-prefix-containment bonus (≥2 tokens) and a rare-token (≥5 chars) bonus.
* **Haversine distance** as a scoring signal: ≤1km strong bonus, ≤5km smaller, ≤25km tiny, >100km penalty.
* Tiers: `CONFIRMED` (≥85, ≥15 clear of runner-up) / `LIKELY` (≥60, ≥8 clear) / `QUESTIONABLE` / `NO_MATCH`. Top 3 candidates kept per hotel.

### Lessons that cost real time

* **When merging match results from two sources, check which source's candidate list you're reading.** The update script pulled `candidates[0]` from the *automatic* results instead of the *manual* ones, silently overwriting correct manual matches — The Biltmore (Miami) became "Biltmore Suites Hotel" in **Baltimore**. A matching `oltra_id` does not guarantee the right hid. Caught by a distance QA check, not by the matching logic.
* **Country misclassification isn't limited to Hong Kong/Macau.** Ratehawk splits St. Barthélemy inconsistently between `BL` and `FR`. Fixed by a geographic bounding-box scan (`scan-st-barth.mjs`), not a code remap, since most FR hits for "st barth" text were mainland false positives. **When a hard-filtered match returns NO_MATCH for a hotel you're confident exists, scan the raw dump by name/geography across all country codes before concluding it's absent.**
* **Google Places re-geocoding is not independent verification** when the coordinate was originally sourced the same way (§20). Re-querying reproduces the same wrong answer — which looks like confirmation. Two of the worst distance outliers did exactly this (Bulgari Shanghai matched an address ~1000km off, exactly reproducing the stored error; Casa Chablé matched a same-brand sibling). Both resolved by plain web search instead. **A verification using the same method as the original data creation proves consistency, not correctness.**

### Results and write-back

Of 871 hotels: **829 confirmed**, 31 unsure, 11 confirmed absent from Ratehawk's inventory. `ratehawk_hid` (integer, nullable) was added and backfilled for all 829, 0 failures.

Pre-write-back QA (`build-writeback-review.mjs`) cross-checked all 829 on distance, name and city before anything was written. Two findings shaped later work: **9 hotels turned out to have wrong OLTRA coordinates** (fixed), and of 221 differing names, **216 validated OLTRA's own** — Ratehawk's difference is almost always a distribution suffix ("- The Leading Hotels of the World", "By Hyatt"), so no bulk renaming. City differed on 288 with **no consistent direction**, so a blanket update would have made half of them worse; left untouched.

Directus data-entry bugs found along the way: `hotel_name` fields with junk appended, a typo ("Senses Lanai" → "Sensei Lanai"), a duplicate Caruso row (1426/1449, both published), and 4 Anguilla hotels mistagged `country: "British Virgin Islands"` (1237–1240).

**Files**: `export-oltra-hotels.mjs`, `match-ratehawk-hotels.mjs`, `build-review-tool.mjs`, `test-manual-matches.mjs`, `scan-st-barth.mjs`, `append-country-to-filtered.mjs`, `fix-anguilla-country.mjs`, `build-writeback-review.mjs`, `verify-distance-outliers.mjs`, `export-non-confirmed-csv.mjs`, `apply-ratehawk-hid.mjs` (the only one that writes).

---

## 27. RATEHAWK — NEXT PHASES

Phase 1 (images) is done — §28 and §29. Phase 2 (rooms, availability, pricing) is done — §30. Booking itself is still blocked pending ETG; see §32, which is the live section for anything Ratehawk from here.

---

## 28. RATEHAWK HOTEL IMAGES — BACKFILL (2026-08-08)

### Schema: 100 flat fields, not a JSON blob

`ratehawk_image_1`–`50` (URL) and `ratehawk_image_1_category`–`50_category` (the `category_slug`). **Deliberately not a `json` array** — flat fields stay editable and browsable in the Directus admin UI where a blob is opaque. **Deliberately not capped lower either** — the true per-hotel max is 50 and these are just URL strings, so capping would silently drop editorial value. No curation or truncation: every image Ratehawk returns gets a slot, in Ratehawk's own order.

Script: `add-ratehawk-image-fields.mjs` (idempotent — see §48 on why a duplicate field is a 400, not a 409).

### Pipeline

The dump carries images in `images_ext: [{url, category_slug}]`. The plain `images: [String]` field is deprecated and always identical (0 mismatches across all 829), so only `images_ext` is used.

`extract-images-for-matched.mjs` re-scans the dump (no re-download) keyed by the 829 confirmed hids, joining **hid → oltra_id directly per line, not by index**. `apply-ratehawk-images.mjs` maps `images_ext[n]` → slot `n+1`; dry-run by default.

**Result: 811 of 829 updated, 18 skipped (confirmed match, zero images available), 0 failures.** Spot-checked id 1602 against a live `/hotel/info/` call — slots 1, 2 and 50 matched byte-for-byte.

### The `{size}` URL template

Every URL has an unresolved `{size}` placeholder, stored as-is so one URL serves both a thumbnail grid and a full-size lightbox. The CDN accepts a **fixed whitelist**, not arbitrary `WxH`: square crops (`40x40` … `240x240`, `900x900`), fit-by-height (`x220`, `x500`, `x768`, `x1080`, `x1920`), fit-by-width (`1080x`, `1920x`) and full fit (`1024x768`, `1920x1080`). The app uses two tiers, `240x240` and `1024x768`. An undocumented size can still return 200 — the CDN is lenient — but stick to documented tokens.

### Room images — deferred, and a trap for booking

Each `room_groups[]` entry carries its own images, but the field that would link a room group to search results, **`room_group_id`, is explicitly deprecated**. The documented linkage is **`rg_ext`**, a room-characteristics object present on both the static content and the live rate objects. ETG's docs say directly: *"rg_ext — Use this field to get extra data on the room from the hotel static data. For example, room images, descriptions."*

So for booking: match a live rate's `rg_ext` against the static `room_groups[].rg_ext` at request time. Don't key anything off `room_group_id`. Room offers are inherently per-search, so pre-storing room images would either duplicate this logic later or go stale.

---

## 29. RATEHAWK IMAGES IN THE APP (2026-08-08)

Ratehawk images take priority everywhere; Agoda is only a fallback for hotels with none.

### Priority logic in `cardHelpers.ts`

`getRawHotelImages(hotel)` (private) is the single source of truth: Ratehawk if `ratehawk_image_1` is set, else up to 5 Agoda photos, else `[]`. Built on it:

* `hasHotelPhotos()` — replaces `hasAgodaPhotos()` at every *display-gating* call site. `hasAgodaPhotos()` is untouched and still exported (still meaningful as "does this hotel have Agoda data").
* `getHotelThumbnail()` — single nullable URL, no placeholder fallback.
* `getHotelImageSet()` — unchanged signature, reimplemented on the same raw list, so every call site that only read `[0]` needed no change.
* `resolveRatehawkUrl(url, size)` with `RATEHAWK_THUMB_SIZE` (`240x240`) and `RATEHAWK_FULL_SIZE` (`1024x768`). Only two tiers app-wide — no per-call-site size parameter.

### Bulk fetch vs lazy gallery

The Hotels page fetches all ~870 published hotels in one request. Adding all 100 image fields to that measured at **~4.5 MB of extra JSON per page load** — rejected. Instead: `HotelRecord` and the three bulk field lists gained only **`ratehawk_image_1` + `_category`**, enough for the hero image everywhere. A new route `/api/hotels/[id]/ratehawk-images` fetches one hotel's full set on demand (local 100-field type, not added to the shared `HotelRecord`).

`HotelsView` fires that fetch **only when `selectedHotel.ratehawk_image_1` is set** — zero extra calls for Agoda-only or photo-less hotels. While pending it falls back to the single hero entry from the bulk fetch, so the main image renders with no loading flash.

### Thumbnails and the category badge

A **real CSS Grid gotcha**: switching the thumbnail panel from `max-height` to a definite `height: 340px` made all rows compress to fit instead of scrolling — `grid-auto-rows: auto` rows shrink under a fixed-height scroll container. Fixed with `auto-rows-min`.

A pill badge shows the current image's category on the hero and in the lightbox, hidden when the category is `null` (always true for Agoda) or the literal `"unspecified"` (~17% of Ratehawk images). `guest_rooms` → "Guest Rooms" via `formatImageCategory()`.

### A real bug caught in the browser

`next/image` throws — and freezes the tab — on any hostname not in `images.remotePatterns`. **`cdn.worldota.net` was missing** and had to be added alongside `*.agoda.net`. Requires a dev-server restart; `next.config.ts` is read once at startup.

### Out of scope

`/hotels/[hotelid]` is untouched — not part of the intended UX flow (§15), and it runs a separate Agoda-CSV image system. Saved trips and favourites persist a flat `thumbnail` string at save time, so new saves pick up Ratehawk automatically but **already-saved rows keep their old Agoda thumbnail** — not backfilled.

---

## 30. RATEHAWK AVAILABILITY, PRICING & ROOM SELECTION (2026-08-08)

Ratehawk handles all availability, pricing and room selection on the Hotels page; **Agoda's price-fetch and booking are fully disabled there** (Agoda is untouched elsewhere — the landing teaser still uses it). Data-and-selection only: **no real booking or payment call is made anywhere.**

### Two endpoints

* `POST /api/b2b/v3/search/serp/hotels/` — batch, one call for all visible results' hids, headline price per hotel. ETG's docs say not to let users pick rates from this response.
* `POST /api/b2b/v3/search/hp/` — detail, the selected hotel only, full list of selectable rates.

Both take `guests: [{adults, children}]`, **one array entry per room**, built by `buildGuestsArray()` — which splits the form's adults/kids across the bedroom count. Auth is HTTP Basic, unlike Agoda's custom header.

`residency` is a real required field (400 if missing) on both routes. Auto-detected from browser locale (`guessResidencyFromLocale()`, client-only to avoid a hydration mismatch), round-trips through the `residency` URL param, applied to all guests. **The interactive selector was removed 2026-08-14 (§39)** after measuring that the price effect is ≤3% and property-specific; detection and sending are unchanged.

### Headline price formula

Cheapest available room whose `rg_ext.capacity` covers `ceil(totalGuests / bedroomsRequested)`, × `bedroomsRequested` — "book N copies of the cheapest room that fits". A documented simplification, not a true mixed-room bin-pack; the room UI lets the user override room-by-room. The API returns a **flat list of individual rates** and does not pre-combine a multi-room booking, so the aggregation is ours.

### Room images

**§32 supersedes what was first concluded here.** The original finding — that `rg_ext` matched 0/5 and `room_name` containment worked — was a comparison-method bug, not a data incompatibility. `rg_ext` field-by-field matching is correct and is what `matchRoomImages()` does now; `room_name` containment is only a fallback that logs a warning.

Room `size` (m²) exists in ETG's schema but is feature-gated behind a separate agreement and is always `null` on this account. The UI renders it conditionally so it picks up automatically if enabled.

### `HotelsView.tsx`

All Agoda availability state, effects and JSX were removed, and `agodaSearchDirty` renamed `availabilitySearchDirty` — the "inputs changed, refetch" concept is provider-agnostic. Rooms auto-fetch on hotel/dates/guests/bedrooms with no manual button, pre-selecting the headline combo; a "Rooms" section sits between Description and the action row, and the room detail popup uses the app's `createPortal` lightbox pattern rather than the Flights page's CSS-module popup.

**A real bug**: `rg_ext.capacity` can be `0`, not just missing, for some suites — `?? 1` doesn't catch that (nullish coalescing only replaces null/undefined) and it rendered "Sleeps 0". Use `|| 1`.

### Layout

`.oltra-hotels-layout` / `.oltra-hotels-right-pane` give the two-pane grid a bounded height + `overflow: hidden`, making the right section the one that scrolls. The left results list's `flex-1 min-h-0 overflow-y-auto` was already there but inert — no ancestor had a bounded height. Featured Mode has no left pane and keeps its unbounded behaviour.

### `room_selection` column

Applied 2026-08-08 via the Supabase SQL Editor against the **Members** project (§31):

```sql
alter table member_trip_hotels add column room_selection jsonb;
```

Holds `[{room_name, quantity, price_per_stay, currency}]`, null if no rooms selected. `database.types.ts` was hand-edited (no CLI link to regenerate from). Carried through `addHotelToTripBrowser` → `SavedHotel`/`RoomSelectionEntry` → `mapSavedTrips` → a summary line in `SavedTripsView`.

---

## 33. LANDING/HOTELS/FLIGHTS UI FIX SESSION (2026-08-11)

Commits `c507f57` (landing + cross-page dates/availability) and `799e614` (Hotels filters/layout/images), both on `main`. Per-file detail is in the two commits; what is worth carrying forward:

* **`limit: -1` was missing** on the landing-summary hotel fetch, so it capped at Directus's default 100 rows *before* the JS-side taxonomy filter ran — the root cause of "0 hotels identified" for a taxonomy-only search. One-line fix.
* **`CARD_LIMIT` is declared independently in `page.tsx` and `LandingSummary.tsx`** — no shared constant, so the two must be changed together.
* **The Ratehawk batch effect had an early `if (availabilitySearchDirty) return;` guard** blocking auto-refetch until "CHECK AVAILABILITY" was clicked. Removing it (plus a 450ms debounce) fixed **two separately-reported symptoms** — "select dates" stuck after the landing handoff, and guest changes not updating availability. If either reappears, check the deploy timestamp against the commit before re-diagnosing.
* **Native lazy-load can silently never fire** for images landing at the fold boundary while an async fetch swaps a 1-image fallback for up to 50. Removed `loading="lazy"` from the hotel thumbnail grid only; if perf demands it back, use an `IntersectionObserver`.
* **A filter control that navigates needs optimistic local state.** Each taxonomy checkbox was a `<Link>` doing a full server round-trip with no feedback, so a quick second click looked like nothing happened. `RelDropdown` now keeps `localSelectedIds`, updates synchronously, and navigates via `router.push` in `startTransition`, with a reconciling `useEffect` that self-heals if navigation fails.
* **Results-pane squeeze**: with Filters expanded the results list compressed to a sliver, because the outer left `<section>` had a bounded height and no overflow of its own. Fixed with a fixed `max-h-[50vh]` on the list plus `overflow-y-auto` on the section — nested scrollbars when both are needed, intentionally.

Also: from-date pickers now open the to-date picker (`openDatePicker(toRef)` in a `requestAnimationFrame`) on landing, hotels and flights — **not visually confirmed**, since browser automation can't screenshot native `<input type=date>` popups on Windows.

---

## 34. DESIGN-SYSTEM AUDIT & DARK-SURFACE REFINEMENT (2026-08-11 to 2026-08-13)

Ulrik proposed a two-surface theme — tinted dark for editorial pages, warm ivory for transactional ones — and asked for an audit before any code changed. **The ivory surface was built, reviewed and rejected**: *"it reads too mainstream — the standard luxury-travel white-and-black look I deliberately moved away from."* Its tokens are gone from the codebase entirely, not dormant. Final commit `ae62e5b`. **§35 supersedes this section's text-colour values**; the radius scale below is current.

### What shipped: the radius scale

Computed by grepping every real consumer of each token first, not guessed:

| Token(s) | Was | Now | Used for |
|---|---|---|---|
| `--oltra-radius-xl`, `-lg` | 16 / 14px | **6px** | Large panels, modals, lightbox — deliberately not 0 ("crisp, not crude") |
| `--oltra-radius-md`, `--oltra-dropdown-radius` | 10px | **4px** | Cards, dropdowns, map popups, inputs, buttons |
| `--oltra-radius-sm`, `-xs`, `--oltra-dropdown-item-radius` | 8 / 5px | **2px** | Badges, chips, small pills, thumbnails, dropdown rows |

`--oltra-radius-pill` (999px) untouched — a shape keyword, not a rounding amount.

### Method worth reusing

* **Tokenize first, in a pass with zero visual change**, so a later "the palette is wrong" can be told from "this component isn't wired to tokens at all". Verified pixel-identical via `git stash`/`stash pop` screenshot pairs, not by trusting the diff — Ulrik's explicit acceptance test.
* **Two tokens that play the same role are not automatically mergeable.** The Flights and HotelsView modal scrims were kept separate because their rgba values genuinely differed, and unifying them would have been a real if tiny visual change.
* **Colour candidates are computed and rendered live, never picked by eye** — each muted companion is the dimmest value on its hue still clearing 4.5:1 against both the base and the raised panel. Ulrik's constraint is **solid hex, not white at reduced opacity**, because opacity renders inconsistently between the base and a raised panel.
* On the dark surface a gold filled button needs **dark** text — near-white on that gold reaches only ~2:1. On a light surface the pattern inverts, and the binding constraint for the fill is *text on top of it* needing 4.5:1, not fill-vs-page.
* The app had **25 distinct border alphas and 19 background alphas** — not a scale. §35 bands them.

### `/theme-test` — still exists, still useful

`src/app/theme-test/`. Prod-guarded (`notFound()` when `NODE_ENV=production`), not linked from any nav. Renders **real** components wrapped in `[data-oltra-surface="dark"]`, not replicas — which is why building it kept surfacing real bugs, including two hardcoded-white-text cases the audit had missed. `OltraSelect`/`GuestSelector` gained an additive `defaultOpen` prop for it. The `[data-oltra-surface]` mechanism stays even though only one surface is registered.

**Recurring dev-server flakiness worth recognising**: a bare 500 on a route, and a CSS module silently not applying (`grid-template-columns: none` with the right class name, its `page.css` 404ing). Both times a clean `next dev` on a scratch port proved the source was fine — accumulated `.next` state. Kill the port-3000 process tree, `rm -rf .next`, restart.

---

## 37. PER-CITY NEAREST-AIRPORT MAPPING (2026-08-14)

"Venice says be more specific to find flights" traced to the landing flight teaser resolving cities via the ~70-entry `AIRPORT_OPTIONS` list, which exists for the Flights page's manual autocomplete and covers almost none of the hotel roster's ~500 cities.

`scripts/airports/build-city-airports.mjs` regenerates `src/lib/cityAirports.ts` from the Directus `hotels` collection (city/country/lat/lng for published hotels, grouped by city+country, each group's centroid being the measuring point) and **OurAirports** (`davidmegginson.github.io/ourairports-data/airports.csv`, ~86k rows, downloaded fresh each run to a gitignored cache). Filtered to `scheduled_service == "yes"`, excluding heliports, seaplane bases, closed and balloonports.

**Manual exclusions** — flagged `scheduled_service: yes` but business-aviation only: `TEB` (Teterboro), `LBG` (Paris-Le Bourget), `OPF` (Miami-Opa Locka). With these out, Paris correctly shows just CDG + Orly.

Selection per city:

1. **Same-city airports** — within 25km of the centroid, OR within 60km if the airport's own `name` or `municipality` starts with the city name (catches "London Luton" and "Milan Malpensa", whose `municipality` is a satellite town). **All** same-city matches are listed, uncapped — London shows 6, New York 3.
2. **Otherwise** the nearest airport within 400km alone if it's a clear favourite (next-nearest >1.5× farther); if comparably distant, up to `MAX_HUBS = 3` candidates each within 1.5× of the *nearest* (not chained pairwise). The Alpine case — Zermatt → Milan Malpensa 87km / Lugano 90km / Turin 91km.
3. If nothing is within 400km, the globally nearest scheduled airport regardless of distance.

**A real bug caught during the build**: an earlier ranking pre-filtered tier 2 to `large_airport` types, on the theory that a better-connected hub beats a closer small one. It skipped Missoula (medium, 50km) for Spokane (large, 319km), and Tambolaka (small, 36km) for Lombok 300km across open water. **Dropping the type filter entirely** fixed both — type is stored for reference but never used to filter or re-rank. Pure nearest-distance already matches real gateway patterns.

**Known soft spot, accepted**: ~9 of 507 cities are remote safari lodges reached by charter, not scheduled service, so "nearest scheduled airport" can be a distant city rather than the practical gateway. Not fixable from public scheduled-service data.

Labels strip generic suffixes ("Milan Malpensa International Airport" → "Milan Malpensa"), not hand-tuned. ~9 of 507 cities are remote lodges reached by charter rather than scheduled service, so their "nearest scheduled airport" is a distant city — accepted, not fixable from public data.

Exports `CITY_AIRPORTS` (keyed by the exact Directus `hotels.city` string), `getAirportsForCity(city)` and `getCityForAirportIata(iata)` (§39/§45). Auto-generated — regenerate, don't hand-edit:

```bash
DIRECTUS_URL=... DIRECTUS_TOKEN=... node scripts/airports/build-city-airports.mjs
```

---

## 38. RICHER FLIGHT TEASER, CHECKBOXES, INLINE CHIPS (2026-08-14)

### Flight teaser: 4 rows per airport

Each candidate airport fires **two** searches (economy and business — Duffel `CabinClass` values). Per (airport, cabin) pair, one search yields **both** "Best price" (cheapest) and "Fastest" (shortest, deduped against best-price by itinerary id) — no second search needed. State keyed `${iata}__${cabin}`.

Each airport block shows its label, IATA and `distKm` from the city centre (already computed by §37's pipeline), then Standard and Business sections of two rows each. Each block renders as soon as *its* call resolves, not blocked by slower siblings.

**Cost implication, flagged not fixed**: up to 3 airports × 2 cabins = **6 parallel Duffel searches** per landing visit for a multi-hub destination. Each is cached server-side 15 min (`CACHE_TTL_MS`), but the first visitor to a given date/guest combination triggers all six live.

### Chips inside the input box

Chips render inside a `.chipInputBox` flex-wrap container alongside the text input, in the shared `StructuredDestinationField` (landing and Hotels both). **Deliberately not built on the shared `oltra-input` class** — that hardcodes `height: var(--oltra-control-height)`, which fights the wrap-to-two-lines requirement through specificity; `.chipInputBox` replicates the border/background/radius tokens directly with `min-height`.

---

## 39. HOTELS PAGE FIXES + RESIDENCY REMOVED (2026-08-14)

### Airport name leaking into the destination field ("Venice Marco Polo")

Traced end to end: landing saves `city: "Venice"` to the shared cross-page session; Flights resolves it to `VCE`; Flights' session-merge effect then wrote `city: cityForCode(search.to)` back into that **same** session — and `cityForCode` parses the part after "·" in `AIRPORT_OPTIONS`, which for VCE is `"Venice Marco Polo"`. So the session's city was silently overwritten with an airport name, surfacing on Hotels as a normal removable "City: Venice Marco Polo" chip, because `buildInitialTokens` built a city token from the URL unconditionally.

**This `cityForCode()` fragility predates the Venice entry** for any label that isn't a bare city (Milan Malpensa, Rome Fiumicino, New York JFK).

Two-part fix: the build script now emits `getCityForAirportIata(iata)` — a reverse lookup returning a real hotel city or `""`, never a fabricated one — and `FlightsView`'s merge effect uses it; and `buildInitialTokens` only builds a city/country/region token if some hotel in the dataset actually carries that value, mirroring the existing `qMatchesHotel` guard.

### Other

* Add to Trip / Add to Favourites moved from the bottom of the left pane into the right metadata pane under "Brand" — grouping account actions with the hotel's static metadata rather than pinning them below a variable-height rooms list. The trip picker now opens downward.
* "Not available on Ratehawk" → **"No availability"** — the supplier name is an implementation detail a guest has no reason to see.
* **Residency selector removed.** Before removing it, the effect was measured live across 10–16 residency codes: a Paris hotel showed **zero** variance; a Dubai hotel showed a tiered ~1.9% and ~2.9% above baseline. The ETG **test hotel shows no variance at all** — a static fixture, useless for this kind of check. Conclusion: real but ≤3% and property-specific. The control is gone; detection and sending are unchanged (§32 requires it). Replaced with a non-interactive "Prices assume booking from {country}." A precise prompt at booking time fits whenever that flow is built.

---

## 40. CREATE-HOTELS-BATCH — MISSING COLUMNS AND VALUE CLEANUP (2026-08-16)

### Six columns were missing from the create payload

`buildCreatePayload()` omitted `lat`, `lng`, `primary_setting`, `secondary_setting`, `primary_style`, `secondary_style`, so any input file carrying them had those values silently dropped.

**`lat`/`lng` deliberately do NOT use `Math.trunc`**, unlike the adjacent integer fields — truncating a coordinate moves a hotel by up to ~100km. `null` stays `null` and `0` stays `0` (a valid coordinate, so `??`-defaulting is wrong too).

**Schema gotcha**: `GET /fields/hotels` reports `lat`/`lng` as `type: "integer"` but `schema.data_type` is `numeric` and decimals round-trip intact. Same class of cosmetic mislabelling as the `text[]` columns in §4 — **do not take Directus's `type` metadata as evidence about these columns.**

The 14 existing batch files carry none of the six, so this changed nothing for IDs 2001–2067. The script is for **new** additions only; existing hotels are not to be re-uploaded.

### Single-select validation

Validated against the same `TAXONOMY.setting`/`.style` lists in the script — **case-insensitive, canonicalizing to the taxonomy's spelling**, because nothing had ever constrained the columns and rows had drifted (`"Safari lodge"` ×13, `"Private island"` ×8, `"Tented camp"` ×6 — in two of those the drifted form was the *only* spelling present, so a case-sensitive check would reject the dominant value). A case-only correction prints a note rather than being applied silently. Since §44 the fields themselves are locked, so this is now a pre-flight that fails fast before hitting Directus.

**Bug caught in testing**: the first version compared against `canonicalizeChoice()`'s return value, but that helper passes an unmatched value straight through — so an unknown value was indistinguishable from an exact match and `"Lakefront"` validated clean. **Membership must be tested directly.**

### Value cleanup — applied to Directus (10 hotels)

Via `fix-setting-style-values-2026-08-16.mjs` (dry-run by default, re-runnable, re-reads each stored value first): `secondary_style "184"` → `null` (8 rows), `primary_setting "Lakefront"` → `"Lakeside"` (id 1461), `secondary_setting "Riverfront"` → `"Riverside"` (id 1839). Verified across all 871 rows: no value in the four columns falls outside the taxonomy.

**`"Riverside"` is deliberately untouched** — a canonical value carried by 29 hotels' `setting[]` arrays, not drift. Retiring it for `Waterfront` would mean converting ~30 hotels including their tag arrays, removing the Directus choice, and dropping it from the Setting filter. Explicitly deferred — ask before assuming.

id 1461 was first written as `"Waterfront"` then corrected to `"Lakeside"`, because its own `setting[]` already read `["Lakeside"]`. **General lesson: a row's own tag array is the best available corroboration for what a drifted single-select should become.**

Two script details that exist because of that double-write, and matter for any one-time fix script: `from` accepts an **array** of prior values, so the script converges on the same end state whether run against pristine or already-patched data; and the rollback record **appends** rather than overwrites, since a re-run only reports rows it actually changed.

---

## 44. TAXONOMY FIELDS LOCKED + HIGHLIGHTS TYPO PASS (2026-08-16)

### Every taxonomy field now has a locked choice list

| Field(s) | Choices | Interface |
|---|---:|---|
| `primary_style` / `secondary_style` / `style[]` | 20 | dropdown / multi |
| `primary_setting` / `secondary_setting` / `setting[]` | 22 | dropdown / multi |
| `activities1`–`7` / `activities[]` | **37** (was 39) | dropdown / multi |

All `allowOther: false`, `allowNone: true` on the single-selects, which were plain `text` with `interface: null` until now (§40).

**The choices came from the multiselect siblings**, locked since §4 — no vocabulary was invented. Both members of each pair share one list, so an editor can set a value as primary even if it currently only appears as secondary.

**Why locking, not another clean-up**: `"Private island"` had been corrected **twice** — §40 fixed 8 rows, and 8 more had appeared by this session. Cleaning an unconstrained field only resets the clock.

### Data corrected

Case fixes across `Safari lodge`, `Tented camp`, `Private island`, `HIking`, `Kajaking` and one trailing-space `"Spa "`. **Merges** (approved, and the only vocabulary change): `Biking` → `Cycling` (15 hotels) and `Jeep safari` → `Safari` (4), both then removed from the choice list so the filter stops offering dead options. **20 hotels had duplicate tags** in `activities[]` — pre-existing, unrelated to the merges, deduped in the same pass.

### Scripts (`scripts/hotels/`)

* `fix-taxonomy-case.mjs --group style|setting` — case normalisation. Anything that is *not* a case variant is **reported, never guessed** (§40's `Lakefront` needed a human call and was initially got wrong). A row's own tag array is the best corroboration.
* `set-taxonomy-field-choices.mjs --group style|setting|activities` — copies the multiselect's choices onto its single-selects. Meta-only; the column stays `text`. **Refuses to run if any stored value is outside the list** — Directus does not validate existing rows, so locking over bad data leaves it in the database rendering blank in the admin UI. That guard caught the invisible `"Spa "` trailing space.
* `fix-activities-values-2026-08-16.mjs`, `retire-activity-choices-2026-08-16.mjs`
* All dry-run by default, rollback records that **append** rather than overwrite (§40).

Writing these arrays still needs the Postgres array literal (§4), on `PATCH` as well as `POST`.

### Highlights typo pass

126 of 903 hotels edited: 99 spelling occurrences, 28 whitespace, 3 double spaces, 1 dangling comma, 14 approved grammar rewrites. `facilities` was misspelled **13 different ways**; `Michelin` as "Micheling" ×5. Three proper nouns were wrong: `Kilimajaro`, `Altas Mountains`, `Ihuazu` (→ Iguazu).

**Method, for repeating this on `description`**: frequency-map the field, review rare words *in context*, then widen the band. A ≤2-occurrence filter alone would have missed `facilties` (5), `micheling` (5), `accomodation` (4) — **a typo repeated often enough stops looking rare.** And beware the tokeniser: splitting on non-`[A-Za-z]` turns `décor`→`cor`, `château`→`teau`, `Belle Époque`→`poque`. Those are not typos.

Two bugs in `fix-highlights-typos-2026-08-16.mjs` were caught by its own dry run: phrase rewrites ran *before* word fixes, so any phrase containing a typo could never match; and **Directus returns `id` as a string**, so a number-keyed lookup silently matched nothing — including silencing the "did not match" warning. **A no-op that reports success is the dangerous shape.**

---

## 45. UI PASS + SAVED-TRIP SCHEMA (2026-08-17)

Commit `5556444`. A page-by-page list from Ulrik across Landing, Hotels, Flights, Restaurants and Members, plus the schema it needed.

### Members schema — 12 columns

`scripts/members/2026-08-17-add-trip-item-prices.sql`, run in the Supabase SQL Editor against the **Members** project (§31), all nullable, all `add column if not exists`:

| Table | Columns |
|---|---|
| `member_trip_hotels` | `price_amount`, `price_currency`, `rooms`, `adults`, `kids`, `children_ages` |
| `member_trip_flights` | `price_amount`, `price_currency`, `adults`, `kids`, `destination_arrive_at`, `return_depart_at` |

**There is no Directus step, and that's worth stating because it's the natural assumption.** Directus is a CMS layer over the *Hotel database*; `member_trip_*` lives in the Members project, which Directus has no connection to.

**`destination_arrive_at` is not `arrive_at`.** A return itinerary is one row, so `arrive_at` is the arrival *back home*; `destination_arrive_at` is the outbound's final segment and `return_depart_at` the departure from the destination (null one-way). Anything comparing a flight against a hotel date must use the new pair, or it compares the wrong end of the trip.

Two failed attempts preceded the successful run, and both errors are diagnostic:

* A PostgREST probe returned raw `42703`. A stale schema cache gives `PGRST204`/`PGRST100` instead, **so `42703` proves the DDL genuinely never ran.**
* The next attempt errored `42701: column "room_selection" already exists` — a column that script never mentions. **`add column if not exists` cannot raise `42701`, so that error is proof the wrong SQL is loaded**, and naming a real table proves the project selection was right.

### Behaviour

* **Saved prices are flat numbers captured at save time**, never recomputed on render. "Update price and availability" re-runs the real supplier query and writes back. Hotels re-price exactly via `/api/members/hotel-price`, which resolves `ratehawk_hid` server-side so it is never handed to the browser, and short-circuits on `ratehawk_status: passive`. **Flights cannot re-price exactly** — a Duffel offer is short-lived — so the refresh returns the cheapest fare on that route/date/cabin now, and the card says so rather than implying the saved fare stands.
* **Trip warnings** (`lib/members/tripWarnings.ts`): overlapping hotels, a flight landing after the room starts, party-size mismatch, nights with no room. Cross-checks run only when a trip has both hotels and flights. **Timestamps are read as written** (regex on the ISO string), never converted — "did I land after check-in" is a question about local time at the airport. Verified against 10 scenarios in Node, including back-to-back hotels which must *not* warn.
* **`travelers_label` is written by nothing except the demo seed data**, so it is null on every real trip — which is why the party-size check needed passenger columns rather than parsing that label.

### Root causes worth generalising

* **`getCityForAirportIata` resolved LHR to "Eynsham Park".** The reverse map was first-seen over object keys (alphabetical) and four hotel cities list Heathrow. Nearest-wins alone doesn't fix it — Heathrow is 13km from Sunningdale and 22km from London. Now: a city named in the airport's own label wins, then nearest. **Fixed in both `build-city-airports.mjs` and the generated `cityAirports.ts`** — editing only one would not have been enough.
* **A CSS-module class vs a global class is a specificity tie**, so declaration order decides. **Use compound selectors (`.a.b`) when a modifier must win.**
* **Anything that must be exactly equal should be a grid track (`minmax(0,1fr)`), not a flex child** — flex sized two buttons by content and the row was too narrow for `flex-grow` to even them out (63.2px vs 49.6px).
* **A control inside a `<form>` fires that form's `onChange`.** Typing in the residency search box reset every result card to "Select dates". Fixed with `stopPropagation`.
* **`stopPropagation` does not cancel an anchor's default action, only `preventDefault` does** — saving a hotel from a landing card navigated to that hotel, because the card is an `<a>` and the picker renders inside it.
* **The itinerary wouldn't close** because it sits in `.oltra-page__content`, `position: relative; z-index: 1` and therefore its own stacking context, so `z-index: 700` could never rise above the fixed header. Now portalled to `document.body`.
* Hotels favourites were keyed on the favourite row's uuid rather than the hotel's Directus id, so "ALREADY IN FAVOURITES" could never appear.

New files: `components/site/ResidencyPicker.tsx`, `lib/members/tripWarnings.ts`, `api/members/hotel-price/route.ts`, `api/restaurants/by-ids/route.ts`.

---

## 46. SECOND UI PASS, VERIFIED AGAINST A REAL MEMBER (2026-08-17)

Commits `643df9f` and `3b39b24`. The important part is not the fix list — it is *why* several §45 items were reported done when they weren't.

### Verifying member-gated UI: Ulrik hands over the session

`/members/*` needs an account login, and session automation must never type credentials. The workaround, used successfully: **Ulrik logs in himself in the Claude-in-Chrome tab and says when he's in**; the session cookie lives in that tab, so the authenticated pages can be driven from there. Use this whenever member-gated UI needs real verification — four bugs were found this way that were invisible against seeded demo data, and none would have been caught by `tsc`.

### Measure the DOM, do not read screenshots

§45 shipped three alignment "fixes" that were not fixes, two of them reported done twice. All three were caught by reading `getBoundingClientRect()`.

**Grid track geometry, not padding** is the reusable one. The Flights header row was never inset the way `.pinnedRow` is, so the two grids resolved *different track widths* (282.8px vs 269px). Padding on a header label moves text **inside** a track; it cannot move the track. Departure merely looked right because it is left-aligned. **Two rounds of padding tweaks preceded the real fix and both made it worse. If two grids must align, give them the same geometry — don't compensate per element.** The other two were §45's grid-track rule, and a block wrapper adding descender space under an inline-level button (`display: flex` on the wrapper).

### Directus: one bad id fails the whole `_in` filter

Favourite-hotel highlights silently never appeared while calling the endpoint by hand worked. **Directus rejects the entire `_in` filter if any value can't be cast to bigint**, so a single placeholder id from a seeded demo row failed the lookup for every real record in the batch. Both `/api/hotels/by-ids` and `/api/restaurants/by-ids` now drop non-numeric ids first — the restaurants route had the identical exposure and would have failed the same way on the first real favourite.

### Other rules worth carrying

* **Removing a child from a fixed-column grid.** `.members-item__layout` is `84px minmax(0,1fr)`; removing the thumbnail left the content as the *first* child, rendering inside the 84px track one word per line. A `--no-thumb` modifier gives those cards one full-width column.
* **A blocked control stays clickable rather than `disabled`** — a disabled button fires no click, so it can never say why. `getCreateTripBlockedReason()` in `lib/members/tripLimits.ts` is the single rule for the picker's three implementations (empty name / duplicate name / 8-trip cap), and the reason renders *inside* the picker; it was first wired to a status line elsewhere in the pane, where it was set correctly and nobody would ever see it.
* **Checking printed output is a separate act from checking the modal.** Flip every `@media print` block's `conditionText` to `screen` via CSSOM, then screenshot. That revealed `repeat(auto-fit, …)` fact grids spreading into six columns, and no page margins at all — neither visible on screen. Fixed with two fixed columns and `@page { margin: 14mm }`.
* **For anything transient, record it; do not sample it.** The Flights save flashes "Saved" for 2.5s, and two checks read the button *after* the flash expired and concluded it was broken. A `MutationObserver` across the click captured the real sequence: `SAVE → Saving... → Saved (italic) → SAVE`.
* Warnings live in exactly one place — the Editor notes box under Trip notes, always present, showing "All good but prices may have changed since your last save" when clean. They use `--oltra-error-text`; the cards had been using a separate amber, which is why they read as two systems.

### Password reset (`3b39b24`)

The handler only set a placeholder, with a comment deferring the send to a Vercel server function. **That premise was wrong** — Supabase sends this from the browser, so nothing was blocking it. Sending alone is half a feature, though: the emailed link returns to `/login` with a recovery session the old form could do nothing with, hence the SET A NEW PASSWORD view. Config prerequisites and the untested last hop are in §16.

Review ratings: six dropdowns became one row per criterion with five stars. **Stored values are unchanged** (`not_observed` or `"1"`–`"5"`), so scoring, validation and submission behave exactly as before — only the control changed.

---

## 49. HOTEL GEOGRAPHY SPLIT — `admin_region` + TRAVELLER AREA (2026-08-31)

Commit `90f4287` here and `b1e9294` in `oltra-agents`. §3 carries the resulting field definitions; this is the how.

### What prompted it

Adding `state_province_county_island` to the destination dropdown surfaced that the column held two different ideas at once — administrative units (Tuscany, Canton of Zurich) beside traveller-facing areas (Amalfi Coast, Kruger National Park) — and that 366 of 903 rows were blank, so searching "Tuscany" returned 3 hotels.

### Order it ran in

Clean the source values first (they were the input to everything downstream), then triage 223 *values* rather than 903 rows — one decision per distinct value resolved 537 hotels, where per-hotel review would have been ~4x the work for the same answer. Apply the split, then fill the 366 blanks per hotel, since those had no value to key on.

### Scripts (`scripts/hotels/geo-2026/`)

`add-admin-region-field.mjs` (schema, snapshots diffed) · `export-geo-values.mjs`, `export-geo-gaps.mjs` (read-only) · `build-geo-review.mjs`, `build-gap-review.mjs` · `apply-geo-split-2026-08-31.mjs` (537 rows) · `apply-geo-gaps-2026-08-31.mjs` (366 rows) · `fix-geo-typos-2026-08-31.mjs` (`Equador`→`Ecuador`, `Sourfriere`→`Soufrière`).

All apply scripts: dry-run by default, re-read each row before patching, **appending** rollback records. The two proposal JSONs are one-time records — copy for a future round, don't edit.

**Result**: 903/903 carry an `admin_region` (291 distinct); 470 carry a traveller area (222 distinct). 8 wrong values and 14 duplicates gone.

### Traps worth not repeating

* **An apply script keyed on a value it overwrites is not idempotent, and the second failure mode is worse than the first.** `apply-geo-split` looks rows up by their pre-split value; after a run, 130 of 537 no longer resolved — a loud abort. But some **re-resolved to the wrong entry**: Mandarin Oriental Cortina ends up `area="Dolomites"`, matching the row whose admin is South Tyrol — right for Alta Badia, wrong for Cortina, which is Veneto. A re-run would have silently corrupted it. Fixed by making the **rollback record** the authority on what is already applied.
* **A value-level decision cannot be applied blindly to every hotel under it.** 39 hotels needed per-hotel handling: two Portofino properties filed under the Amalfi Coast (wrong coast), Chablé Yucatán among eight Quintana Roo properties, Kruger lodges spanning Limpopo and Mpumalanga, Six Senses Yao Noi in Phang Nga rather than Phuket. The script encodes them as an explicit `PER_HOTEL` table rather than fixing them in a later pass.
* **Python's text-mode write flips line endings.** Editing a file produced 1,373 insertions on a 1,338-line file — every line, CRLF. Use `newline=""` on both read and write, and **check `git diff --stat` looks proportionate before trusting it.**
* **Stripping accents to dodge shell encoding is a data downgrade.** The first triage draft wrote `Mahe` over the DB's correct `Mahé`. Caught in the dry run.
* **Geography values are join keys, not display strings.** Each typo fix required a code change in the same pass: `country-map.mjs` and `oltra-countries.json` for the country (a mismatch silently drops a country from the dump filter, §26), `cityAirports.ts` for the city.

### Found along the way

* **Sri Lanka was absent from `country-map.mjs` entirely** — exactly the silent-drop case §26 warns about, affecting Amanwella (id 3003). Code confirmed as `LK` against ETG's own Content API response, not assumed from ISO.
* **`cityAirports.ts` predated 7 published-hotel cities** (Aswan, Beau Champ, La Baule, Ngala, Phinda, St. David, Tangalle), which resolved to no airport in the landing teaser. Regenerated: 507 → 514 cities, 0 removed. The 21 remaining unkeyed cities are all **unpublished** hotels, which the generator excludes by design.

### Not done

* **`admin_region` was locked on 2026-09-11** (§3), `state_province_county_island` deliberately not — traveller areas keep growing, and ~290 choices is already a long dropdown where every new destination needs a schema edit. The concern that prompted the deferral was real: this column had drifted into `Giorgia` and `Boca Raton`, and §44's lesson is that cleaning without locking resets the clock.
* **`local_area` is untouched** and still holds neighbourhoods. Ulrik flagged a separate pass for it.

---
