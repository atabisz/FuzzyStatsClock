# Phase 46: Multilingual Phrases - Research

**Researched:** 2026-03-09
**Domain:** C# provider pattern extension — new language phrase providers + CultureInfo-driven auto-select + SettingsWindow UI gating
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| LANG-01 | Widget detects Windows UI culture (`CultureInfo.CurrentUICulture`) and displays phrases in the matching language when supported | `CultureInfo.CurrentUICulture.TwoLetterISOLanguageName` maps directly to provider locale keys; detected once at startup in `ApplySettings()` |
| LANG-02 | Supported languages: English (default fallback), French, Spanish, German, Japanese, Polish | Six new provider classes (`fr`, `es`, `de`, `ja`, `pl`) + registration in `PhraseEngine._providers` dictionary; English Classic remains default |
| LANG-03 | Each supported language provides phrase sets covering all 5-minute time buckets (all hours, noon, midnight special cases) | Same 12-bucket + special-case structure as `EnglishPhraseProvider`; `GetStructuredPhrase` returns `("", fullPhrase)` for all non-English |
| LANG-04 | Unsupported locales display phrases in English | `SetLocale` returns `false` for unknown keys; startup code falls back to `"en-classic"` on false return |
</phase_requirements>

---

## Summary

Phase 41 delivered the `IPhraseProvider` interface and `PhraseEngine` static facade with a private `Dictionary<string, IPhraseProvider>` registry. Phase 45 delivered `TersePhraseProvider`, `PoeticPhraseProvider`, and `RudePhraseProvider` as `en-terse`, `en-poetic`, and `en-rude` entries. Phase 46 extends this exact same pattern: add five new provider classes (`FrenchPhraseProvider`, `SpanishPhraseProvider`, `GermanPhraseProvider`, `JapanesePhraseProvider`, `PolishPhraseProvider`), register them as `"fr"`, `"es"`, `"de"`, `"ja"`, `"pl"` in `PhraseEngine._providers`, and wire auto-detection via `CultureInfo.CurrentUICulture` at startup.

The auto-detection path must coexist with the phrase-style path. Currently, `ApplySettings()` maps `PhraseStyle` ("Classic"/"Terse"/"Poetic"/"Rude") to a locale key like `"en-classic"`. Phase 46 adds a new decision gate: if the system culture is a supported non-English language, override the locale key with the language key (`"fr"`, `"es"`, etc.) regardless of PhraseStyle. The `PhraseStyle` combo in `SettingsWindow` must be disabled for non-English locales — two TODO comments already mark these spots in the codebase.

The `REQUIREMENTS.md` and `STATE.md` both confirm that `GetStructuredPhrase` for non-English providers returns `("", fullPhrase)` — the Japanese decision in STATE.md explicitly says `("", fullPhrase)` fallback. This is the same pattern already used by `TersePhraseProvider`, `PoeticPhraseProvider`, and `RudePhraseProvider`. No split-layout typography decomposition is needed for non-English languages.

**Primary recommendation:** Add one provider class per language following the `TersePhraseProvider` pattern (flat bucket table, `GetStructuredPhrase` returns `("", GetPhrase(dt))`), register all five in `PhraseEngine._providers`, detect language at startup via `CultureInfo.CurrentUICulture.TwoLetterISOLanguageName`, and disable `CmbPhraseStyle` in `SettingsWindow` when a non-English language is active.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| .NET 10 C# | 10.0 (project baseline) | `CultureInfo.CurrentUICulture` for locale detection; `IPhraseProvider` implementation | Already in use; no new dependencies |
| MSTest 4.0.1 | 4.0.1 (already installed) | Provider contract tests + coordinator tests | Existing test infrastructure; matches all other phase test patterns |

