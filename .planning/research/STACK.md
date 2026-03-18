# Stack Research

**Domain:** WPF .NET 10 desktop widget — installer, single-instance, edge-snap, Settings visual redesign
**Researched:** 2026-03-17
**Scope:** v3.3 additions only — existing validated stack (C# WPF .NET 10, MSTest 4.0.1, System.Text.Json, PerformanceCounter 10.0.0, UseWindowsForms=true) is unchanged
**Confidence:** HIGH (all claims verified against official docs, NuGet, or official GitHub)

---

## What Changes vs v3.2

v3.2 validated stack (not re-researched): .NET 10, C# 13, WPF `net10.0-windows`, `UseWindowsForms=true`, `System.Text.Json`, `System.Diagnostics.PerformanceCounter` 10.0.0, MSTest 4.0.1, `SettingsWindow` (3-tab modeless), `BuiltInThemes`, `PhraseEngine` with multilingual providers, 224 tests passing.

v3.3 additions by feature:

| Feature | Stack Change | NuGet Needed |
|---------|-------------|--------------|
| Per-user installer | Velopack 0.0.1298 + `vpk` CLI tool | **Yes — `Velopack` NuGet** |
| Single-instance guard | `System.Threading.Mutex` + `System.IO.Pipes` (BCL) | None |
| Edge snapping | Win32 `WM_MOVING` via `HwndSource.AddHook` (existing P-Invoke pattern) | None |
| Settings window visual redesign | WPF `ThemeMode="Dark"` (built into .NET 9+ / .NET 10) | None |
| ResetToDefaults fix | Pure logic fix in existing code | None |
| README docs | Documentation only | None |

**One new NuGet package. One new CLI tool. Zero csproj structural changes beyond adding the package.**

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Velopack | 0.0.1298 (NuGet stable, 2025-06-07) | Per-user installer + auto-update + upgrade-in-place | Installs to `%LocalAppData%\{packId}` with no UAC prompt by default. The default `Setup.exe` detects an existing installation and upgrades it automatically via `Update.exe`. WPF integration requires a custom `static void Main` with `VelopackApp.Build().Run()` before WPF init. Replaces ClickOnce / Inno Setup / WiX for this use case. 285K downloads on NuGet; actively maintained. |
| `System.Threading.Mutex` (BCL) | Built into .NET 10 | Single-instance guard | Named system Mutex (`new Mutex(true, "Global\\FuzzyClock-{guid}", out bool createdNew)`) is the idiomatic .NET single-instance mechanism. Atomic — no race condition. `createdNew == false` means another instance is already running: send activation signal and exit immediately. Zero dependencies. |
| `System.IO.Pipes.NamedPipeServerStream` (BCL) | Built into .NET 10 (confirmed net-10.0 API docs) | Signal the running instance to activate | The running instance listens on a named pipe in a background `Task`. The second instance connects as `NamedPipeClientStream`, writes `"ACTIVATE"`, and exits. The server dispatches `window.Activate()` on the UI thread. No extra library. Clean shutdown via `CancellationToken`. |
| WPF `ThemeMode="Dark"` (PresentationFramework.Fluent) | Built into .NET 9+ / .NET 10 | Dark aesthetic for SettingsWindow | WPF .NET 9 introduced a built-in Fluent dark theme via the `ThemeMode` property on `Window`. Setting `ThemeMode="Dark"` on `SettingsWindow` applies modern Windows 11-style dark styling to all standard controls (Button, TabControl, ComboBox, Slider, CheckBox, TextBox) with zero extra packages. Available in .NET 10 as a stable XAML attribute. |
| Win32 `WM_MOVING` via `HwndSource.AddHook` | Win32 (no package) | Edge snapping during `DragMove()` | WPF's `DragMove()` bypasses WPF mouse events entirely; the only non-destructive intercept point is the Win32 `WM_MOVING` message (0x0216). The `lParam` is a pointer to a mutable `RECT` — clamping its values snaps the window to a screen edge. Uses the existing `HwndSource` + P-Invoke infrastructure already present for ghost mode. No library needed. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `Velopack.Vpk` CLI tool | Matches NuGet 0.0.1298 | Build installer artifacts (`Setup.exe`, delta packages) | Used in CI/build step: `vpk pack --packId FuzzyClock --packVersion 3.3.0 --mainExe FuzzyClock.App.exe`. Not a runtime dependency. |
| WPF `ResourceDictionary` (built-in XAML) | Built-in | Override Fluent theme brush tokens for SettingsWindow | Layer project-specific color overrides on top of Fluent using `<Window.Resources><ResourceDictionary.MergedDictionaries>`. Lets you match the SettingsWindow background to the app's dark aesthetic (`#1E1E1E`) while keeping Fluent control chrome. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `vpk` (Velopack CLI) | Packages release builds into installer artifacts | Install globally: `dotnet tool install -g vpk`. Run after `dotnet publish -r win-x64 --self-contained false`. |
| Visual Studio XAML Designer | Inspect Fluent theme resource keys for overrides | Theme XAML files at `C:\Program Files\Microsoft Visual Studio\2022\<edition>\DesignTools\SystemThemes\wpf`. Read-only reference — not used at runtime. |

---

## Installation

```bash
# Velopack NuGet runtime — add to FuzzyClock.App.csproj
dotnet add FuzzyClock.App package Velopack --version 0.0.1298

# Velopack CLI packaging tool — dev machine and CI
dotnet tool install -g vpk

# No other new packages — Mutex, NamedPipe, ThemeMode, WM_MOVING are BCL/framework built-ins
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Velopack (default Setup.exe) | ClickOnce | Only if you need Visual Studio one-click publish and are on .NET Framework. ClickOnce has poor .NET 5+ support and cannot reliably target `%LocalAppData%`. |
| Velopack (default Setup.exe) | Inno Setup | Only if you need system-wide install (Program Files), complex installer UI with license screens, or custom installation scripts. Overkill for a personal widget. |
| Velopack (default Setup.exe) | WiX 5 | Only for enterprise MSI requirements (Group Policy, SCCM, Windows Installer features). WiX requires verbose XML authoring. |
| Velopack (default Setup.exe) | Velopack `--msi` | The MSI variant prompts the user to choose per-user vs per-machine install. Adds unnecessary complexity for a single-user widget. Use the default exe installer. |
| Named Mutex + NamedPipe | `Microsoft.Toolkit.Win32.UI.Controls` SingleInstance | The toolkit approach targets UWP-style apps and is heavier. Mutex + NamedPipe is ~40 lines of code with no dependency. |
| WPF `ThemeMode="Dark"` | MahApps.Metro | MahApps is a full UI framework replacement (5-10 MB assets) that conflicts with existing `BuiltInThemes` and requires adopting MetroWindow. ThemeMode is built-in and zero-overhead. |
| WPF `ThemeMode="Dark"` | ModernWpf | ModernWpf imposes its own control templates globally. As of 2023 it is unmaintained. ThemeMode is the official Microsoft replacement. |
| `WM_MOVING` hook | Replace `DragMove()` with manual drag | Manual drag (MouseDown/MouseMove + `SetWindowPos`) gives more control but requires rewriting the entire existing drag system. `WM_MOVING` intercepts `DragMove()` non-invasively. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `Microsoft.VisualBasic.ApplicationServices.WindowsFormsApplicationBase` | Legacy VB runtime single-instance API. Not idiomatic in .NET 10 C# and pulls in a Windows Forms dependency that competes with `UseWindowsForms=true`. | `Mutex` + `NamedPipeClientStream` |
| `System.Diagnostics.Process.GetProcessesByName()` | Fragile single-instance check — matches only on exe name, fails if user has renamed the exe, and has a time-of-check/time-of-use race condition. | Named `Mutex` (atomic, OS-guaranteed uniqueness per mutex name) |
| `Application.ThemeMode="Dark"` (app-wide) | Would apply Fluent dark to the main overlay window too, which is a transparent frameless widget — wrong aesthetic for the overlay. | `ThemeMode="Dark"` on `SettingsWindow` only (Window-scoped, not Application-scoped) |
| MahApps.Metro / ModernWpf | Replaces all default control templates globally; conflicts with existing `BuiltInThemes` system; ModernWpf is unmaintained. | WPF built-in Fluent `ThemeMode` |
| Velopack `--msi` flag | Generates an MSI with a per-user/per-machine choice dialog. Unnecessary complexity for a personal desktop widget. | Default Velopack `Setup.exe` (silent per-user install to `%LocalAppData%`, no choice dialog) |
| `ThemeMode` set in C# code (experimental) | Setting `ThemeMode` from code generates compiler error `WPF0001` (experimental API, subject to change). | Set `ThemeMode="Dark"` as a XAML attribute on `SettingsWindow` — stable, no warning. |

---

## Stack Patterns by Feature

**Installer (per-user, no admin, upgrade detection):**

- Use Velopack default `Setup.exe` (do NOT add `--msi` flag to `vpk pack`)
- Installs silently to `%LocalAppData%\FuzzyClock` with no elevation prompt
- `Update.exe` in the install directory handles upgrades when a new `Setup.exe` is run
- WPF integration: change `App.xaml` Build Action to `Page`, add `<StartupObject>FuzzyClock.App.App</StartupObject>` to csproj, add a custom `[STAThread] static void Main(string[] args)` to `App.xaml.cs`:

```csharp
[STAThread]
private static void Main(string[] args)
{
    VelopackApp.Build().Run();   // must be first — handles update/install hooks
    var app = new App();
    app.InitializeComponent();
    app.Run();
}
```

**Single-instance guard (second launch brings window to front):**

In `Main`, before `new App()`:

```csharp
var mutex = new Mutex(true, @"Global\FuzzyStatsClock-SingleInstance", out bool isFirstInstance);
if (!isFirstInstance)
{
    // Signal running instance and exit
    using var client = new NamedPipeClientStream(".", "FuzzyStatsClock", PipeDirection.Out);
    try { client.Connect(500); new StreamWriter(client).WriteLine("ACTIVATE"); }
    catch { /* already exiting */ }
    return;
}
GC.KeepAlive(mutex); // prevent GC of mutex for process lifetime
```

In the running instance (`MainWindow` constructor or `ContentRendered`):

```csharp
_ = Task.Run(async () =>
{
    while (!_cts.IsCancellationRequested)
    {
        using var server = new NamedPipeServerStream("FuzzyStatsClock", PipeDirection.In);
        await server.WaitForConnectionAsync(_cts.Token);
        var msg = await new StreamReader(server).ReadLineAsync();
        if (msg == "ACTIVATE")
            Dispatcher.Invoke(() => { Show(); Activate(); WindowState = WindowState.Normal; });
    }
});
```

**Edge snapping (snap to screen edges when dragging):**

In `MainWindow` after `HwndSource` is obtained (already done for ghost mode):

```csharp
private const int WM_MOVING = 0x0216;
private const int SnapThreshold = 20; // pixels

// In AddHook callback:
if (msg == WM_MOVING)
{
    var rect = Marshal.PtrToStructure<RECT>(lParam);
    var screen = Screen.FromHandle(_hwnd).WorkingArea;
    int w = rect.Right - rect.Left;
    int h = rect.Bottom - rect.Top;

    if (Math.Abs(rect.Left - screen.Left)   < SnapThreshold) { rect.Left  = screen.Left;                rect.Right  = rect.Left + w; }
    if (Math.Abs(rect.Top  - screen.Top)    < SnapThreshold) { rect.Top   = screen.Top;                 rect.Bottom = rect.Top + h; }
    if (Math.Abs(rect.Right  - screen.Right)  < SnapThreshold) { rect.Right  = screen.Right;               rect.Left   = rect.Right - w; }
    if (Math.Abs(rect.Bottom - screen.Bottom) < SnapThreshold) { rect.Bottom = screen.Bottom;              rect.Top    = rect.Bottom - h; }

    Marshal.StructureToPtr(rect, lParam, true);
    handled = true;
    return (IntPtr)1;
}
```

`Screen.FromHandle(_hwnd)` is from `System.Windows.Forms` — already available via `UseWindowsForms=true`.

**Settings window visual redesign (dark aesthetic, no third-party library):**

On `SettingsWindow.xaml`:

```xml
<Window ...
        ThemeMode="Dark"
        Background="#1E1E1E">
    <Window.Resources>
        <ResourceDictionary>
            <ResourceDictionary.MergedDictionaries>
                <!-- Optional: override Fluent brush tokens to match app accent system -->
            </ResourceDictionary.MergedDictionaries>
        </ResourceDictionary>
    </Window.Resources>
    ...
</Window>
```

`ThemeMode="Dark"` applies Fluent dark to all standard controls (Button, TabControl, ComboBox, Slider, CheckBox, TextBox) in `SettingsWindow` only. The main overlay window (`MainWindow`) is unaffected because it does not set `ThemeMode`. No `ControlTemplate` rewrites needed for basic dark styling.

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| Velopack 0.0.1298 | .NET 5+ (confirmed on NuGet page) / `net10.0-windows` | WPF custom `Main` pattern documented and works on any TFM. |
| `ThemeMode="Dark"` | `net9.0-windows`, `net10.0-windows` | Introduced in WPF .NET 9. Stable as XAML attribute in .NET 10. Setting from code is experimental (suppress `WPF0001`). |
| `NamedPipeServerStream` | net-10.0 (confirmed in official .NET 10 API docs) | In `System.IO.Pipes.dll`, no new dependency. |
| `System.Threading.Mutex` | All .NET versions | No changes in .NET 10. Named system mutexes have been stable since .NET 1.0. |
| `WM_MOVING` / `HwndSource.AddHook` | `net10.0-windows` | Win32 message; WPF `HwndSource` already used by ghost mode in this codebase. |

---

## Integration Points in Existing Code

| Location | Change |
|----------|--------|
| `FuzzyClock.App.csproj` | Add `<PackageReference Include="Velopack" Version="0.0.1298" />`; add `<StartupObject>FuzzyClock.App.App</StartupObject>`; change `App.xaml` Build Action to `Page` |
| `FuzzyClock.App/App.xaml.cs` | Add custom `[STAThread] static void Main(string[] args)` with `VelopackApp.Build().Run()` first; add Mutex + NamedPipe single-instance check; start pipe listener task |
| `FuzzyClock.App/MainWindow.xaml.cs` | Add `WM_MOVING` case to existing `HwndSource.AddHook` handler for edge snapping |
| `FuzzyClock.App/SettingsWindow.xaml` | Add `ThemeMode="Dark"` attribute and `Background="#1E1E1E"` to the Window element |

---

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| Velopack per-user install to `%LocalAppData%` | HIGH | Verified directly on docs.velopack.io/packaging/installer — states this explicitly |
| Velopack WPF custom `Main` integration | HIGH | Verified on docs.velopack.io/getting-started/csharp — exact code pattern documented |
| Velopack version 0.0.1298 | HIGH | Verified on nuget.org/packages/Velopack — latest stable, published 2025-06-07 |
| `ThemeMode="Dark"` on Window scope | HIGH | Verified on learn.microsoft.com/dotnet/desktop/wpf/whats-new/net90 — official, with screenshots |
| Fluent theme available in .NET 10 | HIGH | learn.microsoft.com docs show net10.0 moniker; introduced in .NET 9 which is a prior release |
| `NamedPipeServerStream` in .NET 10 | HIGH | API docs explicitly list net-10.0 as a supported moniker |
| Named Mutex for single-instance | HIGH | Official .NET threading docs; established Windows pattern |
| `WM_MOVING` mutable RECT | HIGH | Official Win32 API docs — "application can change its position" |
| `Screen.FromHandle` available (UseWindowsForms=true) | HIGH | Already used in existing codebase for ghost mode cursor tracking |

---

## Sources

- https://docs.velopack.io/packaging/installer — Per-user `%LocalAppData%` default, no admin, upgrade behavior (HIGH)
- https://www.nuget.org/packages/Velopack — Version 0.0.1298, published 2025-06-07 (HIGH)
- https://docs.velopack.io/getting-started/csharp — WPF custom `Main` integration pattern with exact code (HIGH)
- https://learn.microsoft.com/en-us/dotnet/desktop/wpf/whats-new/net90 — `ThemeMode`, Fluent dark mode, `.NET 9+`, XAML attribute stable (HIGH)
- https://learn.microsoft.com/en-us/dotnet/desktop/wpf/controls/styles-templates-overview — `ResourceDictionary.MergedDictionaries` override pattern, `ThemeMode` on Window scope (HIGH)
- https://learn.microsoft.com/en-us/dotnet/api/system.io.pipes.namedpipeserverstream — net-10.0 moniker confirmed (HIGH)
- https://learn.microsoft.com/en-us/windows/win32/winmsg/wm-moving — `lParam` is mutable `RECT*`, return TRUE to change position (HIGH)
- https://learn.microsoft.com/en-us/dotnet/standard/threading/mutexes — Named system Mutex cross-process detection (HIGH)

---
*Stack research for: FuzzyStatsClock v3.3 Polish + Installer*
*Researched: 2026-03-17*
