// Cross-view workflows: tweak loading/applying, presets, health score.

import { PRESETS, RESTART, TWEAKS, TWEAK_MAP } from '../../shared/tweaks.js';
import { api } from './api.js';
import { icon } from './icons.js';
import { emit, flagRestart, logActivity, state } from './state.js';
import { confirmDialog, modal, toast } from './ui.js';
import { $, esc, sleep } from './util.js';

/* ─────────────── Tweaks ─────────────── */

export async function loadTweaks() {
  try {
    state.tweaks = await api.tweaks.status();
  } catch (err) {
    toast({ type: 'error', title: 'Could not read tweak status', message: err.message });
  }
  state.tweaksLoaded = true;
  emit('tweaks', state.tweaks);
}

export const isApplied = (id) => state.tweaks[id]?.state === 'applied';
export const isAvailable = (id) => state.tweaks[id] && state.tweaks[id].state !== 'unavailable';

/** Desired on/off state taking pending changes into account. */
export const desired = (id) => (state.pending.has(id) ? state.pending.get(id) : isApplied(id));

export function togglePending(id, on) {
  if (!isAvailable(id)) return;
  if (on === isApplied(id)) state.pending.delete(id);
  else state.pending.set(id, on);
  emit('pending', state.pending);
}

export function stagePending(ids, on = true) {
  for (const id of ids) {
    if (!isAvailable(id)) continue;
    if (on === isApplied(id)) state.pending.delete(id);
    else state.pending.set(id, on);
  }
  emit('pending', state.pending);
}

export function discardPending() {
  state.pending.clear();
  emit('pending', state.pending);
}

export function appliedCount() {
  return TWEAKS.filter((t) => isApplied(t.id)).length;
}

