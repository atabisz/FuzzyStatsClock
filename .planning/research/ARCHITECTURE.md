# Architecture Research

**Domain:** WPF transparent desktop widget — system stats panel integration (v1.2)
**Researched:** 2026-02-25
**Confidence:** HIGH

---

## System Overview

The v1.2 stats panel layers on top of the v1.1 architecture. No components are removed. Three files
are modified (AppSettings, MainWindow.xaml, MainWindow.xaml.cs) and one new file is added
(StatsService.cs). SettingsService.cs, App.xaml.cs, and FuzzyClock.Core are untouched.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          FuzzyClock.App (WPF)                             │
├──────────────────────────────────────────────────────────────────────────┤
│  App.xaml.cs          MainWindow.xaml.cs          SettingsService.cs      │
│  (unchanged)          (MODIFIED)                  (unchanged)             │
│                            |                           |                  │
│                            |  ApplySettings()          | Load/Save        │
│                            |  SaveSettings()           v                  │
│                            |                      AppSettings.cs          │
│                            |                      (MODIFIED: +2 fields)   │
│                            |                                              │
│                   ┌────────┴──────────┐                                   │
│                   |                   |                                   │
│            _phraseTimer         _statsTimer                               │
│            (10s, existing)      (NEW: 1s/3s/10s)                          │
│                   |                   |                                   │
│            PhraseEngine         StatsService.cs (NEW)                     │
│            (unchanged)               |                                    │
│                                      | PerformanceCounter x3              │
│                                      | (CPU, GPU, MEM)                    │
│                                      v                                    │
│                                  Windows OS                               │
├──────────────────────────────────────────────────────────────────────────┤
│  MainWindow.xaml (MODIFIED)                                               │
│                                                                           │
│  Window > Grid > Border > Grid (inner)                                    │
│                              ├── Row 0: ShadowText + PhraseText (z-stack) │
│                              └── Row 1: StatsPanel (Visibility-toggled)   │
│                                           ├── CPU bar + label             │
│                                           ├── GPU bar + label             │
│                                           └── MEM bar + label             │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Component Responsibilities

| Component | Status | Responsibility |
|-----------|--------|----------------|
| `App.xaml.cs` | Unchanged | Startup, hidden owner, SessionEnding backup save |
| `MainWindow.xaml.cs` | Modified | Add _statsTimer, StatsService lifecycle, stats UI update, new ContextMenu handlers |
| `MainWindow.xaml` | Modified | Add Row 1 stats panel, Stats ContextMenu parent with submenu |
| `AppSettings.cs` | Modified | Add `bool StatsVisible` and `int StatsInterval` fields |
| `SettingsService.cs` | Unchanged | Load/Save/Clamp — works with new AppSettings fields automatically |
| `StatsService.cs` | New | PerformanceCounter ownership, Refresh(), CPU/GPU/MEM properties, IDisposable |
| `FuzzyClock.Core` | Unchanged | PhraseEngine — no changes |

---

## XAML Layout Changes

### Problem: Inner Grid Uses Single-Cell Z-Stack

The current inner `Grid` (inside `Border`) has no RowDefinitions. Both TextBlocks occupy the same
implicit Row 0, differentiated only by Z-order and RenderTransform offset. This is correct for the
shadow-over-text technique.

Adding stats below the phrase requires an explicit RowDefinition split.

### Solution: Add RowDefinitions to Inner Grid

