# Phase 9: Controls, Persistence, and Edge Cases - Research

**Researched:** 2026-02-26
**Domain:** WPF ContextMenu wiring, DispatcherTimer lifecycle, settings persistence round-trip, SizeToContent re-clamp
**Confidence:** HIGH

## Summary

Phase 9 completes the v1.2 stats feature by wiring the already-scaffolded UI controls to actual behavior. The XAML and data layer are fully in place from Phases 6-8: `StatsPanel` exists (Visibility=Collapsed), all menu items are named (`MenuShowStats`, `MenuInterval1/3/10`), `_statsTimer` is created but stopped, `AppSettings` already has `StatsVisible` and `StatsIntervalSeconds` fields with correct defaults and zero-interval guard. The only missing work is: connecting Click handlers to those menu items, extending `ContextMenu_Opened` to sync their checkmarks, extending `SaveSettings()` to write the two stats fields, extending `ApplySettings()` to apply `StatsVisible` to panel visibility, and implementing `SetStatsVisible()` / `SetStatsInterval()` helpers.

The critical edge case is window re-clamping: `SizeToContent=WidthAndHeight` means showing the stats panel adds ~70px height. If the widget is near the bottom edge when stats are shown, the window can grow partially off-screen. The established pattern from Phases 3, 4, and 5 is: `UpdateLayout()` then `SettingsService.Clamp()` then assign `Left`/`Top`. This same pattern must be applied inside `SetStatsVisible(true)`.

The timer lifecycle rule is already documented in the roadmap: stats timer stops when panel is hidden, starts when shown. The `_statsTimer?.Stop()` / `_statsTimer?.Start()` calls belong inside `SetStatsVisible()`. Changing the interval requires: stop the timer, update `_statsTimer.Interval`, restart the timer (if currently running / stats are visible).

**Primary recommendation:** Implement Phase 9 as a single plan with three logical task groups: (1) wire Click handlers + ContextMenu_Opened sync, (2) fix SaveSettings/ApplySettings for the two stats fields, (3) implement SetStatsVisible with re-clamp and SetStatsInterval with timer restart.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| STAT-03 | Update interval (1s / 3s / 10s) is user-selectable via right-click Stats submenu | Click handlers for MenuInterval1/3/10 must call SetStatsInterval(); ContextMenu_Opened must set IsChecked on the active interval item; _statsTimer.Interval must be updated live |
| STAT-04 | Stats panel visibility (show/hide) is user-toggleable via right-click Stats submenu | Click handler for MenuShowStats must call SetStatsVisible(); ContextMenu_Opened must set MenuShowStats.IsChecked = (_statsPanel is Visible); SetStatsVisible must start/stop _statsTimer and re-clamp position after showing |
| STAT-05 | Stats visibility and update interval persist to settings.json and restore on launch | SaveSettings() must include StatsVisible and StatsIntervalSeconds in the AppSettings record; ApplySettings() must apply s.StatsVisible to StatsPanel.Visibility and call SetStatsVisible(s.StatsVisible) |
</phase_requirements>

## Standard Stack

This phase uses no new libraries. All required infrastructure is already in place.

### Core (already present — no new installs)
| Component | Version | Purpose | Status |
|-----------|---------|---------|--------|
| WPF DispatcherTimer | .NET 10 in-box | Timer on UI thread, safe to update UI from Tick | Already in ContentRendered |
| System.Text.Json | .NET 10 in-box | Serialize/deserialize AppSettings to settings.json | Already used in SettingsService |
| AppSettings record | Project | Holds StatsVisible + StatsIntervalSeconds | Already has both fields with defaults |
| SettingsService | Project | Load/Save/Clamp | Already has zero-interval guard, atomic save |

**Installation:** None required. No new NuGet packages.

## Architecture Patterns

### Existing Pattern: ContextMenu_Opened as Single Sync Point (HIGH confidence)

