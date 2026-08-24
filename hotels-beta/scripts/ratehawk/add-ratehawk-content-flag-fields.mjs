// One-shot: adds the 4 approved Directus fields that the ETG static-content
// sync writes alongside the 4 created by add-ratehawk-static-content-fields.mjs:
//   - ratehawk_check_in_time   (string)  ETG check_in_time,  "HH:MM:SS"
//   - ratehawk_check_out_time  (string)  ETG check_out_time, "HH:MM:SS"
//   - ratehawk_is_closed       (boolean) ETG is_closed
//   - ratehawk_deleted         (boolean) ETG deleted
//
// Additive schema only, never touches existing data or fields. Safe to
// re-run — field creation 409s if it already exists (same pattern as
// add-ratehawk-static-content-fields.mjs, §32, and add-ratehawk-image-fields.mjs, §28).
//
// Takes a full Directus schema snapshot (GET /schema/snapshot) before and
// after, saved to scripts/ratehawk/output/ (gitignored) — required before
// any structural Directus change per CLAUDE.md §32's hard constraints.
//
// Why string and not Directus `time` for the two times: the values are ETG's
// raw local-time strings, and 4 of 853 hotels report "00:00:00", which almost
// certainly means "unspecified" rather than a real midnight check-in. A `time`
// column would launder that into a legitimate-looking value. Storing the raw
// string keeps the ambiguity visible, and matches the house style of reading
// timestamps as written rather than converting them (CLAUDE.md §45).
//
// Why is_closed/deleted are NOT folded into ratehawk_status (§42): that field
// is derived from quarterly live-rate probes; these are ETG content flags on a
// daily cadence. One shared column would let the daily sync overwrite the
// quarterly verdict.
//
// Usage: DIRECTUS_URL=... DIRECTUS_TOKEN=... node scripts/ratehawk/add-ratehawk-content-flag-fields.mjs
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

// Directus answers a duplicate field with 400 INVALID_PAYLOAD and an "already
// exists" message — NOT 409. Verified live 2026-08-24 against this instance.
// add-ratehawk-static-content-fields.mjs and add-ratehawk-image-fields.mjs both
// check only for 409, so re-running either prints FAILED on fields that are
// perfectly fine; their headers (and CLAUDE.md §28/§32) call them 409-safe.
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
  console.log("Taking BEFORE schema snapshot...");
  const before = await snapshotSchema("before");

  console.log("\nCreating Ratehawk content-flag fields on hotels...");

  await createField(
    "ratehawk_check_in_time",
    { type: "string" },
    {
      note:
        "ETG check_in_time, stored as the raw \"HH:MM:SS\" local-time string it arrives as — " +
        "not converted, not a `time` column (see the header of " +
        "add-ratehawk-content-flag-fields.mjs for why). Written by the daily static-content " +
        "sync. null means never synced. See CLAUDE.md §32.",
    }
  );

  await createField(
    "ratehawk_check_out_time",
    { type: "string" },
    {
      note:
        "ETG check_out_time, stored as the raw \"HH:MM:SS\" local-time string it arrives as. " +
        "Same treatment as ratehawk_check_in_time. Written by the daily static-content sync. " +
        "null means never synced. See CLAUDE.md §32.",
    }
  );

  await createField(
    "ratehawk_is_closed",
    { type: "boolean" },
    {
      note:
        "ETG is_closed — the property is closed. Deliberately separate from ratehawk_status " +
        "(§42), which is derived from quarterly live-rate probes rather than daily content. " +
        "Advisory only: the sync never changes `published` on the strength of this, that " +
        "call is the editor's. null means never synced, which is not the same as false. " +
        "See CLAUDE.md §32.",
    }
  );

  await createField(
    "ratehawk_deleted",
    { type: "boolean" },
    {
      note:
        "ETG deleted — the hotel record has been removed from ETG's inventory. Advisory only, " +
        "same handling as ratehawk_is_closed. null means never synced. See CLAUDE.md §32.",
    }
  );

  console.log("\nTaking AFTER schema snapshot...");
  const after = await snapshotSchema("after");

  console.log("\nDone.");
  console.log(`\nDiff the snapshots to confirm only additions:\n  ${before}\n  ${after}`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
