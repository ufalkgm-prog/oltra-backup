// Read-only. Exports every hotel still missing admin_region, grouped by
// country+city, with any already-classified sibling in the same city — the
// input to the step-4 per-hotel proposal.
//
// Usage: DIRECTUS_URL=... DIRECTUS_TOKEN=... node scripts/hotels/geo-2026/export-geo-gaps.mjs
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

const classified = data.filter((h) => t(h.admin_region));
const gaps = data.filter((h) => !t(h.admin_region));

// sibling lookup: country+city -> the distinct (admin, area) pairs already in use
const byCity = new Map();
for (const h of classified) {
  const k = `${t(h.country)}||${t(h.city)}`;
  if (!byCity.has(k)) byCity.set(k, new Map());
  const pair = JSON.stringify([t(h.admin_region), t(h.state_province_county_island)]);
  byCity.get(k).set(pair, (byCity.get(k).get(pair) ?? 0) + 1);
}
// vocabulary already in use per country, so proposals reuse rather than invent
const vocab = new Map();
for (const h of classified) {
  const c = t(h.country);
  if (!vocab.has(c)) vocab.set(c, { admin: new Set(), area: new Set() });
  vocab.get(c).admin.add(t(h.admin_region));
  if (t(h.state_province_county_island)) vocab.get(c).area.add(t(h.state_province_county_island));
}

const rows = gaps.map((h) => {
  const k = `${t(h.country)}||${t(h.city)}`;
  const sib = byCity.get(k);
  const pairs = sib ? [...sib.entries()].map(([p, n]) => ({ pair: JSON.parse(p), n })) : [];
  return {
    id: Number(h.id),
    hotel_name: t(h.hotel_name),
    published: h.published,
    country: t(h.country),
    region: t(h.region),
    city: t(h.city),
    local_area: t(h.local_area),
    siblings: pairs,
  };
});

rows.sort((a, b) => a.country.localeCompare(b.country) || a.city.localeCompare(b.city) || a.id - b.id);

await fs.mkdir("scripts/hotels/geo-2026/output", { recursive: true });
await fs.writeFile("scripts/hotels/geo-2026/output/geo-gaps.json", JSON.stringify(rows, null, 2));

const tier1 = rows.filter((r) => r.siblings.length === 1);
const amb = rows.filter((r) => r.siblings.length > 1);
console.log(`${gaps.length} hotels missing admin_region`);
console.log(`  tier 1 - one classified sibling in the same city: ${tier1.length}`);
console.log(`  ambiguous - siblings disagree: ${amb.length}`);
console.log(`  no sibling - needs classifying: ${rows.length - tier1.length - amb.length}`);
console.log(`\nby country (no-sibling only):`);
const noSib = rows.filter((r) => r.siblings.length === 0);
const byCountry = new Map();
for (const r of noSib) byCountry.set(r.country, (byCountry.get(r.country) ?? 0) + 1);
for (const [c, n] of [...byCountry.entries()].sort((a, b) => b[1] - a[1])) {
  const v = vocab.get(c);
  console.log(`  ${String(n).padStart(3)}  ${c}  ${v ? `[admin in use: ${[...v.admin].sort().join(", ")}]` : "[no vocabulary yet]"}`);
}