Established in Phase 5 for Font Size. The rule: click handlers do NOT set `IsChecked` — only `ContextMenu_Opened` sets it. This prevents the WPF double-toggle bug where `IsCheckable=True` auto-flips `IsChecked` and then the handler flips it back.

```csharp
// Source: Phase 5 decision — [Phase 05-01] in STATE.md Accumulated Context
// Pattern already in MainWindow.xaml.cs lines 186-191
private void ContextMenu_Opened(object sender, RoutedEventArgs e)
{
    // EXISTING — do not remove
    FontSmall.IsChecked  = (_currentFontSize == 16);
    FontMedium.IsChecked = (_currentFontSize == 24);
    FontLarge.IsChecked  = (_currentFontSize == 32);

    // ADD in Phase 9:
    MenuShowStats.IsChecked  = (StatsPanel.Visibility == Visibility.Visible);
    MenuInterval1.IsChecked  = (_statsIntervalSeconds == 1);
    MenuInterval3.IsChecked  = (_statsIntervalSeconds == 3);
    MenuInterval10.IsChecked = (_statsIntervalSeconds == 10);
}
```

**Why this is the correct pattern:** `IsCheckable=True` in XAML makes WPF auto-toggle `IsChecked` on click. If the handler also sets it, it gets double-toggled and returns to its original state. Phase 5 discovered this; the fix is: click handlers call action methods only, `ContextMenu_Opened` owns all checkmark state.

### Existing Pattern: UpdateLayout() Before Clamp() (HIGH confidence)

Established in Phases 3, 4, 5. Required because `SizeToContent=WidthAndHeight` means `ActualWidth`/`ActualHeight` are stale until a layout pass runs. Showing the stats panel adds approximately 70px height (3 rows × ~20px + margins).

```csharp
// Source: decisions [Phase 04-02] and [Phase 05-01] in STATE.md
// Pattern used in UpdatePhraseIfChanged() and ApplyFontSize()
private void SetStatsVisible(bool visible)
{
    StatsPanel.Visibility = visible ? Visibility.Visible : Visibility.Collapsed;

    if (visible)
    {
        _statsTimer?.Start();
        UpdateStatsDisplay();          // immediate refresh — no blank panel flash

        // Re-clamp: showing the panel grows the window height.
        // ActualHeight is stale until layout runs.
        UpdateLayout();
        if (_hasUserPosition)
        {
            var clamped = SettingsService.Clamp(
                new AppSettings { Left = Left, Top = Top, FontSize = _currentFontSize },
                ActualWidth, ActualHeight);
            Left = clamped.Left;
            Top  = clamped.Top;
        }
    }
    else
    {
        _statsTimer?.Stop();
    }

    SaveSettings();
}
```

**Why UpdateLayout() is required here:** Without it, `ActualHeight` reflects the pre-show height. `Clamp()` receives the wrong height and may fail to push the window up enough.

**Why UpdateStatsDisplay() on show:** Without an immediate call, the stats panel briefly displays "0%" values from construction-time defaults until the first timer tick (up to 10s at the 10s interval). Calling it synchronously on show gives immediate data.

**Note on _statsService initialization timing:** `StatsService.Initialize()` runs on a background thread and takes ~6s (PDH cold start). `Refresh()` is a safe no-op until `_initialized=true`. So `UpdateStatsDisplay()` on first show may display 0% values briefly — this is acceptable and consistent with the existing design.

### Pattern: SetStatsInterval() with Live Timer Update (HIGH confidence)

When the user changes the interval while stats are visible, the timer must be stopped, its `Interval` property updated, and restarted. A `DispatcherTimer` that is running has its `Interval` read at the next tick; updating it on a running timer does update the interval but requires a stop/start to take effect immediately (avoids a long wait before the new interval kicks in if the old interval was longer).

