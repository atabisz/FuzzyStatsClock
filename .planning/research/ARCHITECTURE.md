# Architecture Research

**Domain:** WPF transparent desktop widget — uptime display and rolling CPU load averages (v2.1)
**Researched:** 2026-02-27
**Confidence:** HIGH

---

## System Overview

v2.1 adds a compact uptime/load line below StatsPanel. No new files are required. Three files are
modified: `AppSettings.cs`, `MainWindow.xaml`, and `MainWindow.xaml.cs`. A rolling CPU average
buffer is added directly to `MainWindow.xaml.cs`; `StatsService.cs` and `SettingsService.cs` are
unchanged.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                            FuzzyClock.App (WPF)                               │
├──────────────────────────────────────────────────────────────────────────────┤
│  App.xaml.cs           MainWindow.xaml.cs            SettingsService.cs       │
│  (UNCHANGED)           (MODIFIED)                    (UNCHANGED)              │
│                              │                              │                 │
│                              │  ApplySettings()             │ Load/Save       │
│                              │  SaveSettings()              ▼                 │
│                              │  UpdateUptimeDisplay()  AppSettings.cs         │
│                              │                         (MODIFIED: +1 field)  │
│                              │                                                │
│                    ┌─────────┴──────────┐                                     │
│                    │                    │                                     │
│             _phraseTimer          _statsTimer                                 │
│             (10s, existing)       (1s/3s/10s, existing)                       │
│                    │                    │                                     │
│             PhraseEngine          StatsService.cs                             │
│             (UNCHANGED)           (UNCHANGED)                                 │
│                                         │                                     │
│                                    CpuPercent                                 │
│                                    (already read each tick)                   │
│                                         │                                     │
│                              Queue<float> _cpuSamples (new, in MainWindow)    │
│                              rolling averages: 1m / 5m / 15m                 │
│                                                                               │
├──────────────────────────────────────────────────────────────────────────────┤
│  MainWindow.xaml (MODIFIED: +UptimeRow TextBlock, +Stats submenu toggle)      │
│                                                                               │
│  Window                                                                       │
│    Grid                                                                       │
│      Border (ContentBorder — backdrop, existing)                              │
│        Grid (inner, 3 rows after this change)                                 │
│          Row 0: ShadowText + PhraseText (z-stack) / DialCanvas (existing)    │
│          Row 1: StatsPanel (CPU/GPU/MEM/PAG bars) (existing)                  │
│          Row 2: UptimeRow TextBlock (NEW — Collapsed by default)              │
│                  Text: "up 3d 14h 22m   0.52  0.47  0.43"                    │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Component Responsibilities

| Component | Status | Responsibility for v2.1 |
|-----------|--------|-------------------------|
| `App.xaml.cs` | Unchanged | Startup, hidden owner, SessionEnding backup save |
| `MainWindow.xaml.cs` | Modified | Add `_cpuSamples` queue; add `UpdateUptimeDisplay()`; call from `_statsTimer` tick; extend `ApplySettings()`, `SaveSettings()`, `ContextMenu_Opened()`; add toggle click handler; extend `ApplyTheme()` for UptimeRow theming |
| `MainWindow.xaml` | Modified | Add `UptimeRow` TextBlock (Row 2 in inner Grid); add "Show Uptime" toggle to Stats submenu |
| `AppSettings.cs` | Modified | Add `bool UptimeVisible { get; init; } = true` |
| `SettingsService.cs` | Unchanged | Load/Save/Clamp work with new AppSettings fields automatically via init-property defaults |
| `StatsService.cs` | Unchanged | `CpuPercent` is already read in every `_statsTimer` tick — no new counters needed |
| `FuzzyClock.Core` | Unchanged | PhraseEngine — no changes |

---

## New vs Reused

### New in MainWindow.xaml.cs

**Field: rolling CPU sample buffer**

```csharp
private readonly Queue<float> _cpuSamples = new();
// Capacity: 15 minutes worth at the configured interval.
// At 1s interval: 900 samples max. At 10s: 90 samples max.
// Trim on each tick to keep only the last 15 * 60 / intervalSeconds entries.
```

