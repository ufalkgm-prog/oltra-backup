#!/usr/bin/env node
/* Fills `local_area` for the 14 Bangkok hotels that had none.
 *
 * Bangkok was split out of the Tokyo/Dubai/Marrakech pass because it needed a
 * decision the other three did not, and Ulrik took it: the administrative
 * district each hotel actually sits in, rather than the bank-and-strip names
 * guests use ("Thonburi", "Charoen Krung") or a single "Riverside" label.
 * Both rejected options would have reintroduced exactly what earlier passes
 * normalised away — Thonburi is a whole half of the city and Charoen Krung is
 * a road.
 *
 * ONE HONEST CAVEAT ABOUT "ONE LEVEL". Thai addresses nest khwaeng inside
 * khet, and the approved set is not uniformly one of them — it is the most
 * RECOGNISABLE district in each case, which is the same standard Tokyo,
 * London and Dubai already use (Ginza, Mayfair and Palm Jumeirah are none of
 * them administrative units either):
 *   khwaeng    Lumphini, Yan Nawa
 *   khet       Sathorn, Bang Rak, Khlong San, Dusit
 *   neither    Phrom Phong — a BTS station that named the neighbourhood
 * Worth knowing before anyone "fixes" the inconsistency: it is deliberate, and
 * the alternative put Watthana on 137 Pillars, which tells a guest nothing.
 *
 * EVIDENCE TIERS, as in the sibling script:
 *   A — the district is named in the hotel's own description (4 rows)
 *   B — the description names a road, a bank or the khet above it, so the
 *       khwaeng comes from the property's address (10 rows)
 *
 * ==== THE PARK POCKET — five hotels, one khwaeng ====
 * Aman Nai Lert already held "Lumphini", set from its own text ("off Wireless
 * Road in Lumphini, Pathum Wan"). Four more sit in the same khwaeng, and their
 * descriptions name the khet above it instead:
 *   1208 Hotel Muse          Langsuan Road      text says "in Pathum Wan"
 *   1214 Rosewood Bangkok    Ploenchit Road     text says "in Pathumwan"
 *   1221 Okura Prestige      Wireless/Ploenchit text names only the roads
 *   1224 The St. Regis       Rajadamri Road     text says "the Pathum Wan district"
 * Using Pathum Wan for these would have forced Aman Nai Lert down a level to
 * match, losing a value its own description supports. Lumphini keeps all five
 * together at the finer level, which is §3's rule.
 *
 * ==== THE RIVER — six hotels, two banks ====
 *   1197 Anantara Riverside  Khlong San   B "the Thonburi side of the Chao Phraya"
 *   1198 Avani+ Riverside    Khlong San   B same complex as 1197, next door
 *   1222 The Peninsula       Khlong San   B "the Thonburi side"
 *   1201 Capella             Yan Nawa     B "on Charoen Krung Road" — a road
 *   1204 Four Seasons        Yan Nawa     B "at 300/1 Charoen Krung Road".
 *        UNPUBLISHED. Capella is 300/2, i.e. directly opposite, so these two
 *        must agree and do.
 *   1210 Mandarin Oriental   Bang Rak     B "48 Oriental Avenue" — a road, but
 *        the khwaeng and khet are both Bang Rak, so the level is unambiguous.
 * Note Capella and Four Seasons are NOT Bang Rak: Charoen Krung runs from Bang
 * Rak south into Yan Nawa, and both sit past that line. Grouping all six as
 * "the riverside" would have hidden it.
 *
 * ==== THE REST ====
 *   1192 137 Pillars     Phrom Phong  A "between the Phrom Phong and Thonglor
 *        neighbourhoods" — it names two, and Sukhumvit 39 with EmQuartier and
 *        Emporium is the Phrom Phong half.
 *   1199 Banyan Tree     Sathorn      A "a 61-storey tower in Sathorn"
 *   1218 SO/ Bangkok     Sathorn      B "on North Sathorn Road ... the meeting
 *        point of Silom, Sathorn" — names a road and two districts.
 *   1223 The Siam        Dusit        A "in Bangkok's Dusit district"
 *
 * A ONE-TIME RECORD (§24).
 *
 *   node fill-local-area-bangkok-2026-09-11.mjs              # dry run
 *   node fill-local-area-bangkok-2026-09-11.mjs --confirm    # writes
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROLLBACK = path.join(HERE, "fill-local-area-bangkok-2026-09-11-rollback.json");
const CONFIRM = process.argv.includes("--confirm");

const FIXES = [
  // the park pocket — khwaeng Lumphini, khet Pathum Wan
  { id: 1208, to: "Lumphini", tier: "B", why: "Langsuan Road; text names the khet, Pathum Wan" },
  { id: 1214, to: "Lumphini", tier: "B", why: "Ploenchit Road; text names the khet, Pathumwan" },
  { id: 1221, to: "Lumphini", tier: "B", why: "corner of Wireless and Ploenchit; text names only roads" },
  { id: 1224, to: "Lumphini", tier: "B", why: 'Rajadamri Road; text says "the Pathum Wan district"' },
  // the river, Thonburi bank — khet Khlong San
  { id: 1197, to: "Khlong San", tier: "B", why: '"the Thonburi side of the Chao Phraya River"' },
  { id: 1198, to: "Khlong San", tier: "B", why: "same riverside complex as 1197" },
  { id: 1222, to: "Khlong San", tier: "B", why: '"the Thonburi side of the Chao Phraya River"' },
  // the river, city bank
  { id: 1201, to: "Yan Nawa", tier: "B", why: "300/2 Charoen Krung Road — past the Bang Rak line" },
  { id: 1204, to: "Yan Nawa", tier: "B", why: "300/1 Charoen Krung Road — directly opposite 1201" },
  { id: 1210, to: "Bang Rak", tier: "B", why: "48 Oriental Avenue; khwaeng and khet are both Bang Rak" },
  // the rest
  { id: 1192, to: "Phrom Phong", tier: "A", why: '"between the Phrom Phong and Thonglor neighbourhoods"' },
  { id: 1199, to: "Sathorn", tier: "A", why: '"occupies a 61-storey tower in Sathorn"' },
  { id: 1218, to: "Sathorn", tier: "B", why: '"on North Sathorn Road ... Silom, Sathorn"' },
  { id: 1223, to: "Dusit", tier: "A", why: '"in Bangkok\'s Dusit district"' },
];

/* Asserted, never written: the value this whole scheme was built to preserve.
 * If Aman Nai Lert is no longer Lumphini, the park pocket's level is no longer
 * settled and the other four should not be written either. */
