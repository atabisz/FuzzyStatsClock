---
gsd_state_version: 1.0
milestone: v4.3
milestone_name: Configurable Ghost Override
status: in-progress
last_updated: "2026-05-07T16:40:00.000Z"
last_activity: 2026-05-07 — Phase 83 complete (GhostModeController refactored with configurable modifier detection; MainWindow integration pending Phase 84)
progress:
  total_phases: 4
  completed_phases: 3
  total_plans: 5
  completed_plans: 5
---

---
gsd_state_version: 1.0
milestone: v4.2
milestone_name: Temps & Menu
status: complete
last_updated: "2026-05-04T15:30:00.000Z"
last_activity: 2026-05-04 — Phase 80 complete; NOTICES + CI gates + installer line + tripwire validated; milestone v4.2 is 6/6 complete
progress:
  total_phases: 6
  completed_phases: 6
  total_plans: 10
  completed_plans: 10
---

# Project State: FuzzyStatsClock v4.3

**Milestone:** v4.3 Configurable Ghost Override
**Status:** in-progress
**Last updated:** 2026-05-07

## Project Reference

**Core value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.

**Current focus:** Let users customize which modifier keys suppress Ghost Mode instead of hardcoded Ctrl+Alt.

## Current Position

**Phase:** 83 (Runtime Detection) — complete
**Plan:** 2/2 plans executed (controller refactored, tests passing)
**Status:** Phase 83 complete — MainWindow integration deferred to Phase 84 (codebase currently non-buildable per phase design)
**Progress:** ████████████░░ 75% (3/4 phases complete, 3/4 planned)

## Performance Metrics

**Phases planned:** 4
**Requirements coverage:** 22/22 (100%) ✓
**Parallel execution available:** Yes (Phase 82 and 83 can run simultaneously)

## Accumulated Context

### Decisions Log

1. **Four-phase structure** (2026-05-07) — Foundation (Phase 81) → parallel UI+Controller (Phase 82+83) → Integration (Phase 84); enables parallel execution of phases 2 and 3
2. **Init-property defaults (true, true, false)** (2026-05-07) — Preserves Ctrl+Alt behavior for users upgrading from v4.2; explicit init defaults prevent JSON absent-field false-default issue
3. **Left-side VK codes only** (2026-05-07) — VK_LCONTROL, VK_LMENU, VK_LSHIFT prevent AltGr false-positives on EU keyboards (v2.3 lesson)
4. **All-unchecked = override disabled** (2026-05-07) — Clear semantics: all-false means ghost always activates regardless of held keys
5. **AND logic (not OR)** (2026-05-07) — When multiple modifiers enabled, ALL must be held simultaneously to suppress ghost; prevents single-key sensitivity issue
6. **Phase 83: UpdateModifierConfig property setter** (2026-05-07) — Controller gets public UpdateModifierConfig(bool, bool, bool) method; called from ApplySettings + event handlers; instant config changes without controller recreation
7. **Phase 83: IsModifierHeld() public for testing** (2026-05-07) — Rename IsCtrlAltHeld → IsModifierHeld, make public for direct unit testing; [DataRow] x8 parametric test covers all 2³ combinations
8. **Phase 83: Short-circuit all-false in OnTimerTick** (2026-05-07) — When all three bools false, skip IsModifierHeld call entirely; satisfies DET-02 via never calling method when disabled

### Active TODOs

- Plan Phase 84 (Integration) — wire MainWindow to use IsModifierHeld + UpdateModifierConfig
- Phase 83 complete — controller refactored but MainWindow still references old IsCtrlAltHeld (2 call sites at lines 1065 and 1539 need updating)

### Known Blockers

None.

### Research Notes

**From research/SUMMARY.md (2026-05-07):**
- Zero new dependencies required (GetAsyncKeyState since v2.3, Settings checkboxes since v3.2)
- Phase 82 and 83 have zero cross-dependencies → can execute in parallel
- All phases use standard patterns validated in production code

**Critical pitfalls flagged:**
1. Checkbox state corruption if `_suppressEvents` guard omitted (Phase 82)
2. VK code mapping mismatch if labels not "Left Ctrl/Alt/Shift" (Phase 82)
3. All-unchecked undefined behavior if semantics not locked (Phase 83)
4. GetAsyncKeyState mask must use `& 0x8000` not `!= 0` (Phase 83)

## Session Continuity

**Stopped at:** Phase 83 complete (2/2 plans executed)
**Resume file:** `.planning/phases/83-runtime-detection/83-02-SUMMARY.md`
**Next action:** `/clear` then `/gsd-plan-phase 84` to plan MainWindow integration

**When returning:**
1. Read this STATE.md to understand where we are
2. Plan Phase 84 (Integration) — 3 sites need wiring: ApplySettings initialization, event handler updates, UpdateModifierConfig calls
3. Note: Codebase currently non-buildable (MainWindow.xaml.cs lines 1065 and 1539 call removed IsCtrlAltHeld method) — expected intermediate state per phase design

**Recent milestone:** v4.2 Temps & Menu shipped 2026-05-04 (562 MSTest green, 66 commits, MPL-2.0 compliance complete)

---
*State initialized: 2026-05-07*
*Current milestone phase numbering starts at 81 (continues from v4.2's Phase 80)*