**Method: UpdateUptimeDisplay()**

Called at the end of the existing `_statsTimer.Tick` handler (which already calls `_statsService.Refresh()`). Reads `_statsService.CpuPercent` after `Refresh()` has already updated it for the same tick — no second `Refresh()` call needed.

```csharp
private void UpdateUptimeDisplay()
{
    if (UptimeRow.Visibility != Visibility.Visible) return;

    // --- Uptime ---
    TimeSpan uptime = TimeSpan.FromMilliseconds(Environment.TickCount64);
    string uptimeStr = uptime.Days > 0
        ? $"up {uptime.Days}d {uptime.Hours}h {uptime.Minutes}m"
        : $"up {uptime.Hours}h {uptime.Minutes}m";

    // --- Rolling CPU averages ---
    // CpuPercent already refreshed by _statsService.Refresh() this same tick
    _cpuSamples.Enqueue(_statsService.CpuPercent);

    int maxSamples = Math.Max(1, (15 * 60) / _statsIntervalSeconds);
    while (_cpuSamples.Count > maxSamples) _cpuSamples.Dequeue();

    float avg1m  = ComputeAvg(_cpuSamples, (int)Math.Ceiling(60.0  / _statsIntervalSeconds));
    float avg5m  = ComputeAvg(_cpuSamples, (int)Math.Ceiling(300.0 / _statsIntervalSeconds));
    float avg15m = _cpuSamples.Count > 0 ? _cpuSamples.Average() : 0f;

    UptimeText.Text = $"{uptimeStr}   {avg1m / 100f:F2}  {avg5m / 100f:F2}  {avg15m / 100f:F2}";
}

private static float ComputeAvg(Queue<float> q, int count)
{
    // Take the last `count` elements (most recent window)
    return q.Count == 0 ? 0f : q.TakeLast(Math.Min(count, q.Count)).Average();
}
```

**Note on `_statsIntervalSeconds` change:** When the user changes the update interval, the existing `SetStatsInterval()` updates `_statsIntervalSeconds` and restarts `_statsTimer`. The `_cpuSamples` queue is trimmed on each tick using the current `_statsIntervalSeconds` — no explicit reset is needed on interval change. The window of samples shrinks naturally as old samples beyond the new `maxSamples` count are trimmed at the next tick. This is acceptable; a brief transient in the averages is imperceptible at normal usage.

### Reused Patterns

**Toggle pattern:** Identical to `CpuRow`/`GpuRow`/`MemRow`/`PagRow` visibility toggles:
- XAML: `x:Name="UptimeRow"` TextBlock with `Visibility="Collapsed"` (or `Visible` since default is visible)
- Menu item: `IsCheckable="True"` in Stats submenu
- Click handler: `SetUptimeRowVisible(UptimeRow.Visibility != Visibility.Visible)`
- `ContextMenu_Opened`: `MenuUptimeVisible.IsChecked = (UptimeRow.Visibility == Visibility.Visible)`

**ApplySettings() pattern:** Set `UptimeRow.Visibility` directly (not via a method that calls `UpdateLayout()`). Same pre-Show safety invariant as all other row visibility assignments.

**SaveSettings() pattern:** Add `UptimeVisible = (UptimeRow.Visibility == Visibility.Visible)` to the AppSettings construction.

**Theming pattern:** `UptimeText.Foreground` follows accent color in `ApplyTheme()`. No new brush is needed — the existing `brush` variable in `ApplyTheme()` is reused.

---

## New Fields in AppSettings

One new field added to the existing init-property record:

```csharp
public record AppSettings
{
    // ... existing 15 fields unchanged ...
    public bool UptimeVisible { get; init; } = true;
    // Default true: uptime row visible on first launch (differs from StatsVisible which defaults false)
}
```

