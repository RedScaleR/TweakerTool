import os from 'node:os';
import { psJson } from './powershell.js';

export const INFO_SCRIPT = String.raw`
$os = Get-CimInstance Win32_OperatingSystem
$cs = Get-CimInstance Win32_ComputerSystem
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$board = Get-CimInstance Win32_BaseBoard | Select-Object -First 1
$mem = @(Get-CimInstance Win32_PhysicalMemory)
$cv = Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'

$controllers = @(Get-CimInstance Win32_VideoController | Where-Object { $_.Name -notmatch 'Basic Display|Remote Display|Virtual' })
$gpus = New-Object System.Collections.ArrayList
$class = 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}'
foreach ($vc in $controllers) {
  $vram = [int64]$vc.AdapterRAM
  Get-ChildItem -LiteralPath $class -ErrorAction SilentlyContinue | Where-Object { $_.PSChildName -match '^\d{4}$' } | ForEach-Object {
    $p = Get-ItemProperty -LiteralPath $_.PSPath -ErrorAction SilentlyContinue
    if ($p.DriverDesc -eq $vc.Name -and $p.'HardwareInformation.qwMemorySize') { $vram = [int64]$p.'HardwareInformation.qwMemorySize' }
  }
  [void]$gpus.Add(@{ name = [string]$vc.Name; vram = $vram; driver = [string]$vc.DriverVersion })
}

$volumes = New-Object System.Collections.ArrayList
Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object {
  $kind = ''
  try {
    $part = Get-Partition -DriveLetter $_.DeviceID.TrimEnd(':') -ErrorAction Stop
    $pd = Get-PhysicalDisk -ErrorAction Stop | Where-Object { $_.DeviceId -eq [string]$part.DiskNumber } | Select-Object -First 1
    if ($pd) { $kind = if ([string]$pd.BusType -eq 'NVMe') { 'NVMe' } else { [string]$pd.MediaType } }
  } catch {}
  [void]$volumes.Add(@{ letter = $_.DeviceID; label = [string]$_.VolumeName; size = [int64]$_.Size; free = [int64]$_.FreeSpace; fs = [string]$_.FileSystem; kind = $kind })
}

$memType = switch (($mem | Select-Object -First 1).SMBIOSMemoryType) { 34 { 'DDR5' } 26 { 'DDR4' } 24 { 'DDR3' } default { '' } }
$speed = ($mem | Measure-Object -Property ConfiguredClockSpeed -Maximum).Maximum
if (-not $speed) { $speed = ($mem | Measure-Object -Property Speed -Maximum).Maximum }

TTOut @{
  computerName = $env:COMPUTERNAME
  userName = $env:USERNAME
  os = @{
    name = ([string]$os.Caption).Replace('Microsoft ', '')
    displayVersion = [string]$cv.DisplayVersion
    build = [int]$cv.CurrentBuildNumber
    ubr = [int]$cv.UBR
    arch = [string]$os.OSArchitecture
    installDate = $os.InstallDate.ToString('o')
  }
  cpu = @{ name = ([string]$cpu.Name).Trim(); cores = [int]$cpu.NumberOfCores; threads = [int]$cpu.NumberOfLogicalProcessors; maxClock = [int]$cpu.MaxClockSpeed }
  gpus = @($gpus)
  memory = @{ total = [int64]$cs.TotalPhysicalMemory; modules = $mem.Count; speed = [int]$speed; type = $memType }
  board = @{ maker = [string]$board.Manufacturer; product = [string]$board.Product; model = [string]$cs.Model }
  volumes = @($volumes)
}
`;

let cached = null;

export async function getSystemInfo() {
  if (!cached) {
    cached = psJson(INFO_SCRIPT, { timeout: 60_000 }).catch((err) => {
      cached = null;
      throw err;
    });
  }
  return cached;
}

export function getBuild() {
  const m = /^\d+\.\d+\.(\d+)/.exec(os.release());
  return m ? Number(m[1]) : 0;
}

let previous = os.cpus();

/** CPU load since the previous call plus current memory use. */
export function sampleStats() {
  const current = os.cpus();
  let idle = 0;
  let total = 0;
  current.forEach((cpu, i) => {
    const before = previous[i]?.times;
    if (!before) return;
    for (const key of Object.keys(cpu.times)) total += cpu.times[key] - before[key];
    idle += cpu.times.idle - before.idle;
  });
  previous = current;
  const memTotal = os.totalmem();
  return {
    cpu: total > 0 ? Math.max(0, Math.min(100, (1 - idle / total) * 100)) : 0,
    memUsed: memTotal - os.freemem(),
    memTotal,
    uptime: os.uptime(),
  };
}
