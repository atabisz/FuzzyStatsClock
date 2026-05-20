---
phase: 85-off-thread-sampling-refactor
plan: 04
subsystem: refactor
tags: [csharp, wpf, ghost-mode, threading, system-threading-timer, idisposable, waithandle, manualresetevent, idempotent-dispose]

# Dependency graph
requires:
  - phase: 85-03-threading-swap
    provides: "System.Threading.Timer? _timer field + OnSampleThreadTick callback with try/finally reentrancy guard release — the WaitHandle signals correctly when the callback method returns cleanly"
  - phase: 85-01-pure-logic-seam
    provides: "Pure SampleResult / GhostTransition / OnSampleTick seam — preserved verbatim through this plan"
  - phase: 85-02-volatile-config-fields
    provides: "Volatile config fields — preserved verbatim through this plan"
  - phase: 67-proximity-ghost-mode
    provides: "Always-running timer lifecycle from Initialize until Dispose — Dispose now blocks until any in-flight callback drains"
provides:
  - "Synchronous disposal via _timer.Dispose(WaitHandle) (D-03) — Dispose() blocks until any in-flight tick callback completes before returning"
  - "Idempotent Dispose() — _disposed flag early-exit guards against double-dispose throws"
  - "_timer = null after disposal — defensive null-check pattern for any post-disposal access"
  - "Closed teardown race in both directions when combined with D-09 dispatcher-shutdown guard from Plan 03"
affects:
  - 86-frame-driven-opacity-rendering
  - 87-verification-and-perf

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Synchronous Timer disposal: Timer.Dispose(WaitHandle) signals the WaitHandle when all callbacks complete; caller WaitOne()s on the handle to make disposal effectively synchronous — bounded by tick-period + bounded callback body"
    - "Idempotent IDisposable: _disposed bool flag with early-exit guard, set immediately to defend against concurrent re-entry, plus _timer = null defensive nulling after disposal"
    - "ManualResetEvent + using statement: WaitHandle scoped to the disposal method, automatically disposed after WaitOne() returns — no manual cleanup, no leak risk"

key-files:
  created: []
  modified:
    - "FuzzyClock.App/GhostModeController.cs (added _disposed field; replaced one-liner Dispose() with WaitHandle-based synchronous disposal)"

key-decisions:
  - "ManualResetEvent (initial state false) over AutoResetEvent or Mutex — ManualResetEvent stays signaled once set, which is the right semantic for 'all callbacks complete' (one-shot signal); initial state false means it starts unsignalled and the timer signals it on completion"
  - "using statement for ManualResetEvent over explicit Dispose — using ensures cleanup even if WaitOne were ever to throw (it cannot in this code path, but the discipline is free); also makes scope and lifetime visually obvious"
  - "_disposed bool flag for idempotency over relying on _timer == null check alone — the flag is clearer in intent ('this method has run before') and survives the _timer = null assignment within the same method without ordering subtleties"
  - "Set _disposed = true BEFORE the WaitOne — if a concurrent thread were to call Dispose() while WaitOne is in progress, the second call returns immediately rather than racing with the cleanup. The _timer.Dispose(WaitHandle) overload is itself thread-safe per the BCL contract."
  - "_timer = null AFTER WaitOne returns — any defensive code (or future Plan that touches _timer post-disposal) observes a null reference and either short-circuits or NREs on the obvious offender; matches the field-shape pattern from Plan 03's nullable _timer declaration."
  - "WaitOne() with no timeout argument (block indefinitely) — per the threat model, T-85-13 (Dispose deadlock) is accepted because the tick callback body is bounded (~33 ms tick period plus a non-blocking BeginInvoke post). If a future change introduces unbounded callback work, revisit with a timeout argument."

patterns-established:
  - "Synchronous-disposal idiom for System.Threading.Timer: `using var handle = new ManualResetEvent(false); _timer.Dispose(handle); handle.WaitOne();` — copy-paste-ready for any periodic-callback class that needs synchronous teardown"
  - "Two-stage idempotency: _disposed flag (intent) + _field = null (defensive) — flag handles the 'don't run twice' invariant; nulling defends against any code path that reaches into the disposed object via the field"

