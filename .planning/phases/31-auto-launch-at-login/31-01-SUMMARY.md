---
phase: 31-auto-launch-at-login
plan: 01
subsystem: ui
tags: [windows-registry, tray-menu, wpf, settings, auto-launch]

# Dependency graph
requires:
  - phase: 27-ghost-mode
    provides: ghost mode tray toggle pattern used as template for auto-launch toggle
  - phase: 24-tray-only-controls
    provides: InitTrayIcon, TrayMenu_Opening, ResetToDefaults patterns
provides:
  - AutoLaunchService with Enable/Disable/IsEnabled for HKCU Run registry management
  - AutoLaunchEnabled bool in AppSettings (default false)
  - Tray menu "Auto-Launch at Login" checkable toggle
affects: [32-per-monitor-position, 33-auto-contrast]

# Tech tracking
tech-stack:
  added: [Microsoft.Win32.Registry (BCL, no NuGet)]
  patterns: [registry read-modify-write via static service class, init-property AppSettings extension]

key-files:
  created:
    - FuzzyClock.App/AutoLaunchService.cs
  modified:
    - FuzzyClock.App/AppSettings.cs
    - FuzzyClock.App/MainWindow.xaml.cs
    - FuzzyClock.App/FuzzyClock.App.csproj

key-decisions:
  - "AutoLaunchEnabled defaults to false — no registry pollution on first install"
  - "ApplySettings restores registry on startup to keep registry and settings.json in sync"
  - "throwOnMissingValue: false on DeleteValue prevents exception when disabling a never-enabled setting"
  - "Process.GetCurrentProcess().MainModule!.FileName used for exe path — reliable for WinExe output type"

patterns-established:
  - "AutoLaunchService: static registry helper with Enable/Disable/IsEnabled — isolated from UI layer"
  - "Tray toggle pattern: field tracks state, Click handler toggles field + Checked + registry + SaveSettings()"
  - "TrayMenu_Opening syncs .Checked from field for all checkable items (drift prevention)"

requirements-completed: [STRT-01, STRT-02, STRT-03]

# Metrics
duration: 3min
completed: 2026-03-03
---

# Phase 31 Plan 01: Auto-Launch at Login Summary

**HKCU Run registry toggle via AutoLaunchService and checkable tray menu item, persisted through settings.json with restore-on-startup**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-03T02:01:01Z
- **Completed:** 2026-03-03T02:03:05Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created AutoLaunchService with Enable/Disable/IsEnabled targeting HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run
- Added AutoLaunchEnabled init-property to AppSettings (default false — no registry pollution on first run)
- Wired checkable "Auto-Launch at Login" tray item: click toggles registry, checkmark, and saves to settings.json
- ApplySettings restores registry state from persisted setting on every startup (registry stays in sync)
- ResetToDefaults disables auto-launch and removes registry entry
- All 73 existing tests pass — zero regressions
- Bumped version to 2.6.0

## Task Commits

Each task was committed atomically:

1. **Task 1: Add AutoLaunchEnabled to AppSettings and create AutoLaunchService** - `8f5027b` (feat)
2. **Task 2: Wire tray menu toggle and settings persistence** - `d8193de` (feat)

## Files Created/Modified
- `FuzzyClock.App/AutoLaunchService.cs` - Static registry helper: Enable/Disable/IsEnabled for HKCU Run entry
- `FuzzyClock.App/AppSettings.cs` - Added AutoLaunchEnabled bool init-property (default: false)
- `FuzzyClock.App/MainWindow.xaml.cs` - Fields, ApplySettings, SaveSettings, InitTrayIcon, TrayMenu_Opening, ResetToDefaults wired up
- `FuzzyClock.App/FuzzyClock.App.csproj` - Version bumped to 2.6.0

## Decisions Made
- AutoLaunchEnabled defaults to false so no registry entry is written on first install — clean out-of-box behavior
- ApplySettings calls AutoLaunchService.Enable/Disable on startup to restore registry from persisted setting, keeping the two stores (registry + JSON) synchronized even if the registry entry was manually deleted
- Process.GetCurrentProcess().MainModule!.FileName supplies the exe path — reliable for WinExe output; null-forgiving `!` is appropriate because MainModule is never null for the current process

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 31 complete: Auto-Launch at Login fully implemented
- Phase 32 (per-monitor position) can now begin: AppSettings currently stores a single Left/Top; new phase needs a dictionary keyed by monitor identity (device name string, JSON-serializable)
- Phase 33 (auto-contrast) follow after Phase 32

---
*Phase: 31-auto-launch-at-login*
*Completed: 2026-03-03*
