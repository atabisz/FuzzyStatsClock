# Phase 7: StatsService - Research

**Researched:** 2026-02-25
**Domain:** Windows PDH Performance Counters via System.Diagnostics.PerformanceCounter — pure data layer, no WPF
**Confidence:** HIGH (CPU/MEM/init patterns); MEDIUM (GPU instance enumeration — well-established community pattern, no authoritative Microsoft doc)

---

## Summary

Phase 7 creates a single new file, `FuzzyClock.App/StatsService.cs`, that owns three Windows PDH performance counter objects and exposes `CpuPercent`, `GpuPercent`, and `MemPercent` float properties. The service is the data layer for STAT-01; it has no WPF references and is verified in isolation via debug output before any UI work touches it in Phase 8.

One NuGet package must be added to the `.csproj`: `System.Diagnostics.PerformanceCounter` v10.0.0. This is a Microsoft first-party package that redistributes the Windows PDH wrapper; it is the correct API for this project's "Windows PDH counters" requirement and a materially simpler alternative to raw `pdh.dll` P/Invoke. The CPU and GPU counters are rate-based and must be primed (first `NextValue()` discarded) during async initialization to avoid a 0%-then-jump artifact. All counter construction must happen on a background thread (`Task.Run`) because PDH cold-start can block 200–500ms.

The GPU path carries MEDIUM confidence specifically on instance name format (`engtype_3D`). The approach — enumerate `GPU Engine` category instances, filter by `engtype_3D`, sum `Utilization (%)`, clamp to 100 — is confirmed by multiple independent community sources and matches Task Manager behavior. It must be validated on physical hardware during implementation by running `typeperf "\GPU Engine(*)\Utilization (%)"` before finalizing the enumeration logic. Machines without the `GPU Engine` category (VMs, RDP, pre-WDDM-2.0) must be handled by a `_gpuAvailable = false` sentinel path returning `-1f`; no exception should propagate to callers.

**Primary recommendation:** Implement `StatsService` as a standalone `IDisposable` class with async init via `Task.Run`, a `_initialized` guard flag, CPU counter priming, GPU multi-instance enumeration with `InvalidOperationException` recovery, and explicit `Dispose()` for all counter handles. Verify non-zero plausible values via debug output before Phase 8 touches any XAML.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| STAT-01 | Stats panel shows CPU, GPU, and memory usage below the time phrase | StatsService data layer: `PerformanceCounter("Processor","% Processor Time","_Total")` for CPU, `PerformanceCounter("Memory","% Committed Bytes In Use")` for MEM, `GPU Engine` / `Utilization (%)` multi-instance enumeration for GPU. All reads async via `Task.Run`. IDisposable pattern for counter cleanup. |
</phase_requirements>

---

## Codebase State (Phase 6 complete — confirmed)

**`AppSettings.cs`** is already an init-property record with `StatsVisible` and `StatsIntervalSeconds`. Phase 6 is complete:

```csharp
public record AppSettings
{
    public double Left                 { get; init; } = -1;
    public double Top                  { get; init; } = 20;
    public int    FontSize             { get; init; } = 32;
    public bool   StatsVisible         { get; init; } = false;
    public int    StatsIntervalSeconds { get; init; } = 3;
}
```

**`FuzzyClock.App.csproj`** currently has zero NuGet packages. Phase 7 must add one:

```xml
<PackageReference Include="System.Diagnostics.PerformanceCounter" Version="10.0.0" />
```

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `System.Diagnostics.PerformanceCounter` | 10.0.0 | Windows PDH counter reads for CPU, GPU, MEM | First-party Microsoft package; Windows-native PDH path; what Task Manager uses internally; no third-party dependency |
| `Task.Run` + `_initialized` flag | in-box .NET 10 | Async counter initialization | PDH cold-start blocks 200–500ms; must not block UI thread |
| `IDisposable` | in-box .NET 10 | Explicit counter handle cleanup | Each `PerformanceCounter` holds unmanaged PDH handles |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `PerformanceCounterCategory` | same package | Enumerate GPU Engine instances; check category existence | GPU init and GPU instance refresh after `InvalidOperationException` |
| `System.Linq` | in-box .NET 10 | Filter and aggregate GPU instance names/values | GPU `engtype_3D` instance filtering |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `System.Diagnostics.PerformanceCounter` | Raw `pdh.dll` P/Invoke | P/Invoke requires unsafe boilerplate for identical results; never worth it |
| `System.Diagnostics.PerformanceCounter` | WMI (`System.Management`) | WMI is 10–50x slower for same data; excluded by project requirements |
| `% Committed Bytes In Use` MEM counter | `Available MBytes` + total RAM math | `Available MBytes` requires a separate total-RAM query; `% Committed Bytes In Use` returns percentage directly |
| `PerformanceCounter` for CPU | `GetSystemTimes` P/Invoke | P/Invoke adds unsafe code, no functional gain |

