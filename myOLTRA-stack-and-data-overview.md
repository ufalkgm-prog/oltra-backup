# myOLTRA — Tech Stack and Data Overview

*Prepared 2026-10-09 as a brief for drafting a management and security structure. No keys, tokens, passwords or secret values are included. Environment variables are named, never valued. Counts are a snapshot of that date.*

---

## 1. What myOLTRA is

A curated luxury travel platform (pre-launch, private beta) for high-end hotels, restaurants and flights. Members can save trips and favourites, write reviews, send feedback, and use an AI concierge (members only, currently switched off in production). Bookings are always handed to a partner who is merchant of record — myOLTRA itself takes no payments and stores no card data.

Run by one owner/operator (the founder), who is also the only administrator on every system. Development is done with Claude Code.

---

## 2. Architecture at a glance

```
Browser
  │  (beta password gate on every page)
  ▼
Next.js app on Vercel (region London, lhr1)
  ├── Server-only ──► Directus CMS (Railway) ──► Supabase project A: "Hotel database"
  ├── Server-only ──► ETG forwarding proxy (Railway, fixed IPs) ──► ETG / RateHawk API
  ├── Server-only ──► Duffel (flight search), Anthropic (concierge), Google Maps, SMTP, Frankfurter FX
  ├── Browser + server ──► Supabase project B: "Members" (auth + member data, protected by RLS)
  └── Browser ──► MapTiler tiles, Vercel Analytics, partner hand-off links (Trip.com, ZenHotels white label, etc.)
```

Two **separate** Supabase projects: A holds the hotel/restaurant catalogue (no customer data); B holds auth and all personal member data.

---

## 3. Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router, Server Components), React 18, TypeScript 5.9 |
| Styling / maps | Tailwind CSS v4, MapLibre GL with MapTiler tiles |
| Auth & member data | Supabase (supabase-js 2, @supabase/ssr cookie sessions) |
| Catalogue CMS | Directus (self-hosted on Railway) over Supabase Postgres (confirmed 2026-10-09: Directus `DB_HOST` points to Supabase) |
| AI | Vercel AI SDK 7 with Anthropic provider; Claude Opus 5.5 (conversation), Claude Haiku 4.5 (triage), Anthropic web-search tool |
| Flights | Duffel API (search/offers only); booking handed to Trip.com |
| Hotels supply | ETG/RateHawk Affiliate API (search, rates, prebook); booking completes on a ZenHotels white label. KAYAK planned (not live); andBeyond direct |
| Email | Nodemailer via GoDaddy SMTP (feedback); Supabase built-in mailer (auth emails) |
| Hosting | Vercel (app), Railway (Directus, ETG proxy; ETG static-sync job designed but not deployed) |
| Analytics | Vercel Analytics only. **No error monitoring/APM (no Sentry or similar)** |
| Source control | GitHub `oltra-beta` (direct pushes to `main`; force-push and branch deletion blocked), private mirror `oltra-backup` via GitHub Actions on every push; sibling back-office repo `oltra-agents` for content staging |
| Quality checks | `tsc --noEmit`, ESLint 9, Node test runner (`npm test`). No CI test gate — the only GitHub workflow is the backup |

---

## 4. External services and how each is reached

| Service | Purpose | Reached from | Credential held where |
|---|---|---|---|
| Supabase A (Hotel DB) | Catalogue store | Only via Directus | Directus on Railway |
| Directus (Railway) | CMS + REST API for catalogue | Server only | Static admin token in Vercel env and local `.env.local` |
| Supabase B (Members) | Auth, member data | Browser and server | Public anon/publishable key only; RLS enforces access. **No service-role key in the app runtime** |
| ETG / RateHawk | Availability, pricing, prebook | Server → Railway proxy → ETG | ETG credentials live **only on the Railway proxy**; Vercel holds a shared proxy secret |
| ETG forwarding proxy (Railway) | Fixed egress IPs (ETG whitelists IPs); path allowlist | Server only | Shared secret checked in constant time; strips/injects auth |
| Duffel | Flight search and offers | Server only | Vercel env (docs indicate a **test-mode token** may still be in use) |
| Trip.com | Flight booking hand-off | Browser link | Affiliate IDs in code (not secret) |
| Anthropic | AI concierge | Server only, one route | Vercel env |
| Google Maps Platform | Concierge distances; scripts for geocoding/transfer times | Server/scripts | Vercel env / local |
| MapTiler | Map tiles | Browser | Public key (should be referrer-restricted at MapTiler) |
| GoDaddy SMTP | Member feedback emails | Server only | Vercel env |
| Supabase built-in mailer | Signup confirmation, password reset, email change | Supabase | Dashboard (templates also live there, not in git) |
| Google OAuth | "Continue with Google" | Via Supabase | Google Cloud Console + Supabase |
| Frankfurter | FX rates | Server, keyless | — |
| Booking.com / CJ | Legacy affiliate links | Browser | Public affiliate IDs |
| Brave / Serper / Agoda / KAYAK sandbox | Data-maintenance scripts only | Local machine | Local `.env.local` |
| GitHub Actions | Mirror to backup repo | GitHub | SSH deploy key (non-expiring, write access) as repo secret |

