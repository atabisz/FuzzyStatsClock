# Phase 8: XAML Layout and Stats Display - Research

**Researched:** 2026-02-25
**Domain:** WPF XAML layout (Grid, StackPanel, nested Borders), DispatcherTimer, transparent overlay constraints
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| STAT-01 | Stats panel shows CPU, GPU, and memory usage below the time phrase (visual display component) | Grid Row 1 StackPanel layout with named x:Name elements; StatsService.Refresh() feeds UpdateStatsDisplay() |
| STAT-02 | Each stat displays as a horizontal bar + percentage text | Two-nested-Border bar track/fill pattern with fixed-width MinWidth on % TextBlock; bar fill Width bound to percent value via code-behind math |
</phase_requirements>

---

## Summary

Phase 8 is a pure WPF XAML + code-behind wiring phase. All data infrastructure (StatsService, AppSettings fields) is complete from Phases 6 and 7. The work is: (1) restructure MainWindow.xaml to use Grid RowDefinitions, (2) build a StatsPanel StackPanel with three labeled bar rows, (3) add a Stats submenu to the ContextMenu (structure only, no wiring), and (4) add a `_statsTimer` DispatcherTimer in MainWindow.xaml.cs that calls `UpdateStatsDisplay()` every `AppSettings.StatsIntervalSeconds` seconds.

The most critical design constraint is `AllowsTransparency=True` on the Window, which prevents DropShadowEffect and requires flat SolidColorBrush-only fills. The existing codebase uses a manual shadow TextBlock offset pattern for the phrase text — the stats panel must follow the same flat-brush constraint. The second most critical constraint is that `SizeToContent="WidthAndHeight"` is set on the Window, which means the window resizes to fit content. A fixed `Width="180"` on the StatsPanel StackPanel container prevents percentage text length changes (e.g., "9%" vs "100%") from causing window-width jitter.

The existing MainWindow.xaml has a two-layer structure: an outer Grid (hit-test surface, ContextMenu host) wrapping a Border (visual container) wrapping an inner Grid (phrase TextBlocks). Phase 8 converts the inner Grid to a two-row outer Grid, placing the existing Border in Row 0 and adding a new StatsPanel StackPanel in Row 1. No structural changes are needed to the phrase display, App.xaml.cs, or SettingsService.

**Primary recommendation:** Replace the inner Grid containing the phrase TextBlocks with a Grid that has two RowDefinitions (Auto + Auto). Row 0 = existing Border with phrase TextBlocks unchanged. Row 1 = StatsPanel StackPanel (Width=180, Visibility=Collapsed, Margin="0,4,0,0"). Wire _statsTimer in ContentRendered alongside _timer.

---

## Standard Stack

### Core

| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| WPF (WindowsBase, PresentationCore, PresentationFramework) | .NET 10 (in-box) | All XAML layout and rendering | Already in use; no additional packages needed |
| DispatcherTimer | .NET 10 (in-box) | Stats refresh timer on UI thread | Already used for phrase timer; same pattern for stats timer |
| StatsService | Phase 7 output | Provides CpuPercent, GpuPercent, MemPercent as floats 0-100 (GpuPercent=-1f means unavailable) | Already built and validated |
| AppSettings | Phase 6 output | StatsVisible (bool), StatsIntervalSeconds (int) — both already wired in settings.json | Already built |

### Supporting