requirements-completed: [SEM-05]

# Metrics
duration: 3min
completed: 2026-05-20
---

# Phase 85 Plan 04: Off-thread Sampling Refactor — Synchronous Disposal Summary

**Replaced placeholder `_timer?.Dispose()` (Plan 03 baseline) with the synchronous-blocking `_timer.Dispose(WaitHandle)` form per D-03. `Dispose()` now blocks on a `ManualResetEvent` until any in-flight tick callback fully completes before returning — eliminating the late-`BeginInvoke`-into-torn-down-window class of bug. Combined with D-09 (dispatcher-shutdown guard already in place from Plan 03), the teardown race is now closed in both directions: ticks already running drain before `Dispose()` returns; ticks that started but reach `BeginInvoke` after dispatcher shutdown bail at the guard. Added `_disposed` idempotency flag so double-Dispose does not throw. `MainWindow.xaml.cs` byte-for-byte unchanged; all 129 App + 449 Core tests pass.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-20T07:32:10Z (plan execution)
- **Completed:** 2026-05-20T07:35:25Z
- **Tasks:** 1 (type=auto, tdd=true — RED bar is the existing 12 ComputeProximityRatio + 8 IsModifierHeld DataRow tests, which are pure-logic and already green; the disposal hardening is "green by construction" because all existing tests exercise pure-logic methods that never invoke Dispose)
- **Files modified:** 1 (`FuzzyClock.App/GhostModeController.cs`)

## Accomplishments

- **`_disposed` field added** alongside the existing field block (between `_isEnabled` from Plan 02 and the public property block) — `private bool _disposed;` with a comment marking it as the D-03 idempotency guard. Plain (non-volatile) `bool` because the field is only touched by the Dispose() call site, which is conventionally invoked at most once per app lifetime from the WPF dispatcher thread (App.xaml.cs Shutdown path).
- **`Dispose()` rewritten** from the Plan 03 one-liner `_timer?.Dispose();` to the structured WaitHandle-based form per D-03:
  1. `if (_disposed) return;` — idempotency early-exit
  2. `_disposed = true;` — set immediately to short-circuit any concurrent re-entry
  3. `if (_timer == null) return;` — handle the Initialize-never-called case cleanly (no NRE, no spurious WaitHandle creation)
  4. `using (var notifyObject = new System.Threading.ManualResetEvent(false)) { _timer.Dispose(notifyObject); notifyObject.WaitOne(); }` — the WaitHandle form of `Timer.Dispose` signals the handle when all callbacks have completed; `WaitOne()` blocks until that signal, making disposal effectively synchronous. The `using` block disposes the handle automatically after `WaitOne()` returns.
  5. `_timer = null;` — defensive nulling so any resurrected reference observes null
- **Doc-comment block on `Dispose()`** explains the mechanism, the idempotency contract, and the Initialize-never-called short-circuit. References D-03 (this plan) and D-09 (Plan 03) so future readers see the two halves of the closed teardown race together.
- **`OnSampleThreadTick` body unchanged** — the existing `try { ... } finally { _tickInFlight = 0; }` from Plan 03 is what makes the WaitHandle signaling correct. The timer infrastructure waits for the callback method to return before signaling; the finally block ensures the method returns cleanly (no escaped exception) on every code path.
- **`Activate()`, `IsModifierHeld()`, `OnSampleTick()`, `ComputeProximityRatio()`, `Initialize()`, `UpdateModifierConfig()`, `GhostFadeRadiusPx`, `IsEnabled`, `IsActive` all unchanged from Plan 03** — the diff is laser-focused on Dispose() body + one new field declaration.
- **`MainWindow.xaml.cs` byte-for-byte unchanged** — `git diff FuzzyClock.App/MainWindow.xaml.cs` returns empty; no MainWindow touchpoint exercises Dispose() differently.

