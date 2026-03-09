# Phase 45: English Phrase Style Personalities - Research

**Researched:** 2026-03-09
**Domain:** C# phrase-engine provider pattern, WPF ComboBox wiring, AppSettings persistence
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| STYLE-01 | User can select Terse style (compact: "half three", "quarter past", "noon") in the Settings window | SettingsWindow already has `CmbPhraseStyle` ComboBox with `PhraseStyleChanged` event; needs Terse item added and `TersePhraseProvider` registered in `_providers` |
| STYLE-02 | User can select Poetic style (evocative: "the small hours", "the day grows long") in the Settings window | Same ComboBox wiring; needs `PoeticPhraseProvider` with contextual/time-of-day phrases |
| STYLE-03 | User can select Rude style (blunt: "nearly four, move it", "just gone midnight, go to bed") in the Settings window | Same ComboBox wiring; needs `RudePhraseProvider` with blunt/terse callout phrases |
| STYLE-04 | Selected phrase style persists to settings.json and restores on launch | `AppSettings.PhraseStyle` field exists; `_currentPhraseStyle` tracked in MainWindow; save/restore wiring exists — but `PhraseEngine.SetLocale()` is never called from PhraseStyle changes yet |
</phase_requirements>

---

## Summary

Phase 45 adds three new English phrase vocabularies (Terse, Poetic, Rude) alongside the existing Classic style. The provider extensibility seam from Phase 41 is fully in place: `IPhraseProvider`, `EnglishPhraseProvider`, and `PhraseEngine.SetLocale()` exist and are tested. The `_providers` dictionary just needs new keys registered.

The critical gap discovered during research: `_currentPhraseStyle` in MainWindow stores and persists the style name correctly, and `SettingsWindow.PhraseStyleChanged` fires correctly, but the handler `ps => { _currentPhraseStyle = ps; SaveSettings(); }` **never calls `PhraseEngine.SetLocale()`**. The style is persisted but has zero effect on displayed phrases. Phase 45 must fix this wiring gap, add three provider classes, populate the ComboBox, and ensure the saved style is restored via `SetLocale()` on launch.

The locale key pattern from Phase 41 is `language-style` (e.g., `"en-classic"`). Phase 45 keys will be `"en-terse"`, `"en-poetic"`, and `"en-rude"`. The `GetStructuredPhrase` contract (returns `(Qualifier, Emphasis)`) must be implemented by all three providers for compatibility with Split/Literary text styles.

**Primary recommendation:** Add three `IPhraseProvider` implementations in `FuzzyClock.Core`, register them in `PhraseEngine._providers`, fix the `PhraseStyleChanged` handler in `MainWindow` to call `SetLocale()`, update `PopulateControls` to set `CmbPhraseStyle` by value, and populate the ComboBox with all four items in XAML.

---

## Standard Stack

### Core
| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| `IPhraseProvider` interface | Phase 41 | Contract for all phrase vocabularies | Already established — two methods: `GetPhrase(DateTime)` and `GetStructuredPhrase(DateTime)` |
| `PhraseEngine._providers` dictionary | Phase 41 | Registry keyed by locale string | Pattern established: `"en-classic"` → `EnglishPhraseProvider()` |
| `PhraseEngine.SetLocale(string)` | Phase 41 | Swaps active provider at runtime | Returns bool; no state change on unknown key |
| MSTest 4.0.1 / net10.0 | Existing | Unit test framework for Core | All 97 Core tests use this; no WPF dependency |

### Supporting
| Component | Version | Purpose | When to Use |
|-----------|---------|---------|-------------|
| `[TestCleanup]` ResetLocale pattern | Phase 41 | Prevent static state leaks between test methods | Required whenever tests call `SetLocale()` |
| `SettingsWindow.CmbPhraseStyle` | Phase 42 | ComboBox for phrase style selection | Already wired — add items and fix population |
| `AppSettings.PhraseStyle` | Phase 42 | Persisted field, default `"Classic"` | Read on startup, written on change |

### No Additional Libraries
No new NuGet packages needed. Everything is in-project.

---

## Architecture Patterns

### Recommended Project Structure

