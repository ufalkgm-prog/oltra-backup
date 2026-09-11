#!/usr/bin/env node
/* The Ritz-Carlton Ras Al Khaimah, Al Wadi Desert is not in Dubai.
 *
 *   1614  admin_region  "Emirate of Dubai" -> "Emirate of Ras Al Khaimah"
 *         city          "Dubai"            -> "Ras Al Khaimah"
 *
 * Surfaced by the local_area fill, which refused to give it a Dubai district
 * because that would have buried a geography error under a cosmetic one. Its
 * coordinates are 25.585,55.835 — about 90km northeast of Dubai and in a
 * DIFFERENT EMIRATE — and the hotel says so in its own name and its own
 * description ("the resort is within Ras Al Khaimah").
 *
 * BOTH fields were wrong, not just `city`. That matters: `admin_region` is the
 * axis the concierge prefers when narrowing a broad result set, because it is
 * never null (§50), so a hotel filed under the wrong emirate is not a display
 * bug — it is reachable by a search that should not return it, and missing
 * from one that should.
 *
 * ==== PHASE 1 — THE CHOICE LIST HAS TO GROW FIRST ====
 * `admin_region` was locked on 2026-09-11 to 291 choices with
 * `allowOther: false`, and "Emirate of Ras Al Khaimah" is not among them.
 * This is exactly the cost §3 records for locking, arriving for the first time.
 *
 * THE TRAP, and the reason the order is not arbitrary: Directus does NOT
 * validate writes against the choice list. Patching the row first would
 * SUCCEED, and the damage would be invisible from the API — §44 records what
 * happens next, which is that the value renders blank in the admin UI and can
 * never be selected again. So the list is extended first, 291 -> 292, and the
 * row is only written once the value it needs exists.
 *
 * ==== WHY "Ras Al Khaimah" AND NOT "Al Wadi Desert" ====
 * §3 allows a lodge to use its reserve name as `city`, and this is a resort in
 * a 1,235-acre private reserve, so that rule could apply. It does not, because
 * this collection already answered the question for the UAE: Qasr Al Sarab
 * (1608) sits in the Liwa Desert roughly 200km from Abu Dhabi city and is
 * filed `city: "Abu Dhabi"`. Using the emirate's capital keeps the country's
 * two desert resorts consistent and gives each a city a traveller searches.
 * `state_province_county_island` stays null, as it is on all 22 UAE rows.
 *
 * ==== AFTERWARDS ====
 * CHANGING A `city` MEANS REBUILDING cityAirports.ts (§3, §37, §49):
 *
 *   node scripts/airports/build-city-airports.mjs
 *
 * Read what it produces rather than assuming — that is how the Parrot Cay
 * regression was caught an hour ago. Here the expected answer is RKT: Ras Al
 * Khaimah International is a LARGE airport with scheduled service ~11km away,
 * so unlike North Caicos it is a real gateway and tier 1 should return it
 * alone, with DXB correctly out of range at ~90km.
 *
 * ==== WHAT THE OUTLIER SWEEP MEANS, BEFORE ANYONE CHASES IT ====
 * The final check lists hotels more than 300km from the centroid of their own
 * `admin_region`. It reported 16 after this fix and NONE of them is a defect —
 * it measures how big a region is, not whether a row is wrong:
 *   Capital Region  Reykjavik at 1369km from Copenhagen. This is the ambiguity
 *     the lock script already records: "Capital Region" is the correct English
 *     name for both Hovedstaden and Höfuðborgarsvæðið, so one dropdown entry
 *     covers two countries and their centroid falls in the North Atlantic.
 *   Queensland      Silky Oaks (Daintree) against the Gold Coast, 1,700km apart
 *   California      Napa, Tahoe and San Francisco
 * The check earns its place anyway: it is the shape that would have caught
 * 1614 years earlier, sitting 90km outside a one-emirate region. Read it as a
 * prompt to look, never as a list of errors.
 *
 * A ONE-TIME RECORD (§24).
 *
 *   node fix-ras-al-khaimah-city-2026-09-11.mjs              # dry run
 *   node fix-ras-al-khaimah-city-2026-09-11.mjs --confirm    # writes
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROLLBACK = path.join(HERE, "fix-ras-al-khaimah-city-2026-09-11-rollback.json");
const SNAPSHOT = path.join(HERE, "fix-ras-al-khaimah-city-2026-09-11-field-snapshot.json");
const CONFIRM = process.argv.includes("--confirm");

const NEW_CHOICE = "Emirate of Ras Al Khaimah";
const FIX = {
  id: 1614,
  name: "The Ritz-Carlton, Ras Al Khaimah, Al Wadi Desert",
  from: { admin_region: "Emirate of Dubai", city: "Dubai" },
  to: { admin_region: NEW_CHOICE, city: "Ras Al Khaimah" },
};
/* Asserted, never written — the precedent the `city` choice rests on. */
const PRECEDENT = { id: 1608, city: "Abu Dhabi", name: "Qasr Al Sarab" };

