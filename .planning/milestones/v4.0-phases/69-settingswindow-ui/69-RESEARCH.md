# Phase 69: SettingsWindow UI — Research

**Researched:** 2026-03-27
**Domain:** WPF SettingsWindow — Slider control + IsEnabled gating + event wiring + settings persistence
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Fade radius slider as indented sub-panel directly below `ChkGhostMode` with `Margin="16,4,0,8"`. Same structural pattern as `WrapStylePanel`. `IsEnabled` toggled in `ChkGhostMode_Changed` and `RefreshControls()`.
- **D-02:** New event `public event Action<int>? GhostFadeRadiusPxChanged;` on `SettingsWindow`, consistent with all other settings events.
- **D-03:** MainWindow subscription: `_settingsWindow.GhostFadeRadiusPxChanged += v => { _ghostMode.GhostFadeRadiusPx = v; SaveSettings(); };` — same shape as `BackdropOpacityPercentChanged`.
- **D-04:** `ApplySettings()` gap: add `_ghostMode.GhostFadeRadiusPx = s.GhostFadeRadiusPx;` after `_ghostMode.IsEnabled = s.GhostModeEnabled;` (line ~297).
- **D-05:** `SaveSettings()` snapshot must include `GhostFadeRadiusPx = _ghostMode.GhostFadeRadiusPx`.

### Claude's Discretion

- Tick granularity: `TickFrequency="10"` `IsSnapToTickEnabled="True"` `SmallChange="10"` `LargeChange="20"` (10px steps on a 20–200px range = 18 positions).
- Label text: `"Fade Radius"` header label + `"{N} px"` value label (matching `BackdropOpacityLabel` pattern). No description subtext.
- x:Name conventions: `GhostFadeRadiusSlider`, `GhostFadeRadiusLabel`, `GhostFadeRadiusPanel`.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PROX-06 | User can configure proximity fade radius via slider in Settings > Behavior; range 20–200px, default 80px | Slider XAML pattern (BackdropOpacitySlider), event pattern (BackdropOpacityPercentChanged), IsEnabled gating pattern (WrapStylePanel) all verified in source |
| PROX-07 | Fade radius persists to settings.json and restores on launch; Reset to Defaults restores to 80px | AppSettings.GhostFadeRadiusPx already defined with `= 80` default; SaveSettings() `with` pattern verified; ApplySettings() gap identified and patched |
</phase_requirements>

---

## Summary

Phase 69 is a pure UI wiring phase — no new algorithms, no new architectural decisions. Every building block is already in place. `AppSettings.GhostFadeRadiusPx` exists with default 80. `GhostModeController.GhostFadeRadiusPx` is a live-assignable property. The only work is: (1) add XAML for the slider panel in the Behavior tab, (2) add the event declaration and handler in SettingsWindow, (3) wire MainWindow to subscribe and propagate the value, (4) fix the `ApplySettings()` gap so startup correctly loads the persisted radius into the controller, and (5) add the field to `SaveSettings()` and `SettingsSnapshot`.

All five reference patterns exist verbatim in the codebase. `BackdropOpacitySlider` is the exact slider UI pattern. `WrapStylePanel` is the exact `IsEnabled` gating pattern. `BackdropOpacityPercentChanged` is the exact event + MainWindow subscription pattern. This phase is entirely copy-and-adapt — no research into external libraries or patterns is needed.

The `SettingsSnapshot` record is missing `GhostFadeRadiusPx`. It must be added there before `PopulateControls()` can read it. This is the only file not called out explicitly in CONTEXT.md but required for completeness.

**Primary recommendation:** Follow the `BackdropOpacitySlider` + `BackdropOpacityPercentChanged` + `WrapStylePanel` triple-pattern exactly. Five files change: SettingsWindow.xaml, SettingsWindow.xaml.cs, SettingsSnapshot.cs, MainWindow.xaml.cs (ApplySettings + GetCurrentSettingsSnapshot + OpenSettings).

---

## Standard Stack

### Core (already present — no new dependencies)

| Component | Version/Location | Purpose | Why Standard |
|-----------|-----------------|---------|--------------|
| WPF `Slider` | .NET 10 built-in | Range input control | Standard WPF; already used for BackdropOpacitySlider and OpacitySlider |
| `StackPanel` with `IsEnabled` | .NET 10 built-in | Dependency grouping panel | Already established WrapStylePanel pattern |
| `event Action<int>?` | C# delegate | Settings event bus | Consistent with all 30+ existing SettingsWindow events |

