/**
 * Hotel name check: apply the approved renames (Ulrik, 2026-10-02 "edit").
 * Groups 1-3 in full, group 4 minus the 7 held back, group 5 per the
 * no-brand-phrase rule. Backs up every touched record, writes, reads back.
 *   node scripts/hotels/name-check/apply-renames.mjs [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "../../..");
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const H = { Authorization: `Bearer ${env.DIRECTUS_TOKEN}`, "Content-Type": "application/json" };
const DRY = process.argv.includes("--dry-run");

const p = JSON.parse(fs.readFileSync("C:/Users/ufalk/dev/oltra-agents/agents/database-agent/hotels/pending/hotel-name-proposal-2026-10-02.json"));
const HOLD = new Set([1251, 1692, 1435, 1184, 1146, 3031, 2031]);
const GROUP5 = { 1330: "Grand-Hôtel du Cap-Ferrat", 2010: "Villa Sant'Andrea", 2014: "Savute Elephant Lodge", 2052: "Castiglion del Bosco" };

const plan = [];
for (const g of ["remove_place", "spelling", "add_place", "other_words"]) for (const r of p.groups[g]) if (!HOLD.has(r.id)) plan.push({ id: r.id, from: r.current, to: r.proposed, group: g });
for (const r of p.groups.brand_phrase) if (GROUP5[r.id]) plan.push({ id: r.id, from: r.current, to: GROUP5[r.id], group: "brand_phrase" });
if (plan.length !== 114) throw new Error(`expected 114 renames, built ${plan.length}`);

const ids = plan.map((r) => r.id);
const cur = (await (await fetch(`${env.DIRECTUS_URL}/items/hotels?fields=*&limit=-1&filter[id][_in]=${ids.join(",")}`, { headers: H })).json()).data;
const byId = Object.fromEntries(cur.map((c) => [c.id, c]));
const stale = plan.filter((r) => (byId[r.id]?.hotel_name || "").trim() !== r.from.trim());
if (stale.length) { console.log("ABORT: stored name changed since the proposal:", stale.map((s) => `${s.id} '${byId[s.id]?.hotel_name}'`).join("; ")); process.exit(1); }
if (DRY) { console.log("dry run ok:", plan.length); process.exit(0); }

const rb = path.join(HERE, "output", "rollback-renames-2026-10-02.json");
fs.writeFileSync(rb, JSON.stringify(cur, null, 1));
const r = await fetch(`${env.DIRECTUS_URL}/items/hotels`, { method: "PATCH", headers: H, body: JSON.stringify(plan.map((x) => ({ id: x.id, hotel_name: x.to }))) });
if (!r.ok) { console.log("patch failed", r.status, (await r.text()).slice(0, 300)); process.exit(1); }
const after = Object.fromEntries((await (await fetch(`${env.DIRECTUS_URL}/items/hotels?fields=id,hotel_name&limit=-1&filter[id][_in]=${ids.join(",")}`, { headers: H })).json()).data.map((a) => [a.id, a.hotel_name]));
const ok = plan.filter((x) => after[x.id] === x.to).length;
console.log(`renamed ${plan.length}, readback OK ${ok}, full backup ${rb}`);
