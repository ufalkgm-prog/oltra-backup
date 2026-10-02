/**
 * Contact-field check, phase B: classify the evidence collected by collect.mjs.
 *
 * Settles every field the evidence proves and writes the rest to a per-city research
 * queue for the agents. Rules (Ulrik, 2026-10-02):
 *   - Instagram: only an account for that specific restaurant; never chef, brand or hotel.
 *   - Phone: the official website's number wins; a Google disagreement goes to review.
 *   - Website: own domain, loads, and the page can be tied to the venue (name in the
 *     title, or Google's phone/street on the page) — a 200 alone is not proof (a hijacked
 *     domain answered 200 in Paris).
 *
 *   node scripts/restaurants/contact-check/classify.mjs
 * Writes output/classified/<city>.json and prints a tally.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(HERE, "output", "raw");
const OUT = path.join(HERE, "output", "classified");
fs.mkdirSync(OUT, { recursive: true });

const fold = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const STOP = new Set(["restaurant", "restaurante", "ristorante", "the", "and", "les", "des", "par", "bar", "cafe", "hotel", "paris", "club", "beach", "chez", "dining", "room", "grill", "house", "kitchen", "by", "di", "da", "del", "la", "le", "el", "il", "lo", "de", "at", "of"]);
const tokens = (s) => fold(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w));
const host = (u) => { try { return new URL(u).host.replace(/^www\./, "").toLowerCase(); } catch { return null; } };
const igUrl = (h) => `https://www.instagram.com/${h}/`;
const igHandle = (u) => (u || "").match(/instagram\.com\/([A-Za-z0-9_.]+)/i)?.[1]?.replace(/\.+$/, "").toLowerCase() || null;
const AGGREGATOR = /thefork|tripadvisor|opentable|resy\.com|yelp\.|sevenrooms|tablecheck|tabelog|google\.|facebook\.com|instagram\.com|linktr\.ee|michelin\.com|zomato|quandoo|bookatable/i;
const DEAD = (s) => s && (s.status === 0 || s.status === 404 || s.status === 410 || (s.status >= 500 && !s.blocked));

const nameTie = (rec, text) => {
  const t = fold(text);
  return tokens(rec.restaurant_name).some((w) => t.includes(w));
};
// Hijacked or parked domains seen in wave 1: slot/gambling pages, domain-for-sale pages, test pages
const HIJACK = /slot|togel|gacor|casino|judi|poker|betting|qris|domain (is )?for sale|domainmarket|buy this domain|parked|hugedomains|dan.com|^test$/i;
const hijacked = (s) => s && HIJACK.test(s.title || "");
const siteTied = (rec, s) => s && s.status === 200 && !s.blocked && !hijacked(s) && (nameTie(rec, s.title) || s.phone_on_site || s.street_on_site);
// Tied by the page title alone: a short name can match an unrelated business (Cala, Lima)
const titleOnly = (s) => s && !s.phone_on_site && !s.street_on_site;

const raws = fs.readdirSync(RAW).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(RAW, f))));

// collection-wide handle counts: one handle on several records is a shared (brand) account
const handleCount = {};
for (const r of raws) {
  const hs = new Set([igHandle(r.record.insta), ...r.sites.flatMap((s) => s.instagram || [])].filter(Boolean));
  for (const h of hs) handleCount[h] = (handleCount[h] || 0) + 1;
}

const byCity = {};
for (const { record: rec, google, sites } of raws) {
  const out = { id: rec.id, name: rec.restaurant_name, hotel: rec.hotel_name_hint || null, country: rec.country, status_live: rec.status, research: [] };
  const ask = (field, why) => out.research.push({ field, why });

  // --- Google match ---
  const g = google?.places?.[0];
  const gName = g && (nameTie(rec, g.name) || tokens(g.name).some((w) => fold(rec.restaurant_name).includes(w)));
  const gOK = !!g && ((gName && (g.dist_m == null || g.dist_m <= 1500)) || (g.dist_m != null && g.dist_m <= 150));
  out.google = g ? { ...g, accepted: gOK } : null;
  if (!gOK) ask("all", g ? `Google's best match '${g.name}' at ${g.dist_m} m may not be this venue` : "no Google match");

  if (gOK && g.status && g.status !== "OPERATIONAL") out.closure_note = `Google status ${g.status}`;

  const s0 = rec.www ? sites[0] : null;
  const gs = sites.find((s) => s !== s0) || null;
  const tied = [s0, gs].filter((s) => siteTied(rec, s));

  // --- www ---
  if (rec.www && AGGREGATOR.test(rec.www) && !/gorp\.jp/i.test(rec.www)) {
    out.www = { status: "FLAGGED", old: rec.www, value: null, note: "stored value is an aggregator or social page" };
    ask("www", "stored www is not the venue's own site");
  } else if (s0) {
    if (siteTied(rec, s0)) {
      const moved = host(s0.final_url) !== host(rec.www);
      out.www = moved
        ? { status: "CORRECTED", old: rec.www, value: s0.final_url, source: `stored URL redirects to ${s0.final_url}, which loads and names the venue` }
        : { status: "CONFIRMED", old: rec.www, value: rec.www, source: "loads (200) and names the venue" };
      if (titleOnly(s0)) ask("www", `tied by page title only ('${s0.title}') — confirm the page is this restaurant, not a same-named business`);
    } else if (s0.blocked) {
      if (gOK && g.website && host(g.website) === host(rec.www)) out.www = { status: "CONFIRMED", old: rec.www, value: rec.www, source: "blocks automated fetches; the same domain is the website on the venue's Google profile", review: "bot-blocked" };
      else { out.www = { status: "FLAGGED", old: rec.www, value: rec.www, note: `HTTP ${s0.status} (bot-blocked); not confirmable automatically` }; out.review_link = true; }
    } else if (DEAD(s0) && siteTied(rec, gs)) {
      out.www = { status: "CORRECTED", old: rec.www, value: gs.final_url, source: `stored URL dead (${s0.status || s0.error}); Google's website loads and names the venue` };
    } else if (hijacked(s0)) {
      out.www = { status: "FLAGGED", old: rec.www, value: null, note: `domain hijacked or parked (title '${s0.title}')` };
      ask("www", out.www.note + (gs ? `; Google lists ${gs.url} (${gs.status})` : ""));
    } else if (s0.status === 200) {
      out.www = { status: "FLAGGED", old: rec.www, value: null, note: `loads but nothing ties it to the venue (title '${s0.title}') — possible hijack or wrong site` };
      ask("www", out.www.note);
    } else {
      out.www = { status: "FLAGGED", old: rec.www, value: null, note: `stored URL fails (${s0.status || s0.error})` };
      ask("www", out.www.note + (gs ? `; Google lists ${gs.url} (${gs.status})` : ""));
    }
  } else if (siteTied(rec, gs) && !AGGREGATOR.test(gs.final_url)) {
    out.www = { status: "FILLED", old: null, value: gs.final_url, source: "the website on the venue's Google profile; loads and names the venue" };
  } else {
    out.www = { status: "FLAGGED", old: null, value: null, note: "no website stored or on Google" };
    ask("www", "find the official website, or confirm none exists");
  }

  // --- phone (website wins) ---
  const onSite = tied.some((s) => s.phone_on_site);
  const siteTels = [...new Set(tied.flatMap((s) => s.tel || []).map((t) => t.replace(/[^\d+]/g, "")))];
  if (gOK && g.phone && onSite) out.phone = { status: "FILLED", value: g.phone, source: "official site + Google profile (same number)" };
  else if (tied.length && siteTels.length) { out.phone = { status: "FLAGGED", value: null, note: `site number(s) ${siteTels.join(", ")}; Google ${g?.phone || "none"}` }; ask("phone", "format the official site's number; differs from Google" + ` (${out.phone.note})`); out.phone_review = true; }
  else if (!tied.length && gOK && g.phone) { out.phone = { status: "FILLED", value: g.phone, source: "Google profile only — no official site could be read", note: "review" }; out.phone_review = true; }
  else { out.phone = { status: "FLAGGED", value: null, note: `not found on the site${g?.phone ? `; Google has ${g.phone}` : ""}` }; ask("phone", "read the official site (contact/reservations page) for the number" + (g?.phone ? `; Google has ${g.phone}` : "")); }

  // --- address ---
  if (gOK && g.address && tied.some((s) => s.street_on_site)) out.address = { status: "FILLED", value: g.address, source: "Google profile; street confirmed on the official site" };
  else if (gOK && g.address && !tied.length) out.address = { status: "FILLED", value: g.address, source: "Google profile only — no official site could be read", note: "review" };
  else { out.address = { status: "FLAGGED", value: null, note: g?.address ? `Google has '${g.address}'; street not found on the site` : "no address source" }; ask("address", out.address.note); }

  // --- coordinates ---
  if (gOK && g.dist_m != null && g.dist_m > 300) out.coords = { status: "CORRECTED", old: { lat: +rec.lat, lng: +rec.lng }, value: { lat: +g.lat.toFixed(5), lng: +g.lng.toFixed(5) }, source: `Google location of the matched place (${g.dist_m} m from stored)` };
  else if (gOK && g.dist_m != null) out.coords = { status: "CONFIRMED", note: `within ${g.dist_m} m of Google` };
  else out.coords = { status: "FLAGGED", note: "no accepted Google match" };

  // --- Instagram: restaurant-specific only ---
  const stored = igHandle(rec.insta);
  const fromGoogle = igHandle(g?.website);
  const cands = [...new Set([...tied.flatMap((s) => s.instagram || []), fromGoogle].filter(Boolean))];
  const hotelTie = (h) => rec.hotel_name_hint && tokens(rec.hotel_name_hint).some((w) => fold(h).includes(w));
  const specific = cands.filter((h) => handleCount[h] === 1 && nameTie(rec, h.replace(/[._]/g, " ")) && !hotelTie(h));
  const hotelVenue = !!rec.hotel_name_hint;
  if (specific.length === 1) {
    const h = specific[0];
    out.insta = stored === h ? { status: "CONFIRMED", old: rec.insta, value: igUrl(h), source: "linked from the official site" }
      : stored ? { status: "FLAGGED", old: rec.insta, value: igUrl(h), note: `site links @${h}; stored @${stored}` }
      : { status: "FILLED", old: null, value: igUrl(h), source: fromGoogle === h ? "the website link on the venue's Google profile" : "linked from the official site" };
    if (out.insta.status === "FLAGGED") ask("insta", out.insta.note);
  } else {
    out.insta = { status: "FLAGGED", old: rec.insta || null, value: null, note: `candidates: ${cands.map((h) => "@" + h + (handleCount[h] > 1 ? ` (on ${handleCount[h]} records)` : "")).join(", ") || "none"}${stored ? `; stored @${stored}${handleCount[stored] > 1 ? ` (on ${handleCount[stored]} records)` : ""}` : ""}${hotelVenue ? "; hotel restaurant — hotel account not acceptable" : ""}` };
    ask("insta", out.insta.note);
  }

  (byCity[rec.city] ||= []).push(out);
}

const tally = { records: 0, research_records: 0, research_fields: 0 };
const per = {};
for (const [city, rows] of Object.entries(byCity)) {
  rows.sort((a, b) => a.id - b.id);
  fs.writeFileSync(path.join(OUT, `${city.replace(/[^\p{L}\p{N}]+/gu, "-")}.json`), JSON.stringify({ city, rows }, null, 1));
  const q = rows.filter((r) => r.research.length);
  per[city] = `${rows.length} recs, ${q.length} need research`;
  tally.records += rows.length; tally.research_records += q.length; tally.research_fields += q.reduce((s, r) => s + r.research.length, 0);
  for (const r of rows) for (const k of ["www", "insta", "phone", "address", "coords"]) { const s = r[k].status; (tally[k] ||= {})[s] = (tally[k][s] || 0) + 1; }
  for (const r of rows) for (const a of r.research) (tally.why ||= {})[a.field] = ((tally.why[a.field]) || 0) + 1;
  for (const r of rows) if (r.closure_note) (tally.closures ||= []).push(`${city} ${r.id} ${r.name}: ${r.closure_note}`);
}
console.log(JSON.stringify(tally, null, 1));
if (process.argv.includes("--per-city")) console.log(per);
