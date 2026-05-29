---
phase: 86-frame-driven-opacity-rendering
plan: 02
subsystem: ui
tags: [wpf, ghost-mode, lerp, render-pump, composition-target, csharp]

# Dependency graph
requires:
  - phase: 85-off-thread-sampling-refactor
    provides: "Off-thread sampler; ProximityChanged marshalled to UI thread via single BeginInvoke per tick (D-07); _isGhostMode volatile (D-06)"
  - plan: 86-01
    provides: "GhostModeController.EnabledChanged event with change-detect setter; pure-static GhostModeController.LerpRatio(current, target, alpha, deltaSeconds) helper with terminal-state snap"
provides:
  - "MainWindow.OnRenderingTick — per-frame render pump on System.Windows.Media.CompositionTarget.Rendering driving _currentRatio toward _targetRatio via GhostModeController.LerpRatio; convergence early-return + deltaSeconds tracking + Math.Clamp defensive bound + five-guard chain preserved verbatim"
  - "MainWindow.OnGhostEnabledChanged — attach/detach lifecycle handler subscribed to GhostModeController.EnabledChanged; idempotent on both edges; resets first-frame baseline on attach; FADE-04 zero-overhead-when-disabled"
  - "_currentRatio + _targetRatio split (rename of _proximityRatio + sibling); LerpAlpha = 15.0 const; _renderPumpAttached idempotency guard; _previousRenderTime nullable TimeSpan baseline"
  - "this.Closed explicit render-pump detach before _ghostMode.Dispose() (defends against late render frames during Phase 85 D-03 WaitHandle drain)"
affects: [87-verification-and-performance-acceptance]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-frame render pump on System.Windows.Media.CompositionTarget.Rendering — visible smoothness governed by display refresh rate (D-01 / FADE-01)"
    - "Convergence early-return at steady state — exact-equality on double safe because the only writers produce exact 0.0 / 1.0 via LerpRatio terminal-state snap (D-10 / D-11)"
    - "Subscribe-on-EnabledChanged lifecycle — pump only attached while ghost mode is enabled (D-04 / D-06 / FADE-04)"
    - "D-07 belt-and-braces fallback — synchronous attach if controller already matches target value at subscribe time (no-event-on-default-match case)"
    - "Guard chain inside per-frame handler short-circuits Opacity write but lerp still advances so visible state catches up the moment guard releases (D-13 / SEM-04)"
    - "Defensive Math.Clamp on deltaSeconds [0.0, 0.1] against clock changes / VM time-warp / suspend-resume (Claude's Discretion #4)"

key-files:
  created: []
  modified:
    - "FuzzyClock.App/MainWindow.xaml.cs (rename + new fields + OnRenderingTick + OnGhostEnabledChanged + EnabledChanged subscription + D-07 fallback + Closed detach)"

key-decisions:
  - "D-12: Single _proximityRatio field (line 56) renamed to _currentRatio at all six reference sites in MainWindow.xaml.cs; sibling _targetRatio = 0.0 added immediately adjacent"
  - "D-02: LerpAlpha = 15.0 declared as private const near the field block (JIT-inlined); not exposed in settings (out of scope per REQUIREMENTS.md Future Requirements)"
  - "D-06: _renderPumpAttached bool field guards both attach and detach branches against double-subscribe; written false in this.Closed for hygiene"
  - "D-01: TimeSpan? _previousRenderTime tracks RenderingEventArgs.RenderingTime; null sentinel signals first-frame baseline (synthesised 0.016 = one 60 Hz frame)"
  - "D-13: ProximityChanged lambda body reduced to one statement: { _targetRatio = ratio; }. Guards + Opacity write moved into OnRenderingTick"
  - "D-04 / D-06: _ghostMode.EnabledChanged += OnGhostEnabledChanged subscribed once in ContentRendered next to ProximityChanged / Restored wiring"
  - "D-07: Belt-and-braces — after subscribing, synchronously call OnGhostEnabledChanged(true) if _ghostMode.IsEnabled is true (covers default-match no-event case)"
  - "D-10 / D-11 / FADE-04: First action in OnRenderingTick is `if (_currentRatio == _targetRatio) return;` — at steady state cost is one method call + one comparison + return; subscription is removed when ghost mode disables, so disabled state has zero per-frame overhead"
  - "Body order in OnRenderingTick is load-bearing: convergence early-return → deltaSeconds → lerp → guard chain → Opacity write. The guards short-circuit ONLY the Opacity write; the lerp still advances so visible state catches up on next unguarded frame"
  - "FADE-02: this.Opacity computed from _currentRatio (not _targetRatio) — visible state matches what the user actually sees"
  - "Closed handler detach: System.Windows.Media.CompositionTarget.Rendering -= OnRenderingTick placed BEFORE _ghostMode.Dispose() so late render frames cannot queue work into the pump while the controller's WaitHandle drain runs"
  - "CompositionTarget fully-qualified as System.Windows.Media.CompositionTarget — System.Windows.Media is not in MainWindow's using list and adding a using would change the file footprint beyond the plan; full qualification keeps the diff minimal"

