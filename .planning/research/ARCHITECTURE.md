# Architecture Research

**Domain:** WPF transparent desktop widget — drag/position-persistence/font-size integration (v1.1)
**Researched:** 2026-02-25
**Confidence:** HIGH

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                      FuzzyClock.App (WPF)                         │
├──────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐   ┌──────────────────┐   ┌──────────────┐  │
│  │   App.xaml.cs    │   │ MainWindow.xaml   │   │SettingsService│ │
│  │                  │   │    .cs            │   │  (NEW)       │  │
│  │  - Mutex         │   │                  │   │              │  │
│  │  - hidden owner  │   │  - DragMove()    │   │  - Load()    │  │
│  │  - Load settings │──>│  - ApplySettings │   │  - Save()    │  │
│  │  - pass to window│   │  - font size menu│   │  - Clamp()   │  │
│  │  - Save on Exit  │   │  - UpdatePhrase  │   │              │  │
│  └──────────────────┘   │  - SaveSettings()│<──│  AppSettings │  │
│                         └──────────────────┘   │  (record)    │  │
│                                                 └──────┬───────┘  │
│                                               JSON file on disk   │
│                                               %LOCALAPPDATA%\     │
│                                               FuzzyClock\         │
│                                               settings.json       │
├──────────────────────────────────────────────────────────────────┤
│                   FuzzyClock.Core (classlib — unchanged)          │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │  PhraseEngine.GetPhrase(DateTime)  — no changes needed     │   │
│  └────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Status |
|-----------|----------------|--------|
| `App.xaml.cs` | Startup: load settings via SettingsService, pass to MainWindow before Show(); backup save on Exit | Modified |
| `MainWindow.xaml.cs` | Drag via DragMove(), apply font size to both TextBlocks, save after each user action, conditional position logic | Modified |
| `MainWindow.xaml` | Add font size MenuItems to existing ContextMenu; add MouseLeftButtonDown on Grid | Modified |
| `SettingsService.cs` | Load/Save JSON file; compute file path; apply screen-clamp on load; supply defaults | New |
| `AppSettings.cs` | Plain record: `double Left, Top; int FontSize` | New |
| `FuzzyClock.Core` | PhraseEngine — no changes | Unchanged |

## Recommended Project Structure

```
FuzzyClock.App/
├── App.xaml
├── App.xaml.cs               # Modified: load settings on startup, save on exit
├── MainWindow.xaml           # Modified: new ContextMenu items, MouseLeftButtonDown on Grid
├── MainWindow.xaml.cs        # Modified: DragMove, ApplySettings, SetFontSize, SaveSettings
├── SettingsService.cs        # NEW: JSON load/save, file path, clamp logic, defaults
└── AppSettings.cs            # NEW: plain record (Left, Top, FontSize)
```

No new projects. No new NuGet packages — `System.Text.Json` is in-box with .NET 10.
All additions live in `FuzzyClock.App`.

### Structure Rationale

- **SettingsService.cs:** Isolates all file I/O. MainWindow and App.xaml.cs never touch file paths or JSON. Testable independently.
- **AppSettings.cs:** Explicit data contract. A plain C# record serializes cleanly with System.Text.Json without attributes. Could be a nested type inside SettingsService; separate file preferred for discoverability.
- No MVVM, no data binding for settings: the app has one window and three persisted values. Binding would add overhead with no benefit at this scale.

## Architectural Patterns

### Pattern 1: DragMove() — Preferred Drag Implementation

**What:** Call `this.DragMove()` inside `MouseLeftButtonDown` handler wired to the Grid (the hit-testable root element already present). WPF delegates the drag entirely to the OS via the Win32 `WM_NCLBUTTONDOWN` message; the window moves natively without any manual delta tracking.

**Why DragMove() over MouseMove + capture:**

