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

- [ ] **TEMP-TAB-01:** A new "Temps" tab appears in the Settings window between the Stats and Behavior tabs (order: Appearance / Stats / Temps / Behavior).
- [ ] **TEMP-TAB-02:** The Temps tab exposes a master "Show Temps Line" toggle; default OFF on fresh install and on upgrade from v4.1.
- [ ] **TEMP-TAB-03:** The Temps tab exposes four per-sensor checkboxes — CPU, GPU, Mobo, NVMe — with defaults CPU=ON, GPU=ON, Mobo=OFF, NVMe=ON.
- [ ] **TEMP-TAB-04:** When a sensor is unavailable on the current hardware, its checkbox is disabled and its label is suffixed with " (N/A)"; no UAC prompt is issued at any time.
- [ ] **TEMP-TAB-05:** All Temps tab settings persist to `settings.json` and restore on launch; `ResetToDefaults()` resets all five new values.

### Temps Stats Line (widget)

- [ ] **TEMP-LINE-01:** A new `TempsText` line renders inside `StatsPanel` directly below `UptimeText` when the master toggle is ON; auto-hides with the Stats panel (inherits `StatsVisible`).
- [ ] **TEMP-LINE-02:** Format is a compact inline line with 2-space separator, integer Celsius, and `°` symbol only — e.g. `CPU 52°  GPU 61°  NVMe 38°`. No C/F suffix, no unit toggle.
- [ ] **TEMP-LINE-03:** Friendly sensor labels only (`CPU`, `GPU`, `Mobo`, `NVMe`); raw LHM names (`Tctl/Tdie`, `Core #0`, etc.) are never displayed.
- [ ] **TEMP-LINE-04:** Sensors that are checked but return no valid reading are silently omitted from the line (hot-swap tolerance — e.g. removable NVMe disconnected mid-session causes a reflow, not a crash).
- [ ] **TEMP-LINE-05:** Temperature refresh piggybacks on the existing stats timer tick; minimum 2-second effective refresh for LHM reads (single-entry lock prevents overlapping `Update()` calls during hover fast-refresh).
- [ ] **TEMP-LINE-06:** The line inherits accent color like `UptimeText`; participates in auto-contrast sampling identically to existing widget text.

### Hardware Discovery & TemperatureService

- [ ] **TEMP-SVC-01:** A Phase 1 hardware-discovery spike produces a written report documenting sensor availability on a clean Win11 24H2 VM with no admin elevation and no PawnIO installed; the report records a go/no-go decision and, if no-go, a documented scope reduction.
- [ ] **TEMP-SVC-02:** `TemperatureService` is a singleton class in `FuzzyClock.App` (not `FuzzyClock.Core`); exposes `IsReady` gate and `float?` properties for CPU / GPU / Mobo / NVMe where `-1f` is the sentinel for "unavailable".
- [ ] **TEMP-SVC-03:** `TemperatureService` initializes via `Task.Run(Initialize)` with a 3-second timeout; initialization failure leaves `IsReady=false` and all sensors at the N/A sentinel; the widget does not crash.
- [ ] **TEMP-SVC-04:** `TemperatureService` disposes cleanly via a three-tier path (`Window.Closing` + `SessionEnding` + `AppDomain.ProcessExit`) with an `Interlocked` single-entry guard, releasing the LHM `Computer` handle on log-off, kill, and normal quit.
- [ ] **TEMP-SVC-05:** `ITempSource` abstraction + `FakeTempSource` enable hardware-free unit tests of the service contract.

### Persistence & Tests

- [ ] **TEST-01:** Five new `AppSettings` fields (`TempsLineVisible`, `TempCpuVisible`, `TempGpuVisible`, `TempMoboVisible`, `TempNvmeVisible`) are init-property bools with defaults matching TEMP-TAB-02 / TEMP-TAB-03.
- [ ] **TEST-02:** JSON round-trip test covers all five new fields (serialize → deserialize → all values match).
- [ ] **TEST-03:** Absent-field deserialization tests verify init defaults apply when loading a v4.1 `settings.json` with none of the five fields present.
- [ ] **TEST-04:** `TemperatureFormatter` (pure static in `FuzzyClock.Core` — no LHM reference) is unit-tested for: all-sensors-present, partial-N/A, all-N/A-returns-empty, single-sensor, correct 2-space separator, `°` symbol, integer rounding.

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
| TEMP-TAB-01 | Phase 78 | Pending |
| TEMP-TAB-02 | Phase 78 | Pending |
| TEMP-TAB-03 | Phase 78 | Pending |
| TEMP-TAB-04 | Phase 78 | Pending |
| TEMP-TAB-05 | Phase 78 | Pending |
| TEMP-LINE-01 | Phase 79 | Pending |
| TEMP-LINE-02 | Phase 79 | Pending |
| TEMP-LINE-03 | Phase 79 | Pending |
| TEMP-LINE-04 | Phase 79 | Pending |
| TEMP-LINE-05 | Phase 79 | Pending |
| TEMP-LINE-06 | Phase 79 | Pending |
| TEMP-SVC-01 | Phase 75 | Pending |
| TEMP-SVC-02 | Phase 75 | Pending |
| TEMP-SVC-03 | Phase 75 | Pending |
| TEMP-SVC-04 | Phase 75 | Pending |
| TEMP-SVC-05 | Phase 75 | Pending |
| TEST-01 | Phase 76 | Pending |
| TEST-02 | Phase 76 | Pending |
| TEST-03 | Phase 76 | Pending |
| TEST-04 | Phase 76 | Pending |
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
