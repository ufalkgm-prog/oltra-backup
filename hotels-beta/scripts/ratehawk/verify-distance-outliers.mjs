// Independently verify the ~37 confirmed matches where OLTRA and Ratehawk
// disagree on coordinates by >1km, using Google Places "Find Place from Text"
// (same approach as scripts/hotels/new-hotels-2026/google-geocode-hotels.mjs).
// For each hotel, tries a few query variants, takes the best-scoring result,
// and reports which of OLTRA's/Ratehawk's coordinates is closer to Google's
// independent answer. No writes — review output only.
//
// Usage (from hotels-beta/):
//   GOOGLE_MAPS_API_KEY=... node scripts/ratehawk/verify-distance-outliers.mjs

import fs from "fs/promises";

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
if (!GOOGLE_MAPS_API_KEY) throw new Error("Missing GOOGLE_MAPS_API_KEY in environment");

const outliers = JSON.parse(
  await fs.readFile("scripts/ratehawk/output/distance_outliers.json", "utf8")
);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function haversineKm(lat1, lon1, lat2, lon2) {
  if ([lat1, lon1, lat2, lon2].some((v) => v == null || Number.isNaN(v))) return null;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildQueries(row) {
  const name = row.oltra_hotel_name;
  const brand = row.oltra_brand;
  const city = row.oltra_city;
  const country = row.oltra_country;
  const parts = [
    [name, brand, city, country],
    [name, city, country],
    [name, country],
  ];
  return Array.from(
    new Set(parts.map((p) => p.filter(Boolean).join(", ")).filter(Boolean))
  );
}

async function findPlace(input) {
  const params = new URLSearchParams({
    input,
    inputtype: "textquery",
    fields: "geometry,name,formatted_address,place_id",
    key: GOOGLE_MAPS_API_KEY,
  });
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?${params.toString()}`
  );
  return res.json();
}

function normalizeLoose(v) {
  return String(v ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const results = [];

for (const row of outliers) {
  const queries = buildQueries(row);
  let best = null;

  for (const q of queries) {
    let data;
    try {
      data = await findPlace(q);
    } catch (e) {
      continue;
    }
    const cand = data?.candidates?.[0];
    if (!cand?.geometry?.location) continue;

    const addr = normalizeLoose(cand.formatted_address || "");
    const expectedCountry = normalizeLoose(row.oltra_country);
    const countryMatch = expectedCountry && addr.includes(expectedCountry);

    const entry = {
      query: q,
      formatted_address: cand.formatted_address,
      lat: cand.geometry.location.lat,
      lng: cand.geometry.location.lng,
      countryMatch,
    };
    if (!best || (entry.countryMatch && !best.countryMatch)) best = entry;
    if (countryMatch) break; // good enough, stop trying more variants
    await sleep(120);
  }

  const distToOltra = best ? haversineKm(row.oltra_lat, row.oltra_lng, best.lat, best.lng) : null;
  const distToRatehawk = best ? haversineKm(row.ratehawk_lat, row.ratehawk_lng, best.lat, best.lng) : null;

  let verdict = "UNCLEAR";
  if (best) {
    if (distToOltra != null && distToOltra < 1 && (distToRatehawk == null || distToRatehawk >= 1)) verdict = "OLTRA_CORRECT";
    else if (distToRatehawk != null && distToRatehawk < 1 && (distToOltra == null || distToOltra >= 1)) verdict = "RATEHAWK_CORRECT";
    else if (distToOltra != null && distToRatehawk != null) {
      verdict = distToOltra < distToRatehawk ? "LEAN_OLTRA" : "LEAN_RATEHAWK";
    }
  } else {
    verdict = "GOOGLE_NO_RESULT";
  }

  results.push({
    oltra_id: row.oltra_id,
    oltra_hotel_name: row.oltra_hotel_name,
    oltra_country: row.oltra_country,
    oltra_lat: row.oltra_lat,
    oltra_lng: row.oltra_lng,
    ratehawk_name: row.ratehawk_name,
    ratehawk_lat: row.ratehawk_lat,
    ratehawk_lng: row.ratehawk_lng,
    distance_km_oltra_vs_ratehawk: row.distance_km,
    google_query_used: best?.query || "",
    google_formatted_address: best?.formatted_address || "",
    google_lat: best?.lat ?? "",
    google_lng: best?.lng ?? "",
    dist_google_to_oltra_km: distToOltra != null ? Number(distToOltra.toFixed(3)) : "",
    dist_google_to_ratehawk_km: distToRatehawk != null ? Number(distToRatehawk.toFixed(3)) : "",
    verdict,
  });

  console.log(`${row.oltra_hotel_name}: ${verdict} (google->oltra ${distToOltra?.toFixed(2)}km, google->ratehawk ${distToRatehawk?.toFixed(2)}km)`);
  await sleep(150);
}

function csvEscape(v) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const headers = Object.keys(results[0]);
const csv = [headers.join(","), ...results.map((r) => headers.map((h) => csvEscape(r[h])).join(","))].join("\n");
await fs.writeFile("scripts/ratehawk/output/distance_outliers_verified.csv", csv, "utf8");

const counts = {};
for (const r of results) counts[r.verdict] = (counts[r.verdict] || 0) + 1;
console.log("\n", counts);
console.log("\nWrote scripts/ratehawk/output/distance_outliers_verified.csv");
