#!/usr/bin/env node
/* Batch 3 of the water-proximity setting clean-up (§42B): the 99 hotels tagged
 * `Coastal` or `Oceanfront`, checked against the rule separating them.
 *
 *   Oceanfront  on the ocean but not a beach, incl. a clifftop a limited
 *               distance above it
 *   Coastal     near the ocean but NOT on it — 20+ minutes from the water
 *
 * No value retires here. 86 read as correct and were confirmed unchanged; 13
 * had a description that contradicted the tag and were decided individually.
 *
 * FOUR OF THEM CARRIED TWO WATER VALUES AT ONCE, which cannot both hold — a
 * hotel is not simultaneously on the sand and twenty minutes from the water.
 * Those rows keep the chosen value and lose the other, the same shape as
 * Mandarin Oriental Mallorca in batch 4. This is the failure mode worth
 * remembering: a wrong tag is visible, a contradictory PAIR is not, because
 * each half looks defensible on its own.
 *
 * Water tags only. `["City","Oceanfront"]` keeps `City`.
 * A ONE-TIME RECORD (§24).
 *
 *   node apply-coastal-oceanfront-batch3-2026-09-11.mjs              # dry run
 *   node apply-coastal-oceanfront-batch3-2026-09-11.mjs --confirm    # writes
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROLLBACK = path.join(HERE, "apply-coastal-oceanfront-batch3-2026-09-11-rollback.json");
const CONFIRM = process.argv.includes("--confirm");

/** Every water value. The chosen one replaces whichever of these the row has. */
const WATER = ["Beachfront", "Beach", "Oceanfront", "Waterfront", "Coastal"];

const DECISIONS = {
  // --- carried two contradictory water values; keep one, drop the other ---
  2032: "Beachfront",  // FS Maui at Wailea      was Beachfront + Oceanfront
  2041: "Beachfront",  // FS Sharm El Sheikh     was Beachfront + Coastal
  3021: "Beachfront",  // FS AMAALA Triple Bay   was Beachfront + Coastal
  3027: "Beachfront",  // Six Senses AMAALA      was Beachfront + Coastal

  // --- tagged Coastal, but demonstrably on the water ---
  1330: "Oceanfront",  // Grand Hôtel du Cap Ferrat — funicular to a sea-water pool
  1429: "Oceanfront",  // Borgo Santandrea — own terraces down to its own beach club
  1443: "Oceanfront",  // Excelsior Vittoria — private lift to the port
  1226: "Oceanfront",  // Amanoi — private beach directly below
  1800: "Oceanfront",  // Southern Ocean Lodge — on the cliff edge itself
  3023: "Beachfront",  // FS Mauritius Anahita  [override: proposed Oceanfront]

  // --- tagged Oceanfront, but they describe a private beach ---
  1405: "Beachfront",  // Lesante Blu
  1617: "Beachfront",  // W Dubai Mina Seyahi
  1647: "Beachfront",  // The Riviera Maya EDITION at Kanai
};

/* Confirmed unchanged in the review. Listed rather than merely omitted so the
 * script can prove it looked at all 99 — an id in neither list is a gap, not a
 * silent pass. */
const UNCHANGED = [
  1315, 1115, 1370, 2005, 1337, 1517, 1426, 1449, 1320, 1521, 1397, 1445, 1446,
  1432, 2046, 1361, 1792, 2033, 1706, 1472, 2011, 2047, 1807, 2061, 1414, 1733,
  1744, 1827, 1513, 1276, 1117, 1383, 1625, 2012, 1120, 1389, 1186, 1390, 1391,
  1579, 1203, 1622, 1250, 1669, 1581, 2034, 1540, 1448, 1823, 1340, 1815, 1829,
  1454, 1457, 1400, 1401, 1402, 1348, 1350, 1460, 1406, 2021, 2023, 1412, 1211,
  2060, 2059, 1475, 1534, 1131, 1184, 1535, 2067, 1428, 1478, 1241, 1368, 1113,
  1586, 1417, 1538, 1500, 1511, 1275, 1487, 1770,
];

function toPgArrayLiteral(values) {
  if (!Array.isArray(values) || values.length === 0) return "{}";
  return `{${values
    .map((v) => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
    .join(",")}}`;
}

