---
phase: 67-ghostmodecontroller-extension
plan: 01
subsystem: ui
tags: [wpf, winforms, ghost-mode, proximity, dispatchertimer, p-invoke, chebyshev, tdd, mstest]

requires:
  - phase: 66-appsettings-foundation
    provides: GhostFadeRadiusPx int field on AppSettings (default 80, range 20-200px)

provides:
  - "GhostModeController.ComputeProximityRatio — pure static method computing [0.0,1.0] proximity ratio via Chebyshev distance"
  - "GhostModeController.ProximityChanged: Action<double>? — event firing only on ratio change"
  - "GhostModeController.GhostFadeRadiusPx — settable property for live radius updates (Phase 69)"
  - "GhostModeController always-running timer from Initialize(); WS_EX_TRANSPARENT managed entirely inside controller"
  - "InternalsVisibleTo FuzzyClock.App.Tests — enables unit testing of internal App types"
  - "GhostModeControllerProximityTests — 12 TDD unit tests covering outside/boundary/inside/diagonal/edge/zero-radius"

affects:
  - "68-opacity-wiring — subscribes to ProximityChanged and Restored to drive opacity fade"
  - "69-settings-radius-slider — sets GhostFadeRadiusPx property live from UI slider"

tech-stack:
  added: []
  patterns:
    - "ComputeProximityRatio uses Chebyshev distance (max(dx,dy)) for rectangular proximity halo matching widget shape"
    - "Timer always-running from Initialize(); never Start/Stop mid-session; only Stop in Dispose()"
    - "ProximityChanged fires only on ratio change (ratio != _lastProximityRatio guard) to avoid event storms"
    - "WS_EX_TRANSPARENT managed entirely by controller timer tick — no external callers in Phase 68+"
    - "Restored fires only at ratio=0.0 after ghost activation (not every sub-1.0 tick during retreat)"
    - "InternalsVisibleTo pattern for App project: AssemblyAttribute in .csproj ItemGroup"

key-files:
  created:
    - FuzzyClock.App.Tests/GhostModeControllerProximityTests.cs
  modified:
    - FuzzyClock.App/GhostModeController.cs
    - FuzzyClock.App/FuzzyClock.App.csproj

key-decisions:
  - "Chebyshev distance chosen over Euclidean — square proximity halo matches widget's rectangular shape; avoids sqrt per tick"
  - "ComputeProximityRatio lives on GhostModeController as internal static — avoids separate class for single geometric primitive"
  - "ComputeProximityRatio takes plain ints (not POINT/RECT Win32 structs) — unit tests need no Win32 machinery"
  - "InternalsVisibleTo added to FuzzyClock.App.csproj — enables testing internal GhostModeController from App.Tests"
  - "Large-radius test case corrected: cursorX=450 (250px from right edge) not 400 (200px) to match '250px away' description"
  - "Activate() remains public for Phase 67->68 transition period (D-03); Phase 68 will remove external call site"

patterns-established:
  - "Timer always-running: Initialize() starts, Dispose() stops; never Start/Stop inside session callbacks"
  - "Event change-only emission: track _last* field, emit only when new value differs"

requirements-completed: [PROX-01, PROX-02, PROX-03, PROX-04, PROX-05, PROX-08, PROX-13]

duration: 6min
completed: 2026-03-27
---

# Phase 67 Plan 01: GhostModeController Extension Summary

**ComputeProximityRatio static method (Chebyshev distance, 12 TDD unit tests) + always-running timer with ProximityChanged event driving ghost state transitions entirely inside the controller**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-27T03:30:01Z
- **Completed:** 2026-03-27T03:36:03Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Implemented `ComputeProximityRatio` as a pure static method on `GhostModeController` using Chebyshev distance; 12 MSTest TDD tests cover outside/boundary/inside/diagonal/edge-on/zero-radius/large-radius scenarios — all pass
- Extended controller timer lifecycle: starts in `Initialize()` and runs continuously; `OnTimerTick` computes proximity ratio, emits `ProximityChanged` only on change, activates ghost at ratio=1.0, removes WS_EX_TRANSPARENT immediately at ratio<1.0, fires `Restored` only at full exit (ratio=0.0)
- Added `InternalsVisibleTo FuzzyClock.App.Tests` to `FuzzyClock.App.csproj` enabling unit-testing of internal App types; 57 App tests + 357 Core tests pass with zero regression