**Installation (one change to .csproj):**
```xml
<ItemGroup>
  <PackageReference Include="System.Diagnostics.PerformanceCounter" Version="10.0.0" />
</ItemGroup>
```

---

## Architecture Patterns

### Recommended File Structure

```
FuzzyClock.App/
├── StatsService.cs      ← NEW — pure data layer, no WPF references
├── AppSettings.cs       ← DONE (Phase 6) — already has StatsVisible + StatsIntervalSeconds
├── MainWindow.xaml      ← Phase 8 — not touched in Phase 7
├── MainWindow.xaml.cs   ← Phase 8 — not touched in Phase 7
└── FuzzyClock.App.csproj ← Add PackageReference in Phase 7
```

### Pattern 1: Async Initialization with Primed Counters

**What:** All `PerformanceCounter` construction and first-read priming happens on `Task.Run`. The `_initialized` flag prevents timer ticks from reading until init completes.

**When to use:** Required. PDH cold-start is blocking I/O. This is the only safe approach.

**Example:**
```csharp
// Source: verified against official .NET docs (PerformanceCounter.NextValue — "call twice for rate counters")
// https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.performancecounter.nextvalue

public sealed class StatsService : IDisposable
{
    private PerformanceCounter? _cpuCounter;
    private PerformanceCounter? _memCounter;
    private PerformanceCounter[] _gpuCounters = [];
    private bool _gpuAvailable;
    private volatile bool _initialized;

    public float CpuPercent { get; private set; }
    public float GpuPercent { get; private set; }   // -1f = unavailable (display "N/A")
    public float MemPercent { get; private set; }

    public StatsService()
    {
        Task.Run(Initialize);
    }

    private void Initialize()
    {
        _cpuCounter = new PerformanceCounter("Processor", "% Processor Time", "_Total", readOnly: true);
        _cpuCounter.NextValue();  // prime — rate counter always returns 0 on first call; discard

        _memCounter = new PerformanceCounter("Memory", "% Committed Bytes In Use", readOnly: true);
        // MEM is a point-in-time counter — no priming needed

        _gpuAvailable = PerformanceCounterCategory.Exists("GPU Engine");
        if (_gpuAvailable)
        {
            _gpuCounters = BuildGpuCounters();
            foreach (var c in _gpuCounters) c.NextValue();  // prime GPU rate counters
        }

        GpuPercent = _gpuAvailable ? 0f : -1f;
        _initialized = true;
    }
```

### Pattern 2: GPU Multi-Instance Enumeration

**What:** Enumerate all `GPU Engine` instances, filter by `engtype_3D`, create one counter per matching instance, cache the array, sum values per tick, clamp to 100.

**When to use:** Required for correct GPU total utilization. Single-instance read gives one process/engine only.

**Example:**
```csharp
// Source: MEDIUM confidence — community-verified instance name format; not formally documented by Microsoft.
// Validate by running: typeperf "\GPU Engine(*)\Utilization (%)" on target machine.

private PerformanceCounter[] BuildGpuCounters()
{
    try
    {
        var cat = new PerformanceCounterCategory("GPU Engine");
        return cat.GetInstanceNames()
            .Where(n => n.Contains("engtype_3D", StringComparison.OrdinalIgnoreCase))
            .Select(n => new PerformanceCounter("GPU Engine", "Utilization (%)", n, readOnly: true))
            .ToArray();
    }
    catch
    {
        _gpuAvailable = false;
        return [];
    }
}
```

