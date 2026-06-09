# Phase 62: Routing Consolidation - Research

**Researched:** 2026-03-24
**Domain:** C# WPF — MainWindow locale routing refactor, SettingsWindow combo enable/disable, PhraseEngine key cleanup, MSTest coordinator tests
**Confidence:** HIGH

## Summary

Phase 62 is a pure internal-refactor phase. No new providers, no new UI controls, no new XAML. The work is entirely confined to four files: `MainWindow.xaml.cs`, `SettingsWindow.xaml.cs`, `PhraseEngine.cs`, and `PhraseEngineCoordinatorTests.cs`. Every decision has been locked in CONTEXT.md; the research task is confirming the exact current state of each change site so the planner can write precise, low-ambiguity tasks.

The three routing sites in `MainWindow.xaml.cs` (ApplySettings ~line 332-374, SetLanguage ~line 1402-1434, SetPhraseStyle ~line 1373-1390) each contain a duplicate locale-switch ladder. ApplySettings and SetLanguage are identical three-arm structures; SetPhraseStyle is a single-arm English-only variant with an early-return guard. The `ResolveLocaleKey` helper absorbs all three ladders. SetPhraseStyle's guard (`!StartsWith("en-")`) must be widened to also pass `"ja-"` prefixed locales; for the Japanese arm it calls `ResolveLocaleKey("ja", style, uiLang)`.

Two SettingsWindow sites need updating: `PopulateControls` line 103 computes `isNonEnglish` that includes `"ja"` in the disable set; `CmbPhraseLanguage_SelectionChanged` line 437 replicates the same logic. Both must have `"ja"` removed from the disable set and replaced with a positive enable condition (`s.PhraseLocale == "ja"` / `locale == "ja"`).

The coordinator test file already contains four ja-* `SetLocale` tests (`SetLocale_JaClassic_ReturnsTrue`, `SetLocale_JaTerse_ReturnsTrue`, `SetLocale_JaPoetic_ReturnsTrue`, `SetLocale_JaRude_ReturnsTrue`) but they only assert `CurrentLocale` and the bool return. D-10 asks for tests that also verify `GetPhrase` returns non-empty — these are additive test methods, not replacements.

**Primary recommendation:** Implement in order — (1) extract `ResolveLocaleKey`, (2) update all three routing sites, (3) remove bare `"ja"` key from PhraseEngine, (4) update SettingsWindow enable logic, (5) add GetPhrase round-trip test methods. The ordering prevents introducing a call to `ResolveLocaleKey` before it exists.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Private method in MainWindow: `private string ResolveLocaleKey(string phraseLocale, string phraseStyle, string uiLang)`.
- **D-02:** Logic:
  - `phraseLocale is "fr" or "es" or "de" or "pl"` → return phraseLocale directly (style ignored)
  - `phraseLocale == "ja"` → return `"ja-" + phraseStyle.ToLowerInvariant()`, fallback to `"ja-classic"` for unrecognized style
  - `phraseLocale == "en"` → return `"en-" + phraseStyle.ToLowerInvariant()` switch (same ladder as today), fallback to `"en-classic"`
  - `phraseLocale == "auto"` and `uiLang is "fr" or "es" or "de" or "ja" or "pl"` → return `"ja-" + phraseStyle` (NOT bare "ja") when uiLang == "ja"; return uiLang directly for fr/es/de/pl
  - `phraseLocale == "auto"` otherwise → compute `"en-" + phraseStyle` same as explicit "en"
- **D-03:** The three routing sites in ApplySettings, SetLanguage, and SetPhraseStyle all call this helper; their duplicated switch blocks are removed.
- **D-04:** SetPhraseStyle keeps its early-return guard for non-English/non-Japanese locales: if `CurrentLocale` does not start with `"en-"` and does not start with `"ja-"`, return early (no-op for fr/es/de/pl).
- **D-05:** For Japanese active locale (`CurrentLocale.StartsWith("ja-")`), SetPhraseStyle calls `ResolveLocaleKey("ja", style, uiLang)` to compute the new key, then calls `PhraseEngine.SetLocale`.
- **D-06:** Remove the bare `"ja"` key from PhraseEngine's `_providers` dictionary. All Japanese routing now uses `"ja-classic"`, `"ja-terse"`, `"ja-poetic"`, `"ja-rude"` exclusively.
- **D-07:** Enable `CmbPhraseStyle` only when the user has **explicitly selected Japanese** (`s.PhraseLocale == "ja"`). Auto-detected Japanese does NOT enable the combo.
- **D-08:** Two places require update in SettingsWindow:
  - `PopulateControls`: enable when `s.PhraseLocale == "ja"`, disable for "fr"/"es"/"de"/"pl" and for "auto"/"en"
  - `CmbPhraseLanguage_SelectionChanged`: update `isNonEnglish` to exclude "ja" (i.e., `locale is "fr" or "es" or "de" or "pl"`)
