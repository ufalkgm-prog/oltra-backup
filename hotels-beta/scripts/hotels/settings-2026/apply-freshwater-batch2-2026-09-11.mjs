#!/usr/bin/env node
/* Batch 2 of the water-proximity setting clean-up (CLAUDE.md §42B).
 *
 * The 71 hotels tagged `Lakeside`, `Riverside` or `Canalside`. Under the
 * September definitions `Waterfront` is the generic for all fresh water, so
 * those three retire into it.
 *
 * I told Ulrik this batch was mechanical. It was not. Ten of the 71 are SALT
 * water wearing a freshwater tag — the Oberoi Mumbai tagged `Riverside` while
 * facing the Arabian Sea, three Bosphorus hotels likewise, and Loch Torridon,
 * which is a sea loch. Those went through the same review artifact as batch 1;
 * the other 61 were confirmed as a block. "Mechanical" was a judgement about
 * data I had not looked at yet, and checking took one query.
 *
 * The three Bosphorus hotels are set to `Oceanfront` to match Mandarin Oriental
 * Bosphorus in batch 1 — four hotels on one strait had to agree.
 *
 * THIS SCRIPT TOUCHES THE WATER TAG AND NOTHING ELSE (§42B). `["City",
 * "Canalside"]` keeps `City`.
 *
 * A ONE-TIME RECORD of a reviewed session, not a tool — copy the pattern for
 * batch 3, per §24.
 *
 *   node apply-freshwater-batch2-2026-09-11.mjs              # dry run
 *   node apply-freshwater-batch2-2026-09-11.mjs --confirm    # writes
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROLLBACK = path.join(HERE, "apply-freshwater-batch2-2026-09-11-rollback.json");
const CONFIRM = process.argv.includes("--confirm");

/** The tags this batch retires. Whichever one a row carries is the one replaced. */
const FRESH = ["Lakeside", "Riverside", "Canalside"];

/* The ten Ulrik decided individually — salt water, so they leave the fresh
 * family entirely. Every one matched the proposal. */
const JUDGED = {
  1113: "Oceanfront",   // The Oberoi Mumbai — Arabian Sea, never a river
  1579: "Oceanfront",   // Çırağan Palace Kempinski — Bosphorus
  1581: "Oceanfront",   // Four Seasons Istanbul at the Bosphorus
  1586: "Oceanfront",   // The Peninsula Istanbul — Bosphorus
  1511: "Oceanfront",   // The Torridon — Loch Torridon is a sea loch
  1601: "Waterfront",   // FS Abu Dhabi — built canal, salt water; canal wins
  1610: "Waterfront",   // Rosewood Abu Dhabi — same island, same reading
  1696: "Waterfront",   // Montage Palmetto Bluff — tidal, but a river
  1839: "Waterfront",   // Clayoquot Wilderness Lodge — river meets the sound
  3031: "Waterfront",   // Old Cataract, Aswan — the Nile
};

/* Confirmed as a block in the review: fresh water, straight merge. */
const MECHANICAL = [
  1105, 1111, 1147, 1346, 1376, 1379, 1441, 1444, 1447, 1458, 1461, 1468, 1486,
  1488, 1543, 1544, 1546, 1547, 1548, 1551, 1556, 1558, 1559, 1565, 1572, 1573,
  1620, 1689, 1754, 1777, 1808, 1809, 2054, 1004, 1005, 1081, 1142, 1197, 1198,
  1210, 1218, 1222, 1223, 1235, 1328, 1415, 1469, 1550, 1563, 1673, 1730, 1765,
  1782, 2043, 2058, 1484, 1495, 1496, 1497, 1832, 2049,
];

/* Old Cataract also carries `Clifftop`, which means an OCEAN cliff and retires
 * in batch 4. This is granite above the Nile, so the tag is dropped here rather
 * than translated — approved in the review. */
const ALSO_DROP = { 3031: ["Clifftop"] };

/* Editorial follow-ups raised in review. NOT applied: copy, not tagging. */
const HIGHLIGHT_FIXME = {
  1579: 'Çırağan Palace highlights say "great setting on the river" — it is the ' +
        "Bosphorus, a strait, not a river.",
  1511: 'The Torridon highlights say "Amazing lakeside escape" — Loch Torridon ' +
        "is a sea loch.",
};

const DECISIONS = { ...JUDGED };
for (const id of MECHANICAL) DECISIONS[id] = "Waterfront";

function toPgArrayLiteral(values) {
  if (!Array.isArray(values) || values.length === 0) return "{}";
  return `{${values
    .map((v) => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
    .join(",")}}`;
}

/** Replace whichever fresh tag the row carries, keep everything else, no dupes. */
function swap(list, next, drop) {
  const out = [];
  for (const tag of list ?? []) {
    if (drop.includes(tag)) continue;
    if (!FRESH.includes(tag)) {
      if (!out.includes(tag)) out.push(tag);
      continue;
    }
    if (!out.includes(next)) out.push(next);
  }
  return out;
}

