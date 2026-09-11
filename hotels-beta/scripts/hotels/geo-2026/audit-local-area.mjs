#!/usr/bin/env node
/* READ-ONLY audit of `local_area`. Writes nothing, safe to run any time.
 *
 * Built at the end of the 2026-09-11 clean-up so "is anything outstanding?" is
 * a question that can be re-asked rather than a one-off answer. Every check
 * below exists because that day's passes got it wrong at least once.
 *
 * TWO CLASSES OF CHECK, and the distinction is the point:
 *
 *   DEFECTS   — provably wrong under §3's rules. Any hit is work to do, and
 *               the script exits 1. These should stay at zero.
 *   CANDIDATES— shaped like a defect but often legitimate. A hit means LOOK,
 *               not fix: Palm Jumeirah contains "Palm", Jumeira Bay Island
 *               contains both "Bay" and "Island", and all three are correct.
 *               Candidates never fail the run.
 *
 * The lesson that produced the widened separator test: for most of 2026-09-11
 * every pass reported "0 compound values" while seven slash- and "and"-joined
 * compounds sat untouched, because the detector only tested for a comma. A
 * check that cannot see a defect reports zero just as confidently as a clean
 * collection does.
 *
 *   node audit-local-area.mjs            # full report
 *   node audit-local-area.mjs --quiet    # defects and coverage only
 */

