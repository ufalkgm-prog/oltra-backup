#!/usr/bin/env node
/**
 * Recompute ext_points for the hotels touched by the 2026-07-15 Forbes 5-Star audit
 * (see apply-award-review-2026-07-15-forbes5.mjs) — award flags changed on 135 hotels,
 * so ext_points is stale for any of them until this runs (CLAUDE.md §24).
 *
 * Usage (from hotels-beta/):
 *   DIRECTUS_URL=... DIRECTUS_TOKEN=... node scripts/hotels/new-hotels-2026/recalc-ext-points-2026-07-15-forbes5.mjs
 *   ... --confirm   (actually writes; omit for a dry run)
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
if (!DIRECTUS_URL) throw new Error("Missing env DIRECTUS_URL");
if (!DIRECTUS_TOKEN) throw new Error("Missing env DIRECTUS_TOKEN");

const AWARD_POINTS = { michelin3keys: 5, best50: 5, cn: 3, tl100: 3, forbes5: 3, aaa5d: 3, telegraph: 3 };
const AWARD_CODES = Object.keys(AWARD_POINTS);
const confirm = process.argv.includes("--confirm");

const TOUCHED_IDS = ["1014","1022","1073","1082","1086","1093","1094","1095","1098","1099","1106","1125","1141","1142","1143","1144","1148","1157","1169","1178","1185","1186","1189","1201","1210","1222","1228","1236","1267","1278","1285","1288","1290","1292","1296","1297","1299","1301","1302","1303","1306","1314","1323","1340","1345","1349","1353","1363","1364","1366","1368","1396","1415","1419","1438","1459","1460","1461","1462","1480","1489","1516","1522","1528","1529","1532","1541","1545","1563","1565","1570","1571","1581","1582","1593","1600","1601","1602","1603","1604","1615","1639","1643","1645","1660","1667","1669","1670","1676","1677","1680","1691","1694","1695","1696","1700","1707","1708","1712","1716","1719","1725","1728","1731","1739","1740","1742","1743","1744","1747","1748","1757","1758","1760","1762","1766","1767","1770","1805","1815","1824","1834","2018","2021","2025","2027","2028","2032","2035","2036","2038","2039","2043","2045","2048","2052","1026","1034","1089","1134","1140","1184","1229","1262","1313","1329","1344","1469","1547","1598","1616","1633","1636","1650","1659","1675","1714","1732","1813","2016","1163","1168","1171","1172","1177","1180","1181","1239","1244","1248","1249","1255","1418","1452","1605","1634","1642","1644","1649","1814","1087","1100","1136","1188","1193","1204","1215","1223","1261","1369","1423","1427","1430","1447","1451","1479","1483","1542","1555","1557","1569","1599","1626","1653","1654","1672","1686","1703","1811","1738"];

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
