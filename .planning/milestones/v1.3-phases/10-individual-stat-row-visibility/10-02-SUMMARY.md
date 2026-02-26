---
status: complete
phase: 10-individual-stat-row-visibility
plan: 02
---

## What Was Built

Wired per-row stat visibility click handlers, auto-collapse logic, checkmark sync, and persistence into MainWindow.xaml.cs. All five STAT-06 through STAT-10 requirements satisfied.

## Changes

- `FuzzyClock.App/MainWindow.xaml.cs`:
  - Added `SetStatRowVisible(Grid row, bool visible)` helper — sets row Visibility, triggers auto-collapse when all three rows are Collapsed while StatsPanel is Visible (one-way), re-clamps on show, saves settings
  - Added `MenuCpuVisible_Click`, `MenuGpuVisible_Click`, `MenuMemVisible_Click` handlers — each reads current row Visibility (not IsChecked) to determine toggle direction
  - Extended `ContextMenu_Opened` with three IsChecked sync lines from row Visibility state
  - Extended `ApplySettings()` with direct CpuRow/GpuRow/MemRow Visibility assignments (not via helper — safe before Show())
  - Extended `SaveSettings()` with CpuVisible/GpuVisible/MemVisible in AppSettings initializer
- `FuzzyClock.App/FuzzyClock.App.csproj`: Added `<NoWarn>NU1510</NoWarn>` to suppress duplicate PackageReference warning

## Human Verification

All 5 checks passed:
1. Individual row toggle (Show CPU/GPU/MEM) — checkmarks reflect actual row state each menu open
2. Auto-collapse when last visible row hidden — StatsPanel collapses, Show Stats becomes unchecked
3. Re-show rows without re-showing panel — individual toggles independent of panel visibility
4. Persistence round-trip — row states restored correctly after close + relaunch
5. Clean build — 0 errors, 0 warnings

## State

Phase 10 complete. All v1.3 requirements delivered.
