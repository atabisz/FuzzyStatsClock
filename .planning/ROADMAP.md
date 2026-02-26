# Roadmap: Fuzzy Clock

## Milestones

- **v1.0 MVP** (2026-02-25) — Phrase engine, transparent WPF overlay, full integration. 3 phases, 7 plans. → [Archive](milestones/v1.0-ROADMAP.md)
- **v1.1 Position + Font Size** (2026-02-25) — Drag reposition, position persistence, font size selector. 2 phases, 3 plans. → [Archive](milestones/v1.1-ROADMAP.md)
- **v1.2 System Stats** (2026-02-26) — CPU / GPU / MEM stats panel, update interval selector, show/hide toggle, persistence. 4 phases, 5 plans. → [Archive](milestones/v1.2-ROADMAP.md)
- **v1.3 Individual Stat Visibility** (2026-02-26) — Per-row CPU/GPU/MEM visibility toggles, auto-collapse, persistence. 1 phase, 2 plans. → [Archive](milestones/v1.3-ROADMAP.md)
- **v1.4 PAG Stat Row** (2026-02-26) — Paging file % usage as fourth stat row, visibility toggle, persistence. 1 phase, 2 plans. → [Archive](milestones/v1.4-ROADMAP.md)

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

<details>
<summary>✅ v1.2 System Stats (Phases 6-9) — SHIPPED 2026-02-26</summary>

- [x] **Phase 6: AppSettings Migration** — Convert AppSettings to init-property record, add StatsVisible + StatsIntervalSeconds fields, guard against zero-interval on old JSON (completed 2026-02-25)
- [x] **Phase 7: StatsService** — New StatsService.cs with async init, CPU counter priming, GPU multi-instance enumeration, IDisposable (completed 2026-02-25)
- [x] **Phase 8: XAML Layout and Stats Display** — Grid RowDefinitions, StatsPanel with fixed Width, three stat rows (label + bar + % text), UpdateStatsDisplay wired to DispatcherTimer; human-verified live bars, Collapsed state = v1.1 identity, Stats context menu confirmed (completed 2026-02-26)
- [x] **Phase 9: Controls, Persistence, and Edge Cases** — SetStatsVisible, SetStatsInterval, ContextMenu_Opened sync, ApplySettings new fields, OnClosing disposal order (completed 2026-02-26)

</details>

<details>
<summary>✅ v1.3 Individual Stat Visibility (Phase 10) — SHIPPED 2026-02-26</summary>

- [x] **Phase 10: Individual Stat Row Visibility** — Per-row CPU/GPU/MEM toggle menu items, auto-collapse when all rows hidden, persistence of three new bool fields (completed 2026-02-26)

</details>

<details>
<summary>✅ v1.4 PAG Stat Row (Phase 11) — SHIPPED 2026-02-26</summary>

- [x] **Phase 11: PAG Stat Row** — AppSettings.PagVisible + StatsService PDH counter + XAML PagRow + MenuPagVisible + six MainWindow.xaml.cs integration points; auto-collapse extended to 4 rows; all STAT-11–STAT-15 human-verified (completed 2026-02-26)

</details>

### v1.5 Hover Fast-Refresh (Phase 12)

- [ ] **Phase 12: Hover Fast-Refresh** — MouseEnter/MouseLeave handlers switch `_statsTimer` interval to 0.5s on hover and restore `_statsIntervalSeconds` on leave, guarded by StatsPanel visibility

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
- [x] 06-01-PLAN.md — Convert AppSettings to init-property record, add StatsVisible + StatsIntervalSeconds with safe defaults, add zero-interval guard in Load(), fix all positional AppSettings call sites in MainWindow.xaml.cs

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
- [x] 07-01-PLAN.md — Create StatsService.cs (async init, primed counters, GPU multi-instance enumeration with fallback, IDisposable) + add System.Diagnostics.PerformanceCounter NuGet; verify via debug output

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
**Plans**: 2 plans

Plans:
- [x] 08-01-PLAN.md — Restructure MainWindow.xaml (two-row Grid, StatsPanel, Stats ContextMenu entries) + wire StatsService + UpdateStatsDisplay + _statsTimer in MainWindow.xaml.cs
- [x] 08-02-PLAN.md — Temporarily force StatsPanel visible for live verification; human verify layout, bars, and context menu; revert to Collapsed default

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
**Plans**: 1 plan

Plans:
- [x] 09-01-PLAN.md — Wire Click handlers, ContextMenu_Opened stats checkmarks, SetStatsVisible with re-clamp, SetStatsInterval with live timer update, extend SaveSettings/ApplySettings, conditional ContentRendered timer start; human verify all 6 checks

