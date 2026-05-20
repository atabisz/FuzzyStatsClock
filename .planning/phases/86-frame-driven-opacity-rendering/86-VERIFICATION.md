---
phase: 86-frame-driven-opacity-rendering
verified: 2026-05-20T12:00:00Z
status: human_needed
score: 14/14 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Hover cursor toward widget — confirm visible fade is smooth at display refresh rate (no stepping/jank tied to 33 ms sampling cadence)"
    expected: "Fade traversal looks smoothly continuous at 60 Hz / 144 Hz; visibly different from pre-Phase-86 stepwise behavior; activation crisp at proximity = 1.0; restore crisp at proximity = 0.0"
    why_human: "FADE-01 visible smoothness is observation-only — grep can confirm CompositionTarget.Rendering subscription and per-frame LerpRatio call, but only a human eye on the running widget can confirm the user-perceptible smoothness improvement. Phase 87 owns formal PERF-01 acceptance under sustained 25-50% CPU load."
  - test: "Drag the widget by the title region during an active fade — confirm Opacity freezes mid-fade until drag releases, then resumes smoothly"
    expected: "Visible Opacity does NOT advance while _isDragging guard is active; on drag release, opacity catches up to the lerped current state on the next frame with no perceived jump"
    why_human: "SEM-04 guard chain preservation — code shows the three guards (_isDragging, _settingsWindow?.IsVisible, _menuOpen) inside OnRenderingTick at lines 312-314 in the original byte-for-byte order, but real-time interaction behavior under WPF dispatcher load needs human observation to confirm parity with v4.3 behavior."
  - test: "Open Settings window during an active fade — confirm widget Opacity freezes while Settings is open, resumes after Settings closes"
    expected: "Opacity write short-circuits while _settingsWindow?.IsVisible == true; lerp continues underneath so visible state catches up the moment Settings closes"
    why_human: "SEM-04 guard chain — runtime observation of settings-window-open freeze. Visual confirmation that the widget pin behavior matches pre-Phase-86 expectations."
  - test: "Right-click the widget to open the tray ContextMenuStrip during an active fade — confirm Opacity pins until the menu closes (RMB-04)"
    expected: "Visible Opacity stays at the value at menu-open; resumes smoothly after menu closes"
    why_human: "SEM-04 RMB-04 guard preservation — _menuOpen guard now lives in OnRenderingTick rather than the ProximityChanged lambda; user-observable behavior must match exactly."
  - test: "Scroll the mouse wheel over the widget during an active fade — confirm wheel-driven Opacity step takes effect immediately and the next frame multiplies through the new _windowOpacity"
    expected: "10% step lands instantly; subsequent fade traversal correctly multiplies through the updated _windowOpacity (no contention or fight between SetOpacity / Window_PreviewMouseWheel direct writes and the per-frame pump)"
    why_human: "SEM-04 D-15 mouse-wheel direct-write contract — code shows Window_PreviewMouseWheel at line 1636 still writes `this.Opacity = _windowOpacity;` directly, and SetOpacity at line 1492 multiplies through `_currentRatio`, but the natural convergence between direct writes and the next render frame is observation-only."
  - test: "Toggle ghost mode OFF via tray while cursor is in proximity halo (mid-fade with _currentRatio in 0..1) — confirm widget recovers to full _windowOpacity opacity"
    expected: "Widget becomes fully opaque on disable, no residual fade trapped at e.g. 0.5"
    why_human: "WR-04 (advisory) flags an interaction-state-stranding edge case where toggling ghost OFF mid-fade leaves this.Opacity at the lerped value with no recovery driver. The OnGhostEnabledChanged(false) branch detaches the pump but does not reset _currentRatio or write Opacity = _windowOpacity. Pre-Phase-86 had the same shape (sampler stopped emitting; last-written Opacity was sticky), so this may not be a Phase 86 regression — but the new design adds long-lived _currentRatio state that carries the residual through re-enable. Human confirmation needed to assess severity vs. fix priority."
  - test: "Sustained CPU load (Phase 87 PERF-01 sanity precursor) — run application with a 25-50% CPU stressor and confirm fade is still visibly smooth across the full traversal"
    expected: "Fade subjectively ≥30 fps under load; no stepping/jank visible to the eye"
    why_human: "Phase 87 owns the formal PERF-01 acceptance, but a sanity check that the new architecture delivers its design intent (visible smoothness under load) is appropriate at Phase 86 verification."
