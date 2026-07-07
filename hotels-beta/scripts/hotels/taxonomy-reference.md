# Hotel Taxonomy Reference

Canonical values for the four multiselect tag fields on the `hotels` collection in Directus.
Values are case-sensitive and must match exactly. Multiple values are stored as a JSON array.

---

## `activities`

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

> **Important:** the app does NOT read this `awards` tag field. The Accolades filter and
> award badge UI exclusively use the seven boolean flag columns (`best50`, `cn`, `forbes5`,
> `michelin3keys`, `telegraph`, `tl100`, `aaa5d`). Set those booleans — the `awards` array
> is Directus metadata only and has no effect on what users see.

---

## `setting`

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
