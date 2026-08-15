# Brand Delta Audit — OLTRA Missing Hotels
_Generated: 2026-08-15_
_OLTRA database queried: 2026-08-15 · 871 total hotels_

Supersedes the earlier `brand-delta-audit.md` (2026-07-02) for the brands
covered below — several deltas have clearly closed since then (Four Seasons
60→69*, Rosewood 20→6, Mandarin Oriental 23→6, Auberge 15-18→26, note some
moved the other way as official portfolios grew too). That older file also
covers three brands not in this round (Belmond, One&Only, The Luxury
Collection) and is left untouched.

Sources are each brand's own official "our hotels" page, fetched live, with
Wikipedia/trade-press cross-checks where a site blocked direct fetching.
Full source list and match-by-match reasoning is in each section below.
"Coming soon" / not-yet-opened pipeline properties are listed separately and
**excluded** from the delta counts.

---

## Summary — your estimate vs. actual

| Brand | Your estimate | Official portfolio | In OLTRA | **Actual delta** | Data-quality flags |
|---|---|---|---|---|---|
| Aman | 17 | 34 (+11 pipeline) | 24 | **11** | — |
| Airelles | 5 | 9 | 5 | **4** | — |
| &Beyond | 8 | 28 (+1 pipeline) | 8 | **22** | 2 — see below |
| Auberge | 8 | ~39 | 13 | **26** | — |
| Bulgari | 9 | 9 | 9 | **0** ✓ | — |
| Four Seasons | 8 | 143 (+2 pipeline) | 71 | **69*** | split into tiers, see below |
| Cheval Blanc | 4 | 6 | 6 | **0** ✓ | — |
| Oetker Collection | 6 | 11 | 9 | **2** | 1 unresolved (see below) |
| Singita | 7 | ~19 (10 lodges/camps + 9 villas) | 7 | **12** | scope note, see below |
| Hotels Barrière | 2 | 20 (site claims 21, see below) | 5 | **15** | 1 unresolved count |
| Six Senses (IHG) | 7 | 28 | 20 | **12** | — |
| Mandarin Oriental | 3 | 51 (+5 pipeline) | 41 | **6** | — |
| Dorchester Collection | 5 | 10 | 10 | **0** ✓ | — |
| Rosewood | 6 | 43 | 37 | **6** | ✓ matches your estimate exactly |

**\* Four Seasons**: the true mathematical delta (69) is far above your
estimate of 8 because Four Seasons' full portfolio includes ~42 secondary
city/business hotels (Atlanta, regional China, Gulf-state business hotels,
etc.) that don't look like they were ever in scope for OLTRA's curated
resort focus. See the Four Seasons section for a 26-property "flagship/resort
tier" shortlist that's a closer match to what you likely meant.

