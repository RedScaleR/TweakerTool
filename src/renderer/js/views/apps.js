import { APP_CATEGORIES, APP_MAP, APPS } from '../../../shared/apps.js';
import { api } from '../api.js';
import { icon } from '../icons.js';
import { logActivity, state } from '../state.js';
import { checkHtml, confirmDialog, modal, toast } from '../ui.js';
import { $, el, esc, fuzzy, initials } from '../util.js';

const selected = new Set();
let wingetVersion;
let installing = false;

function tileHtml(a, i) {
  const inst = state.installed?.includes(a.id);
  const sel = selected.has(a.id);
  return `
    <button class="app-tile spot ${sel ? 'sel' : ''} ${inst ? 'installed' : ''}" data-app="${esc(a.id)}" style="--i:${Math.min(i, 20)}">
      <div class="row" style="align-items:flex-start">
        <div class="app-avatar" style="--h:${a.hue};--s:${a.sat ?? 85}%">${esc(initials(a.name))}</div>
        <span class="grow"></span>
        ${inst ? `<span class="badge safe">${icon('check')}Installed</span>` : checkHtml(sel)}
      </div>
      <div class="at-name">${esc(a.name)}</div>
      <div class="at-desc">${esc(a.description)}</div>
      <div class="at-id mono">${esc(a.id)}</div>
    </button>`;
}

async function runQueue(verb, ids) {
  installing = true;
  const label = verb === 'install' ? 'Installing' : 'Uninstalling';
  const results = {};
  await new Promise((resolve) => {
    modal({
      title: `${label} ${ids.length} app${ids.length > 1 ? 's' : ''}`,
      subtitle: 'Downloaded straight from the official winget repository.',
      iconName: verb === 'install' ? 'download' : 'trash-2',
      render(body, m) {
        m.lock();
        body.innerHTML = `
          <div class="op-list">
            ${ids
              .map((id) => {
                const a = APP_MAP.get(id);
                return `<div class="op-row wait install-row" data-row="${esc(id)}">
                  <div class="app-avatar" style="--h:${a.hue};--s:${a.sat ?? 85}%;width:34px;height:34px;border-radius:10px;font-size:13px">${esc(initials(a.name))}</div>
                  <div class="name"><b>${esc(a.name)}</b><div class="ir-line dim mono">Waiting…</div><div class="bar" style="margin-top:8px;height:4px"><span style="--v:0%"></span></div></div>
                  <div class="state-icon">${icon('circle-dashed')}</div>
                </div>`;
              })
              .join('')}
          </div>`;
        m.foot.innerHTML = `<div class="left" id="iq-status">Starting…</div><button class="btn btn-primary" id="iq-done" disabled>Done</button>`;
        $('#iq-done', m.foot).onclick = () => m.close();

        const off = api.apps.onProgress((p) => {
          const row = body.querySelector(`[data-row="${CSS.escape(p.id)}"]`);
          if (!row) return;
          if (p.line) row.querySelector('.ir-line').textContent = p.line;
          if (p.pct != null) row.querySelector('.bar span').style.setProperty('--v', `${p.pct}%`);
        });

        (async () => {
          let n = 0;
          for (const id of ids) {
            n++;
            $('#iq-status', m.foot).textContent = `${label} ${n} of ${ids.length}…`;
            const row = body.querySelector(`[data-row="${CSS.escape(id)}"]`);
            row.className = 'op-row install-row busy';
            row.querySelector('.state-icon').innerHTML = '<span class="spinner"></span>';
            row.scrollIntoView({ block: 'nearest' });
            try {
              results[id] = await api.apps[verb](id);
            } catch (err) {
              results[id] = { ok: false, error: err.message };
            }
            const ok = results[id].ok;
            row.className = `op-row install-row ${ok ? 'ok' : 'fail'}`;
            row.querySelector('.state-icon').innerHTML = icon(ok ? 'circle-check' : 'circle-x');
            row.querySelector('.bar span').style.setProperty('--v', '100%');
            if (!ok) row.querySelector('.ir-line').textContent = results[id].error || 'Failed';
          }
          off();
          const okCount = Object.values(results).filter((r) => r.ok).length;
          m.lock(false);
          m.setTitle(okCount === ids.length ? 'All done' : 'Finished with issues', `${okCount} of ${ids.length} ${verb === 'install' ? 'installed' : 'removed'}.`);
          $('#iq-status', m.foot).textContent = okCount === ids.length ? 'Enjoy your new apps.' : 'Failed items can be retried.';
          $('#iq-done', m.foot).disabled = false;
          resolve();
        })();
      },
    });
  });
  installing = false;
  return results;
}

