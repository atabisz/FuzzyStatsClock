# Architecture Research

**Domain:** WPF transparent desktop widget — color themes and opacity (v2.0)
**Researched:** 2026-02-27
**Confidence:** HIGH

---

## System Overview

v2.0 adds color themes and opacity to the existing v1.9 single-window code-behind architecture.
No components are added or removed. Three files are modified: `AppSettings.cs`, `MainWindow.xaml`,
and `MainWindow.xaml.cs`. `SettingsService.cs` and `App.xaml.cs` are untouched.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                            FuzzyClock.App (WPF)                               │
├──────────────────────────────────────────────────────────────────────────────┤
│  App.xaml.cs           MainWindow.xaml.cs            SettingsService.cs       │
│  (UNCHANGED)           (MODIFIED)                    (UNCHANGED)              │
│                              │                              │                 │
│                              │  ApplySettings()             │ Load/Save       │
│                              │  ApplyTheme()                ▼                 │
│                              │  SaveSettings()         AppSettings.cs         │
│                              │                         (MODIFIED: +2 fields)  │
│                              │                                                │
│                    ┌─────────┴──────────┐                                     │
│                    │                    │                                     │
│             _phraseTimer          _statsTimer                                 │
│             (10s, existing)       (1s/3s/10s, existing)                       │
│                    │                    │                                     │
│             PhraseEngine          StatsService.cs                             │
│             (UNCHANGED)           (UNCHANGED)                                 │
│                                                                               │
├──────────────────────────────────────────────────────────────────────────────┤
│  MainWindow.xaml (MODIFIED: +Theme submenu, +Opacity submenu)                 │
│                                                                               │
│  Window (Opacity = 0.0–1.0, window-level)                                    │
│    Grid                                                                       │
│      Border (ContentBorder — backdrop, existing)                              │
│        Grid (inner)                                                           │
│          Row 0: ShadowText + PhraseText (z-stack) / DialCanvas                │
│          Row 1: StatsPanel (CPU/GPU/MEM/PAG bars)                             │
│                                                                               │
│  Accent color applied in code-behind (ApplyTheme()) to:                       │
│    PhraseText.Foreground        → SolidColorBrush(accentColor)                │
│    HourHand.Stroke              → SolidColorBrush(accentColor)                │
│    MinuteHand.Stroke            → SolidColorBrush(accentColor)                │
│    _hourTickElements[].Stroke   → SolidColorBrush(accentColor)                │
│    _minuteDotElements[].Fill    → SolidColorBrush(accentColor)                │
│    _hourNumberElements[].Foreground → SolidColorBrush(accentColor)            │
│    CpuBar.Background + CpuText.Foreground → SolidColorBrush(accentColor)      │
│    GpuBar.Background + GpuText.Foreground → SolidColorBrush(accentColor)      │
│    MemBar.Background + MemText.Foreground → SolidColorBrush(accentColor)      │
│    PagBar.Background + PagText.Foreground → SolidColorBrush(accentColor)      │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Component Responsibilities

| Component | Status | Responsibility for v2.0 |
|-----------|--------|-------------------------|
| `App.xaml.cs` | Unchanged | Startup, hidden owner, SessionEnding backup save |
| `MainWindow.xaml.cs` | Modified | Add `_accentColor` and `_opacity` fields; add `ApplyTheme()`; add scroll wheel handler; extend `ApplySettings()`, `SaveSettings()`, `ContextMenu_Opened()`; add theme/opacity click handlers |
| `MainWindow.xaml` | Modified | Add Theme submenu; add Opacity submenu; wire `MouseWheel` event |
| `AppSettings.cs` | Modified | Add `string AccentColor` (hex, default `"#FFFFFF"`) and `double Opacity` (default `1.0`) |
| `SettingsService.cs` | Unchanged | Load/Save/Clamp work with new AppSettings fields automatically via init-property defaults |
| `StatsService.cs` | Unchanged | PerformanceCounter ownership — no color awareness |
| `FuzzyClock.Core` | Unchanged | PhraseEngine — no changes |

---

## New Fields in AppSettings

Two new fields added to the existing init-property record:

```csharp
public record AppSettings
{
    // ... existing fields unchanged ...
    public string AccentColor { get; init; } = "#FFFFFF";   // hex, RRGGBB or AARRGGBB
    public double Opacity     { get; init; } = 1.0;         // 0.0–1.0
}
```

**AccentColor as string (not Color struct):**
`System.Windows.Media.Color` is not natively serializable by `System.Text.Json`. A hex string is
serialized/deserialized with zero extra configuration and parsed at runtime via
`ColorConverter.ConvertFromString(hex)` — the same mechanism XAML uses internally. The
`ColorConverter` class in `System.Windows.Media` handles `#RRGGBB` and `#AARRGGBB` format.
(Source: `System.Windows.Media.ColorConverter` docs — HIGH confidence.)

