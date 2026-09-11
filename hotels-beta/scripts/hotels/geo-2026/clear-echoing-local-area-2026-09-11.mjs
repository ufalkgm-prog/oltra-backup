#!/usr/bin/env node
/* Clears the ten `local_area` values that repeat `city` verbatim.
 *
 * `local_area` is strictly sub-city, so a value identical to the city is not a
 * district by definition — it is the same fact stored twice.
 *
 *   1237, 1238   Anguilla beach localities  (Maundays Bay, Rendezvous Bay)
 *   3006         Suyian Conservancy
 *   3008-3013    Phinda Private Game Reserve, all six lodges
 *   3014         Ngala Private Game Reserve
 *
 * `city` is the correct field on every one of them and is left untouched: §3's
 * convention is that a lodge uses the reserve or area name as its city, which
 * is exactly what these hold. The duplicate is the one that goes.
 *
 * Nothing is lost. Unlike the regional clear, there is no question of moving
 * these anywhere — the destination would be the field they were copied from.
 *
 * A ONE-TIME RECORD (§24).
 *
 *   node clear-echoing-local-area-2026-09-11.mjs              # dry run
 *   node clear-echoing-local-area-2026-09-11.mjs --confirm    # writes
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROLLBACK = path.join(HERE, "clear-echoing-local-area-2026-09-11-rollback.json");
const CONFIRM = process.argv.includes("--confirm");

const IDS = [1237, 1238, 3006, 3008, 3009, 3010, 3011, 3012, 3013, 3014];

const URL_ = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const TOKEN = process.env.DIRECTUS_TOKEN;
if (!URL_ || !TOKEN) {
  console.error("Set DIRECTUS_URL and DIRECTUS_TOKEN.");
  process.exitCode = 1;
} else {

const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
const { data: rows } = await (await fetch(
  `${URL_}/items/hotels?limit=-1&filter[id][_in]=${IDS.join(",")}&fields=id,hotel_name,city,local_area`,
  { headers: H }
)).json();
const byId = new Map(rows.map((r) => [String(r.id), r])); // ids are strings (§44)

const planned = [];
const problems = [];

for (const id of IDS) {
  const row = byId.get(String(id));
  if (!row) { problems.push(`${id} — not found`); continue; }
  const la = String(row.local_area ?? "").trim();
  const city = String(row.city ?? "").trim();
  if (la === "") { console.log(`  skip ${id} ${row.hotel_name?.trim()} — already cleared`); continue; }
  // The whole justification is that the two are identical. If they have since
  // diverged, this row is no longer a duplicate and clearing it would delete
  // real data.
  if (la !== city) {
    problems.push(`${id} ${row.hotel_name?.trim()} — local_area ${JSON.stringify(la)} no longer equals city ${JSON.stringify(city)}`);
    continue;
  }
  planned.push({ id: String(id), name: row.hotel_name?.trim(), value: la });
}

console.log(`\n${CONFIRM ? "APPLYING" : "DRY RUN"} — clearing local_area that repeats city\n`);
for (const p of planned) {
  console.log(`  [${p.id}] ${p.name}`);
  console.log(`        local_area ${JSON.stringify(p.value)} -> null   (city keeps it)`);
}

if (problems.length) {
  console.error(`\n  ABORTING:`);
  for (const p of problems) console.error("    " + p);
  console.error("");
  process.exitCode = 1;
} else if (!CONFIRM) {
  console.log(`\n  ${planned.length} to clear. Dry run — re-run with --confirm to write.\n`);
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

// Sweep everything, not the rows touched — the check that has caught a miss in
// three of today's batches.
const { data: all } = await (await fetch(
  `${URL_}/items/hotels?limit=-1&fields=id,hotel_name,city,local_area`, { headers: H }
)).json();
const left = all.filter((h) => {
  const la = String(h.local_area ?? "").trim();
  return la.length > 0 && la === String(h.city ?? "").trim();
});
const populated = all.filter((h) => String(h.local_area ?? "").trim().length > 0).length;

console.log(`\n  Sweep of ${all.length} rows — local_area still repeating city: ${left.length}`);
for (const h of left) console.log(`     [${h.id}] ${h.hotel_name?.trim()} ${JSON.stringify(h.local_area)}`);
console.log(`  local_area populated: ${populated}`);
console.log(`\n  Applied ${applied.length}, failed ${failed}. Rollback appended.\n`);
process.exitCode = failed || left.length ? 1 : 0;
}
}
