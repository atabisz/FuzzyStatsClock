---
gsd_state_version: 1.0
milestone: v3.6.1
milestone_name: Contrast Flicker Fix
status: ready_to_plan
stopped_at: —
last_updated: "2026-03-19T00:00:00.000Z"
last_activity: 2026-03-19 — Roadmap created; Phase 57 ready to plan
progress:
  total_phases: 1
  completed_phases: 0
  total_plans: 1
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-19)

**Core value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.
**Current focus:** Phase 57 — Contrast Flicker Fix

## Current Position

Phase: 57 of 57 (Contrast Flicker Fix)
Plan: 0 of 1 in current phase
Status: Ready to plan
Last activity: 2026-03-19 — Roadmap created

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0 (this milestone)
- Average duration: —
- Total execution time: —

*Updated after each plan completion*

## Accumulated Context

### Carried from v3.6

- SettingsWindow uses ThemeMode="Dark"; zero style leakage to MainWindow
- 274 MSTest tests (249 Core + 25 App), 0 failures
- Settings window is 480×600; Appearance tab compacted (theme cards 40px, 4px grid spacing)

### Known Context for Phase 57

- `ContrastSamplerService` uses BitBlt to sample the screen under the widget footprint every 500ms
- Over empty desktop, the sampled color may alternate between the desktop background color and the widget's own rendered color, causing the contrast threshold to flip back and forth
- `BackdropAlwaysVisible` renders a semi-transparent backdrop; when AutoContrast samples this backdrop it may see its own dark color and flip to white, then sample white text and flip back — the loop causes the flicker
- The fix must not alter the public interface of `ContrastService` or `ContrastSamplerService` in ways that break existing tests

### Pending Todos

- Japanese phrase naturalness is medium confidence; native-speaker review recommended (not blocking).

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-03-19
Stopped at: Roadmap created; no plans written yet
Resume file: None
