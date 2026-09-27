// Demo backend used when TweakerTool runs outside Windows (or with --demo).
// It mirrors the real preload API with realistic, simulated data.

import { APPS } from '../../shared/apps.js';
import { DNS_MAP } from '../../shared/tools.js';
import { TWEAKS } from '../../shared/tweaks.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (ms) => wait(ms * (0.7 + Math.random() * 0.6));
const GB = 1024 ** 3;
const MB = 1024 ** 2;

function channel() {
  const fns = new Set();
  return {
    on: (fn) => (fns.add(fn), () => fns.delete(fn)),
    emit: (v) => fns.forEach((fn) => fn(v)),
  };
}

const SYSTEM = {
  computerName: 'REDSCALER-RIG',
  userName: 'RedScaleR',
  os: { name: 'Windows 11 Pro', displayVersion: '24H2', build: 26100, ubr: 4946, arch: '64-bit', installDate: '2025-11-02T18:22:10Z' },
  cpu: { name: 'AMD Ryzen 7 7800X3D 8-Core Processor', cores: 8, threads: 16, maxClock: 4201 },
  gpus: [{ name: 'NVIDIA GeForce RTX 4070 Ti SUPER', vram: 16 * GB, driver: '32.0.15.8129' }],
  memory: { total: 32 * GB - 190 * MB, modules: 2, speed: 6000, type: 'DDR5' },
  board: { maker: 'ASUSTeK COMPUTER INC.', product: 'ROG STRIX B650E-F GAMING WIFI', model: 'System Product Name' },
  volumes: [
    { letter: 'C:', label: 'Windows', size: 1000 * GB, free: 318 * GB, fs: 'NTFS', kind: 'NVMe' },
    { letter: 'D:', label: 'Games', size: 2000 * GB, free: 241 * GB, fs: 'NTFS', kind: 'NVMe' },
    { letter: 'E:', label: 'Archive', size: 4000 * GB, free: 2710 * GB, fs: 'NTFS', kind: 'HDD' },
  ],
  isAdmin: true,
};

const initiallyApplied = new Set([
  'perf-startup-delay', 'game-mode', 'priv-ad-id', 'priv-tailored', 'ui-dark-mode', 'ui-file-ext',
  'sys-long-paths', 'sys-bsod', 'net-smb1', 'game-hags', 'ui-end-task',
]);
const tweakState = Object.fromEntries(
  TWEAKS.map((t) => [t.id, { state: initiallyApplied.has(t.id) ? 'applied' : 'default', backup: false }]),
);
tweakState['priv-telemetry'].state = 'partial';

const JUNK = {
  'user-temp': [1.84 * GB, 12480],
  'win-temp': [412 * MB, 2211],
  'recycle-bin': [2.31 * GB, 146],
  'wu-cache': [3.12 * GB, 318],
  'delivery-opt': [860 * MB, 41],
  'crash-dumps': [742 * MB, 9],
  'error-reports': [96 * MB, 58],
  'system-logs': [188 * MB, 24],
  thumbnails: [312 * MB, 12],
  prefetch: [42 * MB, 486],
  chrome: [1.21 * GB, 8804],
  edge: [486 * MB, 3120],
  brave: [0, 0],
  firefox: [0, 0],
  opera: [634 * MB, 4012],
  'inet-cache': [64 * MB, 902],
  discord: [922 * MB, 2410],
  steam: [402 * MB, 5021],
  spotify: [1.62 * GB, 1180],
  vscode: [281 * MB, 740],
  'dx-shader': [1.14 * GB, 214],
  'gpu-shader': [2.42 * GB, 1630],
};

