# Phase 21: Custom Color Picker - Research

**Researched:** 2026-02-27
**Domain:** WinForms ColorDialog interop from WPF; HWND owner bridging; System.Drawing.Color → System.Windows.Media.Color conversion; csproj WinForms flag
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| THEME-02 | User can set a custom accent color via a color picker dialog ("Custom..." entry in the Theme submenu) | `System.Windows.Forms.ColorDialog` + `WindowInteropHelper` HWND owner pattern; `SetAccentColor()` already exists and handles apply + persist; `ContextMenu_Opened` already emits no checkmark for non-preset hex — no change needed there |
</phase_requirements>

---

## Summary

Phase 21 is a small, self-contained addition to the Theme submenu that Phase 20 already built. The entire infrastructure is complete: `_accentColor` field, `ApplyTheme()`, `SetAccentColor()`, hex-based checkmark sync in `ContextMenu_Opened`, and `AccentColor` persistence in `SaveSettings()`. Phase 21 has exactly two jobs: (1) add a `Separator` and `Custom...` `MenuItem` to the Theme submenu in XAML, and (2) implement `MenuThemeCustom_Click` in code-behind.

The only non-trivial aspect of Phase 21 is the WinForms ColorDialog interop. WPF has no built-in color picker dialog. The standard solution is `System.Windows.Forms.ColorDialog`, which requires `<UseWindowsForms>true</UseWindowsForms>` in the `.csproj` and an HWND owner bridge to prevent the dialog from rendering behind the always-on-top WPF window. Without the HWND owner bridge, the dialog appears beneath the `Topmost=True` window — making it invisible and the widget appear to freeze. This is the single most important thing to get right in this phase.

Persistence requires no changes: `SaveSettings()` already serializes `_accentColor` as `#AARRGGBB`, and `SettingsService.Load()` already guards against null/malformed values. Checkmark sync requires no changes: `ContextMenu_Opened()` already compares the current hex to the five preset constants — if no preset matches, no checkmark is shown, which is the correct behavior for a custom color.

**Primary recommendation:** Add `<UseWindowsForms>true</UseWindowsForms>` to the csproj, add the `Separator` + `Custom...` MenuItem to the Theme submenu XAML, and implement `MenuThemeCustom_Click` with `WindowInteropHelper` HWND owner and `System.Drawing.Color` → `System.Windows.Media.Color` conversion.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `System.Windows.Forms.ColorDialog` | windowsdesktop-10.0 (System.Windows.Forms.dll) | Native Win32 `ChooseColor` dialog — the standard Windows color picker | No NuGet required; familiar UI users recognize; zero implementation cost compared to a custom WPF picker; returns `System.Drawing.Color` which converts trivially |
| `System.Windows.Interop.WindowInteropHelper` | windowsdesktop-10.0 (PresentationFramework.dll) | Retrieves the HWND for a WPF `Window` | Required to pass the WPF window as `IWin32Window` owner to `ShowDialog()` — without it the dialog renders behind the `Topmost=True` overlay |
| `System.Windows.Media.Color.FromArgb` | windowsdesktop-10.0 (PresentationCore.dll) | Converts `System.Drawing.Color` (WinForms) to `System.Windows.Media.Color` (WPF) | In-box; four-byte constructor; already used for preset color constants |
| `System.Drawing.Color` | net-10.0 (System.Drawing.Primitives.dll) | Return type of `ColorDialog.Color` | In-box; pulled in automatically by `UseWindowsForms=true`; no separate NuGet |

### No New NuGet Packages

One csproj property change only:

```xml
<!-- FuzzyClock.App.csproj — add to existing <PropertyGroup> -->
<UseWindowsForms>true</UseWindowsForms>
```

`UseWPF=true` and `UseWindowsForms=true` coexist in the same project — confirmed by official .NET Desktop SDK MSBuild docs.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `System.Windows.Forms.ColorDialog` | Custom WPF color picker (XAML dialog window with HSV sliders) | Custom picker requires hundreds of lines; incompatible with "no settings screens" design principle; third-party WPF color picker NuGets are stale or have rendering issues on AllowsTransparency windows |
| `System.Windows.Forms.ColorDialog` | `Microsoft.Wpf.Toolkits.Extended.ColorPicker` | Third-party NuGet; last release years old; unknown AllowsTransparency compatibility |
| `WindowInteropHelper` HWND bridge | `PresentationSource.FromVisual(this)` | `WindowInteropHelper` is the canonical WPF interop helper for HWND retrieval; `PresentationSource` approach is less direct and more fragile |

