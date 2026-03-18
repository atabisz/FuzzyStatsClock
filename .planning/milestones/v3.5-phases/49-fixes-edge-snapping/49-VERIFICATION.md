---
phase: 49-fixes-edge-snapping
verified: 2026-03-18T00:00:00Z
status: passed
score: 6/6 must-haves verified
re_verification: false
---

# Phase 49: Fixes + Edge Snapping Verification Report

**Phase Goal:** The app behaves correctly on crash-restart, second launch, and drag near screen edges
**Verified:** 2026-03-18
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                                              | Status     | Evidence                                                                                              |
|----|--------------------------------------------------------------------------------------------------------------------|------------|-------------------------------------------------------------------------------------------------------|
| 1  | After killing the app via Task Manager and relaunching, the app starts normally without an unhandled exception     | VERIFIED   | `AbandonedMutexException` caught in `App.OnStartup`; `ex.Mutex` assigned to `_instanceMutex`; `createdNew = true` continues as first instance |
| 2  | Launching the app when it is already running brings the existing window to front instead of silently doing nothing | VERIFIED   | `!createdNew` branch calls `SignalRunningInstance()` which sends "ACTIVATE" over named pipe; `StartPipeServer()` background thread calls `mainWindow.Activate()` via `Dispatcher.Invoke` |
| 3  | Pressing Reset to Defaults resets phrase style to Classic and phrase locale to auto, not just visual settings      | VERIFIED   | `ResetToDefaults()` sets `_currentPhraseStyle = "Classic"` directly (bypasses non-English guard), then calls `SetLanguage("auto")` before final `SaveSettings()` |
| 4  | Dragging the widget to within 8px of any screen edge and releasing snaps it flush to that edge                    | VERIFIED   | `SnapToEdge()` called immediately after `_isDragging = false` in `Grid_MouseLeftButtonDown`; threshold is `EdgeSnapThresholdPx = 8.0`; both horizontal and vertical axes covered |
| 5  | The snapped position respects the taskbar working area — widget does not slide under taskbar                       | VERIFIED   | `SnapToEdge()` uses `Screen.WorkingArea` (not `Screen.Bounds`) via `System.Windows.Forms.Screen.FromPoint()` on window center |
| 6  | Dragging freely in the middle of the screen and releasing does not trigger a snap                                  | VERIFIED   | Snap only moves window when `newLeft != Left \|\| newTop != Top` after threshold check; mid-screen positions exceed 8px from any edge and are unchanged |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact                               | Expected                                                        | Status   | Details                                                                                      |
|----------------------------------------|-----------------------------------------------------------------|----------|----------------------------------------------------------------------------------------------|
| `FuzzyClock.App/App.xaml.cs`           | Single-instance guard with AbandonedMutexException + pipe IPC   | VERIFIED | Contains `AbandonedMutexException` catch, `PipeName` constant, `SignalRunningInstance()`, `StartPipeServer()`; `IsBackground = true` on pipe thread |
| `FuzzyClock.App/MainWindow.xaml.cs`    | ResetToDefaults with full phrase reset + SnapToEdge post-DragMove | VERIFIED | Contains `SnapToEdge()` method, `EdgeSnapThresholdPx = 8.0` constant, `_currentPhraseStyle = "Classic"` + `SetLanguage("auto")` in `ResetToDefaults()` |

### Key Link Verification

| From                                      | To                          | Via                                              | Status   | Details                                                                                       |
|-------------------------------------------|-----------------------------|--------------------------------------------------|----------|-----------------------------------------------------------------------------------------------|
| `App.OnStartup` (!createdNew branch)      | `NamedPipeClientStream.Connect` | `SignalRunningInstance()` before `Shutdown()`   | WIRED    | Line 32: `SignalRunningInstance();` called before `Shutdown()` in `!createdNew` block         |
| `App.OnStartup` (first instance path)     | `mainWindow.Activate()`     | Background pipe server thread + `Dispatcher.Invoke` | WIRED | `StartPipeServer(mainWindow)` called at line 65 (after `mainWindow.Show()`); server reads "ACTIVATE" and dispatches `mainWindow.Activate()` |
| `Grid_MouseLeftButtonDown`                | `SnapToEdge()`              | Call immediately after `_isDragging = false`     | WIRED    | Line 521: `SnapToEdge();` immediately after `_isDragging = false` at line 520, before cross-monitor check and `SaveSettings()` |
| `SnapToEdge()`                            | `Screen.WorkingArea`        | `Screen.FromPoint` on window center              | WIRED    | `var wa = screen.WorkingArea;` used for all four edge calculations                            |
| `ResetToDefaults()`                       | `_currentPhraseStyle` / `_currentPhraseLocale` | Direct field assignment + `SetLanguage("auto")` | WIRED | `_currentPhraseStyle = "Classic";` at line 1072 followed immediately by `SetLanguage("auto");` at line 1073 |