New files belong in `FuzzyClock.Core/`:
```
FuzzyClock.Core/
├── IPhraseProvider.cs           # Existing — unchanged
├── EnglishPhraseProvider.cs     # Existing — unchanged (en-classic)
├── TersePhraseProvider.cs       # NEW — en-terse
├── PoeticPhraseProvider.cs      # NEW — en-poetic
├── RudePhraseProvider.cs        # NEW — en-rude
└── PhraseEngine.cs              # Modified — register 3 new providers
```

### Pattern 1: Provider Registration (established in Phase 41)

**What:** Add new `IPhraseProvider` implementations and register them in `PhraseEngine._providers`.

**When to use:** Every new phrase vocabulary.

```csharp
// In PhraseEngine.cs — _providers dictionary
private static readonly Dictionary<string, IPhraseProvider> _providers = new()
{
    ["en-classic"] = new EnglishPhraseProvider(),
    ["en-terse"]   = new TersePhraseProvider(),    // Phase 45
    ["en-poetic"]  = new PoeticPhraseProvider(),   // Phase 45
    ["en-rude"]    = new RudePhraseProvider(),      // Phase 45
};
```

### Pattern 2: Locale Key Convention

**What:** Locale keys use `language-style` format.

Keys for Phase 45: `"en-terse"`, `"en-poetic"`, `"en-rude"`.

Style name in `AppSettings.PhraseStyle` / `_currentPhraseStyle` is the display name (`"Classic"`, `"Terse"`, `"Poetic"`, `"Rude"`). The mapping to locale key happens in `SetPhraseStyle()`:

```csharp
// Suggested helper in MainWindow
private void SetPhraseStyle(string style)
{
    _currentPhraseStyle = style;
    string localeKey = style.ToLowerInvariant() switch
    {
        "terse"  => "en-terse",
        "poetic" => "en-poetic",
        "rude"   => "en-rude",
        _        => "en-classic",
    };
    PhraseEngine.SetLocale(localeKey);
    UpdatePhraseIfChanged();   // force immediate redraw — same minute, different style
    SaveSettings();
}
```

### Pattern 3: Force Phrase Redraw on Style Change

**What:** `UpdatePhraseIfChanged()` skips update if `newPhrase == PhraseText.Text`. Switching style at the same time-bucket produces the same minute — the phrase changes but the guard prevents the update.

**Fix:** After `SetLocale()`, force redraw by clearing the current text first, or call `SetInitialPhrase(DateTime.Now)` directly:

```csharp
PhraseText.Text = "";   // invalidate cache
UpdatePhraseIfChanged();
```

OR directly:

```csharp
SetInitialPhrase(DateTime.Now);
```

`SetInitialPhrase` is already `internal void` and handles both single-text and structured-text layouts.

### Pattern 4: ComboBox Population by Value (not index)

**What:** `PopulateControls` currently sets `CmbPhraseStyle.SelectedIndex = 0` (always Classic). Must be updated to select by value.

```csharp
CmbPhraseStyle.SelectedIndex = s.PhraseStyle switch
{
    "Terse"  => 1,
    "Poetic" => 2,
    "Rude"   => 3,
    _        => 0   // Classic
};
```

### Pattern 5: Startup Locale Restore

**What:** `ApplySettings()` sets `_currentPhraseStyle = s.PhraseStyle` but never calls `SetLocale()`. On next launch, the saved style is silently ignored.

**Fix:** Add `SetPhraseStyle(_currentPhraseStyle)` call in `ApplySettings()` — or inline the `SetLocale()` call alongside the field assignment.

### Pattern 6: IPhraseProvider Bucket Table Structure

**What:** Each provider needs both `GetPhrase(DateTime)` and `GetStructuredPhrase(DateTime)`. The bucket table approach from `EnglishPhraseProvider` is the reference pattern.

For Terse/Poetic/Rude, phrases don't follow the same `{h}` / `{h1}` template structure. Simpler: implement both methods directly without a bucket table for unusual phrase shapes; or use the same bucket table pattern with style-specific templates.

**GetStructuredPhrase contract for split-text styles:**
- Return `("", fullPhrase)` for simple phrases with no natural split — same fallback used by Japanese provider (see STATE.md decision: `GetStructuredPhrase returns ("", fullPhrase)` for non-splittable phrases).
- Only split if there's a meaningful qualifier/emphasis breakdown.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Style→locale key mapping | Another dictionary or registry class | Simple `switch` expression in `SetPhraseStyle()` | 4 values total; a full registry would be over-engineering |
| Phrase redraw after style change | A separate "style changed" redraw path | `PhraseText.Text = ""; UpdatePhraseIfChanged()` or `SetInitialPhrase(DateTime.Now)` | These paths already handle both Classic and structured text layouts correctly |
| New test class hierarchy | Base test class for all providers | Separate flat `[TestClass]` per provider | Project pattern is flat test classes; `[TestCleanup]` handles the static state issue |