---

## Architecture Patterns

### What Phase 21 Touches

Phase 21 is purely additive. Three locations change:

```
FuzzyClock.App/
├── FuzzyClock.App.csproj   # Add <UseWindowsForms>true</UseWindowsForms>
├── MainWindow.xaml          # Add <Separator /> + Custom... MenuItem to Theme submenu
└── MainWindow.xaml.cs       # Add MenuThemeCustom_Click handler
```

Zero changes to: `AppSettings.cs`, `SettingsService.cs`, `App.xaml.cs`, `StatsService.cs`, existing `ContextMenu_Opened()` logic, existing `SaveSettings()` logic.

### Pattern 1: HWND Owner Bridge for WinForms ColorDialog

**What:** `System.Windows.Forms.ColorDialog.ShowDialog()` accepts `System.Windows.Forms.IWin32Window` as an owner. WPF windows do not implement this interface. The canonical solution is a small private helper class wrapping the HWND, obtained via `WindowInteropHelper`.

**When to use:** Any time a WinForms dialog must appear in front of a `Topmost=True` WPF window.

```csharp
// Source: PITFALLS.md (project research, HIGH confidence) + official WindowInteropHelper docs
private sealed class Win32Window : System.Windows.Forms.IWin32Window
{
    public IntPtr Handle { get; }
    public Win32Window(IntPtr handle) => Handle = handle;
}

private void MenuThemeCustom_Click(object sender, RoutedEventArgs e)
{
    var hwnd = new System.Windows.Interop.WindowInteropHelper(this).Handle;

    using var dlg = new System.Windows.Forms.ColorDialog
    {
        AllowFullOpen = true,
        FullOpen = true,
        Color = System.Drawing.Color.FromArgb(
            _accentColor.A, _accentColor.R, _accentColor.G, _accentColor.B)
    };

    if (dlg.ShowDialog(new Win32Window(hwnd)) == System.Windows.Forms.DialogResult.OK)
    {
        var c = dlg.Color;
        SetAccentColor(System.Windows.Media.Color.FromArgb(c.A, c.R, c.G, c.B));
    }
    // Cancel: do nothing — _accentColor unchanged
}
```

**Key decisions in this pattern:**
- `AllowFullOpen = true` + `FullOpen = true`: opens the dialog with the full custom color panel visible by default, not just the basic 48-swatch palette. Matches "any arbitrary accent color" requirement.
- Pre-seeding `dlg.Color` with the current `_accentColor` channels: dialog opens showing the currently active accent color. Correct UX — user sees the active color as a starting point.
- `using var dlg`: `ColorDialog` implements `IDisposable`; using-declaration ensures cleanup.
- `SetAccentColor(...)`: the existing helper sets `_accentColor`, calls `ApplyTheme()`, calls `SaveSettings()`. No inline duplication.
- Cancel branch: no action needed — falls through silently.

### Pattern 2: System.Drawing.Color → System.Windows.Media.Color Conversion

**What:** `ColorDialog.Color` returns `System.Drawing.Color`. WPF brushes require `System.Windows.Media.Color`. The types are structurally identical (A, R, G, B bytes, 0–255 each) but are incompatible at the type-system level. The conversion is one line.

```csharp
// Source: STACK.md (project research, HIGH confidence) + official System.Drawing.Color docs
var sd = dlg.Color;  // System.Drawing.Color (WinForms type)
var wm = System.Windows.Media.Color.FromArgb(sd.A, sd.R, sd.G, sd.B);
// wm is System.Windows.Media.Color — usable in SolidColorBrush and _accentColor field
```

**Alpha note:** The Windows native color picker dialog does not expose alpha selection. `ColorDialog.Color.A` is always 255 (fully opaque). This is correct — widget opacity is controlled separately by `Window.Opacity`. Do not override `A` with any other value.

### Pattern 3: XAML Theme Submenu Addition

**What:** Add `<Separator />` and a non-checkable `Custom...` MenuItem below the five preset entries. Non-checkable because it opens a dialog, not a toggle.

```xml
<!-- Source: ARCHITECTURE.md (project research, HIGH confidence) -->
<!-- In MainWindow.xaml, inside <MenuItem Header="Theme"> — add after MenuThemePink: -->
<Separator />
<MenuItem x:Name="MenuThemeCustom"
          Header="Custom..."
          Click="MenuThemeCustom_Click" />
<!-- No IsCheckable — opens dialog, not a toggle -->
```

