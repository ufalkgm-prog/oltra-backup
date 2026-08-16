// Classifies every published hotel as active / passive / not_integrated on
// Ratehawk. READ-ONLY — writes a JSON report, never touches Directus. Feed the
// report to apply-ratehawk-status-<date>.mjs to write the field.
//
// Usage (from hotels-beta/):
//   node --env-file=.env.local scripts/ratehawk/probe-ratehawk-status.mjs
//   ... --only 1602,1610          # restrict to specific Directus ids
//   ... --windows 2026-09-30,2026-11-14
//   ... --out output/custom.json
//
// WHY THE WINDOWS ARE NEAR-TO-MID, NOT "FAR IN THE FUTURE"
// -------------------------------------------------------
// The obvious design — probe dates well ahead so nothing is merely sold out —
// gives the wrong answer. Measured 2026-08-16 against the full inventory:
//
//   2026-09-30 -> 570 hotels with rates      2027-05-12 -> 567
//   2026-11-14 -> 561                        2027-10-05 ->  96   <-- collapse
//   2027-01-13 -> 557
//
// A window ~14 months out returns almost nothing, because most hotels have not
// loaded inventory that far ahead. Probing far into the future measures how far
// ahead rates are loaded, not whether a hotel is on Ratehawk at all.
//
// Several windows are still required: any single one sits around 560, well
// under the 663 that are bookable on at least one — roughly 95 hotels are
// merely sold out on a given window and would be mislabelled by one probe.
//
// Cost is trivial: /search/serp/hotels/ takes up to 300 hids per request (§32),
// so the whole 817-hotel inventory is 3 requests per window, ~12 in total.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, "output");

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
const RATEHAWK_URL = process.env.RATEHAWK_API_URL || "https://api.ratehawk.com";
const RATEHAWK_KEY_ID = process.env.RATEHAWK_KEY_ID;
const RATEHAWK_KEY = process.env.RATEHAWK_KEY;

if (!DIRECTUS_URL || !DIRECTUS_TOKEN || !RATEHAWK_KEY_ID || !RATEHAWK_KEY) {
  console.error(
    "Missing env. Needs DIRECTUS_URL, DIRECTUS_TOKEN, RATEHAWK_KEY_ID, RATEHAWK_KEY.\n" +
      "Run with: node --env-file=.env.local scripts/ratehawk/probe-ratehawk-status.mjs"
  );
  process.exit(1);
}

// Roughly +1.5, +3, +5 and +9 months. Regenerated from today's date on each run
// so the horizon effect above can never creep back in as the file ages.
function defaultWindows() {
  const out = [];
  for (const days of [45, 90, 150, 270]) {
    const checkin = new Date();
    checkin.setDate(checkin.getDate() + days);
    const checkout = new Date(checkin);
    checkout.setDate(checkout.getDate() + 3);
    out.push([iso(checkin), iso(checkout)]);
  }
  return out;
}

function iso(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
}

const HIDS_PER_REQUEST = 300; // ETG hard limit, §32.
const RESIDENCY = "gb";
const CURRENCY = "EUR";
const GUESTS = [{ adults: 2, children: [] }];

