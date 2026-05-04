---
phase: 76-appsettings-temperatureformatter-tests
plan: 01
subsystem: testing
tags: [mstest, init-records, system-text-json, pure-static, tdd]

# Dependency graph
requires:
  - phase: 75-hardware-discovery-spike-temperatureservice
    provides: "ITempSource contract + TemperatureService + baseline 522 MSTest"
provides:
  - "AppSettings: five new init-property bool fields (TempsLineVisible=false, TempCpuVisible=true, TempGpuVisible=true, TempMoboVisible=false, TempNvmeVisible=false)"
  - "SettingsService.Defaults() explicit symmetry for all five new fields"
  - "FuzzyClock.Core/TemperatureFormatter.cs — pure static Format(4 floats, 4 bools) → string with 2-space separator, -1f hide-segment, banker's rounding, empty-string fallback"
  - "10 new AppSettings persistence tests (5 absent-field + 5 round-trip)"
  - "8 new TemperatureFormatter tests (12 runtime via [DataRow] rounding table)"
  - "Test suite grown from 522 → 544 (+22 runtime tests; +18 methods)"
affects:
  - "Phase 78 (Temps tab UI) — wires the five new AppSettings fields into SettingsWindow"
  - "Phase 79 (widget rendering) — invokes TemperatureFormatter.Format per tick"
  - "Phase 80 (Release) — CI grep gate validates zero LibreHardwareMonitor references in FuzzyClock.Core/"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure static formatter in FuzzyClock.Core (matches DateFormatter, UptimeFormatter — no state, single Format method)"
    - "-1f sentinel 'hide segment' contract (TEMP-LINE-04) enforced at formatter boundary via `value >= 0f` guard"
    - "2-space separator via string.Join (no trailing-separator bug class)"
    - "REL-03 invariant: zero LibreHardwareMonitor references in FuzzyClock.Core/ (comment text rephrased to keep CI grep gate clean)"
    - "Init-property record fields with explicit defaults — absent-field deserialization preserves intent, not C# type default"

key-files:
  created:
    - "FuzzyClock.Core/TemperatureFormatter.cs (43 lines)"
    - "FuzzyClock.Core.Tests/TemperatureFormatterTests.cs (109 lines, 8 test methods)"
  modified:
    - "FuzzyClock.App/AppSettings.cs (+7 lines: five new fields + 2-line comment)"
    - "FuzzyClock.App/SettingsService.cs (+5 lines: explicit symmetry in Defaults())"
    - "FuzzyClock.App.Tests/AppSettingsTests.cs (+87 lines: 5 absent-field + 5 round-trip tests)"

key-decisions:
  - "NVMe default is false (TEMP-TAB-03 amendment 2026-05-04 commit b2163d1, enforced in 5 sites: record, Defaults(), absent-field test, round-trip test, code comment)"
  - "Rephrased TemperatureFormatter doc comment to avoid the literal LibreHardwareMonitor string — prevents future CI grep gate false-positive while preserving intent documentation"
  - "Used default MidpointRounding.ToEven (banker's) — 52.5 → 52 — matches .NET default, no explicit enum argument needed"
  - "string.Join on List<string> — simpler than StringBuilder manual append, inherently avoids trailing-separator bug"
  - "Eight primitive parameters (4 floats + 4 bools) — no TempReading wrapper record, no ninth tempsLineVisible parameter (widget-visibility is caller's concern)"

patterns-established:
  - "Formatter pattern in Core: pure static class, single Format method, no state, no constructor, no fields, no package dependencies — cloned verbatim from DateFormatter"
  - "Init-property absent-field test discipline: per-field {""FontSize"":32}-minimal JSON with single-field assertion, one test per field"
  - "Per-field round-trip test discipline: flip the field to non-default before serialize, prove value survives reload"
  - "CI-grep-safe doc comments: when describing an absence invariant, avoid naming the banned string literally"

requirements-completed:
  - TEST-01
  - TEST-02
  - TEST-03
  - TEST-04

# Metrics
duration: ~5.5 min
completed: 2026-05-04
---

# Phase 76 Plan 01: AppSettings + TemperatureFormatter Tests Summary

**Five init-property temp-visibility fields on AppSettings (NVMe default amended to false per spike) + pure-static TemperatureFormatter in FuzzyClock.Core with -1f hide-segment contract, 2-space separator, banker's rounding — suite grown 522 → 544 tests, REL-03 grep gate preserved.**

## Performance

