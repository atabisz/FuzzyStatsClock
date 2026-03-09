# Phase 43: Named Themes - Research

**Researched:** 2026-03-09
**Domain:** WPF settings UI extension + AppSettings record + atomic theme application
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### The 5 themes

Personality-archetype approach — each theme has a distinct character:

| Theme    | Accent    | Hex       | Opacity | Clock Mode | Stats    |
|----------|-----------|-----------|---------|------------|----------|
| Midnight | Deep indigo | #6A7FDB | 0.85    | Phrase     | Hidden   |
| Neon     | Electric teal | #00F5D4 | 1.0  | Dial       | Visible  |
| Ghost    | Blue-grey | #C0C8D8   | 0.35    | Phrase     | Hidden   |
| Warm     | Amber     | #F4A261   | 0.90    | Phrase     | Visible  |
| Terminal | Phosphor green | #39FF14 | 0.95 | Dial    | Visible  |

- Each theme uses a custom accent color (not reusing the 5 existing preset swatches)
- Font sizes: Claude's discretion — sensible defaults per archetype

#### Settings UI presentation

- **Layout**: 5 swatch cards in a horizontal row, placed at the **top of the Appearance tab** — before accent color, opacity, and font controls below
- **Card anatomy**: color dot (filled circle in theme accent) + theme name label below it
- **Selection indicator**: 2px border ring in the theme's own accent color when active — matches the existing swatch ring pattern already in the Settings window
- **No active theme**: all 5 cards appear unselected (no ring) when no named theme is active

#### Application timing

- Clicking a theme card **immediately updates the live widget** — real-time effect, consistent with how accent/opacity changes already behave
- Theme properties **persist to settings.json immediately** on click — no Apply/OK needed, consistent with existing settings behavior
- No transition animation — instant snap, same as existing property changes

#### Theme + customization interaction

- Any manual property change made **after** applying a theme clears the active theme: the card ring disappears, no card is highlighted
- `AppSettings.Theme` (the saved theme name) is set to `null` when the user deviates — individual concrete property values (accent, opacity, etc.) remain in settings.json as the source of truth
- On app restart with `Theme == null`: individual properties restore normally, no card is highlighted in the Settings window
- On app restart with a saved `Theme` name: the named theme is re-applied and its card is highlighted

### Claude's Discretion

- Font size per theme (what size is appropriate for Neon vs Ghost vs Terminal)
- Whether stats visibility in a theme applies to all individual stat rows (CPU/GPU/MEM/PAG/BATT) or just the panel-level `StatsVisible` toggle
- `ThemeDefinition` record field names and data structure
- `BuiltInThemes` registry implementation (static class, dictionary, or enum-keyed)
- Exact card dimensions and spacing in the Appearance tab grid layout

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| THM-01 | Settings window Appearance tab offers 5 named built-in themes selectable by the user | SettingsWindow.xaml Appearance tab structure is fully understood; swatch ring pattern confirmed at lines 60–157 of SettingsWindow.xaml; theme card UI follows the same outer-Border ring idiom |
| THM-02 | Applying a theme atomically sets accent color, opacity, font size, clock style, and stats panel visibility | ApplyTheme() + SetAccentColor() + SetDialMode() + SetOpacity() + ApplyFontSize() + SetStatsVisible() call chains all confirmed in MainWindow.xaml.cs; a new ApplyNamedTheme() method will invoke these setters in sequence |
| THM-03 | Active theme name persists to settings.json and restores on launch | AppSettings init-property record pattern confirmed; `Theme` field added as `string?`; SaveSettings() `with` expression must include it; ApplySettings() must re-apply theme on load when Theme != null |
</phase_requirements>

---

## Summary

Phase 43 is a pure in-project extension with no new external dependencies. The codebase already has all the machinery needed: `AppSettings` is an init-property record that supports `with`-expression updates and JSON round-trips via System.Text.Json; `SettingsWindow` uses a clear event-driven architecture where per-setting events flow out from the window and are handled by `MainWindow`; and the swatch ring selection pattern already established in the Appearance tab is the exact visual idiom the new theme cards should copy.