```xml
<!-- MainWindow.xaml — inner Grid inside the Border -->
<Grid>
    <Grid.RowDefinitions>
        <RowDefinition Height="Auto" />   <!-- Row 0: phrase text -->
        <RowDefinition Height="Auto" />   <!-- Row 1: stats panel -->
    </Grid.RowDefinitions>

    <!-- Row 0: shadow + phrase (unchanged, add Grid.Row="0" explicitly) -->
    <TextBlock x:Name="ShadowText" Grid.Row="0" ... />
    <TextBlock x:Name="PhraseText" Grid.Row="0" ... />

    <!-- Row 1: stats panel -->
    <StackPanel x:Name="StatsPanel" Grid.Row="1" Visibility="Collapsed"
                Margin="0,4,0,0">
        <!-- CPU row -->
        <Grid Margin="0,1,0,1">
            <Grid.ColumnDefinitions>
                <ColumnDefinition Width="30" />   <!-- label -->
                <ColumnDefinition Width="*" />    <!-- bar -->
                <ColumnDefinition Width="36" />   <!-- pct text -->
            </Grid.ColumnDefinitions>
            <TextBlock Grid.Column="0" Text="CPU" Foreground="White"
                       FontFamily="Segoe UI Light" FontSize="12"
                       VerticalAlignment="Center" />
            <Border Grid.Column="1" Height="8" Background="#40FFFFFF"
                    CornerRadius="3" Margin="4,0,4,0">
                <Border x:Name="CpuBar" HorizontalAlignment="Left"
                        Background="White" CornerRadius="3" Height="8"
                        Width="0" />
            </Border>
            <TextBlock x:Name="CpuPct" Grid.Column="2"
                       Foreground="White" FontFamily="Segoe UI Light"
                       FontSize="12" HorizontalAlignment="Right"
                       VerticalAlignment="Center" Text="0%" />
        </Grid>

        <!-- GPU row (identical structure, names: GpuBar, GpuPct) -->
        <!-- MEM row (identical structure, names: MemBar, MemPct) -->
    </StackPanel>
</Grid>
```

**Row sizing: `Height="Auto"` for both rows.** Auto-size rows shrink to content. When `StatsPanel`
is `Collapsed`, Row 1 consumes zero height — the window is exactly the same size as v1.1 when stats
are hidden. When `Visible`, Row 1 expands to contain the stat rows.

### SizeToContent Interaction with Bar Widths

`SizeToContent=WidthAndHeight` means the window width equals the widest element in the layout.
The phrase text drives the window width. The stats panel is inside the same Border, so its columns
must fit within or expand that width.

**The bar column uses `Width="*"` (star-sizing).** Star columns in a Grid expand to fill available
space — they do NOT drive the parent to a minimum width. The phrase text column (Row 0) establishes
the available width; the bar column fills whatever is left after the label and pct columns.

**Critical constraint:** The bar's inner `Border` (the fill indicator, e.g., `CpuBar`) has its
`Width` set from code-behind as a fraction of the available bar-track width. To compute this, the
code reads `ActualWidth` of the track `Border` after layout — this requires calling `UpdateLayout()`
or deferring to `Dispatcher.BeginInvoke` after the stats update triggers a layout pass.

**Recommended approach:** After setting all three bar widths in the stats timer tick, do NOT call
`UpdateLayout()` — WPF already schedules a layout pass on the next render frame when a property
changes. The bar fill width computation should use the previously measured track width stored in
a field, updated in the `SizeChanged` handler for the window or the track border.

**Simpler alternative:** Fix the stats panel width explicitly by setting
`MinWidth` on the outer stats panel equal to a constant (e.g., 180px). This guarantees the bar
track is at least that wide regardless of phrase text width. If the phrase is narrower, the window
expands to fit the stats panel. This is the recommended approach for simplicity and predictability.

```xml
<StackPanel x:Name="StatsPanel" Grid.Row="1" MinWidth="180" ... >
```

---

## New Timer: _statsTimer

### Why a Separate Timer Is Required

The existing `_phraseTimer` runs at 10s intervals. Stats must update at 1s, 3s, or 10s as chosen
by the user. These are independent concerns:

- Phrase update: polls `PhraseEngine.GetPhrase()`, only repaints when phrase changes
- Stats update: polls `PerformanceCounter.NextValue()` on every tick regardless of change

Using a single timer would force the phrase to check at the stats interval (wasteful) or force
stats to update at 10s regardless of user setting (wrong). Two timers are the correct design.

### Timer Initialization

`_statsTimer` is created alongside `_phraseTimer` in the `ContentRendered` handler, after
`_statsService` is initialized. This keeps all async-deferred initialization in one place.

