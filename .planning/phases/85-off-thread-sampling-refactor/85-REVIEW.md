---
phase: 85-off-thread-sampling-refactor
reviewed: 2026-05-20T00:00:00Z
depth: standard
files_reviewed: 1
files_reviewed_list:
  - FuzzyClock.App/GhostModeController.cs
findings:
  critical: 1
  warning: 7
  info: 4
  total: 12
status: issues_found
---

# Phase 85: Code Review Report

**Reviewed:** 2026-05-20
**Depth:** standard
**Files Reviewed:** 1
**Status:** issues_found

## Summary

Reviewed `FuzzyClock.App/GhostModeController.cs` (452 lines) covering Phase 85's off-thread sampling refactor (Plans 01-04: pure-logic seam extraction, volatile field conversion, `System.Threading.Timer` swap with reentrancy guard, and synchronous `Dispose(WaitHandle)`).

The thread-safety architecture is mostly sound — volatile flags are correctly applied to the cross-thread reader pattern, the Interlocked reentrancy guard idiom is correct, and `Dispose(WaitHandle)` + `WaitOne()` does block until in-flight callbacks drain. However, the review surfaced one **BLOCKER** (a stale-`_isGhostMode` window between sampler-tick decision and UI-thread `Activate()` execution that produces incorrect transitions and visible glitches), seven **WARNINGs** (memory-fence on guard release, queued-BeginInvoke surviving Dispose, Dispose double-call deadlock, `Initialize` not idempotent, latent slow-retreat `Restored` non-fire, public `Activate()` thread-affinity hazard, stale documentation), and four **INFOs** (mixed event vs. delegate-field surface, ignored `Timer.Dispose` return, dead/stale comments, public method spawn-points).

The BLOCKER and several WARNINGs are caused by the same architectural seam: the sampler decides a transition based on a snapshot of `_isGhostMode`, but the UI-thread side effect that flips `_isGhostMode = true` runs asynchronously via `BeginInvoke`. Between those two points, additional sampler ticks can fire with a stale view of state.

## Critical Issues

### CR-01: Stale `_isGhostMode` window allows duplicate Activate dispatches and inverted transitions during fast cursor movement

**File:** `FuzzyClock.App/GhostModeController.cs:354-368` (and `:199-240` BeginInvoke lambda)

**Issue:** `OnSampleTick` decides `GhostTransition.Activate` purely on the read of `_isGhostMode` at line 354. The actual write `_isGhostMode = true` happens inside `Activate()` (line 259), which runs on the UI dispatcher via the BeginInvoke lambda at line 213. The BeginInvoke is asynchronous — the sampler's *next* tick (33 ms later) can fire BEFORE the dispatcher processes the queued lambda. Trace:

