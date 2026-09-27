import { icon } from './icons.js';
import { $, $$, el, esc } from './util.js';

/* ─────────────── Toasts ─────────────── */

const TOAST_ICONS = { success: 'circle-check', error: 'circle-x', info: 'info', warn: 'triangle-alert' };

export function toast({ type = 'info', title, message = '', actions = [], duration = 5000 }) {
  const host = $('#toasts');
  const node = el(`
    <div class="toast ${type}" role="status">
      <div class="t-icon">${icon(TOAST_ICONS[type])}</div>
      <div class="grow">
        <div class="t-title">${esc(title)}</div>
        ${message ? `<div class="t-msg">${esc(message)}</div>` : ''}
        ${actions.length ? `<div class="t-actions">${actions.map((a, i) => `<button class="btn btn-sm ${i ? 'btn-ghost' : 'btn-secondary'}" data-i="${i}">${esc(a.label)}</button>`).join('')}</div>` : ''}
      </div>
      <button class="t-close" aria-label="Dismiss">${icon('x', 'i-sm')}</button>
      ${duration ? `<div class="t-timer" style="animation-duration:${duration}ms"></div>` : ''}
    </div>`);
  let timer;
  const close = () => {
    clearTimeout(timer);
    node.classList.add('out');
    setTimeout(() => node.remove(), 300);
  };
  node.querySelector('.t-close').onclick = close;
  $$('[data-i]', node).forEach((b) => {
    b.onclick = () => {
      actions[b.dataset.i].onClick?.();
      close();
    };
  });
  if (duration) {
    timer = setTimeout(close, duration);
    node.addEventListener('mouseenter', () => {
      clearTimeout(timer);
      node.querySelector('.t-timer')?.style.setProperty('animation-play-state', 'paused');
    });
    node.addEventListener('mouseleave', () => {
      timer = setTimeout(close, 1800);
    });
  }
  host.append(node);
  while (host.children.length > 4) host.firstElementChild.remove();
  return close;
}

/* ─────────────── Modals ─────────────── */

/**
 * Open a modal. `render(body, api)` fills it. Returns { close, root }.
 * Esc and backdrop clicks close it unless `locked` is set via api.lock().
 */
export function modal({ title, subtitle = '', iconName, wide = false, render, onClose }) {
  const root = el(`
    <div class="modal-backdrop">
      <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
        <div class="modal-head">
          ${iconName ? `<div class="icon-tile accent">${icon(iconName)}</div>` : ''}
          <div class="grow"><h2>${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div>
          <button class="x" aria-label="Close">${icon('x')}</button>
        </div>
        <div class="modal-body"></div>
        <div class="modal-foot"></div>
      </div>
    </div>`);
  let locked = false;
  const onKey = (e) => {
    if (e.key === 'Escape' && !locked) close();
  };
  const close = () => {
    if (!root.isConnected) return;
    document.removeEventListener('keydown', onKey, true);
    root.classList.add('out');
    setTimeout(() => root.remove(), 250);
    onClose?.();
  };
  const api = {
    body: $('.modal-body', root),
    foot: $('.modal-foot', root),
    head: $('.modal-head', root),
    close,
    lock(v = true) {
      locked = v;
      $('.x', root).style.visibility = v ? 'hidden' : '';
    },
    setTitle(t, s) {
      $('h2', root).textContent = t;
      const p = $('.modal-head p', root);
      if (p && s !== undefined) p.textContent = s;
    },
  };
  $('.x', root).onclick = close;
  root.addEventListener('mousedown', (e) => {
    if (e.target === root && !locked) close();
  });
  document.addEventListener('keydown', onKey, true);
  document.body.append(root);
  render(api.body, api);
  if (!api.foot.childElementCount) api.foot.remove();
  return api;
}

