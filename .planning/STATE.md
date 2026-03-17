---
gsd_state_version: 1.0
milestone: v3.3
milestone_name: Polish + Installer
status: in_progress
stopped_at: Completed 48-01-PLAN.md
last_updated: "2026-03-17T23:58:17.865Z"
progress:
  total_phases: 4
  completed_phases: 1
  total_plans: 1
  completed_plans: 1
  percent: 80
---

---
gsd_state_version: 1.0
milestone: v3.3
milestone_name: Polish + Installer
status: in_progress
stopped_at: Roadmap created — ready for Phase 48
last_updated: "2026-03-17T00:00:00Z"
last_activity: 2026-03-17 — v3.3 milestone roadmap created; 4 phases planned (48–51)
progress:
  [████████░░] 80%
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-09)

**Core value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.
**Current focus:** Phase 48 — Settings Window Visual Redesign

## Current Position

Milestone v3.3 in progress — 0 of 4 phases complete.
Last completed milestone: v3.2 (phases 41–47, 224 tests passing).

```
Progress: [          ] 0/4 phases
```

Next action: `/gsd:plan-phase 48`

## Accumulated Context

### Decisions

All decisions logged in PROJECT.md Key Decisions table.

Key decisions for v3.3 (from research):
- Installer: Inno Setup (not Velopack) — no app code changes, no custom Main(), no new NuGet packages
- Edge snap threshold: 8px (not 16-20px) — preserves intentional near-edge placements; per-monitor position memory must not be corrupted
- Single-instance bring-to-front: named pipe IPC (NamedPipeServerStream) — running instance listens, second instance writes "ACTIVATE" and exits
- Settings dark mode: ThemeMode="Dark" XAML attribute on SettingsWindow only — App.xaml stays empty to prevent MainWindow style leakage
- Post-DragMove snap only — WM_MOVING hook is unreliable during DragMove() modal loop (documented in ghost mode notes)
- [Phase 48-settings-window-visual-redesign]: ThemeMode=Dark on SettingsWindow only — App.xaml stays empty to prevent MainWindow style leakage

### Pending Todos

- Phase 46 carry-over: Japanese phrase naturalness is medium confidence; native-speaker review of 12 bucket phrases recommended (not blocking v3.3).
- ResetToDefaults() phrase style/locale reset is now a v3.3 requirement (FIX-01) — addressed in Phase 49.

### Blockers/Concerns

None at roadmap stage.

## Session Continuity

Last session: 2026-03-17T23:58:17.861Z
Stopped at: Completed 48-01-PLAN.md
Resume: `/gsd:plan-phase 48`
