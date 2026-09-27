// Junk scanner and cleaner. Walks target folders with Node's fs, never
// follows symlinks or junctions, and skips files that are locked or too new.

import fs from 'node:fs/promises';
import path from 'node:path';
import { CLEAN_MAP } from '../shared/cleaner.js';
import { psJson } from './powershell.js';

export const RECYCLE_QUERY = String.raw`
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class TTRecycleBin {
  [StructLayout(LayoutKind.Sequential)]
  public struct SHQUERYRBINFO { public int cbSize; public long i64Size; public long i64NumItems; }
  [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
  public static extern int SHQueryRecycleBin(string pszRootPath, ref SHQUERYRBINFO info);
}
'@
$info = New-Object TTRecycleBin+SHQUERYRBINFO
$info.cbSize = [Runtime.InteropServices.Marshal]::SizeOf($info)
[void][TTRecycleBin]::SHQueryRecycleBin($null, [ref]$info)
TTOut @{ size = $info.i64Size; files = $info.i64NumItems }
`;

export function expandEnv(p) {
  return p.replace(/%([^%]+)%/g, (whole, name) => {
    const key = Object.keys(process.env).find((k) => k.toLowerCase() === name.toLowerCase());
    return key ? process.env[key] : whole;
  });
}

function globToRegex(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

/** A cleaning root must be absolute, fully expanded and not a drive root. */
export function isSafeRoot(p) {
  if (!p || p.includes('%') || !path.isAbsolute(p)) return false;
  const parts = path.resolve(p).split(/[\\/]+/).filter(Boolean);
  return parts.length >= 3;
}

/** Expand env vars and `*` folder segments into existing paths. */
export async function resolveTargetPaths(patterns) {
  const out = [];
  for (const pattern of patterns) {
    const expanded = expandEnv(pattern);
    if (!isSafeRoot(expanded)) continue;
    const segments = expanded.split(/[\\/]+/);
    let bases = [segments.shift() + path.sep];
    for (const seg of segments) {
      const next = [];
      for (const base of bases) {
        if (!seg.includes('*')) {
          next.push(path.join(base, seg));
          continue;
        }
        const re = globToRegex(seg);
        try {
          for (const entry of await fs.readdir(base, { withFileTypes: true })) {
            if (entry.isDirectory() && re.test(entry.name)) next.push(path.join(base, entry.name));
          }
        } catch {
          /* missing or inaccessible */
        }
      }
      bases = next;
    }
    for (const p of bases) {
      try {
        await fs.lstat(p);
        out.push(p);
      } catch {
        /* does not exist */
      }
    }
  }
  return out;
}

async function walk(root, { include, minAgeMs, onFile }) {
  const matchers = include?.map(globToRegex);
  const cutoff = minAgeMs ? Date.now() - minAgeMs : 0;
  const check = async (file) => {
    const st = await fs.lstat(file);
    if (!st.isFile()) return;
    if (matchers && !matchers.some((re) => re.test(path.basename(file)))) return;
    if (cutoff && st.mtimeMs > cutoff) return;
    await onFile(file, st.size);
  };

  let rootStat;
  try {
    rootStat = await fs.lstat(root);
  } catch {
    return;
  }
  if (rootStat.isSymbolicLink()) return;
  if (rootStat.isFile()) return check(root).catch(() => {});

  const stack = [root];
  const dirs = [];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    dirs.push(dir);
    await Promise.all(
      entries.map(async (entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isSymbolicLink()) return;
        if (entry.isDirectory()) stack.push(full);
        else if (entry.isFile()) await check(full).catch(() => {});
      }),
    );
  }
  return dirs;
}

function throttle(fn, ms) {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last >= ms) {
      last = now;
      fn(...args);
    }
  };
}

async function measureTarget(target, onProgress) {
  if (target.special === 'recycle-bin') {
    const r = await psJson(RECYCLE_QUERY, { timeout: 60_000 });
    return { size: Number(r.size) || 0, files: Number(r.files) || 0 };
  }
  let size = 0;
  let files = 0;
  const report = throttle(() => onProgress({ id: target.id, size, files }), 120);
  for (const root of await resolveTargetPaths(target.paths)) {
    await walk(root, {
      include: target.include,
      minAgeMs: (target.minAgeHours || 0) * 3_600_000,
      onFile: (_file, bytes) => {
        size += bytes;
        files++;
        report();
      },
    });
  }
  return { size, files };
}

export async function scan(ids, onProgress = () => {}) {
  const results = {};
  for (const id of ids) {
    const target = CLEAN_MAP.get(id);
    if (!target) continue;
    onProgress({ id, phase: 'start' });
    try {
      results[id] = await measureTarget(target, onProgress);
    } catch (err) {
      results[id] = { size: 0, files: 0, error: err.message };
    }
    onProgress({ id, phase: 'done', ...results[id] });
  }
  return results;
}

async function cleanTarget(target, onProgress) {
  if (target.special === 'recycle-bin') {
    const before = await measureTarget(target, onProgress);
    await psJson('Clear-RecycleBin -Force -ErrorAction SilentlyContinue\nTTOut @{ ok = $true }');
    return { freed: before.size, removed: before.files, skipped: 0 };
  }
  if (target.stopServices) {
    const names = target.stopServices.join(',');
    await psJson(`Stop-Service -Name ${names} -Force -ErrorAction SilentlyContinue\nTTOut @{ ok = $true }`).catch(() => {});
  }
  let freed = 0;
  let removed = 0;
  let skipped = 0;
  const report = throttle(() => onProgress({ id: target.id, freed, removed }), 120);
  try {
    for (const root of await resolveTargetPaths(target.paths)) {
      const dirs = await walk(root, {
        include: target.include,
        minAgeMs: (target.minAgeHours || 0) * 3_600_000,
        onFile: async (file, bytes) => {
          try {
            await fs.unlink(file);
            freed += bytes;
            removed++;
            report();
          } catch {
            skipped++;
          }
        },
      });
      // Remove emptied sub-folders, deepest first, keeping the root itself.
      if (!target.include && dirs) {
        for (const dir of dirs.slice(1).reverse()) await fs.rmdir(dir).catch(() => {});
      }
    }
  } finally {
    if (target.stopServices) {
      const names = target.stopServices.join(',');
      await psJson(`Start-Service -Name ${names} -ErrorAction SilentlyContinue\nTTOut @{ ok = $true }`).catch(() => {});
    }
  }
  return { freed, removed, skipped };
}

export async function clean(ids, onProgress = () => {}) {
  const results = {};
  for (const id of ids) {
    const target = CLEAN_MAP.get(id);
    if (!target) continue;
    onProgress({ id, phase: 'start' });
    try {
      results[id] = await cleanTarget(target, onProgress);
    } catch (err) {
      results[id] = { freed: 0, removed: 0, skipped: 0, error: err.message };
    }
    onProgress({ id, phase: 'done', ...results[id] });
  }
  return results;
}
