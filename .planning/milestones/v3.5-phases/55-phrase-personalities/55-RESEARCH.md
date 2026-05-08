# Phase 55: Phrase Personalities - Research

**Researched:** 2026-03-11
**Domain:** C# phrase provider pattern — 7 new IPhraseProvider implementations wired into PhraseEngine + SettingsWindow
**Confidence:** HIGH (all findings from direct codebase inspection + project planning docs)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PHRASE-01 | User sees significantly ruder vocabulary in Rude style (WTF, dafaq, tf, etc.) | RudePhraseProvider bucket table rewrite; existing class kept, only bucket strings replaced; existing tests updated in same commit |
| PHRASE-02 | User can select Pirate phrase style | New PiratePhraseProvider; register `"en-pirate"` in PhraseEngine._providers; add ComboBoxItem; extend both locale switches |
| PHRASE-03 | User can select Dwarf phrase style | New DwarfPhraseProvider; register `"en-dwarf"`; same 3-touch-point pattern |
| PHRASE-04 | User can select Jive phrase style | New JivePhraseProvider; register `"en-jive"`; same pattern |
| PHRASE-05 | User can select Valley Girl phrase style | New ValleyGirlPhraseProvider; register `"en-valleygirl"`; same pattern |
| PHRASE-06 | User can select Yoda phrase style | New YodaPhraseProvider; register `"en-yoda"`; same pattern |
| PHRASE-07 | User can select Shakespearean phrase style | New ShakespearePhraseProvider; register `"en-shakespeare"`; needs private OrdinalHourWords array for ordinal hour tokens |
| PHRASE-08 | All new styles appear in Settings window Phrase Style selector and persist across restarts | CmbPhraseStyle gets 6 new ComboBoxItems (indices 4–9); AppSettings.PhraseStyle serializes as string — new values work without migration; PopulateControls switch updated |
| PHRASE-09 | Tests cover each new style with >= 2 phrase samples verified per provider | New test classes in PhraseStyleProviderTests.cs; each class follows the TestCleanup reset pattern; Rude tests updated to match new vocabulary |
</phase_requirements>

---

## Summary

Phase 55 is a pure provider-pattern expansion: one new `IPhraseProvider` class per personality, registered in `PhraseEngine._providers`, wired into the Settings window `CmbPhraseStyle` ComboBox, and covered by tests. The `RudePhraseProvider` is a rewrite-in-place (same class, same locale key `"en-rude"`, entirely new bucket strings).

There are exactly five touch points for every new style, and they must be updated atomically: (1) the provider class itself, (2) `PhraseEngine._providers` dictionary entry, (3) the locale switch in `ApplySettings()`, (4) the locale switch in `SetPhraseStyle()`, and (5) a `<ComboBoxItem>` in `SettingsWindow.xaml`. Additionally, `SettingsWindow.xaml.cs` has a `CmbPhraseStyle.SelectedIndex` switch in `PopulateControls()` that maps `PhraseStyle` strings to index values; this is a sixth touch point that must also be extended.

The `SettingsService.Validate()` method does NOT currently guard `PhraseStyle` — the field has no `validStyles` array. No new guard is strictly required (unknown styles fall through to `"en-classic"` gracefully), but consistency with the existing TextStyle guard pattern suggests adding one.

**Primary recommendation:** Write all 6 new provider files and the Rude rewrite first, then update PhraseEngine + both MainWindow switches + SettingsWindow XAML + SettingsWindow code-behind all in the same commit batch. Write test classes using the exact pattern from `PhraseStyleProviderTests.cs`.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `IPhraseProvider` interface | project-local | Contract for all phrase providers | Established in Phase 41; unchanged |
| `PhraseEngine` static class | project-local | Registry and dispatcher | Established in Phase 41; only `_providers` dict changes |
| MSTest v2/v3 | project-defined | Unit test framework | Used by all existing test projects |

### No New Dependencies
Phase 55 requires zero new NuGet packages. All work is in `FuzzyClock.Core` (new provider classes) and `FuzzyClock.App` (XAML + code-behind wiring).

---

## Architecture Patterns

### Recommended Project Structure

All new providers are flat in `FuzzyClock.Core/` root — no `Providers/` subdirectory exists and one should not be introduced.

