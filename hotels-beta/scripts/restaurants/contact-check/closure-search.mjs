/**
 * Contact-field check: one Brave search per restaurant whose closure rests on Google alone.
 *   node scripts/restaurants/contact-check/closure-search.mjs
 * Prints the top results and saves them to output/closure-search-<date>.json.
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
  [1243, "Le Rabassier", "Brussels"], [930, "Sacro", "Buenos Aires"], [960, "Merchant Bar & Grill", "Cape Town"],
  [131, "Iluka", "Copenhagen"], [1077, "Boca", "Dubai"], [1412, "L'Arôme", "Frankfurt"], [1449, "Buoy", "Hamburg"],
  [1460, "VLET Speicherstadt", "Hamburg"], [243, "Spring Deer", "Hong Kong"], [1206, "Dulce Patria", "Mexico City"],
  [1760, "Mural Restaurant", "Munich"], [1843, "Olympen", "Oslo"], [1998, "La Picantería", "Santiago"],
  [554, "Soseoul Hannam", "Seoul"], [618, "Soyokaze", "Stockholm"], [641, "Yellow restaurant", "Sydney"],
  [1576, "Le Cirque Bellagio", "Las Vegas"], [1111, "Hakkasan", "Istanbul"],
];
const strip = (s) => (s || "").replace(/<[^>]+>/g, "");
const out = {};
for (const [id, name, city] of LIST) {
  const q = `${name} ${city} restaurant closed`;
  const r = await fetch(`https://api.search.brave.com/res/v1/web/search?count=8&q=${encodeURIComponent(q)}`, { headers: { "X-Subscription-Token": KEY, Accept: "application/json" } });
  const j = await r.json();
  out[id] = { q, results: (j.web?.results || []).map((o) => ({ url: o.url, title: strip(o.title), snippet: strip(o.description), age: o.age || o.page_age || null })) };
  console.log(`\n## ${id} ${name} (${city})`);
  for (const o of out[id].results.slice(0, 6)) console.log(" -", String(o.age || "").slice(0, 12), "|", o.url.slice(0, 60), "|", o.title.slice(0, 60), "|", o.snippet.slice(0, 160));
  await new Promise((res) => setTimeout(res, 1100));
}
fs.writeFileSync(path.join(HERE, "output", "closure-search-2026-10-02.json"), JSON.stringify(out, null, 1));
