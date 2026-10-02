/**
 * Le Guanahani (1251) after the Rosewood → Airelles handover (Ulrik, 2026-10-03 "edit"):
 * KAYAK becomes the partner (id 71661, unverified; RateHawk has no Airelles hotels),
 * the Rosewood spa and kids' club leave the description, Instagram becomes "n.a.",
 * and the hotel is unpublished with a status note until it reopens on 1 Nov 2026.
 *   node scripts/hotels/name-check/apply-guanahani-airelles-2026-10-03.mjs [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "../../..");
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const H = { Authorization: `Bearer ${env.DIRECTUS_TOKEN}`, "Content-Type": "application/json" };
const DRY = process.argv.includes("--dry-run");
const ID = 1251;

const OLD_SENTENCE = "Sense, A Rosewood Spa adds a wellness retreat shaped by local botanicals and French beauty traditions, while the resort also offers pools, fitness, tennis, Rosewood Explorers for children, beach service and a strong watersports program.";
const NEW_SENTENCE = "The spa adds a wellness retreat, while the resort also offers two pools, fitness, tennis, beach service and a strong watersports program.";
const NOTE = "Closed for the Rosewood to Airelles handover (Rosewood management ended 1 Oct 2026). Reopens as Airelles Le Guanahani on 1 Nov 2026: republish then, after checking KAYAK 71661 carries the Airelles name and rates. Unpublished on Ulrik's instruction 2026-10-03.";

const cur = (await (await fetch(`${env.DIRECTUS_URL}/items/hotels/${ID}?fields=*`, { headers: H })).json()).data;
const n = cur.description.split(OLD_SENTENCE).length - 1;
if (n !== 1) throw new Error(`expected the Rosewood sentence once, found ${n}`);
const patch = {
  published: false,
  status_notes: [cur.status_notes, NOTE].filter(Boolean).join("\n"),
  booking_partner: "kayak",
  kayak_hotel_id: 71661,
  kayak_status: "unverified",
  kayak_checked_at: new Date().toISOString(),
  ratehawk_status: "passive",
  insta: "n.a.",
  description: cur.description.split(OLD_SENTENCE).join(NEW_SENTENCE),
};
console.log(Object.keys(patch).map((k) => `${k}: ${JSON.stringify(cur[k]).slice(0, 60)} -> ${JSON.stringify(patch[k]).slice(0, 60)}`).join("\n"));
if (DRY) process.exit(0);

const rb = path.join(HERE, "output", "rollback-guanahani-2026-10-03.json");
fs.writeFileSync(rb, JSON.stringify(cur, null, 1));
const r = await fetch(`${env.DIRECTUS_URL}/items/hotels/${ID}`, { method: "PATCH", headers: H, body: JSON.stringify(patch) });
if (!r.ok) { console.log("FAILED", r.status, (await r.text()).slice(0, 300)); process.exit(1); }
const a = (await (await fetch(`${env.DIRECTUS_URL}/items/hotels/${ID}?fields=*`, { headers: H })).json()).data;
const bad = Object.keys(patch).filter((k) => k !== "kayak_checked_at" && String(a[k]) !== String(patch[k]));
console.log(bad.length ? `MISMATCH on ${bad.join(", ")}` : `all ${Object.keys(patch).length} fields read back correctly`, `| rollback ${rb}`);
