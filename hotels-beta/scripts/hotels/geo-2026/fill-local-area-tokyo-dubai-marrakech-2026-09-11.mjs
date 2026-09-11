#!/usr/bin/env node
/* Fills `local_area` for Tokyo, Dubai and Marrakech.
 *
 * Bangkok is deliberately NOT in this file — it needs one structural decision
 * (khet or khwaeng) that these three do not, and mixing it in would bury that.
 *
 * EVIDENCE TIERS. Every row below is marked A or B, and the difference is the
 * one that mattered in the Venice sestieri pass:
 *   A — the district is named in the hotel's OWN description. 21 of 26.
 *   B — the description names a road, a landmark or a broader zone, and the
 *       district comes from the property's address, i.e. from outside the
 *       data. 5 rows, all in Dubai, listed again at the bottom for review.
 *
 * A DEVELOPMENT IS NOT A DISTRICT — the Shenzhen UpperHills rule, and it
 * decides four rows here. Roppongi Hills, Tokyo Midtown, Otemachi One and
 * Azabudai Hills are building complexes; the districts are Roppongi, Otemachi
 * and Azabudai. This also CORRECTS an existing value: Janu Tokyo held
 * "Azabudai Hills", the development, and becomes "Azabudai".
 *
 * ==== TOKYO — 8 gaps + 1 correction, all tier A ====
 * Every description names its neighbourhood, so Tokyo needed no judgement at
 * all. Neighbourhoods, not wards: Chiyoda and Minato are the administrative
 * level, but nobody says them, and §3 asks for the most precise value that is
 * still a district.
 *   1136 Aman Tokyo            Otemachi     "upper levels of Otemachi Tower"
 *   1137 Bulgari Tokyo         Yaesu        "Tokyo Midtown Yaesu"
 *   1138 Four Seasons Otemachi Otemachi     "upper floors of Otemachi One"
 *   1139 Grand Hyatt Tokyo     Roppongi     "inside Roppongi Hills"
 *   1141 The Peninsula Tokyo   Marunouchi   "a privileged position in Marunouchi"
 *   1144 Ritz-Carlton Tokyo    Roppongi     "Midtown Tower in Roppongi"
 *   1146 EDITION Toranomon     Toranomon    named in the hotel's own name
 *   1148 Mandarin Oriental     Nihonbashi   "crowns the Nihonbashi Mitsui Tower"
 *   1819 Janu Tokyo            Azabudai     was "Azabudai Hills", a development
 *
 * ==== DUBAI — 11 gaps, 6 tier A and 5 tier B ====
 *   1598 Atlantis The Royal    Palm Jumeirah   A "above the crescent of Palm Jumeirah"
 *   1599 Bulgari Resort        Jumeira Bay Island  A "occupies Jumeira Bay Island".
 *        An island district reached by bridge — the Capella Singapore /
 *        Sentosa Island case, which §3 already keeps as genuinely sub-city.
 *        Spelled "Jumeira" without the h, which is the island's own name.
 *   1602 Four Seasons Jumeirah Beach  Jumeirah 2   A "Set on Jumeirah Beach
 *        Road in Jumeirah 2". Jumeirah's numbered sub-communities are real
 *        districts, and using them avoids a bare "Jumeirah" sitting as a
 *        prefix of "Jumeirah 2" — the Midtown problem.
 *   1606 One&Only The Palm     Palm Jumeirah   A "western crescent of Palm Jumeirah"
 *   1611 The Dubai EDITION     Downtown Dubai  A "a prime Downtown Dubai address"
 *   1617 W Dubai Mina Seyahi   Mina Seyahi     A "the long-established Mina
 *        Seyahi resort precinct", and in the hotel's own name.
 *   1612 The Lana             Business Bay    B the text says "Marasi Bay,
 *        where the Dubai Water Canal curves BETWEEN Business Bay, Downtown
 *        Dubai and Dubai Design District" — between three, so the address
 *        decides: Marasi Drive is Business Bay.
 *   1604 Mandarin Oriental Jumeira  Jumeirah 1  B the text names La Mer and
 *        Jumeirah Mosque, both Jumeirah 1, but never the sub-community.
 *   1605 One&Only Royal Mirage  Al Sufouh      B text names only what is NEAR
 *        it (Dubai Marina, Palm Jumeirah, JBR) — the estate itself is Al Sufouh.
 *   1600 Jumeirah Burj Al Arab  Umm Suqeim     B "its own island off Jumeirah
 *        Beach"; the mainland district is Umm Suqeim. UNPUBLISHED.
 *   1814 Jumeirah Marsa Al Arab Umm Suqeim     B "the Golden Peninsula,
 *        beside Burj Al Arab" — same stretch, so the two agree by construction.
 *
 *   NOT TOUCHED — 1614 The Ritz-Carlton, Ras Al Khaimah, Al Wadi Desert has
 *   city "Dubai" and coordinates 25.585,55.835, which is Ras Al Khaimah, a
 *   DIFFERENT EMIRATE about 90km away. Giving it a Dubai district would bury
 *   a `city` error under a `local_area` one. Flagged, not fixed — it needs the
 *   cityAirports rebuild that every city change needs.
 *
 * ==== MARRAKECH — 4 filled, 1 normalised, 5 deliberately left empty ====
 * The "1 of 10" gap is mostly not a gap. Half this roster is out-of-town
 * estates, and §3's own rule is that coverage is judged on whether the city
 * HAS districts for that property, not on the row count:
 *   1016 Amanjena          "lies just outside Marrakech"
 *   1018 Fairmont Royal Palm  "Route d'Amizmiz, about 12 kilometres from the
 *                             old medina"
 *   1022 Mandarin Oriental "Route du Golf Royal, about ten minutes from the
 *                          medina", 20 hectares of olive groves
 *   1027 The Oberoi        "Route de Ouarzazate, around 25 minutes from ...
 *                          the ancient walled city"
 *   1019 Four Seasons Resort — the one genuine open question, and the reason
 *        it is empty rather than guessed: its own text places it "BETWEEN the
 *        old medina and the city's modern Gueliz and Hivernage districts", so
 *        it names three and claims none. Boulevard de la Menara is not a
 *        district either. Left for review.
 * Filled:
 *   1017 El Fenn        Medina     A "at Bab El Ksour on the edge of ... medina"
 *   1021 La Mamounia    Medina     A "just inside Marrakech's medina walls"
 *   1026 Royal Mansour  Medina     A "just inside the city walls ... at the
 *                                    edge of the medina"
 *   1024 Palais Ronsard Palmeraie  A "in Marrakech's Palmeraie"
 *   1023 Nobu Marrakech Hivernage  — normalising "Hivernage district", the
 *        redundant-noun case (Giudecca Island -> Giudecca). UNPUBLISHED.
 *
 * A ONE-TIME RECORD (§24).
 *
 *   node fill-local-area-tokyo-dubai-marrakech-2026-09-11.mjs           # dry run
 *   node fill-local-area-tokyo-dubai-marrakech-2026-09-11.mjs --confirm # writes
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROLLBACK = path.join(HERE, "fill-local-area-tokyo-dubai-marrakech-2026-09-11-rollback.json");
const CONFIRM = process.argv.includes("--confirm");

/* `from` is asserted before writing. null means "must currently be empty", so
 * a value added by hand since this was drafted aborts rather than being
 * silently replaced. */
