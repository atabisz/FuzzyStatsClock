# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-25)

**Core value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.
**Current focus:** v1.1 Phase 4 — Settings Infrastructure + Drag + Position Persistence

## Current Position

Phase: 4 of 5 (Settings + Drag + Position Persistence)
Plan: 0 of ? in current phase
Status: Ready to plan
Last activity: 2026-02-25 — v1.1 roadmap created (Phases 4-5 defined)

Progress: [###░░░░░░░] 30% (3/5 phases complete — v1.0 shipped)

## Performance Metrics

**Velocity:**
- Total plans completed: 7
- Average duration: 1.5 min
- Total execution time: 7 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Phrase Engine | 2 | 4 min | 2 min |
| 2. Window Shell | 3 | 3 min | 1 min |
| 3. Integration | 2 | 7 min | 3.5 min |

**Recent Trend:**
- Last 7 plans: 01-01 (2 min), 01-02 (2 min), 02-01 (1 min), 02-02 (2 min), 02-03 (< 1 min), 03-01 (2 min), 03-02 (5 min)
- Trend: Stable

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [v1.0 Phase 02-02]: AllowsTransparency + WindowStyle=None + Background=Transparent must all be set in XAML
- [v1.0 Phase 02-02]: Grid Background=#01000000 — fully transparent alpha=0 has no hit-test surface, breaking right-click
- [v1.0 Phase 03-02]: UpdateLayout() before PositionTopRight() ensures correct SizeToContent repositioning
- [v1.0 Phase 03-02]: SetInitialPhrase before Show() ensures first frame shows live phrase
- [v1.1 Roadmap]: Phase 4 builds settings infrastructure + drag + position persistence together — they share the same JSON path and integration risks
- [v1.1 Roadmap]: Phase 5 adds font size on top of Phase 4's JSON path — purely additive, no backward risk

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 4]: UpdatePhraseIfChanged() unconditionally calls PositionTopRight() — must guard with _hasUserPosition flag or drag position is reset at 5-min boundaries (research: critical pitfall P2)
- [Phase 4]: ContentRendered calls PositionTopRight() unconditionally — must guard so saved position is not overwritten on every launch (research: critical pitfall P3)
- [Phase 4]: Window.Left/Top set in constructor can be silently reset by InitializeComponent() — apply saved position in App.xaml.cs after new MainWindow() but before Show() (research: pitfall P7)
- [Phase 4]: Window.Closing not raised on session end — add SessionEnding handler as backup save path (research: pitfall P6)

## Session Continuity

Last session: 2026-02-25
Stopped at: v1.1 roadmap created — Phase 4 and Phase 5 defined, ready to plan Phase 4
Resume file: None
