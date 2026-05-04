---
gsd_state_version: 1.0
milestone: none
milestone_name: between-milestones
status: ready-for-new-milestone
last_updated: "2026-05-04T15:45:00.000Z"
last_activity: 2026-05-04 — v4.2 milestone archived + tagged; ready for /gsd-new-milestone
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

---
gsd_state_version: 1.0
milestone: v4.2
milestone_name: milestone
status: complete
last_updated: "2026-05-04T15:30:00.000Z"
last_activity: 2026-05-04 — Phase 80 complete; NOTICES + CI gates + installer line + tripwire validated; milestone v4.2 is 6/6 complete
progress:
  total_phases: 6
  completed_phases: 6
  total_plans: 10
  completed_plans: 10
---

---
gsd_state_version: 1.0
milestone: v4.2
milestone_name: milestone
status: planning
last_updated: "2026-05-04T14:15:00.000Z"
last_activity: 2026-05-04 — Phase 79 complete; temps line rendered on widget; 562 MSTest green
progress:
  total_phases: 6
  completed_phases: 5
  total_plans: 9
  completed_plans: 9
---

---
gsd_state_version: 1.0
milestone: v4.2
milestone_name: milestone
status: planning
last_updated: "2026-05-04T13:30:00.000Z"
last_activity: 2026-05-04 — Plan 79-01 shipped; TempsText rendering on widget; UpdateTempsDisplay wired into timer tick + 5 handlers + both ApplyX methods; 562 MSTest green (+8)
progress:
  total_phases: 6
  completed_phases: 4
  total_plans: 8
  completed_plans: 8
---

---
gsd_state_version: 1.0
milestone: v4.2
milestone_name: milestone
status: planning
last_updated: "2026-05-04T12:00:00.000Z"
last_activity: 2026-05-04 — Phase 78 complete; Temps tab wired + persistence + N/A detection; 554 MSTest green
progress:
  total_phases: 6
  completed_phases: 4
  total_plans: 7
  completed_plans: 7
---

---
gsd_state_version: 1.0
milestone: v4.2
milestone_name: milestone
status: planning
last_updated: "2026-05-04T09:08:54.697Z"
last_activity: 2026-05-04 — 77-01-SUMMARY.md written; RMB-01/RMB-02/RMB-03/RMB-04 all satisfied; 7/7 manual smoke-test checklists passed
progress:
  total_phases: 6
  completed_phases: 3
  total_plans: 4
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
**Status:** Phase 79 complete; Phase 80 (Release & Compliance) next — final phase of the milestone

## Project Reference

**Core value:** The time phrase is always visible on the desktop, readable at a glance, with no visual chrome getting in the way.

**Current focus:** Milestone v4.2 — Phases 75/76/77/78/79 complete (5/6). Next: Phase 80 (Release & Compliance) — the final phase of the milestone before `/gsd:audit-milestone` + `/gsd:complete-milestone`.

## Current Position

Phase: 79 (Temps Line on Widget) — **COMPLETE 2026-05-04**
Plan: 79-02 (human-verify checkpoint) SHIPPED — single metadata commit `docs(79-02): capture human-verify sign-off`. User walked the 22-item / 7-category checklist on live dev hardware via `dotnet run --project FuzzyClock.App/FuzzyClock.App.csproj -c Release` and replied `approved`. Dev-box render confirmed as single-segment `GPU 51°` line — matches D-19 prediction exactly (CPU + Mobo + NVMe absent on PawnIO-free baseline per Phase 75 spike Section 3). All 6 TEMP-LINE requirements (TEMP-LINE-01..06) now Complete.
Status: Phase 79 closed across all state files. Plan 79-01 production code (`97d424c` RED → `5747390` XAML GREEN → `d3868fc` code-behind GREEN → `145a52d` SUMMARY) unchanged; Plan 79-02 is zero-code / metadata-only. 562 MSTest green preserved (445 Core + 117 App). REL-03 invariant preserved end-to-end through all 5 completed phases (zero `LibreHardwareMonitor` references under `FuzzyClock.Core/`). Next: Phase 80 (Release & Compliance) — LHM 0.9.6 pin + CI grep gates + `THIRD-PARTY-NOTICES.md` + Inno Setup `[Files]` LHM DLL capture.
Last activity: 2026-05-04 — Phase 79 complete; temps line rendered on widget; 562 MSTest green