No new NuGet packages are required.

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `System.Globalization.CultureInfo` | .NET 10 BCL | Detect Windows UI language | Startup locale detection in `ApplySettings()` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `CultureInfo.CurrentUICulture` | `CultureInfo.CurrentCulture` | `CurrentUICulture` reflects Windows display language (UI); `CurrentCulture` reflects regional formatting preferences (date/number). LANG-01 requirement explicitly specifies `CurrentUICulture` — locked. |
| Flat bucket array (same as English) | RESX / ResourceDictionary | RESX adds build tooling complexity for what is pure phrase data; flat arrays are already the project idiom and are unit-testable without WPF |
| Hard-coded phrases per provider | External translation files | No runtime editing needed; in-code phrases allow static analysis, tests against specific strings |

---

## Architecture Patterns

### Recommended Project Structure

```
FuzzyClock.Core/
├── IPhraseProvider.cs            # existing — no changes
├── PhraseEngine.cs               # add 5 entries to _providers dictionary
├── EnglishPhraseProvider.cs      # existing — no changes
├── TersePhraseProvider.cs        # existing — no changes
├── PoeticPhraseProvider.cs       # existing — no changes
├── RudePhraseProvider.cs         # existing — no changes
├── FrenchPhraseProvider.cs       # new
├── SpanishPhraseProvider.cs      # new
├── GermanPhraseProvider.cs       # new
├── JapanesePhraseProvider.cs     # new
└── PolishPhraseProvider.cs       # new

FuzzyClock.App/
├── MainWindow.xaml.cs            # ApplySettings(): add culture-detection gate; SetPhraseStyle(): add non-English guard
└── SettingsWindow.xaml.cs        # PopulateControls(): disable CmbPhraseStyle for non-English locales

FuzzyClock.Core.Tests/
├── PhraseEngineCoordinatorTests.cs  # existing — add new SetLocale tests for "fr"/"es"/"de"/"ja"/"pl"
└── MultilingualPhraseProviderTests.cs  # new — contract tests for all 5 new providers
```

### Pattern 1: Language Provider (flat bucket + structured passthrough)

**What:** Each new language provider follows the `TersePhraseProvider` structure exactly: a private static `string[] HourWords`, a private static `(int UpperBound, string Template)[] Buckets`, `GetPhrase()` with noon/midnight special cases, and `GetStructuredPhrase()` returning `("", GetPhrase(dt))`.

**When to use:** All five new languages. No split-layout decomposition is needed or desired (STATE.md decision: non-English `GetStructuredPhrase` returns `("", fullPhrase)` for all).

**Example:**

```csharp
// FuzzyClock.Core/FrenchPhraseProvider.cs
namespace FuzzyClock.Core;

public class FrenchPhraseProvider : IPhraseProvider
{
    private static readonly string[] HourWords =
        ["", "une heure", "deux heures", "trois heures", "quatre heures",
             "cinq heures", "six heures", "sept heures", "huit heures",
             "neuf heures", "dix heures", "onze heures", "douze heures"];

    private static readonly (int UpperBound, string Template)[] Buckets =
    [
        ( 2, "{h}"),
        ( 7, "{h} passé"),
        (12, "dix minutes passé {h}"),
        (17, "et quart {h}"),
        (22, "vingt minutes passé {h}"),
        (27, "presque la demie {h}"),
        (32, "{h} et demie"),
        (37, "passé la demie {h}"),
        (42, "presque vingt minutes avant {h1}"),
        (47, "moins le quart {h1}"),
        (52, "bientôt {h1}"),
        (59, "presque {h1}"),
    ];

    public string GetPhrase(DateTime dt)
    {
        int totalMinutes = dt.Hour * 60 + dt.Minute;
        if (totalMinutes == 720) return "midi";
        if (totalMinutes == 0)   return "minuit";

        int minute = dt.Minute;
        int hour12 = dt.Hour % 12;
        if (hour12 == 0) hour12 = 12;
        int nextHour12 = (hour12 % 12) + 1;

        foreach (var (upperBound, template) in Buckets)
        {
            if (minute <= upperBound)
                return template
                    .Replace("{h}",  HourWords[hour12])
                    .Replace("{h1}", HourWords[nextHour12]);
        }

        throw new InvalidOperationException($"No bucket matched minute={minute}");
    }

    public (string Qualifier, string Emphasis) GetStructuredPhrase(DateTime dt) =>
        ("", GetPhrase(dt));
}
```

