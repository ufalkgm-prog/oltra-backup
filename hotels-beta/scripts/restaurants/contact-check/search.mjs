/**
 * Contact-field check, phase B2: web search for the fields that need one
 * (Instagram, and websites still unknown), via Serper (Google results) or Brave.
 *
 * One query per record: `"<restaurant name>" <city> instagram`. Results are cached as
 * output/search/<id>.json. Uses SERPER_API_KEY if set, else BRAVE_API_KEY.
 *
 *   node scripts/restaurants/contact-check/search.mjs            # every record that needs it
 *   node scripts/restaurants/contact-check/search.mjs --limit 20 # trial run
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLS = path.join(HERE, "output", "classified");
const AG = path.join(HERE, "output", "agent");
const OUT = path.join(HERE, "output", "search");
fs.mkdirSync(OUT, { recursive: true });

const env = Object.fromEntries(
  fs.readFileSync(path.join(HERE, "../../../.env.local"), "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }),
);
const SERPER = env.SERPER_API_KEY, BRAVE = env.BRAVE_API_KEY || env.BRAVE_API;
if (!SERPER && !BRAVE) { console.error("set SERPER_API_KEY or BRAVE_API_KEY in .env.local"); process.exit(1); }
const args = process.argv.slice(2);
const LIMIT = args.includes("--limit") ? +args[args.indexOf("--limit") + 1] : Infinity;

async function search(q) {
  if (SERPER) {
    const r = await fetch("https://google.serper.dev/search", { method: "POST", headers: { "X-API-KEY": SERPER, "Content-Type": "application/json" }, body: JSON.stringify({ q, num: 10 }) });
    if (!r.ok) throw new Error(`serper ${r.status} ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    return { engine: "serper", results: (j.organic || []).map((o) => ({ title: o.title, url: o.link, snippet: o.snippet })) };
  }
  const r = await fetch(`https://api.search.brave.com/res/v1/web/search?count=10&q=${encodeURIComponent(q)}`, { headers: { "X-Subscription-Token": BRAVE, Accept: "application/json" } });
  if (!r.ok) throw new Error(`brave ${r.status} ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return { engine: "brave", results: (j.web?.results || []).map((o) => ({ title: o.title, url: o.url, snippet: o.description })) };
}

// A field still needs search when the script flagged it and no agent settled it
const settled = (a) => a && a.status && a.status !== "FLAGGED";
// wave-1 agents wrote some "no account" answers without searching (2026-10-02); search those too
const UNSEARCHED = new Set(fs.existsSync(path.join(HERE, "output", "unsearched-ids.json")) ? JSON.parse(fs.readFileSync(path.join(HERE, "output", "unsearched-ids.json"))) : []);
const queue = [];
for (const file of fs.readdirSync(CLS).filter((f) => f.endsWith(".json"))) {
  const { city, rows } = JSON.parse(fs.readFileSync(path.join(CLS, file)));
  const agent = fs.existsSync(path.join(AG, file)) ? Object.fromEntries(JSON.parse(fs.readFileSync(path.join(AG, file))).map((a) => [a.id, a])) : {};
  for (const r of rows) {
    const a = agent[r.id] || {};
    if (/^CLOSED/i.test(a.closure_note || "")) continue;
    const needInsta = (r.insta.status === "FLAGGED" && !settled(a.insta)) || UNSEARCHED.has(r.id);
    const needWww = r.www.status === "FLAGGED" && !settled(a.www);
    if (needInsta || needWww) queue.push({ id: r.id, city, name: r.name, needInsta, needWww });
  }
}
console.log(`${queue.length} records need a search`);

let done = 0, used = 0;
for (const q of queue.slice(0, LIMIT)) {
  const file = path.join(OUT, `${q.id}.json`);
  if (fs.existsSync(file)) continue;
  // Brave tested best unquoted with "restaurant" (2026-10-02); a missing website gets its own query
  const queries = [];
  if (q.needInsta) queries.push(["insta", `${q.name} ${q.city} restaurant instagram`]);
  if (q.needWww) queries.push(["www", `${q.name} ${q.city} restaurant official website`]);
  try {
    const out = { ...q, searched_at: new Date().toISOString() };
    for (const [kind, query] of queries) {
      const res = await search(query);
      used++;
      out[kind] = { query, ...res };
      await new Promise((r) => setTimeout(r, 1100));
    }
    fs.writeFileSync(file, JSON.stringify(out, null, 1));
  } catch (e) { console.error(q.id, q.name, e.message); if (/40[13]|429|quota|credits/i.test(e.message)) break; }
  if (++done % 50 === 0) console.log(`${done}/${Math.min(queue.length, LIMIT)}`);
}
console.log(`finished: ${used} queries used`);
