# Phase 49: Fixes + Edge Snapping - Research

**Researched:** 2026-03-18
**Domain:** WPF window positioning, single-instance IPC, Mutex exception handling, edge snap geometry
**Confidence:** HIGH

## Summary

Phase 49 addresses three bug fixes (FIX-01: ResetToDefaults missing phrase/locale reset, FIX-02: second launch should activate instead of silently exiting, FIX-03: AbandonedMutexException on crash-restart) and three edge snap requirements (SNAP-01/02/03: 8px snap-to-edge post-DragMove using working area). All changes are self-contained to `App.xaml.cs` and `MainWindow.xaml.cs`. No new NuGet packages required.

The STATE.md already captures all key architectural decisions for this phase: named-pipe IPC for bring-to-front, 8px snap threshold, post-DragMove snap only. These decisions are locked and confirmed by prior research. The implementation is straightforward incremental surgery on well-understood code — the codebase already has the correct patterns for Mutex, DragMove, and Screen.WorkingArea.

The edge snap implementation can reuse the existing `SettingsService.Clamp()` pure overload (which uses `Screen.WorkingArea` bounds) — but snap needs distinct logic: instead of clamping to stay visible, it snaps the final position to the nearest edge boundary if within 8px. This is a separate helper from Clamp. The `Grid_MouseLeftButtonDown` handler is the correct and only insertion point for snap (post-DragMove, before SaveSettings).

**Primary recommendation:** Implement all 6 requirements as minimal surgical changes to App.xaml.cs (FIX-02/03) and MainWindow.xaml.cs (FIX-01, SNAP-01/02/03). Zero new dependencies.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FIX-01 | ResetToDefaults() also resets phrase style to Classic and phrase locale to "auto" | ResetToDefaults() is already well-structured; two fields missing from reset: `_currentPhraseStyle` and `_currentPhraseLocale`. Must call SetPhraseStyle("Classic") and SetLanguage("auto") at end of reset block, then let existing SaveSettings() persist. |
| FIX-02 | Second launch brings existing window to front instead of silently exiting | STATE.md decision: named pipe IPC (NamedPipeServerStream). Server in App.OnStartup background thread; second instance writes "ACTIVATE" and exits. MainWindow.Activate() + BringToFront via Dispatcher. |
| FIX-03 | AbandonedMutexException handled so app can restart after crash | Current App.xaml.cs Mutex code only checks `createdNew`. AbandonedMutexException is thrown from `new Mutex(initiallyOwned: true, ...)` when the previous owner crashed. Must wrap Mutex constructor in try/catch(AbandonedMutexException) and treat as "we now own it". |
| SNAP-01 | Widget snaps to screen edges within 8px at drag end | New `SnapToEdge()` helper in MainWindow. Called in Grid_MouseLeftButtonDown immediately after DragMove() returns, before SaveSettings(). Uses Screen.FromPoint on window center, compares Left/Top/Right/Bottom to working area edges. |
| SNAP-02 | Edge snap respects working area (excludes taskbar) | Use `Screen.WorkingArea` (not `Screen.Bounds`) — already the convention in this codebase (SettingsService.Clamp uses WorkingArea). |
| SNAP-03 | Edge snap fires post-DragMove() only — not during drag, not on phrase resize | Insert snap call in Grid_MouseLeftButtonDown after `DragMove()` returns. Do NOT call from LocationChanged, UpdatePhraseIfChanged, or any timer path. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| System.Threading.Mutex | .NET BCL | Single-instance guard | Already used in App.xaml.cs |
| System.IO.Pipes.NamedPipeServerStream | .NET BCL | IPC bring-to-front | No new packages; pure .NET BCL |
| System.IO.Pipes.NamedPipeClientStream | .NET BCL | Second instance sends ACTIVATE | Same BCL namespace |
| System.Windows.Forms.Screen | WinForms (already referenced) | Screen bounds / working area | Already used in SettingsService.Clamp and UpdatePhraseIfChanged |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| System.Threading.Thread (background) | .NET BCL | Named pipe server listener thread | Non-blocking; must be IsBackground=true so it doesn't prevent process exit |
| System.Windows.Threading.Dispatcher | WPF BCL | Marshal ACTIVATE signal to UI thread | Required for all WPF window operations from background thread |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| NamedPipeServerStream | WM_COPYDATA / PostMessage | Pipes are cleaner, no HWND lookup needed, already decided in STATE.md |
| NamedPipeServerStream | Mutex + global atom + FindWindow | More fragile; Win32 FindWindow unreliable for AllowsTransparency windows |
| Post-DragMove snap | WM_MOVING hook | WM_MOVING is unreliable inside DragMove() modal loop — documented in ghost mode notes |

