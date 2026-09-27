// Samples CPU / memory once a second from boot so charts open with history.

import { api, isDemo } from './api.js';

const POINTS = 60;
export const stats = { cpu: [], mem: [], last: null };
const listeners = new Set();
let timer = null;

function push(s) {
  stats.last = s;
  stats.cpu.push(s.cpu);
  stats.mem.push((s.memUsed / s.memTotal) * 100);
  if (stats.cpu.length > POINTS) stats.cpu.shift();
  if (stats.mem.length > POINTS) stats.mem.shift();
  listeners.forEach((fn) => fn(s));
}

async function tick() {
  try {
    push(await api.system.stats());
  } catch {
    /* transient */
  }
}

export async function startStats() {
  if (timer) return;
  if (isDemo) for (let i = 0; i < POINTS - 1; i++) push(await api.system.stats());
  timer = setInterval(tick, 1000);
  tick();
}

export function onStats(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
