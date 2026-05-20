---
gsd_state_version: 1.0
milestone: v4.4
milestone_name: Smooth Ghost Fade Under Load
status: ready_to_plan
stopped_at: Phase 86 complete (2/2) — ready to discuss Phase 87
last_updated: 2026-05-20T11:49:37.304Z
progress:
  total_phases: 3
  completed_phases: 1
  total_plans: 6
  completed_plans: 6
  percent: 33
---

# Project State: FuzzyStatsClock

**Status:** Ready to plan
**Last updated:** 2026-05-20

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-07)

**Core value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.
**Current focus:** Phase 87 — verification & performance acceptance

## Current Milestone

**v4.4 Smooth Ghost Fade Under Load** — In progress

- Phases: 85, 86, 87 (continues from v4.3's Phase 84)
- Requirements: 18 total — FADE (4), SAMP (4), SEM (5), TEST (4), PERF (1)
- Coverage: 18/18 mapped to phases (100%)
- Test baseline at milestone start: 574 MSTest (445 Core + 129 App)

### Phase Plan

| Phase | Goal | Requirements |
|-------|------|--------------|
| 85 — Off-thread sampling refactor | `GhostModeController` sampling moves to `System.Threading.Timer`; UI work marshals via `Dispatcher.BeginInvoke`; tickable seam exposed | SAMP-01..04, SEM-01, SEM-02, SEM-03, SEM-05 |
| 86 — Frame-driven opacity rendering | `MainWindow` lerps current ratio toward target via `CompositionTarget.Rendering`; terminal-state snap; existing guards preserved | FADE-01..04, SEM-04 |
| 87 — Verification & performance acceptance | `LerpRatio` unit tests; tickable-seam tests; full MSTest suite green; manual smoothness check under 25–50% CPU load | TEST-01..04, PERF-01 |

## Recent Milestone

**v4.3 Configurable Ghost Override** — Shipped 2026-05-07

- 4 phases (81–84), 5 plans
- 574 MSTest passing (445 Core + 129 App)
- 22/22 requirements validated
- Tag: v4.3

## Accumulated Context

### Active TODOs

None

### Known Blockers

None

### Recent Decisions Affecting v4.4

- v4.0 Phase 67: Always-running `GhostModeController` timer (not started/stopped on toggle) — Phase 85 must preserve this lifecycle invariant under the new thread-pool timer
- v4.0 Phase 67: `Restored` fires only at ratio=0.0 after ghost activation — Phase 85 must preserve byte-for-byte
- v4.3 Phase 83: `IsModifierHeld` AND-logic with all-false short-circuit — Phase 85 must preserve under off-thread sampling
- v4.3 Phase 84: Five `MainWindow` touchpoints for ghost integration — Phase 86 must respect drag/settings/menu/wheel guards verbatim
- v4.4 Phase 85 Plan 01: Pure-logic seam landed — `internal SampleResult OnSampleTick(...)` + `GhostTransition` enum exposed via `InternalsVisibleTo`; `OnTimerTick` now gather→delegate→apply; D-10 read-once-into-locals snapshot pattern adopted ahead of Plan 02 volatile swap; single-owner write rule for `_lastProximityRatio` and `_isGhostMode = false` enforced — all 129 App + 449 Core tests pass without modification, `MainWindow.xaml.cs` byte-for-byte unchanged
- v4.4 Phase 85 Plan 02: Volatile config fields landed — `_isGhostMode` (D-06), `_useCtrl/_useAlt/_useShift/_ghostFadeRadiusPx` (D-10), and new `_isEnabled` backing field (D-11) all declared `volatile`; `IsEnabled` converted from auto-property to manual property `{ get => _isEnabled; set => _isEnabled = value; }`; `_lastProximityRatio` deliberately left as plain `double` (sampler-thread-local per D-06); no threading changes — `OnTimerTick` still on dispatcher; `MainWindow.xaml.cs` byte-for-byte unchanged; all 129 App tests pass
- v4.4 Phase 85 Plan 03: Threading swap landed — `DispatcherTimer? _restoreTimer` removed; `System.Threading.Timer? _timer` (D-01) constructed at Initialize with 33 ms cadence (SAMP-04), always-running for the session; `Dispatcher _dispatcher` captured once at Initialize via `Application.Current.Dispatcher` (D-09); `int _tickInFlight` Interlocked reentrancy guard (D-02) at the top of new `OnSampleThreadTick(object? state)` callback with `try { ... } finally { _tickInFlight = 0; }` release; `OnSampleThreadTick` runs Win32 sampling and `OnSampleTick` off the UI thread (SAMP-02/03), short-circuits before BeginInvoke when `transition=None && !RatioChanged` (D-08), guards against dispatcher shutdown via `HasShutdownStarted/HasShutdownFinished` (D-09), and bundles all UI work in exactly one `_dispatcher.BeginInvoke` per tick (D-07) — lambda raises `ProximityChanged`, switches on transition to call `Activate()` / clear WS_EX_TRANSPARENT / raise `Restored`. `Activate()` body unchanged (option a); `_isGhostMode` writes still owned by `OnSampleTick` (false) and `Activate()` (true). `Dispose()` placeholder swap to `_timer?.Dispose()` — Plan 04 hardens to WaitHandle form. `MainWindow.xaml.cs` byte-for-byte unchanged; all 129 App + 449 Core tests pass
- v4.4 Phase 85 Plan 04: Synchronous disposal landed — `Dispose()` rewritten from placeholder `_timer?.Dispose()` to the WaitHandle-based synchronous form per D-03. New `_disposed` bool field for idempotency early-exit. Dispose() now: (1) returns immediately if already disposed; (2) returns immediately if `_timer == null` (Initialize never ran); (3) creates a `using ManualResetEvent(false)`, calls `_timer.Dispose(notifyObject)` + `notifyObject.WaitOne()` to block until any in-flight tick callback fully completes; (4) sets `_timer = null;` defensively. Combined with D-09 dispatcher-shutdown guard from Plan 03, the teardown race is closed in both directions: ticks already running drain before Dispose() returns; ticks that started but reach BeginInvoke after dispatcher shutdown bail at the guard. T-85-12 and T-85-14 mitigations from Plan 04's threat register confirmed; T-85-13 explicitly accepted (bounded callback ⇒ no deadlock risk). `MainWindow.xaml.cs` byte-for-byte unchanged; all 129 App + 449 Core tests pass. **Phase 85 complete (4/4 plans).**

## Session Continuity

**Next action:** Phase 85 verification (verifier sub-phase) → Phase 86 (frame-driven opacity rendering)

**When returning:**

1. Read this STATE.md and .planning/ROADMAP.md for current position
2. Run Phase 85 verifier (workflow.verifier=true in config.json)
3. Begin Phase 86 planning (frame-driven opacity rendering — consumes ProximityChanged from Phase 85)

**Recent milestones:**

- v4.3 Configurable Ghost Override — shipped 2026-05-07 (574 tests, 22/22 requirements)
- v4.2 Temps & Menu — shipped 2026-05-04 (562 tests, MPL-2.0 compliance)

**Last session:** 2026-05-20T10:23:58.720Z
**Stopped at:** Phase 86 context gathered
**Resume file:** .planning/phases/86-frame-driven-opacity-rendering/86-CONTEXT.md
**Blockers:** None

---
*State updated: 2026-05-20 — Plan 85-04 complete (commit 776bbbf); SUMMARY at .planning/phases/85-off-thread-sampling-refactor/85-04-SUMMARY.md*
*Phase 85 complete: 4/4 plans landed; threading swap + synchronous disposal in place; ready for Phase 86*
*Phase numbering continues from v4.3's Phase 84*
