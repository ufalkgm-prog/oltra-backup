#!/usr/bin/env node
/**
 * Create new hotels in Directus from the new_hotels_batch*.json files in this folder.
 *
 * Schema (post June-2026 migration, see CLAUDE.md §3/§4):
 *   - activities / awards / setting / style are flat string arrays (native Postgres text[]),
 *     no M2M lookups — passed straight through.
 *   - editor_rank (not editor_rank_13), state_province_county_island (single underscore).
 *   - best50 / cn / forbes5 / michelin3keys / telegraph / tl100 / aaa5d are real booleans.
 *
 * Usage (from hotels-beta/):
 *   DIRECTUS_URL=... DIRECTUS_TOKEN=... node scripts/hotels/new-hotels-2026/create-hotels-batch.mjs --dry-run
 *   ... --only new_hotels_batch1.json --dry-run
 *   ... --apply
 *   ... --apply --only new_hotels_batch1.json
 *   ... --apply --id 2001
 *   ... --apply --limit 5
 *
 * Flags:
 *   --dir <folder>   defaults to this script's own directory
 *   --only <file>    process a single batch file (basename, e.g. new_hotels_batch1.json)
 *   --id <id>        process a single hotel id across whichever file(s) are in scope
 *   --limit N        cap total hotels processed (after --only/--id filtering)
 *   --apply          actually write to Directus (default is dry-run/preview only)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DIRECTUS_URL = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;

if (!DIRECTUS_URL) throw new Error("Missing env DIRECTUS_URL");
if (!DIRECTUS_TOKEN) throw new Error("Missing env DIRECTUS_TOKEN");

const TAXONOMY = {
  activities: [
    "Archery", "Badminton", "Beach", "Biking", "Boating", "Bowling", "Casino",
    "Cycling", "Diving", "Falconry", "Family", "Fishing", "Fitness", "Gastronomy",
    "Golf", "Gorilla Hiking", "Hiking", "Horseback riding", "Hunting", "Ice skating",
    "Jeep safari", "Kayaking", "Nature", "Padel", "Paragliding", "Rafting", "Safari",
    "Sailing", "Shopping", "Sightseeing", "Skiing", "Snorkeling", "Spa", "Tennis",
    "Watersports", "Whalewatching", "Wilderness safari", "Wildlife", "Wine",
  ],
  awards: [
    "Michelin 3 Keys", "AAA/CAA Five Diamond Hotels", "Conde Nast Gold List",
    "The World's 50 Best Hotels", "Forbes 5 Star", "Travel + Leisure 100",
    "Telegraph Best Hotels in the World",
  ],
  setting: [
    "Beach", "Beachfront", "Canalside", "City", "Clifftop", "Coastal", "Countryside",
    "Desert", "Hillside", "Island", "Jungle", "Lakeside", "Mountains", "Nature Reserve",
    "Oceanfront", "Overwater", "Private Island", "Rainforest", "Riverside", "Seaside",
    "Waterfront", "Wildlife Reserve",
  ],
  style: [
    "African", "Alpine", "Art Deco", "Camp", "Chinese", "Colonial", "Contemporary",
    "Cottages", "Design", "Grand", "Historical", "Intimate", "Lodge", "Mediterranean",
    "Middle Eastern", "Oriental", "Safari Lodge", "Tented Camp", "Traditional", "Tropical",
  ],
};

// The editorial single-select companions to the setting/style tag arrays. Unlike setting/style —
// which are locked to their choices in Directus (meta.options.allowOther = false) — these four are
// plain nullable text columns with no meta.options.choices at all (confirmed via GET /fields/hotels),
// so this script is the only place their vocabulary can be enforced. They draw on the same
// vocabularies as the tag arrays above.
const SINGLE_SELECT_TAXONOMY = {
  primary_setting: TAXONOMY.setting,
  secondary_setting: TAXONOMY.setting,
  primary_style: TAXONOMY.style,
  secondary_style: TAXONOMY.style,
};

const BOOLEAN_AWARD_FLAGS = [
  "best50", "cn", "forbes5", "michelin3keys", "telegraph", "tl100", "aaa5d",
];

const REQUIRED_FIELDS = ["id", "hotel_name", "country", "city"];

function parseArgs(argv) {
  const args = { dir: __dirname, only: null, id: null, limit: null, apply: false };

  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--dir") { args.dir = argv[++i]; continue; }
    if (a === "--only") { args.only = argv[++i]; continue; }
    if (a === "--id") { args.id = String(argv[++i]); continue; }
    if (a === "--limit") { args.limit = Number(argv[++i]); continue; }
    if (a === "--apply") { args.apply = true; continue; }
    if (a === "--dry-run") { continue; } // default behavior, accepted no-op
    throw new Error(`Unknown argument: ${a}`);
  }

  return args;
}

async function directusFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${DIRECTUS_TOKEN}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    const msg = json?.errors?.[0]?.message || `${res.status} ${res.statusText}`;
    const err = new Error(msg);
    err.details = json;
    err.status = res.status;
    throw err;
  }

  return json;
}

async function hotelExists(id) {
  try {
    await directusFetch(`${DIRECTUS_URL}/items/hotels/${encodeURIComponent(id)}?fields=id`);
    return true;
  } catch (err) {
    if (err.status === 403 || err.status === 404) return false;
    throw err;
  }
}

async function createHotel(payload) {
  return directusFetch(`${DIRECTUS_URL}/items/hotels`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

function naturalBatchSort(a, b) {
  const numA = Number(a.match(/(\d+)/)?.[1] ?? 0);
  const numB = Number(b.match(/(\d+)/)?.[1] ?? 0);
  return numA - numB;
}

function findBatchFiles(dir, only) {
  if (only) {
    const p = path.join(dir, only);
    if (!fs.existsSync(p)) throw new Error(`--only file not found: ${p}`);
    return [only];
  }

  return fs
    .readdirSync(dir)
    .filter((f) => /^new_hotels_batch\d+\.json$/.test(f))
    .sort(naturalBatchSort);
}

function normalizeText(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

// The activities/awards/setting/style columns are native Postgres text[] columns that
// Directus's schema introspector tags as type "unknown" (confirmed via GET /fields/hotels/activities).
// On create, Directus JSON-stringifies plain JS arrays for such columns, which Postgres then
// rejects as a malformed array literal. Passing a proper Postgres array-literal STRING instead
// (verified against a disposable test record) writes and reads back correctly.
function toPgArrayLiteral(values) {
  if (!Array.isArray(values) || values.length === 0) return "{}";
  const escaped = values.map(
    (v) => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
  );
  return `{${escaped.join(",")}}`;
}

// Because nothing has ever constrained the four single-select columns, existing rows drifted on
// casing — "Safari lodge" (13 rows) vs the taxonomy's "Safari Lodge", "Private island" (8) vs
// "Private Island". Matching case-insensitively avoids rejecting a legitimate value over casing
// alone; returning the taxonomy's own spelling stops new rows from adding to the drift. A value
// with no case-insensitive match is returned unchanged for validateRow() to reject.
function canonicalizeChoice(value, allowed) {
  const s = normalizeText(value);
  if (s == null) return null;
  return allowed.find((a) => a.toLowerCase() === s.toLowerCase()) ?? s;
}

function validateRow(row, seenIds) {
  const errors = [];

  for (const field of REQUIRED_FIELDS) {
    if (row[field] == null || row[field] === "") errors.push(`missing required field '${field}'`);
  }

  if (row.id != null) {
    if (seenIds.has(String(row.id))) errors.push(`duplicate id ${row.id} within this run`);
    seenIds.add(String(row.id));
  }

  if (typeof row.published !== "boolean") errors.push(`published must be boolean, got ${JSON.stringify(row.published)}`);

  for (const flag of BOOLEAN_AWARD_FLAGS) {
    if (typeof row[flag] !== "boolean") errors.push(`${flag} must be boolean, got ${JSON.stringify(row[flag])}`);
  }

  for (const [field, allowed] of Object.entries(TAXONOMY)) {
    const values = row[field];
    if (values == null) continue;
    if (!Array.isArray(values)) {
      errors.push(`${field} must be an array, got ${JSON.stringify(values)}`);
      continue;
    }
    for (const v of values) {
      if (!allowed.includes(v)) errors.push(`invalid ${field} value: ${JSON.stringify(v)}`);
    }
  }

  for (const [field, allowed] of Object.entries(SINGLE_SELECT_TAXONOMY)) {
    const value = normalizeText(row[field]);
    if (value == null) continue;

    // Test membership directly rather than comparing against canonicalizeChoice()'s return —
    // that helper passes an unmatched value straight through, so an unknown value would be
    // indistinguishable from an exact match.
    const canonical = allowed.find((a) => a.toLowerCase() === value.toLowerCase());
    if (canonical == null) {
      errors.push(`invalid ${field} value: ${JSON.stringify(row[field])}`);
      continue;
    }
    if (canonical !== value) {
      // Case-only difference: accepted, but say so rather than rewriting it silently.
      console.warn(
        `  note: id=${row.id} ${field} ${JSON.stringify(value)} will be written as ${JSON.stringify(canonical)}`
      );
    }
  }

  return errors;
}

function buildCreatePayload(row) {
  return {
    id: String(row.id),
    hotel_name: normalizeText(row.hotel_name),
    published: row.published,
    country: normalizeText(row.country),
    region: normalizeText(row.region),
    // The traveller-facing area (Lake Como, Amalfi Coast, Zermatt) - NOT the
    // administrative unit, which is admin_region below. The two were split
    // 2026-08-31; see CLAUDE.md 3. Leave blank for a major city, where `city`
    // already does the job.
    state_province_county_island: normalizeText(row.state_province_county_island),
    // The administrative unit (Lombardy, Valais, Kyoto Prefecture). May
    // legitimately hold the same value as the area above where the admin unit
    // is also what a traveller types - Tuscany, Bali, Sicily.
    admin_region: normalizeText(row.admin_region),
    city: normalizeText(row.city),
    local_area: normalizeText(row.local_area),
    affiliation: normalizeText(row.affiliation),
    highlights: normalizeText(row.highlights),
    description: normalizeText(row.description),
    editor_rank: row.editor_rank == null ? null : Math.trunc(Number(row.editor_rank)),
    ext_points: row.ext_points == null ? null : Math.trunc(Number(row.ext_points)),
    total_rooms_suites_villas:
      row.total_rooms_suites_villas == null ? null : Math.trunc(Number(row.total_rooms_suites_villas)),
    activities: toPgArrayLiteral(row.activities),
    awards: toPgArrayLiteral(row.awards),
    setting: toPgArrayLiteral(row.setting),
    style: toPgArrayLiteral(row.style),
    // Editorial single-select companions to the setting/style tag arrays above. Validated against
    // SINGLE_SELECT_TAXONOMY in validateRow(); canonicalizeChoice() normalizes casing only.
    primary_setting: canonicalizeChoice(row.primary_setting, TAXONOMY.setting),
    secondary_setting: canonicalizeChoice(row.secondary_setting, TAXONOMY.setting),
    primary_style: canonicalizeChoice(row.primary_style, TAXONOMY.style),
    secondary_style: canonicalizeChoice(row.secondary_style, TAXONOMY.style),
    best50: row.best50,
    cn: row.cn,
    forbes5: row.forbes5,
    michelin3keys: row.michelin3keys,
    telegraph: row.telegraph,
    tl100: row.tl100,
    aaa5d: row.aaa5d,
    // Coordinates are Postgres numeric, NOT integers — do not Math.trunc these the way
    // editor_rank / ext_points / total_rooms_suites_villas above are truncated. Dropping the
    // decimals would move a hotel by up to ~100km. Null must stay null (0 is a valid coordinate).
    lat: row.lat == null ? null : Number(row.lat),
    lng: row.lng == null ? null : Number(row.lng),
    www: normalizeText(row.www),
    insta: normalizeText(row.insta),
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const dir = path.resolve(args.dir);

  const files = findBatchFiles(dir, args.only);
  console.log(`Found ${files.length} batch file(s) in ${dir}`);
  console.log(`Mode: ${args.apply ? "LIVE CREATE" : "DRY RUN (pass --apply to write)"}`);
  console.log("");

  // Load + validate every row up front, across all files, before any network call.
  let rows = [];
  const seenIds = new Set();
  let validationFailed = false;

  for (const file of files) {
    const filePath = path.join(dir, file);
    const fileRows = JSON.parse(fs.readFileSync(filePath, "utf8"));

    if (!Array.isArray(fileRows)) {
      throw new Error(`${file}: must contain a JSON array`);
    }

    for (const row of fileRows) {
      const errors = validateRow(row, seenIds);
      if (errors.length > 0) {
        validationFailed = true;
        console.error(`VALIDATION FAILED — ${file} id=${row.id} (${row.hotel_name ?? "?"}):`);
        for (const e of errors) console.error(`  - ${e}`);
      }
      rows.push({ file, row });
    }
  }

  if (validationFailed) {
    throw new Error("Pre-flight validation failed — no data was written. Fix the issues above and re-run.");
  }

  console.log(`Pre-flight validation passed for ${rows.length} hotel(s).`);
  console.log("");

  if (args.id) {
    rows = rows.filter(({ row }) => String(row.id) === args.id);
  }
  if (args.limit != null) {
    rows = rows.slice(0, args.limit);
  }

  let processed = 0;
  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const { file, row } of rows) {
    processed += 1;
    try {
      const exists = await hotelExists(row.id);

      console.log("------------------------------------------------------------");
      console.log(`[${file}] id=${row.id} ${row.hotel_name}`);

      if (exists) {
        skipped += 1;
        console.log("Action: SKIP (already exists in Directus)");
        continue;
      }

      const payload = buildCreatePayload(row);

      if (!args.apply) {
        console.log("Action: WOULD CREATE");
        continue;
      }

      await createHotel(payload);
      created += 1;
      console.log("Action: CREATE — OK");
    } catch (err) {
      failed += 1;
      console.error(`ERROR [${file}] id=${row.id}: ${err.message}`);
      if (err.details) console.error("  details:", JSON.stringify(err.details));
    }
  }

  console.log("");
  console.log("============================================================");
  console.log(`Processed: ${processed}`);
  console.log(`Created:   ${created}`);
  console.log(`Skipped:   ${skipped}`);
  console.log(`Failed:    ${failed}`);
  console.log("Done.");

  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
