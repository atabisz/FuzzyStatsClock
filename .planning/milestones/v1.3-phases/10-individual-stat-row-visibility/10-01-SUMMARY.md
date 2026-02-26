---
status: complete
phase: 10-individual-stat-row-visibility
plan: 01
---

## What Was Built

Added AppSettings fields (CpuVisible, GpuVisible, MemVisible) and XAML prerequisites (row names + menu items) for per-row stat visibility control.

## Changes

- `FuzzyClock.App/AppSettings.cs`: Added CpuVisible, GpuVisible, MemVisible bool fields with `= true` defaults
- `FuzzyClock.App/SettingsService.cs`: Updated Defaults() to explicitly include all three fields
- `FuzzyClock.App/MainWindow.xaml`: Added x:Name to CpuRow/GpuRow/MemRow; added Separator + three IsCheckable MenuItems (MenuCpuVisible/MenuGpuVisible/MenuMemVisible) to Stats submenu

## State

Plan 02 can now reference CpuRow, GpuRow, MemRow, MenuCpuVisible, MenuGpuVisible, MenuMemVisible in code-behind. Build is in expected FAIL state until Plan 02 adds the three click handlers.

## Self-Check: PASSED

- `FuzzyClock.App/AppSettings.cs`: FOUND with CpuVisible, GpuVisible, MemVisible fields
- `FuzzyClock.App/SettingsService.cs`: FOUND with explicit Defaults() entries
- `FuzzyClock.App/MainWindow.xaml`: FOUND with x:Name CpuRow/GpuRow/MemRow and three menu items
- Commit 95dec0e: FOUND
