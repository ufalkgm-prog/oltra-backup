#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

async function loadEnvFile(filepath) {
  try {
    const text = await fs.readFile(filepath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // ignore
  }
}

await loadEnvFile(path.resolve(".env.local"));

const SITE_ID = process.env.AGODA_SITE_ID || "";
const API_KEY = process.env.AGODA_API_KEY || "";

if (!SITE_ID || !API_KEY) {
  console.error("Missing AGODA_SITE_ID and/or AGODA_API_KEY in environment.");
  process.exit(1);
}

const url = "http://affiliateapi7643.agoda.com/affiliateservice/lt_v1";

const body = {
  criteria: {
    additional: {
      currency: "USD",
      discountOnly: false,
      language: "en-us",
      occupancy: {
        numberOfAdult: 2,
        numberOfChildren: 0
      }
    },
    checkInDate: "2026-05-20",
    checkOutDate: "2026-05-21",
    hotelId: [16997294]
  }
};

const res = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Accept-Encoding": "gzip,deflate",
    "Authorization": `${SITE_ID}:${API_KEY}`,
  },
  body: JSON.stringify(body),
});

const text = await res.text();

console.log("HTTP status:", res.status, res.statusText);
console.log(text.slice(0, 2000));