**Installation:** No new packages. All APIs are in System.IO.Pipes (already in .NET BCL) and System.Windows.Forms (already referenced in FuzzyClock.App.csproj).

## Architecture Patterns

### Pattern 1: AbandonedMutexException Handling

**What:** When a process holding a Mutex crashes, the OS "abandons" the Mutex. The next `new Mutex(initiallyOwned: true, "...", out createdNew)` call throws `AbandonedMutexException` rather than returning `createdNew=true`. The exception carries a `.Mutex` property — the caller now owns it.

**When to use:** Any single-instance Mutex pattern where the previous instance may have crashed.

**Example:**
```csharp
// In App.OnStartup, replace bare Mutex constructor with try/catch:
bool createdNew;
try
{
    _instanceMutex = new Mutex(initiallyOwned: true, "FuzzyClock_SingleInstance_v1", out createdNew);
}
catch (AbandonedMutexException ex)
{
    // Previous instance crashed — we now own the mutex; proceed as first instance
    _instanceMutex = ex.Mutex;
    createdNew = true;
}

if (!createdNew)
{
    // Signal the running instance to activate, then exit
    SignalRunningInstance();
    _instanceMutex?.Dispose();
    _instanceMutex = null;
    Shutdown();
    return;
}
// ... rest of startup
```

### Pattern 2: Named Pipe Bring-to-Front IPC

**What:** The running instance listens on a named pipe. The second instance connects, sends "ACTIVATE", and exits. The server reads the message and calls `Dispatcher.Invoke(() => mainWindow.Activate())`.

**When to use:** Single-instance "bring to front" pattern where you need to marshal to the UI thread.

**Example:**
```csharp
// Server side — start in App.OnStartup after window is shown:
private void StartPipeServer(MainWindow mainWindow)
{
    var thread = new Thread(() =>
    {
        while (true)
        {
            using var server = new System.IO.Pipes.NamedPipeServerStream(
                "FuzzyClock_Activate_v1",
                System.IO.Pipes.PipeDirection.In,
                maxNumberOfServerInstances: 1);
            server.WaitForConnection();
            using var reader = new System.IO.StreamReader(server);
            string? msg = reader.ReadLine();
            if (msg == "ACTIVATE")
            {
                Dispatcher.Invoke(() =>
                {
                    if (mainWindow.WindowState == WindowState.Minimized)
                        mainWindow.WindowState = WindowState.Normal;
                    mainWindow.Activate();
                });
            }
        }
    }) { IsBackground = true, Name = "PipeActivateServer" };
    thread.Start();
}

// Client side — in the !createdNew branch:
private static void SignalRunningInstance()
{
    try
    {
        using var client = new System.IO.Pipes.NamedPipeClientStream(
            ".", "FuzzyClock_Activate_v1",
            System.IO.Pipes.PipeDirection.Out);
        client.Connect(timeoutMs: 500);
        using var writer = new System.IO.StreamWriter(client);
        writer.WriteLine("ACTIVATE");
        writer.Flush();
    }
    catch { /* running instance may not have pipe ready yet — acceptable */ }
}
```

