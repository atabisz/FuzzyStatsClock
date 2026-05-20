---
phase: 86-frame-driven-opacity-rendering
reviewed: 2026-05-20T00:00:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - FuzzyClock.App/GhostModeController.cs
  - FuzzyClock.App/MainWindow.xaml.cs
findings:
  critical: 0
  warning: 4
  info: 4
  total: 8
status: issues_found
---

# Phase 86: Code Review Report

**Reviewed:** 2026-05-20
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

## Summary

I reviewed the Phase 86 deltas to `GhostModeController.cs` (new `EnabledChanged` event, change-detect setter, and pure `LerpRatio` helper) and `MainWindow.xaml.cs` (`_currentRatio`/`_targetRatio` field split, `OnGhostEnabledChanged` attach/detach, and the `OnRenderingTick` per-frame lerp pump). Plan-prescribed invariants (D-01, D-03, D-06, D-07, D-10, D-11, D-13, D-14, D-15, SEM-04) are implemented faithfully and the threading story holds — `_currentRatio` / `_targetRatio` are touched only on the UI dispatcher thread, the exact-equality `==` comparisons on `double` are safe per D-11 because the only producers are exact-`0.0`/`1.0` paths in the sampler, and the dispose ordering in `Closed` correctly detaches the render pump before `_ghostMode.Dispose()` so the Phase 85 `WaitHandle` drain cannot race with a queued render frame.

I found no BLOCKER bugs introduced by Phase 86. There are four WARNINGs worth fixing — the most behaviorally noticeable is a stale-baseline issue in `OnRenderingTick` that lets the first post-convergence frame take a much larger lerp step than intended (mitigated but not eliminated by the `Math.Clamp(deltaSeconds, 0.0, 0.1)` defensive bound). The remaining three are stale comments, missing event-unsubscribe symmetry, and an interaction-state-stranding edge case when ghost mode is toggled OFF mid-fade.

The four INFO items flag two minor design choices, one redundancy, and one consideration for the `Restored` handler ordering invariant.

## Warnings

### WR-01: `_previousRenderTime` becomes stale across the convergence early-return path

**File:** `FuzzyClock.App/MainWindow.xaml.cs:288-300`
**Issue:** The convergence check at line 292 (`if (_currentRatio == _targetRatio) return;`) returns *before* `_previousRenderTime = args.RenderingTime;` runs at line 300. While `_currentRatio == _targetRatio` (e.g. cursor sits in/out of widget for many seconds and target stays at terminal `1.0` or `0.0`), `_previousRenderTime` keeps the last pre-convergence frame's timestamp. As soon as the user moves the cursor and `_targetRatio` shifts to a non-terminal value, the next `OnRenderingTick` invocation computes `args.RenderingTime - _previousRenderTime.Value` as a multi-second delta. The defensive `Math.Clamp(deltaSeconds, 0.0, 0.1)` at line 299 caps it at 100 ms, which yields `(1 - exp(-15 * 0.1)) ≈ 0.777` — a 77.7% jump on the first post-convergence frame, instead of the ~21% step the time-stable lerp would otherwise deliver from a real ~16 ms frame interval. Behavior is bounded but visibly chunkier than the design intends, especially when the user has been hovered/un-hovered for any meaningful duration.

**Fix:** Update `_previousRenderTime` even on the early-return path so the next non-converged frame measures a real one-frame delta. The cleanest way is to read and store before the convergence check:

```csharp
private void OnRenderingTick(object? sender, EventArgs e)
{
    var args = (System.Windows.Media.RenderingEventArgs)e;

    // Always advance the baseline so post-convergence ticks measure a real one-frame delta.
    double deltaSeconds = _previousRenderTime.HasValue
        ? (args.RenderingTime - _previousRenderTime.Value).TotalSeconds
        : 0.016;
    deltaSeconds = Math.Clamp(deltaSeconds, 0.0, 0.1);
    _previousRenderTime = args.RenderingTime;

    // (1) Convergence early-return — D-10 / D-11.
    if (_currentRatio == _targetRatio) return;

    // (3) Lerp step ...
    _currentRatio = GhostModeController.LerpRatio(_currentRatio, _targetRatio, LerpAlpha, deltaSeconds);
    // (4) Guard chain ...
    // (5) Opacity write ...
}
```

This costs one extra struct read/write per converged frame but eliminates the chunky-first-step. If the steady-state cost concerns you, an alternative is to null-out `_previousRenderTime` whenever the early-return fires, so the next non-converged frame re-uses the synthesised `0.016` baseline (still better than a clamped multi-second delta).

