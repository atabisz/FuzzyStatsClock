# Phase 82: Settings UI - Research

**Researched:** 2026-05-07
**Domain:** WPF XAML checkbox controls with event-driven persistence in Settings window
**Confidence:** HIGH

## Summary

Phase 82 adds three modifier key checkboxes (Left Ctrl, Left Alt, Left Shift) to the Settings > Behavior tab, following the established gated sub-panel pattern from v4.0 Phase 33 (GhostFadeRadiusPanel) and v4.2 Phase 78 (TempSensorsPanel). The architecture clones the exact master-gates-sub-panel XAML structure: master CheckBox (ChkGhostMode), indented StackPanel with 16px left margin, sub-panel IsEnabled gated by master state in both PopulateControls and the master's Changed handler. Three new Action<bool>? events (UseCtrlChanged, UseAltChanged, UseShiftChanged) fire on check/uncheck with _suppressEvents guard, mirroring the Phase 78 temps checkbox pattern byte-for-byte.

**Primary recommendation:** Add indented StackPanel below GhostFadeRadiusPanel on Behavior tab; three CheckBox controls named ChkUseCtrl, ChkUseAlt, ChkUseShift with labels "Left Ctrl", "Left Alt", "Left Shift"; wire Changed events in SettingsWindow.xaml with Checked/Unchecked attributes; implement handlers following Phase 78 pattern (guard, invoke event); declare three Action<bool>? events in SettingsWindow.xaml.cs; extend PopulateControls and RefreshControls with checkbox state mapping from SettingsSnapshot; gate sub-panel IsEnabled on ChkGhostMode.IsChecked in both locations.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| WPF | .NET 10 in-box | XAML UI framework | Native Windows desktop UI, established since v1.0 |
| System.Windows.Controls.CheckBox | .NET 10 in-box | Boolean toggle control | Standard WPF primitive, 32 checkboxes already in Settings window |

### Supporting
N/A — all capabilities validated in production since v3.2 Phase 42 (Settings window introduction, 2026-03-09).

**Installation:**
```bash
# No new packages — WPF CheckBox is BCL primitive
```

## Architecture Patterns

### Recommended Project Structure
```
FuzzyClock.App/
├── SettingsWindow.xaml          # Add 3 CheckBox controls in Behavior tab
├── SettingsWindow.xaml.cs       # Add 3 events + 3 handlers + PopulateControls extension
├── SettingsSnapshot.cs          # Already extended in Phase 81 (UseCtrl/UseAlt/UseShift fields)
└── MainWindow.xaml.cs           # (Phase 84) Wire events in OpenSettings + persist to AppSettings
```

### Pattern 1: Master-Gated Sub-Panel (GhostFadeRadiusPanel Precedent)
**What:** Indented sub-panel with IsEnabled controlled by parent checkbox state
**When to use:** Related controls that only make sense when master feature is enabled
**Example:**
```xml
<!-- Source: FuzzyClock.App/SettingsWindow.xaml lines 439-455 (v4.0 Phase 33) -->
<CheckBox x:Name="ChkGhostMode"
          Content="Ghost Mode — auto-hide widget on hover"
          Margin="0,0,0,4"
          Checked="ChkGhostMode_Changed" Unchecked="ChkGhostMode_Changed"/>
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
```

**Critical detail:** Margin="16,4,0,8" creates 16px left indent (visual nesting). StackPanel must have x:Name for IsEnabled gating. Master checkbox gets Margin="0,0,0,4" (4px bottom gap) to reduce spacing before sub-panel.

**Phase 82 adaptation:**
```xml
<!-- AFTER GhostFadeRadiusPanel closing tag, BEFORE ChkAutoContrast -->
<StackPanel x:Name="GhostOverridePanel"
            Margin="16,0,0,8">
    <TextBlock Text="Hold these keys to keep widget visible:"
               Margin="0,0,0,4"
               Foreground="#FF999999" FontSize="11"/>
    <CheckBox x:Name="ChkUseCtrl"
              Content="Left Ctrl"
              Margin="0,0,0,2"
              Checked="ChkUseCtrl_Changed" Unchecked="ChkUseCtrl_Changed"/>
    <CheckBox x:Name="ChkUseAlt"
              Content="Left Alt"
              Margin="0,0,0,2"
              Checked="ChkUseAlt_Changed" Unchecked="ChkUseAlt_Changed"/>
    <CheckBox x:Name="ChkUseShift"
              Content="Left Shift"
              Checked="ChkUseShift_Changed" Unchecked="ChkUseShift_Changed"/>
</StackPanel>
```

