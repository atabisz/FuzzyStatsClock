# Phase 4: Settings Infrastructure + Drag + Position Persistence - Research

**Researched:** 2026-02-25
**Domain:** WPF transparent frameless widget — drag, JSON position persistence, off-screen clamping
**Confidence:** HIGH

---

## Summary

Phase 4 adds drag-to-reposition and position persistence to the existing transparent WPF overlay. The entire feature set is built from APIs already in the .NET 10 SDK — `Window.DragMove()`, `System.Text.Json`, `Environment.SpecialFolder.LocalApplicationData`, and `SystemParameters.VirtualScreen*`. Zero new NuGet packages are required, preserving the v1.0 zero-dependency principle. The implementation surface is small: two new files (`AppSettings.cs`, `SettingsService.cs`) and targeted changes to three existing files (`App.xaml.cs`, `MainWindow.xaml.cs`, `MainWindow.xaml`).

The primary risk is not in the new code itself — it is in interactions with existing v1.0 code that was written without awareness of user-controlled positioning. The `UpdatePhraseIfChanged()` method (line 42–54 of `MainWindow.xaml.cs`) unconditionally calls `PositionTopRight()` after every phrase change. This will silently snap the widget back to the top-right corner at every 5-minute boundary crossing after the user has dragged it elsewhere. The `ContentRendered` handler (line 22–28) has the same problem: it calls `PositionTopRight()` unconditionally, overwriting the loaded saved position on every launch. Both require explicit guards before any new code can work correctly.

The recommended implementation order is: (1) `AppSettings` record + `SettingsService` with JSON I/O and screen clamping, (2) wire `SettingsService.Load()` into `App.xaml.cs` and add `ApplySettings()` to `MainWindow` with the `ContentRendered` guard, (3) add the drag handler with `DragMove()` + `SaveSettings()` and the `_hasUserPosition` guard in `UpdatePhraseIfChanged()`, (4) validate off-screen clamping with extreme JSON values. Each step is independently verifiable before the next begins.

**Primary recommendation:** Address the two `PositionTopRight()` guards (`_hasUserPosition` in `UpdatePhraseIfChanged()` and `_savedPositionLoaded` in `ContentRendered`) as part of the same task that adds `ApplySettings()`. These guards are prerequisites for any position persistence to work correctly — they must not be left for a later plan wave.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| WIN-04 | User can drag the widget to any position on the desktop | `Window.DragMove()` in `MouseLeftButtonDown` on the Grid — OS-native blocking call; returns on mouse-up at final position. One handler, three lines. |
| WIN-05 | Widget position is restored on startup; if saved position is off-screen, it is clamped to visible area | `SettingsService.Load()` before `mainWindow.Show()` in `App.xaml.cs`; `AppSettings` with `Left=-1` sentinel for first-run; `VirtualScreen*` clamp covers all connected monitors. |
</phase_requirements>

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `System.Windows.Window.DragMove()` | .NET 10 (in-box) | OS-native window drag — blocking call, no delta tracking | One call; OS handles movement natively; compatible with `AllowsTransparency=True` |
| `System.Text.Json` | .NET 10 (in-box) | Serialize/deserialize `AppSettings` record to JSON | In-box since .NET Core 3.0; no NuGet cost; handles plain C# records cleanly |
| `System.IO.File` + `Directory` | .NET 10 (in-box) | Read/write settings file; atomic write via temp+rename | BCL; `File.Move` with `overwrite:true` is atomic on same NTFS volume |
| `SystemParameters.VirtualScreen*` | .NET 10 (in-box) | Off-screen clamping against all connected monitor bounds | Spans all monitors; handles multi-monitor setups; already in `PresentationFramework.dll` |
| `Environment.SpecialFolder.LocalApplicationData` | .NET 10 (in-box) | Resolve `%LOCALAPPDATA%\FuzzyClock\settings.json` | Always user-writable; correct for non-roaming per-user data; safe under Program Files |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `Window.LocationChanged` event | .NET 10 (in-box) | Detect that user has repositioned the window | Used to set `_hasUserPosition = true` after drag completes; fires after `DragMove()` returns |
| `Application.SessionEnding` event | .NET 10 (in-box) | Save settings when Windows session ends | `Window.Closing` is not raised on log-off/shutdown; must handle separately |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `DragMove()` | `MouseMove` + manual delta + `Left`/`Top` updates | MouseMove requires ~20 lines of state (flag, start point, capture, release); produces stutter at high DPI; functionally equivalent for unconstrained drag |
| `System.Text.Json` | Newtonsoft.Json | Newtonsoft works; adds NuGet dependency for zero added value at this scale |
| `LocalApplicationData` path | Exe-adjacent path | Exe-adjacent fails silently under Program Files (UAC); breaks on read-only shares |
| `VirtualScreen*` clamp | `PrimaryScreenWidth` clamp | Primary-screen clamp incorrectly flags valid secondary-monitor positions as off-screen |

