#!/usr/bin/env node
/**
 * Recompute ext_points for the hotels touched by the 2026-07-15 Travel + Leisure 100
 * audit (see apply-award-review-2026-07-15-tl100.mjs) — award flags changed on 48
 * hotels, so ext_points is stale for any of them until this runs (CLAUDE.md §24).
 *
 * Usage (from hotels-beta/):
 *   DIRECTUS_URL=... DIRECTUS_TOKEN=... node scripts/hotels/new-hotels-2026/recalc-ext-points-2026-07-15-tl100.mjs
 *   ... --confirm   (actually writes; omit for a dry run)
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
if (!DIRECTUS_URL) throw new Error("Missing env DIRECTUS_URL");
if (!DIRECTUS_TOKEN) throw new Error("Missing env DIRECTUS_TOKEN");

const AWARD_POINTS = { michelin3keys: 5, best50: 5, cn: 3, tl100: 3, forbes5: 3, aaa5d: 3, telegraph: 3 };
const AWARD_CODES = Object.keys(AWARD_POINTS);
const confirm = process.argv.includes("--confirm");

const TOUCHED_IDS = ["1113","1115","1118","1128","1129","1135","1195","1201","1210","1214","1217","1232","1266","1353","1363","1443","1458","1532","1567","1650","1708","1721","1824","2018","2052","2057","1112","1344","1659","1006","1021","1121","1122","1168","1250","1646","1732","1771","1786","1791","2034","2058","1125","1134","1264","1299","1339","1340","1397","1413","1486","1515","1598","1630","1636","1643","1645","1649","1726","1768"];

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
