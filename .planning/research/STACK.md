# Technology Stack: v4.1 Polish & Phrases

**Project:** FuzzyStatsClock v4.1
**Researched:** 2026-03-31

## Executive Summary

v4.1 adds visual polish and phrase expansions to an established C# WPF codebase. **No new dependencies or frameworks required** — all features implementable with existing WPF primitives and System.Text.Json. Key changes: XAML Margin/Padding adjustment on BackdropBorder; Slider with decimal TickFrequency for continuous stats interval; simple deletion of theme UI/code with one-time settings migration; phrase provider array expansion following established multi-candidate pattern.

## Recommended Stack

### No Changes Required

All v4.1 features work with the existing validated stack:

| Technology | Version | Current Use | v4.1 Use |
|------------|---------|-------------|----------|
| C# / .NET | 10.0 | WPF desktop app, System.Text.Json | Same |
| WPF | Built-in (.NET 10) | Transparent overlay, Border/Slider/StackPanel controls | BackdropBorder Padding, decimal Slider |
| System.Text.Json | Built-in (.NET 10) | AppSettings serialization (init-property record) | Theme field removal migration |

### No New Libraries

v4.1 requires **zero NuGet packages or new assemblies**.

## Feature-Specific Stack Notes

### 1. Backdrop Padding

**Current:** `BackdropBorder` wraps full StackPanel with `Padding="0"` (implicit).

**Change:** Set `Padding="12"` in XAML or code-behind.

**WPF Pattern:**
- **Border.Padding** controls interior spacing between Border edge and child content.
- **Margin** controls exterior spacing between Border and siblings/parent.
- For backdrop padding around clock text, **Padding is correct** (expands backdrop footprint without shifting widget position).

**Example:**
```xml
<Border x:Name="BackdropBorder"
        Background="Transparent"
        CornerRadius="5"
        Padding="12"
        IsHitTestVisible="False"/>
```

**Why not Margin:** Margin on BackdropBorder would shift the entire widget relative to its parent Grid — not the desired effect. Padding inflates the backdrop canvas without moving the widget.

**Source:** WPF Border documentation (official .NET docs); validated in existing MainWindow.xaml (ContentBorder already uses `Padding="6"`).

---

### 2. Stats Interval Slider (0.5–10s Continuous)

**Current:** ComboBox with 3 discrete values (1s / 3s / 10s).

**Change:** Slider with `Minimum="0.5" Maximum="10.0"` and decimal `TickFrequency`.

**WPF Slider Configuration for Decimal Steps:**

```xml
<Slider x:Name="StatsIntervalSlider"
        Minimum="0.5" Maximum="10.0"
        SmallChange="0.1" LargeChange="1.0"
        TickFrequency="0.5" IsSnapToTickEnabled="False"
        Width="180" VerticalAlignment="Center"
        ValueChanged="StatsIntervalSlider_ValueChanged"/>
```

**Key Properties:**
- `Minimum`/`Maximum`: Double type — supports decimals natively.
- `SmallChange="0.1"`: Keyboard arrow step (tenths of a second).
- `LargeChange="1.0"`: Page Up/Down step (full seconds).
- `TickFrequency="0.5"`: Visual tick marks every 0.5s (cosmetic only).
- `IsSnapToTickEnabled="False"`: Allows smooth drag to any decimal value (not just ticks).

**Persistence:**
- AppSettings.StatsIntervalSeconds: change from `int` to `double`.
- SettingsService.Validate(): update guard to `if (settings.StatsIntervalSeconds < 0.5 || settings.StatsIntervalSeconds > 10.0) { ... settings with { StatsIntervalSeconds = 3.0 } }`.
- DispatcherTimer.Interval: already accepts `TimeSpan.FromSeconds(double)` — no code change needed.

**Existing Pattern:** SettingsWindow.xaml already uses decimal Slider for Opacity (lines 264–269):
```xml
<Slider x:Name="OpacitySlider"
        Minimum="0.20" Maximum="1.00"
        SmallChange="0.01" LargeChange="0.05"
        TickFrequency="0.05" IsSnapToTickEnabled="False"/>
```

