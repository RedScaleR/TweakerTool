// Toolbox actions, repair tools with live output, DNS switching and
// launchers for built-in Windows utilities.

import { spawn } from 'node:child_process';
import path from 'node:path';
import { DNS_MAP, DNS_PROVIDERS, LAUNCHER_MAP, TOOL_MAP } from '../shared/tools.js';
import { psJson, psq, streamProcess } from './powershell.js';

const SYSTEM32 = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32');
const SYSTEM_DRIVE = process.env.SystemDrive || 'C:';

export function restorePointScript(description) {
  return String.raw`
$key = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\SystemRestore'
$prev = (Get-ItemProperty -LiteralPath $key -Name SystemRestorePointCreationFrequency -ErrorAction SilentlyContinue).SystemRestorePointCreationFrequency
try {
  Enable-ComputerRestore -Drive "$env:SystemDrive\" -ErrorAction SilentlyContinue
  Set-ItemProperty -LiteralPath $key -Name SystemRestorePointCreationFrequency -Type DWord -Value 0
  Checkpoint-Computer -Description ${psq(description)} -RestorePointType MODIFY_SETTINGS -ErrorAction Stop
  TTOut @{ ok = $true }
} catch {
  TTOut @{ ok = $false; error = $_.Exception.Message }
} finally {
  if ($null -eq $prev) { Remove-ItemProperty -LiteralPath $key -Name SystemRestorePointCreationFrequency -ErrorAction SilentlyContinue }
  else { Set-ItemProperty -LiteralPath $key -Name SystemRestorePointCreationFrequency -Type DWord -Value $prev }
}
`;
}

export function createRestorePoint(description = 'TweakerTool checkpoint') {
  return psJson(restorePointScript(description), { timeout: 300_000 });
}

export const ACTION_SCRIPTS = {
  'flush-dns': String.raw`
Clear-DnsClientCache
TTOut @{ ok = $true; message = 'DNS resolver cache flushed.' }`,

  'reset-network': String.raw`
$a = TTExec 'netsh.exe' 'winsock reset'
$b = TTExec 'netsh.exe' 'int ip reset'
Clear-DnsClientCache
TTOut @{ ok = $true; message = 'Network stack reset. Restart your PC to finish.' }`,

  'restart-explorer': String.raw`
Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 1500
if (-not (Get-Process explorer -ErrorAction SilentlyContinue)) { Start-Process explorer.exe }
TTOut @{ ok = $true; message = 'Explorer restarted.' }`,

  'icon-cache': String.raw`
TTExec 'ie4uinit.exe' '-show' | Out-Null
Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 800
Remove-Item -LiteralPath "$env:LOCALAPPDATA\IconCache.db" -Force -ErrorAction SilentlyContinue
Get-ChildItem -LiteralPath "$env:LOCALAPPDATA\Microsoft\Windows\Explorer" -Filter 'iconcache_*.db' -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 700
if (-not (Get-Process explorer -ErrorAction SilentlyContinue)) { Start-Process explorer.exe }
TTOut @{ ok = $true; message = 'Icon cache rebuilt.' }`,

  'battery-report': String.raw`
$file = Join-Path $env:TEMP 'TweakerTool-battery-report.html'
$o = TTExec 'powercfg.exe' ('/batteryreport /output "' + $file + '"')
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $file)) { TTOut @{ ok = $false; error = 'No battery was found on this PC.' } }
else { TTOut @{ ok = $true; message = 'Battery report generated.'; open = $file } }`,

  'clear-event-logs': String.raw`
$logs = (TTExec 'wevtutil.exe' 'el') -split "\r?\n" | Where-Object { $_ }
$n = 0
foreach ($l in $logs) { TTExec 'wevtutil.exe' ('cl "' + $l + '"') | Out-Null; if ($LASTEXITCODE -eq 0) { $n++ } }
TTOut @{ ok = $true; message = "Cleared $n event logs." }`,

  'wu-reset': String.raw`
$services = 'wuauserv','bits','cryptsvc','msiserver'
Stop-Service -Name $services -Force -ErrorAction SilentlyContinue
foreach ($p in @("$env:SystemRoot\SoftwareDistribution", "$env:SystemRoot\System32\catroot2")) {
  if (Test-Path -LiteralPath "$p.bak") { Remove-Item -LiteralPath "$p.bak" -Recurse -Force -ErrorAction SilentlyContinue }
  if (Test-Path -LiteralPath $p) { Rename-Item -LiteralPath $p -NewName ((Split-Path $p -Leaf) + '.bak') -ErrorAction SilentlyContinue }
}
Start-Service -Name $services -ErrorAction SilentlyContinue
TTOut @{ ok = $true; message = 'Windows Update components reset.' }`,
};