/** Collapse every water value on the row down to the single chosen one. */
function rebuild(list, next) {
  const out = [];
  for (const tag of list ?? []) {
    if (WATER.includes(tag)) continue;
    if (!out.includes(tag)) out.push(tag);
  }
  out.push(next);
  return out;
}

const URL_ = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const TOKEN = process.env.DIRECTUS_TOKEN;
if (!URL_ || !TOKEN) {
  console.error("Set DIRECTUS_URL and DIRECTUS_TOKEN.");
  process.exitCode = 1;
} else {

const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
const changeIds = Object.keys(DECISIONS).map(Number);
const allIds = [...changeIds, ...UNCHANGED];

// Guard: the review covered 99 rows, and every one must be accounted for.
if (new Set(allIds).size !== 99) {
  console.error(`Expected 99 distinct ids across both lists, got ${new Set(allIds).size}. Aborting.`);
  process.exitCode = 1;
} else {

const res = await fetch(
  `${URL_}/items/hotels?limit=-1&filter[id][_in]=${changeIds.join(",")}` +
    `&fields=id,hotel_name,setting,primary_setting,secondary_setting`,
  { headers: H }
);
if (!res.ok) {
  console.error("Read failed:", res.status);
  process.exitCode = 1;
} else {

const { data: rows } = await res.json();
const byId = new Map(rows.map((r) => [String(r.id), r])); // ids are strings (§44)
const missing = changeIds.filter((id) => !byId.has(String(id)));

if (missing.length) {
  console.error("Not found, aborting:", missing.join(", "));
  process.exitCode = 1;
} else {

const planned = [];
const noops = [];

for (const id of changeIds) {
  const row = byId.get(String(id));
  const next = DECISIONS[id];
  const before = {
    setting: row.setting ?? [],
    primary_setting: row.primary_setting ?? null,
    secondary_setting: row.secondary_setting ?? null,
  };
  const swapOne = (v) => (v && WATER.includes(v) ? next : v);
  const after = {
    setting: rebuild(before.setting, next),
    primary_setting: swapOne(before.primary_setting),
    secondary_setting: swapOne(before.secondary_setting),
  };
  // A row whose two water values collapse to one leaves the single-selects
  // pointing at the same value twice; the second becomes null.
  if (after.secondary_setting === after.primary_setting) after.secondary_setting = null;

  const same =
    JSON.stringify(before.setting) === JSON.stringify(after.setting) &&
    before.primary_setting === after.primary_setting &&
    before.secondary_setting === after.secondary_setting;
  if (same) { noops.push(`${id} ${row.hotel_name?.trim()} — already matches`); continue; }

  const collapsed = before.setting.filter((v) => WATER.includes(v)).length > 1;
  planned.push({ id: String(id), name: row.hotel_name?.trim(), choice: next, collapsed, before, after });
}

console.log(`\n${CONFIRM ? "APPLYING" : "DRY RUN"} — batch 3, Coastal / Oceanfront\n`);
for (const p of planned) {
  console.log(`  [${p.id}]${p.collapsed ? " ‼" : "  "} ${p.name}`);
  console.log(`        setting   ${JSON.stringify(p.before.setting)} -> ${JSON.stringify(p.after.setting)}`);
  if (p.before.primary_setting !== p.after.primary_setting) {
    console.log(`        primary   ${p.before.primary_setting} -> ${p.after.primary_setting}`);
  }
  if (p.before.secondary_setting !== p.after.secondary_setting) {
    console.log(`        secondary ${p.before.secondary_setting} -> ${p.after.secondary_setting}`);
  }
}
for (const n of noops) console.log("  skip " + n);
console.log(`\n  ‼ = carried two water values that contradicted each other (${planned.filter((p) => p.collapsed).length})`);
console.log(`  ${planned.length} to change, ${UNCHANGED.length} confirmed unchanged, 99 reviewed.`);

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
  console.log(`  ok ${p.id} ${p.name} -> ${p.choice}`);
}

let log = [];
if (fs.existsSync(ROLLBACK)) {
  try { log = JSON.parse(fs.readFileSync(ROLLBACK, "utf8")); } catch { log = []; }
}
log.push({ at: new Date().toISOString(), batch: "coastal-oceanfront-3", changes: applied });
fs.writeFileSync(ROLLBACK, JSON.stringify(log, null, 2), "utf8");

console.log(`\n  Applied ${applied.length}, failed ${failed}. Rollback appended.\n`);
process.exitCode = failed ? 1 : 0;
}
}
}
}
}
