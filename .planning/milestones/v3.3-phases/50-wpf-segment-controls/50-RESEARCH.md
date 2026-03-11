# Phase 50: WPF Segment Controls - Research

**Researched:** 2026-03-10
**Domain:** WPF UserControl authoring, Polygon geometry, DispatcherTimer
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Segment end style**
- Classic LCD diamond chamfers on all 7 segments (not just horizontal) — heavy 45 degree cuts giving elongated hexagon/parallelogram shape
- Applies consistently to both horizontal segments (a, d, g) and vertical segments (b, c, e, f)
- Tight inter-segment gap: ~5% of SegmentHeight between where one segment ends and the next begins
- Segment thickness: ~13% of SegmentHeight per requirements

**Colon dot design**
- Two dots rendered as small rectangles — width matches segment bar width, height proportional
- Vertical positions: 1/3 from top and 2/3 from top within the digit height (aligns with gaps between top/middle/bottom segments)
- Colon slot width: ~30% of digit width (narrow, compact)
- Dot color follows the same lit/ghost rules as segments (theme lit color when colon character, ghost color as background dot)

**Digit spacing**
- Zero gap between adjacent SevenSegmentDigit backgrounds inside LcdClockView — cells butt directly against each other, creating a unified LCD panel appearance
- Small internal padding inside each SevenSegmentDigit: ~5% of SegmentHeight between the segment geometry and the background rectangle edge

**Background**
- Per-digit backgrounds only: each SevenSegmentDigit has its own background rectangle filled with theme background color
- No additional outer background wrapper on LcdClockView — with zero gap between digits the per-digit backgrounds read as a unified panel
- Background fully opaque (Alpha = 1.0) — classic black LCD panel look, no desktop bleed-through

### Claude's Discretion
- Exact Polygon point coordinates for the chamfered segment geometry (math to compute given SegmentHeight)
- How ghost segments are realized: theme ghost color at full opacity (not additional Opacity property reduction)
- DispatcherTimer wiring details — start/stop tied to IsVisible; UpdateTime() public method for on-demand refresh

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

## Summary

Phase 50 builds two standalone WPF UserControls: `SevenSegmentDigit` (renders one character slot using 7 chamfered Polygon segments plus ghost effect) and `LcdClockView` (composes SevenSegmentDigit instances for a full HH:MM or HH:MM:SS clock with a DispatcherTimer). Both live in a new `FuzzyClock.App/Controls/` directory. The `SevenSegmentEncoder` (Phase 49) and `ClockType` enum (Phase 48) are already in place; this phase adds the visual rendering layer on top.

The core challenge is computing correct Polygon point sets for 7 chamfered segments at arbitrary `SegmentHeight`, laying them out inside a fixed-size Canvas, and updating fill colors on `Character`/`Theme` changes via dependency properties. `LcdClockView` stacks `SevenSegmentDigit` instances in a horizontal `StackPanel` and drives them from a `DispatcherTimer` that pauses when the control is not visible.

Two new enums also belong to this phase: `LcdTheme` (5 palettes with exact hex colors) and `LcdSize` (Small=32px, Medium=48px, Large=64px SegmentHeight). These enums will be consumed by Phase 51 (AppSettings wiring) but must be defined here.

**Primary recommendation:** Implement geometry in pure code-behind (no XAML Polygon declarations) — compute all 8-point Polygon PointCollections from SegmentHeight at render time in `UpdateSegments()`, called from each dependency-property changed callback. This is the cleanest approach given the scaling requirement.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| WPF (PresentationFramework) | net10.0-windows | UserControl, Polygon, DispatcherTimer, DependencyProperty | Already the app's UI framework |
| System.Windows.Shapes.Polygon | built-in | Segment rendering | Only WPF primitive that fills an arbitrary closed polygon with a SolidColorBrush |
| System.Windows.Threading.DispatcherTimer | built-in | 1-second clock tick on UI thread | Timer that fires on the WPF dispatcher — no cross-thread marshalling needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| System.Windows.Media.SolidColorBrush | built-in | Segment fill colors (reused, not recreated per tick) | Cache one brush per color state to avoid GC pressure |
| System.Windows.Controls.Canvas | built-in | Pixel-accurate segment layout container inside SevenSegmentDigit | Fixed Width/Height, children positioned with Canvas.SetLeft/Top |
| System.Windows.Controls.StackPanel | built-in | Horizontal composition of SevenSegmentDigit cells in LcdClockView | Orientation=Horizontal, zero Margin/Spacing between children |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Polygon + code-behind geometry | Path with StreamGeometry | Path is more verbose to construct; Polygon.Points is simpler for closed convex shapes |
| Canvas for digit layout | Grid with fixed sizes | Both work; Canvas is explicit about pixel offsets matching geometry math |
| DispatcherTimer | async Timer + Dispatcher.Invoke | DispatcherTimer is the idiomatic WPF choice — fires on UI thread directly |

