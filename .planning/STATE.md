---
gsd_state_version: 1.0
milestone: v3.9
milestone_name: LCD Clock + Japanese Styles
status: Defining requirements
stopped_at: Milestone started
last_updated: "2026-03-23"
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-23)

**Core value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.
**Current focus:** Milestone v3.9 — LCD Clock + Japanese Styles

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-03-23 — Milestone v3.9 started

## Progress

(No phases defined yet — roadmap pending)

## Accumulated Context

### Key Decisions and Constraints

- SettingsWindow uses ThemeMode="Dark"; zero style leakage to MainWindow
- 299 MSTest tests (262 Core + 37 App), 0 failures
- ClockType enum is the single source of truth (Phrase/Dial/Nixie); LCD will add a fourth value
- SettingsWindow already has stub LCD events declared; MainWindow subscribes to them — LCD implementation needs XAML canvas + segment drawing logic
- Japanese providers follow IPhraseProvider pattern; ja-JP Classic provider is the reference baseline
- LCD: 7-segment digits drawn as WPF shapes (Lines/Rectangles), accent-colored; 12/24h switchable; blinking colon; optional seconds row — both 12/24h and seconds-row are Settings-toggleable
- BackdropBorder is the sole hover backdrop; ContentBorder.Background must never be set in code

### Pending Todos

- Japanese phrase naturalness is medium confidence; native-speaker review recommended (not blocking)

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-03-23
Stopped at: Milestone v3.9 initialized
Resume file: None