### Pattern 2: PhraseEngine Registry Extension

**What:** Add five entries to the existing `_providers` dictionary in `PhraseEngine.cs`. No other changes to the class shape.

**Example:**

```csharp
// PhraseEngine.cs — _providers dictionary (after Phase 46)
private static readonly Dictionary<string, IPhraseProvider> _providers = new()
{
    ["en-classic"] = new EnglishPhraseProvider(),
    ["en-terse"]   = new TersePhraseProvider(),
    ["en-poetic"]  = new PoeticPhraseProvider(),
    ["en-rude"]    = new RudePhraseProvider(),
    ["fr"]         = new FrenchPhraseProvider(),
    ["es"]         = new SpanishPhraseProvider(),
    ["de"]         = new GermanPhraseProvider(),
    ["ja"]         = new JapanesePhraseProvider(),
    ["pl"]         = new PolishPhraseProvider(),
};
```

### Pattern 3: Startup Culture Detection in ApplySettings()

**What:** After loading `AppSettings`, detect `CultureInfo.CurrentUICulture.TwoLetterISOLanguageName`. If the two-letter code matches a non-English supported language, call `PhraseEngine.SetLocale(langCode)` to activate the language provider. If not supported, proceed with the existing PhraseStyle-to-locale mapping.

**When to use:** In `ApplySettings()` before `Show()`, same location as the existing `_currentPhraseStyle` / `SetLocale` block.

**Example:**

```csharp
// MainWindow.xaml.cs — ApplySettings() locale section
_currentPhraseStyle = s.PhraseStyle;

// LANG-01: detect Windows UI language; non-English supported languages take priority
string uiLang = System.Globalization.CultureInfo.CurrentUICulture.TwoLetterISOLanguageName;
bool nonEnglishActive = uiLang is "fr" or "es" or "de" or "ja" or "pl";

if (nonEnglishActive)
{
    PhraseEngine.SetLocale(uiLang);
}
else
{
    PhraseEngine.SetLocale(_currentPhraseStyle.ToLowerInvariant() switch
    {
        "terse"  => "en-terse",
        "poetic" => "en-poetic",
        "rude"   => "en-rude",
        _        => "en-classic",
    });
}
```

### Pattern 4: SettingsWindow CmbPhraseStyle Disable

**What:** Two TODO comments in the codebase already mark where `CmbPhraseStyle` must be disabled for non-English locales. The disable must happen in two places: `PopulateControls()` in `SettingsWindow.xaml.cs` (set `IsEnabled = false` when non-English) and in `SetPhraseStyle()` in `MainWindow.xaml.cs` (guard: do nothing if non-English locale is active).

**When to use:** Only when `uiLang` is one of the five non-English supported languages.

**Example:**

```csharp
// SettingsWindow.xaml.cs — PopulateControls() — existing TODO location
// TODO Phase 46: disable CmbPhraseStyle when non-English locale is active
string uiLang = System.Globalization.CultureInfo.CurrentUICulture.TwoLetterISOLanguageName;
bool nonEnglishActive = uiLang is "fr" or "es" or "de" or "ja" or "pl";
CmbPhraseStyle.IsEnabled = !nonEnglishActive;
CmbPhraseStyle.SelectedIndex = nonEnglishActive ? 0 : s.PhraseStyle switch
{
    "Terse"  => 1,
    "Poetic" => 2,
    "Rude"   => 3,
    _        => 0,
};
```

### Anti-Patterns to Avoid

