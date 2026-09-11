#!/usr/bin/env node
/* `local_area` holds the most precise value that is still a DISTRICT.
 *
 * Ulrik's rule, 2026-09-11: precise districts, not broad ones. Two corollaries
 * decide every case below, and they pull in opposite directions:
 *
 *   More precise WINS   Midtown East beats Midtown; Covent Garden beats West End.
 *   But it must be a DISTRICT.  Park Lane is a street. Grosvenor Square is a
 *   square. The Grand Canal is a waterway. None is a finer district, so those
 *   normalise to the district they sit in rather than away from it.
 *
 * NEW YORK
 *   1721  The Fifth Avenue Hotel   Midtown -> NoMad          not a granularity
 *         fix at all: its own description says "at Fifth Avenue and 28th Street
 *         IN NOMAD", which is a mile and a half from Midtown.
 *   1835  Lotte New York Palace    Midtown -> Midtown East   "Madison at 50th"
 *   3020  Four Seasons New York    Midtown Manhattan -> Midtown East
 *         "57 East 57th Street, between Park and Madison"
 *
 * LONDON
 *   1293  ME London        West End -> Covent Garden   "stands on the Strand"
 *   1308  The Langham      West End -> Marylebone      Portland Place
 *   2056  The Chancery Rosewood   "Mayfair, Grosvenor Square" -> Mayfair
 *   2064  45 Park Lane            "Mayfair, Park Lane"      -> Mayfair
 *
 * VENICE — the districts are the six sestieri, and "Grand Canal" is the water
 * four of them happen to face.
 *   1427  Hotel Cipriani       Giudecca Island -> Giudecca
 *   1423  Aman Venice          Grand Canal -> San Polo      named in its text
 *   1466  Palazzo Venart       Grand Canal -> Santa Croce   named in its text
 *   1479  The Gritti Palace    Grand Canal -> San Marco     NOT in its text
 *   1484  The St. Regis Venice Grand Canal -> San Marco     NOT in its text
 *
 * The last two are the weakest links here. Both hotels are in San Marco and I
 * am confident of it, but their descriptions do not say so — that comes from
 * outside the data, unlike every other row above. Worth a second pair of eyes.
 *
 * DELIBERATELY NOT CHANGED: 1654 Aman New York, still "Midtown". It occupies
 * the Crown Building at Fifth and 57th, which is the line Midtown East and West
 * divide on. Picking a side would be precision the address does not support.
 *
 * A ONE-TIME RECORD (§24).
 *
 *   node normalise-local-area-granularity-2026-09-11.mjs              # dry run
 *   node normalise-local-area-granularity-2026-09-11.mjs --confirm    # writes
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROLLBACK = path.join(HERE, "normalise-local-area-granularity-2026-09-11-rollback.json");
const CONFIRM = process.argv.includes("--confirm");

const FIXES = [
  { id: 1721, from: "Midtown", to: "NoMad", why: 'description: "at Fifth Avenue and 28th Street in NoMad"' },
  { id: 1835, from: "Midtown", to: "Midtown East", why: 'description: "on Madison Avenue at 50th Street"' },
  { id: 3020, from: "Midtown Manhattan", to: "Midtown East", why: 'description: "57 East 57th Street, between Park and Madison"' },
  { id: 1293, from: "West End", to: "Covent Garden", why: 'description: "stands on the Strand where Covent Garden... are within a few minutes"' },
  { id: 1308, from: "West End", to: "Marylebone", why: "Portland Place, at the top of Regent Street" },
  { id: 2056, from: "Mayfair, Grosvenor Square", to: "Mayfair", why: "Grosvenor Square is a square, not a finer district" },
  { id: 2064, from: "Mayfair, Park Lane", to: "Mayfair", why: "Park Lane is a street, not a finer district" },
  { id: 1427, from: "Giudecca Island", to: "Giudecca", why: "the district is Giudecca; Island is a redundant noun" },
  { id: 1423, from: "Grand Canal", to: "San Polo", why: 'description: "in the San Polo district"' },
  { id: 1466, from: "Grand Canal", to: "Santa Croce", why: 'description: "a restored 16th-century palazzo in Santa Croce"' },
  { id: 1479, from: "Grand Canal", to: "San Marco", why: "sestiere not named in its description — from outside the data" },
  { id: 1484, from: "Grand Canal", to: "San Marco", why: "sestiere not named in its description — from outside the data" },
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
  `${URL_}/items/hotels?limit=-1&filter[id][_in]=${ids.join(",")}&fields=id,hotel_name,city,local_area`,
  { headers: H }
)).json();
const byId = new Map(rows.map((r) => [String(r.id), r])); // ids are strings (§44)

const planned = [];
const problems = [];

for (const fix of FIXES) {
  const row = byId.get(String(fix.id));
  if (!row) { problems.push(`${fix.id} — not found`); continue; }
  const current = String(row.local_area ?? "").trim();
  if (current === fix.to) { console.log(`  skip ${fix.id} ${row.hotel_name?.trim()} — already set`); continue; }
  if (current !== fix.from) {
    problems.push(`${fix.id} ${row.hotel_name?.trim()} — local_area is ${JSON.stringify(current)}, expected ${JSON.stringify(fix.from)}`);
    continue;
  }
  planned.push({ ...fix, name: row.hotel_name?.trim(), city: row.city });
}

console.log(`\n${CONFIRM ? "APPLYING" : "DRY RUN"} — local_area granularity\n`);
let city = "";
for (const p of planned) {
  if (p.city !== city) { city = p.city; console.log(`  ${city}`); }
  console.log(`    [${p.id}] ${p.name}`);
  console.log(`          ${JSON.stringify(p.from)} -> ${JSON.stringify(p.to)}`);
  console.log(`          ${p.why}`);
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
    method: "PATCH", headers: H, body: JSON.stringify({ local_area: p.to }),
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

/* Prove the cities now agree with themselves: no value should be a prefix of
 * another within the same city, which is what "Midtown" beside "Midtown East"
 * and "Giudecca" beside "Giudecca Island" both were. */
const { data: all } = await (await fetch(
  `${URL_}/items/hotels?limit=-1&fields=id,hotel_name,city,local_area`, { headers: H }
)).json();
const byCity = new Map();
for (const h of all) {
  const la = String(h.local_area ?? "").trim();
  const c = String(h.city ?? "").trim();
  if (!la || !c) continue;
  if (!byCity.has(c)) byCity.set(c, new Set());
  byCity.get(c).add(la);
}
const overlaps = [];
for (const [c, set] of byCity) {
  const vals = [...set];
  for (const a of vals) for (const b of vals) {
    if (a !== b && b.toLowerCase().startsWith(a.toLowerCase())) overlaps.push(`${c}: ${JSON.stringify(a)} is a prefix of ${JSON.stringify(b)}`);
  }
}
console.log(`\n  Sweep of ${all.length} rows — values that are a prefix of a sibling in the same city: ${overlaps.length}`);
for (const o of overlaps) console.log("     " + o);
console.log(`\n  Applied ${applied.length}, failed ${failed}. Rollback appended.\n`);
process.exitCode = failed ? 1 : 0;
}
}