| Component | Version | Purpose | When to Use |
|-----------|---------|---------|-------------|
| Grid.RowDefinitions | WPF | Vertical stacking of phrase row + stats row | Use Auto height for both rows so window height grows/shrinks with content |
| StackPanel | WPF | Vertical stack of three stat rows (CPU, GPU, MEM) | Simpler than nested Grid for uniform single-column rows |
| Nested Border (track + fill) | WPF | Bar visualization | Avoids ProgressBar ControlTemplate override; flat brush only |
| MinWidth on % TextBlock | WPF | Prevents width jitter from 1-3 digit numbers | Set MinWidth="30" to accommodate "100%" without layout shift |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Nested Border bars | ProgressBar | ProgressBar requires ControlTemplate override under AllowsTransparency; Border is simpler and works flat |
| Fixed Width=180 StatsPanel | Dynamic width | Dynamic width causes window to resize as % text changes from "9%" to "100%"; fixed width prevents this |
| Separate DispatcherTimer for stats | Reuse phrase timer | Phrase timer is hardcoded 10s; stats interval is user-configurable (1s/3s/10s); must be independent |
| Visibility.Collapsed default | Visibility.Hidden | Collapsed takes no layout space; Hidden keeps space reserved; Collapsed is correct here |

**Installation:** No additional packages needed. All stack is in-box .NET 10 WPF.

---

## Architecture Patterns

### Recommended Project Structure (changes only)

```
FuzzyClock.App/
├── MainWindow.xaml       # Add Grid RowDefinitions + StatsPanel StackPanel + Stats ContextMenu item
├── MainWindow.xaml.cs    # Add _statsService field, _statsTimer, UpdateStatsDisplay(), InstantiateStatsTimer()
├── StatsService.cs       # No changes (Phase 7 complete)
├── AppSettings.cs        # No changes (Phase 6 complete)
└── SettingsService.cs    # No changes (Phase 6 complete)
```

### Pattern 1: Grid Row Split (Phrase Row + Stats Row)

**What:** Convert the inner Grid (currently holds phrase TextBlocks) into a two-row Grid. Row 0 holds the existing Border+Grid+phrase-TextBlocks unchanged. Row 1 holds the new StatsPanel.

**When to use:** Any time you need to stack two vertically independent visual regions in a SizeToContent window.

**Example:**
```xml
<!-- BEFORE (current MainWindow.xaml inner structure) -->
<Grid Background="#01000000" MouseLeftButtonDown="Grid_MouseLeftButtonDown">
    <Grid.ContextMenu>...</Grid.ContextMenu>
    <Border Background="#26000000" CornerRadius="5" Padding="6">
        <Grid>
            <TextBlock x:Name="ShadowText" ... />
            <TextBlock x:Name="PhraseText" ... />
        </Grid>
    </Border>
</Grid>

<!-- AFTER (Phase 8 target structure) -->
<Grid Background="#01000000" MouseLeftButtonDown="Grid_MouseLeftButtonDown">
    <Grid.ContextMenu>
        <ContextMenu Opened="ContextMenu_Opened">
            <MenuItem Header="Font Size">
                <MenuItem x:Name="FontSmall"  Header="Small (16pt)"  IsCheckable="True" Click="FontSmall_Click" />
                <MenuItem x:Name="FontMedium" Header="Medium (24pt)" IsCheckable="True" Click="FontMedium_Click" />
                <MenuItem x:Name="FontLarge"  Header="Large (32pt)"  IsCheckable="True" Click="FontLarge_Click" />
            </MenuItem>
            <MenuItem Header="Stats">
                <MenuItem x:Name="MenuShowStats"    Header="Show Stats"     IsCheckable="True" />
                <MenuItem Header="Update Interval">
                    <MenuItem x:Name="MenuInterval1"  Header="1 second"  IsCheckable="True" />
                    <MenuItem x:Name="MenuInterval3"  Header="3 seconds" IsCheckable="True" />
                    <MenuItem x:Name="MenuInterval10" Header="10 seconds" IsCheckable="True" />
                </MenuItem>
            </MenuItem>
            <MenuItem Header="Close" Click="CloseMenuItem_Click" />
        </ContextMenu>
    </Grid.ContextMenu>

    <Grid>
        <Grid.RowDefinitions>
            <RowDefinition Height="Auto" />
            <RowDefinition Height="Auto" />
        </Grid.RowDefinitions>

        <!-- Row 0: existing phrase display — UNCHANGED -->
        <Border Grid.Row="0" Background="#26000000" CornerRadius="5" Padding="6">
            <Grid>
                <TextBlock x:Name="ShadowText" ... />
                <TextBlock x:Name="PhraseText" ... />
            </Grid>
        </Border>

        <!-- Row 1: stats panel — default Collapsed -->
        <StackPanel x:Name="StatsPanel"
                    Grid.Row="1"
                    Width="180"
                    Margin="0,4,0,0"
                    Visibility="Collapsed">
            <!-- three stat rows here -->
        </StackPanel>
    </Grid>
</Grid>
```