### No new packages needed

All required infrastructure (WPF, MSTest, .NET 10) is already in the project. No `npm install` or `dotnet add package` steps.

---

## Architecture Patterns

### Recommended Change Set (6 file edits)

```
FuzzyClock.App/
├── SettingsWindow.xaml        # ADD: GhostFadeRadiusPanel below ChkGhostMode
├── SettingsWindow.xaml.cs     # ADD: event decl, slider handler, ChkGhostMode_Changed update, PopulateControls update
├── SettingsSnapshot.cs        # ADD: GhostFadeRadiusPx property
├── MainWindow.xaml.cs         # PATCH: ApplySettings(), GetCurrentSettingsSnapshot(), OpenSettings()
```

### Pattern 1: Indented Sub-Panel (WrapStylePanel reference)

**What:** A `StackPanel` with left-margin indent gated by its parent checkbox's state.
**When to use:** Any setting that is only meaningful when a parent checkbox is on.

Existing reference (SettingsWindow.xaml.cs, line 600–602):
```csharp
// Source: SettingsWindow.xaml.cs ChkPhraseWrap_Changed handler
private void ChkPhraseWrap_Changed(object sender, RoutedEventArgs e)
{
    if (_suppressEvents) return;
    bool enabled = ChkPhraseWrap.IsChecked == true;
    WrapStylePanel.IsEnabled = enabled;
    PhraseWrapEnabledChanged?.Invoke(enabled);
}
```

Phase 69 adaptation for `ChkGhostMode_Changed` (line ~578):
```csharp
private void ChkGhostMode_Changed(object sender, RoutedEventArgs e)
{
    if (_suppressEvents) return;
    bool enabled = ChkGhostMode.IsChecked == true;
    GhostFadeRadiusPanel.IsEnabled = enabled;   // ADD THIS LINE
    GhostModeChanged?.Invoke(enabled);
}
```

`PopulateControls()` must also set `GhostFadeRadiusPanel.IsEnabled = s.GhostModeEnabled;` so state is correct on window open and on `RefreshControls()` calls.

### Pattern 2: Integer Slider with Value Label (BackdropOpacitySlider reference)

**What:** Slider with snap-to-tick, adjacent TextBlock label updated on ValueChanged.
**When to use:** Any numeric setting with discrete step increments.

Existing XAML reference (SettingsWindow.xaml, lines 395–403):
```xml
<!-- Source: SettingsWindow.xaml BackdropOpacitySlider -->
<Slider x:Name="BackdropOpacitySlider"
        Minimum="10" Maximum="100"
        SmallChange="5" LargeChange="10"
        TickFrequency="5" IsSnapToTickEnabled="True"
        Width="160" VerticalAlignment="Center"
        ValueChanged="BackdropOpacitySlider_ValueChanged"/>
<TextBlock x:Name="BackdropOpacityLabel" Width="36"
           VerticalAlignment="Center" Margin="6,0,0,0"/>
```

Phase 69 adaptation (different Minimum/Maximum/TickFrequency):
```xml
<Slider x:Name="GhostFadeRadiusSlider"
        Minimum="20" Maximum="200"
        SmallChange="10" LargeChange="20"
        TickFrequency="10" IsSnapToTickEnabled="True"
        Width="160" VerticalAlignment="Center"
        ValueChanged="GhostFadeRadiusSlider_ValueChanged"/>
<TextBlock x:Name="GhostFadeRadiusLabel" Width="42"
           VerticalAlignment="Center" Margin="6,0,0,0"/>
```

Existing handler reference (SettingsWindow.xaml.cs, lines 663–668):
```csharp
// Source: SettingsWindow.xaml.cs BackdropOpacitySlider_ValueChanged
private void BackdropOpacitySlider_ValueChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
{
    if (_suppressEvents) return;
    var val = (int)BackdropOpacitySlider.Value;
    BackdropOpacityLabel.Text = $"{val}%";
    BackdropOpacityPercentChanged?.Invoke(val);
}
```

Phase 69 adaptation:
```csharp
private void GhostFadeRadiusSlider_ValueChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
{
    if (_suppressEvents) return;
    var val = (int)GhostFadeRadiusSlider.Value;
    GhostFadeRadiusLabel.Text = $"{val} px";
    GhostFadeRadiusPxChanged?.Invoke(val);
}
```

