# Phase 87: Verification & performance acceptance - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-20
**Phase:** 87-verification-performance-acceptance
**Areas discussed:** LerpRatio test scope, OnSampleTick seam test scope, PERF-01 methodology, Carry-forward gaps

---

## Initial gray-area selection

| Option | Description | Selected |
|--------|-------------|----------|
| LerpRatio test scope | TEST-02: terminal snap, convergence shape, step-size bounds, numerical edges; DataRow vs scenario style | ✓ |
| OnSampleTick seam test scope | TEST-03: four transition classes, modifier force-zero, !IsEnabled, RatioChanged; parametric vs scenario | ✓ |
| PERF-01 methodology | Manual CPU-load smoothness check: load generator, evidence form, FPS measurement | ✓ |
| Carry-forward gaps | Phase 86 WR-01..04 + 12 human-UAT items: fix WR-04, defer rest, or fix all 4 | ✓ |

**User's choice:** All four selected (multiSelect).

---

## LerpRatio test scope

### Q1.1 — Which test families should `LerpRatioTests` cover?

| Option | Description | Selected |
|--------|-------------|----------|
| Terminal snap (Recommended) | TEST-02 + FADE-03 + D-03 hard requirement: target=1.0/0.0 returns target exactly; mid-range does not snap | ✓ |
| Convergence shape | Mid-range targets prove lerp moves current toward target; iterative convergence; formula match to 1e-9 | |
| Step-size bounds | ROADMAP success criterion #2: huge alpha*dt near target; tiny barely past current; deltaSeconds=0 / alpha=0 | |
| Numerical edges | NaN/Infinity, negative deltaSeconds, current==target mid-range, alpha negative | |

**User's choice:** Terminal snap only.
**Notes:** Convergence shape, step-size bounds, and numerical edges intentionally skipped — over-spec for a 13-line pure helper whose only consumer-relied invariant is the snap. Mid-range fade progression is implicitly verified by PERF-01 manual smoothness check.

### Q1.2 — How should the terminal-snap cases be parametrised?

| Option | Description | Selected |
|--------|-------------|----------|
| Single DataRow table (Recommended) | One `[TestMethod]` + one `[DataRow]` table covering target=1.0/0.0 + non-snap, mirrors `ComputeProximityRatio_VariousPositions` style | ✓ |
| Two methods + non-snap method | `LerpRatio_TargetOne_SnapsToOne`, `LerpRatio_TargetZero_SnapsToZero`, `LerpRatio_TargetMidRange_DoesNotSnap` — cleaner names, more boilerplate | |
| Single big method, all rows | One method with full table including expectedSnapped bool column; assertion has to branch | |

**User's choice:** Single DataRow table.
**Notes:** Mirrors existing test file style. Implementer picks whether to use an `expectedSnapped` column or split into two methods at their discretion.

---

## OnSampleTick seam test scope

### Q2.1 — What scope should `OnSampleTickTests` cover for TEST-03?

| Option | Description | Selected |
|--------|-------------|----------|
| Four transition classes (Recommended) | TEST-03 stated purpose: prove seam reaches None / Activate / RestoreNoEvent / RestoreWithEvent. Maps directly to SEM-01/02 | ✓ |
| Modifier force-zero (SEM-03) | useCtrl/Alt/Shift && modifiersHeld → ratio coerced to 0.0; integration through OnSampleTick | |
| Disable-gate (SEM-05) | !IsEnabled → no-op SampleResult regardless of cursor state; covers Phase 85 'human_needed' SEM-05 gap | |
| RatioChanged flag | Same ratio twice → false; differs → true; drives D-08 BeginInvoke short-circuit | |

**User's choice:** Four transition classes only.
**Notes:** Modifier-force-zero is already covered by `IsModifierHeld_VariousConfigs`. SEM-05 and RatioChanged are below TEST-03's stated goal (proving the seam is reachable without timers/threads). If future regressions slip through, those become candidate plus-tests.

### Q2.2 — How do tests drive `_isGhostMode` state for the four transition cases?

| Option | Description | Selected |
|--------|-------------|----------|
| Direct field write via InternalsVisibleTo (Recommended) | `controller._isGhostMode = true;` before OnSampleTick; field is volatile bool internal; one-call setup per row | ✓ |
| Sequence two OnSampleTick calls | First call drives Activate, second call drives Restore; couples row to prior call's correctness | |
| Helper method on test class | Private static `InGhostState(...)` factory hides the choice; adds a layer | |

**User's choice:** Direct field write.
**Notes:** Triggered a follow-up — `_isGhostMode` is currently `private volatile bool` at GhostModeController.cs:70. To honor this decision, Phase 87 also relaxes the field to `internal volatile bool` (D-SEAM-02b). Visibility-only change, no semantic change to Phase 85's D-06 ownership rule.

---

## PERF-01 methodology

### Q3.1 — What CPU load generator should PERF-01 use?

