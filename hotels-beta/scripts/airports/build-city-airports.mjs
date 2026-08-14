// Regenerates src/lib/cityAirports.ts — a nearest-scheduled-airport(s)
// mapping for every distinct city in the OLTRA `hotels` collection, used
// by the landing page's flight teaser (LandingSummary.tsx) to know which
// airport(s) to search flights to for a given hotel destination.
//
// Usage (from hotels-beta/):
//   DIRECTUS_URL=... DIRECTUS_TOKEN=... node scripts/airports/build-city-airports.mjs
//
// Re-run this whenever the hotel roster's city list changes meaningfully
// (new destinations added). Safe to re-run anytime — it always recomputes
// from scratch and overwrites src/lib/cityAirports.ts.
//
// Data sources:
//   - Directus `hotels` collection: id, city, country, lat, lng (published
//     hotels only). This is the definitive "which cities do we need
//     airports for" list.
//   - OurAirports' public airports.csv
//     (https://davidmegginson.github.io/ourairports-data/airports.csv) —
//     ~86k airports worldwide with type, IATA code, lat/lng, and a
//     scheduled_service flag. Downloaded fresh each run (not committed —
//     it's a large third-party dataset, gitignored, and it changes over
//     time). Filtered to scheduled_service=="yes" (real commercial routes,
//     not private/charter strips) and excludes heliports/seaplane
//     bases/balloonports (irrelevant to Duffel search).
//
// Selection rule per city (see CLAUDE.md for the full rationale/history):
//   1. "Same-city" airports — any airport within 25km of the city's hotel
//      centroid, OR within 60km whose own name/municipality starts with
//      the city name (catches e.g. "London Luton Airport" for London,
//      "Milan Malpensa" for Milan, whose municipality field is a small
//      surrounding town, not the city itself) — ALL of these are listed,
//      uncapped. This is what makes London show all 6 of its airports.
//   2. Otherwise: the single nearest airport (any type) within 400km is
//      used alone if it's a "clear favorite" (next-nearest is >1.5x
//      farther); otherwise up to 3 comparably-distant candidates are kept
//      (each within 1.5x of the nearest one), e.g. an Alpine ski resort
//      reachable via Geneva/Milan/Turin.
//   3. If nothing is within 400km at all (very remote), the single
//      globally-nearest scheduled airport is used regardless of distance.
//
// Known soft spots (accepted, not auto-fixable): a handful of very remote
// safari lodges/private islands are normally reached by charter flight
// from a major hub, not commercial service to a local strip — for these,
// "nearest airport with real scheduled service" can be a distant major
// city rather than the practical charter gateway. Spot-checked during the
// 2026-08-14 build; see CLAUDE.md for the specific cases found.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const OUTPUT_PATH = path.join(REPO_ROOT, "src", "lib", "cityAirports.ts");
const AIRPORTS_CSV_PATH = path.join(__dirname, "airports.csv");
const AIRPORTS_CSV_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv";

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
if (!DIRECTUS_URL || !DIRECTUS_TOKEN) {
  console.error("Missing DIRECTUS_URL / DIRECTUS_TOKEN env vars.");
  process.exit(1);
}

// Known false positives from the raw dataset: fields carrying
// scheduled_service=yes for small commuter/charter ops but with no real
// commercial airline routes worth surfacing.
const MANUAL_EXCLUDE_IATA = new Set([
  "TEB", // Teterboro (NYC) — business aviation only
  "LBG", // Paris-Le Bourget — business aviation / air show venue, not scheduled airline service
  "OPF", // Miami-Opa Locka Executive — business aviation only
]);
const EXCLUDED_TYPES = new Set(["heliport", "seaplane_base", "closed", "balloonport"]);

const MAX_RADIUS_KM = 400;
const FAVORITE_RATIO = 1.5;
const MAX_HUBS = 3;