The work breaks into three distinct pieces: (1) a `ThemeDefinition` record and a `BuiltInThemes` static registry in `FuzzyClock.App`; (2) adding `string? Theme` to `AppSettings`, `SettingsSnapshot`, and the `SaveSettings()` `with`-expression, plus an `ApplyNamedTheme()` method in `MainWindow`; and (3) inserting the theme card row at the top of the Appearance tab in `SettingsWindow.xaml` with a matching `ThemeSelected` event and `SetActiveThemeCard()` helper.

The "clear theme on manual change" invariant is the most coordination-sensitive part: every existing event handler in `MainWindow.OpenSettings()` that changes a property covered by themes must also null out `_currentTheme` before saving.

**Primary recommendation:** Add `ThemeDefinition` + `BuiltInThemes` as a new file in `FuzzyClock.App`, follow the existing swatch ring pattern for cards, wire a single `ThemeSelected` event from `SettingsWindow`, and apply all theme properties inside one `ApplyNamedTheme()` method that calls the existing property-setter chain.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| .NET 10 WPF | 10.0 | UI framework — XAML, `Border`, `Ellipse`, event handlers | Already the project stack |
| System.Text.Json | .NET BCL | JSON serialization of `AppSettings` including new `Theme?` field | Already used in `SettingsService` |
| MSTest 4.0.1 | 4.0.1 | Unit tests for round-trip and absent-field behavior | Already used in both test projects |

### Supporting

No new NuGet packages needed. Everything required is already in the project.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Static `BuiltInThemes` class (dictionary) | Enum-keyed array | Dictionary is simpler to look up by string name, which is what `AppSettings.Theme` stores; enum adds a parse step |
| `string? Theme` in AppSettings | Separate `ThemeEnabled` bool + `ThemeName` string | Single nullable string is simpler; null means "no theme active" — no separate flag needed |

---

## Architecture Patterns

### Recommended Project Structure

```
FuzzyClock.App/
├── AppSettings.cs             # + string? Theme { get; init; } = null
├── SettingsSnapshot.cs        # + string? ActiveTheme { get; init; } = null
├── SettingsService.cs         # Defaults() keeps Theme = null; Validate() no-op for nullable
├── ThemeDefinition.cs         # NEW: ThemeDefinition record + BuiltInThemes static class
├── SettingsWindow.xaml        # + theme card row at top of Appearance tab
├── SettingsWindow.xaml.cs     # + ThemeSelected event + SetActiveThemeCard() helper
└── MainWindow.xaml.cs         # + _currentTheme field + ApplyNamedTheme() + clear-on-manual-change
```

### Pattern 1: AppSettings init-property record extension

**What:** Add `string? Theme` with `= null` default. The existing `with`-expression update pattern in `SaveSettings()` must include `Theme = _currentTheme`.
**When to use:** Every new persisted field follows this pattern in this codebase.

```csharp
// In AppSettings.cs — append after DateFormat line
public string? Theme { get; init; } = null;  // null = no named theme active
```

```csharp
// In SaveSettings() with-expression (MainWindow.xaml.cs ~line 387)
_settings = _settings with
{
    // ... existing fields ...
    Theme = _currentTheme,
};
```

**JSON compat note:** System.Text.Json serializes `null` as `"Theme":null` and a missing field deserializes as the init default `null`. Both are handled correctly — no Validate() guard needed for a nullable string.

### Pattern 2: ThemeDefinition record + BuiltInThemes registry

**What:** A pure-data record describing one theme's properties, and a static dictionary keyed by theme name string.