**Default `true` rationale:** Uptime is the headline feature of v2.1 and is lightweight to compute. Defaulting to visible (unlike stats bars which default false) means new users see the feature immediately. Existing users upgrading from v2.0 will have a missing `UptimeVisible` field in their `settings.json` — the init-property default `true` applies, so they also see the uptime row on first launch after upgrade. This is the intended behavior.

**No guard needed in `SettingsService.Load()`:** `bool` has no dangerous falsy-zero equivalent. `false` is a valid user choice (they hid the row). The existing pattern (`StatsIntervalSeconds <= 0` guard, `Opacity <= 0.0` guard) applies only to types where a zero value causes a crash or unrecoverable invisible state. `UptimeVisible = false` is safe.

---

## Uptime Data Source

**`Environment.TickCount64`** — the correct API for system uptime in .NET 10.

- Returns `long` (Int64): milliseconds elapsed since system start
- Available since .NET Core 3.0; in .NET 10 (HIGH confidence — official docs)
- On Windows with .NET 10, includes non-awake time (sleep/hibernate time is counted)
  - This matches the expected Linux-style "up" display behavior; uptime counting pause during sleep would surprise users
- No P/Invoke required; no NuGet packages; one property access
- Cost: effectively zero — a single kernel call, sub-microsecond

**Conversion to TimeSpan:**
```csharp
TimeSpan uptime = TimeSpan.FromMilliseconds(Environment.TickCount64);
// uptime.Days, uptime.Hours, uptime.Minutes give the display components
```

**Why not `DateTime.Now - Process.GetCurrentProcess().StartTime`:** That gives widget uptime, not system uptime. Wrong concept.

**Why not `Win32_OperatingSystem.LastBootUpTime` via WMI:** WMI startup cost is 100–500ms and requires `using System.Management`. `Environment.TickCount64` achieves the same result at zero cost with no new dependencies.

