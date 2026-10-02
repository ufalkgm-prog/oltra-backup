/**
 * Contact-field check: one Brave search per restaurant whose address is unconfirmed,
 * so the address can be read from the venue's own site or a guide before geocoding.
 *   node scripts/restaurants/contact-check/address-search.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  fs.readFileSync(path.join(HERE, "../../../.env.local"), "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }),
);
const KEY = env.BRAVE_API_KEY || env.BRAVE_API;
const LIST = [
  [998, "Moody Tongue", "Chicago"], [1030, "BiBo", "Doha"], [1033, "Masala Library by Jiggs Kalra", "Doha"],
  [1038, "TONO by Akira Back", "Doha"], [1055, "Ossiano", "Dubai"], [1059, "Smoked Room", "Dubai"],
  [1371, "Filippo Pietrasanta", "Pietrasanta"], [1589, "Vetri Cucina", "Las Vegas"], [435, "Sadler", "Milan"],
  [1938, "Koral", "Rio de Janeiro"], [513, "Retrobottega", "Rome"], [1848, "La Terrasse Hôtel de la Ponche", "Saint-Tropez"],
  [1871, "Les Palmiers", "Saint-Tropez"], [1873, "Jardin Tropézina", "Ramatuelle"], [2003, "Amaia", "Santiago"],
  [2011, "Aquí Está Coco", "Santiago"], [2012, "La Misión", "Santiago"], [2200, "Jojo", "São Paulo"],
  [605, "Nour", "Stockholm"], [672, "Kanda", "Tokyo Toranomon"],
];
const strip = (s) => (s || "").replace(/<[^>]+>/g, "");
const out = {};
for (const [id, name, city] of LIST) {
  const q = `${name} ${city} restaurant address`;
  const r = await fetch(`https://api.search.brave.com/res/v1/web/search?count=8&q=${encodeURIComponent(q)}`, { headers: { "X-Subscription-Token": KEY, Accept: "application/json" } });
  const j = await r.json();
  out[id] = { q, results: (j.web?.results || []).map((o) => ({ url: o.url, title: strip(o.title), snippet: strip(o.description) })) };
  console.log(`\n## ${id} ${name} (${city})`);
  for (const o of out[id].results.slice(0, 5)) console.log(" -", o.url.slice(0, 55), "|", o.title.slice(0, 45), "|", o.snippet.slice(0, 170));
  await new Promise((res) => setTimeout(res, 1100));
}
fs.writeFileSync(path.join(HERE, "output", "address-search-2026-10-02.json"), JSON.stringify(out, null, 1));