## Performance Metrics

**Velocity:** 9 plans / 1 day (Phase 75 spike + Phase 75 TemperatureService + Phase 76-01 AppSettings & Formatter + Phase 77-01 RMB menu + Phase 78-01 Temps UI + Phase 78-02 persistence wiring + Phase 79-01 widget render + Phase 79-02 human-verify — 5 phases complete)
**Test suite:** 562 MSTest runtime tests (445 Core + 117 App = 522 post-Phase-75 baseline + 40 new across Phases 76 + 77 + 78 + 79), 0 failures
**Technical debt:** Low (mature codebase; LHM integration contained to FuzzyClock.App per REL-03; Phase 76 added formatter in Core without breaking that invariant; Phase 77 added pure predicate in App, no Core change; Phase 78 added Settings UI + persistence wiring in App, no Core change; Phase 79 added widget render in App + human-verify close-out, no Core change)

### Performance History

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 75    | 01   | ~45 min  | 3     | 2     |
| 75    | 02   | 17 min   | 4     | 7     |
| 76    | 01   | ~6 min   | 2     | 5     |
| 77    | 01   | ~25 min  | 3     | 4     |
| 78    | 01   | ~7 min   | 3     | 4     |
| 78    | 02   | ~8 min   | 3     | 2     |
| 79    | 01   | ~10 min  | 3     | 3     |
| 79    | 02   | ~5 min   | 1     | 4     |

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
- **Plan 78-01 (2026-05-04): Temps tab UI (wiring-free) shipped.** `SettingsSnapshot` extended with 10 init-property fields (5 AppSettings bool projections + 4 sensor floats + `TempsServiceReady`). `SettingsWindow.xaml` Temps TabItem inserted at index 2 (between Stats and Behavior — tab order now Appearance=54 / Stats=285 / Temps=384 / Behavior=420). Tab body: `ChkTempsVisible` master checkbox + 2×2 WrapPanel (`Width=270`, child `Width=86`) of 4 sensor checkboxes (`ChkTempCpuVisible` / `ChkTempGpuVisible` / `ChkTempMoboVisible` / `ChkTempNvmeVisible` inside `TempSensorsPanel`) + muted `#FF999999 / FontSize=11 / Wrap` help text as sibling of TempSensorsPanel. `SettingsWindow.xaml.cs` +5 `event Action<bool>?` hooks + 5 `_Changed` handlers + `ApplyTempCheckboxNaState` private static helper encoding the D-01/D-02/D-07 three-state N/A decision tree (pre-IsReady optimistic / post-IsReady + `tempC < 0f` disabled+" (N/A)" / post-IsReady + real value enabled plain). `RefreshControls` + `PopulateControls` both extended to set IsChecked from snapshot, run 4× `ApplyTempCheckboxNaState`, then set `TempSensorsPanel.IsEnabled = s.TempsLineVisible`. 4 commits (789bcf2 RED → 989b1d2 GREEN snapshot → 73493b2 XAML → d220ba8 events+handlers). 552 MSTest green (550 baseline + 2 new SettingsSnapshot tests). **Zero deviations.**
- **Plan 79-01 (2026-05-04): Temps line widget render shipped.** `TempsText` TextBlock added as 7th and final child of `StatsPanel` in `MainWindow.xaml` (byte-for-byte UptimeText-clone styling per D-15; only `x:Name` + initial `Text=""` differ). New `private void UpdateTempsDisplay()` method in `MainWindow.xaml.cs` reads `_temperatureService?.XTempC ?? -1f` (×4) + 4 visibility bools + master, calls `FuzzyClock.Core.TemperatureFormatter.Format(...)`, applies Text-before-Visibility ordering with D-05 predicate `(_settings.TempsLineVisible && formatted.Length > 0)`. Wired into 6 call sites: (1) `_statsTimer.Tick` lambda tail — TEMP-LINE-05 piggyback (no new DispatcherTimer); (2)–(6) each of the 5 Phase 78 event handlers appended with `UpdateTempsDisplay();` after `SaveSettings();` for TEMP-TAB-05 SC5 immediate reflow. `TempsText.Foreground = brush;` landed in BOTH `ApplyTheme` (line ~1638) AND `ApplyDisplayColor` (line ~1675) per the Phase 33 critical pattern — auto-contrast participation free via `ContrastRefreshController.ColorChanged → ApplyDisplayColor`. 8 new tests in `FuzzyClock.App.Tests/TempsLineTests.cs`: 6 `[DataRow]` truth-table cases (pure static helper encodes D-05 predicate exactly) + `Format_WithFakeTempSource_ProducesExpectedLine` asserting `"CPU 52°  GPU 61°  NVMe 38°"` (Mobo omitted via -1f sentinel — TEMP-LINE-04 hide-segment path) + `Format_AllSuppressed_ReturnsEmptyString` (empty-string → Collapsed feeder path). 3 atomic plan commits (97d424c test RED → 5747390 feat XAML GREEN → d3868fc feat code-behind GREEN). 562 MSTest green (554 baseline + 8 new). REL-03 preserved (0 LHM refs in Core). **Zero deviations.** Human-verify lands in Plan 79-02.
- **Plan 79-02 (2026-05-04): Human-verify sign-off shipped.** Single metadata commit (`docs(79-02): capture human-verify sign-off`) — zero-code / verification-only plan per D-18. User walked the 22-item / 7-category checklist against `dotnet run --project FuzzyClock.App/FuzzyClock.App.csproj -c Release` on live dev hardware and replied `approved`. Dev-box render confirmed as single-segment `GPU 51°` line — matches D-19 prediction exactly. CPU / Mobo / NVMe correctly omitted via `-1f` hide-segment path (PawnIO-free baseline per Phase 75 spike). All 7 categories passed: baseline render + format shape + master-toggle reflow (immediate collapse on uncheck) + per-sensor reflow + accent color parity (UptimeText + TempsText change in lockstep) + auto-contrast participation (bright→dark desktop move both lines shift together) + timer piggyback (hover fast-refresh 500ms propagates cleanly). Regression sweep clean: all 4 clock modes (Phrase/Dial/LCD/Nixie), Phase 77 widget RMB menu, Ghost mode + proximity fade, all other Settings tabs, `settings.json` atomic-write — all unchanged. TEMP-LINE-01..06 all Complete; Phase 79 closed; milestone v4.2 is now 5/6 phases done. One pre-existing flake surfaced and logged for opportunistic fix (`PhraseEngineTests.SpecialCases_NoonAndMidnight(12,0,"noon")` ~20% probabilistic due to `EnglishPhraseProvider.NoonCandidates` random pick; introduced pre-v3.2 commit `924562e`; NOT a Phase 79 regression). 562 MSTest green preserved (no code delta). REL-03 clean. No `Co-Authored-By` trailer. **Zero deviations.**
- **Plan 78-02 (2026-05-04): MainWindow persistence wiring + human-verify shipped.** `GetCurrentSettingsSnapshot` +10 projections (5 `_settings.Temp*Visible` + 4 `_temperatureService?.XTempC ?? -1f` + `_temperatureService?.IsReady ?? false`). `OpenSettings` +5 event subscriptions (between `BatteryAlertThresholdChanged` and `Closed`), each lambda mutates `_settings = _settings with { TempXVisible = v }; SaveSettings();`. `ResetToDefaults` +5 Temp-field defaults (`TempsLineVisible=false, TempCpuVisible=true, TempGpuVisible=true, TempMoboVisible=false, TempNvmeVisible=false`) + conditional `if (_settingsWindow is { IsVisible: true }) _settingsWindow.RefreshControls(GetCurrentSettingsSnapshot());` nudge (mirrors OpenSettings:415 convention). 2 new `GetCurrentSettingsSnapshotContract_*` tests in `AppSettingsTests.cs` — contract-shape style since WPF STA prevents invoking MainWindow from MSTest. 3 commits (aee40f6 RED → 78ed7e1 GREEN snapshot extension → a09c65d persistence+reset). 554 MSTest green (552 baseline + 2 new). **Zero deviations.** Human-verify checkpoint: user walked 29-item / 7-category checklist on dev hardware — Mobo (N/A) + NVMe (N/A) disabled per PawnIO-free spike baseline; GPU enabled + readable (NVIDIA A2000); persistence confirmed via settings.json inspection (`"TempsLineVisible":true`, `"TempCpuVisible":false`); reset-to-defaults refreshes live Settings window via the `{ IsVisible: true }` pattern-match. User signed off `approved`. Post-checkpoint, user surfaced "temps line not visible on widget" — confirmed Phase 79 scope per CONTEXT D-12 (Phase 78 persists only; widget render lands in Phase 79) — user accepted.

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
- [x] Plan 78-01 (Temps tab UI) — SHIPPED 2026-05-04; SettingsSnapshot +10 fields, SettingsWindow Temps TabItem + events + N/A helper; 552 MSTest green
- [x] Plan 78-02 (MainWindow persistence wiring + human-verify) — SHIPPED 2026-05-04; GetCurrentSettingsSnapshot + OpenSettings + ResetToDefaults extensions; 29/29 human-verify approved; 554 MSTest green
- [x] Plan 79-01 (widget render) — SHIPPED 2026-05-04; TempsText TextBlock + UpdateTempsDisplay + 6 call sites + both ApplyX Foreground lines; 562 MSTest green (+8)
- [x] Plan 79-02 (human-verify checkpoint) — SHIPPED 2026-05-04; 22/22 checklist items approved; dev-box render matches D-19 expectation (`GPU 51°` single segment); zero-code / metadata-only commit
- [ ] Plan 80 [Files] must ship RID-specific LHM DLLs under `runtimes/win-x64/lib/net10.0/` + native pair
- [ ] **Pre-existing test flake (opportunistic fix, NOT Phase 79 scope):** `PhraseEngineTests.SpecialCases_NoonAndMidnight(12,0,"noon")` is ~20% probabilistic due to `EnglishPhraseProvider.NoonCandidates` random pick across 5 alternatives. Introduced in pre-v3.2 commit `924562e`. Surfaced during Phase 79 human-verify runs; not a Phase 79 regression. Fix during any future small-fix task (e.g., seed the random generator, or accept any of the 5 noon candidates in the test).

