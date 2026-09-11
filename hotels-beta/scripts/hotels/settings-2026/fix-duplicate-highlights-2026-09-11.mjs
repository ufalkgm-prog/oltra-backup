#!/usr/bin/env node
/* Differentiates two pairs of Abu Dhabi hotels that shared a byte-identical
 * `highlights` line.
 *
 * Found by frequency-mapping the field across all 903 rows during the §42B
 * clean-up — the only two duplicates in the collection, and both pairs are in
 * Abu Dhabi, which suggests one editing session rather than coincidence. The
 * line is what a results card shows, so each pair read as the same hotel in a
 * list:
 *
 *   1601 Four Seasons Al Maryah / 1610 Rosewood Abu Dhabi
 *        "Canalside hotel with amazing views of the city"
 *   1615 St. Regis Abu Dhabi    / 1616 St. Regis Saadiyat Island
 *        "Classic beachfront luxury close to the city"
 *
 * Drafted from each hotel's OWN description and approved by Ulrik. Every detail
 * below appears in the stored description — the art collection and two-floor
 * spa, the Cantonese kitchen and Shanghai speakeasy, the marble underpass to
 * the beach club, the protected dunes and Gary Player course. Nothing invented.
 *
 * House style, measured rather than assumed: no terminal full stop (0 of 903
 * rows have one), median length 76 characters, noun phrase first. "Canalside"
 * also had to go — it echoed a setting value retired earlier today.
 *
 * `from` is asserted against the stored text before writing, so a line edited
 * by hand aborts the run rather than being silently overwritten.
 *
 *   node fix-duplicate-highlights-2026-09-11.mjs              # dry run
 *   node fix-duplicate-highlights-2026-09-11.mjs --confirm    # writes
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROLLBACK = path.join(HERE, "fix-duplicate-highlights-2026-09-11-rollback.json");
const CONFIRM = process.argv.includes("--confirm");

const FIXES = [
  {
    id: 1601,
    from: "Canalside hotel with amazing views of the city",
    to: "Art-filled tower on Al Maryah Island with a two-floor spa and Japanese listening bar",
    why: "2,000+ artworks, the two-floor Pearl Spa and Saikindō — none shared with the Rosewood.",
  },
  {
    id: 1610,
    from: "Canalside hotel with amazing views of the city",
    to: "Food-led waterfront address on Al Maryah with Cantonese cooking and a Shanghai speakeasy",
    why: "Its description's own pivot is 'Culinary life is a highlight' — Dai Pai Dong and Dragon's Tooth.",
  },
  {
    id: 1615,
    from: "Classic beachfront luxury close to the city",
    to: "Corniche grande dame with butler service and a private underpass to its own beach club",
    why: "The marble underpass to Nation Riviera is its single most distinctive feature, and it explains the City + Beachfront tags.",
  },
  {
    id: 1616,
    from: "Classic beachfront luxury close to the city",
    to: "Dune-backed Saadiyat resort beside the Louvre, with golf and Mediterranean terraces",
    why: "Protected dunes, the Saadiyat Cultural District and the Gary Player course separate it from its sibling.",
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
  if (current === fix.to) { console.log(`  skip ${fix.id} ${row.hotel_name?.trim()} — already applied`); continue; }
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

// The point of the exercise: the new lines must differ from each other, not
// merely from what they replace.
const finals = FIXES.map((f) => f.to);
if (new Set(finals).size !== finals.length) {
  problems.push("two of the replacement lines are identical — that is the bug being fixed");
}

console.log(`\n${CONFIRM ? "APPLYING" : "DRY RUN"} — differentiating duplicate highlights\n`);
for (const p of planned) {
  console.log(`  [${p.id}] ${p.name}`);
  console.log(`        why  ${p.why}`);
  console.log(`        -    ${p.from}`);
  console.log(`        +    ${p.to}   (${p.to.length} chars)\n`);
}

if (problems.length) {
  console.error(`  ABORTING — ${problems.length} problem(s):`);
  for (const p of problems) console.error("    " + p);
  console.error("");
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
