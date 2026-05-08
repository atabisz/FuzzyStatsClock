# NixieDigit Visual Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace font-based nixie digit rendering with wire-cathode PathGeometry strokes, multi-layer glow bloom, medium-opacity ghost digits for all 10 cathodes, and a smooth ±18% brightness flicker.

**Architecture:** `NixieDigit.xaml.cs` is fully self-contained — all 10 digit shapes are defined as WPF path data strings in a 30×50 coordinate space. `RebuildGeometry()` parses them once, applies a `ScaleTransform` + `TranslateTransform` per digit (including depth-stacking offset), and builds 10 ghost `Path` elements plus 4 concentric glow `Path` elements. A `DispatcherTimer` at 40ms drives a smooth random-walk flicker that updates the glow layer opacities. `NixieClockView` and all tests are untouched.

**Tech Stack:** C# 13, .NET 10, WPF, `System.Windows.Shapes.Path`, `System.Windows.Media.Geometry`, `System.Windows.Threading.DispatcherTimer`

---

### Task 1: Replace usings, fields, and add static data tables

**Files:**
- Modify: `FuzzyClock.App/Controls/NixieDigit.xaml.cs:1-58`

This task replaces the old field declarations and adds all static lookup data. No logic changes yet — just declarations. The file should still compile and run (RebuildGeometry still uses the old fields; that gets fixed in Task 2).

- [ ] **Step 1: Replace the using block and field declarations**

Replace lines 1–58 of `FuzzyClock.App/Controls/NixieDigit.xaml.cs` with:

```csharp
using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;
using System.Windows.Threading;
using WpfUserControl = System.Windows.Controls.UserControl;
using WpfColor       = System.Windows.Media.Color;
using WpfRectangle   = System.Windows.Shapes.Rectangle;

namespace FuzzyClock.App.Controls;

public partial class NixieDigit : WpfUserControl
{
    // ---------------------------------------------------------------
    // Dependency Properties
    // ---------------------------------------------------------------

    public static readonly DependencyProperty ActiveDigitProperty =
        DependencyProperty.Register(nameof(ActiveDigit), typeof(int), typeof(NixieDigit),
            new PropertyMetadata(-1, OnVisualPropertyChanged));

    public static readonly DependencyProperty DigitHeightProperty =
        DependencyProperty.Register(nameof(DigitHeight), typeof(double), typeof(NixieDigit),
            new PropertyMetadata(56.0, OnDigitHeightChanged));

    public int ActiveDigit
    {
        get => (int)GetValue(ActiveDigitProperty);
        set => SetValue(ActiveDigitProperty, value);
    }

    public double DigitHeight
    {
        get => (double)GetValue(DigitHeightProperty);
        set => SetValue(DigitHeightProperty, value);
    }

    private static void OnVisualPropertyChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
        => ((NixieDigit)d).UpdateDisplay(((NixieDigit)d).ActiveDigit);

    private static void OnDigitHeightChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        var ctrl = (NixieDigit)d;
        ctrl.RebuildGeometry();
        ctrl.UpdateDisplay(ctrl.ActiveDigit);
    }

    // ---------------------------------------------------------------
    // Static cathode path data (30×50 coordinate space)
    // ---------------------------------------------------------------

    private static readonly string[] DigitPaths =
    {
        // 0: oval — four quarter arcs CW
        "M 15,3 A 11,22 0 0 1 26,25 A 11,22 0 0 1 15,47 A 11,22 0 0 1 4,25 A 11,22 0 0 1 15,3 Z",
        // 1: diagonal top hook + vertical stem
        "M 10,9 L 14,5 L 14,49",
        // 2: reverse-S curve
        "M 6,13 C 6,5 26,5 26,15 C 26,24 6,32 6,49 L 26,49",
        // 3: two open loops
        "M 6,10 C 6,5 26,5 26,16 C 26,23 17,27 26,30 C 26,42 6,50 6,46",
        // 4: diagonal down + horizontal bar + vertical
        "M 23,5 L 6,31 L 27,31 M 23,5 L 23,49",
        // 5: top horizontal + left vertical + curve
        "M 26,5 L 6,5 L 6,27 C 16,23 26,24 26,38 C 26,49 6,50 6,46",
        // 6: hooked descender with inner loop
        "M 24,7 C 9,2 4,15 4,29 C 4,41 9,49 17,49 C 25,49 27,41 27,33 C 27,25 21,23 15,25 C 9,27 4,34 4,45",
        // 7: top bar + diagonal
        "M 5,5 L 26,5 L 12,49",
        // 8: two stacked loops
        "M 16,27 C 6,27 6,5 16,5 C 26,5 26,27 16,27 C 6,27 6,49 16,49 C 26,49 26,27 16,27",
        // 9: upper loop + descending tail
        "M 5,20 C 5,9 9,4 16,4 C 23,4 27,11 27,19 C 27,27 22,31 16,30 C 10,29 5,23 5,20 M 27,19 C 27,39 22,49 12,49",
    };

    // Glow layer config: outermost (index 0) → core (index 3)
    private static readonly double[] GlowWidthMultipliers = { 3.6, 2.4, 1.6, 1.0 };
    private static readonly double[] GlowBaseOpacities    = { 0.04, 0.10, 0.30, 1.0 };
    private static readonly WpfColor[] GlowLayerColors =
    {
        WpfColor.FromRgb(0xFF, 0x78, 0x00),  // halo
        WpfColor.FromRgb(0xFF, 0x8C, 0x00),  // mid glow
        WpfColor.FromRgb(0xFF, 0xA0, 0x00),  // inner bloom
        WpfColor.FromRgb(0xFF, 0xB8, 0x14),  // core (warm amber-cream)
    };

    private static readonly Random _rng = new();

    // ---------------------------------------------------------------
    // Fields
    // ---------------------------------------------------------------

    private Path[]     _ghostPaths       = Array.Empty<Path>();
    private Path[]     _glowPaths        = Array.Empty<Path>();
    private Geometry[] _scaledGeometries = Array.Empty<Geometry>();

    private DispatcherTimer _flickerTimer    = null!;
    private double          _flickerCurrent  = 1.0;
    private double          _flickerTarget   = 1.0;
    private DateTime        _flickerNextChange = DateTime.MinValue;

    // Geometry cache
    private double _builtDigitW;
    private double _builtDigitH;
```

