# Phase 10: Individual Stat Row Visibility - Research

**Researched:** 2026-02-26
**Domain:** WPF context menu toggles, per-row Visibility control, AppSettings persistence
**Confidence:** HIGH

## Summary

Phase 10 is a purely additive extension of Phase 9's established patterns. There are no new
libraries, no new architectural concepts, and no new risks. The work is mechanical: add three
new `bool` fields to `AppSettings`, add three new `MenuItem` entries to the Stats submenu in
XAML, wire three click handlers and three `ContextMenu_Opened` checkmark syncs in
`MainWindow.xaml.cs`, and implement auto-collapse logic when all three rows are hidden.

The codebase already contains every primitive this phase needs. `AppSettings` is an
init-property record so adding three new `bool` fields with `default true` gives forward and
backward compatibility for free — old `settings.json` files (without the new fields) will
deserialize using the `true` defaults. The three stat rows (`CpuRow`, `GpuRow`, `MemRow`)
are currently anonymous `<Grid>` elements inside `StatsPanel`; they need `x:Name` attributes
added so the code-behind can reference their `Visibility` property.

The only design decision that requires careful attention is the auto-collapse direction:
hiding the last visible row calls `SetStatsVisible(false)`, but re-showing a row does NOT
auto-show the panel — the user must toggle "Show Stats" manually. This asymmetry is locked in
design (see STATE.md) and mirrors the independence principle stated in REQUIREMENTS.md.

**Primary recommendation:** Follow the Phase 9 click-handler pattern exactly. Read `Visibility`
(not `IsChecked`) to determine toggle direction. Set row `Visibility` directly in `ApplySettings()`
(not via a helper method) to avoid the pre-`Show()` `UpdateLayout()` trap.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| STAT-06 | User can toggle CPU row visibility via right-click Stats submenu; checkmark reflects current state each time menu opens | Add `MenuCpuVisible` MenuItem (IsCheckable) + click handler reading `CpuRow.Visibility` + `ContextMenu_Opened` checkmark sync |
| STAT-07 | User can toggle GPU row visibility via right-click Stats submenu; checkmark reflects current state each time menu opens | Add `MenuGpuVisible` MenuItem (IsCheckable) + click handler reading `GpuRow.Visibility` + `ContextMenu_Opened` checkmark sync |
| STAT-08 | User can toggle MEM row visibility via right-click Stats submenu; checkmark reflects current state each time menu opens | Add `MenuMemVisible` MenuItem (IsCheckable) + click handler reading `MemRow.Visibility` + `ContextMenu_Opened` checkmark sync |
| STAT-09 | Hiding all three stats individually auto-collapses the stats panel (equivalent to turning Show Stats off) | After setting any row to Collapsed: if all three rows are Collapsed AND StatsPanel is Visible, call `SetStatsVisible(false)` |
| STAT-10 | Individual stat visibility (CPU/GPU/MEM) persists to settings.json and restores on launch | Add `CpuVisible`, `GpuVisible`, `MemVisible bool` (default `true`) to `AppSettings`; extend `SaveSettings()` and `ApplySettings()` |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| WPF (System.Windows) | .NET 10 (in-box) | `Visibility` enum, `MenuItem`, `ContextMenu`, `StackPanel` | Already in use; no new dependencies |
| System.Text.Json | .NET 10 (in-box) | Serialize/deserialize `AppSettings` with new bool fields | Already in use; init-property pattern handles missing fields |

### Supporting

None needed. This phase adds no new dependencies.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Separate named `<Grid x:Name="CpuRow">` | Visibility binding via MVVM | Overkill for a single-window app with no ViewModel; current direct code-behind pattern is correct |
| Reading `IsChecked` in click handlers | Reading `Visibility` | `IsChecked` unreliable — WPF auto-toggles before handler fires (established in Phase 9 decision) |

**Installation:** No new packages required.

## Architecture Patterns

### Recommended Project Structure

No structural changes. All changes are within existing files:
```
FuzzyClock.App/
├── AppSettings.cs         # Add CpuVisible, GpuVisible, MemVisible bool fields
├── MainWindow.xaml        # Add x:Name to three stat rows; add three MenuItems in Stats submenu
├── MainWindow.xaml.cs     # Add click handlers, ContextMenu_Opened syncs, ApplySettings rows, SaveSettings rows
└── SettingsService.cs     # No changes needed (Defaults() may need CpuVisible/GpuVisible/MemVisible = true)
```