- **D-09:** Combo items (Classic/Terse/Poetic/Rude) and `PhraseStyleChanged` event payload unchanged.
- **D-10:** Add ja-* round-trip tests in existing `[DoNotParallelize]` `PhraseEngineCoordinatorTests` class. Test cases: SetLocale("ja-terse"), SetLocale("ja-poetic"), SetLocale("ja-rude"), SetLocale("ja-classic") — each verifies CurrentLocale and that GetPhrase returns non-empty.

### Claude's Discretion

- Exact XAML `Tag` values on the Language combo items (already set; confirm they match the `phraseLocale` strings used in routing)
- Variable names for the updated `isNonEnglish`/`isJapanese` logic in SettingsWindow
- Whether to inline the `"ja-" + style` expression or use a nested switch for Japanese style mapping

### Deferred Ideas (OUT OF SCOPE)

- Enabling phrase style combo for auto-detected Japanese
- Style variants for fr/es/de/pl
- Removing "auto" locale + non-English style routing inconsistency for fr/es/de/pl
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| JA-04 | Phrase style selector in Settings is enabled when Japanese locale is active (all four styles: Classic/Terse/Poetic/Rude) | D-07 + D-08: SettingsWindow.PopulateControls line 103 and CmbPhraseLanguage_SelectionChanged line 437 both contain the `isNonEnglish` check that currently disables the combo for "ja"; both must be updated to the positive `locale == "ja"` condition |
| JA-05 | Selecting a Japanese phrase style persists to settings.json and is correctly restored on app restart (all routing sites updated via ResolveLocaleKey helper) | D-01 through D-06: ResolveLocaleKey extraction covers the persist path (SetPhraseStyle → SaveSettings) and the restore path (ApplySettings reads PhraseLocale + PhraseStyle → ResolveLocaleKey); D-06 removes bare "ja" key so no stale lookup can succeed |
</phase_requirements>

---

## Standard Stack

This phase uses no new libraries. The entire implementation is within the existing solution stack:

| Component | Version | Purpose |
|-----------|---------|---------|
| C# / .NET 8 | 8.0 | Language + runtime |
| WPF | .NET 8 built-in | UI framework (SettingsWindow controls) |
| MSTest v3 | existing in solution | Test framework for coordinator tests |
| FuzzyClock.Core | project ref | PhraseEngine static class, IPhraseProvider |
| FuzzyClock.App | project ref | MainWindow, SettingsWindow |
| FuzzyClock.Core.Tests | project ref | PhraseEngineCoordinatorTests |

**No new package installations required.**

---

## Architecture Patterns

### Current Code Structure (what the plan edits)

```
FuzzyClock.App/
├── MainWindow.xaml.cs
│   ├── ApplySettings (~line 332)    — routing site 1 (startup)
│   ├── SetPhraseStyle (~line 1370)  — routing site 2 (live style change)
│   └── SetLanguage (~line 1397)     — routing site 3 (live language change)
│       [ADD] ResolveLocaleKey(...)  — new private helper
FuzzyClock.App/
└── SettingsWindow.xaml.cs
    ├── PopulateControls (~line 103) — isNonEnglish check
    └── CmbPhraseLanguage_SelectionChanged (~line 437) — isNonEnglish check
FuzzyClock.Core/
└── PhraseEngine.cs                  — remove ["ja"] entry (~line 21)
FuzzyClock.Core.Tests/
└── PhraseEngineCoordinatorTests.cs  — add GetPhrase round-trip tests
```

### Pattern 1: ResolveLocaleKey Helper

**What:** Consolidates the three identical three-arm locale-switch ladders into one private method.

**When to use:** Called at every point where a `PhraseEngine.SetLocale(key)` call must be made from MainWindow.