| Option | Description | Selected |
|--------|-------------|----------|
| PowerShell loop (Recommended) | `while ($true) {}` in 1-2 windows; zero install, controllable, matches CPU-contention focus | ✓ |
| prime95 / mprime | Industry torture test; FPU + memory bandwidth + cache; heavier setup | |
| Custom dotnet stressor | Tiny console app spinning N tasks; scriptable, CI-reusable | |
| dotnet build loop | Realistic mixed CPU+IO+memory load; less precisely controllable | |

**User's choice:** PowerShell loop.
**Notes:** 1 window ≈ 12.5% on 8-core; 2 windows ≈ 25%; 4 windows ≈ 50%.

### Q3.2 — What evidence form should PERF-01 produce?

| Option | Description | Selected |
|--------|-------------|----------|
| Written attestation in 87-VERIFICATION.md (Recommended) | Paragraph in verification report: load level, refresh rate, subjective verdict, sign-off | ✓ |
| Short screen recording + attestation | 5-10 sec Win11 Game Bar clip + attestation link; stronger evidence, repo size cost | |
| Subjective FPS via Game Bar overlay | Quasi-objective FPS reading; Game Bar may not register WPF widget as a 'game' | |

**User's choice:** Written attestation.
**Notes:** Matches Phase 85/86 verification report shape. No media artifacts to maintain.

---

## Carry-forward gaps

### Q4.1 — What does Phase 87 do with the carry-forward gaps?

| Option | Description | Selected |
|--------|-------------|----------|
| Fix WR-04, defer the rest (Recommended) | Phase 87 fixes WR-04 mid-fade toggle-off stranding (~6 lines per review diff); WR-01/02/03 deferred (not user-visible); PERF-01 manual run absorbs 12 UAT items as observation checklist | ✓ |
| Verify-as-is, defer all four WARNINGs | Phase 87 covers only TEST-01..04 + PERF-01 with zero production-code changes; ships v4.4 with known mid-fade-disable visible glitch | |
| Fix all 4 WARNINGs in Phase 87 | Bloats verification phase into bugfix phase; WR-01/02/03 are below user-visible threshold | |

**User's choice:** Fix WR-04, defer the rest.
**Notes:** Shipping v4.4 with the WR-04 stranding glitch is the worse trade-off vs. expanding the verification phase by six lines. WR-01 (smoothness blemish on first-post-convergence frame), WR-02 (stale comment), WR-03 (asymmetric cleanup) are not user-visible — captured in deferred section.

---

## Continuation check

### Closing question — More gray areas, or ready for context?

| Option | Description | Selected |
|--------|-------------|----------|
| I'm ready for context (Recommended) | All four selected gray areas resolved; write CONTEXT.md and route to plan-phase | ✓ |
| Plan structure | Single plan vs split into 2-3 plans (87-01 LerpRatio tests, 87-02 seam tests, 87-03 fix + perf run) | |
| Test file organization | New file pattern vs extend existing; App.Tests vs Core.Tests placement | |
| Explore more gray areas | TEST-04 evidence form (commit output, link CI run, attestation only) | |

**User's choice:** I'm ready for context.
**Notes:** Plan structure left to planner (D-PLAN-01 — Claude's Discretion). Test file organization defaulted to per-class new files (D-FILES-01) following existing pattern. TEST-04 evidence captured in `87-VERIFICATION.md` body per the existing verification report shape.

---

## Claude's Discretion

- Plan structure (single plan vs 2-3 plan split) — D-PLAN-01.
- Test file organization (new files vs extend existing) — D-FILES-01 (defaulted to new files).
- Exact `[TestMethod]` and `[DataRow]` row counts in `LerpRatioTests`.
- Whether `OnSampleTickTests` uses one method per transition or a single parametric method with an `expectedTransition` column.
- Whether to factor the PERF-01 PowerShell load shell command into a `.ps1` script for reproducibility, or just document the one-liner in `87-VERIFICATION.md`.
- Whether the WR-04 fix preserves any defensive null-check on `_settingsWindow` shape vs. simplifies — dictated by the existing handler shape at MainWindow.xaml.cs:260-275.

## Deferred Ideas

- Phase 86 WR-01 — stale `_previousRenderTime` baseline first-frame post-convergence (~78% jump worst-case under clamp).
- Phase 86 WR-02 — stale RMB-04 comment in render pump handler.
- Phase 86 WR-03 — asymmetric event-unsubscribe symmetry in `Closed`.
- Per-frame lerp speed exposed as a settings-backed tunable (REQUIREMENTS.md "Future Requirements").
- Automated PERF-01 acceptance via frame-time instrumentation.
- Coverage for `OnSampleTick` modifier-force-zero (SEM-03), !IsEnabled disable-gate (SEM-05), and RatioChanged flag.
- Coverage for `LerpRatio` convergence shape, step-size bounds, numerical edges.
