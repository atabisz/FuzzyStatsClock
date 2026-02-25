# Feature Research

**Domain:** Desktop overlay widget — system stats panel (v1.2)
**Researched:** 2026-02-25
**Confidence:** HIGH (all claims verified against official Microsoft documentation)

---

## Scope Note

This file replaces the v1.1 FEATURES.md and focuses exclusively on the five new features
targeted in v1.2. The existing codebase is a transparent frameless always-on-top WPF window
with a working time-phrase display, drag-to-reposition, font-size selection, and all settings
persisted to `%LOCALAPPDATA%\FuzzyClock\settings.json`. That foundation is not re-documented here.

The three stats are: CPU %, GPU %, Memory % (RAM). Each stat shows a horizontal bar and
percentage text. The panel lives below the existing time-phrase TextBlocks in the same window.
A "Stats" submenu in the right-click context menu provides Show/Hide toggle and Update Interval
(1s / 3s / 10s).

---

## Feature Landscape

### Table Stakes (Users Expect These)

These are behaviors users will silently expect from any minimal stats overlay. Missing them
registers as a bug, not as a missing feature.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Three labeled stats rows (CPU / GPU / MEM) | Any stats overlay shows at least these three; omitting one feels broken | LOW | Three rows in existing StackPanel/Grid, each with a label + bar + % text |
| Percentage text (0–100%) displayed beside bar | Users must be able to read the number at a glance; bar alone is not readable at small sizes | LOW | `TextBlock` with `Text="{Binding ...}"` or set in timer callback; format as `"45%"` |
| Horizontal bar fills proportionally to value | This is the universally expected visual metaphor for a usage meter | LOW | WPF `ProgressBar` with `Minimum=0`, `Maximum=100`, `Value=<reading>`; or a custom `Border`/`Rectangle` inside a fixed-width container with `Width` bound to value |
| Live update on a timer | Stats that don't update are a broken clock | LOW | `DispatcherTimer` with configurable `Interval`; tick handler calls data sources and pushes new values to UI |
| Show/Hide toggle persists across restarts | A user who hides the stats panel once should not see it reappear every launch | LOW | Extend existing `settings.json` with `statsVisible: bool`; restore in `ApplySettings()` |
| Update interval persists across restarts | Choosing an interval every launch is friction | LOW | Extend existing `settings.json` with `statsInterval: int` (seconds); restore in `ApplySettings()` |
| Stats hidden by default on first run | New feature should not force itself on users who haven't asked for it | LOW | Default `statsVisible = false` in settings; first run starts with stats hidden |

### Expected Layout Behavior

These are the behavioral expectations for the bar + label layout that users have from every
existing stats widget (Windows Task Manager, Resource Monitor, HWiNFO, GPU-Z, Rainmeter):

| Behavior | Why Expected | Notes |
|----------|--------------|-------|
| Label text ("CPU", "GPU", "MEM") is left-aligned, fixed width | Alignment makes bars line up cleanly; labels are short and fixed | `TextBlock` with fixed `Width` or `MinWidth`; `Grid.Column` layout preferred |
| Bar is the widest element — visual weight of the row | The bar communicates magnitude; text shows precision | Bar gets star-sizing (`Width="*"`) in a Grid column; text is auto-width |
| Percentage text is right-aligned or immediately follows bar | Users scan right-to-left: bar gives approximate, number confirms | TextBlock after bar; `HorizontalAlignment="Right"` or in a separate Grid column |
| All three rows are the same width | Mismatched widths feel broken | All rows inside a uniform-width container; `HorizontalAlignment="Stretch"` |
| Bars update smoothly (no visual flicker) | Jitter or flicker from UI thread thrashing reads as low quality | Dispatcher updates only changed values; no forced full re-layout |
| Bars do not jump between 0% and 100% on first sample | First-sample anomalies are well-known for PerformanceCounter | Call `NextValue()` once on initialization (throw-away sample), then start the timer |

### Show/Hide Toggle Behavior

| Behavior | Why Expected | Notes |
|----------|--------------|-------|
| Toggle immediately shows/hides the stats rows | Menu actions should be instant | Set stats container `Visibility` to `Visible`/`Collapsed` in the click handler |
| When hidden, time phrase layout is unchanged | User chose to hide stats to reduce clutter; hiding must not break the main feature | `Collapsed` (not `Hidden`) removes layout space; the window shrinks via `SizeToContent="WidthAndHeight"` |
| When shown after being hidden, bars reflect current values immediately | Stale "last hidden" values would be confusing | Either keep the timer running while hidden (cheapest), or read fresh values on show |
| Right-click menu shows current state (checked = visible) | Standard IsCheckable menu item convention, already used for font size | Same `IsCheckable` + `ContextMenu_Opened` sync pattern from v1.1 font size menu |

