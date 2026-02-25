---
phase: 05-font-size-selection-persistence
plan: 01
subsystem: ui
tags: [wpf, xaml, contextmenu, font-size, settings-persistence]

# Dependency graph
requires:
  - phase: 04-settings-drag-position-persistence
    provides: AppSettings.FontSize, SettingsService.Load/Save/Clamp, ApplySettings(), SaveSettings(), _currentFontSize, _hasUserPosition

provides:
  - Font Size submenu in right-click ContextMenu (Small 16pt, Medium 24pt, Large 32pt)
  - ContextMenu_Opened handler that syncs IsChecked state on every menu open
  - ApplyFontSize() helper that applies size to both TextBlocks, re-clamps window, saves settings
  - FontSmall_Click, FontMedium_Click, FontLarge_Click delegating to ApplyFontSize()
  - Font size change survives app restart (via existing SettingsService JSON path)
affects:
  - future-ui-phases (ContextMenu.Opened pattern established for checkmark sync)

# Tech tracking
tech-stack:
  added: []
  patterns: [ContextMenu.Opened for IsChecked sync, ApplyFontSize + UpdateLayout + re-clamp, ApplySettings separation from ApplyFontSize]

key-files:
  created: []
  modified:
    - FuzzyClock.App/MainWindow.xaml
    - FuzzyClock.App/MainWindow.xaml.cs

key-decisions:
  - "ContextMenu_Opened (not click handlers) is single sync point for IsChecked — prevents double-toggle of WPF IsCheckable default behavior"
  - "ApplyFontSize() must NOT be called from ApplySettings() — ApplyFontSize calls UpdateLayout()+SaveSettings() which are unsafe before window is shown"
  - "UpdateLayout() called before SettingsService.Clamp() in ApplyFontSize() — ActualWidth/ActualHeight stale until layout runs after SizeToContent resize"
  - "Re-clamp guarded by _hasUserPosition — same pattern as UpdatePhraseIfChanged(), no snap-to-top-right after user positions widget"

patterns-established:
  - "ContextMenu.Opened pattern: set IsChecked in Opened handler, not in click handlers, to avoid WPF toggle interference"
  - "ApplyFontSize pattern: set state + both TextBlock props + UpdateLayout() + conditional re-clamp + SaveSettings()"
  - "Startup-safe ApplySettings pattern: direct property assignment only, no UpdateLayout() or SaveSettings()"

requirements-completed: [DISP-05, DISP-06]

# Metrics
duration: 2min
completed: 2026-02-25
---

# Phase 5 Plan 01: Font Size Selection + Persistence Summary

**WPF Font Size submenu with ContextMenu.Opened-driven checkmark sync, immediate apply, window re-clamp, and JSON persistence via existing SettingsService**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-25T03:44:14Z
- **Completed:** 2026-02-25T03:46:00Z
- **Tasks:** 2 of 3 complete (Task 3 is human-verify checkpoint)
- **Files modified:** 2

## Accomplishments

- Added Font Size submenu (Small 16pt, Medium 24pt, Large 32pt) to the existing right-click ContextMenu in MainWindow.xaml
- Implemented ContextMenu_Opened handler that syncs all three IsChecked states each time the menu opens — single sync point, no click-handler toggle interference
- Implemented ApplyFontSize() with UpdateLayout() + conditional re-clamp + SaveSettings() — font size change survives restart and keeps widget on-screen near edges

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Font Size submenu to MainWindow.xaml ContextMenu** - `55202ef` (feat)
2. **Task 2: Add ContextMenu_Opened handler, click handlers, and ApplyFontSize()** - `619861c` (feat)
3. **Task 3: Human verify font size submenu** - pending checkpoint

## Files Created/Modified

- `FuzzyClock.App/MainWindow.xaml` - Added ContextMenu Opened event + Font Size parent MenuItem + three IsCheckable child MenuItems with x:Name and Click handlers
- `FuzzyClock.App/MainWindow.xaml.cs` - Added ContextMenu_Opened, FontSmall_Click, FontMedium_Click, FontLarge_Click, ApplyFontSize(); ApplySettings() left unchanged

## Decisions Made

- **ContextMenu.Opened as single sync point:** The `Opened` handler sets `IsChecked` on all three items each time the menu opens. Click handlers do NOT touch `IsChecked` — WPF's default `IsCheckable` toggle behavior is neutralized by always overwriting in `Opened`. This prevents the double-toggle that would occur if both `Opened` and click handlers mutated `IsChecked`.

- **ApplyFontSize separated from ApplySettings:** `ApplySettings()` runs before `Show()` and directly assigns `_currentFontSize` and both `FontSize` properties. It must NOT call `ApplyFontSize()` because `ApplyFontSize()` calls `UpdateLayout()` (unsafe before shown) and `SaveSettings()` (would overwrite settings during load). This separation was pre-specified in the plan and verified as correctly maintained.

- **UpdateLayout() before Clamp() in ApplyFontSize:** `SizeToContent=WidthAndHeight` means changing `FontSize` triggers a window resize. `ActualWidth`/`ActualHeight` are stale until layout runs, so `Clamp()` must receive post-layout dimensions. Pattern mirrors `UpdatePhraseIfChanged()`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Build succeeded with 0 errors and 0 warnings on first attempt.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Both implementation tasks complete and building cleanly
- Awaiting human verification (Task 3 checkpoint) to confirm submenu renders, checkmarks work, size applies immediately, persistence survives restart, and re-clamp keeps widget on-screen
- Once Task 3 approved: Phase 5 complete, v1.1 ships

---
*Phase: 05-font-size-selection-persistence*
*Completed: 2026-02-25*
