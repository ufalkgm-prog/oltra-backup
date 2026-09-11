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
const RUNWAYS_CSV_PATH = path.join(__dirname, "runways.csv");
const RUNWAYS_CSV_URL = "https://davidmegginson.github.io/ourairports-data/runways.csv";

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
  // NCA (North Caicos) is a different case from the three above, and the
  // distinction matters if this is ever revisited: it carries real scheduled
  // inter-island service, so it is not a false positive in the dataset. It is
  // excluded because of who is NEAR it on this roster. Both cities it serves
  // here — Parrot Cay and Pine Cay — are private cays reached by BOAT from
  // Leeward Marina on Providenciales, which both hotels' own descriptions
  // state, so PLS is the arrival airport for each and a 1,294m inter-island
  // strip is not. Left in, the 25km tier-1 cut split two neighbouring cays 8km
  // apart: Pine Cay got NCA and PLS, Parrot Cay got NCA alone with PLS
  // stranded at 28km.
  // REVERSE THIS if a hotel is ever added on North Caicos or Middle Caicos,
  // where NCA genuinely is the nearest airport for guests rather than for
  // residents. Do NOT instead re-add an airport-type filter — that was tried
  // and it sent Missoula to Spokane 319km away.
  "NCA",
]);
const EXCLUDED_TYPES = new Set(["heliport", "seaplane_base", "closed", "balloonport"]);

/* WILDERNESS GATEWAYS — the practical arrival airport, where the nearest
 * scheduled one is not it.
 *
 * §37 records this as a known soft spot and it finally bit: five wilderness
 * destinations were added to this mapping on 2026-09-11 (they had keyed to
 * nothing at all before, see the grouping block below), and three resolved to
 * bush airstrips that no international itinerary can be sold to —
 * Masai Mara -> a 1,052m "Mara Serena LODGE AIRSTRIP", Amboseli -> a 1,001m
 * strip, Volcanoes National Park -> Kisoro, which is in UGANDA.
 *
 * AN EXCLUSION LIST WOULD HAVE MADE IT WORSE, which is why this is an override
 * instead. Drop the Mara airstrip and the next nearest is Seronera in
 * TANZANIA (134km); drop Kisoro and the next is Goma in the DEMOCRATIC
 * REPUBLIC OF THE CONGO (50km). Nearest-wins cannot reach the right answer
 * here by removing candidates, because the right answer is 214km away.
 *
 * A RUNWAY-LENGTH FILTER IS ALSO WRONG, though it looks tempting: the correct
 * entries for Voavah (1,189m), Vommuli and the other Maldivian resorts are
 * exactly this size, because there a small strip IS the arrival airport. And
 * §37 already records that filtering on airport TYPE was tried and reverted —
 * it sent Missoula to Spokane, 319km away.
 *
 * So each entry below is a per-destination decision, not a rule. Two of the
 * five needed NO override and are deliberately absent: the Negev's Ramon
 * (21km, 3,600m, international) and Clayoquot's Tofino (32km, jet-capable, and
 * genuinely how guests arrive) are what the algorithm already chose.
 *
 * Distances are recomputed from the real centroid, so the number stays honest
 * even though the choice was made by hand. */