**Key insight:** The entire feature is data (bucket tables) + wiring fixes. No new architectural patterns are needed beyond what Phase 41 established.

---

## Common Pitfalls

### Pitfall 1: PhraseStyleChanged handler missing SetLocale() call
**What goes wrong:** Style persists but displayed phrase never changes. Widget always shows Classic phrases regardless of setting.
**Why it happens:** Current handler is `ps => { _currentPhraseStyle = ps; SaveSettings(); }` — no `PhraseEngine.SetLocale()` call.
**How to avoid:** Replace with a `SetPhraseStyle(ps)` helper that does field + locale + redraw + save.
**Warning signs:** Unit test for locale swap passes, but manual test shows no phrase change.

### Pitfall 2: Startup restore forgetting SetLocale()
**What goes wrong:** Correct style shown in Settings ComboBox on reopen, but phrase is Classic.
**Why it happens:** `ApplySettings()` copies `_currentPhraseStyle` from JSON but doesn't call `PhraseEngine.SetLocale()`.
**How to avoid:** Add `SetPhraseStyle(_currentPhraseStyle)` (or inline `PhraseEngine.SetLocale()`) inside `ApplySettings()`.
**Warning signs:** Works in-session, broken on restart.

### Pitfall 3: UpdatePhraseIfChanged() no-op guard after style switch
**What goes wrong:** User switches style at e.g. :30 — phrase stays "half past three" even though new style's phrase is different.
**Why it happens:** `if (newPhrase == PhraseText.Text) return;` fires because the minute bucket hasn't changed.
**How to avoid:** Clear `PhraseText.Text = ""` before calling `UpdatePhraseIfChanged()`, or call `SetInitialPhrase(DateTime.Now)` directly.
**Warning signs:** Phrase updates on next tick (up to 3s delay) rather than immediately.

### Pitfall 4: Static test state pollution
**What goes wrong:** Tests for en-terse leave locale set to `"en-terse"`, causing subsequent tests that call `PhraseEngine.GetPhrase()` to return terse phrases instead of classic.
**Why it happens:** `PhraseEngine` is a static class; state persists across test methods in the same process.
**How to avoid:** `[TestCleanup]` that calls `PhraseEngine.SetLocale("en-classic")` — established pattern in `PhraseEngineCoordinatorTests`.
**Warning signs:** Tests pass in isolation but fail when run as a suite.

### Pitfall 5: GetStructuredPhrase with non-splittable Terse/Poetic/Rude phrases
**What goes wrong:** Split/Literary text styles break or show empty qualifier for "half three" (Terse) because there is no natural qualifier split.
**Why it happens:** The structured phrase logic in `EnglishPhraseProvider` looks for `{h}` / `{h1}` anchors at the end of templates — Terse/Poetic/Rude phrases may not fit this pattern.
**How to avoid:** For phrases that don't have a natural qualifier/emphasis split, return `("", fullPhrase)`. This is the established fallback for non-English providers. The Split/Literary layouts handle the empty qualifier case gracefully (qualifier TextBlock is empty, only emphasis shows).
**Warning signs:** Empty phrase area or ArgumentOutOfRangeException in structured-phrase path.

### Pitfall 6: ComboBox item Content vs. tag mismatch
**What goes wrong:** `CmbPhraseStyle_SelectionChanged` fires `PhraseStyleChanged?.Invoke((string)item.Content)` — so `Content` must exactly match the string passed to `SetPhraseStyle`. If XAML says `"Terse"` but code checks for `"terse"`, the switch falls through to Classic.
**How to avoid:** Keep ComboBox `Content` as PascalCase (`"Classic"`, `"Terse"`, `"Poetic"`, `"Rude"`). The `SetPhraseStyle` switch uses `.ToLowerInvariant()` to map to locale keys, so either case works — but be consistent.

---

## Code Examples