/** Apply and/or revert, with confirmations, restore point and live progress. */
export async function commitChanges(changes = [...state.pending.entries()]) {
  if (!changes.length) return;
  const toApply = changes.filter(([, on]) => on).map(([id]) => id);
  const toRevert = changes.filter(([, on]) => !on).map(([id]) => id);

  const advanced = toApply.map((id) => TWEAK_MAP.get(id)).filter((t) => t.risk === 'advanced');
  if (advanced.length && state.settings.confirmAdvanced) {
    const ok = await confirmDialog({
      title: 'Apply advanced tweaks?',
      message: `${advanced.map((t) => `<b style="color:var(--text)">${esc(t.title)}</b>`).join(', ')} ${advanced.length === 1 ? 'is' : 'are'} meant for enthusiasts and can change system behaviour noticeably. Everything stays reversible from TweakerTool.`,
      confirm: 'Apply anyway',
    });
    if (!ok) return;
  }

  const rows = changes.map(([id, on]) => ({ id, on, t: TWEAK_MAP.get(id) }));

  modal({
    title: `Applying ${changes.length} change${changes.length > 1 ? 's' : ''}`,
    subtitle: 'Hang tight — this usually takes a few seconds.',
    iconName: 'sparkles',
    render(body, m) {
      m.lock();
      body.innerHTML = `
        <div class="bar" style="margin-bottom:16px"><span id="cm-bar" style="--v:4%"></span></div>
        <div class="op-list">
          ${state.settings.restorePoint && toApply.length ? `<div class="op-row wait" data-row="__rp"><div class="state-icon"><span class="spinner"></span></div><div class="name">Creating a restore point</div><span class="badge outline">Safety</span></div>` : ''}
          ${rows
            .map(
              (r) => `
            <div class="op-row wait" data-row="${r.id}">
              <div class="state-icon">${icon('circle-dashed')}</div>
              <div class="name">${esc(r.t.title)}<div class="err"></div></div>
              <span class="badge ${r.on ? 'accent' : 'outline'}">${r.on ? 'Enable' : 'Revert'}</span>
            </div>`,
            )
            .join('')}
        </div>
        <div id="cm-after" style="margin-top:16px"></div>`;
      m.foot.innerHTML = `<div class="left" id="cm-status">Working…</div><button class="btn btn-primary" id="cm-done" disabled>Done</button>`;
      $('#cm-done', m.foot).onclick = () => m.close();
      run(body, m);
    },
  });

  async function run(body, m) {
    const setRow = (id, cls, err) => {
      const row = body.querySelector(`[data-row="${CSS.escape(id)}"]`);
      if (!row) return;
      row.className = `op-row ${cls}`;
      row.querySelector('.state-icon').innerHTML =
        cls === 'ok' ? icon('circle-check') : cls === 'fail' ? icon('circle-x') : cls === 'busy' ? '<span class="spinner"></span>' : icon('circle-dashed');
      if (err) row.querySelector('.err').textContent = err;
    };
    const bar = body.querySelector('#cm-bar');
    const setBar = (v) => bar.style.setProperty('--v', `${v}%`);

    if (state.settings.restorePoint && toApply.length) {
      try {
        const r = await api.tools.restorePoint('TweakerTool — before applying tweaks');
        setRow('__rp', r?.ok === false ? 'fail' : 'ok', r?.ok === false ? `Skipped: ${r.error}` : '');
      } catch (err) {
        setRow('__rp', 'fail', `Skipped: ${err.message}`);
      }
    }
    setBar(20);

    const results = {};
    const phases = [
      [toApply, (ids) => api.tweaks.apply(ids)],
      [toRevert, (ids) => api.tweaks.revert(ids)],
    ];
    let processed = 0;
    for (const [ids, call] of phases) {
      if (!ids.length) continue;
      ids.forEach((id) => setRow(id, 'busy'));
      try {
        const res = await call(ids);
        Object.assign(state.tweaks, res.states);
        for (const id of ids) {
          const r = res.results?.[id] || { ok: false, error: 'No result' };
          const want = toApply.includes(id);
          const now = state.tweaks[id]?.state === 'applied';
          if (r.ok && want !== now && want) r.note = 'Windows did not report the change yet — a restart may be needed.';
          results[id] = r;
          setRow(id, r.ok ? 'ok' : 'fail', r.ok ? r.note : r.error);
          await sleep(60);
        }
      } catch (err) {
        for (const id of ids) {
          results[id] = { ok: false, error: err.message };
          setRow(id, 'fail', err.message);
        }
      }
      processed += ids.length;
      setBar(20 + (processed / changes.length) * 80);
    }

    const okIds = Object.keys(results).filter((id) => results[id].ok);
    const failIds = Object.keys(results).filter((id) => !results[id].ok);
    for (const id of okIds) state.pending.delete(id);
    emit('pending', state.pending);
    emit('tweaks', state.tweaks);

    const restarts = new Set(okIds.map((id) => TWEAK_MAP.get(id).restart).filter(Boolean));
    restarts.forEach(flagRestart);

    const applied = okIds.filter((id) => toApply.includes(id));
    const reverted = okIds.filter((id) => toRevert.includes(id));
    if (applied.length) logActivity('tweak-apply', `Applied ${applied.length} tweak${applied.length > 1 ? 's' : ''}`, applied.map((id) => TWEAK_MAP.get(id).title).join(', '));
    if (reverted.length) logActivity('tweak-revert', `Reverted ${reverted.length} tweak${reverted.length > 1 ? 's' : ''}`, reverted.map((id) => TWEAK_MAP.get(id).title).join(', '));
    if (failIds.length) logActivity('tweak-apply', `${failIds.length} change${failIds.length > 1 ? 's' : ''} failed`, failIds.map((id) => TWEAK_MAP.get(id).title).join(', '), false);

    m.lock(false);
    m.setTitle(failIds.length ? 'Finished with issues' : 'All done', failIds.length ? `${okIds.length} succeeded, ${failIds.length} failed.` : `${okIds.length} change${okIds.length > 1 ? 's' : ''} applied successfully.`);
    const after = body.querySelector('#cm-after');
    if (restarts.size) {
      const labels = [...restarts].map((r) => RESTART[r]).join(', ');
      after.innerHTML = `
        <div class="notice warn">${icon('rotate-cw')}<div class="grow">Some changes take effect after: <b>${esc(labels)}</b>.
        ${restarts.has('explorer') && restarts.size === 1 ? '' : 'You can keep working and restart later.'}</div>
        ${restarts.has('explorer') ? `<button class="btn btn-secondary btn-sm" id="cm-explorer">${icon('rotate-cw')}Restart Explorer</button>` : ''}</div>`;
      const btn = after.querySelector('#cm-explorer');
      if (btn) btn.onclick = () => restartExplorer(btn);
    }
    m.foot.querySelector('#cm-status').textContent = failIds.length ? 'Failed changes stay pending so you can retry.' : 'Reversible any time from the Tweaks page.';
    const doneBtn = m.foot.querySelector('#cm-done');
    doneBtn.disabled = false;
    doneBtn.focus();
  }
}

