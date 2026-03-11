---
gsd_state_version: 1.0
milestone: v3.4
milestone_name: Personalities & Nixie
status: in_progress
stopped_at: Completed 55-01-PLAN.md
last_updated: "2026-03-11T08:29:56Z"
last_activity: 2026-03-11 — Phase 55 Plan 01 complete (provider classes)
progress:
  total_phases: 3
  completed_phases: 0
  total_plans: 7
  completed_plans: 1
  bar: "[█░░░░░░░░░] 14%"
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-11)

**Core value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.
**Current focus:** v3.4 Phase 55 — Phrase Personalities

## Current Position

Phase: 55 (in progress)
Plan: 01 complete — 02 next
Status: Plan 01 complete; provider classes written; wiring (Plan 02) next
Last activity: 2026-03-11 — Phase 55 Plan 01 complete (7 provider files created/rewritten)

Progress: [█░░░░░░░░░] 1/7 plans complete

## Performance Metrics

- v3.3 shipped: 248 tests passing, 0 failures
- v3.4 target: >= 265 tests (net +17 from new providers and Nixie/dial coverage)
- Test floor: 248 (zero regressions)
- 55-01: 3 min, 2 tasks, 8 files

## Accumulated Context

### Decisions (carried forward)

- `ClockType` enum: Phrase/Dial/Lcd/Nixie; JSON serialized as string via `JsonStringEnumConverter`; adding `Nixie` as 4th value does not require migration code
- `IPhraseProvider` bucket table pattern: one class per style; register in `PhraseEngine._providers`; update `SettingsWindow` ComboBox item in the same commit
- WPF `UIElement.Effect` (BlurEffect, DropShadowEffect) is forbidden in the Nixie subtree — `AllowsTransparency="True"` renders Effects as black rectangles; all glow must use stacked `RadialGradientBrush`
- `NixieClockView` + `NixieDigit` UserControls follow the `LcdClockView` + `SevenSegmentDigit` structural pattern exactly
- `Canvas` requires explicit `Width`/`Height` in a `SizeToContent="WidthAndHeight"` window — follow `SevenSegmentDigit.RebuildGeometry()` pattern
- `AppSettings.DialShape` string property ("Round"/"Oval"); must have `= "Round"` init default, `Validate()` guard, and `Defaults()` entry to handle upgrade from v3.3 settings.json
- `UpdateDialDisplay()` literal `40.0` center must be refactored to `DialCanvas.Width / 2` before adding any shape or size options
- RudePhraseProvider rewritten in-place (same class, same en-rude locale key); only bucket strings and specials replaced with Rude 2.0 internet-slang vocabulary (WTF/bruh/dafaq/smh/ngl/lmao/rn/literally/tf)
- ShakespearePhraseProvider resolves {ho} token before {h} to avoid partial substring replacement in templates containing both tokens

### Touch Points Per Feature

**Phrase Personalities (Phase 55) — 6 touch points per new style:**
1. New `IPhraseProvider` class in `FuzzyClock.Core/` (DONE in Plan 01)
2. Registration in `PhraseEngine._providers` dictionary
3. New `ComboBoxItem` in `SettingsWindow.xaml` `CmbPhraseStyle`
4. All 4 locale-switch sites in `MainWindow.xaml.cs` (2x ApplySettings, SetPhraseStyle, SetLanguage)
5. `PopulateControls()` PhraseStyle switch in `SettingsWindow.xaml.cs`
6. `SettingsService.Validate()` valid styles list (optional but consistent with TextStyle pattern)

**Nixie Clock (Phase 56) — must update all 3 ClockType sites in MainWindow before building UserControl:**
1. `ClockType.Nixie = 3` added to `ClockType.cs`
2. All 3 `if/else if` chains in `MainWindow.xaml.cs` (ApplySettings, timer Tick, SetClockType)
3. `NixieClockView` element in `MainWindow.xaml`
4. Nixie button in `SettingsWindow.xaml` Clock Style row
5. Nixie item in `TrayMenuBuilder.cs` Clock Type submenu (same commit as SettingsWindow)

**Dial Enhancements (Phase 57) — refactor before adding options:**
1. Refactor `UpdateDialDisplay()` to derive center from `DialCanvas.Width / 2` (pitfall mitigation first)
2. `AppSettings.DialShape` string property + `Validate()` + `Defaults()`
3. Round/oval radio buttons in `SettingsWindow.xaml` Appearance tab
4. `ApplyDialShape()` in `MainWindow` with size lookup table (Small=80px, Medium=110px, Large=150px)

### Pending Todos

None.

### Blockers/Concerns

- Phase 56: Nixie visual parameter tuning (gradient stop offsets, ghost opacity, tile density, glow spread) must be validated at runtime; budget a visual-review step within the phase plans
- Phase 56: SettingsWindow Clock Style row at 4 buttons has not been stress-tested at 125% DPI; visual review required before marking done
- Phase 46 carry-over: Japanese phrase naturalness is medium confidence; native-speaker review recommended (not a v3.4 blocker)
- Carry-over: ResetToDefaults() does not reset `_currentPhraseStyle` or `_currentPhraseLocale` — minor inconsistency, not a v3.4 requirement violation

## Session Continuity

Last session: 2026-03-11
Stopped at: Completed 55-01-PLAN.md
Resume: `/gsd:execute-phase 55 02`