### Pattern 3: MainWindow Event Subscription (BackdropOpacityPercentChanged reference)

**What:** Inline lambda subscribing to a SettingsWindow event to update live state + persist.
**When to use:** Every settings event wire-up in `OpenSettings()`.

Existing reference (MainWindow.xaml.cs, line 470):
```csharp
// Source: MainWindow.xaml.cs OpenSettings() line ~470
_settingsWindow.BackdropOpacityPercentChanged += p => SetBackdropOpacityPercent(p);
```

Phase 69 (inline lambda, no dedicated method needed):
```csharp
_settingsWindow.GhostFadeRadiusPxChanged += v =>
{
    _ghostMode.GhostFadeRadiusPx = v;
    SaveSettings();
};
```

### Pattern 4: ApplySettings() Gap Fix

**What:** `ApplySettings()` currently does NOT propagate `GhostFadeRadiusPx` to the controller. Without this fix, the persisted value is ignored on launch.

Current state (MainWindow.xaml.cs line ~297):
```csharp
_ghostMode.IsEnabled = s.GhostModeEnabled;
// <-- GhostFadeRadiusPx is NOT loaded here
```

Fix (insert immediately after the line above):
```csharp
_ghostMode.IsEnabled = s.GhostModeEnabled;
_ghostMode.GhostFadeRadiusPx = s.GhostFadeRadiusPx;  // ADD THIS
```

### Pattern 5: GetCurrentSettingsSnapshot() and SaveSettings()

`GetCurrentSettingsSnapshot()` currently does NOT include `GhostFadeRadiusPx` (verified in source). It must be added:
```csharp
GhostFadeRadiusPx = _ghostMode.GhostFadeRadiusPx,
```

`SaveSettings()` uses `_settings with { ... }` — it must also include the field:
```csharp
// In the `with` expression inside SaveSettings():
GhostFadeRadiusPx = _ghostMode.GhostFadeRadiusPx,
```

Note: `AppSettings` already has `GhostFadeRadiusPx { get; init; } = 80` so the JSON round-trip field name is already correct.

### Pattern 6: SettingsSnapshot Gap Fix

`SettingsSnapshot.cs` is missing `GhostFadeRadiusPx`. It must be added:
```csharp
public int GhostFadeRadiusPx { get; init; } = 80;
```

This is needed so `PopulateControls(SettingsSnapshot s)` can read `s.GhostFadeRadiusPx` to initialize the slider.

### Full XAML Block for the Behavior Tab

The slider panel inserts between `ChkGhostMode` and `ChkAutoContrast` in SettingsWindow.xaml (line ~530):

```xml
<!-- Ghost Mode checkbox (existing, lines ~527–530) -->
<CheckBox x:Name="ChkGhostMode"
          Content="Ghost Mode — auto-hide widget on hover"
          Margin="0,0,0,10"
          Checked="ChkGhostMode_Changed" Unchecked="ChkGhostMode_Changed"/>

<!-- Proximity fade radius sub-panel (NEW — Phase 69) -->
<StackPanel x:Name="GhostFadeRadiusPanel"
            Orientation="Horizontal"
            Margin="16,4,0,8">
    <TextBlock Text="Fade Radius" VerticalAlignment="Center" Margin="0,0,8,0"/>
    <Slider x:Name="GhostFadeRadiusSlider"
            Minimum="20" Maximum="200"
            SmallChange="10" LargeChange="20"
            TickFrequency="10" IsSnapToTickEnabled="True"
            Width="160" VerticalAlignment="Center"
            ValueChanged="GhostFadeRadiusSlider_ValueChanged"/>
    <TextBlock x:Name="GhostFadeRadiusLabel" Width="42"
               VerticalAlignment="Center" Margin="6,0,0,0"/>
</StackPanel>

<!-- AutoContrast (existing, line ~531) -->
<CheckBox x:Name="ChkAutoContrast" .../>
```

### Anti-Patterns to Avoid