- **Duration:** ~5.5 min (5 min 40 sec — 08:00:38Z → 08:06:18Z wall clock for test runs; dominated by two dotnet build/test cycles at ~17s and ~5s each)
- **Started:** 2026-05-04T08:00:38Z
- **Completed:** 2026-05-04T08:06:18Z
- **Tasks:** 2 (both TDD RED→GREEN)
- **Files modified:** 5 (3 modified: AppSettings.cs, SettingsService.cs, AppSettingsTests.cs; 2 created: TemperatureFormatter.cs, TemperatureFormatterTests.cs)

## Accomplishments

- **TEST-01 satisfied** — `AppSettings` record has five new `{ get; init; } = <bool>;` fields with defaults `TempsLineVisible=false`, `TempCpuVisible=true`, `TempGpuVisible=true`, `TempMoboVisible=false`, `TempNvmeVisible=false`. `SettingsService.Defaults()` explicitly assigns all five for symmetry with the stats-visibility block.
- **TEST-02 satisfied** — Five per-field round-trip MSTest methods exist, each flipping the field to its non-default then asserting the value survives JSON serialize → deserialize.
- **TEST-03 satisfied** — Five per-field absent-field MSTest methods exist, each deserializing `"""{"FontSize":32}"""` (simulated v4.1 settings.json) and asserting the documented init default. `TempNvmeVisible` test asserts `false` per the 2026-05-04 amendment.
- **TEST-04 satisfied** — `FuzzyClock.Core/TemperatureFormatter.cs` is a pure static class with a single `Format(float, float, float, float, bool, bool, bool, bool) → string` method. 8 test methods cover all TEST-04 behaviors (including `[DataRow]` rounding table with 5 cases).
- **REL-03 invariant preserved** — `grep -r "LibreHardwareMonitor" FuzzyClock.Core/` returns zero matches.
- **Full MSTest suite green** — 544 runtime tests pass (445 Core + 99 App), 0 failures, strictly exceeds the 522 post-Phase-75 baseline documented in STATE.md.

## Task Commits

Each task executed TDD style (test RED → production GREEN), yielding four atomic commits:

1. **Task 1 RED: AppSettings temps-visibility tests** — `fb04fda` (test) — 10 failing tests added to `AppSettingsTests.cs`; build failed with 15 CS0117/CS1061 compile errors as expected.
2. **Task 1 GREEN: AppSettings fields + Defaults() symmetry** — `d3822ee` (feat) — five init-property bools added to `AppSettings.cs`, five explicit assignments added to `SettingsService.Defaults()`; 99 App tests green (89 baseline + 10 new).
3. **Task 2 RED: TemperatureFormatter tests** — `e5dbb47` (test) — 8 test methods (109 lines) added in new `TemperatureFormatterTests.cs`; build failed with 8 CS0103 errors for missing `TemperatureFormatter` type.
4. **Task 2 GREEN: TemperatureFormatter production code** — `1747fd2` (feat) — 43-line pure static class in `FuzzyClock.Core`; 445 Core tests green (433 baseline + 12 new runtime from `[DataRow]` expansion).

**Plan metadata commit:** (pending — wraps SUMMARY.md + STATE.md + ROADMAP.md + REQUIREMENTS.md).

## Files Created/Modified

- **Created:** `FuzzyClock.Core/TemperatureFormatter.cs` — 43 lines; pure static `Format` method; -1f guard; banker's rounding; 2-space separator; empty-list → "" via `string.Join` contract.
- **Created:** `FuzzyClock.Core.Tests/TemperatureFormatterTests.cs` — 109 lines; 8 `[TestMethod]` entries (7 parameter-less + 1 `[DataRow]` with 5 rows = 12 runtime tests).
- **Modified:** `FuzzyClock.App/AppSettings.cs` — added 5 init-property bool fields as a contiguous block after `GhostFadeRadiusPx`, with 2-line comment header documenting TEMP-TAB-02/-03 (and the 2026-05-04 NVMe amendment).
- **Modified:** `FuzzyClock.App/SettingsService.cs` — added trailing comma to `GhostFadeRadiusPx = 80` and appended five explicit assignments in `Defaults()` for symmetry with the existing stats-visibility block.
- **Modified:** `FuzzyClock.App.Tests/AppSettingsTests.cs` — appended a `// ----- v4.2 temps-visibility fields -----` section containing 10 new `[TestMethod]` entries (5 absent-field + 5 round-trip) immediately before the closing `}`.

## Decisions Made

