# Technology Stack: v2.0 Visual Identity

**Project:** FuzzyClock — color themes and opacity control
**Researched:** 2026-02-27
**Scope:** Additions only — existing validated stack is unchanged
**Confidence:** HIGH

---

## What Changes vs v1.9

v1.9 stack (already validated, not re-researched):
- .NET 10, C# 13, WPF (`net10.0-windows`)
- `System.Text.Json` for settings persistence
- `DispatcherTimer` for periodic UI updates
- `System.Windows.Controls` (TextBlock, ContextMenu, Grid, Border)
- `System.Windows.Shapes` (Line, Ellipse)
- `System.Diagnostics.PerformanceCounter` (NuGet 10.0.0)
- Code-behind pattern — no MVVM, no data bindings

v2.0 stack additions:

| Layer | What's Added | csproj Change |
|-------|-------------|---------------|
| WPF color API | `System.Windows.Media.Color` + `SolidColorBrush` | None — already in PresentationCore.dll |
| WPF opacity API | `UIElement.Opacity` (inherited by Window) | None — already in PresentationCore.dll |
| Scroll wheel input | `UIElement.MouseWheel` event + `MouseWheelEventArgs.Delta` | None — already in PresentationCore.dll |
| Custom color picker | `System.Windows.Forms.ColorDialog` | `<UseWindowsForms>true</UseWindowsForms>` |
| Color type bridge | `System.Drawing.Color` (R/G/B/A) → `System.Windows.Media.Color.FromArgb` | None — System.Drawing.Primitives.dll is in-box |

---

## Recommended Stack Additions

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `System.Windows.Media.Color` (struct) | (WPF in-box, windowsdesktop-10.0) | Represent the single accent color value in memory and in AppSettings serialization | Native WPF color type — direct input to `SolidColorBrush`; `Color.FromArgb(255, r, g, b)` is the canonical construction path; serializable as 4 bytes for JSON persistence |
| `System.Windows.Media.SolidColorBrush` | (WPF in-box, windowsdesktop-10.0) | Paint all colored elements at runtime — TextBlock.Foreground, Line.Stroke, Ellipse.Fill/Stroke, Border.Background fill | The only WPF brush type needed for solid single-color painting; `new SolidColorBrush(color)` one-liner integrates directly into existing code-behind pattern; already used in the project for backdrop logic |
| `UIElement.Opacity` (double, 0.0–1.0) | (WPF in-box, windowsdesktop-10.0, inherited from UIElement) | Apply widget-level transparency to the entire window | Window inherits `UIElement.Opacity`; setting `this.Opacity = 0.75` on the MainWindow applies transparency across all content simultaneously with no per-element work; works correctly with `AllowsTransparency=True` |
| `UIElement.MouseWheel` event + `MouseWheelEventArgs.Delta` | (WPF in-box, windowsdesktop-10.0) | Detect scroll wheel input to adjust opacity in 10% increments | Already available on `Window` via UIElement; `e.Delta / Mouse.MouseWheelDeltaForOneLine` normalizes detent counts (1 standard notch = Delta 120 = 1 detent); sign convention: positive = scroll up = increase opacity |
| `System.Windows.Forms.ColorDialog` | (WinForms in-box, windowsdesktop-10.0) | Custom color picker dialog — standard Windows color chooser that returns user-selected RGB | The native Win32 `ChooseColor` dialog; zero dependencies; familiar to users; returns `System.Drawing.Color` which converts to `System.Windows.Media.Color` with one `FromArgb` call; no NuGet required — only a csproj property change |

### WPF API Detail: SolidColorBrush Application

The existing code-behind already constructs `SolidColorBrush` objects directly (see `Window_MouseEnter` backdrop logic). The same pattern applies to accent color:

```csharp
// In code-behind: create brush from stored Color value
var brush = new SolidColorBrush(_accentColor);

// Apply to phrase text
PhraseText.Foreground = brush;

// Apply to dial hands (Line.Stroke) and decoration elements
HourHand.Stroke   = brush;
MinuteHand.Stroke = brush;
foreach (var tick in _hourTickElements)   tick.Stroke = brush;
foreach (var dot  in _minuteDotElements)  dot.Fill   = brush;
foreach (var tb   in _hourNumberElements) tb.Foreground = brush;

// Apply to stats bars (Border.Background) and label text
CpuBar.Background  = brush;
CpuText.Foreground = brush;
// ... repeat for GPU/MEM/PAG rows
```

