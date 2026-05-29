---
phase: 85-off-thread-sampling-refactor
plan: 01
subsystem: refactor
tags: [csharp, wpf, ghost-mode, refactor, pure-seam, testability, threading-prep]

# Dependency graph
requires:
  - phase: 67-proximity-ghost-mode
    provides: "GhostModeController OnTimerTick body — the source of truth for ratio→transition logic that the seam encodes"
  - phase: 83-runtime-detection
    provides: "IsModifierHeld AND-logic + all-false short-circuit (carries through unchanged into the new modifiersHeld parameter)"
provides:
  - "internal enum GhostTransition { None, Activate, RestoreNoEvent, RestoreWithEvent } — explicit transition vocabulary"
  - "internal readonly record struct SampleResult(double NewRatio, bool RatioChanged, GhostTransition Transition) — pure-logic seam result type"
  - "internal SampleResult OnSampleTick(int, int, int, int, int, int, bool) — pure-logic tickable seam exposing the sampler-core branches to FuzzyClock.App.Tests via InternalsVisibleTo"
  - "OnTimerTick body refactored to gather Win32 inputs → call OnSampleTick → apply SampleResult"
  - "D-10 read-once-into-locals snapshot pattern adopted for _useCtrl/_useAlt/_useShift/_ghostFadeRadiusPx — Plan 02 (volatile) and Plan 03 (threading swap) inherit this layout"
  - "Single-owner write rule: OnSampleTick owns _lastProximityRatio (edge-only) and _isGhostMode = false; Activate() owns _isGhostMode = true; OnTimerTick post-seam branch owns only Win32 style mutation + event raises"
affects:
  - 85-02-volatile-config-fields
  - 85-03-threading-swap
  - 87-verification-and-perf

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure-logic seam: extract sampler-core branches behind a value-typed result so tests bypass Win32/dispatcher entirely (D-04, D-05)"
    - "Read-once-into-locals snapshot: read each volatile-target config field exactly once at the top of the tick into a local; operate on locals for the rest of the body (D-10) — pre-stages the Plan 02 volatile modifier swap"
    - "Single-owner state writes: each tick-local field has exactly one writer site to keep the threading-swap reasoning local"

key-files:
  created: []
  modified:
    - "FuzzyClock.App/GhostModeController.cs (added GhostTransition enum, SampleResult record struct, OnSampleTick seam method; refactored OnTimerTick to delegate)"

key-decisions:
  - "Placed the new GhostTransition enum and SampleResult record struct adjacent to the existing nested RECT struct so all nested types are grouped at the top of the class body — keeps the field declarations contiguous below"
  - "OnSampleTick early-bails when IsEnabled == false with a no-op SampleResult (NewRatio=0.0, RatioChanged=false, Transition=None) — matches the pre-refactor PROX-09/SEM-05 invariant and means tests calling the seam directly while disabled get the same behavior the timer path already enforced"
  - "OnTimerTick retains its own !IsEnabled bail at the top before calling OnSampleTick — defensive duplication; both paths preserve the byte-for-byte behavior even if a future caller invokes OnSampleTick directly"
  - "Used a switch on GhostTransition in OnTimerTick (rather than an if/else chain) so the four-member transition vocabulary is enforced at compile time when the enum grows"

patterns-established:
  - "Tickable-seam refactor: Win32-touching callback shrinks to gather→delegate→apply; pure-logic seam returns a value-typed result encoding both edge signal and transition vocabulary"
  - "Plan-staged threading prep: adopt the read-once-into-locals snapshot pattern in the pure-logic refactor (this plan) so the field-shape change (Plan 02) and the timer-type swap (Plan 03) each remain a thin, isolated diff"

requirements-completed: [SEM-01, SEM-02, SEM-03, SEM-05]

# Metrics
duration: 6min
completed: 2026-05-20
---

# Phase 85 Plan 01: Off-thread Sampling Refactor — Pure-logic seam Summary

**Introduced `internal SampleResult OnSampleTick(...)` as a pure-logic seam inside `GhostModeController` and refactored `OnTimerTick` to delegate all sampler-core branches to it; observable behavior preserved byte-for-byte and all 129 App + 449 Core tests pass without modification.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-05-20T06:04:30Z (plan execution)
- **Completed:** 2026-05-20T06:10:00Z
- **Tasks:** 2 (both type=auto, both tdd=true — but the existing parametric tests on `ComputeProximityRatio` and `IsModifierHeld` are the RED bar that was already green; this plan keeps it green by construction since the seam encodes the same invariants the existing tests cover)
- **Files modified:** 1 (`FuzzyClock.App/GhostModeController.cs`)

