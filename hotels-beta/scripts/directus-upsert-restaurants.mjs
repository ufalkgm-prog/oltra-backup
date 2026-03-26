import fs from "fs/promises";

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
const COLLECTION = "restaurants";

function hasFlag(args, flag) {
  return args.includes(flag);
}

function getArgValue(args, name) {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : undefined;
}

function normalizeAwards(value) {
  if (value === undefined || value === null) return undefined;

  // Already a real array
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }

  // Sometimes JSON is accidentally stored as a string
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];

    // JSON array string: '["A","B"]'
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((v) => String(v).trim()).filter(Boolean);
        }
      } catch {
        // fall through
      }
    }

    // Fallback: comma-separated string
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
    if (value === undefined || value === null) continue;

    if (key === "awards") {
      const normalized = normalizeAwards(value);
      if (normalized !== undefined) {
        payload.awards = normalized;
      }
      continue;
    }

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed !== "") payload[key] = trimmed;
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

async function directusFetch(path, options = {}) {
  const res = await fetch(`${DIRECTUS_URL}${path}`, {
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

async function main() {
  if (!DIRECTUS_URL || !DIRECTUS_TOKEN) {
    console.error("Missing DIRECTUS_URL or DIRECTUS_TOKEN.");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const file = getArgValue(args, "--file");
  const debug = hasFlag(args, "--debug");
  const verify = hasFlag(args, "--verify");

  if (!file) {
    console.error(
      "Usage: node scripts/directus-upsert-restaurants.mjs --file <file> [--debug] [--verify]"
    );
    process.exit(1);
  }

  const raw = await fs.readFile(file, "utf8");
  const json = JSON.parse(raw);

  if (!Array.isArray(json)) {
    console.error("Input must be a JSON array.");
    process.exit(1);
  }

  for (const item of json) {
    const payload = sanitizeItem(item);

    if (debug) {
      console.log("\n==============================");
      console.log("Restaurant:", item.restaurant_name || "(unnamed)");
      console.log("Original awards:", item.awards);
      console.log("Original awards isArray:", Array.isArray(item.awards));
      console.log("Payload awards:", payload.awards);
      console.log("Payload awards isArray:", Array.isArray(payload.awards));
      console.log("Payload body:");
      console.log(JSON.stringify(payload, null, 2));
    }

    const { res, data } = await directusFetch(`/items/${COLLECTION}`, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.error(`Error inserting "${item.restaurant_name || "Unknown"}":`);
      console.error(JSON.stringify(data, null, 2));
      continue;
    }

    const createdId = data?.data?.id;
    console.log(`Inserted: ${item.restaurant_name || createdId || "Unknown"}`);

    if (verify && createdId) {
      const verifyResp = await directusFetch(
        `/items/${COLLECTION}/${createdId}?fields=id,restaurant_name,awards`
      );

      if (!verifyResp.res.ok) {
        console.error(`Verify failed for "${item.restaurant_name || createdId}":`);
        console.error(JSON.stringify(verifyResp.data, null, 2));
      } else {
        console.log("Stored awards:", verifyResp.data?.data?.awards);
      }
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});