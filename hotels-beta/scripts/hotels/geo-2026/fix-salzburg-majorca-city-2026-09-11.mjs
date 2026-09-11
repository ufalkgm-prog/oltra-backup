#!/usr/bin/env node
/* Two hotels whose `city` holds something that is not their town.
 *
 * Both were flagged by the compound-local_area pass and are the same defect as
 * the three rows fixed earlier today: a region or island name sitting in the
 * town field, with the accurate value stranded in `local_area` beside it.
 *
 * 2054  ROSEWOOD SCHLOSS FUSCHL
 *   city        "Salzburg" -> "Hof bei Salzburg"
 *   local_area  "Hof bei Salzburg" -> null      (it would now echo city)
 *   area        null -> "Salzkammergut"
 *
 *   Hof bei Salzburg is its own municipality ~17km east of the city; the
 *   coordinates (47.809, 13.256) put it on Lake Fuschl, and cityAirports.ts
 *   already measured this "Salzburg" centroid at 19km from SZG, which a hotel
 *   in Salzburg would never be. The traveller area is filled rather than left
 *   null because §3 only empties it for a MAJOR CITY, where `city` does the
 *   job — nobody searches "Hof bei Salzburg". Salzkammergut is what a traveller
 *   types and what the hotel's own description says. Lech Am Arlberg is the
 *   same shape: a village with area "Arlberg". admin_region stays "Salzburg",
 *   the state, which is correct and is in the locked choice list.
 *
 * 2023  MANDARIN ORIENTAL, MALLORCA
 *   city        "Majorca" -> "Calvià"
 *   local_area  "Calvià" -> null                (it would now echo city)
 *   area        "Mallorca" — already correct, untouched
 *
 *   The island was stored twice, spelled two ways: city "Majorca" beside area
 *   "Mallorca". The other eight Balearic rows are unanimous — area is the
 *   island, city is the actual town (Deia, Puigpunyent, Banyalbufar, Calvia) —
 *   so only this row departs from the house pattern. Punta Negra sits in the
 *   Calvià municipality, which `local_area` was already carrying.
 *
 * 1518  CASTELL SON CLARET — "Calvia" -> "Calvià"
 *   Not a defect on its own, but 2023 lands in the same municipality, and
 *   leaving the two unaccented/accented would make one town two city keys in
 *   cityAirports.ts. §49's rule is that stripping an accent is a data
 *   downgrade, so both converge on the correct spelling rather than the
 *   convenient one.
 *
 * NEITHER local_area GAINS A DISTRICT. Punta Negra is a headland and Lake
 * Fuschl a lake — the same call made an hour ago — and neither village has
 * districts. An empty field is the honest answer (§3).
 *
 * CHANGING A `city` MEANS REBUILDING cityAirports.ts IN THE SAME PASS (§3,
 * §37, §49 — geography values are join keys, not display strings). "Salzburg"
 * and "Majorca" both disappear as city keys here and "Hof bei Salzburg" and
 * "Calvià" replace them. Run after this, from hotels-beta/:
 *
 *   node scripts/airports/build-city-airports.mjs
 *
 * A ONE-TIME RECORD (§24).
 *
 *   node fix-salzburg-majorca-city-2026-09-11.mjs              # dry run
 *   node fix-salzburg-majorca-city-2026-09-11.mjs --confirm    # writes
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROLLBACK = path.join(HERE, "fix-salzburg-majorca-city-2026-09-11-rollback.json");
const CONFIRM = process.argv.includes("--confirm");

/* Every field is asserted against its stored value before anything is written,
 * so a row edited by hand since this was drafted aborts the run instead of
 * being overwritten. `null` in `from` means "must currently be empty". */
