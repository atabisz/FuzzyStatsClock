---
phase: 42-settings-window-infrastructure
plan: 02
subsystem: ui
tags: [wpf, settings-window, xaml, live-apply, events]

# Dependency graph
requires:
  - phase: 42-01
    provides: SettingsSnapshot internal sealed record with 19 init-properties
provides:
  - SettingsWindow.xaml — 3-tab (Appearance/Stats/Behavior) 480x440 native-chrome WPF window
  - SettingsWindow.xaml.cs — code-behind with 19 per-setting Action events and _suppressEvents guard
affects: [42-03, 43-settings-window-wiring]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - populate-on-open via _suppressEvents guard in constructor before/after PopulateControls()
    - Win32Window IWin32Window adapter for WinForms ColorDialog (reused from MainWindow pattern)
    - Static _savedLeft/_savedTop for within-session window position memory
    - Toggle button state via FontWeights.Bold/Normal (no custom ToggleButton style needed)

key-files:
  created:
    - FuzzyClock.App/SettingsWindow.xaml
    - FuzzyClock.App/SettingsWindow.xaml.cs
  modified: []

key-decisions:
  - "SettingsWindow declared public (not internal) to match XAML partial class codegen accessibility requirement"
  - "Constructor declared internal to prevent SettingsSnapshot accessibility mismatch (CS0051)"
  - "Color alias (using Color = System.Windows.Media.Color) required because UseWindowsForms=true imports System.Drawing"

patterns-established:
  - "SettingsWindow event pattern: 19 Action events, one per setting, fire immediately on control change"
  - "_suppressEvents bool field: set true before PopulateControls(), false after; every handler checks it first"

requirements-completed: [SETT-02, SETT-03, SETT-04, SETT-05, SETT-06]

# Metrics
duration: 10min
completed: 2026-03-09
---

# Phase 42 Plan 02: Settings Window UI Summary

**3-tab SettingsWindow with 19 live-apply Action events, _suppressEvents guard, and Win32 color dialog — 480x440 native-chrome WPF window backed by SettingsSnapshot**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-09T00:00:00Z
- **Completed:** 2026-03-09T00:10:00Z
- **Tasks:** 2
- **Files modified:** 2 (both new)

## Accomplishments

- Created `SettingsWindow.xaml` with 3 TabItems (Appearance/Stats/Behavior), all named controls present: 5 swatches, opacity slider, font size toggle buttons (S/M/L/XL), clock style toggle buttons, phrase style combo, 7 stats checkboxes, update interval combo, 3 process threshold radio buttons, date checkbox + format combo, 3 behavior checkboxes
- Created `SettingsWindow.xaml.cs` with `SettingsWindow(SettingsSnapshot)` constructor, `_suppressEvents` guard, `PopulateControls()`, toggle helpers, and all 19 `Action<T>?` event fields
- All 126 existing tests pass (101 Core + 25 App), zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Create SettingsWindow XAML** - `2680820` (feat)
2. **Task 2: Create SettingsWindow code-behind** - `24eea95` (feat)

## Files Created/Modified

- `FuzzyClock.App/SettingsWindow.xaml` - 3-tab settings layout, 480x440 NoResize, all controls named
- `FuzzyClock.App/SettingsWindow.xaml.cs` - Code-behind: 19 events, _suppressEvents, PopulateControls, Win32Window adapter

## Decisions Made

- `SettingsWindow` must be `public` (not `internal`) because XAML codegen generates a `public partial class` — conflicting accessibility (CS0262) otherwise.
- Constructor is `internal SettingsWindow(SettingsSnapshot)` to keep SettingsSnapshot's internal accessibility consistent (CS0051 fix).
- Added `using Color = System.Windows.Media.Color` alias because `UseWindowsForms=true` in the csproj imports `System.Drawing` which also defines `Color`, causing CS0104 ambiguity.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed three compilation errors after first build attempt**
- **Found during:** Task 2 verification build
- **Issue 1:** CS0262 — `internal sealed partial class` in code-behind conflicted with XAML codegen's `public partial class`; fix: changed to `public sealed partial class`
- **Issue 2:** CS0104 — `Color` was ambiguous between `System.Drawing.Color` and `System.Windows.Media.Color` (both in scope via `UseWindowsForms=true`); fix: added `using Color = System.Windows.Media.Color` alias
- **Issue 3:** CS0051 — `public SettingsWindow(SettingsSnapshot)` exposed `internal SettingsSnapshot` via public API; fix: changed constructor to `internal SettingsWindow(SettingsSnapshot)`
- **Files modified:** `FuzzyClock.App/SettingsWindow.xaml.cs`
- **Verification:** Build succeeded with 0 errors, 0 warnings; 126 tests pass
- **Committed in:** `24eea95` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (3 compiler errors in single fix pass)
**Impact on plan:** All fixes required for compilation correctness. No scope creep. Both files compile and all tests pass.

## Issues Encountered

None beyond the compiler errors documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `SettingsWindow` is fully buildable and all 19 events are declared
- Plan 03 can wire MainWindow to open SettingsWindow and subscribe to all 19 events
- SettingsWindow is not yet opened from anywhere — no behavioral change at runtime

---
*Phase: 42-settings-window-infrastructure*
*Completed: 2026-03-09*
