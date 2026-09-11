#!/usr/bin/env node
/* COMO Parrot Cay sits on Parrot Cay, not on Providenciales.
 *
 *   1257  city  "Providenciales" -> "Parrot Cay"
 *
 * The last row left over from the city sweep, and the Turks & Caicos group
 * decides it without needing a judgement call — every other row already puts
 * its own island in `city`:
 *
 *   1256  Amanyara        area Providenciales  city Providenciales
 *   1258  Grace Bay Club  area Providenciales  city Providenciales
 *   1260  The Shore Club  area Providenciales  city Providenciales
 *   1259  Pine Cay        area Pine Cay        city Pine Cay      <- the model
 *   1257  COMO Parrot Cay area Parrot Cay      city Providenciales <- the odd one
 *
 * So two private-island hotels on neighbouring cays were filed differently,
 * and only one of them was right. `area` already read "Parrot Cay"; `city`
 * had not caught up. Both fields carrying the island matches 1259 exactly,
 * and matches what the other three do with Providenciales — this group
 * duplicates area into city throughout, because an island of one hotel has no
 * town below it.
 *
 * THE COORDINATES AGREE, and they are the part worth keeping. Parrot Cay is at
 * 21.936,-72.054 — about 15km northeast of Grace Bay, and nearer Pine Cay
 * (21.874,-72.098) than any Providenciales hotel. Its own description says
 * Providenciales is where you TRANSIT, not where it is: "reached by road
 * transfer to Leeward Marina on Providenciales followed by a boat crossing".
 * A gateway is not an address — the same confusion that put an airport name in
 * the destination field (§39).
 *
 * `local_area` is null here and stays null. A one-hotel island has no
 * district, which is the same call made for Hof bei Salzburg and Calvià.
 *
 * CHANGING A `city` MEANS REBUILDING cityAirports.ts IN THE SAME PASS (§3,
 * §37, §49). "Parrot Cay" is a new key; "Providenciales" survives, since three
 * hotels still hold it. Run after this, from hotels-beta/:
 *
 *   node scripts/airports/build-city-airports.mjs
 *
 * CHECK WHAT THAT PRODUCES RATHER THAN ASSUMING IT. §37 tier 1 takes every
 * airport within 25km, and North Caicos (NCA) is ~12km from Parrot Cay while
 * Providenciales (PLS) — the airport everyone actually flies into, and the one
 * the hotel's own description names — is ~28km. If the rebuild returns NCA
 * alone, that is §37's known soft spot for boat-access properties, and it must
 * NOT be fixed by re-adding an airport-type filter: that filter was removed
 * deliberately because it sent Missoula to Spokane 319km away.
 *
 * A ONE-TIME RECORD (§24).
 *
 *   node fix-parrot-cay-city-2026-09-11.mjs              # dry run
 *   node fix-parrot-cay-city-2026-09-11.mjs --confirm    # writes
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROLLBACK = path.join(HERE, "fix-parrot-cay-city-2026-09-11-rollback.json");
const CONFIRM = process.argv.includes("--confirm");

const FIXES = [
  {
    id: 1257,
    name: "COMO Parrot Cay",
    from: { city: "Providenciales" },
    to: { city: "Parrot Cay" },
    // Asserted but never written: if the area field has moved since this was
    // drafted, the premise that `area` already held the island is gone.
    expect: { state_province_county_island: "Parrot Cay", local_area: null },
    why: "its own island, as `area` already said and Pine Cay already models",
  },
];

const URL_ = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const TOKEN = process.env.DIRECTUS_TOKEN;
if (!URL_ || !TOKEN) {
  console.error("Set DIRECTUS_URL and DIRECTUS_TOKEN.");
  process.exitCode = 1;
} else {

const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
const FIELDS = "id,hotel_name,country,admin_region,state_province_county_island,city,local_area,published,lat,lng";
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

  for (const [field, want] of Object.entries(fix.expect ?? {})) {
    if (norm(row[field]) !== norm(want)) {
      problems.push(`${fix.id} ${fix.name} — ${field} is ${JSON.stringify(norm(row[field]))}, this fix assumes ${JSON.stringify(norm(want))}`);
    }
  }

  const changes = {};
  let alreadyDone = true;
  let blocked = false;
  for (const [field, want] of Object.entries(fix.to)) {
    const current = norm(row[field]);
    if (current === norm(want)) continue;
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

console.log(`\n${CONFIRM ? "APPLYING" : "DRY RUN"} — Parrot Cay city\n`);
for (const p of planned) {
  console.log(`  [${p.id}] ${p.name}   ${p.row.lat},${p.row.lng}`);
  for (const [field, want] of Object.entries(p.changes)) {
    console.log(`        ${field.padEnd(28)} ${JSON.stringify(norm(p.row[field]))} -> ${want === null ? "null" : JSON.stringify(want)}`);
  }
  console.log(`        area stays ${JSON.stringify(norm(p.row.state_province_county_island))}, local_area stays null`);
  console.log(`        ${p.why}`);
}

if (problems.length) {
  console.error(`\n  ABORTING:`);
  for (const p of problems) console.error("    " + p);
  console.error("");
  process.exitCode = 1;
} else if (!CONFIRM) {
  console.log(`\n  ${planned.length} row to change. Dry run — re-run with --confirm to write.`);
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

/* Sweep the whole collection, not the row touched. Same four conditions the
 * Salzburg/Majorca pass used, minus its exemptions — 1257 was the last of the
 * three it had to excuse, so only the two Okavango lodges remain, and those
 * are §3's lodge convention rather than a defect. */
const { data: all } = await (await fetch(
  `${URL_}/items/hotels?limit=-1&fields=${FIELDS}`, { headers: H }
)).json();

const VERIFIED_CITY_IS_AREA = new Set(["1002", "1003"]); // Okavango Delta, §3's convention
const areas = new Set(all.map((h) => norm(h.state_province_county_island)).filter(Boolean));
const cityIsArea = all.filter((h) => norm(h.city) && areas.has(norm(h.city)) &&
  norm(h.city) !== norm(h.state_province_county_island) &&
  !VERIFIED_CITY_IS_AREA.has(String(h.id)));
const echo = all.filter((h) => norm(h.local_area) && norm(h.local_area) === norm(h.city));
const strip = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const cityForms = new Map();
for (const h of all) {
  const c = norm(h.city); if (!c) continue;
  const k = strip(c);
  if (!cityForms.has(k)) cityForms.set(k, new Set());
  cityForms.get(k).add(c);
}
const split = [...cityForms.values()].filter((s) => s.size > 1).map((s) => [...s].join(" / "));

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
console.log(`     one town, two spellings:             ${split.length}`);
for (const s of split) console.log("        " + s);
console.log(`     published cities with no airport:     ${missingAirport.length}   (expected until cityAirports.ts is rebuilt)`);
for (const c of missingAirport) console.log("        " + JSON.stringify(c));
console.log(`\n  Applied ${applied.length}, failed ${failed}. Rollback appended.`);
console.log("  NEXT: node scripts/airports/build-city-airports.mjs\n");
process.exitCode = failed || cityIsArea.length || echo.length || split.length ? 1 : 0;
}
}
