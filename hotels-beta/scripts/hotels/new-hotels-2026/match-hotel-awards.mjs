#!/usr/bin/env node
/**
 * Match the FULL hotels collection against the 7 award source lists in
 * awards-2026/*.json, and produce a review report — no Directus writes.
 *
 * This is the full-collection successor to the 2026-07-07 run, which was scoped to
 * IDs 2001-2067 only. Per the 2026-07-15 audit request, run ONE award code at a time
 * via --award <code>, review, apply, then move to the next code (see CLAUDE.md §25).
 *
 * Matching strategy (three tiers, all surfaced for human review — nothing here
 * auto-applies):
 *   1. CONFIRMED — exact core-name match (generic hospitality words stripped,
 *      token order ignored), no location conflict.
 *   2. NEAR — brand-prefix-agnostic containment match: one hotel's core token set is
 *      fully contained in the other's (e.g. "Tamarindo" vs "Four Seasons Resort
 *      Tamarindo", or "Castiglion del Bosco" vs "Rosewood Castiglion del Bosco").
 *      Requires an actual city/area match (not just "no conflict") as corroboration,
 *      plus >=2 tokens in the smaller set, to avoid one-word false positives.
 *   3. UNCERTAIN — brand-token Jaccard overlap >=0.6 with no location conflict.
 *      Chain brands (Mandarin Oriental, Four Seasons, ...) repeat words across many
 *      cities, so this tier is the least trustworthy and always needs a human call.
 *
 * Also flags, for the target award code only:
 *   - REMOVAL CANDIDATES — hotel has the boolean true and/or the tag in `awards`,
 *     but no source-list entry matched it at all in this run.
 *   - DRIFT — hotel's boolean flag and its `awards` tag-array entry disagree with
 *     each other (independent of source-list matching) — a pre-existing data bug.
 *
 * Usage (from hotels-beta/):
 *   DIRECTUS_URL=... DIRECTUS_TOKEN=... node scripts/hotels/new-hotels-2026/match-hotel-awards.mjs --award michelin3keys
 *   ... --ids 2001,2067        (optional: restrict to an id range "from,to", default = full collection)
 *   ... --out <path.txt>       (defaults to award-review-<code>-<date>.txt in this folder)
 *   ... --json <path.json>     (defaults to award-review-<code>-<date>.json in this folder)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AWARDS_DIR = path.join(__dirname, "awards-2026");

export const DIRECTUS_URL = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
export const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;

if (!DIRECTUS_URL) throw new Error("Missing env DIRECTUS_URL");
if (!DIRECTUS_TOKEN) throw new Error("Missing env DIRECTUS_TOKEN");

// award code -> exact Directus `awards` tag-field display string (taxonomy-reference.md)
export const AWARD_DISPLAY = {
  michelin3keys: "Michelin 3 Keys",
  aaa5d: "AAA/CAA Five Diamond Hotels",
  cn: "Conde Nast Gold List",
  best50: "The World's 50 Best Hotels",
  forbes5: "Forbes 5 Star",
  tl100: "Travel + Leisure 100",
  telegraph: "Telegraph Best Hotels in the World",
};

export const ALL_AWARD_CODES = Object.keys(AWARD_DISPLAY);

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

// Core name = hotel name with generic hospitality words stripped, but everything else
// (brand + location words) KEPT. Used for an exact-match check that's more lenient than
// raw full-string equality but still strict enough that a match here is a strong signal.
// Sorted (order-insensitive) because some award lists reorder the same words, e.g. our DB's
// "Rosewood Castiglion del Bosco" vs Forbes's "Castiglion del Bosco, A Rosewood Hotel" —
// same token set, different order; treating that as a non-match would be a false negative.
function coreNameKey(value) {
  return coreTokenSet(value).sort().join(" ");
}

export function coreTokenSet(value) {
  return tokenize(value).filter((t) => !GENERIC_DESCRIPTORS.has(t));
}

// Brand-prefix-agnostic containment check: true if the smaller token set is fully
// contained within the larger one, e.g. {tamarindo} \subset {four,seasons,tamarindo}.
// Requires the smaller set to have >=2 tokens to avoid one-word false positives
// (a single shared word like "palace" or "grand" is not a reliable signal on its own).
function containmentMatch(tokensA, tokensB) {
  const a = new Set(tokensA);
  const b = new Set(tokensB);
  if (a.size === 0 || b.size === 0) return null;
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  if (smaller.size < 2) return null;
  for (const t of smaller) if (!larger.has(t)) return null;
  return { smallerSize: smaller.size, largerSize: larger.size };
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

export function hotelLocationFields(hotel) {
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

// Three-tier location signal: "match" (real city-level agreement) is trusted everywhere;
// "state-only" (only the broader state/region/local-area level agrees) is trusted for a
// strong name signal but NOT as sole corroboration for a weak one; "conflict" excludes.
// The tiering exists because a flat "any field overlaps" check produces two opposite
// failure modes depending on which fields overlap:
//   - Trusting state alone is too loose in big, city-dense states/countries: "Four Seasons
//     Resort The Biltmore Santa Barbara" vs "Four Seasons Hotel San Francisco" both being
//     "California" must NOT read as a location match.
//   - Requiring literal city-string overlap is too strict for remote resort properties,
//     where our DB's `city` is a hyper-local place name (e.g. "Hoedspruit") but the source
//     list (and our own `state_province_county_island` field) uses the broader named area
//     ("Kruger National Park") — these must still count as corroborating, just one tier
//     down from a direct city match.
function cityStatus(hotelLoc, entryLoc) {
  const overlaps = (a, b) => a.some((x) => b.some((y) => x === y || x.includes(y) || y.includes(x)));

  const hotelCityTier = [hotelLoc.city, hotelLoc.localArea].filter(Boolean);
  const entryTargets = [entryLoc.city, entryLoc.state].filter(Boolean);
  if (hotelCityTier.length > 0 && entryTargets.length > 0 && overlaps(hotelCityTier, entryTargets)) {
    return "match";
  }

  const hotelBroadTier = [hotelLoc.state, hotelLoc.region].filter(Boolean);
  if (hotelBroadTier.length > 0 && entryTargets.length > 0 && overlaps(hotelBroadTier, entryTargets)) {
    return "state-only";
  }

  if ((hotelCityTier.length === 0 && hotelBroadTier.length === 0) || entryTargets.length === 0) {
    return "unknown";
  }
  return "conflict";
}

export function loadAwardList(code) {
  const filePath = path.join(AWARDS_DIR, `${code}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing award source file: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export async function directusFetch(url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` } });
  const json = await res.json();
  if (!res.ok) throw new Error(`Directus request failed: ${JSON.stringify(json)}`);
  return json.data;
}

export async function loadHotels(code, idRange) {
  const fields = [
    "id", "hotel_name", "affiliation", "country", "region",
    "state_province_county_island", "city", "local_area",
    "published",
    "awards", "best50", "cn", "forbes5", "michelin3keys", "telegraph", "tl100", "aaa5d",
  ].join(",");
  const filter = idRange ? `&filter[id][_between]=${idRange[0]},${idRange[1]}` : "";
  const url = `${DIRECTUS_URL}/items/hotels?${filter ? filter.slice(1) + "&" : ""}fields=${fields}&limit=-1&sort=id`;
  return directusFetch(url);
}

export function matchHotelToAward(hotel, hotelLoc, hotelCoreKey, hotelCoreSet, entry) {
  const entryLoc = locationFields(entry);
  const cStatus = countryStatus(hotelLoc, entryLoc);
  const cityStat = cityStatus(hotelLoc, entryLoc);

  const entryCoreSet = coreTokenSet(entry.hotel_name);
  const entryCoreKey = entryCoreSet.slice().sort().join(" ");
  const coreExact = hotelCoreKey === entryCoreKey;

  // An exact core-name match is a strong enough signal that a country-label mismatch
  // (our DB says "China", the source says "Hong Kong"; DB says "St. Barthelemy", source
  // says "French West Indies" — same real place, different naming convention) must NOT
  // hard-exclude it, and a "state-only" location match (broader-area agreement without a
  // literal city-string match) is trusted just like a full city match — an exact,
  // distinctive hotel name colliding by coincidence in the same state/region is very
  // unlikely. Only a real city-level conflict (or country conflict) downgrades to
  // "uncertain" instead of silently dropping the candidate.
  if (coreExact) {
    if (cStatus === "conflict" || cityStat === "conflict") {
      return {
        tier: "uncertain", score: 1, cStatus, cityStat, entry, entryLoc,
        reason: cStatus === "conflict"
          ? "core name exact match but country label differs — check same property"
          : "core name exact match but location differs — check same property",
      };
    }
    return { tier: "confirmed", score: 1, cStatus, cityStat, entry, entryLoc };
  }

  // Brand-prefix-agnostic containment: one side's core tokens fully contained in the
  // other's (brand name present on only one side). A real city-level match is trusted
  // enough to survive a country-label conflict too (DB "St. Barthelemy" vs source's
  // umbrella "French West Indies" for the same island) — downgrade to "uncertain" rather
  // than hard-excluding. A "state-only" match is a weaker signal than that (containment
  // is already a looser name check than exact), so it downgrades to "uncertain" too
  // rather than "near" — still surfaced for review, just not auto-treated as safe.
  const containment = containmentMatch(hotelCoreSet, entryCoreSet);
  if (containment && cityStat === "match") {
    return {
      tier: cStatus === "conflict" ? "uncertain" : "near",
      score: containment.smallerSize / containment.largerSize, cStatus, cityStat,
      entry, entryLoc,
      reason: cStatus === "conflict"
        ? "brand-prefix-agnostic containment match but country label differs — check same property"
        : "brand-prefix-agnostic containment match",
    };
  }
  if (containment && cityStat === "state-only" && cStatus !== "conflict") {
    return {
      tier: "uncertain", score: containment.smallerSize / containment.largerSize, cStatus, cityStat,
      entry, entryLoc, reason: "brand-prefix-agnostic containment match but only broader-area location agrees — check same property",
    };
  }

  // Below this point the signal is weaker than an exact or containment match, so it needs
  // a real city-level match (not just state-level) as corroboration — state-only
  // corroboration plus weak brand-token overlap is exactly the failure mode that produced
  // false positives like "Four Seasons Resort The Biltmore Santa Barbara" matching
  // "Four Seasons Hotel San Francisco" (same brand, same state, different city).
  if (cStatus === "conflict" || cityStat !== "match") return null;

  const hotelLocTokens = [hotelLoc.city, hotelLoc.localArea, hotelLoc.state].filter(Boolean).flatMap((s) => s.split(" "));
  const entryLocTokens = [entryLoc.city, entryLoc.state].filter(Boolean).flatMap((s) => s.split(" "));
  const score = jaccard(brandTokens(hotel.hotel_name, hotelLocTokens), brandTokens(entry.hotel_name, entryLocTokens));

  if (score >= 0.6) {
    return { tier: "uncertain", score, cStatus, cityStat, entry, entryLoc, reason: "similar brand name" };
  }
  return null;
}

export const TIER_RANK = { confirmed: 3, near: 2, uncertain: 1 };

function bestCandidate(hotel, hotelLoc, hotelCoreKey, hotelCoreSet, entries) {
  let best = null;
  for (const entry of entries) {
    const result = matchHotelToAward(hotel, hotelLoc, hotelCoreKey, hotelCoreSet, entry);
    if (!result) continue;
    if (!best || TIER_RANK[result.tier] > TIER_RANK[best.tier] ||
        (TIER_RANK[result.tier] === TIER_RANK[best.tier] && result.score > best.score)) {
      best = result;
    }
  }
  return best;
}

export function formatEntryLoc(entry) {
  const parts = [entry.city ?? entry.location, entry.state_region, entry.country].filter(Boolean);
  return parts.join(", ") || "(no location data)";
}

function parseArgs() {
  const argv = process.argv.slice(2);
  const get = (flag) => {
    const i = argv.indexOf(flag);
    return i !== -1 ? argv[i + 1] : undefined;
  };
  const award = get("--award");
  const idsArg = get("--ids");
  const idRange = idsArg ? idsArg.split(",").map((s) => s.trim()) : null;
  const outArg = get("--out");
  const jsonArg = get("--json");
  return { award, idRange, outArg, jsonArg };
}

function main() {
  return (async () => {
    const { award, idRange, outArg, jsonArg } = parseArgs();

    if (!award || !ALL_AWARD_CODES.includes(award)) {
      throw new Error(`--award <code> is required, one of: ${ALL_AWARD_CODES.join(", ")}`);
    }
    const code = award;
    const displayName = AWARD_DISPLAY[code];
    const today = new Date().toISOString().slice(0, 10);

    const outPath = outArg
      ? path.resolve(outArg)
      : path.join(__dirname, `award-review-${code}-${today}.txt`);
    const jsonPath = jsonArg
      ? path.resolve(jsonArg)
      : path.join(__dirname, `award-review-${code}-${today}.json`);

    const awardList = loadAwardList(code);
    const hotels = await loadHotels(code, idRange);

    console.log(`Scope: ${idRange ? `ids ${idRange[0]}-${idRange[1]}` : "full collection"}`);
    console.log(`Loaded ${hotels.length} hotels. Award: ${code} (${displayName}), ${awardList.length} source entries.`);

    const confirmed = [];
    const near = [];
    const uncertain = [];
    const removalCandidates = [];
    const drift = [];

    for (const hotel of hotels) {
      const hotelLoc = hotelLocationFields(hotel);
      const hotelCoreSet = coreTokenSet(hotel.hotel_name);
      const hotelCoreKey = hotelCoreSet.slice().sort().join(" ");

      const booleanVal = !!hotel[code];
      const tagArray = Array.isArray(hotel.awards) ? hotel.awards : [];
      const tagPresent = tagArray.includes(displayName);

      if (booleanVal !== tagPresent) {
        drift.push({
          id: hotel.id, hotel_name: hotel.hotel_name, country: hotel.country, city: hotel.city,
          booleanVal, tagPresent,
        });
      }

      const best = bestCandidate(hotel, hotelLoc, hotelCoreKey, hotelCoreSet, awardList);

      const record = {
        id: hotel.id, hotel_name: hotel.hotel_name, country: hotel.country, city: hotel.city,
        published: hotel.published, booleanVal, tagPresent,
      };

      if (best?.tier === "confirmed") {
        confirmed.push({ ...record, source: best.entry.hotel_name, sourceLoc: formatEntryLoc(best.entry) });
      } else if (best?.tier === "near") {
        near.push({
          ...record, source: best.entry.hotel_name, sourceLoc: formatEntryLoc(best.entry),
          score: best.score, reason: best.reason,
        });
      } else if (best?.tier === "uncertain") {
        uncertain.push({
          ...record, source: best.entry.hotel_name, sourceLoc: formatEntryLoc(best.entry),
          score: best.score, cStatus: best.cStatus, cityStat: best.cityStat, reason: best.reason,
        });
      } else if (booleanVal || tagPresent) {
        removalCandidates.push(record);
      }
    }

    // --- text report ---
    const lines = [];
    const push = (s = "") => lines.push(s);

    push(`HOTEL AWARDS AUDIT — ${code} (${displayName}) — full-collection review`);
    push(`Generated: ${today} by match-hotel-awards.mjs`);
    push(`Scope: ${idRange ? `ids ${idRange[0]}-${idRange[1]}` : "full collection"}`);
    push("");
    push("=".repeat(78));
    push("SUMMARY");
    push("=".repeat(78));
    push(`Hotels checked: ${hotels.length}`);
    push(`Source entries (${code}.json): ${awardList.length}`);
    push(`Confirmed matches: ${confirmed.length}`);
    push(`Near matches (brand-prefix-agnostic): ${near.length}`);
    push(`Uncertain matches: ${uncertain.length}`);
    push(`Removal candidates (flag/tag set, no source match): ${removalCandidates.length}`);
    push(`Boolean/tag drift (pre-existing inconsistency): ${drift.length}`);
    push("");

    const section = (title, list, fmt) => {
      push("=".repeat(78));
      push(title);
      push("=".repeat(78));
      if (list.length === 0) {
        push("(none)");
      } else {
        for (const r of list) push(fmt(r));
      }
      push("");
    };

    section(
      "SECTION A — CONFIRMED MATCHES (exact core-name match, no location conflict)",
      confirmed,
      (r) => `[id ${r.id}] ${r.hotel_name} (${r.country} / ${r.city}) — currently ${r.booleanVal ? "TRUE" : "false"} — source: "${r.source}" (${r.sourceLoc})`
    );

    section(
      "SECTION B — NEAR MATCHES (brand-prefix-agnostic containment, needs review)",
      near,
      (r) => `[id ${r.id}] ${r.hotel_name} (${r.country} / ${r.city}) — currently ${r.booleanVal ? "TRUE" : "false"} — source: "${r.source}" (${r.sourceLoc}) [score ${r.score.toFixed(2)}]`
    );

    section(
      "SECTION C — UNCERTAIN MATCHES (needs your confirmation)",
      uncertain,
      (r) => `[id ${r.id}] ${r.hotel_name} (${r.country} / ${r.city}) — currently ${r.booleanVal ? "TRUE" : "false"} — candidate: "${r.source}" (${r.sourceLoc}) [score ${r.score.toFixed(2)}, country ${r.cStatus}, city ${r.cityStat}, reason: ${r.reason}]`
    );

    section(
      "SECTION D — REMOVAL CANDIDATES (flag and/or tag set, no source-list match found)",
      removalCandidates,
      (r) => `[id ${r.id}] ${r.hotel_name} (${r.country} / ${r.city}) — boolean=${r.booleanVal}, tag=${r.tagPresent}`
    );

    section(
      "SECTION E — BOOLEAN/TAG DRIFT (pre-existing inconsistency, independent of source match)",
      drift,
      (r) => `[id ${r.id}] ${r.hotel_name} (${r.country} / ${r.city}) — boolean=${r.booleanVal}, tag=${r.tagPresent}`
    );

    fs.writeFileSync(outPath, lines.join("\n"), "utf8");

    // --- structured JSON for the review artifact ---
    const jsonOut = {
      code, displayName, generatedAt: today,
      scope: idRange ? { from: Number(idRange[0]), to: Number(idRange[1]) } : "full-collection",
      hotelsChecked: hotels.length, sourceEntries: awardList.length,
      confirmed, near, uncertain, removalCandidates, drift,
    };
    fs.writeFileSync(jsonPath, JSON.stringify(jsonOut, null, 2), "utf8");

    console.log("");
    console.log(`Text report: ${outPath}`);
    console.log(`JSON data:   ${jsonPath}`);
    console.log(`Confirmed: ${confirmed.length} | Near: ${near.length} | Uncertain: ${uncertain.length} | Removal candidates: ${removalCandidates.length} | Drift: ${drift.length}`);
  })();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
