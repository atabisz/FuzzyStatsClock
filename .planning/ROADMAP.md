# Roadmap: FuzzyStatsClock

## Milestones

- ✅ **v4.2 Temps & Menu** — Phases 75–80 (shipped 2026-05-04) — [archive](./milestones/v4.2-ROADMAP.md)
- ✅ **v4.1 Polish & Phrases** — Phases 70–74 (shipped 2026-04-01) — [archive](./milestones/v4.1-ROADMAP.md)
- ✅ **v4.0 Proximity Ghost Mode** — Phases 66–69 (shipped 2026-03-27) — [archive](./milestones/v4.0-ROADMAP.md)
- ✅ **v3.9 LCD Clock + Japanese** — Phases 61–65 (shipped 2026-03-27) — [archive](./milestones/v3.9-ROADMAP.md)
- ✅ **v3.8 Dial Settings** — Phase 60 (shipped 2026-03-23) — [archive](./milestones/v3.8-ROADMAP.md)
- ✅ **v3.7 Nixie Clock** — Phases 58–59 (shipped 2026-03-23) — [archive](./milestones/v3.7-ROADMAP.md)
- ✅ **v3.6.2 Contrast Fix** — Phase 58 (shipped 2026-03-19) — [archive](./milestones/v3.6.2-ROADMAP.md)
- ✅ **v3.5 Phrase Wrap + Installer** — Phases 48–55 (shipped 2026-03-18) — [archive](./milestones/v3.5-ROADMAP.md)
- ✅ **v3.2 Expanded Experience** — Phases 41–47 (shipped 2026-09-09) — [archive](./milestones/v3.2-ROADMAP.md)
- ✅ **v3.1 Quality + Battery** — Phases 37–40 (shipped 2026-03-08) — [archive](./milestones/v3.1-ROADMAP.md)
- ✅ **v3.0 Date Display** — Phase 36 (shipped 2026-03-07) — [archive](./milestones/v3.0-ROADMAP.md)
- ✅ Earlier milestones (v1.0 – v2.9) — see [archives](./milestones/) + [MILESTONES.md](./MILESTONES.md)

---

## Current Milestone: v4.3 Configurable Ghost Override

**Goal:** Let users customize which modifier keys suppress Ghost Mode instead of hardcoded Ctrl+Alt
**Granularity:** Standard
**Created:** 2026-05-07
**Status:** Planning

## Phases

- [x] **Phase 81: Data Flow** - AppSettings schema + persistence + MSTest round-trip (completed 2026-05-07)
- [x] **Phase 82: Settings UI** - Three modifier checkboxes in Settings > Behavior (completed 2026-05-07)
- [ ] **Phase 83: Runtime Detection** - GhostModeController refactor with configurable VK checks
- [ ] **Phase 84: Integration** - MainWindow wiring + ResetToDefaults + human verification

## Phase Details

### Phase 81: Data Flow
**Goal**: Modifier configuration persists correctly across app restarts and v4.2 upgrades
**Depends on**: Nothing (first phase)
**Requirements**: CFG-01, CFG-02, CFG-03, CFG-04, TST-01, TST-02
**Success Criteria** (what must be TRUE):
  1. User can install v4.3 over v4.2 and app launches with Ctrl+Alt defaults (UseCtrl=true, UseAlt=true, UseShift=false)
  2. User can change modifier configuration, close app, restart, and see exact same configuration loaded
  3. SettingsSnapshot exposes modifier bools so Settings window can populate checkboxes
  4. MSTest round-trip test proves all three modifier bools serialize/deserialize correctly with no silent data loss
  5. MSTest absent-field test proves v4.2 settings.json (missing UseCtrl/UseAlt/UseShift) deserializes with init defaults
**Plans**: 2 plans (TDD first, schema extension)

Plans:
- [x] 81-01-PLAN.md — RED phase: 3 absent-field tests + round-trip extension (Wave 1)
- [x] 81-02-PLAN.md — GREEN phase: AppSettings + SettingsSnapshot schema extension (Wave 2)

### Phase 82: Settings UI
**Goal**: User can see and modify ghost override configuration in Settings window
**Depends on**: Phase 81 (needs AppSettings schema)
**Requirements**: UI-01, UI-02, UI-03, UI-04, UI-05
**Success Criteria** (what must be TRUE):
  1. User opens Settings > Behavior and sees indented sub-panel below Ghost Mode with label "Hold these keys to keep widget visible:"
  2. Sub-panel contains three checkboxes clearly labeled "Left Ctrl", "Left Alt", "Left Shift"
  3. User can check/uncheck each modifier independently with immediate save to settings.json
  4. When Ghost Mode is off, modifier checkboxes are disabled (gray) and cannot be changed
  5. When Ghost Mode is on, modifier checkboxes are enabled and reflect current persisted state
