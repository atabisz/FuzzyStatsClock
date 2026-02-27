---
phase: 23-data-display
plan: 01
subsystem: ui
tags: [wpf, stats, uptime, cpu, rolling-average, queue]

# Dependency graph
requires:
  - phase: 22-infrastructure-and-toggle
    provides: UptimeText TextBlock, UptimeRow Grid, UptimeVisible AppSettings field, SetUptimeRowVisible()
  - phase: 7-stats-data-layer
    provides: StatsService with CpuPercent, Refresh(), _initialized

provides:
  - StatsService.IsReady property (exposes _initialized as public bool)
  - _isHoverFastRefresh flag gates buffer push to prevent window size corruption
  - _cpuSamples Queue<float> with interval-aware 15-minute rolling window
  - UpdateUptimeDisplay() with cold-start guard, hover guard, uptime formatting, load averages
  - ComputeAvg() static helper for time-window CPU averages
  - Live uptime row: "up Xd Xh Xm   0.52  0.47  0.43" with leading-zero-unit suppression
affects:
  - Future phases reading UptimeText content
  - Any phase modifying stats timer interval (window sizing depends on _statsIntervalSeconds)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Rolling average via Queue<float> trimmed to ceil(windowSeconds / intervalSeconds) samples each tick"
    - "Cold-start guard: skip buffer push until StatsService.IsReady (volatile bool, ~6s init time)"
    - "Hover guard: skip buffer push when _isHoverFastRefresh=true to prevent window size corruption at 0.5s cadence"
    - "TickCount64 (Int64) exclusively — never TickCount (Int32, wraps at 24.9 days)"
    - "Change guard on TextBlock.Text prevents spurious layout invalidation on sub-minute ticks"

key-files:
  created: []
  modified:
    - FuzzyClock.App/StatsService.cs
    - FuzzyClock.App/MainWindow.xaml.cs

key-decisions:
  - "IsReady reads _initialized (volatile bool) without lock — volatile write/read guarantees correctness from Dispatcher thread"
  - "Buffer push skipped during hover fast-refresh (0.5s cadence) — prevents 6x oversampling that would corrupt labeled time windows"
  - "Window sizes computed as ceil(windowSeconds / _statsIntervalSeconds) — interval-aware, not hardcoded sample counts"
  - "TickCount64 (Int64 ms) used exclusively; TickCount (Int32) would wrap in ~24.9 days"
  - "avg15m uses full queue average (not a fixed window) — represents all samples up to 15-minute cap"

patterns-established:
  - "Rolling window pattern: Queue<float> + Enqueue + trim-to-maxSamples on each tick"
  - "Multi-guard early exit: visibility check, ready check, hover check — in that order"

requirements-completed: [UPT-01]

# Metrics
duration: 2min
completed: 2026-02-27
---

# Phase 23 Plan 01: Data Display Summary

**Live uptime row with three rolling CPU load averages via Queue<float>, protected by IsReady and _isHoverFastRefresh guards**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-27T10:47:29Z
- **Completed:** 2026-02-27T10:49:30Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- StatsService.IsReady property added — exposes `_initialized` (volatile bool) with zero overhead
- `_isHoverFastRefresh` flag gates buffer push, preventing 6x oversampling at 0.5s hover cadence
- `_cpuSamples Queue<float>` with 15-minute rolling window trimmed to `ceil(windowSeconds / _statsIntervalSeconds)` each tick
- `UpdateUptimeDisplay()` delivers `up Xd Xh Xm   0.52  0.47  0.43` format with all guards and change protection
- `ComputeAvg()` static helper correctly handles warm-up period (fewer samples than window size)
- Build: 0 errors, 0 warnings

## Task Commits

Each task was committed atomically:

1. **Task 1: StatsService.IsReady property and _isHoverFastRefresh flag** - `ca79797` (feat)
2. **Task 2: _cpuSamples field, UpdateUptimeDisplay(), ComputeAvg(), tick handler expansion** - `97dc80e` (feat)

**Plan metadata:** _(docs commit — see below)_

## Files Created/Modified

- `FuzzyClock.App/StatsService.cs` - Added `IsReady => _initialized` property with .NET 11 compatibility note
- `FuzzyClock.App/MainWindow.xaml.cs` - Added `_isHoverFastRefresh`, `_cpuSamples`, `UpdateUptimeDisplay()`, `ComputeAvg()`, expanded `_statsTimer.Tick` to block lambda

## Decisions Made

- **IsReady without lock:** `_initialized` is `volatile bool`; volatile write in `Initialize()` (background thread) guarantees the Dispatcher thread always reads the latest value — no lock needed.
- **Hover flag placement:** `_isHoverFastRefresh` set/cleared inside the `StatsPanel.Visibility != Visible` guard, so it is always false when stats are hidden — no spurious skips when stats panel is toggled off.
- **Window size formula:** `ceil(windowSeconds / _statsIntervalSeconds)` rather than hardcoded counts — adapts automatically when user changes interval (1s/3s/10s).
- **avg15m implementation:** Uses full queue average (no fixed count ceiling), because the queue itself is capped at 15 minutes worth of samples.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The only intermediate warning (`CS0414: _isHoverFastRefresh assigned but never used`) was expected and cleared automatically when Task 2 added the usage.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- UPT-01 complete: uptime row shows live `up Xh Xm   0.52  0.47  0.43` data on every stats tick
- Phase 23 (data display) is fully complete — no further plans in this phase
- v2.1 milestone complete: UptimeRow infrastructure (Phase 22) + live data (Phase 23) both done

## Self-Check: PASSED

- FOUND: FuzzyClock.App/StatsService.cs
- FOUND: FuzzyClock.App/MainWindow.xaml.cs
- FOUND: .planning/phases/23-data-display/23-01-SUMMARY.md
- FOUND: ca79797 (Task 1 commit)
- FOUND: 97dc80e (Task 2 commit)

---
*Phase: 23-data-display*
*Completed: 2026-02-27*
