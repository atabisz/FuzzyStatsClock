# Milestone v4.2 Temps & Menu — Requirements

**Milestone goal:** Add system temperature monitoring to the stats line and make the tray menu available via right-click on the widget itself.

**Version:** v4.2 (minor — follows v4.1 cadence)

**Started:** 2026-05-04

---

## v4.2 Requirements

### Right-Click Menu (RMB)

- [ ] **RMB-01:** Right-clicking anywhere on the widget opens the existing tray `ContextMenuStrip` at the cursor position with identical items, checkmarks, enabled/disabled state, and click handlers as the tray icon menu (single source of truth — byte-for-byte parity).
- [ ] **RMB-02:** Right-click is suppressed while the widget is being dragged (`_isDragging == true`) — matches existing "pause stats during drag" discipline.
- [ ] **RMB-03:** Right-click is suppressed when Ghost Mode is active AND Ctrl+Alt is not held (proximity fade / `WS_EX_TRANSPARENT` naturally routes the click through; Ctrl+Alt re-enables interaction).
- [ ] **RMB-04:** While the right-click menu is open, proximity fade is frozen — `_proximityRatio` is pinned and the widget does not change opacity until the menu closes.

### Temps Tab (Settings window)

- [x] **TEMP-TAB-01:** A new "Temps" tab appears in the Settings window between the Stats and Behavior tabs (order: Appearance / Stats / Temps / Behavior). _(Satisfied 2026-05-04 by Plan 78-01 commit `73493b2`; tab order verified Appearance=54 / Stats=285 / Temps=384 / Behavior=420; Checklist 1 passed.)_
- [x] **TEMP-TAB-02:** The Temps tab exposes a master "Show Temps Line" toggle; default OFF on fresh install and on upgrade from v4.1. _(Satisfied 2026-05-04 by Plan 78-01 (UI) + Plan 78-02 (persistence + reset); default OFF verified via fresh-install Checklist 2; reset-to-defaults restores OFF via `TempsLineVisible = false` in ResetToDefaults.)_
- [x] **TEMP-TAB-03:** The Temps tab exposes four per-sensor checkboxes — CPU, GPU, Mobo, NVMe — with defaults CPU=ON, GPU=ON, Mobo=OFF, **NVMe=OFF** (amended 2026-05-04 after spike found NVMe not enumerated on baseline hardware). Help text near the sensor group reads: _"CPU and NVMe readings may require elevated access or a helper driver (e.g. PawnIO) on some hardware; disabled checkboxes indicate the sensor is unavailable on this machine."_ _(Satisfied 2026-05-04 by Plan 78-01 commit `73493b2` (XAML) + Plan 78-02 ResetToDefaults; defaults verified via Checklist 3; help text verbatim per commit `d220ba8`.)_
- [x] **TEMP-TAB-04:** When a sensor is unavailable on the current hardware, its checkbox is disabled and its label is suffixed with " (N/A)"; no UAC prompt is issued at any time. _(Satisfied 2026-05-04 by Plan 78-01 `ApplyTempCheckboxNaState` helper in commit `d220ba8`; verified on dev box — Mobo (N/A) + NVMe (N/A) disabled, GPU enabled; NO UAC prompt observed during Checklist 4.)_
- [x] **TEMP-TAB-05:** All Temps tab settings persist to `settings.json` and restore on launch; `ResetToDefaults()` resets all five new values. _(Satisfied 2026-05-04 by Plan 78-02 commit `a09c65d`; 5 event subscriptions in OpenSettings each `_settings with { ... }; SaveSettings();`; ResetToDefaults resets all 5 fields + `RefreshControls` nudge; round-trip confirmed via `%LOCALAPPDATA%\FuzzyClock\settings.json` inspection at Checklist 5 item 21; reset confirmed at Checklist 6.)_

### Temps Stats Line (widget)

- [ ] **TEMP-LINE-01:** A new `TempsText` line renders inside `StatsPanel` directly below `UptimeText` when the master toggle is ON; auto-hides with the Stats panel (inherits `StatsVisible`).
- [ ] **TEMP-LINE-02:** Format is a compact inline line with 2-space separator, integer Celsius, and `°` symbol only — e.g. `CPU 52°  GPU 61°  NVMe 38°`. No C/F suffix, no unit toggle.
- [ ] **TEMP-LINE-03:** Friendly sensor labels only (`CPU`, `GPU`, `Mobo`, `NVMe`); raw LHM names (`Tctl/Tdie`, `Core #0`, etc.) are never displayed.
- [ ] **TEMP-LINE-04:** Sensors that are checked but return no valid reading — specifically any sensor whose `TemperatureService` property equals the `-1f` N/A sentinel — are silently omitted from the line (hot-swap tolerance — e.g. removable NVMe disconnected mid-session, NVMe not enumerated on OEM hardware, or PawnIO-gated CPU sensor on an unelevated session all cause a segment drop + line reflow, not a crash). The formatter MUST treat `-1f` as "hide this segment" in every rendering path.
- [ ] **TEMP-LINE-05:** Temperature refresh piggybacks on the existing stats timer tick; minimum 2-second effective refresh for LHM reads (single-entry lock prevents overlapping `Update()` calls during hover fast-refresh).
- [ ] **TEMP-LINE-06:** The line inherits accent color like `UptimeText`; participates in auto-contrast sampling identically to existing widget text.

