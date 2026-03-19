---
phase: 58-contrast-flicker-regression-fix
plan: 01
subsystem: ui
tags: [contrast, flicker, z-order, desktop, shell, winapi, dwm]

# Dependency graph
requires:
  - phase: 57-contrast-flicker-fix
    provides: HasAppWindowBeneath Z-order walk guard with Progman/WorkerW/SysListView32 exclusion
provides:
  - SHELLDLL_DefView added to shell-class exclusion list in HasAppWindowBeneath
  - DWM-cloaked window check (DWMWA_CLOAKED) skips closed Start/Search/Widgets shell panels
  - Flicker-free AutoContrast on desktops with icons and Windows 11 shell panels; FIX-04/FIX-05/FIX-06 verified
affects: [contrast-flicker-regression-fix]

# Tech tracking
tech-stack:
  added: [dwmapi.dll DwmGetWindowAttribute P/Invoke]
  patterns:
    - "Shell exclusion list pattern: enumerate known Windows desktop-shell class names in guard condition"
    - "DWM cloaked-window check: after non-shell-class filter, call DwmGetWindowAttribute(DWMWA_CLOAKED) to skip hidden shell panels"

key-files:
  created: []
  modified:
    - FuzzyClock.App/ContrastRefreshController.cs

key-decisions:
  - "Add SHELLDLL_DefView (desktop icon host window) to shell exclusion list alongside Progman, WorkerW, SysListView32"
  - "ApplicationFrameWindow (Windows 11 UWP shell host) stays in Z-order when panels are closed; use DwmGetWindowAttribute(DWMWA_CLOAKED) to detect and skip these hidden windows rather than adding the class to the exclusion list"
  - "Cloaked check placed after the non-shell-class filter to minimize P/Invoke calls on the hot path"

patterns-established:
  - "Shell exclusion list: when extending the Z-order guard, update the condition, the XML doc summary, and the inline comment in Tick — all three locations must stay in sync"
  - "Cloaked-window check pattern: after filtering known shell classes, call DwmGetWindowAttribute(DWMWA_CLOAKED) before returning true from Z-order guard"

requirements-completed: [FIX-04, FIX-05, FIX-06]

# Metrics
duration: 30min
completed: 2026-03-19
---

# Phase 58 Plan 01: Contrast Flicker Regression Fix Summary

**Extended HasAppWindowBeneath with SHELLDLL_DefView exclusion and DWM-cloaked window skip to eliminate auto-contrast flicker on desktops with icons and Windows 11 shell panels**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-03-19T03:10:00Z
- **Completed:** 2026-03-19T03:58:23Z
- **Tasks:** 2 (1 auto + 1 human-verify checkpoint)
- **Files modified:** 1

## Accomplishments

- Added `SHELLDLL_DefView` to the shell class exclusion list in `HasAppWindowBeneath`, fixing flicker on desktops with visible desktop icons
- Discovered broader root cause during human verification: Windows 11 shell panels (`ApplicationFrameWindow` — Start menu, Search, Widgets) stay in Z-order when closed but are invisible to the user; added `DwmGetWindowAttribute(DWMWA_CLOAKED)` check to skip these
- All 274 MSTest tests pass (249 Core + 25 App); FIX-04, FIX-05, and FIX-06 human-verified

## Task Commits

Each task was committed atomically:

1. **Task 1: Add SHELLDLL_DefView to shell exclusion list** - `4adf3ba` (fix)
2. **Task 2: Skip DWM-cloaked shell panels in HasAppWindowBeneath** - `20d10d6` (fix)

**Plan metadata:** (final docs commit)

## Files Created/Modified

- `FuzzyClock.App/ContrastRefreshController.cs` - Added `SHELLDLL_DefView` to exclusion condition, XML doc, and Tick inline comment; added `DwmGetWindowAttribute` P/Invoke and `DWMWA_CLOAKED = 14` constant; added cloaked-window skip logic in `HasAppWindowBeneath`

## Decisions Made

- **SHELLDLL_DefView added as 4th shell class:** This is the desktop icon host window present when desktop icons are visible. Omitting it caused the guard to return `true` over an empty desktop with icons, reintroducing the feedback loop.
- **DwmGetWindowAttribute(DWMWA_CLOAKED) for ApplicationFrameWindow:** After SHELLDLL_DefView was added and the first commit made, human testing revealed flicker still occurred. Windows 11 UWP shell panels (Start menu, Search, Widgets) remain in Z-order when dismissed. Their class is `ApplicationFrameWindow` — a legitimate app host class that cannot be added to the exclusion list. The DWM cloaked attribute (non-zero = hidden by DWM) reliably distinguishes genuinely hidden panels from real visible app windows.
- **Cloaked check placement:** The check runs only for windows that passed the non-shell-class filter, keeping the hot path lean.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Root cause broader than diagnosed: ApplicationFrameWindow cloaked panels also bypass guard**
- **Found during:** Task 2 (human verification — FIX-04/FIX-05/FIX-06)
- **Issue:** After Task 1 committed, human testing showed flicker still occurred. `ApplicationFrameWindow` (Windows 11 shell panels) bypasses the shell class filter and `IsWindowVisible` returns true even when the panel is dismissed, because DWM hides them rather than destroying them.
- **Fix:** Added `DwmGetWindowAttribute(DWMWA_CLOAKED, ...)` check after the class filter; skips any window where the cloaked attribute is non-zero
- **Files modified:** `FuzzyClock.App/ContrastRefreshController.cs`
- **Verification:** FIX-04, FIX-05, FIX-06 all human-verified as passing after the fix
- **Committed in:** `20d10d6` (fix(58-01))

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug, broader root cause discovered during human verification)
**Impact on plan:** Fix was necessary for correctness; no scope creep. Single file modified.

## Issues Encountered

The original diagnosis (SHELLDLL_DefView missing) was correct but incomplete. Windows 11 introduced `ApplicationFrameWindow` shell panels that remain visible to `IsWindowVisible` when closed but are hidden by DWM. The cloaked-window check closes that gap. Both fixes address the same root behavior: preventing the Z-order guard from treating invisible or decorative shell infrastructure as real app windows.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- v3.6.2 milestone is complete — all three requirements (FIX-04, FIX-05, FIX-06) verified
- Guard now handles shell class list + DWM cloaked state; no known remaining flicker paths
- 274 MSTest tests pass, 0 failures

---
*Phase: 58-contrast-flicker-regression-fix*
*Completed: 2026-03-19*
