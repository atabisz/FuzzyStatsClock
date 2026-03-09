# Phase 42: Settings Window Infrastructure - Research

**Researched:** 2026-03-08
**Domain:** WPF modeless window, tabbed UI, event-driven live-apply, tray menu restructuring
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Window look & feel
- Native WPF window with standard Windows chrome (title bar, close button, system fonts) — no custom styling
- Fixed size ~480×440px, non-resizable
- Centered on screen on first open; remembers last position across opens within a session (standard WPF behavior)
- Modeless — Owner=MainWindow, widget remains fully interactive while Settings is open
- Opening Settings a second time brings the existing window to front (no duplicate)

#### Control choices — Appearance tab
- **Accent color**: Row of 5 clickable color swatches (matching current presets: White, Cyan, Purple, Green, Red) + [Custom...] button that opens the existing Windows Forms ColorDialog
- **Opacity**: Horizontal slider (20%–100%) with a live percentage label to the right
- **Font size**: Toggle button group: [S] [M] [L] [XL] — same four sizes as current tray menu
- **Clock style**: Toggle button group: [Phrase] [Dial]
- **Phrase style**: Dropdown with "Classic" as the only option — wired to AppSettings.PhraseStyle; Phase 45 adds Terse/Poetic/Rude to the dropdown

#### Control choices — Stats tab
- **Per-row visibility**: Standard WPF CheckBox for each stat row (CPU, GPU, Memory, Paging, Battery)
- **Update interval**: Dropdown or radio buttons matching existing tray submenu options
- **Process count threshold**: Radio buttons (2% / 5% / 10%) matching existing tray submenu
- **Date visibility**: CheckBox (Show Date)
- **Date format**: Dropdown (Short / Long / Numeric / ISO) matching existing tray submenu

#### Control choices — Behavior tab
- **Ghost Mode**: CheckBox
- **Auto-Contrast**: CheckBox
- **Auto-Launch at Login**: CheckBox
- Battery alert threshold placeholder reserved for Phase 44

#### Tray menu pruning
- Add "Open Settings..." as the first item (separator below it)
- Remove deep submenus: Accent Color submenu, Font Size submenu, Date Format submenu, Stats per-row submenu, Update Interval submenu, Process Threshold submenu
- Retain as checkable quick toggles: Ghost Mode, Show Stats, Auto-Contrast, Auto-Launch
- Retain: Reset to Defaults, Quit
- Final tray menu structure:
  ```
  Open Settings...
  ─────────────────
  [✓] Ghost Mode
  [✓] Show Stats
  [✓] Auto-Contrast
  [✓] Auto-Launch
  ─────────────────
  Reset to Defaults
  Quit
  ```

#### Tab content scope
- Phase 42 builds all three tabs fully wired (delivers SETT-01 through SETT-07)
- Downstream phases add new controls to existing tabs:
  - Phase 43 adds Theme selector to Appearance tab
  - Phase 44 adds Battery Alert threshold to Behavior tab
  - Phase 45 adds Terse/Poetic/Rude options to the already-present Phrase Style dropdown

#### Live-apply wiring
- Every control change fires a SettingsChanged event (or calls a delegate) immediately
- MainWindow handles the event by calling ApplySettings() + SaveSettings()
- No Apply/OK/Cancel buttons — consistent with existing tray-menu behavior

