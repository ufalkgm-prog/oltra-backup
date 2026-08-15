#!/usr/bin/env node
/**
 * Builds a self-contained offline review tool for the 2026-08-15 brand delta audit.
 *
 * Same pattern as scripts/ratehawk/build-review-tool.mjs: embeds the dataset as a
 * JS const so the page needs no server, autosaves decisions to localStorage, and
 * exports a verified-delta JSON for downstream agents to consume.
 *
 *   node scripts/hotels/build-brand-delta-review.mjs
 *   -> scripts/hotels/brand-delta-review.html
 *
 * Re-run after editing brand-deltas-2026-08-15.json. Decisions live in localStorage
 * keyed by hotel id, so rebuilding does NOT lose review progress.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(here, "brand-deltas-2026-08-15.json");
const OUT_FILE = join(here, "brand-delta-review.html");

const data = JSON.parse(readFileSync(DATA_FILE, "utf8"));
const hotels = data.hotels;

// Fail loudly rather than emitting a half-broken tool.
const problems = [];
const ids = new Set();
for (const h of hotels) {
  if (!h.id || ids.has(h.id)) problems.push(`bad/duplicate id: ${h.id}`);
  ids.add(h.id);
  if (!/^https?:\/\//.test(h.url || "")) problems.push(`${h.id}: missing/invalid url`);
  if (!h.brand || !h.name) problems.push(`${h.id}: missing brand or name`);
}
if (problems.length) {
  console.error("Refusing to build — dataset problems:");
  problems.forEach((p) => console.error("  - " + p));
  process.exit(1);
}

const brands = [...new Set(hotels.map((h) => h.brand))];

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Brand Delta Review — ${data.generated}</title>
<style>
  :root {
    --bg: #2c3634; --panel: #374240; --inset: #232c2a; --border: #3e4947;
    --border-strong: #5b6664; --text: #f5f2ec; --muted: #cbd0cb; --faint: #93a09c;
    --accent: #c8a96a; --include: #7ba079; --include-bg: rgba(123,160,121,0.18);
    --exclude: #ff8a71; --exclude-bg: rgba(255,138,113,0.15);
    --r-lg: 6px; --r-md: 4px; --r-sm: 2px;
    --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font-family: var(--sans); line-height: 1.5; -webkit-font-smoothing: antialiased; }

  header { position: sticky; top: 0; z-index: 20; background: var(--bg); border-bottom: 1px solid var(--border); padding: 14px 22px 12px; }
  .htop { display: flex; align-items: baseline; justify-content: space-between; gap: 20px; flex-wrap: wrap; }
  h1 { font-size: 1.05rem; margin: 0; font-weight: 600; letter-spacing: .01em; }
  h1 span { color: var(--faint); font-weight: 400; margin-left: 8px; font-size: .85rem; }

  .counts { display: flex; gap: 16px; font-size: .82rem; font-family: var(--mono); font-variant-numeric: tabular-nums; }
  .counts b { font-weight: 600; }
  .c-inc b { color: var(--include); } .c-exc b { color: var(--exclude); } .c-pend b { color: var(--accent); }

  .controls { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; align-items: center; }
  select, input[type=search], button {
    font: inherit; font-size: .84rem; color: var(--text); background: var(--inset);
    border: 1px solid var(--border); border-radius: var(--r-md); padding: 5px 9px;
  }
  input[type=search] { min-width: 190px; }
  button { cursor: pointer; background: var(--panel); }
  button:hover { border-color: var(--border-strong); }
  button.primary { background: var(--include); color: #1c2320; border-color: var(--include); font-weight: 600; }
  button.primary:hover { filter: brightness(1.08); }
  .spacer { flex: 1; }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

  main { padding: 18px 22px 90px; }
  .brand-group { margin-bottom: 26px; }
  .brand-head { display: flex; align-items: center; gap: 12px; margin: 0 0 8px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }
  .brand-head h2 { font-size: .95rem; margin: 0; font-weight: 600; }
  .brand-head .bcount { font-size: .78rem; color: var(--faint); font-family: var(--mono); }
  .bulk { margin-left: auto; display: flex; gap: 6px; }
  .bulk button { font-size: .74rem; padding: 3px 8px; }

  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: .66rem; letter-spacing: .07em; text-transform: uppercase; color: var(--faint); font-weight: 600; padding: 6px 8px; }
  td { padding: 7px 8px; border-top: 1px solid var(--border); vertical-align: top; font-size: .87rem; }
  tr.row-include { background: var(--include-bg); }
  tr.row-exclude { background: var(--exclude-bg); opacity: .62; }
  tr:hover td { background: rgba(255,255,255,0.03); }

  td.pick { white-space: nowrap; width: 1%; }
  .pick label { display: inline-flex; align-items: center; gap: 4px; cursor: pointer; font-size: .74rem; margin-right: 8px; user-select: none; }
  .pick input { accent-color: var(--include); cursor: pointer; margin: 0; }
  .pick label.ex input { accent-color: var(--exclude); }

  td.name { font-weight: 600; min-width: 190px; }
  td.loc { color: var(--muted); white-space: nowrap; }
  td.note { color: var(--faint); font-size: .8rem; max-width: 300px; }
  td.url { max-width: 300px; }
  td.url a { color: var(--accent); text-decoration: none; font-family: var(--mono); font-size: .74rem; word-break: break-all; }
  td.url a:hover { text-decoration: underline; }

  .tier { display: inline-block; font-size: .62rem; letter-spacing: .05em; text-transform: uppercase; padding: 1px 5px; border-radius: var(--r-sm); border: 1px solid var(--border-strong); color: var(--faint); margin-left: 6px; vertical-align: 1px; }
  .tier.secondary { color: var(--accent); border-color: var(--accent); }
  .tier.villa { color: var(--muted); }

  footer { position: fixed; bottom: 0; left: 0; right: 0; background: var(--panel); border-top: 1px solid var(--border-strong); padding: 10px 22px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  footer .hint { font-size: .78rem; color: var(--faint); }
  .empty { color: var(--faint); font-size: .85rem; padding: 30px 0; text-align: center; }
</style>
</head>
<body>
<header>
  <div class="htop">
    <h1>Brand Delta Review <span>${hotels.length} properties · audit ${data.generated}</span></h1>
    <div class="counts">
      <span class="c-inc">include <b id="nInc">0</b></span>
      <span class="c-exc">exclude <b id="nExc">0</b></span>
      <span class="c-pend">undecided <b id="nPend">0</b></span>
    </div>
  </div>
  <div class="controls">
    <select id="fBrand"><option value="">All brands</option>${brands.map((b) => `<option>${b}</option>`).join("")}</select>
    <select id="fTier">
      <option value="">All tiers</option>
      <option value="primary">Primary only</option>
      <option value="secondary">Four Seasons secondary tier</option>
      <option value="villa">Villas only</option>
    </select>
    <select id="fState">
      <option value="">All states</option>
      <option value="pending">Undecided only</option>
      <option value="include">Included only</option>
      <option value="exclude">Excluded only</option>
    </select>
    <input type="search" id="fText" placeholder="Search name / city / country">
    <span class="spacer"></span>
    <button id="btnReset">Reset all</button>
  </div>
</header>

<main id="list"></main>

<footer>
  <button class="primary" id="btnExport">Export verified delta JSON</button>
  <button id="btnExportCsv">Export CSV</button>
  <button id="btnImport">Import decisions</button>
  <input type="file" id="fileInput" accept="application/json" hidden>
  <span class="hint">Decisions autosave in this browser. Export writes only the <b>included</b> rows for your agents.</span>
</footer>

<script>
const HOTELS = ${JSON.stringify(hotels)};
const META = ${JSON.stringify({ generated: data.generated, source: data.source })};
const KEY = "oltra_brand_delta_decisions_v1";

let decisions = {};
try { decisions = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { decisions = {}; }
const save = () => localStorage.setItem(KEY, JSON.stringify(decisions));

const $ = (id) => document.getElementById(id);
const filters = { brand: "", tier: "", state: "", text: "" };

function visible() {
  return HOTELS.filter(h => {
    if (filters.brand && h.brand !== filters.brand) return false;
    if (filters.tier && h.tier !== filters.tier) return false;
    const st = decisions[h.id] || "pending";
    if (filters.state && st !== filters.state) return false;
    if (filters.text) {
      const hay = (h.name + " " + h.city + " " + h.country + " " + h.brand).toLowerCase();
      if (!hay.includes(filters.text.toLowerCase())) return false;
    }
    return true;
  });
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

function render() {
  const rows = visible();
  const groups = {};
  rows.forEach(h => { (groups[h.brand] = groups[h.brand] || []).push(h); });

  const el = $("list");
  if (!rows.length) { el.innerHTML = '<p class="empty">No properties match these filters.</p>'; updateCounts(); return; }

  el.innerHTML = Object.entries(groups).map(([brand, list]) => {
    const inc = list.filter(h => decisions[h.id] === "include").length;
    return '<section class="brand-group">' +
      '<div class="brand-head"><h2>' + esc(brand) + '</h2>' +
      '<span class="bcount">' + inc + ' / ' + list.length + ' included</span>' +
      '<span class="bulk">' +
        '<button data-bulk="include" data-brand="' + esc(brand) + '">Include all</button>' +
        '<button data-bulk="exclude" data-brand="' + esc(brand) + '">Exclude all</button>' +
        '<button data-bulk="pending" data-brand="' + esc(brand) + '">Clear</button>' +
      '</span></div>' +
      '<table><thead><tr>' +
        '<th>Decision</th><th>Property</th><th>Location</th><th>Official page</th><th>Note</th>' +
      '</tr></thead><tbody>' +
      list.map(h => {
        const st = decisions[h.id] || "pending";
        const cls = st === "include" ? "row-include" : st === "exclude" ? "row-exclude" : "";
        const tier = h.tier && h.tier !== "primary" ? '<span class="tier ' + h.tier + '">' + esc(h.tier) + '</span>' : "";
        return '<tr class="' + cls + '" data-id="' + esc(h.id) + '">' +
          '<td class="pick">' +
            '<label><input type="checkbox" data-act="include" ' + (st === "include" ? "checked" : "") + '> Include</label>' +
            '<label class="ex"><input type="checkbox" data-act="exclude" ' + (st === "exclude" ? "checked" : "") + '> Exclude</label>' +
          '</td>' +
          '<td class="name">' + esc(h.name) + tier + '</td>' +
          '<td class="loc">' + esc(h.city) + (h.city && h.country ? ", " : "") + esc(h.country) + '</td>' +
          '<td class="url"><a href="' + esc(h.url) + '" target="_blank" rel="noopener noreferrer">' + esc(h.url.replace(/^https?:\\/\\//, "")) + '</a></td>' +
          '<td class="note">' + esc(h.note || "") + '</td>' +
        '</tr>';
      }).join("") +
      '</tbody></table></section>';
  }).join("");
  updateCounts();
}

function updateCounts() {
  let inc = 0, exc = 0;
  HOTELS.forEach(h => { const s = decisions[h.id]; if (s === "include") inc++; else if (s === "exclude") exc++; });
  $("nInc").textContent = inc;
  $("nExc").textContent = exc;
  $("nPend").textContent = HOTELS.length - inc - exc;
}

// Checkboxes act as a mutually-exclusive pair: ticking one clears the other,
// unticking returns the row to undecided.
$("list").addEventListener("change", (e) => {
  const cb = e.target.closest("input[type=checkbox]");
  if (!cb) return;
  const id = cb.closest("tr").dataset.id;
  const act = cb.dataset.act;
  decisions[id] = cb.checked ? act : "pending";
  if (decisions[id] === "pending") delete decisions[id];
  save(); render();
});

$("list").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-bulk]");
  if (!b) return;
  const { bulk, brand } = b.dataset;
  visible().filter(h => h.brand === brand).forEach(h => {
    if (bulk === "pending") delete decisions[h.id]; else decisions[h.id] = bulk;
  });
  save(); render();
});

["fBrand","fTier","fState","fText"].forEach(id => {
  $(id).addEventListener("input", () => {
    filters.brand = $("fBrand").value; filters.tier = $("fTier").value;
    filters.state = $("fState").value; filters.text = $("fText").value;
    render();
  });
});

$("btnReset").addEventListener("click", () => {
  if (!confirm("Clear every include/exclude decision?")) return;
  decisions = {}; save(); render();
});

function download(name, text, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}

$("btnExport").addEventListener("click", () => {
  const included = HOTELS.filter(h => decisions[h.id] === "include")
    .map(({ id, brand, name, city, country, tier, note, url }) => ({ id, brand, name, city, country, tier, note, url }));
  const excluded = HOTELS.filter(h => decisions[h.id] === "exclude").map(h => h.id);
  const undecided = HOTELS.filter(h => !decisions[h.id]).map(h => h.id);
  const payload = {
    generated_from: META,
    verified_at: new Date().toISOString(),
    counts: { included: included.length, excluded: excluded.length, undecided: undecided.length },
    hotels_to_add: included,
    excluded_ids: excluded,
    undecided_ids: undecided
  };
  download("verified-brand-deltas.json", JSON.stringify(payload, null, 2), "application/json");
});

$("btnExportCsv").addEventListener("click", () => {
  const q = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
  const lines = [["decision","brand","name","city","country","tier","note","url"].join(",")];
  HOTELS.forEach(h => lines.push([decisions[h.id] || "undecided", h.brand, h.name, h.city, h.country, h.tier, h.note, h.url].map(q).join(",")));
  download("brand-deltas-reviewed.csv", lines.join("\\n"), "text/csv");
});

$("btnImport").addEventListener("click", () => $("fileInput").click());
$("fileInput").addEventListener("change", async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    // Accept either a raw {id: state} map or a previously exported payload.
    if (j.hotels_to_add) {
      decisions = {};
      j.hotels_to_add.forEach(h => { decisions[h.id] = "include"; });
      (j.excluded_ids || []).forEach(id => { decisions[id] = "exclude"; });
    } else {
      decisions = j;
    }
    save(); render();
  } catch (err) { alert("Could not read that file: " + err.message); }
  e.target.value = "";
});

render();
</script>
</body>
</html>`;

writeFileSync(OUT_FILE, html);
console.log(`Wrote ${OUT_FILE}`);
console.log(`  ${hotels.length} properties across ${brands.length} brands, all with URLs.`);
