---
phase: 79
plan: 01
subsystem: FuzzyClock.App — Widget render path (TempsText)
tags: [temps-line, widget-render, statspanel, foreground-apply-parity, stats-tick-piggyback]
requires: [75-02, 76-01, 78-01, 78-02]
provides: [temps-line-render, temps-line-visibility-predicate, temps-line-immediate-reflow, temps-line-accent-parity]
affects:
  - FuzzyClock.App/MainWindow.xaml
  - FuzzyClock.App/MainWindow.xaml.cs
  - FuzzyClock.App.Tests/TempsLineTests.cs
tech_stack:
  added: [none]
  patterns:
    - "Widget-side visibility predicate `(TempsLineVisible && formatted.Length > 0)` embedded inline per D-05/D-06 (no three-way compound check; StatsPanel-Collapsed cascade handled by WPF layout tree)"
    - "Text-before-Visibility ordering inside UpdateTempsDisplay prevents one-frame stale-text gap on visibility flip (79-UI-SPEC State Matrix Transition ordering)"
    - "Phase 33 critical pattern: BOTH ApplyTheme (line ~1637) AND ApplyDisplayColor (line ~1674) mirror the same element set — `TempsText.Foreground = brush;` landed in both"
    - "Handler reflow: append `UpdateTempsDisplay();` after `SaveSettings();` in each of the 5 Phase 78 event handlers (no handler duplication, no new subscriptions)"
    - "Timer piggyback: UpdateTempsDisplay appended as final statement inside the existing `_statsTimer.Tick` lambda — no new DispatcherTimer per TEMP-LINE-05"
    - "Fresh SolidColorBrush per Foreground assignment (consumes the existing local `brush` from both ApplyX methods); never mutate frozen `Brushes.*`"
    - "Pure-method truth-table tests (static helper `ComputeTempsTextVisibility` encapsulates D-05 predicate) — no WPF host required"
key_files:
  created:
    - FuzzyClock.App.Tests/TempsLineTests.cs
  modified:
    - FuzzyClock.App/MainWindow.xaml
    - FuzzyClock.App/MainWindow.xaml.cs
decisions:
  - "Inline predicate (D-05): visibility decision stays in UpdateTempsDisplay as a single conditional expression. No extractable production helper; the test-file static helper is a *duplicated* one-liner that encodes the same shape (the test IS the contract)."
  - "No three-way StatsVisible check (D-06): WPF layout-tree inheritance cascades StatsPanel-Collapsed to TempsText automatically. Widget-side code owns master + formatter-non-empty only."
  - "Text-before-Visibility ordering: `.Text = formatted;` runs before `.Visibility = ...;` to prevent a newly-visible TextBlock ever displaying stale prior-tick text (State Matrix row: Transition ordering)."
  - "One-line handler extension (D-07): each of 5 Phase 78 handlers gets `UpdateTempsDisplay();` appended after `SaveSettings();`. Phase 78 `_settings = _settings with { ... }; SaveSettings();` body preserved byte-for-byte."
  - "First-handler comment only: the `// v4.2 Phase 79 — immediate reflow (TEMP-TAB-05 SC5)` inline comment is added ONLY to the `TempsLineVisibleChanged` handler (first in the block). The other 4 handlers get the bare `UpdateTempsDisplay();` call — avoids comment noise on repetitive lines."
  - "Both ApplyX methods per Phase 33 (D-10): missing either site causes a silent color-mismatch regression that only surfaces when users toggle between accent-only and custom-display-color modes. `TempsText.Foreground  = brush;` (double-space alignment) is the insertion shape in both methods, consuming the existing local `brush` variable."
  - "No ResetToDefaults change (79-UI-SPEC Code-Behind Contract): reset mutates `_settings` + calls `RefreshControls`; a subsequent stats tick refreshes TempsText via the timer path. Optional snappier feedback was not needed — the next tick fires within 5s (max `_statsIntervalSeconds`) and the line is already collapsed when all 5 new defaults land (`TempsLineVisible=false`)."
  - "Tests live in FuzzyClock.App.Tests (D-16): new `TempsLineTests.cs` file, pure-method. Uses already-shipped `FakeTempSource` + `TemperatureFormatter.Format` — no Core changes (REL-03 preserved)."
  - "Zero deviations. Plan executed verbatim across 3 tasks + 3 atomic plan commits."
