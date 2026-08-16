// One-shot: adds `ratehawk_status` to the hotels collection — a three-value
// classification of whether a hotel is sellable through Ratehawk at all:
//
//   active          returned rates on at least one probe window
//   passive         has a hid but returned no rates on ANY window
//                   ("Not active on Ratehawk")
//   not_integrated  no ratehawk_hid, or no ratehawk_image_1
//
// A locked-choice select, deliberately NOT the existing free-text
// `status_notes` field (which is unused, interface: null). §40 records what
// unconstrained text fields do here: primary_setting drifted into
// "Private island"/"Private Island" variants and needed a cleanup script. A
// value the app branches on must not be free text.
//
// Additive schema only. Safe to re-run — field creation 409s if it already
// exists (same pattern as add-ratehawk-static-content-fields.mjs, §28/§32).
// Takes a full schema snapshot before and after, per §32's hard constraint on
// structural Directus changes.
//
// Usage: node --env-file=.env.local scripts/ratehawk/add-ratehawk-status-field.mjs
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
  if (!ok) throw new Error(`Schema snapshot (${label}) failed: HTTP ${status}`);
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const file = `${OUTPUT_DIR}/schema-snapshot-${label}-${new Date()
    .toISOString()
    .replace(/[:.]/g, "-")}.json`;
  await fs.writeFile(file, JSON.stringify(data, null, 2));
  console.log(`Schema snapshot (${label}) saved: ${file}`);
}

async function main() {
  await snapshotSchema("before-ratehawk-status");

  const { status, data } = await api("/fields/hotels", {
    field: "ratehawk_status",
    type: "string",
    schema: { type: "string", is_nullable: true },
    meta: {
      interface: "select-dropdown",
      note:
        "Whether the hotel is sellable through Ratehawk. Set by " +
        "scripts/ratehawk/probe-ratehawk-status.mjs + apply-ratehawk-status-*.mjs — " +
        "re-probe quarterly, a passive hotel can start distributing.",
      options: {
        allowOther: false,
        allowNone: true,
        choices: [
          { text: "Active on Ratehawk", value: "active" },
          { text: "Passive — not active on Ratehawk", value: "passive" },
          { text: "Not integrated (no hid / no images)", value: "not_integrated" },
        ],
      },
    },
  });

  if (status === 409) {
    console.log("  already exists: ratehawk_status");
  } else if (!String(status).startsWith("2")) {
    console.error("  FAILED: ratehawk_status", data?.errors);
    process.exit(1);
  } else {
    console.log("  created: ratehawk_status");
  }

  await snapshotSchema("after-ratehawk-status");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
