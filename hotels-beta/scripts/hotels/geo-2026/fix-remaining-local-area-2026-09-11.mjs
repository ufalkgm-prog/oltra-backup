#!/usr/bin/env node
/* The nine `local_area` rows the widened detector left outstanding.
 *
 * Seven compounds joined by a slash or the word "and", which every earlier
 * sweep missed because it only tested for a comma, plus two rows holding a
 * phrase that describes a location instead of naming one.
 *
 * Five are filled, four are CLEARED — and the four are the interesting half,
 * because in each case the stored value named somewhere the hotel is next to
 * rather than somewhere it is.
 *
 * ==== FILLED ====
 *
 * 2045  Four Seasons Seoul    "Gwanghwamun and Jongno-gu" -> "Gwanghwamun"
 *       Tier A, and the cleanest of the nine: "stands on Saemunan-ro in
 *       Gwanghwamun". Jongno-gu is the gu above it, so this is Lumphini over
 *       Pathum Wan and Marunouchi over Chiyoda for the third time.
 *
 * 2062  The Palace, Madrid
 *       "Plaza de las Cortes / Landscape of Light" -> "Barrio de las Letras"
 *       NEITHER half survives. Plaza de las Cortes is a square (the Plazoleta
 *       Nazarenas case) and "Landscape of Light" is a UNESCO designation over a
 *       boulevard, not a district. The answer is in the next sentence: "between
 *       the Cortes, Barrio de las Letras and Paseo del Prado" — of those three,
 *       the Cortes is the parliament facing the square, Paseo del Prado is a
 *       boulevard, and Barrio de las Letras is the only district. All five
 *       Madrid siblings are null, so there was no house value to match.
 *
 * 2066  Principe di Savoia   "Piazza della Repubblica / Porta Nuova"
 *                            -> "Porta Nuova"
 *       A square normalising to the district it sits in — Grosvenor Square ->
 *       Mayfair exactly.
 *
 * 2038  Four Seasons Doha    "West Bay and The Corniche" -> "West Bay"
 *       The Corniche is a seafront promenade, i.e. a road; West Bay is the
 *       district. Estrada Monumental -> Sao Martinho.
 *
 * 2036  Four Seasons Baku    "Caspian waterfront and Old City" -> "Sabail"
 *       THE ONLY ROW WHERE THE STORED VALUE WAS ACTIVELY WRONG rather than
 *       merely compound, and its own description is what catches it: "the
 *       medieval walls of the Old City rise just STEPS AWAY". Steps away is
 *       outside. The hotel is on Neftchilar Avenue at Azneft Square, about
 *       300m south of Icherisheher, in the Sabail raion — which contains both
 *       the Old City and the seafront. "Caspian waterfront" was never a place
 *       name at all. Tier B, and the weakest of the five: Sabail is correct but
 *       means less to a guest than the two things it replaces, so it is the one
 *       to look at first if any of these want changing.
 *
 * ==== CLEARED, because the value named a NEIGHBOUR, not a location ====
 *
 * 2065  Coworth Park  "Ascot / Windsor Great Park" -> null
 *       Read its own sentence: "lies IN Sunningdale ON THE EDGE OF Windsor
 *       Great Park, A FEW MILES FROM Ascot Racecourse". It is in Sunningdale,
 *       which is already its `city`; the two stored names are the park it
 *       borders and a town it is near. Sunningdale has no districts.
 *
 * 2061  Rosewood Kauri Cliffs  "Kauri Cliffs / Tepene Tablelands" -> null
 *       "Kauri Cliffs" is the estate, i.e. the hotel's own name echoed back.
 *       Tepene Tablelands is the farm's locality, not a district of Matauri
 *       Bay. A 6,000-acre working farm on a headland has no neighbourhoods —
 *       the Courchevel and Zermatt case §3 already records.
 *
 * 3015  &Beyond Sandibe   "Private concession bordering Moremi Game Reserve"
 * 3016  &Beyond Nxabega   same string -> null on both
 *       A sentence, not a place name, and identical on two lodges 50km apart,
 *       which alone shows it is not identifying either of them. Their own
 *       `city` and `area` both read "Okavango Delta" already, and their two
 *       siblings in that city — Mombo and Chief's Camp — were cleared earlier
 *       today for the same reason. Both UNPUBLISHED.
 *
 * ==== NOT TOUCHED, but noticed while checking the siblings ====
 * Two existing values in the same cities would not pass the rules applied
 * above. Neither is in scope here and both are recorded rather than changed:
 *   1467  Park Hyatt Milan   "Piazza del Duomo"        — a square
 *   1465  Palazzo Parigi     "Borgonuovo"              — a street in Brera
 *   2028  Mandarin Oriental Doha  "Msheireb Downtown Doha" — a development
 *         name, the UpperHills shape; the district is Msheireb.
 *
 * A ONE-TIME RECORD (§24).
 *
 *   node fix-remaining-local-area-2026-09-11.mjs              # dry run
 *   node fix-remaining-local-area-2026-09-11.mjs --confirm    # writes
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROLLBACK = path.join(HERE, "fix-remaining-local-area-2026-09-11-rollback.json");
const CONFIRM = process.argv.includes("--confirm");

const FIXES = [
  { id: 2045, city: "Seoul", from: "Gwanghwamun and Jongno-gu", to: "Gwanghwamun", tier: "A",
    why: '"stands on Saemunan-ro in Gwanghwamun"; Jongno-gu is the gu above it' },
  { id: 2062, city: "Madrid", from: "Plaza de las Cortes / Landscape of Light", to: "Barrio de las Letras", tier: "A",
    why: "a square and a UNESCO designation; the text names one district and it is this" },
  { id: 2066, city: "Milan", from: "Piazza della Repubblica / Porta Nuova", to: "Porta Nuova", tier: "B",
    why: "a square normalising to its district — Grosvenor Square -> Mayfair" },
  { id: 2038, city: "Doha", from: "West Bay and The Corniche", to: "West Bay", tier: "B",
    why: "the Corniche is a seafront promenade, i.e. a road" },
  { id: 2036, city: "Baku", from: "Caspian waterfront and Old City", to: "Sabail", tier: "B",
    why: 'its text says the Old City walls "rise just steps away" — outside it; Sabail is the raion' },

  { id: 2065, city: "Sunningdale", from: "Ascot / Windsor Great Park", to: null, tier: "A",
    why: '"lies IN Sunningdale" — already its city; the two names are a park it borders and a town it is near' },
  { id: 2061, city: "Matauri Bay", from: "Kauri Cliffs / Tepene Tablelands", to: null, tier: "A",
    why: "the estate echoes the hotel's own name; a 6,000-acre farm has no districts" },
  { id: 3015, city: "Okavango Delta", from: "Private concession bordering Moremi Game Reserve", to: null, tier: "A",
    why: "a sentence, not a place name; identical on 3016 50km away" },
  { id: 3016, city: "Okavango Delta", from: "Private concession bordering Moremi Game Reserve", to: null, tier: "A",
    why: "a sentence, not a place name; identical on 3015 50km away" },
];

/* Asserted, never written — the two rows whose emptiness is the precedent for
 * clearing 3015 and 3016. If someone has filled them, the Okavango convention
 * has changed and these two should be reconsidered rather than cleared. */