**Why one brush instance reused across elements:** `SolidColorBrush` is a `Freezable`. When you assign the same instance to multiple properties, WPF holds a reference in each DependencyProperty. Creating a fresh `new SolidColorBrush(_accentColor)` per element call is acceptable (WPF does not require frozen brushes for code-behind assignment), but using a single instance is cleaner and avoids allocation churn on theme change.

**Confidence:** HIGH — `SolidColorBrush(Color)` constructor and `PresentationCore.dll` assembly confirmed via official windowsdesktop-10.0 docs.

### WPF API Detail: Color Storage and Serialization

`System.Windows.Media.Color` is a value type (struct). Store the accent color as a single `Color` field in `AppSettings`:

```csharp
// AppSettings record — new fields for v2.0
public string AccentColorHex  { get; init; } = "#FFFFFFFF";  // ARGB hex string
public double WindowOpacity   { get; init; } = 1.0;
```

**Why persist as hex string, not four separate bytes:** `System.Text.Json` serializes `System.Windows.Media.Color` as an object with multiple fields (A, R, G, B, ScA, ScR, ScG, ScB) by default. A single `#AARRGGBB` hex string is more compact, human-readable in the JSON file, forward-compatible, and trivially round-tripped:

```csharp
// Save: Color → hex string
string hex = $"#{color.A:X2}{color.R:X2}{color.G:X2}{color.B:X2}";

// Load: hex string → Color
// Use ColorConverter (System.Windows.Media) or manual parse:
var c = (Color)ColorConverter.ConvertFromString(hex);
// Or: Color.FromArgb(a, r, g, b) after parsing hex manually
```

`System.Windows.Media.ColorConverter` (in `PresentationCore.dll`) handles all standard WPF color string formats including `#AARRGGBB` — no custom parsing needed.

**Confidence:** HIGH — `Color.FromArgb(byte, byte, byte, byte)` and `ColorConverter` confirmed in official windowsdesktop-10.0 docs.

### WPF API Detail: Window.Opacity

`Window.Opacity` is `UIElement.Opacity` — no Window-specific override exists. It is a `double` dependency property with default 1.0 and expected range 0.0–1.0:

```csharp
// Set from menu (25/50/75/100% presets):
this.Opacity = 0.75;

// Set from scroll wheel (10% steps, clamped to 0.1–1.0):
this.Opacity = Math.Clamp(this.Opacity + (e.Delta > 0 ? 0.10 : -0.10), 0.1, 1.0);
```

**Interaction with AllowsTransparency:** The widget already has `AllowsTransparency="True"` and `Background="Transparent"`. `UIElement.Opacity` works correctly on `AllowsTransparency` windows — it applies a global alpha multiplier to the entire layered window HWND. This is distinct from per-pixel alpha (controlled by element backgrounds). Result: setting `Opacity=0.5` makes all content — phrase text, dial hands, stats bars, and the semi-transparent backdrop — uniformly half-opaque. This is the intended widget-level opacity behavior.

**Minimum opacity guard:** Do not allow 0.0 opacity. At 0.0, the window is invisible but still captures mouse events, making it impossible for the user to interact with. Clamp minimum to 0.1 (10%).

**Confidence:** HIGH — `UIElement.Opacity` property type, range, and assembly confirmed in official windowsdesktop-10.0 docs; AllowsTransparency interaction verified in official WPF window documentation.

### WPF API Detail: Scroll Wheel Normalization

```csharp
// Wire in ContentRendered (same pattern as MouseEnter/MouseLeave):
this.MouseWheel += Window_MouseWheel;

private void Window_MouseWheel(object sender, MouseWheelEventArgs e)
{
    // Mouse.MouseWheelDeltaForOneLine = 120 (one standard detent)
    // e.Delta is a multiple of 120 for standard mice
    // Positive = scroll up = increase opacity; negative = decrease
    double step = 0.10 * Math.Sign(e.Delta);
    this.Opacity = Math.Clamp(this.Opacity + step, 0.1, 1.0);
    SaveSettings();
}
```

`Mouse.MouseWheelDeltaForOneLine` is a `const int = 120` in `PresentationCore.dll`. One standard mouse wheel detent produces exactly Delta=120 (or -120). Using `Math.Sign(e.Delta)` rather than dividing by 120 means one step per physical notch regardless of high-resolution wheel variations — correct for a 10%-per-notch opacity adjustment.

