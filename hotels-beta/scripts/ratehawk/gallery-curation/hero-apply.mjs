// Step 6: writes the chosen order - hero, second, the rest as they were, the
// problem slots last. Nothing is removed. Dry run unless --confirm.
//   node hero-apply.mjs [--work <dir>] [--only id,id] [--confirm]
//   node hero-apply.mjs --rollback <work>/hero-rollback-<stamp>.json [--confirm]
// Matches by URL against the gallery as it is NOW; a hotel whose hero or second
// image is no longer in its gallery is skipped and listed.
import fs from "fs";
import path from "path";
import { workDir, arg, flag, onlyIds, readJsonl, currentGallery, galleryPayload, patchAndVerify } from "./lib.mjs";

async function main() {
  const dir = workDir();
  const confirm = flag("--confirm");
  const rollbackFile = arg("--rollback");
  const only = onlyIds();

  if (rollbackFile) {
    const rb = JSON.parse(fs.readFileSync(rollbackFile, "utf8"));
    console.log(`rollback: ${rb.length} hotels`);
    if (!confirm) return;
    let ok = 0, fail = 0;
    for (const { id, before } of rb) {
      const e = await patchAndVerify(id, before);
      if (e) { fail++; console.error(id, e); } else ok++;
    }
    console.log(`restored ${ok}, failed ${fail}`);
    return;
  }

  const plans = [];
  const skipped = [];
  for (const r of readJsonl(path.join(dir, "hero.jsonl"))) {
    if (only && !only.has(r.id)) continue;
    const { images } = await currentGallery(r.id);
    const byUrl = new Map(images.map((im) => [im.url, im]));
    const hero = byUrl.get(r.heroUrl);
    const second = byUrl.get(r.secondUrl);
    if (!hero || !second) { skipped.push(r.id); continue; }
    const bad = new Set(r.problemUrls.filter((u) => u !== r.heroUrl && u !== r.secondUrl));
    const rest = images.filter((im) => im !== hero && im !== second);
    const order = [hero, second, ...rest.filter((im) => !bad.has(im.url)), ...rest.filter((im) => bad.has(im.url))];
    if (order.length !== images.length) throw new Error(`lost image on ${r.id}`);
    if (order.every((im, k) => im === images[k])) continue;
    const before = galleryPayload(images);
    const payload = galleryPayload(order);
    const changed = Object.keys(payload).filter((k) => payload[k] !== before[k]);
    const pick = (o) => Object.fromEntries(changed.map((k) => [k, o[k]]));
    plans.push({ id: r.id, name: (r.name ?? "").trim(), confidence: r.confidence, payload: pick(payload), before: pick(before) });
  }
  console.log(`to reorder: ${plans.length} hotels; low confidence: ${plans.filter((p) => p.confidence === "low").map((p) => p.id).join(", ") || "none"}`);
  if (skipped.length) console.log(`skipped, hero or second no longer in the gallery: ${skipped.join(", ")}`);
  if (!confirm) {
    plans.slice(0, 10).forEach((p) => console.log(" ", p.id, p.name, p.confidence));
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.writeFileSync(path.join(dir, `hero-rollback-${stamp}.json`), JSON.stringify(plans.map((p) => ({ id: p.id, before: p.before }))));
  let ok = 0, fail = 0;
  for (const p of plans) {
    const e = await patchAndVerify(p.id, p.payload);
    if (e) { fail++; console.error(p.id, e); } else ok++;
  }
  console.log(`written and verified ${ok}, failed ${fail}; hero-rollback-${stamp}.json`);
}

await main();
