// Regenerates src/lib/airportOptions.ts — the full selectable-airport list
// backing the Flights page's From/To autocomplete and the landing page's
// home-airport picker.
//
// Usage (from hotels-beta/):
//   node scripts/airports/build-airport-options.mjs
//
// No Directus credentials needed (unlike build-city-airports.mjs) — this
// only reads the OurAirports dataset.
//
// WHY THIS IS GENERATED, NOT HAND-WRITTEN
// ---------------------------------------
// airportOptions.ts used to be a hand-curated ~70-entry list of "airports we
// happen to care about". That made airports silently unselectable: the
// landing page offered 3 airports for New York (from cityAirports.ts, which
// IS generated from OurAirports) while the Flights page's autocomplete only
// knew 2 of them, because LGA had never been typed into the manual list.
// Any destination whose nearest airport wasn't in the manual 70 had the same
// problem, domestic/regional airports most of all.
//
// Both files are now generated from the same source with the same filters,
// so the two can no longer disagree about which airports exist. Keep the
// filter constants below in sync with build-city-airports.mjs — they are
// deliberately identical (scheduled_service == "yes", no heliports/seaplane
// bases/closed fields, same manual business-aviation exclusions).
//
// Duffel searches by IATA code and covers scheduled commercial service
// worldwide, so "has a IATA code and real scheduled service" is the right
// selectable-airport definition here. There is no Duffel-published airport
// list to diff against; OurAirports' scheduled_service flag is the proxy.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const OUTPUT_PATH = path.join(REPO_ROOT, "src", "lib", "airportOptions.ts");
const AIRPORTS_CSV_PATH = path.join(__dirname, "airports.csv");
const AIRPORTS_CSV_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv";
const RUNWAYS_CSV_PATH = path.join(__dirname, "runways.csv");
const RUNWAYS_CSV_URL = "https://davidmegginson.github.io/ourairports-data/runways.csv";

// Keep identical to build-city-airports.mjs.
const MANUAL_EXCLUDE_IATA = new Set([
  "TEB", // Teterboro (NYC) — business aviation only
  "LBG", // Paris-Le Bourget — business aviation / air show venue
  "OPF", // Miami-Opa Locka Executive — business aviation only
]);
const EXCLUDED_TYPES = new Set(["heliport", "seaplane_base", "closed", "balloonport"]);

// Autocomplete shows only the first 8 matches, so ordering decides what a
// user actually sees when typing "lon" or "san". Bigger airports first, then
// by total runway length (see loadRunwayLengths).
const TYPE_RANK = { large_airport: 0, medium_airport: 1, small_airport: 2 };