```csharp
// ThemeDefinition.cs — new file in FuzzyClock.App
using System.Windows.Media;

namespace FuzzyClock.App;

internal record ThemeDefinition
{
    public required string Name         { get; init; }
    public required Color  AccentColor  { get; init; }
    public required double Opacity      { get; init; }
    public required int    FontSize     { get; init; }
    public required bool   DialMode     { get; init; }
    public required bool   StatsVisible { get; init; }
}

internal static class BuiltInThemes
{
    public static readonly IReadOnlyDictionary<string, ThemeDefinition> All =
        new Dictionary<string, ThemeDefinition>
        {
            ["Midnight"] = new ThemeDefinition
            {
                Name        = "Midnight",
                AccentColor = Color.FromArgb(0xFF, 0x6A, 0x7F, 0xDB),
                Opacity     = 0.85,
                FontSize    = 32,
                DialMode    = false,
                StatsVisible = false,
            },
            ["Neon"] = new ThemeDefinition
            {
                Name        = "Neon",
                AccentColor = Color.FromArgb(0xFF, 0x00, 0xF5, 0xD4),
                Opacity     = 1.0,
                FontSize    = 32,
                DialMode    = true,
                StatsVisible = true,
            },
            ["Ghost"] = new ThemeDefinition
            {
                Name        = "Ghost",
                AccentColor = Color.FromArgb(0xFF, 0xC0, 0xC8, 0xD8),
                Opacity     = 0.35,
                FontSize    = 28,
                DialMode    = false,
                StatsVisible = false,
            },
            ["Warm"] = new ThemeDefinition
            {
                Name        = "Warm",
                AccentColor = Color.FromArgb(0xFF, 0xF4, 0xA2, 0x61),
                Opacity     = 0.90,
                FontSize    = 32,
                DialMode    = false,
                StatsVisible = true,
            },
            ["Terminal"] = new ThemeDefinition
            {
                Name        = "Terminal",
                AccentColor = Color.FromArgb(0xFF, 0x39, 0xFF, 0x14),
                Opacity     = 0.95,
                FontSize    = 24,
                DialMode    = true,
                StatsVisible = true,
            },
        };

    public static ThemeDefinition? TryGet(string? name) =>
        name is not null && All.TryGetValue(name, out var def) ? def : null;
}
```

**Font size discretion rationale:**
- Midnight (32) — atmospheric and readable; standard size suits an immersive feel
- Neon (32) — dial mode, font only shows in phrase mode fallback; 32 is fine
- Ghost (28) — deliberately understated; slightly smaller reinforces the barely-there aesthetic
- Warm (32) — friendly and readable at standard size
- Terminal (24) — compact/dense aesthetic matches the "hacker terminal" archetype

**Stats visibility discretion rationale:** Apply only the panel-level `StatsVisible` toggle. Overriding individual row visibility (CPU/GPU/MEM/PAG/BATT) during theme application would destructively overwrite the user's per-row preferences. The panel-level toggle is sufficient for the "one click to see stats" vs "no stats" distinction each theme defines.

### Pattern 3: ApplyNamedTheme() in MainWindow

**What:** Batch property setter that applies all theme properties, then saves. Suppresses theme-clearing during batch apply.

```csharp
// MainWindow.xaml.cs — new method
private void ApplyNamedTheme(ThemeDefinition theme)
{
    // Set _currentTheme BEFORE calling individual setters,
    // so SaveSettings() doesn't clear it mid-apply.
    _currentTheme = theme.Name;

    // Apply properties using existing setters (they handle UI + state):
    SetAccentColor(theme.AccentColor);   // calls ApplyTheme() + SaveSettings()
    SetOpacity(theme.Opacity);           // calls SaveSettings()
    ApplyFontSize(theme.FontSize);       // does NOT call SaveSettings() — caller must
    SetDialMode(theme.DialMode);         // calls SaveSettings()
    SetStatsVisible(theme.StatsVisible); // does NOT call SaveSettings() — caller must

    // Final save to persist Theme field and any unsaved changes
    SaveSettings();
}
```

**Critical note on SaveSettings call chain:** Several existing setters already call `SaveSettings()` internally (SetAccentColor, SetOpacity, SetDialMode). This means SaveSettings runs multiple times during ApplyNamedTheme. Each intermediate save will correctly include `_currentTheme` because the field is set before any setter is called. This is acceptable — the saves are cheap (atomic file write to `%LOCALAPPDATA%`).

**Alternative:** Suppress intermediate saves with a flag. Not needed — the pattern is consistent with how existing property changes already save immediately, and correctness is more important than minimizing saves.

### Pattern 4: Clearing theme on manual change

**What:** Each individual property change event handler in `MainWindow.OpenSettings()` must clear `_currentTheme` (set to null) and call `_settingsWindow?.ClearActiveThemeCard()` before the existing setter call.

