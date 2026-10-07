// Step 4: removes flagged images from hotel galleries, closes the gaps, and adds
// them to ../excluded-gallery-images.json so no re-import brings them back.
// Dry run unless --confirm.
//   node exclusions-apply.mjs [--work <dir>] [--confirm]                         the CERTAIN flags
//   node exclusions-apply.mjs --approved <approved-deletions.json> [--confirm]   those approved in approve.html
//   node exclusions-apply.mjs --rollback <work>/rollback-<stamp>.json [--confirm]
// Matches by URL against the gallery as it is NOW, so runs can follow each other.
// A hotel that would keep fewer than 2 images is held back and listed.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { workDir, arg, flag, readJsonl, currentGallery, galleryPayload, patchAndVerify } from "./lib.mjs";
import { galleryImageKey } from "../galleryExclusions.mjs";

async function main() {
  const MIN_LEFT = 2;
  const LIST = path.join(path.dirname(fileURLToPath(import.meta.url)), "../excluded-gallery-images.json");
  const dir = workDir();
  const confirm = flag("--confirm");
  const approvedFile = arg("--approved");
  const rollbackFile = arg("--rollback");

  if (rollbackFile) {
    const rb = JSON.parse(fs.readFileSync(rollbackFile, "utf8"));
    console.log(`rollback: ${rb.length} hotels (excluded-gallery-images.json is not changed; take entries out by hand if wanted)`);
    if (!confirm) return;
    let ok = 0, fail = 0;
    for (const { id, before } of rb) {
      const e = await patchAndVerify(id, before);
      if (e) { fail++; console.error(id, e); } else ok++;
    }
    console.log(`restored ${ok}, failed ${fail}`);
    return;
  }

  // hotel id -> Map(url -> { kind, reason })
  const remove = new Map();
  const add = (id, url, info) => {
    if (!remove.has(id)) remove.set(id, new Map());
    remove.get(id).set(url, info);
  };
  if (approvedFile) {
    for (const d of JSON.parse(fs.readFileSync(approvedFile, "utf8")).deletions) add(String(d.id), d.url, { kind: d.kind, reason: d.reason });
  } else {
    for (const r of readJsonl(path.join(dir, "exclusions.jsonl"))) for (const f of r.flags) if (f.certainty === "certain") add(r.id, f.url, f);
  }

  const plans = [];
  const held = [];
  for (const [id, urls] of remove) {
    const { row, images } = await currentGallery(id);
    const keep = images.filter((im) => !urls.has(im.url));
    const removed = images.filter((im) => urls.has(im.url));
    if (!removed.length) continue;
    if (keep.length < MIN_LEFT) {
      held.push({ id, name: row.hotel_name, had: images.length, wouldKeep: keep.length });
      continue;
    }
    const before = galleryPayload(images);
    const payload = galleryPayload(keep);
    const changed = Object.keys(payload).filter((k) => payload[k] !== before[k]);
    const pick = (o) => Object.fromEntries(changed.map((k) => [k, o[k]]));
    plans.push({
      id, name: (row.hotel_name ?? "").trim(), removed, urls, from: images.length, to: keep.length,
      heroChanged: images[0].url !== keep[0].url, payload: pick(payload), before: pick(before),
    });
  }
  console.log(`to write: ${plans.length} hotels, ${plans.reduce((s, p) => s + p.removed.length, 0)} images removed`);
  console.log(`main photo changes: ${plans.filter((p) => p.heroChanged).map((p) => p.id).join(", ") || "none"}`);
  if (held.length) console.log("HELD BACK (would keep < 2):", JSON.stringify(held));
  if (!confirm) {
    plans.slice(0, 10).forEach((p) => console.log(" ", p.id, p.name, `${p.from} -> ${p.to}`));
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.writeFileSync(path.join(dir, `rollback-${stamp}.json`), JSON.stringify(plans.map((p) => ({ id: p.id, before: p.before }))));
  const list = JSON.parse(fs.readFileSync(LIST, "utf8"));
  const known = new Set(list.images.map((e) => `${e.hotel_id} ${e.key}`));
  const today = new Date().toISOString().slice(0, 10);
  let ok = 0, fail = 0, listed = 0;
  for (const p of plans) {
    const e = await patchAndVerify(p.id, p.payload);
    if (e) { fail++; console.error(p.id, e); continue; }
    ok++;
    for (const im of p.removed) {
      const key = galleryImageKey(im.url);
      if (known.has(`${p.id} ${key}`)) continue;
      known.add(`${p.id} ${key}`);
      listed++;
      const info = p.urls.get(im.url) ?? {};
      list.images.push({ hotel_id: Number(p.id), hotel: p.name, key, kind: info.kind ?? null, reason: info.reason ?? null, decided: today });
    }
  }
  list.images.sort((a, b) => a.hotel_id - b.hotel_id);
  fs.writeFileSync(LIST, JSON.stringify(list, null, 1) + "\n");
  console.log(`written and verified ${ok}, failed ${fail}; ${listed} added to excluded-gallery-images.json (commit it); rollback-${stamp}.json`);
}

await main();