- **NVMe default is `false` across 5 sites** — AppSettings record, SettingsService.Defaults(), absent-field test, round-trip test default comment, and the code comment in AppSettings.cs all reflect TEMP-TAB-03 amendment 2026-05-04 commit `b2163d1`. The round-trip test constructs `new AppSettings { TempNvmeVisible = true }` as a means to prove the value survives serialization — this is the single site where `true` appears by design.
- **Formatter doc comment rephrased** — The initial draft `/// LibreHardwareMonitor reference — this file compiles in net10.0 with no external PackageReference.` would have tripped the future CI grep gate despite being a semantic *absence* statement. Rewrote to `this file has zero references to the hardware-sensor package — it compiles in net10.0 with no external PackageReference.` Preserves intent, keeps CI grep gate clean. Captured as a Rule 1 auto-fix below.
- **Default banker's rounding** — `(int)Math.Round(cpu)` with no explicit `MidpointRounding` argument; .NET default is `ToEven`. Test row `(52.5f, "CPU 52°")` confirms the behavior.
- **No `StringBuilder`, no ninth parameter, no `TempReading` wrapper** — `string.Join("  ", segments)` handles the 2-space separator with zero trailing-separator risk; widget-visibility gating is the caller's concern (Phase 79); 8 primitives match the structural discipline of `DateFormatter(string, DateTime)` and `UptimeFormatter(TimeSpan)`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Rephrased TemperatureFormatter doc comment to avoid literal "LibreHardwareMonitor" string**
- **Found during:** Task 2 (post-file-creation REL-03 grep check)
- **Issue:** The XML doc comment drafted per plan included the sentence "REL-03 invariant: zero LibreHardwareMonitor reference — this file compiles in net10.0 with no external PackageReference." This is a *documentation of absence*, but the literal string `LibreHardwareMonitor` in the comment would still trip the Phase 80 CI grep gate (`grep -r "LibreHardwareMonitor" FuzzyClock.Core/`), which does not distinguish comments from code.
- **Fix:** Rewrote the sentence to `this file has zero references to the hardware-sensor package — it compiles in net10.0 with no external PackageReference.` Semantics preserved; grep-gate-safe.
- **Files modified:** `FuzzyClock.Core/TemperatureFormatter.cs`
- **Verification:** `Grep -r "LibreHardwareMonitor" FuzzyClock.Core` now returns zero matches. Full 445-test Core suite still green (no test asserts on the doc comment).
- **Committed in:** `1747fd2` (part of the Task 2 GREEN commit — fix applied before commit)

---

**Total deviations:** 1 auto-fixed (1 bug — CI-grep-gate false-positive prevention)
**Impact on plan:** No scope creep. The fix preserves the documented intent while keeping the REL-03 CI grep gate clean; the plan's own "done" criteria include `grep -r "LibreHardwareMonitor" FuzzyClock.Core/` returning zero matches, so this was enforcing plan intent, not departing from it.

## Issues Encountered

None. Both tasks executed cleanly. The RED→GREEN rhythm worked exactly as designed: 15 compile errors on the Task 1 RED commit, 8 CS0103 errors on the Task 2 RED commit, both collapsing to zero errors on the GREEN commits. No test behaved unexpectedly.

## User Setup Required

None — this plan shipped persistence-layer infrastructure and a pure formatter. No UI, no external service config, no environment variables.

## Next Phase Readiness

- **Phase 78 (Temps tab UI)** is unblocked — the five new `AppSettings` fields exist with documented defaults, and `SettingsService.Defaults()` has explicit symmetry entries. SettingsWindow can bind to the fields and persist changes via the existing settings pipeline with no additional AppSettings work needed.
- **Phase 79 (widget rendering)** is unblocked — `TemperatureFormatter.Format` is a tested, pure function. The widget will read four floats from the singleton `TemperatureService` (set up in Phase 75 Plan 02), combine them with the four visibility flags from `AppSettings`, and pass them to `Format` per tick. Empty string response collapses the TextBlock.
- **Phase 77 (RMB menu)** remains parallelizable — this plan touched only persistence + formatter; no tray menu surface was modified.
- **Phase 80 (Release)** CI grep gate — now provably safe. The new formatter was written, tested, and documentation-reviewed to keep `grep -r "LibreHardwareMonitor" FuzzyClock.Core/` empty.
- **Test baseline updated:** 544 runtime tests (445 Core + 99 App), 0 failures. Future phases should land additional tests on top of this baseline.

---
*Phase: 76-appsettings-temperatureformatter-tests*
*Completed: 2026-05-04*

## Self-Check: PASSED

All claimed files exist, all claimed commit hashes resolve in `git log`:
- FOUND: `FuzzyClock.Core/TemperatureFormatter.cs`
- FOUND: `FuzzyClock.Core.Tests/TemperatureFormatterTests.cs`
- FOUND: `.planning/phases/76-appsettings-temperatureformatter-tests/76-01-SUMMARY.md`
- FOUND: `fb04fda` (Task 1 RED)
- FOUND: `d3822ee` (Task 1 GREEN)
- FOUND: `e5dbb47` (Task 2 RED)
- FOUND: `1747fd2` (Task 2 GREEN)