```csharp
// Modified wiring in OpenSettings() — example for accent color
_settingsWindow.AccentColorChanged += c =>
{
    ClearActiveTheme();
    SetAccentColor(c);
};

// New helper in MainWindow
private void ClearActiveTheme()
{
    _currentTheme = null;
    // Window may not be open (e.g., if change came from scroll wheel on widget)
    _settingsWindow?.ClearActiveThemeCard();
    // SaveSettings() will be called by the individual setter — no need to call here
}
```

**Which properties clear the theme:** accent color, opacity, font size, clock mode (dial/phrase), stats panel visibility. NOT: per-row stat visibility, update interval, process threshold, date, ghost mode, auto-contrast, auto-launch — these are not part of any theme definition.

### Pattern 5: Theme card UI in SettingsWindow.xaml

**What:** A horizontal row of 5 cards at the top of the Appearance tab. Each card uses the same outer `Border` (ring) + inner content pattern as the accent swatches.

```xml
<!-- Theme Picker — top of Appearance tab, before Accent Color section -->
<TextBlock Text="Theme" FontWeight="SemiBold" Margin="0,0,0,6"/>
<StackPanel Orientation="Horizontal" Margin="0,0,0,14">
    <!-- Each theme card: outer ring Border + inner card Border with dot + label -->
    <Border x:Name="RingThemeMidnight" BorderThickness="0" CornerRadius="6" Padding="2" Margin="0,0,6,0">
        <Border Width="60" Height="64" Background="#FFF0F0F5"
                CornerRadius="4" Cursor="Hand"
                MouseLeftButtonDown="ThemeMidnight_Click">
            <StackPanel VerticalAlignment="Center" HorizontalAlignment="Center">
                <Ellipse Width="20" Height="20" Fill="#FF6A7FDB" Margin="0,0,0,4"/>
                <TextBlock Text="Midnight" FontSize="10" HorizontalAlignment="Center"
                           Foreground="#FF333333"/>
            </StackPanel>
        </Border>
    </Border>
    <!-- ... repeat for Neon, Ghost, Warm, Terminal ... -->
</StackPanel>
```

**Ring activation:** The `SetActiveThemeCard()` helper mirrors `SetActiveSwatch()` exactly, except the ring color uses the theme's own accent color rather than a fixed blue. This is the locked decision from CONTEXT.md: "2px border ring in the theme's own accent color when active."

```csharp
// SettingsWindow.xaml.cs
private void SetActiveThemeCard(Border? activeRing, Color ringColor)
{
    var rings = new[] { RingThemeMidnight, RingThemeNeon, RingThemeGhost,
                        RingThemeWarm, RingThemeTerminal };
    foreach (var r in rings)
    {
        r.BorderThickness = new Thickness(0);
        r.BorderBrush     = null;
    }
    if (activeRing is not null)
    {
        activeRing.BorderThickness = new Thickness(2);
        activeRing.BorderBrush     = new SolidColorBrush(ringColor);
    }
}

// Public method so MainWindow can call it when theme is cleared by manual property change
public void ClearActiveThemeCard() => SetActiveThemeCard(null, default);
```

**Event from SettingsWindow:**

```csharp
public event Action<string>? ThemeSelected;  // fires with theme name, e.g. "Midnight"
```

**MainWindow wiring in OpenSettings():**

```csharp
_settingsWindow.ThemeSelected += name =>
{
    if (BuiltInThemes.TryGet(name) is { } theme)
        ApplyNamedTheme(theme);
};
```

### Pattern 6: ApplySettings() on startup with saved Theme

**What:** When the app starts with a saved `Theme` name, re-apply the named theme. This happens in `ApplySettings()`, which is called before `Show()`.

```csharp
// In ApplySettings() — add after all other property applications
if (s.Theme is not null && BuiltInThemes.TryGet(s.Theme) is { } savedTheme)
{
    // Apply theme properties directly (not via ApplyNamedTheme which calls ApplyTheme)
    // because ApplyTheme() is unsafe before ContentRendered (decoration lists are empty).
    // We set the field values; ApplyTheme() will be called in ContentRendered.
    _currentTheme = s.Theme;
    _accentColor  = savedTheme.AccentColor;
    _windowOpacity = savedTheme.Opacity;
    _currentFontSize = savedTheme.FontSize;
    _dialMode = savedTheme.DialMode;
    // StatsVisible already applied above from s.StatsVisible
    // (the theme's StatsVisible was persisted to s.StatsVisible at save time)
}
```

