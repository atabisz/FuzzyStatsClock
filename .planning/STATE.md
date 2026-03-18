---
gsd_state_version: 1.0
milestone: v3.6
milestone_name: Settings Layout Fix
status: defining_requirements
stopped_at: —
last_updated: "2026-03-18T00:00:00.000Z"
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-18)

**Core value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.
**Current focus:** Milestone v3.6 — Settings Layout Fix

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-03-18 — Milestone v3.6 started

## Accumulated Context

### Carried from v3.5

- Named-pipe IPC bring-to-front: WaitForConnection/Connect 500ms
- AbandonedMutexException catch on startup
- Edge snapping: SnapToEdge() post-DragMove, 8px threshold, WorkingArea respected
- PhraseWrapService: ComputeSplit(text, style, allowNatural) in FuzzyClock.Core
- Segment-key guard: _lastSegmentKey in MainWindow; phrase only changes when key changes
- BackdropBorder covering full StackPanel; BackdropAlwaysVisible + BackdropOpacityPercent
- PoeticPhraseProvider: 48 templates ending {h}/{h1}; GetStructuredPhrase returns (qualifier, hourWord)
- 274 MSTest tests (249 Core + 25 App), 0 failures

### Pending Todos

- Japanese phrase naturalness is medium confidence; native-speaker review recommended (not blocking).

### Blockers/Concerns

None.
