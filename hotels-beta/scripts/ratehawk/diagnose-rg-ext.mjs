// Read-only diagnostic for CLAUDE.md §32 item 2: why exact rg_ext equality
// matching between /search/hp/ rates and /hotel/info/ room_groups[] found
// 0/5 correct matches on live data, while room_name containment found 5/5.
//
// Makes two live calls against the SAME host/key (no dump, no Content API,
// no writes anywhere) for the ETG test hotel:
//   - POST /api/b2b/v3/hotel/info/   -> room_groups[].rg_ext  (static side)
//   - POST /api/b2b/v3/search/hp/    -> rates[].rg_ext         (search side)
// and prints both full objects side by side, field by field.
//
// Usage (from hotels-beta/):
//   RATEHAWK_KEY=... RATEHAWK_KEY_ID=... RATEHAWK_API_URL=... node scripts/ratehawk/diagnose-rg-ext.mjs

const RATEHAWK_KEY = process.env.RATEHAWK_KEY;
const RATEHAWK_KEY_ID = process.env.RATEHAWK_KEY_ID;
const RATEHAWK_API_URL = (process.env.RATEHAWK_API_URL || "https://api.ratehawk.com").replace(/\/+$/, "");

if (!RATEHAWK_KEY) throw new Error("Missing RATEHAWK_KEY");
if (!RATEHAWK_KEY_ID) throw new Error("Missing RATEHAWK_KEY_ID");

const HID = Number(process.env.DIAG_HID) || 8473727; // ETG's "Test Hotel (Do Not Book) test" fixture

function authHeader() {
  return "Basic " + Buffer.from(`${RATEHAWK_KEY_ID}:${RATEHAWK_KEY}`).toString("base64");
}

async function post(path, body) {
  const url = `${RATEHAWK_API_URL}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`FAILED ${path} -> ${res.status}`);
    console.error(text.slice(0, 2000));
    throw new Error(`${path} failed (${res.status})`);
  }
  return { url, status: res.status, json: text ? JSON.parse(text) : {} };
}

function typeOf(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

function diffKeys(a, b) {
  const aKeys = new Set(Object.keys(a ?? {}));
  const bKeys = new Set(Object.keys(b ?? {}));
  const onlyA = [...aKeys].filter((k) => !bKeys.has(k));
  const onlyB = [...bKeys].filter((k) => !aKeys.has(k));
  const shared = [...aKeys].filter((k) => bKeys.has(k));
  return { onlyA, onlyB, shared };
}

async function main() {
  console.log(`Host: ${RATEHAWK_API_URL}`);
  console.log(`Key ID: ${RATEHAWK_KEY_ID}`);
  console.log(`Test hotel hid: ${HID}\n`);

  // --- Static side: /hotel/info/ (single-hotel content endpoint, same one
  // used live at runtime by fetchRatehawkRoomImages in availability.ts —
  // NOT the weekly dump, NOT Content API v1) ---
  const info = await post("/api/b2b/v3/hotel/info/", { hid: HID, language: "en" });
  const roomGroups = info.json?.data?.room_groups ?? [];
  console.log(`--- /hotel/info/ (status ${info.status}) ---`);
  console.log(`room_groups count: ${roomGroups.length}`);
  console.log(`Static source: single-hotel /hotel/info/ endpoint (live call, not dump/Content API v1)\n`);

  // --- Search side: /search/hp/ ---
  const today = new Date();
  const checkin = new Date(today.getTime() + 45 * 86400000).toISOString().slice(0, 10);
  const checkout = new Date(today.getTime() + 47 * 86400000).toISOString().slice(0, 10);

  const hp = await post("/api/b2b/v3/search/hp/", {
    checkin,
    checkout,
    residency: "gb",
    language: "en",
    guests: [{ adults: 1, children: [] }],
    hid: HID,
    currency: "USD",
  });
  const rates = hp.json?.data?.hotels?.[0]?.rates ?? [];
  console.log(`--- /search/hp/ (status ${hp.status}) checkin=${checkin} checkout=${checkout} ---`);
  console.log(`rates count: ${rates.length}\n`);

  if (!roomGroups.length || !rates.length) {
    console.log("Not enough data on one side to compare — dumping raw payloads instead.");
    console.log("room_groups:", JSON.stringify(roomGroups, null, 2));
    console.log("rates:", JSON.stringify(rates, null, 2));
    return;
  }

  // Match by the same room_name containment logic already in production,
  // so we're comparing the pair the app actually pairs together.
  function findGroupForRoomName(roomName) {
    const normalized = roomName.toLowerCase();
    let best = null;
    for (const g of roomGroups) {
      if (!g.name) continue;
      if (normalized.includes(g.name.toLowerCase())) {
        if (!best || g.name.length > best.name.length) best = g;
      }
    }
    return best;
  }

  const n = Math.min(5, rates.length);
  for (let i = 0; i < n; i++) {
    const rate = rates[i];
    const group = findGroupForRoomName(rate.room_name ?? "");
    console.log(`\n=== Room ${i + 1}/${n}: rate.room_name = "${rate.room_name}" ===`);
    console.log(`Matched static room_group.name = ${group ? `"${group.name}"` : "(none found via room_name containment)"}`);

    const rateRgExt = rate.rg_ext ?? null;
    const groupRgExt = group?.rg_ext ?? null;

    console.log("\nrate.rg_ext (from /search/hp/):");
    console.log(JSON.stringify(rateRgExt, null, 2));
    console.log("\ngroup.rg_ext (from /hotel/info/ room_groups[]):");
    console.log(JSON.stringify(groupRgExt, null, 2));

    if (rateRgExt && groupRgExt) {
      const { onlyA, onlyB, shared } = diffKeys(rateRgExt, groupRgExt);
      console.log("\nKey comparison:");
      console.log(`  keys only in rate.rg_ext:  ${onlyA.length ? onlyA.join(", ") : "(none)"}`);
      console.log(`  keys only in group.rg_ext: ${onlyB.length ? onlyB.join(", ") : "(none)"}`);
      console.log(`  shared keys: ${shared.join(", ")}`);
      for (const k of shared) {
        const va = rateRgExt[k];
        const vb = groupRgExt[k];
        const same = JSON.stringify(va) === JSON.stringify(vb);
        console.log(
          `    ${k}: rate=${JSON.stringify(va)} (${typeOf(va)})  vs  group=${JSON.stringify(vb)} (${typeOf(vb)})  ${same ? "MATCH" : "DIFFER"}`
        );
      }
      console.log(
        `\n  Exact JSON.stringify equality (raw, any key order): ${
          JSON.stringify(rateRgExt) === JSON.stringify(groupRgExt) ? "EQUAL" : "NOT EQUAL"
        }`
      );
      console.log(
        `  Exact equality on SHARED keys only: ${
          shared.every((k) => JSON.stringify(rateRgExt[k]) === JSON.stringify(groupRgExt[k])) ? "EQUAL" : "NOT EQUAL"
        }`
      );
    } else {
      console.log("\nOne side is missing rg_ext entirely — cannot key-compare.");
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
