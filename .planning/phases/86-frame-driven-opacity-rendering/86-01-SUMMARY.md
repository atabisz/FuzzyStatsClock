---
phase: 86-frame-driven-opacity-rendering
plan: 01
subsystem: ui
tags: [wpf, ghost-mode, lerp, event-pattern, internalsvisibleto, csharp]

# Dependency graph
requires:
  - phase: 85-off-thread-sampling-refactor
    provides: "Off-thread sampler with single-owner ratio writes; volatile _isEnabled backing field; SampleResult/GhostTransition seam; one-BeginInvoke-per-tick UI marshalling"
provides:
  - "public event Action<bool>? EnabledChanged on GhostModeController, raised by IsEnabled setter on actual transition only (change-detect)"
  - "internal static double LerpRatio(double current, double target, double alpha, double deltaSeconds) on GhostModeController, with terminal-state snap (target == 1.0 || target == 0.0) followed by time-stable exponential lerp"
  - "Pure-static helper directly callable from FuzzyClock.App.Tests via existing InternalsVisibleTo plumbing — Phase 87 unit tests can target it without WPF/timer setup"
affects: [86-02, 87-verification-and-performance-acceptance]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Block-body setter with change-detect early-return pattern (Action<bool>? event raise on actual transition only)"
    - "Pure-static internal helper adjacent to ComputeProximityRatio (D-08 grouping precedent established)"
    - "Time-stable exponential lerp formula `current + (target - current) * (1.0 - Math.Exp(-alpha * deltaSeconds))` with terminal-state-first snap"

key-files:
  created: []
  modified:
    - "FuzzyClock.App/GhostModeController.cs (event declaration, IsEnabled change-detect setter, LerpRatio helper)"

key-decisions:
  - "D-04: Change-detect setter — early-return when assigned value equals current backing field; EnabledChanged is NOT raised on idempotent writes (settings.json startup restore that writes the existing default produces zero events)"
  - "D-05: EnabledChanged raises synchronously on the calling thread; UI-thread-write contract enforced by all three current writers (tray Dispatcher.Invoke, ApplySettings on UI thread, settings-window callback on UI thread); no Dispatcher.BeginInvoke inside the setter"
  - "D-04 event keyword form (public event Action<bool>?) chosen over field-as-delegate (Action<bool>?) for += subscribe symmetry with existing public event Action? Restored at line 95"
  - "D-08 LerpRatio placed immediately above ComputeProximityRatio so both pure-static helpers are grouped in the same region of the class — InternalsVisibleTo discoverability"
  - "D-09 + D-03 body shape locked: terminal-state snap first (target == 1.0 || target == 0.0 returns target unchanged), then exponential lerp; no output Math.Clamp (consumer clamps deltaSeconds upstream)"
  - "Helper body is pure: zero field reads, zero event raises, zero instance dependencies — Phase 87 tests can call it as GhostModeController.LerpRatio(...) directly"
  - "MainWindow.xaml.cs deliberately untouched in this plan; Plan 02 owns the per-frame render-pump consumer wiring"

patterns-established:
  - "Pure-static lerp helper home: GhostModeController next to ComputeProximityRatio (precedent from Phase 85 OnSampleTick / SampleResult pattern)"
  - "EnabledChanged event raised on actual change only — settings.json restore that writes existing default produces zero events (T-86-01 mitigation)"
  - "Setter writes backing field BEFORE invoking event — re-entrant subscriber observes the post-write state and the change-detect guard prevents infinite recursion (T-86-02 mitigation)"

requirements-completed:
  - FADE-03
  - FADE-04

# Metrics
duration: 6min
completed: 2026-05-20
---

# Phase 86 Plan 01: GhostModeController Surface for Frame-Driven Opacity Summary

**Added `public event Action<bool>? EnabledChanged` (raised by change-detect `IsEnabled` setter) and `internal static double LerpRatio(double current, double target, double alpha, double deltaSeconds)` (terminal-state snap followed by time-stable exponential lerp) to `GhostModeController` — both pure additive surface, zero existing-behavior risk, ready for Plan 02 to consume.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-05-20T11:00:50Z
- **Completed:** 2026-05-20T11:06:36Z
- **Tasks:** 2 of 2 completed
- **Files modified:** 1 (`FuzzyClock.App/GhostModeController.cs`)

## Accomplishments

- `public event Action<bool>? EnabledChanged` declared on `GhostModeController` with full XML doc capturing the UI-thread-write contract (D-05) and the change-detect contract (D-04).
- `IsEnabled` setter converted from single-line expression-body (`set => _isEnabled = value;`) to block-body with change-detect: reads `_isEnabled` once into a local, returns early on equality, otherwise writes through to the volatile backing field (preserves Phase 85 D-11) then raises `EnabledChanged?.Invoke(value)` synchronously on the calling thread.
- `internal static double LerpRatio(double current, double target, double alpha, double deltaSeconds)` added immediately above `ComputeProximityRatio` (D-08 grouping). Body: terminal-state snap (`if (target == 1.0 || target == 0.0) return target;`) followed by time-stable exponential lerp `current + (target - current) * (1.0 - Math.Exp(-alpha * deltaSeconds))`. Pure — zero field reads, zero event raises, zero instance state, no output clamp.
- Reachable from `FuzzyClock.App.Tests` via the existing `InternalsVisibleTo("FuzzyClock.App.Tests")` plumbing in `FuzzyClock.App.csproj` (lines 7-11) — no project-file changes needed; Phase 87 unit tests can call it directly.
- 578 baseline tests preserved: 129/129 App + 449/449 Core, all passing unchanged.
- `MainWindow.xaml.cs` byte-for-byte unchanged (verified via `git diff --stat FuzzyClock.App/MainWindow.xaml.cs` returning empty).