```
FuzzyClock.Core/
├── IPhraseProvider.cs              # unchanged
├── PhraseEngine.cs                 # add 6 entries to _providers dict
├── EnglishPhraseProvider.cs        # unchanged
├── TersePhraseProvider.cs          # unchanged
├── PoeticPhraseProvider.cs         # unchanged
├── RudePhraseProvider.cs           # REWRITE — replace all 12 bucket strings + 2 specials
├── PiratePhraseProvider.cs         # NEW
├── DwarfPhraseProvider.cs          # NEW
├── JivePhraseProvider.cs           # NEW
├── ValleyGirlPhraseProvider.cs     # NEW
├── YodaPhraseProvider.cs           # NEW
└── ShakespearePhraseProvider.cs    # NEW

FuzzyClock.Core.Tests/
└── PhraseStyleProviderTests.cs     # add 6 new test classes + update RudePhraseProviderTests
```

### Pattern 1: IPhraseProvider Bucket Table (all new providers)

**What:** Each provider holds a `private static readonly (int UpperBound, string Template)[]` array. `GetPhrase(DateTime)` computes `hour12` / `nextHour12`, checks totalMinutes for noon/midnight specials, then walks buckets and returns the first match where `dt.Minute <= upperBound`, substituting `{h}` and `{h1}` with hour words.

**Exact interface:**
```csharp
public interface IPhraseProvider
{
    string GetPhrase(DateTime dt);
    (string Qualifier, string Emphasis) GetStructuredPhrase(DateTime dt);
}
```

**Standard provider skeleton (copy from RudePhraseProvider or EnglishPhraseProvider):**
```csharp
namespace FuzzyClock.Core;

public class PiratePhraseProvider : IPhraseProvider
{
    private static readonly string[] HourWords =
        ["", "one", "two", "three", "four", "five", "six",
             "seven", "eight", "nine", "ten", "eleven", "twelve"];

    private static readonly (int UpperBound, string Template)[] Buckets =
    [
        ( 2, "{h} bells, arr"),
        ( 7, "just past {h} bells, yarr"),
        (12, "ten past {h}, arr"),
        (17, "a quarter past {h}, yarr"),
        (22, "past the quarter bell of {h}"),
        (27, "nigh on half past {h}, arr"),
        (32, "half past {h}, arr"),
        (37, "just past the half bell, yarr"),
        (42, "nigh on a quarter to {h1}"),
        (47, "a quarter to {h1}, arr"),
        (52, "nearly {h1}, yarr"),
        (59, "almost {h1}, shiver me timbers"),
    ];

    public string GetPhrase(DateTime dt)
    {
        int totalMinutes = dt.Hour * 60 + dt.Minute;
        if (totalMinutes == 720) return "high noon at sea, arr";
        if (totalMinutes == 0)   return "the dead of night, yarr";

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

**GetStructuredPhrase contract for all new providers:** All new providers return `("", GetPhrase(dt))`. This is the same pattern used by `RudePhraseProvider`, `TersePhraseProvider`, and `PoeticPhraseProvider`. The structured decomposition logic in `EnglishPhraseProvider` is only needed for the Split/Literary text style display — not required for new personalities.

### Pattern 2: Shakespearean Provider — Ordinal Hour Words

The Shakespearean provider needs ordinal hour forms ("first", "second", ... "twelfth") for templates like `"Hark! The {h}th hour hath struck"`. Use a separate private array and resolve the `{ho}` token internally alongside `{h}` and `{h1}`.

```csharp
private static readonly string[] OrdinalHourWords =
    ["", "first", "second", "third", "fourth", "fifth", "sixth",
         "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth"];
```

Then in `GetPhrase`:
```csharp
return template
    .Replace("{ho}", OrdinalHourWords[hour12])
    .Replace("{h}",  HourWords[hour12])
    .Replace("{h1}", HourWords[nextHour12]);
