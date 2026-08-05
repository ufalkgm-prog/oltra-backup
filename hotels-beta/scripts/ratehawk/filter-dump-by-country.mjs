// Streams the full Ratehawk hotel/info/dump JSONL feed (2.8GB compressed, 20GB+
// decompressed) and writes out only the slim fields for hotels whose country
// matches one of the OLTRA `hotels` collection's countries. Never holds the
// full decompressed feed in memory or on disk.
//
// Usage: node scripts/ratehawk/filter-dump-by-country.mjs

import { createReadStream, createWriteStream } from "fs";
import { createZstdDecompress } from "zlib";
import { pipeline } from "stream/promises";
import { Transform } from "stream";
import { ISO2_TO_OLTRA_COUNTRY } from "./country-map.mjs";

const DUMP_PATH = "scripts/ratehawk/partner_feed__en_v3.jsonl.zst";
const OUTPUT_PATH = "scripts/ratehawk/output/filtered-hotels.jsonl";
const TARGET_COUNTRIES = new Set(Object.values(ISO2_TO_OLTRA_COUNTRY));

let totalLines = 0;
let matchedLines = 0;
let parseErrors = 0;
const perCountryCount = {};
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
        process.stderr.write(
          `...${totalLines} lines processed, ${matchedLines} matched\n`
        );
      }
      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        parseErrors++;
        continue;
      }
      const code = obj?.region?.country_code;
      const oltraCountry = code ? ISO2_TO_OLTRA_COUNTRY[code] : undefined;
      if (!oltraCountry) continue;
      matchedLines++;
      perCountryCount[oltraCountry] = (perCountryCount[oltraCountry] || 0) + 1;
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
  const output = createWriteStream(OUTPUT_PATH);

  await pipeline(input, decompress, filterTransform, output);

  console.log("\n=== Done ===");
  console.log("Total lines:", totalLines);
  console.log("Matched lines:", matchedLines);
  console.log("Parse errors:", parseErrors);
  console.log("\nPer-country matched counts:");
  for (const [country, count] of Object.entries(perCountryCount).sort(
    (a, b) => b[1] - a[1]
  )) {
    console.log(`  ${country}: ${count}`);
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
