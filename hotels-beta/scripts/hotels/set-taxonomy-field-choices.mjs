// Converts a plain-text hotels field into a locked-choice dropdown, using the
// canonical choice list already configured on its multiselect sibling.
//
// WHY
// ---
// primary_style / secondary_style / primary_setting / secondary_setting are
// `text` with `interface: null` and no choices — nothing constrains them. §40
// records what that produces: "Private island" vs "Private Island",
// "Safari lodge" vs "Safari Lodge", and a stray "184". The multiselect
// siblings (style[], setting[], activities[]) have had locked choices all
// along (§4, allowOther: false), so the canonical list already exists — this
// just applies it to the single-selects too.
//
// This is a META-ONLY change. The underlying Postgres column stays `text`; no
// data is touched and nothing is destructive. Clean the data FIRST (see
// fix-style-case-*.mjs) — Directus does not validate existing rows against a
// new choice list, so an off-list value would simply render blank in the admin
// UI while still sitting in the database.
//
// Usage (from hotels-beta/):
//   node --env-file=.env.local scripts/hotels/set-taxonomy-field-choices.mjs --group style
//   ... --group setting
//   ... --group activities
//   ... --group style --dry-run
//
// Safe to re-run: it PATCHes field meta, so applying the same choices twice is
// a no-op.

import fs from "fs/promises";

const DIRECTUS_URL = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
if (!DIRECTUS_URL || !DIRECTUS_TOKEN) throw new Error("Missing DIRECTUS_URL or DIRECTUS_TOKEN");

const OUTPUT_DIR = "scripts/ratehawk/output";

// Each group: the multiselect field holding the canonical choices, and the
// single-select fields to apply them to.
const GROUPS = {
  style: { source: "style", targets: ["primary_style", "secondary_style"] },
  setting: { source: "setting", targets: ["primary_setting", "secondary_setting"] },
  // The seven raw §19 import slots. Note these have drifted from the
  // activities[] array they were imported alongside (Spa 751 vs 663) — the
  // array has been edited directly since, so these are a stale second copy
  // rather than a source of truth. Locking them stops further drift; whether
  // they should exist at all is a separate question.
  activities: {
    source: "activities",
    targets: [1, 2, 3, 4, 5, 6, 7].map((n) => `activities${n}`),
  },
};

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
}

const dryRun = process.argv.includes("--dry-run");
const groupName = arg("group");
const group = GROUPS[groupName];
if (!group) {
  console.error(`--group must be one of: ${Object.keys(GROUPS).join(", ")}`);
  process.exit(1);
}
if (!group.targets.length) {
  console.error(`Group "${groupName}" has no single-select targets configured.`);
  process.exit(1);
}

async function api(path, body, method = "GET") {
  const res = await fetch(`${DIRECTUS_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${DIRECTUS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

async function snapshotSchema(label) {
  const { ok, data } = await api("/schema/snapshot");
  if (!ok) throw new Error(`Schema snapshot (${label}) failed`);
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const file = `${OUTPUT_DIR}/schema-snapshot-${label}-${new Date()
    .toISOString()
    .replace(/[:.]/g, "-")}.json`;
  await fs.writeFile(file, JSON.stringify(data, null, 2));
  console.log(`Schema snapshot (${label}): ${file}`);
}

async function main() {
  const source = await api(`/fields/hotels/${group.source}`);
  if (!source.ok) throw new Error(`Could not read source field ${group.source}`);

  const choices = source.data?.data?.meta?.options?.choices ?? [];
  if (!choices.length) {
    throw new Error(`Source field ${group.source} has no choices to copy`);
  }

  console.log(`Canonical choices from ${group.source}[] (${choices.length}):`);
  console.log(`  ${choices.map((c) => c.value).join(" | ")}\n`);

  // Verify every stored value is already covered, so locking the field can't
  // orphan data. This is the check that makes the meta change safe.
  const allowed = new Set(choices.map((c) => c.value));
  const rows = await api(
    `/items/hotels?fields=id,${group.targets.join(",")}&limit=-1`
  );
  const offList = new Map();
  for (const row of rows.data?.data ?? []) {
    for (const field of group.targets) {
      const value = row[field];
      if (value === null || value === undefined || String(value).trim() === "") continue;
      if (!allowed.has(String(value))) {
        const key = `${field}: ${JSON.stringify(value)}`;
        offList.set(key, (offList.get(key) ?? 0) + 1);
      }
    }
  }

  if (offList.size) {
    console.error("REFUSING: stored values that are not in the choice list —");
    console.error("clean the data first, or these will render blank in the admin UI.");
    for (const [key, count] of offList) console.error(`  ${count}x  ${key}`);
    process.exit(1);
  }
  console.log("All stored values are covered by the choice list.\n");

  if (dryRun) {
    console.log(`DRY RUN — would lock: ${group.targets.join(", ")}`);
    return;
  }

  await snapshotSchema(`before-${groupName}-choices`);

  for (const field of group.targets) {
    const current = await api(`/fields/hotels/${field}`);
    if (!current.ok) throw new Error(`Could not read ${field}`);

    const { ok, status, data } = await api(
      `/fields/hotels/${field}`,
      {
        meta: {
          ...(current.data?.data?.meta ?? {}),
          interface: "select-dropdown",
          options: {
            choices,
            allowOther: false,
            // Both single-selects are optional — secondary_style is empty on
            // 92% of hotels — so "no value" has to stay reachable.
            allowNone: true,
          },
        },
      },
      "PATCH"
    );

    if (!ok) {
      console.error(`  FAILED ${field}: ${status}`, data?.errors);
      process.exit(1);
    }
    console.log(`  locked: ${field}`);
  }

  await snapshotSchema(`after-${groupName}-choices`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