**Critical note:** The outer Grid (hit-test surface, ContextMenu host) must remain the direct child of the Window. The new two-row Grid is a child of the outer Grid, not a replacement for it. This preserves the hit-test surface (`Background="#01000000"`) and ContextMenu attachment.

### Pattern 2: Stat Row with Label + Bar Track/Fill + Percentage Text

**What:** Each stat row is a horizontal DockPanel (or Grid) containing a label TextBlock, a track Border with a fill Border inside, and a fixed-MinWidth percentage TextBlock.

**When to use:** Any time you need a custom progress bar in an AllowsTransparency window where ProgressBar ControlTemplate override is not viable.

**Example:**
```xml
<!-- Single stat row — repeat for CPU, GPU, MEM -->
<Grid Margin="0,2,0,0">
    <Grid.ColumnDefinitions>
        <ColumnDefinition Width="35" />   <!-- label: "CPU " -->
        <ColumnDefinition Width="*" />    <!-- bar track fills remaining space -->
        <ColumnDefinition Width="36" />   <!-- % text: right-aligned, MinWidth covers "100%" -->
    </Grid.ColumnDefinitions>

    <TextBlock Grid.Column="0"
               Text="CPU"
               Foreground="White"
               FontFamily="Segoe UI Light"
               FontSize="12"
               VerticalAlignment="Center" />

    <!-- Bar track (background) -->
    <Border Grid.Column="1"
            Background="#40FFFFFF"
            CornerRadius="2"
            Height="8"
            VerticalAlignment="Center">
        <!-- Bar fill (foreground) — Width set in code-behind as fraction of track ActualWidth -->
        <Border x:Name="CpuBar"
                HorizontalAlignment="Left"
                Background="White"
                CornerRadius="2"
                Height="8"
                Width="0" />
    </Border>

    <TextBlock x:Name="CpuText"
               Grid.Column="2"
               Text="0%"
               Foreground="White"
               FontFamily="Segoe UI Light"
               FontSize="12"
               TextAlignment="Right"
               VerticalAlignment="Center" />
</Grid>
```

**Naming convention:** Use `x:Name="CpuBar"`, `x:Name="GpuBar"`, `x:Name="MemBar"` for fill Borders; `x:Name="CpuText"`, `x:Name="GpuText"`, `x:Name="MemText"` for percentage TextBlocks.

**GPU N/A handling:** When GpuPercent == -1f, set GpuText.Text = "N/A" and GpuBar.Width = 0.

### Pattern 3: Bar Width Calculation

**What:** Bar fill Width is calculated as `(percent / 100.0) * trackActualWidth`. The track's ActualWidth is only valid after layout — must use the track Border's ActualWidth at update time.

**When to use:** Every call to UpdateStatsDisplay().

**Example:**
```csharp
// Code-behind UpdateStatsDisplay()
private void UpdateStatsDisplay()
{
    _statsService.Refresh();

    // CPU
    CpuText.Text = $"{_statsService.CpuPercent:F0}%";
    CpuBar.Width = CpuBarTrack.ActualWidth * (_statsService.CpuPercent / 100.0);

    // GPU
    if (_statsService.GpuPercent < 0)
    {
        GpuText.Text = "N/A";
        GpuBar.Width = 0;
    }
    else
    {
        GpuText.Text = $"{_statsService.GpuPercent:F0}%";
        GpuBar.Width = GpuBarTrack.ActualWidth * (_statsService.GpuPercent / 100.0);
    }

    // MEM
    MemText.Text = $"{_statsService.MemPercent:F0}%";
    MemBar.Width = MemBarTrack.ActualWidth * (_statsService.MemPercent / 100.0);
}
```

