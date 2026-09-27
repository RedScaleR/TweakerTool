import { DNS_PROVIDERS, LAUNCHERS, TOOL_GROUPS, TOOL_MAP, TOOLS } from '../../../shared/tools.js';
import { api } from '../api.js';
import { icon } from '../icons.js';
import { flagRestart, logActivity, state } from '../state.js';
import { modal, toast, withLoading } from '../ui.js';
import { $, esc } from '../util.js';

let dns = null;

function toolCard(t, i) {
  const lock = t.admin && !state.admin;
  return `
    <div class="card tool spot" style="--i:${i}">
      <div class="row" style="align-items:flex-start">
        <div class="icon-tile accent">${icon(t.icon)}</div>
        <span class="grow"></span>
        ${t.kind === 'stream' ? `<span class="badge outline">${icon('clock')}${t.duration}</span>` : ''}
        ${lock ? `<span class="badge outline">${icon('lock')}Admin</span>` : ''}
      </div>
      <h3>${esc(t.title)}</h3>
      <p>${esc(t.description)}</p>
      <button class="btn btn-secondary btn-sm" data-tool="${t.id}" ${lock ? 'disabled' : ''}>${icon(t.kind === 'stream' ? 'terminal' : 'play')}${t.kind === 'stream' ? 'Open console' : 'Run'}</button>
    </div>`;
}

function dnsHtml() {
  const current = dns?.provider;
  const adapter = dns?.adapters?.[0];
  return `
    <div class="card-head">
      <div class="icon-tile accent">${icon('earth')}</div>
      <div><h3>DNS switcher</h3><div class="sub">${adapter ? `${esc(adapter.name)} · ${esc(adapter.description)} · ${esc((adapter.servers || []).join(', ') || 'DHCP')}` : dns ? 'No active network adapter' : 'Reading adapters…'}</div></div>
    </div>
    <div class="dns-grid">
      ${DNS_PROVIDERS.map(
        (p) => `
        <button class="dns-opt ${current === p.id ? 'active' : ''}" data-dns="${p.id}" ${!dns || !state.admin ? 'disabled' : ''}>
          <div class="row"><b>${esc(p.name)}</b>${current === p.id ? `<span class="badge accent">${icon('check')}Active</span>` : ''}</div>
          <small>${esc(p.note)}</small>
          <span class="mono dns-ip">${p.servers.length ? esc(p.servers.join(' · ')) : 'From router'}</span>
        </button>`,
      ).join('')}
    </div>`;
}

function openConsole(tool) {
  modal({
    title: tool.title,
    subtitle: `${tool.description} Usually takes ${tool.duration}.`,
    iconName: tool.icon,
    wide: true,
    render(body, m) {
      body.innerHTML = `
        <div class="row" style="margin-bottom:12px"><span class="mono dim" id="cs-pct" style="font-size:12px;width:46px">0%</span><div class="bar grow"><span id="cs-bar" style="--v:0%"></span></div></div>
        <div class="console" id="cs-out"><div class="ln sys">› Ready. Press Start to run ${esc(tool.title)}.</div></div>`;
      m.foot.innerHTML = `<div class="left">You can keep using TweakerTool while this runs.</div><button class="btn btn-ghost" id="cs-close">Close</button><button class="btn btn-primary" id="cs-start">${icon('play')}Start</button>`;
      const out = $('#cs-out', body);
      const add = (text, cls = '') => {
        out.querySelector('.caret')?.remove();
        const ln = document.createElement('div');
        ln.className = `ln ${cls}`;
        ln.textContent = text;
        out.append(ln);
        out.scrollTop = out.scrollHeight;
      };
      let running = false;
      let off = null;
      $('#cs-close', m.foot).onclick = () => {
        if (running) api.tools.cancel(tool.id);
        m.close();
      };
      $('#cs-start', m.foot).onclick = async (e) => {
        const btn = e.currentTarget;
        if (running) {
          api.tools.cancel(tool.id);
          return;
        }
        running = true;
        btn.innerHTML = `${icon('square', 'i-sm')}Cancel`;
        btn.className = 'btn btn-secondary';
        add(`› ${tool.title} started ${new Date().toLocaleTimeString()}`, 'sys');
        out.insertAdjacentHTML('beforeend', '<span class="caret"></span>');
        off = api.tools.onEvent((ev) => {
          if (ev.id !== tool.id) return;
          if (ev.type === 'line') add(ev.line, /(fail|error|corrupt|cannot)/i.test(ev.line) ? 'bad' : /(success|did not find|no problems|completed)/i.test(ev.line) ? 'ok' : '');
          if (ev.type === 'progress') {
            $('#cs-bar', body).style.setProperty('--v', `${ev.pct}%`);
            $('#cs-pct', body).textContent = `${Math.floor(ev.pct)}%`;
          }
        });
        try {
          const r = await api.tools.stream(tool.id);
          add(r.ok ? '› Finished successfully.' : `› Finished with exit code ${r.code}.`, r.ok ? 'ok' : 'bad');
          if (r.ok) {
            $('#cs-bar', body).style.setProperty('--v', '100%');
            $('#cs-pct', body).textContent = '100%';
          }
          logActivity('tool', tool.title, r.ok ? 'Completed' : `Exit code ${r.code}`, r.ok);
        } catch (err) {
          add(`› ${err.message}`, 'bad');
        } finally {
          off?.();
          running = false;
          btn.innerHTML = `${icon('rotate-ccw')}Run again`;
          btn.className = 'btn btn-primary';
        }
      };
    },
  });
}

