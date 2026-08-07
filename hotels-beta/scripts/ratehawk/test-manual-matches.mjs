// Test user-supplied alternate hotel names/addresses (found manually on
// Ratehawk's public site) against the country-filtered Ratehawk dump, to see
// if we can locate the corresponding hid. Country is still the hard filter
// (pulled fresh per oltra_id from oltra_hotels.json); name+address text is
// scored against Ratehawk's name/city/address fields.
//
// Usage (from hotels-beta/):
//   node scripts/ratehawk/test-manual-matches.mjs

import fs from "fs";
import fsp from "fs/promises";
import readline from "readline";

const oltraHotels = JSON.parse(
  await fsp.readFile("scripts/ratehawk/output/oltra_hotels.json", "utf8")
);
const oltraById = new Map(oltraHotels.map((h) => [h.id, h]));

// [oltra_id, altName, altAddress]
const TARGETS = [
  ["1192", "137 Pillars Suites & Residences Hotel", "59/1 Sukhumvit Soi 39, Khongton-Nua, Bangkok"],
  ["1384", "Belvedere Hotel - The Leading Hotels of the World", "School of Fine Arts District, Mykonos"],
  ["1713", "Biltmore Hotel - Miami - Coral Gables", "1200 Anastasia Ave, Coral Gables"],
  ["1077", "Bvlgari Hotel Beijing", ""],
  ["1283", "Bvlgari Hotel London", ""],
  ["1430", "Bvlgari Hotel Milano", ""],
  ["1318", "Bvlgari Hotel Paris", ""],
  ["1137", "Bvlgari Hotel Tokyo", ""],
  ["1431", "Bvlgari Roma Hotel", ""],
  ["1426", "Caruso, A Belmond Hotel, Amalfi Coast", "Piazza San Giovanni Del Toro 2, Ravello"],
  ["1779", "Copacabana Palace, A Belmond Hotel, Rio de Janeiro", "Avenida Atlantica 1702, Rio de Janeiro"],
  ["1270", "Gasthof Post", "Dorf 11, Lech"],
  ["1452", "Hotel Eden - Dorchester Collection", "Via Ludovisi 49, Rom"],
  ["1637", "Maroma, A Belmond Hotel, Riviera Maya Hotel", "Carret. Fed. 307 Km. 51, Puerto Morelos"],
  ["1251", "Rosewood Le Guanahani St Barth", "Grand Cul De Sac, Gustavia"],
  ["1475", "San Domenico Palace, Taormina, A Four Seasons Hotel", "Piazza San Domenico, 5, Taormina"],
  ["1715", "The Breakers Palm Beach", "One South County Road, Palm Beach"],
  ["1479", "The Gritti Palace, a Luxury Collection Hotel, Venice", "Campo Santa Maria Del Giglio 2467, Venedig"],
  ["1730", "The Liberty, a Marriott Luxury Collection Hotel, Boston", "215 Charles St, Boston"],
  ["1737", "The Ocean Club, A Four Seasons Resort, Bahamas", "One Ocean Drive, Paradise Island"],
  ["2062", "The Palace, a Luxury Collection Hotel", "Plaza de las Cortes, 7, Madrid"],
  ["1100", "The Ritz-Carlton Shanghai, Pudong", "Shanghai IFC, 8 Century Avenue, Lujiazui, Pudong, Shanghai"],
  ["1756", "The Sanctuary at Kiawah Island Golf Resort", "1 Sanctuary Beach Drive, Kiawah Island"],
  ["1002", "Wilderness Mombo Camp", "Okavango Delta Moremi Game Reserve, Okavango Delta"],
  ["1772", "Williamsburg Inn, an official Colonial Williamsburg Hotel", "136 East Francis Street, Williamsburg"],
  ["1029", "Zannier Omaanda", "Farm No. 78, Rest of Ondekaremba Farm, Windhoek"],
  ["1030", "Zannier Sonop", "Sonop Farm, Road D707, Karas Region, Spes Bona"],
];

