# Contact check — research agent brief

You resolve the contact fields a script could not settle for one city's
restaurants. **Read-only research.** Do not touch Directus or any file except
the one output file named below.

## Input

`output/classified/<City>.json` (relative to this folder:
`C:/Users/ufalk/dev/oltra-beta/hotels-beta/scripts/restaurants/contact-check/`).

Work only on rows whose `research` array is non-empty. Each entry names a
`field` (`www`, `insta`, `phone`, `address`, or `all`, meaning the Google match
itself is in doubt) and `why`. The row also carries the evidence the script
gathered:
* `google`: the best Google Business Profile match, with `accepted` and
  `dist_m`, the distance from our stored coordinates.
* the script's tentative status for each field, with its notes.

Load the tools first: ToolSearch `select:WebFetch,WebSearch`.

## Rules (Ulrik, 2026-10-02)

**Instagram (`insta`).**
* Accept only an account that belongs to that specific restaurant.
* Never accept a chef's personal account, a brand or group account, a hotel
  account, or a fan, reservation or location page. If one of those is the
  only account, the answer is empty (`value: null`, `status: "CONFIRMED"`,
  note "no restaurant-specific account").
* Multi-city brands (Nobu, Zuma, Hakkasan, LPM, Coya…): only the account for
  this city's outlet counts (for example @zumadubai). The global brand
  account is never acceptable.
* Best evidence is a link on the restaurant's own website (or on the
  restaurant's own page on the hotel's site).
* Next best is an instagram.com search result whose name or bio identifies
  this restaurant in this city.
* Never construct a handle from the name. If you can't tie a handle to the
  venue, use `status: "FLAGGED"` and put the handle in `candidate`, so a
  human can check it.
* Format: `https://www.instagram.com/<handle>/` in lowercase.
* **"No account" has to be earned by a search.** Before `CONFIRMED` + null,
  run at least one web search such as `"<restaurant name>" <city>
  instagram`, and name that search in `source`.
* The script's candidate list is a starting point, not a search: it only
  shows what the website links.
* If you run out of budget before searching, use `FLAGGED`, note "not
  searched", and never `CONFIRMED`.
* An empty field you did not search for wrongly tells the reviewer the
  restaurant has no account.

**Status words.** `FILLED` means the stored field was empty and you supply a
value. `CONFIRMED` means the stored value (or a stored empty) is right.

**Rate limits.** If WebFetch is rate-limited, wait and use WebSearch
results meanwhile. Never mark a field resolved because a fetch failed.

**Phone.**
* The number on the official website wins. Read the contact or reservations
  page.
* International format with the country code, the way Google writes it, for
  example `+44 20 7499 9999`.
* If the website number differs from Google's, use the website's and set
  `review: true`.
* If the website publishes no number, `value: null` and `review: true`.
* If the venue has no website at all, use Google's number when a guide
  agrees with it.

**Address.**
* The full street address of this outlet (for a hotel restaurant, the
  hotel's street address), in the style Google uses.
* It must agree between the official site and Google. If they disagree, use
  `FLAGGED` and give both.

**Website (`www`).**
* The venue's own domain, or the hotel's page for this specific restaurant.
  It must load, and the page must be this venue.
* Never an aggregator (TheFork, OpenTable, Tripadvisor, Resy, Yelp,
  Michelin…). gorp.jp is accepted in Japan only.
* If no website exists, `value: null`, `status: "CONFIRMED"`, note "no
  website".
* **A loading page is not proof:** one Paris domain had been hijacked and
  served an unrelated site.

**`all`.** Google's match is in doubt.
* Decide whether the venue is the Google place, has moved (give the new
  address), or has closed.
* Then resolve phone, address and coordinates. For coordinates, use
  Google's location when that place is confirmed.

**Closures.** If the venue has closed permanently, set
`closure_note: "CLOSED: <evidence>"` and skip its other fields. Temporary
closures and announced closing dates also go in `closure_note`.

## FETCH-ONLY mode (used when your prompt says so)

The session's web-search allowance is used up, so in this mode:
* **Do not call WebSearch at all.** Use WebFetch only.
* If WebFetch is blocked or rate-limited on a page, use `curl -sL -A
  "Mozilla/5.0 …"` via Bash.
* **Skip every `insta` research item.** A separate search pass handles
  those, so don't write an `insta` key.
* Work only on `www`, `phone`, `address` and `all`, using:
  * the official site and its contact, reservations or "find us" pages;
  * the hotel's page for hotel restaurants;
  * Google's own website link from the row's `google` object.
* If an item genuinely needs a search, use `FLAGGED` with note "needs
  search". Examples: finding a website when none is known, or tracing a
  venue that moved.

## Budget

About 2–3 lookups per research field. Never more than 6 on one venue: flag it
and move on. Don't re-check fields that aren't in `research`.

## Output

Write **one file**, `output/agent/<City>.json` (create the folder if
needed). It holds a JSON array with one object per researched row:

```json
{"id": 123,
 "insta":   {"status": "FILLED|CONFIRMED|CORRECTED|FLAGGED", "value": "...|null", "candidate": "...", "source": "...", "note": "..."},
 "phone":   {"status": "...", "value": "...", "source": "...", "review": true},
 "address": {...}, "www": {...},
 "coords":  {"lat": 0.0, "lng": 0.0, "source": "..."},
 "closure_note": "..."}
```

Include only the fields you researched. Every value needs a `source` you
actually loaded or saw in search results.

Your final message should be only a 2–3 line summary: rows done, number of
closures, and anything striking. Do not repeat the JSON.