### WR-02: Stale comment at the tray-menu wiring still references the (removed) ProximityChanged guard

**File:** `FuzzyClock.App/MainWindow.xaml.cs:225-230`
**Issue:** The RMB-04 comment block reads "RMB-04: pin _currentRatio (via the ProximityChanged lambda's _menuOpen guard) while the tray ContextMenuStrip is open via a widget right-click." Phase 86 D-13 moved the `_menuOpen` guard from the `ProximityChanged` lambda into `OnRenderingTick` (line 314); the lambda body at line 195 is now `_targetRatio = ratio;` only. The comment now describes a code path that no longer exists and will mislead the next reader trying to trace the RMB-04 invariant.
**Fix:** Reword to point at the new home of the guard:

```csharp
// RMB-04: pin _currentRatio (via the OnRenderingTick render pump's _menuOpen guard) while
// the tray ContextMenuStrip is open via a widget right-click. The Opening handler at
// TrayMenuBuilder.cs:90 (SyncCheckmarks) registered first; WinForms fires handlers in
// registration order so checkmark sync still runs before _menuOpen = true.
```

### WR-03: `EnabledChanged` (and `Restored`) subscriptions are never explicitly removed in `this.Closed`

**File:** `FuzzyClock.App/MainWindow.xaml.cs:183-199, 238-249`
**Issue:** The `Closed` lambda explicitly detaches `CompositionTarget.Rendering -= OnRenderingTick;` (line 245) but does not pair the `_ghostMode.EnabledChanged += OnGhostEnabledChanged;` subscription (line 199) or the `_ghostMode.Restored += () => …` subscription (line 183) with `-=`. `_ghostMode.Dispose()` (line 247) does not clear those event handlers — neither `Dispose()` nor any other code path nulls the `EnabledChanged` / `Restored` delegates inside `GhostModeController`. The subscription holds a strong reference from the controller back to the `MainWindow` instance until both die at process exit. In a single-instance app this is benign in practice (no real leak — the controller is owned by `MainWindow`, so when `MainWindow` becomes unreachable everything roots together and is collected), but it breaks the symmetry of the explicit `CompositionTarget.Rendering -=` already present in the same lambda and is the kind of thing that bites hard if the window is ever made multi-instance or if `EnabledChanged` is invoked from a non-window subscriber after `Closed`.
**Fix:** Either pair the subscriptions explicitly:

```csharp
this.Closed += (_, _) =>
{
    _trayIcon?.Dispose();
    System.Windows.Media.CompositionTarget.Rendering -= OnRenderingTick;
    _renderPumpAttached = false;
    _ghostMode.EnabledChanged -= OnGhostEnabledChanged;   // pair with line 199
    _ghostMode.Dispose();
    _contrast.Dispose();
};
```

Or have `GhostModeController.Dispose()` null both delegate fields (`Restored = null; EnabledChanged = null; ProximityChanged = null;`) so disposal is the single point of subscription cleanup.

### WR-04: Disabling ghost mode mid-fade strands `this.Opacity` at a faded value with no recovery path

**File:** `FuzzyClock.App/MainWindow.xaml.cs:260-275`
**Issue:** `OnGhostEnabledChanged(false)` detaches the render pump but does not reset `_currentRatio` to `0.0` or write `this.Opacity = _windowOpacity`. If the user toggles ghost OFF (tray, settings window, `ResetToDefaults`) while `_currentRatio` is mid-range (e.g. `0.5` because the cursor is in the proximity halo at the moment of toggle), the widget is left at `_windowOpacity * 0.5` — half-transparent — with no driver to restore it. Once ghost is disabled the sampler short-circuits at `GhostModeController.cs:227`, so no `ProximityChanged`/`Restored` events ever fire to clear the residual fade. The pre-Phase-86 code had the same shape (sampler stopped emitting; last-written `Opacity` was sticky), so this is not strictly a Phase-86 regression, but the new design adds `_currentRatio` as long-lived state that carries the stale fade through the next ghost re-enable cycle.

Confirmed paths that hit this:
- Tray callback at line 208: `_ghostMode.IsEnabled = !_ghostMode.IsEnabled` (no opacity reset).
- Settings-window callback at line 574: `_ghostMode.IsEnabled = v` (no opacity reset).
- `ResetToDefaults` re-enables ghost (line 1348) but never resets `_currentRatio`/`Opacity` if it had been previously disabled with a non-zero residual.

**Fix:** Reset visible state on the disable edge:

```csharp
private void OnGhostEnabledChanged(bool enabled)
{
    if (enabled)
    {
        if (_renderPumpAttached) return;
        _previousRenderTime = null;
        System.Windows.Media.CompositionTarget.Rendering += OnRenderingTick;
        _renderPumpAttached = true;
    }
    else
    {
        if (!_renderPumpAttached) return;
        System.Windows.Media.CompositionTarget.Rendering -= OnRenderingTick;
        _renderPumpAttached = false;

        // FADE-04 cleanup: clear residual fade so the widget is fully visible while ghost is off.
        _currentRatio = 0.0;
        _targetRatio  = 0.0;
        if (_settingsWindow?.IsVisible != true)
            this.Opacity = _windowOpacity;
    }
}
```

If a deliberate hand-off back to "the next ProximityChanged write will fix it" is intended, document that explicitly in the handler's XML doc — the current docs make no commitment either way.

## Info

### IN-01: `_previousRenderTime` reset is mirrored in two places with no shared helper

**File:** `FuzzyClock.App/MainWindow.xaml.cs:265, 296-300`
**Issue:** The first-frame baseline reset (`_previousRenderTime = null`) lives in `OnGhostEnabledChanged`, while the deltaSeconds computation that consumes it lives in `OnRenderingTick`. Cohesion is fine for a two-call pump like this, but if the lerp ever needs to be re-attached from a third site (e.g. `Restored` deciding to nudge the pump), the two responsibilities will drift apart.
**Fix:** Optional. If you ever add another attach site, factor the attach pattern into a helper:

```csharp
private void AttachRenderPump()
{
    if (_renderPumpAttached) return;
    _previousRenderTime = null;
    System.Windows.Media.CompositionTarget.Rendering += OnRenderingTick;
    _renderPumpAttached = true;
}
```

### IN-02: `OnRenderingTick` Step (4) guard chain duplicates the predicate at `SetOpacity`

**File:** `FuzzyClock.App/MainWindow.xaml.cs:312-318` and `FuzzyClock.App/MainWindow.xaml.cs:1484-1494`
**Issue:** The render pump's guard chain (`_isDragging` / `_settingsWindow?.IsVisible == true` / `_menuOpen`) before the Opacity write at line 318 partially overlaps with `SetOpacity`'s settings-window check at line 1489. The two methods share no helper; if the guard chain is ever extended (new pin reason), there's no compiler-level prompt to update both call sites. `SEM-04` explicitly commits to byte-for-byte parity with the pre-Phase-86 lambda, so this is intentional today, but it is a future-maintenance footgun.
**Fix:** Optional. Consider a private predicate `private bool ShouldFreezeOpacity() => _isDragging || _settingsWindow?.IsVisible == true || _menuOpen;` if a future change wants both writers to respect the same set of guards.

### IN-03: `OnRenderingTick` writes `_previousRenderTime` after the early-return; field-block default is implicit

**File:** `FuzzyClock.App/MainWindow.xaml.cs:67-70`
**Issue:** `private bool _renderPumpAttached;` and `private TimeSpan? _previousRenderTime;` rely on implicit default-init (`false` / `null`). The plan and surrounding fields use explicit defaults (`_currentRatio = 0.0;`, `_targetRatio = 0.0;`). Mixing styles is a minor style nit but reads less clearly.
**Fix:** Optional. For consistency with the adjacent fields:

```csharp
private bool _renderPumpAttached = false;
private TimeSpan? _previousRenderTime = null;
```

### IN-04: `LerpRatio`'s exact-equality guard is correct but reliant on a remote invariant

**File:** `FuzzyClock.App/GhostModeController.cs:475-487`
**Issue:** The `target == 1.0 || target == 0.0` check at line 480 is documented as safe (D-11) because the only producer of `_targetRatio` is the sampler's `OnSampleTick`, which feeds values from `ComputeProximityRatio` — a function that emits exact `1.0` / `0.0` on the inside-rect / radius-zero / `Math.Clamp` paths. The current docstring captures this, which is good. The risk is forward-compatibility: if a future phase ever lets a non-sampler caller set `_targetRatio` (e.g. a settings UI test hook, an animation scrubber) it could feed `0.999999…` and `LerpRatio` would silently fall through to the exponential path and never converge. There's no compile-time enforcement of "only the sampler writes target."
**Fix:** Optional and not for this phase. If you're worried about future drift, either:
- Tighten the snap to a small epsilon: `if (Math.Abs(target - 1.0) < 1e-9 || Math.Abs(target) < 1e-9) return target;`
- Or expose `_targetRatio` only via a setter that clamps/snaps to terminal values.

For now the current shape is fine — the SEM-01/SEM-02 invariant holds and the docstring loudly calls out the contract.

---

_Reviewed: 2026-05-20_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
