#!/usr/bin/env node
/* The five Courchevel 1850 hotels whose own text places them in Jardin Alpin.
 *
 *   1313  Airelles Courchevel     "sits in the Jardin Alpin quarter of Courchevel 1850"
 *   1317  Aman Le Melezin         "directly on the Bellecote piste in the Jardin Alpin"
 *   1322  Cheval Blanc Courchevel "in Courchevel 1850's Jardin Alpin"
 *   1343  Hotel le Saint Roch     "Set on the Bellecote piste in the Jardin Alpin area"
 *   1352  L'Apogee Courchevel     "in the Jardin Alpin quarter of Courchevel 1850"
 *
 * All tier A — the district is named in the property's own description, which
 * is the strongest evidence this collection holds. The script does not just
 * quote that, it ASSERTS it: each row is checked for "Jardin Alpin" in its
 * description before the value is written, so if the editorial changes the
 * basis for the write is gone and the run aborts.
 *
 * 1343 is UNPUBLISHED and included anyway. An unpublished row with a gap is
 * the one nobody notices later (§42B's freshwater lesson, where scoping to
 * published left four rows carrying a retired value).
 *
 * WHY THIS ONLY BECAME VISIBLE TODAY. Jardin Alpin sits inside Courchevel
 * 1850, and until this morning Rosewood was filed under a bare "Courchevel"
 * while these five were under "Courchevel 1850" — two city values for one
 * resort, so the coverage report never showed them as one partly-filled city.
 * Correcting Rosewood's altitude surfaced the gap: 1 of 10.
 *
 * THE FOUR LEFT EMPTY, and they are not an oversight. Fouquet's and Le Lana
 * place themselves on the Bellecote PISTE, La Sivoliere on Route des Chenus
 * and Le K2 on Rue des Clarines. A piste and a street are not districts — the
 * Park Lane rule — and none of the four names an enclave, so there is nothing
 * to promote. Courchevel 1850 finishes at 6 of 10 and that is complete.
 *
 * A ONE-TIME RECORD (§24).
 *
 *   node fill-jardin-alpin-2026-09-11.mjs              # dry run
 *   node fill-jardin-alpin-2026-09-11.mjs --confirm    # writes
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROLLBACK = path.join(HERE, "fill-jardin-alpin-2026-09-11-rollback.json");
const CONFIRM = process.argv.includes("--confirm");

const VALUE = "Jardin Alpin";
const IDS = [1313, 1317, 1322, 1343, 1352];

/* Asserted empty, never written: the four whose text names a piste or a street
 * rather than an enclave. A value appearing here means someone decided
 * otherwise, and this script's header would then be wrong. */
const KEEP_EMPTY = {
  1335: "Fouquet's Courchevel — places itself on the Bellecote piste",
  1342: "Hotel Le Lana — the Bellecote piste",
  1351: "La Sivoliere — Route des Chenus, a street",
  1354: "Le K2 Palace — Rue des Clarines, a street",
};

