#!/usr/bin/env node
/* Belmond Villa Sant'Andrea is in Taormina.
 *
 *   2010  city        "Mazzarò"       -> "Taormina"
 *         local_area  "Taormina Mare" -> "Mazzarò"
 *
 * ON INSTRUCTION (Ulrik, 2026-09-23: "if Taormina is the natural association
 * then set city to Taormina"). Found in concierge testing: asked to "go with
 * Taormina", the concierge's two Taormina hotels sat in two different cities,
 * so the destination could not be read from the records, and a Taormina city
 * search on the Hotels page missed this one entirely.
 *
 * THE EVIDENCE IS THE HOTEL'S OWN TEXT: it "rests on the Bay of Mazzarò in
 * Taormina Mare". Mazzarò is Taormina's beach below the town, a frazione of the
 * comune, joined to it by the cable car the description mentions. So the town
 * is `city` and the bay is the finer district, which is what `local_area` is
 * for (§3: strictly sub-city). "Taormina Mare" is not kept: under city
 * Taormina it is a prefix overlap, and Mazzarò is both finer and the name the
 * description gives the hotel's own bay.
 *
 * `state_province_county_island` and `admin_region` stay "Sicily", matching
 * San Domenico Palace and Grand Hotel Timeo in Taormina.
 *
 * AFTER THIS, IN THE SAME PASS (§3: a city is a join key): rebuild
 * cityAirports.ts, so "Mazzarò" leaves it (Taormina is already a key, with
 * CTA), and drop the dead "Mazzarò|…" rows from transferTimes.ts; then run
 * audit-airports.mjs and audit-local-area.mjs.
 *
 * A ONE-TIME RECORD (§24).
 *
 *   node --env-file=.env.local scripts/hotels/geo-2026/fix-mazzaro-city-2026-09-23.mjs            # dry run
 *   node --env-file=.env.local scripts/hotels/geo-2026/fix-mazzaro-city-2026-09-23.mjs --confirm  # writes
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROLLBACK = path.join(HERE, "fix-mazzaro-city-2026-09-23-rollback.json");
const CONFIRM = process.argv.includes("--confirm");

const FIX = {
  id: 2010,
  fromCity: "Mazzarò",
  toCity: "Taormina",
  fromLocalArea: "Taormina Mare",
  toLocalArea: "Mazzarò",
  evidence: /Bay of Mazzar[oò] in Taormina/i,
};
/* Asserted, never written: the rows already in Taormina. */
const TAORMINA = [1475, 1446];