```csharp
// In ContentRendered handler, after existing _timer setup:
_statsService = new StatsService();
_statsTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(_currentStatsInterval) };
_statsTimer.Tick += (_, _) => UpdateStatsDisplay();
if (_statsVisible)
    _statsTimer.Start();
```

### Timer and Visibility Coupling

The stats timer should only run when the stats panel is visible. When the user hides the stats
panel via the context menu, stop `_statsTimer`. When the user shows the stats panel, start it and
immediately call `UpdateStatsDisplay()` so the first tick appears instantly rather than after the
full interval.

```csharp
private void SetStatsVisible(bool visible)
{
    _statsVisible = visible;
    StatsPanel.Visibility = visible ? Visibility.Visible : Visibility.Collapsed;
    if (visible)
    {
        UpdateStatsDisplay();   // immediate first reading
        _statsTimer.Start();
    }
    else
    {
        _statsTimer.Stop();
    }
    UpdateLayout();   // SizeToContent: window must re-measure after panel visibility change
    if (_hasUserPosition)
    {
        var clamped = SettingsService.Clamp(
            new AppSettings(Left, Top, _currentFontSize, _statsVisible, _currentStatsInterval),
            ActualWidth, ActualHeight);
        Left = clamped.Left;
        Top  = clamped.Top;
    }
    SaveSettings();
}
```

---

## StatsService: PerformanceCounter Lifecycle

### Recommended Design

`StatsService` is a single-responsibility class that owns the three `PerformanceCounter` instances
and exposes the last-read values as properties. It implements `IDisposable`.

```csharp
// FuzzyClock.App/StatsService.cs
using System.Diagnostics;

namespace FuzzyClock.App;

public sealed class StatsService : IDisposable
{
    // CPU: built-in Windows Performance Counter
    private readonly PerformanceCounter _cpu =
        new("Processor", "% Processor Time", "_Total");

    // GPU: requires "GPU Engine" category, instance filter "engtype_3D"
    // May return 0 on machines with no discrete GPU or unsupported drivers.
    // See Pitfalls for GPU counter naming.
    private PerformanceCounter? _gpu;

    // MEM: available bytes divided into total
    private readonly PerformanceCounter _memAvail =
        new("Memory", "Available Bytes");

    private bool _disposed;

    // Cached last values — updated by Refresh(), read by MainWindow
    public float CpuPercent { get; private set; }
    public float GpuPercent { get; private set; }
    public float MemPercent { get; private set; }

    public StatsService()
    {
        // Prime the CPU counter — first call always returns 0 (known Windows behavior)
        _cpu.NextValue();
        InitGpuCounter();
    }

    private void InitGpuCounter()
    {
        try
        {
            // GPU Engine category instance names vary by driver/hardware.
            // Enumerate, find "engtype_3D", sum utilization across all adapters.
            // If category does not exist, _gpu remains null — GpuPercent stays 0.
            var cat = new PerformanceCounterCategory("GPU Engine");
            var instances = cat.GetInstanceNames()
                              .Where(n => n.Contains("engtype_3D"))
                              .ToArray();
            // Use first matching instance; real apps should sum across adapters.
            if (instances.Length > 0)
                _gpu = new PerformanceCounter("GPU Engine",
                    "Utilization Percentage", instances[0]);
        }
        catch { /* GPU Engine category absent — treat as not available */ }
    }

    public void Refresh()
    {
        if (_disposed) return;
        CpuPercent = Math.Clamp(_cpu.NextValue(), 0f, 100f);
        GpuPercent = _gpu is not null
            ? Math.Clamp(_gpu.NextValue(), 0f, 100f)
            : 0f;
        // MEM % = 1 - (available / total)
        float totalBytes = (float)new Microsoft.VisualBasic.Devices.ComputerInfo()
            .TotalPhysicalMemory;   // AVOID — adds VB runtime dependency
        // Use GlobalMemoryStatusEx via kernel32 interop OR use Performance Counter
        // "Memory" / "% Committed Bytes In Use" as a proxy
        MemPercent = Math.Clamp(_memAvail.NextValue(), 0f, 100f);
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        _cpu.Dispose();
        _gpu?.Dispose();
        _memAvail.Dispose();
    }
}
```

