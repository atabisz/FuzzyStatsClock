---
gsd_roadmap_version: 1.0
milestone: v4.2
milestone_name: Temps & Menu
created: 2026-05-04
total_phases: 6
total_requirements: 29
granularity: standard
---

# Roadmap: v4.2 Temps & Menu

**Milestone goal:** Add system temperature monitoring to the stats line and make the tray menu available via right-click on the widget itself.

**Phase numbering:** Continues from v4.1 (ended at phase 74). Phases 75–80.

**Coverage:** 29/29 v4.2 requirements mapped (no orphans, no duplicates).

---

## Phases

- [x] **Phase 75: Hardware Discovery Spike + TemperatureService** — Prove sensor coverage on clean Win11 24H2 VM, then land the service singleton gated by the go/no-go decision. _(Plan 01 complete 2026-05-04 → NO-GO; Plan 02 blocked pending scope amendment.)_ (completed 2026-05-04)
- [x] **Phase 76: AppSettings + TemperatureFormatter Tests** — Persist the five new temp-visibility bools and unit-test the pure formatter. (completed 2026-05-04)
- [x] **Phase 77: Right-Click Menu on Widget** — Reuse the existing tray ContextMenuStrip on widget right-click with drag/ghost/proximity guards. (completed 2026-05-04)
- [x] **Phase 78: Temps Tab in Settings** — New "Temps" tab between Stats and Behavior with master toggle + per-sensor checkboxes. (completed 2026-05-04)
- [x] **Phase 79: Temps Line on Widget** — Compact accent-colored line below uptime, auto-reflowing on sensor availability. (completed 2026-05-04)
- [ ] **Phase 80: Release & Compliance** — Pin LHM 0.9.6, ship THIRD-PARTY-NOTICES, CI grep gates, installer DLL capture.

---

## Phase Details

### Phase 75: Hardware Discovery Spike + TemperatureService

**Goal:** Verify that LibreHardwareMonitorLib 0.9.6 produces usable CPU/GPU/Mobo/NVMe readings on a stock Win11 24H2 VM with no admin elevation and no PawnIO, then land the `TemperatureService` singleton that the rest of the milestone depends on.

**Depends on:** Nothing (first phase of v4.2; gates every downstream phase)

**Requirements:** TEMP-SVC-01, TEMP-SVC-02, TEMP-SVC-03, TEMP-SVC-04, TEMP-SVC-05

**Success Criteria** (what must be TRUE):
  1. A written hardware-discovery report exists in `.planning/` recording, per sensor (CPU, GPU, Mobo, NVMe), whether LHM produced a valid reading on a clean Win11 24H2 baseline with no admin elevation and no PawnIO installed; the report carries a dated go/no-go decision. Minimum bar is **GPU readable**; CPU / Mobo / NVMe are best-effort with documented N/A fallback paths — a missing sensor is not a milestone blocker as long as `TemperatureService` degrades to the `-1f` sentinel without throwing. _(Satisfied 2026-05-04 → NO-GO on original strict gate; scope reduced per amendments below; see [`.planning/spikes/75-hardware-discovery.md`](./spikes/75-hardware-discovery.md).)_
  2. `TemperatureService` lives in `FuzzyClock.App` as a singleton; app startup does not block waiting on sensor init (initialization runs on a background task with a 3-second timeout) and the widget launches successfully even when initialization fails.
  3. When initialization fails or a sensor is absent, the relevant CPU/GPU/Mobo/NVMe property returns the `-1f` N/A sentinel and no exception reaches the UI thread. (As-built: `IsReady` flips true once `InitializeAsync` returns — matching `StatsService` parity — with an internal `_lhmAvailable` flag gating actual sensor reads; timeout/throw leaves `_lhmAvailable=false` and every sensor at `-1f`.)
  4. On normal quit, log-off, and forced process kill, the LHM `Computer` handle is released exactly once (`Window.Closing` + `SessionEnding` + `AppDomain.ProcessExit` with an `Interlocked` single-entry guard); no driver handle leak survives the process.
  5. `ITempSource` + `FakeTempSource` exist so `TemperatureService` contract tests run on any machine without touching hardware.

**Plans:** 2/2 plans complete

