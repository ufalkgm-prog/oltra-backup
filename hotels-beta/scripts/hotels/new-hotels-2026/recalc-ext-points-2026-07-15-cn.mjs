#!/usr/bin/env node
/**
 * Recompute ext_points for the hotels touched by the 2026-07-15 Condé Nast Gold List
 * audit (see apply-award-review-2026-07-15-cn.mjs) — award flags changed on 66 hotels,
 * so ext_points is stale for any of them until this runs (CLAUDE.md §24).
 *
 * Usage (from hotels-beta/):
 *   DIRECTUS_URL=... DIRECTUS_TOKEN=... node scripts/hotels/new-hotels-2026/recalc-ext-points-2026-07-15-cn.mjs
 *   ... --confirm   (actually writes; omit for a dry run)
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
if (!DIRECTUS_URL) throw new Error("Missing env DIRECTUS_URL");
if (!DIRECTUS_TOKEN) throw new Error("Missing env DIRECTUS_TOKEN");

const AWARD_POINTS = { michelin3keys: 5, best50: 5, cn: 3, tl100: 3, forbes5: 3, aaa5d: 3, telegraph: 3 };
const AWARD_CODES = Object.keys(AWARD_POINTS);
const confirm = process.argv.includes("--confirm");

const TOUCHED_IDS = ["1113","1119","1142","1185","1186","1227","1285","1349","1361","1396","1437","1443","1468","1503","1541","1595","1614","1656","1815","2033","2046","1616","1712","1179","1016","1021","1026","1082","1087","1094","1106","1136","1141","1148","1157","1168","1176","1177","1188","1189","1297","1301","1302","1303","1323","1339","1353","1364","1369","1423","1427","1447","1451","1452","1454","1460","1479","1480","1486","1542","1555","1569","1571","1599","1600","1602","1603","1604","1653","1686","1706","1738","1743","1757","1758","1805","1811"];

async function directusFetch(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}`, "Content-Type": "application/json", ...options.headers } });
  const json = await res.json();
  if (!res.ok) throw new Error(`Directus request failed: ${JSON.stringify(json)}`);
  return json.data;
}

async function main() {
  const fields = ["id", "hotel_name", "editor_rank", "ext_points", ...AWARD_CODES].join(",");
  const hotels = await directusFetch(`${DIRECTUS_URL}/items/hotels?filter[id][_in]=${TOUCHED_IDS.join(",")}&fields=${fields}&limit=-1&sort=id`);
  console.log(`Loaded ${hotels.length} hotels (expected ${TOUCHED_IDS.length}).`);
  console.log(confirm ? "\nAPPLYING changes to Directus...\n" : "\nDRY RUN — no writes will be made (pass --confirm to apply)\n");

  const toUpdate = [];
  for (const hotel of hotels) {
    const editorRank = Number(hotel.editor_rank) || 0;
    const awardPoints = AWARD_CODES.filter((code) => hotel[code]).reduce((sum, code) => sum + AWARD_POINTS[code], 0);
    const newExtPoints = editorRank + awardPoints;
    const oldExtPoints = Number(hotel.ext_points) || 0;
    if (newExtPoints !== oldExtPoints) {
      const heldAwards = AWARD_CODES.filter((code) => hotel[code]);
      console.log(`[id ${hotel.id}] ${hotel.hotel_name} — ext_points: ${oldExtPoints} -> ${newExtPoints} (editor_rank ${editorRank} + ${awardPoints} pts from [${heldAwards.join(", ") || "none"}])`);
      toUpdate.push({ id: hotel.id, ext_points: newExtPoints });
    }
  }

  console.log(`\n${toUpdate.length} hotels need an ext_points update.`);
  if (!confirm) { console.log("\nDry run complete. Re-run with --confirm to apply."); return; }

  for (const { id, ext_points } of toUpdate) {
    await directusFetch(`${DIRECTUS_URL}/items/hotels/${id}`, { method: "PATCH", body: JSON.stringify({ ext_points }) });
    console.log(`  -> patched id ${id} to ext_points=${ext_points}`);
  }
  console.log("\nDone.");
}

main().catch((err) => { console.error(err); process.exit(1); });