export function confirmDialog({ title, message, confirm = 'Continue', danger = false, iconName = 'triangle-alert' }) {
  return new Promise((resolve) => {
    let answered = false;
    modal({
      title,
      iconName,
      render(body, m) {
        body.innerHTML = `<p class="muted" style="font-size:13.5px">${message}</p>`;
        m.foot.innerHTML = `
          <button class="btn btn-ghost" data-a="no">Cancel</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-a="yes">${esc(confirm)}</button>`;
        m.foot.onclick = (e) => {
          const a = e.target.closest('[data-a]')?.dataset.a;
          if (!a) return;
          answered = true;
          resolve(a === 'yes');
          m.close();
        };
      },
      onClose: () => !answered && resolve(false),
    });
  });
}

/* ─────────────── Small markup helpers ─────────────── */

export const switchHtml = (on, attrs = '') =>
  `<button class="switch ${on ? 'on' : ''}" role="switch" aria-checked="${on}" ${attrs}></button>`;

export const checkHtml = (on, attrs = '') =>
  `<span class="check ${on ? 'on' : ''}" role="checkbox" aria-checked="${on}" ${attrs}>${icon('check')}</span>`;

let ringId = 0;

/** SVG progress ring with gradient stroke and tick marks. */
export function ringHtml({ size = 180, stroke = 12, value = 0, ticks = 60, cls = '' } = {}) {
  const id = `rg${++ringId}`;
  const r = size / 2 - stroke / 2 - (ticks ? 14 : 0);
  const c = 2 * Math.PI * r;
  const tickMarks = ticks
    ? Array.from({ length: ticks }, (_, i) => {
        const a = (i / ticks) * Math.PI * 2;
        const r1 = size / 2 - 4;
        const r2 = size / 2 - (i % 5 === 0 ? 10 : 7);
        const cx = size / 2;
        return `<line data-t="${i}" x1="${cx + Math.cos(a) * r1}" y1="${cx + Math.sin(a) * r1}" x2="${cx + Math.cos(a) * r2}" y2="${cx + Math.sin(a) * r2}"/>`;
      }).join('')
    : '';
  return `
    <div class="ring ${cls}" style="width:${size}px;height:${size}px" data-c="${c}" data-ticks="${ticks}">
      <svg viewBox="0 0 ${size} ${size}">
        <defs>
          <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="var(--accent-2)"/>
            <stop offset="1" stop-color="var(--accent)"/>
          </linearGradient>
        </defs>
        <g class="ticks">${tickMarks}</g>
        <circle class="track" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"/>
        <circle class="value" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="url(#${id})" stroke-width="${stroke}"
          stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - value / 100)}"/>
      </svg>
      <div class="ring-center"></div>
    </div>`;
}

export function setRing(ring, value) {
  if (!ring) return;
  const c = Number(ring.dataset.c);
  const v = Math.max(0, Math.min(100, value));
  ring.querySelector('.value').style.strokeDashoffset = c * (1 - v / 100);
  const ticks = Number(ring.dataset.ticks);
  if (ticks) {
    const lit = Math.round((v / 100) * ticks);
    ring.querySelectorAll('.ticks line').forEach((line, i) => line.classList.toggle('lit', i < lit));
  }
}

/* ─────────────── Segmented control ─────────────── */

export function syncSegmented(seg) {
  const active = seg?.querySelector('button.active');
  const ind = seg?.querySelector('.seg-ind');
  if (!active || !ind) return;
  ind.style.width = `${active.offsetWidth}px`;
  ind.style.transform = `translateX(${active.offsetLeft}px)`;
}

/* ─────────────── Sparkline ─────────────── */

