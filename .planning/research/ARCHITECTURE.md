# Architecture Patterns: Configurable Ghost Override Modifiers

**Domain:** Settings persistence and runtime modifier detection for Ghost Mode suppression
**Researched:** 2026-05-07

## Recommended Architecture

### Data Flow

```
┌───────────────────────────┐
│  SettingsWindow           │
│  (3 CheckBoxes)           │
└──────────┬────────────────┘
           │ Event: Action<bool>
           │ (one per checkbox)
           ▼
┌───────────────────────────┐
│  MainWindow               │
│  - Subscribes to events   │
│  - Updates _settings      │
│  - Calls SaveSettings()   │
│  - Updates controller     │
└──────────┬────────────────┘
           │ Property: ModifierConfig
           │ (struct: 3 bools)
           ▼
┌───────────────────────────┐
│  GhostModeController      │
│  - Receives config        │
│  - IsCtrlAltHeld() checks │
│    enabled modifiers      │
└───────────────────────────┘
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `AppSettings` | Immutable config record; adds 3 bool fields: `GhostOverrideUseCtrl`, `GhostOverrideUseAlt`, `GhostOverrideUseShift` | `SettingsService` (serialize/deserialize) |
| `SettingsSnapshot` | Immutable open-time snapshot; adds 3 bool fields mirroring `AppSettings` | `SettingsWindow` (populate-on-open), `MainWindow` (GetCurrentSettingsSnapshot) |
| `SettingsWindow` | New sub-panel in Behavior tab (below GhostFadeRadiusPanel); 3 CheckBoxes; fires 3 events: `GhostOverrideUseCtrlChanged`, `GhostOverrideUseAltChanged`, `GhostOverrideUseShiftChanged` | `MainWindow` (event subscription) |
| `MainWindow` | Event handlers update `_settings` via `with` expression and call `SaveSettings()` immediately (Phase 78 pattern); updates `GhostModeController.ModifierConfig` to propagate to runtime detection | `GhostModeController` (ModifierConfig property) |
| `GhostModeController` | Receives `ModifierConfig` struct (3 bools) via setter; `IsCtrlAltHeld()` refactored to check `GetAsyncKeyState` for enabled modifiers only; all three false → always returns false (override disabled) | `MainWindow` (ProximityChanged event, ModifierConfig consumer) |

### Persistence Integration

**Existing pattern (from Phase 78 `TempXVisible` fields):**

```csharp
// 1. AppSettings: add init-property with explicit default
public record AppSettings {
    public bool GhostOverrideUseCtrl { get; init; } = true,
    public bool GhostOverrideUseAlt { get; init; } = true,
    public bool GhostOverrideUseShift { get; init; } = false,
    // ... existing fields
}

// 2. SettingsSnapshot: mirror fields
public record SettingsSnapshot(
    bool GhostOverrideUseCtrl,
    bool GhostOverrideUseAlt,
    bool GhostOverrideUseShift,
    // ... existing fields
);

// 3. MainWindow.GetCurrentSettingsSnapshot: add 3 mappings
var snapshot = new SettingsSnapshot(
    GhostOverrideUseCtrl: _settings.GhostOverrideUseCtrl,
    GhostOverrideUseAlt: _settings.GhostOverrideUseAlt,
    GhostOverrideUseShift: _settings.GhostOverrideUseShift,
    // ... existing fields
);

// 4. Event subscriptions in MainWindow.OpenSettings
_settingsWindow.GhostOverrideUseCtrlChanged += v =>
{
    _settings = _settings with { GhostOverrideUseCtrl = v };
    SaveSettings();
    _ghostModeController.ModifierConfig = new ModifierConfig(
        _settings.GhostOverrideUseCtrl,
        _settings.GhostOverrideUseAlt,
        _settings.GhostOverrideUseShift
    );
};
// (repeat for Alt, Shift)

