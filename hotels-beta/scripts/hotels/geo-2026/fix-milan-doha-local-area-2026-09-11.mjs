#!/usr/bin/env node
/* The last three `local_area` values that would not pass their own rules.
 *
 * All three were noticed while checking siblings during earlier passes and
 * recorded rather than changed, because they were outside those passes' scope.
 * This closes them.
 *
 *   1467  Park Hyatt Milan   "Piazza del Duomo" -> "Duomo"
 *         A square. "Sits just off Piazza del Duomo, beside the Galleria" —
 *         just off it, and Duomo is the quartiere the square sits in (Milan's
 *         NIL 1). Grosvenor Square -> Mayfair, for the third time.
 *
 *   1465  Palazzo Parigi     "Borgonuovo" -> "Brera"
 *         DOUBLY WRONG, which is why it is worth the words: Borgonuovo is a
 *         street, AND it is not this hotel's street. Its own text says the
 *         hotel "occupies Corso di Porta Nuova" — a different road entirely.
 *         Via Borgonuovo runs through Brera, so whoever entered it was
 *         thinking of the right district and wrote down a road inside it.
 *         Tier B: the description says "between Brera, Porta Nuova and Milan's
 *         fashion district", naming three and claiming none, which is the
 *         shape left FOR REVIEW at Four Seasons Marrakech. It is resolved here
 *         rather than deferred because two independent things point the same
 *         way — the coordinates (45.4734,9.1911) sit on Brera's northern edge,
 *         well south of Principe di Savoia's Porta Nuova at 45.4798, and the
 *         stored street is itself in Brera. It joins Grand Hotel et de Milan,
 *         which already holds the value.
 *
 *   2028  Mandarin Oriental Doha  "Msheireb Downtown Doha" -> "Msheireb"
 *         A development name — "set on Barahat Msheireb Street IN Msheireb
 *         Downtown Doha, the regenerated cultural and lifestyle quarter". The
 *         quarter is Msheireb; "Downtown Doha" is the project's branding. The
 *         UpperHills rule, and the seventh time it has decided a row.
 *
 * After this, Milan reads Duomo · Brera x2 · Quadrilatero della Moda x4 ·
 * Porta Nuova, and Doha reads Msheireb · West Bay. No value in either city is
 * a street, a square or a development.
 *
 * A ONE-TIME RECORD (§24).
 *
 *   node fix-milan-doha-local-area-2026-09-11.mjs              # dry run
 *   node fix-milan-doha-local-area-2026-09-11.mjs --confirm    # writes
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROLLBACK = path.join(HERE, "fix-milan-doha-local-area-2026-09-11-rollback.json");
const CONFIRM = process.argv.includes("--confirm");

const FIXES = [
  { id: 1467, city: "Milan", from: "Piazza del Duomo", to: "Duomo", tier: "A",
    why: '"sits just off Piazza del Duomo" — a square; Duomo is the quartiere' },
  { id: 1465, city: "Milan", from: "Borgonuovo", to: "Brera", tier: "B",
    why: "a street, and not even this hotel's street — its text says Corso di Porta Nuova" },
  { id: 2028, city: "Doha", from: "Msheireb Downtown Doha", to: "Msheireb", tier: "A",
    why: '"in Msheireb Downtown Doha, the regenerated ... quarter" — the quarter is Msheireb' },
];

/* Asserted, never written: the sibling that makes "Brera" a house value rather
 * than an invention. */
const PRECEDENT = { id: 1442, name: "Grand Hotel et de Milan", local_area: "Brera" };

const URL_ = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const TOKEN = process.env.DIRECTUS_TOKEN;
if (!URL_ || !TOKEN) {
  console.error("Set DIRECTUS_URL and DIRECTUS_TOKEN.");
  process.exitCode = 1;
} else {

const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
const FIELDS = "id,hotel_name,city,local_area,published";
const ids = [...FIXES.map((f) => f.id), PRECEDENT.id];
const { data: rows } = await (await fetch(
  `${URL_}/items/hotels?limit=-1&filter[id][_in]=${ids.join(",")}&fields=${FIELDS}`, { headers: H }
)).json();
const byId = new Map(rows.map((r) => [String(r.id), r])); // ids are strings (§44)
const norm = (v) => { const s = String(v ?? "").trim(); return s === "" ? null : s; };

const planned = [];
const problems = [];

const prec = byId.get(String(PRECEDENT.id));
if (!prec) problems.push(`${PRECEDENT.id} ${PRECEDENT.name} — not found`);
else if (norm(prec.local_area) !== PRECEDENT.local_area) {
  problems.push(`${PRECEDENT.id} ${PRECEDENT.name} — holds ${JSON.stringify(norm(prec.local_area))}, expected ${JSON.stringify(PRECEDENT.local_area)}. "Brera" is no longer a house value; re-decide 1465.`);
}

for (const fix of FIXES) {
  const row = byId.get(String(fix.id));
  if (!row) { problems.push(`${fix.id} — not found`); continue; }
  if (norm(row.city) !== fix.city) {
    problems.push(`${fix.id} ${norm(row.hotel_name)} — city is ${JSON.stringify(norm(row.city))}, expected ${JSON.stringify(fix.city)}`);
    continue;
  }
  const current = norm(row.local_area);
  if (current === fix.to) { console.log(`  skip ${fix.id} ${norm(row.hotel_name)} — already set`); continue; }
  if (current !== fix.from) {
    problems.push(`${fix.id} ${norm(row.hotel_name)} — local_area is ${JSON.stringify(current)}, expected ${JSON.stringify(fix.from)}`);
    continue;
  }
  planned.push({ ...fix, name: norm(row.hotel_name) });
}

console.log(`\n${CONFIRM ? "APPLYING" : "DRY RUN"} — the last three\n`);
for (const p of planned) {
  console.log(`  [${p.id}] ${p.name} (${p.city})   [${p.tier}]`);
  console.log(`        ${JSON.stringify(p.from)} -> ${JSON.stringify(p.to)}`);
  console.log(`        ${p.why}`);
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

const { data: all } = await (await fetch(
  `${URL_}/items/hotels?limit=-1&fields=${FIELDS}`, { headers: H }
)).json();
const V = (h) => norm(h.local_area) ?? "";
for (const c of ["Milan", "Doha"]) {
  const vals = all.filter((h) => norm(h.city) === c).map((h) => V(h) || "(empty)").sort();
  console.log(`\n  ${c}: ${vals.join(" · ")}`);
}
console.log(`\n  Applied ${applied.length}, failed ${failed}. Rollback appended.`);
console.log("  Run audit-local-area.mjs for the full picture.\n");
process.exitCode = failed ? 1 : 0;
}
}
