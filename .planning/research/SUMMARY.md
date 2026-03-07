# Project Research Summary

**Project:** FuzzyClock v3.2 — Settings Window, Themes, Battery Alert, Phrase Styles, Multilingual
**Domain:** WPF desktop overlay widget — feature expansion on mature codebase
**Researched:** 2026-03-08
**Confidence:** HIGH

## Executive Summary

FuzzyClock v3.2 is a feature expansion on a mature, tested WPF overlay widget (.NET 10, 122 tests, ~1300-line MainWindow). The milestone adds five distinct capabilities: a tabbed settings window to replace the unwieldy 40-item tray menu, five named visual themes, a battery low alert, English phrase style personalities (Terse/Poetic/Rude), and native phrase sets for French, Spanish, German, and Japanese. All additions use only built-in BCL and WPF types — zero new NuGet packages are required. The single csproj change is adding `<NeutralLanguage>en</NeutralLanguage>` to `FuzzyClock.Core.csproj` to enable satellite assembly generation for localization.

The recommended approach is to build features in strict dependency order: PhraseEngine refactor first (highest-risk Core change, isolated early), then Settings Window infrastructure, then Themes (extends `ApplyTheme()` which must be stable), then Battery Alert (also modifies `ApplyTheme()`), then Multilingual phrases (pure additive once provider interface exists). Every feature routes settings changes through the existing `MainWindow.Set*()`/`ApplySettings()` pattern — the Settings Window must never write to `AppSettings` or `SettingsService` directly, and must use `Show()` (modeless) not `ShowDialog()`.

The dominant risks are cross-cutting: (1) the battery alert color must be guarded in both `ApplyTheme()` and `ApplyDisplayColor()` or auto-contrast will override it every 500ms; (2) every new `AppSettings` field requires a three-part atomic update (field declaration + `Defaults()` entry + `Validate()` guard + `SaveSettings() with {}` expression) or settings silently revert on every drag; (3) the multilingual `GetStructuredPhrase()` must stay consistent with `GetPhrase()` per style and language, and all four non-English languages need exhaustive 1440-minute test coverage before being considered done.

## Key Findings

### Recommended Stack

The existing stack handles all v3.2 requirements without additions. WPF's built-in `TabControl`/`TabItem` (already available via `UseWPF=true`) is the correct choice for the settings window — no third-party UI toolkit. For localization, `System.Resources.ResourceManager` (BCL inbox) with `.resx` files per locale is the right tool for a no-DI WPF app; `IStringLocalizer` requires `Microsoft.Extensions.Hosting` which this project deliberately avoids. Phrase style personalities are implemented as parallel static bucket arrays in `FuzzyClock.Core` — no runtime file I/O, no resource loading.

**Core technologies:**
- `.NET 10 WPF` (`net10.0-windows`): unchanged; `TabControl` is built in via `UseWPF=true`
- `System.Resources.ResourceManager` (BCL inbox): `.resx` locale lookup for multilingual phrases — no NuGet needed
- `CultureInfo.CurrentUICulture` (BCL inbox): Windows display language detection — NOT `CurrentCulture` (that controls formatting, not UI language)
- `MSTest 4.0.1`: existing test framework; new tests follow established `[DataRow]` patterns unchanged
- One csproj change only: `<NeutralLanguage>en</NeutralLanguage>` in `FuzzyClock.Core.csproj`

### Expected Features

**Must have (table stakes):**
- Settings window (3 tabs: Appearance / Stats / Behavior) — tray menu has 40+ items; discoverability is broken for existing users
- Battery low alert (red row when `<20%` and unplugged) — universal OS pattern; every battery indicator does this
- Named themes (5 presets) — every mature desktop customization tool offers named presets; one-click look change

**Should have (differentiators):**
- Phrase style personalities (Terse / Poetic / Rude) — unique differentiator; no other fuzzy clock offers vocabulary personalities
- French, Spanish, German phrase sets — native cultural phrasing, not word-for-word translation; German "halb" convention is distinctively charming
- Japanese phrase set — distinctly different structure (Arabic numerals + 時); medium complexity

**Defer (v3.x+):**
- Live theme preview in settings window — two-window coupling complexity; apply on OK is acceptable
- Theme editor / custom named themes — requires separate storage and rename UI; scope bloat
- Additional languages (Italian, Portuguese, Dutch) — validate demand first
- Per-locale date format defaults — too many combinations to spec now

### Architecture Approach