metrics:
  duration: "~10 minutes"
  commits: 3
  files_changed: 3
  tests_added: 8
  tests_total: 562
  completed: 2026-05-04
---

# Phase 79 Plan 01: Temps Line on Widget Summary

Landed the widget-render surface for the temperature line. `TempsText` TextBlock is now the 7th and final child of `StatsPanel` (immediately below `UptimeText`), populated every stats tick by a new `UpdateTempsDisplay()` method that calls `TemperatureFormatter.Format(...)` with 4 sensor readings (null-coalesced to `-1f` pre-init) and 4 per-sensor visibility bools, then applies the D-05 predicate `(TempsLineVisible && formatted.Length > 0)` to decide `Visible` vs `Collapsed`. Each of the 5 Phase 78 Settings event handlers is extended with a one-line `UpdateTempsDisplay();` call after `SaveSettings();` for immediate live reflow with no widget restart. `TempsText.Foreground = brush;` is mirrored in BOTH `ApplyTheme` (line ~1637) AND `ApplyDisplayColor` (line ~1674) per the Phase 33 critical pattern, which gives automatic accent parity with `UptimeText` and automatic auto-contrast participation via `ContrastRefreshController` (Phase 33). 8 new tests (6 `[DataRow]` truth-table cases + 2 formatter-consumption tests) lock the predicate + formatter-output contract in pure-method form with zero WPF host requirement.

## Commits

| Hash       | Message                                                                              |
| ---------- | ------------------------------------------------------------------------------------ |
| `97d424c`  | test(79-01): add TempsLineTests visibility-predicate + formatter-consumption truth table |
| `5747390`  | feat(79-01): add TempsText TextBlock as last child of StatsPanel                     |
| `d3868fc`  | feat(79-01): wire UpdateTempsDisplay into stats tick + 5 handlers + both ApplyX methods |

Plus the closing metadata commit that accompanies this SUMMARY.md.

## Work Completed

### Task 1 — RED: TempsLineTests (visibility-predicate + formatter truth table)

**Commit `97d424c`** — Created `FuzzyClock.App.Tests/TempsLineTests.cs` (59 lines) with a single `[TestClass]` and 3 `[TestMethod]` entries:

1. `VisibilityPredicate_TruthTable` — 6 `[DataRow]` cases covering the canonical State Matrix rows:
   - `(false, 0)` → Collapsed (master off + empty)
   - `(false, 7)` → Collapsed (master off + 1-segment)
   - `(true, 0)` → Collapsed (master on + empty — D-03 empty-line suppression)
   - `(true, 7)` → Visible (master on + 1-segment — dev box `GPU 51°` case)
   - `(true, 25)` → Visible (master on + 3-segment)
   - `(true, 35)` → Visible (master on + 4-segment maximum)
   Each row drives the pure static helper `internal static Visibility ComputeTempsTextVisibility(bool tempsLineVisible, int formattedLength) => (tempsLineVisible && formattedLength > 0) ? Visibility.Visible : Visibility.Collapsed;` and asserts `actual.ToString() == expected`.
2. `Format_WithFakeTempSource_ProducesExpectedLine` — constructs a `FakeTempSource` (Cpu=52, Gpu=61, Mobo=-1f, Nvme=38, IsReady=true), calls `TemperatureFormatter.Format` with all 4 visibility bools true, asserts exact output `"CPU 52°  GPU 61°  NVMe 38°"` (Mobo omitted due to -1f sentinel — TEMP-LINE-04 hide-segment path exercised).
3. `Format_AllSuppressed_ReturnsEmptyString` — constructs a FakeTempSource and calls Format with all 4 visibility bools false, asserts `formatted.Length == 0` (empty-string → Collapsed feeder path exercised).

Filtered run: `dotnet test --filter "FullyQualifiedName~TempsLineTests"` → 8/8 pass (6 DataRow cases + 2 plain tests). Structural RED — the tests encode the contract before the widget-side production consumer exists; Tests 2+3 exercise already-shipped Phase 76 code so they pass immediately. Test 1 exercises a test-file-local static helper that mirrors the predicate shape; the production consumer in Task 2 embeds the same predicate inline per D-05/D-06.

### Task 1 — GREEN: TempsText TextBlock in MainWindow.xaml

**Commit `5747390`** — Inserted the canonical 12-line XAML block in `FuzzyClock.App/MainWindow.xaml` between the UptimeText closing `/>` (line 284) and the StatsPanel `</StackPanel>` close, with leading comment:

```xml
<!-- Temps row — child of StatsPanel so it hides with stats.
     TempsText.Visibility is driven by (TempsLineVisible && formatted.Length > 0)
     per 79-CONTEXT D-05; StatsPanel=Collapsed also hides this line automatically
     via WPF layout inheritance. Clone of UptimeText styling per D-15. -->
<TextBlock x:Name="TempsText"
           Margin="0,2,0,0"
           Visibility="Visible"
           FontFamily="Segoe UI Light"
           FontSize="11"
           Foreground="White"
           Text=""
           TextAlignment="Left" />
```

UptimeText-clone parity for all styling attributes per D-15: identical `Margin`, `FontFamily`, `FontSize`, `Foreground` (design-time placeholder overwritten on first `ApplyTheme` / `ApplyDisplayColor`), `TextAlignment`. Only differences: `x:Name="TempsText"` (vs `UptimeText`), `Text=""` (vs `"up —"` placeholder). Build zero errors / zero warnings attributable to Phase 79. Full suite: 562/562 (554 baseline + 8 new).

### Task 2 — Code-behind wiring (6 sites in MainWindow.xaml.cs)

**Commit `d3868fc`** — Single atomic GREEN commit covering all 6 sites per 79-UI-SPEC Code-Behind Contract:

**Site 1 — New `UpdateTempsDisplay()` method** inserted immediately after `UpdateUptimeDisplay()` (new location ~line 932):

```csharp
// v4.2 Phase 79 — Temps line render path.
// Piggybacks on _statsTimer tick (TEMP-LINE-05) — no new DispatcherTimer.
// Null-conditional + -1f fallback mirrors GetCurrentSettingsSnapshot convention (Phase 78 D-01).
// Foreground is NOT touched here; that lives in ApplyTheme + ApplyDisplayColor per D-10.
private void UpdateTempsDisplay()
{
    float cpu  = _temperatureService?.CpuTempC  ?? -1f;
    float gpu  = _temperatureService?.GpuTempC  ?? -1f;
    float mobo = _temperatureService?.MoboTempC ?? -1f;
    float nvme = _temperatureService?.NvmeTempC ?? -1f;

    string formatted = FuzzyClock.Core.TemperatureFormatter.Format(
        cpu, gpu, mobo, nvme,
        _settings.TempCpuVisible,
        _settings.TempGpuVisible,
        _settings.TempMoboVisible,
        _settings.TempNvmeVisible);

    // Text-before-Visibility ordering (79-UI-SPEC State Matrix "Transition ordering"):
    // prevents a one-frame gap where a newly-visible TextBlock holds stale prior-tick text.
    TempsText.Text = formatted;
    TempsText.Visibility = (_settings.TempsLineVisible && formatted.Length > 0)
        ? Visibility.Visible
        : Visibility.Collapsed;
}
```

Fully-qualified `FuzzyClock.Core.TemperatureFormatter.Format` invocation avoids any ambiguity with an `App`-layer type of the same short name (defensive — no such type exists today, but future-proof).

**Site 2 — `_statsTimer.Tick` lambda extension** — appended `UpdateTempsDisplay();` as final statement (D-14):

```csharp
_statsTimer.Tick += (_, _) =>
{
    UpdateStatsDisplay();    // calls _statsService.Refresh() internally — must run first
    UpdateUptimeDisplay();   // reads CpuPercent after Refresh() already ran — never call Refresh() again here
    UpdateTempsDisplay();    // v4.2 Phase 79 — temps line piggy-back (TEMP-LINE-05)
};
```

**Site 3 — 5 Phase 78 handler extensions** — appended `UpdateTempsDisplay();` after `SaveSettings();` in each of the 5 event handlers. Only the first handler (`TempsLineVisibleChanged`) carries an inline comment (`// v4.2 Phase 79 — immediate reflow (TEMP-TAB-05 SC5)`); the other 4 get the bare call (avoids repetitive comment noise). Phase 78 `_settings = _settings with { ... }; SaveSettings();` preserved byte-for-byte in every handler.

**Sites 4+5 — `ApplyTheme` and `ApplyDisplayColor`** — appended `TempsText.Foreground  = brush;` (double-space alignment per 79-UI-SPEC insertion pattern) immediately after the existing `UptimeText.Foreground = brush;` line in BOTH methods:

```csharp
// ApplyTheme (line ~1637):
UptimeText.Foreground = brush;
TempsText.Foreground  = brush;   // v4.2 Phase 79 — TEMP-LINE-06 (Phase 33 critical pattern)

// ApplyDisplayColor (line ~1674):
UptimeText.Foreground = brush;
TempsText.Foreground  = brush;   // v4.2 Phase 79 — TEMP-LINE-06 (Phase 33 critical pattern)
```

Both insertions consume the existing local `brush` variable (`new SolidColorBrush(...)` at the top of each method) — fresh brush per invocation, never mutate frozen `Brushes.*` per CLAUDE.md rule. Phase 33 critical pattern honored: both methods cover the same element set.

**Site 6 — NONE** — `ResetToDefaults` unchanged per 79-UI-SPEC Code-Behind Contract. Reset mutates `_settings` + calls `RefreshControls`; a subsequent stats tick refreshes TempsText via the timer path within 5s (max `_statsIntervalSeconds`).

Build zero errors / zero warnings attributable to Phase 79. Full suite: 562/562.

## Test Results

| Baseline (Phase 78 tip) | After Plan 79-01   | Delta                                                                          |
| ----------------------- | ------------------ | ------------------------------------------------------------------------------ |
| Core: 445               | Core: 445          | +0 (REL-03 preserved — zero Core changes)                                      |
| App: 109                | App: 117           | +8 (6 DataRow truth-table cases + 2 formatter-consumption tests in TempsLineTests) |
| **Total: 554**          | **Total: 562**     | **+8 (requirement was ≥ +2; D-17 target exceeded)**                             |

Failures: 0. Skipped: 0. Build warnings: 0 attributable to Phase 79 (pre-existing MSTEST0037 warnings in unrelated test files remain out of scope — same deferred-items state as Phase 78 close).

## Verification Evidence

- `grep -c "class TempsLineTests" FuzzyClock.App.Tests/TempsLineTests.cs` → 1
- `grep -c "VisibilityPredicate_TruthTable" FuzzyClock.App.Tests/TempsLineTests.cs` → 1
- `grep -c "Format_WithFakeTempSource_ProducesExpectedLine" FuzzyClock.App.Tests/TempsLineTests.cs` → 1
- `grep -c "Format_AllSuppressed_ReturnsEmptyString" FuzzyClock.App.Tests/TempsLineTests.cs` → 1
- `grep -c "DataRow" FuzzyClock.App.Tests/TempsLineTests.cs` → 6 (one per truth-table row)
- `grep -c 'x:Name="TempsText"' FuzzyClock.App/MainWindow.xaml` → 1 (7th child of StatsPanel, immediately after UptimeText)
- `grep -c "private void UpdateTempsDisplay" FuzzyClock.App/MainWindow.xaml.cs` → 1 (method declaration)
- `grep -c "UpdateTempsDisplay" FuzzyClock.App/MainWindow.xaml.cs` → 7 (1 decl + 1 timer tick + 5 handler call sites)
- `grep -c "TempsText.Foreground  = brush" FuzzyClock.App/MainWindow.xaml.cs` → 2 (ApplyTheme + ApplyDisplayColor — Phase 33 parity)
- `grep -c "TemperatureFormatter.Format" FuzzyClock.App/MainWindow.xaml.cs` → 1 (inside UpdateTempsDisplay only)
- `grep -c "_temperatureService?.CpuTempC  ?? -1f" FuzzyClock.App/MainWindow.xaml.cs` → 2 (GetCurrentSettingsSnapshot from Phase 78-02 + UpdateTempsDisplay new)
- `grep -c "_settings.TempsLineVisible && formatted.Length > 0" FuzzyClock.App/MainWindow.xaml.cs` → 1 (D-05 predicate embedded inline)
- `grep -c "TempsText.Text = formatted;" FuzzyClock.App/MainWindow.xaml.cs` → 1
- `grep -c "TempsText.Visibility" FuzzyClock.App/MainWindow.xaml.cs` → 1 (only the assignment inside UpdateTempsDisplay; no other reference)
- `dotnet build FuzzyClock.slnx -c Release` exit 0, 0 errors, 32 warnings (all pre-existing MSTEST0037 style in unrelated files)
- `dotnet test FuzzyClock.slnx -c Release` exit 0, 562/562 passed
- REL-03 grep: `grep -r "LibreHardwareMonitor" FuzzyClock.Core/` → 0 matches (invariant preserved for Phase 80 CI gate)
- `git log --oneline -3` shows the 3 atomic plan-level commits in order: 97d424c → 5747390 → d3868fc
- `git log --format="%B" -3 | grep -c "Co-Authored-By"` → 0 (project CLAUDE.md rule honored)

