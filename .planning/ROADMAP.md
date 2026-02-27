# Roadmap: Fuzzy Clock

## Milestones

- **v1.0 MVP** (2026-02-25) — Phrase engine, transparent WPF overlay, full integration. 3 phases, 7 plans. → [Archive](milestones/v1.0-ROADMAP.md)
- **v1.1 Position + Font Size** (2026-02-25) — Drag reposition, position persistence, font size selector. 2 phases, 3 plans. → [Archive](milestones/v1.1-ROADMAP.md)
- **v1.2 System Stats** (2026-02-26) — CPU / GPU / MEM stats panel, update interval selector, show/hide toggle, persistence. 4 phases, 5 plans. → [Archive](milestones/v1.2-ROADMAP.md)
- **v1.3 Individual Stat Visibility** (2026-02-26) — Per-row CPU/GPU/MEM visibility toggles, auto-collapse, persistence. 1 phase, 2 plans. → [Archive](milestones/v1.3-ROADMAP.md)
- **v1.4 PAG Stat Row** (2026-02-26) — Paging file % usage as fourth stat row, visibility toggle, persistence. 1 phase, 2 plans. → [Archive](milestones/v1.4-ROADMAP.md)
- **v1.5 Hover Fast-Refresh** (2026-02-26) — Mouse-hover accelerates stats to 0.5s cadence; leave restores configured rate; guarded when stats hidden. 1 phase, 1 plan. → [Archive](milestones/v1.5-ROADMAP.md)
- **v1.6 Dial Mode** (2026-02-26) — Minimal analog dial (hour + minute hands, no face) toggle via right-click menu; persisted; stats panel unaffected. 1 phase, 2 plans. → [Archive](milestones/v1.6-ROADMAP.md)
- **v1.7 Visual Polish** (2026-02-26) — Hover backdrop (semi-transparent when stats visible), drag pause. 1 phase, 1 plan. → [Archive](milestones/v1.7-ROADMAP.md)
- **v1.8 Dial Enhancement** (2026-02-26) — Unconditional hover backdrop fix; dial face decorations (tick marks, minute marks, hour numbers) with per-item toggles, persistence, and mode-conditional menu visibility. 2 phases, 3 plans. → [Archive](milestones/v1.8-ROADMAP.md)
- **v1.9 Context-Aware Menus** (2026-02-26) — Font Size submenu hidden in dial mode; reappears in phrase mode. 1 phase, 2 plans. → [Archive](milestones/v1.9-ROADMAP.md)
- ✅ **v2.0 Visual Identity** (2026-02-27) — Accent color themes (5 presets + custom picker) and window opacity control (presets + scroll wheel). 4 phases, 7 plans. → [Archive](milestones/v2.0-ROADMAP.md)
- ✅ **v2.1 Uptime** (2026-02-27) — System uptime and rolling CPU load averages (1m/5m/15m) as a compact single line below the stats panel; toggleable and persisted. 2 phases, 2 plans. → [Archive](milestones/v2.1-ROADMAP.md)

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
<summary>v1.2 System Stats (Phases 6-9) — SHIPPED 2026-02-26</summary>

- [x] **Phase 6: AppSettings Migration** — Convert AppSettings to init-property record, add StatsVisible + StatsIntervalSeconds fields, guard against zero-interval on old JSON (completed 2026-02-25)
- [x] **Phase 7: StatsService** — New StatsService.cs with async init, CPU counter priming, GPU multi-instance enumeration, IDisposable (completed 2026-02-25)
- [x] **Phase 8: XAML Layout and Stats Display** — Grid RowDefinitions, StatsPanel with fixed Width, three stat rows (label + bar + % text), UpdateStatsDisplay wired to DispatcherTimer; human-verified live bars, Collapsed state = v1.1 identity, Stats context menu confirmed (completed 2026-02-26)
- [x] **Phase 9: Controls, Persistence, and Edge Cases** — SetStatsVisible, SetStatsInterval, ContextMenu_Opened sync, ApplySettings new fields, OnClosing disposal order (completed 2026-02-26)

</details>

