# Phase 54: Additional LCD Themes - Research

**Researched:** 2026-03-11
**Domain:** WPF C# — enum extension, color palette design, swatch UI, JSON serialization
**Confidence:** HIGH

## Summary

Phase 54 is a self-contained expansion of the existing LCD theme system. The codebase is fully understood: `LcdTheme.cs` holds the enum and `LcdPalette.Get()` switch; `SettingsWindow.xaml` has a `ComboBox` for the 5 existing themes; `AppSettings.cs` serializes `LcdTheme` as a string via `JsonStringEnumConverter`. No architectural decisions are needed — all patterns are established and the phase is purely additive.

The two non-trivial tasks are: (1) designing color triples (lit/ghost/background) for 12 new themes with enough variety and authenticity that each feels distinct, and (2) replacing the theme `ComboBox` in `SettingsWindow` with a `WrapPanel` of colored swatches following the existing accent-color swatch pattern exactly.

**Primary recommendation:** Implement as a single wave — enum/palette, then XAML swatch row, then code-behind, then tests, then README. Each step is isolated and sequentially dependent.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- Add exactly 12 new `LcdTheme` enum values (names below); existing 5 are unchanged in position and value
- New enum names (PascalCase): `Vfd`, `Nixie`, `Magenta`, `Purple`, `Cyan`, `Lime`, `Cream`, `Ice`, `Mint`, `Lavender`, `LcdGrey`, `Paper`
- Replace `CmbLcdTheme` ComboBox in SettingsWindow with a `WrapPanel` of colored swatches
- Each swatch ~28x28px, filled with the theme's Lit color, with a selection ring matching the accent swatch pattern
- Tooltip on each swatch showing the theme name
- `LcdThemeChanged` event continues to fire on click — same event, new source
- Tray menu "LCD Theme" submenu is not present (confirmed by reading TrayMenuBuilder.cs) — no tray change needed
- AppSettings round-trip tests for at minimum `Vfd`, `LcdGrey`, `Paper`
- README LCD theme table updated to 17 themes
- `LcdClockView`, `SevenSegmentDigit`, `MainWindow`, `TrayMenuBuilder`, `AppSettings` structure untouched
- Ghost segments on inverted themes are a lighter shade of the dark segment color (same hue, less contrast against light bg) — consistent approach, not hidden

### Claude's Discretion

- Exact hex values for all 12 new themes (guidance given in CONTEXT.md; Claude picks what looks best on-screen)
- Ghost and background colors for each new dark theme (follow same relative-darkness ratio as existing themes)
- Swatch tooltip wording
- Whether to add a thin dark border on inverted swatches so they're visible against the SettingsWindow light background

### Deferred Ideas (OUT OF SCOPE)

- Nixie-style digit geometry rendering
- Custom theme color picker (user-defined lit/ghost/bg)
</user_constraints>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `System.Windows.Media.Color` | .NET 10 built-in | Color value type for palette | Already in use throughout LcdPalette.Get() |
| `System.Text.Json` + `JsonStringEnumConverter` | .NET 10 built-in | Enum serialization as string | Already on LcdTheme property in AppSettings |
| WPF `WrapPanel` | .NET 10 built-in | Swatch row that wraps to multiple lines | Already used in Stats tab (ChkCpuVisible etc.) |
| WPF `Border` nesting (ring + swatch) | .NET 10 built-in | Selection ring visual | Already used verbatim for accent color swatches |

### No New Dependencies
This phase adds zero NuGet packages. Every tool needed is already present in the project.

**Build command:**
```bash
dotnet build
dotnet test
```

---

## Architecture Patterns

### Existing Pattern: Accent Swatch (to be replicated exactly)

XAML structure for each swatch (from SettingsWindow.xaml lines 161–176):
```xml
<Border x:Name="RingX" BorderThickness="0" CornerRadius="6" Padding="2" Margin="0,0,4,0">
    <Border x:Name="SwatchX" Width="28" Height="28" Background="#FFRRGGBB"
            CornerRadius="4" Cursor="Hand"
            MouseLeftButtonDown="SwatchX_MouseLeftButtonDown">
        <Border.Style>
            <Style TargetType="Border">
                <Style.Triggers>
                    <Trigger Property="IsMouseOver" Value="True">
                        <Setter Property="Opacity" Value="0.75"/>
                    </Trigger>
                </Style.Triggers>
            </Style>
        </Border.Style>
    </Border>
</Border>
```

Selection ring activation (from SettingsWindow.xaml.cs `SetActiveSwatch()`):
```csharp
// Set ring to active:
activeRing.BorderThickness = new Thickness(2);
activeRing.BorderBrush     = new SolidColorBrush(Color.FromRgb(0x00, 0x78, 0xD4));
// Clear all other rings:
foreach (var r in rings) { r.BorderThickness = new Thickness(0); r.BorderBrush = null; }
```