**Note on MEM % calculation:** `PerformanceCounter("Memory", "Available Bytes")` gives free bytes,
not a percentage. To compute used%, the code needs total installed RAM. Two options:

1. **Use `PerformanceCounter("Memory", "% Committed Bytes In Use")`** — this is a built-in counter
   that gives committed memory as a percent of the commit limit. It is close to but not identical
   to "RAM used / total RAM." Suitable for a widget display.

2. **P/Invoke `GlobalMemoryStatusEx` from kernel32.dll** — exact "dwMemoryLoad" field is the
   precise percentage. No extra dependencies, purely Win32.

Recommended: `% Committed Bytes In Use` for simplicity. If precise physical RAM% is required,
use the P/Invoke path. Document the choice.

### Dispose Pattern in MainWindow

`StatsService` must be disposed when the window closes. Wire it to `OnClosing`:

```csharp
protected override void OnClosing(System.ComponentModel.CancelEventArgs e)
{
    _statsTimer?.Stop();
    _statsService?.Dispose();
    SaveSettings();
    base.OnClosing(e);
}
```

Order matters: stop the timer before disposing the service. The timer tick calls
`_statsService.Refresh()` — if the service is disposed while the timer is running, the tick
fires on a disposed object. Stop-then-dispose is the safe sequence.

### Static vs Instance

`StatsService` is an instance class owned by `MainWindow`. Using static fields for
`PerformanceCounter` objects creates disposal problems (no owner responsible for cleanup) and
makes unit testing harder. Instance ownership in MainWindow is the correct pattern.

---

## AppSettings Record Changes

### Current Record (v1.1)

```csharp
public record AppSettings(double Left, double Top, int FontSize);
```

### Required Addition (v1.2)

```csharp
public record AppSettings(
    double Left,
    double Top,
    int FontSize,
    bool StatsVisible,
    int StatsInterval);
```

### JSON Forward/Backward Compatibility

`System.Text.Json` deserializes positional records by matching JSON property names to constructor
parameter names (case-insensitive by default). When a v1.1 `settings.json` is loaded by the v1.2
app, the JSON will not contain `StatsVisible` or `StatsInterval` properties.

**Problem:** `JsonSerializer.Deserialize<AppSettings>` will throw or return null if required
constructor parameters are missing.

**Solution: Change the default in `SettingsService.Defaults()` only — not sufficient alone.**
The real fix is to add a fallback in `SettingsService.Load()` using `JsonException` catch, OR
use `JsonSerializerOptions` with `PropertyNameCaseInsensitive = true` and optional constructor
parameters.

**Recommended approach:** The positional record constructor cannot have default parameter values
and remain compatible with `System.Text.Json`'s positional record deserialization in .NET 10.
Switch to a non-positional record with `init` properties that have default values:

```csharp
public record AppSettings
{
    public double Left          { get; init; } = -1;
    public double Top           { get; init; } = 20;
    public int    FontSize      { get; init; } = 32;
    public bool   StatsVisible  { get; init; } = true;
    public int    StatsInterval { get; init; } = 3;
}
```

`System.Text.Json` populates properties by name from JSON, and missing properties retain their
`init` defaults. This provides forward and backward compatibility: old JSON files load correctly
with new defaults for the new fields; new JSON files load fully.

**If the positional record must be kept** (to avoid changing existing construction sites), wrap
the deserialize call in a try/catch that falls back to defaults on any exception. This is already
present in `SettingsService.Load()` — the catch-all `return Defaults()` handles the migration case
on first launch after upgrade. After that first launch, the file is re-saved with all fields.

**Update `SettingsService.Defaults()`:**

```csharp
public static AppSettings Defaults() => new()
{
    Left = -1, Top = 20, FontSize = 32,
    StatsVisible = true, StatsInterval = 3
};
```

