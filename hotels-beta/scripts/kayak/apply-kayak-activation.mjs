// Applies a reviewed activation plan to Directus hotels (docs/kayak-integration-plan.md §3.2):
//   - ratehawk_status passive -> active for hotels RateHawk now prices and has photos for (§42 semantics)
//   - kayak_hotel_id / kayak_status / kayak_checked_at for hotels whose KAYAK match Ulrik confirmed
//
// The plan is a JSON array of { id, name, expect: {field: value}, set: {field: value}, why }.
// Every row is re-read first; if any `expect` value differs from what Directus holds now
// (e.g. kayak_hotel_id is no longer null), the WHOLE run refuses — nothing is overwritten.
// Dry run by default; --confirm writes. Writes a rollback file of the prior values, then
// reads every row back and checks it holds exactly the planned values.
//
// Also used for the 2026-10-01 publish review (plan sets published / booking_partner as well).
// Usage: node --env-file=.env.local scripts/kayak/apply-kayak-activation.mjs --plan <file> [--confirm]
//        node --env-file=.env.local scripts/kayak/apply-kayak-activation.mjs --rollback <file> [--confirm]
import fs from "fs";

const DIRECTUS_URL = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
if (!DIRECTUS_URL || !DIRECTUS_TOKEN) throw new Error("Missing DIRECTUS_URL or DIRECTUS_TOKEN");
const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : null; };
const CONFIRM = process.argv.includes("--confirm");
const OUTPUT_DIR = "scripts/kayak/output";

async function api(path, body, method = "GET") {
  const res = await fetch(`${DIRECTUS_URL}${path}`, {
    method, headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} -> HTTP ${res.status} ${JSON.stringify(data?.errors ?? data)}`);
  return data?.data;
}

const same = (a, b) => (a ?? null) === (b ?? null) || (a != null && b != null && String(a) === String(b));

async function readRows(ids, fields) {
  const rows = await api(`/items/hotels?limit=-1&fields=id,${fields.join(",")}&filter[id][_in]=${ids.join(",")}`);
  return new Map(rows.map((r) => [String(r.id), r]));
}

async function main() {
  const rollbackFile = arg("rollback");
  const plan = rollbackFile
    // kayak_checked_at comes back reformatted by Directus, so it is restored but not compared.
    ? JSON.parse(fs.readFileSync(rollbackFile, "utf8")).map((r) => {
        const { kayak_checked_at, ...expect } = r.wrote;
        return { id: r.id, name: r.name, expect, set: r.prior, why: "rollback" };
      })
    : JSON.parse(fs.readFileSync(arg("plan") ?? (() => { throw new Error("--plan or --rollback required"); })(), "utf8"));

  const ids = plan.map((p) => String(p.id));
  if (new Set(ids).size !== ids.length) throw new Error("duplicate hotel ids in plan");
  const kayakIds = plan.map((p) => p.set.kayak_hotel_id).filter((v) => v != null);
  if (new Set(kayakIds).size !== kayakIds.length) throw new Error("one KAYAK id planned for two hotels");

  const fields = [...new Set(plan.flatMap((p) => [...Object.keys(p.expect), ...Object.keys(p.set)]))];
  // A field the plan needs but Directus does not have yet (e.g. booking_partner before its add-script
  // runs) reads as null in a dry run; a real run refuses until it exists.
  const existing = new Set((await api("/fields/hotels")).map((f) => f.field));
  const missing = fields.filter((f) => !existing.has(f));
  if (missing.length) {
    if (CONFIRM) throw new Error(`fields not in Directus yet: ${missing.join(", ")} — create them first`);
    console.log(`Note: ${missing.join(", ")} not in Directus yet; read as empty for this dry run.`);
  }
  const current = await readRows(ids, fields.filter((f) => existing.has(f)));
  const problems = [];
  for (const p of plan) {
    const row = current.get(String(p.id));
    if (!row) { problems.push(`${p.id}: not found`); continue; }
    for (const [f, v] of Object.entries(p.expect)) if (!same(row[f], v)) problems.push(`${p.id} ${p.name}: ${f} is ${JSON.stringify(row[f])}, plan expected ${JSON.stringify(v)}`);
  }
  if (problems.length) { console.error(`REFUSED — ${problems.length} row(s) differ from the plan:\n  ${problems.join("\n  ")}`); process.exit(1); }

  const counts = {};
  for (const p of plan) for (const [f, v] of Object.entries(p.set)) { const k = `${f}=${f === "kayak_hotel_id" ? (v == null ? "null" : "<id>") : f === "kayak_checked_at" ? "<time>" : v}`; counts[k] = (counts[k] ?? 0) + 1; }
  console.log(`${plan.length} hotels, all expectations hold. Writes:`); console.table(counts);
  if (!CONFIRM) { console.log("Dry run — nothing written. Re-run with --confirm."); return; }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const rb = `${OUTPUT_DIR}/rollback-${rollbackFile ? "of-rollback-" : ""}${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  fs.writeFileSync(rb, JSON.stringify(plan.map((p) => {
    const row = current.get(String(p.id));
    return { id: p.id, name: p.name, prior: Object.fromEntries(Object.keys(p.set).map((f) => [f, row[f] ?? null])), wrote: p.set };
  }), null, 1));
  console.log(`Rollback file: ${rb}`);

  let n = 0;
  for (const p of plan) { await api(`/items/hotels/${p.id}`, p.set, "PATCH"); n++; }
  console.log(`Patched ${n} rows.`);

  const after = await readRows(ids, fields);
  const bad = [];
  for (const p of plan) for (const [f, v] of Object.entries(p.set)) {
    const got = after.get(String(p.id))?.[f];
    const ok = f === "kayak_checked_at" ? (v == null ? got == null : got != null) : same(got, v);
    if (!ok) bad.push(`${p.id} ${f}: wanted ${JSON.stringify(v)}, got ${JSON.stringify(got)}`);
  }
  if (bad.length) { console.error(`READBACK FAILED:\n  ${bad.join("\n  ")}`); process.exit(1); }
  console.log(`Readback OK: all ${plan.length} rows hold the planned values.`);
}

main().catch((err) => { console.error("FATAL:", err.message ?? err); process.exit(1); });
