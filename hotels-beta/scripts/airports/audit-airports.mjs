#!/usr/bin/env node
/* READ-ONLY audit of the airport mapping. Writes nothing, safe to run anytime.
 *
 * WHY IT EXISTS. Every airport fix made on 2026-09-11 was an exception entry in
 * `GATEWAY_OVERRIDE`. The nearest-wins algorithm underneath is unchanged, so
 * its flaw is intact everywhere nobody has looked — and what got looked at was
 * whatever Ulrik happened to flag, which biases coverage towards the places he
 * can evaluate. This turns "where might it still be wrong" from a guess into a
 * ranked queue.
 *
 * IT IS A RESEARCH QUEUE, NOT AN OUTPUT SIGNAL, and that was a deliberate
 * decision. Surfacing a confidence flag to the guest would hedge on ~14% of the
 * roster, mostly on false positives — Florence, Mykonos and Santorini are
 * flagged only because real international airports can have short runways — and
 * a hedge the guest cannot act on is noise. They have no better source than we
 * do. On the Turin case a hedge would have produced "Turin, though worth
 * confirming", still the wrong airport; the same flag as a work queue gets it
 * FIXED. Unknowns should become knowns, not caveats.
 *
 * Same two classes as `audit-local-area.mjs`:
 *   DEFECTS    — provably wrong without knowing the region. Any hit is work to
 *                do and the script exits 1. These should stay at zero.
 *   CANDIDATES — the signature every real error so far has carried, but often
 *                legitimate. A hit means LOOK. They never fail the run.
 *
 *   node audit-airports.mjs           # full report
 *   node audit-airports.mjs --quiet   # defects and the top of the queue only
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const QUIET = process.argv.includes("--quiet");

/* A runway a narrowbody jet can use. Below this a destination has no airport an
 * ordinary international itinerary can be sold into, so the listed one is a
 * domestic hop at best — the shape behind Sossusvlei, Big Island and Cabo. */
/* Candidates REVIEWED and deliberately left as they are, 2026-09-12, with the
 * reason. Without this the audit reports 61 "open" destinations that have in
 * fact all been looked at, and a genuinely new one — a hotel added next month
 * in a place nobody has checked — would be invisible in the noise. That is the
 * whole point of keeping it: after this, OPEN means UNREVIEWED. */
const REVIEWED = {
  // A real international airport that merely has a short runway.
  "Florence": "FLR is Florence's own international airport",
  "Perugia": "PEG is Perugia's own airport",
  "Montalcino": "Florence at 82km is the right answer for the Val d'Orcia",
  "Oia": "JTR is Santorini's international airport",
  "Imerovigli": "JTR, as above",
  "Papas Beach": "JTR, as above",
  "Mykonos Town": "JMK is Mykonos's international airport",
  "Ornos": "JMK", "Psarou": "JMK", "Elia Beach": "JMK", "Kalafati": "JMK",
  "Megali Ammos": "JMK", "Platis Gialos Beach": "JMK",
  "Agios Ioannis": "JMK", "Aleomandra": "JMK", "Ayios Yiannis": "JMK",
  "Bath": "Bristol is a real international airport",
  "Bo Phut": "USM is Samui's own airport", "Angthong": "USM, as above",
  "Teton Village": "JAC is Jackson Hole's airport, with major-carrier service",
  "Trancoso": "BPS serves Porto Seguro with real domestic flights",
  "Con Dao Town": "VCS has scheduled service from Ho Chi Minh City",
  "Lord Howe Island": "LDH has scheduled service from Sydney and Brisbane",
  "Karoso Beach": "TMC has real service from Bali", "Nihiwatu Beach": "TMC, as above",
  "Lake Louise": "already resolves to Calgary", "Philipsburg": "already resolves to Missoula",

  /* The small airport IS the arrival airport — an island or reserve hop where a
   * domestic strip ends the journey. Each carries a transfer route saying so. */
  "Fasmendhoo Island": "Maldives hop", "Kihavah": "Maldives hop",
  "Kunfunadhoo Island": "Maldives hop", "Landaa Giraavaru": "Maldives hop",
  "Thiladhoo Island": "Maldives hop", "Voavah": "Maldives hop",
  "Laamu": "Maldives hop", "Meradhoo Island": "Maldives hop",
  "Maagau Island": "Maldives hop", "Rangali Island": "Maldives hop",
  "Vommuli Island": "Maldives hop", "Maalifushi": "Maldives hop",
  "Olhuveli": "Maldives hop",
  "Gustavia": "St Barth; St Jean takes light aircraft only",
  "Grand Cul-de-sac": "St Barth", "St. Barthelemy": "St Barth",
  "Canouan Island": "regional flights via Barbados or St Vincent", "Carenage Bay": "Canouan",
  "Moskito Island": "boat from Virgin Gorda", "Necker Island": "boat from Virgin Gorda",
  "Spanish Town": "on Virgin Gorda itself",
  "Anse Kerlan": "on Praslin", "Felicite Island": "boat from Praslin",
  "Desroches Island": "domestic flight from Mahe",
  "Bora Bora": "no international service; connects through Papeete",
  "Lanai City": "connecting flight through Honolulu",
  "Sabi Sand Reserve": "Skukuza, reached on a connecting flight through Johannesburg",
  "Kruger National Park": "Skukuza, as above", "Skukuza Rest Camp": "Skukuza, as above",
  "Okavango Delta": "Maun is the gateway into the Delta",

  /* No good commercial answer, left rather than guessed. */
  "Phinda Private Game Reserve": "Mkuze takes the light-aircraft leg from Johannesburg; Durban at 228km would be worse",
  "Tswalu Kalahari Reserve": "charter to the reserve's own strip; no sellable alternative",
  "Moyo Island": "boat from Sumbawa or charter from Bali; routings vary too much to pick one",
  "Gisakura": "Kamembe is a genuine domestic hop from Kigali and its transfer route says so",
};

