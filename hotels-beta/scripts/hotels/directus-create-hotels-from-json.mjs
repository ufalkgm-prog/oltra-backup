#!/usr/bin/env node
import fs from "fs";
import path from "path";

const DIRECTUS_URL = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;

if (!DIRECTUS_URL) throw new Error("Missing env DIRECTUS_URL");
if (!DIRECTUS_TOKEN) throw new Error("Missing env DIRECTUS_TOKEN");

function parseArgs(argv) {
  const args = { input: "", dryRun: false, limit: null, hotelId: null };

  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];

    if (a === "--input") {
      args.input = argv[++i];
      continue;
    }
    if (a === "--dry-run") {
      args.dryRun = true;
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

  if (!args.input) throw new Error("Missing required --input <file>");
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

function splitMulti(value) {
  if (value == null) return [];
  return String(value)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function normalizeText(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

function toBool(value) {
  if (value == null) return null;
  if (typeof value === "boolean") return value;

  const s = String(value).trim().toLowerCase();

  if (["true", "1", "yes"].includes(s)) return true;
  if (["false", "0", "no"].includes(s)) return false;

  throw new Error(`Cannot parse boolean value: ${value}`);
}

function toIntStringOrNull(value) {
  if (value == null || value === "") return null;

  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid numeric value: ${value}`);
  }

  return String(Math.trunc(n));
}

async function fetchLookupMap(collection, keyField = "name", extraFields = []) {
  const fields = ["id", keyField, ...extraFields].join(",");
  const url = `${DIRECTUS_URL}/items/${collection}?fields=${encodeURIComponent(fields)}&limit=-1`;
  const json = await directusFetch(url, { method: "GET" });

  const map = new Map();

  for (const item of json.data || []) {
    const key = normalizeText(item[keyField])?.toLowerCase();
    if (key) map.set(key, item);

    for (const extra of extraFields) {
      const extraVal = normalizeText(item[extra])?.toLowerCase();
      if (extraVal && !map.has(extraVal)) {
        map.set(extraVal, item);
      }
    }
  }

  return map;
}

async function fetchLookupMapSafe(label, collection, keyField = "name", extraFields = []) {
  try {
    console.log(`Loading lookup: ${label} (${collection})`);
    return await fetchLookupMap(collection, keyField, extraFields);
  } catch (err) {
    throw new Error(`Lookup failed for ${label} (${collection}): ${err.message}`);
  }
}

function requireMappedIds(values, lookupMap, fieldLabel) {
  const ids = [];
  const missing = [];

  for (const value of values) {
    const key = value.toLowerCase();
    const item = lookupMap.get(key);

    if (!item) {
      missing.push(value);
      continue;
    }

    ids.push(item.id);
  }

  if (missing.length > 0) {
    throw new Error(`Could not map ${fieldLabel}: ${missing.join(", ")}`);
  }

  return ids;
}

function buildCreatePayload(row, lookups) {
  const styleIds = requireMappedIds(splitMulti(row.styles), lookups.styles, "styles");
  const settingIds = requireMappedIds(splitMulti(row.settings), lookups.settings, "settings");
  const activityIds = requireMappedIds(splitMulti(row.activities), lookups.activities, "activities");
  const awardIds = requireMappedIds(splitMulti(row.awards), lookups.awards, "awards");

  return {
    id: String(row.id),
    hotel_name: normalizeText(row.hotel_name),
    affiliation: normalizeText(row.affiliation),
    region: normalizeText(row.region),
    country: normalizeText(row.country),
    city: normalizeText(row.city),
    state_province__county__island: normalizeText(row.state_province__county__island),
    local_area: normalizeText(row.local_area),
    highlights: normalizeText(row.highlights),
    description: normalizeText(row.description),
    www: normalizeText(row.www),
    insta: normalizeText(row.insta),
    total_rooms_suites_villas:
      row.total_rooms_suites_villas == null ? null : Number(row.total_rooms_suites_villas),
    high_season: normalizeText(row.high_season),
    low_season: normalizeText(row.low_season),
    rain_season: normalizeText(row.rain_season),
    ext_points: toIntStringOrNull(row.ext_points),
    editor_rank_13:
      row.editor_rank_13 == null ? null : String(Math.trunc(Number(row.editor_rank_13))),
    published: toBool(row.published),

    styles: styleIds.map((id) => ({ styles_id: id })),
    settings: settingIds.map((id) => ({ settings_id: id })),
    activities: activityIds.map((id) => ({ activities_id: id })),
    awards: awardIds.map((id) => ({ awards_id: id })),
  };
}

async function createHotel(payload) {
  const url = `${DIRECTUS_URL}/items/hotels`;

  return directusFetch(url, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const inputPath = path.resolve(args.input);

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  let rows = JSON.parse(fs.readFileSync(inputPath, "utf8"));

  if (!Array.isArray(rows)) {
    throw new Error("Input JSON must be an array");
  }

  if (args.hotelId) {
    rows = rows.filter((r) => String(r.id) === args.hotelId);
  }

  if (args.limit != null) {
    rows = rows.slice(0, args.limit);
  }

  console.log(`Loaded ${rows.length} rows from ${inputPath}`);
  console.log(`Mode: ${args.dryRun ? "DRY RUN" : "LIVE CREATE"}`);
  console.log("");

  const lookups = {
    styles: await fetchLookupMapSafe("styles", "styles", "name"),
    settings: await fetchLookupMapSafe("settings", "settings", "name"),
    activities: await fetchLookupMapSafe("activities", "activities", "name"),
    awards: await fetchLookupMapSafe("awards", "awards", "code", ["name"]),
  };

  let processed = 0;
  let created = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const payload = buildCreatePayload(row, lookups);
      processed += 1;

      console.log("------------------------------------------------------------");
      console.log(`Hotel ID: ${row.id}`);
      console.log(`Hotel name: ${row.hotel_name || ""}`);
      console.log(`Styles: ${splitMulti(row.styles).join(", ") || "(none)"}`);
      console.log(`Settings: ${splitMulti(row.settings).join(", ") || "(none)"}`);
      console.log(`Activities: ${splitMulti(row.activities).join(", ") || "(none)"}`);
      console.log(`Awards: ${splitMulti(row.awards).join(", ") || "(none)"}`);
      console.log(`Action: ${args.dryRun ? "WOULD CREATE" : "CREATE"}`);

      if (!args.dryRun) {
        await createHotel(payload);
        created += 1;
        console.log("Create result: OK");
      }
    } catch (err) {
      failed += 1;
      console.error(`ERROR hotel ID ${row.id}: ${err.message}`);
    }
  }

  console.log("");
  console.log("============================================================");
  console.log(`Processed: ${processed}`);
  console.log(`Created: ${created}`);
  console.log(`Failed: ${failed}`);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});