# ETG forwarding proxy

Gives our authenticated ETG (RateHawk) API calls a **fixed set of outbound IP
addresses**, because ETG require IP whitelisting and Vercel serverless egress
rotates. Runs on Railway alongside Directus.

Full background: `CLAUDE.md` §47 (and §32 for the ETG integration rules).

## What it does

```
browser → Vercel route → lib/ratehawk/availability.ts → this proxy → ETG
                         (all parsing stays there)      (creds live here)
```

It forwards the request body byte-for-byte and returns the upstream status and
body unmodified. It holds the ETG credentials and injects the `Authorization`
header itself, so Vercel never holds the ETG key. No parsing, no business logic.

**Only three paths are proxied.** Everything else returns 404:

- `POST /api/b2b/v3/search/serp/hotels/`
- `POST /api/b2b/v3/search/hp/`
- `POST /api/b2b/v3/hotel/info/`

That allowlist is load-bearing, not tidiness. Anyone holding the shared secret
would otherwise be able to reach *any* ETG endpoint through this service,
including the booking endpoints §32 marks BLOCKED — and per §26 our key hits
ETG's live production host, where test bookings are real orders that must be
manually cancelled.

`GET /healthz` is unauthenticated and cannot reach ETG.

## Environment variables

| Variable | Purpose |
|---|---|
| `RATEHAWK_KEY` | ETG API key |
| `RATEHAWK_KEY_ID` | ETG key id (HTTP Basic username) |
| `PROXY_SHARED_SECRET` | Must match `RATEHAWK_PROXY_SECRET` on Vercel |
| `RATEHAWK_API_URL` | Optional. Defaults to `https://api.ratehawk.com` |
| `PORT` | Set by Railway |

All three of the first are required — the service exits at boot if any is
missing, so a misconfiguration fails its healthcheck loudly instead of serving
errors under load.

Generate the shared secret with:

```bash
openssl rand -hex 32
```

## Callers authenticate with a header

```
x-oltra-proxy-secret: <PROXY_SHARED_SECRET>
```

Compared in constant time against a SHA-256 digest of the configured secret.
Missing or wrong → `401`, before any ETG call is made.

## Deploying to Railway

1. New service in the existing Railway project, deployed from this repo with
   **Root Directory `etg-proxy`**, region **EU West** (matching Directus).
2. Add `RATEHAWK_KEY`, `RATEHAWK_KEY_ID` and `PROXY_SHARED_SECRET` under
   **Variables**.
3. Settings → **Deploy** → healthcheck path `/healthz`. **Confirm App Sleeping
   is off** — there is no retry on the Vercel side, so a cold start on the first
   search after an idle period surfaces to the user as a failed availability
   check.
4. Settings → **Networking** → toggle **Enable Static IPs**. The three IPv4
   addresses appear in that same section immediately, before redeploying. Copy
   them, then redeploy to activate.
   CLI alternative: `railway outbound-network static-ip status --service <name>`.
5. Send those three addresses to ETG (Sofia Kamalova, Integration Launch
   Specialist), who handles whitelisting.

### Caveats worth not getting wrong

- **Moving the service to another region changes the IPs.** Fix the region
  before notifying ETG.
- **Static IPs are assigned per service, not per project.** A future static-sync
  service needs its own toggle and may be given different addresses, which must
  also be sent to ETG.
- Railway does not guarantee the addresses are *dedicated* — they may be shared
  with other Railway customers. Fine for a whitelist, but don't describe them to
  ETG as dedicated.

### Assigned static IPs

_To be filled in once the service is deployed and the toggle is enabled._

## Local testing

```bash
RATEHAWK_KEY=... RATEHAWK_KEY_ID=... PROXY_SHARED_SECRET=test npm start

curl -s localhost:8080/healthz

# allowlisted path, valid secret → 200 with real ETG rates
curl -s -X POST localhost:8080/api/b2b/v3/hotel/info/ \
  -H 'content-type: application/json' \
  -H 'x-oltra-proxy-secret: test' \
  -d '{"hid":8473727,"language":"en"}'

# no secret → 401
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:8080/api/b2b/v3/hotel/info/ -d '{}'

# booking endpoint → 404, never forwarded
curl -s -X POST localhost:8080/api/b2b/v3/hotel/prebook/ \
  -H 'x-oltra-proxy-secret: test' -d '{}'
```

`hid` 8473727 is ETG's "Test Hotel (Do Not Book)" fixture (§26) — safe to call.