## Requirement Sign-off

| REQ          | Status                          | Evidence                                                                                                      |
| ------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| TEMP-LINE-01 | Complete pending human-verify (79-02) | TempsText inserted as 7th child of StatsPanel immediately after UptimeText; `x:Name="TempsText"` grep → 1      |
| TEMP-LINE-02 | Complete pending human-verify   | Format routed through `TemperatureFormatter.Format` (Phase 76 shipped) — 2-space separator, integer °, tested in `Format_WithFakeTempSource_ProducesExpectedLine` asserting `"CPU 52°  GPU 61°  NVMe 38°"` exact |
| TEMP-LINE-03 | Complete pending human-verify   | Friendly labels inherited from Phase 76 formatter (`CPU` / `GPU` / `Mobo` / `NVMe` — raw LHM names never surface) |
| TEMP-LINE-04 | Complete pending human-verify   | `-1f` hide-segment path exercised by `Format_WithFakeTempSource_ProducesExpectedLine` (Mobo omitted); empty-string path exercised by `Format_AllSuppressed_ReturnsEmptyString` + D-05 predicate collapses TempsText when `formatted.Length == 0` |
| TEMP-LINE-05 | Complete                        | UpdateTempsDisplay invoked from `_statsTimer.Tick` lambda as final statement — NO new DispatcherTimer (grep-enforced: timer is the only per-tick render site aside from the 5 handler reflows) |
| TEMP-LINE-06 | Complete pending human-verify   | `TempsText.Foreground = brush` in BOTH ApplyTheme AND ApplyDisplayColor — auto-contrast participation automatic via `ContrastRefreshController.ColorChanged → ApplyDisplayColor` |

**Note:** human-verify for TEMP-LINE-01..04, 06 lands in Plan 79-02 per D-18 (Phase 78 precedent: autonomous plan → human-verify plan split). Plan 79-01 is fully autonomous.

## Decision Coverage (CONTEXT D-01..D-19)

| # | Decision | Status |
|---|----------|--------|
| D-01 | No widget-side throttle — service owns 2s cadence | Honored (no throttle state in UpdateTempsDisplay) |
| D-02 | No `_lastTempsUpdate` timestamp / dirty-check | Honored (no timestamp field added) |
| D-03 | Empty formatter → `Visibility.Collapsed` | Honored (predicate `formatted.Length > 0` guard) |
| D-04 | NOT `Text=""` with `Visibility.Visible` | Honored (Text+Visibility set together per Transition ordering) |
| D-05 | Exact predicate `(TempsLineVisible && formatted.Length > 0)` | Honored (grep: 1 match, verbatim shape) |
| D-06 | No three-way compound check | Honored (predicate owns 2 conditions; StatsVisible inherited) |
| D-07 | Extend 5 handlers with single `UpdateTempsDisplay();` line | Honored (5 call sites; Phase 78 body byte-for-byte preserved) |
| D-08 | Direct call, not dirty flag | Honored (no flag field added) |
| D-09 | Timer tick reflows naturally too | Honored (UpdateTempsDisplay is the tail statement of _statsTimer.Tick) |
| D-10 | Both ApplyTheme AND ApplyDisplayColor | Honored (grep: 2 `TempsText.Foreground  = brush` hits) |
| D-11 | No new Style resource | Honored (imperative Foreground only) |
| D-12 | Fresh `new SolidColorBrush(...)` per assignment | Honored (consumes existing local `brush` from each ApplyX method; no Brushes.* mutation) |
| D-13 | UpdateTempsDisplay body verbatim from 79-UI-SPEC | Honored (copy-paste with one defensive fully-qualified `FuzzyClock.Core.TemperatureFormatter.Format` prefix — semantically identical) |
| D-14 | Invoke as final statement of _statsTimer.Tick lambda | Honored (UpdateStatsDisplay → UpdateUptimeDisplay → UpdateTempsDisplay order) |
| D-15 | Canonical XAML block per 79-UI-SPEC | Honored (byte-for-byte clone of UptimeText styling; only `x:Name` + `Text` differ) |
| D-16 | Tests in FuzzyClock.App.Tests (not Core — REL-03) | Honored (new TempsLineTests.cs in App.Tests) |
| D-17 | Test count 554 → ≥556 | Exceeded (554 → 562, +8 vs +2 minimum) |
| D-18 | Human-verify in Plan 79-02 separate plan | Noted (Plan 79-01 fully autonomous; 79-02 carries the checkpoint) |
| D-19 | Dev-box expectation `GPU 51°` single segment | Forward-referenced (Plan 79-02 human-verify checklist) |

