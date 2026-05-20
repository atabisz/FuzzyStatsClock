# Phase 85: Off-thread sampling refactor - Context

**Gathered:** 2026-05-20
**Status:** Ready for planning

<domain>
## Phase Boundary

`GhostModeController` samples cursor position, computes proximity ratio, and emits target-ratio updates **without occupying the UI thread**, while preserving every existing ghost interaction semantic byte-for-byte:

- v4.0 PROX-03 / D-06 / D-07 ghost activation/restore invariants
- v4.0 P67 always-running timer lifecycle (timer never starts/stops on toggle; `IsEnabled` gates inside the tick)
- v4.0 P67 `Restored` fires only when ratio fully reaches `0.0` after ghost activation
- v4.3 P83 `IsModifierHeld` AND-logic with all-false short-circuit
- v4.3 P83 left-side-only VK codes (no AltGr false-positives on EU keyboards)
- PROX-09 disable-gate: ghost-mode toggle off → zero sampling work, zero events, zero opacity manipulation

This phase delivers the threading refactor and the pure tickable seam. It does **not** deliver the per-frame lerp (Phase 86) or any tests beyond what the seam needs to be reachable (Phase 87).

</domain>

<decisions>
## Implementation Decisions

### Timer ownership & disposal
- **D-01:** Replace the `DispatcherTimer` in [GhostModeController.cs:53](../../FuzzyClock.App/GhostModeController.cs#L53) and [GhostModeController.cs:112](../../FuzzyClock.App/GhostModeController.cs#L112) with `System.Threading.Timer`. Period: 33 ms (matches existing cadence; satisfies SAMP-04). Always-running from `Initialize()` until `Dispose()` — lifecycle invariant from v4.0 P67 unchanged.
- **D-02:** Periodic timer + skip-if-busy reentrancy guard. Tick callback opens with `if (Interlocked.CompareExchange(ref _tickInFlight, 1, 0) != 0) return;` and clears `_tickInFlight = 0` in a `finally`. Self-throttling under load — when a tick takes >33 ms, the next tick(s) skip rather than queue. No two threads ever inside the tick logic simultaneously.
- **D-03:** Synchronous disposal via `_timer.Dispose(WaitHandle)`. `Dispose()` blocks until any in-flight tick completes, so no tick fires after `Dispose()` returns. Eliminates the late-`BeginInvoke`-into-torn-down-window class of bug. Combine with D-09 (`HasShutdownStarted` guard) for belt-and-braces.

### Tickable seam shape
- **D-04:** Pure `internal SampleResult OnSampleTick(int cursorX, int cursorY, int rectLeft, int rectTop, int rectRight, int rectBottom, bool modifiersHeld)`. Returns a struct: `(double newRatio, bool ratioChanged, GhostTransition transition)` where `GhostTransition ∈ { None, Activate, RestoreNoEvent, RestoreWithEvent }`. Tests inject inputs and assert the struct. No Win32, no dispatcher, no events on the seam itself. Satisfies success criterion #5.
- **D-05:** Win32 sampling stays in the controller as a private `Sample()` helper called by the timer callback. Tests bypass `Sample()` entirely and exercise `OnSampleTick` directly. Matches the Phase 83 deferred decision on `IKeyStateProvider` — same trade-off (constructor change, extra interface) for the same problem (mockability), and the pure seam already provides everything tests need without the indirection.
- **D-06:** Edge-detection state (`_lastProximityRatio`, `_isGhostMode`) is owned by the sampling thread — written and read only inside the timer callback. The reentrancy guard from D-02 means at most one thread touches them at a time, so they need no synchronization for sampler-internal use. The one cross-thread read is `IsActive` (exposing `_isGhostMode`) consumed by the contrast-skip predicate at [MainWindow.xaml.cs:165](../../FuzzyClock.App/MainWindow.xaml.cs#L165) — therefore `_isGhostMode` becomes `volatile bool` (atomic single-byte read on .NET). `_lastProximityRatio` stays a plain `double` (sampler-local).

### Dispatcher.BeginInvoke boundary
- **D-07:** One `Dispatcher.BeginInvoke` per tick, bundled. The timer callback computes `SampleResult` from `OnSampleTick`, then if any UI work is required (transition ≠ None or ratio changed) issues a single `BeginInvoke(() => ApplyResult(result))`. `ApplyResult` runs on the UI thread and performs all of: `WS_EX_TRANSPARENT` flip (Activate or RestoreNoEvent / RestoreWithEvent), `ProximityChanged?.Invoke(ratio)`, `Restored?.Invoke()`. All UI side-effects for one tick happen in one dispatcher message — atomic per-tick. Satisfies SAMP-03. Does **not** violate the REQUIREMENTS.md out-of-scope rule on coalescing `BeginInvoke` calls — that rule excludes cross-tick batching; this is per-tick bundling.
- **D-08:** When `OnSampleTick` returns `transition = None && !ratioChanged`, no `BeginInvoke` is issued at all (matches the existing "only emit on change" behavior at [GhostModeController.cs:155](../../FuzzyClock.App/GhostModeController.cs#L155)). Steady-state ratio=0.0 produces zero dispatcher pressure.
- **D-09:** Before `BeginInvoke`, the timer callback checks `if (_dispatcher.HasShutdownStarted || _dispatcher.HasShutdownFinished) return;`. Belt-and-braces against `Application.Current.Shutdown()` racing the tick — the synchronous disposal from D-03 already closes most of the window, but this defends against teardown orderings where the dispatcher shuts down before `_ghostMode.Dispose()` runs.

### State ownership across threads
- **D-10:** Config fields `_isEnabled` (currently the auto-property `IsEnabled`), `_useCtrl`, `_useAlt`, `_useShift`, `_ghostFadeRadiusPx` become `volatile` so the sampling thread sees writes from the UI thread without torn reads. UI-thread writers — `IsEnabled` setter, `UpdateModifierConfig`, `GhostFadeRadiusPx` setter — perform a single atomic store; sampler reads each field once at the top of the tick into a local snapshot and operates on locals for the rest of the tick. No lock, no `Interlocked` (writes are already atomic for `bool`/`int`-aligned types). The read pattern matches the access shape: UI writes rarely (settings change), sampler reads 30×/sec.
- **D-11:** Convert `IsEnabled` from `{ get; set; }` auto-property to a backing `volatile bool _isEnabled` with manual getter/setter. Same for `GhostFadeRadiusPx` (already has a backing field at [GhostModeController.cs:55](../../FuzzyClock.App/GhostModeController.cs#L55) — just add `volatile`). `_useCtrl/_useAlt/_useShift` already exist as backing fields, just add `volatile`.

### Claude's Discretion
- Exact name of the result struct (`SampleResult` vs `TickResult` vs `SampleOutcome`) and the transition enum (`GhostTransition` vs `TickTransition`) — pick whatever reads cleanest. Just keep the names internal.
- Whether `ApplyResult` is a private instance method or a closure inside the BeginInvoke lambda — either works.
- How to spell the dispatcher field (`_dispatcher` captured at `Initialize` vs reading `Application.Current.Dispatcher` each tick) — capture once at `Initialize` recommended for thread-safety and clarity, but not load-bearing.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & invariants
- [.planning/ROADMAP.md](../../.planning/ROADMAP.md) — Phase 85 goal, success criteria, requirement mapping
- [.planning/REQUIREMENTS.md](../../.planning/REQUIREMENTS.md) — SAMP-01..04, SEM-01, SEM-02, SEM-03, SEM-05; out-of-scope (no `BeginInvoke` cross-tick coalescing, no settings-UI changes)
- [.planning/STATE.md](../../.planning/STATE.md) — recent decisions affecting v4.4 (always-running timer; `Restored` fires only at ratio=0.0; `IsModifierHeld` AND-logic; five MainWindow ghost touchpoints)

### Carrying-forward decisions from prior phases
- [.planning/milestones/v4.3-phases/83-runtime-detection/83-CONTEXT.md](../../.planning/milestones/v4.3-phases/83-runtime-detection/83-CONTEXT.md) — `IsModifierHeld` AND-logic, all-false short-circuit, left-side VK codes, `[DataRow]` parametric test pattern, deferred `IKeyStateProvider` rationale (D-05 here mirrors that decision)

### Code under refactor
- [FuzzyClock.App/GhostModeController.cs](../../FuzzyClock.App/GhostModeController.cs) — full file: P/Invoke decls, `OnTimerTick`, `IsModifierHeld`, `ComputeProximityRatio`, `Activate`, `Dispose`. The refactor target.
- [FuzzyClock.App/MainWindow.xaml.cs:160-184](../../FuzzyClock.App/MainWindow.xaml.cs#L160-L184) — ghost integration: `Restored` handler, `Initialize`, `ProximityChanged` handler with `_isDragging` / settings-window / `_menuOpen` guards. **Phase 86 territory — Phase 85 must not change handler bodies, only the thread their callbacks fire on.**
- [FuzzyClock.App/MainWindow.xaml.cs:165](../../FuzzyClock.App/MainWindow.xaml.cs#L165) — contrast-skip predicate reads `_ghostMode.IsActive`; this is the cross-thread reader that drives the `volatile bool _isGhostMode` decision (D-06).

### Tests (unchanged baseline + new seam tests in Phase 87)
- [FuzzyClock.App.Tests/GhostModeControllerProximityTests.cs](../../FuzzyClock.App.Tests/GhostModeControllerProximityTests.cs) — existing 12 `ComputeProximityRatio` cases; must keep passing without modification (TEST-01).
- [FuzzyClock.App.Tests/GhostModeControllerTests.cs](../../FuzzyClock.App.Tests/GhostModeControllerTests.cs) — existing `IsModifierHeld` `[DataRow]` coverage; must keep passing.
- [FuzzyClock.App/FuzzyClock.App.csproj](../../FuzzyClock.App/FuzzyClock.App.csproj) — `InternalsVisibleTo("FuzzyClock.App.Tests")` already in place; the new `internal OnSampleTick` and `internal SampleResult` are reachable from tests with no project changes.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`InternalsVisibleTo` plumbing** at [FuzzyClock.App.csproj:8-10](../../FuzzyClock.App/FuzzyClock.App.csproj#L8-L10) — already exposes internal members to `FuzzyClock.App.Tests`. The new `OnSampleTick` and `SampleResult` types declared `internal` are immediately test-reachable.
- **`ComputeProximityRatio`** at [GhostModeController.cs:235-259](../../FuzzyClock.App/GhostModeController.cs#L235-L259) — pure static, no changes. `OnSampleTick` calls it directly with the same argument shape.
- **`IsModifierHeld`** at [GhostModeController.cs:210-228](../../FuzzyClock.App/GhostModeController.cs#L210-L228) — keeps its current shape and visibility. Called by the private `Sample()` helper to produce the `modifiersHeld` boolean fed into `OnSampleTick`. Pure-logic tests for it from Phase 83 keep passing unmodified.
- **`[DataRow]` parametric test pattern** carried from Phase 83 — the new `OnSampleTick` tests in Phase 87 should follow the same shape.

### Established Patterns
- **Always-running timer lifecycle** (v4.0 P67 / D-01): timer is created and started in `Initialize` and stops only in `Dispose`. The new `System.Threading.Timer` follows the exact same lifecycle — period set at construction, no `Change(...)` calls during normal operation.
- **`IsEnabled` gates inside the tick** (PROX-09): no early `_timer.Stop()` on toggle off — the tick checks `_isEnabled` and bails. The off-thread refactor preserves this verbatim; the only difference is the bail returns control to the thread pool instead of the UI dispatcher.
- **Edge-only event emission** ([GhostModeController.cs:155](../../FuzzyClock.App/GhostModeController.cs#L155)): `ProximityChanged` fires only when ratio differs from `_lastProximityRatio`. The pure seam preserves this — `ratioChanged` in `SampleResult` is the edge signal.
- **One `BeginInvoke` per tick, bundled** (D-07) mirrors the existing "all UI work happens together at the bottom of `OnTimerTick`" pattern — just lifted to run on the dispatcher instead of inline.

### Integration Points
- **`MainWindow.xaml.cs:177` (`ProximityChanged` handler)** — the lambda body stays identical. The refactor only changes the thread it's invoked on (now arrives via `BeginInvoke`). All five `MainWindow` guards (`_isDragging`, `_settingsWindow.IsVisible`, `_menuOpen`, mouse-wheel direct-write, contrast-skip predicate) continue to function because the handler still runs on the UI thread.
- **`MainWindow.xaml.cs:169` (`Restored` handler)** — same: body unchanged, fires via `BeginInvoke` instead of inline. Critical SEM invariant: `Restored` only when ratio reaches `0.0` after a prior ghost activation. Encoded in `OnSampleTick` as `transition = RestoreWithEvent` vs `RestoreNoEvent`.
- **`MainWindow.xaml.cs:165` (contrast-skip predicate)** — reads `_ghostMode.IsActive` from the contrast-controller's 500 ms timer callback (also UI thread, but a separate reader from the sampler). With `_isGhostMode` declared `volatile`, this read is safe and lock-free.
- **No public API changes** for callers of the controller (`MainWindow`'s wiring at lines 169, 176, 177 stays as-is) — only `Initialize`, `IsEnabled`, `IsActive`, `UpdateModifierConfig`, `GhostFadeRadiusPx`, `Activate`, `Dispose`, `ProximityChanged`, `Restored` remain in the public surface, plus the new `internal OnSampleTick` and `internal SampleResult` for tests.

</code_context>

<specifics>
## Specific Ideas

- Reentrancy guard idiom: `Interlocked.CompareExchange(ref _tickInFlight, 1, 0)` returning non-zero ⇒ skip; `try { ... } finally { _tickInFlight = 0; }` to release. Standard pattern, no allocation, no exceptions on the hot path.
- Result struct: a `readonly record struct` (or readonly struct with explicit fields) so the seam returns by value with no allocation on the sampler hot path.
- Capture `_dispatcher` once at `Initialize` time from the HWND's owner window's dispatcher (or `Application.Current.Dispatcher`) to avoid re-resolving each tick and to make the controller self-contained for shutdown checks.

</specifics>

<deferred>
## Deferred Ideas

- `ISampler` / `IKeyStateProvider` interface extraction — Phase 83 already weighed and rejected this for the same reasons (constructor change, extra surface, mockability already provided by the pure seam). Reconsider only if a future phase needs to substitute a fake sampler in production (e.g. recording / replay tooling).
- Cross-tick `BeginInvoke` coalescing or rate-limiting — explicit out-of-scope in REQUIREMENTS.md ("premature optimization; revisit only if measurement shows dispatcher saturation"). Phase 87 perf check will tell us if this ever needs revisiting.
- Replacing the timer entirely with a `WH_MOUSE_LL` low-level mouse hook for sampling — explicit out-of-scope in REQUIREMENTS.md (bigger commit; not needed if `System.Threading.Timer` solves the responsiveness problem).
- Moving `OnSampleTick` to a `static` pure helper on a separate type so the controller has *no* sampler-thread state — interesting but the current "owned-by-sampler-thread" model is already test-reachable via `OnSampleTick` and adding indirection buys nothing. Defer unless a future phase needs the helper outside the controller.

</deferred>

---

*Phase: 85-Off-thread sampling refactor*
*Context gathered: 2026-05-20*