**Update `SaveSettings()` in MainWindow to include new fields:**

```csharp
internal void SaveSettings()
{
    SettingsService.Save(new AppSettings
    {
        Left = Left, Top = Top,
        FontSize = _currentFontSize,
        StatsVisible = _statsVisible,
        StatsInterval = _currentStatsInterval
    });
}
```

---

## ContextMenu Changes

### New Structure

```xml
<ContextMenu Opened="ContextMenu_Opened">
    <MenuItem Header="Font Size">
        <MenuItem x:Name="FontSmall"  Header="Small (16pt)"  IsCheckable="True" Click="FontSmall_Click" />
        <MenuItem x:Name="FontMedium" Header="Medium (24pt)" IsCheckable="True" Click="FontMedium_Click" />
        <MenuItem x:Name="FontLarge"  Header="Large (32pt)"  IsCheckable="True" Click="FontLarge_Click" />
    </MenuItem>
    <MenuItem Header="Stats">
        <MenuItem x:Name="StatsShow"     Header="Show Stats"    IsCheckable="True" Click="StatsShow_Click" />
        <Separator />
        <MenuItem Header="Update Interval">
            <MenuItem x:Name="StatsInterval1s"  Header="1 second"   IsCheckable="True" Click="StatsInterval1s_Click" />
            <MenuItem x:Name="StatsInterval3s"  Header="3 seconds"  IsCheckable="True" Click="StatsInterval3s_Click" />
            <MenuItem x:Name="StatsInterval10s" Header="10 seconds" IsCheckable="True" Click="StatsInterval10s_Click" />
        </MenuItem>
    </MenuItem>
    <MenuItem Header="Close" Click="CloseMenuItem_Click" />
</ContextMenu>
```

### ContextMenu_Opened Sync (Critical)

The existing pattern syncs `IsChecked` on `Opened` to avoid double-toggle (WPF toggles
`IsCheckable` items on click; syncing in the handler prevents fighting that toggle).

Add stats items to the same handler:

```csharp
private void ContextMenu_Opened(object sender, RoutedEventArgs e)
{
    // Existing font size sync
    FontSmall.IsChecked  = (_currentFontSize == 16);
    FontMedium.IsChecked = (_currentFontSize == 24);
    FontLarge.IsChecked  = (_currentFontSize == 32);

    // Stats sync
    StatsShow.IsChecked           = _statsVisible;
    StatsInterval1s.IsChecked     = (_currentStatsInterval == 1);
    StatsInterval3s.IsChecked     = (_currentStatsInterval == 3);
    StatsInterval10s.IsChecked    = (_currentStatsInterval == 10);
}
```

### Click Handlers

```csharp
private void StatsShow_Click(object sender, RoutedEventArgs e)
    => SetStatsVisible(!_statsVisible);

private void StatsInterval1s_Click(object sender, RoutedEventArgs e)
    => SetStatsInterval(1);

private void StatsInterval3s_Click(object sender, RoutedEventArgs e)
    => SetStatsInterval(3);

private void StatsInterval10s_Click(object sender, RoutedEventArgs e)
    => SetStatsInterval(10);

private void SetStatsInterval(int seconds)
{
    _currentStatsInterval = seconds;
    _statsTimer.Interval = TimeSpan.FromSeconds(seconds);
    SaveSettings();
    // Do NOT restart the timer — changing Interval on a running DispatcherTimer
    // takes effect on the next tick automatically.
}
```

---

## Data Flow Changes

### Startup Flow (v1.2 additions in bold)

