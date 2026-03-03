---
phase: 33-auto-contrast
plan: 02
subsystem: ui
tags: [wcag, contrast, bitblt, win32, gdi, dispatcher-timer, tray, appsettings]

# Dependency graph
requires:
  - phase: 33-auto-contrast plan 01
    provides: "ContrastService.ComputeDisplayColor, RgbColor, ContrastState"
provides:
  - "AutoContrastEnabled bool init-property in AppSettings (default false)"
  - "ContrastSamplerService: BitBlt screen capture + average pixel color returning RgbColor"
  - "500ms DispatcherTimer in MainWindow calling sampler and ContrastService, applying via ApplyDisplayColor"
  - "Pause logic: sampling skipped when ghost mode active or opacity=0"
  - "Freeze logic: _isDragging flag set around DragMove() prevents color updates during drag"
  - "Tray Auto-Contrast checkable toggle: starts/stops sampler timer, resets ContrastState, restores accent via ApplyTheme"
  - "TrayMenu_Opening syncs _trayAutoContrast.Checked from _autoContrastEnabled"
  - "ResetToDefaults disables auto-contrast and calls ApplyTheme to restore accent"
  - "ApplySettings restores _autoContrastEnabled; ContentRendered starts timer if enabled"
  - "SaveSettings persists AutoContrastEnabled in with-expression"
affects:
  - "33-auto-contrast (plans 03+): further auto-contrast UI or test plans build on this wiring"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "BitBlt from desktop DC into compatible memory DC backed by System.Drawing.Bitmap for pixel averaging"
    - "System.Drawing.Bitmap.FromHbitmap wraps HBITMAP for GetPixel access; UseWindowsForms=true provides System.Drawing without extra NuGet"
    - "Step-sampling: sample every Nth pixel when width or height exceeds 200px to keep 500ms tick fast"
    - "GDI resource cleanup in try/finally: hOld re-selected before DeleteObject on hBmp, then DeleteDC memDC, then ReleaseDC screenDC"
    - "PresentationSource.FromVisual(this).CompositionTarget.TransformToDevice provides per-monitor DPI M11/M22 scale factors for WPF logical to physical pixel conversion"
    - "InternalsVisibleTo FuzzyClock (App assembly) added to FuzzyClock.Core.csproj so internal ContrastService is accessible from MainWindow"
    - "_isDragging bool flag set true before DragMove() and false after; ContrastTimer_Tick returns early when true to freeze display color during drag"

key-files:
  created:
    - "FuzzyClock.App/ContrastSamplerService.cs"
  modified:
    - "FuzzyClock.App/AppSettings.cs"
    - "FuzzyClock.App/MainWindow.xaml.cs"
    - "FuzzyClock.Core/FuzzyClock.Core.csproj"

key-decisions:
  - "InternalsVisibleTo 'FuzzyClock' (App assembly name) added to Core.csproj: ContrastService is internal per Plan 01; App assembly needs access to call ComputeDisplayColor at runtime. InternalsVisibleTo is minimal-invasive vs making the class public."
  - "ContrastSamplerService takes physical pixel coordinates (int): caller converts via PresentationSource DPI transform, avoiding Window reference inside the static helper"
  - "Step-sampling capped at 200px per dimension: keeps BitBlt area small and GetPixel loop fast enough for 500ms tick even on large widgets"
  - "ApplyDisplayColor mirrors ApplyTheme element coverage exactly (PhraseText, HourHand, MinuteHand, tick/dot/number lists, stat bars and text, UptimeText) so the contrast override is complete"

patterns-established:
  - "Contrast wiring pattern: DispatcherTimer.Tick -> Sample -> ComputeDisplayColor -> ApplyDisplayColor; pause on ghost/opacity=0; freeze on drag"
  - "Tray toggle for timer-based feature: start/stop timer, reset state on enable, ApplyTheme on disable, SaveSettings"

requirements-completed: [CONTRAST-01, CONTRAST-02, CONTRAST-03, CONTRAST-04]

# Metrics
duration: 3min
completed: 2026-03-03
---

# Phase 33 Plan 02: Auto-Contrast Wiring Summary

**BitBlt screen sampler service + 500ms contrast timer wired into MainWindow with ghost/drag pause, tray toggle, and full settings persistence**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-03T05:21:14Z
- **Completed:** 2026-03-03T05:24:29Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- ContrastSamplerService created: BitBlt from desktop DC captures widget footprint into System.Drawing.Bitmap, averages all pixels (with step-sampling up to 200x200), returns RgbColor; full GDI cleanup in try/finally
- MainWindow 500ms DispatcherTimer calls sampler -> ContrastService.ComputeDisplayColor -> ApplyDisplayColor; pauses on ghost mode or zero opacity; freezes color (not loop) during drag
- Auto-Contrast tray toggle: checkable item persisted via AutoContrastEnabled in AppSettings; TrayMenu_Opening syncs checkmark; ResetToDefaults disables it and restores accent
- InternalsVisibleTo for FuzzyClock (App) assembly added to Core.csproj enabling ContrastService access without making it public
- All 88 tests pass (74 Core.Tests + 14 App.Tests), 0 build errors, 0 warnings

