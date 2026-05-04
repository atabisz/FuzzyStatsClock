---
gsd_state_version: 1.0
milestone: v4.2
milestone_name: milestone
status: planning
last_updated: "2026-05-04T09:10:00.000Z"
last_activity: 2026-05-04 — 77-01-SUMMARY.md written; RMB-01/RMB-02/RMB-03/RMB-04 all satisfied; 550 MSTest green
progress:
  total_phases: 6
  completed_phases: 3
  total_plans: 5
  completed_plans: 4
---

---
gsd_state_version: 1.0
milestone: v4.2
milestone_name: milestone
status: planning
last_updated: "2026-05-04T09:10:00.000Z"
last_activity: 2026-05-04 — 77-01-SUMMARY.md written; RMB-01/RMB-02/RMB-03/RMB-04 all satisfied; 550 MSTest green
progress:
  total_phases: 6
  completed_phases: 3
  total_plans: 5
  completed_plans: 4
---

# Project State: FuzzyStatsClock

**Last updated:** 2026-05-04
**Current milestone:** v4.2 Temps & Menu
**Status:** Ready to plan

## Project Reference

**Core value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.

**Current focus:** Milestone v4.2 — Phases 75 + 76 + 77 complete. Next: Phase 78 (Temps tab UI, consumes the 5 new AppSettings fields from 76-01).

## Current Position

Phase: 77 (Right-Click Menu on Widget) — COMPLETE
Plan: 77-01 (`2270c3c` RED / `3bf59cf` GREEN / `f14a566` wiring) SHIPPED — 3 commits (Task 1 RED→GREEN + Task 2 MainWindow wiring; Task 3 manual human-verify checkpoint passed)
Status: `RightClickMenuGate` pure static predicate in `FuzzyClock.App` + MainWindow wiring (XAML `PreviewMouseRightButtonUp` attribute + `_menuOpen` field + ProximityChanged guard + ContextMenuStrip Opening/Closed `+=` hooks + `Window_PreviewMouseRightButtonUp` handler). Widget right-click opens exact `_trayIcon.ContextMenuStrip` instance at `Cursor.Position`; TrayMenuBuilder.cs ZERO diff (single-source-of-truth invariant preserved). 550 MSTest green (445 Core + 105 App = 522 baseline + 28 net).
Last activity: 2026-05-04 — 77-01-SUMMARY.md written; RMB-01/RMB-02/RMB-03/RMB-04 all satisfied; 7/7 manual smoke-test checklists passed

## Performance Metrics

**Velocity:** 4 plans / 1 day (Phase 75 spike + Phase 75 TemperatureService + Phase 76-01 AppSettings & Formatter + Phase 77-01 RMB menu)
**Test suite:** 550 MSTest runtime tests (445 Core + 105 App = 522 post-Phase-75 baseline + 28 new across Phases 76 + 77), 0 failures
**Technical debt:** Low (mature codebase; LHM integration contained to FuzzyClock.App per REL-03; Phase 76 added formatter in Core without breaking that invariant; Phase 77 added pure predicate in App, no Core change)

### Performance History

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 75    | 01   | ~45 min  | 3     | 2     |
| 75    | 02   | 17 min   | 4     | 7     |
| 76    | 01   | ~6 min   | 2     | 5     |
| 77    | 01   | ~25 min  | 3     | 4     |

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
- **Plan 77-01 (2026-05-04): Right-Click Menu on Widget shipped.** `RightClickMenuGate` pure static predicate in `FuzzyClock.App` (30 lines) with `ShouldOpen(isDragging, isGhostActive, isCtrlAltHeld)` truth table unit-tested via 6 `[DataRow]` cases in `RightClickMenuGateTests.cs` (24 lines). MainWindow wiring across four touchpoints: `PreviewMouseRightButtonUp` XAML attribute on `<Window>`, `_menuOpen` field, `if (_menuOpen) return;` guard inserted in ProximityChanged lambda BEFORE the `Opacity` assignment (keeps `_proximityRatio = ratio;` unconditional for expected resume-snap per Pitfall 5), `ContextMenuStrip.Opening += (_,_) => _menuOpen = true;` + `Closed += (_,_) => _menuOpen = false;` registered in ContentRendered immediately after `_trayIcon` built (using `+=` preserves `TrayMenuBuilder.cs:90 SyncCheckmarks` registration — handlers fire in registration order), and `Window_PreviewMouseRightButtonUp` handler routing to `_trayIcon.ContextMenuStrip!.Show(System.Windows.Forms.Cursor.Position)`. **TrayMenuBuilder.cs ZERO diff** (single-source-of-truth invariant preserved — widget-invoked menu is byte-for-byte identical to tray invocation). 550 MSTest green (445 Core + 105 App = 522 baseline + 28 net). 3 commits (2270c3c RED → 3bf59cf GREEN → f14a566 wiring). User walked 7 manual smoke-test checklists covering all 4 clock modes (Phrase/Dial/LCD/Nixie) + stats panel + transparent padding + checkmark parity + drag-suppress + ghost-suppress + Ctrl+Alt override + opacity freeze + rapid-click idempotence + regression sweep — all passed. Zero deviations.

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
- [x] Plan 77-01 (RMB menu) — SHIPPED 2026-05-04; RightClickMenuGate + MainWindow wiring + 6 new DataRow cases; TrayMenuBuilder.cs zero-diff invariant preserved
- [ ] Plan 78 (Temps tab UI) — consumes the 5 new AppSettings fields from 76-01
- [ ] Plan 79 (widget rendering) — invokes TemperatureFormatter.Format per tick, consumes ITempSource + AppSettings
- [ ] Plan 80 [Files] must ship RID-specific LHM DLLs under `runtimes/win-x64/lib/net10.0/` + native pair

