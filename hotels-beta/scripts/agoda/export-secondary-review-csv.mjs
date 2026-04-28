#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function parseArgs(argv) {
  const args = {
    input: "",
    output: "",
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") args.input = argv[++i] || "";
    else if (arg === "--output") args.output = argv[++i] || "";
  }

  if (!args.input || !args.output) {
    console.error(
      "Usage: node scripts/agoda/export-secondary-review-csv.mjs --input <csv> --output <csv>"
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
    } else if (char !== "\r") {
      cell += char;
    }
  }

  row.push(cell);
  rows.push(row);

  const nonEmptyRows = rows.filter((r) => r.some((v) => String(v).trim() !== ""));
  if (nonEmptyRows.length === 0) return [];

  const headers = nonEmptyRows[0].map((h) => String(h).trim());
  return nonEmptyRows.slice(1).map((values) => {
    const obj = {};
    for (let i = 0; i < headers.length; i += 1) {
      obj[headers[i]] = values[i] ?? "";
    }
    return obj;
  });
}

function esc(value) {
  const s = value == null ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.map(esc).join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => esc(row[h])).join(","));
  }
  return lines.join("\n");
}

function clean(value) {
  return value == null ? "" : String(value).trim();
}

function mapRow(row) {
  return {
    oltra_id: clean(row.oltra_id),
    oltra_hotel_name: clean(row.oltra_hotel_name),
    oltra_city: clean(row.oltra_city),
    oltra_country: clean(row.oltra_country),

    // OLTRA fields (will only populate if present in CSV)
    oltra_latitude: clean(row.oltra_latitude),
    oltra_longitude: clean(row.oltra_longitude),

    // Try all possible OLTRA URL field names
    oltra_url: clean(
      row.oltra_url ||
      row.oltra_www ||
      row.www ||
      row.url
    ),

    // Agoda fields
    agoda_hotel_id: clean(
      row.agoda_full__hotel_id || row.second_best_agoda_hotel_id
    ),

    agoda_hotel_name: clean(
      row.agoda_full__hotel_name || row.second_best_agoda_hotel_name
    ),

    agoda_city: clean(row.agoda_full__city),
    agoda_country: clean(row.agoda_full__country),

    agoda_latitude: clean(row.agoda_full__latitude),
    agoda_longitude: clean(row.agoda_full__longitude),

    // Agoda URL (this one is reliable)
    agoda_url: clean(row.agoda_full__url),

    agoda_photo1: clean(row.agoda_full__photo1),

    agoda_star_rating: clean(row.agoda_full__star_rating),
    agoda_rating_average: clean(row.agoda_full__rating_average),
    agoda_number_of_reviews: clean(row.agoda_full__number_of_reviews),

    decision: clean(row.decision),
    notes: clean(row.notes),
  };
}

function main() {
  const args = parseArgs(process.argv);
  const inputPath = path.resolve(args.input);
  const outputPath = path.resolve(args.output);

  const text = decodeUtf8Bom(fs.readFileSync(inputPath, "utf8"));
  const rows = parseCsv(text);

  const filtered = rows
    .filter((row) => {
      const decision = clean(row.decision).toUpperCase();
      return decision === "CHECK" || decision === "APPROVED";
    })
    .map(mapRow);

  fs.writeFileSync(outputPath, toCsv(filtered), "utf8");
  console.log(`Wrote ${filtered.length} rows to ${outputPath}`);
}

main();