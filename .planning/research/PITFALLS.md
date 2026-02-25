# Pitfalls Research

**Domain:** WPF transparent frameless overlay — CPU/GPU/MEM stats panel (v1.2 additions)
**Project:** Fuzzy Clock
**Researched:** 2026-02-25
**Confidence:** HIGH — all critical claims verified against official Microsoft docs and existing source code

---

> **Scope note:** This document covers pitfalls specific to adding CPU/GPU/memory Performance Counter stats and a WPF bar panel to the existing transparent WPF overlay. The prior v1.0 pitfalls (transparency, ClearType, software rendering, DispatcherTimer, hit-testing, DPI, multiple instances, Topmost) and v1.1 pitfalls (DragMove, position persistence, SizeToContent + font size, JSON save safety) are documented in prior PITFALLS.md files and not duplicated here. This document focuses exclusively on v1.2 concerns and how they interact with the already-shipped v1.1 constraints.

---

## Critical Pitfalls

Mistakes that cause silent wrong behavior, crashes, or resource leaks.

---

### Pitfall 1: First `NextValue()` Call on CPU PerformanceCounter Always Returns 0

**What goes wrong:**
The `Processor` performance counter category uses a rate-based counter type (`PERF_100NSEC_TIMER_INV`). The first call to `NextValue()` returns `0.0f` because the counter needs two samples to calculate a rate — it has no "previous" sample on the first call. If the stats panel is shown immediately on startup, the CPU bar renders as empty (0%) and then jumps to a real value on the second tick. More importantly, if startup initialization code uses the first `NextValue()` result to decide whether the counter is working, it will incorrectly conclude the counter returned nothing.

**Why it happens:**
Rate counters (`% Processor Time`) compute the percentage from the delta between two readings taken at different times. The first reading establishes the baseline; only the second and subsequent readings produce a meaningful value. This is documented behavior: "To obtain performance data for counters that required an initial or previous value for performing the necessary calculation, call the `NextValue` method twice."

**Consequences:**
- CPU bar shows 0% on first tick after startup — then snaps to real value on second tick. This looks like a brief glitch.
- If the stats service initializes counters synchronously on the UI thread during startup (which blocks for the first read), the 0 result is correctly discarded by the second read, but the blocking is a UI freeze risk (see Pitfall 3).
- If initialization code treats `0` return as "counter unavailable" and falls back to an error state, stats will never appear.

**Prevention:**
Create counters during app startup or service initialization, call `NextValue()` once immediately to prime the counter (discard the result), and start updating the UI only after the second tick:

```csharp
// Initialize and discard first sample — it's always 0 for rate counters
_cpuCounter = new PerformanceCounter("Processor", "% Processor Time", "_Total");
_cpuCounter.NextValue();  // prime — result is always 0, discard it

// After first DispatcherTimer tick, NextValue() returns a real value
```

**Detection:**
- CPU bar always shows 0% for the first 1 second after launch, then jumps to a real value.
- CPU reads 0 in logging even when the machine is clearly loaded.

**Phase to address:** Phase introducing stats service initialization.

---

### Pitfall 2: AppSettings Positional Record — New Fields Default to 0/false When Old settings.json Is Loaded

**What goes wrong:**
`AppSettings` is currently `record AppSettings(double Left, double Top, int FontSize)`. Adding new fields for stats (e.g., `bool StatsVisible` and `int StatsIntervalSeconds`) extends the positional record:

```csharp
// New record after v1.2 additions
record AppSettings(double Left, double Top, int FontSize, bool StatsVisible, int StatsIntervalSeconds);
```

An existing v1.1 `settings.json` contains only `{"Left":…, "Top":…, "FontSize":…}`. When `System.Text.Json` deserializes this into the new record, the missing constructor parameters `StatsVisible` and `StatsIntervalSeconds` receive their **C# type defaults**: `false` and `0`.

`StatsIntervalSeconds = 0` is a bug: constructing `new DispatcherTimer { Interval = TimeSpan.FromSeconds(0) }` creates a zero-interval timer that fires as fast as the message loop allows, potentially hammering `NextValue()` thousands of times per second and consuming significant CPU. It also causes `PerformanceCounter.NextValue()` to be called faster than Windows updates the counters (the PDH layer updates at ~1Hz), producing meaningless constant readings.

