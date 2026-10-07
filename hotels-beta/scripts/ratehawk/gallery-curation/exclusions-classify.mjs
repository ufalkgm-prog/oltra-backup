// Step 3 (read-only, costs model calls): flags floor plans and renderings in each
// gallery, each "certain" or "uncertain" -> <work>/exclusions.jsonl
//   node exclusions-classify.mjs [--work <dir>] [--only id,id]      C=6 sets concurrency
// The prompt is the one used on 2026-10-07 (457 certain, 1,263 uncertain of 24,507).
import fs from "fs";
import path from "path";
import { workDir, onlyIds, readSnapshot, readJsonl, sheetPaths, askAboutSheets, pool, MODEL } from "./lib.mjs";

export const EXCLUSIONS_SYSTEM = `You review hotel photo galleries for myOLTRA, an editorial luxury travel site. You get contact sheets of one hotel's gallery; every tile is labelled with its slot number in the top-left corner.

Find only two kinds of image, which must leave the hotel gallery:

FLOOR PLAN - any drawn layout: a room, suite or villa floor plan, a building or floor layout, a site plan, an architectural section or elevation, a cutaway diagram. Coloured, 3D or isometric plans count.

RENDERING - an image that is not a photograph: a computer-generated or 3D visualisation of a room, building or view (CGI), an artist's impression, an illustration, painting or sketch standing in for the place.

Not flagged: real photographs of any kind, however polished, edited, HDR or twilight-lit; photographs of interiors that happen to include artwork, maps or drawings on the wall; logos, maps, collages, food, people or any other problem. Those are out of scope here.

For each flagged tile say how sure you are:
- "certain": unmistakable at a glance - a plan on a plain background, or a render with the clearly synthetic lighting, textures and geometry of CGI.
- "uncertain": it might be a rendering but could be a real photograph (or the reverse), or it is too small or unclear to judge. When in doubt, flag it as uncertain rather than leaving it out; a person will decide.

Return every flagged slot once. Return an empty list if there are none. Keep each reason to a few words.`;

const SCHEMA = {
  type: "object", additionalProperties: false, required: ["flags"],
  properties: {
    flags: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["slot", "kind", "certainty", "reason"],
        properties: {
          slot: { type: "integer" },
          kind: { type: "string", enum: ["floor_plan", "rendering"] },
          certainty: { type: "string", enum: ["certain", "uncertain"] },
          reason: { type: "string" },
        },
      },
    },
  },
};

const dir = workDir();
const OUT = path.join(dir, "exclusions.jsonl");
const done = new Set(readJsonl(OUT).map((r) => r.id));
const only = onlyIds();
const todo = readSnapshot(dir).filter(
  (h) => !done.has(h.id) && (!only || only.has(h.id)) && sheetPaths(dir, h).every((p) => fs.existsSync(p))
);

await pool(todo, async (h) => {
  const slots = new Set(h.images.map((i) => i.slot));
  const { output, usage } = await askAboutSheets({
    system: EXCLUSIONS_SYSTEM,
    schema: SCHEMA,
    sheets: sheetPaths(dir, h),
    text: `Hotel: ${(h.name ?? "").trim()} - ${h.city ?? ""}, ${h.country ?? ""}. ${h.images.length} images, slots 1-${h.images.length}.`,
  });
  const seen = new Set();
  const flags = [];
  for (const f of output.flags) {
    if (!slots.has(f.slot)) throw new Error(`invalid slot ${f.slot}`);
    if (seen.has(f.slot)) continue;
    seen.add(f.slot);
    flags.push({ ...f, url: h.images.find((i) => i.slot === f.slot).url });
  }
  fs.appendFileSync(OUT, JSON.stringify({ id: h.id, name: h.name, n: h.images.length, flags, model: MODEL, usage }) + "\n");
});

const rows = readJsonl(OUT);
const counts = {};
for (const r of rows) for (const f of r.flags) counts[`${f.kind}/${f.certainty}`] = (counts[`${f.kind}/${f.certainty}`] ?? 0) + 1;
console.log(`${rows.length} hotels classified`, counts);