### Known Blockers

None — Phases 75, 76, 77, 78, 79 all complete (5/6 phases of milestone v4.2 shipped). Phase 80 (Release & Compliance) unblocked and next — it is the final phase of the milestone.

## Session Continuity

### What Just Happened

Phase 79 (Temps Line on Widget) closed 2026-05-04 across 2 plans + 4 plan-level commits + 1 metadata commit + 1 blocking human-verify checkpoint, completing 6 requirements (TEMP-LINE-01..06) and bringing the milestone to **5/6 phases done**. Only Phase 80 (Release & Compliance) remains.

**Plan 79-01 (autonomous widget render)** — 4 commits (`97d424c` test RED → `5747390` feat XAML GREEN → `d3868fc` feat code-behind GREEN → `145a52d` SUMMARY). `TempsText` TextBlock inserted as 7th and final child of `StatsPanel` (UptimeText-clone styling per D-15). New `private void UpdateTempsDisplay()` in `MainWindow.xaml.cs` reads 4 sensor floats null-coalesced to `-1f`, reads 4 visibility bools + master, calls `FuzzyClock.Core.TemperatureFormatter.Format(...)`, applies Text-before-Visibility ordering with D-05 predicate `(_settings.TempsLineVisible && formatted.Length > 0)`. Wired into 6 sites: `_statsTimer.Tick` tail (TEMP-LINE-05 piggyback — no new DispatcherTimer) + each of the 5 Phase 78 event handlers (TEMP-TAB-05 SC5 immediate reflow). `TempsText.Foreground = brush;` in BOTH `ApplyTheme` AND `ApplyDisplayColor` per Phase 33 critical pattern. 8 new tests in `TempsLineTests.cs` (6 DataRow truth-table + 2 formatter-consumption). 562 MSTest green (554 baseline + 8 new).