**Note:** `x:Name` for the track Borders must be `CpuBarTrack`, `GpuBarTrack`, `MemBarTrack` so code-behind can read `ActualWidth`. Alternatively, since the track Column is Width="*" and StatsPanel is fixed Width=180, the track actual width is deterministic (180 - 35 - 36 = 109px approximately), but reading `ActualWidth` at call time is more robust.

### Pattern 4: Stats DispatcherTimer Initialization

**What:** Create `_statsTimer` in ContentRendered alongside the existing `_timer`, using `AppSettings.StatsIntervalSeconds` as the interval. Default is Collapsed so timer starts stopped until Phase 9 wires the show/hide toggle.

**When to use:** Wire in ContentRendered, same as phrase timer.

**Example:**
```csharp
// In ContentRendered handler (ContentRendered += (_, _) => { ... })
// After existing phrase timer setup:

_statsService = new StatsService();   // or passed in from App.xaml.cs

_statsTimer = new DispatcherTimer
{
    Interval = TimeSpan.FromSeconds(_statsIntervalSeconds)
};
_statsTimer.Tick += (_, _) => UpdateStatsDisplay();
// Do NOT start _statsTimer here — StatsPanel is Collapsed by default.
// Phase 9 starts it via SetStatsVisible(true) when user enables stats.
// Exception: if AppSettings.StatsVisible was true (loaded), start it here.
// Phase 8 default: StatsVisible=false, so timer starts stopped.
```

**Field additions required in MainWindow.xaml.cs:**
```csharp
private DispatcherTimer _statsTimer = null!;
private StatsService _statsService = null!;
private int _statsIntervalSeconds;   // from AppSettings
```

**ApplySettings() update:** Add:
```csharp
_statsIntervalSeconds = s.StatsIntervalSeconds;
// StatsVisible wiring deferred to Phase 9
```

### Anti-Patterns to Avoid

- **Moving ContextMenu to inner Grid:** The ContextMenu must stay on the outermost hit-test Grid. If moved to an inner Grid with Width=180, right-clicks outside the 180px width area lose the context menu.
- **Using ProgressBar for bars:** ProgressBar has an Aero-themed ControlTemplate that is broken under `AllowsTransparency=True`. The nested-Border pattern is the correct approach for this window type.
- **Binding bar Width in XAML with a Converter:** Tempting but complex; requires a MultiValueConverter taking both percent and track ActualWidth. Code-behind calculation in UpdateStatsDisplay() is simpler and already follows the project pattern.
- **Starting _statsTimer unconditionally:** Stats timer must start only when StatsPanel is visible. Starting it while Collapsed wastes PDH reads. For Phase 8, leave it stopped since StatsVisible defaults to false.
- **Using ActualWidth before layout:** Bar width calculation in ContentRendered fires before StatsPanel is visible, so ActualWidth of track Borders may be 0 if StatsPanel is Collapsed. Only calculate bar widths inside UpdateStatsDisplay(), which is called by the timer tick — by that time layout has run.
- **Setting Visibility on StatsPanel in ApplySettings():** ApplySettings() is called before Show() when ActualWidth is 0. Phase 8 hardcodes Visibility=Collapsed in XAML. Phase 9 will handle ApplySettings() wiring for StatsVisible.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Progress-style bar visualization | Custom Canvas-based drawing | Nested Border (track + fill) | Simple, flat, works with AllowsTransparency; Canvas adds unnecessary complexity |
| Stats data collection | Custom PDH wrapper | StatsService (Phase 7, already built) | Already validated; handles GPU fallback, priming, disposal |
| Timer management | Custom thread-based polling | DispatcherTimer | Already used for phrase timer; same pattern; automatically marshals to UI thread |
| Percentage formatting | Custom string logic | `$"{value:F0}%"` C# format string | Rounds to nearest integer, handles 0-100 range |

