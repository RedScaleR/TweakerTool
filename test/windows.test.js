// End-to-end checks against a real Windows install. They change and then
// restore real settings, so they only run when TT_INTEGRATION=1 (CI).

import assert from 'node:assert/strict';
import { test } from 'node:test';

const skip = process.platform !== 'win32' || process.env.TT_INTEGRATION !== '1' ? 'Windows integration tests are opt-in' : false;

async function makeEngine() {
  const { psJson } = await import('../src/main/powershell.js');
  const { TweakEngine } = await import('../src/main/tweak-engine.js');
  const { getBuild } = await import('../src/main/system-info.js');
  const backups = { data: {}, save() {} };
  const engine = new TweakEngine({ runJson: psJson, backups, getBuild, isAdmin: () => true });
  return { engine, backups, psJson };
}

test('status resolves for every tweak', { skip, timeout: 300_000 }, async (t) => {
  const { engine } = await makeEngine();
  const { TWEAKS } = await import('../src/shared/tweaks.js');
  const status = await engine.status();
  for (const tw of TWEAKS) {
    assert.ok(status[tw.id], `${tw.id} missing from status`);
    assert.ok(['applied', 'default', 'partial', 'unavailable'].includes(status[tw.id].state));
  }
  const summary = {};
  for (const s of Object.values(status)) summary[s.state] = (summary[s.state] || 0) + 1;
  t.diagnostic(JSON.stringify(summary));
  const unavailable = Object.entries(status).filter(([, s]) => s.state === 'unavailable');
  for (const [id, s] of unavailable) t.diagnostic(`unavailable: ${id} — ${s.reason}`);
});

const ROUND_TRIP = [
  'perf-menu-delay',
  'ui-file-ext',
  'ui-hidden-files',
  'ui-this-pc',
  'game-mouse-accel',
  'game-sticky-keys',
  'priv-suggestions',
  'ui-shortcut-suffix',
  'sys-long-paths',
  'sys-bsod',
  'net-llmnr',
  'game-network-throttling',
  'priv-telemetry-tasks',
  'sys-maps',
  'net-smb1',
];

test('apply then revert restores the exact previous values', { skip, timeout: 600_000 }, async (t) => {
  const { engine, backups } = await makeEngine();
  const { TWEAK_MAP } = await import('../src/shared/tweaks.js');
  const before = await engine.status(ROUND_TRIP);
  const ids = ROUND_TRIP.filter((id) => before[id].state !== 'unavailable' && before[id].state !== 'applied');
  t.diagnostic(`round-tripping ${ids.length} tweaks: ${ids.join(', ')}`);
  assert.ok(ids.length >= 8, 'expected most round-trip tweaks to be available');

  const snapshot = await engine.probe(ids.map((id) => TWEAK_MAP.get(id)));

  const applied = await engine.apply(ids);
  for (const id of ids) {
    assert.equal(applied.results[id]?.ok, true, `${id} failed to apply: ${applied.results[id]?.error}`);
    assert.equal(applied.states[id].state, 'applied', `${id} is not reported as applied`);
    assert.ok(backups.data[id], `${id} has no backup`);
  }

  const reverted = await engine.revert(ids);
  for (const id of ids) {
    assert.equal(reverted.results[id]?.ok, true, `${id} failed to revert: ${reverted.results[id]?.error}`);
    assert.equal(reverted.states[id].state, before[id].state, `${id} did not return to its original state`);
    assert.equal(backups.data[id], undefined, `${id} backup not cleared`);
  }

  const after = await engine.probe(ids.map((id) => TWEAK_MAP.get(id)));
  for (const id of ids) {
    const tw = TWEAK_MAP.get(id);
    tw.ops.forEach((op, i) => {
      if (op.type === 'ps') return;
      assert.deepEqual(after.get(id)[i], snapshot.get(id)[i], `${id} op ${i} (${op.name}) not restored exactly`);
    });
  }
});

test('system information, startup, DNS and bloat scans work', { skip, timeout: 300_000 }, async () => {
  const { getSystemInfo } = await import('../src/main/system-info.js');
  const info = await getSystemInfo();
  assert.ok(info.cpu.name.length > 0);
  assert.ok(info.memory.total > 0);
  assert.ok(info.os.build > 10000);
  assert.ok(info.volumes.length > 0);

  const { listStartup } = await import('../src/main/startup.js');
  assert.ok(Array.isArray(await listStartup()));

  const { getDns } = await import('../src/main/tools.js');
  const dns = await getDns();
  assert.ok(Array.isArray(dns.adapters));

  const { scanBloat } = await import('../src/main/apps.js');
  const bloat = await scanBloat(true);
  assert.ok(bloat.length > 10);
});

test('cleaner scans real folders', { skip, timeout: 300_000 }, async () => {
  const { scan } = await import('../src/main/cleaner.js');
  const r = await scan(['user-temp', 'recycle-bin', 'error-reports']);
  for (const id of ['user-temp', 'recycle-bin', 'error-reports']) {
    assert.equal(r[id].error, undefined, `${id}: ${r[id].error}`);
    assert.ok(r[id].size >= 0);
  }
});