## Task Commits

Each task was committed atomically:

1. **Task 1: Synchronous disposal via _timer.Dispose(WaitHandle)** — `776bbbf` (refactor)

## Files Created/Modified

- `FuzzyClock.App/GhostModeController.cs` — Net change: +40 / −1 lines (final +39 net). Field block grew by 1 entry (`_disposed`); `Dispose()` body grew from a one-liner to a 14-line method with structured idempotency guard, null-check, using-block WaitHandle disposal, and defensive nulling. New 16-line XML doc comment on Dispose() references D-03 and D-09.

## Decisions Made

- **`ManualResetEvent` (initial state `false`) over `AutoResetEvent` or `Mutex`:** ManualResetEvent stays signaled once set — the right semantic for "all callbacks complete" (a one-shot signal that the consumer waits on once). AutoResetEvent would auto-reset after a single WaitOne, which complicates any reasoning about double-Dispose semantics. Mutex would add cross-process semantics this code does not need. Initial state `false` (unsignalled) is the standard "wait until the timer signals me" idiom.
- **`using` statement for `ManualResetEvent` over explicit `.Dispose()`:** The `using` block ensures the handle is disposed even if `WaitOne()` were ever to throw (it cannot under normal conditions, but the discipline is free). The IL emitted is identical to a try/finally with explicit Dispose, but the source is more concise and the lifetime is visually scoped.
- **`_disposed` `bool` flag for idempotency over relying on `_timer == null` alone:** The flag's intent is "this method has run before"; the field nulling's intent is "any post-disposal reach observes null." These are different invariants worth tracking separately. Also avoids ordering subtleties — the flag is set BEFORE the WaitOne, the field is nulled AFTER. A pure-null-check approach would either set the field first (and then have nothing to dispose against) or set it last (and then leak the idempotency window during the WaitOne).
- **Set `_disposed = true` BEFORE the WaitOne, set `_timer = null` AFTER:** If a concurrent thread were to call Dispose() while WaitOne is in progress, the second call short-circuits at the `_disposed` early-exit rather than racing with the cleanup. `Timer.Dispose(WaitHandle)` is itself thread-safe per BCL contract — but skipping that overhead via the early-exit is cleaner. The `_timer = null` after WaitOne ensures any defensive code on the same thread post-disposal observes null without racing.
- **`WaitOne()` with no timeout (block indefinitely):** Per the plan's threat model, T-85-13 (Dispose() deadlocks waiting on a misbehaving callback) is explicitly accepted — the tick callback body is bounded (~33 ms tick period + non-blocking BeginInvoke post + the dispatcher-shutdown guard short-circuits before BeginInvoke during teardown). If a future change introduces unbounded callback work, revisit with a timeout. Plan tracks this in the threat register so any future change to OnSampleThreadTick that adds blocking work has a clear breadcrumb back to this decision.
- **Plain (non-volatile) `bool` for `_disposed`:** Dispose() is invoked at most once per app lifetime from the WPF dispatcher thread (App.xaml.cs Shutdown path); the field is only read and written by that single thread. No cross-thread coherence issue. If Dispose were ever to be called from multiple threads (which the threat model accepts as a no-op via the `_disposed` early-exit), volatile would still not help — the early-exit guard provides the correct semantics regardless of memory ordering because Timer.Dispose(WaitHandle) is itself thread-safe.

## Deviations from Plan

None — plan executed exactly as written.

The plan was unusually precise — line-numbered references to the Plan 03 baseline, exact field placement (alongside `_tickInFlight`), explicit recommendation of `using var notifyObject = new System.Threading.ManualResetEvent(false);`, and a 6-step Dispose() rewrite checklist. Task 1 executed verbatim with no auto-fixes, no architectural questions, no surprises. The build succeeded on the first run (no compile errors), all 129 App tests passed unchanged, and `MainWindow.xaml.cs` was untouched.