### Claude's Discretion
- Exact WPF layout (Grid vs StackPanel vs UniformGrid per section)
- Grouping of controls within each tab (GroupBox headers or plain separators)
- Exact slider tick marks and snap behavior for opacity
- Label alignment and padding

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SETT-01 | User can open a Settings window via "Open Settings..." item in the system tray menu | TrayMenuBuilder rebuild pattern + `_settingsWindow?.Show(); _settingsWindow?.Activate()` singleton guard |
| SETT-02 | Settings window has three tabs — Appearance, Stats, and Behavior | WPF `TabControl` with three `TabItem` children, native chrome |
| SETT-03 | Appearance tab exposes accent color, opacity, font size, clock style, phrase style, and theme selector controls | Swatch `Border` + click handler, WPF `Slider`, toggle `Button` groups, `ComboBox` |
| SETT-04 | Stats tab exposes per-row visibility toggles, update interval, process count threshold, and date format controls | WPF `CheckBox`, `ComboBox`, `RadioButton` groups matching existing AppSettings fields |
| SETT-05 | Behavior tab exposes ghost mode, auto-contrast, auto-launch, and battery alert threshold controls | WPF `CheckBox` bindings; battery alert placeholder reserved for Phase 44 |
| SETT-06 | All settings changes apply immediately to the live widget (modeless; no Apply button needed) | `SettingsChanged` event on `SettingsWindow`, subscribed by `MainWindow`, calls `ApplySettings()` + `SaveSettings()` |
| SETT-07 | Tray menu retains existing quick toggles (Ghost Mode, Stats, Auto-Contrast, Auto-Launch) alongside "Open Settings..." | Rebuild `TrayMenuBuilder` with pruned menu; remove all deep submenus; keep four checkable quick toggles |
</phase_requirements>

---

## Summary

Phase 42 is a large WPF UI construction task. The core work is: (1) create a `SettingsWindow` XAML file with a `TabControl` carrying three tabs, (2) wire every control so that changes are communicated back to `MainWindow` without the window writing to `AppSettings` directly, and (3) rebuild `TrayMenuBuilder` into a much simpler 8-item menu. The existing architecture—`TrayMenuCallbacks` record passing `Action` delegates, `ApplySettings()` / `SaveSettings()` on `MainWindow`—maps directly onto the new pattern: `SettingsWindow` fires a `SettingsChanged` event (or invokes a delegate set) and `MainWindow` reacts by calling its existing helper methods.

The singleton guard for "bring-to-front instead of duplicate open" is straightforward standard WPF: keep a nullable `SettingsWindow?` field, check `null`/`IsClosed` on each open request, and call `Activate()` if already open. The window's `Closed` event clears the field. No architectural novelty is required; this phase is primarily XAML layout work plus event wiring.

The tray restructure is a net simplification: `TrayMenuBuilder` currently manages ~43 `ToolStripMenuItem` references and a large `SyncCheckmarks` method; after pruning it will manage roughly 8 items. The removed submenus (Accent Color, Font Size, Date Format, Stats per-row, Update Interval, Process Threshold, Dial Face, Text Style, Opacity) are replaced by the Settings window. `TrayMenuState` and `TrayMenuCallbacks` records will also shrink accordingly.

**Primary recommendation:** Build `SettingsWindow` as a standard WPF `Window` (`.xaml` + `.xaml.cs` in `FuzzyClock.App`), using a `SettingsChanged` event with a payload type that carries only the field that changed (or use individual `Action<T>` delegates matching the existing `TrayMenuCallbacks` pattern). Rebuild `TrayMenuBuilder` as the last step to avoid breaking the app mid-phase.

---

## Standard Stack

### Core
| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| WPF `TabControl` / `TabItem` | .NET 10 inbox | Three-tab layout | Built-in, native chrome, no NuGet needed |
| WPF `Window` | .NET 10 inbox | Modeless settings host | Standard; `Owner`, `ShowInTaskbar=False`, `ResizeMode=NoResize` |
| WPF `Slider` | .NET 10 inbox | Opacity control (20%–100%) | Built-in continuous input |
| WPF `CheckBox` | .NET 10 inbox | Boolean toggles (Ghost Mode, stat rows, etc.) | Standard boolean control |
| WPF `ComboBox` | .NET 10 inbox | Date format, update interval, phrase style dropdowns | Standard discrete selection |
| WPF `RadioButton` | .NET 10 inbox | Process threshold (2%/5%/10%), exclusive selection | Standard mutually-exclusive choice |
| WPF `Button` (toggle group) | .NET 10 inbox | Font size (S/M/L/XL), Clock style (Phrase/Dial) | Styled buttons with `IsEnabled`/`Background` state |