### Hardware Discovery & TemperatureService

- [x] **TEMP-SVC-01:** A Phase 1 hardware-discovery spike produces a written report documenting sensor availability on a clean Win11 24H2 VM with no admin elevation and no PawnIO installed; the report records a go/no-go decision and, if no-go, a documented scope reduction. _(Satisfied 2026-05-04 → NO-GO; see [.planning/spikes/75-hardware-discovery.md](./spikes/75-hardware-discovery.md). Scope reduction amendments are owner-assigned; see STATE.md Active TODOs.)_
- [x] **TEMP-SVC-02:** `TemperatureService` is a singleton class in `FuzzyClock.App` (not `FuzzyClock.Core`); exposes `IsReady` gate and `float?` properties for CPU / GPU / Mobo / NVMe where `-1f` is the sentinel for "unavailable". _(Satisfied 2026-05-04 by Plan 75-02, commits `f6daee1`/`0041e2d`.)_
- [x] **TEMP-SVC-03:** `TemperatureService` initializes via `Task.Run(Initialize)` with a **5-second timeout** (amended 2026-05-04 from 3s after spike measured 4272ms `Computer.Open()` on dev box — see [`.planning/spikes/75-hardware-discovery.md`](./spikes/75-hardware-discovery.md) Section 5); initialization failure leaves `IsReady=false` and all sensors at the N/A sentinel; the widget does not crash. _(Satisfied 2026-05-04 by Plan 75-02.)_
- [x] **TEMP-SVC-04:** `TemperatureService` disposes cleanly via a three-tier path (`Window.Closing` + `SessionEnding` + `AppDomain.ProcessExit`) with an `Interlocked` single-entry guard, releasing the LHM `Computer` handle on log-off, kill, and normal quit. _(Satisfied 2026-05-04 by Plan 75-02, commit `e99b842`.)_
- [x] **TEMP-SVC-05:** `ITempSource` abstraction + `FakeTempSource` enable hardware-free unit tests of the service contract. _(Satisfied 2026-05-04 by Plan 75-02; 21 MSTest methods in `TemperatureServiceTests.cs`.)_

### Persistence & Tests

- [x] **TEST-01:** Five new `AppSettings` fields (`TempsLineVisible`, `TempCpuVisible`, `TempGpuVisible`, `TempMoboVisible`, `TempNvmeVisible`) are init-property bools with defaults matching TEMP-TAB-02 / TEMP-TAB-03. _(Satisfied 2026-05-04 by Plan 76-01, commit `d3822ee`; NVMe default `false` per 2026-05-04 amendment.)_
- [x] **TEST-02:** JSON round-trip test covers all five new fields (serialize → deserialize → all values match). _(Satisfied 2026-05-04 by Plan 76-01, commit `fb04fda`; 5 per-field round-trip `[TestMethod]` entries in `AppSettingsTests.cs`.)_
- [x] **TEST-03:** Absent-field deserialization tests verify init defaults apply when loading a v4.1 `settings.json` with none of the five fields present. _(Satisfied 2026-05-04 by Plan 76-01, commit `fb04fda`; 5 per-field absent-field `[TestMethod]` entries deserializing `{"FontSize":32}` minimal JSON.)_
- [x] **TEST-04:** `TemperatureFormatter` (pure static in `FuzzyClock.Core` — no LHM reference) is unit-tested for: all-sensors-present, partial-N/A, all-N/A-returns-empty, single-sensor, correct 2-space separator, `°` symbol, integer rounding. _(Satisfied 2026-05-04 by Plan 76-01, commits `e5dbb47`/`1747fd2`; 8 `[TestMethod]` entries (12 runtime via `[DataRow]` rounding table) in `TemperatureFormatterTests.cs`; REL-03 grep gate verified clean.)_

### Release & Compliance