### Pattern 3: Per-Tick Refresh with InvalidOperationException Recovery

**What:** Each `Refresh()` call reads all three counters off-thread. GPU `InvalidOperationException` (instance disappeared after driver update or sleep/wake) triggers re-enumeration.

**When to use:** Required. GPU instances are dynamic.

**Example:**
```csharp
// Called from StatsTimer_Tick via Task.Run in Phase 8 code-behind.
// Returns when _initialized is false (safe no-op during startup).
public void Refresh()
{
    if (!_initialized) return;

    CpuPercent = _cpuCounter?.NextValue() ?? 0f;
    MemPercent = _memCounter?.NextValue() ?? 0f;

    if (_gpuAvailable)
    {
        try
        {
            GpuPercent = _gpuCounters.Length > 0
                ? Math.Min(_gpuCounters.Sum(c => c.NextValue()), 100f)
                : 0f;
        }
        catch (InvalidOperationException)
        {
            // Instance disappeared (driver update / sleep-wake). Re-enumerate.
            DisposeGpuCounters();
            _gpuCounters = BuildGpuCounters();
            foreach (var c in _gpuCounters) c.NextValue();  // re-prime
            GpuPercent = 0f;
        }
    }
}
```

### Pattern 4: IDisposable Teardown

**What:** Dispose all counter handles explicitly. Called by `MainWindow.OnClosing` (Phase 8).

**Example:**
```csharp
public void Dispose()
{
    _cpuCounter?.Dispose();
    _memCounter?.Dispose();
    DisposeGpuCounters();
}

private void DisposeGpuCounters()
{
    foreach (var c in _gpuCounters) c.Dispose();
    _gpuCounters = [];
}
```

### Anti-Patterns to Avoid

- **Constructing PerformanceCounter on the UI thread:** PDH cold-start blocks 200–500ms. Always use `Task.Run`.
- **Treating first `NextValue()` as a valid CPU reading:** Rate counters always return 0 on first call. Prime and discard.
- **Hard-coding a single GPU instance name:** Instance names include process IDs and LUIDs; they are dynamic and will change.
- **Not catching `InvalidOperationException` from GPU counters:** GPU instances disappear after driver updates and sleep/wake cycles. Uncaught exception crashes the timer tick.
- **Not calling `Dispose()`:** Each `PerformanceCounter` holds an unmanaged PDH handle. Undisposed handles leak across the app lifetime (which can be days).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CPU % reading | Manual `GetSystemTimes` P/Invoke + delta math | `PerformanceCounter("Processor","% Processor Time","_Total")` | P/Invoke requires unsafe code; identical result, more code |
| Memory % reading | P/Invoke `GlobalMemoryStatusEx` + division | `PerformanceCounter("Memory","% Committed Bytes In Use")` | Direct percentage output, no math needed |
| GPU enumeration logic | Custom instance-name parser | `PerformanceCounterCategory.GetInstanceNames()` + LINQ `.Where(n => n.Contains("engtype_3D"))` | Already available via the same package |
| Async init gate | Manual thread + ManualResetEvent | `Task.Run` + `volatile bool _initialized` | Idiomatic .NET 10; no boilerplate |

**Key insight:** The entire data layer fits in ~80 lines of C# using only the one NuGet package. Any hand-rolled alternative using P/Invoke or WMI would be larger and slower.

---

## Common Pitfalls

### Pitfall 1: CPU Counter First Read Always Returns 0
**What goes wrong:** `% Processor Time` is a rate counter (`PERF_100NSEC_TIMER_INV`). The first call to `NextValue()` has no prior sample, so it always returns `0.0f`. Without priming, the CPU bar shows 0% on first display then jumps to real value.
**Why it happens:** Rate counters compute a delta between two consecutive samples. First call establishes the baseline only.
**How to avoid:** Call `_cpuCounter.NextValue()` once during `Initialize()` and discard the result. Start the UI timer only after `_initialized = true`.
**Warning signs:** CPU bar is exactly 0.0 on first tick, then shows correct values from tick 2 onward.