### Supporting
| Component | Version | Purpose | When to Use |
|-----------|---------|---------|-------------|
| `System.Windows.Forms.ColorDialog` | .NET 10 (WinForms) | Custom accent color picker | Already in use via `UseWindowsForms=true` in project |
| `Win32Window : IWin32Window` adapter | Project-local | Prevents `ColorDialog` appearing behind `Topmost` windows | Already implemented in codebase |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Individual `Action<T>` delegates (TrayMenuCallbacks pattern) | Single `SettingsChangedArgs` event | Event with discriminated union is cleaner for many fields but adds complexity; delegate set matches existing pattern in codebase |
| Populate-on-open (read current MainWindow state at open time) | Two-way data binding to AppSettings | Data binding risks circular updates; populate-on-open is already the stated pattern from STATE.md decisions |

**No NuGet packages needed — all controls are WPF inbox.**

---

## Architecture Patterns

### Recommended Project Structure
```
FuzzyClock.App/
├── SettingsWindow.xaml          # New — 3-tab settings UI
├── SettingsWindow.xaml.cs       # New — code-behind, SettingsChanged event
├── TrayMenuBuilder.cs           # Existing — REBUILD with pruned menu (8 items)
├── MainWindow.xaml.cs           # Existing — add OpenSettings(), subscribe SettingsChanged
├── AppSettings.cs               # Existing — add PhraseStyle field ("Classic" default)
```

### Pattern 1: Singleton Modeless Window
**What:** A nullable field on `MainWindow` holds the single `SettingsWindow` instance. Opening checks null and `IsVisible`; if open, calls `Activate()` to bring to front.
**When to use:** Any modeless utility window that should not duplicate.
**Example:**
```csharp
// MainWindow.xaml.cs
private SettingsWindow? _settingsWindow;

private void OpenSettings()
{
    if (_settingsWindow is { IsVisible: true })
    {
        _settingsWindow.Activate();
        return;
    }
    _settingsWindow = new SettingsWindow(GetCurrentSettingsSnapshot());
    _settingsWindow.Owner = this;
    _settingsWindow.SettingsChanged += OnSettingsChanged;
    _settingsWindow.Closed += (_, _) => _settingsWindow = null;
    _settingsWindow.Show();
}
```

### Pattern 2: Populate-on-Open, No Live Back-Sync
**What:** When `SettingsWindow` opens, its controls are initialized from the current `MainWindow` state snapshot. Changes flow OUT (window → MainWindow) only. If the user changes a tray toggle while Settings is open, the Settings window does NOT update its checkboxes — it only reflects state at open time.
**When to use:** Avoids circular update loops; accepted tradeoff per STATE.md decision log.
**Implementation:** Pass a `SettingsSnapshot` (struct or record) to the `SettingsWindow` constructor; window reads it once during `Loaded` or constructor to populate controls.

### Pattern 3: SettingsChanged Event Pattern
**What:** `SettingsWindow` exposes a `SettingsChanged` event. The event args carry a discriminated delta — easiest approach is one event per setting type, matching how `TrayMenuCallbacks` already works (individual `Action<T>`).
**When to use:** Keeps `SettingsWindow` ignorant of `MainWindow` internals; testable in isolation.
**Example:**
```csharp
// SettingsWindow.xaml.cs — one delegate per setting type (mirrors TrayMenuCallbacks)
public event Action<System.Windows.Media.Color>? AccentColorChanged;
public event Action<double>? OpacityChanged;
public event Action<int>? FontSizeChanged;
public event Action<bool>? DialModeChanged;
public event Action<string>? PhraseStyleChanged;
public event Action<bool>? CpuVisibleChanged;
// ... etc for each control

// Slider ValueChanged example:
private void OpacitySlider_ValueChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
{
    double v = Math.Round(e.NewValue, 2);
    OpacityLabel.Text = $"{(int)(v * 100)}%";
    OpacityChanged?.Invoke(v);
}
```

Alternatively, wrap all in a single `SettingsChanged` event with a settings delta record — acceptable either way. The individual-event pattern mirrors `TrayMenuCallbacks` and is consistent with how MainWindow already handles each setting.