**Opacity as double:**
`double` serializes natively. Range is 0.0–1.0 matching `UIElement.Opacity`. The default 1.0 means
existing users upgrading from v1.9 see no change on first launch — missing field defaults to 1.0.

**SettingsService.Defaults() update:**
```csharp
public static AppSettings Defaults() => new()
{
    Left = -1, Top = 20, FontSize = 32,
    StatsVisible = false, StatsIntervalSeconds = 3,
    CpuVisible = true, GpuVisible = true, MemVisible = true,
    PagVisible = true, DialMode = false,
    AccentColor = "#FFFFFF",
    Opacity = 1.0
};
```

No guard needed for Opacity in `Load()` — a JSON-absent or zero Opacity field defaults to `0.0`
via init-property, which is valid (fully transparent but not a dangerous timer value). If zero is
considered undesirable, add the same guard pattern as `StatsIntervalSeconds`:
```csharp
if (loaded.Opacity <= 0.0)
    loaded = loaded with { Opacity = Defaults().Opacity };
```
This guard is optional but recommended for robustness.

---

## New Fields in MainWindow

```csharp
private System.Windows.Media.Color _accentColor = System.Windows.Media.Colors.White;
private double _windowOpacity = 1.0;
```

`_accentColor` stores the parsed `System.Windows.Media.Color` struct at runtime — parsed once from
the hex string in `AppSettings` and cached so `ApplyTheme()` constructs brushes from it without
re-parsing the hex on every call.

`_windowOpacity` mirrors `this.Opacity` in a field so `SaveSettings()` reads the field rather than
reading the dependency property. Either approach is correct; the field is marginally cleaner.

---

## ApplyTheme() Method

`ApplyTheme()` is a new private method that applies `_accentColor` to every accent-colored element.
It is called after `_accentColor` changes (from menu selection or color picker) and once during
startup from `ApplySettings()`.

```csharp
private void ApplyTheme()
{
    var brush = new System.Windows.Media.SolidColorBrush(_accentColor);

    // Phrase mode elements
    PhraseText.Foreground = brush;
    // ShadowText remains dark (#BB000000) — it is the shadow layer, not the accent

    // Dial mode elements
    HourHand.Stroke   = brush;
    MinuteHand.Stroke = brush;
    foreach (var el in _hourTickElements)   el.Stroke      = brush;
    foreach (var el in _minuteDotElements)  el.Fill        = brush;
    foreach (var el in _hourNumberElements) el.Foreground  = brush;

    // Stats bar fill elements (the fill bar, not the track)
    CpuBar.Background  = brush;
    CpuText.Foreground = brush;
    GpuBar.Background  = brush;
    GpuText.Foreground = brush;
    MemBar.Background  = brush;
    MemText.Foreground = brush;
    PagBar.Background  = brush;
    PagText.Foreground = brush;
    // Row label text (CPU/GPU/MEM/PAG) can stay white or follow accent — design decision.
    // Recommended: leave labels white (high contrast regardless of accent) for readability.
}
```

**Why a single method instead of inline assignments:**
The same set of 14+ assignments must happen both at startup (ApplySettings) and at runtime (menu
click, color picker). A single `ApplyTheme()` call at both sites is the only way to guarantee
consistency. Scattering the assignments across multiple handlers creates divergence risk.

**Why brush is created fresh per call:**
`SolidColorBrush` is a lightweight object. Creating one per `ApplyTheme()` call (which is rare —
only on user action or startup) is correct. Sharing a single brush instance across all elements is
also valid but creates a complication: if any code later freezes the brush (for thread-safety),
all elements share the frozen instance and any subsequent color change would require creating a
new brush anyway. Per-call creation is simpler with no measurable cost.

**InitDialDecorations() ordering constraint:**
`_hourTickElements`, `_minuteDotElements`, and `_hourNumberElements` are populated in
`InitDialDecorations()`, which runs in `ContentRendered`. `ApplyTheme()` iterates these lists.

Calling order at startup:
1. `ApplySettings()` — runs before `Show()`, lists are empty at this point
2. `ContentRendered` → `InitDialDecorations()` creates the elements
3. `ContentRendered` → call `ApplyTheme()` after `InitDialDecorations()` to color them

At startup, `ApplySettings()` must NOT call `ApplyTheme()` directly because the decoration lists
are empty before `ContentRendered`. Instead, `ApplySettings()` sets `_accentColor` and
`_windowOpacity` from the loaded settings, then `ContentRendered` calls `ApplyTheme()` after
`InitDialDecorations()`. This mirrors the existing pattern for `_showHourTicks` etc.

---

## Opacity Integration

