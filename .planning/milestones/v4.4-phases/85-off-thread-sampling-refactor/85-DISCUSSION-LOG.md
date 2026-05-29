# Phase 85: Off-thread sampling refactor - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-20
**Phase:** 85-Off-thread sampling refactor
**Areas discussed:** Timer ownership & disposal, Tickable seam shape, Dispatcher.BeginInvoke boundary, State ownership across threads

---

## Timer ownership & disposal — reentrancy

| Option | Description | Selected |
|--------|-------------|----------|
| Periodic timer + skip-if-busy guard | Timer fires every 33ms. Tick wraps in `Interlocked.CompareExchange` — slow ticks cause next tick to skip. Self-throttling under load. | ✓ |
| One-shot reschedule (`Change` at end of tick) | Initial single-shot; reschedule at end of tick. Mathematically prevents reentrancy but cadence drifts under load. | |
| Periodic timer, no reentrancy guard | Trust ticks are sub-ms. Two threads inside `OnTimerTick` simultaneously is acceptable. | |

**User's choice:** Periodic timer + skip-if-busy guard
**Notes:** Locked-in 33 ms cadence (matches existing). Reentrancy guard also doubles as the protection that lets `_lastProximityRatio` and `_isGhostMode` stay un-synchronized within the sampler thread.

## Timer ownership & disposal — disposal contract

| Option | Description | Selected |
|--------|-------------|----------|
| Synchronous wait via `Dispose(WaitHandle)` | Block until in-flight tick finishes. Guarantees no late tick after Dispose returns. | ✓ |
| Fire-and-forget Dispose + sentinel flag | Set `_disposed = true` then dispose. Tick checks flag and bails. Late `BeginInvoke` risk needs try/catch. | |
| `Change(Infinite, Infinite)` then Dispose | Tell timer never to fire; doesn't wait for in-flight tick. Same late-`BeginInvoke` risk. | |

**User's choice:** Synchronous wait via `Dispose(WaitHandle)`
**Notes:** Combined with `HasShutdownStarted` guard for the dispatcher (separate question below) for belt-and-braces against any teardown ordering.

---

## Tickable seam shape — contract

| Option | Description | Selected |
|--------|-------------|----------|
| Pure: returns `SampleResult` | `OnSampleTick(...)` returns `(newRatio, ratioChanged, transition)` struct. No events, no Win32, no dispatcher. Caller orchestrates side-effects. | ✓ |
| Side-effecting: seam raises events | `OnSampleTick(...)` mutates state and invokes events synchronously. Tests subscribe to events. | |
| Two-layer: pure compute + thin orchestrator | Static `Decide(...)` pure helper + instance `OnSampleTick` that calls Decide and performs side effects. | |

**User's choice:** Pure: returns SampleResult
**Notes:** Cleanest separation. `GhostTransition` enum: `None | Activate | RestoreNoEvent | RestoreWithEvent` carries the four meaningful state transitions per success criterion #5. Result struct is `readonly record struct` so no heap allocation on the sampler hot path.

## Tickable seam shape — Win32 sampling location

| Option | Description | Selected |
|--------|-------------|----------|
| Stays in controller, called by real timer callback | Private `Sample()` helper. Tests bypass it via `OnSampleTick`. Mirrors Phase 83 deferred-`IKeyStateProvider` decision. | ✓ |
| Extract `ISampler` interface, inject into controller | Constructor injection for full mockability. Phase 83 explicitly rejected the equivalent for `IKeyStateProvider`. | |

**User's choice:** Stays in controller
**Notes:** Same trade-off Phase 83 already weighed — pure seam already provides everything tests need without the interface indirection.

---

## Dispatcher.BeginInvoke boundary — granularity

| Option | Description | Selected |
|--------|-------------|----------|
| One BeginInvoke per tick, bundled | Single `BeginInvoke(() => ApplyResult(result))` performs all UI work for one tick atomically. | ✓ |
| Separate BeginInvoke per side-effect | One BeginInvoke for the WS_EX_TRANSPARENT toggle, one for ProximityChanged, one for Restored. Up to 3 dispatcher messages per tick. | |
| Inline if `CheckAccess()` true, BeginInvoke otherwise | Defensive but unnecessary — timer callback always runs off-thread by definition. | |

