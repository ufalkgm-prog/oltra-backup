// One-time editorial cleanup of hotels.highlights — typos, whitespace and a
// short list of approved grammar rewrites. Same shape as the
// apply-award-review-*.mjs scripts (§24/§25): dry-run by default, --confirm to
// write, and a committed rollback record of every previous value.
//
// Found by frequency analysis rather than reading 10,242 words: build a word
// map, review rare words in context, then widen the band. The ≤2-occurrence
// band alone would have missed `facilties` (5), `micheling` (5),
// `accomodation` (4), `palacial` (4) — a typo repeated often enough stops
// looking rare.
//
// Usage (from hotels-beta/):
//   node --env-file=.env.local scripts/hotels/fix-highlights-typos-2026-08-16.mjs
//   ... --confirm

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROLLBACK_PATH = path.join(__dirname, "fix-highlights-typos-2026-08-16-rollback.json");

const DIRECTUS_URL = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
if (!DIRECTUS_URL || !DIRECTUS_TOKEN) throw new Error("Missing DIRECTUS_URL or DIRECTUS_TOKEN");

const confirm = process.argv.includes("--confirm");

// Plain misspellings. Applied whole-word, case-insensitively, preserving the
// original word's capitalisation — so "Beutiful"/"beutiful" both work from one
// entry. Every one was verified in context before being listed here; entries
// that looked like typos but were accent-stripping artefacts of the analysis
// (décor -> "cor", château -> "teau", Belle Époque -> "poque", André -> "Andr")
// are deliberately absent.
const WORD_FIXES = {
  absollutely: "absolutely",
  accomodation: "accommodation",
  acitivities: "activities",
  activies: "activities",
  activitie: "activities",
  altas: "Atlas",
  amd: "and",
  astinishing: "astonishing",
  avantgarde: "Avant-garde",
  axcellent: "excellent",
  beatiful: "beautiful",
  beautifulle: "beautifully",
  beautifullt: "beautifully",
  bechfront: "beachfront",
  beurtiful: "beautiful",
  beutiful: "beautiful",
  businesss: "business",
  calssic: "classic",
  chateuax: "Chateaux",
  classig: "classic",
  classis: "classic",
  contemporaru: "contemporary",
  contemprorary: "contemporary",
  contmporary: "contemporary",
  cozyness: "coziness",
  deisgn: "design",
  desing: "design",
  eascape: "escape",
  ecxcellent: "excellent",
  elequent: "elegant",
  europan: "European",
  excelletn: "excellent",
  excllent: "excellent",
  faciiites: "facilities",
  faciliites: "facilities",
  facilites: "facilities",
  facilitie: "facilities",
  facilties: "facilities",
  fashinating: "fascinating",
  fecilities: "facilities",
  ficilities: "facilities",
  graet: "great",
  hisotrical: "historical",
  ihuazu: "Iguazu",
  impecable: "impeccable",
  impecably: "impeccably",
  kilimajaro: "Kilimanjaro",
  lluxury: "luxury",
  luxy: "luxury",
  magnificanet: "magnificent",
  magnificant: "magnificent",
  micheling: "Michelin",
  onj: "on",
  palacial: "palatial",
  pallazo: "palazzo",
  pavillions: "pavilions",
  resot: "resort",
  restaruants: "restaurants",
  restaturants: "restaurants",
  resturants: "restaurants",
  resurt: "resort",
  rooma: "rooms",
  saferi: "safari",
  secluse: "secluded",
  straditional: "traditional",
  stuning: "stunning",
  stylins: "stylish",
  sutnning: "stunning",
  svannah: "savannah",
  traditonal: "traditional",
  tress: "trees",
  tunning: "stunning",
  vegitation: "vegetation",
  wellnes: "wellness",
  wiht: "with",
};