The architecture follows the established single-owner pattern: `MainWindow` is the authoritative owner of all live state; all settings changes route through it. The Settings Window is a modeless owner-child WPF Window that fires `event Action<AppSettings> SettingsChanged` — MainWindow subscribes and calls `ApplySettings()` + `SaveSettings()`. The PhraseEngine gains an `IPhraseProvider` interface with `EnglishPhraseProvider` as the default; `PhraseEngine.SetLocale(string)` swaps providers at runtime. No ThemeService class is needed — themes are applied via a new `ApplyNamedTheme()` batch method on MainWindow that mutates all private fields then calls `ApplyTheme()` + `UpdateLayout()` + `SaveSettings()` exactly once.

**Major components:**
1. `SettingsWindow` (new in App) — modeless WPF Window; `Owner=MainWindow`; exposes `SettingsChanged` event; never calls `SettingsService.Save()` directly
2. `IPhraseProvider` + `*PhraseProvider` classes (new in Core) — per-language bucket tables as static readonly arrays; no runtime I/O; `PhraseEngine` becomes a static dispatcher
3. `ThemeDefinition` / `BuiltInThemes` (new in App) — static registry of 5 preset bundles applied via batch `ApplyNamedTheme()`
4. `AppSettings` extensions — four new init-property fields: `PhraseLocale`, `Theme`, `BatteryAlertPercent`, `BatteryAlertEnabled`
5. `MainWindow` modifications — `_batteryAlertActive` flag; battery row guard in both `ApplyTheme()` and `ApplyDisplayColor()`; `_settingsWindow` field with null/not-visible single-instance guard

### Critical Pitfalls

1. **Settings Window writes AppSettings directly** — widget live state and JSON diverge permanently. Route ALL changes through `MainWindow.Set*()` callbacks (extend `TrayMenuCallbacks` pattern). Architectural constraint, not optional.

2. **Battery alert overridden by auto-contrast** — `ApplyDisplayColor()` fires every 500ms and resets battery row to black/white, erasing the red alert. Guard the battery row in BOTH `ApplyTheme()` and `ApplyDisplayColor()` with `_batteryAlertActive` bool. Must be done at implementation time, not as a followup.

3. **New AppSettings fields missing from SaveSettings() or Validate()** — setting silently reverts to default on every drag (which calls `SaveSettings()`). Three-part atomic commit: field in record + `Defaults()` entry + `Validate()` guard + row in `SaveSettings() with {}`. Verified by round-trip test for each field.

4. **Missing multilingual bucket coverage** — any minute not covered by a bucket causes `InvalidOperationException` at runtime within minutes of switching language. Every language needs all 12 buckets exhaustively covered and a 1440-minute completeness test.

5. **GetStructuredPhrase() inconsistency after PhraseEngine refactor** — split layout shows Classic qualifier text while phrase text shows Terse/Poetic/Rude form. `GetPhrase()` and `GetStructuredPhrase()` must accept identical parameters and produce consistent output; update both atomically per style.

## Implications for Roadmap

Based on the combined research, the recommended build order is strictly determined by code dependencies. All four research files independently converge on the same sequencing.

### Phase 1: PhraseEngine Provider Refactor

**Rationale:** The highest-risk change in the milestone. Touches `FuzzyClock.Core` with 51 existing unit tests. Isolating it first means any test regression is immediately attributable; no behavioral changes to MainWindow yet. All subsequent phrase features (styles + multilingual) depend on `IPhraseProvider` existing.
**Delivers:** `IPhraseProvider` interface; `EnglishPhraseProvider` with existing Classic bucket table moved verbatim; `PhraseEngine` becomes static dispatcher with `SetLocale()`; all 122 existing tests pass unchanged.
**Addresses:** Infrastructure for phrase style and multilingual features
**Avoids:** Pitfall 13 (GetStructuredPhrase inconsistency — interface contract established before styles are added); Pitfall 14 (test coverage gaps — baseline verified before new code paths added)

### Phase 2: Settings Window Infrastructure

**Rationale:** Establishes the Owner/event/callback pattern before any feature needs it as a UI surface. Starting as a minimal shell (3 tabs, populated from AppSettings snapshot, fires SettingsChanged) proves the architecture before building controls. Must be non-modal (`Show()` not `ShowDialog()`).
**Delivers:** `SettingsWindow.xaml/.cs`; "Open Settings..." tray item; `_settingsWindow` field on MainWindow with single-instance guard; `Owner = this` before `Show()`; `SettingsChanged` event wired to `ApplySettings()` + `SaveSettings()`.
**Addresses:** Settings window (table-stakes feature; tray menu discoverability)
**Avoids:** Pitfall 1 (direct AppSettings writes), Pitfall 2 (stale state on open — populate from live state on every open), Pitfall 3 (Z-order — Owner set before Show), Pitfall 10 (tray/settings divergence — document populate-on-open strategy)

### Phase 3: Named Themes

