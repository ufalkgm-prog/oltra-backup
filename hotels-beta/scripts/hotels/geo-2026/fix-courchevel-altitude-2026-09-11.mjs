#!/usr/bin/env node
/* Courchevel's `city` must carry its altitude level.
 *
 *   2051  Rosewood Courchevel Le Jardin Alpin   city "Courchevel" -> "Courchevel 1850"
 *
 * Courchevel is not one resort with one address. It is a stack of villages at
 * different heights — 1850, Moriond (1650), Village (1550), Le Praz (1300),
 * La Tania — and which one a hotel sits in is among the first things a guest
 * asks, because it decides the ski access, the walk to dinner and the price.
 * A bare "Courchevel" throws that away.
 *
 * WHAT THE ROSTER ACTUALLY HOLDS. All ten Courchevel properties are at 1850,
 * and every one says so in its own description — "the Jardin Alpin quarter of
 * Courchevel 1850", "at the foot of the Bellecote piste in Courchevel 1850",
 * "rises in Courchevel 1850". Nine were already filed correctly. We hold
 * nothing at 1650, 1550, Le Praz or La Tania, so there is no further work
 * here; if a property is ever added at another level, its own level goes in
 * `city` rather than a bare "Courchevel".
 *
 * THIS REPAIRS A LOSS I CAUSED EARLIER TODAY. Before
 * `split-compound-local-area-2026-09-11.mjs`, row 2051 read
 * `local_area: "Jardin Alpin, Courchevel 1850"` with `city: "Courchevel"`.
 * Splitting that compound to "Jardin Alpin" was right for `local_area` — the
 * enclave is the finer district — but it left the row with NO trace of 1850
 * anywhere, because its city had never carried it. The altitude belonged in
 * `city` all along; the compound had been holding it in the wrong field.
 *
 * The two fields now divide cleanly: `city` carries the altitude village,
 * `local_area` the enclave inside it. Rosewood keeps "Jardin Alpin".
 *
 * AFTER THIS, "Courchevel" CEASES TO EXIST as a city value. Three consumers
 * follow, and they are handled in the same commit rather than left to drift
 * (§49 - geography values are join keys):
 *   - `cityAirports.ts`: rebuild. The "Courchevel" key disappears and all ten
 *     hotels land under "Courchevel 1850".
 *   - `build-city-airports.mjs`: the GATEWAY_OVERRIDE entry for plain
 *     "Courchevel" becomes dead and is removed.
 *   - `transferRoutes.ts`: same, its plain "Courchevel" route is removed.
 * `inspire/cityMetadata.ts` already keys on "Courchevel 1850" and gets MORE
 * correct: it never matched Rosewood before.
 *
 * A ONE-TIME RECORD (§24).
 *
 *   node fix-courchevel-altitude-2026-09-11.mjs              # dry run
 *   node fix-courchevel-altitude-2026-09-11.mjs --confirm    # writes
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROLLBACK = path.join(HERE, "fix-courchevel-altitude-2026-09-11-rollback.json");
const CONFIRM = process.argv.includes("--confirm");

const FIX = { id: 2051, from: "Courchevel", to: "Courchevel 1850" };

/* Asserted, never written: the nine already-correct rows. If one of these has
 * moved off 1850 the roster is no longer uniform and the sweep below would be
 * telling a different story than this header. */
const ALREADY_1850 = [1313, 1317, 1322, 1335, 1342, 1343, 1351, 1352, 1354];