// 5. ResetToDefaults (in MainWindow): reset to Ctrl+Alt
_settings = _settings with 
{
    GhostOverrideUseCtrl = true,
    GhostOverrideUseAlt = true,
    GhostOverrideUseShift = false,
    // ... existing resets
};
_ghostModeController.ModifierConfig = new ModifierConfig(true, true, false);
RefreshControls(GetCurrentSettingsSnapshot());
```

### Runtime Detection Integration

**New component:**

```csharp
// GhostModeController.cs
public readonly record struct ModifierConfig(
    bool UseCtrl,
    bool UseAlt,
    bool UseShift
);

public class GhostModeController
{
    private ModifierConfig _modifierConfig = new(true, true, false); // default Ctrl+Alt
    
    public ModifierConfig ModifierConfig
    {
        get => _modifierConfig;
        set => _modifierConfig = value;
    }
    
    // IsCtrlAltHeld → IsModifierHeld (rename for clarity)
    public static bool IsModifierHeld(ModifierConfig config)
    {
        // If all three are false, override is disabled
        if (!config.UseCtrl && !config.UseAlt && !config.UseShift)
            return false;
        
        bool ctrlHeld = !config.UseCtrl || (GetAsyncKeyState(VK_LCONTROL) & 0x8000) != 0;
        bool altHeld = !config.UseAlt || (GetAsyncKeyState(VK_LMENU) & 0x8000) != 0;
        bool shiftHeld = !config.UseShift || (GetAsyncKeyState(VK_LSHIFT) & 0x8000) != 0;
        
        // All enabled modifiers must be held
        return ctrlHeld && altHeld && shiftHeld;
    }
    
    private void OnTimerTick(object? sender, EventArgs e)
    {
        if (!IsEnabled) return;
        
        bool modifierHeld = IsModifierHeld(_modifierConfig);
        
        // ... rest of proximity logic unchanged
    }
}
```

**Key insight:** `IsModifierHeld` uses **inverted logic** — if a modifier is NOT required (`UseCtrl=false`), the check is always true for that modifier. Only required modifiers gate the overall result. All three false → early return false.

## Patterns to Follow

### Pattern 1: Init-Property Defaults for Backward Compatibility
**What:** AppSettings fields use `{ init; } = defaultValue` syntax  
**When:** Any new persisted field that must have a safe default for users upgrading from prior versions  
**Example:**
```csharp
public bool GhostOverrideUseCtrl { get; init; } = true;
```
**Why:** System.Text.Json deserializes absent JSON fields to C# type defaults (false for bool, 0 for int, null for string). Explicit init defaults override this for safe upgrades.

### Pattern 2: Immediate Persistence in Event Handlers
**What:** Event handler does `_settings = _settings with { Field = v }; SaveSettings();` immediately  
**When:** All SettingsWindow events (established in Phase 78)  
**Example:**
```csharp
_settingsWindow.GhostOverrideUseCtrlChanged += v =>
{
    _settings = _settings with { GhostOverrideUseCtrl = v };
    SaveSettings();
    _ghostModeController.ModifierConfig = new(
        _settings.GhostOverrideUseCtrl,
        _settings.GhostOverrideUseAlt,
        _settings.GhostOverrideUseShift
    );
};
```
**Why:** Modeless settings window applies changes immediately (no Apply button). Immediate persistence ensures crash/restart never loses state.

### Pattern 3: Indented Sub-Panel with Master Gate
**What:** Settings sub-panel indented under master toggle; sub-panel `IsEnabled` gated by master state  
**When:** Related settings that only make sense when parent feature is enabled  
**Example:**
```xaml
<CheckBox x:Name="ChkGhostMode" Content="Ghost Mode" />
<StackPanel x:Name="GhostOverridePanel" Margin="20,10,0,0">
    <CheckBox x:Name="ChkGhostOverrideCtrl" Content="Ctrl" />
    <CheckBox x:Name="ChkGhostOverrideAlt" Content="Alt" />
    <CheckBox x:Name="ChkGhostOverrideShift" Content="Shift" />