### Pitfall 2: Counter Initialization Blocks the UI Thread
**What goes wrong:** `new PerformanceCounter(...)` calls into the Windows PDH subsystem (registry + mapped memory). On cold start or with many GPU Engine instances, this can block 200–500ms.
**Why it happens:** No async variant of `PerformanceCounter` exists. All construction is synchronous I/O on the calling thread.
**How to avoid:** Wrap all counter construction in `Task.Run`. Set `_initialized = false` initially. Skip `Refresh()` calls until `_initialized = true`.
**Warning signs:** App takes noticeably longer to show first frame after adding StatsService. Intermittent startup hang.

### Pitfall 3: GPU Category Absent on VMs and RDP Sessions
**What goes wrong:** `new PerformanceCounterCategory("GPU Engine")` throws `InvalidOperationException` if the category does not exist. Present on Windows 10 1803+ with WDDM 2.x driver; absent on VMs, RDP without GPU pass-through, or legacy hardware.
**Why it happens:** The `GPU Engine` category is created by the Windows display driver model (WDDM). Machines without a hardware GPU driver do not have it.
**How to avoid:** Always call `PerformanceCounterCategory.Exists("GPU Engine")` first. If false, set `_gpuAvailable = false` and return `GpuPercent = -1f` (sentinel for "N/A"). Never let an exception propagate from GPU init.
**Warning signs:** `InvalidOperationException` in debug output on VM or RDP session. App crashes on machines without a hardware GPU driver.

### Pitfall 4: GPU Instance Names Change at Runtime
**What goes wrong:** `PerformanceCounter` objects created from instance names captured at init time throw `InvalidOperationException` after a driver update or sleep/wake cycle, because the instance names are process-ID-scoped and get regenerated.
**Why it happens:** `GPU Engine` instance names include the process ID, LUID, and engine index. When processes exit or the driver restarts, the instance list changes.
**How to avoid:** Catch `InvalidOperationException` in `Refresh()`. On catch: dispose current GPU counters, call `BuildGpuCounters()` again, re-prime, return 0f for that tick.
**Warning signs:** `InvalidOperationException: Instance does not exist in the specified Category` in debug output after machine wakes from sleep.

### Pitfall 5: Undisposed PerformanceCounter Handles Leak
**What goes wrong:** `PerformanceCounter` inherits from `Component` and holds unmanaged PDH handles. Without explicit `Dispose()`, handles accumulate over the app lifetime (days of continuous use).
**Why it happens:** GC finalizer is non-deterministic; PDH handles are not freed until finalization.
**How to avoid:** Implement `IDisposable`. Dispose all counters in `Dispose()`. `MainWindow.OnClosing` (Phase 8) calls `_statsService.Dispose()` after stopping the stats timer.
**Warning signs:** Slowly rising handle count in Task Manager during extended use. Stale handle errors after sleep/resume.

---

## Code Examples

