---
gsd_state_version: 1.0
milestone: v4.2
milestone_name: milestone
status: planning
last_updated: "2026-05-04T07:27:01.528Z"
last_activity: 2026-05-04 — 75-02-SUMMARY.md written; all four TEMP-SVC-0{2,3,4,5} requirements satisfied
progress:
  total_phases: 6
  completed_phases: 1
  total_plans: 2
  completed_plans: 2
---

# Project State: FuzzyStatsClock

**Last updated:** 2026-05-04
**Current milestone:** v4.2 Temps & Menu
**Status:** Ready to plan

## Project Reference

**Core value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.

**Current focus:** Milestone v4.2 — Phase 75 complete (spike + TemperatureService). Next: Phase 76 (AppSettings + TemperatureFormatter) or Phase 77 (RMB menu, parallelizable).

## Current Position

Phase: 75 (Hardware Discovery Spike + TemperatureService) — COMPLETE
Plan: 75-01 (`cb26529`) + 75-02 (`f6daee1` / `0041e2d` / `e99b842`) both SHIPPED
Status: TemperatureService landed in FuzzyClock.App with Path 2 threading + 5s init timeout + three-tier Interlocked dispose; REL-03 preserved; 522 MSTest green (433 Core + 89 App)
Last activity: 2026-05-04 — 75-02-SUMMARY.md written; all four TEMP-SVC-0{2,3,4,5} requirements satisfied

## Performance Metrics

**Velocity:** 2 plans / 1 day on Phase 75 (spike + TemperatureService)
**Test suite:** 522 MSTest tests (433 Core + 89 App = 68 baseline + 21 new), 0 failures, 0 warnings
**Technical debt:** Low (mature codebase; LHM integration contained to FuzzyClock.App per REL-03)

### Performance History

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 75    | 01   | ~45 min  | 3     | 2     |
| 75    | 02   | 17 min   | 4     | 7     |

## Accumulated Context

### Key Decisions This Milestone

- Phase structure derived from research SUMMARY.md: 6 phases continuing 75–80
- Phase 75 gates the entire milestone via hardware-discovery spike + TempService
- Phase 77 (RMB) decoupled and parallelizable with the temps chain
- Phase 80 (Release) comes last so CI grep gates validate the integrated artifact
- **Phase 75 Plan 01 (2026-05-04): NO-GO on D-02 gate.** GPU readable (NVIDIA A2000 GPU Core=51°C, GPU Hot Spot=61.56°C); NVMe not enumerated (`HardwareType.Storage` absent from LHM tree despite `IsStorageEnabled=true`); CPU and Mobo N/A (PawnIO-gated as predicted).
- **D-05 Threading Path: Path 2 (dedicated background task).** Steady-state Update() mean = 608.2 ms (12× the 50 ms piggyback threshold). Plan 75-02 implemented long-lived `Task.Run` + `CancellationToken` per D-07.
- **Methodology variance:** dev box was PawnIO-free at baseline; the planned uninstall/restore cycle was a no-op. Documented in `.planning/spikes/75-hardware-discovery.md` Sections 1+2.
- **Init timeout resolution:** raised 3s → 5s (`InitTimeoutSeconds = 5` compile-time const in `TemperatureService`). Spike measured 4272ms `Computer.Open()` on dev box; 5s provides ~17% headroom without introducing a config switch.
- **Plan 75-02 (2026-05-04): TemperatureService shipped.** Path 2 threading (2s cadence), async init with `Task.WhenAny` + 5s timeout, three-tier dispose (`OnClosing` + `SessionEnding` + `ProcessExit`) behind single `Interlocked.CompareExchange` on int `_disposed`. Test subclass seam via `protected virtual InitializeCore()` (class non-sealed for that reason only — doc comment explains production treat-as-sealed). REL-03 preserved (zero LHM references in `FuzzyClock.Core/`). 522 MSTest green.

### Open Questions

- Whether a true clean Win11 24H2 VM would also fail NVMe enumeration (dev box N/A may or may not generalize — hedged by scope-reduction "best-effort NVMe" language)
- Phase 80 installer must ship either full `runtimes/` tree or RID-specific subtree (`win-x64/lib/net10.0/LibreHardwareMonitorLib.dll` + MonoPosixHelper native pair) — not flat reference. Resolution deferred to Phase 80 planner.

### Active TODOs

