# Roadmap: Fuzzy Clock

## Overview

Build a minimal C# WPF desktop widget that displays the current time as a fuzzy English phrase. The work divides into three natural phases that follow the architectural dependency chain: phrase engine first (pure C# logic, fully testable in isolation), transparent window shell second (verify WPF constraints before adding logic), then integration that wires both together and confirms legibility. Every v1 requirement lands in exactly one phase.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Phrase Engine** - Pure C# time-to-phrase logic with full bucket coverage and special cases
- [x] **Phase 2: Window Shell** - Transparent, frameless, always-on-top WPF window with close mechanism
- [ ] **Phase 3: Integration** - Wire engine into window via timer; verify phrase updates and text legibility

## Phase Details

### Phase 1: Phrase Engine
**Goal**: Users can call a verified function that returns the correct fuzzy English phrase for any given DateTime
**Depends on**: Nothing (first phase)
**Requirements**: DISP-01, DISP-02, DISP-03
**Success Criteria** (what must be TRUE):
  1. Given any time input, the function returns a natural English phrase (e.g., "just a little after 11", "quarter past 3", "almost noon")
  2. All 12 five-minute bucket slots per hour map to a distinct phrase
  3. Exactly noon returns "noon" and exactly midnight returns "midnight" (not "12 o'clock")
  4. The function has no WPF dependency and all edge cases pass unit tests
**Plans**: 2 plans

Plans:
- [x] 01-01-PLAN.md — Scaffold .NET solution: classlib + MSTest test project wired together
- [x] 01-02-PLAN.md — TDD cycle: write exhaustive bucket tests (RED), implement PhraseEngine.GetPhrase (GREEN), verify all edge cases

### Phase 2: Window Shell
**Goal**: A transparent, frameless, always-on-top WPF window floats on the desktop with a working close mechanism
**Depends on**: Phase 1
**Requirements**: WIN-01, WIN-02, WIN-03
**Success Criteria** (what must be TRUE):
  1. The window appears with no frame, no background box — text floats directly over the desktop wallpaper
  2. The window stays on top of all other applications, including when other windows are focused
  3. Right-clicking the widget shows a menu with a "Close" option that exits the application
  4. The window does not appear in the Windows taskbar
**Plans**: 3 plans

Plans:
- [x] 02-01-PLAN.md — Scaffold FuzzyClock.App WPF project: dotnet new wpf, add to solution, add Core reference
- [x] 02-02-PLAN.md — Implement transparent overlay: App.xaml/cs (Mutex + hidden owner), MainWindow.xaml/cs (transparency, positioning, close)
- [x] 02-03-PLAN.md — Human visual verification: confirm floating text, always-on-top, no taskbar/Alt+Tab, right-click close, single instance

### Phase 3: Integration
**Goal**: The widget displays the correct fuzzy time phrase on the desktop, updates when the phrase changes, and is legible on any wallpaper
**Depends on**: Phase 2
**Requirements**: DISP-04
**Success Criteria** (what must be TRUE):
  1. The widget shows the correct phrase for the current time when launched
  2. When the clock crosses a 5-minute bucket boundary, the displayed phrase updates within 30 seconds
  3. The phrase text is readable over both light and dark desktop wallpapers
  4. The widget does not drift — after hours of running, the displayed phrase still matches the current time bucket
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Phrase Engine | 2/2 | Complete    | 2026-02-25 |
| 2. Window Shell | 3/3 | Complete    | 2026-02-25 |
| 3. Integration | 0/? | Not started | - |
