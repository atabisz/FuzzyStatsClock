---
phase: 03-integration
plan: 01
subsystem: ui
tags: [wpf, xaml, dispatcher-timer, phrase-engine, transparency]

# Dependency graph
requires:
  - phase: 02-window-shell
    provides: MainWindow.xaml with transparent overlay, PositionTopRight(), right-click close
  - phase: 01-phrase-engine
    provides: PhraseEngine.GetPhrase(DateTime) static method returning fuzzy time strings
provides:
  - MainWindow.xaml with semi-transparent Border backdrop wrapping both TextBlocks
  - Named ShadowText TextBlock for code-behind access
  - SetInitialPhrase(string) for App.xaml.cs to call before Show()
  - DispatcherTimer polling PhraseEngine every 10 seconds
  - UpdatePhraseIfChanged() with UpdateLayout() + PositionTopRight() on phrase change
affects: [03-integration/03-02]

# Tech tracking
tech-stack:
  added: [System.Windows.Threading.DispatcherTimer]
  patterns: [ui-thread-timer, poll-on-change, layout-before-reposition, border-backdrop]

key-files:
  created: []
  modified:
    - FuzzyClock.App/MainWindow.xaml
    - FuzzyClock.App/MainWindow.xaml.cs

key-decisions:
  - "Border backdrop Background=#26000000 (15% black alpha): semi-transparent dark background for phrase legibility without obscuring desktop"
  - "CornerRadius=5, Padding=6: tight fit with small rounded corners per locked decision range"
  - "DispatcherTimer fires on UI thread — no Dispatcher.Invoke needed, timer started in ContentRendered to ensure layout has run"
  - "UpdatePhraseIfChanged() calls UpdateLayout() before PositionTopRight() to flush SizeToContent layout pass so ActualWidth reflects new phrase length"
  - "SetInitialPhrase() is internal — called by App.xaml.cs before Show(); no layout call needed there since ContentRendered handles first position"

patterns-established:
  - "poll-on-change: timer fires every 10s, compares new phrase to current, only updates TextBlocks and repositions if changed"
  - "layout-before-reposition: always call UpdateLayout() before PositionTopRight() when phrase text changes to get valid ActualWidth from SizeToContent"
  - "timer-in-content-rendered: DispatcherTimer initialized and started in ContentRendered handler, never in constructor"

requirements-completed: [DISP-04]

# Metrics
duration: 2min
completed: 2026-02-25
---

# Phase 3 Plan 1: Integration — Live Phrase Engine Wired into MainWindow Summary

**DispatcherTimer polling PhraseEngine.GetPhrase every 10 seconds with Border backdrop, named ShadowText, and layout-aware repositioning on phrase change**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-25T01:26:15Z
- **Completed:** 2026-02-25T01:28:13Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- MainWindow.xaml now has a semi-transparent Border backdrop (#26000000, CornerRadius=5, Padding=6) wrapping both TextBlocks for phrase legibility on any desktop background
- Shadow TextBlock named `ShadowText` so code-behind can update it on phrase change
- Removed hardcoded "half past 3" placeholder and vestigial DropShadowEffect from XAML
- MainWindow.xaml.cs wires PhraseEngine into the live window via 10-second DispatcherTimer
- `SetInitialPhrase(string)` enables App.xaml.cs to set initial phrase before Show()
- `UpdatePhraseIfChanged()` only updates TextBlocks and repositions if the phrase actually changed, avoiding unnecessary layout work

## Task Commits

Each task was committed atomically:

1. **Task 1: XAML — Border backdrop, named ShadowText, remove placeholder and DropShadowEffect** - `72acd8f` (feat)
2. **Task 2: Code-behind — SetInitialPhrase(), DispatcherTimer, UpdatePhraseIfChanged(), ContentRendered update** - `30e348c` (feat)

**Plan metadata:** `[docs commit]` (docs: complete plan)

## Files Created/Modified
- `FuzzyClock.App/MainWindow.xaml` - Border backdrop added, ShadowText named, Text="" on both TextBlocks, DropShadowEffect removed
- `FuzzyClock.App/MainWindow.xaml.cs` - SetInitialPhrase, DispatcherTimer, UpdatePhraseIfChanged, using directives for Threading and FuzzyClock.Core

## Decisions Made
- Border backdrop #26000000 (15% black alpha) chosen as starting point — "nearly invisible" per design intent; adjustable without code change
- DispatcherTimer fires on UI thread — no cross-thread marshalling required, simplifies phrase update code
- UpdateLayout() before PositionTopRight() in UpdatePhraseIfChanged() — ensures SizeToContent width is recalculated for new phrase length before computing Left position
- Timer started in ContentRendered (not constructor) — guarantees layout is valid and ActualWidth is non-zero before any timer-driven repositioning

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None — build succeeded with 0 errors and 0 warnings on both tasks.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- MainWindow is fully wired to PhraseEngine and auto-updates every 10 seconds
- SetInitialPhrase(string) is accessible for App.xaml.cs to call before Show()
- Ready for Plan 03-02 which will update App.xaml.cs to call PhraseEngine.GetPhrase at startup and pass the phrase to SetInitialPhrase before Show()
- Concern from STATE.md remains valid: SizeToContent="WidthAndHeight" behavior with long phrases should be verified at runtime — the window auto-sizing may produce awkward dimensions at FontSize=32

---
*Phase: 03-integration*
*Completed: 2026-02-25*
