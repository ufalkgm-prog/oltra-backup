#!/usr/bin/env node
/* Rosewood Doha is in Lusail, which is its own city.
 *
 *   1593  city  "Doha" -> "Lusail"
 *         area  (empty) -> "Doha"
 *
 * REOPENING A SETTLED DECISION, ON INSTRUCTION. §51 filed this under "Settled,
 * so nobody re-opens them": Rosewood stays `city: "Doha"` because it is 10.8km
 * out, shares DOH, is named "Rosewood Doha", and does not distort the Doha
 * centroid the way the Ras Al Khaimah row distorted Dubai's. Ulrik asked for it
 * changed, so it is changed, and §51 is rewritten to say so rather than left
 * contradicting the data.
 *
 * THE FACT MY OWN NOTES DISAGREED ON, now measured: §3 said "~20km north in a
 * different municipality", §51 said "10.8km from central Doha". §51 was right —
 * 10.7km from Souq Waqif, 8.7km from the centroid of the other two Doha hotels,
 * 14.4km from DOH. §3's figure is corrected in the same commit. Neither section
 * was checked against the row when it was written, and they drifted apart.
 *
 * THE EVIDENCE IS THE HOTEL'S OWN TEXT: it "rises in Lusail's Marina District,
 * a new waterfront quarter NORTH OF CENTRAL DOHA", and Souq Waqif, Msheireb and
 * the Museum of Islamic Art are "reached ACROSS THE CITY". The description
 * treats Lusail as where it is and Doha as somewhere it looks at.
 *
 * WHY `area` GETS "Doha" AND THIS IS THE HALF THAT MATTERS. `city: "Lusail"`
 * alone would make a hotel called ROSEWOOD DOHA unfindable by searching Doha —
 * the destination dropdown narrows hotel > city > area > admin_region, and
 * "Doha" would no longer appear on this row at any level. §3 says the traveller
 * area is null for a major city "where `city` does the job"; here `city` stops
 * doing the job, because nobody types Lusail. So Doha moves up a level, which
 * is what the field is for: the Cernobbio/Lake Como shape exactly.
 *
 * That creates a value that is a `city` on two rows and an `area` on this one.
 * MEASURED BEFORE CHOOSING IT: 64 such collisions already exist — Zermatt,
 * Monte Carlo, Riviera Maya, Kruger, Los Cabos — so this follows the
 * collection's dominant pattern rather than introducing a shape. The dropdown
 * labels entries by type, so the two read as "Doha - City" and "Doha - Area".
 *
 * WHAT IS DELIBERATELY NOT TOUCHED:
 *
 *   - `admin_region` stays "Doha Municipality", and this is a FLAG, not a
 *     finding. Lusail is usually placed in Al Daayen, which would make this the
 *     Ras Al Khaimah shape where both fields were wrong — but Lusail Marina is
 *     the southernmost district, hard against West Bay Lagoon, and I cannot
 *     establish from anything here which side of the municipal line it falls.
 *     The field is LOCKED (292 choices, allowOther: false) and has no Al Daayen
 *     entry, so changing it means extending the list first (§3's order, since
 *     Directus does not validate writes and patching first renders the value
 *     blank in the admin UI and unselectable forever). Extending a locked
 *     vocabulary to a value I cannot verify is the wrong trade, and leaving it
 *     on Doha Municipality keeps the concierge's preferred narrowing axis —
 *     the one that is never null — pointing where a traveller thinks this hotel
 *     is. Flagged in §51 as the open half.
 *   - `local_area` stays "Lusail Marina". With `city: "Lusail"` it becomes a
 *     prefix overlap, which the audit reports as a CANDIDATE and not a defect —
 *     the Palm Jumeirah case, where the finer name legitimately contains the
 *     broader one. It is the district's actual name.
 *
 * NO AIRPORT REBUILD IS NEEDED AND THAT IS WORTH KNOWING: this row is
 * UNPUBLISHED, and build-city-airports.mjs filters `published=true`, so "Lusail"
 * becomes no key at all today. WHOEVER PUBLISHES 1593 MUST REBUILD — DOH is
 * 14.4km away so the answer will be right, but until the rebuild runs the
 * landing flight teaser resolves Lusail to nothing. audit-airports.mjs catches
 * exactly that as a DEFECT ("published destination with no airport entry"), so
 * the net exists; this note is so nobody is surprised by it.
 *
 * A ONE-TIME RECORD (§24).
 *
 *   node fix-lusail-city-2026-09-12.mjs              # dry run
 *   node fix-lusail-city-2026-09-12.mjs --confirm    # writes
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROLLBACK = path.join(HERE, "fix-lusail-city-2026-09-12-rollback.json");
const CONFIRM = process.argv.includes("--confirm");

const FIX = {
  id: 1593,
  fromCity: "Doha",
  toCity: "Lusail",
  fromArea: null,
  toArea: "Doha",
  localArea: "Lusail Marina",
  evidence: "Lusail",
};
/* Asserted, never written: the two hotels that really are in central Doha. If
 * either had moved to Lusail the sibling picture has changed and this row is no
 * longer the lone exception this script assumes. */
