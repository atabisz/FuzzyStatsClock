<#
.SYNOPSIS
  Emit one JSON line per interval describing a process tree's CPU time and memory.

.DESCRIPTION
  The instrument behind ISC-6. It reports `TotalProcessorTime` in seconds per process,
  which is deliberately the metric the WPF baseline was measured with — and because
  this same script is now pointed at both the WPF build and the Electron build, the two
  sides of that comparison come from one instrument rather than from two runs asserted
  to have the same shape.

  Five design points, each from a way this measurement can lie:

  * **One long-lived process, not one spawn per sample.** Spawning PowerShell per
    sample costs more CPU than the thing being measured, and adds scheduling
    contention to it.

  * **The whole tree, re-walked every sample.** Electron is 4+ processes (main,
    renderer, GPU, utility) plus two `typeperf` children and their conhosts, against
    WPF's one. Measuring only the root would drop the renderer — the part that draws.
    The tree is re-walked rather than resolved once because the telemetry source
    recycles its GPU counter child every 30s: pids come and go *inside* the window,
    and a set resolved at the start would miss them.

  * **Duration-based, not count-based.** A count-based loop overran badly — 20 samples
    at a nominal 1s cadence took 39s, because the CIM query over ~400 processes costs
    about a second itself. The loop now runs until the clock says to stop, so the
    window length is what was asked for and the sample count varies instead.

  * **Private working set alongside total.** Summing full working sets across
    Electron's processes double-counts every page they share, which inflates the
    figure against a single-process baseline. `WorkingSetPrivate` is the
    no-double-counting number. Both are emitted; neither is chosen here.

  * **PowerShell's own clock is emitted.** The caller derives elapsed time from `t`,
    never from when the line arrived — stdout arrival is chunked and says nothing
    about when a sample was taken.

.PARAMETER RootPid
  Root of the tree. Itself included in the output.

.PARAMETER DurationSec
  How long to keep sampling. The first and last samples bound the measurement window.

.PARAMETER IntervalMs
  Requested minimum gap between samples. Approximate; `t` carries the truth.
#>
param(
  [Parameter(Mandatory = $true)][int]$RootPid,
  [Parameter(Mandatory = $true)][int]$DurationSec,
  [int]$IntervalMs = 1000
)

$ErrorActionPreference = 'Stop'

function Get-Descendants {
  param([int]$Root)

  # One CIM query per sample rather than per process: Win32_Process is the only source
  # of ParentProcessId, and asking ~400 times would cost more than the subject.
  $all = Get-CimInstance -ClassName Win32_Process -Property ProcessId, ParentProcessId

  $byParent = @{}
  foreach ($p in $all) {
    $parent = [int]$p.ParentProcessId
    if (-not $byParent.ContainsKey($parent)) { $byParent[$parent] = New-Object System.Collections.Generic.List[int] }
    $byParent[$parent].Add([int]$p.ProcessId)
  }

  $seen = New-Object System.Collections.Generic.HashSet[int]
  $queue = New-Object System.Collections.Generic.Queue[int]
  [void]$seen.Add($Root)
  $queue.Enqueue($Root)

  while ($queue.Count -gt 0) {
    $current = $queue.Dequeue()
    if (-not $byParent.ContainsKey($current)) { continue }
    foreach ($child in $byParent[$current]) {
      # The HashSet is what stops a parent-pid cycle looping forever. Pid reuse can
      # genuinely produce one: a dead pid's slot is handed out again, and the new
      # process can end up listed as its own ancestor's parent.
      if ($seen.Add($child)) { $queue.Enqueue($child) }
    }
  }
  return $seen
}

$deadline = (Get-Date).AddSeconds($DurationSec)
$first = $true

while ($true) {
  $ids = Get-Descendants -Root $RootPid

  # Private working set is not on Process objects; it comes from the perf class, keyed
  # by IDProcess. Queried once per sample and joined, rather than per process.
  $privateByPid = @{}
  try {
    $perf = Get-CimInstance -ClassName Win32_PerfFormattedData_PerfProc_Process `
      -Property IDProcess, WorkingSetPrivate
    foreach ($row in $perf) { $privateByPid[[int]$row.IDProcess] = [long]$row.WorkingSetPrivate }
  } catch {
    # Left empty on failure, which surfaces as -1 below rather than as 0. A zero here
    # would read as "this process holds no private memory", which is never true.
  }

  $rows = foreach ($id in $ids) {
    $proc = Get-Process -Id $id -ErrorAction SilentlyContinue
    if ($null -ne $proc) {
      # TotalProcessorTime, not the `CPU` alias, so the metric is unambiguous in the
      # record: user + kernel time for the process since it started.
      [pscustomobject]@{
        pid  = $proc.Id
        name = $proc.ProcessName
        cpu  = $proc.TotalProcessorTime.TotalSeconds
        ws   = $proc.WorkingSet64
        pv   = $proc.PrivateMemorySize64
        wsp  = if ($privateByPid.ContainsKey($id)) { $privateByPid[$id] } else { -1 }
      }
    }
  }

  $sample = [pscustomobject]@{
    t    = (Get-Date).ToString('o')
    rows = @($rows)
  }
  $sample | ConvertTo-Json -Compress -Depth 4

  # Checked after emitting, so the window always has a closing sample at or past the
  # deadline rather than one short of it.
  if (-not $first -and (Get-Date) -ge $deadline) { break }
  $first = $false
  Start-Sleep -Milliseconds $IntervalMs
}
