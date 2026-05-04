# Phase 75: Hardware Discovery Spike + TemperatureService — Research

**Researched:** 2026-05-04
**Domain:** Windows hardware sensor ingestion via LibreHardwareMonitorLib 0.9.6 + singleton service lifecycle
**Confidence:** HIGH on architecture (StatsService is a 1:1 template); MEDIUM on LHM sensor names per vendor (gated by spike); HIGH on dispose pattern

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Spike Report**

- **D-01:** Report lives at `.planning/spikes/75-hardware-discovery.md` (new `.planning/spikes/` folder). Survives milestone archival; easy to reference from Phase 80 release docs. NOT inline in the phase plan.
- **D-02:** Go/no-go threshold: **GPU + NVMe both readable = GO**; otherwise a formal scope reduction is documented in the report and the roadmap is amended before Phase 76 proceeds. CPU and Mobo are bonuses (both gated by PawnIO per research).
- **D-03:** Hardware matrix: dev box only. Full LHM sensor tree + Name strings + `Update()` timing captured on the dev machine. Broader coverage deferred to crowdsourced user reports in a future milestone if needed.
- **D-04:** VM policy: **dev machine with PawnIO uninstalled** is an acceptable substitute for a fresh Win11 24H2 VM snapshot. Research establishes PawnIO absence is the sole axis that matters for "clean VM" emulation. The substitution MUST be documented in the report. This interprets SC1 of the roadmap (the "clean Win11 24H2 VM" requirement) — if a true clean-VM test later contradicts the spike, the milestone pauses.

**Refresh Cadence & Threading**

- **D-05:** Threading path is **decided in the spike, committed in the service**: if measured `Update()` latency on the dev box is <50 ms, the service piggybacks the existing stats timer with a single-entry lock; if ≥50 ms, the service owns a dedicated long-lived background task. The decision is recorded in the spike report and implemented in this phase — no config switch, no runtime flip.
- **D-06:** Minimum effective LHM refresh interval: **2 seconds**. During 0.5s hover fast-refresh, LHM `Update()` is skipped unless 2s has elapsed since the last successful update. Stats + uptime continue refreshing at the hover rate unchanged.
- **D-07:** If the background-thread path wins under D-05: use a **long-lived `Task.Run` + `CancellationToken`** that sleeps 2s between `Update()` calls and writes results to volatile fields. Cancellation triggered on dispose. No per-tick thread churn.

**Sensor Resolution**

- **D-08:** Resolution strategy: **priority-ordered name list per sensor kind + `SensorType.Temperature` fallback**. For each of CPU / GPU / Mobo / NVMe, walk a fixed priority list of known LHM `Name` strings (`"CPU Package"`, `"Core (Tctl/Tdie)"`, `"Core Max"`, etc.), then fall back to the first `SensorType.Temperature` sensor under the matching `HardwareType`. Matches FEATURES.md pseudocode.
- **D-09:** Priority lists expressed as **`private static readonly string[]`** per sensor kind, defined inline in `TemperatureService`. Compile-time constants; no JSON config, no per-vendor branches.
- **D-10:** Sensor cache strategy: **cache resolved `ISensor` refs on init; re-resolve on failure only**. Initialize walks the hardware tree once and caches the four `ISensor` references. Tick reads `.Value` from cached sensors. On null value / exception, trigger one re-walk of the tree (handles NVMe hot-removal, GPU driver update). Mirrors StatsService GPU counter re-enumeration.

**ITempSource Contract**

- **D-11:** Interface shape: `IsReady` + four `float` sensor properties (`CpuTempC`, `GpuTempC`, `MoboTempC`, `NvmeTempC`) + `Refresh()`. **No** per-sensor availability bools (encoded by `-1f` sentinel), **no** `IDisposable` on the interface itself (implementation concern).
- **D-12:** Sentinel for unavailable: **`-1f` on a `float` property** (not `float?`, not `null`). Matches `StatsService.GpuPercent` / `PagPercent` / `BatteryPercent` convention and TEMP-SVC-02.
- **D-13:** `FakeTempSource` lives in `FuzzyClock.App.Tests`. Constructor takes explicit values; `Refresh()` is a no-op; exposes mutable-during-test properties so tests can simulate NVMe hot-removal by flipping `NvmeTempC` to `-1f`.

**Initialization Failure UX**

- **D-14:** Init failure path (Task.Run timeout, `Computer.Open()` throws, etc.): **silent**. `IsReady=false`, all four properties stay at `-1f`. No log file, no tray balloon, no one-time notification. Matches v4.1 `BatteryPercent=-1f` / "no battery" steady-state. This is the expected posture on no-PawnIO systems, not an error.

**Dispose / Lifecycle**

- **D-15:** Three-tier dispose path: `MainWindow.OnClosing` + `Application.SessionEnding` + `AppDomain.ProcessExit`, all routed through a single `Dispose()` method on `TemperatureService` guarded by an `Interlocked.CompareExchange` single-entry flag. `Computer.Close()` must run exactly once per process, even on forced kill. `SessionEnding` is already wired in `App.xaml.cs:70` for settings save — the TempService dispose hooks into the same event.

### Claude's Discretion

- Exact `Interlocked` guard field name and placement inside `TemperatureService`
- Internal field layout (volatile vs lock-guarded mutable state for `CpuTempC` etc.)
- Whether `Refresh()` on the interface is called from the timer tick or from inside the service's own background loop (depends on D-05 outcome)
- Whether `ITempSource` lives in `FuzzyClock.App` or `FuzzyClock.Core` (research recommends App to keep Core LHM-free; planner confirms)
- Priority-list contents beyond the seed names — planner extends based on the spike output

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope. The main candidates for scope creep (Fahrenheit, per-core CPU, fan speeds, alerts, sensor picker, sparklines) are already explicitly deferred in `REQUIREMENTS.md` → Future Requirements / Out of Scope.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **TEMP-SVC-01** | Hardware-discovery spike on clean Win11 24H2 VM, no admin, no PawnIO, produces written report with per-sensor go/no-go | Section "Spike Methodology" — PawnIO uninstall + restore procedure, throwaway enumeration program, timing protocol, go/no-go threshold (GPU+NVMe). D-04 permits substituting dev box with PawnIO removed for VM. |
| **TEMP-SVC-02** | Singleton `TemperatureService` in `FuzzyClock.App`; `IsReady` + four `float` properties with `-1f` sentinel | Section "Service Architecture" — mirror of `StatsService`, volatile `_initialized`, `-1f` sentinel on the four public `float` properties, `ISensor.Value` (`float?`) → `-1f` translation at boundary. |
| **TEMP-SVC-03** | `Task.Run(Initialize)` cold start with 3s timeout; init failure keeps widget alive with N/A sentinels | Section "Service Architecture" — `Task.Run` + `Task.WaitAny(task, Task.Delay(3000))`; on timeout or throw, `_initialized=true` gate flips but `_lhmAvailable=false`; four properties stay `-1f`. Silent per D-14. |
| **TEMP-SVC-04** | Three-tier dispose (`OnClosing` + `SessionEnding` + `ProcessExit`) gated by `Interlocked` single-entry; `Computer.Close()` runs exactly once | Section "Dispose Pattern" — `Interlocked.CompareExchange(ref _disposed, 1, 0) != 0 ⇒ return`; three wiring sites; ProcessExit GC-rooting caveat; ProcessExit 2-second collective-timeout caveat. |
| **TEMP-SVC-05** | `ITempSource` abstraction + `FakeTempSource` enables hardware-free unit tests | Section "ITempSource Contract" — interface shape matches D-11 exactly; `FakeTempSource` in `FuzzyClock.App.Tests` with mutable public setters; all service tests take `ITempSource` (or wrap LHM behind an internal seam). |

