---
phase: 16-dial-face-decorations
plan: 01
subsystem: ui
tags: [wpf, xaml, canvas, decorations, dial, settings, persistence]

# Dependency graph
requires:
  - phase: 13-dial-mode
    provides: DialCanvas, _dialMode field, SetDialMode(), UpdateDialDisplay(), AppSettings.DialMode
  - phase: 4-settings-drag
    provides: AppSettings record init-property pattern, SettingsService.Save()
provides:
  - AppSettings.ShowHourTicks / ShowMinuteDots / ShowHourNumbers bool init-properties
  - DialCanvas hour tick lines (12 Line elements at R=31-36)
  - DialCanvas minute dot ellipses (60 Ellipse elements at R=35)
  - DialCanvas hour number labels (12 TextBlock "1"-"12" at R=25)
  - Dial Face submenu (MenuDialFace) with three IsCheckable child items
  - DIAL-09: submenu hidden in phrase mode, shown in dial mode
  - Full persistence: decorations survive app restart via settings.json
affects:
  - 16-02-PLAN (human verification checkpoint for dial face decorations)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Canvas decoration elements created once in InitDialDecorations() and toggled via Visibility (not add/remove)"
    - "ApplySettings reads fields to private bools; InitDialDecorations() applies visibility after elements exist"
    - "DIAL-09 mode-conditional menu: MenuDialFace.Visibility set in both ContextMenu_Opened and SetDialMode"

key-files:
  created: []
  modified:
    - FuzzyClock.App/AppSettings.cs
    - FuzzyClock.App/MainWindow.xaml
    - FuzzyClock.App/MainWindow.xaml.cs

key-decisions:
  - "Decorations default to false — minimal dial appearance for existing users whose settings.json has no decoration fields"
  - "Elements created once and toggled (Visibility) rather than added/removed — avoids re-layout cost on toggle"
  - "InitDialDecorations() called in ContentRendered after UpdateDialDisplay() so hand positions are set first"
  - "ApplySettings() sets private fields only; InitDialDecorations() applies visibility after elements exist (safe ordering)"
  - "MenuDialFace Visibility NOT set in XAML — controlled entirely from code-behind to match loaded DialMode state"

patterns-established:
  - "Canvas elements always in Children; visibility toggled not add/remove"
  - "Pre-Show field assignment pattern: set fields in ApplySettings, apply element state in ContentRendered"

requirements-completed: [DIAL-06, DIAL-07, DIAL-08, DIAL-09]

# Metrics
duration: 3min
completed: 2026-02-26
---

# Phase 16 Plan 01: Dial Face Decorations Summary

**Hour tick lines (12), minute dot ellipses (60), and hour number labels (12) on DialCanvas with Dial Face submenu (DIAL-09 mode-conditional) and full AppSettings persistence for DIAL-06/07/08/09**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-26T09:46:50Z
- **Completed:** 2026-02-26T09:49:46Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- AppSettings extended with three bool init-properties (ShowHourTicks, ShowMinuteDots, ShowHourNumbers), all defaulting to false for backward compatibility
- InitDialDecorations() creates 84 canvas elements (12 Line ticks + 60 Ellipse dots + 12 TextBlock numbers) once in ContentRendered; visibility toggled by three SetShow* methods
- Dial Face submenu (MenuDialFace) with three IsCheckable items; hidden in phrase mode, shown in dial mode per DIAL-09
- All three decoration preferences persisted to settings.json and restored on startup

## Task Commits

Each task was committed atomically:

1. **Task 1: Add AppSettings fields and XAML Dial Face submenu** - `d75fd94` (feat)
2. **Task 2: Implement InitDialDecorations, toggle methods, and full wiring** - `8858ab9` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified
- `FuzzyClock.App/AppSettings.cs` - Added ShowHourTicks, ShowMinuteDots, ShowHourNumbers bool init-properties
- `FuzzyClock.App/MainWindow.xaml` - Added MenuDialFace submenu with three IsCheckable child MenuItems
- `FuzzyClock.App/MainWindow.xaml.cs` - InitDialDecorations, SetShow* helpers, click handlers, ApplySettings/SaveSettings/ContextMenu_Opened/SetDialMode wiring

## Decisions Made
- Decorations default to `false` — preserves minimal Phase 13 dial appearance for existing users whose settings.json lacks new fields
- All 84 decoration elements (12+60+12) created once and kept in DialCanvas.Children; Visibility toggled rather than add/remove — cleaner and avoids re-layout on each toggle
- `InitDialDecorations()` called in ContentRendered after `if (_dialMode) UpdateDialDisplay()` — ensures hand positions are set first; decorations never render in phrase mode since DialCanvas itself is Collapsed
- `MenuDialFace.Visibility` not set in XAML — code-behind controls it in both `ContextMenu_Opened` and `SetDialMode` to reflect correct state at any time

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Task 1 build produced 3 errors (missing click handlers referenced in XAML but not yet in code-behind) — expected, resolved by Task 2. Both tasks committed; build verified green after Task 2.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All four DIAL-06/07/08/09 requirements implemented and verified (build: 0 errors, 51 tests pass)
- Ready for Phase 16 Plan 02: human visual verification checkpoint

---
*Phase: 16-dial-face-decorations*
*Completed: 2026-02-26*

## Self-Check: PASSED

- FOUND: FuzzyClock.App/AppSettings.cs
- FOUND: FuzzyClock.App/MainWindow.xaml
- FOUND: FuzzyClock.App/MainWindow.xaml.cs
- FOUND: .planning/phases/16-dial-face-decorations/16-01-SUMMARY.md
- FOUND commit d75fd94 (Task 1: AppSettings fields + XAML submenu)
- FOUND commit 8858ab9 (Task 2: InitDialDecorations + full wiring)
- Build: 0 errors, 0 warnings
- Tests: 51 passed, 0 failed
