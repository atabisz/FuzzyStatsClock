# Architecture Integration — v4.2 Temps & Menu

**Project:** FuzzyClock v4.2
**Researched:** 2026-05-04
**Confidence:** HIGH

## Executive Summary

The v4.2 milestone adds two feature groups that integrate cleanly with established architectural patterns:

1. **Temperature monitoring** (CPU / GPU / Motherboard / NVMe) via LibreHardwareMonitorLib 0.9.6, exposed as a new `TempService` in `FuzzyClock.App`, surfaced through a new `TempsText` line inside the existing `StatsPanel`, and configured via a new 4th "Temps" tab in `SettingsWindow`.

2. **Right-click widget menu** that reuses the existing `ContextMenuStrip` already built by `TrayMenuBuilder` — no duplicate menu tree, no duplicate state sync, one handler on the root Grid.

No new architectural patterns are required. All integration points have decision precedent from v2.1 (StatsService), v2.6 (MonitorService), v3.2 (SettingsSnapshot + events), and v2.4 (tray-only controls via TrayMenuBuilder).

**Build order recommendation (8 phases):** P-A TempService → P-B AppSettings fields → P-C SettingsSnapshot + events → P-D Temps tab XAML → P-E MainWindow integration → P-F TempsText XAML line → P-G Right-click menu wiring (parallelizable) → P-H audit/test pass.

---

## Answers to Integration Questions

### Q1. Where does LibreHardwareMonitorLib live — FuzzyClock.Core or FuzzyClock.App?

**Answer: FuzzyClock.App.**