const FIXES = [
  {
    id: 2054,
    name: "Rosewood Schloss Fuschl",
    from: { city: "Salzburg", local_area: "Hof bei Salzburg", state_province_county_island: null },
    to: { city: "Hof bei Salzburg", local_area: null, state_province_county_island: "Salzkammergut" },
    why: "its own municipality ~17km east; area filled because the village is not a major city",
  },
  {
    id: 2023,
    name: "Mandarin Oriental, Mallorca",
    from: { city: "Majorca", local_area: "Calvià" },
    to: { city: "Calvià", local_area: null },
    why: "the island was stored twice; the town is Calvià, as local_area already said",
  },
  {
    id: 1518,
    name: "Castell Son Claret",
    from: { city: "Calvia" },
    to: { city: "Calvià" },
    why: "one municipality must not become two city keys",
  },
];

const URL_ = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const TOKEN = process.env.DIRECTUS_TOKEN;
if (!URL_ || !TOKEN) {
  console.error("Set DIRECTUS_URL and DIRECTUS_TOKEN.");
  process.exitCode = 1;
} else {

const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
const FIELDS = "id,hotel_name,country,admin_region,state_province_county_island,city,local_area,published";
const ids = FIXES.map((f) => f.id);
const { data: rows } = await (await fetch(
  `${URL_}/items/hotels?limit=-1&filter[id][_in]=${ids.join(",")}&fields=${FIELDS}`, { headers: H }
)).json();
const byId = new Map(rows.map((r) => [String(r.id), r])); // ids are strings (§44)

const norm = (v) => { const s = String(v ?? "").trim(); return s === "" ? null : s; };

const planned = [];
const problems = [];

for (const fix of FIXES) {
  const row = byId.get(String(fix.id));
  if (!row) { problems.push(`${fix.id} — not found`); continue; }

  const changes = {};
  let alreadyDone = true;
  let blocked = false;

  for (const [field, want] of Object.entries(fix.to)) {
    const current = norm(row[field]);
    if (current === norm(want)) continue;          // this field is already there
    alreadyDone = false;
    if (current !== norm(fix.from[field])) {
      problems.push(`${fix.id} ${fix.name} — ${field} is ${JSON.stringify(current)}, expected ${JSON.stringify(norm(fix.from[field]))}`);
      blocked = true;
      continue;
    }
    changes[field] = want;
  }

  if (blocked) continue;
  if (alreadyDone) { console.log(`  skip ${fix.id} ${fix.name} — already set`); continue; }
  planned.push({ ...fix, changes, row });
}

console.log(`\n${CONFIRM ? "APPLYING" : "DRY RUN"} — city corrections\n`);
for (const p of planned) {
  console.log(`  [${p.id}] ${p.name}`);
  for (const [field, want] of Object.entries(p.changes)) {
    console.log(`        ${field.padEnd(28)} ${JSON.stringify(norm(p.row[field]))} -> ${want === null ? "null" : JSON.stringify(want)}`);
  }
  console.log(`        ${p.why}`);
}

if (problems.length) {
  console.error(`\n  ABORTING:`);
  for (const p of problems) console.error("    " + p);
  console.error("");
  process.exitCode = 1;
} else if (!CONFIRM) {
  console.log(`\n  ${planned.length} rows to change. Dry run — re-run with --confirm to write.`);
  console.log("  Then rebuild cityAirports.ts: node scripts/airports/build-city-airports.mjs\n");
} else {

const applied = [];
let failed = 0;
for (const p of planned) {
  const before = {};
  for (const field of Object.keys(p.changes)) before[field] = norm(p.row[field]);
  const r = await fetch(`${URL_}/items/hotels/${p.id}`, {
    method: "PATCH", headers: H, body: JSON.stringify(p.changes),
  });
  if (!r.ok) { console.error(`  FAILED ${p.id}: ${r.status} ${await r.text()}`); failed += 1; continue; }
  applied.push({ id: String(p.id), name: p.name, before, after: p.changes });
  console.log(`  ok ${p.id} ${p.name}`);
}

let log = [];
if (fs.existsSync(ROLLBACK)) {
  try { log = JSON.parse(fs.readFileSync(ROLLBACK, "utf8")); } catch { log = []; }
}
log.push({ at: new Date().toISOString(), changes: applied });
fs.writeFileSync(ROLLBACK, JSON.stringify(log, null, 2), "utf8");

/* Sweep the whole collection, not the rows touched. Four conditions, and the
 * first is the defect class these two belonged to. */
const { data: all } = await (await fetch(
  `${URL_}/items/hotels?limit=-1&fields=${FIELDS}`, { headers: H }
)).json();

/* 1. A city that is also an island or traveller area somewhere — the shape of
 *    "Majorca", and of the three rows fixed earlier today.
 *
 *    This test cannot tell that shape apart from §3's lodge convention, where
 *    a camp legitimately uses the reserve name as its city because there is no
 *    town. Three rows were checked by hand and are correct:
 *      1002 Mombo, 1003 Chief's Camp — city "Okavango Delta", the convention.
 *      1257 COMO Parrot Cay — city "Providenciales". Its own private cay is in
 *        the area field, and Pine Cay (1259) puts the cay in `city` instead, so
 *        the two disagree. Flagged, not changed: out of this pass's scope, and
 *        it needs the same per-row call the compound values did. */
const VERIFIED_CITY_IS_AREA = new Set(["1002", "1003", "1257"]);
const areas = new Set(all.map((h) => norm(h.state_province_county_island)).filter(Boolean));
const cityIsArea = all.filter((h) => norm(h.city) && areas.has(norm(h.city)) &&
  norm(h.city) !== norm(h.state_province_county_island) &&
  !VERIFIED_CITY_IS_AREA.has(String(h.id)));
// 2. local_area repeating city.
const echo = all.filter((h) => norm(h.local_area) && norm(h.local_area) === norm(h.city));
// 3. One town spelled two ways — accented against unaccented.
const strip = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const cityForms = new Map();
for (const h of all) {
  const c = norm(h.city); if (!c) continue;
  const k = strip(c);
  if (!cityForms.has(k)) cityForms.set(k, new Set());
  cityForms.get(k).add(c);
}
const split = [...cityForms.values()].filter((s) => s.size > 1).map((s) => [...s].join(" / "));
// 4. Every published city must resolve to an airport, or the landing flight
//    teaser resolves it to nothing (§3). Read the generated file directly.
const airportsFile = path.join(HERE, "..", "..", "..", "src", "lib", "cityAirports.ts");
let missingAirport = [];
if (fs.existsSync(airportsFile)) {
  const src = fs.readFileSync(airportsFile, "utf8");
  const keys = new Set([...src.matchAll(/^\s{2}"((?:[^"\\]|\\.)*)":\s*\[/gm)].map((m) => m[1]));
  missingAirport = [...new Set(all.filter((h) => h.published && norm(h.city) && !keys.has(norm(h.city)))
    .map((h) => norm(h.city)))];
}

console.log(`\n  Sweep of ${all.length} rows`);
console.log(`     city holding a traveller-area name:  ${cityIsArea.length}`);
for (const h of cityIsArea) console.log(`        [${h.id}] ${h.hotel_name?.trim()} city=${JSON.stringify(norm(h.city))}`);
console.log(`     local_area repeating city:           ${echo.length}`);
for (const h of echo) console.log(`        [${h.id}] ${h.hotel_name?.trim()} ${JSON.stringify(norm(h.local_area))}`);
console.log(`     one town, two spellings:             ${split.length}`);
for (const s of split) console.log("        " + s);
console.log(`     published cities with no airport:     ${missingAirport.length}   (expected until cityAirports.ts is rebuilt)`);
for (const c of missingAirport) console.log("        " + JSON.stringify(c));
console.log(`\n  Applied ${applied.length}, failed ${failed}. Rollback appended.`);
console.log("  NEXT: node scripts/airports/build-city-airports.mjs\n");
process.exitCode = failed || cityIsArea.length || echo.length || split.length ? 1 : 0;
}
}
