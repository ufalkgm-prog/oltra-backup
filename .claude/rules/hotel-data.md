---
paths:
  - "**/scripts/hotels/**"
  - "**/scripts/restaurants/**"
  - "**/src/lib/directus/**"
  - "**/src/lib/directus.ts"
  - "**/src/lib/hotels/**"
  - "**/src/lib/hotelFilters.ts"
  - "**/src/lib/hotelOptions.ts"
  - "**/src/lib/hotelSearchSuggestions.ts"
  - "**/src/lib/editorHotels.ts"
  - "**/src/lib/restaurants.ts"
  - "**/src/app/editor/**"
---

<!-- Split out of CLAUDE.md on 2026-09-12. The text is moved verbatim and the
     section numbers are unchanged, so every §N cross-reference still resolves.
     This file loads automatically when Claude reads a file matching `paths`
     above; CLAUDE.md keeps a one-line pointer to it for the cases where the
     work starts before any such file is opened. -->

# HOTEL DATA

The hotels and restaurants data model, the geography fields and what each one means, and the taxonomy vocabularies. Read this before writing to Directus, before changing a filter, and before touching a geography or taxonomy value.

---

## 3. CORE DATA MODEL (SUPABASE / DIRECTUS)

Never write directly to Supabase for content; always go via Directus.

### Hotels

Schema migrated 2026-06: `hotelid` removed (use `id`), `editor_rank_13` → `editor_rank`, the double-underscore state field → single underscore, and `activities`/`awards`/`settings`/`styles` went from M2M relations to flat multiselect tag fields (`setting`/`style` are now **singular**). See §4.

Geography — five fields, each with one meaning (split 2026-08-31, §49):

| Field | Holds | Examples |
|---|---|---|
| `region` | Continent. 10 fixed values. | Europe, Africa, Asia |
| `country` | Country. | Italy, Switzerland |
| `admin_region` | The **administrative** unit — state, province, canton, prefecture, emirate, county. **Never null** (all 903 rows). | Lombardy, Valais, Kyoto Prefecture |
| `state_province_county_island` | The **traveller-facing area** — what someone types into a search box. **Null for a major city**, where `city` does the job. 471 of 903 populated. | Lake Como, Amalfi Coast, Masai Mara |
| `city` | Town, or for a lodge the reserve/area name. | Cernobbio, Sabi Sand Reserve |

Three things that look like bugs and aren't:

* **`admin_region` and `state_province_county_island` may hold the same value** — wherever the administrative unit is also what a traveller types (Tuscany, Bali, Sicily, Rajasthan).
* **`region` means continent.** A user searching "Tuscany" matches the traveller-area field.
* **A major city's traveller area is deliberately empty** (Rome, Tokyo, Marrakech, Geneva). Filling it would repeat `city`.

Both are searchable levels in the destination dropdown (`StructuredDestinationField`), narrowing hotel > city > area > admin_region > country > region. `local_area` is **not** searchable — it holds neighbourhoods (Mayfair, Kowloon).

**The destination dropdown (2026-09-16, Landing and Hotels alike):**

* **Four groups, in this order: Geography, Hotel, Setting, Purpose.** Geography holds city, area, admin_region, country, continent (`region`, chip label now "Continent") and the **colloquial regions** — the concierge's 18 `MACRO_REGIONS` ("The Alps", "The Mediterranean"), labelled "Region". Each Geography row shows its level.
* **Typed text must start a word** of the name: "me" finds Mexico, New Mexico and The Mediterranean, not Palermo. Accent- and case-blind.
* **Geography is listed broad first** — regions, countries, areas, then cities, then admin units and continents — because only four rows show before scrolling, and cities-first put Mexico twelfth for "Me". A name held at several levels ("Mexico City" city and admin region) is listed once, at its narrowest; Enter on an exact name still picks the narrowest (the city).
* **A colloquial region is a URL param, `macro_region`**, filtered by the pages as `macroRegionFilter` (Directus) plus `filterHotelsByMacroRegion` (its setting requirement, which Directus cannot filter). The dropdown gets each hotel's regions precomputed server-side (`SuggestionHotelRow.macro_regions`, via `hotelInMacroRegion`). Verified: all 18 regions return exactly the same hotels on the page as the dropdown counts.
* **"French Riviera"** is offered as the area Côte d'Azur (`AREA_ALIAS_TERMS` in `macroRegionTerms.ts`, shared with the concierge's `AREA_ALIASES`).
* Some stored `hotel_name` values carry trailing whitespace; the dropdown trims, a raw fetch does not — compare trimmed.

