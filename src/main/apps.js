// winget installs and Appx debloating.

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { APP_MAP, BLOAT, BLOAT_MAP } from '../shared/apps.js';
import { psJson, psq, streamProcess } from './powershell.js';

// winget exit codes that still mean "the app is there".
const OK_CODES = new Set([0, 0x8a15002b, 0x8a150061]);

export function wingetVersion() {
  return new Promise((resolve) => {
    let out = '';
    const child = spawn('winget', ['--version'], { windowsHide: true });
    const timer = setTimeout(() => child.kill(), 15_000);
    child.stdout.on('data', (d) => (out += d));
    child.on('error', () => resolve(null));
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0 ? out.trim() : null);
    });
  });
}

/** Package IDs of installed apps that winget knows about. */
export async function installedApps() {
  const file = path.join(os.tmpdir(), `tweakertool-winget-${process.pid}.json`);
  const run = streamProcess('winget', [
    'export', '-o', file, '--source', 'winget', '--accept-source-agreements', '--disable-interactivity',
  ]);
  await run.promise;
  try {
    const data = JSON.parse(await fs.readFile(file, 'utf8'));
    const ids = [];
    for (const src of data.Sources || []) for (const pkg of src.Packages || []) ids.push(pkg.PackageIdentifier);
    return ids.filter((id) => APP_MAP.has(id));
  } catch {
    return [];
  } finally {
    fs.unlink(file).catch(() => {});
  }
}

async function wingetAction(verb, id, onEvent) {
  if (!APP_MAP.has(id)) throw new Error(`Unknown app "${id}"`);
  const args = [verb, '--id', id, '-e', '--source', 'winget', '--silent', '--accept-source-agreements', '--disable-interactivity'];
  if (verb === 'install') args.push('--accept-package-agreements');
  const run = streamProcess('winget', args, {
    onLine: (line) => onEvent({ id, line }),
    onProgress: (pct) => onEvent({ id, pct }),
  });
  return run.promise.then((code) => {
    const ok = code !== null && OK_CODES.has(code >>> 0);
    return { ok, code, error: ok ? undefined : `winget exited with code 0x${(code >>> 0).toString(16)}` };
  });
}

export const installApp = (id, onEvent) => wingetAction('install', id, onEvent);
export const uninstallApp = (id, onEvent) => wingetAction('uninstall', id, onEvent);

export function scanBloatScript(isAdmin) {
  const patterns = BLOAT.map((b) => psq(b.id)).join(',');
  return String.raw`
$pkgs = @(${isAdmin ? 'Get-AppxPackage -AllUsers' : 'Get-AppxPackage'} -ErrorAction SilentlyContinue)
$out = @{}
foreach ($p in @(${patterns})) {
  $found = @($pkgs | Where-Object { $_.Name -like $p } | Select-Object -ExpandProperty Name -Unique)
  $out[$p] = $found
}
TTOut $out
`;
}

export async function scanBloat(isAdmin) {
  const found = await psJson(scanBloatScript(isAdmin), { timeout: 120_000 });
  return BLOAT.map((b) => ({ id: b.id, installed: (found[b.id] || []).length > 0, packages: found[b.id] || [] }));
}

export function removeBloatScript(ids, isAdmin) {
  for (const id of ids) if (!BLOAT_MAP.has(id)) throw new Error(`Unknown package "${id}"`);
  const blocks = ids.map((id) => String.raw`
try {
  ${isAdmin
    ? `Get-AppxPackage -AllUsers -Name ${psq(id)} | Remove-AppxPackage -AllUsers -ErrorAction Stop
  Get-AppxProvisionedPackage -Online | Where-Object { $_.DisplayName -like ${psq(id)} } | Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue | Out-Null`
    : `Get-AppxPackage -Name ${psq(id)} | Remove-AppxPackage -ErrorAction Stop`}
  $res[${psq(id)}] = @{ ok = $true }
} catch { $res[${psq(id)}] = @{ ok = $false; error = $_.Exception.Message } }`);
  return `$res = @{}\n${blocks.join('\n')}\nTTOut $res`;
}

export function removeBloat(ids, isAdmin) {
  return psJson(removeBloatScript(ids, isAdmin), { timeout: 600_000 });
}
