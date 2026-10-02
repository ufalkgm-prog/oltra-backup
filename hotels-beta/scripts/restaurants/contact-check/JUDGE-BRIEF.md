# Contact check — Instagram and website judging brief

You decide each restaurant's Instagram account (and, where asked, its website)
from search results that have already been collected. **Do not call
WebSearch.** WebFetch or curl is allowed, at most once per row, only to break
a tie (see below). Do not touch Directus, and write no file except the one
named below.

Folder: `C:/Users/ufalk/dev/oltra-beta/hotels-beta/scripts/restaurants/contact-check/`

## Input

`output/insta-queue/<City>.json`. Each row has:
* `name`, `hotel`, `city`
* `stored_insta`
* `script_note`: the handles the restaurant's website linked, if any, and
  why they were not accepted automatically.
* `instagram_candidates`: profiles returned by the search query in
  `insta_query`, each with handle, title and snippet.
* `www_candidates`, when the website is also missing.

## Instagram rules (Ulrik, 2026-10-02)

* **Accept only an account that belongs to that specific restaurant in that
  city.**
* **Never accept:**
  * a chef's personal account
  * a hotel account
  * a group or brand account
  * a multi-city brand's global account. For brands such as Nobu, Zuma,
    COYA, LPM or Hakkasan, only the account for this city's outlet counts,
    e.g. @coyaabudhabi.
  * a fan, food-blog, location or reservations page
* **Accept** (`FILLED`, or `CONFIRMED` if it equals `stored_insta`) when a
  candidate's title or snippet names this restaurant, and either the title,
  snippet or handle shows this city, or the restaurant is a one-off whose
  name is distinctive enough that confusion is implausible.
* **Similar names:** watch for same-named businesses in other cities or
  trades. In Paris, @keicollectionparis was a fashion label, not Restaurant
  Kei.
* **Tie-break:** if two candidates fit, or one fits weakly, you may fetch the
  restaurant's website once to see which handle it links. If it's still
  unclear, use `FLAGGED` and put the best handle in `candidate`.
* **No acceptable candidate:**
  * If the candidates show only a hotel, brand or chef account, use
    `CONFIRMED` + null and say which accounts were rejected. The search
    counts as the search the rule requires; cite `insta_query` in `source`.
  * If the results show nothing relevant at all, use `FLAGGED` + null with
    note "no account found in search".
* **Stored value differs** from your accepted one: use `CORRECTED`. If the
  stored value is a brand, chef or hotel account and nothing replaces it:
  `CORRECTED` + null.
* Format: `https://www.instagram.com/<handle>/` in lowercase.

## Website rules (only rows with `www_candidates`)

* The restaurant's own domain, or the hotel's page for this specific
  restaurant.
* Never an aggregator, guide or social page.
* Accept (`FILLED` or `CORRECTED`) only if the result's title or snippet
  clearly names this restaurant.
* Otherwise use `FLAGGED` with the best URL in `candidate`, or null.

## Output

Write `output/agent-insta/<City>.json` (create the folder if needed). It is
a JSON array with one object per queue row:

```json
{"id": 123,
 "insta": {"status": "...", "value": "...|null", "candidate": "...", "source": "search: <insta_query> — title '<title>'", "note": "..."},
 "www":   {"status": "...", "value": "...|null", "candidate": "...", "source": "...", "note": "..."}}
```

Include `www` only for rows that had `www_candidates`.

Your final message should be only 2 lines: rows done, and how many were
accepted, rejected as brand or hotel accounts, and flagged.