### Pattern: LcdPalette.Get() Extension

Current structure (LcdTheme.cs):
```csharp
public enum LcdTheme { Green, Amber, Blue, Teal, Red }

public static (Color Lit, Color Ghost, Color Background) Get(LcdTheme theme) => theme switch
{
    LcdTheme.Green => (Color(0x00,0xFF,0x41), Color(0x00,0x33,0x10), Color(0x00,0x1A,0x00)),
    // ...
    _ => throw new ArgumentOutOfRangeException(nameof(theme))
};
```

Extension approach: append new enum values after `Red`, add corresponding switch arms before the `_ =>` throw.

### Pattern: SettingsWindow LCD Row Visibility

`SetLcdRowsVisible()` references named elements by x:Name. After the ComboBox is replaced:
- `CmbLcdTheme` x:Name is removed from XAML (it no longer exists)
- A new `WrapPanel x:Name="LcdThemeSwatchPanel"` is added in its place
- `SetLcdRowsVisible()` replaces `CmbLcdTheme.Visibility = vis` with `LcdThemeSwatchPanel.Visibility = vis`

### Pattern: PopulateControls() LCD Theme Activation

Current (SettingsWindow.xaml.cs line 81):
```csharp
CmbLcdTheme.SelectedIndex = (int)s.LcdTheme;
```

Replacement: call a new `SetActiveLcdSwatch(s.LcdTheme)` helper analogous to `SetActiveSwatch(Border?)`.

### Pattern: Click Handler Registration

With 17 swatches, individual named event handlers per swatch (like accent swatches) is verbose. The XAML `Tag` attribute can carry the theme name, allowing a single shared handler:

```csharp
private void LcdSwatch_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
{
    if (_suppressEvents) return;
    var swatch = (Border)sender;
    if (Enum.TryParse<LcdTheme>((string)swatch.Tag, out var theme))
    {
        SetActiveLcdSwatch(theme);
        LcdThemeChanged?.Invoke(theme);
    }
}
```

This is cleaner than 17 individual handlers. The `Tag` on the inner `Border` (the swatch itself, not the ring) carries the enum name string. The ring Borders get names `RingLcd{ThemeName}` for programmatic access.

### Anti-Patterns to Avoid

- **Don't use `(int)LcdTheme` for SelectedIndex**: The ComboBox is being removed; index-based selection is obsolete.
- **Don't use Opacity property for ghost segments on inverted themes**: Ghost color is already a separate hex value in `LcdPalette`; the opacity approach is explicitly rejected per prior phase decisions.
- **Don't add a WrapPanel without updating SetLcdRowsVisible()**: The existing method references `CmbLcdTheme` by name — a direct compile error if not updated.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Enum-to-string JSON serialization | Custom JsonConverter | `JsonStringEnumConverter` already on `LcdTheme` | New enum values serialize automatically by name — zero migration code needed |
| Tooltip on swatch | Custom popup | WPF `ToolTip` property on the swatch `Border` | One attribute in XAML, accessible to screen readers |
| Color math for ghost/bg | Algorithm | Hand-pick hex values per CONTEXT.md | 12 themes is tractable; perceptual quality is better than algorithmic consistency |

---

## Common Pitfalls

### Pitfall 1: Inverted Swatch Invisible Against Settings Window Background
**What goes wrong:** `LcdGrey` (lit = `#2A3020`) and `Paper` (lit = `#1A1A18`) are dark colors. The SettingsWindow background is light grey (`#F0F0F5` area). Dark swatches will look fine; but the swatch itself is small and the dark color provides clear contrast against the light window — this is actually fine.

However, for `Cream` (lit = `#FFEEDD`) and `Ice` (lit = `#B0D8FF`), which are very light colors, a thin `BorderBrush="#FFB0B0B0" BorderThickness="1"` on the inner swatch border should be added, matching how the White accent swatch (`SwatchWhite`) has `BorderBrush="#FFAAAAAA" BorderThickness="1"` to remain visible. Claude's discretion applies here.

**Prevention:** Check each very-light lit color (Cream, Ice, Paper background is near-white) and add a thin `BorderBrush` on the inner swatch Border for legibility.

### Pitfall 2: SetLcdRowsVisible() Missing New Container Name
**What goes wrong:** After replacing `CmbLcdTheme` with `LcdThemeSwatchPanel`, the old code `CmbLcdTheme.Visibility = vis` will cause a compile error — `CmbLcdTheme` no longer exists.

**Prevention:** Update `SetLcdRowsVisible()` in the same task as the XAML change.

### Pitfall 3: PopulateControls() Not Updated
**What goes wrong:** `CmbLcdTheme.SelectedIndex = (int)s.LcdTheme` will cause a compile error. Additionally, the ring selection will not be restored when SettingsWindow opens.

