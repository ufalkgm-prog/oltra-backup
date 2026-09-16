# myOLTRA — workflow table

**Draft for review, 2026-09-16.** From search through to the White Label handoff.

| # | Step | User action that triggers it | ETG endpoint(s) called | Notes |
|---|---|---|---|---|
| 0 | Static content refresh | None (a daily scheduled job) | `POST /api/content/v1/hotel_content_by_ids/` | Offline only, in batches of 100 hids. Stores room groups, images, `metapolicy_struct`, `metapolicy_extra_info`, check-in/out times. Never called during a user session. |
| 1 | Search parameters | Guest enters destination, dates, number of rooms, adults, children (an age is required for each child) and passport country | None | Passport country defaults from the browser locale and can be changed. Enforced before any request, with helper text: max 6 adults + 4 children per room, and stays of up to 30 nights. |
| 2 | Hotel list with prices | Guest runs the search (Hotels page SEARCH, or the landing page search, or a concierge answer showing hotel cards) | `POST /api/b2b/v3/search/serp/hotels/` | Our hotel IDs; max 300 per request. `residency`, `guests`, `timeout: 30`. The lowest price per hotel is shown; rates cannot be selected here. Hotels we know ETG does not sell are not requested. |
| 3 | Hotel page | Guest opens a hotel (on the Hotels page, the first result opens automatically) | `POST /api/b2b/v3/search/hp/` | One hid, debounced 450ms so form edits settle before a request. All rates shown with meal, taxes (included and payable at the hotel, in their own currency), the full cancellation schedule, and room images matched on `rg_ext`. Hotel policies from `metapolicy_struct` and `metapolicy_extra_info` come from our stored static data (step 0). Never cached. |
| 4 | Rate selection | Guest selects a room type | None | One rate covers every room searched. A guest who wants different room types is told to search for one room and book each separately. |
| 5 | Prebook | Guest clicks **Continue** on the selected rate | `POST /api/b2b/v3/hotel/prebook/` | `hash` = the rate's h- hash from step 3; `price_increase_percent: 10`. Part of the search step, not a booking; never cached; 60s timeout. Returns the p- hash. |
| 6 | Change confirmation | Automatic if Prebook returns a different price, currency, meal, free-cancellation deadline or `match_hash` | None | The guest sees old against new and chooses "Continue at this price" or "Back to rooms". This is shown for ANY change, up or down, not only above a threshold. If the rate expired (`rate_not_found`) or nothing is available within tolerance (`no_available_rates`), the guest is told and the rooms are refreshed (step 3 again). |
| 7 | Handoff to White Label checkout | Guest continues with the confirmed rate | None from our servers | **Pending ETG:** the redirect URL and the parameters that accompany the p- hash have not been specified. Until then the page states that checkout is being configured and that nothing has been booked or charged. |

**Not used at any step:** `/search/serp/region/`, `/search/serp/geo/`, `/search/serp/prebook/`, live `/hotel/info/`, and every `/hotel/order/*` booking endpoint.

**Declared limitation:** different occupancy per room (e.g. Room 1: 2 adults + 1 child, Room 2: 2 adults) is not supported. A search takes one party and a number of rooms, and the party is spread evenly across the rooms. The multi-room test case is answered on that basis.
