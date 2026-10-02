# Hotel name check — judging brief

You decide, for each hotel, whether its myOLTRA name should stay or change.
**Read-only:** write only your one output file. No WebSearch. WebFetch or
curl at most once per hotel, and only to break a tie by reading the hotel's
own site.

Folder: `C:/Users/ufalk/dev/oltra-beta/hotels-beta/scripts/hotels/name-check/`

## Input

`output/judge-input-<n>.json` holds an array of hotels. Each one has:
* `oltra`: our current name
* `ratehawk`: RateHawk's name
* `kayak`: KAYAK's name, often null
* `google`: Google's business-profile name
* `siteName` and `siteTitle`: from the hotel's own website (titles are
  often SEO text such as "Luxury 5-Star Hotel in …")
* `city`, `country`, `affiliation`, `www`

## The goal

**myOLTRA shows each hotel by its official name, the way the hotel presents
itself, minus marketing add-ons.**

**Keep the city when it is part of the official name.** Brands name hotels
this way: Four Seasons Hotel Boston, Mandarin Oriental, Bangkok, The
Peninsula Beijing.

**Remove the city when we added it** and the hotel itself doesn't use it,
for example Hôtel Plaza Athénée Paris → Hôtel Plaza Athénée.

**Leave out these add-ons**, even when Google or RateHawk carry them:
* collection and membership tags: "Autograph Collection", "a Luxury
  Collection Hotel", "Relais & Châteaux", "a Member of The Leading Hotels of
  the World", "an SLH Hotel", "by Hyatt", "by Marriott"
* generic descriptors that a source tacks on: "Hotel", "Resort & Spa",
  "Wellness Resort"
* "Hotel and Residences"

**Keep a brand phrase that is part of the name**, such as "A Four Seasons
Hotel" in Grand-Hôtel du Cap-Ferrat, A Four Seasons Hotel. The hotel's own
site decides this.

**Use the brand's spelling and punctuation:**
* Bvlgari (not Bulgari)
* The Ritz-Carlton, Kyoto (with the comma)
* Monte-Carlo (with the hyphen)
* accents as the hotel writes them: Hôtel, Château
* the brand's casing: THE VIEW Lugano, SO/ Bangkok
* andBeyond, written exactly like that (house rule)

**Our current name is the default.** Change it only when at least two
sources agree on the official form: Google plus the site, or Google plus
RateHawk. If the sources disagree, or you can't tell, use `judgement`.

**A Google name that is plainly a different place** (a restaurant, another
hotel, a district) doesn't count as a source. Note it.

**Rebrands:** if the sources show the hotel now trades under a new name, use
`judgement` and give the new name.

## Output

Write `output/judge-output-<n>.json`: a JSON array with one object per
input hotel:

```json
{"id": 1345,
 "decision": "keep" | "remove_city" | "spelling" | "judgement",
 "proposed": "Hôtel Plaza Athénée",
 "reason": "Google and the site both use 'Hôtel Plaza Athénée'; the city was added by us",
 "sources": "google, site"}
```

* `proposed` is null for `keep`.
* `reason` is one short sentence.

Your final message should be only one line of counts per decision.