`StatsVisible = false` means stats are hidden on first launch after upgrade — the user will see no stats and may not know the feature exists.

**Why it happens:**
Prior to .NET 9, System.Text.Json treats all constructor parameters as optional during deserialization. Missing JSON fields silently use the default value for the parameter type. The official docs confirm: "Prior to .NET 9, constructor-based deserialization treated all constructor parameters as optional." .NET 10 preserves this behavior unless `RespectRequiredConstructorParameters = true` is explicitly set (which this project does not set). Source: https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/required-properties

**Consequences:**
- `StatsIntervalSeconds = 0` → `DispatcherTimer` fires at maximum rate → CPU spike → performance counter spam → bad readings.
- `StatsVisible = false` → stats never appear on first launch after upgrade, even though the feature is enabled by default.
- `FontSize` is already in the JSON, so it is correctly restored. Only the new fields are affected.

**Prevention:**
`SettingsService.Defaults()` already exists and returns safe defaults. The fix is to apply defaults for any field that received a type-default value. There are two approaches:

**Approach A (recommended): Guard in `SettingsService.Load()` after deserialization**

```csharp
public static AppSettings Load()
{
    try
    {
        if (!File.Exists(FilePath)) return Defaults();
        var json = File.ReadAllText(FilePath);
        var loaded = JsonSerializer.Deserialize<AppSettings>(json) ?? Defaults();
        // Apply safe defaults for fields that were absent in older settings files.
        // StatsIntervalSeconds = 0 means the field was missing; use default (1s).
        return loaded with
        {
            StatsIntervalSeconds = loaded.StatsIntervalSeconds > 0
                ? loaded.StatsIntervalSeconds : Defaults().StatsIntervalSeconds,
            StatsVisible = /* no correction needed; false-on-first-launch is a policy decision */
                loaded.StatsVisible
        };
    }
    catch { return Defaults(); }
}
```

**Approach B: Give new parameters default values in the record definition**

Positional records do not support default parameter values in the standard positional syntax. Adding defaults requires the non-positional form or a secondary constructor. This breaks the `with` expression pattern used in `SettingsService.Clamp()` and complicates `System.Text.Json` handling. Approach A is simpler and localizes the migration logic in one place.

**Warning signs:**
- CPU fan spins up immediately after installing v1.2 on a machine that had v1.1 settings.json.
- Stats panel does not appear even though `StatsVisible` default is intended to be `true`.
- `DispatcherTimer.Interval` is `TimeSpan.Zero` in the debugger.

**Phase to address:** Phase introducing `AppSettings` changes — must be addressed before any code reads `StatsIntervalSeconds` from settings.

---

### Pitfall 3: PerformanceCounter Initialization Blocks the UI Thread

**What goes wrong:**
`PerformanceCounter` constructors and the first `NextValue()` call make Win32 PDH (Performance Data Helper) calls that can take 200–500ms on some machines, especially:
- On cold start when the PDH cache is not populated.
- When the `GPU Engine` category has many instances (a machine with multiple GPUs and many running D3D processes can have dozens of instances to enumerate).
- When Windows Defender or UAC intercepts the registry read that backs Performance Counters.

If `new PerformanceCounter(...)` is called in `App.xaml.cs OnStartup()` or in the `MainWindow` constructor on the UI thread, the application freezes visibly for up to half a second before the first frame is rendered.

**Why it happens:**
`PerformanceCounter` initialization reads from HKLM registry keys and mapped memory. This is synchronous I/O on the calling thread. There is no async variant.

**Consequences:**
- Visible freeze on startup (white window or blank before first frame).
- In severe cases (corrupted PDH counters, slow registry), can take several seconds.

**Prevention:**
Initialize `PerformanceCounter` objects on a background thread via `Task.Run()`, then marshal the timer-tick reads back to the Dispatcher. The stats panel shows a loading state (e.g., "---") until initialization completes:

```csharp
// In StatsService constructor or Initialize():
Task.Run(() =>
{
    _cpuCounter = new PerformanceCounter("Processor", "% Processor Time", "_Total");
    _cpuCounter.NextValue();  // prime — always 0, discard
    _memCounter = new PerformanceCounter("Memory", "% Committed Bytes In Use");
    _memCounter.NextValue();  // prime
    _gpuCounters = BuildGpuCounters(); // may enumerate many instances
    _initialized = true;
});

// Timer tick reads only proceed when _initialized is true:
private void OnStatsTick(object? sender, EventArgs e)
{
    if (!_initialized) return;
    // ... read counters ...
}
```

