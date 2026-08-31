// Expands the step-4 proposal into one row per hotel and builds the review
// page. Tier-1 hotels (a classified sibling in the same country+city) are
// resolved here rather than being listed in the proposal by hand.
//
// Usage: node scripts/hotels/geo-2026/build-gap-review.mjs
import fs from "fs/promises";

const DIR = "scripts/hotels/geo-2026";

const gaps = JSON.parse(await fs.readFile(`${DIR}/output/geo-gaps.json`, "utf8"));
const proposal = JSON.parse(await fs.readFile(`${DIR}/geo-gap-proposal-2026-08-31.json`, "utf8"));
const template = await fs.readFile(`${DIR}/gap-review-template.html`, "utf8");

const rows = [];
const unplanned = [];

for (const g of gaps) {
  const key = `${g.country}||${g.city}`;
  let admin;
  let area;
  let source;
  let note = "";

  if (g.siblings.length === 1) {
    [admin, area] = g.siblings[0].pair;
    source = "sibling";
    note = `Copied from ${g.siblings[0].n} already-classified hotel${g.siblings[0].n === 1 ? "" : "s"} in ${g.city}.`;
  } else if (g.siblings.length > 1) {
    unplanned.push({ id: g.id, key, why: "siblings disagree" });
    continue;
  } else {
    const p = proposal.cities[key];
    if (!p) {
      unplanned.push({ id: g.id, key, why: "no proposal" });
      continue;
    }
    admin = p.admin;
    area = p.area;
    source = "proposed";
    note = p.note ?? "";
  }

  const ex = proposal.perHotel[String(g.id)];
  if (ex) {
    if ("admin" in ex) admin = ex.admin;
    if ("area" in ex) area = ex.area;
    source = "per-hotel";
    note = ex.note ?? note;
  }

  rows.push({ ...g, admin, area, source, note, newVocab: false });
}

if (unplanned.length) {
  console.error(`ABORT: ${unplanned.length} hotel(s) with no proposal:`);
  for (const u of unplanned) console.error(`  ${u.id}  ${u.key}  (${u.why})`);
  process.exit(1);
}

// Flag values that do not yet exist anywhere in the collection, so brand-new
// vocabulary is visible in review rather than slipping through as routine.
const existing = JSON.parse(await fs.readFile(`${DIR}/output/existing-vocab.json`, "utf8"));
const known = new Set(existing.admin);
for (const r of rows) r.newVocab = !known.has(r.admin);

const ORDER = { "per-hotel": 0, proposed: 1, sibling: 2 };
rows.sort(
  (a, b) =>
    a.country.localeCompare(b.country) ||
    ORDER[a.source] - ORDER[b.source] ||
    a.city.localeCompare(b.city) ||
    a.id - b.id
);

const html = template.replace("/*__DATA__*/ null", JSON.stringify({ rows }));
if (html === template) throw new Error("Data placeholder not found in template");
await fs.writeFile(`${DIR}/output/geo-gap-review.html`, html);

const by = (k) => rows.filter((r) => r.source === k).length;
console.log(
  `geo-gap-review.html: ${rows.length} hotels | sibling ${by("sibling")} | proposed ${by("proposed")} | ` +
    `per-hotel ${by("per-hotel")} | new admin values ${new Set(rows.filter((r) => r.newVocab).map((r) => r.admin)).size}`
);