### Pattern 1: Init-Property Record Field Addition (AppSettings)

**What:** Add three new `bool` fields with `init` accessor and default `true`. System.Text.Json
deserializes missing fields using the property's default value — no migration guard needed
(unlike `StatsIntervalSeconds` which needed a `<= 0` guard because 0 is a valid-looking but
dangerous value; `false` for row visibility is unambiguously wrong as a default).

**When to use:** Every time a new persistent preference is added to the app.

**Example (from Phase 6 pattern, adapted for Phase 10):**
```csharp
// AppSettings.cs — add after StatsIntervalSeconds
public bool CpuVisible { get; init; } = true;
public bool GpuVisible { get; init; } = true;
public bool MemVisible { get; init; } = true;
```

Old `settings.json` (no these fields) deserializes successfully; JSON writes all fields going
forward. No `with {}` guard needed in `Load()` — `false` is never a dangerous default here
unlike the zero-interval timer case.

### Pattern 2: Named Row Elements in XAML

**What:** Add `x:Name` to the three `<Grid>` elements that wrap each stat row inside `StatsPanel`.
The rows are currently anonymous; they need names so `MainWindow.xaml.cs` can set
`CpuRow.Visibility`, `GpuRow.Visibility`, `MemRow.Visibility`.

**When to use:** Any time code-behind needs to reference a XAML element by name.

**Example:**
```xml
<!-- CPU row — was: <Grid Margin="0,2,0,0"> -->
<Grid x:Name="CpuRow" Margin="0,2,0,0">
    ...
</Grid>

<!-- GPU row -->
<Grid x:Name="GpuRow" Margin="0,2,0,0">
    ...
</Grid>

<!-- MEM row -->
<Grid x:Name="MemRow" Margin="0,2,0,0">
    ...
</Grid>
```

### Pattern 3: Stats Submenu MenuItem Addition

**What:** Add three `IsCheckable` `MenuItem` entries to the Stats submenu, after the existing
separator (or after `MenuShowStats`). Based on current XAML structure the Stats submenu has:
`MenuShowStats`, then `Update Interval` submenu. The new row-visibility items live in the Stats
submenu directly (same level as `MenuShowStats`).

**When to use:** Established pattern from Phase 8 (Stats submenu structure) and Phase 9 (Show Stats
wiring).

**Example:**
```xml
<MenuItem Header="Stats">
    <MenuItem x:Name="MenuShowStats"
              Header="Show Stats"
              IsCheckable="True"
              Click="MenuShowStats_Click" />
    <Separator />
    <MenuItem x:Name="MenuCpuVisible"
              Header="Show CPU"
              IsCheckable="True"
              Click="MenuCpuVisible_Click" />
    <MenuItem x:Name="MenuGpuVisible"
              Header="Show GPU"
              IsCheckable="True"
              Click="MenuGpuVisible_Click" />
    <MenuItem x:Name="MenuMemVisible"
              Header="Show MEM"
              IsCheckable="True"
              Click="MenuMemVisible_Click" />
    <MenuItem Header="Update Interval">
        ...
    </MenuItem>
</MenuItem>
```

### Pattern 4: Click Handler — Read Visibility, Not IsChecked

**What:** Click handlers read the current `Visibility` of the row element to determine toggle
direction, then call a `SetStatRowVisible()` helper (or inline the logic). This mirrors the
Phase 9 `MenuShowStats_Click` pattern exactly.

**When to use:** Every `IsCheckable` MenuItem click handler in this codebase.

**Example:**
```csharp
private void MenuCpuVisible_Click(object sender, RoutedEventArgs e)
    => SetStatRowVisible(CpuRow, ref _cpuVisible, CpuRow.Visibility != Visibility.Visible);
```

Or inline without a field ref (reading Visibility directly is sufficient; a backing bool field
is only needed if `SaveSettings()` needs it for the AppSettings record).

### Pattern 5: ContextMenu_Opened Checkmark Sync

**What:** Add three checkmark lines to the existing `ContextMenu_Opened` handler.

**Example:**
```csharp
// In ContextMenu_Opened — add after MenuShowStats line:
MenuCpuVisible.IsChecked = (CpuRow.Visibility == Visibility.Visible);
MenuGpuVisible.IsChecked = (GpuRow.Visibility == Visibility.Visible);
MenuMemVisible.IsChecked = (MemRow.Visibility == Visibility.Visible);
```

