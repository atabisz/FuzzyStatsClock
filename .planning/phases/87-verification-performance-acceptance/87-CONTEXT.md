# Phase 87: Verification & performance acceptance - Context

**Gathered:** 2026-05-20
**Status:** Ready for planning

<domain>
## Phase Boundary

The new threading + rendering model from Phases 85 and 86 is locked in by automated tests and human-observed smoothness. Two new test classes cover the pure-static seams introduced by those phases (`OnSampleTick` from Phase 85 D-04; `LerpRatio` from Phase 86 D-08/D-09); the existing 578-test suite is run as-is to prove no regressions; one user-visible bug surfaced in Phase 86 review (WR-04 mid-fade toggle-off stranding) is patched inside this phase as a small in-scope production-code change; a manual run with sustained 25–50% CPU load gives PERF-01 its evidence.

This phase delivers:
- New test class `LerpRatioTests` in `FuzzyClock.App.Tests`, covering the FADE-03 / D-03 terminal-state-snap invariant of the pure-static `GhostModeController.LerpRatio` helper
- New test class `OnSampleTickTests` in `FuzzyClock.App.Tests`, covering the four `GhostTransition` classes (None / Activate / RestoreNoEvent / RestoreWithEvent) emitted by the pure-static `GhostModeController.OnSampleTick` seam — proving SEM-01 / SEM-02 are reachable without spinning real timers or threads
- A one-keyword visibility relaxation on `GhostModeController._isGhostMode` (`private volatile bool` → `internal volatile bool`) so the seam tests can directly drive `_isGhostMode = true` for the RestoreNoEvent / RestoreWithEvent setup
- A targeted fix for Phase 86 WR-04 inside `MainWindow.OnGhostEnabledChanged(false)` — zero `_currentRatio` and `_targetRatio`, write `this.Opacity = _windowOpacity` when not pinned by the settings-window — so disabling ghost mid-fade does not leave the widget half-transparent
- A green run of the full MSTest suite (`FuzzyClock.Core.Tests` + `FuzzyClock.App.Tests`) at milestone end with at least 578 tests passing, satisfying TEST-01 / TEST-04
- A written attestation in `87-VERIFICATION.md` with PERF-01 evidence (load level reached, monitor refresh rate, subjective smoothness verdict, sign-off line)

This phase does **not** deliver:
- Fixes for Phase 86 WR-01 / WR-02 / WR-03 (smoothness blemish on first-post-convergence frame, stale RMB-04 comment, asymmetric subscription cleanup) — deferred; not user-visible, below the verification mandate
- Coverage for `OnSampleTick` modifier-force-zero, !IsEnabled disable-gate, or `RatioChanged` flag — covered by other tests or below TEST-03's stated goal of seam reachability
- Coverage for `LerpRatio` convergence shape, step-size bounds, or numerical edges — over-spec for a 13-line pure helper whose only consumer-relied invariant is the snap
- New production code beyond the WR-04 fix and the `_isGhostMode` visibility relaxation
- A user-facing tunable for any of the lerp / cadence parameters (REQUIREMENTS.md "Future Requirements" — explicit YAGNI for v4.4)
- An automated PERF-01 acceptance — the requirement is observation-only by design

</domain>

<decisions>
## Implementation Decisions