```
App.OnStartup()
    |
    +-- SettingsService.Load() -> AppSettings
    |       +-- reads JSON file (or returns defaults)
    |       **+-- StatsVisible, StatsInterval included in AppSettings**
    |
    +-- new MainWindow()
    +-- mainWindow.ApplySettings(settings)
    |       +-- _currentFontSize = settings.FontSize
    |       **+-- _statsVisible = settings.StatsVisible**
    |       **+-- _currentStatsInterval = settings.StatsInterval**
    |       +-- PhraseText/ShadowText FontSize applied
    |       **+-- StatsPanel.Visibility set from _statsVisible**
    |       +-- if Left != -1: Left/Top applied
    |
    +-- mainWindow.SetInitialPhrase(...)
    +-- mainWindow.Show()
            |
            +-- ContentRendered fires
                    +-- position clamped or PositionTopRight()
                    +-- _timer (phrase, 10s) started
                    **+-- _statsService = new StatsService()**
                    **+-- _statsTimer created with _currentStatsInterval**
                    **+-- if _statsVisible: UpdateStatsDisplay() + _statsTimer.Start()**
```

### Stats Update Flow

```
_statsTimer.Tick fires (on UI thread via DispatcherTimer)
    |
    +-- _statsService.Refresh()
    |       +-- _cpu.NextValue()  -> CpuPercent
    |       +-- _gpu?.NextValue() -> GpuPercent
    |       +-- _mem.NextValue()  -> MemPercent
    |
    +-- UpdateStatsDisplay()
            +-- CpuPct.Text = $"{_statsService.CpuPercent:F0}%"
            +-- CpuBar.Width = trackWidth * (CpuPercent / 100f)
            +-- (same for GPU, MEM)
            // No UpdateLayout() call here — WPF schedules layout automatically
            // No re-clamp needed — stats panel width is fixed (MinWidth), window
            // width does not change on stats tick
```

### Settings Save Flow (unchanged call sites, new fields added)

`SaveSettings()` is still called in the same places as v1.1 (after drag, on Closing, on
SessionEnding). The method now includes `StatsVisible` and `StatsInterval` in the `AppSettings`
construction. The new call sites that trigger saves are:
- `SetStatsVisible()` — on stats show/hide toggle
- `SetStatsInterval()` — on interval change

---

## Integration Points

### New File

| File | Purpose | Key Dependencies |
|------|---------|-----------------|
| `FuzzyClock.App/StatsService.cs` | PerformanceCounter ownership, Refresh(), IDisposable | `System.Diagnostics.PerformanceCounter` (in-box .NET) |

### Modified Files

| File | What Changes |
|------|-------------|
| `FuzzyClock.App/AppSettings.cs` | Add `bool StatsVisible` and `int StatsInterval` properties; convert from positional to init-property record for JSON forward-compatibility |
| `FuzzyClock.App/MainWindow.xaml` | Add RowDefinitions to inner Grid; add StatsPanel StackPanel in Row 1; add Stats ContextMenu parent with Show Stats + Update Interval submenu |
| `FuzzyClock.App/MainWindow.xaml.cs` | Add `_statsService`, `_statsTimer`, `_statsVisible`, `_currentStatsInterval` fields; extend `ApplySettings()`, `SaveSettings()`, `OnClosing()`; add `SetStatsVisible()`, `SetStatsInterval()`, `UpdateStatsDisplay()` methods; add new ContextMenu click handlers; extend `ContextMenu_Opened()` |

### Unchanged Files

| File | Why Unchanged |
|------|--------------|
| `FuzzyClock.App/SettingsService.cs` | Load/Save/Clamp work with any `AppSettings` shape; `Defaults()` needs updating but that is a one-line change inside the existing method |
| `FuzzyClock.App/App.xaml.cs` | Startup and SessionEnding flows unchanged; `mainWindow.ApplySettings()` receives the new `AppSettings` transparently |
| `FuzzyClock.Core/` | PhraseEngine — no changes |

---

## Suggested Build Order

Each step is independently verifiable before the next begins.

**Step 1: AppSettings record migration**
- Convert from positional record to init-property record
- Add `StatsVisible` (default `true`) and `StatsInterval` (default `3`) properties
- Update `SettingsService.Defaults()` to use object initializer syntax
- Verify: existing v1.1 `settings.json` loads correctly (missing fields get defaults)
- Verify: new settings.json round-trips all five fields correctly

