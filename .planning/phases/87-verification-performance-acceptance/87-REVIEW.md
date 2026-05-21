---
phase: 87-verification-performance-acceptance
reviewed: 2026-05-21T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - FuzzyClock.App/GhostModeController.cs
  - FuzzyClock.App/MainWindow.xaml.cs
  - FuzzyClock.App.Tests/LerpRatioTests.cs
  - FuzzyClock.App.Tests/OnSampleTickTests.cs
  - FuzzyClock.App.Tests/MSTestSettings.cs
findings:
  critical: 1
  warning: 4
  info: 3
  total: 8
status: issues_found
---

# Phase 87: Code Review Report

**Reviewed:** 2026-05-21
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Phase 87 delivers two distinct artifacts that I reviewed against `diff_base 661035b`:

1. The unit-test seam scaffolding for the v4.4 ghost-fade pipeline — the `internal volatile` visibility relaxation on `_isGhostMode`, the new `LerpRatioTests` and `OnSampleTickTests` files, and the `[assembly: DiscoverInternals]` opt-in.
2. The WR-04 patch in `MainWindow.OnGhostEnabledChanged(false)` — five lines that zero `_currentRatio`/`_targetRatio` and conditionally restore `Opacity = _windowOpacity`.

The test scaffolding is well-formed. `D-06 single-owner write rule` is **not** violated: the production-side writers of `_isGhostMode` are still `OnSampleTick` (writes `false`) and `Activate()` (writes `true`); the only new writer is the test method's arrange step on a fresh per-row controller. `[assembly: DiscoverInternals]` does not pick up any unintended `[TestClass]` because no `internal` class in `FuzzyClock.App` carries that attribute. The `internal volatile bool _isGhostMode` change preserves cross-thread coherence — the volatile modifier is retained.

Where the review draws blood is the WR-04 fix itself, which is **functionally incomplete in its only failure mode**: when the user disables ghost mode while `_isGhostMode == true` (i.e. while `WS_EX_TRANSPARENT` is currently applied to the HWND), the patch restores Opacity to the visible value but leaves the window click-through at the Win32 layer. Pre-WR-04 the widget was invisible-and-click-through (a state the user could at least diagnose as "ghost is hiding"); post-WR-04 it is visible-and-click-through, which is more confusing and does not self-recover until ghost is re-enabled and the cursor leaves the proximity radius. The end-to-end UAT for WR-04 was explicitly deferred per the phase prompt, which is consistent with this finding — but it should not ship as v4.4 without the WS_EX_TRANSPARENT restore wired in.

The remaining warnings are about a narrow sampler-thread race that the WR-04 reset can lose to (queued `BeginInvoke` after disable can re-corrupt `_targetRatio`), the LerpRatio test's unusual parameter ordering, and a couple of test-shape brittleness issues. The Info items capture style and documentation drift.

## Critical Issues

### CR-01: WR-04 patch leaves WS_EX_TRANSPARENT applied when ghost is disabled mid-active-ghost

**File:** `FuzzyClock.App/MainWindow.xaml.cs:269-280`
**Issue:** The new `OnGhostEnabledChanged(false)` else-branch resets the lerp state and Opacity, but does **not** clear the Win32 `WS_EX_TRANSPARENT` window-style bit. The only code path that removes `WS_EX_TRANSPARENT` is `OnSampleThreadTick`'s restore branch (`GhostModeController.cs:277-280`), which is gated by `if (!IsEnabled) return;` at line 227 — so once `_isEnabled = false` is observable to the sampler, the restore branch is unreachable.

