# Project Research Summary

**Project:** FuzzyClock v1.2 — System Stats Panel (CPU / GPU / MEM)
**Domain:** WPF transparent desktop widget — Windows Performance Counter integration
**Researched:** 2026-02-25
**Confidence:** HIGH (CPU/MEM/Architecture/Pitfalls); MEDIUM (GPU counter instance naming)

## Executive Summary

FuzzyClock v1.2 adds a CPU, GPU, and memory usage panel below the existing time-phrase display. All research agrees on a minimal-dependency approach: one new NuGet package (`System.Diagnostics.PerformanceCounter` v10.0.0) provides CPU and GPU reading via Windows PDH counters; memory percentage comes from the same package via `% Committed Bytes In Use`. The WPF `ProgressBar` control (already in-box) provides the bar visualization, and a new `DispatcherTimer` (separate from the existing phrase timer) drives updates at the user-selected 1s/3s/10s rate. The existing code-behind style is preserved throughout — no MVVM, no additional abstraction layers.

The recommended architecture introduces one new file (`StatsService.cs`) and modifies three existing ones (`AppSettings.cs`, `MainWindow.xaml`, `MainWindow.xaml.cs`). The `AppSettings` positional record must be converted to an init-property record to allow forward and backward JSON compatibility when new fields are added. The inner `Grid` inside the existing `Border` gains an explicit `RowDefinitions` split: Row 0 for the existing phrase text, Row 1 for the stats panel. A fixed `Width` (180px recommended) on the stats panel container prevents window-width jitter from `SizeToContent=WidthAndHeight`.

The top risk is the interplay between several initialization-order constraints that are each individually simple but must all be handled correctly together: the CPU counter must be primed on a background thread (not the UI thread) and its first result discarded; GPU counters must enumerate instances at runtime and gracefully fall back when the `GPU Engine` category is absent; and the `AppSettings` load path must guard against `StatsIntervalSeconds = 0` from an old settings file, which would cause a zero-interval timer firing thousands of times per second. All of these are low-cost fixes but become expensive bugs if they reach production.

---

## Key Findings

### Recommended Stack

