#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const hotelIdRaw = process.argv[2];

if (!hotelIdRaw) {
  console.error("Usage: node ./scripts/agoda/probe-agoda-hosts-and-paths.mjs <agoda_hotel_id>");
  process.exit(1);
}

const hotelId = Number(hotelIdRaw);
if (!Number.isFinite(hotelId)) {
  console.error(`Invalid Agoda hotel id: ${hotelIdRaw}`);
  process.exit(1);
}

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
    // ignore missing .env.local
  }
}

await loadEnvFile(path.resolve(".env.local"));

const SITE_ID = process.env.AGODA_SITE_ID || "";
const API_KEY = process.env.AGODA_API_KEY || "";
const LANG = process.env.AGODA_LANG || "en-us";

if (!SITE_ID || !API_KEY) {
  console.error("Missing AGODA_SITE_ID and/or AGODA_API_KEY in environment.");
  process.exit(1);
}

const hosts = [
  "https://affiliateapi7643.agoda.com",
  "https://api.agoda.com",
  "https://developer.agoda.com",
];

const candidates = [
  {
    path: "/affiliateservice/GetHotelInformation",
    body: { hotelId, includePictures: true, includeRoomTypes: true, language: LANG },
  },
  {
    path: "/affiliateservice/gethotelinformation",
    body: { hotelId, includePictures: true, includeRoomTypes: true, language: LANG },
  },
  {
    path: "/affiliateservice/ContentFeed",
    body: { feedId: 19, hotelId, language: LANG },
  },
  {
    path: "/affiliateservice/contentfeed",
    body: { feedId: 19, hotelId, language: LANG },
  },
  {
    path: "/affiliateservice/FeedRequest",
    body: { feedId: 19, hotelId, language: LANG },
  },
  {
    path: "/affiliateservice/feedrequest",
    body: { feedId: 19, hotelId, language: LANG },
  },
  {
    path: "/api/content",
    body: { feedId: 19, hotelId, language: LANG },
  },
  {
    path: "/content",
    body: { feedId: 19, hotelId, language: LANG },
  },
];

async function tryCandidate(host, candidate) {
  const url = `${host}${candidate.path}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept-Encoding": "gzip,deflate",
        "Authorization": `${SITE_ID}:${API_KEY}`,
      },
      body: JSON.stringify(candidate.body),
    });

    const text = await res.text();

    return {
      url,
      status: res.status,
      statusText: res.statusText,
      contentType: res.headers.get("content-type") || "",
      preview: text.slice(0, 250).replace(/\s+/g, " ").trim(),
    };
  } catch (error) {
    return {
      url,
      status: "ERR",
      statusText: error?.message || "Request failed",
      contentType: "",
      preview: "",
    };
  }
}

const hits = [];

for (const host of hosts) {
  console.log(`\nHOST ${host}`);
  console.log("-".repeat(60));

  for (const candidate of candidates) {
    const result = await tryCandidate(host, candidate);
    hits.push(result);
    console.log(`[${result.status}] ${result.url}${result.contentType ? ` | ${result.contentType}` : ""}`);
    if (result.preview) console.log(result.preview);
    console.log("");
  }
}

const interesting = hits.filter((r) => r.status !== 404 && r.status !== "ERR");
console.log("\nINTERESTING RESULTS");
console.log("-".repeat(60));
if (!interesting.length) {
  console.log("No non-404 results found.");
} else {
  for (const r of interesting) {
    console.log(`[${r.status}] ${r.url}${r.contentType ? ` | ${r.contentType}` : ""}`);
    if (r.preview) console.log(r.preview);
    console.log("");
  }
}