**Prevention:** Replace with `SetActiveLcdSwatch(s.LcdTheme)` in the same task.

### Pitfall 4: Enum Integer Values and JSON
**What goes wrong:** Existing persisted settings files that have `"LcdTheme": "Green"` (string) will deserialize fine with `JsonStringEnumConverter`. Settings files with legacy integer values (`"LcdTheme": 0`) would fail — but this project already established string serialization in Phase 52, so there are no integer-format files in the wild.

**Prevention:** None needed; `JsonStringEnumConverter` handles all 17 names automatically. No migration code required.

### Pitfall 5: WrapPanel Width Overflow in Settings Window
**What goes wrong:** 17 swatches at 28px + 4px margin each = ~544px minimum, but SettingsWindow width is 480px. The WrapPanel wraps at parent width. In the Grid's column 1 (Width=`*`) the available width is ~480 - 90 (label col) - margins ≈ 370px. At 32px per swatch (28px + 4px margin) that's ~11 swatches per row, meaning 2 rows for 17 swatches. WrapPanel handles this automatically — no fixed column count needed.

**Prevention:** Do not set a fixed `Width` on the WrapPanel; let it inherit from the Grid column. Set `Margin="0,8,0,0"` to match other rows.

---

## Color Values (Claude's Discretion — Research-Derived)

Recommendations based on reference display aesthetics and the ratio pattern of existing 5 themes. Existing ratio: Ghost ≈ 20% of Lit brightness; Background ≈ 10% of Lit brightness (rough perceptual estimate from existing values).

### Dark themes (segments glow on near-black background)

