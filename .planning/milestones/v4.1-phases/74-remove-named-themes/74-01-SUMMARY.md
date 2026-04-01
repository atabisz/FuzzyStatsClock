---
phase: 74-remove-named-themes
plan: 01
subsystem: Settings UI and persistence
tags: [cleanup, refactor, settings]
dependency_graph:
  requires: []
  provides: [CLEAN-01, CLEAN-02, CLEAN-03, CLEAN-04]
  affects: [settings-ui, appsettings, persistence]
tech_stack:
  added: []
  patterns: []
key_files:
  created: []
  modified:
    - FuzzyClock.App/AppSettings.cs
    - FuzzyClock.App/SettingsSnapshot.cs
    - FuzzyClock.App/SettingsWindow.xaml
    - FuzzyClock.App/SettingsWindow.xaml.cs
    - FuzzyClock.App/MainWindow.xaml.cs
    - .planning/PROJECT.md
  deleted:
    - FuzzyClock.App/ThemeDefinition.cs
decisions:
  - Theme infrastructure removed to simplify Settings window; AccentColor field was always persisted independently alongside Theme field
  - System.Text.Json silently ignores unknown keys during deserialization — no migration code needed for users upgrading with saved Theme field
  - RefreshControls method deleted because its only caller was the ThemeSelected handler
metrics:
  duration_minutes: 6
  tasks_completed: 2
  files_modified: 6
  files_deleted: 1
  tests_passed: 414
  tests_failed: 0
completed: "2026-04-01T22:54:49Z"
---

# Phase 74 Plan 01: Remove Named Theme System Summary

**One-liner:** Deleted the entire named theme infrastructure (Midnight/Neon/Ghost/Warm/Terminal) from Settings UI, data model, and code-behind to simplify the Settings window; AccentColor field was always persisted independently so no migration needed.

## Tasks Completed

### Task 1: Delete all theme infrastructure from codebase
- **Status:** Complete
- **Commit:** 687da71
- **Changes:**
  - Deleted `FuzzyClock.App/ThemeDefinition.cs` entirely (73 lines containing `ThemeDefinition` record and `BuiltInThemes` static registry)
  - Removed `Theme` field from `AppSettings.cs` (line 43)
  - Removed `ActiveTheme` field from `SettingsSnapshot.cs` (line 38)
  - Deleted theme card XAML from `SettingsWindow.xaml` (lines 58-157: Theme header, 5 theme card Borders, horizontal StackPanel)
  - Deleted from `SettingsWindow.xaml.cs`:
    - `ThemeSelected` event declaration (line 48)
    - `SetActiveThemeCard` method (lines 265-279)
    - `ClearActiveThemeCard` method (line 282)
    - `RefreshControls` method (lines 285-290)
    - ActiveTheme restore block in `PopulateControls()` (lines 206-219)
    - All 5 theme click handlers: `ThemeMidnight_Click`, `ThemeNeon_Click`, `ThemeGhost_Click`, `ThemeWarm_Click`, `ThemeTerminal_Click` (lines 293-331)
  - Deleted from `MainWindow.xaml.cs`:
    - `_currentTheme` field (line 58)
    - Startup theme restore block (lines 359-371)
    - `ActiveTheme` assignment in `GetCurrentSettingsSnapshot()` (line 402)
    - Simplified 5 event subscriptions: removed `ClearActiveTheme()` wrappers from `AccentColorChanged`, `OpacityChanged`, `FontSizeChanged`, `ClockTypeChanged`, `StatsVisibleChanged`
    - `ThemeSelected` subscription block (lines 477-484)
    - `Theme` assignment in `SaveSettings()` (line 523)
    - Theme reset block in `ResetToDefaults()` (lines 1168-1170)
    - `ApplyNamedTheme()` method (lines 1190-1207)
    - `ClearActiveTheme()` method (lines 1209-1216)
    - `ClearActiveTheme()` call in `Window_PreviewMouseWheel()` (line 1406)
- **Verification:** Build succeeded with 0 errors, 0 warnings

### Task 2: Update PROJECT.md and run full test suite
- **Status:** Complete
- **Commit:** 2605218
- **Changes:**
  - Removed sentence "Five built-in named themes (Minimal, Neon, Ghost, Warm, Ocean) apply accent color, opacity, font size, clock style, and stats visibility atomically." from "What This Is" paragraph (line 5)
  - Updated v3.2 shipped note to: "Settings window (3-tab), named themes (removed in v4.1), battery low alert, English phrase personalities (Terse/Poetic/Rude), multilingual phrases (fr/es/de/ja/pl)"
  - Added "— REMOVED in v4.1 (CLEAN-01 through CLEAN-04)" to THM-01, THM-02, THM-03 requirements (lines 186-188)
- **Verification:** Full test suite passed: 414 tests (357 Core + 57 App), 0 failures

## Deviations from Plan

None — plan executed exactly as written.

## Requirements Satisfied

- **CLEAN-01:** Settings > Appearance no longer shows Theme header or 5 theme cards — theme section fully removed from XAML
- **CLEAN-02:** ThemeDefinition.cs deleted; ThemeDefinition record, BuiltInThemes registry, ApplyNamedTheme() removed
- **CLEAN-03:** Users with saved Theme field in settings.json see their AccentColor preserved via JSON ignore-unknown-keys behavior
- **CLEAN-04:** AppSettings.Theme field removed; no Validate() changes needed since Theme was nullable with null default

## Files Changed

**Deleted:**
- `FuzzyClock.App/ThemeDefinition.cs` (73 lines)

**Modified:**
- `FuzzyClock.App/AppSettings.cs` — removed Theme field
- `FuzzyClock.App/SettingsSnapshot.cs` — removed ActiveTheme field
- `FuzzyClock.App/SettingsWindow.xaml` — removed theme card XAML (100 lines)
- `FuzzyClock.App/SettingsWindow.xaml.cs` — removed ThemeSelected event, SetActiveThemeCard, ClearActiveThemeCard, RefreshControls, 5 theme click handlers, and ActiveTheme restore block (122 lines)
- `FuzzyClock.App/MainWindow.xaml.cs` — removed _currentTheme field, startup theme restore, ThemeSelected subscription, ApplyNamedTheme, ClearActiveTheme, and all ClearActiveTheme wrappers (30 lines)
- `.planning/PROJECT.md` — updated "What This Is", v3.2 shipped note, and THM requirements

## Build Status

✓ Build: 0 errors, 0 warnings
✓ Tests: 414 passed (357 Core + 57 App), 0 failures

## Self-Check: PASSED

**Created files:** None (this was a deletion operation)

**Deleted files:**
```
[ ! -f "FuzzyClock.App/ThemeDefinition.cs" ] && echo "VERIFIED: ThemeDefinition.cs deleted" || echo "MISSING: ThemeDefinition.cs still exists"
```
VERIFIED: ThemeDefinition.cs deleted

**Commits:**
```
git log --oneline --all | grep -E "(687da71|2605218)"
```
FOUND: 687da71 refactor(74-01): delete named theme system
FOUND: 2605218 docs(74-01): update PROJECT.md after theme removal

## Notes

- The RefreshControls method in SettingsWindow.xaml.cs was also deleted because its only caller was the ThemeSelected handler at line 483 of MainWindow.xaml.cs, which was deleted as part of this plan.
- No test modifications were needed — no tests referenced the theme infrastructure.
- Settings migration is handled automatically by System.Text.Json's ignore-unknown-keys behavior on deserialization.