### TersePhraseProvider skeleton
```csharp
// FuzzyClock.Core/TersePhraseProvider.cs
namespace FuzzyClock.Core;

public class TersePhraseProvider : IPhraseProvider
{
    private static readonly string[] HourWords =
        ["", "one", "two", "three", "four", "five", "six",
             "seven", "eight", "nine", "ten", "eleven", "twelve"];

    private static readonly (int UpperBound, string Template)[] Buckets =
    [
        ( 2, "{h}"),           // "three" — just the hour word
        ( 7, "just gone {h}"),
        (12, "ten past {h}"),
        (17, "quarter past {h}"),
        (22, "twenty past {h}"),
        (27, "half {h1}"),     // British: "half three" means 2:30
        (32, "half past {h}"),
        (37, "just gone half {h}"),
        (42, "twenty to {h1}"),
        (47, "quarter to {h1}"),
        (52, "ten to {h1}"),
        (59, "nearly {h1}"),
    ];

    public string GetPhrase(DateTime dt) { /* same bucket walk as Classic */ }
    public (string Qualifier, string Emphasis) GetStructuredPhrase(DateTime dt) =>
        ("", GetPhrase(dt));  // Terse phrases don't split naturally
}
```

### Poetic phrases — time-of-day contextual (not bucket-based)
Poetic style uses time-of-day segments rather than pure minute buckets. Consider:
- 00:00 → "the witching hour"
- 00:00–05:59 → "the small hours"
- 06:00–08:59 → "the morning stirs"
- 09:00–11:59 → "the day grows long" / "mid-morning"
- 12:00 → "high noon"
- etc.

Two implementation approaches:

**Option A — time-of-day segments (fewer distinct buckets):**
```csharp
// Simple: map hour ranges to evocative phrases
private static string GetPoeticPhrase(DateTime dt)
{
    int h = dt.Hour;
    int m = dt.Minute;
    if (h == 0 && m == 0) return "the witching hour";
    if (h < 6) return "the small hours";
    if (h < 9) return "the morning stirs";
    // ... etc.
}
```

**Option B — per-bucket (consistent with Classic structure, more variety):**
Keep the 12 buckets but use evocative templates. Each bucket still uses `{h}`/`{h1}` or fixed strings. More work but more granularity.

**Recommendation:** Option A for Poetic (time-of-day segments are more natural for poetic phrases). Option B for Rude (works better with specific provocations like "nearly {h1}, get moving").

### Rude phrases — bucket-based with callouts
```csharp
private static readonly (int UpperBound, string Template)[] Buckets =
[
    ( 2, "exactly {h}, what do you want"),
    ( 7, "just gone {h}"),
    (12, "ten past {h}, wake up"),
    (17, "quarter past {h}"),
    (22, "gone quarter past {h}"),
    (27, "nearly half past {h}"),
    (32, "half past {h}, still here?"),
    (37, "just gone half past {h}"),
    (42, "almost quarter to {h1}"),
    (47, "quarter to {h1}"),
    (52, "nearly {h1}, move it"),
    (59, "almost {h1}, get on with it"),
];
```

### MainWindow SetPhraseStyle helper
```csharp
private void SetPhraseStyle(string style)
{
    _currentPhraseStyle = style;
    string localeKey = style.ToLowerInvariant() switch
    {
        "terse"  => "en-terse",
        "poetic" => "en-poetic",
        "rude"   => "en-rude",
        _        => "en-classic",
    };
    PhraseEngine.SetLocale(localeKey);
    PhraseText.Text = "";          // invalidate guard cache
    UpdatePhraseIfChanged();
    SaveSettings();
}
```

### SettingsWindow XAML — CmbPhraseStyle with all four items
```xml
<ComboBox x:Name="CmbPhraseStyle" ...>
    <ComboBoxItem Content="Classic"/>
    <ComboBoxItem Content="Terse"/>
    <ComboBoxItem Content="Poetic"/>
    <ComboBoxItem Content="Rude"/>
</ComboBox>
```

