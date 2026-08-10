// One-shot: adds the 4 approved Directus fields for CLAUDE.md §32 item 5
// (hotel-level Ratehawk static content, not yet stored anywhere):
//   - ratehawk_room_groups          (json)  room-group name/rg_ext/images
//   - ratehawk_metapolicy_struct    (json)  raw structured policy object
//   - ratehawk_metapolicy_extra_info (text) raw free-text policy notes
//   - ratehawk_static_synced_at     (timestamp) shared "last synced" marker
//
// Additive schema only, never touches existing data or fields. Safe to
// re-run — field creation 409s if it already exists (same pattern as
// add-ratehawk-image-fields.mjs, §28).
//
// Takes a full Directus schema snapshot (GET /schema/snapshot) before and
// after, saved to scripts/ratehawk/output/ (gitignored) — required before
// any structural Directus change per CLAUDE.md §32's hard constraints.
//
// Usage: DIRECTUS_URL=... DIRECTUS_TOKEN=... node scripts/ratehawk/add-ratehawk-static-content-fields.mjs
import fs from "fs/promises";

const DIRECTUS_URL = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;

if (!DIRECTUS_URL || !DIRECTUS_TOKEN) throw new Error("Missing DIRECTUS_URL or DIRECTUS_TOKEN");

const OUTPUT_DIR = "scripts/ratehawk/output";

async function api(path, body, method = "POST") {
  const res = await fetch(`${DIRECTUS_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${DIRECTUS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

async function snapshotSchema(label) {
  const { status, ok, data } = await api("/schema/snapshot", undefined, "GET");
  if (!ok) {
    throw new Error(`Schema snapshot (${label}) failed: HTTP ${status} ${JSON.stringify(data)}`);
  }
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const path = `${OUTPUT_DIR}/schema-snapshot-${label}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  await fs.writeFile(path, JSON.stringify(data, null, 2));
  console.log(`Schema snapshot (${label}) saved: ${path}`);
  return path;
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
  console.log("Taking BEFORE schema snapshot...");
  await snapshotSchema("before");

  console.log("\nCreating Ratehawk static-content fields on hotels...");

  await createField(
    "ratehawk_room_groups",
    { type: "json" },
    {
      note:
        "Room-level static data from Ratehawk /hotel/info/, one entry per room group: " +
        "{ name, rg_ext, images: [{url, category}] }. JSON (not flat numbered fields like " +
        "ratehawk_image_*) because room-group count and image count both vary per hotel. " +
        "Not yet populated by a sync script as of creation — see CLAUDE.md §32.",
    }
  );

  await createField(
    "ratehawk_metapolicy_struct",
    { type: "json" },
    {
      note:
        "Raw metapolicy_struct object from Ratehawk /hotel/info/ (deposit/meal/pets/shuttle/" +
        "visa policy categories), stored unmodified. See CLAUDE.md §32.",
    }
  );

  await createField(
    "ratehawk_metapolicy_extra_info",
    { type: "text" },
    {
      note:
        "Raw metapolicy_extra_info free-text policy notes from Ratehawk /hotel/info/, stored " +
        "unmodified. text (not string) — this is long, multi-paragraph content. See CLAUDE.md §32.",
    }
  );

  await createField(
    "ratehawk_static_synced_at",
    { type: "timestamp" },
    {
      note:
        "When ratehawk_room_groups / ratehawk_metapolicy_* (and eventually ratehawk_image_*) " +
        "were last pulled from Ratehawk's /hotel/info/ static-content endpoint. Not yet written " +
        "by any script as of creation — see CLAUDE.md §32.",
    }
  );

  console.log("\nTaking AFTER schema snapshot...");
  await snapshotSchema("after");

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