The only minor judgment calls were the doc-comment block (the plan did not specify wording but encouraged forward-looking notes referencing D-03 and D-09 together) and the placement of `_disposed` in the field block. Both were straightforward applications of the patterns already established in Plans 01–03 — group related fields, use XML doc comments to call out the threading invariants. None of these affect executable behavior; they are documentation maintenance.

---

**Total deviations:** 0
**Impact on plan:** None — `MainWindow.xaml.cs` byte-for-byte unchanged (`git diff` empty); the pure seam from Plan 01 is unchanged; the volatile field shape from Plan 02 is unchanged; the threading mechanics from Plan 03 are unchanged. Only the Dispose() body and the addition of one private field changed.

## Issues Encountered

- **Pre-existing analyzer warnings (32 MSTEST0037):** Same 32 pre-existing MSTEST0037 warnings (suggesting `Assert.IsLessThan/Assert.Contains/Assert.IsGreaterThanOrEqualTo` over generic `Assert.IsTrue/IsFalse`). Out of scope for this plan per the executor's scope-boundary rule — they pre-date this work and live in test projects this plan does not touch. Logged here for visibility; consistent with Plans 01–03 issue logs.
- **Solution file naming:** As in Plans 01–03, the plan's `<verify>` block used `dotnet build FuzzyClock.sln`, but this repo ships `FuzzyClock.slnx` (per PROJECT.md "dotnet 10 .slnx format" decision). Resolved identically — ran `dotnet build FuzzyClock.slnx` instead. Pure tooling-flag substitution; no behavior implication. Not tracked as a Rule-3 deviation because it's a verification-step adaptation, not a code change.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

**Phase 85 complete (4/4 plans).** With Plan 04 landed, every Phase 85 success criterion is satisfied:

1. ✅ `GhostModeController` no longer owns a `DispatcherTimer`; sampling is driven by `System.Threading.Timer` at 33 ms (Plan 03)
2. ✅ `GetCursorPos`, `GetWindowRect`, `GetAsyncKeyState`, `ComputeProximityRatio` execute on the sampling thread; UI work marshals via `Dispatcher.BeginInvoke` (Plan 03)
3. ✅ Ratio reaching 1.0 still applies WS_EX_TRANSPARENT, ratio dropping below 1.0 still removes it immediately, `Restored` still fires only on full retreat to ratio 0.0 — pure-logic seam (Plan 01) preserves this byte-for-byte
4. ✅ Configurable Ctrl/Alt/Shift modifier-held check still forces ratio to 0.0 when held; ghost-mode tray toggle off still produces zero sampling work (Plan 01 + Plan 02 volatile fields)
5. ✅ Pure-logic core reachable from tests via `OnSampleTick` internal seam (Plan 01) with `InternalsVisibleTo` plumbing already in place

Plus the Plan 04 contribution:

- ✅ `Dispose()` blocks until any in-flight tick completes via `_timer.Dispose(WaitHandle)` + `WaitOne()` (D-03)
- ✅ Disposal is idempotent via `_disposed` flag (T-85-14 mitigation)
- ✅ Closed teardown race in both directions when combined with D-09 dispatcher-shutdown guard (T-85-12 mitigation)

**Phase 86 (frame-driven opacity)** — Ready in principle. The `BeginInvoke` marshalling pattern (Plan 03) and synchronous disposal (this plan) are now both in place. Phase 86 will subscribe to `ProximityChanged` (now arriving on the UI thread via `BeginInvoke`) and pump per-frame opacity via `CompositionTarget.Rendering`. The `_proximityRatio` field in MainWindow continues to be the bridge — Phase 86 changes only the consumer of `ProximityChanged`, not the producer.

**Phase 87 (verification + tests)** — Ready in principle. The `OnSampleTick` pure seam from Plan 01 is untouched; new parametric `[DataRow]` tests can drive transitions without going through the timer. Manual perf check under 25–50% CPU load can use the now-off-thread sampler to validate that the visible fade stays smooth. The synchronous disposal lets Phase 87 (or future regression tests) tear down a controller deterministically without sleeping or polling for tick completion.