## Accomplishments

- New internal vocabulary: `GhostTransition { None, Activate, RestoreNoEvent, RestoreWithEvent }` makes the four sampler-core branches explicit, named, and test-assertable
- New pure-logic seam: `internal SampleResult OnSampleTick(int cursorX, int cursorY, int rectLeft, int rectTop, int rectRight, int rectBottom, bool modifiersHeld)` — zero references to Win32 P/Invoke, dispatcher, `Activate()`, or events inside its body (the parameter shape compiler-enforces this)
- `OnTimerTick` body reduced to: `IsEnabled` gate → Win32 sampling (`GetCursorPos` + `GetWindowRect`) → `IsModifierHeld()` → `OnSampleTick(...)` → raise `ProximityChanged` on edge → `switch` on `Transition` to `Activate()` / restore (with optional `Restored?.Invoke()` only on `RestoreWithEvent`)
- Adopted the D-10 read-once-into-locals snapshot pattern now (Plan 02 will add `volatile` to the backing fields; Plan 03 will swap the timer type) — verified each of `_useCtrl`, `_useAlt`, `_useShift`, `_ghostFadeRadiusPx` appears exactly once inside the seam body
- Single-owner writes confirmed: `_isGhostMode = false` is written only inside `OnSampleTick`; the post-seam `OnTimerTick` branch performs only the Win32 `WS_EX_TRANSPARENT` style flip + optional `Restored` raise

## Task Commits

Each task was committed atomically:

1. **Task 1: Add internal SampleResult struct and GhostTransition enum** — `1f893c2` (feat)
2. **Task 2: Extract OnSampleTick pure method and route OnTimerTick through it** — `6a3ca7f` (refactor)

## Files Created/Modified

- `FuzzyClock.App/GhostModeController.cs` — Added `internal enum GhostTransition`, `internal readonly record struct SampleResult`, and the new `internal SampleResult OnSampleTick(...)` seam method. Refactored `OnTimerTick` to gather Win32 inputs, delegate pure logic to `OnSampleTick`, and apply the result via a `switch` on `GhostTransition`. Net change: +129 / −53 lines (final +76 net) — most growth is doc comments on the new seam and explicit four-arm transition switch in `OnTimerTick`.

## Decisions Made

- **Nested-type placement:** Placed `GhostTransition` and `SampleResult` adjacent to the existing nested `RECT` struct so all nested types are grouped at the top of the class body (per Task 1 action: "your choice — keep nested types grouped"). Field declarations stay contiguous below.
- **OnSampleTick `IsEnabled` early-bail:** Returns `new SampleResult(0.0, false, GhostTransition.None)` and writes nothing. This is defensive — `OnTimerTick` already bails on `!IsEnabled` before calling the seam — but it preserves PROX-09/SEM-05 byte-for-byte for any future caller that invokes `OnSampleTick` directly (e.g. Phase 87 tests).
- **`switch` over `if/else` in OnTimerTick:** Used a `switch (result.Transition)` with all four arms (`Activate`, `RestoreNoEvent`, `RestoreWithEvent`, `None` + `default`) so the transition vocabulary is enforced at compile time. If Plan 02/03 adds a new transition member, the compiler will flag missing arms.
- **Win32 sampling stays in OnTimerTick (D-05):** `GetCursorPos`, `GetWindowRect`, and the `IsModifierHeld()` call all run in the timer callback, never inside the seam. Tests bypass them entirely by calling `OnSampleTick` directly with hand-crafted ints — matches the Phase 83 deferred decision on `IKeyStateProvider`.

## Deviations from Plan

None - plan executed exactly as written.

The plan was unusually precise (line-numbered references, exact signatures, exact transition encoding, exact write-ordering). Both tasks executed verbatim with no auto-fixes, no architectural questions, and no surprises. The existing 12 `ComputeProximityRatio_VariousPositions` cases + 8 `IsModifierHeld_VariousConfigs_ReturnsExpected` cases remained green throughout — they encode the same invariants the seam now exposes, and the seam was built to satisfy them by construction.

---

**Total deviations:** 0
**Impact on plan:** None — the byte-for-byte invariant on `MainWindow.xaml.cs` lines 160–184 was preserved (`git diff FuzzyClock.App/MainWindow.xaml.cs` returned no output post-Task 2).

## Issues Encountered

