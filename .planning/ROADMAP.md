# Roadmap: Fuzzy Clock

## Milestones

- **v1.0 MVP** (2026-02-25) — Phrase engine, transparent WPF overlay, full integration. 3 phases, 7 plans. → [Archive](milestones/v1.0-ROADMAP.md)
- **v1.1 Position + Font Size** — Phases 4-5 (in progress)

## Phases

<details>
<summary>v1.0 MVP (Phases 1-3) - SHIPPED 2026-02-25</summary>

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

### v1.1 Position + Font Size (In Progress)

**Milestone Goal:** User can freely reposition the widget and choose a comfortable font size, with both preferences saved across restarts.

## Phase Details

### Phase 4: Settings Infrastructure + Drag + Position Persistence
**Goal**: Users can drag the widget to any screen position and find it exactly there on next launch
**Depends on**: Phase 3 (v1.0 complete)
**Requirements**: WIN-04, WIN-05
**Success Criteria** (what must be TRUE):
  1. User can drag the widget to any position on any connected monitor and it stays there
  2. After closing and relaunching, the widget appears at the exact position it was dragged to
  3. If the saved position is off-screen (e.g. after disconnecting a monitor), the widget appears in a visible area instead of off-screen
  4. Position is saved immediately after each drag, not only when the app closes
  5. Phrase auto-updates at 5-minute boundaries do not snap the widget back to the top-right corner
**Plans**: 2 plans

Plans:
- [ ] 04-01-PLAN.md — Create AppSettings record and SettingsService (JSON I/O, VirtualScreen clamp, atomic save)
- [ ] 04-02-PLAN.md — Wire settings into App.xaml.cs + MainWindow.xaml.cs + MainWindow.xaml; drag handler; PositionTopRight guards; human verify

### Phase 5: Font Size Selection + Persistence
**Goal**: Users can change the phrase font size and find their chosen size restored on every launch
**Depends on**: Phase 4
**Requirements**: DISP-05, DISP-06
**Success Criteria** (what must be TRUE):
  1. Right-clicking the widget shows a "Font Size" submenu with three labeled options: Small (16pt), Medium (24pt), Large (32pt)
  2. The currently active font size is shown as checked in the menu each time it is opened
  3. Selecting a font size changes the phrase text size immediately, with no layout artifacts
  4. After closing and relaunching, the widget displays the font size that was last selected
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Phrase Engine | v1.0 | 2/2 | Complete | 2026-02-25 |
| 2. Window Shell | v1.0 | 3/3 | Complete | 2026-02-25 |
| 3. Integration | v1.0 | 2/2 | Complete | 2026-02-25 |
| 4. Settings + Drag + Position Persistence | 1/2 | In Progress|  | - |
| 5. Font Size Selection + Persistence | v1.1 | 0/? | Not started | - |

---
*Last updated: 2026-02-25 after Phase 4 plans created*