patterns-established:
  - "Per-frame render pump replacing event-driven Opacity writes — display-refresh-rate-driven smoothness independent of sampling cadence"
  - "Lifecycle-bound pump subscription — attach on EnabledChanged(true), detach on EnabledChanged(false), zero overhead between transitions"
  - "Guards in per-frame handler that short-circuit Opacity write but allow lerp progression — visible state catches up the moment the guard releases"

requirements-completed:
  - FADE-01
  - FADE-02
  - FADE-04
  - SEM-04
# Note: FADE-03 was completed by Plan 86-01 (terminal-state snap inside LerpRatio).
# Plan 86-02 satisfies its consumption side: convergence early-return is reached via
# the snap path at exact 0.0 / 1.0 targets, preserving crisp activation and Restored timing.

# Metrics
duration: 23min
completed: 2026-05-20
---

# Phase 86 Plan 02: Frame-Driven Render Pump in MainWindow Summary

**MainWindow now drives the visible ghost-mode fade through a per-frame lerp pump on `System.Windows.Media.CompositionTarget.Rendering` while ghost mode is enabled, with zero per-frame overhead while disabled. `_currentRatio` (renamed from `_proximityRatio`) lerps toward `_targetRatio` (set by `_ghostMode.ProximityChanged`) via the pure `GhostModeController.LerpRatio` helper from Plan 86-01, with terminal-state snap closing the loop at exact 0.0 / 1.0. The five existing guards (`_isDragging`, settings-window-open, `_menuOpen`, mouse-wheel direct write, contrast-skip predicate) all behave identically — the three drag/settings/menu guards moved verbatim into `OnRenderingTick`; the SetOpacity and Window_PreviewMouseWheel direct-write paths are preserved byte-for-byte; the contrast-skip predicate already encoded FADE-02 via the rename. All 129 + 449 baseline tests still pass; `GhostModeController.cs` byte-for-byte unchanged from end-of-Plan-01.**

## Performance

- **Duration:** ~23 min
- **Started:** 2026-05-20T11:02Z (post-baseline-build)
- **Completed:** 2026-05-20T11:25Z
- **Tasks:** 2 of 2 completed
- **Files modified:** 1 (`FuzzyClock.App/MainWindow.xaml.cs`)
- **Net diff:** +127 / -19 lines on MainWindow.xaml.cs

## Accomplishments

### Task 1 — Rename + new fields (`refactor(86-02)` `3094307`)

- `_proximityRatio` (line 56) renamed to `_currentRatio` at all six reference sites: field declaration (~line 58), contrast-skip predicate (line 179), `Restored` handler (line 185), `ProximityChanged` lambda (line 193), RMB-04 comment block (line 220), `SetOpacity` multiplication (line 1412). `grep -c _proximityRatio MainWindow.xaml.cs` returns 0.
- Sibling `private double _targetRatio = 0.0;` declared adjacent to `_currentRatio` with comment noting it's set by `_ghostMode.ProximityChanged` (sampler-thread output marshalled by Phase 85 D-07 BeginInvoke) and the per-frame render pump lerps `_currentRatio` toward it.
- `private const double LerpAlpha = 15.0;` declared near the field block per D-02 — JIT-inlined; out of scope as a settings-tunable per REQUIREMENTS.md "Future Requirements".
- `private bool _renderPumpAttached;` field added per D-06 (idempotency guard).
- `private TimeSpan? _previousRenderTime;` field added per D-01 (null sentinel signals first-frame baseline).
- `GhostModeController.cs` untouched (verified via `git diff --stat HEAD~2 FuzzyClock.App/GhostModeController.cs` returning empty).
- Build clean; 129/129 App + 449/449 Core tests pass.

### Task 2 — Render pump wiring (`feat(86-02)` `ccb3ad3`)