### Known Blockers

None — Phases 75, 76, 77 all complete. Phase 78 unblocked.

## Session Continuity

### What Just Happened

Phase 77 Plan 01 (Right-Click Menu on Widget) executed across three atomic commits plus a human-verify checkpoint:

- **Task 1 RED** — `2270c3c` (test): created `FuzzyClock.App.Tests/RightClickMenuGateTests.cs` (24 lines) with a single `[TestMethod]` `ShouldOpen_Cases` decorated with 6 `[DataRow]` rows covering the full truth table for (isDragging, isGhostActive, isCtrlAltHeld). Build failed with CS0103 (`RightClickMenuGate` type not found) — expected RED signal.
- **Task 1 GREEN** — `3bf59cf` (feat): created `FuzzyClock.App/RightClickMenuGate.cs` (30 lines). `internal static class` with `public static bool ShouldOpen(bool, bool, bool)` predicate: `if (isDragging) return false;` → `if (isGhostActive && !isCtrlAltHeld) return false;` → `return true;`. XML doc comments document the RMB-03 defence-in-depth rationale (WPF doesn't receive mouse events while WS_EX_TRANSPARENT is applied — the guard is belt-and-suspenders for the narrow window between the cursor-polling timer restoring interactivity and the ratio actually dropping). Filtered `dotnet test --filter FullyQualifiedName~RightClickMenuGateTests` reports 6/6 pass.
- **Task 2 WIRING** — `f14a566` (feat): four touchpoints in MainWindow. (1) `MainWindow.xaml` +2 lines adding `PreviewMouseRightButtonUp="Window_PreviewMouseRightButtonUp"` on the `<Window>` root (adjacent to existing `PreviewMouseWheel` wiring — uses tunneling route to fire before any child can set `Handled=true`). (2) `MainWindow.xaml.cs` `_menuOpen` field declared adjacent to `_isDragging` / `_proximityRatio`. (3) ProximityChanged lambda gets `if (_menuOpen) return;` added BEFORE `this.Opacity = _windowOpacity * (1.0 - ratio);` and AFTER the existing `_isDragging` and `_settingsWindow` early returns — `_proximityRatio = ratio;` stays UNCONDITIONAL so the next tick post-menu-close applies the current cursor position (expected resume-snap per Pitfall 5). (4) In ContentRendered immediately after `_trayIcon = _trayMenu.Build(...)`: `_trayIcon.ContextMenuStrip!.Opening += (_, _) => _menuOpen = true; _trayIcon.ContextMenuStrip!.Closed += (_, _) => _menuOpen = false;` — using `+=` (not `=`) preserves TrayMenuBuilder's `menu.Opening += SyncCheckmarks` registration; WinForms fires handlers in registration order so checkmark sync still runs before `_menuOpen` flips. (5) `Window_PreviewMouseRightButtonUp` handler: `_menuOpen` idempotence short-circuit → `RightClickMenuGate.ShouldOpen(_isDragging, _ghostMode.IsActive, _ghostMode.IsCtrlAltHeld())` gate → `_trayIcon.ContextMenuStrip!.Show(System.Windows.Forms.Cursor.Position)` → `e.Handled = true`. Fully-qualified `System.Windows.Input.MouseButtonEventArgs` avoids the known `UseWindowsForms=true` ambiguity with `System.Windows.Forms.MouseEventArgs`. Full suite `dotnet test` reported 550/0 green.
- **Task 3 HUMAN-VERIFY CHECKPOINT** — no commit (verification-only). User walked 7 checklists against `dotnet run --project FuzzyClock.App/FuzzyClock.App.csproj`: RMB-01 parity in all 4 clock modes (Phrase/Dial/LCD/Nixie) + stats panel + transparent #01000000 padding; RMB-01 checkmark parity (Ghost/Stats/Auto-Contrast/Auto-Launch toggles); RMB-02 drag suppress; RMB-03 ghost-no-CtrlAlt suppress + Ctrl+Alt override; RMB-04 opacity freeze during menu; rapid-click idempotence; regression sweep (drag-to-move, scroll-wheel opacity, tray icon menu, Settings window open from both tray and widget right-click). User signalled `"approved"` — all 7 checklists passed, no deferred items.

**TrayMenuBuilder.cs zero-diff invariant confirmed:** `git diff 2270c3c^..HEAD -- FuzzyClock.App/TrayMenuBuilder.cs | wc -l` returns 0. Single-source-of-truth for menu items, checkmarks, enabled state, and click handlers preserved — widget right-click invocation is byte-for-byte identical to tray icon invocation.

**Zero deviations from plan.** All four MainWindow touchpoints implemented exactly as specified. `_menuOpen` appears 9 times in MainWindow.xaml.cs (plan required ≥4 grep hits; the higher count reflects doc comments + field decl + ProximityChanged guard + Opening hook + Closed hook + idempotence guard — documentation density, not structural deviation).

77-01-SUMMARY.md written with full self-check section verifying all three commit hashes exist plus the TrayMenuBuilder.cs zero-diff invariant. This STATE.md update is part of the Plan 77-01 wrap-up metadata commit.

### Next Session Should Know

- **Phases 75, 76, 77 are all complete.** Milestone v4.2 is 3/6 phases done (4/5 plans — Phase 75 had 2 plans, Phases 76 and 77 had 1 each).
- **Phase 78 (Temps tab UI) is next in the temps chain** — the five new `AppSettings` fields from Plan 76-01 exist with documented defaults. SettingsWindow can wire to them via the existing settings pipeline; no additional AppSettings work needed. Phase 78 also depends on `TemperatureService.IsReady` (Phase 75 Plan 02) for the N/A-probe-disables-checkbox logic per TEMP-TAB-04.
- **Phase 79 (widget rendering)** is blocked on Phase 78 for the toggle-event wiring only — `TemperatureFormatter.Format` is tested and ready; `TemperatureService` is set up; the only missing piece is the Settings events Phase 78 will emit.
- **Phase 80 (Release)** remains last — all earlier phases must land before the integrated CI grep gates and installer artifact capture run.
- **Right-click menu pattern:** future UI-state gating features should clone the `RightClickMenuGate` pattern — pure static helper + `[DataRow]` parametric test table — so boolean decisions are unit-testable without UI automation.
- **TrayMenuBuilder.cs is the single source of truth** for tray menu items. Any future menu item additions, checkmark logic, or click handlers flow through `TrayMenuBuilder.Build()` and automatically propagate to both tray icon invocations and widget right-click invocations (same ContextMenuStrip instance).
- **Test count:** 550 runtime tests (445 Core + 105 App). Phases 78–80 should land additional tests on top of this baseline.
- **LHM transitive DLL layout:** RID-specific under `runtimes/{rid}/lib/net10.0/` + MonoPosixHelper native pair. Phase 80 Inno Setup planner must ship the full `runtimes/` tree or the RID subtree — flat reference won't work.
- **InitTimeoutSeconds = 5** is compile-time const, no config switch. Silent-failure mode (IsReady=true + _lhmAvailable=false + all sentinels) if Computer.Open() exceeds 5s on a given machine.

### Context for Continuation

- Milestone goal: System temperature display + tray menu via right-click
- Previous milestone: v4.1 Polish & Phrases (phases 70–74, shipped 2026-04-02)
- Config: mode=yolo, granularity=standard, research=true, commit_docs=true
- Research artifacts under `.planning/research/` — STACK, FEATURES, ARCHITECTURE, PITFALLS, SUMMARY
- Spike artifact: `.planning/spikes/75-hardware-discovery.md` (survives milestone archival; Phase 80 release docs can reference it)
- Phase 75 plan directory: `.planning/phases/75-hardware-discovery-spike-temperatureservice/` — contains both PLAN + SUMMARY pairs

---
*State snapshot: 2026-05-04 — Phases 75, 76, 77 all complete (4/5 plans shipped); Phase 78 next in temps chain; Phase 79 blocked on 78 for toggle events; 550 MSTest green; TrayMenuBuilder.cs zero-diff single-source-of-truth invariant preserved*