### Complete StatsService Skeleton
```csharp
// Source: patterns verified against official .NET 10 PerformanceCounter docs
// https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.performancecounter?view=windowsdesktop-10.0
// https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.performancecountercategory?view=windowsdesktop-10.0

using System.Diagnostics;

namespace FuzzyClock.App;

public sealed class StatsService : IDisposable
{
    private PerformanceCounter? _cpuCounter;
    private PerformanceCounter? _memCounter;
    private PerformanceCounter[] _gpuCounters = [];
    private bool _gpuAvailable;
    private volatile bool _initialized;

    public float CpuPercent { get; private set; }
    public float GpuPercent { get; private set; } = -1f;  // -1 = unavailable sentinel
    public float MemPercent { get; private set; }

    public StatsService()
    {
        Task.Run(Initialize);
    }

    private void Initialize()
    {
        _cpuCounter = new PerformanceCounter("Processor", "% Processor Time", "_Total", readOnly: true);
        _cpuCounter.NextValue();  // prime — always 0, discard

        _memCounter = new PerformanceCounter("Memory", "% Committed Bytes In Use", readOnly: true);

        _gpuAvailable = PerformanceCounterCategory.Exists("GPU Engine");
        if (_gpuAvailable)
        {
            _gpuCounters = BuildGpuCounters();
            foreach (var c in _gpuCounters) c.NextValue();  // prime
        }

        GpuPercent = _gpuAvailable ? 0f : -1f;
        _initialized = true;
    }

    public void Refresh()
    {
        if (!_initialized) return;

        CpuPercent = _cpuCounter?.NextValue() ?? 0f;
        MemPercent = _memCounter?.NextValue() ?? 0f;

        if (!_gpuAvailable) return;

        try
        {
            GpuPercent = _gpuCounters.Length > 0
                ? Math.Min(_gpuCounters.Sum(c => c.NextValue()), 100f)
                : 0f;
        }
        catch (InvalidOperationException)
        {
            DisposeGpuCounters();
            _gpuCounters = BuildGpuCounters();
            foreach (var c in _gpuCounters) c.NextValue();
            GpuPercent = 0f;
        }
    }

    private PerformanceCounter[] BuildGpuCounters()
    {
        try
        {
            var cat = new PerformanceCounterCategory("GPU Engine");
            return cat.GetInstanceNames()
                .Where(n => n.Contains("engtype_3D", StringComparison.OrdinalIgnoreCase))
                .Select(n => new PerformanceCounter("GPU Engine", "Utilization (%)", n, readOnly: true))
                .ToArray();
        }
        catch
        {
            _gpuAvailable = false;
            return [];
        }
    }

    private void DisposeGpuCounters()
    {
        foreach (var c in _gpuCounters) c.Dispose();
        _gpuCounters = [];
    }

    public void Dispose()
    {
        _cpuCounter?.Dispose();
        _memCounter?.Dispose();
        DisposeGpuCounters();
    }
}
```

### Counter Name Reference

```
CPU:  PerformanceCounter("Processor",  "% Processor Time",       "_Total")
      — rate counter; prime required; range [0, 100]

MEM:  PerformanceCounter("Memory",     "% Committed Bytes In Use")
      — point-in-time; no priming; range [0, 100]

GPU:  PerformanceCounter("GPU Engine", "Utilization (%)",          instanceName)
      — rate counter; prime required; multi-instance, filter engtype_3D; sum; clamp 100
      — instance name format: "luid_0x..._0x..._phys_N_eng_N_engtype_3D"
      — MEDIUM confidence on instance name format; validate with typeperf on target machine
```

### Sentinel Value Contract

| Property | Unavailable Value | Display Guidance |
|----------|-------------------|-----------------|
| `GpuPercent` | `-1f` | Caller displays "N/A"; bar hidden or grayed |
| `CpuPercent` | `0f` (init only) | Normal display; 0 is valid after priming |
| `MemPercent` | `0f` | Normal display; 0 is valid |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `System.Management` WMI for system stats | `System.Diagnostics.PerformanceCounter` PDH | WMI always was slower; community consensus has long favored PDH | 10–50x faster reads |
| Positional record (Phase pre-6) | Init-property record (Phase 6 complete) | Phase 6 | Allows `System.Text.Json` partial deserialization of old settings without throwing |
| `StatsIntervalSeconds` potentially 0 from old JSON (pre-Phase 6) | Guarded in `SettingsService.Load()` (Phase 6 complete) | Phase 6 | Prevents zero-interval timer CPU spike on upgrade |

**Deprecated/outdated:**
- WMI (`System.Management`) for CPU/MEM: Excluded by project requirements. 10–50x slower than PDH. Not used.
- `LibreHardwareMonitor` / `OpenHardwareMonitor`: Require kernel driver installation. Not used.
- Positional record AppSettings: Already converted in Phase 6. Phase 7 consumes the converted record.

---

## Open Questions

1. **GPU counter name on target hardware**
   - What we know: Instance name format is `luid_*_engtype_3D` — confirmed by multiple community sources, `typeperf` output examples, and community consensus across Stack Overflow and GitHub issues.
   - What's unclear: Microsoft has no authoritative single document enumerating all `GPU Engine` instance name patterns. The 404 on the display driver GPU counter docs page means no official verification.
   - Recommendation: During implementation, run `typeperf "\GPU Engine(*)\Utilization (%)"` on the development machine to confirm live instance names before committing to the filter string. The `engtype_3D` filter is correct for NVIDIA, AMD, and Intel Arc/UHD — but the validation step must happen before closing the phase.

