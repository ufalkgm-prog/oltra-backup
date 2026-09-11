#!/usr/bin/env node
/* Batch 5 of the water-proximity setting clean-up (§42B), and the last one.
 *
 * `Beach` retires into `Beachfront`. The two were meant to separate "on the
 * sand" from "a road in between", but the distinction turned out to cost more
 * than it was worth: settling it needs a per-hotel judgement across 194 rows,
 * OSM cannot answer it for this roster, and our own editorial text says "across
 * the road" ZERO times in 268 descriptions. Ulrik's call was to collapse them.
 * `Beachfront` now means at or on the beach, without claiming how many metres.
 *
 * Before merging, the whole Beachfront+Beach set was checked for rows that are
 * not beach hotels at all — a cheap two-part text test:
 *
 *   A. never mentions beach/sand/shore/lagoon/cove   -> 0 of 201
 *   B. describes cliffs or rock with no beach of its own -> 10, of which NINE
 *      are false positives (Constance Lemuria has "three beaches", Palmilla's
 *      cliff is a restaurant, Amanwella has 800m of sand below its headland)
 *
 * The tenth is real and is fixed here: Emirates Wolgan Valley (1798) sits at
 * -33.25, 150.19 — a 7,000-acre conservancy in the Greater Blue Mountains,
 * three hours inland from Sydney, with its own highlights reading "Amazing
 * mountain views". Tagged Beachfront. `Mountains` replaces it, which is what
 * the row's own copy asserts; `Nature Reserve` would also fit the conservancy
 * and is left for Ulrik rather than assumed.
 *
 * A ONE-TIME RECORD (§24). Retiring the `Beach` choice itself is the companion
 * retire script, which must run after this.
 *
 *   node apply-beach-merge-batch5-2026-09-11.mjs              # dry run
 *   node apply-beach-merge-batch5-2026-09-11.mjs --confirm    # writes
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROLLBACK = path.join(HERE, "apply-beach-merge-batch5-2026-09-11-rollback.json");
const CONFIRM = process.argv.includes("--confirm");

const WATER = ["Beachfront", "Beach", "Oceanfront", "Waterfront", "Coastal"];
const OLD = "Beach";
const NEW = "Beachfront";

/* Not a beach hotel at all — the water tag goes and a real setting replaces it. */
const RETAG = {
  1798: { drop: "Beachfront", add: "Mountains",
          why: "Blue Mountains conservancy, 3 hours inland; its own highlights say mountain views" },
};

function toPgArrayLiteral(values) {
  if (!Array.isArray(values) || values.length === 0) return "{}";
  return `{${values
    .map((v) => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
    .join(",")}}`;
}

