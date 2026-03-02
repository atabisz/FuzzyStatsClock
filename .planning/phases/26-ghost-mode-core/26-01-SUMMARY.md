---
phase: 26-ghost-mode-core
plan: 01
subsystem: ui
tags: [wpf, p-invoke, win32, ghost-mode, click-through, WS_EX_TRANSPARENT, DispatcherTimer]

# Dependency graph
requires:
  - phase: 25-centered-phrase-text
    provides: centered phrase text baseline — widget layout stable before ghost mode layered on
provides:
  - Ghost mode core: widget auto-hides (Opacity=0 + WS_EX_TRANSPARENT) on MouseEnter
  - Ghost restore via DispatcherTimer polling GetCursorPos+GetWindowRect
  - Hover state guard: backdrop and fast-refresh suppressed during ghost state
  - P/Invoke declarations: GetWindowLong, SetWindowLong, SetWindowPos, GetCursorPos, GetWindowRect
affects:
  - 27-ctrlalt-modifier (must add Ctrl+Alt check inside Window_MouseEnter before ghost activation)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "WS_EX_TRANSPARENT OR'd onto existing exStyle (never replace) to preserve WS_EX_LAYERED + WS_EX_TOOLWINDOW"
    - "DispatcherTimer polling GetCursorPos+GetWindowRect as click-through-safe mouse leave detection"
    - "Synthetic hover-state cleanup (backdrop, timer, _isHoverFastRefresh) executed BEFORE applying WS_EX_TRANSPARENT in MouseEnter"
    - "Opacity=0 for hide (not Visibility.Collapsed — that triggers SizeToContent resize to 0)"

key-files:
  created: []
  modified:
    - FuzzyClock.App/MainWindow.xaml.cs

key-decisions:
  - "TrackMouseEvent + WndProcHook abandoned: WS_EX_TRANSPARENT causes Win32 to deliver synthetic WM_MOUSELEAVE immediately, restoring opacity before user moves away"
  - "Mouse.GetPosition(this) abandoned: WPF stops delivering mouse messages when WS_EX_TRANSPARENT is applied, making coords stale — causes flicker loop"
  - "Final approach: DispatcherTimer 75ms + GetCursorPos(out POINT) + GetWindowRect(_hwnd, out RECT) — bypasses WPF input system entirely, uses Win32 cursor position directly"
  - "Ghost restore checks cursor vs window rect (not WPF layout bounds) for pixel-accurate boundary detection"

patterns-established:
  - "Ghost hide: _isGhostMode=true, Opacity=0, OR WS_EX_TRANSPARENT, start DispatcherTimer"
  - "Ghost restore: _isGhostMode=false, Opacity=_windowOpacity, AND-NOT WS_EX_TRANSPARENT, stop DispatcherTimer"
  - "Window_MouseLeave guard: if (_isGhostMode) return — prevents double-restore race"

requirements-completed: [GHOST-01, GHOST-02, GHOST-03]

# Metrics
duration: 15min
completed: 2026-03-02
---

# Phase 26 Plan 01: Ghost Mode Core Summary

**Widget auto-hides (Opacity=0 + WS_EX_TRANSPARENT click-through) on MouseEnter; restores via DispatcherTimer polling Win32 GetCursorPos+GetWindowRect when cursor leaves window rect**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-02T22:01:00+11:00
- **Completed:** 2026-03-02T22:11:15+11:00 (+ human verify)
- **Tasks:** 3 (Task 1 + 2 auto-fix deviations + human verify approved)
- **Files modified:** 1

## Accomplishments

- Ghost mode activates on MouseEnter: widget becomes Opacity=0 and WS_EX_TRANSPARENT so clicks reach windows beneath
- Ghost restore detects mouse leaving window rect using Win32 GetCursorPos+GetWindowRect via 75ms DispatcherTimer — bypasses WPF input system which stops delivering mouse events under WS_EX_TRANSPARENT
- Hover state (backdrop, fast-refresh, _isHoverFastRefresh) is cleaned up synthetically in MouseEnter before WS_EX_TRANSPARENT is applied, preventing corrupted state on restore
- WS_EX_LAYERED and WS_EX_TOOLWINDOW preserved through every hide/show cycle
- Human verification passed: ghost activates/restores correctly, hover artifacts absent, full interactivity (drag/right-click/scroll) after restore

## Task Commits

Each task was committed atomically:

1. **Task 1: Ghost mode — P/Invoke, fields, ContentRendered wiring, MouseEnter activation, WndProcHook restore, MouseLeave guard** - `ec882b2` (feat)
2. **Task 1b: Fix — Switch ghost restore to DispatcherTimer polling (WM_MOUSELEAVE synthetic delivery issue)** - `1133d63` (fix)
3. **Task 1c: Fix — Use GetCursorPos+GetWindowRect for ghost restore detection (Mouse.GetPosition stale coords flicker fix)** - `67e059e` (fix)

