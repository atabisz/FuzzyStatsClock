---
phase: 49-fixes-edge-snapping
plan: 01
subsystem: infra
tags: [single-instance, mutex, named-pipe, ipc, crash-recovery]

# Dependency graph
requires: []
provides:
  - AbandonedMutexException handling for crash-restart recovery (FIX-03)
  - Named-pipe bring-to-front IPC so second launch activates existing window (FIX-02)
affects: [App.xaml.cs, single-instance guard, startup sequence]

# Tech tracking
tech-stack:
  added: []
  patterns: [NamedPipeServerStream background thread with IsBackground=true, AbandonedMutexException catch using ex.Mutex]

key-files:
  created: []
  modified:
    - FuzzyClock.App/App.xaml.cs

key-decisions:
  - "Use ex.Mutex from AbandonedMutexException rather than creating a new Mutex — ensures ownership of the existing OS mutex object"
  - "Pipe server runs on background thread (IsBackground=true) — prevents thread from blocking process exit"
  - "Pipe connect timeout 500ms — generous enough for slow startup but not long enough to block second-instance exit"
  - "SignalRunningInstance() swallows all exceptions silently — running instance not ready is acceptable; second instance exits quietly"

patterns-established:
  - "AbandonedMutexException pattern: catch, take ownership via ex.Mutex, set createdNew=true, continue as first instance"
  - "Named-pipe IPC pattern: background WaitForConnection loop, Dispatcher.Invoke for UI thread activation"

requirements-completed: [FIX-02, FIX-03]

# Metrics
duration: 2min
completed: 2026-03-18
---

# Phase 49 Plan 01: Single-Instance Crash Recovery and Bring-to-Front IPC Summary

**AbandonedMutexException crash-restart recovery + named-pipe bring-to-front IPC replacing the silent-exit second-instance behavior**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-18T17:57:36Z
- **Completed:** 2026-03-18T17:59:42Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- App can now restart cleanly after a Task Manager kill — AbandonedMutexException is caught and ownership claimed via `ex.Mutex`
- Launching a second instance now activates the existing window via named-pipe ACTIVATE message instead of silently doing nothing
- Pipe server runs on a background thread (`IsBackground=true`) so process exit is never blocked
- 25 App tests + 199 Core tests pass (2 pre-existing Core failures unrelated to this plan)

## Task Commits

Each task was committed atomically:

1. **Task 1+2: AbandonedMutexException handling + named-pipe IPC** - `c6a7914` (fix)
   - Tasks were interdependent (Task 1 forward-references `SignalRunningInstance()` from Task 2), committed together

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `FuzzyClock.App/App.xaml.cs` — Added `PipeName` constant, `AbandonedMutexException` catch block, `SignalRunningInstance()` pipe client, `StartPipeServer()` background thread

## Decisions Made

- Used `ex.Mutex` from the caught `AbandonedMutexException` rather than a new Mutex object — this ensures we hold ownership of the existing OS mutex, not a new unrelated one.
- Tasks 1 and 2 committed together because Task 1's `!createdNew` branch calls `SignalRunningInstance()` which does not exist until Task 2. A separate Task 1 commit would fail to build.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- 2 pre-existing failures in `GetStructuredPhraseTests` (phrase engine tests) exist in the repo before these changes. Confirmed by stashing changes and rerunning. These are out of scope for this plan and logged as a deferred item.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- App.xaml.cs single-instance guard is now robust against crash-restart and activates on duplicate launch
- Ready for remaining Phase 49 plans (edge snapping)

---
*Phase: 49-fixes-edge-snapping*
*Completed: 2026-03-18*