**Confidence:** HIGH — `Mouse.MouseWheelDeltaForOneLine = 120` confirmed in official windowsdesktop-10.0 docs; sign convention (positive = away from user = scroll up) confirmed in `MouseWheelEventArgs` docs.

### Supporting Library: System.Windows.Forms.ColorDialog

`System.Windows.Forms.ColorDialog` wraps the native Win32 `ChooseColor` common dialog. It opens the standard Windows color picker that users recognize from Paint, Office, and other applications.

**Assembly:** `System.Windows.Forms.dll`
**csproj change required:** Add `<UseWindowsForms>true</UseWindowsForms>` to the `<PropertyGroup>`. This can coexist with `<UseWPF>true</UseWPF>` — the .NET Desktop SDK documentation explicitly supports both flags in the same project.

```csharp
// In custom color picker menu handler:
private void MenuCustomColor_Click(object sender, RoutedEventArgs e)
{
    var dlg = new System.Windows.Forms.ColorDialog
    {
        FullOpen    = true,   // Show custom color panel expanded by default
        Color       = System.Drawing.Color.FromArgb(
                          _accentColor.A, _accentColor.R,
                          _accentColor.G, _accentColor.B)
    };

    if (dlg.ShowDialog() == System.Windows.Forms.DialogResult.OK)
    {
        // Convert System.Drawing.Color → System.Windows.Media.Color
        var sd = dlg.Color;
        ApplyAccentColor(
            System.Windows.Media.Color.FromArgb(sd.A, sd.R, sd.G, sd.B));
    }
}
```

**Color type bridge:** `ColorDialog.Color` returns `System.Drawing.Color` (from `System.Drawing.Primitives.dll`, in-box). Converting to `System.Windows.Media.Color` requires `Color.FromArgb(sd.A, sd.R, sd.G, sd.B)` — four bytes, no math. `System.Drawing.Primitives.dll` is pulled in automatically with `UseWindowsForms=true`; it does not need a separate NuGet package.

**Confidence:** HIGH — `System.Windows.Forms.ColorDialog` existence in `windowsdesktop-10.0` confirmed; `UseWindowsForms` + `UseWPF` coexistence confirmed in official .NET Desktop SDK MSBuild docs.

---

## csproj Change Summary

```xml
<!-- Only addition required to the .csproj: -->
<PropertyGroup>
  <UseWPF>true</UseWPF>
  <UseWindowsForms>true</UseWindowsForms>   <!-- ADD THIS LINE -->
</PropertyGroup>
```

No new NuGet packages. `System.Diagnostics.PerformanceCounter` at 10.0.0 is unchanged.

---

## AppSettings Record Extension

The existing `AppSettings` init-property record must be extended with two new fields:

```csharp
// v2.0 additions to AppSettings record
public string AccentColorHex { get; init; } = "#FFFFFFFF";  // default: White
public double WindowOpacity  { get; init; } = 1.0;          // default: fully opaque
```

`System.Text.Json` serializes/deserializes `string` and `double` init-property fields natively — same pattern validated in v1.1 through v1.9. No attributes needed. Old settings.json files without these fields will load them as defaults (White accent, 100% opacity) — forward-compatible.

`AccentColorHex` default `"#FFFFFFFF"` matches the current hardcoded `Foreground="White"` on all TextBlock/Line/Ellipse/Border elements in XAML, ensuring zero visual change for existing users on first upgrade.

---

## Preset Color Values

The 5 built-in presets as `#AARRGGBB` hex strings (alpha = FF = fully opaque):

| Preset Name | Hex Value | R, G, B |
|-------------|-----------|---------|
| White | `#FFFFFFFF` | 255, 255, 255 |
| Amber | `#FFFFBF00` | 255, 191, 0 |
| Ice Blue | `#FF99D9EA` | 153, 217, 234 |
| Green | `#FF57F287` | 87, 242, 135 |
| Hello Kitty Pink | `#FFFF85C2` | 255, 133, 194 |

These values are embedded directly in the menu click handlers — no enum or dictionary required. The `ApplyAccentColor(Color)` method handles all element updates regardless of source (preset or custom picker).

