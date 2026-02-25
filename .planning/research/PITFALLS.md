# Pitfalls Research

**Domain:** WPF transparent frameless overlay — drag, position persistence, font size (v1.1 additions)
**Project:** Fuzzy Clock
**Researched:** 2026-02-25
**Confidence:** HIGH — all critical claims verified against official Microsoft docs (windowsdesktop-10.0)

---

> **Scope note:** This document covers pitfalls specific to adding drag-to-reposition, JSON position/font-size persistence, and font size selection to the existing transparent WPF overlay. The prior v1.0 pitfalls (transparency dependency, ClearType, software rendering, DispatcherTimer drift, hit-testing, DPI, multiple instances, Topmost, taskbar, SizeToContent) are documented in the original PITFALLS.md and not duplicated here. This document focuses exclusively on v1.1 concerns and how they interact with the already-shipped v1.0 constraints.

---

## Critical Pitfalls

Mistakes that cause silent wrong behavior, broken positioning, or lost settings.

---

### Pitfall 1: DragMove() Fires on the Shadow TextBlock and Steals Mouse Events

**What goes wrong:**
The window has two overlapping `TextBlock` elements — `ShadowText` and `PhraseText`. If `MouseLeftButtonDown` is wired on the outer `Grid` (or on `this`), it fires correctly. But if the handler is placed on `PhraseText` only, dragging the shadow offset area (2px right/down from text) fires on `ShadowText` instead and the drag silently does nothing — because `ShadowText` has `IsHitTestVisible="False"`. Result: drag works on 90% of the text area but fails on the shadow offset pixels.

More importantly: calling `DragMove()` on the `Window` when the source of the `MouseLeftButtonDown` is a non-window element requires the event to bubble up. If any child element marks the event as `Handled = true` (which `ContextMenu` infrastructure sometimes does), `DragMove()` receives a stale mouse state and throws `InvalidOperationException: The left mouse button is not down`.

**Why it happens:**
`DragMove()` is documented to throw `InvalidOperationException` if the left button is not pressed at call time. The button state check is performed at the Win32 level at the moment of the call. If the event has been handled (or if the call is deferred even one dispatcher tick), the button may already be released.

**How to avoid:**
Wire `MouseLeftButtonDown` directly on the outermost `Grid` (which has `Background="#01000000"` and is therefore fully hit-testable). Do not wire on child elements. Call `DragMove()` synchronously inside the handler — no `Dispatcher.BeginInvoke`, no `await`.

```csharp
// Correct: on the Grid, synchronous
private void Grid_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
{
    // e.ButtonState check is redundant inside MouseLeftButtonDown, but defensive
    this.DragMove();
}
```

Do not call `DragMove()` inside `PreviewMouseLeftButtonDown` — the preview route fires before hit-testing resolves the final target and can trigger on transparent areas.

**Warning signs:**
- Drag works when clicking text center but fails at text edges or shadow area.
- `InvalidOperationException` in output window during drag attempts.
- Drag starts, window moves one pixel, then freezes.

**Phase to address:** Phase introducing drag (v1.1 Phase 1).

---

### Pitfall 2: DragMove() Blocks Until Mouse Release — ContentRendered and Timer Interaction

**What goes wrong:**
`DragMove()` is a blocking call. It enters a modal message loop internally and does not return until the user releases the left mouse button. While dragging, the `DispatcherTimer` continues to tick (its `Tick` event is queued on the dispatcher), but the handler is blocked in `DragMove()`. When the user releases the button, the accumulated timer ticks drain. Each tick calls `UpdatePhraseIfChanged()`. If the phrase has not changed (the common case), this is harmless. But if the phrase changes during a long drag (crossing a 5-minute boundary), `UpdatePhraseIfChanged()` calls `UpdateLayout()` then `PositionTopRight()`. This repositions the window to the top-right corner, overwriting the position the user just dragged to.

**Why it happens:**
`UpdatePhraseIfChanged()` unconditionally calls `PositionTopRight()` after a phrase change. In v1.0 this was correct because there was no user-controlled position. In v1.1 it is a logic error: auto-repositioning after a phrase change must be conditional on whether a saved position exists.

