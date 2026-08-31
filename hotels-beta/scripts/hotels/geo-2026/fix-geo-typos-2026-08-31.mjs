// Corrects two long-standing spelling errors in hotel geography, found while
// building the step-4 gap proposal:
//
//   country  "Equador"    -> "Ecuador"     (3 hotels: 1789, 1790, 1791)
//   city     "Sourfriere" -> "Soufrière"   (1 hotel:  1252, Sugar Beach, St. Lucia)
//
// These are join keys, not just display strings, so the code-side changes below
// travel with this script and must land together:
//
//   scripts/ratehawk/country-map.mjs   EC: "Equador" -> "Ecuador"
//   scripts/ratehawk/oltra-countries.json
//   src/lib/cityAirports.ts            "Sourfriere" key -> "Soufrière"
//
// `country-map.mjs` maps ETG's ISO code to the OLTRA country string (26); a
// mismatch there silently drops that country from the Ratehawk dump filter
// rather than erroring. `cityAirports.ts` is keyed by the exact
// `hotels.city` string; a mismatch makes the landing page's flight teaser find
// no airport for the city. Both were verified after this ran.
//
// Neither value appears anywhere in the `restaurants` collection (checked).
//
//   Dry-run by default.  --confirm to write.
//
// Re-runnable: re-reads each row and skips anything already corrected.
//
// Usage:
//   DIRECTUS_URL=... DIRECTUS_TOKEN=... node scripts/hotels/geo-2026/fix-geo-typos-2026-08-31.mjs
//   ... --confirm
import fs from "fs/promises";

const DIRECTUS_URL = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
if (!DIRECTUS_URL || !DIRECTUS_TOKEN) throw new Error("Missing DIRECTUS_URL or DIRECTUS_TOKEN");

const CONFIRM = process.argv.includes("--confirm");
const ROLLBACK = "scripts/hotels/geo-2026/fix-geo-typos-2026-08-31-rollback.json";

// `from` is an array so a re-run converges whether the row is pristine or
// already patched — same shape as fix-setting-style-values-2026-08-16 (40).
const FIXES = [
  { field: "country", from: ["Equador"], to: "Ecuador" },
  { field: "city", from: ["Sourfriere"], to: "Soufrière" },
];

async function api(pathname, { method = "GET", body } = {}) {
  const res = await fetch(`${DIRECTUS_URL}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${DIRECTUS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${pathname}: ${JSON.stringify(data)}`);
  return data;
}

const clean = (v) => (v ?? "").trim();

async function main() {
  const { data: hotels } = await api("/items/hotels?fields=id,hotel_name,country,city&limit=-1");

  const changes = [];
  for (const h of hotels) {
    for (const f of FIXES) {
      const current = clean(h[f.field]);
      if (!f.from.includes(current)) continue;
      changes.push({
        id: Number(h.id),
        hotel_name: clean(h.hotel_name),
        field: f.field,
        from: current,
        to: f.to,
      });
    }
  }

  console.log(`${hotels.length} hotels scanned | ${changes.length} to change`);
  for (const c of changes) {
    console.log(`  ${String(c.id).padEnd(5)} ${c.hotel_name.padEnd(24)} ${c.field}: "${c.from}" -> "${c.to}"`);
  }

  if (!changes.length) {
    console.log("\nNothing to do — already corrected.");
    return;
  }

  if (!CONFIRM) {
    console.log("\nDRY RUN — nothing written. Re-run with --confirm to apply.");
    return;
  }

  const applied = [];
  for (const c of changes) {
    const { data: fresh } = await api(`/items/hotels/${c.id}?fields=id,country,city`);
    if (clean(fresh[c.field]) !== c.from) {
      console.error(`  SKIP ${c.id}: ${c.field} changed since the scan ("${clean(fresh[c.field])}")`);
      continue;
    }
    await api(`/items/hotels/${c.id}`, { method: "PATCH", body: { [c.field]: c.to } });
    applied.push({ ...c, applied_at: new Date().toISOString() });
  }

  let previous = [];
  try {
    previous = JSON.parse(await fs.readFile(ROLLBACK, "utf8"));
  } catch {
    previous = [];
  }
  await fs.writeFile(ROLLBACK, JSON.stringify([...previous, ...applied], null, 2));

  console.log(`\nApplied ${applied.length}. Rollback record: ${ROLLBACK}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
