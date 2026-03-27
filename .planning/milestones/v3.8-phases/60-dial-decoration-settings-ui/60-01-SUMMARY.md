---
phase: 60-dial-decoration-settings-ui
plan: "01"
subsystem: settings-ui
tags: [xaml, settings, dial, checkboxes, visibility-gating]
dependency_graph:
  requires: []
  provides: [dial-decoration-settings-ui]
  affects: [FuzzyClock.App/SettingsWindow.xaml, FuzzyClock.App/SettingsWindow.xaml.cs]
tech_stack:
  added: []
  patterns: [_suppressEvents-guard, SetClockStyleButtonStates-visibility-gating, Visibility.Collapsed-for-conditional-rows]
key_files:
  modified:
    - FuzzyClock.App/SettingsWindow.xaml
    - FuzzyClock.App/SettingsWindow.xaml.cs
decisions:
  - "DialFaceLabel uses VerticalAlignment=Top (not Center) to align with multi-line StackPanel in column 1 — matches Phrase Wrap row pattern"
  - "Visibility gating added to SetClockStyleButtonStates so open-time and button-click paths both gate correctly"
metrics:
  duration: "2m 19s"
  completed: "2026-03-23"
  tasks_completed: 2
  files_modified: 2
---

# Phase 60 Plan 01: Dial Decoration Settings UI Summary

## One-liner

Dial face checkboxes (Hour Ticks, Minute Dots, Hour Numbers) wired to Settings > Appearance tab with Visibility.Collapsed gating for non-Dial clock styles.

## What Was Built

Added three dial decoration checkboxes to Settings > Appearance as a new "Dial Face" row
at Grid Row 5. The row is gated: visible only when ClockType.Dial is active, collapsed for
Phrase and Nixie. PopulateControls reads from SettingsSnapshot. Each handler fires the
existing event through the `_suppressEvents` guard. Backend was already complete; this
plan was pure XAML + code-behind wiring.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add Dial Face XAML row to Appearance tab grid | d5bfc77 | FuzzyClock.App/SettingsWindow.xaml |
| 2 | Wire code-behind — PopulateControls, visibility gating, and checkbox handlers | 3362668 | FuzzyClock.App/SettingsWindow.xaml.cs |

## Verification Results

- `dotnet build FuzzyClock.App/FuzzyClock.App.csproj`: 0 errors, 6 pre-existing LCD stub warnings (unchanged from before this plan)
- `dotnet test FuzzyClock.slnx`: 299/299 passed (262 Core + 37 App)
- XAML grep: DialFacePanel(1), DialFaceLabel(1), ChkShowHourTicks(2), ChkShowMinuteDots(2), ChkShowHourNumbers(2)
- Code-behind grep: all 3 IsChecked assignments in PopulateControls, DialFaceLabel/DialFacePanel.Visibility in SetClockStyleButtonStates, all 3 handler methods with _suppressEvents guard and event invoke

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. All three checkboxes are fully wired end-to-end: XAML elements -> PopulateControls -> event handlers -> pre-existing MainWindow subscriptions -> live widget update -> persist to settings.json.

## Self-Check: PASSED
