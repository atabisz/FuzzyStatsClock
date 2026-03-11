# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

---

## Milestone: v3.3 — LCD Clock

**Shipped:** 2026-03-11
**Phases:** 7 (48–54) | **Plans:** 13 | **Sessions:** ~4

### What Was Built
- `SevenSegmentEncoder` static class in `FuzzyClock.Core` — 7-bit bitmask lookup for 12 characters, 13 unit tests, zero WPF dependencies
- `SevenSegmentDigit` WPF UserControl — 7 Polygon segments, ghost effect via `GhostColor` DP (Transparent sentinel = auto-compute 15%), `SegmentStyle` DP with Classic/Bold geometry variants
- `LcdClockView` WPF UserControl — 8 digit slots (HH:MM[:SS]), 1-second DispatcherTimer, `BgColor`/`GhostColor`/`SegmentStyle` propagation DPs
- Full 3-way clock switching in MainWindow, SettingsWindow (collapsible LCD panel), and tray submenu
- 17 LCD color themes via `LcdPalette.Get()` static factory; WrapPanel swatch row in Settings replaces ComboBox
- `ClockType` enum replacing `bool DialMode` across all layers with JSON migration

### What Worked
- **Incremental DPs**: Adding `BgColor`, `GhostColor`, `SegmentStyle` as Dependency Properties kept the architecture clean — MainWindow only sets high-level properties and the control cascade handles everything
- **Ghost sentinel pattern**: `Colors.Transparent` as A=0 sentinel for auto-compute preserved backward compatibility for Dark mode while enabling Paper/Silver explicit ghosts
- **Geometry cache pattern**: `_builtDigitW`, `_builtColonW`, `_builtCanvasH` fields set in `RebuildGeometry()` and consumed by `UpdateSegments()` avoided stale hardcoded values after style changes
- **Audit-driven cleanup**: Running `gsd:audit-milestone` before completion surfaced 3 real gaps (LcdSize persistence, SettingsSnapshot, README table) that became Phase 53 — clean execution

### What Was Inefficient
- **Stale BAML/obj files**: `BG1002: File cannot be found` build errors after XAML edits required `dotnet build --no-incremental` multiple times — a known WPF incremental build fragility
- **Multi-color brush cache miss**: Initial `UpdateSegments()` brush rebuild only tracked `LitColor` changes; adding `BgColor` and `GhostColor` required adding `_lastBgColor` and `_lastGhostColor` sentinel fields — should have been caught at design time
- **Silver style required geometry rework**: First implementation was color-only; user feedback drove the `SegmentStyle` Bold geometry variant — the visual distinction requirement was under-specified in the research phase

### Patterns Established
- **DP propagation pattern**: Container UserControl (LcdClockView) exposes DPs that propagate to child UserControls (SevenSegmentDigit) in `PropertyChanged` callbacks — clean single-assignment pattern
- **Geometry cache fields on UserControl**: When a UserControl rebuilds geometry in one method and uses values in another, cache the computed dimensions as fields rather than recomputing
- **`_lastXxx` sentinel fields for brush caching**: Only rebuild `SolidColorBrush` objects when the relevant color(s) change; track all input colors to the final effective color (including computed values)
- **LcdStyle string DP** (not enum): For 2–3 geometry variants, a string DP avoids a new enum type while remaining explicit

### Key Lessons
1. **Specify visual character up front**: "Silver LCD" needed fundamentally different geometry (Bold style), not just colors. Research/discussion phases should ask "is this purely a color change or a geometry change?"
2. **WPF incremental build is fragile for XAML**: Expect `--no-incremental` to be needed after structural XAML changes. Consider adding it as a standard step in the execute-phase workflow for WPF projects.
3. **Ghost color is a computed output, not an input**: The 15% formula was right, but making it an explicit DP with a sentinel allows themed overrides without breaking the default case.

### Cost Observations
- Model mix: ~100% sonnet (balanced profile)
- Sessions: ~4 across 2 days
- Notable: Phase 54 (17 themes + swatch UI + 3 tests) executed in 3 plans averaging ~3 min each — fastest phase of the milestone

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v3.2 | 7 | 16 | Introduced Settings window, modeless pattern, SettingsSnapshot |
| v3.3 | 7 | 13 | First hardware-simulation UI (WPF-drawn segments); audit-driven tech debt phase |

### Cumulative Quality

| Milestone | Tests | Notes |
|-----------|-------|-------|
| v3.1 | 122 | DateFormatter extracted to Core |
| v3.2 | 224 | +102 multilingual provider tests |
| v3.3 | 248 | +24 LCD field, format, and theme tests |

### Top Lessons (Verified Across Milestones)

1. **Audit before completing**: `gsd:audit-milestone` consistently finds 2–5 real gaps missed during execution. Phase 53 (tech debt cleanup) pattern should be standard at every major milestone.
2. **WPF XAML + incremental build**: `--no-incremental` resolves stale BAML errors reliably. Do not chase the error — just rebuild clean.
3. **Core-layer pure classes pay off**: `SevenSegmentEncoder` in `FuzzyClock.Core` (like `DateFormatter`, `UptimeFormatter`, `DialGeometry`) is trivially testable and has zero WPF coupling.
