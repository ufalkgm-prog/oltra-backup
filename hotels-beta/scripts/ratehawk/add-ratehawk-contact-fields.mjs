// One-shot: adds the hotel's address and phone as ETG gives them (Ulrik,
// 2026-10-06), for the Saved trips itinerary. Directus had a website for each
// hotel but no address or phone; ETG's static content carries both.
//   - ratehawk_address  (string)  `address` from hotel_content_by_ids
//   - ratehawk_phone    (string)  `phone`, unformatted, as ETG holds it
//
// Prefixed ratehawk_ like the other static fields: they are ETG's values, kept
// current by etg-static-sync, not editorial ones. Filled once by
// backfill-ratehawk-contact.mjs.
//
// Additive only; an existing field is reported and skipped. Schema snapshots
// before and after go to scripts/ratehawk/output/ (gitignored), as for
// add-ratehawk-static-content-fields.mjs.
//
// Usage: DIRECTUS_URL=... DIRECTUS_TOKEN=... node scripts/ratehawk/add-ratehawk-contact-fields.mjs
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
}

// Directus answers a duplicate field with 400 and "already exists", not 409
// (CLAUDE.md §48).
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
    process.exitCode = 1;
  } else {
    console.log(`  ✓ ${field}`);
  }
}

async function main() {
  console.log("Taking BEFORE schema snapshot...");
  await snapshotSchema("before");

  console.log("\nCreating Ratehawk contact fields on hotels...");
  await createField(
    "ratehawk_address",
    { type: "string" },
    {
      interface: "input",
      note: "The hotel's address as ETG's static content gives it. Written by etg-static-sync; shown on the Saved trips itinerary.",
    }
  );
  await createField(
    "ratehawk_phone",
    { type: "string" },
    {
      interface: "input",
      note: "The hotel's phone number as ETG's static content gives it, unformatted. Written by etg-static-sync; shown on the Saved trips itinerary.",
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
