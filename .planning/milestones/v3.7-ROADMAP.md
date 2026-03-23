# Roadmap: Fuzzy Clock

## Milestones

- ✅ **v1.0 MVP** - Phases 1-3 (shipped 2026-02-25)
- ✅ **v1.1 Position + Font Size** - Phases 4-5 (shipped 2026-02-25)
- ✅ **v1.2 System Stats** - Phases 6-9 (shipped 2026-02-26)
- ✅ **v1.3 Individual Stat Visibility** - Phase 10 (shipped 2026-02-26)
- ✅ **v1.4 PAG Stat Row** - Phase 11 (shipped 2026-02-26)
- ✅ **v1.5 Hover Fast-Refresh** - Phase 12 (shipped 2026-02-26)
- ✅ **v1.6 Dial Mode** - Phase 13 (shipped 2026-02-26)
- ✅ **v1.7 Visual Polish** - Phase 14 (shipped 2026-02-26)
- ✅ **v1.8 Dial Enhancement** - Phases 15-16 (shipped 2026-02-26)
- ✅ **v1.9 Context-Aware Menus** - Phase 17 (shipped 2026-02-26)
- ✅ **v2.0 Visual Identity** - Phases 18-21 (shipped 2026-02-27)
- ✅ **v2.1 Uptime** - Phases 22-23 (shipped 2026-02-27)
- ✅ **v2.2 System Tray** - Phase 24 (shipped 2026-03-02)
- ✅ **v2.3 Ghost Mode** - Phases 25-27 (shipped 2026-03-02)
- ✅ **v2.5 Unit Tests** - Phases 28-30 (shipped 2026-03-03)
- ✅ **v2.6 Polish** - Phases 31-32 (shipped 2026-03-03)
- ✅ **v2.7 Auto-Contrast** - Phase 33 (shipped 2026-03-03)
- ✅ **v2.8 Uptime and Docs** - Phase 34 (shipped 2026-03-04)
- ✅ **v2.9 Process Threshold** - Phase 35 (shipped 2026-03-05)
- ✅ **v3.1 Quality + Battery** - Phases 37-40 (shipped 2026-03-08)
- ✅ **v3.2 Expanded Experience** - Phases 41-47 (shipped 2026-03-09)
- ✅ **v3.5 Phrase Wrap + Installer** - Phases 48-55 (shipped 2026-03-18)
- ✅ **v3.6 Settings Appearance Compact** - Phase 56 (shipped 2026-03-18)
- ✅ **v3.6.1 Contrast Flicker Fix** - Phase 57 (shipped 2026-03-19)
- 🚧 **v3.7 Nixie Clock** - Phases 58-59 (in progress)

## Phases

<details>
<summary>✅ Phases 1-57 — SHIPPED (see MILESTONES.md for details)</summary>

Phases 1-57 are complete. See `.planning/MILESTONES.md` for per-milestone summaries.

</details>

### 🚧 v3.7 Nixie Clock (In Progress)

**Milestone Goal:** Re-introduce the Nixie tube clock face as a selectable clock style in Settings alongside Phrase and Dial.

- [x] **Phase 58: Data Model Foundation** - Migrate AppSettings/SettingsSnapshot from DialMode bool to ClockType enum; resolve novelty provider build errors (completed 2026-03-19)
- [x] **Phase 59: UI Wiring and Build Clean** - Add Nixie button to Settings Clock Style rail; wire Nixie clock face; resolve remaining build errors; remove ContentBorder duplicate backdrop (completed 2026-03-23)

## Phase Details

### Phase 58: Data Model Foundation
**Goal**: AppSettings and SettingsSnapshot use ClockType enum; FuzzyClock.Core compiles clean; existing tests updated
**Depends on**: Phase 57 (v3.6.1 complete)
**Requirements**: NIX-01, NIX-04 (novelty provider GetSegmentKey errors)
**Success Criteria** (what must be TRUE):
  1. `dotnet build FuzzyClock.Core` exits 0 — six novelty providers each implement GetSegmentKey
  2. AppSettings has ClockType field (not DialMode); existing settings.json with dialMode:true upgrades to ClockType.Dial without data loss
  3. SettingsSnapshot has ClockType, LcdUse24Hr, LcdShowSeconds, LcdStyle, ShowHourTicks, ShowMinuteDots, ShowHourNumbers fields
  4. STEST-01 round-trip test passes with new AppSettings fields; absent-field test confirms ClockType defaults to Phrase
**Plans:** 1/1 plans complete

Plans:
- [ ] 58-01-PLAN.md — Add ClockType absent-field test and verify all success criteria

### Phase 59: UI Wiring and Build Clean
**Goal**: Nixie is selectable in Settings, activates the tube clock face on the widget, and the full solution builds with 0 errors
**Depends on**: Phase 58
**Requirements**: NIX-02, NIX-03, NIX-04 (stale _dialMode reference), BACK-05
**Success Criteria** (what must be TRUE):
  1. `dotnet build` exits 0 with 0 errors — no stale _dialMode reference, all 7 events declared in SettingsWindow
  2. Settings window Clock Style rail shows three buttons: Phrase, Dial, Nixie; clicking Nixie immediately activates the Nixie tube clock face on the widget
  3. Selecting Nixie, closing the app, and relaunching restores the Nixie clock face — ClockType.Nixie persists to settings.json
  4. Hovering the widget does not show a secondary backdrop on the clock/phrase area — ContentBorder background is never set in mouse enter/leave handlers
  5. `dotnet test` passes — all existing tests green; 274+ tests with 0 failures
**Plans:** 1/1 plans complete

Plans:
- [x] 59-01-PLAN.md — Remove ContentBorder backdrop assignments and verify build/tests clean

## Progress

**Execution Order:** 58 → 59

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 58. Data Model Foundation | 1/1 | Complete    | 2026-03-19 | - |
| 59. UI Wiring and Build Clean | v3.7 | 1/1 | Complete    | 2026-03-23 |
