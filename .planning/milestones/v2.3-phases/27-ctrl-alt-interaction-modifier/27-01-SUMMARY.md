---
phase: 27-ctrl-alt-interaction-modifier
plan: 01
subsystem: ui
tags: [wpf, ghost-mode, win32, pinvoke, keyboard, transparency]

# Dependency graph
requires:
  - phase: 26-ghost-mode-core
    provides: WS_EX_TRANSPARENT ghost mode, DispatcherTimer restore, _isGhostMode state
provides:
  - Ctrl+Alt interaction modifier suppressing ghost mode in Window_MouseEnter
  - GetAsyncKeyState P/Invoke for keystate detection without keyboard focus
  - VK_LCONTROL/VK_LMENU constants for left-side-only modifier detection
affects: [ghost-mode, hover-behavior, drag, right-click, scroll-wheel]

# Tech tracking
tech-stack:
  added: []
  patterns: [GetAsyncKeyState+0x8000 mask for keystate in no-focus overlay, early-return modifier guard at top of mouse event handler]

key-files:
  created: []
  modified:
    - FuzzyClock.App/MainWindow.xaml.cs

key-decisions:
  - "GetAsyncKeyState (not Keyboard.IsKeyDown) — overlay never holds keyboard focus after WS_EX_TRANSPARENT"
  - "VK_LCONTROL=0xA2 + VK_LMENU=0xA4 (not VK_CONTROL/VK_MENU) — VK_MENU matches AltGr on EU keyboards, right-side ambiguity avoided"
  - "0x8000 mask on GetAsyncKeyState return — high bit = currently pressed, low bit = toggled since last call (irrelevant)"
  - "Early-return guard at top of Window_MouseEnter — Ctrl+Alt path returns before ghost Steps 1-3 execute"
  - "Window_MouseLeave unchanged — _isGhostMode==false guard ensures Ctrl+Alt hover cleanup runs via normal path"

patterns-established:
  - "Ctrl+Alt modifier check pattern: (GetAsyncKeyState(VK_Lxxx) & 0x8000) != 0 — use for any future modifier detection in WPF overlay"
  - "Early-return modifier guard: check modifier at top of handler, return early to skip activation path"

requirements-completed: [CTRLALT-01, CTRLALT-02]

# Metrics
duration: 2min
completed: 2026-03-02
---

# Phase 27 Plan 01: Ctrl+Alt Interaction Modifier Summary

**GetAsyncKeyState-based Left Ctrl + Left Alt guard in Window_MouseEnter suppresses ghost mode so users can interact with the widget while hovering**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-02T11:54:48Z
- **Completed:** 2026-03-02T11:59:31Z
- **Tasks:** 2 of 2 (Task 2 human-verify: APPROVED)
- **Files modified:** 1

## Accomplishments
- Added `GetAsyncKeyState` P/Invoke (short return type) after `GetWindowRect` declaration in Ghost mode P/Invoke section
- Added `VK_LCONTROL=0xA2` and `VK_LMENU=0xA4` constants (left-side only, EU keyboard safe)
- Replaced `Window_MouseEnter` body: ctrlAltHeld check at top with 0x8000 mask on both VK constants
- Ctrl+Alt branch: activates backdrop `Color.FromArgb(0x59,0,0,0)` + 0.5s fast-refresh, returns early without ghost
- Ghost path (Phase 26 Steps 1-3) unchanged and follows when no modifier held
- Build passes with 0 errors, 0 warnings

## Task Commits

Each task was committed atomically:

1. **Task 1: Add GetAsyncKeyState P/Invoke + Ctrl+Alt guard in Window_MouseEnter** - `37de0bc` (feat)
2. **Task 2: Human verify checkpoint** - APPROVED — all 4 behavioral scenarios passed

**Plan metadata:** `4db79b8` (docs)

## Files Created/Modified
- `FuzzyClock.App/MainWindow.xaml.cs` - Added GetAsyncKeyState P/Invoke, VK constants, ctrlAltHeld guard in Window_MouseEnter

## Decisions Made
- GetAsyncKeyState over Keyboard.IsKeyDown: overlay has no keyboard focus (established in v2.3 research, confirmed here)
- VK_LCONTROL/VK_LMENU over VK_CONTROL/VK_MENU: prevents AltGr false-positives on EU keyboards
- 0x8000 mask: high bit = currently pressed (low bit = toggled since last call, ignored)
- Early-return pattern: Ctrl+Alt branch returns before ghost Steps 1-3, cleanly separating the two paths
- Window_MouseLeave unchanged: existing `_isGhostMode` guard already handles both paths correctly

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- v2.3 milestone COMPLETE — all 4 behavioral scenarios verified at runtime
- CTRLALT-01 and CTRLALT-02 requirements satisfied and confirmed
- All 6 v2.3 requirements (CENTER-01, GHOST-01, GHOST-02, GHOST-03, CTRLALT-01, CTRLALT-02) implemented and verified

## Self-Check: PASSED
- `FuzzyClock.App/MainWindow.xaml.cs` modified: confirmed (commit 37de0bc)
- Commit `37de0bc` exists: confirmed (feat(27-01))
- SUMMARY.md created: confirmed
- Human verify: APPROVED (all 4 scenarios passed)

---
*Phase: 27-ctrl-alt-interaction-modifier*
*Completed: 2026-03-02*
