# Feature Research

**Domain:** Desktop overlay widget — uptime display and rolling CPU load averages (v2.1)
**Researched:** 2026-02-27
**Confidence:** HIGH (all claims grounded in codebase inspection, official .NET 10 docs, and Windows API docs)

---

## Scope Note

This file supersedes the v2.0 FEATURES.md. It focuses exclusively on the two feature areas
targeted in v2.1: system uptime display and rolling 1m/5m/15m CPU load averages shown as a
single compact line below the stats panel.

The existing codebase (v2.0) is a transparent frameless always-on-top WPF window. Relevant
existing infrastructure for this milestone:

- `StatsService` — PDH-based service exposing `CpuPercent`, `GpuPercent`, `MemPercent`, `PagPercent`; called on each `_statsTimer.Tick`
- `_statsTimer` — DispatcherTimer at 1s/3s/10s (user-configurable); drives `UpdateStatsDisplay()`
- Stats panel: `StatsPanel` (StackPanel), four row elements (`CpuRow`, `GpuRow`, `MemRow`, `PagRow`), all Visibility-toggled
- `AppSettings` record: `init`-property record, JSON-safe forward/backward compat; currently 15 fields
- Context menu: `ContextMenu_Opened` sync pattern for `IsCheckable` items; established for all toggles
- `SetStatsVisible()` / `SetStatRowVisible()` pattern: separate from `ApplySettings()` due to pre-Show() safety invariant

The uptime/load line is a new `TextBlock` (or equivalent) below `StatsPanel`, styled in the accent
color, toggleable via right-click. It is NOT part of the stats panel — it is a sibling element below it.

---

## How Uptime and Load Averages Work in Desktop System Monitors

### Uptime Display

System uptime is the time elapsed since the last boot. On Windows, the canonical in-process source is:

**`Environment.TickCount64`** (in-box .NET 10, no NuGet required)
- Returns milliseconds elapsed since system start
- On .NET 10 / Windows: includes sleep and hibernate time (uses `GetTickCount64` under the hood)
  - Source: https://learn.microsoft.com/en-us/dotnet/api/system.environment.tickcount64?view=net-10.0
  - This is the "wall clock" boot time, which is what users expect: "my PC has been on for 3 days"
  - Note: .NET 11 changes this to exclude sleep time (`QueryUnbiasedInterruptTime`); .NET 10 includes it
- `int64`, no overflow risk — at 64-bit it overflows after ~584 million years
- Resolution: 10–16ms (fixed cadence on Windows .NET 10)
- Usage: `TimeSpan uptime = TimeSpan.FromMilliseconds(Environment.TickCount64);`

**Alternative: WMI `Win32_OperatingSystem.LastBootUpTime`**
- Returns the actual boot time as a `DateTime`; `DateTime.UtcNow - bootTime` = uptime
- Accurate but requires `System.Management` NuGet package (not in-box .NET 10)
- WMI queries are 10-50x slower than PDH for the same data (established in v1.2 research)
- Verdict: reject; `Environment.TickCount64` is sufficient and zero-dependency

**Alternative: PDH "System Up Time" counter**
- `PerformanceCounter("System", "System Up Time", "")` — returns seconds since boot as a float
- Available via existing `System.Diagnostics.PerformanceCounter` dependency (already in project)
- Less precise than `TickCount64` for this use (float precision for large values)
- Verdict: reject; `TickCount64` is simpler and already available in-box

### Format Conventions for Uptime

Desktop system monitors (HWiNFO64, Process Lasso, Task Manager "Uptime" column, Windows Resource
Monitor, Conky on Linux) consistently use this compact format:

**Primary format (most common):** `Xd Xh Xm` — e.g., `3d 14h 22m`
- Days, hours, minutes; no seconds (seconds change every second and look frantic in a slow-refresh widget)
- Omit leading zero units for brevity: `14h 22m` if uptime < 1 day; `22m` if uptime < 1 hour
- Linux `uptime` command output reads `up 3 days, 14:22` — the prefix "up " is the standard indicator

**Edge cases that need handling:**

