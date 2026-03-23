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
- ✅ **v3.7 Nixie Clock** - Phases 58-59 (shipped 2026-03-23)
- 🔄 **v3.8 Dial Settings** - Phase 60 (in progress)

## Phases

<details>
<summary>✅ Phases 1-57 — SHIPPED (see MILESTONES.md for details)</summary>

Phases 1-57 are complete. See `.planning/MILESTONES.md` for per-milestone summaries.

</details>

<details>
<summary>✅ v3.7 Nixie Clock (Phases 58-59) — SHIPPED 2026-03-23</summary>

- [x] Phase 58: Data Model Foundation (1/1 plans) — completed 2026-03-19
- [x] Phase 59: UI Wiring and Build Clean (1/1 plans) — completed 2026-03-23

Full details: `.planning/milestones/v3.7-ROADMAP.md`

</details>

### v3.8 Dial Settings

- [x] **Phase 60: Dial Decoration Settings UI** - Wire three dial decoration checkboxes in Settings Appearance tab with visibility gating and live-apply (completed 2026-03-23)

## Phase Details

### Phase 60: Dial Decoration Settings UI
**Goal**: Users can control dial face decorations from Settings > Appearance, with controls visible only when Dial clock style is active
**Depends on**: Phase 59 (SettingsWindow with ClockType rail; dial decoration backend already complete)
**Requirements**: DIAL-10, DIAL-11
**Success Criteria** (what must be TRUE):
  1. Settings > Appearance shows "Hour Ticks", "Minute Dots", and "Hour Numbers" checkboxes when Dial clock style is selected
  2. The three checkboxes are hidden when Phrase or Nixie clock style is selected
  3. Opening Settings shows each checkbox in the state matching the current persisted value
  4. Toggling any checkbox immediately updates the live widget (decoration appears or disappears without closing Settings)
  5. Decoration state persists to settings.json and restores correctly after app restart
**Plans**: 1 plan
**UI hint**: yes

Plans:
- [x] 60-01-PLAN.md — Add Dial Face checkboxes to Appearance tab with visibility gating and live-apply handlers

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 60. Dial Decoration Settings UI | 1/1 | Complete   | 2026-03-23 |
