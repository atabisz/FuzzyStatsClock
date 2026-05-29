# Phase 86: Frame-driven opacity rendering - Context

**Gathered:** 2026-05-20
**Status:** Ready for planning

<domain>
## Phase Boundary

`MainWindow` runs a per-frame lerp pump on `CompositionTarget.Rendering` that glides `this.Opacity` from a current ratio toward a target ratio set by `GhostModeController.ProximityChanged`. The visible fade is decoupled from the 33 ms sampling cadence — frame-rate variation, not sample cadence, dictates smoothness — while preserving every existing `MainWindow` interaction guard (`_isDragging`, settings-window-open, `_menuOpen`, mouse-wheel direct opacity write) and the v4.0 ghost activation/restore semantics (terminal-state snap, `Restored` only at ratio=0.0).

This phase delivers:
- A `_currentRatio` field updated each render frame inside `MainWindow`
- A pure-static `LerpRatio(...)` helper invoked per frame (testable in Phase 87 without WPF/timer setup)
- Subscribe/unsubscribe lifecycle for the render pump driven by an `EnabledChanged` event raised from `GhostModeController.IsEnabled`
- Terminal-state snap when target reaches `1.0` or `0.0` (preserves crisp ghost activation and `Restored` timing)
- All five `MainWindow` ghost guards behaving identically — drag freeze, settings-window freeze, RMB-04 menu pin, mouse-wheel direct write, and the contrast-skip predicate (which already reads `_currentRatio > 0.0` once we rename `_proximityRatio` → `_currentRatio`)

This phase does **not** deliver:
- Sampler-side changes (locked in Phase 85)
- Tests for the lerp helper or the seam (Phase 87)
- A user-facing tunable for fade speed (REQUIREMENTS.md "Future Requirements" — explicit YAGNI)

</domain>

<decisions>
## Implementation Decisions

