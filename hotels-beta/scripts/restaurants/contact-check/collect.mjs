/**
 * Contact-field check, phase A: collect evidence for every restaurant.
 *
 * Per record, cached as output/raw/<id>.json so a re-run resumes:
 *   - Google Business Profile (Places API Text Search, biased to the stored coordinates)
 *   - the stored website (and Google's website when it is a different URL), plus one
 *     same-site contact page: HTTP status, final URL, title, Instagram links, tel: links,
 *     whether Google's phone number and street appear on the site
 *
 * Read-only against Directus. Costs ~US$0.035 per Places call.
 *
 *   node scripts/restaurants/contact-check/collect.mjs --all            # every city except Paris
 *   node scripts/restaurants/contact-check/collect.mjs --city "Rome"   # one city (repeatable)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "output", "raw");
fs.mkdirSync(OUT, { recursive: true });

const env = Object.fromEntries(
  fs.readFileSync(path.join(HERE, "../../../.env.local"), "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }),
);
const DIRECTUS = env.DIRECTUS_URL, TOKEN = env.DIRECTUS_TOKEN, GKEY = env.GOOGLE_MAPS_API_KEY;

const args = process.argv.slice(2);
const cities = args.flatMap((a, i) => (a === "--city" ? [args[i + 1]] : []));
const ALL = args.includes("--all");
const CONC = 8;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

const IG_SKIP = new Set(["p", "reel", "reels", "explore", "stories", "accounts", "sharer", "share", "tv", "about", "legal", "developer", "direct", "web", "embed.js", "static", "privacy"]);

function distM(a, b, c, d) {
  const t = Math.PI / 180, x = (d - b) * t * Math.cos(((a + c) / 2) * t), y = (c - a) * t;
  return Math.round(Math.sqrt(x * x + y * y) * 6371e3);
}
const fold = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

async function google(r) {
  const q = [r.restaurant_name, r.hotel_name_hint, r.city].filter(Boolean).join(" ");
  const body = { textQuery: q, maxResultCount: 3 };
  if (r.lat && r.lng) body.locationBias = { circle: { center: { latitude: +r.lat, longitude: +r.lng }, radius: 2000 } };
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json", "X-Goog-Api-Key": GKEY,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.internationalPhoneNumber,places.nationalPhoneNumber,places.websiteUri,places.location,places.businessStatus,places.primaryType",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { error: res.status, text: (await res.text()).slice(0, 300) };
  const j = await res.json();
  return {
    query: q,
    places: (j.places || []).map((p) => ({
      place_id: p.id, name: p.displayName?.text, type: p.primaryType, status: p.businessStatus,
      address: p.formattedAddress, phone: p.internationalPhoneNumber || null, website: p.websiteUri || null,
      lat: p.location?.latitude, lng: p.location?.longitude,
      dist_m: r.lat && p.location ? distM(+r.lat, +r.lng, p.location.latitude, p.location.longitude) : null,
    })),
  };
}

async function get(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20000);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en,fr;q=0.8" }, redirect: "follow", signal: ctl.signal });
    const html = (await res.text()).slice(0, 1_500_000);
    return { status: res.status, final_url: res.url, html };
  } catch (e) {
    return { status: 0, error: String(e.cause?.code || e.name || e.message).slice(0, 80) };
  } finally { clearTimeout(timer); }
}

function analyse(html, g) {
  const title = (html.match(/<title[^>]*>([^<]*)/i) || [])[1]?.trim().slice(0, 160) || null;
  const flat = html.replace(/\\\//g, "/");
  const ig = [...new Set([...flat.matchAll(/instagram\.com\/([A-Za-z0-9_.]{2,30})/gi)]
    .map((m) => m[1].replace(/\.+$/, "").toLowerCase()).filter((h) => !IG_SKIP.has(h)))];
  const tel = [...new Set([...flat.matchAll(/href=["']tel:([^"']{6,30})["']/gi)].map((m) => decodeURIComponent(m[1]).trim()))];
  // Google's number on the site: compare the national significant digits against digit runs in the page
  let phone_on_site = null;
  if (g?.phone) {
    const nsn = g.phone.replace(/^\+\d{1,3}\s*/, "").replace(/\D/g, "");
    const runs = [...flat.matchAll(/\+?\d[\d\s().\-\/]{5,22}\d/g)].map((m) => m[0].replace(/\D/g, ""));
    phone_on_site = nsn.length >= 6 && runs.some((d) => d.endsWith(nsn) || (d.length >= 8 && nsn.endsWith(d)));
  }
  let street_on_site = null;
  if (g?.address) {
    const street = fold(g.address.split(",").find((s) => /[a-z]{4}/i.test(s)) || "");
    const word = street.split(/[^a-z]+/).filter((w) => w.length >= 4).sort((a, b) => b.length - a.length)[0];
    if (word) street_on_site = fold(flat).includes(word);
  }
  return { title, instagram: ig.slice(0, 12), tel: tel.slice(0, 8), phone_on_site, street_on_site };
}