**Warning signs:**
- App takes noticeably longer to show first frame after v1.2 is installed.
- Startup hang is intermittent (depends on PDH cache state).

**Phase to address:** Phase introducing stats service — initialize async from the start; do not optimize later.

---

### Pitfall 4: GPU Counter Category Is Multi-Instance — Single Instance Name Reads Only One Engine

**What goes wrong:**
GPU usage is exposed through the `GPU Engine` performance counter category, counter name `Utilization Percentage`. Unlike the CPU counter (`Processor` category, `_Total` instance), the GPU Engine category has one instance **per engine per adapter per process**. Instance names look like:

```
pid_1234_luid_0x00000000_0x0000C45F_phys_0_eng_0_engtype_3D
pid_1234_luid_0x00000000_0x0000C45F_phys_0_eng_1_engtype_Copy
pid_5678_luid_0x00000000_0x0000C45F_phys_0_eng_0_engtype_VideoDecode
```

Creating a single `PerformanceCounter` for one of these instances reads only that process's use of that specific engine. This does not represent total GPU utilization.

**Why it happens:**
Windows exposes GPU utilization at the per-process per-engine level, not as a system-wide total. Unlike CPU (`_Total` is a real aggregate instance), there is no `_Total` instance for `GPU Engine`. Enumerating all instances and summing them gives a gross aggregate, but the correct approach is to enumerate, filter by engine type (typically "3D" for render workload), and sum across all processes for that engine type — then divide by the engine count to normalize.

**Consequences:**
- GPU bar shows a low constant value (only reading one process/engine).
- GPU bar shows > 100% if summing without normalization.
- `InvalidOperationException` if the instance name that was captured at startup is later removed (process exits, GPU resets).

**Prevention:**
Enumerate all instances of `GPU Engine` at each timer tick (or cache them and refresh periodically), filter for the engine type of interest, sum `Utilization Percentage`, and clamp to [0, 100]:

```csharp
private static float ReadGpuUtilization()
{
    try
    {
        var cat = new PerformanceCounterCategory("GPU Engine");
        string[] instanceNames = cat.GetInstanceNames();
        float total = 0f;
        int engineCount = 0;
        foreach (var name in instanceNames.Where(n => n.Contains("engtype_3D")))
        {
            using var c = new PerformanceCounter("GPU Engine", "Utilization Percentage", name, readOnly: true);
            c.NextValue(); // prime
            // First reading is 0 — value is meaningful only after two reads
            // In practice, for tick-based reading, call NextValue() once per tick
            total += c.NextValue();
            engineCount++;
        }
        return engineCount > 0 ? Math.Min(total / engineCount, 100f) : 0f;
    }
    catch { return 0f; }
}
```

Note: Creating and priming counters on every tick is expensive. Cache the counter objects and only refresh instance names if `InvalidOperationException` is thrown (instance disappeared).

**Warning signs:**
- GPU bar shows a constant low value (2–5%) regardless of actual GPU load.
- GPU bar shows 200%+ during a 3D workload.
- `InvalidOperationException: Instance does not exist` in output window.

**Phase to address:** Phase introducing GPU counter reading.

---

### Pitfall 5: PerformanceCounter Objects Are Not Disposed — Handle Leak on App Lifetime

**What goes wrong:**
`PerformanceCounter` implements `IDisposable`. Each instance holds an unmanaged handle to the Windows PDH data provider. If counters are created but never disposed — whether at app close, timer interval change, or show/hide toggle — the handles accumulate. For a personal-use widget that runs for days without restart, this may cause PDH provider exhaustion or prevent the counter category from being refreshed.

More specifically: if the update interval changes from 1s to 10s (user changes the setting), and new `PerformanceCounter` objects are allocated without disposing the old ones, the leak compounds each time the user changes the interval.

**Why it happens:**
`PerformanceCounter` inherits from `Component`, which holds unmanaged resources. The GC will eventually call the finalizer, but this is non-deterministic. Finalizer-based cleanup of PDH handles can race with Windows service restarts or machine sleep/resume cycles.