**Window.Opacity (inherited from UIElement.Opacity):**
Setting `this.Opacity = 0.75` applies a 0.75 opacity factor to the entire window and all its
children uniformly. This is the correct approach for widget-level opacity — it fades everything
(phrase, dial, stats, backdrop) together.
(Source: `UIElement.Opacity` docs — range 0.0–1.0, applied top-down to child elements. HIGH confidence.)

**Interaction with existing BackdropBorder hover:**
The `ContentBorder.Background` semi-transparent hover effect (`#590000000`) uses alpha on the
brush, not `Opacity`. These are independent: window Opacity multiplies on top of element alpha.
At 50% window opacity, the backdrop appears at 50% × 35% = ~17.5% effective opacity. This is
the expected behavior — the whole widget fades together including the backdrop.

**Scroll wheel handler:**
Wire `MouseWheel` on the Window (not Grid) so it fires even when hovering over elements that do
not handle scroll events themselves. The handler is wired in XAML for consistency with other event
patterns in this codebase.

```xml
<!-- MainWindow.xaml — Window element -->
<Window ...
        MouseWheel="Window_MouseWheel">
```

```csharp
private void Window_MouseWheel(object sender, MouseWheelEventArgs e)
{
    // e.Delta: positive = scroll up (increase opacity), negative = scroll down (decrease)
    // Standard delta is ±120 per notch. Use sign only, not magnitude.
    double delta = e.Delta > 0 ? 0.10 : -0.10;
    _windowOpacity = Math.Clamp(_windowOpacity + delta, 0.10, 1.0);
    // Clamp minimum to 0.10 — allowing 0.0 makes the widget invisible and unrecoverable
    // without restarting. 0.10 (10%) is barely visible but still interactable.
    this.Opacity = _windowOpacity;
    SaveSettings();
}
```

**Opacity minimum floor:** Clamp to 0.10 minimum, not 0.0. A fully transparent window with
`AllowsTransparency=True` is invisible but still receives mouse events (see `UIElement.Opacity`
docs: "even if declared opacity is 0, an element still participates in input events"). However,
if the user scrolls to 0% opacity, there is no visual feedback that the widget exists, making
it effectively lost. The 0.10 floor prevents this non-recoverable state. The preset menu offers
25%/50%/75%/100% as the four named steps.

**Preset menu opacity:**
```csharp
private void MenuOpacity25_Click(object sender, RoutedEventArgs e)  => SetOpacity(0.25);
private void MenuOpacity50_Click(object sender, RoutedEventArgs e)  => SetOpacity(0.50);
private void MenuOpacity75_Click(object sender, RoutedEventArgs e)  => SetOpacity(0.75);
private void MenuOpacity100_Click(object sender, RoutedEventArgs e) => SetOpacity(1.00);

private void SetOpacity(double opacity)
{
    _windowOpacity = opacity;
    this.Opacity   = opacity;
    SaveSettings();
}
```

---

## ApplySettings() Changes

`ApplySettings()` runs before `Show()`. The pre-Show safety invariant applies: do not call methods
that trigger `UpdateLayout()`, `Clamp()`, or `SaveSettings()`.

```csharp
internal void ApplySettings(AppSettings s)
{
    // ... existing fields (FontSize, position, stats, dial mode) unchanged ...

    // NEW: accent color — parse hex string to Color struct, store in field
    // Do NOT call ApplyTheme() here — _hourTickElements etc. are empty until ContentRendered
    try
    {
        _accentColor = (System.Windows.Media.Color)
            System.Windows.Media.ColorConverter.ConvertFromString(s.AccentColor);
    }
    catch
    {
        _accentColor = System.Windows.Media.Colors.White;  // fallback on invalid hex
    }

    // NEW: opacity — set field and Window.Opacity directly (safe before Show())
    _windowOpacity = s.Opacity;
    this.Opacity   = s.Opacity;
}
```

**Setting `this.Opacity` before Show():** `UIElement.Opacity` is a dependency property on the
visual. Setting it before `Show()` is safe — it is not position-related and does not require a
layout pass. This follows the same pattern as `StatsPanel.Visibility` (set directly in
`ApplySettings()`) and is distinct from the `ApplyFontSize()`/`SetStatsVisible()` group that
require `UpdateLayout()`.

**ContentRendered calls ApplyTheme() after InitDialDecorations():**
```csharp
ContentRendered += (_, _) =>
{
    // ... existing position clamp/PositionTopRight, timer setup, stats init ...
    if (_dialMode) UpdateDialDisplay();
    InitDialDecorations();
    ApplyTheme();    // NEW: after decoration lists are populated, apply accent color
    // ... hover handlers ...
};
```

---

## SaveSettings() Changes

Add the two new fields to the AppSettings construction:

```csharp
internal void SaveSettings()
{
    SettingsService.Save(new AppSettings
    {
        Left = Left, Top = Top,
        FontSize = _currentFontSize,
        StatsVisible = (StatsPanel.Visibility == Visibility.Visible),
        StatsIntervalSeconds = _statsIntervalSeconds,
        CpuVisible = (CpuRow.Visibility == Visibility.Visible),
        GpuVisible = (GpuRow.Visibility == Visibility.Visible),
        MemVisible = (MemRow.Visibility == Visibility.Visible),
        PagVisible = (PagRow.Visibility == Visibility.Visible),
        DialMode = _dialMode,
        ShowHourTicks   = _showHourTicks,
        ShowMinuteDots  = _showMinuteDots,
        ShowHourNumbers = _showHourNumbers,
        // NEW:
        AccentColor = $"#{_accentColor.R:X2}{_accentColor.G:X2}{_accentColor.B:X2}",
        Opacity     = _windowOpacity
    });
}
```

**AccentColor serialization:** Convert `_accentColor` back to `#RRGGBB` hex string. Alpha is
intentionally excluded — all preset themes and the custom picker use fully opaque colors; window
opacity is the separate opacity lever. Storing alpha in AccentColor would create two opacity
controls for the same visual effect and confuse the round-trip.

---

## ContextMenu Changes

### New XAML Structure

```xml
<ContextMenu Opened="ContextMenu_Opened">
    <MenuItem x:Name="MenuFontSize" Header="Font Size"> ... </MenuItem>
    <MenuItem Header="Stats"> ... </MenuItem>
    <MenuItem x:Name="MenuDialMode" ... />
    <MenuItem x:Name="MenuDialFace" ...> ... </MenuItem>

    <!-- NEW: Theme submenu -->
    <MenuItem Header="Theme">
        <MenuItem x:Name="MenuThemeWhite"   Header="White"           IsCheckable="True" Click="MenuThemeWhite_Click" />
        <MenuItem x:Name="MenuThemeAmber"   Header="Amber"           IsCheckable="True" Click="MenuThemeAmber_Click" />
        <MenuItem x:Name="MenuThemeIce"     Header="Ice Blue"        IsCheckable="True" Click="MenuThemeIce_Click" />
        <MenuItem x:Name="MenuThemeGreen"   Header="Green"           IsCheckable="True" Click="MenuThemeGreen_Click" />
        <MenuItem x:Name="MenuThemePink"    Header="Hello Kitty Pink" IsCheckable="True" Click="MenuThemePink_Click" />
        <Separator />
        <MenuItem x:Name="MenuThemeCustom"  Header="Custom Color..." Click="MenuThemeCustom_Click" />
    </MenuItem>

    <!-- NEW: Opacity submenu -->
    <MenuItem Header="Opacity">
        <MenuItem x:Name="MenuOpacity25"  Header="25%"  IsCheckable="True" Click="MenuOpacity25_Click" />
        <MenuItem x:Name="MenuOpacity50"  Header="50%"  IsCheckable="True" Click="MenuOpacity50_Click" />
        <MenuItem x:Name="MenuOpacity75"  Header="75%"  IsCheckable="True" Click="MenuOpacity75_Click" />
        <MenuItem x:Name="MenuOpacity100" Header="100%" IsCheckable="True" Click="MenuOpacity100_Click" />
    </MenuItem>

    <MenuItem Header="Close" Click="CloseMenuItem_Click" />
</ContextMenu>
```

**Custom Color... is not IsCheckable:** The custom color item opens a dialog, not a toggle. It
has no checked state. If the current color is a custom one (not a preset), none of the preset
MenuItems will show a checkmark — that is correct behavior.

**Opacity has no "Custom" option:** The scroll wheel already provides arbitrary 10%-increment
control. Preset steps (25/50/75/100) in the menu are the primary coarse controls. Showing a
checkmark only when the current opacity exactly matches a preset step (0.25/0.50/0.75/1.00) is
correct — at intermediate values (e.g., 0.60 via scroll wheel) no step is checked. This is
consistent with how `FontSmall/Medium/Large` work (no intermediate sizes exist, each maps 1:1).

### ContextMenu_Opened Sync

The existing sync pattern syncs `IsChecked` from state fields. Add theme and opacity syncs:

```csharp
private void ContextMenu_Opened(object sender, RoutedEventArgs e)
{
    // ... existing font, stats, dial syncs unchanged ...

    // Theme preset sync: check the preset whose hex matches _accentColor, or none for custom
    string currentHex = $"#{_accentColor.R:X2}{_accentColor.G:X2}{_accentColor.B:X2}";
    MenuThemeWhite.IsChecked = (currentHex == "#FFFFFF");
    MenuThemeAmber.IsChecked = (currentHex == "#FFC200");
    MenuThemeIce.IsChecked   = (currentHex == "#A8D8EA");
    MenuThemeGreen.IsChecked = (currentHex == "#39D353");
    MenuThemePink.IsChecked  = (currentHex == "#FF69B4");
    // MenuThemeCustom has no IsChecked — it opens a dialog

    // Opacity preset sync: check only exact matches
    MenuOpacity25.IsChecked  = (_windowOpacity == 0.25);
    MenuOpacity50.IsChecked  = (_windowOpacity == 0.50);
    MenuOpacity75.IsChecked  = (_windowOpacity == 0.75);
    MenuOpacity100.IsChecked = (_windowOpacity == 1.00);
}
```

