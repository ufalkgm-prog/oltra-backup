import fs from "fs/promises";
import path from "path";

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
const COLLECTION = "restaurants";
const DEFAULT_DIR = "scripts/restaurants";

const FILE_CITY_ALIASES = {
  "rest_saint_tropez.json": ["Saint Tropez", "Saint-Tropez", "Ramatuelle", "Gassin", "Grimaud"],
};

function hasFlag(args, flag) {
  return args.includes(flag);
}

function getArgValue(args, name) {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : undefined;
}

function slugifyCityName(city) {
  return city
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeCityForCompare(value) {
  if (!value) return "";
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAwards(value) {
  if (value === undefined || value === null) return undefined;

  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];

    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((v) => String(v).trim()).filter(Boolean);
        }
      } catch {}
    }

    return trimmed
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }

  return undefined;
}

function sanitizeItem(item) {
  const payload = {};

  for (const [key, value] of Object.entries(item)) {
    if (value === undefined) continue;

    if (key === "awards") {
      const normalized = normalizeAwards(value);
      if (normalized !== undefined) payload.awards = normalized;
      continue;
    }

    if (value === null) {
      if (key === "lat" || key === "lng") {
        payload[key] = null;
      }
      continue;
    }

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed !== "") {
        payload[key] = trimmed;
      } else if (
        key === "state_province__county__island" ||
        key === "www" ||
        key === "insta" ||
        key === "hotel_name_hint"
      ) {
        payload[key] = "";
      }
      continue;
    }

    if (typeof value === "number" || typeof value === "boolean") {
      payload[key] = value;
      continue;
    }

    if (Array.isArray(value)) {
      payload[key] = value;
      continue;
    }

    if (typeof value === "object") {
      payload[key] = value;
    }
  }

  return payload;
}

function validateItem(item) {
  const required = [
    "rank",
    "restaurant_name",
    "slug",
    "description",
    "highlights",
    "cuisine",
    "country",
    "region",
    "city",
    "local_area",
    "restaurant_setting",
    "restaurant_style",
    "awards",
    "sources",
    "hotel_name_hint",
    "status",
  ];

  const missing = [];

  for (const field of required) {
    if (!(field in item)) {
      missing.push(field);
      continue;
    }

    const value = item[field];

    if (typeof value === "string" && value.trim() === "") {
      if (
        field !== "hotel_name_hint" &&
        field !== "local_area" &&
        field !== "state_province__county__island"
      ) {
        missing.push(field);
      }
    }
  }

  if (typeof item.rank !== "number" || !Number.isInteger(item.rank)) missing.push("rank");
  if (!Array.isArray(item.awards)) missing.push("awards");
  if (item.status !== "published") missing.push("status");

  return [...new Set(missing)];
}

async function directusFetch(pathname, options = {}) {
  const res = await fetch(`${DIRECTUS_URL}${pathname}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DIRECTUS_TOKEN}`,
      ...(options.headers || {}),
    },
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  return { res, data };
}

async function findExistingBySlug(slug) {
  const encoded = encodeURIComponent(slug);
  const { res, data } = await directusFetch(
    `/items/${COLLECTION}?filter[slug][_eq]=${encoded}&fields=id,slug,restaurant_name&limit=1`
  );

  if (!res.ok) {
    throw new Error(`Failed slug lookup for "${slug}": ${JSON.stringify(data)}`);
  }

  return data?.data?.[0] || null;
}

