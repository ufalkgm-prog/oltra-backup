// Read-only. Exports every distinct state_province_county_island value across
// the whole hotels collection (published and not), with the countries and
// cities it appears in and its hotel count — the input to the value-level
// triage that splits the column into admin_region + traveller area.
//
// Usage: DIRECTUS_URL=... DIRECTUS_TOKEN=... node scripts/hotels/geo-2026/export-geo-values.mjs
import fs from "fs/promises";

const DIRECTUS_URL = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
if (!DIRECTUS_URL || !DIRECTUS_TOKEN) throw new Error("Missing DIRECTUS_URL or DIRECTUS_TOKEN");

const res = await fetch(
  `${DIRECTUS_URL}/items/hotels?fields=id,hotel_name,published,country,region,city,local_area,state_province_county_island,admin_region&limit=-1`,
  { headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` } }
);
const { data } = await res.json();
const t = (v) => (v ?? "").trim();

const byValue = new Map();
for (const h of data) {
  const v = t(h.state_province_county_island);
  if (!v) continue;
  const k = `${t(h.country)}||${v}`;
  if (!byValue.has(k)) byValue.set(k, { value: v, country: t(h.country), count: 0, cities: new Set(), hotels: [] });
  const e = byValue.get(k);
  e.count += 1;
  if (t(h.city)) e.cities.add(t(h.city));
  e.hotels.push({ id: h.id, name: t(h.hotel_name), city: t(h.city), published: h.published });
}

const out = [...byValue.values()]
  .map((e) => ({ ...e, cities: [...e.cities].sort() }))
  .sort((a, b) => a.country.localeCompare(b.country) || b.count - a.count || a.value.localeCompare(b.value));

await fs.mkdir("scripts/hotels/geo-2026/output", { recursive: true });
await fs.writeFile("scripts/hotels/geo-2026/output/geo-values.json", JSON.stringify(out, null, 2));
console.log(`${data.length} hotels | ${out.length} country+value pairs | ${new Set(out.map(e=>e.value)).size} distinct values`);
for (const e of out) {
  console.log(`${e.country} :: ${e.value} (${e.count}) :: ${e.cities.slice(0, 6).join(", ")}`);
}