**Plan metadata:** (docs commit: this summary)

## Files Created/Modified

- `FuzzyClock.App/MainWindow.xaml.cs` - Ghost mode implementation: P/Invoke declarations (GetWindowLong, SetWindowLong, SetWindowPos, GetCursorPos, GetWindowRect), _isGhostMode field, _ghostRestoreTimer DispatcherTimer, revised Window_MouseEnter (3-step activation), revised Window_MouseLeave (_isGhostMode guard)

## Decisions Made

- **TrackMouseEvent + WndProcHook abandoned:** WS_EX_TRANSPARENT causes Win32 to deliver a synthetic WM_MOUSELEAVE to the window immediately when the style is applied (since mouse is "no longer hitting" the transparent window), which triggered ghost restore before the user moved away.
- **Mouse.GetPosition(this) abandoned for restore check:** WPF stops routing mouse messages to the window when WS_EX_TRANSPARENT is active. DispatcherTimer ticking Mouse.GetPosition(this) returned stale/frozen coords, causing the restore condition to fire continuously and create a ghost/restore flicker loop.
- **Final restore approach — GetCursorPos + GetWindowRect:** GetCursorPos gives the true screen cursor position directly from Win32 (not WPF input system). GetWindowRect gives pixel-accurate window bounds. DispatcherTimer fires every 75ms; when cursor is outside rect, restore runs. This is entirely independent of WPF's mouse routing — works correctly under WS_EX_TRANSPARENT.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] WS_EX_TRANSPARENT triggers immediate synthetic WM_MOUSELEAVE — WndProcHook approach abandoned**
- **Found during:** Task 1 (human verify — widget stayed invisible or restored immediately)
- **Issue:** Win32 delivers WM_MOUSELEAVE to the window the moment WS_EX_TRANSPARENT is applied because the window stops being a hit-test target. The WndProcHook saw this message immediately and restored opacity/exStyle before the user moved away.
- **Fix:** Replaced HwndSource.AddHook + WndProcHook with a DispatcherTimer polling Mouse.GetPosition(this) against ActualWidth/ActualHeight boundaries; started timer in Window_MouseEnter instead of calling TrackMouseEvent.
- **Files modified:** FuzzyClock.App/MainWindow.xaml.cs
- **Verification:** Ghost mode restored correctly when mouse moved off widget
- **Committed in:** `1133d63` (fix commit)

**2. [Rule 1 - Bug] Mouse.GetPosition(this) returns stale coords under WS_EX_TRANSPARENT — flicker loop**
- **Found during:** Task 1b fix (flicker observed — widget ghosted/restored rapidly)
- **Issue:** WPF stops delivering WM_MOUSEMOVE to windows with WS_EX_TRANSPARENT. Mouse.GetPosition(this) uses WPF's last-known position, which is frozen at the enter point. The restore condition (pos.X < 0 || ...) was evaluating true or cycling, producing a ghost/restore flicker.
- **Fix:** Replaced Mouse.GetPosition(this) with P/Invoke GetCursorPos(out POINT) for true screen cursor coordinates, and GetWindowRect(_hwnd, out RECT) for pixel-accurate window bounds. Timer compare: cursor point vs window rect. Entirely bypasses WPF input system.
- **Files modified:** FuzzyClock.App/MainWindow.xaml.cs
- **Verification:** Ghost mode stable — no flicker, restores cleanly when cursor exits window rect
- **Committed in:** `67e059e` (fix commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 - bugs in the original plan's approach)
**Impact on plan:** Both fixes were necessary for correct behavior. The planned WndProcHook approach is fundamentally incompatible with WS_EX_TRANSPARENT on the same window. The DispatcherTimer + GetCursorPos approach is the correct cross-thread-safe Win32 pattern for this use case.

## Issues Encountered

- WM_MOUSELEAVE delivery after WS_EX_TRANSPARENT is not documented by Microsoft for the self-transparent case — research noted this as MEDIUM confidence. Experimentally confirmed: synthetic WM_MOUSELEAVE fires immediately on style change. WndProcHook approach is not viable.
- WPF Mouse.GetPosition isolation from Win32 cursor under WS_EX_TRANSPARENT was a non-obvious pitfall. GetCursorPos is the correct primitive.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ghost mode core is complete: GHOST-01, GHOST-02, GHOST-03 all satisfied
- Phase 27 (Ctrl+Alt Interaction Modifier) can add its check inside Window_MouseEnter as an early return before the ghost activation block — the extension point is explicitly noted in the code comments
- The _ghostRestoreTimer is already declared and wired; Phase 27 must ensure it is not started when Ctrl+Alt suppresses ghost activation
- Blocker from STATE.md (TrackMouseEvent delivery uncertainty) is now resolved: DispatcherTimer + GetCursorPos is the confirmed-working approach

---
*Phase: 26-ghost-mode-core*
*Completed: 2026-03-02*
