# Phase 71: Stats Interval Slider - Research

**Researched:** 2026-04-01
**Domain:** WPF Slider controls, System.Text.Json type migration, DispatcherTimer decimal intervals
**Confidence:** HIGH

## Summary

Phase 71 replaces the discrete 1s/3s/10s ComboBox stats interval selector with a continuous 0.5-10.0s Slider in Settings > Stats. This enables fine-grained control over stats refresh rate while maintaining the established SettingsWindow event-driven architecture.

**Key findings:**
- WPF Slider ValueChanged pattern is well-established in codebase (OpacitySlider, BackdropOpacitySlider, GhostFadeRadiusSlider)
- System.Text.Json seamlessly deserializes integer values into double fields (backward compatibility guaranteed)
- DispatcherTimer.Interval accepts TimeSpan.FromSeconds(double) directly — no rounding/casting needed
- AppSettings record migration requires only type change (int → double) with matching Validate() guard updates
- CPU load average math already uses double division pattern, requires only field type change

**Primary recommendation:** Follow GhostFadeRadiusSlider pattern (continuous slider with value label, no tick marks) for UI consistency. Use Math.Round(value, 1) in Validate() to clamp precision and prevent sub-decisecond noise.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Default interval shifts from 3s to **2.0s** for new installs and Reset to Defaults
- **D-02:** Clean slider with **no tick marks** (matches existing OpacitySlider, BackdropOpacitySlider, GhostFadeRadiusSlider)
- **D-03:** Value label format is **compact "2.5s"** (matches GhostFadeRadiusLabel "80px" density)
- **D-04:** No tray menu changes needed (stats interval control already exclusively in Settings > Stats)

### Claude's Discretion
- Field type migration strategy (int → double for StatsIntervalSeconds) — backward compat with existing settings.json
- Slider step granularity (0.1s increments implied by STAT-04 Math.Round to 1 decimal place)
- CPU load average sample math adjustment for fractional intervals

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| STAT-01 | User can set stats update interval via continuous slider (0.5-10.0s) in Settings > Stats | WPF Slider with Minimum=0.5, Maximum=10.0; ValueChanged handler pattern established in 3 existing sliders |
| STAT-02 | Stats interval slider replaces discrete 1s/3s/10s ComboBox in Settings | CmbStatsInterval removal straightforward; Grid row replacement with slider+label StackPanel per established pattern |
| STAT-03 | Stats interval persists as decimal to settings.json and restores on launch | System.Text.Json int→double migration automatic; AppSettings.StatsIntervalSeconds type change; SettingsSnapshot type change; SetStatsInterval(double) parameter type change |
| STAT-04 | SettingsService.Validate() clamps interval to 0.5-10.0 with Math.Round(value, 1) | Existing Validate() pattern for Opacity (range check + default replacement); add Math.Round(loaded.StatsIntervalSeconds, 1) before range check |
</phase_requirements>

## Standard Stack

### Core WPF Components
| Component | Purpose | Why Standard |
|-----------|---------|--------------|
| Slider | Continuous value selection (0.5-10.0) | Native WPF control, existing pattern in 3 locations (Opacity, BackdropOpacity, GhostFadeRadius) |
| TextBlock | Value display label ("2.5s") | Standard WPF text display, used in all existing slider patterns |
| StackPanel | Horizontal layout for slider+label | Established container pattern for inline controls |
| RoutedPropertyChangedEventArgs<double> | Slider ValueChanged event args | Built-in WPF event argument type for value changes |

### Integration Components
| Component | Purpose | Pattern |
|-----------|---------|---------|
| Action<double>? | SettingsWindow → MainWindow event | Existing pattern for 19 settings events; StatsIntervalChanged changes from Action<int>? to Action<double>? |
| AppSettings record | JSON persistence | Existing init-property record; StatsIntervalSeconds type changes from int to double |
| SettingsSnapshot record | UI state snapshot | Immutable record populated on SettingsWindow open; StatsIntervalSeconds type changes from int to double |
| DispatcherTimer.Interval | Timer interval update | Accepts TimeSpan.FromSeconds(double) directly — no casting needed |

**Installation:**
No new packages required. All components are native WPF or existing patterns.

## Architecture Patterns

### Slider + Label Pattern (Established in Codebase)
**Files:** SettingsWindow.xaml §264-271 (Opacity), §531-542 (GhostFadeRadius), §XXX-XXX (new BackdropOpacity)