### Pattern 6: Auto-Collapse When All Rows Hidden (STAT-09)

**What:** After hiding any row, check if all three rows are `Collapsed` AND `StatsPanel` is
`Visible`. If so, call `SetStatsVisible(false)`. This is a one-way trigger — re-showing a
row does NOT auto-show the panel.

**Example:**
```csharp
private void SetStatRowVisible(Grid row, bool visible)
{
    row.Visibility = visible ? Visibility.Visible : Visibility.Collapsed;

    // Auto-collapse: if all rows are now hidden and the panel is still visible,
    // collapse the entire panel. Inverse not implemented — user toggles Show Stats manually.
    if (!visible
        && CpuRow.Visibility == Visibility.Collapsed
        && GpuRow.Visibility == Visibility.Collapsed
        && MemRow.Visibility == Visibility.Collapsed
        && StatsPanel.Visibility == Visibility.Visible)
    {
        SetStatsVisible(false);
    }

    SaveSettings();
}
```

### Pattern 7: ApplySettings() Row Visibility (Direct Set, Not Helper)

**What:** In `ApplySettings()`, set each row's `Visibility` directly — do NOT call
`SetStatRowVisible()` because that may trigger `UpdateLayout()` or `Clamp()` which are unsafe
before `Show()`. This is the same invariant as `StatsPanel.Visibility` in Phase 9.

**Example:**
```csharp
// In ApplySettings() — add after StatsPanel.Visibility line:
CpuRow.Visibility = s.CpuVisible ? Visibility.Visible : Visibility.Collapsed;
GpuRow.Visibility = s.GpuVisible ? Visibility.Visible : Visibility.Collapsed;
MemRow.Visibility = s.MemVisible ? Visibility.Visible : Visibility.Collapsed;
```

### Pattern 8: SaveSettings() Extension

**What:** Extend the `AppSettings` object literal in `SaveSettings()` with three new fields.
The `with {}` expression pattern from the existing `Load()` guard is available but not needed
here — just add to the `new AppSettings { ... }` initializer.

**Example:**
```csharp
internal void SaveSettings()
{
    SettingsService.Save(new AppSettings
    {
        Left = Left,
        Top = Top,
        FontSize = _currentFontSize,
        StatsVisible = (StatsPanel.Visibility == Visibility.Visible),
        StatsIntervalSeconds = _statsIntervalSeconds,
        CpuVisible = (CpuRow.Visibility == Visibility.Visible),
        GpuVisible = (GpuRow.Visibility == Visibility.Visible),
        MemVisible = (MemRow.Visibility == Visibility.Visible)
    });
}
```

### Anti-Patterns to Avoid

- **Reading `IsChecked` in click handlers:** WPF auto-toggles `IsChecked` before the handler
  fires on `IsCheckable` MenuItems. Always read element `Visibility` instead (Phase 9 decision).
- **Calling `SetStatRowVisible()` from `ApplySettings()`:** May trigger `UpdateLayout()` +
  `Clamp()` which are unsafe before `Show()`. Set `Visibility` directly, as done for
  `StatsPanel.Visibility` in Phase 9.
- **Auto-showing panel when a row is re-enabled:** The design locks this out. Rows retain
  individual visibility state independent of the panel. Only the user can re-show the panel
  via "Show Stats".
- **Setting row Visibility to `Hidden` instead of `Collapsed`:** `Hidden` preserves layout
  space. `Collapsed` removes it. The StatsPanel is a `StackPanel` — `Collapsed` is required
  so hidden rows don't leave blank vertical gaps.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON forward/backward compat for new bool fields | Custom migration logic | Init-property record with `= true` default | System.Text.Json handles missing fields via property default; already proven in Phase 6 |
| Checkmark sync | Two-way binding or event subscriptions | Single `ContextMenu_Opened` handler sets `IsChecked` | Established pattern — simpler, no binding infrastructure needed |
| Row hide/show animation | Custom storyboard/animation | Direct `Visibility` assignment | No animations in this app; consistent with StatsPanel behavior |

**Key insight:** Every mechanism this phase needs already exists in the codebase. The task
is pattern-matching and extension, not design.

## Common Pitfalls

### Pitfall 1: Forgetting to Name the Row Grid Elements

**What goes wrong:** `CpuRow`, `GpuRow`, `MemRow` don't exist as named elements. The
three `<Grid>` elements inside `StatsPanel` are currently anonymous. Code-behind cannot
reference them by name.

