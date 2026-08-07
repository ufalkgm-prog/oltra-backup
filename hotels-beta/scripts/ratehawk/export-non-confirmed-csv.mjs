// For manual Ratehawk lookup: CSV of the OLTRA hotels marked "unsure" or
// "rejected" in the Ratehawk match review, with brand/city/country/www pulled
// fresh from Directus.
//
// Usage (from hotels-beta/):
//   DIRECTUS_URL=... DIRECTUS_TOKEN=... node scripts/ratehawk/export-non-confirmed-csv.mjs

import fs from "fs/promises";

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;

if (!DIRECTUS_URL) throw new Error("Missing DIRECTUS_URL in environment");
if (!DIRECTUS_TOKEN) throw new Error("Missing DIRECTUS_TOKEN in environment");

const decisions = JSON.parse(
  await fs.readFile("scripts/ratehawk/output/ratehawk_match_decisions.json", "utf8")
);
const nonConfirmed = decisions.filter((d) => d.decision !== "confirmed");
const idToStatus = new Map(nonConfirmed.map((d) => [d.oltra_id, d.decision]));
const ids = nonConfirmed.map((d) => d.oltra_id);

const fields = ["id", "hotel_name", "affiliation", "city", "country", "www"].join(",");
const base = DIRECTUS_URL.replace(/\/$/, "");
const url = `${base}/items/hotels?fields=${fields}&limit=-1&filter[id][_in]=${ids.join(",")}`;

const res = await fetch(url, { headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` } });
const text = await res.text();
if (!res.ok) throw new Error(`Directus request failed ${res.status}\n${text}`);
const { data } = JSON.parse(text);

console.log(`Fetched ${data.length} of ${ids.length} requested hotels from Directus`);

function csvEscape(v) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const headers = ["oltra_id", "hotel_name", "brand", "city", "country", "www", "review_status"];
const rows = data
  .map((h) => ({
    oltra_id: h.id,
    hotel_name: h.hotel_name,
    brand: h.affiliation,
    city: h.city,
    country: h.country,
    www: h.www,
    review_status: idToStatus.get(String(h.id)) || ""
  }))
  .sort((a, b) => a.hotel_name.localeCompare(b.hotel_name));

const csv = [
  headers.join(","),
  ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(","))
].join("\n");

const outPath = "scripts/ratehawk/output/ratehawk_non_confirmed_for_manual_check.csv";
await fs.writeFile(outPath, csv, "utf8");
console.log(`Done: ${outPath} (${rows.length} rows)`);
