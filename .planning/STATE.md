---
gsd_state_version: 1.0
milestone: v4.0
milestone_name: Proximity Ghost Mode
status: Phase 69 complete — milestone v4.0 all phases done
stopped_at: Completed 69-01-PLAN.md — GhostFadeRadiusPx SettingsWindow UI
last_updated: "2026-03-27T04:58:59.564Z"
progress:
  total_phases: 4
  completed_phases: 4
  total_plans: 4
  completed_plans: 4
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-27)

**Core value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.
**Current focus:** Phase 69 — settingswindow-ui (complete); all v4.0 phases done

## Current Position

Phase: 69 (settingswindow-ui) — COMPLETE
Plan: 1 of 1 complete

## Progress

```
Phase 66: AppSettings Foundation        [x] Complete
Phase 67: GhostModeController Extension [x] Complete
Phase 68: Opacity Wiring                [x] Complete
Phase 69: SettingsWindow UI             [x] Complete

[██████████] 100%
```

## Accumulated Context

### Key Decisions and Constraints

- SettingsWindow uses ThemeMode="Dark"; zero style leakage to MainWindow
- 414 MSTest tests (357 Core + 57 App), 0 failures as of phase 68
- ClockType enum is the single source of truth (Phrase/Dial/Nixie/Lcd already defined in ClockType.cs)
- All LCD rendering infrastructure already complete: SevenSegmentDigit, LcdClockView, SevenSegmentEncoder, LcdTimeFormatHelper, LcdSize, AppSettings LCD fields, SettingsWindow LCD stub events
- Japanese providers follow IPhraseProvider 12-bucket pattern; JapanesePhraseProvider (Classic) is the reference baseline
- LCD colon blink: use _colonVisible toggle in LcdClockView.UpdateTime() — no new DispatcherTimer
- LCD options visibility gating belongs in SetClockStyleButtonStates() alongside existing Dial Face row gating
- BackdropBorder is the sole hover backdrop; ContentBorder.Background must never be set in code
- ResolveLocaleKey(locale, style) is the single entry point for locale+style -> PhraseEngine key resolution; EnStyleKey handles English variants; SetPhraseStyle guards on fr/es/de/pl only (Japanese enabled)
- [DoNotParallelize] class required for any PhraseEngine coordinator tests referencing static PhraseEngine state
- GhostFadeRadiusPx = 80 (default), range 20-200px; Validate() clamps out-of-range to Defaults() value; init-property = 80 ensures absent JSON fields get 80 not C# int default 0
- ComputeProximityRatio uses Chebyshev distance (max(dx,dy)) for rectangular proximity halo; returns 0.0 outside zone, 1.0 inside widget
- GhostModeController timer always-running from Initialize(); ProximityChanged fires only on ratio change; WS_EX_TRANSPARENT managed entirely inside controller
- Restored fires only at ratio=0.0 after ghost activation (not every sub-1.0 tick during retreat)
- GhostFadeRadiusPx property on controller ready for Phase 69 live slider wiring
- Phase 69 complete: GhostFadeRadiusPanel indented sub-panel in Settings > Behavior tab; IsEnabled gated by Ghost Mode checkbox; GhostFadeRadiusPxChanged event wires to controller + persists; PROX-06/PROX-07 satisfied
- InternalsVisibleTo FuzzyClock.App.Tests added to FuzzyClock.App.csproj — pattern mirrors FuzzyClock.Core.csproj
- Activate() remains public for Phase 67→68 transition (D-03); Phase 68 removes the external Window_MouseEnter call site
- Phase 68 wiring: _proximityRatio field in MainWindow; ProximityChanged handler updates field + drives this.Opacity = _windowOpacity * (1.0 - ratio); _isDragging guards opacity update; contrast skip predicate adds || _proximityRatio > 0.0; Restored handler resets _proximityRatio = 0.0; Window_MouseEnter ghost activation block (lines 1013-1030) deleted; IsEnabled gate at top of OnTimerTick in controller

### Pending Todos

- Japanese Poetic and Rude phrase vocabulary is LOW confidence; native-speaker review recommended before shipping (non-blocking)

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-03-27T04:58:59.561Z
Stopped at: Completed 69-01-PLAN.md — GhostFadeRadiusPx SettingsWindow UI
Resume file: None
