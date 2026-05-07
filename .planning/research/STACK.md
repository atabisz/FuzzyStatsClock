# Technology Stack — v4.3 Configurable Ghost Override

**Project:** FuzzyClock v4.3
**Researched:** 2026-05-07
**Confidence:** HIGH

## Executive Summary

**Zero new dependencies required.** The configurable modifier key feature uses existing capabilities already validated in production: WPF CheckBox controls (present in SettingsWindow since v3.2), Win32 `GetAsyncKeyState` P/Invoke for keyboard state detection (in use since v2.3), and `AppSettings` init-property record persistence (established pattern since v1.1).

## Recommended Stack

### No Changes Required

The existing v4.2 stack handles all v4.3 requirements:

| Component | Current Version | Coverage |
|-----------|----------------|----------|
| **UI Framework** | WPF (net10.0-windows) | CheckBox controls in Settings window |
| **Keyboard State** | Win32 User32.dll P/Invoke | `GetAsyncKeyState` for modifier detection |
| **Settings Persistence** | System.Text.Json (in-box) | `AppSettings` init-property record |
| **Testing** | MSTest 4.0.1 | 562 tests (445 Core + 117 App) |

### Existing Capabilities (No Addition Needed)

#### 1. WPF CheckBox Controls
**Already in use:** Settings > Behavior tab has multiple CheckBox elements (`ChkGhostMode`, `ChkAutoContrast`, `ChkAutoLaunch`)

**Pattern to replicate:**
```xml
<CheckBox x:Name="ChkUseCtrl" Content="Ctrl" />
<CheckBox x:Name="ChkUseAlt" Content="Alt" />
<CheckBox x:Name="ChkUseShift" Content="Shift" />
```

**Event wiring:**
```csharp
ChkUseCtrl.Checked += (s, e) => UseCtrlChanged?.Invoke(true);
ChkUseCtrl.Unchecked += (s, e) => UseCtrlChanged?.Invoke(false);
```

**Why:** Standard WPF controls. No additional library or NuGet package required.

#### 2. Win32 Keyboard State Detection
**Already in use:** `GhostModeController` uses `GetAsyncKeyState(VK_LCONTROL)` and `GetAsyncKeyState(VK_LMENU)` since v2.3 (Phase 26)

**Existing pattern:**
```csharp
[DllImport("user32.dll")]
private static extern short GetAsyncKeyState(int vKey);

private bool IsCtrlAltHeld()
{
    const int VK_LCONTROL = 0xA2;
    const int VK_LMENU = 0xA4;
    return (GetAsyncKeyState(VK_LCONTROL) & 0x8000) != 0
        && (GetAsyncKeyState(VK_LMENU) & 0x8000) != 0;
}
```

**Extension needed:** Add `VK_LSHIFT = 0xA0` constant, read 3 bools from configuration, check only enabled keys.

**Why:** Left-side-only virtual key codes prevent AltGr false-positives on EU keyboards (validated in v2.3). Same P/Invoke signature, just parameterized by configuration.

#### 3. AppSettings Persistence
**Already in use:** 30+ fields in `AppSettings` init-property record with System.Text.Json serialization to `%LOCALAPPDATA%\FuzzyClock\settings.json`

**Pattern to replicate:**
```csharp
public record AppSettings
{
    // Existing fields...
    public bool GhostOverrideUseCtrl { get; init; } = true;
    public bool GhostOverrideUseAlt { get; init; } = true;
    public bool GhostOverrideUseShift { get; init; } = false;
}
```

**Backward compatibility:** Init-property defaults ensure v4.2 users see Ctrl+Alt (true, true, false) on upgrade. JSON absent-field handling works automatically.

**Why:** Established pattern. Zero JSON attributes required. Atomic write via temp file + `File.Move(overwrite:true)` already implemented in `SettingsService`.

## Integration Points

### 1. SettingsWindow XAML (New UI)
**File:** `FuzzyClock.App/SettingsWindow.xaml`
**Location:** Behavior tab, below `GhostFadeRadiusPanel`

**Pattern:** Clone `GhostFadeRadiusPanel` indented sub-panel structure:
- Outer StackPanel indented under `ChkGhostMode`
- Label + WrapPanel with 3 CheckBox elements
- Help TextBlock in muted `#FF999999` color

**Why:** Matches v4.2 Phase 78 `TempSensorsPanel` pattern (master toggle with indented sub-panel).

### 2. SettingsWindow Code-Behind (Event Wiring)
**File:** `FuzzyClock.App/SettingsWindow.xaml.cs`

**Events to add:**
```csharp
public event Action<bool>? GhostOverrideUseCtrlChanged;
public event Action<bool>? GhostOverrideUseAltChanged;
public event Action<bool>? GhostOverrideUseShiftChanged;
```

**Pattern:** Mirror `ChkTempsVisible.Checked += ...` pattern from Phase 78 with `_suppressEvents` guard.

**Why:** Consistent with existing 19 `SettingsChanged` events established in v3.2.

### 3. MainWindow Event Subscriptions (Persistence)
**File:** `FuzzyClock.App/MainWindow.xaml.cs`

**Pattern:** Clone v4.2 Phase 78 pattern:
```csharp
_settingsWindow.GhostOverrideUseCtrlChanged += v => {
    _settings = _settings with { GhostOverrideUseCtrl = v };
    SaveSettings();
    _ghostModeController?.SetModifierConfig(
        _settings.GhostOverrideUseCtrl,
        _settings.GhostOverrideUseAlt,
        _settings.GhostOverrideUseShift);
};
```

