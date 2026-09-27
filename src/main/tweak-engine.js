// Turns declarative tweak operations into PowerShell, and PowerShell results
// back into tweak states. Before a tweak is applied for the first time the
// current values are snapshotted so revert restores exactly what was there.

import { needsAdmin, TWEAKS, TWEAK_MAP } from '../shared/tweaks.js';
import { psq } from './powershell.js';

const HIVES = {
  HKLM: 'HKEY_LOCAL_MACHINE',
  HKCU: 'HKEY_CURRENT_USER',
  HKU: 'HKEY_USERS',
  HKCR: 'HKEY_CLASSES_ROOT',
};
const SERVICE_MODES = new Set(['auto', 'delayed-auto', 'demand', 'disabled']);

export function fullKey(key) {
  const i = key.indexOf('\\');
  const hive = HIVES[key.slice(0, i)];
  if (!hive) throw new Error(`Unknown registry hive in "${key}"`);
  return hive + key.slice(i);
}

export const ENGINE_FUNCTIONS = String.raw`
function TTReg($k, $n) {
  try { $v = [Microsoft.Win32.Registry]::GetValue($k, $n, $null) } catch { $v = $null }
  if ($null -eq $v) { return @{ e = $false } }
  if ($v -is [byte[]]) { return @{ e = $true; b = $true; v = [Convert]::ToBase64String($v) } }
  return @{ e = $true; v = $v }
}
function TTSvc($n) {
  $k = "HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Services\$n"
  $s = [Microsoft.Win32.Registry]::GetValue($k, 'Start', $null)
  if ($null -eq $s) { return @{ e = $false } }
  $d = [Microsoft.Win32.Registry]::GetValue($k, 'DelayedAutostart', 0)
  $m = switch ($s) { 2 { if ($d -eq 1) { 'delayed-auto' } else { 'auto' } } 3 { 'demand' } 4 { 'disabled' } default { 'system' } }
  return @{ e = $true; v = $m }
}
function TTTask($p, $n) {
  $t = Get-ScheduledTask -TaskPath $p -TaskName $n -ErrorAction SilentlyContinue
  if (-not $t) { return @{ e = $false } }
  return @{ e = $true; v = [string]$t.State }
}
function TTCheck([scriptblock]$b) {
  try {
    $ErrorActionPreference = 'Stop'
    $r = & $b
    return @{ e = $true; v = [bool]($r | Select-Object -Last 1) }
  } catch { return @{ e = $false; err = $_.Exception.Message } }
}
function TTSet($k, $n, $kind, $v) {
  [Microsoft.Win32.Registry]::SetValue($k, $n, $v, [Microsoft.Win32.RegistryValueKind]::$kind)
}
function TTDel($k, $n) {
  $i = $k.IndexOf('\')
  $base = switch ($k.Substring(0, $i)) {
    'HKEY_LOCAL_MACHINE' { [Microsoft.Win32.Registry]::LocalMachine }
    'HKEY_CURRENT_USER' { [Microsoft.Win32.Registry]::CurrentUser }
    'HKEY_USERS' { [Microsoft.Win32.Registry]::Users }
    'HKEY_CLASSES_ROOT' { [Microsoft.Win32.Registry]::ClassesRoot }
  }
  $key = $base.OpenSubKey($k.Substring($i + 1), $true)
  if ($key) { try { $key.DeleteValue($n, $false) } finally { $key.Close() } }
}
function TTSetSvc($n, $m) {
  if (-not (Test-Path -LiteralPath "HKLM:\SYSTEM\CurrentControlSet\Services\$n")) { return }
  $o = TTExec 'sc.exe' "config $n start= $m"
  if ($LASTEXITCODE -ne 0) { throw "Could not set service $n to $($m): $o" }
  if ($m -eq 'disabled') { Stop-Service -Name $n -Force -ErrorAction SilentlyContinue }
}
function TTSetTask($p, $n, [bool]$enable) {
  $t = Get-ScheduledTask -TaskPath $p -TaskName $n -ErrorAction SilentlyContinue
  if (-not $t) { return }
  if ($enable) { Enable-ScheduledTask -InputObject $t | Out-Null } else { Disable-ScheduledTask -InputObject $t | Out-Null }
}
`;

