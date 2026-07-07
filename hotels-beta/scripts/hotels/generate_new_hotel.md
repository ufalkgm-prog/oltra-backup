# myOLTRA - New Hotel Template
I want to update my hotel database with a new hotel. The hotel is:
hotel_name: “xx”
affiliation: “xx”
city: “xx”
country: “xx”
Using detailed online searches please fill in all fields below in a JSON file, so I can hand over to upsert script.

---

## IDENTITY

```
id: 2xxx
hotel_name: [as stated above]
published: false
```

---

## LOCATION

```
country: [as stated above]
region: continent
state_province_county_island: relevant area in country (e.g. state, island, region).
city: [as stated above]
local_area: area within city or other local area smaller than city, e.g. arrondissement in Paris or city area in New York and London.
affiliation: [as stated above]
```

---

## EDITORIAL

```
highlights: the one-line USP that gives location highlight, style, comment on view or dining (max 15 words). Do not mention hotel name in this text.
description: For each hotel, research current information using reliable sources and prepare the description in accordance with the following instructions: 
Prioritize these sources:
1. The hotel’s official website, including pages for accommodation, dining, spa, wellness, experiences, location, history, design, and facilities. 
2. Official restaurant pages connected to the hotel. 
3. High-end travel and hotel sources such as Virtuoso, Kiwi Collection, Forbes Travel Guide, Condé Nast Traveler, Travel + Leisure, The Telegraph, Leading Hotels of the World, Small Luxury Hotels, Relais & Châteaux, Tablet Hotels, Mr & Mrs Smith, or similar reputable sources where relevant and accessible. 
4. The Michelin Guide or other credible restaurant sources only when verifying whether a specific on-property restaurant is Michelin-starred. Do not rely on searching the Michelin Guide by hotel name alone; instead, identify the hotel’s restaurants first, then verify whether any on-property restaurant currently has Michelin status. 
5. Other reliable sources only when needed to verify local context, heritage, architecture, nearby landmarks, natural setting, restaurant details, or unique features. 
Write each description as refined luxury travel editorial copy. The tone should be elegant, specific, atmospheric, and factual, suitable for a high-end hotel database. The description should feel like one coherent hotel profile rather than a list of facts. Natural paragraph breaks inside the same cell are allowed, but do not use headings, labels, bullet points, numbered lists, markdown, or section titles. 
Each description should be approximately 250–300 words, ideally around 270 words. 
Each description should include, where verifiable: 
- Hotel name but do not add affiliation unless it is an integral part of the hotel_name above
- The hotel’s location and immediate setting. 
- Nearby attractions, landmarks, neighbourhoods, natural sights, beaches, cultural sites, shopping areas, reserves, historic districts, or other relevant points of interest. 
- Style, design, architecture, atmosphere, and sense of place. 
- Size, using the number of rooms, suites, villas, tents, lodges, residences, or keys if confidently verified. If the exact number cannot be verified, use softer phrasing such as “intimate”, “boutique-scale”, “expansive”, or omit the precise number. 
- Restaurants, bars, lounges, culinary concepts, chefs, signature dining venues, afternoon tea, beach clubs, wine cellars, or private dining where relevant. 
- Michelin status only if the hotel itself has an on-property Michelin-starred restaurant. If this is verified, state it clearly and naturally, including the restaurant name and star level where known. If the hotel does not have an on-property Michelin-starred restaurant, or if the status cannot be confidently verified, do not mention Michelin at all. Do not mention nearby Michelin restaurants. 
- Facilities such as spa, wellness areas, pools, fitness centre, beach, kids’ club, golf, safari activities, ski access, gardens, private marina, cultural programming, meeting spaces, or other amenities relevant to the property. 
- Unique trademarks, such as heritage, architecture, historic importance, art collection, gardens, wildlife access, private island setting, exceptional views, signature rituals, sustainability initiatives, local craft, celebrated service traditions, or rare guest experiences. 
Do not invent facts. If sources disagree, prefer the official hotel website for room count, facilities, restaurants, and current amenities. For Michelin-starred restaurants, verify the restaurant itself rather than assuming status from older articles or general hotel descriptions. Use current information over outdated spreadsheet content. If a detail cannot be verified confidently, omit it or phrase it cautiously. 
Do not copy or closely paraphrase marketing text from any source. All descriptions must be newly written in original wording. 
Writing style requirements: 
- Use polished luxury travel English. 
- Avoid generic filler such as “world-class service”, “unforgettable experience”, “hidden gem”, “ultimate escape”, “something for everyone”, or “paradise on earth” unless supported by specific detail. 

- Avoid first person and direct sales language. 
- Do not use “our”, “we”, “book now”, “guests can enjoy”, “whether you are seeking”, or similar promotional phrasing. 
- Vary sentence openings and paragraph structure across hotels so the descriptions do not feel templated. 
- Preserve correct hotel names, brand names, accents, restaurant names, chef names, and place names. 
- Keep the description specific to the actual hotel, not just the destination. 
- Do not include URLs, citations, source names, research notes, confidence scores, or metadata inside the description cell. 
- Remember paragraph breaks in the description as appropriate. At least 3 and maybe 4 paragraph breaks
Before finalizing the description, check: 
1. The description is approximately 250–300 words. 
2. It is written as one coherent hotel profile. 
3. It has no headings, bullets, labels, citations, URLs, or markdown. 
4. It covers location, setting, style/design, size where available, restaurants, facilities, nearby attractions, and unique trademarks. 
5. Michelin is mentioned only if an on-property Michelin-starred restaurant has been confidently verified. 
6. No statement is unsupported or invented. 
7. The text is original and not copied from source material. 

```