### Pattern 4: Accent Color Swatches
**What:** Five `Border` elements in a `StackPanel`, each with a fixed `Background` matching a preset color and a `MouseLeftButtonDown` handler. "Custom..." is a `Button` that invokes `OpenCustomColorDialog()`.
**When to use:** Matches the CONTEXT.md control spec; avoids a heavy color-picker library.
**Example:**
```csharp
// SettingsWindow.xaml — swatch row
<StackPanel Orientation="Horizontal" Margin="0,4">
    <Border Width="24" Height="24" Background="#FFFFFFFF" Margin="2,0"
            Cursor="Hand" MouseLeftButtonDown="SwatchWhite_Click" />
    <Border Width="24" Height="24" Background="#FFFFE87C" Margin="2,0"
            Cursor="Hand" MouseLeftButtonDown="SwatchAmber_Click" />
    <!-- ... -->
    <Button Content="Custom..." Margin="8,0,0,0" Click="CustomColor_Click" />
</StackPanel>
```

### Pattern 5: Toggle Button Group (Font Size, Clock Style)
**What:** A row of `Button` controls where exactly one is visually "active". No radio-button behavior built into `Button` — manage manually by updating `IsEnabled` or a custom boolean attached property, or by toggling a visual state.
**When to use:** Matches the CONTEXT.md spec for S/M/L/XL and Phrase/Dial groups.
**Implementation approach:** Set a unique style for "active" state using `Background` or `BorderBrush` change in code-behind. On click, update the backing field, fire the event, and refresh button appearances. Simpler than custom control.

```csharp
private void SetFontSizeButtonStates(int size)
{
    BtnFontS.FontWeight  = size == 16 ? FontWeights.Bold : FontWeights.Normal;
    BtnFontM.FontWeight  = size == 24 ? FontWeights.Bold : FontWeights.Normal;
    BtnFontL.FontWeight  = size == 32 ? FontWeights.Bold : FontWeights.Normal;
    BtnFontXL.FontWeight = size == 40 ? FontWeights.Bold : FontWeights.Normal;
}
```

### Pattern 6: Pruned TrayMenuBuilder
**What:** After pruning, `TrayMenuBuilder` manages only 8 items + 2 separators. `TrayMenuState` shrinks to 4 boolean fields. `TrayMenuCallbacks` keeps only `ToggleGhostMode`, `ToggleStatsVisible`, `ToggleAutoContrast`, `ToggleAutoLaunch`, `OpenSettings`, `ResetToDefaults`, `Quit`.
**When to use:** The final step in the phase — after SettingsWindow is fully wired and all settings are accessible through it.

### Anti-Patterns to Avoid
- **Opening Settings on WinForms thread:** The tray icon click fires on the WinForms thread. Always wrap `OpenSettings()` in `Dispatcher.Invoke(() => OpenSettings())` before calling any WPF code.
- **Writing AppSettings directly from SettingsWindow:** `SettingsWindow` must fire events; `MainWindow` calls `ApplySettings()` + `SaveSettings()`. This keeps `MainWindow` as the single owner of widget state.
- **Calling `ApplySettings()` with full settings object from SettingsWindow:** `SettingsWindow` only knows about individual changed values. Pass deltas; MainWindow applies them via existing `SetAccentColor()`, `ApplyFontSize()`, etc. helpers.
- **Setting `WindowStartupLocation="CenterScreen"` with no position memory:** `CenterScreen` fires once at Show(). After close/reopen, WPF remembers `Left`/`Top` automatically (no persistence needed for within-session position). This is correct per the CONTEXT.md spec.
- **Pruning the tray menu before SettingsWindow is wired:** If you rebuild TrayMenuBuilder first, the removed submenus are gone before their replacements exist in Settings. Build SettingsWindow first, confirm all settings are accessible, then prune the tray.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tab layout | Custom Grid-based tab simulation | WPF `TabControl` / `TabItem` | Built-in keyboard nav, accessibility, focus management |
| Color picker | Custom color picker control | Existing `System.Windows.Forms.ColorDialog` (already wired in codebase) | Already implemented and working; no additional code needed |
| Singleton window management | Complex window registry | `private SettingsWindow? _settingsWindow` field + `Closed` event clear | Trivial and sufficient for one settings window |
| Settings delta tracking | Dirty-flag infrastructure | Fire event on every control change | Live-apply means no delta needed; every change fires immediately |

