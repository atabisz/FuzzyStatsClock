# Technology Stack: v2.1 Uptime and Rolling CPU Load Averages

**Project:** FuzzyClock — uptime display + rolling 1m/5m/15m CPU load averages
**Researched:** 2026-02-27
**Scope:** Additions only — existing validated stack is unchanged
**Confidence:** HIGH

---

## What Changes vs v2.0

v2.0 stack (already validated, not re-researched):
- .NET 10, C# 13, WPF (`net10.0-windows`)
- `System.Text.Json` for settings persistence
- `DispatcherTimer` for periodic UI updates
- `System.Windows.Controls` (TextBlock, ContextMenu, Grid, Border)
- `System.Windows.Shapes` (Line, Ellipse)
- `System.Diagnostics.PerformanceCounter` (NuGet 10.0.0)
- `System.Windows.Forms.ColorDialog` (UseWindowsForms=true)
- Code-behind pattern — no MVVM, no data bindings

v2.1 stack additions:

| Layer | What's Added | csproj Change |
|-------|-------------|---------------|
| Uptime source | `Environment.TickCount64` (System namespace, System.Runtime.dll) | None — already referenced |
| Uptime formatting | `TimeSpan.FromMilliseconds()` + `.Days` / `.Hours` / `.Minutes` (System namespace) | None — already referenced |
| Rolling averages | Pure C# circular buffer (`float[]` + `long[]` timestamps) inside `StatsService` | None — no external dependency |
| AppSettings extension | One new `bool` init-property: `UptimeVisible` | None — same pattern as all previous fields |
| XAML row | One new `TextBlock` below stats panel | None — same pattern as existing stat rows |

**Zero new NuGet packages. Zero csproj changes.**

---