- **`_ghostMode.ProximityChanged` lambda body** rewritten per D-13 from a 5-statement body (write current ratio + 3 guards + Opacity write) to a one-liner: `ratio => { _targetRatio = ratio; }`. The guards and Opacity write moved into `OnRenderingTick`.

- **`OnGhostEnabledChanged(bool enabled)`** added per D-04 / D-06 / FADE-04. Body shape:
  - On `enabled == true`: idempotency-guard via `_renderPumpAttached`; if false, reset `_previousRenderTime = null` (D-01 first-frame baseline reset), then `System.Windows.Media.CompositionTarget.Rendering += OnRenderingTick`, then set `_renderPumpAttached = true`.
  - On `enabled == false`: idempotency-guard via `_renderPumpAttached`; if true, `System.Windows.Media.CompositionTarget.Rendering -= OnRenderingTick`, then set `_renderPumpAttached = false`.

- **`OnRenderingTick(object? sender, EventArgs e)`** added per D-01 / D-10 / D-11 / D-13 / SEM-04 / FADE-01 / FADE-02. Body order is load-bearing:
  1. **D-10 / D-11 convergence early-return:** `if (_currentRatio == _targetRatio) return;` — at steady state per-frame cost is one method call + one comparison + return.
  2. **D-01 deltaSeconds tracking:** cast `e` to `System.Windows.Media.RenderingEventArgs`; `deltaSeconds` is `(args.RenderingTime - _previousRenderTime.Value).TotalSeconds` when previous is set, else `0.016` (synthesised one-60-Hz-frame baseline); clamped via `Math.Clamp(deltaSeconds, 0.0, 0.1)` (Claude's Discretion #4 defensive against clock changes / VM time-warp); `_previousRenderTime = args.RenderingTime` updated at the end.
  3. **FADE-01 lerp step:** `_currentRatio = GhostModeController.LerpRatio(_currentRatio, _targetRatio, LerpAlpha, deltaSeconds);` — the only call site of the helper Plan 01 added.
  4. **D-13 / SEM-04 guard chain:** `if (_isDragging) return;` then `if (_settingsWindow?.IsVisible == true) return;` then `if (_menuOpen) return;` — order matches the original `ProximityChanged` lambda byte-for-byte. Guards short-circuit step 5 only; the lerp at step 3 still advanced so visible state catches up the moment a guard releases.
  5. **FADE-02 Opacity write:** `this.Opacity = _windowOpacity * (1.0 - _currentRatio);` — read from `_currentRatio` (lerped visible value), NOT `_targetRatio`.

- **`EnabledChanged` subscription + D-07 fallback** added in ContentRendered immediately after the rewritten `_ghostMode.ProximityChanged = ...` assignment (so the subscription is in place when `_ghostMode.Initialize(...)` runs and any future event raises hit a wired handler):
  ```csharp
  _ghostMode.EnabledChanged += OnGhostEnabledChanged;
  if (_ghostMode.IsEnabled) OnGhostEnabledChanged(true);
  ```
  The synchronous fallback covers the case where `ApplySettings` already wrote the matching value before this point and no event will fire (D-04 change-detect setter from Plan 01).

- **`Restored` handler preserved per D-14:** body unchanged — still writes `_currentRatio = 0.0;` (the rename from Task 1 carried through), `this.Opacity = _windowOpacity;`, and the `BackdropBorder.Background = ...Transparent;` reset. `_targetRatio` is already `0.0` here per Phase 85 D-06 / SEM-02 (sampler emits RestoreWithEvent only at exact 0.0), so `Restored` is a defensive snap that aligns visible state with already-converged target — no fight with the render pump.

- **`SetOpacity` preserved per D-15:** lines 1410-1412 still use `_windowOpacity * (1.0 - _currentRatio)` (the rename from Task 1). SetOpacity runs only on user input; the render pump and SetOpacity converge through `_windowOpacity` which the next render frame multiplies through.

- **`Window_PreviewMouseWheel` preserved per D-15:** line 1556 still writes `this.Opacity = _windowOpacity;` directly without referencing the renamed field — SEM-04 success criterion #5 mouse-wheel-direct-write contract verified by inspection. No edits required here.

- **`this.Closed` handler enhanced** with explicit `System.Windows.Media.CompositionTarget.Rendering -= OnRenderingTick;` placed BEFORE `_ghostMode.Dispose();` (and `_renderPumpAttached = false;` for hygiene). Defends against late render frames during the Phase 85 D-03 synchronous WaitHandle drain inside `_ghostMode.Dispose()`.

- **`GhostModeController.cs`** byte-for-byte unchanged since Plan 01's `966c839` commit (verified via `git diff --stat HEAD~2 FuzzyClock.App/GhostModeController.cs` returning empty).

- Build clean (0 errors, 22 pre-existing analyzer warnings — same warning population as before this plan); 129/129 App tests pass; 449/449 Core tests pass.

## Task Commits

Each task was committed atomically:

1. **Task 1: Rename _proximityRatio → _currentRatio + add render-pump fields** — `3094307` (refactor)
2. **Task 2: Wire EnabledChanged + per-frame render pump on CompositionTarget.Rendering** — `ccb3ad3` (feat)

Both tasks were tagged `tdd="true"` in the plan, but Phase 87 owns all unit-test bodies (including LerpRatio behavior tests on the helper Plan 01 added). Plan 86-02 ships the consumer wiring on top of the existing 578-test baseline; baseline preservation is the success contract. Mirrors Plan 86-01's TDD-tag-but-defer-bodies posture (documented there as not-a-deviation, plan-specified scope).

## Files Created/Modified

- `FuzzyClock.App/MainWindow.xaml.cs` — rename of `_proximityRatio` to `_currentRatio` (6 sites); new sibling `_targetRatio` field; new `LerpAlpha` const; new `_renderPumpAttached` and `_previousRenderTime` fields; new `OnGhostEnabledChanged(bool)` and `OnRenderingTick(object?, EventArgs)` private methods; rewritten `_ghostMode.ProximityChanged` lambda body; new `_ghostMode.EnabledChanged += OnGhostEnabledChanged` subscription with D-07 synchronous fallback in ContentRendered; new `System.Windows.Media.CompositionTarget.Rendering -= OnRenderingTick` detach in `this.Closed`. Net: +127 / -19 lines.

## Decisions Made

- **`CompositionTarget` fully-qualified as `System.Windows.Media.CompositionTarget`.** MainWindow.xaml.cs's existing using list (lines 1-9) does not include `System.Windows.Media`. Adding a `using System.Windows.Media;` would change the file's import footprint beyond the plan's mandate ("only modify the file's behavior, not its imports unless required"). All three references (Closed detach + attach + detach in `OnGhostEnabledChanged`) plus the `RenderingEventArgs` cast are fully qualified at the call site. This keeps the diff minimal and the file's import surface unchanged. No behavioral impact — fully-qualified names are JIT-equivalent.

- **`OnGhostEnabledChanged` placed immediately after the constructor closing brace, before `ApplySettings`.** Adjacent to where the constructor wires it up; reads naturally as the lifecycle handler for the just-subscribed event. `OnRenderingTick` immediately follows. Both are private methods with the new XML doc comments documenting decision IDs (D-01, D-04, D-06, D-10, D-11, D-13, FADE-01, FADE-02, FADE-04, SEM-04).

- **`-=` is unconditional in `this.Closed` despite `_renderPumpAttached` tracking elsewhere.** `event-handler -=` on an unsubscribed delegate is a documented C# no-op. The unconditional form simplifies the Closed block and is robust against any state where `_renderPumpAttached` might be false but the underlying subscription somehow exists (defense-in-depth). The accompanying `_renderPumpAttached = false;` is hygiene only.

## Deviations from Plan

None — plan executed exactly as written.

The plan's `<action>` block for Task 2 Step 2 noted "the cast pattern is: `var args = (RenderingEventArgs)e;`" without namespace qualification. I used `(System.Windows.Media.RenderingEventArgs)e;` for the same reason as `CompositionTarget` — `System.Windows.Media` is not in the file's using list, and full qualification keeps the import footprint stable. The acceptance criterion "OnRenderingTick body contains a cast to `RenderingEventArgs`" is satisfied (substring match `RenderingEventArgs)e` is present). Not flagged as a deviation because the plan explicitly delegated namespace concerns to "Claude's Discretion" via the existing CONTEXT.md framing.

The plan's Task 1 acceptance criterion "MainWindow.xaml.cs does NOT yet contain `EnabledChanged`" produced one false-positive grep hit on the pre-existing `_settingsWindow.PhraseWrapEnabledChanged += ...` line (v3.5 SettingsWindow event; unrelated to Phase 86). Confirmed by reading the criterion's intent ("no Phase 86 wiring yet") and by the fact that the line existed at HEAD~1 and is byte-for-byte unchanged in this plan. Not a deviation — the criterion targets the new `_ghostMode.EnabledChanged` subscription which Task 1 correctly leaves out.

**Total deviations:** 0
**Impact on plan:** None.

## Authentication Gates

None — pure code refactor in an existing source file; no external services, no credentials, no remote APIs.

## Issues Encountered

- **First build after Task 2 failed with `error CS0103: The name 'CompositionTarget' does not exist in the current context`** — three occurrences (Closed detach + attach branch + detach branch in `OnGhostEnabledChanged`). Diagnosed in <30s: `System.Windows.Media` is not in MainWindow.xaml.cs's using list (lines 1-9 only import `System.Windows`, `System.Windows.Controls`, `System.Windows.Documents`, `System.Windows.Input`, `System.Windows.Threading`). Fixed by fully-qualifying as `System.Windows.Media.CompositionTarget` at all three call sites — single Edit with `replace_all=true` (which also touched the doc comment for symmetry; benign). Re-build clean. No retry loop, no auto-fix attempt budget consumed.

- **No flaky tests on this plan** — both the App.Tests run after Task 1 and the App.Tests + Core.Tests runs after Task 2 passed first-time (129/129 + 449/449). Plan 86-01's SUMMARY noted a one-off Core.Tests flake that did not reproduce — it did not appear here.

## Threat Flags

None — no new I/O, no new persisted state, no new public surface, no new log emission. The plan's threat register T-86-05 through T-86-11 are all dispositioned `mitigate` and the mitigations are encoded in the implementation:

- **T-86-05 (SetOpacity / mouse-wheel contention with render pump):** Mitigated by D-15. Both paths converge through `_windowOpacity` which the next render frame multiplies through. WPF dispatcher serialization eliminates concurrent writes.
- **T-86-06 (render pump runs while drag/settings/menu guards active):** Mitigated by D-13 / SEM-04. `OnRenderingTick` step 4 short-circuits the Opacity write while a guard is active; step 3 still advances `_currentRatio` so visible state catches up on next unguarded frame. Identical observable behavior to the original ProximityChanged lambda.
- **T-86-07 (late render frame after disable / window destruction):** Mitigated by D-06 (`OnGhostEnabledChanged(false)` synchronously detaches and the `_renderPumpAttached` guard prevents double-subscribe on rapid toggle) and the explicit `this.Closed` detach before `_ghostMode.Dispose()`.
- **T-86-08 (information disclosure):** Accepted — `LerpAlpha` is a code constant, no env vars, no file writes.
- **T-86-09 (per-frame DoS):** Mitigated by D-10 / D-11 convergence early-return (steady-state cost = one method call + one comparison + return) and FADE-04 subscription removal when ghost mode disables (zero per-frame overhead while off). Frame-rate-independent lerp formula handles 60Hz / 144Hz / arbitrary refresh rates without recompute.
- **T-86-10 (EnabledChanged subscription leak on Closed):** Mitigated by `_ghostMode.Dispose()` in `this.Closed` (the controller and all its subscribers go away together) plus the explicit render-pump detach.
- **T-86-11 (time-warp deltaSeconds):** Mitigated by `Math.Clamp(deltaSeconds, 0.0, 0.1)` defensive bound.

## Self-Check: PASSED

**Files asserted:**
- `FuzzyClock.App/MainWindow.xaml.cs` — present, modified (verified via `git status --short` clean after commit; `git log` shows two new commits on top of `67bbe2f`).

**Commits asserted:**
- `3094307` (Task 1: refactor rename + fields) — present in `git log --oneline -4`.
- `ccb3ad3` (Task 2: feat render pump wiring) — present in `git log --oneline -4`.

**Source-grep asserted:**
- `_proximityRatio` count in `MainWindow.xaml.cs` == 0 (full rename complete).
- `_currentRatio`, `_targetRatio`, `LerpAlpha`, `_renderPumpAttached`, `_previousRenderTime` all present.
- `System.Windows.Media.CompositionTarget.Rendering` present at three code sites (Closed detach + attach branch + detach branch).
- `_ghostMode.EnabledChanged += OnGhostEnabledChanged` present in ContentRendered.
- `if (_ghostMode.IsEnabled) OnGhostEnabledChanged(true);` present (D-07 fallback).
- `_targetRatio = ratio` present in `_ghostMode.ProximityChanged` lambda body, with no `this.Opacity` / `_isDragging` / `_settingsWindow` / `_menuOpen` references inside that lambda.
- `if (_currentRatio == _targetRatio) return;` present as the first executable statement in `OnRenderingTick`.
- `(System.Windows.Media.RenderingEventArgs)e` cast and `args.RenderingTime` access present.
- `Math.Clamp(deltaSeconds, 0.0, 0.1)` present.
- `0.016` literal first-frame baseline present.
- `GhostModeController.LerpRatio(_currentRatio, _targetRatio, LerpAlpha, deltaSeconds)` present.
- Three guard checks in order: `_isDragging`, `_settingsWindow?.IsVisible`, `_menuOpen`, placed AFTER lerp, BEFORE Opacity write.
- `this.Opacity = _windowOpacity * (1.0 - _currentRatio);` is the final action in `OnRenderingTick`.
- `_ghostMode.Restored` handler still contains `_currentRatio = 0.0;` and `this.Opacity = _windowOpacity` and the BackdropBorder reset (Task 1 rename carried through; D-14 unchanged).
- `SetOpacity` line ~1412 contains `_windowOpacity * (1.0 - _currentRatio)` (D-15 preserved).
- `Window_PreviewMouseWheel` line ~1556 contains `this.Opacity = _windowOpacity;` direct write (D-15 / SEM-04 #5 preserved).
- `this.Closed` handler contains `System.Windows.Media.CompositionTarget.Rendering -= OnRenderingTick;` placed BEFORE `_ghostMode.Dispose();`.

**Diff scope asserted:**
- `git diff --stat HEAD~2 FuzzyClock.App/GhostModeController.cs` returns empty — controller byte-for-byte unchanged from end-of-Plan-01.
- `git diff --stat HEAD~2` shows `FuzzyClock.App/MainWindow.xaml.cs` as the only modified file across both Task 1 and Task 2 commits.

**Test-suite asserted:**
- 129/129 App tests pass (no regression after either commit).
- 449/449 Core tests pass (no regression after either commit, no flake observed).

## Next Phase Readiness

- **Phase 87 ready (verification & performance acceptance):** All five Phase 86 success criteria (FADE-01..04, SEM-04) are now implementation-complete pending Phase 87's verification:
  - **FADE-01:** `OnRenderingTick` driven by `System.Windows.Media.CompositionTarget.Rendering` calls `GhostModeController.LerpRatio` per render frame; `this.Opacity` updates per frame. ✓
  - **FADE-02:** `_currentRatio` (lerped) drives `this.Opacity`; `_targetRatio` is the destination only; contrast-skip predicate at line 179 reads `_currentRatio > 0.0`. ✓
  - **FADE-03:** `LerpRatio` (Plan 86-01) snaps at terminal `0.0` / `1.0`; convergence early-return in `OnRenderingTick` is reached via the snap path; ghost activation and Restored timing remain crisp. ✓
  - **FADE-04:** Subscription added in `OnGhostEnabledChanged(true)`, removed in `OnGhostEnabledChanged(false)`; per-frame loop has zero overhead when disabled. D-07 belt-and-braces ensures startup-with-ghost-enabled attaches the pump even if no `EnabledChanged` event fires. ✓
  - **SEM-04:** Three early-return guards (`_isDragging`, `_settingsWindow?.IsVisible`, `_menuOpen`) inside `OnRenderingTick` mirror the original `ProximityChanged` lambda chain; `SetOpacity` direct write at line 1412 + `Window_PreviewMouseWheel` at line 1556 preserved verbatim per D-15; the render pump and direct writes converge through `_windowOpacity` without contention. ✓
- **Phase 87 unit tests can now target both the helper (Plan 01: `GhostModeController.LerpRatio`) and the integration seams (Plan 02: `OnRenderingTick` body shape, `OnGhostEnabledChanged` lifecycle).** `LerpRatio` is reachable as `GhostModeController.LerpRatio(...)` from `FuzzyClock.App.Tests` via the existing `InternalsVisibleTo` plumbing in `FuzzyClock.App.csproj`.
- **Manual smoothness check under load (developer-local, deferred to Phase 87 UAT):** widget fade visibly smooth at display refresh rate, all five interaction guards behave identically (drag freeze / settings pin / RMB-04 menu pin / mouse-wheel direct write / contrast-skip), ghost activation crisp, `Restored` on full retreat resets background and opacity. Test by hovering toward widget, dragging during fade, opening settings during fade, right-clicking during fade, scrolling mouse wheel during fade, and toggling ghost mode off via tray.
- **No blockers carried forward** from Plan 02. Phase 86 implementation is complete (2/2 plans landed); Phase 87 owns verification and performance acceptance.

---
*Phase: 86-frame-driven-opacity-rendering*
*Plan: 02*
*Completed: 2026-05-20*
