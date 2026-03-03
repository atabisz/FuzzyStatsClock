---
phase: 33-auto-contrast
plan: 01
subsystem: testing
tags: [wcag, contrast, hsl, mstest, tdd, core]

# Dependency graph
requires: []
provides:
  - "ContrastService static class with WCAG 2.1 RelativeLuminance, ContrastRatio, ComputeDisplayColor"
  - "RgbColor readonly record struct (no WPF dependency)"
  - "ContrastState enum: Normal / Override for hysteresis state machine"
  - "AdjustAccent: HSL-based lightness stepping ±5 units, up to ±40 units max"
  - "ColorToHsl / HslToColor conversion helpers in FuzzyClock.Core"
  - "InternalsVisibleTo FuzzyClock.Core.Tests enabling internal class testing"
  - "ContrastServiceTests.cs: 10 MSTest methods covering luminance, ratio, override entry, hysteresis"
affects:
  - "33-auto-contrast (plans 02+): MainWindow sampling and tray toggle wire-up consume ContrastService"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "RgbColor readonly record struct as lightweight WPF-free color type for cross-layer contrast math"
    - "InternalsVisibleTo via AssemblyAttribute MSBuild item (no AssemblyInfo.cs required)"
    - "Hysteresis band: enter override at ratio<4.5, exit only at ratio>5.5 (prevents boundary-crossing flicker)"
    - "AdjustAccent: darken on light bg (luminance>0.5), lighten on dark bg (luminance<=0.5), 5-unit HSL steps"

key-files:
  created:
    - "FuzzyClock.Core/ContrastService.cs"
    - "FuzzyClock.Core.Tests/ContrastServiceTests.cs"
  modified:
    - "FuzzyClock.Core/FuzzyClock.Core.csproj"

key-decisions:
  - "ContrastService declared internal (not public) — only accessible to FuzzyClock.Core.Tests via InternalsVisibleTo; MainWindow in App project will access it as public types RgbColor and ContrastState are public"
  - "RgbColor record struct avoids WPF dependency in net10.0 Core project; MainWindow converts System.Windows.Media.Color at call site"
  - "Assert.IsGreaterThanOrEqualTo(lowerBound, value) MSTest 4 argument order: lowerBound is first param, value is second (checks value >= lowerBound)"

patterns-established:
  - "Core-layer WCAG math: pure static class, no side effects, fully testable without WPF"
  - "TDD flow: write failing test file against non-existent types, commit RED state, implement to GREEN, fix test authoring issues inline"

requirements-completed: [CONTRAST-02, CONTRAST-03, CONTRAST-04]

# Metrics
duration: 4min
completed: 2026-03-03
---

# Phase 33 Plan 01: ContrastService Summary

**Pure WCAG 2.1 contrast math with HSL accent adjustment and hysteresis state machine, fully tested via TDD with 10 new MSTest methods**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-03T05:13:45Z
- **Completed:** 2026-03-03T05:17:49Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- ContrastService.cs implemented in FuzzyClock.Core (net10.0, zero WPF types) with WCAG 2.1 RelativeLuminance, ContrastRatio, ComputeDisplayColor, AdjustAccent, ColorToHsl, HslToColor
- RgbColor readonly record struct and ContrastState enum defined as public types; ContrastService itself is internal with InternalsVisibleTo for test access
- 10 new ContrastServiceTests cover all behavioral requirements: luminance (black/white/mid-gray), ratio (21:1 and 1:1 boundary), override entry (light/dark background), hysteresis retain and exit
- Full test suite: 88 tests passing (74 Core.Tests + 14 App.Tests), zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Write failing ContrastService tests (RED)** - `2eec3fb` (test)
2. **Task 2: Implement ContrastService to pass all tests (GREEN)** - `8f4864b` (feat)

_Note: TDD tasks — test commit then feat commit. No separate refactor commit needed._