### Update Interval Selector Behavior

| Behavior | Why Expected | Notes |
|----------|--------------|-------|
| Three discrete intervals: 1s / 3s / 10s | Three is enough for "fast / balanced / battery-friendly" without overwhelming the menu | Radio-style `IsCheckable` menu items; mutual exclusion in code, same pattern as font size |
| Active interval shown as checked | Standard for radio-style menu items | Same `ContextMenu_Opened` sync pattern used for font size |
| Interval change takes effect immediately | User picks 1s to diagnose a problem right now; they should not have to restart | Stop and restart the `DispatcherTimer` with the new `Interval` in the click handler |
| Default interval is 3s | 1s is too frequent for an always-running widget (minor CPU overhead); 10s is too stale for real-time glance use; 3s is the standard Task Manager default | `statsInterval = 3` as the JSON default |

---

## Differentiators (Nice to Have, Not Required for v1.2)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Bar color changes at thresholds (e.g., green → yellow → red) | Visual severity indicator; used by Task Manager and Resource Monitor | MEDIUM | Bind bar `Foreground` to a converter that returns a `SolidColorBrush` based on value ranges; not required |
| Smooth bar animation (transitions instead of instant jumps) | Polished feel; used in resource monitors | MEDIUM | WPF `ProgressBar` has a built-in animation mode; or manually animate `Width` with a `DoubleAnimation`; adds noise to actual readings — skip |
| Numerical GB/MB display for RAM (e.g., "7.2 GB / 16 GB") | More informative than % alone for memory decisions | LOW–MEDIUM | Requires `GlobalMemoryStatusEx` P/Invoke for `ullTotalPhys`; doable but out of scope for v1.2 |
| Per-core CPU graph | Useful for multi-core diagnosis | HIGH | Requires one counter per logical core; separate rows or sparklines; out of scope |
| GPU VRAM usage % | Useful for gamers | MEDIUM | Requires a separate counter or WMI query; potentially not available on all GPU vendors; out of scope |
| Historical sparkline (last N readings) | Trend is more useful than a point-in-time reading | HIGH | Requires circular buffer + custom drawing (WPF Canvas or WriteableBitmap); out of scope |

---

## Anti-Features (Scope Creep Risks)

These are features that will be suggested, feel obvious, and would undermine the widget's
core minimalism or add disproportionate complexity.

