---
gsd_state_version: 1.0
milestone: v3.4
milestone_name: Personalities & Nixie
status: planning
stopped_at: Defining requirements
last_updated: "2026-03-11T00:00:00Z"
last_activity: 2026-03-11 — Milestone v3.4 started
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-11)

**Core value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.
**Current focus:** Planning next milestone

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-03-11 — Milestone v3.4 Personalities & Nixie started

## Accumulated Context

### Decisions (carried from v3.3)

- LCD segments drawn with WPF Polygons (no font assets/bitmaps)
- Ghost segments required (dimmed, not hidden)
- `ClockType` enum (Phrase/Dial/Lcd/Nixie); JSON serialized as string via JsonStringEnumConverter
- `SevenSegmentEncoder` lives in FuzzyClock.Core (pure logic, testable)
- WPF controls (`SevenSegmentDigit`, `LcdClockView`) live in FuzzyClock.App/Controls/
- LCD theme system is independent of the existing named-theme system
- IPhraseProvider interface + provider registry (established v3.2) — new styles follow this pattern
- Phrase style selector disabled for non-English locales; new styles are English-only

### Key Architecture (for roadmapper)

- `ClockType` enum: adding `Nixie` as 4th value after Lcd
- New phrase providers: implement `IPhraseProvider`, register in `PhraseEngine` coordinator
- Nixie clock: new `NixieClockView` UserControl in `FuzzyClock.App/Controls/`; WPF RadialGradientBrush for glow; stacked ghost digits in Canvas layers
- Dial enhancements: `AppSettings.DialShape` enum (Round/Oval), dial canvas size tied to `_currentFontSize`
- Last phase shipped: Phase 54 (v3.3)
- Next phase starts at: Phase 55

### Pending Todos

None.

### Blockers/Concerns

- Phase 46: Japanese phrase naturalness is medium confidence; native-speaker review of 12 bucket phrases recommended.
- ResetToDefaults() does not reset `_currentPhraseStyle` or `_currentPhraseLocale` — minor inconsistency, not a requirement violation.

## Session Continuity

Last session: 2026-03-11
Stopped at: v3.3 milestone complete; v3.4 requirements defined
Resume: `/gsd:plan-phase 55` after roadmap is created