```

This keeps `IPhraseProvider` interface unchanged.

### Pattern 3: PhraseEngine Registration

**Current state of `PhraseEngine._providers` dictionary (exact code):**
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

**After Phase 55, add 6 lines:**
```csharp
["en-pirate"]      = new PiratePhraseProvider(),
["en-dwarf"]       = new DwarfPhraseProvider(),
["en-jive"]        = new JivePhraseProvider(),
["en-valleygirl"]  = new ValleyGirlPhraseProvider(),
["en-yoda"]        = new YodaPhraseProvider(),
["en-shakespeare"] = new ShakespearePhraseProvider(),
```

### Pattern 4: MainWindow Locale Switch — Three Occurrences

There are **three** `_currentPhraseStyle.ToLowerInvariant() switch` occurrences in `MainWindow.xaml.cs`, all of which must be extended:

1. **`ApplySettings()` — when PhraseLocale == "en"** (around line 318):
```csharp
effectiveLocale = _currentPhraseStyle.ToLowerInvariant() switch
{
    "terse"  => "en-terse",
    "poetic" => "en-poetic",
    "rude"   => "en-rude",
    _        => "en-classic",
};
```

2. **`ApplySettings()` — "auto" branch** (around line 332):
```csharp
effectiveLocale = _currentPhraseStyle.ToLowerInvariant() switch
{
    "terse"  => "en-terse",
    "poetic" => "en-poetic",
    "rude"   => "en-rude",
    _        => "en-classic",
};
```

3. **`SetPhraseStyle(string style)` method** (around line 1200):
```csharp
string localeKey = style.ToLowerInvariant() switch
{
    "terse"  => "en-terse",
    "poetic" => "en-poetic",
    "rude"   => "en-rude",
    _        => "en-classic",
};
```

And a fourth occurrence in `SetLanguage()` for the "en" branch (around line 1222), also needing all new cases.

**All four switch instances must be updated to add:**
```csharp
"pirate"      => "en-pirate",
"dwarf"       => "en-dwarf",
"jive"        => "en-jive",
"valleygirl"  => "en-valleygirl",
"yoda"        => "en-yoda",
"shakespeare" => "en-shakespeare",
```

### Pattern 5: SettingsWindow XAML — ComboBoxItem Additions

**Current XAML (exact):**
```xml
<ComboBox x:Name="CmbPhraseStyle"
          Grid.Row="4" Grid.Column="1"
          Width="120" HorizontalAlignment="Left"
          Margin="0,8,0,0" VerticalAlignment="Center"
          SelectionChanged="CmbPhraseStyle_SelectionChanged">
    <ComboBoxItem Content="Classic"/>
    <ComboBoxItem Content="Terse"/>
    <ComboBoxItem Content="Poetic"/>
    <ComboBoxItem Content="Rude"/>
</ComboBox>
```

**After Phase 55, add 6 more items (indices 4–9):**
```xml
    <ComboBoxItem Content="Pirate"/>
    <ComboBoxItem Content="Dwarf"/>
    <ComboBoxItem Content="Jive"/>
    <ComboBoxItem Content="ValleyGirl"/>
    <ComboBoxItem Content="Yoda"/>
    <ComboBoxItem Content="Shakespeare"/>
```

The `Content` string becomes the value passed to `PhraseStyleChanged` event (via `(string)item.Content`). It must match the `PhraseStyle` value stored in `AppSettings` and the string used in the `ToLowerInvariant()` switch.

### Pattern 6: SettingsWindow Code-Behind — PopulateControls Switch

**Current `PopulateControls()` in `SettingsWindow.xaml.cs`:**
```csharp
CmbPhraseStyle.SelectedIndex = s.PhraseStyle switch
{
    "Terse"  => 1,
    "Poetic" => 2,
    "Rude"   => 3,
    _        => 0,
};
```

**After Phase 55, extend with:**
```csharp
CmbPhraseStyle.SelectedIndex = s.PhraseStyle switch
{
    "Terse"       => 1,
    "Poetic"      => 2,
    "Rude"        => 3,
    "Pirate"      => 4,
    "Dwarf"       => 5,
    "Jive"        => 6,
    "ValleyGirl"  => 7,
    "Yoda"        => 8,
    "Shakespeare" => 9,
    _             => 0,
};
```

### Pattern 7: Test Class Structure (copy from PhraseStyleProviderTests.cs)

**Every new provider test class MUST follow this exact pattern:**
```csharp
[TestClass]
public class PiratePhraseProviderTests
{
    [TestCleanup]
    public void ResetLocale() => PhraseEngine.SetLocale("en-classic");

    [TestMethod]
    public void SetLocale_EnPirate_ReturnsTrue()
    {
        bool result = PhraseEngine.SetLocale("en-pirate");
        Assert.IsTrue(result);
    }

