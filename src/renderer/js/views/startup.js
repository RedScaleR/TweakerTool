import { api } from '../api.js';
import { icon } from '../icons.js';
import { emit, logActivity, on, state } from '../state.js';
import { switchHtml, toast } from '../ui.js';
import { $, countTo, esc, fuzzy, hashHue, initials } from '../util.js';

let loading = null;

export function loadStartup() {
  loading ??= api.startup
    .list()
    .then((items) => {
      state.startup = items.sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name));
      emit('startup', state.startup);
    })
    .catch((err) => toast({ type: 'error', title: 'Could not read startup apps', message: err.message }))
    .finally(() => (loading = null));
  return loading;
}

function avatar(item) {
  if (item.icon) return `<div class="app-avatar img"><img src="${item.icon}" alt=""/></div>`;
  return `<div class="app-avatar" style="--h:${hashHue(item.name)}">${esc(initials(item.name))}</div>`;
}

function rowHtml(item, i) {
  const lock = item.scope === 'machine' && !state.admin;
  return `
    <div class="su-row ${item.enabled ? 'on' : ''}" data-key="${esc(item.key)}" style="--i:${Math.min(i, 14)}">
      ${avatar(item)}
      <div class="su-main">
        <div class="su-name">${esc(item.name)}</div>
        <div class="su-pub">${esc(item.publisher || item.description || 'Unknown publisher')}</div>
      </div>
      <div class="su-cmd mono" title="${esc(item.command)}">${esc(item.command)}</div>
      <div class="su-tags">
        <span class="badge outline">${icon(item.scope === 'user' ? 'user' : 'users')}${item.scope === 'user' ? 'You' : 'All users'}</span>
        <span class="badge outline">${icon(item.source === 'folder' ? 'folder' : 'binary')}${item.source === 'folder' ? 'Folder' : 'Registry'}</span>
      </div>
      <span class="su-state ${item.enabled ? 'on' : ''}">${item.enabled ? 'Enabled' : 'Disabled'}</span>
      ${switchHtml(item.enabled, `data-toggle ${lock ? 'disabled data-tip="Needs administrator rights"' : ''}`)}
    </div>`;
}

export default {
  id: 'startup',
  mount(root) {
    let query = '';
    let filter = 'all';

    root.innerHTML = `
      <div class="page-head">
        <div class="titles">
          <div class="eyebrow">${icon('power')}Optimize</div>
          <h1>Startup Apps</h1>
          <p>Choose what launches when you sign in. Disabling is non-destructive — it works exactly like Task Manager.</p>
        </div>
        <div class="actions"><button class="btn btn-secondary" id="su-refresh">${icon('refresh-cw')}Refresh</button></div>
      </div>

      <div class="grid-12 su-stats">
        <div class="card stat span-4 spot"><div class="icon-tile accent">${icon('zap')}</div><div><div class="stat-v mono" id="st-on">–</div><div class="stat-k">Enabled at sign-in</div></div></div>
        <div class="card stat span-4 spot"><div class="icon-tile">${icon('moon')}</div><div><div class="stat-v mono" id="st-off">–</div><div class="stat-k">Disabled</div></div></div>
        <div class="card stat span-4 spot"><div class="icon-tile">${icon('timer')}</div><div><div class="stat-v mono" id="st-impact">–</div><div class="stat-k">Estimated boot impact</div></div></div>
      </div>

      <div class="tw-filters" style="margin-top:22px">
        <label class="input grow" style="max-width:380px">${icon('search')}<input id="su-search" placeholder="Search startup apps…" spellcheck="false"/></label>
        <div class="row chips">
          <button class="chip active" data-f="all">All</button>
          <button class="chip" data-f="on">Enabled</button>
          <button class="chip" data-f="off">Disabled</button>
        </div>
      </div>

      <section class="card su-list" id="su-list"></section>`;

    const list = $('#su-list', root);

    const render = () => {
      const items = state.startup;
      if (!items) {
        list.innerHTML = Array.from({ length: 6 }, () => `<div class="su-row"><div class="skeleton" style="width:44px;height:44px;border-radius:13px"></div><div class="grow"><div class="skeleton" style="height:14px;width:30%"></div><div class="skeleton" style="height:11px;width:18%;margin-top:8px"></div></div></div>`).join('');
        return;
      }
      const on = items.filter((s) => s.enabled).length;
      countTo($('#st-on', root), on);
      countTo($('#st-off', root), items.length - on);
      const impact = on <= 4 ? 'Low' : on <= 8 ? 'Medium' : 'High';
      $('#st-impact', root).textContent = impact;
      $('#st-impact', root).className = `stat-v mono impact-${impact.toLowerCase()}`;

      const shown = items.filter((s) => {
        if (filter === 'on' && !s.enabled) return false;
        if (filter === 'off' && s.enabled) return false;
        return !query || fuzzy(query, `${s.name} ${s.publisher || ''} ${s.command}`);
      });
      list.innerHTML = shown.length
        ? `<div class="stagger">${shown.map(rowHtml).join('')}</div>`
        : `<div class="empty"><div class="icon-tile">${icon('power-off')}</div><h3>${items.length ? 'Nothing matches' : 'No startup apps'}</h3><p>${items.length ? 'Try another search or filter.' : 'Nothing is set to launch when you sign in. Lovely.'}</p></div>`;
    };

    render();
    if (!state.startup) loadStartup();

    $('#su-search', root).addEventListener('input', (e) => {
      query = e.target.value;
      render();
    });

    root.addEventListener('click', async (e) => {
      if (e.target.closest('#su-refresh')) {
        state.startup = null;
        render();
        return loadStartup();
      }
      const f = e.target.closest('[data-f]');
      if (f) {
        filter = f.dataset.f;
        root.querySelectorAll('[data-f]').forEach((c) => c.classList.toggle('active', c === f));
        return render();
      }
      const sw = e.target.closest('[data-toggle]');
      if (!sw || sw.disabled) return;
      const row = sw.closest('[data-key]');
      const item = state.startup.find((s) => s.key === row.dataset.key);
      const next = !item.enabled;
      sw.classList.toggle('on', next);
      try {
        await api.startup.set(item, next);
        item.enabled = next;
        logActivity('startup', `${next ? 'Enabled' : 'Disabled'} ${item.name} at startup`, item.publisher || '');
        toast({ type: 'success', title: `${item.name} ${next ? 'enabled' : 'disabled'}`, message: next ? 'It will launch at your next sign-in.' : 'It will no longer launch when you sign in.', duration: 3000 });
        emit('startup', state.startup);
      } catch (err) {
        sw.classList.toggle('on', !next);
        toast({ type: 'error', title: `Could not change ${item.name}`, message: err.message });
      }
    });

    const off = on('startup', render);
    return off;
  },
};
