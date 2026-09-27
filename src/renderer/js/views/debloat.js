import { BLOAT, BLOAT_GROUPS, BLOAT_MAP } from '../../../shared/apps.js';
import { api } from '../api.js';
import { icon } from '../icons.js';
import { logActivity, state } from '../state.js';
import { checkHtml, confirmDialog, modal, toast } from '../ui.js';
import { $, el, esc } from '../util.js';

let scan = null;
const selected = new Set();

export default {
  id: 'debloat',
  mount(root) {
    root.innerHTML = `
      <div class="page-head">
        <div class="titles">
          <div class="eyebrow">${icon('package-x')}Software</div>
          <h1>Debloat Windows</h1>
          <p>Remove the preinstalled apps and promotions you never asked for.</p>
        </div>
        <div class="actions">
          <button class="btn btn-secondary" id="db-rec">${icon('sparkles')}Select recommended</button>
          <button class="btn btn-secondary" id="db-scan">${icon('refresh-cw')}Rescan</button>
        </div>
      </div>
      <div class="notice" style="margin-bottom:20px">${icon('info')}<div>Removed apps can be reinstalled from the Microsoft Store at any time. ${state.admin ? 'Apps are removed for <b>all users</b> and from the image for new accounts.' : 'Without admin rights apps are removed for <b>your account only</b>.'}</div></div>
      <div id="db-body"></div>`;

    const body = $('#db-body', root);
    const bar = el(`
      <div class="action-bar">
        <span class="count-pill" id="db-count">0</span>
        <div><div class="label" id="db-label"></div><div class="detail">Reinstallable from the Microsoft Store</div></div>
        <span class="sep"></span>
        <button class="btn btn-ghost btn-sm" data-a="clear">Clear</button>
        <button class="btn btn-danger" data-a="remove">${icon('trash-2')}Remove</button>
      </div>`);
    document.body.append(bar);

    const installed = () => new Set((scan || []).filter((s) => s.installed).map((s) => s.id));

    const render = () => {
      if (!scan) {
        body.innerHTML = `<div class="grid-12">${Array.from({ length: 3 }, () => '<div class="card span-4"><div class="skeleton" style="height:18px;width:50%"></div><div class="skeleton" style="height:200px;margin-top:16px"></div></div>').join('')}</div>`;
        return;
      }
      const inst = installed();
      body.innerHTML = `<div class="bloat-groups">${BLOAT_GROUPS.map((g) => {
        const items = BLOAT.filter((b) => b.group === g.id && inst.has(b.id));
        return `
          <section class="card bloat-group">
            <div class="card-head"><div class="icon-tile sm">${icon(g.icon)}</div><h3>${g.name}</h3><span class="end sub">${items.length} found</span></div>
            ${items.length
              ? `<div class="bloat-list">${items
                  .map(
                    (b) => `
                <button class="bloat-row ${selected.has(b.id) ? 'sel' : ''}" data-b="${esc(b.id)}">
                  ${checkHtml(selected.has(b.id))}
                  <span class="grow">${esc(b.name)}</span>
                  ${b.recommended ? '<span class="badge safe">Safe</span>' : '<span class="badge outline">Optional</span>'}
                </button>`,
                  )
                  .join('')}</div>`
              : `<div class="empty" style="padding:28px 10px"><div class="icon-tile">${icon('circle-check')}</div><p>Nothing to remove here.</p></div>`}
          </section>`;
      }).join('')}</div>`;
      renderBar();
    };

    const renderBar = () => {
      const n = selected.size;
      bar.classList.toggle('show', n > 0);
      $('#db-count', bar).textContent = n;
      $('#db-label', bar).textContent = `${n} app${n === 1 ? '' : 's'} selected`;
    };

    const doScan = async () => {
      scan = null;
      render();
      try {
        scan = await api.apps.scanBloat();
        const inst = installed();
        [...selected].forEach((id) => !inst.has(id) && selected.delete(id));
      } catch (err) {
        scan = [];
        toast({ type: 'error', title: 'Scan failed', message: err.message });
      }
      if (root.isConnected) render();
    };

    render();
    if (!scan) doScan();

    root.addEventListener('click', (e) => {
      if (e.target.closest('#db-scan')) return doScan();
      if (e.target.closest('#db-rec')) {
        const inst = installed();
        BLOAT.filter((b) => b.recommended && inst.has(b.id)).forEach((b) => selected.add(b.id));
        return render();
      }
      const row = e.target.closest('[data-b]');
      if (!row) return;
      const id = row.dataset.b;
      if (selected.has(id)) selected.delete(id);
      else selected.add(id);
      render();
    });

    bar.addEventListener('click', async (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'clear') {
        selected.clear();
        return render();
      }
      if (a !== 'remove') return;
      const ids = [...selected];
      const ok = await confirmDialog({
        title: `Remove ${ids.length} app${ids.length > 1 ? 's' : ''}?`,
        message: `${ids.map((id) => esc(BLOAT_MAP.get(id).name)).join(', ')} will be uninstalled.`,
        confirm: 'Remove apps',
        danger: true,
        iconName: 'trash-2',
      });
      if (!ok) return;
      let results = {};
      await new Promise((resolve) => {
        modal({
          title: 'Removing apps',
          subtitle: 'This can take a minute for larger packages.',
          iconName: 'package-x',
          render(mbody, m) {
            m.lock();
            mbody.innerHTML = `<div class="bar indeterminate"><span></span></div><p class="dim" style="margin-top:14px;font-size:12.5px">Removing ${ids.length} package${ids.length > 1 ? 's' : ''}…</p>`;
            api.apps
              .removeBloat(ids)
              .then((r) => (results = r))
              .catch((err) => ids.forEach((id) => (results[id] = { ok: false, error: err.message })))
              .finally(() => {
                m.lock(false);
                m.close();
                resolve();
              });
          },
        });
      });
      const done = ids.filter((id) => results[id]?.ok);
      const failed = ids.filter((id) => !results[id]?.ok);
      done.forEach((id) => {
        selected.delete(id);
        const s = scan.find((x) => x.id === id);
        if (s) s.installed = false;
      });
      if (done.length) {
        logActivity('debloat', `Removed ${done.length} preinstalled app${done.length > 1 ? 's' : ''}`, done.map((id) => BLOAT_MAP.get(id).name).join(', '));
        toast({ type: 'success', title: `Removed ${done.length} app${done.length > 1 ? 's' : ''}`, message: 'Windows just got a little lighter.' });
      }
      if (failed.length) {
        toast({ type: 'error', title: `${failed.length} could not be removed`, message: results[failed[0]]?.error || 'Unknown error' });
      }
      render();
    });

    return () => {
      bar.classList.remove('show');
      setTimeout(() => bar.remove(), 400);
    };
  },
};
