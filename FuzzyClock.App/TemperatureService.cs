// LibreHardwareMonitor integration. API surface verified against 0.9.6 ref assembly.
// https://github.com/LibreHardwareMonitor/LibreHardwareMonitor
//
// Spike (Plan 75-01) measured Update() mean 608.2ms on dev box → D-05 Path 2
// (dedicated background task); piggybacking the stats timer would block the
// Dispatcher for >600ms per tick. See .planning/spikes/75-hardware-discovery.md.
//
// Silent-failure posture (D-14): no Console/Debug/EventLog on init failure.
// Sentinel convention (D-12): -1f means "unavailable"; properties are float, not float?.
// Three-tier dispose (D-15): OnClosing + SessionEnding + AppDomain.ProcessExit,
// guarded by a single Interlocked.CompareExchange on an int _disposed flag.
using System.Threading;
using LibreHardwareMonitor.Hardware;

namespace FuzzyClock.App;

// NOT sealed: test-only subclasses in FuzzyClock.App.Tests override InitializeCore
// (the sole virtual seam) to inject timeout / throw / no-op init behaviour without
// touching a real LHM Computer handle. Production code should treat this as sealed —
// the only other subclass of this type should be in the test assembly.
internal class TemperatureService : ITempSource, IDisposable
{
    // Priority lists seeded from 75-RESEARCH §4.1 and extended from spike output.
    // GPU: the spike confirmed both "GPU Core" and "GPU Hot Spot" readable on the
    // NVIDIA A2000 — keeping "GPU Core" first matches the research seed.
    private static readonly string[] CpuSensorPriority =
        { "CPU Package", "Core (Tctl/Tdie)", "Core Max", "CPU Core #1" };
    private static readonly string[] GpuSensorPriority =
        { "GPU Core", "GPU Hot Spot", "GPU Temperature" };
    private static readonly string[] MoboSensorPriority =
        { "System", "Motherboard", "CPU", "Chipset" };
    private static readonly string[] NvmeSensorPriority =
        { "Temperature", "Composite" };

    // Stateless visitor — allocate once, reuse for every Update() tick.
    private static readonly IVisitor _updateVisitor = new UpdateVisitor();

    private Computer? _computer;
    private ISensor? _cpuSensor, _gpuSensor, _moboSensor, _nvmeSensor;

    // volatile — StatsService pattern; guards every Refresh() read on Dispatcher thread.
    // MUST be set last in InitializeAsync (success OR failure path) so callers see
    // a consistent "initialization complete" signal regardless of outcome.
    private volatile bool _initialized;

    // True only on successful Computer.Open() + ResolveAllSensors(); false on
    // timeout / throw. Refresh() short-circuits when this is false.
    private volatile bool _lhmAvailable;

    // When a cached sensor's Value flips to null (driver update / sleep-wake),
    // request a re-resolve on the next Refresh(). Set from ReadCachedSensors and
    // from the Update() try/catch. Cleared at the top of the re-resolve branch.
    private volatile bool _sensorTreeStale;

    // Interlocked guard for single-entry dispose across three tiers
    // (OnClosing + SessionEnding + ProcessExit). int (not bool) — Interlocked has no bool overload.
    private int _disposed;

    // Test-visible close counter: incremented inside the Dispose try/catch
    // around _computer?.Close(). Read by Dispose_* idempotency tests via
    // InternalsVisibleTo on FuzzyClock.App.Tests.
    internal int CloseCallCount;

    // Path 2 threading (chosen per spike §7): dedicated background task that
    // sleeps TemperatureService.BackgroundLoopIntervalMs between Update() calls.
    // Cancelled on Dispose; Wait(500ms) gives the current Update() a chance to
    // finish before Computer.Close() releases the driver handle.
    internal const int BackgroundLoopIntervalMs = 2000;
    internal const int DisposeWaitMs = 500;
    private CancellationTokenSource? _cts;
    private Task? _backgroundTask;

    // Cached values exposed via ITempSource. All default to the -1f sentinel;
    // ReadCachedSensors overwrites with the sensor's current Value (or -1f if null).
    public float CpuTempC  { get; private set; } = -1f;
    public float GpuTempC  { get; private set; } = -1f;
    public float MoboTempC { get; private set; } = -1f;
    public float NvmeTempC { get; private set; } = -1f;
    public bool  IsReady   => _initialized;

