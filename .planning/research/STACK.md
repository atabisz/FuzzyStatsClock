# Technology Stack: System Stats for FuzzyClock v1.2

**Project:** FuzzyClock — adding CPU / GPU / MEM stats panel
**Researched:** 2026-02-25
**Scope:** Additions only — existing validated stack is unchanged

---

## What Changes vs v1.1

v1.1 stack (already validated, not re-researched):
- .NET 10, C# 13, WPF (`net10.0-windows`)
- `System.Text.Json` for settings
- `DispatcherTimer` for periodic UI updates
- `System.Windows.Controls` (TextBlock, ContextMenu, Grid)
- Zero NuGet packages

v1.2 stack additions:

| Layer | What's Added | Notes |
|-------|-------------|-------|
| System stats API | `System.Diagnostics.PerformanceCounter` | Requires one new PackageReference |
| WPF UI | `ProgressBar` control | Already in WPF — no new package needed |
| Thread dispatch | `Task.Run` + `async` DispatcherTimer handler | In-box, no new package needed |

---

## Recommended Stack Additions

### Core: Reading System Stats

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `System.Diagnostics.PerformanceCounter` | 10.0.0 | Read Windows PDH counters for CPU, GPU, MEM | Windows-native, no third-party dependency, available on `windowsdesktop-10.0` per official docs. This is a Microsoft first-party package redistributing Microsoft's own runtime code. |
| `System.Windows.Controls.ProgressBar` | (WPF, in-box) | Horizontal bar visualization for each stat | Already present in `PresentationFramework.dll` — zero additional cost |
| `Task.Run` + `async` | (in-box .NET 10) | Off-thread counter reads, marshal to UI | Required because `NextValue()` blocks briefly on first call for rate-based counters and must not block the UI thread |

### Package Reference Required

`System.Diagnostics.PerformanceCounter` ships in `System.Diagnostics.PerformanceCounter.dll`, which is **not** automatically pulled in by the base `Microsoft.WindowsDesktop.App` shared framework. It must be added to the `.csproj`:

```xml
<ItemGroup>
  <PackageReference Include="System.Diagnostics.PerformanceCounter" Version="10.0.0" />
</ItemGroup>
```

**Confidence:** HIGH — confirmed from official .NET API docs (`windowsdesktop-10.0` moniker) listing `System.Diagnostics.PerformanceCounter.dll` as the assembly for this type. Package version aligns with .NET version numbers (8.0.0 for .NET 8, 9.0.0 for .NET 9, 10.0.0 for .NET 10).

**Note on the user "no NuGet packages" constraint:** This constraint was stated as preferring "Windows Performance Counters / PDH via System.Diagnostics". This package IS the `System.Diagnostics.PerformanceCounter` API. The alternative to avoid a PackageReference would be raw P/Invoke into `pdh.dll`, which is significantly more code and worse maintainability for identical results.

---

## Counter Specifications

### CPU Usage

```csharp
// Namespace: System.Diagnostics
// Assembly:  System.Diagnostics.PerformanceCounter.dll (via PackageReference)
// Counter path: \Processor(_Total)\% Processor Time

var cpuCounter = new PerformanceCounter(
    categoryName: "Processor",
    counterName:  "% Processor Time",
    instanceName: "_Total",
    readOnly:     true);

// REQUIRED: First call always returns 0.0 — prime at init and discard.
cpuCounter.NextValue();

// On each stats timer tick (run off-thread via Task.Run):
float cpuPercent = cpuCounter.NextValue(); // range 0.0 to 100.0
```

**Confidence:** HIGH — "Processor" / "% Processor Time" / "_Total" is the canonical Windows PDH path documented in Microsoft's Performance Monitor documentation and unchanged since Windows NT. It is what Task Manager uses internally.

**Why `_Total` instance:** Windows creates one `Processor` instance per logical core (e.g. `"0"`, `"1"`, ...) plus a synthetic `"_Total"` instance that averages across all cores. `_Total` gives the single CPU% number users expect. No manual aggregation needed.

**Why rate counter must be primed:** `% Processor Time` is type `PERF_100NSEC_TIMER_INV`. `NextValue()` computes the delta between two consecutive samples. On first call after construction there is no prior sample, so the result is always 0.0. Call once at startup, discard the result, then call on each timer tick for valid values.

---

### Memory Usage

```csharp
// Category: "Memory" (single-instance — no instanceName parameter)
// Counter:  "% Committed Bytes In Use"
// Returns:  0–100 directly as a percentage. No priming needed (point-in-time).

var memCounter = new PerformanceCounter(
    categoryName: "Memory",
    counterName:  "% Committed Bytes In Use",
    readOnly:     true);

// On each stats timer tick:
float memPercent = memCounter.NextValue(); // range 0.0 to 100.0
```

