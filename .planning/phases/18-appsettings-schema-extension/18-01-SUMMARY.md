---
phase: 18-appsettings-schema-extension
plan: 01
subsystem: settings
tags: [csharp, appsettings, system-text-json, wpf, persistence]

# Dependency graph
requires:
  - phase: 17-context-aware-menus
    provides: stable AppSettings record (13 fields) and SettingsService with with-expression guard pattern
provides:
  - AppSettings record with AccentColor (string, "#FFFFFFFF") and Opacity (double, 1.0) init-property fields
  - SettingsService.Defaults() including AccentColor and Opacity
  - SettingsService.Load() guards for Opacity <= 0.0 and AccentColor null/empty
affects: [19-opacity-scroll, 20-accent-color, 21-color-picker]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "with-expression guard: `if (loaded.X <= threshold) loaded = loaded with { X = Defaults().X };`"
    - "init default as upgrade path: System.Text.Json uses init default for absent JSON fields, so `= 1.0` on Opacity is the sole protection against v1.9 upgrade producing invisible widget"

key-files:
  created: []
  modified:
    - FuzzyClock.App/AppSettings.cs
    - FuzzyClock.App/SettingsService.cs

key-decisions:
  - "AccentColor stored as '#FFFFFFFF' 8-digit AARRGGBB string, not WPF Color struct — System.Text.Json cannot natively serialize WPF Color"
  - "Opacity init default must be 1.0 explicitly — C# double type default is 0.0, which would make widget invisible on v1.9 upgrade without the explicit default"
  - "Defaults() updated before Load() guards so Defaults().Opacity returns 1.0 (not 0.0 from uninit record)"
  - "Guards placed in Load() after StatsIntervalSeconds guard, before return — consistent with established pattern"

patterns-established:
  - "Upgrade guard pattern: init default handles absent fields; explicit Load() guard handles malformed values (0.0, null, empty)"

requirements-completed: [THEME-04, OPAC-04]

# Metrics
duration: 1min
completed: 2026-02-27
---

# Phase 18 Plan 01: AppSettings Schema Extension Summary

**AppSettings extended with AccentColor (AARRGGBB hex) and Opacity (double) fields; SettingsService Defaults() and Load() guards added to prevent invisible-widget regression on v1.9 upgrade**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-26T22:21:16Z
- **Completed:** 2026-02-26T22:22:22Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- AppSettings record extended to 15 fields: AccentColor (string, init="#FFFFFFFF") and Opacity (double, init=1.0) added after ShowHourNumbers
- SettingsService.Defaults() updated to include both new fields with correct init values
- Two Load() guards added: Opacity <= 0.0 corrects to Defaults().Opacity; AccentColor null/whitespace corrects to Defaults().AccentColor
- Build passes with 0 errors; all guards use the established with-expression pattern

## Task Commits

Each task was committed atomically:

1. **Task 1: Add AccentColor and Opacity fields to AppSettings record** - `f68061c` (feat)
2. **Task 2: Update SettingsService Defaults() and add Load() guards** - `ff05684` (feat)

**Plan metadata:** committed with final docs commit

## Files Created/Modified
- `FuzzyClock.App/AppSettings.cs` - Added AccentColor and Opacity as init-property fields (15 total)
- `FuzzyClock.App/SettingsService.cs` - Updated Defaults() and added two Load() guards

## Decisions Made
- AccentColor uses 8-digit AARRGGBB format ("#FFFFFFFF") to match ColorConverter.ConvertFromString() expectations in Phases 19/20
- Opacity init default is explicitly = 1.0 on the record (not omitted) — System.Text.Json init default is the sole protection in the normal v1.9 upgrade path; C# type default for double is 0.0
- Defaults() must include both new fields before Load() guards are reached — guards call Defaults().Opacity and Defaults().AccentColor; if Defaults() omitted them, the guard would reset to 0.0 (wrong)
- No XAML files modified — this phase is data-layer only

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. NU1900 warnings in build output are NuGet feed access warnings from unrelated corporate package feeds (not build errors).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 19 (Opacity Scroll) can start: `AppSettings.Opacity` field is present, Defaults() sets it to 1.0, Load() guards prevent invisible-widget regression
- Phase 20 (Accent Color) can start: `AppSettings.AccentColor` field is present in 8-digit AARRGGBB format compatible with ColorConverter.ConvertFromString()
- Phase 21 (Color Picker) can start: schema is stable

Pending todos (from STATE.md) still open:
- Canonical preset color hex values to be settled before Phase 20
- Row label color follow-accent vs stay-white to be confirmed before Phase 20
- Opacity floor values (scroll=0.10, preset=0.25) to be documented in Phase 19 plan

---
*Phase: 18-appsettings-schema-extension*
*Completed: 2026-02-27*

## Self-Check: PASSED

- FOUND: FuzzyClock.App/AppSettings.cs
- FOUND: FuzzyClock.App/SettingsService.cs
- FOUND: .planning/phases/18-appsettings-schema-extension/18-01-SUMMARY.md
- FOUND commit: f68061c (feat: add AccentColor and Opacity fields to AppSettings record)
- FOUND commit: ff05684 (feat: update SettingsService Defaults() and add Load() guards)
- FOUND commit: 1f020f7 (docs: complete AppSettings schema extension plan)
