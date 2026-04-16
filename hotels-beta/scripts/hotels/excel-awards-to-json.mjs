#!/usr/bin/env node
import fs from "fs";
import path from "path";
import xlsx from "xlsx";

function parseArgs(argv) {
  const args = {
    input: "",
    output: "",
    sheet: "",
  };

  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];

    if (a === "--input") {
      args.input = argv[++i];
      continue;
    }
    if (a === "--output") {
      args.output = argv[++i];
      continue;
    }
    if (a === "--sheet") {
      args.sheet = argv[++i];
      continue;
    }

    throw new Error(`Unknown argument: ${a}`);
  }

  if (!args.input) throw new Error("Missing --input");
  if (!args.output) throw new Error("Missing --output");

  return args;
}

function normalizeCode(value) {
  return String(value || "").trim().toLowerCase();
}

function uniqueSorted(list) {
  return [...new Set(list)].sort((a, b) => a.localeCompare(b));
}

function parseAwardCodes(value) {
  if (Array.isArray(value)) {
    return uniqueSorted(value.map(normalizeCode).filter(Boolean));
  }

  if (value == null) return [];

  const raw = String(value).trim();
  if (!raw) return [];

  return uniqueSorted(
    raw
      .split(/[,\|;]/)
      .map(normalizeCode)
      .filter(Boolean)
  );
}

function firstDefined(obj, keys) {
  for (const key of keys) {
    if (obj[key] != null && String(obj[key]).trim() !== "") {
      return obj[key];
    }
  }
  return null;
}

function main() {
  const args = parseArgs(process.argv);
  const inputPath = path.resolve(args.input);
  const outputPath = path.resolve(args.output);

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  const workbook = xlsx.readFile(inputPath);
  const sheetName = args.sheet || workbook.SheetNames[0];

  if (!workbook.SheetNames.includes(sheetName)) {
    throw new Error(
      `Sheet "${sheetName}" not found. Available sheets: ${workbook.SheetNames.join(", ")}`
    );
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(sheet, {
    defval: "",
    raw: false,
  });

  const output = rows.map((row, idx) => {
    const id = firstDefined(row, ["id", "hotel_id", "directus_id"]);
    const hotelName = firstDefined(row, ["hotel_name", "name"]);
    const newAwards = firstDefined(row, ["new_awards"]);
    const externalScore = firstDefined(row, ["external_score"]);

    if (id == null) {
      throw new Error(`Row ${idx + 2}: missing id/hotel_id/directus_id`);
    }

    const parsedScore =
      externalScore == null || String(externalScore).trim() === ""
        ? null
        : Number(externalScore);

    return {
      id: String(id).trim(),
      hotel_name: hotelName ? String(hotelName).trim() : "",
      new_awards: parseAwardCodes(newAwards),
      external_score: Number.isFinite(parsedScore) ? parsedScore : null,
    };
  });

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`Wrote ${output.length} rows to ${outputPath}`);
  console.log(`Sheet used: ${sheetName}`);
}

main();