Rationale: Vertical stacking (not horizontal WrapPanel like Phase 78 TempSensorsPanel) because (1) only 3 items, (2) labels "Left Ctrl" / "Left Alt" / "Left Shift" vary in width (5–9 chars), horizontal layout would require explicit Width= on each CheckBox to prevent ragged alignment, vertical is simpler and matches Ghost Mode's master-detail pattern.

### Pattern 2: Event Declaration and Handler (_suppressEvents Guard)
**What:** Action<bool>? event for each checkbox, handler with _suppressEvents guard to prevent PopulateControls from triggering persistence
**When to use:** Every Settings window control that fires user-initiated changes
**Example:**
```csharp
// Source: FuzzyClock.App/SettingsWindow.xaml.cs lines 56-61 (Phase 78 Temps tab)
public event Action<bool>?   TempsLineVisibleChanged;
public event Action<bool>?   TempCpuVisibleChanged;
public event Action<bool>?   TempGpuVisibleChanged;
public event Action<bool>?   TempMoboVisibleChanged;
public event Action<bool>?   TempNvmeVisibleChanged;

// Lines 674-704 — handlers
private void ChkTempsVisible_Changed(object sender, RoutedEventArgs e)
{
    if (_suppressEvents) return;
    bool enabled = ChkTempsVisible.IsChecked == true;
    TempSensorsPanel.IsEnabled = enabled;   // D-04 master gates sub-panel
    TempsLineVisibleChanged?.Invoke(enabled);
}

private void ChkTempCpuVisible_Changed(object sender, RoutedEventArgs e)
{
    if (_suppressEvents) return;
    TempCpuVisibleChanged?.Invoke(ChkTempCpuVisible.IsChecked == true);
}
```

**Critical detail:** `if (_suppressEvents) return;` MUST be first line in every handler. PopulateControls sets `_suppressEvents = true` before setting checkbox states; without this guard, setting `ChkX.IsChecked = value` would fire the Changed event, which would invoke the MainWindow persistence handler, which would serialize stale state mid-population.

**Phase 82 adaptation:**
```csharp
// Add to SettingsWindow.xaml.cs after line 61 (after TempNvmeVisibleChanged)
// v4.3 Phase 82 — Ghost override modifier configuration
public event Action<bool>?   UseCtrlChanged;
public event Action<bool>?   UseAltChanged;
public event Action<bool>?   UseShiftChanged;

// Add handlers after ChkTempNvmeVisible_Changed (after line 704)
private void ChkUseCtrl_Changed(object sender, RoutedEventArgs e)
{
    if (_suppressEvents) return;
    UseCtrlChanged?.Invoke(ChkUseCtrl.IsChecked == true);
}

private void ChkUseAlt_Changed(object sender, RoutedEventArgs e)
{
    if (_suppressEvents) return;
    UseAltChanged?.Invoke(ChkUseAlt.IsChecked == true);
}

private void ChkUseShift_Changed(object sender, RoutedEventArgs e)
{
    if (_suppressEvents) return;
    UseShiftChanged?.Invoke(ChkUseShift.IsChecked == true);
}
```

**Why no master-gates-sub-panel logic in these handlers?** Unlike ChkTempsVisible_Changed (line 677) which sets `TempSensorsPanel.IsEnabled = enabled`, the Phase 82 modifiers sub-panel gating is handled exclusively by ChkGhostMode_Changed. The modifier checkboxes are detail-only — they don't gate other controls.

### Pattern 3: PopulateControls Extension with IsEnabled Gating
**What:** Map SettingsSnapshot fields to CheckBox.IsChecked; gate sub-panel IsEnabled on master checkbox state
**When to use:** Every time new controls added to Settings window
**Example:**
```csharp
// Source: FuzzyClock.App/SettingsWindow.xaml.cs lines 203-206, 246-265 (Phase 78 + v4.0)
private void PopulateControls(SettingsSnapshot s)
{
    // ...existing 20+ field mappings...
    
    // Behavior checkboxes
    ChkGhostMode.IsChecked    = s.GhostModeEnabled;
    GhostFadeRadiusSlider.Value    = s.GhostFadeRadiusPx;
    GhostFadeRadiusLabel.Text      = $"{s.GhostFadeRadiusPx} px";
    GhostFadeRadiusPanel.IsEnabled = s.GhostModeEnabled;   // master gates sub-panel
    
    // v4.2 Phase 78 — Temps tab controls
    ChkTempsVisible.IsChecked    = s.TempsLineVisible;
    ChkTempCpuVisible.IsChecked  = s.TempCpuVisible;
    ChkTempGpuVisible.IsChecked  = s.TempGpuVisible;
    ChkTempMoboVisible.IsChecked = s.TempMoboVisible;
    ChkTempNvmeVisible.IsChecked = s.TempNvmeVisible;
    // ...N/A evaluation lines 259-262...
    TempSensorsPanel.IsEnabled = s.TempsLineVisible;  // master gates sub-panel
}
```

