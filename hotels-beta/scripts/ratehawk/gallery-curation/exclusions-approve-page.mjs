// Step 4b (read-only): <work>/approve.html for the UNCERTAIN flags in
// <work>/exclusions.jsonl. Open it in a browser, mark images Delete (all start
// as Keep), press Export decisions, then run
//   node exclusions-apply.mjs --approved <downloaded approved-deletions.json>
//   node exclusions-approve-page.mjs [--work <dir>]
import fs from 'fs';
import path from 'path';
import { workDir, readSnapshot, readJsonl } from './lib.mjs';
const dir = workDir();
const snap = new Map(readSnapshot(dir).map(h=>[h.id,h]));
const hotels = [];
for (const r of readJsonl(path.join(dir, 'exclusions.jsonl'))) {
  const h = snap.get(r.id);
  const items = r.flags.filter(f=>f.certainty==='uncertain').map(f => ({ slot:f.slot, kind:f.kind, reason:f.reason, url:f.url, view:f.url.replace('{size}','1024x768') }));
  if (items.length) hotels.push({ id:h.id, name:(h.name??'').trim(), place:[h.city,h.country].filter(Boolean).join(', '), published:h.published, n:h.images.length, items });
}
hotels.sort((a,b)=>a.name.localeCompare(b.name));
const total = hotels.reduce((s,h)=>s+h.items.length,0);
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Gallery approvals</title>
<style>
:root{--bg:#2c3634;--panel:#374240;--line:#3e4947;--text:#f5f2ec;--muted:#cbd0cb;--sage:#8aa884;--red:#c98479}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 system-ui,sans-serif}
header{position:sticky;top:0;z-index:5;background:var(--panel);border-bottom:1px solid var(--line);padding:12px 20px;display:flex;gap:16px;align-items:center;flex-wrap:wrap}
h1{font-size:16px;margin:0;font-weight:600}.muted{color:var(--muted)}
button{font:inherit;color:var(--text);background:transparent;border:2px solid var(--sage);border-radius:999px;padding:4px 14px;cursor:pointer}
button.del{border-color:var(--red)}button.on{background:var(--red);border-color:var(--red)}button.keep.on{background:var(--sage);border-color:var(--sage);color:#14181a}
main{padding:16px 20px;max-width:1500px;margin:0 auto}
.hotel{border:1px solid var(--line);border-radius:6px;background:var(--panel);margin:0 0 16px;padding:14px}
.hotel h2{font-size:15px;margin:0 0 2px}.hotel .top{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start;margin-bottom:10px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:12px}
.card{border:2px solid transparent;border-radius:6px;padding:6px;background:#232c2a}.card.marked{border-color:var(--red)}
.card img{width:100%;aspect-ratio:4/3;object-fit:contain;background:#111;border-radius:4px;display:block}
.meta{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-top:6px;flex-wrap:wrap}
.meta a{color:var(--muted)}.btns{display:flex;gap:6px}
</style></head><body>
<header><h1>Gallery approvals</h1><span class="muted" id="count"></span>
<span class="muted">Every image starts as <b>Keep</b>. Mark the ones to delete; choices are saved in this browser as you go.</span>
<button id="export">Export decisions</button></header>
<main id="main"></main>
<script>
const DATA = ${JSON.stringify(hotels).split("<").join(String.fromCharCode(92)+"u003c")};
const KEY = 'gallery-approvals-' + ${JSON.stringify(path.basename(dir))};
let state = {}; try { state = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} count(); };
const k = (h,it) => h.id + ' ' + it.url;
function count(){ const d = Object.values(state).filter(v=>v==='delete').length; document.getElementById('count').textContent = d + ' marked for deletion of ${total} images in ${hotels.length} hotels'; }
function render(){
  const main = document.getElementById('main'); main.innerHTML = '';
  for (const h of DATA) {
    const sec = document.createElement('section'); sec.className = 'hotel';
    sec.innerHTML = '<div class="top"><div><h2></h2><div class="muted"></div></div><div class="btns"><button class="del all">Delete all for this hotel</button><button class="keep all">Keep all</button></div></div><div class="grid"></div>';
    sec.querySelector('h2').textContent = h.name + ' (' + h.id + ')';
    sec.querySelector('.muted').textContent = h.place + ' · ' + h.n + ' photos in gallery' + (h.published ? '' : ' · unpublished');
    const grid = sec.querySelector('.grid');
    for (const it of h.items) {
      const c = document.createElement('div'); c.className = 'card';
      c.innerHTML = '<img loading="lazy" alt=""><div class="meta"><div><b></b> <span class="muted"></span><br><a target="_blank" rel="noopener">Open image</a></div><div class="btns"><button class="del one">Delete</button><button class="keep one">Keep</button></div></div>';
      c.querySelector('img').src = it.view; c.querySelector('a').href = it.view;
      c.querySelector('b').textContent = 'Slot ' + it.slot + ' · ' + (it.kind === 'floor_plan' ? 'floor plan?' : 'rendering?');
      c.querySelector('.muted').textContent = it.reason;
      const paint = () => { const del = state[k(h,it)] === 'delete'; c.classList.toggle('marked', del); c.querySelector('.del.one').classList.toggle('on', del); c.querySelector('.keep.one').classList.toggle('on', !del); };
      c.querySelector('.del.one').onclick = () => { state[k(h,it)] = 'delete'; save(); paint(); };
      c.querySelector('.keep.one').onclick = () => { delete state[k(h,it)]; save(); paint(); };
      it.paint = paint; paint(); grid.appendChild(c);
    }
    sec.querySelector('.del.all').onclick = () => { h.items.forEach(it => state[k(h,it)] = 'delete'); save(); h.items.forEach(it=>it.paint()); };
    sec.querySelector('.keep.all').onclick = () => { h.items.forEach(it => delete state[k(h,it)]); save(); h.items.forEach(it=>it.paint()); };
    main.appendChild(sec);
  }
}
document.getElementById('export').onclick = () => {
  const deletions = []; for (const h of DATA) for (const it of h.items) if (state[k(h,it)] === 'delete') deletions.push({ id:h.id, slot:it.slot, url:it.url, kind:it.kind, reason:it.reason });
  const blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), deletions }, null, 1)], { type:'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'approved-deletions.json'; a.click();
};
render(); count();
</script></body></html>`;
fs.writeFileSync(path.join(dir, 'approve.html'), html);
console.log('approve.html:', total, 'uncertain images in', hotels.length, 'hotels');
