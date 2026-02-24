# Technology Stack

**Project:** Fuzzy Clock — C# WPF transparent desktop widget
**Researched:** 2026-02-25
**Confidence:** HIGH (all findings verified against official Microsoft documentation)

---

## Recommended Stack

### Core Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| .NET | 10.0 (LTS) | Runtime and SDK | Current LTS release (Nov 2025, supported until Nov 2028). Visual Studio 2026 defaults new WPF projects to .NET 10. Prefer over .NET 9 (STS, expires Nov 2026) or .NET 8 (LTS but older). |
| WPF | Ships with .NET 10 | UI framework | Built-in support for transparent, frameless, always-on-top windows via `AllowsTransparency`, `WindowStyle=None`, and `Topmost` — all first-class properties on `System.Windows.Window`. No third-party packages needed for overlay rendering. |
| C# | 13 (ships with .NET 9 SDK); 14 previewed with .NET 10 | Language | Project requirement. C# 13 features (params collections, improved lock) available out of the box with the SDK. |

### Project File

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>WinExe</OutputType>
    <TargetFramework>net10.0-windows</TargetFramework>
    <UseWPF>true</UseWPF>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>
</Project>
```

The `-windows` TFM suffix is required to unlock WPF and Windows-specific APIs. `UseWPF>true` pulls in the WPF references.

### Window Configuration (no packages needed)

All three overlay requirements are native WPF `Window` properties:

| Property | Value | Effect |
|----------|-------|--------|
| `WindowStyle` | `None` | Removes title bar and border chrome |
| `AllowsTransparency` | `True` | Enables per-pixel alpha compositing |
| `Background` | `Transparent` | Makes window background invisible |
| `Topmost` | `True` | Keeps window above all non-topmost windows |
| `ResizeMode` | `NoResize` | Prevents resize handles appearing |
| `ShowInTaskbar` | `False` | Keeps widget out of taskbar |

Constraint: `AllowsTransparency=True` requires `WindowStyle=None`. Setting `AllowsTransparency` with any other `WindowStyle` throws `InvalidOperationException` at runtime. This is documented and enforced by WPF.

**Minimal XAML:**

```xaml
<Window x:Class="FuzzyClock.MainWindow"
        xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        WindowStyle="None"
        AllowsTransparency="True"
        Background="Transparent"
        Topmost="True"
        ResizeMode="NoResize"
        ShowInTaskbar="False"
        Width="400"
        Height="80">
    <TextBlock x:Name="ClockText"
               Foreground="White"
               FontSize="36"
               FontFamily="Segoe UI"
               HorizontalAlignment="Center"
               VerticalAlignment="Center" />
</Window>
```

### Timing

| Technology | Purpose | Why |
|------------|---------|-----|
| `System.Windows.Threading.DispatcherTimer` | Trigger phrase refresh at 5-minute boundaries | Built into WPF. Fires on the UI thread — no cross-thread marshalling needed. Simpler than `System.Timers.Timer` for WPF use. No NuGet package required. |

**Timer pattern for 5-minute boundary alignment:**

```csharp
private void StartTimer()
{
    UpdateDisplay(); // show immediately on launch

    var timer = new DispatcherTimer();
    timer.Tick += (_, _) => UpdateDisplay();

    // Fire at the next 5-minute boundary, then every 5 minutes
    var now = DateTime.Now;
    var secondsUntilNextBucket = 300 - (now.Minute % 5) * 60 - now.Second;
    timer.Interval = TimeSpan.FromSeconds(secondsUntilNextBucket > 0 ? secondsUntilNextBucket : 300);
    timer.Start();
}
```

After the first tick, reset `Interval` to exactly `TimeSpan.FromMinutes(5)` so it stays aligned.

---

## Supporting Libraries

None required. This project is intentionally zero-dependency beyond the .NET SDK itself.

| Library | Verdict | Reason |
|---------|---------|--------|
| Hardcodet.NotifyIcon.Wpf | Not needed | Project explicitly excludes system tray icon |
| Microsoft.Xaml.Behaviors.Wpf | Not needed | No complex MVVM behaviors; single-window app |
| CommunityToolkit.Mvvm | Not needed | MVVM overkill for a single TextBlock with a timer |
| Any theming package | Not needed | Window is fully transparent; WPF Fluent theme irrelevant |

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Runtime | .NET 10 LTS | .NET 9 STS | STS support ends Nov 2026 — shorter support window for no gain |
| Runtime | .NET 10 LTS | .NET Framework 4.x | Legacy; no new feature development; cannot use modern C# features |
| UI Framework | WPF | WinForms | WinForms has no native support for per-pixel transparent windows. `AllowsTransparency` doesn't exist. Achievable only via Win32 interop hacks — complexity not worth it. |
| UI Framework | WPF | WinUI 3 / Windows App SDK | More modern compositing model but higher complexity and larger deployment footprint. WPF transparent windows are well-understood and work reliably on all supported Windows 10/11 versions. |
| UI Framework | WPF | MAUI | Cross-platform, not Windows-optimized. No direct equivalent to `AllowsTransparency` + `Topmost` combo. Overkill for a Windows-only widget. |
| Timer | DispatcherTimer | System.Timers.Timer | Fires on thread pool thread — requires `Dispatcher.Invoke` to update UI. DispatcherTimer fires on UI thread directly. |
| Text display | TextBlock | Label | TextBlock is lighter; no control chrome. Label wraps TextBlock internally. |

---

## Scaffolding Command

```bash
dotnet new wpf -n FuzzyClock -f net10.0-windows
```

This generates: `FuzzyClock.csproj`, `App.xaml`, `App.xaml.cs`, `MainWindow.xaml`, `MainWindow.xaml.cs`.

Immediately edit `MainWindow.xaml` to add the five overlay properties listed above.

---

## Sources

- .NET Support Policy (official): https://dotnet.microsoft.com/en-us/platform/support/policy/dotnet-core
  — Confirms .NET 10 = current LTS (Nov 2025 – Nov 2028). Confidence: HIGH.
- What's new in WPF for .NET 10 (official): https://learn.microsoft.com/en-us/dotnet/desktop/wpf/whats-new/net100
  — Confirms WPF is actively maintained on .NET 10. Confidence: HIGH.
- What's new in WPF for .NET 9 (official): https://learn.microsoft.com/en-us/dotnet/desktop/wpf/whats-new/net90
  — Fluent theme, ThemeMode API, accent color support. None relevant to this widget. Confidence: HIGH.
- Window.AllowsTransparency API reference (official): https://learn.microsoft.com/en-us/dotnet/api/system.windows.window.allowstransparency
  — Documents the `WindowStyle=None` requirement and `InvalidOperationException` behavior. Confidence: HIGH.
- Window.Topmost API reference (official): https://learn.microsoft.com/en-us/dotnet/api/system.windows.window.topmost
  — Confirms `Topmost=True` is a native WPF window property. Confidence: HIGH.
- Create WPF app tutorial, Visual Studio 2026 (official): https://learn.microsoft.com/en-us/dotnet/desktop/wpf/get-started/create-app-visual-studio
  — Confirms .NET 10 is the recommended framework for new WPF projects as of current docs. Confidence: HIGH.