## Recommended Stack Additions

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `Environment.TickCount64` (static property) | net-10.0 (`System.Runtime.dll`, in-box) | Read milliseconds elapsed since system start — the raw uptime value | Single line: `TimeSpan uptime = TimeSpan.FromMilliseconds(Environment.TickCount64)`. No P/Invoke, no PDH counter, no WMI. Already available in `System` namespace which is globally imported. On .NET 10 / Windows, includes sleep/hibernate time — this matches standard OS uptime behavior (Task Manager, `net statistics server`, etc.). Overflows `Int32.MaxValue` (~49 days) gracefully because it returns `Int64` (overflows after ~292 million years). |
| `TimeSpan.FromMilliseconds(long)` + `.Days` / `.Hours` / `.Minutes` | net-10.0 (`System.Runtime.dll`, in-box) | Convert raw milliseconds to structured time components for `up 3d 14h 22m` display | `TimeSpan.Days` returns the integer days component (not total — e.g., `3` for 3.5 days, `Hours` = 12 for the remaining hours). Standard format: `$"up {ts.Days}d {ts.Hours}h {ts.Minutes}m"` with conditional suppression of `0d` when uptime is under one day. No parsing, no custom math. |
| Circular buffer in `StatsService` (pure C#, no library) | N/A — plain arrays | Accumulate time-stamped CPU samples to compute accurate 1m/5m/15m rolling averages | The existing `StatsService.Refresh()` is called by the stats `DispatcherTimer` at variable rates (0.5s hover / 1s / 3s / 10s). A fixed-size ring buffer of `(float value, long timestampMs)` pairs, combined with a LINQ-style walk that discards samples older than the window, produces accurate time-weighted or simple averages regardless of sample rate. Capacity of 1800 entries (one per second for 30 minutes) covers all three windows at any timer rate. `float[]` + `long[]` parallel arrays avoid boxing; `Queue<(float, long)>` is equivalent but slightly higher allocation. Plain array ring buffer is idiomatic for this pattern in embedded/desktop telemetry code. |

### Rolling Average Algorithm Detail

The stats timer fires at variable rates (0.5s during hover, 1/3/10s configured). Accurate window averages require time-aware sampling, not count-based averaging:

```csharp
// In StatsService — parallel ring buffer approach
private const int LoadBufferCapacity = 1800;  // 30 min at 1-sample/sec maximum
private float[] _loadValues     = new float[LoadBufferCapacity];
private long[]  _loadTimestamps = new long[LoadBufferCapacity];  // Environment.TickCount64 ms
private int     _loadHead       = 0;   // next write position (overwrites oldest)
private int     _loadCount      = 0;   // total entries filled (capped at capacity)

// Called inside Refresh(), after CpuPercent is updated:
private void RecordLoadSample()
{
    _loadValues[_loadHead]     = CpuPercent;
    _loadTimestamps[_loadHead] = Environment.TickCount64;
    _loadHead = (_loadHead + 1) % LoadBufferCapacity;
    if (_loadCount < LoadBufferCapacity) _loadCount++;
}

// Compute average for a window (e.g. windowMs = 60_000 for 1-minute)
public float GetLoadAverage(long windowMs)
{
    long cutoff = Environment.TickCount64 - windowMs;
    float sum = 0f;
    int   cnt = 0;
    // Walk backwards from newest to oldest
    for (int i = 1; i <= _loadCount; i++)
    {
        int idx = (_loadHead - i + LoadBufferCapacity) % LoadBufferCapacity;
        if (_loadTimestamps[idx] < cutoff) break;
        sum += _loadValues[idx];
        cnt++;
    }
    return cnt > 0 ? sum / cnt : 0f;
}

// Exposed properties (computed on demand during Refresh, cached as fields):
public float Load1m  { get; private set; }
public float Load5m  { get; private set; }
public float Load15m { get; private set; }
```

**Why "break on first old sample" is valid:** The ring buffer fills from oldest to newest; walking backwards from the current head means samples are in descending time order. The first sample older than the cutoff guarantees all remaining samples are also older. This makes the average O(n) in window size, not O(capacity).

**Why cached properties not on-demand compute:** `MainWindow` reads load averages once per `_statsTimer` tick to update the UI. Caching `Load1m`/`Load5m`/`Load15m` in `Refresh()` avoids triple-iteration of the buffer per tick.

**Confidence:** HIGH — `Environment.TickCount64` behavior on .NET 10 / Windows confirmed via official docs. Ring buffer algorithm is standard; no external source required.

---

### Uptime Formatting Detail

```csharp
// In StatsService or inline in MainWindow timer handler:
public static string FormatUptime()
{
    TimeSpan ts = TimeSpan.FromMilliseconds(Environment.TickCount64);
    // "up 3d 14h 22m"  — suppress 0d for uptime under 1 day
    return ts.Days > 0
        ? $"up {ts.Days}d {ts.Hours}h {ts.Minutes}m"
        : $"up {ts.Hours}h {ts.Minutes}m";
}
```

`TimeSpan.Days` is the integer days component (0–int.MaxValue), confirmed correct. `TimeSpan.Hours` is 0–23 (the hours remainder after full days). `TimeSpan.Minutes` is 0–59 (the minutes remainder after full hours). No custom arithmetic needed.

**Confidence:** HIGH — `TimeSpan.Days`, `TimeSpan.Hours`, `TimeSpan.Minutes` component semantics confirmed in official net-10.0 docs (see example: 229 days 5 hours 30 minutes = `.Days=229`, `.Hours=5`, `.Minutes=30`).

---

### AppSettings Extension

```csharp
// Add one field to the existing AppSettings record:
public bool UptimeVisible { get; init; } = true;   // default: visible
```

`bool` init-property follows the same pattern as `CpuVisible`, `GpuVisible`, `MemVisible`, `PagVisible`. `System.Text.Json` deserializes it natively. Old settings.json without this field loads the default (`true`) — forward-compatible with no migration needed.

**Why default `true`:** The feature is new and opt-out. Users who have not yet toggled the menu see the row on first launch — they discover it exists, then can hide it if unwanted. Matches `StatsVisible = false` not being the right default here because uptime is a single compact line (low visual weight), not a full multi-row panel.

**Confidence:** HIGH — `bool` init-property serialization pattern validated across all prior milestones (v1.2–v2.0).

---

### XAML Addition

One new compact row below the stats panel, same structural pattern as the `StatsPanel` StackPanel rows:

```xml
<!-- Below StatsPanel in the main StackPanel/Grid: -->
<TextBlock x:Name="UptimeLine"
           FontFamily="Segoe UI Light"
           FontSize="11"
           Foreground="White"
           Opacity="0.85"
           TextWrapping="NoWrap"
           Visibility="Visible"
           Margin="0,2,0,0"
           Text="up 0h 0m  0.0  0.0  0.0" />
```

The `Text` is set entirely from code-behind in the stats timer handler, matching the existing pattern for `CpuText`, `MemText`, etc. The accent color applies to `Foreground` via `ApplyTheme()`, same as all other text elements.

Format string: `$"up {uptime}  {load1m:F1}  {load5m:F1}  {load15m:F1}"` — compact single line, two spaces between segments to visually separate without extra controls.

**Why one TextBlock not a structured row:** The uptime + load line is read-only telemetry, not interactive. There is no bar to render. A single `TextBlock` is the minimum control needed. Adding `Border`/`StackPanel`/`Grid` structure for a line with no bar would be unnecessary complexity.

**Confidence:** HIGH — `TextBlock` in code-behind accent pattern is validated across all v1.x–v2.0 milestones.

---

## Integration with Existing StatsService

`StatsService` is the correct home for all three new data points:

| Data | Where it goes | How it's triggered |
|------|---------------|-------------------|
| Uptime | `FormatUptime()` static helper (or inline in MainWindow) | Called in `_statsTimer` tick handler, same as CpuPercent/GpuPercent display update |
| Load samples | `RecordLoadSample()` called at end of `Refresh()` | Automatic — every Refresh() call (hover fast-refresh included) produces a time-stamped sample |
| Load averages | `Load1m`, `Load5m`, `Load15m` cached in `Refresh()` | Computed inside `Refresh()` after `RecordLoadSample()`; read by MainWindow tick handler |

**Why uptime does NOT go in StatsService as a computed property:** Uptime is not a PDH counter and carries no initialization cost. It is a one-liner `TimeSpan.FromMilliseconds(Environment.TickCount64)` anywhere in the code. Putting it in `StatsService` would be over-engineering. Either a `static string FormatUptime()` utility or inline in the MainWindow tick handler is appropriate.

**Hover fast-refresh interaction:** When the user hovers, `_statsTimer` fires at 0.5s instead of the configured rate. `Refresh()` is called more frequently, so load samples accumulate faster. This is correct — more samples in the buffer = more accurate short-window averages. The time-stamped buffer design ensures window averages remain accurate regardless of sample frequency; no special handling needed for hover mode.

**Why 1800-entry buffer capacity:** At the fastest possible rate (0.5s hover), 1800 entries = 900 seconds = 15 minutes of samples. The 15-minute load average window requires samples back 15 minutes. At 0.5s rate, 1800 entries exactly covers the 15m window. At the slowest rate (10s), 1800 entries covers 5 hours — far more than needed, but memory cost is trivial: `1800 × (4 bytes float + 8 bytes long) = 21.6 KB`.

---

## csproj Change Summary

**No changes required.** All APIs used are in assemblies already referenced:
- `Environment.TickCount64` — `System.Runtime.dll` (in-box, always referenced)
- `TimeSpan` — `System.Runtime.dll` (in-box, always referenced)
- `float[]` / `long[]` ring buffer — pure C#, no assembly

The `System.Diagnostics.PerformanceCounter` NuGet package at 10.0.0 is unchanged.
`UseWindowsForms=true` is unchanged (added in v2.0).

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| `Environment.TickCount64` for uptime | `PerformanceCounter("System", "System Up Time")` | PDH counter works but requires async init (same pattern as CPU/GPU counters), adds to StatsService initialization complexity, returns a float of elapsed seconds — same data as TickCount64 but heavier; TickCount64 is one property read with no counter lifecycle to manage |
| `Environment.TickCount64` for uptime | WMI `Win32_OperatingSystem.LastBootUpTime` | WMI queries are slow (20–200ms blocking) and require `ManagementObjectSearcher` — a heavier dependency than any existing code path; TickCount64 is instantaneous and in-box |
| `Environment.TickCount64` for uptime | `DateTime.Now - Process.GetCurrentProcess().StartTime` | This gives the widget's own process uptime, not the system uptime — wrong data |
| Time-stamped ring buffer for load averages | Fixed-count rolling average (e.g. last N samples) | Fixed-count approach produces wildly inaccurate results when timer rate changes (hover = 0.5s vs normal = 10s); a 1-minute average over the last 60 samples at 10s/sample is actually a 10-minute average — meaningless. Time-stamped buffer is the only correct approach given variable timer rates. |
| Time-stamped ring buffer for load averages | Separate 1s DispatcherTimer dedicated to load sampling | A third timer adds complexity and coupling. The existing stats timer already samples CPU at the configured rate; piggy-backing load recording onto `Refresh()` is zero overhead and consistent with the existing architecture. |
| `float[]` + `long[]` parallel arrays | `Queue<(float, long)>` or `List<(float, long)>` | Queue/List works but allocates on enqueue; ring buffer with fixed arrays is allocation-free after initialization. For a desktop widget that runs for days, allocation-free is worth the minor additional code complexity. |
| Single `TextBlock` for uptime line | Separate TextBlock per segment (uptime, load1m, load5m, load15m) | Multiple TextBlocks in a row require a horizontal StackPanel and more XAML/code; a single formatted string in one TextBlock is the minimum viable implementation consistent with the widget's code-behind-first pattern |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| WMI (`ManagementObjectSearcher`, `Win32_OperatingSystem`) | 20–200ms blocking query; requires `System.Management` NuGet; heavyweight for a value available in 1 µs via `Environment.TickCount64` | `Environment.TickCount64` |
| `PerformanceCounter("System", "System Up Time")` | Requires the same async init + priming pattern as CPU/GPU counters; adds to StatsService initialization path; returns identical data as TickCount64 | `Environment.TickCount64` |
| Exponential Moving Average (EMA) for load averages | EMA requires careful alpha tuning; result depends on initial value and sample rate variance; harder to explain and validate than simple windowed average; Linux `uptime` uses EMA but the display convention is well-understood only because Linux sample rates are fixed | Simple windowed average over time-stamped buffer |
| Seconds in the uptime display | The format `up 3d 14h 22m` matches the Linux `uptime` convention and is human-readable at widget scale; adding seconds makes the string longer and changes every second (defeating the stats timer's 1s-minimum update cycle for a compact info line) | `up Xd Yh Zm` format |
| `Thread.Sleep` / background thread for load sampling | `Refresh()` is already called from the UI thread via `DispatcherTimer`; introducing a background thread for load sampling creates cross-thread access issues with the existing StatsService fields (`_initialized` volatile flag, counter reads) | Record samples inside existing `Refresh()` |

---

## Version Compatibility

| Component | Version | Notes |
|-----------|---------|-------|
| `Environment.TickCount64` | net-10.0 (`System.Runtime.dll`) | Available since .NET Core 3.0; `Int64`, no overflow concern; includes sleep time on Windows in .NET 10 (expected behavior for OS uptime) |
| `TimeSpan.FromMilliseconds(long)` | net-10.0 (`System.Runtime.dll`) | `long` overload available since .NET 7; avoids lossy `double` cast; `Days`/`Hours`/`Minutes` component properties stable since .NET 1.0 |
| `float[]` ring buffer | Any .NET | No version dependency; pure language feature |
| `AppSettings` bool init-property | net-10.0 (`System.Text.Json` in-box) | Same pattern as all prior AppSettings fields; no version concern |
| `System.Diagnostics.PerformanceCounter` NuGet | 10.0.0 (unchanged) | No change |

---

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| `Environment.TickCount64` for uptime | HIGH | Official net-10.0 docs confirmed; return type `Int64`; Windows behavior (includes sleep) documented; assembly `System.Runtime.dll` confirmed |
| `TimeSpan.FromMilliseconds(long)` overload | HIGH | Official net-10.0 docs confirmed; `Days`/`Hours`/`Minutes` component semantics confirmed with numeric example in docs |
| Time-stamped ring buffer algorithm | HIGH | Standard pattern; no external library; correctness derivable from first principles; `Environment.TickCount64` as timestamp confirmed |
| AppSettings `bool` init-property | HIGH | Validated pattern across v1.2–v2.0 milestones |
| Buffer capacity (1800 entries) | HIGH | Arithmetic: 0.5s × 1800 = 900s = 15m; covers all three windows at maximum sample rate |
| Zero csproj changes | HIGH | All required APIs in assemblies already referenced in `net10.0-windows` target |

---

## Sources

- `Environment.TickCount64` property (net-10.0): https://learn.microsoft.com/en-us/dotnet/api/system.environment.tickcount64?view=net-10.0 — confirms `Int64` return type, milliseconds elapsed since system start, Windows behavior includes sleep time in .NET 10, `System.Runtime.dll` assembly
- `TimeSpan` struct (net-10.0): https://learn.microsoft.com/en-us/dotnet/api/system.timespan?view=net-10.0 — confirms `Days`/`Hours`/`Minutes` as integer component properties (not totals), `FromMilliseconds(long)` overload, `System.Runtime.dll` assembly; numeric example confirms 229 days 5 hours 30 minutes component semantics
- Prior milestone research (v1.2 StatsService, v1.4 PAG counter): `.planning/milestones/v1.2-phases/07-statsservice/07-RESEARCH.md` — confirms `PerformanceCounter` init pattern, `Refresh()` tick integration, existing architecture constraints

---
*Stack research for: FuzzyClock v2.1 — uptime display and rolling CPU load averages*
*Researched: 2026-02-27*