**Why no `IsCheckable`:** The custom entry is an action (opens a dialog), not a state toggle. The checkmark behavior for "current color is custom" is already handled by `ContextMenu_Opened` — when `_accentColor` does not match any of the five preset hex values, none of the five preset MenuItems shows a checkmark. This is the correct and complete behavior per success criterion 4. No additional `MenuThemeCustom.IsChecked` management is needed.

### Pattern 4: Existing SetAccentColor() — No Changes Needed

The Phase 20 `SetAccentColor()` helper already does everything Phase 21 needs:

```csharp
// Source: MainWindow.xaml.cs (codebase, confirmed Phase 20 complete)
private void SetAccentColor(System.Windows.Media.Color color)
{
    _accentColor = color;
    ApplyTheme();
    SaveSettings();
}
```

`MenuThemeCustom_Click` calls `SetAccentColor()` exactly as the preset handlers do. The custom path is indistinguishable from a preset at the `SetAccentColor` level — only the source (dialog vs constant) differs.

### Anti-Patterns to Avoid

- **Calling ColorDialog.ShowDialog() without owner HWND:** Dialog renders behind the `Topmost=True` widget. User sees nothing happen; widget appears frozen. Fix: always pass `new Win32Window(hwnd)` to `ShowDialog()`.

- **Forgetting `<UseWindowsForms>true</UseWindowsForms>` in .csproj:** `System.Windows.Forms` namespace not available; build fails. Fix: add the property before writing any WinForms code.

- **Making MenuThemeCustom IsCheckable:** The custom entry is an action, not a state. Adding `IsCheckable="True"` would make WPF toggle `IsChecked` on click. The handler would be called with `IsChecked` already toggled; the correct behavior (open dialog unconditionally) would require reading and ignoring `IsChecked`. Unnecessary complexity — omit `IsCheckable`.

- **Inline apply+save instead of SetAccentColor():** Writing `_accentColor = ...; ApplyTheme(); SaveSettings();` inside `MenuThemeCustom_Click` instead of calling `SetAccentColor()` — duplication that diverges when `SetAccentColor()` is later extended.

- **Re-implementing ContextMenu_Opened checkmark logic:** The existing sync logic already handles the custom color case: if `_accentColor` does not match any preset, none is checked. No additional code needed in `ContextMenu_Opened`.

- **Setting Color.A to anything other than 255:** Custom colors from the Windows picker are always fully opaque. Alpha is not an accent property in this codebase — it is a window-level opacity property. Forcing A=255 from `dlg.Color.A` is correct and sufficient.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Color picker UI | Custom WPF Window with sliders, hex input, color wheel, preview | `System.Windows.Forms.ColorDialog` | Hundreds of lines for something the OS provides for free; off-scope with "right-click only" interaction model |
| HWND owner adapter | P/Invoke to `GetHwnd()` or `PresentationSource` path | `WindowInteropHelper(this).Handle` | `WindowInteropHelper` is the canonical WPF interop HWND accessor; one line; no P/Invoke |
| Color type conversion | Manual hex parsing or bit shifting | `Color.FromArgb(sd.A, sd.R, sd.G, sd.B)` | One function call; type-safe; compiler-verified |

**Key insight:** Phase 21's complexity is in setup (csproj flag + HWND owner), not logic. The actual dialog interaction is 10-15 lines of code. The HWND owner pattern is the only pitfall with a non-obvious fix.

---

## Common Pitfalls

### Pitfall 1: ColorDialog Renders Behind the Widget (No HWND Owner)

**What goes wrong:** `colorDialog.ShowDialog()` (without owner argument) opens the dialog, but since the widget is `Topmost=True`, the dialog appears behind it. The UI appears frozen. On some Windows versions it appears on a different monitor or behind the taskbar.

**Why it happens:** Win32 places unowned dialogs at default Z-order, which is below any `Topmost=True` window.

**How to avoid:** Always pass a `IWin32Window` owner constructed from `WindowInteropHelper(this).Handle`:
```csharp
var hwnd = new System.Windows.Interop.WindowInteropHelper(this).Handle;
dlg.ShowDialog(new Win32Window(hwnd));
```

**Warning signs:** Clicking "Custom..." has no visible effect; widget appears unresponsive.

### Pitfall 2: System.Windows.Forms Not Available (Missing csproj Flag)

**What goes wrong:** `System.Windows.Forms.ColorDialog` is not resolvable; build fails with "The type or namespace name 'ColorDialog' does not exist in the namespace 'System.Windows.Forms'".