    [TestMethod]
    public void Pirate_OnTheHour_ContainsArr()
    {
        PhraseEngine.SetLocale("en-pirate");
        string phrase = PhraseEngine.GetPhrase(new DateTime(2024, 1, 1, 3, 0, 0));
        StringAssert.Contains(phrase, "arr");
    }

    [TestMethod]
    public void Pirate_Noon_ReturnsHighNoonAtSea()
    {
        PhraseEngine.SetLocale("en-pirate");
        string phrase = PhraseEngine.GetPhrase(new DateTime(2024, 1, 1, 12, 0, 0));
        Assert.AreEqual("high noon at sea, arr", phrase);
    }
}
```

**Rules:**
- `[TestCleanup]` is mandatory — resets static `PhraseEngine` state between test runs
- Call `PhraseEngine.SetLocale("en-xxx")` at the start of each `[TestMethod]`, not in `[TestInitialize]`
- Do NOT add `[DoNotParallelize]` to individual provider test classes (only `PhraseEngineCoordinatorTests` carries this)
- Minimum of 2 sample-verification `[TestMethod]` entries per class (plus the `SetLocale_Returns_True` check)

### Anti-Patterns to Avoid

- **Rude rewrite without updating tests:** The existing `RudePhraseProviderTests` asserts `phrase.Contains("move it")` and `phrase.Contains("get on with it")`. These strings will not exist in the rewritten vocabulary. Update the Rude provider and its tests atomically in one commit or the test count drops below 248 and CI fails.
- **Missing `[TestCleanup]` in new provider test class:** Leaves `PhraseEngine._activeProvider` pointing at the wrong provider for subsequent test classes; causes intermittent failures in Classic phrase tests.
- **Updating only `SetPhraseStyle()` switch, not `ApplySettings()` switches:** New personalities work on live change but revert to Classic on restart. There are four switch sites total — all must match.
- **Missing PopulateControls index mapping:** New styles appear in the ComboBox but always show index 0 (Classic) when the Settings window reopens. `PopulateControls` switch must cover all new `PhraseStyle` strings.
- **Forgetting `SettingsService.Validate()` guard:** Currently no `PhraseStyle` guard exists in `Validate()`. This is acceptable because the `_` fallthrough in the switch handles unknown values gracefully, but adding a guard is consistent with the pattern used for `TextStyle` and `DateFormat`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Hour word lookup | Custom ordinal/word logic per provider | Copy the `HourWords` static array from `EnglishPhraseProvider` into each new provider | Same pattern used by all existing providers; zero runtime cost |
| Style routing | New registration system | Extend `PhraseEngine._providers` dictionary with new keys | Dictionary is already the registry; no new mechanism needed |
| Settings persistence | Custom serialization | `AppSettings.PhraseStyle` is a plain string; `JsonStringEnumConverter` is not needed here; new style strings round-trip automatically | JSON serialization of string fields already works; no change needed |

---

## Complete Vocabulary Tables

### Rude 2.0 (REWRITE of existing RudePhraseProvider)

| Bucket (<=min) | Template | Key vocabulary |
|----------------|----------|----------------|
| 2  | `{h} o'clock, bruh` | bruh |
| 7  | `just after {h}, tf` | tf |
| 12 | `ten past {h}, smh` | smh |
| 17 | `quarter past {h}, ngl` | ngl |
| 22 | `WTF, still quarter past {h}` | WTF |
| 27 | `almost half past {h}, lmao` | lmao |
| 32 | `half past {h}, bruh` | bruh |
| 37 | `just past half {h}, dafaq` | dafaq |
| 42 | `almost quarter to {h1}, rn` | rn |
| 47 | `quarter to {h1}, literally` | literally |
| 52 | `nearly {h1}, smh` | smh |
| 59 | `almost {h1}, WTF` | WTF |

Special: noon → `"noon, bruh"`, midnight → `"midnight, wtf are you doing"`

### Pirate

