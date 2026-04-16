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

const AWARD_CODE_TO_ID = {
  aaa: "32f0e878-e188-4ed1-98f8-6b22914f8f22",
  best50: "74a666bf-f7fb-4fff-b550-52eccfa98c4b",
  cn: "902c14cc-50a7-4be9-a4ee-b582afb9112e",
  forbes5: "cb4f80af-963d-4f09-a8aa-213718e399fb",
  telegraph: "d292cfb3-a88f-44dd-b052-2980cfd3bac8",
  tl100: "f8ac8e9c-397e-4e44-ba71-b1f9224e7c3f",
  michelin3keys: "fd18110a-9764-4c20-90f4-fd149d890ead",
};

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
        name:
          awardRef && typeof awardRef === "object" ? awardRef.name || null : null,
      };
    })
    .filter((row) => row.awardId);
}

function buildFinalRelationPayload(currentRows, newAuditedCodes) {
  const currentByCode = new Map(
    currentRows
      .filter((r) => r.code)
      .map((r) => [r.code, r])
  );

  const preservedRows = currentRows.filter((row) => !AUDITED_CODES.has(row.code));
  const finalAuditedCodes = uniqueSorted(
    newAuditedCodes.filter((code) => AUDITED_CODES.has(code))
  );

  const finalRows = [];

  for (const row of preservedRows) {
    finalRows.push({
      id: row.junctionId,
      hotels_id: row.hotelsId,
      awards_id: row.awardId,
    });
  }

  for (const code of finalAuditedCodes) {
    const existing = currentByCode.get(code);

    if (existing) {
      finalRows.push({
        id: existing.junctionId,
        hotels_id: existing.hotelsId,
        awards_id: existing.awardId,
      });
    } else {
      const awardId = AWARD_CODE_TO_ID[code];
      if (!awardId) {
        throw new Error(`No Directus award id mapping found for code: ${code}`);
      }

      finalRows.push({
        awards_id: awardId,
      });
    }
  }

  return finalRows;
}

function normalizeExtPoints(value) {
  if (value == null || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new Error(`Invalid ext_points value: ${value}`);
  }
  return String(Math.trunc(num));
}

function diffAwards(currentCodes, newAuditedCodes, finalCodes) {
  const currentSet = new Set(currentCodes);
  const newAuditedSet = new Set(newAuditedCodes);
  const finalSet = new Set(finalCodes);

  const removedAudited = currentCodes.filter(
    (code) => AUDITED_CODES.has(code) && !finalSet.has(code)
  );

  const addedAudited = [...newAuditedSet].filter((code) => !currentSet.has(code));

  const preservedExisting = currentCodes.filter(
    (code) => !AUDITED_CODES.has(code) && finalSet.has(code)
  );

  return {
    removedAudited: uniqueSorted(removedAudited),
    addedAudited: uniqueSorted(addedAudited),
    preservedExisting: uniqueSorted(preservedExisting),
  };
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

    const newAwards = parseAwardCodes(row.new_awards);
    const extPointsRaw =
      row.ext_points ?? row.external_score ?? null;

    return {
      id: String(hotelId).trim(),
      hotel_name: row.hotel_name ?? "",
      new_awards: newAwards,
      ext_points: normalizeExtPoints(extPointsRaw),
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

  console.log(`Loaded ${rows.length} hotel rows from ${inputPath}`);
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
      const newAuditedCodes = uniqueSorted(
        row.new_awards.filter((code) => AUDITED_CODES.has(code))
      );

      const finalPreservedCodes = currentCodes.filter(
        (code) => !AUDITED_CODES.has(code)
      );
      const finalCodes = uniqueSorted([
        ...finalPreservedCodes,
        ...newAuditedCodes,
      ]);

      const awardsPayload = buildFinalRelationPayload(currentRows, newAuditedCodes);
      const currentExtPoints = hotel?.ext_points == null ? null : String(hotel.ext_points);
      const nextExtPoints = row.ext_points;

      const { removedAudited, addedAudited, preservedExisting } = diffAwards(
        currentCodes,
        newAuditedCodes,
        finalCodes
      );

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
      console.log(`New audited awards: ${newAuditedCodes.join(", ") || "(none)"}`);
      console.log(`Final awards: ${finalCodes.join(", ") || "(none)"}`);
      console.log(`Removed audited awards: ${removedAudited.join(", ") || "(none)"}`);
      console.log(`Added audited awards: ${addedAudited.join(", ") || "(none)"}`);
      console.log(`Preserved non-audited awards: ${preservedExisting.join(", ") || "(none)"}`);
      console.log(`Current ext_points: ${currentExtPoints ?? "(none)"}`);
      console.log(`New ext_points: ${nextExtPoints ?? "(none)"}`);
      console.log(
        `Action: ${hasChange ? (args.dryRun ? "WOULD PATCH" : "PATCH") : "NO CHANGE"}`
      );

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