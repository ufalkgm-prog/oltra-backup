# myOLTRA — RPM estimates

**Draft for review, 2026-09-16.** Every per-session figure below comes from what the code does today. The **traffic assumptions** in section 1 are ours to adjust: change them and the tables recompute by simple multiplication.

## 1. Traffic assumptions (edit these)

| Assumption | Launch | Growth | Scale |
|---|---|---|---|
| Hotel-search sessions per peak hour | 60 | 600 | 3,000 |
| Peak-minute factor (busiest minute vs hour average) | 2× | 2× | 2× |
| Sessions that use the AI concierge | 20% | 20% | 20% |
| Concierge turns that check prices, per concierge session | 3 | 3 | 3 |
| Sessions that start from the landing page search | 50% | 50% | 50% |
| Result searches on the Hotels page per session (first + refinements) | 2 | 2 | 2 |
| Hotels opened per session, beyond the one opened automatically | 4 | 4 | 4 |
| Sessions that click Continue (Prebook) | 15% | 15% | 15% |

## 2. How each endpoint is called (from the code)

### `/search/serp/hotels/`
- **Hotels page results:** one request per results view, after a 450ms debounce. It fires on search, and again when dates, guests, rooms, currency or passport country change (edits during those 450ms collapse into one). Normal results are capped at 50 hotels. A country or exact-hotel search can exceed 300 hotels, and is then split into 300-hid chunks sent **one after another**. Hotels we know ETG does not sell are excluded.
- **Landing page:** one request per submitted search, ≤ 40 hotels, none when more than 40 match.
- **AI concierge:** 1–2 requests per answer that checks prices (≤ 120 hotels each), plus one per stay shown in the answer's result cards.
- **Saved trips:** one request per "Update price" click, for one hotel.

Per session: Hotels page 2 searches + ~1 extra from changing the form before searching = **3.0**; landing 0.5 × 1 = **0.5**; concierge 0.2 × 3 turns × ~2.5 = **1.5**; saved trips ≈ **0.05**. **Total ≈ 5.05 requests per session.**

### `/search/hp/`
- One request each time a hotel is opened. On the Hotels page the first result opens automatically for every results view, so each results view costs one.
- **Debounced 450ms.** Changing dates, guests, rooms or passport country while a hotel is open re-requests it once the changes settle; a date range (check-in then check-out) costs one request, not two.

Per session: automatic 2 + opened 4 + a settled form change while a hotel is open ~0.5 = **≈ 6.5 requests per session.**

### `/hotel/prebook/`
- One request per Continue click on a selected rate. Never automatic, never on page load.
- If ETG report the rate expired or unavailable, the rooms are refreshed (one more `/search/hp/`) and the guest must click Continue again.

Per session: 0.15 × ~1.1 = **≈ 0.17 requests per session.**

### Not used: `/search/serp/region/`, `/search/serp/geo/`, `/search/serp/prebook/`
We never call these. **0 RPM.**

## 3. Estimates

RPM = sessions per hour × requests per session ÷ 60. Peak = that × 2.

| Endpoint | Req / session | Launch avg | Launch peak | Growth avg | Growth peak | Scale avg | Scale peak |
|---|---|---|---|---|---|---|---|
| `/search/serp/hotels/` | 5.05 | 5 | 10 | 51 | 101 | 253 | 505 |
| `/search/serp/region/` | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `/search/serp/geo/` | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `/search/hp/` | 6.5 | 6.5 | 13 | 65 | 130 | 325 | 650 |
| `/hotel/prebook/` | 0.17 | 0.2 | 0.3 | 1.7 | 3.4 | 8.5 | 17 |
| `/search/serp/prebook/` | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

Offline, and not in RPM terms: `/api/content/v1/hotel_content_by_ids/` makes about 9 requests per day (853 hotels in batches of 100).

## 4. Measured latency (2026-09-16, our key)

| Call | Observed |
|---|---|
| `/search/hp/`, one hotel | 0.15–2.8s, one outlier at 12.8s (2 rooms, 77 rates) |
| `/search/serp/hotels/`, 1 hid | 0.2s |
| `/search/serp/hotels/`, 301 hids as 2 sequential requests | 19.7s end to end |
| `/hotel/prebook/` | 0.9–1.0s |

## 5. For the reviewer (remove before sending)

- **Our key's current limits** (from `/api/b2b/v3/overview/`): `/search/hp/` **5/min**, `/hotel/prebook/` **5/min**, `/search/serp/hotels/` 15/min. **Even the Launch average for `/search/hp/` (6.5 RPM) exceeds 5/min.** Ask ETG what limits apply after certification, and what we should request, using these tables.
- Worth asking ETG in the same message whether they cap *concurrent* requests. Chunks are sent one at a time for now; if there is no cap they could run in parallel (one constant in the code).
- `/search/hp/` is now debounced (450ms); the remaining lever is hotels opened per session, which is guest behaviour, not code.
