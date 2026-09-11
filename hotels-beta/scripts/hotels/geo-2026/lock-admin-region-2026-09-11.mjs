#!/usr/bin/env node
/* Locks `admin_region` to a choice list (§49's deferred follow-up).
 *
 * The field has been free text with `interface: null` since it was created on
 * 2026-08-31, which is how `Giorgia` and `Boca Raton` got in. §44's lesson is
 * that cleaning an unconstrained field only resets the clock — `Private island`
 * had to be corrected twice — so the fix is the lock, not another clean-up.
 *
 * The vocabulary is built FROM the stored values rather than invented: all 903
 * rows are populated, 291 distinct, and an audit first confirmed no leading or
 * trailing whitespace, no case or accent variants of one another, and no empty
 * rows. Anything else would have to be corrected before locking, because
 * Directus does NOT validate existing rows — a stored value outside the list
 * stays in the database, renders blank in the admin UI, and can never be
 * selected again (§44).
 *
 * WHAT LOCKING COSTS. A hotel in a new administrative region now needs this
 * list extended before the row can be saved. That is the point — it is the
 * same trade §44 made for setting/style/activities — but with 291 entries it
 * is a long dropdown, and a genuinely new region is a schema edit rather than
 * a typing decision.
 *
 * KNOWN AMBIGUITY, left as-is: "Capital Region" is correct for both Denmark
 * (Hovedstaden) and Iceland (Höfuðborgarsvæðið). As one dropdown entry an
 * editor cannot tell which they are choosing. Splitting it would mean renaming
 * real data on a distinction the field does not otherwise draw, so it is
 * recorded rather than changed.
 *
 *   node lock-admin-region-2026-09-11.mjs              # dry run
 *   node lock-admin-region-2026-09-11.mjs --confirm    # writes
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT = path.join(HERE, "lock-admin-region-2026-09-11-snapshot.json");
const CONFIRM = process.argv.includes("--confirm");
const FIELD = "admin_region";

const URL_ = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const TOKEN = process.env.DIRECTUS_TOKEN;
if (!URL_ || !TOKEN) {
  console.error("Set DIRECTUS_URL and DIRECTUS_TOKEN.");
  process.exitCode = 1;
} else {

const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };

/* ---- gather every stored value, published and not --------------------- */

const { data: rows } = await (await fetch(
  `${URL_}/items/hotels?limit=-1&fields=id,hotel_name,${FIELD}`, { headers: H }
)).json();

const stored = rows.map((r) => r[FIELD]).filter((v) => v != null && String(v).length > 0);
const values = [...new Set(stored.map(String))].sort((a, b) => a.localeCompare(b));

console.log(`\n${CONFIRM ? "APPLYING" : "DRY RUN"} — locking ${FIELD}\n`);
console.log(`  rows: ${rows.length}   populated: ${stored.length}   distinct: ${values.length}`);

/* ---- refuse over data that would be orphaned by the lock -------------- */

const problems = [];
const empty = rows.filter((r) => r[FIELD] == null || String(r[FIELD]).length === 0);
if (empty.length) {
  problems.push(`${empty.length} row(s) have no ${FIELD}: ${empty.slice(0, 5).map((r) => r.id).join(", ")}`);
}
const untrimmed = values.filter((v) => v !== v.trim());
if (untrimmed.length) problems.push(`whitespace: ${untrimmed.map((v) => JSON.stringify(v)).join(", ")}`);

// Two values differing only by case or accent would both be offered, and an
// editor would pick between them at random. The audit found none; this keeps
// it that way on re-runs.
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const byNorm = new Map();
for (const v of values) {
  const k = norm(v);
  if (!byNorm.has(k)) byNorm.set(k, []);
  byNorm.get(k).push(v);
}
for (const group of byNorm.values()) {
  if (group.length > 1) problems.push(`near-duplicate: ${group.map((v) => JSON.stringify(v)).join(" vs ")}`);
}

if (problems.length) {
  console.error(`\n  REFUSING — fix these first, or the lock orphans them:`);
  for (const p of problems) console.error("    " + p);
  console.error("");
  process.exitCode = 1;
} else {

console.log("  No empty rows, no whitespace, no near-duplicates. Safe to lock.");

const { data: field } = await (await fetch(`${URL_}/fields/hotels/${FIELD}`, { headers: H })).json();
const meta = field?.meta ?? {};
console.log(`  current: interface=${meta.interface}  choices=${(meta.options?.choices ?? []).length}`);
console.log(`  after:   interface=select-dropdown  allowOther=false  choices=${values.length}`);
console.log(`\n  first 8: ${values.slice(0, 8).join(", ")}`);
console.log(`  last 8:  ${values.slice(-8).join(", ")}`);

if (!CONFIRM) {
  console.log("\n  Dry run. Re-run with --confirm to write.\n");
} else {

// Snapshot the whole prior meta, not just the choices: this field had
// interface null, and putting that back is part of an undo.
fs.writeFileSync(
  SNAPSHOT,
  JSON.stringify({ at: new Date().toISOString(), field: FIELD, beforeMeta: meta, values }, null, 2),
  "utf8"
);

const body = {
  meta: {
    interface: "select-dropdown",
    options: {
      ...(meta.options ?? {}),
      choices: values.map((v) => ({ text: v, value: v })),
      allowOther: false,
      allowNone: false, // every row has one, and a blank would break the joins
    },
  },
};
const r = await fetch(`${URL_}/fields/hotels/${FIELD}`, { method: "PATCH", headers: H, body: JSON.stringify(body) });
if (!r.ok) {
  console.error(`  FAILED: ${r.status} ${await r.text()}`);
  process.exitCode = 1;
} else {

// Verify by re-reading the field, and re-check every stored value against the
// list that is now live — the failure this guards is silent.
const { data: after } = await (await fetch(`${URL_}/fields/hotels/${FIELD}`, { headers: H })).json();
const live = (after?.meta?.options?.choices ?? []).map((c) => c.value ?? c.text);
const orphans = [...new Set(stored.map(String))].filter((v) => !live.includes(v));

console.log(`\n  ok — interface=${after?.meta?.interface} allowOther=${after?.meta?.options?.allowOther} choices=${live.length}`);
console.log(`  stored values not offered by the live list: ${orphans.length}`);
for (const o of orphans) console.log(`     !! ${JSON.stringify(o)}`);
console.log(`  snapshot: ${path.basename(SNAPSHOT)}\n`);
process.exitCode = orphans.length ? 1 : 0;
}
}
}
}