const GATEWAY_OVERRIDE = {
  // Nairobi, not Wilson: WIL is where the safari light aircraft departs from,
  // NBO is where the international ticket lands.
  "Masai Mara": ["NBO"],
  "Amboseli National Park": ["NBO"],
  "Volcanoes National Park": ["KGL"],

  /* Added 2026-09-11 after checking the eight remaining "jet gateway, but far"
   * destinations one by one. TWO OF THE EIGHT NEEDED NOTHING and are listed
   * here so nobody overrides them later: Lake Louise already resolves to
   * Calgary, and Philipsburg to Missoula - which §37 records as the answer an
   * earlier airport-type filter got wrong by sending it to Spokane, 319km off.
   * Nearest-wins gets both right on its own. */

  // Chongzuo sits in Guangxi and Nanning is its gateway: 3,200m and real
  // international service, against Baise Bama's small regional operation 15km
  // closer. Distance alone could not separate them.
  Chongzou: ["NNG"],

  // Nikko is reached from TOKYO, by train. Nearest-wins offered Fukushima
  // (99km) and Ibaraki (103km) ahead of it, and no guest has ever flown to
  // either for Nikko. Narita and Haneda are 134km and 135km - equidistant in
  // practice, so both are listed, nearest first.
  Nikko: ["NRT", "HND"],

  /* The worst of the set, and not a matter of degree: Singita Pamushana is in
   * ZIMBABWE and none of its three mapped airports was — VPY is Chimoio in
   * Mozambique, PHW is Hendrik Van Eck in South Africa, BEW is Beira, also
   * Mozambique. Harare is the country's gateway, and guests continue by
   * charter from there or from Johannesburg. Buffalo Range is nearer but
   * carries no scheduled service, so it is not in the dataset at all. */
  Pamushana: ["HRE"],

  // Sossusvlei: Windhoek Hosea Kutako is the international gateway. Lüderitz
  // is 80km closer and a small southern town nobody routes through.
  Sesriem: ["WDH"],

  // Sonop is in the Karas region, reached from Windhoek by charter or a long
  // drive. Lüderitz again wins on distance and loses on service.
  "Sonop Farm": ["WDH"],

  // Mauna Lani is on the Kohala Coast. Kona is 8km further than
  // Waimea-Kohala and is the island's actual gateway — 3,353m against 1,584m,
  // and the only one of the two with mainland service.
  "Big Island": ["KOA"],

  /* ==== THE ALPS: a straight line crosses the mountains, a road does not ====
   *
   * Reported live, 2026-09-11: asked how to reach Val d'Isere the concierge
   * answered TURIN, because Turin is 59km away as the crow flies. The crow does
   * not use the Frejus tunnel. Geneva is 115km and about three hours by road,
   * which is why everyone actually flies there.
   *
   * Checking the other 67 Alpine destinations found the same fault repeatedly,
   * and always the same shape: a small regional field wins on distance and the
   * major hub every guest uses is absent from the list altogether. Zermatt was
   * the starkest — Milan, Lugano and Turin, not one Swiss airport.
   *
   * TWO THINGS THIS IS NOT. It is not "always pick Geneva": Cervinia keeps
   * TURIN, because Cervinia is in the Aosta Valley on the Italian side and
   * Turin is genuinely its gateway. And it is not every resort: Chamonix,
   * Megeve and Andermatt already list their hub and are left alone.
   *
   * ORDERING. Elsewhere in this file entries are nearest-first. Overridden
   * entries are ordered by USEFULNESS instead — Geneva ahead of Chambery for
   * Val d'Isere even though Chambery is closer, because Chambery is largely
   * winter charter. `pickPrimaryAirportForCity` favours the biggest airport
   * anyway, so this only affects display order. */

  // France, Savoie. Chambery is closer and seasonal; Lyon is the year-round
  // alternative.
  "Val d'Isere": ["GVA", "CMF", "LYS"],
  Courchevel: ["GVA", "CMF", "LYS"],
  "Courchevel 1850": ["GVA", "CMF", "LYS"],
  "Les Belleville": ["GVA", "CMF", "LYS"],

  // Switzerland, Valais and Bernese Oberland. Zermatt had no Swiss airport at
  // all; Milan stays as a real third option via the Simplon.
  Zermatt: ["GVA", "ZRH", "MXP"],
  "Crans-Montana": ["GVA", "ZRH"],
  Gstaad: ["GVA", "ZRH"],

  // Switzerland, Graubunden. Zurich was missing from all three.
  "St. Moritz": ["ZRH", "MXP"],
  Arosa: ["ZRH"],
  "Bad Ragaz": ["ZRH"],

  // Austria, Arlberg. Innsbruck is nearer, Zurich is the hub most guests use.
  "Lech Am Arlberg": ["ZRH", "INN"],
  /* The same park, reached the same way. These two DO have a `city`, so they
   * were already in the mapping and are not part of the eight — but Kinigi
   * (One&Only Gorilla's Nest) and Ruhengeri (Wilderness Bisate) both carry
   * area "Volcanoes National Park", i.e. they are Singita Kwitonda's
   * neighbours. Fixing only Kwitonda would have left three lodges in one park
   * with two different answers, one of them a Ugandan airstrip. */
  "Kinigi": ["KGL"],
  "Ruhengeri": ["KGL"],
};


const MAX_RADIUS_KM = 400;
const FAVORITE_RATIO = 1.5;
const MAX_HUBS = 3;