**How to avoid:**
Once the user has manually positioned the widget (or a saved position has been loaded), `PositionTopRight()` must never be called again. Introduce a `bool _hasUserPosition` flag. Set it to `true` after the first drag completes (use `LocationChanged` event, which fires after `DragMove()` returns). In `UpdatePhraseIfChanged()`, skip `PositionTopRight()` when `_hasUserPosition` is true.

```csharp
private bool _hasUserPosition = false;

// In constructor or ContentRendered:
this.LocationChanged += (_, _) => _hasUserPosition = true;

// In UpdatePhraseIfChanged():
UpdateLayout();
if (!_hasUserPosition)
    PositionTopRight();
```

**Warning signs:**
- User drags widget to center of screen. Clock hits 5-minute boundary. Widget snaps back to top-right corner.
- Position save contains correct value, but widget appears at top-right on next launch anyway (because `PositionTopRight()` overwrites the saved position mid-session).

**Phase to address:** Phase introducing drag (v1.1 Phase 1) — must be addressed before phrase-change-during-drag can occur.

---

### Pitfall 3: Saving Window.Left/Top During ContentRendered Saves PositionTopRight Values, Not User Position

**What goes wrong:**
The v1.0 `ContentRendered` handler calls `PositionTopRight()`, which sets `this.Left` and `this.Top`. If the new v1.1 startup code loads a saved position before `ContentRendered` fires, but `ContentRendered` still calls `PositionTopRight()`, the loaded position is immediately overwritten before the user ever sees the window.

The sequence that causes the bug:
1. App startup: load saved `Left=400, Top=300` from JSON.
2. Set `this.Left = 400`, `this.Top = 300`.
3. `Show()` is called. Layout runs. `ContentRendered` fires.
4. `ContentRendered` calls `PositionTopRight()` — sets `Left = 1880, Top = 20`.
5. Widget appears at top-right, ignoring saved position.

**Why it happens:**
`ContentRendered` unconditionally calls `PositionTopRight()` in v1.0 because there was no alternative. With persistence, this must become conditional: only call `PositionTopRight()` if no saved position exists.

**How to avoid:**
Introduce a `bool _savedPositionLoaded` flag. Set it when a saved position is successfully loaded from JSON. In `ContentRendered`, only call `PositionTopRight()` when `_savedPositionLoaded` is false.

```csharp
private bool _savedPositionLoaded = false;

// ContentRendered handler:
ContentRendered += (_, _) =>
{
    if (!_savedPositionLoaded)
        PositionTopRight();
    // start timer regardless
    _timer = new DispatcherTimer { ... };
    _timer.Start();
};
```

**Warning signs:**
- JSON file is written with correct values on close, but position is always top-right on launch.
- Logging shows `Left`/`Top` are set correctly in constructor but window appears elsewhere.

**Phase to address:** Phase introducing position persistence (v1.1 Phase 1 or 2, whichever implements startup restore).

---

### Pitfall 4: SizeToContent=WidthAndHeight Shifts Window.Left When the Font Size Changes

**What goes wrong:**
When font size is changed (e.g., 24pt → 32pt), the text becomes wider. With `SizeToContent=WidthAndHeight`, the window grows to the right. The window's `Left` edge does not change — only the `Right` edge moves. This means that if the user placed the widget so its left edge is at x=100, after a font size increase the widget still starts at x=100 but is now wider. This is probably fine.

