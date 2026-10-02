---
name: project-prelaunch-member-data
description: "Pre-launch (as of 2026-10-02) — stale copies in members' saved trips/favourites don't matter; don't raise or migrate them after data changes"
metadata:
  node_type: memory
  type: project
  originSessionId: ee9f4d77-16e0-4916-b9cf-a8c954458563
  modified: 2026-10-02T19:35:31.064Z
---

myOLTRA is still pre-launch (Ulrik, 2026-10-02). Members' saved trips and favourites keep their own copy of hotel/restaurant names (members Supabase project, not behind Directus), so renames or deletions in Directus leave those copies stale — Ulrik ruled this irrelevant for now.

**Why:** there are no real members yet; the saved data is test data.
**How to apply:** after renaming or deleting hotels/restaurants, don't flag or migrate member-saved copies. Revisit once the site has launched.