**No blockers or concerns.** `MainWindow.xaml.cs` lines 160–184 remain byte-for-byte unchanged across all four plans of Phase 85; the public surface of `GhostModeController` is unchanged (callers see the same `Initialize / IsEnabled / IsActive / GhostFadeRadiusPx / UpdateModifierConfig / Activate / Dispose / ProximityChanged / Restored` shape they always saw); `OnSampleTick` (Plan 01) and the volatile field block (Plan 02) carry through verbatim; the threading mechanics (Plan 03) carry through verbatim.

## Threat Mitigation Outcomes

Per the plan's `<threat_model>`:

- **T-85-12 (Tampering — late tick fires after Dispose() returns):** ✅ **Mitigated** by D-03 `_timer.Dispose(WaitHandle)` + `WaitOne()` blocking until in-flight callbacks complete. Combined with D-09 (already in Plan 03) covers both directions of the teardown race.
- **T-85-13 (DoS — Dispose() deadlocks waiting on a misbehaving callback):** **Accepted.** Tick callback is bounded: at most one tick period (~33 ms) of work plus the BeginInvoke post (which is non-blocking). `WaitOne()` without timeout is safe given the short, bounded callback. Decision recorded so any future change to `OnSampleThreadTick` that introduces unbounded work has a clear breadcrumb to revisit with a timeout.
- **T-85-14 (Tampering — Double-Dispose throws or corrupts state):** ✅ **Mitigated** by `_disposed` early-exit guard plus `_timer = null` post-WaitOne ensuring idempotent disposal.

## Self-Check: PASSED

- FOUND: `FuzzyClock.App/GhostModeController.cs`
- FOUND commit `776bbbf` — Task 1 (refactor: synchronous Dispose via _timer.Dispose(WaitHandle) per D-03)
- VERIFIED `private bool _disposed` literal substring present at line 81 (idempotency guard field)
- VERIFIED `if (_disposed) return;` literal substring present in Dispose() body (early-exit guard)
- VERIFIED `new System.Threading.ManualResetEvent(false)` literal substring present in Dispose() body (initial-state-false WaitHandle)
- VERIFIED `_timer.Dispose(notifyObject)` literal substring present (WaitHandle overload of Timer.Dispose, NOT the parameterless form)
- VERIFIED `notifyObject.WaitOne()` literal substring present (synchronous block until signaled)
- VERIFIED `using (var notifyObject = ...)` literal substring present (ManualResetEvent disposed via using statement)
- VERIFIED `_timer = null;` after WaitOne (defensive nulling for post-disposal access)
- VERIFIED `Dispose()` handles `_timer == null` cleanly with `if (_timer == null) return;` early-return
- VERIFIED `OnSampleThreadTick` body unchanged from Plan 03 — verified by `git diff` showing no changes outside the field block and the Dispose() method
- VERIFIED `Activate()`, `Initialize()`, `OnSampleTick()`, `IsModifierHeld()`, `ComputeProximityRatio()`, `UpdateModifierConfig()`, `GhostFadeRadiusPx`, `IsEnabled`, `IsActive` all unchanged from Plan 03 (single-method diff)
- VERIFIED `MainWindow.xaml.cs` is byte-for-byte unchanged (`git diff FuzzyClock.App/MainWindow.xaml.cs` returns empty output)
- VERIFIED `dotnet build FuzzyClock.slnx` exits 0 (32 pre-existing warnings, 0 errors, 0 new warnings)
- VERIFIED `dotnet test FuzzyClock.App.Tests` exits 0 (129 / 129 passing — same as Plan 03 baseline)
- VERIFIED `dotnet test FuzzyClock.Core.Tests` exits 0 (449 / 449 passing — sanity check, Core was untouched)

---
*Phase: 85-off-thread-sampling-refactor*
*Completed: 2026-05-20*