**Installation:** No new packages. All types are in the .NET 10 Windows WPF SDK already referenced by `FuzzyClock.App.csproj`.

---

## Architecture Patterns

### Recommended Project Structure
```
FuzzyClock.App/
├── Controls/                      # new directory (does not exist yet)
│   ├── SevenSegmentDigit.xaml     # UserControl XAML — minimal, root is Canvas
│   ├── SevenSegmentDigit.xaml.cs  # code-behind: DPs, geometry computation, UpdateSegments()
│   ├── LcdClockView.xaml          # UserControl XAML — root is StackPanel or Grid
│   └── LcdClockView.xaml.cs       # code-behind: DPs, DispatcherTimer, UpdateTime()
├── LcdTheme.cs                    # enum + static LcdPalette helper
├── LcdSize.cs                     # enum
└── ... (existing files unchanged)
```

### Pattern 1: WPF UserControl with Dependency Properties

**What:** A UserControl exposes bindable properties via `DependencyProperty.Register`. Property-changed callbacks call a central `Update*()` method that recalculates visual state.

**When to use:** Any control that needs data binding, styling, or value coercion in WPF.

**Example:**
```csharp
// SevenSegmentDigit.xaml.cs
public static readonly DependencyProperty CharacterProperty =
    DependencyProperty.Register(
        nameof(Character),
        typeof(char),
        typeof(SevenSegmentDigit),
        new PropertyMetadata(' ', OnVisualPropertyChanged));

public char Character
{
    get => (char)GetValue(CharacterProperty);
    set => SetValue(CharacterProperty, value);
}

private static void OnVisualPropertyChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    => ((SevenSegmentDigit)d).UpdateSegments();
```

### Pattern 2: Chamfered Hexagon Segment Geometry

**What:** Each segment is a 6-point (horizontal) or 6-point (vertical) polygon with 45-degree corner cuts. Given `SegmentHeight` (h), derived values are:
- `thickness` = h * 0.13
- `gap` = h * 0.05
- `width` = h * 0.6  (digit width)
- `chamfer` = thickness * 0.5  (45-degree cut size)

Horizontal segment (e.g., segment `a` = top): 6 points forming a parallelogram with chamfered ends:
```
  (x + chamfer, y)
  (x + w - chamfer, y)
  (x + w, y + chamfer)
  (x + w - chamfer, y + thickness)
  (x + chamfer, y + thickness)
  (x, y + chamfer)
```

Vertical segment (e.g., segment `b` = top-right): 6 points with chamfers on top and bottom:
```
  (x + chamfer, y)
  (x + thickness, y + chamfer)
  (x + thickness, y + h - chamfer)
  (x + chamfer, y + h)
  (x, y + h - chamfer)
  (x, y + chamfer)
```

**When to use:** Computing PointCollection values in `UpdateSegments()` whenever `SegmentHeight` changes.

### Pattern 3: DispatcherTimer Start/Stop Tied to Visibility

**What:** Override `OnVisibilityChanged` (or subscribe to `IsVisibleChanged`) to start/stop the DispatcherTimer, preventing invisible controls from wasting CPU.

**When to use:** Any WPF control with an internal timer that should not run when not visible.

**Example:**
```csharp
// LcdClockView.xaml.cs
public LcdClockView()
{
    InitializeComponent();
    _timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
    _timer.Tick += (_, _) => UpdateTime();
    IsVisibleChanged += (_, e) =>
    {
        if ((bool)e.NewValue) { UpdateTime(); _timer.Start(); }
        else _timer.Stop();
    };
}

public void UpdateTime()
{
    var now = DateTime.Now;
    // format string → push characters to each SevenSegmentDigit
}
```

