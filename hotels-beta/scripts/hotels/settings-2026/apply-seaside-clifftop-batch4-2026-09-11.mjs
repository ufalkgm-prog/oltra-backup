#!/usr/bin/env node
/* Batch 4 of the water-proximity setting clean-up (§42B): the last 8 hotels
 * carrying `Seaside` or `Clifftop`, before both values retire.
 *
 * Five are straight drops — the row already carries the value that should
 * survive, so the dead tag goes and nothing replaces it. Three needed a call,
 * all decided in the review artifact and all matching the proposal.
 *
 * One row changes twice. Mandarin Oriental, Mallorca (2023) sits on a rocky
 * peninsula directly on the sea, which makes it `Oceanfront` — and that means
 * the `Coastal` it also carries is wrong, since Coastal means 20+ minutes from
 * the water. Both values cannot be true at once, so Coastal is dropped in the
 * same patch. Flagged on its review card rather than done quietly.
 *
 * Water tags only (§42B). `["City","Seaside"]` keeps `City`.
 * A ONE-TIME RECORD (§24) — copy the pattern, do not edit this.
 *
 *   node apply-seaside-clifftop-batch4-2026-09-11.mjs              # dry run
 *   node apply-seaside-clifftop-batch4-2026-09-11.mjs --confirm    # writes
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROLLBACK = path.join(HERE, "apply-seaside-clifftop-batch4-2026-09-11-rollback.json");
const CONFIRM = process.argv.includes("--confirm");

const RETIRING = ["Seaside", "Clifftop"];

/* id -> what replaces the retiring tag. "__DROP__" removes it outright. */
const DECISIONS = {
  1487: "Oceanfront", // Villa Igiea — on the Gulf of Palermo, no beach of its own
  1792: "Coastal",    // Miraflores Park — cliffs ~70m above the Pacific, long descent
  2023: "Oceanfront", // Mandarin Oriental, Mallorca — see ALSO_DROP
  2010: "__DROP__",   // Villa Sant'Andrea — already Beachfront, correctly
  2012: "__DROP__",   // Reid's Palace — already Oceanfront
  3008: "__DROP__",   // Phinda Rock Lodge — a cliff over a valley, no water at all
  1115: "__DROP__",   // Alila Uluwatu — keeps Coastal
  2061: "__DROP__",   // Kauri Cliffs — keeps Coastal
};

/* Values to remove beyond the retiring tag itself. */
const ALSO_DROP = {
  2023: ["Coastal"], // contradicts the Oceanfront it is being given
};

function toPgArrayLiteral(values) {
  if (!Array.isArray(values) || values.length === 0) return "{}";
  return `{${values
    .map((v) => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
    .join(",")}}`;
}

function rebuild(list, next, drop) {
  const out = [];
  for (const tag of list ?? []) {
    if (drop.includes(tag)) continue;
    if (RETIRING.includes(tag)) {
      if (next !== "__DROP__" && !out.includes(next)) out.push(next);
      continue;
    }
    if (!out.includes(tag)) out.push(tag);
  }
  // A row whose only water value was the retiring one still needs its
  // replacement, even if the tag sat in a single-select rather than the array.
  if (next !== "__DROP__" && !out.includes(next)) out.push(next);
  return out;
}

const URL_ = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const TOKEN = process.env.DIRECTUS_TOKEN;
if (!URL_ || !TOKEN) {
  console.error("Set DIRECTUS_URL and DIRECTUS_TOKEN.");
  process.exitCode = 1;
} else {

const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
const ids = Object.keys(DECISIONS);
const res = await fetch(
  `${URL_}/items/hotels?limit=-1&filter[id][_in]=${ids.join(",")}` +
    `&fields=id,hotel_name,setting,primary_setting,secondary_setting`,
  { headers: H }
);
if (!res.ok) {
  console.error("Read failed:", res.status);
  process.exitCode = 1;
} else {

const { data: rows } = await res.json();
const byId = new Map(rows.map((r) => [String(r.id), r])); // ids are strings (§44)
const missing = ids.filter((id) => !byId.has(String(id)));

if (missing.length) {
  console.error("Not found, aborting:", missing.join(", "));
  process.exitCode = 1;
} else {

const planned = [];
const noops = [];

for (const id of ids) {
  const row = byId.get(String(id));
  const next = DECISIONS[id];
  const drop = ALSO_DROP[id] ?? [];

  const before = {
    setting: row.setting ?? [],
    primary_setting: row.primary_setting ?? null,
    secondary_setting: row.secondary_setting ?? null,
  };
  const carries =
    before.setting.some((v) => RETIRING.includes(v)) ||
    RETIRING.includes(before.primary_setting) ||
    RETIRING.includes(before.secondary_setting);
  if (!carries) { noops.push(`${id} ${row.hotel_name?.trim()} — already applied`); continue; }

  const swapOne = (v) => {
    if (drop.includes(v)) return null;
    if (!RETIRING.includes(v)) return v;
    return next === "__DROP__" ? null : next;
  };

  const after = {
    setting: rebuild(before.setting, next, drop),
    primary_setting: swapOne(before.primary_setting),
    secondary_setting: swapOne(before.secondary_setting),
  };

  planned.push({ id: String(id), name: row.hotel_name?.trim(), choice: next, before, after });
}

console.log(`\n${CONFIRM ? "APPLYING" : "DRY RUN"} — batch 4, retiring ${RETIRING.join(" + ")}\n`);
for (const p of planned) {
  console.log(`  [${p.id}] ${p.name}`);
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
  console.log(`  ok ${p.id} ${p.name} -> ${p.choice}`);
}

let log = [];
if (fs.existsSync(ROLLBACK)) {
  try { log = JSON.parse(fs.readFileSync(ROLLBACK, "utf8")); } catch { log = []; }
}
log.push({ at: new Date().toISOString(), batch: "seaside-clifftop-4", changes: applied });
fs.writeFileSync(ROLLBACK, JSON.stringify(log, null, 2), "utf8");

console.log(`\n  Applied ${applied.length}, failed ${failed}. Rollback appended.\n`);
process.exitCode = failed ? 1 : 0;
}
}
}
}
