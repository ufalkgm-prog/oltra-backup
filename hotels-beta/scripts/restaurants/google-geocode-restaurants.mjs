import fs from "fs/promises";

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const COLLECTION = "restaurants";

function hasFlag(args, flag) {
  return args.includes(flag);
}

function getArgValue(args, name) {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : undefined;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildQuery(item) {
  const parts = [
    item.restaurant_name,
    item.hotel_name_hint,
    item.local_area,
    item.city,
    item.region,
    item.country,
  ].filter(Boolean);

  return parts.join(", ");
}

function buildAltQuery(item) {
  const parts = [
    item.restaurant_name,
    item.city,
    item.country,
  ].filter(Boolean);

  return parts.join(", ");
}

async function directusFetch(path, options = {}) {
  const res = await fetch(`${DIRECTUS_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DIRECTUS_TOKEN}`,
      ...(options.headers || {}),
    },
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  return { res, data };
}

async function fetchRestaurants({ cities = [], limit, ids = [] }) {
  const fields = [
    "id",
    "restaurant_name",
    "slug",
    "city",
    "region",
    "country",
    "local_area",
    "hotel_name_hint",
    "lat",
    "lng",
    "www",
    "insta",
  ].join(",");

  const params = new URLSearchParams();
  params.set("fields", fields);
  params.set("limit", String(limit || 1000));
  params.set("sort", "city,restaurant_name");

  if (ids.length === 1) {
    params.set("filter[id][_eq]", String(ids[0]));
  } else if (ids.length > 1) {
    ids.forEach((id, idx) => {
      params.set(`filter[_or][${idx}][id][_eq]`, String(id));
    });
  } else if (cities.length === 1) {
    params.set("filter[city][_eq]", cities[0]);
  } else if (cities.length > 1) {
    cities.forEach((city, idx) => {
      params.set(`filter[_or][${idx}][city][_eq]`, city);
    });
  }

  const { res, data } = await directusFetch(`/items/${COLLECTION}?${params.toString()}`);

  if (!res.ok) {
    throw new Error(`Failed to fetch restaurants: ${JSON.stringify(data)}`);
  }

  return data?.data || [];
}

async function geocodeAddress(address) {
  const params = new URLSearchParams();
  params.set("address", address);
  params.set("key", GOOGLE_MAPS_API_KEY);

  const res = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`
  );

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    throw new Error(`Google Geocoding request failed: HTTP ${res.status}`);
  }

  return data;
}

function extractBestResult(data) {
  if (!data || data.status !== "OK" || !Array.isArray(data.results) || data.results.length === 0) {
    return null;
  }

  const first = data.results[0];
  const location = first?.geometry?.location;
  if (!location || typeof location.lat !== "number" || typeof location.lng !== "number") {
    return null;
  }

  return {
    lat: Number(location.lat.toFixed(6)),
    lng: Number(location.lng.toFixed(6)),
    formatted_address: first.formatted_address || "",
    location_type: first?.geometry?.location_type || "",
    place_id: first.place_id || "",
    types: Array.isArray(first.types) ? first.types : [],
  };
}

async function updateRestaurant(id, payload) {
  const { res, data } = await directusFetch(`/items/${COLLECTION}/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

  return { res, data };
}

async function verifyRestaurant(id) {
  return directusFetch(`/items/${COLLECTION}/${id}?fields=id,restaurant_name,city,lat,lng`);
}

async function main() {
  if (!DIRECTUS_URL || !DIRECTUS_TOKEN) {
    console.error("Missing DIRECTUS_URL or DIRECTUS_TOKEN.");
    process.exit(1);
  }

  if (!GOOGLE_MAPS_API_KEY) {
    console.error("Missing GOOGLE_MAPS_API_KEY.");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const dryRun = hasFlag(args, "--dry-run");
  const verify = hasFlag(args, "--verify");
  const force = hasFlag(args, "--force");
  const debug = hasFlag(args, "--debug");

  const cityArg = getArgValue(args, "--cities");
  const idsArg = getArgValue(args, "--ids");
  const limitArg = getArgValue(args, "--limit");
  const delayArg = getArgValue(args, "--delay-ms");
  const outFile = getArgValue(args, "--out");

  const cities = cityArg
    ? cityArg.split(",").map((v) => v.trim()).filter(Boolean)
    : [];

  const ids = idsArg
    ? idsArg.split(",").map((v) => v.trim()).filter(Boolean)
    : [];

  const limit = limitArg ? Number(limitArg) : 1000;
  const delayMs = delayArg ? Number(delayArg) : 150;

  if (!Number.isFinite(limit) || limit <= 0) {
    console.error("--limit must be a positive number.");
    process.exit(1);
  }

  if (!Number.isFinite(delayMs) || delayMs < 0) {
    console.error("--delay-ms must be 0 or greater.");
    process.exit(1);
  }

  const restaurants = await fetchRestaurants({ cities, ids, limit });

  console.log(`Loaded restaurants: ${restaurants.length}`);

  const report = [];
  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  const cityStats = new Map();

  function ensureCityStats(city) {
    const key = city || "(blank)";
    if (!cityStats.has(key)) {
      cityStats.set(key, {
        loaded: 0,
        processed: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
      });
    }
    return cityStats.get(key);
  }

  for (const item of restaurants) {
    const stats = ensureCityStats(item.city);
    stats.loaded += 1;

    const hasCoords =
      item.lat !== null &&
      item.lat !== undefined &&
      String(item.lat).trim() !== "" &&
      item.lng !== null &&
      item.lng !== undefined &&
      String(item.lng).trim() !== "";

    if (hasCoords && !force) {
      console.log(`Skipping ${item.restaurant_name}: already has coordinates.`);
      skipped += 1;
      stats.skipped += 1;
      continue;
    }

    const q1 = buildQuery(item);
    const q2 = buildAltQuery(item);

    let best = null;
    let usedQuery = "";
    const tried = [];

    for (const query of [q1, q2]) {
      if (!query || tried.includes(query)) continue;
      tried.push(query);

      if (debug) {
        console.log(`Geocoding "${item.restaurant_name}" with query: ${query}`);
      }

      const data = await geocodeAddress(query);
      const result = extractBestResult(data);

      if (debug) {
        console.log(`Google status: ${data?.status}`);
      }

      if (result) {
        best = result;
        usedQuery = query;
        break;
      }

      await sleep(delayMs);
    }

    processed += 1;
    stats.processed += 1;

    if (!best) {
      console.error(`Failed: ${item.restaurant_name} (${item.city})`);
      report.push({
        id: item.id,
        restaurant_name: item.restaurant_name,
        city: item.city,
        slug: item.slug,
        status: "failed",
        query: q1,
      });
      failed += 1;
      stats.failed += 1;
      await sleep(delayMs);
      continue;
    }

    const currentLat = item.lat ?? null;
    const currentLng = item.lng ?? null;

    const payload = {
      lat: best.lat,
      lng: best.lng,
    };

    if (dryRun) {
      console.log("--------------------------------------------------");
      console.log(`Restaurant: ${item.restaurant_name}`);
      console.log(`City: ${item.city}`);
      console.log(`Current:  lat=${currentLat} lng=${currentLng}`);
      console.log(`Proposed: lat=${best.lat} lng=${best.lng}`);
      console.log(`Query:    ${usedQuery}`);
      console.log(`Address:  ${best.formatted_address}`);
      console.log(`Type:     ${best.location_type}`);
      console.log(`Place ID: ${best.place_id}`);

      report.push({
        id: item.id,
        restaurant_name: item.restaurant_name,
        city: item.city,
        slug: item.slug,
        status: "dry_run",
        current_lat: currentLat,
        current_lng: currentLng,
        proposed_lat: best.lat,
        proposed_lng: best.lng,
        query: usedQuery,
        formatted_address: best.formatted_address,
        location_type: best.location_type,
        place_id: best.place_id,
      });

      await sleep(delayMs);
      continue;
    }

    const result = await updateRestaurant(item.id, payload);

    if (!result.res.ok) {
      console.error(`Update failed for ${item.restaurant_name}: ${JSON.stringify(result.data)}`);
      report.push({
        id: item.id,
        restaurant_name: item.restaurant_name,
        city: item.city,
        slug: item.slug,
        status: "update_failed",
        current_lat: currentLat,
        current_lng: currentLng,
        proposed_lat: best.lat,
        proposed_lng: best.lng,
        query: usedQuery,
        formatted_address: best.formatted_address,
        location_type: best.location_type,
        place_id: best.place_id,
      });
      failed += 1;
      stats.failed += 1;
      await sleep(delayMs);
      continue;
    }

    console.log("--------------------------------------------------");
    console.log(`Updated:   ${item.restaurant_name}`);
    console.log(`Current:   lat=${currentLat} lng=${currentLng}`);
    console.log(`New:       lat=${best.lat} lng=${best.lng}`);
    console.log(`Query:     ${usedQuery}`);
    console.log(`Address:   ${best.formatted_address}`);

    updated += 1;
    stats.updated += 1;

    report.push({
      id: item.id,
      restaurant_name: item.restaurant_name,
      city: item.city,
      slug: item.slug,
      status: "updated",
      current_lat: currentLat,
      current_lng: currentLng,
      proposed_lat: best.lat,
      proposed_lng: best.lng,
      query: usedQuery,
      formatted_address: best.formatted_address,
      location_type: best.location_type,
      place_id: best.place_id,
    });

    if (verify) {
      const verifyResp = await verifyRestaurant(item.id);
      if (!verifyResp.res.ok) {
        console.error(`Verify failed for ${item.restaurant_name}`);
      } else {
        console.log(`Verified: ${JSON.stringify(verifyResp.data?.data)}`);
      }
    }

    await sleep(delayMs);
  }

  if (outFile) {
    await fs.writeFile(outFile, JSON.stringify(report, null, 2), "utf8");
    console.log(`Report written to ${outFile}`);
  }

  console.log("\n========== BY CITY ==========");
  for (const [city, stats] of Array.from(cityStats.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  )) {
    console.log(
      `${city}: loaded=${stats.loaded}, processed=${stats.processed}, updated=${stats.updated}, skipped=${stats.skipped}, failed=${stats.failed}`
    );
  }

  console.log("\n========== SUMMARY ==========");
  console.log(`Loaded: ${restaurants.length}`);
  console.log(`Processed: ${processed}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});