However, the shadow `TextBlock` also changes size (it mirrors `FontSize`). If only `PhraseText.FontSize` is changed but `ShadowText.FontSize` is not, the window size is computed from the larger element. The two text blocks are in a `Grid`, so the grid is sized to the maximum of the two. Mismatched font sizes produce a correctly-sized window but with a shadow that appears in the wrong position relative to the text (shifted diagonally if the shadow's font is larger).

More critically: after changing font size, `ActualWidth` is stale until a layout pass runs. If position is saved to JSON immediately after changing the font size (e.g., in a `SelectionChanged` handler) without calling `UpdateLayout()` first, the saved `Left` value correctly reflects the current position, but if the code also tries to recompute a right-edge anchor, it will use the stale `ActualWidth`.

**Why it happens:**
WPF layout is deferred. After setting `FontSize` on a `TextBlock`, `ActualWidth` does not update until the next layout pass. This was already discovered in v1.0 for phrase changes (the `UpdateLayout()` call before `PositionTopRight()` was specifically added for this reason). The same applies to font size changes.

**How to avoid:**
When handling font size change:
1. Set `FontSize` on **both** `PhraseText` and `ShadowText`.
2. Call `UpdateLayout()` to force a layout pass.
3. If repositioning is needed, do it after `UpdateLayout()`.
4. Then save the new font size (and optionally the current position) to JSON.

```csharp
private void SetFontSize(double newSize)
{
    PhraseText.FontSize = newSize;
    ShadowText.FontSize = newSize;   // must match — shadow is a mirror
    UpdateLayout();
    // Now ActualWidth is correct for the new font size
    // Save preferences to JSON here
    SavePreferences();
}
```

**Warning signs:**
- Shadow text appears at a slightly different scale than phrase text after font change.
- Saved `ActualWidth` is logged as stale/zero after a font change.
- Right-edge anchor calculation is wrong by the delta in text width.

**Phase to address:** Phase introducing font size selection (v1.1 Phase 2).

---

### Pitfall 5: JSON File Next to Exe Fails When Installed in Program Files

**What goes wrong:**
Using `AppDomain.CurrentDomain.BaseDirectory` or `Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location)` to locate the JSON settings file places it in the same directory as the executable. This works when running from the build output directory or a user-writable location. If the app is ever installed in `C:\Program Files\FuzzyClock\` — even by simply copying the exe there manually — the JSON write fails silently or throws `UnauthorizedAccessException` because `Program Files` is read-only for non-elevated processes.

Even for personal use, this is a fragile pattern: if the exe is in a OneDrive-synced folder or a read-only network share, writes fail.

**Why it happens:**
Windows Vista and later apply UAC virtualization for writes to `Program Files`, but this is unreliable and deprecated for new applications. The correct location for per-user, non-roaming application data is `%LOCALAPPDATA%` (`Environment.SpecialFolder.LocalApplicationData`), which is always writable by the current user.

**How to avoid:**
Use `Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)` as the base directory. This resolves to `C:\Users\<username>\AppData\Local\` on Windows 10/11. Store under a company/app subdirectory:

```csharp
private static string GetSettingsPath()
{
    string appData = Environment.GetFolderPath(
        Environment.SpecialFolder.LocalApplicationData);
    string dir = Path.Combine(appData, "FuzzyClock");
    Directory.CreateDirectory(dir);   // no-op if already exists
    return Path.Combine(dir, "settings.json");
}
```

`Directory.CreateDirectory` is safe to call even if the directory already exists — it does not throw.

**Warning signs:**
- Settings appear to save during testing (exe in project output dir) but are lost after moving the exe.
- `UnauthorizedAccessException` in Event Viewer after installation.
- File write succeeds but subsequent launch cannot find the file (UAC virtualization to VirtualStore).

**Phase to address:** Phase introducing JSON persistence (v1.1 Phase 1 or 2).

---

### Pitfall 6: Closing Event Is Not Raised When Application.Current.Shutdown() Is Called From the Hidden Owner Window

**What goes wrong:**
v1.0 uses a hidden owner window to suppress taskbar/Alt+Tab entries. The close menu item calls `Application.Current.Shutdown()`. The official docs state: "If Shutdown is called, the Closing event for each window is raised. However, if Closing is canceled, cancellation is ignored."

The risk is subtle: `Closing` **is** raised for `MainWindow` when `Shutdown()` is called. But there is an exception documented in the `Closing` event: "If an owned window was opened by its owner window using `Show`, and the owner window is closed, the owned window's `Closing` event is not raised."

If the hidden owner window is closed first (e.g., via `owner.Close()`), `MainWindow.Closing` may not fire. If position is saved in `MainWindow.Closing`, it will not be saved in this path.

Additionally, there is a separate undocumented path: if the user ends the Windows session (log off, shutdown), the official docs warn that `Closing` is **not raised** for session-end. `SessionEnding` on `Application` must be handled separately to save settings on session end.

**Why it happens:**
`Closing` is a `Close()`/user-action event, not a general "app is ending" event. `SessionEnding` is a separate event. Two separate save paths are needed.

**How to avoid:**
Save settings in both `MainWindow.Closing` and `Application.SessionEnding`. Keep the save logic in a single method called from both:

```csharp
// In App.xaml.cs:
private void App_SessionEnding(object sender, SessionEndingCancelEventArgs e)
{
    // Save whatever the main window has
    (MainWindow as MainWindow)?.SavePreferences();
}