| Theme | Lit | Ghost | Background | Notes |
|-------|-----|-------|------------|-------|
| `Vfd` | `#14F0A0` | `#023A28` | `#001A10` | Blue-green phosphor; distinct from Teal's cyan-neutral |
| `Nixie` | `#FF6000` | `#3D1800` | `#1A0800` | Warm deep orange; richer/more saturated than Amber |
| `Magenta` | `#FF00CC` | `#3D0030` | `#1A0015` | Hot pink-magenta |
| `Purple` | `#CC00FF` | `#300040` | `#15001A` | Electric violet |
| `Cyan` | `#00FFFF` | `#003838` | `#001A1A` | Distinct from Blue (#00CFFF) and Teal (#00B4B4) |
| `Lime` | `#CCFF00` | `#2E3800` | `#141A00` | Yellow-green chartreuse |
| `Cream` | `#FFEEDD` | `#3D3020` | `#1A1208` | Warm off-white; ghost is warm dark brown |
| `Ice` | `#B0D8FF` | `#1A2D3D` | `#0A1520` | Pale cold silver-blue |
| `Mint` | `#66FFCC` | `#003D28` | `#001A12` | Desaturated soft green |
| `Lavender` | `#CC99FF` | `#280040` | `#120018` | Pale purple-grey |

### Inverted themes (dark segments on light background)

| Theme | Lit (segment) | Ghost | Background |
|-------|---------------|-------|------------|
| `LcdGrey` | `#2A3020` | `#8A9080` | `#C8D0C0` |
| `Paper` | `#1A1A18` | `#9090A0` | `#F0F0E8` |

Ghost for inverted: same hue as dark segment, but significantly lighter (less contrast against the light background) — exactly as specified in CONTEXT.md.

---

## Code Examples

### LcdTheme enum extension (LcdTheme.cs)
```csharp
// Source: existing LcdTheme.cs pattern
public enum LcdTheme { Green, Amber, Blue, Teal, Red,
    Vfd, Nixie, Magenta, Purple, Cyan, Lime,
    Cream, Ice, Mint, Lavender, LcdGrey, Paper }
```

### LcdPalette.Get() new cases (LcdTheme.cs)
```csharp
LcdTheme.Vfd      => (Color(0x14,0xF0,0xA0), Color(0x02,0x3A,0x28), Color(0x00,0x1A,0x10)),
LcdTheme.LcdGrey  => (Color(0x2A,0x30,0x20), Color(0x8A,0x90,0x80), Color(0xC8,0xD0,0xC0)),
LcdTheme.Paper    => (Color(0x1A,0x1A,0x18), Color(0x90,0x90,0xA0), Color(0xF0,0xF0,0xE8)),
// ... (all 12)
```

### SetActiveLcdSwatch() helper (SettingsWindow.xaml.cs)
```csharp
private void SetActiveLcdSwatch(LcdTheme theme)
{
    // _lcdSwatchRings: array of (LcdTheme, Border) tuples populated once, or dictionary
    foreach (var (_, ring) in _lcdSwatchRings)
    {
        ring.BorderThickness = new Thickness(0);
        ring.BorderBrush     = null;
    }
    var activeRing = _lcdSwatchRings.FirstOrDefault(t => t.theme == theme).ring;
    if (activeRing is not null)
    {
        activeRing.BorderThickness = new Thickness(2);
        activeRing.BorderBrush     = new SolidColorBrush(Color.FromRgb(0x00, 0x78, 0xD4));
    }
}
```

Alternatively, maintain a `Dictionary<LcdTheme, Border>` built in code-behind at construction time, mapping each enum value to its ring Border — simpler iteration.

### WrapPanel XAML structure (SettingsWindow.xaml row 4)
```xml
<!-- LCD Theme — row 4 -->
<TextBlock x:Name="LcdThemeRowLabel" Grid.Row="4" Grid.Column="0"
           Text="LCD Theme" VerticalAlignment="Top"
           HorizontalAlignment="Right" Margin="0,12,10,0"
           Visibility="Collapsed"/>
<WrapPanel x:Name="LcdThemeSwatchPanel" Grid.Row="4" Grid.Column="1"
           Margin="0,8,0,0" Visibility="Collapsed">
    <!-- 17 swatches, one per theme -->
    <Border x:Name="RingLcdGreen" BorderThickness="0" CornerRadius="6" Padding="2" Margin="0,0,4,4">
        <Border x:Name="SwatchLcdGreen" Width="28" Height="28" Background="#FF00FF41"
                CornerRadius="4" Cursor="Hand" Tag="Green"
                ToolTip="Green"
                MouseLeftButtonDown="LcdSwatch_MouseLeftButtonDown">
            <!-- hover style -->
        </Border>
    </Border>
    <!-- ... repeat for all 17 themes -->
</WrapPanel>
```

### AppSettings round-trip test pattern (AppSettingsTests.cs)
```csharp
[TestMethod]
public void RoundTrip_LcdTheme_Vfd()
{
    var original = new AppSettings { LcdTheme = LcdTheme.Vfd };
    string json  = JsonSerializer.Serialize(original);
    var result   = JsonSerializer.Deserialize<AppSettings>(json)!;
    Assert.AreEqual(LcdTheme.Vfd, result.LcdTheme);
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ComboBox for LCD theme | WrapPanel swatch row | Phase 54 (this phase) | Consistent with accent color UX; scales to 17 themes visually |
| 5 LCD themes | 17 LCD themes | Phase 54 | Broader palette coverage |

**Not deprecated — just extended:**
- `LcdTheme` enum: existing 5 values are unchanged; integer positions 0–4 are preserved (though not used for serialization)
- `JsonStringEnumConverter`: continues to handle all themes automatically by name

---

## Open Questions

1. **VerticalAlignment on LcdThemeRowLabel**
   - What we know: Other row labels use `VerticalAlignment="Center"`. With a two-row WrapPanel the label may look misaligned.
   - What's unclear: Whether to use `VerticalAlignment="Top"` (aligned with first swatch row) or `Center` (centered across both rows).
   - Recommendation: Use `VerticalAlignment="Top"` with `Margin="0,12,10,0"` to align with the first row of swatches — more legible than centering across two rows.

2. **Thin border on very-light swatches**
   - What we know: `SwatchWhite` has `BorderBrush="#FFAAAAAA" BorderThickness="1"`. Cream and Ice lit colors are also light.
   - Recommendation: Add the same thin border on `SwatchLcdCream`, `SwatchLcdIce`, and `SwatchLcdPaper` (near-white background color as lit).

---

## Validation Architecture

> `nyquist_validation` is explicitly `false` in `.planning/config.json` — this section is skipped.

---

## Sources

### Primary (HIGH confidence)
- Direct source inspection: `FuzzyClock.App/LcdTheme.cs` — full enum and palette structure
- Direct source inspection: `FuzzyClock.App/SettingsWindow.xaml` — ComboBox and accent swatch XAML patterns
- Direct source inspection: `FuzzyClock.App/SettingsWindow.xaml.cs` — `SetActiveSwatch()`, `SetLcdRowsVisible()`, event patterns
- Direct source inspection: `FuzzyClock.App/AppSettings.cs` — `JsonStringEnumConverter` on `LcdTheme`
- Direct source inspection: `FuzzyClock.App.Tests/AppSettingsTests.cs` — existing round-trip test pattern
- `dotnet test` output: current baseline = 212 Core + 33 App = **245 total passing tests**

### Secondary (MEDIUM confidence)
- `.planning/phases/54-additional-lcd-themes/54-CONTEXT.md` — user decisions, color guidance, architectural constraints

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all technologies already in use in the project
- Architecture patterns: HIGH — directly observed from existing source; no guesswork
- Color values: MEDIUM — guidance from CONTEXT.md, specific hex values are Claude's discretion
- Pitfalls: HIGH — derived from reading actual source code call sites

**Research date:** 2026-03-11
**Valid until:** 2026-04-11 (stable codebase; no external dependencies changing)