</phase_requirements>

## 1. Executive Summary

Phase 75 splits into **two mechanically separate deliverables** sharing a single go/no-go gate:

- **Deliverable A — Hardware Discovery Spike.** A dated report at `.planning/spikes/75-hardware-discovery.md` (new folder) enumerating the full LHM sensor tree on the dev box with PawnIO uninstalled, recording single-call + steady-state `Update()` timing, and stamping a formal go/no-go decision (`GPU+NVMe readable = GO`; otherwise a documented scope reduction). The spike also chooses the service's threading path (<50ms → piggyback timer; ≥50ms → dedicated background task).
- **Deliverable B — TemperatureService.** A singleton in `FuzzyClock.App` that is a near-mechanical replication of `StatsService`: async init via `Task.Run(Initialize)` with a 3s timeout, volatile `_initialized` flag set LAST, cached `ISensor` refs, `-1f` sentinel on four `float` public properties, silent failure on init per D-14, and a three-tier dispose guarded by `Interlocked.CompareExchange` against a single `_disposed` int.

**The trickiest part is the three-tier dispose.** Windows delivers `OnClosing` on normal quit, `SessionEnding` on log-off / shutdown, and `ProcessExit` on `Application.Current.Shutdown()` plus some kill paths — but `ProcessExit` handlers share a ~2-second collective budget and are only invoked if the delegate is GC-rooted. The pattern below keeps the delegate rooted by binding to an instance method on the service held as a field on `MainWindow` (itself GC-rooted by WPF) and makes `Computer.Close()` fast and catch-all to stay within the budget. `Interlocked.CompareExchange(ref _disposed, 1, 0)` guarantees `Computer.Close()` runs exactly once even when all three tiers fire.

Secondary risk: sensor resolution. LHM sensor `Name` strings vary by vendor and driver. The service caches `ISensor` refs on init, reads `.Value` (which is `float?` in LHM) each tick, and re-walks the tree on null/exception. This handles NVMe hot-removal and GPU driver updates without restart. Seed priority lists for the four sensor kinds are in Section 4; the planner may extend them from the spike's enumeration output.

**Primary recommendation:** Write the spike first, capture the `Update()` timing number, pick the D-05 threading branch, then implement the service. Plans A and B can be written in parallel but executed in order inside Phase 75.

## 2. Spike Methodology (Plan A feed)

### 2.1 Report location and shape

- **Path:** `.planning/spikes/75-hardware-discovery.md` (create the `.planning/spikes/` folder; it will house future spikes)
- **Format:** Dated Markdown with six mandatory sections: Environment, Methodology, Full Sensor Tree (raw), Per-Kind Resolution Table (CPU / GPU / Mobo / NVMe), Update() Timing, Go/No-Go Decision

### 2.2 PawnIO uninstall + restore procedure

Per D-04, the dev box with PawnIO uninstalled is the substitute for a clean Win11 24H2 VM. Before uninstalling:

**Pre-uninstall capture (MANDATORY):**

```powershell
# Capture PawnIO installer source + version for re-install
Get-ChildItem "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall" |
  Where-Object { (Get-ItemProperty $_.PSPath).DisplayName -like "*PawnIO*" } |
  Select-Object DisplayName, DisplayVersion, Publisher, InstallLocation, UninstallString |
  Export-Csv -Path "C:\temp\pawnio-before.csv" -NoTypeInformation

# Record version to the spike report under Environment
sc.exe query pawnio | Tee-Object -FilePath "C:\temp\pawnio-service-before.txt"
```

**Uninstall:**

1. `Settings > Apps > Installed Apps > PawnIO > Uninstall` (or use the UninstallString from above)
2. Verify: `sc.exe query pawnio` should return `OpenService FAILED 1060: service does not exist`
3. Reboot (required — driver handles release)
4. Record uninstall timestamp in the spike report's Environment section

**Restore (MANDATORY after spike):**

1. Re-download from `https://pawnio.eu/` matching the captured version (or newer if the old is unavailable — note the version drift in the spike report)
2. Install via the vendor's signed MSI (one-time UAC prompt — this is out-of-band, not from FuzzyClock)
3. Reboot; verify `sc.exe query pawnio` shows `STATE : 4 RUNNING`
4. Record restore timestamp in the spike report

**Rationale:** Capturing the installer URL + version before uninstall guarantees the dev box can be restored even if `pawnio.eu` changes layout. The reboot boundary isolates driver handle lifetime from the measurement.

### 2.3 Throwaway enumeration program

Create a one-shot console app in a sibling folder that is NOT part of the solution (`./scratch/Enumerator/`). After the spike, delete it and reference only its output in the report.

```csharp
// scratch/Enumerator/Program.cs
// dotnet new console; dotnet add package LibreHardwareMonitorLib --version 0.9.6; dotnet run
using System;
using System.Diagnostics;
using LibreHardwareMonitor.Hardware;

var computer = new Computer
{
    IsCpuEnabled = true,
    IsGpuEnabled = true,
    IsMotherboardEnabled = true,
    IsStorageEnabled = true,
    // Leave everything else false — matches service-runtime posture
};

var sw = Stopwatch.StartNew();
computer.Open();
sw.Stop();
Console.WriteLine($"=== Computer.Open() took {sw.ElapsedMilliseconds} ms");

// Enumerate EVERYTHING once
foreach (var hw in computer.Hardware)
{
    WriteHardware(hw, depth: 0);
}

// Steady-state timing: 20 Update() calls, report mean + min + max
long[] timings = new long[20];
for (int i = 0; i < 20; i++)
{
    sw.Restart();
    computer.Accept(new UpdateVisitor());
    sw.Stop();
    timings[i] = sw.ElapsedMilliseconds;
}
Console.WriteLine($"=== Update() mean={timings.Average():F1} min={timings.Min()} max={timings.Max()} ms");

computer.Close();

static void WriteHardware(IHardware hw, int depth)
{
    var pad = new string(' ', depth * 2);
    Console.WriteLine($"{pad}[{hw.HardwareType}] {hw.Name}  (Id={hw.Identifier})");
    foreach (var s in hw.Sensors)
    {
        Console.WriteLine($"{pad}  - {s.SensorType,-12} Name=\"{s.Name}\" Value={s.Value?.ToString() ?? "null"}");
    }
    foreach (var sub in hw.SubHardware)
        WriteHardware(sub, depth + 1);
}

sealed class UpdateVisitor : IVisitor
{
    public void VisitComputer(IComputer c) => c.Traverse(this);
    public void VisitHardware(IHardware h) { h.Update(); foreach (var s in h.SubHardware) s.Accept(this); }
    public void VisitSensor(ISensor s) { }
    public void VisitParameter(IParameter p) { }
}
```

