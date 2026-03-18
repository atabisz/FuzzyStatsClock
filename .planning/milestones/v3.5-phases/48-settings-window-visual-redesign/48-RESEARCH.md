# Phase 48: Settings Window Visual Redesign - Research

**Researched:** 2026-03-18
**Domain:** WPF Fluent Dark Theme / XAML styling scoped to a single Window
**Confidence:** HIGH

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SETR-01 | Settings window uses a dark background and light foreground text matching the widget's minimal aesthetic | ThemeMode="Dark" on Window element delivers this automatically via Fluent theme |
| SETR-02 | CheckBox, RadioButton, ComboBox, Button, and Slider controls have consistent dark-mode styling | Fluent dark theme includes Aero2-replacement styles for all five control types |
| SETR-03 | Section groups have adequate whitespace; controls are not cramped | Existing Margin values are thin; add Group-level top margins and row spacing in XAML |
| SETR-04 | Settings window styling is scoped to SettingsWindow only — no style leakage to MainWindow | ThemeMode on Window is window-local; App.xaml currently has empty Resources — safe by default |
</phase_requirements>

---

## Summary

Phase 48 is a pure XAML styling exercise. No C# code changes are needed. The goal is to give `SettingsWindow.xaml` a dark-mode appearance that matches the widget's minimal aesthetic, while leaving `MainWindow.xaml` and `App.xaml` completely unmodified.

