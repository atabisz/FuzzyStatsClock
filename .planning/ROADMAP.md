# Roadmap: Fuzzy Clock

## Milestones

- **v1.0 MVP** (2026-02-25) — Phrase engine, transparent WPF overlay, full integration. 3 phases, 7 plans. → [Archive](milestones/v1.0-ROADMAP.md)
- **v1.1 Position + Font Size** (2026-02-25) — Drag reposition, position persistence, font size selector. 2 phases, 3 plans. → [Archive](milestones/v1.1-ROADMAP.md)
- **v1.2 System Stats** (in progress) — CPU / GPU / MEM stats panel, update interval selector, show/hide toggle, persistence. 4 phases.

## Phases

<details>
<summary>v1.0 MVP (Phases 1-3) — SHIPPED 2026-02-25</summary>

### Phase 1: Phrase Engine
**Goal**: Core phrase logic is correct and tested
**Plans**: 2 plans

Plans:
- [x] 01-01: Scaffold solution and projects
- [x] 01-02: Implement PhraseEngine with 51 passing unit tests

### Phase 2: Window Shell
**Goal**: Transparent frameless always-on-top WPF overlay exists
**Plans**: 3 plans

Plans:
- [x] 02-01: Scaffold WPF app project
- [x] 02-02: Implement transparent frameless always-on-top window
- [x] 02-03: Human verify all window behaviors

### Phase 3: Integration
**Goal**: Widget runs on the desktop showing live phrases that auto-update
**Plans**: 2 plans

Plans:
- [x] 03-01: Wire PhraseEngine into MainWindow with DispatcherTimer
- [x] 03-02: Wire App.xaml.cs startup; SetInitialPhrase before Show()

</details>

<details>
<summary>v1.1 Position + Font Size (Phases 4-5) — SHIPPED 2026-02-25</summary>

### Phase 4: Settings Infrastructure + Drag + Position Persistence
**Goal**: Users can drag the widget to any screen position and find it exactly there on next launch
**Depends on**: Phase 3 (v1.0 complete)
**Requirements**: WIN-04, WIN-05
**Plans**: 2 plans

Plans:
- [x] 04-01: Create AppSettings record and SettingsService (JSON I/O, VirtualScreen clamp, atomic save)
- [x] 04-02: Wire settings into App.xaml.cs + MainWindow.xaml.cs + MainWindow.xaml; drag handler; PositionTopRight guards; human verify

### Phase 5: Font Size Selection + Persistence
**Goal**: Users can change the phrase font size and find their chosen size restored on every launch
**Depends on**: Phase 4
**Requirements**: DISP-05, DISP-06
**Plans**: 1 plan

Plans:
- [x] 05-01: Add Font Size submenu to ContextMenu + ApplyFontSize() handler with re-clamp and save

</details>

### v1.2 System Stats (Phases 6-9)

- [x] **Phase 6: AppSettings Migration** — Convert AppSettings to init-property record, add StatsVisible + StatsIntervalSeconds fields, guard against zero-interval on old JSON (completed 2026-02-25)
- [x] **Phase 7: StatsService** — New StatsService.cs with async init, CPU counter priming, GPU multi-instance enumeration, IDisposable (completed 2026-02-25)
- [ ] **Phase 8: XAML Layout and Stats Display** — Grid RowDefinitions, StatsPanel with fixed Width, three stat rows (label + bar + % text), UpdateStatsDisplay wired to DispatcherTimer
- [ ] **Phase 9: Controls, Persistence, and Edge Cases** — SetStatsVisible, SetStatsInterval, ContextMenu_Opened sync, ApplySettings new fields, OnClosing disposal order

## Phase Details

### Phase 6: AppSettings Migration
**Goal**: The settings layer can store and restore stats preferences without corrupting existing settings or creating a zero-interval timer
**Depends on**: Phase 5 (v1.1 complete)
**Requirements**: STAT-05 (persistence layer foundation)
**Success Criteria** (what must be TRUE):
  1. Widget launches with a freshly deleted settings.json and StatsVisible defaults to false, StatsIntervalSeconds defaults to 3
  2. Widget launches with a v1.1 settings.json (no stats fields) and reads correct defaults without throwing
  3. Widget writes and reads back StatsVisible=true and StatsIntervalSeconds=10 across a restart with no data loss
  4. A settings.json with StatsIntervalSeconds=0 (corrupted or pre-migration) loads with StatsIntervalSeconds replaced by the default (3), not zero