| Scenario | Raw Value | Display | Notes |
|----------|-----------|---------|-------|
| Fresh boot (< 1 min) | 0–59 seconds | `up 0m` | Show zero-minutes rather than blank |
| Under one hour | 22 minutes | `up 22m` | Omit hours and days entirely |
| Under one day | 5h 3m | `up 5h 3m` | Omit days |
| Exactly one day | 1d 0h 0m | `up 1d 0h 0m` | Include 0h 0m once days appear |
| Multi-week uptime | 14d 6h 3m | `up 14d 6h 3m` | No upper bound needed; TimeSpan handles years |
| Very long uptime (server) | 365d 0h 0m | `up 365d 0h 0m` | TimeSpan days can be > 365; format as `Xd Xh Xm` regardless |
| Sleep/hibernate resume | TickCount64 still ticking | Unchanged | TickCount64 on .NET 10 includes sleep time; consistent with "power-on" sense of uptime |

**Recommended format rule:** `up {D}d {H}h {M}m` when days >= 1; `up {H}h {M}m` when hours >= 1 but days = 0; `up {M}m` when uptime < 1 hour. Never show seconds.

### Rolling CPU Load Averages

**What load average means:** The Unix 1m/5m/15m load averages represent the exponentially weighted
moving average (EWMA) of the number of runnable or running processes over the respective window.
On Windows, there is no OS-native equivalent — Task Manager and Resource Monitor show instantaneous
CPU % but not load averages.

**What desktop widgets display instead:** For Windows monitors, "load average" is reinterpreted as
the EWMA of CPU utilization percentage. This is the universally understood approximation and is used
by tools like Rainmeter, btop4win, and Windows port of htop. Values like `0.52, 0.47, 0.43` (as
fractions of 1.0) or `52%, 47%, 43%` are both used. The design spec uses decimal fractions (0.00–1.00),
which is the Linux convention (load/cores ratio normalized to [0,1]).

**How to compute EWMA on Windows:**
The standard Unix EWMA formula uses a decay constant `α = 1 - e^(-sample_interval / window)`:
- For 1m window, 5s sample interval: α₁ = 1 - e^(-5/60) ≈ 0.0800
- For 5m window, 5s sample interval: α₅ = 1 - e^(-5/300) ≈ 0.0165
- For 15m window, 5s sample interval: α₁₅ = 1 - e^(-5/900) ≈ 0.0055

`load_new = α * cpu_sample + (1 - α) * load_old`

Where `cpu_sample = CpuPercent / 100.0` (normalized to 0.0–1.0).

**Critical edge case — cold start:** The EWMA starts at 0.00 on first launch. The 1m average
stabilizes quickly (~1 minute), but the 5m average takes ~5 minutes and the 15m average takes
~15 minutes to reflect reality. Before stabilization, values are artificially depressed (trend
toward zero). This is the same behavior as Linux — `uptime` shows `0.00 0.00 0.00` immediately
after boot while the kernel's EWMAs initialize.

Display options for cold start:
1. **Show as-is:** Values start near 0 and trend up — consistent with Linux behavior; users familiar
   with `uptime` will understand. This is the correct approach for a "Linux-style system pulse."
2. **Pre-seed with current CPU value:** Initialize all three EWMA accumulators to the first CPU sample
   rather than 0. This avoids the dramatic ramp-up on startup. Less purist, slightly more useful
   for a desktop widget.
3. **Show "--" until window fills:** `--` for 15m value until 15 minutes have elapsed. Adds complexity
   for little benefit.

Recommendation: pre-seed with the first CPU sample (option 2). For a compact desktop widget where
users glance at the numbers, showing `0.00` for 15m while the real load is `0.80` is confusing.
The pre-seed makes all three values meaningful immediately.

**Sample rate consideration:** The existing `_statsTimer` fires at the user's configured interval
(1s/3s/10s). The EWMA sample rate should match the timer rate — the decay constant must be computed
dynamically based on the interval, or a fixed sample interval should be assumed. Using a fixed
5-second effective sample rate (regardless of actual timer interval) simplifies the math but
introduces inaccuracy at 10s intervals. The correct approach: recompute the EWMA decay constants
when the timer interval changes (or compute them fresh on each sample using the actual elapsed time).

