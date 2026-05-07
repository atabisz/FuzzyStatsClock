---
phase: 83-runtime-detection
plan: 01
subsystem: testing
tags: tdd, mstest, ghost-mode, modifier-keys

# Dependency graph
requires:
  - phase: 82-settings-ui
    provides: Settings UI foundation for ghost override controls
provides:
  - Test contract for IsModifierHeld behavior (8 DataRow test cases)
  - TDD RED phase complete
affects: [83-02-controller-refactor]

# Tech tracking
tech-stack:
  added: []
  patterns: [TDD RED phase, parametric DataRow testing]

key-files:
  created: [FuzzyClock.App.Tests/GhostModeControllerTests.cs]
  modified: []

key-decisions:
  - "Single parametric test method with 8 DataRow attributes covers all 2³ modifier combinations"
  - "Tests document expected behavior but cannot verify actual keypresses in CI (GetAsyncKeyState limitation)"

patterns-established:
  - "TDD RED phase: tests define contract before implementation"
  - "DataRow parametric testing for GhostModeController follows existing SettingsServiceTests pattern"

requirements-completed: [TST-03]

# Metrics
duration: 5 min
completed: 2026-05-07
---

# Phase 83 Plan 01: Runtime Detection TDD RED Summary

**8 parametric test cases define IsModifierHeld contract; build fails as expected (RED phase complete)**

## Performance

- **Duration:** 5 min
- **Started:** 2026-05-07T07:00:00Z
- **Completed:** 2026-05-07T07:05:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- GhostModeControllerTests.cs created with 8 DataRow test cases covering all 2³ modifier combinations
- All-false case (DET-02) documented as first DataRow
- Compiler errors confirm methods don't exist yet (UpdateModifierConfig, IsModifierHeld)
- TDD RED phase complete - ready for GREEN implementation in Plan 83-02

## Task Commits

1. **Task 1: Create GhostModeControllerTests with failing IsModifierHeld test** - `ba7270d` (test)

**Plan metadata:** (will be committed by orchestrator after merge)

## Files Created/Modified
- `FuzzyClock.App.Tests/GhostModeControllerTests.cs` - 8 DataRow test cases defining IsModifierHeld behavior contract (40 lines)

## Decisions Made

**Test structure:** Single test method `IsModifierHeld_VariousConfigs_ReturnsExpected` with 8 `[DataRow]` attributes follows existing GhostModeController test pattern (ComputeProximityRatio has 12 DataRow tests). Rationale: Parametric approach documents all combinations clearly while keeping test code DRY.

**GetAsyncKeyState limitation:** Tests document expected behavior but cannot verify actual keypresses in CI (GetAsyncKeyState returns 0 when keys not pressed). Added comment noting manual verification required. Phase 84 human verification checklist will validate end-to-end. Rationale: Mocking GetAsyncKeyState requires interface extraction (out of scope); code inspection + human verification sufficient for v4.3.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for Plan 83-02 (GREEN phase): Implement IsModifierHeld() and UpdateModifierConfig() methods in GhostModeController to make tests pass.

---
*Phase: 83-runtime-detection*
*Completed: 2026-05-07*