```csharp
// Source: WPF DispatcherTimer documented behavior — Interval property is read each tick
private void SetStatsInterval(int seconds)
{
    _statsIntervalSeconds = seconds;

    bool wasRunning = _statsTimer?.IsEnabled ?? false;
    _statsTimer?.Stop();
    if (_statsTimer != null)
        _statsTimer.Interval = TimeSpan.FromSeconds(seconds);
    if (wasRunning)
        _statsTimer?.Start();

    SaveSettings();
}
```

**Why stop/start:** `DispatcherTimer.Interval` is read at each tick. If the timer is running at 10s and the user switches to 1s, the timer continues at 10s until the current interval expires, then switches. Stop+Start makes the new interval effective immediately.

### Pattern: SaveSettings() Extension for Stats Fields (HIGH confidence)

`SaveSettings()` currently (line 96) passes only `Left`, `Top`, `FontSize`. It must be extended to include `StatsVisible` and `StatsIntervalSeconds`. The record uses `with` expression.

```csharp
// Source: AppSettings.cs — init-property record, all five fields
// Current (line 96):
internal void SaveSettings()
{
    SettingsService.Save(new AppSettings { Left = Left, Top = Top, FontSize = _currentFontSize });
}

// Phase 9 replacement:
internal void SaveSettings()
{
    SettingsService.Save(new AppSettings
    {
        Left = Left,
        Top = Top,
        FontSize = _currentFontSize,
        StatsVisible = (StatsPanel.Visibility == Visibility.Visible),
        StatsIntervalSeconds = _statsIntervalSeconds
    });
}
```

**Why StatsPanel.Visibility is the source of truth for StatsVisible:** Rather than maintaining a separate `_statsVisible` bool field, the XAML panel's actual Visibility reflects the live state. This avoids field/UI desync.

### Pattern: ApplySettings() Extension for Stats Fields (HIGH confidence)

`ApplySettings()` currently (line 86) reads `_statsIntervalSeconds = s.StatsIntervalSeconds` but does NOT apply `s.StatsVisible`. Phase 9 must add this. However, calling `SetStatsVisible()` from `ApplySettings()` is unsafe — `ApplySettings()` is called before `Show()`, before the window is rendered, so `UpdateLayout()` and `ActualHeight` are meaningless. The safe path:

```csharp
// Source: [Phase 04-02] decision — ApplySettings called before Show()
// ApplySettings() is called before Show(), so ActualWidth/ActualHeight = 0.
// Do NOT call SetStatsVisible() here — it calls UpdateLayout() + Clamp() unsafely.
// Instead: just set Visibility directly and set the timer interval.
// _statsTimer does not exist yet (created in ContentRendered), so no Start() needed.

internal void ApplySettings(AppSettings s)
{
    // ... existing font + position code ...
    _statsIntervalSeconds = s.StatsIntervalSeconds;

    // Apply stats visibility directly (NOT via SetStatsVisible — that needs layout pass).
    // _statsTimer is null here (ContentRendered hasn't run). Timer start happens in
    // ContentRendered if we check the panel state after initialization.
    StatsPanel.Visibility = s.StatsVisible ? Visibility.Visible : Visibility.Collapsed;
}
```

Then in `ContentRendered`, after `_statsTimer` is created and `_statsTimer.Interval` is set, check if the panel is already visible and start the timer:

```csharp
// In ContentRendered — AFTER the existing _statsTimer setup:
if (StatsPanel.Visibility == Visibility.Visible)
{
    _statsTimer.Start();
    UpdateStatsDisplay();
}
```

**Why this split is necessary:** `ApplySettings()` runs before the window is shown (before ContentRendered fires). `_statsTimer` is created in ContentRendered. If settings say `StatsVisible=true`, we need the timer started, but only after it's been constructed. The split (set Visibility in ApplySettings, start timer in ContentRendered if visible) is the only safe ordering.

### Anti-Patterns to Avoid