| Bucket (<=min) | Template |
|----------------|----------|
| 2  | `{h} bells, arr` |
| 7  | `just past {h} bells, yarr` |
| 12 | `ten past {h}, arr` |
| 17 | `a quarter past {h}, yarr` |
| 22 | `past the quarter bell of {h}` |
| 27 | `nigh on half past {h}, arr` |
| 32 | `half past {h}, arr` |
| 37 | `just past the half bell, yarr` |
| 42 | `nigh on a quarter to {h1}` |
| 47 | `a quarter to {h1}, arr` |
| 52 | `nearly {h1}, yarr` |
| 59 | `almost {h1}, shiver me timbers` |

Special: noon → `"high noon at sea, arr"`, midnight → `"the dead of night, yarr"`

### Dwarf

| Bucket (<=min) | Template |
|----------------|----------|
| 2  | `{h}, aye` |
| 7  | `just past {h}, move on` |
| 12 | `ten past {h}, bah` |
| 17 | `a quarter past {h}` |
| 22 | `past the quarter, aye` |
| 27 | `near half past {h}` |
| 32 | `half past {h}, get to work` |
| 37 | `just past half {h}, eh` |
| 42 | `near a quarter to {h1}` |
| 47 | `quarter to {h1}, by the stone` |
| 52 | `nearly {h1}, aye` |
| 59 | `almost {h1}, quit yer dawdlin` |

Special: noon → `"midday. eat."`, midnight → `"deep into the night, bah"`

### Jive (1940s Harlem)

| Bucket (<=min) | Template |
|----------------|----------|
| 2  | `{h} on the nose, daddy-o` |
| 7  | `just past {h}, dig it` |
| 12 | `ten past {h}, solid` |
| 17 | `quarter past {h}, you hip?` |
| 22 | `past the quarter, cat` |
| 27 | `near half past {h}, real gone` |
| 32 | `half past {h}, in the groove` |
| 37 | `just past half {h}, daddy-o` |
| 42 | `almost quarter to {h1}, dig` |
| 47 | `quarter to {h1}, solid` |
| 52 | `nearly {h1}, blow your wig` |
| 59 | `almost {h1}, that's the deal` |

Special: noon → `"high noon, daddy-o"`, midnight → `"the witching hour, cat"`

### Valley Girl

| Bucket (<=min) | Template |
|----------------|----------|
| 2  | `{h} o'clock, like, literally` |
| 7  | `like, just after {h}` |
| 12 | `ten past {h}, totally` |
| 17 | `like, quarter past {h}` |
| 22 | `omg, still quarter past {h}` |
| 27 | `like, almost half past {h}` |
| 32 | `half past {h}, fer sure` |
| 37 | `like, just past half {h}` |
| 42 | `so almost quarter to {h1}` |
| 47 | `quarter to {h1}, whatever` |
| 52 | `like, nearly {h1}` |
| 59 | `omg, almost {h1}` |

Special: noon → `"like, it's literally noon"`, midnight → `"omg it's literally midnight"`

### Yoda

| Bucket (<=min) | Template |
|----------------|----------|
| 2  | `{h} o'clock, it is` |
| 7  | `past {h}, just gone it is` |
| 12 | `ten past {h}, mmm` |
| 17 | `quarter past {h}, yes` |
| 22 | `past the quarter of {h}, it is` |
| 27 | `near half past {h}, we are` |
| 32 | `half past {h}, mmm` |
| 37 | `past the half, just` |
| 42 | `quarter to {h1}, nearly` |
| 47 | `quarter to {h1}, it is` |
| 52 | `nearly {h1}, yes` |
| 59 | `{h1} approaches` |

Special: noon → `"noon it is, hmm"`, midnight → `"midnight, the dark hour, yes"`

### Shakespearean

Uses `{ho}` token for ordinal hour form. Requires private `OrdinalHourWords` array.

| Bucket (<=min) | Template |
|----------------|----------|
| 2  | `Hark! The {ho} hour hath struck` |
| 7  | `'Tis just past the {ho} hour` |
| 12 | `Ten minutes past the {ho} hour` |
| 17 | `A quarter past the {ho} hour` |
| 22 | `Past the quarter of {h}` |
| 27 | `Nigh on half past {h}` |
| 32 | `Half past the {ho} hour, forsooth` |
| 37 | `The half hour is spent` |
| 42 | `Nigh on a quarter to {h1}` |
| 47 | `A quarter to {h1}, methinks` |
| 52 | `Nearly {h1}, anon` |
| 59 | `Almost {h1}, forsooth` |

