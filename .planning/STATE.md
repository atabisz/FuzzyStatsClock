# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-25)

**Core value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.
**Current focus:** v1.1 Phase 4 — Settings Infrastructure + Drag + Position Persistence

## Current Position

Phase: 4 of 5 (Settings + Drag + Position Persistence)
Plan: 1 of 2 in current phase
Status: In progress
Last activity: 2026-02-25 — 04-01 complete (AppSettings + SettingsService created)

Progress: [###░░░░░░░] 30% (3/5 phases complete — v1.0 shipped; Phase 4 in progress)

## Performance Metrics

**Velocity:**
- Total plans completed: 8
- Average duration: 1.5 min
- Total execution time: 9 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Phrase Engine | 2 | 4 min | 2 min |
| 2. Window Shell | 3 | 3 min | 1 min |
| 3. Integration | 2 | 7 min | 3.5 min |
| 4. Settings + Drag (partial) | 1 | 2 min | 2 min |

**Recent Trend:**
- Last 8 plans: 01-01 (2 min), 01-02 (2 min), 02-01 (1 min), 02-02 (2 min), 02-03 (< 1 min), 03-01 (2 min), 03-02 (5 min), 04-01 (2 min)
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
- [04-01]: Left=-1 sentinel for no-saved-position avoids a separate bool HasSavedPosition field, flows naturally through ApplySettings()
- [04-01]: System.Text.Json (not Newtonsoft.Json) — in-box .NET 10, handles plain positional records natively with zero NuGet cost
- [04-01]: VirtualScreen* used (not PrimaryScreenWidth) — covers all monitors including negative-offset left-of-primary monitors
- [04-01]: Atomic Save() via temp-file + File.Move(overwrite:true) prevents corrupt settings.json on mid-write crash

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 4]: UpdatePhraseIfChanged() unconditionally calls PositionTopRight() — must guard with _hasUserPosition flag or drag position is reset at 5-min boundaries (research: critical pitfall P2)
- [Phase 4]: ContentRendered calls PositionTopRight() unconditionally — must guard so saved position is not overwritten on every launch (research: critical pitfall P3)
- [Phase 4]: Window.Left/Top set in constructor can be silently reset by InitializeComponent() — apply saved position in App.xaml.cs after new MainWindow() but before Show() (research: pitfall P7)
- [Phase 4]: Window.Closing not raised on session end — add SessionEnding handler as backup save path (research: pitfall P6)

## Session Continuity

Last session: 2026-02-25
Stopped at: Completed 04-01-PLAN.md — AppSettings and SettingsService created, ready for 04-02 integration
Resume file: None
