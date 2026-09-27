import { CLEAN_GROUPS, CLEAN_TARGETS } from '../../../shared/cleaner.js';
import { api } from '../api.js';
import { icon } from '../icons.js';
import { emit, logActivity, on, state } from '../state.js';
import { checkHtml, confetti, toast } from '../ui.js';
import { $, bytesParts, countTo, esc, formatBytes, formatNumber } from '../util.js';

const SEL_KEY = 'tt.clean.selection';
const GROUP_COLOR = { system: 'var(--accent)', browsers: 'var(--accent-2)', apps: '#a78bfa' };

function loadSelection() {
  try {
    const saved = JSON.parse(localStorage.getItem(SEL_KEY));
    if (Array.isArray(saved)) return new Set(saved);
  } catch {
    /* ignore */
  }
  return new Set(CLEAN_TARGETS.filter((t) => t.selected).map((t) => t.id));
}

const selection = loadSelection();
const saveSelection = () => {
  try {
    localStorage.setItem(SEL_KEY, JSON.stringify([...selection]));
  } catch {
    /* ignore */
  }
};

let busy = null; // 'scan' | 'clean' | null
const live = {}; // id -> { size, files, phase }

function computeTotals() {
  const r = state.junk?.results || {};
  let total = 0;
  let files = 0;
  for (const id of selection) {
    total += r[id]?.size || 0;
    files += r[id]?.files || 0;
  }
  return { total, files };
}

/** Scan every target. Shared with the dashboard warm-up. */
export async function scanJunk({ quiet = false } = {}) {
  if (busy) return;
  busy = 'scan';
  emit('junk-busy', busy);
  const off = api.cleaner.onProgress((p) => {
    live[p.id] = { ...live[p.id], ...p };
    emit('junk-progress', p);
  });
  try {
    const results = await api.cleaner.scan(CLEAN_TARGETS.map((t) => t.id));
    state.junk = { results, scannedAt: Date.now(), total: 0 };
    state.junk.total = computeTotals().total;
  } catch (err) {
    if (!quiet) toast({ type: 'error', title: 'Scan failed', message: err.message });
  } finally {
    off();
    busy = null;
    emit('junk-busy', busy);
    emit('junk', state.junk);
  }
}

async function cleanSelected() {
  if (busy || !selection.size) return;
  busy = 'clean';
  emit('junk-busy', busy);
  const ids = [...selection].filter((id) => (state.junk?.results?.[id]?.size || 0) > 0);
  const off = api.cleaner.onProgress((p) => {
    live[p.id] = { ...live[p.id], ...p, cleaning: p.phase !== 'done' };
    emit('junk-progress', p);
  });
  let freed = 0;
  let removed = 0;
  let skipped = 0;
  try {
    const results = await api.cleaner.clean(ids);
    for (const [id, r] of Object.entries(results)) {
      freed += r.freed || 0;
      removed += r.removed || 0;
      skipped += r.skipped || 0;
      state.junk.results[id] = { size: Math.max(0, (state.junk.results[id]?.size || 0) - (r.freed || 0)), files: r.skipped || 0, cleaned: true };
    }
    state.junk.total = computeTotals().total;
    logActivity('clean', `Freed ${formatBytes(freed)}`, `${formatNumber(removed)} files removed${skipped ? `, ${formatNumber(skipped)} in use and skipped` : ''}`);
    confetti({ x: window.innerWidth * 0.36, y: window.innerHeight * 0.36 });
    toast({
      type: 'success',
      title: `Freed ${formatBytes(freed)}`,
      message: `${formatNumber(removed)} files removed${skipped ? ` · ${formatNumber(skipped)} in use were skipped` : ''}.`,
    });
  } catch (err) {
    toast({ type: 'error', title: 'Cleaning failed', message: err.message });
  } finally {
    off();
    Object.keys(live).forEach((k) => delete live[k]);
    busy = null;
    emit('junk-busy', busy);
    emit('junk', state.junk);
  }
}

