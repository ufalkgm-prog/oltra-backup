#!/usr/bin/env node
/* The one parenthetical in `local_area`.
 *
 *   2039  "Dubai International Financial Centre (DIFC)" -> "DIFC"
 *
 * A name and its own abbreviation stored together, where every sibling in the
 * city is a bare short name — Downtown Dubai, Business Bay, Palm Jumeirah,
 * Al Sufouh, Mina Seyahi, Umm Suqeim. At 43 characters it was the third
 * longest value in the collection.
 *
 * WHY THE ACRONYM WINS rather than the spelled-out name:
 *   - The hotel's own description uses it: "anchors Gate Village in DIFC,
 *     Dubai's polished financial and dining district". Tier A evidence.
 *   - A bare acronym is already house style here — 3021 and 3027 both hold
 *     "AMAALA".
 *   - The long form repeats the city, which the short form does not.
 *
 * And Gate Village is NOT the answer even though the description names it
 * first: it is a development inside DIFC, so the Shenzhen UpperHills rule
 * applies for the sixth time this session.
 *
 * ==== A MISS THIS RUN CORRECTS IN THE CHECK, NOT THE DATA ====
 * Every local_area pass today reported "0 compound values". That was only ever
 * true of COMMA-separated ones, which is all the detector tested. Widening it
 * to slashes and "and" finds four more, plus two rows holding a descriptive
 * phrase rather than a district name:
 *
 *   2036  "Caspian waterfront and Old City"          Baku
 *   2038  "West Bay and The Corniche"                Doha
 *   2045  "Gwanghwamun and Jongno-gu"                Seoul
 *   2061  "Kauri Cliffs / Tepene Tablelands"         Matauri Bay
 *   2062  "Plaza de las Cortes / Landscape of Light" Madrid
 *   2065  "Ascot / Windsor Great Park"               Ascot
 *   2066  "Piazza della Repubblica / Porta Nuova"    Milan
 * and two rows holding a phrase that describes a location rather than naming
 * one, which no separator test catches at all:
 *   3015  "Private concession bordering Moremi Game Reserve"
 *   3016  "Private concession bordering Moremi Game Reserve"
 *
 * THE LIST ABOVE WAS WRONG ON ITS FIRST WRITING, and the way it was wrong is
 * the point. It was built from the longest stored values — a spot check — and
 * missed Doha, Seoul and Coworth Park, all short enough not to stand out. The
 * widened sweep found them on the first run. A detector beats a glance, which
 * is the whole reason this file exists.
 *
 * These are NOT fixed here. Each needs the same per-row judgement the 17
 * comma-compounds got — two named halves where one is a square and the other a
 * district, a bay and a walled city, a phrase that describes a location
 * instead of naming one — and doing that silently inside a one-line rename
 * would be exactly the scope creep the session has been avoiding. They are
 * listed by the sweep below so the next pass starts from a true count, and the
 * run does not fail on them: they are known work, not a regression.
 *
 * A ONE-TIME RECORD (§24).
 *
 *   node fix-difc-local-area-2026-09-11.mjs              # dry run
 *   node fix-difc-local-area-2026-09-11.mjs --confirm    # writes
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROLLBACK = path.join(HERE, "fix-difc-local-area-2026-09-11-rollback.json");
const CONFIRM = process.argv.includes("--confirm");

const FIX = {
  id: 2039,
  name: "Four Seasons Hotel Dubai International Financial Centre",
  from: "Dubai International Financial Centre (DIFC)",
  to: "DIFC",
  why: 'its own description says "anchors Gate Village in DIFC"',
};

/* Compound and phrase values this pass deliberately leaves alone. Listed, not
 * fixed; the sweep reports them without failing. */
const KNOWN_OUTSTANDING = {
  2036: "Caspian waterfront and Old City",
  2038: "West Bay and The Corniche",
  2045: "Gwanghwamun and Jongno-gu",
  2061: "Kauri Cliffs / Tepene Tablelands",
  2062: "Plaza de las Cortes / Landscape of Light",
  2065: "Ascot / Windsor Great Park",
  2066: "Piazza della Repubblica / Porta Nuova",
  // Not compounds — phrases that describe a location instead of naming one.
  // No separator test catches these; they are listed so the count is honest.
  3015: "Private concession bordering Moremi Game Reserve",
  3016: "Private concession bordering Moremi Game Reserve",
};