**Key insight:** All infrastructure for this phase is already built. The work is purely XAML markup and a ~20-line UpdateStatsDisplay() method.

---

## Common Pitfalls

### Pitfall 1: Window Width Jitter from Percentage Text

**What goes wrong:** Without a fixed width on the StatsPanel, the percentage TextBlock changes width as text changes from "9%" (2 chars) to "100%" (4 chars), which causes SizeToContent=WidthAndHeight to resize the window.

**Why it happens:** SizeToContent=WidthAndHeight measures all child elements on every layout pass. Variable-width text content directly changes window width.

**How to avoid:** Set `Width="180"` on the StatsPanel StackPanel. This makes the panel a fixed-width island; SizeToContent will use 180px for it regardless of content.

**Warning signs:** Window visibly twitches horizontally when stats update from single-digit to triple-digit percentages.

### Pitfall 2: ContextMenu Detached from Hit-Test Surface

**What goes wrong:** If the ContextMenu is moved from the outer Grid to the inner Grid (which has Width=180), right-clicking the phrase TextBlock outside the 180px width area produces no context menu.

**Why it happens:** ContextMenu is bound to the element it is attached to. If the element doesn't extend to the full window click area, clicks outside it don't trigger the menu.

**How to avoid:** Keep `<Grid.ContextMenu>` on the outermost hit-test Grid (the one with `Background="#01000000"`), which spans the full window width.

**Warning signs:** Context menu appears only when right-clicking in a narrow strip, not the full phrase area.

### Pitfall 3: StatsPanel Height Leaking When Collapsed

**What goes wrong:** If `Margin="0,4,0,0"` is set on StatsPanel but Visibility=Collapsed, the margin still takes layout space in some element types (but NOT with Visibility.Collapsed in WPF — Collapsed correctly removes all layout space including margins).

**Why it happens:** Developers sometimes confuse Visibility.Hidden (reserves space) with Visibility.Collapsed (removes all space). In WPF, Collapsed is the correct choice — it removes margin AND size from the layout.

**How to avoid:** Use `Visibility="Collapsed"` (not `Hidden`) on StatsPanel. Verify that the widget renders identically to v1.1 when StatsPanel is Collapsed.

**Warning signs:** Window appears slightly taller than v1.1 even with stats hidden.

### Pitfall 4: Bar Width Calculation Before Layout

**What goes wrong:** Calling UpdateStatsDisplay() (which reads `CpuBarTrack.ActualWidth`) during ContentRendered — before the StatsPanel is made visible — returns ActualWidth=0, causing bars to always render at zero width.

**Why it happens:** Collapsed elements are not measured; their ActualWidth is 0.

**How to avoid:** Do not call UpdateStatsDisplay() in ContentRendered. Only call it from the timer tick. When Phase 9 makes StatsPanel visible, call UpdateStatsDisplay() once immediately after setting Visibility=Visible to populate bars before the first tick.

**Warning signs:** Bars always show at zero width even with stats visible.

### Pitfall 5: Stats ContextMenu Items Without x:Name

**What goes wrong:** If Stats submenu MenuItems (ShowStats, Interval1/3/10) don't have x:Name attributes, Phase 9 cannot find them in ContextMenu_Opened to set IsChecked state.

**Why it happens:** Items added without x:Name are not accessible from code-behind.

**How to avoid:** Give all checkable Stats menu items x:Name values in Phase 8 even though their click handlers are wired in Phase 9. The names are: `MenuShowStats`, `MenuInterval1`, `MenuInterval3`, `MenuInterval10`.

**Warning signs:** Phase 9 code-behind cannot reference the menu items.

### Pitfall 6: AllowsTransparency and Visual Effects