**Installation:** No `dotnet add package` needed. All APIs are in-box with `UseWPF=true` on .NET 10.

---

## Architecture Patterns

### Recommended Project Structure

```
FuzzyClock.App/
├── App.xaml
├── App.xaml.cs               # Modified: Load settings before Show(); SessionEnding handler
├── MainWindow.xaml           # Modified: MouseLeftButtonDown on Grid
├── MainWindow.xaml.cs        # Modified: ApplySettings, drag handler, SaveSettings, guards
├── AppSettings.cs            # NEW: plain record (Left, Top, FontSize)
└── SettingsService.cs        # NEW: JSON load/save, file path, VirtualScreen clamp, defaults
```

No new projects, no new NuGet packages. `FuzzyClock.Core` and its tests are untouched.

### Pattern 1: AppSettings Record — Data Contract

**What:** A plain C# record with three properties. No WPF dependencies. Serializes cleanly with `System.Text.Json` without attributes.

**`Left = -1` sentinel:** `double` allows any coordinate. `-1` is used as the sentinel meaning "no saved position — use `PositionTopRight()` fallback." This avoids a separate `bool HasSavedPosition` field and flows naturally through `ApplySettings()` and `ContentRendered`.

**Example:**
```csharp
// Source: official .NET 10 docs — System.Text.Json handles positional records
// File: FuzzyClock.App/AppSettings.cs
public record AppSettings(double Left, double Top, int FontSize);
```

### Pattern 2: SettingsService — Static Class, No DI

**What:** Static class owns the file path, `Load()`, `Save()`, `Clamp()`, and `Defaults()`. MainWindow and App.xaml.cs never touch file paths or JSON directly.

**Why static:** The app has one window and one settings file. DI adds overhead for zero benefit at this scale.

**Atomic write:** Write to a `.tmp` file, then `File.Move` with `overwrite:true`. Atomic on the same NTFS volume. Prevents corrupt settings on crash mid-write.

**Example:**
```csharp
// Source: official .NET docs — Environment.SpecialFolder, System.Text.Json, File.Move
// File: FuzzyClock.App/SettingsService.cs
public static class SettingsService
{
    private static readonly string FilePath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "FuzzyClock", "settings.json");

    public static AppSettings Load()
    {
        try
        {
            if (!File.Exists(FilePath)) return Defaults();
            var json = File.ReadAllText(FilePath);
            return JsonSerializer.Deserialize<AppSettings>(json) ?? Defaults();
        }
        catch { return Defaults(); }
    }

    public static void Save(AppSettings s)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(FilePath)!);
        string tempPath = FilePath + ".tmp";
        File.WriteAllText(tempPath, JsonSerializer.Serialize(s));
        File.Move(tempPath, FilePath, overwrite: true);
    }

    public static AppSettings Defaults() => new(-1, 20, 32);

    public static AppSettings Clamp(AppSettings s, double windowWidth, double windowHeight)
    {
        const double MinVisible = 50;
        double screenW = SystemParameters.VirtualScreenWidth;
        double screenH = SystemParameters.VirtualScreenHeight;
        double vLeft   = SystemParameters.VirtualScreenLeft;
        double vTop    = SystemParameters.VirtualScreenTop;
        double left = Math.Clamp(s.Left, vLeft - windowWidth + MinVisible, vLeft + screenW - MinVisible);
        double top  = Math.Clamp(s.Top,  vTop  - windowHeight + MinVisible, vTop  + screenH - MinVisible);
        return s with { Left = left, Top = top };
    }
}
```