Simplest correct approach: store the last-sample timestamp, compute elapsed seconds since last
sample, then use that elapsed time in the decay formula: `α = 1 - exp(-elapsed / window_seconds)`.
This is accurate regardless of timer interval or pauses during drag (drag pause is an existing
feature that stops `_statsTimer`).

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that any user requesting an "uptime + load" line would assume are present.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Uptime shown as `up Xd Xh Xm` | "up" prefix is the universal system uptime convention (Linux uptime, Windows Task Manager); compact days/hours/minutes format is standard | LOW | `TimeSpan.FromMilliseconds(Environment.TickCount64)`; string format in code-behind; no new service needed |
| Three load values (1m, 5m, 15m) | The 1/5/15 triplet is the universal load average format; showing only one would feel incomplete | LOW–MEDIUM | EWMA accumulators (three doubles); updated on each `_statsTimer.Tick`; computationally trivial |
| Values comma-separated on one line | Example from spec: `up 3d 14h 22m  0.52, 0.47, 0.43`; dense single-line is the expected style | LOW | Single `TextBlock` with string interpolation; two spaces between uptime and load section |
| Accent color applied to uptime/load row | All other widget text uses the accent color; uptime text in a different color would be jarring | LOW | Apply `_accentColor` in `ApplyTheme()` to the new TextBlock |
| Row visible by default | Stats panel rows are visible by default; users expect new info rows to be visible until explicitly hidden | LOW | Default `true` in `AppSettings` |
| Right-click toggle (show/hide) | All other rows support right-click toggle; uptime/load must follow the same pattern | LOW | New `MenuItem` in context menu; same `ContextMenu_Opened` sync pattern already established |
| Visibility persists across restarts | All preferences persist; uptime visibility must too | LOW | New `UptimeVisible` bool in `AppSettings` record; defaults to `true` |
| Uptime updates every minute | Uptime text shows minutes; sub-minute updates would be visible as flicker but provide no additional information | LOW | The existing `_timer` (10s phrase timer) fires frequently enough; or update on each `_statsTimer.Tick` — either works; see dependency notes |

### Expected Behavioral Details

| Behavior | Why Expected | Notes |
|----------|--------------|-------|
| Load values formatted as `0.52` (two decimal places) | Decimal fractions are the Linux convention; consistent with `0.00` at startup; `52%` would also work but `0.52` matches the spec format | Format string `"F2"` on each double |
| Uptime does not show seconds | Seconds would change every second and look frantic in a widget that otherwise changes slowly | Truncate to minutes: `(long)uptime.TotalMinutes` for the minutes component |
| Uptime format omits zero leading units | `5h 3m` not `0d 5h 3m`; `14m` not `0h 14m`; matches Linux uptime output style | Conditional string building based on `uptime.Days`, `uptime.Hours`, `uptime.Minutes` |
| Load values are space-separated after each comma | `0.52, 0.47, 0.43` not `0.52,0.47,0.43` | Include space after comma in format string |
| Two spaces between uptime section and load section | `up 3d 14h 22m  0.52, 0.47, 0.43` (two spaces per spec) | Literal `"  "` in string interpolation |
| Row collapses (Visibility.Collapsed) when hidden | Existing rows use Collapsed not Hidden; Collapsed removes layout space, Hidden leaves a gap | Same Visibility pattern as all other rows |
| Stats panel hide/show does not affect uptime row visibility independently | Uptime row is a sibling of StatsPanel, not a child; its visibility is controlled separately | XAML structure: uptime TextBlock is a sibling below StatsPanel in the outer StackPanel |
| Load values start at a reasonable estimate, not 0.00 | Pre-seeding with first CPU sample avoids misleading zeros; see cold start discussion above | On first Tick, if EWMA accumulators are uninitialized, initialize to `CpuPercent / 100.0` |

### Differentiators (Nice to Have, Not Required for v2.1)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Separate update interval for uptime row | Uptime changes once per minute; refreshing it at 1s wastes CPU for no visual benefit | LOW | Currently it would refresh at stats timer rate, which is fine for a minimal widget; not worth the complexity |
| Peak load indicator (e.g., asterisk when > 0.80) | Visual cue for high load | LOW | Trivial to add (`*` suffix) but clutters the compact format; defer |
| Load sparkline (tiny bar or colored digit) | Visual trend at a glance | HIGH | Requires additional XAML elements; contradicts "single line" design; out of scope |
| Boot time tooltip | Hover over uptime to see actual boot datetime | MEDIUM | Requires tooltip XAML on the TextBlock; nice-to-have; out of scope |

### Anti-Features (Scope Creep Risks)

