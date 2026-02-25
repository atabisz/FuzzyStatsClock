# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-25 after v1.1)

**Core value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.
**Current focus:** v1.2 System Stats — defining requirements

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements for v1.2
Last activity: 2026-02-25 — Milestone v1.2 System Stats started

Progress: [##########] 100% (5/5 phases complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 9
- Average duration: 2.9 min
- Total execution time: 26 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Phrase Engine | 2 | 4 min | 2 min |
| 2. Window Shell | 3 | 3 min | 1 min |
| 3. Integration | 2 | 7 min | 3.5 min |
| 4. Settings + Drag | 2 | 12 min | 6 min |
| 5. Font Size | 1 | 2 min | 2 min |

**Recent Trend:**
- Last 10 plans: 01-01 (2 min), 01-02 (2 min), 02-01 (1 min), 02-02 (2 min), 02-03 (< 1 min), 03-01 (2 min), 03-02 (5 min), 04-01 (2 min), 04-02 (10 min), 05-01 (2 min)
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
- [Phase 04-02]: ApplySettings() must be called after new MainWindow() but before Show() — setting Left/Top in constructor can be silently reset by XAML parser
- [Phase 04-02]: SessionEnding handler added as backup save for Windows log-off/shutdown since Window.Closing is not raised in those paths
- [Phase 04-02]: ContentRendered is the safe deferral point for clamping — ActualWidth/ActualHeight are 0 until first layout pass with SizeToContent=WidthAndHeight
- [Phase 04-02]: Re-clamp after every phrase change — SizeToContent=WidthAndHeight resizes window on phrase update; widget near right/bottom edge can be pushed off-screen
- [Phase 05-01]: ContextMenu.Opened is single sync point for IsChecked — click handlers do NOT touch IsChecked, preventing double-toggle of WPF IsCheckable default
- [Phase 05-01]: ApplyFontSize() separated from ApplySettings() — ApplyFontSize calls UpdateLayout()+SaveSettings() which are unsafe before window is shown
- [Phase 05-01]: UpdateLayout() before Clamp() in ApplyFontSize() — same pattern as UpdatePhraseIfChanged(); font size change resizes window via SizeToContent

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 4 - RESOLVED 04-02]: UpdatePhraseIfChanged() now guarded with _hasUserPosition flag — drag position no longer reset at 5-min boundaries
- [Phase 4 - RESOLVED 04-02]: ContentRendered now guarded with _savedPositionLoaded — saved position not overwritten on launch
- [Phase 4 - RESOLVED 04-02]: ApplySettings() called in App.xaml.cs after new MainWindow() but before Show() — safe assignment point for WindowStartupLocation.Manual
- [Phase 4 - RESOLVED 04-02]: SessionEnding handler added in App.xaml.cs — covers log-off/shutdown save paths

## Session Continuity

Last session: 2026-02-25
Stopped at: 05-01 COMPLETE — all tasks including human-verify approved; v1.1 fully shipped
Resume file: None
