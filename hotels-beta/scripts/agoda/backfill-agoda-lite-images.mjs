#!/usr/bin/env node

import fs from "node:fs";
import process from "node:process";

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
const DIRECTUS_COLLECTION = process.env.DIRECTUS_COLLECTION || "hotels";

const AGODA_SITE_ID = process.env.AGODA_SITE_ID;
const AGODA_API_KEY = process.env.AGODA_API_KEY;
const AGODA_API_HOST =
  process.env.AGODA_API_HOST || "http://affiliateapi7643.agoda.com";

if (!DIRECTUS_URL || !DIRECTUS_TOKEN) {
  console.error("Missing DIRECTUS_URL or DIRECTUS_TOKEN");
  process.exit(1);
}

if (!AGODA_SITE_ID || !AGODA_API_KEY) {
  console.error("Missing AGODA_SITE_ID or AGODA_API_KEY");
  process.exit(1);
}

function parseArgs(argv) {
  const args = {
    dryRun: false,
    limit: null,
    checkInDate: "2026-09-15",
    checkOutDate: "2026-09-16",
    currency: "USD",
    output: "agoda/agoda-matching/agoda-still-missing-images.csv",
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--limit") args.limit = Number(argv[++i]);
    else if (arg === "--check-in") args.checkInDate = argv[++i];
    else if (arg === "--check-out") args.checkOutDate = argv[++i];
    else if (arg === "--currency") args.currency = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
  }

  return args;
}

async function directusRequest(path, options = {}) {
  const response = await fetch(`${DIRECTUS_URL.replace(/\/$/, "")}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${DIRECTUS_TOKEN}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Directus ${response.status}: ${text}`);
  }

  return text ? JSON.parse(text) : null;
}

async function fetchHotelsMissingPhotos() {
  const fields = [
    "id",
    "hotelid",
    "hotel_name",
    "city",
    "country",
    "agoda_hotel_id",
    "agoda_photo1",
  ].join(",");

  const filter = encodeURIComponent(
    JSON.stringify({
      _and: [
        { agoda_hotel_id: { _nnull: true } },
        { agoda_photo1: { _empty: true } },
      ],
    })
  );

  const limit = 500;

  const result = await directusRequest(
    `/items/${DIRECTUS_COLLECTION}?fields=${fields}&filter=${filter}&limit=${limit}`
  );

  return result.data || [];
}

async function fetchAgodaAvailabilityImage({
  hotelId,
  checkInDate,
  checkOutDate,
  currency,
}) {
  const body = {
    criteria: {
      additional: {
        currency,
        discountOnly: false,
        language: "en-us",
        occupancy: {
          numberOfAdult: 2,
          numberOfChildren: 0,
        },
      },
      checkInDate,
      checkOutDate,
      hotelId: [Number(hotelId)],
    },
    siteid: Number(AGODA_SITE_ID),
    apikey: AGODA_API_KEY,
  };

  const response = await fetch(
    `${AGODA_API_HOST.replace(/\/$/, "")}/affiliateservice/lt_v1`,
    {
      method: "POST",
      headers: {
        "Accept-Encoding": "gzip,deflate",
        "Content-Type": "application/json",
        Authorization: `${AGODA_SITE_ID}:${AGODA_API_KEY}`,
      },
      body: JSON.stringify(body),
    }
  );

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Agoda ${response.status}: ${text}`);
  }

  const json = JSON.parse(text);

  if (json.error) {
    return {
      imageURL: null,
      landingURL: null,
      error: json.error,
    };
  }

  const first = json.results?.[0];

  return {
    imageURL: first?.imageURL || null,
    landingURL: first?.landingURL || null,
    reviewScore: first?.reviewScore ?? null,
    reviewCount: first?.reviewCount ?? null,
    starRating: first?.starRating ?? null,
    error: null,
  };
}

async function patchHotelImage(id, payload) {
  return directusRequest(`/items/${DIRECTUS_COLLECTION}/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

function csvEscape(value) {
  const s = value == null ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeStillMissingImagesCsv(rows, outputPath) {
  const headers = [
    "oltra_id",
    "hotelid",
    "hotel_name",
    "city",
    "country",
    "agoda_hotel_id",
    "reason",
  ];

  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((header) => csvEscape(row[header])).join(",")
    ),
  ];

  fs.writeFileSync(outputPath, lines.join("\n"), "utf8");
}

async function main() {
  const args = parseArgs(process.argv);

  const hotels = await fetchHotelsMissingPhotos();

  const selectedHotels =
    Number.isFinite(args.limit) && args.limit > 0
      ? hotels.slice(0, args.limit)
      : hotels;

  console.log(`Found ${hotels.length} Agoda-matched hotels missing agoda_photo1`);
  console.log(`Processing ${selectedHotels.length}`);
  console.log(args.dryRun ? "Mode: DRY RUN" : "Mode: LIVE");
  console.log(
    "Note: hotels that already have agoda_photo1 are excluded and never overwritten."
  );
  console.log("--------------------------------------------------");

  let updated = 0;
  let noResult = 0;
  let failed = 0;

  const stillMissingImages = [];

  for (const hotel of selectedHotels) {
    const agodaHotelId = String(hotel.agoda_hotel_id || "").trim();

    if (!agodaHotelId) continue;

    try {
      const result = await fetchAgodaAvailabilityImage({
        hotelId: agodaHotelId,
        checkInDate: args.checkInDate,
        checkOutDate: args.checkOutDate,
        currency: args.currency,
      });

      console.log(`${hotel.id} | ${hotel.hotel_name} | Agoda ${agodaHotelId}`);

      if (!result.imageURL) {
        noResult += 1;

        const reason = result.error
          ? `${result.error.id || ""} ${result.error.message || ""}`.trim()
          : "No imageURL returned";

        stillMissingImages.push({
          oltra_id: hotel.id,
          hotelid: hotel.hotelid || "",
          hotel_name: hotel.hotel_name || "",
          city: hotel.city || "",
          country: hotel.country || "",
          agoda_hotel_id: agodaHotelId,
          reason,
        });

        console.log(`NO IMAGE ${reason}`);
        console.log("--------------------------------------------------");
        continue;
      }

      const payload = {
        agoda_photo1: result.imageURL,
      };

      if (args.dryRun) {
        console.log("DRY RUN payload:");
        console.log(JSON.stringify(payload, null, 2));
      } else {
        await patchHotelImage(hotel.id, payload);
        console.log("UPDATED");
      }

      updated += 1;
    } catch (error) {
      failed += 1;

      stillMissingImages.push({
        oltra_id: hotel.id,
        hotelid: hotel.hotelid || "",
        hotel_name: hotel.hotel_name || "",
        city: hotel.city || "",
        country: hotel.country || "",
        agoda_hotel_id: agodaHotelId,
        reason: error.message,
      });

      console.log(`${hotel.id} | ${hotel.hotel_name} | ERROR: ${error.message}`);
    }

    console.log("--------------------------------------------------");
  }

  writeStillMissingImagesCsv(stillMissingImages, args.output);

  console.log("DONE");
  console.log(`Updated:   ${updated}`);
  console.log(`No image:  ${noResult}`);
  console.log(`Failed:    ${failed}`);
  console.log(`Still-missing image list written to: ${args.output}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});