**Key insight:** Every control in this phase maps to an existing `TrayMenuCallbacks` action already wired in `MainWindow`. The Settings window is a UI wrapper around calls that already exist and work.

---

## Common Pitfalls

### Pitfall 1: Tray Click Thread vs WPF Thread
**What goes wrong:** `NotifyIcon` click events fire on the WinForms thread. Directly calling `new SettingsWindow()` or `_settingsWindow.Activate()` from the click handler crashes with a cross-thread access exception.
**Why it happens:** WPF objects have thread affinity; `SettingsWindow` is a WPF `Window` owned by the UI thread.
**How to avoid:** Wrap the `OpenSettings` call in `Dispatcher.Invoke()` — exactly as all existing tray callbacks do.
**Warning signs:** `InvalidOperationException: The calling thread cannot access this object because a different thread owns it.`

### Pitfall 2: SettingsWindow Swatches Fire Before Initialized
**What goes wrong:** `ValueChanged` on the Slider fires during control initialization when `Value` is set programmatically from the constructor snapshot, causing premature `SettingsChanged` events before the window is ready.
**Why it happens:** WPF data flow fires change notifications during property sets, including in constructor/Loaded.
**How to avoid:** Use a `_suppressEvents` bool flag set to `true` during `PopulateControls()` and cleared after. Or subscribe event handlers only after population completes.
**Warning signs:** Widget accent color flickers on Settings window open; rapid `SaveSettings()` calls at open time.

