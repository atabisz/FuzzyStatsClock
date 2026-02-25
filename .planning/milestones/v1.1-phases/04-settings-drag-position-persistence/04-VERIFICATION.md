---
phase: 04-settings-drag-position-persistence
verified: 2026-02-25T00:00:00Z
status: human_needed
score: 12/12 must-haves verified
human_verification:
  - test: "First launch: no settings.json present — widget appears top-right"
    expected: "Widget appears in the top-right corner approximately 20px from right and top edges"
    why_human: "PositionTopRight() logic uses PrimaryScreenWidth at runtime; cannot verify screen coordinates programmatically"
  - test: "Drag: left-click and drag widget to center of screen, release"
    expected: "Widget moves smoothly with mouse; stays where released; no InvalidOperationException in debug output"
    why_human: "DragMove() Win32 modal loop behavior cannot be exercised programmatically"
  - test: "Persistence: after drag to center, close and relaunch"
    expected: "Widget appears at the exact dragged position, not top-right; %LOCALAPPDATA%\\FuzzyClock\\settings.json contains matching Left/Top values"
    why_human: "Requires live process launch and file inspection across sessions"
  - test: "No snap: leave running through a 5-minute clock boundary"
    expected: "When phrase text changes (e.g. 'half past ten' -> 'ten forty'), widget stays in place and does not jump to top-right"
    why_human: "Timer behavior across phrase-boundary transitions requires real-time observation"
  - test: "Off-screen clamp: edit settings.json with Left=99999, Top=99999, then launch"
    expected: "Widget appears fully within visible screen area, not off-screen"
    why_human: "Clamping behavior requires live WPF window creation and actual screen bounds at runtime"
---

# Phase 4: Settings Infrastructure + Drag + Position Persistence — Verification Report

**Phase Goal:** Users can drag the widget to any screen position and find it exactly there on next launch
**Verified:** 2026-02-25
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can drag the widget to any position on any connected monitor | VERIFIED (code) | `Grid_MouseLeftButtonDown` calls `DragMove()` in `MainWindow.xaml.cs:96`; `MainWindow.xaml:21` wires `MouseLeftButtonDown="Grid_MouseLeftButtonDown"` on outer Grid |
| 2 | After close and relaunch, widget appears at exact dragged position | VERIFIED (code) | `App.xaml.cs:44-50`: `SettingsService.Load()` -> `ApplySettings(settings)` before `Show()`; `ApplySettings()` sets `Left`/`Top` when `s.Left != -1` |
| 3 | Off-screen saved position is clamped to visible area on launch | VERIFIED (code) | `MainWindow.xaml.cs:33-37`: `ContentRendered` handler calls `SettingsService.Clamp()` with `ActualWidth`/`ActualHeight` when `_savedPositionLoaded` is true |
| 4 | Position saved immediately after each drag, not only on close | VERIFIED (code) | `MainWindow.xaml.cs:98`: `SaveSettings()` called synchronously after `DragMove()` returns in `Grid_MouseLeftButtonDown` |
| 5 | Phrase auto-updates do not snap widget back to top-right | VERIFIED (code) | `MainWindow.xaml.cs:114`: `if (!_hasUserPosition)` guard wraps the `PositionTopRight()` call in `UpdatePhraseIfChanged()` |

**Score:** 5/5 truths have verifiable code support (human testing required for runtime confirmation)