### LerpRatio test scope (TEST-02)
- **D-LERP-01:** `LerpRatioTests` covers terminal-state snap **only**. Cases: target=1.0 returns 1.0 exactly across multiple `current` values (e.g. 0.0, 0.5, 0.999, 1.0); target=0.0 returns 0.0 exactly across multiple `current` values; target mid-range (e.g. 0.5) does NOT return target — the snap is target-driven, not current-driven. Convergence shape, step-size bounds, and numerical edges (NaN, Infinity, alpha=0, deltaSeconds=0/negative) are intentionally skipped — over-spec for a 13-line pure helper. Mid-range fade progression is implicitly verified by PERF-01 manual smoothness check.
- **D-LERP-02:** Single `[TestMethod]` + single `[DataRow]` table for terminal-snap coverage, mirroring the existing `GhostModeControllerProximityTests.ComputeProximityRatio_VariousPositions` style at [FuzzyClock.App.Tests/GhostModeControllerProximityTests.cs:13-26](../../../FuzzyClock.App.Tests/GhostModeControllerProximityTests.cs#L13-L26). Whether the table uses an `expectedSnapped` bool column with a branched assertion, or splits into two methods + a non-snap method — implementer's choice (Claude's Discretion); both satisfy D-LERP-01.

### OnSampleTick seam test scope (TEST-03)
- **D-SEAM-01:** `OnSampleTickTests` covers the four `GhostTransition` values **only**: (None) cursor far away while `!_isGhostMode`; (Activate) cursor at center while `!_isGhostMode`; (RestoreNoEvent) cursor at mid-range while `_isGhostMode == true` (ratio in (0.0, 1.0)); (RestoreWithEvent) cursor far away while `_isGhostMode == true` (ratio == 0.0). Maps to TEST-03's stated purpose (seam reachable without timers/threads) and to SEM-01/SEM-02 (transition vocabulary). Modifier-force-zero (SEM-03), !IsEnabled disable-gate (SEM-05), and the `RatioChanged` flag are intentionally skipped: SEM-03 is already covered by [GhostModeControllerTests.IsModifierHeld_VariousConfigs](../../../FuzzyClock.App.Tests/GhostModeControllerTests.cs#L18-L26); SEM-05 / RatioChanged are below TEST-03's stated goal. If future regressions slip through, those become candidate plus-tests.
- **D-SEAM-02:** Tests directly write `controller._isGhostMode = true;` before calling `OnSampleTick(...)` to set up the RestoreNoEvent / RestoreWithEvent rows. Each test row is one `OnSampleTick` call with explicit setup — no Activate-then-Restore call sequencing that would couple a row's assertion to a prior call's correctness. `InternalsVisibleTo("FuzzyClock.App.Tests")` already in place at [FuzzyClock.App.csproj:7-11](../../../FuzzyClock.App/FuzzyClock.App.csproj#L7-L11) makes the field reachable once it's promoted to `internal`.
- **D-SEAM-02b:** Phase 87 relaxes `GhostModeController._isGhostMode` from `private volatile bool` to `internal volatile bool` at [GhostModeController.cs:70](../../../FuzzyClock.App/GhostModeController.cs#L70) — visibility-only change, no semantic change. Phase 85 D-06 ownership rule (sampler writes `false`, `Activate()` writes `true`) is unaffected: the `internal` accessor does not change which production methods write the field. Test code is the only new writer, and only for setup. Existing `public bool IsActive => _isGhostMode;` getter is preserved unchanged.

### PERF-01 methodology (PERF-01)
- **D-PERF-01:** Load generator is PowerShell `while ($true) {}` in 1–2 windows targeting ~25–50% sustained CPU on the test box (one window per ~12.5% on a typical 8-core dev box). Zero install cost, controllable (close window = stop), no admin. Pure single-thread CPU spin matches PERF-01's "CPU contention" wording exactly. Alternatives (prime95, custom dotnet stressor, `dotnet build` loop) considered and rejected as over-engineering for a one-shot manual check.
- **D-PERF-02:** PERF-01 evidence is a written attestation in `87-VERIFICATION.md` capturing: (1) load level reached as observed in Task Manager Performance tab (e.g. "32% sustained over 30 s"), (2) monitor refresh rate (e.g. "144 Hz primary"), (3) subjective smoothness verdict (one of: "smooth" / "barely-stepping" / "clearly-stepping"), (4) explicit sign-off line. Matches the Phase 85 / Phase 86 `human_verification:` block shape. No video / screenshots required.

### Carry-forward gaps from Phase 86 review and human-UAT items
- **D-CARRY-01:** Phase 87 fixes Phase 86 WR-04 (mid-fade toggle-off stranding) inside its scope. Fix lands at [MainWindow.xaml.cs:260-275](../../../FuzzyClock.App/MainWindow.xaml.cs#L260-L275) `OnGhostEnabledChanged(false)` per the diff in `86-REVIEW.md` § WR-04: zero `_currentRatio = 0.0;` and `_targetRatio = 0.0;`, then write `this.Opacity = _windowOpacity;` if `_settingsWindow?.IsVisible != true` (preserve settings-window pin). Single concern: a known user-visible glitch (toggling ghost off mid-fade strands the widget half-transparent). Six-line patch. Bundled inside Phase 87 because shipping v4.4 with this glitch is the worse trade-off vs. expanding the verification phase by six lines.
- **D-CARRY-02:** Phase 86 WR-01 (stale `_previousRenderTime` baseline first-frame post-convergence — first lerp step can be ~78% of remaining gap due to clamp at 0.1 s), WR-02 (stale RMB-04 comment), and WR-03 (asymmetric event-unsubscribe symmetry in `Closed`) are deferred. Not user-visible. Not blocking PERF-01. Captured in deferred section for a future bugfix phase or v4.5 backlog.
- **D-CARRY-03:** PERF-01 manual run absorbs the 12 outstanding `human_verification:` items from Phase 85 (5 items) and Phase 86 (7 items, including PERF-01 sanity precursor) as observation opportunities. The PERF-01 attestation block in `87-VERIFICATION.md` adds a checklist noting which UAT items were observed in passing during the load run (e.g. drag-during-fade freeze, settings-window-during-fade pin, RMB-04 menu pin, mouse-wheel-during-fade direct write, toggle-off mid-fade recovery — now driven by the WR-04 fix). Items not observable from the load run scenario (e.g. clean shutdown via tray Exit) remain open as standalone verification artifacts for the human run.

### Test file organization (Claude's Discretion — record observed default)
- **D-FILES-01:** Two new test files `LerpRatioTests.cs` and `OnSampleTickTests.cs` in `FuzzyClock.App.Tests/`, mirroring the existing per-class pattern (`GhostModeControllerProximityTests.cs`, `GhostModeControllerTests.cs`). Both reach `internal static`/`internal` members of `GhostModeController` via the existing `InternalsVisibleTo("FuzzyClock.App.Tests")` plumbing at [FuzzyClock.App.csproj:7-11](../../../FuzzyClock.App/FuzzyClock.App.csproj#L7-L11). No `FuzzyClock.Core.Tests` placement — the helpers live on `GhostModeController` which lives in `FuzzyClock.App`.

### Plan structure (Claude's Discretion)
- **D-PLAN-01:** Plan structure is the planner's call. A single-plan Phase 87 covering all of D-LERP-01..02 + D-SEAM-01..02b + D-CARRY-01 + D-PERF-01..02 is acceptable; a 2-plan split (e.g. 87-01 tests + visibility relaxation; 87-02 WR-04 fix + PERF-01 manual run) is also acceptable. There are no hard ordering dependencies between the test additions and the WR-04 fix; PERF-01 manual run is a phase-end acceptance gate, not a plan-level deliverable.

### Claude's Discretion (carried forward / additional)
- Exact `[TestMethod]` and `[DataRow]` row counts in `LerpRatioTests` — pick what reads cleanly while exercising D-LERP-01 fully.
- Whether `OnSampleTickTests` uses one method per transition or a single parametric method with an `expectedTransition` column — the four-class invariant of D-SEAM-01 is what matters.
- Whether to factor the PERF-01 PowerShell load shell command into a `.ps1` script in `.planning/phases/87-verification-performance-acceptance/` for reproducibility, or just document the one-liner in `87-VERIFICATION.md`.
- Whether the WR-04 fix preserves any defensive null-check on `_settingsWindow` shape vs. simplifies — the existing handler shape at lines 260-275 dictates the surrounding context.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope, requirements, and traceability
- [.planning/ROADMAP.md](../../ROADMAP.md) — Phase 87 goal, success criteria #1–5, requirement mapping (TEST-01..04, PERF-01)
- [.planning/REQUIREMENTS.md](../../REQUIREMENTS.md) — TEST-01 (existing pure-static tests pass unchanged), TEST-02 (`LerpRatio` unit tests), TEST-03 (`OnSampleTick` tickable seam tests), TEST-04 (full MSTest suite green, ≥574 baseline), PERF-01 (manual 25–50% CPU smoothness check); out-of-scope: per-frame lerp speed tunable
- [.planning/STATE.md](../../STATE.md) — current milestone status (v4.4 33% complete, 1/3 phases), 578 MSTest baseline (449 Core + 129 App), Phase 85 and 86 completion summaries

### Carrying-forward decisions and verification reports
- [.planning/phases/85-off-thread-sampling-refactor/85-CONTEXT.md](../85-off-thread-sampling-refactor/85-CONTEXT.md) — the seam (`OnSampleTick`, `GhostTransition`, `SampleResult`) that TEST-03 targets; D-04 / D-06 ownership rules for `_isGhostMode`
- [.planning/phases/85-off-thread-sampling-refactor/85-VERIFICATION.md](../85-off-thread-sampling-refactor/85-VERIFICATION.md) — 5 `human_verification:` items absorbed into PERF-01 observation checklist per D-CARRY-03
- [.planning/phases/86-frame-driven-opacity-rendering/86-CONTEXT.md](../86-frame-driven-opacity-rendering/86-CONTEXT.md) — D-03 terminal snap invariant that TEST-02 targets; D-08 / D-09 `LerpRatio` placement and signature; D-13 ProximityChanged-lambda reduction (touched by WR-04 fix scope)
- [.planning/phases/86-frame-driven-opacity-rendering/86-VERIFICATION.md](../86-frame-driven-opacity-rendering/86-VERIFICATION.md) — 7 `human_verification:` items absorbed into PERF-01 observation checklist per D-CARRY-03
- [.planning/phases/86-frame-driven-opacity-rendering/86-REVIEW.md](../86-frame-driven-opacity-rendering/86-REVIEW.md) § WR-04 — exact fix diff (~6 lines) for D-CARRY-01; § WR-01 / WR-02 / WR-03 — explicitly deferred per D-CARRY-02

### Code touchpoints for Phase 87
- [FuzzyClock.App/GhostModeController.cs:70](../../../FuzzyClock.App/GhostModeController.cs#L70) — `_isGhostMode` field; D-SEAM-02b changes `private` → `internal` (one keyword)
- [FuzzyClock.App/GhostModeController.cs:62-68](../../../FuzzyClock.App/GhostModeController.cs#L62-L68) — `GhostTransition` enum + `SampleResult` record struct; consumed by `OnSampleTickTests` per D-SEAM-01
- [FuzzyClock.App/GhostModeController.cs:367](../../../FuzzyClock.App/GhostModeController.cs#L367) — `internal SampleResult OnSampleTick(...)` seam; tested per D-SEAM-01
- [FuzzyClock.App/GhostModeController.cs:475-487](../../../FuzzyClock.App/GhostModeController.cs#L475-L487) — `internal static double LerpRatio(double current, double target, double alpha, double deltaSeconds)` helper; tested per D-LERP-01
- [FuzzyClock.App/MainWindow.xaml.cs:260-275](../../../FuzzyClock.App/MainWindow.xaml.cs#L260-L275) — `OnGhostEnabledChanged(false)` branch; WR-04 fix lands here per D-CARRY-01

### Test patterns and infrastructure
- [FuzzyClock.App/FuzzyClock.App.csproj:7-11](../../../FuzzyClock.App/FuzzyClock.App.csproj#L7-L11) — `InternalsVisibleTo("FuzzyClock.App.Tests")` already configured; new `internal` reachability for `_isGhostMode` requires no csproj edit
- [FuzzyClock.App.Tests/GhostModeControllerProximityTests.cs](../../../FuzzyClock.App.Tests/GhostModeControllerProximityTests.cs) — DataRow parametric pattern; D-LERP-02 mirrors this style verbatim
- [FuzzyClock.App.Tests/GhostModeControllerTests.cs](../../../FuzzyClock.App.Tests/GhostModeControllerTests.cs) — `internal` member access pattern; new `OnSampleTickTests` follows the same approach including direct `controller._isGhostMode = true;` setup writes per D-SEAM-02
- [FuzzyClock.App.Tests/FuzzyClock.App.Tests.csproj](../../../FuzzyClock.App.Tests/FuzzyClock.App.Tests.csproj) — MSTest test project; new `LerpRatioTests.cs` and `OnSampleTickTests.cs` files added under the existing pattern (per-class file)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`InternalsVisibleTo` plumbing** at [FuzzyClock.App.csproj:7-11](../../../FuzzyClock.App/FuzzyClock.App.csproj#L7-L11) — already exposes internal members of `FuzzyClock.App` to `FuzzyClock.App.Tests`. The new test classes reach `LerpRatio`, `OnSampleTick`, `GhostTransition`, `SampleResult`, and the relaxed `_isGhostMode` field for free. No project-file changes.
- **`[DataRow]` parametric pattern** in `GhostModeControllerProximityTests` (12 rows on `ComputeProximityRatio`) and `GhostModeControllerTests` (8 rows on `IsModifierHeld`) — the new `LerpRatioTests` and `OnSampleTickTests` follow the same pattern, keeping the test corpus consistent with the existing 129-test App.Tests baseline.
- **`InternalsVisibleTo`-driven access pattern** — existing tests already construct a controller and read/exercise internal members directly (e.g. `controller.UpdateModifierConfig(...)`). The D-SEAM-02 direct-write `controller._isGhostMode = true;` follows the same shape; no test-only setter or factory needed.

### Established Patterns
- **Per-test-class file structure** in `FuzzyClock.App.Tests/` — one file per testable subject (`GhostModeControllerProximityTests.cs`, `GhostModeControllerTests.cs`, `AppSettingsTests.cs`, `RightClickMenuGateTests.cs`, etc.). D-FILES-01 follows this pattern: two new files (`LerpRatioTests.cs`, `OnSampleTickTests.cs`).
- **`_isGhostMode` ownership rule** (Phase 85 D-06) — sampler writes `false` (in `OnSampleTick`); `Activate()` writes `true`. Test-side direct writes for setup do not violate this rule because no production code path uses test-side writes; the rule constrains in-process producers, not external test setup.
- **Verification report shape** at [.planning/phases/86-frame-driven-opacity-rendering/86-VERIFICATION.md](../86-frame-driven-opacity-rendering/86-VERIFICATION.md) — `human_verification:` YAML block at the top, "Goal Achievement" + "Observable Truths" + "Required Artifacts" + "Key Link Verification" sections in the body. The PERF-01 attestation in `87-VERIFICATION.md` follows the same structure, with PERF-01 evidence captured in the body and the cross-phase UAT observation checklist appended.

### Integration Points
- **No `MainWindow` API changes** — the WR-04 fix is body-only inside `OnGhostEnabledChanged(false)`; no method signature changes, no new fields. Existing `_currentRatio` / `_targetRatio` fields (Phase 86 D-12) and `_windowOpacity` field (pre-Phase-86) are the only writers.
- **No `GhostModeController` API changes** — the only production-code change is `_isGhostMode` visibility. The `public IsActive` getter still works identically. No new methods, no new events, no new fields. Existing test patterns continue to use `controller.UpdateModifierConfig(...)`, `controller.IsModifierHeld()`, and the now-direct `controller._isGhostMode = true;` setup writes.
- **`dotnet test` baseline** — TEST-04 acceptance is `dotnet test FuzzyClock.sln --nologo --verbosity quiet` showing ≥578 passing, 0 failed. Two test files added per Phase 87 mean the new total is `578 + (LerpRatio rows) + (OnSampleTick rows)`. Approximate target: 4–8 LerpRatio cases (D-LERP-01) + 4 OnSampleTick cases (D-SEAM-01) → expected total ~586–590 tests at milestone end. Baseline preservation (existing 578) is the hard TEST-01 / TEST-04 invariant.

</code_context>

<specifics>
## Specific Ideas

- **D-LERP-02 model row layout** for `LerpRatioTests`:
  ```csharp
  [DataRow(1.0, 1.0, 15.0, 0.016, 1.0, DisplayName = "target=1.0, current=1.0 -> 1.0 (snap)")]
  [DataRow(1.0, 1.0, 15.0, 0.016, 0.5, DisplayName = "target=1.0, current=0.5 -> 1.0 (snap)")]
  [DataRow(1.0, 1.0, 15.0, 0.016, 0.0, DisplayName = "target=1.0, current=0.0 -> 1.0 (snap)")]
  [DataRow(0.0, 0.0, 15.0, 0.016, 0.0, DisplayName = "target=0.0, current=0.0 -> 0.0 (snap)")]
  [DataRow(0.0, 0.0, 15.0, 0.016, 0.5, DisplayName = "target=0.0, current=0.5 -> 0.0 (snap)")]
  [DataRow(0.0, 0.0, 15.0, 0.016, 1.0, DisplayName = "target=0.0, current=1.0 -> 0.0 (snap)")]
  ```
  Plus a separate `[TestMethod]` with one or two rows asserting `target = 0.5` does NOT return `0.5` (the formula returns `current + (target-current)*(1-exp(-15*0.016))` ≈ `current + (target-current) * 0.214`, so well-known intermediate value for a chosen current).
- **D-SEAM-01 model row layout** for `OnSampleTickTests`:
  ```csharp
  // Widget rect: 100x100 at (100,100). Cursor positions chosen via existing ComputeProximityRatio fixtures.
  // (cursorX, cursorY, isGhostModePre, expectedTransition)
  (50,  150, false, GhostTransition.None)             // far away, not ghost -> None
  (150, 150, false, GhostTransition.Activate)         // inside, not ghost   -> Activate
  (75,  150, true,  GhostTransition.RestoreNoEvent)   // mid-range, ghost    -> RestoreNoEvent (ratio = 0.5)
  (50,  150, true,  GhostTransition.RestoreWithEvent) // far away, ghost     -> RestoreWithEvent (ratio = 0.0)
  ```
  Setup pattern: `var c = new GhostModeController(); c._isGhostMode = isGhostModePre; var r = c.OnSampleTick(...); Assert.AreEqual(expectedTransition, r.Transition);`
- **D-CARRY-01 fix shape** (per `86-REVIEW.md` § WR-04, lightly normalized to match the existing handler conventions):
  ```csharp
  private void OnGhostEnabledChanged(bool enabled)
  {
      if (enabled) { /* existing attach branch unchanged */ return; }
      if (!_renderPumpAttached) return;
      System.Windows.Media.CompositionTarget.Rendering -= OnRenderingTick;
      _renderPumpAttached = false;
      _currentRatio = 0.0;
      _targetRatio  = 0.0;
      if (_settingsWindow?.IsVisible != true)
          this.Opacity = _windowOpacity;
  }
  ```
- **D-PERF-01 PowerShell one-liner** for repeatability:
  ```powershell
  powershell -NoProfile -Command "while ($true) {}"
  ```
  Run in 1 window for ~12.5% load on an 8-core box; 2 windows for ~25%; 4 windows for ~50%. Document the chosen window count in the PERF-01 attestation.
- **TEST-04 evidence one-liner** for the 87-VERIFICATION.md body:
  ```bash
  dotnet test FuzzyClock.sln --nologo --verbosity quiet
  ```
  Capture the `Passed: NNN, Failed: 0, Skipped: 0` line into the verification report.

</specifics>

<deferred>
## Deferred Ideas

- **Phase 86 WR-01 (stale `_previousRenderTime` baseline first-frame post-convergence)** — when the early-return path in `OnRenderingTick` runs at steady state and the next non-steady frame arrives, the cached `_previousRenderTime` is from many frames ago, so `deltaSeconds` clamps to 0.1 and the first lerp step is ~78% of remaining gap. Visible as a one-frame jump on first re-engagement after long idle. Fix: reset `_previousRenderTime = null` whenever the convergence early-return triggers, or always update `_previousRenderTime` even on the no-op path. Not user-visible enough to bundle into Phase 87.
- **Phase 86 WR-02 (stale RMB-04 comment in render pump handler)** — comment refers to the old ProximityChanged-lambda location of the `_menuOpen` guard. One-line doc update. Below verification mandate.
- **Phase 86 WR-03 (asymmetric event-unsubscribe symmetry in `Closed`)** — the explicit `CompositionTarget.Rendering -= OnRenderingTick` in the `Closed` handler doesn't have a matching `EnabledChanged -= OnGhostEnabledChanged` line. Not load-bearing because `_ghostMode.Dispose()` makes the controller unreachable, but symmetric cleanup is a maintenance signal. Defer.
- **Per-frame lerp speed exposed as a settings-backed tunable** — REQUIREMENTS.md "Future Requirements"; explicit YAGNI for v4.4. The `alpha = 15.0` constant lives in code only.
- **Automated PERF-01 acceptance via frame-time instrumentation** — could be done via a hidden diagnostic flag that logs frame deltas to a file, then a test asserts `p95(frame_delta) < 33ms` under load. Premature for v4.4; PERF-01 is observation-only by design.
- **Coverage for `OnSampleTick` modifier-force-zero (SEM-03), !IsEnabled disable-gate (SEM-05), and `RatioChanged` flag** — below TEST-03's stated goal of seam reachability. SEM-03 is already covered by `IsModifierHeld_VariousConfigs`. SEM-05 / RatioChanged become candidate plus-tests if a future regression exposes them.
- **Coverage for `LerpRatio` convergence shape, step-size bounds, numerical edges (NaN, Infinity, alpha=0, deltaSeconds=0/negative)** — over-spec for a 13-line pure helper. The terminal-snap invariant (D-LERP-01) is the only consumer-load-bearing contract.

</deferred>

---

*Phase: 87-Verification & performance acceptance*
*Context gathered: 2026-05-20*
