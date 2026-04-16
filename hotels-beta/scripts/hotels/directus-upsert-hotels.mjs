#!/usr/bin/env node
import 'dotenv/config';

/**
 * Bulk patch Directus items by id (canonical).
 *
 * Usage:
 *   node scripts/directus-upsert-hotels.mjs --file content_patch.json
 *   node scripts/directus-upsert-hotels.mjs --file content_patch.json --dry-run
 *
 * Env:
 *   DIRECTUS_URL   e.g. https://directus-yourapp.up.railway.app
 *   DIRECTUS_TOKEN static token
 *   DIRECTUS_COLLECTION defaults to "hotels"
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function getArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

const fileArg = getArg("--file") || getArg("-f");
const dryRun = process.argv.includes("--dry-run");
const concurrency = Number(getArg("--concurrency") || "6");

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
const COLLECTION = process.env.DIRECTUS_COLLECTION || "hotels";

if (!fileArg) {
  console.error("Missing --file content_patch.json");
  process.exit(1);
}
if (!DIRECTUS_URL) {
  console.error("Missing env DIRECTUS_URL");
  process.exit(1);
}
if (!DIRECTUS_TOKEN) {
  console.error("Missing env DIRECTUS_TOKEN");
  process.exit(1);
}

const filePath = path.resolve(process.cwd(), fileArg);
if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

let patches;
try {
  patches = JSON.parse(fs.readFileSync(filePath, "utf8"));
} catch (e) {
  console.error("Could not parse JSON patch file:", e);
  process.exit(1);
}

if (!Array.isArray(patches)) {
  console.error("Patch file must be a JSON array of objects.");
  process.exit(1);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function directusPatchById(id, data) {
  const url = `${DIRECTUS_URL.replace(/\/$/, "")}/items/${encodeURIComponent(
    COLLECTION
  )}/${encodeURIComponent(String(id))}`;

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
    // keep raw
  }

  if (!res.ok) {
    const msg =
      json?.errors?.[0]?.message ||
      json?.error ||
      `${res.status} ${res.statusText}`;
    const details = json?.errors?.[0]?.extensions || json;
    const err = new Error(msg);
    err.details = details;
    err.status = res.status;
    throw err;
  }
  return json;
}

function validatePatch(p) {
  if (!p || typeof p !== "object") return "Patch must be an object.";
  if (!("id" in p)) return "Missing required field 'id'.";
  if (p.id === null || p.id === undefined || p.id === "") return "Invalid id.";
  const keys = Object.keys(p).filter((k) => k !== "id");
  if (keys.length === 0) return "Patch must include at least one field besides 'id'.";
  return null;
}

const valid = [];
const invalid = [];
for (const p of patches) {
  const err = validatePatch(p);
  if (err) invalid.push({ patch: p, error: err });
  else valid.push(p);
}

if (invalid.length) {
  console.warn(`⚠️ ${invalid.length} invalid patches will be skipped:`);
  for (const it of invalid.slice(0, 10)) {
    console.warn(" -", it.error, "patch:", it.patch);
  }
  if (invalid.length > 10) console.warn(" - ...");
}

console.log(`Patches: ${patches.length} total; ${valid.length} valid; ${invalid.length} invalid.`);
console.log(`Target: ${DIRECTUS_URL} /items/${COLLECTION}/{id}`);
console.log(dryRun ? "Mode: DRY RUN (no writes)" : "Mode: LIVE PATCH");

let ok = 0;
let fail = 0;

async function worker(queue, workerId) {
  while (queue.length) {
    const patch = queue.shift();
    if (!patch) return;

    const { id, ...data } = patch;

    // Clean undefined (Directus dislikes explicit undefined)
    for (const k of Object.keys(data)) {
      if (data[k] === undefined) delete data[k];
    }

    try {
      if (dryRun) {
        console.log(`[dry:${workerId}] would patch id=${id} keys=${Object.keys(data).join(",")}`);
      } else {
        // small backoff to be gentle
        await sleep(40);
        await directusPatchById(id, data);
        console.log(`[ok:${workerId}] patched id=${id} keys=${Object.keys(data).join(",")}`);
      }
      ok += 1;
    } catch (e) {
      fail += 1;
      console.error(`[fail:${workerId}] id=${id} ${e.message}`);
      if (e.details) console.error("  details:", e.details);
    }
  }
}

const queue = [...valid];
const workers = Array.from({ length: Math.max(1, concurrency) }, (_, i) =>
  worker(queue, i + 1)
);

await Promise.all(workers);

console.log(`Done. ok=${ok} fail=${fail}`);
process.exit(fail ? 2 : 0);