# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-25 after v1.1)

**Core value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.
**Current focus:** v1.2 System Stats — Phase 8 complete (both plans done), ready for Phase 9 (stats toggle and persistence)

## Current Position

Phase: 8 (XAML Layout and Stats Display) — both plans complete
Plan: 02 complete
Status: All tasks complete (Tasks 1-3 across both plans), 2026-02-26
Last activity: 2026-02-26 — Phase 8 Plan 02 complete — human-verified live stats display, Collapsed state identical to v1.1, Stats context menu structure confirmed; temporary verification code reverted

Progress: [#####-----] 50% (2/4 v1.2 phases complete — Phase 8 now fully done)

## Performance Metrics

**Velocity:**
- Total plans completed: 10
- Average duration: 2.8 min
- Total execution time: 28 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Phrase Engine | 2 | 4 min | 2 min |
| 2. Window Shell | 3 | 3 min | 1 min |
| 3. Integration | 2 | 7 min | 3.5 min |
| 4. Settings + Drag | 2 | 12 min | 6 min |
| 5. Font Size | 1 | 2 min | 2 min |
| 6. AppSettings Migration | 1 | 2 min | 2 min |
| 7. Stats Data Layer | 1 | 3 min | 3 min |
| 8. XAML Layout and Stats Display | 2 | 8 min | 4 min |

**Recent Trend:**
- Last 10 plans: 01-02 (2 min), 02-01 (1 min), 02-02 (2 min), 02-03 (< 1 min), 03-01 (2 min), 03-02 (5 min), 04-01 (2 min), 04-02 (10 min), 05-01 (2 min), 06-01 (2 min), 07-01 (3 min), 08-01 (3 min), 08-02 (5 min)
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
- [v1.2 Roadmap]: AppSettings positional record must be converted to init-property record before any new fields are added — prevents JSON forward/backward compatibility issues and the zero-interval timer bug (StatsIntervalSeconds=0 from old JSON)
- [v1.2 Roadmap]: Two independent DispatcherTimers — phrase timer (10s, not configurable) and stats timer (1s/3s/10s); never merge them
- [v1.2 Roadmap]: Stats timer must stop when panel is hidden and start when shown — prevents wasted PDH reads on a widget that may run for days
- [v1.2 Roadmap]: GPU counter is MEDIUM confidence — validate engtype_3D filter on physical hardware during Phase 7; implement _gpuAvailable=false fallback for VMs/RDP
- [v1.2 Roadmap]: Fixed Width=180 on StatsPanel container prevents window-width jitter from SizeToContent=WidthAndHeight when percentage text length changes
- [Phase 06-01]: Init-property record enables System.Text.Json partial deserialization of v1.1 settings.json without throwing
- [Phase 06-01]: StatsIntervalSeconds <= 0 guard in Load() prevents zero-interval DispatcherTimer CPU spike from old or corrupted settings.json
- [Phase 06-01]: StatsVisible and StatsIntervalSeconds omitted from MainWindow.xaml.cs SaveSettings() call sites — Phase 9 extends SaveSettings() when stats UI is wired
- [Phase 07-statsservice]: GPU counter name is 'Utilization Percentage' (not 'Utilization %') — validated via typeperf on development machine
- [Phase 07-statsservice]: PDH cold-start on this machine takes ~6s before _initialized=true; _initialized guard holds Refresh() as no-op until init completes — first Refresh() returns valid non-zero values
- [Phase 08-01]: _statsTimer created in ContentRendered but NOT started — StatsPanel is Collapsed by default, Phase 9 owns start/stop lifecycle to prevent wasted PDH reads
- [Phase 08-01]: UpdateStatsDisplay() handles GpuPercent < 0f sentinel with N/A text and zero bar width — same sentinel from Phase 7 StatsService
- [Phase 08-01]: ApplySettings() reads _statsIntervalSeconds = s.StatsIntervalSeconds — StatsVisible wiring deferred to Phase 9 (StatsPanel Visibility hardcoded in XAML)
- [Phase 08-01]: OnClosing disposes _statsService before SaveSettings() — ensures PDH counters released before settings write
- [Phase 08-02]: Human verified all five checks pass — live bars, proportional widths, Collapsed=v1.1 identity, Stats submenu, no layout shift
- [Phase 08-02]: Temporary-force-visible pattern used for visual checkpoint — add, human-verify, revert atomically in separate commit

### Pending Todos

None.

### Blockers/Concerns

None — roadmap complete, research complete, ready to execute.

## Session Continuity

Last session: 2026-02-26
Stopped at: 08-xaml-layout-and-stats-display 08-02-PLAN.md — all tasks complete
Resume file: None
Next action: /gsd:execute-phase 9 (Phase 9 — stats toggle wiring and persistence)
