#!/usr/bin/env node
/**
 * One-time apply step for the 2026-07-07 award review of hotels 2001-2067.
 *
 * Round 1 (CONFIRMED): sets a boolean award column true and adds the award's
 * display label to the `awards` tag array for exact/verified matches.
 * Round 2 (RENAMES): updates hotel_name/city to match the award list's naming
 * for the 5 Section C candidates confirmed as the same property under a
 * slightly different name.
 * Round 2 (REMOVALS): sets a boolean award column false and removes the label
 * from `awards` for the 2 CN flags that couldn't be confirmed against the
 * current Gold List.
 *
 * See award-review-2026-07-07.txt and the session's plan for how each entry
 * was verified.
 *
 * Usage (from hotels-beta/):
 *   DIRECTUS_URL=... DIRECTUS_TOKEN=... node scripts/hotels/new-hotels-2026/apply-award-review-2026-07-07.mjs
 *   ... --confirm   (actually writes; omit for a dry run)
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;

if (!DIRECTUS_URL) throw new Error("Missing env DIRECTUS_URL");
if (!DIRECTUS_TOKEN) throw new Error("Missing env DIRECTUS_TOKEN");

const AWARD_DISPLAY = {
  michelin3keys: "Michelin 3 Keys",
  aaa5d: "AAA/CAA Five Diamond Hotels",
  cn: "Conde Nast Gold List",
  best50: "The World's 50 Best Hotels",
  forbes5: "Forbes 5 Star",
  tl100: "Travel + Leisure 100",
  telegraph: "Telegraph Best Hotels in the World",
};

// [hotel id, award code]
const CONFIRMED = [
  [2004, "michelin3keys"],
  [2004, "best50"],
  [2032, "michelin3keys"],
  [2037, "michelin3keys"],
  [2043, "michelin3keys"],
  [2046, "aaa5d"],
  [2006, "best50"],
  [2021, "forbes5"],
  [2027, "forbes5"],
  [2034, "best50"],
  [2035, "forbes5"],
];

// [hotel id, { hotel_name, city? }] — rename to match the award list's naming
// for the 5 Section C candidates confirmed as the same property.
const RENAMES = [
  [2006, { hotel_name: "Aman Nai Lert" }],
  [2021, { hotel_name: "Mandarin Oriental Bosphorus, Istanbul" }],
  [2027, { hotel_name: "Mandarin Oriental Savoy, Zurich" }],
  [2034, { hotel_name: "Four Seasons Tamarindo", city: "La Manzanilla" }],
  [2035, { hotel_name: "Four Seasons Hotel Ritz Lisbon" }],
];

// [hotel id, award code] — the DB flag couldn't be confirmed against the
// current source list; set false and drop the tag.
const REMOVALS = [
  [2004, "cn"],
  [2061, "cn"],
];

const confirm = process.argv.includes("--confirm");

// hotels.awards is a native Postgres text[] column that Directus's schema introspector
// tags "unknown" — a plain JS array gets JSON-stringified and Postgres rejects it on
// PATCH too (not just POST, despite CLAUDE.md §4's note). Needs a Postgres array-literal
// string instead, e.g. '{"a","b"}'.
function toPgArrayLiteral(values) {
  if (!Array.isArray(values) || values.length === 0) return "{}";
  const escaped = values.map((v) => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
  return `{${escaped.join(",")}}`;
}

async function directusFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}`, "Content-Type": "application/json", ...options.headers },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Directus request failed: ${JSON.stringify(json)}`);
  return json.data;
}

async function main() {
  // group by hotel id so we only read/write each hotel once
  const byId = new Map();
  for (const [id, code] of CONFIRMED) {
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(code);
  }

  console.log(confirm ? "APPLYING changes to Directus...\n" : "DRY RUN — no writes will be made (pass --confirm to apply)\n");

  for (const [id, codes] of byId) {
    const fields = ["id", "hotel_name", "awards", ...codes].join(",");
    const hotel = await directusFetch(`${DIRECTUS_URL}/items/hotels/${id}?fields=${fields}`);

    const currentAwards = Array.isArray(hotel.awards) ? hotel.awards : [];
    const newAwards = new Set(currentAwards);
    const patch = {};

    for (const code of codes) {
      const label = AWARD_DISPLAY[code];
      const alreadyTrue = !!hotel[code];
      const alreadyTagged = currentAwards.includes(label);
      patch[code] = true;
      newAwards.add(label);
      console.log(
        `[id ${id}] ${hotel.hotel_name} — ${code}: ${alreadyTrue ? "already true" : "false -> true"}, ` +
          `tag "${label}": ${alreadyTagged ? "already present" : "adding"}`
      );
    }
    patch.awards = toPgArrayLiteral([...newAwards]);

    if (confirm) {
      await directusFetch(`${DIRECTUS_URL}/items/hotels/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      console.log(`  -> patched id ${id}\n`);
    } else {
      console.log(`  -> would PATCH id ${id} with ${JSON.stringify(patch)}\n`);
    }
  }

  console.log("--- Renames ---\n");

  for (const [id, fields] of RENAMES) {
    const hotel = await directusFetch(`${DIRECTUS_URL}/items/hotels/${id}?fields=id,hotel_name,city`);
    const patch = {};
    for (const [key, newValue] of Object.entries(fields)) {
      console.log(`[id ${id}] ${key}: "${hotel[key]}" -> "${newValue}"`);
      patch[key] = newValue;
    }

    if (confirm) {
      await directusFetch(`${DIRECTUS_URL}/items/hotels/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
      console.log(`  -> patched id ${id}\n`);
    } else {
      console.log(`  -> would PATCH id ${id} with ${JSON.stringify(patch)}\n`);
    }
  }

  console.log("--- Removals ---\n");

  for (const [id, code] of REMOVALS) {
    const hotel = await directusFetch(`${DIRECTUS_URL}/items/hotels/${id}?fields=id,hotel_name,awards,${code}`);
    const label = AWARD_DISPLAY[code];
    const currentAwards = Array.isArray(hotel.awards) ? hotel.awards : [];
    const nextAwards = currentAwards.filter((a) => a !== label);
    const patch = { [code]: false, awards: toPgArrayLiteral(nextAwards) };

    console.log(
      `[id ${id}] ${hotel.hotel_name} — ${code}: ${hotel[code]} -> false, ` +
        `tag "${label}": ${currentAwards.includes(label) ? "removing" : "already absent"} ` +
        `(awards ${JSON.stringify(currentAwards)} -> ${JSON.stringify(nextAwards)})`
    );

    if (confirm) {
      await directusFetch(`${DIRECTUS_URL}/items/hotels/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
      console.log(`  -> patched id ${id}\n`);
    } else {
      console.log(`  -> would PATCH id ${id} with ${JSON.stringify(patch)}\n`);
    }
  }

  console.log(confirm ? "Done." : "Dry run complete. Re-run with --confirm to apply.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