export class Sparkline {
  constructor(canvas, { points = 60, max = 100, auto = false } = {}) {
    this.canvas = canvas;
    this.points = points;
    this.max = max;
    this.auto = auto;
    this.data = [];
    this.ctx = canvas.getContext('2d');
    this.resize();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = this.canvas.getBoundingClientRect();
    this.w = width;
    this.h = height;
    this.canvas.width = Math.max(1, width * dpr);
    this.canvas.height = Math.max(1, height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  setData(values) {
    this.data = values.slice(-this.points);
    this.draw();
  }

  draw() {
    const { ctx, w, h, data } = this;
    if (!w) return;
    const style = getComputedStyle(document.documentElement);
    const a1 = style.getPropertyValue('--accent-rgb').trim();
    const a2 = style.getPropertyValue('--accent-2-rgb').trim();
    ctx.clearRect(0, 0, w, h);
    if (data.length < 2) return;
    const step = w / (this.points - 1);
    const offset = (this.points - data.length) * step;
    let lo = 0;
    let hi = this.max;
    if (this.auto) {
      const mn = Math.min(...data);
      const mx = Math.max(...data);
      const pad = Math.max(3, (mx - mn) * 0.6);
      lo = Math.max(0, mn - pad);
      hi = Math.min(this.max, mx + pad);
    }
    const y = (v) => h - 3 - ((Math.min(v, hi) - lo) / (hi - lo || 1)) * (h - 8);
    const path = new Path2D();
    data.forEach((v, i) => {
      const x = offset + i * step;
      if (i === 0) path.moveTo(x, y(v));
      else {
        const px = offset + (i - 1) * step;
        const mx = (px + x) / 2;
        path.bezierCurveTo(mx, y(data[i - 1]), mx, y(v), x, y(v));
      }
    });
    const fill = new Path2D(path);
    fill.lineTo(offset + (data.length - 1) * step, h);
    fill.lineTo(offset, h);
    fill.closePath();
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, `rgba(${a1}, 0.32)`);
    g.addColorStop(1, `rgba(${a1}, 0)`);
    ctx.fillStyle = g;
    ctx.fill(fill);
    const lg = ctx.createLinearGradient(0, 0, w, 0);
    lg.addColorStop(0, `rgba(${a2}, 0.9)`);
    lg.addColorStop(1, `rgba(${a1}, 1)`);
    ctx.strokeStyle = lg;
    ctx.lineWidth = 2;
    ctx.shadowColor = `rgba(${a1}, 0.7)`;
    ctx.shadowBlur = 8;
    ctx.stroke(path);
    ctx.shadowBlur = 0;
    const lx = offset + (data.length - 1) * step;
    const ly = y(data[data.length - 1]);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(lx, ly, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(${a1}, 0.35)`;
    ctx.beginPath();
    ctx.arc(lx, ly, 7, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* ─────────────── Confetti ─────────────── */

export function confetti({ x = window.innerWidth / 2, y = window.innerHeight / 2, count = 140 } = {}) {
  if (document.documentElement.dataset.motion === 'reduced') return;
  const canvas = el('<canvas class="confetti-canvas"></canvas>');
  document.body.append(canvas);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const style = getComputedStyle(document.documentElement);
  const colors = [style.getPropertyValue('--accent').trim(), style.getPropertyValue('--accent-2').trim(), '#ffffff', '#fbbf24'];
  const parts = Array.from({ length: count }, () => {
    const a = Math.random() * Math.PI * 2;
    const v = 4 + Math.random() * 9;
    return {
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v - 6,
      r: 3 + Math.random() * 4,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.4,
      c: colors[Math.floor(Math.random() * colors.length)],
      shape: Math.random() < 0.5 ? 'rect' : 'circle',
    };
  });
  const start = performance.now();
  const frame = (now) => {
    const t = now - start;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of parts) {
      p.vy += 0.28;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t / 1800);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.c;
      if (p.shape === 'rect') ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
      else {
        ctx.beginPath();
        ctx.arc(0, 0, p.r / 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    if (t < 1800) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

/* ─────────────── Global pointer spotlight ─────────────── */

export function initSpotlight() {
  document.addEventListener(
    'pointermove',
    (e) => {
      const card = e.target.closest?.('.spot');
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    },
    { passive: true },
  );
}

/** Button loading helper. */
export async function withLoading(btn, fn) {
  btn?.classList.add('loading');
  btn && (btn.disabled = true);
  try {
    return await fn();
  } finally {
    btn?.classList.remove('loading');
    btn && (btn.disabled = false);
  }
}