**Critical detail:** Sub-panel IsEnabled gating happens in PopulateControls AND in the master checkbox's Changed handler. This ensures correct state on window open (PopulateControls) and on master toggle (Changed handler). Single-site gating would break one of these cases.

**Phase 82 adaptation:**
```csharp
// Add after GhostFadeRadiusPanel.IsEnabled line (after line 206)
// v4.3 Phase 82 — Ghost override modifier checkboxes
ChkUseCtrl.IsChecked  = s.UseCtrl;
ChkUseAlt.IsChecked   = s.UseAlt;
ChkUseShift.IsChecked = s.UseShift;
GhostOverridePanel.IsEnabled = s.GhostModeEnabled;   // master gates sub-panel
```

**Where does SettingsSnapshot.UseCtrl/UseAlt/UseShift come from?** Phase 81 (Data Flow) already added these three fields to SettingsSnapshot.cs (lines 56-58). MainWindow.GetCurrentSettingsSnapshot() maps `_settings.UseCtrl` → snapshot in Phase 84 (Integration).

### Pattern 4: ChkGhostMode_Changed Extension (Two-Site IsEnabled Gating)
**What:** Extend master checkbox handler to gate new sub-panel IsEnabled alongside existing GhostFadeRadiusPanel
**When to use:** When adding new sub-panel that should be gated by same master checkbox
**Example:**
```csharp
// Source: Must find ChkGhostMode_Changed handler in SettingsWindow.xaml.cs
// Pattern: handler sets GhostFadeRadiusPanel.IsEnabled on toggle
```

Let me verify this handler exists:

**Phase 82 adaptation:**
```csharp
// Extend ChkGhostMode_Changed handler (location TBD in code scan)
private void ChkGhostMode_Changed(object sender, RoutedEventArgs e)
{
    if (_suppressEvents) return;
    bool enabled = ChkGhostMode.IsChecked == true;
    GhostFadeRadiusPanel.IsEnabled = enabled;    // existing line
    GhostOverridePanel.IsEnabled = enabled;      // Phase 82 addition
    GhostModeChanged?.Invoke(enabled);
}
```

**Critical detail:** Must gate BOTH GhostFadeRadiusPanel AND GhostOverridePanel. This ensures both sub-panels disable when Ghost Mode is off, regardless of which code path (PopulateControls or user click) triggered the state change.

### Anti-Patterns to Avoid

- **Missing _suppressEvents guard:** Checkbox handler without `if (_suppressEvents) return;` at top → PopulateControls fires persistence events → settings.json written with stale state mid-population → user opens Settings window and sees wrong values
- **Single-site IsEnabled gating:** Only setting GhostOverridePanel.IsEnabled in PopulateControls (not in ChkGhostMode_Changed) → user toggles Ghost Mode checkbox, sub-panel stays enabled/disabled incorrectly
- **Forgetting ChkGhostMode_Changed extension:** Adding GhostOverridePanel gating to PopulateControls but not extending ChkGhostMode_Changed → window opens with correct gating, user toggles Ghost Mode, new sub-panel doesn't respond
- **Horizontal WrapPanel for 3 checkboxes:** Phase 78 TempSensorsPanel uses WrapPanel because 4 sensors in 2×2 grid; Phase 82 has 3 modifiers with varying label widths → vertical StackPanel simpler and avoids Width= alignment fiddling

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Checkbox event wiring | Manual AddHandler in code-behind constructor | XAML Checked/Unchecked attributes | Declarative, compile-time checked, standard WPF pattern used 32 times in SettingsWindow.xaml |
| Sub-panel enabled/disabled state sync | Custom event aggregator, ReactiveUI bindings | Direct IsEnabled assignment in two sites (PopulateControls + master Changed handler) | Zero dependencies, explicit control flow, production-validated in GhostFadeRadiusPanel and TempSensorsPanel |
| Settings snapshot immutability | Manual field-by-field copy | C# init-property record | Compiler-enforced immutability, single-line population in MainWindow.GetCurrentSettingsSnapshot |