export async function restartExplorer(btn) {
  btn?.classList.add('loading');
  try {
    const r = await api.tools.run('restart-explorer');
    state.restart.explorer = false;
    emit('restart', state.restart);
    toast({ type: 'success', title: 'Explorer restarted', message: r?.message || 'Taskbar and Explorer changes are now live.' });
  } catch (err) {
    toast({ type: 'error', title: 'Could not restart Explorer', message: err.message });
  } finally {
    btn?.classList.remove('loading');
  }
}

/* ─────────────── Presets ─────────────── */

export function openPresets() {
  let selected = PRESETS[0].id;
  modal({
    title: 'Optimization presets',
    subtitle: 'Pick a profile — you will review every change before it is applied.',
    iconName: 'wand-sparkles',
    wide: true,
    render(body, m) {
      const draw = () => {
        const preset = PRESETS.find((p) => p.id === selected);
        const list = preset.tweaks.filter((id) => TWEAK_MAP.has(id));
        const todo = list.filter((id) => isAvailable(id) && !isApplied(id));
        const active = list.filter((id) => isApplied(id));
        body.innerHTML = `
          <div class="preset-grid">
            ${PRESETS.map(
              (p) => `
              <button class="preset-card spot ${p.id === selected ? 'active' : ''}" data-p="${p.id}">
                <div class="icon-tile ${p.id === selected ? 'solid' : ''}">${icon(p.icon)}</div>
                <div class="p-name">${esc(p.name)}</div>
                <div class="p-desc">${esc(p.description)}</div>
                <div class="p-meta">${p.tweaks.length} tweaks</div>
              </button>`,
            ).join('')}
          </div>
          <div class="preset-detail">
            <div class="row" style="margin-bottom:10px">
              <b style="font-size:13px">${esc(preset.name)} includes</b>
              <span class="badge accent">${todo.length} to apply</span>
              <span class="badge safe">${active.length} already active</span>
            </div>
            <div class="preset-tags">
              ${list
                .map((id) => {
                  const t = TWEAK_MAP.get(id);
                  const on = isApplied(id);
                  return `<span class="preset-tag ${on ? 'on' : ''}">${icon(on ? 'check' : t.icon, 'i-sm')}${esc(t.title)}</span>`;
                })
                .join('')}
            </div>
          </div>`;
        m.foot.innerHTML = `
          <div class="left">${todo.length ? 'Changes are staged — nothing runs until you press Apply.' : 'Everything in this preset is already active. Nice.'}</div>
          <button class="btn btn-ghost" data-a="close">Cancel</button>
          <button class="btn btn-secondary" data-a="stage" ${todo.length ? '' : 'disabled'}>Review in Tweaks</button>
          <button class="btn btn-primary" data-a="apply" ${todo.length ? '' : 'disabled'}>${icon('zap')}Apply ${todo.length || ''}</button>`;
        m.foot.dataset.todo = JSON.stringify(todo);
      };
      body.onclick = (e) => {
        const p = e.target.closest('[data-p]')?.dataset.p;
        if (p) {
          selected = p;
          draw();
        }
      };
      m.foot.onclick = (e) => {
        const a = e.target.closest('[data-a]')?.dataset.a;
        if (!a) return;
        const todo = JSON.parse(m.foot.dataset.todo || '[]');
        if (a === 'close') return m.close();
        stagePending(todo, true);
        m.close();
        if (a === 'stage') location.hash = '#/tweaks';
        else commitChanges(todo.map((id) => [id, true]));
      };
      draw();
    },
  });
}

/* ─────────────── Health score ─────────────── */

export function healthScore() {
  const rec = TWEAKS.filter((t) => t.recommended && isAvailable(t.id));
  const recRatio = rec.length ? rec.filter((t) => isApplied(t.id)).length / rec.length : 0;
  const junkGb = state.junk ? state.junk.total / 1024 ** 3 : 2;
  const junkScore = Math.max(0, 1 - junkGb / 12);
  const startupOn = state.startup ? state.startup.filter((s) => s.enabled).length : 8;
  const startupScore = Math.max(0, 1 - Math.max(0, startupOn - 4) / 12);
  const score = 30 + recRatio * 42 + junkScore * 14 + startupScore * 14;
  return Math.round(Math.min(100, score));
}

export function healthLabel(score) {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Great';
  if (score >= 60) return 'Good';
  if (score >= 45) return 'Needs a tune-up';
  return 'Needs attention';
}