### Pattern 3: App.xaml.cs — Load Before Show(), SessionEnding Backup

**What:** `SettingsService.Load()` is called after `new MainWindow()` but before `mainWindow.Show()`. This is the only safe assignment window for `WindowStartupLocation="Manual"`. A `SessionEnding` handler is added as a backup save path for log-off/shutdown.

**Critical constraint:** Setting `Left`/`Top` before `InitializeComponent()` completes can be silently overridden by the XAML parser. Setting after `Show()` is too late. The window between `new MainWindow()` and `Show()` is the correct placement.

**Example:**
```csharp
// Source: official WPF docs — WindowStartupLocation.Manual, Application.SessionEnding
// File: FuzzyClock.App/App.xaml.cs (OnStartup additions)
var settings = SettingsService.Load();

var mainWindow = new MainWindow();
mainWindow.Owner = hiddenOwner;
mainWindow.ApplySettings(settings);          // sets font size, position fields, flag
mainWindow.SetInitialPhrase(PhraseEngine.GetPhrase(DateTime.Now));
mainWindow.Show();

// Session-end backup save (Closing is not raised on log-off/shutdown)
SessionEnding += (_, _) => (MainWindow as MainWindow)?.SaveSettings();
```

### Pattern 4: DragMove() in MouseLeftButtonDown on the Grid

**What:** A single `MouseLeftButtonDown` handler on the outermost Grid calls `this.DragMove()` synchronously. `DragMove()` is a blocking call — it enters a Win32 modal loop and returns only when the mouse button is released. `Window.Left` and `Window.Top` reflect the final dropped position immediately after return.

**Why on the Grid:** The Grid has `Background="#01000000"` (hit-testable). The child TextBlocks are the drag surface, but `ShadowText` has `IsHitTestVisible="False"`. Wiring on the Grid catches all hit-testable pixels. Wiring on child elements misses shadow-offset pixels.

**Example:**
```csharp
// Source: official WPF docs — Window.DragMove (updated 2026-02-11)
// MainWindow.xaml: add MouseLeftButtonDown="Grid_MouseLeftButtonDown" to the outer Grid

private bool _hasUserPosition = false;

// In constructor, after InitializeComponent():
this.LocationChanged += (_, _) => _hasUserPosition = true;

private void Grid_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
{
    DragMove();
    // Left and Top now reflect the final dropped position
    SaveSettings();
}
```

```xml
<!-- MainWindow.xaml: add attribute to the outer Grid -->
<Grid Background="#01000000"
      MouseLeftButtonDown="Grid_MouseLeftButtonDown">
```

### Pattern 5: ApplySettings() + Two Guards in MainWindow

**What:** `ApplySettings(AppSettings s)` is called from `App.xaml.cs` before `Show()`. It sets font size on both TextBlocks and — if `Left != -1` — stores the position fields and sets `_savedPositionLoaded = true`. Two guards in existing methods prevent `PositionTopRight()` from overwriting the user's position.

**Guard 1 — ContentRendered:** Only call `PositionTopRight()` when `!_savedPositionLoaded`. When a saved position exists, the position was already applied in `ApplySettings()`; `ContentRendered` must not undo it. The clamp call (`SettingsService.Clamp()`) runs in `ContentRendered` because `ActualWidth`/`ActualHeight` are not valid until after the first layout pass.

**Guard 2 — UpdatePhraseIfChanged():** Only call `PositionTopRight()` when `!_hasUserPosition`. After the user drags (or after a saved position is loaded), `PositionTopRight()` must never be called again automatically.

