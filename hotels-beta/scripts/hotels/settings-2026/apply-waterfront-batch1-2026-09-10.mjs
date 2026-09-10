#!/usr/bin/env node
/* Batch 1 of the water-proximity setting clean-up (CLAUDE.md §42B).
 *
 * The 37 hotels tagged `Waterfront`, reclassified under the definitions Ulrik
 * set on 2026-09-10:
 *
 *   Beachfront  on an actual sandy beach, nothing between hotel and sand
 *   Beach       overlooking the beach, road/obstruction between, <5 min walk
 *   Oceanfront  on the ocean but not a beach, incl. clifftops a limited way above
 *   Waterfront  all OTHER water — rivers, lakes, canals
 *   Coastal     near the ocean but not on it, 20+ min from reaching the water
 *
 * Note this INVERTS the Beach/Beachfront relationship §42B originally recorded.
 * Ulrik chose "swap the labels" precisely so the existing 163 `Beachfront` rows,
 * which mostly do sit on sand, stay correct.
 *
 * Every decision below was made by Ulrik in the review artifact, not inferred
 * here. Four are overrides of what was proposed, and they are marked.
 *
 * THIS SCRIPT TOUCHES THE WATER TAG AND NOTHING ELSE. A hotel tagged
 * ["City","Waterfront"] keeps "City"; only the water value is replaced, in the
 * array and in whichever of primary_setting/secondary_setting held it. That is
 * an explicit instruction, and it is what makes this safe to run against rows
 * whose other tags were never reviewed.
 *
 * Like the §24 apply-award-review scripts this is a ONE-TIME RECORD of a
 * reviewed session, not a tool. Copy the pattern for the next batch; do not
 * edit this one.
 *
 *   node apply-waterfront-batch1-2026-09-10.mjs              # dry run
 *   node apply-waterfront-batch1-2026-09-10.mjs --confirm    # writes
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROLLBACK = path.join(HERE, "apply-waterfront-batch1-2026-09-10-rollback.json");
const CONFIRM = process.argv.includes("--confirm");

/* id -> the value Ulrik chose. "__REMOVE__" drops the water tag outright. */
const DECISIONS = {
  1061: "Beachfront",   // Park Hyatt Zanzibar
  1117: "Oceanfront",   // Amankila
  1135: "Beachfront",   // The St. Regis Bali Resort — see HIGHLIGHT_FIXME below
  1184: "Oceanfront",   // Solaire Resort, Sky Tower
  1203: "Oceanfront",   // COMO Point Yamu
  1216: "Beachfront",   // Six Senses Samui        [override: proposed Oceanfront]
  1250: "Oceanfront",   // Fouquet's Saint-Barth   [override: proposed Beach]
  1275: "Oceanfront",   // Villa Dubrovnik
  1276: "Oceanfront",   // Almyra
  1319: "Beachfront",   // Cap Estel               [override: proposed Oceanfront]
  1324: "Beachfront",   // Cheval Blanc Saint-Tropez
  1333: "Beach",        // Le Majestic Cannes — the Croisette runs between
  1336: "Beachfront",   // Hôtel Belles Rives
  1340: "Oceanfront",   // Hôtel du Cap-Eden-Roc
  1348: "Oceanfront",   // La Réserve de Beaulieu
  1385: "Beach",        // Bill & Coo Mykonos
  1390: "Oceanfront",   // Cavo Tagoo Mykonos
  1394: "Beachfront",   // Elounda Beach Hotel & Villas
  1396: "Beachfront",   // Four Seasons Astir Palace Athens
  1404: "Beachfront",   // Kivotos Mykonos
  1408: "Beachfront",   // Myconian Imperial
  1448: "Oceanfront",   // Grand Hotel Vesuvio
  1454: "Oceanfront",   // Hotel Santa Caterina
  1500: "Oceanfront",   // The Thief, Oslo — Oslofjord counts as sea
  1516: "Beachfront",   // BLESS Ibiza Cala Nova
  1521: "Coastal",      // Finca Cortesin — inland; was water-tagged in error
  1526: "Beach",        // Hotel Arts Barcelona
  1538: "Oceanfront",   // The St. Regis Mardavall Mallorca
  1540: "Oceanfront",   // Grand Hôtel Stockholm — same reading as Oslo
  1622: "Oceanfront",   // Fairmont Waterfront, Vancouver — same reading again
  1625: "Oceanfront",   // Banyan Tree Cabo Marqués
  1678: "__REMOVE__",   // Four Seasons Jackson Hole — a ski hotel, never on water
  1693: "Beachfront",   // Mauna Lani
  1770: "Oceanfront",   // Wequassett Resort & Golf Club
  1814: "Beachfront",   // Jumeirah Marsa Al Arab
  2021: "Oceanfront",   // Mandarin Oriental Bosphorus — the strait reads as sea
  2036: "Waterfront",   // Four Seasons Baku — the Caspian stays fresh-water side
};

/* Editorial follow-up Ulrik raised in the review. NOT applied here: this script
 * changes settings only, and rewriting a highlights line is a copy decision. */
const HIGHLIGHT_FIXME = {
  1135: 'St. Regis Bali highlights say "perched on a cliff" — it is not; ' +
        "the description has it on the beachfront. Needs a copy fix.",
};

const OLD = "Waterfront";

