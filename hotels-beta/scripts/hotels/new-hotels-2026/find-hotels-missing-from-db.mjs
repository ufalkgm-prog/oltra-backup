#!/usr/bin/env node
/**
 * Cross-check one or more award source lists (awards-2026/*.json) against the full
 * hotels collection and report source entries with NO match at any tier (confirmed /
 * near / uncertain) — i.e. hotels on the award list that aren't in the OLTRA database
 * at all. Read-only, no Directus writes.
 *
 * Reuses match-hotel-awards.mjs's exported matching functions rather than duplicating
 * the logic (see CLAUDE.md §25 — this script formalizes the ad hoc delta check built
 * during the 2026-07-15 audit, which wasn't saved as a named file at the time).
 *
 * Usage (from hotels-beta/):
 *   DIRECTUS_URL=... DIRECTUS_TOKEN=... node scripts/hotels/new-hotels-2026/find-hotels-missing-from-db.mjs --awards michelin3keys,forbes5,best50
 *   ... --out <path.tsv>   (defaults to missing-from-db-<date>.tsv in this folder)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  ALL_AWARD_CODES, AWARD_DISPLAY, loadAwardList, loadHotels,
  hotelLocationFields, coreTokenSet, matchHotelToAward,
} from "./match-hotel-awards.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs() {
  const argv = process.argv.slice(2);
  const get = (flag) => {
    const i = argv.indexOf(flag);
    return i !== -1 ? argv[i + 1] : undefined;
  };
  const awardsArg = get("--awards");
  const outArg = get("--out");
  return { awardsArg, outArg };
}

function formatEntryLoc(entry) {
  return { city: entry.city ?? entry.location ?? "", country: entry.country ?? "" };
}

async function main() {
  const { awardsArg, outArg } = parseArgs();
  const codes = awardsArg ? awardsArg.split(",").map((s) => s.trim()) : ALL_AWARD_CODES;
  for (const code of codes) {
    if (!ALL_AWARD_CODES.includes(code)) {
      throw new Error(`Unknown award code "${code}". Valid: ${ALL_AWARD_CODES.join(", ")}`);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const outPath = outArg ? path.resolve(outArg) : path.join(__dirname, `missing-from-db-${today}.tsv`);

  // Hotels don't change per award code, load once.
  const hotels = await loadHotels(null, null);
  const precomputed = hotels.map((hotel) => {
    const hotelLoc = hotelLocationFields(hotel);
    const hotelCoreSet = coreTokenSet(hotel.hotel_name);
    const hotelCoreKey = hotelCoreSet.slice().sort().join(" ");
    return { hotel, hotelLoc, hotelCoreKey, hotelCoreSet };
  });
  console.log(`Loaded ${hotels.length} hotels from Directus.`);

  const rows = [];
  for (const code of codes) {
    const awardList = await loadAwardList(code);
    let missing = 0;
    for (const entry of awardList) {
      let matched = false;
      for (const p of precomputed) {
        const result = matchHotelToAward(p.hotel, p.hotelLoc, p.hotelCoreKey, p.hotelCoreSet, entry);
        if (result) { matched = true; break; }
      }
      if (!matched) {
        missing += 1;
        const loc = formatEntryLoc(entry);
        rows.push({
          hotel_name: entry.hotel_name,
          city: loc.city || "",
          country: loc.country || "",
          award: AWARD_DISPLAY[code],
        });
      }
    }
    console.log(`${code}: ${missing} of ${awardList.length} entries have no match in the DB.`);
  }

  // Sort for readability: award, then country, then hotel name.
  rows.sort((a, b) =>
    a.award.localeCompare(b.award) || a.country.localeCompare(b.country) || a.hotel_name.localeCompare(b.hotel_name)
  );

  const lines = ["Hotel Name\tCity\tCountry\tAward"];
  for (const r of rows) {
    lines.push([r.hotel_name, r.city, r.country, r.award].join("\t"));
  }
  fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8");

  console.log(`\n${rows.length} total rows written to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