- [x] Amend `ROADMAP.md` Phase 75 SC1 (GPU minimum bar; CPU/Mobo/NVMe best-effort with `-1f` fallback)
- [x] Amend `REQUIREMENTS.md` TEMP-TAB-03 (NVMe default ON → OFF; help text disclaimer added)
- [x] Amend `REQUIREMENTS.md` TEMP-LINE-04 (`-1f` sentinel explicitly hides segment in every rendering path)
- [x] Amend `REQUIREMENTS.md` TEMP-SVC-03 + Plan 75-02 (init timeout 3s → 5s per 4272ms `Computer.Open()` spike measurement)
- [x] Unblock Plan 75-02
- [x] Ship Plan 75-02 (TemperatureService + ITempSource + FakeTempSource + 21 MSTest methods)
- [ ] Plan 76 (AppSettings + TemperatureFormatter) — next in sequence; consumes `ITempSource` via DI
- [ ] Plan 77 (RMB menu) — parallelizable with Phase 76 (no dependency on TemperatureService)
- [ ] Plan 80 [Files] must ship RID-specific LHM DLLs under `runtimes/win-x64/lib/net10.0/` + native pair

### Known Blockers

None — Phase 75 complete.

## Session Continuity

### What Just Happened

Phase 75 Plan 02 (TemperatureService) executed in 17 minutes:

- **Task 1** — LHM 0.9.6 PackageReference added to `FuzzyClock.App.csproj`; `FuzzyClock.App/ITempSource.cs` written (six-member contract; no IDisposable; nullable-free float properties). Committed as `f6daee1`.
- **Task 2** — `FuzzyClock.App/TemperatureService.cs` (274 lines) + `FuzzyClock.App.Tests/FakeTempSource.cs` + `TemperatureServiceTests.cs` (21 methods + StubSensor/StubHardware + 4 test subclasses NoOpInit/SleepyInit/ThrowingInit/CountingClose). Six auto-fixed deviations: sealed+virtual conflict → non-sealed with doc comment; CS0414 unused `_lhmAvailable` → `if (_lhmAvailable)` gate in BackgroundLoop; IHardware/ISensor stub shape trimmed to interface-only members; `using System.IO;` added; grep-gate alignment collapsed to single-space form; CloseCallCount documented-only. 522/522 MSTest green. Committed as `0041e2d`.
- **Task 3** — Three-tier dispose wired: `MainWindow._temperatureService` field + `new TemperatureService()` in ContentRendered + `_temperatureService?.Dispose()` in OnClosing + `internal void DisposeTemperatureService()`; `App.xaml.cs` SessionEnding extended + `AppDomain.CurrentDomain.ProcessExit += OnProcessExit` at end of OnStartup. Committed as `e99b842`.
- **Task 4** — Automated grep gate passed (all four wiring sites present). Manual launch smoke-test documented in SUMMARY for user to run at convenience; not a hard block for Phase 76.

REL-03 CI invariant preserved: `grep -r "LibreHardwareMonitor" FuzzyClock.Core/` returns nothing. 75-02-SUMMARY.md written. This STATE.md update is part of the Plan 75-02 wrap-up commit.

### Next Session Should Know

- **Phase 75 is complete.** Both plans (spike + TemperatureService) shipped on 2026-05-04.
- **Phase 76 (AppSettings + TemperatureFormatter) is next in sequence** — consumers inject `ITempSource` (either production `TemperatureService` or test `FakeTempSource`), gate on `IsReady`, treat `-1f` as "hide segment" per TEMP-LINE-04.
- **Phase 77 (RMB menu) can run in parallel** with Phase 76 — no dependency on TemperatureService.
- **LHM transitive DLL layout:** RID-specific under `runtimes/{rid}/lib/net10.0/` + MonoPosixHelper native pair. Phase 80 Inno Setup planner must ship the full `runtimes/` tree or the RID subtree — flat reference won't work.
- **Test count:** 522 (433 Core + 89 App = 68 baseline + 21 TemperatureService). Next phases should land additional tests on top of this baseline.
- **InitTimeoutSeconds = 5** is compile-time const, no config switch. Silent-failure mode (IsReady=true + _lhmAvailable=false + all sentinels) if Computer.Open() exceeds 5s on a given machine.

### Context for Continuation

- Milestone goal: System temperature display + tray menu via right-click
- Previous milestone: v4.1 Polish & Phrases (phases 70–74, shipped 2026-04-02)
- Config: mode=yolo, granularity=standard, research=true, commit_docs=true
- Research artifacts under `.planning/research/` — STACK, FEATURES, ARCHITECTURE, PITFALLS, SUMMARY
- Spike artifact: `.planning/spikes/75-hardware-discovery.md` (survives milestone archival; Phase 80 release docs can reference it)
- Phase 75 plan directory: `.planning/phases/75-hardware-discovery-spike-temperatureservice/` — contains both PLAN + SUMMARY pairs

---
*State snapshot: 2026-05-04 — Phase 75 complete (Plan 01 NO-GO spike + Plan 02 TemperatureService shipped); Phase 76 unblocked*