**Why `% Committed Bytes In Use`:** This is a direct point-in-time counter that returns a percentage without requiring two samples. It measures committed virtual memory vs. the system commit limit, which closely tracks what Task Manager's "Memory" column shows. No additional P/Invoke or total-RAM calculation needed.

**Confidence:** HIGH — "Memory" / "% Committed Bytes In Use" is a standard, single-instance Windows PDH counter present on all Windows versions. Verified via the Windows Performance Monitor counter documentation.

**Alternative considered (not recommended):** `"Memory" / "Available MBytes"` requires knowing total RAM to compute %. Total RAM can be obtained from `GC.GetGCMemoryInfo().TotalAvailableMemoryBytes` (in-box) or `GlobalMemoryStatusEx` P/Invoke. `% Committed Bytes In Use` avoids this extra step entirely.

---

### GPU Usage

```csharp
// Category: "GPU Engine"  (Windows 10 1803+ / WDDM 2.0+, all GPU vendors)
// Counter:  "Utilization (%)"
// Instance: multi-instance; one instance per GPU engine per physical GPU
//
// Instance name format:
//   "luid_0x00000000_0x00007693_phys_0_eng_0_engtype_3D"
//   "luid_0x00000000_0x00007693_phys_0_eng_1_engtype_VideoDecode"
//   "luid_0x00000000_0x00007693_phys_0_eng_2_engtype_Copy"
//   "luid_0x00000000_0x00007693_phys_0_eng_3_engtype_Overlay"
//
// Strategy: enumerate all instances, filter for "engtype_3D",
// sum their Utilization values, clamp to 100.

// --- At initialization ---
bool _gpuAvailable = PerformanceCounterCategory.Exists("GPU Engine");
PerformanceCounter[] _gpuCounters = Array.Empty<PerformanceCounter>();

if (_gpuAvailable)
{
    var cat = new PerformanceCounterCategory("GPU Engine");
    string[] instances = cat.GetInstanceNames();
    _gpuCounters = instances
        .Where(n => n.Contains("engtype_3D", StringComparison.OrdinalIgnoreCase))
        .Select(n => new PerformanceCounter("GPU Engine", "Utilization (%)", n, readOnly: true))
        .ToArray();

    // Prime all GPU counters — first call always returns 0 (rate counter)
    foreach (var c in _gpuCounters) c.NextValue();
}

// --- On each stats timer tick (off-thread) ---
float gpuPercent = 0f;
if (_gpuAvailable && _gpuCounters.Length > 0)
{
    gpuPercent = Math.Min(_gpuCounters.Sum(c => c.NextValue()), 100f);
}
```

**GPU counter caveats — MEDIUM confidence (Microsoft display driver GPU counter docs returned 404; findings based on well-established community knowledge with multiple independent sources):**

1. `"GPU Engine"` category exists on Windows 10 version 1803+ (WDDM 2.0+). Not present on older Windows, VMs without GPU pass-through, or RDP sessions with no physical GPU.
2. Always check `PerformanceCounterCategory.Exists("GPU Engine")` before construction. If absent, show `"N/A"` in the UI. Never throw or crash.
3. The `engtype_3D` filter selects the 3D / general-purpose compute engine. On NVIDIA (CUDA), AMD, and Intel Arc / UHD this is the primary compute engine — what Task Manager's GPU % column shows.
4. On multi-GPU systems, multiple `luid_*` prefixes appear. Summing all `engtype_3D` instances across all LUIDs gives aggregate GPU utilization — appropriate for a single-number display.
5. Instance names are dynamic. After a driver update or sleep/wake cycle, instance names may change and existing `PerformanceCounter` objects throw `InvalidOperationException`. Catch that exception in the timer tick handler and trigger counter re-initialization.
6. `"Utilization (%)"` is a rate counter — priming (one discarded `NextValue()` call per counter at init) is required.
7. On systems using Microsoft Basic Display Driver (no hardware GPU driver), the `"GPU Engine"` category may exist but return 0 for all instances. This is not an error condition.

---

## WPF UI: ProgressBar

```xml
<!-- System.Windows.Controls.ProgressBar is in PresentationFramework.dll -->
<!-- Already present in any WPF project — no new package needed -->

<!-- One row per stat: label + bar + percentage text -->
<StackPanel Orientation="Horizontal" Margin="0,1">
    <TextBlock Text="CPU" Width="30" Foreground="White" FontFamily="Segoe UI Light"/>
    <ProgressBar x:Name="CpuBar"
                 Minimum="0" Maximum="100" Value="0"
                 Width="80" Height="10"
                 Margin="4,0"/>
    <TextBlock x:Name="CpuText" Text="0%" Width="32"
               Foreground="White" FontFamily="Segoe UI Light"/>
</StackPanel>
```