function rowHtml(t) {
  const r = state.junk?.results?.[t.id];
  const lv = live[t.id];
  const sel = selection.has(t.id);
  let size;
  if (busy === 'scan' && !r) {
    size = lv?.phase === 'start' || lv?.size != null ? `<span class="mono sz">${formatBytes(lv.size || 0)}</span><span class="spinner"></span>` : '<span class="dim sz">Queued</span>';
  } else if (busy === 'clean' && sel && lv?.cleaning) {
    size = '<span class="dim sz">Cleaning…</span><span class="spinner"></span>';
  } else if (r) {
    size = r.size > 0 ? `<span class="mono sz">${formatBytes(r.size)}</span>` : `<span class="dim sz">${r.cleaned ? `${icon('check', 'i-sm')}Clean` : 'Empty'}</span>`;
  } else size = '<span class="dim sz">—</span>';
  const max = Math.max(1, ...Object.values(state.junk?.results || {}).map((x) => x.size || 0));
  const pct = r ? Math.max(r.size > 0 ? 2 : 0, (r.size / max) * 100) : 0;
  return `
    <div class="clean-row ${sel ? 'sel' : ''} ${r && !r.size ? 'is-empty' : ''}" data-t="${t.id}">
      ${checkHtml(sel)}
      <div class="icon-tile sm">${icon(t.icon)}</div>
      <div class="grow">
        <div class="cr-name">${esc(t.name)} ${t.admin && !state.admin ? `<span class="badge outline">${icon('lock')}Admin</span>` : ''}</div>
        <div class="cr-desc">${esc(t.description)}</div>
      </div>
      <div class="cr-size">
        <div class="row" style="justify-content:flex-end;gap:8px">${size}</div>
        <div class="cr-bar"><span style="width:${pct}%;background:${GROUP_COLOR[t.group]}"></span></div>
      </div>
    </div>`;
}