### Pitfall 3: Opacity Slider Fractional Precision
**What goes wrong:** Slider's `double` value accumulates floating-point imprecision; `_opacity50.Checked = (s.WindowOpacity == 0.50)` in the pruned tray sync can fail to match.
**Why it happens:** `0.50` from slider arithmetic may be `0.4999...` or `0.5000...1`.
**How to avoid:** Round slider value to 2 decimal places before firing `OpacityChanged`. Existing tray sync already uses exact comparison — this only matters if the slider can set values between presets (which it can, since it's continuous). Since tray no longer has preset checkmarks, this issue goes away for the tray. For the slider value label, rounding to nearest integer percent is sufficient.
**Warning signs:** Label shows `49%` when user drags to `50%` position.

### Pitfall 4: Font Size "XL" Not in Current Tray Menu
**What goes wrong:** The CONTEXT.md spec says "four sizes as current tray menu" but the current tray has only three items (Small/16, Medium/24, Large/32). The spec also mentions "XL". The tray has `_fontSmall` (16), `_fontMedium` (24), `_fontLarge` (32) — no XL.
**Why it happens:** CONTEXT.md says [S] [M] [L] [XL] — XL is a new fourth size being added by this phase.
**How to avoid:** Define XL = 40pt (consistent with other font increments of 8pt). Wire `ApplyFontSize(40)` for the XL button. No existing SaveSettings path breaks since FontSize is just stored as int.
**Warning signs:** XL button does nothing visible; font doesn't change; test by clicking XL and observing phrase size.

### Pitfall 5: AppSettings Missing PhraseStyle Field
**What goes wrong:** The Phrase Style `ComboBox` in Appearance tab needs to read and write `AppSettings.PhraseStyle`. The current `AppSettings` record has `TextStyle` but no `PhraseStyle` field.
**Why it happens:** `AppSettings` was built before PhraseStyle was specced. The field doesn't exist yet.
**How to avoid:** Add `public string PhraseStyle { get; init; } = "Classic";` to `AppSettings` in this phase. `SettingsService` will round-trip it correctly because it's an init-property record with a default.
**Warning signs:** Compiler error referencing `AppSettings.PhraseStyle`; or field silently ignored on load.

### Pitfall 6: TrayMenuBuilder Prune Breaks Existing Callbacks
**What goes wrong:** `TrayMenuCallbacks` has ~25 required `Action` properties. If you prune them without updating all three parties (callbacks record, MainWindow wiring, TrayMenuBuilder.Build), compiler errors or null-ref exceptions result.
**Why it happens:** `TrayMenuCallbacks` uses `required` keyword — missing any init property is a compile error.
**How to avoid:** Update all three in lockstep: remove from `TrayMenuCallbacks` → remove from `Build()` → remove the Dispatcher.Invoke wiring in `ContentRendered`. Do this as the last wave of the phase.
**Warning signs:** Build fails with "required member not set" or "does not contain a definition for" errors.

### Pitfall 7: Window Position on Re-open Within Session
**What goes wrong:** Developer sets `WindowStartupLocation="CenterScreen"` which fires at Show() time. On second open (after close), the window re-centers instead of appearing at last position.
**Why it happens:** `CenterScreen` recalculates every Show(). WPF only remembers `Left`/`Top` if `WindowStartupLocation="Manual"` and they are not NaN.
**How to avoid:** Use `WindowStartupLocation="CenterScreen"` — this is actually correct for *first* open (CONTEXT.md: "centered on screen on first open; remembers last position across opens within a session"). For within-session re-open: after the first close, the `Left`/`Top` are already set on the class fields. On second `new SettingsWindow()`, set `WindowStartupLocation="Manual"` and restore `Left`/`Top` from the previous instance. Alternatively: keep a static `Point? _lastPosition` on `SettingsWindow`; set it in `Closing`; apply in constructor if non-null.

---

## Code Examples

### Singleton Open Pattern
```csharp
// MainWindow.xaml.cs — called from tray "Open Settings..." click
private SettingsWindow? _settingsWindow;

private void OpenSettings()
{
    // Must be called on Dispatcher thread (tray caller wraps in Dispatcher.Invoke)
    if (_settingsWindow is { IsVisible: true })
    {
        _settingsWindow.Activate();
        return;
    }
    _settingsWindow = new SettingsWindow(GetCurrentSettingsSnapshot());
    _settingsWindow.Owner = this;
    _settingsWindow.SettingsChanged += OnSettingsWindowChange;
    _settingsWindow.Closed += (_, _) => _settingsWindow = null;
    _settingsWindow.Show();
}
```

### SettingsWindow Constructor + Suppress Events
```csharp
// SettingsWindow.xaml.cs
private bool _suppressEvents;

public SettingsWindow(SettingsSnapshot snapshot)
{
    InitializeComponent();
    _suppressEvents = true;
    PopulateControls(snapshot);
    _suppressEvents = false;
}

private void PopulateControls(SettingsSnapshot s)
{
    OpacitySlider.Value = s.Opacity;
    OpacityLabel.Text   = $"{(int)(s.Opacity * 100)}%";
    // ... populate all controls from snapshot
}
```

### SettingsSnapshot Record (new type in this phase)
```csharp
// SettingsSnapshot.cs — read-only snapshot passed to SettingsWindow constructor
internal sealed record SettingsSnapshot
{
    public System.Windows.Media.Color AccentColor  { get; init; }
    public double   Opacity            { get; init; }
    public int      FontSize           { get; init; }
    public bool     DialMode           { get; init; }
    public string   PhraseStyle        { get; init; } = "Classic";
    public bool     CpuVisible         { get; init; }
    public bool     GpuVisible         { get; init; }
    public bool     MemVisible         { get; init; }
    public bool     PagVisible         { get; init; }
    public bool     BatteryVisible     { get; init; }
    public bool     UptimeVisible      { get; init; }
    public int      StatsIntervalSeconds { get; init; }
    public double   ProcessCountThreshold { get; init; }
    public bool     ShowDate           { get; init; }
    public string   DateFormat         { get; init; } = "Short";
    public bool     GhostModeEnabled   { get; init; }
    public bool     AutoContrastEnabled { get; init; }
    public bool     AutoLaunchEnabled  { get; init; }
    public bool     StatsVisible       { get; init; }
}
```

### Pruned TrayMenuCallbacks (post-phase shape)
```csharp
internal sealed class TrayMenuCallbacks
{
    public required Action ToggleGhostMode    { get; init; }
    public required Action ToggleStatsVisible { get; init; }
    public required Action ToggleAutoContrast { get; init; }
    public required Action ToggleAutoLaunch   { get; init; }
    public required Action OpenSettings       { get; init; }
    public required Action ResetToDefaults    { get; init; }
    public required Action Quit               { get; init; }
}
```

### Pruned TrayMenuState (post-phase shape)
```csharp
internal sealed record TrayMenuState
{
    public bool GhostModeEnabled    { get; init; }
    public bool StatsVisible        { get; init; }
    public bool AutoContrastEnabled { get; init; }
    public bool AutoLaunchEnabled   { get; init; }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Tray-only settings (~43 menu items) | Settings window + minimal tray quick toggles | Phase 42 | Users no longer hunt through nested submenus |
| No `SettingsSnapshot` type | `SettingsSnapshot` record separates read-only state from mutable fields | Phase 42 | `SettingsWindow` is decoupled from `AppSettings` internals |

**Deprecated/outdated after this phase:**
- `TrayMenuCallbacks` properties for `ApplyFontSize`, `SetAccentColor`, `OpenCustomColorDialog`, `SetOpacity`, `SetTextStyle`, `ToggleDateVisible`, `SetDateFormat`, `ToggleCpuVisible`, `ToggleGpuVisible`, `ToggleMemVisible`, `TogglePagVisible`, `ToggleBattVisible`, `ToggleUptimeVisible`, `SetStatsInterval`, `SetProcessThreshold`, `ToggleDialMode`, `ToggleShowHourTicks`, `ToggleShowMinuteDots`, `ToggleShowHourNumbers` — all removed from tray; moved to Settings window.
- `TrayMenuState` fields beyond the 4 quick-toggle booleans — removed.
- Most of `SyncCheckmarks()` body — only 4 lines remain after pruning.

---

## Open Questions

1. **XL font size value**
   - What we know: Current tray has S=16, M=24, L=32. CONTEXT.md spec adds XL as fourth button.
   - What's unclear: Is XL=40pt the intended value?
   - Recommendation: Use 40pt (consistent 8pt step). If wrong, it's a one-line change.

2. **AppSettings.PhraseStyle vs AppSettings.TextStyle naming**
   - What we know: `AppSettings.TextStyle` exists with values "Classic"/"Split"/"Literary"/"Mono". CONTEXT.md calls the new Phrase 42 field "PhraseStyle". These are different dimensions.
   - What's unclear: Should the Settings window's Phrase Style dropdown write to a new `PhraseStyle` field, or repurpose `TextStyle`?
   - Recommendation: Add a separate `PhraseStyle` field to `AppSettings` (default "Classic"). `TextStyle` governs layout; `PhraseStyle` will govern vocabulary (Phase 45). Keep them separate to avoid a breaking migration.

3. **Stats tab "Show Stats" visibility toggle**
   - What we know: CONTEXT.md lists "per-row visibility" checkboxes for CPU/GPU/Mem/Pag/Battery. The tray retains "Show Stats" as a quick toggle.
   - What's unclear: Should the Stats tab also include a "Show Stats Panel" master toggle, or only per-row?
   - Recommendation: Include "Show Stats Panel" as the first checkbox in the Stats tab for completeness; it maps to `StatsVisible` which is already in `AppSettings`.

---

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `TrayMenuBuilder.cs`, `AppSettings.cs`, `MainWindow.xaml.cs` — direct read of current implementation
- `42-CONTEXT.md` — user-locked decisions
- `REQUIREMENTS.md` SETT-01–07 — authoritative requirement text
- WPF `TabControl`/`Window` — .NET 10 inbox, no version ambiguity

### Secondary (MEDIUM confidence)
- Pattern guidance derived from existing code patterns (`TrayMenuCallbacks`, `Dispatcher.Invoke`, `Win32Window` adapter) — patterns proven in phases 24–41

### Tertiary (LOW confidence)
- XL font size = 40pt: inferred from arithmetic pattern, not explicitly stated in requirements

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all WPF inbox controls, no NuGet needed
- Architecture: HIGH — patterns directly derived from existing codebase conventions
- Pitfalls: HIGH — derived from direct codebase reading (Dispatcher requirement, `required` keyword, `_suppressEvents` pattern)

**Research date:** 2026-03-08
**Valid until:** 2026-04-08 (stable WPF; only risk is upstream phase 41 refactoring changing PhraseEngine API)
