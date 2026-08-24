// One-shot: adds ratehawk_image_1..50 (URL, unresolved {size} template — see
// CLAUDE.md §27 for the documented ETG size-token whitelist) and
// ratehawk_image_1_category..50_category (category_slug) to the hotels
// collection. Additive schema only, never touches existing data.
// Safe to re-run — an existing field is reported as "already exists" and skipped.
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

// Directus answers a duplicate field with 400 INVALID_PAYLOAD and an "already
// exists" message, NOT 409 — verified live 2026-08-24 (CLAUDE.md §48). Checking
// only for 409 made a perfectly clean re-run print FAILED on all 100 fields.
function isAlreadyExists(status, data) {
  if (status === 409) return true;
  return status === 400 && data?.errors?.some((e) => /already exists/i.test(e?.message ?? ""));
}

async function createField(field, schema, meta = {}) {
  const { status, data } = await api("/fields/hotels", { field, type: schema.type, schema, meta });
  if (isAlreadyExists(status, data)) {
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
