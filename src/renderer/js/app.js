import { TWEAKS } from '../../shared/tweaks.js';
import { healthLabel, healthScore, loadTweaks, appliedCount, restartExplorer } from './actions.js';
import { api, isDemo } from './api.js';
import { icon, logo } from './icons.js';
import { openPalette } from './palette.js';
import { startStats } from './stats.js';
import { on, state } from './state.js';
import { initSpotlight, ringHtml, setRing, toast } from './ui.js';
import { $, $$, formatBytes, sleep } from './util.js';
import { scanJunk } from './views/cleaner.js';

import dashboard from './views/dashboard.js';
import tweaks from './views/tweaks.js';
import cleaner from './views/cleaner.js';
import startup, { loadStartup } from './views/startup.js';
import apps from './views/apps.js';
import debloat from './views/debloat.js';
import toolbox from './views/toolbox.js';
import historyView from './views/history.js';
import settings from './views/settings.js';

export const VIEWS = [
  { ...dashboard, label: 'Dashboard', icon: 'layout-dashboard', group: 'Overview' },
  { ...tweaks, label: 'Tweaks', icon: 'sliders-horizontal', group: 'Optimize' },
  { ...cleaner, label: 'Cleaner', icon: 'brush-cleaning', group: 'Optimize' },
  { ...startup, label: 'Startup', icon: 'power', group: 'Optimize' },
  { ...apps, label: 'Install Apps', icon: 'package-plus', group: 'Software' },
  { ...debloat, label: 'Debloat', icon: 'package-x', group: 'Software' },
  { ...toolbox, label: 'Toolbox', icon: 'wrench', group: 'System' },
  { ...historyView, label: 'History', icon: 'history', group: 'System' },
  { ...settings, label: 'Settings', icon: 'settings', group: 'System' },
];

/* ─────────────── Settings → document ─────────────── */

function applySettings() {
  const d = document.documentElement.dataset;
  const s = state.settings;
  if (s.accent === 'crimson') delete d.accent;
  else d.accent = s.accent;
  d.ambient = s.ambient ? 'on' : 'off';
  d.glass = s.glass ? 'on' : 'off';
  d.motion = s.reduceMotion ? 'reduced' : 'full';
}

/* ─────────────── Shell ─────────────── */

function renderShell() {
  const groups = [...new Set(VIEWS.map((v) => v.group))];
  $('#app').innerHTML = `
    <div class="brand">
      ${logo()}
      <span class="brand-name">Tweaker<b class="grad-text">Tool</b></span>
      <span class="brand-ver">v${api.version || '1.0.0'}</span>
    </div>
    <header class="titlebar">
      <button class="search-trigger" id="open-palette">${icon('search', 'i-sm')}<span>Search tweaks, tools, apps…</span><span class="kbd">Ctrl K</span></button>
      <div class="spacer"></div>
      ${isDemo ? `<span class="status-chip demo" data-tip="Simulated data — nothing on this PC is changed">${icon('flask-conical', 'i-sm')}Demo mode</span>` : ''}
      <span id="admin-chip"></span>
      <div class="win-controls">
        <button class="win-btn" data-win="min" aria-label="Minimize">${icon('minus')}</button>
        <button class="win-btn" data-win="max" aria-label="Maximize">${icon('square', 'i-sm')}</button>
        <button class="win-btn close" data-win="close" aria-label="Close">${icon('x')}</button>
      </div>
    </header>
    <aside class="sidebar">
      <nav class="nav">
        ${groups
          .map(
            (g) => `
          <div class="nav-label">${g}</div>
          ${VIEWS.filter((v) => v.group === g)
            .map((v) => `<a class="nav-item" href="#/${v.id}" data-nav="${v.id}">${icon(v.icon)}<span>${v.label}</span><span class="badge-count" data-badge="${v.id}" hidden></span></a>`)
            .join('')}`,
          )
          .join('')}
      </nav>
      <div class="sidebar-card" id="health-card">
        <div class="row">
          ${ringHtml({ size: 40, stroke: 4, value: 0, ticks: 0, cls: 'mini-ring' })}
          <div class="grow">
            <div class="title">System health <span class="mono" id="hc-score">—</span></div>
            <div class="sub" id="hc-label">Analyzing…</div>
          </div>
        </div>
        <div id="restart-slot"></div>
      </div>
    </aside>
    <main class="main"><div class="main-scroll" id="main-scroll"></div></main>`;

  $('#open-palette').onclick = () => openPalette(VIEWS);
  $$('[data-win]').forEach((b) => {
    b.onclick = () => {
      const w = api.window;
      if (b.dataset.win === 'min') w.minimize();
      else if (b.dataset.win === 'max') w.toggleMaximize();
      else w.close();
    };
  });
  api.window.onMaximized?.((max) => {
    $('[data-win="max"]').innerHTML = icon(max ? 'copy' : 'square', 'i-sm');
  });
}

