---
phase: 42-settings-window-infrastructure
plan: 03
subsystem: ui
tags: [wpf, settings-window, tray-menu, live-apply, singleton-window, event-wiring]

# Dependency graph
requires:
  - phase: 42-02
    provides: SettingsWindow with 19 Action events and _suppressEvents guard
provides:
  - OpenSettings() singleton guard in MainWindow
  - GetCurrentSettingsSnapshot() populate-on-open factory
  - TrayMenuBuilder pruned to 8 items + 2 separators + About
  - Full Settings window live-apply wiring (19 event subscriptions)
affects: [43-settings-window-wiring]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Singleton window open guard: check IsVisible, Activate() if already open
    - Populate-on-open: GetCurrentSettingsSnapshot() captures all state at open time
    - Tray callbacks fire on tray thread; Dispatcher.Invoke gates all MainWindow mutations
    - _currentPhraseStyle separate from _currentTextStyle; both persisted via SaveSettings

key-files:
  created: []
  modified:
    - FuzzyClock.App/MainWindow.xaml.cs
    - FuzzyClock.App/TrayMenuBuilder.cs

key-decisions:
  - "TrayMenuBuilder shrunk from ~43 tray items to 8+About; all deep submenus removed in favour of SettingsWindow"
  - "OpenSettings() is a MainWindow private method, called from tray via Dispatcher.Invoke wrapper"
  - "_settingsWindow field nulled in Closed handler so re-opening always constructs fresh with current snapshot"
  - "TrayMenuState pruned to 4 bool properties; TrayMenuCallbacks pruned to 7 required Action properties"
  - "About item retained in tray menu between Reset to Defaults and Quit"

patterns-established:
  - "Singleton Settings window: if (_settingsWindow is { IsVisible: true }) { Activate(); return; }"
  - "Event subscriptions added immediately after construction, before Show()"

requirements-completed: [SETT-01, SETT-07]

# Metrics
duration: 20min
completed: 2026-03-09
---

# Phase 42 Plan 03: SettingsWindow Wiring and Tray Prune Summary

**MainWindow gains OpenSettings() singleton guard and GetCurrentSettingsSnapshot(); TrayMenuBuilder pruned from ~43 items to 8+About; all 19 SettingsWindow events wired to live-apply MainWindow helpers**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-03-09T00:00:00Z
- **Completed:** 2026-03-09
- **Tasks:** 2 auto + 1 checkpoint (approved)
- **Files modified:** 2

## Accomplishments

- Added `_settingsWindow` field, `_currentPhraseStyle` field, `GetCurrentSettingsSnapshot()`, and `OpenSettings()` to `MainWindow.xaml.cs`
- `OpenSettings()` implements singleton guard (Activate existing window rather than opening duplicate), subscribes all 19 `SettingsWindow` events to live-apply MainWindow helpers, and nulls `_settingsWindow` on `Closed`
- Updated `SaveSettings()` to persist `PhraseStyle` and `ApplySettings()` to restore `_currentPhraseStyle`
- Rebuilt `TrayMenuBuilder.cs`: `TrayMenuCallbacks` reduced to 7 required Action properties, `TrayMenuState` reduced to 4 bool properties, menu shrunk from ~43 items to Open Settings + separator + 4 quick toggles + separator + Reset/About/Quit
- Removed all deep submenus (font size, dial face, stat row visibility, interval, threshold, accent theme, date format, opacity presets) — all moved to SettingsWindow
- All 126 tests pass (101 Core + 25 App), zero regressions

## Task Commits

1. **Task 1: Add OpenSettings and GetCurrentSettingsSnapshot to MainWindow** - `56ecb33` (feat)
2. **Task 2: Rebuild TrayMenuBuilder and update ContentRendered wiring** - `4ca8075` (feat)
3. **Deviation fix: Suppress events before InitializeComponent** - `634d2a1` (fix)

## Files Created/Modified

- `FuzzyClock.App/MainWindow.xaml.cs` — Added `_settingsWindow`, `_currentPhraseStyle`, `OpenSettings()`, `GetCurrentSettingsSnapshot()`; updated `SaveSettings`/`ApplySettings`; pruned `GetCurrentTrayState()`; pruned `TrayMenuCallbacks` initializer in `ContentRendered`
- `FuzzyClock.App/TrayMenuBuilder.cs` — Full rebuild: 7-property `TrayMenuCallbacks`, 4-property `TrayMenuState`, 10-item menu, `SyncCheckmarks` covers only 4 items, removed `UpdateDialModeVisibility()`

## Decisions Made

- `TrayMenuBuilder` no longer exposes any submenu; all detailed settings accessible only via Settings window
- `_settingsWindow` is nulled in the `Closed` handler so each re-open always uses current live snapshot
- `OpenSettings` is private; the tray callback wraps it in `Dispatcher.Invoke` to safely cross from the tray thread

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] NullReferenceException on OpacityLabel during InitializeComponent**
- **Found during:** Task 2 verification (checkbox state change firing before XAML controls initialised)
- **Issue:** `_suppressEvents` check happened after `OpacityLabel` was referenced; the WinForms CheckedChanged event from a ComboBox subscriber fired before `InitializeComponent` completed, resulting in NullRef on `OpacityLabel`
- **Fix:** Set `_suppressEvents = true` at the very start of the constructor, before `InitializeComponent()`; set `false` only after `PopulateControls()` completes
- **Files modified:** `FuzzyClock.App/SettingsWindow.xaml.cs`
- **Commit:** `634d2a1`

---

**Total deviations:** 1 auto-fixed (single NullRef initialisation-order bug)
**Impact on plan:** Fix was required for correct operation; no scope creep. All tests pass.

## Issues Encountered

None beyond the initialisation-order NullRef documented above.

## User Setup Required

None.

## Next Phase Readiness

- Settings window is fully operational end-to-end: open from tray, all 19 events live-apply to widget, singleton guard prevents duplicates
- Phase 43 can add theme support (color presets stored in AppSettings, applied on start)
- Phase 45 can add phrase style vocabulary (PhraseStyle field + _currentPhraseStyle already wired)

## Self-Check

- `FuzzyClock.App/MainWindow.xaml.cs` — modified in commit `56ecb33`, `4ca8075`, `634d2a1` ✓
- `FuzzyClock.App/TrayMenuBuilder.cs` — modified in commit `4ca8075` ✓
- All 3 task commits present in git log ✓
- 126 tests pass ✓

## Self-Check: PASSED

---
*Phase: 42-settings-window-infrastructure*
*Completed: 2026-03-09*
