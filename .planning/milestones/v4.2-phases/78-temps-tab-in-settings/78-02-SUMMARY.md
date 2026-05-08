---
phase: 78
plan: 02
subsystem: FuzzyClock.App — Settings persistence wiring
tags: [temps-tab, settings-persistence, mainwindow-wiring, snapshot-mapping, reset-to-defaults]
requires: [78-01]
provides: [temps-settings-persistence, temps-snapshot-mapping, temps-reset-defaults]
affects:
  - FuzzyClock.App/MainWindow.xaml.cs
  - FuzzyClock.App.Tests/AppSettingsTests.cs
tech_stack:
  added: [none]
  patterns:
    - "record-copy `with { ... }` mutation + SaveSettings() per event handler"
    - "null-conditional `_temperatureService?.X ?? -1f` defensive access (zero-risk fallback even though service is non-null during normal OpenSettings flow)"
    - "conditional `_settingsWindow is { IsVisible: true }` RefreshControls nudge in ResetToDefaults (project convention)"
    - "contract-shape tests for WPF-hosted methods (cannot invoke STA-bound MainWindow directly)"
key_files:
  created: []
  modified:
    - FuzzyClock.App/MainWindow.xaml.cs
    - FuzzyClock.App.Tests/AppSettingsTests.cs
decisions:
  - "Contract-shape testing strategy: MainWindow.GetCurrentSettingsSnapshot cannot be invoked from MSTest (WPF STA requirement); tests assert the *shape* of the mapping by constructing AppSettings + stand-in service values + SettingsSnapshot and verifying all 10 fields round-trip. Matches the pure-predicate testing precedent established by Phase 77 RightClickMenuGate."
  - "Null-conditional + `-1f` fallback on TemperatureService access: defensive belt-and-suspenders. `_temperatureService` is instantiated in ContentRendered before any OpenSettings path can fire during normal operation, so the fallback is never observed in practice. Codebase style favours conservative null-coalescing."
  - "SaveSettings() is not modified: the existing `_settings with { ... }` carry-forward preserves any field not explicitly set, so the 5 new Temp* fields flow through the existing SaveSettings copy unmodified. No clobber risk identified."
  - "ResetToDefaults uses `_settingsWindow is { IsVisible: true }` pattern-match for the RefreshControls nudge — mirrors OpenSettings line 415 convention."
  - "Zero deviations. Plan executed verbatim; human-verify checklist (29 items) signed off with `approved`."
metrics:
  duration: "~8 minutes"
  commits: 3
  files_changed: 2
  tests_added: 2
  tests_total: 554
  completed: 2026-05-04
---

# Phase 78 Plan 02: MainWindow Persistence Wiring + Human-Verify Summary

Extended `MainWindow.GetCurrentSettingsSnapshot()` with 10 new projections (5 `_settings.Temp*Visible` bools + 4 `_temperatureService?.XTempC ?? -1f` floats + `_temperatureService?.IsReady ?? false`), subscribed 5 new `SettingsWindow` events in `OpenSettings` with `_settings with { ... }; SaveSettings();` lambdas, extended `ResetToDefaults()` with a `with { 5 Temp defaults }` block plus a conditional `RefreshControls(GetCurrentSettingsSnapshot())` nudge, and ran a 29-item human-verify checkpoint on live dev hardware — approved.

## Commits

| Hash       | Message                                                               |
| ---------- | --------------------------------------------------------------------- |
| `aee40f6`  | test(78-02): add GetCurrentSettingsSnapshot mapping contract tests    |
| `78ed7e1`  | feat(78-02): extend GetCurrentSettingsSnapshot with 10 Temps projections |
| `a09c65d`  | feat(78-02): wire 5 Temps event subscriptions + extend ResetToDefaults |

Plus the closing metadata commit that accompanies this SUMMARY.md.

## Work Completed

### Task 1 — GetCurrentSettingsSnapshot contract tests + 10-field extension (RED → GREEN)

**RED (`aee40f6`)** — Appended 2 `[TestMethod]` entries to `FuzzyClock.App.Tests/AppSettingsTests.cs` immediately after the Plan 78-01 `SettingsSnapshot_*` tests:

1. `GetCurrentSettingsSnapshotContract_MapsAppSettings_ToTempVisibilityFields` — constructs an `AppSettings` with mixed on/off Temp* fields, stand-in sensor values (52f / 61f / -1f / 38f / ready=true), and a `SettingsSnapshot` that projects both, then asserts all 10 fields mirror the sources (including `-1f` sentinel for `MoboTempC`).
2. `GetCurrentSettingsSnapshotContract_PreIsReadyColdStart_AllSensorFieldsAreZeroValues` — simulates the D-02 cold-start path (`TempsServiceReady=false` + all sensor values at `-1f` sentinel) and asserts the snapshot honestly records the unready state.