- **Using `CultureInfo.CurrentCulture` instead of `CurrentUICulture`:** `CurrentCulture` is regional format (date/number separators). `CurrentUICulture` is the display language. REQUIREMENTS.md LANG-01 specifies `CurrentUICulture` explicitly.
- **Storing detected language in AppSettings:** The language is always re-detected from `CurrentUICulture` at startup. Do not persist it — if the user changes their Windows language, the widget should pick it up on next launch automatically.
- **Calling `SetLocale` from the timer thread:** `SetLocale` writes static mutable state. It must only be called from the UI thread (startup `ApplySettings()` path). The timer fires on the UI thread via `DispatcherTimer`, so this is safe, but do not add locale re-detection inside the timer callback.
- **Implementing `GetStructuredPhrase` with qualifier split for non-English:** STATE.md decision: `("", fullPhrase)` for all non-English. Split layout is English-specific.
- **Adding hour words as index 0 = empty string without verifying:** Index 0 in `HourWords` is always `""` (a guard/sentinel). Index 1 = first hour word. This is the existing convention from `EnglishPhraseProvider` — all new providers must follow it.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Windows UI language detection | Custom registry reader for `HKCU\Control Panel\International` | `CultureInfo.CurrentUICulture.TwoLetterISOLanguageName` | BCL API is reliable, tested, respects Language Pack fallback chain |
| Translation management | RESX files, ResourceManager, satellite assemblies | Inline phrase arrays in provider classes | RESX/.NET localization pipeline requires LocBaml (broken on .NET 10, listed as Out of Scope in REQUIREMENTS.md) |
| Locale fallback chain | Custom fallback logic | `SetLocale()` returning `bool` false = use English | Already designed in Phase 41; LANG-04 just means "if `SetLocale` returns false, do nothing extra (en-classic is already active by default)" |

**Key insight:** The provider pattern from Phase 41 was designed explicitly for this phase. There is no new infrastructure to build — only new provider implementations and a 3-line culture detection block.

---

## Common Pitfalls

### Pitfall 1: Japanese hour words — cardinal vs. clock-time form

**What goes wrong:** Japanese has two systems for reading numbers: native Japanese (hitotsu, futatsu...) and Sino-Japanese (ichi, ni, san...). Clock times use Sino-Japanese + "ji" (時): `一時` (ichi-ji), `二時` (ni-ji). Using native Japanese counting gives unnatural time phrases.

**Why it happens:** Defaulting to general number words rather than clock-specific forms.

**How to avoid:** Japanese `HourWords` must use Sino-Japanese + 時 suffix: `["", "一時", "二時", "三時", "四時", "五時", "六時", "七時", "八時", "九時", "十時", "十一時", "十二時"]`. Bucket templates use these directly.

**Warning signs:** STATE.md already notes "Japanese phrase naturalness is medium confidence; native-speaker review of 12 bucket phrases recommended before phase is marked done."

### Pitfall 2: German gendered articles for "half" and "quarter" phrases

**What goes wrong:** German time phrases vary by region. In some dialects "halb vier" (half four) means 3:30, similar to British English. Standard German also uses "Viertel nach" (quarter past) and "Viertel vor" (quarter to). Mixing formal/informal or regional variants within one provider gives inconsistent output.

**Why it happens:** German has well-known regional variation in time telling (Northern vs. Southern German, Austrian).

**How to avoid:** Choose one consistent register: standard High German, formal style. Document the choice as a comment in `GermanPhraseProvider.cs`. Example bucket for half-hour: `"halb {h1}"` (half = half-before the next hour, identical to British terse).

**Warning signs:** Phrases that mix "Viertel nach" with Southern dialect "viertel" in adjacent buckets.

### Pitfall 3: Static `_providers` dictionary not updated — `SetLocale("fr")` still returns false

**What goes wrong:** New provider classes exist but are not registered in `PhraseEngine._providers`. `SetLocale("fr")` returns `false`, English is used, and LANG-01 appears broken.

**Why it happens:** Forgetting to add dictionary entries after adding provider files.

**How to avoid:** Add all five entries to `_providers` in `PhraseEngine.cs` as a single task. Coordinator tests for `SetLocale("fr")` returning `true` will catch this immediately.

**Warning signs:** `PhraseEngineCoordinatorTests.SetLocale_Fr_ReturnsTrue` fails.

### Pitfall 4: `ApplySettings()` locale detection runs after `SetPhraseStyle()` is called from SettingsWindow

