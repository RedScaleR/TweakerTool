import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, net, protocol, shell } from 'electron';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import * as apps from './apps.js';
import * as cleaner from './cleaner.js';
import { psJson, psq } from './powershell.js';
import * as startup from './startup.js';
import { JsonStore } from './store.js';
import { getBuild, getSystemInfo, sampleStats } from './system-info.js';
import * as tools from './tools.js';
import { TweakEngine } from './tweak-engine.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(here, '..');
const ORIGIN = 'app://tweaker';
const DEMO = process.argv.includes('--demo') || process.platform !== 'win32';

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();

let win = null;
let elevated = false;

function checkElevation() {
  if (process.platform !== 'win32') return Promise.resolve(false);
  return new Promise((resolve) => {
    execFile('whoami', ['/groups'], { windowsHide: true }, (err, stdout) => {
      resolve(!err && /S-1-16-(12288|16384)\b/.test(stdout));
    });
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1080,
    minHeight: 700,
    frame: false,
    show: false,
    backgroundColor: '#09090c',
    title: 'TweakerTool',
    icon: nativeImage.createFromPath(path.join(SRC_ROOT, 'renderer', 'assets', 'icon.png')),
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      additionalArguments: [`--tt-demo=${DEMO ? 1 : 0}`, `--tt-version=${app.getVersion()}`],
    },
  });

  win.once('ready-to-show', () => win.show());
  win.on('maximize', () => win.webContents.send('win:maximized', true));
  win.on('unmaximize', () => win.webContents.send('win:maximized', false));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.loadURL(`${ORIGIN}/renderer/index.html`);
}

// Serve the renderer and shared catalogs from a private, secure origin.
function registerProtocol() {
  protocol.handle('app', (request) => {
    const { host, pathname } = new URL(request.url);
    const file = path.normalize(path.join(SRC_ROOT, decodeURIComponent(pathname)));
    const allowed = [path.join(SRC_ROOT, 'renderer'), path.join(SRC_ROOT, 'shared')];
    if (host !== 'tweaker' || !allowed.some((dir) => file.startsWith(dir + path.sep))) {
      return new Response('Not found', { status: 404 });
    }
    return net.fetch(pathToFileURL(file).toString());
  });
}

/** ipcMain.handle that only answers our own renderer. */
function handle(channel, fn) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!event.senderFrame?.url.startsWith(`${ORIGIN}/`)) throw new Error('Blocked');
    return fn(...args);
  });
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function registerIpc() {
  ipcMain.on('win:minimize', () => win?.minimize());
  ipcMain.on('win:toggle-maximize', () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()));
  ipcMain.on('win:close', () => win?.close());

  const backups = new JsonStore(path.join(app.getPath('userData'), 'tweak-backups.json'));
  const engine = new TweakEngine({
    runJson: psJson,
    backups,
    getBuild,
    isAdmin: () => elevated,
  });

  handle('system:info', async () => ({ ...(await getSystemInfo()), isAdmin: elevated }));
  handle('system:stats', () => sampleStats());

  handle('admin:status', () => elevated);
  handle('admin:relaunch', async () => {
    const args = app.isPackaged ? process.argv.slice(1) : [app.getAppPath(), ...process.argv.slice(2)];
    const argList = args.length ? ` -ArgumentList ${args.map((a) => psq(`"${a}"`)).join(',')}` : '';
    try {
      await psJson(`Start-Process -FilePath ${psq(process.execPath)}${argList} -Verb RunAs\nTTOut @{ ok = $true }`);
    } catch {
      return false;
    }
    app.exit(0);
    return true;
  });

  handle('tweaks:status', (ids) => engine.status(ids));
  handle('tweaks:apply', (ids) => engine.apply(ids));
  handle('tweaks:revert', (ids) => engine.revert(ids));
  handle('tweaks:backups', () => Object.keys(backups.data));

  handle('cleaner:scan', (ids) => cleaner.scan(ids, (p) => send('cleaner:progress', p)));
  handle('cleaner:clean', (ids) => cleaner.clean(ids, (p) => send('cleaner:progress', p)));

  handle('startup:list', async () => {
    const items = await startup.listStartup();
    await Promise.all(
      items.map(async (item) => {
        if (!item.exists) return;
        try {
          item.icon = (await app.getFileIcon(item.exe, { size: 'normal' })).toDataURL();
        } catch {
          /* no icon */
        }
      }),
    );
    return items;
  });
  handle('startup:set', (item, enabled) => startup.setStartup(item, Boolean(enabled)));

  handle('apps:winget', () => apps.wingetVersion());
  handle('apps:installed', () => apps.installedApps());
  handle('apps:install', (id) => apps.installApp(id, (e) => send('apps:progress', e)));
  handle('apps:uninstall', (id) => apps.uninstallApp(id, (e) => send('apps:progress', e)));
  handle('bloat:scan', () => apps.scanBloat(elevated));
  handle('bloat:remove', (ids) => apps.removeBloat(ids, elevated));

  handle('tools:run', async (id) => {
    const result = await tools.runAction(id);
    if (result?.open) await shell.openPath(result.open);
    return result;
  });
  handle('tools:stream', (id) => tools.runStream(id, (e) => send('tools:event', e)));
  ipcMain.on('tools:cancel', (_e, id) => tools.cancelStream(id));
  handle('tools:launch', (id) => tools.launch(id));
  handle('dns:get', () => tools.getDns());
  handle('dns:set', (id) => tools.setDns(id));
  handle('restore:create', (desc) => tools.createRestorePoint(String(desc || 'TweakerTool checkpoint').slice(0, 200)));

  handle('shell:external', (url) => {
    if (typeof url === 'string' && /^https:\/\//.test(url)) return shell.openExternal(url);
    return false;
  });

  handle('profile:save', async (json) => {
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Export tweak profile',
      defaultPath: 'tweakertool-profile.json',
      filters: [{ name: 'TweakerTool profile', extensions: ['json'] }],
    });
    if (canceled || !filePath) return false;
    await fs.writeFile(filePath, JSON.stringify(json, null, 2));
    return true;
  });
  handle('profile:open', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Import tweak profile',
      properties: ['openFile'],
      filters: [{ name: 'TweakerTool profile', extensions: ['json'] }],
    });
    if (canceled || !filePaths[0]) return null;
    return JSON.parse(await fs.readFile(filePaths[0], 'utf8'));
  });
}

app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.whenReady().then(async () => {
  if (!primaryInstance) return;
  Menu.setApplicationMenu(null);
  elevated = await checkElevation();
  registerProtocol();
  registerIpc();
  createWindow();
});

app.on('window-all-closed', () => app.quit());
