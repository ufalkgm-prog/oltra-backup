#!/usr/bin/env node
/**
 * Publish the 67 new hotels (IDs 2001-2067, see CLAUDE.md §23) except
 * Mandarin Oriental Cortina (id 2020), which stays unpublished.
 *
 * Usage (from hotels-beta/):
 *   DIRECTUS_URL=... DIRECTUS_TOKEN=... node scripts/hotels/new-hotels-2026/publish-new-hotels-2026-07-07.mjs
 *   ... --confirm   (actually writes; omit for a dry run)
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;

if (!DIRECTUS_URL) throw new Error("Missing env DIRECTUS_URL");
if (!DIRECTUS_TOKEN) throw new Error("Missing env DIRECTUS_TOKEN");

const EXCLUDED_ID = 2020; // Mandarin Oriental Cortina
const confirm = process.argv.includes("--confirm");

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
  const hotels = await directusFetch(
    `${DIRECTUS_URL}/items/hotels?filter[id][_between]=2001,2067&fields=id,hotel_name,published&limit=-1&sort=id`
  );

  console.log(`Loaded ${hotels.length} hotels (expected 67).`);
  console.log(confirm ? "\nAPPLYING changes to Directus...\n" : "\nDRY RUN — no writes will be made (pass --confirm to apply)\n");

  const toPublish = [];
  for (const hotel of hotels) {
    const id = Number(hotel.id);
    if (id === EXCLUDED_ID) {
      console.log(`[id ${id}] ${hotel.hotel_name} — EXCLUDED, staying published=${hotel.published}`);
      continue;
    }
    console.log(`[id ${id}] ${hotel.hotel_name} — published: ${hotel.published} -> true`);
    toPublish.push(id);
  }

  console.log(`\n${toPublish.length} hotels to publish (expected 66).`);

  if (!confirm) {
    console.log("\nDry run complete. Re-run with --confirm to apply.");
    return;
  }

  // Directus's batch-update-by-query endpoint expects the filter and the
  // patch data both inside the body, not the filter as a URL query param.
  await directusFetch(`${DIRECTUS_URL}/items/hotels`, {
    method: "PATCH",
    body: JSON.stringify({
      query: { filter: { id: { _in: toPublish } } },
      data: { published: true },
    }),
  });

  console.log(`\nDone. Patched ${toPublish.length} hotels to published: true. id ${EXCLUDED_ID} left untouched.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
