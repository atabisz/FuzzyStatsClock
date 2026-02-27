# Phase 22: Infrastructure and Toggle - Research

**Researched:** 2026-02-27
**Domain:** WPF transparent frameless widget — AppSettings extension, XAML row addition, context menu toggle wiring, settings persistence (C# / .NET 10 / WPF)
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| UPT-02 | User can show or hide the uptime/load line via a right-click Stats submenu toggle; visible by default; persisted to settings.json and restored on launch | AppSettings `bool UptimeVisible { get; init; } = true` pattern confirmed in source; toggle wiring identical to CpuRow/GpuRow/MemRow/PagRow precedents; pre-Show() safety invariant documented with exact code location |
</phase_requirements>

---

## Summary

Phase 22 delivers the full infrastructure for the uptime row: a visible placeholder TextBlock below the stats panel, a right-click Stats submenu toggle, and settings persistence — with the actual uptime/load data deferred to Phase 23. Every pattern required is already established in the codebase with zero novel design decisions. The source files confirm that `AppSettings.cs`, `MainWindow.xaml`, and `MainWindow.xaml.cs` are the only files to modify; `SettingsService.cs` and `StatsService.cs` are untouched.

The XAML layout requires adding a third `RowDefinition Height="Auto"` to the inner two-row `Grid` (lines 100–103 of `MainWindow.xaml`) and placing a `TextBlock x:Name="UptimeText"` at `Grid.Row="2"` as a sibling of `StatsPanel` — not inside it. This is the critical placement decision: nesting it inside `StatsPanel` would tie it to the stats auto-collapse logic and violate the independent toggle requirement of UPT-02. The toggle wiring follows the exact CpuRow/GpuRow/MemRow/PagRow pattern: `SetUptimeRowVisible()` method, `MenuUptimeVisible_Click` handler, `ContextMenu_Opened` sync, and direct `Visibility` assignment in `ApplySettings()`.

Five pitfalls from the milestone research apply directly to this phase: P4 (init default must be `true`, not `false`), P6 (UptimeRow must be a Grid sibling, not inside StatsPanel), P7 (SaveSettings must include the new field), P9 (ApplyTheme must cover UptimeText), P10 (ContextMenu_Opened must sync the new item), P11 (ApplySettings must assign Visibility directly, not via SetUptimeRowVisible), and P12 (SetUptimeRowVisible must call UpdateLayout + re-clamp when showing). All have concrete, one-line mitigations grounded in existing code patterns.

**Primary recommendation:** Follow the four-step build sequence — (1) AppSettings field, (2) XAML row + menu item, (3) ApplySettings/SaveSettings/ContextMenu_Opened/click handler wiring, (4) ApplyTheme extension — each step independently buildable and verifiable.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `System.Text.Json` (in-box) | .NET 10 | AppSettings record serialization/deserialization | Already used by SettingsService; init-property records handled natively |
| WPF `Visibility` enum | .NET 10 WPF | Row show/hide control | Same enum used for all existing row toggles |
| `SolidColorBrush` | .NET 10 WPF | Accent color application in ApplyTheme() | Same brush created at top of existing ApplyTheme() is reused for UptimeText |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `SettingsService.Clamp()` (project) | in-project | Re-clamp window position after height change | Called in SetUptimeRowVisible() when showing the row |
| `DispatcherTimer` | .NET 10 WPF | Stats timer (existing) | No new timer needed; UpdateUptimeDisplay() is called from existing _statsTimer.Tick in Phase 23 |

**No new NuGet packages. No csproj changes. All assemblies already referenced.**

---

## Architecture Patterns

### Files Modified in This Phase

```
FuzzyClock.App/
├── AppSettings.cs          # +1 field: UptimeVisible
├── MainWindow.xaml         # +Row 2 TextBlock + Stats submenu menu item
└── MainWindow.xaml.cs      # +ApplySettings, SaveSettings, ContextMenu_Opened,
                            #  MenuUptimeVisible_Click, SetUptimeRowVisible, ApplyTheme
```

### Pattern 1: AppSettings Init-Property Field Addition

**What:** Add a new `bool` field with `= true` init default to the existing `AppSettings` record.
**When to use:** Every time a new persisted setting is introduced.

```csharp
// Source: FuzzyClock.App/AppSettings.cs (lines 4-21 — existing pattern)
// Add after PagVisible (line 14):
public bool UptimeVisible { get; init; } = true;
// Default true: uptime row visible on first launch AND on upgrade from v2.0
// (v2.0 settings.json has no UptimeVisible field; JSON-absent bool deserializes
//  as the init default, which is true per UPT-02 spec)
```

**Critical:** `= true` not `= false`. All four stat row visibility fields (`CpuVisible`, `GpuVisible`, `MemVisible`, `PagVisible`) default to `true`. Decoration fields (`ShowHourTicks`, `ShowMinuteDots`, `ShowHourNumbers`) default to `false` — that pattern does NOT apply here.

### Pattern 2: XAML Inner Grid Third Row

**What:** Add Row 2 to the inner `Grid` (currently 2-row: phrase row + stats row) and place `UptimeText` TextBlock there as a sibling of `StatsPanel`.
**When to use:** Any new display row below the existing stats panel.

```xml
<!-- Source: FuzzyClock.App/MainWindow.xaml (lines 99-103 — existing 2-row Grid) -->
<!-- Change: add a third RowDefinition -->
<Grid>
    <Grid.RowDefinitions>
        <RowDefinition Height="Auto" />   <!-- Row 0: phrase/dial (existing) -->
        <RowDefinition Height="Auto" />   <!-- Row 1: StatsPanel (existing) -->
        <RowDefinition Height="Auto" />   <!-- Row 2: UptimeRow (NEW) -->
    </Grid.RowDefinitions>

    <!-- Row 0 and Row 1: unchanged -->

    <!-- Row 2: uptime placeholder — data added in Phase 23 -->
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

**Width="180":** Matches StatsPanel width — prevents SizeToContent jitter as text changes in Phase 23.
**Visibility="Visible":** Matches `UptimeVisible = true` init default. `ApplySettings()` overrides this before Show() if settings.json says Collapsed.
**Text="up —":** Placeholder shown during the brief window between Show() and first _statsTimer tick (Phase 23). Prevents empty/blank row.

### Pattern 3: Stats Submenu Menu Item Addition

**What:** Add `MenuUptimeVisible` `IsCheckable` MenuItem to the Stats submenu, after MenuPagVisible and before the Update Interval submenu.
**When to use:** Any new row-visibility toggle in the Stats submenu.

```xml
<!-- Source: FuzzyClock.App/MainWindow.xaml (lines 30-56 — Stats submenu) -->
<!-- Add after MenuPagVisible (line 50), before Update Interval submenu (line 52): -->
<MenuItem x:Name="MenuUptimeVisible"
          Header="Show Uptime"
          IsCheckable="True"
          Click="MenuUptimeVisible_Click" />
```

### Pattern 4: ApplySettings Direct Visibility Assignment (Pre-Show Safety Invariant)

**What:** In `ApplySettings()`, assign `UptimeRow.Visibility` directly — NEVER call `SetUptimeRowVisible()` from here.
**When to use:** Every row visibility field applied from saved settings at startup.

```csharp
// Source: FuzzyClock.App/MainWindow.xaml.cs (lines 124-134 — existing direct pattern)
// Add after PagRow.Visibility assignment (line 134):
UptimeText.Visibility = s.UptimeVisible ? Visibility.Visible : Visibility.Collapsed;
// Do NOT call SetUptimeRowVisible() here — that method calls UpdateLayout()+Clamp()
// which are unsafe before Show() when ActualHeight is 0 (same invariant as all other rows).
```

### Pattern 5: SaveSettings Record Construction Extension

**What:** Add `UptimeVisible` to the inline `AppSettings` record construction in `SaveSettings()`.
**When to use:** Every new AppSettings field requires a matching entry here — the compiler will not warn if it is omitted.

```csharp
// Source: FuzzyClock.App/MainWindow.xaml.cs (lines 170-188 — SaveSettings)
// Add after PagVisible = ... line:
UptimeVisible = (UptimeText.Visibility == Visibility.Visible),
```

### Pattern 6: ContextMenu_Opened IsChecked Sync

**What:** In `ContextMenu_Opened()`, sync `MenuUptimeVisible.IsChecked` from the row's current Visibility.
**When to use:** Every `IsCheckable` menu item must be synced here.

```csharp
// Source: FuzzyClock.App/MainWindow.xaml.cs (lines 295-338 — ContextMenu_Opened)
// Add after MenuPagVisible.IsChecked sync (line 309):
MenuUptimeVisible.IsChecked = (UptimeText.Visibility == Visibility.Visible);
```

**Why this matters:** WPF auto-toggles `IsChecked` on every click for `IsCheckable` items. Without syncing in `Opened`, the checkmark diverges from actual state after one open-close cycle (P10).

### Pattern 7: Click Handler — Read Visibility, Not IsChecked

**What:** The click handler reads `UptimeText.Visibility` to determine the toggle direction — never reads `IsChecked` (which WPF has already toggled).

```csharp
// Source: FuzzyClock.App/MainWindow.xaml.cs — same pattern as MenuCpuVisible_Click (line 347)
private void MenuUptimeVisible_Click(object sender, RoutedEventArgs e)
    => SetUptimeRowVisible(UptimeText.Visibility != Visibility.Visible);
```

### Pattern 8: SetUptimeRowVisible — Re-clamp on Show

**What:** The visibility setter follows `SetStatRowVisible()` exactly: sets Visibility, re-clamp if showing, calls SaveSettings().

```csharp
// Source: FuzzyClock.App/MainWindow.xaml.cs — SetStatRowVisible() (lines 438-469) as template
private void SetUptimeRowVisible(bool visible)
{
    UptimeText.Visibility = visible ? Visibility.Visible : Visibility.Collapsed;

    // Re-clamp on show: UptimeRow adds ~15px height; widget near bottom edge slides off screen.
    // Same pattern as SetStatRowVisible() lines 455-465.
    if (visible && _hasUserPosition)
    {
        UpdateLayout();
        var clamped = SettingsService.Clamp(
            new AppSettings { Left = Left, Top = Top, FontSize = _currentFontSize },
            ActualWidth, ActualHeight);
        Left = clamped.Left;
        Top  = clamped.Top;
    }

    SaveSettings();
}
```

### Pattern 9: ApplyTheme Extension

**What:** Add `UptimeText.Foreground = brush` to `ApplyTheme()` so the accent color applies immediately on launch and on every color change.

```csharp
// Source: FuzzyClock.App/MainWindow.xaml.cs (lines 648-681 — ApplyTheme)
// Add after PagText.Foreground = brush (line 677):
UptimeText.Foreground = brush;
// Reuses the same `brush` variable created at line 650 — no new SolidColorBrush needed.
```

### Anti-Patterns to Avoid

- **UptimeText inside StatsPanel:** Nesting inside the StackPanel means StatsPanel.Visibility=Collapsed hides UptimeText, violating the independent toggle requirement (UPT-02). Place it as a Grid sibling (Row 2), not a StackPanel child.
- **Calling SetUptimeRowVisible() from ApplySettings():** Causes UpdateLayout() before Show() which produces ActualHeight=0 and corrupted position clamping.
- **UptimeVisible defaulting to false:** New users and v2.0 upgraders will never see the uptime row. Default MUST be `true`.
- **Omitting SaveSettings() update:** AppSettings init-property defaults silently replace any omitted field with the default value on every save. There is no compile error; the bug is invisible until user restarts.
- **Omitting ContextMenu_Opened sync:** After one click cycle the checkmark is permanently inverted.
- **Omitting ApplyTheme extension:** UptimeText stays white regardless of accent color. The inconsistency is only visible when a non-white accent is active.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Settings persistence for UptimeVisible | Custom serialization | AppSettings init-property record (existing SettingsService pattern) | System.Text.Json handles init-property records; SettingsService.Save/Load already works for any AppSettings shape |
| Window re-clamping after height change | Custom edge detection | `SettingsService.Clamp()` (existing) | Same method used by SetStatRowVisible, SetStatsVisible, UpdatePhraseIfChanged — tested across all screen configurations |
| Accent color application to new elements | Per-element color logic | Reuse the `brush` variable in `ApplyTheme()` | Single source of truth; recolors all elements atomically on theme change |

**Key insight:** Every problem Phase 22 needs to solve has already been solved in the existing codebase. The task is faithful application of established patterns, not invention.

---

## Common Pitfalls

### Pitfall P4: UptimeVisible Init Default Must Be `true`

**What goes wrong:** Declaring `public bool UptimeVisible { get; init; }` without `= true` defaults to `false` (C# bool default). On first launch and on upgrade from v2.0 (where UptimeVisible is absent from settings.json), the uptime row is hidden and users have no visible path to discover it.
**Why it happens:** The dial decoration fields (`ShowHourTicks`, `ShowMinuteDots`, `ShowHourNumbers`) also use `bool` and default to `false`. A developer copying that pattern applies the wrong default.
**How to avoid:** Declare `public bool UptimeVisible { get; init; } = true`. Check: all four stat row fields (`CpuVisible`, `GpuVisible`, `MemVisible`, `PagVisible`) default to `true` — match that pattern.
**Warning signs:** Uptime row is hidden on fresh install with no settings.json; or upgrading users never see it.

### Pitfall P6: UptimeRow Must Be a Grid Sibling, Not Inside StatsPanel

**What goes wrong:** Placing UptimeText inside the `StatsPanel` StackPanel means hiding StatsPanel also hides UptimeText. The existing auto-collapse check (lines 444-451) checks only the four stat rows — it would incorrectly collapse StatsPanel even while UptimeText is visible.
**Why it happens:** StatsPanel already contains four rows; adding a fifth seems natural.
**How to avoid:** Place UptimeText as `Grid.Row="2"` in the inner Grid (sibling of StatsPanel at Row 1). This is the correct pattern — the requirement is independent toggle control (UPT-02 success criterion 3 explicitly states they must be independently controlled).
**Warning signs:** Hiding StatsPanel also hides UptimeText; or the auto-collapse fires unexpectedly.

### Pitfall P7: SaveSettings Must Include the New Field

**What goes wrong:** Omitting `UptimeVisible = ...` from the `AppSettings` construction in `SaveSettings()` causes the init default (`true`) to be written on every save. The user's "off" choice is lost on every restart.
**Why it happens:** `AppSettings` is a record with init defaults — omission is not a compile error.
**How to avoid:** Update `SaveSettings()` in the same commit as the AppSettings field addition. The pattern: every new field gets three additions simultaneously: AppSettings declaration, ApplySettings read, SaveSettings write.
**Warning signs:** Toggle off, close, reopen — uptime row reappears; settings.json always shows `"UptimeVisible": true`.

### Pitfall P9: ApplyTheme Must Cover UptimeText

**What goes wrong:** UptimeText is added to XAML with `Foreground="White"` but not added to `ApplyTheme()`. When the user sets a non-white accent (Amber, Ice Blue, etc.), the uptime text stays white while all other text uses the accent color.
**Why it happens:** `ApplyTheme()` explicitly lists every element that receives the accent color; new XAML elements are not automatically included.
**How to avoid:** Add `UptimeText.Foreground = brush;` to `ApplyTheme()` in the same task that adds the XAML element.
**Warning signs:** Uptime text is white when Amber preset is active; visible inconsistency with stat bar text.

### Pitfall P10: ContextMenu_Opened Must Sync the New Toggle

**What goes wrong:** `MenuUptimeVisible` is `IsCheckable="True"`. WPF auto-toggles `IsChecked` on every click. Without syncing in `ContextMenu_Opened`, the first click correctly shows/hides the row; the second open shows an inverted checkmark. After one cycle, the checkmark is permanently wrong.
**Why it happens:** The `ContextMenu_Opened` pattern is documented but must be applied to every new `IsCheckable` item.
**How to avoid:** Add `MenuUptimeVisible.IsChecked = (UptimeText.Visibility == Visibility.Visible);` to `ContextMenu_Opened()`.
**Warning signs:** Checkmark in uptime menu item inverts after first toggle; two clicks required to re-enable.

### Pitfall P11: Pre-Show() Safety Invariant

**What goes wrong:** Calling `SetUptimeRowVisible()` from `ApplySettings()` triggers `UpdateLayout()` before `Show()`. At that point `ActualHeight == 0`, causing `SettingsService.Clamp()` to return a nonsense top position.
**Why it happens:** `SetUptimeRowVisible()` is the natural "one code path" for changing visibility. The pre-Show exclusion is an established but easily overlooked invariant.
**How to avoid:** In `ApplySettings()`, assign `UptimeText.Visibility` directly (same as all other row visibility assignments at lines 131-134). The comment on line 124-125 of `MainWindow.xaml.cs` documents this exact invariant.
**Warning signs:** Widget position jumps to wrong location on startup; `Top` set to a large negative value.

### Pitfall P12: SetUptimeRowVisible Must Re-Clamp on Show

**What goes wrong:** Showing UptimeText increases window height by ~15px. If the widget is positioned near the bottom screen edge, the extra height pushes it off-screen.
**Why it happens:** `SizeToContent="WidthAndHeight"` automatically resizes the window when content changes, but the position is not automatically adjusted.
**How to avoid:** In `SetUptimeRowVisible(true)`, call `UpdateLayout()` then `SettingsService.Clamp()` — same pattern as `SetStatRowVisible()` lines 455-465.
**Warning signs:** Widget bottom edge extends off screen after enabling uptime row when near bottom of display.

---

## Code Examples

Verified patterns from the actual source files:

### Complete SetUptimeRowVisible() — verified against SetStatRowVisible() (MainWindow.xaml.cs lines 438-469)

```csharp
private void MenuUptimeVisible_Click(object sender, RoutedEventArgs e)
    => SetUptimeRowVisible(UptimeText.Visibility != Visibility.Visible);

private void SetUptimeRowVisible(bool visible)
{
    UptimeText.Visibility = visible ? Visibility.Visible : Visibility.Collapsed;

    if (visible && _hasUserPosition)
    {
        UpdateLayout();
        var clamped = SettingsService.Clamp(
            new AppSettings { Left = Left, Top = Top, FontSize = _currentFontSize },
            ActualWidth, ActualHeight);
        Left = clamped.Left;
        Top  = clamped.Top;
    }

    SaveSettings();
}
```

### ApplySettings addition — verified against existing row assignments (lines 131-134)

```csharp
// Add after PagRow.Visibility = s.PagVisible ? Visibility.Visible : Visibility.Collapsed; (line 134):
UptimeText.Visibility = s.UptimeVisible ? Visibility.Visible : Visibility.Collapsed;
```

### SaveSettings addition — verified against existing record construction (lines 170-188)

```csharp
// Add after PagVisible = (PagRow.Visibility == Visibility.Visible), (line 179):
UptimeVisible = (UptimeText.Visibility == Visibility.Visible),
```

### ContextMenu_Opened addition — verified against existing sync pattern (lines 306-309)

```csharp
// Add after MenuPagVisible.IsChecked = (PagRow.Visibility == Visibility.Visible); (line 309):
MenuUptimeVisible.IsChecked = (UptimeText.Visibility == Visibility.Visible);
```

### ApplyTheme addition — verified against existing Foreground assignments (lines 671-677)

```csharp
// Add after PagText.Foreground = brush; (line 677):
UptimeText.Foreground = brush;
```

---

## Source File Findings (Exact Locations)

Direct source inspection of the actual files confirmed all architecture research claims. Key verified facts:

| Claim | Source Location | Status |
|-------|----------------|--------|
| Inner Grid has 2 rows (Row 0 + Row 1) | `MainWindow.xaml` lines 100-103 | CONFIRMED — adding Row 2 is the correct action |
| StatsPanel is a StackPanel at Grid.Row="1" | `MainWindow.xaml` lines 158-162 | CONFIRMED — UptimeText must be outside this StackPanel |
| Stats submenu: MenuPagVisible is last row toggle before Update Interval | `MainWindow.xaml` lines 49-56 | CONFIRMED — new MenuUptimeVisible goes after line 50 |
| `ApplySettings()` uses direct Visibility assignment for all rows | `MainWindow.xaml.cs` lines 124-134 | CONFIRMED — no indirect method calls |
| `SaveSettings()` uses inline AppSettings record construction | `MainWindow.xaml.cs` lines 170-188 | CONFIRMED — add UptimeVisible to this construction |
| `ContextMenu_Opened()` syncs IsChecked from Visibility | `MainWindow.xaml.cs` lines 306-309 | CONFIRMED — same pattern for new item |
| `ApplyTheme()` uses single `brush` variable for all accent elements | `MainWindow.xaml.cs` lines 650-677 | CONFIRMED — reuse existing brush |
| `SetStatRowVisible()` calls UpdateLayout+Clamp only on show | `MainWindow.xaml.cs` lines 455-465 | CONFIRMED — same guard for SetUptimeRowVisible |
| `_statsIntervalSeconds` field exists (needed in Phase 23) | `MainWindow.xaml.cs` line 17 | CONFIRMED — `private int _statsIntervalSeconds = 3` |
| Hover fast-refresh: no `_isHoverFastRefresh` flag exists yet | `MainWindow.xaml.cs` lines 406-435 | CONFIRMED — Phase 23 must add this flag |
| `StatsService._initialized`: no public `IsReady` property exists | `MainWindow.xaml.cs` / `StatsService.cs` not modified here | NOTE — Phase 23 responsibility only |
| `AppSettings.cs` has 15 fields, all init-property pattern | `AppSettings.cs` lines 6-20 | CONFIRMED — `UptimeVisible` is the 16th field |

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| MVVM with bindings for toggle state | Direct Visibility assignment + ContextMenu_Opened sync | Simpler, no binding plumbing, pre-Show safety invariant naturally respected |
| INotifyPropertyChanged for settings | Init-property record + explicit SaveSettings() | Zero boilerplate, compile-safe field names, JSON round-trips correctly |

**No deprecated patterns in scope for this phase.** All patterns in use are current project decisions.

---

## Open Questions

1. **`_isHoverFastRefresh` flag needed for Phase 23**
   - What we know: The hover fast-refresh code (lines 406-435) does not set a flag distinguishing hover-rate ticks from configured-rate ticks. Phase 23's rolling average buffer must skip buffer pushes during hover ticks (P3).
   - What's unclear: Whether to add the flag in Phase 22 as infrastructure (for clean Phase 23 entry) or defer it entirely to Phase 23.
   - Recommendation: Defer to Phase 23 — Phase 22 has no rolling buffer and no need for the flag. Phase 23 adds the flag when it adds the buffer push guard.

2. **`StatsService.IsReady` property needed for Phase 23**
   - What we know: Phase 23's cold-start guard (P1) requires `if (!_statsService.IsReady) return` before buffer pushes. `StatsService._initialized` is private.
   - What's unclear: Should Phase 22 add the `IsReady` property to StatsService as preparatory work?
   - Recommendation: Defer to Phase 23 — Phase 22 does not reference StatsService at all. Adding `IsReady` is a Phase 23 Wave 0 task.

---

## Sources

### Primary (HIGH confidence)

- `C:/src/FuzzyStatsClock/FuzzyClock.App/MainWindow.xaml.cs` — direct source reading, 2026-02-27; all line numbers verified
- `C:/src/FuzzyStatsClock/FuzzyClock.App/MainWindow.xaml` — direct source reading, 2026-02-27; inner Grid structure and Stats submenu layout confirmed
- `C:/src/FuzzyStatsClock/FuzzyClock.App/AppSettings.cs` — direct source reading, 2026-02-27; 15-field init-property record confirmed
- `.planning/research/SUMMARY.md` — milestone-level research, HIGH confidence, read 2026-02-27
- `.planning/research/ARCHITECTURE.md` — full architecture spec including XAML samples and build order, HIGH confidence
- `.planning/research/PITFALLS.md` — 12 pitfalls with code examples, all grounded in source reading; P4/P6/P7/P9/P10/P11/P12 directly relevant

### Secondary (MEDIUM confidence)

- `.planning/STATE.md` — architectural constraints section (v2.1 decisions), consistent with source file inspection

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — confirmed from actual source files; no new dependencies
- Architecture patterns: HIGH — every pattern extracted directly from source lines with line numbers
- Pitfalls: HIGH — all grounded in source code reading, not heuristics; line-number evidence provided

**Research date:** 2026-02-27
**Valid until:** 2026-03-28 (stable codebase; 30-day horizon)
