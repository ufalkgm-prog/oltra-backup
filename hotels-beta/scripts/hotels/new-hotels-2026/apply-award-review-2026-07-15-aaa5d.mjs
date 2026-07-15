#!/usr/bin/env node
/**
 * Apply the reviewed AAA/CAA Five Diamond audit (2026-07-15, full-collection) to Directus.
 * One-time record of a specific reviewed session — the ID lists below are the exact
 * decisions the user approved via the review artifact (58 additions, 9 removals). One
 * candidate the user correctly rejected during review: id 1721 "The Fifth Avenue Hotel"
 * was a false-positive match against "The Langham, New York, Fifth Avenue" (coincidental
 * "Fifth Avenue" word overlap, two different hotels) — excluded from this list.
 *
 * Dry-run by default; --confirm to actually patch. Sets BOTH the aaa5d boolean column and
 * the `awards` tag array together on every hotel touched (per CLAUDE.md §4/§24 — the two
 * must move in lockstep, and array writes need the Postgres literal string).
 *
 * Usage (from hotels-beta/):
 *   DIRECTUS_URL=... DIRECTUS_TOKEN=... node scripts/hotels/new-hotels-2026/apply-award-review-2026-07-15-aaa5d.mjs
 *   ... --confirm   (actually writes; omit for dry-run)
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
if (!DIRECTUS_URL) throw new Error("Missing env DIRECTUS_URL");
if (!DIRECTUS_TOKEN) throw new Error("Missing env DIRECTUS_TOKEN");

const CONFIRM = process.argv.includes("--confirm");
const AWARD_CODE = "aaa5d";
const AWARD_DISPLAY = "AAA/CAA Five Diamond Hotels";

const TO_ADD = ["1236","1244","1267","1623","1632","1639","1643","1644","1645","1648","1649","1654","1660","1669","1670","1672","1674","1677","1678","1680","1686","1691","1695","1696","1700","1703","1707","1716","1725","1728","1731","1733","1738","1739","1740","1742","1744","1748","1749","1752","1754","1755","1757","1760","1762","1768","2032","1633","1636","1642","1650","1681","1712","1729","1769","1255","1261","1626"];

const TO_REMOVE = ["1246","1653","1673","1719","1720","1756","1758","1766","2046"];

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