export default {
  id: 'cleaner',
  mount(root, params) {
    root.innerHTML = `
      <div class="page-head">
        <div class="titles">
          <div class="eyebrow">${icon('brush-cleaning')}Optimize</div>
          <h1>Cleaner</h1>
          <p>Reclaim space from temp files, caches and leftovers. Files in use are always skipped.</p>
        </div>
      </div>

      <section class="card clean-hero">
        <div class="scanner" id="scanner">
          <div class="sc-ring r1"></div><div class="sc-ring r2"></div><div class="sc-ring r3"></div>
          <div class="sc-sweep"></div>
          <div class="sc-dots">${Array.from({ length: 7 }, (_, i) => `<i style="--d:${i}"></i>`).join('')}</div>
          <div class="sc-center">
            <div class="sc-num mono"><span id="cl-num">0</span><small id="cl-unit">MB</small></div>
            <div class="sc-cap" id="cl-cap">selected junk</div>
          </div>
        </div>
        <div class="clean-summary">
          <h2 id="cl-title">Ready when you are</h2>
          <p id="cl-sub">Scan to see how much space you can get back.</p>
          <div class="stackbar" id="cl-stack"></div>
          <div class="legend" id="cl-legend"></div>
          <div class="row" style="margin-top:22px">
            <button class="btn btn-primary btn-lg" id="cl-clean" disabled>${icon('sparkles')}<span>Clean selected</span></button>
            <button class="btn btn-secondary btn-lg" id="cl-scan">${icon('scan-search')}<span>Scan</span></button>
          </div>
        </div>
      </section>

      <div class="clean-groups" id="cl-groups"></div>`;

    const groupsEl = $('#cl-groups', root);

    const renderGroups = () => {
      groupsEl.innerHTML = CLEAN_GROUPS.map((g) => {
        const targets = CLEAN_TARGETS.filter((t) => t.group === g.id);
        const total = targets.reduce((a, t) => a + (state.junk?.results?.[t.id]?.size || 0), 0);
        const selCount = targets.filter((t) => selection.has(t.id)).length;
        const allSel = selCount === targets.length;
        return `
          <section class="card clean-group">
            <div class="card-head">
              <button class="check ${allSel ? 'on' : selCount ? 'partial' : ''}" data-group="${g.id}" aria-label="Select all ${esc(g.name)}">${icon('check')}</button>
              <div class="icon-tile sm" style="color:${GROUP_COLOR[g.id]}">${icon(g.icon)}</div>
              <h3>${g.name}</h3>
              <span class="end mono sub">${state.junk ? formatBytes(total) : ''}</span>
            </div>
            <div class="clean-rows">${targets.map(rowHtml).join('')}</div>
          </section>`;
      }).join('');
    };

    const renderHero = () => {
      const scanner = $('#scanner', root);
      scanner.classList.toggle('scanning', busy === 'scan');
      scanner.classList.toggle('cleaning', busy === 'clean');
      const { total, files } = computeTotals();
      const liveTotal = busy === 'scan' ? Object.values(live).reduce((a, x) => a + (x.size || 0), 0) : total;
      const parts = bytesParts(liveTotal);
      const num = $('#cl-num', root);
      if (busy === 'scan') num.textContent = parts.num;
      else countTo(num, Number(parts.num), { duration: 800, format: (v) => (liveTotal >= 1024 ** 3 ? v.toFixed(2) : Math.round(v)) });
      $('#cl-unit', root).textContent = parts.unit;
      $('#cl-cap', root).textContent = busy === 'scan' ? 'found so far' : busy === 'clean' ? 'cleaning…' : 'selected junk';

      const title = $('#cl-title', root);
      const sub = $('#cl-sub', root);
      if (busy === 'scan') {
        title.innerHTML = 'Scanning your drives…';
        sub.textContent = 'Looking through temp folders, caches and logs.';
      } else if (busy === 'clean') {
        title.innerHTML = 'Cleaning up…';
        sub.textContent = 'Removing selected files. Locked files are skipped safely.';
      } else if (state.junk) {
        title.innerHTML = total > 0 ? `Found <span class="grad-text">${formatBytes(total)}</span> to clean` : 'Squeaky clean <span class="grad-text">✦</span>';
        sub.textContent = `${selection.size} of ${CLEAN_TARGETS.length} locations selected · ${formatNumber(files)} files`;
      }

      const sums = CLEAN_GROUPS.map((g) => ({
        g,
        size: CLEAN_TARGETS.filter((t) => t.group === g.id && selection.has(t.id)).reduce((a, t) => a + (state.junk?.results?.[t.id]?.size || 0), 0),
      }));
      const sumAll = sums.reduce((a, s) => a + s.size, 0) || 1;
      $('#cl-stack', root).innerHTML = state.junk
        ? sums.map((s) => `<span style="width:${(s.size / sumAll) * 100}%;background:${GROUP_COLOR[s.g.id]}"></span>`).join('')
        : '<span class="skel"></span>';
      $('#cl-legend', root).innerHTML = sums
        .map((s) => `<span><i style="background:${GROUP_COLOR[s.g.id]}"></i>${s.g.name}<b class="mono">${state.junk ? formatBytes(s.size) : '—'}</b></span>`)
        .join('');

      const cleanBtn = $('#cl-clean', root);
      cleanBtn.disabled = Boolean(busy) || !state.junk || total <= 0;
      cleanBtn.querySelector('span').textContent = total > 0 && !busy ? `Clean ${formatBytes(total)}` : 'Clean selected';
      const scanBtn = $('#cl-scan', root);
      scanBtn.disabled = Boolean(busy);
      scanBtn.querySelector('span').textContent = state.junk ? 'Rescan' : 'Scan';
    };

    const render = () => {
      renderHero();
      renderGroups();
    };
    render();

    root.addEventListener('click', (e) => {
      if (e.target.closest('#cl-scan')) return scanJunk();
      if (e.target.closest('#cl-clean')) return cleanSelected();
      if (busy) return;
      const g = e.target.closest('[data-group]');
      if (g) {
        const ids = CLEAN_TARGETS.filter((t) => t.group === g.dataset.group).map((t) => t.id);
        const all = ids.every((id) => selection.has(id));
        ids.forEach((id) => (all ? selection.delete(id) : selection.add(id)));
      } else {
        const row = e.target.closest('[data-t]');
        if (!row) return;
        const id = row.dataset.t;
        if (selection.has(id)) selection.delete(id);
        else selection.add(id);
      }
      saveSelection();
      if (state.junk) state.junk.total = computeTotals().total;
      emit('junk', state.junk);
    });

    let raf = 0;
    const onProgress = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(render);
    };
    const offs = [on('junk', render), on('junk-busy', render), on('junk-progress', onProgress)];

    if (params.scan && !busy) scanJunk();

    return () => {
      cancelAnimationFrame(raf);
      offs.forEach((off) => off());
    };
  },
};
