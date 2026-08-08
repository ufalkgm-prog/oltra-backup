// One-shot: adds ratehawk_image_1..50 (URL, unresolved {size} template — see
// CLAUDE.md §27 for the documented ETG size-token whitelist) and
// ratehawk_image_1_category..50_category (category_slug) to the hotels
// collection. Additive schema only, never touches existing data.
// Safe to re-run — field creation 409s if it already exists.
//
// Usage: DIRECTUS_URL=... DIRECTUS_TOKEN=... node scripts/ratehawk/add-ratehawk-image-fields.mjs
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const DIRECTUS_URL = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;

if (!DIRECTUS_URL || !DIRECTUS_TOKEN) throw new Error("Missing DIRECTUS_URL or DIRECTUS_TOKEN");

async function api(path, body, method = "POST") {
  const res = await fetch(`${DIRECTUS_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${DIRECTUS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

async function createField(field, schema, meta = {}) {
  const { status, data } = await api("/fields/hotels", { field, type: schema.type, schema, meta });
  if (status === 409) {
    console.log(`  already exists: ${field}`);
  } else if (!status.toString().startsWith("2")) {
    console.error(`  FAILED: ${field}`, data?.errors);
  } else {
    console.log(`  ✓ ${field}`);
  }
}

async function main() {
  console.log("Creating ratehawk_image_1..50 + _category fields on hotels...");
  for (let i = 1; i <= 50; i++) {
    await createField(
      `ratehawk_image_${i}`,
      { type: "string" },
      {
        note:
          i === 1
            ? "Ratehawk hero image (Ratehawk's own first-returned image). Unresolved {size} template — see CLAUDE.md §27 for valid size tokens."
            : "Ratehawk image. Unresolved {size} template — see CLAUDE.md §27 for valid size tokens.",
      }
    );
    await createField(
      `ratehawk_image_${i}_category`,
      { type: "string" },
      { note: `category_slug for ratehawk_image_${i} (e.g. exterior, guest_rooms, pool).` }
    );
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
