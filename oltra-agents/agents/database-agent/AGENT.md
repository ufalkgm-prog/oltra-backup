# AGENT.md — Database Agent

Read `../../CLAUDE.md` first. Where this file and that one conflict,
that one wins.

## Purpose

Keep the hotel and restaurant data accurate without ever writing to a
live table. You produce staged files. Ulrik promotes them.

## Where things live

- `agents/database-agent/hotels/pending/` — proposed changes, high
  confidence
- `agents/database-agent/hotels/flagged/` — needs a human decision
- `agents/database-agent/restaurants/pending/`
- `agents/database-agent/restaurants/flagged/`

Read `shared/data-models.md` before any task touching schema or fields.

## The four routine runs

**1. ETG hotel match**
Match myOLTRA hotel records against ZenHotels/ETG static data. Match on
name, city, and coordinates together — never name alone. Score each
match 0–100. Above 90 goes to `pending/`. Below 90 goes to `flagged/`
with the candidate matches listed and the reason for the doubt.

**2. Hotel URL validation**
Request each hotel URL and record the status. 200 is fine. A redirect is
recorded with its destination and flagged as `url-redirected` — do not
silently accept the new URL. 404, 403, or timeout is flagged as
`url-broken` with the code. Never substitute a replacement URL you found
yourself; propose it in the flag file and let Ulrik decide.

**3. Hotel open/closed check**
A property absent from the ETG catalogue is flagged
`etg-property-not-found`, not marked closed. Closure is a serious claim
and needs two independent signals before you even propose it.

**4. Restaurant status check**
Query Google Places for business status. `CLOSED_PERMANENTLY` from
Google plus a dead website is enough to propose closure — write it to
`pending/`. Either signal alone goes to `flagged/` as
`status-unconfirmed`. A restaurant that has moved is not closed; flag it
as `venue-relocated`.

## Output format

One file per record, named `[record-id]-[short-reason].md`:

```
# [Hotel or restaurant name]
Record ID: [id]
Check run: [which of the four runs]
Date: YYYY-MM-DD

## Current value
[what is in the database now]

## Proposed value
[what you think it should be]

## Evidence
[what you actually observed — status codes, API responses, sources]

## Confidence
[score and why]
```

## Hard limits

- Never write, update, or remove a record in a live Supabase table.
- Never change a Directus collection, field, or relationship. Directus
  is an application layer — removing a field there can drop the
  underlying Supabase column. Any structural task requires a schema
  snapshot first and explicit confirmation.
- Never run a bulk operation. One record, one file.
- Never mark a venue closed on a single signal.
- Never invent a replacement URL, phone number, or address.
- Never write credentials into any file.

## On failure

An API timeout means skip that record and continue. Log the skip and
list every skipped record in the run summary. A run that fails halfway
is reported honestly — do not present partial results as complete.
