# Architecture Integration — v4.1 Polish & Phrases

**Project:** FuzzyClock v4.1
**Researched:** 2026-03-31

## Executive Summary

The 5 features in v4.1 integrate cleanly with the existing architecture. No new architectural patterns are required — all features leverage established patterns:

1. **Backdrop padding** — XAML-only change to `BackdropBorder.Padding`; zero code impact
2. **Stats interval slider** — UI replacement with AppSettings field type change (int→double); existing Stop+set+Start timer pattern handles it
3. **Phrase expansion** — pure additive to existing `IPhraseProvider` implementations; zero interface changes
4. **Jive/Pirate/Yoda deepening** — same as phrase expansion; isolated to 3 provider classes
5. **Theme removal** — deletion pass: remove BuiltInThemes registry, ThemeDefinition record, Settings UI panel, AppSettings.Theme field; add one-time JSON migration guard

**Build order recommendation:** Backdrop padding → Phrase/style expansions (parallel) → Stats interval slider → Theme removal (migration requires AppSettings structure finalized).

## Recommended Integration Patterns

### 1. Backdrop Padding

**Existing component:** `BackdropBorder` wrapping full `StackPanel` in `MainWindow.xaml`

**Change type:** XAML-only property addition

**Integration:**
```xaml
<Border x:Name="BackdropBorder"
        Padding="12"
        Background="{x:Null}">
    <StackPanel>
        <!-- existing phrase/dial/stats/uptime content -->
    </StackPanel>
</Border>
```

**Code impact:** None. `BackdropBorder` is already positioned correctly; `Padding` property just adds internal margin.

**Dependencies:** None — standalone XAML change.

---

### 2. Stats Interval Slider

**Existing components:**
- `SettingsWindow.xaml` Stats tab with existing interval controls
- `AppSettings.StatsIntervalSeconds` field (currently `int`)
- `_statsIntervalSeconds` field in `MainWindow.xaml.cs`
- `_statsTimer` DispatcherTimer with Stop+set+Start pattern established in v1.2

**Change type:** UI replacement + field type change + validation update

**Integration:**

#### AppSettings
```csharp
public record AppSettings
{
    // Change from int to double
    public double StatsIntervalSeconds { get; init; } = 3.0;  // was int = 3
    // ... other fields unchanged
}
```

#### SettingsService.Validate()
```csharp
if (settings.StatsIntervalSeconds < 0.5 || settings.StatsIntervalSeconds > 10.0)
{
    settings = settings with { StatsIntervalSeconds = 3.0 };
}
```

#### SettingsWindow.xaml
Replace existing interval controls (likely ComboBox or RadioButtons) with:
```xaml
<Slider x:Name="SldStatsInterval"
        Minimum="0.5"
        Maximum="10.0"
        TickFrequency="0.1"
        IsSnapToTickEnabled="False"
        Value="{Binding StatsIntervalSeconds}"
        ValueChanged="SldStatsInterval_ValueChanged"/>
<TextBlock Text="{Binding ElementName=SldStatsInterval, Path=Value, StringFormat='{0:F1}s'}"/>
```

#### MainWindow.xaml.cs
Change field type:
```csharp
private double _statsIntervalSeconds = 3.0;  // was int
```

Update timer application (existing Stop+set+Start pattern already handles double):
```csharp
_statsTimer.Stop();
_statsTimer.Interval = TimeSpan.FromSeconds(_statsIntervalSeconds);
_statsTimer.Start();
```

**Code impact:** Low — field type change propagates naturally; existing timer pattern already accepts `TimeSpan.FromSeconds(double)`.

**Dependencies:**
- Phrase/style expansions should ship first (no mutual dependency, but slider is user-facing polish)
- Theme removal should ship last (AppSettings structure must be stable for migration)

**Validation requirements:**
- Test JSON deserialization of old int values into new double field (JSON auto-converts)
- Test Validate() range guard (0.5–10.0)
- Test slider → event → MainWindow timer update flow

---

### 3. Phrase Expansion

**Existing components:**
- `IPhraseProvider` interface with `GetPhrase(DateTime)` and `GetSegmentKey(DateTime)`
- 9 provider classes in `FuzzyClock.Core/PhraseProviders/`
- `PhraseEngine` static facade with `_providers` dictionary

**Change type:** Additive content to existing provider implementations

**Integration:**

No interface changes. Expansion is isolated to individual provider class internals:

