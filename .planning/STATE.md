---
gsd_state_version: 1.0
milestone: v4.4
milestone_name: Smooth Ghost Fade Under Load
status: executing
last_updated: "2026-05-20T05:37:06.890Z"
progress:
  total_phases: 3
  completed_phases: 0
  total_plans: 4
  completed_plans: 0
  percent: 0
---

# Project State: FuzzyStatsClock

**Status:** Ready to execute
**Last updated:** 2026-05-20

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-07)

**Core value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.
**Current focus:** v4.4 Phase 85 — Off-thread sampling refactor

## Current Milestone

**v4.4 Smooth Ghost Fade Under Load** — In progress

- Phases: 85, 86, 87 (continues from v4.3's Phase 84)
- Requirements: 18 total — FADE (4), SAMP (4), SEM (5), TEST (4), PERF (1)
- Coverage: 18/18 mapped to phases (100%)
- Test baseline at milestone start: 574 MSTest (445 Core + 129 App)

### Phase Plan

| Phase | Goal | Requirements |
|-------|------|--------------|
| 85 — Off-thread sampling refactor | `GhostModeController` sampling moves to `System.Threading.Timer`; UI work marshals via `Dispatcher.BeginInvoke`; tickable seam exposed | SAMP-01..04, SEM-01, SEM-02, SEM-03, SEM-05 |
| 86 — Frame-driven opacity rendering | `MainWindow` lerps current ratio toward target via `CompositionTarget.Rendering`; terminal-state snap; existing guards preserved | FADE-01..04, SEM-04 |
| 87 — Verification & performance acceptance | `LerpRatio` unit tests; tickable-seam tests; full MSTest suite green; manual smoothness check under 25–50% CPU load | TEST-01..04, PERF-01 |

## Recent Milestone

**v4.3 Configurable Ghost Override** — Shipped 2026-05-07

- 4 phases (81–84), 5 plans
- 574 MSTest passing (445 Core + 129 App)
- 22/22 requirements validated
- Tag: v4.3

## Accumulated Context

### Active TODOs

None

### Known Blockers

None

### Recent Decisions Affecting v4.4

- v4.0 Phase 67: Always-running `GhostModeController` timer (not started/stopped on toggle) — Phase 85 must preserve this lifecycle invariant under the new thread-pool timer
- v4.0 Phase 67: `Restored` fires only at ratio=0.0 after ghost activation — Phase 85 must preserve byte-for-byte
- v4.3 Phase 83: `IsModifierHeld` AND-logic with all-false short-circuit — Phase 85 must preserve under off-thread sampling
- v4.3 Phase 84: Five `MainWindow` touchpoints for ghost integration — Phase 86 must respect drag/settings/menu/wheel guards verbatim

## Session Continuity

**Next action:** `/gsd:plan-phase 85` to plan the off-thread sampling refactor

**When returning:**

1. Read this STATE.md and .planning/ROADMAP.md for current position
2. Run `/gsd:plan-phase 85` to decompose Phase 85 into executable plans

**Recent milestones:**

- v4.3 Configurable Ghost Override — shipped 2026-05-07 (574 tests, 22/22 requirements)
- v4.2 Temps & Menu — shipped 2026-05-04 (562 tests, MPL-2.0 compliance)

---
*State updated: 2026-05-20 — Phase 85 context gathered (.planning/phases/85-off-thread-sampling-refactor/85-CONTEXT.md)*
*Phase numbering continues from v4.3's Phase 84*