Special: noon → `"Hark! 'Tis the noontide hour"`, midnight → `"The witching hour doth toll"`

OrdinalHourWords array: `["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth"]`

---

## Common Pitfalls

### Pitfall 1: Missing TestCleanup in New Provider Test Classes
**What goes wrong:** `PhraseEngine._activeProvider` is static/process-global. A new test class that calls `PhraseEngine.SetLocale("en-pirate")` without a `[TestCleanup]` reset leaves the active provider pointing at PirateProvider. Subsequent tests that assume Classic locale produce wrong results, causing intermittent failures.
**Why it happens:** Developers writing new test classes don't realize `PhraseEngine` is a static class with no auto-reset.
**How to avoid:** Copy the `[TestCleanup] public void ResetLocale() => PhraseEngine.SetLocale("en-classic");` from every existing provider test class. This pattern is established in `PhraseStyleProviderTests.cs`.
**Warning signs:** Classic phrase tests fail intermittently; failures differ between parallel and serial test runs.

### Pitfall 2: Rude Rewrite Breaks Existing Tests
**What goes wrong:** `RudePhraseProviderTests.Rude_NearlyHour_ContainsCallout()` asserts `phrase.Contains("move it") || phrase.Contains("get on with it")`. After the rewrite, the new bucket strings (`"nearly {h1}, smh"` and `"almost {h1}, WTF"`) don't contain these strings. Test count drops below 248, CI fails.
**Why it happens:** The test asserts specific vocabulary that the rewrite intentionally replaces.
**How to avoid:** Update `RudePhraseProviderTests` in the same commit as the rewrite. Replace the callout assertion with one that checks for new vocabulary (e.g., `phrase.Contains("smh") || phrase.Contains("WTF")`).
**Warning signs:** CI fails on `RudePhraseProviderTests` while the widget displays Rude phrases correctly.

### Pitfall 3: Only Updating SetPhraseStyle Switch, Not All Three ApplySettings Occurrences
**What goes wrong:** New personalities work on live change but revert to Classic on restart, OR revert when the language is set to "auto" on an English-language machine.
**Why it happens:** There are four separate `_currentPhraseStyle.ToLowerInvariant() switch` instances in `MainWindow.xaml.cs`. Updating only the `SetPhraseStyle` switch leaves the three in `ApplySettings()` and `SetLanguage()` missing the new cases.
**How to avoid:** Search for all four occurrences: two in `ApplySettings()` (the `== "en"` branch and the `"auto"` branch), one in `SetPhraseStyle()`, and one in `SetLanguage()`. All must be extended with the same new cases.
**Warning signs:** Selecting Pirate in Settings works; closing and reopening the app shows Classic.

### Pitfall 4: Missing PopulateControls Index Mapping
**What goes wrong:** When the Settings window opens with `PhraseStyle = "Pirate"` saved, `CmbPhraseStyle.SelectedIndex` resolves to `0` (the `_` default) because the `PopulateControls` switch hasn't been extended. The ComboBox shows "Classic" even though Pirate is active.
**Why it happens:** `PopulateControls()` in `SettingsWindow.xaml.cs` has its own `PhraseStyle switch` for setting the ComboBox selected index; it is separate from the locale routing switches in `MainWindow`.
**How to avoid:** Extend the `CmbPhraseStyle.SelectedIndex = s.PhraseStyle switch { ... }` in `PopulateControls()` with all new style names → index mappings (4–9).
**Warning signs:** After restarting with Pirate selected, Settings window shows Classic in the ComboBox even though Pirate phrases are displayed.

### Pitfall 5: PhraseEngine._providers Missing Entry — SetLocale Returns false Silently
**What goes wrong:** Creating the provider class file does not automatically register it. `PhraseEngine.SetLocale("en-pirate")` returns `false`, the active provider stays at the previous locale, and no exception is thrown.
**Why it happens:** The `_providers` dictionary is a static field initializer, not an auto-discovery registry.
**How to avoid:** Add the `["en-pirate"] = new PiratePhraseProvider()` entry to `PhraseEngine._providers` in the same commit that creates the provider class. The test `SetLocale_EnPirate_ReturnsTrue()` catches this immediately.
**Warning signs:** `PhraseEngine.SetLocale("en-pirate")` returns false in the unit test.

---

## Code Examples

