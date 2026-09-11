#!/usr/bin/env node
/* Removes Seaside and Clifftop from the setting choice lists,
 * now that batch 4 has cleared every row carrying them (§42B). With these two gone
 * the water vocabulary is settled: Beachfront, Beach, Oceanfront, Waterfront,
 * Coastal — five values, each with one meaning.
 *
 * Run AFTER apply-seaside-clifftop-batch4-2026-09-11.mjs, and it REFUSES if any row
 * still carries a retiring value — removing a choice that is still stored
 * leaves orphaned data that renders blank in the admin UI while the Hotels
 * filter can never select it (§44). The guard is the point of the script.
 *
 * THREE FIELDS, not one. §44 locked `setting`, `primary_setting` and
 * `secondary_setting` to the same vocabulary, so retiring from only the
 * multiselect would leave the two single-selects still offering the value —
 * the previous retire script (retire-activity-choices-2026-08-16.mjs) predates
 * that lock and handles one field, which is why this is not a copy of it.
 *
 * Meta-only: the underlying text[] and text columns are untouched.
 *
 *   node retire-seaside-clifftop-2026-09-11.mjs              # dry run
 *   node retire-seaside-clifftop-2026-09-11.mjs --confirm    # writes
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT = path.join(HERE, "retire-seaside-clifftop-2026-09-11-snapshot.json");
const CONFIRM = process.argv.includes("--confirm");

const RETIRE = ["Seaside", "Clifftop"];
const FIELDS = ["setting", "primary_setting", "secondary_setting"];

const URL_ = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const TOKEN = process.env.DIRECTUS_TOKEN;
if (!URL_ || !TOKEN) {
  console.error("Set DIRECTUS_URL and DIRECTUS_TOKEN.");
  process.exitCode = 1;
} else {

const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };

/* ---- guard: nothing may still be using these values ------------------- */

const rowsRes = await fetch(
  `${URL_}/items/hotels?limit=-1&fields=id,hotel_name,setting,primary_setting,secondary_setting`,
  { headers: H }
);
if (!rowsRes.ok) {
  console.error("Could not read hotels:", rowsRes.status);
  process.exitCode = 1;
} else {

const { data: rows } = await rowsRes.json();
// Deliberately NOT filtered to published: an unpublished row carrying a retired
// value is still orphaned data, and it is exactly the row nobody would notice.
const stillUsing = rows.filter(
  (r) =>
    (r.setting ?? []).some((v) => RETIRE.includes(v)) ||
    RETIRE.includes(r.primary_setting) ||
    RETIRE.includes(r.secondary_setting)
);

console.log(`\n${CONFIRM ? "APPLYING" : "DRY RUN"} — retiring ${RETIRE.join(", ")}\n`);
console.log(`  Scanned ${rows.length} hotels (published and not).`);

if (stillUsing.length) {
  console.error(`\n  REFUSING — ${stillUsing.length} row(s) still carry a retiring value:`);
  for (const r of stillUsing.slice(0, 20)) {
    console.error(
      `    [${r.id}] ${r.hotel_name?.trim()} ` +
        `${JSON.stringify(r.setting)} primary=${r.primary_setting} secondary=${r.secondary_setting}`
    );
  }
  console.error("\n  Convert those first, then re-run.\n");
  process.exitCode = 1;
} else {

console.log("  No row carries any of them. Safe to retire.\n");

/* ---- read the three fields -------------------------------------------- */

const before = {};
const plans = [];
let readFailed = false;

for (const f of FIELDS) {
  const r = await fetch(`${URL_}/fields/hotels/${f}`, { headers: H });
  if (!r.ok) {
    console.error(`  Could not read field ${f}: ${r.status}`);
    readFailed = true;
    break;
  }
  const { data } = await r.json();
  const meta = data?.meta ?? {};
  const choices = meta.options?.choices ?? [];
  before[f] = choices;
  const kept = choices.filter((c) => !RETIRE.includes(c.value ?? c.text));
  const removed = choices
    .filter((c) => RETIRE.includes(c.value ?? c.text))
    .map((c) => c.value ?? c.text);
  plans.push({ field: f, meta, kept, removed });
  console.log(`  ${f}: ${choices.length} choices -> ${kept.length}` +
    (removed.length ? `  (removing ${removed.join(", ")})` : "  (nothing to remove)"));
}

if (readFailed) {
  process.exitCode = 1;
} else if (!CONFIRM) {
  console.log("\n  Dry run. Re-run with --confirm to write.\n");
} else {

// Snapshot the full before-state of all three lists, so a bad retire can be put
// back exactly — §40's rollback records, applied to schema rather than rows.
fs.writeFileSync(
  SNAPSHOT,
  JSON.stringify({ at: new Date().toISOString(), retired: RETIRE, before }, null, 2),
  "utf8"
);

let failed = 0;
for (const p of plans) {
  if (!p.removed.length) {
    console.log(`  skip ${p.field} — already clean`);
    continue;
  }
  // PATCH only meta.options.choices. Sending the whole meta back risks carrying
  // a stale value from the read; the field's type and schema are untouched.
  const r = await fetch(`${URL_}/fields/hotels/${p.field}`, {
    method: "PATCH",
    headers: H,
    body: JSON.stringify({ meta: { options: { ...(p.meta.options ?? {}), choices: p.kept } } }),
  });
  if (!r.ok) {
    console.error(`  FAILED ${p.field}: ${r.status} ${await r.text()}`);
    failed += 1;
    continue;
  }
  console.log(`  ok ${p.field} -> ${p.kept.length} choices`);
}

/* ---- verify by re-reading, not by trusting the PATCH responses -------- */

let bad = 0;
for (const f of FIELDS) {
  const r = await fetch(`${URL_}/fields/hotels/${f}`, { headers: H });
  const { data } = await r.json();
  const now = (data?.meta?.options?.choices ?? []).map((c) => c.value ?? c.text);
  const leftover = now.filter((v) => RETIRE.includes(v));
  if (leftover.length) {
    console.error(`  !! ${f} still offers ${leftover.join(", ")}`);
    bad += 1;
  }
}

console.log(
  `\n  Done. ${failed} write failure(s), ${bad} field(s) still offering a retired value.` +
    `\n  Snapshot written to ${path.basename(SNAPSHOT)}\n`
);
process.exitCode = failed || bad ? 1 : 0;
}
}
}
}