**Why it happens:** The WinForms assembly is not included in the build by default for WPF projects. `UseWPF=true` does not imply `UseWindowsForms=true`.

**How to avoid:** Add `<UseWindowsForms>true</UseWindowsForms>` to the `<PropertyGroup>` in `FuzzyClock.App.csproj` before writing any WinForms code.

**Warning signs:** Build error referencing `System.Windows.Forms` namespace.

### Pitfall 3: System.Drawing.Color Not Converted to System.Windows.Media.Color

**What goes wrong:** `dlg.Color` is `System.Drawing.Color`. Assigning it directly to `_accentColor` (`System.Windows.Media.Color`) fails to compile. Using it directly in `SolidColorBrush` also fails to compile. A beginner mistake is attempting an implicit conversion.

**Why it happens:** The two `Color` types are in different assemblies and namespaces despite being structurally similar.

**How to avoid:** Always explicitly convert:
```csharp
var c = dlg.Color;  // System.Drawing.Color
_accentColor = System.Windows.Media.Color.FromArgb(c.A, c.R, c.G, c.B);
```

**Warning signs:** Compilation error "Cannot implicitly convert type 'System.Drawing.Color' to 'System.Windows.Media.Color'".

### Pitfall 4: FullOpen Not Set — Dialog Opens in Compact Mode

**What goes wrong:** `ColorDialog` defaults to the compact 48-swatch palette view. The custom HSV/RGB panel is hidden; user cannot pick an arbitrary color. Clicking "Define Custom Colors >>" expands it, but this is an extra step the user should not need.

**Why it happens:** `FullOpen` and `AllowFullOpen` default to `false`.

**How to avoid:** Set both:
```csharp
dlg.AllowFullOpen = true;
dlg.FullOpen = true;
```

`AllowFullOpen = true` enables the "Define Custom Colors" button; `FullOpen = true` starts the dialog with the custom panel already expanded.

**Warning signs:** Dialog opens showing only the basic color swatches palette without the HSV/hex input section.

### Pitfall 5: Pre-Seeding dlg.Color Incorrectly (Channel Mismatch)

**What goes wrong:** Pre-seeding `dlg.Color` with the current accent color requires converting `System.Windows.Media.Color` to `System.Drawing.Color`. A common mistake is passing RGB in the wrong order, or omitting alpha.

**How to avoid:**
```csharp
dlg.Color = System.Drawing.Color.FromArgb(
    _accentColor.A, _accentColor.R, _accentColor.G, _accentColor.B);
```
`System.Drawing.Color.FromArgb(int alpha, int red, int green, int blue)` — ARGB order, matching `System.Windows.Media.Color` channel names.

**Warning signs:** Dialog opens showing a different color than the current accent color.

---

## Code Examples

Verified patterns from official sources and project research:

### Complete MenuThemeCustom_Click Implementation

```csharp
// Source: PITFALLS.md + ARCHITECTURE.md + STACK.md (project research, HIGH confidence)
// Add to MainWindow.xaml.cs:

private sealed class Win32Window : System.Windows.Forms.IWin32Window
{
    public IntPtr Handle { get; }
    public Win32Window(IntPtr handle) => Handle = handle;
}

private void MenuThemeCustom_Click(object sender, RoutedEventArgs e)
{
    var hwnd = new System.Windows.Interop.WindowInteropHelper(this).Handle;

    using var dlg = new System.Windows.Forms.ColorDialog
    {
        AllowFullOpen = true,
        FullOpen      = true,
        Color         = System.Drawing.Color.FromArgb(
                            _accentColor.A, _accentColor.R,
                            _accentColor.G, _accentColor.B)
    };

    if (dlg.ShowDialog(new Win32Window(hwnd)) == System.Windows.Forms.DialogResult.OK)
    {
        var c = dlg.Color;
        SetAccentColor(System.Windows.Media.Color.FromArgb(c.A, c.R, c.G, c.B));
    }
    // Cancel: no action — current accent color preserved
}
```

### XAML Theme Submenu (Complete Updated Block)

