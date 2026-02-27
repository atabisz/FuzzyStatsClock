---
phase: 19-window-opacity
plan: 01
subsystem: ui
tags: [wpf, opacity, scroll-wheel, context-menu, PreviewMouseWheel, UIElement.Opacity]

# Dependency graph
requires:
  - phase: 18-appsettings-schema-extension
    provides: "AppSettings.Opacity field (double, init 1.0) and SettingsService Opacity guard"
provides:
  - "Runtime opacity control: Opacity submenu (25/50/75/100%) in context menu"
  - "_windowOpacity field tracking current opacity, SetOpacity() helper persisting via SaveSettings()"
  - "Window_PreviewMouseWheel handler: scroll wheel opacity in 10% steps, floor 0.10"
  - "ApplySettings() extension: restores Opacity from settings on startup"
  - "SaveSettings() extension: persists Opacity = _windowOpacity"
  - "ContextMenu_Opened() extension: syncs 4 IsChecked flags from _windowOpacity"
affects: [20-accent-color, phase-20]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "PreviewMouseWheel (tunneling) on Window element for frameless AllowsTransparency windows — MouseWheel (bubbling) silently dropped without keyboard focus"
    - "SetOpacity() helper unifies preset clicks and saves; scroll wheel updates field+this.Opacity directly then saves (same pattern as other setters)"
    - "ApplySettings() direct assignment (_windowOpacity = s.Opacity; this.Opacity = s.Opacity) — does NOT call SetOpacity() to avoid redundant SaveSettings() at startup"
    - "Exact double comparison in ContextMenu_Opened() reliable because _windowOpacity only changes via literal assignment (0.25/0.50/0.75/1.00) or Math.Clamp in 0.10 steps"

key-files:
  created: []
  modified:
    - FuzzyClock.App/MainWindow.xaml
    - FuzzyClock.App/MainWindow.xaml.cs

key-decisions:
  - "Use PreviewMouseWheel (not MouseWheel) on Window element — MouseWheel silently dropped on frameless AllowsTransparency=True windows without prior keyboard focus; locked STATE.md decision"
  - "Scroll wheel floor = 0.10 (10%), preset menu floor = 0.25 — not in conflict; sub-25% only reachable via scroll"
  - "ApplySettings() uses direct field+property assignment, NOT SetOpacity() — avoids redundant SaveSettings() call at startup; matches established pattern for all other ApplySettings() assignments"
  - "Exact double comparisons for IsChecked sync are reliable because _windowOpacity is only mutated via exact literal assignments (0.25/0.50/0.75/1.00) or Math.Clamp in 0.10 steps"

patterns-established:
  - "SetOpacity(double) pattern: update field, set this.Opacity, call SaveSettings() — identical structure to existing SetShowHourTicks/SetShowMinuteDots/SetShowHourNumbers helpers"

requirements-completed: [OPAC-01, OPAC-02, OPAC-03]

# Metrics
duration: 1min
completed: 2026-02-27
---

# Phase 19 Plan 01: Window Opacity Summary

**Window opacity control via context menu presets (25/50/75/100%) and scroll wheel (10% steps, floor 10%) with persistence through AppSettings.Opacity**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-26T22:43:06Z
- **Completed:** 2026-02-26T22:44:58Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Opacity submenu with four IsCheckable presets (25/50/75/100%) inserted before Close in ContextMenu
- PreviewMouseWheel handler on Window element: 10% steps per scroll notch, Math.Clamp floor 0.10, e.Handled=true prevents scroll leak
- ApplySettings() extended to restore saved opacity at startup; SaveSettings() extended to persist _windowOpacity

## Task Commits

Each task was committed atomically:

1. **Task 1+2: Add Opacity submenu XAML, PreviewMouseWheel event, and all runtime logic** - `2f42caa` (feat)

## Files Created/Modified
- `FuzzyClock.App/MainWindow.xaml` - Added PreviewMouseWheel="Window_PreviewMouseWheel" to Window element; added Opacity submenu with MenuOpacity25/50/75/100 IsCheckable items before Close
- `FuzzyClock.App/MainWindow.xaml.cs` - Added _windowOpacity field, SetOpacity() helper, 4 preset click handlers, Window_PreviewMouseWheel handler, extended ApplySettings()/SaveSettings()/ContextMenu_Opened()

## Decisions Made
- Tasks 1 and 2 committed together: XAML references code-behind event handlers by name, so the project is uncompilable between the two tasks; combined commit is cleaner and atomic
- PreviewMouseWheel (tunneling) confirmed as the correct event — MouseWheel (bubbling) silently fails on frameless transparent windows; this was pre-established in STATE.md decisions

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- OPAC-01, OPAC-02, OPAC-03 complete
- AppSettings.Opacity field fully wired end-to-end (load → apply → use → save)
- Ready for Phase 19 Plan 02 (if exists) or Phase 20 (AccentColor picker)

## Self-Check: PASSED

- FOUND: FuzzyClock.App/MainWindow.xaml
- FOUND: FuzzyClock.App/MainWindow.xaml.cs
- FOUND: .planning/phases/19-window-opacity/19-01-SUMMARY.md
- FOUND: commit 2f42caa

---
*Phase: 19-window-opacity*
*Completed: 2026-02-27*