**Hex comparison for theme check:** The canonical hex values for the five presets are constants in
the click handlers. Comparing the stored field to these constants is the correct sync pattern —
it matches how `_statsIntervalSeconds` is compared to 1/3/10.

**Floating-point equality for opacity:** `double` equality works correctly here because the only
way `_windowOpacity` changes is via `SetOpacity(0.25/0.50/0.75/1.00)` (preset click) or
`Window_MouseWheel` (10% increments via `Math.Clamp`). No arithmetic accumulation occurs that
would cause drift. The clamped `+= 0.10` pattern can accumulate small float error after many
scrolls — a safer sync is `Math.Round(_windowOpacity, 2)` comparison — but at 2 decimal places
this is not a practical problem.

---

## Color Picker Dialog

**WPF has no built-in color picker dialog.** The standard Windows color picker is in
`System.Windows.Forms.ColorDialog` from the WinForms assembly.

**Recommended approach: Use WinForms ColorDialog via interop.**
The WinForms `ColorDialog` is available in .NET 10 via `Microsoft.WindowsDesktop.App` (already
a dependency of any WPF app targeting `net10.0-windows`). No additional NuGet package is required.

```csharp
private void MenuThemeCustom_Click(object sender, RoutedEventArgs e)
{
    var dlg = new System.Windows.Forms.ColorDialog
    {
        Color = System.Drawing.Color.FromArgb(
            _accentColor.R, _accentColor.G, _accentColor.B),
        FullOpen = true,    // show full HSV picker, not just basic swatches
        AllowFullOpen = true
    };

    if (dlg.ShowDialog() == System.Windows.Forms.DialogResult.OK)
    {
        var dc = dlg.Color;
        _accentColor = System.Windows.Media.Color.FromRgb(dc.R, dc.G, dc.B);
        ApplyTheme();
        SaveSettings();
    }
}
```

**Why WinForms ColorDialog over a custom WPF color picker:**
A custom picker requires building a XAML dialog window, color wheel/slider controls, and hex input
validation — hundreds of lines for a widget that has "no settings screens" as a design constraint.
The WinForms `ColorDialog` is the standard Windows system dialog, familiar to users, zero-cost to
implement, and consistent with the project's simplicity principle. The interop works natively
because WPF and WinForms share the same .NET runtime.

**The `System.Windows.Forms` namespace must be referenced.** In .NET 10, the WinForms assembly is
part of the `Microsoft.WindowsDesktop.App` framework reference that WPF apps already target. No
NuGet addition is needed; add `<UseWindowsForms>true</UseWindowsForms>` to the `.csproj` to
enable the WinForms types.

```xml
<!-- FuzzyClock.App.csproj — inside <PropertyGroup> -->
<UseWindowsForms>true</UseWindowsForms>
```

---

## Data Flow

### Startup Flow (v2.0 additions in bold)

```
App.OnStartup()
    |
    +-- SettingsService.Load() -> AppSettings
    |       ** AccentColor and Opacity included with init-property defaults **
    |
    +-- new MainWindow()
    +-- mainWindow.ApplySettings(settings)
    |       +-- existing fields applied (font, position, stats, dial)
    |       ** _accentColor = parse settings.AccentColor (try/catch fallback to White) **
    |       ** _windowOpacity = settings.Opacity **
    |       ** this.Opacity = settings.Opacity          (safe before Show()) **
    |       ** NOTE: ApplyTheme() NOT called here — decoration lists empty **
    |
    +-- mainWindow.SetInitialPhrase(...)
    +-- mainWindow.Show()
            |
            +-- ContentRendered fires
                    +-- position clamp / PositionTopRight (existing)
                    +-- _timer started (existing)
                    +-- _statsService + _statsTimer (existing)
                    +-- UpdateDialDisplay() if _dialMode (existing)
                    +-- InitDialDecorations()    (existing)
                    ** ApplyTheme()  ← NEW, after InitDialDecorations() **
                    +-- hover handlers wired (existing)
```

### Theme Change Flow (runtime)

