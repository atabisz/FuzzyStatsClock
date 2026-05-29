---
phase: 87-verification-performance-acceptance
plan: 01
subsystem: testing
tags: [csharp, mstest, datarow, parametric-tests, internalsvisibleto, discoverinternals, ghost-mode, lerp, terminal-snap, sampling-seam]

# Dependency graph
requires:
  - phase: 86-frame-driven-opacity-rendering
    provides: "internal static double LerpRatio(...) pure helper at GhostModeController.cs:475-487 — D-08/D-09 terminal-snap signature ready for direct unit test coverage"
  - phase: 85-off-thread-sampling-refactor
    provides: "internal SampleResult OnSampleTick(...) pure-logic seam + GhostTransition enum + SampleResult record struct + InternalsVisibleTo plumbing — D-04 reachability + D-06 single-owner write rule for _isGhostMode"
provides:
  - "Automated MSTest coverage of GhostModeController.LerpRatio terminal-state snap (D-LERP-01) — 7 rows passing"
  - "Automated MSTest coverage of GhostModeController.OnSampleTick four GhostTransition classes (D-SEAM-01) — 4 rows passing"
  - "internal volatile bool _isGhostMode field visibility (D-SEAM-02b) — enables direct test-side ghost-mode pre-state setup without violating Phase 85 D-06 production-side write ownership rule"
  - "[assembly: DiscoverInternals] in FuzzyClock.App.Tests — unlocks future test classes that need to consume internal types (e.g. nested enums) as parameter types"
affects:
  - 87-02-and-onward (subsequent Phase 87 plans for WR-04 fix and PERF-01 manual run)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "MSTest [DataRow] parametric pattern with method signature column-aligned to [DataRow] argument order — established in GhostModeControllerProximityTests, mirrored verbatim in LerpRatioTests"
    - "Direct-internal-field setup for seam tests: controller._isGhostMode = isGhostModePre; — avoids test-only setters/factories while preserving production-side single-owner ownership rule"
    - "[assembly: DiscoverInternals] (MSTest 4.x) — enables internal test classes and methods to be discovered by the runner, removing the public-only test-class constraint when a test method needs an internal-typed parameter"

key-files:
  created:
    - "FuzzyClock.App.Tests/LerpRatioTests.cs (45 lines, 7 test rows)"
    - "FuzzyClock.App.Tests/OnSampleTickTests.cs (42 lines, 4 test rows)"
  modified:
    - "FuzzyClock.App/GhostModeController.cs (one-keyword change at line 70: private -> internal volatile bool _isGhostMode)"
    - "FuzzyClock.App.Tests/MSTestSettings.cs (added [assembly: DiscoverInternals] to enable discovery of internal test class)"

key-decisions:
  - "RestoreWithEvent DataRow uses cursorX=10 (not the plan's 50) — with the controller's default _ghostFadeRadiusPx=80, distance dx=50 from rect-left=100 yields ratio=0.375 (not 0.0), which the OnSampleTick decision tree maps to RestoreNoEvent. cursorX=10 gives distance dx=90 > radius 80 -> ratio=0.0 -> RestoreWithEvent. Plan's verbatim coordinates contradict the row's behavior assertion (`ratio == 0.0`); the assertion is the load-bearing invariant, the coordinate is a derivation from it."
  - "OnSampleTickTests is `internal class` (not `public`) plus `[assembly: DiscoverInternals]` — required because the parametric method has parameter type `GhostModeController.GhostTransition`, a nested enum inside the `internal sealed class GhostModeController`. A public method with internal-typed parameters is a CS0051 inconsistent-accessibility error; making the method `internal` instead trips the MSTest analyzer (MSTEST0003 invalid signature). DiscoverInternals lets MSTest discover the internal class while keeping the parametric signature legal."
  - "LerpRatioTests' MidRangeTarget_DoesNotSnap computes the expected value inline via Math.Exp rather than hardcoding ~0.10686 — keeps the assertion robust to any future formula re-derivation by Phase 86's downstream caller."

requirements-completed: [TEST-01, TEST-02, TEST-03, TEST-04]

# Metrics
duration: 12min
completed: 2026-05-21
---

# Phase 87 Plan 01: Verification & Performance Acceptance — Test Coverage + Visibility Relaxation Summary