function toPgArrayLiteral(values) {
  if (!Array.isArray(values) || values.length === 0) return "{}";
  return `{${values
    .map((v) => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
    .join(",")}}`;
}

/** Replace the water tag in place, keep every other tag, never duplicate. */
function swap(list, next) {
  const out = [];
  for (const tag of list ?? []) {
    if (tag !== OLD) {
      if (!out.includes(tag)) out.push(tag);
      continue;
    }
    if (next !== "__REMOVE__" && !out.includes(next)) out.push(next);
  }
  return out;
}

const { DIRECTUS_URL, DIRECTUS_TOKEN } = process.env;
if (!DIRECTUS_URL || !DIRECTUS_TOKEN) {
  console.error("Set DIRECTUS_URL and DIRECTUS_TOKEN.");
  process.exit(1);
}
const H = { Authorization: `Bearer ${DIRECTUS_TOKEN}`, "Content-Type": "application/json" };

const ids = Object.keys(DECISIONS);
const res = await fetch(
  `${DIRECTUS_URL}/items/hotels?limit=-1&filter[id][_in]=${ids.join(",")}` +
    `&fields=id,hotel_name,setting,primary_setting,secondary_setting`,
  { headers: H }
);
if (!res.ok) {
  console.error("Read failed:", res.status, await res.text());
  process.exit(1);
}
const { data: rows } = await res.json();

// Directus returns id as a STRING (§44) — a number-keyed lookup matches nothing
// and reports success while doing nothing at all.
const byId = new Map(rows.map((r) => [String(r.id), r]));

const missing = ids.filter((id) => !byId.has(String(id)));
if (missing.length) {
  console.error("Not found in Directus, aborting:", missing.join(", "));
  process.exit(1);
}

const planned = [];
const noops = [];

for (const id of ids) {
  const row = byId.get(String(id));
  const next = DECISIONS[id];

  const before = {
    setting: row.setting ?? [],
    primary_setting: row.primary_setting ?? null,
    secondary_setting: row.secondary_setting ?? null,
  };

  if (!before.setting.includes(OLD) &&
      before.primary_setting !== OLD &&
      before.secondary_setting !== OLD) {
    noops.push(`${id} ${row.hotel_name?.trim()} — no ${OLD} tag left; already applied?`);
    continue;
  }

  const after = {
    setting: swap(before.setting, next),
    primary_setting:
      before.primary_setting === OLD
        ? next === "__REMOVE__" ? null : next
        : before.primary_setting,
    secondary_setting:
      before.secondary_setting === OLD
        ? next === "__REMOVE__" ? null : next
        : before.secondary_setting,
  };

  // Replacing a water tag with one the row already carries would duplicate it;
  // swap() dedupes, so an unchanged array here means there was nothing to do.
  const same =
    JSON.stringify(before.setting) === JSON.stringify(after.setting) &&
    before.primary_setting === after.primary_setting &&
    before.secondary_setting === after.secondary_setting;
  if (same) {
    noops.push(`${id} ${row.hotel_name?.trim()} — decision matches current value`);
    continue;
  }

  planned.push({ id: String(id), name: row.hotel_name?.trim(), choice: next, before, after });
}

console.log(`\n${CONFIRM ? "APPLYING" : "DRY RUN"} — batch 1, ${OLD} reclassification\n`);
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
if (noops.length) {
  console.log(`\n  Skipped (${noops.length}):`);
  for (const n of noops) console.log("    " + n);
}
console.log(`\n  ${planned.length} to change, ${noops.length} unchanged, ${ids.length} reviewed.`);

for (const [id, note] of Object.entries(HIGHLIGHT_FIXME)) {
  console.log(`\n  EDITORIAL FOLLOW-UP, not applied here — ${id}: ${note}`);
}

// Falls through to the else rather than calling process.exit: exiting from the
// top level of an ESM module mid-await trips a libuv assertion on Windows, which
// prints after all the real output and makes a clean run look like a crash.
if (!CONFIRM) {
  console.log("\n  Dry run. Re-run with --confirm to write.\n");
} else {

const applied = [];
let failed = 0;
for (const p of planned) {
  const body = {
    setting: toPgArrayLiteral(p.after.setting), // native text[]: array literal, not JSON (§4)
    primary_setting: p.after.primary_setting,
    secondary_setting: p.after.secondary_setting,
  };
  const r = await fetch(`${DIRECTUS_URL}/items/hotels/${p.id}`, {
    method: "PATCH",
    headers: H,
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    console.error(`  FAILED ${p.id} ${p.name}: ${r.status} ${await r.text()}`);
    failed += 1;
    continue;
  }
  applied.push(p);
  console.log(`  ok ${p.id} ${p.name} -> ${p.choice}`);
}

// Rollback records APPEND (§40): a re-run only reports rows it actually changed,
// so overwriting would erase the record of the first pass.
let log = [];
if (fs.existsSync(ROLLBACK)) {
  try { log = JSON.parse(fs.readFileSync(ROLLBACK, "utf8")); } catch { log = []; }
}
log.push({ at: new Date().toISOString(), batch: "waterfront-1", changes: applied });
fs.writeFileSync(ROLLBACK, JSON.stringify(log, null, 2), "utf8");

console.log(`\n  Applied ${applied.length}, failed ${failed}. Rollback appended to ${path.basename(ROLLBACK)}\n`);
process.exitCode = failed ? 1 : 0;
}