// In MainWindow:
protected override void OnClosing(CancelEventArgs e)
{
    SavePreferences();
    base.OnClosing(e);
}
```

**Warning signs:**
- Settings save correctly when the user right-clicks and chooses Close, but are lost after a reboot/log-off.
- `Closing` handler is confirmed to run via debugging, but preferences file is stale after session end.

**Phase to address:** Phase introducing JSON persistence (v1.1 Phase 1 or 2).

---

### Pitfall 7: Window.Left/Top Are NaN Before ContentRendered — Loading Position Too Early

**What goes wrong:**
`Window.Left` and `Window.Top` can be read as `double.NaN` before the window handle is created. If the startup sequence loads the JSON file and sets `this.Left = savedLeft` in the `MainWindow` constructor (before `InitializeComponent()` completes), the assignment is accepted but may be silently overridden by the XAML-defined `WindowStartupLocation="Manual"` processing during the first layout pass.

The safe assignment window is: **after `InitializeComponent()` returns, before `Show()` is called**. Assignment in this window is respected by `WindowStartupLocation="Manual"`.

**Why it happens:**
`WindowStartupLocation="Manual"` tells WPF to use the `Left`/`Top` values at the time the window is shown. If those values are set before `InitializeComponent()`, the XAML parser may reset them to defaults. If set after `Show()`, the window has already been positioned.

**How to avoid:**
Load and apply the saved position in `App.xaml.cs` after constructing `MainWindow` but before calling `mainWindow.Show()`:

```csharp
// In App.xaml.cs OnStartup:
var mainWindow = new MainWindow();
var prefs = LoadPreferences();       // load from JSON
if (prefs.HasSavedPosition)
{
    mainWindow.Left = prefs.Left;
    mainWindow.Top = prefs.Top;
}
mainWindow.SetInitialPhrase(PhraseEngine.GetPhrase(DateTime.Now));
mainWindow.Show();
```

This mirrors the existing pattern for `SetInitialPhrase()` and keeps the startup sequence consistent.

**Warning signs:**
- Saved position is in the JSON file. `Left`/`Top` are set in the constructor. Window still appears at default position.
- `Window.Left` reads as `NaN` immediately after assignment in constructor.

**Phase to address:** Phase introducing position restore on startup (v1.1 Phase 1 or 2).

---

### Pitfall 8: Clamping Saved Position Using PrimaryScreenWidth Breaks Multi-Monitor Setups

**What goes wrong:**
The v1.0 `PositionTopRight()` uses `SystemParameters.PrimaryScreenWidth`. Using `PrimaryScreenWidth` for off-screen clamping at startup validates only the primary monitor's bounds. A user who saved a position on a second monitor will have it clamped to the primary monitor on every launch, because `savedLeft > PrimaryScreenWidth` reads as "out of bounds."

**Why it happens:**
`SystemParameters.PrimaryScreenWidth` returns the width of the primary monitor only. A valid position on a secondary monitor to the right (e.g., `Left = 2000` on a 1920+1080 dual-monitor setup) reads as off-screen against primary-only bounds.

**How to avoid:**
Clamp against the virtual screen bounds, which spans all connected monitors:

```csharp
private static (double left, double top) ClampToVirtualScreen(double left, double top, double width, double height)
{
    double vLeft   = SystemParameters.VirtualScreenLeft;
    double vTop    = SystemParameters.VirtualScreenTop;
    double vWidth  = SystemParameters.VirtualScreenWidth;
    double vHeight = SystemParameters.VirtualScreenHeight;

    // Ensure at least some part of the window is visible
    double clampedLeft = Math.Max(vLeft, Math.Min(left, vLeft + vWidth  - width));
    double clampedTop  = Math.Max(vTop,  Math.Min(top,  vTop  + vHeight - height));
    return (clampedLeft, clampedTop);
}
```

Note: `ActualWidth` and `ActualHeight` must be valid (after layout) before calling this. Call it in `ContentRendered` when restoring a saved position.

`SystemParameters.VirtualScreenWidth` is documented as "the width, in pixels adjusted for DPI, of the virtual screen" — the bounding rectangle of all display monitors. `VirtualScreenLeft` and `VirtualScreenTop` give the top-left origin, which can be negative if a monitor is positioned to the left of the primary.

**Warning signs:**
- Widget saved on secondary monitor always reappears on primary monitor after restart.
- Widget always appears at the left edge of the primary monitor (clamped from negative virtual screen coordinates).

**Phase to address:** Phase introducing position restore (v1.1 Phase 1 or 2).

---

## Moderate Pitfalls

Issues that produce wrong behavior but are straightforward to fix once identified.

---

### Pitfall 9: Right-Click ContextMenu Opens When Trying to Drag, Swallowing MouseLeftButtonDown

**What goes wrong:**
The ContextMenu is attached to the `Grid` in v1.0. In WPF, `ContextMenu` is triggered on `MouseRightButtonUp`. These are independent event routes and should not interfere. However, if the drag handler is incorrectly placed on `MouseDown` (covering both buttons) instead of `MouseLeftButtonDown`, right-clicking to open the context menu triggers the drag handler first, calling `DragMove()` when the right button is down, which throws `InvalidOperationException`.

**How to avoid:**
Always use `MouseLeftButtonDown` (not `MouseDown`) for the drag handler. The `MouseButtonEventArgs.ChangedButton` check is unnecessary if the correct event is used.

**Phase to address:** Phase introducing drag (v1.1 Phase 1).

---

### Pitfall 10: Font Size MenuItem CheckMark Not Updated on Restore

**What goes wrong:**
The right-click context menu has three font size menu items (16pt, 24pt, 32pt). On first launch, none have a checkmark. When the user selects 24pt, the 24pt item gets `IsChecked=true`. On the next launch, the saved font size (24pt) is restored, but if the checkmark is set only in the `Click` handler, the menu items start unchecked — the initial state is wrong.

**How to avoid:**
After restoring font size from JSON on startup, explicitly set `IsChecked` on the correct menu item. The simplest approach: a helper method `UpdateFontSizeChecks(double size)` that sets all three items' `IsChecked` based on the current size. Call it both from the `Click` handler and from the startup restore code.

**Phase to address:** Phase introducing font size UI (v1.1 Phase 2).

---

### Pitfall 11: JSON Deserialization Silently Returns Defaults on Corrupt File

**What goes wrong:**
`System.Text.Json.JsonSerializer.Deserialize<T>()` returns `null` (for reference types) or throws on corrupt JSON. If the file is empty, partially written (crash mid-write), or contains unexpected keys, `Deserialize` may return `null` or a partially-populated object with `Left = 0, Top = 0`. Position 0,0 is the top-left corner of the virtual screen — a valid but wrong position that appears as "the widget jumped to the corner" rather than "settings failed to load."

**How to avoid:**
Wrap deserialization in try/catch. Treat any exception or `null` result as "no saved settings" — fall through to `PositionTopRight()`:

```csharp
private static AppSettings? LoadSettings(string path)
{
    try
    {
        if (!File.Exists(path)) return null;
        string json = File.ReadAllText(path);
        return JsonSerializer.Deserialize<AppSettings>(json);
    }
    catch
    {
        return null;  // corrupt file: use defaults
    }
}
```

Never distinguish "file not found" from "corrupt file" for this use case — both should produce the same fallback behavior.

**Phase to address:** Phase introducing JSON persistence.

---

### Pitfall 12: Atomic JSON Write — Partial Write on Crash Corrupts Settings

**What goes wrong:**
Writing the JSON file with `File.WriteAllText(path, json)` overwrites the previous file in-place. If the process crashes mid-write (power loss, forced kill), the file is left partially written and the next launch reads corrupt JSON (see Pitfall 11).

For a simple 2-field settings file (~40 bytes) the write is atomic at OS level on most configurations, but this is not guaranteed. A safer pattern for any settings file is write-then-rename.

**How to avoid:**
Write to a temp file first, then rename over the target:

```csharp
private static void SaveSettings(string path, AppSettings settings)
{
    string json = JsonSerializer.Serialize(settings, new JsonSerializerOptions { WriteIndented = true });
    string tempPath = path + ".tmp";
    File.WriteAllText(tempPath, json);
    File.Move(tempPath, path, overwrite: true);  // atomic on same volume
}
```

`File.Move` with `overwrite: true` is available in .NET 3.0+ and is effectively atomic on the same NTFS volume.

**Phase to address:** Phase introducing JSON persistence — implement alongside the initial write logic.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Save position only in `Closing` | Simple, one save path | Lost on session end / forced shutdown | Never — also handle `SessionEnding` |
| Use `PrimaryScreenWidth` for off-screen clamp | Works on single-monitor setups | Breaks multi-monitor: valid positions clamped to primary | Never |
| Hardcode JSON path next to exe | Easy to find during development | Fails in Program Files; lost on app reinstall | Development/testing only; use AppData in production |
| Set font size only on `PhraseText`, not `ShadowText` | Fewer lines to write | Shadow renders at different size; window measures incorrectly | Never |
| Skip `UpdateLayout()` after font size change | Slightly fewer method calls | Position calculations use stale `ActualWidth` | Never |
| Call `PositionTopRight()` unconditionally on phrase change | No flag management | Snaps widget to top-right after user has repositioned | Never after drag is added |

---

## Integration Gotchas

How the new v1.1 features interact with existing v1.0 code.

| Integration Point | Common Mistake | Correct Approach |
|-------------------|----------------|------------------|
| `ContentRendered` + position restore | `ContentRendered` calls `PositionTopRight()` unconditionally | Make `PositionTopRight()` conditional on `!_savedPositionLoaded` |
| `UpdatePhraseIfChanged()` + user drag | Always calls `PositionTopRight()` after phrase change | Skip `PositionTopRight()` when `_hasUserPosition` is true |
| Font size change + shadow TextBlock | Only updating `PhraseText.FontSize` | Always update both `PhraseText.FontSize` and `ShadowText.FontSize` together |
| Font size change + `UpdateLayout()` | Saving/repositioning before layout runs | Call `UpdateLayout()` first, then save/reposition |
| `DragMove()` + `LocationChanged` | Not knowing when drag ends (DragMove blocks) | `LocationChanged` fires after each position update during drag; set `_hasUserPosition = true` here |
| `Closing` + `Application.Current.Shutdown()` | Only handling `Closing` for save | Also handle `Application.SessionEnding` for power-off/log-off |
| Virtual screen clamping + `ActualWidth` | Using 0 or stale `ActualWidth` in clamp math | Clamp in `ContentRendered` after `UpdateLayout()` when `ActualWidth` is valid |

---

## "Looks Done But Isn't" Checklist

- [ ] **Drag:** `DragMove()` is wired on the `Grid`, not a child element. Handler uses `MouseLeftButtonDown`, not `MouseDown`.
- [ ] **Drag flag:** `_hasUserPosition` or equivalent is set via `LocationChanged`. `PositionTopRight()` is guarded by this flag.
- [ ] **Position restore:** Saved `Left`/`Top` applied in `App.xaml.cs` after `new MainWindow()` but before `Show()`.
- [ ] **ContentRendered guard:** `PositionTopRight()` inside `ContentRendered` is conditional on no saved position.
- [ ] **Virtual screen clamp:** Off-screen detection uses `VirtualScreenLeft/Top/Width/Height`, not `PrimaryScreenWidth/Height`.
- [ ] **Font size — both TextBlocks:** Font size change sets `FontSize` on `ShadowText` AND `PhraseText`.
- [ ] **Font size — UpdateLayout:** `UpdateLayout()` is called after font size change before any size-dependent calculations.
- [ ] **Font size — menu checkmarks:** `IsChecked` on all three font size items is set correctly on startup from restored value.
- [ ] **JSON path:** Settings file is in `%LOCALAPPDATA%\FuzzyClock\`, not next to the exe.
- [ ] **JSON write safety:** Write uses temp-file + rename pattern.
- [ ] **JSON read safety:** `Deserialize` is wrapped in try/catch; `null` result falls back to defaults.
- [ ] **Session end:** `Application.SessionEnding` handler saves settings (not only `Closing`).

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| DragMove() called on wrong element | LOW | Move handler to outer Grid; rebuild |
| `PositionTopRight()` overwrites user position | LOW | Add `_hasUserPosition` flag and guard; rebuild |
| `ContentRendered` ignores saved position | LOW | Add `_savedPositionLoaded` guard; rebuild |
| Font size not applied to ShadowText | LOW | Add `ShadowText.FontSize = newSize`; rebuild |
| JSON saved next to exe (need to move) | LOW | Delete old file location; update path to AppData; rebuild |
| Corrupt settings file in AppData | LOW | Delete the file; app falls back to defaults on next launch |
| Multi-monitor positions clamped to primary | LOW | Replace `PrimaryScreenWidth` with `VirtualScreen*` parameters |
| Session-end settings loss | LOW | Add `SessionEnding` handler; rebuild |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| DragMove() on wrong element / throws | v1.1 Phase introducing drag | Manual test: drag by clicking on all areas of the widget including shadow edge |
| DragMove() blocks; phrase change snaps position | v1.1 Phase introducing drag | Let widget run through a 5-minute boundary while dragged to a non-default position; verify it stays |
| ContentRendered overwrites saved position | v1.1 Phase introducing persistence | Launch after saving a position; verify widget appears where saved |
| SizeToContent + font change + UpdateLayout | v1.1 Phase introducing font size | Change font size; verify shadow aligns with text; verify ActualWidth is correct afterward |
| JSON path next to exe | v1.1 Phase introducing persistence | Verify settings file path is in %LOCALAPPDATA%; test by moving exe to a different directory |
| Session-end save gap | v1.1 Phase introducing persistence | Save a position; log off without closing the app; re-login and verify position is preserved |
| Multi-monitor clamp | v1.1 Phase introducing persistence | Save a position on a non-primary monitor; restart; verify widget restores to that monitor |
| Window.Left NaN before Show() | v1.1 Phase introducing persistence | Set saved position in App.xaml.cs before Show(); verify correct position on first frame |
| Checkmarks on font menu not set at startup | v1.1 Phase introducing font size UI | Save 24pt; restart; right-click; verify 24pt item is checked and others are not |

---

## Sources

| Source | URL | Confidence |
|--------|-----|------------|
| Window.DragMove — throws InvalidOperationException if left button not down | https://learn.microsoft.com/en-us/dotnet/api/system.windows.window.dragmove | HIGH |
| Window.LocationChanged — fires after DragMove | https://learn.microsoft.com/en-us/dotnet/api/system.windows.window.locationchanged | HIGH |
| Window.Left — property value in logical units (1/96th inch); NaN = system default | https://learn.microsoft.com/en-us/dotnet/api/system.windows.window.left | HIGH |
| Window.SizeToContent — WidthAndHeight; SizeChanged fired when content resizes | https://learn.microsoft.com/en-us/dotnet/api/system.windows.window.sizetocontent | HIGH |
| Window.Closing — not raised on session end; owned window Closing not raised if owner closes | https://learn.microsoft.com/en-us/dotnet/api/system.windows.window.closing | HIGH |
| SystemParameters.VirtualScreenWidth — bounding rect of all monitors, DPI-adjusted | https://learn.microsoft.com/en-us/dotnet/api/system.windows.systemparameters.virtualscreenwidth | HIGH |
| Environment.SpecialFolder.LocalApplicationData — per-user non-roaming app data, always writable | https://learn.microsoft.com/en-us/dotnet/api/system.environment.specialfolder | HIGH |
| File path formats — relative paths dangerous in multithreaded apps; exe-adjacent writes fail in Program Files | https://learn.microsoft.com/en-us/dotnet/standard/io/file-path-formats | HIGH |

---

*Pitfalls research for: WPF transparent overlay — v1.1 drag, position persistence, font size*
*Researched: 2026-02-25*
