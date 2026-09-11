#!/usr/bin/env node
/* The four UNPUBLISHED hotels batch 2 missed (§42B).
 *
 * Batch 2 scoped `published: true`, because every count in the review was about
 * the live collection. The retire script scans everything — an unpublished row
 * carrying a retired value is still orphaned data, and it is exactly the row
 * nobody notices — and it refused, naming these four:
 *
 *   1204  Four Seasons Bangkok at Chao Phraya River   Riverside
 *   3007  &Beyond Lake Manyara Tree Lodge             Lakeside
 *   3015  &Beyond Sandibe Okavango Safari Lodge       Riverside
 *   3017  &Beyond Punakha River Lodge                 Riverside
 *
 * All four are unambiguously fresh water — a river, a lake, a delta and a river,
 * each named in the hotel's own title. None raises the salt-water question that
 * made ten of batch 2 a judgement call, so they are merged under the same rule
 * rather than sent back through a review.
 *
 * Water tag only, like every script in this batch. A ONE-TIME RECORD (§24).
 *
 *   node apply-freshwater-unpublished-2026-09-11.mjs              # dry run
 *   node apply-freshwater-unpublished-2026-09-11.mjs --confirm    # writes
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROLLBACK = path.join(HERE, "apply-freshwater-unpublished-2026-09-11-rollback.json");
const CONFIRM = process.argv.includes("--confirm");

const FRESH = ["Lakeside", "Riverside", "Canalside"];
const IDS = [1204, 3007, 3015, 3017];
const NEXT = "Waterfront";

function toPgArrayLiteral(values) {
  if (!Array.isArray(values) || values.length === 0) return "{}";
  return `{${values
    .map((v) => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
    .join(",")}}`;
}

function swap(list) {
  const out = [];
  for (const tag of list ?? []) {
    const v = FRESH.includes(tag) ? NEXT : tag;
    if (!out.includes(v)) out.push(v);
  }
  return out;
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
    `&fields=id,hotel_name,published,setting,primary_setting,secondary_setting`,
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
  const carries =
    before.setting.some((v) => FRESH.includes(v)) ||
    FRESH.includes(before.primary_setting) ||
    FRESH.includes(before.secondary_setting);
  if (!carries) { noops.push(`${id} ${row.hotel_name?.trim()} — already applied`); continue; }

  const after = {
    setting: swap(before.setting),
    primary_setting: FRESH.includes(before.primary_setting) ? NEXT : before.primary_setting,
    secondary_setting: FRESH.includes(before.secondary_setting) ? NEXT : before.secondary_setting,
  };
  planned.push({
    id: String(id), name: row.hotel_name?.trim(),
    published: row.published === true, before, after,
  });
}

console.log(`\n${CONFIRM ? "APPLYING" : "DRY RUN"} — unpublished remainder\n`);
for (const p of planned) {
  console.log(`  [${p.id}] ${p.name}${p.published ? "  (PUBLISHED — unexpected)" : ""}`);
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
    method: "PATCH",
    headers: H,
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
  console.log(`  ok ${p.id} ${p.name} -> ${NEXT}`);
}

let log = [];
if (fs.existsSync(ROLLBACK)) {
  try { log = JSON.parse(fs.readFileSync(ROLLBACK, "utf8")); } catch { log = []; }
}
log.push({ at: new Date().toISOString(), batch: "freshwater-unpublished", changes: applied });
fs.writeFileSync(ROLLBACK, JSON.stringify(log, null, 2), "utf8");

console.log(`\n  Applied ${applied.length}, failed ${failed}. Rollback appended.\n`);
process.exitCode = failed ? 1 : 0;
}
}
}
