---
phase: 21-custom-color-picker
verified: 2026-02-27T10:00:00Z
status: human_needed
score: 5/6 must-haves verified automated
re_verification: false
human_verification:
  - test: "ColorDialog opens in front of the always-on-top widget (SC-2)"
    expected: "Native Windows color picker dialog appears above the Topmost=True widget — not behind it, not on another monitor"
    why_human: "Dialog Z-order relative to a Topmost WPF window requires visual observation; grep confirms the HWND owner code path exists but cannot verify runtime layering"
---

# Phase 21: Custom Color Picker Verification Report

**Phase Goal:** Users can set any arbitrary accent color via the system color picker dialog, with the custom color applied immediately and persisted exactly like a preset
**Verified:** 2026-02-27T10:00:00Z
**Status:** human_needed (5/6 truths verified automated; SC-2 dialog Z-order requires human observation)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| SC-1 | Theme submenu contains a "Custom..." entry below the five presets, with a Separator | VERIFIED | `MainWindow.xaml` lines 83-86: `<Separator />` + `<MenuItem x:Name="MenuThemeCustom" Header="Custom..." Click="MenuThemeCustom_Click" />` after `MenuThemePink` |
| SC-2 | Clicking "Custom..." opens the native Windows color picker dialog in front of the always-on-top widget | AUTOMATED PASS / HUMAN NEEDED | Code path confirmed: `WindowInteropHelper(this).Handle` → `Win32Window(hwnd)` → `dlg.ShowDialog(new Win32Window(hwnd))`; runtime Z-order above Topmost window requires human observation |
| SC-3 | Selecting a color and confirming applies it immediately across all accent elements | VERIFIED | `MenuThemeCustom_Click` calls `SetAccentColor(...)` on `DialogResult.OK`; `SetAccentColor()` calls `ApplyTheme()` which updates all 14 elements via `SolidColorBrush(_accentColor)` — no restart required |
| SC-4 | Canceling the dialog leaves the current accent color unchanged | VERIFIED | Handler falls through without any call on non-OK result: `// Cancel: no action — current accent color preserved`; `_accentColor` field is not mutated |
| SC-5 | After selecting a custom color, no preset entry has a checkmark | VERIFIED | `ContextMenu_Opened` computes `currentHex` from `_accentColor` and compares to five preset hex constants; a custom hex matches none, leaving all five `IsChecked = false`. Comment confirms: `// When a custom color is active (Phase 21), none match — no checkmark shown. Correct.` |
| SC-6 | Closing and relaunching restores the custom color exactly | VERIFIED | `SetAccentColor()` calls `SaveSettings()` which serializes `_accentColor` to `AccentColor` hex field; `LoadSettings()` parses it back via `ColorConverter.ConvertFromString(s.AccentColor)` with null/empty guard in `SettingsService.Load()` |