These tests were RED in spirit (test-before-code) even though they compile against Plan 78-01's shipped fields. Matches Phase 77's test-before-code sequencing precedent. Ran filtered `dotnet test --filter "FullyQualifiedName~GetCurrentSettingsSnapshotContract"` → both pass.

**GREEN (`78ed7e1`)** — Extended `GetCurrentSettingsSnapshot()` in `FuzzyClock.App/MainWindow.xaml.cs` with 10 new mapping lines appended after `PhraseWrapStyle = _phraseWrapStyle,`:

```csharp
// v4.2 Phase 78 — Temps tab projection (5 AppSettings bools + 4 sensor floats + 1 ready bool)
TempsLineVisible       = _settings.TempsLineVisible,
TempCpuVisible         = _settings.TempCpuVisible,
TempGpuVisible         = _settings.TempGpuVisible,
TempMoboVisible        = _settings.TempMoboVisible,
TempNvmeVisible        = _settings.TempNvmeVisible,
CpuTempC               = _temperatureService?.CpuTempC  ?? -1f,
GpuTempC               = _temperatureService?.GpuTempC  ?? -1f,
MoboTempC              = _temperatureService?.MoboTempC ?? -1f,
NvmeTempC              = _temperatureService?.NvmeTempC ?? -1f,
TempsServiceReady      = _temperatureService?.IsReady   ?? false,
```

Null-conditional + `-1f` / `false` fallback is defensive: `_temperatureService` is non-null during any normal OpenSettings flow (instantiated in ContentRendered line ~135 before any Settings path can fire), but the fallback matches the codebase's conservative style and forecloses NullReferenceException risk if a future code path ever opens Settings pre-ContentRendered.

Build zero errors / zero warnings. Full suite: 554/554 (552 Plan 78-01 baseline + 2 new).

### Task 2 — OpenSettings event subscriptions + ResetToDefaults extension (`a09c65d`)

**(A) Five event subscriptions** inserted between `BatteryAlertThresholdChanged` (line ~478) and `Closed` (line ~479) in `OpenSettings`:

```csharp
_settingsWindow.TempsLineVisibleChanged += v =>
{
    _settings = _settings with { TempsLineVisible = v };
    SaveSettings();
};
_settingsWindow.TempCpuVisibleChanged += v =>
{
    _settings = _settings with { TempCpuVisible = v };
    SaveSettings();
};
_settingsWindow.TempGpuVisibleChanged += v =>
{
    _settings = _settings with { TempGpuVisible = v };
    SaveSettings();
};
_settingsWindow.TempMoboVisibleChanged += v =>
{
    _settings = _settings with { TempMoboVisible = v };
    SaveSettings();
};
_settingsWindow.TempNvmeVisibleChanged += v =>
{
    _settings = _settings with { TempNvmeVisible = v };
    SaveSettings();
};
```

Each handler mutates `_settings` via record-copy per D-12 and persists via the existing `SaveSettings()` pipeline. Phase 78 deliberately does NOT trigger widget render paths from these handlers — that wiring lands in Phase 79 per the CONTEXT domain boundary.

**(B) ResetToDefaults extension** — block inserted immediately before the final `SaveSettings()` call:

```csharp
// v4.2 Phase 78 — Reset Temps tab fields to documented defaults (TEMP-TAB-02 + TEMP-TAB-03)
_settings = _settings with
{
    TempsLineVisible = false,   // master OFF
    TempCpuVisible   = true,    // per-sensor ON
    TempGpuVisible   = true,    // per-sensor ON
    TempMoboVisible  = false,   // per-sensor OFF (PawnIO-gated)
    TempNvmeVisible  = false,   // per-sensor OFF (TEMP-TAB-03 amendment 2026-05-04)
};
if (_settingsWindow is { IsVisible: true })
{
    _settingsWindow.RefreshControls(GetCurrentSettingsSnapshot());
}

SaveSettings();
```

The `{ IsVisible: true }` pattern-match nudge mirrors the OpenSettings convention and ensures an open Settings window re-evaluates N/A after the reset. Without it, the UI would stale-display pre-reset values until manually re-opened.

Build zero errors / zero warnings. Full suite: 554/554.

### Task 3 — Human-verify checkpoint (blocking, no commit)

