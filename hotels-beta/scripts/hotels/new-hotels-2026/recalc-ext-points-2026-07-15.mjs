#!/usr/bin/env node
/**
 * Recompute ext_points for the hotels touched by the 2026-07-15 full-collection Michelin
 * 3 Keys audit (see apply-award-review-2026-07-15-michelin3keys.mjs) — award flags changed
 * on 110 hotels, so ext_points is stale for any of them until this runs (CLAUDE.md §24).
 *
 * ext_points = editor_rank + sum of award points (editor_rank is a stored Directus field,
 * not recomputed here).
 *
 * Usage (from hotels-beta/):
 *   DIRECTUS_URL=... DIRECTUS_TOKEN=... node scripts/hotels/new-hotels-2026/recalc-ext-points-2026-07-15.mjs
 *   ... --confirm   (actually writes; omit for a dry run)
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;

if (!DIRECTUS_URL) throw new Error("Missing env DIRECTUS_URL");
if (!DIRECTUS_TOKEN) throw new Error("Missing env DIRECTUS_TOKEN");

const AWARD_POINTS = {
  michelin3keys: 5,
  best50: 5,
  cn: 3,
  tl100: 3,
  forbes5: 3,
  aaa5d: 3,
  telegraph: 3,
};

const AWARD_CODES = Object.keys(AWARD_POINTS);
const confirm = process.argv.includes("--confirm");

const TOUCHED_IDS = ["1020","1021","1052","1127","1138","1140","1157","1176","1189","1193","1205","1210","1211","1223","1226","1228","1272","1285","1288","1296","1302","1310","1312","1314","1322","1323","1329","1340","1349","1353","1354","1364","1365","1420","1423","1438","1457","1459","1468","1489","1495","1529","1541","1542","1545","1554","1569","1654","1656","1706","1784","1785","1788","1824","1839","2005","2052","2054","2058","1049","1111","1292","1330","1345","1376","1378","1396","1418","1475","1550","1641","1659","1686","1712","1087","1116","1265","1350","1371","1379","1507","1544","1598","1634","1805","2046","1082","1094","1106","1120","1122","1125","1134","1135","1136","1141","1142","1148","1186","1188","1201","1204","1215","1235","1236","1244","1248","1261","1297","1303","1427","1431","1447","1451","1452","1461","1480","1483","1555","1571","1599","1600","1602","1603","1604","1608","1615","1626","1633","1636","1642","1643","1644","1649","1653","1669","1670","1677","1691","1695","1703","1716","1719","1731","1733","1738","1739","1740","1744","1757","1758","1760","2004","2032","2037","2043"];

async function directusFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}`, "Content-Type": "application/json", ...options.headers },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Directus request failed: ${JSON.stringify(json)}`);
  return json.data;
}

async function main() {
  const fields = ["id", "hotel_name", "editor_rank", "ext_points", ...AWARD_CODES].join(",");
  const hotels = await directusFetch(
    `${DIRECTUS_URL}/items/hotels?filter[id][_in]=${TOUCHED_IDS.join(",")}&fields=${fields}&limit=-1&sort=id`
  );

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
      console.log(
        `[id ${hotel.id}] ${hotel.hotel_name} — ext_points: ${oldExtPoints} -> ${newExtPoints} ` +
          `(editor_rank ${editorRank} + ${awardPoints} pts from [${heldAwards.join(", ") || "none"}])`
      );
      toUpdate.push({ id: hotel.id, ext_points: newExtPoints });
    }
  }

  console.log(`\n${toUpdate.length} hotels need an ext_points update.`);

  if (!confirm) {
    console.log("\nDry run complete. Re-run with --confirm to apply.");
    return;
  }

  for (const { id, ext_points } of toUpdate) {
    await directusFetch(`${DIRECTUS_URL}/items/hotels/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ ext_points }),
    });
    console.log(`  -> patched id ${id} to ext_points=${ext_points}`);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