const STARTUP = [
  ['Discord', 'Discord Inc.', '"C:\\Users\\RedScaleR\\AppData\\Local\\Discord\\Update.exe" --processStart Discord.exe', 'user', true],
  ['Steam', 'Valve Corporation', '"C:\\Program Files (x86)\\Steam\\steam.exe" -silent', 'user', true],
  ['Spotify', 'Spotify Ltd', '"C:\\Users\\RedScaleR\\AppData\\Roaming\\Spotify\\Spotify.exe" --autostart --minimized', 'user', true],
  ['OneDrive', 'Microsoft Corporation', '"C:\\Program Files\\Microsoft OneDrive\\OneDrive.exe" /background', 'user', true],
  ['Microsoft Teams', 'Microsoft Corporation', '"C:\\Program Files\\WindowsApps\\MSTeams\\ms-teams.exe" msteams:system-initiated', 'user', true],
  ['Razer Synapse', 'Razer Inc.', '"C:\\Program Files\\Razer\\Synapse3\\WPFUI\\Framework\\Razer Synapse 3 Host\\Razer Synapse 3.exe" /StartMinimized', 'machine', true],
  ['Logitech G HUB', 'Logitech', '"C:\\Program Files\\LGHUB\\lghub.exe" --background', 'machine', true],
  ['Epic Games Launcher', 'Epic Games, Inc.', '"C:\\Program Files (x86)\\Epic Games\\Launcher\\Portal\\Binaries\\Win64\\EpicGamesLauncher.exe" -silent', 'user', false],
  ['EA app', 'Electronic Arts', '"C:\\Program Files\\Electronic Arts\\EA Desktop\\EA Desktop\\EALauncher.exe" -silent', 'machine', false],
  ['Opera GX Browser Assistant', 'Opera Norway AS', 'C:\\Users\\RedScaleR\\AppData\\Local\\Programs\\Opera GX\\assistant\\browser_assistant.exe', 'user', false],
  ['Windows Security notification icon', 'Microsoft Corporation', '%windir%\\system32\\SecurityHealthSystray.exe', 'machine', true],
  ['Realtek Audio Console', 'Realtek Semiconductor', '"C:\\Program Files\\Realtek\\Audio\\HDA\\RtkAudUService64.exe" -background', 'machine', true],
].map(([name, publisher, command, scope, enabled], i) => ({
  name,
  publisher,
  command,
  scope,
  enabled,
  source: i === 9 ? 'folder' : 'registry',
  hive: scope === 'user' ? 'HKEY_CURRENT_USER' : 'HKEY_LOCAL_MACHINE',
  list: i === 9 ? 'StartupFolder' : 'Run',
  valueName: name,
  key: `mock|${i}`,
  exists: true,
}));

const installed = new Set(['Google.Chrome', 'Valve.Steam', 'Discord.Discord', '7zip.7zip', 'VideoLAN.VLC', 'Microsoft.VisualStudioCode', 'Spotify.Spotify', 'Git.Git']);
const bloatInstalled = new Set([
  'Microsoft.BingNews', 'Microsoft.BingWeather', 'Microsoft.GetHelp', 'Microsoft.Getstarted', 'Microsoft.MicrosoftOfficeHub',
  'Microsoft.MicrosoftSolitaireCollection', 'Microsoft.WindowsFeedbackHub', 'Microsoft.WindowsMaps', 'Microsoft.Todos',
  'Microsoft.PowerAutomateDesktop', 'Clipchamp.Clipchamp', 'MSTeams', 'Microsoft.OutlookForWindows', 'Microsoft.Windows.DevHome',
  'Microsoft.Copilot', 'Microsoft.YourPhone', 'Microsoft.ZuneMusic', 'Microsoft.WindowsAlarms', 'Microsoft.WindowsSoundRecorder',
  'MicrosoftCorporationII.QuickAssist', 'MicrosoftCorporationII.MicrosoftFamily', 'Microsoft.GamingApp', 'Microsoft.XboxGamingOverlay',
  'Microsoft.Xbox.TCUI', 'king.com.*', 'SpotifyAB.SpotifyMusic', 'Disney.37853FC22B2CE', 'AmazonVideo.PrimeVideo', 'BytedancePte.Ltd.TikTok',
  'Facebook.Instagram*', '7EE7776C.LinkedInforWindows',
]);

let dns = { adapters: [{ name: 'Ethernet', description: 'Realtek Gaming 2.5GbE Family Controller', servers: ['192.168.1.1'] }], provider: 'auto' };

let cpu = 14;
let mem = 12.4 * GB;
const t0 = Date.now();

const cleanerCh = channel();
const appsCh = channel();
const toolsCh = channel();
const cancelled = new Set();