const CENTRAL_DOHA = [2028, 2038];

const URL_ = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const TOKEN = process.env.DIRECTUS_TOKEN;
if (!URL_ || !TOKEN) {
  console.error("Set DIRECTUS_URL and DIRECTUS_TOKEN.");
  process.exitCode = 1;
} else {

const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
const FIELDS = "id,hotel_name,published,country,admin_region,state_province_county_island,city,local_area,description";
const { data: rows } = await (await fetch(
  `${URL_}/items/hotels?limit=-1&fields=${FIELDS}`, { headers: H }
)).json();
const byId = new Map(rows.map((r) => [String(r.id), r])); // ids are strings (§44)
const norm = (v) => { const s = String(v ?? "").trim(); return s === "" ? null : s; };

const problems = [];
let write = false;

for (const id of CENTRAL_DOHA) {
  const row = byId.get(String(id));
  if (!row) { problems.push(`${id} — not found`); continue; }
  if (norm(row.city) !== "Doha") {
    problems.push(`${id} ${norm(row.hotel_name)} — expected city "Doha" as the sibling picture, found ${JSON.stringify(norm(row.city))}`);
  }
}

const row = byId.get(String(FIX.id));
if (!row) problems.push(`${FIX.id} — not found`);
else {
  const city = norm(row.city), area = norm(row.state_province_county_island);
  if (city === FIX.toCity) console.log(`  skip ${FIX.id} — city is already ${JSON.stringify(FIX.toCity)}`);
  else if (city !== FIX.fromCity) problems.push(`${FIX.id} — city is ${JSON.stringify(city)}, expected ${JSON.stringify(FIX.fromCity)}`);
  else if (area !== FIX.fromArea) problems.push(`${FIX.id} — area is ${JSON.stringify(area)}, expected empty; something already uses that slot`);
  else if (norm(row.local_area) !== FIX.localArea) {
    problems.push(`${FIX.id} — local_area is ${JSON.stringify(norm(row.local_area))}, expected ${JSON.stringify(FIX.localArea)}; the Lusail evidence has moved`);
  } else if (!new RegExp(FIX.evidence, "i").test(String(row.description ?? ""))) {
    problems.push(`${FIX.id} — its description no longer mentions Lusail; re-check the basis for this write`);
  } else write = true;
}

console.log(`\n${CONFIRM ? "APPLYING" : "DRY RUN"} — Rosewood Doha moves to Lusail\n`);
if (write) {
  console.log(`  [${FIX.id}] ${norm(row.hotel_name)}  (published=${row.published})`);
  console.log(`        city ${JSON.stringify(FIX.fromCity)} -> ${JSON.stringify(FIX.toCity)}`);
  console.log(`        area ${JSON.stringify(FIX.fromArea)} -> ${JSON.stringify(FIX.toArea)}   (so "Doha" still finds it)`);
  console.log(`        local_area stays ${JSON.stringify(FIX.localArea)}`);
  console.log(`        admin_region stays ${JSON.stringify(norm(row.admin_region))} — flagged, see the header`);
}
console.log(`  ${CENTRAL_DOHA.length} central-Doha siblings asserted unchanged`);

if (problems.length) {
  console.error(`\n  ABORTING:`);
  for (const p of problems) console.error("    " + p);
  console.error("");
  process.exitCode = 1;
} else if (!CONFIRM) {
  console.log(`\n  Dry run — re-run with --confirm to write.\n`);
} else {

const applied = [];
let failed = 0;
if (write) {
  const body = { city: FIX.toCity, state_province_county_island: FIX.toArea };
  const r = await fetch(`${URL_}/items/hotels/${FIX.id}`, {
    method: "PATCH", headers: H, body: JSON.stringify(body),
  });
  if (!r.ok) { console.error(`  FAILED ${FIX.id}: ${r.status} ${await r.text()}`); failed += 1; }
  else {
    applied.push({ id: String(FIX.id),
      before: { city: FIX.fromCity, state_province_county_island: FIX.fromArea },
      after: body });
    console.log(`  ok ${FIX.id} city -> Lusail, area -> Doha`);
  }
}

let log = [];
if (fs.existsSync(ROLLBACK)) {
  try { log = JSON.parse(fs.readFileSync(ROLLBACK, "utf8")); } catch { log = []; }
}
log.push({ at: new Date().toISOString(), changes: applied });
fs.writeFileSync(ROLLBACK, JSON.stringify(log, null, 2), "utf8");

/* Sweep the WHOLE collection, not the row (§42B). Three things: no row may
 * carry `local_area` identical to its `city` (the echo defect), Doha must still
 * be reachable, and no PUBLISHED row may now sit in a city with no airport. */
const { data: all } = await (await fetch(
  `${URL_}/items/hotels?limit=-1&fields=${FIELDS}`, { headers: H }
)).json();
const echoes = all.filter((h) => norm(h.local_area) && norm(h.local_area) === norm(h.city));
const dohaReach = all.filter((h) =>
  norm(h.city) === "Doha" || norm(h.state_province_county_island) === "Doha");
const lusail = all.filter((h) => norm(h.city) === "Lusail");

const ca = fs.readFileSync(path.join(HERE, "..", "..", "..", "src", "lib", "cityAirports.ts"), "utf8");
const publishedNoAirport = all.filter((h) => {
  if (!h.published) return false;
  const key = norm(h.city) ?? norm(h.state_province_county_island);
  return key && !ca.includes(`"${key}": [`);
});

console.log(`\n  Sweep of ${all.length} rows`);
console.log(`     local_area identical to city: ${echoes.length}`);
console.log(`     rows reachable by "Doha" (city or area): ${dohaReach.length}`);
for (const h of dohaReach) console.log(`        [${h.id}] ${norm(h.hotel_name)} city=${JSON.stringify(norm(h.city))} area=${JSON.stringify(norm(h.state_province_county_island))}`);
console.log(`     rows in city "Lusail": ${lusail.length} (published: ${lusail.filter((h) => h.published).length})`);
console.log(`     published rows whose city/area has no airport entry: ${publishedNoAirport.length}`);
for (const h of publishedNoAirport) console.log(`        [${h.id}] ${norm(h.hotel_name)} -> ${JSON.stringify(norm(h.city) ?? norm(h.state_province_county_island))}`);
if (lusail.some((h) => h.published) && !ca.includes('"Lusail": [')) {
  console.log(`\n     NOTE: Lusail is now published and has no airport entry — rebuild cityAirports.ts.`);
}
console.log(`\n  Applied ${applied.length}, failed ${failed}. Rollback appended.`);
process.exitCode = failed || echoes.length || publishedNoAirport.length ? 1 : 0;
}
}