```
User selects "Amber" from Theme submenu
    |
    +-- MenuThemeAmber_Click fires
    +-- _accentColor = Color.FromRgb(0xFF, 0xC2, 0x00)
    +-- ApplyTheme()
    |       +-- new SolidColorBrush(_accentColor)
    |       +-- PhraseText.Foreground = brush
    |       +-- HourHand.Stroke = brush, MinuteHand.Stroke = brush
    |       +-- _hourTickElements[i].Stroke = brush  (0–12 elements, may be empty list)
    |       +-- _minuteDotElements[i].Fill = brush   (0–60 elements)
    |       +-- _hourNumberElements[i].Foreground = brush (0–12 elements)
    |       +-- CpuBar.Background = brush, CpuText.Foreground = brush
    |       +-- GpuBar.Background = brush, GpuText.Foreground = brush
    |       +-- MemBar.Background = brush, MemText.Foreground = brush
    |       +-- PagBar.Background = brush, PagText.Foreground = brush
    +-- SaveSettings()  (persists new AccentColor hex)
```

### Opacity Change Flow (scroll wheel)

```
User scrolls mouse wheel up over widget
    |
    +-- Window_MouseWheel fires (e.Delta > 0)
    +-- _windowOpacity = Math.Clamp(_windowOpacity + 0.10, 0.10, 1.0)
    +-- this.Opacity = _windowOpacity
    +-- SaveSettings()
```

---

## Integration Points

### Modified Files

| File | What Changes |
|------|-------------|
| `AppSettings.cs` | Add `string AccentColor { get; init; } = "#FFFFFF"` and `double Opacity { get; init; } = 1.0`; update `SettingsService.Defaults()` |
| `MainWindow.xaml` | Add Theme submenu (5 presets + Custom), Opacity submenu (4 presets), `MouseWheel` event on Window element |
| `MainWindow.xaml.cs` | Add `_accentColor`, `_windowOpacity` fields; add `ApplyTheme()`; add `Window_MouseWheel`, theme click handlers, opacity click handlers, `SetOpacity()`; extend `ApplySettings()`, `SaveSettings()`, `ContextMenu_Opened()`, `ContentRendered` |

### Unchanged Files

| File | Why Unchanged |
|------|--------------|
| `SettingsService.cs` | Load/Save/Clamp work with any AppSettings shape; init-property defaults handle new fields automatically |
| `App.xaml.cs` | Startup/shutdown flow unchanged; `ApplySettings()` call transparent to new fields |
| `StatsService.cs` | PerformanceCounter logic — no color or opacity awareness |
| `FuzzyClock.Core/` | PhraseEngine — no changes |

### XAML Elements Receiving Accent Color

The following named elements in `MainWindow.xaml` are written to by `ApplyTheme()`:

| Element | Property | Notes |
|---------|----------|-------|
| `PhraseText` | `Foreground` | Main phrase text |
| `ShadowText` | not changed | Shadow is always dark; leave as `#BB000000` |
| `HourHand` | `Stroke` | Dial hand |
| `MinuteHand` | `Stroke` | Dial hand |
| `CpuBar` | `Background` | Stats bar fill |
| `CpuText` | `Foreground` | Stats percentage text |
| `GpuBar` | `Background` | Stats bar fill |
| `GpuText` | `Foreground` | Stats percentage text |
| `MemBar` | `Background` | Stats bar fill |
| `MemText` | `Foreground` | Stats percentage text |
| `PagBar` | `Background` | Stats bar fill |
| `PagText` | `Foreground` | Stats percentage text |
| `_hourTickElements[]` | `Stroke` | Created in code-behind, iterated in `ApplyTheme()` |
| `_minuteDotElements[]` | `Fill` | Created in code-behind, iterated in `ApplyTheme()` |
| `_hourNumberElements[]` | `Foreground` | Created in code-behind, iterated in `ApplyTheme()` |

**Elements deliberately excluded from accent color:**
- `ShadowText` — always dark for contrast regardless of accent
- `CpuRow`, `GpuRow`, etc. label TextBlocks ("CPU", "GPU", "MEM", "PAG") — white is legible
  against any accent color; making labels match accent can cause low-contrast combinations
  (e.g., white accent + white label = invisible)
- `CpuBarTrack`, `GpuBarTrack`, etc. — track background stays `#40FFFFFF` (semi-transparent
  white); it is a neutral container, not an accent element
- `ContentBorder` backdrop — hover backdrop color (`#59000000`) is a neutral overlay, not themed

---

## Suggested Build Order

Each step is independently verifiable before the next begins.

**Step 1: AppSettings — add AccentColor and Opacity fields**
- Add `string AccentColor { get; init; } = "#FFFFFF"` to `AppSettings.cs`
- Add `double Opacity { get; init; } = 1.0` to `AppSettings.cs`
- Update `SettingsService.Defaults()` to include new fields
- Optionally add Opacity guard in `Load()` for zero-value robustness
- Verify: existing `settings.json` (without new fields) loads correctly — new fields default
- Verify: new round-trip saves and reloads both new fields

