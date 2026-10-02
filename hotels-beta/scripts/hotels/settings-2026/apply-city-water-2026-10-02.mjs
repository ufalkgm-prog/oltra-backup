/**
 * Water settings for city hotels on large rivers, canals and harbours
 * (Ulrik, 2026-10-02 "edit"): Waterfront for 13 river/canal hotels, Oceanfront
 * for the three Victoria Harbour hotels and Hotel Cipriani (Venice lagoon).
 * Adds the value to setting[] and makes it secondary_setting where that is empty.
 * Refuses a hotel that already carries another water value (rules §42B: one
 * water value per hotel). Backs up, writes, reads back.
 *   node scripts/hotels/settings-2026/apply-city-water-2026-10-02.mjs [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "../../..");
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const H = { Authorization: `Bearer ${env.DIRECTUS_TOKEN}`, "Content-Type": "application/json" };
const DRY = process.argv.includes("--dry-run");

const VALUE = {
  // Waterfront: Seine, Grand Canal x3, Chao Phraya, Huangpu x2, Vltava, Arno, Chicago River x2, Yarra, Dubai Water Canal
  ...Object.fromEntries([1323, 1423, 1466, 1479, 1201, 1095, 1076, 1278, 1483, 1728, 1766, 1796, 1612].map((id) => [id, "Waterfront"])),
  // Oceanfront: Victoria Harbour x3, Venice lagoon
  ...Object.fromEntries([1106, 1087, 1094, 1427].map((id) => [id, "Oceanfront"])),
};
const WATER = ["Beachfront", "Waterfront", "Oceanfront", "Coastal"];
const toPgArrayLiteral = (arr) => `{${arr.map((v) => `"${String(v).replace(/(["\\])/g, "\\$1")}"`).join(",")}}`;

const ids = Object.keys(VALUE).map(Number);
const cur = (await (await fetch(`${env.DIRECTUS_URL}/items/hotels?fields=id,hotel_name,primary_setting,secondary_setting,setting&limit=-1&filter[id][_in]=${ids.join(",")}`, { headers: H })).json()).data;
if (cur.length !== ids.length) throw new Error(`expected ${ids.length}, found ${cur.length}`);
const plan = cur.map((h) => {
  const v = VALUE[h.id];
  const other = [h.primary_setting, h.secondary_setting, ...(h.setting || [])].filter((t) => WATER.includes(t) && t !== v);
  if (other.length) throw new Error(`${h.id} ${h.hotel_name} already carries ${other.join(",")}`);
  const patch = { setting: [...new Set([...(h.setting || []), v])] };
  if (!h.secondary_setting) patch.secondary_setting = v;
  return { id: h.id, name: h.hotel_name, v, patch, before: { secondary: h.secondary_setting, setting: h.setting } };
});
for (const p of plan) console.log(p.id, p.name, "|", p.v, "| secondary", p.before.secondary || "-", "->", p.patch.secondary_setting || p.before.secondary, "| tags", p.patch.setting.join(","));
if (DRY) process.exit(0);

const rb = path.join(HERE, "rollback-city-water-2026-10-02.json");
fs.writeFileSync(rb, JSON.stringify(cur, null, 1));
for (const p of plan) {
  const r = await fetch(`${env.DIRECTUS_URL}/items/hotels/${p.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ ...p.patch, setting: toPgArrayLiteral(p.patch.setting) }) });
  if (!r.ok) { console.log("FAILED", p.id, r.status, (await r.text()).slice(0, 200)); process.exit(1); }
}
const after = Object.fromEntries((await (await fetch(`${env.DIRECTUS_URL}/items/hotels?fields=id,secondary_setting,setting&limit=-1&filter[id][_in]=${ids.join(",")}`, { headers: H })).json()).data.map((a) => [a.id, a]));
const ok = plan.filter((p) => (after[p.id].setting || []).includes(p.v) && (!p.patch.secondary_setting || after[p.id].secondary_setting === p.v)).length;
console.log(`updated ${plan.length}, readback OK ${ok}, rollback ${rb}`);