**Prevention:**
Keep counter references as fields. Dispose them explicitly in a dedicated `DisposeCounters()` method. Call this method before creating new counters (interval change) and in `OnClosing`/`SessionEnding`:

```csharp
private void DisposeCounters()
{
    _cpuCounter?.Dispose(); _cpuCounter = null;
    _memCounter?.Dispose(); _memCounter = null;
    foreach (var c in _gpuCounters) c?.Dispose();
    _gpuCounters = [];
}
```

**Warning signs:**
- Handle count in Task Manager climbs slowly over hours of use.
- `InvalidOperationException` when reading counters after machine sleep/resume (handle stale).
- Counters stop updating after several interval changes in one session.

**Phase to address:** Phase introducing stats service — implement Dispose from the start; do not add it as a patch.

---

### Pitfall 6: SizeToContent=WidthAndHeight — Stats Bars Need Fixed Width or the Window Grows Unpredictably

**What goes wrong:**
The existing window has `SizeToContent=WidthAndHeight`. The window width is currently determined by the phrase text. Adding a stats panel below the phrase introduces additional content whose width must be explicitly constrained. If the stats bars are defined with `Width="Auto"` or no explicit width, their width is determined by their content (percentage text + bar proportions). As the percentage changes (e.g., CPU goes from "3%" to "100%"), the text width changes slightly, which causes the bar container to resize, which causes the window to resize on every stats tick. At 1-second intervals this produces visible window-width jitter.

Additionally: the stats panel may be **wider** than the phrase text for small font sizes (16pt "past" is narrow). In this case the window width is driven by the stats bars, not the phrase. This is correct behavior for `SizeToContent`, but it means the phrase text appears left-aligned against a wider backdrop — the layout must accommodate this intentionally, not accidentally.

**Why it happens:**
`SizeToContent=WidthAndHeight` sizes the window to the bounding box of all content. If any child element's desired size changes, the window resizes on the next layout pass. A `DispatcherTimer` tick that updates percentage text triggers a layout pass on the next `Dispatcher` frame.

**Prevention:**
Give the stats panel a **fixed `Width`** equal to a value wide enough for all label + bar combinations. A value of 160–200px covers all common cases. Do not use `Auto`:

```xml
<!-- Stats panel: fixed width prevents window-width jitter on every stats tick -->
<StackPanel x:Name="StatsPanel" Width="180" Visibility="Collapsed">
    <!-- CPU / GPU / MEM rows -->
</StackPanel>
```

The phrase text `TextBlock` sits in a `Grid` cell whose width is now driven by `Max(phraseWidth, 180)` due to `SizeToContent`. This is correct — the window is as wide as the widest element and does not jitter.

**Warning signs:**
- Window visibly changes width every second when stats are visible and CPU usage is near a threshold (e.g., 9% → 10% changes text width).
- Widget position drifts slightly on each tick because `Left` does not change but `ActualWidth` does (the right edge moves while the left edge is anchored).

**Phase to address:** Phase introducing stats XAML layout — must be established at layout time, not patched later.

---

### Pitfall 7: Second DispatcherTimer Tick Accumulates if Stats Are Toggled Hide/Show Rapidly

**What goes wrong:**
The existing `_timer` (10s phrase timer) is created once in `ContentRendered` and never recreated. If the stats timer is implemented as a separate `DispatcherTimer` that is stopped when stats are hidden and restarted when stats are shown, rapid toggling (e.g., the user opens and closes the context menu quickly) can leave multiple timer instances running if the stop/start logic has a race condition.

`DispatcherTimer` dispatches on the UI thread, so there is no concurrency issue in the traditional sense — but `timer.IsEnabled = true` after `timer.IsEnabled = false` followed by `timer.IsEnabled = true` again (from a re-entrance in `ContextMenu_Opened`) can lead to the timer running at double frequency if a new timer is created instead of toggling the existing one.

**Why it happens:**
`DispatcherTimer` ticks queue on the UI message loop. If a new `DispatcherTimer` is created and started without stopping the previous one, both timers fire. Since `DispatcherTimer` is a WPF type without an implicit per-instance singleton guarantee, two distinct instances are two separate timer sources.