**Example:**
```csharp
private bool _savedPositionLoaded = false;
private bool _hasUserPosition = false;

internal void ApplySettings(AppSettings s)
{
    PhraseText.FontSize = s.FontSize;
    ShadowText.FontSize = s.FontSize;

    if (s.Left != -1)
    {
        Left = s.Left;
        Top  = s.Top;
        _savedPositionLoaded = true;
        _hasUserPosition = true;
    }
}

// ContentRendered handler (replaces unconditional PositionTopRight()):
ContentRendered += (_, _) =>
{
    if (_savedPositionLoaded)
    {
        // Clamp after layout so ActualWidth/ActualHeight are valid
        var clamped = SettingsService.Clamp(
            new AppSettings(Left, Top, _currentFontSize),
            ActualWidth, ActualHeight);
        Left = clamped.Left;
        Top  = clamped.Top;
    }
    else
    {
        PositionTopRight();
    }
    _timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(10) };
    _timer.Tick += (_, _) => UpdatePhraseIfChanged();
    _timer.Start();
};

// UpdatePhraseIfChanged() (existing method — add guard):
private void UpdatePhraseIfChanged()
{
    string newPhrase = PhraseEngine.GetPhrase(DateTime.Now);
    if (newPhrase == PhraseText.Text) return;

    ShadowText.Text = newPhrase;
    PhraseText.Text = newPhrase;

    UpdateLayout();
    if (!_hasUserPosition)
        PositionTopRight();
}
```

### Data Flow Summary

```
App.OnStartup()
  +-- SettingsService.Load() -> AppSettings
  +-- new MainWindow()
  +-- mainWindow.ApplySettings(settings)
  |     +-- set FontSize on both TextBlocks
  |     +-- if Left != -1: set Left/Top, _savedPositionLoaded = true, _hasUserPosition = true
  +-- mainWindow.SetInitialPhrase(...)
  +-- mainWindow.Show()
        |
        ContentRendered fires:
          +-- if _savedPositionLoaded: Clamp and apply clamped position
          +-- else: PositionTopRight()
          +-- start DispatcherTimer

User drags:
  Grid.MouseLeftButtonDown -> DragMove() [blocks until mouse-up]
    -> Left/Top = final position
    -> SaveSettings()
    -> LocationChanged fires -> _hasUserPosition = true

DispatcherTimer tick (every 10s):
  UpdatePhraseIfChanged()
    -> if phrase changed: update text, UpdateLayout()
    -> if !_hasUserPosition: PositionTopRight()   [skipped after drag]

Session end / Close:
  SessionEnding / OnClosing -> SaveSettings()
```

### Anti-Patterns to Avoid

- **Saving position only in `Window.Closing`:** `Closing` is not raised on Windows log-off or forced shutdown. Always also handle `Application.SessionEnding`.
- **MouseMove + manual delta for drag:** 20+ lines of state; stutter at high DPI; functionally identical to one `DragMove()` call for unconstrained drag.
- **File I/O directly in MainWindow or App.xaml.cs:** Couples UI lifecycle to I/O; untestable without a WPF window. Keep all persistence in `SettingsService`.
- **Calling `PositionTopRight()` unconditionally in `ContentRendered`:** Overwrites the loaded saved position on every launch. Must be guarded by `_savedPositionLoaded`.
- **Calling `PositionTopRight()` unconditionally in `UpdatePhraseIfChanged()`:** Snaps the widget back to top-right at every 5-minute boundary after the user has repositioned it. Must be guarded by `_hasUserPosition`.
- **Clamping against `PrimaryScreenWidth`:** Incorrectly flags valid secondary-monitor positions as off-screen. Always use `VirtualScreen*` for multi-monitor setups.
- **`LocationChanged` handler for save during drag:** Fires on every pixel of movement — hundreds of file writes per drag. Save once after `DragMove()` returns instead.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Drag-to-reposition | MouseMove delta tracking, capture/release state machine | `Window.DragMove()` | OS-native; one call; zero state; smooth movement at any DPI |
| JSON serialization | Manual string building / regex parsing | `System.Text.Json.JsonSerializer` | In-box; handles record types; handles edge cases (whitespace, encoding, escaping) |
| Off-screen clamping formula | Custom monitor enumeration | `SystemParameters.VirtualScreen*` | Covers all connected monitors; DPI-adjusted; always available in WPF |
| Settings file path | Hardcoded path or exe-adjacent | `Environment.SpecialFolder.LocalApplicationData` | Always writable; correct UAC behavior; survives reinstall |
| Atomic file write | Custom lock + write + verify | `File.Move` with `overwrite:true` | Atomic on same NTFS volume; in-box since .NET 3.0 |

**Key insight:** Every problem in this phase has a one-call WPF/BCL solution. The complexity lives in the sequencing of existing v1.0 code, not in building new infrastructure.

