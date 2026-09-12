// Regenerates src/lib/transferTimes.ts — the DRIVING TIME from each airport in
// src/lib/cityAirports.ts to the destination it serves.
//
// Usage (from hotels-beta/):
//   GOOGLE_MAPS_API_KEY=... DIRECTUS_URL=... DIRECTUS_TOKEN=... \
//     node scripts/airports/build-transfer-times.mjs [--dry-run] [--refresh] [--only "City"]
//
// WHY THIS EXISTS. The concierge could not tell a shorter drive from a shorter
// journey. Courchevel 1850 lists Geneva, Chambery and Lyon; the road from
// Chambery is an hour quicker than the road from Geneva, so any rule reading
// the road alone prefers Chambery — and Chambery is largely winter charter, so
// most guests reach it with a connection that costs far more than the hour it
// saves. Ranking the whole journey needs the last leg in MINUTES, per
// (destination, airport) pair, and nothing in this repo held one: `distKm` in
// cityAirports.ts is straight-line and that file explicitly forbids reading
// drive time off it (a straight line crosses the Alps, a road does not), while
// transferRoutes.ts holds modes and legs but no durations at all.
//
// WHY A SEPARATE FILE rather than a `transferMinutes` field inside
// cityAirports.ts: that file is rebuilt whenever the roster's city list changes
// (§43), and a rebuild run without a Google key would then silently drop every
// time it holds. Keyed separately, a cityAirports rebuild cannot lose them, and
// audit-airports.mjs reports any pair that has no entry yet.
//
// WHY PER (DESTINATION, AIRPORT) and not per hotel: it follows transferRoutes.ts
// for the same reason — ten Courchevel hotels share one road from Geneva, and a
// per-hotel copy of it is ten values that can drift apart. Times are measured to
// the same hotel centroid `distKm` uses, so the two numbers describe the same
// two points.
//
// WHAT IT DELIBERATELY DOES NOT DO.
//
//   * No traffic model. `departure_time` is unset, so Google returns the
//     typical no-traffic duration. A traffic-aware figure would change on every
//     rebuild and cannot be honest about a date nobody has chosen yet.
//   * No guessed numbers. A pair Google cannot route by road — the island
//     resorts, where there is genuinely no causeway — is recorded in
//     NO_ROAD_ROUTE, not as a large duration and not as a blank. That
//     distinction is load-bearing: "there is no road" is an answer the ranking
//     must respect, "not measured yet" is a to-do, and a consumer that cannot
//     tell them apart will either invent a drive or drop the destination.
//     ZERO_RESULTS ALONE DOES NOT MEAN THERE IS NO ROAD, and Zermatt is the
//     standing lesson: five points in the village all returned ZERO_RESULTS
//     because no engine routes a car into a car-free village, yet the road runs
//     to its transfer station and every guest is driven there. See
//     ROAD_CONTINUES_PAST and UNROUTABLE_BY_API for the two ways that plays
//     out.
//   * No km-to-minutes fallback. That is the fault this file exists to remove.
//
// INCREMENTAL by default: existing entries are kept and only new pairs are
// queried, so a rebuild after adding one destination costs a few elements
// rather than a full pass. `--refresh` re-queries everything (~740 elements,
// about $4 at Distance Matrix list pricing).

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const CITY_AIRPORTS_PATH = path.join(REPO_ROOT, "src", "lib", "cityAirports.ts");
const OUTPUT_PATH = path.join(REPO_ROOT, "src", "lib", "transferTimes.ts");
const AIRPORTS_CSV_PATH = path.join(__dirname, "airports.csv");
const AIRPORTS_CSV_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const REFRESH = args.includes("--refresh");
const ONLY = (() => {
  const i = args.indexOf("--only");
  return i >= 0 ? args[i + 1] : null;
})();

const API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;

