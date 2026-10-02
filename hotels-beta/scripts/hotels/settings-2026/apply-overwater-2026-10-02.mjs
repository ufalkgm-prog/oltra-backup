/**
 * Overwater for hotels with real overwater villas (Ulrik, 2026-10-02 "edit"):
 * secondary_setting = "Overwater" and "Overwater" added to setting[]. A replaced
 * secondary value stays in setting[], so it remains searchable. Includes the two
 * unpublished Maldives resorts. Backs up, writes, reads back.
 *   node scripts/hotels/settings-2026/apply-overwater-2026-10-02.mjs [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "../../..");
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const H = { Authorization: `Bearer ${env.DIRECTUS_TOKEN}`, "Content-Type": "application/json" };
const DRY = process.argv.includes("--dry-run");

const MALDIVES = [1155, 1156, 1157, 1158, 1159, 1160, 1163, 1164, 1165, 1166, 1167, 1168, 1169, 1170, 1171, 1172, 2007, 1175, 1176, 1177, 2067, 1173, 1179, 1180, 1178, 1181];
const ELSEWHERE = [1834, 1644, 1234]; // Nujuma, Rosewood Mayakoba, Six Senses Ninh Van Bay
const UNPUBLISHED = [1161, 1162]; // Emerald Maldives, Four Seasons Private Island at Voavah
const IDS = [...MALDIVES, ...ELSEWHERE, ...UNPUBLISHED];
const toPgArrayLiteral = (arr) => `{${arr.map((v) => `"${String(v).replace(/(["\\])/g, "\\$1")}"`).join(",")}}`;

const cur = (await (await fetch(`${env.DIRECTUS_URL}/items/hotels?fields=id,hotel_name,published,primary_setting,secondary_setting,setting&limit=-1&filter[id][_in]=${IDS.join(",")}`, { headers: H })).json()).data;
if (cur.length !== IDS.length) throw new Error(`expected ${IDS.length}, found ${cur.length}`);
const plan = cur.map((h) => {
  const tags = [...new Set([...(h.setting || []), ...(h.secondary_setting ? [h.secondary_setting] : []), "Overwater"])];
  return { id: h.id, name: h.hotel_name, published: h.published, replacedSecondary: h.secondary_setting && h.secondary_setting !== "Overwater" ? h.secondary_setting : null, tags };
});
for (const p of plan) console.log(p.id, p.name, p.published ? "" : "(unpublished)", "| secondary was", p.replacedSecondary || "-", "| tags", p.tags.join(","));
if (DRY) process.exit(0);

const rb = path.join(HERE, "rollback-overwater-2026-10-02.json");
fs.writeFileSync(rb, JSON.stringify(cur, null, 1));
for (const p of plan) {
  const r = await fetch(`${env.DIRECTUS_URL}/items/hotels/${p.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ secondary_setting: "Overwater", setting: toPgArrayLiteral(p.tags) }) });
  if (!r.ok) { console.log("FAILED", p.id, r.status, (await r.text()).slice(0, 200)); process.exit(1); }
}
const after = (await (await fetch(`${env.DIRECTUS_URL}/items/hotels?fields=id,secondary_setting,setting&limit=-1&filter[id][_in]=${IDS.join(",")}`, { headers: H })).json()).data;
const ok = after.filter((a) => a.secondary_setting === "Overwater" && (a.setting || []).includes("Overwater")).length;
const all = (await (await fetch(`${env.DIRECTUS_URL}/items/hotels?fields=id,published,setting&limit=-1`, { headers: H })).json()).data;
console.log(`updated ${plan.length}, readback OK ${ok}; published hotels tagged Overwater now: ${all.filter((a) => a.published && (a.setting || []).includes("Overwater")).length}; rollback ${rb}`);
