# Phase 62: Routing Consolidation - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Extract a `ResolveLocaleKey(string phraseLocale, string phraseStyle, string uiLang)` private helper in MainWindow that consolidates the three identical locale-routing switch blocks. Update all three routing sites (ApplySettings, SetLanguage, SetPhraseStyle) to use it. Enable the Phrase Style combo in SettingsWindow when the user has explicitly selected Japanese. Add coordinator tests for ja-* locale round-trips.

This phase is MainWindow.xaml.cs + SettingsWindow.xaml.cs + PhraseEngine.cs (key removal) + coordinator tests only. No new providers, no new UI controls.

</domain>

<decisions>
## Implementation Decisions

### ResolveLocaleKey helper
- **D-01:** Private method in MainWindow: `private string ResolveLocaleKey(string phraseLocale, string phraseStyle, string uiLang)`.
- **D-02:** Logic:
  - `phraseLocale is "fr" or "es" or "de" or "pl"` → return phraseLocale directly (style ignored)
  - `phraseLocale == "ja"` → return `"ja-" + phraseStyle.ToLowerInvariant()`, fallback to `"ja-classic"` for unrecognized style
  - `phraseLocale == "en"` → return `"en-" + phraseStyle.ToLowerInvariant()` switch (same ladder as today), fallback to `"en-classic"`
  - `phraseLocale == "auto"` and `uiLang is "fr" or "es" or "de" or "ja" or "pl"` → return uiLang (bare language code; no style routing for auto-detected non-English)
  - `phraseLocale == "auto"` otherwise → compute `"en-" + phraseStyle` same as explicit "en"
- **D-03:** The three routing sites in ApplySettings, SetLanguage, and SetPhraseStyle all call this helper; their duplicated switch blocks are removed.

### SetPhraseStyle behavior
- **D-04:** SetPhraseStyle keeps its early-return guard for non-English/non-Japanese locales: if `CurrentLocale` does not start with `"en-"` and does not start with `"ja-"`, return early (no-op for fr/es/de/pl).
- **D-05:** For Japanese active locale (`CurrentLocale.StartsWith("ja-")`), SetPhraseStyle calls `ResolveLocaleKey("ja", style, uiLang)` to compute the new key, then calls `PhraseEngine.SetLocale`.

### PhraseEngine "ja" bare key
- **D-06:** Remove the bare `"ja"` key from PhraseEngine's `_providers` dictionary. All Japanese routing now uses `"ja-classic"`, `"ja-terse"`, `"ja-poetic"`, `"ja-rude"` exclusively. The `"ja"` key is never referenced by any routing site after this phase.

### SettingsWindow phrase style combo
- **D-07:** Enable `CmbPhraseStyle` only when the user has **explicitly selected Japanese** (`s.PhraseLocale == "ja"`). Auto-detected Japanese (locale = "auto" + Windows UI = "ja") does NOT enable the combo.
- **D-08:** Two places require this update:
  - `PopulateControls`: change `isNonEnglish` check — enable when `s.PhraseLocale == "ja"`, disable for "fr"/"es"/"de"/"pl" and for "auto"/"en"
  - `CmbPhraseLanguage_SelectionChanged`: update `isNonEnglish` to exclude "ja" from the disable set (i.e., `locale is "fr" or "es" or "de" or "pl"`)
- **D-09:** The combo items (Classic/Terse/Poetic/Rude) and the `PhraseStyleChanged` event payload remain unchanged — the same style strings ("Classic", "Terse", "Poetic", "Rude") work for both English and Japanese routing.

### Coordinator tests
- **D-10:** Add ja-* round-trip tests in the existing `[DoNotParallelize]` `PhraseEngineCoordinatorTests` class. Test cases: SetLocale("ja-terse"), SetLocale("ja-poetic"), SetLocale("ja-rude"), SetLocale("ja-classic") — each verifies CurrentLocale and that GetPhrase returns non-empty.