```xml
<!-- Source: ARCHITECTURE.md (project research) + current MainWindow.xaml state -->
<!-- Replace the existing <MenuItem Header="Theme"> block in MainWindow.xaml: -->
<MenuItem Header="Theme">
    <MenuItem x:Name="MenuThemeWhite"  Header="White"            IsCheckable="True" Click="MenuThemeWhite_Click" />
    <MenuItem x:Name="MenuThemeAmber"  Header="Amber"            IsCheckable="True" Click="MenuThemeAmber_Click" />
    <MenuItem x:Name="MenuThemeIce"    Header="Ice Blue"         IsCheckable="True" Click="MenuThemeIce_Click" />
    <MenuItem x:Name="MenuThemeGreen"  Header="Green"            IsCheckable="True" Click="MenuThemeGreen_Click" />
    <MenuItem x:Name="MenuThemePink"   Header="Hello Kitty Pink" IsCheckable="True" Click="MenuThemePink_Click" />
    <Separator />
    <MenuItem x:Name="MenuThemeCustom" Header="Custom..."        Click="MenuThemeCustom_Click" />
</MenuItem>
```

### csproj Addition

```xml
<!-- FuzzyClock.App/FuzzyClock.App.csproj — add to existing <PropertyGroup> -->
<UseWindowsForms>true</UseWindowsForms>
<!-- Must coexist with existing <UseWPF>true</UseWPF> — both are valid simultaneously -->
```

---

## Existing Codebase State (Phase 20 Complete)

Everything Phase 21 depends on is already in place. Phase 21 adds only what is listed below.

**Already complete — Phase 21 must NOT re-implement:**

```csharp
// MainWindow.xaml.cs — ALL of these exist from Phase 20:
private System.Windows.Media.Color _accentColor = System.Windows.Media.Colors.White;
private static readonly System.Windows.Media.Color PresetWhite = ...;
private static readonly System.Windows.Media.Color PresetAmber = ...;
private static readonly System.Windows.Media.Color PresetIce   = ...;
private static readonly System.Windows.Media.Color PresetGreen = ...;
private static readonly System.Windows.Media.Color PresetPink  = ...;

private void ApplyTheme() { /* 14-element brush assignment */ }
private void SetAccentColor(System.Windows.Media.Color color) { _accentColor = color; ApplyTheme(); SaveSettings(); }
private void MenuThemeWhite_Click(...) => SetAccentColor(PresetWhite);
// ... 4 more preset handlers

// In ContextMenu_Opened():
string currentHex = $"#{_accentColor.A:X2}{_accentColor.R:X2}{_accentColor.G:X2}{_accentColor.B:X2}";
MenuThemeWhite.IsChecked = (currentHex == "#FFFFFFFF");
MenuThemeAmber.IsChecked = (currentHex == "#FFFFC000");
MenuThemeIce.IsChecked   = (currentHex == "#FF87CEEB");
MenuThemeGreen.IsChecked = (currentHex == "#FF00C000");
MenuThemePink.IsChecked  = (currentHex == "#FFFF69B4");
// When custom color active: none match → no checkmark. Already correct for Phase 21.

// In SaveSettings():
AccentColor = $"#{_accentColor.A:X2}{_accentColor.R:X2}{_accentColor.G:X2}{_accentColor.B:X2}",
// Persists any _accentColor value, including custom. Already correct for Phase 21.
```

**What Phase 21 MUST add:**

1. `<UseWindowsForms>true</UseWindowsForms>` in `FuzzyClock.App.csproj`
2. `<Separator />` + `<MenuItem x:Name="MenuThemeCustom" Header="Custom..." Click="MenuThemeCustom_Click" />` in `MainWindow.xaml`
3. `private sealed class Win32Window : System.Windows.Forms.IWin32Window` in `MainWindow.xaml.cs`
4. `private void MenuThemeCustom_Click(object sender, RoutedEventArgs e)` in `MainWindow.xaml.cs`

That is the complete set of changes. No other file needs modification.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No custom color; only 5 presets | `Custom...` entry opens native Windows color picker | Phase 21 | User can set any RGB color |
| WPF had no color picker in earlier .NET | `System.Windows.Forms.ColorDialog` via WinForms interop | Available since .NET Core 3.1 | Zero-dependency native dialog; no NuGet |
| HWND owner required manual P/Invoke | `WindowInteropHelper(this).Handle` | WPF 3.0+ | Clean managed API; no P/Invoke |

**Deprecated/outdated:**
- Opening WinForms dialogs without an owner HWND on Topmost WPF windows: never do this; always use `WindowInteropHelper`.
- Third-party WPF color picker NuGets: stale, AllowsTransparency incompatible, unnecessary given WinForms interop.

---

## Open Questions