const URL_ = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const TOKEN = process.env.DIRECTUS_TOKEN;
if (!URL_ || !TOKEN) {
  console.error("Set DIRECTUS_URL and DIRECTUS_TOKEN.");
  process.exitCode = 1;
} else {

const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
const FIELDS = "id,hotel_name,published,city,local_area,description";
const ids = [...IDS, ...Object.keys(KEEP_EMPTY).map(Number)];
const { data: rows } = await (await fetch(
  `${URL_}/items/hotels?limit=-1&filter[id][_in]=${ids.join(",")}&fields=${FIELDS}`, { headers: H }
)).json();
const byId = new Map(rows.map((r) => [String(r.id), r])); // ids are strings (§44)
const norm = (v) => { const s = String(v ?? "").trim(); return s === "" ? null : s; };

const planned = [];
const problems = [];

for (const [id, note] of Object.entries(KEEP_EMPTY)) {
  const row = byId.get(String(id));
  if (!row) { problems.push(`${id} — not found`); continue; }
  if (norm(row.local_area) !== null) {
    problems.push(`${id} ${norm(row.hotel_name)} — meant to stay empty, holds ${JSON.stringify(norm(row.local_area))} (${note})`);
  }
}

for (const id of IDS) {
  const row = byId.get(String(id));
  if (!row) { problems.push(`${id} — not found`); continue; }
  if (norm(row.city) !== "Courchevel 1850") {
    problems.push(`${id} ${norm(row.hotel_name)} — city is ${JSON.stringify(norm(row.city))}, expected "Courchevel 1850"`);
    continue;
  }
  const current = norm(row.local_area);
  if (current === VALUE) { console.log(`  skip ${id} ${norm(row.hotel_name)} — already set`); continue; }
  if (current !== null) {
    problems.push(`${id} ${norm(row.hotel_name)} — expected empty, holds ${JSON.stringify(current)}`);
    continue;
  }
  // The evidence, asserted rather than quoted.
  if (!/jardin alpin/i.test(String(row.description ?? ""))) {
    problems.push(`${id} ${norm(row.hotel_name)} — its description no longer says "Jardin Alpin"; the basis for this write is gone`);
    continue;
  }
  planned.push({ id: String(id), name: norm(row.hotel_name), published: row.published });
}

console.log(`\n${CONFIRM ? "APPLYING" : "DRY RUN"} — Jardin Alpin, Courchevel 1850\n`);
for (const p of planned) {
  console.log(`  [${p.id}] ${p.name}${p.published ? "" : "  (unpublished)"}  ->  ${JSON.stringify(VALUE)}`);
}
console.log(`\n  Staying empty on purpose: ${Object.keys(KEEP_EMPTY).length}`);
for (const [id, note] of Object.entries(KEEP_EMPTY)) console.log(`    [${id}] ${note}`);

if (problems.length) {
  console.error(`\n  ABORTING:`);
  for (const p of problems) console.error("    " + p);
  console.error("");
  process.exitCode = 1;
} else if (!CONFIRM) {
  console.log(`\n  ${planned.length} to fill, all tier A. Dry run — re-run with --confirm to write.\n`);
} else {

const applied = [];
let failed = 0;
for (const p of planned) {
  const r = await fetch(`${URL_}/items/hotels/${p.id}`, {
    method: "PATCH", headers: H, body: JSON.stringify({ local_area: VALUE }),
  });
  if (!r.ok) { console.error(`  FAILED ${p.id}: ${r.status} ${await r.text()}`); failed += 1; continue; }
  applied.push(p);
  console.log(`  ok ${p.id} ${p.name}`);
}

let log = [];
if (fs.existsSync(ROLLBACK)) {
  try { log = JSON.parse(fs.readFileSync(ROLLBACK, "utf8")); } catch { log = []; }
}
log.push({ at: new Date().toISOString(), value: VALUE, changes: applied });
fs.writeFileSync(ROLLBACK, JSON.stringify(log, null, 2), "utf8");

// Sweep the whole collection, not the rows touched.
const { data: all } = await (await fetch(
  `${URL_}/items/hotels?limit=-1&fields=${FIELDS}`, { headers: H }
)).json();
const V = (h) => norm(h.local_area) ?? "";
const courch = all.filter((h) => norm(h.city) === "Courchevel 1850");
const compound = all.filter((h) => V(h) && (/[,/()]/.test(V(h)) || / and /i.test(V(h))));
const echo = all.filter((h) => V(h) && V(h) === norm(h.city));
const populated = all.filter((h) => V(h)).length;

console.log(`\n  Sweep of ${all.length} rows`);
console.log(`     Courchevel 1850: ${courch.filter((h) => V(h)).length}/${courch.length} populated`);
for (const h of courch.sort((a, b) => Number(a.id) - Number(b.id))) {
  console.log(`        [${h.id}] ${String(norm(h.hotel_name)).padEnd(38)} ${JSON.stringify(V(h) || null)}`);
}
console.log(`     compound values:           ${compound.length}`);
console.log(`     local_area repeating city: ${echo.length}`);
console.log(`     local_area populated:      ${populated}`);
console.log(`\n  Applied ${applied.length}, failed ${failed}. Rollback appended.\n`);
process.exitCode = failed || compound.length || echo.length ? 1 : 0;
}
}