Plans:
- [x] 75-01-PLAN.md — Hardware discovery spike + go/no-go report + D-05 threading decision (wave 1) — **DONE 2026-05-04 → NO-GO**; see [`.planning/spikes/75-hardware-discovery.md`](./spikes/75-hardware-discovery.md)
- [ ] 75-02-PLAN.md — TemperatureService + ITempSource + FakeTempSource + 21 tests + three-tier dispose wiring (wave 2) — unblocked 2026-05-04 after scope amendments landed

**NO-GO scope amendments (resolved 2026-05-04):** the spike found GPU readable but NVMe not enumerated on the dev box (PawnIO-free baseline). The following amendments were applied before Plan 75-02 was unblocked:

1. ✅ **ROADMAP.md Phase 75 SC1** — minimum bar reduced to "GPU readable"; CPU/Mobo/NVMe best-effort with `-1f` N/A fallback.
2. ✅ **REQUIREMENTS.md TEMP-TAB-03** — NVMe default flipped ON → OFF; help text added about PawnIO / admin-elevation dependency.
3. ✅ **REQUIREMENTS.md TEMP-LINE-04** — `-1f` sentinel is now explicitly a "hide segment" signal across all rendering paths.
4. ✅ **Plan 75-02 + REQUIREMENTS.md TEMP-SVC-03** — init timeout raised 3s → 5s after spike measured 4272ms `Computer.Open()` (above 3s budget).

Phase 77 (RMB menu) remained unblocked throughout.

---

### Phase 76: AppSettings + TemperatureFormatter Tests

**Goal:** Persist the five new user preferences (master toggle + four per-sensor checkboxes) and prove the pure formatter that renders the temps line independent of LHM.

**Depends on:** Nothing structural (parallelizable with Phase 75 in principle, but scheduled after to keep Phase 75 as the hard go/no-go gate)

**Requirements:** TEST-01, TEST-02, TEST-03, TEST-04

**Success Criteria** (what must be TRUE):
  1. Loading the app after manually editing `settings.json` to set each of `TempsLineVisible`, `TempCpuVisible`, `TempGpuVisible`, `TempMoboVisible`, `TempNvmeVisible` to explicit values restores those exact values on next launch (JSON round-trip).
  2. Loading the app against a v4.1-era `settings.json` that contains none of the five new fields results in the documented init defaults (`TempsLineVisible=false`, `TempCpuVisible=true`, `TempGpuVisible=true`, `TempMoboVisible=false`, `TempNvmeVisible=false`) with no exception. *(Amended 2026-05-04: `TempNvmeVisible` default flipped ON→OFF per Phase 75 spike amendment to TEMP-TAB-03; NVMe unreliable on dev box.)*
  3. `TemperatureFormatter` lives in `FuzzyClock.Core` with zero reference to `LibreHardwareMonitorLib`; unit tests cover all-sensors-present, partial-N/A, all-N/A-returns-empty, single-sensor, 2-space separator, `°` symbol, and integer rounding.
  4. The full MSTest suite (Core + App) reports 0 failures after the new fields and tests land; the post-Phase-75 baseline (522 tests: 433 Core + 89 App) is strictly exceeded. *(Amended 2026-05-04: original "501" figure was pre-Phase-75; actual baseline is 522 per STATE.md.)*

**Plans:** 1/1 plans complete

Plans:
- [x] 76-01-PLAN.md — AppSettings five-field extension + TemperatureFormatter in FuzzyClock.Core + persistence & pure-function tests (wave 1) — **DONE 2026-05-04**; 4 atomic TDD commits (`fb04fda` RED → `d3822ee` GREEN; `e5dbb47` RED → `1747fd2` GREEN); 544 MSTest green (522 baseline + 22 new); REL-03 preserved.

---

### Phase 77: Right-Click Menu on Widget

**Goal:** When the user right-clicks anywhere on the widget, the existing tray `ContextMenuStrip` opens at the cursor with byte-for-byte parity to the tray icon menu, respecting the widget's drag, ghost, and proximity invariants.

**Depends on:** Nothing (can run in parallel with the temps chain — no TempService or AppSettings changes required)

**Requirements:** RMB-01, RMB-02, RMB-03, RMB-04