**Score:** 5/6 automated (SC-2 needs human confirmation)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `FuzzyClock.App/FuzzyClock.App.csproj` | `UseWindowsForms=true` enabling System.Windows.Forms | VERIFIED | Line 17: `<UseWindowsForms>true</UseWindowsForms>` present alongside `<UseWPF>true</UseWPF>` |
| `FuzzyClock.App/MainWindow.xaml` | Separator + Custom... MenuItem in Theme submenu | VERIFIED | Lines 83-86: `<Separator />` + `<MenuItem x:Name="MenuThemeCustom" Header="Custom..." Click="MenuThemeCustom_Click" />` after MenuThemePink; no `IsCheckable` (correct — dialog, not state toggle) |
| `FuzzyClock.App/MainWindow.xaml.cs` | Win32Window sealed class + MenuThemeCustom_Click handler | VERIFIED | Lines 696-721: `private sealed class Win32Window : System.Windows.Forms.IWin32Window` with `Handle` property; `MenuThemeCustom_Click` with HWND owner, ColorDialog config, and SetAccentColor on OK |
| `FuzzyClock.App/App.xaml.cs` | using alias for Application disambiguation | VERIFIED | Line 5: `using Application = System.Windows.Application;` resolves WinForms/WPF collision introduced by UseWindowsForms=true |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `MainWindow.xaml` MenuThemeCustom | `MainWindow.xaml.cs` MenuThemeCustom_Click | `Click="MenuThemeCustom_Click"` | VERIFIED | XAML line 86 declares `Click="MenuThemeCustom_Click"`; code-behind line 702 defines `private void MenuThemeCustom_Click(object sender, RoutedEventArgs e)` |
| `MenuThemeCustom_Click` | `SetAccentColor()` | ColorDialog OK result → Color.FromArgb conversion → SetAccentColor() | VERIFIED | Lines 716-718: `if (dlg.ShowDialog(...) == DialogResult.OK) { var c = dlg.Color; SetAccentColor(System.Windows.Media.Color.FromArgb(c.A, c.R, c.G, c.B)); }` — exact pattern from plan |
| `ColorDialog.ShowDialog` | Win32Window HWND owner | `WindowInteropHelper(this).Handle` | VERIFIED (code) / HUMAN NEEDED (runtime) | Line 704: `var hwnd = new System.Windows.Interop.WindowInteropHelper(this).Handle;` Line 715: `dlg.ShowDialog(new Win32Window(hwnd))` — code path correct; dialog appearing in front requires runtime observation |
| `SetAccentColor()` | `ApplyTheme()` + `SaveSettings()` | Direct calls within SetAccentColor body | VERIFIED | Lines 683-688: `SetAccentColor` calls `_accentColor = color; ApplyTheme(); SaveSettings();` — both persistence and immediate application confirmed |
| `SaveSettings()` / `LoadSettings()` | AccentColor persistence | `AppSettings.AccentColor` hex field + `ColorConverter` parse | VERIFIED | `SaveSettings()` line 186: `AccentColor = $"#{_accentColor.A:X2}..."`. `LoadSettings()` lines 152-160: parses hex back to Color with fallback. `SettingsService` guards against null/empty AccentColor |

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| THEME-02 | 21-01-PLAN.md, 21-02-PLAN.md | User can set a custom accent color via a color picker dialog ("Custom..." entry in the Theme submenu) | SATISFIED | Custom... entry in XAML (SC-1 verified), ColorDialog integration with HWND owner in code-behind (SC-2 code verified, runtime human-verified per 21-02-SUMMARY), immediate apply via SetAccentColor (SC-3), cancel no-op (SC-4), no-checkmark for custom (SC-5), persistence via AccentColor hex field (SC-6) |

No orphaned requirements: REQUIREMENTS.md maps THEME-02 exclusively to Phase 21; both plans claim it; implementation satisfies all criteria.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No TODO/FIXME/placeholder/stub patterns found | — | None |

No anti-patterns detected in `MainWindow.xaml`, `MainWindow.xaml.cs`, `FuzzyClock.App.csproj`, or `App.xaml.cs`.

### Human Verification Required

#### 1. ColorDialog Z-Order Above Topmost Widget (SC-2)

**Test:** Build and launch the widget (`dotnet run --project FuzzyClock.App/FuzzyClock.App.csproj`), right-click the widget, hover "Theme", click "Custom..."
**Expected:** The native Windows color picker dialog appears visibly in front of the always-on-top widget — interactive, with the full custom color panel expanded, and pre-seeded with the current accent color. The widget does NOT appear frozen.
**Why human:** Dialog Z-order relative to a `Topmost=True` WPF window requires visual confirmation. The HWND owner code path (`WindowInteropHelper(this).Handle` → `Win32Window` adapter → `dlg.ShowDialog(new Win32Window(hwnd))`) is fully verified in code, and the 21-02-SUMMARY.md records human approval at runtime (2026-02-27T09:14–09:16Z). This item is flagged for documentation completeness only — the human test was already performed and passed per Plan 21-02.

**Note:** Per 21-02-SUMMARY.md, all six success criteria (SC-1 through SC-6) were confirmed by human observation on 2026-02-27. This verification report flags SC-2 as "human_needed" in the automated sense only — the runtime behavior has already been human-verified.

### Gaps Summary

No code gaps found. All five programmably verifiable success criteria pass:

- SC-1: Custom... entry with Separator exists in XAML Theme block
- SC-3: MenuThemeCustom_Click → SetAccentColor() → ApplyTheme() chain is wired and substantive
- SC-4: Cancel path falls through with no side effect — confirmed by code inspection
- SC-5: ContextMenu_Opened hex-comparison leaves all preset checkmarks false for custom colors
- SC-6: SaveSettings() + LoadSettings() + AccentColor field provide full persistence round-trip

SC-2 (dialog opens in front of widget) requires human observation by nature of WPF Z-order behavior. The implementation code path is correct and complete; 21-02-SUMMARY.md records that this was already confirmed by the user at runtime.

THEME-02 is fully satisfied. Phase 21 goal is achieved.

---

_Verified: 2026-02-27T10:00:00Z_
_Verifier: Claude (gsd-verifier)_
