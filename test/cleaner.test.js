import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { expandEnv, isSafeRoot, resolveTargetPaths } from '../src/main/cleaner.js';

function sandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-clean-'));
  const mk = (rel, content = 'x') => {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
    return p;
  };
  return { root, mk };
}

test('expandEnv resolves variables case-insensitively and keeps unknown ones', () => {
  process.env.TT_TEST_VAR = '/tmp/example';
  assert.equal(expandEnv('%tt_test_var%/a'), '/tmp/example/a');
  assert.equal(expandEnv('%TT_DOES_NOT_EXIST%/a'), '%TT_DOES_NOT_EXIST%/a');
});

test('isSafeRoot rejects roots, relative and unexpanded paths', () => {
  assert.equal(isSafeRoot('/'), false);
  assert.equal(isSafeRoot('/tmp'), false);
  assert.equal(isSafeRoot('relative/path/here'), false);
  assert.equal(isSafeRoot('%TEMP%/x/y'), false);
  assert.equal(isSafeRoot('/tmp/a/b'), true);
});

test('resolveTargetPaths expands * folder segments and skips missing paths', async () => {
  const { root, mk } = sandbox();
  mk('User Data/Default/Cache/a.bin');
  mk('User Data/Profile 1/Cache/b.bin');
  mk('User Data/Profile 2/Other/c.bin');
  const found = await resolveTargetPaths([path.join(root, 'User Data', '*', 'Cache'), path.join(root, 'missing', 'dir')]);
  assert.deepEqual(found.map((p) => path.relative(root, p)).sort(), [path.join('User Data', 'Default', 'Cache'), path.join('User Data', 'Profile 1', 'Cache')]);
});

test('scan and clean remove only matching files and never follow symlinks', async (t) => {
  const { root, mk } = sandbox();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-outside-'));
  const precious = path.join(outside, 'precious.txt');
  fs.writeFileSync(precious, 'keep me');
  mk('cache/a.bin', '1234');
  mk('cache/deep/nested/b.bin', '12345678');
  try {
    fs.symlinkSync(outside, path.join(root, 'cache', 'link'), 'dir');
  } catch {
    t.diagnostic('symlinks not supported here');
  }

  const { CLEAN_MAP } = await import('../src/shared/cleaner.js');
  const cleaner = await import('../src/main/cleaner.js');
  const target = { id: 'tt-test', group: 'system', name: 'Test', icon: 'box', paths: [path.join(root, 'cache')] };
  CLEAN_MAP.set(target.id, target);
  try {
    const scanned = await cleaner.scan([target.id]);
    assert.deepEqual(scanned[target.id], { size: 12, files: 2 });

    const cleaned = await cleaner.clean([target.id]);
    assert.equal(cleaned[target.id].freed, 12);
    assert.equal(cleaned[target.id].removed, 2);
    assert.ok(fs.existsSync(path.join(root, 'cache')), 'root folder is kept');
    assert.ok(!fs.existsSync(path.join(root, 'cache', 'deep')), 'emptied sub-folders are removed');
    assert.equal(fs.readFileSync(precious, 'utf8'), 'keep me', 'symlinked content is untouched');
  } finally {
    CLEAN_MAP.delete(target.id);
  }
});

test('include patterns and minimum age are honoured', async () => {
  const { root, mk } = sandbox();
  mk('logs/old.log', 'aaaa');
  mk('logs/keep.txt', 'bbbb');
  const fresh = mk('logs/fresh.log', 'cc');
  const old = path.join(root, 'logs', 'old.log');
  const past = new Date(Date.now() - 5 * 3600_000);
  fs.utimesSync(old, past, past);
  fs.utimesSync(path.join(root, 'logs', 'keep.txt'), past, past);

  const { CLEAN_MAP } = await import('../src/shared/cleaner.js');
  const cleaner = await import('../src/main/cleaner.js');
  const target = { id: 'tt-test-2', group: 'system', name: 'Test', icon: 'box', paths: [path.join(root, 'logs')], include: ['*.log'], minAgeHours: 2 };
  CLEAN_MAP.set(target.id, target);
  try {
    const r = await cleaner.clean([target.id]);
    assert.equal(r[target.id].removed, 1);
    assert.ok(!fs.existsSync(old));
    assert.ok(fs.existsSync(fresh), 'files newer than minAgeHours are kept');
    assert.ok(fs.existsSync(path.join(root, 'logs', 'keep.txt')), 'non-matching files are kept');
  } finally {
    CLEAN_MAP.delete(target.id);
  }
});
