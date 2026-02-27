---
phase: 21-custom-color-picker
plan: "01"
subsystem: ui
tags: [wpf, winforms, colordialog, theme, accent-color]

# Dependency graph
requires:
  - phase: 20-accent-color-presets
    provides: SetAccentColor(), ApplyTheme(), ContextMenu_Opened checkmark sync, hex persistence via SaveSettings()
provides:
  - Custom color picker via Windows ColorDialog in Theme submenu
  - Win32Window HWND adapter for Topmost WPF window ownership
  - UseWindowsForms=true enabling System.Windows.Forms in WPF project
  - using aliases resolving Application and MouseEventArgs WinForms/WPF ambiguity
affects: [any future phase touching MainWindow.xaml.cs, theme system]

# Tech tracking
tech-stack:
  added: [System.Windows.Forms (UseWindowsForms=true), System.Drawing.Color, System.Windows.Forms.ColorDialog]
  patterns: [Win32Window HWND adapter pattern for WinForms dialogs in WPF, using alias disambiguation for WinForms+WPF coexistence]

key-files:
  created: []
  modified:
    - FuzzyClock.App/FuzzyClock.App.csproj
    - FuzzyClock.App/MainWindow.xaml
    - FuzzyClock.App/MainWindow.xaml.cs
    - FuzzyClock.App/App.xaml.cs

key-decisions:
  - "Win32Window sealed IWin32Window adapter passes WPF HWND to ColorDialog.ShowDialog() — required to prevent dialog rendering behind Topmost=True window"
  - "AllowFullOpen=true + FullOpen=true: opens color picker with full custom panel expanded by default"
  - "using Application = System.Windows.Application + using MouseEventArgs = System.Windows.Input.MouseEventArgs added to disambiguate WinForms/WPF collisions from UseWindowsForms=true"
  - "MenuThemeCustom has no IsCheckable — it opens a dialog, not a state toggle; ContextMenu_Opened already handles no-checkmark case for custom colors"

patterns-established:
  - "WinForms/WPF coexistence: add explicit using aliases for any type name collision rather than fully-qualifying at each call site"
  - "HWND owner pattern: always pass WindowInteropHelper(this).Handle via Win32Window adapter when showing WinForms dialogs from WPF Topmost windows"

requirements-completed: [THEME-02]

# Metrics
duration: 1min
completed: 2026-02-27
---

# Phase 21 Plan 01: Custom Color Picker Summary

**Native Windows ColorDialog integrated into Theme submenu via Win32Window HWND adapter, completing THEME-02 (final v2.0 Visual Identity requirement)**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-27T09:09:01Z
- **Completed:** 2026-02-27T09:10:09Z
- **Tasks:** 1/1
- **Files modified:** 4

## Accomplishments
- Added `UseWindowsForms=true` to csproj enabling System.Windows.Forms in the WPF project
- Added Separator + `Custom...` MenuItem (MenuThemeCustom) to Theme submenu in MainWindow.xaml
- Implemented Win32Window sealed IWin32Window adapter and MenuThemeCustom_Click handler in code-behind
- Fixed WinForms/WPF namespace ambiguity (Application, MouseEventArgs) with using aliases in both App.xaml.cs and MainWindow.xaml.cs

## Task Commits

Each task was committed atomically:

1. **Task 1: Add UseWindowsForms flag, Custom... MenuItem, Win32Window adapter, and MenuThemeCustom_Click handler** - `29d88cd` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `FuzzyClock.App/FuzzyClock.App.csproj` - Added `<UseWindowsForms>true</UseWindowsForms>` alongside `<UseWPF>true</UseWPF>`
- `FuzzyClock.App/MainWindow.xaml` - Added `<Separator />` + `<MenuItem x:Name="MenuThemeCustom" ...>` after MenuThemePink in Theme submenu
- `FuzzyClock.App/MainWindow.xaml.cs` - Added Win32Window sealed class, MenuThemeCustom_Click handler, using aliases for Application and MouseEventArgs
- `FuzzyClock.App/App.xaml.cs` - Added `using Application = System.Windows.Application` alias to resolve ambiguity

## Decisions Made
- Win32Window HWND adapter: passes WPF window handle to ColorDialog.ShowDialog() — mandatory for correct dialog placement in front of Topmost=True window
- AllowFullOpen+FullOpen both set true: opens with full custom panel (color wheel + sliders) visible by default rather than compact 48-swatch view
- Pre-seed dlg.Color from _accentColor channels: dialog opens showing the currently active accent color
- using aliases approach over fully-qualified names: cleaner, one declaration disambiguates all usages in the file

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Resolved WinForms/WPF namespace ambiguity from UseWindowsForms=true**
- **Found during:** Task 1 (build verification after applying all three file changes)
- **Issue:** Adding UseWindowsForms=true introduced ambiguous references: `Application` (System.Windows.Application vs System.Windows.Forms.Application) in App.xaml.cs and MainWindow.xaml.cs; `MouseEventArgs` (System.Windows.Input.MouseEventArgs vs System.Windows.Forms.MouseEventArgs) in MainWindow.xaml.cs — build failed with 3 CS0104 errors
- **Fix:** Added `using Application = System.Windows.Application` and `using MouseEventArgs = System.Windows.Input.MouseEventArgs` as explicit using aliases at top of affected files
- **Files modified:** FuzzyClock.App/App.xaml.cs, FuzzyClock.App/MainWindow.xaml.cs
- **Verification:** `dotnet build` reports Build succeeded with 0 Warning(s) 0 Error(s)
- **Committed in:** 29d88cd (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — build-breaking ambiguity from WinForms+WPF coexistence)
**Impact on plan:** Auto-fix required for build correctness. UseWindowsForms=true is a known cause of namespace collisions with WPF; using aliases are the idiomatic C# resolution. No scope creep.

## Issues Encountered
- UseWindowsForms=true causes implicit `using System.Windows.Forms;` bringing in types that collide with WPF types. Fixed with using aliases — this is expected when mixing WinForms and WPF in the same assembly.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- THEME-02 complete — v2.0 Visual Identity feature set is fully implemented (THEME-01 presets + THEME-02 custom picker)
- Custom color persists across restart via existing SaveSettings() hex serialization
- No checkmark shown for custom colors — ContextMenu_Opened hex comparison already handles this correctly
- All 14 accent elements recolored via existing SetAccentColor() + ApplyTheme() path — no changes to theme system

---
*Phase: 21-custom-color-picker*
*Completed: 2026-02-27*

## Self-Check: PASSED

- FuzzyClock.App/FuzzyClock.App.csproj — FOUND
- FuzzyClock.App/MainWindow.xaml — FOUND
- FuzzyClock.App/MainWindow.xaml.cs — FOUND
- FuzzyClock.App/App.xaml.cs — FOUND
- .planning/phases/21-custom-color-picker/21-01-SUMMARY.md — FOUND
- Commit 29d88cd — FOUND