**Why it happens:** Rows were added in Phase 8 with no need for code-behind access at that time.

**How to avoid:** First edit in XAML — add `x:Name="CpuRow"`, `x:Name="GpuRow"`,
`x:Name="MemRow"` to the three row `<Grid>` elements before writing any C# code.

**Warning signs:** Build error `The name 'CpuRow' does not exist in the current context`.

### Pitfall 2: Auto-Collapse Triggering Incorrectly

**What goes wrong:** `SetStatRowVisible()` is called from `ApplySettings()` during startup.
If `ApplySettings()` restores all three rows to `Collapsed` (because user hid all three AND
`StatsVisible=false`), the auto-collapse check fires and calls `SetStatsVisible(false)` again
unnecessarily, which calls `UpdateLayout()` and `Clamp()` before `Show()`.

**Why it happens:** The auto-collapse check in `SetStatRowVisible()` doesn't distinguish
startup vs. runtime.

**How to avoid:** Do NOT call `SetStatRowVisible()` from `ApplySettings()`. Set `Visibility`
directly. This is already the established pattern for `StatsPanel` (see STATE.md Phase 09-01
decision).

### Pitfall 3: SettingsService.Defaults() Missing New Fields

**What goes wrong:** `Defaults()` in `SettingsService.cs` returns an `AppSettings` with only
the original five fields. When `Load()` falls into the `catch` block or `File.Exists` is false,
the defaults object is returned — `CpuVisible`, `GpuVisible`, `MemVisible` will use their
property-level defaults (`true`) anyway because they're init-property fields, but the `Defaults()`
method object literal may look incomplete.

**Why it happens:** The `Defaults()` method pre-dates these fields.

**How to avoid:** Either update `Defaults()` to explicitly set the new fields (for clarity), or
confirm the implicit property defaults suffice. Since `default = true` is correct behavior,
both approaches work. For consistency with the existing explicit style, update `Defaults()`.

### Pitfall 4: Separator Placement in Stats Submenu

**What goes wrong:** Three new menu items added without a visual separator between "Show Stats"
and the row toggles, making the menu hard to read.

**Why it happens:** Forgetting to add a `<Separator />` between the panel-level toggle and the
row-level toggles.

**How to avoid:** Add `<Separator />` after `MenuShowStats` and before the three row items.

### Pitfall 5: Collapsed vs. Hidden for Rows

**What goes wrong:** Using `Visibility.Hidden` instead of `Visibility.Collapsed` for rows.
`Hidden` preserves layout space — the row is invisible but occupies vertical space in the
`StackPanel`, leaving a gap.

**Why it happens:** Confusion between `Hidden` (invisible, keeps space) and `Collapsed`
(invisible, removes space).

**How to avoid:** Always use `Visibility.Collapsed` for stats rows, matching the `StatsPanel`
pattern.

## Code Examples

Verified patterns from the existing codebase (source: `C:/src/gsd1/FuzzyClock.App/`):

### Current AppSettings record (Phase 6 pattern to extend)
```csharp
// AppSettings.cs — current state
public record AppSettings
{
    public double Left                 { get; init; } = -1;
    public double Top                  { get; init; } = 20;
    public int    FontSize             { get; init; } = 32;
    public bool   StatsVisible         { get; init; } = false;
    public int    StatsIntervalSeconds { get; init; } = 3;
}
// Phase 10 adds: CpuVisible, GpuVisible, MemVisible { get; init; } = true
```

### Current ContextMenu_Opened (Phase 9 pattern to extend)
```csharp
// MainWindow.xaml.cs — current state
private void ContextMenu_Opened(object sender, RoutedEventArgs e)
{
    FontSmall.IsChecked  = (_currentFontSize == 16);
    FontMedium.IsChecked = (_currentFontSize == 24);
    FontLarge.IsChecked  = (_currentFontSize == 32);

    MenuShowStats.IsChecked  = (StatsPanel.Visibility == Visibility.Visible);
    MenuInterval1.IsChecked  = (_statsIntervalSeconds == 1);
    MenuInterval3.IsChecked  = (_statsIntervalSeconds == 3);
    MenuInterval10.IsChecked = (_statsIntervalSeconds == 10);
    // Phase 10 adds three lines here
}
```

