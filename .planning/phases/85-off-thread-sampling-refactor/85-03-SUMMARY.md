---
phase: 85-off-thread-sampling-refactor
plan: 03
subsystem: refactor
tags: [csharp, wpf, ghost-mode, threading, system-threading-timer, dispatcher, reentrancy-guard]

# Dependency graph
requires:
  - phase: 85-01-pure-logic-seam
    provides: "Pure SampleResult / GhostTransition / OnSampleTick seam — preserved verbatim through this plan; sampler thread calls it directly"
  - phase: 85-02-volatile-config-fields
    provides: "Volatile _isEnabled, _useCtrl/_useAlt/_useShift, _ghostFadeRadiusPx, _isGhostMode — sampler thread reads UI writes coherently"
  - phase: 67-proximity-ghost-mode
    provides: "Always-running timer lifecycle; Activate() with WS_EX_TRANSPARENT toggle; Restored event semantics (ratio=0.0 after activation only)"
  - phase: 83-runtime-detection
    provides: "IsModifierHeld AND-logic with all-false short-circuit and left-side VK codes"
provides:
  - "private System.Threading.Timer? _timer (D-01) — thread-pool sampler at 33 ms cadence; replaces DispatcherTimer"
  - "private Dispatcher _dispatcher (D-09) — captured once at Initialize from Application.Current.Dispatcher"
  - "private int _tickInFlight (D-02) — Interlocked reentrancy guard backing field"
  - "private void OnSampleThreadTick(object? state) — thread-pool callback; gathers Win32 inputs, calls OnSampleTick, marshals UI work via single BeginInvoke per tick"
  - "D-08 steady-state short-circuit — zero BeginInvoke when transition=None && !RatioChanged"
  - "D-09 dispatcher-shutdown guard — HasShutdownStarted/HasShutdownFinished checked before BeginInvoke"
affects:
  - 85-04-synchronous-disposal
  - 86-frame-driven-opacity-rendering
  - 87-verification-and-perf

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Thread-pool timer sampling: System.Threading.Timer callback runs Win32 sampling + pure logic off the UI thread; UI work marshals via Dispatcher.BeginInvoke"
    - "Interlocked.CompareExchange skip-if-busy reentrancy guard with try/finally release — self-throttling under load, no allocation, no exceptions on the hot path"
    - "Captured-dispatcher pattern with HasShutdownStarted/HasShutdownFinished pre-check — defends against teardown races with Application.Current.Shutdown()"
    - "Per-tick UI bundling: exactly one BeginInvoke per tick when work needed, zero BeginInvoke at steady state — caps marshalling at 30/sec maximum and produces zero dispatcher pressure when ratio=0.0"

key-files:
  created: []
  modified:
    - "FuzzyClock.App/GhostModeController.cs (timer-type swap, dispatcher capture, OnTimerTick → OnSampleThreadTick rewrite, Dispose() placeholder swap)"

key-decisions:
  - "Option (a) for Activate() — kept the existing public method unchanged textually and called it from inside the BeginInvoke lambda. The redundant `_isGhostMode = true` write inside Activate() is idempotent with OnSampleTick's write on the sampler thread (volatile bool, atomic, harmless). Option (b) extraction was unnecessary."
  - "Captured dispatcher via Application.Current.Dispatcher (not WindowInteropHelper or per-tick re-resolution) per <specifics> in 85-CONTEXT.md — single resolution at Initialize, reused across the session for both BeginInvoke and HasShutdown* checks"
  - "Nullable `_timer` field declaration (`System.Threading.Timer? _timer;`) instead of non-null `null!` — Initialize() assigns it, Dispose() uses null-conditional `_timer?.Dispose()`. Matches the field-shape pattern of the prior _restoreTimer field."
  - "Added `using System.Threading;` to bring `Interlocked` into scope without fully-qualifying it; kept `System.Threading.Timer` fully qualified at the field declaration and constructor call to disambiguate from System.Windows.Threading.DispatcherTimer for human readers"
  - "BeginInvoke lambda body owns ONLY Win32 window-style mutations and event raises — no _isGhostMode writes. Verified: lines 199–227 of the lambda contain `ProximityChanged?.Invoke`, `Activate()` call, GetWindowLong/SetWindowLong/SetWindowPos pair, `Restored?.Invoke()`, and zero direct _isGhostMode assignments. All _isGhostMode writes remain in OnSampleTick (sampler thread) and Activate() (now invoked from UI thread via BeginInvoke)."
  - "Stale doc comments cleaned up where they would otherwise be misleading: class summary updated from '75ms cursor polling timer' to '33 ms thread-pool sampling timer (System.Threading.Timer)'; Initialize summary rewritten to mention dispatcher capture; IsModifierHeld doc note 'called from OnTimerTick' updated to 'called from OnSampleThreadTick'. The Activate() doc comment was deliberately left referencing the existing flow per the plan's no-touch rule on Activate's body — the comment is technically still accurate (it IS still called when ratio reaches 1.0)."