</StackPanel>
```
```csharp
private void ChkGhostMode_Changed(object sender, RoutedEventArgs e)
{
    // ...
    GhostOverridePanel.IsEnabled = ChkGhostMode.IsChecked == true;
}
```
**Why:** Canonical pattern from `ChkGhostMode` → `GhostFadeRadiusPanel` (Phase 69) and `ChkTempsVisible` → `TempSensorsPanel` (Phase 78). Prevents confusing state where sub-controls can be toggled while master is off.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Reading IsChecked in Click Handler
**What:** Click handler reads `CheckBox.IsChecked` to determine new state  
**Why bad:** WPF IsCheckable auto-toggles IsChecked BEFORE handler fires; reading IsChecked in the handler produces inverted logic  
**Instead:** Use `_suppressEvents` guard if needed, or rely on IsChecked set by WPF and read in `RefreshControls()` for display sync only

### Anti-Pattern 2: Positional Record for AppSettings
**What:** Changing AppSettings to a positional record (`public record AppSettings(...)`)  
**Why bad:** Adding new parameters breaks deserialization of old settings.json; all fields become required in JSON  
**Instead:** Init-property record (`public bool Field { get; init; } = default`) enables forward/backward JSON compatibility

### Anti-Pattern 3: Calling RefreshControls in Event Handler
**What:** SettingsWindow event handler calls `RefreshControls()` after updating `_settings`  
**Why bad:** `RefreshControls()` fires all checkbox Changed events again (even with `_suppressEvents` guard, creates unnecessary call chains); immediate persistence is sufficient  
**Instead:** Only call `RefreshControls()` in `ResetToDefaults()` where full UI state must be recomputed from scratch

## Scalability Considerations

| Concern | Current (v4.3) | At N modifiers | Notes |
|---------|----------------|----------------|-------|
| Persistence | 3 bool fields in AppSettings | O(N) fields | Init-property record scales linearly; no schema migration needed |
| UI representation | 3 CheckBoxes + 3 events | O(N) XAML + events | Acceptable; modifier set is fixed (Ctrl/Alt/Shift/Win); Win would add 4th checkbox |
| Runtime detection | 3 GetAsyncKeyState calls | O(N) P/Invoke | Negligible; 75ms tick budget >>> 3 GetAsyncKeyState calls |
| Controller propagation | Reconstruct ModifierConfig struct on every event | Immutable struct copy | Zero heap allocation; struct copy is ~20 bytes on stack |

**Win key consideration:** If Win modifier is added in future, VK_LWIN = 0x5B. Pattern extends cleanly (add `UseWin` bool, add Win CheckBox, add fourth GetAsyncKeyState check).

## Integration Points

### New Components
1. **ModifierConfig struct** — new readonly record struct in `GhostModeController.cs` (3 bool fields: `UseCtrl`, `UseAlt`, `UseShift`)
2. **GhostOverridePanel** — new indented StackPanel in `SettingsWindow.xaml` Behavior tab (3 CheckBoxes)
3. **3 new events** in `SettingsWindow.xaml.cs` — `GhostOverrideUseCtrlChanged`, `GhostOverrideUseAltChanged`, `GhostOverrideUseShiftChanged` (all `Action<bool>?`)

### Modified Components
1. **AppSettings** — add 3 bool init-properties with defaults (Ctrl=true, Alt=true, Shift=false)
2. **SettingsSnapshot** — add 3 bool parameters (positional record, append to existing parameter list)
3. **SettingsService.Validate()** — no validation needed (bool fields have no invalid state)
4. **MainWindow.GetCurrentSettingsSnapshot()** — add 3 field mappings from `_settings` to snapshot
5. **MainWindow.OpenSettings()** — subscribe to 3 new events; each handler updates `_settings`, calls `SaveSettings()`, updates `_ghostModeController.ModifierConfig`
6. **MainWindow.ResetToDefaults()** — add 3 `with` clauses to reset Ctrl=true, Alt=true, Shift=false; update controller; `RefreshControls()` already present
7. **GhostModeController.ModifierConfig** — new property setter; stores `_modifierConfig` field; used in `OnTimerTick`
8. **GhostModeController.IsCtrlAltHeld()** — rename to `IsModifierHeld(ModifierConfig)` (static); refactor to check enabled modifiers only; all-false guard returns false immediately

### Call Sites Requiring Update
1. **MainWindow.Window_MouseEnter** — change `IsCtrlAltHeld()` to `_ghostModeController.IsModifierHeld(_ghostModeController.ModifierConfig)` (instance method if made non-static, or keep static and pass config)
2. **GhostModeController.OnTimerTick** — already calls `IsModifierHeld` internally after refactor; no external change needed
3. **SettingsWindow.ChkGhostMode_Changed** — add `GhostOverridePanel.IsEnabled = ChkGhostMode.IsChecked == true;` to gate sub-panel
4. **SettingsWindow.RefreshControls** — add `GhostOverridePanel.IsEnabled = snapshot.GhostModeEnabled;` to refresh gating on populate

## Suggested Build Order

### Phase 1: Data Flow (Foundation)
**Goal:** Persistence and snapshot flow without UI or runtime behavior

1. **AppSettings** — add 3 bool init-properties (Ctrl=true, Alt=true, Shift=false)
2. **SettingsSnapshot** — add 3 bool parameters
3. **SettingsService round-trip test** — verify 3 new fields serialize/deserialize correctly
4. **Absent-field test** — verify init defaults (true/true/false) when JSON lacks fields
5. **MainWindow.GetCurrentSettingsSnapshot** — add 3 mappings

**Validation:** MSTest round-trip + absent-field tests pass; no UI or runtime changes yet.

### Phase 2: Runtime Detection (Controller)
**Goal:** Refactor IsCtrlAltHeld to IsModifierHeld with config-driven logic

1. **ModifierConfig struct** — define in `GhostModeController.cs`
2. **GhostModeController.ModifierConfig property** — add field + setter
3. **IsCtrlAltHeld → IsModifierHeld refactor** — static method taking `ModifierConfig`; all-false guard; inverted logic for enabled modifiers
4. **Unit tests** — 6 test cases:
   - All three enabled (Ctrl+Alt+Shift all held) → true
   - All three enabled, only Ctrl+Alt held → false
   - Ctrl+Alt enabled (Shift disabled), Ctrl+Alt held → true
   - Ctrl+Alt enabled, only Ctrl held → false
   - All three disabled → false (always, regardless of keys held)
   - Default config (Ctrl+Alt enabled, Shift disabled), Ctrl+Alt held → true
5. **OnTimerTick integration** — call `IsModifierHeld(_modifierConfig)` instead of `IsCtrlAltHeld()`

**Validation:** 6 MSTest unit tests pass; controller behavior unchanged with default config.

### Phase 3: Settings UI (Wiring)
**Goal:** SettingsWindow exposes 3 checkboxes and fires events

1. **GhostOverridePanel XAML** — add indented StackPanel below GhostFadeRadiusPanel in Behavior tab; 3 CheckBoxes with x:Names `ChkGhostOverrideCtrl`, `ChkGhostOverrideAlt`, `ChkGhostOverrideShift`
2. **3 events in SettingsWindow** — declare `Action<bool>?` events
3. **3 CheckBox Changed handlers** — fire events with `IsChecked ?? false`
4. **RefreshControls** — populate 3 CheckBoxes from snapshot; set `GhostOverridePanel.IsEnabled` from `snapshot.GhostModeEnabled`
5. **ChkGhostMode_Changed** — add `GhostOverridePanel.IsEnabled = ChkGhostMode.IsChecked == true;` to gate sub-panel

**Validation:** Settings window shows 3 checkboxes; enabled/disabled by Ghost Mode master toggle; checkboxes reflect persisted state on open.

### Phase 4: MainWindow Integration (End-to-End)
**Goal:** Wire events to persistence and controller propagation

1. **OpenSettings event subscriptions** — subscribe to 3 new events; each handler updates `_settings`, calls `SaveSettings()`, updates `_ghostModeController.ModifierConfig`
2. **ResetToDefaults** — add 3 `with` clauses (Ctrl=true, Alt=true, Shift=false); update `_ghostModeController.ModifierConfig`; `RefreshControls()` call already present
3. **ApplySettings startup** — add `_ghostModeController.ModifierConfig = new(...)` after existing ghost mode settings applied

**Validation:** End-to-end flow: change checkboxes → settings.json updates immediately → controller uses new config → restart restores checkboxes and runtime behavior → ResetToDefaults restores Ctrl+Alt → all three unchecked disables override (ghost always activates on hover with no keyboard bypass).

### Dependency Graph
```
Phase 1 (Data Flow)
  ↓