**Output requirements (paste verbatim into spike report under "Full Sensor Tree"):**

- Every `[HardwareType] Name` line
- Every sensor's `SensorType`, `Name`, raw `Value` (or `null`)
- SubHardware indented one level (NVMe drives appear as SubHardware under `HardwareType.Storage`)
- The `Computer.Open()` timing line
- The 20-iteration `Update()` mean / min / max line

**Anti-pattern:** Do NOT commit the scratch program — it's a throwaway. Only its captured output belongs in git (inside the spike report).

### 2.4 `Update()` timing protocol

Two numbers are required:

| Metric | How to measure | Why |
|--------|----------------|-----|
| **Cold-call cost** | First `Update()` after `Open()` (discard if it's an order of magnitude worse than steady state — LHM warms caches on first call) | Informs the 3s initialization timeout headroom |
| **Steady-state mean** | Mean of 20 consecutive `Update()` calls at 2s spacing, excluding the cold call | Informs D-05 threading branch: `<50ms ⇒ piggyback timer`, `≥50ms ⇒ background task` |

Record both in the report's "Update() Timing" section. The steady-state mean is the **decision input** for D-05.

### 2.5 Go/no-go decision and recording format

Per D-02, the threshold is **GPU readable AND NVMe readable**. Use this table in the report:

```markdown
## Go/No-Go Decision

| Sensor | Resolved via | Value seen | Status |
|--------|--------------|------------|--------|
| CPU    | {LHM Name or "no match"} | {value}°C or null | BONUS / READABLE / N/A |
| GPU    | {LHM Name or "no match"} | {value}°C or null | REQUIRED / READABLE / N/A |
| Mobo   | {LHM Name or "no match"} | {value}°C or null | BONUS / READABLE / N/A |
| NVMe   | {LHM Name or "no match"} | {value}°C or null | REQUIRED / READABLE / N/A |

**Decision (YYYY-MM-DD):** GO | NO-GO
**Rationale:** {one sentence}
**If NO-GO:** {linked scope reduction — amend ROADMAP.md Phase 76+ before proceeding}
```

If `GPU=READABLE AND NVMe=READABLE` the phase continues. Otherwise the milestone pauses; the planner amends `ROADMAP.md` (reduced sensor set) and `REQUIREMENTS.md` (TEMP-TAB-03 defaults change) before Phase 76 opens.

### 2.6 Spike anti-patterns to avoid (cherry-picked from PITFALLS)

| Don't | Why | Do |
|-------|-----|----|
| Run the spike with PawnIO still installed | Would show false sensors that disappear for users | Uninstall + reboot + verify service absent before measuring |
| Trust a single `Update()` call | First call warms caches; misleading | Measure mean of 20 at 2s spacing |
| Paste the raw LHM sensor tree into a plan | Planners encode vendor-specific names | Keep raw tree in spike report; planner derives priority lists from the names OBSERVED, seeding them with Section 4's list |
| Forget the restore | Dev box runs without PawnIO forever | Pre-capture version + URL, restore before closing the phase |
| Commit the scratch enumerator | Scratch code rots, confuses future readers | Keep in `./scratch/` (add to `.gitignore`), delete after |

## 3. Service Architecture (Plan B feed)

### 3.1 File layout and namespace

| File | Namespace | Accessibility |
|------|-----------|---------------|
| `FuzzyClock.App/TemperatureService.cs` | `FuzzyClock.App` | `internal sealed class` (matches StatsService posture; `InternalsVisibleTo("FuzzyClock.App.Tests")` already set) |
| `FuzzyClock.App/ITempSource.cs` | `FuzzyClock.App` | `public interface` (tests reference it from `FuzzyClock.App.Tests`) |
| `FuzzyClock.App.Tests/FakeTempSource.cs` | `FuzzyClock.App.Tests` | `public sealed class : ITempSource` |

**Layering decision (Claude's Discretion from D-11 / D-13):** `ITempSource` lives in `FuzzyClock.App`, NOT in `FuzzyClock.Core`. Rationale: Core is pure `net10.0` and LHM-free per REL-03. Moving `ITempSource` to Core adds zero value (no Core code consumes it) and would pull the test assembly into Core's test project where LHM references are forbidden. App is the correct home.

### 3.2 Field-by-field mirror of StatsService

Map `StatsService` → `TemperatureService` directly. Where StatsService uses rate counters with priming, TemperatureService uses `ISensor` refs (no priming concept — `ISensor.Value` is point-in-time).

| StatsService field | TemperatureService field | Purpose |
|--------------------|--------------------------|---------|
| `PerformanceCounter? _cpuCounter` | `ISensor? _cpuSensor` | Cached sensor ref; resolved once on init |
| `PerformanceCounter? _memCounter` | `ISensor? _gpuSensor` | — |
| `PerformanceCounter[] _gpuCounters` | `ISensor? _moboSensor` | — |
| `PerformanceCounter? _pagCounter` | `ISensor? _nvmeSensor` | — |
| `bool _gpuAvailable` (reused to trigger re-enumeration on InvalidOperationException) | `bool _sensorTreeStale` (volatile) | Triggers re-walk on next Refresh |
| `volatile bool _initialized` | `volatile bool _initialized` | Identical semantic — set LAST in Initialize |
| (n/a — PDH is always available) | `bool _lhmAvailable` | False on init timeout / throw; four properties stay `-1f` |
| (n/a) | `Computer? _computer` | Singleton LHM handle |
| (n/a) | `int _disposed` (for `Interlocked.CompareExchange`) | Single-entry dispose guard |

**Public surface (matches D-11 + D-12):**

```csharp
public float CpuTempC  { get; private set; } = -1f;
public float GpuTempC  { get; private set; } = -1f;
public float MoboTempC { get; private set; } = -1f;
public float NvmeTempC { get; private set; } = -1f;
public bool  IsReady   => _initialized;  // volatile read
public void  Refresh();                   // safe no-op until _initialized
public void  Dispose();                   // single-entry via Interlocked
```

No `IDisposable` on `ITempSource` (D-11); `Dispose()` lives on the concrete class. `MainWindow` holds a concrete `TemperatureService` (like it holds concrete `StatsService`) — not an `ITempSource`. Tests use `ITempSource` to inject `FakeTempSource` into consumers.

### 3.3 Initialize() with 3-second timeout

Per TEMP-SVC-03, initialization is async and bounded. StatsService uses a naked `Task.Run(Initialize)`; TemperatureService must wrap with a timeout. Two-layer pattern:

```csharp
public TemperatureService()
{
    _ = InitializeAsync();  // fire-and-forget; constructor returns immediately
}

private async Task InitializeAsync()
{
    try
    {
        var initTask = Task.Run(InitializeCore);           // CPU-bound LHM Open + walk
        var timeoutTask = Task.Delay(TimeSpan.FromSeconds(3));
        var finished = await Task.WhenAny(initTask, timeoutTask).ConfigureAwait(false);

        if (finished == timeoutTask)
        {
            // Silent timeout per D-14. _lhmAvailable stays false; four properties stay -1f.
            // initTask may still be running in the background — we accept the leak of
            // one Computer.Open() call because its result is unreachable.
            _lhmAvailable = false;
        }
        else
        {
            // initTask completed within 3s; surface any thrown exception as silent
            // failure (no throw propagation — D-14 silent posture).
            try { await initTask.ConfigureAwait(false); } catch { _lhmAvailable = false; }
        }
    }
    catch
    {
        _lhmAvailable = false;
    }
    finally
    {
        _initialized = true;  // volatile; MUST be last (same invariant as StatsService)
    }
}

private void InitializeCore()
{
    _computer = new Computer
    {
        IsCpuEnabled = true,
        IsGpuEnabled = true,
        IsMotherboardEnabled = true,
        IsStorageEnabled = true,
        // All others stay false — matches STACK recommendation
    };
    _computer.Open();
    ResolveAllSensors();   // see Section 4
    _lhmAvailable = true;
}
```

**Why `Task.WhenAny` instead of `Task.Wait(TimeSpan)`:** WhenAny does not throw on timeout; it returns which task won. Lets the timeout branch set `_lhmAvailable = false` silently per D-14 without an exception reaching the Dispatcher thread (TEMP-SVC-03 invariant).

**Why `_ = InitializeAsync()` (discard assignment):** matches StatsService's constructor-returns-immediately semantics. The async state machine is GC-rooted by the background task infrastructure until it completes.

### 3.4 Refresh() — two paths depending on D-05

The spike picks one path. Both paths are written here; the planner implements the chosen one and deletes the other.

#### Path 1: Piggyback stats timer (if spike shows `Update()` mean < 50ms)

```csharp
private readonly object _refreshLock = new();
private long _lastUpdateTicks;          // Environment.TickCount64
private const int MinRefreshIntervalMs = 2000;  // D-06

public void Refresh()
{
    if (!_initialized || !_lhmAvailable || _computer is null) return;

    // D-06: 2s floor even during 0.5s hover fast-refresh
    long now = Environment.TickCount64;
    if (now - _lastUpdateTicks < MinRefreshIntervalMs) return;

    // Single-entry lock: drop the tick if prior Update() still running
    if (!Monitor.TryEnter(_refreshLock)) return;
    try
    {
        _computer.Accept(_updateVisitor);  // static readonly field; see below
        ReadCachedSensors();
        _lastUpdateTicks = Environment.TickCount64;
    }
    catch
    {
        _sensorTreeStale = true;  // triggers re-walk on next successful Update
    }
    finally
    {
        Monitor.Exit(_refreshLock);
    }
}

private static readonly IVisitor _updateVisitor = new UpdateVisitor();  // stateless; allocate once
```

The existing stats timer tick calls `_temperatureService.Refresh()` after `_statsService.Refresh()`. No new timer, no new Dispatcher invocation.

#### Path 2: Dedicated background task (if spike shows `Update()` mean ≥ 50ms, per D-07)

```csharp
private CancellationTokenSource? _cts;
private Task? _backgroundTask;

// Inside InitializeCore, after _lhmAvailable = true:
_cts = new CancellationTokenSource();
_backgroundTask = Task.Run(() => BackgroundLoop(_cts.Token));

private async Task BackgroundLoop(CancellationToken ct)
{
    while (!ct.IsCancellationRequested)
    {
        try
        {
            _computer!.Accept(_updateVisitor);
            ReadCachedSensors();
        }
        catch
        {
            _sensorTreeStale = true;
        }

        try { await Task.Delay(TimeSpan.FromSeconds(2), ct).ConfigureAwait(false); }
        catch (OperationCanceledException) { break; }
    }
}

// In this branch, public Refresh() is a no-op — values refresh from the background loop.
public void Refresh() { /* no-op: background loop owns the cadence */ }
```

Dispose extends to cancel: `_cts?.Cancel(); _backgroundTask?.Wait(TimeSpan.FromMilliseconds(500));` before `_computer.Close()`. The 500ms join budget is important for the ProcessExit path (Section 6).

### 3.5 ReadCachedSensors() — nullable-to-sentinel translation (ISC-32)

`ISensor.Value` is `float?` (nullable). Service surfaces `float` with `-1f` sentinel (D-12). Translation is explicit at the boundary:

```csharp
private void ReadCachedSensors()
{
    CpuTempC  = _cpuSensor?.Value  ?? -1f;
    GpuTempC  = _gpuSensor?.Value  ?? -1f;
    MoboTempC = _moboSensor?.Value ?? -1f;
    NvmeTempC = _nvmeSensor?.Value ?? -1f;

    // D-10 re-resolve trigger: any sensor null after a successful Update = stale cache
    if (_cpuSensor is not null && _cpuSensor.Value is null) _sensorTreeStale = true;
    if (_gpuSensor is not null && _gpuSensor.Value is null) _sensorTreeStale = true;
    if (_moboSensor is not null && _moboSensor.Value is null) _sensorTreeStale = true;
    if (_nvmeSensor is not null && _nvmeSensor.Value is null) _sensorTreeStale = true;

    if (_sensorTreeStale)
    {
        _sensorTreeStale = false;
        try { ResolveAllSensors(); ReadCachedSensorsCore(); } catch { /* silent per D-14 */ }
    }
}

private void ReadCachedSensorsCore()  // no re-walk path
{
    CpuTempC  = _cpuSensor?.Value  ?? -1f;
    GpuTempC  = _gpuSensor?.Value  ?? -1f;
    MoboTempC = _moboSensor?.Value ?? -1f;
    NvmeTempC = _nvmeSensor?.Value ?? -1f;
}
```

**Volatile vs lock-guarded (Claude's Discretion from CONTEXT):** Under Path 1, the four `float` properties are written and read on the same Dispatcher thread — no volatile needed. Under Path 2, writes happen on the background task, reads happen on the Dispatcher thread — mark the four backing fields `volatile` or use `Volatile.Write` / `Volatile.Read`. `float` read/write is atomic on all supported .NET platforms (ECMA-335 §12.6.6), so tearing is not a concern; only ordering.

## 4. Sensor Resolution Algorithm

### 4.1 Seed priority lists (D-09: `private static readonly string[]` inline)

From FEATURES.md sensor naming convention. Planner extends these based on spike output.

```csharp
private static readonly string[] CpuSensorPriority =
{
    "CPU Package",           // Intel modern
    "Core (Tctl/Tdie)",      // AMD Ryzen 1xxx-3xxx
    "Core Max",              // AMD Ryzen 5xxx+ (sometimes)
    "CPU Core #1",           // older CPUs — last resort before SensorType fallback
};

private static readonly string[] GpuSensorPriority =
{
    "GPU Core",              // NVIDIA + AMD common
    "GPU Hot Spot",          // AMD RDNA
    "GPU Temperature",       // Intel Arc / iGPU
};

private static readonly string[] MoboSensorPriority =
{
    "System",                // most Super-I/O SIO chips
    "Motherboard",           // some WMI thermal zones
    "CPU",                   // EC-reported "CPU socket temp" — not package
    "Chipset",               // PCH
};

private static readonly string[] NvmeSensorPriority =
{
    "Temperature",           // standard NVMe SMART
    "Composite",              // NVMe SMART composite reading
};
```

### 4.2 Resolve walk — handles SubHardware for NVMe (ISC-16)

```csharp
private void ResolveAllSensors()
{
    if (_computer is null) return;

    _cpuSensor  = ResolveFirst(HardwareType.Cpu,         CpuSensorPriority);
    _gpuSensor  = ResolveFirstGpu();
    _moboSensor = ResolveFirst(HardwareType.Motherboard, MoboSensorPriority);
    _nvmeSensor = ResolveNvmeSensor();
}

private ISensor? ResolveFirst(HardwareType hwType, string[] priority)
{
    foreach (var hw in _computer!.Hardware)
    {
        if (hw.HardwareType != hwType) continue;

        // Priority-list match first
        foreach (var name in priority)
        {
            var s = hw.Sensors.FirstOrDefault(x =>
                x.SensorType == SensorType.Temperature &&
                string.Equals(x.Name, name, StringComparison.OrdinalIgnoreCase));
            if (s is not null) return s;
        }

        // D-08 fallback: first SensorType.Temperature under this hardware
        var fallback = hw.Sensors.FirstOrDefault(x => x.SensorType == SensorType.Temperature);
        if (fallback is not null) return fallback;
    }
    return null;
}

private ISensor? ResolveFirstGpu()
{
    // GPU spans three HardwareType enum values — try all three
    foreach (var hwType in new[] { HardwareType.GpuNvidia, HardwareType.GpuAmd, HardwareType.GpuIntel })
    {
        var s = ResolveFirst(hwType, GpuSensorPriority);
        if (s is not null) return s;
    }
    return null;
}

private ISensor? ResolveNvmeSensor()
{
    // NVMe drives appear under HardwareType.Storage. Each drive is a separate IHardware
    // with its own Sensors collection. The first drive with a temperature sensor wins.
    // Some LHM versions expose NVMe drives as SubHardware of a Storage controller rather
    // than top-level — walk both levels.
    foreach (var hw in _computer!.Hardware)
    {
        if (hw.HardwareType != HardwareType.Storage) continue;

        // Direct Sensors
        var direct = FindNvmeTempOn(hw);
        if (direct is not null) return direct;

        // SubHardware (rare — some LHM builds)
        foreach (var sub in hw.SubHardware)
        {
            var nested = FindNvmeTempOn(sub);
            if (nested is not null) return nested;
        }
    }
    return null;
}

private static ISensor? FindNvmeTempOn(IHardware hw)
{
    foreach (var name in NvmeSensorPriority)
    {
        var s = hw.Sensors.FirstOrDefault(x =>
            x.SensorType == SensorType.Temperature &&
            string.Equals(x.Name, name, StringComparison.OrdinalIgnoreCase));
        if (s is not null) return s;
    }
    return hw.Sensors.FirstOrDefault(x => x.SensorType == SensorType.Temperature);
}
```

### 4.3 Re-resolution trigger (D-10)

Re-walk happens in exactly two conditions:

1. **Exception during `Update()`** — sets `_sensorTreeStale = true` inside Refresh's catch block
2. **Null `Value` on a previously-resolved sensor** — detected in `ReadCachedSensors()` as shown in 3.5

Re-walk is bounded: one attempt per Refresh cycle. If re-walk also fails, the sensor stays at `-1f` until the next cycle. This matches the StatsService GPU re-enumeration pattern (catch `InvalidOperationException`, call `DisposeGpuCounters()` + `BuildGpuCounters()` + re-prime, set to `0f`).

## 5. ITempSource Contract + FakeTempSource Shape

### 5.1 ITempSource (in `FuzzyClock.App`, exactly D-11)

```csharp
namespace FuzzyClock.App;

public interface ITempSource
{
    bool IsReady { get; }
    float CpuTempC  { get; }
    float GpuTempC  { get; }
    float MoboTempC { get; }
    float NvmeTempC { get; }
    void Refresh();
}
```

Exactly six members. No `IDisposable`, no per-sensor `bool IsXxxAvailable` (encoded by `-1f`), no `float?`. `TemperatureService : ITempSource` (implicit implementation).

### 5.2 FakeTempSource (in `FuzzyClock.App.Tests`, per D-13)

```csharp
namespace FuzzyClock.App.Tests;

public sealed class FakeTempSource : ITempSource
{
    // Mutable PUBLIC setters — tests flip values during execution to simulate
    // NVMe hot-removal, sensor recovery, etc.
    public bool  IsReady    { get; set; } = true;
    public float CpuTempC   { get; set; } = 52f;
    public float GpuTempC   { get; set; } = 61f;
    public float MoboTempC  { get; set; } = -1f;  // default OFF — matches TEMP-TAB-03 default
    public float NvmeTempC  { get; set; } = 38f;

    public int RefreshCallCount { get; private set; }
    public void Refresh() => RefreshCallCount++;  // no-op that records invocations
}
```

**Construction pattern used by tests:** `new FakeTempSource { CpuTempC = 70f, NvmeTempC = -1f }` — init-only via public setters. Tests can subsequently flip any property to simulate steady-state changes.

**Why `RefreshCallCount` is exposed:** enables the "piggyback timer called Refresh N times" test without a mocking framework. Zero test-framework dependencies outside MSTest.

## 6. Dispose Pattern — Three-Tier + Interlocked Single-Entry

### 6.1 The Interlocked pattern (ISC-20)

```csharp
private int _disposed;  // 0 = live, 1 = disposed; Interlocked requires int

public void Dispose()
{
    // Atomic: only the first caller observes 0; subsequent callers see 1 and return.
    // This pattern is ECMA-335-blessed and used throughout the .NET runtime
    // (e.g., SafeHandle.InternalFinalize).
    if (Interlocked.CompareExchange(ref _disposed, 1, 0) != 0) return;

    // Path 2 (background-task) only: cancel the loop first
    try { _cts?.Cancel(); } catch { }
    try { _backgroundTask?.Wait(TimeSpan.FromMilliseconds(500)); } catch { }
    _cts?.Dispose();

    // Close LHM — catch everything; this runs on the ProcessExit path
    // which has a ~2s collective budget across all handlers.
    try { _computer?.Close(); } catch { }
    _computer = null;
}
```

**Why `int` not `bool`:** `Interlocked.CompareExchange` has no `bool` overload that returns the old value atomically. `int` with 0/1 is idiomatic.

**Why catch-all on `Close()`:** a stale driver handle can throw on close. The exit path must not propagate — we want the process to exit cleanly.

### 6.2 Three-tier wiring (ISC-21)

Three distinct wiring sites. The TemperatureService instance is held as a private field on `MainWindow` (mirrors `_statsService` at `MainWindow.xaml.cs:17`) — this root keeps all three handlers alive for GC purposes.

| Tier | Site | Pattern |
|------|------|---------|
| **1. OnClosing** | `MainWindow.xaml.cs:1099` (existing override) | Add `_temperatureService?.Dispose();` alongside `_statsService?.Dispose();` |
| **2. SessionEnding** | `App.xaml.cs:70` (existing subscription) | Extend the lambda: `SessionEnding += (_, _) => { var mw = MainWindow as MainWindow; mw?.SaveSettings(); mw?.DisposeTemperatureService(); };` |
| **3. ProcessExit** | `App.xaml.cs` (NEW — subscribe inside `OnStartup` after `mainWindow.Show()`) | See below |

**Tier 3 — ProcessExit subscription with GC-safe handler reference (ISC-13 + risk mitigation):**

```csharp
// In App.OnStartup, after mainWindow.Show() and the existing SessionEnding subscription:
AppDomain.CurrentDomain.ProcessExit += OnProcessExit;  // instance method — delegate rooted by subscription

// Instance method on App — NOT a lambda — so the delegate has a stable target:
private void OnProcessExit(object? sender, EventArgs e)
{
    // ProcessExit runs with a ~2-second COLLECTIVE budget across all handlers.
    // Keep this fast: no file I/O, no settings save, only LHM Close.
    try { (MainWindow as MainWindow)?.DisposeTemperatureService(); } catch { }
}
```

**Why instance method on App, not lambda in OnStartup:**

- `AppDomain.CurrentDomain.ProcessExit += OnProcessExit;` creates a delegate that keeps `this` (the App instance) alive via the subscription.
- `App` is GC-rooted for the lifetime of the process (WPF holds a static reference via `Application.Current`).
- A lambda capturing `mainWindow` would work too (the `MulticastDelegate` holds the captured reference), but an instance method is clearer and survives reviewers' eyes better.
- Do NOT unsubscribe in `OnExit` — ProcessExit fires AFTER OnExit on some paths.

**Why `MainWindow.DisposeTemperatureService()` is a separate instance method (not just calling `_temperatureService.Dispose()` externally):** keeps the field encapsulated and ensures the method is the single dispose entry point called from three tiers (plus OnClosing). The Interlocked guard on the service itself ensures idempotency — `DisposeTemperatureService` can run the same code each time.

```csharp
// In MainWindow.xaml.cs — new internal method:
internal void DisposeTemperatureService() => _temperatureService?.Dispose();
```

### 6.3 The 2-second ProcessExit collective-timeout caveat (ISC-31)

Microsoft documents that `ProcessExit` handlers share a **~2-second collective budget** on Windows before the runtime forcibly terminates. The implications:

1. **Do not put file I/O in `OnProcessExit`.** Leave settings save to `SessionEnding` (already wired).
2. **Path 2 (background task) must cap its join at 500ms.** `_backgroundTask?.Wait(TimeSpan.FromMilliseconds(500))` inside Dispose — if LHM is stuck in a slow `Update()`, we abandon the task rather than miss the 2s window.
3. **`Computer.Close()` wrapped in try/catch with no logging.** Fast, silent, non-throwing.
4. **Test locally on a slow machine.** The spike report should note the observed Close() time; if it exceeds 500ms on the dev box, the planner adds a budget assertion to Plan B.

### 6.4 Dispose idempotency — the invariant to verify

`Interlocked.CompareExchange(ref _disposed, 1, 0) != 0 ⇒ return` guarantees that even if OnClosing, SessionEnding, AND ProcessExit all fire (e.g., user closes the widget, then logs off before the process has exited), `Computer.Close()` runs exactly ONCE. Test coverage for this is in Section 7.

## 7. Test Coverage Map

All tests live in `FuzzyClock.App.Tests` (NOT Core — LHM is an App-layer concern per REL-03). MSTest 4.0.1, `[TestClass]` + `[TestMethod]` + `[DataRow]`. No parallelism issues (stateless per test); mark `[DoNotParallelize]` only if the test touches static state (none of the below do).

### 7.1 ITempSource contract tests (FakeTempSource sanity) — 3 tests

| Test method | Asserts |
|-------------|---------|
| `FakeTempSource_DefaultValues_MatchDocumentedDefaults` | `new FakeTempSource()` has IsReady=true, CpuTempC=52, GpuTempC=61, MoboTempC=-1, NvmeTempC=38 |
| `FakeTempSource_RefreshCallCount_IncrementsOnEachCall` | Three `.Refresh()` calls → `RefreshCallCount == 3` |
| `FakeTempSource_SettersMutatable_DuringLifetime` | Construct, flip `NvmeTempC = -1f`, read back `-1f` |

### 7.2 TemperatureService lifecycle tests — 4 tests

Each test constructs a `TemperatureService` with a controlled failure injection. Since `Computer` is not interface-backed, these tests exercise the service's *outer* contract by the following pattern:

- Build tests around the `ITempSource` surface only (`IsReady`, four floats, `Refresh`).
- For init-failure tests, use reflection to set `_computer = null` and `_lhmAvailable = false` before assertions — OR — introduce an internal `protected virtual InitializeCore()` hook that tests override via a test subclass (`TestTemperatureService : TemperatureService`). The planner picks the less invasive option.

| Test method | Asserts |
|-------------|---------|
| `TemperatureService_Constructor_DoesNotBlock` | Constructor returns within 100ms (stopwatch check); background init may still be running |
| `TemperatureService_InitTimeout_LeavesIsReadyFalse` (or flipped flag after init races to completion with `-1f` sentinels) | After 4s wait, IsReady=true but all four temps are `-1f` when `InitializeCore` is forced to hang >3s |
| `TemperatureService_InitThrow_KeepsSentinels` | Forced throw inside InitializeCore → IsReady=true, all four temps stay `-1f`, no exception escapes |
| `TemperatureService_InitSilence_NoConsoleNoEventLog` | After forced init failure, capture stdout/stderr — must be empty (D-14 silent posture) |

### 7.3 Sentinel-fallback tests (via FakeTempSource proxy + service logic) — 4 tests

The service's ReadCachedSensors logic is testable by injecting a mock `ISensor`. If LHM's `ISensor` is awkward to mock, the planner can extract the translation logic into an `internal static float ToSentinel(float? value) => value ?? -1f;` helper and test that directly.

| Test method | Asserts |
|-------------|---------|
| `ToSentinel_NullValue_ReturnsMinusOne` | `ToSentinel(null) == -1f` |
| `ToSentinel_ValidValue_ReturnsValue` | `ToSentinel(52.5f) == 52.5f` |
| `ToSentinel_NegativeValidValue_ReturnsValue` | `ToSentinel(-5f) == -5f` (yes, `-1f` is a reserved value, but the translation is transparent; callers never emit negatives naturally) |
| `ToSentinel_Zero_ReturnsZero` | `ToSentinel(0f) == 0f` (ambient probe on cold boot) |

### 7.4 Sensor resolution tests — 5 tests

If the resolution logic is extracted into `internal static ISensor? ResolveFromHardware(IHardware hw, string[] priority)` — test with stub IHardware / ISensor lists.

| Test method | Asserts |
|-------------|---------|
| `ResolveFromHardware_PriorityMatch_ReturnsFirstPriorityHit` | Hardware has sensors `["Core Max", "CPU Package"]`; priority `["CPU Package", "Core Max"]` → returns `"CPU Package"` sensor |
| `ResolveFromHardware_NoPriorityMatch_FallsBackToFirstTemperature` | Hardware has sensor `"Weird Vendor Name"` with `SensorType.Temperature`; priority list has no match → returns that sensor (D-08 fallback) |
| `ResolveFromHardware_NoTemperatureSensor_ReturnsNull` | Hardware has only Load/Power sensors → returns null |
| `ResolveNvmeSensor_SubHardwareWalk_FindsTempInNested` | Top-level Storage with empty Sensors; SubHardware has `"Temperature"` sensor → returns nested sensor |
| `ResolveNvmeSensor_MultipleDrives_ReturnsFirstWithTemp` | Three Storage hardwares; only second has a temp sensor → returns the second's sensor |

### 7.5 Re-resolution trigger tests — 2 tests

| Test method | Asserts |
|-------------|---------|
| `Refresh_SensorValueGoesNull_TriggersReresolve` | Inject sensor whose Value flips to null; verify ResolveAllSensors is called on next Refresh (observable via a test-only call counter) |
| `Refresh_UpdateThrows_SetsSensorTreeStale` | Force `_computer.Accept(...)` to throw; verify `_sensorTreeStale` was flipped (internal access) |

### 7.6 Dispose idempotency tests — 3 tests (ISC-25)

| Test method | Asserts |
|-------------|---------|
| `Dispose_CalledOnce_CallsComputerClose` | After `Dispose()`, internal close-count == 1 |
| `Dispose_CalledThreeTimes_CallsComputerCloseOnce` | After three `Dispose()` calls, internal close-count == 1 (Interlocked guard) |
| `Dispose_CalledConcurrentlyFromThreeThreads_CallsComputerCloseOnce` | Parallel.For 3 threads each calling `Dispose()`; close-count == 1 |

Close-count is observable via a test subclass that overrides an internal `CloseComputer()` virtual or via reflection on a private `_computer` field whose handle is replaced with a stub. Planner picks the least invasive option.

### 7.7 Test count summary

| Category | Count |
|----------|-------|
| FakeTempSource contract | 3 |
| Service lifecycle | 4 |
| Sentinel translation | 4 |
| Sensor resolution | 5 |
| Re-resolution triggers | 2 |
| Dispose idempotency | 3 |
| **Phase 75 new tests total** | **21** |

Baseline (v4.1) is 501 tests; Phase 75 target is **≥522 tests**, all green, no hardware touches, no admin required.

## 8. Anti-Patterns and Pitfalls Specific to This Phase

Cherry-picked from PITFALLS.md; each maps to a Plan A or Plan B deliverable.

### 8.1 From Pitfall 2 (Plan A) — PawnIO-absent assumption

**Don't** assume the spike's dev-box-with-PawnIO-uninstalled matches what a real Win11 24H2 VM would show. LHM's PawnIO detection uses registry probes; it's *possible* the registry retains fragments after uninstall. **Do** reboot between uninstall and measurement, and verify `sc.exe query pawnio` returns `1060: service does not exist`.

### 8.2 From Pitfall 3 (Plan B) — `Update()` cadence

**Don't** call `Update()` on the UI thread every 0.5s hover tick. **Do** enforce the `MinRefreshIntervalMs = 2000` floor regardless of timer cadence. Under Path 2, the background loop's own 2s sleep enforces this; under Path 1, the `Environment.TickCount64 - _lastUpdateTicks < MinRefreshIntervalMs` guard enforces it.

### 8.3 From Pitfall 4 (Plan B) — `Computer.Close()` leak

**Don't** rely only on `OnClosing`. **Do** wire all three tiers (OnClosing + SessionEnding + ProcessExit) via the Interlocked-guarded Dispose. Verify via the three dispose-idempotency tests (Section 7.6).

### 8.4 From Pitfall 5 (REL-03 enforcement, Plan B)

**Don't** add `using LibreHardwareMonitor.Hardware;` anywhere under `FuzzyClock.Core/`. **Don't** move `ITempSource` to Core (layering temptation — resisted here). Phase 80 will add a CI grep gate (see Section 10). Phase 75's responsibility is "don't violate the gate" — the gate itself lands in Phase 80.

### 8.5 From Pitfall 13 (Plan B) — hardware-touching tests

**Don't** call `new Computer().Open()` anywhere in `FuzzyClock.App.Tests`. **Do** inject `ITempSource` into consumers (when added in Phase 79); test `TemperatureService` itself via internals-visible mocking or via extracted-static-helper testing as described in Section 7.

### 8.6 Meta-pitfall — spike contamination

**Don't** use the spike report to make product decisions ("users will want Mobo temps too"). **Do** use it only for the go/no-go decision defined in 2.5. Product decisions are already locked in CONTEXT.md and REQUIREMENTS.md.

## 9. Open Questions for the Planner

1. **Drag-pause policy for TemperatureService.**
   - What we know: D-06 throttles LHM reads to 2s even during 0.5s hover. Nothing says "pause temps during drag."
   - What's unclear: should Refresh() short-circuit when `_isDragging == true`? StatsService does NOT pause during drag (confirmed in `MainWindow.xaml.cs` search).
   - Recommendation: **do NOT pause temps during drag.** Temp reads are cheap and independent of the drag operation. Defer this as a user-facing concern if reported.

2. **Resolution-retry budget.**
   - What we know: D-10 says "re-resolve on failure only." Plan B shows one retry per Refresh cycle.
   - What's unclear: if re-resolution itself throws (catastrophic LHM state), should the service give up permanently or keep trying every tick?
   - Recommendation: **keep trying.** A transient LHM error can resolve on the next tick (driver recovered, NVMe re-inserted). Cost is negligible (one tree walk every 2s worst case).

3. **ProcessExit vs Dispatcher.ShutdownFinished race.**
   - What we know: ProcessExit fires on `Application.Current.Shutdown()` — but so does `Dispatcher.ShutdownFinished`.
   - What's unclear: is there a path where MainWindow has already been disposed by Shutdown before ProcessExit fires, making `(MainWindow as MainWindow)?.DisposeTemperatureService()` a no-op?
   - Recommendation: **yes, and that's fine.** The Interlocked guard on the service means a double-dispose from OnClosing+ProcessExit is idempotent. If MainWindow is already gone, ProcessExit's null-conditional call is a no-op — which is correct because OnClosing already fired Dispose earlier.

4. **Internal testability seams.**
   - What we know: `Computer` is not interface-backed (Pitfall 13 confirms).
   - What's unclear: extract a protected virtual `InitializeCore()` for test subclassing, OR extract static helpers (`ToSentinel`, `ResolveFromHardware`), OR use reflection?
   - Recommendation: **extract static helpers** (`TemperatureService.ToSentinel`, `TemperatureService.ResolveFromHardware`) — zero new types, zero inheritance, testable without mocking. The few tests that need to exercise async-init timeouts use reflection or a test subclass with a `protected virtual` hook — planner picks in Plan B.

5. **Spike scratch program lifecycle.**
   - What we know: spike uses a throwaway enumerator in `./scratch/Enumerator/`.
   - What's unclear: should it be committed for reproducibility or deleted after the spike?
   - Recommendation: **delete after capture.** Add `scratch/` to `.gitignore` at phase start (Plan A task 1). Only the spike report's captured output is committed.

6. **Scope-reduction downstream path if spike is NO-GO.**
   - What we know: D-02 says "scope reduction is documented in the report and roadmap amended before Phase 76 proceeds."
   - What's unclear: concretely, which REQUIREMENTS.md and ROADMAP.md lines change if only GPU is readable (NVMe fails)?
   - Recommendation: **defer until needed.** The planner's Plan A includes a "NO-GO branch" task template that points at this question — if the spike returns NO-GO, a new phase (75.5) opens to amend requirements, and Phase 76 is re-scoped before starting.

## 10. CI Grep Gate Reference (REL-03)

Phase 80 wires the CI gate. Phase 75's obligation is **not to violate it**. The gate, as specified in REQUIREMENTS.md REL-03, is:

```bash
# Must exit 0 (no matches) for the CI build to pass
! grep -r "LibreHardwareMonitor" FuzzyClock.Core/
```

Phase 75 compliance checklist:
- [ ] No `LibreHardwareMonitor` in `FuzzyClock.Core/*.cs`
- [ ] No `LibreHardwareMonitor` in `FuzzyClock.Core/*.csproj`
- [ ] No `LibreHardwareMonitor` in `FuzzyClock.Core.Tests/*.cs`
- [ ] `ITempSource` lives in `FuzzyClock.App/ITempSource.cs` (NOT Core)
- [ ] `FakeTempSource` lives in `FuzzyClock.App.Tests/FakeTempSource.cs` (NOT Core.Tests)

All five items are structural — the planner can eyeball them during Plan B review.

---

## Sources

### Primary (HIGH confidence)
- `.planning/research/STACK.md` — LHM 0.9.6 pin, transitive DLLs, MPL compliance, layering rationale
- `.planning/research/ARCHITECTURE.md` — StatsService mirror pattern, UpdateVisitor, HardwareType enum coverage, data flow
- `.planning/research/PITFALLS.md` — 13 pitfalls; pitfalls 2, 3, 4, 5, 13 are in scope for Phase 75
- `.planning/research/FEATURES.md` — sensor naming convention, resolution pseudocode
- `.planning/research/SUMMARY.md` — milestone-level risk ordering
- `FuzzyClock.App/StatsService.cs` — line-for-line template for field layout, init discipline, volatile ordering, re-enumeration on failure
- `FuzzyClock.App/App.xaml.cs:70` — existing `SessionEnding` subscription site; OnExit at line 121 (mutex release only, no ProcessExit)
- `FuzzyClock.App/MainWindow.xaml.cs:125` — StatsService instantiation site (new `StatsService()` pattern)
- `FuzzyClock.App/MainWindow.xaml.cs:1099` — existing `OnClosing` override (currently disposes `_statsTimer` and `_statsService`, calls `SaveSettings`)

### Secondary (MEDIUM-HIGH confidence)
- `.planning/phases/75-.../75-CONTEXT.md` — D-01..D-15 locked decisions
- `.planning/REQUIREMENTS.md` — TEMP-SVC-01..05, REL-02, REL-03 exact wording
- `.planning/ROADMAP.md` — Phase 75 SC1..SC5 acceptance gate

### Tertiary (verification needed — gated by spike)
- Exact LHM `ISensor.Name` strings per vendor (Section 4.1 seed lists) — empirically verified by Section 2.3's enumeration program
- `Update()` timing on dev box (Section 2.4) — determines D-05 branch
- NVMe SubHardware layout on dev box (Section 4.2) — falls through to top-level walk if SubHardware is empty

## Metadata

**Confidence breakdown:**
- Spike methodology: HIGH — procedure is standard PawnIO uninstall + reboot + enumerate; output format is planner-prescriptive
- Service architecture: HIGH — StatsService is a working 1:1 template; only the LHM Open/Close + Interlocked dispose are net-new discipline
- Sensor resolution: MEDIUM — seed priority lists come from FEATURES.md (which flagged as MEDIUM-HIGH); planner extends from spike output
- Dispose pattern: HIGH — Interlocked.CompareExchange is an ECMA-335-blessed idiom; three-tier wiring sites are all identified in existing code

**Research date:** 2026-05-04
**Valid until:** Phase 75 completion (the spike's go/no-go decision is the next "live" artifact)

## RESEARCH COMPLETE
