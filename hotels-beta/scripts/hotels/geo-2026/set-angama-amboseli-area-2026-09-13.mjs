// Sets Angama Amboseli's traveller area (`state_province_county_island`) to
// "Amboseli", on Ulrik's instruction, 2026-09-13.
//
// The row had been given city "Kimana Sanctuary" - the private sanctuary east
// of the park where the lodge stands - and its area was left blank, so a
// search for Amboseli no longer found it. Kimana Sanctuary is not a name a
// traveller types; Amboseli is. This is the Cernobbio / Lake Como shape (§3).
//
// Usage (from hotels-beta/):
//   node --env-file=.env.local scripts/hotels/geo-2026/set-angama-amboseli-area-2026-09-13.mjs [--confirm]
// Without --confirm it only reports. Writes a rollback file before patching and
// verifies by independent readback.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROLLBACK = path.join(HERE, "set-angama-amboseli-area-2026-09-13-rollback.json");
const U = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const T = process.env.DIRECTUS_TOKEN;
if (!U || !T) throw new Error("Set DIRECTUS_URL and DIRECTUS_TOKEN.");

const ID = "1008";
const FIELD = "state_province_county_island";
const VALUE = "Amboseli";
const FIELDS = `id,hotel_name,city,${FIELD},admin_region,country,published`;
const h = { Authorization: `Bearer ${T}`, "Content-Type": "application/json" };

const read = async () => {
  const r = await fetch(`${U}/items/hotels/${ID}?fields=${FIELDS}`, { headers: h });
  if (!r.ok) throw new Error(`read ${r.status}: ${await r.text()}`);
  return (await r.json()).data;
};

const before = await read();
console.log("before:", JSON.stringify(before));
if (before.hotel_name !== "Angama Amboseli") throw new Error(`id ${ID} is not Angama Amboseli`);
// No process.exit(): on Windows it trips a libuv assertion while fetch's
// handles are still closing.
if (before[FIELD] === VALUE) console.log("already set, nothing to do");
else if (!process.argv.includes("--confirm")) console.log(`dry run: would set ${FIELD} ${JSON.stringify(before[FIELD])} -> ${JSON.stringify(VALUE)}`);
else await apply();

async function apply() {
fs.writeFileSync(ROLLBACK, JSON.stringify({ id: ID, [FIELD]: before[FIELD] }, null, 2) + "\n");
const p = await fetch(`${U}/items/hotels/${ID}`, { method: "PATCH", headers: h, body: JSON.stringify({ [FIELD]: VALUE }) });
if (!p.ok) throw new Error(`patch ${p.status}: ${await p.text()}`);

const after = await read();
console.log("after: ", JSON.stringify(after));
if (after[FIELD] !== VALUE) throw new Error("readback does not match");
for (const k of Object.keys(before)) if (k !== FIELD && before[k] !== after[k]) throw new Error(`${k} changed unexpectedly`);
console.log("verified.");
}
