---
phase: 43-named-themes
plan: "02"
subsystem: ui
tags: [wpf, settings-window, theme-cards, xaml, events]

# Dependency graph
requires:
  - phase: 43-01
    provides: ThemeDefinition record and BuiltInThemes registry with 5 named themes
  - phase: 42-settings-window-infrastructure
    provides: SettingsWindow class with event pattern, PopulateControls, _suppressEvents guard
provides:
  - 5 theme card Borders (RingThemeMidnight..RingThemeTerminal) in Appearance tab above Accent Color
  - ThemeSelected event on SettingsWindow
  - SetActiveThemeCard(Border?, Color) private helper
  - ClearActiveThemeCard() public method
  - PopulateControls ActiveTheme restore block (forward-ref to SettingsSnapshot.ActiveTheme, resolved by Plan 03)
affects:
  - 43-03 (MainWindow: subscribes to ThemeSelected, calls ClearActiveThemeCard, adds ActiveTheme to SettingsSnapshot)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Theme card outer ring Border mirrors existing SetActiveSwatch pattern but uses theme accent color (not DodgerBlue)
    - Forward reference to SettingsSnapshot.ActiveTheme intentional — build has exactly 1 CS1061 error resolved by Plan 03

key-files:
  created: []
  modified:
    - FuzzyClock.App/SettingsWindow.xaml
    - FuzzyClock.App/SettingsWindow.xaml.cs

key-decisions:
  - "SetActiveThemeCard uses the theme's own accent color as ring color, matching the card's Ellipse fill"
  - "PopulateControls ActiveTheme restore block uses BuiltInThemes.TryGet to obtain ring color without duplicating hex values"
  - "ClearActiveThemeCard is public so MainWindow can call it when user deviates from a named theme (Plan 03 wiring)"

patterns-established:
  - "Theme card pattern: outer ring Border (RingThemeXxx) + inner content Border (60x64, #FFF0F0F5) + StackPanel(Ellipse + TextBlock)"
  - "SetActiveThemeCard mirrors SetActiveSwatch: iterate all rings, clear all, then set one if activeRing is not null"

requirements-completed:
  - THM-01

# Metrics
duration: 8min
completed: 2026-03-09
---

# Phase 43 Plan 02: Named Themes — SettingsWindow UI Summary

**Five theme card swatches (Midnight/Neon/Ghost/Warm/Terminal) added to Appearance tab with ThemeSelected event, SetActiveThemeCard/ClearActiveThemeCard helpers, and PopulateControls wiring**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-09T00:10:00Z
- **Completed:** 2026-03-09T00:18:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added 5 named theme card Borders at top of Appearance tab, each showing a filled Ellipse in the theme's accent color and the theme name below
- Added `ThemeSelected` event, 5 click handlers with `_suppressEvents` guard, `SetActiveThemeCard(Border?, Color)` private helper, and `ClearActiveThemeCard()` public method
- Extended `PopulateControls` with ActiveTheme restore block so the correct card ring appears when the window is re-opened

## Task Commits

Each task was committed atomically:

1. **Task 1 + 2: Add theme card row to XAML and wire code-behind** - `76cab40` (feat)

**Plan metadata:** _(docs commit follows)_

## Files Created/Modified

- `FuzzyClock.App/SettingsWindow.xaml` - Added 5 theme card Borders (RingThemeMidnight..RingThemeTerminal) above Accent Color section in Appearance tab
- `FuzzyClock.App/SettingsWindow.xaml.cs` - Added ThemeSelected event, 5 click handlers, SetActiveThemeCard, ClearActiveThemeCard, PopulateControls ActiveTheme restore block

## Decisions Made

- `SetActiveThemeCard` uses the theme's own accent color as the ring highlight, so the ring visually matches the card's Ellipse fill
- `ClearActiveThemeCard` is public to allow MainWindow to clear the ring when user manually changes a covered property (accent color, opacity, etc.) — Plan 03 wiring
- PopulateControls restore block calls `BuiltInThemes.TryGet(s.ActiveTheme)?.AccentColor` to avoid duplicating hex values

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- MSBuild MSB3492 stale cache error on first build attempt (spurious, resolved on retry)
- Build has exactly 1 CS1061 error on `s.ActiveTheme` as documented in the plan spec — resolved by Plan 03

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- SettingsWindow now exposes `ThemeSelected` event and `ClearActiveThemeCard()` public method
- Plan 03 (MainWindow wiring) can subscribe to `ThemeSelected`, apply theme settings, add `ActiveTheme` to `SettingsSnapshot` and `AppSettings`
- Build will compile cleanly once Plan 03 adds `SettingsSnapshot.ActiveTheme`

## Self-Check: PASSED

All files exist and commit 76cab40 verified in git log.

---
*Phase: 43-named-themes*
*Completed: 2026-03-09*
