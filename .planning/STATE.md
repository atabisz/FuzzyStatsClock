---
gsd_state_version: 1.0
milestone: v4.1
milestone_name: Polish & Phrases
status: Defining requirements
last_updated: "2026-03-31T00:00:00.000Z"
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-31 after v4.1 milestone start)

**Core value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.
**Current focus:** v4.1 Polish & Phrases — defining requirements

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-03-31 — Milestone v4.1 started

## Progress

```
v4.1 Polish & Phrases — DEFINING REQUIREMENTS
(no phases yet)
```

## Accumulated Context

### Key Decisions and Constraints

- SettingsWindow uses ThemeMode="Dark"; zero style leakage to MainWindow
- 414 MSTest tests (357 Core + 57 App), 0 failures as of v4.0 complete
- ClockType enum is the single source of truth (Phrase/Dial/Nixie/Lcd already defined in ClockType.cs)
- BackdropBorder is the sole hover backdrop; ContentBorder.Background must never be set in code
- ResolveLocaleKey(locale, style) is the single entry point for locale+style -> PhraseEngine key resolution; EnStyleKey handles English variants; SetPhraseStyle guards on fr/es/de/pl only (Japanese enabled)
- [DoNotParallelize] class required for any PhraseEngine coordinator tests referencing static PhraseEngine state
- GhostFadeRadiusPx = 80 (default), range 20-200px; Validate() clamps out-of-range to Defaults() value; init-property = 80 ensures absent JSON fields get 80 not C# int default 0
- ComputeProximityRatio uses Chebyshev distance (max(dx,dy)) for rectangular proximity halo; returns 0.0 outside zone, 1.0 inside widget
- GhostModeController timer always-running from Initialize(); IsEnabled gate at top of OnTimerTick; WS_EX_TRANSPARENT managed entirely inside controller
- InternalsVisibleTo FuzzyClock.App.Tests added to FuzzyClock.App.csproj — pattern mirrors FuzzyClock.Core.csproj

### Pending Todos

- Japanese Poetic and Rude phrase vocabulary is LOW confidence; native-speaker review recommended before shipping (non-blocking)

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-03-31
Stopped at: Milestone v4.1 started — defining requirements
Resume file: None