### Pattern 4: LcdTheme Palette Lookup

**What:** A static helper maps `LcdTheme` enum to three `Color` values (Lit, Ghost, Background).

**Example:**
```csharp
// LcdTheme.cs
public enum LcdTheme { Green, Amber, Blue, Teal, Red }

public static class LcdPalette
{
    public static (Color Lit, Color Ghost, Color Background) Get(LcdTheme theme) => theme switch
    {
        LcdTheme.Green => (Color.FromRgb(0x00, 0xFF, 0x41), Color.FromRgb(0x00, 0x33, 0x10), Color.FromRgb(0x00, 0x1A, 0x00)),
        LcdTheme.Amber => (Color.FromRgb(0xFF, 0xAA, 0x00), Color.FromRgb(0x3D, 0x28, 0x00), Color.FromRgb(0x1A, 0x0A, 0x00)),
        LcdTheme.Blue  => (Color.FromRgb(0x00, 0xCF, 0xFF), Color.FromRgb(0x00, 0x2A, 0x35), Color.FromRgb(0x00, 0x00, 0x1A)),
        LcdTheme.Teal  => (Color.FromRgb(0x00, 0xB4, 0xB4), Color.FromRgb(0x00, 0x25, 0x25), Color.FromRgb(0x00, 0x10, 0x10)),
        LcdTheme.Red   => (Color.FromRgb(0xFF, 0x22, 0x00), Color.FromRgb(0x38, 0x08, 0x00), Color.FromRgb(0x1A, 0x00, 0x00)),
        _              => throw new ArgumentOutOfRangeException(nameof(theme))
    };
}
```

### Pattern 5: Segment Bit-Mask to Polygon Fill

**What:** `UpdateSegments()` calls `SevenSegmentEncoder.Encode(Character)` to get a byte mask, then sets each segment Polygon's Fill based on whether the corresponding bit is set. Colon sentinel (0x80) bypasses segment logic and shows two rectangle dots instead.

**Example:**
```csharp
private void UpdateSegments()
{
    var (lit, ghost, bg) = LcdPalette.Get(Theme);
    _backgroundRect.Fill = new SolidColorBrush(bg);

    if (Character == ':')
    {
        // hide all 7 segments, show two dot rectangles
        foreach (var seg in _segments) seg.Visibility = Visibility.Hidden;
        _dot1.Fill = new SolidColorBrush(lit);
        _dot2.Fill = new SolidColorBrush(lit);
        return;
    }

    // show ghost dots always
    _dot1.Fill = new SolidColorBrush(ghost);
    _dot2.Fill = new SolidColorBrush(ghost);

    byte mask = SevenSegmentEncoder.Encode(Character);
    for (int i = 0; i < 7; i++)
    {
        bool isLit = (mask & (1 << i)) != 0;
        _segments[i].Fill = new SolidColorBrush(isLit ? lit : ghost);
        _segments[i].Visibility = Visibility.Visible;
    }
}
```

### Pattern 6: Control Width Computation for SizeToContent

**What:** `SevenSegmentDigit` must expose a stable computed Width so `LcdClockView` (and ultimately `MainWindow` with `SizeToContent=WidthAndHeight`) can measure correctly. Width is derived from `SegmentHeight` in the `SegmentHeight` property-changed callback and set on the root Canvas.

```csharp
// In SegmentHeight changed callback:
double digitW = SegmentHeight * 0.6 + 2 * (SegmentHeight * 0.05); // geometry + padding
double colonW = digitW * 0.30;
// set Canvas.Width = isColon ? colonW : digitW
```

### Anti-Patterns to Avoid