**Why:** Immediate persistence with `SaveSettings()`. Live controller update without restart.

### 4. GhostModeController (Detection Logic)
**File:** `FuzzyClock.App/GhostModeController.cs`

**Change:** Replace hardcoded `IsCtrlAltHeld()` with configurable logic:
```csharp
private bool _useCtrl, _useAlt, _useShift;

public void SetModifierConfig(bool useCtrl, bool useAlt, bool useShift)
{
    _useCtrl = useCtrl;
    _useAlt = useAlt;
    _useShift = useShift;
}

private bool IsModifierHeld()
{
    if (!_useCtrl && !_useAlt && !_useShift)
        return false; // Override disabled

    bool ctrlMatch = !_useCtrl || (GetAsyncKeyState(0xA2) & 0x8000) != 0;
    bool altMatch = !_useAlt || (GetAsyncKeyState(0xA4) & 0x8000) != 0;
    bool shiftMatch = !_useShift || (GetAsyncKeyState(0xA0) & 0x8000) != 0;
    
    return ctrlMatch && altMatch && shiftMatch;
}
```

**Why:** All-false = override disabled (ghost always activates). Each enabled key becomes a required part of the combination.

### 5. SettingsService Validation
**File:** `FuzzyClock.App/SettingsService.cs`

**No validation needed.** Bool fields cannot be invalid. No range guard required (unlike `StatsIntervalSeconds` or `Opacity` which need clamping).

**Why:** Bools are always valid. JSON deserialization yields true/false; no error state exists.

### 6. ResetToDefaults
**File:** `FuzzyClock.App/MainWindow.xaml.cs`

**Extension:**
```csharp
_settings = _settings with
{
    GhostOverrideUseCtrl = true,
    GhostOverrideUseAlt = true,
    GhostOverrideUseShift = false,
    // ... other resets
};
```

**Why:** Restores Ctrl+Alt default, matching pre-v4.3 hardcoded behavior.

## What NOT to Add

| Candidate | Why Avoid |
|-----------|-----------|
| **Custom keyboard hook library** | Win32 `GetAsyncKeyState` is sufficient. No need for global hooks or `SetWindowsHookEx` complexity. |
| **WPF KeyBinding** | Widget is frameless with no keyboard focus. Key bindings require focus. `GetAsyncKeyState` polling is the correct pattern (validated in v2.3). |
| **Third-party hotkey manager (e.g., NHotkey)** | Overkill. Feature needs modifier detection during hover, not global system hotkeys. |
| **InputSimulator or similar** | Feature only reads keyboard state, never sends input. No simulation needed. |
| **System.Windows.Forms.Keys enum** | Direct int constants (0xA2/0xA4/0xA0) are clearer in P/Invoke context and avoid `UseWindowsForms=true` enum ambiguity. |

## Testing Additions

**Location:** `FuzzyClock.App.Tests/`

### 1. AppSettings Round-Trip Test
**Pattern:** Extend existing `STEST-01` test method with 3 new bool fields.

```csharp
[TestMethod]
public void AppSettings_JsonRoundTrip_AllFieldsMatch()
{
    var original = new AppSettings
    {
        // ... existing 30 fields
        GhostOverrideUseCtrl = true,
        GhostOverrideUseAlt = false,
        GhostOverrideUseShift = true,
    };
    // serialize → deserialize → assert all fields match
}
```

### 2. Absent-Field Tests
**Pattern:** Clone v2.5 `STEST-02` pattern for init-property defaults.

```csharp
[TestMethod]
public void AppSettings_Deserialize_AbsentGhostOverrideUseCtrl_DefaultsTrue()
{
    var json = "{ \"Left\": 100, \"Top\": 50 }";
    var settings = JsonSerializer.Deserialize<AppSettings>(json);
    Assert.IsTrue(settings.GhostOverrideUseCtrl); // Init default
}
```

**Expected test additions:** +4 tests (1 round-trip extension, 3 absent-field tests for Ctrl/Alt/Shift)

**Why:** Validates backward compatibility for users upgrading from v4.2 with old settings.json.

## Installation

**No installation steps required.** All capabilities already present in the v4.2 codebase.

## Version Pins

| Dependency | Current Pin | Note |
|-----------|-------------|------|
| .NET SDK | 10.0 | TFM: net10.0-windows |
| MSTest | 4.0.1 | NuGet package in test projects |
| System.Text.Json | in-box | No explicit version (ships with .NET 10) |

**No version changes needed for v4.3.**

## Sources

- **PROJECT.md** — Local repository context (v4.2 baseline, existing patterns)
- **Win32 Virtual Key Codes** — Microsoft Learn documentation (VK_LCONTROL/VK_LMENU/VK_LSHIFT constants)
- **GetAsyncKeyState** — Win32 API reference (bitmask 0x8000 for key-down state)

## Confidence Assessment

**HIGH confidence** — All required capabilities are already validated in production code:
- WPF CheckBox controls used in 3 prior tabs
- Win32 `GetAsyncKeyState` used since v2.3 (phases 26-27) with zero issues
- `AppSettings` init-property pattern used across 30+ fields with atomic persistence

**Zero research gaps.** No external libraries, no version upgrades, no new P/Invoke signatures.
