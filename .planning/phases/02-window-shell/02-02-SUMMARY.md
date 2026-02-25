---
phase: 02-window-shell
plan: 02
subsystem: ui
tags: [wpf, xaml, transparency, overlay, mutex, single-instance, drop-shadow]

# Dependency graph
requires:
  - phase: 02-01
    provides: FuzzyClock.App WPF project scaffold, solution wired, Core reference added
provides:
  - Transparent frameless always-on-top WPF overlay window shell
  - Single-instance enforcement via named Mutex
  - Taskbar and Alt+Tab suppression via hidden ToolWindow owner
  - Right-click ContextMenu with Close item calling Application.Current.Shutdown()
  - Top-right 20px-padded positioning via ContentRendered + SystemParameters
affects: [03-integration, phrase-display, window-positioning]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hidden ToolWindow owner pattern for WPF taskbar+Alt+Tab suppression"
    - "Named Mutex single-instance enforcement before any window creation in OnStartup"
    - "ContentRendered deferred positioning for SizeToContent windows"
    - "Grid Background=#01000000 for hit-testable transparent surface"
    - "DropShadowEffect on TextBlock to restore legibility when ClearType is disabled by DWM"

key-files:
  created: []
  modified:
    - FuzzyClock.App/App.xaml
    - FuzzyClock.App/App.xaml.cs
    - FuzzyClock.App/MainWindow.xaml
    - FuzzyClock.App/MainWindow.xaml.cs

key-decisions:
  - "AllowsTransparency, WindowStyle=None, and Background=Transparent must all be set in XAML — AllowsTransparency cannot be changed after window handle is created"
  - "Grid Background=#01000000 (alpha=1): fully transparent alpha=0 has no hit-test surface, breaking right-click"
  - "Application.Current.Shutdown() in close handler — not this.Close() — because hidden owner keeps process alive otherwise"
  - "ContentRendered for positioning — ActualWidth is 0 in constructor before SizeToContent layout pass completes"
  - "DropShadowEffect on TextBlock is essential: ClearType sub-pixel AA is disabled by DWM on transparent HWND; shadow provides visual definition"

patterns-established:
  - "Hidden ToolWindow owner: create Window{WindowStyle=ToolWindow, ShowInTaskbar=false, Visibility=Hidden}, call owner.Show() before setting as Owner"
  - "Mutex guard pattern: check createdNew in OnStartup before base.OnStartup, Shutdown() and return if already running"

requirements-completed: [WIN-01, WIN-02, WIN-03]

# Metrics
duration: 2min
completed: 2026-02-25
---

# Phase 2 Plan 02: Window Shell — Transparent Overlay Summary

**Frameless transparent WPF overlay with Mutex single-instance, hidden owner Alt+Tab suppression, DropShadowEffect TextBlock, and top-right ContentRendered positioning**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-25T00:41:50Z
- **Completed:** 2026-02-25T00:43:07Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- App.xaml StartupUri removed; window creation moved to OnStartup with named Mutex single-instance guard ("FuzzyClock_SingleInstance_v1") — second launch exits immediately before any window appears
- Hidden ToolWindow owner window suppresses overlay from both Windows taskbar and Alt+Tab switcher (ShowInTaskbar=False alone is insufficient)
- MainWindow.xaml: WindowStyle=None, AllowsTransparency=True, Background=Transparent, Topmost=True, ShowInTaskbar=False all set in XAML as required; Grid Background=#01000000 ensures right-click works over transparent pixels
- TextBlock "half past 3" placeholder in Segoe UI Light 32pt white with DropShadowEffect (compensates for DWM disabling ClearType on transparent surfaces); positioned top-right via ContentRendered + SystemParameters.PrimaryScreenWidth

## Task Commits

Each task was committed atomically:

1. **Task 1: App.xaml + App.xaml.cs — Mutex guard + hidden owner + window launch** - `5ba033c` (feat)
2. **Task 2: MainWindow.xaml + MainWindow.xaml.cs — transparent overlay with positioning and close** - `7d90719` (feat)

## Files Created/Modified

- `FuzzyClock.App/App.xaml` - Removed StartupUri; window created manually in OnStartup
- `FuzzyClock.App/App.xaml.cs` - OnStartup: Mutex guard, hidden ToolWindow owner, MainWindow creation; OnExit: Mutex release
- `FuzzyClock.App/MainWindow.xaml` - Transparent overlay XAML: all five window properties, Grid with ContextMenu, TextBlock with DropShadowEffect
- `FuzzyClock.App/MainWindow.xaml.cs` - Constructor subscribes ContentRendered; PositionTopRight uses SystemParameters; CloseMenuItem_Click calls Shutdown()

## Decisions Made

- AllowsTransparency cannot be changed after the window handle is created — must be set in XAML, not code-behind. Paired with WindowStyle=None as required by WPF.
- Grid Background=#01000000 (alpha=1, RGB=black): a fully transparent alpha=0 background has no hit-test surface, causing mouse events to fall through to windows below. Alpha=1 is visually imperceptible but makes the surface interactive.
- Application.Current.Shutdown() chosen over this.Close() in the close handler: the hidden owner window keeps the process alive if only the main window is closed via Close().
- ContentRendered event used for positioning (not constructor): SizeToContent=WidthAndHeight defers measurement until after Show(); ActualWidth is 0 in the constructor.
- DropShadowEffect parameters: Color=Black, BlurRadius=6, ShadowDepth=2, Opacity=0.8, Direction=315 — provides visual definition equivalent to ClearType, which DWM disables on transparent HWND surfaces.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Window shell implementation complete; application compiles and all overlay behaviors are in place
- Phase 3 (integration) can wire PhraseEngine output to the PhraseText TextBlock and add a timer for periodic updates
- Blocker from STATE.md remains: `SizeToContent="WidthAndHeight"` behavior with long phrases (e.g., "just a little after twenty-five past") should be verified early in Phase 3 — window auto-sizing may produce awkward dimensions at the chosen font size

---
*Phase: 02-window-shell*
*Completed: 2026-02-25*

## Self-Check: PASSED

- All 4 implementation files found on disk
- SUMMARY.md found at .planning/phases/02-window-shell/02-02-SUMMARY.md
- Commits 5ba033c and 7d90719 verified in git log
- dotnet build FuzzyClock.slnx: 0 errors, 0 warnings
