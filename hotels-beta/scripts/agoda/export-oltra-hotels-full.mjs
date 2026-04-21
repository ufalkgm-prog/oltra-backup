import fs from "fs/promises";

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
const COLLECTION = process.env.DIRECTUS_COLLECTION || "hotels";

if (!DIRECTUS_URL) throw new Error("Missing DIRECTUS_URL in environment");
if (!DIRECTUS_TOKEN) throw new Error("Missing DIRECTUS_TOKEN in environment");

const PAGE_LIMIT = 500;

const fields = [
  "id",
  "hotelid",
  "hotel_name",
  "city",
  "country",
  "region",
  "state_province__county__island",
  "local_area"
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
  const url = buildUrl(offset);
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${DIRECTUS_TOKEN}`
    }
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Directus request failed ${res.status}\n${text}`);
  }

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

await fs.writeFile(
  "scripts/agoda/oltra_hotels_full.json",
  JSON.stringify(all, null, 2),
  "utf8"
);

console.log("Done: scripts/agoda/oltra_hotels_full.json");