**Important:** `NamedPipeServerStream` with `maxNumberOfServerInstances: 1` means only one listening instance at a time. The loop `while(true)` handles multiple subsequent second-launch attempts. The thread must be `IsBackground = true`.

### Pattern 3: Post-DragMove Edge Snap

**What:** After `DragMove()` returns, the window's `Left` and `Top` are the final dropped position. Compare each edge against `Screen.WorkingArea` and snap if within threshold.

**When to use:** Desktop overlay widgets where casual near-edge drops should cleanly align to the edge.

**Example:**
```csharp
private const double SnapThresholdPx = 8.0;

private void SnapToEdge()
{
    var screen = System.Windows.Forms.Screen.FromPoint(
        new System.Drawing.Point(
            (int)(Left + ActualWidth  / 2),
            (int)(Top  + ActualHeight / 2)));
    var wa = screen.WorkingArea;

    double newLeft = Left;
    double newTop  = Top;

    // Left edge
    if (Math.Abs(Left - wa.Left) <= SnapThresholdPx)
        newLeft = wa.Left;
    // Right edge
    else if (Math.Abs((Left + ActualWidth) - (wa.Left + wa.Width)) <= SnapThresholdPx)
        newLeft = wa.Left + wa.Width - ActualWidth;

    // Top edge
    if (Math.Abs(Top - wa.Top) <= SnapThresholdPx)
        newTop = wa.Top;
    // Bottom edge
    else if (Math.Abs((Top + ActualHeight) - (wa.Top + wa.Height)) <= SnapThresholdPx)
        newTop = wa.Top + wa.Height - ActualHeight;

    if (newLeft != Left || newTop != Top)
    {
        Left = newLeft;
        Top  = newTop;
    }
}
```

Call this in `Grid_MouseLeftButtonDown` immediately after `_isDragging = false;` and before the cross-monitor key update and `SaveSettings()`.

### Pattern 4: FIX-01 — Completing ResetToDefaults

**What:** `ResetToDefaults()` currently resets all settings EXCEPT phrase style and phrase locale. Add the two missing resets.

**Where to insert:** At the end of `ResetToDefaults()`, before the final `SaveSettings()` call. Must call `SetPhraseStyle("Classic")` (which calls `PhraseEngine.SetLocale("en-classic")` and clears text cache) and set `_currentPhraseLocale = "auto"` then call `SetLanguage("auto")` (which computes effectiveLocale from Windows culture).