MouseMove-based drag requires: a captured start point field, a drag-active flag, MouseMove handler computing deltas, MouseLeftButtonUp handler releasing capture — roughly 20 lines of bookkeeping. It produces visible stutter on slower machines or high-DPI. DragMove() is a single call, OS-native smooth movement, and zero state.

The only scenario where DragMove() falls short is grid-snapping or constrained drag — not needed here.

**AllowsTransparency compatibility:** DragMove() works correctly with `AllowsTransparency=True` windows. The `Background="#01000000"` Grid already present in v1.0 provides the hit-test surface needed for the mouse-down event to fire.

**DragMove() is a blocking call:** It returns only when the mouse button is released. This is exactly the right moment to save settings — Left and Top on the Window reflect the final dropped position.

**Confidence:** HIGH — verified against official DragMove API reference (docs updated 2026-02-11).

**Example:**
```csharp
// MainWindow.xaml — add to the Grid element:
// MouseLeftButtonDown="Grid_MouseLeftButtonDown"

private void Grid_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
{
    DragMove();
    // Left and Top now reflect the final dropped position.
    SaveSettings();
}
```

### Pattern 2: JSON Settings via System.Text.Json

**What:** A `SettingsService` static class owns the file path, load, save, and clamp logic. `AppSettings` is a plain record with three properties. `System.Text.Json` is included in the .NET 10 runtime — no additional NuGet package.

**File location:**
```
Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)
  + "\FuzzyClock\settings.json"
```

`LocalApplicationData` resolves to `C:\Users\<user>\AppData\Local` on Windows. This is the correct folder for non-roaming, user-specific application data. `ApplicationData` (roaming) is for settings that should follow the user to other machines — a screen position is meaningless on a different machine's monitor layout.

**Confidence:** HIGH — `Environment.SpecialFolder.LocalApplicationData` documented as "directory for application-specific data used by the current, non-roaming user" (official .NET docs, verified 2026-02-25).

**Default position sentinel:** On first run, there is no file. The default `Left` value uses `-1` as a sentinel meaning "compute from screen width." `PositionTopRight()` logic already in v1.0 handles this case. This avoids a separate "is first run" boolean.

**Screen clamp on load:** After deserializing Left/Top, clamp so the window has at least 50px visible. Use `SystemParameters.PrimaryScreenWidth` / `PrimaryScreenHeight` and `SystemParameters.VirtualScreenWidth` / `VirtualScreenHeight` for multi-monitor awareness.

**Example:**
```csharp
// AppSettings.cs
public record AppSettings(double Left, double Top, int FontSize);

// SettingsService.cs
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
        File.WriteAllText(FilePath, JsonSerializer.Serialize(s));
    }

    // Left = -1 is the sentinel for "compute from screen width at startup"
    public static AppSettings Defaults() => new(-1, 20, 32);

    public static AppSettings Clamp(AppSettings s, double windowWidth, double windowHeight)
    {
        const double MinVisible = 50;
        double screenW = SystemParameters.VirtualScreenWidth;
        double screenH = SystemParameters.VirtualScreenHeight;
        double left = Math.Clamp(s.Left, -windowWidth + MinVisible, screenW - MinVisible);
        double top  = Math.Clamp(s.Top,  -windowHeight + MinVisible, screenH - MinVisible);
        return s with { Left = left, Top = top };
    }
}
```

### Pattern 3: Font Size via ContextMenu MenuItems in Code-Behind

**What:** Add three `MenuItem` entries to the existing ContextMenu in `MainWindow.xaml`. Each calls a shared `SetFontSize(int)` method in code-behind that sets FontSize on both TextBlocks, calls `UpdateLayout()` (required — `SizeToContent=WidthAndHeight` window must re-measure), and calls `SaveSettings()`.

**Why both TextBlocks:** `ShadowText` and `PhraseText` must always have matching FontSize values. A single helper enforces this invariant.

