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

  if (typeof item.rank !== "number") missing.push("rank");
  if (!Array.isArray(item.awards)) missing.push("awards");
  if (item.status !== "published") missing.push("status");

  return missing;
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
    `/items/${COLLECTION}/${id}?fields=id,restaurant_name,slug,awards,lat,lng,www,insta`
  );
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
  const dryRun = hasFlag(args, "--dry-run");

  if (!file) {
    console.error(
      "Usage: node scripts/directus-upsert-restaurants.mjs --file <file> [--dry-run] [--debug] [--verify]"
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
    const missing = validateItem(item);
    if (missing.length) {
      console.error(
        `Skipping "${item.restaurant_name || "Unknown"}" due to missing/invalid fields: ${missing.join(", ")}`
      );
      continue;
    }

    const payload = sanitizeItem(item);

    if (!payload.slug) {
      console.error(`Skipping "${item.restaurant_name || "Unknown"}" because slug is missing.`);
      continue;
    }

    const existing = await findExistingBySlug(payload.slug);

    if (debug) {
      console.log("\n==============================");
      console.log("Restaurant:", item.restaurant_name || "(unnamed)");
      console.log("Slug:", payload.slug);
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
      continue;
    }

    const id = result.data?.data?.id || existing?.id;
    console.log(`${existing ? "Updated" : "Inserted"}: ${payload.restaurant_name}`);

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
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});