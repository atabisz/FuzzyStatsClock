---
phase: 04-settings-drag-position-persistence
plan: 01
subsystem: settings
tags: [csharp, wpf, json, system-text-json, multi-monitor]

# Dependency graph
requires:
  - phase: 03-integration
    provides: MainWindow.xaml.cs and App.xaml.cs integration that Plan 02 will extend
provides:
  - AppSettings record (data contract with Left, Top, FontSize fields and -1 sentinel)
  - SettingsService static class (JSON load/save, VirtualScreen clamp, atomic save)
  - %LOCALAPPDATA%\FuzzyClock\settings.json file path resolution
affects:
  - 04-02-settings-drag-position-persistence
  - 05-font-size-selection-persistence

# Tech tracking
tech-stack:
  added: [System.Text.Json (in-box .NET 10)]
  patterns:
    - Positional C# record as settings data contract
    - Atomic file write via temp-file + File.Move(overwrite:true)
    - VirtualScreen* parameters for multi-monitor clamping
    - Left=-1 sentinel for no-saved-position state (avoids separate bool field)
    - Exception-swallowing Load() for robust first-run and corruption recovery

key-files:
  created:
    - FuzzyClock.App/AppSettings.cs
    - FuzzyClock.App/SettingsService.cs
  modified: []

key-decisions:
  - "Left=-1 sentinel for no-saved-position avoids a separate bool HasSavedPosition field and flows naturally through ApplySettings() in Plan 02"
  - "System.Text.Json used (not Newtonsoft.Json) — in-box .NET 10, handles plain records with zero NuGet cost"
  - "VirtualScreen* used (not PrimaryScreenWidth) so Clamp() works across all connected monitors including monitors left of primary (negative VirtualScreenLeft)"
  - "Atomic Save() via temp-file + File.Move(overwrite:true) prevents corrupt settings.json on mid-write crash on same NTFS volume"
  - "Load() swallows all exceptions so first-run (no file) and JSON corruption both return Defaults() cleanly"

patterns-established:
  - "AppSettings: plain positional record — no attributes, no [JsonPropertyName], System.Text.Json handles it natively"
  - "SettingsService: static class with no instance state — Load/Save/Clamp/Defaults all pure functions"
  - "File path: Environment.GetFolderPath(SpecialFolder.LocalApplicationData) + FuzzyClock/settings.json — always user-writable"

requirements-completed: [WIN-04, WIN-05]

# Metrics
duration: 2min
completed: 2026-02-25
---

# Phase 4 Plan 01: Settings Infrastructure Summary

**AppSettings positional record and SettingsService with atomic JSON I/O, VirtualScreen multi-monitor clamping, and Left=-1 sentinel for no-saved-position state**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-25T02:43:38Z
- **Completed:** 2026-02-25T02:45:30Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Created AppSettings.cs as a plain C# positional record with Left, Top, FontSize fields
- Created SettingsService.cs with Load(), Save(), Defaults(), Clamp() — all compiling cleanly
- Atomic Save() implementation protects against settings corruption on crash
- Clamp() uses VirtualScreen* bounds ensuring multi-monitor correctness including negative-offset monitors

## Task Commits

Each task was committed atomically:

1. **Task 1: Create AppSettings record** - `4417de1` (feat)
2. **Task 2: Create SettingsService static class** - `5d5d2f3` (feat)

## Files Created/Modified
- `FuzzyClock.App/AppSettings.cs` - Settings data contract: positional record with Left, Top, FontSize; Left=-1 sentinel for no-saved-position
- `FuzzyClock.App/SettingsService.cs` - JSON persistence service: Load (exception-safe), Save (atomic), Defaults (-1, 20, 32), Clamp (VirtualScreen bounds)

## Decisions Made
- Left=-1 sentinel for no-saved-position: avoids a separate bool HasSavedPosition field, flows naturally through ApplySettings() in Plan 02
- System.Text.Json over Newtonsoft.Json: in-box .NET 10, handles plain positional records natively with zero NuGet cost
- VirtualScreen* over PrimaryScreenWidth: covers all connected monitors, handles monitors positioned left of primary (VirtualScreenLeft can be negative)
- Atomic write pattern: temp-file + File.Move(overwrite:true) is atomic on same NTFS volume, prevents corrupt JSON on mid-write crash

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- AppSettings and SettingsService are fully independent of WPF window lifecycle — ready for Plan 02 integration
- Plan 02 will wire SettingsService.Load() into App.xaml.cs, apply position before Show(), add DragMove handler, guard PositionTopRight() with _hasUserPosition flag, and add Window.Closing + SessionEnding save paths
- Known pitfalls documented in STATE.md blockers (critical pitfalls P2, P3, P6, P7 from research) are still relevant for Plan 02

---
*Phase: 04-settings-drag-position-persistence*
*Completed: 2026-02-25*
