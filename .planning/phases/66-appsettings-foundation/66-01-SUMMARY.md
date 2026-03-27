---
phase: 66-appsettings-foundation
plan: 01
subsystem: settings
tags: [appsettings, json-serialization, mstest, validation, ghost-mode]

# Dependency graph
requires:
  - phase: 65-settings-persistence-hardening
    provides: LcdStyle Validate guard pattern used as model for GhostFadeRadiusPx guard
provides:
  - GhostFadeRadiusPx init-property in AppSettings (default 80, range 20-200)
  - GhostFadeRadiusPx entry in SettingsService.Defaults()
  - GhostFadeRadiusPx range guard in SettingsService.Validate() clamping out-of-range to 80
  - 7 new MSTest methods covering round-trip, absent-field, validate clamps, and Defaults()
affects: [67-proximity-controller, any phase reading GhostFadeRadiusPx from AppSettings]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Init-property with non-C#-default value (= 80) for backward-compat JSON deserialization"
    - "Validate() two-branch range guard using Defaults() as replacement value (not hardcoded literal)"

key-files:
  created: []
  modified:
    - FuzzyClock.App/AppSettings.cs
    - FuzzyClock.App/SettingsService.cs
    - FuzzyClock.App.Tests/AppSettingsTests.cs
    - FuzzyClock.App.Tests/SettingsServiceTests.cs

key-decisions:
  - "GhostFadeRadiusPx declared as init-property with = 80 so absent JSON fields deserialize to 80, not C# int default 0"
  - "Validate() clamps out-of-range to Defaults().GhostFadeRadiusPx (not hardcoded 80) for consistency with existing guards"
  - "Range 20-200px per PROX-06/PROX-07; default 80px"

patterns-established:
  - "New integer AppSettings field: declare init-property with explicit = N, add Defaults() entry, add Validate() range guard"

requirements-completed: [PROX-12, PROX-08]

# Metrics
duration: 8min
completed: 2026-03-27
---

# Phase 66 Plan 01: AppSettings Foundation Summary

**GhostFadeRadiusPx field added to AppSettings (default 80, range 20-200) with Defaults() entry, Validate() range guard, and 7 new MSTest methods covering round-trip, absent-field, and clamp behavior**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-27T01:00:00Z
- **Completed:** 2026-03-27T01:08:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- AppSettings.GhostFadeRadiusPx init-property added with default 80 (absent JSON fields yield 80, not C# int default 0)
- SettingsService.Defaults() and Validate() updated — Defaults returns 80, Validate clamps values outside 20-200 to 80
- 7 new test methods: round-trip assertion extended, absent-field test, 2 clamp tests, 3 DataRow boundary-preservation tests, Defaults() test
- Total test suite: 45 App + 314 Core = 359 tests, 0 failures (was 38 App + 314 Core = 352)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add GhostFadeRadiusPx to AppSettings and SettingsService** - `8a0e716` (feat)
2. **Task 2: Add GhostFadeRadiusPx tests to both test projects** - `22e50dd` (test)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `FuzzyClock.App/AppSettings.cs` - Added `GhostFadeRadiusPx { get; init; } = 80` after BackdropOpacityPercent
- `FuzzyClock.App/SettingsService.cs` - Added `GhostFadeRadiusPx = 80` to Defaults(); added range guard in Validate()
- `FuzzyClock.App.Tests/AppSettingsTests.cs` - Extended RoundTrip test; added Deserialize_MissingGhostFadeRadiusPx_DefaultsTo80
- `FuzzyClock.App.Tests/SettingsServiceTests.cs` - Added 4 new test methods (BelowMin, AboveMax, ValidRange x3, Defaults)

## Decisions Made

- Range 20-200px with default 80 per PROX-06/PROX-07 requirements
- Validate() uses `Defaults().GhostFadeRadiusPx` as replacement value (not hardcoded 80) for consistency with existing guards like StatsIntervalSeconds and LcdStyle

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

The worktree uses separate `obj/` directories that required `dotnet restore` before the first build. The `dotnet test` command run from the main repo path built/tested main repo files rather than worktree files; running from the worktree directory resolved this cleanly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- GhostFadeRadiusPx field is fully wired: persists to JSON, deserializes with correct default, validated on load, and reset-safe via Defaults()
- Phase 67 (proximity controller) can now read `settings.GhostFadeRadiusPx` to implement the fade-distance behavior without any data-model work
- No blockers

---
*Phase: 66-appsettings-foundation*
*Completed: 2026-03-27*