**Success Criteria** (what must be TRUE):
  1. Right-clicking on the widget opens the exact same `ContextMenuStrip` instance used by the tray icon (single source of truth) at the cursor position; items, checkmarks, enabled/disabled state, and click handlers are identical byte-for-byte to the tray invocation.
  2. While the widget is being dragged (`_isDragging == true`), right-click is suppressed — no menu appears, matching the existing "pause stats during drag" discipline.
  3. When Ghost Mode is active and Ctrl+Alt is not held, right-click is suppressed (the `WS_EX_TRANSPARENT` click-through path routes the click to whatever is below); holding Ctrl+Alt while proximity-faded restores interactivity and the menu opens normally.
  4. Opening the right-click menu freezes proximity fade: `_proximityRatio` is pinned and the widget holds its current opacity until the menu closes, after which normal fade behavior resumes.

**Plans:** 1/1 plans complete

Plans:
- [ ] 77-01-PLAN.md — RightClickMenuGate pure helper + MainWindow PreviewMouseRightButtonUp wiring + Opening/Closed _menuOpen hooks + ProximityChanged guard (wave 1)

---

### Phase 78: Temps Tab in Settings

**Goal:** A new "Temps" tab appears in the Settings window between Stats and Behavior, exposing the master toggle and per-sensor checkboxes with N/A degradation driven by `TemperatureService.IsReady`.

**Depends on:** Phase 75 (needs `TemperatureService` for N/A probe), Phase 76 (needs persisted AppSettings fields)

**Requirements:** TEMP-TAB-01, TEMP-TAB-02, TEMP-TAB-03, TEMP-TAB-04, TEMP-TAB-05

**Success Criteria** (what must be TRUE):
  1. Opening Settings shows four tabs in the order Appearance / Stats / **Temps** / Behavior, matching the established tab styling.
  2. The Temps tab exposes a master "Show Temps Line" checkbox (default OFF on fresh install and on upgrade from v4.1) and four per-sensor checkboxes — CPU, GPU, Mobo, NVMe — with defaults CPU=ON, GPU=ON, Mobo=OFF, NVMe=ON.
  3. On hardware where a sensor is unavailable, that sensor's checkbox is disabled and its label is suffixed with " (N/A)"; no UAC prompt is issued at any point during Settings open or toggle.
  4. Toggling any of the five controls persists to `settings.json` immediately and restores on next launch; "Reset to Defaults" resets all five values back to their documented defaults.
  5. The master toggle gates the temps line on the widget live (see Phase 79); per-sensor toggles add or remove the corresponding sensor from the rendered line with no widget restart.

**Plans:** 2/2 plans complete

Plans:
- [x] 78-01-PLAN.md -- SettingsSnapshot 10-field extension + SettingsWindow XAML Temps tab + 5 events + 5 handlers + RefreshControls N/A logic (wave 1) — **DONE 2026-05-04**; 4 commits (`789bcf2` RED → `989b1d2` GREEN snapshot → `73493b2` XAML → `d220ba8` events+handlers); 552 MSTest green (+2)
- [x] 78-02-PLAN.md -- MainWindow.GetCurrentSettingsSnapshot extension + 5 event subscriptions + ResetToDefaults extension + human-verify checkpoint (wave 2) — **DONE 2026-05-04**; 3 commits (`aee40f6` RED → `78ed7e1` GREEN snapshot-projection → `a09c65d` persistence+reset); 554 MSTest green (+2); 29/29 human-verify checklist approved

---

### Phase 79: Temps Line on Widget

**Goal:** A compact accent-colored temperature line renders inside `StatsPanel` directly below `UptimeText` when the master toggle is ON, piggybacking the existing stats timer and gracefully reflowing when sensors come and go.

**Depends on:** Phase 75 (needs `TemperatureService`), Phase 76 (needs persisted settings), Phase 78 (needs toggle wiring from Settings events)

**Requirements:** TEMP-LINE-01, TEMP-LINE-02, TEMP-LINE-03, TEMP-LINE-04, TEMP-LINE-05, TEMP-LINE-06

