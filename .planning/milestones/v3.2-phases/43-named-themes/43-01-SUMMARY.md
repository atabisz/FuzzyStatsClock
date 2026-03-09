---
phase: 43-named-themes
plan: "01"
subsystem: ui
tags: [themes, appsettings, wpf, color]

# Dependency graph
requires:
  - phase: 42-settings-window-infrastructure
    provides: AppSettings init-property record pattern, Color using-alias pattern

provides:
  - ThemeDefinition internal record (Name/AccentColor/Opacity/FontSize/DialMode/StatsVisible)
  - BuiltInThemes static class with 5 presets (Midnight/Neon/Ghost/Warm/Terminal)
  - BuiltInThemes.TryGet(string?) null-safe lookup
  - AppSettings.Theme nullable string field (null = no named theme active)

affects:
  - 43-02 (tray menu for theme selection uses BuiltInThemes.All)
  - 43-03 (ApplyNamedTheme calls BuiltInThemes.TryGet, writes Theme via with-expression)
  - 44-battery-alert (AppSettings pattern reference)
  - 45-phrase-styles (AppSettings pattern reference)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Color using-alias in UseWindowsForms=true projects: `using Color = System.Windows.Media.Color;`"
    - "BuiltInThemes.TryGet null guard: `name is not null &&` before dictionary lookup"

key-files:
  created:
    - FuzzyClock.App/ThemeDefinition.cs
  modified:
    - FuzzyClock.App/AppSettings.cs

key-decisions:
  - "StatsVisible in ThemeDefinition applies only to the panel-level toggle, not per-row CPU/GPU/MEM/PAG/BATT visibility — preserves user per-row preferences"
  - "Ghost theme uses FontSize 28 (not 32) to reinforce barely-there aesthetic at 0.35 opacity"
  - "Terminal theme uses FontSize 24 for compact/dense hacker-terminal aesthetic"
  - "Color using-alias required in ThemeDefinition.cs (UseWindowsForms=true causes System.Drawing.Color ambiguity)"

patterns-established:
  - "ThemeDefinition: required init properties on internal record — no positional constructor, consistent with AppSettings pattern"
  - "BuiltInThemes.TryGet: null-safe with `name is not null` guard before dictionary lookup"

requirements-completed: [THM-01, THM-02, THM-03]

# Metrics
duration: 2min
completed: 2026-03-08
---

# Phase 43 Plan 01: Named Themes Data Layer Summary

**ThemeDefinition record + BuiltInThemes registry (5 presets) + AppSettings.Theme nullable string, enabling named-theme persistence and lookup**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-08T22:58:54Z
- **Completed:** 2026-03-08T23:00:31Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Created `ThemeDefinition` internal record with all 6 properties (Name, AccentColor, Opacity, FontSize, DialMode, StatsVisible)
- Created `BuiltInThemes` static class with `All` dictionary containing 5 presets and null-safe `TryGet` method
- Added `string? Theme { get; init; } = null` as last property in `AppSettings`, completing JSON persistence wire-up
- All 126 existing tests continue to pass (101 Core + 25 App)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create ThemeDefinition.cs with BuiltInThemes registry** - `f4f3e06` (feat)
2. **Task 2: Add string? Theme field to AppSettings** - `1c9b7bf` (feat)

**Plan metadata:** see final docs commit (below)

## Files Created/Modified

- `FuzzyClock.App/ThemeDefinition.cs` - ThemeDefinition record + BuiltInThemes static class with all 5 presets
- `FuzzyClock.App/AppSettings.cs` - Added `string? Theme { get; init; } = null` as last property

## Decisions Made

- `Color using-alias` required: `UseWindowsForms=true` causes `System.Drawing.Color` vs `System.Windows.Media.Color` CS0104 ambiguity in `ThemeDefinition.cs` — fixed with `using Color = System.Windows.Media.Color;`
- `StatsVisible` in themes applies to panel-level toggle only; per-row visibility (CPU/GPU/MEM/PAG/BATT) is not overwritten — preserves user customization
- Ghost FontSize 28 (not 32) to reinforce the barely-there aesthetic at 0.35 opacity
- Terminal FontSize 24 for compact density matching hacker-terminal feel

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added Color using-alias to resolve CS0104 ambiguity**
- **Found during:** Task 1 (build verification)
- **Issue:** `UseWindowsForms=true` imports `System.Drawing` which also defines `Color`, causing `error CS0104: 'Color' is an ambiguous reference`
- **Fix:** Replaced `using System.Windows.Media;` with `using Color = System.Windows.Media.Color;`
- **Files modified:** FuzzyClock.App/ThemeDefinition.cs
- **Verification:** `dotnet build` reports `Build succeeded`
- **Committed in:** f4f3e06 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - build error)
**Impact on plan:** Necessary fix; Color alias pattern is already an established project convention documented in MEMORY.md.

## Issues Encountered

None beyond the Color ambiguity noted above — resolved immediately via the established using-alias pattern.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02 can now reference `BuiltInThemes.All` to build the tray Theme submenu
- Plan 03 can call `BuiltInThemes.TryGet(settings.Theme)` and write `Theme = _currentTheme` via with-expression in `SaveSettings()`
- `AppSettings.Theme` serializes/deserializes correctly with existing `SettingsService` (no Validate() changes needed)

---
*Phase: 43-named-themes*
*Completed: 2026-03-08*