**Current duplicated structure (identical in ApplySettings and SetLanguage):**
```csharp
// Arm 1: explicit non-English (fr/es/de/ja/pl)
if (_currentPhraseLocale is "fr" or "es" or "de" or "ja" or "pl")
    effectiveLocale = _currentPhraseLocale;
// Arm 2: explicit English
else if (_currentPhraseLocale == "en")
    effectiveLocale = _currentPhraseStyle.ToLowerInvariant() switch { ... };
// Arm 3: auto
else
    effectiveLocale = (uiLang is "fr" or "es" or "de" or "ja" or "pl")
        ? uiLang
        : _currentPhraseStyle.ToLowerInvariant() switch { ... };
```

**After extraction — ResolveLocaleKey signature:**
```csharp
private string ResolveLocaleKey(string phraseLocale, string phraseStyle, string uiLang)
```

**Key correctness requirement for the "auto" + Japanese arm (D-02 note):**
The current code returns bare `uiLang` (= `"ja"`) for auto-detect + Japanese system. After D-06 removes the `["ja"]` key from `_providers`, this would cause `SetLocale("ja")` to return `false` and silently leave the engine on its current locale. `ResolveLocaleKey` must map `phraseLocale == "auto"` + `uiLang == "ja"` to `"ja-" + phraseStyle` (same as explicit "ja" arm), NOT to bare `"ja"`. For fr/es/de/pl auto-detect, returning the bare uiLang remains correct because those keys still exist in `_providers`.

### Pattern 2: SetPhraseStyle guard widening (D-04, D-05)

**Current guard (blocks all non-en- locales):**
```csharp
if (!PhraseEngine.CurrentLocale.StartsWith("en-", StringComparison.Ordinal))
    return;
```

**Updated guard (allows ja- through):**
```csharp
if (!PhraseEngine.CurrentLocale.StartsWith("en-", StringComparison.Ordinal)
    && !PhraseEngine.CurrentLocale.StartsWith("ja-", StringComparison.Ordinal))
    return;
```

After the guard, both en- and ja- paths resolve through `ResolveLocaleKey`:
```csharp
string uiLang = System.Globalization.CultureInfo.CurrentUICulture.TwoLetterISOLanguageName;
string localeKey = PhraseEngine.CurrentLocale.StartsWith("ja-", StringComparison.Ordinal)
    ? ResolveLocaleKey("ja", style, uiLang)
    : ResolveLocaleKey("en", style, uiLang);
```

### Pattern 3: SettingsWindow isNonEnglish / isJapanese logic

**Current (PopulateControls line 103):**
```csharp
bool isNonEnglish = nonEnglishActive || (s.PhraseLocale is "fr" or "es" or "de" or "ja" or "pl");
CmbPhraseStyle.IsEnabled = !isNonEnglish;
```

`nonEnglishActive` is `uiLang is "fr" or "es" or "de" or "ja" or "pl"` — captures auto-detected Japanese.

**Updated (D-07 + D-08):**
```csharp
bool isJapaneseExplicit = s.PhraseLocale == "ja";
bool isOtherNonEnglish  = nonEnglishActive && !isJapaneseExplicit
                          || (s.PhraseLocale is "fr" or "es" or "de" or "pl");
CmbPhraseStyle.IsEnabled = isJapaneseExplicit || (!isOtherNonEnglish && !nonEnglishActive);
```

Simpler equivalent that directly matches D-07:
- Enable if `s.PhraseLocale == "ja"` (explicit Japanese only)
- Disable for everything else (fr/es/de/pl explicit, auto + any non-English system, auto + English, explicit English)

```csharp
bool isNonEnglishLocale = s.PhraseLocale is "fr" or "es" or "de" or "pl";
bool isJapanese = s.PhraseLocale == "ja";
CmbPhraseStyle.IsEnabled = isJapanese || (!isNonEnglishLocale && !nonEnglishActive && s.PhraseLocale != "ja");
```

The clearest expression matching D-07 literally:
```csharp
// Enable ONLY for explicit Japanese selection; disable for everything else including auto-detected Japanese
CmbPhraseStyle.IsEnabled = s.PhraseLocale == "ja";
// Exception: also disable if auto + non-English (but ja case already handled by line above)
if (s.PhraseLocale != "ja" && nonEnglishActive) CmbPhraseStyle.IsEnabled = false;
```

