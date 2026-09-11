#!/usr/bin/env node
/* Reduces the 17 compound `local_area` values to a single district.
 *
 * These were never internally wrong — each is used consistently within its
 * city. They are being split because `local_area` holds ONE district, and the
 * rule from the granularity pass decides which half survives:
 *
 *     the most precise value that is still a DISTRICT
 *
 * The halves differ in kind, so there is no mechanical rule — a street, a
 * square, a bay, a lake and a valley are all more precise than the district
 * beside them and none of them is a district. Each row is a separate call, and
 * the direction genuinely alternates: seven keep the first half, eight the
 * second, one keeps a name that was doubled, one is cleared.
 *
 * KEEP THE FINER HALF — it is a real neighbourhood, and the other half is the
 * city district above it:
 *   2006  Aman Nai Lert        Lumphini          khwaeng inside Pathum Wan khet
 *   2021  MO Bosphorus         Kurucesme         mahalle inside Besiktas
 *   2016  MO Wangfujing        Wangfujing        quarter inside Dongcheng
 *   2042  FS Guangzhou         Zhujiang New Town CBD inside Tianhe
 *   2051  Rosewood Courchevel  Jardin Alpin      the enclave; 1850 is the
 *                                                altitude village, and Jardin
 *                                                Alpin exists only in 1850
 *   3002  Amanfayun            Fayun Village     the settlement; West Lake
 *                                                Scenic Area is region-level
 *   3001  Amanvari             Costa Palmas      the estate; East Cape is a
 *                                                coastal region, and the area
 *                                                field already reads Los Cabos
 *
 * KEEP THE BROADER HALF — the finer one is a street, a square or a water
 * feature, so it is not a finer district but a landmark inside one:
 *   2012  Reid's Palace        Sao Martinho    Estrada Monumental is a road
 *   2013  Hotel Monasterio     Historic Centre Plazoleta Nazarenas is a square
 *   2011  Romazzino            Arzachena       Romazzino Bay is a bay
 *   2025  MO Costa Navarino    Costa Navarino  Navarino Bay is a bay
 *   2054  Schloss Fuschl       Hof bei Salzburg  Lake Fuschl is a lake
 *   2023  MO Mallorca          Calvia          Punta Negra is a headland
 *   2018  MO Shenzhen          Futian District UpperHills is a development,
 *                                              i.e. a building complex — the
 *                                              same shape as Grosvenor Square
 *   3029  Six Senses Thimphu   Babesa          Chunimeding is the hamlet at
 *                                              the site; Babesa is the
 *                                              recognised south-Thimphu district
 *
 * DOUBLED, NOT COMPOUND:
 *   2058  Rosewood Luang Prabang   "Ban Nadueay Village" -> "Ban Nadueay"
 *         Lao "ban" means village, so the stored value reads "Village Nadueay
 *         Village". Nahm Dong is the valley around it, not a district. This is
 *         the Giudecca Island -> Giudecca case. Fayun Village keeps its noun
 *         because "Fayun" alone carries none.
 *
 * CLEARED:
 *   2020  Mandarin Oriental Cortina   "Via Rinaldo Menardi, near Cortina
 *         centre" -> null. A street plus a phrase that is not a place name at
 *         all. Cortina has no district this hotel sits in, so there is nothing
 *         to reduce to and inventing one would be worse than an empty field.
 *
 * TWO THINGS THIS PASS DELIBERATELY DOES NOT FIX, both visible from the rows
 * above and both bigger than a local_area edit:
 *   - 2054's `city` reads "Salzburg", but Hof bei Salzburg is its own
 *     municipality ~20km east. local_area keeps the accurate locality for the
 *     same reason 1793 Fasano keeps "Punta del Este" — city is the wrong field.
 *   - 2023 has city "Majorca" and area "Mallorca", the same island spelled two
 *     ways in two fields.
 *
 * ONE THING IT DOES FIX IN PASSING: 1097 stores "DongCheng District" while
 * 1077 and the corrected 2016 use Beijing's ordinary casing. Same typo family
 * as Meatpackling, one row, so it rides along rather than needing its own file.
 *
 * A ONE-TIME RECORD (§24).
 *
 *   node split-compound-local-area-2026-09-11.mjs              # dry run
 *   node split-compound-local-area-2026-09-11.mjs --confirm    # writes
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROLLBACK = path.join(HERE, "split-compound-local-area-2026-09-11-rollback.json");
const CONFIRM = process.argv.includes("--confirm");

const FIXES = [
  { id: 2006, from: "Lumphini, Pathum Wan", to: "Lumphini", why: "khwaeng inside Pathum Wan khet" },
  { id: 2021, from: "Kuruçeşme, Beşiktaş", to: "Kuruçeşme", why: "mahalle inside Beşiktaş" },
  { id: 2016, from: "Wangfujing, Dongcheng District", to: "Wangfujing", why: "quarter inside Dongcheng" },
  { id: 2042, from: "Zhujiang New Town, Tianhe District", to: "Zhujiang New Town", why: "CBD inside Tianhe" },
  { id: 2051, from: "Jardin Alpin, Courchevel 1850", to: "Jardin Alpin", why: "the enclave; 1850 is the altitude village" },
  { id: 3002, from: "Fayun Village, West Lake Scenic Area", to: "Fayun Village", why: "the settlement; the scenic area is region-level" },
  { id: 3001, from: "Costa Palmas, East Cape", to: "Costa Palmas", why: "the estate; East Cape is a coastal region" },

  { id: 2012, from: "Estrada Monumental, São Martinho", to: "São Martinho", why: "Estrada Monumental is a road" },
  { id: 2013, from: "Plazoleta Nazarenas, Historic Centre", to: "Historic Centre", why: "Plazoleta Nazarenas is a square" },
  { id: 2011, from: "Romazzino Bay, Arzachena", to: "Arzachena", why: "Romazzino Bay is a bay" },
  { id: 2025, from: "Navarino Bay, Costa Navarino", to: "Costa Navarino", why: "Navarino Bay is a bay" },
  { id: 2054, from: "Lake Fuschl, Hof bei Salzburg", to: "Hof bei Salzburg", why: "Lake Fuschl is a lake" },
  { id: 2023, from: "Punta Negra, Calvià", to: "Calvià", why: "Punta Negra is a headland" },
  { id: 2018, from: "Futian District, UpperHills", to: "Futian District", why: "UpperHills is a development, not a district" },
  { id: 3029, from: "Chunimeding, Babesa", to: "Babesa", why: "Chunimeding is the hamlet at the site; Babesa is the district" },

  { id: 2058, from: "Ban Nadueay Village, Nahm Dong Valley", to: "Ban Nadueay", why: "Lao ban already means village" },

  { id: 2020, from: "Via Rinaldo Menardi, near Cortina centre", to: null, why: "a street plus a phrase that is not a place name" },

  { id: 1097, from: "DongCheng District", to: "Dongcheng District", why: "casing, to agree with 1077 and 2016" },
];

const URL_ = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const TOKEN = process.env.DIRECTUS_TOKEN;
if (!URL_ || !TOKEN) {
  console.error("Set DIRECTUS_URL and DIRECTUS_TOKEN.");
  process.exitCode = 1;
} else {

const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
const ids = FIXES.map((f) => f.id);
const { data: rows } = await (await fetch(
  `${URL_}/items/hotels?limit=-1&filter[id][_in]=${ids.join(",")}&fields=id,hotel_name,city,local_area`,
  { headers: H }
)).json();
const byId = new Map(rows.map((r) => [String(r.id), r])); // ids are strings (§44)

const planned = [];
const problems = [];

for (const fix of FIXES) {
  const row = byId.get(String(fix.id));
  if (!row) { problems.push(`${fix.id} — not found`); continue; }
  const current = String(row.local_area ?? "").trim();
  const target = fix.to ?? "";
  if (current === target) { console.log(`  skip ${fix.id} ${row.hotel_name?.trim()} — already set`); continue; }
  // Exact match, case included — 1097's whole defect is its casing.
  if (current !== fix.from) {
    problems.push(`${fix.id} ${row.hotel_name?.trim()} — local_area is ${JSON.stringify(current)}, expected ${JSON.stringify(fix.from)}`);
    continue;
  }
  planned.push({ ...fix, name: row.hotel_name?.trim(), city: row.city });
}

console.log(`\n${CONFIRM ? "APPLYING" : "DRY RUN"} — splitting compound local_area\n`);
for (const p of planned) {
  console.log(`  [${p.id}] ${p.name}  (${p.city})`);
  console.log(`        ${JSON.stringify(p.from)} -> ${p.to === null ? "null" : JSON.stringify(p.to)}`);
  console.log(`        ${p.why}`);
}

if (problems.length) {
  console.error(`\n  ABORTING:`);
  for (const p of problems) console.error("    " + p);
  console.error("");
  process.exitCode = 1;
} else if (!CONFIRM) {
  console.log(`\n  ${planned.length} to change. Dry run — re-run with --confirm to write.\n`);
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

/* Sweep the whole collection, not the rows touched — the check that has caught
 * a miss in three of this week's batches. Three conditions, all of which the
 * compound values were violating at once. */