**What goes wrong:** If a non-English locale is active but `PhraseStyleChanged` event fires (e.g. SettingsWindow opened and closed without changes), `SetPhraseStyle` in `MainWindow.xaml.cs` would re-call `PhraseEngine.SetLocale("en-classic")`, overriding the language provider.

**Why it happens:** The existing `SetPhraseStyle()` method has no awareness of whether a non-English locale is active.

**How to avoid:** Add a guard at the top of `SetPhraseStyle()`: if a non-English locale is active (check `PhraseEngine.CurrentLocale` against the five language keys), return early without calling `SetLocale`. The TODO comment already marks this spot: `// TODO Phase 46: disable CmbPhraseStyle when non-English locale is active`.

**Warning signs:** Widget reverts to English after user opens/closes SettingsWindow on a non-English Windows install.

### Pitfall 5: Spanish special character encoding

**What goes wrong:** Phrases containing `ñ`, `é`, `ó` etc. appear as mojibake if the `.cs` file is saved in a non-UTF-8 encoding.

**Why it happens:** Some editors default to Windows-1252.

**How to avoid:** All new `.cs` files are UTF-8 (standard for .NET 10 projects). No BOM required. Verify the file saves correctly in the IDE — the project's existing files use UTF-8 with no issues.

---

## Code Examples

### CultureInfo detection (startup)

```csharp
// Source: .NET 10 BCL — System.Globalization.CultureInfo
using System.Globalization;

string uiLang = CultureInfo.CurrentUICulture.TwoLetterISOLanguageName;
// Returns ISO 639-1 two-letter code: "en", "fr", "es", "de", "ja", "pl", etc.
bool nonEnglishActive = uiLang is "fr" or "es" or "de" or "ja" or "pl";
```

### Complete PhraseEngine._providers after Phase 46

```csharp
private static readonly Dictionary<string, IPhraseProvider> _providers = new()
{
    ["en-classic"] = new EnglishPhraseProvider(),
    ["en-terse"]   = new TersePhraseProvider(),
    ["en-poetic"]  = new PoeticPhraseProvider(),
    ["en-rude"]    = new RudePhraseProvider(),
    ["fr"]         = new FrenchPhraseProvider(),
    ["es"]         = new SpanishPhraseProvider(),
    ["de"]         = new GermanPhraseProvider(),
    ["ja"]         = new JapanesePhraseProvider(),
    ["pl"]         = new PolishPhraseProvider(),
};
```

### Japanese provider skeleton (Sino-Japanese clock words)

```csharp
// FuzzyClock.Core/JapanesePhraseProvider.cs
namespace FuzzyClock.Core;

public class JapanesePhraseProvider : IPhraseProvider
{
    // Sino-Japanese clock hours: index 1-12 map to 一時 through 十二時
    private static readonly string[] HourWords =
        ["", "一時", "二時", "三時", "四時", "五時", "六時",
              "七時", "八時", "九時", "十時", "十一時", "十二時"];

    private static readonly (int UpperBound, string Template)[] Buckets =
    [
        ( 2, "{h}ちょうど"),
        ( 7, "{h}過ぎ"),
        (12, "{h}十分過ぎ"),
        (17, "{h}十五分"),
        (22, "{h}二十分"),
        (27, "{h}半近く"),
        (32, "{h}半"),
        (37, "{h}半過ぎ"),
        (42, "{h1}二十分前"),
        (47, "{h1}十五分前"),
        (52, "もうすぐ{h1}"),
        (59, "{h1}近く"),
    ];

    public string GetPhrase(DateTime dt)
    {
        int totalMinutes = dt.Hour * 60 + dt.Minute;
        if (totalMinutes == 720) return "正午";
        if (totalMinutes == 0)   return "真夜中";

        int minute = dt.Minute;
        int hour12 = dt.Hour % 12;
        if (hour12 == 0) hour12 = 12;
        int nextHour12 = (hour12 % 12) + 1;

        foreach (var (upperBound, template) in Buckets)
        {
            if (minute <= upperBound)
                return template
                    .Replace("{h}",  HourWords[hour12])
                    .Replace("{h1}", HourWords[nextHour12]);
        }

        throw new InvalidOperationException($"No bucket matched minute={minute}");
    }

    public (string Qualifier, string Emphasis) GetStructuredPhrase(DateTime dt) =>
        ("", GetPhrase(dt));
}
```

