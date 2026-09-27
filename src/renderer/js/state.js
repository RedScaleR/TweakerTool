// Shared renderer state with a tiny event bus.

const SETTINGS_KEY = 'tt.settings';
const ACTIVITY_KEY = 'tt.activity';

const DEFAULT_SETTINGS = {
  accent: 'crimson',
  ambient: true,
  glass: true,
  reduceMotion: false,
  restorePoint: true,
  confirmAdvanced: true,
};

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function persist(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

export const state = {
  system: null,
  admin: false,
  tweaks: {},
  tweaksLoaded: false,
  pending: new Map(),
  junk: null,
  startup: null,
  installed: null,
  restart: { explorer: false, signout: false, reboot: false },
  settings: { ...DEFAULT_SETTINGS, ...load(SETTINGS_KEY, {}) },
  activity: load(ACTIVITY_KEY, []),
};

const listeners = new Map();

export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => listeners.get(event)?.delete(fn);
}

export function emit(event, payload) {
  listeners.get(event)?.forEach((fn) => fn(payload));
}

export function setSetting(key, value) {
  state.settings[key] = value;
  persist(SETTINGS_KEY, state.settings);
  emit('settings', state.settings);
}

export function resetSettings() {
  state.settings = { ...DEFAULT_SETTINGS };
  persist(SETTINGS_KEY, state.settings);
  emit('settings', state.settings);
}

/**
 * Record something the user did.
 * type: tweak-apply | tweak-revert | clean | startup | install | uninstall | debloat | tool | dns
 */
export function logActivity(type, title, detail = '', ok = true) {
  state.activity.unshift({ id: crypto.randomUUID(), type, title, detail, ok, at: Date.now() });
  state.activity.length = Math.min(state.activity.length, 250);
  persist(ACTIVITY_KEY, state.activity);
  emit('activity', state.activity);
}

export function clearActivity() {
  state.activity = [];
  persist(ACTIVITY_KEY, state.activity);
  emit('activity', state.activity);
}

export function flagRestart(kind) {
  if (!kind || state.restart[kind]) return;
  state.restart[kind] = true;
  emit('restart', state.restart);
}

export function clearRestart(kind) {
  state.restart[kind] = false;
  emit('restart', state.restart);
}