| Anti-Feature | Why It Gets Requested | Why to Refuse | What to Do Instead |
|--------------|----------------------|---------------|-------------------|
| GPU temperature display | "Since you're reading GPU counters anyway..." | GPU temp is not a Windows Performance Counter; requires vendor-specific DLLs (NVAPI, ADL) or WMI extensions that may not be present on all hardware | Show GPU % only; document the limitation as intentional |
| CPU temperature / fan speed | "Make it like HWiNFO lite" | Same issue — thermal data requires third-party libraries or WMI Win32_TemperatureProbe (not universally supported) | Hard no; the widget is a minimal overlay, not a hardware monitor |
| Per-process CPU list / top processes | "Show me what's eating CPU" | This is Task Manager, not a widget; would require enumerating all processes, sorting, and rendering a variable-length list | Users who need this should open Task Manager (Win+Tab → right-click → Task Manager) |
| Network I/O stats | "Add network bandwidth too" | Adds a fourth stat row and a new data source; this is v1.2 scope expansion, not a table stake | Deferred to v2+ if ever requested; keep it to 3 stats for now |
| Disk I/O stats | Same as network | Same reasons | Deferred to v2+ |
| Custom bar colors / color theme | "Let me change the colors" | Adds a color picker or color presets, which requires a new UI surface or more menu items; the design philosophy is no settings screens | Use a fixed accent color that reads well on the existing dark semi-transparent backdrop (#26000000) |
| Settings exported / imported | "Share my config" | Overkill for a widget with 5–6 settings fields total; the settings.json is already human-readable and user-accessible | Settings file location is known; power users can edit it directly |
| Click stats row to open Resource Monitor | "Quick launch shortcut" | Adds click handling on rows, which conflicts with drag behavior (left-click drag would fight with row click) | Do not add per-row click targets; drag must remain unambiguous |
| Configurable bar width | "Make bars wider/narrower" | Adds a slider or text input; the bars should be as wide as the time phrase (tied to font size); fixed relative width is correct | Bars inherit width from the existing window width, which is already driven by font size and phrase length |

---

## Feature Dependencies

```
[Stats panel display]
    └──requires──> [DispatcherTimer] (new; replaces or augments existing 10s timer)
    └──requires──> [CPU PerformanceCounter] (new; System.Diagnostics.PerformanceCounter)
    └──requires──> [GPU PerformanceCounter] (new; "GPU Engine" category; see Pitfalls)
    └──requires──> [Memory reading] (new; GlobalMemoryStatusEx P/Invoke or PerformanceCounter)
    └──requires──> [WPF bar element] (new; ProgressBar or custom Border/Rectangle)
    └──requires──> [Stats container element in XAML] (new; Grid or StackPanel rows)

[Stats container]
    └──child-of──> [Existing root StackPanel/Grid] (appended below ShadowText+PhraseText)
    └──visibility-controlled-by──> [Show/Hide toggle]

[Show/Hide toggle]
    └──requires──> [Stats submenu in ContextMenu] (new MenuItem with submenu)
    └──persists-to──> [settings.json] (extend existing AppSettings record)

[Update Interval selector]
    └──requires──> [Stats submenu in ContextMenu] (same submenu as toggle)
    └──persists-to──> [settings.json] (extend existing AppSettings record)
    └──controls──> [DispatcherTimer.Interval]

[settings.json extension]
    └──requires──> [AppSettings record gains two new fields: statsVisible, statsInterval]
    └──backward-compatible──> [existing Left/Top/FontSize fields must be unaffected]
    └──default-on-missing-fields──> [statsVisible=false, statsInterval=3]
```

### Dependency Notes

- **Timer architecture.** The existing codebase uses a `DispatcherTimer` with a 10-second interval to call `UpdatePhraseIfChanged()`. The stats update timer is a SEPARATE timer — do not merge them. The stats timer interval is user-configurable (1s/3s/10s), while the phrase timer is always 10s. Keep them independent.
- **First-sample warm-up.** `PerformanceCounter.NextValue()` for the CPU category (`"Processor"`, `"% Processor Time"`, instance `"_Total"`) returns 0 on the first call because it needs two samples to calculate a delta. Call `NextValue()` once at initialization (discard result), then start the timer. This ensures the first displayed value is meaningful.
- **GPU counter availability.** The `"GPU Engine"` category exists on Windows 10+ with WDDM 2.0+ drivers. It has multiple instances (one per engine type per adapter). Aggregating to a single overall GPU % requires summing `"Utilization Percentage"` across `"engtype_3D"` (or `"_Total"`) instances. This is the most complex part of the feature — see PITFALLS.md for the fallback strategy.
- **MemoryStatus.** The simplest approach for RAM % is `PerformanceCounter("Memory", "% Committed Bytes In Use", "")` which returns system-wide committed memory as a percentage. Alternatively, `GlobalMemoryStatusEx` via P/Invoke gives `dwMemoryLoad` directly as a 0–100 integer. The P/Invoke route is more reliable and slightly faster than instantiating a PerformanceCounter for memory.
- **SizeToContent interaction.** When the stats panel is shown, the window grows vertically. When hidden (`Collapsed`), it shrinks back. The existing `SizeToContent="WidthAndHeight"` behavior handles this automatically. No manual height calculation is needed. However, growing the window downward might push it off-screen if the widget is near the bottom edge — re-run the clamping logic after toggling visibility.
- **AppSettings record extension.** The existing `AppSettings` record (or class) gains `StatsVisible` (bool, default false) and `StatsInterval` (int, default 3). System.Text.Json deserializes missing fields to their default values for records with default parameters — no migration code needed if the record uses optional parameters with defaults.
- **Context menu structure.** The existing menu has "Font Size" submenu and "Close". The new "Stats" submenu sits between Font Size and Close. The submenu structure:
  ```
  [ Font Size  ▶ ]
  [ Stats      ▶ ]
                  [ Show Stats   ✓ ]   ← IsCheckable, checked = visible
                  [ ─────────────── ]
                  [ Update Every  ▶ ]
                                    [ 1 Second    ]
                                    [ 3 Seconds  ✓ ]  ← checked = active
                                    [ 10 Seconds   ]
  [ ─────────────── ]
  [ Close           ]
  ```

---

## Data Source: CPU %

**Source:** Windows Performance Counter
**Category:** `"Processor"`
**Counter:** `"% Processor Time"`
**Instance:** `"_Total"` (sum across all cores / logical processors)

```csharp
var cpu = new PerformanceCounter("Processor", "% Processor Time", "_Total");
cpu.NextValue(); // warm-up call; returns 0; discard
```

**Behavior:** Returns 0–100 float. Call `NextValue()` each tick. Reads from PDH.
**Availability:** Present on all Windows XP+ systems. HIGH confidence.
**Source:** https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.performancecounter

---

## Data Source: GPU %

**Source:** Windows Performance Counter
**Category:** `"GPU Engine"`
**Counter:** `"Utilization Percentage"`
**Instance:** varies — one instance per engine per adapter (e.g., `"pid_XXXX_luid_0x00000000_0x0000XXXX_phys_0_eng_0_engtype_3D"`)

To get an aggregate "overall GPU %" without per-process filtering:
1. Enumerate instances in the `"GPU Engine"` category.
2. Filter to instances ending in `"_engtype_3D"` (the 3D/compute engine used by games and heavy workloads), OR use `"_engtype_VideoDecode"` + `"_engtype_VideoEncode"` for encode/decode.
3. Sum `NextValue()` across all filtered instances, cap at 100%.

**Simpler approach:** Use the `"_Total"` aggregate if available on the target machine. On many Windows 11 systems, `"_Total"` is an available instance. Check at runtime and fall back to manual aggregation if not present.

**Availability:** Windows 10 (WDDM 2.0+). Not present on older Windows or systems without a WDDM GPU. The stats panel must handle this gracefully — if the category does not exist, show "GPU: N/A" and skip the counter. See PITFALLS.md for fallback strategy.
**Confidence:** MEDIUM — behavior verified through community documentation and Windows Task Manager behavior; official Microsoft docs do not enumerate the exact instance name format.

---

## Data Source: Memory %

**Source:** Win32 API P/Invoke
**Function:** `GlobalMemoryStatusEx` in `kernel32.dll`
**Field:** `MEMORYSTATUSEX.dwMemoryLoad` (0–100 integer, percentage of physical memory in use)

```csharp
[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
private class MEMORYSTATUSEX
{
    public uint dwLength = (uint)Marshal.SizeOf(typeof(MEMORYSTATUSEX));
    public uint dwMemoryLoad;
    public ulong ullTotalPhys;
    public ulong ullAvailPhys;
    // ... remaining fields
}

[DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
private static extern bool GlobalMemoryStatusEx([In, Out] MEMORYSTATUSEX lpBuffer);
```

**Alternative:** `PerformanceCounter("Memory", "% Committed Bytes In Use", "")` gives committed bytes as %, which is a different (slightly higher) metric than physical RAM %. For a simple "RAM %" display that matches Task Manager, prefer `GlobalMemoryStatusEx.dwMemoryLoad`.
**Availability:** All Windows versions; kernel32.dll P/Invoke is universally available.
**Confidence:** HIGH — official Windows API documentation, verified 2026-02-25.
**Source:** https://learn.microsoft.com/en-us/windows/win32/api/sysinfoapi/nf-sysinfoapi-globalmemorystatusex

---

## WPF Layout: Bar + Label + Percentage

The recommended layout for a single stat row is a three-column Grid row:

```xml
<!-- Example: one stat row -->
<Grid Margin="0,2,0,0">
    <Grid.ColumnDefinitions>
        <ColumnDefinition Width="35"/>       <!-- label: "CPU" -->
        <ColumnDefinition Width="*"/>        <!-- bar: fills available width -->
        <ColumnDefinition Width="35"/>       <!-- percentage: "45%" -->
    </Grid.ColumnDefinitions>
    <TextBlock Grid.Column="0" Text="CPU" Foreground="White" FontSize="11"
               VerticalAlignment="Center"/>
    <ProgressBar Grid.Column="1" x:Name="CpuBar" Minimum="0" Maximum="100"
                 Value="45" Height="6" Margin="4,0"/>
    <TextBlock Grid.Column="2" x:Name="CpuText" Text="45%"
               Foreground="White" FontSize="11"
               HorizontalAlignment="Right" VerticalAlignment="Center"/>
</Grid>
```

**Why Grid columns instead of StackPanel:** Columns guarantee alignment across all three rows. Label widths, bar widths, and percentage widths stay identical across CPU/GPU/MEM rows. A StackPanel of StackPanels would produce uneven layouts.

**ProgressBar vs. custom Rectangle:**
- `ProgressBar` is the correct WPF control for this purpose. It has built-in `Minimum`/`Maximum`/`Value` properties, supports data binding, and has a default horizontal fill visual.
- Custom `Rectangle` or `Border` with `Width` binding requires manual width calculation relative to parent width. More code, no benefit.
- The default `ProgressBar` template includes a glow animation for indeterminate state — this should be disabled by setting `IsIndeterminate="False"` (which is the default) and setting a flat style if the animated glow is unwanted.
- Style the `ProgressBar` with a simple `ControlTemplate` if the system default aero theme looks out of place on the dark backdrop.

**Confidence:** HIGH — official WPF ProgressBar documentation, verified 2026-02-25.
**Source:** https://learn.microsoft.com/en-us/dotnet/desktop/wpf/controls/progressbar

---

## MVP Definition for v1.2

### Ship with v1.2 (Active Requirements from PROJECT.md)

- [ ] **STAT-01** — Stats panel shows CPU, GPU, and memory usage below the time phrase
- [ ] **STAT-02** — Each stat displays as a horizontal bar + percentage text
- [ ] **STAT-03** — Update interval (1s / 3s / 10s) is user-selectable via right-click submenu
- [ ] **STAT-04** — Stats panel visibility (show/hide) is user-toggleable via right-click submenu
- [ ] **STAT-05** — Stats visibility and update interval are persisted to settings.json and restored on launch

### Explicitly Not in v1.2

- GPU temperature, CPU temperature, fan speeds (requires vendor libraries)
- Per-process stats list (scope creep; use Task Manager)
- Network / Disk I/O stats (deferred to v2+ if ever needed)
- Bar color theming or custom color picker
- Sparkline history graphs
- Smooth bar animation (adds visual noise to actual readings)

---

## Complexity Assessment

| Component | Complexity | Reason |
|-----------|------------|--------|
| CPU % counter | LOW | Standard PerformanceCounter; well-documented pattern |
| Memory % via P/Invoke | LOW | Single P/Invoke call; `dwMemoryLoad` is a direct 0–100 integer |
| GPU % counter | MEDIUM | Instance enumeration required; `"_Total"` may not exist; graceful fallback needed |
| WPF bar layout | LOW | ProgressBar in Grid columns; standard WPF pattern |
| Show/Hide toggle | LOW | Set `Visibility` on a container; same `IsCheckable` pattern already used |
| Update interval selector | LOW | Restart `DispatcherTimer` with new `Interval`; same radio-check pattern already used |
| Settings persistence | LOW | Two new fields in existing `AppSettings` record; no migration needed |
| Window resize on show/hide | LOW | `SizeToContent="WidthAndHeight"` handles it automatically; add a clamp call after toggle |

---

## Sources

- `PerformanceCounter` class: https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.performancecounter (HIGH confidence — official docs, verified 2026-02-25)
- `GlobalMemoryStatusEx` P/Invoke: https://learn.microsoft.com/en-us/windows/win32/api/sysinfoapi/nf-sysinfoapi-globalmemorystatusex (HIGH confidence — official Win32 API docs, verified 2026-02-25)
- WPF `ProgressBar` control: https://learn.microsoft.com/en-us/dotnet/desktop/wpf/controls/progressbar (HIGH confidence — official docs, verified 2026-02-25)
- `MEMORYSTATUSEX.dwMemoryLoad` field: https://learn.microsoft.com/en-us/windows/win32/api/sysinfoapi/ns-sysinfoapi-memorystatusex (HIGH confidence — official Win32 API docs)
- `"GPU Engine"` performance counter category: Community-verified against Windows Task Manager behavior on Windows 10/11; no single authoritative Microsoft doc enumerates all instance name patterns (MEDIUM confidence)
- `ComputerInfo.TotalPhysicalMemory` / `AvailablePhysicalMemory`: https://learn.microsoft.com/en-us/dotnet/api/microsoft.visualbasic.devices.computerinfo (HIGH confidence — alternative RAM source, verified 2026-02-25)
- Existing codebase: `C:/src/gsd1/FuzzyClock.App/MainWindow.xaml` and `MainWindow.xaml.cs` (HIGH confidence — first-party)

---

*Feature research for: Fuzzy Clock v1.2 — system stats panel (CPU / GPU / MEM)*
*Researched: 2026-02-25*
