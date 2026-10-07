// Step 5 (read-only, costs model calls): picks each hotel's hero (slot 1) and
// second image (slot 2), and the slots that should sit at the back of the
// gallery -> <work>/hero.jsonl. Run it on a snapshot taken AFTER the exclusion
// pass, in its own work folder, so it judges the cleaned gallery.
//   node hero-classify.mjs [--work <dir>] [--only id,id]      C=6 sets concurrency
// The prompt is the one used on 2026-10-06 for 819 hotels.
import fs from "fs";
import path from "path";
import { workDir, onlyIds, readSnapshot, readJsonl, sheetPaths, askAboutSheets, pool, MODEL } from "./lib.mjs";

export const HERO_SYSTEM = `You curate photography for myOLTRA, an editorial luxury travel site for an affluent, design-conscious audience. For each hotel you get contact sheets of every supplier photo, each tile labelled with its slot number in the top-left corner.

Choose two slots:

HERO (shown first, large, full-width): the single most striking, magazine-quality image that makes someone want to stay here. Usually the property in its setting (architecture, facade at its best, aerial, the signature view, the pool against the landscape or sea), or a genuinely iconic interior when that is the hotel's defining feature. It must be a sharp, well-lit, wide photograph that works cropped to a landscape frame.

SECOND (shown next): a strong follow-up that shows a different side of the stay, usually the most appealing guest room or suite, or a signature interior or view if the hero already shows the room. Not a near-duplicate of the hero (not the same facade from a similar angle).

Never choose for either slot: floor plans, maps, logos, text or graphic overlays, collages, close-ups of food or drinks, bathrooms, meeting or conference rooms, gyms, corridors, staff or people-focused shots, dark, blurry, low-resolution or awkwardly cropped photos, or anything marked BROKEN.

Supplier category labels are unreliable, so judge only from what you see. Keep reasons short.`;

const SCHEMA = {
  type: "object", additionalProperties: false, required: ["hero", "second", "confidence", "reason", "problem_slots"],
  properties: {
    hero: { type: "integer" },
    second: { type: "integer" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    reason: { type: "string" },
    problem_slots: {
      type: "array", items: { type: "integer" },
      description: "Slots that should never be shown: floor plans, maps, logos, text overlays, collages, broken",
    },
  },
};

const dir = workDir();
const OUT = path.join(dir, "hero.jsonl");
const done = new Set(readJsonl(OUT).map((r) => r.id));
const only = onlyIds();
const todo = readSnapshot(dir).filter(
  (h) => h.images.length >= 2 && !done.has(h.id) && (!only || only.has(h.id)) && sheetPaths(dir, h).every((p) => fs.existsSync(p))
);

await pool(todo, async (h) => {
  const slots = h.images.map((i) => i.slot);
  const { output: j, usage } = await askAboutSheets({
    system: HERO_SYSTEM,
    schema: SCHEMA,
    sheets: sheetPaths(dir, h),
    text: `Hotel: ${(h.name ?? "").trim()} - ${h.city ?? ""}, ${h.country ?? ""}. Valid slots: ${slots[0]}-${slots[slots.length - 1]}. Currently slot 1 is shown first and slot 2 second.`,
  });
  if (!slots.includes(j.hero) || !slots.includes(j.second) || j.hero === j.second) throw new Error(`invalid slots ${JSON.stringify(j)}`);
  const url = (s) => h.images.find((i) => i.slot === s).url;
  fs.appendFileSync(OUT, JSON.stringify({
    id: h.id, name: h.name, n: slots.length, ...j,
    heroUrl: url(j.hero), secondUrl: url(j.second),
    problemUrls: j.problem_slots.filter((s) => slots.includes(s)).map(url),
    model: MODEL, usage,
  }) + "\n");
});
console.log(`${readJsonl(OUT).length} hotels with a hero chosen`);