### PopulateControls update for PhraseStyle
```csharp
CmbPhraseStyle.SelectedIndex = s.PhraseStyle switch
{
    "Terse"  => 1,
    "Poetic" => 2,
    "Rude"   => 3,
    _        => 0   // Classic (default)
};
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Monolithic static PhraseEngine with embedded English logic | Static facade routing through `IPhraseProvider` instances in `_providers` dictionary | Phase 41 | New providers are pure data classes; no structural changes needed |
| `_currentPhraseStyle` stored but unused | Will call `PhraseEngine.SetLocale()` | Phase 45 (this phase) | Style change immediately affects displayed phrase |

**Known stub in current code:**
- `SettingsWindow.xaml` line 307: `<ComboBoxItem Content="Classic"/>` — only one item; Terse/Poetic/Rude must be added.
- `SettingsWindow.xaml.cs` line 78: `CmbPhraseStyle.SelectedIndex = 0;` — hardcoded; must be replaced with value-based selection.
- `MainWindow.xaml.cs` line 358: `_settingsWindow.PhraseStyleChanged += ps => { _currentPhraseStyle = ps; SaveSettings(); };` — missing `SetLocale()` + redraw.
- `MainWindow.xaml.cs` line 282: `_currentPhraseStyle = s.PhraseStyle;` in `ApplySettings()` — missing startup `SetLocale()`.

---

## Open Questions

1. **Exact phrase vocabulary for Poetic and Rude**
   - What we know: Requirements specify examples ("the small hours", "the day grows long"; "nearly four, move it", "just gone midnight, go to bed")
   - What's unclear: Full 12-bucket phrase sets are not specified; no design doc provides complete phrase lists
   - Recommendation: Planner should specify 12–14 representative phrases per style covering all time-of-day segments; these become the implementation contract for the provider. Poetic can use time-of-day segments (fewer buckets, contextual); Rude should use the same 12-bucket structure as Classic with added callout suffixes.

2. **GetStructuredPhrase for Poetic time-of-day segment phrases**
   - What we know: Poetic phrases like "the small hours" have no natural qualifier/emphasis split
   - What's unclear: Do Split/Literary text styles look weird with empty qualifier?
   - Recommendation: Return `("", fullPhrase)` — same fallback as Japanese provider. The emphasis-only layout is tested and works.

3. **Phrase Style selector disabled for non-English locales**
   - What we know: REQUIREMENTS.md Out of Scope: "Phrase style selector visible for non-English locales — Terse/Poetic/Rude are English-only; control is disabled when non-English language is active"
   - What's unclear: Phase 46 (multilingual) hasn't been implemented yet, so the disable logic isn't needed in Phase 45
   - Recommendation: Phase 45 does NOT need to implement the disabled state. Add a comment noting Phase 46 will add this guard. The ComboBox should be fully enabled in Phase 45.

---

## Validation Architecture

> `workflow.nyquist_validation` is `false` in `.planning/config.json` — Validation Architecture section skipped.

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `FuzzyClock.Core/IPhraseProvider.cs` — interface contract verified
- Direct code inspection: `FuzzyClock.Core/PhraseEngine.cs` — `_providers` dict, `SetLocale()`, locale key format
- Direct code inspection: `FuzzyClock.Core/EnglishPhraseProvider.cs` — bucket table reference implementation
- Direct code inspection: `FuzzyClock.App/MainWindow.xaml.cs` — `PhraseStyleChanged` handler gap confirmed at line 358
- Direct code inspection: `FuzzyClock.App/SettingsWindow.xaml` — single `<ComboBoxItem Content="Classic"/>` confirmed
- Direct code inspection: `FuzzyClock.App/SettingsWindow.xaml.cs` — `CmbPhraseStyle.SelectedIndex = 0` hardcoding at line 78
- Direct code inspection: `FuzzyClock.App/AppSettings.cs` — `PhraseStyle { get; init; } = "Classic"` field exists
- Direct code inspection: `.planning/STATE.md` — decisions about PhraseStyle/TextStyle separation, locale key format
- Direct code inspection: `FuzzyClock.Core.Tests/PhraseEngineCoordinatorTests.cs` — `[TestCleanup]` ResetLocale pattern

### Secondary (MEDIUM confidence)
- `.planning/phases/41-phraseengine-provider-refactor/41-01-SUMMARY.md` — confirms Phase 41 delivered extensibility seam and locale key format convention

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all infrastructure verified by direct code inspection; no external libraries
- Architecture patterns: HIGH — patterns from Phase 41 are fully established and working; gaps identified by direct code reading
- Pitfalls: HIGH — gaps #1 and #2 (missing SetLocale calls) confirmed by direct code inspection; others inferred from known patterns
- Phrase content: MEDIUM — example phrases from requirements spec; full vocabulary must be defined in PLAN.md

**Research date:** 2026-03-09
**Valid until:** 2026-04-08 (30 days — stable project, no external dependencies)