const ANCHOR = { id: 2006, local_area: "Lumphini", name: "Aman Nai Lert" };

const URL_ = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const TOKEN = process.env.DIRECTUS_TOKEN;
if (!URL_ || !TOKEN) {
  console.error("Set DIRECTUS_URL and DIRECTUS_TOKEN.");
  process.exitCode = 1;
} else {

const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
const FIELDS = "id,hotel_name,city,local_area,published";
const ids = [...FIXES.map((f) => f.id), ANCHOR.id];
const { data: rows } = await (await fetch(
  `${URL_}/items/hotels?limit=-1&filter[id][_in]=${ids.join(",")}&fields=${FIELDS}`, { headers: H }
)).json();
const byId = new Map(rows.map((r) => [String(r.id), r])); // ids are strings (§44)

const norm = (v) => { const s = String(v ?? "").trim(); return s === "" ? null : s; };

const planned = [];
const problems = [];

const anchorRow = byId.get(String(ANCHOR.id));
if (!anchorRow) problems.push(`${ANCHOR.id} ${ANCHOR.name} — not found`);
else if (norm(anchorRow.local_area) !== ANCHOR.local_area) {
  problems.push(`${ANCHOR.id} ${ANCHOR.name} — anchor is ${JSON.stringify(norm(anchorRow.local_area))}, expected ${JSON.stringify(ANCHOR.local_area)}. The park pocket's level is no longer settled.`);
}

for (const fix of FIXES) {
  const row = byId.get(String(fix.id));
  if (!row) { problems.push(`${fix.id} — not found`); continue; }
  if (norm(row.city) !== "Bangkok") {
    problems.push(`${fix.id} ${row.hotel_name?.trim()} — city is ${JSON.stringify(norm(row.city))}, expected "Bangkok"`);
    continue;
  }
  const current = norm(row.local_area);
  if (current === fix.to) { console.log(`  skip ${fix.id} ${row.hotel_name?.trim()} — already set`); continue; }
  // Every row in this pass starts empty. Anything else means someone got here
  // first, and their value should win over a script written before it existed.
  if (current !== null) {
    problems.push(`${fix.id} ${row.hotel_name?.trim()} — expected empty, holds ${JSON.stringify(current)}`);
    continue;
  }
  planned.push({ ...fix, name: row.hotel_name?.trim(), published: row.published });
}

console.log(`\n${CONFIRM ? "APPLYING" : "DRY RUN"} — filling Bangkok local_area\n`);
const order = ["Lumphini", "Khlong San", "Yan Nawa", "Bang Rak", "Phrom Phong", "Sathorn", "Dusit"];
for (const value of order) {
  const group = planned.filter((p) => p.to === value);
  if (!group.length) continue;
  console.log(`  ${value}`);
  for (const p of group) {
    console.log(`    [${p.id}] ${p.name}${p.published ? "" : "  (unpublished)"}   [${p.tier}]`);
    console.log(`          ${p.why}`);
  }
}

if (problems.length) {
  console.error(`\n  ABORTING:`);
  for (const p of problems) console.error("    " + p);
  console.error("");
  process.exitCode = 1;
} else if (!CONFIRM) {
  const a = planned.filter((p) => p.tier === "A").length;
  console.log(`\n  ${planned.length} to change — ${a} tier A, ${planned.length - a} tier B (from the address).`);
  console.log(`  Anchor holds: ${ANCHOR.name} is still ${JSON.stringify(ANCHOR.local_area)}.`);
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

// Sweep the whole collection, not the rows touched.
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
console.log(`     local_area repeating city:       ${echo.length}`);
console.log(`     prefix overlaps within a city:   ${overlaps.length}`);
for (const o of overlaps) console.log("        " + o);
console.log(`     local_area populated:            ${populated}`);
for (const c of ["Bangkok", "Dubai", "Tokyo", "Marrakech"]) {
  const rs = all.filter((h) => norm(h.city) === c);
  const vals = [...new Set(rs.map(V).filter(Boolean))].sort();
  console.log(`        ${c.padEnd(10)} ${rs.filter((h) => V(h)).length}/${rs.length}   ${vals.join(" · ")}`);
}
console.log(`\n  Applied ${applied.length}, failed ${failed}. Rollback appended.\n`);
process.exitCode = failed || compound.length || echo.length || overlaps.length ? 1 : 0;
}
}