function contactLink(html, base) {
  const m = [...html.matchAll(/href=["']([^"'#]+)["']/gi)].map((x) => x[1])
    .find((h) => /contact|kontakt|contatt|contacto|info|find-us|location|reserv/i.test(h) && !/mailto:|tel:|instagram|facebook|wp-content|wp-includes|\.(css|js|png|jpe?g|svg|webp|pdf|xml|json|ico|woff2?)(\?|$)/i.test(h));
  if (!m) return null;
  try { const u = new URL(m, base); return u.host === new URL(base).host ? u.href : null; } catch { return null; }
}

async function site(url, g) {
  const p = await get(url);
  const out = { url, status: p.status, final_url: p.final_url || null, error: p.error || null };
  if (!p.html) return out;
  Object.assign(out, analyse(p.html, g));
  out.blocked = [401, 403, 429, 503].includes(p.status) || /just a moment|access denied|attention required/i.test(out.title || "");
  const c = !out.blocked && p.status === 200 ? contactLink(p.html, p.final_url) : null;
  if (c && c !== p.final_url) {
    const q = await get(c);
    if (q.html && q.status === 200) {
      const a = analyse(q.html, g);
      out.contact_page = c;
      out.instagram = [...new Set([...out.instagram, ...a.instagram])];
      out.tel = [...new Set([...out.tel, ...a.tel])];
      out.phone_on_site = out.phone_on_site || a.phone_on_site;
      out.street_on_site = out.street_on_site || a.street_on_site;
    }
  }
  return out;
}

async function one(r) {
  const file = path.join(OUT, `${r.id}.json`);
  if (fs.existsSync(file)) return "cached";
  const g = GKEY ? await google(r) : { error: "no key" };
  const best = g.places?.[0];
  const sites = [];
  if (r.www) sites.push(await site(r.www, best));
  if (best?.website && !/instagram\.com|facebook\.com/i.test(best.website)) {
    const host = (u) => { try { return new URL(u).host.replace(/^www\./, ""); } catch { return u; } };
    const sameAsStored = r.www && host(best.website) === host(r.www) && sites[0]?.status === 200;
    if (!sameAsStored) sites.push(await site(best.website, best));
  }
  fs.writeFileSync(file, JSON.stringify({ record: r, google: g, sites, collected_at: new Date().toISOString() }, null, 1));
  return "done";
}

const fields = "id,status,restaurant_name,restaurant_type,city,country,local_area,lat,lng,www,insta,hotel_name_hint,phone,address";
let filter = "";
if (cities.length) filter = `&filter[city][_in]=${encodeURIComponent(cities.join(","))}`;
else if (ALL) filter = `&filter[city][_neq]=Paris`;
else { console.error("pass --all or --city <name>"); process.exit(1); }
const res = await fetch(`${DIRECTUS}/items/restaurants?limit=-1&sort=city,id&fields=${fields}${filter}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
const rows = (await res.json()).data;
console.log(`${rows.length} restaurants`);

let i = 0, n = 0;
await Promise.all(Array.from({ length: CONC }, async () => {
  while (i < rows.length) {
    const r = rows[i++];
    try { await one(r); } catch (e) { console.error(r.id, r.restaurant_name, e.message); }
    if (++n % 50 === 0) console.log(`${n}/${rows.length}`);
  }
}));
console.log("finished", n);