- **XAML binding for IsEnabled**: Never use `IsEnabled="{Binding ...}"` — the pattern is always code-behind `panel.IsEnabled = condition` (verified: WrapStylePanel, consistent across all existing gated panels).
- **Event without `_suppressEvents` guard**: Every handler starts with `if (_suppressEvents) return;` — the slider handler must include this.
- **Forgetting `RefreshControls`**: `PopulateControls` is the single place that sets slider Value AND panel IsEnabled — `RefreshControls()` calls `PopulateControls()` so both are covered automatically.
- **Setting slider Value before Minimum/Maximum are set**: XAML declaration order handles this; no code-side ordering concern.
- **Mutating `_settings` directly in `SaveSettings`**: The `_settings with { ... }` pattern must be used (immutable record); verified in source.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Slider input control | Custom DrawingVisual or canvas | WPF `Slider` | Already used for BackdropOpacitySlider; snap-to-tick built in |
| Event bus | Custom observer / mediator | `event Action<int>?` | Established pattern across all 30+ SettingsWindow events |
| Settings persistence | Custom serializer | `SaveSettings()` `_settings with { ... }` + SettingsService.Save | Atomic-write JSON already implemented |

**Key insight:** All infrastructure exists. This phase is purely additive — insert new elements into existing patterns without changing any architectural decisions.

---

## Common Pitfalls

### Pitfall 1: Forgetting SettingsSnapshot

**What goes wrong:** `PopulateControls(SettingsSnapshot s)` reads `s.GhostFadeRadiusPx` but if the field is absent from `SettingsSnapshot.cs`, it won't compile (or reads 0 if accidentally omitted with a default).
**Why it happens:** `SettingsSnapshot` and `AppSettings` are separate records; adding to one doesn't auto-add to the other.
**How to avoid:** Add `public int GhostFadeRadiusPx { get; init; } = 80;` to `SettingsSnapshot.cs` as part of this phase.
**Warning signs:** Compile error `'SettingsSnapshot' does not contain a definition for 'GhostFadeRadiusPx'`.

### Pitfall 2: ApplySettings() Gap Persists

**What goes wrong:** Widget launches with default 80px radius regardless of persisted value because `ApplySettings()` never assigns to `_ghostMode.GhostFadeRadiusPx`.
**Why it happens:** The field was added to `AppSettings` in Phase 66 but the load-into-controller line was intentionally deferred to Phase 69.
**How to avoid:** Add `_ghostMode.GhostFadeRadiusPx = s.GhostFadeRadiusPx;` immediately after `_ghostMode.IsEnabled = s.GhostModeEnabled;` in `ApplySettings()`.
**Warning signs:** SC3 (restart test) fails — slider shows correct value but fade radius behaves like 80 even when a different value was saved.

### Pitfall 3: SaveSettings() Missing the Field

**What goes wrong:** Changes to the slider are lost on restart even though `ApplySettings()` was fixed.
**Why it happens:** `SaveSettings()` uses `_settings with { ... }` — if `GhostFadeRadiusPx` is not in the `with` block, it inherits the old persisted value, not the live controller value.
**How to avoid:** Add `GhostFadeRadiusPx = _ghostMode.GhostFadeRadiusPx,` to the `with` block in `SaveSettings()`.
**Warning signs:** Moving slider → saved in session → restart → radius reverts to 80 (or whatever was previously in JSON).

### Pitfall 4: Panel IsEnabled Not Set at Window Open

**What goes wrong:** `GhostFadeRadiusPanel` is enabled even when Ghost Mode is unchecked (or vice versa) when the Settings window first opens.
**Why it happens:** `PopulateControls()` sets slider value but omits the `IsEnabled` line.
**How to avoid:** Add `GhostFadeRadiusPanel.IsEnabled = s.GhostModeEnabled;` to `PopulateControls()` alongside the other control population lines.
**Warning signs:** SC4 fails — slider is interactive when Ghost Mode is unchecked.

### Pitfall 5: TextBlock Label Width Too Narrow

**What goes wrong:** Label clips "200 px" (6 chars) if Width is set to 36 (the BackdropOpacityLabel width used for "100%").
**Why it happens:** "200 px" is wider than "100%". BackdropOpacityLabel uses Width="36" which fits "100%" but not "200 px".
**How to avoid:** Use Width="42" for `GhostFadeRadiusLabel` to accommodate up to "200 px". (Discretion item from CONTEXT.md.)

---

## Code Examples

### Complete PopulateControls additions

```csharp
// Source: SettingsWindow.xaml.cs PopulateControls — add after Backdrop controls block
GhostFadeRadiusSlider.Value           = s.GhostFadeRadiusPx;
GhostFadeRadiusLabel.Text             = $"{s.GhostFadeRadiusPx} px";
GhostFadeRadiusPanel.IsEnabled        = s.GhostModeEnabled;
```

### Complete event declaration