| Anti-Feature | Why It Gets Requested | Why to Refuse | What to Do Instead |
|--------------|----------------------|---------------|-------------------|
| Show seconds in uptime | "I want exact uptime" | Seconds changing every second would cause the widget to constantly visually update, drawing the eye; the widget is a glance-at tool, not a stopwatch | Truncate to minutes; update once per minute is visually calm |
| Separate 1m/5m/15m rows | "I want more space for each value" | Three separate rows for a secondary metric would push the widget taller and clutter the layout; the three values on one line is the established convention | Keep the single-line comma-separated format per spec |
| WMI for uptime | "More accurate boot time" | `System.Management` NuGet adds 5-10MB to publish size; WMI queries are 10-50x slower; `Environment.TickCount64` is accurate enough and zero-cost | Use `Environment.TickCount64` |
| Network uptime or session uptime | "Show how long since last login" | This is a different concept (session time vs. system uptime); adds complexity; nobody asks for this from a clock widget | Stick to system uptime (time since last boot) |
| Configurable windows (e.g., user picks 1m/10m/30m) | "I want different averaging windows" | Adds menu surface area; the 1m/5m/15m triplet is a universal standard users already understand; deviation creates confusion | Lock to the standard 1m/5m/15m windows |
| Load average normalized to core count | "Real Linux load averages can exceed 1.0" | Normalizing by core count is the Linux model for process queue depth; here we are approximating with CPU %; keeping values in [0.0, 1.0] is more readable for a widget | Normalize CPU % to [0.0, 1.0]; clamp to 1.0; do not divide by core count |
| Separate "Uptime row" and "Load row" toggles | "I might want one without the other" | The spec treats them as one combined row; two independent toggles doubles the menu surface and settings complexity for minimal user benefit | One toggle controls both; they are on the same physical line |

---

## Feature Dependencies

```
[UPT-01: Uptime + Load Line Display]
    └──requires──> [UptimeRow TextBlock] (new element in XAML below StatsPanel)
    └──requires──> [Environment.TickCount64] (in-box .NET 10; no NuGet)
    └──requires──> [EWMA accumulators in StatsService or MainWindow] (three doubles: _load1m, _load5m, _load15m)
    └──requires──> [CPU sample from existing StatsService.CpuPercent] (already available; no new PDH counter)
    └──feeds-from──> [_statsTimer.Tick → UpdateStatsDisplay()] (EWMA updated each tick using CpuPercent)
    └──requires──> [ApplyTheme() extension] (UptimeRow TextBlock must be accent-colored)

[UPT-02: Toggle Visibility]
    └──requires──> [UPT-01 infrastructure] (row must exist before it can be toggled)
    └──requires──> [New MenuItem in context menu] ("Show Uptime" or "Uptime & Load"; same IsCheckable pattern)
    └──requires──> [ContextMenu_Opened sync] (set IsChecked from UptimeRow.Visibility)
    └──persists-to──> [AppSettings.UptimeVisible: bool, default true]
    └──requires──> [ApplySettings() extension] (set UptimeRow.Visibility from s.UptimeVisible before Show())
    └──requires──> [SaveSettings() extension] (capture UptimeRow.Visibility in the AppSettings record)

[EWMA accumulators]
    └──initialized-on──> [first StatsService.Refresh() after _initialized = true]
    └──updated-on──> [each _statsTimer.Tick] (not the phrase timer; phrase timer is 10s and context-free)
    └──uses──> [elapsed-time-since-last-sample for accurate decay] (store _lastLoadSampleTime: DateTime)
    └──does-NOT-require──> [new DispatcherTimer] (reuses existing _statsTimer; no new timer)

[UptimeRow visibility behavior]
    └──independent-of──> [StatsPanel visibility] (uptime row is NOT a child of StatsPanel; sibling element)
    └──independent-of──> [individual stat row visibility] (CpuRow/GpuRow/MemRow/PagRow toggles do not affect it)
    └──uses──> [Visibility.Collapsed (not Hidden)] (consistent with all other row visibility in the codebase)

[AppSettings extension]
    └──new-field──> [UptimeVisible: bool, init default true]
    └──backward-compat──> [init-property record; old settings.json missing this field JSON-defaults to false]
    NOTE: default false in JSON deserialization means first-run behavior is HIDDEN unless guarded.
    └──guard-required──> [SettingsService.Load() must default UptimeVisible to true when field is absent]
    └──pattern──> [Same as StatsVisible which defaults to false; but UptimeVisible should default true per spec]
```

### Dependency Notes

- **EWMA lives in MainWindow, not StatsService.** `StatsService` is a pure data provider (PDH
  counters). The rolling averages are derived metrics, not raw hardware readings. Keeping EWMA
  state in `MainWindow` alongside `_statsIntervalSeconds` and `_dialMode` is consistent with the
  existing architecture. No changes to `StatsService.cs` are needed.