**`local_area` is strictly sub-city** — neighbourhoods and districts only: Mayfair, Meatpacking, the Paris arrondissements. **Not** a travel area. 19 rows were cleared on 2026-09-11 for holding a region-level value, `Lake Como` among them appearing as a "neighbourhood" across five different towns, which is the inverse of a district: one area spanning many towns rather than one town divided. 17 of the 19 were exact duplicates of `state_province_county_island`, so nothing was lost.

Three were kept that the same test flagged, because they are genuinely below city level and only matched for appearing in the area field too: Capella Singapore's **Sentosa Island**, Amanera's **Playa Grande**, and Fasano's **Punta del Este** — the last because `city` there reads "Maldonado", the department, so `local_area` holds the more accurate of the two.

**Coverage is uneven and that is not all a gap.** 247 of 903 rows carry one. London (30/30), New York (21/21), Paris (19/19), Milan, Venice, **Bangkok (15/15) and Tokyo (9/9)** are complete. But ~33 cities are correctly empty — Courchevel, Zermatt, Oia, Sabi Sand — because a ski village or a game reserve has no neighbourhoods. Judge coverage against whether the city HAS districts, not against the row count.

**The four worst-covered cities were filled 2026-09-11**, 39 rows across two scripts (`fill-local-area-tokyo-dubai-marrakech-` and `-bangkok-2026-09-11.mjs`). Two things are worth carrying forward more than the values:

* **Half of Marrakech's "gap" was not a gap.** It sits at **5/10** and is finished. Four hotels say in their own descriptions that they are *outside* the city — Amanjena "just outside Marrakech", Fairmont Royal Palm "about 12 kilometres from the old medina", Mandarin Oriental on Route du Golf Royal, the Oberoi on Route de Ouarzazate "25 minutes" out — so they have no district, exactly like the ski villages above. A fifth, Four Seasons Resort Marrakech, places itself "*between* the old medina and the city's modern Gueliz and Hivernage districts": it names three and claims none, and is **left for review** rather than guessed. Both scripts list their deliberate blanks and **assert them still empty**, so a later pass cannot read a considered decision as unfinished work.
* **Evidence tier beats confidence.** Every row is marked **A** (the district is named in the hotel's own description) or **B** (it comes from the property's address, i.e. from outside the data) — 24 A, 15 B. Tokyo needed no judgement at all: all nine descriptions name their neighbourhood. Bangkok is 11 of 14 tier B, which is the honest measure of how much of that city came from addresses rather than from us.

**A development is not a district** — the Shenzhen `UpperHills` rule, and it decided four Tokyo rows. Roppongi Hills, Tokyo Midtown, Otemachi One and Azabudai Hills are building complexes; the districts are Roppongi, Otemachi and Azabudai. It also **corrected an existing value**: Janu Tokyo held `Azabudai Hills`.

**Bangkok mixes khwaeng and khet on purpose, and that is not drift.** Ulrik chose administrative districts over the bank-and-strip names guests use, both alternatives having been the things earlier passes normalised away — Thonburi is half the city, Charoen Krung a road. The stored set is the most *recognisable* district in each case, the same standard Ginza, Mayfair and Palm Jumeirah already meet: khwaeng for `Lumphini` and `Yan Nawa`, khet for `Sathorn`, `Bang Rak`, `Khlong San` and `Dusit`, and `Phrom Phong`, which is a BTS station that named its neighbourhood. The rejected uniform-khet scheme put **Watthana** on 137 Pillars, which tells a guest nothing. Five hotels share khwaeng `Lumphini` around the park — Aman Nai Lert plus Rosewood, Okura, St. Regis and Hotel Muse, whose own texts name only the khet above it; Aman's value is asserted as an anchor, because using Pathum Wan for the others would have forced it down a level and lost what its description supports. Capella and Four Seasons are `Yan Nawa`, **not** Bang Rak: Charoen Krung runs south out of Bang Rak and both sit past that line, at 300/2 and 300/1 of the same road.