async function fetchHotels() {
  const fields = "id,hotel_name,affiliation,country,city,www,ratehawk_hid,ratehawk_image_1";
  const res = await fetch(
    `${DIRECTUS_URL}/items/hotels?fields=${fields}&filter[published][_eq]=true&limit=-1`,
    { headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` } }
  );
  if (!res.ok) throw new Error(`Directus fetch failed: ${res.status}`);
  return (await res.json()).data ?? [];
}

async function serpBatch(hids, checkin, checkout) {
  const res = await fetch(`${RATEHAWK_URL}/api/b2b/v3/search/serp/hotels/`, {
    method: "POST",
    headers: {
      Authorization:
        "Basic " + Buffer.from(`${RATEHAWK_KEY_ID}:${RATEHAWK_KEY}`).toString("base64"),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      checkin,
      checkout,
      residency: RESIDENCY,
      language: "en",
      guests: GUESTS,
      hids,
      currency: CURRENCY,
    }),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || json?.status !== "ok") {
    // Surfaced rather than swallowed: a failed request must not be read as
    // "these hotels have no rates", which would silently mark them passive.
    throw new Error(
      `serp/hotels failed (${res.status} ${json?.status ?? "?"}): ${JSON.stringify(json?.error ?? {})}`
    );
  }
  return json.data?.hotels ?? [];
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function main() {
  const onlyIds = arg("only")
    ? new Set(arg("only").split(",").map((value) => value.trim()))
    : null;

  const windows = arg("windows")
    ? chunk(arg("windows").split(",").map((v) => v.trim()), 1).map(([checkin]) => {
        const checkout = new Date(`${checkin}T00:00:00`);
        checkout.setDate(checkout.getDate() + 3);
        return [checkin, iso(checkout)];
      })
    : defaultWindows();

  const all = await fetchHotels();
  const hotels = onlyIds ? all.filter((h) => onlyIds.has(String(h.id))) : all;

  const withHid = hotels.filter((h) => h.ratehawk_hid && h.ratehawk_image_1);
  const notIntegrated = hotels.filter((h) => !h.ratehawk_hid || !h.ratehawk_image_1);

  console.log(
    `${hotels.length} published hotels — ${withHid.length} probeable, ` +
      `${notIntegrated.length} not_integrated (no hid or no image).`
  );
  console.log(`Windows: ${windows.map(([a, b]) => `${a}..${b}`).join("  ")}`);

  const hidToHotel = new Map(withHid.map((h) => [Number(h.ratehawk_hid), h]));
  const hids = [...hidToHotel.keys()];
  const seenIn = new Map(hids.map((hid) => [hid, []]));

  for (const [checkin, checkout] of windows) {
    let windowHits = 0;
    for (const batch of chunk(hids, HIDS_PER_REQUEST)) {
      const results = await serpBatch(batch, checkin, checkout);
      for (const hotel of results) {
        if (!(hotel.rates ?? []).length) continue;
        const hid = Number(hotel.hid);
        if (!seenIn.has(hid)) continue;
        seenIn.get(hid).push(checkin);
        windowHits += 1;
      }
    }
    console.log(`  ${checkin}  ->  ${windowHits} with rates`);
  }

  const rows = [
    ...withHid.map((hotel) => {
      const windowsWithRates = seenIn.get(Number(hotel.ratehawk_hid)) ?? [];
      return {
        id: hotel.id,
        hotel_name: hotel.hotel_name,
        affiliation: hotel.affiliation ?? null,
        country: hotel.country ?? null,
        www: hotel.www ?? null,
        ratehawk_hid: hotel.ratehawk_hid,
        windows_with_rates: windowsWithRates,
        status: windowsWithRates.length ? "active" : "passive",
      };
    }),
    ...notIntegrated.map((hotel) => ({
      id: hotel.id,
      hotel_name: hotel.hotel_name,
      affiliation: hotel.affiliation ?? null,
      country: hotel.country ?? null,
      www: hotel.www ?? null,
      ratehawk_hid: hotel.ratehawk_hid ?? null,
      windows_with_rates: [],
      status: "not_integrated",
      reason: !hotel.ratehawk_hid ? "no_hid" : "no_images",
    })),
  ];

  const counts = rows.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});

  console.log(
    `\nactive ${counts.active ?? 0} · passive ${counts.passive ?? 0} · ` +
      `not_integrated ${counts.not_integrated ?? 0}`
  );

  const outPath = arg("out")
    ? path.resolve(arg("out"))
    : path.join(OUTPUT_DIR, `ratehawk-status-${iso(new Date())}.json`);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      { probed_at: new Date().toISOString(), windows, residency: RESIDENCY, counts, rows },
      null,
      2
    )
  );
  console.log(`Wrote ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
