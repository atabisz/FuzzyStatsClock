---
gsd_state_version: 1.0
milestone: v4.0
milestone_name: Proximity Ghost Mode
status: Milestone archived — ready for next milestone
stopped_at: v4.0 complete-milestone — all 4 phases shipped, archived, tagged
last_updated: "2026-03-27T05:30:00.000Z"
progress:
  total_phases: 4
  completed_phases: 4
  total_plans: 5
  completed_plans: 5
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-27 after v4.0 milestone)

**Core value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.
**Current focus:** v4.0 Proximity Ghost Mode — SHIPPED 2026-03-27. Ready for `/gsd:new-milestone`.

## Current Position

Phase: None (between milestones)
Plan: None

## Progress

```
v4.0 Proximity Ghost Mode — SHIPPED 2026-03-27
Phase 66: AppSettings Foundation        [x] Complete
Phase 67: GhostModeController Extension [x] Complete
Phase 68: Opacity Wiring                [x] Complete
Phase 69: SettingsWindow UI             [x] Complete

[██████████] 100%
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
- Restored fires only at ratio=0.0 after ghost activation (not every sub-1.0 tick during retreat)
- _proximityRatio field in MainWindow drives contrast skip predicate (|| _proximityRatio > 0.0)
- GhostFadeRadiusPanel indented sub-panel in Settings > Behavior tab; IsEnabled gated by Ghost Mode checkbox
- InternalsVisibleTo FuzzyClock.App.Tests added to FuzzyClock.App.csproj — pattern mirrors FuzzyClock.Core.csproj

### Pending Todos

- Japanese Poetic and Rude phrase vocabulary is LOW confidence; native-speaker review recommended before shipping (non-blocking)

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-03-27
Stopped at: v4.0 milestone archived — ready for new-milestone
Resume file: None