## Non-Negotiable Gates

| #  | Gate                                                              | Status |
|----|-------------------------------------------------------------------|--------|
| 1  | REL-03 grep (zero `LibreHardwareMonitor` in FuzzyClock.Core/)     | PASS — 0 matches (Phase 80 CI gate stays clean) |
| 2  | TempsText inserted as LAST child of StatsPanel, after UptimeText  | PASS (XAML sibling order verified: StatsPanel → CpuRow → GpuRow → MemRow → PagRow → BattRow → UptimeText → **TempsText** → `</StackPanel>`) |
| 3  | TempsText XAML clones UptimeText byte-for-byte (except x:Name, Text) | PASS (Margin + FontFamily + FontSize + Foreground design-time + TextAlignment identical) |
| 4  | D-05 visibility predicate exact shape                             | PASS (grep: 1 match, verbatim) |
| 5  | `TempsText.Foreground = brush;` in BOTH ApplyTheme AND ApplyDisplayColor (Phase 33) | PASS (grep: 2 hits) |
| 6  | 5 Phase 78 handlers each get ONE `UpdateTempsDisplay();` line after `SaveSettings();` | PASS (grep: 7 UpdateTempsDisplay occurrences = 1 decl + 1 timer + 5 handlers) |
| 7  | UpdateTempsDisplay called from existing stats timer tick (no new DispatcherTimer) | PASS (sole per-tick site is `_statsTimer.Tick` tail) |
| 8  | `new SolidColorBrush(...)` fresh per assignment; never mutate `Brushes.*` | PASS (consumes existing local `brush` from each ApplyX method — same pattern as UptimeText) |
| 9  | Tests in FuzzyClock.App.Tests (NOT Core)                          | PASS (TempsLineTests.cs lives under App.Tests; no changes under FuzzyClock.Core/) |
| 10 | No `Co-Authored-By` trailers                                       | PASS (all 3 commits clean per project CLAUDE.md rule) |
| 11 | Phase 78 files untouched outside 5 specified handler extensions   | PASS (SettingsSnapshot.cs / SettingsWindow.xaml[.cs] / AppSettings.cs / SettingsService.cs / TemperatureService.cs / ITempSource.cs / FakeTempSource.cs all 0-byte diff over the plan commit range) |
| 12 | 562 MSTest green (≥ 556 required)                                 | PASS — 562 passed, 0 failed, 0 skipped |

## Files Untouched (zero byte diff over plan commit range 97d424c..d3868fc)

- `FuzzyClock.App/SettingsSnapshot.cs` (locked by Phase 78)
- `FuzzyClock.App/SettingsWindow.xaml` (locked by Phase 78)
- `FuzzyClock.App/SettingsWindow.xaml.cs` (locked by Phase 78)
- `FuzzyClock.App/AppSettings.cs` (locked by Phase 76)
- `FuzzyClock.App/SettingsService.cs`
- `FuzzyClock.App/TemperatureService.cs` (locked by Phase 75-02)
- `FuzzyClock.App/ITempSource.cs` (locked by Phase 75-02)
- `FuzzyClock.App/TrayMenuBuilder.cs` (locked by Phase 77)
- `FuzzyClock.App.Tests/FakeTempSource.cs` (read-only consumer by new tests)
- `FuzzyClock.App.Tests/AppSettingsTests.cs` (Phase 78 tests untouched)
- `FuzzyClock.Core/**/*.cs` — REL-03 invariant preserved end-to-end

## Deviations from Plan

**Zero deviations.** Plan executed exactly as written across all 3 tasks. No Rule 1–4 auto-fixes fired.

