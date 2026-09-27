// Exposes a small, typed bridge to the renderer. The renderer never gets
// Node or arbitrary command execution — only these catalog-driven calls.

const { contextBridge, ipcRenderer } = require('electron');

const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : '';
};

const invoke = async (channel, ...args) => {
  try {
    return await ipcRenderer.invoke(channel, ...args);
  } catch (err) {
    throw new Error(String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
  }
};

const listen = (channel) => (callback) => {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('tweaker', {
  demo: arg('tt-demo') === '1',
  version: arg('tt-version'),
  platform: process.platform,
  window: {
    minimize: () => ipcRenderer.send('win:minimize'),
    toggleMaximize: () => ipcRenderer.send('win:toggle-maximize'),
    close: () => ipcRenderer.send('win:close'),
    onMaximized: listen('win:maximized'),
  },
  system: {
    info: () => invoke('system:info'),
    stats: () => invoke('system:stats'),
  },
  admin: {
    status: () => invoke('admin:status'),
    relaunch: () => invoke('admin:relaunch'),
  },
  tweaks: {
    status: (ids) => invoke('tweaks:status', ids),
    apply: (ids) => invoke('tweaks:apply', ids),
    revert: (ids) => invoke('tweaks:revert', ids),
  },
  cleaner: {
    scan: (ids) => invoke('cleaner:scan', ids),
    clean: (ids) => invoke('cleaner:clean', ids),
    onProgress: listen('cleaner:progress'),
  },
  startup: {
    list: () => invoke('startup:list'),
    set: (item, enabled) => invoke('startup:set', item, enabled),
  },
  apps: {
    winget: () => invoke('apps:winget'),
    installed: () => invoke('apps:installed'),
    install: (id) => invoke('apps:install', id),
    uninstall: (id) => invoke('apps:uninstall', id),
    onProgress: listen('apps:progress'),
    scanBloat: () => invoke('bloat:scan'),
    removeBloat: (ids) => invoke('bloat:remove', ids),
  },
  tools: {
    run: (id) => invoke('tools:run', id),
    stream: (id) => invoke('tools:stream', id),
    cancel: (id) => ipcRenderer.send('tools:cancel', id),
    onEvent: listen('tools:event'),
    launch: (id) => invoke('tools:launch', id),
    getDns: () => invoke('dns:get'),
    setDns: (id) => invoke('dns:set', id),
    restorePoint: (description) => invoke('restore:create', description),
  },
  shell: {
    openExternal: (url) => invoke('shell:external', url),
  },
  profile: {
    save: (json) => invoke('profile:save', json),
    open: () => invoke('profile:open'),
  },
});
