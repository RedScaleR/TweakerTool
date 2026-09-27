import { TWEAKS } from '../../../shared/tweaks.js';
import { commitChanges, isApplied } from '../actions.js';
import { icon } from '../icons.js';
import { clearActivity, on, state } from '../state.js';
import { confirmDialog, toast } from '../ui.js';
import { esc, timeAgo } from '../util.js';

const TYPE = {
  'tweak-apply': { icon: 'sliders-horizontal', label: 'Tweaks' },
  'tweak-revert': { icon: 'undo-2', label: 'Tweaks' },
  clean: { icon: 'brush-cleaning', label: 'Cleaner' },
  startup: { icon: 'power', label: 'Startup' },
  install: { icon: 'download', label: 'Apps' },
  uninstall: { icon: 'trash-2', label: 'Apps' },
  debloat: { icon: 'package-x', label: 'Debloat' },
  tool: { icon: 'wrench', label: 'Toolbox' },
  dns: { icon: 'earth', label: 'Network' },
};

function dayLabel(ts) {
  const d = new Date(ts);
  const today = new Date();
  const y = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

export default {
  id: 'history',
  mount(root) {
    const render = () => {
      const byDay = new Map();
      for (const a of state.activity) {
        const k = dayLabel(a.at);
        if (!byDay.has(k)) byDay.set(k, []);
        byDay.get(k).push(a);
      }
      const reversible = TWEAKS.filter((t) => isApplied(t.id) && state.tweaks[t.id]?.backup);
      root.innerHTML = `
        <div class="page-head">
          <div class="titles">
            <div class="eyebrow">${icon('history')}System</div>
            <h1>History</h1>
            <p>Everything TweakerTool has changed on this PC, newest first.</p>
          </div>
          <div class="actions">
            <button class="btn btn-secondary" id="h-clear" ${state.activity.length ? '' : 'disabled'}>${icon('eraser')}Clear log</button>
            <button class="btn btn-danger" id="h-revert" ${reversible.length ? '' : 'disabled'}>${icon('undo-2')}Revert all tweaks${reversible.length ? ` (${reversible.length})` : ''}</button>
          </div>
        </div>
        ${state.activity.length
          ? [...byDay.entries()]
              .map(
                ([day, items]) => `
            <div class="section-title">${icon('calendar')}${esc(day)}<span class="line"></span></div>
            <div class="timeline stagger">
              ${items
                .map((a, i) => {
                  const t = TYPE[a.type] || { icon: 'circle', label: '' };
                  return `
                  <div class="tl-item ${a.ok ? '' : 'fail'}" style="--i:${Math.min(i, 12)}">
                    <div class="tl-dot">${icon(a.ok ? t.icon : 'circle-x', 'i-sm')}</div>
                    <div class="card tl-card">
                      <div class="row"><b>${esc(a.title)}</b><span class="badge outline">${t.label}</span><span class="grow"></span><span class="dim mono tl-time" title="${new Date(a.at).toLocaleString()}">${timeAgo(a.at)}</span></div>
                      ${a.detail ? `<div class="tl-detail">${esc(a.detail)}</div>` : ''}
                    </div>
                  </div>`;
                })
                .join('')}
            </div>`,
              )
              .join('')
          : `<div class="card"><div class="empty"><div class="icon-tile accent">${icon('history')}</div><h3>No activity yet</h3><p>Apply a tweak, clean some junk or install an app — it will show up here.</p><a class="btn btn-primary" style="margin-top:18px" href="#/tweaks">${icon('sliders-horizontal')}Browse tweaks</a></div></div>`}`;

      root.querySelector('#h-clear')?.addEventListener('click', async () => {
        if (await confirmDialog({ title: 'Clear the activity log?', message: 'This only clears the list. Your tweaks stay applied and can still be reverted.', confirm: 'Clear log', iconName: 'eraser' })) {
          clearActivity();
          toast({ type: 'info', title: 'Activity log cleared' });
        }
      });
      root.querySelector('#h-revert')?.addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: `Revert ${reversible.length} tweak${reversible.length > 1 ? 's' : ''}?`,
          message: 'Every tweak TweakerTool applied will be restored to the exact value it had before.',
          confirm: 'Revert all',
          danger: true,
          iconName: 'undo-2',
        });
        if (ok) commitChanges(reversible.map((t) => [t.id, false]));
      });
    };
    render();
    const offs = [on('activity', render), on('tweaks', render)];
    return () => offs.forEach((off) => off());
  },
};
