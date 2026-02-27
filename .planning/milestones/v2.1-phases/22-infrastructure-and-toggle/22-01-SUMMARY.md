---
phase: 22-infrastructure-and-toggle
plan: 01
subsystem: uptime-row
tags: [uptime, toggle, infrastructure, settings, theme]
dependency_graph:
  requires: []
  provides: [UptimeText-XAML, UptimeVisible-AppSettings, MenuUptimeVisible-toggle, SetUptimeRowVisible]
  affects: [MainWindow.xaml, MainWindow.xaml.cs, AppSettings.cs]
tech_stack:
  added: []
  patterns: [direct-Visibility-pre-Show, IsChecked-sync-from-Visibility, UpdateLayout-Clamp-on-show]
key_files:
  created: []
  modified:
    - FuzzyClock.App/AppSettings.cs
    - FuzzyClock.App/MainWindow.xaml
    - FuzzyClock.App/MainWindow.xaml.cs
decisions:
  - "UptimeText placed as Grid sibling (Row 2) not inside StatsPanel StackPanel — required for independent toggle"
  - "ApplySettings uses direct Visibility assignment, not SetUptimeRowVisible — pre-Show safety invariant"
  - "UptimeVisible default = true — JSON-absent bool deserializes as false; explicit init required for upgrade safety"
  - "MenuUptimeVisible_Click reads UptimeText.Visibility (not IsChecked) — IsChecked already toggled by WPF before handler fires"
metrics:
  duration: 2 min
  completed: 2026-02-27
  tasks: 2
  files: 3
---

# Phase 22 Plan 01: UptimeRow Infrastructure and Toggle Summary

UptimeRow infrastructure with full toggle lifecycle: AppSettings field, XAML TextBlock, Stats submenu toggle, and six code-behind wiring points — visible by default, independently controlled, persisted, and correctly themed with "up —" placeholder.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | AppSettings field + XAML UptimeText row + Stats submenu item | 2e3559c | AppSettings.cs, MainWindow.xaml, MainWindow.xaml.cs |
| 2 | Code-behind wiring — ApplySettings, SaveSettings, ContextMenu_Opened, click handler, SetUptimeRowVisible, ApplyTheme | 81d5ef7 | MainWindow.xaml.cs |

## What Was Built

- **AppSettings.cs**: `public bool UptimeVisible { get; init; } = true;` — init default ensures first-launch and v2.0-upgrade users see the row; JSON-absent bool would otherwise deserialize as false
- **MainWindow.xaml**: Inner Grid extended from 2 to 3 rows; `UptimeText` TextBlock at `Grid.Row="2"` as a sibling of `StatsPanel` (not inside its StackPanel); `MenuUptimeVisible` IsCheckable MenuItem in Stats submenu after MenuPagVisible
- **MainWindow.xaml.cs** — six targeted additions:
  1. `ApplySettings()`: `UptimeText.Visibility = s.UptimeVisible ? ... : ...` — direct assignment, not via SetUptimeRowVisible (pre-Show safety)
  2. `SaveSettings()`: `UptimeVisible = (UptimeText.Visibility == Visibility.Visible)` — persists user choice
  3. `ContextMenu_Opened()`: `MenuUptimeVisible.IsChecked = (UptimeText.Visibility == Visibility.Visible)` — syncs checkmark on every open
  4. `MenuUptimeVisible_Click()`: reads Visibility (ground truth), not IsChecked (which WPF already toggled)
  5. `SetUptimeRowVisible()`: full method with UpdateLayout+Clamp guard on show (matches SetStatRowVisible pattern)
  6. `ApplyTheme()`: `UptimeText.Foreground = brush` — accent color coverage

## Verification Results

All plan grep checks passed:
- ApplySettings direct assignment at line 136
- SaveSettings record field at line 183
- ContextMenu_Opened IsChecked sync at line 313
- ApplyTheme coverage at line 705
- SetUptimeRowVisible method at line 478
- AppSettings UptimeVisible field with `= true` default at line 15

Build: 0 errors, 0 warnings.

## Deviations from Plan

None — plan executed exactly as written. The plan anticipated needing a build stub for Task 1 (handler not yet wired); stub was added as specified, then replaced with the real implementation in Task 2.

## Self-Check

### Files created/modified
- `FuzzyClock.App/AppSettings.cs` — FOUND
- `FuzzyClock.App/MainWindow.xaml` — FOUND
- `FuzzyClock.App/MainWindow.xaml.cs` — FOUND

### Commits
- `2e3559c` — Task 1: AppSettings + XAML changes
- `81d5ef7` — Task 2: code-behind wiring

## Self-Check: PASSED