**Plans**: 1 plan (UI layer complete - XAML + code-behind + test scaffold)

Plans:
- [x] 82-01-PLAN.md — GhostOverridePanel with 3 modifier checkboxes + events + PopulateControls + two-site IsEnabled gating (Wave 1) — completed 2026-05-07

### Phase 83: Runtime Detection
**Goal**: GhostModeController correctly detects user-configured modifier combinations
**Depends on**: Phase 81 (needs AppSettings schema)
**Requirements**: DET-01, DET-02, DET-03, DET-04, DET-05, TST-03
**Success Criteria** (what must be TRUE):
  1. User holds only enabled modifiers and widget stays visible (ghost suppressed)
  2. User holds partial combination (e.g., only Ctrl when Ctrl+Alt configured) and widget fades (ghost activates)
  3. User unchecks all modifiers, hovers widget, and widget always fades (override disabled)
  4. MSTest unit tests verify all 8 combinations (2³) including all-false = always-false
  5. EU keyboard users hold Left Ctrl+Left Alt and get correct behavior without AltGr false-positives
**Plans**: 2 plans (TDD + controller refactor)

Plans:
- [x] 83-01-PLAN.md — TDD RED: GhostModeControllerTests with 8 parametric test cases (Wave 1) — completed 2026-05-07
- [x] 83-02-PLAN.md — GREEN: UpdateModifierConfig + IsModifierHeld refactor + OnTimerTick short-circuit (Wave 2) — completed 2026-05-07

### Phase 84: Integration
**Goal**: Modifier configuration wires end-to-end from Settings UI through persistence to runtime behavior
**Depends on**: Phase 82, Phase 83 (needs both UI and controller)
**Requirements**: INT-01, INT-02, INT-03, INT-04, TST-04
**Success Criteria** (what must be TRUE):
  1. User changes modifier checkbox in Settings, hovers widget, and sees immediate behavior change matching new configuration
  2. User clicks Reset to Defaults and sees checkboxes flip to Ctrl+Alt instantly, with widget behavior matching
  3. User unchecks all three modifiers and widget always fades on hover regardless of held keys
  4. User enables Shift-only, holds Shift while hovering, and widget stays visible
  5. Full human verification checklist passes (checkbox state persistence, Reset to Defaults, all-unchecked behavior, modifier combination matrix)
**Plans**: TBD

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 81. Data Flow | 2/2 | Complete | 2026-05-07 |
| 82. Settings UI | 1/1 | Complete | 2026-05-07 |
| 83. Runtime Detection | 2/2 | Complete | 2026-05-07 |
| 84. Integration | 0/? | Not started | - |

## Coverage Summary

**Requirements mapped:** 22/22 ✓

**Requirement → Phase mapping:**
- Phase 81: CFG-01, CFG-02, CFG-03, CFG-04, TST-01, TST-02 (6 requirements)
- Phase 82: UI-01, UI-02, UI-03, UI-04, UI-05 (5 requirements)
- Phase 83: DET-01, DET-02, DET-03, DET-04, DET-05, TST-03 (6 requirements)
- Phase 84: INT-01, INT-02, INT-03, INT-04, TST-04 (5 requirements)

**Orphaned requirements:** None ✓

## Phase Dependencies

```
Phase 81: Data Flow (foundation)
    ↓
    ├─→ Phase 82: Settings UI (parallel)
    └─→ Phase 83: Runtime Detection (parallel)
            ↓
        Phase 84: Integration (end-to-end)
```

## Notes

**Research insights applied:**
- Zero new dependencies — all capabilities validated in production since v2.3 (GetAsyncKeyState) and v3.2 (Settings checkboxes)
- Phase 2 and 3 can execute in parallel (no cross-dependency)
- All phases follow proven patterns from prior milestones

**Critical patterns to preserve:**
- `_suppressEvents` guard in SettingsWindow (Phase 82) — prevents checkbox state corruption during PopulateControls
- Left-side VK codes only (VK_LCONTROL, VK_LMENU, VK_LSHIFT) — AltGr false-positive mitigation from v2.3
- Immediate persistence via `_settings = _settings with { UseX = v }; SaveSettings();` pattern (Phase 84)
- Init-property defaults (true, true, false) for v4.2 upgrade compatibility (Phase 81)

---
*Roadmap created: 2026-05-07*
*Ready for `/gsd:execute-phase 83`*
