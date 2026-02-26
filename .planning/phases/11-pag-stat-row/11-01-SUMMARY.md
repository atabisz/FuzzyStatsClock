---
phase: 11-pag-stat-row
plan: 01
subsystem: ui
tags: [wpf, performance-counter, pdh, appsettings, stats-panel]

# Dependency graph
requires:
  - phase: 10-individual-stat-visibility
    provides: CpuVisible/GpuVisible/MemVisible init-property pattern, SetStatRowVisible, XAML row structure
provides:
  - AppSettings.PagVisible bool init-property (default true)
  - SettingsService.Defaults() includes PagVisible = true
  - StatsService.PagPercent property with PDH "Paging File"/"% Usage"/"_Total" counter
  - MainWindow.xaml PagRow Grid (PagBarTrack, PagBar, PagText) below MemRow
  - MainWindow.xaml MenuPagVisible MenuItem (IsCheckable=True) in Stats submenu
  - Stub MenuPagVisible_Click handler in MainWindow.xaml.cs
affects: [11-02-PLAN.md]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "PDH point-in-time ratio counter (no priming) — same as MEM, different from CPU/GPU rate counters"
    - "4-param PerformanceCounter constructor for multi-instance categories (Paging File has _Total + per-file instances)"
    - "PerformanceCounterCategory.Exists() + try/catch double guard for no-pagefile edge case"

key-files:
  created: []
  modified:
    - FuzzyClock.App/AppSettings.cs
    - FuzzyClock.App/SettingsService.cs
    - FuzzyClock.App/StatsService.cs
    - FuzzyClock.App/MainWindow.xaml
    - FuzzyClock.App/MainWindow.xaml.cs

key-decisions:
  - "Used 4-param PerformanceCounter(category, counter, instance, readOnly) constructor — 3-param (string,string,bool) throws for multi-instance Paging File category"
  - "No priming call for PAG counter — % Usage is a PERF_RAW_FRACTION ratio counter, returns valid data on first call (unlike CPU/GPU rate counters)"
  - "PerformanceCounterCategory.Exists() check plus try/catch: Exists() may return true even when no pagefile configured (category registered but no instances); try/catch is the essential guard"
  - "Stub MenuPagVisible_Click added to MainWindow.xaml.cs — WPF validates XAML event handlers at compile time against the partial class"
  - "PagPercent initialized to -1f (unavailable sentinel) at field declaration; set to 0f or -1f in Initialize() based on _pagAvailable result"

patterns-established:
  - "Pattern: PAG counter init follows GPU availability guard pattern exactly (_pagAvailable flag + try/catch + -1 sentinel)"
  - "Pattern: Ratio counter (PAG/MEM) requires no priming; rate counter (CPU/GPU) requires NextValue() discard on init"

requirements-completed:
  - STAT-11
  - STAT-14
  - STAT-15

# Metrics
duration: 2min
completed: 2026-02-26
---

# Phase 11 Plan 01: PAG Stat Row — Data Layer, Settings Field, and XAML Skeleton

**PAG stat row data layer and UI skeleton: AppSettings.PagVisible field, StatsService PDH counter for "Paging File"/"% Usage"/"_Total" with -1 sentinel, XAML PagRow Grid below MemRow, and MenuPagVisible MenuItem stub**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-26T00:25:13Z
- **Completed:** 2026-02-26T00:27:31Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- AppSettings.PagVisible bool init-property (default true) added, round-trips through System.Text.Json without affecting existing settings files
- StatsService.PagPercent property with full PDH lifecycle: 4-param constructor in try/catch after category existence check, point-in-time read in Refresh(), cleanup in Dispose()
- MainWindow.xaml PagRow Grid (identical structure to CpuRow/GpuRow/MemRow) and MenuPagVisible MenuItem wired to stub handler; solution builds 0 errors 0 warnings

## Task Commits

Each task was committed atomically:

1. **Task 1: Add PagVisible to AppSettings and SettingsService.Defaults()** - `1dea8b1` (feat)
2. **Task 2: Add PagPercent to StatsService (init, refresh, dispose)** - `2744d0e` (feat)
3. **Task 3: Add PagRow Grid and MenuPagVisible MenuItem to MainWindow.xaml** - `a814493` (feat)

## Files Created/Modified

- `FuzzyClock.App/AppSettings.cs` - Added PagVisible bool init-property (default true) after MemVisible
- `FuzzyClock.App/SettingsService.cs` - Added PagVisible = true to Defaults() object initializer
- `FuzzyClock.App/StatsService.cs` - Added _pagCounter/_pagAvailable fields, PagPercent property, PDH init/refresh/dispose
- `FuzzyClock.App/MainWindow.xaml` - Added PagRow Grid below MemRow; added MenuPagVisible MenuItem after MenuMemVisible
- `FuzzyClock.App/MainWindow.xaml.cs` - Added stub MenuPagVisible_Click handler (empty body, satisfies compiler)

## Decisions Made

- Used 4-param `PerformanceCounter("Paging File", "% Usage", "_Total", readOnly: true)` — the 3-param `(string, string, bool)` overload throws `InvalidOperationException` for multi-instance categories like Paging File
- No priming call for PAG counter: "% Usage" is a ratio counter (PERF_RAW_FRACTION), returns valid data on first `NextValue()` call — unlike CPU/GPU rate counters that return 0 on first call
- Double guard for no-pagefile edge case: `PerformanceCounterCategory.Exists("Paging File")` as first check (mirrors GPU pattern) plus `try/catch` wrapping counter construction (essential guard, since category is always registered even without pagefile)
- Stub `MenuPagVisible_Click` added to MainWindow.xaml.cs — WPF XAML event handler references are validated against the partial class at compile time; empty stub prevents CS0117 build error
- `PagPercent` initialized to `-1f` at field declaration so the sentinel is always correct even if `Initialize()` is slow (the `-1f` field value holds until initialization completes)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 11-02 can proceed immediately: all three building blocks (PagPercent data source, PagVisible settings field, PagRow/MenuPagVisible UI elements) are in place
- Plan 11-02 tasks: wire MenuPagVisible_Click (replace stub), add PAG branch to UpdateStatsDisplay(), sync MenuPagVisible.IsChecked in ContextMenu_Opened, extend ApplySettings() and SaveSettings() for PagRow, fix SetStatRowVisible auto-collapse to include PagRow

## Self-Check: PASSED

- FOUND: FuzzyClock.App/AppSettings.cs (contains PagVisible)
- FOUND: FuzzyClock.App/SettingsService.cs (contains PagVisible = true)
- FOUND: FuzzyClock.App/StatsService.cs (contains _pagCounter, PagPercent)
- FOUND: FuzzyClock.App/MainWindow.xaml (contains PagRow, MenuPagVisible)
- FOUND: FuzzyClock.App/MainWindow.xaml.cs (contains stub MenuPagVisible_Click)
- FOUND: .planning/phases/11-pag-stat-row/11-01-SUMMARY.md
- Commits: 1dea8b1, 2744d0e, a814493 — all verified in git log
- Full solution build: 0 errors, 0 warnings

---
*Phase: 11-pag-stat-row*
*Completed: 2026-02-26*
