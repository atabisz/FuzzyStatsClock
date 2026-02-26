# Phase 11: PAG Stat Row - Research

**Researched:** 2026-02-26
**Domain:** Windows PDH PerformanceCounter, WPF XAML, C# AppSettings persistence
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| STAT-11 | PAG row appears in stats panel below MEM row, showing % paging file usage as horizontal bar + percentage text | PDH "Paging File"/"% Usage"/"_Total" counter; XAML PagRow Grid identical to CpuRow/GpuRow/MemRow pattern |
| STAT-12 | User can toggle PAG row visibility via right-click Stats submenu; checkmark reflects actual PAG row state each time menu opens | MenuPagVisible MenuItem (IsCheckable=True); ContextMenu_Opened reads PagRow.Visibility — same pattern as CPU/GPU/MEM |
| STAT-13 | Hiding all four stat rows (CPU/GPU/MEM/PAG) auto-collapses the stats panel | SetStatRowVisible() auto-collapse condition must add `&& PagRow.Visibility == Visibility.Collapsed` |
| STAT-14 | PAG row visibility persists to settings.json and restores on launch | AppSettings.PagVisible bool init-property (default true); SaveSettings + ApplySettings extension — same pattern as CpuVisible/GpuVisible/MemVisible |
| STAT-15 | When paging file is disabled or unavailable, PAG row shows "N/A" with no exception thrown | PerformanceCounterCategory.Exists("Paging File") guard + instance existence check; -1 sentinel on absence or exception — same pattern as _gpuAvailable |
</phase_requirements>

---

## Summary

Phase 11 adds paging file % usage as a fourth stat row, following the exact same pattern established for CPU, GPU, and MEM in Phases 7-10. The PDH counter is `("Paging File", "% Usage", "_Total")`. Unlike the CPU and GPU counters, "% Usage" is a point-in-time ratio counter — it does NOT require priming (no `NextValue()` discard needed). This is the same category as the MEM counter ("Memory", "% Committed Bytes In Use"), which also reads instantly.

The primary risk is the "no pagefile" edge case. On Windows systems where the administrator has deleted pagefile.sys and set virtual memory to "No paging file", the "Paging File" PDH category is still registered in the system (the category exists in the registry), but `GetInstanceNames()` returns an empty array — or more precisely, the "_Total" instance does not exist. The safe pattern is: check `PerformanceCounterCategory.Exists("Paging File")`, then try to create the counter in a try/catch, return -1 sentinel on failure. This mirrors the existing `_gpuAvailable` fallback in StatsService.cs exactly.

All five requirements (STAT-11 through STAT-15) map cleanly to existing code patterns. No new libraries are needed. The work is additive: one new field in AppSettings, one property in StatsService, one Grid in XAML, one MenuItem in XAML, and extensions to five existing code-behind methods.

**Primary recommendation:** Follow the exact GPU fallback pattern for the PDH counter (availability guard + -1 sentinel), and the exact CPU/MEM patterns for XAML row and menu wiring.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| System.Diagnostics.PerformanceCounter | 10.0.0 | Read Windows PDH counters | Already in FuzzyClock.App.csproj — no new NuGet needed |
| System.Text.Json | (in-box .NET 10) | Persist AppSettings.PagVisible | Already used for all other bool settings fields |
| WPF (net10.0-windows) | .NET 10 | XAML Grid row + MenuItem | Already the app framework |

### Supporting
No new packages required. All needed libraries are already present.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| PDH "Paging File"/"% Usage" | WMI Win32_PageFileUsage | WMI is slower and heavier; PDH is the existing approach in this codebase |
| PDH "_Total" instance | individual pagefile path instances | _Total aggregates all pagefiles correctly; individual paths require enumeration |

**Installation:** No new packages needed. Existing `System.Diagnostics.PerformanceCounter` v10.0.0 covers all PDH access.

---

## Architecture Patterns

### Recommended Project Structure

No new files. All changes are additive modifications to existing files:

```
FuzzyClock.App/
├── AppSettings.cs          # +PagVisible bool (init-property, default true)
├── StatsService.cs         # +PagPercent float property + PDH counter init/refresh/dispose
├── MainWindow.xaml         # +PagRow Grid + MenuPagVisible MenuItem
└── MainWindow.xaml.cs      # +MenuPagVisible_Click + UpdateStatsDisplay PAG + ContextMenu_Opened PAG + ApplySettings PAG + SaveSettings PAG + SetStatRowVisible auto-collapse fix
```

### Pattern 1: PDH Point-in-Time Counter (no priming)