The critical technical foundation is the WPF Fluent theme introduced in .NET 9 and improved in .NET 10 (the project's target). Setting `ThemeMode="Dark"` directly on the `<Window>` element activates the Fluent dark theme for that window only. This is official documented behavior from Microsoft Learn. Because the project's `App.xaml` has an empty `<Application.Resources />` and no `ThemeMode` attribute, there is zero risk of style leakage to `MainWindow`.

The main implementation work is: (1) add `ThemeMode="Dark"` to `SettingsWindow.xaml`'s Window element; (2) update the hardcoded light-mode colors embedded in `SegmentButtonStyle` and the theme-swatch `Border` elements to use dark-appropriate values; (3) adjust spacing/margin values so section groups breathe properly. All three changes are mechanical XAML edits.

**Primary recommendation:** Add `ThemeMode="Dark"` to `<Window>` in `SettingsWindow.xaml`, then fix the few hardcoded light hex colors that would look wrong on a dark background.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| WPF Fluent Theme | Built-in (.NET 9+) | Dark/light/system theme for all standard controls | Ships with .NET SDK; no NuGet install needed |
| PresentationFramework | net10.0-windows (in-box) | XAML control library (CheckBox, RadioButton, ComboBox, Button, Slider, TabControl) | Already used; ThemeMode activates Fluent styles on all of these |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| PresentationFramework.Fluent (resource dict) | Built-in | Alternative to ThemeMode — merges Fluent XAML at any scope | Use if you need per-ResourceDictionary scoping rather than per-Window |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| ThemeMode="Dark" on Window | Custom ResourceDictionary with hand-authored dark styles | More control but far more XAML to write and maintain; ThemeMode is the right tool here |
| ThemeMode="Dark" on Window | MahApps.Metro or ModernWpf NuGet | Third-party dependency; overkill for a single window in an otherwise plain-WPF app |

**Installation:** No installation required — Fluent theme ships with the .NET 10 Windows SDK.

---

## Architecture Patterns

### Recommended Project Structure

No structural changes needed. All work is confined to:

```
FuzzyClock.App/
├── SettingsWindow.xaml     ← ThemeMode + color updates here
├── App.xaml                ← DO NOT TOUCH (empty resources = no leakage)
└── MainWindow.xaml         ← DO NOT TOUCH (unaffected)
```

### Pattern 1: Window-Scoped ThemeMode

**What:** Add `ThemeMode="Dark"` to the `<Window>` root element of `SettingsWindow.xaml`. This activates the Fluent dark theme for all standard controls within that window only.

**When to use:** When you need dark styling on one window without affecting the entire application.

**Example:**
```xaml
<!-- Source: https://learn.microsoft.com/en-us/dotnet/desktop/wpf/whats-new/net90 -->
<Window x:Class="FuzzyClock.App.SettingsWindow"
        xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="FuzzyClock Settings"
        Width="480" Height="600"
        ResizeMode="NoResize"
        ShowInTaskbar="False"
        WindowStartupLocation="CenterScreen"
        ThemeMode="Dark">
```

**What ThemeMode="Dark" automatically handles:**
- Window chrome background (dark title bar / client area)
- `CheckBox` — dark background, light checkmark, dark check box border
- `RadioButton` — dark ring, light fill when selected
- `ComboBox` — dark dropdown background, light text, dark arrow
- `Button` — dark surface with light label
- `Slider` — dark track, accent-colored thumb
- `TabControl` / `TabItem` — dark tab strip and content area

### Pattern 2: Fixing Hardcoded Light Colors

**What:** `SettingsWindow.xaml` contains several hardcoded light hex colors that will look wrong or invisible against a dark background once ThemeMode="Dark" is applied. These must be replaced with dark-appropriate values.

**Affected locations identified in current XAML:**

| Element | Current Value | Problem | Dark Replacement |
|---------|--------------|---------|-----------------|
| `SegmentButtonStyle` selected state `Background` | `#FFFFFFFF` (white) | White pill on dark background has excessive contrast | `#FF3C3C3C` (dark gray pill) |
| `SegmentButtonStyle` selected state `BorderBrush` | `#FFBDBDBD` (light gray border) | Barely visible on dark | `#FF666666` |
| `SegmentButtonStyle` hover `Background` | `#FFD0D0D0` (light gray) | Light on dark looks wrong | `#FF555555` |
| Font Size / Clock Style rail `Border Background` | `#FFE8E8E8` (light gray rail) | Light rail on dark background | `#FF3A3A3A` |
| Theme swatch inner `Border Background` | `#FFF0F0F5` (near-white) | Light card on dark background | `#FF2D2D2D` |
| Theme swatch label `Foreground` | `#FF333333` (near-black) | Dark text invisible on dark card | `#FFD0D0D0` |
| Behavior tab description `Foreground` | `#FF666666` (medium gray) | May become illegible | `#FF999999` |

### Pattern 3: Whitespace / Section Breathing Room (SETR-03)

**What:** The Behavior tab has two labeled groups (Phrase Language, Battery Alert) with `Margin="0,16,0,4"` top spacing on section headers. The Stats tab has a flat StackPanel with no visual grouping between the six checkboxes and the subsequent rows. Adding `Margin` to section-start labels and ensuring at least 12–16px between logical groups improves scannability.

**Specific gaps in current XAML:**
- Stats tab: `ChkStatsVisible` has `Margin="0,0,0,10"` — fine. The Rows checkboxes WrapPanel has `Width="270"` with 5px bottom margin per row — adequate.
- Behavior tab: `TextBlock Text="Battery Alert"` has `Margin="0,16,0,4"` — adequate.
- Appearance tab: Grid rows after the accent swatches use `Margin="0,8,..."` — adequate.
- The main concern is the TabControl itself: with ThemeMode="Dark" the TabControl chrome will be styled; verify the `Margin="8"` on `<TabControl>` still looks right — it likely does.

### Anti-Patterns to Avoid

- **Do NOT set ThemeMode on App.xaml**: The decision is locked — App.xaml stays empty. Setting ThemeMode at application level would affect MainWindow (transparent overlay), which must remain unaffected.
- **Do NOT use `Application.Current.ThemeMode` in code**: This is experimental API (WPF0001 warning) and would apply globally. XAML attribute on Window is the stable path.
- **Do NOT merge the Fluent ResourceDictionary into App.xaml as an alternative**: Same leakage risk as app-level ThemeMode.
- **Do NOT add Window-level `<Window.Resources>` styles that target base types without a key**: An implicit style (no `x:Key`) in Window.Resources targets all controls of that type within the window — this is fine for SettingsWindow, but do not accidentally place it in App.xaml.
- **Do NOT forget `FocusVisualStyle="{x:Null}"` on custom-templated buttons**: The existing `SegmentButtonStyle` already has this; preserve it in the dark version.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Dark background for all standard controls | Custom ControlTemplate for each of CheckBox, RadioButton, ComboBox, Button, Slider | ThemeMode="Dark" (Fluent built-in) | Fluent handles all edge states: hover, pressed, disabled, focus; hand-rolling misses half of them |
| Dark window background | `<Window.Background>` set to a dark color + override every control | ThemeMode="Dark" | ThemeMode sets the client area background color automatically AND styles all controls consistently |

**Key insight:** ThemeMode="Dark" on a single Window is the exact mechanism Microsoft designed for this use case. It is one XAML attribute. Hand-rolling the equivalent requires 200–400 lines of ControlTemplate XAML with no benefit.

---

## Common Pitfalls

### Pitfall 1: Hardcoded Hex Colors Survive ThemeMode

**What goes wrong:** After adding `ThemeMode="Dark"`, the standard controls (CheckBox, ComboBox, etc.) look correct, but custom-styled elements (the segment button rail, theme swatches, description text) still render with their original light-mode colors, creating an inconsistent half-dark appearance.

**Why it happens:** `ThemeMode` only reskins standard WPF controls via the Fluent theme's implicit styles. It has no way to know about hardcoded hex values you wrote directly as property values in XAML attributes.

**How to avoid:** After adding `ThemeMode="Dark"`, audit every hardcoded hex color in `SettingsWindow.xaml` and update to a dark-appropriate equivalent. See the table in Architecture Patterns > Pattern 2.

**Warning signs:** Light-gray rails (`#FFE8E8E8`), near-white backgrounds (`#FFF0F0F5`), and dark-text foregrounds (`#FF333333`, `#FF666666`) in XAML are all red flags.

### Pitfall 2: Style Leakage via App.xaml

**What goes wrong:** A developer adds the Fluent ResourceDictionary or ThemeMode to App.xaml "for convenience", causing MainWindow to render with a Fluent-styled background and control chrome — breaking the transparent overlay.

**Why it happens:** App.xaml resources are Application-scoped and apply to every window.

**How to avoid:** App.xaml must remain `<Application.Resources />` (empty). The locked decision from STATE.md confirms this. Verify App.xaml is unchanged before and after the phase.

**Warning signs:** MainWindow background turns non-transparent; tray menu styling changes; any visual change to the widget overlay.

### Pitfall 3: Window ThemeMode Does Not Apply to ContextMenu / Popup

**What goes wrong:** A ComboBox dropdown (which uses a Popup internally) may render with the old Aero2 theme if ThemeMode inheritance through Popup boundaries is incomplete.

**Why it happens:** Popups create their own HwndSource (separate Win32 window), which may not inherit the parent window's ThemeMode cleanly. This was a known issue in .NET 9 early releases; .NET 10 has bug fixes for Fluent styles.

**How to avoid:** Test by opening each ComboBox (CmbPhraseStyle, CmbStatsInterval, CmbDateFormat, CmbPhraseLanguage) after the change. In .NET 10 the Fluent popup styles are expected to work. If a ComboBox dropdown reverts to light Aero2, the fallback is to add an explicit `<ComboBox.Resources>` with a merged Fluent dictionary or accept the minor inconsistency (dropdown itself is readable; the light popup on a dark window is cosmetically imperfect but functional).

**Warning signs:** ComboBox item list background is white while the rest of the window is dark.

### Pitfall 4: TabControl Content Area May Need Explicit Background

**What goes wrong:** The TabControl content area (the tab page surface) may not pick up the dark background in all Windows versions or DPI configurations, leaving a lighter rectangle behind the tab content.

**Why it happens:** TabControl content area background is sometimes set by the Windows visual style host rather than the Fluent template.

**How to avoid:** If the tab content area shows a light background after applying ThemeMode="Dark", add `Background="Transparent"` to the inner `<StackPanel Margin="12">` elements, which allows the Fluent TabControl template's own dark background to show through.

**Warning signs:** Dark tab headers, light content area rectangle.

---

## Code Examples

### Minimal SettingsWindow Window Element with ThemeMode

```xaml
<!-- Source: https://learn.microsoft.com/en-us/dotnet/desktop/wpf/whats-new/net90 -->
<Window x:Class="FuzzyClock.App.SettingsWindow"
        xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="FuzzyClock Settings"
        Width="480" Height="600"
        ResizeMode="NoResize"
        ShowInTaskbar="False"
        WindowStartupLocation="CenterScreen"
        ThemeMode="Dark">
```

### Updated SegmentButtonStyle for Dark Background

The segment button style lives inside `<Window.Resources>`. Replace the three light-mode color values:

```xaml
<!-- Selected state: dark pill on dark background -->
<DataTrigger Binding="{Binding Tag, RelativeSource={RelativeSource Self}}" Value="selected">
    <Setter Property="Background" Value="#FF3C3C3C"/>
    <Setter Property="BorderBrush" Value="#FF666666"/>
    <Setter Property="BorderThickness" Value="1"/>
</DataTrigger>
<!-- Hover on unselected: slightly lighter dark -->
<MultiDataTrigger>
    <MultiDataTrigger.Conditions>
        <Condition Binding="{Binding IsMouseOver, RelativeSource={RelativeSource Self}}" Value="True"/>
        <Condition Binding="{Binding Tag, RelativeSource={RelativeSource Self}}" Value="{x:Null}"/>
    </MultiDataTrigger.Conditions>
    <Setter Property="Background" Value="#FF555555"/>
</MultiDataTrigger>
```

### Updated Segment Button Rail Background

```xaml
<!-- Font Size rail — was #FFE8E8E8 -->
<Border Background="#FF3A3A3A" CornerRadius="4" Padding="2" ...>

<!-- Clock Style rail — was #FFE8E8E8 -->
<Border Background="#FF3A3A3A" CornerRadius="4" Padding="2" ...>
```

### Updated Theme Swatch Cards

Each theme swatch inner Border has `Background="#FFF0F0F5"`. Replace with:

```xaml
<!-- Theme swatch inner card — was #FFF0F0F5 -->
<Border Width="60" Height="64" Background="#FF2D2D2D" CornerRadius="4" ...>

<!-- Theme swatch label — was #FF333333 -->
<TextBlock Text="Midnight" FontSize="10" HorizontalAlignment="Center" Foreground="#FFD0D0D0"/>
```

### Updated Description Text Foreground

```xaml
<!-- Behavior tab description text — was #FF666666 -->
<TextBlock Text="Auto-detects from Windows display language. Override here."
           Foreground="#FF999999" FontSize="11" Margin="0,0,0,6" TextWrapping="Wrap"/>

<TextBlock Text="Alert when unplugged and battery is at or below:"
           Foreground="#FF999999" FontSize="11" Margin="0,0,0,6" TextWrapping="Wrap"/>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hand-authored dark ResourceDictionary (100s of lines) | `ThemeMode="Dark"` XAML attribute on Window | .NET 9 (Nov 2024) | One attribute handles all standard controls |
| Custom ControlTemplates for dark CheckBox/ComboBox etc. | Fluent implicit styles via ThemeMode | .NET 9 | No custom templates needed for standard controls |

**Deprecated/outdated:**
- Merging `PresentationFramework.Fluent` ResourceDictionary manually: Superseded by ThemeMode property; still works but ThemeMode is simpler.

---

## Open Questions

1. **ComboBox dropdown popup dark styling in .NET 10**
   - What we know: .NET 10 includes Fluent style bug fixes; popups creating separate HwndSources have historically been a problem spot.
   - What's unclear: Whether all four ComboBoxes in SettingsWindow get a dark dropdown in .NET 10 on the current machine without additional workaround.
   - Recommendation: Accept as a test point during execution. If any ComboBox dropdown reverts to Aero2, it is cosmetically imperfect but not a requirement failure (SETR-02 says "consistent dark-mode styling" for the control itself; the dropdown popup is secondary). Document the result in the verification step.

2. **Window title bar chrome color**
   - What we know: ThemeMode="Dark" on a Window applies the Fluent dark theme to the client area. The non-client title bar color depends on the Windows DWM theme.
   - What's unclear: Whether the SettingsWindow title bar will automatically go dark (Windows 11 DWM follows ThemeMode), or remain light (system default).
   - Recommendation: This is cosmetic only and not a requirement. If the title bar stays light against a dark client area, it is acceptable. Do not pursue a custom non-client area for this phase (REQUIREMENTS.md explicitly lists "Custom window chrome for Settings" as Out of Scope).

---

## Sources

### Primary (HIGH confidence)
- https://learn.microsoft.com/en-us/dotnet/desktop/wpf/whats-new/net90 — ThemeMode API, window-scoping, XAML syntax, available values (Light/Dark/System/None)
- https://learn.microsoft.com/en-us/dotnet/desktop/wpf/whats-new/net100 — .NET 10 Fluent style improvements, bug fixes, no breaking changes to ThemeMode
- `C:/src/FuzzyStatsClock/FuzzyClock.App/SettingsWindow.xaml` — Full XAML audit, all hardcoded colors identified
- `C:/src/FuzzyStatsClock/FuzzyClock.App/App.xaml` — Confirmed empty Application.Resources (no leakage risk)
- `C:/src/FuzzyStatsClock/.planning/STATE.md` — Locked decision: ThemeMode="Dark" on SettingsWindow, App.xaml stays empty

### Secondary (MEDIUM confidence)
- MEMORY.md project context — confirmed UseWindowsForms=true, .NET 10, existing SettingsWindow architecture

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — ThemeMode is official documented .NET 9/10 API from Microsoft Learn
- Architecture: HIGH — SettingsWindow.xaml fully read and audited; all affected elements identified
- Pitfalls: HIGH for color audit (direct code inspection); MEDIUM for ComboBox popup (documented .NET 10 improvement but not tested on this machine)

**Research date:** 2026-03-18
**Valid until:** 2026-09-18 (ThemeMode is stable; 6-month window appropriate for a shipped .NET feature)
