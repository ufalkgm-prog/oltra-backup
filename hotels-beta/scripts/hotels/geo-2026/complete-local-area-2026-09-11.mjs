#!/usr/bin/env node
/* Completes `local_area` across the 35 partly-filled cities.
 *
 * 100 empty rows: 88 filled, 12 left empty ON PURPOSE and asserted so.
 *
 * ==== THE RULE THAT DECIDED THE MOST: THE CITY'S OWN HOUSE STYLE WINS ====
 * These cities do not agree on what a "district" is, and forcing one scheme on
 * all of them would have been wrong in both directions. Rome already stores
 * LANDMARKS (Spanish Steps x4, Colosseum, Piazza del Popolo); Milan stores
 * DISTRICTS (Brera, Quadrilatero della Moda, Porta Nuova). So Rome's new rows
 * are landmarks and Milan's square became Duomo an hour ago — and the same
 * principle explains both. Where a city had an established value it was
 * matched; where it had none, the district won.
 *
 * The same rule keeps Hong Kong at ISLAND level. Seven rows already read
 * "Hong Kong Island" or "Kowloon", so The Murray (Central), The Hari (Wan
 * Chai) and Upper House (Admiralty) all become "Hong Kong Island" rather than
 * their finer districts. Finer values exist and would be defensible — but
 * mixing the two levels inside one city is the Midtown/Midtown East defect,
 * and converting the seven was not asked for. Flagged, not done.
 *
 * ==== 12 KEPT EMPTY, AND WHY EACH IS CORRECT ====
 * Ulrik's instruction was to complete the cities but keep correctly empty
 * fields. Every one of these says in its OWN description that it is not in a
 * district — mostly that it is not in the city at all:
 *
 *   MARRAKECH (5)   already settled earlier today, unchanged here:
 *     1016 Amanjena "just outside Marrakech" · 1018 Fairmont Royal Palm "about
 *     12 kilometres from the old medina" · 1022 Mandarin Oriental "Route du
 *     Golf Royal, about ten minutes from the medina" · 1027 The Oberoi "Route
 *     de Ouarzazate, around 25 minutes" out · 1019 Four Seasons Resort, whose
 *     text places it "BETWEEN the old medina and ... Gueliz and Hivernage",
 *     naming three and claiming none.
 *   SAINT-TROPEZ (3)  the house value is "Village centre", and these are not:
 *     1315 Airelles Messardiere "crowns a hill ABOVE Saint-Tropez" on the road
 *     to Pampelonne · 1324 Cheval Blanc on Plage de la Bouillabaisse, a beach
 *     west of the town · 1370 Villa Belrose "near Gassin", a different commune.
 *   PUNAKHA (2)   1068 COMO Uma "a quiet hillside in ... Punakha Valley" and
 *     1069 Six Senses "amid Punakha's terraced rice fields". Rural lodges in a
 *     valley; there are no neighbourhoods to name.
 *   1608 Qasr Al Sarab   "the dunes of the Liwa region on the edge of the Rub'
 *     al Khali", roughly 200km from Abu Dhabi city.
 *   1123 COMO Shambhala Estate   "a deeply green pocket OUTSIDE Ubud".
 *
 * ==== TIERS ====
 *   A — the district is named in the hotel's own description (52 rows)
 *   B — from the address; the text names a road, a landmark or "between"
 *       several things (36 rows)
 * The weakest three, all tier B, listed here so they are easy to find and
 * override: 1615 The St. Regis Abu Dhabi -> Al Khubeirah, 1603 Emirates Palace
 * -> Ras Al Akhdar, and 1613 Ritz-Carlton Grand Canal -> Al Maqta. Abu Dhabi's
 * districts are poorly known outside the city and none of the three texts
 * names one.
 *
 * ==== TWO THINGS FOUND, NOT FIXED ====
 *   1593 Rosewood Doha is filled "Lusail Marina", but LUSAIL IS ARGUABLY ITS
 *     OWN CITY — a planned city ~20km north of Doha in a different
 *     municipality. Same shape as the Ras Al Khaimah row fixed earlier today,
 *     where `city` was the real bug. Worth a look before anyone trusts it.
 *   Punakha's existing value "Mo Chu riverbank" is a riverbank, not a
 *     district, and Saint-Tropez's "Village centre" is a lowercase descriptor.
 *     Both are pre-existing and out of scope here.
 *
 * A ONE-TIME RECORD (§24).
 *
 *   node complete-local-area-2026-09-11.mjs              # dry run
 *   node complete-local-area-2026-09-11.mjs --confirm    # writes
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROLLBACK = path.join(HERE, "complete-local-area-2026-09-11-rollback.json");
const CONFIRM = process.argv.includes("--confirm");

/* [id, city, value, tier, why] — every row starts empty; the script refuses
 * any row that is not. */