// Approved rewrites that a word swap can't express. Keyed by Directus id; each
// `from` must still match exactly or the row is skipped, so a re-run against
// already-fixed or subsequently-edited data can't corrupt anything.
//
// IMPORTANT: these run AFTER the word fixes above, so `from` has to be written
// against the already-corrected text. Getting this backwards silently does
// nothing — e.g. id 1033's phrase starts "on the edge", which cannot match
// while the stored text still reads "onj the edge".
const PHRASE_FIXES = [
  { id: 1008, from: "let's you become", to: "lets you become" },
  { id: 1030, from: "tented dessert escape", to: "tented desert escape" },
  // Also drops the dangling trailing comma — the only one in the whole field,
  // so it is handled here rather than as a global rule.
  {
    id: 1033,
    from: "on the edge of a Africa's oldest national park, with beautiful villas,",
    to: "on the edge of Africa's oldest national park, with beautiful villas",
  },
  { id: 1103, from: "business and shopping ara", to: "business and shopping area" },
  { id: 1186, from: "all desired serviced locates on Sentosa Island", to: "all desired services, located on Sentosa Island" },
  { id: 1243, from: "sugged in among the", to: "snug in among the" },
  { id: 1289, from: "with alle thebells and whistles", to: "with all the bells and whistles" },
  // "Cury" is the one inferred word in this whole pass — most likely "Cosy".
  { id: 1358, from: "Cury alpine", to: "Cosy alpine" },
  // NB written against the post-word-fix text: `impecable` is corrected to
  // `impeccable` before phrases run.
  { id: 1364, from: "newly refurbished it impeccable interior design", to: "newly refurbished with impeccable interior design" },
  { id: 1312, from: "direct access ot the French gardens", to: "direct access to the French gardens" },
  { id: 1549, from: "hotel inc beautiful secluded setting", to: "hotel in a beautiful secluded setting" },
  { id: 1661, from: "with alle the trimmings", to: "with all the trimmings" },
  { id: 1151, from: "resort tugged away", to: "resort tucked away" },
  // Approved: keep the proper name ("the Old War Office" is the building), drop
  // the duplicating "century old" so only one "old" remains.
  { id: 1296, from: "at the century old Old War Office", to: "at the Old War Office" },
];

function applyWordFixes(text) {
  let out = text;
  for (const [wrong, right] of Object.entries(WORD_FIXES)) {
    out = out.replace(new RegExp(`\\b${wrong}\\b`, "gi"), (match) =>
      // Preserve the original capitalisation of the first letter.
      /^[A-Z]/.test(match) ? right.charAt(0).toUpperCase() + right.slice(1) : right
    );
  }
  return out;
}

async function main() {
  const res = await fetch(
    `${DIRECTUS_URL}/items/hotels?fields=id,hotel_name,highlights&limit=-1`,
    { headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` } }
  );
  if (!res.ok) throw new Error(`Directus fetch failed: ${res.status}`);
  const hotels = ((await res.json()).data ?? []).filter((h) => h.highlights);

  // Keyed by String: Directus returns `id` as a string, so a number-keyed map
  // silently matches nothing — and because the lookup misses entirely, the
  // "did not match" warning below never fires either.
  const phraseById = new Map();
  for (const fix of PHRASE_FIXES) {
    const key = String(fix.id);
    if (!phraseById.has(key)) phraseById.set(key, []);
    phraseById.get(key).push(fix);
  }

  const changes = [];
  const unmatchedPhrases = [];

  for (const hotel of hotels) {
    const before = String(hotel.highlights);
    let after = applyWordFixes(before);

    for (const fix of phraseById.get(String(hotel.id)) ?? []) {
      if (!after.includes(fix.from)) {
        unmatchedPhrases.push({ id: hotel.id, from: fix.from });
        continue;
      }
      after = after.replace(fix.from, fix.to);
    }

    // Whitespace last, so it also tidies anything the rewrites left behind.
    after = after.replace(/[ \t]{2,}/g, " ").trim();

    if (after !== before) {
      changes.push({ id: hotel.id, hotel_name: hotel.hotel_name, before, after });
    }
  }

  if (unmatchedPhrases.length) {
    console.error("PHRASE FIXES THAT DID NOT MATCH (data changed since review?):");
    for (const item of unmatchedPhrases) console.error(`  ${item.id}: ${JSON.stringify(item.from)}`);
    console.error("");
  }

  console.log(`${changes.length} of ${hotels.length} hotels would change.\n`);
  for (const change of changes.slice(0, 12)) {
    console.log(`  ${change.id} ${String(change.hotel_name).trim()}`);
    console.log(`    - ${change.before}`);
    console.log(`    + ${change.after}`);
  }
  if (changes.length > 12) console.log(`  ...and ${changes.length - 12} more`);

  if (!confirm) {
    console.log("\nDRY RUN — pass --confirm to write.");
    return;
  }

  // Append, never overwrite: a re-run only reports rows it actually changed, so
  // writing fresh would discard the first run's record (§40's lesson).
  const existing = fs.existsSync(ROLLBACK_PATH)
    ? JSON.parse(fs.readFileSync(ROLLBACK_PATH, "utf8"))
    : [];

  let ok = 0;
  const failed = [];
  for (const change of changes) {
    const patch = await fetch(`${DIRECTUS_URL}/items/hotels/${change.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${DIRECTUS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ highlights: change.after }),
    });
    if (patch.ok) {
      ok += 1;
      existing.push({ applied_at: new Date().toISOString(), ...change });
    } else {
      failed.push({ id: change.id, status: patch.status });
    }
  }

  fs.writeFileSync(ROLLBACK_PATH, JSON.stringify(existing, null, 2));
  console.log(`\nPatched ${ok}/${changes.length}. Rollback record: ${ROLLBACK_PATH}`);
  if (failed.length) {
    console.error("FAILED:", JSON.stringify(failed));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