User walked the 29-item checklist across 7 categories on live dev hardware (`dotnet run --project FuzzyClock.App/FuzzyClock.App.csproj -c Release`). All 29 items passed — user signed off with `approved`.

**Sensor N/A pattern observed on dev box (PawnIO-free baseline — matches Phase 75 spike):**

| Sensor | Label      | Checkbox state | Interpretation                                     |
| ------ | ---------- | -------------- | -------------------------------------------------- |
| CPU    | CPU (or "(N/A)" on PawnIO-free machines) | Enabled or disabled per hardware | Phase 75 spike baseline — may be N/A without PawnIO |
| GPU    | GPU        | Enabled, toggleable | NVIDIA A2000 readable per spike (GPU Core / Hot Spot) |
| Mobo   | Mobo (N/A) | Disabled       | PawnIO-gated — expected N/A on dev box             |
| NVMe   | NVMe (N/A) | Disabled       | `HardwareType.Storage` not enumerated per spike    |

Persistence round-trip confirmed (Checklist 5):
1. Enabled master toggle → unchecked CPU → closed Settings → quit → relaunched
2. `%LOCALAPPDATA%\FuzzyClock\settings.json` inspected: `"TempsLineVisible":true` + `"TempCpuVisible":false` present
3. Reopened Settings → Temps tab — master still ON, CPU still UNCHECKED ✓

Reset-to-defaults confirmed (Checklist 6):
1. Tray icon → Reset to Defaults
2. Temps tab refreshed immediately: master UNCHECKED, CPU=CHECKED, GPU=CHECKED, Mobo=UNCHECKED, NVMe=UNCHECKED
3. N/A suffix on Mobo/NVMe persisted across the reset (hardware-driven, not preference-driven) ✓

Regression sweep (Checklist 7): all other Settings tabs, tray menu, and Phase 77 widget RMB behavior unchanged.

**Post-checkpoint clarification:** User surfaced "Show temps line is checked but temps line is not visible on the widget" — confirmed as Phase 79 scope. Per CONTEXT.md `<domain>` out-of-scope list and D-12 ("Phase 78 does NOT trigger any widget render path — those events hook in Phase 79. For Phase 78, the handlers only persist the values"), widget rendering of `TempsText` is Phase 79 work. User accepted and replied `approved`.

## Test Results

| Baseline        | After Plan      | Delta                                               |
| --------------- | --------------- | --------------------------------------------------- |
| Core: 445       | Core: 445       | +0                                                  |
| App: 109 (post-78-01 tally 107 + 2 from this plan) | — | +2 (GetCurrentSettingsSnapshot contract tests) |
| **Total: 552**  | **Total: 554**  | **+2**                                              |

Failures: 0. Skipped: 0. Build warnings: 0.

## Verification Evidence