**Locked in TEST-01..04 by adding two new MSTest classes covering the pure-static seams introduced by Phases 85 and 86: `LerpRatioTests` (7 rows on `GhostModeController.LerpRatio` terminal-state snap, D-LERP-01) and `OnSampleTickTests` (4 rows on the four `GhostTransition` classes returned by `GhostModeController.OnSampleTick`, D-SEAM-01). Relaxed `_isGhostMode` from `private volatile bool` to `internal volatile bool` (D-SEAM-02b) so the seam tests can directly drive ghost-mode pre-state for the `RestoreNoEvent` / `RestoreWithEvent` rows without violating Phase 85 D-06 single-owner production-side write ownership. Added `[assembly: DiscoverInternals]` to enable an internal test class with an internal-typed parametric parameter. Final suite: 449 Core + 140 App = 589 tests passing, 0 failed (was 578 baseline, +11 new).**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-05-21 plan execution
- **Tasks:** 3 (type=auto for Task 1; type=auto tdd=true for Tasks 2 & 3 — though tests pass green-on-write because the production code under test was shipped in Phases 85 and 86; this plan adds verification coverage to existing implementations rather than driving new code)
- **Files created:** 2 (`FuzzyClock.App.Tests/LerpRatioTests.cs`, `FuzzyClock.App.Tests/OnSampleTickTests.cs`)
- **Files modified:** 2 (`FuzzyClock.App/GhostModeController.cs`, `FuzzyClock.App.Tests/MSTestSettings.cs`)
- **Test rows added:** 11 (7 LerpRatio + 4 OnSampleTick); LerpRatioTests = 6 `[DataRow]` rows on `LerpRatio_TerminalStateSnap` + 1 `MidRangeTarget_DoesNotSnap` non-parametric method; OnSampleTickTests = 4 `[DataRow]` rows on `OnSampleTick_TransitionClasses_ReturnsExpected`

## Accomplishments

- **`_isGhostMode` field-visibility relaxation** at `FuzzyClock.App/GhostModeController.cs:70`: one-keyword change `private volatile bool _isGhostMode;` -> `internal volatile bool _isGhostMode;` per D-SEAM-02b. The trailing comment was extended to flag the Phase 87 reason; the `volatile` modifier (Phase 85 D-06) is preserved verbatim. Production-side writes still owned by `OnSampleTick` (writes `false` at line 423) and `Activate()` (writes `true` at line 315) — exactly 2 production write sites, unchanged. The `public bool IsActive => _isGhostMode;` getter at line 124 is byte-for-byte unchanged.
- **`LerpRatioTests` lands** at `FuzzyClock.App.Tests/LerpRatioTests.cs`. Mirrors the `GhostModeControllerProximityTests` shape: file-scoped `using FuzzyClock.App;`, `namespace FuzzyClock.App.Tests;`, `[TestClass] public class LerpRatioTests`. One parametric `[TestMethod] LerpRatio_TerminalStateSnap` carrying the 6 `[DataRow]` rows from `87-CONTEXT.md` `<specifics>` D-LERP-02 verbatim — 3 target=1.0 rows (currents 1.0, 0.5, 0.0) and 3 target=0.0 rows (currents 0.0, 0.5, 1.0), all asserting the snap returns the target exactly with epsilon 0.0001. Plus a separate `[TestMethod] LerpRatio_MidRangeTarget_DoesNotSnap` asserting `LerpRatio(0.0, 0.5, 15.0, 0.016)` does NOT return 0.5 — the expected value is computed inline via `current + (target - current) * (1 - Math.Exp(-alpha * deltaSeconds))` (≈0.10686 with the planned alpha=15, deltaSeconds=0.016) and then `Assert.AreNotEqual(0.5, result, ...)` provides the explicit negative coverage. No NaN/Infinity/alpha=0/negative-deltaSeconds rows — D-LERP-01 over-spec exclusions enforced.
- **`OnSampleTickTests` lands** at `FuzzyClock.App.Tests/OnSampleTickTests.cs`. Mirrors the `GhostModeControllerTests` shape: top-of-file `// NOTE:` comment block explaining that direct-write `controller._isGhostMode = isGhostModePre;` setup arranges the seam pre-state without violating Phase 85 D-06 (production-side writes still owned by `OnSampleTick(false)` and `Activate(true)`; tests are the only new writer, and only for setup). One parametric `[TestMethod] OnSampleTick_TransitionClasses_ReturnsExpected(int cursorX, int cursorY, bool isGhostModePre, GhostModeController.GhostTransition expectedTransition)` carrying 4 `[DataRow]` rows covering the four-class invariant: None / Activate / RestoreNoEvent / RestoreWithEvent. Method body is the planned `var controller = new GhostModeController(); controller._isGhostMode = isGhostModePre; var result = controller.OnSampleTick(cursorX, cursorY, 100, 100, 200, 200, modifiersHeld: false); Assert.AreEqual(expectedTransition, result.Transition);` — single `OnSampleTick` call per row, no Activate-then-Restore chaining (D-SEAM-02 row-independence preserved). Widget rect 100,100,200,200 matches the existing `GhostModeControllerProximityTests` corpus convention.
- **`[assembly: DiscoverInternals]` added** to `FuzzyClock.App.Tests/MSTestSettings.cs` (one line). Required because `OnSampleTickTests` has parameter type `GhostModeController.GhostTransition` — a nested enum inside the `internal sealed class GhostModeController`. The test class itself is `internal` and the parametric method `public`; `DiscoverInternals` is the canonical MSTest 4.x mechanism for discovering internal test classes.
- **TEST-01 / TEST-04 baseline preserved**: full suite `dotnet test FuzzyClock.slnx --nologo --verbosity quiet` reports `Passed: 449 (Core) + 140 (App) = 589 total, Failed: 0, Skipped: 0` — was 578 baseline (449 + 129) before this plan, +11 new (7 LerpRatio + 4 OnSampleTick). All 578 prior tests still green; no regression.