**Plan 79-02 (human-verify)** — single metadata commit (`docs(79-02): capture human-verify sign-off`). Zero-code / verification-only per D-18. User walked 22-item / 7-category checklist against `dotnet run -c Release` on live dev hardware and replied `approved`. Dev-box render matched D-19 prediction exactly: single-segment `GPU 51°` line (CPU / Mobo / NVMe absent per PawnIO-free baseline — Phase 75 spike Section 3). All 7 categories passed: baseline render + format shape (2-space sep, integer °, U+00B0) + master-toggle reflow (immediate collapse) + per-sensor reflow + accent color parity (lockstep change with UptimeText) + auto-contrast participation (bright→dark desktop move both lines shift together) + timer piggyback (hover fast-refresh 500ms propagates cleanly). Regression sweep clean across all 4 clock modes + Phase 77 RMB + Ghost mode + all Settings tabs + `settings.json` atomicity.

**One pre-existing flake surfaced during verification (NOT Phase 79 scope):** `PhraseEngineTests.SpecialCases_NoonAndMidnight(12,0,"noon")` is ~20% probabilistic due to `EnglishPhraseProvider.NoonCandidates` random pick across 5 alternatives. Introduced in pre-v3.2 commit `924562e`. Logged to Active TODOs for opportunistic fix.

