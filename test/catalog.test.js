// Structural checks for every catalog the app ships.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

import { APP_CATEGORIES, APPS, BLOAT, BLOAT_GROUPS } from '../src/shared/apps.js';
import { CLEAN_GROUPS, CLEAN_TARGETS } from '../src/shared/cleaner.js';
import { DNS_PROVIDERS, LAUNCHERS, TOOL_GROUPS, TOOLS } from '../src/shared/tools.js';
import { CATEGORIES, PRESETS, RESTART, RISK, TWEAKS, TWEAK_MAP } from '../src/shared/tweaks.js';

const iconSource = fs.readFileSync(new URL('../src/renderer/js/icons.js', import.meta.url), 'utf8');
const ICONS = new Set([...iconSource.matchAll(/^\s+'([a-z0-9-]+)': '/gm)].map((m) => m[1]));

const unique = (list, what) => {
  const seen = new Set();
  for (const id of list) {
    assert.ok(!seen.has(id), `duplicate ${what} id "${id}"`);
    seen.add(id);
  }
};

test('tweak ids are unique and well formed', () => {
  unique(TWEAKS.map((t) => t.id), 'tweak');
  for (const t of TWEAKS) assert.match(t.id, /^[a-z]+-[a-z0-9-]+$/, t.id);
});

test('every tweak has valid metadata', () => {
  const cats = new Set(CATEGORIES.map((c) => c.id));
  for (const t of TWEAKS) {
    assert.ok(cats.has(t.category), `${t.id}: unknown category ${t.category}`);
    assert.ok(RISK[t.risk], `${t.id}: unknown risk ${t.risk}`);
    assert.ok(t.title && t.description, `${t.id}: missing text`);
    assert.ok(ICONS.has(t.icon), `${t.id}: icon "${t.icon}" not bundled`);
    if (t.restart) assert.ok(RESTART[t.restart], `${t.id}: unknown restart ${t.restart}`);
    assert.ok(Array.isArray(t.ops) && t.ops.length > 0, `${t.id}: no ops`);
  }
});

test('every tweak op is valid and reversible', () => {
  const modes = new Set(['auto', 'delayed-auto', 'demand', 'disabled']);
  for (const t of TWEAKS) {
    for (const op of t.ops) {
      switch (op.type) {
        case 'reg':
          assert.match(op.key, /^(HKLM|HKCU|HKU|HKCR)\\[^\\]/, `${t.id}: bad key ${op.key}`);
          assert.ok(!op.key.endsWith('\\'), `${t.id}: key has trailing backslash`);
          assert.ok(['DWord', 'String'].includes(op.kind), `${t.id}: bad kind`);
          assert.equal(typeof op.name, 'string');
          for (const v of [op.value, op.revert]) {
            if (v === null) continue;
            if (op.kind === 'DWord') assert.ok(Number.isInteger(v) && v >= 0 && v <= 0xffffffff, `${t.id}: bad dword ${v}`);
            else assert.equal(typeof v, 'string', `${t.id}: string value expected`);
          }
          assert.notDeepEqual(op.value, op.revert, `${t.id}: ${op.name} apply equals revert`);
          break;
        case 'svc':
          assert.match(op.name, /^[A-Za-z0-9_]+$/, `${t.id}: bad service name`);
          assert.ok(modes.has(op.start) && modes.has(op.revert), `${t.id}: bad service mode`);
          assert.notEqual(op.start, op.revert);
          break;
        case 'task':
          assert.match(op.path, /^\\.*\\$/, `${t.id}: task path must start and end with a backslash`);
          assert.ok(op.name);
          break;
        case 'ps':
          assert.ok(op.check && op.apply && op.revert, `${t.id}: ps op needs check/apply/revert`);
          break;
        default:
          assert.fail(`${t.id}: unknown op type ${op.type}`);
      }
    }
  }
});

test('presets reference real tweaks', () => {
  unique(PRESETS.map((p) => p.id), 'preset');
  for (const p of PRESETS) {
    assert.ok(p.tweaks.length > 0, `${p.id} is empty`);
    for (const id of p.tweaks) assert.ok(TWEAK_MAP.has(id), `${p.id}: unknown tweak ${id}`);
    unique(p.tweaks, `${p.id} entry`);
    assert.ok(ICONS.has(p.icon), `${p.id}: icon missing`);
  }
});

test('recommended preset only contains safe tweaks', () => {
  const rec = PRESETS.find((p) => p.id === 'recommended');
  for (const id of rec.tweaks) assert.equal(TWEAK_MAP.get(id).risk, 'safe', `${id} is recommended but not safe`);
});

test('app catalog is consistent', () => {
  unique(APPS.map((a) => a.id), 'app');
  const cats = new Set(APP_CATEGORIES.map((c) => c.id));
  for (const a of APPS) {
    assert.ok(cats.has(a.category), `${a.id}: unknown category`);
    assert.match(a.id, /^[A-Za-z0-9][A-Za-z0-9.+_-]*\.[A-Za-z0-9.+_-]+$/, `${a.id}: not a winget id`);
    assert.ok(Number.isFinite(a.hue));
  }
  for (const c of APP_CATEGORIES) assert.ok(ICONS.has(c.icon), `category icon ${c.icon} missing`);
});

test('bloat list is consistent', () => {
  unique(BLOAT.map((b) => b.id), 'bloat');
  const groups = new Set(BLOAT_GROUPS.map((g) => g.id));
  for (const b of BLOAT) {
    assert.ok(groups.has(b.group), `${b.id}: unknown group`);
    assert.doesNotMatch(b.id, /['"`\s]/, `${b.id}: unsafe characters`);
  }
});

test('cleaner targets are consistent', () => {
  unique(CLEAN_TARGETS.map((t) => t.id), 'clean target');
  const groups = new Set(CLEAN_GROUPS.map((g) => g.id));
  for (const t of CLEAN_TARGETS) {
    assert.ok(groups.has(t.group), `${t.id}: unknown group`);
    assert.ok(t.special || t.paths?.length, `${t.id}: no paths`);
    assert.ok(ICONS.has(t.icon), `${t.id}: icon missing`);
    for (const p of t.paths || []) assert.match(p, /^%[A-Z]+%(\\|$)/, `${t.id}: path must start with an env var`);
  }
});

test('toolbox catalog is consistent', () => {
  unique(TOOLS.map((t) => t.id), 'tool');
  unique(LAUNCHERS.map((l) => l.id), 'launcher');
  unique(DNS_PROVIDERS.map((d) => d.id), 'dns');
  const groups = new Set(TOOL_GROUPS.map((g) => g.id));
  for (const t of TOOLS) {
    assert.ok(groups.has(t.group), `${t.id}: unknown group`);
    assert.ok(['action', 'stream'].includes(t.kind));
    assert.ok(ICONS.has(t.icon), `${t.id}: icon missing`);
  }
  for (const l of LAUNCHERS) {
    assert.ok(ICONS.has(l.icon), `${l.id}: icon missing`);
    assert.doesNotMatch(l.command, /[&|<>^"]/, `${l.id}: shell metacharacters in command`);
  }
  for (const d of DNS_PROVIDERS) for (const ip of d.servers) assert.match(ip, /^\d+\.\d+\.\d+\.\d+$/);
});