async function fetchHotels() {
  const res = await fetch(
    `${DIRECTUS_URL}/items/hotels?fields=id,hotel_name,city,country,state_province_county_island,lat,lng&filter[published][_eq]=true&limit=-1`,
    { headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` } }
  );
  if (!res.ok) throw new Error(`Directus fetch failed: ${res.status}`);
  const json = await res.json();
  return json.data ?? [];
}

async function ensureCsv(filePath, url) {
  if (fs.existsSync(filePath)) return;
  console.log(`Downloading ${path.basename(filePath)} from OurAirports...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${path.basename(filePath)}: ${res.status}`);
  fs.writeFileSync(filePath, await res.text());
}

async function ensureAirportsCsv() {
  await ensureCsv(AIRPORTS_CSV_PATH, AIRPORTS_CSV_URL);
  await ensureCsv(RUNWAYS_CSV_PATH, RUNWAYS_CSV_URL);
}

// Total paved runway length per airport, in metres.
//
// OurAirports' `type` field is far too coarse to answer "which is the main
// airport for this city" - all three New York airports are `large_airport`,
// as are all six London ones. Total runway length is the best size proxy
// available in this dataset and gets the expected answer in every case
// checked (JFK over LGA/EWR, Heathrow over the other five, CDG over Orly,
// Malpensa over Linate).
function loadRunwayLengths() {
  const rows = parseCsv(fs.readFileSync(RUNWAYS_CSV_PATH, "utf8"));
  const header = rows[0];
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const byIdent = new Map();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < header.length) continue;
    if (r[idx.closed] === "1") continue;
    const ident = r[idx.airport_ident];
    const ft = parseFloat(r[idx.length_ft]);
    if (!ident || !Number.isFinite(ft) || ft <= 0) continue;
    byIdent.set(ident, (byIdent.get(ident) ?? 0) + Math.round(ft * 0.3048));
  }
  return byIdent;
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
  const runwayLengths = loadRunwayLengths();
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
      runwayM: runwayLengths.get(r[idx.ident]) ?? 0,
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

function sizeClass(type) {
  if (type === "large_airport") return "large";
  if (type === "medium_airport") return "medium";
  return "small";
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

  /* Group by `city`, falling back to the TRAVELLER AREA when a hotel has no
   * city at all.
   *
   * Eight published hotels are in that position and every one is a wilderness
   * lodge whose reserve name lives in `state_province_county_island` instead —
   * the five Kenyan camps in the Masai Mara and Amboseli, Singita Kwitonda in
   * Volcanoes National Park, Six Senses Shaharut in the Negev and Clayoquot on
   * Vancouver Island. §3 tolerates the blank `city`, and it stays blank.
   *
   * This used to read `if (!city) continue`, which dropped all eight SILENTLY:
   * they keyed to nothing here, so the landing flight teaser resolved them to
   * no airport. Falling back to the area is enough on its own because
   * `getAirportsForCity` is a plain case-insensitive string lookup and the
   * destination dropdown already searches areas (§3) — "Masai Mara" as a key
   * is reachable by exactly the search a visitor would run, so no consumer
   * needed changing. */
  const groups = new Map();
  let areaKeyed = 0;
  for (const h of hotels) {
    const city = (h.city || "").trim();
    const area = (h.state_province_county_island || "").trim();
    const name = city || area;
    if (!name) continue;
    if (!city) areaKeyed += 1;
    const country = (h.country || "").trim();
    const key = name + "|||" + country;
    if (!groups.has(key)) groups.set(key, { city: name, hotels: [] });
    groups.get(key).hotels.push(h);
  }
  if (areaKeyed) console.log(`${areaKeyed} hotels keyed by traveller area (no city).`);

  const results = [];
  for (const g of groups.values()) {
    const lats = g.hotels.map((h) => Number(h.lat)).filter(Number.isFinite);
    const lons = g.hotels.map((h) => Number(h.lng)).filter(Number.isFinite);
    if (!lats.length) continue;
    const centroidLat = lats.reduce((a, b) => a + b, 0) / lats.length;
    const centroidLon = lons.reduce((a, b) => a + b, 0) / lons.length;
    const chosen = selectAirports(centroidLat, centroidLon, normalize(g.city), airports);
    /* An override returns the SAME SHAPE selectAirports does — the raw airport
     * record plus distKm — because the emit step below reads a.name/a.type off
     * it. Building a pre-formatted object here instead threw at emit time. */
    const override = GATEWAY_OVERRIDE[g.city];
    let finalAirports = chosen;
    if (override) {
      finalAirports = override.map((iata) => {
        const a = airports.find((x) => x.iata === iata);
        if (!a) throw new Error(`GATEWAY_OVERRIDE names ${iata} for ${g.city}, which is not in the dataset`);
        return { ...a, distKm: haversineKm(centroidLat, centroidLon, a.lat, a.lon) };
      });
      console.log(`  gateway override: ${g.city} -> ${finalAirports.map((a) => `${a.iata} ${Math.round(a.distKm)}km`).join(", ")}`);
    }
    results.push({ city: g.city, airports: finalAirports });
  }
  results.sort((a, b) => a.city.localeCompare(b.city));

  let out = `// AUTO-GENERATED by scripts/airports/build-city-airports.mjs — do not
// hand-edit. Re-run that script to regenerate. See its header comment and
// CLAUDE.md for the nearest-airport selection rule and known limitations.

export type CityAirport = {
  iata: string;
  label: string;
  distKm: number;
  /** OurAirports' size class. */
  size: "large" | "medium" | "small";
  /** Total open runway length in metres - the finer size signal. \`size\` alone
   * can't separate a city's airports (all three New York ones and all six
   * London ones are "large"). Entries stay ordered nearest-first (that is the
   * selection rule), so anything wanting the main gateway for a city rather
   * than the closest strip must sort on these - see pickPrimaryAirportForCity. */
  runwayM: number;
};

export const CITY_AIRPORTS: Record<string, CityAirport[]> = {
`;
  for (const r of results) {
    const entries = r.airports
      .map(
        (a) =>
          `    { iata: ${JSON.stringify(a.iata)}, label: ${JSON.stringify(
            cleanAirportLabel(a.name)
          )}, distKm: ${Math.round(a.distKm)}, size: ${JSON.stringify(
            sizeClass(a.type)
          )}, runwayM: ${a.runwayM} }`
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

const SIZE_ORDER: Record<CityAirport["size"], number> = { large: 0, medium: 1, small: 2 };

/** The single airport to preselect when something needs one code for a city
 * (e.g. the Flights page resolving a destination handed over from Hotels).
 * Favours the biggest airport, not the closest: New York's nearest to the
 * hotel centroid is LaGuardia, but the gateway a traveller expects is JFK.
 * Distance only breaks ties. */
export function pickPrimaryAirportForCity(city: string): CityAirport | null {
  const airports = getAirportsForCity(city);
  if (airports.length === 0) return null;
  return [...airports].sort(
    (a, b) =>
      SIZE_ORDER[a.size] - SIZE_ORDER[b.size] ||
      b.runwayM - a.runwayM ||
      a.distKm - b.distKm
  )[0];
}

const IATA_TO_CITY: Record<string, string> = (() => {
  // Nearest wins, not first-seen. Several cities can list the same airport -
  // Heathrow is a "nearest airport" for London (13km) but also for Eynsham
  // Park (77km), Sunningdale and Hampshire - and object key order is
  // alphabetical, so first-seen resolved LHR to "Eynsham Park". That name
  // then surfaced as "Flights from Eynsham Park" on the landing page and as
  // the Flights page route header.
  // Rank: a city named in the airport's own label wins ("London Heathrow" ->
  // London), then nearest. Nearest alone is not enough - Heathrow's centroid
  // is 13km from Sunningdale and 22km from London, so pure distance answers
  // "Sunningdale", and first-seen (the original) answered "Eynsham Park"
  // because object keys are alphabetical. Both surfaced to users as "Flights
  // from Eynsham Park" and as the Flights page route header.
  const best: Record<string, { city: string; distKm: number; named: boolean }> = {};
  for (const [city, airports] of Object.entries(CITY_AIRPORTS)) {
    for (const airport of airports) {
      const named = airport.label.toLowerCase().includes(city.toLowerCase());
      const current = best[airport.iata];
      const better =
        !current ||
        (named && !current.named) ||
        (named === current.named && airport.distKm < current.distKm);
      if (better) best[airport.iata] = { city, distKm: airport.distKm, named };
    }
  }
  const map: Record<string, string> = {};
  for (const [iata, entry] of Object.entries(best)) map[iata] = entry.city;
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
