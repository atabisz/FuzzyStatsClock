---
phase: 07-statsservice
plan: 01
subsystem: data-layer
tags: [windows-pdh, performance-counters, stats, cpu, gpu, memory, dotnet10]

# Dependency graph
requires:
  - phase: 06-appsettings-migration
    provides: AppSettings init-property record with StatsVisible and StatsIntervalSeconds

provides:
  - StatsService IDisposable class: CpuPercent, GpuPercent, MemPercent float properties via Windows PDH
  - System.Diagnostics.PerformanceCounter v10.0.0 NuGet package in FuzzyClock.App.csproj
  - Verified live counter values: CPU/MEM non-zero, GPU engtype_3D filter working on target hardware

affects:
  - 08-statspanel (consumes StatsService, wires timer, displays CpuPercent/GpuPercent/MemPercent)
  - 09-statssettings (adds StatsVisible toggle and StatsIntervalSeconds timer wiring)

# Tech tracking
tech-stack:
  added:
    - "System.Diagnostics.PerformanceCounter v10.0.0 (Microsoft first-party Windows PDH wrapper)"
  patterns:
    - "Async init via Task.Run + volatile bool _initialized guard prevents UI thread blocking and premature Refresh() reads"
    - "Rate counter priming: first NextValue() discarded during Initialize() to eliminate 0%-then-jump artifact"
    - "GPU multi-instance enumeration: PerformanceCounterCategory.GetInstanceNames() + engtype_3D filter + Sum + clamp 100"
    - "GPU graceful fallback: _gpuAvailable=false + GpuPercent=-1f sentinel when GPU Engine category absent"
    - "InvalidOperationException recovery in Refresh(): re-enumerate GPU counters after driver update/sleep-wake"
    - "IDisposable teardown: explicit Dispose() on all PerformanceCounter handles via DisposeGpuCounters() helper"

key-files:
  created:
    - FuzzyClock.App/StatsService.cs
  modified:
    - FuzzyClock.App/FuzzyClock.App.csproj

key-decisions:
  - "GPU counter name is 'Utilization Percentage' (not 'Utilization %') — validated via typeperf on development machine (TRI-5CD231GKDW)"
  - "GPU Engine category confirmed present on dev machine; engtype_3D instances confirmed in typeperf output"
  - "NU1510 warning (package pruning suggestion) is benign — .NET 10 WPF SDK includes the assembly in-box but explicit reference is harmless; code compiles and runs correctly"
  - "Verification run: _initialized guard held for ~6 seconds on this machine before init completed; no data before ready is correct behavior, not a bug"

patterns-established:
  - "StatsService is a pure data layer — zero WPF references, usable from any context"
  - "Phase 8 owns timer wiring; Phase 7 owns only the data polling contract"

requirements-completed: [STAT-01]

# Metrics
duration: 3min
completed: 2026-02-25
---

# Phase 7 Plan 01: Stats Data Layer Summary

**StatsService.cs pure data layer: CPU/GPU/MEM via Windows PDH PerformanceCounter with async init, engtype_3D GPU enumeration, _gpuAvailable fallback sentinel, and verified live values (CPU=47%, GPU=1%, MEM=89%)**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-25T06:51:46Z
- **Completed:** 2026-02-25T06:54:58Z
- **Tasks:** 3 (2 auto + 1 human-verify checkpoint — all complete)
- **Files modified:** 2

## Accomplishments

- Created StatsService.cs (~95 lines): all four required patterns — Task.Run async init, _initialized guard, GPU engtype_3D multi-instance enumeration with fallback, IDisposable teardown
- Added System.Diagnostics.PerformanceCounter v10.0.0 to FuzzyClock.App.csproj; dotnet restore and build both succeed with 0 errors
- Validated GPU counter name as "Utilization Percentage" via typeperf; confirmed engtype_3D instances present on dev machine; live verification showed CPU=47%, GPU=1%, MEM=89%

## Task Commits

Each task was committed atomically:

1. **Task 1: Add NuGet package and implement StatsService.cs** - `ceb3468` (feat)
2. **Task 2: Verify live counter values via temporary debug output** - `4120551` (chore — empty commit documenting verification results)

## Files Created/Modified

- `FuzzyClock.App/StatsService.cs` - Pure data layer: CpuPercent/GpuPercent/MemPercent float properties, async init via Task.Run, _initialized guard, GPU engtype_3D enumeration, IDisposable
- `FuzzyClock.App/FuzzyClock.App.csproj` - Added PackageReference for System.Diagnostics.PerformanceCounter v10.0.0

## Decisions Made

- GPU counter name is `"Utilization Percentage"` — the research document noted both `"Utilization (%)"` and `"Utilization Percentage"` as possibilities. The `typeperf "\GPU Engine(*)\Utilization (%)"` query returned "No valid counters", while `typeperf "\GPU Engine(*)\Utilization Percentage"` returned full output. Counter name `"Utilization Percentage"` confirmed authoritative on this machine (Windows 11, Intel Arc/UHD GPU).
- NU1510 warning (package pruning suggestion) accepted as benign — .NET 10 WPF SDK includes PerformanceCounter in-box, making the explicit NuGet reference technically redundant, but the explicit reference causes no harm, and the plan specification requires it for clarity and portability across SDK versions.
- Verification run _initialized timing: on this machine, PDH cold-start took ~6 seconds before _initialized=true was set. The first 4 of 5 Refresh() calls returned early (no-op) because init was still running. Only the 5th call (at T+7s) returned live values. This is correct behavior — the _initialized guard is the whole point. First displayed values will be valid and non-zero.

## Deviations from Plan

None — plan executed exactly as written, with one clarification on the GPU counter name validated via typeperf as specified in the plan.

## Issues Encountered

- Debug.WriteLine does not appear in stdout from `dotnet run` (only in IDE debugger output). The verification block was extended to also write to a temp file (`fuzzyclock_stats_verify.txt`) and self-terminate the app after 5 readings, enabling headless verification. The temp file approach is outside the app's production path and was removed with the debug block.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- StatsService.cs is complete and build-verified. Phase 8 can immediately consume StatsService as a data source by: `new StatsService()` in MainWindow.xaml.cs, calling `Refresh()` from a DispatcherTimer tick, and binding CpuPercent/GpuPercent/MemPercent to XAML.
- GPU sentinel value: Phase 8 must handle GpuPercent == -1f by displaying "N/A" or hiding the GPU row.
- Timer start/stop when StatsPanel is hidden/shown: per v1.2 Roadmap decision, Phase 8 must stop the stats timer when the panel is hidden.
- Dispose lifecycle: Phase 8 must call statsService.Dispose() from MainWindow.OnClosing.

## Self-Check: PASSED

- FOUND: `FuzzyClock.App/StatsService.cs`
- FOUND: `FuzzyClock.App/FuzzyClock.App.csproj` (updated)
- FOUND: `.planning/phases/07-statsservice/07-01-SUMMARY.md`
- FOUND: commit `ceb3468` (Task 1: feat — StatsService.cs + NuGet ref)
- FOUND: commit `4120551` (Task 2: chore — verification results documented)

---
*Phase: 07-statsservice*
*Completed: 2026-02-25*
