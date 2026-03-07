---
phase: 38-tests-and-code-cleanup
plan: 01
subsystem: testing
tags: [csharp, mstest, tdd, refactoring, date-formatting]

# Dependency graph
requires:
  - phase: 36-date-display
    provides: FormatDate private method in MainWindow and DateFormat AppSettings field
provides:
  - DateFormatter pure static class in FuzzyClock.Core with Format(string, DateTime)
  - 6 new unit tests covering all 4 date formats plus 2 fallback cases
  - MainWindow.FormatDate removed; all call sites delegate to DateFormatter
affects:
  - 38-02 (AppSettings round-trip tests build on same Core.Tests project)
  - 39-docs (README may reference DateFormatter as a Core utility)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TDD RED-GREEN-REFACTOR with 3 atomic commits: test → feat → refactor"
    - "Pure static formatter class in FuzzyClock.Core accepting explicit DateTime parameter for testability"
    - "DateTime injected via parameter (not DateTime.Now internally) — same pattern enables deterministic tests"

key-files:
  created:
    - FuzzyClock.Core/DateFormatter.cs
    - FuzzyClock.Core.Tests/DateFormatterTests.cs
  modified:
    - FuzzyClock.App/MainWindow.xaml.cs

key-decisions:
  - "DateFormatter.Format(string, DateTime) accepts explicit DateTime parameter so tests can inject a fixed date without time-sensitivity"
  - "Private FormatDate method deleted entirely from MainWindow; both call sites inlined with DateFormatter.Format(_dateFormat, DateTime.Now)"

patterns-established:
  - "Core formatter pattern: pure static class, single Format() method, explicit date param for testability"

requirements-completed: [UTEST-03, CLEAN-01]

# Metrics
duration: 2min
completed: 2026-03-07
---

# Phase 38 Plan 01: DateFormatter Extraction Summary

**Pure static DateFormatter class extracted from MainWindow into FuzzyClock.Core, covered by 6 MSTest [DataRow] cases for all 4 formats and 2 fallback inputs**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-07T07:13:18Z
- **Completed:** 2026-03-07T07:15:08Z
- **Tasks:** 1 (3 TDD commits: RED + GREEN + REFACTOR)
- **Files modified:** 3

## Accomplishments

- Created `FuzzyClock.Core/DateFormatter.cs` — pure static class, `Format(string, DateTime)` dispatch on Short/Long/Numeric/ISO with fallback to Short
- Created `FuzzyClock.Core.Tests/DateFormatterTests.cs` — 6 test cases using fixed date `new DateTime(2026, 3, 7)` (Saturday) to avoid time-sensitivity
- Removed `MainWindow.FormatDate` private method; both call sites in `ApplySettings()` and `UpdateDateDisplay()` now delegate to `DateFormatter.Format(_dateFormat, DateTime.Now)`
- Full test suite: 97 Core + 25 App = 122 tests, 0 failures

## Task Commits

TDD commits (RED → GREEN → REFACTOR):

1. **RED — failing tests** - `3329d3e` (test)
2. **GREEN — DateFormatter implementation** - `1e8edfc` (feat)
3. **REFACTOR — MainWindow delegates to DateFormatter** - `75beced` (refactor)

## Files Created/Modified

- `FuzzyClock.Core/DateFormatter.cs` — pure static formatter, `Format(string format, DateTime date)` switch expression
- `FuzzyClock.Core.Tests/DateFormatterTests.cs` — 6 [DataRow] tests covering Short, Long, Numeric, ISO, empty-string fallback, unknown-string fallback
- `FuzzyClock.App/MainWindow.xaml.cs` — removed `FormatDate` private method; 2 call sites replaced with `DateFormatter.Format(..., DateTime.Now)`

## Decisions Made

- DateTime parameter injected explicitly (not `DateTime.Now` internally) — mirrors the plan spec and mirrors the `UptimeFormatter.Format(TimeSpan)` pattern of pure-function formatters
- Deleted `FormatDate` entirely rather than wrapping it — cleaner, matches the "truths" requirement that MainWindow no longer contain the private method

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- DateFormatter is fully tested and available for any future date-related work
- Phase 38-02 (AppSettings round-trip tests / STEST-08) is already committed as a prior run; this plan's work is independent and complete
- Phase 39 (docs) can reference DateFormatter as a Core utility

## Self-Check: PASSED

- FOUND: FuzzyClock.Core/DateFormatter.cs
- FOUND: FuzzyClock.Core.Tests/DateFormatterTests.cs
- FOUND: .planning/phases/38-tests-and-code-cleanup/38-01-SUMMARY.md
- FOUND commit: 3329d3e (test RED)
- FOUND commit: 1e8edfc (feat GREEN)
- FOUND commit: 75beced (refactor)
- FormatDate occurrences in MainWindow.xaml.cs: 0 (confirmed removed)
- Full test suite: 122 tests, 0 failures

---
*Phase: 38-tests-and-code-cleanup*
*Completed: 2026-03-07*