---

## Common Pitfalls

### Pitfall 1: `UpdatePhraseIfChanged()` Snaps Widget to Top-Right at 5-Minute Boundaries

**What goes wrong:** Line 53 of `MainWindow.xaml.cs` calls `PositionTopRight()` unconditionally after every phrase change. After the user drags the widget to, say, the center of the screen, the next 5-minute boundary crossing fires `UpdatePhraseIfChanged()`, which snaps the widget back to the top-right corner. This also corrupts the saved position — `SaveSettings()` after drag wrote the center position, but now `Window.Left`/`Top` are the top-right values.

**Why it happens:** `UpdatePhraseIfChanged()` was written for v1.0 where there was no user-controlled position. In v1.1 this is a logic error.

**How to avoid:** Add `bool _hasUserPosition = false`. Set it to `true` in a `LocationChanged` handler (`this.LocationChanged += (_, _) => _hasUserPosition = true;`). Guard the `PositionTopRight()` call: `if (!_hasUserPosition) PositionTopRight();`. This guard must be in place before the drag handler is wired.

**Warning signs:** Drag works, position saves to JSON, but widget snaps to top-right exactly at clock tick boundaries. Position in JSON is correct; position on screen is wrong after 5 minutes.

### Pitfall 2: `ContentRendered` Overwrites the Loaded Saved Position on Every Launch

**What goes wrong:** The sequence is: load JSON → set `Left=400, Top=300` → `Show()` → `ContentRendered` fires → `PositionTopRight()` sets `Left=1880, Top=20`. Widget always appears at top-right even though JSON file contains the correct saved position.

**Why it happens:** `ContentRendered` unconditionally calls `PositionTopRight()` in v1.0. With persistence added, this must become conditional.

**How to avoid:** Add `bool _savedPositionLoaded = false`. Set it to `true` inside `ApplySettings()` when a valid saved position exists. In `ContentRendered`, check `if (!_savedPositionLoaded) PositionTopRight();`.

**Warning signs:** JSON file contains correct Left/Top values. Widget always appears at top-right. The save works; the restore is silently overridden.

### Pitfall 3: Position Set in Constructor Is Overridden by `InitializeComponent()`

**What goes wrong:** Setting `this.Left = savedLeft` inside the `MainWindow()` constructor before or during `InitializeComponent()` can be silently reset. The XAML parser processes `WindowStartupLocation="Manual"` and may reinitialize coordinate properties.

**How to avoid:** Apply the saved position in `App.xaml.cs` after `new MainWindow()` returns but before `mainWindow.Show()` is called. This is the documented safe window for `WindowStartupLocation="Manual"`.

**Warning signs:** `Left`/`Top` are set in the constructor, logged as correct values, but window appears at the default (0,0 or system default) position on first frame.

### Pitfall 4: `DragMove()` Throws `InvalidOperationException` If Not Called Synchronously

**What goes wrong:** `DragMove()` checks that the left mouse button is down at the Win32 level at the exact moment of the call. If the call is deferred (`Dispatcher.BeginInvoke`, `await`, or wired to the wrong event), the button may already be released and the call throws.

**How to avoid:** Wire `MouseLeftButtonDown` on the outermost Grid. Call `DragMove()` synchronously inside the handler — no deferred dispatch.

**Warning signs:** `InvalidOperationException: The left mouse button is not down` in the output window during drag attempts.

### Pitfall 5: `Window.Closing` Not Raised on Windows Session End

**What goes wrong:** Position saved only in `Window.Closing` is lost when the user logs off or shuts down Windows — the session terminates without raising `Closing`.

**How to avoid:** Also handle `Application.SessionEnding`. Both `Closing` and `SessionEnding` should call the same `SaveSettings()` method.

**Warning signs:** Settings persist correctly when the user right-clicks Close, but are lost after a reboot or log-off without first closing the app.

### Pitfall 6: Off-Screen Clamp Against `PrimaryScreenWidth` Breaks Secondary Monitors

**What goes wrong:** A saved position on a secondary monitor (e.g., `Left=2000` on a 1920+1920 dual-monitor setup) is clamped to the primary monitor on every restart because `Left > PrimaryScreenWidth` reads as "off-screen."