async function fetchHotels() {
  const res = await fetch(
    `${DIRECTUS_URL}/items/hotels?fields=id,hotel_name,city,country,lat,lng&filter[published][_eq]=true&limit=-1`,
    { headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` } }
  );
  if (!res.ok) throw new Error(`Directus fetch failed: ${res.status}`);
  const json = await res.json();
  return json.data ?? [];
}

async function ensureAirportsCsv() {
  if (fs.existsSync(AIRPORTS_CSV_PATH)) return;
  console.log("Downloading airports.csv from OurAirports...");
  const res = await fetch(AIRPORTS_CSV_URL);
  if (!res.ok) throw new Error(`Failed to download airports.csv: ${res.status}`);
  const text = await res.text();
  fs.writeFileSync(AIRPORTS_CSV_PATH, text);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); field = ""; rows.push(row); row = []; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function loadAirports() {
  const csvText = fs.readFileSync(AIRPORTS_CSV_PATH, "utf8");
  const csvRows = parseCsv(csvText);
  const header = csvRows[0];
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));

  const airports = [];
  for (let i = 1; i < csvRows.length; i++) {
    const r = csvRows[i];
    if (!r || r.length < header.length) continue;
    const iata = r[idx.iata_code];
    const scheduled = r[idx.scheduled_service];
    const type = r[idx.type];
    if (!iata) continue;
    if (scheduled !== "yes") continue;
    if (EXCLUDED_TYPES.has(type)) continue;
    if (MANUAL_EXCLUDE_IATA.has(iata)) continue;
    const lat = parseFloat(r[idx.latitude_deg]);
    const lon = parseFloat(r[idx.longitude_deg]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    airports.push({
      iata,
      name: r[idx.name],
      type,
      municipality: r[idx.municipality] || "",
      lat,
      lon,
    });
  }
  return airports;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalize(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isSameCityMatch(cityNorm, airport, distKm) {
  if (distKm <= 25) return true;
  if (distKm > 60) return false;
  const nameNorm = normalize(airport.name);
  const munNorm = normalize(airport.municipality);
  return (
    munNorm === cityNorm ||
    munNorm.startsWith(cityNorm + " ") ||
    nameNorm.startsWith(cityNorm + " ")
  );
}

function cleanAirportLabel(name) {
  let n = name.replace(/[–—]/g, "-");
  n = n.replace(/\bInternational Airport\b/gi, "");
  n = n.replace(/\bRegional Airport\b/gi, "");
  n = n.replace(/\bMunicipal Airport\b/gi, "");
  n = n.replace(/\bDomestic Airport\b/gi, "");
  n = n.replace(/\bAirport\b/gi, "");
  n = n.replace(/\bInternational\b/gi, "");
  n = n.replace(/\([^)]*\)/g, "");
  n = n.replace(/\s*-\s*$/g, "").replace(/^\s*-\s*/g, "");
  n = n.replace(/\s{2,}/g, " ").replace(/\s+,/g, ",").trim();
  n = n.replace(/[-,]+$/g, "").trim();
  return n || name.trim();
}

function selectAirports(centroidLat, centroidLon, cityNorm, airports) {
  const withDist = airports
    .map((a) => ({ ...a, distKm: haversineKm(centroidLat, centroidLon, a.lat, a.lon) }))
    .sort((a, b) => a.distKm - b.distKm);

  const sameCity = withDist.filter((a) => isSameCityMatch(cityNorm, a, a.distKm));
  if (sameCity.length > 0) return sameCity;

  const inRadius = withDist.filter((a) => a.distKm <= MAX_RADIUS_KM);
  const pool = inRadius.length > 0 ? inRadius : withDist.slice(0, 1);

  // Up to MAX_HUBS candidates, each within FAVORITE_RATIO of the nearest -
  // a single "clear favorite" collapses to 1, comparably-distant hub
  // airports (e.g. an Alpine resort near Geneva/Milan/Turin) keep going up
  // to the cap.
  const chosen = [pool[0]];
  for (let i = 1; i < pool.length && chosen.length < MAX_HUBS; i++) {
    if (pool[i].distKm > pool[0].distKm * FAVORITE_RATIO) break;
    chosen.push(pool[i]);
  }
  return chosen;
}

async function main() {
  const [hotels] = await Promise.all([fetchHotels(), ensureAirportsCsv()]);
  const airports = loadAirports();
  console.log(`${hotels.length} published hotels, ${airports.length} candidate airports.`);

  const groups = new Map();
  for (const h of hotels) {
    const city = (h.city || "").trim();
    if (!city) continue;
    const country = (h.country || "").trim();
    const key = city + "|||" + country;
    if (!groups.has(key)) groups.set(key, { city, hotels: [] });
    groups.get(key).hotels.push(h);
  }

  const results = [];
  for (const g of groups.values()) {
    const lats = g.hotels.map((h) => Number(h.lat)).filter(Number.isFinite);
    const lons = g.hotels.map((h) => Number(h.lng)).filter(Number.isFinite);
    if (!lats.length) continue;
    const centroidLat = lats.reduce((a, b) => a + b, 0) / lats.length;
    const centroidLon = lons.reduce((a, b) => a + b, 0) / lons.length;
    const chosen = selectAirports(centroidLat, centroidLon, normalize(g.city), airports);
    results.push({ city: g.city, airports: chosen });
  }
  results.sort((a, b) => a.city.localeCompare(b.city));

  let out = `// AUTO-GENERATED by scripts/airports/build-city-airports.mjs — do not
// hand-edit. Re-run that script to regenerate. See its header comment and
// CLAUDE.md for the nearest-airport selection rule and known limitations.

export type CityAirport = {
  iata: string;
  label: string;
  distKm: number;
};

export const CITY_AIRPORTS: Record<string, CityAirport[]> = {
`;
  for (const r of results) {
    const entries = r.airports
      .map(
        (a) =>
          `    { iata: ${JSON.stringify(a.iata)}, label: ${JSON.stringify(
            cleanAirportLabel(a.name)
          )}, distKm: ${Math.round(a.distKm)} }`
      )
      .join(",\n");
    out += `  ${JSON.stringify(r.city)}: [\n${entries}\n  ],\n`;
  }
  out += `};

function normalizeCityKey(city: string): string {
  return city.trim().toLowerCase();
}

const LOOKUP: Record<string, CityAirport[]> = Object.fromEntries(
  Object.entries(CITY_AIRPORTS).map(([city, airports]) => [normalizeCityKey(city), airports])
);

/** Nearest airport(s) for a hotel destination city, per the OLTRA hotels
 * collection. Empty array if the city isn't in the mapping (falls back to
 * "please be more specific" in the caller). */
export function getAirportsForCity(city: string): CityAirport[] {
  if (!city) return [];
  return LOOKUP[normalizeCityKey(city)] ?? [];
}

const IATA_TO_CITY: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const [city, airports] of Object.entries(CITY_AIRPORTS)) {
    for (const airport of airports) {
      if (!(airport.iata in map)) map[airport.iata] = city;
    }
  }
  return map;
})();

/** Reverse lookup: which OLTRA hotel city (if any) treats this IATA code as
 * one of its own nearest airports. Returns "" if the airport isn't
 * associated with any city in our hotel roster. Use this - never an
 * airport's own display label/name - whenever an airport code needs to be
 * turned back into a "city" value for something that expects a real hotel
 * city (e.g. handing a Flights-page destination airport back to the Hotels
 * page's destination filter). An airport's descriptive name (e.g. "Venice
 * Marco Polo") is not a city and must never be written into a city field. */
export function getCityForAirportIata(iata: string): string {
  if (!iata) return "";
  return IATA_TO_CITY[iata.trim().toUpperCase()] ?? "";
}
`;

  fs.writeFileSync(OUTPUT_PATH, out);
  console.log(`Wrote ${OUTPUT_PATH} — ${results.length} cities.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