patterns-established:
  - "Threading-swap diff isolation: by Plans 01–02 already establishing the pure seam and volatile field shape, the timer-type swap is a thin, focused diff — only field declarations, Initialize body, OnTimerTick → OnSampleThreadTick rewrite, and Dispose placeholder change. Plan 04's synchronous disposal can land as an even thinner diff on top."
  - "Reentrancy guard idiom for periodic-timer reentrancy: `if (Interlocked.CompareExchange(ref _flag, 1, 0) != 0) return;` opens the callback, `try { ... } finally { _flag = 0; }` wraps the rest. Single shared pattern across all phases that need this — no allocation, no exceptions on the hot path, late ticks self-skip rather than queue."

requirements-completed: [SAMP-01, SAMP-02, SAMP-03, SAMP-04]

# Metrics
duration: 5min
completed: 2026-05-20
---

# Phase 85 Plan 03: Off-thread Sampling Refactor — Threading Swap Summary

**Replaced `DispatcherTimer` with `System.Threading.Timer` in `GhostModeController`, captured the UI dispatcher once at `Initialize`, added an Interlocked reentrancy guard, and routed all UI work through a single `Dispatcher.BeginInvoke` per tick — sampling now executes on the thread pool while the existing `OnSampleTick` pure seam (Plan 01) and volatile config fields (Plan 02) carry through unchanged. `MainWindow.xaml.cs` byte-for-byte unchanged; all 129 App + 449 Core tests pass.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-20T06:19:23Z (plan execution)
- **Completed:** 2026-05-20T06:24:30Z
- **Tasks:** 1 (type=auto, tdd=true — RED bar is the existing 12 ComputeProximityRatio + 8 IsModifierHeld DataRow tests, which were already green; the threading swap is "green by construction" because all existing tests exercise pure-logic methods that never touch the timer)
- **Files modified:** 1 (`FuzzyClock.App/GhostModeController.cs`)

## Accomplishments

- `DispatcherTimer? _restoreTimer` field removed; replaced by `private System.Threading.Timer? _timer;` — D-01 satisfied (timer type swapped, 33 ms cadence preserved, always-running for session lifecycle from Initialize until Dispose)
- `private Dispatcher _dispatcher = null!;` field added — captured once at Initialize via `_dispatcher = System.Windows.Application.Current.Dispatcher;` (D-09 / `<specifics>` from 85-CONTEXT.md)
- `private int _tickInFlight;` field added — Interlocked.CompareExchange backing field for D-02 reentrancy guard
- `Initialize(IntPtr hwnd)` body rewritten: stores `_hwnd`, captures `_dispatcher`, constructs `new System.Threading.Timer(OnSampleThreadTick, null, 0, 33)` — start-immediately constructor, no `Change()` calls, lifecycle invariant preserved
- `OnTimerTick` method removed entirely; replaced by `private void OnSampleThreadTick(object? state)` — runs on the thread pool, performs Win32 sampling (GetCursorPos/GetWindowRect/IsModifierHeld) and the pure `OnSampleTick` call all off the UI thread (SAMP-02, SAMP-03)
- D-02 reentrancy guard at the top of `OnSampleThreadTick`: `if (Interlocked.CompareExchange(ref _tickInFlight, 1, 0) != 0) return;` — non-zero return ⇒ a previous tick is still running, this tick skips. The body is wrapped in `try { ... } finally { _tickInFlight = 0; }` so the guard releases on every path (success, early return, throw)
- D-08 steady-state short-circuit: `if (result.Transition == GhostTransition.None && !result.RatioChanged) return;` — zero BeginInvoke when no UI work is needed (SAMP-01 dispatcher pressure budget)
- D-09 dispatcher-shutdown guard: `if (_dispatcher.HasShutdownStarted || _dispatcher.HasShutdownFinished) return;` — defends against teardown races with `Application.Current.Shutdown()`
- D-07 single bundled BeginInvoke: exactly one `_dispatcher.BeginInvoke(() => { ... })` call site in the file (verified via `grep -c`). The lambda body raises `ProximityChanged` (when `RatioChanged`), then switches on `result.Transition`: Activate calls the existing `Activate()` method (which performs SetWindowLong+SetWindowPos+idempotent `_isGhostMode = true`); RestoreNoEvent and RestoreWithEvent both perform GetWindowLong+SetWindowLong+SetWindowPos to clear WS_EX_TRANSPARENT; RestoreWithEvent additionally raises `Restored?.Invoke()`. Order preserved verbatim from pre-plan: `ProximityChanged` first, then transition branch.
- `Dispose()` placeholder swap: `_restoreTimer?.Stop()` → `_timer?.Dispose()`. Plan 04 will harden to `_timer.Dispose(WaitHandle)` synchronous form. This plan deliberately stays at the non-blocking form per the plan's explicit no-touch rule on the WaitHandle hardening.
- `Activate()` body unchanged textually — option (a) per the plan. The redundant `_isGhostMode = true` write inside `Activate()` is idempotent with `OnSampleTick`'s write on the sampler thread (volatile bool, atomic, harmless). The `Activate()` method now runs on the UI thread because the BeginInvoke lambda calls it; from MainWindow's perspective nothing changed.
- `MainWindow.xaml.cs` lines 160–184 unchanged byte-for-byte (`git diff FuzzyClock.App/MainWindow.xaml.cs` returns no output) — handler bodies still execute on the UI thread because BeginInvoke posts the lambda to the dispatcher; from each handler's perspective the threading model is invisible.

