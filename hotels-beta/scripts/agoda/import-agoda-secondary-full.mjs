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
    csv: "",
    dryRun: false,
    limit: null,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--csv") {
      args.csv = argv[++i] || "";
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--limit") {
      const value = Number(argv[++i]);
      args.limit = Number.isFinite(value) ? value : null;
    }
  }

  if (!args.csv) {
    console.error(
      "Usage: node scripts/agoda/import-agoda-secondary-full.mjs --csv <file> [--dry-run] [--limit N]"
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

function pick(row, ...keys) {
  for (const key of keys) {
    if (key in row) return row[key];
  }
  return "";
}

function buildPayload(row) {
  return {
    agoda_hotel_id: normalizeString(
      pick(
        row,
        "agoda_hotel_id",
        "second_best_agoda_hotel_id",
        "agoda_full__hotel_id",
        "hotel_id"
      )
    ) || null,

    agoda_hotel_name: normalizeString(
      pick(
        row,
        "agoda_hotel_name",
        "second_best_agoda_hotel_name",
        "agoda_full__hotel_name",
        "hotel_name"
      )
    ) || null,

    agoda_city: normalizeString(
      pick(row, "agoda_city", "agoda_full__city", "city")
    ) || null,

    agoda_country: normalizeString(
      pick(row, "agoda_country", "agoda_full__country", "country")
    ) || null,

    agoda_addressline1: normalizeString(
      pick(row, "agoda_addressline1", "agoda_full__addressline1", "addressline1")
    ) || null,

    agoda_addressline2: normalizeString(
      pick(row, "agoda_addressline2", "agoda_full__addressline2", "addressline2")
    ) || null,

    agoda_zipcode: normalizeString(
      pick(row, "agoda_zipcode", "agoda_full__zipcode", "zipcode")
    ) || null,

    // Remove this line if Directus agoda_star_rating is still integer-only
    agoda_star_rating: normalizeNumber(
      pick(row, "agoda_star_rating", "agoda_full__star_rating", "star_rating")
    ),

    agoda_longitude: normalizeNumber(
      pick(row, "agoda_longitude", "agoda_full__longitude", "longitude")
    ),

    agoda_latitude: normalizeNumber(
      pick(row, "agoda_latitude", "agoda_full__latitude", "latitude")
    ),

    agoda_url: normalizeString(
      pick(row, "agoda_url", "agoda_full__url", "url")
    ) || null,

    agoda_photo1: normalizeString(
      pick(row, "agoda_photo1", "agoda_full__photo1", "photo1")
    ) || null,

    agoda_photo2: normalizeString(
      pick(row, "agoda_photo2", "agoda_full__photo2", "photo2")
    ) || null,

    agoda_photo3: normalizeString(
      pick(row, "agoda_photo3", "agoda_full__photo3", "photo3")
    ) || null,

    agoda_photo4: normalizeString(
      pick(row, "agoda_photo4", "agoda_full__photo4", "photo4")
    ) || null,

    agoda_photo5: normalizeString(
      pick(row, "agoda_photo5", "agoda_full__photo5", "photo5")
    ) || null,

    agoda_overview: normalizeString(
      pick(row, "agoda_overview", "agoda_full__overview", "overview")
    ) || null,

    agoda_number_of_reviews: normalizeNumber(
      pick(
        row,
        "agoda_number_of_reviews",
        "agoda_full__number_of_reviews",
        "number_of_reviews"
      )
    ),

    agoda_rating_average: normalizeNumber(
      pick(
        row,
        "agoda_rating_average",
        "agoda_full__rating_average",
        "rating_average"
      )
    ),
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
  const csvPath = path.resolve(args.csv);
  const csvText = decodeUtf8Bom(fs.readFileSync(csvPath, "utf8"));
  const rows = parseCsv(csvText);

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    if (args.limit != null && processed >= args.limit) break;
    processed += 1;

    const oltraId = normalizeString(row.oltra_id);
    const decision = normalizeString(row.decision).toUpperCase();

    if (!oltraId) {
      skipped += 1;
      console.log("SKIP missing oltra_id");
      continue;
    }

    if (decision && decision !== "CHECK" && decision !== "APPROVED") {
      skipped += 1;
      console.log(`SKIP oltra_id ${oltraId}: decision=${decision}`);
      continue;
    }

    const payload = buildPayload(row);

    console.log("--------------------------------------------------");
    console.log(`OLTRA ID: ${oltraId}`);
    console.log(`OLTRA Hotel: ${normalizeString(row.oltra_hotel_name)}`);
    console.log(`Agoda Hotel ID: ${payload.agoda_hotel_id ?? ""}`);
    console.log(`Agoda Hotel Name: ${payload.agoda_hotel_name ?? ""}`);

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