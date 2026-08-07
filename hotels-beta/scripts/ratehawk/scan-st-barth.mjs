// Investigate whether Ratehawk files St. Barthelemy hotels under a country
// code other than BL (similar to the documented Hong Kong-under-China quirk).
// Scans the raw dump for any record whose region/address text mentions
// Gustavia / St Barth, regardless of country_code, and tabulates which codes
// show up.
import { createReadStream } from "fs";
import { createZstdDecompress } from "zlib";
import { pipeline } from "stream/promises";
import { Transform } from "stream";
import fs from "fs/promises";

const DUMP_PATH = "scripts/ratehawk/partner_feed__en_v3.jsonl.zst";
const codeCounts = {};
const hits = [];
let leftover = "";
let totalLines = 0;

const re = /gustavia|st[\s-]?barth/i;

const transform = new Transform({
  transform(chunk, _enc, cb) {
    leftover += chunk.toString("utf8");
    let idx;
    while ((idx = leftover.indexOf("\n")) !== -1) {
      const line = leftover.slice(0, idx);
      leftover = leftover.slice(idx + 1);
      if (!line.trim()) continue;
      totalLines++;
      if (totalLines % 1000000 === 0) process.stderr.write(`...${totalLines}\n`);
      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }
      const hay = `${obj.name || ""} ${obj.region?.name || ""} ${obj.address || ""}`;
      if (re.test(hay)) {
        const code = obj?.region?.country_code || "?";
        codeCounts[code] = (codeCounts[code] || 0) + 1;
        hits.push({
          hid: obj.hid,
          name: obj.name,
          country_code: code,
          city: obj.region?.name,
          address: obj.address,
          lat: obj.latitude,
          lng: obj.longitude,
        });
      }
    }
    cb();
  },
});

async function main() {
  await pipeline(createReadStream(DUMP_PATH), createZstdDecompress(), transform);
  console.log("Total lines scanned:", totalLines);
  console.log("Country code breakdown for St Barth-ish matches:", codeCounts);
  await fs.writeFile(
    "scripts/ratehawk/output/st_barth_scan.json",
    JSON.stringify(hits, null, 2),
    "utf8"
  );
  console.log(`Wrote ${hits.length} hits to scripts/ratehawk/output/st_barth_scan.json`);
}
main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