export default {
  id: 'apps',
  mount(root, params) {
    let cat = 'all';
    let query = '';
    if (params.select && APP_MAP.has(params.select)) {
      selected.add(params.select);
      cat = APP_MAP.get(params.select).category;
    }

    root.innerHTML = `
      <div class="page-head">
        <div class="titles">
          <div class="eyebrow">${icon('package-plus')}Software</div>
          <h1>Install Apps</h1>
          <p>Pick your essentials and install them silently in one go — no installers, no toolbars, no clicking Next.</p>
        </div>
        <div class="actions"><span class="status-chip" id="winget-chip"><span class="spinner" style="width:12px;height:12px"></span>Checking winget…</span></div>
      </div>

      <div class="tw-filters">
        <label class="input" style="width:300px">${icon('search')}<input id="ap-search" placeholder="Search ${APPS.length} apps…" spellcheck="false"/></label>
        <div class="row chips" id="ap-cats" style="flex-wrap:wrap">
          <button class="chip" data-cat="all">${icon('layout-grid')}All</button>
          ${APP_CATEGORIES.map((c) => `<button class="chip" data-cat="${c.id}">${icon(c.icon)}${c.name}</button>`).join('')}
        </div>
      </div>

      <div class="app-grid" id="ap-grid"></div>`;

    const grid = $('#ap-grid', root);
    const bar = el(`
      <div class="action-bar">
        <span class="count-pill" id="ab-count">0</span>
        <div><div class="label" id="ab-label"></div><div class="detail">Installed silently via winget</div></div>
        <span class="sep"></span>
        <button class="btn btn-ghost btn-sm" data-a="clear">Clear</button>
        <button class="btn btn-primary" data-a="install">${icon('download')}Install</button>
      </div>`);
    document.body.append(bar);

    const render = () => {
      const list = APPS.filter((a) => (cat === 'all' || a.category === cat) && (!query || fuzzy(query, `${a.name} ${a.description} ${a.id}`)));
      grid.className = 'app-grid stagger';
      grid.innerHTML = list.length
        ? list.map(tileHtml).join('')
        : `<div class="empty" style="grid-column:1/-1"><div class="icon-tile">${icon('package-search')}</div><h3>No apps found</h3><p>Try a different name.</p></div>`;
      root.querySelectorAll('[data-cat]').forEach((b) => b.classList.toggle('active', b.dataset.cat === cat));
      renderBar();
    };

    const renderBar = () => {
      const n = selected.size;
      bar.classList.toggle('show', n > 0);
      $('#ab-count', bar).textContent = n;
      $('#ab-label', bar).textContent = `${n} app${n === 1 ? '' : 's'} selected`;
    };

    const renderWinget = () => {
      const chip = $('#winget-chip', root);
      if (wingetVersion === undefined) return;
      chip.className = `status-chip ${wingetVersion ? 'ok' : 'warn'}`;
      chip.innerHTML = wingetVersion ? `<span class="dot"></span>winget ${esc(wingetVersion)}` : `${icon('triangle-alert', 'i-sm')}winget not found`;
      if (!wingetVersion) chip.dataset.tip = 'Install "App Installer" from the Microsoft Store';
    };

    render();
    renderWinget();

    if (wingetVersion === undefined) {
      api.apps
        .winget()
        .then((v) => {
          wingetVersion = v;
          if (root.isConnected) renderWinget();
        })
        .catch(() => (wingetVersion = null));
    }
    if (!state.installed) {
      api.apps
        .installed()
        .then((ids) => {
          state.installed = ids;
          ids.forEach((id) => selected.delete(id));
          if (root.isConnected) render();
        })
        .catch(() => (state.installed = []));
    }

    $('#ap-search', root).addEventListener('input', (e) => {
      query = e.target.value;
      render();
    });

    root.addEventListener('click', async (e) => {
      const c = e.target.closest('[data-cat]');
      if (c) {
        cat = c.dataset.cat;
        return render();
      }
      const tile = e.target.closest('[data-app]');
      if (!tile) return;
      const id = tile.dataset.app;
      if (state.installed?.includes(id)) {
        const a = APP_MAP.get(id);
        const ok = await confirmDialog({ title: `Uninstall ${a.name}?`, message: `${esc(a.name)} will be removed silently with winget.`, confirm: 'Uninstall', danger: true, iconName: 'trash-2' });
        if (!ok) return;
        const r = await runQueue('uninstall', [id]);
        if (r[id]?.ok) {
          state.installed = state.installed.filter((x) => x !== id);
          logActivity('uninstall', `Uninstalled ${a.name}`, id);
        }
        return render();
      }
      if (selected.has(id)) selected.delete(id);
      else selected.add(id);
      tile.outerHTML = tileHtml(APP_MAP.get(id), 0);
      renderBar();
    });

    bar.addEventListener('click', async (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'clear') {
        selected.clear();
        render();
      }
      if (a === 'install' && !installing) {
        if (wingetVersion === null) {
          return toast({ type: 'error', title: 'winget is not available', message: 'Install or update "App Installer" from the Microsoft Store, then try again.' });
        }
        const ids = [...selected];
        const results = await runQueue('install', ids);
        const ok = ids.filter((id) => results[id]?.ok);
        state.installed = [...new Set([...(state.installed || []), ...ok])];
        ok.forEach((id) => selected.delete(id));
        if (ok.length) logActivity('install', `Installed ${ok.length} app${ok.length > 1 ? 's' : ''}`, ok.map((id) => APP_MAP.get(id).name).join(', '));
        render();
      }
    });

    return () => {
      bar.classList.remove('show');
      setTimeout(() => bar.remove(), 400);
    };
  },
};
