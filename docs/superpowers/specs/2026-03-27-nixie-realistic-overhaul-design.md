# NixieDigit Visual Overhaul — Design Spec

**Date:** 2026-03-27
**Status:** Approved

## Goal

Replace the current font-based nixie digit rendering with wire-cathode path geometry, multi-layer glow, medium-opacity ghost digits, and a smooth flicker animation — making `NixieDigit` look like a real neon-filled tube instead of a computer label.

## Decisions

| Aspect | Decision |
|---|---|
| Digit rendering | WPF `PathGeometry` stroke paths (no fill, no font) |
| Glow technique | Multi-layer concentric strokes — no `UIElement.Effect` |
| Ghost digits | All 10 cathode paths visible at ~13% alpha (medium) |
| Flicker | ±18% brightness, smooth random walk, 40ms `DispatcherTimer` |

---

## Section 1 — Path Geometry

### Coordinate space

All 10 digit shapes are defined in a **30×50 unit space** as WPF miniature path language strings (`M`, `L`, `C`, `A`, `Z`). At `RebuildGeometry()` time each string is parsed via `Geometry.Parse()` and stored in `_baseGeometries[10]`. A `ScaleTransform(scale, scale)` where `scale = DigitHeight / 50.0` is applied via a `TransformGroup` on each `Path` element — no recomputing of coordinates on resize.

### Static digit path table (`DigitPaths[10]`)

Defined as a `private static readonly string[]` on `NixieDigit`:

```
0  →  ellipse via arc:  M 15,3 A 11,22 0 0 1 26,25 A 11,22 0 0 1 15,47 A 11,22 0 0 1 4,25 A 11,22 0 0 1 15,3 Z
1  →  M 10,9 L 14,5 L 14,49
2  →  M 6,13 C 6,5 26,5 26,15 C 26,24 6,32 6,49 L 26,49
3  →  M 6,10 C 6,5 26,5 26,16 C 26,23 17,27 26,30 C 26,42 6,50 6,46
4  →  M 23,5 L 6,31 L 27,31 M 23,5 L 23,49
5  →  M 26,5 L 6,5 L 6,27 C 16,23 26,24 26,38 C 26,49 6,50 6,46
6  →  M 24,7 C 9,2 4,15 4,29 C 4,41 9,49 17,49 C 25,49 27,41 27,33 C 27,25 21,23 15,25 C 9,27 4,34 4,45
7  →  M 5,5 L 26,5 L 12,49
8  →  M 16,27 C 6,27 6,5 16,5 C 26,5 26,27 16,27 C 6,27 6,49 16,49 C 26,49 26,27 16,27
9  →  M 5,20 C 5,9 9,4 16,4 C 23,4 27,11 27,19 C 27,27 22,31 16,30 C 10,29 5,23 5,20 M 27,19 C 27,39 22,49 12,49
```

Path data may be fine-tuned during implementation for visual quality; the coordinate space and scaling contract are fixed.

---

## Section 2 — Rendering Elements

### Ghost paths (`_ghostPaths[10]`)

- One `Path` per digit, `Fill = Transparent`, `StrokeThickness = baseStroke` (computed as `DigitHeight * 0.05`, minimum 2px)
- `Stroke = SolidColorBrush(Color.FromArgb(0x21, 0xFF, 0x78, 0x00))` — ~13% alpha warm orange, static
- `StrokeStartLineCap = StrokeEndLineCap = StrokeLineJoin = Round`
- Transform: `ScaleTransform(scale, scale)` + `TranslateTransform(centerX, centerY + i * depthOffset)` where `depthOffset = 1.5 * scale`, simulating 3D cathode stacking depth
- All 10 ghosts always visible including the active digit's ghost (the physical wire is always present)

### Active glow paths (`_glowPaths[4]`)

Four `Path` elements sharing the active digit's geometry, drawn in Z-order outermost-first:

| Index | StrokeThickness | Base alpha | Color |
|---|---|---|---|
| 0 — halo | `baseStroke × 3.6` | 4% | `rgba(255, 120, 0, a)` |
| 1 — mid glow | `baseStroke × 2.4` | 10% | `rgba(255, 140, 0, a)` |
| 2 — inner bloom | `baseStroke × 1.6` | 30% | `rgba(255, 160, 0, a)` |
| 3 — core | `baseStroke × 1.0` | 100% | `rgb(255, ~185, ~10)` (warm cream) |

These 4 paths are added to `RootCanvas` above all ghost paths. Their `.Data` is swapped to `_scaledGeometries[activeDigit]` in `UpdateDisplay()`. They collapse (`Visibility.Collapsed`) when `activeDigit == -1`.

The existing `Ellipse _glowEllipse` is **removed**. The existing `TextBlock[] _ghosts` is **removed**.

---

## Section 3 — Flicker System

### Fields

```csharp
private readonly DispatcherTimer _flickerTimer;
private double _flickerCurrent = 1.0;
private double _flickerTarget  = 1.0;
private DateTime _flickerNextChange = DateTime.MinValue;
private static readonly Random _rng = new();
```

### Algorithm (per 40ms tick)

```
if DateTime.Now >= _flickerNextChange:
    _flickerTarget = 1.0 + (_rng.NextDouble() * 2 - 1) * 0.18
    clamp _flickerTarget to [0.82, 1.18]
    _flickerNextChange = DateTime.Now + 30ms + _rng.NextDouble() * 80ms

_flickerCurrent += (_flickerTarget - _flickerCurrent) * 0.25   // lerp

update _glowPaths[0..3] stroke colors by multiplying base alphas by _flickerCurrent
```

Ghost paths are never touched by the flicker tick.

### Lifecycle

- `UpdateDisplay(digit >= 0)` → `_flickerTimer.Start()`
- `UpdateDisplay(-1)` → `_flickerTimer.Stop()`; all glow paths collapsed
- No `IsVisibleChanged` handler needed on `NixieDigit` — `NixieClockView.OnIsVisibleChanged` already stops/starts the 1s timer, which drives `UpdateTime()` → `UpdateDisplay()` on each digit

---

## Section 4 — `RebuildGeometry()` Changes

Called on construction and on `DigitHeight` change (existing behavior unchanged).

**Removes:** TextBlock loop, glow Ellipse creation
**Adds:**
1. Parse `DigitPaths[i]` → `_baseGeometries[i]` (10 Geometry objects)
2. Build `_scaledGeometries[i]` = geometry with `ScaleTransform` + `TranslateTransform` baked per digit index
3. Create 10 `_ghostPaths` with static stroke, add to canvas
4. Create 4 `_glowPaths` with initial `Visibility.Collapsed`, add to canvas above ghosts
5. Keep tube border, glass highlight, wire mesh overlay — unchanged

**Wire mesh overlay** (thin horizontal scan lines) is kept as-is — it adds cathode grid texture over everything.

---

## Section 5 — `UpdateDisplay()` Changes

```
for i in 0..9:
    _ghostPaths[i] already has static stroke — no change needed per update

if activeDigit == -1:
    collapse all _glowPaths
    _flickerTimer.Stop()
    return

geometry = _scaledGeometries[activeDigit]
for each p in _glowPaths:
    p.Data = geometry
    p.Visibility = Visible

_flickerTimer.Start()
ApplyFlickerColors(1.0)   // reset to base brightness immediately
```

---

## Files Changed

| File | Change |
|---|---|
| `FuzzyClock.App/Controls/NixieDigit.xaml.cs` | Full rewrite of `RebuildGeometry()` and `UpdateDisplay()`; new fields for flicker; new static path table |
| `FuzzyClock.App/Controls/NixieDigit.xaml` | No change |
| All other files | No change |

## Out of Scope

- NixieClockView changes
- New unit tests (NixieDigit is a visual UserControl with no existing tests)
- Settings for flicker intensity (fixed at ±18%)
- Colon dot styling changes
