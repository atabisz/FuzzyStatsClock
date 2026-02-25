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
    - "Re-clamp after phrase change — SizeToContent window resize can shift widget off-screen; clamp after each UpdateLayout()"

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
  - "Re-clamp on every phrase change — SizeToContent=WidthAndHeight resizes window on phrase update; widget near edges can be pushed off-screen"

patterns-established:
  - "Load-Apply-Show pattern: SettingsService.Load() -> new MainWindow() -> ApplySettings() -> Show()"
  - "Dual-flag position guard: _savedPositionLoaded for ContentRendered, _hasUserPosition for phrase-update timer"
  - "Clamp after resize: call SettingsService.Clamp() after any UpdateLayout() that may change ActualWidth/ActualHeight"

requirements-completed: [WIN-04, WIN-05]

# Metrics
duration: ~10min
completed: 2026-02-25
---

# Phase 4 Plan 02: Settings + Drag Integration Summary

**WPF drag-to-reposition with immediate JSON save, startup position restore with off-screen clamping, phrase-update snap guard, and re-clamp after phrase resize — end-to-end position persistence wired through App.xaml.cs, MainWindow.xaml.cs, and MainWindow.xaml**

## Performance

- **Duration:** ~10 min (including human verification)
- **Started:** 2026-02-25T02:46:44Z
- **Completed:** 2026-02-25
- **Tasks:** 3 of 3 complete (Tasks 1-2 auto; Task 3 checkpoint approved)
- **Files modified:** 3

## Accomplishments

- MainWindow.xaml.cs fully replaced with settings + drag implementation: ApplySettings(), SaveSettings(), Grid_MouseLeftButtonDown() with DragMove(), OnClosing save, and both _savedPositionLoaded/_hasUserPosition guards
- App.xaml.cs updated to load saved settings before Show() and add SessionEnding backup save handler for Windows log-off/shutdown
- MainWindow.xaml outer Grid wired with MouseLeftButtonDown="Grid_MouseLeftButtonDown" for left-click drag
- Human verification approved: all 5 checks passed (first-launch top-right, drag moves widget, position persists across restart, no snap at phrase boundary, off-screen clamp)
- Build: 0 errors after all changes including two auto-fixed bugs

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace MainWindow.xaml.cs with full settings + drag implementation** - `ff7bbcc` (feat)
2. **Task 2: Wire App.xaml.cs and add MouseLeftButtonDown to MainWindow.xaml** - `856997a` (feat)
3. **Deviation fix: Clamp window fully within screen bounds** - `9343668` (fix)
4. **Deviation fix: Re-clamp position after every phrase change** - `eb3b126` (fix)
5. **Task 3: Human verify drag, persistence, clamp, and no-snap behavior** - approved (checkpoint — no code commit)

**Plan metadata:** `82cbc2e` (docs: complete drag + position persistence plan — at checkpoint:human-verify)

## Files Created/Modified

- `FuzzyClock.App/MainWindow.xaml.cs` - Full replacement: ApplySettings(), SaveSettings(), Grid_MouseLeftButtonDown(), _hasUserPosition and _savedPositionLoaded guards, OnClosing save, re-clamp in UpdatePhraseIfChanged()
- `FuzzyClock.App/App.xaml.cs` - Added SettingsService.Load(), ApplySettings() before Show(), SessionEnding handler
- `FuzzyClock.App/MainWindow.xaml` - Added MouseLeftButtonDown="Grid_MouseLeftButtonDown" on outer Grid

## Decisions Made

- ApplySettings() must be called after `new MainWindow()` but before `Show()` — setting Left/Top in the constructor (before InitializeComponent() completes) can be silently reset by the XAML parser
- LocationChanged event is the reliable mechanism to set _hasUserPosition; it fires during DragMove() when the window actually moves
- SessionEnding handler `(MainWindow as MainWindow)?.SaveSettings()` is the backup path since Window.Closing is not raised on Windows log-off/shutdown
- DragMove() is a synchronous blocking Win32 modal loop — SaveSettings() is called immediately after it returns with no async deferral needed
- Re-clamp after every phrase change: SizeToContent=WidthAndHeight resizes the window on each phrase update; widget near the right or bottom edge can be partially pushed off-screen

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Clamped window fully within screen bounds**
- **Found during:** Task 2 post-build testing
- **Issue:** Original clamp logic did not subtract window width/height from the right/bottom bounds, allowing the widget to be placed such that part of it extended off-screen
- **Fix:** Updated clamping to subtract ActualWidth from the right bound and ActualHeight from the bottom bound so the full widget stays within the virtual screen
- **Files modified:** `FuzzyClock.App/MainWindow.xaml.cs`
- **Verification:** Off-screen clamp check (test step 5) confirmed widget fully visible after launch with Left=99999, Top=99999 in settings.json
- **Committed in:** `9343668`

**2. [Rule 1 - Bug] Re-clamp position after every phrase change**
- **Found during:** Post-fix testing of clamp behavior with SizeToContent resizing
- **Issue:** When the phrase text changes, SizeToContent=WidthAndHeight resizes the window. If positioned near the right or bottom edge, the resize pushes the widget partially off-screen between phrase boundaries
- **Fix:** Added a SettingsService.Clamp() call at the end of UpdatePhraseIfChanged() after UpdateLayout() runs, re-applying bounds after each resize
- **Files modified:** `FuzzyClock.App/MainWindow.xaml.cs`
- **Verification:** Widget remained fully on-screen after phrase changes while positioned near screen edges
- **Committed in:** `eb3b126`

---

**Total deviations:** 2 auto-fixed (both Rule 1 - Bug)
**Impact on plan:** Both fixes necessary for correct off-screen clamping behavior. Both are direct consequences of SizeToContent=WidthAndHeight window resizing interactions with screen boundaries. No scope creep.

## Issues Encountered

None beyond the two auto-fixed bugs documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 4 complete: settings infrastructure (Plan 01) + drag and persistence wire-up (Plan 02) both done and human-verified
- Phase 5 (font size setting) can build on the established ApplySettings/SaveSettings pattern
- AppSettings record already has FontSize field; Phase 5 adds UI control to modify it and persists the change through the same JSON path
- No blockers

## Self-Check: PASSED

Files verified:
- `FuzzyClock.App/MainWindow.xaml.cs` — FOUND (contains _hasUserPosition, _savedPositionLoaded, ApplySettings, SaveSettings, Grid_MouseLeftButtonDown, OnClosing)
- `FuzzyClock.App/App.xaml.cs` — FOUND (contains SettingsService.Load, ApplySettings, SessionEnding)
- `FuzzyClock.App/MainWindow.xaml` — FOUND (contains Grid_MouseLeftButtonDown)

Commits verified:
- `ff7bbcc` — FOUND (feat(04-02): replace MainWindow.xaml.cs)
- `856997a` — FOUND (feat(04-02): wire SettingsService into App.xaml.cs)
- `9343668` — FOUND (fix(04-02): clamp window fully within screen bounds)
- `eb3b126` — FOUND (fix(04-02): re-clamp position after every phrase change)

---
*Phase: 04-settings-drag-position-persistence*
*Completed: 2026-02-25*
