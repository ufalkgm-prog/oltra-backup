#!/usr/bin/env node
/**
 * Apply the reviewed Condé Nast Gold List audit (2026-07-15, full-collection) to Directus.
 * One-time record of a specific reviewed session — the ID lists below are the exact
 * decisions the user approved via the review artifact (24 additions, 53 removals). The
 * large removal count is expected, not a bug: CN's Gold List rotates heavily year to year
 * toward fresh/boutique picks rather than re-crowning famous repeat winners — verified
 * directly against cn.json that hotels like Ritz Paris, The Connaught, The Dorchester,
 * Villa d'Este, Hôtel de Crillon, Gstaad Palace genuinely aren't in the current 73-entry
 * list despite being extremely prestigious.
 *
 * Two candidates the user correctly rejected during review:
 *   - id 1615 "The St. Regis Abu Dhabi" — wrong hotel; the source entry "The St. Regis
 *     Saadiyat Island Resort, Abu Dhabi" matches id 1616, a different, separate property.
 *   - id 1633 "Four Seasons Resort Punta Mita" — false match against "Naviva, A Four
 *     Seasons Resort" (adjacent but separate resorts, per CLAUDE.md §24). The correct
 *     match for that source entry is id 2033, our DB's actual Naviva record.
 *
 * Dry-run by default; --confirm to actually patch. Sets BOTH the cn boolean column and
 * the `awards` tag array together on every hotel touched (per CLAUDE.md §4/§24).
 *
 * Usage (from hotels-beta/):
 *   DIRECTUS_URL=... DIRECTUS_TOKEN=... node scripts/hotels/new-hotels-2026/apply-award-review-2026-07-15-cn.mjs
 *   ... --confirm   (actually writes; omit for dry-run)
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
if (!DIRECTUS_URL) throw new Error("Missing env DIRECTUS_URL");
if (!DIRECTUS_TOKEN) throw new Error("Missing env DIRECTUS_TOKEN");

const CONFIRM = process.argv.includes("--confirm");
const AWARD_CODE = "cn";
const AWARD_DISPLAY = "Conde Nast Gold List";

const TO_ADD = ["1113","1119","1142","1185","1186","1227","1285","1349","1361","1396","1437","1443","1468","1503","1541","1595","1614","1656","1815","2033","2046","1616","1712","1179"];

const TO_REMOVE = ["1016","1021","1026","1082","1087","1094","1106","1136","1141","1148","1157","1168","1176","1177","1188","1189","1297","1301","1302","1303","1323","1339","1353","1364","1369","1423","1427","1447","1451","1452","1454","1460","1479","1480","1486","1542","1555","1569","1571","1599","1600","1602","1603","1604","1653","1686","1706","1738","1743","1757","1758","1805","1811"];

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
