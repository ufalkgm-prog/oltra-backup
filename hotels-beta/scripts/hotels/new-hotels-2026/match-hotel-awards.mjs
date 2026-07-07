#!/usr/bin/env node
/**
 * Match the 67 new hotels (IDs 2001-2067) against the 7 award source lists in
 * awards-2026/*.json, and produce a plain-text review report — no Directus writes.
 *
 * Matching strategy:
 *   1. Normalize names (strip diacritics/punctuation/case) and compare full strings.
 *      An exact normalized match, with no country conflict, is CONFIRMED.
 *   2. Otherwise fall back to token-overlap (Jaccard) scoring. This is only trusted
 *      as a candidate ("uncertain", needs human review) when location corroborates
 *      it (country match, or country missing on the source side) — chain brands
 *      (Mandarin Oriental, Ritz-Carlton, Four Seasons, ...) repeat the same words
 *      across many cities, so name similarity alone is not trustworthy for them.
 *   3. Existing DB awards (boolean already true / awards tag already set) with no
 *      corresponding source-list entry at all are flagged separately for review —
 *      they may be correct from another source, or may need removing.
 *
 * Usage (from hotels-beta/):
 *   DIRECTUS_URL=... DIRECTUS_TOKEN=... node scripts/hotels/new-hotels-2026/match-hotel-awards.mjs
 *   ... --out <path>            (defaults to award-review-2026-07-07.txt in this folder)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AWARDS_DIR = path.join(__dirname, "awards-2026");

const DIRECTUS_URL = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;

if (!DIRECTUS_URL) throw new Error("Missing env DIRECTUS_URL");
if (!DIRECTUS_TOKEN) throw new Error("Missing env DIRECTUS_TOKEN");

// award code -> exact Directus `awards` tag-field display string (taxonomy-reference.md)
const AWARD_DISPLAY = {
  michelin3keys: "Michelin 3 Keys",
  aaa5d: "AAA/CAA Five Diamond Hotels",
  cn: "Conde Nast Gold List",
  best50: "The World's 50 Best Hotels",
  forbes5: "Forbes 5 Star",
  tl100: "Travel + Leisure 100",
  telegraph: "Telegraph Best Hotels in the World",
};

const AWARD_CODES = Object.keys(AWARD_DISPLAY);

const COUNTRY_ALIASES = {
  usa: "united states",
  "us": "united states",
  "united states of america": "united states",
  uk: "united kingdom",
  england: "united kingdom",
  scotland: "united kingdom",
  wales: "united kingdom",
  "northern ireland": "united kingdom",
  uae: "united arab emirates",
  "south korea": "korea",
  "republic of korea": "korea",
  turkiye: "turkey",
  türkiye: "turkey",
};

function normalizeLoose(value) {
  if (value == null) return "";
  return String(value)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCountry(value) {
  const n = normalizeLoose(value);
  return COUNTRY_ALIASES[n] || n;
}

const STOPWORDS = new Set(["a", "an", "the", "of", "de", "di", "la", "le", "du", "des", "and"]);
// Generic hospitality descriptors stripped both for brand-similarity scoring and for the
// "core name" exact-match check — otherwise "Four Seasons Resort Tamarindo" (our DB) never
// lines up with "Four Seasons Tamarindo" (source list) just because of the word "resort".
const GENERIC_DESCRIPTORS = new Set(["hotel", "hotels", "resort", "resorts", "spa", "spas"]);

function tokenize(value) {
  return normalizeLoose(value).split(" ").filter((t) => t && !STOPWORDS.has(t));
}

function brandTokens(value, locTokens) {
  const locSet = new Set(locTokens);
  return tokenize(value).filter((t) => !GENERIC_DESCRIPTORS.has(t) && !locSet.has(t));
}

// Core name = hotel name with generic hospitality words stripped, but location words KEPT.
// Used for an exact-match check that's more lenient than raw full-string equality but still
// strict enough that a match here is a strong signal (unlike the brand-token jaccard score,
// which strips location words too and needs corroboration to be trustworthy).
// Sorted (order-insensitive) because some award lists reorder the same words, e.g. our DB's
// "Rosewood Castiglion del Bosco" vs Forbes's "Castiglion del Bosco, A Rosewood Hotel" —
// same token set, different order; treating that as a non-match would be a false negative.
function coreNameKey(value) {
  return tokenize(value)
    .filter((t) => !GENERIC_DESCRIPTORS.has(t))
    .sort()
    .join(" ");
}

function jaccard(tokensA, tokensB) {
  const a = new Set(tokensA);
  const b = new Set(tokensB);
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function locationFields(entry) {
  // award files use inconsistent shapes: city/state_region/country, or location/country only
  const city = entry.city ?? entry.location ?? null;
  return {
    city: city ? normalizeLoose(city) : "",
    state: entry.state_region ? normalizeLoose(entry.state_region) : "",
    country: entry.country ? normalizeCountry(entry.country) : "",
  };
}

function hotelLocationFields(hotel) {
  return {
    city: normalizeLoose(hotel.city),
    localArea: normalizeLoose(hotel.local_area),
    state: normalizeLoose(hotel.state_province_county_island),
    region: normalizeLoose(hotel.region),
    country: normalizeCountry(hotel.country),
  };
}

function countryStatus(hotelLoc, entryLoc) {
  if (!entryLoc.country) return "unknown"; // source list has no country for this entry
  if (!hotelLoc.country) return "unknown";
  return hotelLoc.country === entryLoc.country ? "match" : "conflict";
}

function cityStatus(hotelLoc, entryLoc) {
  const candidates = [hotelLoc.city, hotelLoc.localArea, hotelLoc.state, hotelLoc.region].filter(Boolean);
  const targets = [entryLoc.city, entryLoc.state].filter(Boolean);
  if (targets.length === 0) return "unknown";
  if (candidates.length === 0) return "unknown";
  for (const c of candidates) {
    for (const t of targets) {
      if (c === t || c.includes(t) || t.includes(c)) return "match";
    }
  }
  return "conflict";
}

function loadAwardLists() {
  const lists = {};
  for (const code of AWARD_CODES) {
    const filePath = path.join(AWARDS_DIR, `${code}.json`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing award source file: ${filePath}`);
    }
    lists[code] = JSON.parse(fs.readFileSync(filePath, "utf8"));
  }
  return lists;
}

async function directusFetch(url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` } });
  const json = await res.json();
  if (!res.ok) throw new Error(`Directus request failed: ${JSON.stringify(json)}`);
  return json.data;
}

async function loadHotels() {
  const fields = [
    "id", "hotel_name", "affiliation", "country", "region",
    "state_province_county_island", "city", "local_area",
    "awards", "best50", "cn", "forbes5", "michelin3keys", "telegraph", "tl100", "aaa5d",
  ].join(",");
  const url = `${DIRECTUS_URL}/items/hotels?filter[id][_between]=2001,2067&fields=${fields}&limit=-1&sort=id`;
  return directusFetch(url);
}

function matchHotelToAward(hotel, hotelLoc, hotelTokens, hotelCoreKey, entry, code) {
  const entryLoc = locationFields(entry);
  const cStatus = countryStatus(hotelLoc, entryLoc);
  const cityStat = cityStatus(hotelLoc, entryLoc);

  // A real country conflict is a hard fact — always exclude.
  if (cStatus === "conflict") return null;

  const entryCoreKey = coreNameKey(entry.hotel_name);
  const coreExact = hotelCoreKey === entryCoreKey;

  if (coreExact) {
    if (cityStat === "conflict") {
      // Core name matches exactly (after stripping "hotel"/"resort"/"spa" etc), but the
      // city/area string differs — e.g. DB city "Tamarindo" vs source location
      // "La Manzanilla" for the same physical property. Too strong a name signal to drop
      // silently; surface for human review instead.
      return {
        tier: "uncertain", score: 1, cStatus, cityStat, entry, entryLoc, code,
        reason: "core name exact match but location differs — check same property",
      };
    }
    return { tier: "confirmed", score: 1, cStatus, cityStat, entry, entryLoc, code };
  }

  // Below this point the name isn't an exact core match, so we lean on brand-token overlap.
  // Chain brands (Mandarin Oriental, Four Seasons, ...) repeat the same words across many
  // cities, so without location corroboration this scoring alone is not trustworthy —
  // require the city not be in outright conflict here (unlike the exact-match branch above).
  if (cityStat === "conflict") return null;

  const hotelLocTokens = [hotelLoc.city, hotelLoc.localArea, hotelLoc.state].filter(Boolean).flatMap((s) => s.split(" "));
  const entryLocTokens = [entryLoc.city, entryLoc.state].filter(Boolean).flatMap((s) => s.split(" "));
  const score = jaccard(brandTokens(hotel.hotel_name, hotelLocTokens), brandTokens(entry.hotel_name, entryLocTokens));

  if (score >= 0.6) {
    return { tier: "uncertain", score, cStatus, cityStat, entry, entryLoc, code, reason: "similar brand name" };
  }
  return null;
}

function bestCandidateForCode(hotel, hotelLoc, hotelTokens, hotelCoreKey, entries, code) {
  let best = null;
  for (const entry of entries) {
    const result = matchHotelToAward(hotel, hotelLoc, hotelTokens, hotelCoreKey, entry, code);
    if (!result) continue;
    if (!best || result.score > best.score || (result.tier === "confirmed" && best.tier !== "confirmed")) {
      best = result;
    }
  }
  return best;
}

function formatEntryLoc(entry) {
  const parts = [entry.city ?? entry.location, entry.state_region, entry.country].filter(Boolean);
  return parts.join(", ") || "(no location data)";
}

function main() {
  return (async () => {
    const outArg = process.argv.indexOf("--out");
    const outPath = outArg !== -1
      ? path.resolve(process.argv[outArg + 1])
      : path.join(__dirname, "award-review-2026-07-07.txt");

    const awardLists = loadAwardLists();
    const hotels = await loadHotels();

    console.log(`Loaded ${hotels.length} hotels, ${AWARD_CODES.length} award lists.`);
    for (const code of AWARD_CODES) {
      console.log(`  ${code}: ${awardLists[code].length} entries`);
    }

    const confirmedByHotel = new Map(); // id -> [{code, entry, ...}]
    const uncertainByHotel = new Map();
    const unconfirmedExisting = []; // db already has award true, no source candidate at all

    for (const hotel of hotels) {
      const hotelLoc = hotelLocationFields(hotel);
      const hotelTokens = tokenize(hotel.hotel_name);
      const hotelCoreKey = coreNameKey(hotel.hotel_name);

      for (const code of AWARD_CODES) {
        const best = bestCandidateForCode(hotel, hotelLoc, hotelTokens, hotelCoreKey, awardLists[code], code);
        const dbHasIt = !!hotel[code];

        if (best?.tier === "confirmed") {
          if (!confirmedByHotel.has(hotel.id)) confirmedByHotel.set(hotel.id, []);
          confirmedByHotel.get(hotel.id).push({ ...best, dbHasIt });
        } else if (best?.tier === "uncertain") {
          if (!uncertainByHotel.has(hotel.id)) uncertainByHotel.set(hotel.id, []);
          uncertainByHotel.get(hotel.id).push({ ...best, dbHasIt });
        } else if (dbHasIt) {
          unconfirmedExisting.push({ hotel, code });
        }
      }
    }

    const lines = [];
    const push = (s = "") => lines.push(s);

    push("HOTEL AWARDS AUDIT — new hotels 2001-2067 vs awards-2026/ source lists");
    push(`Generated: 2026-07-07 by match-hotel-awards.mjs`);
    push("");
    push("=".repeat(78));
    push("SUMMARY");
    push("=".repeat(78));
    push(`Hotels checked: ${hotels.length}`);
    push(`Award source entries: ${AWARD_CODES.map((c) => `${c}=${awardLists[c].length}`).join(", ")}`);
    push(`Hotels with >=1 confirmed award match: ${confirmedByHotel.size}`);
    push(`Hotels with >=1 uncertain candidate (needs your review): ${uncertainByHotel.size}`);
    push(`Existing DB awards with no source-list candidate at all: ${unconfirmedExisting.length}`);
    push("");

    push("=".repeat(78));
    push("SECTION A — CONFIRMED MATCHES (exact name match, no country conflict)");
    push("=".repeat(78));
    push("These will be applied (boolean = true AND added to the `awards` tag array)");
    push("when you approve running the apply step.");
    push("");

    if (confirmedByHotel.size === 0) {
      push("(none)");
    } else {
      for (const hotel of hotels) {
        const matches = confirmedByHotel.get(hotel.id);
        if (!matches) continue;
        push(`[id ${hotel.id}] ${hotel.hotel_name} (${hotel.country} / ${hotel.city})`);
        for (const m of matches) {
          const status = m.dbHasIt ? "already true in DB — confirmed correct, no change" : "currently false in DB — WILL ADD";
          push(`  ${m.code.toUpperCase().padEnd(14)} ${status}`);
          push(`      source: "${m.entry.hotel_name}" — ${formatEntryLoc(m.entry)} [${m.code}.json]`);
        }
        push("");
      }
    }

    push("=".repeat(78));
    push("SECTION B — EXISTING DB AWARDS WITH NO MATCHING SOURCE ENTRY (review)");
    push("=".repeat(78));
    push("These hotels currently have a boolean award flag set to true (from the");
    push("original hotel-creation data), but no entry in the corresponding award-2026");
    push("source list matched them at all. Confirm whether to keep or remove.");
    push("");

    if (unconfirmedExisting.length === 0) {
      push("(none)");
    } else {
      for (const { hotel, code } of unconfirmedExisting) {
        push(`[id ${hotel.id}] ${hotel.hotel_name} (${hotel.country} / ${hotel.city}) — ${code.toUpperCase()} is true in DB, no candidate found in ${code}.json`);
      }
    }
    push("");

    push("=".repeat(78));
    push("SECTION C — UNCERTAIN MATCHES: NEEDS YOUR CONFIRMATION (id included)");
    push("=".repeat(78));
    push("Reply with the hotel id + award code for each one telling me MATCH or NOT A MATCH.");
    push("");

    if (uncertainByHotel.size === 0) {
      push("(none)");
    } else {
      for (const hotel of hotels) {
        const matches = uncertainByHotel.get(hotel.id);
        if (!matches) continue;
        push(`[id ${hotel.id}] ${hotel.hotel_name} (${hotel.country} / ${hotel.city}) — currently: ${AWARD_CODES.filter((c) => hotel[c]).join(", ") || "no awards set"}`);
        for (const m of matches) {
          push(`  ${m.code.toUpperCase().padEnd(14)} candidate: "${m.entry.hotel_name}" — ${formatEntryLoc(m.entry)}  [score ${m.score.toFixed(2)}, country ${m.cStatus}, city ${m.cityStat}, reason: ${m.reason}]`);
        }
        push("");
      }
    }

    fs.writeFileSync(outPath, lines.join("\n"), "utf8");
    console.log("");
    console.log(`Report written to ${outPath}`);
    console.log(`Confirmed: ${confirmedByHotel.size} hotels | Uncertain: ${uncertainByHotel.size} hotels | Unconfirmed-existing: ${unconfirmedExisting.length}`);
  })();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