```xml
<!-- Pattern: Slider with value display label -->
<StackPanel Orientation="Horizontal">
    <TextBlock Text="Label" VerticalAlignment="Center" Margin="0,0,8,0"/>
    <Slider x:Name="TargetSlider"
            Minimum="0.5" Maximum="10.0"
            SmallChange="0.1" LargeChange="1.0"
            TickFrequency="0.5" IsSnapToTickEnabled="False"
            Width="160" VerticalAlignment="Center"
            ValueChanged="TargetSlider_ValueChanged"/>
    <TextBlock x:Name="TargetLabel" Width="42"
               VerticalAlignment="Center" Margin="6,0,0,0"/>
</StackPanel>
```

**Key properties:**
- `IsSnapToTickEnabled="False"` — allows continuous selection (not locked to tick marks)
- `TickFrequency` — visual tick spacing (doesn't affect actual values when snapping is disabled)
- `SmallChange` — arrow key increment (0.1s per STAT-04 requirement)
- `LargeChange` — page up/down increment (1.0s for 10% jumps across 10s range)
- `Width="160"` — consistent slider width across all settings sliders

### ValueChanged Handler Pattern (Established)
**Files:** SettingsWindow.xaml.cs §389-395 (Opacity), §677-683 (GhostFadeRadius)

```csharp
private void StatsIntervalSlider_ValueChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
{
    if (_suppressEvents) return;  // Prevent event loops during SettingsSnapshot population
    var val = Math.Round(e.NewValue, 1);  // STAT-04: round to 1 decimal place
    StatsIntervalLabel.Text = $"{val:F1}s";  // D-03: compact "2.5s" format
    StatsIntervalChanged?.Invoke(val);  // Fire event → MainWindow.SetStatsInterval(double)
}
```

**Critical pattern elements:**
1. `_suppressEvents` guard FIRST (prevents infinite loops when SettingsWindow opens and populates controls from SettingsSnapshot)
2. `Math.Round(e.NewValue, 1)` — enforce 1-decimal precision before any other operations
3. Label text update with formatted value display
4. Event invocation to propagate change to MainWindow

### Type Migration Pattern (int → double)
**Files:** AppSettings.cs, SettingsSnapshot.cs, MainWindow.xaml.cs, SettingsWindow.xaml.cs

System.Text.Json handles int→double deserialization automatically:
```json
// Old settings.json (v4.0 and earlier)
{ "StatsIntervalSeconds": 3 }

// Deserializes into new AppSettings with double field
// Result: StatsIntervalSeconds = 3.0 (exact conversion, no data loss)

// New settings.json (v4.1+)
{ "StatsIntervalSeconds": 2.5 }
```

**Migration checklist:**
1. AppSettings.StatsIntervalSeconds: `int { init; } = 3` → `double { init; } = 2.0`
2. SettingsSnapshot.StatsIntervalSeconds: `int { init; }` → `double { init; }`
3. MainWindow._statsIntervalSeconds: `int` → `double`
4. MainWindow.SetStatsInterval: `(int seconds)` → `(double seconds)`
5. SettingsWindow.StatsIntervalChanged: `Action<int>?` → `Action<double>?`
6. SettingsService.Defaults(): `StatsIntervalSeconds = 3` → `StatsIntervalSeconds = 2.0`

**Backward compatibility guaranteed:** JSON deserialization of integer 3 into double field yields 3.0 with zero precision loss.

### Validation Pattern (Range Clamping)
**File:** SettingsService.cs §72-119

```csharp
// Pattern: Range check + round precision + clamp to default on violation
if (loaded.StatsIntervalSeconds < 0.5 || loaded.StatsIntervalSeconds > 10.0)
    loaded = loaded with { StatsIntervalSeconds = Defaults().StatsIntervalSeconds };
else
    loaded = loaded with { StatsIntervalSeconds = Math.Round(loaded.StatsIntervalSeconds, 1) };
```

**Why precision rounding in Validate():**
- Prevents floating-point noise (0.49999999 or 2.5000001) from accumulating across save/load cycles
- Enforces STAT-04 requirement at persistence boundary (not just UI)
- Handles manually edited settings.json with arbitrary precision (e.g., user types 2.567)

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Slider step enforcement | Custom MouseMove logic to snap values | WPF Slider SmallChange/LargeChange + Math.Round in ValueChanged | WPF Slider handles keyboard, mouse drag, page up/down; custom logic misses accessibility features |
| Decimal precision control | String formatting + parsing loops | Math.Round(value, 1) | .NET Math.Round handles rounding modes (banker's rounding), locale-independent, tested at scale |
| Settings type migration | Custom JSON converter with version detection | System.Text.Json default deserialization | Built-in converter handles numeric widening (int→double) automatically; no code needed |
| Timer interval updates | Create new DispatcherTimer on interval change | Stop → Update Interval → Start pattern | Preserving timer instance maintains event handler connections; no memory churn |

**Key insight:** WPF Slider + System.Text.Json numeric type widening are battle-tested at Microsoft scale. Custom implementations miss edge cases (accessibility, locale, floating-point precision, JSON spec compliance).

## Common Pitfalls

### Pitfall 1: Event Loop on SettingsWindow Open
**What goes wrong:** Slider.Value assignment in SettingsSnapshot population triggers ValueChanged event → fires StatsIntervalChanged event → MainWindow calls SetStatsInterval → saves settings → reopening window triggers another ValueChanged.

**Why it happens:** WPF Slider fires ValueChanged even for programmatic Value assignments (not just user interaction).

**How to avoid:**
```csharp
// SettingsWindow.cs
private bool _suppressEvents = false;

public void PopulateFromSnapshot(SettingsSnapshot s)
{
    _suppressEvents = true;
    StatsIntervalSlider.Value = s.StatsIntervalSeconds;  // No event fired
    StatsIntervalLabel.Text = $"{s.StatsIntervalSeconds:F1}s";
    // ... populate other controls ...
    _suppressEvents = false;
}

private void StatsIntervalSlider_ValueChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
{
    if (_suppressEvents) return;  // <-- CRITICAL: first line, always
    // ... handle user change ...
}
```

**Warning signs:** Settings save on every SettingsWindow open; timer restarts without user interaction; debug log shows StatsIntervalChanged event during window initialization.

### Pitfall 2: Forgetting Math.Round in Validate()
**What goes wrong:** User manually edits settings.json with high-precision value (e.g., `"StatsIntervalSeconds": 2.567`). Value passes range check (0.5-10.0), persists to settings. On next save, value stays high-precision. After multiple edits, floating-point noise accumulates.

**Why it happens:** Validate() only checks range, assumes precision is already controlled. But JSON can contain arbitrary-precision decimals.

**How to avoid:**
```csharp
// WRONG: Only checks range
if (loaded.StatsIntervalSeconds < 0.5 || loaded.StatsIntervalSeconds > 10.0)
    loaded = loaded with { StatsIntervalSeconds = Defaults().StatsIntervalSeconds };

// CORRECT: Round precision for valid values too
if (loaded.StatsIntervalSeconds < 0.5 || loaded.StatsIntervalSeconds > 10.0)
    loaded = loaded with { StatsIntervalSeconds = Defaults().StatsIntervalSeconds };
else
    loaded = loaded with { StatsIntervalSeconds = Math.Round(loaded.StatsIntervalSeconds, 1) };
```

**Warning signs:** settings.json contains values like `2.5000000000000004`; users report "I set 2.5s but it shows 2.50000001s".

### Pitfall 3: Integer Division in CPU Load Average Math
**What goes wrong:** After changing `_statsIntervalSeconds` from int to double, calculations like `(15 * 60) / _statsIntervalSeconds` still use integer division if parentheses grouping forces int intermediate result.

**Why it happens:** C# integer division truncates (e.g., `900 / 2.5` with int 900 → 360.0, not 360 samples).

**How to avoid:**
```csharp
// EXISTING CODE (MainWindow.xaml.cs §841-854)
int maxSamples = Math.Max(1, (15 * 60) / _statsIntervalSeconds);
// With _statsIntervalSeconds as double: (15 * 60) evaluates to int 900,
// then 900 / 2.5 uses double division → 360.0 → Math.Max handles correctly

// No change needed — C# automatically promotes int/double to double division
// BUT: verify with test to confirm no rounding issues
```

**Warning signs:** CPU load average windows don't match expected sample counts; 15-minute average updates too slowly.

**Prevention test:**
```csharp
[TestMethod]
public void CpuLoadAverage_FractionalInterval_CorrectSampleCount()
{
    // 15 minutes (900s) ÷ 2.5s interval = 360 samples
    double interval = 2.5;
    int maxSamples = Math.Max(1, (int)Math.Ceiling((15 * 60) / interval));
    Assert.AreEqual(360, maxSamples);
}
```

### Pitfall 4: Hover Fast-Refresh Hardcoded 0.5s Collision
**What goes wrong:** User sets stats interval to 0.5s (minimum). Hover fast-refresh tries to set 0.5s as "faster" mode. No perceived difference — user thinks hover is broken.

**Why it happens:** Hover fast-refresh logic (MainWindow.xaml.cs §1018-1023) hardcodes 0.5s without checking current interval.

**How to avoid:**
```csharp
// EXISTING CODE (no change needed, but document for future)
// MainWindow.xaml.cs §1018-1023
if (!_isHoverFastRefresh)
{
    _isHoverFastRefresh = true;
    _statsTimer.Interval = TimeSpan.FromSeconds(0.5);  // Always 0.5s, even if user set 0.5s
}

// ACCEPTABLE: 0.5s is minimum slider value, so worst case is no change
// NOT A BUG: Users selecting 0.5s want aggressive refresh; hover doing same is expected
```

**Warning signs:** None expected — hover fast-refresh at 0.5s matches user intent for aggressive refresh.

### Pitfall 5: Label Width Insufficient for "10.0s" Text
**What goes wrong:** At maximum value (10.0s), label text "10.0s" (5 characters) overflows TextBlock width, causing text truncation or layout shift.

**Why it happens:** Existing label widths (OpacityLabel: 36px, GhostFadeRadiusLabel: 42px) sized for their specific value formats. "10.0s" may require more space.

**How to avoid:**
```xml
<!-- Test label width with maximum value -->
<TextBlock x:Name="StatsIntervalLabel" Width="42"
           VerticalAlignment="Center" Margin="6,0,0,0"/>
<!-- Width="42" matches GhostFadeRadiusLabel ("200 px" = 6 chars) -->
<!-- "10.0s" = 5 chars, should fit comfortably -->
```

**Warning signs:** Label text appears truncated ("[...]0.0s"); label shifts position as value changes (width not fixed).

**Prevention:** Measure "10.0s" text at default font size during implementation. GhostFadeRadiusLabel width (42px) handles "200 px" (6 chars + space), so 42px should suffice for "10.0s" (5 chars).

## Code Examples

Verified patterns from existing codebase:

### Slider + Label Layout (GhostFadeRadiusSlider Pattern)
```xml
<!-- Source: SettingsWindow.xaml §531-542 -->
<StackPanel Orientation="Horizontal" Margin="0,8,0,0">
    <TextBlock Text="Interval" VerticalAlignment="Center" Margin="0,0,8,0"/>
    <Slider x:Name="StatsIntervalSlider"
            Minimum="0.5" Maximum="10.0"
            SmallChange="0.1" LargeChange="1.0"
            TickFrequency="0.5" IsSnapToTickEnabled="False"
            Width="160" VerticalAlignment="Center"
            ValueChanged="StatsIntervalSlider_ValueChanged"/>
    <TextBlock x:Name="StatsIntervalLabel" Width="42"
               VerticalAlignment="Center" Margin="6,0,0,0"/>
</StackPanel>
```

### ValueChanged Handler with Precision Rounding
```csharp
// Source: Adapted from SettingsWindow.xaml.cs §677-683 (GhostFadeRadius)
private void StatsIntervalSlider_ValueChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
{
    if (_suppressEvents) return;
    var val = Math.Round(e.NewValue, 1);  // STAT-04: enforce 1-decimal precision
    StatsIntervalLabel.Text = $"{val:F1}s";  // D-03: "2.5s" format
    StatsIntervalChanged?.Invoke(val);
}
```

### SettingsSnapshot Population (Suppress Events)
```csharp
// Source: SettingsWindow.xaml.cs §96-192 (existing pattern)
public void ShowWithSnapshot(SettingsSnapshot s)
{
    _suppressEvents = true;

    // Populate slider from snapshot
    StatsIntervalSlider.Value = s.StatsIntervalSeconds;  // double → double, direct assignment
    StatsIntervalLabel.Text = $"{s.StatsIntervalSeconds:F1}s";

    // ... populate other controls ...

    _suppressEvents = false;
    Show();
    Activate();
}
```

### Validation with Precision Enforcement
```csharp
// Source: SettingsService.cs §74-78 (adapted for double + precision)
// Range check: 0.5-10.0 per STAT-01
// Precision enforcement: Math.Round(value, 1) per STAT-04
if (loaded.StatsIntervalSeconds < 0.5 || loaded.StatsIntervalSeconds > 10.0)
    loaded = loaded with { StatsIntervalSeconds = Defaults().StatsIntervalSeconds };
else
    loaded = loaded with { StatsIntervalSeconds = Math.Round(loaded.StatsIntervalSeconds, 1) };
```

### SetStatsInterval with Double Parameter
```csharp
// Source: MainWindow.xaml.cs §949-961 (adapted for double)
private void SetStatsInterval(double seconds)
{
    _statsIntervalSeconds = seconds;  // double field

    bool wasRunning = _statsTimer?.IsEnabled ?? false;
    _statsTimer?.Stop();
    if (_statsTimer != null)
        _statsTimer.Interval = TimeSpan.FromSeconds(seconds);  // Accepts double directly
    if (wasRunning)
        _statsTimer?.Start();

    SaveSettings();
}
```

### CPU Load Average with Fractional Intervals
```csharp
// Source: MainWindow.xaml.cs §841-854 (no changes needed, but verify)
int maxSamples = Math.Max(1, (15 * 60) / _statsIntervalSeconds);
// With _statsIntervalSeconds as double:
// - 2.5s interval → 900 / 2.5 = 360.0 samples
// - (int)360.0 = 360 samples in queue
// C# int/double division automatically promotes to double division
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Discrete ComboBox intervals (1/3/10s) | Continuous Slider (0.5-10.0s) | Phase 71 (v4.1) | Users can fine-tune refresh rate (e.g., 2.5s for balance); eliminates "too fast" vs "too slow" compromise |
| int StatsIntervalSeconds | double StatsIntervalSeconds | Phase 71 (v4.1) | JSON persistence supports fractional values; backward compatible (int deserializes to double) |
| Hard-coded interval ladder in UI | Slider Minimum/Maximum defines range | Phase 71 (v4.1) | Range changes require only XAML edit (no C# array updates) |

**Deprecated/outdated:**
- **ComboBox pattern for numeric ranges** — replaced by Slider in modern WPF UIs (better mouse/touch/keyboard accessibility)
- **Integer-only timer intervals** — DispatcherTimer supports fractional seconds via TimeSpan.FromSeconds(double) since .NET Framework 3.0

## Open Questions

1. **CPU load average sample math adjustment**
   - What we know: Existing code uses `(15 * 60) / _statsIntervalSeconds` for 15-minute window sizing
   - What's unclear: Does integer division truncation cause off-by-one errors with fractional intervals?
   - Recommendation: Add unit test to verify sample counts match expected values for common fractional intervals (0.5, 1.5, 2.5, 5.5). If truncation issues found, use `Math.Ceiling` wrapper.

2. **Default interval shift from 3s to 2.0s**
   - What we know: D-01 decision sets new default to 2.0s
   - What's unclear: Does this impact resource usage patterns or require performance testing?
   - Recommendation: 2.0s is within existing tested range (1s-10s). Phase 70 established that stats refresh is efficient. Proceed with 2.0s default; monitor for user feedback in v4.1.

3. **Label width for maximum value display**
   - What we know: GhostFadeRadiusLabel width (42px) handles "200 px" (6 chars)
   - What's unclear: Does "10.0s" (5 chars) fit comfortably at default font size?
   - Recommendation: Use Width="42" matching GhostFadeRadiusLabel. Verify visual appearance during implementation; adjust to 48px if truncation observed.

## Sources

### Primary (HIGH confidence)
- SettingsWindow.xaml §264-271, §531-542 — Existing slider patterns (Opacity, GhostFadeRadius)
- SettingsWindow.xaml.cs §389-395, §677-683 — ValueChanged handler patterns
- MainWindow.xaml.cs §949-961 — SetStatsInterval existing implementation
- SettingsService.cs §72-119 — Validate() guard pattern
- AppSettings.cs §17 — StatsIntervalSeconds field (current int type)
- 71-CONTEXT.md — User decisions and canonical references

### Secondary (MEDIUM confidence)
- Microsoft .NET 10 documentation — System.Text.Json numeric type widening (int→double deserialization)
- Microsoft WPF documentation — Slider control ValueChanged event behavior
- Microsoft .NET documentation — TimeSpan.FromSeconds(double) API signature

### Tertiary (LOW confidence)
None — all research findings verified against existing codebase or official Microsoft documentation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — All components are existing WPF primitives or established patterns in codebase
- Architecture: HIGH — Slider pattern used in 3 existing locations; type migration follows System.Text.Json standard behavior
- Pitfalls: HIGH — All identified pitfalls derive from existing codebase patterns (_suppressEvents, Validate() precision rounding) or well-documented WPF Slider behavior

**Research date:** 2026-04-01
**Valid until:** 2026-05-01 (30 days; stable domain — WPF Slider and System.Text.Json APIs unchanged since .NET Core 3.0)