const URL_ = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const TOKEN = process.env.DIRECTUS_TOKEN;
if (!URL_ || !TOKEN) {
  console.error("Set DIRECTUS_URL and DIRECTUS_TOKEN.");
  process.exitCode = 1;
} else {

const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
const FIELDS = "id,hotel_name,published,country,admin_region,state_province_county_island,city,local_area,description";
const readAll = async () =>
  (await (await fetch(`${URL_}/items/hotels?limit=-1&fields=${FIELDS}`, { headers: H })).json()).data;
const rows = await readAll();
const byId = new Map(rows.map((r) => [String(r.id), r])); // ids are strings (§44)
const norm = (v) => { const s = String(v ?? "").trim(); return s === "" ? null : s; };

const problems = [];
let write = false;

for (const id of TAORMINA) {
  const row = byId.get(String(id));
  if (!row) problems.push(`${id} — not found`);
  else if (norm(row.city) !== "Taormina") {
    problems.push(`${id} ${norm(row.hotel_name)} — expected city "Taormina", found ${JSON.stringify(norm(row.city))}`);
  }
}

const row = byId.get(String(FIX.id));
if (!row) problems.push(`${FIX.id} — not found`);
else {
  const city = norm(row.city);
  if (city === FIX.toCity) console.log(`  skip ${FIX.id} — city is already ${JSON.stringify(FIX.toCity)}`);
  else if (city !== FIX.fromCity) problems.push(`${FIX.id} — city is ${JSON.stringify(city)}, expected ${JSON.stringify(FIX.fromCity)}`);
  else if (norm(row.local_area) !== FIX.fromLocalArea) {
    problems.push(`${FIX.id} — local_area is ${JSON.stringify(norm(row.local_area))}, expected ${JSON.stringify(FIX.fromLocalArea)}`);
  } else if (!FIX.evidence.test(String(row.description ?? ""))) {
    problems.push(`${FIX.id} — its description no longer places it on the Bay of Mazzarò in Taormina; re-check the basis`);
  } else write = true;
}
const others = rows.filter((r) => norm(r.city) === FIX.fromCity && String(r.id) !== String(FIX.id));
if (others.length) problems.push(`other rows also use city "Mazzarò": ${others.map((r) => r.id).join(", ")} — decide them too`);

console.log(`\n${CONFIRM ? "APPLYING" : "DRY RUN"} — Villa Sant'Andrea moves to city Taormina\n`);
if (write) {
  console.log(`  [${FIX.id}] ${norm(row.hotel_name)}  (published=${row.published})`);
  console.log(`        city ${JSON.stringify(FIX.fromCity)} -> ${JSON.stringify(FIX.toCity)}`);
  console.log(`        local_area ${JSON.stringify(FIX.fromLocalArea)} -> ${JSON.stringify(FIX.toLocalArea)}`);
}
console.log(`  ${TAORMINA.length} Taormina rows asserted unchanged`);

if (problems.length) {
  console.error(`\n  ABORTING:`);
  for (const p of problems) console.error("    " + p);
  process.exitCode = 1;
} else if (!CONFIRM) {
  console.log(`\n  Dry run — re-run with --confirm to write.\n`);
} else {

const applied = [];
let failed = 0;
if (write) {
  const body = { city: FIX.toCity, local_area: FIX.toLocalArea };
  const r = await fetch(`${URL_}/items/hotels/${FIX.id}`, {
    method: "PATCH", headers: H, body: JSON.stringify(body),
  });
  if (!r.ok) { console.error(`  FAILED ${FIX.id}: ${r.status} ${await r.text()}`); failed += 1; }
  else {
    applied.push({ id: String(FIX.id),
      before: { city: FIX.fromCity, local_area: FIX.fromLocalArea },
      after: body });
    console.log(`  ok ${FIX.id}`);
  }
}

let log = [];
if (fs.existsSync(ROLLBACK)) {
  try { log = JSON.parse(fs.readFileSync(ROLLBACK, "utf8")); } catch { log = []; }
}
log.push({ at: new Date().toISOString(), changes: applied });
fs.writeFileSync(ROLLBACK, JSON.stringify(log, null, 2), "utf8");

// Independent readback of the whole collection.
const all = await readAll();
const after = all.find((h) => String(h.id) === String(FIX.id));
const taormina = all.filter((h) => norm(h.city) === "Taormina");
const echoes = all.filter((h) => norm(h.local_area) && norm(h.local_area) === norm(h.city));
console.log(`\n  Readback: city=${JSON.stringify(norm(after?.city))} local_area=${JSON.stringify(norm(after?.local_area))}`);
console.log(`  Rows in city Taormina: ${taormina.map((h) => `${h.id}${h.published ? "" : " (unpublished)"}`).join(", ")}`);
console.log(`  Rows still in city Mazzarò: ${all.filter((h) => norm(h.city) === FIX.fromCity).length}`);
console.log(`  local_area identical to city: ${echoes.length}`);
console.log(`\n  Applied ${applied.length}, failed ${failed}. Rollback appended. Now rebuild cityAirports.ts.`);
const ok = norm(after?.city) === FIX.toCity && norm(after?.local_area) === FIX.toLocalArea;
process.exitCode = failed || echoes.length || !ok ? 1 : 0;
}
}
