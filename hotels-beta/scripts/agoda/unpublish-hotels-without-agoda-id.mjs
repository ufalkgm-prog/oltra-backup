#!/usr/bin/env node
import "dotenv/config";

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
const DIRECTUS_COLLECTION = process.env.DIRECTUS_COLLECTION || "hotels";

const isDryRun = process.argv.includes("--dry-run");

if (!DIRECTUS_URL || !DIRECTUS_TOKEN) {
  console.error("Missing DIRECTUS_URL and/or DIRECTUS_TOKEN");
  process.exit(1);
}

function buildUrl(path, params = {}) {
  const url = new URL(path, DIRECTUS_URL);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function directusRequest(path, options = {}) {
  const res = await fetch(buildUrl(path), {
    ...options,
    headers: {
      Authorization: `Bearer ${DIRECTUS_TOKEN}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Directus request failed ${res.status} ${res.statusText}\n${path}\n${body}`
    );
  }

  if (res.status === 204) return null;
  return res.json();
}

async function fetchAllHotels() {
  const all = [];
  let offset = 0;
  const limit = 200;

  while (true) {
    const response = await directusRequest(`/items/${DIRECTUS_COLLECTION}`, {
      method: "GET",
      headers: {},
    });

    // fallback if your wrapper endpoint ignores qs in request init
    const pageResponse = await fetch(
      buildUrl(`/items/${DIRECTUS_COLLECTION}`, {
        fields: "id,hotel_name,published,agoda_hotel_id",
        limit,
        offset,
        sort: "id",
      }),
      {
        headers: {
          Authorization: `Bearer ${DIRECTUS_TOKEN}`,
        },
      }
    );

    if (!pageResponse.ok) {
      const body = await pageResponse.text().catch(() => "");
      throw new Error(
        `Directus request failed ${pageResponse.status} ${pageResponse.statusText}\n/items/${DIRECTUS_COLLECTION}\n${body}`
      );
    }

    const pageJson = await pageResponse.json();
    const rows = Array.isArray(pageJson?.data) ? pageJson.data : [];

    all.push(...rows);

    if (rows.length < limit) break;
    offset += limit;
  }

  return all;
}

function isMissingAgodaId(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  return false;
}

async function patchHotel(id, payload) {
  return directusRequest(`/items/${DIRECTUS_COLLECTION}/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

async function main() {
  console.log(`Mode: ${isDryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`Collection: ${DIRECTUS_COLLECTION}`);

  const hotels = await fetchAllHotels();
  console.log(`Hotels loaded: ${hotels.length}`);

  const targets = hotels.filter(
    (hotel) => isMissingAgodaId(hotel.agoda_hotel_id) && hotel.published === true
  );

  console.log(`Hotels to unpublish: ${targets.length}`);

  if (!targets.length) {
    console.log("No hotels matched.");
    return;
  }

  console.log("\nSample affected hotels:");
  for (const hotel of targets.slice(0, 20)) {
    console.log(
      `- ${hotel.hotel_name || "Untitled hotel"} (${hotel.id}) | agoda_hotel_id=${hotel.agoda_hotel_id ?? "null"} | published=${hotel.published}`
    );
  }

  if (isDryRun) {
    console.log("\nDry run complete. No changes written.");
    return;
  }

  let updated = 0;
  let failed = 0;

  for (const hotel of targets) {
    try {
      await patchHotel(hotel.id, { published: false });
      updated += 1;
      console.log(`Unpublished: ${hotel.hotel_name || "Untitled hotel"} (${hotel.id})`);
    } catch (error) {
      failed += 1;
      console.error(
        `FAILED: ${hotel.hotel_name || "Untitled hotel"} (${hotel.id})`
      );
      console.error(error instanceof Error ? error.message : String(error));
    }
  }

  console.log("\nDone.");
  console.log(`Updated: ${updated}`);
  console.log(`Failed: ${failed}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});