---

## 5. Environment variable names (no values)

**Browser-exposed (`NEXT_PUBLIC_*`, public by design):**
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_MAPTILER_KEY`, `NEXT_PUBLIC_AI_CHAT_ENABLED` (concierge flag), `NEXT_PUBLIC_RATEHAWK_PREBOOK` (prebook flag), `NEXT_PUBLIC_BOOKING_AID`, `NEXT_PUBLIC_CJ_PID`, `NEXT_PUBLIC_CJ_LINK_ID`

**Server-only (Vercel):**
- Directus: `DIRECTUS_URL`, `DIRECTUS_TOKEN` (aliases accepted: `DIRECTUS_STATIC_TOKEN`, `DIRECTUS_API_TOKEN`, `DIRECTUS_ACCESS_TOKEN`)
- RateHawk: `RATEHAWK_API_URL` (proxy URL), `RATEHAWK_PROXY_SECRET`
- Flights: `DUFFEL_ACCESS_TOKEN`
- AI: `ANTHROPIC_API_KEY`, `CONCIERGE_LOG_SALT` (optional — pseudonymises member ids in the answer log)
- Google: `GOOGLE_MAPS_API_KEY`
- Mail: `SMTP_USER`, `SMTP_PASS`

**Railway (proxy / sync):** `PROXY_SHARED_SECRET`, `RATEHAWK_KEY`, `RATEHAWK_KEY_ID`, `RATEHAWK_API_URL`, `ETG_PREBOOK_ENABLED`, `PORT`; the sync also uses `DIRECTUS_URL`, `DIRECTUS_TOKEN`.

**Local scripts only:** the Directus and RateHawk variables above, `GOOGLE_MAPS_API_KEY`, `AGODA_*`, `BRAVE_API_KEY`, `SERPER_API_KEY`, `KAYAK_API`; `SUPABASE_SERVICE_ROLE_KEY` is referenced by some scripts.

**GitHub secret:** `BACKUP_SSH_KEY`.

`.gitignore` covers `.env*`, `*.pem`, `.vercel` and two local credential text files that exist on the developer's disk.

---

## 6. Access control as it stands

**Site-wide beta gate.** Middleware redirects every request (pages and APIs) without a beta cookie to a password page. Weaknesses: the password is hardcoded in source (and in internal docs); the cookie is one fixed, unsigned value shared by all users, with no expiry and no `secure` flag; the login endpoint has no brute-force throttling.

**Member authentication (Supabase B).**
- Email/password (email confirmation on; duplicate signups get a decoy response so accounts cannot be enumerated) and Google OAuth.
- Password reset with neutral wording.
- Email change confirms on the new address only ("Secure email change" off); password members must re-enter their current password, Google-only members must set one when moving to a non-Gmail address.
- Post-login redirect is sanitised against open redirects.
- `/members` pages require a session. A second, root-level middleware file appears to be ignored by Next.js, so Supabase session refresh in middleware is probably inactive — to confirm.

**Catalogue (Directus).** One Directus user (Administrator). The app and all scripts share **one static token with full admin rights** (schema and data). The Public policy grants nothing, so anonymous access is closed; images reach the browser through a server-side proxy route. Two duplicate "Administrator" roles/policies exist; 2FA is not enforced; no IP restriction.

**Supplier safety.** ETG booking/order endpoints are active on the account and ETG treats test bookings as real. They are blocked **only** by the Railway proxy's 5-path allowlist (order paths refused by name; prebook only when `ETG_PREBOOK_ENABLED=1`). Local development and one maintenance script call ETG directly with full credentials.

**AI concierge.** Feature-flagged off in production; requires a member session; in-memory limit of 60 requests/user/day (per serverless instance, so not a hard control); input caps; triage fails open. The model is structurally never given prices. A spend cap at the Anthropic Console and a shared rate limiter (e.g. Upstash) are recommended before launch.

**HTTP hardening.** No security headers (no CSP, HSTS, X-Frame-Options, Referrer-Policy). No CORS configuration (same-origin default).

### API routes

All sit behind the beta gate except `/api/beta-login`. No rate limiting except `/api/chat`.

| Route | Method | Purpose | Extra guard |
|---|---|---|---|
| `/api/beta-login` | POST | Check beta password, set cookie | None (public) |
| `/api/chat` | POST | AI concierge | Flag, member session, daily cap, input caps |
| `/api/ai/hotels` | POST | Hotel records for concierge results | None |
| `/api/ratehawk/availability` (+ `/batch`) | POST | Rates for one / many hotels | Input validation |
| `/api/ratehawk/prebook` | POST | Prebook (rate hash in, prebook hash out) | Hash-format check; proxy flag |
| `/api/members/hotel-price` | POST | Re-price a saved trip hotel | **No session check** |
| `/api/members/book-click` | POST | Log a BOOK click | Member session + RLS |
| `/api/email/feedback` | POST | Feedback email + DB row | Member session |
| `/api/flights/search` | POST | Duffel search | Validation |
| `/api/flights/offer/[id]` | GET | One Duffel offer | None |
| `/api/flights/inquiry` | POST | Offer refresh + inquiry (email sending is a stub) | Validation |
| `/api/currency/rates` | GET | FX rates (cached 1h) | None |
| `/api/hotel-images/file/[fileId]` | GET | Directus image proxy | UUID check |
| `/api/hotels/[id]/{description,ratehawk-images,ratehawk-policy}` | GET | Per-hotel content | None |
| `/api/hotels/by-ids`, `/api/restaurants/by-ids` | POST | Bulk record fetch | None |
| `/auth/callback` | GET | Supabase code exchange, profile creation | Redirect sanitised |

Supplier rate limits are site-wide (ETG: hotel page and prebook 5/min, search 15/min), so unauthenticated-but-gated routes can exhaust quotas or run up costs (Duffel, ETG).

---

## 7. Supabase A — Hotel database (via Directus)

**Location confirmed 2026-10-09:** the Directus service on Railway connects to this Supabase project (`DB_HOST` is a supabase.co host), so the live catalogue is here and Supabase backups are what protect it. The Railway project also contains a PostGIS database service that Directus does not use; it should be checked for data and either removed or documented.

**No personal customer data.** Contents: public business data, editorial content, commercially sensitive supplier mappings, and licensed media. The app only reads at runtime; all writes come from Directus admin UI or hand-run Node scripts using the same admin token.

### `hotels` — 901 rows (809 published)
- **Identity & editorial:** `id` (PK), `hotel_name`, `published` (visibility gate: requires a booking partner and an image source), `affiliation`, `description`, `highlights`, `editor_rank`, `ext_points`, `total_rooms_suites_villas`, `status_notes` (internal), `www`, `insta`.
- **Geography:** `region` (continent), `country`, `admin_region` (locked list of 292), `state_province_county_island` (traveller area), `city`, `local_area`, `lat`, `lng`.
- **Taxonomy (Postgres `text[]`):** `activities`, `setting`, `style`, `awards`; single-selects `primary_/secondary_setting`, `primary_/secondary_style`; legacy `activities1`–`7`.
- **Accolade booleans:** `best50`, `cn`, `forbes5`, `michelin3keys`, `telegraph`, `tl100`, `aaa5d`.
- **Booking partner:** `booking_partner` (`ratehawk` / `kayak` / `andbeyond`); legacy, empty: `booking_provider`, `booking_URL`, `booking_enabled`, `booking_hotel_ref`, `booking_label`, `booking_notes`, `content_provider`.
- **RateHawk/ETG (licensed content):** `ratehawk_hid`, `ratehawk_status` (`active`/`passive`/`not_integrated`), `ratehawk_image_1…50` and `…_category`, `ratehawk_room_groups` (JSON, large), `ratehawk_metapolicy_struct`, `ratehawk_metapolicy_extra_info`, check-in/out times, `ratehawk_is_closed`, `ratehawk_deleted`, `ratehawk_static_synced_at`, `ratehawk_address`, `ratehawk_phone`.
- **KAYAK:** `kayak_hotel_id`, `kayak_status`, `kayak_checked_at`.
- **Agoda (legacy):** `agoda_hotel_id`, `agoda_photo1–5`.

### `restaurants` — 2,365 rows
`id`, `status`, `sort`, `rank`, `restaurant_name` (required), `slug` (upsert key; unique by convention, **no DB constraint**), `description`, `highlights`, `restaurant_type`, `cuisine`, `restaurant_setting`, `restaurant_style`, `country`, `region`, `state_province_county_island`, `city`, `local_area`, `lat`, `lng`, `www`, `insta`, `phone`, `address`, `awards` (JSON codes), `sources` (internal), `hotel_name_hint`.

### `hotel_images` — 319 rows
`id`, `hotel` → `hotels.id` (cascade delete), `file` → `directus_files` (set null), `role` (`hero`/`secondary`/`gallery`), `sort`, `source`. Images are supplier-licensed; `directus_files.credit` holds attribution that must be displayed.

**Relations:** only the two above are enforced. Everything else (restaurant ↔ hotel, member data ↔ catalogue ids, generated airport files ↔ city values) is by value, without foreign keys.

---

## 8. Supabase B — Members project (auth + personal data)

**Auth:** email and Google providers; open sign-up; email confirmation on; built-in Supabase mailer (rate-limited, not production-grade; reset-mail delivery never confirmed). Profile row created by the app on auth callback (no DB trigger). No storage buckets, no RPC functions; one trigger function keeps `updated_at` current. The full live schema (tables, constraints, RLS policies, grants) was exported on 2026-10-09 and is now in version control (`hotels-beta/scripts/members/schema.sql`), alongside dated migrations. Every member table has a foreign key to `auth.users` with **ON DELETE CASCADE**, so deleting an auth user removes all of their data except the pseudonymous answer log.

All access uses the anon key plus the member's session cookie, so RLS always applies.

| Table | Columns (key ones) | Personal data | Access |
|---|---|---|---|
| `member_profiles` | `user_id` (key), `member_name`, `email`, `phone`, `home_airport`, `birthday`, `preferred_airlines[]`, `preferred_hotel_styles[]`, `preferred_currency`, `marketing_emails_opt_in`, `marketing_emails_consented_at`, timestamps | **Yes** — identity, contact, DOB, marketing consent record | Browser read/upsert; server upsert on login; concierge reads airlines |
| `member_family_members` | `id`, `user_id`, `full_name`, `birthday`, timestamps (passport columns dropped 2026-10-09) | **Yes — third parties, often children** | Browser: delete-all then re-insert on each save |
| `member_favorite_hotels` / `_restaurants` | `id`, `user_id`, catalogue id, denormalised name, `location`, `meta`, `thumbnail`, `created_at` | Behavioural | Browser CRUD; concierge reads |
| `member_trips` | `id`, `user_id`, `name`, `destination`, `period_label`, `travelers_label`, `status`, timestamps | Travel plans | Browser CRUD; concierge reads |
| `member_trip_hotels` | `id`, `trip_id` → trips, `user_id`, hotel id/name/location/thumbnail, `check_in`, `check_out`, `room_selection` (JSON), indicative `price_amount`/`price_currency`, `rooms`, `adults`, `kids`, `children_ages` (JSON), status fields | Dates, party incl. children's ages | Browser CRUD |
| `member_trip_restaurants` | `id`, `trip_id`, `user_id`, restaurant id/name/location, `reservation_at`, labels, status | Plans | Browser CRUD |
| `member_trip_flights` | `id`, `trip_id`, `user_id`, `route`, departure/arrival times, `cabin`, `external_flight_id`, price, `adults`, `kids`, `segments` (JSON: airline, flight no., terminals, baggage) | Exact itineraries | Browser CRUD |
| `member_reviews` | `id`, `user_id`, `review_type`, target id/label, `date_visited`, six numeric ratings, `comments` (free text) | Free text may contain PII | Browser insert only |
| `member_feedback` | `id`, `user_id` → auth.users (cascade), `member_email`, `topic`, `message`, `emailed`, `created_at` | Email + free text (also stored in the SMTP mailbox) | Server insert; members insert-only; read in dashboard |
| `concierge_answer_log` | `id`, `created_at`, `member_hash` (salted hash of user id, no FK), page/turn/model/triage, timings, token counts, result counts, `stay`/`destination`/`flights`/`search_party` (JSON), `answer_text` | Pseudonymous; JSON can include dates and children's ages; never stores the member's question | Server insert; read via a dedicated no-login `concierge_log_reader` role |
| `member_book_clicks` | `id`, `user_id` → auth.users (cascade), `kind`, `hotel_id`, `flight_route`, `source` | Behavioural | Member insert/select own |

**RLS (verified from the live export):** RLS is enabled on every table. Profiles, family members, favourites, trips, trip items and reviews: one policy each limiting a signed-in member to rows where `user_id = auth.uid()`; no policy for `anon`, so signed-out requests see nothing. `member_feedback`: insert own only. `concierge_answer_log`: insert by any signed-in member (`with check (true)`), read only via the `concierge_log_reader` role. Table grants are Supabase defaults (anon/authenticated hold all privileges, with RLS doing the filtering). Since 2026-10-09 trip items also require a trip the member owns, and TRUNCATE/TRIGGER/REFERENCES are revoked from anon and authenticated.

---

## 9. Known gaps and risks (input for the security structure)

1. **Beta gate is weak:** hardcoded password, shared constant unsigned cookie, no `secure` flag, no throttling.
2. **Directus token is full-admin and shared** by app runtime and scripts; no read-only role; 2FA not enforced; duplicate admin roles.
3. **ETG booking endpoints blocked only by the proxy allowlist;** local tooling has unrestricted ETG credentials.
4. **No security headers** (CSP, HSTS, framing, referrer).
5. **No rate limiting** on supplier-cost routes; concierge limit is per-instance only; no Anthropic spend cap confirmed.
6. **Unauthenticated member route:** `/api/members/hotel-price` has no session check.
7. **Members schema now in version control but maintained by hand** (dashboard SQL, re-exported after changes); generated DB types are stale; table grants rely on RLS alone (Supabase defaults).
8. **No account deletion:** "Terminate membership" is a placeholder and the app holds no service-role key (deleting an auth user needs one). The database side is ready — every member table cascades on auth-user deletion — but the answer log cannot be erased per member and feedback copies sit in a mailbox.
9. **No data retention policy** anywhere (log, feedback, reviews, trips kept indefinitely).
10. ~~Sensitive unused columns~~ — passport columns dropped 2026-10-09.
11. **Answer-log pseudonymity depends on `CONCIERGE_LOG_SALT` being set** (unverified); log can be poisoned by any member (open insert check).
12. **Auth email on Supabase's built-in mailer;** custom SMTP needed before launch; mail templates live outside git.
13. **No error monitoring or audit logging;** no CI test gate.
14. **Single operator:** one person holds every admin credential (Vercel, Railway, both Supabase projects, Directus, GitHub, ETG, Anthropic, Google Cloud, GoDaddy) — no documented break-glass or succession access.
15. **Backup:** non-expiring SSH deploy key with write access; backup is a force-pushed mirror (code only — databases are not covered by this workflow; Supabase/Directus backup posture to be confirmed).
16. **Credential hygiene on the dev machine:** plaintext credential files exist in the working copy (gitignored); some untracked scratch files in the repo root are unreviewed.
17. **Go-live dependencies:** Duffel token may be test-mode; ETG static-sync cron not deployed; flight inquiry email is a stub.
18. **Unused PostGIS database in the Railway project** next to Directus — not the live catalogue; check whether it holds anything, then remove or document it (cost and attack surface). Confirm the catalogue Supabase project is on a plan with daily backups (point-in-time recovery is an add-on).

---

## 10. Suggested ask for the drafting session

Using the above, draft: (a) a roles-and-responsibilities model suitable for a one-person company growing to a small team (owner, developer, content editor, support), with least-privilege access per system; (b) a secrets-management and rotation policy; (c) a data-protection plan for the members project (GDPR: lawful basis, retention, deletion/export, sub-processor list, breach response); (d) a prioritised security hardening roadmap for launch, mapped to the gaps in section 9; (e) backup, recovery and continuity procedures.