**Window resize behavior after font change:** The window is `SizeToContent=WidthAndHeight`. Changing font size causes the window to resize from its top-left anchor. The window grows rightward and downward, which is natural and expected. No special handling needed.

**Example:**
```csharp
// MainWindow.xaml ContextMenu additions:
// <Separator />
// <MenuItem Header="Small (16pt)"  Click="FontSize16_Click" />
// <MenuItem Header="Medium (24pt)" Click="FontSize24_Click" />
// <MenuItem Header="Large (32pt)"  Click="FontSize32_Click" />

private int _currentFontSize = 32;

private void FontSize16_Click(object sender, RoutedEventArgs e) => SetFontSize(16);
private void FontSize24_Click(object sender, RoutedEventArgs e) => SetFontSize(24);
private void FontSize32_Click(object sender, RoutedEventArgs e) => SetFontSize(32);

private void SetFontSize(int size)
{
    _currentFontSize = size;
    PhraseText.FontSize = size;
    ShadowText.FontSize = size;
    UpdateLayout();   // Force re-measure — SizeToContent ActualWidth is stale until this runs
    SaveSettings();
}
```

## Data Flow

### Startup Flow

```
App.OnStartup()
    |
    +-- Single-instance Mutex check (existing, unchanged)
    +-- Hidden owner window setup (existing, unchanged)
    +-- SettingsService.Load() -> AppSettings            [NEW]
    |       +-- reads JSON file (or returns defaults)
    |       +-- Left == -1? -> flag for PositionTopRight fallback
    |
    +-- new MainWindow()
    +-- mainWindow.ApplySettings(settings)               [NEW]
    |       +-- _currentFontSize = settings.FontSize
    |       +-- PhraseText.FontSize = settings.FontSize
    |       +-- ShadowText.FontSize = settings.FontSize
    |       +-- if Left != -1: Left = settings.Left, Top = settings.Top
    |
    +-- mainWindow.SetInitialPhrase(...)                  (existing, unchanged)
    +-- mainWindow.Show()
            |
            +-- ContentRendered fires
                    +-- if Left == -1: PositionTopRight() (existing fallback)
                    +-- else: position already set, skip PositionTopRight
                    +-- UpdateLayout() if needed
                    +-- start DispatcherTimer (existing, unchanged)
```

### Drag Flow

```
User presses left mouse button on widget
    |
    +-- Grid.MouseLeftButtonDown fires
    +-- DragMove() called
    |       OS takes over, moves window frame natively
    |       (blocking until mouse button released)
    +-- DragMove() returns
    +-- Window.Left / Window.Top now reflect final position
    +-- SaveSettings() called
            +-- SettingsService.Save(new AppSettings(Left, Top, _currentFontSize))
```

### Font Size Change Flow

```
User right-clicks -> ContextMenu opens
    |
    +-- User clicks font size MenuItem
    +-- SetFontSize(size) handler fires
    +-- PhraseText.FontSize = size
    +-- ShadowText.FontSize = size
    +-- UpdateLayout()   (re-measure for SizeToContent)
    +-- SaveSettings()
            +-- SettingsService.Save(new AppSettings(Left, Top, size))
```

### Key Data Flows

1. **Settings load at startup:** App.OnStartup calls SettingsService.Load, passes AppSettings to MainWindow.ApplySettings before Show(). Font size and position are set before the first layout pass. No flash or incorrect initial state.
2. **Settings save after drag:** DragMove() returns on mouse-up. SaveSettings() reads Window.Left, Window.Top, and _currentFontSize to construct AppSettings and calls SettingsService.Save.
3. **Settings save after font change:** SetFontSize() updates both TextBlocks, forces UpdateLayout(), then calls SaveSettings() with current position.
4. **Default position on first run:** Left == -1 sentinel flows through ApplySettings (skips position assignment) to ContentRendered, which calls PositionTopRight() as before. No code path duplication.

## Anti-Patterns

### Anti-Pattern 1: Saving Position in Window.Closing or Application.Exit Only