function renderAdminChip() {
  const slot = $('#admin-chip');
  if (!slot) return;
  slot.innerHTML = state.admin
    ? `<span class="status-chip ok" data-tip="Running with administrator rights"><span class="dot"></span>Administrator</span>`
    : `<button class="status-chip warn" id="elevate" data-tip="Most tweaks need admin rights — click to relaunch elevated">${icon('shield-alert', 'i-sm')}Limited mode</button>`;
  $('#elevate')?.addEventListener('click', async () => {
    const ok = await api.admin.relaunch();
    if (!ok) toast({ type: 'warn', title: 'Elevation cancelled', message: 'TweakerTool keeps running with limited rights.' });
  });
}

function updateBadges() {
  const set = (id, text, hot = false) => {
    const b = $(`[data-badge="${id}"]`);
    if (!b) return;
    b.hidden = !text;
    b.textContent = text || '';
    b.classList.toggle('hot', hot);
  };
  if (state.tweaksLoaded) set('tweaks', state.pending.size ? `${state.pending.size} pending` : `${appliedCount()}/${TWEAKS.length}`, state.pending.size > 0);
  if (state.junk) set('cleaner', state.junk.total > 0 ? formatBytes(state.junk.total, 1) : '');
  if (state.startup) set('startup', String(state.startup.filter((s) => s.enabled).length));
}

function updateHealth() {
  if (!state.tweaksLoaded) return;
  const score = healthScore();
  $('#hc-score').textContent = score;
  $('#hc-label').textContent = healthLabel(score);
  setRing($('#health-card .ring'), score);
}

function updateRestart() {
  const slot = $('#restart-slot');
  const r = state.restart;
  if (!slot) return;
  if (r.reboot || r.signout) {
    slot.innerHTML = `<div class="restart-note">${icon('rotate-cw', 'i-sm')}<span>${r.reboot ? 'Reboot' : 'Sign out'} to finish applying</span></div>`;
  } else if (r.explorer) {
    slot.innerHTML = `<div class="restart-note">${icon('rotate-cw', 'i-sm')}<span class="grow">Explorer restart pending</span><button class="link-btn" id="rs-exp">Restart</button></div>`;
    $('#rs-exp').onclick = (e) => restartExplorer(e.currentTarget);
  } else slot.innerHTML = '';
}

/* ─────────────── Router ─────────────── */

let current = null;
let cleanup = null;

function parseHash() {
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  return { id: path || 'dashboard', params: Object.fromEntries(new URLSearchParams(query)) };
}

function mount() {
  const { id, params } = parseHash();
  const view = VIEWS.find((v) => v.id === id) || VIEWS[0];
  if (typeof cleanup === 'function') cleanup();
  current = view.id;
  $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === current));
  const scroll = $('#main-scroll');
  scroll.scrollTop = 0;
  scroll.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'view';
  scroll.append(root);
  cleanup = view.mount(root, params);
}

export function navigate(id, params = {}) {
  const q = new URLSearchParams(params).toString();
  const hash = `#/${id}${q ? `?${q}` : ''}`;
  if (location.hash === hash) mount();
  else location.hash = hash;
}

/* ─────────────── Boot ─────────────── */

async function boot() {
  applySettings();
  renderShell();
  initSpotlight();

  const splash = $('#splash');
  const step = $('#splash-step');
  const bar = $('#splash-bar');
  const t0 = performance.now();

  step.textContent = 'Reading your hardware…';
  bar.style.setProperty('--v', '25%');
  const sysP = api.system
    .info()
    .then((s) => (state.system = s))
    .catch((err) => toast({ type: 'error', title: 'Could not read system info', message: err.message }));
  const adminP = api.admin.status().then((a) => (state.admin = a)).catch(() => {});
  startStats();
  await Promise.race([Promise.all([sysP, adminP]), sleep(8000)]);

  step.textContent = `Checking ${TWEAKS.length} tweaks…`;
  bar.style.setProperty('--v', '65%');
  await Promise.race([loadTweaks(), sleep(10000)]);

  step.textContent = 'Ready';
  bar.style.setProperty('--v', '100%');
  await sleep(Math.max(250, 1100 - (performance.now() - t0)));

  renderAdminChip();
  updateBadges();
  updateHealth();
  if (!location.hash) window.history.replaceState(null, '', '#/dashboard');
  mount();
  splash.classList.add('done');
  setTimeout(() => splash.remove(), 700);

  // Warm up data used by the dashboard and health score.
  loadStartup().catch(() => {});
  setTimeout(() => scanJunk({ quiet: true }).catch(() => {}), 600);
}

window.addEventListener('hashchange', mount);
on('settings', applySettings);
on('tweaks', () => (updateBadges(), updateHealth()));
on('pending', updateBadges);
on('junk', () => (updateBadges(), updateHealth()));
on('startup', () => (updateBadges(), updateHealth()));
on('restart', updateRestart);

document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    openPalette(VIEWS);
  } else if (mod && /^[1-9]$/.test(e.key)) {
    const v = VIEWS[Number(e.key) - 1];
    if (v) {
      e.preventDefault();
      navigate(v.id);
    }
  }
});

boot();
