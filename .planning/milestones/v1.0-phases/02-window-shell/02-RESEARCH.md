# Phase 2: Window Shell - Research

**Researched:** 2026-02-25
**Domain:** WPF transparent overlay window (net10.0-windows)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Default window position**
- Opens at top-right corner of the primary screen
- 20px padding from both the right edge and top edge
- Position is fixed on launch (no persistence yet — deferred to v2)

**Text appearance**
- Font: Segoe UI Light
- Size: 32pt
- Color: White (#FFFFFF)
- Drop shadow: Dark shadow for legibility on light wallpapers (ClearType is disabled on transparent WPF windows — greyscale AA makes shadow essential)
- Weight: Light / Thin (the phrase floats, doesn't shout)
- Placeholder text for Phase 2 shell: any static string that confirms the window renders (e.g. "half past 3")

**Close menu**
- Single item: "Close" — exits the application
- No app name header, no About item
- Matches the no-chrome philosophy

**Always-on-top behavior**
- `Topmost=True` unconditionally — no fullscreen detection or suppression
- Widget is visible over games, video, presentations — simple, no edge-case logic
- Hide from Alt+Tab — `ShowInTaskbar=False` plus the window-owner trick to suppress from the Alt+Tab switcher
- Window does not appear in the Windows taskbar

### Claude's Discretion

- Exact `DropShadowEffect` parameters (blur radius, opacity, depth) — tune for legibility
- Near-transparent Grid background (`#01000000`) to enable dragging over transparent areas — use this to ensure the full window surface responds to mouse events even with transparent background
- Single-instance enforcement via named Mutex — include in this phase since a second launch would create a second always-on-top overlay

### Deferred Ideas (OUT OF SCOPE)

- Window drag-to-reposition (WIN-04) — Phase 3 or v2
- Position persistence across restarts (WIN-05) — v2
- Windows startup launch (STRT-01) — v2
- Fullscreen detection / widget suppression — out of scope entirely
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| WIN-01 | Window is frameless and transparent — text floats directly on the desktop with no background box | WindowStyle=None + AllowsTransparency=True + Background=Transparent confirmed in official WPF docs |
| WIN-02 | Window is always-on-top | Topmost=True dependency property confirmed in official WPF Window class docs |
| WIN-03 | User can right-click to close the application (required: Alt+F4 is removed by WindowStyle=None) | ContextMenu on Window element with MenuItem that calls Application.Current.Shutdown() |
</phase_requirements>

---

## Summary

Phase 2 creates the WPF application project (FuzzyClock.App targeting net10.0-windows) and builds the transparent overlay window shell. The technology stack is entirely WPF built-in — no third-party packages are needed. The `dotnet new wpf` template produces a working csproj scaffold with `UseWPF=true` and `OutputType=WinExe`, which is then modified to configure the window as a transparent, frameless, always-on-top overlay.

The three key WPF properties for the transparent overlay are `WindowStyle=None`, `AllowsTransparency=True`, and `Background=Transparent`. These three must be set together — setting AllowsTransparency without WindowStyle=None causes a runtime exception. The Alt+Tab suppression requires a hidden owner window pattern (create a non-visible Window, set the overlay's Owner to it) because `ShowInTaskbar=False` alone does not suppress the window from Alt+Tab.

Screen positioning uses `SystemParameters.PrimaryScreenWidth` and `SystemParameters.PrimaryScreenHeight` (WPF-native, DPI-adjusted) combined with `SizeToContent=WidthAndHeight` to measure the text block's natural size. Single-instance enforcement uses a named `System.Threading.Mutex` in `App.xaml.cs`'s `OnStartup` override — this must happen before the window is created to avoid a second overlay appearing briefly.

**Primary recommendation:** Create the WPF project via `dotnet new wpf -n FuzzyClock.App -f net10.0`, hand-edit XAML to set the three transparency properties, add the hidden-owner trick for Alt+Tab suppression, and use `SystemParameters` for top-right positioning. No NuGet packages required.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Microsoft.NET.Sdk (WPF) | net10.0-windows | WPF application framework | Built into .NET SDK; `UseWPF=true` in csproj activates WPF references |
| System.Windows.Window | Inbox | Transparent overlay window | Native WPF class; WindowStyle, AllowsTransparency, Topmost, ShowInTaskbar are all dependency properties on this class |
| System.Windows.Media.Effects.DropShadowEffect | Inbox | Text legibility on transparent background | WPF built-in bitmap effect; no NuGet needed |
| System.Threading.Mutex | Inbox (BCL) | Single-instance enforcement | Standard .NET pattern; no third-party library needed |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| System.Windows.SystemParameters | Inbox | DPI-adjusted screen dimensions for top-right positioning | Use `PrimaryScreenWidth` / `PrimaryScreenHeight` — already adjusted for DPI, no P/Invoke needed |
| FuzzyClock.Core | Local project reference | PhraseEngine (not used in Phase 2 shell, but project reference is established) | Add the `<ProjectReference>` now so Phase 3 wiring is a one-line change |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SystemParameters.PrimaryScreenWidth | System.Windows.Forms.Screen.PrimaryScreen.Bounds | WinForms Screen class requires adding `UseWindowsForms=true` to csproj; SystemParameters is already available in WPF with no extra setup |
| Named Mutex in App.cs | Single-instance via WPF ApplicationFramework | WPF ApplicationFramework (Microsoft.VisualBasic.ApplicationServices) requires extra package in C# projects; Mutex is simpler and cross-framework |
| DropShadowEffect on TextBlock | Custom drawn drop shadow | DropShadowEffect is GPU-accelerated, zero custom code; hand-drawn shadow adds significant complexity for no gain |

**Installation:** No NuGet packages needed for this phase.

```xml
<!-- FuzzyClock.App.csproj -->
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>WinExe</OutputType>
    <TargetFramework>net10.0-windows</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <UseWPF>true</UseWPF>
  </PropertyGroup>
  <ItemGroup>
    <ProjectReference Include="..\FuzzyClock.Core\FuzzyClock.Core.csproj" />
  </ItemGroup>
</Project>
```

---

## Architecture Patterns

### Recommended Project Structure

```
FuzzyClock.App/
├── App.xaml              # Application entry point — remove StartupUri, override OnStartup
├── App.xaml.cs           # Single-instance Mutex + window creation in OnStartup
├── MainWindow.xaml       # Transparent overlay window XAML
├── MainWindow.xaml.cs    # Top-right positioning in constructor + right-click menu handler
└── AssemblyInfo.cs       # Generated by template (ThemeInfo attribute) — leave as-is
```

### Pattern 1: Transparent Overlay Window (Three Required Properties)

**What:** WindowStyle=None removes OS chrome. AllowsTransparency=True enables per-pixel alpha. Background=Transparent makes the window client area transparent. All three must be set together.

**When to use:** Any WPF floating overlay that must show desktop behind it.

**Example:**
```xml
<!-- Source: https://learn.microsoft.com/en-us/dotnet/desktop/wpf/windows/?view=netdesktop-10.0 -->
<Window x:Class="FuzzyClock.App.MainWindow"
        xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        WindowStyle="None"
        AllowsTransparency="True"
        Background="Transparent"
        Topmost="True"
        ShowInTaskbar="False"
        SizeToContent="WidthAndHeight"
        WindowStartupLocation="Manual"
        ResizeMode="NoResize">

    <!-- Near-transparent Grid: #01000000 = alpha=1, RGB=black -->
    <!-- Alpha=1 (not 0) gives the Grid a hit-testable surface  -->
    <!-- so right-click is captured over transparent pixels too  -->
    <Grid Background="#01000000">
        <TextBlock x:Name="PhraseText"
                   Text="half past 3"
                   FontFamily="Segoe UI Light"
                   FontSize="32"
                   Foreground="White"
                   Margin="8">
            <TextBlock.Effect>
                <DropShadowEffect Color="Black"
                                  BlurRadius="6"
                                  ShadowDepth="2"
                                  Opacity="0.8"
                                  Direction="315" />
            </TextBlock.Effect>
        </TextBlock>
    </Grid>
</Window>
```

### Pattern 2: Alt+Tab Suppression (Hidden Owner Window Trick)

**What:** A window with `ShowInTaskbar=False` still appears in Alt+Tab unless it has an owner. The trick: create a minimal invisible Window at startup, set its `ShowInTaskbar=False` and `WindowStyle=ToolWindow`, then set it as the overlay's Owner. The owned window inherits the owner's taskbar/Alt+Tab absence.

**When to use:** Any WPF window that must be invisible to Alt+Tab and taskbar.

**Example:**
```csharp
// Source: standard WPF pattern — Owner property documented at
// https://learn.microsoft.com/en-us/dotnet/desktop/wpf/windows/?view=netdesktop-10.0
// (Window Ownership section)
private static Window CreateHiddenOwner()
{
    var owner = new Window
    {
        Width = 0,
        Height = 0,
        WindowStyle = WindowStyle.ToolWindow,
        ShowInTaskbar = false,
        Visibility = Visibility.Hidden
    };
    owner.Show(); // must be shown for ownership to work
    return owner;
}

// In App.xaml.cs OnStartup:
var hiddenOwner = CreateHiddenOwner();
var mainWindow = new MainWindow();
mainWindow.Owner = hiddenOwner;
mainWindow.Show();
```

### Pattern 3: Top-Right Corner Positioning

**What:** Use `SystemParameters.PrimaryScreenWidth` and `SystemParameters.PrimaryScreenHeight` (DPI-adjusted doubles) plus the window's actual rendered size to place the top-right corner 20px from each edge.

**When to use:** After `SizeToContent=WidthAndHeight` has rendered the window (measure in `ContentRendered` event or constructor after `Show()` — use `ContentRendered` for reliable ActualWidth).

**Example:**
```csharp
// Source: SystemParameters documented at
// https://learn.microsoft.com/en-us/dotnet/api/system.windows.systemparameters.primaryscreenwidth?view=windowsdesktop-10.0
private void PositionTopRight()
{
    const double Padding = 20.0;
    this.Left = SystemParameters.PrimaryScreenWidth - this.ActualWidth - Padding;
    this.Top = Padding;
}

// Wire in constructor after InitializeComponent():
this.ContentRendered += (_, _) => PositionTopRight();
```

### Pattern 4: Single-Instance Mutex

**What:** Named Mutex checked in `App.xaml.cs` before any window is shown. If the Mutex is already held, shut down immediately.

**Example:**
```csharp
// In App.xaml.cs — override OnStartup, remove StartupUri from App.xaml
private Mutex? _instanceMutex;

protected override void OnStartup(StartupEventArgs e)
{
    const string MutexName = "FuzzyClock_SingleInstance_Mutex";
    _instanceMutex = new Mutex(initiallyOwned: true, MutexName, out bool createdNew);

    if (!createdNew)
    {
        // Another instance is running
        _instanceMutex.Dispose();
        Shutdown();
        return;
    }

    base.OnStartup(e);

    var hiddenOwner = CreateHiddenOwner();
    var mainWindow = new MainWindow();
    mainWindow.Owner = hiddenOwner;
    mainWindow.Show();
}
```

### Pattern 5: Right-Click Context Menu Close

**What:** Attach a `ContextMenu` to the root Grid so right-clicking anywhere on the window (including transparent-but-hit-testable area) shows a "Close" menu.

**Example:**
```xml
<!-- Source: WPF ContextMenu is a standard WPF control -->
<Grid Background="#01000000">
    <Grid.ContextMenu>
        <ContextMenu>
            <MenuItem Header="Close" Click="CloseMenuItem_Click" />
        </ContextMenu>
    </Grid.ContextMenu>
    <!-- ... TextBlock ... -->
</Grid>
```

```csharp
// In MainWindow.xaml.cs code-behind
private void CloseMenuItem_Click(object sender, RoutedEventArgs e)
{
    Application.Current.Shutdown();
}
```

### Anti-Patterns to Avoid

- **Setting AllowsTransparency without WindowStyle=None:** Throws `InvalidOperationException` at runtime. The two must be set together.
- **Using Background=Transparent with no hit-test workaround:** Fully transparent pixels have no hit surface — right-click and mouse events are passed through to the window below. Fix: set Grid Background to `#01000000` (alpha=1, not 0).
- **Using Window.Close() instead of Application.Current.Shutdown():** With a hidden owner window, `Close()` on the main window may not shut down the app (the owner window keeps the process alive). Always use `Application.Current.Shutdown()` in the "Close" menu handler.
- **StartupUri in App.xaml when using Mutex pattern:** The Mutex check must happen before window creation. Remove `StartupUri` from App.xaml and create the window manually in `OnStartup`.
- **Positioning in the constructor before SizeToContent measures:** `ActualWidth` is 0 before the window renders. Position in the `ContentRendered` event handler.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Text drop shadow on transparent background | Custom shadow with second TextBlock offset | `DropShadowEffect` on TextBlock | DropShadowEffect is GPU-accelerated, handles blur correctly, single line of XAML |
| Screen dimensions (DPI-aware) | P/Invoke to GetSystemMetrics or Win32 | `SystemParameters.PrimaryScreenWidth/Height` | Already DPI-adjusted, pure WPF, no P/Invoke complexity |
| Single-instance guard | File lock, port listen, process scan | `System.Threading.Mutex` with named mutex | OS-guaranteed mutual exclusion; process death automatically releases the mutex |
| Alt+Tab suppression | Win32 SetWindowLong WS_EX_TOOLWINDOW P/Invoke | Hidden owner window pattern | Pure WPF, no P/Invoke, documented behavior via Window.Owner property |

**Key insight:** All overlay requirements (transparency, topmost, taskbar hiding, Alt+Tab suppression) are addressable through pure WPF XAML properties or standard .NET APIs. P/Invoke is not needed for this phase.

---

## Common Pitfalls

### Pitfall 1: ClearType Disabled on Transparent Windows

**What goes wrong:** Text looks blurry or low-quality on the transparent window. Users notice it looks worse than normal application text.

**Why it happens:** Windows DWM disables ClearType sub-pixel anti-aliasing when compositing transparent HWND surfaces. This is a Windows OS constraint, not a WPF bug. WPF falls back to greyscale anti-aliasing.

**How to avoid:** This is unavoidable — it is by design in Windows. Compensate with a `DropShadowEffect` with moderate blur (BlurRadius 4-8) to give the text visual definition. Light 32pt text on transparent background with greyscale AA looks acceptable; the shadow adds the "punch" that ClearType would normally provide.

**Warning signs:** If testing shows text is barely readable against light-colored wallpapers, increase `DropShadowEffect` blur radius and opacity.

### Pitfall 2: AllowsTransparency Cannot Be Changed After Window Is Shown

**What goes wrong:** Runtime `InvalidOperationException` if code tries to set `AllowsTransparency` after the window handle is created.

**Why it happens:** WPF window transparency is a Win32-level property (WS_EX_LAYERED) applied when the HWND is created. It cannot be changed post-creation.

**How to avoid:** Set `AllowsTransparency`, `WindowStyle`, and `Background` in XAML, not in code-behind after `InitializeComponent()`.

**Warning signs:** Exception message: "The property 'AllowsTransparency' cannot be changed once the window has been shown."

### Pitfall 3: SizeToContent + Positioning Timing

**What goes wrong:** Window position is calculated with `ActualWidth=0` so the window lands at `Left = screenWidth - 0 - 20 = screenWidth - 20` (right edge) instead of the correct top-right.

**Why it happens:** `SizeToContent=WidthAndHeight` defers measurement until layout pass completes. `ActualWidth` is 0 in the constructor before `Show()` is called.

**How to avoid:** Subscribe to the `ContentRendered` event and position there — this fires after the first layout pass when `ActualWidth` is valid.

**Warning signs:** Window appears at the extreme right edge of the screen, not offset by the text width.

### Pitfall 4: ShowInTaskbar=False Does Not Suppress Alt+Tab

**What goes wrong:** Even with `ShowInTaskbar=False`, the overlay appears in the Alt+Tab switcher, confusing users.

**Why it happens:** Windows determines Alt+Tab visibility separately from taskbar visibility. A window with `WindowStyle=None` (no title bar) that has no owner still appears in Alt+Tab.

**How to avoid:** Set the hidden owner window (`WindowStyle=ToolWindow, ShowInTaskbar=False`) as the Owner before calling `Show()`. The hidden owner pattern suppresses the owned window from Alt+Tab.

**Warning signs:** Pressing Alt+Tab while app is running shows the overlay or a blank entry in the switcher.

### Pitfall 5: Second Instance Creates Second Overlay

**What goes wrong:** Running the app twice creates two overlapping text overlays.

**Why it happens:** No single-instance enforcement.

**How to avoid:** Named Mutex check in `App.xaml.cs OnStartup` before any window is created. If Mutex not acquired, call `Shutdown()` and return immediately.

**Warning signs:** Visible text doubling or slight drift in text position when launched twice.

### Pitfall 6: dotnet solution add Required After Project Creation

**What goes wrong:** The new FuzzyClock.App project builds and runs but does not appear in `dotnet build FuzzyClock.slnx` — it is not in the solution.

**Why it happens:** `dotnet new wpf` creates the project but does not add it to the solution.

**How to avoid:** After creating the project, run `dotnet solution FuzzyClock.slnx add FuzzyClock.App/FuzzyClock.App.csproj`.

**Warning signs:** `dotnet build FuzzyClock.slnx` succeeds but does not compile FuzzyClock.App.

---

## Code Examples

Verified patterns from official sources:

### Complete MainWindow.xaml (Transparent Overlay)

```xml
<!-- Source: WPF Windows overview — https://learn.microsoft.com/en-us/dotnet/desktop/wpf/windows/?view=netdesktop-10.0 -->
<!-- Pattern confirmed: WindowStyle=None + AllowsTransparency=True + Background=Transparent -->
<Window x:Class="FuzzyClock.App.MainWindow"
        xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        xmlns:d="http://schemas.microsoft.com/expression/blend/2008"
        xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
        mc:Ignorable="d"
        WindowStyle="None"
        AllowsTransparency="True"
        Background="Transparent"
        Topmost="True"
        ShowInTaskbar="False"
        SizeToContent="WidthAndHeight"
        WindowStartupLocation="Manual"
        ResizeMode="NoResize">

    <Grid Background="#01000000">
        <Grid.ContextMenu>
            <ContextMenu>
                <MenuItem Header="Close" Click="CloseMenuItem_Click" />
            </ContextMenu>
        </Grid.ContextMenu>

        <TextBlock x:Name="PhraseText"
                   Text="half past 3"
                   FontFamily="Segoe UI Light"
                   FontSize="32"
                   Foreground="White"
                   Margin="8">
            <TextBlock.Effect>
                <DropShadowEffect Color="Black"
                                  BlurRadius="6"
                                  ShadowDepth="2"
                                  Opacity="0.8"
                                  Direction="315" />
            </TextBlock.Effect>
        </TextBlock>
    </Grid>
</Window>
```

### Complete App.xaml (No StartupUri)

```xml
<!-- Remove StartupUri — window creation is handled in OnStartup code-behind -->
<Application x:Class="FuzzyClock.App.App"
             xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
             xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
             xmlns:local="clr-namespace:FuzzyClock.App">
    <Application.Resources />
</Application>
```

### Complete App.xaml.cs (Mutex + Hidden Owner + Window Creation)

```csharp
using System.Threading;
using System.Windows;

namespace FuzzyClock.App;

public partial class App : Application
{
    private Mutex? _instanceMutex;

    protected override void OnStartup(StartupEventArgs e)
    {
        const string MutexName = "FuzzyClock_SingleInstance_v1";
        _instanceMutex = new Mutex(initiallyOwned: true, MutexName, out bool createdNew);

        if (!createdNew)
        {
            _instanceMutex.Dispose();
            Shutdown();
            return;
        }

        base.OnStartup(e);

        // Hidden owner: suppresses overlay from Alt+Tab
        var hiddenOwner = new Window
        {
            Width = 0,
            Height = 0,
            WindowStyle = WindowStyle.ToolWindow,
            ShowInTaskbar = false,
            Visibility = Visibility.Hidden
        };
        hiddenOwner.Show();

        var mainWindow = new MainWindow();
        mainWindow.Owner = hiddenOwner;
        mainWindow.Show();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _instanceMutex?.ReleaseMutex();
        _instanceMutex?.Dispose();
        base.OnExit(e);
    }
}
```

### Complete MainWindow.xaml.cs (Positioning + Close)

```csharp
using System.Windows;

namespace FuzzyClock.App;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
        ContentRendered += (_, _) => PositionTopRight();
    }

    private void PositionTopRight()
    {
        // Source: SystemParameters.PrimaryScreenWidth documented at
        // https://learn.microsoft.com/en-us/dotnet/api/system.windows.systemparameters.primaryscreenwidth?view=windowsdesktop-10.0
        const double Padding = 20.0;
        Left = SystemParameters.PrimaryScreenWidth - ActualWidth - Padding;
        Top = Padding;
    }

    private void CloseMenuItem_Click(object sender, RoutedEventArgs e)
    {
        Application.Current.Shutdown();
    }
}
```

### CLI Commands to Create and Wire the Project

```bash
# 1. Create WPF project
dotnet new wpf -n FuzzyClock.App -f net10.0 -o FuzzyClock.App

# 2. Add to solution (FuzzyClock.slnx supports dotnet solution commands)
dotnet solution FuzzyClock.slnx add FuzzyClock.App/FuzzyClock.App.csproj

# 3. Add Core reference (edit csproj, or via CLI):
dotnet add FuzzyClock.App/FuzzyClock.App.csproj reference FuzzyClock.Core/FuzzyClock.Core.csproj

# 4. Verify build
dotnet build FuzzyClock.slnx
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `.sln` solution file | `.slnx` XML solution file | .NET 10 SDK | `dotnet solution` commands work with both; slnx is the new format generated by dotnet 10.0 tooling |
| `BitmapEffect` (deprecated) for drop shadows | `DropShadowEffect` inheriting from `Effect` | .NET 3.5 SP1 | BitmapEffect was removed; use `System.Windows.Media.Effects.DropShadowEffect` |
| Win32 P/Invoke for WS_EX_TOOLWINDOW (Alt+Tab suppression) | Hidden owner window pattern (pure WPF) | Always available, community-established pattern | No P/Invoke needed |

**Deprecated/outdated:**
- `BitmapEffect` and its subclasses: Removed in .NET Core WPF; use `System.Windows.Media.Effects.DropShadowEffect` instead.
- `UseHardwareAcceleration=false` workaround for transparency issues: Not needed on modern hardware with DWM compositing.

---

## Open Questions

1. **DropShadowEffect render quality with greyscale AA**
   - What we know: ClearType is disabled on transparent windows; greyscale AA is used instead; DropShadowEffect is the compensating mechanism.
   - What's unclear: The exact BlurRadius/Opacity/ShadowDepth values that look best at 32pt Segoe UI Light on varied wallpapers — this requires visual testing against real desktop backgrounds.
   - Recommendation: Start with `BlurRadius=6, ShadowDepth=2, Opacity=0.8` (the values in the code examples). Adjust during verification against both dark and light wallpapers.

2. **SizeToContent behavior with very long phrase strings**
   - What we know: STATE.md flags this as a concern for Phase 3 (when real PhraseEngine output is wired). Phase 2 uses static placeholder text.
   - What's unclear: Whether long phrases like "just a little after twenty-five past" produce awkward window widths at 32pt.
   - Recommendation: Phase 2 uses placeholder "half past 3" — no action needed here. Flag for Phase 3 verification.

3. **DPI scaling on high-DPI displays**
   - What we know: `SystemParameters.PrimaryScreenWidth` returns DPI-adjusted values. WPF coordinates are in device-independent units (DIPs = physical pixels / DPI scale factor).
   - What's unclear: Whether the 20px padding constant feels visually correct at 150% or 200% DPI scaling.
   - Recommendation: The 20px DIP padding should be visually consistent across DPI levels (that is the point of DIPs). No action required for Phase 2.

---

## Sources

### Primary (HIGH confidence)

- Official WPF Windows overview — https://learn.microsoft.com/en-us/dotnet/desktop/wpf/windows/?view=netdesktop-10.0
  - Confirmed: WindowStyle=None, AllowsTransparency=True, Background=Transparent used together for non-rectangular windows
  - Confirmed: ShowInTaskbar=False property and behavior
  - Confirmed: Topmost=True z-order behavior
  - Confirmed: SizeToContent.WidthAndHeight behavior (fits content, acts as MinWidth/MaxWidth constraint)
  - Confirmed: Window.Owner property and owned window behavior
  - Confirmed: ContentRendered event fires after first layout pass
- `SystemParameters.PrimaryScreenWidth` — https://learn.microsoft.com/en-us/dotnet/api/system.windows.systemparameters.primaryscreenwidth?view=windowsdesktop-10.0
  - Confirmed: Returns DPI-adjusted screen width in WPF device-independent units
- `DropShadowEffect` class — https://learn.microsoft.com/en-us/dotnet/api/system.windows.media.effects.dropshadoweffect?view=windowsdesktop-10.0
  - Confirmed: Properties BlurRadius, Color, Direction, Opacity, ShadowDepth all exist on windowsdesktop-10.0
- `dotnet new wpf` template — verified via `dotnet new list` and actual template execution on local SDK 10.0.103
  - Confirmed: Template generates csproj with `UseWPF=true`, `OutputType=WinExe`, `TargetFramework=net10.0-windows`
  - Confirmed: Generated files: App.xaml, App.xaml.cs, MainWindow.xaml, MainWindow.xaml.cs, AssemblyInfo.cs

### Secondary (MEDIUM confidence)

- `dotnet solution` command — verified via `dotnet solution --help` (supports .slnx files via add/list/remove)
- Hidden owner window technique for Alt+Tab suppression — established WPF community pattern, consistent with Window.Owner property documentation behavior

### Tertiary (LOW confidence)

- None — all claims are backed by official Microsoft documentation or direct CLI verification.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified via official .NET 10 docs and `dotnet new wpf` template inspection
- Architecture: HIGH — patterns confirmed against official WPF Windows overview documentation
- Pitfalls: HIGH — transparency constraints and timing issues are documented in official sources; Alt+Tab behavior verified against Window.Owner docs

**Research date:** 2026-02-25
**Valid until:** 2026-04-25 (WPF APIs are stable; 60 days is conservative)