**What people do:** Wire position save to the `Closing` event or `App.OnExit`, saving once at shutdown.

**Why it's wrong:** If the process is killed (Task Manager, crash, power loss), the save never runs. The user's last repositioning is lost.

**Do this instead:** Save immediately after DragMove() returns and after each font size change. File I/O for a small JSON object (under 100 bytes) is negligible.

### Anti-Pattern 2: MouseMove + Manual Delta for Dragging

**What people do:** Subscribe to `MouseMove`, compute delta from a captured start point stored in a field, update `Left` and `Top` manually on each event.

**Why it's wrong:** Requires 20+ lines of state management (drag flag, start point, capture, release). Produces stutter at high DPI or under CPU load. Functionally equivalent to DragMove() for unconstrained drag.

**Do this instead:** `this.DragMove()` — one line, OS-native smooth movement, no state.

### Anti-Pattern 3: Putting File Path or JSON Logic in MainWindow or App.xaml.cs

**What people do:** Write `File.ReadAllText` or `File.WriteAllText` directly inside MainWindow event handlers or App.OnStartup.

**Why it's wrong:** Couples UI lifecycle to I/O. Makes path or format changes require edits across multiple files. Untestable without a running WPF window.

**Do this instead:** All persistence in `SettingsService`. MainWindow and App.xaml.cs only pass and receive `AppSettings` records.

### Anti-Pattern 4: Calling PositionTopRight() Unconditionally in ContentRendered

**What people do:** Leave the existing `ContentRendered` handler unchanged, so PositionTopRight() always runs.

**Why it's wrong:** Overrides the saved position every launch. The user's repositioning is silently discarded on every restart.

**Do this instead:** Make PositionTopRight() conditional — call it only when the loaded Left value is the sentinel (-1), meaning no saved position exists.

### Anti-Pattern 5: LocationChanged Handler for Save During Drag

**What people do:** Subscribe to `Window.LocationChanged` and save settings on every event during the drag.

**Why it's wrong:** LocationChanged fires on every pixel of movement — potentially hundreds of file writes per drag. Unnecessary I/O, possible file handle contention.

**Do this instead:** Save once after DragMove() returns, which fires only on mouse-up.

## Integration Points

### New Files

| File | Purpose | Key Dependencies |
|------|---------|-----------------|
| `FuzzyClock.App/AppSettings.cs` | Data record: `double Left, Top; int FontSize` | None |
| `FuzzyClock.App/SettingsService.cs` | JSON load/save, file path, clamp logic, defaults | `System.Text.Json` (in-box), `System.IO`, `System.Windows.SystemParameters` |

### Modified Existing Files

| File | What Changes |
|------|-------------|
| `FuzzyClock.App/App.xaml.cs` | Add `SettingsService.Load()` before `mainWindow.Show()`; add `mainWindow.ApplySettings(settings)` call; optionally add `SettingsService.Save()` in `OnExit` as a backup save |
| `FuzzyClock.App/MainWindow.xaml.cs` | Add `ApplySettings(AppSettings)` method; add `Grid_MouseLeftButtonDown` handler with `DragMove()` + `SaveSettings()`; add `SetFontSize(int)` method; add font size MenuItem Click handlers; add `_currentFontSize` field; make `PositionTopRight()` call in ContentRendered conditional |
| `FuzzyClock.App/MainWindow.xaml` | Add `MouseLeftButtonDown="Grid_MouseLeftButtonDown"` to Grid; add `<Separator/>` and three font-size `MenuItem` elements to the existing ContextMenu |

### Unchanged

