# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-25)

**Core value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.
**Current focus:** Phase 3 in progress — Plan 03-01 complete (PhraseEngine wired into MainWindow with DispatcherTimer, Border backdrop, and named ShadowText)

## Current Position

Phase: 3 of 3 (Integration) — IN PROGRESS
Plan: 1 of 3 in phase 3 — COMPLETE
Status: Phase 3 plan 1 complete — ready for Plan 03-02 (App.xaml.cs startup wiring)
Last activity: 2026-02-25 — Plan 03-01 complete: MainWindow.xaml updated with Border backdrop + ShadowText; MainWindow.xaml.cs wired with DispatcherTimer polling PhraseEngine every 10s

Progress: [█████████░] 83%

## Performance Metrics

**Velocity:**
- Total plans completed: 5
- Average duration: 1.5 min
- Total execution time: 7 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Phrase Engine | 2 | 4 min | 2 min |
| 2. Window Shell | 3 | 3 min | 1 min |
| 3. Integration | 1 (of 3) | 2 min | 2 min |

**Recent Trend:**
- Last 6 plans: 01-01 (2 min), 01-02 (2 min), 02-01 (1 min), 02-02 (2 min), 02-03 (< 1 min), 03-01 (2 min)
- Trend: Stable

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Phrase engine built first (no WPF dependency); validates core logic before UI exists
- [Roadmap]: Window shell built second (isolates three-way transparency constraint from logic)
- [Roadmap]: Integration is Phase 3 (font/size/legibility decisions need actual phrase text on transparent background)
- [Roadmap]: DISP-04 (timer/update cadence) placed in Phase 3 — requires both engine and window to exist
- [01-01]: dotnet 10.0 SDK generates .slnx (new XML format) instead of .sln — functionally identical for all build/test commands
- [01-01]: Placeholder files deleted immediately (Class1.cs, Test1.cs) to keep scaffold clean for TDD in Plan 02
- [01-02]: :55 bucket upper bound set to 59 (not 57) so minutes 58-59 return "almost" rather than hitting a dead zone
- [01-02]: Special cases detected via totalMinutes (Hour*60+Minute) before generic bucket dispatch
- [01-02]: Assert.DoesNotContain/Contains preferred over Assert.IsFalse/IsTrue for MSTest4 compatibility
- [02-01]: Template files (App.xaml, MainWindow.xaml, AssemblyInfo.cs) preserved as-is — Plan 02-02 will overwrite them; AssemblyInfo.cs contains ThemeInfo attribute required by WPF
- [02-01]: No csproj properties added beyond dotnet CLI output — scaffold is minimal and correct
- [02-02]: AllowsTransparency + WindowStyle=None + Background=Transparent must all be set in XAML — AllowsTransparency cannot be changed after window handle is created
- [02-02]: Grid Background=#01000000 (alpha=1): fully transparent alpha=0 has no hit-test surface, breaking right-click
- [02-02]: Application.Current.Shutdown() in close handler — not this.Close() — because hidden owner keeps process alive otherwise
- [02-02]: ContentRendered for positioning — ActualWidth is 0 in constructor before SizeToContent layout pass completes
- [02-02]: Hidden ToolWindow owner pattern: ShowInTaskbar=False alone does not suppress Alt+Tab entry
- [02-03]: All 8 runtime behaviors confirmed by human inspection — implementation correct first time, no remediation needed
- [02-03]: Manual offset TextBlock shadow approach confirmed visually effective for drop shadow legibility
- [Phase 03-integration]: Border backdrop Background=#26000000 (15% black alpha) for phrase legibility on transparent overlay
- [Phase 03-integration]: DispatcherTimer started in ContentRendered fires on UI thread; UpdatePhraseIfChanged calls UpdateLayout before PositionTopRight for SizeToContent accuracy

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 3]: `SizeToContent="WidthAndHeight"` behavior with long phrases (e.g., "just a little after twenty-five past") should be verified early — window auto-sizing may clip or produce awkward dimensions at the chosen font size.

## Session Continuity

Last session: 2026-02-25
Stopped at: Completed 03-01-PLAN.md — PhraseEngine wired into MainWindow with DispatcherTimer, Border backdrop, named ShadowText; ready for 03-02 (App.xaml.cs startup wiring)
Resume file: None
