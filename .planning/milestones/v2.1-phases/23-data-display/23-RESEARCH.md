# Phase 23: Data Display - Research

**Researched:** 2026-02-27
**Domain:** WPF transparent frameless widget — uptime string formatting, rolling CPU load averages, StatsService cold-start guard, hover fast-refresh guard (C# / .NET 10 / WPF)
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| UPT-01 | Widget displays system uptime in `up Xd Xh Xm` format (leading zero-units suppressed) alongside three rolling CPU load averages (1m/5m/15m) as decimal values, as a compact single line below the stats panel, themed in the active accent color | `Environment.TickCount64` + `TimeSpan` decomposition confirmed; `Queue<float>` rolling buffer with interval-aware window sizing fully specified; cold-start guard via `StatsService.IsReady` and hover guard via `_isHoverFastRefresh` both confirmed absent from source, must be added in this phase |
</phase_requirements>

---

## Summary

Phase 23 delivers the data behind the uptime row that Phase 22 built. The `UptimeText` TextBlock already exists in the XAML, is wired to `ApplyTheme()`, `ApplySettings()`, `SaveSettings()`, and `ContextMenu_Opened`, and displays the placeholder `"up —"`. This phase replaces that placeholder with live data: a formatted uptime string and three rolling CPU load averages. No new XAML changes are needed. No new NuGet packages are needed. Three files change: `StatsService.cs` (one line: add `IsReady` property), `MainWindow.xaml.cs` (add `_cpuSamples` field, `_isHoverFastRefresh` flag, `UpdateUptimeDisplay()`, `ComputeAvg()`, extend the `_statsTimer.Tick` handler and hover enter/leave handlers).

The two most consequential guard conditions — cold-start zero filtering (`_statsService.IsReady`) and hover fast-refresh window corruption (`_isHoverFastRefresh`) — are both confirmed absent from the current source and must be added before the rolling buffer is wired. Both are one-line additions in their respective locations. Omitting either produces silent wrong behavior that is difficult to detect without deliberate timing: cold-start zeros silently depress the 1m average for the first minute; hover corruption silently distorts all three windows after any hover session and takes up to 15 minutes to flush.

**Critical as-built deviation from prior research:** `UptimeText` is a child of `StatsPanel` (the StackPanel), not a Grid Row 2 sibling. This changes the early-exit guard in `UpdateUptimeDisplay()`: the method must check `StatsPanel.Visibility == Visibility.Visible && UptimeText.Visibility == Visibility.Visible` before doing any work — not just `UptimeText.Visibility` alone. Additionally, the `SetUptimeRowVisible()` re-clamp guard already accounts for this correctly (line 486: `if (visible && _hasUserPosition && StatsPanel.Visibility == Visibility.Visible)`). The implementation must mirror this two-condition pattern.

**Primary recommendation:** Build in three steps — (1) add `StatsService.IsReady` property and `_isHoverFastRefresh` flag (Wave 0 infrastructure), (2) implement uptime string alone in `UpdateUptimeDisplay()` and wire to the tick handler, (3) layer in rolling CPU averages with all guards. Each step is independently verifiable.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `Environment.TickCount64` (in-box) | .NET 10 | System uptime in milliseconds since boot as `Int64` | Zero-dependency, zero-latency, sub-microsecond; avoids WMI COM overhead; in-box since .NET Core 3.0 |
| `TimeSpan.FromMilliseconds(long)` (in-box) | .NET 10 BCL | Convert `TickCount64` to decomposable `.Days`/`.Hours`/`.Minutes` | Exact API — no custom arithmetic needed; `.Hours` returns the hours component (0–23), `.Days` is total days |
| `Queue<float>` (in-box) | .NET 10 BCL | Rolling CPU sample buffer — enqueue at tail, dequeue from head | Simple, readable, bounded by trimming on each tick; max 900 entries at 1s interval |
| `LINQ .TakeLast(int)` (in-box) | .NET 10 BCL | Compute average over the last N samples (most recent time window) | Available in .NET Core 2.0+ via `System.Linq`; no allocation at 900-entry scale |
| `LINQ .Average()` (in-box) | .NET 10 BCL | Compute mean over a sequence of floats | In-box BCL; `IEnumerable<float>` overload available |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `StatsService.CpuPercent` (project) | in-project | CPU reading already refreshed each `_statsTimer.Tick` | Read after `_statsService.Refresh()` fires — no second Refresh call needed |
| `SettingsService.Clamp()` (project) | in-project | Re-clamp position after row height change | Already called correctly in existing `SetUptimeRowVisible()` — no Phase 23 changes needed here |

**No new NuGet packages. No csproj changes. All assemblies already referenced.**

---

## Architecture Patterns

### Files Modified in Phase 23

```
FuzzyClock.App/
├── StatsService.cs          # +1 line: public bool IsReady => _initialized;
└── MainWindow.xaml.cs       # +_isHoverFastRefresh flag, +_cpuSamples Queue,
                             #  +UpdateUptimeDisplay(), +ComputeAvg(),
                             #  extend _statsTimer.Tick, extend hover enter/leave
```

`MainWindow.xaml` — NO CHANGES (UptimeText already exists, correctly positioned, styled)
`AppSettings.cs` — NO CHANGES (UptimeVisible already exists with `= true` default)

### As-Built Phase 22 State (confirmed from source)

The following Phase 22 work is complete and correct — Phase 23 must not re-do or disturb it:

| Element | Location | Status |
|---------|----------|--------|
| `AppSettings.UptimeVisible = true` init default | `AppSettings.cs` line 15 | DONE |
| `UptimeText` TextBlock inside StatsPanel | `MainWindow.xaml` lines 254-261 | DONE |
| `MenuUptimeVisible` IsCheckable in Stats submenu | `MainWindow.xaml` lines 52-55 | DONE |
| `ApplySettings()` direct Visibility assignment | `MainWindow.xaml.cs` line 137 | DONE |
| `SaveSettings()` includes `UptimeVisible` | `MainWindow.xaml.cs` line 184 | DONE |
| `ContextMenu_Opened` syncs `MenuUptimeVisible.IsChecked` | `MainWindow.xaml.cs` line 314 | DONE |
| `MenuUptimeVisible_Click` → `SetUptimeRowVisible()` | `MainWindow.xaml.cs` lines 364-365 | DONE |
| `SetUptimeRowVisible()` with UpdateLayout+Clamp guard | `MainWindow.xaml.cs` lines 479-497 | DONE |
| `ApplyTheme()` sets `UptimeText.Foreground = brush` | `MainWindow.xaml.cs` line 708 | DONE |

### Critical Layout Constraint: UptimeText is Inside StatsPanel

```
StatsPanel (StackPanel, Width=180, Visibility=Collapsed by default)
├── CpuRow (Grid)
├── GpuRow (Grid)
├── MemRow (Grid)
├── PagRow (Grid)
└── UptimeText (TextBlock)   ← child of StackPanel
```

**Consequence for `UpdateUptimeDisplay()`:** Both `StatsPanel.Visibility` and `UptimeText.Visibility` must be checked. If only `UptimeText.Visibility` is checked, the method runs unnecessary work when `StatsPanel` is hidden (UptimeText is auto-hidden, but `_cpuSamples` would still grow).

```csharp
// CORRECT early-exit guard:
if (StatsPanel.Visibility != Visibility.Visible ||
    UptimeText.Visibility != Visibility.Visible) return;
```

**Consequence for `_statsTimer` start condition:** The `_statsTimer` starts only when `StatsPanel.Visibility == Visible` (line 88-92, `ContentRendered`). If StatsPanel is Collapsed, the timer never starts, so `UpdateUptimeDisplay()` never fires — `_cpuSamples` never grows. The early-exit guard is belt-and-suspenders safety, not a primary gate.

### Pattern 1: StatsService.IsReady Property (Wave 0 Infrastructure)

**What:** Expose `StatsService._initialized` as a public readonly property.
**Where:** `StatsService.cs`, one line after the existing `PagPercent` property.

```csharp
// Source: StatsService.cs line 17 — _initialized is a volatile bool
// Add after existing public properties (after PagPercent line 22):
public bool IsReady => _initialized;
```

**Why `volatile bool` is safe to read from Dispatcher thread:** The `volatile` keyword guarantees the Dispatcher thread always reads the latest committed value. No lock needed for a single bool transition from `false` to `true`.

### Pattern 2: _isHoverFastRefresh Flag (Wave 0 Infrastructure)

**What:** Add a `bool` field that is `true` while hover fast-refresh (0.5s cadence) is active.
**Where:** `MainWindow.xaml.cs` fields section (near `_statsIntervalSeconds`), and set/cleared in `Window_MouseEnter`/`Window_MouseLeave`.

```csharp
// Source: MainWindow.xaml.cs line 17 — _statsIntervalSeconds field
// Add near _statsIntervalSeconds:
private bool _isHoverFastRefresh = false;
```

```csharp
// Source: MainWindow.xaml.cs lines 414-428 — Window_MouseEnter
// After _statsTimer.Start() in Window_MouseEnter:
_isHoverFastRefresh = true;
```

```csharp
// Source: MainWindow.xaml.cs lines 430-443 — Window_MouseLeave
// After _statsTimer.Start() in Window_MouseLeave:
_isHoverFastRefresh = false;
```

**Hover fast-refresh only activates when `StatsPanel.Visibility == Visible`** (existing guard at lines 420 and 436). The flag is set/cleared inside the `if (StatsPanel.Visibility != Visibility.Visible) return` guards, so it is always `false` when stats are hidden.

### Pattern 3: UpdateUptimeDisplay() — Full Implementation

**What:** New private method called at the end of the existing `_statsTimer.Tick` handler.
**Where:** `MainWindow.xaml.cs`, alongside other `Update*` methods.

```csharp
// Source: Architecture confirmed from .planning/research/ARCHITECTURE.md
// and .planning/research/SUMMARY.md (all verified HIGH confidence)
private void UpdateUptimeDisplay()
{
    // Early exit: StatsPanel hides UptimeText automatically (UptimeText is inside StatsPanel).
    // Guard both: even if UptimeText is Visible, StatsPanel being Collapsed means nothing to show.
    if (StatsPanel.Visibility  != Visibility.Visible ||
        UptimeText.Visibility  != Visibility.Visible) return;

    // --- Cold-start guard ---
    // StatsService takes ~6s to initialize. Skip buffer push until real data flows.
    // IsReady = public bool property added to StatsService in Wave 0 of this phase.
    if (!_statsService.IsReady) return;

    // --- Hover fast-refresh guard ---
    // At 0.5s hover cadence, pushing every tick corrupts window-size semantics.
    // Only push samples at the configured (non-hover) interval.
    if (!_isHoverFastRefresh)
    {
        _cpuSamples.Enqueue(_statsService.CpuPercent);
        // Trim to 15-minute window at current configured interval
        int maxSamples = Math.Max(1, (15 * 60) / _statsIntervalSeconds);
        while (_cpuSamples.Count > maxSamples) _cpuSamples.Dequeue();
    }

    // --- Uptime string ---
    TimeSpan uptime = TimeSpan.FromMilliseconds(Environment.TickCount64);
    string uptimeStr = uptime.Days > 0
        ? $"up {uptime.Days}d {uptime.Hours}h {uptime.Minutes}m"
        : $"up {uptime.Hours}h {uptime.Minutes}m";

    // --- Rolling CPU averages ---
    // CpuPercent already refreshed by _statsService.Refresh() in UpdateStatsDisplay() this tick.
    float avg1m  = ComputeAvg(_cpuSamples, (int)Math.Ceiling(60.0  / _statsIntervalSeconds));
    float avg5m  = ComputeAvg(_cpuSamples, (int)Math.Ceiling(300.0 / _statsIntervalSeconds));
    float avg15m = _cpuSamples.Count > 0 ? _cpuSamples.Average() : 0f;

    // avg1m/5m/15m are in percent (0–100); divide by 100 for load-average-style display (0.52)
    string newText = $"{uptimeStr}   {avg1m / 100f:F2}  {avg5m / 100f:F2}  {avg15m / 100f:F2}";

    // Change guard: uptime minutes component changes only once per minute at most.
    // Avoid spurious TextBlock invalidation on every tick at 1s interval.
    if (UptimeText.Text != newText)
        UptimeText.Text = newText;
}

private static float ComputeAvg(Queue<float> q, int count)
{
    // Average the last `count` elements (most recent time window).
    // Math.Min guards against requesting more samples than exist (warm-up period).
    return q.Count == 0 ? 0f : q.TakeLast(Math.Min(count, q.Count)).Average();
}
```

### Pattern 4: Extend _statsTimer.Tick Handler

**What:** Add `UpdateUptimeDisplay()` call after `UpdateStatsDisplay()` in the tick handler.
**Where:** `MainWindow.xaml.cs` line 84 (current: `_statsTimer.Tick += (_, _) => UpdateStatsDisplay();`).

```csharp
// Source: MainWindow.xaml.cs line 84 — current single-call tick handler
// Change to:
_statsTimer.Tick += (_, _) =>
{
    UpdateStatsDisplay();    // existing — calls _statsService.Refresh() internally
    UpdateUptimeDisplay();   // NEW — reads CpuPercent after Refresh() already ran
};
```

**Why UpdateStatsDisplay first:** `UpdateStatsDisplay()` calls `_statsService.Refresh()` at line 254. `UpdateUptimeDisplay()` reads `_statsService.CpuPercent` which was just updated. Calling `UpdateUptimeDisplay()` first would read stale values. Do NOT call `Refresh()` again in `UpdateUptimeDisplay()` — PDH rate counters return near-zero on back-to-back calls.

### Pattern 5: _cpuSamples Field Declaration

```csharp
// Source: MainWindow.xaml.cs fields section (near _statsIntervalSeconds, line 17)
// Add:
private readonly Queue<float> _cpuSamples = new();
// Capacity: bounded by trim logic in UpdateUptimeDisplay().
// Max 900 entries at 1s interval (15 min * 60 sec). Negligible memory (~3.5KB).
```

### Anti-Patterns to Avoid

- **Calling `_statsService.Refresh()` inside `UpdateUptimeDisplay()`:** `Refresh()` was already called by `UpdateStatsDisplay()` on the same tick. A second call produces a near-zero PDH delta reading, corrupting the rolling average with near-zero samples.
- **Checking only `UptimeText.Visibility` in the early-exit guard:** `UptimeText` is inside `StatsPanel`. When `StatsPanel` is Collapsed, `UptimeText` may be Visible (its own toggle) but is invisible due to parent. The guard must check both.
- **Omitting `_isHoverFastRefresh` guard from buffer push:** Hover at 0.5s fills the 300-sample buffer in 2.5 minutes instead of 15, corrupting all three averages. Recovers only after 15+ minutes of non-hover operation.
- **Omitting `_statsService.IsReady` guard:** First 2-6 seconds of samples are `0.0f`, depressing the 1m average for the first minute. Indistinguishable from genuine idle CPU.
- **Hardcoding window sizes (TakeLast(60), TakeLast(300), TakeLast(900)):** This treats samples as 1-second each. At 3s interval, `TakeLast(60)` is 3 minutes, not 1. Divide by `_statsIntervalSeconds` always.
- **Using `Environment.TickCount` (int, 32-bit):** Wraps at ~24.9 days, causing uptime display to reset spontaneously. Always use `Environment.TickCount64` (`long`).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| System uptime | WMI `Win32_OperatingSystem.LastBootUpTime` query | `Environment.TickCount64` | WMI has 100–500ms COM init latency on UI thread; `TickCount64` is sub-microsecond, zero-dependency, already correct for this use case |
| Time decomposition | Custom `days = ms / 86400000` arithmetic | `TimeSpan.FromMilliseconds(long).Days/.Hours/.Minutes` | `.Hours` gives component hours (0–23), not total hours — custom arithmetic gets this wrong |
| Rolling window | Circular array with head pointer | `Queue<float>` trimmed per tick | Queue is simpler, correct for variable intervals, bounded at 900 entries; circular array only worthwhile at sub-second rates |
| Average over window | Manual sum loop | `LINQ .TakeLast(n).Average()` | Correct, readable, no allocation at 900-entry scale |

**Key insight:** Every computation needed for this phase is in-box .NET 10. The only code to write is the orchestration in `UpdateUptimeDisplay()` and `ComputeAvg()`.

---

## Common Pitfalls

### Pitfall P1: Rolling Buffer Seeded With StatsService Cold-Start Zeros

**What goes wrong:** `StatsService` initializes via `Task.Run(Initialize)`. For approximately 6 seconds after startup (PDH cold-start), `CpuPercent` is `0f`. If buffer pushes start immediately, the 1m average (20 samples at 3s interval) is depressed by zeros for the first ~60 seconds.

**Why it happens:** `0f` is both the cold-start sentinel and a valid idle CPU reading — there is no way to distinguish them by value. The init flag (`_initialized`) is the only reliable signal.

**How to avoid:** Add `public bool IsReady => _initialized;` to `StatsService.cs`. Guard buffer push with `if (!_statsService.IsReady) return;` at the top of `UpdateUptimeDisplay()`.

**Warning signs:** 1m/5m/15m averages show `0.00` for first ~60 seconds, then jump upward as zeros flush out.

### Pitfall P3: Hover Fast-Refresh Corrupts Average Window Sizes

**What goes wrong:** Hover activates 0.5s refresh (6x faster than 3s default). At 0.5s, a 300-sample buffer covers only 2.5 minutes instead of 15. After even a 30-second hover session, the 15m buffer contains mostly hover samples.

**Why it happens:** `_statsTimer.Interval` changes to 0.5s during hover (lines 424-426). Buffer sample counts are valid only at the configured interval. No flag distinguishes hover ticks from normal ticks.

**How to avoid:** Set `_isHoverFastRefresh = true` in `Window_MouseEnter` (after `_statsTimer.Start()`). Set `_isHoverFastRefresh = false` in `Window_MouseLeave` (after `_statsTimer.Start()`). Skip `_cpuSamples.Enqueue()` when `_isHoverFastRefresh` is true.

**Warning signs:** 15m average drops dramatically during hover sessions; takes 10-15 minutes to stabilize after hovering.

### Pitfall P2: Using Environment.TickCount Instead of TickCount64

**What goes wrong:** `Environment.TickCount` is `int` (32-bit). It wraps at ~24.9 days. The uptime display resets to near-zero spontaneously on a machine with > 24.9 days uptime.

**How to avoid:** Always write `Environment.TickCount64`. Add a code comment: `// Int64 — never use Environment.TickCount (Int32, wraps at ~24.9 days)`.

### Pitfall P8: Uptime Format Including Seconds Creates Display Churn

**What goes wrong:** Including the seconds component in the format string causes the TextBlock to change every tick, even when nothing meaningful has changed. At 1s interval, this is a string allocation + TextBlock update every second.

**How to avoid:** Use `"up {D}d {H}h {M}m"` or `"up {H}h {M}m"` — no seconds component. Combined with the change-guard (`if (UptimeText.Text != newText) UptimeText.Text = newText;`), actual DOM updates occur at most once per minute.

---

## Code Examples

Verified patterns from official sources and direct source inspection:

### Uptime Formatting (leading zero-units suppressed)

```csharp
// Source: TimeSpan official docs https://learn.microsoft.com/en-us/dotnet/api/system.timespan
// TimeSpan.Days = total complete days; .Hours = hours component (0-23); .Minutes = minutes component (0-59)
TimeSpan uptime = TimeSpan.FromMilliseconds(Environment.TickCount64);
string uptimeStr = uptime.Days > 0
    ? $"up {uptime.Days}d {uptime.Hours}h {uptime.Minutes}m"
    : $"up {uptime.Hours}h {uptime.Minutes}m";
// System up for 5h 3m:  "up 5h 3m"     (Days=0, suppress)
// System up for 26h 3m: "up 1d 2h 3m"  (Days=1, all three components)
// System up for 0h 45m: "up 0h 45m"    (Hours shows even as 0 — only Days suppressed when 0)
```

### Interval-Aware Window Sizing

```csharp
// Source: .planning/research/ARCHITECTURE.md — confirmed HIGH confidence
// At 3s interval: 1m = ceil(60/3) = 20 samples; 5m = 100 samples; 15m = 300 samples
// At 1s interval: 1m = 60 samples; 5m = 300 samples; 15m = 900 samples
// At 10s interval: 1m = ceil(60/10) = 6 samples; 5m = 30 samples; 15m = 90 samples
int windowSamples1m  = (int)Math.Ceiling(60.0  / _statsIntervalSeconds);
int windowSamples5m  = (int)Math.Ceiling(300.0 / _statsIntervalSeconds);
int maxSamples       = Math.Max(1, (15 * 60) / _statsIntervalSeconds); // trim target
```

### StatsService.IsReady — One-Line Addition

```csharp
// Source: StatsService.cs line 17 — private volatile bool _initialized
// Add as public property (after PagPercent on line 22):
public bool IsReady => _initialized;
// volatile bool: safe to read from Dispatcher thread — guaranteed to see latest value.
// Note: Environment.TickCount64 on .NET 10/Windows includes suspend/hibernate time.
// Deliberate choice over WMI LastBootUpTime: zero overhead, no COM init.
// .NET 11 breaking change: TickCount64 will EXCLUDE suspend time in .NET 11+.
// See: https://learn.microsoft.com/en-us/dotnet/core/compatibility/core-libraries/11/environment-tickcount-windows-behavior
```

### Display Format

```csharp
// CpuPercent is 0-100 range. Divide by 100 for load-average-style decimal display.
// Format: "up 3d 14h 22m   0.52  0.47  0.43"
//   three spaces before averages, two spaces between each average
string newText = $"{uptimeStr}   {avg1m / 100f:F2}  {avg5m / 100f:F2}  {avg15m / 100f:F2}";
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Phase 22 placeholder `"up —"` | Live `"up Xh Xm  0.52  0.47  0.43"` from this phase | Phase 23 completion fulfills UPT-01 entirely |
| `_statsTimer.Tick += (_, _) => UpdateStatsDisplay();` (single call) | Two-call handler: `UpdateStatsDisplay()` then `UpdateUptimeDisplay()` | No new timer; uptime updates at exactly the same cadence as stats bars |
| StatsService has no `IsReady` surface | `public bool IsReady => _initialized;` one-line property | Enables cold-start guard without field access hacks |
| No hover-aware buffer logic | `_isHoverFastRefresh` flag gates buffer pushes | 1m/5m/15m windows remain accurate regardless of hover duration |

**Noted .NET 11 breaking change:** `Environment.TickCount64` on .NET 11+ will exclude suspend/hibernate time on Windows (currently includes it on .NET 10). Add a comment at the call site documenting this deliberate choice for future upgraders.

---

## Open Questions

1. **Sub-hour format when hours also 0**
   - What we know: `uptime.Days > 0` suppresses the days component. If `Days == 0` AND `Hours == 0`, the format produces `"up 0h 45m"` — hours shows as 0. The spec says "leading zero-units suppressed" (`up 5h 3m` not `up 0d 5h 3m`).
   - What's unclear: Should `"up 0h 45m"` be further suppressed to `"up 45m"`? The spec example only mentions days suppression.
   - Recommendation: Suppress hours when 0 too, for consistency with the leading-zero-unit rule. Format: three cases — `up Xd Xh Xm` (days > 0), `up Xh Xm` (hours > 0, days == 0), `up Xm` (hours == 0, days == 0). A system up for only minutes is unlikely but possible after fast reboot.

2. **`_statsTimer` handler lambda expansion**
   - What we know: The current handler is `_statsTimer.Tick += (_, _) => UpdateStatsDisplay();` — a single-expression lambda on one line.
   - What's unclear: The change expands this to a block lambda with two statements. The existing code style uses single-expression lambdas wherever possible.
   - Recommendation: Expand to a block lambda: `_statsTimer.Tick += (_, _) => { UpdateStatsDisplay(); UpdateUptimeDisplay(); };` — or on three lines for readability. Both are correct.

---

## Sources

### Primary (HIGH confidence)

- `C:/src/FuzzyStatsClock/FuzzyClock.App/MainWindow.xaml.cs` — direct source inspection 2026-02-27; hover handlers lines 414-443 confirmed no `_isHoverFastRefresh` flag; tick handler line 84 confirmed single-call; `UpdateStatsDisplay()` line 252-283 confirmed calls `Refresh()` internally; `ApplySettings()` line 137 confirmed direct Visibility assignment
- `C:/src/FuzzyStatsClock/FuzzyClock.App/MainWindow.xaml` — direct source inspection 2026-02-27; `UptimeText` confirmed as child of StatsPanel StackPanel (lines 254-261), NOT Grid Row 2 sibling; comment at line 102 confirms the as-built placement decision
- `C:/src/FuzzyStatsClock/FuzzyClock.App/StatsService.cs` — direct source inspection 2026-02-27; `_initialized` confirmed as `private volatile bool` at line 17; confirmed no `IsReady` public property exists
- `C:/src/FuzzyStatsClock/FuzzyClock.App/AppSettings.cs` — direct source inspection 2026-02-27; `UptimeVisible` field confirmed at line 15 with `= true` init default
- `.planning/research/SUMMARY.md` — milestone research, HIGH confidence, verified 2026-02-27
- `.planning/research/ARCHITECTURE.md` — full algorithm spec, code examples, interval-aware window sizing; HIGH confidence
- `.planning/research/PITFALLS.md` — 12 pitfalls; P1, P2, P3, P8 directly relevant to Phase 23
- `Environment.TickCount64` (.NET 10): https://learn.microsoft.com/en-us/dotnet/api/system.environment.tickcount64?view=net-10.0 — Int64, milliseconds, Windows includes suspend time
- `TimeSpan` (.NET 10): https://learn.microsoft.com/en-us/dotnet/api/system.timespan?view=net-10.0 — `.Days`/`.Hours`/`.Minutes` component semantics confirmed
- .NET 11 TickCount64 breaking change: https://learn.microsoft.com/en-us/dotnet/core/compatibility/core-libraries/11/environment-tickcount-windows-behavior

### Secondary (MEDIUM confidence)

- `.planning/STATE.md` — v2.1 architectural constraints section; consistent with source inspection
- `.planning/phases/22-infrastructure-and-toggle/22-RESEARCH.md` — Phase 22 research; gap list (IsReady, _isHoverFastRefresh) confirmed as still absent after Phase 22 implementation

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all APIs confirmed via official .NET 10 docs; zero new dependencies; patterns validated in v1.x–v2.0 milestones
- Architecture patterns: HIGH — based on direct source file reading with line numbers; no inferences; as-built Phase 22 state fully confirmed
- Pitfalls: HIGH — all four pitfalls directly relevant to Phase 23 derived from source file reading and official API docs; mitigations are one- or two-line additions

**Research date:** 2026-02-27
**Valid until:** 2026-03-28 (stable codebase; 30-day horizon)