## Task Commits

1. **test(67-01): add failing tests for ComputeProximityRatio** — `2bf81b1` (RED phase + InternalsVisibleTo fix)
2. **feat(67-01): implement ComputeProximityRatio pure static method** — `4577dd8` (GREEN phase)
3. **feat(67-01): extend GhostModeController with always-running timer and ProximityChanged event** — `ac05c9a`

## Files Created/Modified

- `FuzzyClock.App/GhostModeController.cs` — new fields (_lastProximityRatio, _ghostFadeRadiusPx), ProximityChanged event, GhostFadeRadiusPx property, OnTimerTick method, modified Initialize() and Activate(), ComputeProximityRatio static method
- `FuzzyClock.App.Tests/GhostModeControllerProximityTests.cs` — 12 TDD unit tests for ComputeProximityRatio
- `FuzzyClock.App/FuzzyClock.App.csproj` — InternalsVisibleTo FuzzyClock.App.Tests

## Decisions Made

- Chebyshev distance chosen over Euclidean: `max(dx, dy)` where dx/dy are per-axis overshoots produces a square proximity halo that matches the widget's rectangular boundary; avoids floating-point sqrt on every 75ms tick
- `ComputeProximityRatio` lives on `GhostModeController` as `internal static` (not a separate class) — single geometric primitive doesn't warrant its own file; matches existing pattern of controller owning all ghost geometry
- Method signature uses plain `int` parameters (not private POINT/RECT Win32 structs) so unit tests in the test project need no Win32 machinery
- `InternalsVisibleTo` added via `AssemblyAttribute` in `.csproj` `ItemGroup` (same pattern as FuzzyClock.Core.csproj)
- `Activate()` kept public with D-03 comment — MainWindow's existing `_ghostMode.Activate()` call in `Window_MouseEnter` must continue to compile during Phase 67→68 transition

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added InternalsVisibleTo to enable unit-testing of internal GhostModeController**
- **Found during:** Task 1 (RED phase — test compilation)
- **Issue:** `GhostModeController` is `internal` but `FuzzyClock.App.csproj` had no `InternalsVisibleTo` for the test assembly; tests failed with CS0122 "inaccessible due to protection level"
- **Fix:** Added `AssemblyAttribute Include="System.Runtime.CompilerServices.InternalsVisibleTo"` with `_Parameter1 = FuzzyClock.App.Tests` in `FuzzyClock.App.csproj`, matching the pattern already used in `FuzzyClock.Core.csproj`
- **Files modified:** `FuzzyClock.App/FuzzyClock.App.csproj`
- **Verification:** Tests compiled and all 12 proximity tests ran
- **Committed in:** `2bf81b1` (RED phase commit)

**2. [Rule 1 - Bug] Corrected large-radius test case coordinates**
- **Found during:** Task 1 (GREEN phase — test execution)
- **Issue:** Plan's DataRow `[DataRow(400, 150, 500, 0.5, ...)]` uses cursorX=400 which is 200px from the right edge (x=200), giving ratio=0.6, not 0.5 as expected; the description says "250px away" but the coordinates are 200px away
- **Fix:** Changed cursorX from 400 to 450 (250px from right edge x=200); 1.0 - 250/500 = 0.5 now matches the expected value and description
- **Files modified:** `FuzzyClock.App.Tests/GhostModeControllerProximityTests.cs`
- **Verification:** All 12 proximity tests pass
- **Committed in:** `4577dd8` (GREEN phase commit)

---

**Total deviations:** 2 auto-fixed (1 blocking infrastructure, 1 bug in test data)
**Impact on plan:** Both auto-fixes necessary for test correctness. No scope creep.

## Issues Encountered

None — implementation proceeded cleanly after the two auto-fixes above.

## Next Phase Readiness

- `GhostModeController.ProximityChanged: Action<double>?` ready for Phase 68 to subscribe and drive `Window.Opacity` fade
- `GhostModeController.Restored` event semantics clarified: fires only at ratio=0.0 after ghost activation (Phase 68 uses for final opacity snap)
- `GhostModeController.GhostFadeRadiusPx` property ready for Phase 69 live slider wiring
- 57 App tests + 357 Core tests pass; FuzzyClock.App builds clean; no blockers

---
*Phase: 67-ghostmodecontroller-extension*
*Completed: 2026-03-27*