**Zero deviations across both Phase 79 plans.** No Rule 1–4 auto-fixes. No `Co-Authored-By` trailers per project CLAUDE.md rule. REL-03 invariant preserved end-to-end through all 5 completed phases.

**Previous phase recap (Phase 78 Temps Tab in Settings)** — retained for context:

Phase 78 executed across 2 plans / 7 plan-level commits + 2 metadata commits + a blocking human-verify checkpoint, completing 5 requirements (TEMP-TAB-01..05) and bringing the milestone to 4/6 phases done (7/7 plans in the phase — 78-01 had 3 code tasks + 1 metadata, 78-02 had 3 code tasks + 1 metadata).

**Plan 78-01 (Temps tab UI, wiring-free)** — 4 commits (789bcf2 test RED → 989b1d2 feat GREEN snapshot extension → 73493b2 feat XAML Temps TabItem → d220ba8 feat events + handlers + N/A helper). Added 10 fields to SettingsSnapshot, inserted the Temps TabItem at XAML index 2 with a gated `TempSensorsPanel`, added 5 `Action<bool>?` events + 5 `_Changed` handlers + a `private static ApplyTempCheckboxNaState` helper encoding the D-01/D-02/D-07 three-state N/A decision tree. PopulateControls + RefreshControls extended with full N/A evaluation pass. 552 MSTest green (+2 new SettingsSnapshot tests).