**Source:** WPF Slider documentation (official .NET docs); validated pattern in existing SettingsWindow.xaml.

---

### 3. More Phrase Variations

**Current:** 19 phrase providers with 4–48 candidate phrases each (avg ~12 per bucket).

**Change:** Expand candidate arrays in existing providers (no new providers; no new files).

**Pattern:** Multi-candidate bucket arrays with Random.Shared selection:

```csharp
private static readonly (int UpperBound, string[] Candidates)[] Buckets =
[
    ( 2, [
        "solid {h} o'clock, daddy-o",
        "that's {h} on the nose, cat",
        "straight-up {h} — dig it",
        "all reet, it's {h}, hep cat",
        // Add 4–8 more candidates here
    ]),
    // ... 11 more buckets
];
```

**No Stack Changes:** Phrase providers are pure logic classes in FuzzyClock.Core (no WPF, no JSON, no Win32). Expanding arrays requires only creativity and typing.

**Testing:** MSTest already covers all 19 providers (352 Core + 38 App = 390 total tests). New candidates increase randomness within existing test coverage (no new test surface).

**Source:** Existing JivePhraseProvider.cs, PiratePhraseProvider.cs patterns (lines 18–92).

---

### 4. Expanded Jive/Pirate/Yoda Personalities

**Same as #3.** Jive/Pirate/Yoda are three of the 19 existing providers. Expansion follows the same multi-candidate pattern.

**Vocabulary Sources (for research/writing):**
- Jive: Cab Calloway's Hepster's Dictionary (1938), Dan Burley's Original Handbook of Harlem Jive (1944) — already cited in JivePhraseProvider.cs comments.
- Pirate: Period nautical terminology, sea shanty vocabulary.
- Yoda: Subject-object-verb inversion, "much" and "great" intensifiers, Dagobah hermit diction.

**No new dependencies or external APIs.** Phrase expansion is content authoring, not technical integration.

---

### 5. Remove Named Themes

**Current:** 5 named themes in `ThemeDefinition.cs` + `BuiltInThemes.All` dictionary; Settings UI has 5 theme cards; AppSettings.Theme field stores active theme name.

**Removal Plan:**

#### Code Deletion
1. Delete `FuzzyClock.App/ThemeDefinition.cs` (74 lines).
2. Delete theme cards from `SettingsWindow.xaml` (lines 58–161).
3. Delete 5 theme click handlers from `SettingsWindow.xaml.cs` (`ThemeMidnight_Click`, `ThemeNeon_Click`, etc.).
4. Delete `ApplyNamedTheme(ThemeDefinition)` from `MainWindow.xaml.cs`.
5. Delete theme ring highlight logic from `SettingsWindow.RefreshControls()`.

#### Settings Migration (One-Time)
Users upgrading from v4.0 may have `"Theme": "Midnight"` in settings.json. On first v4.1 launch, detect and clear:

```csharp
// In SettingsService.Load() after JsonSerializer.Deserialize:
if (settings.Theme is not null)
{
    settings = settings with { Theme = null };
    Save(settings);  // Persist migration immediately
}
```

**Why Safe:** AppSettings.Theme is `string? = null` (nullable, default null). Old settings with `"Theme": "Midnight"` deserialize correctly; migration sets to null; future saves omit the field. No data loss — theme was a composite convenience (accent+opacity+font+clock+stats), not unique state. All constituent settings (AccentColor, Opacity, FontSize, ClockType, StatsVisible) remain intact.

**System.Text.Json Behavior:**
- Fields with `null` value are **omitted** from JSON output by default (no `"Theme": null` clutter).
- Deserialization of absent fields uses init-property default (`= null`).

**Existing Pattern:** AppSettings already uses nullable string for PhraseLocale with conditional logic. Theme removal follows the same pattern.

**Source:** System.Text.Json documentation (official .NET docs); validated in existing AppSettings.cs (line 43: `public string? Theme { get; init; } = null;`).

---

## Alternatives Considered

