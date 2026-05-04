---
phase: 78
plan: 01
subsystem: FuzzyClock.App — Settings UI
tags: [temps-tab, settings-ui, wpf, snapshot-extension]
requires: [75-02, 76-01, 77-01]
provides: [temps-tab-ui, temps-snapshot-fields, temps-settings-events]
affects: [FuzzyClock.App/SettingsSnapshot.cs, FuzzyClock.App/SettingsWindow.xaml, FuzzyClock.App/SettingsWindow.xaml.cs, FuzzyClock.App.Tests/AppSettingsTests.cs]
tech_stack:
  added: [none]
  patterns: [master-gates-sub-panel mirror of GhostFadeRadiusPanel, init-property record extension, optimistic-pre-IsReady N/A evaluation]
key_files:
  created: []
  modified:
    - FuzzyClock.App/SettingsSnapshot.cs
    - FuzzyClock.App/SettingsWindow.xaml
    - FuzzyClock.App/SettingsWindow.xaml.cs
    - FuzzyClock.App.Tests/AppSettingsTests.cs
decisions:
  - "TDD split: RED (tests only) and GREEN (snapshot only) kept atomic per plan — allowed verifying the compile-error signal on CS0117/CS1061 before the field additions landed."
  - "PopulateControls placement: Temps block appended as the very last action (after SetActiveSwatch) to group the Phase 78 additions visually instead of interleaving with the established feature eras."
  - "ApplyTempCheckboxNaState as a private static helper rather than inline — keeps PopulateControls readable and the N/A decision tree is exercised 4× per PopulateControls call, so encapsulation is worth the indirection."
  - "Zero deviations. Plan executed verbatim."
metrics:
  duration: "~7 minutes"
  commits: 4
  files_changed: 4
  tests_added: 2
  tests_total: 552
  completed: 2026-05-04
---

# Phase 78 Plan 01: Temps Tab in Settings (Wiring-Free UI) Summary

Extended `SettingsSnapshot` with 10 temps-related projection fields, inserted the Temps TabItem at index 2 of SettingsWindow (Appearance → Stats → Temps → Behavior), and added 5 `Action<bool>?` events + 5 `_Changed` handlers + an N/A-evaluating `ApplyTempCheckboxNaState` helper — stopping short of MainWindow wiring (that lands in 78-02).

## Commits

| Hash | Message |
| ---- | ------- |
| `789bcf2` | test(78-01): add SettingsSnapshot 10-field extension tests (RED) |
| `989b1d2` | feat(78-01): extend SettingsSnapshot with 10 Temps-tab projection fields (GREEN) |
| `73493b2` | feat(78-01): insert Temps TabItem at index 2 in SettingsWindow.xaml |
| `d220ba8` | feat(78-01): add 5 Temps events + 5 handlers + RefreshControls N/A logic |

## Work Completed

### Task 1 — TDD SettingsSnapshot extension (RED → GREEN)

**RED (`789bcf2`)** — Added two `[TestMethod]` entries to `FuzzyClock.App.Tests/AppSettingsTests.cs` under a new `// ----- v4.2 Phase 78 SettingsSnapshot extension tests -----` section:

1. `SettingsSnapshot_AllTenNewFieldsAreInitSettable` — constructs a snapshot with all 10 new fields set to non-default values and asserts each reads back correctly (including `-1f` sentinel for MoboTempC).
2. `SettingsSnapshot_NewFieldsHaveZeroValueDefaults` — constructs a default snapshot and asserts all 10 new fields take C# type zero-values (snapshot is a projection, not a config model).

Build failed with the expected 30 CS0117/CS1061 errors on all 10 missing members — RED signal confirmed.

**GREEN (`989b1d2`)** — Extended `FuzzyClock.App/SettingsSnapshot.cs` with 10 new init properties in the documented order:

```csharp
public bool    TempsLineVisible   { get; init; }
public bool    TempCpuVisible     { get; init; }
public bool    TempGpuVisible     { get; init; }
public bool    TempMoboVisible    { get; init; }
public bool    TempNvmeVisible    { get; init; }
public float   CpuTempC           { get; init; }
public float   GpuTempC           { get; init; }
public float   MoboTempC          { get; init; }
public float   NvmeTempC          { get; init; }
public bool    TempsServiceReady  { get; init; }
```

Both new tests pass (2/2). Full App suite: 107/107.

### Task 2 — Temps TabItem insertion (`73493b2`)