const URL_ = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const TOKEN = process.env.DIRECTUS_TOKEN;
if (!URL_ || !TOKEN) {
  console.error("Set DIRECTUS_URL and DIRECTUS_TOKEN.");
  process.exitCode = 1;
} else {

const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
const norm = (v) => { const s = String(v ?? "").trim(); return s === "" ? null : s; };

const { data: rows } = await (await fetch(
  `${URL_}/items/hotels?limit=-1&filter[id][_eq]=${FIX.id}&fields=id,hotel_name,city,local_area`, { headers: H }
)).json();
const row = rows?.[0];

const problems = [];
let write = false;
if (!row) problems.push(`${FIX.id} — not found`);
else {
  const current = norm(row.local_area);
  if (current === FIX.to) console.log(`  skip ${FIX.id} ${norm(row.hotel_name)} — already set`);
  else if (current !== FIX.from) problems.push(`${FIX.id} — local_area is ${JSON.stringify(current)}, expected ${JSON.stringify(FIX.from)}`);
  else write = true;
}

console.log(`\n${CONFIRM ? "APPLYING" : "DRY RUN"} — the DIFC value\n`);
if (write) {
  console.log(`  [${FIX.id}] ${norm(row.hotel_name)}  (${norm(row.city)})`);
  console.log(`        ${JSON.stringify(FIX.from)}`);
  console.log(`        -> ${JSON.stringify(FIX.to)}    ${FIX.from.length} chars -> ${FIX.to.length}`);
  console.log(`        ${FIX.why}`);
}

if (problems.length) {
  console.error(`\n  ABORTING:`);
  for (const p of problems) console.error("    " + p);
  console.error("");
  process.exitCode = 1;
} else if (!CONFIRM) {
  console.log(`\n  Dry run — re-run with --confirm to write.\n`);
} else {

const applied = [];
let failed = 0;
if (write) {
  const r = await fetch(`${URL_}/items/hotels/${FIX.id}`, {
    method: "PATCH", headers: H, body: JSON.stringify({ local_area: FIX.to }),
  });
  if (!r.ok) { console.error(`  FAILED ${FIX.id}: ${r.status} ${await r.text()}`); failed += 1; }
  else { applied.push({ id: String(FIX.id), name: FIX.name, before: FIX.from, after: FIX.to }); console.log(`  ok ${FIX.id} -> ${FIX.to}`); }
}

let log = [];
if (fs.existsSync(ROLLBACK)) {
  try { log = JSON.parse(fs.readFileSync(ROLLBACK, "utf8")); } catch { log = []; }
}
log.push({ at: new Date().toISOString(), changes: applied });
fs.writeFileSync(ROLLBACK, JSON.stringify(log, null, 2), "utf8");

/* Sweep the whole collection with the WIDENED detector — the point of this
 * run. A separator is a separator whether it is a comma, a slash or the word
 * "and". */
const { data: all } = await (await fetch(
  `${URL_}/items/hotels?limit=-1&fields=id,hotel_name,city,local_area`, { headers: H }
)).json();
const V = (h) => norm(h.local_area) ?? "";
const known = new Set(Object.keys(KNOWN_OUTSTANDING));

const isCompound = (v) => v.includes(",") || v.includes("/") || / and /i.test(v);
const compound = all.filter((h) => V(h) && isCompound(V(h)));
const newCompound = compound.filter((h) => !known.has(String(h.id)));
const parens = all.filter((h) => V(h).includes("(") || V(h).includes(")"));
const echo = all.filter((h) => V(h) && V(h) === norm(h.city));
const populated = all.filter((h) => V(h)).length;
const longest = all.filter((h) => V(h)).sort((a, b) => V(b).length - V(a).length).slice(0, 3);

console.log(`\n  Sweep of ${all.length} rows — compound detector widened to , / and "and"`);
console.log(`     parentheticals:                  ${parens.length}`);
for (const h of parens) console.log(`        [${h.id}] ${JSON.stringify(V(h))}`);
console.log(`     local_area repeating city:       ${echo.length}`);
console.log(`     compound, KNOWN and outstanding: ${compound.length - newCompound.length}`);
for (const h of compound.filter((x) => known.has(String(x.id)))) {
  console.log(`        [${h.id}] ${norm(h.hotel_name)} (${norm(h.city)})  ${JSON.stringify(V(h))}`);
}
console.log(`     compound, NEW since this run:    ${newCompound.length}`);
for (const h of newCompound) console.log(`        [${h.id}] ${norm(h.hotel_name)}  ${JSON.stringify(V(h))}`);
console.log(`     local_area populated:            ${populated}`);
console.log(`     longest values now:`);
for (const h of longest) console.log(`        ${String(V(h).length).padStart(3)}  [${h.id}] ${JSON.stringify(V(h))}`);
console.log(`\n  Applied ${applied.length}, failed ${failed}. Rollback appended.\n`);
// Known outstanding rows do NOT fail the run; a new one would.
process.exitCode = failed || parens.length || echo.length || newCompound.length ? 1 : 0;
}
}
