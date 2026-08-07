#!/usr/bin/env node
// Match the OLTRA hotels collection (scripts/ratehawk/output/oltra_hotels.json,
// ~871 rows) against the country-filtered Ratehawk dump
// (scripts/ratehawk/output/filtered-hotels.jsonl, ~2.95M rows) — no Directus
// writes, output is a review report only (see CLAUDE.md §26).
//
// Country is a hard filter (filtered-hotels.jsonl already carries the exact
// OLTRA country string via country-map.mjs, so this is an exact-string group,
// not fuzzy). City/region is deliberately NOT a filter — Ratehawk's `city`
// field is actually `region.name`, which can be a broader area than OLTRA's
// `city`, so it is only ever a soft scoring bonus. Name matching strips
// generic hospitality words (hotel/resort/spa/villa/...) and brand-name
// containment is scored via token-set overlap, mirroring the approach in
// scripts/agoda/match-agoda-hotels.mjs and the CONFIRMED/NEAR/UNCERTAIN
// tiering in scripts/hotels/new-hotels-2026/match-hotel-awards.mjs.
//
// Usage (from hotels-beta/):
//   node scripts/ratehawk/match-ratehawk-hotels.mjs
//   ... --oltra scripts/ratehawk/output/oltra_hotels.json   (default)
//   ... --ratehawk scripts/ratehawk/output/filtered-hotels.jsonl  (default)
//   ... --outdir scripts/ratehawk/output   (default)

import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import readline from "readline";

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      out[key] = value;
    }
  }
  return out;
}

const args = parseArgs(process.argv);
const oltraPath = args.oltra || "scripts/ratehawk/output/oltra_hotels.json";
const ratehawkPath = args.ratehawk || "scripts/ratehawk/output/filtered-hotels.jsonl";
const outDir = args.outdir || "scripts/ratehawk/output";

await fsp.mkdir(outDir, { recursive: true });

// ---------- normalization (same core approach as match-agoda-hotels.mjs) ----------

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

function normalizeCity(value) {
  let s = normalizeText(value);
  s = s.replace(/\bst\b/g, "saint");
  return s.trim();
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
  s = s.replace(/\band beyond\b/g, "andbeyond");
  s = s.replace(/\b1 hotel\b/g, "1hotel");
  s = s.replace(/\bst\b/g, "saint");
  return removeGenericHotelWords(s);
}

function tokens(s) {
  if (!s) return [];
  return s.split(" ").filter(Boolean);
}

function tokenSet(s) {
  return new Set(tokens(s));
}