const URL_ = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const TOKEN = process.env.DIRECTUS_TOKEN;
if (!URL_ || !TOKEN) {
  console.error("Set DIRECTUS_URL and DIRECTUS_TOKEN.");
  process.exitCode = 1;
} else {

const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
const norm = (v) => { const s = String(v ?? "").trim(); return s === "" ? null : s; };
const problems = [];

// ---- read the field meta ----
const fieldRes = await (await fetch(`${URL_}/fields/hotels/admin_region`, { headers: H })).json();
const meta = fieldRes?.data?.meta ?? {};
const choices = (meta.options?.choices ?? []).map((c) => c.value ?? c.text);
const choiceExists = choices.includes(NEW_CHOICE);

if (meta.options?.allowOther !== false) {
  problems.push(`admin_region allowOther is ${meta.options?.allowOther}, expected false — the field is not locked as §3 describes`);
}

// ---- read the rows ----
const { data: rows } = await (await fetch(
  `${URL_}/items/hotels?limit=-1&filter[id][_in]=${FIX.id},${PRECEDENT.id}&fields=id,hotel_name,country,admin_region,state_province_county_island,city,local_area,lat,lng`,
  { headers: H }
)).json();
const byId = new Map(rows.map((r) => [String(r.id), r])); // ids are strings (§44)

const prec = byId.get(String(PRECEDENT.id));
if (!prec) problems.push(`${PRECEDENT.id} ${PRECEDENT.name} — not found`);
else if (norm(prec.city) !== PRECEDENT.city) {
  problems.push(`${PRECEDENT.id} ${PRECEDENT.name} — city is ${JSON.stringify(norm(prec.city))}, expected ${JSON.stringify(PRECEDENT.city)}. The UAE desert-resort precedent no longer holds; re-decide before writing.`);
}

const row = byId.get(String(FIX.id));
const changes = {};
let alreadyDone = true;
if (!row) problems.push(`${FIX.id} — not found`);
else {
  for (const [field, want] of Object.entries(FIX.to)) {
    const current = norm(row[field]);
    if (current === want) continue;
    alreadyDone = false;
    if (current !== norm(FIX.from[field])) {
      problems.push(`${FIX.id} — ${field} is ${JSON.stringify(current)}, expected ${JSON.stringify(norm(FIX.from[field]))}`);
      continue;
    }
    changes[field] = want;
  }
}

console.log(`\n${CONFIRM ? "APPLYING" : "DRY RUN"} — Ras Al Khaimah\n`);
console.log(`  PHASE 1  admin_region choice list`);
console.log(`     ${choices.length} choices, allowOther=${meta.options?.allowOther}`);
console.log(choiceExists
  ? `     ${JSON.stringify(NEW_CHOICE)} already present — nothing to add`
  : `     add ${JSON.stringify(NEW_CHOICE)}  ->  ${choices.length + 1} choices`);
console.log(`\n  PHASE 2  the row`);
if (row) {
  console.log(`     [${FIX.id}] ${norm(row.hotel_name)}   ${row.lat},${row.lng}`);
  if (alreadyDone) console.log(`     already set`);
  for (const [field, want] of Object.entries(changes)) {
    console.log(`        ${field.padEnd(14)} ${JSON.stringify(norm(row[field]))} -> ${JSON.stringify(want)}`);
  }
  console.log(`        area stays ${JSON.stringify(norm(row.state_province_county_island))}, local_area stays ${JSON.stringify(norm(row.local_area))}`);
}
console.log(`\n     precedent: ${PRECEDENT.name} is city ${JSON.stringify(prec ? norm(prec.city) : null)} in the Liwa Desert`);

if (problems.length) {
  console.error(`\n  ABORTING:`);
  for (const p of problems) console.error("    " + p);
  console.error("");
  process.exitCode = 1;
} else if (!CONFIRM) {
  console.log(`\n  Dry run — re-run with --confirm to write.`);
  console.log("  Then rebuild: node scripts/airports/build-city-airports.mjs\n");
} else {

// ---- PHASE 1, and it must land before the row is touched ----
if (!choiceExists) {
  fs.writeFileSync(SNAPSHOT,
    JSON.stringify({ at: new Date().toISOString(), field: "admin_region", beforeMeta: meta }, null, 2), "utf8");
  const body = {
    meta: { options: { ...(meta.options ?? {}), choices: [...choices, NEW_CHOICE].sort().map((v) => ({ text: v, value: v })) } },
  };
  const r = await fetch(`${URL_}/fields/hotels/admin_region`, { method: "PATCH", headers: H, body: JSON.stringify(body) });
  if (!r.ok) {
    console.error(`  FAILED to extend the choice list: ${r.status} ${await r.text()}`);
    console.error("  The row is NOT written — it would render blank in the admin UI (§44).\n");
    process.exitCode = 1;
  } else {
    console.log(`  ok  choice list extended to ${choices.length + 1}`);
  }
}

if (process.exitCode !== 1) {
  // Re-read rather than trust the PATCH, since everything below depends on the
  // value actually being selectable now.
  const after = await (await fetch(`${URL_}/fields/hotels/admin_region`, { headers: H })).json();
  const live = (after?.data?.meta?.options?.choices ?? []).map((c) => c.value ?? c.text);
  if (!live.includes(NEW_CHOICE)) {
    console.error(`  ABORT — ${JSON.stringify(NEW_CHOICE)} is still not in the choice list; the row is not written.\n`);
    process.exitCode = 1;
  } else {

// ---- PHASE 2 ----
const applied = [];
let failed = 0;
if (Object.keys(changes).length) {
  const before = {};
  for (const f of Object.keys(changes)) before[f] = norm(row[f]);
  const r = await fetch(`${URL_}/items/hotels/${FIX.id}`, {
    method: "PATCH", headers: H, body: JSON.stringify(changes),
  });
  if (!r.ok) { console.error(`  FAILED ${FIX.id}: ${r.status} ${await r.text()}`); failed += 1; }
  else { applied.push({ id: String(FIX.id), name: FIX.name, before, after: changes }); console.log(`  ok  ${FIX.id} ${FIX.name}`); }
}

let log = [];
if (fs.existsSync(ROLLBACK)) {
  try { log = JSON.parse(fs.readFileSync(ROLLBACK, "utf8")); } catch { log = []; }
}
log.push({ at: new Date().toISOString(), choiceAdded: choiceExists ? null : NEW_CHOICE, changes: applied });
fs.writeFileSync(ROLLBACK, JSON.stringify(log, null, 2), "utf8");

/* Sweep the whole collection. The first check is the one this row failed for
 * however long it has been in the database: a hotel whose coordinates put it
 * far from every other hotel sharing its admin_region. */
const { data: all } = await (await fetch(
  `${URL_}/items/hotels?limit=-1&fields=id,hotel_name,country,admin_region,city,local_area,lat,lng,published`, { headers: H }
)).json();

const stored = new Set(all.map((h) => norm(h.admin_region)).filter(Boolean));
const outsideList = [...stored].filter((v) => !live.includes(v));

// Distance of each hotel from the centroid of its own admin_region.
const R = 6371;
const hav = (a1, o1, a2, o2) => {
  const t = (d) => (d * Math.PI) / 180;
  const da = t(a2 - a1), dl = t(o2 - o1);
  const x = Math.sin(da / 2) ** 2 + Math.cos(t(a1)) * Math.cos(t(a2)) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};
const groups = new Map();
for (const h of all) {
  const k = norm(h.admin_region);
  if (!k || h.lat == null || h.lng == null) continue;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(h);
}
const outliers = [];
for (const [k, hs] of groups) {
  if (hs.length < 2) continue;
  const la = hs.reduce((s, h) => s + Number(h.lat), 0) / hs.length;
  const lo = hs.reduce((s, h) => s + Number(h.lng), 0) / hs.length;
  for (const h of hs) {
    const d = hav(la, lo, Number(h.lat), Number(h.lng));
    if (d > 300) outliers.push({ d: Math.round(d), k, h });
  }
}
outliers.sort((a, b) => b.d - a.d);

console.log(`\n  Sweep of ${all.length} rows`);
console.log(`     admin_region values outside the locked list: ${outsideList.length}`);
for (const v of outsideList) console.log(`        ${JSON.stringify(v)}`);
console.log(`     hotels >300km from their own admin_region's centroid: ${outliers.length}`);
for (const o of outliers.slice(0, 12)) {
  console.log(`        ${String(o.d).padStart(5)}km  [${o.h.id}] ${norm(o.h.hotel_name)} — ${o.k}`);
}
if (outliers.length > 12) console.log(`        ... and ${outliers.length - 12} more`);
console.log(`\n  Applied ${applied.length}, failed ${failed}. Rollback appended.`);
console.log("  NEXT: node scripts/airports/build-city-airports.mjs\n");
process.exitCode = failed || outsideList.length ? 1 : 0;
}
}
}
}