function psValue(kind, value) {
  return kind === 'DWord' ? `([int]${value | 0})` : psq(value);
}

function probeFor(op) {
  switch (op.type) {
    case 'reg':
      return `TTReg ${psq(fullKey(op.key))} ${psq(op.name)}`;
    case 'svc':
      return `TTSvc ${psq(op.name)}`;
    case 'task':
      return `TTTask ${psq(op.path)} ${psq(op.name)}`;
    case 'ps':
      return `TTCheck {\n${op.check}\n}`;
    default:
      throw new Error(`Unknown op type ${op.type}`);
  }
}

/** Script that reads the current value of every op, in order, as a flat JSON array. */
export function buildProbeScript(tweaks) {
  const lines = ['$__r = New-Object System.Collections.ArrayList'];
  for (const t of tweaks) for (const op of t.ops) lines.push(`[void]$__r.Add((${probeFor(op)}))`);
  lines.push('TTOut @($__r)');
  return `${ENGINE_FUNCTIONS}\n${lines.join('\n')}`;
}

function setReg(op, value) {
  return `TTSet ${psq(fullKey(op.key))} ${psq(op.name)} '${op.kind}' ${psValue(op.kind, value)}`;
}

function delReg(op) {
  return `TTDel ${psq(fullKey(op.key))} ${psq(op.name)}`;
}

function applyOp(op) {
  switch (op.type) {
    case 'reg':
      return setReg(op, op.value);
    case 'svc':
      return `TTSetSvc ${psq(op.name)} '${op.start}'`;
    case 'task':
      return `TTSetTask ${psq(op.path)} ${psq(op.name)} $false`;
    case 'ps':
      return `& {\n${op.apply}\n}`;
  }
}

function backupMatchesKind(op, snap) {
  if (!snap?.e || snap.b) return false;
  return op.kind === 'DWord' ? typeof snap.v === 'number' : typeof snap.v === 'string';
}

function revertOp(op, snap) {
  switch (op.type) {
    case 'reg':
      if (snap && !snap.e) return delReg(op);
      if (backupMatchesKind(op, snap)) return setReg(op, snap.v);
      return op.revert === null ? delReg(op) : setReg(op, op.revert);
    case 'svc': {
      const mode = snap?.e && SERVICE_MODES.has(snap.v) ? snap.v : op.revert;
      return `TTSetSvc ${psq(op.name)} '${mode}'`;
    }
    case 'task': {
      const enable = !(snap?.e && snap.v === 'Disabled');
      return `TTSetTask ${psq(op.path)} ${psq(op.name)} $${enable}`;
    }
    case 'ps':
      return `& {\n${op.revert}\n}`;
  }
}

function block(id, statements) {
  return [
    'try {',
    ...statements,
    `  $__res[${psq(id)}] = @{ ok = $true }`,
    '} catch {',
    `  $__res[${psq(id)}] = @{ ok = $false; error = $_.Exception.Message }`,
    '}',
  ].join('\n');
}

function wrap(blocks) {
  return `${ENGINE_FUNCTIONS}\n$ErrorActionPreference = 'Stop'\n$__res = @{}\n${blocks.join('\n')}\nTTOut $__res`;
}

export function buildApplyScript(tweaks) {
  return wrap(tweaks.map((t) => block(t.id, t.ops.map(applyOp))));
}

export function buildRevertScript(tweaks, backups = {}) {
  return wrap(tweaks.map((t) => block(t.id, t.ops.map((op, i) => revertOp(op, backups[t.id]?.values?.[i])))));
}

function sameValue(op, v) {
  if (op.kind === 'DWord') return typeof v === 'number' && (v >>> 0) === (op.value >>> 0);
  return String(v) === String(op.value);
}

