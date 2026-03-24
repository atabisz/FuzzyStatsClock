---
gsd_state_version: 1.0
milestone: v3.9
milestone_name: LCD Clock + Japanese Styles
status: Ready to plan
stopped_at: Completed 64-CONTEXT.md
last_updated: "2026-03-24T10:30:00.000Z"
progress:
  total_phases: 5
  completed_phases: 3
  total_plans: 4
  completed_plans: 4
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-23)

**Core value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.
**Current focus:** Phase 64 — blinking-colon

## Current Position

Phase: 64
Plan: Not started

## Progress

```
Phase 61: Japanese Phrase Providers    [x] Complete (2 plans)
Phase 62: Routing Consolidation        [x] Complete (1 plan)
Phase 63: SettingsWindow LCD UI        [x] Complete (1 plan)
Phase 64: Blinking Colon               [ ] Not started
Phase 65: Settings Persistence         [ ] Not started

[██████----] 3/5 phases complete
```

## Accumulated Context

### Key Decisions and Constraints

- SettingsWindow uses ThemeMode="Dark"; zero style leakage to MainWindow
- 355 MSTest tests (318 Core + 37 App) passing after Phase 63
- ClockType enum is the single source of truth (Phrase/Dial/Nixie/Lcd already defined in ClockType.cs)
- All LCD rendering infrastructure already complete: SevenSegmentDigit, LcdClockView, SevenSegmentEncoder, LcdTimeFormatHelper, LcdSize, AppSettings LCD fields, SettingsWindow LCD stub events
- Japanese providers follow IPhraseProvider 12-bucket pattern; JapanesePhraseProvider (Classic) is the reference baseline
- LCD colon blink: use _colonVisible toggle in LcdClockView.UpdateTime() — no new DispatcherTimer
- LCD options visibility gating belongs in SetClockStyleButtonStates() alongside existing Dial Face row gating
- BackdropBorder is the sole hover backdrop; ContentBorder.Background must never be set in code
- ResolveLocaleKey helper extracted in Phase 62; SettingsWindow exposes Japanese style selection
- [DoNotParallelize] class required for any PhraseEngine coordinator tests referencing static PhraseEngine state
- Phase 62: ResolveLocaleKey consolidates all locale-switch ladders; auto+Japanese routes to ja-style (not bare ja key)
- Phase 62: Bare "ja" key removed from PhraseEngine._providers; all Japanese routing via ja-classic/terse/poetic/rude
- Phase 62: SettingsWindow phrase style combo enabled for explicit "en" or "ja" only
- Phase 63: BtnLcd added to Clock Style rail; LCD options panel (24hr/seconds/style) visible only when LCD active
- Phase 64: _colonVisible = true initial state; toggle at top of UpdateTime(); Colon1 only; no timer guard needed

### Pending Todos

- Japanese Poetic and Rude phrase vocabulary is LOW confidence; native-speaker review recommended before shipping (non-blocking)
- STEST-01 round-trip test coverage for LCD fields: audit existing test before writing new assertions (Phase 65)

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-03-24T10:30:00.000Z
Stopped at: Completed 64-CONTEXT.md
Resume file: None
