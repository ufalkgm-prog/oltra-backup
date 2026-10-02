---
name: feedback-contact-field-rules
description: "Ulrik's rules for restaurant contact fields — Instagram must be the restaurant's own account (never chef/brand/hotel), website phone number wins over Google"
metadata:
  node_type: memory
  type: feedback
  originSessionId: ee9f4d77-16e0-4916-b9cf-a8c954458563
  modified: 2026-10-02T14:26:37.416Z
---

For restaurant (and by extension hotel) contact fields, Ulrik ruled on 2026-10-02:

- **Instagram:** only an account for that specific restaurant in that city. Chef personal accounts, brand/group accounts, a multi-city brand's global account, and hotel accounts are never acceptable — the field stays empty instead. A handle on more than one record is a brand account.
- **Phone:** the number on the restaurant's own website always wins over Google; disagreements are applied anyway and listed for review afterwards. No website number → leave empty and list it.
- Phone format: international with country code, Google's spacing (`+33 1 42 65 85 10`).

**Why:** Ulrik wants the links and numbers to be the venue's own, not a parent's; a brand account sends guests to the wrong place.

**How to apply:** use these when researching, judging or applying contact data. The pipeline that implements them is `hotels-beta/scripts/restaurants/contact-check/` (see [[project-restaurant-contact-check]]).