const { data: all } = await (await fetch(
  `${URL_}/items/hotels?limit=-1&fields=id,hotel_name,city,local_area`, { headers: H }
)).json();
const V = (h) => String(h.local_area ?? "").trim();
const compound = all.filter((h) => V(h).includes(","));

const byCity = new Map();
for (const h of all) {
  const la = V(h), c = String(h.city ?? "").trim();
  if (!la || !c) continue;
  if (!byCity.has(c)) byCity.set(c, new Set());
  byCity.get(c).add(la);
}
/* Two states below are deliberate and would otherwise fail this run forever:
 *   New York "Midtown"  — 1654 Aman New York only. It sits on the line Midtown
 *     East and West divide on, so picking a side is precision the address does
 *     not support (recorded in the granularity pass).
 *   Soho / SoHo         — two cities, not one district spelled twice. London's
 *     Soho takes no capital H; New York's is short for South of Houston. The
 *     name pass set them this way on purpose. */
const ALLOWED_PREFIX = new Set(['New York: "Midtown"']);
const ALLOWED_CASE = new Set(["soho"]);

const overlaps = [];
for (const [c, set] of byCity) {
  const vals = [...set];
  for (const a of vals) for (const b of vals) {
    if (a === b || !b.toLowerCase().startsWith(a.toLowerCase())) continue;
    if (ALLOWED_PREFIX.has(`${c}: ${JSON.stringify(a)}`)) continue;
    overlaps.push(`${c}: ${JSON.stringify(a)} is a prefix of ${JSON.stringify(b)}`);
  }
}
// Same district spelled two ways anywhere in the collection.
const caseDupes = new Map();
for (const h of all) {
  const la = V(h); if (!la) continue;
  const k = la.toLowerCase();
  if (ALLOWED_CASE.has(k)) continue;
  if (!caseDupes.has(k)) caseDupes.set(k, new Set());
  caseDupes.get(k).add(la);
}
const caseSplit = [...caseDupes.values()].filter((s) => s.size > 1).map((s) => [...s].join(" / "));
const populated = all.filter((h) => V(h).length > 0).length;

console.log(`\n  Sweep of ${all.length} rows`);
console.log(`     compound values left:            ${compound.length}`);
for (const h of compound) console.log(`        [${h.id}] ${h.hotel_name?.trim()} ${JSON.stringify(V(h))}`);
console.log(`     prefix overlaps within a city:   ${overlaps.length}`);
for (const o of overlaps) console.log("        " + o);
console.log(`     one district, two spellings:     ${caseSplit.length}`);
for (const c of caseSplit) console.log("        " + c);
console.log(`     local_area populated:            ${populated}`);
console.log(`\n  Applied ${applied.length}, failed ${failed}. Rollback appended.\n`);
process.exitCode = failed || compound.length || overlaps.length || caseSplit.length ? 1 : 0;
}
}
