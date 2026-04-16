import fs from "fs/promises";

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const COLLECTION = "hotels";

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

function normalizeText(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function normalizeLoose(value) {
  return normalizeText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(values) {
  return Array.from(new Set(values.map(normalizeLoose).filter(Boolean)));
}

function overlapScore(a, b) {
  const aa = tokenSet(Array.isArray(a) ? a : [a]);
  const bb = tokenSet(Array.isArray(b) ? b : [b]);
  if (!aa.length || !bb.length) return 0;
  return aa.filter((x) => bb.includes(x)).length;
}

function nonEmpty(values) {
  return values.map(normalizeText).filter(Boolean);
}

function buildQueries(item) {
  const q1 = nonEmpty([
    item.hotel_name,
    item.affiliation,
    item.local_area,
    item.city,
    item.state_province__county__island,
    item.region,
    item.country,
  ]).join(", ");

  const q2 = nonEmpty([
    item.hotel_name,
    item.city,
    item.state_province__county__island,
    item.region,
    item.country,
  ]).join(", ");

  const q3 = nonEmpty([
    item.hotel_name,
    item.affiliation,
    item.country,
  ]).join(", ");

  const q4 = nonEmpty([
    item.hotel_name,
    item.local_area,
    item.country,
  ]).join(", ");

  return Array.from(new Set([q1, q2, q3, q4].filter(Boolean)));
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

async function fetchHotels({ countries = [], cities = [], limit, ids = [] }) {
  const fields = [
    "id",
    "hotelid",
    "hotel_name",
    "affiliation",
    "region",
    "country",
    "state_province__county__island",
    "city",
    "local_area",
    "www",
    "lat",
    "lng",
  ].join(",");

  const params = new URLSearchParams();
  params.set("fields", fields);
  params.set("limit", String(limit || 5000));
  params.set("sort", "country,city,hotel_name");

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
  } else if (countries.length === 1) {
    params.set("filter[country][_eq]", countries[0]);
  } else if (countries.length > 1) {
    countries.forEach((country, idx) => {
      params.set(`filter[_or][${idx}][country][_eq]`, country);
    });
  }

  const { res, data } = await directusFetch(`/items/${COLLECTION}?${params.toString()}`);

  if (!res.ok) {
    throw new Error(`Failed to fetch hotels: ${JSON.stringify(data)}`);
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

function extractAddressParts(result) {
  const out = {
    country: [],
    region: [],
    state: [],
    city: [],
    local_area: [],
  };

  for (const comp of result?.address_components || []) {
    const longName = normalizeLoose(comp.long_name);
    const shortName = normalizeLoose(comp.short_name);

    if (comp.types?.includes("country")) {
      out.country.push(longName, shortName);
    }
    if (
      comp.types?.includes("administrative_area_level_1") ||
      comp.types?.includes("administrative_area_level_2")
    ) {
      out.region.push(longName, shortName);
      out.state.push(longName, shortName);
    }
    if (
      comp.types?.includes("locality") ||
      comp.types?.includes("postal_town") ||
      comp.types?.includes("administrative_area_level_3")
    ) {
      out.city.push(longName, shortName);
    }
    if (
      comp.types?.includes("sublocality") ||
      comp.types?.includes("sublocality_level_1") ||
      comp.types?.includes("neighborhood")
    ) {
      out.local_area.push(longName, shortName);
    }
  }

  for (const key of Object.keys(out)) {
    out[key] = Array.from(new Set(out[key].filter(Boolean)));
  }

  return out;
}

function scoreResult(item, result) {
  const location = result?.geometry?.location;
  if (!location || typeof location.lat !== "number" || typeof location.lng !== "number") {
    return null;
  }

  const parts = extractAddressParts(result);

  const expectedCountry = normalizeLoose(item.country);
  const expectedCity = normalizeLoose(item.city);
  const expectedRegion = normalizeLoose(item.region);
  const expectedState = normalizeLoose(item.state_province__county__island);
  const expectedLocalArea = normalizeLoose(item.local_area);

  const countryScore = expectedCountry ? overlapScore(expectedCountry, parts.country) : 0;
  const cityScore = expectedCity ? overlapScore(expectedCity, [...parts.city, ...parts.local_area]) : 0;
  const areaScore = overlapScore(
    [expectedLocalArea, expectedState, expectedRegion].filter(Boolean),
    [...parts.city, ...parts.local_area, ...parts.state, ...parts.region]
  );

  const locationType = result?.geometry?.location_type || "";
  const typeBonus =
    locationType === "ROOFTOP" ? 3 :
    locationType === "GEOMETRIC_CENTER" ? 2 :
    locationType === "RANGE_INTERPOLATED" ? 1 : 0;

  const score = (countryScore * 3) + (cityScore * 4) + (areaScore * 2) + typeBonus;

  return {
    score,
    cityBlank: !expectedCity,
    mismatchCity: !!expectedCity && cityScore === 0,
    mismatchCountry: !!expectedCountry && countryScore === 0,
    parts,
    lat: Number(location.lat.toFixed(6)),
    lng: Number(location.lng.toFixed(6)),
    formatted_address: result.formatted_address || "",
    location_type: locationType,
    place_id: result.place_id || "",
    types: Array.isArray(result.types) ? result.types : [],
  };
}

function selectBestResult(data, item) {
  if (!data || data.status !== "OK" || !Array.isArray(data.results) || data.results.length === 0) {
    return null;
  }

  const scored = data.results
    .map((result) => scoreResult(item, result))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return null;

  return scored[0];
}

async function updateHotel(id, payload) {
  const { res, data } = await directusFetch(`/items/${COLLECTION}/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

  return { res, data };
}

async function verifyHotel(id) {
  return directusFetch(`/items/${COLLECTION}/${id}?fields=id,hotel_name,country,city,lat,lng`);
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

  const countryArg = getArgValue(args, "--countries");
  const cityArg = getArgValue(args, "--cities");
  const idsArg = getArgValue(args, "--ids");
  const limitArg = getArgValue(args, "--limit");
  const delayArg = getArgValue(args, "--delay-ms");
  const outFile = getArgValue(args, "--out");

  const countries = countryArg
    ? countryArg.split(",").map((v) => v.trim()).filter(Boolean)
    : [];

  const cities = cityArg
    ? cityArg.split(",").map((v) => v.trim()).filter(Boolean)
    : [];

  const ids = idsArg
    ? idsArg.split(",").map((v) => v.trim()).filter(Boolean)
    : [];

  const limit = limitArg ? Number(limitArg) : 5000;
  const delayMs = delayArg ? Number(delayArg) : 150;

  if (!Number.isFinite(limit) || limit <= 0) {
    console.error("--limit must be a positive number.");
    process.exit(1);
  }

  if (!Number.isFinite(delayMs) || delayMs < 0) {
    console.error("--delay-ms must be 0 or greater.");
    process.exit(1);
  }

  const hotels = await fetchHotels({ countries, cities, ids, limit });

  console.log(`Loaded hotels: ${hotels.length}`);

  const report = [];
  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  const countryStats = new Map();
  const mismatchHotels = [];

  function ensureCountryStats(country) {
    const key = normalizeText(country) || "(blank)";
    if (!countryStats.has(key)) {
      countryStats.set(key, {
        loaded: 0,
        processed: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
        mismatches: 0,
      });
    }
    return countryStats.get(key);
  }

  for (const item of hotels) {
    const stats = ensureCountryStats(item.country);
    stats.loaded += 1;

    const hasCoords =
      item.lat !== null &&
      item.lat !== undefined &&
      String(item.lat).trim() !== "" &&
      item.lng !== null &&
      item.lng !== undefined &&
      String(item.lng).trim() !== "";

    if (hasCoords && !force) {
      console.log(`Skipping ${item.hotel_name}: already has coordinates.`);
      skipped += 1;
      stats.skipped += 1;
      continue;
    }

    const queries = buildQueries(item);

    let best = null;
    let usedQuery = "";
    let lastStatus = "";

    for (const query of queries) {
      if (debug) {
        console.log(`Geocoding "${item.hotel_name}" with query: ${query}`);
      }

      const data = await geocodeAddress(query);
      lastStatus = data?.status || "";
      const result = selectBestResult(data, item);

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

    const currentLat = item.lat ?? null;
    const currentLng = item.lng ?? null;

    if (!best) {
      console.error(`Failed: no Google result for ${item.hotel_name} (${item.country})`);
      report.push({
        id: item.id,
        hotelid: item.hotelid ?? null,
        hotel_name: item.hotel_name,
        country: item.country,
        city: item.city,
        status: "no_result_no_update",
        current_lat: currentLat,
        current_lng: currentLng,
        query: queries[0] || "",
        google_status: lastStatus,
        flags: ["no_google_result"],
      });
      failed += 1;
      stats.failed += 1;
      await sleep(delayMs);
      continue;
    }

    const payload = {
      lat: best.lat,
      lng: best.lng,
    };

    const mismatchCity = best.mismatchCity;
    const mismatchCountry = best.mismatchCountry;
    const cityBlank = best.cityBlank;
    const flags = [
      cityBlank ? "city_blank_in_directus" : "",
      mismatchCity ? "city_mismatch" : "",
      mismatchCountry ? "country_mismatch" : "",
    ].filter(Boolean);
    const hasMismatch = flags.length > 0;

    if (dryRun) {
      console.log("--------------------------------------------------");
      console.log(`Hotel:     ${item.hotel_name}`);
      console.log(`Country:   ${item.country || ""}`);
      console.log(`City:      ${item.city || ""}`);
      console.log(`Current:   lat=${currentLat} lng=${currentLng}`);
      console.log(`Proposed:  lat=${best.lat} lng=${best.lng}`);
      console.log(`Query:     ${usedQuery}`);
      console.log(`Address:   ${best.formatted_address}`);
      console.log(`Type:      ${best.location_type}`);
      console.log(`Place ID:  ${best.place_id}`);
      if (hasMismatch) {
        console.log(`FLAG:      ${flags.join(", ")}`);
        stats.mismatches += 1;
        mismatchHotels.push({
          hotel_name: item.hotel_name,
          country: item.country,
          city: item.city,
          flags,
          query: usedQuery,
          formatted_address: best.formatted_address,
        });
      }

      report.push({
        id: item.id,
        hotelid: item.hotelid ?? null,
        hotel_name: item.hotel_name,
        country: item.country,
        city: item.city,
        status: "dry_run",
        current_lat: currentLat,
        current_lng: currentLng,
        proposed_lat: best.lat,
        proposed_lng: best.lng,
        query: usedQuery,
        formatted_address: best.formatted_address,
        location_type: best.location_type,
        place_id: best.place_id,
        flags,
      });

      await sleep(delayMs);
      continue;
    }

    const result = await updateHotel(item.id, payload);

    if (!result.res.ok) {
      console.error(`Update failed for ${item.hotel_name}: ${JSON.stringify(result.data)}`);
      report.push({
        id: item.id,
        hotelid: item.hotelid ?? null,
        hotel_name: item.hotel_name,
        country: item.country,
        city: item.city,
        status: "update_failed",
        current_lat: currentLat,
        current_lng: currentLng,
        proposed_lat: best.lat,
        proposed_lng: best.lng,
        query: usedQuery,
        formatted_address: best.formatted_address,
        location_type: best.location_type,
        place_id: best.place_id,
        flags,
      });
      failed += 1;
      stats.failed += 1;
      await sleep(delayMs);
      continue;
    }

    console.log("--------------------------------------------------");
    console.log(`Updated:   ${item.hotel_name}`);
    console.log(`Current:   lat=${currentLat} lng=${currentLng}`);
    console.log(`New:       lat=${best.lat} lng=${best.lng}`);
    console.log(`Query:     ${usedQuery}`);
    console.log(`Address:   ${best.formatted_address}`);
    if (hasMismatch) {
      console.log(`FLAG:      ${flags.join(", ")}`);
      stats.mismatches += 1;
      mismatchHotels.push({
        hotel_name: item.hotel_name,
        country: item.country,
        city: item.city,
        flags,
        query: usedQuery,
        formatted_address: best.formatted_address,
      });
    }

    updated += 1;
    stats.updated += 1;

    report.push({
      id: item.id,
      hotelid: item.hotelid ?? null,
      hotel_name: item.hotel_name,
      country: item.country,
      city: item.city,
      status: "updated",
      current_lat: currentLat,
      current_lng: currentLng,
      proposed_lat: best.lat,
      proposed_lng: best.lng,
      query: usedQuery,
      formatted_address: best.formatted_address,
      location_type: best.location_type,
      place_id: best.place_id,
      flags,
    });

    if (verify) {
      const verifyResp = await verifyHotel(item.id);
      if (!verifyResp.res.ok) {
        console.error(`Verify failed for ${item.hotel_name}`);
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

  console.log("\n========== BY COUNTRY ==========");
  for (const [country, stats] of Array.from(countryStats.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  )) {
    console.log(
      `${country}: loaded=${stats.loaded}, processed=${stats.processed}, updated=${stats.updated}, skipped=${stats.skipped}, failed=${stats.failed}, mismatches=${stats.mismatches}`
    );
  }

  console.log("\n========== MISMATCH HOTELS ==========");
  if (!mismatchHotels.length) {
    console.log("None");
  } else {
    for (const item of mismatchHotels) {
      console.log(
        `${item.hotel_name} | ${item.country || ""} | ${item.city || ""} | ${item.flags.join(", ")} | ${item.formatted_address}`
      );
    }
  }

  console.log("\n========== SUMMARY ==========");
  console.log(`Loaded: ${hotels.length}`);
  console.log(`Processed: ${processed}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
  console.log(`Mismatches: ${mismatchHotels.length}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});