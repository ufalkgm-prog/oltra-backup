/**
 * City as primary setting for 23 hotels in real cities (Ulrik, 2026-10-02 "edit").
 * The old primary moves to secondary, so a Beachfront/Waterfront filter still finds
 * the hotel; `setting[]` gains "City" if it lacks it. Backs up, writes, reads back.
 *   node scripts/hotels/settings-2026/apply-city-primary-2026-10-02.mjs [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "../../..");
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const H = { Authorization: `Bearer ${env.DIRECTUS_TOKEN}`, "Content-Type": "application/json" };
const DRY = process.argv.includes("--dry-run");

const IDS = [1604, 1617, 1667, 1699, 1735, 1758, 2038, 2030, 1191, 1687, 1749, 2021, 1113, 1622, 2012, 1573, 1105, 2049, 2036, 3031, 1111, 1305, 3018];
// Native text[] column: Directus needs a Postgres array literal, not a JSON array (rules §4).
const toPgArrayLiteral = (arr) => `{${arr.map((v) => `"${String(v).replace(/(["\\])/g, "\\$1")}"`).join(",")}}`;

const cur = (await (await fetch(`${env.DIRECTUS_URL}/items/hotels?fields=id,hotel_name,primary_setting,secondary_setting,setting&limit=-1&filter[id][_in]=${IDS.join(",")}`, { headers: H })).json()).data;
if (cur.length !== IDS.length) throw new Error(`expected ${IDS.length} hotels, found ${cur.length}`);

const plan = cur.map((h) => {
  if (h.primary_setting === "City") throw new Error(`${h.id} is already City`);
  if (h.secondary_setting && h.secondary_setting !== "City") throw new Error(`${h.id} has secondary ${h.secondary_setting}; would be lost`);
  const tags = [...new Set(["City", ...(h.setting || [])])];
  return { id: h.id, name: h.hotel_name, before: { primary: h.primary_setting, secondary: h.secondary_setting, setting: h.setting }, after: { primary_setting: "City", secondary_setting: h.primary_setting, setting: tags } };
});
for (const p of plan) console.log(p.id, p.name, "|", `${p.before.primary}/${p.before.secondary || "-"}`, "->", `City/${p.after.secondary_setting}`, "| tags", p.after.setting.join(","));
if (DRY) process.exit(0);

const rb = path.join(HERE, "rollback-city-primary-2026-10-02.json");
fs.writeFileSync(rb, JSON.stringify(cur, null, 1));
for (const p of plan) {
  const r = await fetch(`${env.DIRECTUS_URL}/items/hotels/${p.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ primary_setting: "City", secondary_setting: p.after.secondary_setting, setting: toPgArrayLiteral(p.after.setting) }) });
  if (!r.ok) { console.log("FAILED", p.id, r.status, (await r.text()).slice(0, 200)); process.exit(1); }
}
const after = Object.fromEntries((await (await fetch(`${env.DIRECTUS_URL}/items/hotels?fields=id,primary_setting,secondary_setting,setting&limit=-1&filter[id][_in]=${IDS.join(",")}`, { headers: H })).json()).data.map((a) => [a.id, a]));
const ok = plan.filter((p) => { const a = after[p.id]; return a.primary_setting === "City" && a.secondary_setting === p.after.secondary_setting && JSON.stringify([...a.setting].sort()) === JSON.stringify([...p.after.setting].sort()); }).length;
console.log(`updated ${plan.length}, readback OK ${ok}, rollback ${rb}`);