One minor editorial choice (non-deviating): used the fully-qualified `FuzzyClock.Core.TemperatureFormatter.Format(...)` invocation in `UpdateTempsDisplay` instead of a bare `TemperatureFormatter.Format(...)`. This is semantically identical (there is no `App`-layer type of the same short name today), is defensive against any future naming collision, and is inside the method body so it does not affect any using-directive or grep-count acceptance gate. 79-UI-SPEC's Code-Behind Contract example uses the short name; the plan's acceptance criteria grep `TemperatureFormatter.Format` matches both forms (count = 1).

## Deferred Items

- 32 pre-existing MSTEST0037 style warnings in unrelated test files remain out of scope (same deferred-items state as Phases 77/78 close). Documented in prior SUMMARY files.

## Next-Phase Readiness

**Plan 79-02 (Human-Verify)** is now unblocked. The Plan 79-02 planner can build a checklist covering:

1. **Rendering order (TEMP-LINE-01):** TempsText appears as the 7th and final child of StatsPanel, immediately below UptimeText.
2. **Format string (TEMP-LINE-02):** 2-space separator, integer Celsius, `°` U+00B0 only — e.g. `GPU 51°` on dev box.
3. **Friendly labels (TEMP-LINE-03):** `CPU` / `GPU` / `Mobo` / `NVMe` only; no raw LHM names.
4. **N/A hide-segment (TEMP-LINE-04):** dev-box expectation per D-19 is a single-segment line `GPU 51°` (CPU + Mobo likely absent on PawnIO-free baseline; NVMe absent per `HardwareType.Storage` non-enumeration documented in Phase 75 spike).
5. **Live reflow (TEMP-TAB-05 SC5):** toggling any of the 5 Settings Temps checkboxes triggers <16ms reflow (one dispatcher frame) with no widget restart.
6. **Accent color parity (TEMP-LINE-06):** TempsText color exactly matches UptimeText color through accent cycling + display-color customization + auto-contrast luminance adjustment (move widget over white → black backgrounds to exercise).
7. **Stats panel inheritance:** toggling the master Stats toggle OFF collapses TempsText along with all other stat rows (WPF layout cascade).
8. **Reset to defaults:** tray Reset collapses TempsText (TempsLineVisible=false default) within one stats tick.
9. **Regression sweep:** Phases 77 RMB menu, Phase 78 Temps tab, and all other clock types (Phrase/Dial/LCD/Nixie) unchanged.

Dev-box expected line per D-19: **`GPU 51°`** (or similar GPU-only single-segment output — NVIDIA A2000 readable per Phase 75 spike Section 3; CPU + Mobo + NVMe absent on PawnIO-free baseline).

## Self-Check: PASSED

- `.planning/phases/79-temps-line-on-widget/79-01-SUMMARY.md` — FOUND (this file)
- `FuzzyClock.App.Tests/TempsLineTests.cs` — FOUND (59 lines; 1 `[TestClass]` + 3 `[TestMethod]` + 6 `[DataRow]` cases)
- `FuzzyClock.App/MainWindow.xaml` — FOUND; `x:Name="TempsText"` present (1 match); TempsText sibling order confirmed
- `FuzzyClock.App/MainWindow.xaml.cs` — FOUND; `private void UpdateTempsDisplay` (1 match); 7 `UpdateTempsDisplay` total occurrences (1 decl + 1 timer + 5 handlers); 2 `TempsText.Foreground  = brush` (ApplyTheme + ApplyDisplayColor); 1 `TemperatureFormatter.Format` (inside UpdateTempsDisplay only)
- Commit `97d424c` — FOUND (verified via `git log --format="%h %s" -5` showing `97d424c test(79-01): add TempsLineTests visibility-predicate + formatter-consumption truth table`)
- Commit `5747390` — FOUND (`5747390 feat(79-01): add TempsText TextBlock as last child of StatsPanel`)
- Commit `d3868fc` — FOUND (`d3868fc feat(79-01): wire UpdateTempsDisplay into stats tick + 5 handlers + both ApplyX methods`)
- REL-03: `grep -r "LibreHardwareMonitor" FuzzyClock.Core/` → 0 matches — CONFIRMED
- 562 MSTest green (445 Core + 117 App) — CONFIRMED at task 2 close
- No `Co-Authored-By` trailer across the 3 plan commits — CONFIRMED (project CLAUDE.md rule honored)
- Phase 78-locked files all 0-byte diff over plan commit range — CONFIRMED