### Current MenuShowStats_Click (Phase 9 pattern to replicate per-row)
```csharp
private void MenuShowStats_Click(object sender, RoutedEventArgs e)
    => SetStatsVisible(StatsPanel.Visibility != Visibility.Visible);
// Phase 10: same pattern per row — read Visibility (not IsChecked) to toggle
```

### Current SaveSettings() (Phase 9 pattern to extend)
```csharp
internal void SaveSettings()
{
    SettingsService.Save(new AppSettings
    {
        Left = Left,
        Top = Top,
        FontSize = _currentFontSize,
        StatsVisible = (StatsPanel.Visibility == Visibility.Visible),
        StatsIntervalSeconds = _statsIntervalSeconds
        // Phase 10 adds: CpuVisible, GpuVisible, MemVisible
    });
}
```

### Current ApplySettings() row-skip pattern (Phase 9 safety invariant)
```csharp
// In ApplySettings() — StatsPanel set directly (NOT via SetStatsVisible)
StatsPanel.Visibility = s.StatsVisible ? Visibility.Visible : Visibility.Collapsed;
// Phase 10: same for CpuRow, GpuRow, MemRow
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Positional record `AppSettings(...)` | Init-property record with defaults | Phase 6 | New bool fields added with `= true` default; old JSON forward-compat for free |
| No stats panel | `StatsPanel` StackPanel with three anonymous row Grids | Phase 8 | Phase 10 adds `x:Name` to rows for code-behind access |
| No per-row toggles | Three new `IsCheckable` MenuItems in Stats submenu | Phase 10 (this phase) | User gains per-row control |

**Deprecated/outdated:**
- Nothing deprecated. All established patterns remain valid.

## Open Questions

1. **Should row-visibility click handlers be one-liners or go through a `SetStatRowVisible()` helper?**
   - What we know: `SetStatsVisible(bool)` is a helper that handles timer start/stop and re-clamp. Row visibility changes don't affect the timer or window size (the StackPanel reflows silently).
   - What's unclear: Whether re-clamping is needed when a row is hidden/shown (StatsPanel height changes slightly when rows toggle).
   - Recommendation: Implement `SetStatRowVisible(Grid row, bool visible)` helper that sets `Visibility`, checks auto-collapse, and calls `SaveSettings()`. Re-clamp on show (same pattern as `SetStatsVisible(true)`): showing a row increases `StatsPanel` height, which could push the widget off-screen if positioned near the bottom edge. Guard with `_hasUserPosition` check as in `SetStatsVisible`.

2. **Does `SettingsService.Defaults()` need explicit new fields?**
   - What we know: The init-property defaults on the record handle missing-field deserialization automatically. `Defaults()` is only called when the file doesn't exist or is corrupt.
   - What's unclear: Whether the explicit style in `Defaults()` should be continued for clarity.
   - Recommendation: Update `Defaults()` to explicitly include `CpuVisible = true, GpuVisible = true, MemVisible = true` for consistency with the existing explicit style of that method.

## Sources

### Primary (HIGH confidence)

- `C:/src/gsd1/FuzzyClock.App/AppSettings.cs` — current record structure confirmed
- `C:/src/gsd1/FuzzyClock.App/MainWindow.xaml` — current XAML structure confirmed (anonymous row Grids, Stats submenu items)
- `C:/src/gsd1/FuzzyClock.App/MainWindow.xaml.cs` — current handler patterns, `ContextMenu_Opened`, `SaveSettings()`, `ApplySettings()`, `SetStatsVisible()` confirmed
- `C:/src/gsd1/FuzzyClock.App/SettingsService.cs` — `Load()`, `Save()`, `Defaults()` confirmed
- `C:/src/gsd1/.planning/STATE.md` — locked design decisions confirmed (read Visibility not IsChecked; direct set in ApplySettings; auto-collapse direction; no auto-show on row re-enable)
- `C:/src/gsd1/.planning/REQUIREMENTS.md` — STAT-06 through STAT-10 confirmed

### Secondary (MEDIUM confidence)

None needed — all findings are from direct codebase inspection (HIGH confidence).

### Tertiary (LOW confidence)

None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; existing WPF + System.Text.Json patterns confirmed from source
- Architecture: HIGH — all patterns directly derived from existing Phase 9 code; no speculation
- Pitfalls: HIGH — pitfalls derived from documented STATE.md decisions and direct code inspection

**Research date:** 2026-02-26
**Valid until:** Stable — no external dependencies; valid until codebase changes
