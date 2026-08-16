#!/usr/bin/env node
/**
 * One-time cleanup of invalid values in the editorial single-select columns
 * (primary_setting / secondary_setting / primary_style / secondary_style).
 *
 * These four columns carry no meta.options.choices in Directus (confirmed via GET /fields/hotels),
 * so nothing has ever constrained them and a few values drifted outside the setting/style
 * vocabularies used by the tag arrays. Found while adding validation for these columns to
 * create-hotels-batch.mjs — that validator only guards NEW rows, so existing rows need this pass.
 *
 * Changes (agreed with Ulrik 2026-08-16):
 *   - secondary_style "184" -> null on 8 hotels (junk data — a number in a style column)
 *   - primary_setting "Lakefront"  -> "Waterfront" (id 1461)
 *   - secondary_setting "Riverfront" -> "Riverside" (id 1839)
 *
 * "Riverside" itself is left alone everywhere — it is a canonical taxonomy value (a live choice
 * on the setting field, 29 hotels carry it in their setting[] tag arrays), not drift.
 *
 * These are plain text columns, so a normal PATCH works — the Postgres array-literal dance
 * required for activities/awards/setting/style (see CLAUDE.md §4) does NOT apply here.
 *
 * Usage (from hotels-beta/):
 *   DIRECTUS_URL=... DIRECTUS_TOKEN=... node scripts/hotels/new-hotels-2026/fix-setting-style-values-2026-08-16.mjs
 *   ... --confirm     actually write (default is dry-run)
 *
 * Re-runnable: every change is verified against the current stored value first, so a second run
 * reports "already correct" rather than clobbering anything.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DIRECTUS_URL = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;

if (!DIRECTUS_URL) throw new Error("Missing env DIRECTUS_URL");
if (!DIRECTUS_TOKEN) throw new Error("Missing env DIRECTUS_TOKEN");

const APPLY = process.argv.includes("--confirm");

// id, field, the value we expect to find, and what it becomes.
const CHANGES = [
  { id: "1151", field: "secondary_style", from: "184", to: null, hotel: "The Datai Langkawi" },
  { id: "1441", field: "secondary_style", from: "184", to: null, hotel: "Grand Hotel a Villa Feltrinelli" },
  { id: "1486", field: "secondary_style", from: "184", to: null, hotel: "Villa d'Este" },
  { id: "1603", field: "secondary_style", from: "184", to: null, hotel: "Emirates Palace Mandarin Oriental Abu Dhabi" },
  { id: "1679", field: "secondary_style", from: "184", to: null, hotel: "Sensei Lanai" },
  { id: "1724", field: "secondary_style", from: "184", to: null, hotel: "The Hay-Adams" },
  { id: "1733", field: "secondary_style", from: "184", to: null, hotel: "The Lodge at Torrey Pines" },
  { id: "1745", field: "secondary_style", from: "184", to: null, hotel: "The Ritz-Carlton, Bachelor Gulch" },
  { id: "1461", field: "primary_setting", from: "Lakefront", to: "Waterfront", hotel: "Mandarin Oriental, Lago di Como" },
  { id: "1839", field: "secondary_setting", from: "Riverfront", to: "Riverside", hotel: "Clayoquot Wilderness Lodge" },
];

async function directusFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${DIRECTUS_TOKEN}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    const msg = json?.errors?.[0]?.message || `${res.status} ${res.statusText}`;
    const err = new Error(msg);
    err.details = json;
    err.status = res.status;
    throw err;
  }

  return json;
}

async function main() {
  console.log(`Mode: ${APPLY ? "LIVE WRITE" : "DRY RUN (pass --confirm to write)"}`);
  console.log(`Planned changes: ${CHANGES.length}`);
  console.log("");

  const rollback = [];
  let changed = 0;
  let alreadyCorrect = 0;
  let mismatched = 0;
  let failed = 0;

  for (const change of CHANGES) {
    const { id, field, from, to, hotel } = change;

    try {
      const current = (
        await directusFetch(
          `${DIRECTUS_URL}/items/hotels/${encodeURIComponent(id)}?fields=id,hotel_name,${field}`
        )
      ).data;

      const stored = current?.[field] ?? null;

      if (stored === to) {
        alreadyCorrect += 1;
        console.log(`SKIP  id=${id} ${field} — already ${JSON.stringify(to)} (${hotel})`);
        continue;
      }

      // Guard against acting on a value that has moved since this list was compiled.
      if (String(stored).trim() !== from) {
        mismatched += 1;
        console.warn(
          `SKIP  id=${id} ${field} — expected ${JSON.stringify(from)}, found ${JSON.stringify(stored)} (${hotel})`
        );
        continue;
      }

      console.log(`${APPLY ? "WRITE" : "WOULD"} id=${id} ${field}: ${JSON.stringify(stored)} -> ${JSON.stringify(to)}  (${hotel})`);
      rollback.push({ id, field, previous: stored, applied: to, hotel });

      if (!APPLY) continue;

      await directusFetch(`${DIRECTUS_URL}/items/hotels/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ [field]: to }),
      });
      changed += 1;
    } catch (err) {
      failed += 1;
      console.error(`ERROR id=${id} ${field}: ${err.message}`);
      if (err.details) console.error("  details:", JSON.stringify(err.details));
    }
  }

  if (APPLY && rollback.length > 0) {
    const out = path.join(__dirname, "fix-setting-style-values-2026-08-16-rollback.json");
    fs.writeFileSync(out, JSON.stringify(rollback, null, 2));
    console.log(`\nRollback record written to ${out}`);
  }

  console.log("");
  console.log("============================================================");
  console.log(`${APPLY ? "Changed" : "Would change"}: ${APPLY ? changed : rollback.length}`);
  console.log(`Already correct:  ${alreadyCorrect}`);
  console.log(`Value mismatch:   ${mismatched}`);
  console.log(`Failed:           ${failed}`);
  console.log("Done.");

  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