### Complete RudePhraseProvider Rewrite (new bucket table)
```csharp
// Source: .planning/research/FEATURES.md — Rude 2.0 vocabulary spec
private static readonly (int UpperBound, string Template)[] Buckets =
[
    ( 2, "{h} o'clock, bruh"),
    ( 7, "just after {h}, tf"),
    (12, "ten past {h}, smh"),
    (17, "quarter past {h}, ngl"),
    (22, "WTF, still quarter past {h}"),
    (27, "almost half past {h}, lmao"),
    (32, "half past {h}, bruh"),
    (37, "just past half {h}, dafaq"),
    (42, "almost quarter to {h1}, rn"),
    (47, "quarter to {h1}, literally"),
    (52, "nearly {h1}, smh"),
    (59, "almost {h1}, WTF"),
];
// Special: if (totalMinutes == 720) return "noon, bruh";
//          if (totalMinutes == 0)   return "midnight, wtf are you doing";
```

### PhraseEngine Dictionary Addition
```csharp
// Source: FuzzyClock.Core/PhraseEngine.cs — extend existing _providers dict
["en-pirate"]      = new PiratePhraseProvider(),
["en-dwarf"]       = new DwarfPhraseProvider(),
["en-jive"]        = new JivePhraseProvider(),
["en-valleygirl"]  = new ValleyGirlPhraseProvider(),
["en-yoda"]        = new YodaPhraseProvider(),
["en-shakespeare"] = new ShakespearePhraseProvider(),
```

### MainWindow Switch Extension (all 4 sites, same additions)
```csharp
// Source: FuzzyClock.App/MainWindow.xaml.cs — all 4 _currentPhraseStyle switch occurrences
"pirate"      => "en-pirate",
"dwarf"       => "en-dwarf",
"jive"        => "en-jive",
"valleygirl"  => "en-valleygirl",
"yoda"        => "en-yoda",
"shakespeare" => "en-shakespeare",
```

### Updated RudePhraseProviderTests Assertion
```csharp
// Old (will fail after rewrite):
// bool hasCallout = phrase.Contains("move it") || phrase.Contains("get on with it");
// New:
[TestMethod]
public void Rude_NearlyHour_ContainsInternetSlang()
{
    PhraseEngine.SetLocale("en-rude");
    string phrase = PhraseEngine.GetPhrase(new DateTime(2024, 1, 1, 4, 55, 0));
    bool hasSlang = phrase.Contains("smh") || phrase.Contains("WTF") || phrase.Contains("bruh");
    Assert.IsTrue(hasSlang, $"Expected internet slang but got: {phrase}");
}

[TestMethod]
public void Rude_Noon_ContainsBruh()
{
    PhraseEngine.SetLocale("en-rude");
    string phrase = PhraseEngine.GetPhrase(new DateTime(2024, 1, 1, 12, 0, 0));
    Assert.AreEqual("noon, bruh", phrase);
}
```

---

## State of the Art

| Old State (Phase 45 / v3.2) | Phase 55 State | Impact |
|-----------------------------|----------------|--------|
| 4 English phrase styles: Classic, Terse, Poetic, Rude | 10 English phrase styles (4 existing + 6 new) | ComboBox grows from 4 to 10 items |
| Rude = British passive-aggressive ("still here?", "move it") | Rude = internet slang (WTF, bruh, dafaq, smh) | Existing Rude tests must be updated |
| `_providers` dict has 9 entries | `_providers` dict has 15 entries | No architectural change |
| 3 locale switch sites in MainWindow | 4 locale switch sites confirmed (2 in ApplySettings, 1 in SetPhraseStyle, 1 in SetLanguage) | All 4 must be updated |

---

## Locale Key Naming Convention

| Provider Class | Locale Key | PhraseStyle string (AppSettings + ComboBoxItem Content) |
|----------------|------------|---------------------------------------------------------|
| `PiratePhraseProvider` | `"en-pirate"` | `"Pirate"` |
| `DwarfPhraseProvider` | `"en-dwarf"` | `"Dwarf"` |
| `JivePhraseProvider` | `"en-jive"` | `"Jive"` |
| `ValleyGirlPhraseProvider` | `"en-valleygirl"` | `"ValleyGirl"` |
| `YodaPhraseProvider` | `"en-yoda"` | `"Yoda"` |
| `ShakespearePhraseProvider` | `"en-shakespeare"` | `"Shakespeare"` |