const STREAM_SCRIPTS = {
  sfc: {
    intro: ['Beginning system scan.  This process will take some time.', '', 'Beginning verification phase of system scan.'],
    progress: (p) => `Verification ${Math.floor(p)}% complete.`,
    outro: ['', 'Windows Resource Protection did not find any integrity violations.'],
  },
  dism: {
    intro: ['Deployment Image Servicing and Management tool', 'Version: 10.0.26100.1150', '', 'Image Version: 10.0.26100.4946', ''],
    progress: (p) => `[${'='.repeat(Math.floor(p / 4)).padEnd(25, ' ')}${p.toFixed(1)}%${' '.repeat(25)}]`,
    outro: ['The restore operation completed successfully.', 'The operation completed successfully.'],
  },
  'component-cleanup': {
    intro: ['Deployment Image Servicing and Management tool', 'Version: 10.0.26100.1150', '', 'Image Version: 10.0.26100.4946', ''],
    progress: (p) => `[${'='.repeat(Math.floor(p / 4)).padEnd(25, ' ')}${p.toFixed(1)}%${' '.repeat(25)}]`,
    outro: ['The operation completed successfully.'],
  },
  chkdsk: {
    intro: ['The type of the file system is NTFS.', 'Volume label is Windows.', '', 'Stage 1: Examining basic file system structure ...'],
    progress: (p) => (p < 50 ? `Stage 1: Examining basic file system structure ... ${Math.floor(p * 2)}%` : `Stage 2: Examining file name linkage ... ${Math.floor((p - 50) * 2)}%`),
    outro: ['Stage 3: Examining security descriptors ...', '', 'Windows has scanned the file system and found no problems.', 'No further action is required.'],
  },
};