- Tick T0: ratio=1.0, `_isGhostMode`=false → seam emits `Activate`. Lambda queued. `_isGhostMode` is **still false**.
- Tick T1 (33 ms later, dispatcher backed up by font-rendering / GC / etc.): ratio=1.0 still, `_isGhostMode`=**still false** (UI hasn't run lambda yet) → seam emits **another** `Activate`. Second `BeginInvoke` queued. Now two `Activate()` calls are queued.
- The two `Activate()` calls are idempotent for Win32, so the second one is harmless. But this is a documentation defect — the comment at `:210-213` claims "_isGhostMode = true (already set by OnSampleTick on the sampler thread — volatile bool, atomic, harmless)". `OnSampleTick` does NOT set `_isGhostMode = true` (only `Activate()` does, per the docstring at `:301-303`). The "harmless re-write" justification is false; this is a redundant Win32 round-trip.

The more serious case — tick T0 emits `Activate`, then by T1 the cursor has already retreated:

- Tick T0: ratio=1.0, `_isGhostMode`=false → emit `Activate`, queue lambda.
- Tick T1: ratio=0.5 (cursor moved away), `_isGhostMode`=**still false** (lambda not yet run). Conditions on `:354` (`ratio >= 1.0`) and `:359` (`_isGhostMode`) both miss → `transition = None`. RatioChanged fires for opacity update.
- Dispatcher wakes up: lambda from T0 runs `Activate()` → window becomes `WS_EX_TRANSPARENT` (click-through), `_isGhostMode = true`.
- Tick T2: ratio=0.0, `_isGhostMode`=true → `RestoreWithEvent`. Lambda queued.
- Dispatcher runs T2 lambda → click-through removed, `Restored` fires.

Net: the window enters click-through state **after the cursor has already left it**, for one or more tick periods. This is visible as the widget being briefly non-interactive when the cursor sits on top of it for >33 ms then moves away — the click-through engages just as you try to grab the widget. This is a behavioral regression versus the v4.0 `DispatcherTimer`, where the entire loop was synchronous on the UI thread.

**Fix:** The decision to emit `Activate` should observe a state that is *also written by the same thread that emitted the prior decision*. Two equivalent fixes:

(a) Have `OnSampleTick` set `_isGhostMode = true` on the sampler thread when it emits `Activate`, mirroring the existing single-owner write of `false` on `:367`. The UI-thread `Activate()` then becomes purely a Win32 mutation, with the volatile write already visible to the next sampler tick:

```csharp
if (ratio >= 1.0 && !_isGhostMode)
{
    transition = GhostTransition.Activate;
    _isGhostMode = true;   // single-owner write, mirror of line 367
}
```

And split the UI-thread Win32 work out of `Activate()` (or have `Activate()` skip its own `_isGhostMode = true` since it's now redundant — current line 259).

(b) Track activation in flight with a separate sampler-owned flag (`_activatePending`) so the seam treats "Activate already queued" as "ghost is effectively on" until the UI lambda confirms it. More state, more code paths — option (a) is simpler.

The existing comment block at `:209-213` (and `:301-303`) document that the *intent* matches option (a), but the code does not. Pick one and align the comments.

## Warnings

### WR-01: `_tickInFlight = 0` release lacks `Volatile.Write` / `Interlocked.Exchange`

**File:** `FuzzyClock.App/GhostModeController.cs:245`

**Issue:** The reentrancy guard is acquired with `Interlocked.CompareExchange` (full memory barrier on read+write). The release at `:245` is a plain `_tickInFlight = 0;`. On x86/x64 with .NET's strong memory model, plain int writes are typically released in program order, but the .NET memory model technically permits the JIT or the CPU (on weaker-memory architectures like ARM) to reorder this write past prior writes inside the `try` block (e.g., `_isGhostMode = false` at `:367`, `_lastProximityRatio = ratio` at `:376`). The next thread-pool callback's `CompareExchange` would acquire-fence and observe the latest value, but a reader that only does plain reads would not.

Right now no plain reader exists, so the bug is latent — but the canonical idiom for skip-if-busy is `Interlocked.Exchange(ref _tickInFlight, 0)` or `Volatile.Write(ref _tickInFlight, 0)` to make the release fence explicit and resilient to future readers.

**Fix:**
```csharp
finally
{
    Volatile.Write(ref _tickInFlight, 0);
}
```

Or `Interlocked.Exchange(ref _tickInFlight, 0)` if you prefer symmetry with the acquire. No measurable perf cost on the off-thread tick path.

### WR-02: Already-queued `BeginInvoke` lambdas survive `Dispose()` and run against torn-down state

**File:** `FuzzyClock.App/GhostModeController.cs:429-450` (Dispose) and `:193, 199` (shutdown guard placement)

**Issue:** Plan 04's docstring at `:412-422` claims `Dispose()` "blocks until any in-flight tick callback fully completes before returning … no further timer callbacks fire after `Dispose()` returns (no late `BeginInvoke` into a torn-down window)." This is half-true: `Timer.Dispose(WaitHandle)` does block until the *callback method* returns, but `BeginInvoke` is asynchronous — the callback method returns immediately after queuing the UI lambda. A lambda queued by tick T(n-1) at instant t-1 ms can sit in the dispatcher message queue while `Dispose()` runs from `MainWindow.Closed` (`:222`), drains the in-flight callback, and returns. The dispatcher then processes the queued lambda *after* `Dispose()` has returned, calling into `Activate()` / Win32 / `ProximityChanged?.Invoke()` / `Restored?.Invoke()` against a closed window.

The D-09 shutdown guard at `:193` is checked BEFORE `BeginInvoke`, not inside the lambda — so it does not protect the lambda once queued. The `_disposed` flag is also not checked inside the lambda.

In practice this is mostly benign on Windows: SetWindowLong on an invalid HWND silently fails, and WPF's `Window.Opacity` setter on a closed window does not throw. But raising `Restored?.Invoke()` to MainWindow's handler, which mutates `BackdropBorder.Background`, can throw `ElementNotAvailableException` if the visual tree has been disposed.

**Fix:** Either (a) check `_disposed` inside the lambda before invoking events / Win32, or (b) capture the dispatcher's `DispatcherPriority.Send` semantics by using `Invoke` on shutdown, or (c) tighten the docstring to reflect actual guarantee — synchronous drain of the callback body, not the queued UI work.

```csharp
_dispatcher.BeginInvoke(() =>
{
    if (_disposed) return;   // late lambda — controller is gone
    if (result.RatioChanged) ProximityChanged?.Invoke(result.NewRatio);
    // ... rest of switch
});
```

### WR-03: Concurrent `Dispose()` calls can deadlock the second caller

**File:** `FuzzyClock.App/GhostModeController.cs:430-446`

**Issue:** `_disposed` is a non-volatile, non-Interlocked plain `bool`. If `Dispose()` is invoked from two threads near-simultaneously (e.g., a tray-menu Quit on UI thread overlapping with a `Window.Closed` event during shutdown), both threads can pass the `if (_disposed) return;` check before either writes `_disposed = true`. Both then proceed:

- Thread A: `_timer.Dispose(handleA)` returns true; `handleA.WaitOne()` blocks until callback drains; eventually returns.
- Thread B: `_timer.Dispose(handleB)` returns FALSE (timer already disposed); `handleB` is never signaled; `handleB.WaitOne()` blocks **forever**.

The `Timer.Dispose(WaitHandle)` return value is ignored at `:444`, so the false return is not handled. The plan threat-model T-85-13 ("accept" disposition) considered the unbounded-callback case but did not consider double-Dispose deadlock.

Documentation convention says `IDisposable.Dispose` need not be thread-safe, but the WPF/MainWindow.Closed → tray-quit → Application.Shutdown sequence is exactly the kind of scenario where ordering is fragile.

**Fix:**
```csharp
public void Dispose()
{
    if (Interlocked.Exchange(ref _disposedFlag, 1) != 0) return;   // _disposedFlag is int
    if (_timer == null) return;
    using var notifyObject = new ManualResetEvent(false);
    if (_timer.Dispose(notifyObject))
        notifyObject.WaitOne();
    _timer = null;
}
```

The `Interlocked.Exchange` makes the early-exit race-free; the `if (_timer.Dispose(...))` check guards against the never-signaled WaitHandle case.

### WR-04: `Initialize()` is not idempotent — second call leaks first timer

**File:** `FuzzyClock.App/GhostModeController.cs:134-142`

**Issue:** `Initialize()` is `public` and has no guard against repeated invocation. A second call:

```csharp
_hwnd = hwnd;
_dispatcher = System.Windows.Application.Current.Dispatcher;
_timer = new System.Threading.Timer(OnSampleThreadTick, null, 0, 33);
```

unconditionally overwrites `_timer` with a fresh instance. The previous `_timer` reference is now unreachable; its callback continues firing on the thread pool until GC collects it (which can take many seconds). For the duration both timers fire `OnSampleThreadTick`. Both contend for the same `_tickInFlight` slot, so logical correctness is preserved (only one body runs at a time), but the two-timer state is unintended and will cause `Dispose()` to leak the first timer entirely (`_timer = null` only nulls the second).

`MainWindow.xaml.cs:176` calls `Initialize` exactly once today, so the bug is latent — but `public void Initialize` advertises an entry point that is unsafe to use twice.

**Fix:** Guard with a one-shot check or throw on double-init:
```csharp
public void Initialize(IntPtr hwnd)
{
    if (_timer != null)
        throw new InvalidOperationException("GhostModeController already initialized.");
    // ... rest
}
```

### WR-05: `Restored` event does not fire on slow cursor retreat (latent — pre-existing, not regression)

**File:** `FuzzyClock.App/GhostModeController.cs:359-368`

**Issue:** The seam clears `_isGhostMode = false` on the *first* sub-1.0 tick after activation (line 367), regardless of whether ratio reached 0.0 yet. On a slow cursor retreat (multiple ticks at 0 < ratio < 1.0 before reaching 0.0):

- Tick A: ratio=0.5, `_isGhostMode=true` → `RestoreNoEvent`, clear `_isGhostMode=false`.
- Tick B: ratio=0.0, `_isGhostMode=false` → falls through to `transition = None`. **`RestoreWithEvent` never emitted; `Restored?.Invoke()` never called.**

`Restored` only fires when the *same tick* observes both `_isGhostMode=true` AND `ratio==0.0`, which requires the cursor to jump from `ratio≥1.0` to `ratio=0.0` in a single 33 ms window. With `radiusPx=80` (default), modest cursor speed (200 px/s) yields ~12 intermediate ticks, so `Restored` reliably fails to fire under normal use.

The downstream consequence is the `BackdropBorder.Background` reset at `MainWindow.xaml.cs:174` — which only the `Restored` handler performs. On slow retreat, `BackdropBorder` retains its non-transparent state until something else re-renders.

This bug is **pre-existing** (visible in `git show 767bea3:GhostModeController.cs` — same logic at lines 165-184 of the pre-Plan-01 file). Phase 85's plans require byte-for-byte semantic preservation, so the seam preserves the bug rather than fixes it. Flagging here because the file is in scope for review and the docstring at `:92-93` ("Fires only when cursor fully exits the proximity zone (ratio=0.0) after ghost activation") describes intended behavior that the implementation does not deliver.

**Fix (out of scope for Phase 85, but document or fix in a follow-up):** Defer the `_isGhostMode = false` write until `ratio == 0.0`, or split tracking into separate flags for "click-through applied" vs "in restore-fade":
```csharp
else if (ratio < 1.0 && _isGhostMode)
{
    if (ratio == 0.0)
    {
        transition = GhostTransition.RestoreWithEvent;
        _isGhostMode = false;
    }
    else
    {
        transition = GhostTransition.RestoreNoEvent;
        // Do NOT clear _isGhostMode yet — wait until ratio reaches 0.0
    }
}
```

But this changes the WS_EX_TRANSPARENT removal cadence (`RestoreNoEvent` would now fire repeatedly), so the plan-level fix needs care. Recommend filing as a follow-up phase rather than rolling into Phase 85.

### WR-06: Public `Activate()` is now a thread-affinity footgun

**File:** `FuzzyClock.App/GhostModeController.cs:256-264`

**Issue:** Pre-Phase 85, `Activate()` was called from the `DispatcherTimer.Tick` handler — always UI thread. After Phase 85, the controller's own internal call site is the BeginInvoke lambda (still UI thread). The method is still `public`, and its docstring at `:251-253` claims "Phase 68 will remove the external call site" — but that comment is left over from Phase 67/68 and Phase 68 never removed the public modifier.

A future caller that invokes `_ghostMode.Activate()` from a non-UI thread (or even a sampler-bound code path) would write `_isGhostMode = true` in a way that races the seam's read and breaks the single-owner invariant documented at `:298-303`. The Win32 calls themselves are thread-safe (USER32 marshals), but the volatile bool semantics depend on the seam being the sole reader-and-decider.

`Grep` confirms no external callers today (`MainWindow.xaml.cs` only uses `IsActive`, `IsEnabled`, `IsModifierHeld`, `Initialize`, `Dispose`, `UpdateModifierConfig`, `GhostFadeRadiusPx`, and assigns the events). The risk is forward-looking: the public surface still advertises `Activate()` as callable.

**Fix:** Make `Activate()` private (or internal for tests) and update the docstring. The Phase 67/68 transition note is stale.

### WR-07: Stale documentation on `Activate()` and the BeginInvoke lambda comments

**File:** `FuzzyClock.App/GhostModeController.cs:209-213, 252-253, 301-303`

**Issue:** Multiple comments contradict the code:

1. `:209-213` claims "idempotent _isGhostMode = true re-write (already set by OnSampleTick on the sampler thread — volatile bool, atomic, harmless)." `OnSampleTick` does NOT set `_isGhostMode = true`. The docstring at `:301-303` correctly states that "_isGhostMode = true is NOT written here — Activate retains that responsibility." The two comments are mutually inconsistent. (This is the documentation half of CR-01.)
2. `:252-253` claims "Phase 68 will remove the external call site." Phase 68 has shipped (per `git log`), and the external call site is gone, but the public modifier and this comment remain.
3. `:251` claims `Activate()` is "Called internally by the timer tick when ratio reaches 1.0" — true post-Phase 85, but only via the BeginInvoke lambda's switch case, which the comment doesn't mention. A reader would expect `OnSampleThreadTick` to call `Activate()` directly.

**Fix:** Reconcile `:209-213` with whichever option (a/b) you take in CR-01, drop the Phase-68 transition note from `:252-253`, and clarify `:251` that the call is dispatched via `BeginInvoke`.

## Info

### IN-01: `ProximityChanged` is a raw delegate field, not an `event`

**File:** `FuzzyClock.App/GhostModeController.cs:102`

**Issue:** `Restored` is declared `public event Action? Restored;` (`:95`) — proper event with multicast. `ProximityChanged` is declared `public Action<double>? ProximityChanged;` (`:102`) — public delegate field, allowing direct external assignment that overwrites prior subscribers. `MainWindow.xaml.cs:177` uses `=` assignment (not `+=`), reinforcing the single-handler model. Inconsistent surface; a future caller doing `_ghostMode.ProximityChanged += handler` will appear to subscribe but if anyone else later does `=`, their handler is silently lost.

**Fix:** Promote to `public event Action<double>? ProximityChanged;` and update `MainWindow.xaml.cs:177` to `+=`. (This requires a touch in MainWindow, which Plan 04 explicitly forbids — flag as a follow-up.)

### IN-02: `Timer.Dispose(WaitHandle)` return value ignored

**File:** `FuzzyClock.App/GhostModeController.cs:444`

**Issue:** The bool return value is silently dropped. As covered in WR-03, `false` indicates the timer was already disposed and the WaitHandle will never be signaled. Even outside the double-Dispose race, this is a defensive omission.

**Fix:** `if (_timer.Dispose(notifyObject)) notifyObject.WaitOne();`

### IN-03: `IsModifierHeld()` reads three `volatile` fields then computes the AND across non-atomic snapshots

**File:** `FuzzyClock.App/GhostModeController.cs:273-291`

**Issue:** `IsModifierHeld()` reads `_useCtrl`, `_useAlt`, `_useShift` multiple times (lines 276-282 plus lines 286-288). With `volatile`, each read is fresh from memory — so a UI-thread write to `UpdateModifierConfig` between reads can produce mixed-snapshot logic (e.g., `_useCtrl` read as false at `:280`, then read as true at `:286`, leading to inconsistent `ctrlOk` evaluation).

In practice the user updates these flags rarely (settings toggle), so the window is small. Sampler-thread `OnSampleTick` *does* read once into locals (`:321-324`) and operate on locals — good. But `IsModifierHeld()` doesn't follow the same pattern.

**Fix:** Snapshot at top of method:
```csharp
public bool IsModifierHeld()
{
    bool useCtrl = _useCtrl, useAlt = _useAlt, useShift = _useShift;
    if (!useCtrl && !useAlt && !useShift) return false;
    bool ctrlHeld  = useCtrl  && (GetAsyncKeyState(VK_LCONTROL) & 0x8000) != 0;
    // ... etc with locals
}
```

Same idiom as `OnSampleTick`'s read-once pattern at `:320-324`.

### IN-04: `_dispatcher = null!` initializer disguises non-nullable contract

**File:** `FuzzyClock.App/GhostModeController.cs:73`

**Issue:** `private Dispatcher _dispatcher = null!;` uses the null-forgiving operator to silence the nullability warning. Any public method that runs before `Initialize()` (e.g., `IsModifierHeld()`, `IsEnabled` setter) coexists with a `_dispatcher == null` state, and a defect that called `OnSampleThreadTick` directly (via test harness) would NRE at `:193`.

This is bounded today by the timer being created only in `Initialize` (so `OnSampleThreadTick` never runs before `_dispatcher` is set), but the field declaration disguises the contract. Either initialize lazily or use a nullable type with explicit null-checks.

**Fix:** Either accept the convention (it's documented at `:73` as "captured once at Initialize"), or change to `Dispatcher? _dispatcher;` and add a single null-check inside `OnSampleThreadTick` for defense-in-depth. The current state is a stylistic choice rather than a bug.

---

_Reviewed: 2026-05-20_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
