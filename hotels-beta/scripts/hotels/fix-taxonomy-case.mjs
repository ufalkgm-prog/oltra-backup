// Normalises capitalisation in the single-select taxonomy fields
// (primary_/secondary_ style and setting) against the canonical choice list
// held by their multiselect sibling, so the fields can then be locked with
// set-taxonomy-field-choices.mjs.
//
// WHY THIS KEEPS BEING NEEDED
// ---------------------------
// These fields are plain `text` with no constraint, so the same drift returns.
// "Private island" vs "Private Island" has now been cleaned twice: §40 fixed 8
// rows of it in primary_setting, and 8 more had appeared by 2026-08-16.
// Cleaning without locking only resets the clock — run the lock script after
// this one.
//
// Case-only differences are corrected automatically. Anything that is not a
// case variant of a canonical value is REPORTED, never guessed at: §40's
// "Lakefront" -> "Lakeside" and "Riverfront" -> "Riverside" needed a human
// call, and one of them was initially got wrong (id 1461 was written as
// "Waterfront" before being corrected to "Lakeside", which its own setting[]
// array already said). A row's own tag array is the best corroboration when
// deciding what a drifted value should become.
//
// Dry-run by default, --confirm to write. Re-runnable: values are re-read each
// time and only differing rows are patched. The rollback record appends rather
// than overwrites, so a second run cannot discard the first run's history (§40).
//
// Usage (from hotels-beta/):
//   node --env-file=.env.local scripts/hotels/fix-taxonomy-case.mjs --group setting
//   ... --group setting --confirm

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DIRECTUS_URL = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
if (!DIRECTUS_URL || !DIRECTUS_TOKEN) throw new Error("Missing DIRECTUS_URL or DIRECTUS_TOKEN");

const GROUPS = {
  style: { source: "style", targets: ["primary_style", "secondary_style"] },
  setting: { source: "setting", targets: ["primary_setting", "secondary_setting"] },
};

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
}

const confirm = process.argv.includes("--confirm");
const groupName = arg("group");
const group = GROUPS[groupName];
if (!group) {
  console.error(`--group must be one of: ${Object.keys(GROUPS).join(", ")}`);
  process.exit(1);
}

const ROLLBACK_PATH = path.join(__dirname, `fix-taxonomy-case-${groupName}-rollback.json`);

async function get(pathname) {
  const res = await fetch(`${DIRECTUS_URL}${pathname}`, {
    headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` },
  });
  if (!res.ok) throw new Error(`GET ${pathname} failed: ${res.status}`);
  return res.json();
}

async function main() {
  const field = await get(`/fields/hotels/${group.source}`);
  const canonical = (field.data?.meta?.options?.choices ?? []).map((c) => c.value);
  if (!canonical.length) throw new Error(`${group.source} has no choices to normalise against`);

  const byLower = new Map(canonical.map((value) => [value.toLowerCase(), value]));
  console.log(`Canonical ${group.source}[] choices (${canonical.length}).`);

  const hotels =
    (await get(`/items/hotels?fields=id,hotel_name,${group.targets.join(",")}&limit=-1`)).data ?? [];

  const changes = [];
  const offList = new Map();

  for (const hotel of hotels) {
    const patch = {};
    const record = {};

    for (const target of group.targets) {
      const raw = hotel[target];
      if (raw === null || raw === undefined || String(raw).trim() === "") continue;
      const value = String(raw).trim();
      const match = byLower.get(value.toLowerCase());

      if (!match) {
        const key = `${target}: ${JSON.stringify(raw)}`;
        offList.set(key, (offList.get(key) ?? 0) + 1);
        continue;
      }
      if (match !== raw) {
        patch[target] = match;
        record[target] = { from: raw, to: match };
      }
    }

    if (Object.keys(patch).length) {
      changes.push({ id: hotel.id, hotel_name: hotel.hotel_name, patch, record });
    }
  }

  if (offList.size) {
    console.log("\nNOT A CASE VARIANT — left alone, needs a human call:");
    for (const [key, count] of offList) console.log(`  ${count}x  ${key}`);
  } else {
    console.log("No off-list values — everything maps to a canonical entry.");
  }

  const summary = new Map();
  for (const change of changes) {
    for (const [target, move] of Object.entries(change.record)) {
      const key = `${target}: "${move.from}" -> "${move.to}"`;
      summary.set(key, (summary.get(key) ?? 0) + 1);
    }
  }

  console.log(`\n${changes.length} hotels to re-case:`);
  for (const [key, count] of summary) console.log(`  ${count}x  ${key}`);

  if (!confirm) {
    console.log("\nDRY RUN — pass --confirm to write.");
    return;
  }

  const existing = fs.existsSync(ROLLBACK_PATH)
    ? JSON.parse(fs.readFileSync(ROLLBACK_PATH, "utf8"))
    : [];

  let ok = 0;
  const failed = [];
  for (const change of changes) {
    const res = await fetch(`${DIRECTUS_URL}/items/hotels/${change.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${DIRECTUS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(change.patch),
    });
    if (res.ok) {
      ok += 1;
      existing.push({ applied_at: new Date().toISOString(), id: change.id, ...change.record });
    } else {
      failed.push({ id: change.id, status: res.status });
    }
  }

  fs.writeFileSync(ROLLBACK_PATH, JSON.stringify(existing, null, 2));
  console.log(`\nPatched ${ok}/${changes.length}. Rollback record: ${ROLLBACK_PATH}`);
  if (failed.length) {
    console.error("FAILED:", JSON.stringify(failed));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
