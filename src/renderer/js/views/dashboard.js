import { CATEGORIES, TWEAKS } from '../../../shared/tweaks.js';
import { appliedCount, healthLabel, healthScore, isApplied, isAvailable, openPresets, restartExplorer } from '../actions.js';
import { api } from '../api.js';
import { icon } from '../icons.js';
import { logActivity, on, state } from '../state.js';
import { stats, onStats } from '../stats.js';
import { ringHtml, setRing, Sparkline, toast, withLoading } from '../ui.js';
import { $, countTo, esc, formatBytes, formatUptime, greeting } from '../util.js';

const GB = 1024 ** 3;

function cleanCpuName(name = '') {
  return name
    .replace(/\((R|TM)\)/gi, '')
    .replace(/\s+CPU\s+@.*$/i, '')
    .replace(/\s+\d+-Core Processor/i, '')
    .replace(/\s+Processor$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function heroTitle(score) {
  if (score >= 90) return 'Your PC is <span class="grad-text">fully tuned</span>.';
  if (score >= 75) return 'Your PC is running <span class="grad-text">great</span>.';
  if (score >= 60) return 'Your PC is in <span class="grad-text">good shape</span>.';
  return 'Let’s give your PC a <span class="grad-text">tune-up</span>.';
}

function hardwareCards(sys) {
  if (!sys) {
    return Array.from({ length: 4 }, () => `<div class="card hw span-3"><div class="skeleton" style="height:18px;width:40%"></div><div class="skeleton" style="height:22px;width:85%;margin-top:18px"></div><div class="skeleton" style="height:14px;width:60%;margin-top:12px"></div></div>`).join('');
  }
  const gpu = sys.gpus?.[0];
  const cards = [
    {
      k: 'Processor',
      icon: 'cpu',
      name: cleanCpuName(sys.cpu?.name),
      meta: [`${sys.cpu?.cores} cores`, `${sys.cpu?.threads} threads`, sys.cpu?.maxClock ? `${(sys.cpu.maxClock / 1000).toFixed(1)} GHz` : ''],
    },
    {
      k: 'Graphics',
      icon: 'microchip',
      name: gpu?.name || 'Unknown GPU',
      meta: [gpu?.vram ? `${Math.round(gpu.vram / GB)} GB VRAM` : '', gpu?.driver ? `Driver ${gpu.driver.split('.').slice(-2).join('.')}` : '', sys.gpus?.length > 1 ? `+${sys.gpus.length - 1} more` : ''],
    },
    {
      k: 'Memory',
      icon: 'memory-stick',
      name: `${Math.round(sys.memory.total / GB)} GB ${sys.memory.type || 'RAM'}`,
      meta: [sys.memory.speed ? `${sys.memory.speed} MT/s` : '', sys.memory.modules ? `${sys.memory.modules} module${sys.memory.modules > 1 ? 's' : ''}` : ''],
    },
    {
      k: 'System',
      icon: 'monitor',
      name: sys.board?.product || sys.board?.model || sys.computerName,
      meta: [sys.os?.name?.replace('Windows ', 'Win ') || '', sys.os?.displayVersion || '', sys.os?.arch || ''],
    },
  ];
  return cards
    .map(
      (c, i) => `
      <div class="card hw spot span-3" style="--i:${i}">
        <div class="hw-top"><div class="icon-tile accent">${icon(c.icon)}</div><span class="hw-k">${c.k}</span></div>
        <div class="hw-name" title="${esc(c.name)}">${esc(c.name)}</div>
        <div class="hw-meta">${c.meta.filter(Boolean).map((m) => `<span>${esc(m)}</span>`).join('')}</div>
      </div>`,
    )
    .join('');
}

function storageRows(sys) {
  if (!sys) return '<div class="skeleton" style="height:120px"></div>';
  return sys.volumes
    .map((v) => {
      const used = v.size - v.free;
      const pct = v.size ? (used / v.size) * 100 : 0;
      const cls = pct > 95 ? 'bad' : pct > 85 ? 'warn' : '';
      return `
        <div class="vol">
          <div class="vol-letter mono">${esc(v.letter.replace(':', ''))}</div>
          <div class="grow">
            <div class="row vol-top">
              <b>${esc(v.label || 'Local Disk')}</b>
              ${v.kind ? `<span class="badge outline">${esc(v.kind)}</span>` : ''}
              <span class="vol-free mono">${formatBytes(v.free, 0)} free</span>
            </div>
            <div class="bar ${cls}"><span style="--v:${pct.toFixed(1)}%"></span></div>
            <div class="vol-sub">${formatBytes(used, 0)} used of ${formatBytes(v.size, 0)}</div>
          </div>
        </div>`;
    })
    .join('');
}

function categoryRows() {
  return CATEGORIES.map((c) => {
    const list = TWEAKS.filter((t) => t.category === c.id && isAvailable(t.id));
    const on = list.filter((t) => isApplied(t.id)).length;
    const pct = list.length ? (on / list.length) * 100 : 0;
    return `
      <a class="cat-row" href="#/tweaks?cat=${c.id}">
        <div class="icon-tile sm hue" style="--h:${c.hue}">${icon(c.icon)}</div>
        <div class="grow">
          <div class="row"><span class="cat-name">${c.name}</span><span class="cat-count mono">${on}<small>/${list.length}</small></span></div>
          <div class="bar"><span style="--v:${pct}%"></span></div>
        </div>
      </a>`;
  }).join('');
}

const QUICK = [
  { id: 'clean', icon: 'brush-cleaning', label: 'Quick clean', sub: 'Scan & remove junk' },
  { id: 'flush-dns', icon: 'eraser', label: 'Flush DNS', sub: 'Fix stale lookups' },
  { id: 'restore-point', icon: 'life-buoy', label: 'Restore point', sub: 'Snapshot settings' },
  { id: 'restart-explorer', icon: 'rotate-cw', label: 'Restart Explorer', sub: 'Apply shell tweaks' },
];

export default {
  id: 'dashboard',
  mount(root) {
    const sys = state.system;
    const score = healthScore();
    root.innerHTML = `
      <div class="grid-12 dash stagger">
        <section class="card hero span-8" style="--i:0">
          <div class="hero-bg"></div>
          <div class="hero-left">
            <div class="eyebrow">${icon('sparkles')}${greeting()}${sys?.userName ? `, ${esc(sys.userName)}` : ''}</div>
            <h1 class="hero-title" id="hero-title">${heroTitle(score)}</h1>
            <p class="hero-sub">${sys ? `${esc(sys.computerName)} · ${esc(sys.os.name)} ${esc(sys.os.displayVersion || '')} · Build ${sys.os.build}.${sys.os.ubr}` : 'Reading system information…'}</p>
            <div class="hero-stats">
              <a class="hstat" href="#/tweaks"><span class="k">${icon('sliders-horizontal', 'i-sm')}Tweaks active</span><span class="v mono"><b id="hs-tw">0</b><small>/${TWEAKS.length}</small></span></a>
              <a class="hstat" href="#/cleaner"><span class="k">${icon('brush-cleaning', 'i-sm')}Junk found</span><span class="v mono" id="hs-junk"><span class="skeleton" style="display:inline-block;width:70px;height:22px"></span></span></a>
              <a class="hstat" href="#/startup"><span class="k">${icon('power', 'i-sm')}Startup apps</span><span class="v mono" id="hs-start"><span class="skeleton" style="display:inline-block;width:40px;height:22px"></span></span></a>
            </div>
            <div class="hero-actions">
              <button class="btn btn-primary btn-lg" data-act="presets">${icon('zap')}Optimize now</button>
              <a class="btn btn-secondary btn-lg" href="#/cleaner?scan=1">${icon('brush-cleaning')}Clean junk</a>
            </div>
          </div>
          <div class="hero-ring">
            ${ringHtml({ size: 236, stroke: 14, value: 0 })}
          </div>
        </section>

        <section class="card monitor span-4" style="--i:1">
          <div class="card-head"><h3>Live monitor</h3><span class="live">LIVE</span></div>
          <div class="metric">
            <div class="m-top"><span class="m-label">${icon('cpu', 'i-sm')}CPU load</span><span class="m-val mono"><b id="cpu-v">0</b>%</span></div>
            <canvas class="spark" id="cpu-spark"></canvas>
          </div>
          <div class="metric">
            <div class="m-top"><span class="m-label">${icon('memory-stick', 'i-sm')}Memory</span><span class="m-val mono"><b id="mem-v">0</b> <small>/ ${sys ? Math.round(sys.memory.total / GB) : '–'} GB</small></span></div>
            <canvas class="spark" id="mem-spark"></canvas>
          </div>
          <div class="monitor-foot">
            <span>${icon('clock', 'i-sm')}Uptime <b class="mono" id="uptime">–</b></span>
            <span>${icon('activity', 'i-sm')}<b class="mono" id="mem-pct">–</b> RAM used</span>
          </div>
        </section>

        ${hardwareCards(sys)}

        <section class="card span-5" style="--i:6">
          <div class="card-head">${icon('hard-drive')}<h3>Storage</h3><span class="end sub">${sys ? `${sys.volumes.length} volume${sys.volumes.length > 1 ? 's' : ''}` : ''}</span></div>
          <div class="vols">${storageRows(sys)}</div>
        </section>

        <section class="card span-4" style="--i:7">
          <div class="card-head">${icon('gauge')}<h3>Optimization</h3><a class="end link-btn" href="#/tweaks">View all</a></div>
          <div class="cats" id="cat-rows">${categoryRows()}</div>
        </section>

        <section class="card span-3 quick" style="--i:8">
          <div class="card-head">${icon('zap')}<h3>Quick actions</h3></div>
          <div class="quick-list">
            ${QUICK.map((q) => `<button class="quick-btn" data-quick="${q.id}"><div class="icon-tile sm">${icon(q.icon)}</div><div class="grow"><b>${q.label}</b><small>${q.sub}</small></div>${icon('chevron-right', 'i-sm')}</button>`).join('')}
          </div>
        </section>
      </div>`;

    const ring = $('.hero-ring .ring', root);
    ring.querySelector('.ring-center').innerHTML = `
      <div class="score mono" id="score">0</div>
      <div class="score-label" id="score-label">${healthLabel(score)}</div>
      <div class="score-k">Health score</div>`;

    const refresh = () => {
      const s = healthScore();
      requestAnimationFrame(() => setRing(ring, s));
      countTo($('#score', root), s, { duration: 1400 });
      $('#score-label', root).textContent = healthLabel(s);
      $('#hero-title', root).innerHTML = heroTitle(s);
      countTo($('#hs-tw', root), appliedCount());
      $('#cat-rows', root).innerHTML = categoryRows();
      if (state.junk) $('#hs-junk', root).textContent = formatBytes(state.junk.total);
      if (state.startup) $('#hs-start', root).innerHTML = `${state.startup.filter((x) => x.enabled).length}<small> on</small>`;
    };
    refresh();

    // Live stats (sampled in the background since boot)
    const cpuSpark = new Sparkline($('#cpu-spark', root));
    const memSpark = new Sparkline($('#mem-spark', root), { auto: true });
    const showStats = (s) => {
      if (!s) return;
      $('#cpu-v', root).textContent = Math.round(s.cpu);
      $('#mem-v', root).textContent = (s.memUsed / GB).toFixed(1);
      $('#mem-pct', root).textContent = `${Math.round((s.memUsed / s.memTotal) * 100)}%`;
      $('#uptime', root).textContent = formatUptime(s.uptime);
    };
    cpuSpark.setData(stats.cpu);
    memSpark.setData(stats.mem);
    showStats(stats.last);
    const offStats = onStats((s) => {
      cpuSpark.setData(stats.cpu);
      memSpark.setData(stats.mem);
      showStats(s);
    });
    const onResize = () => {
      cpuSpark.resize();
      memSpark.resize();
      cpuSpark.draw();
      memSpark.draw();
    };
    window.addEventListener('resize', onResize);

    root.addEventListener('click', async (e) => {
      if (e.target.closest('[data-act="presets"]')) return openPresets();
      const q = e.target.closest('[data-quick]');
      if (!q) return;
      const id = q.dataset.quick;
      if (id === 'clean') return (location.hash = '#/cleaner?scan=1');
      if (id === 'restart-explorer') return restartExplorer(q);
      await withLoading(q, async () => {
        try {
          const r = await api.tools.run(id);
          if (r?.ok === false) throw new Error(r.error);
          toast({ type: 'success', title: q.querySelector('b').textContent, message: r?.message || 'Done.' });
          logActivity('tool', q.querySelector('b').textContent, r?.message || '');
        } catch (err) {
          toast({ type: 'error', title: 'Action failed', message: err.message });
        }
      });
    });

    const offs = [on('tweaks', refresh), on('junk', refresh), on('startup', refresh)];
    return () => {
      offStats();
      window.removeEventListener('resize', onResize);
      offs.forEach((off) => off());
    };
  },
};
