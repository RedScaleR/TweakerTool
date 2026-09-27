import assert from 'node:assert/strict';
import { test } from 'node:test';

import { psq } from '../src/main/powershell.js';
import { buildApplyScript, buildProbeScript, buildRevertScript, evaluate, fullKey, TweakEngine } from '../src/main/tweak-engine.js';
import { needsAdmin, TWEAK_MAP, TWEAKS } from '../src/shared/tweaks.js';

test('psq escapes all PowerShell single-quote characters', () => {
  assert.equal(psq("it's"), "'it''s'");
  assert.equal(psq('a\u2019b'), "'a\u2019\u2019b'");
  assert.equal(psq('$env:TEMP; rm -rf'), "'$env:TEMP; rm -rf'");
});

test('fullKey expands hive short names', () => {
  assert.equal(fullKey('HKCU\\Software\\X'), 'HKEY_CURRENT_USER\\Software\\X');
  assert.equal(fullKey('HKU\\.DEFAULT\\X'), 'HKEY_USERS\\.DEFAULT\\X');
  assert.throws(() => fullKey('HKXX\\Software'));
});

test('probe script has one probe per op, in order', () => {
  const t = TWEAK_MAP.get('priv-telemetry');
  const script = buildProbeScript([t]);
  const probes = script.split('\n').filter((l) => l.startsWith('[void]$__r.Add('));
  assert.equal(probes.length, t.ops.length);
  assert.match(probes[0], /TTReg 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection' 'AllowTelemetry'/);
  assert.match(probes[2], /TTSvc 'DiagTrack'/);
});

test('apply script writes DWORDs as signed Int32', () => {
  const script = buildApplyScript([TWEAK_MAP.get('game-network-throttling')]);
  assert.match(script, /'NetworkThrottlingIndex' 'DWord' \(\[int\]-1\)/);
});

test('apply script wraps every tweak in its own try/catch', () => {
  const tweaks = TWEAKS.slice(0, 5);
  const script = buildApplyScript(tweaks);
  for (const t of tweaks) assert.ok(script.includes(`$__res['${t.id}'] = @{ ok = $true }`));
  assert.ok(script.includes("$ErrorActionPreference = 'Stop'"));
});

test('revert restores snapshot values, deletes values that did not exist, else uses defaults', () => {
  const t = TWEAK_MAP.get('game-dvr');
  const noBackup = buildRevertScript([t]);
  assert.match(noBackup, /TTSet 'HKEY_CURRENT_USER\\System\\GameConfigStore' 'GameDVR_Enabled' 'DWord' \(\[int\]1\)/);
  assert.match(noBackup, /TTDel 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows\\GameDVR' 'AllowGameDVR'/);

  const backups = { 'game-dvr': { values: [{ e: true, v: 7 }, { e: false }, { e: true, v: 3 }] } };
  const withBackup = buildRevertScript([t], backups);
  assert.match(withBackup, /'GameDVR_Enabled' 'DWord' \(\[int\]7\)/);
  assert.match(withBackup, /TTDel 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR' 'AppCaptureEnabled'/);
  assert.match(withBackup, /'AllowGameDVR' 'DWord' \(\[int\]3\)/);
});

test('revert ignores snapshots of the wrong type', () => {
  const t = TWEAK_MAP.get('perf-menu-delay');
  const script = buildRevertScript([t], { 'perf-menu-delay': { values: [{ e: true, v: 42 }] } });
  assert.match(script, /'MenuShowDelay' 'String' '400'/);
});

test('service revert uses the snapshotted start mode', () => {
  const t = TWEAK_MAP.get('perf-sysmain');
  assert.match(buildRevertScript([t]), /TTSetSvc 'SysMain' 'auto'/);
  assert.match(buildRevertScript([t], { 'perf-sysmain': { values: [{ e: true, v: 'demand' }] } }), /TTSetSvc 'SysMain' 'demand'/);
});

test('evaluate: applied, default, partial, unavailable', () => {
  const t = TWEAK_MAP.get('priv-telemetry');
  const on = [{ e: true, v: 0 }, { e: true, v: 0 }, { e: true, v: 'disabled' }, { e: true, v: 'disabled' }];
  assert.equal(evaluate(t, on, 26100).state, 'applied');
  const off = [{ e: false }, { e: false }, { e: true, v: 'auto' }, { e: true, v: 'demand' }];
  assert.equal(evaluate(t, off, 26100).state, 'default');
  const half = [{ e: true, v: 0 }, { e: false }, { e: true, v: 'auto' }, { e: true, v: 'demand' }];
  assert.equal(evaluate(t, half, 26100).state, 'partial');
  const noSvc = [{ e: true, v: 0 }, { e: true, v: 0 }, { e: false }, { e: false }];
  assert.equal(evaluate(t, noSvc, 26100).state, 'applied', 'missing services are ignored');
});

test('evaluate: DWORD comparison is unsigned-safe', () => {
  const t = TWEAK_MAP.get('game-network-throttling');
  assert.equal(evaluate(t, [{ e: true, v: -1 }], 26100).state, 'applied');
  assert.equal(evaluate(t, [{ e: true, v: 10 }], 26100).state, 'default');
});

test('evaluate: Windows 11 only tweaks are unavailable on Windows 10', () => {
  const t = TWEAK_MAP.get('ui-classic-menu');
  assert.equal(evaluate(t, [{ e: true, v: true }], 19045).state, 'unavailable');
});

test('evaluate: failing custom check makes the tweak unavailable with a reason', () => {
  const t = TWEAK_MAP.get('net-teredo');
  const r = evaluate(t, [{ e: false, err: 'cmdlet not found' }], 26100);
  assert.equal(r.state, 'unavailable');
  assert.equal(r.reason, 'cmdlet not found');
});

test('needsAdmin is false only for HKCU-only tweaks', () => {
  assert.equal(needsAdmin(TWEAK_MAP.get('ui-file-ext')), false);
  assert.equal(needsAdmin(TWEAK_MAP.get('priv-telemetry')), true);
  assert.equal(needsAdmin(TWEAK_MAP.get('net-smb1')), true);
});

function fakeEngine({ applied = false, admin = true } = {}) {
  const calls = [];
  const backups = { data: {}, save() {} };
  let isOn = applied;
  const runJson = async (script) => {
    calls.push(script);
    if (script.includes('$__r = New-Object')) {
      const n = script.split('\n').filter((l) => l.startsWith('[void]$__r.Add(')).length;
      return Array.from({ length: n }, () => (isOn ? { e: true, v: 0 } : { e: true, v: 1 }));
    }
    const ids = [...script.matchAll(/\$__res\['([^']+)'\] = @\{ ok = \$true \}/g)].map((m) => m[1]);
    isOn = !script.includes("'DWord' ([int]1)");
    return Object.fromEntries(ids.map((id) => [id, { ok: true }]));
  };
  const engine = new TweakEngine({ runJson, backups, getBuild: () => 26100, isAdmin: () => admin });
  return { engine, calls, backups };
}

test('engine snapshots before first apply and clears snapshot on revert', async () => {
  const { engine, backups } = fakeEngine();
  const res = await engine.apply(['ui-file-ext']);
  assert.equal(res.results['ui-file-ext'].ok, true);
  assert.deepEqual(backups.data['ui-file-ext'].values, [{ e: true, v: 1 }]);
  await engine.revert(['ui-file-ext']);
  assert.equal(backups.data['ui-file-ext'], undefined);
});

test('engine does not snapshot a tweak that is already applied', async () => {
  const { engine, backups } = fakeEngine({ applied: true });
  await engine.apply(['ui-file-ext']);
  assert.equal(backups.data['ui-file-ext'], undefined);
});

test('engine refuses machine-wide tweaks without admin rights', async () => {
  const { engine } = fakeEngine({ admin: false });
  await assert.rejects(engine.apply(['priv-telemetry']), /Administrator/);
  await engine.apply(['ui-file-ext']);
});

test('engine rejects unknown tweak ids', async () => {
  const { engine } = fakeEngine();
  await assert.rejects(engine.apply(['nope; Remove-Item C:\\']), /Unknown tweak/);
});