#### Example: EnglishPhraseProvider
```csharp
private static readonly Dictionary<int, string[]> ClassicPhrases = new()
{
    { 0, new[] {
        "just about {h} o'clock",
        "practically {h} o'clock",
        "{h} on the dot",
        // ... add 5-10 more variations per bucket
    }},
    // ... repeat for all 12 buckets
};
```

Each provider independently adds variations. Provider selection logic already randomizes within the candidate array — no PhraseEngine changes needed.

**Code impact:** Zero outside the provider classes being expanded.

**Dependencies:** None — pure content addition.

**Validation requirements:**
- All 12 buckets per provider have balanced candidate counts (no single-entry buckets)
- GetSegmentKey() unchanged (stable bucket keys required for phrase persistence)
- Unit tests cover at least one phrase from each new variation set

---

### 4. Jive/Pirate/Yoda Deepening

**Existing components:**
- `JivePhraseProvider`, `PiratePhraseProvider`, `YodaPhraseProvider` already exist (added post-v3.9)
- Same `IPhraseProvider` interface as feature #3

**Change type:** Content deepening within existing provider classes

**Integration:**

Identical to phrase expansion (feature #3) — purely additive content changes within the provider class internals. Example:

#### JivePhraseProvider
```csharp
private static readonly Dictionary<int, string[]> JivePhrases = new()
{
    { 0, new[] {
        "it be {h} o'clock, dig it",
        "straight up {h}, baby",
        "{h} on the nose, ya dig?",
        // ... lean harder into Jive cadence/vocabulary
    }},
};
```

**Code impact:** Zero outside the 3 provider classes.

**Dependencies:** None — pure content change.

**Validation requirements:** Same as feature #3.

---

### 5. Theme Removal

**Existing components:**
- `ThemeDefinition` record in `FuzzyClock.App/`
- `BuiltInThemes` static registry class
- `AppSettings.Theme` field (string, nullable)
- SettingsWindow Appearance tab theme UI controls
- `ApplyNamedTheme()` method in MainWindow.xaml.cs

**Change type:** Deletion pass + migration logic

**Integration:**

#### Step 1: AppSettings
Remove `Theme` field:
```csharp
public record AppSettings
{
    // Delete this line:
    // public string? Theme { get; init; } = null;

    // All other fields remain
}
```

#### Step 2: SettingsService Migration
Add one-time migration in `Load()` before deserialization:
```csharp
public static AppSettings Load()
{
    // ... existing file read logic ...

    using JsonDocument doc = JsonDocument.Parse(json);
    JsonElement root = doc.RootElement;

    // One-time migration: Theme → constituent settings
    if (root.TryGetProperty("Theme", out JsonElement themeElement))
    {
        string? themeName = themeElement.GetString();
        if (!string.IsNullOrEmpty(themeName) && BuiltInThemes.TryGet(themeName, out ThemeDefinition? theme))
        {
            // Inject theme's constituent values into JSON if those fields are absent
            // Example pseudocode (actual implementation depends on how ThemeDefinition was structured):
            // if (!root.HasProperty("AccentColor")) inject theme.AccentColor
            // if (!root.HasProperty("Opacity")) inject theme.Opacity
            // ... etc.
        }
    }

    AppSettings settings = JsonSerializer.Deserialize<AppSettings>(json, _options)!;
    // ... existing Validate() call ...
}
```

**Note:** The exact migration logic depends on the `ThemeDefinition` record structure (not visible in PROJECT.md). Migration must:
1. Read the `Theme` string field
2. Look up the corresponding theme in `BuiltInThemes`
3. Apply the theme's accent color, opacity, font size, clock type, and stats visibility to the loaded AppSettings **only if** those fields are absent in the JSON (backward compat)
4. Remove the `Theme` field from the JSON so future saves are clean

#### Step 3: MainWindow.xaml.cs
Delete `ApplyNamedTheme()` method entirely. It's no longer called.

#### Step 4: SettingsWindow.xaml
Remove theme selector UI controls from Appearance tab (likely a ComboBox or RadioButton group).

#### Step 5: Delete Files
- `ThemeDefinition.cs`
- `BuiltInThemes.cs`

**Code impact:** Medium — deletion across multiple files; migration logic is the only new code.

**Dependencies:**
- Must ship **after** all AppSettings field changes are finalized (backdrop padding has zero field impact; stats interval slider changes StatsIntervalSeconds type)
- Should be a dedicated phase (last in milestone) so migration can be tested in isolation

**Validation requirements:**
- Test users with `Theme: "Neon"` in old settings.json correctly receive Neon's constituent values on first load after upgrade
- Test users with `Theme: null` in old settings.json are unaffected
- Test users with no `Theme` field in old settings.json (v2.9 and earlier) are unaffected
- Test that after migration, `Theme` field is **not** written back to settings.json on next save

---

## Component Boundaries

| Component | Responsibility | Modified By |
|-----------|---------------|-------------|
| `BackdropBorder` (XAML) | Visual padding around widget content | Feature #1 (XAML property) |
| `AppSettings` record | Persisted settings schema | Feature #2 (type change), Feature #5 (field deletion) |
| `SettingsService` | JSON I/O + validation | Feature #2 (validation update), Feature #5 (migration logic) |
| `SettingsWindow` (XAML) | Settings UI | Feature #2 (slider replacement), Feature #5 (theme UI deletion) |
| `MainWindow.xaml.cs` | _statsIntervalSeconds field, timer | Feature #2 (field type change) |
| IPhraseProvider implementations | Phrase candidate arrays | Feature #3 (expansion), Feature #4 (deepening) |
| `ThemeDefinition`, `BuiltInThemes` | Named theme registry | Feature #5 (deleted) |

---

## Data Flow

### Feature #1: Backdrop Padding
**Flow:** User moves mouse over widget → WPF layout engine applies `BackdropBorder.Padding="12"` → content inset by 12px → backdrop appears larger.

**No code involvement.**

---

### Feature #2: Stats Interval Slider
**Flow:**
1. User drags slider in SettingsWindow
2. `SldStatsInterval_ValueChanged` event fires
3. `StatsIntervalChanged?.Invoke(newValue)` (double)
4. MainWindow receives event → `_statsIntervalSeconds = newValue`
5. Stop+set+Start timer pattern applies new interval
6. On SettingsWindow close, persist via `SaveSettings()` (AppSettings with { StatsIntervalSeconds = _statsIntervalSeconds })

**Existing pattern:** Stop+set+Start already used for discrete 1s/3s/10s intervals; identical flow for continuous slider.

---

### Feature #3 & #4: Phrase Expansion
**Flow:**
1. PhraseEngine.GetPhrase(DateTime.Now)
2. Resolve provider from locale/style
3. Provider.GetPhrase() selects random candidate from expanded array
4. MainWindow renders phrase via PhraseText.Inlines

**No new data flow.** Content expansion is transparent to PhraseEngine and MainWindow.

---

### Feature #5: Theme Removal
**Flow (one-time migration):**
1. User launches app after upgrade
2. `SettingsService.Load()` detects `Theme` field in old JSON
3. Look up theme in `BuiltInThemes` registry
4. Inject theme's constituent values into AppSettings if fields absent
5. Deserialize AppSettings (now with `Theme` field removed from record definition)
6. Next `SaveSettings()` writes JSON without `Theme` field

**Flow (steady state):** No theme application; users set accent/opacity/font/clock/stats individually via Settings UI.

---

## Build Order Recommendation

**Phase order considering dependencies:**

### Phase 1: Backdrop Padding
**Why first:** Zero code dependencies; XAML-only change; instant visual verification; sets visual foundation for the milestone.

**Deliverable:** `BackdropBorder` in MainWindow.xaml has `Padding="12"`.

---

### Phase 2a: Phrase Expansion (parallel)
**Why second:** No code dependencies; pure content; can run in parallel with Jive/Pirate/Yoda deepening.

**Deliverable:** All non-novelty providers (English Classic/Terse/Poetic/Rude, French, Spanish, German, Japanese, Polish) have 5-10 variations per bucket.

---

### Phase 2b: Jive/Pirate/Yoda Deepening (parallel)
**Why second:** Same reasoning as 2a; zero mutual dependency with phrase expansion.

**Deliverable:** Jive/Pirate/Yoda providers have expanded, personality-deeper candidate arrays.

---

### Phase 3: Stats Interval Slider
**Why third:** AppSettings field type change must be stable before theme removal migration runs. No dependency on phrase changes.

**Deliverable:**
- `AppSettings.StatsIntervalSeconds` is `double` (was `int`)
- SettingsWindow Stats tab has slider (0.5–10.0s, 0.1s step)
- Validation guards range
- JSON round-trip test passes
- MainWindow timer accepts continuous values

---

### Phase 4: Theme Removal
**Why last:** Requires AppSettings structure finalized (Phase 3 changed StatsIntervalSeconds type). Migration logic must handle old `Theme` field robustly.

**Deliverable:**
- `ThemeDefinition` and `BuiltInThemes` deleted
- `AppSettings.Theme` field removed
- SettingsWindow theme UI removed
- Migration logic in `SettingsService.Load()` handles old JSON with `Theme` field
- Test coverage: migration from each built-in theme name, null theme, absent theme field

---

## Architectural Notes

### Patterns to Follow

#### Stop+set+Start for Timer Interval Changes (Feature #2)
Established in v1.2 (decision #356). Applies identically to continuous slider values:
```csharp
private void OnStatsIntervalChanged(double newInterval)
{
    _statsIntervalSeconds = newInterval;
    _statsTimer.Stop();
    _statsTimer.Interval = TimeSpan.FromSeconds(newInterval);
    _statsTimer.Start();
    SaveSettings();  // persist immediately
}
```

#### One-Time JSON Migration Pattern (Feature #5)
Follows the v2.6 MonitorPositions migration pattern (decision #422):
1. Pre-parse JSON with `JsonDocument` before deserializing into AppSettings
2. Detect old schema field
3. Migrate to new schema fields **only if** new fields are absent
4. Deserialize into new AppSettings structure (old field not in record definition, so silently dropped)
5. Next save writes clean JSON without old field

**Critical:** Migration must be **additive-only** — never overwrite existing values. If user has already set AccentColor manually, do not overwrite with theme's accent color.

#### IPhraseProvider Content Expansion (Features #3 & #4)
Established in v3.2 (decision #440). Providers are isolated add-ons:
- Interface unchanged
- PhraseEngine facade unchanged
- Candidate arrays inside provider classes expand independently
- GetSegmentKey() must remain stable (bucket identity unchanged)

---

## Anti-Patterns to Avoid

### Feature #2: Do Not Use TickFrequency for Slider Snapping
**Trap:** Setting `TickFrequency="0.5"` on Slider causes snapping to half-second increments, defeating the "continuous" goal.

**Prevention:** Set `IsSnapToTickEnabled="False"` explicitly. Allow free-form values between 0.5–10.0.

---

### Feature #5: Do Not Overwrite Existing Settings in Migration
**Trap:** If user has set AccentColor to custom value, and migration detects old `Theme: "Neon"`, naively applying Neon's AccentColor would overwrite the user's choice.

**Prevention:** Migration logic must check if each constituent field **already exists** in the JSON. Only inject theme values for **absent** fields.

```csharp
// Correct:
if (!root.TryGetProperty("AccentColor", out _))
{
    // Field absent → inject theme's accent color
}

// Incorrect:
// Always inject theme's accent color (overwrites user's custom choice)
```

---

### Feature #3 & #4: Do Not Change GetSegmentKey() Logic
**Trap:** Adding new buckets or changing bucket boundaries would invalidate `_lastSegmentKey` cache in MainWindow, causing phrases to change mid-bucket.

**Prevention:** Expansion is **content-only**. Bucket structure (12 five-minute buckets per hour) is immutable. GetSegmentKey() returns the same key for the same DateTime regardless of candidate array size.

---

## Testing Strategy

### Feature #1: Backdrop Padding
**Test type:** Visual verification only (no code changes).

**Verification:** Hover widget; backdrop should have visible padding around phrase/stats/uptime content.

---

### Feature #2: Stats Interval Slider
**Test type:** Unit + integration

**Unit tests (SettingsService):**
- `Validate_StatsIntervalTooLow_ClampsTo3` — interval < 0.5 resets to 3.0
- `Validate_StatsIntervalTooHigh_ClampsTo3` — interval > 10.0 resets to 3.0
- `RoundTrip_StatsInterval_PreservesDoubleValue` — serialize 2.7 → deserialize → value == 2.7

**Integration tests (MainWindow):**
- Slider ValueChanged → timer interval updates within one tick
- Slider at 0.5s → stats update every 500ms (observable via uptime process count)
- Slider at 10.0s → stats update every 10s

---

### Feature #3 & #4: Phrase Expansion
**Test type:** Coverage verification

**Unit tests (per provider):**
- All 12 buckets return a phrase
- Each bucket has ≥5 candidates (prevents single-entry staleness)
- GetSegmentKey() unchanged from baseline

**Manual verification:**
- Let widget run for 60 minutes; observe phrase variety increases

---

### Feature #5: Theme Removal
**Test type:** Migration unit tests + integration

**Migration tests (SettingsService):**
- `Migrate_ThemeNeon_InjectsConstituentValues` — old JSON with `Theme: "Neon"` migrates to Neon's accent/opacity/font/clock/stats
- `Migrate_ThemeWithExistingAccent_DoesNotOverwrite` — old JSON with `Theme: "Neon"` + `AccentColor: "#FF0000"` preserves red accent (does not overwrite with Neon's amber)
- `Migrate_ThemeNull_NoChange` — old JSON with `Theme: null` deserializes normally
- `Migrate_NoThemeField_NoChange` — old JSON without `Theme` field (v2.9 users) deserializes normally
- `SaveAfterMigration_ThemeFieldAbsent` — after migration, SaveSettings() produces JSON without `Theme` field

**Integration tests (MainWindow):**
- Load settings.json with `Theme: "Ghost"` → widget should have Ghost's white accent, 50% opacity, 24pt font, Phrase mode, stats hidden
- Save settings after load → JSON file has no `Theme` field

---

## Scalability Considerations

| Feature | At 10 Phrase Variations | At 50 Phrase Variations | At 100 Phrase Variations |
|---------|-------------------------|-------------------------|--------------------------|
| Phrase Expansion | Negligible memory (<1KB per provider) | ~5KB per provider (still negligible) | ~10KB per provider (acceptable) |
| GetPhrase() perf | O(1) dictionary + O(n) random select, n≤10 | O(1) + O(n), n≤50 | O(1) + O(n), n≤100 (still <1ms) |

**Conclusion:** Phrase expansion scales trivially. Random.Next(array.Length) is O(1) for practical candidate counts.

| Feature | At 1s Interval | At 0.5s Interval | At 10s Interval |
|---------|----------------|------------------|-----------------|
| Stats Slider | ~300 samples/5min | ~600 samples/5min | ~30 samples/5min |
| Rolling avg memory | 180 floats (1m) + 900 (5m) + 2700 (15m) = ~15KB | 360 + 1800 + 5400 = ~30KB | 18 + 90 + 270 = ~1.5KB |

**Conclusion:** 0.5s interval doubles memory for rolling averages but remains trivial (<30KB). No scalability concern.

---

## Migration Path for Existing Users

### From v4.0 → v4.1

**Backdrop padding:** No migration. XAML change is immediate.

**Stats interval slider:** Old `StatsIntervalSeconds` values (1, 3, 10) deserialize into `double` field automatically. JSON auto-converts int→double. Validator accepts them (all within 0.5–10.0 range). **Zero migration needed.**

**Phrase expansion:** No migration. Existing users see expanded phrases immediately. No settings changes.

**Theme removal:** One-time migration on first launch:
1. Detect `Theme` field in old settings.json
2. If theme name recognized (Minimal/Neon/Ghost/Warm/Ocean), inject constituent values for **absent** fields only
3. Remove `Theme` field from AppSettings record → next save produces clean JSON

Users who never used themes (Theme: null or absent) are unaffected.

---

## Open Questions

### Feature #2: Slider Precision
**Question:** Should slider emit values rounded to nearest 0.1s, or allow free-form doubles?

**Options:**
1. Free-form (0.523s valid) — simpler code, no rounding logic
2. Rounded to 0.1s (0.5s valid) — cleaner UI display

**Recommendation:** Round to 0.1s for display clarity. Use `Math.Round(value, 1)` in ValueChanged handler before persisting.

---

### Feature #5: Theme Removal UX
**Question:** Should Settings UI show a one-time notice when migrating from a theme?

**Options:**
1. Silent migration (no notice) — simpler, but users may not realize themes are gone
2. One-time banner: "Named themes removed. Your current theme settings have been preserved." — more user-friendly

**Recommendation:** Silent migration. Theme UI is already removed from Settings window; no need for a banner explaining something that's no longer visible.

---

## Sources

- `.planning/PROJECT.md` — full project context, milestone history, decision log
- Existing codebase architecture inferred from PROJECT.md decision table (481 decisions logged)
- Pattern analysis from v1.0–v4.0 milestone history

**Confidence:** HIGH — all integration points are established patterns with decision precedent in PROJECT.md.
