// Startup apps from the Run keys and Startup folders. Enabling/disabling uses
// the same StartupApproved flags as Task Manager, so nothing is deleted.

import { psJson, psq } from './powershell.js';

const APPROVED = 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved';
const HIVES = new Set(['HKEY_CURRENT_USER', 'HKEY_LOCAL_MACHINE']);
const LISTS = new Set(['Run', 'Run32', 'StartupFolder']);

export const LIST_SCRIPT = String.raw`
$approvedRoot = '${APPROVED}'
function Approved($hive, $list, $name) {
  $v = [Microsoft.Win32.Registry]::GetValue("$hive\$approvedRoot\$list", $name, $null)
  if ($v -is [byte[]] -and $v.Length -gt 0) { return (($v[0] -band 1) -eq 0) }
  return $true
}
function ExePath([string]$cmd) {
  $c = [Environment]::ExpandEnvironmentVariables($cmd).Trim()
  if ($c.StartsWith('"')) {
    $end = $c.IndexOf('"', 1)
    if ($end -gt 1) { return $c.Substring(1, $end - 1) }
  }
  $m = [regex]::Match($c, '^(.+?\.(exe|cmd|bat|com))(\s|$)', 'IgnoreCase')
  if ($m.Success) { $c = $m.Groups[1].Value } else { $c = ($c -split '\s+')[0] }
  if (-not [IO.Path]::IsPathRooted($c)) { $c = Join-Path "$env:SystemRoot\System32" $c }
  return $c
}
function Describe($item, $exe) {
  $item.exe = $exe
  if ($exe -and (Test-Path -LiteralPath $exe -PathType Leaf)) {
    $vi = (Get-Item -LiteralPath $exe).VersionInfo
    $item.publisher = [string]$vi.CompanyName
    $item.description = [string]$vi.FileDescription
    $item.exists = $true
  } else { $item.exists = $false }
  return $item
}

$items = New-Object System.Collections.ArrayList
$sources = @(
  @{ hive = 'HKEY_CURRENT_USER'; root = [Microsoft.Win32.Registry]::CurrentUser; key = 'Software\Microsoft\Windows\CurrentVersion\Run'; list = 'Run'; scope = 'user' },
  @{ hive = 'HKEY_LOCAL_MACHINE'; root = [Microsoft.Win32.Registry]::LocalMachine; key = 'Software\Microsoft\Windows\CurrentVersion\Run'; list = 'Run'; scope = 'machine' },
  @{ hive = 'HKEY_LOCAL_MACHINE'; root = [Microsoft.Win32.Registry]::LocalMachine; key = 'Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run'; list = 'Run32'; scope = 'machine' }
)
foreach ($s in $sources) {
  $k = $s.root.OpenSubKey($s.key)
  if (-not $k) { continue }
  foreach ($n in $k.GetValueNames()) {
    if ([string]::IsNullOrEmpty($n)) { continue }
    $cmd = [string]$k.GetValue($n, '', 'DoNotExpandEnvironmentNames')
    $item = @{ name = $n; command = $cmd; source = 'registry'; hive = $s.hive; list = $s.list; scope = $s.scope; enabled = (Approved $s.hive $s.list $n) }
    [void]$items.Add((Describe $item (ExePath $cmd)))
  }
  $k.Close()
}

$shell = New-Object -ComObject WScript.Shell
$folders = @(
  @{ path = [Environment]::GetFolderPath('Startup'); hive = 'HKEY_CURRENT_USER'; scope = 'user' },
  @{ path = [Environment]::GetFolderPath('CommonStartup'); hive = 'HKEY_LOCAL_MACHINE'; scope = 'machine' }
)
foreach ($f in $folders) {
  if (-not $f.path -or -not (Test-Path -LiteralPath $f.path)) { continue }
  Get-ChildItem -LiteralPath $f.path -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne 'desktop.ini' } | ForEach-Object {
    $target = $_.FullName
    if ($_.Extension -eq '.lnk') { try { $target = $shell.CreateShortcut($_.FullName).TargetPath } catch {} }
    $item = @{ name = $_.BaseName; valueName = $_.Name; command = $_.FullName; source = 'folder'; hive = $f.hive; list = 'StartupFolder'; scope = $f.scope; enabled = (Approved $f.hive 'StartupFolder' $_.Name) }
    [void]$items.Add((Describe $item $target))
  }
}
TTOut @($items)
`;

export async function listStartup() {
  const items = await psJson(LIST_SCRIPT, { timeout: 60_000 });
  return (Array.isArray(items) ? items : [items]).map((item) => ({
    ...item,
    valueName: item.valueName || item.name,
    key: `${item.hive}|${item.list}|${item.valueName || item.name}`,
  }));
}

export function setStartupScript({ hive, list, valueName }, enabled) {
  if (!HIVES.has(hive) || !LISTS.has(list) || typeof valueName !== 'string' || !valueName || valueName.length > 400) {
    throw new Error('Invalid startup entry');
  }
  const key = `${hive}\\${APPROVED}\\${list}`;
  return String.raw`
$bytes = if (${enabled ? '$true' : '$false'}) { [byte[]](2,0,0,0,0,0,0,0,0,0,0,0) } else { [byte[]](@(3,0,0,0) + [BitConverter]::GetBytes([DateTime]::UtcNow.ToFileTimeUtc())) }
[Microsoft.Win32.Registry]::SetValue(${psq(key)}, ${psq(valueName)}, $bytes, [Microsoft.Win32.RegistryValueKind]::Binary)
TTOut @{ ok = $true }
`;
}

export async function setStartup(item, enabled) {
  await psJson(setStartupScript(item, enabled));
  return { ok: true };
}
