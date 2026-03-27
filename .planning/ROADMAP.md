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
- ✅ **v3.8 Dial Settings** - Phase 60 (shipped 2026-03-23)
- ✅ **v3.9 LCD Clock + Japanese Styles** - Phases 61-65 (shipped 2026-03-27)
- 🚧 **v4.0 Proximity Ghost Mode** - Phases 66-69 (in progress)

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

<details>
<summary>✅ v3.8 Dial Settings (Phase 60) — SHIPPED 2026-03-23</summary>

- [x] Phase 60: Dial Decoration Settings UI (1/1 plans) — completed 2026-03-23

Full details: `.planning/milestones/v3.8-ROADMAP.md`

</details>

<details>
<summary>✅ v3.9 LCD Clock + Japanese Styles (Phases 61-65) — SHIPPED 2026-03-27</summary>

- [x] Phase 61: Japanese Phrase Providers (2/2 plans) — completed 2026-03-24
- [x] Phase 62: Routing Consolidation (1/1 plans) — completed 2026-03-26
- [x] Phase 63: SettingsWindow LCD UI (1/1 plans) — completed 2026-03-27
- [x] Phase 64: Blinking Colon (1/1 plans) — completed 2026-03-27
- [x] Phase 65: Settings Persistence Hardening (1/1 plans) — completed 2026-03-27

Full details: `.planning/milestones/v3.9-ROADMAP.md`

</details>

### v4.0 Proximity Ghost Mode (In Progress)

**Milestone Goal:** Extend ghost mode so the widget fades out gradually as the cursor approaches, rather than snapping invisible on mouse entry.

- [x] **Phase 66: AppSettings Foundation** - Add GhostFadeRadiusPx field with validation, tests, and ResetToDefaults coverage (completed 2026-03-27)
- [x] **Phase 67: GhostModeController Extension** - Proximity ratio computation, controller events, and unit tests for ComputeProximityRatio (completed 2026-03-27)
- [ ] **Phase 68: MainWindow Wiring + Contrast Guard** - Wire proximity fade into opacity, drag guard, ghost toggle gate, and auto-contrast skip predicate
- [ ] **Phase 69: SettingsWindow UI** - Fade radius slider in Behavior tab with ghost mode gating and persistence

## Phase Details

### Phase 66: AppSettings Foundation
**Goal**: AppSettings and SettingsService fully support the new GhostFadeRadiusPx field — zero behavioral change to the running widget, full data model safety before any controller code lands
**Depends on**: Phase 65 (v3.9 complete)
**Requirements**: PROX-12
**Success Criteria** (what must be TRUE):
  1. AppSettings JSON round-trip test for GhostFadeRadiusPx passes — field serializes and deserializes correctly
  2. Absent-field test passes — old settings.json without GhostFadeRadiusPx deserializes to 80px default (not 0)
  3. SettingsService.Validate() clamps out-of-range values (e.g. -1, 999) to the valid range without throwing
  4. ResetToDefaults() restores GhostFadeRadiusPx to 80px (field is not silently omitted from reset)
**Plans:** 1/1 plans complete
Plans:
- [x] 66-01-PLAN.md — Add GhostFadeRadiusPx field, validation, defaults, and tests (completed 2026-03-27)

### Phase 67: GhostModeController Extension
**Goal**: GhostModeController can compute a proximity ratio from cursor position and emit it as an event — pure computational logic fully unit-tested before any opacity change touches the live widget
**Depends on**: Phase 66
**Requirements**: PROX-01, PROX-02, PROX-03, PROX-04, PROX-05, PROX-08, PROX-13
**Success Criteria** (what must be TRUE):
  1. ComputeProximityRatio unit tests pass: cursor outside zone returns 0.0, cursor at zone boundary returns proportional ratio, cursor inside widget returns 1.0, zero-radius returns 1.0 (instant-snap compat)
  2. Ctrl+Alt held while cursor is in the proximity zone: ProximityRatio is forced to 0.0 (no fade suppression side effect)
  3. WS_EX_TRANSPARENT is applied only when ProximityRatio reaches exactly 1.0 (Activating event path), never during the fade gradient
  4. Symmetric restore: as cursor retreats from proximity zone, ProximityChanged fires with decreasing ratio values (fade-in, not snap)
  5. All existing GHOST-01/GHOST-02/CTRLALT-01/CTRLALT-02 test outcomes are unaffected (zero-radius path unchanged)
**Plans:** 1/1 plans complete
Plans:
- [x] 67-01-PLAN.md -- ComputeProximityRatio TDD + controller timer/event extension (completed 2026-03-27)

### Phase 68: MainWindow Wiring + Contrast Guard
**Goal**: The live widget applies proximity fade to this.Opacity on every controller tick — ghost toggle gates the behavior, drag pauses it, and the auto-contrast sampler skips during any fade state
**Depends on**: Phase 67
**Requirements**: PROX-09, PROX-10, PROX-11
**Success Criteria** (what must be TRUE):
  1. When Ghost Mode is disabled via the tray toggle, approaching the widget has no effect on its opacity — widget stays at configured opacity
  2. While dragging the widget, opacity stays at configured opacity regardless of cursor proximity — widget does not fade during drag
  3. Auto-contrast sampler skips sampling whenever ProximityRatio > 0.0 — no WCAG oscillation feedback during the fade gradient
  4. _windowOpacity (configured preference) is never overwritten by the proximity fade callback — only this.Opacity is modified
**Plans:** 1 plan
Plans:
- [ ] 68-01-PLAN.md — IsEnabled gate + ProximityChanged opacity wiring + contrast predicate + legacy ghost block deletion

### Phase 69: SettingsWindow UI
**Goal**: Users can configure the proximity fade radius via a slider in Settings > Behavior, with the slider enabled only when Ghost Mode is on and changes applying live to the widget
**Depends on**: Phase 68
**Requirements**: PROX-06, PROX-07
**Success Criteria** (what must be TRUE):
  1. Settings > Behavior tab shows a proximity fade radius slider with range 20–200px and a px value label that updates as the slider moves
  2. Moving the slider immediately changes the fade radius on the live widget — user can see the effect without closing Settings
  3. Fade radius persists to settings.json and is correctly restored after an app restart
  4. The slider is disabled (grayed out) when Ghost Mode is unchecked in the same Behavior tab
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 66. AppSettings Foundation | v4.0 | 1/1 | Complete    | 2026-03-27 |
| 67. GhostModeController Extension | v4.0 | 1/1 | Complete    | 2026-03-27 |
| 68. MainWindow Wiring + Contrast Guard | v4.0 | 0/1 | In progress | - |
| 69. SettingsWindow UI | v4.0 | 0/TBD | Not started | - |
