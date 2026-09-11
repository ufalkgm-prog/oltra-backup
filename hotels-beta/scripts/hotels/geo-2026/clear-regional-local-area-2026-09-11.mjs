#!/usr/bin/env node
/* `local_area` is strictly sub-city. This clears the values that are not.
 *
 * Surfaced by the local_area status screen: 22 rows held a value that also
 * exists as an `admin_region` or `state_province_county_island` somewhere —
 * `Lake Como` appearing as a "neighbourhood" across FIVE different towns
 * (Cernobbio, Moltrasio, Torno, Blevio, Tremezzina), which is the opposite of
 * a district: one area spanning many towns rather than one town divided.
 *
 * CLEARING LOSES NOTHING ON THESE. Every row below already carries the same
 * value in `state_province_county_island`, or carries a better one there — the
 * two exceptions are noted individually. The field is being emptied, not moved,
 * because the destination already holds the information.
 *
 * THREE ARE DELIBERATELY NOT TOUCHED, because they are genuinely sub-city and
 * the detector only caught them for appearing in the area field too:
 *
 *   1186  Capella Singapore   "Sentosa Island" — an island district WITHIN the
 *         city-state, which is exactly what local_area is for. If anything it
 *         is the AREA field that is wrong here, not this one.
 *   1245  Amanera             "Playa Grande" — a named beach locality at Rio
 *         San Juan, below city level rather than above it.
 *   1793  Fasano Punta del Este  "Punta del Este" — a resort town, and `city`
 *         reads "Maldonado", the department. The confusion is in `city`, and
 *         clearing local_area would delete the more accurate of the two.
 *
 * A ONE-TIME RECORD (§24).
 *
 *   node clear-regional-local-area-2026-09-11.mjs              # dry run
 *   node clear-regional-local-area-2026-09-11.mjs --confirm    # writes
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROLLBACK = path.join(HERE, "clear-regional-local-area-2026-09-11-rollback.json");
const CONFIRM = process.argv.includes("--confirm");

/* id -> the regional value being cleared, asserted before writing. */
const CLEAR = {
  2034: "Costalegre",
  1013: "East Coast",
  1015: "East Coast",
  1678: "Jackson Hole",
  1447: "Lake Como",
  1458: "Lake Como",
  1461: "Lake Como",
  1468: "Lake Como",
  1486: "Lake Como",
  1441: "Lake Garda",
  1444: "Lake Garda",
  1561: "Lake Geneva",
  1565: "Lake Lucerne",
  1488: "Lake Maggiore",
  3007: "Lake Manyara National Park",
  1659: "Napa Valley",
  3030: "Phobjikha Valley",
  // The two whose area field holds something DIFFERENT and better. Nothing is
  // duplicated here, so a regional descriptor is genuinely lost — but it was in
  // the wrong field and the right one is already occupied by a stronger value.
  1534: "North Coast",     // area = "Ibiza"   — North Coast is bigger than the municipality
  1203: "Phang Nga Bay",   // area = "Phuket"  — a bay the hotel faces, not a district of Thalang
};

const URL_ = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const TOKEN = process.env.DIRECTUS_TOKEN;
if (!URL_ || !TOKEN) {
  console.error("Set DIRECTUS_URL and DIRECTUS_TOKEN.");
  process.exitCode = 1;
} else {

const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
const ids = Object.keys(CLEAR);
const { data: rows } = await (await fetch(
  `${URL_}/items/hotels?limit=-1&filter[id][_in]=${ids.join(",")}` +
    `&fields=id,hotel_name,city,local_area,state_province_county_island`,
  { headers: H }
)).json();
const byId = new Map(rows.map((r) => [String(r.id), r])); // ids are strings (§44)

const planned = [];
const problems = [];

for (const id of ids) {
  const row = byId.get(String(id));
  if (!row) { problems.push(`${id} — not found`); continue; }
  const current = String(row.local_area ?? "").trim();
  if (current === "") { console.log(`  skip ${id} ${row.hotel_name?.trim()} — already cleared`); continue; }
  if (current !== CLEAR[id]) {
    problems.push(`${id} ${row.hotel_name?.trim()} — local_area is ${JSON.stringify(current)}, expected ${JSON.stringify(CLEAR[id])}`);
    continue;
  }
  planned.push({
    id: String(id), name: row.hotel_name?.trim(), city: row.city,
    value: current, area: String(row.state_province_county_island ?? "").trim(),
  });
}

console.log(`\n${CONFIRM ? "APPLYING" : "DRY RUN"} — clearing region-level local_area\n`);
for (const p of planned) {
  const dup = p.area === p.value;
  console.log(`  [${p.id}] ${p.name}  (${p.city})`);
  console.log(`        local_area ${JSON.stringify(p.value)} -> null` +
    (dup ? `   — area already holds the same value` : `   — area holds ${JSON.stringify(p.area)}, value not preserved`));
}

if (problems.length) {
  console.error(`\n  ABORTING:`);
  for (const p of problems) console.error("    " + p);
  console.error("");
  process.exitCode = 1;
} else if (!CONFIRM) {
  console.log(`\n  ${planned.length} to clear (${planned.filter((p) => p.area === p.value).length} pure duplicates).`);
  console.log("  Dry run. Re-run with --confirm to write.\n");
} else {

const applied = [];
let failed = 0;
for (const p of planned) {
  const r = await fetch(`${URL_}/items/hotels/${p.id}`, {
    method: "PATCH", headers: H, body: JSON.stringify({ local_area: null }),
  });
  if (!r.ok) { console.error(`  FAILED ${p.id}: ${r.status} ${await r.text()}`); failed += 1; continue; }
  applied.push(p);
  console.log(`  ok ${p.id} ${p.name}`);
}

let log = [];
if (fs.existsSync(ROLLBACK)) {
  try { log = JSON.parse(fs.readFileSync(ROLLBACK, "utf8")); } catch { log = []; }
}
log.push({ at: new Date().toISOString(), changes: applied });
fs.writeFileSync(ROLLBACK, JSON.stringify(log, null, 2), "utf8");

/* Sweep the whole collection rather than the rows touched: any local_area that
 * still matches a region-level value elsewhere is one this pass missed. */
const { data: all } = await (await fetch(
  `${URL_}/items/hotels?limit=-1&fields=id,hotel_name,local_area,admin_region,state_province_county_island`,
  { headers: H }
)).json();
const nn = (v) => String(v ?? "").trim().length > 0;
const admins = new Set(all.map((h) => h.admin_region).filter(nn).map((s) => s.trim()));
const areas = new Set(all.map((h) => h.state_province_county_island).filter(nn).map((s) => s.trim()));
const KEEP = new Set(["1186", "1245", "1793"]); // genuinely sub-city, see header
const left = all.filter((h) => nn(h.local_area) && !KEEP.has(String(h.id)) &&
  (admins.has(String(h.local_area).trim()) || areas.has(String(h.local_area).trim())));

console.log(`\n  Sweep of ${all.length} rows — region-level local_area still present: ${left.length}`);
for (const h of left) console.log(`     [${h.id}] ${h.hotel_name?.trim()} ${JSON.stringify(h.local_area)}`);
console.log(`\n  Applied ${applied.length}, failed ${failed}. Rollback appended.\n`);
process.exitCode = failed || left.length ? 1 : 0;
}
}
