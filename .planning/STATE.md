# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-26 — v1.6 started)

**Core value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.
**Current focus:** v1.6 milestone — Dial Mode (Phase 13)

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-02-26 — Milestone v1.6 started

Progress: [----------] 0% (phase 13 not started)

## Performance Metrics

**Velocity:**
- Total plans completed: 13
- Average duration: 2.5 min
- Total execution time: 33 min

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
| 9. Controls Persistence and Edge Cases | 1 | 15 min | 15 min |
| 11. PAG Stat Row | 2 | 3 min | 1.5 min |
| 12. Hover Fast-Refresh | 1 | 2 min | 2 min |

**Recent Trend:**
- Last 10 plans: 02-03 (< 1 min), 03-01 (2 min), 03-02 (5 min), 04-01 (2 min), 04-02 (10 min), 05-01 (2 min), 06-01 (2 min), 07-01 (3 min), 08-01 (3 min), 08-02 (5 min), 09-01 (15 min), 11-01 (2 min), 11-02 (1 min), 12-01 (2 min)
- Trend: Stable

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions from v1.5 (full log in PROJECT.md):

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
- [Phase 09-01]: MenuShowStats_Click reads StatsPanel.Visibility (NOT IsChecked) to determine toggle direction — WPF IsCheckable auto-toggles IsChecked before handler fires, making it unreliable
- [Phase 09-01]: ApplySettings() sets StatsPanel.Visibility directly (NOT via SetStatsVisible) — SetStatsVisible calls UpdateLayout()+Clamp() which are unsafe before Show() where ActualHeight is 0
- [Phase 09-01]: ContentRendered is the safe first point to conditionally start _statsTimer — _statsTimer does not exist during ApplySettings()
- [Phase 09-01]: SetStatsInterval() uses Stop+set+Start pattern — updating DispatcherTimer.Interval on a running timer only takes effect after the current interval expires
- [Phase 09-01]: Re-clamp on SetStatsVisible(true) guarded by _hasUserPosition=true — mirrors ApplyFontSize() pattern; no-position case uses PositionTopRight() which places widget at top-right where downward growth is safe
- [v1.3 Roadmap]: All five v1.3 requirements (STAT-06 through STAT-10) fit into one phase (Phase 10) — three menu toggles, auto-collapse, persistence follow established patterns from Phase 9
- [v1.3 Roadmap]: Click handlers read row Visibility (NOT IsChecked) to determine toggle direction — same pattern as MenuShowStats_Click; WPF IsCheckable auto-toggle is unreliable
- [v1.3 Roadmap]: Auto-collapse logic: when last visible row is hidden AND StatsPanel is Visible, call SetStatsVisible(false) — inverse not needed (Show Stats re-enables panel, rows retain their visibility state)
- [v1.3 Roadmap]: CpuVisible, GpuVisible, MemVisible bool fields added to AppSettings with default true — same init-property pattern as StatsVisible from Phase 6
- [v1.3 Roadmap]: ApplySettings() sets each row Visibility directly (NOT via SetStatRowVisible) — same safety invariant as StatsPanel: SetStatRowVisible may call UpdateLayout() which is unsafe before Show()
- [v1.4 Roadmap]: PagPercent read from PDH "Paging File" / "% Usage" / "_Total" instance; -1 sentinel if counter category absent or unavailable — same fallback pattern as _gpuAvailable
- [v1.4 Roadmap]: AppSettings.PagVisible bool field (default true) added with init-property pattern — same as CpuVisible/GpuVisible/MemVisible from Phase 10
- [v1.4 Roadmap]: SetStatRowVisible() auto-collapse check must include PagRow in the all-hidden condition — currently only checks CpuRow/GpuRow/MemRow
- [v1.4 Roadmap]: Plan 11-01 is autonomous (data + XAML + settings field); Plan 11-02 has human checkpoint (wiring + auto-collapse fix + verify)
- [Phase 11-01]: 4-param PerformanceCounter constructor for Paging File multi-instance category; 3-param (string,string,bool) throws InvalidOperationException
- [Phase 11-01]: No priming for PAG counter — % Usage is a ratio counter returning valid data on first NextValue() call; priming only needed for rate counters (CPU, GPU)
- [Phase 11-01]: Double guard for no-pagefile edge case: PerformanceCounterCategory.Exists() + try/catch; Exists() may return true when pagefile disabled (category registered but no instances)
- [Phase 11-02]: MenuPagVisible_Click reads PagRow.Visibility (NOT IsChecked) — WPF IsCheckable auto-toggles before handler fires; same pattern as CPU/GPU/MEM handlers
- [Phase 11-02]: PagRow.Visibility set directly in ApplySettings() NOT via SetStatRowVisible() — unsafe before Show() where ActualHeight is 0; established pattern for all rows
- [Phase 11-02]: SetStatRowVisible auto-collapse updated from 3-row to 4-row check — minimal change, PagRow.Visibility == Visibility.Collapsed added to condition
- [v1.5 Roadmap]: Phase 12 is a single self-contained change to MainWindow.xaml.cs only — no XAML changes, no AppSettings changes, no new fields
- [v1.5 Roadmap]: MouseEnter/MouseLeave handlers use Stop+set+Start pattern on _statsTimer — same pattern as SetStatsInterval(); immediate effect on interval change
- [v1.5 Roadmap]: Guard condition checks StatsPanel.Visibility == Visibility.Visible before any timer interaction — hover does nothing when stats are hidden
- [v1.5 Roadmap]: _statsIntervalSeconds field is the source of truth for the configured rate; hover must not modify it (only temporarily change the running timer interval)
- [Phase 12-hover-fast-refresh]: Window_MouseEnter guard 2 checks !_statsTimer.IsEnabled — defensive guard for panel-visible-but-timer-stopped edge case
- [Phase 12-hover-fast-refresh]: Window_MouseLeave guard 2 omits IsEnabled check — if panel visible but timer stopped, restoring interval and restarting is still correct behavior
- [Phase 12-hover-fast-refresh]: _statsIntervalSeconds is read-only in hover handlers — hover must not overwrite the persisted user setting

### Pending Todos

None.

### Blockers/Concerns

None — v1.5 complete and archived.

## Session Continuity

Last session: 2026-02-26
Stopped at: v1.6 milestone started — requirements defined (DIAL-01 through DIAL-05)
Resume file: None
Next action: /gsd:plan-phase 13