---

## SCORING

```
editor_rank: 0
ext_points: [calculated — see formula below]
total_rooms_suites_villas: Use your findings from the description field to insert total number of rooms, suites, villas in the hotel. If you do not have the info from the description section, please search specifically for this info. Leave blank if no reliable number is found. Number should be integer.
```

**ext_points formula:** `ext_points = editor_rank + sum of award points`

`editor_rank` is set to 0 as a placeholder and will be assigned manually. Calculate `ext_points` as the sum of points for each verified award the hotel holds, using the table below. Do not add `editor_rank` — output only the award points total.

| Field | Award name | Points |
|---|---|---|
| michelin3keys | Michelin 3 Keys | 5 |
| best50 | The World's 50 Best Hotels | 5 |
| cn | Conde Nast Gold List | 3 |
| tl100 | Travel + Leisure 100 | 3 |
| forbes5 | Forbes 5 Star | 3 |
| aaa5d | AAA/CAA Five Diamond Hotels | 3 |
| telegraph | Telegraph Best Hotels in the World | 3 |

Example: a hotel with Forbes 5 Star and Conde Nast Gold List → `ext_points: 6`.

---

## Hotel Taxonomy Reference

Canonical values for the four multiselect tag fields on the `hotels` collection in Directus.
Values are case-sensitive and must match exactly. Multiple values are stored as a JSON array.

---

## `activities`
You should consider which of the activities are most relevant for the hotel. The hotel should have at least two and max seven activities. All activities should first and foremost be derived from the hotel web site but may in some cases be applied more subjectively based on setting. For all hotels consider at least if Spa, Beach, Sightseeing, Nature, Shopping, Family are relevant based on hotel web site. Gastronomy should only be used if there is a Michelin star restaurant at the hotel. Most city hotels are best characterised with only a few activities, like Spa, Shopping and Sightseeing but in some cities Sightseeing is not really relevant and a few hotels do not have a Spa.

```json
[
  "Archery",
  "Badminton",
  "Beach",
  "Biking",
  "Boating",
  "Bowling",
  "Casino",
  "Cycling",
  "Diving",
  "Falconry",
  "Family",
  "Fishing",
  "Fitness",
  "Gastronomy",
  "Golf",
  "Gorilla Hiking",
  "Hiking",
  "Horseback riding",
  "Hunting",
  "Ice skating",
  "Jeep safari",
  "Kayaking",
  "Nature",
  "Padel",
  "Paragliding",
  "Rafting",
  "Safari",
  "Sailing",
  "Shopping",
  "Sightseeing",
  "Skiing",
  "Snorkeling",
  "Spa",
  "Tennis",
  "Watersports",
  "Whalewatching",
  "Wilderness safari",
  "Wildlife",
  "Wine"
]
```

---

## `awards`
You should research if the hotel has any of the applicable awards listed below. You should search the most recent versions of the awards web sites, i.e. 2025 and 2026, for matches and you should also look for references to any of these awards on the company web site. For Michelin3Key – it is only the specific 3 keys award that should be included.

```json
[
  "Michelin 3 Keys",
  "AAA/CAA Five Diamond Hotels",
  "Conde Nast Gold List",
  "The World's 50 Best Hotels",
  "Forbes 5 Star",
  "Travel + Leisure 100",
  "Telegraph Best Hotels in the World"
]
```
**Important:** The app does NOT read this `awards` tag field. The Accolades filter and award badge UI exclusively use the seven boolean flag columns (`best50`, `cn`, `forbes5`, `michelin3keys`, `telegraph`, `tl100`, `aaa5d`). Set those booleans — the `awards` array is Directus metadata only and has no effect on what users see. So provide the awards in the JSON awards field as described above and in the applicable boolean field(s) as `true`.

---

## `setting`
You should consider which of the following settings best describes the hotel. The hotel should have at least one and max two settings. Most are best described with only one setting.
```json
[
  "Beach",
  "Beachfront",
  "Canalside",
  "City",
  "Clifftop",
  "Coastal",
  "Countryside",
  "Desert",
  "Hillside",
  "Island",
  "Jungle",
  "Lakeside",
  "Mountains",
  "Nature Reserve",
  "Oceanfront",
  "Overwater",
  "Private Island",
  "Rainforest",
  "Riverside",
  "Seaside",
  "Waterfront",
  "Wildlife Reserve"
]
```

