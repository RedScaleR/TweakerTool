// Toolbox: one-shot maintenance actions, long-running repair tools,
// DNS presets and shortcuts to built-in Windows utilities.

export const TOOL_GROUPS = [
  { id: 'repair', name: 'Repair & Maintenance', icon: 'stethoscope' },
  { id: 'network', name: 'Network', icon: 'wifi' },
  { id: 'shell', name: 'Explorer & Diagnostics', icon: 'monitor-cog' },
];

// kind: 'action' finishes in seconds; 'stream' shows a live console.
export const TOOLS = [
  {
    id: 'restore-point',
    group: 'repair',
    kind: 'action',
    title: 'Create Restore Point',
    description: 'Snapshot system settings so you can roll back from Windows Recovery.',
    icon: 'life-buoy',
    admin: true,
  },
  {
    id: 'sfc',
    group: 'repair',
    kind: 'stream',
    title: 'System File Checker',
    description: 'Scans every protected Windows file and repairs corrupted ones.',
    icon: 'shield-check',
    duration: '5–15 min',
    admin: true,
  },
  {
    id: 'dism',
    group: 'repair',
    kind: 'stream',
    title: 'Repair Windows Image',
    description: 'DISM RestoreHealth downloads clean copies of damaged system components.',
    icon: 'stethoscope',
    duration: '10–30 min',
    admin: true,
  },
  {
    id: 'component-cleanup',
    group: 'repair',
    kind: 'stream',
    title: 'Clean Component Store',
    description: 'Removes superseded versions of updated Windows components from WinSxS.',
    icon: 'package-minus',
    duration: '5–20 min',
    admin: true,
  },
  {
    id: 'chkdsk',
    group: 'repair',
    kind: 'stream',
    title: 'Scan System Drive',
    description: 'Online CHKDSK scan of the Windows drive for file-system errors.',
    icon: 'hard-drive',
    duration: '1–5 min',
    admin: true,
  },
  {
    id: 'wu-reset',
    group: 'repair',
    kind: 'action',
    title: 'Reset Windows Update',
    description: 'Stops update services and rebuilds the SoftwareDistribution and catroot2 folders.',
    icon: 'refresh-cw',
    admin: true,
  },

  {
    id: 'flush-dns',
    group: 'network',
    kind: 'action',
    title: 'Flush DNS Cache',
    description: 'Clears cached DNS lookups. Fixes sites that moved or will not resolve.',
    icon: 'eraser',
  },
  {
    id: 'reset-network',
    group: 'network',
    kind: 'action',
    title: 'Reset Network Stack',
    description: 'Resets Winsock and TCP/IP to defaults. Fixes most "connected, no internet" issues.',
    icon: 'router',
    admin: true,
    reboot: true,
  },

  {
    id: 'restart-explorer',
    group: 'shell',
    kind: 'action',
    title: 'Restart Explorer',
    description: 'Reloads the taskbar, Start and desktop — applies Explorer tweaks instantly.',
    icon: 'rotate-cw',
  },
  {
    id: 'icon-cache',
    group: 'shell',
    kind: 'action',
    title: 'Rebuild Icon Cache',
    description: 'Fixes blank, wrong or outdated icons on the desktop and in Explorer.',
    icon: 'image',
  },
  {
    id: 'battery-report',
    group: 'shell',
    kind: 'action',
    title: 'Battery Health Report',
    description: 'Generates a report of design vs. actual capacity and charge history.',
    icon: 'battery-medium',
  },
  {
    id: 'clear-event-logs',
    group: 'shell',
    kind: 'action',
    title: 'Clear Event Logs',
    description: 'Empties every Windows event log. Useful before troubleshooting a fresh issue.',
    icon: 'scroll-text',
    admin: true,
  },
];

export const TOOL_MAP = new Map(TOOLS.map((t) => [t.id, t]));

export const DNS_PROVIDERS = [
  { id: 'auto', name: 'Automatic', note: 'Use your router / ISP', servers: [] },
  { id: 'cloudflare', name: 'Cloudflare', note: 'Fastest resolver', servers: ['1.1.1.1', '1.0.0.1'] },
  { id: 'google', name: 'Google', note: 'Reliable everywhere', servers: ['8.8.8.8', '8.8.4.4'] },
  { id: 'quad9', name: 'Quad9', note: 'Blocks malware', servers: ['9.9.9.9', '149.112.112.112'] },
  { id: 'adguard', name: 'AdGuard', note: 'Blocks ads & trackers', servers: ['94.140.14.14', '94.140.15.15'] },
];

export const DNS_MAP = new Map(DNS_PROVIDERS.map((d) => [d.id, d]));

export const LAUNCHERS = [
  { id: 'taskmgr', name: 'Task Manager', icon: 'activity', command: 'taskmgr.exe' },
  { id: 'devmgmt', name: 'Device Manager', icon: 'cpu', command: 'devmgmt.msc' },
  { id: 'services', name: 'Services', icon: 'cog', command: 'services.msc' },
  { id: 'regedit', name: 'Registry Editor', icon: 'binary', command: 'regedit.exe' },
  { id: 'diskmgmt', name: 'Disk Management', icon: 'hard-drive', command: 'diskmgmt.msc' },
  { id: 'eventvwr', name: 'Event Viewer', icon: 'scroll-text', command: 'eventvwr.msc' },
  { id: 'resmon', name: 'Resource Monitor', icon: 'gauge', command: 'resmon.exe' },
  { id: 'msconfig', name: 'System Configuration', icon: 'sliders-horizontal', command: 'msconfig.exe' },
  { id: 'sysdm', name: 'System Properties', icon: 'monitor-cog', command: 'sysdm.cpl' },
  { id: 'ncpa', name: 'Network Connections', icon: 'network', command: 'ncpa.cpl' },
  { id: 'appwiz', name: 'Programs & Features', icon: 'package', command: 'appwiz.cpl' },
  { id: 'powercfg', name: 'Power Options', icon: 'battery-charging', command: 'powercfg.cpl' },
  { id: 'env', name: 'Environment Variables', icon: 'variable', command: 'rundll32.exe sysdm.cpl,EditEnvironmentVariables' },
  { id: 'control', name: 'Control Panel', icon: 'layout-grid', command: 'control.exe' },
];

export const LAUNCHER_MAP = new Map(LAUNCHERS.map((l) => [l.id, l]));