**Important:** The pattern in `ApplySettings()` must NOT call `ApplyNamedTheme()` (which calls `ApplyTheme()`) because `ApplyTheme()` is unsafe before `ContentRendered` — the dial decoration lists are empty. The existing comment at line 267 in the current code reads: `// Do NOT call ApplyTheme() here — _hourTickElements etc. are empty until ContentRendered`. The startup restore follows the same discipline as all other `ApplySettings()` property restores: set the field, let `ContentRendered` call `ApplyTheme()`.

### Pattern 7: SettingsSnapshot and SettingsWindow population

**What:** `SettingsSnapshot` gains `string? ActiveTheme` so the window can highlight the correct card on open.

```csharp
// SettingsSnapshot.cs — add after AutoLaunchEnabled
public string? ActiveTheme { get; init; } = null;
```

```csharp
// GetCurrentSettingsSnapshot() — add
ActiveTheme = _currentTheme,
```

```csharp
// SettingsWindow PopulateControls() — add after SetActiveSwatch call
if (s.ActiveTheme is not null)
{
    Border? ring = s.ActiveTheme switch
    {
        "Midnight" => RingThemeMidnight,
        "Neon"     => RingThemeNeon,
        "Ghost"    => RingThemeGhost,
        "Warm"     => RingThemeWarm,
        "Terminal" => RingThemeTerminal,
        _          => null,
    };
    Color accent = BuiltInThemes.TryGet(s.ActiveTheme)?.AccentColor ?? default;
    SetActiveThemeCard(ring, accent);
}
```

### Anti-Patterns to Avoid

- **Calling ApplyNamedTheme() from ApplySettings():** Unsafe before ContentRendered. Set fields directly in ApplySettings(), let ContentRendered call ApplyTheme().
- **Clearing _currentTheme in SaveSettings() itself:** SaveSettings() reads _currentTheme to persist it — clearing it there would always write null. Clear only in ClearActiveTheme().
- **Using `required` on ThemeDefinition properties in C# without null-safety review:** `required` works fine; just ensure all dictionary initializers supply every required property.
- **Ring color for theme cards = fixed blue (like accent swatches):** Wrong per CONTEXT.md — the ring must use the theme's own accent color.
- **Applying individual stat row visibility as part of theme:** Claude's discretion resolved to panel-level `StatsVisible` only; don't override per-row CPU/GPU/MEM/PAG/BATT visibility.
- **Using ToggleButton/RadioButton for theme cards:** The existing pattern uses plain `Border` with `MouseLeftButtonDown` — stick to this. RadioButton/ToggleButton add IsChecked binding complexity for no benefit.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON persistence of nullable string | Custom null serialization | System.Text.Json default | Already used; handles `null` → `"Theme":null` natively |
| Theme card visual state | Custom XAML DataTrigger binding | Set `BorderThickness` + `BorderBrush` in code-behind | Matches the exact SetActiveSwatch() pattern already in the codebase; simpler than triggers for 5 named elements |
| Theme lookup by name | Linear search or switch | `Dictionary<string, ThemeDefinition>` | O(1) lookup; trivially extensible |

**Key insight:** This phase adds no algorithmic complexity. Every sub-problem is a straightforward extension of an established pattern in the codebase.

---

## Common Pitfalls

### Pitfall 1: ApplyTheme() called before ContentRendered
**What goes wrong:** `NullReferenceException` or silent no-op on dial decoration elements because `_hourTickElements` etc. are empty lists until `InitDialDecorations()` runs in `ContentRendered`.
**Why it happens:** `ApplySettings()` is called before `Show()`, and `ApplyTheme()` iterates the decoration lists.
**How to avoid:** In `ApplySettings()`, set field values only (same as all other properties). ContentRendered calls `ApplyTheme()` after `InitDialDecorations()`. The comment at line 267 in the current `ApplySettings()` already documents this constraint.
**Warning signs:** Widget startup with a saved theme shows incorrect color or throws at launch.