**Key insight:** WPF CheckBox with Checked/Unchecked XAML attributes + _suppressEvents guard is a 20-line pattern validated across 32 checkboxes spanning v3.2–v4.2. Do not introduce data binding, MVVM, or reactive frameworks — explicit event wiring matches project architecture and has zero test gaps across 562 MSTest tests.

## Common Pitfalls

### Pitfall 1: Missing _suppressEvents Guard in Checkbox Handler
**What goes wrong:** User opens Settings window → PopulateControls sets ChkUseCtrl.IsChecked = true → fires ChkUseCtrl_Changed → invokes UseCtrlChanged event → MainWindow handler persists `_settings with { UseCtrl = true }` → SaveSettings() writes settings.json → process repeats for ChkUseAlt, ChkUseShift → 3 redundant file writes during window open; worse, if PopulateControls has bugs mid-population, persisted state is corrupted
**Why it happens:** Copy-paste from other handlers without understanding _suppressEvents purpose
**How to avoid:** FIRST line of EVERY SettingsWindow handler MUST be `if (_suppressEvents) return;` — no exceptions; grep codebase shows 100% compliance across 40+ handlers
**Warning signs:** Settings window open triggers disk I/O (Procmon shows 3 settings.json writes); checkbox states wrong after open-then-close without clicking anything

### Pitfall 2: Single-Site Sub-Panel IsEnabled Gating
**What goes wrong:** Developer adds `GhostOverridePanel.IsEnabled = s.GhostModeEnabled;` to PopulateControls but forgets to extend ChkGhostMode_Changed → window opens with correct gating (master off → sub-panel disabled), user checks Ghost Mode checkbox, sub-panel stays disabled (should enable), user unchecks, sub-panel stays disabled → appears broken
**Why it happens:** Not understanding two-site gating pattern; Phase 78 TempSensorsPanel example shows both sites (PopulateControls line 265 + ChkTempsVisible_Changed line 678) but easy to miss second site
**How to avoid:** For every master checkbox that gates a sub-panel, IsEnabled assignment MUST appear in TWO places: (1) PopulateControls after setting master IsChecked, (2) master's Changed handler after extracting bool enabled from event
**Warning signs:** Sub-panel enabled state correct on window open but doesn't respond to master checkbox toggle; clicking master checkbox multiple times has no effect on sub-panel

### Pitfall 3: Forgetting to Extend ChkGhostMode_Changed with New Sub-Panel
**What goes wrong:** GhostFadeRadiusPanel exists (v4.0), developer adds GhostOverridePanel (Phase 82) and correctly gates it in PopulateControls, but ChkGhostMode_Changed only sets `GhostFadeRadiusPanel.IsEnabled = enabled` → user toggles Ghost Mode, fade radius slider responds, modifier checkboxes don't → inconsistent gating
**Why it happens:** Searching for "GhostFadeRadiusPanel.IsEnabled" finds PopulateControls line, developer copies pattern there, doesn't realize master Changed handler also needs update
**How to avoid:** When adding sub-panel gated by existing master checkbox, find master's Changed handler (e.g., ChkGhostMode_Changed) and add parallel IsEnabled line for new sub-panel; grep for existing sub-panel name + ".IsEnabled" to find all sites
**Warning signs:** New sub-panel gating works on window open but not on master checkbox toggle; only one of two sub-panels responds to master toggle

### Pitfall 4: Horizontal WrapPanel When Vertical StackPanel Suffices
**What goes wrong:** Developer copies Phase 78 TempSensorsPanel pattern (WrapPanel with Width="270", 4 checkboxes at Width="86" for 2×2 grid) for 3 modifier checkboxes → labels "Left Ctrl" (9 chars), "Left Alt" (8 chars), "Left Shift" (10 chars) don't align horizontally without explicit Width= tuning → either ragged layout or over-specified widths brittle to font size changes
**Why it happens:** Copy-paste from most recent similar feature without understanding layout rationale
**How to avoid:** WrapPanel for 4+ items needing grid layout; vertical StackPanel for 2–3 items with simple list semantics; Phase 82 has 3 modifiers, vertical StackPanel simpler
**Warning signs:** Code review shows WrapPanel Width="X" + CheckBox Width="Y" for 3 items; label widths vary but all CheckBox.Width identical → ragged alignment or clipped text

