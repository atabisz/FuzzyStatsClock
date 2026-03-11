---
phase: 50-wpf-segment-controls
plan: 01
subsystem: ui
tags: [wpf, xaml, seven-segment, lcd, polygon, geometry, usercontrol]

# Dependency graph
requires:
  - phase: 49-sevensegmentencoder
    provides: SevenSegmentEncoder.Encode(char) in FuzzyClock.Core
provides:
  - LcdTheme enum + LcdPalette.Get() with exact hex Lit/Ghost/Background colors for 5 themes
  - LcdSize enum + LcdSizeMap.ToSegmentHeight() mapping Small=32, Medium=48, Large=64
  - LcdTimeFormatHelper.FormatTime() for 12hr/24hr with/without seconds
  - SevenSegmentDigit WPF UserControl with 7 chamfered Polygon segments, ghost effect, colon slot
affects:
  - 50-wpf-segment-controls (Plan 02 — LcdClockView composes SevenSegmentDigit)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - WPF UserControl with all geometry in code-behind (no XAML Polygon elements)
    - Chamfered 6-point Polygon segments for LCD digit rendering
    - WPF/WinForms type aliases (WpfUserControl, WpfRectangle, WpfPoint) to resolve ambiguity in mixed UseWPF+UseWindowsForms projects
    - Brush caching via _lastTheme sentinel field; recreate only on theme change
    - Ghost effect via fill color swap (not Opacity or Visibility=Hidden)

key-files:
  created:
    - FuzzyClock.App/LcdTheme.cs
    - FuzzyClock.App/LcdSize.cs
    - FuzzyClock.App/LcdTimeFormatHelper.cs
    - FuzzyClock.App/Controls/SevenSegmentDigit.xaml
    - FuzzyClock.App/Controls/SevenSegmentDigit.xaml.cs
  modified: []

key-decisions:
  - "WPF/WinForms type aliases used (WpfUserControl, WpfRectangle, WpfPoint) to resolve ambiguous references in the mixed UseWPF+UseWindowsForms project"
  - "ch (chamfer) passed as explicit parameter to geometry helpers rather than computed from thickness inside helpers, for clarity"
  - "colonW = digitW * 0.30; background width also updated when switching to colon width"

patterns-established:
  - "Segment geometry: t=h*0.13, gap=h*0.05, pad=h*0.05, bw=h*0.6-2*pad, vhalf=(h-3*t-4*gap)/2, digitW=h*0.6"
  - "Chamfered polygon: 6-point hexagonal shape, ch=t*0.5"
  - "Ghost segments: Visibility=Visible at ghost fill color; only colon slot hides the 7 Polygons"

requirements-completed: [F3, F4]

# Metrics
duration: 10min
completed: 2026-03-10
---

# Phase 50 Plan 01: SevenSegmentDigit Support Types and UserControl Summary

**LcdTheme/LcdSize/LcdTimeFormatHelper support types plus SevenSegmentDigit WPF UserControl with 7 chamfered Polygon segments rendered in code-behind, ghost color fills, and colon slot support**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-10T02:29:44Z
- **Completed:** 2026-03-10T02:40:00Z
- **Tasks:** 2
- **Files modified:** 5 (all created new)

## Accomplishments

- Three support types created in FuzzyClock.App namespace: LcdTheme (5 themes with exact hex colors), LcdSize (3 sizes mapped to pixel heights), LcdTimeFormatHelper (12hr/24hr format with/without seconds)
- SevenSegmentDigit UserControl built with full chamfered Polygon segment geometry in code-behind — no XAML Polygon declarations
- Ghost effect implemented via fill color swap (per spec), not Opacity reduction or Visibility=Hidden
- Colon slot narrows canvas to 30% digit width and shows two lit rectangular dots instead of segments
- All 237 prior tests remain green after new files added

## Task Commits

Each task was committed atomically:

1. **Task 1: Define LcdTheme, LcdSize, and LcdTimeFormatHelper** - `c205501` (feat)
2. **Task 2: Build SevenSegmentDigit UserControl** - `763d8ea` (feat)

## Files Created/Modified

- `FuzzyClock.App/LcdTheme.cs` - LcdTheme enum (Green/Amber/Blue/Teal/Red) + LcdPalette.Get() with Lit/Ghost/Background color tuples
- `FuzzyClock.App/LcdSize.cs` - LcdSize enum (Small/Medium/Large) + LcdSizeMap.ToSegmentHeight() mapping 32/48/64
- `FuzzyClock.App/LcdTimeFormatHelper.cs` - FormatTime(DateTime, bool, bool) covering all four 12hr/24hr x seconds combinations; leading space for single-digit 12hr hours
- `FuzzyClock.App/Controls/SevenSegmentDigit.xaml` - Minimal UserControl XAML with root Canvas only
- `FuzzyClock.App/Controls/SevenSegmentDigit.xaml.cs` - Full implementation: 3 DependencyProperties, RebuildGeometry() with 7 chamfered Polygons + 2 dot Rectangles + background, UpdateSegments() with SevenSegmentEncoder integration

## Decisions Made

- WPF/WinForms type aliases added (`WpfUserControl`, `WpfRectangle`, `WpfPoint`) to resolve ambiguous references caused by the project using both `UseWPF=true` and `UseWindowsForms=true`. This is the minimal-invasive fix that keeps all existing code unchanged.
- `ch` (chamfer size = thickness * 0.5) passed explicitly to geometry helpers rather than recomputed inside them, keeping the helper signatures self-contained.
- Background rectangle width updated alongside RootCanvas.Width when switching to colon slot, so the background never bleeds past the narrowed canvas.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Resolved WPF/WinForms type ambiguity (UserControl, Rectangle, Point)**
- **Found during:** Task 2 (Build SevenSegmentDigit UserControl)
- **Issue:** Project uses both `UseWPF=true` and `UseWindowsForms=true`. `UserControl`, `Rectangle`, and `Point` are all ambiguous between `System.Windows.*` and `System.Drawing.*`/`System.Windows.Forms.*` namespaces — build failed with CS0104 errors.
- **Fix:** Added using aliases at the top of SevenSegmentDigit.xaml.cs: `WpfUserControl = System.Windows.Controls.UserControl`, `WpfRectangle = System.Windows.Shapes.Rectangle`, `WpfPoint = System.Windows.Point`. All field declarations and `new` expressions updated to use the aliases.
- **Files modified:** FuzzyClock.App/Controls/SevenSegmentDigit.xaml.cs
- **Verification:** `dotnet build` succeeds with 0 errors, 0 warnings
- **Committed in:** `763d8ea` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — type ambiguity blocking build)
**Impact on plan:** Necessary fix caused by the existing mixed WPF+WinForms project configuration. No scope creep; approach is idiomatic C# and does not change behavior.

## Issues Encountered

None beyond the type ambiguity auto-fix above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- SevenSegmentDigit UserControl is ready to be composed by LcdClockView (Plan 02)
- The type alias pattern (`WpfRectangle`, `WpfPoint`, etc.) should be applied to any future WPF controls added to this project
- 237 tests all pass; no blockers

---
*Phase: 50-wpf-segment-controls*
*Completed: 2026-03-10*

## Self-Check: PASSED

- LcdTheme.cs: FOUND
- LcdSize.cs: FOUND
- LcdTimeFormatHelper.cs: FOUND
- SevenSegmentDigit.xaml: FOUND
- SevenSegmentDigit.xaml.cs: FOUND
- 50-01-SUMMARY.md: FOUND
- Commit c205501: FOUND
- Commit 763d8ea: FOUND
