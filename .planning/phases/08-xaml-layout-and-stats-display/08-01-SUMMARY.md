---
phase: 08-xaml-layout-and-stats-display
plan: 01
subsystem: ui
tags: [wpf, xaml, dispatchertimer, statsservice, progressbar, contextmenu]

# Dependency graph
requires:
  - phase: 07-statsservice
    provides: StatsService with CpuPercent/GpuPercent/MemPercent properties and IDisposable
  - phase: 06-appsettings-migration
    provides: AppSettings init-property record with StatsIntervalSeconds field
provides:
  - Two-row WPF Grid layout (phrase row + stats row) with named elements ready for Phase 9 wiring
  - StatsPanel StackPanel with 9 named XAML elements (3 track borders, 3 fill borders, 3 text blocks)
  - Stats ContextMenu submenu with 4 named checkable items (MenuShowStats, MenuInterval1/3/10)
  - UpdateStatsDisplay() method wiring _statsService.Refresh() to bar widths and text
  - _statsTimer initialized and ticked but NOT started (Phase 9 owns start/stop lifecycle)
  - _statsService created in ContentRendered, disposed in OnClosing
affects: [09-stats-ui-controls]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Nested Border pattern for progress bars (outer track + inner fill) — required by AllowsTransparency=True which disables DropShadowEffect GPU path"
    - "Fixed Width=180 on StatsPanel prevents SizeToContent=WidthAndHeight window-width jitter"
    - "Visibility=Collapsed (not Hidden) used on StatsPanel to remove all layout space"
    - "_statsTimer created but not started — Phase 9 starts/stops timer as user toggles stats"

key-files:
  created: []
  modified:
    - FuzzyClock.App/MainWindow.xaml
    - FuzzyClock.App/MainWindow.xaml.cs

key-decisions:
  - "_statsTimer created in ContentRendered but NOT started — StatsPanel is Collapsed by default, Phase 9 owns start/stop lifecycle to prevent wasted PDH reads"
  - "UpdateStatsDisplay() handles GpuPercent < 0f sentinel with N/A text and zero bar width — same sentinel from Phase 7 StatsService"
  - "ApplySettings() extended with _statsIntervalSeconds = s.StatsIntervalSeconds for interval persistence — StatsVisible wiring deferred to Phase 9"
  - "OnClosing disposes _statsService before SaveSettings() — ensures PDH counters released before settings write"

patterns-established:
  - "Stats display pattern: Refresh() then read properties then update Width+Text — all on UI thread via DispatcherTimer"
  - "Nested Border bars: outer Border=track (fixed CornerRadius), inner Border=fill (HorizontalAlignment=Left, Width set programmatically)"

requirements-completed: [STAT-01, STAT-02]

# Metrics
duration: 3min
completed: 2026-02-26
---

# Phase 8 Plan 01: XAML Layout and Stats Display Summary

**WPF two-row Grid layout with named CPU/GPU/MEM progress bars, Stats ContextMenu, and wired UpdateStatsDisplay() method using nested Border pattern on AllowsTransparency window**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-02-26T07:38:47Z
- **Completed:** 2026-02-26T07:41:14Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Restructured MainWindow.xaml from single-Border layout to two-row inner Grid with phrase row (Row 0) and stats panel row (Row 1)
- StatsPanel StackPanel with Width=180 and Visibility=Collapsed containing 9 named bar/text elements (CpuBarTrack/CpuBar/CpuText, GpuBarTrack/GpuBar/GpuText, MemBarTrack/MemBar/MemText)
- Stats ContextMenu submenu with MenuShowStats + MenuInterval1/3/10 checkable items (click handlers deferred to Phase 9)
- UpdateStatsDisplay() method with GPU N/A sentinel handling, _statsTimer initialized but not started, _statsService properly disposed in OnClosing

## Task Commits

Each task was committed atomically:

1. **Task 1: Restructure MainWindow.xaml — inner Grid row split, StatsPanel, Stats ContextMenu** - `5471847` (feat)
2. **Task 2: Wire StatsService + UpdateStatsDisplay + _statsTimer in MainWindow.xaml.cs** - `2904413` (feat)

**Plan metadata:** (docs commit, see below)

## Files Created/Modified
- `FuzzyClock.App/MainWindow.xaml` - Two-row inner Grid, StatsPanel with 9 named bar elements, Stats ContextMenu submenu with 4 named items
- `FuzzyClock.App/MainWindow.xaml.cs` - _statsTimer/_statsService/_statsIntervalSeconds fields, ApplySettings extended, UpdateStatsDisplay() added, ContentRendered and OnClosing updated

## Decisions Made
- _statsTimer is NOT started in ContentRendered — Phase 9 starts it when user enables stats (prevents wasted PDH reads while panel is hidden)
- UpdateStatsDisplay() handles GpuPercent < 0f sentinel from StatsService: shows "N/A" text and zero bar width
- ApplySettings() reads s.StatsIntervalSeconds but StatsVisible toggle is deferred to Phase 9 (StatsPanel Visibility hardcoded in XAML)
- OnClosing calls _statsService?.Dispose() before SaveSettings() to ensure PDH counter handles are released

## Deviations from Plan

None - plan executed exactly as written.

Note: The plan's verification step referenced `FuzzyClock.Tests/FuzzyClock.Tests.csproj` but the actual project is `FuzzyClock.Core.Tests/FuzzyClock.Core.Tests.csproj`. This is a pre-existing naming discrepancy in the plan text; tests were run with the correct path and all 51 passed.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 9 (Stats UI Controls) can now reference all 13 named XAML elements: StatsPanel, MenuShowStats, MenuInterval1/3/10, CpuBarTrack/CpuBar/CpuText, GpuBarTrack/GpuBar/GpuText, MemBarTrack/MemBar/MemText
- _statsTimer and _statsService are initialized but idle — Phase 9 calls _statsTimer.Start() when MenuShowStats is checked
- ApplySettings() already reads _statsIntervalSeconds; Phase 9 extends SaveSettings() to persist StatsVisible

---
*Phase: 08-xaml-layout-and-stats-display*
*Completed: 2026-02-26*
