/**
 * Hotel name check: turn the judged comparison into a rename proposal staged in
 * oltra-agents (new files only).
 *   node scripts/hotels/name-check/stage-proposal.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "output");
const STAGE = "C:/Users/ufalk/dev/oltra-agents/agents/database-agent/hotels/pending";
const DATE = "2026-10-02";

const judged = JSON.parse(fs.readFileSync(path.join(OUT, "judged-all.json")));
const ev = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(OUT, `name-check-all-${DATE}.json`))).map((r) => [r.id, r]));

const fold = (s) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/bvlgari/g, "bulgari");
const words = (s) => fold(s).replace(/&/g, " and ").split(/[^a-z0-9]+/).filter(Boolean);
const BRAND_PHRASE = /,\s*an?\s+(belmond|four seasons|rosewood|taj|viceroy)\b/i;

// Ulrik renamed this one himself on 2026-10-01 (oltra-agents activity log).
const KEEP_BY_ULRIK = { 1343: "Renamed to 'Saint Roch' by Ulrik on 2026-10-01; kept." };

const groups = { remove_place: [], spelling: [], add_place: [], other_words: [], brand_phrase: [] };
for (const j of judged) {
  if (j.decision === "keep" || KEEP_BY_ULRIK[j.id]) continue;
  const h = ev[j.id];
  const row = { id: j.id, current: h.oltra, proposed: j.proposed, city: h.city, country: h.country, reason: j.reason, sources: { ratehawk: h.ratehawk, kayak: h.kayak, google: h.google, site: h.siteName || h.siteTitle } };
  const before = new Set(words(h.oltra)), after = new Set(words(j.proposed));
  const added = [...after].filter((w) => !before.has(w)), removed = [...before].filter((w) => !after.has(w));
  row.words_added = added; row.words_removed = removed;
  if (BRAND_PHRASE.test(j.proposed || "")) groups.brand_phrase.push(row);
  else if (j.decision === "remove_city") groups.remove_place.push(row);
  else if (!added.length && !removed.length) groups.spelling.push(row);
  else if (j.decision === "spelling" && !removed.length && added.every((w) => fold(h.city).includes(w) || fold(h.country).includes(w) || ["london", "paris", "beijing", "amsterdam", "abu", "dhabi", "agra", "madrid", "dubai"].includes(w))) groups.add_place.push(row);
  else groups.other_words.push(row);
}

const proposal = {
  run_date: DATE,
  status: "pending-review",
  apply_requires: "Ulrik's instruction containing 'edit'. Nothing here has been written to Directus.",
  scope: "All 812 published hotels compared against RateHawk, KAYAK, Google Business Profile and the hotel's own website; 495 already match Google exactly, 184 more were judged fine as they are.",
  rule_applied: "Official name as the hotel presents it, without collection or membership tags (Autograph Collection, Relais & Châteaux, LHW, SLH, 'by Hyatt'); change only when two sources agree.",
  kept_by_ulrik: KEEP_BY_ULRIK,
  groups,
};
const jsonFile = path.join(STAGE, `hotel-name-proposal-${DATE}.json`);
const mdFile = path.join(STAGE, `hotel-name-proposal-${DATE}.md`);
for (const p of [jsonFile, mdFile]) if (fs.existsSync(p)) throw new Error("refusing to overwrite " + p);
fs.writeFileSync(jsonFile, JSON.stringify(proposal, null, 2) + "\n");

const table = (rows) => ["| id | Current | Proposed | Why |", "|---|---|---|---|", ...rows.map((r) => `| ${r.id} | ${r.current} | **${r.proposed}** | ${String(r.reason).replace(/\|/g, "/")} |`)].join("\n");
const md = `# Hotel name proposal (${DATE})

Status: **pending review**. Nothing has changed in Directus. Applying any group needs Ulrik's "edit".

**What was compared:** all 812 published hotels, against RateHawk, KAYAK, Google's business profile and each hotel's own website.
* 495 already match Google exactly.
* 184 differ only in ways judged fine, such as Google adding "Resort & Spa" or a collection tag.
* That leaves the ${Object.values(groups).reduce((s, g) => s + g.length, 0)} below.

The rule applied: **use the official name, the way the hotel presents itself**. Leave out collection and membership tags (Autograph Collection, Relais & Châteaux, LHW, SLH, "by Hyatt"). Change a name only when at least two sources agree.

Saint Roch (1343) is kept as you renamed it on 1 October.

## 1. A place we added, to remove (${groups.remove_place.length})

The hotel itself doesn't use the city or country.

${table(groups.remove_place)}

## 2. Spelling, accents and punctuation (${groups.spelling.length})

Same words; brand spelling (Bvlgari), commas, hyphens and accents follow the hotel.

${table(groups.spelling)}

## 3. The official name includes a place we don't show (${groups.add_place.length})

These would **add** a city or area, because the hotel's own name carries it, e.g. "Four Seasons Hotel George V, Paris". Approve only if you want official names to win over shorter ones.

${table(groups.add_place)}

## 4. Other word changes: descriptors, brand prefixes, rebrands (${groups.other_words.length})

Includes possible rebrands to verify:
* Rosewood Le Guanahani → Airelles
* Salamander → The Potomac
* Castello di Reschio → Reschio

${table(groups.other_words)}

## 5. House rule needed: brand phrases (${groups.brand_phrase.length})

Several hotels officially carry a parent-brand phrase, such as "A Belmond Hotel", "A Four Seasons Hotel", "A Rosewood Hotel" or "A Taj Hotel".

**One decision covers all of them:** keep the phrase, as below, or leave it out and keep the current names.

${table(groups.brand_phrase)}
`;
fs.writeFileSync(mdFile, md);
console.log(Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length])), "\n", jsonFile, "\n", mdFile);
