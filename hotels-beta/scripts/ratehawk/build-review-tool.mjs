#!/usr/bin/env node
// Builds a self-contained, offline HTML review tool from
// scripts/ratehawk/output/ratehawk_match_results.json — open it directly in
// a browser (file://), no server needed. Lets you confirm/reject the
// top Ratehawk candidate(s) per OLTRA hotel and export a decisions JSON.
//
// Usage (from hotels-beta/):
//   node scripts/ratehawk/build-review-tool.mjs

import fs from "fs/promises";
import path from "path";

const outDir = "scripts/ratehawk/output";
const resultsPath = path.join(outDir, "ratehawk_match_results.json");
const outPath = path.join(outDir, "review-tool.html");

const results = JSON.parse(await fs.readFile(resultsPath, "utf8"));

const dataJson = JSON.stringify(results);

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Ratehawk Hotel Match Review</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #f5f4f1;
    --panel: #ffffff;
    --border: #ddd8d0;
    --text: #24211c;
    --muted: #6b6459;
    --accent: #2f6b4f;
    --confirmed: #2f6b4f;
    --rejected: #a13d3d;
    --unsure: #b8862b;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #17150f;
      --panel: #221f19;
      --border: #3a352b;
      --text: #efece4;
      --muted: #a29a89;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
    background: var(--bg);
    color: var(--text);
  }
  header {
    position: sticky;
    top: 0;
    z-index: 10;
    background: var(--panel);
    border-bottom: 1px solid var(--border);
    padding: 12px 20px;
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }
  h1 { font-size: 15px; margin: 0; text-transform: uppercase; letter-spacing: 0.06em; }
  .stats { font-size: 12px; color: var(--muted); display: flex; gap: 12px; flex-wrap: wrap; }
  .stats b { color: var(--text); }
  select, input[type=text], button {
    font: inherit;
    padding: 6px 10px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--panel);
    color: var(--text);
  }
  button { cursor: pointer; }
  button.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
  main { max-width: 980px; margin: 0 auto; padding: 16px 20px 80px; }
  .card {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px 16px;
    margin-bottom: 10px;
  }
  .card.done { opacity: 0.55; }
  .card-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .oltra-name { font-weight: 600; font-size: 14px; }
  .oltra-meta { font-size: 12px; color: var(--muted); }
  .badge {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid var(--border);
  }
  .badge.CONFIRMED { color: var(--confirmed); border-color: var(--confirmed); }
  .badge.LIKELY { color: var(--unsure); border-color: var(--unsure); }
  .badge.QUESTIONABLE { color: var(--rejected); border-color: var(--rejected); }
  .badge.NO_MATCH { color: var(--muted); }
  .candidates { margin-top: 10px; display: flex; flex-direction: column; gap: 8px; }
  .cand {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    font-size: 12.5px;
    flex-wrap: wrap;
  }
  .cand.chosen { border-color: var(--confirmed); background: color-mix(in srgb, var(--confirmed) 10%, transparent); }
  .cand-info { flex: 1; min-width: 220px; }
  .cand-name { font-weight: 600; }
  .cand-meta { color: var(--muted); }
  .cand-actions { display: flex; gap: 6px; }
  .cand-actions button { padding: 4px 9px; font-size: 11px; }
  .no-cands { font-size: 12px; color: var(--muted); font-style: italic; }
  footer {
    position: sticky;
    bottom: 0;
    background: var(--panel);
    border-top: 1px solid var(--border);
    padding: 10px 20px;
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }
</style>
</head>
<body>
<header>
  <h1>Ratehawk Match Review</h1>
  <div class="stats" id="stats"></div>
  <select id="filterStatus">
    <option value="ALL">All statuses</option>
    <option value="CONFIRMED">Confirmed</option>
    <option value="LIKELY">Likely</option>
    <option value="QUESTIONABLE">Questionable</option>
    <option value="NO_MATCH">No match</option>
  </select>
  <select id="filterReview">
    <option value="PENDING">Pending only</option>
    <option value="ALL" selected>All (incl. reviewed)</option>
    <option value="REVIEWED">Reviewed only</option>
  </select>
  <input type="text" id="search" placeholder="Search hotel / city / country..." style="min-width:220px" />
</header>
<main id="list"></main>
<footer>
  <button id="importBtn">Import decisions</button>
  <input type="file" id="importFile" accept="application/json" style="display:none" />
  <button id="exportBtn" class="primary">Export decisions JSON</button>
