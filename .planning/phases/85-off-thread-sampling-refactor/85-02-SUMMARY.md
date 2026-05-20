---
phase: 85-off-thread-sampling-refactor
plan: 02
subsystem: refactor
tags: [csharp, wpf, ghost-mode, threading-prep, volatile, memory-model]

# Dependency graph
requires:
  - phase: 85-01-pure-logic-seam
    provides: "OnSampleTick read-once-into-locals snapshot pattern; backing field locations for volatile conversion"
  - phase: 67-proximity-ghost-mode
    provides: "Original auto-property IsEnabled and backing fields for _useCtrl/_useAlt/_useShift/_ghostFadeRadiusPx; cross-thread reader at MainWindow.xaml.cs:165 (contrast-skip predicate reading _ghostMode.IsActive)"
provides:
  - "private volatile bool _isGhostMode (D-06: cross-thread reader at MainWindow.xaml.cs:165 sees coherent value)"
  - "private volatile bool _useCtrl / _useAlt / _useShift (D-10: cross-thread config; UI writes, sampler reads)"
  - "private volatile int _ghostFadeRadiusPx (D-10: cross-thread config)"
  - "private volatile bool _isEnabled (D-11: backing field for manual IsEnabled property)"
  - "public bool IsEnabled { get => _isEnabled; set => _isEnabled = value; } (D-11: manual property over volatile backing field; auto-property removed)"
affects:
  - 85-03-threading-swap

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "volatile field memory semantics for cross-thread-readable config — UI thread writes, sampler thread reads, single atomic stores for bool/int-aligned types, no Interlocked needed"
    - "Manual property over volatile backing field for IsEnabled — explicit getter/setter performs the volatile read/write per D-11"

key-files:
  created: []
  modified:
    - "FuzzyClock.App/GhostModeController.cs (six volatile field declarations + manual IsEnabled property over volatile _isEnabled)"

key-decisions:
  - "Kept _isEnabled field declaration grouped with the other config backing fields (_useCtrl/_useAlt/_useShift/_ghostFadeRadiusPx) immediately above the IsEnabled property. Co-located backing field with the property it backs and with the other volatile-config siblings — keeps the volatile-config block contiguous and visually obvious"
  - "Inline-comment each volatile declaration with its decision ID (D-06 for _isGhostMode, D-10 for the four config fields, D-11 for _isEnabled). Line-of-sight rationale at the field site is cheap and survives future refactors when commit messages get further from the code"
  - "Did NOT add volatile to _lastProximityRatio — D-06 explicitly designates it sampler-thread-local (no cross-thread reader). Adding volatile to a 64-bit double on x86 is also not CLR-supported (volatile only legal for reference types and 4-byte primitives), so the prohibition is doubly enforced"
  - "Did NOT change _restoreTimer (DispatcherTimer) field shape — Plan 03 swaps the timer type. This plan is purely a field-shape change ahead of the timer swap, per plan objective"

patterns-established:
  - "volatile-prep before threading swap: Plan 02 introduces only the field-shape change so the diff is reviewable in isolation; Plan 03's timer-type swap then becomes a pure mechanism change rather than mixing field shapes with timer types"

requirements-completed: [SEM-03, SEM-05]

# Metrics
duration: 3min
completed: 2026-05-20
---

# Phase 85 Plan 02: Volatile Config Fields — Field-Shape Conversion Summary

**Converted six cross-thread-readable fields in `GhostModeController` (`_isGhostMode`, `_useCtrl`, `_useAlt`, `_useShift`, `_ghostFadeRadiusPx`, plus the new `_isEnabled` backing field) to `volatile` declarations and replaced the `IsEnabled` auto-property with a manual property over the volatile backing field — purely a field-shape change ahead of Plan 03's timer-type swap, with `MainWindow.xaml.cs` byte-for-byte unchanged and all 129 App tests passing.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-20T06:15:00Z (plan execution)
- **Completed:** 2026-05-20T06:18:00Z
- **Tasks:** 1 (type=auto, tdd=true — RED bar is the existing 12 ComputeProximityRatio + 8 IsModifierHeld DataRow tests, which were already green; the plan is "green by construction" because volatile is a CLR memory-model annotation that has no observable behavior on a single-threaded test runner)
- **Files modified:** 1 (`FuzzyClock.App/GhostModeController.cs`)

