---
phase: 36-add-a-date-display-under-the-clock
plan: 01
subsystem: ui
tags: [wpf, xaml, date-display, drop-shadow, settings-persistence]

# Dependency graph
requires:
  - phase: 35-process-threshold
    provides: AppSettings record pattern, SettingsService Validate/Defaults pattern
provides:
  - DateText TextBlock in XAML at Grid.Row="1" between ContentBorder and StatsPanel
  - ShowDate and DateFormat persisted in AppSettings and SettingsService
  - FormatDate() helper for Short/Long/Numeric/ISO format codes
  - UpdateDateDisplay() with midnight change-guard, called from timer tick and ContentRendered
  - DropShadowEffect (BlurRadius=4, Direction=315, ShadowDepth=1) on PhraseText, EmphasisText, DateText
  - TrayMenuState.ShowDate and TrayMenuState.DateFormat stub properties for Plan 02
affects: [36-02-tray-menu-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DropShadowEffect in XAML on TextBlock elements for legibility on any background"
    - "FormatDate(string format) static helper with switch expression returning DateTime.Now.ToString()"
    - "_currentDateText change-guard for midnight detection (avoids TextBlock invalidation every tick)"

key-files:
  created: []
  modified:
    - FuzzyClock.App/AppSettings.cs
    - FuzzyClock.App/SettingsService.cs
    - FuzzyClock.App/MainWindow.xaml
    - FuzzyClock.App/MainWindow.xaml.cs
    - FuzzyClock.App/TrayMenuBuilder.cs

key-decisions:
  - "DateText uses 55% alpha (0x8C) of accent color — same dimming as QualifierText for visual subordination"
  - "DropShadowEffect on PhraseText, EmphasisText, and DateText (identical params) per locked CONTEXT.md decision"
  - "UpdateDateDisplay() skips update when text unchanged — midnight detection via string equality, no date parse"
  - "DateText initial text set in ApplySettings() (safe before Show()); UpdateDateDisplay() called again in ContentRendered after ApplyTheme()"

patterns-established:
  - "DateText foreground: 55% alpha dimmed accent — same pattern as QualifierText in ApplyTheme/ApplyDisplayColor"

requirements-completed: [DATE-01]

# Metrics
duration: 4min
completed: 2026-03-07
---

# Phase 36 Plan 01: Add Date Display (Data Model + Display Logic) Summary

**DateText TextBlock with Short/Long/Numeric/ISO formatting, dimmed-accent drop-shadow, and AppSettings persistence below the time phrase**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-07T00:36:20Z
- **Completed:** 2026-03-07T00:40:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- AppSettings now has ShowDate (bool, default true) and DateFormat (string, default "Short") with SettingsService Defaults/Validate/SaveSettings coverage
- DateText TextBlock in XAML at Grid.Row="1" between ContentBorder and StatsPanel, with identical DropShadowEffect as PhraseText and EmphasisText
- Full display logic: FormatDate() helper, UpdateDateDisplay() with midnight change-guard, timer tick integration, ApplyTheme/ApplyDisplayColor color integration, ApplySettings/SaveSettings/ResetToDefaults coverage

## Task Commits

Each task was committed atomically:

1. **Task 1: Add ShowDate and DateFormat to AppSettings + SettingsService** - `09cb078` (feat)
2. **Task 2: Add DateText element and display logic in MainWindow** - `94637ac` (feat)

## Files Created/Modified

- `FuzzyClock.App/AppSettings.cs` - Added ShowDate (bool, default true) and DateFormat (string, default "Short") init properties
- `FuzzyClock.App/SettingsService.cs` - Defaults(), Validate() DateFormat guard, Defaults() entries for new fields
- `FuzzyClock.App/MainWindow.xaml` - 3-row outer grid; DropShadowEffect on PhraseText/EmphasisText/DateText; DateText at Row 1; StatsPanel moved to Row 2
- `FuzzyClock.App/MainWindow.xaml.cs` - _showDate/_dateFormat/_currentDateText fields; FormatDate(); UpdateDateDisplay(); ApplySettings/GetCurrentTrayState/SaveSettings/ResetToDefaults/ApplyTheme/ApplyDisplayColor coverage; timer tick integration
- `FuzzyClock.App/TrayMenuBuilder.cs` - TrayMenuState.ShowDate and TrayMenuState.DateFormat stub properties for Plan 02

## Decisions Made

- DateText foreground uses 55% alpha (0x8C) of accent color — same dimming ratio as QualifierText, establishing visual hierarchy where date is subordinate to time phrase
- DropShadowEffect params (BlurRadius=4, Direction=315, ShadowDepth=1, Opacity=0.6, Color=Black) applied identically to PhraseText, EmphasisText, and DateText per the locked CONTEXT.md decision
- UpdateDateDisplay() change-guard uses string equality on the formatted text — simple and sufficient for midnight detection without date parsing overhead

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

The `dotnet build` command with the `-q` flag reported stale cache file warnings as errors in the tail output. Building without `-q` confirmed the build succeeded cleanly. No action required — transient MSBuild cache file issue.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- DateText is fully functional and visible on startup with the current date in Short format
- AppSettings persistence is complete — ShowDate and DateFormat survive restart
- TrayMenuState has ShowDate/DateFormat stub properties ready for Plan 02 tray menu integration
- Plan 02 can wire up tray menu items (Show Date toggle, Date Format submenu) against the existing _showDate/_dateFormat fields and UpdateDateDisplay()

---
*Phase: 36-add-a-date-display-under-the-clock*
*Completed: 2026-03-07*