---

# Phase 86: Frame-driven opacity rendering — Verification Report

**Phase Goal:** Refactor the ghost-mode opacity fade so it is driven by `CompositionTarget.Rendering` per-frame lerp instead of the 33 ms sampling cadence, while preserving all five existing interaction guards verbatim (SEM-04). The 33 ms sampler continues to update `_targetRatio`; a per-frame render pump tick consumes that target and lerps `_currentRatio` toward it via a time-stable exponential curve, then writes `Opacity`.

**Verified:** 2026-05-20T12:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

The phase goal decomposes into five Success Criteria from ROADMAP.md (FADE-01..04 + SEM-04). All five are observably encoded in source:

1. `MainWindow` subscribes to `CompositionTarget.Rendering` while ghost mode is enabled and lerps `_currentRatio` toward `_targetRatio` per render frame; subscription removed when ghost mode is disabled.
2. `this.Opacity` is computed from `_currentRatio` (lerped, visible) — not `_targetRatio` (destination); contrast-skip predicate observes `_currentRatio > 0.0`.
3. Terminal-state snap inside `GhostModeController.LerpRatio` returns `target` directly when `target == 0.0 || target == 1.0`, closing the loop at exact terminal values rather than asymptotically approaching them.
4. `LerpRatio` is a pure-static helper with no field reads, no events, no instance state — directly callable from `FuzzyClock.App.Tests` via the existing `InternalsVisibleTo` plumbing.
5. All five existing `MainWindow` interaction guards behave identically — three pin-guards moved verbatim into `OnRenderingTick` (`_isDragging` → settings-window → `_menuOpen`); mouse-wheel direct write at `Window_PreviewMouseWheel` and `SetOpacity` preserved structurally; contrast-skip predicate naturally reads what the user sees via the rename.

The advisory code review (`86-REVIEW.md`) flagged 4 WARNINGs and 4 INFOs, 0 BLOCKERs. None invalidate the phase goal. WR-01 (stale `_previousRenderTime` across the convergence early-return path) is a behaviorally noticeable but bounded issue — the `Math.Clamp(deltaSeconds, 0.0, 0.1)` defensive bound caps the worst-case first-post-convergence jump at ~78%; this is a smoothness blemish on first re-engagement after long idle, not a failure of any FADE-01..04 or SEM-04 success criterion. WR-02 (stale RMB-04 comment), WR-03 (asymmetric subscription cleanup in `Closed`), and WR-04 (mid-fade toggle-off stranding) are similarly maintenance/edge-case issues, not goal-defeating. They are recorded for the next phase or follow-up consideration.

---

## Observable Truths