<details>
<summary>v1.3 Individual Stat Visibility (Phase 10) — SHIPPED 2026-02-26</summary>

- [x] **Phase 10: Individual Stat Row Visibility** — Per-row CPU/GPU/MEM toggle menu items, auto-collapse when all rows hidden, persistence of three new bool fields (completed 2026-02-26)

</details>

<details>
<summary>v1.4 PAG Stat Row (Phase 11) — SHIPPED 2026-02-26</summary>

- [x] **Phase 11: PAG Stat Row** — AppSettings.PagVisible + StatsService PDH counter + XAML PagRow Grid + MenuPagVisible MenuItem + six MainWindow.xaml.cs integration points; auto-collapse extended to 4 rows; all STAT-11–STAT-15 human-verified (completed 2026-02-26)

</details>

<details>
<summary>v1.5 Hover Fast-Refresh (Phase 12) — SHIPPED 2026-02-26</summary>

- [x] **Phase 12: Hover Fast-Refresh** — MouseEnter/MouseLeave handlers switch `_statsTimer` interval to 0.5s on hover and restore `_statsIntervalSeconds` on leave, guarded by StatsPanel visibility (completed 2026-02-26)

</details>

<details>
<summary>v1.6 Dial Mode (Phase 13) — SHIPPED 2026-02-26</summary>

- [x] **Phase 13: Dial Mode** — AppSettings.DialMode field + XAML DialCanvas with hour/minute Line elements + context menu toggle + trig wiring + persistence + human verify (completed 2026-02-26)

</details>

### v1.7 Visual Polish (Phase 14) — SHIPPED 2026-02-26

- [x] **Phase 14: Hover Backdrop + Drag Pause** — Removed hardcoded #26000000 Border background; added hover-conditional #59000000 backdrop when stats visible; _statsTimer stop/start guard around DragMove(); all four requirements (BACK-01/02/03, DRAG-01) human-verified (completed 2026-02-26)

### v1.8 Dial Enhancement (Phases 15-16) — SHIPPED 2026-02-26

- [x] **Phase 15: Unconditional Hover Backdrop** — Moved ContentBorder.Background assignment before StatsPanel.Visibility guard in Window_MouseEnter; backdrop now shows on hover unconditionally; BACK-04 human-verified (completed 2026-02-26)
- [x] **Phase 16: Dial Face Decorations** — XAML geometry for hour tick marks, minute dots, and hour number labels on DialCanvas; AppSettings bool fields; Dial submenu with three IsCheckable items; menu items hidden in phrase mode; persistence; DIAL-06, DIAL-07, DIAL-08, DIAL-09 (completed 2026-02-26)

<details>
<summary>v1.9 Context-Aware Menus (Phase 17) — SHIPPED 2026-02-26</summary>

- [x] **Phase 17: Context-Aware Font Size Menu** — Font Size submenu hidden when dial mode is active; reappears when switching to phrase mode; mirrors the DIAL-09 pattern established in Phase 16 (completed 2026-02-26)

</details>

<details>
<summary>✅ v2.0 Visual Identity (Phases 18-21) — SHIPPED 2026-02-27</summary>