## Task Commits

Each task was committed atomically:

1. **Task 1: AppSettings field + ContrastSamplerService** - `bba93a1` (feat)
2. **Task 2: MainWindow sampler timer, tray toggle, pause/freeze, ApplyDisplayColor** - `7f7e5a5` (feat)

## Files Created/Modified
- `FuzzyClock.App/ContrastSamplerService.cs` - BitBlt screen capture service: GDI P/Invoke declarations, Sample(int,int,int,int) method with step-sampling and full resource cleanup
- `FuzzyClock.App/AppSettings.cs` - Added AutoContrastEnabled bool init-property (default false)
- `FuzzyClock.App/MainWindow.xaml.cs` - New fields (_contrastTimer, _autoContrastEnabled, _contrastState, _isDragging, _trayAutoContrast), ContrastTimer_Tick, ApplyDisplayColor, drag freeze, tray item, TrayMenu_Opening sync, ResetToDefaults reset, ApplySettings restore, SaveSettings persist
- `FuzzyClock.Core/FuzzyClock.Core.csproj` - Added InternalsVisibleTo for FuzzyClock (App) assembly

## Decisions Made
- **InternalsVisibleTo for App assembly:** ContrastService is `internal` per Plan 01 design. Rather than making it `public` (which would expose it to any assembly), added a second InternalsVisibleTo entry for `FuzzyClock` (the App's AssemblyName). This follows the exact same pattern already used for the test project and is the minimal-invasive solution.
- **Step-sampling at 200px cap:** Rather than sampling every pixel in large widgets (which could be slow), the service divides by MaxSampleDim=200 in each dimension to keep the GetPixel loop bounded at ~40,000 iterations maximum.
- **ContrastSamplerService takes pixel coordinates:** Accepts `int pixelLeft, int pixelTop, int pixelWidth, int pixelHeight` so the static helper has no Window reference dependency. Caller (MainWindow) converts via `PresentationSource.FromVisual(this).CompositionTarget.TransformToDevice`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added InternalsVisibleTo for FuzzyClock.App to Core.csproj**
- **Found during:** Task 2 (ContrastTimer_Tick implementation)
- **Issue:** ContrastService is `internal` per Plan 01. FuzzyClock.App project (AssemblyName=FuzzyClock) has no InternalsVisibleTo entry in Core.csproj, so calling `ContrastService.ComputeDisplayColor` would produce CS0122 at compile time.
- **Fix:** Added second `<AssemblyAttribute Include="System.Runtime.CompilerServices.InternalsVisibleTo"><_Parameter1>FuzzyClock</_Parameter1></AssemblyAttribute>` to FuzzyClock.Core.csproj alongside existing Core.Tests entry.
- **Files modified:** `FuzzyClock.Core/FuzzyClock.Core.csproj`
- **Verification:** Build succeeded with 0 errors; dotnet test 88/88 pass
- **Committed in:** `bba93a1` (Task 1 commit, alongside AppSettings and ContrastSamplerService)

---

**Total deviations:** 1 auto-fixed (1 blocking infrastructure)
**Impact on plan:** Required for the App project to call ContrastService. No scope creep.

## Issues Encountered
- None - implementation proceeded as planned once InternalsVisibleTo was added.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Auto-contrast end-to-end wiring is complete: AppSettings -> MainWindow -> ContrastSamplerService -> ContrastService -> ApplyDisplayColor
- The feature is functional: enable via tray, widget text adapts to background behind it every 500ms
- Plan 03 (if planned) can address any further polish: e.g., animation smoothing, per-monitor sampling, or additional UI controls
- No blockers

## Self-Check: PASSED

Files confirmed:
- `FuzzyClock.App/AppSettings.cs` - EXISTS (AutoContrastEnabled line 31)
- `FuzzyClock.App/ContrastSamplerService.cs` - EXISTS (Sample method line 34)
- `FuzzyClock.App/MainWindow.xaml.cs` - EXISTS (modified with all required fields/methods)
- `FuzzyClock.Core/FuzzyClock.Core.csproj` - EXISTS (InternalsVisibleTo FuzzyClock added)

Commits confirmed:
- `bba93a1` - feat(33-02): add AutoContrastEnabled to AppSettings and ContrastSamplerService
- `7f7e5a5` - feat(33-02): wire auto-contrast sampler timer, tray toggle, pause/freeze in MainWindow

---
*Phase: 33-auto-contrast*
*Completed: 2026-03-03*
