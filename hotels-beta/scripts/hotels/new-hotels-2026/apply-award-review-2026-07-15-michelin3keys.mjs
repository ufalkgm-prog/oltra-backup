#!/usr/bin/env node
/**
 * Apply the reviewed Michelin 3 Keys audit (2026-07-15, full-collection) to Directus.
 * One-time record of a specific reviewed session — the ID lists below are the exact
 * decisions the user approved via the review artifact (86 additions, 70 removals), with
 * two corrections made after the artifact review:
 *   - id 1581 (Four Seasons Hotel Istanbul at the Bosphorus) EXCLUDED from additions —
 *     verified via web search it holds 1 Michelin Key, not 3; the 3-Key Istanbul property
 *     is "Four Seasons Hotel Istanbul at Sultanahmet", a different hotel.
 *   - id 1087 (Rosewood Hong Kong) MOVED from removal to addition — was wrongly excluded
 *     by a matcher bug (hard country-conflict exclusion before checking name match; DB
 *     stores country "China", source list uses "Hong Kong" for the same hotel). Bug fixed
 *     in match-hotel-awards.mjs before this list was finalized.
 *
 * Dry-run by default; --confirm to actually patch. Sets BOTH the michelin3keys boolean
 * column and the `awards` tag array together on every hotel touched (per CLAUDE.md §4/§24
 * — the two must move in lockstep, and array writes need the Postgres literal string).
 *
 * Usage (from hotels-beta/):
 *   DIRECTUS_URL=... DIRECTUS_TOKEN=... node scripts/hotels/new-hotels-2026/apply-award-review-2026-07-15-michelin3keys.mjs
 *   ... --confirm   (actually writes; omit for dry-run)
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
if (!DIRECTUS_URL) throw new Error("Missing env DIRECTUS_URL");
if (!DIRECTUS_TOKEN) throw new Error("Missing env DIRECTUS_TOKEN");

const CONFIRM = process.argv.includes("--confirm");
const AWARD_CODE = "michelin3keys";
const AWARD_DISPLAY = "Michelin 3 Keys";

const TO_ADD = ["1020","1021","1052","1127","1138","1140","1157","1176","1189","1193","1205","1210","1211","1223","1226","1228","1272","1285","1288","1296","1302","1310","1312","1314","1322","1323","1329","1340","1349","1353","1354","1364","1365","1420","1423","1438","1457","1459","1468","1489","1495","1529","1541","1542","1545","1554","1569","1654","1656","1706","1784","1785","1788","1824","1839","2005","2052","2054","2058","1049","1111","1292","1330","1345","1376","1378","1396","1418","1475","1550","1641","1659","1686","1712","1087","1116","1265","1350","1371","1379","1507","1544","1598","1634","1805","2046"];

const TO_REMOVE = ["1082","1094","1106","1120","1122","1125","1134","1135","1136","1141","1142","1148","1186","1188","1201","1204","1215","1235","1236","1244","1248","1261","1297","1303","1427","1431","1447","1451","1452","1461","1480","1483","1555","1571","1599","1600","1602","1603","1604","1608","1615","1626","1633","1636","1642","1643","1644","1649","1653","1669","1670","1677","1691","1695","1703","1716","1719","1731","1733","1738","1739","1740","1744","1757","1758","1760","2004","2032","2037","2043"];

function toPgArrayLiteral(values) {
  if (!Array.isArray(values) || values.length === 0) return "{}";
  const escaped = values.map(
    (v) => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
  );
  return `{${escaped.join(",")}}`;
}

async function directusFetch(url, options) {
  const res = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}`, "Content-Type": "application/json", ...(options?.headers || {}) },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Directus request failed (${url}): ${JSON.stringify(json)}`);
  return json.data;
}

async function loadTargetHotels(ids) {
  const url = `${DIRECTUS_URL}/items/hotels?filter[id][_in]=${ids.join(",")}&fields=id,hotel_name,awards,${AWARD_CODE}&limit=-1`;
  return directusFetch(url);
}

async function main() {
  const allIds = [...TO_ADD, ...TO_REMOVE];
  const hotels = await loadTargetHotels(allIds);
  const byId = new Map(hotels.map((h) => [String(h.id), h]));

  const missing = allIds.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    console.warn(`WARNING: ${missing.length} id(s) not found in Directus, skipping: ${missing.join(", ")}`);
  }

  const plan = [];

  for (const id of TO_ADD) {
    const hotel = byId.get(id);
    if (!hotel) continue;
    const current = Array.isArray(hotel.awards) ? hotel.awards : [];
    const alreadyTagged = current.includes(AWARD_DISPLAY);
    const alreadyFlagged = !!hotel[AWARD_CODE];
    if (alreadyTagged && alreadyFlagged) {
      plan.push({ id, hotel_name: hotel.hotel_name, action: "add", skip: true, reason: "already true + tagged" });
      continue;
    }
    const newAwards = alreadyTagged ? current : [...current, AWARD_DISPLAY];
    plan.push({
      id, hotel_name: hotel.hotel_name, action: "add", skip: false,
      before: { boolean: alreadyFlagged, awards: current },
      after: { boolean: true, awards: newAwards },
    });
  }

  for (const id of TO_REMOVE) {
    const hotel = byId.get(id);
    if (!hotel) continue;
    const current = Array.isArray(hotel.awards) ? hotel.awards : [];
    const stillTagged = current.includes(AWARD_DISPLAY);
    const stillFlagged = !!hotel[AWARD_CODE];
    if (!stillTagged && !stillFlagged) {
      plan.push({ id, hotel_name: hotel.hotel_name, action: "remove", skip: true, reason: "already false + untagged" });
      continue;
    }
    const newAwards = current.filter((a) => a !== AWARD_DISPLAY);
    plan.push({
      id, hotel_name: hotel.hotel_name, action: "remove", skip: false,
      before: { boolean: stillFlagged, awards: current },
      after: { boolean: false, awards: newAwards },
    });
  }

  const toApply = plan.filter((p) => !p.skip);
  const toSkip = plan.filter((p) => p.skip);

  console.log(`Plan: ${toApply.filter((p) => p.action === "add").length} additions, ${toApply.filter((p) => p.action === "remove").length} removals to apply.`);
  console.log(`Already correct (no-op): ${toSkip.length}`);
  console.log("");

  for (const p of toApply) {
    console.log(`[${p.action.toUpperCase()}] id ${p.id} ${p.hotel_name.trim()}`);
    console.log(`   boolean: ${p.before.boolean} -> ${p.after.boolean}`);
    console.log(`   awards:  ${JSON.stringify(p.before.awards)} -> ${JSON.stringify(p.after.awards)}`);
  }

  if (!CONFIRM) {
    console.log("");
    console.log(`DRY RUN — no writes made. Re-run with --confirm to apply ${toApply.length} change(s).`);
    return;
  }

  console.log("");
  console.log(`Applying ${toApply.length} change(s)...`);
  let ok = 0, failed = 0;
  for (const p of toApply) {
    try {
      await directusFetch(`${DIRECTUS_URL}/items/hotels/${p.id}`, {
        method: "PATCH",
        body: JSON.stringify({ [AWARD_CODE]: p.after.boolean, awards: toPgArrayLiteral(p.after.awards) }),
      });
      ok += 1;
    } catch (err) {
      failed += 1;
      console.error(`FAILED id ${p.id}: ${err.message}`);
    }
  }
  console.log(`Done. ${ok} patched, ${failed} failed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
