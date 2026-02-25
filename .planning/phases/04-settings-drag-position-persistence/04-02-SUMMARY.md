---
phase: 04-settings-drag-position-persistence
plan: 02
subsystem: ui
tags: [wpf, drag, position-persistence, settings, xaml]

# Dependency graph
requires:
  - phase: 04-settings-drag-position-persistence plan 01
    provides: AppSettings record and SettingsService (Load/Save/Clamp) with JSON persistence

provides:
  - MainWindow.xaml.cs with ApplySettings(), SaveSettings(), Grid_MouseLeftButtonDown(), and guards for _hasUserPosition and _savedPositionLoaded
  - App.xaml.cs wired to load settings before Show() and save on SessionEnding
  - MainWindow.xaml outer Grid wired for left-click drag via MouseLeftButtonDown
  - End-to-end drag + position persistence: drag repositions widget, saves immediately, restores on next launch with off-screen clamping

affects:
  - 05-font-size (shares settings JSON path and ApplySettings pattern)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ApplySettings() called after new MainWindow() but before Show() — the only safe assignment point for WindowStartupLocation=Manual"
    - "DragMove() blocking call in MouseLeftButtonDown handler — no BeginInvoke/await; SaveSettings() called immediately after return"
    - "Dual-flag guard pattern: _savedPositionLoaded (ContentRendered positioning) + _hasUserPosition (UpdatePhraseIfChanged snap guard)"
    - "SessionEnding handler as backup save for Windows log-off/shutdown where Window.Closing is not raised"

key-files:
  created: []
  modified:
    - FuzzyClock.App/MainWindow.xaml.cs
    - FuzzyClock.App/App.xaml.cs
    - FuzzyClock.App/MainWindow.xaml

key-decisions:
  - "ApplySettings() called before Show() — setting Left/Top after InitializeComponent() but before Show() is the documented safe point for WindowStartupLocation=Manual"
  - "LocationChanged fires reliably after DragMove() returns — _hasUserPosition set via LocationChanged event, not inline in Grid_MouseLeftButtonDown"
  - "SessionEnding + OnClosing both call SaveSettings() — belt-and-suspenders for all save paths including log-off/shutdown"
  - "DragMove() is a blocking Win32 modal loop — SaveSettings() called synchronously after return, no async needed"
  - "ContentRendered runs Clamp() after first layout pass when ActualWidth/ActualHeight are valid — only safe place to clamp saved position"

patterns-established:
  - "Load-Apply-Show pattern: SettingsService.Load() -> new MainWindow() -> ApplySettings() -> Show()"
  - "Dual-flag position guard: _savedPositionLoaded for ContentRendered, _hasUserPosition for phrase-update timer"

requirements-completed: [WIN-04, WIN-05]

# Metrics
duration: 3min
completed: 2026-02-25
---

# Phase 4 Plan 02: Settings + Drag Integration Summary

**WPF drag-to-reposition with immediate JSON save, startup position restore with off-screen clamping, and 5-minute snap guard — end-to-end position persistence wired through App.xaml.cs, MainWindow.xaml.cs, and MainWindow.xaml**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-02-25T02:46:44Z
- **Completed:** 2026-02-25T02:49:30Z
- **Tasks:** 2 of 3 (Task 3 is human verification checkpoint)
- **Files modified:** 3

## Accomplishments
- MainWindow.xaml.cs fully replaced with settings + drag implementation: ApplySettings(), SaveSettings(), Grid_MouseLeftButtonDown() with DragMove(), OnClosing save, and both _savedPositionLoaded/_hasUserPosition guards
- App.xaml.cs updated to load saved settings before Show() and add SessionEnding backup save handler for Windows log-off/shutdown
- MainWindow.xaml outer Grid wired with MouseLeftButtonDown="Grid_MouseLeftButtonDown" for left-click drag
- Build: 0 errors, 0 warnings after all changes

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace MainWindow.xaml.cs with full settings + drag implementation** - `ff7bbcc` (feat)
2. **Task 2: Wire App.xaml.cs and add MouseLeftButtonDown to MainWindow.xaml** - `856997a` (feat)
3. **Task 3: Human verify drag, persistence, clamp, and no-snap behavior** - _awaiting human verification_

## Files Created/Modified
- `FuzzyClock.App/MainWindow.xaml.cs` - Full replacement: ApplySettings(), SaveSettings(), Grid_MouseLeftButtonDown(), _hasUserPosition and _savedPositionLoaded guards, OnClosing save
- `FuzzyClock.App/App.xaml.cs` - Added SettingsService.Load(), ApplySettings() before Show(), SessionEnding handler
- `FuzzyClock.App/MainWindow.xaml` - Added MouseLeftButtonDown="Grid_MouseLeftButtonDown" on outer Grid

## Decisions Made
- ApplySettings() must be called after `new MainWindow()` but before `Show()` — setting Left/Top in the constructor (before InitializeComponent() completes) can be silently reset by the XAML parser
- LocationChanged event is the reliable mechanism to set _hasUserPosition; it fires during DragMove() when the window actually moves
- SessionEnding handler `(MainWindow as MainWindow)?.SaveSettings()` is the backup path since Window.Closing is not raised on Windows log-off/shutdown
- DragMove() is a synchronous blocking Win32 modal loop — SaveSettings() is called immediately after it returns with no async deferral needed

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Tasks 1 and 2 complete; build passes with 0 errors
- Awaiting Task 3 human verification: drag, persistence, clamp, and no-snap behavior
- After Task 3 approval, Phase 4 is complete and Phase 5 (font size) can begin

## Self-Check: PASSED

Files verified:
- `FuzzyClock.App/MainWindow.xaml.cs` — FOUND (contains _hasUserPosition, _savedPositionLoaded, ApplySettings, SaveSettings, Grid_MouseLeftButtonDown, OnClosing)
- `FuzzyClock.App/App.xaml.cs` — FOUND (contains SettingsService.Load, ApplySettings, SessionEnding)
- `FuzzyClock.App/MainWindow.xaml` — FOUND (contains Grid_MouseLeftButtonDown)

Commits verified:
- `ff7bbcc` — FOUND (feat(04-02): replace MainWindow.xaml.cs)
- `856997a` — FOUND (feat(04-02): wire SettingsService into App.xaml.cs)

---
*Phase: 04-settings-drag-position-persistence*
*Completed: 2026-02-25*
