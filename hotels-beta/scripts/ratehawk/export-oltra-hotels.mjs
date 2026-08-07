// Fresh snapshot of the OLTRA hotels collection for Ratehawk matching.
// Same shape as scripts/agoda/oltra_hotels_full.json but adds lat/lng
// (used as an optional distance tiebreaker during matching).
//
// Usage (from hotels-beta/):
//   DIRECTUS_URL=... DIRECTUS_TOKEN=... node scripts/ratehawk/export-oltra-hotels.mjs

import fs from "fs/promises";

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
const COLLECTION = process.env.DIRECTUS_COLLECTION || "hotels";

if (!DIRECTUS_URL) throw new Error("Missing DIRECTUS_URL in environment");
if (!DIRECTUS_TOKEN) throw new Error("Missing DIRECTUS_TOKEN in environment");

const PAGE_LIMIT = 500;
const OUTPUT_PATH = "scripts/ratehawk/output/oltra_hotels.json";

const fields = [
  "id",
  "hotel_name",
  "affiliation",
  "city",
  "country",
  "region",
  "state_province_county_island",
  "local_area",
  "lat",
  "lng"
].join(",");

function buildUrl(offset) {
  const base = DIRECTUS_URL.replace(/\/$/, "");
  const params = new URLSearchParams();
  params.set("fields", fields);
  params.set("limit", String(PAGE_LIMIT));
  params.set("offset", String(offset));
  params.set("sort", "hotel_name");
  return `${base}/items/${COLLECTION}?${params.toString()}`;
}

async function fetchPage(offset) {
  const res = await fetch(buildUrl(offset), {
    headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` }
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Directus request failed ${res.status}\n${text}`);
  const json = JSON.parse(text);
  return Array.isArray(json.data) ? json.data : [];
}

const all = [];
let offset = 0;

while (true) {
  const rows = await fetchPage(offset);
  if (!rows.length) break;
  all.push(...rows);
  console.log(`Fetched ${rows.length} rows (total: ${all.length})`);
  offset += PAGE_LIMIT;
}

await fs.mkdir("scripts/ratehawk/output", { recursive: true });
await fs.writeFile(OUTPUT_PATH, JSON.stringify(all, null, 2), "utf8");

console.log(`Done: ${OUTPUT_PATH} (${all.length} hotels)`);