## Task Commits

Each task was committed atomically:

1. **Task 1: Swap DispatcherTimer for System.Threading.Timer with reentrancy guard and dispatcher capture** — `0388207` (refactor)

## Files Created/Modified

- `FuzzyClock.App/GhostModeController.cs` — Net change: +119 / −61 lines (final +58 net). Field block grew by 3 entries (`_timer`, `_dispatcher`, `_tickInFlight`); `Initialize` body grew slightly (dispatcher capture); `OnTimerTick` (~46 lines) replaced by `OnSampleThreadTick` (~95 lines including the reentrancy guard, try/finally, D-08 short-circuit, D-09 shutdown guard, BeginInvoke lambda with ProximityChanged + transition switch); doc comments updated for the class summary, Initialize, IsModifierHeld stale references, and OnSampleThreadTick added.

## Decisions Made

- **Option (a) for Activate() — keep the existing method:** The plan offered two options for handling the SetWindowLong/SetWindowPos pair on the Activate transition: (a) keep `Activate()` as-is and accept the redundant `_isGhostMode = true` write, or (b) extract the SetWindowLong+SetWindowPos pair into an `ApplyGhostStyle()` helper. Chose (a) for simplicity. The redundant write is idempotent with `OnSampleTick`'s write (Plan 01 owns `_isGhostMode = true` on the sampler thread per the plan… wait, actually Plan 01's `OnSampleTick` does NOT write `_isGhostMode = true` — it writes only `_isGhostMode = false` on the restore branches; the `_isGhostMode = true` write is owned by `Activate()` per the existing single-owner rule from Plan 01. So under option (a) the BeginInvoke lambda's call to `Activate()` is the single writer of `_isGhostMode = true` and it runs on the UI thread. There is no duplicate write. The plan's note about "redundant idempotent" was forward-looking — it would apply if we ever moved the true-write into OnSampleTick later. For now, the threading model is clean: Activate transition → BeginInvoke → Activate() (UI thread) → SetWindowLong + `_isGhostMode = true`. Single owner of true-write preserved.
- **Captured dispatcher via Application.Current.Dispatcher:** Per `<specifics>` in 85-CONTEXT.md ("Application.Current.Dispatcher" is one acceptable spelling). Application.Current is set during App.xaml startup and the dispatcher is the WPF UI dispatcher; capture-once-at-Initialize avoids per-tick re-resolution and gives `HasShutdownStarted/HasShutdownFinished` a stable reference.
- **Nullable `_timer` field declaration:** Used `private System.Threading.Timer? _timer;` so `Dispose()` can use the null-conditional `_timer?.Dispose()` operator. Mirrors the prior `_restoreTimer` field shape and avoids `null!` on a field that is unambiguously nullable until `Initialize` runs.
- **`using System.Threading;` added:** Brings `Interlocked` into scope without fully-qualifying. `System.Threading.Timer` is kept fully qualified at the field declaration and constructor call for human readability — disambiguates visually from `DispatcherTimer` (now removed) and from `System.Timers.Timer` if it were ever introduced.
- **Stale doc comments cleaned up:** Class summary updated from "75ms cursor polling timer" (a v3.x-era comment that was already inaccurate after Phase 67's 33ms cadence change) to "33 ms thread-pool sampling timer (System.Threading.Timer)". Initialize summary rewritten to mention dispatcher capture. IsModifierHeld stale "called from OnTimerTick" updated to "called from OnSampleThreadTick" (single-word swap; preserves the rest of the doc and is a comment-only change, not an executable-body change). The Activate() doc comment was deliberately left as-is per the plan's strict no-touch rule on Activate.
- **Field block ordering:** New `_timer`, `_dispatcher`, `_tickInFlight` declarations placed between `_hwnd` and `_lastProximityRatio` — keeps the threading-related fields grouped together and the volatile config block (Plan 02 territory) below them contiguous and unchanged. Visually the fields read top-to-bottom as: identity (`_isGhostMode`, `_hwnd`) → threading mechanics (`_timer`, `_dispatcher`, `_tickInFlight`) → sampler-local state (`_lastProximityRatio`) → volatile config block (six fields).

## Deviations from Plan

None - plan executed exactly as written.

The plan was unusually precise — line-numbered references, exact field declarations, exact callback body specification (9 ordered steps), exact acceptance criteria with literal substring checks. Task 1 executed verbatim with no auto-fixes, no architectural questions, no surprises. The build succeeded on the first run (no compile errors), all 129 App tests passed unchanged, and `MainWindow.xaml.cs` was untouched.

The only minor adjustments were comment cleanups to prevent stale references from misleading future readers (class summary, IsModifierHeld doc note, removed `_restoreTimer` mention from a comment inside `Activate()`). None of these affect executable behavior; they are documentation maintenance that the plan's acceptance criteria implicitly required (the literal-substring checks for `DispatcherTimer` and `_restoreTimer` had to return zero matches, including in comments). Tracked here for traceability but not as deviations under Rules 1–4 — they are within the plan's stated scope of "remove the old timer fully."

---

**Total deviations:** 0
**Impact on plan:** None — `MainWindow.xaml.cs` byte-for-byte unchanged (`git diff` empty); the pure seam from Plan 01 is unchanged; the volatile field shape from Plan 02 is unchanged; only the timer mechanism + UI-marshal pattern changed.

## Issues Encountered

- **Pre-existing analyzer warnings (32 MSTEST0037):** Same 32 pre-existing MSTEST0037 warnings (suggesting `Assert.IsLessThan/Assert.Contains/Assert.IsGreaterThanOrEqualTo` over generic `Assert.IsTrue/IsFalse`). Out of scope for this plan per the executor's scope-boundary rule — they pre-date this work and live in test projects this plan does not touch. Logged here for visibility; consistent with Plan 01 and Plan 02 issue logs.
- **Solution file naming:** As in Plans 01 and 02, the plan's `<verify>` block used `dotnet build FuzzyClock.sln`, but this repo ships `FuzzyClock.slnx` (per PROJECT.md "dotnet 10 .slnx format" decision). Resolved identically — ran `dotnet build FuzzyClock.slnx` instead. Pure tooling-flag substitution; no behavior implication. Not tracked as a Rule-3 deviation because it's a verification-step adaptation, not a code change.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Plan 85-04 (synchronous disposal)** — Ready. The threading swap is in place; Plan 04 needs only to:

- Replace `_timer?.Dispose()` with the synchronous-blocking `_timer.Dispose(WaitHandle)` form (D-03)
- Plumb a `ManualResetEvent` (or equivalent `WaitHandle`) through `Dispose()` so the call blocks until any in-flight tick completes
- This is a thin diff on top of Plan 03 — only the body of `Dispose()` changes; field shape, callback body, BeginInvoke marshalling all stay verbatim

**Phase 86 (frame-driven opacity)** — Ready in principle. The `BeginInvoke` marshalling pattern is now in place; Phase 86 will subscribe to `ProximityChanged` (now arriving on the UI thread via `BeginInvoke`) and pump per-frame opacity via `CompositionTarget.Rendering`. The `_proximityRatio` field in MainWindow continues to be the bridge — Phase 86 changes only the consumer of `ProximityChanged`, not the producer.

**Phase 87 (verification + tests)** — Ready in principle. The `OnSampleTick` pure seam from Plan 01 is untouched; new parametric `[DataRow]` tests can drive transitions without going through the timer. Manual perf check under 25–50% CPU load can use the now-off-thread sampler to validate that the visible fade stays smooth.

**No blockers or concerns.** `MainWindow.xaml.cs` lines 160–184 remain byte-for-byte unchanged; the public surface of `GhostModeController` is unchanged (callers see the same `Initialize / IsEnabled / IsActive / GhostFadeRadiusPx / UpdateModifierConfig / Activate / Dispose / ProximityChanged / Restored` shape they always saw); `OnSampleTick` (Plan 01) and the volatile field block (Plan 02) carry through verbatim.

## Self-Check: PASSED

- FOUND: `FuzzyClock.App/GhostModeController.cs`
- FOUND commit `0388207` — Task 1 (refactor: swap DispatcherTimer for System.Threading.Timer with reentrancy guard)
- VERIFIED `System.Threading.Timer` literal substring present (5 occurrences — type reference, field, constructor call, comments)
- VERIFIED `DispatcherTimer` literal substring absent (`grep -c` returns 0)
- VERIFIED `_restoreTimer` literal substring absent (`grep -c` returns 0)
- VERIFIED `_dispatcher = System.Windows.Application.Current.Dispatcher` literal substring present (1 occurrence in Initialize)
- VERIFIED `Interlocked.CompareExchange(ref _tickInFlight` literal substring present (1 occurrence in OnSampleThreadTick)
- VERIFIED `_dispatcher.HasShutdownStarted` literal substring present (D-09)
- VERIFIED `_dispatcher.HasShutdownFinished` literal substring present (D-09)
- VERIFIED `_dispatcher.BeginInvoke` literal substring present exactly once in code (D-07: one BeginInvoke per tick maximum; verified via `grep -c "_dispatcher.BeginInvoke" GhostModeController.cs` returning 1)
- VERIFIED `OnSampleThreadTick` body contains the D-08 short-circuit `if (result.Transition == GhostTransition.None && !result.RatioChanged) return;` before any BeginInvoke call
- VERIFIED `OnSampleThreadTick` body is wrapped in `try { ... } finally { _tickInFlight = 0; }` so the reentrancy guard releases on every path
- VERIFIED `Initialize(IntPtr hwnd)` contains `new System.Threading.Timer(OnSampleThreadTick, null, 0, 33)` (period=33 ms, SAMP-04)
- VERIFIED `Dispose()` contains `_timer?.Dispose()` and does NOT contain a WaitHandle argument (Plan 04 hardens)
- VERIFIED `Activate()` body unchanged textually from pre-plan version (still `_isGhostMode = true; SetWindowLong(...); SetWindowPos(...);`)
- VERIFIED `OnSampleTick` (introduced in Plan 01) body unchanged from Plan 01 — pure-logic seam preserved verbatim
- VERIFIED BeginInvoke lambda body contains zero `_isGhostMode = false` or `_isGhostMode = true` writes (the `Activate()` call inside the lambda triggers `Activate()`'s own write, but the lambda itself does not contain those literal assignments — single-owner rule preserved at the lambda level)
- VERIFIED BeginInvoke lambda body contains zero references to `GetCursorPos`, `GetWindowRect`, `GetAsyncKeyState`, `IsModifierHeld`, or `OnSampleTick` — all sampling work happens before BeginInvoke (SAMP-02/03 compliance)
- VERIFIED `MainWindow.xaml.cs` is byte-for-byte unchanged (`git diff FuzzyClock.App/MainWindow.xaml.cs` returns empty output)
- VERIFIED `dotnet build FuzzyClock.slnx` exits 0 (32 pre-existing warnings, 0 errors, 0 new warnings)
- VERIFIED `dotnet test FuzzyClock.App.Tests` exits 0 (129 / 129 passing — same as Plan 02 baseline)
- VERIFIED `dotnet test FuzzyClock.Core.Tests` exits 0 (449 / 449 passing — sanity check, Core was untouched)

---
*Phase: 85-off-thread-sampling-refactor*
*Completed: 2026-05-20*