**How to avoid:** Use `SystemParameters.VirtualScreenLeft/Top/Width/Height` for clamping. These span all connected monitors. `VirtualScreenLeft` can be negative if a monitor is positioned to the left of the primary.

**Warning signs:** Widget saved on a non-primary monitor always reappears on the primary monitor after restart.

### Pitfall 7: Clamp Called Before `ActualWidth`/`ActualHeight` Are Valid

**What goes wrong:** `ActualWidth` and `ActualHeight` are 0 until the first layout pass runs. If `SettingsService.Clamp()` is called in `ApplySettings()` (before `Show()`), the clamped boundaries are computed with 0 window dimensions and produce wrong results.

**How to avoid:** Call `Clamp()` in `ContentRendered`, after `UpdateLayout()` has run and `ActualWidth`/`ActualHeight` are valid. `ApplySettings()` sets the raw loaded position; `ContentRendered` adjusts it to be within screen bounds.

**Warning signs:** Widget appears slightly outside the screen edge after restore even though clamping code exists.

---

## Code Examples

### AppSettings.cs (complete new file)

```csharp
// Source: official .NET 10 docs — System.Text.Json positional records
namespace FuzzyClock.App;

public record AppSettings(double Left, double Top, int FontSize);
// Left = -1 is the sentinel for "no saved position — use PositionTopRight() fallback"
```

### SettingsService.cs (complete new file)

```csharp
// Sources:
//   Environment.SpecialFolder: https://learn.microsoft.com/en-us/dotnet/api/system.environment.specialfolder
//   System.Text.Json: https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/overview
//   SystemParameters.VirtualScreen*: https://learn.microsoft.com/en-us/dotnet/api/system.windows.systemparameters.virtualscreenwidth
//   File.Move overwrite: .NET 3.0+ BCL
using System.IO;
using System.Text.Json;
using System.Windows;

namespace FuzzyClock.App;

public static class SettingsService
{
    private static readonly string FilePath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "FuzzyClock", "settings.json");

    public static AppSettings Load()
    {
        try
        {
            if (!File.Exists(FilePath)) return Defaults();
            var json = File.ReadAllText(FilePath);
            return JsonSerializer.Deserialize<AppSettings>(json) ?? Defaults();
        }
        catch { return Defaults(); }
    }

    public static void Save(AppSettings s)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(FilePath)!);
        string tempPath = FilePath + ".tmp";
        File.WriteAllText(tempPath, JsonSerializer.Serialize(s));
        File.Move(tempPath, FilePath, overwrite: true);
    }

    // Left = -1: sentinel for "no saved position"
    public static AppSettings Defaults() => new(-1, 20, 32);

    /// <summary>
    /// Clamp Left/Top so at least MinVisible px of the window is within the virtual screen bounds.
    /// Must be called after ActualWidth/ActualHeight are valid (ContentRendered or later).
    /// </summary>
    public static AppSettings Clamp(AppSettings s, double windowWidth, double windowHeight)
    {
        const double MinVisible = 50;
        double vLeft   = SystemParameters.VirtualScreenLeft;
        double vTop    = SystemParameters.VirtualScreenTop;
        double vWidth  = SystemParameters.VirtualScreenWidth;
        double vHeight = SystemParameters.VirtualScreenHeight;
        double left = Math.Clamp(s.Left, vLeft - windowWidth + MinVisible, vLeft + vWidth  - MinVisible);
        double top  = Math.Clamp(s.Top,  vTop  - windowHeight + MinVisible, vTop  + vHeight - MinVisible);
        return s with { Left = left, Top = top };
    }
}
```

### App.xaml.cs — OnStartup diff (key additions)

```csharp
// After hiddenOwner.Show() and before mainWindow.Show():
var settings = SettingsService.Load();

var mainWindow = new MainWindow();
mainWindow.Owner = hiddenOwner;
mainWindow.ApplySettings(settings);                            // NEW — before Show()
mainWindow.SetInitialPhrase(PhraseEngine.GetPhrase(DateTime.Now));
mainWindow.Show();

// Session-end backup save (add after mainWindow.Show()):
SessionEnding += (_, _) => (MainWindow as MainWindow)?.SaveSettings();
```