**Step 2: Opacity — window-level fade**
- Add `_windowOpacity` field to `MainWindow.xaml.cs`
- Add `MouseWheel="Window_MouseWheel"` to Window element in XAML
- Implement `Window_MouseWheel` (10% increments, clamp 0.10–1.00, SaveSettings)
- Add Opacity submenu to XAML (4 presets: 25/50/75/100)
- Implement `SetOpacity()`, four preset click handlers
- Extend `ApplySettings()` to set `_windowOpacity` and `this.Opacity`
- Extend `SaveSettings()` to persist `_windowOpacity`
- Extend `ContextMenu_Opened()` to sync opacity preset checkmarks
- Verify: scroll wheel fades widget; persists across restart; presets work; checkmarks sync

**Step 3: Accent color — presets**
- Add `_accentColor` field to `MainWindow.xaml.cs`
- Implement `ApplyTheme()` — sets `Foreground`/`Stroke`/`Fill`/`Background` on all 14+ elements
- Call `ApplyTheme()` at end of `ContentRendered` after `InitDialDecorations()`
- Extend `ApplySettings()` to parse `AccentColor` hex and set `_accentColor` (try/catch fallback)
- Extend `SaveSettings()` to serialize `_accentColor` back to `#RRGGBB`
- Add Theme submenu to XAML (5 presets, no Custom yet)
- Implement 5 preset click handlers: set `_accentColor`, call `ApplyTheme()`, `SaveSettings()`
- Extend `ContextMenu_Opened()` to sync theme preset checkmarks
- Verify: each preset changes all accent elements at once; persists across restart; checkmarks sync

**Step 4: Custom color picker**
- Add `<UseWindowsForms>true</UseWindowsForms>` to `.csproj`
- Add `Custom Color...` MenuItem to Theme submenu (no IsCheckable)
- Implement `MenuThemeCustom_Click` using `System.Windows.Forms.ColorDialog`
- Verify: custom color dialog opens pre-seeded with current accent color; choosing a color updates
  all accent elements; custom color persists across restart; no preset checkmark appears

**Step 5: Edge cases and cleanup**
- Test startup with default settings.json (White / 100% — no visible change from v1.9)
- Test upgrade from v1.9 settings.json (missing fields → default to White/1.0)
- Test all 5 presets in both phrase mode and dial mode (all elements change)
- Test opacity via scroll at 0.10 floor — confirm widget remains interactable
- Test custom color → preset → custom flow (no checkmark on custom; checkmark clears on preset)
- Verify stats bar track (`#40FFFFFF`) does not change — only bar fill changes

**Dependency rationale:**
- Step 1 before all: AppSettings schema must be stable before any field is read or written
- Step 2 before 3: Opacity is simpler (no element enumeration, no color parsing) — validates the
  `ApplySettings`/`SaveSettings` extension pattern before the more complex color wiring
- Step 3 before 4: Preset colors validate `ApplyTheme()` and the full round-trip before the
  color picker dialog adds the interop dependency
- Step 5 last: edge case and upgrade validation after happy path is fully confirmed

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Calling ApplyTheme() from ApplySettings()

**What:** Call `ApplyTheme()` inside `ApplySettings()` to apply accent color at startup alongside
all the other direct assignments.

**Why bad:** `ApplySettings()` runs before `Show()`. At that point, `InitDialDecorations()` has
not run, so `_hourTickElements`, `_minuteDotElements`, and `_hourNumberElements` are empty lists.
`ApplyTheme()` iterates these lists — calling it early silently skips all decoration elements.
`PhraseText` and static XAML elements would be colored, but decoration elements would not.
On the next `ApplyTheme()` call (first runtime theme change), all elements would suddenly gain
color. This creates a startup inconsistency: decoration elements show white even when a non-white
theme was saved.

**Instead:** `ApplySettings()` sets `_accentColor` from parsed hex (safe). `ContentRendered` calls
`ApplyTheme()` after `InitDialDecorations()` — the existing ordering pattern for startup safety.

### Anti-Pattern 2: Storing Color as System.Windows.Media.Color in AppSettings

**What:** Change `AccentColor` from `string` to `System.Windows.Media.Color` in the AppSettings
record so parsing is avoided at load time.

**Why bad:** `System.Text.Json` cannot natively serialize/deserialize `System.Windows.Media.Color`
(a struct with `A`, `R`, `G`, `B`, `ScA`, `ScR`, `ScG`, `ScB`, and `ColorContext` — the last
being an object). Without a custom converter, serialization would produce an unreadable JSON
object or fail. A hex string is human-readable in `settings.json` and round-trips trivially.

**Instead:** `string AccentColor` with `ColorConverter.ConvertFromString()` at load time.

### Anti-Pattern 3: Using UIElement.Opacity on Individual Elements Instead of Window

**What:** Apply opacity by setting `Opacity` on `PhraseText`, `DialCanvas`, `StatsPanel`, etc.
individually to achieve a "fade the widget" effect.