### Phase 10: Individual Stat Row Visibility
**Goal**: Users can show or hide each stat row independently, with the stats panel auto-collapsing when all rows are hidden, and all preferences persisted across restarts
**Depends on**: Phase 9
**Requirements**: STAT-06, STAT-07, STAT-08, STAT-09, STAT-10
**Success Criteria** (what must be TRUE):
  1. User can toggle CPU row visibility from the right-click Stats submenu; the checkmark reflects the actual CPU row visibility state every time the menu opens
  2. User can toggle GPU row visibility from the right-click Stats submenu; the checkmark reflects the actual GPU row visibility state every time the menu opens
  3. User can toggle MEM row visibility from the right-click Stats submenu; the checkmark reflects the actual MEM row visibility state every time the menu opens
  4. Hiding the last visible stat row automatically collapses the stats panel (equivalent to toggling Show Stats off); re-showing any row with Show Stats on makes it visible
  5. CPU, GPU, and MEM row visibility states survive a full app restart (close and relaunch restores each row to its last-chosen state)
**Plans**: 2 plans

Plans:
- [x] 10-01-PLAN.md — Add AppSettings fields + XAML row names and per-row menu items
- [x] 10-02-PLAN.md — Wire click handlers, checkmark sync, ApplySettings, SaveSettings, auto-collapse; human verify

### Phase 11: PAG Stat Row
**Goal**: Users can see paging file usage as a fourth stat row, toggle its visibility independently, and find that preference persisted across restarts, with graceful handling when paging is unavailable
**Depends on**: Phase 10
**Requirements**: STAT-11, STAT-12, STAT-13, STAT-14, STAT-15
**Success Criteria** (what must be TRUE):
  1. PAG row appears below MEM row in the stats panel, showing a horizontal bar and a percentage text value that tracks real paging file usage
  2. User can toggle PAG row visibility from the right-click Stats submenu; the checkmark reflects the actual PAG row visibility state every time the menu opens
  3. Hiding all four stat rows (CPU, GPU, MEM, PAG) automatically collapses the stats panel
  4. PAG row visibility survives a full app restart (close and relaunch restores the last-chosen state)
  5. When paging file is disabled or the PDH counter is unavailable, the PAG row displays "N/A" with no exception thrown
**Plans**: 2 plans

Plans:
- [x] 11-01-PLAN.md — Add AppSettings.PagVisible + StatsService.PagPercent (PDH "Paging File"/"% Usage"/"_Total", -1 sentinel) + XAML PagRow Grid (x:Name, below MemRow) + MenuPagVisible MenuItem (IsCheckable)
- [x] 11-02-PLAN.md — Wire MenuPagVisible_Click + UpdateStatsDisplay PAG display + ContextMenu_Opened PAG checkmark + ApplySettings PAG row + SaveSettings PAG field + fix SetStatRowVisible auto-collapse to include PagRow; human verify

### Phase 12: Hover Fast-Refresh
**Goal**: While hovering over the widget with the stats panel visible, users see stats update at 0.5s cadence; on mouse leave, the cadence returns to their configured rate
**Depends on**: Phase 11
**Requirements**: HVRF-01, HVRF-02, HVRF-03
**Success Criteria** (what must be TRUE):
  1. With stats panel visible, moving the mouse over the widget causes the stat values to visibly update at approximately 0.5s cadence (noticeably faster than any configured interval)
  2. Moving the mouse away from the widget restores the stats update cadence to the user's configured interval (1s, 3s, or 10s)
  3. With stats panel hidden, hovering over the widget does not start the stats timer or produce any change in timer state
  4. The user's configured interval (1s/3s/10s) is preserved after hover — hover does not overwrite the persisted setting nor alter what the interval selector shows
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Phrase Engine | v1.0 | 2/2 | Complete | 2026-02-25 |
| 2. Window Shell | v1.0 | 3/3 | Complete | 2026-02-25 |
| 3. Integration | v1.0 | 2/2 | Complete | 2026-02-25 |
| 4. Settings + Drag + Position Persistence | v1.1 | 2/2 | Complete | 2026-02-25 |
| 5. Font Size Selection + Persistence | v1.1 | 1/1 | Complete | 2026-02-25 |
| 6. AppSettings Migration | v1.2 | 1/1 | Complete | 2026-02-25 |
| 7. StatsService | v1.2 | 1/1 | Complete | 2026-02-25 |
| 8. XAML Layout and Stats Display | v1.2 | 2/2 | Complete | 2026-02-26 |
| 9. Controls, Persistence, and Edge Cases | v1.2 | 1/1 | Complete | 2026-02-26 |
| 10. Individual Stat Row Visibility | v1.3 | 2/2 | Complete | 2026-02-26 |
| 11. PAG Stat Row | v1.4 | 2/2 | Complete | 2026-02-26 |
| 12. Hover Fast-Refresh | v1.5 | 0/? | Not started | - |

---
*Last updated: 2026-02-26 — Phase 12 roadmap created, v1.5 milestone started*