- [ ] **REL-01:** `LibreHardwareMonitorLib` is pinned at exactly version `0.9.6` in `FuzzyClock.App.csproj`; auto-upgrade is disabled (no version range, no floating).
- [ ] **REL-02:** CI grep gate fails the build if any `WinRing0*.sys` file appears in the `dotnet publish` output directory.
- [ ] **REL-03:** CI grep gate fails the build if the string `LibreHardwareMonitor` appears anywhere in `FuzzyClock.Core/` (preserves Core's pure `net10.0` posture).
- [ ] **REL-04:** `THIRD-PARTY-NOTICES.md` exists at repo root and is shipped in the installer; includes verbatim MPL-2.0 text and attribution for `LibreHardwareMonitorLib` plus any transitive deps requiring notice.
- [ ] **REL-05:** Inno Setup `[Files]` section captures the LHM DLL and all transitive DLLs introduced by the new reference; installer continues to install per-user with no UAC prompt.

---

## Future Requirements

- Fahrenheit unit toggle
- Per-core CPU temperatures
- Temperature thresholds / alerts (row color shift at high temp)
- Fan speeds / voltages / clock rates in the same or a sibling line
- Temperature sparklines / graphs
- "Open Licenses" link in Settings pointing at `THIRD-PARTY-NOTICES.md`
- Optional PawnIO installer documentation / README pointer for users who want full sensor coverage

## Out of Scope

- **UAC prompt on any code path** — violates per-user installer invariant; unavailable sensors stay N/A forever until user installs PawnIO manually out-of-band.
- **Shipping PawnIO or WinRing0 driver files** — Defender/SmartScreen blocks; Vulnerable Driver Blocklist; no.
- **Running as administrator to enable additional sensors** — documented as out-of-scope by the "No elevation — graceful fallback" milestone decision.
- **Non-Windows platforms** — project is Windows-only by construction.
- **Alternative temperature data sources** (WMI `MSAcpi_ThermalZoneTemperature`, NVAPI direct, ADL direct, OpenHardwareMonitor) — chosen data source is LHM 0.9.6; switching sources would require a new milestone-level decision.

## Traceability

Every v4.2 REQ-ID maps to exactly one phase. 29/29 coverage (no orphans, no duplicates).

| Requirement | Phase | Status |
|-------------|-------|--------|
| RMB-01 | Phase 77 | Pending |
| RMB-02 | Phase 77 | Pending |
| RMB-03 | Phase 77 | Pending |
| RMB-04 | Phase 77 | Pending |
| TEMP-TAB-01 | Phase 78 | Complete (2026-05-04) |
| TEMP-TAB-02 | Phase 78 | Complete (2026-05-04) |
| TEMP-TAB-03 | Phase 78 | Complete (2026-05-04) |
| TEMP-TAB-04 | Phase 78 | Complete (2026-05-04) |
| TEMP-TAB-05 | Phase 78 | Complete (2026-05-04) |
| TEMP-LINE-01 | Phase 79 | Pending |
| TEMP-LINE-02 | Phase 79 | Pending |
| TEMP-LINE-03 | Phase 79 | Pending |
| TEMP-LINE-04 | Phase 79 | Pending |
| TEMP-LINE-05 | Phase 79 | Pending |
| TEMP-LINE-06 | Phase 79 | Pending |
| TEMP-SVC-01 | Phase 75 | Complete (NO-GO, 2026-05-04) |
| TEMP-SVC-02 | Phase 75 | Complete |
| TEMP-SVC-03 | Phase 75 | Complete |
| TEMP-SVC-04 | Phase 75 | Complete |
| TEMP-SVC-05 | Phase 75 | Complete |
| TEST-01 | Phase 76 | Complete (2026-05-04) |
| TEST-02 | Phase 76 | Complete (2026-05-04) |
| TEST-03 | Phase 76 | Complete (2026-05-04) |
| TEST-04 | Phase 76 | Complete (2026-05-04) |
| REL-01 | Phase 80 | Pending |
| REL-02 | Phase 80 | Pending |
| REL-03 | Phase 80 | Pending |
| REL-04 | Phase 80 | Pending |
| REL-05 | Phase 80 | Pending |

### Phase → Requirements Summary

| Phase | Requirements | Count |
|-------|--------------|-------|
| 75 — Hardware Discovery Spike + TemperatureService | TEMP-SVC-01..05 | 5 |
| 76 — AppSettings + TemperatureFormatter Tests | TEST-01..04 | 4 |
| 77 — Right-Click Menu on Widget | RMB-01..04 | 4 |
| 78 — Temps Tab in Settings | TEMP-TAB-01..05 | 5 |
| 79 — Temps Line on Widget | TEMP-LINE-01..06 | 6 |
| 80 — Release & Compliance | REL-01..05 | 5 |
| **Total** | | **29** |

---

*Requirements defined: 2026-05-04*
*Traceability filled: 2026-05-04 (roadmapper)*