**Why bad:** `UIElement.Opacity` propagates top-down through the element tree but is NOT additive
from child to parent. Setting the window's `Opacity` to 0.5 automatically fades all children.
Setting each child's `Opacity` to 0.5 independently would not affect the window chrome (if any)
and would require maintaining a parallel set of "baseline opacities" per element to compute
the correct combined value when the widget also has the hover backdrop at partial alpha. The
interaction between element-level alpha and window-level alpha becomes complex and fragile.

**Instead:** `this.Opacity = value` — one assignment, entire window fades uniformly including
backdrop, all text, all bars.

### Anti-Pattern 4: Syncing Theme Checkmarks by Storing a Theme Name Field

**What:** Add a `string _currentThemeName` field, set it in each preset click handler, and compare
it in `ContextMenu_Opened()` instead of comparing the hex color.

**Why bad:** This introduces a secondary field that can become inconsistent with `_accentColor` if
a preset click handler fails to update both. The custom color picker has no theme name, so it
would need a sentinel value (e.g., `"Custom"`) that means nothing to `ApplyTheme()`. The hex
comparison approach derives checkmark state directly from the authoritative field (`_accentColor`)
with no secondary state.

**Instead:** Compare `$"#{_accentColor.R:X2}{_accentColor.G:X2}{_accentColor.B:X2}"` to the
preset constants in `ContextMenu_Opened()`. Single source of truth.

### Anti-Pattern 5: Double-Toggle on Theme Preset MenuItems

**What:** Read `MenuThemeAmber.IsChecked` in the click handler to decide whether to apply or
unapply the theme — i.e., clicking a checked preset unsets the theme.

**Why bad:** The existing codebase explicitly avoids reading `IsChecked` in click handlers because
WPF's `IsCheckable=True` toggles `IsChecked` before the handler fires. The handler would see the
post-toggle value, making the logic invert. All existing handlers (font size, stats, dial) read
actual state fields or element `Visibility`, never `IsChecked`.

**Instead:** Theme preset click handlers unconditionally apply the color. `ContextMenu_Opened()`
sets the correct `IsChecked` state from `_accentColor` before the menu is displayed. A theme
cannot be "unchecked" — selecting another preset clears the previous one's check automatically
via `ContextMenu_Opened()` sync on next open.

---

## SizeToContent Interaction Summary

Theme and opacity changes do not affect window size. Neither `UpdateLayout()` nor re-clamp is
needed after `ApplyTheme()` or `SetOpacity()`.

| Event | SizeToContent Effect | Action Required |
|-------|---------------------|-----------------|
| `ApplyTheme()` | None — only Brush/Color properties change | None |
| `SetOpacity()` / scroll wheel | None — `UIElement.Opacity` is a render-layer effect | None |
| Phrase text changes | Window width may change | Existing UpdateLayout() + re-clamp (unchanged) |
| Font size changes | Window width/height change | Existing UpdateLayout() + re-clamp (unchanged) |
| Stats panel visibility | Window height changes | Existing UpdateLayout() + re-clamp (unchanged) |

---

## Sources

| Claim | Source | Confidence |
|-------|--------|------------|
| `System.Windows.Media.ColorConverter.ConvertFromString()` parses `#RRGGBB` hex strings | https://learn.microsoft.com/en-us/dotnet/api/system.windows.media.colorconverter | HIGH |
| `UIElement.Opacity` range 0.0–1.0; applied top-down to child elements; element at 0.0 still receives input | https://learn.microsoft.com/en-us/dotnet/api/system.windows.uielement.opacity?view=windowsdesktop-10.0 | HIGH |
| `System.Windows.Media.Color.FromRgb(r, g, b)` factory method | https://learn.microsoft.com/en-us/dotnet/api/system.windows.media.color?view=windowsdesktop-10.0 | HIGH |
| `System.Text.Json` cannot natively serialize `System.Windows.Media.Color` (complex struct with ColorContext object) | Training data corroborated by Color struct API docs showing non-primitive members | MEDIUM |
| `System.Windows.Forms.ColorDialog` available in .NET 10 WPF projects via `<UseWindowsForms>true</UseWindowsForms>` | https://learn.microsoft.com/en-us/dotnet/desktop/wpf/ (.NET 10 WPF docs confirm WinForms interop pattern) | HIGH |
| WPF has no built-in color picker dialog control | Absence verified in WPF control library docs; confirmed community pattern is WinForms ColorDialog | HIGH |
| `ContextMenu_Opened` sync pattern for IsCheckable MenuItems; handlers must not read IsChecked | Existing codebase documented decision in PROJECT.md Key Decisions table | HIGH |
| `ApplySettings()` before `Show()` safety invariant; methods calling `UpdateLayout()` are unsafe before Show() | Existing codebase documented decision in PROJECT.md Key Decisions table | HIGH |

---

*Architecture research for: FuzzyClock v2.0 — color themes and opacity*
*Researched: 2026-02-27*
