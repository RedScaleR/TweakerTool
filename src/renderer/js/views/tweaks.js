import { CATEGORIES, needsAdmin, RESTART, RESTART_SHORT, RISK, TWEAKS, TWEAK_MAP } from '../../../shared/tweaks.js';
import { commitChanges, desired, discardPending, isApplied, isAvailable, openPresets, stagePending, togglePending } from '../actions.js';
import { api } from '../api.js';
import { icon } from '../icons.js';
import { logActivity, on, state } from '../state.js';
import { switchHtml, syncSegmented, toast, withLoading } from '../ui.js';
import { $, $$, el, esc, fuzzy } from '../util.js';

const CAT = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
const RISK_ICON = { safe: 'shield-check', moderate: 'shield-half', advanced: 'shield-alert' };
const RESTART_ICON = { explorer: 'rotate-cw', signout: 'log-out', reboot: 'power' };

function fmtValue(op, v) {
  if (v === null) return '(delete)';
  if (op.kind === 'DWord') return v > 0xffff ? `0x${(v >>> 0).toString(16).toUpperCase()}` : String(v);
  return `"${v}"`;
}

function opsHtml(t) {
  return t.ops
    .map((op) => {
      switch (op.type) {
        case 'reg':
          return `<div class="op"><span class="op-k">REG</span><span class="op-v"><span class="dim">${esc(op.key)}</span> › <b>${esc(op.name || '(Default)')}</b> = ${esc(fmtValue(op, op.value))} <span class="dim">(revert ${esc(fmtValue(op, op.revert))})</span></span></div>`;
        case 'svc':
          return `<div class="op"><span class="op-k">SVC</span><span class="op-v"><b>${esc(op.name)}</b> → ${op.start} <span class="dim">(revert ${op.revert})</span></span></div>`;
        case 'task':
          return `<div class="op"><span class="op-k">TASK</span><span class="op-v"><span class="dim">${esc(op.path)}</span><b>${esc(op.name)}</b> → disabled</span></div>`;
        case 'ps':
          return `<div class="op"><span class="op-k">PS</span><pre class="op-v">${esc(op.apply)}</pre></div>`;
      }
      return '';
    })
    .join('');
}

function stateLine(t) {
  const s = state.tweaks[t.id];
  if (!state.tweaksLoaded) return '<span class="tw-state"><span class="skeleton" style="width:60px;height:10px;display:inline-block"></span></span>';
  if (!s || s.state === 'unavailable') return `<span class="tw-state na">${icon('ban', 'i-sm')}${esc(s?.reason || 'Unavailable')}</span>`;
  if (state.pending.has(t.id)) {
    const on = state.pending.get(t.id);
    return `<span class="tw-state pend">${icon(on ? 'arrow-up-circle' : 'undo-2', 'i-sm')}${on ? 'Will be applied' : 'Will be reverted'}</span>`;
  }
  if (s.state === 'applied') return `<span class="tw-state on"><span class="dot"></span>Active</span>`;
  if (s.state === 'partial') return `<span class="tw-state part"><span class="dot"></span>Partially applied</span>`;
  return `<span class="tw-state off">Default</span>`;
}

function cardHtml(t, i) {
  const c = CAT[t.category];
  const avail = !state.tweaksLoaded || isAvailable(t.id);
  const on = desired(t.id);
  const pend = state.pending.has(t.id);
  const lock = !state.admin && needsAdmin(t);
  return `
    <article class="tweak spot ${on ? 'on' : ''} ${pend ? 'pending' : ''} ${avail ? '' : 'unavailable'}" data-id="${t.id}" style="--i:${Math.min(i, 18)}">
      <div class="tw-main" data-more>
        <div class="icon-tile hue" style="--h:${c.hue}">${icon(t.icon)}</div>
        <div class="tw-body">
          <div class="tw-title">${esc(t.title)}</div>
          <div class="tw-desc">${esc(t.description)}</div>
        </div>
        ${switchHtml(on, `data-toggle aria-label="${esc(t.title)}" ${!state.tweaksLoaded || !avail ? 'disabled' : ''}`)}
      </div>
      <div class="tw-foot">
        <span class="badge ${t.risk}" data-tip="${esc(RISK[t.risk].hint)}">${icon(RISK_ICON[t.risk])}${RISK[t.risk].label}</span>
        ${t.restart ? `<span class="badge outline" data-tip="Takes effect after: ${RESTART[t.restart]}">${icon(RESTART_ICON[t.restart])}${RESTART_SHORT[t.restart]}</span>` : ''}
        ${t.minBuild ? '<span class="badge outline">Win 11</span>' : ''}
        ${lock ? `<span class="badge outline" data-tip="Needs administrator rights">${icon('lock')}Admin</span>` : ''}
        <span class="grow"></span>
        ${stateLine(t)}
        <button class="tw-more" data-more aria-label="Details">${icon('chevron-down', 'i-sm')}</button>
      </div>
      <div class="tw-details">
        <div class="tw-details-inner">
          <div class="tw-details-title">${icon('code-xml', 'i-sm')}What this changes</div>
          ${opsHtml(t)}
        </div>
      </div>
    </article>`;
}