### Pitfall 2: SaveSettings() called during ApplyNamedTheme() before _currentTheme is set
**What goes wrong:** The first call to an individual setter (e.g. `SetAccentColor`) triggers `SaveSettings()` before `_currentTheme` is assigned, writing `Theme = null` to JSON.
**Why it happens:** `SetAccentColor` calls `SaveSettings()` internally. If `_currentTheme` is set after calling setters, the first save writes null.
**How to avoid:** Set `_currentTheme = theme.Name` as the FIRST statement in `ApplyNamedTheme()`, before any setter call.
**Warning signs:** After clicking a theme card, app restart does not restore the theme.

### Pitfall 3: Theme not cleared when user changes a covered property
**What goes wrong:** User clicks "Midnight" theme, then moves the opacity slider — the card ring stays active even though the actual opacity no longer matches the theme.
**Why it happens:** Forgetting to call `ClearActiveTheme()` in the event handler wiring in `OpenSettings()`.
**How to avoid:** Review every event handler subscription in `OpenSettings()` — the five covered properties (accent color, opacity, font size, clock mode, stats visibility) each need a `ClearActiveTheme()` call before the actual setter.
**Warning signs:** Settings window shows an active theme card even when live widget properties differ from that theme.

### Pitfall 4: ClearActiveThemeCard() called when SettingsWindow is null
**What goes wrong:** `NullReferenceException` when a property changes via scroll wheel (opacity) while the Settings window is closed.
**Why it happens:** `_settingsWindow` is null when the window is not open. Calling `_settingsWindow.ClearActiveThemeCard()` without a null check crashes.
**How to avoid:** Use `_settingsWindow?.ClearActiveThemeCard()` (null-conditional operator).
**Warning signs:** Exception on opacity scroll wheel when Settings window is closed.

### Pitfall 5: AppSettings.Theme persists stale value on Reset to Defaults
**What goes wrong:** After "Reset to Defaults", `Theme` is still set to the last theme name.
**Why it happens:** The `ResetToDefaults()` method builds a `SettingsService.Defaults()` instance, which correctly has `Theme = null`. But if `_currentTheme` is not reset separately, the next `SaveSettings()` re-writes the old theme name.
**How to avoid:** In `ResetToDefaults()`, add `_currentTheme = null;` before the save, and call `_settingsWindow?.ClearActiveThemeCard()`.
**Warning signs:** After Reset to Defaults, a theme card still shows a ring; on restart the old theme is re-applied.

### Pitfall 6: SettingsSnapshot missing ActiveTheme — card doesn't restore on window re-open
**What goes wrong:** User selects a theme, closes Settings, reopens Settings — no card is highlighted.
**Why it happens:** `GetCurrentSettingsSnapshot()` omits `ActiveTheme = _currentTheme`.
**How to avoid:** Add `ActiveTheme = _currentTheme` to `GetCurrentSettingsSnapshot()`.
**Warning signs:** Theme card ring absent on Settings re-open even when a theme is active.

---

## Code Examples

### AppSettings record extension

```csharp
// AppSettings.cs — add after DateFormat property
public string? Theme { get; init; } = null;
// null = no named theme active; "Midnight"|"Neon"|"Ghost"|"Warm"|"Terminal" = theme name
```

### SaveSettings() with-expression addition

```csharp
// MainWindow.xaml.cs — in the SaveSettings() with-expression block
_settings = _settings with
{
    // ... existing fields ...
    Theme = _currentTheme,
};
```

### SettingsWindow ThemeSelected event + handler skeleton

```csharp
// SettingsWindow.xaml.cs
public event Action<string>? ThemeSelected;

private void ThemeMidnight_Click(object sender, MouseButtonEventArgs e)
{
    if (_suppressEvents) return;
    SetActiveThemeCard(RingThemeMidnight,
        Color.FromArgb(0xFF, 0x6A, 0x7F, 0xDB));
    ThemeSelected?.Invoke("Midnight");
}
```

### MainWindow _currentTheme field declaration

```csharp
// MainWindow.xaml.cs — alongside other private fields
private string? _currentTheme = null;  // null = no named theme active
```

### ApplySettings() startup theme restore (field-only, no ApplyTheme call)

