#!/usr/bin/env node
/* Olarro Lodge's `city` is a street.
 *
 *   1011  city "Inakara Road" -> null
 *
 * Its own description says so: "sits high in the hills above Kenya's Loita
 * Plains, OFF INAKARA ROAD near Ngoswani Village in the Maasai Mara
 * ecosystem." A road is not a town, and §3's `city` holds a town or, for a
 * lodge, the reserve name.
 *
 * WHY BLANK RATHER THAN A VILLAGE NAME. Its text names Ngoswani, which is a
 * real settlement, so "Ngoswani" was available. It is not used, for two
 * reasons that agree:
 *
 *   - All FOUR of its siblings in the same reserve have a blank `city` —
 *     Bateleur, Kichwa Tembo, Angama Mara and Il Moran, each with
 *     `state_province_county_island: "Masai Mara"` doing the work. Olarro was
 *     the only one of the five carrying a city at all, and it carried the
 *     wrong kind of thing.
 *   - Ulrik settled this explicitly when the eight city-less wilderness lodges
 *     came up: the cities stay blank. Filling one now would reopen a closed
 *     decision, and inventing a one-hotel city key for a village nobody
 *     searches would need its own airport entry into the bargain.
 *
 * WHAT FOLLOWS, handled in the same commit (§49 - geography values are join
 * keys):
 *   - `cityAirports.ts`: rebuild. The "Inakara Road" key disappears and Olarro
 *     joins the four others under the "Masai Mara" traveller-area fallback,
 *     which already carries the Nairobi gateway override.
 *   - `build-city-airports.mjs`: the GATEWAY_OVERRIDE entry for "Inakara Road"
 *     becomes dead and is removed. It was added yesterday, one commit before
 *     this, to point that street at Nairobi — the right airport reached by the
 *     wrong key.
 *
 * A ONE-TIME RECORD (§24).
 *
 *   node fix-olarro-city-2026-09-12.mjs              # dry run
 *   node fix-olarro-city-2026-09-12.mjs --confirm    # writes
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROLLBACK = path.join(HERE, "fix-olarro-city-2026-09-12-rollback.json");
const CONFIRM = process.argv.includes("--confirm");

const FIX = { id: 1011, from: "Inakara Road", area: "Masai Mara" };
/* Asserted, never written: the four siblings whose blank city is the precedent.
 * If one of them has gained a city, the convention has changed and clearing
 * this row would make Olarro the odd one out in the other direction. */
const SIBLINGS = [1006, 1007, 1009, 1010];

const URL_ = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const TOKEN = process.env.DIRECTUS_TOKEN;
if (!URL_ || !TOKEN) {
  console.error("Set DIRECTUS_URL and DIRECTUS_TOKEN.");
  process.exitCode = 1;
} else {

const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
const FIELDS = "id,hotel_name,published,city,local_area,state_province_county_island,description";
const ids = [FIX.id, ...SIBLINGS];
const { data: rows } = await (await fetch(
  `${URL_}/items/hotels?limit=-1&filter[id][_in]=${ids.join(",")}&fields=${FIELDS}`, { headers: H }
)).json();
const byId = new Map(rows.map((r) => [String(r.id), r])); // ids are strings (§44)
const norm = (v) => { const s = String(v ?? "").trim(); return s === "" ? null : s; };

const problems = [];
let write = false;

for (const id of SIBLINGS) {
  const row = byId.get(String(id));
  if (!row) { problems.push(`${id} — not found`); continue; }
  if (norm(row.city) !== null) {
    problems.push(`${id} ${norm(row.hotel_name)} — expected a blank city as the precedent, found ${JSON.stringify(norm(row.city))}`);
  }
}

const row = byId.get(String(FIX.id));
if (!row) problems.push(`${FIX.id} — not found`);
else {
  const current = norm(row.city);
  if (current === null) console.log(`  skip ${FIX.id} ${norm(row.hotel_name)} — already blank`);
  else if (current !== FIX.from) problems.push(`${FIX.id} — city is ${JSON.stringify(current)}, expected ${JSON.stringify(FIX.from)}`);
  else if (norm(row.state_province_county_island) !== FIX.area) {
    problems.push(`${FIX.id} — area is ${JSON.stringify(norm(row.state_province_county_island))}, expected ${JSON.stringify(FIX.area)}; clearing city would leave it keyed to nothing`);
  } else if (!/Inakara Road/i.test(String(row.description ?? ""))) {
    problems.push(`${FIX.id} — its description no longer mentions Inakara Road; re-check the evidence`);
  } else write = true;
}

console.log(`\n${CONFIRM ? "APPLYING" : "DRY RUN"} — Olarro Lodge's street-as-city\n`);
if (write) {
  console.log(`  [${FIX.id}] ${norm(row.hotel_name)}`);
  console.log(`        city ${JSON.stringify(FIX.from)} -> null`);
  console.log(`        area stays ${JSON.stringify(norm(row.state_province_county_island))} and becomes its airport key`);
  console.log(`        evidence: "off Inakara Road near Ngoswani Village"`);
}
console.log(`  ${SIBLINGS.length} siblings asserted to have a blank city`);

if (problems.length) {
  console.error(`\n  ABORTING:`);
  for (const p of problems) console.error("    " + p);
  console.error("");
  process.exitCode = 1;
} else if (!CONFIRM) {
  console.log(`\n  Dry run — re-run with --confirm to write.`);
  console.log('  Then remove the dead "Inakara Road" override and rebuild cityAirports.ts\n');
} else {

const applied = [];
let failed = 0;
if (write) {
  const r = await fetch(`${URL_}/items/hotels/${FIX.id}`, {
    method: "PATCH", headers: H, body: JSON.stringify({ city: null }),
  });
  if (!r.ok) { console.error(`  FAILED ${FIX.id}: ${r.status} ${await r.text()}`); failed += 1; }
  else { applied.push({ id: String(FIX.id), before: FIX.from, after: null }); console.log(`  ok ${FIX.id} city cleared`); }
}

let log = [];
if (fs.existsSync(ROLLBACK)) {
  try { log = JSON.parse(fs.readFileSync(ROLLBACK, "utf8")); } catch { log = []; }
}
log.push({ at: new Date().toISOString(), changes: applied });
fs.writeFileSync(ROLLBACK, JSON.stringify(log, null, 2), "utf8");

/* Sweep the whole collection: no `city` should look like a street, and the
 * Mara five should now agree with each other. */
const { data: all } = await (await fetch(
  `${URL_}/items/hotels?limit=-1&fields=${FIELDS}`, { headers: H }
)).json();
const STREETY = /\b(road|rd|street|st\.?|avenue|ave|lane|drive|boulevard|via|rue|calle|strada|corso)\b/i;
const streets = all.filter((h) => norm(h.city) && STREETY.test(norm(h.city)));
const mara = all.filter((h) => norm(h.state_province_county_island) === "Masai Mara");

console.log(`\n  Sweep of ${all.length} rows`);
console.log(`     city values that look like a street: ${streets.length}`);
for (const h of streets) console.log(`        [${h.id}] ${norm(h.hotel_name)} city=${JSON.stringify(norm(h.city))}`);
console.log(`     Masai Mara rows: ${mara.length}, with a city: ${mara.filter((h) => norm(h.city)).length}`);
console.log(`\n  Applied ${applied.length}, failed ${failed}. Rollback appended.`);
console.log("  NEXT: node scripts/airports/build-city-airports.mjs\n");
process.exitCode = failed || streets.length ? 1 : 0;
}
}
