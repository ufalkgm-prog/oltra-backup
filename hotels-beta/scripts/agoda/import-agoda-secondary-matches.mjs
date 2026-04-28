#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
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
    secondaryCsv: "",
    agodaCsv: "",
    dryRun: false,
    limit: null,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--secondary-csv") {
      args.secondaryCsv = argv[++i] || "";
    } else if (arg === "--agoda-csv") {
      args.agodaCsv = argv[++i] || "";
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--limit") {
      const value = Number(argv[++i]);
      args.limit = Number.isFinite(value) ? value : null;
    }
  }

  if (!args.secondaryCsv || !args.agodaCsv) {
    console.error(
      "Usage: node scripts/agoda/import-agoda-secondary-matches.mjs --secondary-csv <file> --agoda-csv <file> [--dry-run] [--limit N]"
    );
    process.exit(1);
  }

  return args;
}

function decodeUtf8Bom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char === "\r") {
      // ignore
    } else {
      cell += char;
    }
  }

  row.push(cell);
  rows.push(row);

  const nonEmptyRows = rows.filter((r) => r.some((value) => String(value).trim() !== ""));
  if (nonEmptyRows.length === 0) return [];

  const header = nonEmptyRows[0].map((h) => String(h).trim());
  return nonEmptyRows.slice(1).map((values) => {
    const obj = {};
    for (let i = 0; i < header.length; i += 1) {
      obj[header[i]] = values[i] ?? "";
    }
    return obj;
  });
}

function normalizeString(value) {
  if (value == null) return "";
  return String(value).trim();
}

function normalizeNumber(value) {
  const raw = normalizeString(value);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function buildAgodaPayload(agodaRow) {
  return {
    agoda_hotel_id: normalizeString(agodaRow.hotel_id) || null,
    agoda_hotel_name: normalizeString(agodaRow.hotel_name) || null,
    agoda_city: normalizeString(agodaRow.city) || null,
    agoda_country: normalizeString(agodaRow.country) || null,
    agoda_addressline1: normalizeString(agodaRow.addressline1) || null,
    agoda_addressline2: normalizeString(agodaRow.addressline2) || null,
    agoda_zipcode: normalizeString(agodaRow.zipcode) || null,

    // keep if schema supports it; remove later if needed for failed rows
    agoda_star_rating: normalizeNumber(agodaRow.star_rating),

    agoda_longitude: normalizeNumber(agodaRow.longitude),
    agoda_latitude: normalizeNumber(agodaRow.latitude),
    agoda_url: normalizeString(agodaRow.url) || null,
    agoda_photo1: normalizeString(agodaRow.photo1) || null,
    agoda_photo2: normalizeString(agodaRow.photo2) || null,
    agoda_photo3: normalizeString(agodaRow.photo3) || null,
    agoda_photo4: normalizeString(agodaRow.photo4) || null,
    agoda_photo5: normalizeString(agodaRow.photo5) || null,
    agoda_overview: normalizeString(agodaRow.overview) || null,
    agoda_number_of_reviews: normalizeNumber(agodaRow.number_of_reviews),
    agoda_rating_average: normalizeNumber(agodaRow.rating_average),
  };
}

async function directusPatch(id, payload) {
  const url = `${DIRECTUS_URL.replace(/\/$/, "")}/items/${DIRECTUS_COLLECTION}/${id}`;

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${DIRECTUS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Directus PATCH failed ${response.status} ${text}`);
  }

  return response.json();
}

async function main() {
  const args = parseArgs(process.argv);

  const secondaryCsvPath = path.resolve(args.secondaryCsv);
  const agodaCsvPath = path.resolve(args.agodaCsv);

  const secondaryText = decodeUtf8Bom(fs.readFileSync(secondaryCsvPath, "utf8"));
  const agodaText = decodeUtf8Bom(fs.readFileSync(agodaCsvPath, "utf8"));

  const secondaryRows = parseCsv(secondaryText);
  const agodaRows = parseCsv(agodaText);

  const agodaByHotelId = new Map();
  for (const row of agodaRows) {
    const hotelId = normalizeString(row.hotel_id);
    if (hotelId) {
      agodaByHotelId.set(hotelId, row);
    }
  }

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of secondaryRows) {
    if (args.limit != null && processed >= args.limit) break;
    processed += 1;

    const decision = normalizeString(row.decision).toUpperCase();
    const oltraId = normalizeString(row.oltra_id);
    const agodaHotelId = normalizeString(row.second_best_agoda_hotel_id);

    if (!oltraId || !agodaHotelId) {
      skipped += 1;
      console.log(`SKIP missing oltra_id or second_best_agoda_hotel_id`);
      continue;
    }

    if (decision && decision !== "CHECK" && decision !== "APPROVED") {
      skipped += 1;
      console.log(`SKIP oltra_id ${oltraId}: decision=${decision}`);
      continue;
    }

    const agodaRow = agodaByHotelId.get(agodaHotelId);
    if (!agodaRow) {
      failed += 1;
      console.log(`FAIL oltra_id ${oltraId}: Agoda hotel_id ${agodaHotelId} not found in agoda.csv`);
      continue;
    }

    const payload = buildAgodaPayload(agodaRow);

    console.log("--------------------------------------------------");
    console.log(`OLTRA ID: ${oltraId}`);
    console.log(`OLTRA Hotel: ${normalizeString(row.oltra_hotel_name)}`);
    console.log(`Agoda ID: ${agodaHotelId}`);
    console.log(`Agoda Hotel: ${normalizeString(agodaRow.hotel_name)}`);

    try {
      if (args.dryRun) {
        console.log("DRY RUN payload:");
        console.log(JSON.stringify(payload, null, 2));
      } else {
        await directusPatch(oltraId, payload);
        console.log("UPDATED");
      }
      updated += 1;
    } catch (error) {
      failed += 1;
      console.log(`ERROR oltra_id ${oltraId}: ${error.message}`);
    }
  }

  console.log("==================================================");
  console.log(`Processed: ${processed}`);
  console.log(`Updated:   ${updated}`);
  console.log(`Skipped:   ${skipped}`);
  console.log(`Failed:    ${failed}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});