### Requirements Coverage

| Requirement | Source Plan | Description                                                                 | Status    | Evidence                                                                                    |
|-------------|-------------|-----------------------------------------------------------------------------|-----------|----------------------------------------------------------------------------------------------|
| FIX-01      | 49-02       | ResetToDefaults() also resets phrase style to Classic and locale to "auto"  | SATISFIED | `_currentPhraseStyle = "Classic"` + `SetLanguage("auto")` in `ResetToDefaults()` — confirmed in MainWindow.xaml.cs lines 1072–1073 |
| FIX-02      | 49-01       | Second launch brings existing window to front instead of silently exiting   | SATISFIED | `SignalRunningInstance()` sends ACTIVATE over named pipe; `StartPipeServer()` activates window on receipt |
| FIX-03      | 49-01       | AbandonedMutexException handled so app can restart after a crash            | SATISFIED | try/catch block catches `AbandonedMutexException`, assigns `ex.Mutex` to `_instanceMutex`, sets `createdNew = true` |
| SNAP-01     | 49-02       | Widget snaps to screen edges when drag ends within 8px of any edge          | SATISFIED | `SnapToEdge()` checks all four edges with `EdgeSnapThresholdPx = 8.0`                        |
| SNAP-02     | 49-02       | Edge snap respects the working area (excludes taskbar)                      | SATISFIED | `Screen.WorkingArea` used in `SnapToEdge()`, not `Screen.Bounds`                             |
| SNAP-03     | 49-02       | Edge snap fires post-DragMove() only — not during drag, not on phrase resize | SATISFIED | `SnapToEdge()` has exactly 2 occurrences in MainWindow.xaml.cs: one definition, one call site in `Grid_MouseLeftButtonDown` only — no calls from timers, `LocationChanged`, or `UpdatePhraseIfChanged` |

### Anti-Patterns Found

No anti-patterns detected. No TODO/FIXME/PLACEHOLDER comments in the modified files. No stub implementations. No empty handlers.

### Human Verification Required

#### 1. Crash-Restart Behavior

**Test:** Kill the running app with Task Manager (End Task). Relaunch the app from the executable.
**Expected:** App starts normally — no "The application is already running" error or unhandled exception dialog.
**Why human:** Cannot simulate an OS-level mutex abandonment programmatically in the test suite.

#### 2. Second Instance Activation

**Test:** Launch the app. Drag it to a corner. Move focus away. Launch the app a second time.
**Expected:** The existing window is brought to the front (activated) and the second instance exits silently.
**Why human:** Named-pipe IPC requires two live processes to test end-to-end; the unit test suite cannot exercise this.

#### 3. Edge Snap — Visual Confirmation

**Test:** Drag the widget to within a few pixels of the right screen edge and release.
**Expected:** Widget snaps flush to the right working-area edge; does not overlap the taskbar if taskbar is on the right.
**Why human:** DPI scaling and per-monitor awareness can affect the 8px threshold in ways that are only observable at runtime.

#### 4. Mid-Screen No-Snap Confirmation

**Test:** Drag the widget to the center of the screen and release.
**Expected:** Widget stays exactly where released — no snap, no jump.
**Why human:** Confirms the threshold boundary works in practice; complements the code-level evidence.

### Build and Test Results

- Build: 0 errors, 0 warnings (`dotnet build -c Release`)
- App tests: 25/25 passed
- Core tests: 198/199 passed (1 failure: `HourWrap_QualifierAndEmphasis` — pre-existing race condition in static `PhraseEngine` state under parallel MSTest execution; documented as pre-existing across phases 46, 48, and 49; unrelated to this phase's changes)

---

_Verified: 2026-03-18_
_Verifier: Claude (gsd-verifier)_