### Coordinator test extension for new languages

```csharp
// FuzzyClock.Core.Tests/PhraseEngineCoordinatorTests.cs — additions
[TestMethod]
public void SetLocale_Fr_ReturnsTrue()
{
    bool result = PhraseEngine.SetLocale("fr");
    Assert.IsTrue(result);
    Assert.AreEqual("fr", PhraseEngine.CurrentLocale);
}

[TestMethod]
public void SetLocale_UnsupportedLocale_ReturnsFalse_EnClassicPreserved()
{
    bool result = PhraseEngine.SetLocale("zh");
    Assert.IsFalse(result);
    Assert.AreEqual("en-classic", PhraseEngine.CurrentLocale);
}
```

### Provider contract test template (all 5 new languages)

```csharp
// FuzzyClock.Core.Tests/MultilingualPhraseProviderTests.cs
[TestClass]
public class FrenchPhraseProviderTests
{
    [TestCleanup]
    public void ResetLocale() => PhraseEngine.SetLocale("en-classic");

    [TestMethod]
    public void French_Noon_ReturnsMidi()
    {
        PhraseEngine.SetLocale("fr");
        Assert.AreEqual("midi", PhraseEngine.GetPhrase(new DateTime(2024, 1, 1, 12, 0, 0)));
    }

    [TestMethod]
    public void French_Midnight_ReturnMinuit()
    {
        PhraseEngine.SetLocale("fr");
        Assert.AreEqual("minuit", PhraseEngine.GetPhrase(new DateTime(2024, 1, 1, 0, 0, 0)));
    }

    [TestMethod]
    public void French_AllBuckets_ReturnNonEmpty()
    {
        PhraseEngine.SetLocale("fr");
        int[] probeMinutes = [0, 1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
        foreach (int m in probeMinutes)
        {
            var dt = new DateTime(2024, 1, 1, 3, m, 0);
            string phrase = PhraseEngine.GetPhrase(dt);
            Assert.IsFalse(string.IsNullOrEmpty(phrase), $"Empty phrase for minute={m}");
        }
    }

    [TestMethod]
    public void French_GetStructuredPhrase_ReturnsEmptyQualifier()
    {
        PhraseEngine.SetLocale("fr");
        var (qualifier, emphasis) = PhraseEngine.GetStructuredPhrase(new DateTime(2024, 1, 1, 3, 0, 0));
        Assert.AreEqual("", qualifier);
        Assert.IsFalse(string.IsNullOrEmpty(emphasis));
    }
}
// Repeat pattern for SpanishPhraseProviderTests, GermanPhraseProviderTests,
// JapanesePhraseProviderTests, PolishPhraseProviderTests
```

---

## State of the Art

| Old Shape | New Shape | When Changed | Impact |
|-----------|-----------|--------------|--------|
| `PhraseEngine` English-only, no locale concept | Static facade with `Dictionary<string, IPhraseProvider>`, locale keys | Phase 41 | Seam enabling all multilingual work |
| Phrase style hardcoded as `"en-classic"` | `SetLocale("en-terse"/"en-poetic"/"en-rude")` driven by `PhraseStyle` setting | Phase 45 | Precedent for how `SetLocale` is called; Phase 46 follows same pattern |
| No language detection | `CultureInfo.CurrentUICulture.TwoLetterISOLanguageName` gate in `ApplySettings()` | Phase 46 | LANG-01 fulfilled |

**Deprecated/outdated:**
- LocBaml WPF localization: does not work with .NET 10 (listed as Out of Scope in REQUIREMENTS.md). Do not use `ResourceDictionary` or `.resx` satellite assemblies for phrase strings.

---

## Open Questions

