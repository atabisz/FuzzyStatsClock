# Phase 56: Nixie Tube Clock - Research

**Researched:** 2026-03-11
**Domain:** WPF vector graphics, UserControl patterns, ClockType integration
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Add `ClockType.Nixie` as a fourth clock type — retro HH:MM display (no seconds, 12hr only)
- WPF vector primitives only — no image assets
- `UIElement.Effect` (BlurEffect, DropShadowEffect) is FORBIDDEN in the Nixie subtree — renders as black rectangles under `AllowsTransparency="True"`; all glow via stacked `RadialGradientBrush`
- Ghost cathode opacity: 8–12% range (user's preferred aesthetic: whisper-thin shadows)
- Proximity fade: digits ±1 and ±2 from the active digit appear slightly less faint (partially ionized)
- Colon separator: two glowing orange dots stacked vertically between hour and minute pairs
- Digit size scales with widget's Font Size setting via existing `FontSizeToLcdSize()` breakpoints (16→Small, 24→Medium, 32→Large)
- Settings panel: "Nixie" button in Clock Style row; when Nixie selected, hide Phrase Style row, Dial Options row, LCD Format row, LCD Seconds row, LCD Style row
- No placeholder Nixie options row in v3.4
- System tray Clock Type submenu item labeled "Nixie"
- `NixieClockView` + `NixieDigit` UserControls follow `LcdClockView` + `SevenSegmentDigit` structural pattern exactly

### Claude's Discretion
- Exact pixel proportions for digit and tube geometry
- Colon dot tube border vs floating (pick based on visual balance)
- Exact opacity values within the 8–12% faint range for ghost cathodes
- Proximity fade delta (how much brighter ±1 and ±2 digits are vs base)
- Wire mesh / anode grid texture implementation details

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope. Color theme variants (NIXIE-X) and blinking colon (NIXIE-X) are already captured in REQUIREMENTS.md as v5+ deferred items.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| NIXIE-01 | User can select Nixie as a fourth clock type (alongside Phrase, Dial, LCD) | ClockType enum extension + Settings/tray wiring documented below |
| NIXIE-02 | Nixie digits show warm orange glow/bloom effect around each active digit | RadialGradientBrush stacking pattern; orange palette values researched |
| NIXIE-03 | All 10 digit ghost cathodes are visible behind the active digit (stacked digit shadow) | Ghost rendering pattern: 10 TextBlock stacks at low opacity; proximity fade logic documented |
| NIXIE-04 | Each digit slot is enclosed in a glass tube border | Border/Path tube geometry pattern from SevenSegmentDigit |
| NIXIE-05 | A faint wire mesh / anode grid texture overlays each digit slot | Programmatic grid line drawing via Canvas + Line elements |
| NIXIE-06 | Nixie clock type is available in Settings window and tray Clock Type submenu | All 5 touch points in MainWindow + SettingsWindow + TrayMenuBuilder documented |
| NIXIE-07 | Nixie clock type persists across restarts via `AppSettings.ClockType` | AppSettings pattern is JSON-serialized enum; no migration needed; Validate() extension documented |
</phase_requirements>

---

## Summary

Phase 56 adds a Nixie tube clock as a fourth `ClockType`. The implementation is a pure WPF vector exercise — no image assets, no Effects. The codebase already has an exact structural template: `LcdClockView` + `SevenSegmentDigit`. The Nixie analog is `NixieClockView` + `NixieDigit`. The principal rendering challenge is faking a neon gas discharge display using `RadialGradientBrush` stacks (glow/bloom) and alpha-transparent shapes (ghost cathodes, glass tube borders, wire mesh) while obeying the `AllowsTransparency` Effects prohibition.

Integration is mechanical: five touch points in `MainWindow.xaml.cs` (two `ApplySettings` branches, timer `Tick`, `SetClockType` switch, `ApplyFontSize`), one in `MainWindow.xaml`, one in `SettingsWindow.xaml`, one in `SettingsWindow.xaml.cs`, and one in `TrayMenuBuilder.cs`. No migration code is needed for `AppSettings` because `ClockType` is already serialized as a string enum.

The visual review step is the primary risk: gradient stop offsets, ghost opacity values, and wire mesh tile density must look correct at runtime before the phase closes. Build the `NixieDigit` geometry first, wire it into `NixieClockView`, do integration wiring last to keep each plan independently verifiable.

**Primary recommendation:** Mirror the `LcdClockView`/`SevenSegmentDigit` pattern precisely; use Segoe UI or a monospaced font rendered as `TextBlock` elements for the 10 ghost cathode digits (stacked in a `Canvas`), with only the active digit at full warm-orange brightness.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| WPF (PresentationFramework) | .NET 10 | Vector shapes, Canvas layout, RadialGradientBrush | Already in use; project target |
| System.Windows.Media | .NET 10 | Color, Brush, PointCollection | Project-wide — same as SevenSegmentDigit |
| System.Windows.Threading | .NET 10 | DispatcherTimer | Same timer pattern as LcdClockView |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| MSTest 4.0.1 | 4.0.1 | Unit tests for digit encoding and size mapping | New `NixieDigitRenderer` or `NixieSize` helpers in Core project |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| RadialGradientBrush glow stacking | UIElement.Effect (DropShadowEffect) | FORBIDDEN — renders as black rectangles under AllowsTransparency="True" |
| TextBlock stack for ghost cathodes | Path/Polygon for each ghost digit | TextBlock is simpler and cheaper; Polygons are used for segment shapes in 7-seg but Nixie digit forms are more complex |
| Programmatic Canvas Line grid | WriteableBitmap texture | Canvas Lines are vector, scale cleanly, require no image assets |

**Installation:** No new packages needed.

---

## Architecture Patterns

### Recommended Project Structure
```
FuzzyClock.App/
├── Controls/
│   ├── NixieClockView.xaml          # Container: StackPanel of NixieDigit + NixieColon
│   ├── NixieClockView.xaml.cs       # DispatcherTimer, DependencyProperty Size, UpdateTime()
│   ├── NixieDigit.xaml              # <Canvas x:Name="RootCanvas" />
│   └── NixieDigit.xaml.cs           # RebuildGeometry() + UpdateDisplay(int activeDigit)
├── NixieSize.cs                     # enum NixieSize + NixieSizeMap.ToDigitHeight()
ClockType.cs                         # add Nixie = 3
```

### Pattern 1: NixieDigit mirrors SevenSegmentDigit exactly

**What:** `NixieDigit` is a `UserControl` with a single `Canvas x:Name="RootCanvas"`. Code-behind clears and rebuilds `RootCanvas.Children` in `RebuildGeometry()` (called when `DigitHeight` changes), then `UpdateDisplay()` sets brush opacities to reflect the active digit 0–9.

**When to use:** Always. This is the single digit slot; `NixieClockView` hosts four (H1, H2, Colon, M1, M2).

**Key DependencyProperties on NixieDigit:**
```csharp
// Source: mirrored from SevenSegmentDigit pattern
public static readonly DependencyProperty ActiveDigitProperty =
    DependencyProperty.Register(nameof(ActiveDigit), typeof(int), typeof(NixieDigit),
        new PropertyMetadata(-1, OnVisualPropertyChanged)); // -1 = blank/colon slot

public static readonly DependencyProperty DigitHeightProperty =
    DependencyProperty.Register(nameof(DigitHeight), typeof(double), typeof(NixieDigit),
        new PropertyMetadata(48.0, OnDigitHeightChanged));
```

**RebuildGeometry() responsibilities:**
1. Clear `RootCanvas.Children`
2. Add glass tube border (`Border`-like shape built from `Path`/`Rectangle` with semi-transparent fill + stroke)
3. Add wire mesh overlay (stack of thin horizontal `Line` elements at ~10% opacity)
4. Add 10 ghost cathode `TextBlock` elements (digits "0"–"9", stacked at `Canvas.Left`/`Canvas.Top` positions so each appears in its natural vertical position within the tube)
5. Set `RootCanvas.Width`/`Height` and `Width`/`Height` on `this`

**UpdateDisplay() responsibilities:**
1. Compute glow brush for the active digit (warm orange `RadialGradientBrush`)
2. Set each ghost `TextBlock.Foreground` to its opacity tier: active = full orange, ±1 = base+delta, ±2 = base+smaller-delta, rest = base ghost opacity
3. Apply glow `Path` (ellipse behind active digit) via `Opacity` property

### Pattern 2: NixieClockView mirrors LcdClockView exactly

**What:** Container `UserControl` that owns a `StackPanel` of `NixieDigit` instances and a `DispatcherTimer`. `IsVisibleChanged` starts/stops the timer. `UpdateTime()` calls `DateTime.Now`, formats as 12hr HH:MM (no seconds), assigns `ActiveDigit` to each slot.

```csharp
// Source: mirrored from LcdClockView pattern
public NixieClockView()
{
    InitializeComponent();
    _timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
    _timer.Tick += (_, _) => UpdateTime();
    IsVisibleChanged += OnIsVisibleChanged;
}

public void UpdateTime()
{
    var now = DateTime.Now;
    int h = now.Hour % 12;
    if (h == 0) h = 12;  // 12hr: 0 becomes 12
    int m = now.Minute;
    D0.ActiveDigit = h / 10;
    D1.ActiveDigit = h % 10;
    // Colon slot: special "on" state
    D2.ActiveDigit = m / 10;
    D3.ActiveDigit = m % 10;
}
```

**DependencyProperties on NixieClockView:**
- `Size` of type `LcdSize` (reuses existing enum) — callback calls `OnSizeChanged()` which maps to digit height via `NixieSizeMap.ToDigitHeight()`

### Pattern 3: NixieSize mapping

**What:** Reuse `LcdSize` enum (Small/Medium/Large) with a new static mapping class for Nixie-specific heights.

```csharp
// NixieSize.cs — new file in FuzzyClock.App
public static class NixieSizeMap
{
    public static double ToDigitHeight(LcdSize size) => size switch
    {
        LcdSize.Small  => 40.0,   // adjust as needed for visual balance
        LcdSize.Medium => 56.0,
        LcdSize.Large  => 72.0,
        _ => throw new ArgumentOutOfRangeException(nameof(size))
    };
}
```

These are starting values — the visual review step will determine final values.

### Pattern 4: Glass tube border geometry

**What:** A rounded rectangle drawn as a WPF `Rectangle` (or `Border`) with a semi-transparent dark fill and a 1–2px warm-toned stroke. Two `RadialGradientBrush` ellipses behind it for the glass highlight.

```xml
<!-- Inside RootCanvas — drawn first so digits appear in front -->
<Rectangle x:Name="TubeBorder"
           RadiusX="8" RadiusY="8"
           Fill="#CC1A0800"
           Stroke="#80FF8C00"
           StrokeThickness="1.5"/>
```

The glass reflection effect: a narrow translucent white `Rectangle` at the top of the tube (about 20% height), `Opacity="0.08"`, conveys glass curvature without Effects.

### Pattern 5: Wire mesh overlay

**What:** A series of thin horizontal `Line` elements and optionally vertical lines drawn at low opacity in `RootCanvas`. Spacing ~6–8px, `Stroke="#18FF8C00"` (very faint orange).

```csharp
// In RebuildGeometry() — drawn after tube, before ghost digits
double meshSpacing = 6.0;
for (double y = meshSpacing; y < tubeH - meshSpacing; y += meshSpacing)
{
    var line = new Line
    {
        X1 = tubePad, Y1 = y, X2 = tubeW - tubePad, Y2 = y,
        Stroke = new SolidColorBrush(Color.FromArgb(0x18, 0xFF, 0x8C, 0x00)),
        StrokeThickness = 0.5
    };
    RootCanvas.Children.Add(line);
}
```

### Pattern 6: Ghost cathode rendering

**What:** 10 `TextBlock` elements (one per digit "0"–"9") stacked vertically in natural order inside the tube area. Each uses a Nixie-style font (Segoe UI or similar monospace). The active digit gets full warm orange foreground; all others get ghost opacity.

**Ghost opacity tiers:**
- Base ghost: `Color.FromArgb(0x14, 0xFF, 0x80, 0x00)` (~8% alpha = 0x14/0xFF)
- ±1 from active: `Color.FromArgb(0x1E, 0xFF, 0x80, 0x00)` (~12% alpha)
- ±2 from active: `Color.FromArgb(0x18, 0xFF, 0x80, 0x00)` (~9.5% alpha)
- Active digit: `Color.FromArgb(0xFF, 0xFF, 0x8C, 0x00)` — full warm orange

**Vertical stacking:** Real Nixie tubes stack digit cathodes front-to-back; visually this means digits appear at different vertical positions within the tube. Approximate by offsetting each digit's `Canvas.Top` by ~2px * digit_index so they occupy a band rather than all sharing the same origin.

### Pattern 7: Glow/bloom effect (RadialGradientBrush)

**What:** A `Path` ellipse drawn behind the active digit character, filled with a `RadialGradientBrush` that fades from warm orange at center to transparent at edge.

```csharp
// Active digit glow — drawn behind the TextBlock for active digit
var glow = new System.Windows.Shapes.Ellipse
{
    Width  = digitW * 1.2,
    Height = digitH * 0.5,
    Fill = new RadialGradientBrush(
        Color.FromArgb(0xA0, 0xFF, 0x8C, 0x00),  // inner warm orange, 63% alpha
        Colors.Transparent)
};
```

No `Effect` is used. The gradient itself creates the bloom. A secondary outer glow ellipse at lower opacity (30%) adds depth. Both are sized relative to digit height.

### Anti-Patterns to Avoid
- **Using `UIElement.Effect`:** DropShadowEffect or BlurEffect renders as solid black rectangles in the `AllowsTransparency="True"` main window. Use `RadialGradientBrush` stacking instead.
- **Binding digit text to `ActiveDigit` via XAML:** Ghost rendering requires per-element opacity control in code-behind (`RebuildGeometry` + `UpdateDisplay`); pure XAML binding cannot express the proximity-fade logic.
- **Not setting explicit `Width`/`Height` on `RootCanvas`:** `SizeToContent="WidthAndHeight"` window collapses `Canvas` to zero size if its dimensions are not set explicitly in code-behind. The `SevenSegmentDigit` pattern sets both `RootCanvas.Width`/`Height` and `this.Width`/`this.Height`.
- **Calling `UpdateTime()` immediately after making `NixieView` visible:** `IsVisibleChanged` fires `UpdateTime()` automatically (same as `LcdClockView`). Do NOT add a redundant `NixieView.UpdateTime()` call in `SetClockType` — same comment pattern as LCD.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Glow/bloom around lit digit | Custom shader or Effect | Stacked `RadialGradientBrush` ellipses | Effects are forbidden; RGB stacking is the established project pattern |
| Font size tier mapping | New enum or switch | Reuse `LcdSize` enum with new `NixieSizeMap` helper | `FontSizeToLcdSize()` in MainWindow already maps font→LcdSize; same breakpoints |
| Time formatting (12hr) | New formatter | `DateTime.Now.Hour % 12` inline in `UpdateTime()` | Simple enough inline; no format string needed since Nixie has no seconds |
| ClockType persistence | Migration code | None needed — JSON string enum handles new value automatically | `JsonStringEnumConverter` serializes `Nixie` as `"Nixie"`; existing settings files with `"Phrase"`/`"Dial"`/`"Lcd"` continue to deserialize correctly |

**Key insight:** Every structural decision in this phase has a direct precedent in `LcdClockView`/`SevenSegmentDigit`. Deviating from that pattern adds risk without benefit.

---

## Common Pitfalls

### Pitfall 1: Effects render as black rectangles
**What goes wrong:** Adding `DropShadowEffect` or `BlurEffect` to any element inside the Nixie subtree makes those elements render as black opaque rectangles on screen.
**Why it happens:** `AllowsTransparency="True"` on the main `Window` triggers WPF's layered window compositing path. WPF's software renderer cannot composite `UIElement.Effect` with per-pixel transparency.
**How to avoid:** Simulate all glow effects with `RadialGradientBrush` fills on `Ellipse`/`Path` shapes drawn behind the lit element.
**Warning signs:** Element becomes a solid black box when visible.

### Pitfall 2: Canvas not sized — collapses to 0x0
**What goes wrong:** `NixieDigit.RootCanvas` shows nothing; the digit appears to have zero width.
**Why it happens:** `Canvas` measures as 0x0 unless children have explicit positions AND the `Canvas` itself has `Width`/`Height` set (or `ActualWidth`/`ActualHeight` are valid). In a `SizeToContent="WidthAndHeight"` window, the canvas will not auto-size.
**How to avoid:** At the end of `RebuildGeometry()`, set `RootCanvas.Width = digitW; RootCanvas.Height = canvasH; Width = digitW; Height = canvasH;` — exactly as `SevenSegmentDigit.RebuildGeometry()` does.
**Warning signs:** Nixie clock shows empty or zero-width space where digits should appear.

### Pitfall 3: MainWindow ApplySettings has a 5th clock-type site
**What goes wrong:** Nixie is visible at startup (saved setting), but the display is blank or shows phrase text.
**Why it happens:** `ApplySettings()` contains two `if/else if` clock-type branches (one for Dial, one for Lcd, with implicit Phrase else). The 5th site is inside the `else // Phrase` comment block — CONTEXT.md records "5 clock-type touch points in MainWindow, not 4".
**How to avoid:** Add `else if (s.ClockType == ClockType.Nixie)` in the `ApplySettings` clock-type block alongside the Dial and Lcd branches. Check the full method for every visibility guard.
**Warning signs:** Nixie type persists to disk but loads as blank on restart.

### Pitfall 4: Timer tick fires for Nixie when not visible
**What goes wrong:** 10-second phrase timer still fires and calls `UpdatePhraseIfChanged()` when Nixie is active, wasting CPU or causing unwanted phrase-engine updates.
**Why it happens:** The existing `_timer.Tick` handler checks `if (_clockType != ClockType.Lcd)` — Nixie is not Lcd, so phrase/dial updates run.
**How to avoid:** Update the timer tick guard to `if (_clockType != ClockType.Lcd && _clockType != ClockType.Nixie)`. `NixieClockView` manages its own internal `DispatcherTimer` via `IsVisibleChanged` (same as `LcdClockView`).
**Warning signs:** PhraseEngine logs activity when Nixie is displayed, or phrase text appears over Nixie.

### Pitfall 5: SettingsWindow row visibility — all LCD rows must collapse for Nixie
**What goes wrong:** LCD Format / LCD Seconds / LCD Style rows remain visible when switching to Nixie.
**Why it happens:** `SetClockStyleButtonStates()` currently calls `SetLcdRowsVisible(clockType == ClockType.Lcd)` — Nixie is not Lcd, so this correctly hides LCD rows. However the call must also collapse Phrase Style and Dial Options rows when Nixie is active.
**How to avoid:** Extend `SetClockStyleButtonStates()` to set `BtnNixie.Tag` and ensure Phrase/Dial/LCD rows all collapse for Nixie. The CONTEXT.md decision table is precise: hide all five row groups when Nixie selected.
**Warning signs:** Settings window shows orphaned LCD or Phrase rows when Nixie button is selected.

### Pitfall 6: Ghost digit vertical stacking creates layout problems
**What goes wrong:** Ghost digits overflow the tube border rectangle visually, or `Canvas` children escape the clip area.
**Why it happens:** `Canvas` does not clip children by default — elements positioned outside canvas bounds are visible.
**How to avoid:** Set `ClipToBounds="True"` on `RootCanvas`, or ensure all ghost `TextBlock` elements are placed within the tube height bounds during `RebuildGeometry()`.

---

## Code Examples

Verified patterns from existing codebase:

### ClockType enum extension
```csharp
// ClockType.cs — add Nixie as value 3
public enum ClockType
{
    Phrase,
    Dial,
    Lcd,
    Nixie    // add this
}
```

### SetClockType switch extension (MainWindow.xaml.cs)
```csharp
// Pattern from existing SetClockType — add Nixie case
NixieView.Visibility = Visibility.Collapsed;  // collapse first (add to existing collapse block)

switch (clockType)
{
    case ClockType.Dial:
        DialCanvas.Visibility = Visibility.Visible;
        UpdateDialDisplay();
        break;
    case ClockType.Lcd:
        ApplyLcdColors();
        LcdView.Use24Hr     = _lcdUse24Hr;
        LcdView.ShowSeconds = _lcdShowSeconds;
        LcdView.Size        = FontSizeToLcdSize(_currentFontSize);
        LcdView.Visibility  = Visibility.Visible;
        break;
    case ClockType.Nixie:
        NixieView.Size       = FontSizeToLcdSize(_currentFontSize);  // reuse same mapping
        NixieView.Visibility = Visibility.Visible;
        // Do NOT call UpdateTime() — IsVisibleChanged fires automatically
        break;
    default: // Phrase
        // ... phrase text visibility set elsewhere
        break;
}
```

### ApplyFontSize extension (MainWindow.xaml.cs)
```csharp
// Existing line: LcdView.Size = FontSizeToLcdSize(size);
// Add after it:
NixieView.Size = FontSizeToLcdSize(size);
```

### SettingsWindow BtnNixie_Click handler
```csharp
private void BtnNixie_Click(object sender, RoutedEventArgs e)
{
    if (_suppressEvents) return;
    SetClockStyleButtonStates(ClockType.Nixie);
    ClockTypeChanged?.Invoke(ClockType.Nixie);
}
```

### SetClockStyleButtonStates extension (SettingsWindow.xaml.cs)
```csharp
private void SetClockStyleButtonStates(ClockType clockType)
{
    BtnPhrase.Tag = clockType == ClockType.Phrase ? "selected" : null;
    BtnDial.Tag   = clockType == ClockType.Dial   ? "selected" : null;
    BtnLcd.Tag    = clockType == ClockType.Lcd    ? "selected" : null;
    BtnNixie.Tag  = clockType == ClockType.Nixie  ? "selected" : null;  // add

    SetLcdRowsVisible(clockType == ClockType.Lcd);
    var dialVis   = clockType == ClockType.Dial   ? Visibility.Visible : Visibility.Collapsed;
    var phraseVis = clockType == ClockType.Phrase ? Visibility.Visible : Visibility.Collapsed;
    DialOptionsRowLabel.Visibility = dialVis;
    DialOptionsRow.Visibility      = dialVis;
    PhraseStyleRowLabel.Visibility = phraseVis;
    CmbPhraseStyle.Visibility      = phraseVis;
    // Nixie: all option rows hidden (SetLcdRowsVisible=false, dial+phrase=Collapsed)
}
```

### TrayMenuBuilder — add _nixieClockItem field and wire-up
```csharp
// Field:
private System.Windows.Forms.ToolStripMenuItem _nixieClockItem = null!;

// In Build():
_nixieClockItem = new System.Windows.Forms.ToolStripMenuItem("Nixie")
    { Checked = initialState.ClockType == ClockType.Nixie };
_nixieClockItem.Click += (_, _) => _cb.SetClockType(ClockType.Nixie);
clockTypeMenu.DropDownItems.Add(_nixieClockItem);

// In SyncCheckmarks():
_nixieClockItem.Checked = s.ClockType == ClockType.Nixie;
```

### MainWindow.xaml — NixieClockView element (alongside LcdView)
```xml
<controls:NixieClockView x:Name="NixieView"
                          Visibility="Collapsed"
                          HorizontalAlignment="Center"
                          VerticalAlignment="Center"/>
```

### SettingsWindow.xaml — BtnNixie in Clock Style row
```xml
<!-- Clock Style row — existing border, add BtnNixie after BtnLcd -->
<Button x:Name="BtnNixie" Content="Nixie"
        Style="{StaticResource SegmentButtonStyle}"
        Click="BtnNixie_Click"/>
```

### AppSettings — no change needed
```csharp
// ClockType is already declared with JsonStringEnumConverter:
[JsonConverter(typeof(JsonStringEnumConverter))]
public ClockType ClockType { get; init; } = ClockType.Phrase;
// Adding Nixie=3 to the enum automatically serializes as "Nixie" — no migration needed.
```

### SettingsService.Validate() — no new guard needed
The existing Validate() has no ClockType guard (deserialization handles unknown string values — they default to Phrase). No new guard required for Nixie; if the JSON contains `"ClockType":"Nixie"`, it will deserialize correctly after the enum value is added.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `DialMode: bool` in settings | `ClockType` enum ("Phrase"/"Dial"/"Lcd") | Phase ~40 | String enum is forward-compatible; adding "Nixie" requires no migration |
| `UIElement.Effect` for glow | `RadialGradientBrush` stacking | Established in prior Nixie planning | AllowsTransparency limitation discovered; RGB gradient is the canonical workaround |
| Timer always running | `IsVisibleChanged` starts/stops timer | LcdClockView introduction | NixieClockView must follow this pattern to avoid background CPU use |

**Deprecated/outdated:**
- `UIElement.Effect` in the Nixie subtree: forbidden by AllowsTransparency constraint; replaced by RadialGradientBrush.

---

## Open Questions

1. **Colon style: tube border vs floating dots**
   - What we know: two glowing orange dots; sizing proportional to digit height
   - What's unclear: visual balance at all three sizes — only determinable at runtime
   - Recommendation: start with floating dots (simpler to implement); add tube border in visual review step if it looks incomplete

2. **Wire mesh density and opacity**
   - What we know: ~6–8px spacing, very faint orange tint
   - What's unclear: whether horizontal-only lines are sufficient or whether a cross-hatch grid looks better
   - Recommendation: implement horizontal-only lines first; add vertical lines in visual review if the horizontal grid looks sparse

3. **Ghost cathode vertical offset per digit**
   - What we know: real Nixie tubes stack cathodes front-to-back, creating slight vertical position variation
   - What's unclear: whether a ~2px-per-digit offset is visible at Small/Medium sizes or looks like a bug
   - Recommendation: implement with 1.5px offset increment; reduce to 0 in visual review if it looks wrong

4. **Test coverage for Nixie**
   - What we know: REQUIREMENTS.md target is >=265 tests (already met by Phase 55); new Nixie tests are not specified in the requirement count
   - What's unclear: whether a `NixieSizeMap` unit test class should be added (analogous to `LcdSizeMap`)
   - Recommendation: add `NixieSizeMapTests` with 3 DataRow cases (Small/Medium/Large) — lightweight and consistent with existing test coverage patterns

---

## Integration Touch-Point Checklist

The STATE.md records the exact 5 touch points for Nixie. This is a precise checklist for planning:

| # | File | Change | Notes |
|---|------|--------|-------|
| 1 | `ClockType.cs` | Add `Nixie = 3` | Enables JSON serialization |
| 2 | `MainWindow.xaml.cs` | Extend `SetClockType()` switch | Add `case ClockType.Nixie:` block |
| 3 | `MainWindow.xaml.cs` | Extend `ApplySettings()` clock-type block | Add `else if (Nixie)` branch |
| 4 | `MainWindow.xaml.cs` | Extend timer `Tick` guard | `_clockType != ClockType.Lcd && _clockType != ClockType.Nixie` |
| 5 | `MainWindow.xaml.cs` | Extend `ApplyFontSize()` | Add `NixieView.Size = FontSizeToLcdSize(size);` |
| 6 | `MainWindow.xaml` | Add `<controls:NixieClockView>` | Alongside LcdView in ContentBorder Grid |
| 7 | `SettingsWindow.xaml` | Add `BtnNixie` to Clock Style row | After `BtnLcd` in existing StackPanel |
| 8 | `SettingsWindow.xaml.cs` | Extend `SetClockStyleButtonStates()` + add `BtnNixie_Click` | Fire `ClockTypeChanged?.Invoke(ClockType.Nixie)` |
| 9 | `TrayMenuBuilder.cs` | Add `_nixieClockItem` field, Build() item, SyncCheckmarks() | Same commit as SettingsWindow |

Additionally:
| 10 | `Controls/NixieClockView.xaml` | New file | StackPanel of NixieDigit instances |
| 11 | `Controls/NixieClockView.xaml.cs` | New file | DispatcherTimer + UpdateTime() |
| 12 | `Controls/NixieDigit.xaml` | New file | `<Canvas x:Name="RootCanvas" />` |
| 13 | `Controls/NixieDigit.xaml.cs` | New file | RebuildGeometry() + UpdateDisplay() |
| 14 | `NixieSize.cs` | New file | `NixieSizeMap.ToDigitHeight(LcdSize)` |

---

## Sources

### Primary (HIGH confidence)
- Codebase direct read: `Controls/LcdClockView.xaml.cs` — LcdClockView timer/DependencyProperty pattern
- Codebase direct read: `Controls/SevenSegmentDigit.xaml.cs` — RebuildGeometry()/UpdateSegments() canvas pattern
- Codebase direct read: `TrayMenuBuilder.cs` — clock type submenu wiring pattern
- Codebase direct read: `SettingsWindow.xaml.cs` — SetClockStyleButtonStates(), PopulateControls()
- Codebase direct read: `SettingsWindow.xaml` — Grid row structure, existing button names, row visibility
- Codebase direct read: `MainWindow.xaml.cs` — SetClockType() switch, ApplySettings() clock block, FontSizeToLcdSize()
- Codebase direct read: `MainWindow.xaml` — ContentBorder Grid element order, LcdView placement
- Codebase direct read: `AppSettings.cs` — ClockType serialization, field pattern
- Codebase direct read: `SettingsService.cs` — Validate() pattern, Defaults() pattern
- Codebase direct read: `56-CONTEXT.md` — all locked decisions

### Secondary (MEDIUM confidence)
- WPF `RadialGradientBrush` behavior with `AllowsTransparency` — established project constraint from STATE.md; consistent with known WPF layered window rendering behavior

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — entire stack is the existing project stack
- Architecture: HIGH — all patterns are direct mirrors of existing `LcdClockView`/`SevenSegmentDigit` code read verbatim
- Integration touch points: HIGH — all 9 integration points are confirmed by reading actual source files
- Visual parameters (gradient stops, ghost opacities, mesh density): MEDIUM — reasonable starting values; require runtime visual review
- Pitfalls: HIGH — confirmed from codebase (Effects prohibition in STATE.md, Canvas sizing in SevenSegmentDigit, 5-site comment in MainWindow)

**Research date:** 2026-03-11
**Valid until:** 2026-04-10 (stable codebase; WPF APIs do not change)