## Accomplishments

- `_isGhostMode` declared `volatile bool` — D-06 cross-thread reader at `MainWindow.xaml.cs:165` (`_ghostMode.IsActive` consumed by the contrast-skip predicate from the contrast-controller's 500ms timer) now sees coherent values
- `_useCtrl`, `_useAlt`, `_useShift` declared `volatile bool` — D-10 cross-thread config; UI-thread writers (`UpdateModifierConfig`) emit single atomic stores, sampler-thread reads (in `OnSampleTick`'s read-once-into-locals snapshot) see them without torn reads or stale caches
- `_ghostFadeRadiusPx` declared `volatile int` — D-10 cross-thread config; UI-thread `GhostFadeRadiusPx` setter writes atomically, sampler reads it once at the top of `OnSampleTick`
- New `_isEnabled` backing field declared `private volatile bool _isEnabled = true;` — D-11 explicit accessors over the volatile backing field
- `IsEnabled` auto-property `{ get; set; } = true;` replaced with manual property `{ get => _isEnabled; set => _isEnabled = value; }` — public surface and default value preserved exactly; only the implementation shape changed
- `_lastProximityRatio` deliberately left as plain `double` — D-06 designates it sampler-thread-local (the seam owns it; no cross-thread reader), and `volatile double` is not a legal C# declaration anyway (volatile-restricted to reference types and 4-byte primitives)
- All call sites in `MainWindow.xaml.cs` continue to compile without modification — `_ghostMode.IsEnabled = !_ghostMode.IsEnabled;` (line 189), `_ghostMode.GhostFadeRadiusPx = ...`, `_ghostMode.UpdateModifierConfig(...)` all work over the volatile-backed property/setters with zero source change

## Task Commits

Each task was committed atomically:

1. **Task 1: Convert config fields to volatile backing fields and replace IsEnabled auto-property** — `a8c9e93` (refactor)

## Files Created/Modified

- `FuzzyClock.App/GhostModeController.cs` — Lines 66-77: six field declarations gained `volatile`, new `_isEnabled` backing field added, `IsEnabled` converted from auto-property to manual property. Net change: +8 / -7 lines (final +1 net) — the +1 is the new `_isEnabled` backing field; the IsEnabled property converted from auto-property to one-line manual property is line-for-line equivalent.

## Decisions Made

- **Field grouping for `_isEnabled`:** Placed `_isEnabled` alongside `_useCtrl/_useAlt/_useShift/_ghostFadeRadiusPx` — the volatile-config block is now contiguous and visually obvious. The new field is declared immediately above the `IsEnabled` property it backs, so the field/accessor pairing is obvious without needing to scroll.
- **Inline decision-ID comments on each volatile field:** Annotated each volatile declaration with its decision ID (`D-06` for `_isGhostMode`, `D-10` for the four config fields, `D-11` for `_isEnabled`). The plan-level must_haves cite these IDs, and inline citations keep the rationale next to the code for future maintainers.
- **`_lastProximityRatio` deliberately not volatile:** D-06 explicitly designates it sampler-thread-local. Even if we wanted to add `volatile`, the C# language disallows `volatile double` (the restriction is to reference types and 4-byte primitives only). The prohibition is enforced at two levels and the field stays as a plain `double`.
- **`DispatcherTimer` `_restoreTimer` field shape unchanged:** Plan 03 will swap the timer type. This plan is purely a field-shape change ahead of the timer swap, per the plan objective. Mixing field-shape changes with timer-type changes in a single commit would muddy the review.

## Deviations from Plan

None - plan executed exactly as written.

The plan was unusually precise (line-numbered references, exact field declarations, exact property body, exact acceptance criteria with literal substring checks). Task 1 executed verbatim with no auto-fixes, no architectural questions, and no surprises. The existing 12 `ComputeProximityRatio_VariousPositions` cases + 8 `IsModifierHeld_VariousConfigs_ReturnsExpected` cases remained green throughout — they encode invariants on pure-logic methods that `volatile` (a memory-model annotation) cannot affect on a single-threaded test runner.

---

**Total deviations:** 0
**Impact on plan:** None — `MainWindow.xaml.cs` byte-for-byte unchanged (`git diff FuzzyClock.App/MainWindow.xaml.cs` returned no output post-Task 1); the timer is still `DispatcherTimer` (Plan 03 territory).

## Issues Encountered

- **Pre-existing analyzer warnings (32 MSTEST0037):** Same 32 pre-existing warnings the Plan 01 SUMMARY documented. Out of scope for this plan per the executor's scope-boundary rule — they pre-date this work and live in a project this plan does not touch. Logged here for visibility; consistent with the Plan 01 issue log.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Plan 85-03 (threading swap)** — Ready. The volatile field shape is in place; Plan 03's threading swap can now safely:

- Replace `DispatcherTimer? _restoreTimer` with `System.Threading.Timer? _sampleTimer` (or equivalent), knowing the sampler thread will see UI-thread writes to `_isEnabled / _useCtrl / _useAlt / _useShift / _ghostFadeRadiusPx` without torn reads
- Add the `Interlocked.CompareExchange(ref _tickInFlight, 1, 0)` reentrancy guard at the callback head (D-02)
- Route the post-seam side-effect block through `Dispatcher.BeginInvoke` (D-07), with the dispatcher-shutdown guard `if (_dispatcher.HasShutdownStarted || ...)` from D-09
- Synchronously dispose the timer via `_sampleTimer.Dispose(WaitHandle)` (D-03) so no tick fires after `Dispose()` returns
- Read each volatile config field exactly once at the top of the timer callback into a local snapshot (the read-once pattern is already in place inside `OnSampleTick` per Plan 01; the timer-callback wrapper inherits it)

**Phase 86 (frame-driven opacity)** — Unblocked indirectly. Phase 85 owns threading; Phase 86 owns rendering. Phase 86 is independent of Plan 02 — it depends only on Plan 03's BeginInvoke marshal pattern landing.

**Phase 87 (verification + tests)** — Unblocked indirectly. Same — depends on Plan 03 for the threading model under test.

**No blockers or concerns.** `MainWindow.xaml.cs` lines 160-184 remain byte-for-byte unchanged; the timer is still `DispatcherTimer`; the public surface of `GhostModeController` is unchanged (callers see the same `IsEnabled / IsActive / GhostFadeRadiusPx / UpdateModifierConfig` shape they always saw).

## Self-Check: PASSED

- FOUND: `FuzzyClock.App/GhostModeController.cs`
- FOUND commit `a8c9e93` — Task 1 (refactor: convert config fields to volatile and replace IsEnabled auto-property)
- VERIFIED `private volatile bool _isGhostMode;` literal substring present
- VERIFIED `private volatile bool _useCtrl` literal substring present
- VERIFIED `private volatile bool _useAlt` literal substring present
- VERIFIED `private volatile bool _useShift` literal substring present
- VERIFIED `private volatile int _ghostFadeRadiusPx` literal substring present
- VERIFIED `private volatile bool _isEnabled` literal substring present
- VERIFIED `public bool IsEnabled { get => _isEnabled; set => _isEnabled = value; }` literal substring present (manual property)
- VERIFIED `public bool IsEnabled { get; set; }` substring absent (auto-property removed)
- VERIFIED `_lastProximityRatio` declaration unchanged: `private double _lastProximityRatio = 0.0;` (NOT volatile — D-06 sampler-local)
- VERIFIED `MainWindow.xaml.cs` is byte-for-byte unchanged (`git diff FuzzyClock.App/MainWindow.xaml.cs` returns empty output)
- VERIFIED `GhostModeController.cs` still uses `DispatcherTimer`; `System.Threading.Timer` is NOT introduced (Plan 03 swap deferred)
- VERIFIED `dotnet build FuzzyClock.slnx` exits 0 (32 pre-existing warnings, 0 errors, 0 new warnings)
- VERIFIED `dotnet test FuzzyClock.App.Tests` exits 0 (129 / 129 passing — same as Plan 01 baseline)

---
*Phase: 85-off-thread-sampling-refactor*
*Completed: 2026-05-20*