function opState(op, r) {
  if (!r) return 'unknown';
  switch (op.type) {
    case 'reg':
      return r.e && sameValue(op, r.v) ? 'applied' : 'default';
    case 'svc':
      if (!r.e) return 'na';
      return r.v === op.start ? 'applied' : 'default';
    case 'task':
      if (!r.e) return 'na';
      return r.v === 'Disabled' ? 'applied' : 'default';
    case 'ps':
      if (!r.e) return 'unknown';
      return r.v ? 'applied' : 'default';
  }
  return 'unknown';
}

/** Collapse per-op probe results into a tweak state. */
export function evaluate(tweak, results, build) {
  if (tweak.minBuild && build && build < tweak.minBuild) {
    return { state: 'unavailable', reason: 'Requires Windows 11' };
  }
  let applicable = 0;
  let applied = 0;
  for (let i = 0; i < tweak.ops.length; i++) {
    const s = opState(tweak.ops[i], results[i]);
    if (s === 'na') continue;
    if (s === 'unknown') {
      return { state: 'unavailable', reason: results[i]?.err || 'Not supported on this PC' };
    }
    applicable++;
    if (s === 'applied') applied++;
  }
  if (applicable === 0) return { state: 'unavailable', reason: 'Not present on this PC' };
  if (applied === applicable) return { state: 'applied' };
  return { state: applied === 0 ? 'default' : 'partial' };
}

function splitResults(tweaks, flat) {
  const out = new Map();
  let i = 0;
  for (const t of tweaks) {
    out.set(t.id, flat.slice(i, i + t.ops.length));
    i += t.ops.length;
  }
  return out;
}

function resolve(ids) {
  if (!ids) return TWEAKS;
  const list = [];
  for (const id of ids) {
    const t = TWEAK_MAP.get(id);
    if (!t) throw new Error(`Unknown tweak "${id}"`);
    list.push(t);
  }
  return list;
}

export class TweakEngine {
  /**
   * @param {object} deps
   * @param {(script: string, opts?: object) => Promise<any>} deps.runJson
   * @param {{ data: Record<string, any>, save: () => void }} deps.backups
   * @param {() => number} deps.getBuild
   * @param {() => boolean} deps.isAdmin
   */
  constructor({ runJson, backups, getBuild, isAdmin }) {
    this.runJson = runJson;
    this.backups = backups;
    this.getBuild = getBuild;
    this.isAdmin = isAdmin;
  }

  async probe(tweaks) {
    if (!tweaks.length) return new Map();
    const flat = await this.runJson(buildProbeScript(tweaks), { timeout: 120_000 });
    return splitResults(tweaks, Array.isArray(flat) ? flat : [flat]);
  }

  async status(ids) {
    const tweaks = resolve(ids);
    const results = await this.probe(tweaks);
    const build = this.getBuild();
    const out = {};
    for (const t of tweaks) {
      out[t.id] = { ...evaluate(t, results.get(t.id), build), backup: Boolean(this.backups.data[t.id]) };
    }
    return out;
  }

  guard(tweaks) {
    if (!this.isAdmin() && tweaks.some(needsAdmin)) {
      throw new Error('Administrator rights are required. Relaunch TweakerTool as administrator.');
    }
  }

  async apply(ids) {
    const tweaks = resolve(ids);
    this.guard(tweaks);
    const build = this.getBuild();

    const unsnapped = tweaks.filter((t) => !this.backups.data[t.id]);
    const snaps = await this.probe(unsnapped);
    for (const t of unsnapped) {
      const values = snaps.get(t.id);
      if (evaluate(t, values, build).state !== 'applied') {
        this.backups.data[t.id] = { at: Date.now(), values };
      }
    }
    this.backups.save();

    const results = await this.runJson(buildApplyScript(tweaks), { timeout: 300_000 });
    const states = await this.status(ids);
    return { results, states };
  }

  async revert(ids) {
    const tweaks = resolve(ids);
    this.guard(tweaks);
    const results = await this.runJson(buildRevertScript(tweaks, this.backups.data), { timeout: 300_000 });
    for (const t of tweaks) if (results[t.id]?.ok) delete this.backups.data[t.id];
    this.backups.save();
    const states = await this.status(ids);
    return { results, states };
  }
}