const QUIET = process.argv.includes("--quiet");
const URL_ = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const TOKEN = process.env.DIRECTUS_TOKEN;
if (!URL_ || !TOKEN) {
  console.error("Set DIRECTUS_URL and DIRECTUS_TOKEN.");
  process.exitCode = 1;
} else {

const H = { Authorization: `Bearer ${TOKEN}` };
const { data: all } = await (await fetch(
  `${URL_}/items/hotels?limit=-1&fields=id,hotel_name,published,country,admin_region,state_province_county_island,city,local_area`,
  { headers: H }
)).json();

const norm = (v) => { const s = String(v ?? "").trim(); return s === "" ? null : s; };
const V = (h) => norm(h.local_area) ?? "";
const N = (h) => norm(h.hotel_name) ?? "";
const strip = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const filled = all.filter((h) => V(h));

const line = (h, extra = "") => `        [${h.id}] ${N(h)} (${norm(h.city)})  ${JSON.stringify(V(h))}${extra}`;
const defects = [];
const report = (label, rows, isDefect, note) => {
  const n = rows.length;
  console.log(`  ${isDefect ? "DEFECT   " : "candidate"}  ${String(n).padStart(3)}  ${label}`);
  if (note && n) console.log(`                   ${note}`);
  if (!QUIET || isDefect) for (const h of rows) console.log(line(h));
  if (isDefect) defects.push(...rows);
};

console.log(`\n  local_area audit — ${all.length} hotels, ${filled.length} populated\n`);

/* ---- DEFECTS ------------------------------------------------------------ */

// Separators. A separator is a separator whatever its glyph.
report("compound value (comma, slash or \" and \")",
  filled.filter((h) => V(h).includes(",") || V(h).includes("/") || / and /i.test(V(h))), true);

report("parenthetical",
  filled.filter((h) => /[()]/.test(V(h))), true);

// A value identical to city is the same fact stored twice.
report("repeats its own city",
  filled.filter((h) => V(h) === norm(h.city)), true);

// Region-level: the value is an admin_region or traveller area somewhere.
const admins = new Set(all.map((h) => norm(h.admin_region)).filter(Boolean));
const areas = new Set(all.map((h) => norm(h.state_province_county_island)).filter(Boolean));
/* Exempt by §3, genuinely sub-city: Sentosa, Playa Grande, Punta del Este.
 * Plus a COINCIDENTAL HOMONYM, which is a different thing and worth naming as
 * such: Chicago's Gold Coast is a real neighbourhood, and it only trips this
 * check because Australia's Gold Coast is a traveller area on a Queensland
 * hotel. Two places on two continents sharing a name is not a defect. The same
 * shape appears among the candidates below — "Santa Croce" is a rione in
 * Florence AND a sestiere in Venice, both correct. */
const KEEP_REGIONAL = new Set(["1186", "1245", "1793", "1671", "1702"]);
report("region-level (matches an admin_region or traveller area)",
  filled.filter((h) => !KEEP_REGIONAL.has(String(h.id)) && (admins.has(V(h)) || areas.has(V(h)))), true,
  "three rows are exempt by §3 and excluded here");

// Two levels of the same district inside one city — Midtown beside Midtown East.
const ALLOWED_PREFIX = new Set(['New York: "Midtown"']); // Aman NY, deliberate (§3)
const byCity = new Map();
for (const h of filled) {
  const c = norm(h.city); if (!c) continue;
  if (!byCity.has(c)) byCity.set(c, []);
  byCity.get(c).push(h);
}
const prefixHits = [];
for (const [c, hs] of byCity) {
  const vals = [...new Set(hs.map(V))];
  for (const a of vals) for (const b of vals) {
    if (a === b || !strip(b).startsWith(strip(a))) continue;
    if (ALLOWED_PREFIX.has(`${c}: ${JSON.stringify(a)}`)) continue;
    for (const h of hs.filter((x) => V(x) === a)) prefixHits.push(h);
  }
}
report("one district at two levels in the same city", [...new Set(prefixHits)], true,
  'Aman New York\'s bare "Midtown" is exempt by §3');

// One district spelled two ways anywhere.
const forms = new Map();
for (const h of filled) {
  const k = strip(V(h));
  if (!forms.has(k)) forms.set(k, new Set());
  forms.get(k).add(V(h));
}
const splitSpelling = [...forms.entries()].filter(([, s]) => s.size > 1);
const ALLOWED_SPELLING = new Set(["soho"]); // London Soho vs New York SoHo (§3)
const realSplits = splitSpelling.filter(([k]) => !ALLOWED_SPELLING.has(k));
console.log(`  ${realSplits.length ? "DEFECT   " : "DEFECT   "}  ${String(realSplits.length).padStart(3)}  one district spelled two ways`);
if (realSplits.length) console.log(`                   Soho/SoHo is exempt — two cities, not one district (§3)`);
for (const [, s] of realSplits) {
  console.log(`        ${[...s].join("  /  ")}`);
  defects.push({ id: "-", hotel_name: "spelling split", city: "", local_area: [...s].join(" / ") });
}

/* ---- CANDIDATES --------------------------------------------------------- */
if (!QUIET) console.log("");

// A street, square or road. These normalise to the district they sit in.
const THOROUGHFARE = /\b(via|viale|corso|rue|avenue|av|boulevard|blvd|street|st|road|rd|lane|drive|strada|calle|paseo|piazza|piazzale|plaza|plazoleta|place|square|estrada|ulica|dori|ulitsa)\b/i;
report("looks like a street or square", filled.filter((h) => THOROUGHFARE.test(V(h))), false,
  "these normalise to the district they sit in (Park Lane -> Mayfair)");

// A development or building complex, not a district.
const DEVELOPMENT = /\b(hills|tower|towers|centre|center|complex|development|residences|village|city|downtown|mall|park|gardens|one|plaza)\b/i;
report("looks like a development or complex", filled.filter((h) => DEVELOPMENT.test(V(h))), false,
  "UpperHills -> Futian District; but Palm Jumeirah and Downtown Dubai are correct");

// A landform, not a district.
const FEATURE = /\b(bay|island|isle|cliffs?|beach|lake|loch|valley|canal|river|mount|mt|cape|point|peninsula|lagoon|reef|dunes?|forest|desert)\b/i;
report("looks like a landform", filled.filter((h) => FEATURE.test(V(h))), false,
  "Romazzino Bay -> Arzachena; but Jumeira Bay Island and Palm Jumeirah are correct");

// Long enough to be a phrase rather than a name.
report("over 26 characters", filled.filter((h) => V(h).length > 26), false,
  "the shape of \"Private concession bordering Moremi Game Reserve\"");

// The same district name in two different cities. Usually wrong, sometimes not.
const cityOf = new Map();
for (const h of filled) {
  const k = strip(V(h));
  if (!cityOf.has(k)) cityOf.set(k, new Set());
  cityOf.get(k).add(norm(h.city));
}
const shared = [...cityOf.entries()].filter(([, s]) => s.size > 1);
console.log(`  candidate  ${String(shared.length).padStart(3)}  same district name used in two or more cities`);
if (!QUIET) for (const [k, s] of shared) {
  const example = filled.find((h) => strip(V(h)) === k);
  console.log(`        ${JSON.stringify(V(example))}  —  ${[...s].join(", ")}`);
}

/* ---- COVERAGE ----------------------------------------------------------- */
console.log(`\n  COVERAGE — a partly-filled city is the actionable signal:\n`);
const rows = [];
for (const [c, hs] of byCity) {
  const total = all.filter((h) => norm(h.city) === c).length;
  if (hs.length < total) rows.push({ c, have: hs.length, total });
}
rows.sort((a, b) => (b.total - b.have) - (a.total - a.have));
if (!rows.length) console.log("     every city with any local_area has it on every hotel.");
for (const r of rows) {
  const missing = all.filter((h) => norm(h.city) === r.c && !V(h));
  console.log(`     ${r.c} — ${r.have}/${r.total}, missing ${missing.length}:`);
  for (const h of missing) console.log(`        [${h.id}] ${N(h)}${h.published ? "" : "  (unpublished)"}`);
}

const untouched = [...new Set(all.filter((h) => h.published && !V(h)).map((h) => norm(h.city)))]
  .filter((c) => c && !byCity.has(c));
const big = untouched.map((c) => ({ c, n: all.filter((h) => h.published && norm(h.city) === c).length }))
  .filter((x) => x.n >= 3).sort((a, b) => b.n - a.n);
console.log(`\n     cities with 3+ published hotels and NO local_area at all: ${big.length}`);
for (const x of big) console.log(`        ${x.c} (${x.n})`);
console.log(`     — many are correctly empty (§3): a ski village or a reserve has no districts.`);

console.log(`\n  ${defects.length ? `${defects.length} DEFECT rows` : "No defects."}  ${filled.length} populated.\n`);
process.exitCode = defects.length ? 1 : 0;
}
