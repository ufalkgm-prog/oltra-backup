#!/usr/bin/env node
// Backfill the ratehawk_hid field on the hotels collection for every
// CONFIRMED match in ratehawk_match_decisions.json. --dry-run supported.
//
// Usage (from hotels-beta/):
//   DIRECTUS_URL=... DIRECTUS_TOKEN=... node scripts/ratehawk/apply-ratehawk-hid.mjs [--dry-run]

import fs from "fs/promises";

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
if (!DIRECTUS_URL) throw new Error("Missing DIRECTUS_URL in environment");
if (!DIRECTUS_TOKEN) throw new Error("Missing DIRECTUS_TOKEN in environment");

const isDryRun = process.argv.includes("--dry-run");
const base = DIRECTUS_URL.replace(/\/$/, "");

const decisions = JSON.parse(
  await fs.readFile("scripts/ratehawk/output/ratehawk_match_decisions.json", "utf8")
);
const confirmed = decisions.filter((d) => d.decision === "confirmed" && d.ratehawk_hid);

console.log(`Mode: ${isDryRun ? "DRY RUN" : "LIVE"}`);
console.log(`Hotels to update: ${confirmed.length}`);

if (isDryRun) {
  for (const d of confirmed.slice(0, 10)) {
    console.log(` - ${d.oltra_id}: ratehawk_hid = ${d.ratehawk_hid} (${d.ratehawk_name})`);
  }
  console.log("... dry run, no writes made.");
  process.exit(0);
}

let updated = 0;
let failed = 0;

for (const d of confirmed) {
  const res = await fetch(`${base}/items/hotels/${d.oltra_id}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${DIRECTUS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ratehawk_hid: Number(d.ratehawk_hid) }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`FAILED ${d.oltra_id}: ${res.status} ${text}`);
    failed++;
    continue;
  }
  updated++;
  if (updated % 100 === 0) console.log(`...${updated} updated`);
}

console.log(`\nDone. Updated: ${updated}, Failed: ${failed}`);