function overlapScore(a, b) {
  if (!a || !b) return 0;
  const A = tokenSet(a);
  const B = tokenSet(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = new Set([...A, ...B]).size;
  return union ? inter / union : 0;
}

// Brand-prefix-agnostic containment: the smaller token set is fully contained
// in the larger one (e.g. "tamarindo" ⊂ "four seasons resort tamarindo").
// Requires >=2 tokens in the smaller set to avoid one-word false positives.
function containmentScore(a, b) {
  const A = tokenSet(a);
  const B = tokenSet(b);
  if (!A.size || !B.size) return 0;
  const [small, big] = A.size <= B.size ? [A, B] : [B, A];
  if (small.size < 2) return 0;
  for (const t of small) if (!big.has(t)) return 0;
  return 1;
}

function containsRareToken(a, b) {
  const A = tokens(a).filter((t) => t.length >= 5);
  const B = new Set(tokens(b));
  return A.some((t) => B.has(t));
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

// ---------- load & prep OLTRA hotels ----------

const oltraRaw = JSON.parse(await fsp.readFile(oltraPath, "utf8"));

function cleanOltraRow(r) {
  const cityRaw = r.city || r.local_area || r.state_province_county_island || r.region || "";
  return {
    id: r.id ?? "",
    hotel_name: r.hotel_name ?? "",
    city: r.city ?? "",
    country: r.country ?? "",
    lat: r.lat != null ? Number(r.lat) : null,
    lng: r.lng != null ? Number(r.lng) : null,
    normCountry: r.country ?? "",
    normCity: normalizeCity(cityRaw),
    normName: normalizeName(r.hotel_name || "")
  };
}

const oltra = oltraRaw.map(cleanOltraRow);

const oltraByCountry = new Map();
for (const row of oltra) {
  const key = row.normCountry || "__missing__";
  if (!oltraByCountry.has(key)) oltraByCountry.set(key, []);
  oltraByCountry.get(key).push(row);
}

console.log(`Loaded ${oltra.length} OLTRA hotels across ${oltraByCountry.size} countries.`);

// ---------- scoring ----------

function scoreCandidate(oltraRow, rhRow) {
  let score = 0;
  const notes = [];

  const nameOverlap = overlapScore(oltraRow.normName, rhRow.normName);
  score += nameOverlap * 60;
  if (nameOverlap >= 0.9) notes.push("very strong name overlap");
  else if (nameOverlap >= 0.7) notes.push("strong name overlap");
  else if (nameOverlap >= 0.4) notes.push("moderate name overlap");

  const containment = containmentScore(oltraRow.normName, rhRow.normName);
  if (containment) {
    score += 20;
    notes.push("brand-prefix containment");
  }

  if (containsRareToken(oltraRow.normName, rhRow.normName)) {
    score += 8;
    notes.push("rare token overlap");
  }

  // country is already a hard filter (exact match by construction), so it's
  // not scored here — only city/region and distance discriminate within it.
  if (oltraRow.normCity && rhRow.normCity) {
    if (oltraRow.normCity === rhRow.normCity) {
      score += 12;
      notes.push("city/region match");
    } else if (
      oltraRow.normCity.includes(rhRow.normCity) ||
      rhRow.normCity.includes(oltraRow.normCity)
    ) {
      score += 6;
      notes.push("city/region partial");
    }
  }

  const distKm = haversineKm(oltraRow.lat, oltraRow.lng, rhRow.latitude, rhRow.longitude);
  if (distKm != null) {
    if (distKm <= 1) {
      score += 15;
      notes.push(`~${distKm.toFixed(2)}km apart`);
    } else if (distKm <= 5) {
      score += 8;
      notes.push(`~${distKm.toFixed(1)}km apart`);
    } else if (distKm <= 25) {
      score += 2;
      notes.push(`~${distKm.toFixed(0)}km apart`);
    } else if (distKm > 100) {
      score -= 10;
      notes.push(`${distKm.toFixed(0)}km apart (far)`);
    }
  }

  return { score, notes: notes.join("; "), distKm };
}

function classify(best, second) {
  if (!best || best.score < 40) return "NO_MATCH";
  const gap = second ? best.score - second.score : Infinity;
  if (best.score >= 85 && gap >= 15) return "CONFIRMED";
  if (best.score >= 60 && gap >= 8) return "LIKELY";
  return "QUESTIONABLE";
}

// ---------- stream the Ratehawk filtered dump ----------

const bestByOltraId = new Map();
let rowCount = 0;
let candidateRowCount = 0;

const rl = readline.createInterface({
  input: fs.createReadStream(ratehawkPath),
  crlfDelay: Infinity
});

for await (const line of rl) {
  if (!line.trim()) continue;
  rowCount++;
  if (rowCount % 500000 === 0) {
    console.log(`Processed Ratehawk rows: ${rowCount} (candidates scored: ${candidateRowCount})`);
  }

  let obj;
  try {
    obj = JSON.parse(line);
  } catch {
    continue;
  }

  const candidates = oltraByCountry.get(obj.country);
  if (!candidates || !candidates.length) continue;

  const rhRow = {
    hid: obj.hid,
    id: obj.id,
    name: obj.name,
    city: obj.city,
    country: obj.country,
    country_code: obj.country_code,
    latitude: obj.latitude != null ? Number(obj.latitude) : null,
    longitude: obj.longitude != null ? Number(obj.longitude) : null,
    star_rating: obj.star_rating,
    kind: obj.kind,
    address: obj.address,
    normName: normalizeName(obj.name || ""),
    normCity: normalizeCity(obj.city || "")
  };

  for (const o of candidates) {
    const scored = scoreCandidate(o, rhRow);
    if (scored.score < 20) continue; // not worth keeping as a candidate at all
    candidateRowCount++;

    const prev = bestByOltraId.get(o.id) || [];
    prev.push({
      ratehawk_hid: rhRow.hid,
      ratehawk_id: rhRow.id,
      ratehawk_name: rhRow.name,
      ratehawk_city: rhRow.city,
      ratehawk_country: rhRow.country,
      ratehawk_star_rating: rhRow.star_rating,
      ratehawk_kind: rhRow.kind,
      ratehawk_address: rhRow.address,
      ratehawk_lat: rhRow.latitude,
      ratehawk_lng: rhRow.longitude,
      score: Number(scored.score.toFixed(2)),
      notes: scored.notes,
      dist_km: scored.distKm != null ? Number(scored.distKm.toFixed(2)) : null
    });
    prev.sort((a, b) => b.score - a.score);
    bestByOltraId.set(o.id, prev.slice(0, 3));
  }
}

console.log(`Done streaming. Total Ratehawk rows: ${rowCount}`);

// ---------- assemble results ----------

const results = [];

for (const o of oltra) {
  const top = bestByOltraId.get(o.id) || [];
  const [best, second, third] = top;
  const status = classify(best, second);

  results.push({
    oltra_id: o.id,
    oltra_hotel_name: o.hotel_name,
    oltra_city: o.city,
    oltra_country: o.country,
    oltra_lat: o.lat,
    oltra_lng: o.lng,
    status,
    candidates: top // up to 3, best first
  });
}

const summary = {
  total_oltra_hotels: results.length,
  confirmed: results.filter((r) => r.status === "CONFIRMED").length,
  likely: results.filter((r) => r.status === "LIKELY").length,
  questionable: results.filter((r) => r.status === "QUESTIONABLE").length,
  no_match: results.filter((r) => r.status === "NO_MATCH").length,
  ratehawk_rows_processed: rowCount
};

await fsp.writeFile(
  path.join(outDir, "ratehawk_match_results.json"),
  JSON.stringify(results, null, 2),
  "utf8"
);
await fsp.writeFile(
  path.join(outDir, "ratehawk_match_summary.json"),
  JSON.stringify(summary, null, 2),
  "utf8"
);

console.log(summary);
console.log(`Done:
- ${path.join(outDir, "ratehawk_match_results.json")}
- ${path.join(outDir, "ratehawk_match_summary.json")}`);