**What goes wrong:** Adding DropShadowEffect, BlurEffect, or any non-flat brush to elements in an AllowsTransparency window fails silently or renders incorrectly on most .NET 5+ GPU paths.

**Why it happens:** AllowsTransparency uses a layered HWND. The WPF GPU-accelerated rendering path for layered windows disables most effects.

**How to avoid:** Flat SolidColorBrush only. The project already uses the manual shadow TextBlock offset for the phrase. Stats panel must follow the same pattern — no effects, flat brushes only.

**Warning signs:** Elements disappear or render as solid black rectangles.

---

## Code Examples

### Complete StatsPanel XAML Structure

```xml
<!-- Row 1 of inner Grid — StatsPanel (default Collapsed) -->
<StackPanel x:Name="StatsPanel"
            Grid.Row="1"
            Width="180"
            Margin="0,4,0,0"
            Visibility="Collapsed">

    <!-- CPU row -->
    <Grid Margin="0,2,0,0">
        <Grid.ColumnDefinitions>
            <ColumnDefinition Width="35" />
            <ColumnDefinition Width="*" />
            <ColumnDefinition Width="36" />
        </Grid.ColumnDefinitions>
        <TextBlock Grid.Column="0" Text="CPU"
                   Foreground="White" FontFamily="Segoe UI Light" FontSize="12"
                   VerticalAlignment="Center" />
        <Border Grid.Column="1" x:Name="CpuBarTrack"
                Background="#40FFFFFF" CornerRadius="2" Height="8" VerticalAlignment="Center">
            <Border x:Name="CpuBar"
                    HorizontalAlignment="Left" Background="White"
                    CornerRadius="2" Height="8" Width="0" />
        </Border>
        <TextBlock Grid.Column="2" x:Name="CpuText"
                   Text="0%" Foreground="White" FontFamily="Segoe UI Light" FontSize="12"
                   TextAlignment="Right" VerticalAlignment="Center" />
    </Grid>

    <!-- GPU row -->
    <Grid Margin="0,2,0,0">
        <Grid.ColumnDefinitions>
            <ColumnDefinition Width="35" />
            <ColumnDefinition Width="*" />
            <ColumnDefinition Width="36" />
        </Grid.ColumnDefinitions>
        <TextBlock Grid.Column="0" Text="GPU"
                   Foreground="White" FontFamily="Segoe UI Light" FontSize="12"
                   VerticalAlignment="Center" />
        <Border Grid.Column="1" x:Name="GpuBarTrack"
                Background="#40FFFFFF" CornerRadius="2" Height="8" VerticalAlignment="Center">
            <Border x:Name="GpuBar"
                    HorizontalAlignment="Left" Background="White"
                    CornerRadius="2" Height="8" Width="0" />
        </Border>
        <TextBlock Grid.Column="2" x:Name="GpuText"
                   Text="0%" Foreground="White" FontFamily="Segoe UI Light" FontSize="12"
                   TextAlignment="Right" VerticalAlignment="Center" />
    </Grid>

    <!-- MEM row -->
    <Grid Margin="0,2,0,0">
        <Grid.ColumnDefinitions>
            <ColumnDefinition Width="35" />
            <ColumnDefinition Width="*" />
            <ColumnDefinition Width="36" />
        </Grid.ColumnDefinitions>
        <TextBlock Grid.Column="0" Text="MEM"
                   Foreground="White" FontFamily="Segoe UI Light" FontSize="12"
                   VerticalAlignment="Center" />
        <Border Grid.Column="1" x:Name="MemBarTrack"
                Background="#40FFFFFF" CornerRadius="2" Height="8" VerticalAlignment="Center">
            <Border x:Name="MemBar"
                    HorizontalAlignment="Left" Background="White"
                    CornerRadius="2" Height="8" Width="0" />
        </Border>
        <TextBlock Grid.Column="2" x:Name="MemText"
                   Text="0%" Foreground="White" FontFamily="Segoe UI Light" FontSize="12"
                   TextAlignment="Right" VerticalAlignment="Center" />
    </Grid>

</StackPanel>
```