- **Creating new SolidColorBrush on every tick:** Creates GC pressure at 1Hz. Cache brushes when theme/character hasn't changed, or use `Freeze()` on brushes to make them immutable and eligible for sharing.
- **Setting segment positions in XAML:** Segment coordinates depend on SegmentHeight and must be computed in code. Don't hard-code Canvas.Left/Top in XAML.
- **Using Visibility=Hidden for ghost segments:** The spec requires ghost segments to be visible at ghost color. Use Fill swap, not visibility toggling.
- **Starting DispatcherTimer in constructor unconditionally:** The timer must be guarded by `IsVisible` — a collapsed/hidden LcdClockView should not tick.
- **Declaring Polygon elements in XAML:** With 7 segments + 2 dot rectangles per SevenSegmentDigit, and points that depend on SegmentHeight, code-behind construction is mandatory for correct scaling.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Segment bit masks | Custom encoding table | `SevenSegmentEncoder.Encode()` (already in FuzzyClock.Core) | Already implemented, 13 tests passing |
| UI thread timer | Background thread + Dispatcher.Invoke | `DispatcherTimer` | Built-in WPF; fires on UI thread natively |
| Color parsing from hex strings | Manual hex parsing | `(Color)ColorConverter.ConvertFromString("#RRGGBB")` or `Color.FromRgb(r,g,b)` | Framework handles all cases |
| Polygon closed-shape filling | Drawing with Lines | `Polygon` with `Points` | Polygon auto-closes and fills; no manual close-path needed |

**Key insight:** The segment encoding logic is already done (Phase 49). Phase 50 is purely the visual layer — translating bytes to colored polygons.

---

## Common Pitfalls

### Pitfall 1: SizeToContent breaks when control has no explicit size
**What goes wrong:** `MainWindow` uses `SizeToContent=WidthAndHeight`. If `LcdClockView` does not set an explicit Width/Height, the window collapses or flickers on first render.
**Why it happens:** `SizeToContent` measures children; if children use `*`-sized layouts without a root anchor, measure returns 0.
**How to avoid:** Set explicit `Width` and `Height` on the root Canvas of `SevenSegmentDigit` computed from `SegmentHeight`. `LcdClockView`'s StackPanel then sizes naturally from its children.
**Warning signs:** Window collapses to a tiny size or jumps on first tick.

### Pitfall 2: DispatcherTimer keeps running when window is minimized or control collapses
**What goes wrong:** Timer fires every second even when LCD is not the active clock type, burning CPU and preventing GC.
**Why it happens:** `DispatcherTimer.Start()` called in constructor or on clock-type switch without pairing with `Stop()`.
**How to avoid:** Use `IsVisibleChanged` event. When `IsVisible` becomes `false`, call `_timer.Stop()`. When `true`, call `UpdateTime()` first (immediate refresh), then `_timer.Start()`.
**Warning signs:** Profiler shows `UpdateTime()` invocations while `ClockType != Lcd`.

### Pitfall 3: Polygon PointCollection not updated when SegmentHeight changes
**What goes wrong:** Segments render at old coordinates after a size change; geometry and background don't match.
**Why it happens:** Points are computed once at construction but not recomputed in `SegmentHeight` changed callback.
**How to avoid:** Extract geometry computation into a `RebuildGeometry()` method that is called from both the constructor and the `SegmentHeight` property-changed callback.

### Pitfall 4: Colon slot rendered as a SevenSegmentDigit with Character=':'
**What goes wrong:** If the colon slot is a full-width `SevenSegmentDigit`, the unified panel width is too wide.
**Why it happens:** Using the same digit width for colon as for numeric digits.
**How to avoid:** The colon slot width is ~30% of digit width (locked decision). Either give `SevenSegmentDigit` a `IsColonSlot` internal flag that adjusts Canvas.Width, or parameterize via a separate `ColumnWidth` computed property. The simplest approach: set Canvas.Width to `SegmentHeight * 0.6 * 0.30` when `Character == ':'`.

### Pitfall 5: Ghost dot always shown for colon slot (should follow lit/ghost rule)
**What goes wrong:** Ghost dots for a colon slot character that is "blank" (e.g., space) still render as lit.
**Why it happens:** Forgetting that ghost color = ghost for space, lit color = lit for ':'.
**How to avoid:** Colon dots use lit color when `Character == ':'`, ghost color for any other character state (space). This mirrors exactly how segments work.

### Pitfall 6: WPF UserControl XAML namespace for Controls/ subdirectory
**What goes wrong:** `LcdClockView.xaml` cannot reference `SevenSegmentDigit` via `xmlns` if namespace mapping is wrong.
**Why it happens:** XAML namespace prefix `clr-namespace:FuzzyClock.App.Controls` must match the C# namespace declared in the code-behind.
**How to avoid:** Declare `namespace FuzzyClock.App.Controls;` in both UserControl code-behind files. In `LcdClockView.xaml`, add `xmlns:controls="clr-namespace:FuzzyClock.App.Controls"` and use `<controls:SevenSegmentDigit .../>`.

