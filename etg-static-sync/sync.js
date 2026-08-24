// OLTRA → ETG static-content sync.
//
// Pulls ETG static hotel content for every hotel we have a `ratehawk_hid` for
// and writes it into Directus, so that the live hotel-detail path never calls
// ETG for static data. See CLAUDE.md §32.
//
// Why this exists, in order of weight:
//
//   1. ETG's docs are explicit that static content must be synced offline and
//      never fetched during a live user search. It is a graded certification
//      point.
//   2. `/hotel/info/` is rate-limited to 30 requests / 60s on our key. Calling
//      it per hotel-detail view made that a site-wide ceiling of 30 detail
//      views per minute across all users. It has not bitten only because
//      traffic is low.
//
// Runs on Railway (daily cron) rather than Vercel: ETG require IP whitelisting
// and Vercel's serverless egress rotates (§47). ETG calls go through the
// existing etg-proxy so this egresses from the three Railway IPs ETG have
// already whitelisted, rather than needing a second set approved.
//
// Zero dependencies, per CLAUDE.md §2.
//
// Usage:
//   node sync.js                 full run, writes
//   node sync.js --dry-run       reports what would change, writes nothing
//   node sync.js --only <hid>    single hotel, by ETG hid (repeatable)
//   node sync.js --limit <n>     first n hotels only (smoke test)

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const ONLY_HIDS = args.flatMap((a, i) => (a === "--only" ? [Number(args[i + 1])] : []));
const LIMIT = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : null;

const DIRECTUS_URL = process.env.DIRECTUS_URL?.trim().replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN?.trim();

const RATEHAWK_API_URL = (process.env.RATEHAWK_API_URL?.trim() || "https://api.ratehawk.com").replace(/\/+$/, "");
const RATEHAWK_PROXY_SECRET = process.env.RATEHAWK_PROXY_SECRET?.trim();
const RATEHAWK_KEY = process.env.RATEHAWK_KEY?.trim();
const RATEHAWK_KEY_ID = process.env.RATEHAWK_KEY_ID?.trim();

// Same two-mode selection as hotels-beta/src/lib/ratehawk/availability.ts (§47):
// proxy mode in deployment, direct mode for local runs so a local sync is not
// gated on Railway being up.
const USE_PROXY = Boolean(RATEHAWK_PROXY_SECRET);

// ETG's hard cap. 101 returns 400 invalid_params, "hids should not be greater
// than 100" — verified live 2026-08-24.
const BATCH_SIZE = 100;

// Our key reports 30 req/60s on this endpoint, regardless of the 1200 QPM the
// docs advertise — read the limit off `debug.api_endpoint`, never the docs
// (§32). A full roster is ~9 requests, so this only matters if the roster grows
// past ~2,500 hotels; the limiter is here so that it degrades into waiting
// rather than into 429s.
const MAX_REQUESTS_PER_WINDOW = 25;
const RATE_WINDOW_MS = 60_000;

// Generous: the proxy gives up on ETG at 30s and returns a real status, so this
// only guards against the proxy itself being unreachable.
const REQUEST_TIMEOUT_MS = 60_000;

const LANGUAGE = "en";

function fail(message) {
  console.error(`FATAL: ${message}`);
  process.exit(1);
}

if (!DIRECTUS_URL || !DIRECTUS_TOKEN) fail("Missing env DIRECTUS_URL or DIRECTUS_TOKEN");
if (!USE_PROXY && !(RATEHAWK_KEY && RATEHAWK_KEY_ID)) {
  fail("Missing ETG credentials — set RATEHAWK_PROXY_SECRET (proxy mode) or RATEHAWK_KEY + RATEHAWK_KEY_ID (direct)");
}

// ---------------------------------------------------------------- ETG fetch

const requestTimes = [];