## Files Created/Modified
- `FuzzyClock.Core/ContrastService.cs` - WCAG contrast math: RelativeLuminance, ContrastRatio, ComputeDisplayColor, AdjustAccent, ColorToHsl, HslToColor; defines RgbColor and ContrastState
- `FuzzyClock.Core.Tests/ContrastServiceTests.cs` - 10 MSTest methods covering all contract points
- `FuzzyClock.Core/FuzzyClock.Core.csproj` - Added InternalsVisibleTo AssemblyAttribute for FuzzyClock.Core.Tests

## Decisions Made
- **internal vs public for ContrastService:** Declared `internal static class ContrastService` per plan. RgbColor and ContrastState are `public` so the App project can use them at call sites. InternalsVisibleTo exposes the service to tests.
- **RgbColor struct:** Avoids adding WPF or Windows TFM dependency to the Core project. MainWindow will convert `System.Windows.Media.Color` to `RgbColor` at the call site (plan 02+).
- **MSTest 4 assertion API:** `Assert.IsGreaterThanOrEqualTo(lowerBound, value)` — lowerBound is the first argument (the threshold), value is the second (the measured quantity). Fixed during green phase.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added InternalsVisibleTo to FuzzyClock.Core.csproj**
- **Found during:** Task 2 (ContrastService implementation)
- **Issue:** ContrastService is `internal` per plan spec but tests in FuzzyClock.Core.Tests could not access it, causing CS0122 errors
- **Fix:** Added `<AssemblyAttribute Include="System.Runtime.CompilerServices.InternalsVisibleTo">` to FuzzyClock.Core.csproj
- **Files modified:** `FuzzyClock.Core/FuzzyClock.Core.csproj`
- **Verification:** Build succeeded, all tests accessible
- **Committed in:** `8f4864b` (Task 2 feat commit)

**2. [Rule 1 - Bug] Fixed MSTest 4 assertion argument order in test file**
- **Found during:** Task 2 (GREEN phase first run)
- **Issue:** `Assert.IsGreaterThanOrEqualTo(ratio, 4.5)` and `Assert.IsGreaterThan(ratio, 5.5)` had arguments reversed — MSTest 4 signature is `(lowerBound, value)` so tests were checking `4.5 >= ratio` instead of `ratio >= 4.5`
- **Fix:** Swapped argument order to `Assert.IsGreaterThanOrEqualTo(4.5, ratio)` etc. Also replaced `Assert.IsTrue(ratio >= 4.5)` style assertions with proper MSTest 4 comparison methods to eliminate MSTEST0037 warnings
- **Files modified:** `FuzzyClock.Core.Tests/ContrastServiceTests.cs`
- **Verification:** All 10 ContrastService tests pass; 0 warnings in Core.Tests
- **Committed in:** `8f4864b` (Task 2 feat commit)

---

**Total deviations:** 2 auto-fixed (1 blocking infrastructure, 1 bug)
**Impact on plan:** Both fixes required for tests to compile and pass. No scope creep.

## Issues Encountered
- MSTest 4 `Assert.IsGreaterThanOrEqualTo(lowerBound, value)` argument order is non-obvious: first arg is the lower bound (threshold), second is the actual measured value. Opposite of typical `Assert.AreEqual(expected, actual)` intuition. Fixed during green phase.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- ContrastService.cs is the algorithmic foundation for all subsequent Phase 33 plans
- Plan 02 can immediately import `ContrastService.ComputeDisplayColor` and `RgbColor` from FuzzyClock.Core
- MainWindow will need to: (a) convert `System.Windows.Media.Color` to `RgbColor` at call site, (b) capture screen pixels behind widget bounding box, (c) average them into a background RgbColor, (d) call ComputeDisplayColor on each 500ms sample
- No blockers

## Self-Check: PASSED

Files confirmed:
- `FuzzyClock.Core/ContrastService.cs` - EXISTS
- `FuzzyClock.Core.Tests/ContrastServiceTests.cs` - EXISTS
- `FuzzyClock.Core/FuzzyClock.Core.csproj` - EXISTS (modified)

Commits confirmed:
- `2eec3fb` - test(33-01): add failing ContrastService tests
- `8f4864b` - feat(33-01): implement ContrastService

---
*Phase: 33-auto-contrast*
*Completed: 2026-03-03*
