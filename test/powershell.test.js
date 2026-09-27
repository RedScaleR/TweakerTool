// Parses every PowerShell script TweakerTool can generate and exercises the
// stdin/base64 runner for real. Needs PowerShell: Windows PowerShell on
// Windows, or `pwsh` on PATH (or TWEAKER_POWERSHELL) elsewhere.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

function findPowerShell() {
  if (process.env.TWEAKER_POWERSHELL) return process.env.TWEAKER_POWERSHELL;
  if (process.platform === 'win32') return path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  try {
    return execFileSync('sh', ['-c', 'command -v pwsh'], { encoding: 'utf8' }).trim() || null;
  } catch {
    return null;
  }
}

const PS = findPowerShell();
if (PS) process.env.TWEAKER_POWERSHELL = PS;
const skip = PS ? false : 'PowerShell not available';

async function allScripts() {
  const { TWEAKS } = await import('../src/shared/tweaks.js');
  const { BLOAT } = await import('../src/shared/apps.js');
  const { DNS_PROVIDERS } = await import('../src/shared/tools.js');
  const engine = await import('../src/main/tweak-engine.js');
  const tools = await import('../src/main/tools.js');
  const apps = await import('../src/main/apps.js');
  const startup = await import('../src/main/startup.js');
  const { INFO_SCRIPT } = await import('../src/main/system-info.js');
  const { RECYCLE_QUERY } = await import('../src/main/cleaner.js');

  const fakeBackups = Object.fromEntries(
    TWEAKS.map((t) => [t.id, { values: t.ops.map((op, i) => (op.type === 'reg' ? (i % 2 ? { e: false } : { e: true, v: op.kind === 'DWord' ? 5 : 'x' }) : { e: true, v: 'demand' })) }]),
  );
  const scripts = {
    probe: engine.buildProbeScript(TWEAKS),
    apply: engine.buildApplyScript(TWEAKS),
    revert: engine.buildRevertScript(TWEAKS),
    revertWithBackups: engine.buildRevertScript(TWEAKS, fakeBackups),
    systemInfo: INFO_SCRIPT,
    startupList: startup.LIST_SCRIPT,
    startupSet: startup.setStartupScript({ hive: 'HKEY_CURRENT_USER', list: 'Run', valueName: "O'Brien Updater" }, false),
    recycleBin: RECYCLE_QUERY,
    restorePoint: tools.restorePointScript("Before 'tweaks'"),
    dnsGet: tools.DNS_GET_SCRIPT,
    bloatScanAdmin: apps.scanBloatScript(true),
    bloatScanUser: apps.scanBloatScript(false),
    bloatRemoveAdmin: apps.removeBloatScript(BLOAT.map((b) => b.id), true),
    bloatRemoveUser: apps.removeBloatScript(BLOAT.map((b) => b.id), false),
  };
  for (const [id, s] of Object.entries(tools.ACTION_SCRIPTS)) scripts[`action:${id}`] = s;
  for (const p of DNS_PROVIDERS) scripts[`dns:${p.id}`] = tools.setDnsScript(p.id);
  for (const t of TWEAKS) {
    for (const op of t.ops.filter((o) => o.type === 'ps')) {
      scripts[`${t.id}:check`] = op.check;
      scripts[`${t.id}:apply`] = op.apply;
      scripts[`${t.id}:revert`] = op.revert;
    }
  }
  return scripts;
}

test('every generated PowerShell script parses without errors', { skip }, async () => {
  const { PRELUDE } = await import('../src/main/powershell.js');
  const scripts = await allScripts();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-ps-'));
  const input = path.join(dir, 'scripts.json');
  fs.writeFileSync(input, JSON.stringify(Object.fromEntries(Object.entries(scripts).map(([k, v]) => [k, `${PRELUDE}\n${v}`]))));
  const checker = String.raw`
$scripts = Get-Content -Raw -LiteralPath $args[0] | ConvertFrom-Json
$bad = @()
foreach ($p in $scripts.PSObject.Properties) {
  $tokens = $null; $errors = $null
  [void][System.Management.Automation.Language.Parser]::ParseInput($p.Value, [ref]$tokens, [ref]$errors)
  foreach ($e in $errors) { $bad += "$($p.Name) line $($e.Extent.StartLineNumber): $($e.Message)" }
}
$bad -join [Environment]::NewLine`;
  const checkerFile = path.join(dir, 'check.ps1');
  fs.writeFileSync(checkerFile, checker);
  const out = execFileSync(PS, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', checkerFile, input], { encoding: 'utf8' }).trim();
  assert.equal(out, '', `PowerShell parse errors:\n${out}`);
  assert.ok(Object.keys(scripts).length > 30);
});

test('runner round-trips JSON with unicode through stdin', { skip }, async () => {
  const { psJson } = await import('../src/main/powershell.js');
  const value = await psJson('TTOut @{ a = 1; s = "héllo ✓ 日本"; list = @(1, 2, 3); nested = @{ ok = $true } }');
  assert.deepEqual(value, { a: 1, s: 'héllo ✓ 日本', list: [1, 2, 3], nested: { ok: true } });
});

test('runner surfaces script errors', { skip }, async () => {
  const { psJson } = await import('../src/main/powershell.js');
  await assert.rejects(psJson("throw 'kaboom'"), /kaboom/);
});

test('TTExec captures output and exit codes of native tools', { skip }, async () => {
  const { psJson } = await import('../src/main/powershell.js');
  const call = process.platform === 'win32' ? `TTExec 'cmd.exe' '/c echo hi & exit 3'` : `TTExec 'sh' '-c "echo hi; exit 3"'`;
  const value = await psJson(`$o = ${call}\nTTOut @{ o = $o; code = $LASTEXITCODE }`);
  assert.deepEqual(value, { o: 'hi', code: 3 });
});

test('TTCheck reports booleans and captures failures', { skip }, async () => {
  const { psJson } = await import('../src/main/powershell.js');
  const { ENGINE_FUNCTIONS } = await import('../src/main/tweak-engine.js');
  const value = await psJson(`${ENGINE_FUNCTIONS}\nTTOut @((TTCheck { 1 -eq 1 }), (TTCheck { 'x' -eq 'y' }), (TTCheck { throw 'nope' }))`);
  assert.deepEqual(value, [{ e: true, v: true }, { e: true, v: false }, { e: false, err: 'nope' }]);
});