**What:** "Paging File"/"% Usage" is a ratio counter — its first `NextValue()` returns a valid value immediately, unlike rate counters (CPU) that return 0 on first call.
**When to use:** All point-in-time counters. "Memory"/"% Committed Bytes In Use" uses this same pattern in the existing code.
**Example:**
```csharp
// Source: StatsService.cs existing MEM counter pattern (line 31-32)
_memCounter = new PerformanceCounter("Memory", "% Committed Bytes In Use", readOnly: true);
// MEM is a point-in-time counter — no priming needed
```

PAG counter follows the same pattern:
```csharp
// No priming needed — "% Usage" is a point-in-time ratio counter
_pagCounter = new PerformanceCounter("Paging File", "% Usage", "_Total", readOnly: true);
```

### Pattern 2: Availability Guard with -1 Sentinel

**What:** Check whether the PDH category is available before creating the counter. If absent (no pagefile configured) or if construction throws, set `_pagAvailable = false` and `PagPercent = -1f`.
**When to use:** Any PDH counter that may be absent on some configurations. GPU uses this pattern; PAG replicates it.
**Example:**
```csharp
// Source: StatsService.cs existing GPU pattern (lines 34-39)
_gpuAvailable = PerformanceCounterCategory.Exists("GPU Engine");
if (_gpuAvailable)
{
    _gpuCounters = BuildGpuCounters();
    foreach (var c in _gpuCounters) c.NextValue();  // prime GPU rate counters
}
GpuPercent = _gpuAvailable ? 0f : -1f;
```

PAG adaptation (NOTE: no priming loop needed because "% Usage" is not a rate counter):
```csharp
_pagAvailable = PerformanceCounterCategory.Exists("Paging File");
if (_pagAvailable)
{
    try
    {
        _pagCounter = new PerformanceCounter("Paging File", "% Usage", "_Total", readOnly: true);
        // No priming — point-in-time counter returns valid value immediately
    }
    catch
    {
        _pagAvailable = false;
    }
}
PagPercent = _pagAvailable ? 0f : -1f;
```

### Pattern 3: AppSettings init-property bool field

**What:** Add `PagVisible` to AppSettings record with `init` setter and default `true`.
**When to use:** Every new persistent UI preference in this codebase.
**Example:**
```csharp
// Source: AppSettings.cs existing Phase 10 pattern (lines 11-13)
public bool   CpuVisible           { get; init; } = true;
public bool   GpuVisible           { get; init; } = true;
public bool   MemVisible           { get; init; } = true;
// Add:
public bool   PagVisible           { get; init; } = true;
```

### Pattern 4: XAML Stat Row Grid