### Lerp shape & feel (Q1)
- **D-01:** Time-stable exponential lerp: `new = current + (target - current) * (1 - Math.Exp(-alpha * deltaSeconds))`. Frame-rate independent — same visual feel at 60 Hz as at 144 Hz. Uses `RenderingEventArgs.RenderingTime` (a `TimeSpan`) for `deltaSeconds`; first frame after subscribe uses a synthesised `0.016` baseline (one 60 Hz frame) to avoid a giant first-step.
- **D-02:** `alpha = 15.0` constant for "smooth ~150 ms" feel — current ratio reaches ~90% of target in ~150 ms, masking frame-rate variation under CPU load while keeping ghost activation visibly responsive. Constant lives in `MainWindow` (or as a `private const` near the lerp call site) — not in settings (out-of-scope per REQUIREMENTS.md "Future Requirements").
- **D-03:** Terminal-state snap (success criterion #3 / FADE-03): when `target == 1.0` OR `target == 0.0`, `_currentRatio = target` immediately rather than running the exponential. Preserves crisp ghost activation timing and the v4.0 P67 invariant that `Restored` fires when ratio reaches exactly `0.0`. Implementation: lerp helper checks the target first; if terminal, returns target; else returns the exponential-lerp value.

### Subscribe/unsubscribe wiring (Q2)
- **D-04:** Add `event Action<bool>? EnabledChanged` to [GhostModeController](../../FuzzyClock.App/GhostModeController.cs). The `IsEnabled` setter raises it on **actual change** (compare new vs old before raise — no event when settings.json restores the same value at startup). MainWindow subscribes once in `ContentRendered` (next to the existing `ProximityChanged` / `Restored` wiring around [MainWindow.xaml.cs:169-184](../../FuzzyClock.App/MainWindow.xaml.cs#L169-L184)).
- **D-05:** `EnabledChanged` raises on the calling thread. All three current writers (tray toggle [MainWindow.xaml.cs:189](../../FuzzyClock.App/MainWindow.xaml.cs#L189), `ApplySettings` [MainWindow.xaml.cs:316](../../FuzzyClock.App/MainWindow.xaml.cs#L316), settings-window callback [MainWindow.xaml.cs:480](../../FuzzyClock.App/MainWindow.xaml.cs#L480)) already write from the UI thread (tray uses `Dispatcher.Invoke`; the other two are on the UI thread directly). No `BeginInvoke` needed inside the setter — keep it simple, document the UI-thread-write contract in the property's XML doc.
- **D-06:** MainWindow's `EnabledChanged` handler calls `CompositionTarget.Rendering += OnRenderingTick` when enabled, `-= OnRenderingTick` when disabled. Idempotency-safe — the handler tracks a `_renderPumpAttached` bool to guard against double-subscribe (e.g. if `ApplySettings` writes the same value as the cached `_isEnabled`, no event fires anyway by D-04).
- **D-07:** Initial subscribe at startup: `ApplySettings` writes `_ghostMode.IsEnabled = s.GhostModeEnabled` ([MainWindow.xaml.cs:316](../../FuzzyClock.App/MainWindow.xaml.cs#L316)) **before** `_ghostMode.Initialize` runs (current order). The `EnabledChanged` event won't fire on this write because the controller's default `_isEnabled = true` may match — explicit fallback: after subscribing the handler in `ContentRendered`, MainWindow checks `_ghostMode.IsEnabled` once and attaches the render pump synchronously if true. Belt-and-braces against the "default value already matches" no-event case.

### LerpRatio helper home (Q3)
- **D-08:** `internal static double LerpRatio(double current, double target, double alpha, double deltaSeconds)` lives on `GhostModeController` next to `ComputeProximityRatio` ([GhostModeController.cs:386](../../FuzzyClock.App/GhostModeController.cs#L386)). Same precedent set in Phase 85 (`OnSampleTick` and `SampleResult` are also `internal` on the controller). Same `InternalsVisibleTo("FuzzyClock.App.Tests")` plumbing exposes it; no new files, no new project refs. The helper is consumed by `MainWindow` not the controller, but it's pure-static so the home is just a namespace anchor.
- **D-09:** Helper signature (locked): `LerpRatio(double current, double target, double alpha, double deltaSeconds)` returning `double`. Body: terminal-state snap first (`if (target == 1.0 || target == 0.0) return target;`), then exponential lerp. Pure — no fields read, no events raised, no dependencies on `GhostModeController` instance state. Phase 87 unit tests can call it as `GhostModeController.LerpRatio(...)` from `FuzzyClock.App.Tests`.

### Idle-frame behavior (Q4)
- **D-10:** "Stay subscribed while ghost enabled, early-return on convergence." Lifecycle has exactly two transitions: enabled → subscribe; disabled → unsubscribe. The `OnRenderingTick` handler's first action is `if (_currentRatio == _targetRatio) return;` — at steady state (cursor far away, both = 0.0; or cursor inside widget, both = 1.0) the per-frame cost is one method call + one comparison + return. Matches FADE-04 wording exactly ("subscription added when ghost mode is enabled and removed when disabled, so the per-frame loop has zero overhead when the feature is off").
- **D-11:** `_currentRatio == _targetRatio` is an exact-equality compare on `double`. Safe because the only writers are: terminal-state snap (D-03 — exact `0.0` or `1.0`), the lerp formula (D-09 — keeps drifting toward target until snapped), and `ProximityChanged` setting `_targetRatio`. Convergence is reached only via the snap path (D-03), which writes the exact target value. No floating-point drift to worry about. The exponential lerp itself never reaches exact convergence — the snap path is what closes the loop.

### Field renames & invariants (carried forward)
- **D-12:** Rename `_proximityRatio` → `_currentRatio` in [MainWindow.xaml.cs:56](../../FuzzyClock.App/MainWindow.xaml.cs#L56) for clarity (it's now the lerped current value, not the raw target from ProximityChanged). Add a sibling `_targetRatio = 0.0` field set by ProximityChanged. The contrast-skip predicate at [MainWindow.xaml.cs:165](../../FuzzyClock.App/MainWindow.xaml.cs#L165) reads `_currentRatio > 0.0` (governs visible state — FADE-02 success criterion #2).
- **D-13:** `ProximityChanged` lambda body changes: instead of writing `this.Opacity = _windowOpacity * (1.0 - ratio)` directly ([MainWindow.xaml.cs:183](../../FuzzyClock.App/MainWindow.xaml.cs#L183)), it now sets `_targetRatio = ratio`. The render pump owns `this.Opacity` writes during fade. The five guards (`_isDragging`, settings-window-open, `_menuOpen`) move from the ProximityChanged lambda **into the render pump handler** — the render pump writes opacity, so the render pump must respect the same guards. SEM-04 success criterion #5: identical guard behavior.
- **D-14:** `Restored` handler ([MainWindow.xaml.cs:169-175](../../FuzzyClock.App/MainWindow.xaml.cs#L169-L175)) keeps writing `_proximityRatio = 0.0` (renamed to `_currentRatio = 0.0` per D-12) and resetting `BackdropBorder.Background`. Crucially: `_targetRatio` is already `0.0` at this point (sampler emitted RestoreWithEvent only when ratio reached exactly 0.0 — Phase 85 D-06). So `Restored` just snaps the visible state to match the already-converged target — no fight with the render pump.
- **D-15:** Mouse-wheel direct-write path ([MainWindow.xaml.cs:1390-1398](../../FuzzyClock.App/MainWindow.xaml.cs#L1390-L1398)) — `SetOpacity` writes `this.Opacity = _windowOpacity * (1.0 - _proximityRatio)` (renamed to `_currentRatio`). Stays unchanged in shape: the render pump and `SetOpacity` both write `Opacity`, but `SetOpacity` runs only on user input (mouse wheel) and the render pump runs on `CompositionTarget.Rendering` — they don't fight, since `SetOpacity` updates `_windowOpacity` and the next render frame multiplies through it. Mouse-wheel feel preserved.

### Claude's Discretion
- Exact spelling of the render handler (`OnRenderingTick` vs `OnCompositionRender` vs `LerpPump`) — pick what reads cleanest.
- Whether the `_renderPumpAttached` guard is a separate `bool` or inferred by null-checking a captured handler delegate — either works.
- Where the `alpha = 15.0` constant lives — `private const double LerpAlpha = 15.0;` near the field block in MainWindow, or passed in from a static. Keep as `const` so the JIT inlines it.
- Whether to handle `RenderingEventArgs.RenderingTime` going non-monotonic at clock changes (theoretical edge) — clamp `deltaSeconds` to `[0.0, 0.1]` defensively or trust WPF; recommended: clamp, since the cost is one `Math.Clamp` call per frame.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & invariants
- [.planning/ROADMAP.md](../../ROADMAP.md) — Phase 86 goal, success criteria #1–5, requirement mapping (FADE-01..04, SEM-04)
- [.planning/REQUIREMENTS.md](../../REQUIREMENTS.md) — FADE-01..04 (frame-driven lerp + zero-overhead disable), SEM-04 (drag/settings/menu/mouse-wheel guards preserved); out-of-scope: no settings-UI tunable for fade speed, no new persisted fields
- [.planning/STATE.md](../../STATE.md) — current milestone status, Phase 85 completion summary, baseline test count (578 MSTest = 449 Core + 129 App)

### Carrying-forward decisions from Phase 85 (just shipped)
- [.planning/phases/85-off-thread-sampling-refactor/85-CONTEXT.md](../85-off-thread-sampling-refactor/85-CONTEXT.md) — D-07 (one BeginInvoke per tick bundled), D-10/D-11 (volatile config fields), D-06 (`_isGhostMode` is `volatile bool` for cross-thread reads — already covers contrast-skip predicate)
- [.planning/phases/85-off-thread-sampling-refactor/85-VERIFICATION.md](../85-off-thread-sampling-refactor/85-VERIFICATION.md) — Phase 85 verification status; the 5 human-needed UAT items include guard preservation under load that Phase 86's render pump also touches (drag freeze, RMB-04 menu pin)

### Code under refactor (touchpoints for Phase 86)
- [FuzzyClock.App/MainWindow.xaml.cs:56](../../../FuzzyClock.App/MainWindow.xaml.cs#L56) — `_proximityRatio` field (rename to `_currentRatio`; add sibling `_targetRatio`)
- [FuzzyClock.App/MainWindow.xaml.cs:165](../../../FuzzyClock.App/MainWindow.xaml.cs#L165) — contrast-skip predicate (already reads `_proximityRatio > 0.0`; FADE-02 says it must read **current**, which the rename already encodes)
- [FuzzyClock.App/MainWindow.xaml.cs:169-184](../../../FuzzyClock.App/MainWindow.xaml.cs#L169-L184) — `Restored` handler + `Initialize` + `ProximityChanged` lambda (the lambda body changes per D-13; the guards move into the render pump per SEM-04)
- [FuzzyClock.App/MainWindow.xaml.cs:189](../../../FuzzyClock.App/MainWindow.xaml.cs#L189), [:316](../../../FuzzyClock.App/MainWindow.xaml.cs#L316), [:480](../../../FuzzyClock.App/MainWindow.xaml.cs#L480) — three `_ghostMode.IsEnabled = …` write sites (D-04 `EnabledChanged` event consumers)
- [FuzzyClock.App/MainWindow.xaml.cs:1390-1398](../../../FuzzyClock.App/MainWindow.xaml.cs#L1390-L1398) — `SetOpacity` direct write (D-15 — preserved verbatim)
- [FuzzyClock.App/MainWindow.xaml.cs:1536-1542](../../../FuzzyClock.App/MainWindow.xaml.cs#L1536-L1542) — mouse-wheel `Window_PreviewMouseWheel` (D-15 — preserved verbatim)
- [FuzzyClock.App/GhostModeController.cs:84](../../../FuzzyClock.App/GhostModeController.cs#L84) — `IsEnabled` property (D-04 — change-detect + `EnabledChanged` raise)
- [FuzzyClock.App/GhostModeController.cs:386](../../../FuzzyClock.App/GhostModeController.cs#L386) — `ComputeProximityRatio` (precedent; D-08 places `LerpRatio` next to it)

### Tests (baseline + Phase 87 targets)
- [FuzzyClock.App/FuzzyClock.App.csproj](../../../FuzzyClock.App/FuzzyClock.App.csproj) — `InternalsVisibleTo("FuzzyClock.App.Tests")` already configured; `internal static LerpRatio` is immediately test-reachable
- [FuzzyClock.App.Tests/GhostModeControllerProximityTests.cs](../../../FuzzyClock.App.Tests/GhostModeControllerProximityTests.cs) — pattern reference for new `LerpRatioTests` (Phase 87): pure-static `[DataRow]` parametric coverage

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`InternalsVisibleTo` plumbing** at [FuzzyClock.App.csproj](../../../FuzzyClock.App/FuzzyClock.App.csproj) — already exposes internal members to `FuzzyClock.App.Tests`. The new `LerpRatio` helper declared `internal static` is immediately test-reachable. No project-file changes.
- **Existing MainWindow guard pattern** ([MainWindow.xaml.cs:180-183](../../../FuzzyClock.App/MainWindow.xaml.cs#L180-L183)) — early-return chain `_isDragging` → settings-window → `_menuOpen` → write. Render pump handler reuses the same shape verbatim, just gated on `_currentRatio != _targetRatio` first.
- **`SetOpacity` write path** ([MainWindow.xaml.cs:1390-1398](../../../FuzzyClock.App/MainWindow.xaml.cs#L1390-L1398)) — already multiplies `_windowOpacity * (1.0 - _proximityRatio)`. The mental model "current ratio fades opacity through `_windowOpacity`" is already established; the render pump just keeps writing into that same expression every frame instead of only when ProximityChanged fires.
- **Phase 85 pattern: ratio-state field next to method that owns it** — `_lastProximityRatio` is sampler-thread-local in `GhostModeController`. Mirror in `MainWindow`: `_currentRatio` and `_targetRatio` are UI-thread-only, plain `double`, no `volatile`. ProximityChanged arrives on UI thread (Phase 85 D-07 BeginInvoke), so no cross-thread coherence concern.

### Established Patterns
- **Per-frame "early-return then work" handler shape** — already used in `_statsTimer.Tick` ([MainWindow.xaml.cs:140-145](../../../FuzzyClock.App/MainWindow.xaml.cs#L140-L145)) where each helper short-circuits on its own visibility flag. Render pump follows the same shape.
- **One handler-attach per controller event in `ContentRendered`** ([MainWindow.xaml.cs:161-176](../../../FuzzyClock.App/MainWindow.xaml.cs#L161-L176)) — `_contrast.ColorChanged`, `_contrast.Cleared`, `_ghostMode.Restored`, `_ghostMode.ProximityChanged` are all attached there. The new `_ghostMode.EnabledChanged` slot in next to them.
- **Closed handler tear-down** ([MainWindow.xaml.cs:219-224](../../../FuzzyClock.App/MainWindow.xaml.cs#L219-L224)) — `this.Closed` disposes `_ghostMode` and `_contrast`. The render pump must also detach in `Closed` (or rely on window destruction); cleanest: detach in `_ghostMode.Dispose()`'s callback path (`EnabledChanged` won't fire after Dispose, so add an explicit `CompositionTarget.Rendering -= OnRenderingTick` in `this.Closed`).

### Integration Points
- **`ProximityChanged` UI-thread arrival** (Phase 85 D-07) — already on UI thread; the lambda just sets `_targetRatio`. No marshalling needed inside MainWindow's lambda.
- **`Restored` UI-thread arrival** — same; the existing handler body unchanged. After D-14, `Restored` is essentially a confirmation event — `_targetRatio` is already 0.0 by the time it fires (sampler emitted RestoreWithEvent only at exact 0.0).
- **`_isGhostMode` (cross-thread `volatile`)** — read at the contrast-skip predicate ([MainWindow.xaml.cs:165](../../../FuzzyClock.App/MainWindow.xaml.cs#L165)) by the contrast 500 ms timer; not touched by Phase 86's per-frame loop. Phase 85 already declared it `volatile`.
- **No public API changes** to `GhostModeController` other than: (1) the new `EnabledChanged` event, (2) the `IsEnabled` setter gains change-detect logic, (3) the new `internal static LerpRatio` helper. No constructor change, no breaking renames.

</code_context>

<specifics>
## Specific Ideas

- **Time-stable lerp formula**: `current + (target - current) * (1 - Math.Exp(-alpha * deltaSeconds))`. Frame-rate independent. Standard easing pattern; `alpha` is the "rate constant" — `1/alpha` is the time-to-1/e (~63%) and `2.3/alpha` is the time-to-90%. At `alpha = 15`, time-to-90% ≈ 153 ms.
- **`RenderingEventArgs.RenderingTime`** for `deltaSeconds` — `TimeSpan` since session start; subtract previous tick's value, convert to seconds via `.TotalSeconds`. Cache previous in a field; first frame uses synthesised `0.016` (one 60 Hz frame).
- **Clamp `deltaSeconds`** to `[0.0, 0.1]` defensively — protects against clock changes / VM time-warp / app suspend-resume. Cheap (`Math.Clamp`).
- **`event Action<bool>? EnabledChanged`** signature mirrors the existing `Action<double>? ProximityChanged` field-as-event pattern at [GhostModeController.cs:102](../../../FuzzyClock.App/GhostModeController.cs#L102). Could also use proper `event Action<bool>? EnabledChanged;` declaration for `+=` symmetry — choice is style; both are wired the same way.
- **Change-detect in setter** (D-04): `set { if (_isEnabled == value) return; _isEnabled = value; EnabledChanged?.Invoke(value); }`. One-liner, no allocations on no-change path.

</specifics>

<deferred>
## Deferred Ideas

- **User-facing fade-speed tunable** — explicitly out of scope per REQUIREMENTS.md ("Future Requirements: Per-frame lerp speed exposed as a settings-backed tunable — deferred — YAGNI for v4.4; revisit only if users report fade duration preferences"). The `alpha = 15.0` constant lives in code only.
- **Frame-rate-sensitive lerp shape** — sticking with time-stable exponential. A linear "step toward target by `step * deltaSeconds`" would also work and is sometimes preferred for predictable arrival time, but exponential gives a softer feel and is what every animation framework uses (CSS `transition`, WPF `DoubleAnimation` with `EasingFunction`, etc.).
- **Coalescing `ProximityChanged` events to drop intermediate target updates between frames** — premature; the UI thread is no longer doing sampling work (Phase 85), and `_targetRatio = ratio` is a single field write. Revisit only if Phase 87 perf testing shows dispatcher saturation.
- **Snapping the lerp when `Math.Abs(current - target) < epsilon`** — covered by terminal-state snap (D-03) for the only convergence cases that matter (`0.0` and `1.0`). Mid-range convergence (e.g. cursor stops at 60% proximity) doesn't need snapping because the next ProximityChanged will move the target again.
- **Replacing the `CompositionTarget.Rendering` pump with a `DispatcherTimer` at frame rate** — would defeat the whole point of Phase 86; `CompositionTarget.Rendering` fires once per render frame on the dispatcher thread, perfectly synced to the display.

</deferred>

---

*Phase: 86-Frame-driven opacity rendering*
*Context gathered: 2026-05-20*