**Rationale:** Extends `ApplyTheme()` — must be stable before battery alert adds another branch to the same method. Settings Window is the UI surface for the theme picker. The batch-apply pattern (`ApplyNamedTheme()`) must be established here before battery alert is added to the same methods.
**Delivers:** `ThemeDefinition` record; `BuiltInThemes` static registry (5 presets: Night Owl, Desert, Tundra, Hacker, Pastel); `ApplyNamedTheme()` batch method on MainWindow; Theme section in Appearance tab; `AppSettings.Theme` field with `Validate()` guard and round-trip test.
**Addresses:** Named themes (table-stakes feature)
**Avoids:** Pitfall 5 (partial element coverage — run amber/ice-blue visual test after every UI addition); Pitfall 6 (non-atomic theme apply — batch method required from the start, not sequential Set* calls)

### Phase 4: Battery Low Alert

**Rationale:** Modifies the same `ApplyTheme()` and `ApplyDisplayColor()` methods as the theme phase. Sequential changes to these methods are cleaner than parallel. Battery alert logic is simple but must interact correctly with auto-contrast from day one.
**Delivers:** `_batteryAlertActive` bool; `BatteryAlertEnabled`/`BatteryAlertPercent` AppSettings fields; red override (`#FFFF4444`) in `UpdateStatsDisplay()`, `ApplyTheme()`, `ApplyDisplayColor()`; battery alert section in Stats tab; round-trip tests for both new fields.
**Addresses:** Battery low alert (table-stakes feature)
**Avoids:** Pitfall 11 (auto-contrast conflict — `_batteryAlertActive` guard added at implementation time in both color methods); Pitfall 4 (missing Validate guard); Pitfall 12 (missing SaveSettings field)

### Phase 5: English Phrase Style Personalities

**Rationale:** English-only, depends only on Phase 1 (IPhraseProvider). Does not modify `ApplyTheme()` or UI layout — low interference with surrounding work. Lower risk than multilingual; validates the IPhraseProvider signature before non-English providers add grammatical complexity.
**Delivers:** `PhraseStyle` enum (Classic/Terse/Poetic/Rude); three new bucket tables in `EnglishPhraseProvider`; `GetPhrase(dt, style)` and `GetStructuredPhrase(dt, style)` consistent overloads; Phrase Style selector in Behavior tab (disabled for non-English); `AppSettings.PhraseStyle` field; per-style bucket tests + consistency invariant test.
**Addresses:** Phrase style personalities (signature differentiator)
**Avoids:** Pitfall 13 (both methods updated atomically); Pitfall 14 (each style gets its own test class with per-bucket DataRow coverage)

### Phase 6: Multilingual Phrases (fr / es / de / ja)

**Rationale:** Purely additive to the IPhraseProvider interface from Phase 1. No existing code paths are affected until `SetLocale()` is called. Each language provider is a self-contained class. German token inversion ("halb {h1}" = :30) and Japanese GetStructuredPhrase fallback are pre-resolved by research.
**Delivers:** `FrenchPhraseProvider`, `SpanishPhraseProvider`, `GermanPhraseProvider`, `JapanesePhraseProvider`; `CultureInfo.CurrentUICulture`-based auto-detection; `AppSettings.PhraseLocale` field; Phrase Language ComboBox in Behavior tab; exhaustive 1440-minute tests per language; `<NeutralLanguage>en</NeutralLanguage>` csproj addition.
**Addresses:** Multilingual phrase sets (differentiator)
**Avoids:** Pitfall 7 (must use `CurrentUICulture`, not `CurrentCulture`); Pitfall 8 (all 12 buckets covered, exhaustive test required per language); Pitfall 9 (Japanese GetStructuredPhrase returns `("", fullPhrase)` for all non-English; split layout documented as English-Classic only)

### Phase Ordering Rationale

- **Phase 1 first** — only change to `FuzzyClock.Core` and its 51-test suite. Regression isolation is the priority; if anything breaks here it is immediately visible with no MainWindow noise.
- **Phase 2 before Phases 3–6** — Settings Window is the UI surface for all subsequent features. Building infrastructure before features avoids rebuilding controls later.
- **Phase 3 before Phase 4** — both modify `ApplyTheme()` and `ApplyDisplayColor()`; sequential edits to these methods are cleaner than parallel; `ApplyNamedTheme()` established in Phase 3 must not be broken by Phase 4.
- **Phase 5 before Phase 6** — phrase styles are lower risk (English-only, well-understood pattern) and validate the IPhraseProvider signature before non-English providers introduce grammatical complexity.
- **Phase 6 last** — purely additive, highest content volume (4 languages × 12 buckets each), and no other features depend on it.

### Research Flags