| Feature | Alternative | Why Not |
|---------|-------------|---------|
| Backdrop Padding | Wrap StackPanel in second Border with Margin | Double nesting adds XAML complexity; Padding on existing BackdropBorder is simpler |
| Stats Interval Slider | NumericUpDown with 0.1s step | WPF has no built-in NumericUpDown (WinForms only); Slider is native WPF and established pattern |
| Phrase Variations | JSON phrase files in `%LOCALAPPDATA%` | Adds I/O, parsing, validation overhead; arrays are faster and compile-time validated |
| Theme Removal | Deprecate UI but keep code | Dead code accumulates; clean deletion is healthier than zombie features |

---

## Installation

**No changes.** v4.1 uses the same build/publish/installer pipeline as v4.0.

---

## WPF-Specific Considerations

### Backdrop Padding Margin vs Padding

**Critical distinction:**
- **Border.Margin**: Space **outside** the Border (between Border and siblings).
- **Border.Padding**: Space **inside** the Border (between Border edge and child content).

For backdrop expansion around clock content:
- ✅ **Padding** — expands backdrop footprint around content.
- ❌ **Margin** — shifts entire widget without expanding backdrop.

**Verification:** ContentBorder (Row 0) already uses `Padding="6"` — same pattern.

### Slider Decimal Interval

WPF Slider `Minimum`/`Maximum`/`Value` are `double` type — decimals work natively. No special configuration beyond setting `SmallChange`/`LargeChange` to decimal values.

**Gotcha:** `IsSnapToTickEnabled="True"` would force values to discrete ticks (0.5, 1.0, 1.5, etc.). For smooth continuous drag, **must be `False`**.

### Theme Removal Cleanup

**Risk:** Stale references in MainWindow.

**Mitigation:**
1. Grep for `ThemeDefinition` and `BuiltInThemes` after deletion — zero matches = clean.
2. Grep for `ApplyNamedTheme` — should only appear in git history, not current code.
3. AppSettings.Theme field can remain (nullable; ignored in v4.1+) or be deleted (requires migration logic to strip field on load). **Recommendation:** Leave field, set to null, ignore in code. Future v4.2 can delete field after migration window.

**Existing Pattern:** Decision 454 (phrase wrap) shows the established migration pattern: detect old schema, copy to new schema, save immediately.

---

## Phrase Provider Testing

**Existing Coverage:** 19 providers × ~8 test methods each = ~152 provider-specific tests in FuzzyClock.Core.Tests.

**For v4.1 Phrase Expansion:**
- Existing tests call `GetPhrase(dt)` for all 12 buckets + noon/midnight.
- Adding candidates to existing buckets **does not change test surface** (random selection within bucket).
- Tests verify bucket coverage, not specific phrase text (except special cases like noon/midnight).

**No new tests required** unless adding new buckets (v4.1 scope is more candidates, not new buckets).

---

## Sources

- **WPF Border/Slider:** Official .NET documentation (learn.microsoft.com/dotnet/desktop/wpf)
- **System.Text.Json nullable handling:** Official .NET documentation (learn.microsoft.com/dotnet/standard/serialization/system-text-json)
- **Existing patterns:** Validated in FuzzyClock.App codebase (MainWindow.xaml lines 28–46, SettingsWindow.xaml lines 264–269, AppSettings.cs line 43)
- **Phrase provider pattern:** JivePhraseProvider.cs, PiratePhraseProvider.cs (FuzzyClock.Core)

---

## Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Backdrop Padding | **HIGH** | Verified WPF Border.Padding pattern already used in ContentBorder; official docs confirm semantics |
| Slider Decimals | **HIGH** | Existing OpacitySlider uses decimal Minimum/Maximum/TickFrequency; identical pattern for stats interval |
| Phrase Expansion | **HIGH** | 19 providers already use multi-candidate arrays; expansion is content authoring, not technical risk |
| Theme Removal | **HIGH** | System.Text.Json nullable field handling is standard; existing AppSettings already uses nullable Theme field |

---

**Summary:** v4.1 requires **zero new dependencies**. All features implementable with existing WPF controls, System.Text.Json, and established codebase patterns. No architectural risk. No version upgrades.
