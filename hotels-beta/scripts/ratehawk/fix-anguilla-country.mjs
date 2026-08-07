// One-off fix: 4 hotels genuinely in Anguilla were tagged country="British Virgin
// Islands" in Directus (state_province_county_island already correctly says
// "Anguilla" for all 4; lat/lng also confirm Anguilla, not BVI). Found while
// investigating why they had zero Ratehawk match candidates (see CLAUDE.md §26).
//
// Usage (from hotels-beta/):
//   DIRECTUS_URL=... DIRECTUS_TOKEN=... node scripts/ratehawk/fix-anguilla-country.mjs

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;

if (!DIRECTUS_URL) throw new Error("Missing DIRECTUS_URL in environment");
if (!DIRECTUS_TOKEN) throw new Error("Missing DIRECTUS_TOKEN in environment");

const IDS = ["1237", "1238", "1239", "1240"];

for (const id of IDS) {
  const url = `${DIRECTUS_URL.replace(/\/$/, "")}/items/hotels/${id}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${DIRECTUS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ country: "Anguilla" })
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`FAILED id ${id}: ${res.status}\n${text}`);
    continue;
  }
  const json = JSON.parse(text);
  console.log(`OK id ${id}: ${json.data.hotel_name} -> country = ${json.data.country}`);
}
