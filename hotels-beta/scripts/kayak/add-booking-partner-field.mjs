// One-shot: adds `booking_partner` to Directus hotels — which partner a published hotel books through:
//   ratehawk (ZenHotels checkout) · kayak (click-out via KAYAK) · andbeyond (direct partner).
// The rule since 2026-10-01: a published hotel must have a partner that can sell it AND photos from it.
//
// Deliberately NOT the existing `booking_provider`: buildBookingLink() reads that field to build links
// (booking / cj_booking / official / none), and an empty value means "none". Reusing it for the partner
// would mix "who sells it" with "how to build a link".
//
// Additive only. Dry run by default (prints what it would create); --confirm creates the field.
// Schema snapshot before and after into scripts/kayak/output/ (gitignored), diffed in the script.
//
// Usage: node --env-file=.env.local scripts/kayak/add-booking-partner-field.mjs [--confirm]
import fs from "fs/promises";

const DIRECTUS_URL = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
if (!DIRECTUS_URL || !DIRECTUS_TOKEN) throw new Error("Missing DIRECTUS_URL or DIRECTUS_TOKEN");
const CONFIRM = process.argv.includes("--confirm");
const OUTPUT_DIR = "scripts/kayak/output";

const FIELD = {
  field: "booking_partner",
  type: "string",
  schema: { is_nullable: true },
  meta: {
    interface: "select-dropdown",
    display: "labels",
    options: {
      allowOther: false,
      choices: [
        { text: "RateHawk (ZenHotels checkout)", value: "ratehawk" },
        { text: "KAYAK", value: "kayak" },
        { text: "andBeyond (direct)", value: "andbeyond" },
      ],
    },
    note: "Which partner this hotel books through. Every published hotel needs one, plus photos from it " +
      "(rule since 2026-10-01). Not booking_provider, which builds links. See docs/kayak-integration-plan.md.",
  },
};

async function api(path, body, method = "GET") {
  const res = await fetch(`${DIRECTUS_URL}${path}`, {
    method, headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

async function snapshot(label) {
  const { ok, status, data } = await api("/schema/snapshot");
  if (!ok) throw new Error(`snapshot (${label}) HTTP ${status}`);
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const path = `${OUTPUT_DIR}/schema-snapshot-${label}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  await fs.writeFile(path, JSON.stringify(data, null, 2));
  console.log(`Schema snapshot (${label}): ${path}`);
  return new Map((data?.data?.fields ?? []).filter((f) => f.collection === "hotels").map((f) => [f.field, JSON.stringify(f)]));
}

async function main() {
  const exists = (await api(`/fields/hotels/${FIELD.field}`)).ok;
  if (exists) { console.log(`${FIELD.field} already exists — nothing to do.`); return; }
  console.log(`Would create hotels.${FIELD.field} (${FIELD.type}, locked select: ${FIELD.meta.options.choices.map((c) => c.value).join(" / ")}).`);
  if (!CONFIRM) { console.log("Dry run — nothing created. Re-run with --confirm."); return; }

  const before = await snapshot("before");
  const r = await api("/fields/hotels", FIELD, "POST");
  if (!r.ok) throw new Error(`create failed: HTTP ${r.status} ${JSON.stringify(r.data?.errors)}`);
  const after = await snapshot("after");
  const added = [...after.keys()].filter((k) => !before.has(k));
  const removed = [...before.keys()].filter((k) => !after.has(k));
  const changed = [...before.keys()].filter((k) => after.has(k) && after.get(k) !== before.get(k));
  console.log(`hotels fields — added: ${added.join(", ") || "none"} | removed: ${removed.length} | changed: ${changed.length}`);
  if (removed.length || changed.length || added.join() !== FIELD.field) throw new Error("unexpected schema change");
}

main().catch((err) => { console.error("FATAL:", err.message ?? err); process.exit(1); });