Actually the intent from D-07/D-08 is straightforward — the implementer may choose how to express it as long as the outcome is:
- `"ja"` explicit → enabled
- all other locales (including "auto" even if Windows is Japanese) → disabled

**Current (CmbPhraseLanguage_SelectionChanged line 437):**
```csharp
bool isNonEnglish = locale is "fr" or "es" or "de" or "ja" or "pl";
CmbPhraseStyle.IsEnabled = !isNonEnglish;
```

**Updated:**
```csharp
bool isNonEnglish = locale is "fr" or "es" or "de" or "pl";  // "ja" removed
CmbPhraseStyle.IsEnabled = !isNonEnglish && locale != "auto";  // or simply: locale == "en" || locale == "ja"
```

D-08 says: exclude "ja" from the disable set so `!isNonEnglish` evaluates `true` for "ja"; the combo becomes enabled when "ja" is selected. For "auto" and "en": "auto" must stay disabled (D-07); "en" must be enabled. Simplest expression: `CmbPhraseStyle.IsEnabled = locale is "en" or "ja"`.

### Pattern 4: PhraseEngine bare "ja" key removal (D-06)

**Current (_providers init in PhraseEngine.cs ~line 21):**
```csharp
["ja"]             = new JapanesePhraseProvider(),
["ja-classic"]     = new JapanesePhraseProvider(),
```

**After:**
```csharp
["ja-classic"]     = new JapanesePhraseProvider(),
```

One-line deletion. No other change to PhraseEngine.cs.

**IMPORTANT:** The existing `SetLocale_Ja_ReturnsTrue` test in `PhraseEngineCoordinatorTests.cs` calls `PhraseEngine.SetLocale("ja")` and asserts `IsTrue`. After D-06 removes the bare `"ja"` key, this test will FAIL. The plan must include updating this test — either deleting it or inverting the assertion to `IsFalse`.

### Pattern 5: Coordinator test additions (D-10)

**Existing tests that already cover the SetLocale bool + CurrentLocale assertions:**
- `SetLocale_JaClassic_ReturnsTrue` (line 95)
- `SetLocale_JaTerse_ReturnsTrue` (line 103)
- `SetLocale_JaPoetic_ReturnsTrue` (line 111)
- `SetLocale_JaRude_ReturnsTrue` (line 119)

These exist but do NOT call `GetPhrase`. D-10 requires each to also verify `GetPhrase` returns non-empty. The plan should either:
- (A) Add `GetPhrase` assertions to the existing four methods, or
- (B) Add four new test methods that call `GetPhrase` after `SetLocale`