async function ensureCsv(filePath, url) {
  if (fs.existsSync(filePath)) return;
  console.log(`Downloading ${path.basename(filePath)} from OurAirports...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${path.basename(filePath)}: ${res.status}`);
  fs.writeFileSync(filePath, await res.text());
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

function normalize(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Same cleanup as build-city-airports.mjs' cleanAirportLabel: strip the
// generic suffixes every airport name carries so the label reads as a place,
// not a formal registry entry.
function cleanAirportName(name) {
  let n = (name || "").replace(/[–—]/g, "-");
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
  return n || (name || "").trim();
}

// OurAirports' `municipality` is an administrative field, not a display one:
// CDG's is "Paris (Roissy-en-France, Val-d'Oise)", Stansted's is
// "London, Essex". Strip parentheticals and anything past the first comma.
// Note this cannot fix every case — Milan Malpensa's municipality is the
// village it sits in ("Ferno"), not Milan. That's why the airport's own name
// stays the primary part of the label and the city is only a suffix.
function cleanMunicipality(municipality) {
  return (municipality || "")
    .replace(/\([^)]*\)/g, "")
    .split(",")[0]
    .replace(/\s{2,}/g, " ")
    .trim();
}

function nameContainsCity(cleanName, city) {
  if (!city || !cleanName) return false;
  const cityNorm = normalize(city);
  const nameNorm = normalize(cleanName);
  if (!cityNorm) return false;
  return (
    nameNorm === cityNorm ||
    nameNorm.startsWith(cityNorm + " ") ||
    nameNorm.includes(" " + cityNorm + " ") ||
    nameNorm.endsWith(" " + cityNorm)
  );
}

// Total open runway length per airport ident, in metres — the same size proxy
// build-city-airports.mjs uses. `type` alone can't rank a city's own airports
// (all six London ones are "large_airport"), and the autocomplete only shows
// 8 matches, so typing "lon" must surface Heathrow, not London City.
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

async function main() {
  await ensureCsv(AIRPORTS_CSV_PATH, AIRPORTS_CSV_URL);
  await ensureCsv(RUNWAYS_CSV_PATH, RUNWAYS_CSV_URL);

  const runwayLengths = loadRunwayLengths();
  const csvRows = parseCsv(fs.readFileSync(AIRPORTS_CSV_PATH, "utf8"));
  const header = csvRows[0];
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));

  const byIata = new Map();

  for (let i = 1; i < csvRows.length; i++) {
    const r = csvRows[i];
    if (!r || r.length < header.length) continue;

    const iata = (r[idx.iata_code] || "").trim().toUpperCase();
    if (!iata || iata.length !== 3) continue;
    if (r[idx.scheduled_service] !== "yes") continue;
    const type = r[idx.type];
    if (EXCLUDED_TYPES.has(type)) continue;
    if (MANUAL_EXCLUDE_IATA.has(iata)) continue;

    const city = cleanMunicipality(r[idx.municipality]);
    const country = (r[idx.iso_country] || "").trim().toUpperCase();
    const cleanName = cleanAirportName(r[idx.name]);

    // "JFK · John F. Kennedy, New York, US" — the city is appended only when
    // the airport's own name doesn't already carry it, so "LHR · London
    // Heathrow, GB" doesn't stutter. Both parts are searchable.
    const parts = [cleanName || city];
    if (city && !nameContainsCity(cleanName, city)) parts.push(city);
    if (country) parts.push(country);

    const candidate = {
      value: iata,
      label: `${iata} · ${parts.join(", ")}`,
      city: city || cleanName,
      rank: TYPE_RANK[type] ?? 3,
      runwayM: runwayLengths.get(r[idx.ident]) ?? 0,
    };

    // IATA codes are unique in practice, but the raw dataset does carry the
    // odd duplicate — keep the larger airport rather than whichever row came
    // last in file order.
    const existing = byIata.get(iata);
    if (!existing || candidate.rank < existing.rank) byIata.set(iata, candidate);
  }

  const options = [...byIata.values()].sort(
    (a, b) => a.rank - b.rank || b.runwayM - a.runwayM || a.label.localeCompare(b.label)
  );

  const counts = options.reduce((acc, o) => {
    acc[o.rank] = (acc[o.rank] ?? 0) + 1;
    return acc;
  }, {});

  let out = `// AUTO-GENERATED by scripts/airports/build-airport-options.mjs — do not
// hand-edit. Re-run that script to regenerate.
//
// Every airport with a IATA code and real scheduled commercial service, from
// the same OurAirports dataset (and the same filters) that cityAirports.ts is
// built from — so the airports the landing page offers for a destination are
// always selectable on the Flights page too. Ordered large -> medium -> small
// airport, because the autocomplete only shows the first 8 matches.
//
// This module is deliberately imported dynamically (see AirportAutocomplete) -
// it is ~300KB of source and nothing needs it during first paint. Keep it free
// of helpers that would tempt a static import back in.

export type AirportOption = {
  value: string;
  /** "JFK · New York John F Kennedy, US" — display only. Never parse a city
   * out of this; use \`city\` (or getCityForAirportIata) instead. */
  label: string;
  /** The airport's own municipality. Not necessarily an OLTRA hotel city —
   * for that mapping use getCityForAirportIata() in cityAirports.ts. */
  city: string;
};

export const AIRPORT_OPTIONS: AirportOption[] = [
`;

  for (const o of options) {
    out += `  { value: ${JSON.stringify(o.value)}, label: ${JSON.stringify(o.label)}, city: ${JSON.stringify(o.city)} },\n`;
  }

  out += `];
`;

  fs.writeFileSync(OUTPUT_PATH, out);
  console.log(
    `Wrote ${OUTPUT_PATH} — ${options.length} airports ` +
      `(large ${counts[0] ?? 0}, medium ${counts[1] ?? 0}, small ${counts[2] ?? 0}, other ${counts[3] ?? 0}), ` +
      `${(fs.statSync(OUTPUT_PATH).size / 1024).toFixed(0)} KB.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
