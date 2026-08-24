// OLTRA → ETG forwarding proxy.
//
// Runs on Railway so that all authenticated ETG traffic leaves from a fixed set
// of static outbound IPs (ETG require whitelisting; Vercel serverless egress
// rotates). See CLAUDE.md §47.
//
// This holds the ETG credentials so that Vercel does not. It forwards the
// request body byte-for-byte and returns the upstream status and body
// unmodified — all parsing, pricing and room-matching logic stays in
// hotels-beta/src/lib/ratehawk/availability.ts.
//
// Zero dependencies, per CLAUDE.md §2 (no new libraries).

import { createServer } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";

const PORT = Number(process.env.PORT) || 8080;
const ETG_BASE = (
  process.env.RATEHAWK_API_URL?.trim() || "https://api.ratehawk.com"
).replace(/\/+$/, "");
const ETG_KEY = process.env.RATEHAWK_KEY?.trim();
const ETG_KEY_ID = process.env.RATEHAWK_KEY_ID?.trim();
const SHARED_SECRET = process.env.PROXY_SHARED_SECRET?.trim();

// Exactly the endpoints we call. Everything else is 404.
//
// This allowlist is the most important control in this file. An open forwarder
// holding our credentials would let anyone who obtained the shared secret reach
// ANY ETG endpoint — including the booking endpoints that CLAUDE.md §32 marks
// BLOCKED. Per §26 our key hits ETG's live production host, where test bookings
// are treated as real orders and must be manually cancelled. The allowlist makes
// that unreachable by construction rather than by discipline.
//
// Adding a path is therefore a deliberate act, not housekeeping. The test each
// one has to pass: is it read-only, and does admitting it leave every BLOCKED
// endpoint just as unreachable? `hotel_content_by_ids` passes — it returns
// static hotel content and creates nothing. Its purpose is the opposite of
// widening: it lets the offline static sync (§32) egress from the three Railway
// IPs ETG has already whitelisted, instead of standing up a second service with
// a second set of addresses to get approved.
const ALLOWED_PATHS = new Set([
  "/api/b2b/v3/search/serp/hotels/",
  "/api/b2b/v3/search/hp/",
  "/api/b2b/v3/hotel/info/",
  "/api/content/v1/hotel_content_by_ids/",
]);

const SECRET_HEADER = "x-oltra-proxy-secret";
const MAX_BODY_BYTES = 1024 * 1024;

// 30s per ETG's recommended search timeout (§32). The caller on Vercel allows
// 35s, so this always fires first and returns a real status code rather than
// leaving Vercel holding a dangling socket.
const ETG_TIMEOUT_MS = 30_000;

// GET /whoami reports the outbound IP this service actually presents, so the
// addresses sent to ETG can be confirmed empirically rather than taken from
// Railway's Networking panel on trust. It touches neither ETG nor the ETG
// credentials, and sits behind the same shared secret as the forwarding paths.
//
// Railway load-balances outbound traffic over three IPs, so a single call only
// reveals one — the observed set is accumulated across calls and returned each
// time. That set lives in process memory, so it resets on redeploy and would be
// per-replica if the service is ever scaled beyond one.
const IP_ECHO_URLS = [
  "https://api.ipify.org?format=json", // -> {"ip":"..."}
  "https://checkip.amazonaws.com", // -> plain text
];
const IP_ECHO_TIMEOUT_MS = 5_000;
const seenEgressIps = new Set();
let whoamiCalls = 0;

// Fail at boot rather than per-request: a misconfigured service should fail its
// Railway healthcheck immediately and visibly, not serve 500s under load.
for (const [name, value] of [
  ["RATEHAWK_KEY", ETG_KEY],
  ["RATEHAWK_KEY_ID", ETG_KEY_ID],
  ["PROXY_SHARED_SECRET", SHARED_SECRET],
]) {
  if (!value) {
    console.error(`FATAL: missing required env var ${name}`);
    process.exit(1);
  }
}

const ETG_AUTH_HEADER =
  "Basic " + Buffer.from(`${ETG_KEY_ID}:${ETG_KEY}`).toString("base64");

// Hash both sides to a fixed 32 bytes before comparing, so the comparison is
// constant-time AND does not leak the secret's length the way a raw
// timingSafeEqual with a length pre-check would.
const SECRET_DIGEST = createHash("sha256").update(SHARED_SECRET).digest();

function secretMatches(provided) {
  if (typeof provided !== "string" || provided.length === 0) return false;
  const digest = createHash("sha256").update(provided).digest();
  return timingSafeEqual(digest, SECRET_DIGEST);
}