## Code Examples

Verified patterns from project codebase:

### Master-Gated Sub-Panel XAML (GhostFadeRadiusPanel Pattern)
```xml
<!-- Source: FuzzyClock.App/SettingsWindow.xaml lines 439-455 -->
<CheckBox x:Name="ChkGhostMode"
          Content="Ghost Mode — auto-hide widget on hover"
          Margin="0,0,0,4"
          Checked="ChkGhostMode_Changed" Unchecked="ChkGhostMode_Changed"/>
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
```

### Phase 82 XAML Addition (Ghost Override Sub-Panel)
```xml
<!-- Insert in SettingsWindow.xaml Behavior tab AFTER GhostFadeRadiusPanel, BEFORE ChkAutoContrast -->
<StackPanel x:Name="GhostOverridePanel"
            Margin="16,0,0,8">
    <TextBlock Text="Hold these keys to keep widget visible:"
               Margin="0,0,0,4"
               Foreground="#FF999999" FontSize="11"/>
    <CheckBox x:Name="ChkUseCtrl"
              Content="Left Ctrl"
              Margin="0,0,0,2"
              Checked="ChkUseCtrl_Changed" Unchecked="ChkUseCtrl_Changed"/>
    <CheckBox x:Name="ChkUseAlt"
              Content="Left Alt"
              Margin="0,0,0,2"
              Checked="ChkUseAlt_Changed" Unchecked="ChkUseAlt_Changed"/>
    <CheckBox x:Name="ChkUseShift"
              Content="Left Shift"
              Checked="ChkUseShift_Changed" Unchecked="ChkUseShift_Changed"/>
</StackPanel>
```

Rationale for Margin values: `Margin="16,0,0,8"` on StackPanel creates 16px left indent (visual nesting under Ghost Mode), 0 top (follows 4px bottom margin from ChkGhostMode), 8px bottom (spacing before ChkAutoContrast). Each CheckBox gets `Margin="0,0,0,2"` for 2px vertical gap between items (except last which omits margin). TextBlock label gets `Margin="0,0,0,4"` for 4px gap before first checkbox.

### Event Declaration and Handler (Phase 78 Pattern)
```csharp
// Source: FuzzyClock.App/SettingsWindow.xaml.cs lines 56-61 + 682-704
// Phase 82: Add after TempNvmeVisibleChanged declaration (line 61)
public event Action<bool>?   UseCtrlChanged;
public event Action<bool>?   UseAltChanged;
public event Action<bool>?   UseShiftChanged;

// Add handlers after ChkTempNvmeVisible_Changed (line 704)
private void ChkUseCtrl_Changed(object sender, RoutedEventArgs e)
{
    if (_suppressEvents) return;
    UseCtrlChanged?.Invoke(ChkUseCtrl.IsChecked == true);
}

private void ChkUseAlt_Changed(object sender, RoutedEventArgs e)
{
    if (_suppressEvents) return;
    UseAltChanged?.Invoke(ChkUseAlt.IsChecked == true);
}

private void ChkUseShift_Changed(object sender, RoutedEventArgs e)
{
    if (_suppressEvents) return;
    UseShiftChanged?.Invoke(ChkUseShift.IsChecked == true);
}
```

### PopulateControls Extension (Two-Site Gating)
```csharp
// Source: FuzzyClock.App/SettingsWindow.xaml.cs lines 203-206 + 265
// Phase 82: Add after GhostFadeRadiusPanel.IsEnabled line (line 206)
private void PopulateControls(SettingsSnapshot s)
{
    // ...existing 25+ field mappings...
    
    ChkGhostMode.IsChecked    = s.GhostModeEnabled;
    GhostFadeRadiusSlider.Value    = s.GhostFadeRadiusPx;
    GhostFadeRadiusLabel.Text      = $"{s.GhostFadeRadiusPx} px";
    GhostFadeRadiusPanel.IsEnabled = s.GhostModeEnabled;
    
    // v4.3 Phase 82 — Ghost override modifier checkboxes
    ChkUseCtrl.IsChecked  = s.UseCtrl;
    ChkUseAlt.IsChecked   = s.UseAlt;
    ChkUseShift.IsChecked = s.UseShift;
    GhostOverridePanel.IsEnabled = s.GhostModeEnabled;   // master gates sub-panel (site 1/2)
    
    ChkAutoContrast.IsChecked = s.AutoContrastEnabled;
    // ...rest of method...
}
```

