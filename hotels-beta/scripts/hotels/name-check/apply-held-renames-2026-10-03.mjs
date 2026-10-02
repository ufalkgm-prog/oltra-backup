/**
 * The seven held-back hotel names, resolved by Ulrik on the review page
 * (2026-10-03 "edit and delete"): six renames with their description wording,
 * Le Guanahani's move to Airelles (name, website, affiliation), and Salamander
 * Washington DC deleted. Full records backed up first; every edit asserts the
 * text it replaces is there exactly once.
 *   node scripts/hotels/name-check/apply-held-renames-2026-10-03.mjs [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "../../..");
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const H = { Authorization: `Bearer ${env.DIRECTUS_TOKEN}`, "Content-Type": "application/json" };
const DRY = process.argv.includes("--dry-run");

const RENAMES = {
  1146: { hotel_name: "The Tokyo EDITION, Toranomon" },
  1184: {
    hotel_name: "Solaire Resort Entertainment City",
    description: [[
      "Sky Tower is the more exclusive hotel address within Solaire Resort Entertainment City, the integrated resort on Manila Bay in Parañaque.",
      "Solaire Resort Entertainment City is the integrated resort on Manila Bay in Parañaque, and its Sky Tower is the more exclusive hotel address within it.",
    ]],
  },
  1435: { hotel_name: "Reschio", description: [["Castello di Reschio lies in the hills", "Reschio lies in the hills"]] },
  2031: { hotel_name: "Mandarin Oriental Al Faisaliah, Riyadh", description: [["Mandarin Oriental, Riyadh occupies", "Mandarin Oriental Al Faisaliah, Riyadh occupies"]] },
  3031: { hotel_name: "Old Cataract, Aswan" },
  1251: {
    hotel_name: "Airelles Le Guanahani",
    www: "https://airelles.com/en/destination/saint-barthelemy",
    affiliation: "Airelles",
    description: [
      ["Rosewood Le Guanahani St. Barth", "Airelles Le Guanahani"],
      ["while staying polished in the Rosewood manner", "while staying polished"],
    ],
  },
};
const DELETE = [1692]; // Salamander Washington DC

const ids = [...Object.keys(RENAMES).map(Number), ...DELETE];
const cur = (await (await fetch(`${env.DIRECTUS_URL}/items/hotels?fields=*&limit=-1&filter[id][_in]=${ids.join(",")}`, { headers: H })).json()).data;
if (cur.length !== ids.length) throw new Error(`expected ${ids.length}, found ${cur.length}`);
const byId = Object.fromEntries(cur.map((c) => [c.id, c]));

const patches = [];
for (const [id, spec] of Object.entries(RENAMES)) {
  const h = byId[id]; const patch = { id: +id };
  for (const k of ["hotel_name", "www", "affiliation"]) if (spec[k]) patch[k] = spec[k];
  if (spec.description) {
    let d = h.description;
    for (const [from, to] of spec.description) {
      const n = d.split(from).length - 1;
      if (n !== 1) throw new Error(`${id}: expected '${from.slice(0, 40)}…' once in description, found ${n}`);
      d = d.split(from).join(to);
    }
    patch.description = d;
  }
  patches.push(patch);
  console.log(id, h.hotel_name, "->", patch.hotel_name, Object.keys(patch).filter((k) => k !== "id").join(","));
}
console.log("delete:", DELETE.map((id) => `${id} ${byId[id].hotel_name}`).join(", "));
if (DRY) process.exit(0);

const rb = path.join(HERE, "output", "rollback-held-renames-2026-10-03.json");
fs.writeFileSync(rb, JSON.stringify(cur, null, 1));
const r1 = await fetch(`${env.DIRECTUS_URL}/items/hotels`, { method: "PATCH", headers: H, body: JSON.stringify(patches) });
if (!r1.ok) { console.log("patch failed", r1.status, (await r1.text()).slice(0, 300)); process.exit(1); }
const r2 = await fetch(`${env.DIRECTUS_URL}/items/hotels`, { method: "DELETE", headers: H, body: JSON.stringify(DELETE) });
console.log("delete", r2.status);

const after = Object.fromEntries((await (await fetch(`${env.DIRECTUS_URL}/items/hotels?fields=*&limit=-1&filter[id][_in]=${ids.join(",")}`, { headers: H })).json()).data.map((a) => [a.id, a]));
// Directus returns hotel ids as strings, so compare everything but the id.
const ok = patches.filter((p) => Object.entries(p).every(([k, v]) => k === "id" || after[p.id]?.[k] === v)).length;
console.log(`updated ${patches.length}, readback OK ${ok}; deleted still present: ${DELETE.filter((id) => after[id]).length}; full backup ${rb}`);
