---
gsd_state_version: 1.0
milestone: v3.6.2
milestone_name: Contrast Flicker Regression Fix
status: defining_requirements
stopped_at: Milestone v3.6.2 started — defining requirements
last_updated: "2026-03-19T00:00:00.000Z"
last_activity: 2026-03-19 — Milestone v3.6.2 started
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-19)

**Core value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.
**Current focus:** Planning phase 58 (contrast flicker regression fix)

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-03-19 — Milestone v3.6.2 started

## Accumulated Context

### Carried from v3.6.1

- `HasAppWindowBeneath` Z-order walk guard in `ContrastRefreshController.Tick`: seeds from `GetWindow(widgetHwnd, GW_HWNDNEXT)`, checks `IsWindowVisible` + rect overlap + class name; skips BitBlt sampling when only shell windows (Progman/WorkerW/SysListView32) beneath widget
- Guard holds `_contrastState` stable (no mutation on skip) — preserves hysteresis state from prior valid samples
- `_hwnd` field set in `Initialize` via `WindowInteropHelper`
- 274 MSTest tests (249 Core + 25 App), 0 failures

### Known Context for Phase 58

- The v3.6.1 fix was human-verified and passed FIX-01/FIX-02/FIX-03 at the time of shipping
- User reports the flashing is back — regression either from an edge case not covered or a code path that bypasses the guard
- Investigation must identify why the guard is not effective in the current scenario before fixing

### Pending Todos

- Japanese phrase naturalness is medium confidence; native-speaker review recommended (not blocking).

### Blockers/Concerns

None.
