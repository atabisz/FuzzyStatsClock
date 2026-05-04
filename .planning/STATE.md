---
gsd_state_version: 1.0
milestone: v4.2
milestone_name: milestone
status: planning
last_updated: "2026-05-04T08:08:43.150Z"
last_activity: 2026-05-04 — 76-01-SUMMARY.md written; TEST-01/TEST-02/TEST-03/TEST-04 all satisfied; 544 MSTest green
progress:
  total_phases: 6
  completed_phases: 2
  total_plans: 4
  completed_plans: 3
---

# Project State: FuzzyStatsClock

**Last updated:** 2026-05-04
**Current milestone:** v4.2 Temps & Menu
**Status:** Phase 76 shipped — Phase 77 (RMB menu) and Phase 78 (Temps tab UI) now both unblocked

## Project Reference

**Core value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.

**Current focus:** Milestone v4.2 — Phases 75 + 76 complete. Next: Phase 77 (RMB menu, parallelizable with 78) or Phase 78 (Temps tab UI, consumes the 5 new AppSettings fields from 76-01).

## Current Position

Phase: 76 (AppSettings + TemperatureFormatter Tests) — COMPLETE
Plan: 76-01 (`fb04fda` / `d3822ee` / `e5dbb47` / `1747fd2`) SHIPPED — 4 atomic TDD commits (Task 1 RED→GREEN; Task 2 RED→GREEN)
Status: Five init-property bool fields added to AppSettings (TempsLineVisible=false, TempCpuVisible=true, TempGpuVisible=true, TempMoboVisible=false, TempNvmeVisible=false); SettingsService.Defaults() explicit symmetry; pure-static TemperatureFormatter in FuzzyClock.Core (zero LibreHardwareMonitor refs — REL-03 preserved); 544 MSTest green (445 Core + 99 App = 522 baseline + 22 new runtime tests)
Last activity: 2026-05-04 — 76-01-SUMMARY.md written; TEST-01/TEST-02/TEST-03/TEST-04 all satisfied

## Performance Metrics

**Velocity:** 3 plans / 1 day (Phase 75 spike + Phase 75 TemperatureService + Phase 76-01 AppSettings & Formatter)
**Test suite:** 544 MSTest runtime tests (445 Core + 99 App = 522 post-Phase-75 baseline + 22 new), 0 failures
**Technical debt:** Low (mature codebase; LHM integration contained to FuzzyClock.App per REL-03; Phase 76 added formatter in Core without breaking that invariant)

### Performance History

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 75    | 01   | ~45 min  | 3     | 2     |
| 75    | 02   | 17 min   | 4     | 7     |
| 76    | 01   | ~6 min   | 2     | 5     |

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
- **Plan 76-01 (2026-05-04): AppSettings temps-visibility fields + TemperatureFormatter shipped.** Five init-property bools added (TempsLineVisible=false, TempCpuVisible=true, TempGpuVisible=true, TempMoboVisible=false, TempNvmeVisible=false); NVMe default is false in all 5 sites per TEMP-TAB-03 amendment commit b2163d1. Pure static TemperatureFormatter in FuzzyClock.Core with -1f hide-segment guard (value >= 0f), 2-space separator via string.Join, (int)Math.Round banker's rounding, 8 primitive parameters (no wrapper record, no ninth tempsLineVisible param). 544 MSTest green (445 Core + 99 App = 522 baseline + 22 new runtime tests from 18 methods). One Rule 1 auto-fix: doc comment rephrased to avoid literal `LibreHardwareMonitor` string so the Phase 80 CI grep gate stays clean. 4 atomic TDD commits (fb04fda RED → d3822ee GREEN; e5dbb47 RED → 1747fd2 GREEN).

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
- [x] Plan 76-01 (AppSettings + TemperatureFormatter) — SHIPPED 2026-05-04; 5 init-property bools + pure formatter + 18 new test methods (22 runtime)
- [ ] Plan 77 (RMB menu) — parallelizable with Phase 78 (no dependency on TemperatureService)
- [ ] Plan 78 (Temps tab UI) — consumes the 5 new AppSettings fields from 76-01
- [ ] Plan 79 (widget rendering) — invokes TemperatureFormatter.Format per tick, consumes ITempSource + AppSettings
- [ ] Plan 80 [Files] must ship RID-specific LHM DLLs under `runtimes/win-x64/lib/net10.0/` + native pair

### Known Blockers

None — Phase 76 complete.

## Session Continuity

### What Just Happened

Phase 76 Plan 01 (AppSettings temps-visibility + TemperatureFormatter) executed TDD-style in ~6 minutes across 4 atomic commits:

- **Task 1 RED** — `fb04fda` (test): appended a `// ----- v4.2 temps-visibility fields -----` section to `AppSettingsTests.cs` with 10 new test methods (5 absent-field + 5 round-trip). `dotnet build` failed with 15 CS0117/CS1061 compile errors — the expected RED state.
- **Task 1 GREEN** — `d3822ee` (feat): added five init-property `bool` fields (`TempsLineVisible=false, TempCpuVisible=true, TempGpuVisible=true, TempMoboVisible=false, TempNvmeVisible=false`) to `AppSettings.cs` after `GhostFadeRadiusPx`; added trailing comma and five symmetry assignments in `SettingsService.Defaults()`. 99 App tests green (89 baseline + 10 new).
- **Task 2 RED** — `e5dbb47` (test): wrote `FuzzyClock.Core.Tests/TemperatureFormatterTests.cs` (109 lines, 8 `[TestMethod]` entries including a `[DataRow]` rounding table). Build failed with 8 CS0103 errors — expected RED.
- **Task 2 GREEN** — `1747fd2` (feat): wrote `FuzzyClock.Core/TemperatureFormatter.cs` (43 lines). Pure static class; single `Format(4 floats, 4 bools) → string` method; `value >= 0f` guard enforcing the -1f hide-segment contract (TEMP-LINE-04); `string.Join("  ", segments)` for the 2-space separator; `(int)Math.Round(cpu)` with default banker's rounding. 445 Core tests green (433 baseline + 12 new runtime).

**One Rule 1 auto-fix:** the drafted doc comment contained the literal string `LibreHardwareMonitor` (as part of a sentence documenting its absence). This would still trip the Phase 80 CI grep gate. Rephrased to `this file has zero references to the hardware-sensor package` — semantics preserved, grep-gate-safe. Applied before the Task 2 GREEN commit, so committed atomically with that work.

**Final verification gates all green:**
- `dotnet test` reports 544 runtime tests passed, 0 failed (445 Core + 99 App).
- `grep -r "LibreHardwareMonitor" FuzzyClock.Core/` returns zero matches.
- Every `TempNvmeVisible` site (record, Defaults(), absent-field test, code comment) asserts or sets `false` — the single round-trip test constructs `TempNvmeVisible = true` to prove serialization round-trip, which is by design.

76-01-SUMMARY.md written with self-check section verifying all four commit hashes exist. This STATE.md update is part of the Plan 76-01 wrap-up metadata commit.

### Next Session Should Know

- **Phase 76 is complete.** Only Plan (76-01) shipped on 2026-05-04.
- **Phase 78 (Temps tab UI) is unblocked** — the five new `AppSettings` fields exist with documented defaults. SettingsWindow can wire to them via the existing settings pipeline; no additional AppSettings work needed.
- **Phase 79 (widget rendering) is unblocked** — `TemperatureFormatter.Format` is a tested, pure function. Widget will combine four floats from the `TemperatureService` singleton (set up in Phase 75 Plan 02) with four visibility flags from `AppSettings`, call `Format` per tick. Empty-string response collapses the TextBlock.
- **Phase 77 (RMB menu) remains parallelizable** with 78 — no shared surface.
- **LHM transitive DLL layout:** RID-specific under `runtimes/{rid}/lib/net10.0/` + MonoPosixHelper native pair. Phase 80 Inno Setup planner must ship the full `runtimes/` tree or the RID subtree — flat reference won't work.
- **Test count:** 544 (445 Core + 99 App). Phases 77–80 should land additional tests on top of this baseline.
- **InitTimeoutSeconds = 5** is compile-time const, no config switch. Silent-failure mode (IsReady=true + _lhmAvailable=false + all sentinels) if Computer.Open() exceeds 5s on a given machine.

### Context for Continuation

- Milestone goal: System temperature display + tray menu via right-click
- Previous milestone: v4.1 Polish & Phrases (phases 70–74, shipped 2026-04-02)
- Config: mode=yolo, granularity=standard, research=true, commit_docs=true
- Research artifacts under `.planning/research/` — STACK, FEATURES, ARCHITECTURE, PITFALLS, SUMMARY
- Spike artifact: `.planning/spikes/75-hardware-discovery.md` (survives milestone archival; Phase 80 release docs can reference it)
- Phase 75 plan directory: `.planning/phases/75-hardware-discovery-spike-temperatureservice/` — contains both PLAN + SUMMARY pairs

---
*State snapshot: 2026-05-04 — Phase 76 complete (Plan 01 AppSettings temps-visibility + TemperatureFormatter shipped); Phases 77, 78, 79 all unblocked — 77 and 78 are parallelizable*