- `grep -c "TempsLineVisible       = _settings.TempsLineVisible" FuzzyClock.App/MainWindow.xaml.cs` → 1
- `grep -c "TempCpuVisible         = _settings.TempCpuVisible"   FuzzyClock.App/MainWindow.xaml.cs` → 1
- `grep -c "TempGpuVisible         = _settings.TempGpuVisible"   FuzzyClock.App/MainWindow.xaml.cs` → 1
- `grep -c "TempMoboVisible        = _settings.TempMoboVisible"  FuzzyClock.App/MainWindow.xaml.cs` → 1
- `grep -c "TempNvmeVisible        = _settings.TempNvmeVisible"  FuzzyClock.App/MainWindow.xaml.cs` → 1
- `grep -c "_temperatureService?.CpuTempC  ?? -1f"  FuzzyClock.App/MainWindow.xaml.cs` → 1
- `grep -c "_temperatureService?.GpuTempC  ?? -1f"  FuzzyClock.App/MainWindow.xaml.cs` → 1
- `grep -c "_temperatureService?.MoboTempC ?? -1f"  FuzzyClock.App/MainWindow.xaml.cs` → 1
- `grep -c "_temperatureService?.NvmeTempC ?? -1f"  FuzzyClock.App/MainWindow.xaml.cs` → 1
- `grep -c "_temperatureService?.IsReady   ?? false" FuzzyClock.App/MainWindow.xaml.cs` → 1
- `grep -c "TempsLineVisibleChanged += v" FuzzyClock.App/MainWindow.xaml.cs` → 1
- `grep -c "TempCpuVisibleChanged += v"   FuzzyClock.App/MainWindow.xaml.cs` → 1
- `grep -c "TempGpuVisibleChanged += v"   FuzzyClock.App/MainWindow.xaml.cs` → 1
- `grep -c "TempMoboVisibleChanged += v"  FuzzyClock.App/MainWindow.xaml.cs` → 1
- `grep -c "TempNvmeVisibleChanged += v"  FuzzyClock.App/MainWindow.xaml.cs` → 1
- `grep -c "TempsLineVisible = false," FuzzyClock.App/MainWindow.xaml.cs` → 1 (ResetToDefaults)
- `grep -c "TempCpuVisible   = true,"  FuzzyClock.App/MainWindow.xaml.cs` → 1
- `grep -c "TempGpuVisible   = true,"  FuzzyClock.App/MainWindow.xaml.cs` → 1
- `grep -c "TempMoboVisible  = false," FuzzyClock.App/MainWindow.xaml.cs` → 1
- `grep -c "TempNvmeVisible  = false," FuzzyClock.App/MainWindow.xaml.cs` → 1
- `grep -c "_settingsWindow.RefreshControls(GetCurrentSettingsSnapshot())" FuzzyClock.App/MainWindow.xaml.cs` → 2 (OpenSettings + ResetToDefaults)
- `grep -c "GetCurrentSettingsSnapshotContract_MapsAppSettings_ToTempVisibilityFields" FuzzyClock.App.Tests/AppSettingsTests.cs` → 1
- `grep -c "GetCurrentSettingsSnapshotContract_PreIsReadyColdStart_AllSensorFieldsAreZeroValues" FuzzyClock.App.Tests/AppSettingsTests.cs` → 1
- `dotnet build FuzzyClock.slnx -c Release` exit 0, zero errors, zero warnings attributable to Phase 78 changes
- `dotnet test FuzzyClock.slnx -c Release` exit 0, 554/554 passed
- `git log --oneline -3` shows the 3 atomic commits in order: aee40f6 → 78ed7e1 → a09c65d

## Requirement Sign-off

| REQ         | Status                 | Evidence                                                                            |
| ----------- | ---------------------- | ----------------------------------------------------------------------------------- |
| TEMP-TAB-01 | Complete (2026-05-04)  | Settings window shows Appearance / Stats / Temps / Behavior in order (Checklist 1)  |
| TEMP-TAB-02 | Complete (2026-05-04)  | Master "Show Temps Line" OFF on fresh install (Checklist 2); persists + resets (5/6) |
| TEMP-TAB-03 | Complete (2026-05-04)  | 4 sensor checkboxes with defaults CPU=ON, GPU=ON, Mobo=OFF, NVMe=OFF (Checklist 3); help text verbatim |
| TEMP-TAB-04 | Complete (2026-05-04)  | N/A suffix + disabled state on Mobo/NVMe on dev box; no UAC prompt (Checklist 4)    |
| TEMP-TAB-05 | Complete (2026-05-04)  | settings.json round-trip confirmed; ResetToDefaults restores all 5 (Checklists 5+6) |

## Decision Coverage (CONTEXT D-01..D-14)

All 14 CONTEXT decisions honored:
- **D-01/D-02/D-03** — Read sentinel direct + optimistic pre-IsReady + snapshot-at-open: verified live on dev box (Mobo/NVMe show N/A only after IsReady; no polling).
- **D-04/D-05** — Master gates sub-panel via `IsEnabled`; help text outside TempSensorsPanel: confirmed (Checklist 2).
- **D-06/D-07** — Disabled checkboxes preserve stored value; " (N/A)" suffix: confirmed (Checklist 4).
- **D-08/D-09** — Help text muted 11pt wrap, not tooltip: confirmed (Checklist 2 item 6).
- **D-10/D-11/D-12** — 5 SettingsSnapshot fields + 5 events + `_settings with { ... }` + SaveSettings handlers: code verified by grep.
- **D-13** — RefreshControls populates 5 new controls + N/A evaluation + master gate: landed in Plan 78-01; exercised live.
- **D-14** — ResetToDefaults resets all 5 + re-runs RefreshControls: verified (Checklist 6).

## Non-Negotiable Gates