async function createItem(payload) {
  return directusFetch(`/items/${COLLECTION}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

async function updateItem(id, payload) {
  return directusFetch(`/items/${COLLECTION}/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

async function verifyItem(id) {
  return directusFetch(
    `/items/${COLLECTION}/${id}?fields=id,restaurant_name,slug,city,awards,lat,lng,www,insta`
  );
}

async function listJsonFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

function extractCityFromFilename(file) {
  return normalizeCityForCompare(
    file.replace(/^rest_/, "").replace(/\.json$/i, "").replace(/_/g, " ")
  );
}

function getAllowedCitiesForFile(file) {
  const aliases = FILE_CITY_ALIASES[file];
  if (aliases && aliases.length) {
    return aliases.map(normalizeCityForCompare);
  }
  return [extractCityFromFilename(file)];
}

async function processFile(filePath, opts) {
  const { dryRun, debug, verify } = opts;
  const fileName = path.basename(filePath);
  const expectedCity = extractCityFromFilename(fileName);
  const allowedCities = getAllowedCitiesForFile(fileName);

  let raw;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (err) {
    console.error(`Skipping ${filePath}: could not read file.`);
    console.error(err);
    return { inserted: 0, updated: 0, skipped: 0, failed: 1 };
  }

  if (!raw || !raw.trim()) {
    console.error(`Skipping ${filePath}: file is empty.`);
    return { inserted: 0, updated: 0, skipped: 0, failed: 1 };
  }

  let json;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    console.error(`Skipping ${filePath}: invalid JSON.`);
    console.error(err.message);
    return { inserted: 0, updated: 0, skipped: 0, failed: 1 };
  }

  if (!Array.isArray(json)) {
    console.error(`Skipping ${filePath}: input must be a JSON array.`);
    return { inserted: 0, updated: 0, skipped: 0, failed: 1 };
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  console.log(`\n========== Processing ${filePath} ==========`);

  for (const item of json) {
    const missing = validateItem(item);
    if (missing.length) {
      console.error(
        `Skipping "${item.restaurant_name || "Unknown"}" due to missing/invalid fields: ${missing.join(", ")}`
      );
      skipped += 1;
      continue;
    }

    const payload = sanitizeItem(item);

    const payloadCity = normalizeCityForCompare(payload.city);
    if (payloadCity && !allowedCities.includes(payloadCity)) {
      console.error(
        `Skipping "${item.restaurant_name || "Unknown"}" in ${filePath}: expected one of [${allowedCities.join(", ")}] but got "${payload.city}"`
      );
      skipped += 1;
      continue;
    }

    if (!payload.slug) {
      console.error(`Skipping "${item.restaurant_name || "Unknown"}" because slug is missing.`);
      skipped += 1;
      continue;
    }

    const existing = await findExistingBySlug(payload.slug);

    if (debug) {
      console.log("\n------------------------------");
      console.log("Restaurant:", item.restaurant_name || "(unnamed)");
      console.log("Slug:", payload.slug);
      console.log("City:", payload.city || "(none)");
      console.log("Expected city:", expectedCity);
      console.log("Allowed cities:", allowedCities.join(", "));
      console.log("Mode:", existing ? "update" : "insert");
      console.log("Payload:");
      console.log(JSON.stringify(payload, null, 2));
    }

    if (dryRun) {
      console.log(`[DRY RUN] ${existing ? "Would update" : "Would insert"}: ${payload.restaurant_name}`);
      continue;
    }

    const result = existing
      ? await updateItem(existing.id, payload)
      : await createItem(payload);

    if (!result.res.ok) {
      console.error(`${existing ? "Update" : "Insert"} failed for "${payload.restaurant_name}":`);
      console.error(JSON.stringify(result.data, null, 2));
      failed += 1;
      continue;
    }

    const id = result.data?.data?.id || existing?.id;
    console.log(`${existing ? "Updated" : "Inserted"}: ${payload.restaurant_name}`);

    if (existing) {
      updated += 1;
    } else {
      inserted += 1;
    }

    if (verify && id) {
      const verifyResp = await verifyItem(id);

      if (!verifyResp.res.ok) {
        console.error(`Verify failed for "${payload.restaurant_name}":`);
        console.error(JSON.stringify(verifyResp.data, null, 2));
      } else {
        console.log("Verified:", JSON.stringify(verifyResp.data?.data));
      }
    }
  }

  return { inserted, updated, skipped, failed };
}

async function main() {
  if (!DIRECTUS_URL || !DIRECTUS_TOKEN) {
    console.error("Missing DIRECTUS_URL or DIRECTUS_TOKEN.");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const dir = getArgValue(args, "--dir") || DEFAULT_DIR;
  const debug = hasFlag(args, "--debug");
  const verify = hasFlag(args, "--verify");
  const dryRun = hasFlag(args, "--dry-run");
  const only = getArgValue(args, "--only");
  const limitRaw = getArgValue(args, "--limit");

  const limit = limitRaw ? Number(limitRaw) : undefined;
  if (limitRaw && (!Number.isFinite(limit) || limit <= 0)) {
    console.error("--limit must be a positive number.");
    process.exit(1);
  }

  let files = [];

  if (only) {
    files = only
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)
      .map((v) => (v.endsWith(".json") ? v : `${v}.json`));
  } else {
    files = await listJsonFiles(dir);
  }

  if (!files.length) {
    console.error(`No JSON files found in ${dir}`);
    process.exit(1);
  }

  if (limit) {
    files = files.slice(0, limit);
  }

  console.log(`Directory: ${dir}`);
  console.log(`Files to process: ${files.length}`);
  files.forEach((file) => console.log(`- ${file}`));

  let totals = {
    inserted: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    files: 0,
  };

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stats = await processFile(filePath, { dryRun, debug, verify });
    totals.inserted += stats.inserted;
    totals.updated += stats.updated;
    totals.skipped += stats.skipped;
    totals.failed += stats.failed;
    totals.files += 1;
  }

  console.log("\n========== SUMMARY ==========");
  console.log(`Files processed: ${totals.files}`);
  console.log(`Inserted: ${totals.inserted}`);
  console.log(`Updated: ${totals.updated}`);
  console.log(`Skipped: ${totals.skipped}`);
  console.log(`Failed: ${totals.failed}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});