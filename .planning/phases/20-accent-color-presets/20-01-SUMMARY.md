---
phase: 20-accent-color-presets
plan: "01"
subsystem: MainWindow
tags: [accent-color, theme, presets, context-menu, settings-persistence]
dependency_graph:
  requires: [AppSettings.AccentColor field (Phase 18), InitDialDecorations() decoration lists (Phase 16)]
  provides: [ApplyTheme(), SetAccentColor(), 5 preset click handlers, Theme submenu, AccentColor persistence]
  affects: [MainWindow.xaml, MainWindow.xaml.cs]
tech_stack:
  added: []
  patterns: [SolidColorBrush instantiation (never mutate frozen Brushes.*), ColorConverter.ConvertFromString for hex parse, hex string serialization for Color, ApplyTheme after InitDialDecorations in ContentRendered]
key_files:
  created: []
  modified:
    - FuzzyClock.App/MainWindow.xaml.cs
    - FuzzyClock.App/MainWindow.xaml
decisions:
  - ApplyTheme called in ContentRendered AFTER InitDialDecorations — locked constraint; calling before produces empty foreach loops
  - always new SolidColorBrush(_accentColor) — never mutate Brushes.* frozen static instances
  - AccentColor parsed in ApplySettings with try/catch fallback to White — belt-and-suspenders on top of SettingsService.Load guards
  - AccentColor serialized as AARRGGBB (#FFFFFFFF format) matching AppSettings default
  - ContextMenu_Opened derives hex from _accentColor on the fly — no secondary theme-name field
metrics:
  duration: 2 min
  completed_date: 2026-02-27
  tasks_completed: 2
  files_modified: 2
---

# Phase 20 Plan 01: Accent Color Presets Summary

**One-liner:** Accent color presets (White/Amber/Ice Blue/Green/Hello Kitty Pink) with Theme submenu, ApplyTheme() covering 14 accent elements, and full settings persistence via hex AARRGGBB.

## What Was Built

Added complete accent color preset infrastructure to the FuzzyStatsClock widget. Users can now right-click to select a Theme from 5 named presets; the color is immediately applied to all 14 accent-colored elements and persisted to settings.json for restore on relaunch.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add accent color infrastructure and integration to MainWindow.xaml.cs | f125e44 | MainWindow.xaml.cs |
| 2 | Add Theme submenu to MainWindow.xaml ContextMenu | f125e44 | MainWindow.xaml |

Note: Tasks 1 and 2 were committed together because the code-behind (Task 1) references XAML x:Names (Task 2) — neither compiles independently. Both changes together produce a clean build.

## Key Implementation Details

**`_accentColor` field and preset constants:**
```csharp
private System.Windows.Media.Color _accentColor = System.Windows.Media.Colors.White;
private static readonly System.Windows.Media.Color PresetWhite = Color.FromArgb(0xFF, 0xFF, 0xFF, 0xFF);
private static readonly System.Windows.Media.Color PresetAmber = Color.FromArgb(0xFF, 0xFF, 0xC0, 0x00);
private static readonly System.Windows.Media.Color PresetIce   = Color.FromArgb(0xFF, 0x87, 0xCE, 0xEB);
private static readonly System.Windows.Media.Color PresetGreen = Color.FromArgb(0xFF, 0x00, 0xC0, 0x00);
private static readonly System.Windows.Media.Color PresetPink  = Color.FromArgb(0xFF, 0xFF, 0x69, 0xB4);
```

**`ApplyTheme()` covers 14 elements, explicitly excludes 3:**
- Accented (14): PhraseText.Foreground, HourHand.Stroke, MinuteHand.Stroke, all 12 _hourTickElements[].Stroke, all 60 _minuteDotElements[].Fill, all 12 _hourNumberElements[].Foreground, CpuBar/GpuBar/MemBar/PagBar.Background, CpuText/GpuText/MemText/PagText.Foreground
- Excluded (3 groups): ShadowText (#BB000000), bar track borders (#40FFFFFF), row label TextBlocks (no x:Name)

**ContentRendered ordering constraint (locked):**
```csharp
InitDialDecorations();   // populates _hourTickElements, _minuteDotElements, _hourNumberElements
ApplyTheme();            // safe to iterate — lists are populated
```

**ContextMenu_Opened hex comparison:**
```csharp
string currentHex = $"#{_accentColor.A:X2}{_accentColor.R:X2}{_accentColor.G:X2}{_accentColor.B:X2}";
MenuThemeWhite.IsChecked = (currentHex == "#FFFFFFFF");
// ... etc
```

## Verification Results

1. `dotnet build` — 0 errors, 10 warnings (all NU1900 network warnings about unreachable NuGet feeds, pre-existing)
2. `grep -c "MenuThemeWhite|MenuThemeAmber|..."` — returns **10** (5 IsChecked assignments + 5 handler definitions)
3. `grep "ApplyTheme"` — confirms ContentRendered call is after InitDialDecorations()
4. `grep "AccentColor"` — confirms parse in ApplySettings(), serialization in SaveSettings()
5. `grep "MenuThemeWhite" MainWindow.xaml` — Theme submenu with 5 items present before Opacity submenu

## Deviations from Plan

None — plan executed exactly as written. Tasks 1 and 2 were committed atomically (single commit) rather than separately because the code-behind references XAML x:Names that don't exist until Task 2 is applied; each task alone produces compiler errors. The combined commit is the only valid atomic unit.

## Self-Check: PASSED

- `FuzzyClock.App/MainWindow.xaml.cs` — modified, contains ApplyTheme, SetAccentColor, 5 preset handlers
- `FuzzyClock.App/MainWindow.xaml` — modified, contains MenuThemeWhite through MenuThemePink
- Commit f125e44 — exists in git log
- Build: 0 errors