**Plan 78-02 (MainWindow persistence wiring + human-verify)** — 3 code commits (aee40f6 test RED → 78ed7e1 feat snapshot-projection GREEN → a09c65d feat persistence + reset). `GetCurrentSettingsSnapshot` projects all 10 Temps fields (defensive null-conditional + `-1f` / `false` fallback on `_temperatureService` access). `OpenSettings` subscribes 5 events between `BatteryAlertThresholdChanged` and `Closed`, each handler `_settings = _settings with { ... }; SaveSettings();`. `ResetToDefaults` resets all 5 Temp fields to documented defaults (TempsLineVisible=false / CPU=true / GPU=true / Mobo=false / NVMe=false) and conditionally calls `RefreshControls(GetCurrentSettingsSnapshot())` on any open Settings window via `is { IsVisible: true }` pattern-match. 554 MSTest green (+2 new `GetCurrentSettingsSnapshotContract_*` contract-shape tests — WPF STA prevents direct invocation of MainWindow from MSTest, so tests assert the mapping contract via a constructed snapshot).

**Task 3 human-verify checkpoint** — user walked 29-item / 7-category checklist on dev hardware via `dotnet run --project FuzzyClock.App/FuzzyClock.App.csproj -c Release`. N/A pattern observed: Mobo (N/A) + NVMe (N/A) disabled as predicted by the PawnIO-free Phase 75 spike baseline; GPU label plain + enabled (NVIDIA A2000 readable). Persistence confirmed: opened Settings → toggled master ON + CPU OFF → closed + quit + relaunched → reopened Settings → master still ON, CPU still OFF; `%LOCALAPPDATA%\FuzzyClock\settings.json` contains `"TempsLineVisible":true` + `"TempCpuVisible":false`. Reset-to-defaults: tray Reset refreshed the live Settings window to the documented defaults immediately (RefreshControls nudge worked). Regression sweep: all other Settings tabs + tray menu + Phase 77 widget RMB unchanged. User replied `approved`.

**Post-checkpoint clarification:** user noted "Show temps line is checked but temps line is not visible on the widget." Confirmed this is Phase 79 scope per CONTEXT.md `<domain>` out-of-scope list and D-12 ("Phase 78 does NOT trigger any widget render path — those events hook in Phase 79. For Phase 78, the handlers only persist the values."). User accepted; Phase 78 defect-free.

**Zero deviations** across both plans. No Rule 1–4 auto-fixes. No Co-Authored-By trailers per project CLAUDE.md rule.

**Previous phase recap (Phase 77 RMB Menu)** — retained for context:

Phase 77 Plan 01 (Right-Click Menu on Widget) executed across three atomic commits plus a human-verify checkpoint:

- **Task 1 RED** — `2270c3c` (test): created `FuzzyClock.App.Tests/RightClickMenuGateTests.cs` (24 lines) with a single `[TestMethod]` `ShouldOpen_Cases` decorated with 6 `[DataRow]` rows covering the full truth table for (isDragging, isGhostActive, isCtrlAltHeld). Build failed with CS0103 (`RightClickMenuGate` type not found) — expected RED signal.
- **Task 1 GREEN** — `3bf59cf` (feat): created `FuzzyClock.App/RightClickMenuGate.cs` (30 lines). `internal static class` with `public static bool ShouldOpen(bool, bool, bool)` predicate: `if (isDragging) return false;` → `if (isGhostActive && !isCtrlAltHeld) return false;` → `return true;`. XML doc comments document the RMB-03 defence-in-depth rationale (WPF doesn't receive mouse events while WS_EX_TRANSPARENT is applied — the guard is belt-and-suspenders for the narrow window between the cursor-polling timer restoring interactivity and the ratio actually dropping). Filtered `dotnet test --filter FullyQualifiedName~RightClickMenuGateTests` reports 6/6 pass.
- **Task 2 WIRING** — `f14a566` (feat): four touchpoints in MainWindow. (1) `MainWindow.xaml` +2 lines adding `PreviewMouseRightButtonUp="Window_PreviewMouseRightButtonUp"` on the `<Window>` root (adjacent to existing `PreviewMouseWheel` wiring — uses tunneling route to fire before any child can set `Handled=true`). (2) `MainWindow.xaml.cs` `_menuOpen` field declared adjacent to `_isDragging` / `_proximityRatio`. (3) ProximityChanged lambda gets `if (_menuOpen) return;` added BEFORE `this.Opacity = _windowOpacity * (1.0 - ratio);` and AFTER the existing `_isDragging` and `_settingsWindow` early returns — `_proximityRatio = ratio;` stays UNCONDITIONAL so the next tick post-menu-close applies the current cursor position (expected resume-snap per Pitfall 5). (4) In ContentRendered immediately after `_trayIcon = _trayMenu.Build(...)`: `_trayIcon.ContextMenuStrip!.Opening += (_, _) => _menuOpen = true; _trayIcon.ContextMenuStrip!.Closed += (_, _) => _menuOpen = false;` — using `+=` (not `=`) preserves TrayMenuBuilder's `menu.Opening += SyncCheckmarks` registration; WinForms fires handlers in registration order so checkmark sync still runs before `_menuOpen` flips. (5) `Window_PreviewMouseRightButtonUp` handler: `_menuOpen` idempotence short-circuit → `RightClickMenuGate.ShouldOpen(_isDragging, _ghostMode.IsActive, _ghostMode.IsCtrlAltHeld())` gate → `_trayIcon.ContextMenuStrip!.Show(System.Windows.Forms.Cursor.Position)` → `e.Handled = true`. Fully-qualified `System.Windows.Input.MouseButtonEventArgs` avoids the known `UseWindowsForms=true` ambiguity with `System.Windows.Forms.MouseEventArgs`. Full suite `dotnet test` reported 550/0 green.
- **Task 3 HUMAN-VERIFY CHECKPOINT** — no commit (verification-only). User walked 7 checklists against `dotnet run --project FuzzyClock.App/FuzzyClock.App.csproj`: RMB-01 parity in all 4 clock modes (Phrase/Dial/LCD/Nixie) + stats panel + transparent #01000000 padding; RMB-01 checkmark parity (Ghost/Stats/Auto-Contrast/Auto-Launch toggles); RMB-02 drag suppress; RMB-03 ghost-no-CtrlAlt suppress + Ctrl+Alt override; RMB-04 opacity freeze during menu; rapid-click idempotence; regression sweep (drag-to-move, scroll-wheel opacity, tray icon menu, Settings window open from both tray and widget right-click). User signalled `"approved"` — all 7 checklists passed, no deferred items.

**TrayMenuBuilder.cs zero-diff invariant confirmed:** `git diff 2270c3c^..HEAD -- FuzzyClock.App/TrayMenuBuilder.cs | wc -l` returns 0. Single-source-of-truth for menu items, checkmarks, enabled state, and click handlers preserved — widget right-click invocation is byte-for-byte identical to tray icon invocation.

**Zero deviations from plan.** All four MainWindow touchpoints implemented exactly as specified. `_menuOpen` appears 9 times in MainWindow.xaml.cs (plan required ≥4 grep hits; the higher count reflects doc comments + field decl + ProximityChanged guard + Opening hook + Closed hook + idempotence guard — documentation density, not structural deviation).

77-01-SUMMARY.md written with full self-check section verifying all three commit hashes exist plus the TrayMenuBuilder.cs zero-diff invariant. This STATE.md update is part of the Plan 77-01 wrap-up metadata commit.

### Next Session Should Know

- **Phases 75, 76, 77, 78, 79 are all complete.** Milestone v4.2 is **5/6 phases done** (9/9 plans across the 5 complete phases — Phase 75 had 2 plans, Phases 76 and 77 had 1 each, Phases 78 and 79 had 2 each). **Only Phase 80 (Release & Compliance) remains.**
- **Phase 80 (Release & Compliance) is unblocked.** It is the final phase of milestone v4.2. Expected scope (per ROADMAP + REQUIREMENTS): (1) **REL-01** — pin `LibreHardwareMonitorLib` at exactly `0.9.6` in `FuzzyClock.App.csproj` (no floating, no range); (2) **REL-02** — CI grep gate fails build if any `WinRing0*.sys` appears in `dotnet publish` output; (3) **REL-03** — CI grep gate fails build if `LibreHardwareMonitor` appears under `FuzzyClock.Core/` (invariant verified clean across all 5 completed phases); (4) **REL-04** — `THIRD-PARTY-NOTICES.md` at repo root + shipped in installer with MPL-2.0 verbatim + LHM attribution + transitive notices; (5) **REL-05** — Inno Setup `[Files]` captures LHM DLL + all transitive DLLs (RID-specific `runtimes/win-x64/lib/net10.0/` subtree + MonoPosixHelper native pair); installer continues per-user no-UAC.
- **After Phase 80 lands:** run `/gsd:audit-milestone` to confirm all 29 requirements complete, then `/gsd:complete-milestone` to tag `v4.2` and archive the milestone.
- **Widget temps rendering patterns established (Phase 79):** (a) `TempsText` is a pure `StatsPanel` child — `StatsVisible` inherits via WPF layout cascade (no three-way compound predicate needed per D-06); (b) D-05 predicate `(master && formatted.Length > 0)` is the canonical "show-this-line" shape — Text-before-Visibility ordering prevents stale-frame artifacts; (c) Phase 33 critical pattern strictly honored — any new widget TextBlock added in the future MUST have its `.Foreground = brush;` line mirrored in BOTH `ApplyTheme` AND `ApplyDisplayColor`, else auto-contrast silently diverges; (d) handler reflow idiom: append `UpdateXDisplay();` AFTER `SaveSettings();` in each relevant event handler for immediate one-frame reflow with no widget restart.
- **Right-click menu pattern:** future UI-state gating features should clone the `RightClickMenuGate` pattern — pure static helper + `[DataRow]` parametric test table — so boolean decisions are unit-testable without UI automation.
- **TrayMenuBuilder.cs is the single source of truth** for tray menu items. Any future menu item additions, checkmark logic, or click handlers flow through `TrayMenuBuilder.Build()` and automatically propagate to both tray icon invocations and widget right-click invocations (same ContextMenuStrip instance).
- **Temps tab patterns established (Phase 78):** (a) `SettingsSnapshot` carrying service data (sensor floats + `TempsServiceReady`) keeps SettingsWindow free of `TemperatureService` dependency — clean dependency inversion; (b) `ApplyTempCheckboxNaState` three-state decision tree (pre-IsReady optimistic / disabled+" (N/A)" / enabled plain) encapsulated as `private static` helper is the pattern for any future multi-state UI degradation; (c) pattern-matching `is { IsVisible: true }` guard on `_settingsWindow` + `RefreshControls(GetCurrentSettingsSnapshot())` nudge is the canonical post-mutation refresh idiom; (d) contract-shape tests (construct inputs + build a snapshot via the same projection + assert equality) are the workaround for WPF STA-bound methods that MSTest cannot invoke directly.
- **Test count:** 562 runtime tests (445 Core + 117 App). Phase 80 (release + CI + installer) will likely add 0–few tests — scope is infrastructure + packaging, not new runtime surface. The existing 562 are the Phase 80 baseline.
- **Pre-existing test flake logged:** `PhraseEngineTests.SpecialCases_NoonAndMidnight(12,0,"noon")` ~20% probabilistic, pre-v3.2 commit `924562e`. Not Phase 80 scope; fix opportunistically in any small-fix task.
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
*State snapshot: 2026-05-04 — Phases 75, 76, 77, 78, 79 all complete (9/9 plans across 5 phases shipped); milestone v4.2 is 5/6 phases done; Phase 80 (Release & Compliance) is the final phase and is unblocked; 562 MSTest green; REL-03 invariant preserved end-to-end; TempsText rendering on widget verified live on dev hardware as single-segment `GPU 51°` line (matches D-19); 22/22 human-verify checklist approved; pre-existing `PhraseEngineTests.SpecialCases_NoonAndMidnight` flake logged for opportunistic fix*
