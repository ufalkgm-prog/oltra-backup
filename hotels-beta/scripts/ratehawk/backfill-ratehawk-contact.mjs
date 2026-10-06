// One-off: fills ratehawk_address and ratehawk_phone for every hotel with a
// ratehawk_hid, from ETG's hotel_content_by_ids (2026-10-06).
//
// etg-static-sync writes the same two fields, but it also rewrites room groups
// and policies, and Ulrik wants that job run from go-live, not before. So this
// touches only the two new fields. Dry run unless --confirm.
//
// Usage: node scripts/ratehawk/backfill-ratehawk-contact.mjs [--confirm]
// Env: DIRECTUS_URL, DIRECTUS_TOKEN, RATEHAWK_KEY_ID, RATEHAWK_KEY, RATEHAWK_API_URL
const CONFIRM = process.argv.includes("--confirm");
const DIRECTUS_URL = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
const RATEHAWK_URL = (process.env.RATEHAWK_API_URL || "https://api.ratehawk.com").replace(/\/+$/, "");
const AUTH = "Basic " + Buffer.from(`${process.env.RATEHAWK_KEY_ID}:${process.env.RATEHAWK_KEY}`).toString("base64");

if (!DIRECTUS_URL || !DIRECTUS_TOKEN || !process.env.RATEHAWK_KEY) throw new Error("Missing env");

async function directus(path, init = {}) {
  const res = await fetch(`${DIRECTUS_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`Directus ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

const hotels = (
  await directus(
    "/items/hotels?filter[ratehawk_hid][_nnull]=true&fields=id,hotel_name,ratehawk_hid,ratehawk_address,ratehawk_phone&limit=-1"
  )
).data;
console.log(`${hotels.length} hotels with a ratehawk_hid`);

// ETG returns `data` out of request order: join on hid, never position (§48).
const byHid = new Map();
for (let i = 0; i < hotels.length; i += 100) {
  const hids = hotels.slice(i, i + 100).map((h) => Number(h.ratehawk_hid));
  const res = await fetch(`${RATEHAWK_URL}/api/content/v1/hotel_content_by_ids/`, {
    method: "POST",
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: JSON.stringify({ hids, language: "en" }),
  });
  const json = await res.json();
  if (!res.ok || !Array.isArray(json.data)) throw new Error(`ETG ${res.status}: ${JSON.stringify(json.error ?? json)}`);
  for (const h of json.data) byHid.set(Number(h.hid), h);
}

const plan = [];
let missing = 0;
for (const h of hotels) {
  const etg = byHid.get(Number(h.ratehawk_hid));
  if (!etg) {
    missing++;
    continue;
  }
  const next = { ratehawk_address: etg.address?.trim() || null, ratehawk_phone: etg.phone?.trim() || null };
  if (next.ratehawk_address !== h.ratehawk_address || next.ratehawk_phone !== h.ratehawk_phone) {
    plan.push({ id: h.id, name: h.hotel_name, next });
  }
}
console.log(`${plan.length} to write, ${missing} not returned by ETG (left as they are)`);
console.log(`without address: ${plan.filter((p) => !p.next.ratehawk_address).length}, without phone: ${plan.filter((p) => !p.next.ratehawk_phone).length}`);
for (const p of plan.slice(0, 5)) console.log(" ", p.id, p.name, "|", p.next.ratehawk_address, "|", p.next.ratehawk_phone);

if (!CONFIRM) {
  console.log("\nDry run. Re-run with --confirm to write.");
  process.exit(0);
}

let ok = 0;
for (const p of plan) {
  await directus(`/items/hotels/${p.id}`, { method: "PATCH", body: JSON.stringify(p.next) });
  const back = (await directus(`/items/hotels/${p.id}?fields=ratehawk_address,ratehawk_phone`)).data;
  if (back.ratehawk_address === p.next.ratehawk_address && back.ratehawk_phone === p.next.ratehawk_phone) ok++;
  else console.error("readback mismatch", p.id);
}
console.log(`written and verified ${ok} of ${plan.length}`);
