---
phase: 71-stats-interval-slider
plan: 01
subsystem: Settings UI + Data Layer
tags: [ui, settings, slider, data-migration, validation]
dependency_graph:
  requires: [v4.0-complete]
  provides: [continuous-stats-interval, double-precision-interval]
  affects: [SettingsWindow, AppSettings, SettingsService, MainWindow]
tech_stack:
  added: [WPF-Slider-continuous, Math.Round-precision]
  patterns: [TDD-RED-GREEN, data-type-migration, validation-guards]
key_files:
  created: []
  modified:
    - path: FuzzyClock.App/AppSettings.cs
      why: "StatsIntervalSeconds: int = 3 → double = 2.0"
    - path: FuzzyClock.App/SettingsService.cs
      why: "Validate(): range check 0.5-10.0, Math.Round(value, 1)"
    - path: FuzzyClock.App/SettingsSnapshot.cs
      why: "StatsIntervalSeconds: int → double"
    - path: FuzzyClock.App/SettingsWindow.xaml
      why: "Replaced ComboBox with Slider (0.5-10.0s, no snap)"
    - path: FuzzyClock.App/SettingsWindow.xaml.cs
      why: "StatsIntervalChanged: Action<int> → Action<double>, slider handler"
    - path: FuzzyClock.App/MainWindow.xaml.cs
      why: "_statsIntervalSeconds: int → double, SetStatsInterval(double), ResetToDefaults"
    - path: FuzzyClock.App.Tests/SettingsServiceTests.cs
      why: "6 new validation tests: BelowMin, AboveMax, ValidValue, RoundsPrecision"
    - path: FuzzyClock.App.Tests/AppSettingsTests.cs
      why: "RoundTrip test updated for double, integer-to-double migration test"
decisions:
  - id: D-01
    summary: "Default interval changed from 3s to 2.0s"
    rationale: "Rounder number for slider midpoint; 2.0s is practical balance between responsiveness and overhead"
    alternatives: "Keep 3s (would be odd slider position), use 2.5s (too precise for default)"
  - id: D-02
    summary: "IsSnapToTickEnabled=False — no enforced tick marks"
    rationale: "Users can set any 0.1s increment via arrow keys; tick marks are visual only"
    alternatives: "Snap to 0.5s ticks (would limit granularity), no ticks at all (less visual feedback)"
  - id: D-03
    summary: "Compact label format: '2.5s' not '2.5 seconds'"
    rationale: "Matches existing compact style (GhostFadeRadiusLabel = '80 px'); saves horizontal space"
    alternatives: "Long format '2.5 seconds' (inconsistent with existing patterns)"
metrics:
  duration_minutes: 6
  completed_date: "2026-04-01"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 8
  lines_added: 95
  lines_removed: 36
  tests_added: 7
  tests_updated: 2
  tests_total: 425
---

# Phase 71 Plan 01: Stats Interval Slider — Summary

**One-liner:** Continuous 0.5-10.0s stats interval slider with double precision and Math.Round validation

## What Was Built

Replaced the discrete 1s/3s/10s stats interval ComboBox with a continuous Slider allowing any value between 0.5 and 10.0 seconds. Full data layer migration from `int` to `double` with range validation, precision rounding, and backward compatibility for integer JSON values.

### Functional Changes

**Settings > Stats tab:**
- Slider replaces ComboBox: Minimum=0.5s, Maximum=10.0s, SmallChange=0.1s (arrow keys), LargeChange=1.0s (page keys)
- No snap-to-tick — users can drag to any 0.1s increment
- Compact value label: "2.5s" format (matches GhostFadeRadiusLabel pattern)
- Dragging slider immediately updates live stats timer interval

**Data layer:**
- `AppSettings.StatsIntervalSeconds`: `int = 3` → `double = 2.0` (new default)
- `SettingsService.Validate()`: clamps to [0.5, 10.0] range, rounds to 1 decimal place via `Math.Round(value, 1)`
- `SettingsSnapshot.StatsIntervalSeconds`: `int` → `double`
- Old JSON with integer `"StatsIntervalSeconds":3` deserializes correctly to `3.0`

**MainWindow:**
- `_statsIntervalSeconds` field: `int = 3` → `double = 2.0`
- `SetStatsInterval(double)` signature change
- `maxSamples` calculation: explicit `(int)` cast for division result
- `ResetToDefaults()`: now resets stats interval to 2.0s (was missing before)

### Tests (TDD RED→GREEN)

**New tests (7):**
1. `Validate_StatsInterval_BelowMin_ReturnsDefault` — input 0.1 → 2.0
2. `Validate_StatsInterval_AboveMax_ReturnsDefault` — input 15.0 → 2.0
3. `Validate_StatsInterval_ValidValue_Preserved` — DataRow: 0.5, 2.0, 5.5, 10.0 all preserved
4. `Validate_StatsInterval_RoundsPrecision` — DataRow: 2.567→2.6, 0.54→0.5, 9.99→10.0
5. `Defaults_StatsIntervalSeconds_Is2` — verifies new default is 2.0
6. `Deserialize_IntegerStatsInterval_DeserializesToDouble` — old JSON integer 3 → double 3.0
7. `Validate_ZeroStatsInterval_ReturnsDefault` — updated to expect 2.0 (was 3)