const URL_ = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const TOKEN = process.env.DIRECTUS_TOKEN;
if (!URL_ || !TOKEN) {
  console.error("Set DIRECTUS_URL and DIRECTUS_TOKEN.");
  process.exitCode = 1;
} else {

const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
const FIELDS = "id,hotel_name,published,city,local_area,description";
const ids = [FIX.id, ...ALREADY_1850];
const { data: rows } = await (await fetch(
  `${URL_}/items/hotels?limit=-1&filter[id][_in]=${ids.join(",")}&fields=${FIELDS}`, { headers: H }
)).json();
const byId = new Map(rows.map((r) => [String(r.id), r])); // ids are strings (§44)
const norm = (v) => { const s = String(v ?? "").trim(); return s === "" ? null : s; };

const problems = [];
let write = false;

for (const id of ALREADY_1850) {
  const row = byId.get(String(id));
  if (!row) { problems.push(`${id} — not found`); continue; }
  if (norm(row.city) !== "Courchevel 1850") {
    problems.push(`${id} ${norm(row.hotel_name)} — expected city "Courchevel 1850", found ${JSON.stringify(norm(row.city))}`);
  }
}

const target = byId.get(String(FIX.id));
if (!target) problems.push(`${FIX.id} — not found`);
else {
  const current = norm(target.city);
  if (current === FIX.to) console.log(`  skip ${FIX.id} ${norm(target.hotel_name)} — already ${FIX.to}`);
  else if (current !== FIX.from) problems.push(`${FIX.id} — city is ${JSON.stringify(current)}, expected ${JSON.stringify(FIX.from)}`);
  else {
    // Its own description is the evidence; refuse if that has changed too.
    if (!/Courchevel 1850/i.test(String(target.description ?? ""))) {
      problems.push(`${FIX.id} — its description no longer says "Courchevel 1850"; re-check before writing`);
    } else write = true;
  }
}

console.log(`\n${CONFIRM ? "APPLYING" : "DRY RUN"} — Courchevel altitude on \`city\`\n`);
if (write) {
  console.log(`  [${FIX.id}] ${norm(target.hotel_name)}`);
  console.log(`        city ${JSON.stringify(FIX.from)} -> ${JSON.stringify(FIX.to)}`);
  console.log(`        local_area stays ${JSON.stringify(norm(target.local_area))} — the enclave inside 1850`);
  console.log(`        evidence: its own text says "sits at the top of Courchevel 1850"`);
}
console.log(`  ${ALREADY_1850.length} rows asserted already at "Courchevel 1850"`);

if (problems.length) {
  console.error(`\n  ABORTING:`);
  for (const p of problems) console.error("    " + p);
  console.error("");
  process.exitCode = 1;
} else if (!CONFIRM) {
  console.log(`\n  Dry run — re-run with --confirm to write.`);
  console.log("  Then: remove the dead plain-\"Courchevel\" entries and rebuild cityAirports.ts\n");
} else {

const applied = [];
let failed = 0;
if (write) {
  const r = await fetch(`${URL_}/items/hotels/${FIX.id}`, {
    method: "PATCH", headers: H, body: JSON.stringify({ city: FIX.to }),
  });
  if (!r.ok) { console.error(`  FAILED ${FIX.id}: ${r.status} ${await r.text()}`); failed += 1; }
  else { applied.push({ id: String(FIX.id), before: FIX.from, after: FIX.to }); console.log(`  ok ${FIX.id} -> ${FIX.to}`); }
}

let log = [];
if (fs.existsSync(ROLLBACK)) {
  try { log = JSON.parse(fs.readFileSync(ROLLBACK, "utf8")); } catch { log = []; }
}
log.push({ at: new Date().toISOString(), changes: applied });
fs.writeFileSync(ROLLBACK, JSON.stringify(log, null, 2), "utf8");

/* Sweep the whole collection: every Courchevel-area property must carry a
 * level, and no bare "Courchevel" may survive. */
const { data: all } = await (await fetch(
  `${URL_}/items/hotels?limit=-1&fields=${FIELDS}`, { headers: H }
)).json();
const inResort = all.filter((h) => /courchevel/i.test(norm(h.city) ?? "") ||
  /courchevel/i.test(norm(h.hotel_name) ?? ""));
const bare = inResort.filter((h) => norm(h.city) === "Courchevel");
const levels = new Map();
for (const h of inResort) {
  const c = norm(h.city) ?? "(none)";
  levels.set(c, (levels.get(c) ?? 0) + 1);
}

console.log(`\n  Sweep — Courchevel-area properties: ${inResort.length}`);
for (const [c, n] of [...levels].sort()) console.log(`     ${String(n).padStart(3)}  ${JSON.stringify(c)}`);
console.log(`     bare "Courchevel" remaining: ${bare.length}`);
for (const h of bare) console.log(`        [${h.id}] ${norm(h.hotel_name)}`);
console.log(`\n  Applied ${applied.length}, failed ${failed}. Rollback appended.`);
console.log("  NEXT: node scripts/airports/build-city-airports.mjs\n");
process.exitCode = failed || bare.length ? 1 : 0;
}
}