</footer>
<script>
const DATA = ${dataJson};
const STORE_KEY = "ratehawk_match_decisions_v1";

function loadDecisions() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
  } catch {
    return {};
  }
}
function saveDecisions(d) {
  localStorage.setItem(STORE_KEY, JSON.stringify(d));
}
let decisions = loadDecisions();

const listEl = document.getElementById("list");
const statsEl = document.getElementById("stats");
const filterStatusEl = document.getElementById("filterStatus");
const filterReviewEl = document.getElementById("filterReview");
const searchEl = document.getElementById("search");

function statusCounts() {
  const c = { CONFIRMED: 0, LIKELY: 0, QUESTIONABLE: 0, NO_MATCH: 0 };
  for (const r of DATA) c[r.status] = (c[r.status] || 0) + 1;
  return c;
}
function reviewedCount() {
  return Object.keys(decisions).filter((k) => decisions[k] && decisions[k].decision).length;
}

function renderStats() {
  const c = statusCounts();
  statsEl.innerHTML =
    '<span><b>' + DATA.length + '</b> total</span>' +
    '<span><b>' + c.CONFIRMED + '</b> confirmed-tier</span>' +
    '<span><b>' + c.LIKELY + '</b> likely-tier</span>' +
    '<span><b>' + c.QUESTIONABLE + '</b> questionable-tier</span>' +
    '<span><b>' + c.NO_MATCH + '</b> no-match</span>' +
    '<span><b>' + reviewedCount() + '</b> reviewed</span>';
}

