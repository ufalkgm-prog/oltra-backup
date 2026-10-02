/**
 * Contact-field check: condense the search results into one judging queue per city.
 *
 *   node scripts/restaurants/contact-check/prepare-insta.mjs
 * Writes output/insta-queue/<City>.json: per record, the stored handle, what the site
 * linked, and every Instagram profile (handle, title, snippet) the search returned;
 * for a missing website, the top non-aggregator results.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLS = path.join(HERE, "output", "classified");
const SRCH = path.join(HERE, "output", "search");
const OUT = path.join(HERE, "output", "insta-queue");
fs.mkdirSync(OUT, { recursive: true });

const NOT_PROFILE = new Set(["p", "reel", "reels", "explore", "popular", "stories", "accounts", "tv", "about"]);
const profile = (u) => { const m = (u || "").match(/instagram\.com\/([A-Za-z0-9_.]+)\/?(\?.*)?$/i); return m && !NOT_PROFILE.has(m[1].toLowerCase()) ? m[1].toLowerCase() : null; };
const AGG = /tripadvisor|thefork|opentable|resy\.com|yelp\.|michelin\.com|facebook\.com|instagram\.com|tiktok|booking\.com|zomato|sevenrooms|timeout\.com|wikipedia|foursquare|quandoo|eater\.com|lefooding|gaultmillau|theworlds50best|laliste/i;
const strip = (s) => (s || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

let rows = 0;
for (const file of fs.readdirSync(CLS).filter((f) => f.endsWith(".json"))) {
  const { city, rows: cls } = JSON.parse(fs.readFileSync(path.join(CLS, file)));
  const queue = [];
  for (const r of cls) {
    const sp = path.join(SRCH, `${r.id}.json`);
    if (!fs.existsSync(sp)) continue;
    const s = JSON.parse(fs.readFileSync(sp));
    const item = { id: r.id, name: r.name, hotel: r.hotel, city, stored_insta: r.insta.old || null, script_note: r.insta.note || null };
    if (s.insta) {
      const seen = new Set();
      item.instagram_candidates = s.insta.results.map((o) => ({ handle: profile(o.url), title: strip(o.title), snippet: strip(o.snippet).slice(0, 220) }))
        .filter((c) => c.handle && !seen.has(c.handle) && seen.add(c.handle)).slice(0, 6);
      item.insta_query = s.insta.query;
    }
    if (s.www) {
      item.www_candidates = s.www.results.filter((o) => !AGG.test(o.url)).slice(0, 5).map((o) => ({ url: o.url, title: strip(o.title), snippet: strip(o.snippet).slice(0, 160) }));
      item.www_query = s.www.query;
      item.www_note = r.www.note || null;
    }
    queue.push(item);
  }
  if (queue.length) { fs.writeFileSync(path.join(OUT, file), JSON.stringify({ city, rows: queue }, null, 1)); rows += queue.length; }
}
console.log("queued", rows);