/* PAIRS THE API CANNOT ROUTE, WHERE A ROAD NEVERTHELESS EXISTS.
 *
 * Found by reading the first run's road-less list instead of accepting it:
 * SEOUL came back with no road from either of its airports, which is absurd on
 * its face, and that absurdity is the only reason it was caught. Everything
 * else in that list of 76 was an island or a reserve, where "no road" is the
 * right answer and looks it - except Zermatt, which looked equally obvious and
 * was equally wrong, and is now measured through ROAD_CONTINUES_PAST.
 *
 * Keeping these in NO_ROAD_ROUTE would have the file assert something false,
 * and the next person to read it would either believe it or "fix" Seoul by
 * inventing a number. So they are their own category: no minutes (we still do
 * not have a figure we measured), but recorded as a LIMIT OF THE INSTRUMENT
 * rather than a fact about the place.
 *
 * TRANSIT IS NOT THE FIX, measured rather than assumed: Google does answer
 * Seoul in transit mode (ICN 1h45, GMP 1h04) — but it also answers Zermatt at
 * 5h37 from Geneva where the published rail time is about four hours, because a
 * transit result depends on the departure minute it was asked about. A baked
 * value that moves with the timetable is worse than an absent one. */
/* WHERE THE API STOPS SHORT BUT THE JOURNEY DOES NOT.
 *
 * Zermatt is the case, and it took two corrections from Ulrik to get right.
 * The village is car-free, so Google will not route a car to ANY point in it -
 * not the hotel centroid, not the station, not the northern edge; all five
 * points tested returned ZERO_RESULTS. The first reading of that was "there is
 * no road", which is wrong, and the second was "the road stops at Tasch", which
 * is also wrong: Tasch is where you change if you are coming by TRAIN. The road
 * runs to Zermatt's own transfer station, and permitted transfer vehicles use
 * it; from there it is a ten-minute electric-taxi hop to any hotel in the
 * village.
 *
 * So the measurement is taken as far as the API will honestly go - Tasch, the
 * last routable point on that road - and the remainder is a STATED ALLOWANCE
 * rather than a measurement. It is recorded as such in the generated file, so
 * nobody later reads a partly-stated figure as fully measured.
 *
 * `allowMinutes` covers everything past `via`: for Zermatt, the last stretch of
 * valley road into the village (about 5km) plus the electric taxi to the door.
 * If either is wrong the fix is here, in one number, next to the reason. */
const ROAD_CONTINUES_PAST = {
  Zermatt: {
    via: [46.0686, 7.7767],
    viaLabel: "Tasch, the last point on the road the API will route to",
    allowMinutes: 20,
    why:
      "Zermatt is car-free, so no routing engine will drive into it - but the " +
      "road does run to the village's own transfer station, and a permitted " +
      "transfer uses it. The allowance is the last stretch of road past Tasch " +
      "(about 5km) plus the ten-minute electric-taxi hop to the hotel, which is " +
      "how every guest covers the final leg. The train from Tasch is the " +
      "alternative and is not advisable with luggage.",
  },
};

const UNROUTABLE_BY_API = {
  "Seoul|ICN":
    "Google returns no driving directions anywhere in South Korea — a mapping " +
    "restriction, not a missing road. ICN is roughly an hour by car and 1h45 " +
    "by the airport rail link.",
  "Seoul|GMP":
    "Same Korean restriction. Gimpo is the closer of the two, about 1h04 by " +
    "rail and subway.",
  "Sabi Sand Reserve|SZK":
    "Skukuza sits inside Kruger and the private reserve's gravel roads are not " +
    "in Google's network. Guests are driven in, and transferRoutes.ts carries " +
    "the route in prose.",
  "Macau|ZUH":
    "Zhuhai is across a national border from Macau. A road exists but the " +
    "crossing is a checkpoint rather than a through route, so no driving " +
    "itinerary is returned. Macau's own airport is the measured entry.",
};

/* Every key of ROAD_CONTINUES_PAST is measured, so it must never also be listed
 * as road-less or unroutable - the three tables are exclusive and a destination
 * in two of them would answer differently depending on which was read first. */
for (const city of Object.keys(ROAD_CONTINUES_PAST)) {
  const clash = Object.keys(UNROUTABLE_BY_API).filter((k) => k.startsWith(`${city}|`));
  if (clash.length) {
    throw new Error(
      `${city} is in ROAD_CONTINUES_PAST and also UNROUTABLE_BY_API (${clash.join(", ")})`
    );
  }
}

/* ---------- inputs ---------- */

/** Pairs come from the GENERATED file, never from a second pass over the
 * roster: keys and airport lists are whatever cityAirports.ts actually holds,
 * so the two files cannot drift apart on either. */