const SPECIAL = [
  ["1108", "Evolve Back Kamalapura Palace", "Unpublish"],
  ["1080", "Regent Shanghai", "Unpublish"],
  ["1449", "Caruso (Ravello)", "Double entry in Directus"],
];

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
    .replace(/\bofficial\b/g, " ")
    .replace(/\bthe\b/g, " ")
    .replace(/\ba\b/g, " ")
    .replace(/\ban\b/g, " ")
    .replace(/\band\b/g, " ")
    .replace(/\bby\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeName(value) {
  let s = normalizeText(value);
  s = s.replace(/\bbulgari\b/g, "bvlgari");
  s = s.replace(/\band beyond\b/g, "andbeyond");
  s = s.replace(/\bst\b/g, "saint");
  return removeGenericHotelWords(s);
}

function tokens(s) {
  return s ? s.split(" ").filter(Boolean) : [];
}
function tokenSet(s) {
  return new Set(tokens(s));
}
function overlapScore(a, b) {
  const A = tokenSet(a);
  const B = tokenSet(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return new Set([...A, ...B]).size ? inter / new Set([...A, ...B]).size : 0;
}

const targetsByCountry = new Map();
for (const [oltraId, altName, altAddress] of TARGETS) {
  const oltra = oltraById.get(oltraId);
  if (!oltra) {
    console.warn(`WARNING: oltra_id ${oltraId} not found in oltra_hotels.json`);
    continue;
  }
  const entry = {
    oltraId,
    oltraHotelName: oltra.hotel_name,
    country: oltra.country,
    altName,
    altAddress,
    normAltName: normalizeName(altName),
    normAltAddress: normalizeText(altAddress),
    best: [],
  };
  const key = oltra.country;
  if (!targetsByCountry.has(key)) targetsByCountry.set(key, []);
  targetsByCountry.get(key).push(entry);
}

console.log(`Testing ${TARGETS.length} manual leads across ${targetsByCountry.size} countries...`);

const rl = readline.createInterface({
  input: fs.createReadStream("scripts/ratehawk/output/filtered-hotels.jsonl"),
  crlfDelay: Infinity,
});

let rowCount = 0;
for await (const line of rl) {
  if (!line.trim()) continue;
  rowCount++;
  if (rowCount % 1000000 === 0) console.log(`...${rowCount} rows scanned`);

  let obj;
  try {
    obj = JSON.parse(line);
  } catch {
    continue;
  }

  const candidates = targetsByCountry.get(obj.country);
  if (!candidates || !candidates.length) continue;

  const normRhName = normalizeName(obj.name || "");
  const normRhAddress = normalizeText(obj.address || "");
  const normRhCity = normalizeText(obj.city || "");

  for (const entry of candidates) {
    const nameScore = overlapScore(entry.normAltName, normRhName);
    let addrScore = 0;
    if (entry.normAltAddress) {
      addrScore = Math.max(
        overlapScore(entry.normAltAddress, normRhAddress),
        overlapScore(entry.normAltAddress, normRhCity)
      );
    }
    const score = nameScore * 80 + addrScore * 30;
    if (score < 25) continue;

    entry.best.push({
      hid: obj.hid,
      name: obj.name,
      city: obj.city,
      country: obj.country,
      address: obj.address,
      score: Number(score.toFixed(2)),
    });
    entry.best.sort((a, b) => b.score - a.score);
    if (entry.best.length > 3) entry.best.length = 3;
  }
}

console.log(`Done scanning ${rowCount} rows.\n`);

const report = [];
for (const [, entries] of targetsByCountry) {
  for (const entry of entries) {
    report.push({
      oltra_id: entry.oltraId,
      oltra_hotel_name: entry.oltraHotelName,
      alt_name_tested: entry.altName,
      alt_address_tested: entry.altAddress,
      candidates: entry.best,
    });
  }
}
report.sort((a, b) => a.oltra_hotel_name.localeCompare(b.oltra_hotel_name));

for (const row of report) {
  console.log(`--- ${row.oltra_hotel_name} (id ${row.oltra_id}) ---`);
  console.log(`    tested: "${row.alt_name_tested}" / "${row.alt_address_tested}"`);
  if (!row.candidates.length) {
    console.log("    NO MATCH FOUND");
  } else {
    for (const c of row.candidates) {
      console.log(`    -> ${c.name} | ${c.city}, ${c.country} | hid ${c.hid} | score ${c.score} | ${c.address || ""}`);
    }
  }
}

await fsp.writeFile(
  "scripts/ratehawk/output/manual_match_test_results.json",
  JSON.stringify(report, null, 2),
  "utf8"
);
console.log(`\nWrote scripts/ratehawk/output/manual_match_test_results.json`);
