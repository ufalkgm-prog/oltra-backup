#!/usr/bin/env node

/**
 * Set published=false for hotels where agoda_photo1 is missing.
 *
 * Usage:
 *   node scripts/unpublish-hotels-without-agoda-photo.mjs --dry-run
 *   node scripts/unpublish-hotels-without-agoda-photo.mjs --apply
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const COLLECTION = "hotels";
const PHOTO_FIELD = "agoda_photo1";
const PUBLISHED_FIELD = "published";

function parseArgs(argv) {
  return {
    apply: argv.includes("--apply"),
    dryRun: !argv.includes("--apply"),
  };
}

function loadEnv() {
  const envPath = [".env.local", "env.local"]
    .map((p) => path.join(process.cwd(), p))
    .find((p) => fs.existsSync(p));

  if (!envPath) return;

  const content = fs.readFileSync(envPath, "utf8");

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const [key, ...rest] = trimmed.split("=");
    if (!key) continue;

    const value = rest.join("=").trim().replace(/^"|"$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function getConfig() {
  const url =
    process.env.DIRECTUS_URL ||
    process.env.NEXT_PUBLIC_DIRECTUS_URL;

  const token =
    process.env.DIRECTUS_TOKEN ||
    process.env.DIRECTUS_API_TOKEN;

  if (!url || !token) {
    throw new Error("Missing DIRECTUS_URL or DIRECTUS_TOKEN");
  }

  return {
    url: url.replace(/\/$/, ""),
    token,
  };
}

async function fetchHotels(config) {
  const res = await fetch(
    `${config.url}/items/${COLLECTION}?fields=id,hotel_name,hotelid,${PHOTO_FIELD},${PUBLISHED_FIELD}&limit=1000`,
    {
      headers: {
        Authorization: `Bearer ${config.token}`,
      },
    }
  );

  if (!res.ok) {
    throw new Error(await res.text());
  }

  const json = await res.json();
  return json.data ?? [];
}

function isEmpty(value) {
  return (
    value === null ||
    value === undefined ||
    String(value).trim() === "" ||
    String(value).trim().toLowerCase() === "null"
  );
}

function isPublished(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

async function patchHotel(config, id) {
  const res = await fetch(`${config.url}/items/${COLLECTION}/${id}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      [PUBLISHED_FIELD]: false,
    }),
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  loadEnv();
  const config = getConfig();

  console.log(`Mode: ${args.dryRun ? "DRY RUN" : "APPLY"}`);

  const hotels = await fetchHotels(config);

  const toUpdate = hotels.filter(
    (hotel) => isEmpty(hotel[PHOTO_FIELD]) && isPublished(hotel[PUBLISHED_FIELD])
  );

  console.log(`Total hotels checked: ${hotels.length}`);
  console.log(`Hotels to set published=false: ${toUpdate.length}`);

  for (const hotel of toUpdate) {
    const label = hotel.hotel_name ?? hotel.hotelid ?? hotel.id;
    console.log(`- ${label}: published true -> false`);

    if (!args.dryRun) {
      await patchHotel(config, hotel.id);
    }
  }

  if (args.dryRun) {
    console.log("\nNo changes made. Run with --apply to execute.");
  } else {
    console.log(`\nDone. Updated ${toUpdate.length} hotel record${toUpdate.length === 1 ? "" : "s"}.`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});