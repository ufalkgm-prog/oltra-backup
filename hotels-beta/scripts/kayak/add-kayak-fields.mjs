// One-shot: adds the three Directus fields that record a hotel's KAYAK match and
// whether KAYAK is its booking supplier (docs/kayak-integration-plan.md §3.2):
//   - kayak_hotel_id    (bigInteger)       KAYAK's hotel id, confirmed by Ulrik on the review page
//   - kayak_status      (select, locked)   active / unverified / passive
//   - kayak_checked_at  (timestamp)        when the status was last set
//
// Additive schema only, never touches existing data or fields. Safe to re-run.
// Full schema snapshot before and after into scripts/kayak/output/ (gitignored),
// same pattern as scripts/ratehawk/add-ratehawk-content-flag-fields.mjs.
//
// Why kayak_status is its own field and not folded into ratehawk_status (§42):
// they are verdicts about two different suppliers, set by different probes. The
// app's rule is RateHawk first (ratehawk_status = active), then KAYAK
// (kayak_status active/unverified), then today's "Book on website".
//
// Usage: node --env-file=.env.local scripts/kayak/add-kayak-fields.mjs
import fs from "fs/promises";

const DIRECTUS_URL = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
if (!DIRECTUS_URL || !DIRECTUS_TOKEN) throw new Error("Missing DIRECTUS_URL or DIRECTUS_TOKEN");

const OUTPUT_DIR = "scripts/kayak/output";

async function api(path, body, method = "POST") {
  const res = await fetch(`${DIRECTUS_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}`, "Content-Type": "application/json" },
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
  return { path, data };
}

// Directus answers a duplicate field with 400 INVALID_PAYLOAD "already exists", not 409 (§48).
function isAlreadyExists(status, data) {
  if (status === 409) return true;
  return status === 400 && data?.errors?.some((e) => /already exists/i.test(e?.message ?? ""));
}

async function createField(field, type, schema, meta) {
  const { status, data } = await api("/fields/hotels", { field, type, schema, meta });
  if (isAlreadyExists(status, data)) console.log(`  already exists: ${field}`);
  else if (!String(status).startsWith("2")) throw new Error(`FAILED: ${field} ${JSON.stringify(data?.errors)}`);
  else console.log(`  ✓ ${field}`);
}

// The snapshot response is {data: {fields: [...]}}; snap.data is that whole response.
const hotelFields = (snap) => new Map((snap.data?.data?.fields ?? []).filter((f) => f.collection === "hotels").map((f) => [f.field, JSON.stringify(f)]));

async function main() {
  const before = await snapshotSchema("before");

  console.log("\nCreating KAYAK fields on hotels...");
  await createField("kayak_hotel_id", "bigInteger", { is_nullable: true }, {
    interface: "input",
    note: "KAYAK's hotel id (the number in khotel:<id>). Written only after Ulrik confirmed the match on the review page; " +
      "null means no confirmed KAYAK match. See docs/kayak-integration-plan.md §3.2.",
  });
  await createField("kayak_status", "string", { is_nullable: true }, {
    interface: "select-dropdown",
    display: "labels",
    options: {
      allowOther: false,
      choices: [
        { text: "active — KAYAK is the supplier, rates confirmed", value: "active" },
        { text: "unverified — KAYAK is the supplier, rates not yet confirmed", value: "unverified" },
        { text: "passive — matched, but KAYAK is not the supplier", value: "passive" },
      ],
    },
    note: "Whether KAYAK is this hotel's booking supplier. RateHawk wins when ratehawk_status = active. " +
      "'unverified' = KAYAK is the supplier but its rates could not be checked (the sandbox cannot tell); " +
      "re-probe in production. 'passive' = matched only (RateHawk bookable, no KAYAK photos, or a direct partner such as andBeyond).",
  });
  await createField("kayak_checked_at", "timestamp", { is_nullable: true }, {
    interface: "datetime",
    note: "When kayak_status was last set by a script.",
  });

  const after = await snapshotSchema("after");
  const b = hotelFields(before), a = hotelFields(after);
  const added = [...a.keys()].filter((k) => !b.has(k));
  const removed = [...b.keys()].filter((k) => !a.has(k));
  const changed = [...b.keys()].filter((k) => a.has(k) && a.get(k) !== b.get(k));
  console.log(`\nhotels fields — added: ${added.join(", ") || "none"} | removed: ${removed.length} | changed: ${changed.length}`);
  if (removed.length || changed.length) throw new Error(`unexpected schema change: removed ${removed} changed ${changed}`);
}

main().catch((err) => { console.error("FATAL:", err.message ?? err); process.exit(1); });
