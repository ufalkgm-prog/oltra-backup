// Targeted append: scan the raw Ratehawk dump for one or more ISO2 country
// codes and append matching slim records to the existing filtered-hotels.jsonl,
// without re-streaming/re-filtering the whole ~20GB decompressed feed. Same
// pattern used for the Nepal backfill in CLAUDE.md §26.
//
// Usage (from hotels-beta/):
//   node scripts/ratehawk/append-country-to-filtered.mjs --codes AI

import { createReadStream, createWriteStream } from "fs";
import { createZstdDecompress } from "zlib";
import { pipeline } from "stream/promises";
import { Transform } from "stream";
import { ISO2_TO_OLTRA_COUNTRY } from "./country-map.mjs";

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      out[key] = value;
    }
  }
  return out;
}

const args = parseArgs(process.argv);
if (!args.codes) throw new Error("Missing --codes (comma-separated ISO2 codes, e.g. --codes AI)");
const TARGET_CODES = new Set(String(args.codes).split(",").map((c) => c.trim().toUpperCase()));

const DUMP_PATH = "scripts/ratehawk/partner_feed__en_v3.jsonl.zst";
const OUTPUT_PATH = "scripts/ratehawk/output/filtered-hotels.jsonl";

let totalLines = 0;
let matchedLines = 0;
let leftover = "";

const filterTransform = new Transform({
  transform(chunk, _enc, callback) {
    leftover += chunk.toString("utf8");
    let idx;
    let out = "";
    while ((idx = leftover.indexOf("\n")) !== -1) {
      const line = leftover.slice(0, idx);
      leftover = leftover.slice(idx + 1);
      if (!line.trim()) continue;
      totalLines++;
      if (totalLines % 500000 === 0) {
        process.stderr.write(`...${totalLines} lines processed, ${matchedLines} matched\n`);
      }
      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }
      const code = obj?.region?.country_code;
      if (!code || !TARGET_CODES.has(code)) continue;
      const oltraCountry = ISO2_TO_OLTRA_COUNTRY[code];
      if (!oltraCountry) continue;
      matchedLines++;
      const slim = {
        hid: obj.hid,
        id: obj.id,
        name: obj.name,
        country: oltraCountry,
        country_code: code,
        city: obj.region?.name ?? null,
        region_id: obj.region?.id ?? null,
        latitude: obj.latitude ?? null,
        longitude: obj.longitude ?? null,
        star_rating: obj.star_rating ?? null,
        kind: obj.kind ?? null,
        address: obj.address ?? null,
      };
      out += JSON.stringify(slim) + "\n";
    }
    callback(null, out);
  },
});

async function main() {
  const input = createReadStream(DUMP_PATH);
  const decompress = createZstdDecompress();
  const output = createWriteStream(OUTPUT_PATH, { flags: "a" });

  await pipeline(input, decompress, filterTransform, output);

  console.log("\n=== Done ===");
  console.log("Codes:", [...TARGET_CODES].join(","));
  console.log("Total lines scanned:", totalLines);
  console.log("Matched & appended:", matchedLines);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
