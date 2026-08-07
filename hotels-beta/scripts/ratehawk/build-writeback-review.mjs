// Pre-write-back QA file: side-by-side OLTRA vs Ratehawk data for every
// CONFIRMED match, with computed distance/name/city discrepancy flags.
// No Directus writes here — this is purely a review artifact.
//
// Usage (from hotels-beta/):
//   DIRECTUS_URL=... DIRECTUS_TOKEN=... node scripts/ratehawk/build-writeback-review.mjs

import fs from "fs";
import fsp from "fs/promises";
import readline from "readline";

const oltraHotels = JSON.parse(await fsp.readFile("scripts/ratehawk/output/oltra_hotels.json", "utf8"));
const oltraById = new Map(oltraHotels.map((h) => [h.id, h]));

const decisions = JSON.parse(
  await fsp.readFile("scripts/ratehawk/output/ratehawk_match_decisions.json", "utf8")
);
const confirmed = decisions.filter((d) => d.decision === "confirmed" && d.ratehawk_hid);

// Look up every confirmed hid directly from the full filtered dump, rather than
// the automatic matcher's narrow top-3-per-hotel cache in results.json — a
// manually-confirmed hid is often NOT one of the automatic top-3.
const targetHids = new Set(confirmed.map((d) => Number(d.ratehawk_hid)));
const rhByHid = new Map();
const rl = readline.createInterface({
  input: fs.createReadStream("scripts/ratehawk/output/filtered-hotels.jsonl"),
  crlfDelay: Infinity,
});
for await (const line of rl) {
  if (!line.trim()) continue;
  let obj;
  try {
    obj = JSON.parse(line);
  } catch {
    continue;
  }
  if (targetHids.has(obj.hid)) rhByHid.set(obj.hid, obj);
}
console.log(`Looked up ${rhByHid.size} of ${targetHids.size} target hids in filtered-hotels.jsonl`);

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

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
function removeGenericHotelWords(s) {
  return s
    .replace(/\bhotel\b/g, " ")
    .replace(/\bhotels\b/g, " ")
    .replace(/\bresort\b/g, " ")
    .replace(/\bresorts\b/g, " ")
    .replace(/\bspa\b/g, " ")
    .replace(/\bvillas\b/g, " ")
    .replace(/\bvilla\b/g, " ")
    .replace(/\blodge\b/g, " ")
    .replace(/\bcamp\b/g, " ")
    .replace(/\bpalace\b/g, " ")
    .replace(/\bsuites\b/g, " ")
    .replace(/\bsuite\b/g, " ")
    .replace(/\bresidences\b/g, " ")
    .replace(/\bresidence\b/g, " ")
    .replace(/\bcollection\b/g, " ")
    .replace(/\bboutique\b/g, " ")
    .replace(/\bby\b/g, " ")
    .replace(/\ba\b/g, " ")
    .replace(/\ban\b/g, " ")
    .replace(/\bthe\b/g, " ")
    .replace(/\band\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function coreName(value) {
  let s = normalizeText(value);
  s = s.replace(/\bbulgari\b/g, "bvlgari");
  s = s.replace(/\band beyond\b/g, "andbeyond");
  s = s.replace(/\bst\b/g, "saint");
  return removeGenericHotelWords(s);
}

function tokens(s) {
  return s ? s.split(" ").filter(Boolean) : [];
}

function csvEscape(v) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const rows = [];
for (const d of confirmed) {
  const oltra = oltraById.get(d.oltra_id);
  if (!oltra) continue;
  const rh = rhByHid.get(Number(d.ratehawk_hid));
  if (!rh) {
    console.warn(`WARNING: hid ${d.ratehawk_hid} (${d.ratehawk_name}) for ${oltra.hotel_name} not found in filtered-hotels.jsonl`);
  }

  const oltraLat = oltra.lat != null ? Number(oltra.lat) : null;
  const oltraLng = oltra.lng != null ? Number(oltra.lng) : null;
  const rhLat = rh?.latitude ?? null;
  const rhLng = rh?.longitude ?? null;

  const distKm = haversineKm(oltraLat, oltraLng, rhLat, rhLng);
  const distFlag = distKm == null ? "NO_COORDS" : distKm > 0.05 ? "REVIEW" : "";

  const oltraCore = coreName(oltra.hotel_name);
  const rhCore = coreName(rh?.name || d.ratehawk_name);
  const nameFlag = oltraCore !== rhCore ? "DIFFERS" : "";

  const oltraCity = (oltra.city || "").trim().toLowerCase();
  const rhCity = (rh?.city || "").trim().toLowerCase();
  const cityFlag = oltraCity !== rhCity ? "DIFFERS" : "";

  rows.push({
    oltra_id: d.oltra_id,
    oltra_hotel_name: oltra.hotel_name,
    oltra_brand: oltra.affiliation || "",
    oltra_city: oltra.city || "",
    oltra_country: oltra.country || "",
    oltra_lat: oltraLat,
    oltra_lng: oltraLng,
    ratehawk_hid: d.ratehawk_hid,
    ratehawk_name: rh?.name || d.ratehawk_name,
    ratehawk_city: rh?.city || "",
    ratehawk_country: rh?.country || "",
    ratehawk_lat: rhLat,
    ratehawk_lng: rhLng,
    distance_km: distKm != null ? Number(distKm.toFixed(3)) : "",
    distance_flag: distFlag,
    name_flag: nameFlag,
    city_flag: cityFlag,
  });
}

// Description cross-check: for rows where the name materially differs, pull
// the OLTRA `description` field (sourced from official hotel websites per
// user) and test whether each candidate name actually appears in it — gives
// supporting evidence for which name is "correct" before any rename.
const nameFlaggedIds = rows.filter((r) => r.name_flag === "DIFFERS").map((r) => r.oltra_id);
const descByOltraId = new Map();

if (nameFlaggedIds.length) {
  const DIRECTUS_URL = process.env.DIRECTUS_URL;
  const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
  if (!DIRECTUS_URL || !DIRECTUS_TOKEN) {
    console.warn("DIRECTUS_URL/DIRECTUS_TOKEN not set — skipping description cross-check.");
  } else {
    const base = DIRECTUS_URL.replace(/\/$/, "");
    const url = `${base}/items/hotels?fields=id,description&limit=-1&filter[id][_in]=${nameFlaggedIds.join(",")}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` } });
    const text = await res.text();
    if (!res.ok) throw new Error(`Directus request failed ${res.status}\n${text}`);
    const { data } = JSON.parse(text);
    console.log(`Fetched ${data.length} of ${nameFlaggedIds.length} descriptions for name-cross-check`);
    for (const h of data) descByOltraId.set(String(h.id), h.description || "");
  }
}