    public TemperatureService()
    {
        // Fire-and-forget async init (StatsService parity). Constructor returns
        // immediately; _initialized flips true inside InitializeAsync once the
        // timeout-or-complete race settles.
        _ = InitializeAsync();
    }

    // Spike (Plan 75-01) measured Computer.Open() at 4272ms on the dev box; the
    // original 3s timeout (TEMP-SVC-03 pre-amendment) would have silent-failed on
    // every startup. Amended 2026-05-04 to 5s. If Open exceeds 5s the service
    // enters silent-failure mode (IsReady=true, _lhmAvailable=false, all temps -1f).
    internal const int InitTimeoutSeconds = 5;

    private async Task InitializeAsync()
    {
        try
        {
            var initTask = Task.Run(InitializeCore);
            var timeoutTask = Task.Delay(TimeSpan.FromSeconds(InitTimeoutSeconds));
            var finished = await Task.WhenAny(initTask, timeoutTask).ConfigureAwait(false);

            if (finished == timeoutTask)
            {
                _lhmAvailable = false;   // silent per D-14 — widget continues with sentinels
            }
            else
            {
                try { await initTask.ConfigureAwait(false); }
                catch { _lhmAvailable = false; }
            }
        }
        catch
        {
            _lhmAvailable = false;
        }
        finally
        {
            _initialized = true;   // volatile write MUST be the last thing we do
        }
    }

    // Virtual so tests can inject timeout/throw behaviour via a subclass seam
    // (TestableTemperatureService in TemperatureServiceTests.cs overrides this).
    protected virtual void InitializeCore()
    {
        _computer = new Computer
        {
            // Exactly the four flags called out in STACK.md. All others stay false.
            IsCpuEnabled = true,
            IsGpuEnabled = true,
            IsMotherboardEnabled = true,
            IsStorageEnabled = true,
        };
        _computer.Open();
        ResolveAllSensors();
        _lhmAvailable = true;

        _cts = new CancellationTokenSource();
        _backgroundTask = Task.Run(() => BackgroundLoop(_cts.Token));
    }

    // Walks the LHM hardware tree once and caches the resolved ISensor pointers
    // for CPU / GPU / Mobo / NVMe. GPU match spans all three GpuNvidia/GpuAmd/GpuIntel
    // HardwareType values; NVMe walks top-level + SubHardware per 75-RESEARCH §4.2.
    private void ResolveAllSensors()
    {
        if (_computer is null) return;

        _cpuSensor = null;
        _gpuSensor = null;
        _moboSensor = null;
        _nvmeSensor = null;

        foreach (var hw in _computer.Hardware)
        {
            switch (hw.HardwareType)
            {
                case HardwareType.Cpu:
                    _cpuSensor ??= ResolveFromHardware(hw, CpuSensorPriority);
                    break;
                case HardwareType.GpuNvidia:
                case HardwareType.GpuAmd:
                case HardwareType.GpuIntel:
                    _gpuSensor ??= ResolveFromHardware(hw, GpuSensorPriority);
                    break;
                case HardwareType.Motherboard:
                    _moboSensor ??= ResolveFromHardware(hw, MoboSensorPriority);
                    break;
                case HardwareType.Storage:
                    _nvmeSensor ??= ResolveNvmeSensor(hw);
                    break;
            }
        }
    }

    // Extracted static helper so resolution can be exercised by tests without
    // constructing a real Computer. Priority match is case-insensitive; fallback
    // per D-08 is the first SensorType.Temperature on the hardware.
    internal static ISensor? ResolveFromHardware(IHardware hw, string[] priority)
    {
        foreach (var name in priority)
        {
            var s = hw.Sensors.FirstOrDefault(x =>
                x.SensorType == SensorType.Temperature &&
                string.Equals(x.Name, name, StringComparison.OrdinalIgnoreCase));
            if (s is not null) return s;
        }
        return hw.Sensors.FirstOrDefault(x => x.SensorType == SensorType.Temperature);
    }