**Color selection rationale:** All presets are light-to-mid-tone colors that remain legible against the semi-transparent dark backdrop (#26000000 = 15% black) and against light wallpapers. Avoid dark colors (low contrast against the near-transparent background) and highly saturated pure primaries (eye strain at small font sizes).

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| `System.Windows.Forms.ColorDialog` | Custom WPF color picker window | ColorDialog is the native Win32 dialog — zero implementation effort, users already know it; a custom WPF dialog requires significant XAML/code work (HSV slider, preview swatch, hex input) that is out of scope for this milestone |
| `System.Windows.Forms.ColorDialog` | `Microsoft.Wpf.Toolkits.Extended.ColorPicker` NuGet | Third-party NuGet — adds external dependency; last release years old; custom WPF controls have known rendering issues in `AllowsTransparency` windows |
| Store color as hex string in AppSettings | Store as struct with R/G/B/A int fields | Hex string is human-readable in the JSON file, conventional for color representation, and trivially round-tripped via `ColorConverter` or manual parse |
| Store color as hex string in AppSettings | Store as `System.Windows.Media.Color` struct directly | `System.Text.Json` serializes the struct as an object with 9 properties (A/R/G/B/ScA/ScR/ScG/ScB/ColorContext) — verbose and fragile; hex string is canonical |
| `UIElement.Opacity` on Window | `UIElement.OpacityMask` | OpacityMask applies per-pixel masking from a brush, not scalar transparency — wrong tool for widget-level opacity |
| `UIElement.Opacity` on Window | `Brush.Opacity` on individual brushes | Would require updating brush opacity on every element separately; Window.Opacity is one line that covers everything uniformly |
| `Math.Sign(e.Delta)` for scroll step | `e.Delta / Mouse.MouseWheelDeltaForOneLine` | Sign-based ensures exactly one 10% step per detent regardless of high-resolution mouse; division-based would produce fractional steps on precision scroll wheels |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `System.Windows.Media.Colors` static properties (e.g. `Colors.White`) for preset storage | Static brush references are frozen and cannot be passed to `SolidColorBrush(Color)` without extracting `.Color`; using `Color.FromArgb` with literal bytes is more explicit and consistent | `Color.FromArgb(255, 255, 255, 255)` or hardcoded hex string |
| MVVM / `INotifyPropertyChanged` for accent color binding | Inconsistent with existing code-behind style; adds abstraction layer for a single-field update; `ApplyAccentColor()` method calling element assignments directly matches all existing patterns | Direct element assignment in `ApplyAccentColor()` method |
| `ColorConverter.ConvertFromString` for hex parsing at load | Requires unsafe cast and can throw on malformed input; manual byte parsing with `Convert.ToByte(hex.Substring(...), 16)` is explicit and handles malformed input gracefully with try/catch | Manual hex parse or `Color.FromArgb` after parsing |
| Animating opacity transitions (DoubleAnimation) | DropShadowEffect-class GPU rendering issue confirmed in .NET 10 for `AllowsTransparency` layered HWNDs; animations may interact unexpectedly with the layered window compositor | Instant `Opacity` assignment on menu click or scroll wheel |
| `Window.Background` brush opacity for transparency effect | `Window.Background` is `#01000000` (near-transparent hit-test sentinel, 1 alpha) — changing it would break right-click hit testing; `UIElement.Opacity` is the correct knob | `this.Opacity` (UIElement.Opacity) |
| `UseWindowsForms=true` without `UseWPF=true` | Using only `UseWindowsForms` would break the WPF build pipeline | Keep both properties in the `<PropertyGroup>` |

---

## Version Compatibility

| Component | Version | Notes |
|-----------|---------|-------|
| `System.Windows.Media.Color` | windowsdesktop-10.0 (PresentationCore.dll) | No version constraints; unchanged API since WPF 3.0 |
| `System.Windows.Media.SolidColorBrush` | windowsdesktop-10.0 (PresentationCore.dll) | No version constraints; unchanged API since WPF 3.0 |
| `UIElement.Opacity` | windowsdesktop-10.0 (PresentationCore.dll) | No version constraints; unchanged since WPF 3.0 |
| `UIElement.MouseWheel` / `MouseWheelEventArgs` | windowsdesktop-10.0 (PresentationCore.dll) | No version constraints; `Mouse.MouseWheelDeltaForOneLine = 120` is stable |
| `System.Windows.Forms.ColorDialog` | windowsdesktop-10.0 (System.Windows.Forms.dll) | Available with `UseWindowsForms=true` on `net10.0-windows`; no NuGet required |
| `System.Drawing.Color` | net-10.0 (System.Drawing.Primitives.dll) | In-box; pulled in automatically with `UseWindowsForms=true` |
| `System.Windows.Media.ColorConverter` | windowsdesktop-10.0 (PresentationCore.dll) | In-box WPF; handles `#AARRGGBB` format |
| `System.Diagnostics.PerformanceCounter` NuGet | 10.0.0 (unchanged) | No change required |

---

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| `System.Windows.Media.Color` / `SolidColorBrush` API | HIGH | Official windowsdesktop-10.0 docs confirmed; assembly `PresentationCore.dll`; `FromArgb` signature verified |
| `UIElement.Opacity` (Window.Opacity) | HIGH | Official windowsdesktop-10.0 docs confirmed; `double`, range 0.0–1.0, default 1.0; AllowsTransparency interaction documented |
| `MouseWheelEventArgs.Delta` + `Mouse.MouseWheelDeltaForOneLine` | HIGH | Official windowsdesktop-10.0 docs confirmed; value = 120; sign convention documented |
| `System.Windows.Forms.ColorDialog` | HIGH | Official windowsdesktop-10.0 docs confirmed; assembly `System.Windows.Forms.dll`; `UseWindowsForms` + `UseWPF` coexistence documented |
| `System.Drawing.Color` type bridge | HIGH | Official net-10.0 docs confirmed; A/R/G/B byte properties verified; `System.Drawing.Primitives.dll` in-box |
| `UseWindowsForms` + `UseWPF` coexistence | HIGH | Official .NET Desktop SDK MSBuild properties docs confirm both flags supported in same project |
| AppSettings hex string round-trip | HIGH | `ColorConverter.ConvertFromString` and `Color.FromArgb` both confirmed in official docs |
| Preset color values | MEDIUM | RGB values are author-specified aesthetic choices, not verified against any external standard |

---

## Sources

- `System.Windows.Media.Color` struct (windowsdesktop-10.0): https://learn.microsoft.com/en-us/dotnet/api/system.windows.media.color?view=windowsdesktop-10.0 — confirms `FromArgb(byte,byte,byte,byte)`, `FromRgb`, A/R/G/B properties, `PresentationCore.dll` assembly
- `System.Windows.Media.SolidColorBrush` class (windowsdesktop-10.0): https://learn.microsoft.com/en-us/dotnet/api/system.windows.media.solidcolorbrush?view=windowsdesktop-10.0 — confirms `SolidColorBrush(Color)` constructor, `Color` property, `PresentationCore.dll` assembly
- `System.Windows.UIElement.Opacity` property (windowsdesktop-10.0): https://learn.microsoft.com/en-us/dotnet/api/system.windows.uielement.opacity?view=windowsdesktop-10.0 — confirms `double` type, 0.0–1.0 range, default 1.0, `PresentationCore.dll` assembly
- `System.Windows.Input.MouseWheelEventArgs` class (windowsdesktop-10.0): https://learn.microsoft.com/en-us/dotnet/api/system.windows.input.mousewheeleventargs?view=windowsdesktop-10.0 — confirms `Delta` property, sign convention (positive = away from user)
- `System.Windows.Input.Mouse.MouseWheelDeltaForOneLine` field (windowsdesktop-10.0): https://learn.microsoft.com/en-us/dotnet/api/system.windows.input.mouse.mousewheeldeltaforoneline?view=windowsdesktop-10.0 — confirms `const int = 120`, rationale for field existence
- `System.Windows.Forms.ColorDialog` class (windowsdesktop-10.0): https://learn.microsoft.com/en-us/dotnet/api/system.windows.forms.colordialog?view=windowsdesktop-10.0 — confirms `Color` property returns `System.Drawing.Color`, `ShowDialog()` API, `System.Windows.Forms.dll` assembly
- `System.Drawing.Color` struct (net-10.0): https://learn.microsoft.com/en-us/dotnet/api/system.drawing.color?view=net-10.0 — confirms A/R/G/B byte properties, `System.Drawing.Primitives.dll` assembly
- MSBuild properties for .NET Desktop SDK: https://learn.microsoft.com/en-us/dotnet/core/project-sdk/msbuild-props-desktop — confirms `UseWindowsForms=true` + `UseWPF=true` can coexist in same project file

---
*Stack research for: FuzzyClock v2.0 — color themes and opacity control*
*Researched: 2026-02-27*
