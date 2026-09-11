#!/usr/bin/env node
/* Two name corrections in `local_area`, from the coverage screen.
 *
 * A MISSPELLING, on both New York rows that use the district:
 *   1688  Gansevoort Meatpacking NYC   Meatpackling -> Meatpacking District
 *   1709  Soho House New York          Meatpackling -> Meatpacking District
 *
 * AND AN INVERSION. The two Sohos are different places with different
 * capitalisation, and the collection had them the wrong way round:
 *   1284  Chateau Denmark, London      "SoHo" -> "Soho"
 *   1720  The Dominick, New York       "Soho" -> "SoHo"
 *
 * New York's is SoHo, short for South of Houston Street — the capital H is the
 * abbreviation, not styling. London's Soho is an ordinary place name and takes
 * none. Left alone they are near-duplicates that a case-insensitive grouping
 * merges and a case-sensitive filter splits, which is the worst of both.
 *
 * `from` is asserted against the stored value before writing, so a line edited
 * by hand aborts the run instead of being overwritten (§0's anchor principle
 * applied to data).
 *
 * A ONE-TIME RECORD (§24).
 *
 *   node fix-local-area-names-2026-09-11.mjs              # dry run
 *   node fix-local-area-names-2026-09-11.mjs --confirm    # writes
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROLLBACK = path.join(HERE, "fix-local-area-names-2026-09-11-rollback.json");
const CONFIRM = process.argv.includes("--confirm");

const FIXES = [
  { id: 1688, from: "Meatpackling District", to: "Meatpacking District", why: "misspelling" },
  { id: 1709, from: "Meatpackling District", to: "Meatpacking District", why: "misspelling" },
  { id: 1284, from: "SoHo", to: "Soho", why: "London's Soho takes no capital H" },
  { id: 1720, from: "Soho", to: "SoHo", why: "New York's SoHo is South of Houston" },
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
  if (current === fix.to) { console.log(`  skip ${fix.id} ${row.hotel_name?.trim()} — already correct`); continue; }
  // Case matters here, so compare exactly — a case-insensitive check would
  // treat the inversion as "already correct" and write nothing.
  if (current !== fix.from) {
    problems.push(`${fix.id} ${row.hotel_name?.trim()} — local_area is ${JSON.stringify(current)}, expected ${JSON.stringify(fix.from)}`);
    continue;
  }
  planned.push({ ...fix, name: row.hotel_name?.trim(), city: row.city });
}

console.log(`\n${CONFIRM ? "APPLYING" : "DRY RUN"} — local_area name corrections\n`);
for (const p of planned) {
  console.log(`  [${p.id}] ${p.name}  (${p.city})`);
  console.log(`        ${JSON.stringify(p.from)} -> ${JSON.stringify(p.to)}   — ${p.why}`);
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

/* Verify across the whole collection: no misspelling anywhere, and each Soho
 * spelling in exactly the right city. */
const { data: all } = await (await fetch(
  `${URL_}/items/hotels?limit=-1&fields=id,hotel_name,city,local_area`, { headers: H }
)).json();
const V = (h) => String(h.local_area ?? "").trim();
const typos = all.filter((h) => /meatpackling/i.test(V(h)));
const wrongSoho = all.filter((h) => /^soho$/i.test(V(h)) &&
  !((h.city === "New York" && V(h) === "SoHo") || (h.city === "London" && V(h) === "Soho")));

console.log(`\n  Sweep of ${all.length} rows — misspellings left: ${typos.length}, Soho in the wrong case: ${wrongSoho.length}`);
for (const h of [...typos, ...wrongSoho]) console.log(`     [${h.id}] ${h.hotel_name?.trim()} ${JSON.stringify(V(h))} (${h.city})`);
console.log(`\n  Applied ${applied.length}, failed ${failed}. Rollback appended.\n`);
process.exitCode = failed || typos.length || wrongSoho.length ? 1 : 0;
}
}
