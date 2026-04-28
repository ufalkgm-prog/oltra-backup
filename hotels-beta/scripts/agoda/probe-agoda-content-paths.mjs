#!/usr/bin/env node

/**
 * Probe multiple likely Agoda content endpoints.
 *
 * Usage:
 *   node ./scripts/agoda/probe-agoda-content-paths.mjs 16997294
 *
 * Env:
 *   AGODA_SITE_ID=...
 *   AGODA_API_KEY=...
 *   AGODA_API_HOST=https://affiliateapi7643.agoda.com
 *   AGODA_LANG=en-us
 */

const hotelIdRaw = process.argv[2];

if (!hotelIdRaw) {
  console.error("Usage: node ./scripts/agoda/probe-agoda-content-paths.mjs <agoda_hotel_id>");
  process.exit(1);
}

const hotelId = Number(hotelIdRaw);
if (!Number.isFinite(hotelId)) {
  console.error(`Invalid Agoda hotel id: ${hotelIdRaw}`);
  process.exit(1);
}

const SITE_ID = process.env.AGODA_SITE_ID || "";
const API_KEY = process.env.AGODA_API_KEY || "";
const API_HOST = (process.env.AGODA_API_HOST || "https://affiliateapi7643.agoda.com").replace(/\/+$/, "");
const LANG = process.env.AGODA_LANG || "en-us";

if (!SITE_ID || !API_KEY) {
  console.error("Missing AGODA_SITE_ID and/or AGODA_API_KEY in environment.");
  process.exit(1);
}

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
    path: "/affiliateservice/HotelInformation",
    body: { hotelId, language: LANG },
  },
  {
    path: "/affiliateservice/hotelinformation",
    body: { hotelId, language: LANG },
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
    path: "/affiliateservice/ContentFeed",
    body: { feedId: 19, hotelId, language: LANG },
  },
  {
    path: "/affiliateservice/contentfeed",
    body: { feedId: 19, hotelId, language: LANG },
  },
  {
    path: "/affiliateservice/ContentApi",
    body: { feedId: 19, hotelId, language: LANG },
  },
  {
    path: "/affiliateservice/contentapi",
    body: { feedId: 19, hotelId, language: LANG },
  },
  {
    path: "/affiliateservice/Feed19",
    body: { hotelId, language: LANG },
  },
  {
    path: "/affiliateservice/feed19",
    body: { hotelId, language: LANG },
  },
];

async function tryCandidate({ path, body }) {
  const url = `${API_HOST}${path}`;
  try {
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

    return {
      path,
      status: res.status,
      statusText: res.statusText,
      preview: text.slice(0, 300),
      contentType: res.headers.get("content-type") || "",
    };
  } catch (error) {
    return {
      path,
      status: "ERR",
      statusText: error?.message || "Request failed",
      preview: "",
      contentType: "",
    };
  }
}

(async () => {
  console.log(`Host: ${API_HOST}`);
  console.log(`Hotel ID: ${hotelId}`);
  console.log("");

  for (const candidate of candidates) {
    const result = await tryCandidate(candidate);
    console.log(
      `[${result.status}] ${candidate.path} ${result.contentType ? `| ${result.contentType}` : ""}`
    );
    if (result.preview) {
      console.log(result.preview.replace(/\s+/g, " ").trim());
    }
    console.log("");
  }
})();