**Step 2: StatsService (no UI)**
- Write `StatsService.cs` with three PerformanceCounters and `Refresh()` method
- Wire a temporary debug output to verify CPU, GPU, MEM values are non-zero and reasonable
- Test the first-call-returns-zero behavior of CPU counter (prime in constructor)
- Verify IDisposable disposes all three counters cleanly

**Step 3: XAML — Stats panel structure**
- Add RowDefinitions to inner Grid
- Add StatsPanel StackPanel in Row 1 with `Visibility="Collapsed"`
- Add Stats ContextMenu parent with child MenuItems (all wired to placeholder handlers)
- Verify: widget renders identically to v1.1 with StatsPanel collapsed

**Step 4: Code-behind — stats display**
- Add `_statsService`, `_statsTimer`, `_statsVisible`, `_currentStatsInterval` fields
- Extend `ContentRendered` to initialize `StatsService` and `_statsTimer`
- Implement `UpdateStatsDisplay()` — set label text and bar widths
- Hard-code `_statsVisible = true` temporarily to test visible panel rendering
- Verify: bars update on timer tick; percentages are plausible

**Step 5: Stats visibility toggle**
- Implement `SetStatsVisible()` with timer start/stop, UpdateLayout, re-clamp, SaveSettings
- Wire `StatsShow_Click` handler
- Extend `ContextMenu_Opened` for stats IsChecked sync
- Extend `ApplySettings()` to read `_statsVisible` from `AppSettings`
- Verify: toggle hides/shows panel; window re-sizes correctly; persists across restart

**Step 6: Update interval selector**
- Implement `SetStatsInterval()` and three interval click handlers
- Extend `ContextMenu_Opened` for interval IsChecked sync
- Extend `ApplySettings()` to read `_currentStatsInterval` from `AppSettings`
- Verify: changing to 1s produces rapid updates; 10s produces slow updates; persists across restart

**Step 7: Cleanup and edge cases**
- Verify OnClosing disposes StatsService and stops _statsTimer before SaveSettings
- Test upgrade path: delete settings.json fields manually, confirm graceful load
- Test off-screen clamp with stats panel visible (larger window height)

**Dependency rationale:**
Step 1 before all: AppSettings shape must be stable before any new field is read or written.
Step 2 before Step 4: UpdateStatsDisplay() depends on StatsService existing.
Step 3 before Step 4: Code-behind needs named elements (CpuBar, GpuBar, MemBar) from XAML.
Steps 5 and 6 are independent of each other but both depend on Steps 1-4.
Step 7 last: edge-case validation after happy path is confirmed.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Using the Existing Phrase Timer for Stats Updates

**What:** Reuse `_timer` by shortening its interval to the stats update interval, and piggyback
stats refresh into the same tick handler.

**Why bad:** The phrase timer is intentionally at 10s; CPU polling at 10s is the max interval, not
the default. Users who select 1s stats interval cannot have a 1s phrase check — it's wasted CPU.
More critically: if the user selects 1s stats and the phrase fires at 1s too, the phrase flickering
(even when unchanged) causes unnecessary layout work on every second.

**Instead:** Two independent timers, each with its own interval and tick handler.

### Anti-Pattern 2: Updating Bar Width by Animating Width Directly in XAML Binding

**What:** Bind `CpuBar.Width` to a ViewModel property and let WPF update it via data binding.

**Why bad:** The widget has no ViewModel — it uses direct code-behind manipulation intentionally
(established in v1.0/v1.1). Adding a ViewModel for three properties adds boilerplate for no
architectural gain. Bar width also requires knowing the track's `ActualWidth` at the time of
calculation, which requires either a converter with element binding or code-behind anyway.

**Instead:** Set `Width` directly in `UpdateStatsDisplay()` from code-behind.

### Anti-Pattern 3: Static PerformanceCounter Fields

**What:** Declare `PerformanceCounter` instances as `static` fields on `MainWindow` or as a static
`StatsService`.