- **Solution file naming:** The plan's `<verify>` block used `dotnet build FuzzyClock.sln`, but this repo ships an `.slnx` solution file (`FuzzyClock.slnx`) — see PROJECT.md "dotnet 10 .slnx format" decision. Resolved by running `dotnet build FuzzyClock.slnx` instead. Pure tooling-flag substitution; no behavior implication. (Not tracked as a Rule-3 deviation because it's a verification-step adaptation, not a code change.)
- **Pre-existing analyzer warnings (32 MSTEST0037):** The Core.Tests project has 32 pre-existing MSTEST0037 warnings (suggesting `Assert.DoesNotContain` / `Assert.IsGreaterThanOrEqualTo` over `Assert.IsFalse` / `Assert.IsTrue`). Out of scope for this plan per the executor's scope-boundary rule — they pre-date this work and live in a project this plan does not touch. Logged here for visibility.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Plan 85-02 (volatile config fields)** — Ready. The read-once-into-locals snapshot is in place; adding `volatile` modifiers to the backing fields (`_useCtrl`, `_useAlt`, `_useShift`, `_ghostFadeRadiusPx`, `_isEnabled`) is now a thin local change. The `IsEnabled` auto-property still needs to be converted to a backing `volatile bool _isEnabled` per D-11.

**Plan 85-03 (threading swap)** — Ready. `OnTimerTick`'s shape is already the gather→delegate→apply pattern that the threading swap needs: replace the `DispatcherTimer` with `System.Threading.Timer`, add the `Interlocked.CompareExchange` reentrancy guard at the callback head, and route the post-seam side-effect block through `Dispatcher.BeginInvoke`. The seam itself has no Win32/dispatcher coupling, so it carries through unchanged.

**Phase 87 (verification + tests)** — Unblocked. `OnSampleTick` is reachable from `FuzzyClock.App.Tests` via the existing `InternalsVisibleTo` plumbing. New parametric tests (matching the Phase 83 `[DataRow]` pattern) can now drive transitions explicitly — `Activate`, `RestoreWithEvent`, `RestoreNoEvent`, `None` — and assert the `SampleResult` directly without any Win32 machinery.

**No blockers or concerns.** `MainWindow.xaml.cs` lines 160–184 remain byte-for-byte unchanged; the timer is still `DispatcherTimer` (Plan 03 territory); no `volatile` modifiers added (Plan 02 territory); no `BeginInvoke` reentrancy guards (Plan 03 territory).

## Self-Check: PASSED

- FOUND: `FuzzyClock.App/GhostModeController.cs`
- FOUND commit `1f893c2` — Task 1 (feat: add internal SampleResult + GhostTransition)
- FOUND commit `6a3ca7f` — Task 2 (refactor: extract OnSampleTick + route OnTimerTick)
- FOUND `internal enum GhostTransition { None, Activate, RestoreNoEvent, RestoreWithEvent }` in source
- FOUND `internal readonly record struct SampleResult(double NewRatio, bool RatioChanged, GhostTransition Transition)` in source
- FOUND `internal SampleResult OnSampleTick(int cursorX, int cursorY, int rectLeft, int rectTop, int rectRight, int rectBottom, bool modifiersHeld)` in source
- VERIFIED `OnSampleTick` body has zero references to `GetCursorPos`, `GetWindowRect`, `GetAsyncKeyState`, `BeginInvoke`, `Dispatcher`, `Application.Current`, `SetWindowLong`, `SetWindowPos`, `GetWindowLong`, `Activate(`
- VERIFIED `OnSampleTick` body reads each of `_useCtrl`, `_useAlt`, `_useShift`, `_ghostFadeRadiusPx` exactly once (D-10 read-once pattern)
- VERIFIED all four `GhostTransition` members appear in the seam body (`None` x2, `Activate`, `RestoreNoEvent`, `RestoreWithEvent`)
- VERIFIED `OnTimerTick` body contains `OnSampleTick(` (1 call), `GetCursorPos(out var cursor)`, `GetWindowRect(_hwnd, out var rect)`, `Activate()`, `Restored?.Invoke()`, and `result.Transition`
- VERIFIED `OnTimerTick` post-seam branch does NOT write `_isGhostMode` (single-owner rule)
- VERIFIED `MainWindow.xaml.cs` is byte-for-byte unchanged (`git diff` returns no output)
- VERIFIED `GhostModeController.cs` still uses `DispatcherTimer`; `System.Threading.Timer` is NOT introduced (Plan 03 swap deferred)
- VERIFIED `dotnet build FuzzyClock.slnx` exits 0 (32 pre-existing warnings, 0 errors, 0 new warnings)
- VERIFIED `dotnet test FuzzyClock.App.Tests` exits 0 (129 / 129 passing)
- VERIFIED `dotnet test FuzzyClock.Core.Tests` exits 0 (449 / 449 passing — sanity check, Core was untouched)

---
*Phase: 85-off-thread-sampling-refactor*
*Completed: 2026-05-20*
