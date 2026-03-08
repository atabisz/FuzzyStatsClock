---
gsd_state_version: 1.0
milestone: v3.2
milestone_name: Expanded Experience
status: ready_to_plan
stopped_at: Completed 42-01-PLAN.md
last_updated: "2026-03-08T19:57:06.333Z"
last_activity: 2026-03-08 — v3.2 roadmap created; v3.1 milestone complete and archived
progress:
  total_phases: 6
  completed_phases: 1
  total_plans: 5
  completed_plans: 3
  percent: 67
---

---
gsd_state_version: 1.0
milestone: v3.2
milestone_name: Expanded Experience
status: ready_to_plan
stopped_at: roadmap_created
last_updated: "2026-03-08"
last_activity: 2026-03-08 — v3.2 roadmap created; Phase 41 ready to plan
progress:
  [███████░░░] 67%
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-08)

**Core value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.
**Current focus:** Phase 41 — PhraseEngine Provider Refactor

## Current Position

Phase: 41 of 46 (PhraseEngine Provider Refactor)
Plan: 0 of TBD in current phase
Status: Ready to plan
Last activity: 2026-03-08 — v3.2 roadmap created; v3.1 milestone complete and archived

Progress: [░░░░░░░░░░] 0% (v3.2: 0/6 phases complete)

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting v3.2:

- Settings Window: modeless (`Show()` not `ShowDialog()`); `Owner=MainWindow`; fires `SettingsChanged` event; MainWindow subscribes; never writes AppSettings directly
- Settings/tray sync: populate-on-open strategy — values shown are those at time of window open; no live sync back to window when tray changes
- Battery alert: configurable threshold (10%/15%/20%, default 20%) with enabled toggle; both `ApplyTheme()` and `ApplyDisplayColor()` must guard with `_batteryAlertActive`
- Phrase styles: English-only for v3.2; Phrase Style selector disabled in Settings window when non-English language is active
- Multilingual: `CultureInfo.CurrentUICulture` (not `CurrentCulture`); Japanese `GetStructuredPhrase` returns `("", fullPhrase)` fallback for all non-English
- Phase 41 first: highest-risk Core change (51 phrase tests); regression isolation before any MainWindow work
- [Phase 41]: IPhraseProvider holds only provider concerns; SetLocale/CurrentLocale stay on PhraseEngine as coordinator
- [Phase 41]: EnglishPhraseProvider is public (not internal) to allow direct construction in future isolation tests
- [Phase 41]: [TestCleanup] required for static class tests: PhraseEngine state persists across test methods; cleanup resets locale to en-classic
- [Phase 42-settings-window-infrastructure]: PhraseStyle and TextStyle kept separate: PhraseStyle governs vocabulary (Classic/Terse/Poetic/Rude); TextStyle governs layout (Classic/Split/Literary/Mono)
- [Phase 42-settings-window-infrastructure]: SettingsSnapshot: immutable record passed to SettingsWindow constructor; changes flow out via events, nothing flows back in (populate-on-open strategy)
- [Phase 42]: PhraseStyle and TextStyle are separate dimensions: TextStyle governs text layout (Classic/Split/Literary/Mono); PhraseStyle governs phrase vocabulary (Classic/Terse/Poetic/Rude in Phase 45)
- [Phase 42]: SettingsSnapshot is an immutable populate-on-open constructor-arg record; changes flow OUT via events, never back IN

### Pending Todos

None.

### Blockers/Concerns

- Phase 46: Japanese phrase naturalness is medium confidence; native-speaker review of 12 bucket phrases recommended before phase is marked done.

## Session Continuity

Last session: 2026-03-08T19:57:06.328Z
Stopped at: Completed 42-01-PLAN.md
Resume file: None
