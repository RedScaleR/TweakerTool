// Ctrl+K command palette: jump to pages, find tweaks, run tools.

import { APPS } from '../../shared/apps.js';
import { LAUNCHERS, TOOLS } from '../../shared/tools.js';
import { CATEGORIES, TWEAKS } from '../../shared/tweaks.js';
import { desired, isAvailable, openPresets } from './actions.js';
import { api } from './api.js';
import { icon } from './icons.js';
import { toast } from './ui.js';
import { $, el, esc, fuzzy } from './util.js';

let open = false;

function entries(views) {
  const cat = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
  return [
    ...views.map((v, i) => ({
      group: 'Pages',
      icon: v.icon,
      title: v.label,
      sub: `Go to ${v.label}`,
      hint: i < 9 ? `Ctrl ${i + 1}` : '',
      run: () => (location.hash = `#/${v.id}`),
    })),
    {
      group: 'Actions',
      icon: 'wand-sparkles',
      title: 'Optimization presets',
      sub: 'Recommended, Gaming, Privacy Shield, Clean Desktop',
      run: () => openPresets(),
    },
    ...TWEAKS.map((t) => ({
      group: 'Tweaks',
      icon: t.icon,
      hue: cat[t.category].hue,
      title: t.title,
      sub: `${cat[t.category].name} · ${isAvailable(t.id) ? (desired(t.id) ? 'On' : 'Off') : 'Unavailable'}`,
      keywords: `${t.description} ${(t.tags || []).join(' ')}`,
      run: () => (location.hash = `#/tweaks?focus=${t.id}`),
    })),
    ...TOOLS.map((t) => ({
      group: 'Toolbox',
      icon: t.icon,
      title: t.title,
      sub: t.description,
      run: () => (location.hash = `#/toolbox?run=${t.id}`),
    })),
    ...LAUNCHERS.map((l) => ({
      group: 'Windows tools',
      icon: l.icon,
      title: `Open ${l.name}`,
      sub: l.command,
      run: async () => {
        try {
          await api.tools.launch(l.id);
        } catch (err) {
          toast({ type: 'error', title: `Could not open ${l.name}`, message: err.message });
        }
      },
    })),
    ...APPS.map((a) => ({
      group: 'Apps',
      icon: 'package-plus',
      title: `Install ${a.name}`,
      sub: a.description,
      run: () => (location.hash = `#/apps?select=${encodeURIComponent(a.id)}`),
    })),
  ];
}

export function openPalette(views) {
  if (open) return;
  open = true;
  const all = entries(views);
  const root = el(`
    <div class="palette-backdrop">
      <div class="palette" role="dialog" aria-label="Command palette">
        <div class="palette-input">${icon('search')}<input placeholder="Search tweaks, tools, apps and pages…" spellcheck="false"/><span class="kbd">Esc</span></div>
        <div class="palette-results"></div>
        <div class="palette-foot">
          <span><span class="kbd">↑</span><span class="kbd">↓</span> navigate</span>
          <span><span class="kbd">Enter</span> open</span>
          <span style="margin-left:auto">${all.length} commands</span>
        </div>
      </div>
    </div>`);
  const input = $('input', root);
  const results = $('.palette-results', root);
  let list = [];
  let sel = 0;

  const draw = () => {
    const q = input.value;
    list = all
      .map((e) => ({ e, s: Math.max(fuzzy(q, e.title) * 2, fuzzy(q, `${e.sub} ${e.keywords || ''}`)) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => (q ? b.s - a.s : 0))
      .slice(0, q ? 40 : 14)
      .map((x) => x.e);
    sel = Math.min(sel, Math.max(0, list.length - 1));
    if (!list.length) {
      results.innerHTML = `<div class="palette-empty">No matches for “${esc(q)}”</div>`;
      return;
    }
    let lastGroup = '';
    results.innerHTML = list
      .map((e, i) => {
        const head = e.group !== lastGroup ? `<div class="palette-group">${e.group}</div>` : '';
        lastGroup = e.group;
        return `${head}<button class="palette-item ${i === sel ? 'sel' : ''}" data-i="${i}">
          <div class="icon-tile ${e.hue != null ? 'hue' : ''}" ${e.hue != null ? `style="--h:${e.hue}"` : ''}>${icon(e.icon)}</div>
          <div class="t"><b>${esc(e.title)}</b><small>${esc(e.sub || '')}</small></div>
          ${e.hint ? `<span class="kbd">${e.hint}</span>` : `<span class="enter">${icon('corner-down-left', 'i-sm')}</span>`}
        </button>`;
      })
      .join('');
    results.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
  };

  const close = () => {
    open = false;
    root.remove();
  };
  const choose = (i) => {
    const e = list[i];
    if (!e) return;
    close();
    e.run();
  };

  input.addEventListener('input', () => {
    sel = 0;
    draw();
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowDown') {
      sel = Math.min(list.length - 1, sel + 1);
      draw();
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      sel = Math.max(0, sel - 1);
      draw();
      e.preventDefault();
    } else if (e.key === 'Enter') choose(sel);
  });
  results.addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (b) choose(Number(b.dataset.i));
  });
  results.addEventListener('mousemove', (e) => {
    const b = e.target.closest('[data-i]');
    if (b && Number(b.dataset.i) !== sel) {
      results.querySelector('.sel')?.classList.remove('sel');
      sel = Number(b.dataset.i);
      b.classList.add('sel');
    }
  });
  root.addEventListener('mousedown', (e) => {
    if (e.target === root) close();
  });

  document.body.append(root);
  draw();
  input.focus();
}