### Stats ContextMenu Structure (Phase 8 — wiring deferred to Phase 9)

```xml
<MenuItem Header="Stats">
    <MenuItem x:Name="MenuShowStats"
              Header="Show Stats"
              IsCheckable="True" />
    <MenuItem Header="Update Interval">
        <MenuItem x:Name="MenuInterval1"  Header="1 second"   IsCheckable="True" />
        <MenuItem x:Name="MenuInterval3"  Header="3 seconds"  IsCheckable="True" />
        <MenuItem x:Name="MenuInterval10" Header="10 seconds" IsCheckable="True" />
    </MenuItem>
</MenuItem>
```

### UpdateStatsDisplay() Code-Behind

```csharp
// In MainWindow.xaml.cs
private void UpdateStatsDisplay()
{
    _statsService.Refresh();

    CpuText.Text = $"{_statsService.CpuPercent:F0}%";
    CpuBar.Width = CpuBarTrack.ActualWidth * (_statsService.CpuPercent / 100.0);

    if (_statsService.GpuPercent < 0f)
    {
        GpuText.Text = "N/A";
        GpuBar.Width = 0;
    }
    else
    {
        GpuText.Text = $"{_statsService.GpuPercent:F0}%";
        GpuBar.Width = GpuBarTrack.ActualWidth * (_statsService.GpuPercent / 100.0);
    }

    MemText.Text = $"{_statsService.MemPercent:F0}%";
    MemBar.Width = MemBarTrack.ActualWidth * (_statsService.MemPercent / 100.0);
}
```

### ContentRendered: Timer and StatsService Initialization

```csharp
ContentRendered += (_, _) =>
{
    // ... existing position logic (unchanged) ...

    // Phrase timer (unchanged)
    _timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(10) };
    _timer.Tick += (_, _) => UpdatePhraseIfChanged();
    _timer.Start();

    // Stats timer — separate from phrase timer (different interval, independently configurable)
    _statsService = new StatsService();
    _statsTimer = new DispatcherTimer
    {
        Interval = TimeSpan.FromSeconds(_statsIntervalSeconds)
    };
    _statsTimer.Tick += (_, _) => UpdateStatsDisplay();
    // Phase 8: StatsPanel is Collapsed by default (StatsVisible=false).
    // Do NOT start _statsTimer here. Phase 9 starts it in SetStatsVisible(true).
    // If Phase 8 wants to test with stats forced visible, start it here temporarily.
};
```

### ApplySettings() Extension

```csharp
internal void ApplySettings(AppSettings s)
{
    // Existing (unchanged)
    _currentFontSize = s.FontSize;
    PhraseText.FontSize = s.FontSize;
    ShadowText.FontSize = s.FontSize;
    if (s.Left != -1)
    {
        Left = s.Left;
        Top  = s.Top;
        _savedPositionLoaded = true;
        _hasUserPosition = true;
    }

    // Phase 8 addition
    _statsIntervalSeconds = s.StatsIntervalSeconds;
    // Note: StatsVisible not applied here (deferred to Phase 9).
    // Phase 8 hardcodes Visibility="Collapsed" in XAML.
}
```

### Field Additions to MainWindow.xaml.cs