| #   | Truth (from ROADMAP Success Criteria + plan must_haves)                                                                                                                                                                | Status     | Evidence                                                                                                                                                                                                                                                          |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **FADE-01:** While ghost mode is enabled, `MainWindow` is subscribed to `CompositionTarget.Rendering` and lerps `_currentRatio` toward `_targetRatio` every render frame                                                | ✓ VERIFIED | `MainWindow.xaml.cs:266` `System.Windows.Media.CompositionTarget.Rendering += OnRenderingTick;` (in `OnGhostEnabledChanged(true)` branch); `OnRenderingTick` at lines 288-319 calls `GhostModeController.LerpRatio(...)` at line 305 and writes Opacity at line 318 |
| 2   | **FADE-04:** While ghost mode is disabled, the subscription is removed and the per-frame loop has zero overhead                                                                                                          | ✓ VERIFIED | `MainWindow.xaml.cs:272` `System.Windows.Media.CompositionTarget.Rendering -= OnRenderingTick;` (in `OnGhostEnabledChanged(false)` branch); `_renderPumpAttached` idempotency guard at lines 264, 271 prevents double-subscribe                                  |
| 3   | **FADE-02:** `this.Opacity` is computed from `_currentRatio` (not the target); contrast-skip predicate observes `_currentRatio > 0.0`                                                                                  | ✓ VERIFIED | `MainWindow.xaml.cs:318` `this.Opacity = _windowOpacity * (1.0 - _currentRatio);` in OnRenderingTick; line 1492 same expression in `SetOpacity`; line 179 contrast-skip predicate reads `_currentRatio > 0.0`                                                     |
| 4   | **FADE-03:** When `_targetRatio` reaches `1.0` or `0.0`, `_currentRatio` snaps to that exact value rather than asymptotically approaching it                                                                            | ✓ VERIFIED | `GhostModeController.cs:480` `if (target == 1.0 \|\| target == 0.0) return target;` — terminal-state snap is the first executable statement in LerpRatio body                                                                                                       |
| 5   | **Lerp helper purity (ROADMAP success criterion #4):** Lerp logic extracted as a pure static helper suitable for unit testing without any WPF/timer dependency                                                          | ✓ VERIFIED | `GhostModeController.cs:475` `internal static double LerpRatio(double current, double target, double alpha, double deltaSeconds)` — no field reads, no events, no instance state; `InternalsVisibleTo("FuzzyClock.App.Tests")` in csproj exposes it to test project   |
| 6   | **SEM-04 guard 1 (drag freeze):** `_isDragging` short-circuits opacity writes inside the per-frame render pump                                                                                                          | ✓ VERIFIED | `MainWindow.xaml.cs:312` `if (_isDragging) return;` — first guard in OnRenderingTick body, placed AFTER lerp step (line 305) and BEFORE Opacity write (line 318), matching pre-Phase-86 order                                                                       |
| 7   | **SEM-04 guard 2 (settings-window freeze):** `_settingsWindow?.IsVisible == true` short-circuits opacity writes                                                                                                          | ✓ VERIFIED | `MainWindow.xaml.cs:313` `if (_settingsWindow?.IsVisible == true) return;` — second guard in OnRenderingTick body                                                                                                                                                  |
| 8   | **SEM-04 guard 3 (RMB-04 menu pin):** `_menuOpen` short-circuits opacity writes                                                                                                                                         | ✓ VERIFIED | `MainWindow.xaml.cs:314` `if (_menuOpen) return;` — third guard in OnRenderingTick body, completing the byte-for-byte parity with the pre-Phase-86 `ProximityChanged` lambda                                                                                       |
| 9   | **SEM-04 guard 4 (mouse-wheel direct write):** `Window_PreviewMouseWheel` writes `this.Opacity` directly without contention from the per-frame loop                                                                     | ✓ VERIFIED | `MainWindow.xaml.cs:1636` `this.Opacity = _windowOpacity;` — direct write preserved verbatim; structurally unchanged from pre-Phase-86. SetOpacity at line 1492 multiplies through `_currentRatio` so the pump-side and wheel-side converge through `_windowOpacity` |
| 10  | **SEM-04 guard 5 (contrast-skip predicate):** Predicate observes the lerped current ratio (what the user sees), not the target                                                                                          | ✓ VERIFIED | `MainWindow.xaml.cs:179` `() => _ghostMode.IsActive \|\| _windowOpacity == 0.0 \|\| _isDragging \|\| _currentRatio > 0.0,` — passed to `_contrast.Initialize(...)` as the skip predicate                                                                              |
| 11  | **D-13 ProximityChanged lambda reduced:** Lambda body is now `_targetRatio = ratio;` only — guards moved into render pump                                                                                              | ✓ VERIFIED | `MainWindow.xaml.cs:195` `_ghostMode.ProximityChanged = ratio => { _targetRatio = ratio; };` — single-statement lambda; no `this.Opacity`, no `_isDragging`, no `_settingsWindow`, no `_menuOpen` references inside the lambda body                                  |
| 12  | **D-04 / D-06 EnabledChanged wiring:** `EnabledChanged` event raised on actual transition only; render pump attaches/detaches in lockstep                                                                              | ✓ VERIFIED | `GhostModeController.cs:113` setter early-return on `current == value`; `:151` `public event Action<bool>? EnabledChanged;`; MainWindow subscribes at `:199` and the D-07 belt-and-braces fallback at `:203` covers the no-event-on-default-match case                |
| 13  | **D-01 deltaSeconds tracking with first-frame baseline + clamp:** Per-frame delta computed from `RenderingEventArgs.RenderingTime`, clamped defensively to `[0.0, 0.1]`                                                | ✓ VERIFIED | `MainWindow.xaml.cs:295` `var args = (System.Windows.Media.RenderingEventArgs)e;`; `:296-298` `deltaSeconds = previous.HasValue ? (args.RenderingTime - previous.Value).TotalSeconds : 0.016;`; `:299` `Math.Clamp(deltaSeconds, 0.0, 0.1);`                          |
| 14  | **Closed teardown ordering:** Render pump detached BEFORE `_ghostMode.Dispose()` so late frames cannot queue work into the controller during the WaitHandle drain                                                       | ✓ VERIFIED | `MainWindow.xaml.cs:245-247` `CompositionTarget.Rendering -= OnRenderingTick; _renderPumpAttached = false; _ghostMode.Dispose();` — explicit detach precedes Dispose() in the Closed lambda                                                                          |

**Score:** 14 / 14 must-haves verified

---

## Required Artifacts

| Artifact                                                                       | Expected                                                                                                       | Status     | Details                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FuzzyClock.App/GhostModeController.cs` — `EnabledChanged` event               | `public event Action<bool>? EnabledChanged;` declared; `IsEnabled` setter raises on change-detect              | ✓ VERIFIED | Declared at line 151 with event-keyword form; setter at lines 102-121 has change-detect early-return + `EnabledChanged?.Invoke(value)` at line 119                                                                                |
| `FuzzyClock.App/GhostModeController.cs` — `LerpRatio` helper                   | `internal static double LerpRatio(double current, double target, double alpha, double deltaSeconds)` exists    | ✓ VERIFIED | Declared at line 475 adjacent to `ComputeProximityRatio`; body at lines 477-487 has terminal-state snap (480) then exponential lerp (486)                                                                                          |
| `FuzzyClock.App/MainWindow.xaml.cs` — `_currentRatio` + `_targetRatio` fields  | `_proximityRatio` renamed to `_currentRatio`; sibling `_targetRatio = 0.0` field added                         | ✓ VERIFIED | Line 58 `private double _currentRatio = 0.0;`; line 61 `private double _targetRatio = 0.0;`; `grep -c _proximityRatio` returns 0 across all files (full rename)                                                                  |
| `FuzzyClock.App/MainWindow.xaml.cs` — `LerpAlpha` constant                    | `private const double LerpAlpha = 15.0;`                                                                       | ✓ VERIFIED | Line 65                                                                                                                                                                                                                          |
| `FuzzyClock.App/MainWindow.xaml.cs` — `_renderPumpAttached` guard              | `private bool _renderPumpAttached;` field for idempotency                                                      | ✓ VERIFIED | Line 67                                                                                                                                                                                                                          |
| `FuzzyClock.App/MainWindow.xaml.cs` — `_previousRenderTime` baseline tracker  | `private TimeSpan? _previousRenderTime;` for deltaSeconds tracking                                             | ✓ VERIFIED | Line 70                                                                                                                                                                                                                          |
| `FuzzyClock.App/MainWindow.xaml.cs` — `OnGhostEnabledChanged` handler          | `private void OnGhostEnabledChanged(bool enabled)` — attach/detach lifecycle                                   | ✓ VERIFIED | Lines 260-275: idempotency-guarded attach/detach of `CompositionTarget.Rendering` to/from `OnRenderingTick`; resets `_previousRenderTime = null` on attach                                                                         |
| `FuzzyClock.App/MainWindow.xaml.cs` — `OnRenderingTick` per-frame pump        | `private void OnRenderingTick(object? sender, EventArgs e)` — D-10 convergence early-return + D-01 + lerp + guards + Opacity write | ✓ VERIFIED | Lines 288-319: 5 steps in load-bearing order — convergence early-return at 292; deltaSeconds tracking 295-300; lerp call 305; guard chain 312-314; Opacity write 318                                                              |

---

## Key Link Verification

| From                                            | To                                                  | Via                                                          | Status      | Details                                                                                                                                                                              |
| ----------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GhostModeController.IsEnabled` setter          | `EnabledChanged` subscribers                        | change-detect raise on actual transition                     | ✓ WIRED     | `GhostModeController.cs:113` early-return on equality; `:119` `EnabledChanged?.Invoke(value)` on change                                                                              |
| `GhostModeController.EnabledChanged` event      | `MainWindow.OnGhostEnabledChanged` handler          | `+=` subscription in ContentRendered                         | ✓ WIRED     | `MainWindow.xaml.cs:199` `_ghostMode.EnabledChanged += OnGhostEnabledChanged;`; D-07 belt-and-braces fallback at `:203` covers the no-event-on-default-match case                    |
| `MainWindow.OnGhostEnabledChanged`              | `CompositionTarget.Rendering`                       | `+= OnRenderingTick` when enabled, `-=` when disabled         | ✓ WIRED     | `MainWindow.xaml.cs:266` attach branch; `:272` detach branch; both guarded by `_renderPumpAttached` for idempotency                                                                  |
| `MainWindow.OnRenderingTick`                    | `GhostModeController.LerpRatio`                     | per-frame static call                                         | ✓ WIRED     | `MainWindow.xaml.cs:305` `_currentRatio = GhostModeController.LerpRatio(_currentRatio, _targetRatio, LerpAlpha, deltaSeconds);` — only call site of the helper                       |
| `MainWindow.ProximityChanged` lambda            | `_targetRatio` field                                | lambda body sets `_targetRatio = ratio`                      | ✓ WIRED     | `MainWindow.xaml.cs:195` `_ghostMode.ProximityChanged = ratio => { _targetRatio = ratio; };` — verified that lambda has no `this.Opacity` / `_isDragging` / `_settingsWindow` / `_menuOpen` |
| `this.Closed` handler                           | `CompositionTarget.Rendering`                       | explicit detach BEFORE `_ghostMode.Dispose()`                | ✓ WIRED     | `MainWindow.xaml.cs:245` detach precedes `:247` Dispose                                                                                                                              |
| `FuzzyClock.App.Tests`                          | `GhostModeController.LerpRatio`                     | `InternalsVisibleTo` plumbing                                | ✓ WIRED     | `FuzzyClock.App.csproj` lines 7-11 declare `InternalsVisibleTo("FuzzyClock.App.Tests")`; helper is `internal static` and reachable from the test project (Phase 87 will exercise it) |

---

## Behavioral Spot-Checks

| Behavior                                                        | Command                                                              | Result                                          | Status |
| --------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------- | ------ |
| Solution compiles cleanly                                       | `dotnet build FuzzyClock.slnx --nologo --verbosity quiet`             | Build succeeded; 0 Warnings, 0 Errors           | ✓ PASS |
| App-side test suite passes (regression baseline)                | `dotnet test FuzzyClock.App.Tests --nologo --verbosity quiet`         | 129 passed / 0 failed / 0 skipped               | ✓ PASS |
| Core-side test suite passes (regression baseline)               | `dotnet test FuzzyClock.Core.Tests --nologo --verbosity quiet`        | 449 passed / 0 failed / 0 skipped               | ✓ PASS |
| `_proximityRatio` fully renamed (D-12)                          | grep across `FuzzyClock.App/`                                          | 0 matches                                       | ✓ PASS |
| Total baseline preserved                                        | App + Core = 129 + 449                                                | 578 / 578 (matches Phase 85 baseline)           | ✓ PASS |

---

## Requirements Coverage

| Requirement | Source Plan         | Description (from REQUIREMENTS.md)                                                                                                                                       | Status      | Evidence                                                                                                                                              |
| ----------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| FADE-01     | 86-02-PLAN.md       | Frame-driven lerp drives `this.Opacity` toward a target ratio every render frame via `CompositionTarget.Rendering`                                                       | ✓ SATISFIED | `OnRenderingTick` at MainWindow.xaml.cs:288-319; subscribed at line 266 / detached at 272; calls `LerpRatio` per frame at line 305; writes Opacity at 318 |
| FADE-02     | 86-02-PLAN.md       | `GhostModeController` exposes a target ratio set by sampling; `MainWindow` holds the current ratio updated per render frame; contrast-skip predicate observes the current | ✓ SATISFIED | `_targetRatio` set by ProximityChanged lambda (line 195); `_currentRatio` updated in OnRenderingTick (line 305); contrast-skip predicate reads `_currentRatio > 0.0` (line 179) |
| FADE-03     | 86-01-PLAN.md       | When the target ratio reaches `1.0` or `0.0`, the current ratio snaps to that terminal value rather than asymptotically approaching it                                   | ✓ SATISFIED | `LerpRatio` body line 480 returns target unchanged at terminal values; convergence early-return at MainWindow line 292 closes the steady-state loop                                                  |
| FADE-04     | 86-01-PLAN.md / 86-02-PLAN.md | Subscription added when ghost mode is enabled and removed when disabled, so the per-frame loop has zero overhead when the feature is off                                | ✓ SATISFIED | `OnGhostEnabledChanged` attach branch at line 266; detach branch at 272; `EnabledChanged` event raised by IsEnabled setter only on actual transition                              |
| SEM-04      | 86-02-PLAN.md       | `MainWindow` drag freeze, settings-window-open freeze, RMB-04 right-click menu pin, and mouse-wheel direct opacity all behave identically                                | ✓ SATISFIED | Three pin guards moved verbatim into OnRenderingTick lines 312-314 in identical order; mouse-wheel direct write preserved at line 1636; SetOpacity multiplies through `_currentRatio` at line 1492; contrast-skip predicate reads `_currentRatio > 0.0` at line 179 |

---

## Anti-Patterns Found

Scanned `FuzzyClock.App/GhostModeController.cs` and `FuzzyClock.App/MainWindow.xaml.cs` for stub/debt/empty-implementation patterns.

| File                                | Line | Pattern                | Severity | Impact                                                                                                                                                              |
| ----------------------------------- | ---- | ---------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (none)                              | —    | —                      | —        | No `TODO`/`FIXME`/`XXX`/`HACK`/`PLACEHOLDER` markers introduced by Phase 86; no empty implementations; no console-log-only methods; no hardcoded empty data flowing to render |

The advisory code review (`86-REVIEW.md`) flagged 4 WARNINGs (WR-01..WR-04) that are NOT anti-patterns — they are design-level edge cases and stale-comment hygiene items, scored as warning-not-blocker by the reviewer. They are repeated under "Advisory Findings to Track" below for the next phase / follow-up consideration. None of the 4 WARNINGs invalidate any of the 14 must-haves.

### Advisory Findings to Track (from 86-REVIEW.md)

| ID    | Severity | File:Line                                                | Concern                                                                                                                                                                     |
| ----- | -------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WR-01 | warning  | `MainWindow.xaml.cs:288-300`                             | `_previousRenderTime` not updated on convergence early-return path → first post-convergence frame measures multi-second delta clamped to 100 ms (~78% lerp jump on first re-engagement) |
| WR-02 | warning  | `MainWindow.xaml.cs:225-230`                             | Stale RMB-04 comment still references the (removed) `ProximityChanged` lambda's `_menuOpen` guard; the guard now lives in `OnRenderingTick`                                       |
| WR-03 | warning  | `MainWindow.xaml.cs:183-199, 238-249`                    | Asymmetric Closed cleanup: explicit `CompositionTarget.Rendering -=` but no `_ghostMode.EnabledChanged -=` / `Restored -=` — pre-existing pattern but breaks symmetry now           |
| WR-04 | warning  | `MainWindow.xaml.cs:260-275`                             | Toggling ghost OFF mid-fade leaves `this.Opacity` at the lerped value with no recovery driver — `_currentRatio` carries the residual through the next ghost re-enable cycle           |
| IN-01 | info     | `MainWindow.xaml.cs:265, 296-300`                        | `_previousRenderTime` reset is mirrored in two places with no shared helper — refactor opportunity if a third attach site is ever added                                            |
| IN-02 | info     | `MainWindow.xaml.cs:312-318` and `:1484-1494`            | Render-pump guard chain partially overlaps with `SetOpacity` settings-window check — future-maintenance footgun if the guard set is ever extended                                  |
| IN-03 | info     | `MainWindow.xaml.cs:67-70`                               | `_renderPumpAttached` and `_previousRenderTime` rely on implicit default-init while neighboring fields use explicit defaults — minor style inconsistency                            |
| IN-04 | info     | `GhostModeController.cs:475-487`                         | `LerpRatio`'s exact-equality guard is correct but reliant on a remote invariant (only the sampler sets `_targetRatio` to exact terminal values) — forward-compatibility note          |

---

## Human Verification Required

See the `human_verification:` block in the frontmatter for the seven items requiring runtime observation. Categories:

1. **Visible smoothness (FADE-01 design intent):** widget fade subjectively smooth at display refresh rate
2. **SEM-04 guards under runtime interaction:** drag freeze, settings-window pin, RMB-04 menu pin, mouse-wheel direct write — all four require human observation that the byte-for-byte code preservation translates to byte-for-byte user experience
3. **WR-04 mid-fade toggle-off (advisory):** confirm whether the residual-opacity stranding is a user-visible regression or benign carryover from pre-Phase-86 behavior
4. **PERF-01 sanity precursor:** smoothness under sustained 25-50% CPU load (Phase 87 owns the formal acceptance — this is a sanity check that the architectural change delivers its design intent)

---

## Gaps Summary

No gaps blocking Phase 86 goal achievement. All 14 must-haves verified by code inspection + build + 578-test regression baseline. The phase delivers:

- Per-frame render pump on `CompositionTarget.Rendering` (FADE-01)
- Current/target ratio split with current driving Opacity (FADE-02)
- Terminal-state snap inside `LerpRatio` (FADE-03)
- Lifecycle-bound subscription with zero per-frame cost when disabled (FADE-04)
- All five interaction guards preserved verbatim (SEM-04): three pin guards moved verbatim into `OnRenderingTick` in identical order; mouse-wheel direct write at `Window_PreviewMouseWheel:1636`; `SetOpacity` multiplies through `_currentRatio` at line 1492; contrast-skip predicate reads `_currentRatio > 0.0` at line 179
- Pure-static `LerpRatio` helper reachable from `FuzzyClock.App.Tests` via existing `InternalsVisibleTo` (ROADMAP success criterion #4 — feeds Phase 87 unit-test bodies)

The four advisory WARNINGs from `86-REVIEW.md` are tracked above for follow-up consideration. WR-01 (stale baseline post-convergence) is the most user-visible — a one-time ~78% lerp jump on first re-engagement after a long idle — but bounded by the 100 ms `Math.Clamp` defensive bound. The phase's success criteria do not require zero-jump first-re-engagement, only frame-rate-driven smoothness and terminal-state snap, both of which hold.

Phase 87 owns:
- `LerpRatio` unit-test bodies (TEST-02)
- Full 578-test regression suite (TEST-04)
- PERF-01 manual smoothness check under sustained 25-50% CPU load
- Resolution of the human-verification items listed above

---

_Verified: 2026-05-20T12:00:00Z_
_Verifier: Claude (gsd-verifier)_
_Build: dotnet build FuzzyClock.slnx → 0 Warnings, 0 Errors_
_Tests: 129 / 129 App + 449 / 449 Core = 578 / 578 baseline preserved_