const JET_M = 2200;
/* Far enough that the drive is a leg of its own rather than a detail. Masai
 * Mara sat at 214km and said nothing about it. */
const FAR_KM = 120;

const URL_ = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const TOKEN = process.env.DIRECTUS_TOKEN;
if (!URL_ || !TOKEN) {
  console.error("Set DIRECTUS_URL and DIRECTUS_TOKEN.");
  process.exitCode = 1;
} else {

const { data: all } = await (await fetch(
  `${URL_}/items/hotels?limit=-1&fields=id,hotel_name,published,country,city,state_province_county_island`,
  { headers: { Authorization: `Bearer ${TOKEN}` } }
)).json();
const V = (v) => String(v ?? "").trim();
const pub = all.filter((h) => h.published);

// ---- what the generated file says ----
const caPath = path.join(ROOT, "src", "lib", "cityAirports.ts");
const caLines = fs.readFileSync(caPath, "utf8").split(/\r?\n/);
const airportsOf = new Map();
{
  let key = null;
  for (const l of caLines) {
    const k = l.match(/^ {2}"(.+)": \[$/);
    if (k) { key = k[1]; airportsOf.set(key, []); continue; }
    /* Deliberately does NOT parse `label`. Marmaris carries
     * label: "Rhodes \"Diagoras\"" and an inner quote ended the capture early,
     * so the line failed to match and the destination parsed as having NO
     * airports — which this audit then reported as a defect in the data. It was
     * a defect in the audit. Read only the fields used. */
    const m = l.match(/iata: "(\w{3})".*distKm: (\d+).*runwayM: (\d+)/);
    if (key && m) airportsOf.get(key).push({ iata: m[1], d: +m[2], m: +m[3] });
    if (key && l.trim() === "],") key = null;
  }
}

// ---- the two hand-maintained tables ----
const gen = fs.readFileSync(path.join(HERE, "build-city-airports.mjs"), "utf8");
const ovStart = gen.indexOf("const GATEWAY_OVERRIDE");
const ovBlock = gen.slice(ovStart, gen.indexOf(String.fromCharCode(10) + "};", ovStart));
const overrides = new Map(
  [...ovBlock.matchAll(/^ {2}(?:"([^"]+)"|([A-Za-z][A-Za-z0-9_]*)):\s*\[([^\]]*)\]/gm)]
    .map((m) => [m[1] ?? m[2], [...m[3].matchAll(/"(\w{3})"/g)].map((x) => x[1])])
);
const trSrc = fs.readFileSync(path.join(ROOT, "src", "lib", "transferRoutes.ts"), "utf8");
const trBlock = trSrc.slice(trSrc.indexOf("export const TRANSFER_ROUTES"));
const routeArrive = new Map();
{
  const lines = trBlock.split(/\r?\n/);
  let key = null;
  for (const l of lines) {
    const k = l.match(/^ {2}(?:"([^"]+)"|([A-Za-z][A-Za-z0-9_]*)): \{$/);
    if (k) { key = k[1] ?? k[2]; continue; }
    const mv = l.match(/^ {2}(?:"([^"]+)"|([A-Za-z][A-Za-z0-9_]*)): maldives\("(\w{3})"/);
    if (mv) { routeArrive.set(mv[1] ?? mv[2], mv[3]); continue; }
    const a = l.match(/arriveAt: "(\w{3})"/);
    if (key && a) { routeArrive.set(key, a[1]); key = null; }
  }
}

// ---- destinations that actually have hotels ----
const hotelsFor = (k) => pub.filter((h) => V(h.city) === k || (!V(h.city) && V(h.state_province_county_island) === k));
const live = [...airportsOf.keys()].filter((k) => hotelsFor(k).length > 0);

const defects = [];
const D = (label, rows, note) => {
  console.log(`  DEFECT     ${String(rows.length).padStart(3)}  ${label}`);
  if (note && rows.length) console.log(`                   ${note}`);
  for (const r of rows) console.log(`        ${r}`);
  defects.push(...rows);
};

console.log(`\n  airport audit — ${live.length} destinations with hotels, ${pub.length} published hotels`);
console.log(`  ${overrides.size} gateway overrides, ${routeArrive.size} transfer routes\n`);

// DEFECT: a hand-maintained key that matches no destination any more.
D("gateway override for a destination that no longer exists",
  [...overrides.keys()].filter((k) => !live.includes(k)).map((k) => `${JSON.stringify(k)} — remove it, or the resort it was for has been renamed`),
  "a dead key silently answers for nothing, and hides that the live key has no override");
D("transfer route for a destination that no longer exists",
  [...routeArrive.keys()].filter((k) => !live.includes(k) && !airportsOf.has(k)).map((k) => `${JSON.stringify(k)}`));

// DEFECT: a route whose arrival airport is not one this destination lists.
D("transfer route whose arriveAt is not in that destination's airport list",
  [...routeArrive.entries()]
    .filter(([k, iata]) => airportsOf.has(k) && !airportsOf.get(k).some((a) => a.iata === iata))
    .map(([k, iata]) => `${JSON.stringify(k)} arriveAt=${iata}, listed=[${(airportsOf.get(k) || []).map((a) => a.iata).join(", ")}]`),
  "the concierge would name one airport while the flight card prices another");

// DEFECT: a published hotel whose destination resolves to no airport at all.
const noAirport = [...new Set(pub.filter((h) => {
  const k = V(h.city) || V(h.state_province_county_island);
  return k && !airportsOf.has(k);
}).map((h) => V(h.city) || V(h.state_province_county_island)))];
D("published destination with no airport entry", noAirport,
  "the landing flight teaser resolves these to nothing");

// ---- CANDIDATES: the research queue ----
const rows = [];
/* A key that parsed but holds no airports. Not expected; if it fires it means
 * the generated file changed shape and this audit is misreading it, which
 * matters more than any candidate below. */
const emptyList = [];
for (const k of live) {
  const aps = airportsOf.get(k);
  const hs = hotelsFor(k);
  if (!aps.length) { emptyList.push(k); continue; }
  const best = [...aps].sort((a, b) => b.m - a.m)[0];
  const reasons = [];
  if (best.m < JET_M) reasons.push(`no jet-capable airport (best ${best.m}m)`);
  if (best.d > FAR_KM) reasons.push(`nearest jet airport ${best.d}km away`);
  const countries = new Set(hs.map((h) => V(h.country)));
  if (!reasons.length) continue;
  rows.push({ k, n: hs.length, country: [...countries][0], aps, best,
              why: reasons.join(" + "), checked: overrides.has(k), routed: routeArrive.has(k) });
}
const sortQ = (a, b) => b.n - a.n || a.k.localeCompare(b.k);
const reviewedLeft = rows.filter((r) => !r.checked && REVIEWED[r.k]).sort(sortQ);
const open = rows.filter((r) => !r.checked && !REVIEWED[r.k]).sort(sortQ);
const done = rows.filter((r) => r.checked);

console.log(`\n  CANDIDATES — the signature every real error has carried\n`);
console.log(`  candidate  ${String(rows.length).padStart(3)}  destinations carry it`);
console.log(`             ${String(done.length).padStart(3)}  already hand-checked (an override exists)`);
console.log(`             ${String(reviewedLeft.length).padStart(3)}  reviewed and deliberately left as they are`);
console.log(`             ${String(open.length).padStart(3)}  OPEN — never reviewed, ${open.reduce((s, r) => s + r.n, 0)} hotels\n`);
if (!open.length) console.log("  Queue empty: every candidate has been reviewed. A new destination will appear here.\n");
const show = QUIET ? open.slice(0, 15) : open;
console.log(`  htl  destination                 country          listed now                    why`);
for (const r of show) {
  const listed = r.aps.map((a) => `${a.iata} ${a.d}km`).join(" ");
  console.log(`  ${String(r.n).padStart(3)}  ${r.k.slice(0, 26).padEnd(27)} ${r.country.slice(0, 15).padEnd(16)} ${listed.slice(0, 29).padEnd(30)}${r.why}${r.routed ? "   [has a transfer route]" : ""}`);
}
if (QUIET && open.length > show.length) console.log(`  ... and ${open.length - show.length} more`);

console.log(`\n  A hit is not a verdict. Florence, Mykonos and Santorini appear here because`);
console.log(`  a real international airport can have a short runway. Work the queue by`);
console.log(`  hotel count and convert findings into GATEWAY_OVERRIDE entries.\n`);
  if (emptyList.length) {
    console.log(`  PARSE WARNING - ${emptyList.length} destination(s) parsed with no airports: ${emptyList.join(", ")}`);
    console.log("  This audit is misreading cityAirports.ts, not the mapping being empty.");
    defects.push(...emptyList.map((x) => `empty airport list parsed for ${JSON.stringify(x)}`));
  }
console.log(defects.length ? `  ${defects.length} DEFECT rows.\n` : `  No defects.\n`);
process.exitCode = defects.length ? 1 : 0;
}