    // NVMe lives under HardwareType.Storage — check top-level first, then walk
    // SubHardware (per 75-RESEARCH §4.2). The spike found Storage absent entirely
    // on the dev box; this path stays defensive so the resolver returns null
    // silently rather than throwing.
    internal static ISensor? ResolveNvmeSensor(IHardware storageHw)
    {
        var top = ResolveFromHardware(storageHw, NvmeSensorPriority);
        if (top is not null) return top;

        foreach (var sub in storageHw.SubHardware)
        {
            var nested = ResolveFromHardware(sub, NvmeSensorPriority);
            if (nested is not null) return nested;
        }
        return null;
    }

    // D-12 boundary translation: LHM's float? → our float -1f sentinel.
    internal static float ToSentinel(float? value) => value ?? -1f;

    // Path 2 public Refresh is a no-op; the background loop owns the cadence.
    public void Refresh()
    {
        // Deliberate no-op. Background loop sleeps 2s between Update() calls.
        // Callers (MainWindow stats timer tick) read the cached *TempC properties
        // directly; they never need to block on an LHM Update().
    }

    private async Task BackgroundLoop(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            // _lhmAvailable gate: skip Update() if init ever flipped us back to
            // false. Under normal flow it stays true for the life of the task
            // (InitializeCore sets it true before spawning this loop), but the
            // guard is cheap and keeps the invariant explicit.
            if (_lhmAvailable)
            {
                try
                {
                    _computer?.Accept(_updateVisitor);
                    ReadCachedSensors();
                }
                catch
                {
                    _sensorTreeStale = true;   // silent per D-14
                }
            }

            try
            {
                await Task.Delay(TimeSpan.FromMilliseconds(BackgroundLoopIntervalMs), ct)
                          .ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    // Reads Value off the four cached sensors, applies the -1f sentinel, and sets
    // _sensorTreeStale if any previously-resolved sensor now reports a null Value
    // (driver update / hot-unplug — triggers re-resolve on the next call).
    private void ReadCachedSensors()
    {
        CpuTempC  = ToSentinel(_cpuSensor?.Value);
        GpuTempC  = ToSentinel(_gpuSensor?.Value);
        MoboTempC = ToSentinel(_moboSensor?.Value);
        NvmeTempC = ToSentinel(_nvmeSensor?.Value);

        if ((_cpuSensor  is not null && _cpuSensor.Value  is null) ||
            (_gpuSensor  is not null && _gpuSensor.Value  is null) ||
            (_moboSensor is not null && _moboSensor.Value is null) ||
            (_nvmeSensor is not null && _nvmeSensor.Value is null))
        {
            _sensorTreeStale = true;
        }

        if (_sensorTreeStale)
        {
            _sensorTreeStale = false;
            try { ResolveAllSensors(); } catch { /* silent per D-14 */ }
        }
    }

    // D-15 three-tier dispose single-entry guard. Interlocked.CompareExchange
    // returns the ORIGINAL value of _disposed; if it wasn't 0 the caller is a
    // second-or-later entry and we bail immediately. close-count is kept for tests.
    public void Dispose()
    {
        if (Interlocked.CompareExchange(ref _disposed, 1, 0) != 0) return;

        try { _cts?.Cancel(); } catch { }
        try { _backgroundTask?.Wait(TimeSpan.FromMilliseconds(DisposeWaitMs)); } catch { }
        try { _cts?.Dispose(); } catch { }

        try
        {
            _computer?.Close();
            CloseCallCount++;
        }
        catch
        {
            // ProcessExit has a 2s COLLECTIVE budget — swallow any exception from
            // Close() so we never block process teardown.
        }
        _computer = null;
    }

    // Stateless visitor. VisitComputer walks every IHardware; VisitHardware calls
    // Update() then recurses into SubHardware (per 75-RESEARCH §2.3). VisitSensor
    // and VisitParameter are no-ops — we read sensor Values directly off the
    // cached pointers after the traversal completes.
    private sealed class UpdateVisitor : IVisitor
    {
        public void VisitComputer(IComputer computer) => computer.Traverse(this);
        public void VisitHardware(IHardware hardware)
        {
            hardware.Update();
            foreach (var sub in hardware.SubHardware) sub.Accept(this);
        }
        public void VisitSensor(ISensor sensor) { }
        public void VisitParameter(IParameter parameter) { }
    }
}
