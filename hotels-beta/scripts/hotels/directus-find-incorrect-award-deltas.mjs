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

const AUDITED_CODES = new Set([
  "aaa",
  "best50",
  "cn",
  "forbes5",
  "telegraph",
  "tl100",
  "michelin3keys",
]);

function parseArgs(argv) {
  const args = {
    input: "",
    output: "",
    limit: null,
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
    if (a === "--limit") {
      args.limit = Number(argv[++i]);
      continue;
    }

    throw new Error(`Unknown argument: ${a}`);
  }

  if (!args.input) {
    throw new Error("Missing required --input <file>");
  }

  return args;
}

function normalizeCode(value) {
  return String(value || "").trim().toLowerCase();
}

function uniqueSorted(list) {
  return [...new Set(list)].sort((a, b) => a.localeCompare(b));
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

  if (res.status === 404) {
    return { notFound: true };
  }

  if (!res.ok) {
    throw new Error(
      `Directus request failed ${res.status} ${res.statusText}\n${JSON.stringify(json, null, 2)}`
    );
  }

  return json;
}

async function fetchHotel(hotelId) {
  const fields = [
    "id",
    "hotel_name",
    "awards.id",
    "awards.hotels_id",
    "awards.awards_id.id",
    "awards.awards_id.code",
    "awards.awards_id.name",
  ].join(",");

  const url = `${DIRECTUS_URL}/items/hotels/${encodeURIComponent(hotelId)}?fields=${encodeURIComponent(fields)}`;
  const json = await directusFetch(url, { method: "GET" });

  if (json?.notFound) return null;
  return json.data;
}

function extractCurrentCodes(hotel) {
  const rows = Array.isArray(hotel?.awards) ? hotel.awards : [];

  return uniqueSorted(
    rows
      .map((row) => {
        const awardRef = row?.awards_id;
        if (awardRef && typeof awardRef === "object") {
          return normalizeCode(awardRef.code);
        }
        return "";
      })
      .filter(Boolean)
  );
}

function readIdFile(inputPath) {
  const raw = fs.readFileSync(inputPath, "utf8");
  const data = JSON.parse(raw);

  if (!Array.isArray(data)) {
    throw new Error("Input JSON must be an array of hotel IDs");
  }

  return data.map((id, idx) => {
    if (id == null || String(id).trim() === "") {
      throw new Error(`Row ${idx + 1}: invalid hotel ID`);
    }
    return String(id).trim();
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const inputPath = path.resolve(args.input);
  const outputPath = args.output ? path.resolve(args.output) : null;

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  let ids = readIdFile(inputPath);
  if (args.limit != null) {
    ids = ids.slice(0, args.limit);
  }

  console.log(`Loaded ${ids.length} delta hotel IDs from ${inputPath}`);
  console.log("");

  const incorrectDeltas = [];
  let processed = 0;
  let missing = 0;
  let noAuditedAwards = 0;
  let withAuditedAwards = 0;
  let failed = 0;

  for (const hotelId of ids) {
    try {
      const hotel = await fetchHotel(hotelId);

      if (!hotel) {
        missing += 1;
        console.log(`SKIP missing hotel ID ${hotelId}`);
        continue;
      }

      processed += 1;

      const currentCodes = extractCurrentCodes(hotel);
      const auditedPresent = currentCodes.filter((code) => AUDITED_CODES.has(code));
      const preserved = currentCodes.filter((code) => !AUDITED_CODES.has(code));

      if (auditedPresent.length === 0) {
        noAuditedAwards += 1;
        continue;
      }

      withAuditedAwards += 1;

      const item = {
        id: String(hotel.id),
        hotel_name: hotel.hotel_name || "",
        current_awards: currentCodes,
        incorrect_audited_awards: auditedPresent,
        final_awards_after_cleanup: preserved,
      };

      incorrectDeltas.push(item);

      console.log("------------------------------------------------------------");
      console.log(`Hotel ID: ${item.id}`);
      console.log(`Hotel name: ${item.hotel_name}`);
      console.log(`Current awards: ${item.current_awards.join(", ") || "(none)"}`);
      console.log(`Incorrect audited awards: ${item.incorrect_audited_awards.join(", ") || "(none)"}`);
      console.log(`Final awards after cleanup: ${item.final_awards_after_cleanup.join(", ") || "(none)"}`);
    } catch (err) {
      failed += 1;
      console.error(`ERROR hotel ID ${hotelId}: ${err.message}`);
    }
  }

  if (outputPath) {
    fs.writeFileSync(outputPath, JSON.stringify(incorrectDeltas, null, 2));
    console.log("");
    console.log(`Wrote ${incorrectDeltas.length} incorrect delta hotels to ${outputPath}`);
  }

  console.log("");
  console.log("============================================================");
  console.log(`Processed existing hotels: ${processed}`);
  console.log(`Missing/deleted IDs skipped: ${missing}`);
  console.log(`Existing hotels with no audited awards: ${noAuditedAwards}`);
  console.log(`Actual incorrect delta hotels: ${withAuditedAwards}`);
  console.log(`Failed: ${failed}`);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});