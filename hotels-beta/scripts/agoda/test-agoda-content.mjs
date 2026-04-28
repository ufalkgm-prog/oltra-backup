#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const hotelIdRaw = process.argv[2];

if (!hotelIdRaw) {
  console.error("Missing Agoda hotel id.");
  console.error("Usage: node scripts/agoda/test-agoda-content.mjs <agoda_hotel_id>");
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
const CONTENT_PATH = process.env.AGODA_CONTENT_PATH || "/affiliateservice/GetHotelInformation";
const LANG = process.env.AGODA_LANG || "en-us";

if (!SITE_ID || !API_KEY) {
  console.error("Missing AGODA_SITE_ID and/or AGODA_API_KEY in environment.");
  process.exit(1);
}

const url = `${API_HOST}${CONTENT_PATH}`;

function normalizeImageUrl(value) {
  if (!value || typeof value !== "string") return null;
  try {
    const u = new URL(value.replace(/^http:\/\//i, "https://"));
    u.search = "";
    return u.toString();
  } catch {
    return value.replace(/^http:\/\//i, "https://").split("?")[0];
  }
}

function extractPictures(obj, results = []) {
  if (!obj || typeof obj !== "object") return results;

  if (Array.isArray(obj)) {
    for (const item of obj) extractPictures(item, results);
    return results;
  }

  for (const [key, value] of Object.entries(obj)) {
    const lower = key.toLowerCase();

    const looksLikePictureNode =
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      ("url" in value ||
        "URL" in value ||
        "pictureGroup" in value ||
        "PictureGroup" in value ||
        "caption" in value ||
        "Caption" in value);

    if (looksLikePictureNode) {
      const rawUrl = value.url || value.URL || null;
      if (rawUrl) {
        results.push({
          url: rawUrl,
          normalizedUrl: normalizeImageUrl(rawUrl),
          pictureGroup: value.pictureGroup || value.PictureGroup || null,
          caption: value.caption || value.Caption || null,
        });
      }
    }

    if (
      lower.includes("picture") ||
      lower.includes("image") ||
      lower.includes("photo") ||
      lower === "pictures"
    ) {
      extractPictures(value, results);
    } else if (typeof value === "object") {
      extractPictures(value, results);
    }
  }

  return results;
}

function uniqByNormalizedUrl(items) {
  const seen = new Set();
  const out = [];

  for (const item of items) {
    const key = item.normalizedUrl || item.url;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}

function extractDescriptions(obj, results = []) {
  if (!obj || typeof obj !== "object") return results;

  if (Array.isArray(obj)) {
    for (const item of obj) extractDescriptions(item, results);
    return results;
  }

  for (const [key, value] of Object.entries(obj)) {
    const lower = key.toLowerCase();

    if (lower.includes("description") || lower.includes("overview") || lower.includes("summary")) {
      if (typeof value === "string" && value.trim()) {
        results.push(value.trim());
      } else if (Array.isArray(value)) {
        for (const v of value) {
          if (typeof v === "string" && v.trim()) results.push(v.trim());
          else if (v && typeof v === "object") {
            for (const candidate of ["value", "text", "overview", "description", "Description"]) {
              if (typeof v[candidate] === "string" && v[candidate].trim()) {
                results.push(v[candidate].trim());
              }
            }
          }
        }
      } else if (value && typeof value === "object") {
        for (const candidate of ["value", "text", "overview", "description", "Description"]) {
          if (typeof value[candidate] === "string" && value[candidate].trim()) {
            results.push(value[candidate].trim());
          }
        }
      }
    }

    if (typeof value === "object") {
      extractDescriptions(value, results);
    }
  }

  return results;
}

function findLikelyHotelNode(data) {
  if (!data || typeof data !== "object") return data;

  const candidates = [
    data.hotel,
    data.Hotel,
    data.hotels?.hotel?.[0],
    data.hotels?.hotel,
    data.Hotels?.Hotel?.[0],
    data.Hotels?.Hotel,
    data.result?.hotel,
    data.result?.Hotel,
    data.results?.[0],
    data.Results?.[0],
  ].filter(Boolean);

  return candidates[0] || data;
}

async function main() {
  const requestBody = {
    hotelId,
    includePictures: true,
    includeRoomTypes: true,
    language: LANG,
  };

  console.log("Agoda content probe");
  console.log("-------------------");
  console.log("URL:", url);
  console.log("Hotel ID:", hotelId);
  console.log("Language:", LANG);
  console.log("");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept-Encoding": "gzip,deflate",
      Authorization: `${SITE_ID}:${API_KEY}`,
    },
    body: JSON.stringify(requestBody),
  });

  const rawText = await res.text();

  console.log("HTTP status:", res.status, res.statusText);
  console.log("");

  if (!res.ok) {
    console.log("Response preview:");
    console.log(rawText.slice(0, 2000));
    console.log("");

    if (res.status === 401) {
      console.log("Likely causes:");
      console.log("- invalid site id / api key");
      console.log("- IP allowlist restriction");
    } else if (res.status === 404) {
      console.log("Likely cause:");
      console.log("- guessed content path is wrong for your Agoda account");
    } else if (res.status === 400) {
      console.log("Likely cause:");
      console.log("- endpoint exists but request schema is wrong");
    }

    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(rawText);
  } catch {
    console.log("Non-JSON response preview:");
    console.log(rawText.slice(0, 4000));
    process.exit(1);
  }

  const outDir = path.resolve("scripts/agoda/output");
  await fs.mkdir(outDir, { recursive: true });

  const rawPath = path.join(outDir, `agoda-content-${hotelId}.json`);
  await fs.writeFile(rawPath, JSON.stringify(data, null, 2), "utf8");

  const hotelNode = findLikelyHotelNode(data);
  const pictures = uniqByNormalizedUrl(extractPictures(hotelNode));
  const descriptions = [...new Set(extractDescriptions(hotelNode))];

  const summary = {
    hotelId,
    request: {
      url,
      language: LANG,
    },
    imageCount: pictures.length,
    sampleImages: pictures.slice(0, 10),
    descriptionCount: descriptions.length,
    descriptionPreview: descriptions[0]?.slice(0, 1000) || null,
    topLevelKeys: Object.keys(data || {}),
  };

  const summaryPath = path.join(outDir, `agoda-content-${hotelId}.summary.json`);
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf8");

  console.log("Saved raw response to:");
  console.log(rawPath);
  console.log("");
  console.log("Saved summary to:");
  console.log(summaryPath);
  console.log("");
  console.log("Summary");
  console.log("-------");
  console.log("Image count:", summary.imageCount);
  console.log("Description count:", summary.descriptionCount);
  console.log("Top-level keys:", summary.topLevelKeys.join(", ") || "(none)");
  console.log("");

  if (summary.sampleImages.length) {
    console.log("Sample images:");
    for (const [index, img] of summary.sampleImages.entries()) {
      console.log(
        `${index + 1}. ${img.normalizedUrl || img.url}` +
          (img.pictureGroup ? ` | group: ${img.pictureGroup}` : "") +
          (img.caption ? ` | caption: ${img.caption}` : "")
      );
    }
    console.log("");
  }

  if (summary.descriptionPreview) {
    console.log("Description preview:");
    console.log(summary.descriptionPreview);
  } else {
    console.log("No description found in probe response.");
  }
}

main().catch((err) => {
  console.error("Probe failed:");
  console.error(err);
  process.exit(1);
});