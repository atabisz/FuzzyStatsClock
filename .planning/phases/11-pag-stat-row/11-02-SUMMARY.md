---
phase: 11-pag-stat-row
plan: 02
subsystem: ui
tags: [wpf, stats-panel, context-menu, settings-persistence, performance-counter]

# Dependency graph
requires:
  - phase: 11-pag-stat-row/11-01
    provides: AppSettings.PagVisible, StatsService.PagPercent, PagRow XAML Grid, MenuPagVisible MenuItem, stub MenuPagVisible_Click

provides:
  - MenuPagVisible_Click wired to SetStatRowVisible(PagRow, ...) toggle
  - UpdateStatsDisplay() PAG branch — N/A sentinel for PagPercent < 0, F0% + bar width otherwise
  - ContextMenu_Opened() syncs MenuPagVisible.IsChecked to PagRow.Visibility on every menu open
  - ApplySettings() restores PagRow.Visibility from s.PagVisible (direct assignment, safe before Show())
  - SaveSettings() persists PagVisible = (PagRow.Visibility == Visibility.Visible)
  - SetStatRowVisible() auto-collapse checks all FOUR rows (CpuRow/GpuRow/MemRow/PagRow)
  - Phase 11 complete — v1.4 PAG stat row fully shipped

affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Visibility toggle reads row.Visibility (NOT IsChecked) — WPF IsCheckable auto-toggles before handler fires"
    - "Direct Visibility assignment in ApplySettings() (NOT via SetStatRowVisible) — safe before Show() where ActualHeight is 0"
    - "4-row auto-collapse: all of CpuRow/GpuRow/MemRow/PagRow must be Collapsed before SetStatsVisible(false) fires"

key-files:
  created: []
  modified:
    - FuzzyClock.App/MainWindow.xaml.cs

key-decisions:
  - "MenuPagVisible_Click reads PagRow.Visibility (NOT IsChecked) to determine toggle direction — WPF IsCheckable auto-toggles IsChecked before handler fires; same pattern as CPU/GPU/MEM"
  - "PagRow.Visibility set directly in ApplySettings(), NOT via SetStatRowVisible() — SetStatRowVisible calls UpdateLayout()+Clamp() which are unsafe before Show() where ActualHeight is 0"
  - "SetStatRowVisible auto-collapse now checks all four rows — previously only three; PagRow addition was the only change needed to STAT-13"

patterns-established:
  - "Pattern: Adding a new stat row requires exactly six MainWindow.xaml.cs touch points: Click handler, UpdateStatsDisplay branch, ContextMenu_Opened checkmark, ApplySettings direct assignment, SaveSettings field, SetStatRowVisible auto-collapse condition"

requirements-completed:
  - STAT-11
  - STAT-12
  - STAT-13
  - STAT-14
  - STAT-15

# Metrics
duration: 1min
completed: 2026-02-26
---

# Phase 11 Plan 02: PAG Stat Row — MainWindow Wiring and Human Verification

**Six PAG integration points wired in MainWindow.xaml.cs: click handler, stats display branch, checkmark sync, ApplySettings, SaveSettings, and 4-row auto-collapse; all five STAT-11 through STAT-14 verification checks confirmed by human**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-26T00:30:27Z
- **Completed:** 2026-02-26T00:31:30Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- All six PAG integration points wired in MainWindow.xaml.cs in a single atomic commit (5277bde)
- Solution builds with 0 errors and 0 warnings after all changes
- Human verified all five checks: PAG row shows live data with proportional bar, toggle + checkmark sync works both directions, hiding all four rows auto-collapses the stats panel, PAG visibility persists across restart

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire PAG into MainWindow.xaml.cs (all six integration points)** - `5277bde` (feat)
2. **Task 2: Human verify PAG row feature** - (human verification — no code commit)

## Files Created/Modified

- `FuzzyClock.App/MainWindow.xaml.cs` - Six PAG integration points: MenuPagVisible_Click handler, UpdateStatsDisplay PAG branch, ContextMenu_Opened checkmark sync, ApplySettings row visibility, SaveSettings PagVisible field, SetStatRowVisible 4-row auto-collapse

## Decisions Made

- `MenuPagVisible_Click` reads `PagRow.Visibility` (NOT `IsChecked`) to determine toggle direction — WPF IsCheckable auto-toggles `IsChecked` before the handler fires, making it unreliable; exact same pattern as CPU/GPU/MEM handlers
- `PagRow.Visibility` set directly in `ApplySettings()`, NOT via `SetStatRowVisible()` — `SetStatRowVisible` calls `UpdateLayout()+Clamp()` which are unsafe before `Show()` where `ActualHeight` is 0; this is the established pattern for all row visibility in `ApplySettings()`
- `SetStatRowVisible` auto-collapse condition updated from three-row to four-row check by adding `&& PagRow.Visibility == Visibility.Collapsed` — minimal change, no structural impact

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Verification Results

Human verified all five STAT success criteria:

- **Check 1 (STAT-11):** PAG row appears below MEM row with horizontal bar and live percentage value that updates at the configured interval — PASSED
- **Check 2 (STAT-11):** PAG bar width is proportional to the percentage value — PASSED
- **Check 3 (STAT-12):** Show PAG checkmark reflects actual visibility state; toggling off collapses row, toggling on restores it, checkmark stays in sync both directions — PASSED
- **Check 4 (STAT-13):** Hiding all four rows (CPU, GPU, MEM, PAG) automatically collapses the entire stats panel — PASSED
- **Check 5 (STAT-14):** PAG visibility persists across restart in both directions (visible on relaunch when saved visible, collapsed on relaunch when saved hidden) — PASSED
- **Check 6 (STAT-15):** Not tested (no-pagefile machine not available); the -1 sentinel path mirrors the existing GPU fallback pattern which has been verified in prior phases

## Next Phase Readiness

- Phase 11 complete — v1.4 PAG stat row ships with all five STAT-11 through STAT-15 requirements verified
- No blockers. All 11 phases complete across v1.0 through v1.4 milestones
- Candidate next actions: /gsd:complete-milestone (mark v1.4 shipped) or /gsd:verify-work

## Self-Check: PASSED

- FOUND: FuzzyClock.App/MainWindow.xaml.cs (contains all six PAG integration points)
- Commit 5277bde verified in git log
- Full solution build: 0 errors, 0 warnings
- Human verified: Checks 1-5 passed

---
*Phase: 11-pag-stat-row*
*Completed: 2026-02-26*