## Test Counts

| Suite | Before | After | Delta |
|-------|--------|-------|-------|
| FuzzyClock.Core.Tests | 449 | 449 | 0 |
| FuzzyClock.App.Tests  | 129 | 140 | +11 |
| **Total**             | **578** | **589** | **+11** |

The +11 in App.Tests breaks down as: LerpRatioTests = 7 rows (6 DataRows on `LerpRatio_TerminalStateSnap` + 1 on `MidRangeTarget_DoesNotSnap`); OnSampleTickTests = 4 rows on `OnSampleTick_TransitionClasses_ReturnsExpected`.

## Field-Visibility Diff

```diff
- private volatile bool _isGhostMode;                      // D-06: cross-thread reader at MainWindow.xaml.cs:165
+ internal volatile bool _isGhostMode;                     // D-06: cross-thread reader at MainWindow.xaml.cs:165 — Phase 87 D-SEAM-02b: relaxed to internal for OnSampleTickTests setup
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug in plan specifics] RestoreWithEvent DataRow cursor coordinate**
- **Found during:** Task 3 (initial test run after authoring `OnSampleTickTests` per the plan's verbatim coordinates).
- **Issue:** The plan's `<action>` and `87-CONTEXT.md` `<specifics>` both specify `[DataRow(50, 150, true, GhostTransition.RestoreWithEvent, ...)]` for the "far+ghost -> RestoreWithEvent" row. With the controller's default `_ghostFadeRadiusPx = 80` and the widget rect (100,100)-(200,200), cursor (50, 150) is 50px to the left of `rectLeft=100`. `ComputeProximityRatio` returns `1 - 50/80 = 0.375`, not 0.0 as the row's behavior assertion claims (line 163 of plan: `OnSampleTick(cursorX=50, cursorY=150, ...) with _isGhostMode=true returns RestoreWithEvent — far away, ghost (ratio == 0.0)`). With ratio=0.375, the `OnSampleTick` decision tree at lines 415-420 of `GhostModeController.cs` evaluates `(ratio == 0.0) ? RestoreWithEvent : RestoreNoEvent` and yields `RestoreNoEvent` — the test failed `Expected:<RestoreWithEvent>. Actual:<RestoreNoEvent>`.
- **Fix:** Changed cursorX from 50 to 10 for the RestoreWithEvent row (distance dx=90 from `rectLeft=100` > radius 80 → ratio=0.0 → RestoreWithEvent). Added an in-file comment explaining the discrepancy. The behavior invariant (ratio==0.0 → RestoreWithEvent) is the load-bearing contract per D-SEAM-01; the cursor coordinate is a derivation from that invariant. The verbatim coordinate was the bug.
- **Files modified:** `FuzzyClock.App.Tests/OnSampleTickTests.cs` (one DataRow argument + explanatory comment)
- **Commit:** d90d303

**2. [Rule 3 - Blocking issue] internal-typed parametric parameter requires DiscoverInternals**
- **Found during:** Task 3 (compile error CS0051 after authoring the parametric method with `GhostTransition expectedTransition` parameter).
- **Issue:** `GhostModeController` is `internal sealed class`, and `GhostTransition` is a nested `internal enum`. A public test class with a `public` parametric method taking `GhostModeController.GhostTransition` as a parameter triggers CS0051 (parameter type less accessible than method). Switching just the method to `internal` triggers MSTest's MSTEST0003 analyzer (test method signature invalid) and the runner skips discovery.
- **Fix:** Made the test class itself `internal` and added `[assembly: DiscoverInternals]` to `FuzzyClock.App.Tests/MSTestSettings.cs`. This is the canonical MSTest 4.x pattern for tests that need to consume internal types as parameters. Discovery now finds the internal class, the parametric `public` method on it is legal because the containing class accessibility matches the parameter type.
- **Files modified:** `FuzzyClock.App.Tests/MSTestSettings.cs` (one-line attribute add); `OnSampleTickTests` declared `internal class` rather than `public class`.
- **Commit:** d90d303

### Out-of-scope items observed but NOT addressed

- Pre-existing MSTEST0037 analyzer warnings in `FuzzyClock.Core.Tests/TemperatureFormatterTests.cs`, `TersePhraseProviderExpandedTests.cs`, `PiratePhraseProviderExpandedTests.cs`, and `FuzzyClock.App.Tests/TemperatureServiceTests.cs` (32 total at build end). These predate this plan, are not in any file modified by this plan, and have nothing to do with TEST-01..04 or D-LERP/D-SEAM. Out of scope per the executor scope-boundary rule.

## TDD Gate Compliance

The plan flagged Tasks 2 and 3 as `tdd="true"`. The behavior under test (`LerpRatio` terminal snap from Phase 86; `OnSampleTick` four-class transitions from Phase 85) was already shipped before this plan ran — these tests are verification coverage on existing production code, not test-driven new behavior. The TDD gate's RED phase is therefore not applicable in the standard sense: writing the tests would have produced PASSING runs from the first invocation, which is a TDD smell only when the production code is supposed to be new. Here the production code is intentionally pre-existing; the plan's purpose is to lock in coverage, not to drive implementation.

The `test(87-01): ...` commits for Tasks 2 and 3 are the verification gate. No `feat(87-01): ...` GREEN commit exists because no production behavior was added — only test coverage and a one-keyword visibility relaxation (`refactor(87-01)`).

## Self-Check: PASSED

**Files exist:**
- `FuzzyClock.App.Tests/LerpRatioTests.cs` — FOUND
- `FuzzyClock.App.Tests/OnSampleTickTests.cs` — FOUND
- `FuzzyClock.App/GhostModeController.cs` — present, line 70 contains `internal volatile bool _isGhostMode`
- `FuzzyClock.App.Tests/MSTestSettings.cs` — present, contains `[assembly: DiscoverInternals]`

**Commits exist:**
- c8d5cea (Task 1: refactor visibility relaxation) — FOUND
- 358bb8c (Task 2: test LerpRatioTests) — FOUND
- d90d303 (Task 3: test OnSampleTickTests + DiscoverInternals) — FOUND

**Test suite:**
- `dotnet test FuzzyClock.slnx --nologo --verbosity quiet`: Passed 449 + 140 = 589, Failed 0, Skipped 0 — VERIFIED

**Build:**
- `dotnet build FuzzyClock.slnx --nologo --verbosity quiet`: 0 Errors (32 pre-existing MSTEST0037 warnings in unrelated files, out of scope) — VERIFIED

**Plan acceptance criteria:**
- Source: `LerpRatioTests.cs` contains `[TestClass]`, `LerpRatio_TerminalStateSnap` with 6 `[DataRow]`, separate `MidRange` method, no NaN/Infinity/alpha=0 rows — VERIFIED
- Source: `OnSampleTickTests.cs` contains `[TestClass]`, 4 `[DataRow]` with the four `GhostTransition` literal values, `controller._isGhostMode = isGhostModePre;` literal substring, widget rect `100, 100, 200, 200`, no SEM-03/IsEnabled/RatioChanged references — VERIFIED
- Source: `GhostModeController.cs:70` is `internal volatile bool _isGhostMode`, no `private volatile bool _isGhostMode` matches, `public bool IsActive => _isGhostMode;` preserved, exactly 2 production-side write sites — VERIFIED
- Plan's literal cursor-coordinate acceptance (`50, 150, 150, 150, 75, 150, 50, 150`): the RestoreWithEvent row uses `10, 150` instead of `50, 150` — DEVIATION (Rule 1, documented above)
