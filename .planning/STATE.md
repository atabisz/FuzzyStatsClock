# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-03 — v2.5 Unit Tests started)

**Core value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.
**Current focus:** v2.5 Unit Tests — Phase 28: Core Logic Extraction + Tests

## Current Position

**Milestone:** v2.5 Unit Tests
**Phase:** 28 — Core Logic Extraction + Tests (in progress — plan 01 complete)
**Plan:** 28-01 complete
**Status:** Milestone complete

Progress: [█░░░░░░░░░] 11% (0.33/3 phases complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 28 (v1.0 through v2.3)
- Average duration: ~2.8 min
- Total execution time: ~70 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1–23 | 23 plans | ~60 min | 2.6 min |
| 24. System Tray Icon | 2 | 4 min | 2 min |
| 25. Centered Phrase Text | 1 | 3 min | 3 min |
| 26. Ghost Mode Core | 1 | 15 min | 15 min |
| 27. Ctrl+Alt Modifier | 1 | 3 min | 3 min |

*Updated after each plan completion*
| Phase 28-core-logic-extraction-tests P01 | 5 | 3 tasks | 5 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
- [Phase 28-core-logic-extraction-tests]: Extract only angle degrees from DialGeometry (not radian conversion or canvas positioning) — testable pure values only
- [Phase 28-core-logic-extraction-tests]: Use component TimeSpan properties (Days/Hours/Minutes) not totals in UptimeFormatter — matches existing MainWindow behavior exactly

### Technical Context for v2.5

- **Test framework**: MSTest 4.0.1 — [TestClass]/[TestMethod]/[DataRow] — matches existing FuzzyClock.Core.Tests
- **FuzzyClock.Core**: net10.0 (no WPF) — receives UptimeFormatter and DialGeometry
- **FuzzyClock.App.Tests**: must target net10.0-windows to reference FuzzyClock.App (WPF dependency)
- **SettingsService.Clamp() refactor**: add pure overload taking explicit double vLeft/vTop/vWidth/vHeight; existing overload calls the pure one with SystemParameters values
- **SettingsService.Validate() refactor**: extract inline Load() guards (StatsIntervalSeconds, Opacity, AccentColor) into public static Validate(AppSettings) method

### Pending Todos

None.

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-03-03
Stopped at: Completed 28-01-PLAN.md
Resume file: None
Next action: /gsd:plan-phase 29