function nameEvidence(name, normDescription) {
  if (!normDescription) return "NO_DESCRIPTION";
  const fullNorm = normalizeText(name);
  if (fullNorm && normDescription.includes(fullNorm)) return "EXACT";
  const core = tokens(coreName(name)).filter((t) => t.length >= 3);
  if (core.length && core.every((t) => normDescription.includes(t))) return "PARTIAL";
  return "NO";
}

for (const r of rows) {
  if (r.name_flag !== "DIFFERS") {
    r.oltra_name_in_description = "";
    r.ratehawk_name_in_description = "";
    continue;
  }
  const description = descByOltraId.get(r.oltra_id) || "";
  const normDescription = normalizeText(description);
  r.oltra_name_in_description = nameEvidence(r.oltra_hotel_name, normDescription);
  r.ratehawk_name_in_description = nameEvidence(r.ratehawk_name, normDescription);
}

rows.sort((a, b) => a.oltra_hotel_name.localeCompare(b.oltra_hotel_name));

const headers = [
  "oltra_id","oltra_hotel_name","oltra_brand","oltra_city","oltra_country","oltra_lat","oltra_lng",
  "ratehawk_hid","ratehawk_name","ratehawk_city","ratehawk_country","ratehawk_lat","ratehawk_lng",
  "distance_km","distance_flag","name_flag","oltra_name_in_description","ratehawk_name_in_description","city_flag"
];
const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(","))].join("\n");

await fsp.writeFile("scripts/ratehawk/output/writeback_review.csv", csv, "utf8");

const distanceReview = rows.filter((r) => r.distance_flag === "REVIEW");
const noCoords = rows.filter((r) => r.distance_flag === "NO_COORDS");
const nameDiffers = rows.filter((r) => r.name_flag === "DIFFERS");
const cityDiffers = rows.filter((r) => r.city_flag === "DIFFERS");

console.log(`Total confirmed rows: ${rows.length}`);
console.log(`Distance > 50m (REVIEW): ${distanceReview.length}`);
console.log(`Missing coordinates on one side: ${noCoords.length}`);
console.log(`Name differs materially: ${nameDiffers.length}`);
console.log(`City differs: ${cityDiffers.length}`);
console.log(`\nWrote scripts/ratehawk/output/writeback_review.csv`);
