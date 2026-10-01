---
name: project-booking-partners
description: "Each published hotel must have one booking partner — RateHawk, KAYAK or andBeyond (direct); andBeyond properties never go to RateHawk/KAYAK"
metadata:
  node_type: memory
  type: project
  originSessionId: 0478c4ca-a156-4ba9-afd6-8f5f81fcd1ce
  modified: 2026-10-01T13:06:10.199Z
---

As of 2026-10-01 (Ulrik):
- **andBeyond is a direct partner.** andBeyond properties carry their own photos (Directus `hotel_images`) and book through andBeyond, never RateHawk or KAYAK.
- **Target rule: no published hotel without a working partner.** A published hotel must be bookable AND have photos through RateHawk, KAYAK or andBeyond; otherwise it is unpublished.
- Supplier precedence: RateHawk (rates + RateHawk photos) first, then KAYAK, then today's "Book on website".
- KAYAK state lives in `kayak_hotel_id` / `kayak_status` (active · unverified · passive) / `kayak_checked_at`, added 2026-10-01. "unverified" = KAYAK chosen but rates not checkable in the sandbox. A `booking_partner` field was proposed but not yet created.
- **No hotel on the site without photos.** KAYAK-only-photo hotels wait for KAYAK production (sandbox images are placeholders).
- **One BOOK button for every partner**; a pop-up names the partner before Continue. RateHawk bookings are named **"ZenHotels"** (decided 2026-10-01).
- Ulrik keeps Regent Shanghai, Casa Chablé, Nobu Marrakech and Emirates Wolgan Valley unpublished by choice. Wolgan's KAYAK candidate is NOT a match.

**Why:** affiliate relationships drive what can be sold; a published hotel with no partner is a dead end for a guest.
**How to apply:** before publishing or changing supplier fields, check the partner rule; keep myOLTRA names/editorial, change only supplier and photo wiring. Related: [[project-ratehawk-integration]].