| File | Why Unchanged |
|------|--------------|
| `FuzzyClock.Core/PhraseEngine.cs` | Pure phrase logic; no settings or UI concern touches it |
| `FuzzyClock.Core.Tests/` | No new core logic; existing tests still pass |
| `FuzzyClock.App/AssemblyInfo.cs` | No version or metadata change needed |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| App.xaml.cs -> SettingsService | Direct static method call: `SettingsService.Load()` | SettingsService is a static class; no instance or DI needed |
| App.xaml.cs -> MainWindow | `mainWindow.ApplySettings(AppSettings)` method call | Keeps MainWindow constructor signature clean; no constructor parameter pollution |
| MainWindow.xaml.cs -> SettingsService | `SettingsService.Save(new AppSettings(Left, Top, _currentFontSize))` | MainWindow reads its own state at save time; no SettingsService instance needed |
| MainWindow.xaml.cs -> FuzzyClock.Core | `PhraseEngine.GetPhrase(DateTime.Now)` — unchanged | |

## Suggested Build Order

Each step is independently verifiable before the next begins.

**Step 1: AppSettings + SettingsService (no UI)**
- Write `AppSettings.cs` record and `SettingsService.cs`
- Verify: run the app once to confirm `settings.json` is created in `%LOCALAPPDATA%\FuzzyClock\`
- Verify: manually delete the file to confirm defaults are applied
- Verify: manually edit file with out-of-range Left/Top to confirm clamping works
- No WPF dependency; logic is independently testable

**Step 2: Apply settings on startup (App.xaml.cs + MainWindow.ApplySettings)**
- Wire `SettingsService.Load()` into `App.OnStartup`
- Add `ApplySettings(AppSettings)` to MainWindow; make `PositionTopRight()` conditional
- Verify: first launch positions top-right; manually edit `settings.json` to a different position and relaunch to confirm saved position is restored

**Step 3: Drag — DragMove() + SaveSettings()**
- Add `MouseLeftButtonDown` attribute to Grid in XAML
- Add handler in code-behind: `DragMove(); SaveSettings();`
- Verify: drag widget to a new position, close app, relaunch — widget appears at saved position
- Verify: `settings.json` Left/Top values update after each drag

**Step 4: Font size — ContextMenu items + SetFontSize()**
- Add `<Separator/>` and three font-size `MenuItem` elements to XAML ContextMenu
- Add `SetFontSize(int)` method and three Click handlers in code-behind
- Verify: each size option changes both TextBlocks simultaneously; window resizes
- Verify: font size persists across restarts

**Step 5: Off-screen clamp validation**
- Manually set extreme Left/Top values in `settings.json` (e.g., Left=99999, Top=-9999)
- Relaunch and verify widget clamps to visible area

**Dependency rationale:**
Step 1 before Step 2: ApplySettings can't be tested without a working SettingsService.
Step 2 before Step 3: Drag saves settings; need the save path verified before adding more save calls.
Step 3 before Step 4: Each feature is independently shippable. Font size is simpler; drag is higher value.
Step 5 last: edge-case validation after happy path is confirmed.

## Sources

| Claim | Source | Confidence |
|-------|--------|------------|
| DragMove() requires left button down; blocks until mouse-up; compatible with AllowsTransparency | https://learn.microsoft.com/en-us/dotnet/api/system.windows.window.dragmove (updated 2026-02-11) | HIGH |
| LocalApplicationData = C:\Users\<user>\AppData\Local (non-roaming, per-user app data) | https://learn.microsoft.com/en-us/dotnet/api/system.environment.specialfolder (official .NET docs) | HIGH |
| System.Text.Json is in-box since .NET Core 3.0; no extra package needed on .NET 10 | Official .NET docs / in-box since 2019 | HIGH |
| Window.Left / Window.Top reflect final position after DragMove() returns | Official WPF Window class documentation / DragMove remarks | HIGH |
| UpdateLayout() required before reading ActualWidth after SizeToContent=WidthAndHeight change | Validated in existing v1.0 codebase (see KEY DECISIONS in PROJECT.md) | HIGH |

---
*Architecture research for: FuzzyClock v1.1 — drag, position persistence, font size*
*Researched: 2026-02-25*