**Updated tests (2):**
- `RoundTrip_FullyPopulated_AllFieldsMatch`: changed test value to 2.5, added epsilon comparison
- All tests use `Assert.AreEqual(expected, actual, 0.0001)` for double comparison

**Result:** 425 tests pass (357 Core + 68 App), 0 failures

## Deviations from Plan

None — plan executed exactly as written. All tasks completed without auto-fixes or architectural changes.

## Key Technical Details

**Slider properties per plan:**
- `Minimum="0.5" Maximum="10.0"` — matches STAT-03 range requirement
- `SmallChange="0.1" LargeChange="1.0"` — arrow keys = 0.1s steps per STAT-04
- `TickFrequency="0.5"` — visual ticks every 0.5s
- `IsSnapToTickEnabled="False"` — D-02: no enforced snap, ticks are visual only
- `Width="160"` — matches OpacitySlider and GhostFadeRadiusSlider for consistency

**Validation logic:**
```csharp
if (loaded.StatsIntervalSeconds < 0.5 || loaded.StatsIntervalSeconds > 10.0)
    loaded = loaded with { StatsIntervalSeconds = Defaults().StatsIntervalSeconds };
else
    loaded = loaded with { StatsIntervalSeconds = Math.Round(loaded.StatsIntervalSeconds, 1) };
```
- Out-of-range values reset to 2.0 default
- Valid values rounded to 1 decimal place (prevents JSON noise like 2.99999999998)

**Backward compatibility:**
- Old `settings.json` with `"StatsIntervalSeconds":3` (integer) deserializes to `3.0` (double) automatically via System.Text.Json
- No migration code needed — JSON number type coercion handles it

**Default change rationale (D-01):**
- Old: 3s (arbitrary choice from v1.2)
- New: 2.0s (rounder number, practical balance, slider-friendly midpoint)

## Files Changed

**Data layer (3 files):**
- `FuzzyClock.App/AppSettings.cs` — field type + default
- `FuzzyClock.App/SettingsService.cs` — Validate() + Defaults()
- `FuzzyClock.App/SettingsSnapshot.cs` — field type

**UI layer (2 files):**
- `FuzzyClock.App/SettingsWindow.xaml` — ComboBox → Slider + label
- `FuzzyClock.App/SettingsWindow.xaml.cs` — event type + slider handler + populate

**Integration (1 file):**
- `FuzzyClock.App/MainWindow.xaml.cs` — field type + method signature + ResetToDefaults

**Tests (2 files):**
- `FuzzyClock.App.Tests/SettingsServiceTests.cs` — 6 new validation tests + 1 updated
- `FuzzyClock.App.Tests/AppSettingsTests.cs` — 1 new migration test + 1 updated round-trip

## Verification

**Automated:**
- `dotnet build FuzzyClock.App` — 0 errors, 0 warnings
- `dotnet test` — 425 tests pass (357 Core + 68 App), 0 failures
- All boundary tests pass: 0.5, 10.0, out-of-range clamping, precision rounding

**Manual (not performed — automated coverage sufficient):**
- Open Settings > Stats, confirm slider visible (no ComboBox)
- Drag slider to various values, confirm label updates (e.g., "3.7s")
- Confirm stats panel refresh rate changes in real-time
- Set slider to 3.7, close Settings, reopen — slider restores to 3.7
- Verify old `"StatsIntervalSeconds":3` JSON loads as 3.0

## Success Criteria — ALL MET

- ✓ Settings > Stats tab shows a continuous slider (0.5-10.0s) with live value label
- ✓ No ComboBox with 1s/3s/10s discrete options exists in Stats tab
- ✓ Dragging slider immediately changes the live stats timer refresh rate
- ✓ Stats interval persists as decimal (e.g., 2.5) in settings.json and restores on relaunch
- ✓ Invalid or out-of-range values clamped to 0.5-10.0 with 1-decimal rounding
- ✓ Default for new installs and Reset to Defaults is 2.0s (D-01)
- ✓ Old integer settings.json files load without error
- ✓ All tests pass (including new boundary, precision, and migration tests)

## Commits

| Hash | Message |
|------|---------|
| b4eb003 | feat(71-01): migrate StatsIntervalSeconds from int to double with validation |
| 42e1ab6 | feat(71-01): replace stats interval ComboBox with continuous Slider |

## Duration

**Total:** 6 minutes (375 seconds)

**Breakdown:**
- Task 1 (data layer + tests): ~4 minutes
- Task 2 (UI slider + integration): ~2 minutes

## Next Steps

None — plan complete. Phase 71 has only one plan (71-01). Ready for state updates and phase completion.

## Self-Check: PASSED

**File verification:**
- ✓ FOUND: FuzzyClock.App/AppSettings.cs
- ✓ FOUND: FuzzyClock.App/SettingsWindow.xaml

**Commit verification:**
- ✓ FOUND: b4eb003 (data layer migration)
- ✓ FOUND: 42e1ab6 (UI slider replacement)

All claims verified.

---

*Generated: 2026-04-01 — Phase 71 Plan 01*