`FuzzyClock.Core` is `TargetFramework=net10.0` (TFM-neutral, pure C#, zero `PackageReference`). Its role is platform-independent logic (phrase providers, SevenSegmentEncoder, DateFormatter). LHM 0.9.6 carries transitive Windows-specific dependencies (`System.Management`, `HidSharp`, WMI/WinRing0 driver invocation, admin-privilege fallback paths). Taking that dependency contaminates Core's TFM-neutral posture, breaks unit test portability, and provides no abstraction benefit — temperature data has no pure-logic transformations worth isolating in Core.

`FuzzyClock.App` is already `net10.0-windows` with `UseWPF=true` and `UseWindowsForms=true`, already owns Windows-only services (`StatsService`, `MonitorService`, `ContrastService`), and is the correct home for hardware-sensor plumbing.

**Precedent:** `StatsService` (PerformanceCounter — Windows-only) and `MonitorService` (SystemParameters — WPF-specific) both live in App for this exact reason.

**Migration path if Core extraction ever becomes desirable:** extract a pure `ITempSensorReader` interface into Core with `float Read(SensorKind)` and mock it for tests. Not recommended for v4.2 — premature abstraction.

---

### Q2. What service abstraction pattern should TempService follow?

**Answer: Mirror `StatsService` exactly.**

`StatsService` is the canonical pattern for cold-start, fallback-tolerant hardware sensor services in this codebase:

```csharp
public sealed class TempService : IDisposable
{
    private Computer? _computer;
    private bool _initialized;
    private bool _lhmAvailable;

    public float CpuTempC   { get; private set; } = -1f;   // -1f sentinel = unavailable
    public float GpuTempC   { get; private set; } = -1f;
    public float MoboTempC  { get; private set; } = -1f;
    public float NvmeTempC  { get; private set; } = -1f;

    public bool IsReady => _initialized;
    public bool Available => _lhmAvailable;

    public TempService()
    {
        Task.Run(Initialize);   // async cold start — 1–3s LHM probe
    }

    private void Initialize()
    {
        try
        {
            _computer = new Computer
            {
                IsCpuEnabled = true,
                IsGpuEnabled = true,
                IsMotherboardEnabled = true,
                IsStorageEnabled = true
            };
            _computer.Open();
            _lhmAvailable = true;
        }
        catch (Exception)
        {
            // Admin required, driver load failed, VM, unsupported hardware — graceful no-op
            _lhmAvailable = false;
        }
        finally
        {
            _initialized = true;
        }
    }

    public void Refresh()
    {
        if (!_initialized || !_lhmAvailable || _computer is null) return;

        try
        {
            _computer.Accept(new UpdateVisitor());
            // Walk hardware tree, pull first matching temp sensor per category
            foreach (var hw in _computer.Hardware)
            {
                switch (hw.HardwareType)
                {
                    case HardwareType.Cpu:         CpuTempC  = FirstTemp(hw, "Package") ?? FirstTemp(hw, "CPU Core") ?? -1f; break;
                    case HardwareType.GpuNvidia:
                    case HardwareType.GpuAmd:
                    case HardwareType.GpuIntel:    GpuTempC  = FirstTemp(hw, "GPU Core") ?? -1f; break;
                    case HardwareType.Motherboard: MoboTempC = FirstTemp(hw, null) ?? -1f; break;
                    case HardwareType.Storage:     NvmeTempC = FirstTemp(hw, null) ?? -1f; break;
                }
            }
        }
        catch
        {
            // Sensor read failures are silent — -1f sentinels preserved from last good read
        }
    }

    public void Dispose() => _computer?.Close();
}
```

**Pattern mirrors StatsService in 5 ways:**

1. **`-1f` sentinel** for "unavailable" — same convention as `StatsService.BatteryPercent`.
2. **`IsReady` gate** — `MainWindow.OnTimerTick` checks `_tempService.IsReady` before rendering, prevents pre-initialize flicker.
3. **`Task.Run(Initialize)`** — LHM `Computer.Open()` is 1–3s on first call (driver load). Async init prevents UI freeze.
4. **try/catch per-call** — graceful fallback if driver access fails mid-session (rare but possible with UAC boundary changes).
5. **`IDisposable`** — `LhmComputer.Close()` must run on app exit; wire into existing `Window.Closing` handler alongside `_statsService`.

**UpdateVisitor** is a one-line `IVisitor` implementation LHM requires for tree-walking:
```csharp
internal sealed class UpdateVisitor : IVisitor
{
    public void VisitComputer(IComputer computer) => computer.Traverse(this);
    public void VisitHardware(IHardware hardware) { hardware.Update(); foreach (var sub in hardware.SubHardware) sub.Accept(this); }
    public void VisitSensor(ISensor sensor) { }
    public void VisitParameter(IParameter parameter) { }
}
```

**Refresh cadence:** Piggyback the existing `_statsTimer.Tick` — no new DispatcherTimer. Temps and stats refresh at the same interval (1–10s via the v4.1 slider). Zero new timer state, zero new thread-safety surface area.

---

### Q3. What shape should temperature AppSettings take?

**Answer: Five explicit bools — NOT a Dictionary.**

```csharp
public record AppSettings
{
    // ...existing fields...

    // v4.2 — Temps line
    public bool TempsLineVisible { get; init; } = false;  // master toggle; off by default (opt-in feature)
    public bool TempCpuVisible   { get; init; } = true;
    public bool TempGpuVisible   { get; init; } = true;
    public bool TempMoboVisible  { get; init; } = false;  // often absent/noisy — opt-in
    public bool TempNvmeVisible  { get; init; } = true;
}
```

**Why explicit bools beat `Dictionary<string, bool>`:**

1. **JSON round-trip stability.** The `AppSettings` record serializes via `System.Text.Json` — explicit init-properties preserve forward/backward compat under the established "add field = defaults to safe value, remove field = ignore" convention (decision thread from v2.5/v2.6). A `Dictionary<string,bool>` field has no schema and no default semantics for missing keys.

2. **Validate() ladder compatibility.** `SettingsService.Validate()` uses explicit field guards (`validLcdStyles`, `validDateFormats`). Per-temp bools plug directly into this pattern with zero new validation needed (bools are always valid).

3. **Compile-time access.** `settings.TempCpuVisible` is refactor-safe; `settings.Temps["Cpu"]` is a string-keyed runtime bug farm.

4. **Matches existing stat-row precedent.** `StatsVisible`, `BatteryVisible`, `DateVisible` are all explicit bools — consistency with v1.3/v3.0/v3.1 patterns.

**Defaults chosen intentionally:**
- `TempsLineVisible = false` — feature ships OFF; user opts in via Temps tab checkbox. Mirrors v3.0 `ShowDate = false` pattern for new stat lines that change widget height.
- `TempCpuVisible = true`, `TempGpuVisible = true`, `TempNvmeVisible = true` — commonly available, commonly wanted.
- `TempMoboVisible = false` — often absent on low-end boards, often noisy (EC/chipset sensors). Opt-in.

---

### Q4. How should SettingsSnapshot and Settings↔MainWindow events expand?

**Answer: Five new snapshot fields + four `*Available` capability flags + five new `event Action<bool>?` events. No new event types.**

**SettingsSnapshot additions (immutable, populated on SettingsWindow.Open):**
```csharp
public sealed record SettingsSnapshot(
    // ...existing 30+ fields...

    // v4.2 Temps
    bool   TempsLineVisible,
    bool   TempCpuVisible,
    bool   TempGpuVisible,
    bool   TempMoboVisible,
    bool   TempNvmeVisible,

    // v4.2 Temps capability flags (hardware-derived, not persisted)
    bool   TempsServiceAvailable,   // false if LHM init failed — disables entire Temps tab
    bool   TempCpuAvailable,        // false if CPU has no package/core sensor
    bool   TempGpuAvailable,
    bool   TempMoboAvailable,
    bool   TempNvmeAvailable
);
```

**SettingsWindow events (five new `Action<bool>?`):**
```csharp
public event Action<bool>? TempsLineVisibleChanged;
public event Action<bool>? TempCpuVisibleChanged;
public event Action<bool>? TempGpuVisibleChanged;
public event Action<bool>? TempMoboVisibleChanged;
public event Action<bool>? TempNvmeVisibleChanged;
```

**Why no new event type families:** All five are `bool` toggles — identical signature to existing 15+ `event Action<bool>?` fields (`StatsVisibleChanged`, `BatteryVisibleChanged`, `BackdropAlwaysVisibleChanged`, etc.). Adding them is pure mechanical replication of the established pattern.

**Capability-gating pattern (canonical in SettingsWindow.xaml.cs):**
```csharp
// In PopulateFromSnapshot(), gate UI per capability:
ChkTempsLine.IsEnabled    = _snapshot.TempsServiceAvailable;
ChkTempCpu.IsEnabled      = _snapshot.TempsServiceAvailable && _snapshot.TempCpuAvailable;
ChkTempGpu.IsEnabled      = _snapshot.TempsServiceAvailable && _snapshot.TempGpuAvailable;
ChkTempMobo.IsEnabled     = _snapshot.TempsServiceAvailable && _snapshot.TempMoboAvailable;
ChkTempNvme.IsEnabled     = _snapshot.TempsServiceAvailable && _snapshot.TempNvmeAvailable;

// If whole service unavailable, show single disabled tab w/ explanatory TextBlock:
TempsUnavailableText.Visibility = _snapshot.TempsServiceAvailable ? Visibility.Collapsed : Visibility.Visible;
```

This mirrors the existing `CmbPhraseStyle.IsEnabled = isStyleSupported` capability-gating from v3.2 (phrase styles per locale).

**Snapshot population (MainWindow side):**
```csharp
var snapshot = new SettingsSnapshot(
    // ...existing fields...
    TempsLineVisible:      _settings.TempsLineVisible,
    TempCpuVisible:        _settings.TempCpuVisible,
    TempGpuVisible:        _settings.TempGpuVisible,
    TempMoboVisible:       _settings.TempMoboVisible,
    TempNvmeVisible:       _settings.TempNvmeVisible,

    TempsServiceAvailable: _tempService.Available,
    TempCpuAvailable:      _tempService.CpuTempC  > -1f || !_tempService.IsReady,  // assume available until proven otherwise
    TempGpuAvailable:      _tempService.GpuTempC  > -1f || !_tempService.IsReady,
    TempMoboAvailable:     _tempService.MoboTempC > -1f || !_tempService.IsReady,
    TempNvmeAvailable:     _tempService.NvmeTempC > -1f || !_tempService.IsReady
);
```

**Settings tab order (4 tabs):** Appearance → Stats → **Temps** (new) → Behavior. Temps sits next to Stats because it's conceptually a Stats-row extension. Behavior stays rightmost (it owns window-level behaviors: ghost, opacity, edge-snap, single-instance).

---

### Q5. How should the right-click menu be wired with correct DPI/screen coordinate handling?

**Answer: Expose `TrayMenuBuilder.ContextMenu` as a public property; add `Grid_MouseRightButtonUp` on the root Grid; use `PointToScreen()` for coordinate conversion; reuse the existing `Opening` event for checkmark sync.**

**Step 1 — Expose the menu from TrayMenuBuilder:**

Current `TrayMenuBuilder.Build()` creates a local `ContextMenuStrip menu` and returns the `NotifyIcon` with `menu` attached via `notifyIcon.ContextMenuStrip = menu`. Add a public property:

```csharp
public sealed class TrayMenuBuilder
{
    public NotifyIcon NotifyIcon { get; private set; } = null!;
    public ContextMenuStrip ContextMenu { get; private set; } = null!;  // <-- NEW

    public void Build(...)
    {
        var menu = new ContextMenuStrip();
        // ... existing build logic ...
        ContextMenu = menu;                      // <-- NEW
        NotifyIcon = new NotifyIcon { ... };
        NotifyIcon.ContextMenuStrip = menu;
    }
}
```

**Step 2 — MainWindow handler:**

```csharp
private void Grid_MouseRightButtonUp(object sender, MouseButtonEventArgs e)
{
    if (_isDragging) return;                // don't show menu mid-drag
    if (_trayMenuBuilder is null) return;   // belt-and-braces during cold start

    // Convert the mouse position (WPF device-independent pixels) to screen pixels.
    // PointToScreen() handles per-monitor DPI and multi-monitor offset natively.
    Point wpfPoint = e.GetPosition(this);
    Point screenPoint = PointToScreen(wpfPoint);

    // ContextMenuStrip.Show(Point) takes SCREEN PIXELS directly — no extra conversion.
    _trayMenuBuilder.ContextMenu.Show(new System.Drawing.Point(
        (int)screenPoint.X,
        (int)screenPoint.Y));

    e.Handled = true;
}
```

**Step 3 — Wire in XAML on the root Grid (same element that hosts `Grid_MouseLeftButtonDown`):**
```xaml
<Grid MouseLeftButtonDown="Grid_MouseLeftButtonDown"
      MouseRightButtonUp="Grid_MouseRightButtonUp">
    <!-- ... existing content ... -->
</Grid>
```

**DPI handling — why PointToScreen is sufficient:**

`Window.PointToScreen(Point)` is WPF's canonical coordinate conversion. It:
1. Walks the visual tree to the top-level HWND
2. Applies the current `CompositionTarget.TransformToDevice` (per-monitor DPI)
3. Adds the screen offset of the window's HWND (multi-monitor)
4. Returns a device-pixel `Point` that matches what the Win32 `GetCursorPos` API would produce

`ContextMenuStrip.Show(Point)` per Microsoft Learn takes "the location of the upper-left corner of the ContextMenuStrip, in screen coordinates" — identical coordinate space. No extra math needed.

**Do NOT use:**
- `e.GetPosition(this)` alone — returns WPF DIPs, wrong scale on high-DPI displays
- `Mouse.GetPosition(null)` — returns screen coords but in DIPs, not device pixels
- Manual `double dpiScale = VisualTreeHelper.GetDpi(this).DpiScaleX` — PointToScreen already does this

**Why use `MouseRightButtonUp` (not Down):**
- Matches Windows convention (menus appear on mouse-up)
- Fires after any `MouseRightButtonDown` drag-start detection (none currently, but future-proof)
- `e.Handled = true` prevents bubbling to any parent handlers

**Ghost Mode interaction — zero guards needed:**
- When Ghost Mode is active and cursor hasn't entered widget with Ctrl+Alt held, the window has `WS_EX_TRANSPARENT` applied. Win32 routes the right-click to whatever is beneath — `Grid_MouseRightButtonUp` is **never called**. No `if (_isGhostMode) return;` check necessary.
- When user holds Ctrl+Alt and enters the widget in Ghost Mode, `WS_EX_TRANSPARENT` is NOT applied (per v2.3 Ctrl+Alt branch), so RMB works normally.

**Opacity = 0 interaction:**
- When the user hides the widget (`_windowOpacity = 0`), the window is still hit-testable (Opacity != Visibility.Hidden). RMB would still work. This is fine — if the user can't see the widget and can't remember where it is, RMB on empty space is a no-op.
- Optional belt-and-braces: `if (_windowOpacity <= 0.0) return;` — recommended for parity with existing Ghost-mode-style hover guards.

**Checkmark sync — free from existing `Opening` event:**

`TrayMenuBuilder.Build()` already wires `menu.Opening += (_, _) => SyncCheckmarks(getState())`. This fires every time the menu opens — from tray icon OR from the new widget RMB handler. Zero additional state management.

**Parallelizability:** The right-click menu phase (P-G) is **fully parallelizable** with every other v4.2 phase (P-A through P-F). It touches only:
- `TrayMenuBuilder.cs` (one new property)
- `MainWindow.xaml` (one event attribute)
- `MainWindow.xaml.cs` (one handler method)

Zero overlap with TempService, AppSettings, SettingsSnapshot, or any XAML involved in the temps line.

---

### Q6. Where should TempsText live in the StackPanel — inside StatsPanel or as its own Row?

**Answer: Inside StatsPanel, positioned after UptimeText.**

**StackPanel structure (current, simplified):**
```xaml
<StackPanel x:Name="RootStack">
    <TextBlock x:Name="PhraseText" .../>        <!-- phrase OR dial OR nixie OR LCD -->
    <TextBlock x:Name="DateText" .../>
    <StackPanel x:Name="StatsPanel">
        <Grid> <!-- CPU row --> </Grid>
        <Grid> <!-- GPU row --> </Grid>
        <Grid> <!-- MEM row --> </Grid>
        <Grid> <!-- PAG row --> </Grid>
        <Grid> <!-- BATT row --> </Grid>
        <TextBlock x:Name="UptimeText" .../>    <!-- ancillary line precedent -->
    </StackPanel>
</StackPanel>
```

**Recommended placement:**
```xaml
<StackPanel x:Name="StatsPanel">
    <Grid> <!-- CPU --> </Grid>
    <Grid> <!-- GPU --> </Grid>
    <Grid> <!-- MEM --> </Grid>
    <Grid> <!-- PAG --> </Grid>
    <Grid> <!-- BATT --> </Grid>
    <TextBlock x:Name="UptimeText" .../>
    <TextBlock x:Name="TempsText" .../>        <!-- NEW: after uptime -->
</StackPanel>
```

**Why inside StatsPanel (not as sibling row of RootStack):**

1. **Auto-hide with stats toggle.** `StatsPanel.Visibility = Collapsed` when `StatsVisible = false` already hides CPU/GPU/MEM/PAG/BATT/Uptime together. Placing `TempsText` inside means it inherits the same visibility behavior for free — no new coupling code.

2. **Consistency with Uptime precedent.** `UptimeText` is the canonical ancillary text-line inside StatsPanel (not a Grid-based stat row). TempsText follows the same pattern — a single TextBlock formatting multiple sensor values.

3. **Layout ordering (bottom-most).** TempsText after UptimeText means the widget's vertical growth on temps-enable is at the bottom edge — least disruptive to user's mental model of widget position. Top-edge growth (e.g., above phrase) would feel jarring.

4. **Two-layer visibility:** `TempsText.Visibility` is controlled by `TempsLineVisible` (master toggle), independent of `StatsPanel.Visibility`. When `StatsVisible = true` + `TempsLineVisible = false`, stats show but temps don't. When `StatsVisible = false`, StatsPanel hides entirely (temps hidden by parent). No conflict, no code complexity.

**TempsText format:**
```
TempsText.Text = $"CPU {cpuTemp:F0}°C  GPU {gpuTemp:F0}°C  NVMe {nvmeTemp:F0}°C";
```
Compose string dynamically from enabled sensors only. Skip `-1f` sentinels. Empty string collapses the TextBlock height.

**XAML:**
```xaml
<TextBlock x:Name="TempsText"
           Margin="0,2,0,0"
           HorizontalAlignment="Left"
           FontSize="11"
           Opacity="0.7"
           Foreground="{Binding ElementName=MainWindow, Path=AccentBrush}"
           Visibility="Collapsed"/>
```
Mirror UptimeText's styling (FontSize=11, Opacity=0.7, accent-colored).

**Refresh:** Piggyback existing `_statsTimer.Tick` — `UpdateTempsDisplay()` called after `UpdateStatsDisplay()`. Zero new timer.

---

## System Overview (v4.2 additions)

```
┌──────────────────────────────────────────────────────────────┐
│                       Presentation (WPF)                     │
├──────────────────────────────────────────────────────────────┤
│  ┌───────────┐  ┌────────────────────┐  ┌──────────────┐     │
│  │MainWindow │  │ SettingsWindow     │  │TrayMenuBuild.│     │
│  │           │  │ ├─Appearance       │  │ ┌──────────┐ │     │
│  │ RootStack │  │ ├─Stats            │  │ │ContextMnu│◄│─┐   │
│  │  ├Phrase  │  │ ├─Temps  [NEW]     │  │ │Strip     │ │ │   │
│  │  ├Date    │  │ └─Behavior         │  │ └──────────┘ │ │   │
│  │  └Stats   │  └────────────────────┘  └──────────────┘ │   │
│  │    ├Cpu..             │                               │   │
│  │    ├Batt              │  events (bool)                │   │
│  │    ├Uptime            │                               │   │
│  │    └Temps[NEW]        │                               │   │
│  │                       │                               │   │
│  │  Grid_MouseRight ─────┼───────────────────────────────┘   │
│  │          UpHandler    │  calls ContextMenu.Show(point)    │
│  │                       ▼                                   │
│  │                SettingsSnapshot                           │
│  └──────────┬───────────────────────────────────────────┘    │
├─────────────┼────────────────────────────────────────────────┤
│             ▼                 Services (FuzzyClock.App)      │
├──────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │StatsService  │  │TempService   │  │MonitorService│        │
│  │(PerfCounter) │  │(LHM 0.9.6)   │  │(DPI,screens) │        │
│  │[EXISTING]    │  │[NEW]         │  │[EXISTING]    │        │
│  └──────────────┘  └──────────────┘  └──────────────┘        │
├──────────────────────────────────────────────────────────────┤
│                  Core (FuzzyClock.Core net10.0)              │
├──────────────────────────────────────────────────────────────┤
│  [Phrase providers, DateFormatter, SevenSegmentEncoder ]     │
│  [Unchanged in v4.2 — no new Core dependencies ]             │
└──────────────────────────────────────────────────────────────┘
```

---

## Component Responsibilities

| Component | Responsibility | Modified By |
|-----------|---------------|-------------|
| `TempService` (App) | LHM lifecycle; poll CPU/GPU/Mobo/NVMe sensors; expose `-1f` sentinels | **NEW in P-A** |
| `AppSettings` (App) | Persist 5 temp bools | P-B (5 new init-props) |
| `SettingsService.Validate()` | No-op for bools (always valid) | no change |
| `SettingsSnapshot` (App) | Carry temp prefs + 5 capability flags | P-C (10 new fields) |
| `SettingsWindow.xaml` | 4th "Temps" tab, 5 checkboxes, unavailable text | P-D |
| `SettingsWindow.xaml.cs` | 5 new events, 5 new `Chk*_Changed` handlers, capability gating | P-D |
| `MainWindow.xaml` | `TempsText` TextBlock in StatsPanel; `MouseRightButtonUp` attribute on root Grid | P-F, P-G |
| `MainWindow.xaml.cs` | Own `_tempService`; wire 5 event handlers; `UpdateTempsDisplay()`; `Grid_MouseRightButtonUp` handler | P-E, P-G |
| `TrayMenuBuilder.cs` | Expose `ContextMenu` as public property | P-G (one-line change) |
| `FuzzyClock.Core.*` | No changes | none |

---

## Data Flow

### Temperature refresh (happens on every stats tick)
```
_statsTimer.Tick
    │
    ▼
OnStatsTimerTick()
    │
    ├─► _statsService.Refresh()     (existing)
    │
    ├─► _tempService.Refresh()      (NEW — visits LHM hardware tree, updates 4 floats)
    │
    └─► UpdateStatsDisplay()        (existing)
        │
        └─► UpdateTempsDisplay()    (NEW — composes TempsText.Text from enabled sensors,
                                     skips -1f sentinels, sets Visibility)
```

### Settings round-trip (Temps tab checkbox change)
```
User clicks ChkTempCpu in SettingsWindow
    │
    ▼
ChkTempCpu_Changed (SettingsWindow.xaml.cs)
    │
    ├─ if (_suppressEvents) return;          (populate-phase guard)
    │
    └─► TempCpuVisibleChanged?.Invoke(isChecked)
         │
         ▼
    MainWindow.OnTempCpuVisibleChanged(visible)    (event handler registered in OpenSettings)
         │
         ├─► _tempCpuVisible = visible              (local field mirror)
         ├─► UpdateTempsDisplay()                   (re-render TempsText immediately)
         └─► SaveSettings()                         (persist AppSettings with new bool)
```

### Right-click menu (NEW)
```
User right-clicks on widget
    │
    ▼
Grid_MouseRightButtonUp(sender, e)
    │
    ├─ if (_isDragging) return;
    ├─ e.GetPosition(this)          → WPF DIP point
    ├─ PointToScreen(wpfPoint)      → device-pixel screen point (DPI-aware)
    │
    └─► _trayMenuBuilder.ContextMenu.Show(new System.Drawing.Point(x, y))
         │
         └─ menu.Opening fires      (existing, wired in TrayMenuBuilder.Build)
              │
              └─► SyncCheckmarks(getState())   (existing — all IsChecked flags refresh)
```

---

## Architectural Patterns to Follow

### Pattern 1: Mirror StatsService for TempService (from v2.1)
**What:** Async `Task.Run(Initialize)` cold start; `IsReady` gate; `-1f` sentinels; try/catch per refresh; `IDisposable`.

**When to use:** Any Windows-specific hardware-sensor service that can fail on init (admin UAC, missing driver, VM) or fail mid-session.

**Trade-offs:** Trades compile-time safety for runtime robustness. Callers MUST check `IsReady` and guard `-1f`. Precedent from `StatsService.BatteryPercent` makes this idiomatic.

### Pattern 2: Explicit-bool AppSettings fields (from v1.3, v3.0, v3.1)
**What:** One init-property per feature toggle. No dictionaries, no nested config records for simple bools.

**When to use:** Every user-facing toggle. Dictionaries only when keys are truly dynamic (e.g., per-monitor positions in v2.6).

### Pattern 3: SettingsSnapshot + `*Available` capability flags (from v3.2)
**What:** Snapshot carries both the user's saved preference AND the hardware/locale capability. UI gates on capability, persists preference.

**When to use:** Any feature where user preference may conflict with runtime capability (LHM admin gating, phrase-style-per-locale gating).

### Pattern 4: Piggyback existing timer (from v3.1 battery, v2.8 process count)
**What:** New periodic data (temps) refreshes inside `_statsTimer.Tick`. No new DispatcherTimer.

**When to use:** Any refresh cadence that matches an existing timer's domain (stats/temps both 1–10s). New timer only when cadence differs materially (e.g., ghost-mode 75ms proximity polling).

### Pattern 5: Reuse ContextMenuStrip for widget RMB (NEW, but trivial extension of v2.4)
**What:** Single menu tree, single checkmark-sync path, shown from both NotifyIcon and Window.

**When to use:** When the same command surface applies to two interaction contexts. Don't build a second menu — just re-show the first.

### Pattern 6: PointToScreen for any Win32 coordinate boundary (WPF canon)
**What:** `Window.PointToScreen(Point)` handles DIP→device-pixel + multi-monitor offset.

**When to use:** Every WPF → Win32 coordinate conversion. Never manual DPI math.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Putting LibreHardwareMonitorLib in FuzzyClock.Core
**What people do:** Add `PackageReference Include="LibreHardwareMonitorLib"` to Core thinking "it's a data service."

**Why it's wrong:** LHM has transitive Windows-specific dependencies (`System.Management`, `HidSharp`) that pollute Core's TFM-neutral `net10.0` target. Core tests would need Windows runners. No abstraction benefit — temperatures have no pure-logic transformations.

**Do this instead:** TempService lives in `FuzzyClock.App` alongside StatsService and MonitorService. Core stays pure.

### Anti-Pattern 2: Opening LHM Computer on UI thread
**What people do:** `new Computer { ... }.Open()` directly in constructor or `OnLoaded`.

**Why it's wrong:** `Computer.Open()` probes hardware, loads WinRing0 driver on first call — 1–3s synchronous operation. Freezes the widget on startup.

**Do this instead:** `Task.Run(Initialize)` from TempService constructor (mirrors StatsService pattern). `IsReady` gate prevents render until init completes.

### Anti-Pattern 3: Hardcoding "Package" sensor lookup
**What people do:** `var tempSensor = cpu.Sensors.First(s => s.Name == "Package")`.

**Why it's wrong:** CPU sensor naming varies by vendor (Intel = "CPU Package", AMD = "Core (Tctl/Tdie)", older CPUs = "CPU Core"). `.First()` throws when absent.

**Do this instead:** Fall-through chain with nullable result — try "Package" → "CPU Package" → "Core (Tctl/Tdie)" → first `SensorType.Temperature`. Return `-1f` sentinel if none found.

### Anti-Pattern 4: Polling temps on their own DispatcherTimer
**What people do:** Add a 3rd DispatcherTimer just for temps.

**Why it's wrong:** More timer state to coordinate with drag/ghost/proximity gating. Temps and stats share a refresh domain — they should share a pulse.

**Do this instead:** Piggyback `_statsTimer.Tick`. User's v4.1 stats-interval slider also controls temp cadence. Consistent UX, zero new state.

### Anti-Pattern 5: Manual DPI math for ContextMenuStrip.Show
**What people do:** `var dpi = VisualTreeHelper.GetDpi(this); var screenX = mousePos.X * dpi.DpiScaleX + windowLeft;`.

**Why it's wrong:** Reimplements `PointToScreen` badly. Breaks on multi-monitor with mixed DPI. Breaks on DPI changes mid-session.

**Do this instead:** `var screen = PointToScreen(e.GetPosition(this)); menu.Show(new Point((int)screen.X, (int)screen.Y));`.

### Anti-Pattern 6: Building a duplicate ContextMenuStrip for the widget
**What people do:** In MainWindow, build a new `ContextMenu` (WPF) mirroring the tray menu structure.

**Why it's wrong:** Two menu trees to keep in sync. Two IsChecked sync paths. Two handler wiring surfaces. WPF `ContextMenu` also has different styling defaults than WinForms `ContextMenuStrip`, breaking visual parity with the tray.

**Do this instead:** Expose `TrayMenuBuilder.ContextMenu` as a property and call `.Show(Point)` from the widget RMB handler. One menu, one state, one style.

### Anti-Pattern 7: Guarding Grid_MouseRightButtonUp against ghost mode
**What people do:** `if (_isGhostMode) return;` at the top of the RMB handler.

**Why it's wrong:** Ghost Mode applies `WS_EX_TRANSPARENT` to the window, which makes Win32 route mouse events to the window beneath. The handler is **never called** when ghost-transparent. The guard is dead code at best, misleading at worst.

**Do this instead:** Trust the Win32 layer. Only guard against `_isDragging` (real conflict) and optionally `_windowOpacity <= 0` (user invisibility).

---

## Integration Points

### External Dependencies

| Dependency | Version | License | Integration Pattern |
|-----------|---------|---------|---------------------|
| LibreHardwareMonitorLib | 0.9.6 | MPL-2.0 | `Computer.Open()` async, `Accept(new UpdateVisitor())` per refresh, `Close()` on Dispose |

**MPL-2.0 compatibility:** File-level copyleft only. Using LHM as a NuGet dependency in a closed-source or MIT-licensed app is fine; we just can't modify LHM's source files without releasing those modifications. We're consuming, not forking.

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| MainWindow ↔ TempService | Direct property reads (`_tempService.CpuTempC`) on UI thread | Same pattern as StatsService |
| MainWindow ↔ SettingsWindow | `event Action<bool>?` per-setting | 5 new events, zero new types |
| MainWindow ↔ TrayMenuBuilder | `_trayMenuBuilder.ContextMenu` property read | One-line change to TrayMenuBuilder |
| SettingsWindow capability gating | Read `_snapshot.TempsServiceAvailable` etc. | No callback to TempService needed |

---

## Build Order (Recommended Phase Sequence)

| Phase | Name | Dependency | Parallelizable? |
|-------|------|------------|-----------------|
| **P-A** | TempService class + LHM wiring | none | ⚠ Blocks P-C, P-E |
| **P-B** | AppSettings temp fields (5 bools) | none | ⚠ Blocks P-C, P-D |
| **P-C** | SettingsSnapshot temp fields + capability flags | P-A, P-B | ⚠ Blocks P-D, P-E |
| **P-D** | SettingsWindow Temps tab (XAML + 5 events) | P-C | ⚠ Blocks P-E |
| **P-E** | MainWindow integration (service instantiation, event handlers, UpdateTempsDisplay) | P-A, P-C, P-D | — |
| **P-F** | TempsText in MainWindow.xaml StatsPanel | P-E | — |
| **P-G** | Right-click menu wiring | none (touches only TrayMenuBuilder + MainWindow grid) | ✅ Parallel with A–F |
| **P-H** | Audit + test pass (add MSTest coverage for Validate bools, snapshot round-trip, event flow) | all above | — |

**Critical path:** P-A (or P-B) → P-C → P-D → P-E → P-F → P-H. About 5–6 phases sequentially; P-G can ship any time.

---

## Testing Strategy

### P-A TempService (FuzzyClock.App.Tests)
- `Initialize_WhenLhmThrows_SetsLhmAvailableFalse` — mock/stub Computer.Open failure
- `Refresh_WhenLhmUnavailable_LeavesSentinelsAt_-1f`
- `Refresh_PopulatesCpuTemp_FromPackageSensor`
- `Refresh_FallsBackToCpuCore_WhenPackageAbsent`
- `Dispose_CallsComputerClose`

### P-B AppSettings (FuzzyClock.App.Tests)
- `RoundTrip_TempsLineVisible_PreservesValue`
- `RoundTrip_MissingTempFields_DefaultsPreserved` (backward compat with v4.1 JSON)
- `Validate_TempBools_AlwaysPass` (bools have no validation, ensure ladder doesn't touch them)

### P-C SettingsSnapshot (FuzzyClock.App.Tests)
- `Snapshot_PopulatesTempFieldsFromSettings`
- `Snapshot_CapabilityFlags_FromTempServiceAvailable`

### P-D SettingsWindow (manual/integration)
- Temps tab checkboxes fire events only after `_suppressEvents = false`
- Capability gating disables checkboxes when `TempsServiceAvailable = false`
- Unavailable text visible when service absent

### P-E MainWindow event flow (FuzzyClock.App.Tests)
- `TempCpuVisibleChanged_InvokesSaveAndUpdateDisplay`
- `UpdateTempsDisplay_SkipsSentinels` — only shows enabled AND available sensors

### P-F TempsText layout (visual verification)
- Widget height grows on `TempsLineVisible = true`
- TempsText hides when `StatsVisible = false`

### P-G Right-click menu (manual + test)
- `Grid_MouseRightButtonUp_DoesNotShow_WhenDragging`
- Manual: RMB on widget shows menu at cursor position on primary, secondary, and HiDPI monitors
- Manual: Clicking a menu item from widget-RMB triggers the same action as from tray-RMB

---

## Scaling / Performance Considerations

| Concern | Impact | Mitigation |
|---------|--------|------------|
| LHM `Computer.Open()` cost | 1–3s first-call | `Task.Run(Initialize)`; `IsReady` gate in UI |
| Per-tick Refresh cost | ~2–10ms on typical hardware | Already amortized under existing 1–10s stats interval |
| Sensor walk allocation | new UpdateVisitor each tick? | **Cache UpdateVisitor as static readonly** — visitor is stateless |
| LHM driver load failure | No temps available | Graceful — `-1f` sentinels, capability flag disables Temps tab UI |
| Admin-required fallback | Some sensors unavailable on non-admin | `TempService.Available = true` if at least one sensor reads; per-sensor availability flags drive UI |

**Conclusion:** Single-user desktop widget with 1–10s polling. No scale concerns. Worst case = LHM unavailable → feature silently disables.

---

## Sources

- **PROJECT.md** (project root, 481+ decision log entries) — milestone history through v4.1, service patterns, AppSettings evolution
- **MainWindow.xaml** / **MainWindow.xaml.cs** — StackPanel structure, timer pattern, drag state, event wiring precedent
- **SettingsWindow.xaml** / **SettingsWindow.xaml.cs** — 3-tab structure, 28 `event Action<T>?` precedent, `_suppressEvents` pattern, capability gating
- **SettingsService.cs** — Validate ladder, JsonDocument pre-parse migration pattern
- **StatsService.cs** — canonical async-init / `IsReady` / `-1f` sentinel / try-catch-per-counter pattern
- **TrayMenuBuilder.cs** — single ContextMenuStrip with `Opening` sync event
- **App.xaml.cs** — ApplySettings-before-Show ordering invariant, Dispose on Closing
- **LibreHardwareMonitorLib 0.9.6** (GitHub: LibreHardwareMonitor/LibreHardwareMonitor) — `Computer.Open`, `IVisitor`, `Accept(UpdateVisitor)`, `HardwareType` enum
- **Microsoft Learn** — `Window.PointToScreen(Point)`, `ContextMenuStrip.Show(Point)` coordinate semantics

---
*Architecture research for: v4.2 Temps & Menu — FuzzyStatsClock*
*Researched: 2026-05-04*