async function runTool(tool, btn) {
  if (tool.kind === 'stream') return openConsole(tool);
  await withLoading(btn, async () => {
    try {
      const r = await api.tools.run(tool.id);
      if (r?.ok === false) throw new Error(r.error);
      if (tool.reboot) flagRestart('reboot');
      toast({ type: 'success', title: tool.title, message: r?.message || 'Done.' });
      logActivity('tool', tool.title, r?.message || '');
    } catch (err) {
      toast({ type: 'error', title: `${tool.title} failed`, message: err.message });
      logActivity('tool', tool.title, err.message, false);
    }
  });
}

export default {
  id: 'toolbox',
  mount(root, params) {
    root.innerHTML = `
      <div class="page-head">
        <div class="titles">
          <div class="eyebrow">${icon('wrench')}System</div>
          <h1>Toolbox</h1>
          <p>Repair, maintain and troubleshoot Windows with one click.</p>
        </div>
      </div>
      ${TOOL_GROUPS.map(
        (g) => `
        <div class="section-title">${icon(g.icon)}${g.name}<span class="line"></span></div>
        <div class="tool-grid stagger">
          ${TOOLS.filter((t) => t.group === g.id).map(toolCard).join('')}
          ${g.id === 'network' ? `<section class="card dns-card" id="dns-card">${dnsHtml()}</section>` : ''}
        </div>`,
      ).join('')}
      <div class="section-title">${icon('app-window')}Windows tools<span class="line"></span></div>
      <div class="launch-grid stagger">
        ${LAUNCHERS.map((l, i) => `<button class="launch spot" data-launch="${l.id}" style="--i:${i}"><div class="icon-tile sm">${icon(l.icon)}</div><span>${esc(l.name)}</span>${icon('arrow-up-right', 'i-sm')}</button>`).join('')}
      </div>`;

    const loadDns = async () => {
      try {
        dns = await api.tools.getDns();
      } catch {
        dns = { adapters: [], provider: null };
      }
      const card = $('#dns-card', root);
      if (card) card.innerHTML = dnsHtml();
    };
    loadDns();

    root.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-tool]');
      if (b) return runTool(TOOL_MAP.get(b.dataset.tool), b);
      const l = e.target.closest('[data-launch]');
      if (l) {
        try {
          await api.tools.launch(l.dataset.launch);
        } catch (err) {
          toast({ type: 'error', title: 'Could not open tool', message: err.message });
        }
        return;
      }
      const d = e.target.closest('[data-dns]');
      if (d && d.dataset.dns !== dns?.provider) {
        await withLoading(d, async () => {
          try {
            dns = await api.tools.setDns(d.dataset.dns);
            const p = DNS_PROVIDERS.find((x) => x.id === d.dataset.dns);
            toast({ type: 'success', title: `DNS set to ${p.name}`, message: p.servers.length ? p.servers.join(', ') : 'Using your router again.' });
            logActivity('dns', `Switched DNS to ${p.name}`, p.servers.join(', '));
          } catch (err) {
            toast({ type: 'error', title: 'Could not change DNS', message: err.message });
          }
        });
        $('#dns-card', root).innerHTML = dnsHtml();
      }
    });

    if (params.run && TOOL_MAP.has(params.run)) {
      const tool = TOOL_MAP.get(params.run);
      setTimeout(() => {
        const btn = root.querySelector(`[data-tool="${tool.id}"]`);
        btn?.closest('.tool')?.classList.add('flash');
        btn?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        if (tool.kind === 'stream') openConsole(tool);
      }, 200);
    }
  },
};
