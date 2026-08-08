// Targeted re-scan of the full Ratehawk dump (already on disk, no re-download)
// keyed by the hids we confirmed matches for in the hotel-matching session.
// Streams the whole file once, pulls `images`/`images_ext` only for those hids.
//
// Usage: node scripts/ratehawk/extract-images-for-matched.mjs

import { createReadStream, createWriteStream } from "fs";
import { readFileSync } from "fs";
import { createZstdDecompress } from "zlib";
import { pipeline } from "stream/promises";
import { Transform } from "stream";

const DUMP_PATH = "scripts/ratehawk/partner_feed__en_v3.jsonl.zst";
const DECISIONS_PATH = "scripts/ratehawk/output/ratehawk_match_decisions.json";
const OUTPUT_PATH = "scripts/ratehawk/output/matched-hotel-images.jsonl";

const decisions = JSON.parse(readFileSync(DECISIONS_PATH, "utf8"));
const confirmed = decisions.filter((d) => d.decision === "confirmed");
const hidToOltraId = new Map(confirmed.map((d) => [d.ratehawk_hid, d.oltra_id]));

console.error(`Looking for ${hidToOltraId.size} confirmed hids in the dump...`);

let totalLines = 0;
let found = 0;
let leftover = "";
const foundHids = new Set();

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
          `...${totalLines} lines processed, ${found}/${hidToOltraId.size} found\n`
        );
      }
      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }
      if (!hidToOltraId.has(obj.hid)) continue;
      found++;
      foundHids.add(obj.hid);
      const slim = {
        oltra_id: hidToOltraId.get(obj.hid),
        hid: obj.hid,
        name: obj.name,
        images: obj.images ?? [],
        images_ext: obj.images_ext ?? [],
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
  console.log("Total lines scanned:", totalLines);
  console.log(`Found: ${found} / ${hidToOltraId.size}`);

  const missing = [...hidToOltraId.entries()].filter(([hid]) => !foundHids.has(hid));
  if (missing.length) {
    console.log(`Missing ${missing.length} hids (present in decisions but not in dump):`);
    for (const [hid, oltraId] of missing.slice(0, 20)) {
      console.log(`  oltra_id=${oltraId} hid=${hid}`);
    }
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
