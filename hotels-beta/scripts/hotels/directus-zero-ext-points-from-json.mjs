#!/usr/bin/env node
import fs from "fs";
import path from "path";

const DIRECTUS_URL = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;

if (!DIRECTUS_URL) {
  throw new Error("Missing env DIRECTUS_URL");
}
if (!DIRECTUS_TOKEN) {
  throw new Error("Missing env DIRECTUS_TOKEN");
}

function parseArgs(argv) {
  const args = {
    input: "",
    dryRun: false,
    limit: null,
    hotelId: null,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];

    if (a === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (a === "--input") {
      args.input = argv[++i];
      continue;
    }
    if (a === "--limit") {
      args.limit = Number(argv[++i]);
      continue;
    }
    if (a === "--hotel-id") {
      args.hotelId = String(argv[++i]);
      continue;
    }

    throw new Error(`Unknown argument: ${a}`);
  }

  if (!args.input) {
    throw new Error("Missing required --input <file>");
  }

  return args;
}

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
    throw new Error(
      `Directus request failed ${res.status} ${res.statusText}\n${JSON.stringify(json, null, 2)}`
    );
  }

  return json;
}

async function fetchHotel(hotelId) {
  const fields = ["id", "hotel_name", "ext_points"].join(",");
  const url = `${DIRECTUS_URL}/items/hotels/${encodeURIComponent(hotelId)}?fields=${encodeURIComponent(fields)}`;
  const json = await directusFetch(url, { method: "GET" });
  return json.data;
}

async function patchHotelExtPoints(hotelId, extPoints) {
  const url = `${DIRECTUS_URL}/items/hotels/${encodeURIComponent(hotelId)}`;

  return directusFetch(url, {
    method: "PATCH",
    body: JSON.stringify({
      ext_points: extPoints,
    }),
  });
}

function readInputFile(inputPath) {
  const raw = fs.readFileSync(inputPath, "utf8");
  const data = JSON.parse(raw);

  if (!Array.isArray(data)) {
    throw new Error("Input JSON must be an array");
  }

  return data.map((row, idx) => {
    const hotelId = row.id ?? row.hotel_id ?? row.directus_id;
    if (hotelId == null || String(hotelId).trim() === "") {
      throw new Error(`Row ${idx + 1}: missing id/hotel_id/directus_id`);
    }

    const extPoints = row.ext_points ?? 0;

    return {
      id: String(hotelId).trim(),
      ext_points: String(Number(extPoints)),
    };
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const inputPath = path.resolve(args.input);

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  let rows = readInputFile(inputPath);

  if (args.hotelId) {
    rows = rows.filter((r) => r.id === args.hotelId);
  }

  if (args.limit != null) {
    rows = rows.slice(0, args.limit);
  }

  console.log(`Loaded ${rows.length} rows from ${inputPath}`);
  console.log(`Mode: ${args.dryRun ? "DRY RUN" : "LIVE PATCH"}`);
  console.log("");

  let processed = 0;
  let changed = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const hotel = await fetchHotel(row.id);
      const currentExtPoints =
        hotel?.ext_points == null ? null : String(hotel.ext_points);
      const nextExtPoints = row.ext_points;

      const hasChange = currentExtPoints !== nextExtPoints;

      processed += 1;
      if (hasChange) changed += 1;
      else skipped += 1;

      console.log("------------------------------------------------------------");
      console.log(`Hotel ID: ${row.id}`);
      console.log(`Hotel name: ${hotel?.hotel_name || ""}`);
      console.log(`Current ext_points: ${currentExtPoints ?? "(none)"}`);
      console.log(`New ext_points: ${nextExtPoints}`);
      console.log(`Action: ${hasChange ? (args.dryRun ? "WOULD PATCH" : "PATCH") : "NO CHANGE"}`);

      if (!args.dryRun && hasChange) {
        await patchHotelExtPoints(row.id, nextExtPoints);
        console.log("Patch result: OK");
      }
    } catch (err) {
      failed += 1;
      console.error("------------------------------------------------------------");
      console.error(`Hotel ID: ${row.id}`);
      console.error(`ERROR: ${err.message}`);
    }
  }

  console.log("");
  console.log("============================================================");
  console.log(`Processed: ${processed}`);
  console.log(`Changed: ${changed}`);
  console.log(`Unchanged: ${skipped}`);
  console.log(`Failed: ${failed}`);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});