**Why bad:** Static fields have no owner responsible for disposal. `PerformanceCounter` implements
`IDisposable` because it holds an OS handle. Undisposed counters leak handles. Static lifetime
also complicates any future refactor where the window is re-created.

**Instead:** Instance ownership in `StatsService`, which is owned by `MainWindow`, disposed in
`OnClosing`.

### Anti-Pattern 4: Calling UpdateLayout() After Every Stats Tick

**What:** Call `UpdateLayout()` at the end of `UpdateStatsDisplay()` to ensure bar widths are
applied.

**Why bad:** `UpdateLayout()` is a synchronous, full layout pass on the visual tree. Calling it
every 1s (at the fastest stats interval) is unnecessary — WPF already schedules layout invalidation
when a `DependencyProperty` like `Width` changes. The layout pass happens on the next render frame
automatically.

The exception is after `StatsPanel.Visibility` changes — that does require `UpdateLayout()` because
the window must re-measure its own size immediately (for re-clamping). But normal stats tick updates
only change `Width` on inner elements that do not affect window size (bar track is constrained to
a fixed `MinWidth`).

**Instead:** No `UpdateLayout()` in the stats tick. Only call it in `SetStatsVisible()` after
toggling panel visibility.

### Anti-Pattern 5: Calculating Bar Width as a Fraction of Window ActualWidth

**What:** `CpuBar.Width = this.ActualWidth * (cpuPct / 100f);`

**Why bad:** `this.ActualWidth` is the total window width including Border padding. The bar track
column is narrower than the window due to the label and pct columns. Using window width as the
denominator makes bars wider than their container.

**Instead:** Use the `ActualWidth` of the bar track `Border` element, or use a fixed `MinWidth`
on `StatsPanel` and compute bar width from the known constant minus column widths.

---

## SizeToContent Interaction Summary

| Event | SizeToContent Effect | Action Required |
|-------|---------------------|-----------------|
| Stats panel becomes Visible | Window grows taller by stats panel height | `UpdateLayout()` + re-clamp |
| Stats panel becomes Collapsed | Window shrinks by stats panel height | `UpdateLayout()` + re-clamp |
| Stats values update (bars) | No effect — bars constrained to fixed track | None |
| Phrase text changes | Window width may change | Existing UpdateLayout() + re-clamp (unchanged) |
| Font size changes | Window width and height change | Existing UpdateLayout() + re-clamp (unchanged) |

The stats panel adding a new row means the window is now taller when stats are visible. The
`SizeToContent=WidthAndHeight` constraint means this height is automatic — no manual height
assignment needed.

---

## Sources

| Claim | Source | Confidence |
|-------|--------|------------|
| PerformanceCounter("Processor", "% Processor Time", "_Total") for CPU | https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.performancecounter | HIGH |
| First NextValue() call on CPU counter always returns 0 — prime in constructor | https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.performancecounter.nextvalue (Remarks section) | HIGH |
| "GPU Engine" / "Utilization Percentage" PerformanceCounter for GPU | https://learn.microsoft.com/en-us/windows-hardware/drivers/display/gpu-performance-counters | MEDIUM — instance name format varies by driver |
| PerformanceCounter implements IDisposable (holds OS handle) | https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.performancecounter (Remarks) | HIGH |
| System.Text.Json positional record requires all constructor params in JSON | https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/immutability | HIGH |
| Init-property record allows missing JSON properties to take default values | https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/immutability | HIGH |
| DispatcherTimer.Interval can be changed on a running timer; takes effect next tick | https://learn.microsoft.com/en-us/dotnet/api/system.windows.threading.dispatchertimer.interval | HIGH |
| Grid.ColumnDefinition Width="*" (star sizing) fills available space, does not drive parent min-width | WPF layout documentation — star columns participate in remaining space allocation | HIGH |
| Height="Auto" RowDefinition collapses to zero when content Visibility=Collapsed | WPF layout documentation — Auto rows measure content; Collapsed content measures as (0,0) | HIGH |

---

*Architecture research for: FuzzyClock v1.2 — CPU/GPU/MEM stats panel*
*Researched: 2026-02-25*