**Note on SetPhraseStyle guard:** `SetPhraseStyle` has a guard `if (!PhraseEngine.CurrentLocale.StartsWith("en-"))` — this guard must be bypassed during reset, OR the locale must be cleared first. The safe approach: set `_currentPhraseLocale = "auto"` first and call `SetLanguage("auto")`, which will set `PhraseEngine` to an `en-*` locale for English systems, then call `SetPhraseStyle("Classic")`. For non-English system languages (fr/es/de/ja/pl), `SetLanguage("auto")` will set `PhraseEngine` to that language locale, and `SetPhraseStyle` will be a no-op (correct — non-English locales don't use phrase styles). The field `_currentPhraseStyle` must still be forced to "Classic" regardless.

### Anti-Patterns to Avoid

- **Calling SnapToEdge() from LocationChanged:** LocationChanged fires continuously during drag (every pixel move). Snap must only fire post-drop. Always insert in MouseLeftButtonDown after DragMove() returns.
- **Using Screen.Bounds instead of Screen.WorkingArea for snap:** Taskbar area would be included, potentially snapping the widget behind the taskbar. The project convention is always WorkingArea.
- **Catching Exception broadly for AbandonedMutexException:** Catch only `AbandonedMutexException` specifically; do not swallow unrelated Mutex construction failures.
- **Starting pipe server before window is shown:** The pipe server calls `Dispatcher.Invoke` on the App's dispatcher; this is safe post-Show(). Start it after `mainWindow.Show()` in OnStartup.
- **Named pipe race condition on server restart:** The `while(true)` loop creates a new `NamedPipeServerStream` after each connection — this is the correct pattern. Do NOT reuse a connected pipe instance for a new connection.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Screen working area detection | Custom DPI-aware rect calculation | `Screen.FromPoint().WorkingArea` | Already used in this codebase; handles per-monitor DPI via WinForms |
| IPC message passing | Named events + global atom + FindWindow | NamedPipeServerStream | Pipes are simpler, already in .NET BCL, no HWND needed |
| Clamp-to-visible | Second snap implementation | Reuse `SettingsService.Clamp()` pure overload | Already tested, pure, no WPF dependency |

**Key insight:** All required functionality is already in the BCL and already-referenced WinForms layer. The work is surgical insertion of ~50 lines, not new infrastructure.

## Common Pitfalls

### Pitfall 1: SetPhraseStyle Guard Blocks FIX-01 Reset

**What goes wrong:** `SetPhraseStyle("Classic")` has a guard `if (!PhraseEngine.CurrentLocale.StartsWith("en-")) return;`. If the system language is French (auto-detected), calling `SetPhraseStyle` does nothing, so `_currentPhraseStyle` stays at whatever the user had set, and after reset the settings window still shows the old style.

**Why it happens:** The guard prevents overriding non-English phrase styles mid-session. But Reset should be unconditional.

**How to avoid:** In `ResetToDefaults()`, set `_currentPhraseStyle = "Classic"` directly (bypassing the guard) and then call `SetLanguage("auto")` to recalculate the effective locale. Do not call `SetPhraseStyle` from reset — set the field directly plus let `SetLanguage` handle the PhraseEngine locale routing.

**Warning signs:** After reset on a non-English system, phrase style field does not change back to Classic in settings JSON.

### Pitfall 2: Pipe Server Thread Not IsBackground

**What goes wrong:** If `IsBackground = false` (the default), the pipe server thread keeps the process alive after the main window closes. `Application.Shutdown()` signals the dispatcher to stop but the process won't exit because the non-background thread is blocking on `WaitForConnection()`.

**Why it happens:** .NET process exit waits for all foreground threads.

**How to avoid:** Always set `thread.IsBackground = true` on the pipe listener thread.

**Warning signs:** App appears to close (window disappears) but process stays in Task Manager.

### Pitfall 3: AbandonedMutexException Has Mutex Property

**What goes wrong:** Developer catches `AbandonedMutexException` but creates a NEW Mutex instead of using `ex.Mutex`. Two separate Mutex objects now exist — the original is not properly tracked, causing a double-release on exit.

**Why it happens:** `AbandonedMutexException.Mutex` is not widely known; many examples just catch and re-throw or ignore.

**How to avoid:** Use `_instanceMutex = ex.Mutex` from the catch block. Existing `OnExit` cleanup (`ReleaseMutex()` + `Dispose()`) then works correctly.

### Pitfall 4: Snap Fires on Phrase Resize

**What goes wrong:** `UpdatePhraseIfChanged()` re-clamps the window post-resize. If snap logic is accidentally placed in a shared clamp helper, it would fire on phrase change and snap near-but-not-intended placements.

**Why it happens:** Attempting to unify snap and clamp logic.

**How to avoid:** Keep `SnapToEdge()` as a standalone private method called ONLY from `Grid_MouseLeftButtonDown`. The re-clamp in `UpdatePhraseIfChanged` uses `SettingsService.Clamp()` (keeps window on-screen) — do not add snap logic there.

### Pitfall 5: Pipe Client Times Out When Running Instance Hasn't Started Server Yet

**What goes wrong:** If two instances launch in rapid succession (e.g., autostart + manual launch within milliseconds), the pipe server may not be listening yet when the client tries to connect.

**Why it happens:** App startup involves window creation, settings load, and Show() before the pipe server thread starts. The server is started after Show(), so there's a brief window.

**How to avoid:** Use a short timeout (500ms) in `client.Connect(timeoutMs)`. Wrap in try/catch — if the connection fails, the second instance simply exits quietly (acceptable; the first instance will be visible).

## Code Examples

### FIX-03 — Mutex with AbandonedMutexException Handling

```csharp
// In App.OnStartup, replace:
//   _instanceMutex = new Mutex(initiallyOwned: true, "FuzzyClock_SingleInstance_v1", out bool createdNew);
// With:
bool createdNew;
try
{
    _instanceMutex = new Mutex(initiallyOwned: true, "FuzzyClock_SingleInstance_v1", out createdNew);
}
catch (AbandonedMutexException ex)
{
    // Previous instance crashed without releasing the Mutex.
    // The OS abandons the Mutex and transfers ownership to us.
    _instanceMutex = ex.Mutex;
    createdNew = true;
}
```

### FIX-02 — Named Pipe Single-Instance Bring-to-Front

```csharp
// Add to App.xaml.cs — pipe name constant:
private const string PipeName = "FuzzyClock_Activate_v1";

// Second instance (!createdNew branch) — signal and exit:
try
{
    using var client = new System.IO.Pipes.NamedPipeClientStream(
        ".", PipeName, System.IO.Pipes.PipeDirection.Out);
    client.Connect(500); // 500ms timeout
    using var writer = new System.IO.StreamWriter(client);
    writer.WriteLine("ACTIVATE");
    writer.Flush();
}
catch { /* running instance may be starting — ignore */ }

// First instance — start server after mainWindow.Show():
var thread = new Thread(() =>
{
    while (true)
    {
        try
        {
            using var server = new System.IO.Pipes.NamedPipeServerStream(
                PipeName, System.IO.Pipes.PipeDirection.In, 1);
            server.WaitForConnection();
            using var reader = new System.IO.StreamReader(server);
            if (reader.ReadLine() == "ACTIVATE")
                Dispatcher.Invoke(() => (MainWindow as MainWindow)?.Activate());
        }
        catch { /* server interrupted on app exit — IsBackground=true will clean up */ }
    }
})
{
    IsBackground = true,
    Name = "FuzzyClock_PipeServer"
};
thread.Start();
```

### SNAP-01/02/03 — Post-DragMove Edge Snap

```csharp
// Add to MainWindow.xaml.cs:
private const double EdgeSnapThresholdPx = 8.0;

private void SnapToEdge()
{
    var screen = System.Windows.Forms.Screen.FromPoint(
        new System.Drawing.Point(
            (int)(Left + ActualWidth  / 2),
            (int)(Top  + ActualHeight / 2)));
    var wa = screen.WorkingArea;

    double newLeft = Left;
    double newTop  = Top;

    // Horizontal snap
    if (Math.Abs(Left - wa.Left) <= EdgeSnapThresholdPx)
        newLeft = wa.Left;
    else if (Math.Abs((Left + ActualWidth) - (wa.Left + wa.Width)) <= EdgeSnapThresholdPx)
        newLeft = wa.Left + wa.Width - ActualWidth;

    // Vertical snap
    if (Math.Abs(Top - wa.Top) <= EdgeSnapThresholdPx)
        newTop = wa.Top;
    else if (Math.Abs((Top + ActualHeight) - (wa.Top + wa.Height)) <= EdgeSnapThresholdPx)
        newTop = wa.Top + wa.Height - ActualHeight;

    if (newLeft != Left || newTop != Top)
    {
        Left = newLeft;
        Top  = newTop;
    }
}

// Call in Grid_MouseLeftButtonDown immediately after:
//   _isDragging = false;
// And before the cross-monitor key update + SaveSettings().
```

### FIX-01 — ResetToDefaults Phrase Reset

```csharp
// In ResetToDefaults(), add before the final SaveSettings():

// Reset phrase locale to auto and phrase style to Classic
_currentPhraseLocale = "auto";
SetLanguage("auto");           // recomputes PhraseEngine locale from Windows culture
_currentPhraseStyle  = "Classic";
// Note: do NOT call SetPhraseStyle("Classic") here — it has a non-English guard.
// SetLanguage("auto") already routes to "en-classic" on English systems.
// On non-English auto systems, PhraseStyle stays irrelevant (non-en locale).
// Force _currentPhraseStyle field directly so settings save correctly.
PhraseText.Text = "";          // clear cache so phrase refreshes immediately
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Silent exit on second launch | Named pipe IPC → activate | Phase 49 | User gets focus instead of confusion |
| Crash leaves Mutex orphaned | AbandonedMutexException catch | Phase 49 | App restarts cleanly after crash |
| Free drag, no edge alignment | 8px snap-to-working-area-edge | Phase 49 | Casual near-edge drops look intentional |

## Open Questions

1. **Pipe server and WPF Dispatcher lifecycle**
   - What we know: `Dispatcher.Invoke()` on a running WPF dispatcher is safe from background threads.
   - What's unclear: If app shuts down while pipe server is blocking on `WaitForConnection()`, will the try/catch in the server loop cleanly absorb the `ObjectDisposedException` or `IOException` that results?
   - Recommendation: Wrap the server loop body in try/catch (IOException, ObjectDisposedException) and break/return on those. `IsBackground = true` means the OS will clean up anyway, but explicit handling avoids any test-time noise.

2. **Per-monitor DPI and snap coordinates**
   - What we know: WPF `Left`/`Top` are in device-independent units (DIPs) at 96 DPI. `Screen.WorkingArea` is in physical pixels. On a 200% DPI monitor, the relationship is 2:1.
   - What's unclear: Whether the existing codebase compensates for this (the clamp in UpdatePhraseIfChanged does the same int cast pattern as proposed snap code).
   - Recommendation: Follow the exact same pattern already used in `UpdatePhraseIfChanged` and `Grid_MouseLeftButtonDown` — `(int)(Left + ActualWidth / 2)` for `Screen.FromPoint`. The snap arithmetic should use DIP coordinates (Left, Top, ActualWidth, ActualHeight) for setting, and WorkingArea coordinates for comparison, which is the same mixed approach already working in this codebase. Flag for manual verification on a high-DPI system.

## Sources

### Primary (HIGH confidence)
- REQUIREMENTS.md — authoritative requirement text for FIX-01/02/03, SNAP-01/02/03
- STATE.md — locked architectural decisions (named pipe IPC, 8px threshold, post-DragMove snap, AbandonedMutexException handling strategy)
- App.xaml.cs (current code) — exact Mutex usage to be patched
- MainWindow.xaml.cs (current code) — Grid_MouseLeftButtonDown, ResetToDefaults, UpdatePhraseIfChanged patterns
- SettingsService.cs (current code) — Screen.WorkingArea usage pattern and Clamp overload

### Secondary (MEDIUM confidence)
- .NET BCL documentation for AbandonedMutexException: https://learn.microsoft.com/en-us/dotnet/api/system.threading.abandonedmutexexception — `ex.Mutex` property confirmed
- .NET BCL documentation for NamedPipeServerStream: https://learn.microsoft.com/en-us/dotnet/api/system.io.pipes.namedpipeserverstream

### Tertiary (LOW confidence)
- None — all claims are grounded in existing project code or .NET BCL documentation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all APIs already in use or in the BCL
- Architecture: HIGH — all key decisions pre-locked in STATE.md; patterns match existing codebase conventions
- Pitfalls: HIGH — derived from reading the actual code; AbandonedMutexException behavior is well-documented BCL contract
- DPI/coordinate mixed-mode: MEDIUM — the existing pattern works (proven by current clamp logic), but explicit high-DPI verification is recommended during execution

**Research date:** 2026-03-18
**Valid until:** 2026-04-18 (stable domain — .NET BCL + WPF patterns, no fast-moving dependencies)
