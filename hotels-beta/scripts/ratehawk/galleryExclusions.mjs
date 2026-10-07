// Images that must never return to a hotel's gallery (ratehawk_image_1..50).
//
// Every script that writes those fields filters its images through
// isExcludedGalleryImage() first. The list is excluded-gallery-images.json, beside
// this file, committed: a routine re-import from ETG would otherwise put back
// what was taken out on purpose.
//
// Matched on the image's content path ("content/6d/b4/6db4...JPEG"), not the
// whole URL: ETG serves one image at many sizes through the {size} segment and
// the host can change, while the content path identifies the image itself.
// Matched per hotel, as decided: the same file on another hotel is not covered.
//
// To add images, append entries with { hotel_id, key, kind, reason, decided };
// galleryImageKey() gives the key for a URL.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const LIST_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "excluded-gallery-images.json");

export function galleryImageKey(url) {
  const m = String(url ?? "").match(/content\/(.+)$/);
  return m ? m[1] : String(url ?? "");
}

let cache = null;
function load() {
  if (cache) return cache;
  const list = JSON.parse(fs.readFileSync(LIST_PATH, "utf8")).images;
  cache = new Map();
  for (const e of list) {
    const id = String(e.hotel_id);
    if (!cache.has(id)) cache.set(id, new Set());
    cache.get(id).add(e.key);
  }
  return cache;
}

export function isExcludedGalleryImage(hotelId, url) {
  return load().get(String(hotelId))?.has(galleryImageKey(url)) ?? false;
}

export function excludedGalleryImageCount() {
  let n = 0;
  for (const s of load().values()) n += s.size;
  return n;
}