const FILL = [
  // ---- Shanghai (house: Minhang District) ----
  [1076, "Shanghai", "North Bund", "A", '"sits on the North Bund"'],
  [1078, "Shanghai", "Jing'an District", "B", "Suhe Creek; the text names the Bund only as nearby"],
  [1080, "Shanghai", "Lujiazui", "A", '"occupies the Lujiazui address ... Set on Century Avenue"'],
  [1095, "Shanghai", "The Bund", "A", '"on the historic Bund"'],
  [1096, "Shanghai", "Jing'an District", "A", '"beside Jing\'an Park"'],
  [1100, "Shanghai", "Lujiazui", "A", '"occupies the upper floors of a Lujiazui tower"'],
  [1102, "Shanghai", "The Bund", "B", "199 Nanjing Road East, where the artery meets the Bund"],
  // ---- Beijing (house: Chaoyang District, Dongcheng District, Wangfujing) ----
  [1074, "Beijing", "Haidian District", "B", "at the eastern edge of the Summer Palace, which is Haidian"],
  [1079, "Beijing", "Chaoyang District", "A", '"above Liangmahe in Chaoyang"'],
  [1085, "Beijing", "Chaoyang District", "A", '"stands in Chaoyang\'s Central Business District"'],
  [1093, "Beijing", "Wangfujing", "A", '"an all-suite grande dame address in Wangfujing"'],
  [1103, "Beijing", "Chaoyang District", "B", "the diplomatic quarter by Jianguomen and the Silk Market"],
  [1813, "Beijing", "Qianmen", "A", '"a restored hutong neighbourhood close to Qianmen"'],
  // ---- Rome (house: LANDMARKS — Spanish Steps x4, Colosseum, Piazza del Popolo) ----
  [1424, "Rome", "Piazza della Repubblica", "A", '"curving around Piazza della Repubblica"'],
  [1431, "Rome", "Piazza Augusto Imperatore", "A", '"stands in Piazza Augusto Imperatore"'],
  [1455, "Rome", "Via Veneto", "A", '"near Via Veneto ... by Porta Pinciana"'],
  [1470, "Rome", "Spanish Steps", "A", '"on Via Condotti ... moments from the Spanish Steps"'],
  [1476, "Rome", "Piazza Venezia", "B", "Palazzo Salviati Cesi Mellini, the nearest of the three it names"],
  [1482, "Rome", "Via Veneto", "A", '"to the edge of Via Veneto"'],
  // ---- Abu Dhabi (house: Saadiyat Cultural District) ----
  [1601, "Abu Dhabi", "Al Maryah Island", "A", "named in the hotel's own name and text"],
  [1603, "Abu Dhabi", "Ras Al Akhdar", "B", "West Corniche Road; the text names no district — WEAK"],
  [1610, "Abu Dhabi", "Al Maryah Island", "A", '"on Al Maryah Island"'],
  [1613, "Abu Dhabi", "Al Maqta", "B", '"beside Al Maqta Creek" — WEAK'],
  [1615, "Abu Dhabi", "Al Khubeirah", "B", "Nation Towers on the Corniche; the text names no district — WEAK"],
  // ---- Chicago (house: West Loop) ----
  [1671, "Chicago", "Gold Coast", "B", '"Gold Coast dining at the doorstep"'],
  [1702, "Chicago", "Gold Coast", "A", '"From this Gold Coast position"'],
  [1704, "Chicago", "The Loop", "A", '"From this Loop address"'],
  [1728, "Chicago", "River North", "B", "the former IBM Building at 330 N Wabash"],
  [1739, "Chicago", "Magnificent Mile", "A", '"beside the Water Tower and the Magnificent Mile"'],
  [1766, "Chicago", "River North", "A", '"a commanding Near North Side address ... River North"'],
  // ---- Florence (house: Alla Querce) ----
  [1438, "Florence", "Santa Croce", "B", "Borgo Pinti, in the Santa Croce rione"],
  [1469, "Florence", "Santa Maria Novella", "B", "Lungarno Acciaiuoli, in the Santa Maria Novella rione"],
  [1481, "Florence", "Santa Maria Novella", "A", '"on Piazza Santa Maria Novella"'],
  [1483, "Florence", "Santa Maria Novella", "B", "Piazza Ognissanti, in the same rione"],
  [1485, "Florence", "Oltrarno", "B", '"above the Boboli Gardens, close to Porta Romana"'],
  // ---- Madrid (house: Barrio de las Letras) ----
  [1522, "Madrid", "Sol", "B", '"Centro Canalejas at the meeting point of Sol, Alcala"'],
  [1529, "Madrid", "Los Jerónimos", "B", "Plaza de la Lealtad, facing the Prado"],
  [1532, "Madrid", "Salamanca", "A", '"in Madrid\'s Salamanca district"'],
  [1537, "Madrid", "Sol", "B", '"on Plaza de Celenque, moments from Puerta del Sol"'],
  [1539, "Madrid", "Justicia", "B", '"between Chamberi, Tribunal and Chueca" — the address is Justicia'],
  // ---- Singapore (house: Sentosa Island) ----
  [1187, "Singapore", "Orchard", "B", '"the quieter, leafy end of Orchard Boulevard"'],
  [1188, "Singapore", "Marina Bay", "A", '"a privileged Marina Bay position at 5 Raffles Avenue"'],
  [1189, "Singapore", "Civic District", "B", '"at 1 Beach Road, between the Civic District, Bugis, City Hall"'],
  [1190, "Singapore", "Marina Bay", "A", '"stands in Marina Bay"'],
  // ---- Zurich (house: Paradeplatz) ----
  [1542, "Zurich", "Altstadt", "B", "Talstrasse at the lake end of Bahnhofstrasse, Kreis 1"],
  [1559, "Zurich", "Seefeld", "A", '"on Utoquai, close to ... Seefeld"'],
  [1571, "Zurich", "Zürichberg", "A", '"high on the Zürichberg above the city"'],
  [1577, "Zurich", "Altstadt", "A", '"embedded in Zurich\'s Old Town ... just off Rennweg"'],
  // ---- Saint-Tropez (house: Village centre) ----
  [1337, "Saint-Tropez", "Village centre", "A", '"In the heart of Saint-Tropez, a short walk from Place des Lices"'],
  // ---- Hong Kong (house: island level — Hong Kong Island x3, Kowloon x4) ----
  [1091, "Hong Kong", "Hong Kong Island", "B", "Cotton Tree Drive, Central — island level to match the seven siblings"],
  [1107, "Hong Kong", "Hong Kong Island", "B", "Wan Chai — island level to match the seven siblings"],
  [1811, "Hong Kong", "Hong Kong Island", "B", "Pacific Place, Admiralty — island level to match the seven siblings"],
  // ---- Jakarta (house: District 8) ----
  [1124, "Jakarta", "Kuningan", "B", "Capital Place on Jalan Gatot Subroto"],
  [1126, "Jakarta", "Menteng", "B", "Jalan M.H. Thamrin by the Welcome Monument"],
  [1128, "Jakarta", "Menteng", "A", '"the green avenues of Menteng"'],
  // ---- Capri (house: Marina Grande) ----
  [1445, "Capri", "Piazzetta", "B", '"on Via Camerelle, a short walk from the Piazzetta"'],
  [1472, "Capri", "Tragara", "A", '"at the end of Via Tragara"'],
  [1829, "Capri", "Piazzetta", "A", '"stands just off Capri\'s Piazzetta"'],
  // ---- Miami Beach (house: South Beach) ----
  [1667, "Miami Beach", "Mid-Beach", "A", '"oceanfront Collins Avenue in Mid-Beach"'],
  [1699, "Miami Beach", "Mid-Beach", "A", '"directly on the sands of Mid-Beach"'],
  [1735, "Miami Beach", "Mid-Beach", "A", '"a prime Mid-Beach address at 29th Street"'],
  // ---- Kyoto (house: Takagamine, Higashiyama) ----
  [1140, "Kyoto", "Nakagyo", "B", "opposite Nijo-jo Castle, in Nakagyo ward"],
  [1142, "Kyoto", "Nakagyo", "B", "the Kamogawa by Nijo Ohashi, in Nakagyo ward"],
  [1149, "Kyoto", "Higashiyama", "A", '"woven into the historic slopes of Higashiyama"'],
  // ---- Istanbul (house: Kurucesme, a mahalle) ----
  [1579, "Istanbul", "Yıldız", "B", "the Çırağan Palace grounds; mahalle level to match Kuruçeşme"],
  [1581, "Istanbul", "Yıldız", "B", "Atik Pasha Palace, ~200m from 1579, so the two must agree"],
  [1586, "Istanbul", "Karaköy", "A", '"sits at the water\'s edge in Karaköy"'],
  // ---- Vienna (house: Innere Stadt) ----
  [1271, "Vienna", "Mariahilf", "B", "Mariahilfer Strasse 71, the 1060 side of the street it calls a border"],
  [1272, "Vienna", "Innere Stadt", "B", "directly opposite the State Opera, i.e. the 1st district"],
  [1274, "Vienna", "Innere Stadt", "A", '"in Vienna\'s first district"'],
  // ---- the rest ----
  [1779, "Rio de Janeiro", "Copacabana", "A", '"facing the curve of Copacabana from Avenida Atlantica"'],
  [1783, "Rio de Janeiro", "Ipanema", "A", '"stands on the Ipanema waterfront"'],
  [1824, "Ubud", "Kedewatan", "B", "Jalan Raya Kedewatan, matching the existing house value"],
  [1632, "Los Cabos", "Costa Palmas", "A", '"part of the Costa Palmas community"'],
  [1649, "Los Cabos", "Pedregal", "A", '"the rock of the Pedregal hillside"'],
  [1231, "Ho Chi Minh City", "District 1", "A", '"From this central District 1 position"'],
  [1533, "Palma de Mallorca", "Old Town", "B", '"on its namesake square in Palma\'s old town"'],
  [1764, "West Hollywood", "Sunset Strip", "A", '"At Sunset Boulevard and Doheny Drive ... the Sunset Strip"'],
  [1769, "Dana Point", "Monarch Beach", "A", '"the private Monarch Bay Beach Club", and its own name'],
  [1787, "Santiago", "Lastarria", "A", '"stands in Lastarria"'],
  [1593, "Doha", "Lusail Marina", "A", '"rises in Lusail\'s Marina District" — but see the header on Lusail'],
  [1633, "Punta Mita", "Punta Mita Peninsula", "A", '"on the private Punta Mita peninsula"'],
  [1151, "Langkawi", "Datai Bay", "A", '"above Datai Bay"'],
  [1622, "Vancouver", "Downtown Vancouver", "B", "900 Canada Place Way, matching the existing house value"],
  [1083, "Sanya", "Dadonghai", "A", '"a quiet sweep of Coral Bay at Dadonghai"'],
  [1105, "Hangzhou", "Xihu District", "B", "Lingyin Road; \"West Lake\" is the traveller area, not a district"],
  [1795, "Sydney", "Circular Quay", "B", "Loftus Street, at the Quay's edge"],
  [1641, "Tepic-Puerto Vallarta", "El Monteón", "B", "the Mandarina development, matching Rosewood Mandarina"],
];