The v1.2 stack is a minimal addition on top of the validated v1.1 foundation (.NET 10, C# 13, WPF `net10.0-windows`, `System.Text.Json`, `DispatcherTimer`, zero third-party packages). Only one new package is required.

**Core technologies:**
- `System.Diagnostics.PerformanceCounter` (NuGet v10.0.0): reads Windows PDH counters for CPU and GPU — the Windows-native, no-vendor-dependency path that Task Manager itself uses internally
- `System.Windows.Controls.ProgressBar` (in-box WPF): horizontal bar visualization with built-in `Minimum`/`Maximum`/`Value` semantics — no custom drawing required; alternatively, two nested `Border` elements (track + fill) are preferred given the `AllowsTransparency` rendering constraints
- `Task.Run` + `async void` DispatcherTimer tick (in-box .NET 10): off-thread counter reads to prevent any UI thread blocking during PDH calls

**Counter specifications (verified confidence noted):**
- CPU: `"Processor"` / `"% Processor Time"` / `"_Total"` — canonical, Windows NT+, unchanged — HIGH confidence
- MEM: `"Memory"` / `"% Committed Bytes In Use"` — single-instance, returns [0,100] directly, no math needed — HIGH confidence
- GPU: `"GPU Engine"` / `"Utilization (%)"` — multi-instance, filter `engtype_3D`, sum across all LUIDs, clamp to 100 — MEDIUM confidence (instance name format not formally documented by Microsoft)

**What not to use:** WMI (`System.Management`) is 10–50x slower than PDH for the same data. `LibreHardwareMonitor` / `OpenHardwareMonitor` require kernel driver installation. P/Invoke into `pdh.dll` directly would be more code for identical results. `Microsoft.VisualBasic.Devices.ComputerInfo` adds a VB runtime dependency unnecessarily. MVVM / `INotifyPropertyChanged` adds abstraction layers for three property updates in a code-behind project.

**Single `.csproj` change required:**
```xml
<PackageReference Include="System.Diagnostics.PerformanceCounter" Version="10.0.0" />
```

See `STACK.md` for full counter code samples, disposal patterns, and alternatives considered.

---

### Expected Features

The five v1.2 requirements are all LOW complexity individually. GPU counter enumeration is the only MEDIUM-complexity component.

**Must have (table stakes — users will treat absence as a bug):**
- Three labeled stat rows (CPU / GPU / MEM) each with a horizontal bar and percentage text
- Live update on a configurable timer (1s / 3s / 10s); 3s is the default
- Show/Hide toggle that persists across restarts; stats hidden by default on first run
- Update interval persisted across restarts
- Bars show no 0%-then-jump artifact on startup (counter priming required)
- Window resizes cleanly when panel is shown/hidden (`Collapsed` + `SizeToContent` handles this automatically)

**Should have (differentiators — nice for v1.2, not blocking):**
- Bar color changes at thresholds (green/yellow/red) — MEDIUM complexity; not required for v1.2

**Defer to v2+:**
- GPU VRAM %, per-core CPU graphs, historical sparklines — HIGH complexity or require vendor libraries
- Network/Disk I/O stats — scope expansion beyond v1.2
- GPU/CPU temperature — requires vendor-specific DLLs (NVAPI, ADL), not available as PDH counters

**Anti-features (refuse if requested):**
- GPU temperature, CPU temperature, fan speeds — wrong library surface for this widget
- Per-process CPU list — that is Task Manager, not a widget
- Click stats row to open Resource Monitor — conflicts with drag behavior
- Custom color themes / settings screen — violates the widget's no-settings-screens philosophy

**Context menu structure:**
```
[ Font Size  > ]
[ Stats      > ]
                [ Show Stats  (checkable) ]
                [ ─────────── ]
                [ Update Interval > ]
                                    [ 1 second  ]
                                    [ 3 seconds (default, checked) ]
                                    [ 10 seconds ]
[ ────────── ]
[ Close ]
```

See `FEATURES.md` for the full feature dependency graph and data source specifications.

---

### Architecture Approach

The v1.2 architecture layers cleanly on v1.1 with no component removals. Three files are modified and one new file is added. `SettingsService.cs`, `App.xaml.cs`, and `FuzzyClock.Core` are untouched.

**Major components:**

1. `StatsService.cs` (new) — owns the three `PerformanceCounter` instances, exposes `CpuPercent` / `GpuPercent` / `MemPercent` properties, implements `IDisposable`. Single-responsibility; no WPF references.
2. `AppSettings.cs` (modified) — gains `bool StatsVisible` and `int StatsInterval` fields; converted from positional record to init-property record for JSON forward/backward compatibility.
3. `MainWindow.xaml` (modified) — inner `Grid` gains explicit `RowDefinitions`; Row 1 hosts `StatsPanel` (`StackPanel`, `Visibility="Collapsed"` default, `Width="180"` fixed); Stats submenu added to `ContextMenu`.
4. `MainWindow.xaml.cs` (modified) — adds `_statsTimer` (separate `DispatcherTimer`), `SetStatsVisible()`, `SetStatsInterval()`, `UpdateStatsDisplay()`; extends `ApplySettings()`, `SaveSettings()`, `OnClosing()`, and `ContextMenu_Opened()`.

**Key patterns to follow:**
- Two independent timers: phrase timer (10s, not configurable) and stats timer (1s/3s/10s, user-configurable). Never merge them.
- Stop-then-dispose order: stop `_statsTimer` before calling `_statsService.Dispose()` in `OnClosing`.
- Single `DispatcherTimer` instance for stats: toggle with `Start()`/`Stop()`, never recreate on interval change. Interval change: `Stop()` → set `Interval` → `Start()`.
- Bar fill width computed from track `Border.ActualWidth`, not from `Window.ActualWidth`.
- No `UpdateLayout()` in the stats tick — only in `SetStatsVisible()` after panel visibility changes.
- `ContextMenu_Opened` is the single sync point for all `IsChecked` states (established v1.1 pattern, extended here).
- Counter initialization on `Task.Run()` background thread; UI updates on DispatcherTimer tick (already on UI thread).

**Suggested build order (each step independently verifiable):**
1. AppSettings record migration (init-property record + new fields + Load() guard)
2. StatsService (no UI — verify values via debug output before touching XAML)
3. XAML stats panel structure (verify widget renders identically to v1.1 with panel Collapsed)
4. Code-behind stats display (UpdateStatsDisplay wired to timer)
5. Show/Hide toggle (SetStatsVisible + timer coupling + SaveSettings)
6. Update interval selector (SetStatsInterval + ContextMenu_Opened sync)
7. Edge-case cleanup (disposal, upgrade path, off-screen clamp with taller window)

See `ARCHITECTURE.md` for full XAML samples, data flow diagrams, and 5 annotated anti-patterns.

---

### Critical Pitfalls

All critical pitfalls carry LOW or MEDIUM recovery cost, but several must be addressed at the correct build step or they silently corrupt behavior.

1. **CPU counter first `NextValue()` always returns 0** — call `NextValue()` once during initialization, discard the result; start the UI timer only after the second call. Failure mode: CPU bar shows 0% on first tick, then jumps to the real value.

2. **`AppSettings` positional record + new `int` field defaults to 0 on old JSON** — `StatsIntervalSeconds = 0` creates a zero-interval `DispatcherTimer` that fires thousands of times per second, spiking CPU. Guard in `SettingsService.Load()`: if `StatsIntervalSeconds <= 0`, replace with `Defaults().StatsIntervalSeconds`. Must be done in the AppSettings phase, before any timer construction code.

3. **PerformanceCounter initialization blocks the UI thread** — PDH cold-start reads can take 200–500ms on some machines. Initialize all counters inside `Task.Run()`, keep a `_initialized` flag, and skip stats ticks until initialization is complete.

4. **GPU `Engine` category is multi-instance — reading one instance gives wrong results** — enumerate all instances, filter for `engtype_3D`, sum `Utilization (%)` values, clamp to 100. Cache the counter objects; catch `InvalidOperationException` (instance disappeared after driver update or sleep/wake) and re-enumerate. On machines without the `GPU Engine` category, set `_gpuAvailable = false` and show "N/A".

5. **`SizeToContent=WidthAndHeight` + `Width="Auto"` on stats bars causes window-width jitter every second** — set a fixed `Width="180"` on the `StatsPanel` container. Percentage text width changes (e.g., "9%" to "10%") then affect only inner layout, not window width.

6. **`AllowsTransparency=True` + `DropShadowEffect` on bar elements silently renders flat** — use only flat `SolidColorBrush` fills. Same constraint that drove the phrase-shadow workaround in v1.0; applies equally to bar elements.

7. **Double `DispatcherTimer` from recreating on each interval change** — use a single `_statsTimer` instance; change interval via `Stop()` → set `Interval` → `Start()`.

8. **Stats timer keeps running when panel is hidden** — stop `_statsTimer` in `SetStatsVisible(false)`; start it in `SetStatsVisible(true)`. Continuous counter reads when nothing is displayed waste CPU on a widget that may run for days.

See `PITFALLS.md` for all 12 pitfalls with detection symptoms, prevention code, and recovery steps.

---

## Implications for Roadmap

All research converges on a 4-phase implementation. The ordering is driven by hard dependencies: settings shape must be stable before any new field is read, the service must exist before UI can display data, XAML elements must exist before code-behind can reference them by name.

### Phase 1: AppSettings Migration and Settings Plumbing

**Rationale:** Every subsequent phase reads or writes `StatsVisible` and `StatsInterval`. The record conversion is the foundation. The zero-interval timer bug (Pitfall 2) can only be prevented here, and the fix is one guard clause in `SettingsService.Load()`.

**Delivers:** `AppSettings` converted to init-property record with `StatsVisible` and `StatsInterval` fields; `SettingsService.Load()` guard for `StatsIntervalSeconds <= 0`; round-trip test confirming old v1.1 JSON loads with correct defaults for new fields.

**Addresses (FEATURES):** STAT-05 (settings persistence and restoration)

**Avoids (PITFALLS):** Pitfall 2 (zero-interval timer from old JSON), JSON backward-compatibility issue

**Research flag:** Standard pattern — no additional research needed. Init-property record migration and `System.Text.Json` default behavior are fully documented at HIGH confidence.

---

### Phase 2: StatsService — Counter Initialization and Data Refresh

**Rationale:** `StatsService` is the only component with meaningful technical complexity (GPU multi-instance enumeration, async init, `IDisposable` pattern). Implementing and verifying it in isolation, with debug output but no UI, prevents counter logic bugs from being confused with layout bugs later.

**Delivers:** `StatsService.cs` with async initialization via `Task.Run()`, CPU counter priming, GPU instance enumeration with `engtype_3D` filter and `InvalidOperationException` recovery, `% Committed Bytes In Use` memory reading, and `IDisposable` cleanup. Verified via debug output showing non-zero plausible values that track real system load.

**Addresses (FEATURES):** STAT-01 data layer (CPU / GPU / MEM readings), STAT-03 data polling

**Avoids (PITFALLS):** Pitfall 1 (CPU first-read = 0), Pitfall 3 (UI thread block on init), Pitfall 4 (GPU single-instance wrong value), Pitfall 5 (handle leak from undisposed counters), Pitfall 11 (GPU category absent on VM/RDP)

**Research flag:** GPU instance enumeration is MEDIUM confidence. The `engtype_3D` filter and aggregation approach is well-established in community sources but not formally documented by Microsoft. During this phase, run `typeperf "\GPU Engine(*)\Utilization Percentage"` on the target machine to confirm live instance names. Validate on a VM or RDP session to confirm the `_gpuAvailable = false` fallback path works without throwing.

---

### Phase 3: XAML Layout and Stats Display

**Rationale:** XAML elements must exist (with their `x:Name` attributes) before code-behind can reference them. This phase establishes the visual structure and the bar-fill calculation approach, and must get the `SizeToContent` interaction and rendering constraints right from the start.

**Delivers:** Inner `Grid` with explicit `RowDefinitions`; `StatsPanel` (`StackPanel`, `Width="180"`, `Visibility="Collapsed"`) with three stat rows (label + bar track + fill indicator + percentage `TextBlock`); Stats `ContextMenu` parent with Show Stats and Update Interval submenu structure; `UpdateStatsDisplay()` method wired to `_statsTimer`; bars showing live values at the default 3s interval.

**Addresses (FEATURES):** STAT-01 (visual display), STAT-02 (bar + percentage text)

**Avoids (PITFALLS):** Pitfall 6 (window-width jitter — fixed `Width="180"`), Pitfall 8 (`AllowsTransparency` + flat brush only, no `DropShadowEffect`), Anti-Pattern 4 (no `UpdateLayout()` in stats tick), Anti-Pattern 5 (bar width from track `ActualWidth`, not window `ActualWidth`)

**Research flag:** Standard pattern — WPF `Grid`, `StackPanel`, `Border` layout is fully documented. One decision to make at first render: use two nested `Border` elements (track + fill) rather than `ProgressBar`, since `ProgressBar`'s default Aero2 template may require a `ControlTemplate` override to look correct against the dark semi-transparent backdrop. This avoids a styling rabbit hole.

---

### Phase 4: Controls, Persistence, and Edge Cases

**Rationale:** The show/hide toggle and interval selector depend on both the settings plumbing (Phase 1) and the stats display (Phase 3). Deferring them to a final phase allows each control path to be validated end-to-end against a working display.

**Delivers:** `SetStatsVisible()` with timer start/stop, `UpdateLayout()` + re-clamp after visibility change; `SetStatsInterval()` with single-timer Stop/Interval-change/Start sequence; `ContextMenu_Opened` sync for all new `IsChecked` states; `ApplySettings()` reading both new fields; verified persistence across restarts; verified `OnClosing` disposal order (timer stop before service dispose).

**Addresses (FEATURES):** STAT-03 (interval selector), STAT-04 (show/hide toggle), STAT-05 (full persistence)

**Avoids (PITFALLS):** Pitfall 7 (double timer on rapid toggle), Pitfall 9 (memory counter choice documented), Pitfall 10 (`IsChecked` sync in `ContextMenu_Opened` only, not click handlers), Pitfall 12 (timer stopped when panel hidden)

**Research flag:** Standard pattern — all control logic follows the established v1.1 font-size menu pattern exactly. `DispatcherTimer` start/stop/interval-change behavior is HIGH confidence from official docs. No additional research needed.

---

### Phase Ordering Rationale

- Phase 1 before all: `AppSettings` shape must be stable — every other phase reads or writes from it, and the zero-interval timer guard must exist before any timer construction code is written.
- Phase 2 before Phase 3: `UpdateStatsDisplay()` calls `_statsService.Refresh()` — the service must exist and produce verified values before any UI references it.
- Phase 3 before Phase 4: `SetStatsVisible()` and `SetStatsInterval()` reference named XAML elements (`StatsPanel`, `_statsTimer`) that are created in Phase 3.
- Phase 4 last: control wiring and edge cases are clean-up on a fully working feature.

### Research Flags

Phases needing implementation-time validation:
- **Phase 2 (StatsService / GPU):** GPU counter instance format is MEDIUM confidence. Validate on physical hardware with a discrete GPU — GPU% should track Task Manager's GPU column. Test the `_gpuAvailable = false` path on a VM or RDP session.

Phases with standard patterns (no additional research needed):
- **Phase 1 (AppSettings):** Init-property record + `System.Text.Json` defaults — HIGH confidence, official docs.
- **Phase 3 (XAML Layout):** WPF layout primitives — HIGH confidence, fully documented.
- **Phase 4 (Controls/Persistence):** Follows established v1.1 patterns exactly — HIGH confidence.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | CPU and MEM counter paths canonical since Windows NT. One required NuGet package confirmed via official `windowsdesktop-10.0` assembly docs. GPU counter approach widely confirmed by community; Microsoft display driver GPU counter docs returned 404 during research. |
| Features | HIGH | All 5 MVP requirements (STAT-01 through STAT-05) are LOW-MEDIUM complexity. Anti-features and defer list are well-reasoned and internally consistent with the widget's design philosophy. |
| Architecture | HIGH | Component boundaries are clean. Build order has explicit dependency rationale with each step independently verifiable. JSON compatibility issue identified and solved. All 5 anti-patterns documented with concrete alternatives. |
| Pitfalls | HIGH | 12 pitfalls documented. All 8 critical pitfalls (1–8) verified against official docs or first-party source. GPU instance name format (Pitfall 4) carries MEDIUM confidence due to absence of formal Microsoft documentation. |

**Overall confidence: HIGH**

### Gaps to Address

- **GPU instance name format:** The `engtype_3D` filter string and per-process-per-engine instance naming convention are confirmed by wide community consensus but not by a single authoritative Microsoft document. During Phase 2, run `typeperf "\GPU Engine(*)\Utilization Percentage"` on the target machine to confirm live instance names before finalizing the enumeration logic.

- **ProgressBar vs. custom Border for bars:** The ARCHITECTURE research recommends using two nested `Border` elements (track + fill) instead of `ProgressBar` to avoid a `ControlTemplate` override needed for the dark backdrop. This should be decided at first render in Phase 3, not designed in advance.

- **AppSettings record conversion approach:** ARCHITECTURE.md recommends converting to an init-property record (cleaner long-term). PITFALLS.md shows that a guard in `SettingsService.Load()` alone is sufficient as a simpler alternative. Both are valid. The implementation team should pick one approach in Phase 1 and commit to it. The init-property record conversion is the recommended choice since it prevents the entire class of missing-field issues for all future additions.

---

## Sources

### Primary (HIGH confidence)

- `System.Diagnostics.PerformanceCounter` class (`windowsdesktop-10.0`): https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.performancecounter?view=windowsdesktop-10.0 — assembly, `NextValue()` behavior, rate-counter priming, `IDisposable`
- `System.Diagnostics.PerformanceCounterCategory` class (`windowsdesktop-10.0`): https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.performancecountercategory?view=windowsdesktop-10.0 — `Exists()`, `GetInstanceNames()`
- `System.Windows.Controls.ProgressBar` (`windowsdesktop-10.0`): https://learn.microsoft.com/en-us/dotnet/api/system.windows.controls.progressbar?view=windowsdesktop-10.0 — namespace, assembly, `Minimum`/`Maximum`/`Value`
- `GlobalMemoryStatusEx` Win32 API: https://learn.microsoft.com/en-us/windows/win32/api/sysinfoapi/nf-sysinfoapi-globalmemorystatusex — `dwMemoryLoad` field (0–100 integer); alternative to the PDH memory counter
- `System.Text.Json` immutability / positional record deserialization: https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/immutability — positional record constructor parameters are optional (type defaults used when missing)
- `System.Text.Json` required properties: https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/required-properties — confirms .NET 10 behavior for missing constructor parameters
- `DispatcherTimer` class: https://learn.microsoft.com/en-us/dotnet/api/system.windows.threading.dispatchertimer — `Interval`, `Start()`, `Stop()`
- `Window.AllowsTransparency` — layered HWND, hardware acceleration disabled: https://learn.microsoft.com/en-us/dotnet/api/system.windows.window.allowstransparency
- `PerformanceCounterCategory.Exists`: https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.performancecountercategory.exists
- Windows Performance Counters overview: https://learn.microsoft.com/en-us/windows/win32/perfctrs/about-performance-counters — PDH architecture, single vs. multi-instance categories
- Existing codebase (`c:/src/gsd1/FuzzyClock.App/`): `AppSettings.cs`, `SettingsService.cs`, `MainWindow.xaml`, `MainWindow.xaml.cs` — confirmed existing patterns, record shape, ContextMenu structure

### Secondary (MEDIUM confidence)

- GPU Performance Counters driver documentation: https://learn.microsoft.com/en-us/windows-hardware/drivers/display/gpu-performance-counters — category existence confirmed; exact instance name format not fully enumerated
- `"GPU Engine"` / `"Utilization Percentage"` instance name format (`engtype_3D`, LUID prefix, per-process-per-engine structure): community-documented via Stack Overflow, GitHub issues, and `typeperf` command output; consistent across multiple independent sources; no single authoritative Microsoft document

---

*Research completed: 2026-02-25*
*Ready for roadmap: yes*