```csharp
private DispatcherTimer _timer = null!;
private DispatcherTimer _statsTimer = null!;    // Phase 8 addition
private StatsService _statsService = null!;      // Phase 8 addition
private int _currentFontSize = 32;
private int _statsIntervalSeconds = 3;           // Phase 8 addition (default matches AppSettings)
private bool _savedPositionLoaded = false;
private bool _hasUserPosition = false;
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| ProgressBar with style override | Nested Border track+fill | Avoids AllowsTransparency ControlTemplate breakage |
| Aero glass effects | Flat SolidColorBrush only | AllowsTransparency constraint; established in Phase 2 |
| Binding bar width via XAML converter | Code-behind math in UpdateStatsDisplay() | Simpler; follows existing project code-behind pattern |
| Single DispatcherTimer for all updates | Two independent DispatcherTimers | Phrase=10s fixed; stats=1/3/10s user-configurable |

---

## Open Questions

1. **StatsService instantiation location — App.xaml.cs vs. MainWindow constructor vs. ContentRendered**
   - What we know: StatsService constructor launches `Task.Run(Initialize)` immediately. PDH cold-start takes ~6s before `_initialized=true`. Refresh() is a safe no-op until initialized.
   - What's unclear: Whether App.xaml.cs should create StatsService (like settings) and pass it to MainWindow, or MainWindow creates it internally.
   - Recommendation: Create StatsService in ContentRendered inside MainWindow — this keeps all timer lifecycle in one place and matches the phrase timer pattern. The 6s init happens in background regardless of when the object is created; no benefit to creating it earlier since Refresh() is a no-op until initialized.

2. **_statsTimer start on Phase 8 vs. Phase 9 boundary**
   - What we know: Phase 8 goal says stats panel must show "live CPU, GPU, and memory values updating at the default interval." StatsPanel defaults to Collapsed (StatsVisible=false). The success criteria say the widget defaults to Collapsed (SC4).
   - What's unclear: Whether Phase 8 should verify the timer works by temporarily forcing Visibility=Visible for testing, or whether the planner should add a test-only task.
   - Recommendation: Add a single verification task where the implementor temporarily sets `StatsPanel.Visibility = Visibility.Visible` and `_statsTimer.Start()` in ContentRendered, verifies bars update, then reverts to Collapsed default. This satisfies SC1/SC2/SC3 while keeping the final state at Collapsed.

3. **StatsService disposal in OnClosing (Phase 8 vs. Phase 9 scope)**
   - What we know: Phase 9 is listed as handling "OnClosing disposal order." Phase 8 creates StatsService. If the app closes during Phase 8, StatsService.Dispose() won't be called unless OnClosing is updated.
   - What's unclear: Whether Phase 8 should add Dispose() call to OnClosing now.
   - Recommendation: Phase 8 should add `_statsService?.Dispose()` to OnClosing to avoid resource leaks during testing, even if Phase 9 formalizes the disposal order. This is a one-line addition.

---

## Sources

### Primary (HIGH confidence)
- Codebase direct inspection (MainWindow.xaml, MainWindow.xaml.cs, StatsService.cs, AppSettings.cs, SettingsService.cs) — full current state of all files being modified
- ROADMAP.md Phase 8 section — architecture decisions locked in roadmap (Grid RowDefinitions, fixed Width=180, nested Border bars, DispatcherTimer pattern)
- STATE.md Accumulated Context — all critical decisions affecting Phase 8 (AllowsTransparency constraint, SizeToContent behavior, DispatcherTimer independence, Fixed Width guard)

### Secondary (MEDIUM confidence)
- WPF documentation patterns for Visibility.Collapsed vs Hidden, Grid RowDefinitions behavior — well-established WPF fundamentals consistent with knowledge through August 2025
- DispatcherTimer behavior on UI thread — consistent with .NET 10 WPF documentation patterns

### Tertiary (LOW confidence)
- None — all claims supported by codebase inspection or well-established WPF fundamentals

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all components are in-box .NET 10 WPF already in use in the project
- Architecture: HIGH — architecture decisions are locked in ROADMAP.md and directly verified against current codebase
- Pitfalls: HIGH — derived from existing project decisions (AllowsTransparency, SizeToContent, DispatcherTimer patterns) and direct code inspection
- Code examples: HIGH — derived directly from existing codebase patterns and locked architecture decisions

**Research date:** 2026-02-25
**Valid until:** 2026-03-25 (stable WPF fundamentals; no fast-moving dependencies)