async function throttle() {
  const now = Date.now();
  while (requestTimes.length && now - requestTimes[0] > RATE_WINDOW_MS) requestTimes.shift();
  if (requestTimes.length >= MAX_REQUESTS_PER_WINDOW) {
    const waitMs = RATE_WINDOW_MS - (now - requestTimes[0]) + 100;
    console.log(`  rate limit: waiting ${Math.ceil(waitMs / 1000)}s`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  requestTimes.push(Date.now());
}

function etgHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (USE_PROXY) {
    headers["x-oltra-proxy-secret"] = RATEHAWK_PROXY_SECRET;
  } else {
    headers.Authorization = "Basic " + Buffer.from(`${RATEHAWK_KEY_ID}:${RATEHAWK_KEY}`).toString("base64");
  }
  return headers;
}

async function fetchContentBatch(hids) {
  await throttle();

  const response = await fetch(`${RATEHAWK_API_URL}/api/content/v1/hotel_content_by_ids/`, {
    method: "POST",
    headers: etgHeaders(),
    body: JSON.stringify({ hids, language: LANGUAGE }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`ETG request failed (HTTP ${response.status}): ${text.slice(0, 500)}`);
  }

  const payload = JSON.parse(text);
  if (payload.status !== "ok" || payload.error) {
    throw new Error(`ETG returned an error: ${JSON.stringify(payload.error)}`);
  }

  // `data` is a flat array and is NOT in request order — verified live
  // 2026-08-24, where [8473727, 7855756] came back with 7855756 first. Join on
  // hid, never on position. (Same class of bug as the index-based join warned
  // about in §28.)
  const hotels = Array.isArray(payload.data) ? payload.data : [];
  return new Map(hotels.filter((h) => h?.hid != null).map((h) => [Number(h.hid), h]));
}

// ------------------------------------------------------------- Directus I/O

async function directus(path, { method = "GET", body } = {}) {
  const response = await fetch(`${DIRECTUS_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${DIRECTUS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Directus ${method} ${path} failed (HTTP ${response.status}): ${text.slice(0, 500)}`);
  }
  return text ? JSON.parse(text) : null;
}

const SYNCED_FIELDS = [
  "ratehawk_room_groups",
  "ratehawk_metapolicy_struct",
  "ratehawk_metapolicy_extra_info",
  "ratehawk_check_in_time",
  "ratehawk_check_out_time",
  "ratehawk_is_closed",
  "ratehawk_deleted",
];

async function loadRoster() {
  const payload = await directus(
    `/items/hotels?filter[ratehawk_hid][_nnull]=true&fields=id,hotel_name,ratehawk_hid&limit=-1`
  );
  return payload.data.map((h) => ({ ...h, ratehawk_hid: Number(h.ratehawk_hid) }));
}

async function loadStored(ids) {
  const payload = await directus(
    `/items/hotels?filter[id][_in]=${ids.join(",")}&fields=id,${SYNCED_FIELDS.join(",")}&limit=-1`
  );
  return new Map(payload.data.map((h) => [String(h.id), h]));
}

// -------------------------------------------------------------- Trim + diff

// Exactly the three keys RawRoomGroup declares in
// hotels-beta/src/lib/ratehawk/availability.ts. Everything else measured as
// dead weight on live data (§32): room-group `images` is byte-identical to
// images_ext[].url; `category_slug` was "unspecified" on 51,838 of 51,838
// sampled room images and is never rendered; name_struct / room_amenities /
// size are never read (size is feature-gated and always null on our account);
// room_group_id is ETG's deprecated linkage and matchRoomImages() never reads
// it. Trimming takes the roster from 58.7 MB of response to 18.9 MB stored.
function trimRoomGroups(hotel) {
  const groups = Array.isArray(hotel.room_groups) ? hotel.room_groups : [];
  return groups.map((group) => ({
    name: group.name ?? null,
    rg_ext: group.rg_ext ?? null,
    images: (Array.isArray(group.images_ext) ? group.images_ext : [])
      .map((image) => image?.url)
      .filter((url) => typeof url === "string"),
  }));
}

function buildPayload(hotel) {
  return {
    ratehawk_room_groups: trimRoomGroups(hotel),
    ratehawk_metapolicy_struct: hotel.metapolicy_struct ?? null,
    ratehawk_metapolicy_extra_info: hotel.metapolicy_extra_info ?? null,
    // Raw "HH:MM:SS" local-time strings, stored as written rather than
    // converted (§45). See add-ratehawk-content-flag-fields.mjs for why these
    // are not a Directus `time` column.
    ratehawk_check_in_time: hotel.check_in_time ?? null,
    ratehawk_check_out_time: hotel.check_out_time ?? null,
    // Advisory only. The sync never changes `published` on the strength of
    // these — that call is the editor's — and they are deliberately separate
    // from ratehawk_status (§42), which is a quarterly live-rate verdict this
    // daily job must not overwrite.
    ratehawk_is_closed: hotel.is_closed ?? null,
    ratehawk_deleted: hotel.deleted ?? null,
  };
}

// Key order differs between what we send and what Directus returns, so compare
// canonically. (The rg_ext lesson from §32 generalises: never diff these by
// raw JSON.stringify.)
function canonical(value) {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function hasChanged(stored, next) {
  if (!stored) return true;
  return SYNCED_FIELDS.some((field) => canonical(stored[field]) !== canonical(next[field]));
}

// ------------------------------------------------------------------- Main

async function main() {
  const startedAt = Date.now();
  console.log(
    `ETG static sync — ${DRY_RUN ? "DRY RUN" : "LIVE"}, ${USE_PROXY ? "proxy" : "direct"} mode, target ${RATEHAWK_API_URL}`
  );

  let roster = await loadRoster();
  if (ONLY_HIDS.length) roster = roster.filter((h) => ONLY_HIDS.includes(h.ratehawk_hid));
  if (LIMIT) roster = roster.slice(0, LIMIT);

  if (!roster.length) fail("No hotels with a ratehawk_hid matched the run scope");
  console.log(`Roster: ${roster.length} hotels with a ratehawk_hid\n`);

  const byHid = new Map(roster.map((h) => [h.ratehawk_hid, h]));
  const batches = [];
  for (let i = 0; i < roster.length; i += BATCH_SIZE) batches.push(roster.slice(i, i + BATCH_SIZE));

  const stats = { requested: 0, returned: 0, changed: 0, unchanged: 0, emptyRoomGroups: 0, closed: [], deleted: [] };
  const missing = [];
  const syncedIds = [];

  for (const [index, batch] of batches.entries()) {
    const hids = batch.map((h) => h.ratehawk_hid);
    process.stdout.write(`Batch ${index + 1}/${batches.length} (${hids.length} hids) ... `);

    // No retry, by decision — the same fail-fast posture as the proxy (§47). A
    // failed batch aborts the run *before* any timestamp is stamped, so a
    // partial sync surfaces as stale timestamps rather than as a silent mix of
    // fresh and stale content. Stored content is never deleted on a failed
    // fetch.
    const content = await fetchContentBatch(hids);
    stats.requested += hids.length;
    stats.returned += content.size;

    const storedById = await loadStored(batch.map((h) => h.id));
    let batchChanged = 0;

    for (const hid of hids) {
      const hotel = content.get(hid);
      const ours = byHid.get(hid);

      // A hid we asked for and did not get back. Report it and move on —
      // overwriting with nulls would destroy good content over a transient
      // omission.
      if (!hotel) {
        missing.push({ id: ours.id, hid, name: ours.hotel_name });
        continue;
      }

      const next = buildPayload(hotel);
      if (!next.ratehawk_room_groups.length) stats.emptyRoomGroups += 1;
      if (next.ratehawk_is_closed === true) stats.closed.push(`${ours.hotel_name} (id ${ours.id})`);
      if (next.ratehawk_deleted === true) stats.deleted.push(`${ours.hotel_name} (id ${ours.id})`);

      syncedIds.push(ours.id);

      if (!hasChanged(storedById.get(String(ours.id)), next)) {
        stats.unchanged += 1;
        continue;
      }

      stats.changed += 1;
      batchChanged += 1;
      if (!DRY_RUN) await directus(`/items/hotels/${ours.id}`, { method: "PATCH", body: next });
    }

    console.log(`${content.size} returned, ${batchChanged} to write`);
  }

  // Stamped separately from content, and only after every batch succeeded: it
  // means "this row was confirmed current on this date", which stays meaningful
  // without rewriting ~19 MB of unchanged content daily.
  if (!DRY_RUN && syncedIds.length) {
    const stampedAt = new Date().toISOString();
    for (let i = 0; i < syncedIds.length; i += 100) {
      await directus(`/items/hotels`, {
        method: "PATCH",
        body: { keys: syncedIds.slice(i, i + 100), data: { ratehawk_static_synced_at: stampedAt } },
      });
    }
    console.log(`\nStamped ratehawk_static_synced_at = ${stampedAt} on ${syncedIds.length} hotels`);
  }

  console.log(`\n--- ${DRY_RUN ? "DRY RUN — nothing written" : "Done"} ---`);
  console.log(`  requested:          ${stats.requested}`);
  console.log(`  returned by ETG:    ${stats.returned}`);
  console.log(`  content ${DRY_RUN ? "would change" : "written  "}:  ${stats.changed}`);
  console.log(`  unchanged:          ${stats.unchanged}`);
  console.log(`  zero room groups:   ${stats.emptyRoomGroups}`);
  console.log(`  missing from ETG:   ${missing.length}`);
  for (const m of missing) console.log(`      - ${m.name} (id ${m.id}, hid ${m.hid})`);
  if (stats.closed.length) console.log(`  is_closed = true:   ${stats.closed.join(", ")}`);
  if (stats.deleted.length) console.log(`  deleted = true:     ${stats.deleted.join(", ")}`);
  console.log(`  elapsed:            ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
}

main().catch((error) => {
  console.error(`\nFATAL: ${error.message}`);
  console.error("Run aborted — no timestamps stamped, no stored content deleted.");
  process.exit(1);
});