- **Setting IsChecked in Click handlers:** WPF `IsCheckable=True` auto-toggles; handler + auto-toggle = double-flip. Only set IsChecked in `ContextMenu_Opened`.
- **Calling SetStatsVisible() from ApplySettings():** ApplySettings runs before Show(). `UpdateLayout()` does nothing; `ActualHeight` is 0. Use direct Visibility assignment in ApplySettings + deferred timer start in ContentRendered.
- **Updating _statsTimer.Interval without Stop/Start:** The new interval won't apply until after the current interval expires. Use Stop + set + Start.
- **Calling UpdateStatsDisplay() when StatsPanel is Collapsed:** The bar track `ActualWidth` is 0 when the panel is Collapsed. Phase 8 uses `StatsBarTrackWidth=109.0` constant precisely to avoid this (no ActualWidth dependency), so this is safe. But it's still wasteful and confusing to call it while hidden — always guard with visibility check.
- **Reading StatsPanel.Visibility outside UI thread:** All Visibility reads/writes must be on the UI thread. `DispatcherTimer.Tick` fires on the UI thread, so no marshaling is needed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic settings file write | Custom file locking | `SettingsService.Save()` (already uses temp+Move) | Already implemented with atomic temp-file pattern |
| Timer interval change | Thread-safe timer replacement | `_statsTimer.Stop(); Interval = ...; Start()` | DispatcherTimer is UI-thread-only; no locking needed |
| Window bounds enforcement | Custom monitor geometry | `SettingsService.Clamp()` (already uses VirtualScreen*) | Already handles multi-monitor negative offsets |
| JSON serialization | Custom parser | `System.Text.Json` via SettingsService | Already handles partial deserialization of old JSON |

**Key insight:** All infrastructure is already built. Phase 9 is exclusively wiring — no new services, no new persistence logic, no new UI elements.

## Common Pitfalls

### Pitfall 1: ContextMenu IsCheckable Double-Toggle
**What goes wrong:** Click handler calls `MenuShowStats.IsChecked = !MenuShowStats.IsChecked` — but WPF already toggled it on click. Net result: no change.
**Why it happens:** `IsCheckable=True` makes WPF auto-flip `IsChecked` before the Click handler fires.
**How to avoid:** Click handlers call `SetStatsVisible(!currentState)` based on a field or direct Visibility check, never by reading/writing `IsChecked`. Only `ContextMenu_Opened` reads/writes `IsChecked`.
**Warning signs:** Checkmark appears correct at first click but doesn't change on subsequent clicks.

### Pitfall 2: Stats Panel Showing Pushes Widget Off Bottom Edge
**What goes wrong:** Widget is positioned near the bottom of the screen. User enables stats. Window grows ~70px downward, partially off-screen.
**Why it happens:** `SizeToContent=WidthAndHeight` — showing StatsPanel triggers an automatic resize. If `Left`/`Top` aren't re-clamped, the window exceeds virtual screen bounds.
**How to avoid:** Call `UpdateLayout()` then `SettingsService.Clamp()` inside `SetStatsVisible(true)`.
**Warning signs:** Stats panel shows but bottom rows are cut off; window partially under taskbar.

### Pitfall 3: Timer Running While Stats Hidden (Background PDH Reads)
**What goes wrong:** `_statsTimer` keeps firing even when `StatsPanel.Visibility=Collapsed`. PDH counters are read unnecessarily — wastes CPU on a widget designed to run for days.
**Why it happens:** Timer is started and never stopped.
**How to avoid:** `_statsTimer?.Stop()` inside `SetStatsVisible(false)`, `_statsTimer?.Start()` inside `SetStatsVisible(true)`.
**Warning signs:** CPU usage > 0% when stats panel is hidden (visible via Task Manager).

### Pitfall 4: SaveSettings Not Including Stats Fields
**What goes wrong:** App exits with stats visible at 1s interval. On relaunch, stats are hidden with 3s interval.
**Why it happens:** `SaveSettings()` constructs `new AppSettings { Left = Left, Top = Top, FontSize = _currentFontSize }` — missing `StatsVisible` and `StatsIntervalSeconds`. C# record init properties default to their declared defaults (false and 3), silently overwriting what was loaded.
**How to avoid:** Extend `SaveSettings()` to pass all five fields.
**Warning signs:** Settings round-trip test fails; visible stats not restored on relaunch.