export default {
  id: 'tweaks',
  mount(root, params) {
    let cat = CAT[params.cat] ? params.cat : 'all';
    let query = params.q || '';
    let risk = 'all';
    let status = 'all';
    const focus = TWEAK_MAP.has(params.focus) ? params.focus : null;
    if (focus) {
      cat = TWEAK_MAP.get(focus).category;
    }

    root.innerHTML = `
      <div class="page-head">
        <div class="titles">
          <div class="eyebrow">${icon('sliders-horizontal')}Optimize</div>
          <h1>Tweaks</h1>
          <p id="tw-sub"></p>
        </div>
        <div class="actions">
          <button class="btn btn-secondary" data-act="restore">${icon('life-buoy')}Restore point</button>
          <button class="btn btn-primary" data-act="presets">${icon('wand-sparkles')}Presets</button>
        </div>
      </div>

      <div class="tw-toolbar">
        <div class="segmented" id="cat-seg">
          <span class="seg-ind"></span>
          <button data-cat="all">${icon('layout-grid')}All</button>
          ${CATEGORIES.map((c) => `<button data-cat="${c.id}">${icon(c.icon)}${c.name}</button>`).join('')}
        </div>
      </div>

      <div class="tw-filters">
        <label class="input grow ${query ? 'has-value' : ''}" style="max-width:380px">
          ${icon('search')}
          <input id="tw-search" placeholder="Search ${TWEAKS.length} tweaks…" value="${esc(query)}" spellcheck="false"/>
          <button class="clear" data-act="clear">${icon('x', 'i-sm')}</button>
        </label>
        <div class="row chips" id="risk-chips">
          <button class="chip" data-risk="all">All risks</button>
          ${Object.entries(RISK).map(([k, r]) => `<button class="chip" data-risk="${k}"><span class="risk-dot ${k}"></span>${r.label}</button>`).join('')}
        </div>
        <div class="row chips" id="status-chips">
          <button class="chip" data-status="all">Any state</button>
          <button class="chip" data-status="on">Active</button>
          <button class="chip" data-status="off">Inactive</button>
        </div>
        <span class="grow"></span>
        <button class="btn btn-ghost btn-sm" data-act="enable-view" data-tip="Stage every visible tweak that is off">${icon('list-checks')}Enable all shown</button>
      </div>

      <div id="cat-banner"></div>
      <div class="tweak-grid" id="tweak-grid"></div>`;

    const grid = $('#tweak-grid', root);
    const seg = $('#cat-seg', root);
    const bar = el(`
      <div class="action-bar" id="pending-bar">
        <span class="count-pill" id="pb-count">0</span>
        <div><div class="label" id="pb-label"></div><div class="detail" id="pb-detail"></div></div>
        <span class="sep"></span>
        <button class="btn btn-ghost btn-sm" data-a="discard">Discard</button>
        <button class="btn btn-primary" data-a="apply">${icon('check')}Apply changes</button>
      </div>`);
    document.body.append(bar);

    const visible = () =>
      TWEAKS.filter((t) => {
        if (cat !== 'all' && t.category !== cat) return false;
        if (risk !== 'all' && t.risk !== risk) return false;
        if (status === 'on' && !isApplied(t.id)) return false;
        if (status === 'off' && isApplied(t.id)) return false;
        if (query && !fuzzy(query, `${t.title} ${t.description} ${(t.tags || []).join(' ')} ${CAT[t.category].name}`)) return false;
        return true;
      });

    const renderSub = () => {
      const on = TWEAKS.filter((t) => isApplied(t.id)).length;
      $('#tw-sub', root).innerHTML = `${TWEAKS.length} tweaks across ${CATEGORIES.length} categories · <b class="grad-text">${on} active</b> · every change is reversible`;
    };

    const renderBanner = () => {
      const b = $('#cat-banner', root);
      if (cat === 'all' || query) {
        b.innerHTML = '';
        return;
      }
      const c = CAT[cat];
      const list = TWEAKS.filter((t) => t.category === cat);
      const on = list.filter((t) => isApplied(t.id)).length;
      b.innerHTML = `
        <div class="cat-banner" style="--h:${c.hue}">
          <div class="icon-tile lg hue" style="--h:${c.hue}">${icon(c.icon, 'i-lg')}</div>
          <div class="grow"><h2>${c.name}</h2><p>${c.blurb}</p></div>
          <div class="cb-stat mono"><b>${on}</b>/${list.length}<small>active</small></div>
        </div>`;
    };

    const renderGrid = () => {
      const list = visible();
      grid.classList.remove('stagger');
      void grid.offsetWidth;
      grid.classList.add('stagger');
      grid.innerHTML = list.length
        ? list.map(cardHtml).join('')
        : `<div class="empty" style="grid-column:1/-1"><div class="icon-tile">${icon('search-x')}</div><h3>No tweaks match</h3><p>Try a different search or clear the filters.</p></div>`;
      $$('[data-cat]', seg).forEach((b) => b.classList.toggle('active', b.dataset.cat === cat));
      $$('[data-risk]', root).forEach((b) => b.classList.toggle('active', b.dataset.risk === risk));
      $$('[data-status]', root).forEach((b) => b.classList.toggle('active', b.dataset.status === status));
      syncSegmented(seg);
      renderBanner();
    };

    const updateCard = (id) => {
      const node = grid.querySelector(`[data-id="${id}"]`);
      if (!node) return;
      const open = node.classList.contains('open');
      const fresh = el(cardHtml(TWEAK_MAP.get(id), 0));
      fresh.style.animation = 'none';
      if (open) fresh.classList.add('open');
      node.replaceWith(fresh);
    };

    const renderBar = () => {
      const n = state.pending.size;
      const en = [...state.pending.values()].filter(Boolean).length;
      bar.classList.toggle('show', n > 0);
      if (!n) return;
      $('#pb-count', bar).textContent = n;
      $('#pb-label', bar).textContent = `${n} pending change${n > 1 ? 's' : ''}`;
      $('#pb-detail', bar).textContent = [en && `${en} to apply`, n - en && `${n - en} to revert`].filter(Boolean).join(' · ');
    };

    renderSub();
    renderGrid();
    renderBar();
    requestAnimationFrame(() => syncSegmented(seg));

    if (focus) {
      setTimeout(() => {
        const node = grid.querySelector(`[data-id="${focus}"]`);
        node?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        node?.classList.add('flash', 'open');
      }, 250);
    }

    // Events
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cat]');
      if (!b || b.dataset.cat === cat) return;
      cat = b.dataset.cat;
      renderGrid();
    });

    const search = $('#tw-search', root);
    search.addEventListener('input', () => {
      query = search.value;
      search.closest('.input').classList.toggle('has-value', !!query);
      renderGrid();
    });

    root.addEventListener('click', async (e) => {
      const t = e.target;
      if (t.closest('[data-act="clear"]')) {
        e.preventDefault();
        search.value = query = '';
        search.closest('.input').classList.remove('has-value');
        return renderGrid();
      }
      const r = t.closest('[data-risk]');
      if (r) {
        risk = r.dataset.risk;
        return renderGrid();
      }
      const s = t.closest('[data-status]');
      if (s) {
        status = s.dataset.status;
        return renderGrid();
      }
      if (t.closest('[data-act="presets"]')) return openPresets();
      if (t.closest('[data-act="enable-view"]')) {
        const ids = visible().filter((tw) => isAvailable(tw.id) && !isApplied(tw.id)).map((tw) => tw.id);
        if (!ids.length) return toast({ type: 'info', title: 'Nothing to stage', message: 'Every tweak shown is already active.' });
        stagePending(ids, true);
        return toast({ type: 'info', title: `Staged ${ids.length} tweak${ids.length > 1 ? 's' : ''}`, message: 'Review them, then press Apply changes.' });
      }
      const rp = t.closest('[data-act="restore"]');
      if (rp) {
        return withLoading(rp, async () => {
          try {
            const res = await api.tools.restorePoint('TweakerTool manual checkpoint');
            if (res?.ok === false) throw new Error(res.error);
            toast({ type: 'success', title: 'Restore point created', message: 'You can roll back from System Protection at any time.' });
            logActivity('tool', 'Created restore point', 'Manual checkpoint');
          } catch (err) {
            toast({ type: 'error', title: 'Restore point failed', message: err.message });
          }
        });
      }

      const card = t.closest('.tweak');
      if (!card) return;
      const id = card.dataset.id;
      if (t.closest('[data-toggle]')) {
        if (!state.tweaksLoaded || !isAvailable(id)) return;
        togglePending(id, !desired(id));
        return;
      }
      if (t.closest('[data-more]')) card.classList.toggle('open');
    });

    bar.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'discard') discardPending();
      if (a === 'apply') commitChanges();
    });

    const offs = [
      on('pending', () => {
        grid.querySelectorAll('.tweak').forEach((n) => {
          const id = n.dataset.id;
          const shouldPend = state.pending.has(id);
          if (n.classList.contains('pending') !== shouldPend || n.classList.contains('on') !== desired(id)) updateCard(id);
        });
        renderBar();
      }),
      on('tweaks', () => {
        renderSub();
        grid.querySelectorAll('.tweak').forEach((n) => updateCard(n.dataset.id));
        renderBanner();
      }),
    ];
    const onResize = () => syncSegmented(seg);
    window.addEventListener('resize', onResize);

    return () => {
      offs.forEach((off) => off());
      window.removeEventListener('resize', onResize);
      bar.classList.remove('show');
      setTimeout(() => bar.remove(), 400);
    };
  },
};
