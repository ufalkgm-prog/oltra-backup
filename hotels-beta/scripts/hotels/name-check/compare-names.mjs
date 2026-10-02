/**
 * Hotel name check: for a sample of published hotels whose myOLTRA name contains
 * the city, line up four names side by side.
 *   - myOLTRA:  hotels.hotel_name
 *   - RateHawk: ETG static dump (scripts/ratehawk/output/filtered-hotels.jsonl) by ratehawk_hid
 *   - KAYAK:    oltra-agents kayak-hotel-matches.csv (kayak_name)
 *   - Official: Google Business Profile display name, and the hotel website's
 *               og:site_name / <title>
 * Read-only against Directus. ~US$0.035 per Google call.
 *
 *   node scripts/hotels/name-check/compare-names.mjs [--n 100]   # sample with the city in the name
 *   node scripts/hotels/name-check/compare-names.mjs --all       # every published hotel
 * Writes output/name-check-<date>.json.
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "../../..");
const OUT = path.join(HERE, "output");
fs.mkdirSync(OUT, { recursive: true });
const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }),
);
const args = process.argv.slice(2);
const N = args.includes("--n") ? +args[args.indexOf("--n") + 1] : 100;
const ALL = args.includes("--all");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const fold = (s) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

// 1. Sample: published hotels whose name contains their city, evenly spread by id
const hotels = (await (await fetch(`${env.DIRECTUS_URL}/items/hotels?fields=id,hotel_name,city,country,affiliation,www,lat,lng,ratehawk_hid,kayak_hotel_id&limit=-1&filter[published][_eq]=true&sort=id`, { headers: { Authorization: `Bearer ${env.DIRECTUS_TOKEN}` } })).json()).data;
const pool = hotels.filter((h) => h.city && fold(h.hotel_name).includes(fold(h.city)));
const step = pool.length / N;
const sample = ALL ? hotels : Array.from({ length: Math.min(N, pool.length) }, (_, i) => pool[Math.floor(i * step)]);
console.log(`published ${hotels.length}, city in name ${pool.length}, sampled ${sample.length}`);

// 2. RateHawk names from the static dump
const want = new Map(sample.filter((h) => h.ratehawk_hid).map((h) => [Number(h.ratehawk_hid), h.id]));
const rh = {};
const rl = readline.createInterface({ input: fs.createReadStream(path.join(ROOT, "scripts/ratehawk/output/filtered-hotels.jsonl")) });
for await (const line of rl) {
  const m = line.match(/^\{"hid":(\d+),/); if (!m || !want.has(+m[1])) continue;
  const j = JSON.parse(line); rh[want.get(j.hid)] = j.name;
  if (Object.keys(rh).length === want.size) { rl.close(); break; }
}

// 3. KAYAK names
const kayak = {};
const csv = fs.readFileSync("C:/Users/ufalk/dev/oltra-agents/agents/database-agent/hotels/pending/kayak-hotel-matches.csv", "utf8").split(/\r?\n/);
const head = csv[0].split(",");
const parseCsv = (line) => { const out = []; let cur = "", q = false; for (const ch of line) { if (ch === '"') q = !q; else if (ch === "," && !q) { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out; };
for (const line of csv.slice(1)) { if (!line) continue; const c = parseCsv(line); const row = Object.fromEntries(head.map((h, i) => [h, c[i]])); if (row.kayak_name) kayak[+row.directus_id] = row.kayak_name; }

// 4. Google display name + website name
async function google(h) {
  const body = { textQuery: `${h.hotel_name} ${h.city}`, maxResultCount: 1 };
  if (h.lat && h.lng) body.locationBias = { circle: { center: { latitude: +h.lat, longitude: +h.lng }, radius: 3000 } };
  const r = await fetch("https://places.googleapis.com/v1/places:searchText", { method: "POST", headers: { "Content-Type": "application/json", "X-Goog-Api-Key": env.GOOGLE_MAPS_API_KEY, "X-Goog-FieldMask": "places.displayName,places.websiteUri" }, body: JSON.stringify(body) });
  const p = (await r.json()).places?.[0];
  return p ? { name: p.displayName?.text || null, website: p.websiteUri || null } : null;
}
async function site(url) {
  if (!url) return null;
  const c = new AbortController(); const t = setTimeout(() => c.abort(), 15000);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en" }, redirect: "follow", signal: c.signal });
    const h = (await r.text()).slice(0, 300000);
    const dec = (s) => s?.replace(/&amp;/g, "&").replace(/&#0?39;|&rsquo;/g, "'").replace(/&#8211;|&ndash;/g, "–").replace(/&#8212;|&mdash;/g, "—").replace(/\s+/g, " ").trim() || null;
    return { status: r.status, siteName: dec(h.match(/property=["']og:site_name["'][^>]*content=["']([^"']+)/i)?.[1] || h.match(/content=["']([^"']+)["'][^>]*property=["']og:site_name/i)?.[1]), title: dec(h.match(/<title[^>]*>([^<]*)/i)?.[1])?.slice(0, 140) };
  } catch (e) { return { status: 0, error: String(e.cause?.code || e.name) }; } finally { clearTimeout(t); }
}

const rows = [];
let i = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  while (i < sample.length) {
    const h = sample[i++];
    const [g, s] = await Promise.all([google(h), site(h.www)]);
    rows.push({ id: h.id, city: h.city, country: h.country, affiliation: h.affiliation, oltra: (h.hotel_name || "").trim(), ratehawk: rh[h.id] || null, kayak: kayak[h.id] || null, google: g?.name || null, siteName: s?.siteName || null, siteTitle: s?.title || null, www: h.www });
  }
}));
rows.sort((a, b) => a.id - b.id);
const file = path.join(OUT, `name-check-${ALL ? "all-" : ""}${new Date().toISOString().slice(0, 10)}.json`);
fs.writeFileSync(file, JSON.stringify(rows, null, 1));
console.log("written", file, rows.length);