**Success Criteria** (what must be TRUE):
  1. When "Show Temps Line" is ON and Stats panel is visible, `TempsText` appears directly below `UptimeText` inside `StatsPanel`; when Stats panel is hidden, `TempsText` auto-hides with it; when the master toggle is OFF, `TempsText` is collapsed regardless of Stats visibility.
  2. The rendered line uses compact inline format with a 2-space separator, integer Celsius, and `°` symbol only — e.g. `CPU 52°  GPU 61°  NVMe 38°`; no C/F suffix, no unit toggle.
  3. Only friendly labels (`CPU`, `GPU`, `Mobo`, `NVMe`) appear on the line; raw LHM sensor names (`Tctl/Tdie`, `Core #0`, etc.) never surface.
  4. Sensors that are checked in Settings but return no valid reading (e.g. NVMe hot-removed mid-session) are silently omitted from the line; the remaining sensors reflow without a crash or visible exception.
  5. Temperature reads piggyback on the existing stats timer tick with a 2-second effective minimum for LHM reads (single-entry lock on `Update()` prevents overlapping calls during the 0.5s hover fast-refresh); no new `DispatcherTimer` is introduced.
  6. `TempsText` inherits the accent color like `UptimeText` and participates in auto-contrast sampling identically to the rest of the widget text.

**Plans:** 2/2 plans complete

Plans:
- [x] 79-01-PLAN.md -- TempsText TextBlock + UpdateTempsDisplay + timer/handler wiring + ApplyTheme/ApplyDisplayColor extension + TempsLineTests (wave 1) — **DONE 2026-05-04**; 3 commits (`97d424c` test RED → `5747390` XAML GREEN → `d3868fc` code-behind GREEN); 562 MSTest green (+8)
- [x] 79-02-PLAN.md -- Human-verify checklist (22 items / 7 categories) on live dev hardware (wave 2) — **DONE 2026-05-04**; single metadata commit `docs(79-02): capture human-verify sign-off`; 22/22 approved; dev-box render confirmed as `GPU 51°` single segment per D-19

---

### Phase 80: Release & Compliance

**Goal:** Ship a license-clean, per-user, no-UAC installer with CI gates that permanently prevent the two failure modes identified in research — a stray WinRing0 `.sys` file or LHM creeping into `FuzzyClock.Core`.

**Depends on:** Phase 79 (full integrated artifact must exist before installer and CI gates validate it)

**Requirements:** REL-01, REL-02, REL-03, REL-04, REL-05

**Success Criteria** (what must be TRUE):
  1. `FuzzyClock.App.csproj` pins `LibreHardwareMonitorLib` at exactly version `0.9.6` — no floating version, no range; `dotnet list package` confirms the pinned version.
  2. The CI pipeline fails the build if any `WinRing0*.sys` file appears in the `dotnet publish` output directory (grep gate wired into the release workflow).
  3. The CI pipeline fails the build if the string `LibreHardwareMonitor` appears anywhere under `FuzzyClock.Core/`, preserving Core's pure `net10.0` posture and hardware-free test invariant.
  4. `THIRD-PARTY-NOTICES.md` exists at repo root, ships inside the installer, and contains verbatim MPL-2.0 text plus attribution for `LibreHardwareMonitorLib` and any transitive dependencies requiring notice.
  5. Running `FuzzyClockSetup-4.2.*.exe` on a clean Win11 VM installs to `%LOCALAPPDATA%\Programs\FuzzyClock\` with no UAC prompt; the installed folder contains the LHM DLL and all transitive DLLs introduced by the new reference; the installed build launches and renders the temps line on supported hardware.

**Plans:** TBD

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 75. Hardware Discovery Spike + TemperatureService | 2/2 | Complete    | 2026-05-04 |
| 76. AppSettings + TemperatureFormatter Tests | 1/1 | Complete    | 2026-05-04 |
| 77. Right-Click Menu on Widget | 1/1 | Complete    | 2026-05-04 |
| 78. Temps Tab in Settings | 2/2 | Complete    | 2026-05-04 |
| 79. Temps Line on Widget | 2/2 | Complete    | 2026-05-04 |
| 80. Release & Compliance | 0/0 | Not started | - |

---

## Dependency Graph

```
Phase 75 (Spike + TempService) ──┬── Phase 78 (Temps Tab) ── Phase 79 (Temps Line) ── Phase 80 (Release)
                                 │                                                    │
Phase 76 (AppSettings + Tests) ──┘                                                    │
                                                                                      │
Phase 77 (Right-Click Menu) ──────────────────────────────────────────────────────────┘
```

Phase 77 (RMB) runs independently of the temps chain. Phase 80 integrates everything.

---

*Roadmap drafted: 2026-05-04 — derived from v4.2 requirements + research recommendations*

