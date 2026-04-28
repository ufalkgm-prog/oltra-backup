#!/usr/bin/env node

import fs from "node:fs";
import process from "node:process";

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
const DIRECTUS_COLLECTION = process.env.DIRECTUS_COLLECTION || "hotels";

if (!DIRECTUS_URL || !DIRECTUS_TOKEN) {
  console.error("Missing DIRECTUS_URL or DIRECTUS_TOKEN");
  process.exit(1);
}

function parseArgs(argv) {
  const args = {
    output: "agoda/agoda-matching/agoda-image-tool-review.csv",
    limit: -1,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--output") args.output = argv[++i];
    else if (arg === "--limit") args.limit = Number(argv[++i]);
  }

  return args;
}

async function directusRequest(path) {
  const response = await fetch(`${DIRECTUS_URL.replace(/\/$/, "")}${path}`, {
    headers: {
      Authorization: `Bearer ${DIRECTUS_TOKEN}`,
      "Content-Type": "application/json",
    },
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Directus ${response.status}: ${text}`);
  }

  return text ? JSON.parse(text) : null;
}

async function fetchAllHotels() {
  const fields = [
    "id",
    "hotelid",
    "hotel_name",
    "city",
    "country",
    "agoda_hotel_id",
    "agoda_hotel_name",
    "agoda_city",
    "agoda_country",
    "agoda_photo1",
    "agoda_photo2",
    "agoda_photo3",
    "agoda_photo4",
    "agoda_photo5",
  ].join(",");

  const all = [];
  let page = 1;
  const limit = 500;

  while (true) {
    const result = await directusRequest(
      `/items/${DIRECTUS_COLLECTION}?fields=${fields}&limit=${limit}&page=${page}&sort=id`
    );

    const rows = result.data || [];
    all.push(...rows);

    if (rows.length < limit) break;
    page += 1;
  }

  return all;
}

function clean(value) {
  return value == null ? "" : String(value).trim();
}

function csvEscape(value) {
  const s = clean(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function makeAgodaSearchPhrase(hotel) {
  return [hotel.agoda_hotel_name, hotel.agoda_city, hotel.agoda_country]
    .map(clean)
    .filter(Boolean)
    .join(", ");
}

function toCsv(rows) {
  const headers = [
    "oltra_id",
    "oltra_hotelid",
    "oltra_hotel_name",
    "oltra_city",
    "oltra_country",
    "agoda_hotel_id",
    "agoda_search_phrase",
    "agoda_hotel_name",
    "agoda_city",
    "agoda_country",
    "agoda_photo1",
    "agoda_photo2",
    "agoda_photo3",
    "agoda_photo4",
    "agoda_photo5",
    "toolkit_html_or_image_url",
    "notes",
  ];

  const lines = [headers.join(",")];

  for (const hotel of rows) {
    const row = {
      oltra_id: hotel.id,
      oltra_hotelid: hotel.hotelid,
      oltra_hotel_name: hotel.hotel_name,
      oltra_city: hotel.city,
      oltra_country: hotel.country,
      agoda_hotel_id: hotel.agoda_hotel_id,
      agoda_search_phrase: makeAgodaSearchPhrase(hotel),
      agoda_hotel_name: hotel.agoda_hotel_name,
      agoda_city: hotel.agoda_city,
      agoda_country: hotel.agoda_country,
      agoda_photo1: hotel.agoda_photo1,
      agoda_photo2: hotel.agoda_photo2,
      agoda_photo3: hotel.agoda_photo3,
      agoda_photo4: hotel.agoda_photo4,
      agoda_photo5: hotel.agoda_photo5,
      toolkit_html_or_image_url: "",
      notes: "",
    };

    lines.push(headers.map((header) => csvEscape(row[header])).join(","));
  }

  return lines.join("\n");
}

async function main() {
  const args = parseArgs(process.argv);

  let hotels = await fetchAllHotels();

  if (Number.isFinite(args.limit) && args.limit > 0) {
    hotels = hotels.slice(0, args.limit);
  }

  fs.writeFileSync(args.output, toCsv(hotels), "utf8");

  console.log(`Wrote ${hotels.length} hotels to ${args.output}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});