const PRECEDENT = [
  { id: 1002, name: "Mombo" },
  { id: 1003, name: "Chief's Camp" },
];

const URL_ = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const TOKEN = process.env.DIRECTUS_TOKEN;
if (!URL_ || !TOKEN) {
  console.error("Set DIRECTUS_URL and DIRECTUS_TOKEN.");
  process.exitCode = 1;
} else {

const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
const FIELDS = "id,hotel_name,city,local_area,published";
const ids = [...FIXES.map((f) => f.id), ...PRECEDENT.map((p) => p.id)];
const { data: rows } = await (await fetch(
  `${URL_}/items/hotels?limit=-1&filter[id][_in]=${ids.join(",")}&fields=${FIELDS}`, { headers: H }
)).json();
const byId = new Map(rows.map((r) => [String(r.id), r])); // ids are strings (§44)

const norm = (v) => { const s = String(v ?? "").trim(); return s === "" ? null : s; };

const planned = [];
const problems = [];

for (const p of PRECEDENT) {
  const row = byId.get(String(p.id));
  if (!row) { problems.push(`${p.id} ${p.name} — not found`); continue; }
  if (norm(row.local_area) !== null) {
    problems.push(`${p.id} ${p.name} — expected empty as the Okavango precedent, holds ${JSON.stringify(norm(row.local_area))}. Reconsider 3015/3016 before clearing them.`);
  }
}

for (const fix of FIXES) {
  const row = byId.get(String(fix.id));
  if (!row) { problems.push(`${fix.id} — not found`); continue; }
  if (norm(row.city) !== fix.city) {
    problems.push(`${fix.id} ${norm(row.hotel_name)} — city is ${JSON.stringify(norm(row.city))}, expected ${JSON.stringify(fix.city)}`);
    continue;
  }
  const current = norm(row.local_area);
  if (current === norm(fix.to)) { console.log(`  skip ${fix.id} ${norm(row.hotel_name)} — already set`); continue; }
  if (current !== fix.from) {
    problems.push(`${fix.id} ${norm(row.hotel_name)} — local_area is ${JSON.stringify(current)}, expected ${JSON.stringify(fix.from)}`);
    continue;
  }
  planned.push({ ...fix, name: norm(row.hotel_name), published: row.published });
}

console.log(`\n${CONFIRM ? "APPLYING" : "DRY RUN"} — the nine outstanding rows\n`);
for (const label of ["FILLED", "CLEARED"]) {
  const group = planned.filter((p) => (label === "FILLED" ? p.to !== null : p.to === null));
  if (!group.length) continue;
  console.log(`  ${label}`);
  for (const p of group) {
    console.log(`    [${p.id}] ${p.name} (${p.city})${p.published ? "" : "  (unpublished)"}   [${p.tier}]`);
    console.log(`          ${JSON.stringify(p.from)}`);
    console.log(`          -> ${p.to === null ? "null" : JSON.stringify(p.to)}`);
    console.log(`          ${p.why}`);
  }
}

if (problems.length) {
  console.error(`\n  ABORTING:`);
  for (const p of problems) console.error("    " + p);
  console.error("");
  process.exitCode = 1;
} else if (!CONFIRM) {
  const filled = planned.filter((p) => p.to !== null).length;
  console.log(`\n  ${planned.length} to change — ${filled} filled, ${planned.length - filled} cleared.`);
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
  console.log(`  ok ${p.id} ${p.name} -> ${p.to === null ? "(cleared)" : p.to}`);
}

let log = [];
if (fs.existsSync(ROLLBACK)) {
  try { log = JSON.parse(fs.readFileSync(ROLLBACK, "utf8")); } catch { log = []; }
}
log.push({ at: new Date().toISOString(), changes: applied });
fs.writeFileSync(ROLLBACK, JSON.stringify(log, null, 2), "utf8");

/* Sweep the whole collection with the widened detector, and with NO exemption
 * list this time — that was the point of the exercise. */
const { data: all } = await (await fetch(
  `${URL_}/items/hotels?limit=-1&fields=${FIELDS}`, { headers: H }
)).json();
const V = (h) => norm(h.local_area) ?? "";
const isCompound = (v) => v.includes(",") || v.includes("/") || / and /i.test(v);
const compound = all.filter((h) => V(h) && isCompound(V(h)));
const parens = all.filter((h) => V(h).includes("(") || V(h).includes(")"));
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
// A value long enough to be a sentence is the shape 3015/3016 had.
const longish = all.filter((h) => V(h).length > 30);
const populated = all.filter((h) => V(h)).length;

console.log(`\n  Sweep of ${all.length} rows — no exemption list`);
console.log(`     compound (, / and "and"):        ${compound.length}`);
for (const h of compound) console.log(`        [${h.id}] ${norm(h.hotel_name)} ${JSON.stringify(V(h))}`);
console.log(`     parentheticals:                  ${parens.length}`);
console.log(`     local_area repeating city:       ${echo.length}`);
console.log(`     prefix overlaps within a city:   ${overlaps.length}`);
for (const o of overlaps) console.log("        " + o);
console.log(`     values over 30 chars:            ${longish.length}`);
for (const h of longish) console.log(`        [${h.id}] ${JSON.stringify(V(h))}`);
console.log(`     local_area populated:            ${populated}`);
console.log(`\n  Applied ${applied.length}, failed ${failed}. Rollback appended.\n`);
process.exitCode = failed || compound.length || parens.length || echo.length || overlaps.length ? 1 : 0;
}
}