## Task Commits

Each task was committed atomically:

1. **Task 1: Add EnabledChanged event with change-detect setter** — `7ab2734` (feat)
2. **Task 2: Add internal static LerpRatio helper with terminal-state snap** — `966c839` (feat)

_Note: Both tasks were tagged `tdd="true"` in the plan, but Phase 87 owns all unit-test bodies; Plan 86-01 only ships the additive surface (no behavior to test in this plan beyond the pre-existing 578-test baseline preservation, which all green)._

## Files Created/Modified

- `FuzzyClock.App/GhostModeController.cs` — added `EnabledChanged` event declaration; converted `IsEnabled` from expression-body setter to block-body with change-detect guard + event raise; added pure `internal static LerpRatio` helper grouped with `ComputeProximityRatio`. Net: +110 lines (XML docs included), 1 line replaced.

## Decisions Made

None beyond the plan's locked decisions (D-03, D-04, D-05, D-08, D-09 carried forward verbatim from `86-CONTEXT.md`).

## Deviations from Plan

None — plan executed exactly as written.

The plan tagged both tasks `tdd="true"`, but explicitly noted (in `86-CONTEXT.md` and the plan's Task 2 `<behavior>` block) that Phase 87 owns all unit-test bodies; Plan 86-01 ships only the additive surface area. No tests were authored in this plan, matching the plan's explicit `done` criterion: "No consumer wiring yet (Plan 02 owns that)" and "(Phase 87 owns the test bodies; this plan does not write tests)". This is not a deviation — it is the plan's specified scope.

**Total deviations:** 0
**Impact on plan:** None.

## Issues Encountered

- During Task 2 verification, `dotnet test FuzzyClock.Core.Tests` reported 1 unexpected failure on the first run (448/449). The failure did not repeat across three subsequent re-runs (449/449 stable). Diagnosis: transient flake in an existing Core-Tests test, unrelated to Plan 86-01 — `FuzzyClock.Core.Tests` does not reference the `FuzzyClock.App.GhostModeController` class that was modified, so the change cannot have caused a Core regression. The flake is a pre-existing condition in the test suite (likely timing-sensitive under heavy parallel runner load) and is documented here for the verifier to track if it recurs in Phase 87. All `App.Tests` passes were stable on first run (129/129).

## Threat Flags

None — additive surface, no new I/O, no new persisted state, no log emission. Threat register T-86-01 (idempotent-write double-fire) and T-86-02 (subscriber re-entrancy) mitigations both implemented and verified by code-shape inspection.

## Self-Check: PASSED

**Files asserted:**
- `FuzzyClock.App/GhostModeController.cs` — present, modified (verified via `git status --short`).

**Commits asserted:**
- `7ab2734` (Task 1: EnabledChanged event) — present in `git log --oneline -3`.
- `966c839` (Task 2: LerpRatio helper) — present in `git log --oneline -3`.

**Source-grep asserted:**
- `internal static double LerpRatio(double current, double target, double alpha, double deltaSeconds)` — present at line 475.
- `target == 1.0 || target == 0.0` — present at line 480.
- `Math.Exp(-alpha * deltaSeconds)` — present at line 486.
- `public event Action<bool>? EnabledChanged` — present at line 151.
- `MainWindow.xaml.cs` byte-for-byte unchanged — verified via `git diff --stat FuzzyClock.App/MainWindow.xaml.cs` returning empty output.

**Test-suite asserted:**
- 129/129 App tests pass (no regression).
- 449/449 Core tests pass on stable re-runs (one transient flake on first run, unrelated to this plan — see Issues Encountered).

## Next Phase Readiness

- **Plan 02 ready:** The two contracts Plan 02 needs (`EnabledChanged` event for subscribe/unsubscribe lifecycle; `LerpRatio` helper for per-frame fade) are landed and stable. Plan 02 is the only `MainWindow.xaml.cs` editor in Phase 86 — it owns the render-pump wiring, the field renames (`_proximityRatio` → `_currentRatio`, new `_targetRatio`), and the five-guard preservation for `OnRenderingTick`.
- **Phase 87 ready:** `LerpRatio` is reachable as `GhostModeController.LerpRatio(...)` from `FuzzyClock.App.Tests` — Phase 87 can author parametric `[DataRow]` tests against it without setting up WPF or timer infrastructure (precedent: existing `GhostModeControllerProximityTests.cs` for `ComputeProximityRatio`).
- **No blockers carried forward** from Plan 01.

---
*Phase: 86-frame-driven-opacity-rendering*
*Plan: 01*
*Completed: 2026-05-20*