**User's choice:** One BeginInvoke per tick, bundled
**Notes:** Per-tick bundling, NOT cross-tick coalescing — the latter is explicitly out-of-scope in REQUIREMENTS.md. Steady-state ratio=0.0 issues zero BeginInvoke calls thanks to the existing edge-only emission rule.

## Dispatcher.BeginInvoke boundary — shutdown race

| Option | Description | Selected |
|--------|-------------|----------|
| Check `Dispatcher.HasShutdownStarted` before BeginInvoke | Belt-and-braces guard before issuing any BeginInvoke. | ✓ |
| Try/catch around BeginInvoke | Swallow `TaskCanceledException` / `InvalidOperationException`. Less surgical. | |
| Rely on `Dispose(WaitHandle)` only — no extra guard | Trust that synchronous disposal closes the window entirely. | |

**User's choice:** Check `Dispatcher.HasShutdownStarted` before BeginInvoke
**Notes:** Capture `_dispatcher` once at `Initialize` (via `Application.Current.Dispatcher` or the window's dispatcher) and reuse it.

---

## State ownership across threads — config fields

| Option | Description | Selected |
|--------|-------------|----------|
| Volatile reads + snapshot-into-locals at tick start | Mark `_isEnabled`, `_useCtrl/_useAlt/_useShift`, `_ghostFadeRadiusPx` volatile. Tick snapshots all to locals, operates on locals. | ✓ |
| Lock around all reads/writes | Single `_stateLock` for both UI writes and tick reads. Bulletproof; lock contention every tick. | |
| Immutable config record + Interlocked.Exchange | Single `GhostConfig` record swapped atomically. Per-update allocation. | |

**User's choice:** Volatile reads + snapshot-into-locals at tick start
**Notes:** Matches the read-mostly access pattern (UI writes rarely; sampler reads 30×/sec). `IsEnabled` auto-property converts to a backing `volatile bool _isEnabled` with manual accessors.

## State ownership across threads — transition state

| Option | Description | Selected |
|--------|-------------|----------|
| Owned by sampling thread, accessed only by tick callback | `_lastProximityRatio` plain double; `_isGhostMode` declared `volatile bool` because `IsActive` exposes it to the UI-thread contrast-skip predicate. | ✓ |
| Move into `SampleResult` / pure seam state, threaded through | `OnSampleTick(prevRatio, prevIsGhost, ...) -> SampleResult`. Caller stores prev values for next call. Adds two parameters. | |
| Lock-protected for safety | Wrap reads/writes in a lock. Unnecessary given the reentrancy guard. | |

**User's choice:** Owned by sampling thread, accessed only by tick callback
**Notes:** Reentrancy guard from D-02 means at most one thread ever inside the tick. Only `_isGhostMode` needs `volatile` because of the cross-thread `IsActive` read at MainWindow.xaml.cs:165 (contrast-skip predicate).

---

## Claude's Discretion

- Exact name of the result struct (`SampleResult` vs `TickResult` vs `SampleOutcome`) and the transition enum (`GhostTransition` vs `TickTransition`) — pick whatever reads cleanest internally.
- Whether `ApplyResult` is a private instance method or an inline closure — equivalent.
- Capturing `_dispatcher` once at `Initialize` time vs reading per-tick — recommended once-at-Initialize but not load-bearing.

## Deferred Ideas

- `ISampler` / `IKeyStateProvider` interface extraction — already considered and rejected in Phase 83 for the same reasons.
- Cross-tick `BeginInvoke` coalescing / rate-limiting — explicit out-of-scope in REQUIREMENTS.md.
- Replacing timer with `WH_MOUSE_LL` low-level mouse hook for sampling — explicit out-of-scope in REQUIREMENTS.md.
- Moving `OnSampleTick` to a fully static helper on a separate type — current owned-by-sampler model is already test-reachable; defer unless a future phase needs the helper outside the controller.
