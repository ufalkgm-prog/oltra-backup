#!/usr/bin/env node
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function getArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

const csvArg = getArg("--csv");
const dryRun = process.argv.includes("--dry-run");
const concurrency = Number(getArg("--concurrency") || "6");

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
const COLLECTION = process.env.DIRECTUS_COLLECTION || "hotels";

if (!csvArg) {
  console.error("Missing --csv");
  process.exit(1);
}

const csvPath = path.resolve(process.cwd(), csvArg);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += ch;
  }

  row.push(cell);
  rows.push(row);

  const headers = rows[0];

  return rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = r[i];
    });
    return obj;
  });
}

function clean(v) {
  if (!v) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function int(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function buildPatch(r) {
  const id = clean(r.oltra_id);
  if (!id) return null;

  return {
    id,
    agoda_hotel_id: clean(r.agoda_hotel_id),
    agoda_hotel_name: clean(r.agoda_hotel_name),
    agoda_city: clean(r.agoda_city),
    agoda_country: clean(r.agoda_country),
    agoda_addressline1: clean(r.agoda_full__addressline1),
    agoda_addressline2: clean(r.agoda_full__addressline2),
    agoda_zipcode: clean(r.agoda_full__zipcode),
    agoda_longitude: num(r.agoda_full__longitude),
    agoda_latitude: num(r.agoda_full__latitude),
    agoda_url: clean(r.agoda_full__url),
    agoda_photo1: clean(r.agoda_full__photo1),
    agoda_photo2: clean(r.agoda_full__photo2),
    agoda_photo3: clean(r.agoda_full__photo3),
    agoda_photo4: clean(r.agoda_full__photo4),
    agoda_photo5: clean(r.agoda_full__photo5),
    agoda_overview: clean(r.agoda_full__overview),
    agoda_number_of_reviews: int(r.agoda_full__number_of_reviews),
    agoda_rating_average: num(r.agoda_full__rating_average),
  };
}

async function patch(id, data) {
  const url = `${DIRECTUS_URL}/items/${COLLECTION}/${id}`;

  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${DIRECTUS_TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(data),
  });

  const text = await res.text();
  let json = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // keep raw text
  }

    if (!res.ok) {
        console.error(
        "PATCH FAILED\n" +
            JSON.stringify(
            {
                id,
                status: res.status,
                statusText: res.statusText,
                body: json ?? text,
                data,
            },
            null,
            2
            )
        );
    throw new Error(`Patch failed for id=${id}`);
    }

  return json;
}

const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));

const idsArg = getArg("--ids");
const onlyIds = idsArg
  ? new Set(idsArg.split(",").map((s) => s.trim()).filter(Boolean))
  : null;

const patches = rows
  .filter((r) => r.decision === "APPROVED")
  .map(buildPatch)
  .filter(Boolean)
  .filter((p) => !onlyIds || onlyIds.has(String(p.id)));

console.log(`Processing ${patches.length} rows`);

for (const p of patches) {
  const { id, ...data } = p;

  try {
    if (dryRun) {
      console.log("DRY", id, {
        agoda_hotel_id: data.agoda_hotel_id,
        agoda_hotel_name: data.agoda_hotel_name,
        agoda_city: data.agoda_city,
        agoda_country: data.agoda_country,
      });
    } else {
      await patch(id, data);
      console.log("OK", id);
    }
  } catch (err) {
    console.error("FAIL", id, err.message);
    }
}