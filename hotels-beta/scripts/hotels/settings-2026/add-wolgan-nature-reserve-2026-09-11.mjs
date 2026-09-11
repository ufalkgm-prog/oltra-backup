#!/usr/bin/env node
/* Adds `Nature Reserve` alongside `Mountains` on Emirates Wolgan Valley (1798).
 *
 * Batch 5 found it tagged `Beachfront` while sitting at -33.25, 150.19 — a
 * 7,000-acre conservancy in the Greater Blue Mountains, three hours inland from
 * Sydney. That pass retagged it `Mountains`, which its own highlights assert
 * ("Amazing mountain views"), and left the conservancy for Ulrik rather than
 * assuming a second value. He asked for it.
 *
 * `Mountains` stays primary and the conservancy becomes secondary: the row's
 * own copy leads on the mountains, so that ordering follows the evidence rather
 * than the order the values were added.
 *
 * Checks `Nature Reserve` is still a live choice before writing — it was never
 * retired, but a stored value outside the list renders blank in the admin UI
 * while no filter can select it (§44), and the check costs one request.
 *
 *   node add-wolgan-nature-reserve-2026-09-11.mjs              # dry run
 *   node add-wolgan-nature-reserve-2026-09-11.mjs --confirm    # writes
 */

const U=process.env.DIRECTUS_URL.replace(/\/+$/,""), T=process.env.DIRECTUS_TOKEN;
const H={Authorization:"Bearer "+T,"Content-Type":"application/json"};
const CONFIRM=process.argv.includes("--confirm");
const ID=1798, ADD="Nature Reserve";

const f=await (await fetch(`${U}/fields/hotels/setting`,{headers:H})).json();
const choices=(f.data?.meta?.options?.choices??[]).map(c=>c.value??c.text);
if(!choices.includes(ADD)){ console.error(ADD+" is not a live setting choice. Aborting."); process.exit(1); }

const q=`${U}/items/hotels?limit=-1&filter[id][_eq]=${ID}&fields=id,hotel_name,setting,primary_setting,secondary_setting`;
const {data:rows}=await (await fetch(q,{headers:H})).json();
const row=rows[0];
if(!row){ console.error("1798 not found"); process.exit(1); }
const before={setting:row.setting??[],primary:row.primary_setting??null,secondary:row.secondary_setting??null};
console.log("before: "+JSON.stringify(before.setting)+"  primary="+before.primary+" secondary="+before.secondary);
if(before.setting.includes(ADD)){ console.log("already present — nothing to do"); process.exit(0); }

const after={
  setting:[...before.setting,ADD],
  primary:before.primary,                    // Mountains stays primary
  secondary:before.secondary ?? ADD,         // the conservancy is the supporting fact
};
console.log("after:  "+JSON.stringify(after.setting)+"  primary="+after.primary+" secondary="+after.secondary);
if(!CONFIRM){ console.log("\ndry run — pass --confirm to write"); process.exit(0); }

// Postgres array literal (§4). These values carry no quotes or backslashes,
// so a plain quoted join is sufficient and avoids escaping entirely.
const lit = "{" + after.setting.map(x => '"' + x + '"').join(",") + "}";
const r=await fetch(`${U}/items/hotels/${ID}`,{method:"PATCH",headers:H,
  body:JSON.stringify({setting:lit, primary_setting:after.primary, secondary_setting:after.secondary})});
if(!r.ok){ console.error("FAILED "+r.status+" "+await r.text()); process.exit(1); }
const {data:v}=await (await fetch(q,{headers:H})).json();
console.log("\nverified: "+JSON.stringify(v[0].setting)+"  primary="+v[0].primary_setting+" secondary="+v[0].secondary_setting);