- [x] **Phase 18: AppSettings Schema Extension** — Add AccentColor (hex string, default #FFFFFFFF) and Opacity (double, default 1.0) fields with backward-compat init defaults and load-time guards; schema locked for Phases 19-21 (completed 2026-02-27)
- [x] **Phase 19: Window Opacity** — Opacity submenu (25/50/75/100%), scroll wheel adjustment (10% increments, 0.10 floor), Window.Opacity applied to entire widget window, persisted and restored (completed 2026-02-27)
- [x] **Phase 20: Accent Color Presets** — ApplyTheme() covering all 14+ accent elements, Theme submenu with 5 named presets, checkmark sync in ContextMenu_Opened, ContentRendered ordering constraint enforced, persisted as hex string (completed 2026-02-27)
- [x] **Phase 21: Custom Color Picker** — UseWindowsForms=true in csproj, Win32Window HWND owner helper, ColorDialog integration, custom color persists as hex, no preset checkmark when custom active (completed 2026-02-27)

</details>

<details>
<summary>✅ v2.1 Uptime (Phases 22-23) — SHIPPED 2026-02-27</summary>

- [x] **Phase 22: Infrastructure and Toggle** — AppSettings.UptimeVisible (default true), UptimeText TextBlock inside StatsPanel StackPanel (auto-hides with stats), MenuUptimeVisible IsCheckable toggle in Stats submenu, full settings plumbing (ApplySettings/SaveSettings/ContextMenu_Opened/ApplyTheme/SetUptimeRowVisible) (completed 2026-02-27)
- [x] **Phase 23: Data Display** — StatsService.IsReady property, Environment.TickCount64 uptime formatting (up Xd Xh Xm, leading zero-unit suppressed), Queue<float> rolling CPU averages for 1m/5m/15m with IsReady guard and hover-fast-refresh exclusion, UpdateUptimeDisplay() wired to _statsTimer.Tick (completed 2026-02-27)

</details>

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
**Plans**: 1 plan

Plans:
- [x] 12-01-PLAN.md — Wire Window_MouseEnter/Window_MouseLeave in ContentRendered lambda; Stop+set+Start pattern on _statsTimer; guard on StatsPanel.Visibility; _statsIntervalSeconds read-only in hover handlers; human verify all 4 checks

### Phase 13: Dial Mode
**Goal**: Users can switch between the fuzzy phrase display and a minimal analog dial (hour and minute hands only, no face) via the right-click menu, with the selected mode persisted across restarts and the stats panel unaffected
**Depends on**: Phase 12
**Requirements**: DIAL-01, DIAL-02, DIAL-03, DIAL-04, DIAL-05
**Success Criteria** (what must be TRUE):
  1. Right-clicking the widget reveals a "Dial Mode" menu item; clicking it toggles between phrase mode and dial mode, and the checkmark reflects the current mode every time the menu opens
  2. In dial mode, the widget shows two white lines (hour hand shorter, minute hand longer) on a transparent background with no clock face, circle, or numbers
  3. The hour and minute hands point to the correct positions for the current time, and hands visibly update to a new position when the minute changes
  4. The stats panel (when enabled) appears below the dial in dial mode, exactly as it does below the phrase in phrase mode
  5. Closing and relaunching the widget restores the last-selected clock mode (phrase or dial) without requiring the user to re-select it
**Plans**: 2 plans

Plans:
- [x] 13-01-PLAN.md — AppSettings.DialMode init-property + XAML DialCanvas with HourHand/MinuteHand Line elements + MenuDialMode IsCheckable MenuItem stub
- [x] 13-02-PLAN.md — Wire SetDialMode/UpdateDialDisplay trig, timer hook, ApplySettings/SaveSettings/ContextMenu_Opened integration; human verify all 5 DIAL criteria

### Phase 14: Hover Backdrop + Drag Pause
**Goal**: The widget background is fully transparent by default and shows a semi-transparent backdrop only when the mouse is hovering with stats visible; stats updates pause during drag and resume immediately after
**Depends on**: Phase 13
**Requirements**: BACK-01, BACK-02, BACK-03, DRAG-01
**Success Criteria** (what must be TRUE):
  1. With the stats panel visible, moving the mouse over the widget causes the widget background to become semi-transparent (~35% black); the backdrop is clearly visible on both light and dark wallpapers
  2. Moving the mouse away from the widget (with stats visible) immediately returns the background to fully transparent
  3. With the stats panel hidden, the widget background remains fully transparent regardless of whether the mouse is over the widget
  4. While dragging the widget, stat values do not update; immediately after releasing the drag, stats resume updating at the configured interval
**Plans**: 1 plan

Plans:
- [x] 14-01-PLAN.md — Remove hardcoded Border background; wire hover backdrop (#59000000) in MouseEnter/MouseLeave; guard DragMove with timer stop/start; human verify all 4 criteria

### Phase 15: Unconditional Hover Backdrop
**Goal**: The widget background becomes semi-transparent on hover regardless of whether the stats panel is visible
**Depends on**: Phase 14
**Requirements**: BACK-04
**Success Criteria** (what must be TRUE):
  1. With the stats panel hidden, moving the mouse over the widget causes the widget background to become semi-transparent (~35% black)
  2. Moving the mouse away clears the backdrop immediately in all cases (stats visible or hidden)
  3. With the stats panel visible, hover backdrop behavior is unchanged from v1.7 (backdrop still appears and clears correctly)
**Plans**: 1 plan

Plans:
- [x] 15-01-PLAN.md — Restructure Window_MouseEnter so backdrop appears on hover unconditionally (BACK-04)

### Phase 16: Dial Face Decorations
**Goal**: In dial mode, users can independently show or hide hour tick marks, minute dots, and hour number labels via the right-click menu, with all preferences persisted across restarts and the decoration menu items hidden in phrase mode
**Depends on**: Phase 15
**Requirements**: DIAL-06, DIAL-07, DIAL-08, DIAL-09
**Success Criteria** (what must be TRUE):
  1. In dial mode, right-clicking reveals a Dial Face submenu containing Show Hour Ticks, Show Minute Marks, and Show Hour Numbers menu items, each with a checkmark reflecting their current state
  2. Toggling Show Hour Ticks draws or removes 12 short lines at each hour position on the DialCanvas
  3. Toggling Show Minute Marks draws or removes 60 small dots at each minute position on the DialCanvas
  4. Toggling Show Hour Numbers draws or removes the labels 1-12 at each hour position on the DialCanvas
  5. All three decoration preferences survive a full app restart; switching to phrase mode hides the Dial Face submenu entirely and switching back to dial mode restores it
**Plans**: 2 plans

Plans:
- [x] 16-01-PLAN.md — Add AppSettings fields (ShowHourTicks/ShowMinuteDots/ShowHourNumbers); XAML Dial Face submenu; InitDialDecorations() + toggle methods + full wiring in MainWindow.xaml.cs
- [x] 16-02-PLAN.md — Human verify all five DIAL-06/07/08/09 success criteria

### Phase 17: Context-Aware Font Size Menu
**Goal**: The right-click menu shows only relevant size controls for the active display mode — Font Size submenu hidden in dial mode and restored when switching to phrase mode
**Depends on**: Phase 16
**Requirements**: MENU-01
**Success Criteria** (what must be TRUE):
  1. In phrase mode, the Font Size submenu is present in the right-click context menu and functions normally (Small / Medium / Large items visible, checkmark on active size)
  2. Switching to dial mode via the right-click "Dial Mode" item causes the Font Size submenu to disappear from the menu on the next and all subsequent menu opens
  3. Switching back to phrase mode causes the Font Size submenu to reappear in the menu on the next open
  4. Font size preference is preserved across mode switches — switching to dial mode and back to phrase mode shows the same font size as before
**Plans**: 2 plans

Plans:
- [x] 17-01-PLAN.md — Add x:Name="MenuFontSize" to XAML and wire MenuFontSize.Visibility in ContextMenu_Opened and SetDialMode
- [x] 17-02-PLAN.md — Human verify all four MENU-01 success criteria

### Phase 18: AppSettings Schema Extension
**Goal**: The settings layer can store and round-trip AccentColor and Opacity values without breaking existing v1.9 settings files or producing a transparent-on-first-launch regression
**Depends on**: Phase 17 (v1.9 complete)
**Requirements**: THEME-04, OPAC-04
**Success Criteria** (what must be TRUE):
  1. Widget launched with a v1.9 settings.json (AccentColor and Opacity fields absent) starts with white accent and full opacity — no invisible widget, no exception thrown
  2. Widget launched with a freshly deleted settings.json uses AccentColor="#FFFFFFFF" and Opacity=1.0 as defaults without any code needing to handle null fields
  3. AccentColor and Opacity values written by SaveSettings() are read back correctly on the next launch, preserving any non-default values
  4. A settings.json with Opacity=0.0 (C# double default from malformed JSON) is corrected to 1.0 on load by the guard, preventing the invisible-widget regression
**Plans**: 1 plan

Plans:
- [x] 18-01-PLAN.md — Extend AppSettings record with AccentColor/Opacity fields; update SettingsService Defaults() and Load() guards; verify round-trip

### Phase 19: Window Opacity
**Goal**: Users can set the widget's overall transparency from the right-click menu or by scrolling, and find their chosen opacity restored on every launch
**Depends on**: Phase 18
**Requirements**: OPAC-01, OPAC-02, OPAC-03
**Success Criteria** (what must be TRUE):
  1. Right-clicking the widget reveals an Opacity submenu with four entries (25%, 50%, 75%, 100%); the currently active level has a checkmark every time the menu opens
  2. Clicking an opacity preset immediately changes the widget's visual transparency — phrase text, dial hands, stats bars, hover backdrop, and all widget content fade uniformly to the selected level
  3. Scrolling the mouse wheel over the widget adjusts opacity in 10% increments; scrolling down reduces opacity and scrolling up increases it; the widget never becomes fully invisible (floor of 10%)
  4. Opacity applied via the scroll wheel persists across restarts — closing and relaunching the widget restores the scroll-adjusted opacity, not just the last preset-menu value
**Plans**: 2 plans

Plans:
- [x] 19-01-PLAN.md — Add Opacity submenu XAML and implement runtime opacity logic (presets + scroll wheel + persistence)
- [x] 19-02-PLAN.md — Human verify all four Phase 19 success criteria

### Phase 20: Accent Color Presets
**Goal**: Users can choose from five named color presets and see the chosen accent color applied instantly and consistently across every colored element in the widget, persisted across restarts
**Depends on**: Phase 19
**Requirements**: THEME-01, THEME-03
**Success Criteria** (what must be TRUE):
  1. Right-clicking the widget reveals a Theme submenu with five named preset entries (White, Amber, Ice Blue, Green, Hello Kitty Pink); the currently active preset has a checkmark every time the menu opens
  2. Clicking a preset immediately recolors the phrase text, both dial hands, all dial decoration elements (tick marks, minute dots, hour number labels), all four stats fill bars, and all four stats percentage text values to the selected accent color
  3. Bar track backgrounds and the shadow text element are not affected by accent color changes — they remain visually neutral after any preset selection
  4. Closing and relaunching the widget restores the last-selected accent color preset without requiring re-selection
**Plans**: 2 plans

Plans:
- [x] 20-01-PLAN.md — Add _accentColor field, 5 preset Color constants, ApplyTheme(), SetAccentColor(), 5 click handlers; extend ApplySettings/SaveSettings/ContextMenu_Opened/ContentRendered; add Theme submenu XAML
- [x] 20-02-PLAN.md — Human verify all four Phase 20 success criteria

### Phase 21: Custom Color Picker
**Goal**: Users can set any arbitrary accent color via the system color picker dialog, with the custom color applied immediately and persisted exactly like a preset
**Depends on**: Phase 20
**Requirements**: THEME-02
**Success Criteria** (what must be TRUE):
  1. The Theme submenu contains a "Custom..." entry below the five presets; clicking it opens the native Windows color picker dialog in front of the always-on-top widget
  2. Selecting a color in the dialog and confirming immediately applies that color across all accent-colored elements (same elements as preset selection)
  3. Canceling the color picker dialog leaves the current accent color unchanged
  4. After selecting a custom color, no preset entry in the Theme submenu has a checkmark — the menu correctly reflects that a non-preset color is active
  5. Closing and relaunching the widget restores the custom color exactly as chosen, not rounded to the nearest preset
**Plans**: 2 plans

Plans:
- [x] 21-01-PLAN.md — Add UseWindowsForms flag, Custom... MenuItem (XAML), Win32Window adapter + MenuThemeCustom_Click handler (code-behind)
- [x] 21-02-PLAN.md — Human verify all five THEME-02 success criteria

### Phase 22: Infrastructure and Toggle
**Goal**: Users can see a placeholder uptime row below the stats panel, toggle its visibility from the right-click Stats submenu, and find that preference persisted across restarts, with the accent color applied correctly from launch
**Depends on**: Phase 21 (v2.0 complete)
**Requirements**: UPT-02
**Success Criteria** (what must be TRUE):
  1. After launching the widget (including first launch and upgrade from v2.0 with no UptimeVisible in settings.json), the uptime row is visible below the stats panel showing a placeholder value, styled in the active accent color
  2. Right-clicking the widget reveals a "Show Uptime" toggle in the Stats submenu; clicking it hides or shows the uptime row, and the checkmark reflects the current state every time the menu opens
  3. Hiding the uptime row does not affect the stats panel, and hiding the stats panel does not affect the uptime row — each is independently controlled
  4. The UptimeVisible state survives a full app restart: closing and relaunching the widget restores the last-chosen visibility without requiring re-selection
  5. Changing the accent color while the uptime row is visible immediately recolors the uptime text — ApplyTheme() covers the UptimeText element
**Plans**: 1 plan

Plans:
- [x] 22-01-PLAN.md — AppSettings.UptimeVisible field, XAML UptimeText row, Stats submenu toggle, full code-behind wiring (ApplySettings/SaveSettings/ContextMenu_Opened/SetUptimeRowVisible/ApplyTheme)

### Phase 23: Data Display
**Goal**: The uptime row shows live system uptime and rolling CPU load averages (1m/5m/15m) that accurately reflect actual system state, update on every stats timer tick, and survive hover fast-refresh and StatsService cold-start without displaying incorrect values
**Depends on**: Phase 22
**Requirements**: UPT-01
**Success Criteria** (what must be TRUE):
  1. The uptime row displays `up Xd Xh Xm` with leading zero-units suppressed: a system up for 5 hours 3 minutes shows `up 5h 3m`, not `up 0d 5h 3m`; a system up for more than a day shows all three components
  2. Three CPU load averages appear alongside the uptime value as decimal numbers (`0.52  0.47  0.43`), styled in the active accent color, and update each stats timer tick
  3. The 1m/5m/15m load averages do not show artificially depressed values during the first minute after launch — the rolling buffer is guarded against StatsService cold-start zero samples
  4. Switching to hover fast-refresh (0.5s cadence) does not corrupt the rolling average window sizes — the 1m, 5m, and 15m windows continue to represent the correct time spans regardless of how long the mouse hovers
  5. The uptime and load values update correctly at all three configured stats intervals (1s, 3s, 10s) without any timer changes or additional wiring
**Plans**: 1 plan

Plans:
- [x] 23-01-PLAN.md — StatsService.IsReady property, _isHoverFastRefresh flag, _cpuSamples Queue<float>, UpdateUptimeDisplay() with 3-case uptime format + interval-aware averages, ComputeAvg(), expanded _statsTimer.Tick handler

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
| 12. Hover Fast-Refresh | v1.5 | 1/1 | Complete | 2026-02-26 |
| 13. Dial Mode | v1.6 | 2/2 | Complete | 2026-02-26 |
| 14. Hover Backdrop + Drag Pause | v1.7 | 1/1 | Complete | 2026-02-26 |
| 15. Unconditional Hover Backdrop | v1.8 | 1/1 | Complete | 2026-02-26 |
| 16. Dial Face Decorations | v1.8 | 2/2 | Complete | 2026-02-26 |
| 17. Context-Aware Font Size Menu | v1.9 | 2/2 | Complete | 2026-02-26 |
| 18. AppSettings Schema Extension | v2.0 | 1/1 | Complete | 2026-02-27 |
| 19. Window Opacity | v2.0 | 2/2 | Complete | 2026-02-27 |
| 20. Accent Color Presets | v2.0 | 2/2 | Complete | 2026-02-27 |
| 21. Custom Color Picker | v2.0 | 2/2 | Complete | 2026-02-27 |
| 22. Infrastructure and Toggle | v2.1 | 1/1 | Complete | 2026-02-27 |
| 23. Data Display | v2.1 | 1/1 | Complete | 2026-02-27 |

---
*Last updated: 2026-02-27 — Phase 23 planned: 1 plan (23-01-PLAN.md)*
