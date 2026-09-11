#!/usr/bin/env node
/* The four rows batch 3's triage missed (§42B).
 *
 * Each carries TWO water values that cannot both hold:
 *
 *   2011  Romazzino, Costa Smeralda    Beachfront + Coastal
 *   2046  Kona Village, Hawai'i        Beachfront + Coastal
 *   2047  Rosewood Baha Mar, Nassau    Beachfront + Coastal
 *   2059  Rosewood Sanya, Hainan       Beachfront + Oceanfront
 *
 * `Coastal` means 20+ minutes from the water, which cannot be true of a resort
 * with its own beach; `Oceanfront` means the sea WITHOUT a beach. All four are
 * unambiguously beach resorts — Baha Mar's own description gives "3,000 feet of
 * white sand" — so Beachfront survives and the second value goes.
 *
 * WHY THEY WERE MISSED, because the shape recurs: batch 3's triage checked for
 * `Coastal` + `Oceanfront` overlap and found none. But a `Beachfront` +
 * `Coastal` row enters that batch's scope through its Coastal half, with the
 * contradiction sitting in the other — so it reads as a clean single-value row,
 * and nothing in its prose is wrong either. They surfaced only in the
 * post-write sweep of all 903 rows for "more than one water value". That sweep
 * belongs in every batch's verification, not just the one that happened to run
 * it.
 *
 * Ulrik had confirmed these unchanged on the framing that they were correct, so
 * they were left alone until he decided, rather than quietly corrected.
 *
 *   node apply-contradictory-pairs-2026-09-11.mjs              # dry run
 *   node apply-contradictory-pairs-2026-09-11.mjs --confirm    # writes
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROLLBACK = path.join(HERE, "apply-contradictory-pairs-2026-09-11-rollback.json");
const CONFIRM = process.argv.includes("--confirm");

const WATER = ["Beachfront", "Beach", "Oceanfront", "Waterfront", "Coastal"];
const KEEP = "Beachfront";
const IDS = [2011, 2046, 2047, 2059];

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
const res = await fetch(
  `${URL_}/items/hotels?limit=-1&filter[id][_in]=${IDS.join(",")}` +
    `&fields=id,hotel_name,setting,primary_setting,secondary_setting`,
  { headers: H }
);
if (!res.ok) {
  console.error("Read failed:", res.status);
  process.exitCode = 1;
} else {

const { data: rows } = await res.json();
const byId = new Map(rows.map((r) => [String(r.id), r])); // ids are strings (§44)
const planned = [];
const noops = [];

for (const id of IDS) {
  const row = byId.get(String(id));
  if (!row) { noops.push(`${id} — not found`); continue; }
  const before = {
    setting: row.setting ?? [],
    primary_setting: row.primary_setting ?? null,
    secondary_setting: row.secondary_setting ?? null,
  };
  const water = before.setting.filter((v) => WATER.includes(v));

  // Only touch rows that genuinely carry the contradiction. If an earlier run
  // already collapsed one, leave it — this is not a general re-tagger.
  if (water.length < 2) { noops.push(`${id} ${row.hotel_name?.trim()} — one water value already`); continue; }
  if (!water.includes(KEEP)) {
    noops.push(`${id} ${row.hotel_name?.trim()} — no ${KEEP} to keep, needs a look: ${JSON.stringify(water)}`);
    continue;
  }

  const after = {
    setting: [...before.setting.filter((v) => !WATER.includes(v)), KEEP],
    primary_setting: before.primary_setting && WATER.includes(before.primary_setting)
      ? KEEP : before.primary_setting,
    secondary_setting: before.secondary_setting && WATER.includes(before.secondary_setting)
      ? null : before.secondary_setting,
  };
  if (after.secondary_setting === after.primary_setting) after.secondary_setting = null;

  planned.push({ id: String(id), name: row.hotel_name?.trim(), dropped: water.filter((v) => v !== KEEP), before, after });
}

console.log(`\n${CONFIRM ? "APPLYING" : "DRY RUN"} — collapsing contradictory water pairs\n`);
for (const p of planned) {
  console.log(`  [${p.id}] ${p.name}   dropping ${p.dropped.join(", ")}`);
  console.log(`        setting   ${JSON.stringify(p.before.setting)} -> ${JSON.stringify(p.after.setting)}`);
  if (p.before.primary_setting !== p.after.primary_setting) {
    console.log(`        primary   ${p.before.primary_setting} -> ${p.after.primary_setting}`);
  }
  if (p.before.secondary_setting !== p.after.secondary_setting) {
    console.log(`        secondary ${p.before.secondary_setting} -> ${p.after.secondary_setting}`);
  }
}
for (const n of noops) console.log("  skip " + n);
console.log(`\n  ${planned.length} to change, ${noops.length} skipped.`);

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
  console.log(`  ok ${p.id} ${p.name} -> ${KEEP}`);
}

let log = [];
if (fs.existsSync(ROLLBACK)) {
  try { log = JSON.parse(fs.readFileSync(ROLLBACK, "utf8")); } catch { log = []; }
}
log.push({ at: new Date().toISOString(), batch: "contradictory-pairs", changes: applied });
fs.writeFileSync(ROLLBACK, JSON.stringify(log, null, 2), "utf8");

/* The whole point: prove no contradictory pair survives ANYWHERE, not just on
 * the rows this script touched. That sweep is what found these four. */
const { data: fresh } = await (await fetch(
  `${URL_}/items/hotels?limit=-1&fields=id,hotel_name,setting`, { headers: H }
)).json();
const left = fresh.filter((h) => (h.setting ?? []).filter((v) => WATER.includes(v)).length > 1);
console.log(`\n  Collection-wide sweep of ${fresh.length} rows — carrying two water values: ${left.length}`);
for (const h of left) console.log(`     [${h.id}] ${h.hotel_name?.trim()} ${JSON.stringify(h.setting)}`);

console.log(`\n  Applied ${applied.length}, failed ${failed}. Rollback appended.\n`);
process.exitCode = failed || left.length ? 1 : 0;
}
}
}