Note: `"valleygirl"` is lowercase-no-space in the locale key, but the `PhraseStyle` string stored in settings is `"ValleyGirl"` (PascalCase, matching the ComboBoxItem Content). The `ToLowerInvariant()` switch maps `"valleygirl"` → `"en-valleygirl"` correctly.

---

## Open Questions

1. **SettingsService.Validate() — add PhraseStyle guard?**
   - What we know: No `PhraseStyle` guard currently exists; the `_` default in the locale switch handles unknown values gracefully by falling through to `"en-classic"`.
   - What's unclear: Whether a guard adds value or is redundant given the fallthrough.
   - Recommendation: Add a guard consistent with the `TextStyle` and `DateFormat` pattern. Valid styles: `{ "Classic", "Terse", "Poetic", "Rude", "Pirate", "Dwarf", "Jive", "ValleyGirl", "Yoda", "Shakespeare" }`. Cost is minimal; consistency benefit is real.

2. **CmbPhraseStyle Width — will 120px accommodate "Shakespeare"?**
   - What we know: Current ComboBox `Width="120"`. "Shakespeare" is the longest new entry.
   - What's unclear: Whether 120px clips "Shakespeare" at the default DPI.
   - Recommendation: Increase Width to 140 or use `Width="Auto"` when adding new items. Verify visually in the Settings window.

---

## Sources

### Primary (HIGH confidence — direct codebase inspection)
- `FuzzyClock.Core/IPhraseProvider.cs` — exact interface signature
- `FuzzyClock.Core/PhraseEngine.cs` — exact `_providers` dictionary, `SetLocale()` signature
- `FuzzyClock.Core/RudePhraseProvider.cs` — full existing bucket table (all 12 entries + 2 specials)
- `FuzzyClock.Core/EnglishPhraseProvider.cs` — canonical provider pattern including `GetStructuredPhrase` decomposition
- `FuzzyClock.Core/PoeticPhraseProvider.cs` — provider using hour-range logic instead of minute buckets
- `FuzzyClock.Core.Tests/PhraseStyleProviderTests.cs` — exact `[TestCleanup]` pattern, test method structure
- `FuzzyClock.App/AppSettings.cs` — `PhraseStyle` string property, no `[JsonConverter]` needed
- `FuzzyClock.App/SettingsService.cs` — `Validate()` method, `Defaults()`, no PhraseStyle guard present
- `FuzzyClock.App/MainWindow.xaml.cs` — all 4 `_currentPhraseStyle.ToLowerInvariant() switch` locations; `SetPhraseStyle()` method
- `FuzzyClock.App/SettingsWindow.xaml` — `CmbPhraseStyle` ComboBox with 4 hardcoded `ComboBoxItem` elements, Width="120"
- `FuzzyClock.App/SettingsWindow.xaml.cs` — `PopulateControls()` `PhraseStyle switch`, `PhraseStyleChanged` event declaration, `CmbPhraseStyle_SelectionChanged` handler
- `.planning/research/FEATURES.md` — all 7 vocabulary tables (bucket-by-bucket)
- `.planning/research/ARCHITECTURE.md` — touch-point map, locale key naming convention
- `.planning/research/PITFALLS.md` — pitfalls 3, 6, 7 specifically cover Phase 55

### Secondary (MEDIUM confidence)
- `.planning/REQUIREMENTS.md` — PHRASE-01 through PHRASE-09 requirement text
- `.planning/STATE.md` — confirmed touch-point count and decision history

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all patterns verified from direct code inspection
- Vocabulary tables: HIGH (Rude, Pirate, Dwarf, Valley Girl, Yoda, Shakespearean) / MEDIUM (Jive — vocabulary sourced from documented 1940s lexicon but phrase naturalness is judgment-dependent)
- Touch points: HIGH — confirmed by reading all four switch sites in MainWindow.xaml.cs and the PopulateControls switch in SettingsWindow.xaml.cs
- Pitfalls: HIGH — Rude test breakage is certain if not addressed; TestCleanup pattern directly observable in existing tests

**Research date:** 2026-03-11
**Valid until:** 2026-04-11 (stable codebase; no external dependency changes possible)
