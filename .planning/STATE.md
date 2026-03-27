---
gsd_state_version: 1.0
milestone: v4.0
milestone_name: Proximity Ghost Mode
status: Ready to plan
stopped_at: Phase 67 planned — 1 plan ready for execution
last_updated: "2026-03-27T03:26:34.970Z"
progress:
  total_phases: 4
  completed_phases: 1
  total_plans: 2
  completed_plans: 1
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-27)

**Core value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.
**Current focus:** Phase 66 — AppSettings Foundation (complete); GhostFadeRadiusPx field established

## Current Position

Phase: 67
Plan: Not started

## Progress

```
Phase 66: AppSettings Foundation       [x] Complete

[█████████████] 1/1 plans complete
```

## Accumulated Context

### Key Decisions and Constraints

- SettingsWindow uses ThemeMode="Dark"; zero style leakage to MainWindow
- 359 MSTest tests (314 Core + 45 App), 0 failures as of phase 66
- ClockType enum is the single source of truth (Phrase/Dial/Nixie/Lcd already defined in ClockType.cs)
- All LCD rendering infrastructure already complete: SevenSegmentDigit, LcdClockView, SevenSegmentEncoder, LcdTimeFormatHelper, LcdSize, AppSettings LCD fields, SettingsWindow LCD stub events
- Japanese providers follow IPhraseProvider 12-bucket pattern; JapanesePhraseProvider (Classic) is the reference baseline
- LCD colon blink: use _colonVisible toggle in LcdClockView.UpdateTime() — no new DispatcherTimer
- LCD options visibility gating belongs in SetClockStyleButtonStates() alongside existing Dial Face row gating
- BackdropBorder is the sole hover backdrop; ContentBorder.Background must never be set in code
- ResolveLocaleKey(locale, style) is the single entry point for locale+style -> PhraseEngine key resolution; EnStyleKey handles English variants; SetPhraseStyle guards on fr/es/de/pl only (Japanese enabled)
- [DoNotParallelize] class required for any PhraseEngine coordinator tests referencing static PhraseEngine state
- GhostFadeRadiusPx = 80 (default), range 20-200px; Validate() clamps out-of-range to Defaults() value; init-property = 80 ensures absent JSON fields get 80 not C# int default 0

### Pending Todos

- Japanese Poetic and Rude phrase vocabulary is LOW confidence; native-speaker review recommended before shipping (non-blocking)

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-03-27T03:26:34.966Z
Stopped at: Phase 67 planned — 1 plan ready for execution
Resume file: .planning/phases/67-ghostmodecontroller-extension/67-01-PLAN.md