const STREAMS = {
  sfc: () => [path.join(SYSTEM32, 'sfc.exe'), ['/scannow']],
  dism: () => [path.join(SYSTEM32, 'Dism.exe'), ['/Online', '/Cleanup-Image', '/RestoreHealth']],
  'component-cleanup': () => [path.join(SYSTEM32, 'Dism.exe'), ['/Online', '/Cleanup-Image', '/StartComponentCleanup']],
  chkdsk: () => [path.join(SYSTEM32, 'chkdsk.exe'), [SYSTEM_DRIVE, '/scan']],
};

export async function runAction(id) {
  if (id === 'restore-point') return createRestorePoint();
  if (!TOOL_MAP.has(id) || !ACTION_SCRIPTS[id]) throw new Error(`Unknown tool "${id}"`);
  return psJson(ACTION_SCRIPTS[id], { timeout: 300_000 });
}

const running = new Map();

export async function runStream(id, onEvent) {
  if (!STREAMS[id]) throw new Error(`Unknown tool "${id}"`);
  if (running.has(id)) throw new Error('This tool is already running');
  const [file, args] = STREAMS[id]();
  const run = streamProcess(file, args, {
    onLine: (line) => onEvent({ id, type: 'line', line }),
    onProgress: (pct) => onEvent({ id, type: 'progress', pct }),
  });
  running.set(id, run);
  try {
    const code = await run.promise;
    return { ok: code === 0, code };
  } finally {
    running.delete(id);
  }
}

export function cancelStream(id) {
  running.get(id)?.cancel();
}

export const DNS_GET_SCRIPT = String.raw`
$out = New-Object System.Collections.ArrayList
Get-NetAdapter -Physical -ErrorAction SilentlyContinue | Where-Object Status -eq 'Up' | ForEach-Object {
  $dns = @((Get-DnsClientServerAddress -InterfaceIndex $_.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue).ServerAddresses)
  [void]$out.Add(@{ name = $_.Name; description = $_.InterfaceDescription; servers = $dns })
}
TTOut @($out)`;

export async function getDns() {
  const adapters = await psJson(DNS_GET_SCRIPT);
  const list = Array.isArray(adapters) ? adapters : [adapters];
  const first = list[0]?.servers || [];
  const match = DNS_PROVIDERS.find((p) => p.servers.length && p.servers[0] === first[0]);
  return { adapters: list, provider: match?.id || (first.length ? 'custom' : 'auto') };
}

export function setDnsScript(providerId) {
  const provider = DNS_MAP.get(providerId);
  if (!provider) throw new Error('Unknown DNS provider');
  const assign = provider.servers.length
    ? `Set-DnsClientServerAddress -InterfaceIndex $_.ifIndex -ServerAddresses @(${provider.servers.map(psq).join(',')})`
    : 'Set-DnsClientServerAddress -InterfaceIndex $_.ifIndex -ResetServerAddresses';
  return String.raw`
Get-NetAdapter -Physical -ErrorAction SilentlyContinue | Where-Object Status -eq 'Up' | ForEach-Object { ${assign} }
Clear-DnsClientCache
TTOut @{ ok = $true }`;
}

export async function setDns(providerId) {
  await psJson(setDnsScript(providerId));
  return getDns();
}

export function launch(id) {
  const l = LAUNCHER_MAP.get(id);
  if (!l) throw new Error('Unknown launcher');
  // Catalog commands are fixed strings, so a verbatim command line is safe here
  // and lets ShellExecute handle .msc/.cpl associations and UAC prompts.
  const child = spawn('cmd.exe', ['/d', '/s', '/c', `"start "" ${l.command}"`], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    windowsVerbatimArguments: true,
  });
  child.unref();
  return { ok: true };
}