async function lookupEgressIp() {
  const errors = [];

  for (const url of IP_ECHO_URLS) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(IP_ECHO_TIMEOUT_MS),
      });
      if (!response.ok) {
        errors.push(`${url} -> HTTP ${response.status}`);
        continue;
      }

      const text = (await response.text()).trim();
      const ip = text.startsWith("{") ? JSON.parse(text).ip : text;
      if (ip) return { ip, source: url };
      errors.push(`${url} -> empty response`);
    } catch (error) {
      errors.push(`${url} -> ${error?.name}: ${error?.message}`);
    }
  }

  throw new Error(errors.join("; "));
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let oversize = false;

    req.on("data", (chunk) => {
      // Once over the cap we stop buffering but do NOT destroy the socket here:
      // destroying mid-upload resets the connection and the caller sees a network
      // error instead of the 413. Memory stays bounded because nothing further is
      // retained; the handler replies and then closes the socket.
      if (oversize) return;

      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        oversize = true;
        chunks.length = 0;
        const error = new Error("Request body too large");
        error.statusCode = 413;
        reject(error);
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!oversize) resolve(Buffer.concat(chunks));
    });
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  const startedAt = Date.now();
  const path = (req.url || "").split("?")[0];

  // Unauthenticated, and deliberately handled before anything else so it can
  // never reach ETG.
  if (req.method === "GET" && path === "/healthz") {
    sendJson(res, 200, { ok: true });
    return;
  }

  // Auth is checked before the path allowlist so that a caller without the
  // secret cannot enumerate which endpoints are proxied.
  const provided = req.headers[SECRET_HEADER];
  if (!secretMatches(Array.isArray(provided) ? provided[0] : provided)) {
    console.warn(`401 ${req.method} ${path} — bad or missing shared secret`);
    sendJson(res, 401, { ok: false, error: "Unauthorized." });
    return;
  }

  // Below the auth gate above, so /whoami is behind the same timing-safe shared
  // secret as the forwarding paths. Returns before the ETG allowlist, and makes
  // no ETG call and no use of the ETG credentials.
  if (path === "/whoami") {
    if (req.method !== "GET") {
      sendJson(res, 405, { ok: false, error: "Method not allowed." });
      return;
    }

    try {
      const { ip, source } = await lookupEgressIp();
      whoamiCalls += 1;
      seenEgressIps.add(ip);

      sendJson(res, 200, {
        ok: true,
        ip,
        source,
        calls: whoamiCalls,
        distinctSeen: [...seenEgressIps].sort(),
      });
      console.log(`200 GET /whoami ${Date.now() - startedAt}ms — ${ip} (${seenEgressIps.size} distinct so far)`);
    } catch (error) {
      console.error(`502 GET /whoami ${Date.now() - startedAt}ms — ${error?.message}`);
      sendJson(res, 502, { ok: false, error: "Could not determine outbound IP." });
    }
    return;
  }

  if (!ALLOWED_PATHS.has(path)) {
    console.warn(`404 ${req.method} ${path} — not a proxied ETG endpoint`);
    sendJson(res, 404, { ok: false, error: "Not a proxied ETG endpoint." });
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "Method not allowed." });
    return;
  }

  let body;
  try {
    body = await readBody(req);
  } catch (error) {
    const oversize = error.statusCode === 413;
    res.setHeader("Connection", "close");
    sendJson(res, oversize ? 413 : 400, {
      ok: false,
      error: oversize ? "Request body too large." : "Could not read request body.",
    });
    // Close only after the response has flushed, so the caller actually reads it.
    res.on("finish", () => req.destroy());
    return;
  }

  try {
    const upstream = await fetch(`${ETG_BASE}${path}`, {
      method: "POST",
      headers: {
        // Injected here, never accepted from the caller.
        Authorization: ETG_AUTH_HEADER,
        "Content-Type": "application/json",
      },
      body,
      signal: AbortSignal.timeout(ETG_TIMEOUT_MS),
    });

    const text = await upstream.text();

    // Status and body pass through untouched — ratehawkPost() on the Vercel side
    // already logs the status and the first 2000 chars of the body on a non-2xx,
    // so ETG-side failures stay diagnosable without any extra plumbing here.
    res.writeHead(upstream.status, {
      "Content-Type": upstream.headers.get("content-type") ?? "application/json",
      "Content-Length": Buffer.byteLength(text),
      "Cache-Control": "no-store",
    });
    res.end(text);

    console.log(`${upstream.status} POST ${path} ${Date.now() - startedAt}ms`);
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    console.error(
      `${timedOut ? 504 : 502} POST ${path} ${Date.now() - startedAt}ms — ${error?.name}: ${error?.message}`
    );
    sendJson(res, timedOut ? 504 : 502, {
      ok: false,
      error: timedOut ? "ETG request timed out." : "Could not reach ETG.",
    });
  }
});

server.listen(PORT, () => {
  console.log(`ETG proxy listening on ${PORT}, forwarding to ${ETG_BASE}`);
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