export function createMockApi(bridge) {
  return {
    demo: true,
    version: bridge?.version || '1.0.0',
    platform: 'win32',
    window: bridge?.window || {
      minimize() {},
      toggleMaximize() {},
      close() {},
      onMaximized: () => () => {},
    },

    system: {
      async info() {
        await jitter(500);
        return structuredClone(SYSTEM);
      },
      async stats() {
        cpu = Math.max(3, Math.min(96, cpu + (Math.random() - 0.5) * 12 + (Math.random() < 0.06 ? 30 : 0) - (cpu > 40 ? 6 : 0)));
        mem = Math.max(9 * GB, Math.min(19 * GB, mem + (Math.random() - 0.5) * 220 * MB));
        return { cpu, memUsed: mem, memTotal: SYSTEM.memory.total, uptime: 3 * 86400 + 4 * 3600 + (Date.now() - t0) / 1000 };
      },
    },

    admin: {
      status: async () => true,
      relaunch: async () => true,
    },

    tweaks: {
      async status(ids) {
        await jitter(900);
        const out = {};
        for (const id of ids || Object.keys(tweakState)) out[id] = { ...tweakState[id] };
        return out;
      },
      async apply(ids) {
        const results = {};
        for (const id of ids) {
          await jitter(260);
          if (tweakState[id].state !== 'applied') tweakState[id].backup = true;
          tweakState[id].state = 'applied';
          results[id] = { ok: true };
        }
        return { results, states: await this.status(ids) };
      },
      async revert(ids) {
        const results = {};
        for (const id of ids) {
          await jitter(220);
          tweakState[id] = { state: 'default', backup: false };
          results[id] = { ok: true };
        }
        return { results, states: await this.status(ids) };
      },
    },

    cleaner: {
      onProgress: cleanerCh.on,
      async scan(ids) {
        const results = {};
        for (const id of ids) {
          const [raw, files] = JUNK[id] ?? [0, 0];
          const size = Math.round(raw);
          cleanerCh.emit({ id, phase: 'start' });
          const steps = 6;
          for (let s = 1; s <= steps; s++) {
            await jitter(55);
            cleanerCh.emit({ id, size: (size * s) / steps, files: Math.round((files * s) / steps) });
          }
          results[id] = { size, files };
          cleanerCh.emit({ id, phase: 'done', size, files });
        }
        return results;
      },
      async clean(ids) {
        const results = {};
        for (const id of ids) {
          const [size, files] = JUNK[id] ?? [0, 0];
          cleanerCh.emit({ id, phase: 'start' });
          await jitter(320);
          const skipped = id.includes('temp') ? Math.round(files * 0.02) : 0;
          const freed = skipped ? Math.round(size * 0.97) : Math.round(size);
          JUNK[id] = [skipped ? Math.round(size) - freed : 0, skipped];
          results[id] = { freed, removed: files - skipped, skipped };
          cleanerCh.emit({ id, phase: 'done', ...results[id] });
        }
        return results;
      },
    },

    startup: {
      async list() {
        await jitter(700);
        return structuredClone(STARTUP);
      },
      async set(item, enabled) {
        await jitter(200);
        const hit = STARTUP.find((s) => s.key === item.key);
        if (hit) hit.enabled = enabled;
        return { ok: true };
      },
    },

    apps: {
      onProgress: appsCh.on,
      winget: async () => (await jitter(300), 'v1.11.430'),
      async installed() {
        await jitter(1200);
        return [...installed];
      },
      async install(id) {
        const app = APPS.find((a) => a.id === id);
        const lines = [
          `Found ${app.name} [${id}] Version ${Math.floor(Math.random() * 90) + 10}.${Math.floor(Math.random() * 9)}.${Math.floor(Math.random() * 300)}`,
          'This application is licensed to you by its owner.',
          'Microsoft is not responsible for, nor does it grant any licenses to, third-party packages.',
          `Downloading https://cdn.example-mirror.net/${id.toLowerCase()}/setup.exe`,
        ];
        for (const line of lines) {
          await jitter(180);
          appsCh.emit({ id, line });
        }
        for (let p = 0; p <= 100; p += 9 + Math.random() * 14) {
          await jitter(90);
          appsCh.emit({ id, pct: Math.min(100, p) });
        }
        appsCh.emit({ id, pct: 100 });
        for (const line of ['Successfully verified installer hash', 'Starting package install...', 'Successfully installed']) {
          await jitter(300);
          appsCh.emit({ id, line });
        }
        installed.add(id);
        return { ok: true, code: 0 };
      },
      async uninstall(id) {
        appsCh.emit({ id, line: 'Starting package uninstall...' });
        await jitter(1200);
        installed.delete(id);
        appsCh.emit({ id, line: 'Successfully uninstalled' });
        return { ok: true, code: 0 };
      },
      async scanBloat() {
        await jitter(1100);
        return [...bloatInstalled].map((id) => ({ id, installed: true, packages: [id] }));
      },
      async removeBloat(ids) {
        const out = {};
        for (const id of ids) {
          await jitter(180);
          bloatInstalled.delete(id);
          out[id] = { ok: true };
        }
        return out;
      },
    },

    tools: {
      onEvent: toolsCh.on,
      async run(id) {
        await jitter(id === 'restore-point' ? 1800 : 900);
        const messages = {
          'restore-point': 'Restore point created.',
          'flush-dns': 'DNS resolver cache flushed.',
          'reset-network': 'Network stack reset. Restart your PC to finish.',
          'restart-explorer': 'Explorer restarted.',
          'icon-cache': 'Icon cache rebuilt.',
          'battery-report': null,
          'clear-event-logs': 'Cleared 1,184 event logs.',
          'wu-reset': 'Windows Update components reset.',
        };
        if (id === 'battery-report') return { ok: false, error: 'No battery was found on this PC.' };
        return { ok: true, message: messages[id] };
      },
      async stream(id) {
        const script = STREAM_SCRIPTS[id];
        cancelled.delete(id);
        for (const line of script.intro) {
          await jitter(260);
          toolsCh.emit({ id, type: 'line', line });
        }
        let p = 0;
        while (p < 100) {
          if (cancelled.has(id)) return { ok: false, code: 1 };
          await jitter(140);
          p = Math.min(100, p + 1 + Math.random() * 4);
          toolsCh.emit({ id, type: 'progress', pct: p });
          if (Math.random() < 0.18 || p === 100) toolsCh.emit({ id, type: 'line', line: script.progress(p) });
        }
        for (const line of script.outro) {
          await jitter(300);
          toolsCh.emit({ id, type: 'line', line });
        }
        return { ok: true, code: 0 };
      },
      cancel(id) {
        cancelled.add(id);
      },
      async launch() {
        return { ok: true };
      },
      async getDns() {
        await jitter(400);
        return structuredClone(dns);
      },
      async setDns(id) {
        await jitter(700);
        const provider = DNS_MAP.get(id);
        dns = {
          adapters: dns.adapters.map((a) => ({ ...a, servers: provider.servers.length ? provider.servers : ['192.168.1.1'] })),
          provider: id,
        };
        return structuredClone(dns);
      },
      async restorePoint() {
        await jitter(2000);
        return { ok: true };
      },
    },

    shell: {
      openExternal: async (url) => window.open(url, '_blank', 'noopener'),
    },

    profile: {
      async save(json) {
        const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
        const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'tweakertool-profile.json' });
        a.click();
        URL.revokeObjectURL(a.href);
        return true;
      },
      open() {
        return new Promise((resolve) => {
          const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json' });
          input.onchange = async () => {
            try {
              resolve(JSON.parse(await input.files[0].text()));
            } catch {
              resolve(null);
            }
          };
          input.click();
        });
      },
    },
  };
}
