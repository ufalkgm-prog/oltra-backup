import fs from "node:fs";
import path from "node:path";

let cache: Map<string, string[]> | null = null;

function parse(text: string) {
  const rows = text.split("\n").map((r) => r.split(","));
  const headers = rows[0];

  return rows.slice(1).map((r) => {
    const obj: any = {};
    headers.forEach((h, i) => (obj[h] = r[i]));
    return obj;
  });
}

function load() {
  if (cache) return cache;

  const file = path.resolve(
    process.cwd(),
    "agoda/agoda-matching/all_approved_full.csv"
  );

  const rows = parse(fs.readFileSync(file, "utf8"));

  const map = new Map<string, string[]>();

  rows.forEach((r) => {
    const id = r.agoda_hotel_id;
    if (!id) return;

    const photos = [
      r.agoda_full__photo1,
      r.agoda_full__photo2,
      r.agoda_full__photo3,
      r.agoda_full__photo4,
      r.agoda_full__photo5,
    ].filter(Boolean);

    map.set(id, photos);
  });

  cache = map;
  return map;
}

export function getAgodaPhotos(id: string | null | undefined) {
  if (!id) return [];
  return load().get(id) || [];
}