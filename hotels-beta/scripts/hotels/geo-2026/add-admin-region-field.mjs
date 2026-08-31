// One-shot: adds `admin_region` to the `hotels` collection.
//
// Context (CLAUDE.md §3/§4, and the geo split agreed 2026-08-31): the existing
// `state_province_county_island` column had drifted into holding two different
// ideas at once — administrative units (Tuscany, Bavaria, Canton of Zurich,
// Beijing Municipality) sitting beside traveller-facing areas (Amalfi Coast,
// Riviera Maya, Kruger National Park). Per Ulrik's decision the two are being
// separated:
//
//   region                        -> continent  (unchanged, pre-existing)
//   admin_region                  -> the administrative unit (Lombardy, Valais)
//   state_province_county_island  -> the traveller-facing area (Lake Como, Zermatt)
//
// Both may legitimately hold the SAME value where the administrative unit is
// also what a traveller types — Tuscany, Bali, Sicily, Andalusia. That is not
// duplication to be cleaned up later; it is the intended shape.
//
// Additive schema only. Never touches existing data or existing fields.
// Safe to re-run — a duplicate field is reported as "already exists", not a
// failure (see isAlreadyExists below).
//
// Takes a full Directus schema snapshot before and after, saved to
// scripts/hotels/geo-2026/output/ (gitignored) — required before any
// structural Directus change per CLAUDE.md §32.
//
// Deliberately created as free `text` with `interface: null`, matching
// state_province_county_island as it stands today rather than locking it to a
// choice list. §44 is emphatic that unconstrained text fields drift ("Giorgia",
// "Boca Raton" are already in the DB proving it) — but locking has to come
// AFTER the vocabulary is settled, not before: set-taxonomy-field-choices.mjs
// refuses to lock over values outside the list, and there are no values yet.
// Locking is a separate follow-up once the backfill is reviewed and applied.
//
// Usage: DIRECTUS_URL=... DIRECTUS_TOKEN=... node scripts/hotels/geo-2026/add-admin-region-field.mjs
import fs from "fs/promises";

const DIRECTUS_URL = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;

if (!DIRECTUS_URL || !DIRECTUS_TOKEN) throw new Error("Missing DIRECTUS_URL or DIRECTUS_TOKEN");

const OUTPUT_DIR = "scripts/hotels/geo-2026/output";

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
  if (!ok) throw new Error(`Schema snapshot (${label}) failed: HTTP ${status} ${JSON.stringify(data)}`);
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const path = `${OUTPUT_DIR}/schema-snapshot-${label}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  await fs.writeFile(path, JSON.stringify(data, null, 2));
  console.log(`Schema snapshot (${label}) saved: ${path}`);
  return path;
}

// Directus answers a duplicate field with 400 INVALID_PAYLOAD and an "already
// exists" message — NOT 409. Verified live 2026-08-24, see CLAUDE.md §48.
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

  console.log("\nCreating admin_region on hotels...");
  await createField(
    "admin_region",
    { type: "text" },
    {
      note:
        "The administrative unit the property sits in — state, province, canton, " +
        "prefecture, emirate, governorate, county (Lombardy, Valais, Kyoto Prefecture, " +
        "Emirate of Dubai). Distinct from `region`, which holds the continent, and from " +
        "`state_province_county_island`, which holds the traveller-facing area name " +
        "(Lake Como, Amalfi Coast, Zermatt). The two MAY hold the same value where the " +
        "administrative unit is also what a traveller would type — Tuscany, Bali, " +
        "Sicily. null means not yet classified. See CLAUDE.md §3.",
    }
  );

  console.log("\nTaking AFTER schema snapshot...");
  await snapshotSchema("after");

  const { data } = await api("/fields/hotels/admin_region", undefined, "GET");
  console.log("\nVerified:", JSON.stringify({
    field: data?.data?.field,
    type: data?.data?.type,
    data_type: data?.data?.schema?.data_type,
    interface: data?.data?.meta?.interface,
  }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
