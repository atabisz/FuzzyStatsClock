// Source: patterns verified against official .NET 10 PerformanceCounter docs
// https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.performancecounter?view=windowsdesktop-10.0
// https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.performancecountercategory?view=windowsdesktop-10.0
// GPU counter name "Utilization Percentage" validated via typeperf on target machine (2026-02-25).
using System.Diagnostics;

namespace FuzzyClock.App;

public sealed class StatsService : IDisposable
{
    private PerformanceCounter? _cpuCounter;
    private PerformanceCounter? _memCounter;
    private PerformanceCounter[] _gpuCounters = [];
    private bool _gpuAvailable;
    private PerformanceCounter? _pagCounter;
    private bool _pagAvailable;
    private volatile bool _initialized;

    public float CpuPercent { get; private set; }
    public float GpuPercent { get; private set; } = -1f;  // -1f = unavailable sentinel (display "N/A")
    public float MemPercent { get; private set; }
    public float PagPercent { get; private set; } = -1f;  // -1f = unavailable sentinel (display "N/A")
    public bool IsReady => _initialized;
    // volatile bool: safe to read from Dispatcher thread — always sees latest committed value.
    // Environment.TickCount64 on .NET 10/Windows includes suspend/hibernate time.
    // Deliberate choice over WMI LastBootUpTime: zero COM overhead, sub-microsecond.
    // NOTE: .NET 11 breaking change — TickCount64 will EXCLUDE suspend time on .NET 11+.
    // See: https://learn.microsoft.com/en-us/dotnet/core/compatibility/core-libraries/11/environment-tickcount-windows-behavior

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

        _pagAvailable = PerformanceCounterCategory.Exists("Paging File");
        if (_pagAvailable)
        {
            try
            {
                // 4-param constructor required: "Paging File" is multi-instance.
                // DO NOT use the 3-param (string, string, bool) overload — it throws for multi-instance categories.
                // "% Usage" is a point-in-time ratio counter — no priming needed.
                _pagCounter = new PerformanceCounter("Paging File", "% Usage", "_Total", readOnly: true);
            }
            catch
            {
                _pagAvailable = false;
            }
        }
        PagPercent = _pagAvailable ? 0f : -1f;

        _gpuAvailable = PerformanceCounterCategory.Exists("GPU Engine");
        if (_gpuAvailable)
        {
            _gpuCounters = BuildGpuCounters();
            foreach (var c in _gpuCounters) c.NextValue();  // prime GPU rate counters
        }

        GpuPercent = _gpuAvailable ? 0f : -1f;
        _initialized = true;  // MUST be last — guards all Refresh() reads
    }

    public void Refresh()
    {
        if (!_initialized) return;  // safe no-op during startup

        CpuPercent = _cpuCounter?.NextValue() ?? 0f;
        MemPercent = _memCounter?.NextValue() ?? 0f;

        if (_pagAvailable)
        {
            try
            {
                PagPercent = _pagCounter?.NextValue() ?? 0f;
            }
            catch
            {
                _pagAvailable = false;
                PagPercent = -1f;
            }
        }

        if (!_gpuAvailable) return;

        try
        {
            GpuPercent = _gpuCounters.Length > 0
                ? Math.Min(_gpuCounters.Sum(c => c.NextValue()), 100f)
                : 0f;
        }
        catch (InvalidOperationException)
        {
            // GPU instance disappeared (driver update / sleep-wake). Re-enumerate.
            DisposeGpuCounters();
            _gpuCounters = BuildGpuCounters();
            foreach (var c in _gpuCounters) c.NextValue();  // re-prime
            GpuPercent = 0f;
        }
    }

    private PerformanceCounter[] BuildGpuCounters()
    {
        // Counter name "Utilization Percentage" validated via typeperf on development machine (2026-02-25).
        // Instance names are process-ID-scoped (e.g., "luid_0x..._phys_N_eng_N_engtype_3D") — dynamic at runtime.
        try
        {
            var cat = new PerformanceCounterCategory("GPU Engine");
            return cat.GetInstanceNames()
                .Where(n => n.Contains("engtype_3D", StringComparison.OrdinalIgnoreCase))
                .Select(n => new PerformanceCounter("GPU Engine", "Utilization Percentage", n, readOnly: true))
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
        _pagCounter?.Dispose();
        DisposeGpuCounters();
    }
}