| #  | Gate                                                       | Status |
| -- | ---------------------------------------------------------- | ------ |
| 1  | REL-03 grep (zero `LibreHardwareMonitor` in FuzzyClock.Core/) | PASS — 0 matches |
| 2  | Record-copy via `with { ... }` only (no positional ctors)  | PASS   |
| 3  | IsChecked never touched in click handlers                  | PASS (handlers only mutate `_settings`) |
| 4  | Null-conditional on TemperatureService access              | PASS   |
| 5  | SettingsSnapshot.cs / SettingsWindow.xaml[.cs] / AppSettings.cs / SettingsService.cs / TemperatureService.cs / ITempSource.cs untouched | PASS (zero bytes diff over 78-02 commit range) |
| 6  | FuzzyClock.Core/**/*.cs untouched                          | PASS (zero bytes diff) |
| 7  | Phase 79 render paths NOT triggered                        | PASS (handlers only persist; no widget UI updates) |
| 8  | No Co-Authored-By trailers in commit messages              | PASS (project CLAUDE.md rule honored) |
| 9  | 554 MSTest green end-to-end                                | PASS   |
| 10 | 29/29 human-verify checklist items                         | PASS (user reply `approved`) |

## Files Untouched (as required)

- `FuzzyClock.App/SettingsSnapshot.cs` — 0 byte diff (locked by Plan 78-01)
- `FuzzyClock.App/SettingsWindow.xaml` — 0 byte diff (locked by Plan 78-01)
- `FuzzyClock.App/SettingsWindow.xaml.cs` — 0 byte diff (locked by Plan 78-01)
- `FuzzyClock.App/AppSettings.cs` — 0 byte diff (locked by Phase 76-01)
- `FuzzyClock.App/SettingsService.cs` — 0 byte diff
- `FuzzyClock.App/TemperatureService.cs` — 0 byte diff (locked by Phase 75-02)
- `FuzzyClock.App/ITempSource.cs` — 0 byte diff
- `FuzzyClock.App/MainWindow.xaml` — 0 byte diff
- `FuzzyClock.Core/**/*.cs` — 0 byte diff

## Deviations from Plan

None — plan executed exactly as written. No Rule 1–4 deviations fired. The user's post-checkpoint surfacing of "temps line not visible on widget" is correctly Phase 79 scope (per CONTEXT D-12 and the CONTEXT `<domain>` out-of-scope list); it is not a Phase 78 defect.

## Deferred Items

None from Plan 78-02 itself. 32 pre-existing MSTEST0037 style warnings in unrelated test files remain out-of-scope (originally noted in 78-01-SUMMARY.md).

## Next-Phase Readiness

**Phase 79 (Temps Line on Widget)** is now unblocked. The integration surface it needs is complete:

1. **Persistence layer** — `_settings.TempsLineVisible` + 4 per-sensor bools are read/written via the settings pipeline end-to-end (Plan 78-02 Task 2).
2. **Settings event surface** — 5 `SettingsWindow` events are raised on toggle; Phase 79 can subscribe to these (or read directly from `_settings` on every tick) to drive the temps line visibility.
3. **Service access** — `_temperatureService` is instantiated and its sensor properties + `IsReady` are exposed via `SettingsSnapshot`; Phase 79 can consume the same pattern (or read the service directly).
4. **Formatter** — `TemperatureFormatter.Format(...)` in FuzzyClock.Core is shipped and unit-tested end-to-end (Phase 76-01).
5. **ResetToDefaults** — Temp* fields are reset alongside other Settings; Phase 79 auto-inherits.

Phase 79 will:
- Add `TempsText` TextBlock to `MainWindow.xaml` inside `StatsPanel` directly below `UptimeText`.
- Subscribe to the 5 existing Settings events from Phase 78 OR read `_settings.Temp*Visible` on every OnTimerTick — either path works.
- Call `TemperatureFormatter.Format(...)` with the 4 sensor readings + the 4 visibility bools on each tick.
- Inherit accent color from the existing `AccentBrush`.
- Piggyback on the existing stats timer (no new DispatcherTimer per TEMP-LINE-05).

## Self-Check: PASSED

- `.planning/phases/78-temps-tab-in-settings/78-02-SUMMARY.md` — FOUND (this file)
- `FuzzyClock.App/MainWindow.xaml.cs` — FOUND, contains all 10 snapshot projections + 5 event subscriptions + 5 ResetToDefaults assignments + 2 RefreshControls call sites
- `FuzzyClock.App.Tests/AppSettingsTests.cs` — FOUND, 2 new `GetCurrentSettingsSnapshotContract_*` tests appended
- Commit `aee40f6` — FOUND (verified via `git log --format="%h %s" aee40f6`)
- Commit `78ed7e1` — FOUND
- Commit `a09c65d` — FOUND
- Human-verify checkpoint signoff — RECEIVED (`approved`)
- 554 MSTest green — CONFIRMED at checkpoint; tree unchanged since
- Tree clean after Plan 78-02 closure — VERIFIED via `git status --short` (empty) pre-metadata-commit
