#!/usr/bin/env node
/**
 * Apply the reviewed Forbes 5-Star audit (2026-07-15, full-collection) to Directus.
 * One-time record of a specific reviewed session — the ID lists below are the exact
 * decisions the user approved via the review artifact (180 additions, 30 removals).
 *
 * Three chain-brand false positives the user avoided by using the already-correct
 * separately-matched hotel ids instead: "Jumeirah Burj Al Arab" (id 1600, not the
 * mismatched "Jumeirah Marsa Al Arab"), "Mandarin Oriental, Jumeira Dubai" (id 1604, not
 * "Mandarin Oriental, Dubai Downtown"), "The Beverly Hills Hotel" (id 1712, not "The
 * Peninsula Beverly Hills" — Peninsula Beverly Hills isn't on Forbes's list at all).
 *
 * id 1738 "The Peninsula Beverly Hills" is in TO_REMOVE (not just omitted from TO_ADD)
 * because it already had forbes5=true in Directus from a prior (incorrect) source —
 * explicit user confirmation this hotel should not carry the award.
 *
 * Dry-run by default; --confirm to actually patch. Sets BOTH the forbes5 boolean column
 * and the `awards` tag array together on every hotel touched (per CLAUDE.md §4/§24).
 *
 * Usage (from hotels-beta/):
 *   DIRECTUS_URL=... DIRECTUS_TOKEN=... node scripts/hotels/new-hotels-2026/apply-award-review-2026-07-15-forbes5.mjs
 *   ... --confirm   (actually writes; omit for dry-run)
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
if (!DIRECTUS_URL) throw new Error("Missing env DIRECTUS_URL");
if (!DIRECTUS_TOKEN) throw new Error("Missing env DIRECTUS_TOKEN");

const CONFIRM = process.argv.includes("--confirm");
const AWARD_CODE = "forbes5";
const AWARD_DISPLAY = "Forbes 5 Star";

const TO_ADD = ["1014","1022","1073","1082","1086","1093","1094","1095","1098","1099","1106","1125","1141","1142","1143","1144","1148","1157","1169","1178","1185","1186","1189","1201","1210","1222","1228","1236","1267","1278","1285","1288","1290","1292","1296","1297","1299","1301","1302","1303","1306","1314","1323","1340","1345","1349","1353","1363","1364","1366","1368","1396","1415","1419","1438","1459","1460","1461","1462","1480","1489","1516","1522","1528","1529","1532","1541","1545","1563","1565","1570","1571","1581","1582","1593","1600","1601","1602","1603","1604","1615","1639","1643","1645","1660","1667","1669","1670","1676","1677","1680","1691","1694","1695","1696","1700","1707","1708","1712","1716","1719","1725","1728","1731","1739","1740","1742","1743","1744","1747","1748","1757","1758","1760","1762","1766","1767","1770","1805","1815","1824","1834","2018","2021","2025","2027","2028","2032","2035","2036","2038","2039","2043","2045","2048","2052","1026","1034","1089","1134","1140","1184","1229","1262","1313","1329","1344","1469","1547","1598","1616","1633","1636","1650","1659","1675","1714","1732","1813","2016","1163","1168","1171","1172","1177","1180","1181","1239","1244","1248","1249","1255","1418","1452","1605","1634","1642","1644","1649","1814"];

const TO_REMOVE = ["1087","1100","1136","1188","1193","1204","1215","1223","1261","1369","1423","1427","1430","1447","1451","1479","1483","1542","1555","1557","1569","1599","1626","1653","1654","1672","1686","1703","1811","1738"];

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