function matchesFilters(row) {
  const statusFilter = filterStatusEl.value;
  if (statusFilter !== "ALL" && row.status !== statusFilter) return false;

  const d = decisions[row.oltra_id];
  const isReviewed = !!(d && d.decision);
  const reviewFilter = filterReviewEl.value;
  if (reviewFilter === "PENDING" && isReviewed) return false;
  if (reviewFilter === "REVIEWED" && !isReviewed) return false;

  const q = searchEl.value.trim().toLowerCase();
  if (q) {
    const hay = [row.oltra_hotel_name, row.oltra_city, row.oltra_country]
      .join(" ")
      .toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function setDecision(oltraId, candidate, decisionType) {
  decisions[oltraId] = {
    decision: decisionType, // "confirmed" | "rejected" | "unsure"
    ratehawk_hid: candidate ? candidate.ratehawk_hid : null,
    ratehawk_name: candidate ? candidate.ratehawk_name : null,
    reviewed_at: new Date().toISOString()
  };
  saveDecisions(decisions);
  render();
}

function clearDecision(oltraId) {
  delete decisions[oltraId];
  saveDecisions(decisions);
  render();
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function renderCard(row) {
  const d = decisions[row.oltra_id];
  const isDone = !!(d && d.decision);
  const card = document.createElement("div");
  card.className = "card" + (isDone ? " done" : "");

  const head = document.createElement("div");
  head.className = "card-head";
  head.innerHTML =
    '<div>' +
      '<div class="oltra-name">' + escapeHtml(row.oltra_hotel_name) + '</div>' +
      '<div class="oltra-meta">' + escapeHtml(row.oltra_city || "—") + ', ' + escapeHtml(row.oltra_country) +
        ' &middot; OLTRA id ' + escapeHtml(row.oltra_id) + '</div>' +
    '</div>' +
    '<span class="badge ' + row.status + '">' + row.status.replace("_", " ") + '</span>';
  card.appendChild(head);

  if (d && d.decision) {
    const summary = document.createElement("div");
    summary.className = "oltra-meta";
    summary.style.marginTop = "6px";
    const label = d.decision === "confirmed" ? "Confirmed → " + d.ratehawk_name + " (hid " + d.ratehawk_hid + ")"
      : d.decision === "rejected" ? "Rejected — no correct candidate"
      : "Marked unsure";
    summary.textContent = label;
    const undoBtn = document.createElement("button");
    undoBtn.textContent = "Undo";
    undoBtn.style.marginLeft = "8px";
    undoBtn.onclick = () => clearDecision(row.oltra_id);
    summary.appendChild(undoBtn);
    card.appendChild(summary);
  }

  if (!row.candidates || !row.candidates.length) {
    const none = document.createElement("div");
    none.className = "no-cands";
    none.style.marginTop = "8px";
    none.textContent = "No candidates found in this hotel's country.";
    card.appendChild(none);

    const otherRow = document.createElement("div");
    otherRow.style.marginTop = "8px";
    otherRow.style.display = "flex";
    otherRow.style.gap = "6px";
    const rejectAllBtn = document.createElement("button");
    rejectAllBtn.textContent = "Confirm no match";
    rejectAllBtn.onclick = () => setDecision(row.oltra_id, null, "rejected");
    const unsureBtn = document.createElement("button");
    unsureBtn.textContent = "Mark unsure";
    unsureBtn.onclick = () => setDecision(row.oltra_id, null, "unsure");
    otherRow.appendChild(rejectAllBtn);
    otherRow.appendChild(unsureBtn);
    card.appendChild(otherRow);
  } else {
    const wrap = document.createElement("div");
    wrap.className = "candidates";
    row.candidates.forEach((c) => {
      const chosen = d && d.decision === "confirmed" && d.ratehawk_hid === c.ratehawk_hid;
      const el = document.createElement("div");
      el.className = "cand" + (chosen ? " chosen" : "");
      el.innerHTML =
        '<div class="cand-info">' +
          '<div class="cand-name">' + escapeHtml(c.ratehawk_name) + '</div>' +
          '<div class="cand-meta">' + escapeHtml(c.ratehawk_city || "—") + ', ' + escapeHtml(c.ratehawk_country) +
            ' &middot; hid ' + escapeHtml(c.ratehawk_hid) +
            ' &middot; score ' + c.score +
            (c.dist_km != null ? ' &middot; ' + c.dist_km + 'km' : '') + '</div>' +
          '<div class="cand-meta">' + escapeHtml(c.notes || "") + '</div>' +
        '</div>';
      const actions = document.createElement("div");
      actions.className = "cand-actions";
      const okBtn = document.createElement("button");
      okBtn.textContent = "Confirm";
      okBtn.onclick = () => setDecision(row.oltra_id, c, "confirmed");
      const noBtn = document.createElement("button");
      noBtn.textContent = "Not this";
      noBtn.onclick = () => setDecision(row.oltra_id, null, "rejected");
      actions.appendChild(okBtn);
      actions.appendChild(noBtn);
      el.appendChild(actions);
      wrap.appendChild(el);
    });
    card.appendChild(wrap);

    const otherRow = document.createElement("div");
    otherRow.style.marginTop = "8px";
    otherRow.style.display = "flex";
    otherRow.style.gap = "6px";
    const rejectAllBtn = document.createElement("button");
    rejectAllBtn.textContent = "None of these match";
    rejectAllBtn.onclick = () => setDecision(row.oltra_id, null, "rejected");
    const unsureBtn = document.createElement("button");
    unsureBtn.textContent = "Mark unsure";
    unsureBtn.onclick = () => setDecision(row.oltra_id, null, "unsure");
    otherRow.appendChild(rejectAllBtn);
    otherRow.appendChild(unsureBtn);
    card.appendChild(otherRow);
  }

  return card;
}

function render() {
  renderStats();
  listEl.innerHTML = "";
  const frag = document.createDocumentFragment();
  let shown = 0;
  for (const row of DATA) {
    if (!matchesFilters(row)) continue;
    frag.appendChild(renderCard(row));
    shown++;
    if (shown >= 1000) break; // safety cap well above the ~871 total hotel count
  }
  if (!shown) {
    const empty = document.createElement("div");
    empty.className = "no-cands";
    empty.textContent = "Nothing matches the current filters.";
    frag.appendChild(empty);
  }
  listEl.appendChild(frag);
}

filterStatusEl.addEventListener("change", render);
filterReviewEl.addEventListener("change", render);
searchEl.addEventListener("input", render);

document.getElementById("exportBtn").addEventListener("click", () => {
  const out = Object.entries(decisions).map(([oltra_id, d]) => ({ oltra_id, ...d }));
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "ratehawk_match_decisions.json";
  a.click();
});

document.getElementById("importBtn").addEventListener("click", () => {
  document.getElementById("importFile").click();
});
document.getElementById("importFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  const arr = JSON.parse(text);
  for (const row of arr) {
    const { oltra_id, ...rest } = row;
    decisions[oltra_id] = rest;
  }
  saveDecisions(decisions);
  render();
});

render();
</script>
</body>
</html>
`;

await fs.writeFile(outPath, html, "utf8");
console.log(`Done: ${outPath}`);
