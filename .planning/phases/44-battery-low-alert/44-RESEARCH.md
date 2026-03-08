# Phase 44: Battery Low Alert - Research

**Researched:** 2026-03-09
**Domain:** WPF state-guarded visual override + Settings window extension
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Behavior tab UI**
- New "Battery Alert" labeled section at the bottom of the Behavior tab, below Auto-Launch
- Always visible — not conditional on battery row being enabled
- Three radio buttons for threshold: 10% / 15% / 20% — matches the existing process threshold radio button pattern (RbThresh2/5/10 in Stats tab)
- Default: 20%

**Alert trigger logic**
- Alert fires when: battery ≤ threshold AND device is unplugged
- 1% dead-band on clear: alert clears when battery > threshold + 1% (e.g., at 20% threshold: alert at ≤20%, clears at ≥22%) — prevents flicker near boundary
- Either condition clearing removes the alert: plugging in OR battery rising above threshold + 1%

**Visual scope**
- Bar only goes red (#FFFF4444) — text/label stays in normal accent color
- Instant snap — no animation or pulse
- `_batteryAlertActive` flag protects the red bar from being overridden by:
  - Auto-contrast sampling (`ApplyDisplayColor()`)
  - Named theme application (`ApplyNamedTheme()`)
  - `ApplyTheme()` general redraws
- Alert wins over themes: while alert is active, applying a named theme does not change the bar color

### Claude's Discretion

- Where `_batteryAlertActive` flag is checked in `ApplyTheme()` and `ApplyDisplayColor()` (only the battery bar brush path)
- Whether the flag is stored as a field or derived from battery state on each call
- `AppSettings.BatteryAlertThresholdPercent` default value storage (int vs double)
- `BatteryAlertThresholdChanged` event naming and wiring in `OpenSettings()`

### Deferred Ideas (OUT OF SCOPE)

- None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ALERT-01 | When battery is below the alert threshold and not plugged in, the battery stat row accent color shifts to red | `_batteryAlertActive` flag + `UpdateBatteryAlertState()` called from `UpdateStatsDisplay()`; red brush `#FFFF4444` applied only to `BattBar.Background` |
| ALERT-02 | Battery row returns to normal accent color when battery rises above threshold or is plugged in | Dead-band clear logic: `BatteryPercent > threshold + 1f` OR `IsPluggedIn`; clearing resets `BattBar.Background` to normal accent brush and sets `_batteryAlertActive = false` |
| ALERT-03 | Battery alert threshold is configurable in Settings window Behavior tab (10% / 15% / 20%; default 20%) | `AppSettings.BatteryAlertThresholdPercent` + `SettingsSnapshot.BatteryAlertThreshold` + `BatteryAlertThresholdChanged` event + radio buttons `RbAlert10/15/20` in Behavior tab |
</phase_requirements>

---

## Summary

Phase 44 adds a battery low alert: when the battery charge drops at or below a user-configured threshold while unplugged, only the `BattBar` progress-bar rectangle turns red (`#FFFF4444`). Text and label elements keep their normal accent color. The alert clears when the battery rises above `threshold + 1%` or the device is plugged in. The 1% dead-band prevents flickering near the threshold boundary.

The entire implementation is a MainWindow field (`_batteryAlertActive`) + one state-evaluation helper called at the end of `UpdateStatsDisplay()`, plus guards in the two color-applying paths (`ApplyTheme()` and `ApplyDisplayColor()`). There is no new service, no new timer, and no new XAML element — battery data is already polled by `StatsService.Refresh()` on every `_statsTimer` tick. The Settings window Behavior tab gains a new labeled section with three radio buttons following the exact same pattern already used by the process threshold radio buttons in the Stats tab.

The scope is deliberately narrow: only `BattBar.Background` is overridden; `BattLabel`, `BattText`, and all other stat rows remain at accent color throughout. `ApplyNamedTheme()` calls `SetAccentColor()` which calls `ApplyTheme()` — the guard in `ApplyTheme()` is sufficient to protect the bar from theme application too.

**Primary recommendation:** Store `_batteryAlertActive` as a `bool` field, derive threshold from a `_batteryAlertThreshold` field (int, storing 10/15/20), and evaluate state transition inside a dedicated `UpdateBatteryAlertState()` helper called at the tail of `UpdateStatsDisplay()`.

---

## Standard Stack

### Core (no new dependencies)

| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| `System.Windows.Forms.SystemInformation.PowerStatus` | .NET 10 BCL | Battery percent + plug status | Already used in `StatsService.Refresh()` — `BatteryPercent` and `IsPluggedIn` are live properties |
| `System.Windows.Media.SolidColorBrush` | WPF .NET 10 | Color the bar | Already the pattern used for every brush assignment in `ApplyTheme()` and `ApplyDisplayColor()` |
| `AppSettings` init-property record | Project | Persist threshold | Established pattern; new field `BatteryAlertThresholdPercent` follows all existing field conventions |

### No New Packages

All data and APIs needed already exist in the project. No NuGet install required.

---

## Architecture Patterns

### Pattern 1: State-Guarded Color Override in ApplyTheme/ApplyDisplayColor

**What:** `_batteryAlertActive` is a `bool` field. Both `ApplyTheme()` and `ApplyDisplayColor()` skip the `BattBar.Background` assignment when the flag is true, because the red alert brush is set separately and must not be overwritten.

**When to use:** Whenever a secondary visual state (alert) must survive general re-theme operations.

**Existing analogues in codebase:** The `_isDragging` field pauses `ContrastRefreshController`; the `_ghostMode.IsActive` guard prevents opacity changes. This phase uses the same field-as-guard idiom.

**Implementation:**
```csharp
// In ApplyTheme():
CpuBar.Background = brush;
GpuBar.Background = brush;
MemBar.Background = brush;
PagBar.Background = brush;
if (!_batteryAlertActive)        // <-- guard
    BattBar.Background = brush;

// In ApplyDisplayColor():
CpuBar.Background  = brush; GpuBar.Background  = brush;
MemBar.Background  = brush; PagBar.Background  = brush;
if (!_batteryAlertActive)        // <-- guard
    BattBar.Background = brush;
// BattLabel and BattText are NOT guarded — they keep whatever display color ApplyDisplayColor provides
```

### Pattern 2: Alert State Evaluation in UpdateStatsDisplay

**What:** At the end of `UpdateStatsDisplay()`, after `_statsService.Refresh()` has updated `BatteryPercent` and `IsPluggedIn`, call `UpdateBatteryAlertState()`. This helper owns all enter/exit logic and mutates `_batteryAlertActive` + `BattBar.Background`.

**Why here:** Battery data is fresh immediately after `Refresh()` returns. No extra timer. No extra service. Matches the pattern of `UpdateUptimeDisplay()` which also runs after `Refresh()`.

```csharp
private void UpdateBatteryAlertState()
{
    // No battery present — never alert
    if (_statsService.BatteryPercent < 0f)
    {
        if (_batteryAlertActive)
        {
            _batteryAlertActive = false;
            BattBar.Background = new SolidColorBrush(_accentColor);
        }
        return;
    }

    bool shouldAlert = !_statsService.IsPluggedIn
                    && _statsService.BatteryPercent <= _batteryAlertThreshold;

    // 1% dead-band: once alert is active, only clear when ABOVE threshold + 1%
    bool shouldClear = _statsService.IsPluggedIn
                    || _statsService.BatteryPercent > _batteryAlertThreshold + 1f;

    if (!_batteryAlertActive && shouldAlert)
    {
        _batteryAlertActive = true;
        BattBar.Background = new SolidColorBrush(
            System.Windows.Media.Color.FromArgb(0xFF, 0xFF, 0x44, 0x44));  // #FFFF4444
    }
    else if (_batteryAlertActive && shouldClear)
    {
        _batteryAlertActive = false;
        BattBar.Background = new SolidColorBrush(_accentColor);
    }
}
```

### Pattern 3: Radio Button Threshold — Radio Buttons Matching RbThresh Pattern

**What:** Three `RadioButton` elements in the Behavior tab Behavior section, named `RbAlert10`, `RbAlert15`, `RbAlert20`, with `GroupName="BatteryAlertThresh"`. Each fires a `Checked` handler. Mirrors `RbThresh2/5/10` in Stats tab exactly.

**XAML skeleton (Behavior tab, after ChkAutoLaunch):**
```xml
<!-- Battery Alert -->
<TextBlock Text="Battery Alert" FontWeight="SemiBold" Margin="0,16,0,6"/>
<StackPanel Orientation="Horizontal">
    <RadioButton x:Name="RbAlert10" Content="10%" GroupName="BatteryAlertThresh"
                 Margin="0,0,14,0" Checked="RbAlert10_Checked"/>
    <RadioButton x:Name="RbAlert15" Content="15%" GroupName="BatteryAlertThresh"
                 Margin="0,0,14,0" Checked="RbAlert15_Checked"/>
    <RadioButton x:Name="RbAlert20" Content="20%" GroupName="BatteryAlertThresh"
                 Checked="RbAlert20_Checked"/>
</StackPanel>
```

**Code-behind (SettingsWindow.xaml.cs):**
- Add `public event Action<int>? BatteryAlertThresholdChanged;`
- Populate in `PopulateControls()`: `RbAlert10.IsChecked = s.BatteryAlertThreshold == 10; RbAlert15.IsChecked = s.BatteryAlertThreshold == 15; RbAlert20.IsChecked = s.BatteryAlertThreshold == 20;`
- Three `Checked` handlers fire `BatteryAlertThresholdChanged?.Invoke(10/15/20)`

### Pattern 4: SettingsSnapshot + AppSettings Extension

**What:** Both need a new field. `SettingsSnapshot` is the in-memory open-time snapshot; `AppSettings` is the persisted record.

**AppSettings** (init-property record, `int` type — process threshold uses `double` for fractional percents, but 10/15/20 are whole numbers so `int` is cleaner):
```csharp
public int BatteryAlertThresholdPercent { get; init; } = 20;
```

**SettingsSnapshot** (internal sealed record):
```csharp
public int BatteryAlertThreshold { get; init; } = 20;
```

**SettingsService.Defaults()** — add to the `new()` initializer:
```csharp
BatteryAlertThresholdPercent = 20,
```

**SettingsService.Validate()** — guard against invalid values (only 10, 15, 20 are valid):
```csharp
int[] validAlertThresholds = { 10, 15, 20 };
if (!validAlertThresholds.Contains(loaded.BatteryAlertThresholdPercent))
    loaded = loaded with { BatteryAlertThresholdPercent = Defaults().BatteryAlertThresholdPercent };
```

### Pattern 5: MainWindow Fields and Wiring

**New fields:**
```csharp
private bool _batteryAlertActive = false;
private int  _batteryAlertThreshold = 20;  // default matches AppSettings default
```

**ApplySettings() addition** (direct field assignment, no helper — safe before Show()):
```csharp
_batteryAlertThreshold = s.BatteryAlertThresholdPercent;
```

**SaveSettings() addition** (in the `_settings = _settings with { ... }` block):
```csharp
BatteryAlertThresholdPercent = _batteryAlertThreshold,
```

**GetCurrentSettingsSnapshot() addition:**
```csharp
BatteryAlertThreshold = _batteryAlertThreshold,
```

**OpenSettings() event wiring:**
```csharp
_settingsWindow.BatteryAlertThresholdChanged += t => SetBatteryAlertThreshold(t);
```

**New setter:**
```csharp
private void SetBatteryAlertThreshold(int threshold)
{
    _batteryAlertThreshold = threshold;
    SaveSettings();
    // Re-evaluate alert state immediately with new threshold
    if (_statsService.IsReady)
        UpdateBatteryAlertState();
}
```

### Anti-Patterns to Avoid

- **Guarding BattLabel/BattText in ApplyDisplayColor:** Only `BattBar.Background` is red. Labels/text stay at accent/display color. Do NOT add the guard to any other battery element.
- **Calling ApplyTheme() from SetBatteryAlertThreshold():** Unnecessary and causes a full repaint. Only `BattBar.Background` needs to change; `UpdateBatteryAlertState()` handles it.
- **Using `double` for threshold field:** The three valid values (10, 15, 20) are whole numbers. Use `int` for `_batteryAlertThreshold`, `AppSettings.BatteryAlertThresholdPercent`, and the event payload. The comparison `BatteryPercent <= threshold` works with `float <= int` implicit promotion.
- **Adding the guard to ApplyNamedTheme() directly:** `ApplyNamedTheme()` calls `SetAccentColor()` → `ApplyTheme()`. The guard in `ApplyTheme()` is sufficient. No additional guard in `ApplyNamedTheme()` is needed.
- **Starting a new timer for battery alerting:** Battery state is already polled by `_statsTimer`. `UpdateBatteryAlertState()` runs at the tail of `UpdateStatsDisplay()`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Battery polling | New timer or WMI query | `StatsService.BatteryPercent` + `IsPluggedIn` already polled by `_statsTimer` | Zero extra overhead; StatsService already handles no-battery sentinel (-1f) |
| Color #FFFF4444 construction | Hex string conversion | `Color.FromArgb(0xFF, 0xFF, 0x44, 0x44)` directly | Compile-time constant, no parse risk |
| Threshold persistence | Custom storage | `AppSettings.BatteryAlertThresholdPercent` init-property record | Consistent with all other settings; free JSON round-trip |

---

## Common Pitfalls

### Pitfall 1: Forgetting the Dead-Band on Clear

**What goes wrong:** Alert enters at ≤20%, clears at >20%, re-enters at ≤20% — the bar flickers every stats tick if battery oscillates at exactly 20%.

**Why it happens:** Symmetric threshold check: `shouldAlert = pct <= 20` AND `shouldClear = pct > 20` — both are true-or-false at exactly 20.

**How to avoid:** `shouldClear = IsPluggedIn || pct > threshold + 1f`. At 20% threshold: enter at ≤20%, clear at ≥22%.

**Warning signs:** Test by setting threshold to a value the test machine is currently at; if bar flickers on every tick, dead-band is missing.

### Pitfall 2: ApplyTheme/ApplyDisplayColor Overwriting Alert Color

**What goes wrong:** User scrolls opacity wheel (calls `SetOpacity` → `ApplyTheme()`). `ApplyTheme()` overwrites `BattBar.Background` with accent brush, erasing the red.

**Why it happens:** Every `ApplyTheme()` / `ApplyDisplayColor()` currently unconditionally sets all bars to a single brush.

**How to avoid:** The `if (!_batteryAlertActive)` guard on `BattBar.Background` in both methods.

**Warning signs:** After any opacity scroll or accent color change while battery is low, `BattBar` reverts to white/accent.

### Pitfall 3: Named Theme Application Overwriting Alert Color

**What goes wrong:** User clicks a theme card while battery is low. `ApplyNamedTheme()` → `SetAccentColor()` → `ApplyTheme()` → overwrites bar.

**Why it happens:** Same as Pitfall 2; the call chain reaches `ApplyTheme()`.

**How to avoid:** Same guard in `ApplyTheme()` covers this path. No additional guard needed in `ApplyNamedTheme()`.

### Pitfall 4: No-Battery Machine Triggering Alert

**What goes wrong:** On a desktop PC (no battery), `BatteryPercent` is `-1f`. The condition `BatteryPercent <= threshold` with threshold=20 would be `-1f <= 20` which is **true**, triggering a false alert.

**Why it happens:** Sentinel value (`-1f`) compares numerically less than any threshold.

**How to avoid:** In `UpdateBatteryAlertState()`, exit early when `BatteryPercent < 0f`.

**Warning signs:** Bar turns red on a desktop with no battery.

### Pitfall 5: Alert State Not Re-Evaluated After Threshold Change

**What goes wrong:** User changes threshold from 20% to 10% while battery is at 15%. Bar should immediately stop being red (15% > 10% + 1% = 11%). But it stays red until the next stats tick.

**Why it happens:** `SetBatteryAlertThreshold()` only updates `_batteryAlertThreshold` and calls `SaveSettings()`, without re-evaluating alert state.

**How to avoid:** At the end of `SetBatteryAlertThreshold()`, call `UpdateBatteryAlertState()` if `_statsService.IsReady`.

### Pitfall 6: _suppressEvents Not Set During PopulateControls in SettingsWindow

**What goes wrong:** Setting `RbAlert20.IsChecked = true` during population fires `RbAlert20_Checked`, which fires `BatteryAlertThresholdChanged`, which MainWindow handles — causing a spurious settings save before the window is fully populated.

**Why it happens:** `_suppressEvents` is set to `true` at the start of the constructor and then cleared after `PopulateControls()`. The new radio button handlers must also check `if (_suppressEvents) return;`.

**How to avoid:** All three `RbAlertXX_Checked` handlers start with `if (_suppressEvents) return;`. This is exactly how `RbThresh2_Checked` and siblings work.

---

## Code Examples

### UpdateBatteryAlertState (complete implementation pattern)

```csharp
// Called at the tail of UpdateStatsDisplay(), after _statsService.Refresh() has run.
private void UpdateBatteryAlertState()
{
    // No battery present (desktop PC or sensor error) — never alert
    if (_statsService.BatteryPercent < 0f)
    {
        if (_batteryAlertActive)
        {
            _batteryAlertActive = false;
            BattBar.Background = new System.Windows.Media.SolidColorBrush(_accentColor);
        }
        return;
    }

    bool shouldAlert = !_statsService.IsPluggedIn
                    && _statsService.BatteryPercent <= _batteryAlertThreshold;

    // Dead-band: once active, only clear when plugged in OR battery > threshold + 1%
    bool shouldClear = _statsService.IsPluggedIn
                    || _statsService.BatteryPercent > (_batteryAlertThreshold + 1f);

    if (!_batteryAlertActive && shouldAlert)
    {
        _batteryAlertActive = true;
        BattBar.Background = new System.Windows.Media.SolidColorBrush(
            System.Windows.Media.Color.FromArgb(0xFF, 0xFF, 0x44, 0x44));
    }
    else if (_batteryAlertActive && shouldClear)
    {
        _batteryAlertActive = false;
        BattBar.Background = new System.Windows.Media.SolidColorBrush(_accentColor);
    }
}
```

### Guard insertion points in ApplyTheme and ApplyDisplayColor

```csharp
// ApplyTheme() — replace unconditional BattBar.Background assignment:
//  BEFORE: BattBar.Background = brush;
//  AFTER:
if (!_batteryAlertActive)
    BattBar.Background = brush;

// ApplyDisplayColor() — replace unconditional BattBar.Background assignment:
//  BEFORE: MemBar.Background = brush; PagBar.Background = brush; BattBar.Background = brush;
//  AFTER:
MemBar.Background = brush; PagBar.Background = brush;
if (!_batteryAlertActive)
    BattBar.Background = brush;

// NOTE: BattLabel and BattText guards are NOT added — they remain at accent/display color.
```

### Behavior tab XAML addition (bottom of Behavior StackPanel, after ChkAutoLaunch)

```xml
<!-- Battery Alert threshold -->
<TextBlock Text="Battery Alert" FontWeight="SemiBold" Margin="0,16,0,4"/>
<TextBlock Text="Alert when unplugged and battery is at or below:"
           Foreground="#FF666666" FontSize="11" Margin="0,0,0,6" TextWrapping="Wrap"/>
<StackPanel Orientation="Horizontal">
    <RadioButton x:Name="RbAlert10" Content="10%" GroupName="BatteryAlertThresh"
                 Margin="0,0,14,0" Checked="RbAlert10_Checked"/>
    <RadioButton x:Name="RbAlert15" Content="15%" GroupName="BatteryAlertThresh"
                 Margin="0,0,14,0" Checked="RbAlert15_Checked"/>
    <RadioButton x:Name="RbAlert20" Content="20%" GroupName="BatteryAlertThresh"
                 Checked="RbAlert20_Checked"/>
</StackPanel>
```

### SettingsWindow event + handler pattern

```csharp
// Event declaration (with existing events):
public event Action<int>? BatteryAlertThresholdChanged;

// PopulateControls():
RbAlert10.IsChecked = s.BatteryAlertThreshold == 10;
RbAlert15.IsChecked = s.BatteryAlertThreshold == 15;
RbAlert20.IsChecked = s.BatteryAlertThreshold == 20;

// Handlers:
private void RbAlert10_Checked(object sender, RoutedEventArgs e)
{
    if (_suppressEvents) return;
    BatteryAlertThresholdChanged?.Invoke(10);
}
private void RbAlert15_Checked(object sender, RoutedEventArgs e)
{
    if (_suppressEvents) return;
    BatteryAlertThresholdChanged?.Invoke(15);
}
private void RbAlert20_Checked(object sender, RoutedEventArgs e)
{
    if (_suppressEvents) return;
    BatteryAlertThresholdChanged?.Invoke(20);
}
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|-----------------|--------|
| N/A — new feature | `_batteryAlertActive` field + tail-of-UpdateStatsDisplay evaluation | No new timer, no new service; leverages existing stats poll cycle |

---

## Open Questions

1. **SettingsWindow height may need increasing**
   - What we know: Current `SettingsWindow` is `Height="510"` with the Behavior tab containing three CheckBoxes and no sections.
   - What's unclear: Whether the "Battery Alert" section (TextBlock + description + StackPanel of 3 radio buttons) fits without scrolling or clipping. Rough estimate: adds ~80–90px.
   - Recommendation: Increase `Height` to `600` (or add a `ScrollViewer` to the Behavior StackPanel). 600px is the safest safe choice to give all three tabs room.

2. **BatteryAlertThresholdPercent: `int` vs `double`**
   - What we know: CONTEXT.md leaves this to Claude's discretion. ProcessCountThresholdPercent uses `double` (needed for 2.0/5.0/10.0 values that must round-trip cleanly through JSON). BatteryAlertThresholdPercent candidates are 10/15/20 — whole numbers.
   - Recommendation: Use `int`. Whole numbers, no floating-point edge cases, cleaner comparison against `float BatteryPercent`. The existing Validate() guard pattern works identically for `int`.

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `FuzzyClock.App/MainWindow.xaml.cs` — `ApplyTheme()` lines 1153–1210, `ApplyDisplayColor()` lines 1212–1241, `UpdateStatsDisplay()` lines 548–591, `ApplySettings()` lines 182–313, `OpenSettings()` lines 339–385
- Direct code inspection: `FuzzyClock.App/SettingsWindow.xaml.cs` — event pattern, `_suppressEvents` guard, `PopulateControls()`, RbThresh handlers lines 413–429
- Direct code inspection: `FuzzyClock.App/SettingsWindow.xaml` — Behavior tab lines 411–428, Stats tab RbThresh XAML lines 368–380
- Direct code inspection: `FuzzyClock.App/AppSettings.cs` — record structure
- Direct code inspection: `FuzzyClock.App/SettingsSnapshot.cs` — snapshot record
- Direct code inspection: `FuzzyClock.App/StatsService.cs` — `BatteryPercent`, `IsPluggedIn`, `-1f` sentinel

### Secondary (MEDIUM confidence)
- None required — all patterns verified from direct source inspection

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; battery data and WPF brush patterns are fully verified in existing code
- Architecture patterns: HIGH — `_batteryAlertActive` flag pattern mirrors `_isDragging`, verified in existing color guard paths; dead-band logic is straightforward float arithmetic
- Pitfalls: HIGH — all six pitfalls directly observed from reading existing code paths (sentinel `-1f`, `_suppressEvents` guard, theme call chain through `SetAccentColor` → `ApplyTheme`)

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable, no external dependencies)