- [ ] **Step 2: Build to verify no compile errors**

```
dotnet build FuzzyClock.App/FuzzyClock.App.csproj
```

Expected: build succeeds (RebuildGeometry still compiles because old fields still exist momentarily — they'll be replaced in Task 2). If you see "The name '_ghosts' does not exist" that's fine — it means the old field declarations were already removed; just ensure no other errors.

- [ ] **Step 3: Commit**

```bash
git add FuzzyClock.App/Controls/NixieDigit.xaml.cs
git commit -m "refactor(nixie): add static path data tables and replace field declarations"
```

---

### Task 2: Rewrite RebuildGeometry — geometry cache + ghost paths

**Files:**
- Modify: `FuzzyClock.App/Controls/NixieDigit.xaml.cs` — `RebuildGeometry()` method

Replace the entire `RebuildGeometry()` method body. The tube border, glass highlight, and wire mesh sections are kept unchanged. The TextBlock loop and Ellipse are replaced with geometry parsing and ghost Path creation.

- [ ] **Step 1: Replace the constructor and full RebuildGeometry method**

Replace the constructor and `RebuildGeometry()` method (lines 64–180 in the original, adjusted for the new field block) with:

```csharp
    // ---------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------

    public NixieDigit()
    {
        InitializeComponent();
        _flickerTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(40) };
        _flickerTimer.Tick += OnFlickerTick;
        RebuildGeometry();
        UpdateDisplay(ActiveDigit);
    }

    // ---------------------------------------------------------------
    // Geometry
    // ---------------------------------------------------------------

    private void RebuildGeometry()
    {
        _flickerTimer?.Stop();
        RootCanvas.Children.Clear();

        double digitH     = DigitHeight;
        double digitW     = digitH * 0.62;
        double canvasH    = digitH + 12;
        double tubePad    = 4.0;
        double scale      = digitH / 50.0;
        double baseStroke = Math.Max(2.0, digitH * 0.05);
        double depthOffset = 1.5 * scale;
        double centerX    = (digitW - 30.0 * scale) / 2.0;
        double centerY    = (canvasH - 50.0 * scale) / 2.0;

        _builtDigitW = digitW;
        _builtDigitH = digitH;

        // 1. Glass tube border
        var tubeBorder = new WpfRectangle
        {
            Width           = digitW,
            Height          = canvasH,
            RadiusX         = 8,
            RadiusY         = 8,
            Fill            = new SolidColorBrush(WpfColor.FromArgb(0xCC, 0x1A, 0x08, 0x00)),
            Stroke          = new SolidColorBrush(WpfColor.FromArgb(0x80, 0xFF, 0x8C, 0x00)),
            StrokeThickness = 1.5
        };
        Canvas.SetLeft(tubeBorder, 0);
        Canvas.SetTop(tubeBorder, 0);
        RootCanvas.Children.Add(tubeBorder);

        // 2. Glass highlight (simulates curvature reflection)
        double highlightH = canvasH * 0.18;
        var highlight = new WpfRectangle
        {
            Width   = digitW,
            Height  = highlightH,
            RadiusX = 6,
            RadiusY = 6,
            Fill    = new SolidColorBrush(WpfColor.FromArgb(0x14, 0xFF, 0xFF, 0xFF))
        };
        Canvas.SetLeft(highlight, 0);
        Canvas.SetTop(highlight, 0);
        RootCanvas.Children.Add(highlight);

        // 3. Wire mesh overlay (thin horizontal scan lines)
        for (double y = tubePad; y <= canvasH - tubePad; y += 7.0)
        {
            var wire = new Line
            {
                X1              = tubePad + 2,
                X2              = digitW - tubePad - 2,
                Y1              = y,
                Y2              = y,
                Stroke          = new SolidColorBrush(WpfColor.FromArgb(0x18, 0xFF, 0x8C, 0x00)),
                StrokeThickness = 0.5
            };
            RootCanvas.Children.Add(wire);
        }

        // 4. Build scaled geometry cache — one per digit, with depth-stacking offset baked in
        _scaledGeometries = new Geometry[10];
        for (int i = 0; i < 10; i++)
        {
            var geom = Geometry.Parse(DigitPaths[i]);
            var xform = new TransformGroup();
            xform.Children.Add(new ScaleTransform(scale, scale));
            xform.Children.Add(new TranslateTransform(centerX, centerY + i * depthOffset));
            geom.Transform = xform;
            _scaledGeometries[i] = geom;
        }

        // 5. Ghost cathode paths (all 10 digits, always visible at medium alpha)
        _ghostPaths = new Path[10];
        for (int i = 0; i < 10; i++)
        {
            var p = new Path
            {
                Data            = _scaledGeometries[i],
                Stroke          = new SolidColorBrush(WpfColor.FromArgb(0x21, 0xFF, 0x78, 0x00)),
                StrokeThickness = baseStroke,
                StrokeStartLineCap = PenLineCap.Round,
                StrokeEndLineCap   = PenLineCap.Round,
                StrokeLineJoin     = PenLineJoin.Round,
                Fill            = Brushes.Transparent
            };
            RootCanvas.Children.Add(p);
            _ghostPaths[i] = p;
        }

        // 6. Active glow paths (4 concentric stroke layers, Z-order: outermost first)
        _glowPaths = new Path[4];
        for (int layer = 0; layer < 4; layer++)
        {
            var p = new Path
            {
                Stroke          = new SolidColorBrush(GlowLayerColors[layer]),
                StrokeThickness = baseStroke * GlowWidthMultipliers[layer],
                StrokeStartLineCap = PenLineCap.Round,
                StrokeEndLineCap   = PenLineCap.Round,
                StrokeLineJoin     = PenLineJoin.Round,
                Fill            = Brushes.Transparent,
                Opacity         = GlowBaseOpacities[layer],
                Visibility      = Visibility.Collapsed
            };
            RootCanvas.Children.Add(p);
            _glowPaths[layer] = p;
        }

        // 7. Canvas and control dimensions
        RootCanvas.Width  = digitW;
        RootCanvas.Height = canvasH;
        Width             = digitW;
        Height            = canvasH;
    }
```

- [ ] **Step 2: Build**

```
dotnet build FuzzyClock.App/FuzzyClock.App.csproj
```

Expected: build succeeds. `UpdateDisplay` still references `_ghosts` which no longer exists — this will show a compile error. That's fixed in Task 3.

- [ ] **Step 3: Commit**

```bash
git add FuzzyClock.App/Controls/NixieDigit.xaml.cs
git commit -m "refactor(nixie): rewrite RebuildGeometry with PathGeometry ghost paths and glow layers"
```

---

### Task 3: Rewrite UpdateDisplay

**Files:**
- Modify: `FuzzyClock.App/Controls/NixieDigit.xaml.cs` — `UpdateDisplay()` method

Ghost paths are always at their static stroke color — no per-update change needed. `UpdateDisplay` only manages the active glow paths: swap geometry, show/hide, start/stop flicker timer.

- [ ] **Step 1: Replace UpdateDisplay**

Replace the entire `UpdateDisplay` method with:

```csharp
    // ---------------------------------------------------------------
    // Update
    // ---------------------------------------------------------------

    public void UpdateDisplay(int activeDigit)
    {
        if (_glowPaths is null || _glowPaths.Length == 0) return;

        if (activeDigit == -1)
        {
            foreach (var p in _glowPaths)
                p.Visibility = Visibility.Collapsed;
            _flickerTimer?.Stop();
            return;
        }

        var geom = _scaledGeometries[activeDigit];
        foreach (var p in _glowPaths)
        {
            p.Data       = geom;
            p.Visibility = Visibility.Visible;
        }

        _flickerCurrent   = 1.0;
        _flickerTarget    = 1.0;
        _flickerTimer?.Start();
    }
```

- [ ] **Step 2: Add the (empty) flicker tick stub so the build succeeds before Task 4 fills it in**

Add this immediately after `UpdateDisplay`:

```csharp
    private void OnFlickerTick(object? sender, EventArgs e) { }
```

- [ ] **Step 3: Build**

```
dotnet build FuzzyClock.App/FuzzyClock.App.csproj
```

Expected: build succeeds, 0 errors. The `_ghosts` / `_glowEllipse` references are now gone.

- [ ] **Step 4: Run the app and verify visually**

```
dotnet run --project FuzzyClock.App/FuzzyClock.App.csproj
```

Switch to Nixie clock mode. You should see:
- Wire-shaped digit paths instead of a bold font
- All 10 ghost cathodes faintly visible in each tube
- Active digit glow layers visible (no flicker yet — that's Task 4)
- Tube border, glass highlight, and wire mesh scan lines intact

- [ ] **Step 5: Commit**

```bash
git add FuzzyClock.App/Controls/NixieDigit.xaml.cs
git commit -m "refactor(nixie): rewrite UpdateDisplay to drive glow path geometry and visibility"
```

---

### Task 4: Implement the flicker tick

**Files:**
- Modify: `FuzzyClock.App/Controls/NixieDigit.xaml.cs` — `OnFlickerTick()` method

Replace the stub from Task 3 with the real implementation. Each tick:
1. Checks if it's time to pick a new target brightness (random interval 30–110ms)
2. Lerps `_flickerCurrent` 25% toward `_flickerTarget`
3. Multiplies each glow layer's base opacity by `_flickerCurrent`

- [ ] **Step 1: Replace the OnFlickerTick stub**

```csharp
    private void OnFlickerTick(object? sender, EventArgs e)
    {
        if (_glowPaths is null || _glowPaths.Length == 0) return;

        var now = DateTime.Now;
        if (now >= _flickerNextChange)
        {
            _flickerTarget     = Math.Clamp(1.0 + (_rng.NextDouble() * 2.0 - 1.0) * 0.18, 0.82, 1.18);
            _flickerNextChange = now + TimeSpan.FromMilliseconds(30 + _rng.NextDouble() * 80);
        }

        _flickerCurrent += (_flickerTarget - _flickerCurrent) * 0.25;

        for (int i = 0; i < 4; i++)
            _glowPaths[i].Opacity = Math.Min(1.0, GlowBaseOpacities[i] * _flickerCurrent);
    }
```

- [ ] **Step 2: Build**

```
dotnet build FuzzyClock.App/FuzzyClock.App.csproj
```

Expected: build succeeds, 0 errors.

- [ ] **Step 3: Run the app and verify visually**

```
dotnet run --project FuzzyClock.App/FuzzyClock.App.csproj
```

Switch to Nixie clock mode. You should see:
- Active digit glow layers flickering with a smooth random-walk brightness variation
- Ghost paths remain completely static (no flicker on the dim cathodes)
- Flicker stops when you switch away from Nixie mode (timer halted)
- Flicker resumes immediately when you switch back

- [ ] **Step 4: Commit**

```bash
git add FuzzyClock.App/Controls/NixieDigit.xaml.cs
git commit -m "feat(nixie): add smooth random-walk flicker to active digit glow layers"
```

---

### Task 5: Run all tests and verify no regressions

**Files:**
- Read: `FuzzyClock.Core.Tests/` and `FuzzyClock.App.Tests/` (run only, no changes)

No new tests are needed — `NixieDigit` is a visual `UserControl` with no existing unit tests. This task confirms the full test suite still passes.

- [ ] **Step 1: Run the full test suite**

```
dotnet test
```

Expected output contains:
```
Passed!  - Failed: 0, Passed: 299, Skipped: 0
```

If any tests fail, investigate before proceeding — the changes in this plan only touch `NixieDigit.xaml.cs` and should not affect any Core or App test.

- [ ] **Step 2: Final visual check — switch clock types**

Run the app. Cycle through all clock modes (Phrase → Dial → Nixie → LCD) and confirm:
- Nixie mode: wire paths, ghost cathodes, glow, flicker all working
- Other modes: no regressions; switching away from Nixie stops the flicker timer
- Resize via Settings (Small/Medium/Large size options): digit paths scale correctly, ghost depth offsets remain proportional

- [ ] **Step 3: Commit**

```bash
git commit -m "test(nixie): confirm 299 tests pass after visual overhaul"
```

---

## Self-Review

**Spec coverage:**
- ✅ Wire cathode paths replacing TextBlocks → Tasks 2–3
- ✅ 10 ghost paths at ~13% alpha (0x21) → Task 2, step 1 (ghost path creation)
- ✅ 4 active glow layers with correct multipliers and base opacities → Task 2, step 1
- ✅ Glow base colors match spec table → `GlowLayerColors` static table
- ✅ Centering formula (`centerX`, `centerY`, `depthOffset`) → Task 2, step 1
- ✅ `_scaledGeometries[10]` cache built at RebuildGeometry time → Task 2
- ✅ Geometry swapped (not rebuilt) in UpdateDisplay → Task 3
- ✅ Flicker timer at 40ms, ±18% random walk, 30–110ms retarget interval → Task 4
- ✅ Flicker lerp at 25% per tick → Task 4
- ✅ Timer starts on valid digit, stops on -1 → Task 3
- ✅ Ghost paths static (never touched by flicker tick) → Task 4
- ✅ `_flickerTimer` initialized before `RebuildGeometry()` in ctor → Task 2
- ✅ Tube border, glass highlight, wire mesh unchanged → Task 2
- ✅ `NixieClockView` untouched → no task needed

**Placeholder scan:** None found.

**Type consistency:**
- `_glowPaths` created in `RebuildGeometry()` → referenced in `UpdateDisplay()` and `OnFlickerTick()` — consistent
- `_scaledGeometries` created in `RebuildGeometry()` → consumed in `UpdateDisplay()` — consistent
- `GlowBaseOpacities[i]` used in `OnFlickerTick()` — matches static field declared in Task 1
- `_flickerTimer?.Stop()` in `RebuildGeometry()` and `UpdateDisplay()` use null-conditional — safe during construction