### Pitfall 5: ApplySettings Calling SetStatsVisible Too Early
**What goes wrong:** `SetStatsVisible()` calls `UpdateLayout()` and `SettingsService.Clamp()` before the window is shown. `ActualWidth`/`ActualHeight` are 0. Clamp returns wrong values. Widget snaps to top-left corner.
**Why it happens:** `ApplySettings()` is called in `App.xaml.cs` before `mainWindow.Show()`.
**How to avoid:** In `ApplySettings()`, set `StatsPanel.Visibility` directly. In `ContentRendered`, after `_statsTimer` is constructed, check if panel is visible and start timer if so.
**Warning signs:** Widget appears at (0,0) or random position on launch when StatsVisible=true was saved.

### Pitfall 6: Timer Interval Not Applied Immediately After Change
**What goes wrong:** User switches from 10s to 1s. Stats don't update for another 10 seconds (current interval completes).
**Why it happens:** `DispatcherTimer.Interval` was updated on a running timer. The change takes effect on the NEXT tick.
**How to avoid:** Stop timer, set Interval, restart timer.
**Warning signs:** After switching to a shorter interval, user must wait the full old interval before seeing the new rate.

### Pitfall 7: OnClosing Disposal Order
**What goes wrong:** `SaveSettings()` called before `_statsService?.Dispose()` — this is NOT an issue since `SaveSettings()` doesn't use `_statsService`. But `_statsTimer?.Stop()` must come before `_statsService?.Dispose()` to prevent a Tick firing and calling `_statsService.Refresh()` after Dispose.
**Why it happens:** Wrong order in OnClosing.
**How to avoid:** Order is already correct in Phase 8 code: `_statsTimer?.Stop()` → `_statsService?.Dispose()` → `SaveSettings()`. Do not change this order.
**Warning signs:** ObjectDisposedException from PerformanceCounter during app shutdown.

## Code Examples

### Complete SetStatsVisible() Implementation
```csharp
// Source: derived from established patterns in MainWindow.xaml.cs
// Combines: Phase 5 ApplyFontSize() re-clamp pattern + timer lifecycle rule from v1.2 roadmap
private void SetStatsVisible(bool visible)
{
    StatsPanel.Visibility = visible ? Visibility.Visible : Visibility.Collapsed;

    if (visible)
    {
        _statsTimer?.Start();
        UpdateStatsDisplay();  // immediate display — no blank panel flash on first show

        // Re-clamp: showing StatsPanel increases window height by ~70px.
        // SizeToContent=WidthAndHeight: ActualHeight is stale until layout runs.
        UpdateLayout();
        if (_hasUserPosition)
        {
            var clamped = SettingsService.Clamp(
                new AppSettings { Left = Left, Top = Top, FontSize = _currentFontSize },
                ActualWidth, ActualHeight);
            Left = clamped.Left;
            Top  = clamped.Top;
        }
    }
    else
    {
        _statsTimer?.Stop();
    }

    SaveSettings();
}
```

### Complete SetStatsInterval() Implementation
```csharp
// Source: DispatcherTimer documented behavior — Interval read per tick
private void SetStatsInterval(int seconds)
{
    _statsIntervalSeconds = seconds;

    bool wasRunning = _statsTimer?.IsEnabled ?? false;
    _statsTimer?.Stop();
    if (_statsTimer != null)
        _statsTimer.Interval = TimeSpan.FromSeconds(seconds);
    if (wasRunning)
        _statsTimer?.Start();

    SaveSettings();
}
```

