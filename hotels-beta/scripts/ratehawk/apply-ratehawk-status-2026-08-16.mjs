// Writes `ratehawk_status` to Directus from a probe-ratehawk-status.mjs report.
// Dry-run by default, --confirm to write — same convention as the
// apply-award-review-*.mjs scripts (§24/§25).
//
// Unlike those, this one is NOT a hardcoded one-time record: it reads whatever
// report it is pointed at, so the quarterly re-probe can reuse it as-is rather
// than needing a copy. Only patches hotels whose stored value actually differs.
//
// Usage (from hotels-beta/):
//   node --env-file=.env.local scripts/ratehawk/apply-ratehawk-status-2026-08-16.mjs
//   ... --confirm
//   ... --report scripts/ratehawk/output/ratehawk-status-2027-01-04.json --confirm

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DIRECTUS_URL = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
if (!DIRECTUS_URL || !DIRECTUS_TOKEN) throw new Error("Missing DIRECTUS_URL or DIRECTUS_TOKEN");

const VALID = new Set(["active", "passive", "not_integrated"]);

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
}

const confirm = process.argv.includes("--confirm");
const reportPath = arg("report")
  ? path.resolve(arg("report"))
  : path.join(__dirname, "output", "ratehawk-status-2026-08-16.json");

async function main() {
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  console.log(`Report: ${reportPath}`);
  console.log(`Probed ${report.probed_at} over ${report.windows.length} windows.`);

  const bad = report.rows.filter((row) => !VALID.has(row.status));
  if (bad.length) throw new Error(`Report contains ${bad.length} rows with an unknown status`);

  // Re-read current values rather than trusting the report, so a re-run is a
  // no-op and the diff shown is against what Directus holds right now.
  const res = await fetch(
    `${DIRECTUS_URL}/items/hotels?fields=id,hotel_name,ratehawk_status&filter[published][_eq]=true&limit=-1`,
    { headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` } }
  );
  if (!res.ok) throw new Error(`Directus fetch failed: ${res.status}`);
  const current = new Map(((await res.json()).data ?? []).map((h) => [String(h.id), h]));

  const changes = [];
  let unchanged = 0;
  let missing = 0;

  for (const row of report.rows) {
    const existing = current.get(String(row.id));
    if (!existing) {
      missing += 1;
      continue;
    }
    if (existing.ratehawk_status === row.status) {
      unchanged += 1;
      continue;
    }
    changes.push({
      id: row.id,
      hotel_name: row.hotel_name,
      from: existing.ratehawk_status ?? null,
      to: row.status,
    });
  }

  const byTransition = changes.reduce((acc, c) => {
    const key = `${c.from ?? "(unset)"} -> ${c.to}`;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`\n${changes.length} to change, ${unchanged} already correct, ${missing} not published now.`);
  for (const [transition, count] of Object.entries(byTransition).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${transition}: ${count}`);
  }

  console.log("\nSample:");
  for (const change of changes.slice(0, 10)) {
    console.log(`  ${change.id} ${change.hotel_name} — ${change.from ?? "(unset)"} -> ${change.to}`);
  }

  if (!confirm) {
    console.log("\nDRY RUN — pass --confirm to write.");
    return;
  }

  let ok = 0;
  const failed = [];
  for (const change of changes) {
    const patch = await fetch(`${DIRECTUS_URL}/items/hotels/${change.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${DIRECTUS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ratehawk_status: change.to }),
    });
    if (patch.ok) ok += 1;
    else failed.push({ id: change.id, status: patch.status });
  }

  console.log(`\nPatched ${ok}/${changes.length}.`);
  if (failed.length) {
    console.error("FAILED:", JSON.stringify(failed));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