Concrete failure scenario:
1. User hovers; cursor enters widget; ratio reaches `1.0`; `Activate()` runs and sets `WS_EX_TRANSPARENT` on the HWND (line 317).
2. User clicks the system-tray "Toggle Ghost Mode" item (the tray icon is a Windows Forms `NotifyIcon`, not affected by the overlay's click-through state).
3. `_ghostMode.IsEnabled = false` runs on the UI thread → `OnGhostEnabledChanged(false)` runs.
4. Phase 87's patch zeros `_currentRatio`/`_targetRatio` and writes `this.Opacity = _windowOpacity` — widget becomes visible.
5. **`WS_EX_TRANSPARENT` is still set.** The widget is visible but click-through. Drag, right-click context menu, scroll-wheel opacity adjust — all dead.
6. The sampler short-circuits on `!IsEnabled` (line 227), so it never removes `WS_EX_TRANSPARENT`. State is unrecoverable until the user re-enables ghost AND moves the cursor outside the proximity radius (which triggers the `RestoreWithEvent` path).

This is the user-visible manifestation of the deferred WR-04 UAT. Pre-WR-04 behaviour was "invisible-and-click-through" (the user could plausibly read this as "ghost is hiding"); post-WR-04 is "visible-and-click-through", which is strictly worse for diagnosability.

**Fix:** in `OnGhostEnabledChanged(false)`, when `_ghostMode.IsActive` is true at the moment of disable, force the Win32 style restore. Add an `internal void ForceRestore()` method to `GhostModeController` that performs the same `SetWindowLong + SetWindowPos` pair the sampler restore branch already runs, and clears `_isGhostMode = false` itself (this introduces a UI-thread writer to `_isGhostMode`, so update the D-06 single-owner contract to read "owned by sampler thread except via the explicit `ForceRestore()` UI-thread escape hatch").

```csharp
// In GhostModeController.cs
/// <summary>
/// UI-thread escape hatch: force-restore window style when ghost mode is disabled mid-active-ghost.
/// Mirrors the sampler restore branch (lines 277-280) but skips the Restored event raise — the
/// caller is the IsEnabled writer and is responsible for any UI-side cleanup.
/// </summary>
internal void ForceRestore()
{
    if (!_isGhostMode) return;
    _isGhostMode = false;
    int exStyle = GetWindowLong(_hwnd, GWL_EXSTYLE);
    SetWindowLong(_hwnd, GWL_EXSTYLE, exStyle & ~WS_EX_TRANSPARENT);
    SetWindowPos(_hwnd, IntPtr.Zero, 0, 0, 0, 0,
        SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED);
}

// In MainWindow.OnGhostEnabledChanged(false) — call BEFORE detaching Rendering so any
// in-flight render tick still sees consistent state.
else
{
    _ghostMode.ForceRestore();   // remove WS_EX_TRANSPARENT if currently click-through
    if (!_renderPumpAttached) return;
    System.Windows.Media.CompositionTarget.Rendering -= OnRenderingTick;
    _renderPumpAttached = false;
    _currentRatio = 0.0;
    _targetRatio  = 0.0;
    if (_settingsWindow?.IsVisible != true)
        this.Opacity = _windowOpacity;
}
```

## Warnings

### WR-01: WR-04 reset has a sampler-thread race that can re-corrupt `_targetRatio`

**File:** `FuzzyClock.App/MainWindow.xaml.cs:275-279`
**Issue:** The five-line patch zeros `_targetRatio = 0.0` on the UI thread. But the sampler thread (`OnSampleThreadTick` at `GhostModeController.cs:255`) can have a `Dispatcher.BeginInvoke` queued from the moment immediately before the user disabled ghost — that BeginInvoke calls `ProximityChanged?.Invoke(result.NewRatio)` which, in MainWindow at line 195, runs `_targetRatio = ratio`.

Sequence:
- T0 (sampler thread): tick reads `IsEnabled` (true), runs `OnSampleTick`, schedules `BeginInvoke` with the ProximityChanged invocation.
- T1 (UI thread): user clicks tray "Toggle Ghost Mode" → `_ghostMode.IsEnabled = false` → `OnGhostEnabledChanged(false)` → `_targetRatio = 0.0`.
- T2 (UI thread): dispatcher pumps the queued lambda from T0 → `_targetRatio = ratio` (some non-zero value).

The Rendering pump is detached, so nothing acts on the corrupted `_targetRatio` immediately. **But on the next ghost re-enable**, `_currentRatio = 0.0` (correctly reset on disable) and `_targetRatio` is still the stale 33-ms-old value. The re-attached Rendering pump will lerp toward the stale ratio for one sampler tick (~33 ms) before the sampler refreshes `_targetRatio`. Visible result: a brief one-frame ghost flash on re-enable.

**Fix:** also reset `_targetRatio = 0.0` at the top of `OnGhostEnabledChanged(true)` to defensively close the race. The cost is one double write that the WR-04 path already performs on the disable edge — doing it on the enable edge as well makes the contract symmetric.

```csharp
private void OnGhostEnabledChanged(bool enabled)
{
    if (enabled)
    {
        if (_renderPumpAttached) return;
        _previousRenderTime = null;
        _currentRatio = 0.0;     // defensive symmetry with disable-edge reset
        _targetRatio  = 0.0;     // closes WR-01 sampler-queued-lambda race
        System.Windows.Media.CompositionTarget.Rendering += OnRenderingTick;
        _renderPumpAttached = true;
    }
    // ... existing else branch
}
```

### WR-02: `LerpRatioTests` parameter ordering is inverted relative to the function under test

**File:** `FuzzyClock.App.Tests/LerpRatioTests.cs:21`
**Issue:** The signature is `(double target, double expected, double alpha, double deltaSeconds, double current)` but the SUT signature is `LerpRatio(double current, double target, double alpha, double deltaSeconds)`. Worse, `target` and `expected` sit adjacent and in all six snap rows they are equal (`1.0, 1.0, ...` or `0.0, 0.0, ...`), so the columns are visually indistinguishable in the DataRow attribute literal.

Concrete brittleness: a future reviewer adding a 7th DataRow could easily mis-order arguments — e.g. write `[DataRow(1.0, 0.5, ...)]` thinking the second slot is `current`, but it's actually `expected`, so the test would pass for the wrong reason or fail for confusing reasons. The MSTest DataRow → method-parameter binding is positional and offers zero protection against this.

**Fix:** match the SUT order. `(double current, double target, double alpha, double deltaSeconds, double expected)`. Also re-arrange the DataRow values consistently. This makes `current` and `target` distinct positions and makes `expected` the trailing column where it conventionally sits:

```csharp
[TestMethod]
[DataRow(1.0, 1.0, 15.0, 0.016, 1.0, DisplayName = "current=1.0, target=1.0 -> 1.0")]
[DataRow(0.5, 1.0, 15.0, 0.016, 1.0, DisplayName = "current=0.5, target=1.0 -> 1.0 (snap)")]
// ...
public void LerpRatio_TerminalStateSnap(
    double current, double target, double alpha, double deltaSeconds, double expected)
{
    double result = GhostModeController.LerpRatio(current, target, alpha, deltaSeconds);
    Assert.AreEqual(expected, result, 0.0001);
}
```

### WR-03: `LerpRatio_TerminalStateSnap` row "target=0.0, current=0.0" provides zero diagnostic value

**File:** `FuzzyClock.App.Tests/LerpRatioTests.cs:18`
**Issue:** Row `[DataRow(0.0, 0.0, 15.0, 0.016, 0.0, ...)]` exercises `current=0.0, target=0.0`. This row passes whether or not the snap branch exists: with snap, return `target=0.0`; without snap, the formula returns `0.0 + (0.0 - 0.0) * (1.0 - exp(-0.24)) = 0.0`. Identical row 14's `current=1.0, target=1.0 -> 1.0` is similarly degenerate (formula returns `1.0` regardless of snap presence).

The intent of `LerpRatio_TerminalStateSnap` is to verify the **D-03 terminal-state-snap branch** exists and is reachable. Two of the six rows cannot distinguish the snap path from the formula path; only the four rows where `current != target` exercise the snap. This dilutes the test's diagnostic power — if a regression removed the snap, the suite would still report 2/6 rows passing in the same `LerpRatio_TerminalStateSnap` test run.

**Fix:** drop the two degenerate rows (current=target). They are subsumed by the four non-degenerate rows for snap behaviour. Alternatively, keep them but rename the test or add a comment so future readers know these rows are "freebies" rather than meaningful coverage:

```csharp
// Drop these two rows — they pass with or without the snap branch:
// [DataRow(1.0, 1.0, 15.0, 0.016, 1.0, ...)]
// [DataRow(0.0, 0.0, 15.0, 0.016, 0.0, ...)]
```

### WR-04: `OnSampleTickTests` deviation from PLAN cursorX is silently encoded in a comment, not in the test name

**File:** `FuzzyClock.App.Tests/OnSampleTickTests.cs:28-32`
**Issue:** The test author corrected a PLAN error — Plan's CONTEXT.md `<specifics>` proposed `cursorX=50` for the RestoreWithEvent row, but with the default radius (80px) cursorX=50 yields ratio=0.375 (RestoreNoEvent), not 0.0 (RestoreWithEvent). The author fixed this by using `cursorX=10` (distance 90px > radius 80px → ratio=0.0). The correction is documented in a comment (lines 28-31) but **not** reflected anywhere queryable: the DataRow's `DisplayName` says "far+ghost -> RestoreWithEvent" with no hint that the cursor offset is non-trivial.

If a future maintainer adjusts `_ghostFadeRadiusPx` defaults, or adds a row that re-uses cursorX=50 by analogy with the RestoreNoEvent row, the test class will silently lose RestoreWithEvent coverage (the row would still pass — but for `RestoreNoEvent`, with `expectedTransition` updated to match the new geometry).

**Fix:** encode the geometric invariant in code, not just a comment. Define named constants for the cursor positions and assert the resulting ratio precondition explicitly so a future radius change breaks the test loudly:

```csharp
// Named geometric constants make the radius-dependence explicit
private const int RectLeft = 100, RectTop = 100, RectRight = 200, RectBottom = 200;
private const int DefaultRadiusPx = 80;
// cursorX must give Chebyshev distance > DefaultRadiusPx to clamp ratio to exactly 0.0
private const int CursorOutsideZone = 10;   // |10 - 100| = 90 > 80 → ratio clamps to 0.0
```

## Info

### IN-01: D-06 docstring on `_isGhostMode` understates the new test-side writer

**File:** `FuzzyClock.App/GhostModeController.cs:70`
**Issue:** The inline comment now reads "D-06: cross-thread reader at MainWindow.xaml.cs:165 — Phase 87 D-SEAM-02b: relaxed to internal for OnSampleTickTests setup". The line-165 reference is to `_currentRatio > 0.0`, not `_isGhostMode` — the cross-thread reader is in `MainWindow.OnRenderingTick` and `MainWindow.Window_MouseLeave` (`_ghostMode.IsActive` at line 1210). The line number drifted in a prior phase and was not corrected here.

**Fix:** update the comment to point at the actual current readers:
```csharp
internal volatile bool _isGhostMode;  // D-06: cross-thread reader via IsActive (MainWindow:179, 1210); Phase 87 D-SEAM-02b: relaxed from private to internal for OnSampleTickTests arrange-act-setup. Single-owner write contract preserved — production writers remain OnSampleTick (false) and Activate() (true).
```

### IN-02: `OnSampleTickTests` test class declared `internal` but companion test classes are `public`

**File:** `FuzzyClock.App.Tests/OnSampleTickTests.cs:22`
**Issue:** Of the eleven `[TestClass]` files in `FuzzyClock.App.Tests`, only `OnSampleTickTests` is `internal`. With `[assembly: DiscoverInternals]` it is discoverable, but the inconsistency means a reader has to investigate why this class is special. The class doesn't actually require `internal` visibility — its only access to internal members is `controller._isGhostMode`, which is reachable from a `public` test class via the existing `[InternalsVisibleTo("FuzzyClock.App.Tests")]` declaration in `FuzzyClock.App.csproj` (lines 7-10).

**Fix:** change `internal class OnSampleTickTests` → `public class OnSampleTickTests`. This reduces the surface area of `[assembly: DiscoverInternals]` (which would still be needed for the `StubSensor`/`StubHardware` helpers in `TemperatureServiceTests.cs` if those ever grow `[TestClass]` markers — they currently don't, so DiscoverInternals could in principle be removed, but keeping it is harmless future-proofing).

### IN-03: WR-04 fix references "D-CARRY-01" without an inline pointer to the design note

**File:** `FuzzyClock.App/MainWindow.xaml.cs:274`
**Issue:** The comment cites `D-CARRY-01` as the design rationale, but neither the file nor `GhostModeController.cs` defines `D-CARRY-01` — the reader has to grep the planning artifacts (`87-02-PLAN.md`) to find the rationale. Other D-NN markers in this file (D-01, D-04, D-06, D-07, D-13, etc.) are similarly undocumented inline, which is a project-wide pattern — but for a fix that introduces a behavioral change to ghost-mode disable, the rationale deserves to be readable from the code.

**Fix:** expand the inline comment to summarise the carry-over invariant (one sentence) so the reader doesn't need to leave the file:
```csharp
// Phase 87 WR-04 fix (D-CARRY-01: opacity must not carry over from a mid-fade ghost-disable —
// pre-fix the widget was stuck at lerped opacity until next ProximityChanged on re-enable).
// Clear residual lerp state and restore Opacity unless settings-window-pinned.
_currentRatio = 0.0;
_targetRatio  = 0.0;
if (_settingsWindow?.IsVisible != true)
    this.Opacity = _windowOpacity;
```

---

_Reviewed: 2026-05-21_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