- **No new DispatcherTimer needed.** The EWMA updates on each `_statsTimer.Tick`, consuming the
  already-available `_statsService.CpuPercent`. The phrase timer (`_timer`, 10s) is NOT the right
  driver — it has no connection to stats state and should stay semantically pure.

- **Uptime computation is stateless.** `Environment.TickCount64` is read fresh on each display
  update; no accumulator needed. It can be called as often as desired with no side effects.

- **AppSettings default value guard.** The `init`-property record pattern means a missing JSON
  field deserializes as the C# type default (`false` for `bool`). Since `UptimeVisible` should
  default to `true` (visible by default per spec), `SettingsService.Load()` must apply a guard
  after deserialization: `if (!s.UptimeVisible && [fieldWasMissing]) s = s with { UptimeVisible = true }`.
  However, since System.Text.Json does not report which fields were absent, the safest approach
  is: store `UptimeVisible` with an `init` default of `true` in the `AppSettings` record and note
  that upgrading users with an existing settings.json will have `UptimeVisible = false` (the JSON
  default) unless a Load() guard is added. A Load() guard similar to the existing `StatsIntervalSeconds`
  guard (`if (s.StatsIntervalSeconds <= 0) ...`) should be added: a boolean field cannot be
  zero-guarded, so the real-world approach is to ship `true` as the documented default and accept
  that upgrading users will need to enable it once. Alternatively, initialize it to `true` and
  rely on forward-compat: if the field is present in JSON it will be read; if absent (old settings)
  the `init` default applies — but `init` defaults only apply during object initialization in
  code, NOT during JSON deserialization with System.Text.Json (missing fields stay at type default
  `false`). This is a known pitfall for new boolean fields added to the AppSettings record.
  Resolution: add an explicit guard in `SettingsService.Load()`.

- **XAML placement.** The uptime TextBlock must be a sibling of `StatsPanel` in the outer
  StackPanel, positioned below it. It must NOT be a child of `StatsPanel` — the stats panel has
  its own visibility toggle (`Show Stats`) that must not hide the uptime row.

- **Accent color application.** `ApplyTheme()` must be extended to set `UptimeRow.Foreground`
  to a new `SolidColorBrush(_accentColor)`. Same as all other accent-colored elements: always
  `new SolidColorBrush(...)`, never mutate frozen static brushes.

---

## MVP Definition for v2.1

### Ship with v2.1

- [ ] **UPT-01** — Widget displays a single compact line below the stats panel showing system
  uptime (`up Xd Xh Xm` format, omitting zero leading units) and three rolling CPU load averages
  (`0.52, 0.47, 0.43` format) separated by two spaces. Displayed in the accent color.
- [ ] **UPT-02** — User can show or hide the uptime/load line via a right-click menu toggle;
  state persists across restarts; visible by default.

### Explicitly Not in v2.1

- Seconds in uptime display
- Separate rows for uptime vs. load
- Configurable averaging windows
- Load sparklines or visual indicators
- Session uptime or per-user metrics
- WMI-based boot time
- Separate toggles for uptime vs. load portions

---

## Complexity Assessment

| Component | Complexity | Reason |
|-----------|------------|--------|
| Uptime computation (`Environment.TickCount64`) | LOW | One property read; `TimeSpan.FromMilliseconds()`; no async, no PDH, no NuGet |
| Uptime string formatting | LOW | Conditional string building based on `Days`, `Hours`, `Minutes`; 4–6 lines of code |
| EWMA accumulators (three doubles) | LOW | Three `double` fields; `Math.Exp()` in the update formula; no collections |
| Elapsed-time-based decay constant | LOW–MEDIUM | Store `_lastLoadSampleTime`; compute `elapsed = (DateTime.UtcNow - _lastLoadSampleTime).TotalSeconds`; avoids inaccuracy at varying timer intervals and during drag pauses |
| Pre-seeding EWMA on first sample | LOW | One-time initialization check: `if (!_loadInitialized) { _load1m = _load5m = _load15m = cpu; _loadInitialized = true; }` |
| UptimeRow TextBlock in XAML | LOW | New `TextBlock` below StatsPanel in outer StackPanel; FontSize, Foreground, Visibility set in code |
| ApplyTheme() extension for UptimeRow | LOW | One additional `UptimeRow.Foreground = new SolidColorBrush(_accentColor)` line |
| ContextMenu toggle (UPT-02) | LOW | New `MenuItem`, same IsCheckable + ContextMenu_Opened sync pattern as all other toggles |
| AppSettings extension (UptimeVisible) | LOW–MEDIUM | New `init` bool field; requires Load() guard for correct default on upgrade from pre-v2.1 settings |
| ApplySettings() + SaveSettings() extension | LOW | Set row Visibility from settings; capture Visibility in save |

