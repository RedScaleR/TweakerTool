// PowerShell / native process helpers.
//
// Scripts are sent to Windows PowerShell 5.1 as base64 over stdin and run as a
// script block, which sidesteps command-line length limits, execution policy
// and console code-page issues. Results come back as JSON between markers.

import { spawn } from 'node:child_process';
import path from 'node:path';

const SYSTEM_ROOT = process.env.SystemRoot || 'C:\\Windows';
// TWEAKER_POWERSHELL lets the test-suite point at pwsh on Linux.
export const POWERSHELL = process.env.TWEAKER_POWERSHELL || path.join(SYSTEM_ROOT, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
export const MARK = '@@TT@@';

const BOOTSTRAP = [
  '[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)',
  "$ProgressPreference='SilentlyContinue'",
  '$__s=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([Console]::In.ReadToEnd()))',
  '& ([scriptblock]::Create($__s))',
].join(';');

// Helpers available to every script.
export const PRELUDE = String.raw`
function TTOut($o) {
  $j = ConvertTo-Json -InputObject $o -Depth 8 -Compress
  $j = [regex]::Replace($j, '[^\x00-\x7F]', { param($m) '\u{0:x4}' -f [int][char]$m.Value })
  [Console]::Out.Write('${MARK}' + $j + '${MARK}')
}
# Run a native tool without PowerShell turning its stderr into error records.
function TTExec([string]$file, [string]$arguments) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $file
  $psi.Arguments = $arguments
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $p = [System.Diagnostics.Process]::Start($psi)
  $err = $p.StandardError.ReadToEndAsync()
  $out = $p.StandardOutput.ReadToEnd()
  $p.WaitForExit()
  $global:LASTEXITCODE = $p.ExitCode
  return ($out + $err.Result).Trim()
}
`;

/** Quote a value as a PowerShell single-quoted string literal. */
export function psq(value) {
  return `'${String(value).replace(/['\u2018\u2019\u201A\u201B]/g, (c) => c + c)}'`;
}

/** Run a PowerShell script. Resolves with { code, stdout, stderr }. */
export function runPowerShell(script, { timeout = 120_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(POWERSHELL, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', BOOTSTRAP], {
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`PowerShell timed out after ${Math.round(timeout / 1000)}s`));
    }, timeout);
    child.stdout.setEncoding('utf8').on('data', (d) => (stdout += d));
    child.stderr.setEncoding('utf8').on('data', (d) => (stderr += d));
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.stdin.end(Buffer.from(PRELUDE + '\n' + script, 'utf8').toString('base64'));
  });
}

export function extractJson(stdout) {
  const start = stdout.indexOf(MARK);
  const end = stdout.lastIndexOf(MARK);
  if (start < 0 || end <= start) return undefined;
  return JSON.parse(stdout.slice(start + MARK.length, end));
}

/** Run a script that ends with TTOut(...) and return the parsed value. */
export async function psJson(script, opts) {
  const { stdout, stderr } = await runPowerShell(script, opts);
  const value = extractJson(stdout);
  if (value === undefined) {
    const detail = (stderr || stdout).replace(/\s+/g, ' ').trim().slice(0, 400);
    throw new Error(detail || 'PowerShell returned no result');
  }
  return value;
}

/** Decode console output that may be UTF-16LE (sfc.exe) or UTF-8. */
export function decodeChunk(buf) {
  let zeros = 0;
  for (let i = 1; i < Math.min(buf.length, 64); i += 2) if (buf[i] === 0) zeros++;
  return zeros > 8 ? buf.toString('utf16le') : buf.toString('utf8');
}

/**
 * Spawn a native process and stream cleaned-up output lines.
 * Returns { promise, cancel }.
 */
export function streamProcess(file, args, { onLine, onProgress, cwd } = {}) {
  const child = spawn(file, args, { windowsHide: true, cwd });
  let buffer = '';
  let lastLine = '';
  const handle = (chunk) => {
    buffer += decodeChunk(chunk).replace(/\u0000/g, '');
    const parts = buffer.split(/\r\n|\n|\r/);
    buffer = parts.pop();
    for (const raw of parts) emit(raw);
    const pct = matchPercent(buffer);
    if (pct != null) onProgress?.(pct);
  };
  const emit = (raw) => {
    const line = raw.replace(/[\u2580-\u259F\u2500-\u257F]+/g, ' ').replace(/\s+$/g, '');
    const pct = matchPercent(line);
    if (pct != null) onProgress?.(pct);
    const text = line.trim();
    if (!text || /^[-\\|/]$/.test(text) || text === lastLine) return;
    lastLine = text;
    onLine?.(text);
  };
  child.stdout.on('data', handle);
  child.stderr.on('data', handle);
  const promise = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => {
      if (buffer) emit(buffer);
      resolve(code);
    });
  });
  return { promise, cancel: () => child.kill() };
}

function matchPercent(text) {
  const m = /(\d{1,3}(?:[.,]\d+)?)\s?%/.exec(text);
  if (!m) return null;
  const n = parseFloat(m[1].replace(',', '.'));
  return n >= 0 && n <= 100 ? n : null;
}
