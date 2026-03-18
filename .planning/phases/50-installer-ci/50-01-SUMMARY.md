---
phase: 50-installer-ci
plan: 01
subsystem: infra
tags: [inno-setup, installer, windows, per-user, pascal-script]

# Dependency graph
requires: []
provides:
  - Inno Setup script FuzzyClock.iss compilable by ISCC to produce FuzzyClockSetup-X.Y.Z.exe
  - Per-user install to %LOCALAPPDATA%\Programs\FuzzyClock with no UAC elevation
  - AppMutex-based running-instance detection matching App.xaml.cs mutex name
  - Finish page "Launch FuzzyClock" checkbox (checked by default)
  - Uninstall optional "remove settings" checkbox (unchecked by default, preserves settings.json)
  - Upgrade auto-rewrites HKCU Run entry if auto-launch was previously enabled
affects: [50-02-release-workflow, 51-readme-docs]

# Tech tracking
tech-stack:
  added: [Inno Setup 6 (.iss script)]
  patterns:
    - "AppMutex directive uses existing named mutex for zero-code running-instance detection"
    - "PrivilegesRequired=lowest + {localappdata} constant for per-user install without UAC"
    - "Pascal CurStepChanged(ssPostInstall) for post-upgrade HKCU Run key rewrite"
    - "Pascal InitializeUninstallProgressForm + CurUninstallStepChanged for optional settings removal"
    - "#ifndef preprocessor guards for CI-injected vs local-dev AppVersion and SourceDir"

key-files:
  created:
    - FuzzyClock.iss
  modified: []

key-decisions:
  - "AppId GUID B8F2E3A1-7C4D-4E5F-9A6B-1D2E3F4A5B6C hardcoded — never change; upgrade detection depends on stable GUID"
  - "No [Dirs] section referencing {localappdata}\\FuzzyClock — settings directory must not be managed by installer so it survives uninstall"
  - "AppMutex directive (not CloseApplications) for running-instance detection — uses mutex app already maintains"
  - "Launch checkbox defaults checked (no 'unchecked' flag on [Run] postinstall entry)"

patterns-established:
  - "AppMutex=<mutex-name> in [Setup] section — zero-code running-instance detection via existing app mutex"
  - "#ifndef AppVersion / #ifndef SourceDir guards — CI injects via /D flags; local dev gets safe defaults"

requirements-completed: [INST-01, INST-02, INST-03, INST-04, INST-05, INST-06, INST-08, INST-09]

# Metrics
duration: 1min
completed: 2026-03-18
---

# Phase 50 Plan 01: Installer Script Summary

**Inno Setup per-user installer script with mutex-based running-instance detection, auto-launch registry update on upgrade, and optional settings-removal checkbox on uninstall**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-18T02:07:49Z
- **Completed:** 2026-03-18T02:08:50Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Created `FuzzyClock.iss` at repo root with all required Inno Setup sections
- All 8 installer requirements addressed (INST-01 through INST-06, INST-08, INST-09)
- Script is ready for CI compilation via `ISCC /DAppVersion=X.Y.Z /DSourceDir=publish FuzzyClock.iss`

## Task Commits

Each task was committed atomically:

1. **Task 1: Create FuzzyClock.iss Inno Setup script** - `c615784` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `FuzzyClock.iss` — Complete Inno Setup installer script with [Setup], [Languages], [Files], [Icons], [Run], and [Code] sections

## Decisions Made

- AppId GUID `B8F2E3A1-7C4D-4E5F-9A6B-1D2E3F4A5B6C` hardcoded as required — stable GUID is essential for Add/Remove Programs upgrade detection
- Settings directory `{localappdata}\FuzzyClock` intentionally absent from `[Dirs]` — Inno Setup only removes directories it manages; settings.json must survive uninstall by default
- Used `AppMutex` directive over `CloseApplications=yes` — AppMutex fires at installer startup using the mutex the app already maintains, whereas CloseApplications only fires when files are actually locked

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `FuzzyClock.iss` is ready for the CI workflow (plan 50-02) to invoke `ISCC.exe` with version injection
- `AppPublisherURL` and `AppSupportURL` set to the GitHub repo for completeness
- Script produces output to `installer/` directory (separate from `publish/` input) as required

---
*Phase: 50-installer-ci*
*Completed: 2026-03-18*