### Claude's Discretion
- Exact XAML `Tag` values on the Language combo items (already set; confirm they match the `phraseLocale` strings used in routing)
- Variable names for the updated `isNonEnglish`/`isJapanese` logic in SettingsWindow
- Whether to inline the `"ja-" + style` expression or use a nested switch for Japanese style mapping

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Routing sites (all three must be updated)
- `FuzzyClock.App/MainWindow.xaml.cs` §ApplySettings (~line 326–374) — startup locale resolution block
- `FuzzyClock.App/MainWindow.xaml.cs` §SetPhraseStyle (~line 1370) — live style change handler
- `FuzzyClock.App/MainWindow.xaml.cs` §SetLanguage (~line 1397) — live language change handler

### SettingsWindow
- `FuzzyClock.App/SettingsWindow.xaml.cs` §PopulateControls (~line 102–111) — isNonEnglish check for CmbPhraseStyle.IsEnabled
- `FuzzyClock.App/SettingsWindow.xaml.cs` §CmbPhraseLanguage_SelectionChanged (~line 437) — isNonEnglish disable logic on language change

### PhraseEngine key removal
- `FuzzyClock.Core/PhraseEngine.cs` — remove bare "ja" key; all Japanese routing uses "ja-classic/terse/poetic/rude"

### Test file
- `FuzzyClock.Core.Tests/PhraseEngineCoordinatorTests.cs` — [DoNotParallelize] class; add ja-* round-trip tests here

### Requirements
- `.planning/REQUIREMENTS.md` §Japanese Phrase Styles — JA-04, JA-05

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Existing en-* switch block in SetLanguage: template for the ResolveLocaleKey helper body
- `_suppressEvents` guard + `PopulateControls` pattern: already handles the IsEnabled update path cleanly
- `[DoNotParallelize]` PhraseEngineCoordinatorTests class: existing test class to extend (no new file needed)

### Established Patterns
- SetPhraseStyle early-return guard: `if (!PhraseEngine.CurrentLocale.StartsWith("en-")) return;` — update to also allow "ja-*"
- SettingsWindow disable logic: `bool isNonEnglish = locale is "fr" or "es" or "de" or "ja" or "pl";` — remove "ja" from this set
- PhraseEngine registry: dictionary init block in PhraseEngine.cs constructor or static initializer — remove the `["ja"]` entry

### Integration Points
- MainWindow: replace 3 duplicate switch blocks with single `ResolveLocaleKey()` call each
- SettingsWindow: 2 locations for `isNonEnglish` update (PopulateControls + SelectionChanged handler)
- PhraseEngine: 1-line removal of "ja" key
- PhraseEngineCoordinatorTests: append 4 test methods to existing class

</code_context>

<specifics>
## Specific Ideas

- "auto" locale + Japanese system stays as bare "ja" lookup? No — D-02 specifies auto+Japanese returns the bare "ja" language code, which maps to... wait: PhraseEngine will no longer have a "ja" key (D-06). The "auto" path for a Japanese system must therefore also resolve through style. But D-07 says auto-detected Japanese does NOT enable the style combo in UI. The resolution: for "auto"+Japanese system, `ResolveLocaleKey` returns `"ja-" + phraseStyle` using whatever `_currentPhraseStyle` is (defaulting to "ja-classic"). This is invisible to the user but consistent.
- D-02 note: update the "auto" + Japanese arm in ResolveLocaleKey to use `"ja-" + phraseStyle` (same as explicit "ja"), not the bare "ja" code. This is required because the bare "ja" key is being removed (D-06).

</specifics>

<deferred>
## Deferred Ideas

- Enabling phrase style combo for auto-detected Japanese — deferred; user prefers explicit selection only (decision 1B)
- Style variants for fr/es/de/pl — future milestone
- Removing "auto" locale + non-English style routing inconsistency for fr/es/de/pl — out of scope for v3.9

</deferred>

---

*Phase: 62-routing-consolidation*
*Context gathered: 2026-03-24*