```csharp
// At the end of ApplySettings(), after all other field assignments
if (s.Theme is not null && BuiltInThemes.TryGet(s.Theme) is { } savedTheme)
{
    _currentTheme    = s.Theme;
    _accentColor     = savedTheme.AccentColor;
    _windowOpacity   = savedTheme.Opacity;
    _currentFontSize = savedTheme.FontSize;
    _dialMode        = savedTheme.DialMode;
    // Stats visibility was already applied earlier from s.StatsVisible
    // (which was written from the theme at save time)
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No themes | Named themes via ThemeDefinition + BuiltInThemes | Phase 43 | Users can apply 5 personality presets in one click |
| AppSettings had no Theme field | `string? Theme` added | Phase 43 | Startup can restore the last-selected theme |
| SettingsWindow Appearance tab starts at Accent Color | Themes row at top, then Accent Color | Phase 43 | Most prominent feature is first in the UI |

---

## Open Questions

1. **Stats visibility scope (panel-level vs per-row)**
   - What we know: CONTEXT.md marks this as Claude's discretion
   - What's unclear: Whether "stats visibility" means just `StatsVisible` (panel show/hide) or also individual row toggles
   - Recommendation: Panel-level `StatsVisible` only. Applying per-row changes would destructively overwrite user preferences (e.g., user hid GPU but kept CPU). Themes set the coarse-grained "show stats or not" intent; user's per-row choices survive unchanged.

2. **Font sizes for each theme**
   - What we know: Claude's discretion per CONTEXT.md
   - Recommendation (based on archetype analysis):
     - Midnight: 32 (atmospheric but readable)
     - Neon: 32 (standard — dial mode primary display)
     - Ghost: 28 (slightly smaller reinforces the barely-there aesthetic at 0.35 opacity)
     - Warm: 32 (friendly, comfortable, standard)
     - Terminal: 24 (compact/dense; "hacker terminal" aesthetic; fits the small phosphor-green text look)

3. **ResetToDefaults and theme clearing**
   - What we know: `ResetToDefaults()` is in MainWindow.xaml.cs; it calls `SettingsService.Defaults()` which will have `Theme = null`
   - Gap: Need to verify `_currentTheme = null` is added to ResetToDefaults and that `_settingsWindow?.ClearActiveThemeCard()` is called
   - Recommendation: Include this in the implementation task for ApplyNamedTheme/ClearActiveTheme.

---

## Sources

### Primary (HIGH confidence)

- `FuzzyClock.App/AppSettings.cs` — full record structure; confirmed init-property pattern with `= default` values
- `FuzzyClock.App/SettingsService.cs` — Validate(), Defaults(), Save() patterns; confirmed atomic write pattern
- `FuzzyClock.App/SettingsWindow.xaml` — full Appearance tab structure; confirmed swatch ring pattern (outer Border + x:Name RingXxx + SetActiveSwatch helper)
- `FuzzyClock.App/SettingsWindow.xaml.cs` — event-driven architecture; confirmed `_suppressEvents` pattern; `SetActiveSwatch()` helper at line 143
- `FuzzyClock.App/MainWindow.xaml.cs` — ApplyTheme() at line 1095; ApplySettings() at line 181; SetAccentColor() at line 1185; SaveSettings() with-expression at line 387; OpenSettings() event wiring at line 323; ClearActiveTheme concern identified at line 334
- `FuzzyClock.App/SettingsSnapshot.cs` — confirmed snapshot record fields; confirmed no Theme field yet
- `FuzzyClock.App.Tests/AppSettingsTests.cs` — confirmed test pattern for absent-field defaults and round-trips

### Secondary (MEDIUM confidence)

- Project CONTEXT.md, REQUIREMENTS.md, ROADMAP.md, STATE.md — design decisions and phase context

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all relevant code read directly; no external libraries needed
- Architecture: HIGH — all integration points confirmed from source; patterns are direct copies of existing idioms
- Pitfalls: HIGH — derived from direct code analysis of call chains (SaveSettings, ApplySettings, event wiring)

**Research date:** 2026-03-09
**Valid until:** 2026-04-08 (stable codebase; no fast-moving dependencies)
