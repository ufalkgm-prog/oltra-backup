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
    "ext_points",
    "awards.id",
    "awards.hotels_id",
    "awards.awards_id.id",
    "awards.awards_id.code",
    "awards.awards_id.name",
  ].join(",");

  const url = `${DIRECTUS_URL}/items/hotels/${encodeURIComponent(hotelId)}?fields=${encodeURIComponent(fields)}`;
  const json = await directusFetch(url, { method: "GET" });
  return json.data;
}

function extractCurrentAwardRows(hotel) {
  const rows = Array.isArray(hotel?.awards) ? hotel.awards : [];

  return rows
    .map((row) => {
      const awardRef = row?.awards_id;
      const awardId =
        awardRef && typeof awardRef === "object" ? awardRef.id : awardRef || null;
      const code =
        awardRef && typeof awardRef === "object" ? normalizeCode(awardRef.code) : "";

      return {
        junctionId: row?.id ?? null,
        hotelsId: row?.hotels_id ?? null,
        awardId: awardId || null,
        code,
      };
    })
    .filter((row) => row.awardId);
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

    const finalAwards = Array.isArray(row.final_awards_after_cleanup)
      ? uniqueSorted(row.final_awards_after_cleanup.map(normalizeCode).filter(Boolean))
      : [];

    const incorrectAudited = Array.isArray(row.incorrect_audited_awards)
      ? uniqueSorted(row.incorrect_audited_awards.map(normalizeCode).filter(Boolean))
      : [];

    return {
      id: String(hotelId).trim(),
      hotel_name: row.hotel_name ?? "",
      final_awards_after_cleanup: finalAwards,
      incorrect_audited_awards: incorrectAudited,
      ext_points: "0",
    };
  });
}

function buildCleanupPayload(currentRows, finalAwardCodes) {
  const currentByCode = new Map(
    currentRows
      .filter((r) => r.code)
      .map((r) => [r.code, r])
  );

  const payload = [];

  for (const code of finalAwardCodes) {
    const existing = currentByCode.get(code);
    if (!existing) {
      throw new Error(
        `Final cleanup code "${code}" was not found on current hotel relations. Aborting for safety.`
      );
    }

    payload.push({
      id: existing.junctionId,
      hotels_id: existing.hotelsId,
      awards_id: existing.awardId,
    });
  }

  return payload;
}

async function patchHotel(hotelId, awardsPayload, extPoints) {
  const url = `${DIRECTUS_URL}/items/hotels/${encodeURIComponent(hotelId)}`;

  return directusFetch(url, {
    method: "PATCH",
    body: JSON.stringify({
      awards: awardsPayload,
      ext_points: extPoints,
    }),
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

  console.log(`Loaded ${rows.length} cleanup rows from ${inputPath}`);
  console.log(`Mode: ${args.dryRun ? "DRY RUN" : "LIVE PATCH"}`);
  console.log("");

  let processed = 0;
  let changed = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const hotel = await fetchHotel(row.id);
      const currentRows = extractCurrentAwardRows(hotel);
      const currentCodes = uniqueSorted(
        currentRows.map((r) => r.code).filter(Boolean)
      );

      const finalCodes = uniqueSorted(row.final_awards_after_cleanup);
      const currentAuditedCodes = currentCodes.filter((code) => AUDITED_CODES.has(code));
      const expectedRemovalSet = new Set(row.incorrect_audited_awards);

      const actuallyRemovedAudited = currentAuditedCodes.filter(
        (code) => !finalCodes.includes(code)
      );

      const unexpectedRemovedAudited = actuallyRemovedAudited.filter(
        (code) => !expectedRemovalSet.has(code)
      );

      if (unexpectedRemovedAudited.length > 0) {
        throw new Error(
          `Safety check failed. These audited awards would be removed but were not listed as incorrect: ${unexpectedRemovedAudited.join(", ")}`
        );
      }

      const awardsPayload = buildCleanupPayload(currentRows, finalCodes);

      const currentExtPoints =
        hotel?.ext_points == null ? null : String(hotel.ext_points);
      const nextExtPoints = row.ext_points;

      const awardsChanged =
        JSON.stringify(currentCodes) !== JSON.stringify(finalCodes);
      const extPointsChanged = currentExtPoints !== nextExtPoints;
      const hasChange = awardsChanged || extPointsChanged;

      processed += 1;
      if (hasChange) changed += 1;
      else skipped += 1;

      console.log("------------------------------------------------------------");
      console.log(`Hotel ID: ${row.id}`);
      console.log(`Hotel name: ${row.hotel_name || hotel?.hotel_name || ""}`);
      console.log(`Current awards: ${currentCodes.join(", ") || "(none)"}`);
      console.log(
        `Incorrect audited awards: ${row.incorrect_audited_awards.join(", ") || "(none)"}`
      );
      console.log(`Final awards after cleanup: ${finalCodes.join(", ") || "(none)"}`);
      console.log(`Current ext_points: ${currentExtPoints ?? "(none)"}`);
      console.log(`New ext_points: ${nextExtPoints}`);
      console.log(`Action: ${hasChange ? (args.dryRun ? "WOULD PATCH" : "PATCH") : "NO CHANGE"}`);

      if (!args.dryRun && hasChange) {
        await patchHotel(row.id, awardsPayload, nextExtPoints);
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