const URL_ = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const TOKEN = process.env.DIRECTUS_TOKEN;
if (!URL_ || !TOKEN) {
  console.error("Set DIRECTUS_URL and DIRECTUS_TOKEN.");
  process.exitCode = 1;
} else {

const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
// Published AND unpublished: batch 2 hid four rows behind a published filter,
// and the retire script that follows refuses if any survive.
const { data: all } = await (await fetch(
  `${URL_}/items/hotels?limit=-1&fields=id,hotel_name,setting,primary_setting,secondary_setting`,
  { headers: H }
)).json();

const planned = [];
const noops = [];

for (const row of all) {
  const id = Number(row.id);
  const before = {
    setting: row.setting ?? [],
    primary_setting: row.primary_setting ?? null,
    secondary_setting: row.secondary_setting ?? null,
  };

  const retag = RETAG[id];
  if (retag) {
    if (!before.setting.includes(retag.drop)) { noops.push(`${id} ${row.hotel_name?.trim()} — retag already applied`); continue; }
    const kept = before.setting.filter((v) => v !== retag.drop && v !== retag.add);
    const after = {
      setting: [...kept, retag.add],
      primary_setting: before.primary_setting === retag.drop ? retag.add : before.primary_setting,
      secondary_setting: before.secondary_setting === retag.drop ? null : before.secondary_setting,
    };
    planned.push({ id: String(id), name: row.hotel_name?.trim(), kind: "retag", note: retag.why, before, after });
    continue;
  }

  const carries =
    before.setting.includes(OLD) ||
    before.primary_setting === OLD ||
    before.secondary_setting === OLD;
  if (!carries) continue;

  const out = [];
  for (const tag of before.setting) {
    const v = tag === OLD ? NEW : tag;
    if (!out.includes(v)) out.push(v);
  }
  const after = {
    setting: out,
    primary_setting: before.primary_setting === OLD ? NEW : before.primary_setting,
    secondary_setting: before.secondary_setting === OLD ? NEW : before.secondary_setting,
  };
  if (after.secondary_setting === after.primary_setting) after.secondary_setting = null;

  planned.push({ id: String(id), name: row.hotel_name?.trim(), kind: "merge", before, after });
}

console.log(`\n${CONFIRM ? "APPLYING" : "DRY RUN"} — ${OLD} -> ${NEW}, plus one retag\n`);
for (const p of planned) {
  console.log(`  [${p.id}]${p.kind === "retag" ? " ‼" : "  "} ${p.name}`);
  if (p.note) console.log(`        ${p.note}`);
  console.log(`        setting   ${JSON.stringify(p.before.setting)} -> ${JSON.stringify(p.after.setting)}`);
  if (p.before.primary_setting !== p.after.primary_setting) {
    console.log(`        primary   ${p.before.primary_setting} -> ${p.after.primary_setting}`);
  }
  if (p.before.secondary_setting !== p.after.secondary_setting) {
    console.log(`        secondary ${p.before.secondary_setting} -> ${p.after.secondary_setting}`);
  }
}
for (const n of noops) console.log("  skip " + n);
console.log(`\n  ${planned.length} to change (${planned.filter((p) => p.kind === "merge").length} merges, ${planned.filter((p) => p.kind === "retag").length} retag), scanned ${all.length} rows.`);

if (!CONFIRM) {
  console.log("\n  Dry run. Re-run with --confirm to write.\n");
} else {

const applied = [];
let failed = 0;
for (const p of planned) {
  const r = await fetch(`${URL_}/items/hotels/${p.id}`, {
    method: "PATCH", headers: H,
    body: JSON.stringify({
      setting: toPgArrayLiteral(p.after.setting), // native text[] (§4)
      primary_setting: p.after.primary_setting,
      secondary_setting: p.after.secondary_setting,
    }),
  });
  if (!r.ok) {
    console.error(`  FAILED ${p.id}: ${r.status} ${await r.text()}`);
    failed += 1;
    continue;
  }
  applied.push(p);
  console.log(`  ok ${p.id} ${p.name}`);
}

let log = [];
if (fs.existsSync(ROLLBACK)) {
  try { log = JSON.parse(fs.readFileSync(ROLLBACK, "utf8")); } catch { log = []; }
}
log.push({ at: new Date().toISOString(), batch: "beach-merge-5", changes: applied });
fs.writeFileSync(ROLLBACK, JSON.stringify(log, null, 2), "utf8");

// Sweep the whole collection, not the rows touched — the check that caught
// four contradictory pairs batch 3's triage had missed.
const { data: fresh } = await (await fetch(
  `${URL_}/items/hotels?limit=-1&fields=id,hotel_name,setting`, { headers: H }
)).json();
const leftBeach = fresh.filter((h) => (h.setting ?? []).includes(OLD));
const pairs = fresh.filter((h) => (h.setting ?? []).filter((v) => WATER.includes(v)).length > 1);
console.log(`\n  Sweep of ${fresh.length} rows — still tagged ${OLD}: ${leftBeach.length}, carrying two water values: ${pairs.length}`);
for (const h of [...leftBeach, ...pairs]) console.log(`     [${h.id}] ${h.hotel_name?.trim()} ${JSON.stringify(h.setting)}`);

console.log(`\n  Applied ${applied.length}, failed ${failed}. Rollback appended.\n`);
process.exitCode = failed || leftBeach.length || pairs.length ? 1 : 0;
}
}
