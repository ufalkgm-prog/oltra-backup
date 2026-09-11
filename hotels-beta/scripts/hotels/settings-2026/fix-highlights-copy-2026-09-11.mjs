#!/usr/bin/env node
/* Three factual corrections to `highlights`, found during the §42B setting
 * clean-up. Each says something about where the hotel is that the setting work
 * proved wrong, and each is a single phrase — the voice and the rest of the
 * line are left exactly as written.
 *
 *   1135  St. Regis Bali      "perched on a cliff" — it is on Nusa Dua's
 *                             flat golden beachfront, per its own description
 *   1579  Çırağan Palace      "on the river" — the Bosphorus is a strait
 *   1511  The Torridon        "lakeside" — Loch Torridon is a SEA loch
 *
 * `from` is asserted against what is stored before anything is written, so a
 * line already edited by hand aborts the run instead of being silently
 * overwritten (§0's anchor-text principle, applied to data).
 *
 * The Torridon becomes "lochside" rather than "seaside": it is the Scottish
 * word, it is accurate, and it sidesteps the fresh-or-salt question that made
 * the row a judgement call in the first place.
 *
 * NOT here: the two pairs of Abu Dhabi hotels sharing an identical highlights
 * line. That needs new copy written, not a phrase corrected, and writing
 * editorial content is Ulrik's call (§41).
 *
 *   node fix-highlights-copy-2026-09-11.mjs              # dry run
 *   node fix-highlights-copy-2026-09-11.mjs --confirm    # writes
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROLLBACK = path.join(HERE, "fix-highlights-copy-2026-09-11-rollback.json");
const CONFIRM = process.argv.includes("--confirm");

const FIXES = [
  {
    id: 1135,
    from: "Tropical designer luxury perched on a cliff with stunning sea views and multiple dining options",
    to: "Tropical designer luxury set on the beachfront with stunning sea views and multiple dining options",
    why: "Nusa Dua is flat beachfront; there is no cliff.",
  },
  {
    id: 1579,
    from: "Opulent luxury, multiple restaurants and great setting on the river",
    to: "Opulent luxury, multiple restaurants and great setting on the Bosphorus",
    why: "The Bosphorus is a strait, and naming it is better copy than 'the river'.",
  },
  {
    id: 1511,
    from: "Amazing lakeside escape",
    to: "Amazing lochside escape",
    why: "Loch Torridon is a sea loch, not a lake.",
  },
];

const URL_ = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const TOKEN = process.env.DIRECTUS_TOKEN;
if (!URL_ || !TOKEN) {
  console.error("Set DIRECTUS_URL and DIRECTUS_TOKEN.");
  process.exitCode = 1;
} else {

const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
const ids = FIXES.map((f) => f.id);
const res = await fetch(
  `${URL_}/items/hotels?limit=-1&filter[id][_in]=${ids.join(",")}&fields=id,hotel_name,highlights`,
  { headers: H }
);
if (!res.ok) {
  console.error("Read failed:", res.status);
  process.exitCode = 1;
} else {

const { data: rows } = await res.json();
const byId = new Map(rows.map((r) => [String(r.id), r])); // ids are strings (§44)

const planned = [];
const problems = [];

for (const fix of FIXES) {
  const row = byId.get(String(fix.id));
  if (!row) { problems.push(`${fix.id} — not found`); continue; }
  const current = (row.highlights ?? "").trim();
  if (current === fix.to) { console.log(`  skip ${fix.id} ${row.hotel_name?.trim()} — already fixed`); continue; }
  if (current !== fix.from) {
    problems.push(
      `${fix.id} ${row.hotel_name?.trim()} — stored text does not match the expected original.\n` +
      `        expected: ${JSON.stringify(fix.from)}\n` +
      `        stored:   ${JSON.stringify(current)}`
    );
    continue;
  }
  planned.push({ ...fix, name: row.hotel_name?.trim() });
}

console.log(`\n${CONFIRM ? "APPLYING" : "DRY RUN"} — highlights corrections\n`);
for (const p of planned) {
  console.log(`  [${p.id}] ${p.name}`);
  console.log(`        why  ${p.why}`);
  console.log(`        -    ${p.from}`);
  console.log(`        +    ${p.to}\n`);
}

if (problems.length) {
  console.error(`  ABORTING — ${problems.length} row(s) did not match:`);
  for (const p of problems) console.error("    " + p);
  console.error("\n  Someone edited these since the flag was raised. Re-read and update the script.\n");
  process.exitCode = 1;
} else if (!CONFIRM) {
  console.log(`  ${planned.length} to change. Dry run — re-run with --confirm to write.\n`);
} else {

const applied = [];
let failed = 0;
for (const p of planned) {
  const r = await fetch(`${URL_}/items/hotels/${p.id}`, {
    method: "PATCH", headers: H, body: JSON.stringify({ highlights: p.to }),
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
log.push({ at: new Date().toISOString(), changes: applied });
fs.writeFileSync(ROLLBACK, JSON.stringify(log, null, 2), "utf8");

console.log(`\n  Applied ${applied.length}, failed ${failed}. Rollback appended.\n`);
process.exitCode = failed ? 1 : 0;
}
}
}
