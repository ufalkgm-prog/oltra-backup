#!/usr/bin/env node
/* Three rows where `city` held an administrative region rather than a town.
 *
 * Surfaced by the admin_region lock audit (§3), which flagged every row where
 * `city` equalled `admin_region`. Most of those are correct — Hong Kong,
 * Singapore, Berlin, the Swiss cantons that share their city's name — but three
 * were not:
 *
 *   1287  Four Seasons Hampshire   Hampshire    -> Dogmersfield
 *   1147  The Windsor Hotel TOYA   Hokkaido     -> Toyako
 *   1631  Eteereo                  Quintana Roo -> Riviera Maya
 *
 * Each replacement comes from the hotel's own description: "set in Dogmersfield
 * Park", "High above Lake Toya", "sits within Kanai... on the Riviera Maya".
 *
 * Riviera Maya rather than Playa del Carmen for Etereo, because FIVE of its
 * siblings already use it — including The Riviera Maya EDITION at Kanai, which
 * sits in the same development. `city` is a join key, so matching what the
 * neighbours use matters more than picking the most precise place name.
 *
 * CITY IS A JOIN KEY, NOT A DISPLAY STRING (§49). All three current values are
 * live keys in `src/lib/cityAirports.ts`; renaming here orphans them and leaves
 * the new names unmapped, so `build-city-airports.mjs` MUST be re-run after
 * this (§37, §43). Skipping that step is how a destination silently resolves to
 * no airport in the landing flight teaser.
 *
 *   node fix-city-holding-region-2026-09-11.mjs              # dry run
 *   node fix-city-holding-region-2026-09-11.mjs --confirm    # writes
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROLLBACK = path.join(HERE, "fix-city-holding-region-2026-09-11-rollback.json");
const CONFIRM = process.argv.includes("--confirm");

const FIXES = [
  { id: 1287, from: "Hampshire", to: "Dogmersfield",
    why: 'description: "set in Dogmersfield Park, a 500-acre country estate in rural Hampshire"' },
  { id: 1147, from: "Hokkaido", to: "Toyako",
    why: 'description: "High above Lake Toya" — the town on the lake, not the prefecture' },
  { id: 1631, from: "Quintana Roo", to: "Riviera Maya",
    why: 'description: "sits within Kanai... on the Riviera Maya"; five siblings already use this value' },
];

const URL_ = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const TOKEN = process.env.DIRECTUS_TOKEN;
if (!URL_ || !TOKEN) {
  console.error("Set DIRECTUS_URL and DIRECTUS_TOKEN.");
  process.exitCode = 1;
} else {

const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
const ids = FIXES.map((f) => f.id);
const { data: rows } = await (await fetch(
  `${URL_}/items/hotels?limit=-1&filter[id][_in]=${ids.join(",")}&fields=id,hotel_name,city,admin_region`,
  { headers: H }
)).json();
const byId = new Map(rows.map((r) => [String(r.id), r])); // ids are strings (§44)

const planned = [];
const problems = [];

for (const fix of FIXES) {
  const row = byId.get(String(fix.id));
  if (!row) { problems.push(`${fix.id} — not found`); continue; }
  const current = String(row.city ?? "").trim();
  if (current === fix.to) { console.log(`  skip ${fix.id} ${row.hotel_name?.trim()} — already fixed`); continue; }
  if (current !== fix.from) {
    problems.push(`${fix.id} ${row.hotel_name?.trim()} — city is ${JSON.stringify(current)}, expected ${JSON.stringify(fix.from)}`);
    continue;
  }
  planned.push({ ...fix, name: row.hotel_name?.trim(), admin: row.admin_region });
}

console.log(`\n${CONFIRM ? "APPLYING" : "DRY RUN"} — city fields holding a region name\n`);
for (const p of planned) {
  console.log(`  [${p.id}] ${p.name}`);
  console.log(`        ${p.why}`);
  console.log(`        city  ${JSON.stringify(p.from)} -> ${JSON.stringify(p.to)}   (admin_region stays ${JSON.stringify(p.admin)})`);
}

if (problems.length) {
  console.error(`\n  ABORTING:`);
  for (const p of problems) console.error("    " + p);
  console.error("");
  process.exitCode = 1;
} else if (!CONFIRM) {
  console.log(`\n  ${planned.length} to change. Dry run — re-run with --confirm to write.\n`);
} else {

const applied = [];
let failed = 0;
for (const p of planned) {
  const r = await fetch(`${URL_}/items/hotels/${p.id}`, {
    method: "PATCH", headers: H, body: JSON.stringify({ city: p.to }),
  });
  if (!r.ok) { console.error(`  FAILED ${p.id}: ${r.status} ${await r.text()}`); failed += 1; continue; }
  applied.push(p);
  console.log(`  ok ${p.id} ${p.name} -> ${p.to}`);
}

let log = [];
if (fs.existsSync(ROLLBACK)) {
  try { log = JSON.parse(fs.readFileSync(ROLLBACK, "utf8")); } catch { log = []; }
}
log.push({ at: new Date().toISOString(), changes: applied });
fs.writeFileSync(ROLLBACK, JSON.stringify(log, null, 2), "utf8");

console.log(`\n  Applied ${applied.length}, failed ${failed}.`);
console.log(`\n  NEXT, and not optional — city is a join key (§49):`);
console.log(`    node scripts/airports/build-city-airports.mjs`);
console.log(`  Until that runs, Dogmersfield, Toyako and Riviera Maya have no airport mapping,`);
console.log(`  and the landing flight teaser resolves them to nothing.\n`);
process.exitCode = failed ? 1 : 0;
}
}