### Extended ContextMenu_Opened
```csharp
// Source: extends existing ContextMenu_Opened at line 186 of MainWindow.xaml.cs
private void ContextMenu_Opened(object sender, RoutedEventArgs e)
{
    // Existing font size checkmarks — DO NOT REMOVE
    FontSmall.IsChecked  = (_currentFontSize == 16);
    FontMedium.IsChecked = (_currentFontSize == 24);
    FontLarge.IsChecked  = (_currentFontSize == 32);

    // Stats checkmarks — added in Phase 9
    MenuShowStats.IsChecked  = (StatsPanel.Visibility == Visibility.Visible);
    MenuInterval1.IsChecked  = (_statsIntervalSeconds == 1);
    MenuInterval3.IsChecked  = (_statsIntervalSeconds == 3);
    MenuInterval10.IsChecked = (_statsIntervalSeconds == 10);
}
```

### Click Handlers for Stats Menu Items
```csharp
// Source: consistent with FontSmall_Click / FontMedium_Click pattern
private void MenuShowStats_Click(object sender, RoutedEventArgs e)
    => SetStatsVisible(StatsPanel.Visibility != Visibility.Visible);

private void MenuInterval1_Click(object sender, RoutedEventArgs e)  => SetStatsInterval(1);
private void MenuInterval3_Click(object sender, RoutedEventArgs e)  => SetStatsInterval(3);
private void MenuInterval10_Click(object sender, RoutedEventArgs e) => SetStatsInterval(10);
```

**Note on MenuShowStats_Click toggle logic:** The handler reads current panel Visibility (not `MenuShowStats.IsChecked`) to determine the toggle direction. At the time Click fires, WPF's `IsCheckable` auto-toggle has already flipped `IsChecked`, making it unreliable as a state source. The Visibility check is authoritative.

### Extended SaveSettings()
```csharp
// Source: extends existing SaveSettings() at line 94 of MainWindow.xaml.cs
internal void SaveSettings()
{
    SettingsService.Save(new AppSettings
    {
        Left = Left,
        Top = Top,
        FontSize = _currentFontSize,
        StatsVisible = (StatsPanel.Visibility == Visibility.Visible),
        StatsIntervalSeconds = _statsIntervalSeconds
    });
}
```

### Extended ApplySettings() (stats portion only)
```csharp
// Source: safe pre-Show() application — does NOT call SetStatsVisible()
// Add at end of existing ApplySettings(), replacing the current comment at line 87
_statsIntervalSeconds = s.StatsIntervalSeconds;
StatsPanel.Visibility = s.StatsVisible ? Visibility.Visible : Visibility.Collapsed;
// Note: _statsTimer is null here (created in ContentRendered).
// ContentRendered checks panel visibility and starts timer if needed.
```

### ContentRendered Extension (conditional timer start)
```csharp
// Source: add to ContentRendered handler AFTER the existing _statsTimer wiring
// Place after: _statsTimer.Tick += (_, _) => UpdateStatsDisplay();
if (StatsPanel.Visibility == Visibility.Visible)
{
    _statsTimer.Start();
    UpdateStatsDisplay();
}
```

### XAML Click Handler Wiring (MainWindow.xaml additions)
```xml
<!-- Add Click= attributes to the already-named menu items in MainWindow.xaml -->
<MenuItem x:Name="MenuShowStats"
          Header="Show Stats"
          IsCheckable="True"
          Click="MenuShowStats_Click" />
<MenuItem x:Name="MenuInterval1"  Header="1 second"   IsCheckable="True" Click="MenuInterval1_Click" />
<MenuItem x:Name="MenuInterval3"  Header="3 seconds"  IsCheckable="True" Click="MenuInterval3_Click" />
<MenuItem x:Name="MenuInterval10" Header="10 seconds" IsCheckable="True" Click="MenuInterval10_Click" />
```

## State of the Art

| Phase | What was added | What Phase 9 completes |
|-------|----------------|------------------------|
| Phase 6 | AppSettings fields: StatsVisible, StatsIntervalSeconds | SaveSettings must write them; ApplySettings must fully apply them |
| Phase 7 | StatsService (PDH counters, Refresh(), Dispose()) | Nothing — fully complete |
| Phase 8 | StatsPanel XAML, _statsTimer (stopped), named menu items, UpdateStatsDisplay() | Click handlers, ContextMenu_Opened sync, timer start/stop lifecycle |