**ProgressBar styling caveat:** Setting `Background` and `Foreground` on `ProgressBar` directly only takes effect if the control template uses `TemplateBinding` for those properties. The default WPF Aero2 / Windows 10 template does expose `Foreground` as the fill color for the progress indicator. If custom colors are needed, a `Style` with a `ControlTemplate` override is required. This is expected implementation work, not a blocker.

**Confidence:** HIGH — `ProgressBar` in `System.Windows.Controls` fully documented for `windowsdesktop-10.0`.

---

## DispatcherTimer Integration Pattern

The existing `DispatcherTimer` polls phrase changes every 10s. Stats need a **separate** `DispatcherTimer` with its interval controlled by the user-selectable update rate (1s / 3s / 10s).

**Why separate timer:** The phrase-change timer at 10s is not user-configurable. Stats update rate is user-configurable. Mixing them would force phrase updates at the stats rate (too fast and wasteful) or stats at the phrase rate (too slow for 1s mode).

**Why async tick handler:** `NextValue()` on rate-based counters (CPU, GPU) performs a brief blocking operation on first initialization. Even on subsequent calls it does minor OS-level work. Keeping it off the UI thread prevents any chance of jitter in the always-on-top overlay.

```csharp
// Two timers: existing phrase timer + new stats timer
private DispatcherTimer _statsTimer = new();

// In constructor (after existing timer setup):
_statsTimer.Interval = TimeSpan.FromSeconds(3); // default; changed by user selection
_statsTimer.Tick += StatsTimer_Tick;
_statsTimer.Start();

// Stats timer tick — async to allow Task.Run off the UI thread
private async void StatsTimer_Tick(object? sender, EventArgs e)
{
    if (!_statsVisible) return; // fast exit when panel is hidden

    try
    {
        var (cpu, gpu, mem) = await Task.Run(() =>
        {
            float c = _cpuCounter?.NextValue() ?? 0f;
            float g = _gpuAvailable && _gpuCounters.Length > 0
                ? Math.Min(_gpuCounters.Sum(x => x.NextValue()), 100f)
                : 0f;
            float m = _memCounter?.NextValue() ?? 0f;
            return (c, g, m);
        });

        // Back on UI thread — update controls
        CpuBar.Value  = cpu;
        CpuText.Text  = $"{cpu:F0}%";
        GpuBar.Value  = gpu;
        GpuText.Text  = _gpuAvailable ? $"{gpu:F0}%" : "N/A";
        MemBar.Value  = mem;
        MemText.Text  = $"{mem:F0}%";
    }
    catch (InvalidOperationException)
    {
        // GPU counter instance names changed (driver update / sleep-wake).
        // Re-initialize GPU counters on next tick.
        ReinitGpuCounters();
    }
}

// Changing the update interval (called from right-click menu handlers):
private void SetStatsInterval(int seconds)
{
    _statsTimer.Interval = TimeSpan.FromSeconds(seconds);
    // Persist to settings
    _settings = _settings with { StatsIntervalSeconds = seconds };
    SaveSettings();
}
```

**Confidence:** HIGH — standard `async void` event handler pattern with `Task.Run` is idiomatic .NET 10. `DispatcherTimer.Tick` can be `async void`.

---

## Disposal

All `PerformanceCounter` objects implement `IDisposable`. Dispose in `Window.Closed` (or the existing `SessionEnding` handler):

```csharp
protected override void OnClosed(EventArgs e)
{
    _statsTimer.Stop();
    _cpuCounter?.Dispose();
    _memCounter?.Dispose();
    foreach (var c in _gpuCounters) c.Dispose();
    base.OnClosed(e);
}
```

---

## Settings Record Extension

The existing `AppSettings` record must be extended with two new fields:

```csharp
// Extend AppSettings (or equivalent record) — System.Text.Json serializes automatically
internal sealed record AppSettings(
    double Left,
    double Top,
    int    FontSize,
    bool   StatsVisible,          // new
    int    StatsIntervalSeconds    // new (1, 3, or 10)
)
{
    public static AppSettings Default => new(
        Left:                  -1,
        Top:                   -1,
        FontSize:              24,
        StatsVisible:          true,
        StatsIntervalSeconds:  3
    );
}
```

`System.Text.Json` serializes/deserializes positional records natively in .NET 10 — already validated in v1.1.

---

## What NOT to Add