Option A (modifying existing tests) is simpler and avoids duplication. Option B is appropriate if the project convention is to keep each test method single-responsibility. Either is valid (Claude's Discretion applies here).

**Test cleanup contract:** The `[TestCleanup] ResetLocale()` method calls `PhraseEngine.SetLocale("en-classic")`. This is unaffected by D-06 since `"en-classic"` remains in `_providers`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Locale-to-provider mapping | Custom dynamic resolver | Existing `_providers` dictionary — it is already the source of truth |
| Thread-safe static reset in tests | Custom locking | `[DoNotParallelize]` + `[TestCleanup]` pattern already established |
| Style combo items | XAML changes | Items (Classic/Terse/Poetic/Rude) already exist at line 311-314 in SettingsWindow.xaml — D-09 says unchanged |

---

## Common Pitfalls

### Pitfall 1: "auto" + Japanese maps to bare "ja" after key removal
**What goes wrong:** The current `SetLanguage` auto arm returns `uiLang` = `"ja"` for Japanese systems. After removing `["ja"]` from `_providers`, `PhraseEngine.SetLocale("ja")` returns `false` and the engine silently stays on its previous locale (en-classic at startup).
**Why it happens:** D-02 note explicitly calls this out; the "auto" + Japanese arm must produce `"ja-" + phraseStyle`, not bare `"ja"`.
**How to avoid:** In `ResolveLocaleKey`, the `phraseLocale == "auto"` arm must check: `if (uiLang == "ja") return ResolveLocaleKey("ja", phraseStyle, uiLang)` (recursive single-level) — or inline the `"ja-" + style` logic.
**Warning signs:** After removing `["ja"]`, running the app with Windows UI set to Japanese stays on "en-classic" phrases.

### Pitfall 2: Existing `SetLocale_Ja_ReturnsTrue` test breaks after D-06
**What goes wrong:** `PhraseEngineCoordinatorTests.SetLocale_Ja_ReturnsTrue` at line 77 asserts `PhraseEngine.SetLocale("ja")` returns `true`. After removing `["ja"]` from `_providers`, it returns `false` and the test fails.
**Why it happens:** The test was written when `"ja"` was a valid key; D-06 invalidates that key.
**How to avoid:** The plan must include a task to update or remove `SetLocale_Ja_ReturnsTrue` when the `["ja"]` removal task is executed. The safest change is to rename the method to `SetLocale_JaBare_ReturnsFalse_AfterKeyRemoval` and invert the assertion, documenting why.
**Warning signs:** CI red on `PhraseEngineCoordinatorTests` after the PhraseEngine.cs edit.

### Pitfall 3: SetPhraseStyle guard too narrow / too wide
**What goes wrong:** If the guard is changed to `!StartsWith("en-") && !StartsWith("ja-")` but the method body still only has the English switch ladder, Japanese style changes would call `ResolveLocaleKey("en", style, uiLang)` instead of `ResolveLocaleKey("ja", style, uiLang)`.
**Why it happens:** The guard widening (D-04) and the body update (D-05) are logically coupled but appear as separate code changes.
**How to avoid:** The task covering SetPhraseStyle must update BOTH the guard condition and the locale-key computation body atomically.

### Pitfall 4: SettingsWindow enables combo for auto-detected Japanese
**What goes wrong:** If `nonEnglishActive` (auto-detect check) is not consulted when `s.PhraseLocale == "auto"`, a Japanese-system user sees the style combo enabled in Settings when they haven't explicitly selected Japanese.
**Why it happens:** D-07 is explicit that only `s.PhraseLocale == "ja"` enables the combo; auto-detect does not.
**How to avoid:** The updated `PopulateControls` logic must remain: `CmbPhraseStyle.IsEnabled = (s.PhraseLocale == "ja")` — explicitly ignoring `nonEnglishActive` for this decision. The `nonEnglishActive` variable can be removed from the `IsEnabled` computation entirely since the positive condition is now purely `s.PhraseLocale == "ja"`.

### Pitfall 5: ApplySettings uses `_currentPhraseLocale` vs `s.PhraseLocale`
**What goes wrong:** ApplySettings reads from `s` (the `SettingsSnapshot` param) and stores to fields first. The routing block references `_currentPhraseLocale` (which was just assigned from `s.PhraseLocale` at line 327). The `ResolveLocaleKey` call must pass `_currentPhraseLocale` (or `s.PhraseLocale` — they are equivalent at that point). Using the wrong variable name is a compile error, not a logic error, but note that SetLanguage uses its own `locale` param directly, not `_currentPhraseLocale`.
**How to avoid:** Planner should specify which variable to pass for each routing site call.

---

## Code Examples

### ResolveLocaleKey — reference implementation
```csharp
// Source: derived from current SetLanguage switch ladder in MainWindow.xaml.cs ~line 1402
private string ResolveLocaleKey(string phraseLocale, string phraseStyle, string uiLang)
{
    string styleLower = phraseStyle.ToLowerInvariant();

    if (phraseLocale is "fr" or "es" or "de" or "pl")
        return phraseLocale;

    if (phraseLocale == "ja")
        return styleLower switch
        {
            "terse"  => "ja-terse",
            "poetic" => "ja-poetic",
            "rude"   => "ja-rude",
            _        => "ja-classic",
        };

    if (phraseLocale == "en")
        return styleLower switch
        {
            "terse"       => "en-terse",
            "poetic"      => "en-poetic",
            "rude"        => "en-rude",
            "pirate"      => "en-pirate",
            "dwarf"       => "en-dwarf",
            "jive"        => "en-jive",
            "valleygirl"  => "en-valleygirl",
            "yoda"        => "en-yoda",
            "shakespeare" => "en-shakespeare",
            _             => "en-classic",
        };

    // "auto"
    if (uiLang is "fr" or "es" or "de" or "pl")
        return uiLang;
    if (uiLang == "ja")
        return styleLower switch        // same ja ladder — bare "ja" key is removed
        {
            "terse"  => "ja-terse",
            "poetic" => "ja-poetic",
            "rude"   => "ja-rude",
            _        => "ja-classic",
        };
    // auto + English system
    return styleLower switch
    {
        "terse"       => "en-terse",
        "poetic"      => "en-poetic",
        "rude"        => "en-rude",
        "pirate"      => "en-pirate",
        "dwarf"       => "en-dwarf",
        "jive"        => "en-jive",
        "valleygirl"  => "en-valleygirl",
        "yoda"        => "en-yoda",
        "shakespeare" => "en-shakespeare",
        _             => "en-classic",
    };
}
```

### Coordinator test — GetPhrase round-trip for ja-terse
```csharp
// Source: mirror of GetPhrase_DelegatesCorrectly_AfterSetLocaleRoundTrip in PhraseEngineCoordinatorTests.cs ~line 127
[TestMethod]
public void GetPhrase_JaTerse_ReturnsNonEmpty()
{
    PhraseEngine.SetLocale("ja-terse");

    string phrase = PhraseEngine.GetPhrase(new DateTime(2024, 1, 15, 3, 30, 0));

    Assert.IsFalse(string.IsNullOrWhiteSpace(phrase));
}
```
(Repeat for `ja-poetic`, `ja-rude`, `ja-classic`.)

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Three duplicated switch ladders in MainWindow | Single `ResolveLocaleKey` helper | All three routing sites share one tested path |
| Bare `"ja"` key in `_providers` aliasing `JapanesePhraseProvider` | Key removed; only `"ja-classic"` maps to that provider | Eliminates ambiguous routing; forces all callers through style resolution |
| SetPhraseStyle blocks all non-en- locales | SetPhraseStyle passes ja- through to `ResolveLocaleKey` | Japanese style switching works live |
| Style combo disabled for any non-English locale including explicit "ja" | Combo enabled only when `PhraseLocale == "ja"` (explicit) | Users can switch Terse/Poetic/Rude when in Japanese mode |

---

## Open Questions

1. **CmbPhraseStyle items for Pirate/Dwarf/Jive/Valleygirl/Yoda/Shakespeare**
   - What we know: The XAML at SettingsWindow.xaml line 311 shows only Classic/Terse/Poetic/Rude items.
   - What's unclear: The style combo currently has only those four items visible; English-specific styles are not listed. This is pre-existing and out of scope for phase 62 (D-09 says items unchanged).
   - Recommendation: No action required.

2. **`SetLocale_Ja_ReturnsTrue` test — delete or invert**
   - What we know: The test at line 77 will fail after D-06 removes the `["ja"]` key.
   - What's unclear: Project convention for obsoleted tests (delete vs. rename+invert).
   - Recommendation: Rename to `SetLocale_JaBare_ReturnsFalse` and invert assertion to `IsFalse` — preserves the test as a contract that bare "ja" is intentionally unsupported post-phase-62.

---

## Environment Availability

Step 2.6: SKIPPED — this phase is purely code/config changes to existing C# source files. No external tools, services, CLIs, or databases beyond the existing .NET SDK and MSTest infrastructure required.

---

## Sources

### Primary (HIGH confidence)
- Direct source file reads: `FuzzyClock.App/MainWindow.xaml.cs`, `FuzzyClock.App/SettingsWindow.xaml.cs`, `FuzzyClock.App/SettingsWindow.xaml`, `FuzzyClock.Core/PhraseEngine.cs`, `FuzzyClock.Core.Tests/PhraseEngineCoordinatorTests.cs` — exact line numbers and code verified
- `.planning/phases/62-routing-consolidation/62-CONTEXT.md` — all decisions (D-01 through D-10) locked
- `.planning/REQUIREMENTS.md` — JA-04, JA-05 requirements confirmed

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` — project invariants and milestone context

---

## Metadata

**Confidence breakdown:**
- Locked decisions: HIGH — all decisions read directly from CONTEXT.md, no interpretation required
- Current code state: HIGH — exact line numbers and code verified by direct file reads
- ResolveLocaleKey reference impl: HIGH — derived mechanically from existing switch ladders in the source
- Test gap (SetLocale_Ja_ReturnsTrue): HIGH — verified by reading PhraseEngineCoordinatorTests.cs; this is a concrete blocking issue the plan must address

**Research date:** 2026-03-24
**Valid until:** Indefinite — this is a single-milestone refactor with all decisions locked; no external dependency drift possible
