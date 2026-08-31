// Builds the value-level review page from the triage proposal + the live
// value export. Injects both into review-template.html and writes
// output/geo-review.html, which is then published as an Artifact.
//
// Re-run after editing geo-triage-*.json to regenerate.
// Usage: node scripts/hotels/geo-2026/build-geo-review.mjs
import fs from "fs/promises";

const DIR = "scripts/hotels/geo-2026";

const triage = JSON.parse(await fs.readFile(`${DIR}/geo-triage-2026-08-31.json`, "utf8"));
const values = JSON.parse(await fs.readFile(`${DIR}/output/geo-values.json`, "utf8"));
const template = await fs.readFile(`${DIR}/review-template.html`, "utf8");

const byKey = new Map(values.map((v) => [`${v.country}||${v.value}`, v]));

const rows = triage.values.map((t) => {
  const src = byKey.get(t.k);
  if (!src) throw new Error(`Triage key has no matching live value: ${t.k}`);
  return {
    k: t.k,
    country: src.country,
    value: src.value,
    count: src.count,
    cities: src.cities,
    admin: t.admin,
    area: t.area,
    status: t.status,
    note: t.note ?? "",
  };
});

// Every live value must be accounted for — a silent omission here would mean a
// value quietly keeping its old, unsplit meaning after the apply step.
const covered = new Set(rows.map((r) => r.k));
const missing = [...byKey.keys()].filter((k) => !covered.has(k));
if (missing.length) throw new Error(`Live values missing from the triage: ${missing.join(", ")}`);

const ORDER = { fix: 0, ask: 1, split: 2, merge: 3, clean: 4 };
rows.sort(
  (a, b) =>
    a.country.localeCompare(b.country) ||
    ORDER[a.status] - ORDER[b.status] ||
    b.count - a.count ||
    a.value.localeCompare(b.value)
);

const payload = { generated: triage._meta.generated, rows };
const html = template.replace("/*__DATA__*/ null", JSON.stringify(payload));
if (html === template) throw new Error("Data placeholder not found in template");

await fs.writeFile(`${DIR}/output/geo-review.html`, html);
console.log(
  `geo-review.html: ${rows.length} values, ${rows.reduce((n, r) => n + r.count, 0)} hotels, ` +
    `${new Set(rows.map((r) => r.country)).size} countries`
);