**Plans**: 1 plan

Plans:
- [ ] 06-01-PLAN.md — Convert AppSettings to init-property record, add StatsVisible + StatsIntervalSeconds with safe defaults, add zero-interval guard in Load(), fix all positional AppSettings call sites in MainWindow.xaml.cs

### Phase 7: StatsService
**Goal**: The application has a verified data source that returns plausible CPU, GPU, and memory percentages from Windows PDH counters without blocking the UI thread
**Depends on**: Phase 6
**Requirements**: STAT-01 (data layer)
**Success Criteria** (what must be TRUE):
  1. CpuPercent, GpuPercent, and MemPercent return non-zero values that visibly track real system load (verified via debug output)
  2. CPU percent does not show a 0%-then-jump artifact on first read (counter primed during init)
  3. On a machine without a GPU or with GPU Engine category absent, GpuPercent returns a sentinel value and no exception is thrown
  4. StatsService.Dispose() releases all PerformanceCounter instances without error
**Plans**: 1 plan

Plans:
- [ ] 07-01-PLAN.md — Create StatsService.cs (async init, primed counters, GPU multi-instance enumeration with fallback, IDisposable) + add System.Diagnostics.PerformanceCounter NuGet; verify via debug output

### Phase 8: XAML Layout and Stats Display
**Goal**: The stats panel is visible below the time phrase, showing live CPU, GPU, and memory values updating at the default interval
**Depends on**: Phase 7
**Requirements**: STAT-01 (visual display), STAT-02 (bar + percentage text)
**Success Criteria** (what must be TRUE):
  1. Stats panel appears below the time phrase with three labeled rows (CPU, GPU, MEM) each showing a horizontal bar and a percentage text value
  2. Bar widths visually reflect current utilization (a heavily loaded CPU shows a wide bar; idle shows a narrow bar)
  3. Percentage text values update at the default 3-second interval without the window changing width due to text length changes
  4. Widget renders identically to v1.1 when the stats panel is in its default Collapsed state (no layout shift, no width change)
  5. Right-click context menu shows a Stats submenu with Show Stats and Update Interval items (structure present, wiring deferred to Phase 9)
**Plans**: TBD

### Phase 9: Controls, Persistence, and Edge Cases
**Goal**: Stats show/hide and update interval are fully user-controllable, correctly persisted across restarts, and the widget handles startup, shutdown, and edge cases cleanly
**Depends on**: Phase 8
**Requirements**: STAT-03 (interval selector), STAT-04 (show/hide toggle), STAT-05 (full persistence round-trip)
**Success Criteria** (what must be TRUE):
  1. User can toggle stats visibility from the right-click Stats submenu; the checkmark reflects current state every time the menu opens
  2. User can select 1s, 3s, or 10s update interval from the Stats submenu; the checkmark reflects the active interval every time the menu opens
  3. Stats visibility and update interval survive a full app restart (close and relaunch restores the last-chosen values)
  4. Showing the stats panel after it was hidden does not push the widget partially off-screen on any monitor edge
  5. Stats timer stops when the panel is hidden and resumes when shown (no background PDH reads while stats are hidden)
  6. App closes cleanly with no exceptions: stats timer is stopped before StatsService is disposed
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Phrase Engine | v1.0 | 2/2 | Complete | 2026-02-25 |
| 2. Window Shell | v1.0 | 3/3 | Complete | 2026-02-25 |
| 3. Integration | v1.0 | 2/2 | Complete | 2026-02-25 |
| 4. Settings + Drag + Position Persistence | v1.1 | 2/2 | Complete | 2026-02-25 |
| 5. Font Size Selection + Persistence | v1.1 | 1/1 | Complete | 2026-02-25 |
| 6. AppSettings Migration | 1/1 | Complete   | 2026-02-25 | - |
| 7. StatsService | 1/1 | Complete   | 2026-02-25 | - |
| 8. XAML Layout and Stats Display | v1.2 | 0/? | Not started | - |
| 9. Controls, Persistence, and Edge Cases | v1.2 | 0/? | Not started | - |

---
*Last updated: 2026-02-25 after v1.2 roadmap created*