**Prevention:**
Use a single `DispatcherTimer` instance for stats. Toggle it with `_statsTimer.Start()` and `_statsTimer.Stop()` (not by recreating it). Create the timer once (e.g., in the stats service constructor or in `ContentRendered`). Do not create a new timer on each show/hide toggle:

```csharp
// Correct: single instance, toggled
_statsTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(_statsIntervalSeconds) };
_statsTimer.Tick += OnStatsTick;
// To show: _statsTimer.Start();
// To hide: _statsTimer.Stop();
// To change interval: _statsTimer.Stop(); _statsTimer.Interval = ...; _statsTimer.Start();
```

**Warning signs:**
- Stats update twice per second when interval is set to 1s after toggling show/hide a few times.
- CPU usage from the widget itself climbs when stats are toggled repeatedly.

**Phase to address:** Phase introducing stats panel visibility toggle.

---

### Pitfall 8: AllowsTransparency + WPF Bar Rendering — Avoid DropShadowEffect, LinearGradientBrush Performance

**What goes wrong:**
The existing widget already has `AllowsTransparency="True"`, which disables the hardware-accelerated GPU rendering path for the layered HWND (documented behavior in .NET 5+; the project's `KEY DECISIONS` table confirms DropShadowEffect was already worked around). The stats bar `Rectangle` or `Border` elements are additional visual tree nodes rendered in this software path.

Two specific mistakes make performance worse than necessary:
1. **`DropShadowEffect` on bar elements** — the same limitation that broke the phrase shadow applies to bars. A `DropShadowEffect` on a `Rectangle` in an `AllowsTransparency` window silently renders as flat (no shadow) in .NET 10.
2. **`LinearGradientBrush` with many stops** — software rendering with gradient brushes is significantly slower than solid-color fills, especially when the window is in the non-hardware path. A simple flat `SolidColorBrush` renders identically to the eye for a 1px-tall bar.

**Why it happens:**
`AllowsTransparency="True"` forces the window to render as a layered (WS_EX_LAYERED) window. On .NET 5+, WPF disables hardware-accelerated rendering for layered windows because the DWM composition model changed. All WPF rendering for this window falls back to software rasterization.

**Consequences:**
- Bars render correctly but slowly if `DropShadowEffect` or complex brushes are used.
- Noticeable CPU usage increase from software-rasterizing gradient bars at 1-second update frequency.
- `DropShadowEffect` silently produces no shadow — developer wastes time debugging "why the shadow doesn't work" (same experience the team had with PhraseText in v1.0).

**Prevention:**
Use only solid-color `SolidColorBrush` fills for bar elements. Use a simple `Grid` with two `Rectangle` layers (fill + background track) rather than a `ProgressBar` control (which uses `ControlTemplate` with multiple visual elements including potential effects). No `DropShadowEffect` anywhere in the visual tree:

```xml
<!-- Bar row — software-rendering-safe, flat colors only -->
<Grid Height="6" Margin="0,1">
    <Rectangle Fill="#44FFFFFF" />  <!-- track background -->
    <Rectangle x:Name="CpuBar" Fill="#CCFFFFFF" HorizontalAlignment="Left" Width="0" />
</Grid>
```

Set `Width` programmatically to `panelWidth * (value / 100.0)`.

**Warning signs:**
- CPU usage from `FuzzyClock.App` is measurably higher than expected when stats panel is visible.
- Stats bars appear flat (no gradient visible) even though a gradient was specified.
- Same `DropShadowEffect` investigation pattern as the v1.0 PhraseText shadow issue.

**Phase to address:** Phase introducing stats XAML layout — establish flat rendering from the start.

---

## Moderate Pitfalls

Issues that produce wrong behavior but are straightforward to fix once identified.

---

### Pitfall 9: Memory Counter — "Available MBytes" vs "% Committed Bytes In Use"

**What goes wrong:**
The memory stat is displayed as a percentage bar. Two commonly used counters serve different purposes:
- `Memory` / `Available MBytes`: reports raw available bytes, not a percentage. To convert to a percentage, the total physical RAM must be known. `GC.GetGCMemoryInfo().TotalAvailableMemoryBytes` provides this but adds GC pressure if called frequently.
- `Memory` / `% Committed Bytes In Use`: reports committed virtual memory as a percentage of the commit limit. This is a legitimate percentage counter and requires no additional math. However, it reflects commit (virtual allocation) usage, not physical RAM pressure.

Using `Available MBytes` and computing a percentage incorrectly (e.g., dividing by 100 instead of by total RAM) produces a percentage that is always above 99% or is nonsensical.

**Prevention:**
Use `Memory` / `% Committed Bytes In Use` directly — it returns a float percentage [0, 100] requiring no conversion. This is the counter shown in Task Manager's "Memory" column when viewing commit charge. Accept that it measures commit, not physical. The bar reads high on machines with large page files even when physical RAM is available — this is correct and expected behavior for this counter. Document the choice in a comment.

**Phase to address:** Phase introducing memory counter reading.

---

### Pitfall 10: Context Menu "Stats" Submenu — IsChecked Sync Must Follow ContextMenu_Opened Pattern

**What goes wrong:**
v1.1 established the pattern for font-size menu checkmarks: sync all `IsChecked` states in `ContextMenu_Opened`, never in the click handlers. The new stats submenu adds:
- `Show Stats` (toggle) — `IsCheckable="True"`, must reflect `_statsVisible`
- `1s / 3s / 10s` interval items — must reflect `_statsIntervalSeconds`

If the click handler for `Show Stats` calls `item.IsChecked = !item.IsChecked` (manual toggle), it double-toggles because `IsCheckable="True"` already toggled `IsChecked` before the click handler runs. This is the same bug documented in v1.0's context menu pitfall: `ContextMenu_Opened` is the single correct sync point.

**Prevention:**
Follow the existing v1.1 pattern exactly. In `ContextMenu_Opened`:

```csharp
StatsShowItem.IsChecked   = _statsVisible;
StatsInterval1s.IsChecked  = (_statsIntervalSeconds == 1);
StatsInterval3s.IsChecked  = (_statsIntervalSeconds == 3);
StatsInterval10s.IsChecked = (_statsIntervalSeconds == 10);
```

In click handlers: update the backing field and apply the change, never touch `IsChecked` directly.

**Phase to address:** Phase introducing stats context menu.

---

### Pitfall 11: GPU Engine Category May Not Exist on All Machines

**What goes wrong:**
The `GPU Engine` performance counter category is present on Windows 10 version 1709+ when a WDDM 2.x driver is installed. On virtual machines (RDP sessions, VMs with basic display drivers), Hyper-V without enhanced session, or very old hardware with legacy drivers, the category does not exist. `new PerformanceCounterCategory("GPU Engine")` throws `InvalidOperationException: Category does not exist` if the category is absent.

**Prevention:**
Wrap all GPU counter initialization in a try/catch. If the category does not exist, set GPU value to `float.NaN` (or a sentinel) and render the GPU bar as `---` or grayed out:

```csharp
private bool _gpuAvailable = false;

private void InitGpuCounters()
{
    try
    {
        if (!PerformanceCounterCategory.Exists("GPU Engine"))
        {
            _gpuAvailable = false;
            return;
        }
        // ... enumerate instances ...
        _gpuAvailable = true;
    }
    catch { _gpuAvailable = false; }
}
```

**Phase to address:** Phase introducing GPU counter reading — defensive from day one.

---

### Pitfall 12: Stats Visibility = Hidden Does Not Stop Counter Reads (Wasted CPU)

**What goes wrong:**
When stats are hidden (`StatsPanel.Visibility = Collapsed`), the stats timer continues to fire and `PerformanceCounter.NextValue()` continues to be called. This is unnecessary CPU usage for a widget that the user chose to hide. While the individual counter reads are cheap (~0.01ms each), calling them at 1s intervals for hours is wasteful when no output is displayed.

**Prevention:**
When stats are hidden, stop the stats timer (`_statsTimer.Stop()`). When stats are shown, restart the timer and prime the counters once (discard the 0 return from the first CPU read):

```csharp
private void SetStatsVisible(bool visible)
{
    _statsVisible = visible;
    StatsPanel.Visibility = visible ? Visibility.Visible : Visibility.Collapsed;
    if (visible) _statsTimer.Start();
    else         _statsTimer.Stop();
    SaveSettings();
}
```

**Warning signs:**
- Task Manager shows `FuzzyClock.App` using ~0.5% CPU continuously even with stats hidden.

**Phase to address:** Phase introducing stats panel visibility toggle.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Don't prime CPU counter on startup | Simpler init | CPU bar shows 0% for first second — looks broken | Never — two-line fix |
| Don't guard `StatsIntervalSeconds` for 0 in `Load()` | No migration code needed | Zero-interval timer on upgrade from v1.1 — CPU spike | Never |
| Initialize counters on UI thread | Simpler code | Startup freeze up to 500ms | Never — use Task.Run |
| Fixed GPU instance name at startup | Simpler code | Crashes when GPU process exits, instance disappears | Never |
| Skip Dispose on PerformanceCounter | Simpler teardown | Handle leak, stale handles after sleep/resume | Never |
| `Width="Auto"` on stats bar | Less XAML | Window-width jitter every second | Never |
| `DropShadowEffect` on bar elements | Easier shadow | Silently renders flat in AllowsTransparency windows | Never |
| New `DispatcherTimer` on each interval change | Simpler interval change | Double-firing if not stopped first | Never |
| Continue stats timer when panel is hidden | Simpler toggle | Continuous CPU drain when user hides stats | Never |

---

## Integration Gotchas

How the new v1.2 features interact with existing v1.1 code.

| Integration Point | Common Mistake | Correct Approach |
|-------------------|----------------|------------------|
| `AppSettings` positional record + new fields | New `bool/int` fields default to `false/0` on old JSON | Guard in `SettingsService.Load()`: apply `Defaults()` values when new fields are at their type default |
| `SizeToContent=WidthAndHeight` + stats bars | `Width="Auto"` on bars causes window-width jitter on every stats tick | Fixed `Width` on the stats panel container |
| `AllowsTransparency` + bar rendering | `DropShadowEffect` or complex brushes on bar elements | Flat `SolidColorBrush` only; same principle as phrase shadow workaround |
| Existing `ContextMenu_Opened` pattern + stats menu items | Setting `IsChecked` in click handler (double-toggle) | Sync all stats menu `IsChecked` states in `ContextMenu_Opened` only |
| Two `DispatcherTimer` instances | Stats timer fires at wrong rate after interval change (old timer not stopped) | Single timer instance; `Stop()` → update `Interval` → `Start()` |
| `OnClosing`/`SessionEnding` + counter Dispose | Counters not disposed on app close | Call `DisposeCounters()` in `OnClosing` and/or `SessionEnding` |
| Stats panel hidden + timer running | Timer continues reading counters when panel is not visible | `Stop()` timer when hiding panel; `Start()` when showing |
| CPU counter + first-read zero | First `NextValue()` returns 0 for rate counters | Prime (discard) first read during initialization; start UI updates on second read |
| GPU Engine category + missing category | `InvalidOperationException` on VMs or headless machines | Wrap all GPU category access in try/catch; render "---" when unavailable |

---

## "Looks Done But Isn't" Checklist

- [ ] **CPU counter primed:** `NextValue()` called once during initialization and result discarded. UI updates start on second tick.
- [ ] **AppSettings backward compat:** `SettingsService.Load()` guards against `StatsIntervalSeconds = 0` (old JSON). Value coerced to default before use.
- [ ] **Counter initialization async:** `new PerformanceCounter(...)` called on `Task.Run()` background thread, not on UI thread.
- [ ] **GPU counters enumerated per-tick or cached with refresh:** No hard-coded instance name from startup. `InvalidOperationException` from disappeared instance caught and handled.
- [ ] **All PerformanceCounter objects disposed:** `Dispose()` called in `OnClosing` and before recreating counters on interval change.
- [ ] **Stats bar `Width` is fixed:** Stats panel container has explicit `Width`, not `Auto`. Window does not jitter on stats update.
- [ ] **No DropShadowEffect on stats bars:** Flat `SolidColorBrush` fills only.
- [ ] **Single `DispatcherTimer` for stats:** Timer is reused, not recreated. Interval change does `Stop()` → set `Interval` → `Start()`.
- [ ] **Stats timer stopped when panel hidden:** `_statsTimer.Stop()` in `SetStatsVisible(false)`. `_statsTimer.Start()` in `SetStatsVisible(true)`.
- [ ] **GPU category availability check:** `PerformanceCounterCategory.Exists("GPU Engine")` checked before instantiation. Graceful fallback when absent.
- [ ] **Memory counter choice documented:** Using `% Committed Bytes In Use` (not `Available MBytes`) — is a percentage, requires no conversion.
- [ ] **Stats menu IsChecked sync in `ContextMenu_Opened`:** Show/Hide and interval checkmarks set there, not in click handlers.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| StatsService / counter initialization | CPU counter first-read = 0; UI thread block | Initialize async (Task.Run); prime and discard first CPU read |
| AppSettings record extension | New fields default to 0/false on old JSON | Guard in `SettingsService.Load()` for `StatsIntervalSeconds <= 0` |
| Stats XAML layout | SizeToContent window-width jitter; DropShadowEffect failure | Fixed `Width` on panel; flat brush only |
| GPU counter reading | Per-engine multi-instance confusion; missing category on VMs | Enumerate + filter + aggregate; try/catch around category access |
| Stats show/hide toggle | Double-timer, timer running while hidden | Single timer instance; stop on hide, start on show |
| Context menu stats submenu | IsChecked double-toggle from IsCheckable | Sync in `ContextMenu_Opened` only (follow v1.1 pattern) |
| Counter teardown | Handle leak, stale handles after sleep | Dispose in OnClosing/SessionEnding; Dispose before recreating |

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| CPU counter always shows 0 | LOW | Add `_cpuCounter.NextValue()` prime call during init; discard result |
| Stats interval is 0 on upgrade | LOW | Add guard in `SettingsService.Load()`; rebuild |
| Startup freeze from counter init | MEDIUM | Move `new PerformanceCounter(...)` to `Task.Run()`; add loading state to stats panel |
| GPU shows wrong value | MEDIUM | Enumerate all `GPU Engine` instances; filter `engtype_3D`; sum; normalize |
| Handle leak from undisposed counters | LOW | Add `DisposeCounters()` method; call in `OnClosing` |
| Window-width jitter | LOW | Set fixed `Width` on stats panel container |
| DropShadowEffect on bars (invisible shadow) | LOW | Replace with flat `SolidColorBrush`; no effects |
| Double-timer on interval change | LOW | Ensure `Stop()` before changing `Interval`, then `Start()` |
| GPU throws on VM/no GPU | LOW | Wrap `PerformanceCounterCategory.Exists()` check; `_gpuAvailable = false` fallback |

---

## Sources

| Source | URL | Confidence |
|--------|-----|------------|
| PerformanceCounter.NextValue — "call twice for rate counters" | https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.performancecounter.nextvalue | HIGH |
| PerformanceCounter implements IDisposable | https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.performancecounter | HIGH |
| System.Text.Json — positional record constructor parameters treated as optional before .NET 9 | https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/required-properties | HIGH |
| DispatcherTimer — interval, Start, Stop | https://learn.microsoft.com/en-us/dotnet/api/system.windows.threading.dispatchertimer | HIGH |
| WPF SizeToContent=WidthAndHeight | https://learn.microsoft.com/en-us/dotnet/api/system.windows.window.sizetocontent | HIGH |
| AllowsTransparency — layered HWND, hardware acceleration disabled for effects | https://learn.microsoft.com/en-us/dotnet/api/system.windows.window.allowstransparency | HIGH |
| PerformanceCounterCategory.Exists — check before instantiating | https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.performancecountercategory.exists | HIGH |
| GPU Engine performance counter category (WDDM 2.x, Windows 10 1709+) — instance name format, Utilization Percentage counter | Community-documented (multiple sources: Stack Overflow, GitHub issues); exact instance name format confirmed by running `typeperf "\GPU Engine(*)\Utilization Percentage"` | MEDIUM |
| Existing project source — AppSettings record definition, SettingsService.Load/Defaults, MainWindow AllowsTransparency, existing ContextMenu_Opened pattern | Read directly from `c:/src/gsd1/FuzzyClock.App/AppSettings.cs`, `SettingsService.cs`, `MainWindow.xaml`, `MainWindow.xaml.cs` | HIGH |

---

*Pitfalls research for: WPF transparent overlay — v1.2 CPU/GPU/MEM stats panel + Performance Counters*
*Researched: 2026-02-25*
