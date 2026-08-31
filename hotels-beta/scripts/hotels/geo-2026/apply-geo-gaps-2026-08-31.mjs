// Step 5 — fills admin_region (and, where it isn't a major city, the
// traveller-facing area) for the 366 hotels that had no
// state_province_county_island value and so got nothing from the step-3 split.
//
// One-time record of a reviewed session, same pattern as
// apply-geo-split-2026-08-31.mjs and the apply-award-review-* scripts (24/25).
// Do not edit the proposal for a future round — copy the pattern.
//
//   Dry-run by default.  --confirm to write.  --only <id> to scope.
//
// Idempotence works differently here than in the step-3 script, and more
// simply: this pass keys on the hotel id, not on a field value it overwrites,
// so a re-run resolves the same target and skips rows already at it. The
// rollback record still appends (40).
//
// Usage:
//   DIRECTUS_URL=... DIRECTUS_TOKEN=... node scripts/hotels/geo-2026/apply-geo-gaps-2026-08-31.mjs
//   ... --confirm
import fs from "fs/promises";

const DIRECTUS_URL = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
if (!DIRECTUS_URL || !DIRECTUS_TOKEN) throw new Error("Missing DIRECTUS_URL or DIRECTUS_TOKEN");

const CONFIRM = process.argv.includes("--confirm");
const ONLY = (() => {
  const i = process.argv.indexOf("--only");
  return i === -1 ? null : Number(process.argv[i + 1]);
})();

const DIR = "scripts/hotels/geo-2026";
const ROLLBACK = `${DIR}/apply-geo-gaps-2026-08-31-rollback.json`;

async function api(pathname, { method = "GET", body } = {}) {
  const res = await fetch(`${DIRECTUS_URL}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${DIRECTUS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${pathname}: ${JSON.stringify(data)}`);
  return data;
}

const clean = (v) => (v ?? "").trim();
const norm = (v) => (clean(v) === "" ? null : clean(v));

async function main() {
  const proposal = JSON.parse(await fs.readFile(`${DIR}/geo-gap-proposal-2026-08-31.json`, "utf8"));

  const { data: hotels } = await api(
    "/items/hotels?fields=id,hotel_name,country,city,state_province_county_island,admin_region&limit=-1"
  );

  // Siblings are resolved against LIVE data, exactly as the review page built
  // them — so if step 3's result had shifted since, this would diverge rather
  // than quietly apply a stale copy.
  const classified = hotels.filter((h) => clean(h.admin_region));
  const byCity = new Map();
  for (const h of classified) {
    const k = `${clean(h.country)}||${clean(h.city)}`;
    if (!byCity.has(k)) byCity.set(k, new Set());
    byCity.get(k).add(
      JSON.stringify([clean(h.admin_region), clean(h.state_province_county_island)])
    );
  }

  const changes = [];
  const unplanned = [];

  for (const h of hotels) {
    if (ONLY !== null && Number(h.id) !== ONLY) continue;
    if (clean(h.admin_region)) continue; // already classified — step 3, or a previous run

    const id = Number(h.id);
    const key = `${clean(h.country)}||${clean(h.city)}`;
    let admin;
    let area;
    let source;

    const sib = byCity.get(key);
    if (sib && sib.size === 1) {
      [admin, area] = JSON.parse([...sib][0]);
      source = "sibling";
    } else if (sib && sib.size > 1) {
      unplanned.push({ id, key, why: "siblings disagree" });
      continue;
    } else {
      const p = proposal.cities[key];
      if (!p) {
        unplanned.push({ id, key, why: "no proposal" });
        continue;
      }
      admin = p.admin;
      area = p.area;
      source = "proposed";
    }

    const ex = proposal.perHotel[String(id)];
    if (ex) {
      if ("admin" in ex) admin = ex.admin;
      if ("area" in ex) area = ex.area;
      source = "per-hotel";
    }

    const targetAdmin = norm(admin);
    const targetArea = norm(area);
    if (!targetAdmin) {
      unplanned.push({ id, key, why: "proposal has an empty admin_region" });
      continue;
    }

    const nowAdmin = norm(h.admin_region);
    const nowArea = norm(h.state_province_county_island);
    if (targetAdmin === nowAdmin && targetArea === nowArea) continue;

    changes.push({
      id,
      hotel_name: clean(h.hotel_name),
      country: clean(h.country),
      city: clean(h.city),
      source,
      from: { admin_region: nowAdmin, state_province_county_island: nowArea },
      to: { admin_region: targetAdmin, state_province_county_island: targetArea },
    });
  }

  if (unplanned.length) {
    console.error(`\nABORT: ${unplanned.length} hotel(s) cannot be resolved:`);
    for (const u of unplanned.slice(0, 25)) console.error(`  ${u.id}  ${u.key}  (${u.why})`);
    process.exit(1);
  }

  const by = (k) => changes.filter((c) => c.source === k).length;
  console.log(`${hotels.length} hotels scanned | ${changes.length} to change`);
  console.log(`  sibling ${by("sibling")} | proposed ${by("proposed")} | per-hotel ${by("per-hotel")}`);
  console.log(`  with a traveller area: ${changes.filter((c) => c.to.state_province_county_island).length}`);

  for (const c of changes) {
    console.log(
      `  ${String(c.id).padEnd(5)} ${c.hotel_name.slice(0, 38).padEnd(39)}` +
        `${c.country.slice(0, 16).padEnd(17)} admin=${String(c.to.admin_region).padEnd(26)}` +
        `area=${c.to.state_province_county_island ?? "-"}`
    );
  }

  if (!CONFIRM) {
    console.log("\nDRY RUN — nothing written. Re-run with --confirm to apply.");
    return;
  }

  const applied = [];
  for (const c of changes) {
    const { data: fresh } = await api(
      `/items/hotels/${c.id}?fields=id,state_province_county_island,admin_region`
    );
    if (norm(fresh.admin_region)) {
      console.error(`  SKIP ${c.id}: admin_region was set since the scan (${fresh.admin_region})`);
      continue;
    }
    await api(`/items/hotels/${c.id}`, {
      method: "PATCH",
      body: {
        admin_region: c.to.admin_region,
        state_province_county_island: c.to.state_province_county_island,
      },
    });
    applied.push({ ...c, applied_at: new Date().toISOString() });
  }

  let previous = [];
  try {
    previous = JSON.parse(await fs.readFile(ROLLBACK, "utf8"));
  } catch {
    previous = [];
  }
  await fs.writeFile(ROLLBACK, JSON.stringify([...previous, ...applied], null, 2));

  console.log(
    `\nApplied ${applied.length}. Rollback record now holds ${previous.length + applied.length} entries: ${ROLLBACK}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