**Not yet wired (Phase 8 explicitly deferred to Phase 9):**
- `MenuShowStats.Click` — no handler
- `MenuInterval1/3/10.Click` — no handlers
- `ContextMenu_Opened` — no stats checkmarks
- `SaveSettings()` — does not write StatsVisible or StatsIntervalSeconds
- `ApplySettings()` — reads `_statsIntervalSeconds` but does not apply StatsVisible to Visibility
- `ContentRendered` — does not start _statsTimer even if StatsVisible=true in loaded settings

## Open Questions

1. **Toggle direction for MenuShowStats_Click**
   - What we know: WPF auto-toggles `IsChecked` on click before the handler fires; reading `IsChecked` inside the handler sees the POST-toggle value
   - What's unclear: Should the handler read `IsChecked` (which shows the new desired state) or Visibility (which shows the old state)?
   - Recommendation: Read `StatsPanel.Visibility != Visibility.Visible` (old state) to determine whether to call `SetStatsVisible(true)` or `SetStatsVisible(false)`. This is consistent with the Font Size pattern where handlers call `ApplyFontSize(N)` with a fixed value rather than toggling. Alternatively, since `IsChecked` is in the post-toggle state, `SetStatsVisible(MenuShowStats.IsChecked)` also works — both are valid. Recommend Visibility-based approach for consistency with established patterns.

2. **_hasUserPosition guard in SetStatsVisible()**
   - What we know: `PositionTopRight()` is used when `!_hasUserPosition`; Clamp is used when `_hasUserPosition=true`
   - What's unclear: Should SetStatsVisible() call `PositionTopRight()` when `!_hasUserPosition`, or only Clamp when `_hasUserPosition`?
   - Recommendation: Mirror the `ApplyFontSize()` pattern exactly (lines 204-213): only re-clamp when `_hasUserPosition=true`. When no user position exists, `PositionTopRight()` was already called at ContentRendered and will naturally keep the widget in bounds (top-right edge, panel grows downward). Only edge positions (near bottom) are at risk, and those require a user drag first (`_hasUserPosition=true`).

## Sources

### Primary (HIGH confidence)
- Codebase direct read: `FuzzyClock.App/MainWindow.xaml.cs` — lines 186-191 (ContextMenu_Opened pattern), 197-214 (ApplyFontSize re-clamp pattern), 216-223 (OnClosing disposal order)
- Codebase direct read: `FuzzyClock.App/AppSettings.cs` — all five init-property fields confirmed
- Codebase direct read: `FuzzyClock.App/SettingsService.cs` — Save/Load/Clamp implementation confirmed
- Codebase direct read: `FuzzyClock.App/MainWindow.xaml` — XAML structure confirmed (named menu items, StatsPanel Collapsed, all x:Name elements)
- `.planning/STATE.md` Accumulated Context — all key decisions from Phases 4, 5, 6, 8 confirmed

### Secondary (MEDIUM confidence)
- `.planning/phases/08-xaml-layout-and-stats-display/08-01-PLAN.md` — established task structure and done criteria patterns

### Tertiary (LOW confidence)
- None — all claims are supported by direct codebase inspection.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; all infrastructure confirmed via direct code read
- Architecture patterns: HIGH — all patterns derived from existing code in the same file (SetStatsVisible follows ApplyFontSize exactly; ContextMenu_Opened extension follows established sync pattern)
- Pitfalls: HIGH — all pitfalls are grounded in existing decisions in STATE.md or directly observable in current code gaps

**Research date:** 2026-02-26
**Valid until:** This is a closed codebase with a small number of files. Research is valid until files are modified. Since Phase 9 IS the modification, research is valid until Phase 9 begins.