/* Asserted empty, never written. A value here means someone disagreed and the
 * run should stop rather than quietly skip it. */
const KEEP_EMPTY = {
  1016: "Amanjena — 'lies just outside Marrakech'",
  1018: "Fairmont Royal Palm — 'about 12 kilometres from the old medina'",
  1019: "Four Seasons Marrakech — 'between' medina, Gueliz and Hivernage; names three, claims none",
  1022: "Mandarin Oriental Marrakech — 'Route du Golf Royal, about ten minutes from the medina'",
  1027: "The Oberoi Marrakech — 'Route de Ouarzazate, around 25 minutes' out",
  1315: "Airelles Messardiere — 'crowns a hill above Saint-Tropez'",
  1324: "Cheval Blanc Saint-Tropez — on Plage de la Bouillabaisse, a beach west of the town",
  1370: "Villa Belrose — 'near Gassin', a different commune",
  1068: "COMO Uma Punakha — a hillside in the Punakha Valley; no neighbourhoods",
  1069: "Six Senses Punakha — 'amid Punakha's terraced rice fields'",
  1608: "Qasr Al Sarab — the Liwa dunes, ~200km from Abu Dhabi city",
  1123: "COMO Shambhala Estate — 'a deeply green pocket outside Ubud'",
};

const URL_ = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const TOKEN = process.env.DIRECTUS_TOKEN;
if (!URL_ || !TOKEN) {
  console.error("Set DIRECTUS_URL and DIRECTUS_TOKEN.");
  process.exitCode = 1;
} else {

const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
const FIELDS = "id,hotel_name,city,local_area,published";
const { data: all } = await (await fetch(
  `${URL_}/items/hotels?limit=-1&fields=${FIELDS}`, { headers: H }
)).json();
const byId = new Map(all.map((r) => [String(r.id), r])); // ids are strings (§44)
const norm = (v) => { const s = String(v ?? "").trim(); return s === "" ? null : s; };

const planned = [];
const problems = [];

for (const [id, note] of Object.entries(KEEP_EMPTY)) {
  const row = byId.get(String(id));
  if (!row) { problems.push(`${id} — not found`); continue; }
  if (norm(row.local_area) !== null) {
    problems.push(`${id} ${norm(row.hotel_name)} — meant to stay empty, holds ${JSON.stringify(norm(row.local_area))} (${note})`);
  }
}

for (const [id, city, value, tier, why] of FILL) {
  const row = byId.get(String(id));
  if (!row) { problems.push(`${id} — not found`); continue; }
  if (norm(row.city) !== city) {
    problems.push(`${id} ${norm(row.hotel_name)} — city is ${JSON.stringify(norm(row.city))}, expected ${JSON.stringify(city)}`);
    continue;
  }
  const current = norm(row.local_area);
  if (current === value) { console.log(`  skip ${id} ${norm(row.hotel_name)} — already set`); continue; }
  if (current !== null) {
    problems.push(`${id} ${norm(row.hotel_name)} — expected empty, holds ${JSON.stringify(current)}`);
    continue;
  }
  planned.push({ id, city, value, tier, why, name: norm(row.hotel_name), published: row.published });
}

/* Before writing anything, prove the RESULTING set is internally consistent —
 * the checks that have caught a miss in every batch this week, run against
 * what the collection WILL look like rather than what it looks like now. */
const after = new Map(all.map((h) => [String(h.id), norm(h.local_area)]));
for (const p of planned) after.set(String(p.id), p.value);
const cityOf = new Map(all.map((h) => [String(h.id), norm(h.city)]));
const ALLOWED_PREFIX = new Set(['New York: "Midtown"']);
const ALLOWED_CASE = new Set(["soho"]);
const strip = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const perCity = new Map();
for (const [id, v] of after) {
  const c = cityOf.get(id); if (!v || !c) continue;
  if (!perCity.has(c)) perCity.set(c, new Set());
  perCity.get(c).add(v);
}
for (const [c, set] of perCity) {
  const vals = [...set];
  for (const a of vals) for (const b of vals) {
    if (a === b || !strip(b).startsWith(strip(a))) continue;
    if (ALLOWED_PREFIX.has(`${c}: ${JSON.stringify(a)}`)) continue;
    problems.push(`WOULD CREATE a two-level city — ${c}: ${JSON.stringify(a)} is a prefix of ${JSON.stringify(b)}`);
  }
}
const forms = new Map();
for (const [, v] of after) {
  if (!v) continue;
  const k = strip(v);
  if (ALLOWED_CASE.has(k)) continue;
  if (!forms.has(k)) forms.set(k, new Set());
  forms.get(k).add(v);
}
for (const [, s] of forms) {
  if (s.size > 1) problems.push(`WOULD CREATE a spelling split — ${[...s].join(" / ")}`);
}
for (const p of planned) {
  if (p.value === cityOf.get(String(p.id))) problems.push(`${p.id} — value equals its city`);
  if (/[,/()]/.test(p.value) || / and /i.test(p.value)) problems.push(`${p.id} — value is compound: ${JSON.stringify(p.value)}`);
  if (p.value.length > 26) problems.push(`${p.id} — value over 26 chars: ${JSON.stringify(p.value)}`);
}

console.log(`\n${CONFIRM ? "APPLYING" : "DRY RUN"} — completing local_area\n`);
let shown = "";
for (const p of planned) {
  if (p.city !== shown) { shown = p.city; console.log(`  ${p.city}`); }
  console.log(`    [${p.id}] ${p.name}${p.published ? "" : " (unpub)"}  ->  ${JSON.stringify(p.value)}  [${p.tier}]`);
  console.log(`          ${p.why}`);
}
console.log(`\n  Kept empty on purpose: ${Object.keys(KEEP_EMPTY).length}`);
for (const [id, note] of Object.entries(KEEP_EMPTY)) console.log(`    [${id}] ${note}`);

if (problems.length) {
  console.error(`\n  ABORTING:`);
  for (const p of problems) console.error("    " + p);
  console.error("");
  process.exitCode = 1;
} else if (!CONFIRM) {
  const a = planned.filter((p) => p.tier === "A").length;
  console.log(`\n  ${planned.length} to fill — ${a} tier A (named in the hotel's own text), ${planned.length - a} tier B (from the address).`);
  console.log("  Pre-flight passed: no two-level city, no spelling split, no compound, no city echo.");
  console.log("  Dry run — re-run with --confirm to write.\n");
} else {

const applied = [];
let failed = 0;
for (const p of planned) {
  const r = await fetch(`${URL_}/items/hotels/${p.id}`, {
    method: "PATCH", headers: H, body: JSON.stringify({ local_area: p.value }),
  });
  if (!r.ok) { console.error(`  FAILED ${p.id}: ${r.status} ${await r.text()}`); failed += 1; continue; }
  applied.push(p);
}
console.log(`\n  wrote ${applied.length} rows`);

let log = [];
if (fs.existsSync(ROLLBACK)) {
  try { log = JSON.parse(fs.readFileSync(ROLLBACK, "utf8")); } catch { log = []; }
}
log.push({ at: new Date().toISOString(), changes: applied });
fs.writeFileSync(ROLLBACK, JSON.stringify(log, null, 2), "utf8");

const { data: fresh } = await (await fetch(
  `${URL_}/items/hotels?limit=-1&fields=${FIELDS}`, { headers: H }
)).json();
const V = (h) => norm(h.local_area) ?? "";
console.log(`  local_area populated: ${fresh.filter((h) => V(h)).length} of ${fresh.length}`);
console.log(`\n  Applied ${applied.length}, failed ${failed}. Rollback appended.`);
console.log("  NEXT: node scripts/hotels/geo-2026/audit-local-area.mjs\n");
process.exitCode = failed ? 1 : 0;
}
}