**Overall milestone complexity: LOW.** No new services, no new timers, no new PDH counters, no
new NuGet packages. The entire implementation touches `AppSettings.cs`, `SettingsService.cs`
(Load guard), `MainWindow.xaml` (new TextBlock), and `MainWindow.xaml.cs` (EWMA fields, update
logic, menu handler, ApplyTheme extension). Estimated scope is comparable to a single stat row
addition (v1.4 PAG row), not a full subsystem addition.

---

## Edge Cases Reference

| Edge Case | Symptom if Unhandled | Correct Behavior |
|-----------|---------------------|-----------------|
| Uptime < 1 minute after fresh boot | Format logic shows `up 0d 0h 0m` or errors | Show `up 0m`; clamp minutes to 0 |
| Uptime exactly at minute boundary | No visual flicker expected; timer fires at 1s/3s/10s anyway | No special handling; truncation to minutes is inherently stable |
| EWMA accumulators on widget first launch (pre-15 minutes) | All three values show artificially low `0.xx` | Pre-seed all three to first CPU sample on first stats tick |
| Stats timer stopped during drag (`_dragPause`) | EWMA decay computation uses elapsed time; large elapsed gap if drag lasted 30+ seconds | `_lastLoadSampleTime` should be reset to `DateTime.UtcNow` after drag completes, OR the decay formula naturally handles a long gap (large elapsed → α approaches 1.0 → load snaps toward current CPU); the snap behavior is acceptable for a drag of seconds |
| Stats timer interval changes (1s → 10s) | Decay constants would be wrong if hardcoded | Elapsed-time-based formula is interval-agnostic; no special handling needed |
| CPU counter unavailable (StatsService not initialized) | `CpuPercent` returns 0f during PDH cold start; EWMA initialized to 0 | The pre-seed guard uses the first non-zero CpuPercent, or `_loadInitialized` check defers seeding until after PDH warm-up; safe no-op until `_statsService._initialized` |
| `UptimeVisible` missing from old settings.json | JSON deserializes missing bool as `false`; uptime row hidden on upgrade | `SettingsService.Load()` guard required: if the loaded value is `false`, check if field was explicitly set or absent; simplest fix is a settings version field or a `UptimeVisibleExplicitlySet` companion field — OR accept that upgrading users see it hidden and must enable once |
| Uptime row visible but StatsPanel hidden | Uptime row should remain visible independently | Uptime row is a sibling of StatsPanel, not a child; StatsPanel.Visibility has no effect on it |
| Very long uptime (> 365 days) | Integer overflow or format truncation | `TimeSpan.Days` returns the total days component as an int; `int.MaxValue` days is ~5.8 million years; no overflow risk; display as `up 400d 3h 12m` |

---

## Sources

- Existing codebase: `StatsService.cs`, `AppSettings.cs`, `MainWindow.xaml.cs` (HIGH — first-party, inspected 2026-02-27)
- `Environment.TickCount64` behavior on .NET 10 / Windows: https://learn.microsoft.com/en-us/dotnet/api/system.environment.tickcount64?view=net-10.0 (HIGH — official docs, updated 2026-02-11)
- .NET 11 breaking change for `TickCount64` (excludes sleep time in .NET 11+, includes it in .NET 10): https://learn.microsoft.com/en-us/dotnet/core/compatibility/core-libraries/11/environment-tickcount-windows-behavior (HIGH — official breaking-change doc)
- Win32 `GetTickCount64`: https://learn.microsoft.com/en-us/windows/win32/api/sysinfoapi/nf-sysinfoapi-gettickcount64 (HIGH — official Win32 API docs)
- EWMA formula: standard exponential moving average with decay `α = 1 - e^(-t/window)` — same formula used by Linux kernel for `loadavg` (MEDIUM — well-known algorithm; Linux kernel source `include/linux/sched/loadavg.h` as canonical reference)
- PROJECT.md v2.1 milestone context (HIGH — first-party, inspected 2026-02-27)

---

*Feature research for: Fuzzy Clock v2.1 — uptime display and rolling CPU load averages*
*Researched: 2026-02-27*