**`1614` The Ritz-Carlton, Al Wadi Desert was in the wrong emirate, and both fields were wrong** — `admin_region: "Emirate of Dubai"` and `city: "Dubai"`, with coordinates 90km northeast in Ras Al Khaimah. Fixed 2026-09-11 to `Emirate of Ras Al Khaimah` / `Ras Al Khaimah`. This was not cosmetic: `admin_region` is the axis the concierge prefers when narrowing a broad set precisely because it is never null (§50), so the row was reachable by a search that should not return it and missing from one that should. It was also distorting real output — the Dubai city group's centroid was being dragged 90km northeast, and removing it moved Dubai's own airport distances (DXB 12 → 19km, DWC 35 → 30km). `city` is `Ras Al Khaimah` rather than the reserve name because the collection had already answered it for the UAE: Qasr Al Sarab sits ~200km out in the Liwa Desert and is filed `city: "Abu Dhabi"`. Rebuild gave `Ras Al Khaimah → RKT`, a large airport 11km away, 514 cities.

**This was the first time the `admin_region` lock cost anything, and the order is the lesson.** "Emirate of Ras Al Khaimah" was not among the 291 choices, so the list had to grow to **292** first. **Directus does not validate writes against the choice list** — patching the row first would have SUCCEEDED, and §44 records what happens next: the value renders blank in the admin UI and can never be selected again. So extend the list, re-read it, and only then write the row; the script aborts rather than write if the re-read does not show the new value.

**A useful check fell out of it**: hotels more than 300km from the centroid of their own `admin_region`. It reports 16 and **none is a defect** — Reykjavik at 1369km from Copenhagen under the shared "Capital Region" entry (the Denmark/Iceland ambiguity the lock script already records), Queensland's 1,700km spread, California's Napa/Tahoe/SF. Read it as a prompt to look, not a list of errors — but it is the shape that would have caught 1614 years earlier.

**`2039` was the collection's only parenthetical** — `Dubai International Financial Centre (DIFC)`, a name stored beside its own abbreviation and, at 43 characters, the third longest value anywhere. Shortened to **`DIFC`** 2026-09-11: its own description says "anchors Gate Village in DIFC", a bare acronym is already house style (3021 and 3027 both hold `AMAALA`), and the long form repeated the city. Gate Village is not the answer despite being named first — it is a development inside DIFC, the `UpperHills` rule again.

**The compound detector was too narrow all along, and this is the one to carry forward.** Every `local_area` pass on 2026-09-11 reported "0 compound values"; all of them only tested for a **comma**. Widening it to a slash and the word "and" found **seven more** no earlier sweep had ever reported — Baku, Doha, Seoul, Kauri Cliffs, Madrid, Coworth Park, Milan — plus **two rows holding a phrase that describes a location instead of naming one** (3015/3016, `Private concession bordering Moremi Game Reserve`), which no separator test catches at all. Its first draft was itself assembled from the longest stored values and missed Doha, Seoul and Coworth Park, all too short to stand out. **A detector beats a glance.**

**All nine were fixed the same day** (`fix-remaining-local-area-2026-09-11.mjs`) — five filled, and **four cleared, which is the half worth reading**. In each of the four the stored value named somewhere the hotel is *next to* rather than somewhere it *is*, and the hotel's own sentence gives it away:

* **Coworth Park** — "lies **in** Sunningdale **on the edge of** Windsor Great Park, **a few miles from** Ascot Racecourse". It is in Sunningdale, which is already its `city`; the two stored names were a park it borders and a town it is near.
* **Rosewood Kauri Cliffs** — `Kauri Cliffs` is the estate, i.e. the hotel's own name echoed back, and Tepene Tablelands is the farm's locality. A 6,000-acre working farm on a headland has no neighbourhoods.
* **&Beyond Sandibe and Nxabega** — one sentence, **identical on two lodges 50km apart**, which alone shows it identifies neither. Mombo and Chief's Camp, their siblings in the same `city`, were cleared earlier the same day and are asserted as the precedent.

The five filled: `Gwanghwamun` (Jongno-gu is the gu above it — Lumphini over Pathum Wan again), `Barrio de las Letras` (a square plus a UNESCO designation, neither a district; the text names exactly one and that is it), `Porta Nuova` and `West Bay` (a square and a promenade normalising to their districts), and **`Sabail` for Four Seasons Baku — the only row where the stored value was actively WRONG rather than merely compound.** Its own description says the Old City walls "rise just **steps away**", and steps away is outside: the hotel sits ~300m south of Icherisheher in the Sabail raion. `Sabail` is the weakest of the five, being correct but less meaningful to a guest than what it replaced.

**The sweep now runs with no exemption list at all** and returns 0 on every condition — compound, parenthetical, city echo, prefix overlap, and any value over 30 characters. **247 populated.**

**The last three were tidied the same day**: `1467` Park Hyatt Milan `Piazza del Duomo` → **`Duomo`** (a square → its quartiere), `1465` Palazzo Parigi `Borgonuovo` → **`Brera`**, and `2028` Mandarin Oriental Doha `Msheireb Downtown Doha` → **`Msheireb`** (a development name; the quarter is Msheireb — the `UpperHills` rule for the seventh time). Palazzo Parigi's was **doubly wrong**: Borgonuovo is a street, *and not this hotel's street* — its own text says it "occupies Corso di Porta Nuova". Whoever entered it was thinking of the right district and wrote down a road inside it.

### `audit-local-area.mjs` — read-only, re-runnable

The clean-up ended with a standing audit rather than a one-off answer, because the day's real lesson was that **a check which cannot see a defect reports zero exactly as confidently as a clean collection does**. It separates two classes deliberately:

* **DEFECTS** — provably wrong under the rules above: compound separators (comma, slash *and* the word "and"), parentheticals, city echoes, region-level values, one district at two levels in a city, one district spelled two ways. **All six are at zero.** Any hit fails the run.
* **CANDIDATES** — shaped like a defect, often legitimate; a hit means *look*, never *fix*, and they never fail the run. Street/square shapes (7), development shapes (9), landform shapes (25), over-long values (0), and one district name shared by two cities (Soho, deliberate). Most hits are correct — Palm Jumeirah contains "Palm", Jumeira Bay Island contains both "Bay" and "Island" — which is exactly why they are not defects.

It also prints **coverage by city**, where a *partly*-filled city is the actionable signal rather than an empty one.

### Completing the 35 partly-filled cities (2026-09-11)

**100 empty rows: 88 filled, 12 kept empty on purpose and asserted so.** `local_area` went 247 → **335**. Five cities remain partly filled and all five are *finished* — Marrakech 5/10, Saint-Tropez 2/5, Punakha 1/3, Abu Dhabi 7/8, Ubud 3/4 — because each blank says in its own description that it is not in a district, mostly that it is not in the city (Amanjena "just outside Marrakech", Villa Belrose "near Gassin", Qasr Al Sarab in the Liwa dunes ~200km out, COMO Shambhala "outside Ubud").

**The rule that decided the most: a city's own house style wins.** These cities do not agree on what a district is, and one scheme imposed on all of them would have been wrong in both directions. **Rome stores landmarks** (Spanish Steps ×4, Colosseum), **Milan stores districts** — so Rome's new rows are landmarks (Via Veneto, Piazza della Repubblica) while Milan's lone square became `Duomo`. The same principle explains both. Where a city had no established value, the district won.

The same rule keeps **Hong Kong at island level**: seven rows already read `Hong Kong Island` or `Kowloon`, so The Murray (Central), The Hari (Wan Chai) and Upper House (Admiralty) all became `Hong Kong Island`. Finer values would be defensible, but mixing two levels inside one city is the Midtown defect. Converting the seven was not asked for — flagged, not done.