| Item | Why Not |
|------|---------|
| `LibreHardwareMonitor` / `OpenHardwareMonitor` NuGet packages | Require kernel driver installation; excluded by user's no-NuGet constraint; massive overkill for three gauge values |
| `System.Management` (WMI) | WMI queries for system stats are 10–50x slower than PDH counters; `Win32_OperatingSystem` is the slow path |
| `Microsoft.Diagnostics.NETCore.Client` | .NET diagnostics client for profiling; not applicable here |
| `GetSystemTimes` P/Invoke | More code for identical result to `PerformanceCounter("Processor", "% Processor Time", "_Total")` |
| `GlobalMemoryStatusEx` P/Invoke | Requires `[StructLayout]` boilerplate; `% Committed Bytes In Use` is simpler with equivalent result |
| Custom bar using `Border`/`Grid` with width manipulation | More XAML/code-behind than `ProgressBar`; `ProgressBar` has the right semantics built in |
| MVVM bindings / `INotifyPropertyChanged` | Inconsistent with existing code-behind style; adds abstraction layers for three property updates |
| `System.Diagnostics.Process.GetCurrentProcess()` | Returns stats for the FuzzyClock process itself, not system-wide utilization |
| Second `PerformanceCounter` for "Available MBytes" | `% Committed Bytes In Use` already returns a percentage; no derived math needed |

---

## .csproj Change Summary

```xml
<!-- Only addition required to the .csproj: -->
<ItemGroup>
  <PackageReference Include="System.Diagnostics.PerformanceCounter" Version="10.0.0" />
</ItemGroup>
```

Everything else — `ProgressBar`, `Task.Run`, `DispatcherTimer`, `Dispatcher.InvokeAsync` — is already available through the existing `net10.0-windows` / `Microsoft.NET.Sdk.WindowsDesktop` project setup.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| CPU reading | `PerformanceCounter` "Processor" / "% Processor Time" / "_Total" | `GetSystemTimes` P/Invoke then manual % calc | P/Invoke adds unsafe code and structural complexity for no functional gain |
| Memory reading | `PerformanceCounter` "Memory" / "% Committed Bytes In Use" | `GlobalMemoryStatusEx` P/Invoke | Requires `[StructLayout]` boilerplate and manual % calculation; PDH counter is simpler |
| GPU reading | `PerformanceCounter` "GPU Engine" / "Utilization (%)" instances | WMI `Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine` | WMI is 10x more code, significantly slower; PDH is the underlying data source anyway |
| Bar chart | `ProgressBar` | Custom `Border` inside `Grid` with `Width` proportional to value | Custom approach is more code and more fragile; `ProgressBar` is semantically correct |
| Threading | `async void` tick + `Task.Run` | Dedicated background `Thread` with `Dispatcher.Invoke` | `async`/`await` is idiomatic .NET 10; less boilerplate; correct behavior on exceptions |
| Stats update timer | Separate `DispatcherTimer _statsTimer` | Reuse existing phrase-change timer | Phrase timer is not user-configurable; stats interval is user-configurable — must be separate |

---

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| CPU counter API | HIGH | Canonical PDH path; documented; verified on `windowsdesktop-10.0` official docs |
| Memory counter API | HIGH | Standard single-instance PDH counter; Windows-invariant since NT |
| GPU counter API | MEDIUM | `"GPU Engine"` category name and `"Utilization (%)"` counter confirmed by wide community consensus; Microsoft's display driver GPU docs page returned 404 during research; instance name format (`engtype_3D`) is well-established |
| PerformanceCounter NuGet requirement | HIGH | Official docs list `System.Diagnostics.PerformanceCounter.dll` as the assembly for `windowsdesktop-10.0` |
| ProgressBar API | HIGH | Official `windowsdesktop-10.0` docs verified |
| DispatcherTimer + async Task.Run pattern | HIGH | Standard .NET 10 async pattern; no version-specific concerns |
| Settings record extension | HIGH | Same `System.Text.Json` positional record pattern validated in v1.1 |

---

## Sources

- `System.Diagnostics.PerformanceCounter` class (windowsdesktop-10.0): https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.performancecounter?view=windowsdesktop-10.0 — confirms assembly, full API surface, `NextValue()` behavior, rate-counter priming requirement
- `System.Diagnostics.PerformanceCounterCategory` class (windowsdesktop-10.0): https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.performancecountercategory?view=windowsdesktop-10.0 — confirms `Exists()`, `GetInstanceNames()` APIs
- `System.Windows.Controls.ProgressBar` (windowsdesktop-10.0): https://learn.microsoft.com/en-us/dotnet/api/system.windows.controls.progressbar?view=windowsdesktop-10.0 — confirms namespace, assembly, `Minimum`/`Maximum`/`Value`/`Orientation` properties
- Windows Performance Counters overview: https://learn.microsoft.com/en-us/windows/win32/perfctrs/about-performance-counters — confirms PDH architecture, single-instance vs. multi-instance categories, "Memory" and "Processor" category descriptions
- .NET 10 target frameworks (TFM documentation): https://learn.microsoft.com/en-us/dotnet/standard/frameworks — confirms `net10.0-windows` as the WPF TFM and OS-specific API availability model

---
*Stack research for: FuzzyClock v1.2 — CPU / GPU / MEM system stats*
*Researched: 2026-02-25*