const { DIRECTUS_URL, DIRECTUS_TOKEN } = process.env;
if (!DIRECTUS_URL || !DIRECTUS_TOKEN) {
  console.error("Set DIRECTUS_URL and DIRECTUS_TOKEN.");
  process.exitCode = 1;
} else {

const H = { Authorization: `Bearer ${DIRECTUS_TOKEN}`, "Content-Type": "application/json" };
const ids = Object.keys(DECISIONS);

const res = await fetch(
  `${DIRECTUS_URL}/items/hotels?limit=-1&filter[id][_in]=${ids.join(",")}` +
    `&fields=id,hotel_name,setting,primary_setting,secondary_setting`,
  { headers: H }
);
if (!res.ok) {
  console.error("Read failed:", res.status, await res.text());
  process.exitCode = 1;
} else {

const { data: rows } = await res.json();
// Directus returns id as a STRING (§44): a number-keyed lookup matches nothing
// and reports success while doing nothing.
const byId = new Map(rows.map((r) => [String(r.id), r]));

const missing = ids.filter((id) => !byId.has(String(id)));
if (missing.length) {
  console.error("Not found in Directus, aborting:", missing.join(", "));
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

  const carries = (v) =>
    before.setting.includes(v) ||
    before.primary_setting === v ||
    before.secondary_setting === v;

  if (!FRESH.some(carries)) {
    noops.push(`${id} ${row.hotel_name?.trim()} — no fresh tag left; already applied?`);
    continue;
  }

  const after = {
    setting: swap(before.setting, next, drop),
    primary_setting: FRESH.includes(before.primary_setting) ? next : before.primary_setting,
    secondary_setting: FRESH.includes(before.secondary_setting) ? next : before.secondary_setting,
  };
  // A dropped tag must go from the single-selects too, or it survives the retire.
  if (drop.includes(after.primary_setting)) after.primary_setting = null;
  if (drop.includes(after.secondary_setting)) after.secondary_setting = null;

  const same =
    JSON.stringify(before.setting) === JSON.stringify(after.setting) &&
    before.primary_setting === after.primary_setting &&
    before.secondary_setting === after.secondary_setting;
  if (same) {
    noops.push(`${id} ${row.hotel_name?.trim()} — already matches`);
    continue;
  }

  planned.push({
    id: String(id), name: row.hotel_name?.trim(), choice: next,
    judged: Object.hasOwn(JUDGED, id), before, after,
  });
}

console.log(`\n${CONFIRM ? "APPLYING" : "DRY RUN"} — batch 2, fresh-water merge\n`);
for (const p of planned) {
  console.log(`  [${p.id}]${p.judged ? " *" : "  "} ${p.name}`);
  console.log(`        setting   ${JSON.stringify(p.before.setting)} -> ${JSON.stringify(p.after.setting)}`);
  if (p.before.primary_setting !== p.after.primary_setting) {
    console.log(`        primary   ${p.before.primary_setting} -> ${p.after.primary_setting}`);
  }
  if (p.before.secondary_setting !== p.after.secondary_setting) {
    console.log(`        secondary ${p.before.secondary_setting} -> ${p.after.secondary_setting}`);
  }
}
if (noops.length) {
  console.log(`\n  Skipped (${noops.length}):`);
  for (const n of noops) console.log("    " + n);
}
console.log(`\n  * = decided individually in review (${Object.keys(JUDGED).length} of them)`);
console.log(`  ${planned.length} to change, ${noops.length} unchanged, ${ids.length} reviewed.`);
for (const [id, note] of Object.entries(HIGHLIGHT_FIXME)) {
  console.log(`\n  EDITORIAL FOLLOW-UP, not applied here — ${id}: ${note}`);
}

if (!CONFIRM) {
  console.log("\n  Dry run. Re-run with --confirm to write.\n");
} else {

const applied = [];
let failed = 0;
for (const p of planned) {
  const r = await fetch(`${DIRECTUS_URL}/items/hotels/${p.id}`, {
    method: "PATCH",
    headers: H,
    body: JSON.stringify({
      setting: toPgArrayLiteral(p.after.setting), // native text[] (§4)
      primary_setting: p.after.primary_setting,
      secondary_setting: p.after.secondary_setting,
    }),
  });
  if (!r.ok) {
    console.error(`  FAILED ${p.id} ${p.name}: ${r.status} ${await r.text()}`);
    failed += 1;
    continue;
  }
  applied.push(p);
  console.log(`  ok ${p.id} ${p.name} -> ${p.choice}`);
}

// Rollback records APPEND (§40).
let log = [];
if (fs.existsSync(ROLLBACK)) {
  try { log = JSON.parse(fs.readFileSync(ROLLBACK, "utf8")); } catch { log = []; }
}
log.push({ at: new Date().toISOString(), batch: "freshwater-2", changes: applied });
fs.writeFileSync(ROLLBACK, JSON.stringify(log, null, 2), "utf8");

console.log(`\n  Applied ${applied.length}, failed ${failed}. Rollback appended to ${path.basename(ROLLBACK)}\n`);
process.exitCode = failed ? 1 : 0;
}
}
}
}
