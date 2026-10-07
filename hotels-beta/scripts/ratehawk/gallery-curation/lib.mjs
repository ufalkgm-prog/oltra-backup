// Shared by the gallery-curation scripts: environment, Directus, the work
// folder, the snapshot, contact sheets and the model call. See README.md.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { generateText, Output, jsonSchema } from "ai";
import { anthropic } from "@ai-sdk/anthropic";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const APP_ROOT = path.resolve(HERE, "../../..");
dotenv.config({ path: path.join(APP_ROOT, ".env.local") });

export const DIRECTUS_URL = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const TOKEN = process.env.DIRECTUS_TOKEN;
if (!DIRECTUS_URL || !TOKEN) throw new Error("DIRECTUS_URL and DIRECTUS_TOKEN must be set in hotels-beta/.env.local");
export const H = { Authorization: `Bearer ${TOKEN}` };

export const MAX_IMAGES = 50;
export const PER_SHEET = 16; // must match sheets.py
export const MODEL = "claude-opus-5-5";

export function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : null;
}
export const flag = (name) => process.argv.includes(name);

/** The run's folder: --work <dir>, else output/gallery-curation-<today>. Gitignored. */
export function workDir() {
  const dir = arg("--work") ?? path.join(APP_ROOT, "scripts/ratehawk/output", `gallery-curation-${new Date().toISOString().slice(0, 10)}`);
  fs.mkdirSync(path.join(dir, "sheets"), { recursive: true });
  return dir;
}

export const onlyIds = () => (arg("--only") ? new Set(arg("--only").split(",").map((s) => s.trim())) : null);

export function readSnapshot(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, "snapshot.json"), "utf8"));
}

export function readJsonl(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
}

export const sheetPaths = (dir, h) =>
  Array.from({ length: Math.ceil(h.images.length / PER_SHEET) }, (_, k) => path.join(dir, "sheets", `${h.id}-${k}.jpg`));

export const imageFields = () =>
  Array.from({ length: MAX_IMAGES }, (_, i) => [`ratehawk_image_${i + 1}`, `ratehawk_image_${i + 1}_category`]).flat();

/** One hotel's gallery as it is in Directus now, in slot order. */
export async function currentGallery(id) {
  const r = await fetch(`${DIRECTUS_URL}/items/hotels/${id}?fields=id,hotel_name,${imageFields().join(",")}`, { headers: H });
  if (!r.ok) throw new Error(`GET ${id} ${r.status}`);
  const row = (await r.json()).data;
  const images = [];
  for (let i = 1; i <= MAX_IMAGES; i++) {
    const url = row[`ratehawk_image_${i}`];
    if (url) images.push({ url, category: row[`ratehawk_image_${i}_category`] ?? null });
  }
  return { row, images };
}

/** Every slot 1..50, so a shorter gallery leaves no old image in its tail. */
export function galleryPayload(images) {
  const payload = {};
  for (let n = 1; n <= MAX_IMAGES; n++) {
    payload[`ratehawk_image_${n}`] = images[n - 1]?.url ?? null;
    payload[`ratehawk_image_${n}_category`] = images[n - 1]?.category ?? null;
  }
  return payload;
}

/** PATCH, then read back every field written. Returns an error string or null. */
export async function patchAndVerify(id, payload) {
  const r = await fetch(`${DIRECTUS_URL}/items/hotels/${id}`, {
    method: "PATCH",
    headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) return `PATCH ${r.status} ${(await r.text()).slice(0, 200)}`;
  const back = (await (await fetch(`${DIRECTUS_URL}/items/hotels/${id}?fields=${Object.keys(payload).join(",")}`, { headers: H })).json()).data;
  const bad = Object.keys(payload).filter((k) => (back[k] ?? null) !== (payload[k] ?? null));
  return bad.length ? `readback mismatch on ${bad.slice(0, 3).join(",")}` : null;
}

/** One vision call over a hotel's contact sheets, returning the parsed object. */
export async function askAboutSheets({ system, schema, sheets, text }) {
  const content = sheets.map((p) => ({ type: "file", mediaType: "image/jpeg", data: fs.readFileSync(p) }));
  content.push({ type: "text", text });
  const result = await generateText({
    model: anthropic(MODEL),
    system,
    messages: [{ role: "user", content }],
    output: Output.object({ schema: jsonSchema(schema) }),
    maxOutputTokens: 16000,
    providerOptions: { anthropic: { effort: "medium", fallbacks: "default" } },
  });
  return { output: result.output, usage: { in: result.usage.inputTokens, out: result.usage.outputTokens } };
}

/** Runs fn over items, `concurrency` at a time, retrying each up to 3 times. */
export async function pool(items, fn, concurrency = Number(process.env.C || 6)) {
  let i = 0, n = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (i < items.length) {
        const item = items[i++];
        for (let attempt = 0; attempt < 4; attempt++) {
          try {
            await fn(item);
            break;
          } catch (e) {
            console.error(item.id, "retry", attempt, String(e?.message ?? e).slice(0, 160));
            if (attempt === 3) console.error(item.id, "FAILED");
            else await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
          }
        }
        console.log(`${++n}/${items.length} ${item.id} ${(item.name ?? "").trim()}`);
      }
    })
  );
}
