/**
 * Contact-field check, phase C: merge the script's classification with the research
 * agents' answers and stage the result in oltra-agents (new files only).
 *
 *   node scripts/restaurants/contact-check/merge.mjs --date 2026-10-02 [--write]
 * Without --write it prints the tally only.
 *
 * Writes, under oltra-agents/agents/database-agent/restaurants/:
 *   pending/contact-check-<city>-<date>.json      one proposal per city
 *   pending/contact-check-ALL-<date>-report.md    tally + method
 *   flagged/contact-check-ALL-<date>-manual-review.md   every link a person must click
 * Refuses to overwrite an existing file.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLS = path.join(HERE, "output", "classified");
const AG = path.join(HERE, "output", "agent");
const AGI = path.join(HERE, "output", "agent-insta"); // the later Instagram search pass; overrides insta
const STAGE = "C:/Users/ufalk/dev/oltra-agents/agents/database-agent/restaurants";
const args = process.argv.slice(2);
const DATE = args[args.indexOf("--date") + 1] || new Date().toISOString().slice(0, 10);
const WRITE = args.includes("--write");
const F = ["www", "insta", "phone", "address", "coords"];
const slug = (c) => c.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const total = {}; const review = { closures: [], insta_changed: [], insta: [], www: [], phone: [], address: [], coords: [], unresolved: [] };
const cityFiles = [];
const add = (k, v) => review[k].push(v);

for (const file of fs.readdirSync(CLS).filter((f) => f.endsWith(".json")).sort()) {
  const { city, rows } = JSON.parse(fs.readFileSync(path.join(CLS, file)));
  const load = (dir) => (fs.existsSync(path.join(dir, file)) ? JSON.parse(fs.readFileSync(path.join(dir, file))) : []);
  const agent = {};
  for (const a of load(AG)) agent[a.id] = { ...a };
  for (const a of load(AGI)) agent[a.id] = { ...(agent[a.id] || { id: a.id }), ...a };
  const records = rows.map((r) => {
    const a = agent[r.id] || {};
    const rec = { id: r.id, name: r.name, hotel: r.hotel, live_status: r.status_live };
    for (const k of F) rec[k] = { ...r[k] };
    for (const k of ["www", "insta", "phone", "address"]) if (a[k]) rec[k] = { ...rec[k], ...a[k], by: "research agent" };
    // status words: a value supplied for a field that was stored empty is FILLED
    for (const k of ["www", "insta"]) if (!rec[k].old && rec[k].value && rec[k].status === "CONFIRMED") rec[k].status = "FILLED";
    for (const k of ["phone", "address"]) if (rec[k].value && ["CONFIRMED", "CORRECTED"].includes(rec[k].status)) rec[k].status = "FILLED";
    if (a.coords && !a.coords.lat) rec.coords = { status: "FLAGGED", note: a.coords.note || a.coords.source || "research agent could not place it", by: "research agent" };
    if (a.coords?.lat) rec.coords = { status: "CORRECTED", old: r.coords.old || null, value: { lat: +(+a.coords.lat).toFixed(5), lng: +(+a.coords.lng).toFixed(5) }, source: a.coords.source, by: "research agent" };
    rec.closure_note = a.closure_note || r.closure_note || null;
    rec.google = r.google ? { name: r.google.name, status: r.google.status, phone: r.google.phone, address: r.google.address, website: r.google.website, place_id: r.google.place_id, dist_m: r.google.dist_m } : null;
    const researched = new Set(Object.keys(a));
    rec.unresolved = r.research.filter((q) => !(q.field === "all" ? Object.keys(a).length > 1 : researched.has(q.field))).map((q) => `${q.field}: ${q.why}`);

    const tag = `${city} · ${r.id} ${r.name}`;
    if (rec.closure_note) add("closures", `${tag} — ${rec.closure_note}`);
    if (rec.insta.status === "FLAGGED") add("insta", `${tag} — ${rec.insta.candidate || rec.insta.value ? (rec.insta.candidate || rec.insta.value) : "no candidate"}${rec.insta.note ? ` (${rec.insta.note})` : ""}`);
    if (rec.insta.status === "CORRECTED" && rec.insta.value) add("insta_changed", `${tag} — ${rec.insta.old} → ${rec.insta.value}${rec.insta.source ? ` (${String(rec.insta.source).slice(0, 120)})` : ""}`);
    if (rec.insta.status === "CORRECTED" && !rec.insta.value) add("insta", `${tag} — stored ${rec.insta.old} to be removed (needs "delete")`);
    if (rec.www.status === "FLAGGED" || rec.www.review) add("www", `${tag} — ${rec.www.old || rec.www.value || "(none)"}${rec.www.note ? ` (${rec.www.note})` : ""}`);
    if (rec.phone.review || r.phone_review || rec.phone.status === "FLAGGED") add("phone", `${tag} — ${rec.phone.value || rec.phone.candidate || "(empty)"}; Google ${r.google?.phone || "none"}${rec.phone.note ? ` (${rec.phone.note})` : ""}`);
    if (rec.address.status !== "FLAGGED" && (rec.address.review || /google/i.test(rec.address.source || "") && !/site/i.test(rec.address.source || "") || /Google profile only/.test(rec.address.source || ""))) add("address", `${tag} — ${rec.address.value} (Google only; the official site prints no street)`);
    if (rec.address.status === "FLAGGED") add("address", `${tag} — ${rec.address.value || ""} ${rec.address.note || ""}`.trim());
    if (rec.coords.status === "CORRECTED") add("coords", `${tag} — moved ${r.google?.dist_m ?? "?"} m to ${rec.coords.value.lat}, ${rec.coords.value.lng}`);
    if (rec.unresolved.length) add("unresolved", `${tag} — ${rec.unresolved.join("; ")}`);
    return rec;
  });
  const tally = {}; for (const k of F) { tally[k] = {}; for (const r of records) tally[k][r[k].status] = (tally[k][r[k].status] || 0) + 1; }
  for (const k of F) for (const [s, n] of Object.entries(tally[k])) ((total[k] ||= {})[s] = (total[k][s] || 0) + n);
  cityFiles.push({ city, file: `pending/contact-check-${slug(city)}-${DATE}.json`, records: records.length, agent: Object.keys(agent).length, body: {
    city, run_date: DATE, status: "pending-review",
    apply_requires: "Ulrik's instruction containing 'edit' (and 'delete' for any stored value set to empty). Apply only CONFIRMED/CORRECTED/FILLED; FLAGGED values are not applied without a decision.",
    rules: ["Instagram: restaurant-specific account or empty — never chef, brand or hotel", "Phone: the official website's number wins over Google; disagreements reviewed after applying", "Website: own domain, loads, and the page is tied to the venue"],
    method: "collect.mjs (Google Places + site fetch) -> classify.mjs -> Sonnet research agents on the residue -> merge.mjs (oltra-beta hotels-beta/scripts/restaurants/contact-check)",
    tally, records } });
}

console.log(JSON.stringify(total, null, 1));
for (const [k, v] of Object.entries(review)) console.log(k, v.length);
if (!WRITE) process.exit(0);

const write = (rel, text) => {
  const p = path.join(STAGE, rel);
  if (fs.existsSync(p)) throw new Error(`refusing to overwrite ${p}`);
  fs.writeFileSync(p, text);
};
for (const c of cityFiles) write(c.file, JSON.stringify(c.body, null, 2) + "\n");

const sec = (title, k, intro) => `## ${title} (${review[k].length})\n\n${intro ? intro + "\n\n" : ""}${review[k].map((x) => `* ${x}`).join("\n") || "_none_"}\n`;
write(`flagged/contact-check-ALL-${DATE}-manual-review.md`, `# Restaurant contact check — manual review, all cities except Paris (${DATE})

Every link or value a person must look at, across all cities. The proposals are in \`../pending/contact-check-<city>-${DATE}.json\`.

${sec("1. Closures and relocations", "closures", "Highest priority: these are live records that may be wrong on the site today.")}
${sec("1b. Stored Instagram handles replaced", "insta_changed", "These overwrite a live value. Glance at each one: the new handle's evidence is in brackets.")}
${sec("2. Instagram candidates to confirm", "insta", "Open each one and check that the bio names this restaurant in this city. None is applied until confirmed.")}
${sec("3. Websites to check", "www", "Bot-blocked pages, or pages that could not be tied to the venue.")}
${sec("4. Phones to review after applying", "phone", "The website's number is used where one exists.")}
${sec("5. Addresses that disagree", "address")}
${sec("6. Research not completed", "unresolved", "Fields the research agent did not resolve: still FLAGGED in the proposal.")}
${sec("7. Coordinates moved (for information)", "coords", "Stored pin more than 300 m from the confirmed place.")}
`);
write(`pending/contact-check-ALL-${DATE}-report.md`, `# Restaurant contact check — all cities except Paris (${DATE})

Paris was run first, by hand (\`contact-check-paris-2026-10-02-v2.json\`).

**Records:** ${cityFiles.reduce((s, c) => s + c.records, 0)} in ${cityFiles.length} cities. **Researched by agents:** ${cityFiles.reduce((s, c) => s + c.agent, 0)} rows.

| Field | ${["CONFIRMED", "CORRECTED", "FILLED", "FLAGGED"].join(" | ")} |
|---|---|---|---|---|
${F.map((k) => `| ${k} | ${["CONFIRMED", "CORRECTED", "FILLED", "FLAGGED"].map((s) => total[k]?.[s] || 0).join(" | ")} |`).join("\n")}

Review counts: ${Object.entries(review).map(([k, v]) => `${k} ${v.length}`).join(", ")}.
See \`../flagged/contact-check-ALL-${DATE}-manual-review.md\`.

## Method

1. \`collect.mjs\`: one Google Places call per record, plus a fetch of the stored website (and Google's, if it differs) and one contact page.
2. \`classify.mjs\`: settles every field that the evidence proves. A website must load and be tied to the venue by name, phone or street. A phone counts as the website's only if Google's number appears on the site. An Instagram handle counts only if it is linked from the site, names the restaurant, does not name the hotel, and appears on no other record.
3. Sonnet research agents work only on the fields still open (see \`AGENT-BRIEF.md\`).
4. \`merge.mjs\` writes these files.

## Cities

${cityFiles.map((c) => `* ${c.city}: ${c.records} records, ${c.agent} researched — \`${c.file}\``).join("\n")}
`);
console.log("written", cityFiles.length, "city files");