1. **Win32Window helper — class placement**
   - What we know: The `Win32Window` helper class is a simple HWND adapter needed only by `MenuThemeCustom_Click`. It can be a `private sealed class` nested inside `MainWindow` or a standalone file.
   - What's unclear: Which placement is more consistent with this codebase's style (code-behind only, no separate utility files).
   - Recommendation: Declare it as a `private sealed class Win32Window` inside `MainWindow.xaml.cs`, immediately before `MenuThemeCustom_Click`. This keeps related code together in the one file that uses it. The class is 4 lines — does not warrant a separate file.

2. **ColorDialog CustomColors persistence**
   - What we know: `ColorDialog` exposes a `CustomColors` property (int array) that persists the 16 custom color slots across dialog sessions. This is not persisted to `settings.json` in this design.
   - What's unclear: Whether users expect custom slot persistence across restarts.
   - Recommendation: Do not persist `CustomColors` — the requirement is only to persist the selected accent color (`AccentColor` hex in settings.json), which Phase 20 already handles. The dialog's 16 custom slots are volatile per session. This is acceptable; not a requirement per THEME-02.

---

## Validation Architecture

> Skipped — `workflow.nyquist_validation` is not set in `.planning/config.json` (field absent, treated as false).

---

## Sources

### Primary (HIGH confidence)

- `C:/src/FuzzyStatsClock/FuzzyClock.App/MainWindow.xaml.cs` — direct inspection: `SetAccentColor()` exists and is complete; `ContextMenu_Opened()` hex comparison pattern confirmed; `SaveSettings()` AccentColor serialization confirmed
- `C:/src/FuzzyStatsClock/FuzzyClock.App/MainWindow.xaml` — direct inspection: Theme submenu confirmed (5 preset items, no Custom entry or Separator yet)
- `C:/src/FuzzyStatsClock/FuzzyClock.App/FuzzyClock.App.csproj` — confirmed `<UseWindowsForms>` absent; only `<UseWPF>true</UseWPF>` present
- `C:/src/FuzzyStatsClock/.planning/research/PITFALLS.md` — Pitfall 3: ColorDialog behind Topmost + HWND owner fix; Pitfall 9: System.Drawing.Color conversion
- `C:/src/FuzzyStatsClock/.planning/research/ARCHITECTURE.md` — Color Picker Dialog section: complete `MenuThemeCustom_Click` pattern with `Win32Window` adapter; XAML Theme submenu with Custom entry
- `C:/src/FuzzyStatsClock/.planning/research/STACK.md` — ColorDialog API, `UseWindowsForms` + `UseWPF` coexistence, `System.Drawing.Color` type bridge
- `C:/src/FuzzyStatsClock/.planning/STATE.md` — locked decision: "v2.0 custom picker: ColorDialog requires HWND owner via WindowInteropHelper — without it the dialog renders behind Topmost=True WPF window"
- `C:/src/FuzzyStatsClock/.planning/phases/20-accent-color-presets/20-RESEARCH.md` — confirms Phase 20 complete; documents `<UseWindowsForms>` as Phase 21 requirement

### Secondary (MEDIUM confidence)

- None required — all findings verified from project-internal research docs and codebase inspection.

### External Reference (HIGH confidence via official docs)

- `System.Windows.Forms.ColorDialog`: https://learn.microsoft.com/en-us/dotnet/api/system.windows.forms.colordialog?view=windowsdesktop-10.0 — `Color`, `AllowFullOpen`, `FullOpen`, `ShowDialog(IWin32Window)` properties confirmed
- `System.Windows.Interop.WindowInteropHelper`: https://learn.microsoft.com/en-us/dotnet/api/system.windows.interop.windowinterophelper?view=windowsdesktop-10.0 — `Handle` property confirmed
- MSBuild Desktop SDK properties: https://learn.microsoft.com/en-us/dotnet/core/project-sdk/msbuild-props-desktop — `UseWindowsForms` + `UseWPF` coexistence confirmed

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — WinForms ColorDialog, WindowInteropHelper, Color.FromArgb all confirmed in official docs; csproj pattern confirmed
- Architecture: HIGH — exact code patterns from project ARCHITECTURE.md/PITFALLS.md/STATE.md; Phase 20 codebase confirmed in place
- Pitfalls: HIGH — HWND owner pitfall is documented locked decision in STATE.md; WinForms csproj flag is observable build requirement; all pitfalls verified against official docs or first-party research

**Research date:** 2026-02-27
**Valid until:** 2026-03-29 (30 days — stable Win32/WPF/WinForms APIs; no fast-moving dependencies)
