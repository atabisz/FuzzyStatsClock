---
phase: 28-core-logic-extraction-tests
plan: 01
subsystem: testing
tags: [mstest, unit-tests, refactor, core-logic, uptime, dial, geometry]

# Dependency graph
requires:
  - phase: 26-ghost-mode-core
    provides: FuzzyClock.Core project structure (net10.0, no WPF)
  - phase: 1-mvp
    provides: FuzzyClock.Core.Tests project with MSTest 4.0.1 infrastructure
provides:
  - UptimeFormatter static class in FuzzyClock.Core with Format(TimeSpan) method
  - DialGeometry static class in FuzzyClock.Core with GetHourAngleDegrees and GetMinuteAngleDegrees
  - 7 UptimeFormatter test cases covering all boundary conditions
  - 6 DialGeometry test cases covering cardinal positions and minute interpolation
  - MainWindow call sites updated to use extracted static methods
affects: [29-settings-service-tests, 30-app-integration-tests]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Extract pure calculation functions from WPF MainWindow into FuzzyClock.Core (net10.0, no WPF) to enable unit testing without Windows/WPF dependencies"
    - "TimeSpan.FromMinutes(N) for sub-hour test cases to avoid confusion with 3-param TimeSpan(hours,min,sec) constructor"
    - "DataRow for boundary-condition parameterized tests, standalone TestMethod for single-case tests"

key-files:
  created:
    - FuzzyClock.Core/UptimeFormatter.cs
    - FuzzyClock.Core/DialGeometry.cs
    - FuzzyClock.Core.Tests/UptimeFormatterTests.cs
    - FuzzyClock.Core.Tests/DialGeometryTests.cs
  modified:
    - FuzzyClock.App/MainWindow.xaml.cs

key-decisions:
  - "Extract only the testable pure values from UpdateDialDisplay: angle degrees (not radian conversion or canvas positioning)"
  - "Use component properties (uptime.Days, uptime.Hours, uptime.Minutes) not totals — matches existing MainWindow behavior exactly"

patterns-established:
  - "Pure static classes in FuzzyClock.Core: no instance state, no WPF dependencies, testable in isolation"
  - "FuzzyClock.Core.Tests test style: [TestClass]/[TestMethod]/[DataRow], Assert.AreEqual, namespace FuzzyClock.Core.Tests"

requirements-completed: [EXTRACT-01, EXTRACT-02, UTEST-01, UTEST-02]

# Metrics
duration: 5min
completed: 2026-03-03
---

# Phase 28 Plan 01: Core Logic Extraction + Tests Summary

**UptimeFormatter and DialGeometry extracted from MainWindow into FuzzyClock.Core as pure static classes, covered by 13 new MSTest unit tests across all boundary conditions**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-02T23:46:00Z
- **Completed:** 2026-03-02T23:51:54Z
- **Tasks:** 3
- **Files modified:** 5 (2 created in Core, 2 created in Tests, 1 modified in App)

## Accomplishments
- UptimeFormatter.Format(TimeSpan) extracted from MainWindow.UpdateUptimeDisplay — handles sub-hour/hours/days with leading-zero-unit suppression
- DialGeometry.GetHourAngleDegrees and GetMinuteAngleDegrees extracted from MainWindow.UpdateDialDisplay — pure angle math, no WPF canvas dependencies
- 7 UptimeFormatter test cases: sub-hour (2 DataRow), exactly 1h, 5h30m, exactly 1d, days+hours+min (2 DataRow)
- 6 DialGeometry test cases: cardinal positions 12/3/6/9 (4 DataRow), 3:15 interpolation, 12:30 noon wrap
- MainWindow.xaml.cs call sites updated — zero behavior change, app builds clean
- All 64 tests pass (51 PhraseEngine + 7 UptimeFormatter + 6 DialGeometry)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create UptimeFormatter and DialGeometry in FuzzyClock.Core** - `b77db7e` (feat)
2. **Task 2: Write UptimeFormatterTests and DialGeometryTests** - `64db551` (test)
3. **Task 3: Update MainWindow to call UptimeFormatter and DialGeometry** - `b1178e2` (refactor)

## Files Created/Modified
- `FuzzyClock.Core/UptimeFormatter.cs` - Static class with Format(TimeSpan) method for human-readable uptime strings
- `FuzzyClock.Core/DialGeometry.cs` - Static class with GetHourAngleDegrees(int hour, int minute) and GetMinuteAngleDegrees(int minute)
- `FuzzyClock.Core.Tests/UptimeFormatterTests.cs` - 7 test cases covering sub-hour, hour boundary, hours+minutes, day boundary, days+hours+minutes
- `FuzzyClock.Core.Tests/DialGeometryTests.cs` - 6 test cases covering cardinal positions and minute interpolation
- `FuzzyClock.App/MainWindow.xaml.cs` - Inline string-building and angle math replaced with static method calls

## Decisions Made
- Extracted only the testable pure values from UpdateDialDisplay (angle degrees), not the radian conversion or canvas positioning — those depend on canvas geometry and are not worth testing in isolation
- Used component properties (uptime.Days, uptime.Hours, uptime.Minutes) not totals, matching existing MainWindow behavior exactly
- No csproj changes needed — FuzzyClock.Core.Tests already references FuzzyClock.Core and has MSTest 4.0.1

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- FuzzyClock.Core now has two testable pure utility classes covering uptime formatting and dial angle calculation
- Phase 29 (SettingsService tests) is ready: Clamp() and Validate() refactors can follow the same extraction pattern
- Phase 30 (App integration tests) can reference these patterns for net10.0-windows test project setup

## Self-Check: PASSED

- FOUND: FuzzyClock.Core/UptimeFormatter.cs
- FOUND: FuzzyClock.Core/DialGeometry.cs
- FOUND: FuzzyClock.Core.Tests/UptimeFormatterTests.cs
- FOUND: FuzzyClock.Core.Tests/DialGeometryTests.cs
- FOUND: .planning/phases/28-core-logic-extraction-tests/28-01-SUMMARY.md
- FOUND commit b77db7e (feat: UptimeFormatter + DialGeometry)
- FOUND commit 64db551 (test: UptimeFormatterTests + DialGeometryTests)
- FOUND commit b1178e2 (refactor: MainWindow call sites)

---
*Phase: 28-core-logic-extraction-tests*
*Completed: 2026-03-03*
