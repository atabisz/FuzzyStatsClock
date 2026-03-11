---
phase: 56-nixie-tube-clock
plan: "01"
subsystem: FuzzyClock.App/Controls
tags: [nixie, wpf, usercontrol, canvas, rendering]
dependency_graph:
  requires: []
  provides: [NixieDigit, NixieClockView, NixieSizeMap]
  affects: [FuzzyClock.App]
tech_stack:
  added: []
  patterns: [canvas-based WPF UserControl, RadialGradientBrush glow, ghost cathode stacking]
key_files:
  created:
    - FuzzyClock.App/Controls/NixieDigit.xaml
    - FuzzyClock.App/Controls/NixieDigit.xaml.cs
    - FuzzyClock.App/Controls/NixieClockView.xaml
    - FuzzyClock.App/Controls/NixieClockView.xaml.cs
    - FuzzyClock.App/NixieSize.cs
  modified: []
decisions:
  - "Glow ellipse uses RadialGradientBrush; no UIElement.Effect (DropShadow/Blur) which renders as black rectangle under AllowsTransparency=True"
  - "Type aliases (WpfRectangle, WpfFontFamily, WpfSize) resolve CS0104 ambiguities from System.Drawing globals"
  - "NixieClockView.xaml colon dots defined directly in XAML with inline RadialGradientBrush; no tube border for cleaner visual balance"
metrics:
  duration_seconds: 159
  completed_date: "2026-03-11"
  tasks_completed: 2
  files_created: 5
  files_modified: 0
---

# Phase 56 Plan 01: NixieDigit + NixieClockView UserControls Summary

**One-liner:** Canvas-based Nixie tube digit renderer with ghost cathode stacking, RadialGradientBrush glow, wire mesh overlay, and 12hr clock container.

## What Was Built

Two WPF UserControls and a size-mapping helper forming the render core of the Nixie clock clock type.

**NixieDigit** — a Canvas-based UserControl with:
- Glass tube border (rounded Rectangle with dark semi-transparent fill and warm orange stroke)
- Glass highlight rectangle simulating curvature reflection
- Wire mesh overlay: horizontal Lines spaced every 7px with very faint orange stroke
- 10 ghost cathode TextBlocks (digits 0-9, Segoe UI Bold, positioned with per-digit 1.5px vertical offset stagger)
- Active digit glow Ellipse using RadialGradientBrush (no UIElement.Effect)
- `RebuildGeometry()` re-creates all children when DigitHeight changes
- `UpdateDisplay(int)` applies 4-tier opacity (full/12%/9.5%/8%) by distance from active digit
- Explicit RootCanvas.Width/Height and this.Width/Height prevent canvas collapsing to 0x0

**NixieSizeMap** — ToDigitHeight returns 40/56/72 for Small/Medium/Large LcdSize values.

**NixieClockView** — StackPanel host with:
- D0/D1 (HH) + colon separator + D2/D3 (MM) NixieDigit slots
- Floating colon: two RadialGradientBrush Ellipses in a VerticalStackPanel (no tube border)
- `Size` DependencyProperty propagates height to all four digits and scales colon dots
- DispatcherTimer started/stopped via IsVisibleChanged — no redundant UpdateTime() in constructor
- `UpdateTime()` uses 12hr format: midnight/noon shows as 12, leading zero preserved for authentic Nixie look

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | NixieDigit UserControl + NixieSizeMap | 8833c42 | NixieDigit.xaml, NixieDigit.xaml.cs, NixieSize.cs |
| 2 | NixieClockView UserControl | d686eb1 | NixieClockView.xaml, NixieClockView.xaml.cs |

## Verification

- `dotnet build FuzzyClock.App/FuzzyClock.App.csproj` — 0 errors, 0 warnings
- All 5 new files exist
- No UIElement.Effect (DropShadowEffect/BlurEffect) in any Nixie file
- Ghost cathode array has exactly 10 elements
- RootCanvas.Width/Height set explicitly in RebuildGeometry()

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Ambiguous type references from System.Drawing globals**
- **Found during:** Task 1 build
- **Issue:** Project imports System.Drawing; `Rectangle`, `FontFamily`, and `Size` resolved as CS0104 ambiguous reference
- **Fix:** Added `using WpfRectangle`, `WpfFontFamily`, `WpfSize` aliases following the SevenSegmentDigit pattern (`WpfRectangle`, `WpfColor` etc.)
- **Files modified:** FuzzyClock.App/Controls/NixieDigit.xaml.cs
- **Commit:** included in 8833c42

## Self-Check: PASSED