### Supporting Truths (from Plan must_haves)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| P1-1 | AppSettings record compiles with Left=-1 sentinel | VERIFIED | `AppSettings.cs:4`: `public record AppSettings(double Left, double Top, int FontSize)` — sentinel documented in comment on line 5; `Defaults()` returns `new(-1, 20, 32)` |
| P1-2 | SettingsService.Load() returns Defaults() on first run without throwing | VERIFIED | `SettingsService.cs:22`: `if (!File.Exists(FilePath)) return Defaults()`; `SettingsService.cs:26`: `catch { return Defaults(); }` |
| P1-3 | SettingsService.Save() writes JSON atomically via temp-file + File.Move | VERIFIED | `SettingsService.cs:32-34`: temp path `.tmp`, `File.WriteAllText(tempPath, ...)`, `File.Move(tempPath, FilePath, overwrite: true)` |
| P1-4 | SettingsService.Clamp() uses VirtualScreen* bounds (not PrimaryScreenWidth) | VERIFIED | `SettingsService.cs:46-49`: all four `SystemParameters.VirtualScreen*` properties used; `grep PrimaryScreenWidth` returns no matches in SettingsService.cs |
| P1-5 | Clamp ensures at least 50px visible (plan spec) | DEVIATED-IMPROVED | Actual implementation clamps entire window within bounds (`vLeft + vWidth - windowWidth`), not 50px partial. Documented in SUMMARY as bug-fix `9343668`. Behavior is strictly better. |
| P2-1 | Widget appears top-right on first launch | VERIFIED (code) | `MainWindow.xaml.cs:41`: `ContentRendered` else-branch calls `PositionTopRight()` when `_savedPositionLoaded` is false |
| P2-2 | Position saved on Windows log-off/shutdown | VERIFIED | `App.xaml.cs:55`: `SessionEnding += (_, _) => (MainWindow as MainWindow)?.SaveSettings()` |

**Score (including supporting truths): 12/12 verified (1 documented deviation that is stricter than spec)**

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `FuzzyClock.App/AppSettings.cs` | Settings data contract — plain C# record with Left, Top, FontSize | VERIFIED | Exists; 5 lines; `public record AppSettings(double Left, double Top, int FontSize)` |
| `FuzzyClock.App/SettingsService.cs` | JSON load/save with atomic write, VirtualScreen clamp, defaults | VERIFIED | Exists; 54 lines; all four methods present: `Load`, `Save`, `Defaults`, `Clamp` |
| `FuzzyClock.App/App.xaml.cs` | Load settings before Show(); SessionEnding backup save handler | VERIFIED | Exists; 69 lines; contains `SettingsService.Load`, `ApplySettings`, `SessionEnding` |
| `FuzzyClock.App/MainWindow.xaml.cs` | ApplySettings(), SaveSettings(), Grid_MouseLeftButtonDown(), dual position guards | VERIFIED | Exists; 149 lines; contains all required methods and `_hasUserPosition`, `_savedPositionLoaded` fields |
| `FuzzyClock.App/MainWindow.xaml` | MouseLeftButtonDown wired to outer Grid | VERIFIED | Line 21: `MouseLeftButtonDown="Grid_MouseLeftButtonDown"` on outer `<Grid Background="#01000000">` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `SettingsService.cs` | `%LOCALAPPDATA%\FuzzyClock\settings.json` | `Environment.GetFolderPath(SpecialFolder.LocalApplicationData)` | VERIFIED | `SettingsService.cs:15`: exact pattern present |
| `SettingsService.cs` | `SystemParameters.VirtualScreen*` | `Clamp()` method | VERIFIED | `SettingsService.cs:46-49`: `VirtualScreenLeft`, `VirtualScreenTop`, `VirtualScreenWidth`, `VirtualScreenHeight` all used |
| `App.xaml.cs` | `MainWindow.xaml.cs` | `mainWindow.ApplySettings(settings)` before `mainWindow.Show()` | VERIFIED | `App.xaml.cs:48-50`: `ApplySettings(settings)` on line 48, `Show()` on line 50 — correct ordering |
| `MainWindow.xaml` | `MainWindow.xaml.cs` | `MouseLeftButtonDown="Grid_MouseLeftButtonDown"` | VERIFIED | `MainWindow.xaml:21`: attribute present on outer Grid |
| `MainWindow.xaml.cs Grid_MouseLeftButtonDown` | `SettingsService.cs` | `DragMove()` returns -> `SaveSettings()` -> `SettingsService.Save()` | VERIFIED | `MainWindow.xaml.cs:96-98`: `DragMove()` then `SaveSettings()`; `SaveSettings()` calls `SettingsService.Save()` at line 76 |
| `MainWindow.xaml.cs ContentRendered` | `SettingsService.cs` | `_savedPositionLoaded` guard -> `SettingsService.Clamp()` | VERIFIED | `MainWindow.xaml.cs:28-37`: guard on `_savedPositionLoaded`, calls `SettingsService.Clamp()` at line 33 |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| WIN-04 | 04-01-PLAN.md, 04-02-PLAN.md | User can drag the widget to any position on the desktop | SATISFIED | `Grid_MouseLeftButtonDown` + `DragMove()` in `MainWindow.xaml.cs`; `MouseLeftButtonDown` wired in `MainWindow.xaml` |
| WIN-05 | 04-01-PLAN.md, 04-02-PLAN.md | Widget position restored on startup; off-screen position clamped to visible area | SATISFIED | `SettingsService.Load()` + `ApplySettings()` in `App.xaml.cs`; `SettingsService.Clamp()` in `ContentRendered` handler; `OnClosing` + `SessionEnding` save paths |

