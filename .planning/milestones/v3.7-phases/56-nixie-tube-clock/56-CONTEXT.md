# Phase 56: Nixie Tube Clock - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Add `ClockType.Nixie` as a fourth clock type — a retro HH:MM display rendered entirely from
WPF vector primitives with warm orange glowing digits, ghost cathodes, glass tube borders, and
wire mesh overlays. No seconds, 12hr only. No new settings options in v3.4 (color themes deferred).

</domain>

<decisions>
## Implementation Decisions

### Ghost Cathode Visibility
- Opacity: very faint — around 8–12% — whisper-thin shadows that confirm presence without competing with the active digit
- Proximity fade: digits numerically adjacent (±1, ±2) to the active digit appear slightly less faint, as if partially ionized; remaining digits at base opacity
- No specific real-world tube reference — warm orange glow is the aesthetic target

### Colon / Separator Style
- Two glowing orange dots stacked vertically between the hour and minute digit pairs
- Dots styled like a Nixie neon indicator element, sized proportionally to digit height
- Whether dots get their own glass tube border or float freely: Claude's discretion (pick based on visual balance)

### Digit Size & Font Size Scaling
- Nixie digit size scales with the widget's Font Size setting (Small/Medium/Large), matching LCD behavior
- Reuse the existing `FontSizeToLcdSize()` breakpoints: 16 → Small, 24 → Medium, 32 → Large
- `NixieDigit` height values may differ from LCD segment height, but the three size tiers are identical

### Settings Panel UX
- Nixie button in the Clock Style row labeled **"Nixie"** — consistent with "Phrase", "Dial", "LCD"
- When Nixie is selected, hide: Phrase Style row, Dial Options row, LCD Format row, LCD Seconds row, LCD Style row
- No placeholder/disabled Nixie options row in v3.4 — clean selection with no extra rows
- System tray Clock Type submenu item labeled **"Nixie"** — matches Settings button label

### Claude's Discretion
- Exact pixel proportions for digit and tube geometry
- Colon dot tube border vs floating (pick based on visual balance)
- Exact opacity values within the 8–12% faint range for ghost cathodes
- Proximity fade delta (how much brighter ±1 and ±2 digits are vs base)
- Wire mesh / anode grid texture implementation details

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `LcdClockView.xaml/.cs`: Container UserControl pattern to follow exactly — `DispatcherTimer`, `IsVisibleChanged` starts/stops timer, `DependencyProperty` for size/color, `UpdateTime()` public method
- `SevenSegmentDigit.xaml/.cs`: Digit UserControl pattern — `RebuildGeometry()` + `UpdateSegments()` on property change, `Canvas` with explicit `Width`/`Height`, brush cache fields
- `FontSizeToLcdSize()` in `MainWindow.xaml.cs`: Existing mapping method to reuse for Nixie size tier
- `SetClockType()` in `MainWindow.xaml.cs`: Switch/case to extend with `ClockType.Nixie` case
- `SetClockStyleButtonStates()` in `SettingsWindow.xaml.cs`: Needs `BtnNixie` tag assignment and row visibility for Nixie

### Established Patterns
- `UIElement.Effect` (BlurEffect, DropShadowEffect) is FORBIDDEN in the Nixie subtree — `AllowsTransparency="True"` renders Effects as black rectangles; all glow via stacked `RadialGradientBrush`
- `Canvas` requires explicit `Width`/`Height` in a `SizeToContent="WidthAndHeight"` window — follow `SevenSegmentDigit.RebuildGeometry()` pattern
- `ClockType` enum: add `Nixie` as 4th value — JSON serialized as string via `JsonStringEnumConverter`; no migration code needed
- `AppSettings` snapshot pattern: `ClockType` is the only Nixie-related setting for v3.4 (no `NixieStyle` yet)

### Integration Points
- `ClockType.cs` — add `Nixie` enum value
- `MainWindow.xaml` — add `<controls:NixieClockView x:Name="NixieView" .../>` alongside LcdView
- `MainWindow.xaml.cs` — extend `SetClockType()`, `ApplySettings()` (5 clock-type touch points), timer tick visibility guard, `FontSizeToNixieSize()` or reuse existing mapping
- `SettingsWindow.xaml` — add `BtnNixie` button to Clock Style row, add Nixie to row Grid layout
- `SettingsWindow.xaml.cs` — extend `SetClockStyleButtonStates()`, add `BtnNixie_Click` handler, fire `ClockTypeChanged`
- `TrayMenuBuilder.cs` — add `_nixieClockItem` alongside phrase/dial/lcd items; update `RefreshState()` checked state

</code_context>

<specifics>
## Specific Ideas

- Warm orange glow is the primary aesthetic — no specific IN-14/IN-18 tube reference
- Ghost cathodes should "confirm they are there" without being distracting — whisper presence
- The proximity fade on adjacent ghost digits adds depth and authenticity without complexity

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. Color theme variants (NIXIE-X) and blinking colon (NIXIE-X) are already captured in REQUIREMENTS.md as v5+ deferred items.

</deferred>

---

*Phase: 56-nixie-tube-clock*
*Context gathered: 2026-03-11*