---

## Code Examples

Verified patterns from WPF documentation and established project conventions:

### Dependency Property Registration (WPF standard pattern)
```csharp
// Source: WPF DependencyProperty docs — standard registration pattern
public static readonly DependencyProperty ThemeProperty =
    DependencyProperty.Register(
        nameof(Theme),
        typeof(LcdTheme),
        typeof(SevenSegmentDigit),
        new PropertyMetadata(LcdTheme.Green, OnVisualPropertyChanged));

public LcdTheme Theme
{
    get => (LcdTheme)GetValue(ThemeProperty);
    set => SetValue(ThemeProperty, value);
}
```

### DispatcherTimer with IsVisibleChanged guard
```csharp
// Source: WPF DispatcherTimer docs + IsVisibleChanged pattern
private readonly DispatcherTimer _timer;

public LcdClockView()
{
    InitializeComponent();
    _timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
    _timer.Tick += (_, _) => UpdateTime();
    IsVisibleChanged += OnIsVisibleChanged;
}

private void OnIsVisibleChanged(object sender, DependencyPropertyChangedEventArgs e)
{
    if ((bool)e.NewValue)
    {
        UpdateTime();
        _timer.Start();
    }
    else
    {
        _timer.Stop();
    }
}
```

### Chamfered horizontal segment point computation
```csharp
// Segment 'a' (top horizontal) at position (x, y)
// thickness = h * 0.13, chamfer = thickness / 2, barWidth = h * 0.6 - 2 * gap
private static PointCollection HorizontalSegment(double x, double y, double barWidth, double thickness)
{
    double ch = thickness * 0.5;
    return new PointCollection
    {
        new Point(x + ch,          y),
        new Point(x + barWidth - ch, y),
        new Point(x + barWidth,    y + ch),
        new Point(x + barWidth - ch, y + thickness),
        new Point(x + ch,          y + thickness),
        new Point(x,               y + ch),
    };
}
```

### Chamfered vertical segment point computation
```csharp
// Segment 'b' (top-right vertical) at position (x, y) with given height
private static PointCollection VerticalSegment(double x, double y, double barHeight, double thickness)
{
    double ch = thickness * 0.5;
    return new PointCollection
    {
        new Point(x + ch,          y),
        new Point(x + thickness,   y + ch),
        new Point(x + thickness,   y + barHeight - ch),
        new Point(x + ch,          y + barHeight),
        new Point(x,               y + barHeight - ch),
        new Point(x,               y + ch),
    };
}
```

### Segment layout coordinates (all 7 segments)
Given `h = SegmentHeight`, `t = h * 0.13`, `gap = h * 0.05`, `pad = h * 0.05`, `w = h * 0.6`:

- Inner digit width (geometry span): `bw = w - 2*pad` (horizontal bar width)
- Top-half vert height: `vhalf = (h - 3*t - 4*gap) / 2`
- Full Canvas height: `h + 2*pad`

Segment positions (x,y relative to Canvas origin = top-left of digit background):

| Seg | Name | Type | x | y |
|-----|------|------|---|---|
| a | top horiz | H | pad | pad |
| b | top-right vert | V | pad + bw - t + gap | pad + t + gap |
| c | bot-right vert | V | pad + bw - t + gap | pad + t + gap + vhalf + t + 2*gap |
| d | bottom horiz | H | pad | pad + 2*t + 2*vhalf + 4*gap |
| e | bot-left vert | V | pad + gap | pad + t + gap + vhalf + t + 2*gap |
| f | top-left vert | V | pad + gap | pad + t + gap |
| g | middle horiz | H | pad | pad + t + vhalf + 2*gap |

### LcdSize enum with SegmentHeight mapping
```csharp
public enum LcdSize { Small, Medium, Large }

public static class LcdSizeMap
{
    public static double ToSegmentHeight(LcdSize size) => size switch
    {
        LcdSize.Small  => 32.0,
        LcdSize.Medium => 48.0,
        LcdSize.Large  => 64.0,
        _ => throw new ArgumentOutOfRangeException(nameof(size))
    };
}
```