Phases with well-documented patterns (standard — skip `/gsd:research-phase`):
- **Phase 1** — IPhraseProvider pattern is standard C# strategy; existing code structure fully understood from source inspection
- **Phase 2** — WPF Window Owner/event pattern is official-docs-documented; TrayMenuCallbacks is the existing model
- **Phase 3** — theme-as-named-preset is well-understood; no external dependencies; all setter paths already exist
- **Phase 4** — battery alert is a conditional color branch; StatsService already reads the data; guard pattern is directly specified

Phases that may benefit from targeted attention during planning:
- **Phase 5** — Terse/Poetic/Rude phrase content is fully specified in FEATURES.md; no research needed for architecture; bucket table content should be reviewed for consistency before committing
- **Phase 6** — German "halb {h1}" token inversion (halb drei = 2:30, uses next-hour token) is a known gotcha fully documented in FEATURES.md; Japanese GetStructuredPhrase decision is pre-made (full-phrase fallback); a native-speaker review of Japanese phrase naturalness is recommended before the phase is marked done

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zero new packages; all additions use built-in WPF and BCL types; confirmed against official .NET 10 docs |
| Features | HIGH | English phrase content (all styles + fr/es/de) is HIGH; Japanese phrasing naturalness is MEDIUM (see Gaps) |
| Architecture | HIGH | Derived from direct source reading of current codebase; all patterns already validated in prior milestones |
| Pitfalls | HIGH | All 14 pitfalls grounded in direct code inspection and documented prior regressions (e.g., ApplyTheme/ApplyDisplayColor parity already burned in v2.7) |

**Overall confidence:** HIGH

### Gaps to Address

- **Japanese phrase naturalness (MEDIUM confidence):** The Japanese bucket templates use standard casual written Japanese with Arabic numerals + 時. Technically correct and conservative, but naturalness of specific phrasings has not been reviewed by a native speaker. Recommend a native-speaker review of the 12 bucket phrases before Phase 6 is marked done. The architecture decision (full-phrase fallback for GetStructuredPhrase for all non-English) is not in question.

- **Battery alert threshold configurability:** ARCHITECTURE.md specifies `BatteryAlertPercent` as a user-configurable AppSettings field (default 20). FEATURES.md specifies 20% as always-on with no user toggle needed. Resolve in Phase 4 planning: the simpler approach (hardcoded 20%, no toggle, always enabled when battery row is visible) is defensible for v3.2. Adding a configurable threshold adds Settings Window controls that may not be worth the scope.

- **Settings Window tray/window sync strategy:** Three defensible approaches exist for handling state divergence when the user changes settings via tray while the settings window is open: (a) live sync via MainWindow notification, (b) auto-close settings on any tray change, (c) populate-on-open only with documented "values at time of open" behavior. The research recommends (c) as the simplest approach for v3.2. The Phase 2 plan should explicitly commit to one strategy to avoid mid-implementation debates.

## Sources

### Primary (HIGH confidence)
- `FuzzyClock.App/MainWindow.xaml.cs` — direct source inspection; all fields, ApplyTheme, ApplyDisplayColor, UpdateStatsDisplay, SaveSettings, TrayMenuCallbacks wiring, ContentRendered
- `FuzzyClock.App/AppSettings.cs`, `SettingsService.cs`, `TrayMenuBuilder.cs` — direct source inspection
- `FuzzyClock.Core/PhraseEngine.cs` — direct source inspection; Buckets, HourWords, GetPhrase, GetStructuredPhrase
- `PhraseEngineTests.cs`, `AppSettingsTests.cs`, `SettingsServiceTests.cs` — direct source inspection
- `.planning/PROJECT.md` — architecture decisions log
- https://learn.microsoft.com/en-us/dotnet/desktop/wpf/windows/how-to-open-window-dialog-box — WPF Window Show vs ShowDialog (official, 2024-10-24)
- https://learn.microsoft.com/en-us/dotnet/core/extensions/localization — .NET localization, ResourceManager vs IStringLocalizer (official, updated 2026-02-04)
- https://learn.microsoft.com/en-us/dotnet/fundamentals/runtime-libraries/system-globalization-cultureinfo — CurrentUICulture vs CurrentCulture (official, updated 2026-02-12)
- https://learn.microsoft.com/en-us/dotnet/desktop/wpf/advanced/wpf-globalization-and-localization-overview — LocBaml .NET Framework only warning confirmed (official)

### Secondary (MEDIUM confidence)
- Japanese temporal phrase naturalness — standard casual written Japanese; Arabic numeral + 時 approach is widely understood; naturalness of specific phrasings not independently verified by native speaker

---
*Research completed: 2026-03-08*
*Ready for roadmap: yes*
