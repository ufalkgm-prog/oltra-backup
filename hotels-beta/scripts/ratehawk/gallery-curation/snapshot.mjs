// Step 1 (read-only): every hotel's gallery as it is now -> <work>/snapshot.json
//   node snapshot.mjs [--work <dir>] [--only id,id] [--published]
import fs from "fs";
import path from "path";
import { DIRECTUS_URL, H, MAX_IMAGES, imageFields, workDir, onlyIds, flag } from "./lib.mjs";

const dir = workDir();
const only = onlyIds();
const fields = ["id", "hotel_name", "city", "country", "published", ...imageFields()];
const out = [];
for (let page = 1; ; page++) {
  const filter = flag("--published") ? "&filter[published][_eq]=true" : "";
  const r = await fetch(`${DIRECTUS_URL}/items/hotels?limit=100&page=${page}&sort=id${filter}&fields=${fields.join(",")}`, { headers: H });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  const rows = (await r.json()).data;
  if (!rows.length) break;
  for (const h of rows) {
    if (only && !only.has(String(h.id))) continue;
    const images = [];
    for (let i = 1; i <= MAX_IMAGES; i++) {
      const url = h[`ratehawk_image_${i}`];
      if (url) images.push({ slot: images.length + 1, url, category: h[`ratehawk_image_${i}_category`] ?? null });
    }
    if (images.length) out.push({ id: String(h.id), name: h.hotel_name, city: h.city, country: h.country, published: h.published, images });
  }
}
fs.writeFileSync(path.join(dir, "snapshot.json"), JSON.stringify(out));
console.log(`${dir}\nhotels with images ${out.length}, images ${out.reduce((s, h) => s + h.images.length, 0)}`);