function parseCityAirports() {
  const src = fs.readFileSync(CITY_AIRPORTS_PATH, "utf8");
  /* The end offset is searched FROM the start offset, not from 0: the
   * `CityAirport` type above the table also closes with "\n};\n", so a global
   * search finds that one, the slice comes back empty and the run reports zero
   * destinations. The size assertion below is what turned that into an abort
   * rather than a clean-looking no-op. */
  const start = src.indexOf("export const CITY_AIRPORTS");
  const body = src.slice(start, src.indexOf("\n};\n", start));
  const out = new Map();
  const blocks = body.matchAll(/"((?:[^"\\]|\\.)+)": \[([\s\S]*?)\n {2}\]/g);
  for (const [, rawCity, entries] of blocks) {
    const city = JSON.parse(`"${rawCity}"`);
    const airports = [...entries.matchAll(/iata: "([A-Z]{3})"/g)].map((m) => m[1]);
    if (!airports.length) {
      throw new Error(`Parsed no airports for ${city} — the parser is broken, not the data`);
    }
    out.set(city, airports);
  }
  if (out.size < 400) throw new Error(`Parsed only ${out.size} destinations — expected ~517`);
  return out;
}

async function fetchHotels() {
  const res = await fetch(
    `${DIRECTUS_URL}/items/hotels?fields=id,city,state_province_county_island,lat,lng&filter[published][_eq]=true&limit=-1`,
    { headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` } }
  );
  if (!res.ok) throw new Error(`Directus fetch failed: ${res.status}`);
  return (await res.json()).data ?? [];
}

/** Centroid per destination key, grouped exactly as build-city-airports.mjs
 * groups: `city`, falling back to the traveller area for the eight wilderness
 * lodges that have no city (§3). */
function centroids(hotels) {
  const groups = new Map();
  for (const h of hotels) {
    const name = (h.city || "").trim() || (h.state_province_county_island || "").trim();
    if (!name) continue;
    const lat = Number(h.lat);
    const lng = Number(h.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push([lat, lng]);
  }
  const out = new Map();
  for (const [name, pts] of groups) {
    out.set(name, [
      pts.reduce((s, p) => s + p[0], 0) / pts.length,
      pts.reduce((s, p) => s + p[1], 0) / pts.length,
    ]);
  }
  return out;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

async function airportCoords(wanted) {
  if (!fs.existsSync(AIRPORTS_CSV_PATH)) {
    const res = await fetch(AIRPORTS_CSV_URL);
    if (!res.ok) throw new Error(`Failed to download airports.csv: ${res.status}`);
    fs.writeFileSync(AIRPORTS_CSV_PATH, await res.text());
  }
  const rows = parseCsv(fs.readFileSync(AIRPORTS_CSV_PATH, "utf8"));
  const idx = Object.fromEntries(rows[0].map((h, i) => [h, i]));
  const out = new Map();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < rows[0].length) continue;
    const iata = r[idx.iata_code];
    if (!iata || !wanted.has(iata) || out.has(iata)) continue;
    const lat = parseFloat(r[idx.latitude_deg]);
    const lon = parseFloat(r[idx.longitude_deg]);
    if (Number.isFinite(lat) && Number.isFinite(lon)) out.set(iata, [lat, lon]);
  }
  return out;
}

/** Whatever the current generated file holds, so a re-run is incremental and a
 * reviewed "no road here" survives it. */
function readExisting() {
  if (!fs.existsSync(OUTPUT_PATH)) return { times: new Map(), noRoad: new Set() };
  const src = fs.readFileSync(OUTPUT_PATH, "utf8");
  const times = new Map();
  for (const m of src.matchAll(/"([^"]+\|[A-Z]{3})": \{ minutes: (\d+), km: (\d+) \}/g)) {
    times.set(m[1], { minutes: Number(m[2]), km: Number(m[3]) });
  }
  /* Both "no minutes" blocks count as already-answered, or an incremental run
   * re-queries every island on every pass. Each block is read between its own
   * delimiters rather than "from here to the end of the file", which would have
   * folded the second set into the first. */
  const block = (opener, closer) => {
    const at = src.indexOf(opener);
    if (at < 0) return [];
    const body = src.slice(at, src.indexOf(closer, at));
    return [...body.matchAll(/"([^"]+\|[A-Z]{3})"/g)].map((m) => m[1]);
  };
  /* The two blocks have DIFFERENT SHAPES, and reading the second as a Set
   * silently found nothing: it is a Record, because each entry carries the
   * reason. The symptom was small and would have stayed - the run reported "0
   * changed" in content while spending four elements re-querying Seoul, Skukuza
   * and Zhuhai on every pass, and reclassifying them from the same table it had
   * just failed to read. */
  const noRoad = new Set([
    ...block("NO_ROAD_ROUTE: ReadonlySet<string> = new Set([", "]);"),
    ...block("UNROUTABLE_BY_API: Record<string, string> = {", "\n};"),
  ]);
  return { times, noRoad };
}

/* ---------- Google ---------- */

async function distanceMatrix(origins, destination) {
  const url =
    "https://maps.googleapis.com/maps/api/distancematrix/json" +
    `?origins=${origins.map(([a, b]) => `${a},${b}`).join("|")}` +
    `&destinations=${destination[0]},${destination[1]}` +
    `&mode=driving&units=metric&key=${API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Distance Matrix HTTP ${res.status}`);
  const json = await res.json();
  if (json.status !== "OK") {
    throw new Error(`Distance Matrix status ${json.status}: ${json.error_message ?? ""}`);
  }
  return (json.rows ?? []).map((r) => r.elements?.[0] ?? { status: "MISSING" });
}

/* ---------- main ---------- */

async function main() {
  if (!API_KEY) {
    console.error("GOOGLE_MAPS_API_KEY not set");
    process.exit(1);
  }
  if (!DIRECTUS_URL || !DIRECTUS_TOKEN) {
    console.error("Missing DIRECTUS_URL / DIRECTUS_TOKEN");
    process.exit(1);
  }

  const pairsByCity = parseCityAirports();
  const hotels = await fetchHotels();
  const centroid = centroids(hotels);
  const wanted = new Set([...pairsByCity.values()].flat());
  const coords = await airportCoords(wanted);
  const existing = readExisting();

  console.log(
    `${pairsByCity.size} destinations, ` +
      `${[...pairsByCity.values()].reduce((n, a) => n + a.length, 0)} pairs; ` +
      `${existing.times.size} already timed, ${existing.noRoad.size} already known road-less.`
  );

  /* `--refresh` drops what is already known so it can be re-measured. With
   * `--only` it must drop ONLY that destination: clearing everything while the
   * loop visits one city would write out a file containing that city alone, and
   * silently discard the other 740 pairs. Found by reading it before running
   * it, which is the only reason it is not a story. */
  const dropKey = (k) => (ONLY ? k.split("|")[0].toLowerCase() === ONLY.toLowerCase() : true);
  const times = new Map(
    REFRESH ? [...existing.times].filter(([k]) => !dropKey(k)) : existing.times
  );
  const noRoad = new Set(
    REFRESH ? [...existing.noRoad].filter((k) => !dropKey(k)) : existing.noRoad
  );
  const missingCentroid = [];
  const missingCoords = new Set();
  const newlyRoadless = [];
  let queried = 0;
  let elements = 0;

  for (const [city, iatas] of [...pairsByCity].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (ONLY && city.toLowerCase() !== ONLY.toLowerCase()) continue;
    const dest = centroid.get(city);
    if (!dest) {
      missingCentroid.push(city);
      continue;
    }

    const todo = iatas.filter((iata) => {
      const k = `${city}|${iata}`;
      return !times.has(k) && !noRoad.has(k);
    });
    const routable = todo.filter((iata) => {
      if (coords.has(iata)) return true;
      missingCoords.add(iata);
      return false;
    });
    if (!routable.length) continue;

    if (DRY_RUN) {
      console.log(`  would query ${city}: ${routable.join(", ")}`);
      elements += routable.length;
      continue;
    }

    /* A destination whose road ends short of the door is measured to the last
     * routable point on it, and the remainder added as a stated allowance. */
    const extend = ROAD_CONTINUES_PAST[city];
    const target = extend ? extend.via : dest;
    const elems = await distanceMatrix(
      routable.map((i) => coords.get(i)),
      target
    );
    queried += 1;
    elements += routable.length;
    routable.forEach((iata, i) => {
      const e = elems[i];
      const k = `${city}|${iata}`;
      if (e?.status === "OK" && e.duration?.value != null) {
        times.set(k, {
          minutes: Math.round(e.duration.value / 60) + (extend?.allowMinutes ?? 0),
          km: Math.round(e.distance.value / 1000),
        });
      } else {
        noRoad.add(k);
        newlyRoadless.push(`${k} (${e?.status ?? "?"})`);
      }
    });
    if (queried % 25 === 0) console.log(`  ${queried} destinations queried…`);
  }

  if (DRY_RUN) {
    console.log(
      `\nDRY RUN — would have queried ${elements} elements (~$${(elements * 0.005).toFixed(2)}).`
    );
    return;
  }

  /* Every one of these is a REVIEW ITEM, printed rather than swallowed. A pair
   * with no road route is a fact about the place (Zermatt is car-free, an
   * island has no causeway) and belongs in NO_ROAD_ROUTE — but it is also
   * exactly what a wrong airport coordinate or a bad centroid looks like, so it
   * is never added silently. */
  if (newlyRoadless.length) {
    console.log(`\nNO ROAD ROUTE (${newlyRoadless.length}) — check each is genuinely road-less:`);
    for (const p of newlyRoadless) console.log(`  ${p}`);
  }
  if (missingCentroid.length) {
    console.log(
      `\nNO CENTROID (${missingCentroid.length}) — in cityAirports.ts but not in the published roster:`
    );
    for (const c of missingCentroid) console.log(`  ${c}`);
  }
  if (missingCoords.size) {
    console.log(`\nNO AIRPORT COORDS (${missingCoords.size}): ${[...missingCoords].join(", ")}`);
  }

  /* Reclassify at EMIT, not only on the query that first saw the ZERO_RESULTS,
   * so adding an entry to UNROUTABLE_BY_API takes effect on the next run
   * without --refresh and without re-querying anything. */
  const unroutable = [...noRoad].filter((k) => UNROUTABLE_BY_API[k]).sort();
  for (const k of unroutable) noRoad.delete(k);
  const unlisted = Object.keys(UNROUTABLE_BY_API).filter((k) => !unroutable.includes(k));
  if (unlisted.length) {
    console.log(
      `\nUNROUTABLE_BY_API lists ${unlisted.length} pair(s) that did not come back road-less — ` +
        `stale entries, or a key that never existed: ${unlisted.join(", ")}`
    );
  }

  const keys = [...times.keys()].sort();
  const roadless = [...noRoad].sort();

  const out = `// AUTO-GENERATED by scripts/airports/build-transfer-times.mjs — do not
// hand-edit. Re-run that script to regenerate; it is incremental, so a re-run
// only prices destinations it has no answer for.
//
// The last leg: driving time from an airport to the destination it serves, per
// (destination, airport) pair, measured by Google Distance Matrix to the same
// hotel centroid \`cityAirports.ts\` measures \`distKm\` to.
//
// WHY IT EXISTS. Straight-line distance cannot rank a journey. Courchevel 1850
// is 100km from Geneva and 64km from Chambery, and the roads are 2h44 and 1h40
// — but Chambery is largely winter charter, so from most origins the hour saved
// on the road costs more than that in the air. \`gatewayRanking.ts\` adds the
// flight and the drive together; these are the drive.
//
// NO TRAFFIC MODEL: these are typical no-traffic durations, so the file does
// not churn on every rebuild and does not pretend to know a date nobody has
// chosen.

export type TransferTime = {
  /** Driving minutes, airport to destination centroid. */
  minutes: number;
  /** Road distance in km — always longer than \`distKm\`, often by a lot. */
  km: number;
};

/** Keyed "<destination>|<IATA>", exactly as \`cityAirports.ts\` spells the
 * destination. */
export const TRANSFER_TIMES: Record<string, TransferTime> = {
${keys
  .map((k) => `  ${JSON.stringify(k)}: { minutes: ${times.get(k).minutes}, km: ${times.get(k).km} },`)
  .join("\n")}
};

/* DESTINATIONS WHOSE FIGURE INCLUDES A STATED ALLOWANCE, not only a
 * measurement. The road ends short of the door and no routing engine will cover
 * the rest, so the measured leg runs to \`via\` and the remainder is a number a
 * human put there, with its reasoning. Read this before quoting one of these as
 * a measured drive. */
export const ROAD_ALLOWANCES: Record<
  string,
  { via: string; allowanceMinutes: number; why: string }
> = {
${Object.keys(ROAD_CONTINUES_PAST)
  .sort()
  .map(
    (city) =>
      `  ${JSON.stringify(city)}: {\n` +
      `    via: ${JSON.stringify(ROAD_CONTINUES_PAST[city].viaLabel)},\n` +
      `    allowanceMinutes: ${ROAD_CONTINUES_PAST[city].allowMinutes},\n` +
      `    why:\n      ${JSON.stringify(ROAD_CONTINUES_PAST[city].why)},\n` +
      `  },`
  )
  .join("\n")}
};

/* Pairs with NO ROAD ROUTE AT ALL, which is a fact about the place and not a
 * gap in the data: an island resort has no causeway, and no allowance would
 * bridge it. They are listed rather than omitted so a consumer can tell "there
 * is no road" from "nobody has measured this yet" — the first is an answer, the
 * second is a to-do, and treating them alike either invents a drive or drops the
 * destination. What happens INSTEAD of a drive is in \`transferRoutes.ts\`, which
 * is prose written by a human for exactly these.
 *
 * A CAR-FREE VILLAGE DOES NOT BELONG HERE, which is where this set was wrong.
 * Zermatt sat in it because five points in the village all returned
 * ZERO_RESULTS — no engine routes a car into a car-free village — and the road
 * nevertheless runs to its transfer station, where an electric taxi takes over
 * for the last ten minutes. It is measured, via ROAD_ALLOWANCES. Read a
 * ZERO_RESULTS as a question, not an answer. */
export const NO_ROAD_ROUTE: ReadonlySet<string> = new Set([
${roadless.map((k) => `  ${JSON.stringify(k)},`).join("\n")}
]);

/* A ROAD EXISTS AND THE INSTRUMENT CANNOT SEE IT — a different thing from the
 * set above, and separated so this file never asserts something false.
 *
 * Found by reading the first run's road-less list rather than accepting it:
 * Seoul appeared in it, from both of its airports, which cannot be true. Google
 * publishes no driving directions anywhere in South Korea. Everything else in
 * that list was an island, a reserve or a car-free village, where "no road" is
 * both correct and obviously so — which is exactly why only the absurd entry
 * got caught, and why the reasons are recorded here instead of being left for
 * someone to re-derive.
 *
 * These have no minutes either. The difference is what a reader should do about
 * it: nothing. Do not fill them in by hand from memory, and do not move them
 * into NO_ROAD_ROUTE. \`gatewayRanking.ts\` treats an unknown transfer as
 * unknown and says so rather than assuming a zero. */
export const UNROUTABLE_BY_API: Record<string, string> = {
${unroutable
  .map((k) => `  ${JSON.stringify(k)}:\n    ${JSON.stringify(UNROUTABLE_BY_API[k])},`)
  .join("\n")}
};

function key(city: string, iata: string): string {
  return \`\${city.trim()}|\${iata.trim().toUpperCase()}\`;
}

/** Driving minutes from this airport to this destination, or null both when
 * there is no road route and when the pair has never been measured. Callers
 * that need to tell those two apart use \`hasNoRoadRoute\`. */
export function getTransferMinutes(city: string, iata: string): number | null {
  if (!city || !iata) return null;
  return TRANSFER_TIMES[key(city, iata)]?.minutes ?? null;
}

export function getTransferTime(city: string, iata: string): TransferTime | null {
  if (!city || !iata) return null;
  return TRANSFER_TIMES[key(city, iata)] ?? null;
}

/** True when the pair was measured and has no road route — an island with no
 * causeway. NOT the same as \`getTransferMinutes\` returning null: that is also
 * how an unmeasured pair and an unroutable one read. And NOT true of a car-free
 * village, which has a road up to the point cars are allowed and is measured
 * with an allowance for the rest. */
export function hasNoRoadRoute(city: string, iata: string): boolean {
  if (!city || !iata) return false;
  return NO_ROAD_ROUTE.has(key(city, iata));
}

/** True when a road exists but the routing API cannot return it — Korea, a
 * border crossing, an unmapped reserve track. Distinct from
 * \`hasNoRoadRoute\`, and the reason is the value. */
export function unroutableReason(city: string, iata: string): string | null {
  if (!city || !iata) return null;
  return UNROUTABLE_BY_API[key(city, iata)] ?? null;
}
`;

  fs.writeFileSync(OUTPUT_PATH, out);
  console.log(
    `\nWrote ${OUTPUT_PATH} — ${keys.length} timed pairs, ${roadless.length} road-less. ` +
      `${queried} Distance Matrix requests, ${elements} elements (~$${(elements * 0.005).toFixed(2)}).`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