### 12hr/24hr time formatting
```csharp
public static string FormatTime(DateTime now, bool use24Hr, bool showSeconds)
{
    if (use24Hr)
    {
        return showSeconds
            ? $"{now.Hour:D2}:{now.Minute:D2}:{now.Second:D2}"
            : $"{now.Hour:D2}:{now.Minute:D2}";
    }
    else
    {
        int h = now.Hour % 12;
        if (h == 0) h = 12;
        string hourStr = h < 10 ? $" {h}" : $"{h}";
        return showSeconds
            ? $"{hourStr}:{now.Minute:D2}:{now.Second:D2}"
            : $"{hourStr}:{now.Minute:D2}";
    }
}
```

Note: `LcdTimeFormatHelper.FormatTime()` should be a static internal class in `FuzzyClock.App`; tests for it go in `FuzzyClock.App.Tests`.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `bool DialMode` in AppSettings | `ClockType` enum (Phase 48) | Phase 48 (this milestone) | ClockType.Lcd is the third variant |
| No segment encoding | `SevenSegmentEncoder.Encode(char)` in FuzzyClock.Core | Phase 49 (this milestone) | Encoding is done; only rendering remains |
| No Controls/ directory | `FuzzyClock.App/Controls/` | Phase 50 (this phase) | New subdirectory needed |

**No deprecated items affecting this phase.**

---

## Open Questions

1. **Segment gap math precision**
   - What we know: Gap = 5% of SegmentHeight, thickness = 13%; these are "approximately" values from requirements.
   - What's unclear: Whether 5% gap is center-to-center or edge-to-edge between segments.
   - Recommendation: Treat as edge-to-edge (clear space between polygons). This is the natural interpretation for "inter-segment gap."

2. **SolidColorBrush caching strategy**
   - What we know: `UpdateSegments()` fires every second + on any property change.
   - What's unclear: Whether creating new brushes per tick is acceptable at this frequency.
   - Recommendation: Cache the three brushes (lit, ghost, bg) as fields on `SevenSegmentDigit`, recreate only when `Theme` changes. At 1 Hz with ~8 digits, GC pressure is minimal even without caching, but caching is cleaner.

3. **LcdTimeFormatHelper location**
   - What we know: The formatting logic is simple, testable, has 4 planned test cases (per F10/LcdTimeFormatTests).
   - What's unclear: Whether it belongs as an inner class or a separate file.
   - Recommendation: Separate file `LcdTimeFormatHelper.cs` in `FuzzyClock.App/` (not Controls/) — keeps it accessible to tests without a Controls/ namespace import.

---

## Sources

### Primary (HIGH confidence)
- WPF DependencyProperty documentation (official Microsoft docs) — registration pattern, PropertyMetadata, changed callbacks
- WPF DispatcherTimer documentation — Interval, Tick, Start/Stop
- WPF Polygon documentation — Points (PointCollection), Fill, Visibility
- Existing project code: `FuzzyClock.App/MainWindow.xaml` — confirms Canvas+Line drawing pattern, `SizeToContent=WidthAndHeight`
- Existing project code: `FuzzyClock.Core/SevenSegmentEncoder.cs` — bit layout (bits 0-6 = a-g, 0x80 = colon sentinel)
- Existing project code: `FuzzyClock.App/AppSettings.cs` — record pattern, JsonStringEnumConverter usage
- `FuzzyClock.App.Tests/FuzzyClock.App.Tests.csproj` — MSTest 4.0.1, net10.0-windows, UseWPF=true

### Secondary (MEDIUM confidence)
- `50-CONTEXT.md` code_context section — confirmed no Controls/ directory exists yet; LcdTheme/LcdSize enums not yet defined

### Tertiary (LOW confidence)
- None.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all types are WPF built-ins already used by the project
- Architecture: HIGH — segment geometry math is deterministic; DP + callback pattern is standard WPF
- Pitfalls: HIGH — SizeToContent fragility is a known and observable characteristic of this codebase (comment in MainWindow.xaml confirms it)

**Research date:** 2026-03-10
**Valid until:** 2026-06-10 (WPF API is extremely stable; DispatcherTimer and Polygon have not changed in years)
