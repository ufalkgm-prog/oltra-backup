# New Hotel — Field Template

Fill in all fields below, then hand to Claude Code to upsert into Directus.

---

## IDENTITY

```
hotel_name:                    # e.g. "Aman Tokyo"
published:                     # true / false  (use false until fully reviewed)
```

---

## LOCATION

```
country:                       # e.g. "Japan"
region:                        # e.g. "Kantō"
state_province_county_island:  # e.g. "Tokyo Metropolis"
city:                          # e.g. "Tokyo"
local_area:                    # e.g. "Ōtemachi"
affiliation:                   # e.g. "Aman"  (brand / collection)
```

---

## EDITORIAL

```
highlights:    # max 15 words — the one-line USP
               #
description:   # 2–4 sentences, 60–100 words, editorial tone
               # No superlatives ("world's best", "unparalleled")
               # Expand on highlights — do not repeat it verbatim
               #
```

---

## SCORING

```
editor_rank:                # integer — editorial position within its tier
ext_points:                 # integer — quality score used for featured cycling (rough range 0–100)
total_rooms_suites_villas:  # integer
```

---

## TAXONOMY
*Flat multiselect — list all values that apply, comma-separated.*
*Values must match Directus canonical choices exactly (case-sensitive).*
*Check /editor/hotels for the full locked list.*

```
activities:   # e.g. Hiking, Diving, Spa, Golf, Skiing, Tennis, Water sports, Cycling
awards:       # e.g. Forbes Five-Star, Michelin 3 Keys
setting:      # e.g. Urban, Coastal, Mountain, Island, Desert, Countryside, Lakeside
style:        # e.g. Contemporary, Classic, Design, Eco, Boutique, Heritage
```

---

## EDITORIAL COMPANIONS
*Single-select companions — not yet shown in the app, for future use.*

```
primary_setting:    # single value from the setting list above
secondary_setting:  # single value from the setting list above
primary_style:      # single value from the style list above
secondary_style:    # single value from the style list above
```

---

## AWARD FLAGS
*Enter true, false, or leave blank.*

```
best50:        # World's 50 Best Hotels
cn:            # Condé Nast Traveller Gold List
forbes5:       # Forbes Five-Star
michelin3keys: # Michelin 3 Keys
telegraph:     # The Telegraph
tl100:         # Travel + Leisure World's Best
aaa5d:         # AAA Five Diamond
```

---

## LINKS

```
www:    # full URL, e.g. https://www.aman.com/hotels/aman-tokyo
insta:  # handle only, e.g. @amantokyo
```

---

## BOOKING

```
booking_provider:  # booking | cj_booking | official | none
booking_URL:       # full booking URL (note: capital URL)
booking_enabled:   # true / false
booking_label:     # button text shown to users, e.g. "Book via Booking.com"
booking_hotel_ref: # provider's internal hotel ID / reference code
booking_notes:     # any internal ops notes
```

---

## AGODA

```
agoda_hotel_id:  # numeric Agoda property ID
agoda_photo1:    # full image URL
agoda_photo2:    # full image URL
agoda_photo3:    # full image URL
agoda_photo4:    # full image URL
agoda_photo5:    # full image URL
```

*Note: at least agoda_photo1 must be populated for the hotel to appear in featured cycling.*

---

## GEO

```
lat:  # decimal, 5 d.p., e.g. 35.68536
lng:  # decimal, 5 d.p., e.g. 139.76202
```

*Coordinates can be geocoded via Google Maps API after entry — leave blank if unknown.*

---

## CHECKLIST BEFORE SETTING published: true

- [ ] description written (60–100 words, editorial tone)
- [ ] lat / lng populated
- [ ] agoda_hotel_id matched and at least one agoda photo URL confirmed
- [ ] ext_points and editor_rank set
- [ ] award boolean flags checked
- [ ] booking fields completed or booking_provider set to "none"