const FIXES = [
  // ---- Tokyo ----
  { id: 1136, city: "Tokyo", from: null, to: "Otemachi", tier: "A", why: '"upper levels of Otemachi Tower"' },
  { id: 1137, city: "Tokyo", from: null, to: "Yaesu", tier: "A", why: '"Tokyo Midtown Yaesu"' },
  { id: 1138, city: "Tokyo", from: null, to: "Otemachi", tier: "A", why: '"upper floors of Otemachi One"' },
  { id: 1139, city: "Tokyo", from: null, to: "Roppongi", tier: "A", why: '"inside Roppongi Hills" — the district, not the development' },
  { id: 1141, city: "Tokyo", from: null, to: "Marunouchi", tier: "A", why: '"a privileged position in Marunouchi"' },
  { id: 1144, city: "Tokyo", from: null, to: "Roppongi", tier: "A", why: '"Midtown Tower in Roppongi"' },
  { id: 1146, city: "Tokyo", from: null, to: "Toranomon", tier: "A", why: "named in the hotel's own name and text" },
  { id: 1148, city: "Tokyo", from: null, to: "Nihonbashi", tier: "A", why: '"crowns the Nihonbashi Mitsui Tower"' },
  { id: 1819, city: "Tokyo", from: "Azabudai Hills", to: "Azabudai", tier: "A", why: "Azabudai Hills is a development; the district is Azabudai" },

  // ---- Dubai ----
  { id: 1598, city: "Dubai", from: null, to: "Palm Jumeirah", tier: "A", why: '"above the crescent of Palm Jumeirah"' },
  { id: 1599, city: "Dubai", from: null, to: "Jumeira Bay Island", tier: "A", why: '"occupies Jumeira Bay Island" — an island district, the Sentosa case' },
  { id: 1602, city: "Dubai", from: null, to: "Jumeirah 2", tier: "A", why: '"Set on Jumeirah Beach Road in Jumeirah 2"' },
  { id: 1606, city: "Dubai", from: null, to: "Palm Jumeirah", tier: "A", why: '"western crescent of Palm Jumeirah"' },
  { id: 1611, city: "Dubai", from: null, to: "Downtown Dubai", tier: "A", why: '"a prime Downtown Dubai address"' },
  { id: 1617, city: "Dubai", from: null, to: "Mina Seyahi", tier: "A", why: '"the long-established Mina Seyahi resort precinct"' },
  { id: 1612, city: "Dubai", from: null, to: "Business Bay", tier: "B", why: "text says BETWEEN three districts; Marasi Drive is Business Bay" },
  { id: 1604, city: "Dubai", from: null, to: "Jumeirah 1", tier: "B", why: "text names La Mer and Jumeirah Mosque, both Jumeirah 1, but not the sub-community" },
  { id: 1605, city: "Dubai", from: null, to: "Al Sufouh", tier: "B", why: "text names only what is near it; the estate itself is Al Sufouh" },
  { id: 1600, city: "Dubai", from: null, to: "Umm Suqeim", tier: "B", why: '"its own island off Jumeirah Beach"; the mainland district is Umm Suqeim' },
  { id: 1814, city: "Dubai", from: null, to: "Umm Suqeim", tier: "B", why: '"beside Burj Al Arab" — the same stretch, so the two agree' },

  // ---- Marrakech ----
  { id: 1017, city: "Marrakech", from: null, to: "Medina", tier: "A", why: '"at Bab El Ksour on the edge of Marrakech\'s medina"' },
  { id: 1021, city: "Marrakech", from: null, to: "Medina", tier: "A", why: '"just inside Marrakech\'s medina walls on Avenue Bab Jdid"' },
  { id: 1026, city: "Marrakech", from: null, to: "Medina", tier: "A", why: '"just inside the city walls ... at the edge of the medina"' },
  { id: 1024, city: "Marrakech", from: null, to: "Palmeraie", tier: "A", why: '"in Marrakech\'s Palmeraie"' },
  { id: 1023, city: "Marrakech", from: "Hivernage district", to: "Hivernage", tier: "A", why: "redundant noun, the Giudecca Island case" },
];