1. **Japanese phrase naturalness**
   - What we know: STATE.md explicitly flags this: "Japanese phrase naturalness is medium confidence; native-speaker review of 12 bucket phrases recommended before phase is marked done."
   - What's unclear: Whether the bucket phrases in `JapanesePhraseProvider` will read naturally to a native speaker. The bucket structure maps well, but idiomatic time expressions (e.g., `半` for half-hour, `過ぎ` for "past") need validation.
   - Recommendation: Include a code comment in `JapanesePhraseProvider.cs` that flags each bucket phrase as "provisional — native-speaker review recommended." Mark the LANG-03 requirement as "implemented but pending naturalness review" in the phase verification.

2. **Polish grammatical agreement**
   - What we know: Polish uses grammatical cases and gendered agreement. Time phrases like "za kwadrans czwarta" (a quarter before four) require the hour noun in genitive case.
   - What's unclear: Full declension tables for all 12 hours across all phrase contexts would be complex. A simplified consistent form (nominative throughout) may sound slightly unnatural but will be correct and intelligible.
   - Recommendation: Use a simplified consistent register that avoids the most complex case agreement. Document this simplification as a comment. The requirement only asks that phrases "cover all 5-minute time buckets" — grammatical perfectionism is not required for v3.2.

3. **`SetPhraseStyle` guard: detect non-English by `CurrentLocale` or by `uiLang` field**
   - What we know: `MainWindow` does not currently store `uiLang` as a field. `PhraseEngine.CurrentLocale` is always accessible.
   - Recommendation: Use `PhraseEngine.CurrentLocale` directly in the `SetPhraseStyle` guard: check `!PhraseEngine.CurrentLocale.StartsWith("en-")`. This is clean and doesn't require adding a new private field to `MainWindow`.

---

## Sources

### Primary (HIGH confidence)

- Direct code inspection: `C:/src/FuzzyStatsClock/FuzzyClock.Core/PhraseEngine.cs` — current registry confirmed; 4 entries (en-classic, en-terse, en-poetic, en-rude)
- Direct code inspection: `C:/src/FuzzyStatsClock/FuzzyClock.Core/IPhraseProvider.cs` — interface shape confirmed
- Direct code inspection: `C:/src/FuzzyStatsClock/FuzzyClock.Core/TersePhraseProvider.cs` — provider pattern to replicate
- Direct code inspection: `C:/src/FuzzyStatsClock/FuzzyClock.App/MainWindow.xaml.cs` — TODO comments at lines 1083, 1086–1094; `ApplySettings()` locale block at lines 282–290
- Direct code inspection: `C:/src/FuzzyStatsClock/FuzzyClock.App/SettingsWindow.xaml.cs` — TODO comment at line 78; CmbPhraseStyle population at lines 79–85
- `.planning/REQUIREMENTS.md` — LANG-01/02/03/04 requirements; Out of Scope: LocBaml; Phrase Style control disabled for non-English
- `.planning/STATE.md` — Japanese `GetStructuredPhrase` fallback decision; Phase 46 blocker note on Japanese naturalness
- `.planning/phases/41-phraseengine-provider-refactor/41-RESEARCH.md` — Phase 41 architecture decisions confirmed

### Secondary (MEDIUM confidence)

- `CultureInfo.CurrentUICulture.TwoLetterISOLanguageName`: .NET BCL; returns ISO 639-1 two-letter code. Windows always sets this from the OS display language. Well-established .NET behavior, no external verification needed beyond training knowledge.

### Tertiary (LOW confidence — flag for validation)

- Japanese bucket phrase naturalness: phrases in `JapanesePhraseProvider` above are constructed from known Japanese time vocabulary but have not been validated by a native speaker. Mark as provisional.
- Polish case agreement simplification: using nominative-only forms is a simplification. Intelligible but may not be idiomatic to native Polish speakers.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; pure extension of existing Phase 41/45 provider pattern
- Architecture: HIGH — all call sites, TODO markers, and integration points verified by direct code inspection
- Pitfalls: HIGH (English/structural pitfalls) / MEDIUM (language-specific naturalness for Japanese/Polish)

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable — no third-party libraries; .NET BCL `CultureInfo` API is stable)