**What:** PagRow Grid is structurally identical to MemRow — three columns (35/*/36), label TextBlock, bar track Border, bar Border, percentage TextBlock.
**When to use:** Adding any new stat row.
**Example:**
```xml
<!-- Source: MainWindow.xaml MemRow pattern (lines 148-166) -->
<!-- PagRow: copy MemRow, change x:Name to PagRow, PagBarTrack, PagBar, PagText, label "PAG" -->
<Grid x:Name="PagRow" Margin="0,2,0,0">
    <Grid.ColumnDefinitions>
        <ColumnDefinition Width="35" />
        <ColumnDefinition Width="*" />
        <ColumnDefinition Width="36" />
    </Grid.ColumnDefinitions>
    <TextBlock Grid.Column="0" Text="PAG"
               Foreground="White" FontFamily="Segoe UI Light" FontSize="12"
               VerticalAlignment="Center" />
    <Border Grid.Column="1" x:Name="PagBarTrack"
            Background="#40FFFFFF" CornerRadius="2" Height="8" VerticalAlignment="Center">
        <Border x:Name="PagBar"
                HorizontalAlignment="Left" Background="White"
                CornerRadius="2" Height="8" Width="0" />
    </Border>
    <TextBlock Grid.Column="2" x:Name="PagText"
               Text="0%" Foreground="White" FontFamily="Segoe UI Light" FontSize="12"
               TextAlignment="Right" VerticalAlignment="Center" />
</Grid>
```

### Pattern 5: SetStatRowVisible Auto-Collapse Fix

**What:** The existing auto-collapse condition checks only CpuRow, GpuRow, MemRow. PagRow must be added.
**Example:**
```csharp
// Source: MainWindow.xaml.cs SetStatRowVisible (lines 298-305) — CURRENT (needs fix):
if (!visible
    && CpuRow.Visibility == Visibility.Collapsed
    && GpuRow.Visibility == Visibility.Collapsed
    && MemRow.Visibility == Visibility.Collapsed
    && StatsPanel.Visibility == Visibility.Visible)

// FIXED: add PagRow condition
if (!visible
    && CpuRow.Visibility == Visibility.Collapsed
    && GpuRow.Visibility == Visibility.Collapsed
    && MemRow.Visibility == Visibility.Collapsed
    && PagRow.Visibility == Visibility.Collapsed
    && StatsPanel.Visibility == Visibility.Visible)
```

### Pattern 6: UpdateStatsDisplay PAG branch

**What:** Display PagPercent following the GPU sentinel pattern — if < 0f, show "N/A" and zero bar.
**Example:**
```csharp
// Source: MainWindow.xaml.cs UpdateStatsDisplay GPU branch (lines 184-193)
if (_statsService.PagPercent < 0f)
{
    PagText.Text = "N/A";
    PagBar.Width = 0;
}
else
{
    PagText.Text = $"{_statsService.PagPercent:F0}%";
    PagBar.Width = StatsBarTrackWidth * (_statsService.PagPercent / 100.0);
}
```

### Anti-Patterns to Avoid

- **Priming the PAG counter:** Do NOT call `_pagCounter.NextValue()` to discard the first read. "% Usage" is a ratio counter, not a rate counter. Priming is only for rate counters (CPU, GPU). Unnecessary priming adds no value and slightly delays init.
- **Using PerformanceCounter(string, string) overload for Paging File:** The Paging File category is multi-instance (has "_Total" plus individual pagefile path instances). Use the 3-parameter constructor `(category, counter, instance)` not the 2-parameter single-instance constructor, or it will throw InvalidOperationException.
- **Using PerformanceCounter(string, string, bool) overload:** That 3-parameter overload has signature `(category, counter, readOnly)` and "requires that the category contain a single instance" — will throw for multi-instance Paging File. Use the 4-parameter `(category, counter, instance, readOnly)` constructor.
- **Not guarding ApplySettings with direct assignment:** ApplySettings() must set `PagRow.Visibility` directly (NOT via `SetStatRowVisible`) — same safety invariant as CpuRow/GpuRow/MemRow: `SetStatRowVisible` may call `UpdateLayout()` which is unsafe before `Show()`.
- **Forgetting SaveSettings PAG field:** SaveSettings() constructs a new AppSettings with named properties. Adding PagVisible is required or it silently uses default=true on next launch.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Reading paging file % | Custom WMI query, manual file reads | PDH PerformanceCounter("Paging File", "% Usage", "_Total") | PDH is already the pattern; WMI is heavier |
| Detecting no-pagefile condition | Checking registry or file system | `PerformanceCounterCategory.Exists()` + try/catch | PDH naturally surfaces absence; registry approach is fragile |
| Persisting PagVisible | Custom serialization | System.Text.Json init-property pattern | Already used for all 6 existing bool settings fields |

**Key insight:** This phase is entirely additive. Every pattern already exists in the codebase. The planner should not introduce any new patterns — replicate exactly.

---

## Common Pitfalls

### Pitfall 1: Wrong PerformanceCounter Constructor Overload

**What goes wrong:** Using `new PerformanceCounter("Paging File", "% Usage", readOnly: true)` (the 3-param constructor with bool) throws `InvalidOperationException: Category 'Paging File' is a multi-instance category but there is not a default instance` or similar.
**Why it happens:** The 3-parameter `(string, string, bool)` constructor is for single-instance categories only. "Paging File" is multi-instance (has "_Total" plus per-pagefile instances).
**How to avoid:** Always use the 4-parameter constructor: `new PerformanceCounter("Paging File", "% Usage", "_Total", readOnly: true)`.
**Warning signs:** `InvalidOperationException` at counter construction time.

### Pitfall 2: Treating PAG as a Rate Counter (Unnecessary Priming)

**What goes wrong:** Adding `_pagCounter.NextValue(); // prime` and waiting an extra second before first valid read.
**Why it happens:** Copying GPU priming pattern without understanding counter type. CPU and GPU use rate counters (PERF_COUNTER_COUNTER / time-based delta). "% Usage" is a ratio counter — Windows reports the current value directly, not a delta.
**How to avoid:** Only prime counters whose first call always returns 0.0. MEM counter in existing code has the comment "no priming needed" — apply the same reasoning to PAG.
**Warning signs:** First PAG reading is 0% even though pagefile is in use.

### Pitfall 3: No-Pagefile Instance Absence vs. Category Absence

**What goes wrong:** `PerformanceCounterCategory.Exists("Paging File")` returns `true` (the category is always registered) but `new PerformanceCounter("Paging File", "% Usage", "_Total", ...)` throws because "_Total" instance doesn't exist when pagefile is disabled.
**Why it happens:** The "Paging File" PDH category is always registered in Windows PDH, even when no pagefile is configured. The category exists in the registry but has no instances.
**How to avoid:** Wrap the counter construction in try/catch and set `_pagAvailable = false` on any exception. Do not rely solely on `PerformanceCounterCategory.Exists()` to guarantee the counter can be created.
**Warning signs:** UnhandledException on launch on no-pagefile systems.

### Pitfall 4: Auto-Collapse Condition Not Updated

**What goes wrong:** Hiding all four rows does not collapse the panel — the auto-collapse still only checks three rows (CpuRow, GpuRow, MemRow).
**Why it happens:** `SetStatRowVisible()` was written for three rows. Adding PagRow to XAML does not automatically update the auto-collapse condition.
**How to avoid:** STAT-13 requirement explicitly requires this fix. The planner must include the `SetStatRowVisible` auto-collapse fix as a task in Plan 11-02.
**Warning signs:** Hiding CPU, GPU, MEM, PAG one by one leaves a visible empty StatsPanel.

### Pitfall 5: ContextMenu_Opened Missing PAG Checkmark

**What goes wrong:** MenuPagVisible.IsChecked is not synced on menu open — it always shows the default state.
**Why it happens:** ContextMenu_Opened currently sets IsChecked for CPU, GPU, MEM rows but has no PAG assignment.
**How to avoid:** Add `MenuPagVisible.IsChecked = (PagRow.Visibility == Visibility.Visible);` to ContextMenu_Opened alongside the existing three-row lines.
**Warning signs:** Checkmark next to "Show PAG" is inconsistent after toggle — it reflects WPF's internal IsCheckable auto-toggle rather than actual row state.

---

## Code Examples

Verified patterns from official sources and existing codebase:

### StatsService: PagPercent Field and Init

```csharp
// Add to StatsService class fields:
private PerformanceCounter? _pagCounter;
private bool _pagAvailable;

// Add to StatsService PagPercent property (after MemPercent):
public float PagPercent { get; private set; } = -1f;  // -1f = unavailable sentinel

// In Initialize(), after _memCounter setup:
_pagAvailable = PerformanceCounterCategory.Exists("Paging File");
if (_pagAvailable)
{
    try
    {
        // 4-param constructor required: Paging File is multi-instance
        _pagCounter = new PerformanceCounter("Paging File", "% Usage", "_Total", readOnly: true);
        // No priming — "% Usage" is a point-in-time ratio counter, not a rate counter
    }
    catch
    {
        _pagAvailable = false;
    }
}
PagPercent = _pagAvailable ? 0f : -1f;
```

### StatsService: Refresh() PAG read

```csharp
// In Refresh(), after MemPercent assignment:
if (_pagAvailable)
{
    try
    {
        PagPercent = _pagCounter?.NextValue() ?? 0f;
    }
    catch
    {
        _pagAvailable = false;
        PagPercent = -1f;
    }
}
```

### StatsService: Dispose() PAG cleanup

```csharp
// In Dispose(), after _memCounter?.Dispose():
_pagCounter?.Dispose();
```

### AppSettings: PagVisible field

```csharp
// After MemVisible line in AppSettings record:
public bool   PagVisible           { get; init; } = true;
```

### MainWindow.xaml.cs: SaveSettings extension

```csharp
// In SaveSettings(), add to AppSettings initializer:
PagVisible = (PagRow.Visibility == Visibility.Visible)
```

### MainWindow.xaml.cs: ApplySettings extension

```csharp
// In ApplySettings(), after MemRow assignment:
PagRow.Visibility = s.PagVisible ? Visibility.Visible : Visibility.Collapsed;
```

### MainWindow.xaml.cs: ContextMenu_Opened extension

```csharp
// In ContextMenu_Opened(), after MenuMemVisible line:
MenuPagVisible.IsChecked = (PagRow.Visibility == Visibility.Visible);
```

### MainWindow.xaml: MenuPagVisible MenuItem

```xml
<!-- In Stats submenu, after MenuMemVisible and before Update Interval submenu: -->
<MenuItem x:Name="MenuPagVisible"
          Header="Show PAG"
          IsCheckable="True"
          Click="MenuPagVisible_Click" />
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| PerformanceCounter positional constructor (no readOnly) | PerformanceCounter with readOnly: true | This codebase from Phase 7 | Prevents accidental writes to system counters |
| AppSettings positional record | AppSettings init-property record | Phase 6 migration | Enables forward-compatible JSON deserialization |
| Checking 3 rows for auto-collapse | Will check 4 rows after Phase 11 | Phase 11 fix | Prevents empty panel staying visible when all 4 rows hidden |

**Deprecated/outdated in this context:**
- The 3-parameter `PerformanceCounter(string, string, bool)` constructor: avoid for multi-instance categories. The project correctly uses `PerformanceCounter(string, string, string, bool)` for instance-scoped counters (see GPU in StatsService.cs line 79).

---

## Open Questions

1. **Is "Paging File" category actually absent or just has no instances on no-pagefile systems?**
   - What we know: Windows always registers the "Paging File" PDH category. When pagefile is disabled via "No paging file" in virtual memory settings, the category exists but has no instances.
   - What's unclear: Whether `PerformanceCounterCategory.Exists("Paging File")` reliably returns `false` or always returns `true`. Based on Windows architecture, it likely always returns `true`, meaning the instance-level try/catch is the actual guard.
   - Recommendation: Implement both guards. Use `PerformanceCounterCategory.Exists("Paging File")` as a first check (mirrors GPU pattern for consistency), then wrap counter construction in try/catch. The try/catch is the essential guard.

2. **Is "_Total" always the right instance name?**
   - What we know: "_Total" is the standard rollup instance for all pagefile aggregate. This is consistent with how CPU uses "_Total" for `Processor Information`. Individual pagefile instances appear as paths like `C:\pagefile.sys`.
   - What's unclear: If a system has multiple pagefiles, do we want aggregate or per-file? Requirements say "% paging file usage" (singular), which maps to "_Total".
   - Recommendation: Use "_Total" — aggregate is the correct semantic for a single widget readout.

3. **Should PagPercent be primed like GPU counters?**
   - What we know: "% Usage" is a `PERF_RAW_FRACTION` counter type — it returns a ratio of two raw values without requiring time-delta calculation. First call returns valid data.
   - What's unclear: Nothing. This is well-established for ratio counters.
   - Recommendation: No priming. The existing comment on the MEM counter ("no priming needed") applies identically to PAG.

---

## Sources

### Primary (HIGH confidence)
- `FuzzyClock.App/StatsService.cs` — existing GPU availability guard pattern with _gpuAvailable flag, try/catch, -1 sentinel; MEM point-in-time counter (no priming)
- `FuzzyClock.App/MainWindow.xaml.cs` — SetStatRowVisible auto-collapse condition (current 3-row check), UpdateStatsDisplay GPU sentinel branch, ApplySettings direct assignment pattern
- `FuzzyClock.App/AppSettings.cs` — init-property bool pattern for CpuVisible/GpuVisible/MemVisible
- `FuzzyClock.App/MainWindow.xaml` — CpuRow/GpuRow/MemRow XAML structure to replicate for PagRow
- https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.performancecounter?view=windowsdesktop-10.0 — PerformanceCounter constructor overloads (4-param for multi-instance); updated 2026-02-11
- https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.performancecountercategory.exists?view=windowsdesktop-10.0 — Exists() return semantics, exceptions; updated 2026-02-11

### Secondary (MEDIUM confidence)
- STATE.md decisions section — confirmed "Paging File"/"% Usage"/"_Total" as the planned counter (v1.4 Roadmap decision at line 96-99); confirmed -1 sentinel pattern intention
- ROADMAP.md Phase 11 plan outlines — confirms two-plan split: 11-01 (data + XAML + settings) autonomous; 11-02 (wiring + auto-collapse fix + human verify)

### Tertiary (LOW confidence)
- Windows PDH counter type classification for "% Usage" as PERF_RAW_FRACTION — from knowledge of Windows PDH architecture; should be validated via `typeperf /q "Paging File"` on target machine during implementation

---

## Metadata

**Confidence breakdown:**
- PDH counter names ("Paging File"/"% Usage"/"_Total"): HIGH — consistent with STATE.md roadmap decisions and multiple Windows performance monitoring docs; confirmed as standard counter names
- No-priming for PAG: HIGH — "% Usage" counter type is a ratio, not a rate; corroborated by existing MEM counter comment in StatsService.cs
- No-pagefile edge case via try/catch: HIGH — derived from existing GPU pattern which handles the analogous "category absent" scenario; PDH category existence vs. instance existence distinction is well-understood
- Architecture patterns (XAML, AppSettings, code-behind): HIGH — directly derived from existing codebase (Phase 10 patterns for CPU/GPU/MEM are identical)
- Auto-collapse 4-row fix: HIGH — explicit in STAT-13 requirement and STATE.md roadmap decision

**Research date:** 2026-02-26
**Valid until:** 2026-03-28 (stable platform — Windows PDH counter names do not change)