```csharp
// Source: SettingsWindow.xaml.cs — event declarations block (lines 23–54)
// Add after BackdropOpacityPercentChanged:
public event Action<int>? GhostFadeRadiusPxChanged;
```

### Complete slider handler

```csharp
// Source: SettingsWindow.xaml.cs — after BackdropOpacitySlider_ValueChanged
private void GhostFadeRadiusSlider_ValueChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
{
    if (_suppressEvents) return;
    var val = (int)GhostFadeRadiusSlider.Value;
    GhostFadeRadiusLabel.Text = $"{val} px";
    GhostFadeRadiusPxChanged?.Invoke(val);
}
```

### Updated ChkGhostMode_Changed

```csharp
// Source: SettingsWindow.xaml.cs ChkGhostMode_Changed (line ~578)
private void ChkGhostMode_Changed(object sender, RoutedEventArgs e)
{
    if (_suppressEvents) return;
    bool enabled = ChkGhostMode.IsChecked == true;
    GhostFadeRadiusPanel.IsEnabled = enabled;      // NEW
    GhostModeChanged?.Invoke(enabled);
}
```

### ApplySettings fix (MainWindow.xaml.cs ~line 297)

```csharp
_ghostMode.IsEnabled        = s.GhostModeEnabled;
_ghostMode.GhostFadeRadiusPx = s.GhostFadeRadiusPx;  // NEW (Phase 69 gap fix)
```

### GetCurrentSettingsSnapshot addition

```csharp
// Add inside the SettingsSnapshot initializer in GetCurrentSettingsSnapshot():
GhostFadeRadiusPx = _ghostMode.GhostFadeRadiusPx,
```

### SaveSettings addition

```csharp
// Add inside the `_settings with { ... }` block in SaveSettings():
GhostFadeRadiusPx = _ghostMode.GhostFadeRadiusPx,
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Tray menu for radius (submenus) | SettingsWindow slider | Phase 69 design decision | Continuous 20–200px range vs. 3-option submenu |
| External Activate() call from MainWindow | Controller-internal activation | Phase 68 | Phase 69 makes no changes to activation path |

**No deprecated patterns to address in this phase.**

---

## Open Questions

None — the CONTEXT.md provides exhaustive decision coverage. All patterns are verified in source. The only open item is a cosmetic one:

1. **TextBlock label width for "200 px"**
   - What we know: BackdropOpacityLabel uses Width="36" for "100%". "200 px" is one character wider.
   - What's unclear: Whether Width="42" vs Width="48" looks better in the dark theme.
   - Recommendation: Use Width="42" (from Claude's Discretion) — it provides adequate clearance without excess whitespace.

---

## Sources

### Primary (HIGH confidence)

- `FuzzyClock.App/SettingsWindow.xaml` — direct inspection of Behavior tab (lines 507–553), BackdropOpacitySlider pattern (lines 394–403), WrapStylePanel pattern (lines 332–338)
- `FuzzyClock.App/SettingsWindow.xaml.cs` — direct inspection of event declarations (lines 22–54), PopulateControls (lines 77–216), ChkGhostMode_Changed (lines 578–582), ChkPhraseWrap_Changed (lines 597–603), BackdropOpacitySlider_ValueChanged (lines 663–668)
- `FuzzyClock.App/MainWindow.xaml.cs` — direct inspection of ApplySettings() (lines ~295–300), GetCurrentSettingsSnapshot() (lines ~374–406), OpenSettings() event wiring block (lines ~419–480), SaveSettings() (lines ~496–548)
- `FuzzyClock.App/AppSettings.cs` — confirmed `GhostFadeRadiusPx { get; init; } = 80` exists (line 49)
- `FuzzyClock.App/GhostModeController.cs` — confirmed `GhostFadeRadiusPx { get; set; }` property exists (lines 81–85)
- `FuzzyClock.App/SettingsSnapshot.cs` — confirmed `GhostFadeRadiusPx` is ABSENT (all 43 lines inspected); must be added in this phase

### Secondary (MEDIUM confidence)

None required — all findings derived from direct source inspection.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all components verified in existing source; no new libraries
- Architecture: HIGH — all five patterns verified verbatim in source files
- Pitfalls: HIGH — identified from direct source gaps (missing SettingsSnapshot field, missing ApplySettings line, missing SaveSettings field)

**Research date:** 2026-03-27
**Valid until:** N/A — tied to project source state; re-read source if any of the five files change before implementation