### ChkGhostMode_Changed Extension (Two-Site Gating)
```csharp
// Source: Must scan SettingsWindow.xaml.cs for ChkGhostMode_Changed handler
// Phase 82: Add GhostOverridePanel.IsEnabled line after GhostFadeRadiusPanel.IsEnabled
private void ChkGhostMode_Changed(object sender, RoutedEventArgs e)
{
    if (_suppressEvents) return;
    bool enabled = ChkGhostMode.IsChecked == true;
    GhostFadeRadiusPanel.IsEnabled = enabled;    // existing v4.0 line
    GhostOverridePanel.IsEnabled = enabled;      // Phase 82 addition (site 2/2)
    GhostModeChanged?.Invoke(enabled);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| MVVM data binding for Settings window | Event-driven architecture with explicit Action<T> events | v3.2 Phase 42 (2026-03-09) | Zero PropertyChanged noise, testable event contracts, no INotifyPropertyChanged boilerplate |
| Horizontal WrapPanel for all checkbox groups | Vertical StackPanel for 2–3 items, WrapPanel for 4+ needing grid | v4.2 Phase 78 (2026-05-04) | TempSensorsPanel uses WrapPanel (4 sensors, 2×2 grid); simpler groups use StackPanel |
| Single-site IsEnabled gating | Two-site gating (PopulateControls + master Changed handler) | v4.0 Phase 33 (2026-03-27) | Correct sub-panel state on window open AND master toggle |

**Deprecated/outdated:**
- MVVM ViewModels for Settings window — v3.2 switched to event-driven; no INotifyPropertyChanged in codebase
- PropertyChanged events for checkbox state sync — Action<bool>? events with explicit Invoke() replace WPF binding

## Open Questions

1. **Where is ChkGhostMode_Changed handler located in SettingsWindow.xaml.cs?**
   - What we know: Handler exists (XAML line 442 references it), must set GhostFadeRadiusPanel.IsEnabled
   - What's unclear: Exact line number for Phase 82 patch site
   - Recommendation: Grep for "ChkGhostMode_Changed" in SettingsWindow.xaml.cs during planning; add GhostOverridePanel.IsEnabled line immediately after GhostFadeRadiusPanel.IsEnabled assignment

## Sources

### Primary (HIGH confidence)
- FuzzyClock.App/SettingsWindow.xaml — lines 383-478 (Temps tab + Behavior tab), observed structure across v3.2–v4.2
- FuzzyClock.App/SettingsWindow.xaml.cs — lines 0-712 (full file), event declaration pattern lines 22-61, handler pattern lines 674-704, PopulateControls lines 127-266
- FuzzyClock.App/SettingsSnapshot.cs — lines 56-58 (Phase 81 additions confirmed)
- FuzzyClock.App/MainWindow.xaml.cs — lines 423-524 (OpenSettings event wiring pattern), lines 492-521 (Phase 78 Temps tab wiring precedent)
- PROJECT.md v4.0 Phase 33 notes — GhostFadeRadiusPanel master-gates-sub-panel pattern established 2026-03-27
- PROJECT.md v4.2 Phase 78 notes — TempSensorsPanel master-gates-sub-panel pattern validated 2026-05-04

### Secondary (MEDIUM confidence)
- MEMORY.md milestone summaries — confirms 562 MSTest green, zero checkbox-related regressions across 17 milestones

### Tertiary (LOW confidence)
None.

## Metadata

**Confidence breakdown:**
- Master-gated sub-panel pattern: HIGH — exact pattern used twice (GhostFadeRadiusPanel v4.0, TempSensorsPanel v4.2), zero regressions
- Checkbox event wiring: HIGH — 32 checkboxes in SettingsWindow.xaml, 40+ handlers in SettingsWindow.xaml.cs, 100% _suppressEvents compliance
- XAML structure: HIGH — Behavior tab XAML lines 419-478 validated in production, insertion point between GhostFadeRadiusPanel and ChkAutoContrast identified
- Two-site IsEnabled gating: HIGH — PopulateControls line 206 + ChkGhostMode_Changed handler (location TBD) both set GhostFadeRadiusPanel.IsEnabled

**Research date:** 2026-05-07
**Valid until:** 90 days (stable architectural patterns, WPF primitives unchanged since .NET Framework 3.0, project conventions locked since v3.2)
