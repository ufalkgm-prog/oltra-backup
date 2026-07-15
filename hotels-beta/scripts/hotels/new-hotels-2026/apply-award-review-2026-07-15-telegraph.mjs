#!/usr/bin/env node
/**
 * Apply the reviewed Telegraph Best Hotels audit (2026-07-15, full-collection) to
 * Directus. One-time record of a specific reviewed session — the ID lists below are the
 * exact decisions the user approved via the review artifact (18 additions, 3 removals).
 * This is the last of the 7 award codes in the 2026-07-15 full-collection audit (see
 * CLAUDE.md §25) — after this runs and ext_points recalcs, all 7 are fully reconciled.
 *
 * Dry-run by default; --confirm to actually patch. Sets BOTH the telegraph boolean
 * column and the `awards` tag array together on every hotel touched (per CLAUDE.md
 * §4/§24).
 *
 * Usage (from hotels-beta/):
 *   DIRECTUS_URL=... DIRECTUS_TOKEN=... node scripts/hotels/new-hotels-2026/apply-award-review-2026-07-15-telegraph.mjs
 *   ... --confirm   (actually writes; omit for dry-run)
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
if (!DIRECTUS_URL) throw new Error("Missing env DIRECTUS_URL");
if (!DIRECTUS_TOKEN) throw new Error("Missing env DIRECTUS_TOKEN");

const CONFIRM = process.argv.includes("--confirm");
const AWARD_CODE = "telegraph";
const AWARD_DISPLAY = "Telegraph Best Hotels in the World";

const TO_ADD = ["1045","1094","1176","1210","1217","1227","1306","1368","1396","1454","1706","1785","1800","1822","1119","1359","1634","1805"];

const TO_REMOVE = ["1028","1420","1427"];

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
