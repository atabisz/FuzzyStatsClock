# Phase 54: Additional LCD Themes - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Expand the LCD theme palette from 5 to 17 themes. Add 12 new `LcdTheme` enum values, corresponding `LcdPalette.Get()` cases, replace the SettingsWindow ComboBox with a swatch row (WrapPanel), update AppSettings round-trip tests, and update the README. The segment geometry, `LcdClockView`, `SevenSegmentDigit`, and app wiring are untouched.

</domain>

<decisions>
## Implementation Decisions

### New themes to add (12 total)

**Retro tech (phosphor/tube aesthetics):**
- `Vfd` — VFD blue-green phosphor (~#14F0A0 lit, dark teal ghost, near-black bg)
- `Nixie` — Deep warm orange-amber, richer than the existing Amber (~#FF6000 lit, deep brown ghost, near-black bg)

**High contrast / neon:**
- `Magenta` — Hot pink-magenta segments (~#FF00CC lit)
- `Purple` — Electric violet (~#CC00FF lit)
- `Cyan` — Distinct from existing Blue and Teal (~#00FFFF lit)
- `Lime` — Yellow-green / chartreuse (~#CCFF00 lit)

**Muted / pastel:**
- `Cream` — Warm white / off-white segments (~#FFEEDD lit, very dark warm bg)
- `Ice` — Pale cold silver-blue (~#B0D8FF lit)
- `Mint` — Desaturated soft green (~#66FFCC lit)
- `Lavender` — Pale purple-grey (~#CC99FF lit)

**Inverted (light background + dark segments):**
- `LcdGrey` — Classic calculator LCD: dark olive-grey segments (~#2A3020) on light grey bg (~#C8D0C0); ghost = medium grey (~#8A9080)
- `Paper` — Clean e-ink look: near-black segments (~#1A1A18) on near-white bg (~#F0F0E8); ghost = medium cool grey (~#9090A0)

### Total theme count
- 5 existing + 12 new = **17 themes total**
- Existing 5 are unchanged in position and value

### Inverted theme ghost behavior
- Ghost segments on inverted themes are a lighter shade of the dark segment color (same hue, less contrast against the light bg)
- Unlit segments are faintly visible — consistent with how dark themes handle ghost (dimmed, not hidden)

### Theme selection UX — replace ComboBox with swatch row
- Replace `CmbLcdTheme` ComboBox in SettingsWindow with a `WrapPanel` of colored swatches
- Each swatch: small square (same size as accent color swatches, ~28×28px) filled with the theme's **Lit color** as the background
- Active swatch has a selection ring (same `Border` ring pattern as accent color swatches already in the app)
- WrapPanel arrangement: swatches wrap to multiple lines as needed — no fixed column count
- Tooltip on each swatch showing the theme name (for accessibility)
- `LcdThemeChanged` event continues to fire on click — same wiring as before, just new source control
- The tray menu "LCD Theme" submenu (if it exists) is unaffected — update to include new theme names

### Naming convention for enum values
- Single-word PascalCase: `Vfd`, `Nixie`, `Magenta`, `Purple`, `Cyan`, `Lime`, `Cream`, `Ice`, `Mint`, `Lavender`, `LcdGrey`, `Paper`
- Keep existing names unchanged: `Green`, `Amber`, `Blue`, `Teal`, `Red`

### Test and README updates
- Add round-trip AppSettings tests for representative new themes (at minimum `Vfd`, `LcdGrey`, `Paper` — covering retro, inverted light, inverted white)
- Update README LCD theme table with all 17 themes
- Update test count

### Claude's Discretion
- Exact hex values for all 12 new themes (guidance above; Claude picks what looks best on-screen)
- Ghost and background colors for each new dark theme (follow same relative-darkness ratio as existing themes)
- Swatch tooltip wording
- Whether to add a thin dark border on inverted swatches so they're visible against the light SettingsWindow background

</decisions>

<specifics>
## Specific Ideas

- VFD should feel like old Casio/Futaba VFD displays — blue-green phosphor glow, not just a teal variant
- Nixie-adjacent is about the warm orange glow color, not Nixie digit geometry (Nixie geometry is backlog)
- Inverted themes mimic real physical LCD panels in daylight
- Swatch UX matches the existing accent color picker in SettingsWindow — consistent interaction model

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `LcdTheme` enum in `FuzzyClock.App/LcdTheme.cs` — extend with 12 new values
- `LcdPalette.Get()` switch expression — add 12 new cases
- `SettingsWindow.xaml` accent color swatch pattern (`Border`+`Border`+`MouseLeftButtonDown`) — replicate for LCD theme swatches
- `SetActiveSwatch()` helper in `SettingsWindow.xaml.cs` — reuse or adapt for LCD theme swatch ring management
- `LcdThemeChanged` event (`Action<LcdTheme>`) in `SettingsWindow.xaml.cs` — unchanged, just fired from new swatch controls instead of ComboBox handler
- `AppSettingsTests` — add round-trip cases for 3+ new enum values

### Established Patterns
- `Border x:Name="Ring{X}"` / `Border x:Name="Swatch{X}"` nesting for swatch+ring selection pattern — already in SettingsWindow
- `JsonStringEnumConverter` on `LcdTheme` — new enum values serialize by name automatically, no migration needed
- Ghost segments rendered at ghost color at full opacity (not via Opacity property) — inverted themes follow same approach

### Integration Points
- `SettingsWindow.xaml` LCD theme row (rows 4–4): replace `ComboBox` with `WrapPanel` of swatches; update `SetLcdRowsVisible()` to cover new swatch container
- `SettingsWindow.PopulateControls()`: replace `CmbLcdTheme.SelectedIndex` assignment with swatch ring activation
- `SettingsWindow.xaml.cs`: replace `CmbLcdTheme_SelectionChanged` with per-swatch click handlers
- No changes needed to `LcdClockView`, `SevenSegmentDigit`, `MainWindow`, `TrayMenuBuilder`, or `AppSettings` structure (only the enum and palette)

</code_context>

<deferred>
## Deferred Ideas

- Nixie-style digit geometry rendering — already in backlog, not addressed here
- Custom theme color picker (user-defined lit/ghost/bg) — future phase

</deferred>

---

*Phase: 54-additional-lcd-themes*
*Context gathered: 2026-03-11*