**49 tier A, 39 tier B.** Tokyo-style cities where every description names its neighbourhood are A; Abu Dhabi is the weak end, its three tier-B rows (`Ras Al Akhdar`, `Al Maqta`, `Al Khubeirah`) named in no description and listed in the script as the first to override.

**The script pre-flights the RESULTING collection, not the current one** — it simulates all 88 writes and refuses to run if the result would contain a two-level city, a spelling split, a compound or a city echo. That caught a real error before it was written: `El Monteon` against the stored `El Monteón`. §49's "stripping accents is a data downgrade", caught by a machine rather than by eye. Three more new values needed the same correction by inspection, having nothing to collide with: `Zürichberg`, `Yıldız`, `Karaköy`.

**Two coincidental homonyms are exempt in the audit, and they are not defects.** Chicago's `Gold Coast` trips the region-level check only because Australia's Gold Coast is a traveller area on a Queensland hotel; `Santa Croce` is a rione in Florence *and* a sestiere in Venice. Two places on two continents sharing a name is not an error.

**Rosewood Doha now reads `city: "Lusail"`** with `state_province_county_island: "Doha"` and `local_area: "Lusail Marina"` (2026-09-12, `fix-lusail-city-2026-09-12.mjs`). Its own text is the evidence: it "rises in Lusail's Marina District, a new waterfront quarter **north of central Doha**", and Souq Waqif and Msheireb are "reached **across the city**". **This section had the distance wrong** — it said "~20km north" against §51's 10.8km, neither checked against the row. Measured: **10.7km** from Souq Waqif, 8.7km from the centroid of the other two Doha hotels, 14.4km from DOH. §51 was right.

**Found by that audit: 8 published hotels have no `city` at all** — &Beyond Bateleur, Kichwa Tembo, Angama Amboseli, Angama Mara, Il Moran, Singita Kwitonda, Six Senses Shaharut and Clayoquot Wilderness. Each is a lodge whose reserve name sits in `state_province_county_island` instead. **The `city` stays blank — Ulrik confirmed it** — so the fix went into `cityAirports.ts`, not the data (2026-09-11).

`build-city-airports.mjs` opened with `if (!city) continue`, which **dropped all eight silently**: they keyed to nothing, so the landing flight teaser resolved them to no airport at all. It now falls back to the **traveller area** when `city` is blank. That needed no consumer change, because `getAirportsForCity` is a plain case-insensitive string lookup and the destination dropdown already searches areas — so `Masai Mara` as a key is reachable by exactly the search a visitor would run. 514 → 519 keys.

**Then read what the rebuild produced, which is the whole lesson.** Three of the five new keys resolved to bush airstrips no international ticket can be sold to: Masai Mara → a 1,052m *"Mara Serena Lodge Airstrip"*, Amboseli → a 1,001m strip, Volcanoes National Park → **Kisoro, in Uganda**.

**An exclusion list would have made it worse**, which is why `GATEWAY_OVERRIDE` exists instead: drop the Mara airstrip and the next nearest is **Seronera in Tanzania**; drop Kisoro and the next is **Goma in the DRC**. Nearest-wins cannot reach the right answer by removing candidates when the right answer is 214km away. **A runway-length filter is also wrong** and the data proves it — London City is 1,508m, Florence Peretola 1,560m, and the correct Maldivian entries are 1,189m, because there a small strip *is* the arrival airport. §37 already records that filtering on airport *type* was tried and reverted (it sent Missoula to Spokane, 319km).

So five per-destination overrides: Masai Mara and Amboseli → **NBO** (Nairobi, not Wilson — WIL is where the safari light aircraft departs, NBO is where the international ticket lands), Volcanoes National Park → **KGL**, plus **Kinigi and Ruhengeri**, which already had cities and so were never part of the eight, but carry the same `area` and were sitting on that Ugandan airstrip. Fixing only Kwitonda would have left three lodges in one park with two answers.

