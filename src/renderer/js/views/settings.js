import { TWEAKS, TWEAK_MAP } from '../../../shared/tweaks.js';
import { isApplied, stagePending } from '../actions.js';
import { api, isDemo } from '../api.js';
import { icon, logo } from '../icons.js';
import { resetSettings, setSetting, state } from '../state.js';
import { switchHtml, toast } from '../ui.js';
import { esc } from '../util.js';

const ACCENTS = [
  { id: 'crimson', name: 'Crimson', a: '#ff3159', b: '#ff7a3d' },
  { id: 'violet', name: 'Violet', a: '#8b5cf6', b: '#e052f0' },
  { id: 'ocean', name: 'Ocean', a: '#0ea5e9', b: '#22d3ee' },
  { id: 'emerald', name: 'Emerald', a: '#10b981', b: '#a3e635' },
  { id: 'sunset', name: 'Sunset', a: '#f97316', b: '#facc15' },
  { id: 'sakura', name: 'Sakura', a: '#f472b6', b: '#a78bfa' },
];

const TOGGLES = [
  { group: 'Appearance', key: 'ambient', title: 'Animated background', desc: 'Slowly drifting colour glow behind the interface.' },
  { group: 'Appearance', key: 'glass', title: 'Glass effects', desc: 'Frosted blur on panels. Turn off on very old GPUs.' },
  { group: 'Appearance', key: 'reduceMotion', title: 'Reduce motion', desc: 'Minimise animations and transitions.' },
  { group: 'Safety', key: 'restorePoint', title: 'Restore point before applying', desc: 'Create a System Restore checkpoint before tweaks are applied.' },
  { group: 'Safety', key: 'confirmAdvanced', title: 'Confirm advanced tweaks', desc: 'Ask before applying tweaks marked Advanced.' },
];

function toggleRow(t) {
  return `
    <div class="set-row">
      <div class="grow"><b>${t.title}</b><small>${t.desc}</small></div>
      ${switchHtml(Boolean(state.settings[t.key]), `data-set="${t.key}"`)}
    </div>`;
}

export default {
  id: 'settings',
  mount(root) {
    const render = () => {
      root.innerHTML = `
        <div class="page-head">
          <div class="titles">
            <div class="eyebrow">${icon('settings')}System</div>
            <h1>Settings</h1>
            <p>Make TweakerTool yours.</p>
          </div>
        </div>
        <div class="grid-12 stagger">
          <section class="card span-7" style="--i:0">
            <div class="card-head">${icon('palette')}<h3>Accent colour</h3></div>
            <div class="swatches">
              ${ACCENTS.map(
                (a) => `
                <button class="swatch ${state.settings.accent === a.id ? 'active' : ''}" data-accent="${a.id}" style="--a:${a.a};--b:${a.b}">
                  <span class="sw-dot"></span><span>${a.name}</span>
                </button>`,
              ).join('')}
            </div>
            <div class="divider"></div>
            ${TOGGLES.filter((t) => t.group === 'Appearance').map(toggleRow).join('')}
          </section>

          <section class="card span-5 about" style="--i:1">
            <div class="about-logo">${logo()}</div>
            <h2>Tweaker<span class="grad-text">Tool</span></h2>
            <p class="dim mono">Version ${esc(api.version || '1.0.0')}${isDemo ? ' · demo mode' : ''}</p>
            <p class="muted" style="margin-top:12px;font-size:13px">An all-in-one Windows optimizer: ${TWEAKS.length} reversible tweaks, a junk cleaner, startup manager, app installer, debloater and repair toolbox.</p>
            <div class="row" style="justify-content:center;margin-top:18px">
              <button class="btn btn-secondary btn-sm" data-link="https://github.com/RedScaleR/TweakerTool">${icon('code-xml')}Source on GitHub</button>
              <button class="btn btn-ghost btn-sm" data-link="https://github.com/RedScaleR/TweakerTool/issues">${icon('bug')}Report an issue</button>
            </div>
            <p class="dim" style="font-size:11.5px;margin-top:18px">Made by RedScaleR · Geist font (OFL) · Lucide icons (ISC)</p>
          </section>

          <section class="card span-7" style="--i:2">
            <div class="card-head">${icon('shield-check')}<h3>Safety</h3></div>
            ${TOGGLES.filter((t) => t.group === 'Safety').map(toggleRow).join('')}
          </section>

          <section class="card span-5" style="--i:3">
            <div class="card-head">${icon('file-json')}<h3>Profiles</h3></div>
            <p class="muted" style="font-size:13px;margin-bottom:16px">Save your active tweaks to a file and load them on another PC.</p>
            <div class="row">
              <button class="btn btn-secondary" data-act="export">${icon('upload')}Export profile</button>
              <button class="btn btn-secondary" data-act="import">${icon('download')}Import profile</button>
            </div>
            <div class="divider"></div>
            <button class="btn btn-ghost btn-sm" data-act="reset">${icon('rotate-ccw')}Reset app settings</button>
          </section>
        </div>`;
    };
    render();

    root.addEventListener('click', async (e) => {
      const acc = e.target.closest('[data-accent]');
      if (acc) {
        setSetting('accent', acc.dataset.accent);
        root.querySelectorAll('[data-accent]').forEach((b) => b.classList.toggle('active', b === acc));
        return;
      }
      const sw = e.target.closest('[data-set]');
      if (sw) {
        const key = sw.dataset.set;
        setSetting(key, !state.settings[key]);
        sw.classList.toggle('on', state.settings[key]);
        return;
      }
      const link = e.target.closest('[data-link]');
      if (link) return api.shell.openExternal(link.dataset.link);
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'export') {
        const tweaks = TWEAKS.filter((t) => isApplied(t.id)).map((t) => t.id);
        const saved = await api.profile.save({ app: 'TweakerTool', version: 1, exportedAt: new Date().toISOString(), tweaks });
        if (saved) toast({ type: 'success', title: 'Profile exported', message: `${tweaks.length} active tweaks saved.` });
      }
      if (act === 'import') {
        const data = await api.profile.open();
        if (!data) return;
        const ids = Array.isArray(data.tweaks) ? data.tweaks.filter((id) => TWEAK_MAP.has(id)) : [];
        if (!ids.length) return toast({ type: 'error', title: 'Not a TweakerTool profile', message: 'No known tweaks were found in that file.' });
        stagePending(ids, true);
        toast({ type: 'info', title: `Staged ${ids.length} tweaks from profile`, message: 'Review them on the Tweaks page and press Apply.', actions: [{ label: 'Review now', onClick: () => (location.hash = '#/tweaks') }] });
      }
      if (act === 'reset') {
        resetSettings();
        render();
        toast({ type: 'info', title: 'Settings reset to defaults' });
      }
    });
  },
};
