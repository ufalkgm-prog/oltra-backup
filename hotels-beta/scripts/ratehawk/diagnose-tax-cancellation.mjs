// Read-only diagnostic for CLAUDE.md §32 item 4: inspect the real shape of
// tax_data and cancellation_penalties.policies on live /search/hp/ rates
// before writing display code against them, rather than coding to assumed
// field names.
//
// Usage (from hotels-beta/):
//   RATEHAWK_KEY=... RATEHAWK_KEY_ID=... RATEHAWK_API_URL=... [DIAG_HID=...] node scripts/ratehawk/diagnose-tax-cancellation.mjs

const RATEHAWK_KEY = process.env.RATEHAWK_KEY;
const RATEHAWK_KEY_ID = process.env.RATEHAWK_KEY_ID;
const RATEHAWK_API_URL = (process.env.RATEHAWK_API_URL || "https://api.ratehawk.com").replace(/\/+$/, "");
const HID = Number(process.env.DIAG_HID) || 6374251; // Four Seasons Dubai at Jumeirah Beach

if (!RATEHAWK_KEY) throw new Error("Missing RATEHAWK_KEY");
if (!RATEHAWK_KEY_ID) throw new Error("Missing RATEHAWK_KEY_ID");

function authHeader() {
  return "Basic " + Buffer.from(`${RATEHAWK_KEY_ID}:${RATEHAWK_KEY}`).toString("base64");
}

async function post(path, body) {
  const res = await fetch(`${RATEHAWK_API_URL}${path}`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`FAILED ${path} -> ${res.status}`);
    console.error(text.slice(0, 2000));
    throw new Error(`${path} failed (${res.status})`);
  }
  return text ? JSON.parse(text) : {};
}

async function main() {
  const today = new Date();
  const checkin = new Date(today.getTime() + 45 * 86400000).toISOString().slice(0, 10);
  const checkout = new Date(today.getTime() + 47 * 86400000).toISOString().slice(0, 10);

  console.log(`Host: ${RATEHAWK_API_URL}`);
  console.log(`hid: ${HID}, checkin=${checkin}, checkout=${checkout}\n`);

  const hp = await post("/api/b2b/v3/search/hp/", {
    checkin,
    checkout,
    residency: "us",
    language: "en",
    guests: [{ adults: 2, children: [] }],
    hid: HID,
    currency: "USD",
  });

  const rates = hp.data?.hotels?.[0]?.rates ?? [];
  console.log(`rates count: ${rates.length}\n`);

  const n = Math.min(4, rates.length);
  for (let i = 0; i < n; i++) {
    const rate = rates[i];
    console.log(`\n=== Rate ${i + 1}/${n}: ${rate.room_name} ===`);

    console.log("\npayment_options.payment_types[0]:");
    console.log(JSON.stringify(rate.payment_options?.payment_types?.[0], null, 2));

    console.log("\ntax_data (raw):");
    console.log(JSON.stringify(rate.tax_data, null, 2));

    console.log("\ncancellation_penalties (raw):");
    console.log(JSON.stringify(rate.cancellation_penalties, null, 2));
  }

  // Also report which of the n rates have a non-empty taxes array and which
  // have a non-null free_cancellation_before, so we don't draw conclusions
  // from a sample that happens to have none of either.
  const withTaxes = rates.filter((r) => Array.isArray(r.tax_data?.taxes) && r.tax_data.taxes.length > 0);
  const withFreeCancellation = rates.filter((r) => r.cancellation_penalties?.free_cancellation_before);
  console.log(`\n\nSummary across all ${rates.length} rates:`);
  console.log(`  rates with tax_data.taxes.length > 0: ${withTaxes.length}`);
  console.log(`  rates with free_cancellation_before set: ${withFreeCancellation.length}`);

  if (withTaxes.length && withTaxes[0] !== rates[0]) {
    console.log("\nFirst rate WITH taxes (not otherwise shown above):");
    console.log(JSON.stringify(withTaxes[0].tax_data, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