### MainWindow.xaml.cs — complete modified file

```csharp
using System.Windows;
using System.Windows.Input;
using System.Windows.Threading;
using FuzzyClock.Core;

namespace FuzzyClock.App;

public partial class MainWindow : Window
{
    private DispatcherTimer _timer = null!;
    private int _currentFontSize = 32;
    private bool _savedPositionLoaded = false;
    private bool _hasUserPosition = false;

    public MainWindow()
    {
        InitializeComponent();

        // Set _hasUserPosition flag after any window move (covers drag completion)
        this.LocationChanged += (_, _) => _hasUserPosition = true;

        ContentRendered += (_, _) =>
        {
            if (_savedPositionLoaded)
            {
                // Clamp here — ActualWidth/ActualHeight are valid after first layout pass
                var clamped = SettingsService.Clamp(
                    new AppSettings(Left, Top, _currentFontSize),
                    ActualWidth, ActualHeight);
                Left = clamped.Left;
                Top  = clamped.Top;
            }
            else
            {
                PositionTopRight();
            }

            _timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(10) };
            _timer.Tick += (_, _) => UpdatePhraseIfChanged();
            _timer.Start();
        };
    }

    internal void ApplySettings(AppSettings s)
    {
        _currentFontSize = s.FontSize;
        PhraseText.FontSize = s.FontSize;
        ShadowText.FontSize = s.FontSize;

        if (s.Left != -1)
        {
            Left = s.Left;
            Top  = s.Top;
            _savedPositionLoaded = true;
            _hasUserPosition = true;
        }
    }

    internal void SaveSettings()
    {
        SettingsService.Save(new AppSettings(Left, Top, _currentFontSize));
    }

    internal void SetInitialPhrase(string phrase)
    {
        ShadowText.Text = phrase;
        PhraseText.Text = phrase;
    }

    private void Grid_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        DragMove();
        // Left and Top now reflect the final dropped position
        SaveSettings();
    }

    private void UpdatePhraseIfChanged()
    {
        string newPhrase = PhraseEngine.GetPhrase(DateTime.Now);
        if (newPhrase == PhraseText.Text) return;

        ShadowText.Text = newPhrase;
        PhraseText.Text = newPhrase;

        UpdateLayout();
        if (!_hasUserPosition)
            PositionTopRight();
    }

    private void PositionTopRight()
    {
        const double Padding = 20.0;
        Left = SystemParameters.PrimaryScreenWidth - ActualWidth - Padding;
        Top = Padding;
    }

    private void CloseMenuItem_Click(object sender, RoutedEventArgs e)
    {
        Application.Current.Shutdown();
    }

    protected override void OnClosing(System.ComponentModel.CancelEventArgs e)
    {
        SaveSettings();
        base.OnClosing(e);
    }
}
```

### MainWindow.xaml — Grid diff (add MouseLeftButtonDown)

