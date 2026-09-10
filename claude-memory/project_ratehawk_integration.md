---
name: project-ratehawk-integration
description: "RateHawk/ETG integration status — hotel matching, images, availability/booking-room-selection, and certification-prep work all documented in CLAUDE.md §26-32; booking itself still blocked"
metadata: 
  node_type: memory
  type: project
  modified: 2026-08-24T19:54:53.411Z
  originSessionId: ec11e773-664e-4b97-8a48-7a4721ad81e9
---

RateHawk (Emerging Travel Group) integration status is fully documented in **CLAUDE.md §26 through §32** — always read those sections directly rather than relying on this memory, since CLAUDE.md is the maintained single source of truth for this integration (the user has explicitly said so — see [[feedback-claude-md-source-of-truth]]).

**Progression across sessions**: §26 hotel matching (829/871 confirmed) → §27 planning → §28 hotel-level images backfilled → §29 images wired into the app UI → §30 availability/pricing/room-selection built (Agoda fully replaced on the Hotels page) → §31 fixed a wrong-Supabase-project bug in `.env.local` → §32 RateHawk/ETG Affiliate API documentation added and reconciled against live code, with several real bugs found and fixed along the way (see below).

**As of 2026-08-10 session end**:
- rg_ext room-to-image matching fixed (was silently broken — wrong comparison method, not a data problem).
- Residency ("passport country") is now a real user-changeable search-form field, no longer hardcoded.
- Taxes and cancellation policies are parsed and displayed correctly — fixed a real bug where `cancellation_penalties` was read from a path that never existed on the rate object (always silently `undefined`).
- 4 additive Directus schema fields added for future static-content sync (`ratehawk_room_groups`, `ratehawk_metapolicy_struct`, `ratehawk_metapolicy_extra_info`, `ratehawk_static_synced_at`) — schema only at the time. **Superseded 2026-08-24 (CLAUDE.md §48)**: ETG enabled Content API v1, 4 more fields were added, all 8 are populated for 853 hotels by `etg-static-sync/`, and the live `/hotel/info/` call is gone from the hotel-detail path. The Railway service for it is not deployed yet.
- **Booking/prebook remains explicitly blocked**: the handoff mechanism to ZenHotels' checkout (`hotels.myoltra.com`) is undocumented and pending written confirmation from ETG (asked 2026-08-10, contact: Valeriy Korobov, apisupport@ratehawk.com). Do not write any booking/prebook code without that confirmation AND explicit in-session sign-off — RateHawk's sandbox key hits ETG's live production host, and test bookings are treated as real orders needing manual cancellation.
- Remaining deferred TODO (tracked as a list in CLAUDE.md §32, not lost): metapolicy_struct/extra_info display, enforcing ETG's stated limits (300 hotels/request, 9 rooms/rate, 6 adults+4 children/room, 30-night stay cap, 730-day advance window), and actually building the static-content sync job that would populate the 4 new Directus fields above.

**How to apply**: before touching RateHawk/ETG code, read CLAUDE.md §32 first for the current architecture, blocked-scope list, and TODO list — it supersedes anything in earlier sections where they conflict, and supersedes this memory entirely for specifics.
