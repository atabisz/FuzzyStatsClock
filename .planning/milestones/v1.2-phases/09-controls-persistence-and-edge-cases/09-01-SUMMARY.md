---
phase: 09-controls-persistence-and-edge-cases
plan: "01"
subsystem: ui
tags: [wpf, xaml, dispatchertimer, context-menu, settings-persistence, stats]

# Dependency graph
requires:
  - phase: 08-xaml-layout-and-stats-display
    provides: StatsPanel XAML layout, _statsTimer creation, UpdateStatsDisplay(), _statsIntervalSeconds field, AppSettings with StatsVisible/StatsIntervalSeconds
  - phase: 06-appsettings-migration
    provides: init-property AppSettings record with StatsVisible/StatsIntervalSeconds fields and Load() guard
  - phase: 07-stats-data-layer
    provides: StatsService with PDH counters and _gpuAvailable fallback
provides:
  - Stats show/hide toggle wired to MenuShowStats_Click via SetStatsVisible()
  - Interval selector (1s/3s/10s) wired to MenuInterval1/3/10_Click via SetStatsInterval()
  - ContextMenu_Opened extended with 4 stats IsChecked assignments
  - SaveSettings extended with StatsVisible and StatsIntervalSeconds fields
  - ApplySettings extended with direct StatsPanel.Visibility assignment
  - ContentRendered extended with conditional _statsTimer.Start() on startup
  - Bottom-edge re-clamp on stats panel show (UpdateLayout + Clamp when _hasUserPosition)
  - Stats timer lifecycle: stops on hide, starts on show, stops on close
affects: [future stats feature changes, settings migration, phase 10 if any]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - SetStatsVisible() mirrors ApplyFontSize() pattern — calls UpdateLayout()+Clamp() only after Show(), guarded by _hasUserPosition
    - SetStatsInterval() uses Stop+set+Start to make new interval take effect immediately (not deferred to end of current tick)
    - Click handlers read authoritative UI state (StatsPanel.Visibility) rather than IsChecked which WPF auto-toggles before handler fires
    - ContextMenu_Opened is the single sync point for all IsChecked assignments — click handlers never touch IsChecked

key-files:
  created: []
  modified:
    - FuzzyClock.App/MainWindow.xaml
    - FuzzyClock.App/MainWindow.xaml.cs

key-decisions:
  - "MenuShowStats_Click reads StatsPanel.Visibility (NOT IsChecked) to determine toggle direction — WPF IsCheckable auto-toggles IsChecked before the click handler fires, making it unreliable as state source"
  - "ApplySettings() sets StatsPanel.Visibility directly (NOT via SetStatsVisible) — SetStatsVisible calls UpdateLayout()+Clamp() which are unsafe before Show() where ActualHeight is 0"
  - "ContentRendered is the safe first point to conditionally start _statsTimer — ApplySettings() runs before Show() when _statsTimer does not yet exist"
  - "SetStatsInterval() uses Stop+set+Start pattern — updating DispatcherTimer.Interval on a running timer only takes effect after the current interval expires"
  - "Re-clamp on SetStatsVisible(true) guarded by _hasUserPosition=true — mirrors ApplyFontSize() pattern; no-position case uses PositionTopRight() which places widget at top-right where downward growth is safe"

patterns-established:
  - "Timer lifecycle pattern: stop timer on hide, start timer on show, stop on close — no background PDH reads when panel invisible"
  - "Visibility-as-truth: StatsPanel.Visibility is the authoritative state for StatsVisible; SaveSettings reads from Visibility not a field"

requirements-completed: [STAT-03, STAT-04, STAT-05]

# Metrics
duration: ~15min
completed: 2026-02-26
---

# Phase 9 Plan 01: Stats Controls Persistence Summary

**Stats show/hide toggle, 1s/3s/10s interval selector, and full persistence round-trip wired into WPF context menu with timer lifecycle management and off-screen re-clamp**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-02-26
- **Completed:** 2026-02-26
- **Tasks:** 2 (1 auto + 1 human-verify)
- **Files modified:** 2

## Accomplishments
- Stats show/hide toggle fully wired: clicking "Show Stats" in the right-click menu toggles the panel, saves state, and re-clamps the widget if near a screen edge
- Interval selector wired: 1s/3s/10s menu items call SetStatsInterval() with Stop+set+Start for immediate effect
- Full persistence round-trip verified: StatsVisible and StatsIntervalSeconds survive app restart with exact values restored
- ContextMenu_Opened extended with 4 stats IsChecked assignments so checkmarks always reflect current state
- Timer lifecycle complete: stats timer stops on panel hide, starts on show, stops on close — no wasted PDH reads when panel is Collapsed
- All 6 human-verify behavioral checks passed including bottom-edge re-clamp and clean shutdown

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire stats controls** - `1a4dce7` (feat)
2. **Task 2: Human verify checkpoint** - approved by user (no commit — verification only)

**Plan metadata:** (this docs commit)

## Files Created/Modified
- `FuzzyClock.App/MainWindow.xaml` - Added Click= attributes to MenuShowStats, MenuInterval1, MenuInterval3, MenuInterval10
- `FuzzyClock.App/MainWindow.xaml.cs` - Added SetStatsVisible() with re-clamp and timer lifecycle; SetStatsInterval() with Stop+set+Start; MenuShowStats_Click reading StatsPanel.Visibility; MenuInterval1/3/10_Click; extended ContextMenu_Opened with 4 stats IsChecked lines; extended SaveSettings() with StatsVisible+StatsIntervalSeconds; extended ApplySettings() with direct StatsPanel.Visibility assignment; extended ContentRendered with conditional _statsTimer.Start block

## Decisions Made
- MenuShowStats_Click reads StatsPanel.Visibility (NOT IsChecked) as the toggle direction source — WPF IsCheckable auto-toggles IsChecked before the handler fires
- ApplySettings() uses direct Visibility assignment, not SetStatsVisible() — the latter calls UpdateLayout()+Clamp() which are no-ops before Show() where ActualHeight is 0
- ContentRendered is the safe first point for conditional timer start — _statsTimer does not exist during ApplySettings()
- SetStatsInterval() uses Stop+set+Start — updating Interval on a live DispatcherTimer only takes effect after the current tick completes otherwise

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None — all 8 code change points applied cleanly, build produced 0 errors, all 51 PhraseEngine tests passed, and all 6 human-verify behavioral checks passed on first run.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 9 is the final v1.2 phase — all stats requirements (STAT-03, STAT-04, STAT-05) are now complete
- v1.2 feature set is fully delivered: live CPU/GPU/MEM stats with user-controllable visibility, interval, and persistence
- App is ready for v1.2 release or any future enhancement phases

## Self-Check: PASSED

- FOUND: .planning/phases/09-controls-persistence-and-edge-cases/09-01-SUMMARY.md
- FOUND: commit 1a4dce7 (feat(09-01): wire stats controls, persistence round-trip, and edge cases)

---
*Phase: 09-controls-persistence-and-edge-cases*
*Completed: 2026-02-26*