Inserted the canonical XAML skeleton (from 78-UI-SPEC Section 2c, verbatim) between the Stats tab closing `</TabItem>` and the `<!-- ===== BEHAVIOR TAB ===== -->` comment. Result: tab order is now **Appearance (54) → Stats (285) → Temps (384) → Behavior (420)**.

Six `x:Name` identifiers landed exactly once each: `ChkTempsVisible`, `TempSensorsPanel`, `ChkTempCpuVisible`, `ChkTempGpuVisible`, `ChkTempMoboVisible`, `ChkTempNvmeVisible`.

Help-text `<TextBlock>` is a sibling of `TempSensorsPanel` (outside the panel, per D-05) so it remains readable when the master toggle is off.

Note: at this checkpoint the solution did not yet build — the XAML references 5 handlers that don't exist until Task 3.

### Task 3 — Events, handlers, PopulateControls extension, N/A helper (`d220ba8`)

Three additions to `FuzzyClock.App/SettingsWindow.xaml.cs`:

- **5 events** appended after `GhostFadeRadiusPxChanged` — `TempsLineVisibleChanged`, `TempCpuVisibleChanged`, `TempGpuVisibleChanged`, `TempMoboVisibleChanged`, `TempNvmeVisibleChanged`, all typed `Action<bool>?`.
- **PopulateControls extension** at the end of the method — sets `IsChecked` from snapshot first, then runs 4 calls to `ApplyTempCheckboxNaState`, then sets `TempSensorsPanel.IsEnabled = s.TempsLineVisible` to cascade the master-off cascade correctly at open time.
- **`ApplyTempCheckboxNaState` private static helper** — encapsulates the three-state N/A decision tree from the UI-SPEC state matrix (pre-IsReady optimistic → enabled + plain label; post-IsReady + `-1f` → disabled + `" (N/A)"` suffix; post-IsReady + real value → enabled + plain label).
- **5 Changed handlers** immediately before `Win32Window` — each guarded by `if (_suppressEvents) return;`. `ChkTempsVisible_Changed` additionally sets `TempSensorsPanel.IsEnabled = enabled` BEFORE raising `TempsLineVisibleChanged` (mirrors `ChkGhostMode_Changed` precedent so downstream synchronous `RefreshControls` calls don't clobber the panel state mid-raise).

Full solution builds with 0 errors. Full test sweep: **552/552 (445 Core + 107 App)**.

## Test Results

| Baseline | After Plan | Delta |
| -------- | ---------- | ----- |
| Core: 445 | Core: 445 | +0 |
| App: 105 | App: 107 | +2 (SettingsSnapshot tests) |
| **Total: 550** | **Total: 552** | **+2** |

Failures: 0. Skipped: 0.

## Verification Evidence

- `grep -c "public bool    TempsLineVisible" FuzzyClock.App/SettingsSnapshot.cs` → 1
- `grep -c "public float   CpuTempC" FuzzyClock.App/SettingsSnapshot.cs` → 1 (and GpuTempC/MoboTempC/NvmeTempC likewise)
- `grep -c "public bool    TempsServiceReady" FuzzyClock.App/SettingsSnapshot.cs` → 1
- `grep -c "TabItem Header=\"Temps\"" FuzzyClock.App/SettingsWindow.xaml` → 1
- All 6 Temps-tab x:Name identifiers present exactly once in SettingsWindow.xaml
- Tab order verified: Appearance (54) → Stats (285) → Temps (384) → Behavior (420)
- 10 XAML handler references (5 Checked + 5 Unchecked attribute pairs on 6 lines) point to code-behind handlers
- `grep -c "private void ChkTempsVisible_Changed" FuzzyClock.App/SettingsWindow.xaml.cs` → 1 (and the 4 per-sensor handlers likewise)
- `grep -c "private static void ApplyTempCheckboxNaState" FuzzyClock.App/SettingsWindow.xaml.cs` → 1
- `grep -c "TempSensorsPanel.IsEnabled = enabled" FuzzyClock.App/SettingsWindow.xaml.cs` → 1 (ChkTempsVisible_Changed — runtime gate)
- `grep -c "TempSensorsPanel.IsEnabled = s.TempsLineVisible" FuzzyClock.App/SettingsWindow.xaml.cs` → 1 (PopulateControls — open-time gate)
- `tempC < 0f` literal present on line 280 (D-01 sentinel threshold)
- `label + " (N/A)"` literal present (D-07 suffix)
- `dotnet build FuzzyClock.slnx -c Release` exit 0, zero errors; 32 pre-existing MSTEST0037 warnings in unrelated test files (out of scope)
- `dotnet test FuzzyClock.slnx -c Release` exit 0, 552/552 passed

## Non-Negotiable Gates

| # | Gate | Status |
| - | ---- | ------ |
| 1 | REL-03 grep (zero `LibreHardwareMonitor` in FuzzyClock.Core/) | PASS — 0 matches |
| 2 | No positional constructors on AppSettings/SettingsSnapshot | PASS — all new fields init-property |
| 3 | IsChecked assigned only in RefreshControls/PopulateControls | PASS — handlers only read IsChecked |
| 4 | Master toggle gates TempSensorsPanel.IsEnabled | PASS — ChkTempsVisible_Changed and PopulateControls both set it |
| 5 | Help TextBlock outside TempSensorsPanel | PASS — sibling of TempSensorsPanel |
| 6 | " (N/A)" suffix applied in C# helper, not XAML | PASS — ApplyTempCheckboxNaState |
| 7 | Sensor checkbox labels plain in XAML | PASS — Content="CPU"/"GPU"/"Mobo"/"NVMe" |
| 8 | Help text byte-for-byte | PASS — verbatim per TEMP-TAB-03 |
| 9 | Muted help text style `#FF999999 / FontSize=11 / Wrap` | PASS |
| 10 | Pre-IsReady optimistic early-return | PASS — `if (!isReady) { enabled + plain; return; }` |
| 11 | 6 exact x:Name identifiers | PASS |
| 12 | 5 exact event names | PASS |
| 13 | Temps TabItem at child index 2 | PASS — between Stats and Behavior |

## Files Untouched (as required)

- `FuzzyClock.App/MainWindow.xaml` — 0 byte diff
- `FuzzyClock.App/MainWindow.xaml.cs` — 0 byte diff
- `FuzzyClock.App/AppSettings.cs` — 0 byte diff (locked by Phase 76-01)
- `FuzzyClock.App/SettingsService.cs` — 0 byte diff
- `FuzzyClock.App/TemperatureService.cs` — 0 byte diff (locked by Phase 75-02)
- `FuzzyClock.App/ITempSource.cs` — 0 byte diff

## Deviations from Plan

None — plan executed exactly as written.

## Deferred Items (out of scope, logged for awareness)

32 pre-existing MSTEST0037 style warnings in test files (TemperatureServiceTests.cs, TemperatureFormatterTests.cs, various `*PhraseProviderExpandedTests.cs`) — these are style nits in code not modified by this plan. Pre-existing as of the 550-test baseline; do not block REL-03 or any other gate. Out of scope per the scope-boundary rule.

## Next-Phase Readiness

Plan 78-02 can now proceed with confidence — the UI and event surface is complete and compile-verified. 78-02 will:

1. Extend `MainWindow.xaml.cs` `GetCurrentSettingsSnapshot()` to populate the 10 new snapshot fields from `_settings.TempXVisible` + `_temperatureService.{Cpu,Gpu,Mobo,Nvme}TempC` + `_temperatureService.IsReady`.
2. Subscribe 5 MainWindow handlers to the 5 new SettingsWindow events; each handler mutates `_settings with { TempXVisible = e }` and calls `SettingsService.Save(_settings)`.
3. Extend `ResetToDefaults()` to reset all 5 new fields to documented defaults (TempsLineVisible=false, TempCpuVisible=true, TempGpuVisible=true, TempMoboVisible=false, TempNvmeVisible=false) and call `RefreshControls` so N/A state re-evaluates.
4. Add MSTest integration coverage proving the snapshot→settings→save flow.

Plan 79 (widget rendering) remains downstream of 78-02.

## Self-Check: PASSED

- FuzzyClock.App/SettingsSnapshot.cs — FOUND, contains 10 new init properties
- FuzzyClock.App/SettingsWindow.xaml — FOUND, Temps TabItem at line 384
- FuzzyClock.App/SettingsWindow.xaml.cs — FOUND, 5 events + 5 handlers + ApplyTempCheckboxNaState
- FuzzyClock.App.Tests/AppSettingsTests.cs — FOUND, 2 new tests appended
- Commit 789bcf2 — FOUND
- Commit 989b1d2 — FOUND
- Commit 73493b2 — FOUND
- Commit d220ba8 — FOUND
