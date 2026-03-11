# Phase 50: WPF Segment Controls - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Build two standalone WPF UserControls: `SevenSegmentDigit` (one character slot, 7 Polygon segments, ghost effect, LcdTheme color palettes, scales with SegmentHeight) and `LcdClockView` (full HH:MM or HH:MM:SS display, LcdSize enum, 12/24hr, 1-second DispatcherTimer). Both live in `FuzzyClock.App/Controls/`. App integration (wiring into MainWindow, SettingsWindow, tray) is Phase 51 — out of scope here.

</domain>

<decisions>
## Implementation Decisions

### Segment end style
- Classic LCD diamond chamfers on all 7 segments (not just horizontal) — heavy 45° cuts giving elongated hexagon/parallelogram shape
- Applies consistently to both horizontal segments (a, d, g) and vertical segments (b, c, e, f)
- Tight inter-segment gap: ~5% of SegmentHeight between where one segment ends and the next begins
- Segment thickness: ~13% of SegmentHeight per requirements

### Colon dot design
- Two dots rendered as small rectangles — width matches segment bar width, height proportional
- Vertical positions: 1/3 from top and 2/3 from top within the digit height (aligns with gaps between top/middle/bottom segments)
- Colon slot width: ~30% of digit width (narrow, compact)
- Dot color follows the same lit/ghost rules as segments (theme lit color when colon character, ghost color as background dot)

### Digit spacing
- Zero gap between adjacent SevenSegmentDigit backgrounds inside LcdClockView — cells butt directly against each other, creating a unified LCD panel appearance
- Small internal padding inside each SevenSegmentDigit: ~5% of SegmentHeight between the segment geometry and the background rectangle edge

### Background
- Per-digit backgrounds only: each SevenSegmentDigit has its own background rectangle filled with theme background color
- No additional outer background wrapper on LcdClockView — with zero gap between digits the per-digit backgrounds read as a unified panel
- Background fully opaque (Alpha = 1.0) — classic black LCD panel look, no desktop bleed-through

### Claude's Discretion
- Exact Polygon point coordinates for the chamfered segment geometry (math to compute given SegmentHeight)
- How ghost segments are realized: theme ghost color at full opacity (not additional Opacity property reduction)
- DispatcherTimer wiring details — start/stop tied to IsVisible; UpdateTime() public method for on-demand refresh

</decisions>

<specifics>
## Specific Ideas

- All 7 segments chamfered, not just horizontals — the user wants the authentic classic LCD diamond look throughout
- Colon dots are rectangular (not round/circular) — consistency with segment shapes over softness
- Zero spacing between digit cells — the unified panel read is preferred over distinct digit separation

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SevenSegmentEncoder.Encode(char): byte` in `FuzzyClock.Core` — already implemented (Phase 49); returns 7-bit segment masks for 0–9, colon (0x80 sentinel), space (0x00); throws ArgumentException for unsupported chars
- `ClockType` enum in `FuzzyClock.App/ClockType.cs` — `Phrase/Dial/Lcd` already exists (Phase 48)
- Existing `Canvas`-based drawing pattern in `MainWindow.xaml` (DialCanvas with Line elements) — segment controls use Polygon instead of Line but same WPF drawing approach

### Established Patterns
- UserControls go in `FuzzyClock.App/` (no Controls/ subfolder exists yet — needs to be created)
- WPF `SizeToContent=WidthAndHeight` on MainWindow means LcdClockView must have a stable computed size; SegmentHeight-derived width is essential
- Dependency properties used consistently in WPF UserControls for bindable properties
- Ghost segments: dimmed color (theme ghost color) at full opacity — not `Visibility=Hidden`

### Integration Points
- Phase 51 will place `LcdClockView` as a third option alongside `PhraseText`/`DialCanvas` in `MainWindow.xaml`
- `LcdTheme` and `LcdSize` enums need to be defined in Phase 50 (they don't exist yet); `AppSettings` fields for them are Phase 51
- `FuzzyClock.App/Controls/` directory needs to be created

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 50-wpf-segment-controls*
*Context gathered: 2026-03-10*
