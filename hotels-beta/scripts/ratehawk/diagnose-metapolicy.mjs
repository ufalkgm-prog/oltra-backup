// Read-only diagnostic for CLAUDE.md §32 item 5 (Directus schema proposal):
// find where metapolicy_struct / metapolicy_extra_info actually live in the
// /search/hp/ response — rate-level (live, per-search, "never cache" like
// taxes/cancellation) vs. hotel-level static content (a real Directus
// schema candidate). Determines the schema proposal, doesn't guess it.
//
// Usage (from hotels-beta/):
//   RATEHAWK_KEY=... RATEHAWK_KEY_ID=... RATEHAWK_API_URL=... [DIAG_HID=...] node scripts/ratehawk/diagnose-metapolicy.mjs

const RATEHAWK_KEY = process.env.RATEHAWK_KEY;
const RATEHAWK_KEY_ID = process.env.RATEHAWK_KEY_ID;
const RATEHAWK_API_URL = (process.env.RATEHAWK_API_URL || "https://api.ratehawk.com").replace(/\/+$/, "");
const HID = Number(process.env.DIAG_HID) || 6374251;

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

function findKeyPaths(obj, keyPattern, path = "$") {
  const hits = [];
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      const nextPath = `${path}.${k}`;
      if (keyPattern.test(k)) hits.push(nextPath);
      if (v && typeof v === "object" && !Array.isArray(v)) {
        hits.push(...findKeyPaths(v, keyPattern, nextPath));
      } else if (Array.isArray(v) && v.length && typeof v[0] === "object") {
        hits.push(...findKeyPaths(v[0], keyPattern, `${nextPath}[0]`));
      }
    }
  }
  return hits;
}

async function main() {
  const today = new Date();
  const checkin = new Date(today.getTime() + 45 * 86400000).toISOString().slice(0, 10);
  const checkout = new Date(today.getTime() + 47 * 86400000).toISOString().slice(0, 10);

  const hp = await post("/api/b2b/v3/search/hp/", {
    checkin,
    checkout,
    residency: "us",
    language: "en",
    guests: [{ adults: 2, children: [] }],
    hid: HID,
    currency: "USD",
  });

  const hotel = hp.data?.hotels?.[0] ?? {};
  console.log("Top-level keys on hotel object (search/hp response):", Object.keys(hotel));

  const metapolicyPaths = findKeyPaths(hp.data, /metapolicy/i);
  console.log("\nPaths matching /metapolicy/i anywhere in the response:");
  console.log(metapolicyPaths.length ? metapolicyPaths : "(none found)");

  const rate = hotel.rates?.[0];
  if (rate) {
    console.log("\nTop-level keys on rate[0]:", Object.keys(rate));
    const paymentType = rate.payment_options?.payment_types?.[0];
    if (paymentType) {
      console.log("\nTop-level keys on rate[0].payment_options.payment_types[0]:", Object.keys(paymentType));
    }
  }

  // Also check the static-content endpoint, in case metapolicy is hotel-level.
  const info = await post("/api/b2b/v3/hotel/info/", { hid: HID, language: "en" });
  const infoMetapolicyPaths = findKeyPaths(info.data, /metapolicy/i);
  console.log("\nPaths matching /metapolicy/i in /hotel/info/ (static content):");
  console.log(infoMetapolicyPaths.length ? infoMetapolicyPaths : "(none found)");
  console.log("\nTop-level keys on /hotel/info/ data:", Object.keys(info.data ?? {}));

  console.log("\nmetapolicy_struct (raw):");
  console.log(JSON.stringify(info.data?.metapolicy_struct, null, 2));
  console.log("\nmetapolicy_extra_info (raw):");
  console.log(JSON.stringify(info.data?.metapolicy_extra_info, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