**Two needed no override and are deliberately absent from the table**: the Negev's Ramon (21km, 3,600m, international) and Clayoquot's Tofino (32km, jet-capable, and genuinely how guests arrive) are what the algorithm already chose.

Reverse lookups stay sensible — NBO → Amboseli National Park, KGL → Volcanoes National Park, ETM → Negev Desert, YAZ → Vancouver Island — all real destinations, none fabricated (§39). **Still odd, pre-existing, not touched**: Menlo Park's only airport is San Carlos (799m) where SFO is meant, and Grumeti Game Reserve in Tanzania lists a Kenyan airstrip among its three.

**`admin_region` is LOCKED** as of 2026-09-11 — `select-dropdown`, `allowOther: false`, **291 choices** built from the stored values. A hotel in a genuinely new administrative region will not save until the list is extended (`scripts/hotels/geo-2026/lock-admin-region-2026-09-11.mjs` holds the pattern and a snapshot of the prior meta). `state_province_county_island` stays free text on purpose: traveller areas gain an entry with every new destination, so locking it trades one problem for another.

**`city` held a region name on five rows**, all fixed 2026-09-11: Four Seasons Hampshire → `Dogmersfield`, The Windsor Toya → `Toyako`, Etéreo → `Riviera Maya` (matching five siblings, including the EDITION in the same Kanai development), then Rosewood Schloss Fuschl and Mandarin Oriental Mallorca above. `admin_region` was right on every one and was left alone. The other 107 rows where `city` equals `admin_region` are correct — city-states and cantons that share their city's name.

**Courchevel is filed by ALTITUDE LEVEL, never bare.** The resort is a stack of villages at different heights — 1850, Moriond (1650), Village (1550), Le Praz (1300), La Tania — and which one a hotel sits in decides the ski access, the walk to dinner and the price. `city` therefore reads **`Courchevel 1850`**, and a bare `Courchevel` is a defect, not a shorthand. All ten properties are at 1850 and every one says so in its own description; we hold nothing at the other levels, so a property added there needs its own `city` value and its own `cityAirports`/`transferRoutes` entries rather than a fallback.

Fixed 2026-09-11 on one row, and it was self-inflicted: Rosewood Le Jardin Alpin read `city: "Courchevel"` with `local_area: "Jardin Alpin, Courchevel 1850"`. Splitting that compound to `Jardin Alpin` was right for `local_area` — the enclave is the finer district — but it left the row with **no trace of 1850 anywhere**, because its city had never carried it. The altitude had been sitting in the wrong field all along. The two now divide cleanly: **`city` carries the altitude village, `local_area` the enclave inside it.** Removing the bare key also took the dead plain-`Courchevel` entries out of `GATEWAY_OVERRIDE` and `transferRoutes.ts`, and `inspire/cityMetadata.ts` — already keyed on `Courchevel 1850` — began matching Rosewood for the first time.

**Courchevel 1850 then finished at 6 of 10, and that is complete.** Correcting Rosewood's altitude surfaced a gap the two city values had been hiding — 1 of 10 — and five rows name **Jardin Alpin** in their own descriptions: Airelles, Aman Le Mélézin, Cheval Blanc, Le Saint Roch (unpublished, included deliberately — an unpublished gap is the one nobody notices later) and L'Apogée. All tier A, and the script *asserts* the evidence rather than quoting it: each row is checked for "Jardin Alpin" in its description before writing, so if the editorial changes the basis for the write is gone and the run aborts.

**The remaining four are not an oversight.** Fouquet's and Le Lana place themselves on the Bellecôte *piste*, La Sivolière on Route des Chenus, Le K2 on Rue des Clarines. A piste and a street are not districts — the Park Lane rule — and none names an enclave, so there is nothing to promote. `local_area` stands at **340**.