```xml
<!-- Add MouseLeftButtonDown to the outer Grid: -->
<Grid Background="#01000000"
      MouseLeftButtonDown="Grid_MouseLeftButtonDown">
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `MouseMove` + manual delta for window drag | `Window.DragMove()` (blocking OS-native call) | WPF since .NET Framework 3.0 | Eliminates ~20 lines of state management; eliminates stutter |
| `IsolatedStorage` for settings | `%LOCALAPPDATA%` via `Environment.SpecialFolder` | Best practice for years | Always writable; survives app moves; not virtualized |
| `JsonConvert` (Newtonsoft) | `System.Text.Json` (in-box) | .NET Core 3.0 (2019) | Zero NuGet cost for simple serialization needs |
| `PrimaryScreenWidth` for single-monitor clamp | `VirtualScreen*` for multi-monitor clamp | Available since .NET Framework 3.0 | Correct behavior on multi-monitor setups |

**Deprecated/outdated:**
- `IsolatedStorage`: Works but is more complex than `LocalApplicationData` + `Path.Combine`; no advantage for simple file-based settings.
- `MouseMove` drag: Still works; no reason to use it when `DragMove()` exists.

---

## Open Questions

1. **Session-end save timing — difficult to test in development**
   - What we know: `Application.SessionEnding` is the documented event for log-off/shutdown; the pattern is architecturally correct.
   - What's unclear: The exact timing relative to process termination; whether the save completes before Windows kills the process.
   - Recommendation: Implement the handler and flag for manual verification during a real log-off cycle. The `File.Move` atomic write reduces risk of partial save.

2. **Multi-monitor behavior after monitor disconnect**
   - What we know: Virtual screen clamp correctly handles out-of-bounds positions. If a monitor is disconnected, a position saved on it will be clamped to the remaining virtual screen area.
   - What's unclear: Whether `VirtualScreen*` parameters update before `ContentRendered` fires on the next launch, or whether a brief off-screen flash is possible.
   - Recommendation: The clamp runs in `ContentRendered`, which fires after the window system is fully initialized. This should be safe. Validate with a real two-monitor setup if available.

3. **`LocationChanged` fires during `ApplySettings()` position assignment**
   - What we know: Setting `Left`/`Top` in `ApplySettings()` may fire `LocationChanged`, which sets `_hasUserPosition = true`. This is actually correct behavior — if a position has been loaded, it is a user position and `PositionTopRight()` should never override it.
   - What's unclear: Whether `LocationChanged` fires reliably when `Left`/`Top` are set before `Show()` (i.e., before the window handle exists).
   - Recommendation: The `_savedPositionLoaded` flag set in `ApplySettings()` is the primary guard for `ContentRendered`. The `_hasUserPosition` flag from `LocationChanged` guards `UpdatePhraseIfChanged()`. Even if `LocationChanged` does not fire before `Show()`, `ApplySettings()` can set `_hasUserPosition = true` directly alongside `_savedPositionLoaded = true`. Both flags are set in the same `if (s.Left != -1)` branch — this is the safest and simplest approach.

---

## Sources

### Primary (HIGH confidence)

- `Window.DragMove` official docs (windowsdesktop-10.0, updated 2026-02-11): https://learn.microsoft.com/en-us/dotnet/api/system.windows.window.dragmove
- `Window.LocationChanged` official docs (windowsdesktop-10.0): https://learn.microsoft.com/en-us/dotnet/api/system.windows.window.locationchanged
- `Window.Left` — NaN before window handle created; `WindowStartupLocation.Manual` docs: https://learn.microsoft.com/en-us/dotnet/api/system.windows.window.left
- `Window.Closing` — not raised on session end; owned-window closing notes: https://learn.microsoft.com/en-us/dotnet/api/system.windows.window.closing
- `Application.SessionEnding`: https://learn.microsoft.com/en-us/dotnet/api/system.windows.application.sessionending
- `SystemParameters.VirtualScreenWidth/Height/Left/Top` (windowsdesktop-10.0): https://learn.microsoft.com/en-us/dotnet/api/system.windows.systemparameters.virtualscreenwidth
- `Environment.SpecialFolder.LocalApplicationData` — per-user non-roaming, always writable: https://learn.microsoft.com/en-us/dotnet/api/system.environment.specialfolder
- `System.Text.Json` overview: https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/overview
- `File.Move` with `overwrite` parameter (.NET 3.0+): https://learn.microsoft.com/en-us/dotnet/api/system.io.file.move
- Existing project source (read directly 2026-02-25): `C:/src/gsd1/FuzzyClock.App/MainWindow.xaml.cs`, `MainWindow.xaml`, `App.xaml.cs` — confirmed Grid hit-test background, TextBlock names, `PositionTopRight()` and `UpdatePhraseIfChanged()` implementations, existing `ContentRendered` handler structure

### Secondary (MEDIUM confidence)

None required. All findings resolved at PRIMARY confidence against official documentation or direct source reading.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all APIs verified against official Microsoft docs (windowsdesktop-10.0); confirmed in-box, no NuGet required
- Architecture: HIGH — all component boundaries derived from reading the existing source code directly; data flow verified against WPF lifecycle documentation
- Pitfalls: HIGH — all critical pitfalls sourced from official API documentation; `PositionTopRight()` regression risk explicitly derived from reading `MainWindow.xaml.cs` lines 42–54 and 22–28

**Research date:** 2026-02-25
**Valid until:** 2026-03-25 (stable WPF APIs; 30-day estimate)