**No orphaned requirements.** REQUIREMENTS.md maps WIN-04 and WIN-05 to Phase 4 only. Both are covered by plans 04-01 and 04-02. All Phase 4 requirements satisfied.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | — | — | — | — |

No TODO/FIXME/placeholder comments, no stub implementations, no empty returns found in any Phase 4 source files. The two deviation bug-fixes (`9343668` and `eb3b126`) are improvements, not gaps.

### Notable Deviation: Clamp Strategy

The plan specified `MinVisible = 50` (50px partial-visibility clamping). The actual implementation clamps the **entire window** within virtual screen bounds:

```csharp
// Actual (SettingsService.cs:50-51):
double left = Math.Clamp(s.Left, vLeft, vLeft + vWidth  - windowWidth);
double top  = Math.Clamp(s.Top,  vTop,  vTop  + vHeight - windowHeight);
```

This is strictly better than the spec — the widget is always fully visible rather than potentially half off-screen. Documented in SUMMARY as auto-fixed bug commit `9343668`. The truth "off-screen saved position is clamped to visible area" is fully satisfied and then some.

### Human Verification Required

The following 5 behaviors require a running application to confirm. Automated code inspection verifies the wiring and logic paths exist, but cannot substitute for exercising the actual Win32/WPF runtime:

#### 1. First-Launch Top-Right Positioning

**Test:** Delete `%LOCALAPPDATA%\FuzzyClock\settings.json` if it exists. Launch `FuzzyClock.App`. Observe widget position.
**Expected:** Widget appears in the top-right corner, approximately 20px from the right and top screen edges.
**Why human:** `PositionTopRight()` uses `SystemParameters.PrimaryScreenWidth` and `ActualWidth` which are only valid during a live WPF layout pass. Cannot mock screen dimensions in a static analysis.

#### 2. Drag Repositioning

**Test:** Launch the app. Left-click anywhere on the widget and drag it to the center of the screen. Release.
**Expected:** Widget moves smoothly with the mouse cursor during drag. Stays exactly where released. No exception in debug output.
**Why human:** `DragMove()` is a Win32 blocking modal loop. Cannot exercise without a real HWND and message pump.

#### 3. Position Persistence Across Restart

**Test:** After dragging to center (test 2), right-click and select Close. Relaunch.
**Expected:** Widget appears at the center position (not top-right). `%LOCALAPPDATA%\FuzzyClock\settings.json` contains `Left`/`Top` values matching the dragged position.
**Why human:** Requires cross-process file write followed by a new process reading it and positioning before its first paint.

#### 4. No Snap at Phrase Boundary

**Test:** Drag widget to a non-default position. Leave the app running until the next 5-minute clock boundary (or temporarily change timer interval to 5 seconds in code for testing).
**Expected:** When the phrase changes (e.g. "half past two" becomes "twenty five to three"), the widget stays at the dragged position. It does NOT jump to top-right.
**Why human:** `_hasUserPosition` flag behavior under a real timer tick and phrase change requires observing the running app across a temporal boundary.

#### 5. Off-Screen Clamp

**Test:** Edit `%LOCALAPPDATA%\FuzzyClock\settings.json`, set `Left` to 99999 and `Top` to 99999. Launch the app.
**Expected:** Widget appears fully within the visible screen area. No part of the widget is off-screen or partially hidden.
**Why human:** Clamp output depends on actual `SystemParameters.VirtualScreen*` values reported by the live display driver.

---

## Build Verification

```
dotnet build FuzzyClock.App/FuzzyClock.App.csproj --no-restore -v quiet
Build succeeded.
    0 Warning(s)
    0 Error(s)
```

All Phase 4 source files compile cleanly with zero errors and zero warnings.

---

_Verified: 2026-02-25T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
