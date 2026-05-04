---
gsd_state_version: 1.0
milestone: v4.2
milestone_name: Temps & Menu
status: planning
last_updated: "2026-05-04T04:26:29.781Z"
last_activity: 2026-05-04
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State: FuzzyStatsClock

**Last updated:** 2026-05-04
**Current milestone:** v4.2 Temps & Menu
**Status:** Defining requirements

## Project Reference

**Core value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.

**Current focus:** Milestone v4.2 — requirements + roadmap

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-05-04 — Milestone v4.2 started

## Performance Metrics

**Velocity:** N/A (milestone start)
**Test suite (baseline):** 501 MSTest tests (433 Core + 68 App), 0 failures (from v4.1)
**Technical debt:** Low (mature codebase with 493 decisions logged)

## Accumulated Context

### Key Decisions This Milestone

(None yet — milestone just started)

### Open Questions

(None yet — gathered during planning)

### Active TODOs

- [ ] Run parallel research (Stack/Features/Architecture/Pitfalls) for LibreHardwareMonitorLib integration
- [ ] Define REQUIREMENTS.md for v4.2 Temps & Menu
- [ ] Create ROADMAP.md continuing phase numbering from 75

### Known Blockers

None yet.

## Session Continuity

### What Just Happened

Milestone v4.2 Temps & Menu kicked off. Goals gathered:

1. Right-click on widget opens the existing tray ContextMenuStrip (same items, same checkmarks)
2. New "Temps" tab in Settings (Appearance / Stats / **Temps** / Behavior) with master toggle + per-sensor checkboxes (CPU / GPU / Motherboard / NVMe)
3. Compact one-liner temps stats line below uptime (`CPU 52°  GPU 61°  NVMe 38°`), Celsius only, accent-colored, piggyback on existing stats timer

Data source: LibreHardwareMonitorLib (MPL-2.0). No elevation — sensors needing admin render "N/A". No alerts/thresholds. RMB under proximity fade requires Ctrl+Alt.

### Next Session Should Know

- Biggest external change in app history: LibreHardwareMonitorLib NuGet + WinRing0 kernel driver dependency
- Installer (Inno Setup, per-user, no UAC) must continue working — graceful no-elevation fallback is a firm invariant
- RMB menu should reuse the existing `_trayMenu` ContextMenuStrip directly, not build a parallel WPF ContextMenu

### Context for Continuation

- Milestone goal: System temperature display + tray menu via right-click
- Previous milestone: v4.1 Polish & Phrases (phases 70-74, shipped 2026-04-01)
- Test baseline: 501 tests passing
- Config: mode=yolo, granularity=standard, research=true, commit_docs=true

---
*State snapshot: 2026-05-04 — milestone v4.2 started*