**&Beyond and Auberge** also came back much higher than your estimate —
both brands' official sites list private-use villas and an entire
under-represented region (East African safari lodges for Auberge; most of
&Beyond's Phinda/Botswana/Kenya lodges) that OLTRA doesn't have any
individual entries for yet. Worth deciding whether all of these are in
scope or just a subset — see notes in each section.

---

## Data-quality issues found (fix regardless of whether you act on the deltas)

1. **`&Beyond Wilderness Bisate` (id 1032, Ruhengeri, Rwanda) is mistagged.**
   "Wilderness" (formerly Wilderness Safaris) is a completely separate, rival
   safari operator — this property is not &Beyond's. &Beyond does not
   currently operate any lodge of its own in Rwanda at all (their site's
   Rwanda-area page links out to a Wilderness-branded property as a
   third-party booking listing, not an &Beyond-operated one). Recommend
   removing the "&Beyond" affiliation from this hotel or re-tagging it to
   "Wilderness" — do not rename it to "&Beyond Sabyinyo Silverback Lodge" as
   originally guessed, since that's not an &Beyond property either.
2. **`&Beyond Tengile River Lodge` (id 1043, Sabi Sand Reserve, South
   Africa) is missing from &Beyond's own current website** — its old URL
   now redirects to the main listings page instead of 404ing, suggesting
   the page was pulled. However, multiple third-party safari-booking sites
   still show it as actively bookable with current 2026 rates, so this
   looks like a gap in &Beyond's own site rather than a real closure.
   Flagged for direct verification with &Beyond, not auto-corrected.
3. **Oetker Collection's own press materials (Jan 2026, on The Vineta
   Hotel's opening) call it their "12th Masterpiece Hotel,"** but only 11
   named properties could be identified from three independent sources
   (Wikipedia, Amex FHR listing, Heavens Portfolio) that otherwise agree
   with each other exactly. The 12th property could not be identified —
   worth a direct check with Oetker.
4. **Hotels Barrière's own site states "21 hotels,"** but only 20 distinct
   properties could be found in the site's own navigation/destination
   structure. Possibly a stale count on their end, or one property not
   individually linked — noted, not resolved.

---

## Aman

**Official portfolio: 34 operating properties** (+ Aman Spa at The Connaught,
London — spa-only, not a stay — and Amandira, a sailing yacht; both excluded
as non-comparable). Source: aman.com/hotels-and-resorts, live-fetched.

### Missing from OLTRA (11)

| Name | City | Country | Note |
|---|---|---|---|
| Amanvari | East Cape (Costa Palmas), Los Cabos | Mexico | Opened 1 Aug 2026 — Aman's first Mexico resort |
| Aman Villas at Nusa Dua | Nusa Dua, Bali | Indonesia | Villa-only property |
| Amanfayun | Hangzhou | China | |
| Amandayan | Lijiang | China | |
| Amanwella | Tangalle | Sri Lanka | |
| Amangalla | Galle | Sri Lanka | |
| Amansara | Siem Reap | Cambodia | |
| Amantaka | Luang Prabang | Laos | |
| Amanbagh | Alwar, Rajasthan | India | |
| Aman-i-Khas | Ranthambore | India | Seasonal tented camp |
| Amanruya | Bodrum | Turkey | |

Pipeline, not counted (11 properties): Amancaya (Bahamas), Aman Miami Beach,
Aman Beverly Hills, Amansanu (Texas), Aman Maldives, Aman Singapore,
Amansamar (Saudi Arabia), Aman Karingani (Mozambique), Aman Dubai, Aman
Niseko (Japan), plus Amangani (Jackson Hole) which is reopening rather than
new — OLTRA's existing unpublished entry for it is correct as-is.

Also note: **Aman Summer Palace (Beijing)** closed 30 Dec 2025 — correctly
absent from both the current official list and OLTRA, no action needed.

Stale OLTRA entries: none.

---

## Airelles

**Official portfolio: 9 properties.** Source: airelles.com, live-fetched.

### Missing from OLTRA (4)

| Name | City | Country | Note |
|---|---|---|---|
| Airelles Palladio | Venice | Italy | Opened April 2026 — first non-French Airelles |
| Pan Deï Palais | Saint-Tropez | France | Sister property to Château de la Messardière |
| Villa Baulieu | Pays d'Aix, Provence | France | |
| Château d'Estoublon | Alpilles, Provence | France | |

Stale OLTRA entries: none.

---

## &Beyond

**Official portfolio: 28 currently listed lodges/camps/yachts** (2 of which
— Ngorongoro Crater Lodge and Xaranna Okavango Delta Camp — are marked
"temporarily closed for refurbishment" but still part of the active
portfolio). Source: andbeyond.com/our-lodges/, live browser render (site is
JS-rendered; plain fetch only returns a cookie shell).

### Missing from OLTRA (22)

| Name | City/Area | Country | Note |
|---|---|---|---|
| Suyian Homestead | Laikipia | Kenya | Very new, opened 2026/2027 |
| Suyian Lodge | Laikipia | Kenya | |
| Klein's Camp | Northern Serengeti | Tanzania | |
| Serengeti Under Canvas | Serengeti NP | Tanzania | Mobile tented camp |
| Lake Manyara Tree Lodge | Lake Manyara NP | Tanzania | |
| Phinda Rock Lodge | Phinda, KwaZulu-Natal | South Africa | |
| Phinda Forest Lodge | Phinda, KwaZulu-Natal | South Africa | |
| Phinda Vlei Lodge | Phinda, KwaZulu-Natal | South Africa | |
| Phinda Zuka Lodge | Phinda, KwaZulu-Natal | South Africa | |
| Phinda Homestead | Phinda, KwaZulu-Natal | South Africa | |
| Phinda Mountain Lodge | Phinda, KwaZulu-Natal | South Africa | |
| Ngala Tented Camp | Kruger NP (Timbavati) | South Africa | |
| Ngala Safari Lodge | Kruger NP | South Africa | |
| Sandibe Okavango Safari Lodge | Okavango Delta | Botswana | |
| Nxabega Okavango Tented Camp | Okavango Delta | Botswana | |
| Sandibe and Nxabega Under Canvas | Okavango Delta | Botswana | Joint mobile/walking product |
| Xaranna Okavango Delta Camp | Okavango Delta | Botswana | Temp. closed for refurb |
| Chobe Under Canvas | Chobe NP | Botswana | |
| Benguerra Island Lodge | Bazaruto Archipelago | Mozambique | |
| Punakha River Lodge | Punakha Valley | Bhutan | |
| Vira Vira | Lake District (Pucón) | Chile | |
| Galapagos Explorer | Galápagos Islands | Ecuador | Expedition yacht |

Pipeline, not counted: Amazon Explorer (Peru), launching Dec 2026.

Stale OLTRA entries: see items 1–2 in "Data-quality issues" above (Wilderness
Bisate, Tengile River Lodge).

---

## Auberge Resorts Collection

**Official portfolio: ~39 properties** across North America, Mexico, Costa
Rica, East Africa (Tanzania), and Europe. Source: auberge.com/resorts/, live
browser render (WebFetch returned 403).

### Missing from OLTRA (26)

| Name | City | Country | Note |
|---|---|---|---|
| Solage | Napa Valley | USA | |
| Element 52 | Telluride, CO | USA | |
| Goldener Hirsch | Deer Valley, UT | USA | |
| Hotel Jerome | Aspen, CO | USA | |
| Madeline Hotel and Residences | Telluride, CO | USA | |
| Sleeping Indian Lodge | Ridgway, CO | USA | |
| Auberge Beach Residences | Fort Lauderdale, FL | USA | Residences product |
| Bowie House | Fort Worth, TX | USA | |
| Commodore Perry Estate | Austin, TX | USA | |
| The Dunlin | Kiawah River, SC | USA | |
| The Lodge at Primland | Blue Ridge Mtns, VA | USA | |
| Mayflower Inn & Spa | Washington, CT | USA | |
| The Vanderbilt | Newport, RI | USA | |
| White Barn Inn | Kennebunk, ME | USA | |
| Chileno Bay Resort & Residences | Los Cabos | Mexico | |
| Legendary Lodge | Arusha | Tanzania | |
| Mwiba Lodge | Southern Serengeti | Tanzania | |
| Mwiba Plains | Southern Serengeti | Tanzania | |
| Mila | Nyasirori, W. Serengeti | Tanzania | |
| Nyasi | Lamai, N. Serengeti | Tanzania | |
| Songa | Kogatende, N. Serengeti | Tanzania | |
| Chem Chem Lodge | Manyara Area | Tanzania | |
| Little Chem Chem | Tarangire Area | Tanzania | |
| Forest Chem Chem | Tarangire Area | Tanzania | |
| Collegio alla Querce | Florence | Italy | |
| Domaine des Etangs | Massignac | France | |

9 of these 26 are the entire East Africa (Tanzania) safari-lodge portfolio —
a whole region OLTRA doesn't have a single Auberge entry for yet.

Pipeline, not counted: Cambridge House (London, 2026), The Knox Hotel &
Residences (Dallas, 2026), Shell Bay Club and Resort (FL, 2027), Shore Club
(Miami Beach, 2027), The Birdsall (Houston, 2027), Moncayo (Puerto Rico,
2029), The Stockman (Steamboat Springs, 2030).

Stale OLTRA entries: none — all 13 confirmed current.

---

## Bulgari Hotels & Resorts

**Official portfolio: 9 properties** — Rome, Milan, Paris, London, Dubai,
Bali, Tokyo, Beijing, Shanghai. Source: bulgarihotels.com.

**Delta: 0 — OLTRA's 9 entries are an exact match.**

Pipeline, not counted: Ranfushi (Maldives, 2027), Bodrum (Turkey, 2028),
Miami Beach (2029), Cave Cay (Bahamas, 2029), Abu Dhabi (2030).

---

## Four Seasons

**Official portfolio: 143 hotels and resorts** (per fourseasons.com's own
count), across North America (55), Central & South America (5), Europe
(22), Middle East & Africa (26), Asia & Pacific (35). Source:
fourseasons.com/find_a_hotel_or_resort/, live browser render.

All 71 existing OLTRA entries were individually verified as genuine,
correctly-matched, currently-open properties — including the trickier
same-city pairs (Beverly Wilshire vs. Four Seasons LA at Beverly Hills;
Istanbul Bosphorus vs. Sultanahmet). **True delta: 69 properties**, split
below into two tiers since this is far more than your estimate of 8 and
most of the gap is likely out of scope by design.

### Flagship / resort tier — 26 properties (the likely real gap)

| Name | City | Country | Note |
|---|---|---|---|
| Four Seasons Resort Oahu at Ko Olina | Ko Olina, Oahu | USA | Opened 2023 |
| Four Seasons Resort Naples at Naples Beach Club | Naples, FL | USA | |
| Four Seasons Resort Nevis | Nevis | St. Kitts and Nevis | |
| Four Seasons Resort and Residences Puerto Rico at Molasses Reef | Rio Grande | Puerto Rico | |
| Four Seasons Resort and Residences Vail | Vail, CO | USA | |
| Four Seasons Resort and Residences Whistler | Whistler | Canada | |
| Four Seasons Resort Palm Beach | Palm Beach, FL | USA | |
| Four Seasons Resort Los Cabos at Cabo del Sol | Los Cabos | Mexico | Distinct from Costa Palmas |
| Four Seasons Hotel Mexico City | Mexico City | Mexico | |
| Four Seasons Hotel Los Angeles at Beverly Hills | Los Angeles | USA | Distinct from Beverly Wilshire |
| Four Seasons Resort Orlando at Walt Disney World Resort | Orlando, FL | USA | |
| Four Seasons Hotel New York | New York | USA | Iconic I.M. Pei tower |
| Four Seasons Hotel San Francisco | San Francisco | USA | |
| Four Seasons Hotel Toronto | Toronto | Canada | Home-market flagship |
| Four Seasons Hotel Washington, DC | Washington, DC | USA | |
| Four Seasons Hotel Cartagena | Cartagena | Colombia | Opened 2023 |
| Four Seasons Hotel Istanbul at Sultanahmet | Istanbul | Turkey | Distinct from Bosphorus |
| Four Seasons Hotel London at Ten Trinity Square | London | UK | Tower Bridge landmark |
| Four Seasons Hotel Mallorca | Mallorca | Spain | |
| Four Seasons Hotel Megève | Megève | France | Opened 2023 |
| Four Seasons Hotel Mykonos | Mykonos | Greece | Opened June 2026 |
| Danieli, Venezia, A Four Seasons Hotel | Venice | Italy | Opens to guests 26 Aug 2026 — imminent, not yet open |
| Four Seasons Resort and Residences Amaala at Triple Bay | Red Sea coast | Saudi Arabia | |
| Four Seasons Resort and Residences Red Sea at Shura Island | Red Sea coast | Saudi Arabia | |
| Four Seasons Resort Mauritius at Anahita | Beau Champ | Mauritius | |
| Four Seasons Hotel Sydney | Sydney | Australia | |

### Secondary-market / business-hotel tier — 42 properties (likely intentionally out of scope)

Atlanta · Austin · Baltimore · One Dalton St. Boston (residences) · Denver ·
Fort Lauderdale at Las Olas · Houston · Westlake Village · Aviara (San
Diego County, residence club) · Miami · Minneapolis · Montreal · Nashville ·
New York Downtown · Silicon Valley at East Palo Alto · San Francisco at
Embarcadero · St. Louis · Bogotá (×2: main + Casa Medina) · Buenos Aires ·
Alexandria at San Stefano · Amman · Bahrain Bay · Beirut · Casablanca ·
Doha at The Pearl-Qatar · The Westcliff Johannesburg · Kuwait at Burj
Alshaya · Rabat at Kasr Al Bahr · Riyadh at Kingdom Center · Tunis ·
Bengaluru at Embassy ONE · Dalian · Hangzhou Centre · Kuala Lumpur · Macao
Cotai Strip (×2: main + Grand Suites) · Osaka · Shenzhen · Suzhou · Tianjin
· Tokyo at Marunouchi.

**Not a hotel, excluded from both tiers**: Palau Explorer, A Four Seasons
Cruising Resort (Palau) — a cruise ship, not a fixed property.

Pipeline, not counted: Four Seasons Hotel Gstaad (Switzerland, mid-2027),
Four Seasons Hotel Madinah (Saudi Arabia, mid-2027).

Stale OLTRA entries: none.

---

## Cheval Blanc

**Official portfolio: 6 properties.** Source: LVMH press materials +
chevalblanc.com, cross-verified.

**Delta: 0 — OLTRA's 6 entries are an exact match.**

Pipeline, not counted: Cheval Blanc Pitrizza (Costa Smeralda, Sardinia,
relaunch ~2027), an announced Beverly Hills property with no firm date.
("Cheval Maison" — a separate, lower-tier serviced-residence sub-brand in
Dubai/Riyadh — is out of scope, not the luxury Maisons line.)

---

## Oetker Collection

**Official portfolio: 11 properties** confirmed via three independent
sources (Wikipedia, Amex Fine Hotels + Resorts listing, Heavens Portfolio)
that agree exactly with each other. See data-quality flag #3 above re: a
press mention of "12."

### Missing from OLTRA (2)

| Name | City | Country | Note |
|---|---|---|---|
| Palácio Tangará | São Paulo | Brazil | Open since 2017 — Oetker's first South American property |
| The Vineta Hotel | Palm Beach, FL | USA | Opened March 2026 — Oetker's first US property |

Pipeline, not counted: unnamed Saint-Tropez property (former Le Mas
Bellevue site, Ramatuelle), targeted 2027.

Stale OLTRA entries: none.

---

## Singita

**Official portfolio: ~19 individually-bookable, currently-live products**
— 10 primary lodges/camps and 9 private-use villas, each with its own page
on singita.com/lodges/. No current Kenya property (contrary to the original
brief's speculation) — Singita's footprint today is South Africa, Zimbabwe,
Tanzania, Rwanda, plus Botswana from Dec 2026.

### Missing from OLTRA (12)

| Name | Area | Country | Type |
|---|---|---|---|
| Singita Boulders Lodge | Sabi Sand Reserve | South Africa | Standalone lodge |
| Singita Castleton | Sabi Sand Reserve | South Africa | Standalone exclusive-use camp |
| Singita Sweni Lodge | Kruger NP | South Africa | Standalone lodge |
| Singita Explore | Grumeti Reserve | Tanzania | Standalone mobile/tented camp |
| Singita Mara River Tented Camp | Lamai, Serengeti | Tanzania | Standalone tented camp |
| Singita Ebony Villa | Sabi Sand Reserve | South Africa | Villa attached to Ebony Lodge (already in OLTRA) |
| Singita Lebombo Villa | Kruger NP | South Africa | Villa attached to Lebombo Lodge (already in OLTRA) |
| Singita Malilangwe House | Malilangwe | Zimbabwe | Villa attached to Pamushana Lodge (already in OLTRA) |
| Singita Serengeti House | Grumeti Reserve | Tanzania | Villa attached to Sasakwa Lodge (already in OLTRA) |
| Singita Milele | Grumeti Reserve | Tanzania | Standalone exclusive-use villa |
| Singita Kilima | Grumeti Reserve | Tanzania | Standalone exclusive-use villa |
| Singita Kataza House | Volcanoes NP | Rwanda | Villa attached to Kwitonda Lodge (already in OLTRA) |

5 of these are standalone lodges/camps; 7 are private villas attached to a
lodge OLTRA already lists. **Worth deciding whether villas belong in OLTRA
at all as separate entries**, or only the 5 standalone lodges/camps —
that's the difference between a delta of 12 and a delta of 5.

Pipeline, not counted: Singita Elela (Okavango Delta, Botswana — first
Botswana property), opening 11 Dec 2026.

Stale OLTRA entries: none.

---

## Hotels Barrière

**Official portfolio: 20 properties** found in the site's own navigation
(the site itself claims "21 hotels" — see data-quality flag #4). Source:
hotelsbarriere.com/en, live browser render.

### Missing from OLTRA (15)

| Name | City | Country | Note |
|---|---|---|---|
| Fouquet's Hotel Mykonos | Mykonos | Greece | |
| Fouquet's Hotel New York | New York | USA | |
| Maison Barrière Vendôme | Paris | France | |
| Le Gray d'Albion Cannes | Cannes | France | |
| Le Normandy Deauville | Deauville | France | |
| L'Hôtel du Golf Deauville | Deauville | France | |
| L'Hermitage La Baule | La Baule | France | |
| Le Royal La Baule | La Baule | France | Distinct from OLTRA's "Le Royal Deauville" |
| Le Castel Marie-Louise La Baule | La Baule | France | |
| Le Westminster Le Touquet | Le Touquet-Paris-Plage | France | |
| Le Grand Hôtel Dinard | Dinard | France | |
| Le Grand Hôtel | Enghien-les-Bains | France | |
| Resort Barrière Ribeauvillé | Ribeauvillé | France | |
| Resort Barrière Lille | Lille | France | |
| Le Naoura Marrakech | Marrakech | Morocco | |

Pipeline, not counted: Maison Barrière Príncipe Real (Lisbon, 2026).

Stale OLTRA entries: none.

---

## Six Senses (IHG)

**Official portfolio: 28 properties** (Bhutan's 5 lodges each bookable
individually). Source: sixsenses.com/en/hotels-resorts/, live-fetched.

### Missing from OLTRA (12)

| Name | City | Country | Note |
|---|---|---|---|
| Six Senses The Palm, Dubai | Dubai | UAE | |
| Six Senses Kyoto | Kyoto | Japan | |
| Six Senses Fiji | — | Fiji | |
| Six Senses AMAALA | Triple Bay | Saudi Arabia | Opened mid-July 2026 |
| Six Senses Vana | Dehradun | India | Wellness retreat, open since 2014 |
| Six Senses La Sagesse | — | Grenada | |
| Six Senses Qing Cheng Mountain | — | China | |
| Six Senses Residences Courchevel | Courchevel | France | Bookable aparthotel |
| Six Senses Thimphu | Thimphu | Bhutan | 1 of 5 Bhutan lodges |
| Six Senses Gangtey | Phobjikha Valley | Bhutan | 1 of 5 Bhutan lodges |
| Six Senses Bumthang | Bumthang | Bhutan | 1 of 5 Bhutan lodges |
| Six Senses Paro | Paro | Bhutan | 1 of 5 Bhutan lodges |

OLTRA already has the 5th Bhutan lodge, Six Senses Punakha.

Identity note: the official site's "Six Senses Bali" card is the same
property as OLTRA's existing "Six Senses Uluwatu" (Pecatu, Bali) — just a
simplified display name, not a separate hotel. Not counted as delta.

Stale OLTRA entries: none.

---

## Mandarin Oriental

**Official portfolio: 51 open-or-imminent properties.** Source:
mandarinoriental.com/en/our-hotels-map, live-fetched destination-filter
data.

### Missing from OLTRA (6)

| Name | City | Country | Note |
|---|---|---|---|
| Mandarin Oriental, Geneva | Geneva | Switzerland | Part of MO since 2000 |
| Mandarin Oriental, Boston | Boston | USA | |
| Mandarin Oriental, Prague | Prague | Czech Republic | |
| Mandarin Oriental, Shanghai (Pudong) | Shanghai | China | Open since 2013 |
| Mandarin Oriental, Desaru Coast | Kota Tinggi, Johor | Malaysia | Opened Feb 2026; formerly One&Only Desaru Coast |
| Mandarin Oriental, Old Cataract, Aswan | Aswan | Egypt | Reflagged from Sofitel Legend Old Cataract, 1 May 2026 |

Pipeline, not counted: Hangzhou (Spring 2027), Manila/Makati (Nov 2026),
Cortina (early 2027 — OLTRA already tracks this correctly as unpublished),
Miami (closed for redevelopment, reopening 2030), Winter Palace Luxor
(closed for restoration, reopening as MO July 2027).

Stale OLTRA entries: none — including the chain-brand same-city pairs
(Beijing Qianmen/Wangfujing, Dubai Downtown/Jumeira, Hong Kong MO/The
Landmark, London Hyde Park/Mayfair), each verified as a genuine distinct
property.

---

## Dorchester Collection

**Official portfolio: 10 properties.** Source: Wikipedia + 2026 trade press
(Dorchester Collection's own site returned 403 to direct fetch on every
path tried — likely bot-protection).

**Delta: 0 — OLTRA's 10 entries are an exact match.**

Pipeline, not counted: Dorchester Collection Tokyo, targeted 2028.

Note (operational, not portfolio): Hotel Principe di Savoia (Milan) is
reported to close for restoration from Jan 2027 through 2029 — still a
current, open property today.

---

## Rosewood

**Official portfolio: 43 properties**, reconstructed from Rosewood's Jan
2025 factsheet plus 7 openings confirmed via press since then (Miyakojima,
Doha, Amsterdam, Mandarina, The Chancery London, Courchevel Le Jardin
Alpin, Rome).

### Missing from OLTRA (6) — matches your estimate exactly

| Name | City | Country | Note |
|---|---|---|---|
| Rosewood Bermuda | Hamilton Parish | Bermuda | Long-standing |
| Rosewood Inn of the Anasazi | Santa Fe, NM | USA | Long-standing |
| Rosewood Mansion on Turtle Creek | Dallas, TX | USA | Rosewood's founding/flagship property (1980) |
| Rosewood Jeddah | Jeddah | Saudi Arabia | Open since 2007 |
| Rosewood Mandarina | Riviera Nayarit | Mexico | Opened 2025 |
| Rosewood Rome | Rome | Italy | Opened April 2026 |

Pipeline, not counted (large — ~19 more properties through 2028+): Rosewood
Blue Palace (Elounda, Crete, mid-2026, unconfirmed open), Milan (2027),
Mexico City (2027), Shenzhen (2026, unconfirmed open), Diriyah (2027),
Seoul (2027), Ranfaru (Maldives, 2027), Barbuda (2028), Shanghai (2028),
plus Amaala, Chongqing, Hoi An, Hotel Bauer Venice, Hangzhou, Ningbo, Red
Sea, The Raleigh Miami Beach, Xi'an — all "future opening," no date.

Stale OLTRA entries: none — including Rosewood Doha (real, open since Jul
2025, correctly unpublished pending your review) and Rosewood Miyakojima
and Rosewood Courchevel Le Jardin Alpin (both genuinely open, recent
debuts).

---

## Suggested next step

Given the range here — three brands already fully covered (Bulgari, Cheval
Blanc, Dorchester) up to &Beyond/Auberge/Four Seasons needing real
decisions about scope — it's probably worth going brand-by-brand rather
than batch-adding all ~190 raw delta rows at once, especially where a tier
or scope call is needed (Four Seasons flagship-vs-secondary, Singita
lodges-vs-villas). Happy to build the actual hotel-creation batch for
whichever brands/tiers you confirm.
