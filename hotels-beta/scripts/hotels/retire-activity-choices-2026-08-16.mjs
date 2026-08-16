// Removes the two merged-away values from the activities[] choice list, so the
// Hotels page filter stops offering options nothing can match.
//
//   Biking      -> merged into Cycling
//   Jeep safari -> merged into Safari
//
// Run AFTER fix-activities-values-2026-08-16.mjs. It refuses if any hotel still
// carries a retiring value — removing a choice that is still stored would leave
// orphaned data rendering blank in the admin UI while the filter can never
// select it.
//
// Meta-only: the underlying text[] column is untouched.
//
// Usage: node --env-file=.env.local scripts/hotels/retire-activity-choices-2026-08-16.mjs [--confirm]

import fs from "fs/promises";

const DIRECTUS_URL = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
if (!DIRECTUS_URL || !DIRECTUS_TOKEN) throw new Error("Missing DIRECTUS_URL or DIRECTUS_TOKEN");

const RETIRE = ["Biking", "Jeep safari"];
const confirm = process.argv.includes("--confirm");
const OUTPUT_DIR = "scripts/ratehawk/output";

async function api(path, body, method = "GET") {
  const res = await fetch(`${DIRECTUS_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${DIRECTUS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => null) };
}

async function main() {
  const field = await api("/fields/hotels/activities");
  if (!field.ok) throw new Error("Could not read activities field");

  const meta = field.data?.data?.meta ?? {};
  const choices = meta.options?.choices ?? [];
  const kept = choices.filter((choice) => !RETIRE.includes(choice.value));

  console.log(`activities[] choices: ${choices.length} -> ${kept.length}`);
  console.log(`  retiring: ${RETIRE.join(", ")}`);

  // Guard: nothing may still be using them.
  const rows = await api("/items/hotels?fields=id,activities&limit=-1");
  const stillUsed = new Map();
  for (const row of rows.data?.data ?? []) {
    for (const value of Array.isArray(row.activities) ? row.activities : []) {
      if (RETIRE.includes(value)) stillUsed.set(value, (stillUsed.get(value) ?? 0) + 1);
    }
  }
  if (stillUsed.size) {
    console.error("\nREFUSING — still in use, run the value fix first:");
    for (const [value, count] of stillUsed) console.error(`  ${count}x  ${value}`);
    process.exit(1);
  }
  console.log("  no hotel still carries a retiring value.");

  if (!confirm) {
    console.log("\nDRY RUN — pass --confirm to write.");
    return;
  }

  const snapshot = await api("/schema/snapshot");
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const file = `${OUTPUT_DIR}/schema-snapshot-before-activities-retire-${new Date()
    .toISOString()
    .replace(/[:.]/g, "-")}.json`;
  await fs.writeFile(file, JSON.stringify(snapshot.data, null, 2));
  console.log(`Schema snapshot: ${file}`);

  const { ok, status, data } = await api(
    "/fields/hotels/activities",
    { meta: { ...meta, options: { ...meta.options, choices: kept } } },
    "PATCH"
  );
  if (!ok) {
    console.error("FAILED:", status, data?.errors);
    process.exit(1);
  }
  console.log(`Updated activities[] to ${kept.length} choices.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