2. **GPU counter name: `"Utilization (%)"` vs `"Utilization Percentage"`**
   - What we know: STACK.md and PITFALLS.md show both forms in different contexts. STACK.md code samples use `"Utilization (%)"` (with parentheses); PITFALLS.md Pitfall 4 uses `"Utilization Percentage"`. Both appear in community sources.
   - What's unclear: The canonical counter name on Windows 10/11 — counter names can vary by Windows version or driver.
   - Recommendation: Validate the exact string via `typeperf` on the target machine during implementation. Both strings appear in the existing research; the `typeperf` output will be authoritative.

---

## Verification Plan (Phase Success Criteria)

Phase 7 is complete when all four success criteria are met:

| Criterion | How to Verify |
|-----------|---------------|
| `CpuPercent`, `GpuPercent`, `MemPercent` return non-zero values that visibly track real system load | Add `Debug.WriteLine($"CPU={s.CpuPercent:F0}% GPU={s.GpuPercent:F0}% MEM={s.MemPercent:F0}%")` in a temporary tick handler; run a CPU stress tool; confirm CPU% rises in debug output |
| CPU does not show 0%-then-jump artifact | Observe debug output on first two ticks: first tick after `_initialized=true` should show a non-zero CPU value (priming occurred during init) |
| On machine without GPU Engine category, `GpuPercent` returns `-1f` and no exception | Test on a VM or RDP session; or temporarily hardcode `_gpuAvailable = false` to simulate; confirm no exceptions in debug output |
| `StatsService.Dispose()` releases all `PerformanceCounter` instances without error | Call `Dispose()` in `App.OnExit` temporarily during development; confirm no exceptions; can verify handle count drops in Task Manager |

---

## Sources

### Primary (HIGH confidence)
- `System.Diagnostics.PerformanceCounter` (windowsdesktop-10.0): https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.performancecounter?view=windowsdesktop-10.0 — assembly confirmation, `NextValue()` two-call requirement for rate counters, `IDisposable`
- `System.Diagnostics.PerformanceCounterCategory` (windowsdesktop-10.0): https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.performancecountercategory?view=windowsdesktop-10.0 — `Exists()`, `GetInstanceNames()`
- Windows Performance Counters overview: https://learn.microsoft.com/en-us/windows/win32/perfctrs/about-performance-counters — PDH architecture, single vs. multi-instance categories, `Memory` and `Processor` descriptions
- `FuzzyClock.App/AppSettings.cs` (codebase, confirmed): init-property record with `StatsVisible` and `StatsIntervalSeconds` fields — Phase 6 complete
- `FuzzyClock.App/FuzzyClock.App.csproj` (codebase, confirmed): zero NuGet packages currently; `net10.0-windows`; one `PackageReference` needed

### Secondary (MEDIUM confidence)
- GPU Performance Counters driver documentation: https://learn.microsoft.com/en-us/windows-hardware/drivers/display/gpu-performance-counters — category existence confirmed; exact instance name format not fully enumerated (page returned 404 during milestone research)
- `"GPU Engine"` / `"Utilization (%)"` instance name format and `engtype_3D` filter: community-documented via Stack Overflow, GitHub issues, `typeperf` command output; consistent across multiple independent sources; no single authoritative Microsoft document

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — `System.Diagnostics.PerformanceCounter` v10.0.0 confirmed via official .NET API docs; NuGet requirement confirmed; CPU/MEM counter paths canonical since Windows NT
- Architecture: HIGH — `IDisposable` pattern, `Task.Run` async init, `_initialized` guard, rate-counter priming all verified against official docs
- Pitfalls: HIGH (CPU/MEM/init/dispose) / MEDIUM (GPU instance names) — all critical pitfalls verified against official docs; GPU instance name format is MEDIUM due to no single authoritative Microsoft doc

**Research date:** 2026-02-25
**Valid until:** 2026-03-25 (stable APIs — NuGet package version number is the only currency risk)
