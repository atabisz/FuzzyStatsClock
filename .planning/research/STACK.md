# Stack Research

**Domain:** C# WPF desktop widget — v3.4 Nixie tube rendering, phrase personality styles, dial shape/size
**Researched:** 2026-03-11
**Scope:** Additions only — existing validated stack (net10.0-windows, WPF, MSTest 4.x, System.Text.Json, System.Diagnostics.PerformanceCounter 10.0.0) is unchanged
**Confidence:** HIGH (all techniques verified against existing codebase; WPF APIs are stable .NET 10 BCL)

---

## No New NuGet Packages Required

All three feature areas are achievable with the existing project stack. Adding a WPF effects library (WPF-UI, HandyControl, MaterialDesignInXamlToolkit) for Nixie glow would pull 200-400 KB of dependencies for effects that WPF's built-in `System.Windows.Media.Effects` already provides.

| Feature Area | Stack Change | NuGet Needed |
|-------------|-------------|--------------|
| Nixie tube rendering | New `NixieClockView` + `NixieDigit` UserControls; WPF built-in brush/effect types | None |
| Phrase personalities | 7 new `IPhraseProvider` classes in `FuzzyClock.Core` | None |
| Dial shape/size | AppSettings field addition; code-behind rx/ry math change | None |

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `System.Windows.Media.Effects.DropShadowEffect` | .NET 10 BCL | Nixie warm orange outer glow/bloom | Built-in hardware-accelerated (D3D); `ShadowDepth=0` produces symmetric halo; `Color` set to Nixie orange; already used on `PhraseText` in MainWindow.xaml — pattern validated in this codebase |
| `System.Windows.Media.RadialGradientBrush` | .NET 10 BCL | Nixie active digit inner fill — bright center fading to dim amber | Mandated by REQUIREMENTS.md constraint ("Nixie glow via WPF RadialGradientBrush effects"); already referenced throughout the LCD palette system |
| `System.Windows.Media.LinearGradientBrush` | .NET 10 BCL | Glass tube specular highlight strip | Narrow white-to-transparent gradient on the left edge of the tube Border conveys glass refraction; no image asset needed |
| `System.Windows.Media.DrawingBrush` | .NET 10 BCL | Wire mesh / anode grid texture overlay | Tile-brush with a `GeometryDrawing` containing a grid of thin `LineGeometry` elements; `TileMode=Tile`, `ViewportUnits=Absolute`, small Viewport (e.g. 8x8 DIP) produces repeating mesh without image assets |
| `System.Windows.Controls.Canvas` | .NET 10 BCL | Nixie digit slot — stacked ghost cathode layers at same position | Z-order via child order (last child paints last); matches existing `SevenSegmentDigit` Canvas approach exactly |
| `System.Windows.Shapes.Ellipse` | .NET 10 BCL | Optional: diffuse glow halo behind active digit | BlurEffect applied to a colored Ellipse behind the digit; used if DropShadowEffect alone is insufficient |
| `IPhraseProvider` (FuzzyClock.Core) | internal | New personality phrase styles | Established registry pattern; zero new infrastructure; each style = one class with a bucket table |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `System.Windows.Media.Effects.BlurEffect` | .NET 10 BCL | Soft diffuse halo layer behind Nixie digit | Add a second element (Ellipse or Rectangle) behind the digit slot with `BlurEffect` applied; only if `DropShadowEffect` alone looks insufficient at the chosen opacity levels |
| `System.Windows.Media.GradientStop` | .NET 10 BCL | Color stops for RadialGradientBrush on Nixie digit | Inner GradientStop: bright orange-white (#FFFFD0 at offset 0.0); outer stops fade to dim amber (#FF6600 at 0.6) then near-transparent at 1.0 |
| `System.Windows.Threading.DispatcherTimer` | .NET 10 BCL | 1-second tick for NixieClockView time updates | Same pattern as `LcdClockView` — already used; `IsVisibleChanged` start/stop pattern carries forward unchanged |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| MSTest 4.x (already in project) | Unit tests for new phrase providers | All 7 new `IPhraseProvider` classes are pure C# in `FuzzyClock.Core`; test pattern follows established `PhraseStyleProviderTests.cs` — ≥ 2 sample assertions per provider per PHRASE-09 |
| WPF Designer (Visual Studio) | XAML preview for NixieClockView layout | Use for sanity-checking Canvas z-order and brush assignments; runtime rendering is authoritative |

---

## Feature-by-Feature Technique Guide

### 1. Nixie Tube Glow / Bloom (NIXIE-02)

**Technique:** `DropShadowEffect` on the active digit element with `ShadowDepth=0`.

```xml
<TextBlock Text="3">
    <TextBlock.Effect>
        <DropShadowEffect Color="#FF8C00" BlurRadius="18" ShadowDepth="0" Opacity="0.85" />
    </TextBlock.Effect>
</TextBlock>
```

`ShadowDepth=0` centres the effect under the element, creating a symmetric glow corona. `BlurRadius` 14-22 produces bloom-like spread. `Color` tuned to warm amber-orange. This is identical in mechanism to the existing `DropShadowEffect` on `PhraseText` (MainWindow.xaml line 50), validating the pattern is already working in this codebase.

**Why not `BlurEffect` alone:** `BlurEffect` blurs the element itself; `DropShadowEffect` with `ShadowDepth=0` leaves the digit sharp while adding a coloured halo. Nixie digits should be crisp with a glowing corona.

**Why not a third-party glow library:** Hardware-accelerated `DropShadowEffect` has been in WPF since .NET Framework 3.0; zero dependency cost; identical visual result to third-party glow implementations which internally compose the same D3D effect.

### 2. Stacked Ghost Cathode Digits (NIXIE-03)

**Technique:** Canvas with 10 ghost digit elements (digits 0-9) drawn at the same Canvas.Left/Top position, with the active digit element added last (paints on top).

```
Canvas (digit slot, e.g. 50x80 DIP)
  ├── TextBlock "0" Foreground=GhostAmber Opacity=0.12  ← Canvas.Left=0, Top=0
  ├── TextBlock "1" Foreground=GhostAmber Opacity=0.12
  ├── ... (2-8)
  ├── TextBlock "9" Foreground=GhostAmber Opacity=0.12
  └── TextBlock "3" Foreground=BrightOrange + DropShadowEffect  ← active digit, painted last
```

All elements share the same Canvas.Left and Canvas.Top. WPF Canvas paints children in declaration order — the active element is declared last, so it paints over the ghosts. `Panel.ZIndex` is not needed.

**Font choice for digit shapes:** `Courier New` or `Consolas` — both installed on all Windows systems, condensed aspect ratio approximates Nixie tube cathode proportions. Regular proportional fonts (Segoe UI) are too wide. The ghost stacking effect is the visually distinctive element; exact wire-cathode glyph shape is deferred to v5+ per requirements.

**Ghost opacity calibration:** Opacity 0.10-0.15 on ghost digits is the sweet spot — visible but clearly subordinate to the active digit. This matches the 15% ghost formula used in `SevenSegmentDigit` (`LitColor.R * 15 / 100`).

### 3. Glass Tube Border (NIXIE-04)

**Technique:** WPF `Border` element as the outer container per digit slot, with a `LinearGradientBrush` specular strip overlaid inside it.

```xml
<Border CornerRadius="8,8,20,20"
        BorderBrush="#40AADDFF" BorderThickness="1.5"
        Background="#18C0E8FF">
    <!-- digit slot Canvas here -->

    <!-- specular highlight: narrow left-edge strip, absolute-positioned inside Border -->
    <Rectangle Width="6" HorizontalAlignment="Left" VerticalAlignment="Stretch"
               Opacity="0.35" IsHitTestVisible="False">
        <Rectangle.Fill>
            <LinearGradientBrush StartPoint="0,0" EndPoint="1,0">
                <GradientStop Color="White" Offset="0"/>
                <GradientStop Color="Transparent" Offset="1"/>
            </LinearGradientBrush>
        </Rectangle.Fill>
    </Rectangle>
</Border>
```

`Background="#18C0E8FF"` is ~9% opacity blue-tinted white for the faint glass tint. `BorderBrush="#40AADDFF"` at 25% opacity adds a subtle edge line. `CornerRadius="8,8,20,20"` (TL,TR,BR,BL) makes the bottom ends more rounded, approximating a tube bottom. The narrow gradient Rectangle simulates the glass specular reflection line. No image assets.

**Grid wrapper required:** `Border` accepts one child; to overlay the specular strip on top of the Canvas, use a `Grid` as the Border's child with the Canvas and the Rectangle both as Grid children (Rectangle last = paints on top).

### 4. Wire Mesh / Anode Grid Overlay (NIXIE-05)

**Technique:** `DrawingBrush` with `TileMode=Tile` on a low-opacity Rectangle placed over the digit slot.

```xml
<Rectangle Opacity="0.18" IsHitTestVisible="False">
    <Rectangle.Fill>
        <DrawingBrush TileMode="Tile"
                      Viewport="0,0,8,8"
                      ViewportUnits="Absolute">
            <DrawingBrush.Drawing>
                <DrawingGroup>
                    <GeometryDrawing>
                        <GeometryDrawing.Pen>
                            <Pen Brush="#FFCC88" Thickness="0.4"/>
                        </GeometryDrawing.Pen>
                        <GeometryDrawing.Geometry>
                            <GeometryGroup>
                                <LineGeometry StartPoint="0,4" EndPoint="8,4"/>
                                <LineGeometry StartPoint="4,0" EndPoint="4,8"/>
                            </GeometryGroup>
                        </GeometryDrawing.Geometry>
                    </GeometryDrawing>
                </DrawingGroup>
            </DrawingBrush.Drawing>
        </DrawingBrush>
    </Rectangle.Fill>
</Rectangle>
```

`Viewport="0,0,8,8"` with `ViewportUnits=Absolute` tiles an 8x8 DIP cell. One horizontal + one vertical `LineGeometry` per cell produces a repeating grid. `Opacity=0.18` on the Rectangle keeps it subtle. Amber line color (`#FFCC88`) blends with the Nixie orange palette. `DrawingBrush` is hardware-composited by WPF.

**Mesh density tuning:** `Viewport="0,0,6,6"` for denser mesh; `"0,0,12,12"` for coarser. Keep `ViewportUnits=Absolute` so density is independent of digit slot size.

### 5. NixieClockView UserControl Structure

`NixieClockView` mirrors `LcdClockView` in architecture: a UserControl with a StackPanel of `NixieDigit` sub-controls, a `DispatcherTimer` for 1-second updates, and `IsVisibleChanged` timer start/stop — the same pattern `LcdClockView` uses.

`NixieDigit` is a UserControl managing a single digit slot: a `Grid` containing the `Border` (glass tube), the `Canvas` (stacked ghost + active digit elements), and the mesh overlay `Rectangle`.

**File placement:**
- `FuzzyClock.App/Controls/NixieClockView.xaml` + `.xaml.cs`
- `FuzzyClock.App/Controls/NixieDigit.xaml` + `.xaml.cs`

This is consistent with `LcdClockView.xaml` + `SevenSegmentDigit.xaml` placement.

**ClockType.Nixie:** Add `Nixie` as 4th value in `FuzzyClock.App/ClockType.cs`. The `[JsonConverter(typeof(JsonStringEnumConverter))]` attribute already applied to `AppSettings.ClockType` handles serialization automatically. Old settings.json files that lack a `ClockType` field deserialize to `Phrase` (the default) — no migration code needed. Files with `"ClockType": "Nixie"` deserialize correctly once the enum value exists.

### 6. New IPhraseProvider Implementations (PHRASE-01 through PHRASE-07)

**Technique:** One new class per style in `FuzzyClock.Core/`, implementing `IPhraseProvider` with a bucket table using the same `(int UpperBound, string Template)[]` pattern established in `RudePhraseProvider`.

```csharp
public class PiratePhraseProvider : IPhraseProvider
{
    private static readonly string[] HourWords =
        ["", "one", "two", "three", ...];

    private static readonly (int UpperBound, string Template)[] Buckets =
    [
        ( 2, "'tis {h} bells, yarr"),
        ( 7, "just past {h} bells"),
        (12, "ten past {h}, ye scallywag"),
        // ... 12 buckets covering 0-59 minutes
    ];

    public string GetPhrase(DateTime dt) { /* walk Buckets */ }
    public (string Qualifier, string Emphasis) GetStructuredPhrase(DateTime dt) => ("", GetPhrase(dt));
}
```

**PhraseEngine registration:** Add 7 new keys to the `_providers` dictionary in `PhraseEngine.cs`:

```csharp
["en-pirate"]       = new PiratePhraseProvider(),
["en-dwarf"]        = new DwarfPhraseProvider(),
["en-jive"]         = new JivePhraseProvider(),
["en-valleygirl"]   = new ValleyGirlPhraseProvider(),
["en-yoda"]         = new YodaPhraseProvider(),
["en-shakespearean"]= new ShakespeareanPhraseProvider(),
["en-rude"]         = new RudePhraseProvider(),   // replaces existing entry with enhanced Rude
```

Note: the existing `"en-rude"` key is updated in-place with the enhanced `RudePhraseProvider` — no key rename needed.

**AppSettings.PhraseStyle:** The field already exists as `public string PhraseStyle { get; init; } = "Classic"`. Add the 7 new style names as valid values in `SettingsService.Validate()`:

```csharp
string[] validStyles = { "Classic", "Terse", "Poetic", "Rude",
                         "Pirate", "Dwarf", "Jive", "ValleyGirl", "Yoda", "Shakespearean" };
```

**Settings window ComboBox:** Add the 7 new items to the `CmbPhraseStyle` ComboBox in `SettingsWindow.xaml`. The existing selection-changed handler maps display names to provider keys — extend the mapping table.

**Why no new infrastructure:** The `IPhraseProvider` registry already supports arbitrary keys. Adding providers is purely additive: new classes + new dictionary entries + new ComboBox items. Zero interface changes, zero breaking changes to existing 248 tests.

### 7. Dial Shape: Round to Oval (DIAL-01, DIAL-02)

**Technique:** Change `DialCanvas` from a fixed-square `Canvas` to a Canvas with independent Width and Height, driven by an `AppSettings.DialShape` value. The existing `DialGeometry.cs` angle math is unchanged — only the endpoint calculation in code-behind gains separate rx/ry radii.

**Oval hand endpoint math:**

```csharp
// Current (round): symmetric radius
double r  = canvas.Width / 2 * handFraction;
double cx = canvas.Width  / 2, cy = canvas.Height / 2;
double x2 = cx + r  * Math.Sin(angleRad);
double y2 = cy - r  * Math.Cos(angleRad);

// Oval: independent x-radius and y-radius
double rx = canvas.Width  / 2 * handFraction;
double ry = canvas.Height / 2 * handFraction;
double cx = canvas.Width  / 2, cy = canvas.Height / 2;
double x2 = cx + rx * Math.Sin(angleRad);
double y2 = cy - ry * Math.Cos(angleRad);
```

Using separate `rx`/`ry` makes hands correctly reach the oval perimeter at all angles. This is a ~3-line change to the existing hand-update method. `DialGeometry.GetHourAngleDegrees` and `GetMinuteAngleDegrees` are unchanged.

**Canvas dimensions:**
- Round: `Width = H, Height = H` (existing behavior)
- Oval: `Width = H * 1.5, Height = H` (e.g. 120x80 for Medium font size)

**AppSettings field:**

```csharp
public string DialShape { get; init; } = "Round";  // "Round" | "Oval"
```

String (not enum) is consistent with `TextStyle`, `DateFormat`, `LcdStyle` — all string fields in this codebase. Add `"Round"` and `"Oval"` to the `Validate()` guard.

**Dial size (DIAL-02):** The `DialCanvas` Width/Height are already driven by `_currentFontSize` in code-behind. The scaling relation (Small/Medium/Large → pixel sizes) applies to both Width and Height dimensions — no new settings field needed. Oval just applies a fixed 1.5x width multiplier to the same size tiers.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `DropShadowEffect` with `ShadowDepth=0` for Nixie glow | Third-party WPF glow shader (WPF-UI `GlowElement`) | Only if animated glow pulsing or glow that exceeds element layout bounds is needed — not in v3.4 scope |
| `DrawingBrush` tile for wire mesh | PNG/SVG image asset overlay | If the mesh needs photorealistic appearance or diagonal diagonal angles; DrawingBrush grid is sufficient for the faint anode grid effect and avoids image assets |
| `TextBlock` with `Courier New` for Nixie digit glyphs | `Path`/`PathGeometry` vector numeral glyphs | If v5+ requires exact wire-cathode visual; PathGeometry is significantly more authoring effort for 10 digits per slot — deferred |
| Separate `rx`/`ry` in code-behind for oval hands | `ScaleTransform` on the Canvas | ScaleTransform would also scale stroke thickness and any tick marks, causing visual distortion; explicit rx/ry math is cleaner |
| String field `DialShape` in AppSettings | New `DialShape` enum | Enum requires `[JsonConverter(typeof(JsonStringEnumConverter))]` and migration if values are renamed; string is consistent with the other non-ClockType settings fields in this codebase |
| Per-digit `NixieDigit` UserControl | Single flat Canvas in `NixieClockView` | Flat Canvas is simpler for 4 digits but makes per-digit state (ghost set, active character, glow) harder to encapsulate and test; `NixieDigit` mirrors `SevenSegmentDigit` encapsulation precedent |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `System.Windows.Media.Effects.BitmapEffect` | Removed in .NET 3.5+; compile error on net10.0 | `DropShadowEffect` or `BlurEffect` from `System.Windows.Media.Effects` |
| Custom HLSL pixel shader (`PixelShaderEffect`) | Requires HLSL compilation, DX feature level negotiation, significant added complexity | `DropShadowEffect` achieves equivalent glow with zero authoring overhead |
| `WriteableBitmap` for Nixie pixel rendering | Pixel-level rendering is inappropriate for a WPF vector UI; loses scaling, hit testing, and WPF compositing | Canvas + Brush composition as described above |
| Image assets (PNG/SVG) for wire mesh or glass texture | Explicitly forbidden by REQUIREMENTS.md constraint: "no image assets" | `DrawingBrush` tile for mesh; `LinearGradientBrush` for glass highlight |
| Any new NuGet package for visual effects | Zero packages needed; all required effects are in the .NET 10 BCL WPF assemblies | `System.Windows.Media.Effects` namespace |
| `OpacityMask` for Nixie ghost digit fade | Adds masking layer complexity without benefit over direct `Opacity` | Set `Opacity` property directly on each ghost TextBlock |
| `Panel.ZIndex` for Nixie digit layering | Unnecessary when active digit is the last Canvas child — WPF Canvas paints children in order | Declare ghost elements first, active element last in XAML/code |

---

## Stack Patterns by Variant

**If Nixie glow appears too faint at low widget opacity settings:**
- Add a blurred `Ellipse` behind the digit with `BlurEffect` applied for a diffuse glow cloud
- Keep the sharp digit TextBlock separate from the blur layer so numerals remain legible
- Stack order: blurred halo Ellipse first, ghost TextBlocks next, active TextBlock last

**If the DrawingBrush wire mesh tiles are too coarse or too fine:**
- Adjust `Viewport` dimensions: `"0,0,4,4"` = denser mesh, `"0,0,12,12"` = coarser
- Keep `ViewportUnits=Absolute` so mesh density stays constant regardless of digit slot size

**If oval dial hands look visually incorrect at 12/6 o'clock positions:**
- These positions are mathematically exact: `sin(0°) = 0`, so the x-radius term vanishes; `cos(0°) = 1`, so the y-radius term dominates. Hands point straight up/down regardless of oval ratio. No special-casing needed.

**If the Rude style update (PHRASE-01) conflicts with the existing `en-rude` key:**
- Replace the `RudePhraseProvider` class body in-place (stronger vocabulary) rather than adding a new key
- Existing tests for `"en-rude"` continue to pass with updated expected strings
- Update the test expected values to match the new ruder phrasing

---

## csproj Change Summary

**FuzzyClock.App.csproj:** No changes.
**FuzzyClock.Core.csproj:** No changes.
**FuzzyClock.Core.Tests.csproj:** No changes.
**FuzzyClock.App.Tests.csproj:** No changes.

All additions are pure C# and XAML files within the existing project structure.

---

## Version Compatibility

| Component | .NET Version | Notes |
|-----------|--------------|-------|
| `DropShadowEffect` | .NET Framework 3.0 / .NET Core 3.0+ | Stable; hardware-accelerated on D3D9+ |
| `DrawingBrush` with `TileMode` | .NET Framework 3.0 / .NET Core 3.0+ | `ViewportUnits=Absolute` supported since initial WPF release |
| `RadialGradientBrush` | .NET Framework 3.0 / .NET Core 3.0+ | Stable; confirmed used in existing LCD palette system |
| `JsonStringEnumConverter` on `ClockType.Nixie` | System.Text.Json (net10.0) | New enum value deserializes as default (`Phrase`) when absent from JSON — no migration code needed |
| `IPhraseProvider` with 7 new implementors | FuzzyClock.Core internal | Interface unchanged; all new providers are additive; zero breaking changes |

---

## Sources

- Codebase: `FuzzyClock.App/Controls/SevenSegmentDigit.xaml.cs` — confirmed Canvas + Polygon + SolidColorBrush layer pattern (HIGH — direct code read)
- Codebase: `FuzzyClock.App/MainWindow.xaml` lines 49-51 — confirmed `DropShadowEffect` already used in project, pattern validated (HIGH — direct code read)
- Codebase: `FuzzyClock.Core/RudePhraseProvider.cs`, `PhraseEngine.cs` — confirmed bucket table + `_providers` registry pattern (HIGH — direct code read)
- Codebase: `FuzzyClock.App/AppSettings.cs` — confirmed `PhraseStyle` string field exists; `JsonStringEnumConverter` attribute on `ClockType` confirmed (HIGH — direct code read)
- Codebase: `FuzzyClock.App/FuzzyClock.App.csproj` — confirmed `net10.0-windows`, `UseWPF=true`, no existing effects packages (HIGH — direct code read)
- REQUIREMENTS.md: "WPF-only rendering: Nixie glow via WPF RadialGradientBrush effects, no image assets" — mandates the approach used here (HIGH — requirements document)
- Microsoft Docs: `System.Windows.Media.Effects.DropShadowEffect` — `ShadowDepth=0` for symmetric glow is documented property behavior (HIGH confidence)
- Microsoft Docs: `System.Windows.Media.DrawingBrush.TileMode` / `ViewportUnits` — standard tile-brush usage (HIGH confidence)

---
*Stack research for: FuzzyClock v3.4 — Nixie tube rendering, phrase personalities, dial shape/size*
*Researched: 2026-03-11*