Phase 2 (Runtime Detection) ← can run in parallel with Phase 3
  ↓
Phase 3 (Settings UI) ← can run in parallel with Phase 2
  ↓
Phase 4 (MainWindow Integration) ← requires Phase 1+2+3 complete
```

**Rationale:** Phases 2 and 3 have no dependencies on each other (controller refactor is independent of UI wiring). Phase 4 is the integration layer that wires Phase 3 UI events to Phase 2 controller. Phase 1 is foundation for all.

## Verification Points

### Per-Phase
- **Phase 1:** Round-trip + absent-field MSTest pass; `dotnet build` clean
- **Phase 2:** 6 unit tests pass; `OnTimerTick` calls `IsModifierHeld` with default config; ghost behavior unchanged
- **Phase 3:** Settings window opens; checkboxes visible and enabled/disabled by master toggle; persist on toggle
- **Phase 4:** Full cycle — change checkbox → restart → checkbox restored and behavior matches; ResetToDefaults restores Ctrl+Alt; all three unchecked disables override

### End-to-End (Phase 4 Complete)
1. **Default behavior preserved:** Fresh install or upgrade from v4.2 → Ctrl+Alt suppresses ghost (backward compat)
2. **Checkbox persistence:** Toggle Shift on → restart → Shift checkbox checked; Ctrl+Alt+Shift all required to suppress ghost
3. **All unchecked disables override:** Uncheck all three → hover with any modifiers held → ghost activates immediately (no override path)
4. **ResetToDefaults:** Click Reset → Ctrl+Alt checkboxes checked, Shift unchecked; runtime behavior matches
5. **Master toggle gates sub-panel:** Ghost Mode off → GhostOverridePanel grayed out; Ghost Mode on → panel enabled
6. **Combination matrix:**
   - Ctrl only: works with Ctrl held, fails with Alt held
   - Alt only: works with Alt held, fails with Ctrl held
   - Ctrl+Shift: works with Ctrl+Shift held, fails with Ctrl-only or Shift-only
   - All three: works only when Ctrl+Alt+Shift all held

## Open Questions

1. **Should unchecking all three show a warning/tooltip?** — Current plan: no warning, silent fallback to "override disabled" state. If user feedback indicates confusion, add tooltip "At least one modifier must be enabled for override" in Phase 4 refinement.

2. **Should Win key be included?** — Deferred. Win key intercept is complex on Windows 11 (Start menu shortcut conflicts). Ctrl/Alt/Shift cover 99% of use cases. Can be added as Phase 5 if requested.

3. **Should MainWindow.Window_MouseEnter also update?** — Yes, if `IsModifierHeld` remains static. Call site: `bool modifierHeld = GhostModeController.IsModifierHeld(_ghostModeController.ModifierConfig);` at top of `Window_MouseEnter`. If `IsModifierHeld` becomes instance method, call `_ghostModeController.IsModifierHeld()` instead.

## Sources

- **Project context:** `.planning/PROJECT.md` (Key Decisions table, Phase 78/79 Temps patterns, Phase 69 GhostFadeRadiusPx)
- **GSD workflow:** PAI Algorithm system (Phase 1→2→3→4 dependency ordering matches Algorithm ISC decomposition)
- **AppSettings pattern:** Phase 78 `TempsLineVisible` / `TempCpuVisible` / etc. — init-property with explicit default
- **Immediate persistence pattern:** Phase 78 event handlers — `_settings = _settings with { ... }; SaveSettings();`
- **Indented sub-panel pattern:** Phase 69 `GhostFadeRadiusPanel.IsEnabled` gated by `ChkGhostMode`; Phase 78 `TempSensorsPanel.IsEnabled` gated by `ChkTempsVisible`
- **GetAsyncKeyState pattern:** Phase 27 `VK_LCONTROL` / `VK_LMENU` with `0x8000` mask; VK constants from Win32 API