**A `city` holding a STREET is the fifth kind of wrong value, and the airport override hides it.** Olarro Lodge's read `Inakara Road`, from its own description's "off Inakara Road near Ngoswani Village"; cleared 2026-09-12 to match its four Masai Mara siblings, per the standing rule that a wilderness lodge's city stays blank. What made it survive is worth the line: it had a working airport, because a `GATEWAY_OVERRIDE` had been keyed on the street itself. **An override makes a wrong key work, which is exactly why it stops the key from looking wrong** — so delete the override in the same pass, or the audit's dead-key check fires next run.

**Changing a `city` means rebuilding `cityAirports.ts` in the same pass** (§37, §43, and §49's "geography values are join keys, not display strings"). Every old value was a live key there. The first rebuild swapped three, 514 → 513 cities; the second removed `Majorca`, `Salzburg` and `Calvia` and added `Calvià` and `Hof bei Salzburg`, 513 → 512 — one fewer because two groups merged into one town. Merging also moved that centroid, so `Calvià`'s distance to PMI went 23 → 19km; splitting Parrot Cay out of Providenciales tightened that one 12 → 7km. **Read what the rebuild actually produced — do not assume it.** Parrot Cay came back with North Caicos (NCA, 12km) and PLS excluded at 28km, a worse answer than before the city was touched, because tier 1 takes every airport within 25km and returns only those. `NCA` is now in the generator's exclusion list (§37) and both cays resolve to PLS, 513 cities. Etéreo joining `Riviera Maya` moved that group's centroid and earned it **CUN at 33km**, which it had not been offered before. Verify after: every published `city` must have an airport entry, or the landing flight teaser resolves it to nothing.

Both are plain `text` columns. `admin_region` is now constrained by a locked choice list (below); `state_province_county_island` is still unconstrained, and §44 records what unconstrained text fields do here — this one had already drifted into `Giorgia` and `Boca Raton`.

Other fields:

* Editorial: `highlights`, `description`
* Stats: `editor_rank`, `ext_points`, `total_rooms_suites_villas`
* Taxonomy tags (flat, §4): `activities`, `awards`, `setting`, `style`
* Editorial single-selects: `primary_setting` / `secondary_setting` / `primary_style` / `secondary_style` (locked to choice lists as of §44; not wired into app code)
* Award booleans, one column per accolade: `best50`, `cn`, `forbes5`, `michelin3keys`, `telegraph`, `tl100`, `aaa5d`
* Links: `www`, `insta`
* Booking: `booking_provider`, `booking_URL` (capital URL — `official_website_booking_url` does not exist), `booking_enabled`, `booking_label`, `booking_hotel_ref`, `booking_notes`
* Ratehawk: `ratehawk_hid`, `ratehawk_image_1`–`50` (+ `_category`), `ratehawk_status` (§42), and the static-content fields in §48
* Geo: `lat` / `lng` — Directus reports these as `type: "integer"` but `schema.data_type` is `numeric` and decimals round-trip intact. **Never `Math.trunc` a coordinate** (§40).

### Restaurants

Separate Directus collection (`restaurants`): `id`, `status`, `rank`, `restaurant_name`, `slug` (kebab-case, unique — the upsert key), `description`, `highlights`, `restaurant_type` (`Fine dining` | `High-end casual` | `Informal local favorite` | `Beach club`), `cuisine`, `restaurant_setting`, `restaurant_style`, geography fields, `lat`/`lng`, `www`, `insta`, `awards` (JSON array: `michelin_3`, `michelin_2`, `michelin_1`, `worlds_50`, `laliste100`), `sources`, `hotel_name_hint`.

**Coverage: 63 cities, 2,192 records (2026-06-28), all Google Maps–geocoded.** Source JSON lives in `hotels-beta/scripts/restaurants/updated_restaurants/` (the original 23 cities) and `newrestaurants/` (everything added since). Old v2 files are archived in `olddata/`.

`restaurants.lat`/`lng` are `numeric(10,5)` with no Directus integer-cast override — decimals round-trip to 5 d.p.

### Scripts

```bash
# from hotels-beta/ — slug-based upsert, safe to re-run, --dry-run first
DIRECTUS_URL=... DIRECTUS_TOKEN=... node scripts/restaurants/directus-upsert-restaurants-batch.mjs --dir scripts/restaurants
```

New city: add geocoded JSON to `newrestaurants/` → `node scripts/restaurants/geocode-new-restaurants.mjs --only "City Name"` (updates lat/lng in place) → upsert → add the city to that script's CITIES array. Geocoding is ~$5/1000 requests; a 35-restaurant city costs ~$0.18.

---

---

## 4. TAXONOMY SYSTEM

`activities`/`awards`/`setting`/`style` are flat multiselect tag fields on `hotels` (native Postgres `text[]`), not relational. The old M2M collections no longer exist.

* Each stored value **is** the display label — no id → name resolution.
* Canonical choices live on the field in Directus: `meta.interface = "select-multiple-dropdown"`, `meta.options.choices`, `allowOther: false`.
* Field names are **singular**: `setting`, `style`. `activities`/`awards` stay plural.

### Filtering mechanics

Directus `_contains`/`_in` throw `500` against native array columns — they cannot be used for server-side filtering.

* `activities` / `setting` / `style` filter as a **JS-side post-fetch pass**: `filterHotelsByTags()` in `/src/lib/hotelFilters.ts`. OR within a field, AND across fields.
* `awards` (the "Accolades" facet) instead uses the **7 boolean columns**, which Directus can filter natively (`_eq: true`, OR'd). Allow-list in `/src/lib/hotels/awardCodes.ts`, shared between the server filter builder and the client badge UI so they can't drift.
* The general `awards` tag field is separate from the 7 booleans and isn't wired into any UI.

The `/editor/hotels/[id]` tool sources its checkbox options live from each field's `meta.options.choices` — `getEditorTaxonomies()` in `/src/lib/editorHotels.ts`.

### Writing these fields via the API — the trap

Directus tags these columns `type: "unknown"` (it has no concept of a native array column). Harmless for reads. It breaks on **both `POST` and `PATCH`**: a plain JS array gets JSON-stringified and Postgres rejects it — `malformed array literal`. Send a **Postgres array-literal string** instead, e.g. `{"Spa","Fitness"}` wrapped in quotes. Helper `toPgArrayLiteral` is in `scripts/hotels/new-hotels-2026/create-hotels-batch.mjs`. Any script that creates or updates these fields needs it.

---

---

## 42B. WATER-PROXIMITY SETTING — COMPLETE (2026-09-11)

**The five batches, the review artefacts, the ten salt-water rows wearing
freshwater tags, the contradictory pairs and the retirements are in
`CLAUDE-ARCHIVE.md`.** Read it there before touching `setting`, `primary_setting`
or `secondary_setting`. Four rules survive here because they are still live:

* **Final vocabulary, four values, one meaning each**: `Beachfront` (200, at or
  on the sand), `Waterfront` (75, all fresh water), `Oceanfront` (62, on the
  ocean but not a beach), `Coastal` (25, near it but not on it). `Beach`,
  `Lakeside`, `Riverside`, `Canalside`, `Seaside` and `Clifftop` are **retired
  from all three fields** — `setting` went 22 choices to 16. 0 rows carry a
  retired value, two water values, a duplicate tag or an empty setting.
* **`Beach` is still a valid `activities` value.** Only the `setting` one
  retired, and removing both would have silently broken the Inspire beach
  purpose.
* **A retire has more consumers than the Directus field.** `grep -rn "<value>"
  src/` before calling one finished, and READ the hits: `lib/ai/taxonomy.ts`
  mirrors this vocabulary as an enum for the concierge, `inspireMirror.ts` maps
  values into purposes, `tools.ts` names them in a parameter description, and
  `members/defaults.ts` mentions "Lakeside estate" as demo prose and correctly
  stays. **Scan unpublished rows too** — four kept fresh tags when a batch
  scoped `published: true`.
* **House style for `highlights`, measured**: no terminal full stop (0 of 903),
  median 76 characters, noun phrase first; entries from id 2000 on are the
  model. 409 rows use a filler word (*beautiful* 226, *stunning* 135, *amazing*
  113) and the voice pass is **declined, not pending** — §51.