/* Rows in these cities that stay empty ON PURPOSE, so a later pass does not
 * read them as an unfinished job. Asserted empty; the run aborts if one has
 * been filled since, because that would mean someone disagreed. */
const DELIBERATELY_EMPTY = {
  1016: "Amanjena — 'lies just outside Marrakech'",
  1018: "Fairmont Royal Palm — 'about 12 kilometres from the old medina'",
  1022: "Mandarin Oriental Marrakech — 'Route du Golf Royal, about ten minutes from the medina'",
  1027: "The Oberoi Marrakech — 'Route de Ouarzazate, around 25 minutes' out",
  1019: "Four Seasons Resort Marrakech — its text places it BETWEEN medina, Gueliz and Hivernage, naming three and claiming none. FOR REVIEW.",
  1614: "Ritz-Carlton Al Wadi Desert — city says Dubai but it is in Ras Al Khaimah, 90km away. The `city` is the bug. FOR REVIEW.",
};

const URL_ = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const TOKEN = process.env.DIRECTUS_TOKEN;
if (!URL_ || !TOKEN) {
  console.error("Set DIRECTUS_URL and DIRECTUS_TOKEN.");
  process.exitCode = 1;
} else {

const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
const FIELDS = "id,hotel_name,city,local_area,published";
const ids = [...FIXES.map((f) => f.id), ...Object.keys(DELIBERATELY_EMPTY).map(Number)];
const { data: rows } = await (await fetch(
  `${URL_}/items/hotels?limit=-1&filter[id][_in]=${ids.join(",")}&fields=${FIELDS}`, { headers: H }
)).json();
const byId = new Map(rows.map((r) => [String(r.id), r])); // ids are strings (§44)

const norm = (v) => { const s = String(v ?? "").trim(); return s === "" ? null : s; };

const planned = [];
const problems = [];

for (const [id, note] of Object.entries(DELIBERATELY_EMPTY)) {
  const row = byId.get(String(id));
  if (!row) { problems.push(`${id} — not found`); continue; }
  if (norm(row.local_area) !== null) {
    problems.push(`${id} ${row.hotel_name?.trim()} — meant to stay empty but now holds ${JSON.stringify(norm(row.local_area))}. Someone disagreed; resolve before re-running. (${note})`);
  }
}

for (const fix of FIXES) {
  const row = byId.get(String(fix.id));
  if (!row) { problems.push(`${fix.id} — not found`); continue; }
  if (norm(row.city) !== fix.city) {
    problems.push(`${fix.id} ${row.hotel_name?.trim()} — city is ${JSON.stringify(norm(row.city))}, expected ${JSON.stringify(fix.city)}`);
    continue;
  }
  const current = norm(row.local_area);
  if (current === fix.to) { console.log(`  skip ${fix.id} ${row.hotel_name?.trim()} — already set`); continue; }
  if (current !== norm(fix.from)) {
    problems.push(`${fix.id} ${row.hotel_name?.trim()} — local_area is ${JSON.stringify(current)}, expected ${JSON.stringify(norm(fix.from))}`);
    continue;
  }
  planned.push({ ...fix, name: row.hotel_name?.trim(), published: row.published });
}

console.log(`\n${CONFIRM ? "APPLYING" : "DRY RUN"} — filling local_area\n`);
let city = "";
for (const p of planned) {
  if (p.city !== city) { city = p.city; console.log(`  ${city}`); }
  console.log(`    [${p.id}] ${p.name}${p.published ? "" : "  (unpublished)"}`);
  console.log(`          ${p.from === null ? "(empty)" : JSON.stringify(p.from)} -> ${JSON.stringify(p.to)}   [${p.tier}]  ${p.why}`);
}
console.log(`\n  Staying empty on purpose: ${Object.keys(DELIBERATELY_EMPTY).length}`);
for (const [id, note] of Object.entries(DELIBERATELY_EMPTY)) console.log(`    [${id}] ${note}`);

if (problems.length) {
  console.error(`\n  ABORTING:`);
  for (const p of problems) console.error("    " + p);
  console.error("");
  process.exitCode = 1;
} else if (!CONFIRM) {
  const a = planned.filter((p) => p.tier === "A").length;
  console.log(`\n  ${planned.length} to change — ${a} tier A (named in the hotel's own text), ${planned.length - a} tier B (from the address).`);
  console.log("  Dry run — re-run with --confirm to write.\n");
} else {

const applied = [];
let failed = 0;
for (const p of planned) {
  const r = await fetch(`${URL_}/items/hotels/${p.id}`, {
    method: "PATCH", headers: H, body: JSON.stringify({ local_area: p.to }),
  });
  if (!r.ok) { console.error(`  FAILED ${p.id}: ${r.status} ${await r.text()}`); failed += 1; continue; }
  applied.push(p);
  console.log(`  ok ${p.id} ${p.name} -> ${p.to}`);
}

let log = [];
if (fs.existsSync(ROLLBACK)) {
  try { log = JSON.parse(fs.readFileSync(ROLLBACK, "utf8")); } catch { log = []; }
}
log.push({ at: new Date().toISOString(), changes: applied });
fs.writeFileSync(ROLLBACK, JSON.stringify(log, null, 2), "utf8");

/* Sweep the whole collection, not the rows touched. The first two are the
 * defects every local_area pass this week has had to re-check; the third is
 * new here, because filling a city is exactly when two levels of granularity
 * get mixed. */
const { data: all } = await (await fetch(
  `${URL_}/items/hotels?limit=-1&fields=${FIELDS}`, { headers: H }
)).json();
const V = (h) => norm(h.local_area) ?? "";
const compound = all.filter((h) => V(h).includes(","));
const echo = all.filter((h) => V(h) && V(h) === norm(h.city));

const ALLOWED_PREFIX = new Set(['New York: "Midtown"']); // Aman NY, see §3
const byCity = new Map();
for (const h of all) {
  const la = V(h), c = norm(h.city);
  if (!la || !c) continue;
  if (!byCity.has(c)) byCity.set(c, new Set());
  byCity.get(c).add(la);
}
const overlaps = [];
for (const [c, set] of byCity) {
  const vals = [...set];
  for (const a of vals) for (const b of vals) {
    if (a === b || !b.toLowerCase().startsWith(a.toLowerCase())) continue;
    if (ALLOWED_PREFIX.has(`${c}: ${JSON.stringify(a)}`)) continue;
    overlaps.push(`${c}: ${JSON.stringify(a)} is a prefix of ${JSON.stringify(b)}`);
  }
}
const populated = all.filter((h) => V(h)).length;

console.log(`\n  Sweep of ${all.length} rows`);
console.log(`     compound values:                 ${compound.length}`);
for (const h of compound) console.log(`        [${h.id}] ${h.hotel_name?.trim()} ${JSON.stringify(V(h))}`);
console.log(`     local_area repeating city:       ${echo.length}`);
console.log(`     prefix overlaps within a city:   ${overlaps.length}`);
for (const o of overlaps) console.log("        " + o);
console.log(`     local_area populated:            ${populated}`);
for (const c of ["Tokyo", "Dubai", "Marrakech", "Bangkok"]) {
  const rs = all.filter((h) => norm(h.city) === c);
  console.log(`        ${c.padEnd(10)} ${rs.filter((h) => V(h)).length}/${rs.length}`);
}
console.log(`\n  Applied ${applied.length}, failed ${failed}. Rollback appended.\n`);
process.exitCode = failed || compound.length || echo.length || overlaps.length ? 1 : 0;
}
}