(Source: https://learn.microsoft.com/en-us/dotnet/api/system.environment.tickcount64?view=net-10.0 — HIGH confidence)

---

## Rolling CPU Average Implementation

### Approach: Queue-of-floats trimmed to 15m window

`Queue<float>` is the simplest structure for a sliding window: `Enqueue` at the tail, `Dequeue` from the head. Capacity is implicitly bounded by trimming on each tick.

```
_cpuSamples: [oldest ... ... ... newest]
              ^Dequeue                ^Enqueue
```

**Window sizes (at default 3s interval):**
| Average | Window | Sample count (at 3s) |
|---------|--------|----------------------|
| 1-minute | 60s | 20 samples |
| 5-minute | 300s | 100 samples |
| 15-minute | 900s | 300 samples (queue max) |

**Display format:** Values are stored as percentages (0–100), displayed as load-average-style decimals (divided by 100). This matches the Linux `uptime` output convention where `0.52` means 52% average CPU load.

**Startup behavior:** At startup, only a few samples exist. `ComputeAvg` uses `Math.Min(count, q.Count)` to average over however many samples are available. This is correct — no sentinel value or "warming up" indicator is needed.

**Interval change behavior:** Changing the stats interval (e.g., from 3s to 10s) changes how many samples represent each time window. The queue is trimmed to the new `maxSamples` on the next tick. Averages recalculate immediately using the new window sizes. The brief discontinuity is imperceptible.

### Why Not a Circular Buffer Array

A fixed-size circular buffer is marginally more efficient at high sample rates, but the queue approach is:
- Simpler to read and reason about
- Correct for variable interval sizes
- Bounded at 900 elements maximum (even at 1s interval), which is negligible memory
- Uses `LINQ .Average()` and `.TakeLast()` — both available in .NET 10 BCL, zero dependencies

A circular buffer would be appropriate if samples were taken at sub-second rates. At the coarsest stats timer rate (1s), `Queue<float>` is the right tradeoff.

---

## XAML Layout

### Inner Grid: Add Row 2

The inner `Grid` inside `ContentBorder` currently has 2 rows. Add a third:

```xml
<Grid>
    <Grid.RowDefinitions>
        <RowDefinition Height="Auto" />   <!-- Row 0: phrase/dial (existing) -->
        <RowDefinition Height="Auto" />   <!-- Row 1: StatsPanel (existing) -->
        <RowDefinition Height="Auto" />   <!-- Row 2: UptimeRow (NEW) -->
    </Grid.RowDefinitions>

    <!-- Row 0: existing ContentBorder (unchanged) -->
    <!-- Row 1: existing StatsPanel (unchanged) -->

    <!-- Row 2: uptime/load line -->
    <TextBlock x:Name="UptimeText"
               Grid.Row="2"
               Width="180"
               Margin="0,2,0,0"
               Visibility="Visible"
               FontFamily="Segoe UI Light"
               FontSize="11"
               Foreground="White"
               Text="up —"
               TextAlignment="Left" />
</Grid>
```

**Width="180":** Matches `StatsPanel` width to prevent SizeToContent jitter. The uptime string has variable length depending on days/hours/minutes and the load values. Fixing the width stabilizes the widget.

**FontSize="11":** Slightly smaller than the stats row label font (12pt) to visually de-emphasize the line as supplementary information.

**Visibility="Visible" default:** Uptime is visible by default (matches `UptimeVisible = true` default). `ApplySettings()` sets the actual visibility from loaded settings before `Show()`.

**Text="up —":** Placeholder text shown for the brief period between `Show()` and the first `_statsTimer` tick. Avoids an empty/blank row.

### Stats Submenu: Add Toggle

```xml
<MenuItem Header="Stats">
    <MenuItem x:Name="MenuShowStats" ... />
    <Separator />
    <MenuItem x:Name="MenuCpuVisible" ... />
    <MenuItem x:Name="MenuGpuVisible" ... />
    <MenuItem x:Name="MenuMemVisible" ... />
    <MenuItem x:Name="MenuPagVisible" ... />
    <!-- NEW -->
    <MenuItem x:Name="MenuUptimeVisible"
              Header="Show Uptime"
              IsCheckable="True"
              Click="MenuUptimeVisible_Click" />
    <MenuItem Header="Update Interval"> ... </MenuItem>
</MenuItem>
```

**Placement:** After the PAG row toggle and before Update Interval. The uptime row is logically separate from the four stat bars but lives in the same cluster of row-visibility controls.

---

## Data Flow

### Startup Flow (v2.1 additions in bold)

```
App.OnStartup()
    |
    +-- SettingsService.Load() -> AppSettings
    |       ** UptimeVisible included with init-property default (true) **
    |
    +-- new MainWindow()
    |       ** _cpuSamples = new Queue<float>() (initialized) **
    |
    +-- mainWindow.ApplySettings(settings)
    |       ** UptimeRow.Visibility = settings.UptimeVisible ? Visible : Collapsed **
    |       (Direct assignment, not via method — same pre-Show safety invariant)
    |
    +-- mainWindow.SetInitialPhrase(...)
    +-- mainWindow.Show()
            |
            +-- ContentRendered fires
                    +-- existing: _timer, _statsService, _statsTimer started
                    +-- _statsTimer.Tick fires every N seconds:
                            +-- _statsService.Refresh()    (existing)
                            +-- UpdateStatsDisplay()       (existing)
                            +-- UpdateUptimeDisplay()      (NEW — if UptimeRow.Visible)
```

### Stats Timer Tick Flow (v2.1 additions in bold)

```
_statsTimer.Tick
    |
    +-- _statsService.Refresh()
    |       CpuPercent updated
    |
    +-- UpdateStatsDisplay()    (existing — reads CpuPercent for bars)
    |
    +-- UpdateUptimeDisplay()   (NEW)
            |
            +-- if UptimeRow.Collapsed → return (early exit, no queue growth)
            |
            +-- TimeSpan uptime = TimeSpan.FromMilliseconds(Environment.TickCount64)
            +-- _cpuSamples.Enqueue(_statsService.CpuPercent)
            +-- trim _cpuSamples to maxSamples = 15*60 / _statsIntervalSeconds
            +-- compute avg1m, avg5m, avg15m via ComputeAvg()
            +-- UptimeText.Text = formatted string
```

### Toggle Flow (runtime)

```
User clicks "Show Uptime" in Stats submenu
    |
    +-- MenuUptimeVisible_Click fires
    +-- SetUptimeRowVisible(UptimeRow.Visibility != Visibility.Visible)
            |
            +-- UptimeRow.Visibility = visible ? Visible : Collapsed
            +-- UpdateLayout() + re-clamp (if visible && _hasUserPosition)
            +-- SaveSettings()
```

---

## Integration Points

### Modified Files

| File | What Changes |
|------|-------------|
| `AppSettings.cs` | Add `bool UptimeVisible { get; init; } = true`; update `SettingsService.Defaults()` |
| `MainWindow.xaml` | Add Row 2 `UptimeText` TextBlock; add "Show Uptime" toggle to Stats submenu |
| `MainWindow.xaml.cs` | Add `_cpuSamples` field; add `UpdateUptimeDisplay()` and `ComputeAvg()`; extend `_statsTimer.Tick` handler; extend `ApplySettings()`, `SaveSettings()`, `ContextMenu_Opened()`, `ApplyTheme()`; add `MenuUptimeVisible_Click` and `SetUptimeRowVisible()` |

### Unchanged Files

| File | Why Unchanged |
|------|--------------|
| `StatsService.cs` | `CpuPercent` is already populated on every tick; no new counters needed |
| `SettingsService.cs` | Load/Save/Clamp work with any AppSettings shape automatically |
| `App.xaml.cs` | Startup/shutdown flow transparent to new fields |
| `FuzzyClock.Core/` | PhraseEngine — no changes |

### Existing Patterns Reused

| Pattern | Where Applied |
|---------|---------------|
| `Visibility.Collapsed/Visible` toggle | `UptimeRow` visibility on toggle and `ApplySettings()` |
| `IsChecked` sync in `ContextMenu_Opened()` | `MenuUptimeVisible.IsChecked` from row visibility |
| Click handler reads `Visibility` not `IsChecked` | `MenuUptimeVisible_Click` reads `UptimeRow.Visibility` |
| Pre-Show safety: set Visibility directly in `ApplySettings()` | `UptimeRow.Visibility` set directly, not via `SetUptimeRowVisible()` |
| `UpdateLayout() + re-clamp` on row show | `SetUptimeRowVisible(true)` calls layout pass to adjust window height |
| Accent color applied via `ApplyTheme()` | `UptimeText.Foreground = brush` added to `ApplyTheme()` |
| `SaveSettings()` called after state change | `SetUptimeRowVisible()` calls `SaveSettings()` |

---

## SizeToContent Interaction

Showing or hiding `UptimeRow` changes window height by ~16px (11pt font + 2px margin). The same
`UpdateLayout()` + re-clamp pattern used for all other row visibility changes applies here.

| Event | SizeToContent Effect | Action Required |
|-------|---------------------|-----------------|
| `UptimeRow` shown | Window height increases ~16px | `UpdateLayout()` + re-clamp (if `_hasUserPosition`) |
| `UptimeRow` hidden | Window height decreases ~16px | `UpdateLayout()` + re-clamp not strictly needed, but consistent to include |
| `UptimeText.Text` updated | Width fixed at 180 — no resize | None |
| Uptime string length changes | Prevented by `Width="180"` | None |

---

## Suggested Build Order

Each step is independently verifiable.

**Step 1: AppSettings — add UptimeVisible field**
- Add `bool UptimeVisible { get; init; } = true` to `AppSettings.cs`
- Update `SettingsService.Defaults()` to include `UptimeVisible = true`
- Verify: existing `settings.json` (without new field) loads correctly — field defaults `true`
- Verify: new field saves and reloads correctly

**Step 2: XAML — add UptimeRow TextBlock and menu toggle**
- Add Row 2 `RowDefinition` to inner Grid in `MainWindow.xaml`
- Add `UptimeText` TextBlock at Grid.Row="2" with `Width="180"`, `Visibility="Visible"`, placeholder text
- Add `MenuUptimeVisible` `IsCheckable` MenuItem to Stats submenu
- Verify: widget renders with placeholder "up —" row visible; Stats submenu shows "Show Uptime" item

**Step 3: ApplySettings / SaveSettings / ContextMenu_Opened wiring**
- Extend `ApplySettings()`: `UptimeRow.Visibility = s.UptimeVisible ? Visible : Collapsed`
- Extend `SaveSettings()`: `UptimeVisible = (UptimeRow.Visibility == Visibility.Visible)`
- Extend `ContextMenu_Opened()`: `MenuUptimeVisible.IsChecked = (UptimeRow.Visibility == Visibility.Visible)`
- Add `MenuUptimeVisible_Click` handler: calls `SetUptimeRowVisible(UptimeRow.Visibility != Visibility.Visible)`
- Add `SetUptimeRowVisible()`: sets Visibility, UpdateLayout + re-clamp, SaveSettings
- Verify: toggle hides/shows row; checkmark syncs; state persists across restart

**Step 4: Uptime data and display**
- Add `UpdateUptimeDisplay()` with `Environment.TickCount64` uptime formatting
- Call `UpdateUptimeDisplay()` at end of `_statsTimer.Tick` handler (after `UpdateStatsDisplay()`)
- No queue logic yet — just uptime string
- Verify: "up Xd Yh Zm" appears and updates each timer tick; sub-day format works

**Step 5: Rolling CPU averages**
- Add `Queue<float> _cpuSamples` field
- Add `ComputeAvg()` helper
- Extend `UpdateUptimeDisplay()` to enqueue, trim, compute, and format averages
- Extend `ApplyTheme()`: `UptimeText.Foreground = brush`
- Verify: averages accumulate over time; values plausible; accent color applies to UptimeText

**Step 6: Edge cases**
- Test with all stats intervals (1s/3s/10s): verify averages match expected window sizes
- Test toggle while widget is near screen edge: row show/hide re-clamps correctly
- Test upgrade from v2.0 settings.json (missing UptimeVisible): row appears (default true)
- Test long uptime format (multi-day) and short (sub-hour)
- Test hover fast-refresh (0.5s interval): verify averages compute without error at 0.5s tick

**Dependency rationale:**
- Steps 1–3 before 4–5: infrastructure (settings, XAML, toggle) before data logic — testable independently
- Step 4 before 5: uptime alone is a complete displayable value; averaging adds complexity but is separate concern
- Step 5 includes theming: logical completion of the row feature
- Step 6 last: edge-case validation after all happy paths confirmed

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Calling Refresh() Again in UpdateUptimeDisplay()

**What:** Call `_statsService.Refresh()` at the start of `UpdateUptimeDisplay()` to get a fresh CPU reading for the rolling average.

**Why bad:** `_statsService.Refresh()` is already called by `UpdateStatsDisplay()` on the same `_statsTimer.Tick`. Calling it twice per tick doubles the PDH counter reads. More importantly, PDH rate counters (CPU) return the delta since the last read — calling `Refresh()` twice in quick succession on a rate counter produces a near-zero delta reading on the second call because almost no time has passed. This corrupts the rolling average with spurious near-zero samples.

**Instead:** Read `_statsService.CpuPercent` directly after the single `Refresh()` call that `UpdateStatsDisplay()` has already triggered. Call `UpdateUptimeDisplay()` after `UpdateStatsDisplay()` in the same tick handler.

### Anti-Pattern 2: Placing UptimeRow Inside StatsPanel

**What:** Add `UptimeText` as a fifth child of `StatsPanel` (the existing `StackPanel`), below the PAG row.

**Why bad:** `StatsPanel.Visibility = Collapsed` hides all children including `UptimeText`. The uptime row has independent visibility — the user should be able to show uptime with stats hidden, or show stats with uptime hidden. Nesting UptimeRow inside StatsPanel creates an implicit dependency that does not match the requirement (UPT-02: independent toggle).

**Instead:** Place `UptimeRow` as a sibling of `StatsPanel` in Row 2 of the inner Grid. This matches the existing pattern: `DialCanvas` and `PhraseText` are siblings in Row 0, not nested inside each other.

### Anti-Pattern 3: Growing the Queue Without Trimming

**What:** Only enqueue samples and never trim `_cpuSamples`, computing averages over `q.TakeLast(N)`.

**Why bad:** Over a long-running session (days of uptime), the queue grows to hundreds of thousands of entries. At 1s interval over 24 hours: 86,400 samples. Memory is minor (~340KB for floats), but `TakeLast()` on a large Queue allocates a new iterator snapshot on every tick — this causes continuous GC pressure on a widget that is otherwise allocation-free at steady state.

**Instead:** Trim the queue on each tick to the 15-minute maximum. At 1s interval, the queue never exceeds 900 entries. `TakeLast()` on 900 elements is negligible and GC-friendly.

### Anti-Pattern 4: Using a StatsIntervalSeconds-Agnostic Fixed Window

**What:** Always keep 900 samples in the queue (hardcoded), compute avg1m as `TakeLast(60)`, avg5m as `TakeLast(300)`, avg15m as `TakeLast(900)` — treating sample count as seconds.

**Why bad:** At a 3s interval, each sample represents 3 seconds. `TakeLast(60)` would represent 60 samples × 3s = 180 seconds (3 minutes), not 1 minute. The labeled averages (1m/5m/15m) would be wrong by a factor equal to `_statsIntervalSeconds`.

**Instead:** Convert time windows to sample counts: `windowSamples = (int)Math.Ceiling(windowSeconds / _statsIntervalSeconds)`. This is exact at all configured intervals.

### Anti-Pattern 5: Calling SetUptimeRowVisible() from ApplySettings()

**What:** Call `SetUptimeRowVisible()` inside `ApplySettings()` to apply saved `UptimeVisible` state at startup.

**Why bad:** `SetUptimeRowVisible()` calls `UpdateLayout()` and `SaveSettings()`, which are unsafe before `Show()` (same invariant as `SetStatsVisible()` and `SetStatRowVisible()`). Specifically, `UpdateLayout()` before `Show()` produces `ActualHeight = 0`, causing `SettingsService.Clamp()` to return a nonsense position.

**Instead:** Set `UptimeRow.Visibility` directly in `ApplySettings()`. The same pattern governs all five stat rows and StatsPanel itself.

---

## Sources

| Claim | Source | Confidence |
|-------|--------|------------|
| `Environment.TickCount64` returns `long` milliseconds since system start; available .NET Core 3.0+ / .NET 10 | https://learn.microsoft.com/en-us/dotnet/api/system.environment.tickcount64?view=net-10.0 | HIGH |
| On Windows with .NET 10, `TickCount64` includes non-awake time (sleep/hibernate counted) | https://learn.microsoft.com/en-us/dotnet/api/system.environment.tickcount64?view=net-10.0 (Remarks section) | HIGH |
| `TimeSpan.FromMilliseconds(long)` converts ms to decomposable Days/Hours/Minutes/Seconds | Official .NET BCL, unchanged API | HIGH |
| `Queue<T>.TakeLast(int)` available in .NET 10 BCL via LINQ | In-box LINQ, .NET Core 2.0+ | HIGH |
| Pre-Show safety invariant: direct Visibility assignment in ApplySettings(); methods calling UpdateLayout() unsafe before Show() | Existing codebase PROJECT.md Key Decisions table | HIGH |
| ContextMenu_Opened pattern: sync IsChecked from state; handlers read Visibility not IsChecked | Existing codebase PROJECT.md Key Decisions table | HIGH |
| PDH rate counters return near-zero on back-to-back Refresh() calls | Existing codebase StatsService.cs comment: "prime — rate counter always returns 0 on first call" | HIGH |

---

*Architecture research for: FuzzyClock v2.1 — uptime display and rolling CPU load averages*
*Researched: 2026-02-27*