---

## `style`
You should consider which of the following styles best describes the hotel. The hotel should have at least one and max two styles. Most are best described with only one style.

```json
[
  "African",
  "Alpine",
  "Art Deco",
  "Camp",
  "Chinese",
  "Colonial",
  "Contemporary",
  "Cottages",
  "Design",
  "Grand",
  "Historical",
  "Intimate",
  "Lodge",
  "Mediterranean",
  "Middle Eastern",
  "Oriental",
  "Safari Lodge",
  "Tented Camp",
  "Traditional",
  "Tropical"
]
```

---

## JSON field format

When generating a hotel JSON file, taxonomy fields should be arrays of strings:

```json
{
  "activities": ["Spa", "Golf", "Hiking"],
  "awards": ["Forbes 5 Star", "Conde Nast Gold List"],
  "setting": ["Mountains", "Countryside"],
  "style": ["Contemporary", "Design"]
}
```

Only include values from the lists above. Any unlisted value will be rejected by Directus
(`allowOther: false` is set on all four fields).

---

## LINKS

Research and fill in the following from the hotel's official online presence:

```
www:    The official hotel website URL (full URL including https://). Use the most direct URL for the specific property, not the brand homepage.
insta:  The hotel's official Instagram handle, including the @ symbol (e.g. @amantokyo). Search Instagram or the hotel website's social links. If no official account can be confirmed, leave null.
```

---

## OUTPUT FORMAT

Output the result as a single valid JSON object containing all fields above. Rules:

- Output only the JSON — no prose, no section headers, no commentary before or after.
- Use correct JSON types throughout: booleans as `true` / `false` (not strings), integers as numbers (not strings), arrays as JSON arrays, and `null` for any field that could not be determined.
- The JSON object must be wrapped in an array (i.e. `[ { ... } ]`) so it is compatible with the upsert script.
- Do not include fields that are intentionally excluded from this prompt (booking fields, lat, lng).

---

## EXAMPLE OUTPUT

The following is a correctly formatted example for Aman Tokyo. Use it as a reference for structure, types, and style — do not copy content from it.

```json
[
  {
    "id": "2xxx",
    "hotel_name": "Aman Tokyo",
    "published": false,
    "country": "Japan",
    "region": "Asia",
    "state_province_county_island": "Tokyo Metropolis",
    "city": "Tokyo",
    "local_area": "Ōtemachi",
    "affiliation": "Aman",
    "highlights": "Zen sanctuary high above the Imperial Palace gardens, where Japanese minimalism meets the Tokyo skyline",
    "description": "Aman Tokyo occupies the upper six floors of the Otemachi Tower in the heart of Tokyo's financial district, with sweeping views over the Imperial Palace East Gardens and the city's vast skyline. The surrounding neighbourhood blends centuries-old imperial heritage with contemporary glass towers, and sits within easy reach of Ginza's galleries and the cultural institutions of Marunouchi.\n\nThe 84 rooms and suites draw on a restrained interpretation of traditional Japanese aesthetics — washi paper lanterns, deep timber tones, and soaring double-height ceilings in the central lobby evoke the mood of a mountain ryokan translated to urban scale. Each room is spacious by Tokyo standards, with floor-to-ceiling windows framing the city below.\n\nThe urban spa extends across 2,500 square metres, incorporating an indoor swimming pool, hammam, and treatment rooms built around Japanese bathing traditions. The Arva restaurant serves Italian cuisine in a light-filled atrium, while the Café Aman offers Japanese and international options throughout the day. For central Tokyo, Aman's scale and calm remain genuinely rare.",
    "editor_rank": 0,
    "ext_points": 6,
    "total_rooms_suites_villas": 84,
    "activities": ["Spa", "Fitness", "Sightseeing", "Shopping"],
    "awards": ["Forbes 5 Star", "Conde Nast Gold List"],
    "setting": ["City"],
    "style": ["Contemporary"],
    "best50": false,
    "cn": true,
    "forbes5": true,
    "michelin3keys": false,
    "telegraph": false,
    "tl100": false,
    "aaa5d": false,
    "www": "https://www.aman.com/hotels/aman-tokyo",
    "insta": "@amantokyo"
  }
]
```

Notes on this example:
- `ext_points: 6` = Forbes 5 Star (3) + Conde Nast Gold List (3). `editor_rank` (0 placeholder) is not included.
- `cn: true` and `forbes5: true` match the `awards` array exactly — every award in the array must have its corresponding boolean set to `true`.
- Description uses `\n\n` between paragraphs (three paragraphs here).
- `id: 2xxx` is a placeholder — replace with the Directus-assigned ID before running the upsert script.


