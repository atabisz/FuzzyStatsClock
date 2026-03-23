# Research Summary: FuzzyStatsClock v3.9 — LCD Clock + Japanese Styles

**Synthesized:** 2026-03-24
**Sources:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md (all researched 2026-03-23)
**Overall Confidence:** HIGH for structure and wiring; LOW for Japanese Poetic/Rude phrase vocabulary

---

## Executive Summary

FuzzyStatsClock v3.9 adds two independent feature streams to a working WPF desktop widget: a
fourth clock face style (LCD 7-segment) and three Japanese phrase-style variants (Terse, Poetic,
Rude) that parallel the existing English styles. Both streams are unusually low-risk because the
majority of the required infrastructure was built speculatively in earlier milestones. The LCD
rendering stack (`SevenSegmentDigit`, `LcdClockView`, `LcdTimeFormatHelper`, `LcdSize`), all LCD
`AppSettings` and `SettingsSnapshot` fields, the `ClockType.Lcd` enum value, and all three
`LcdXxxChanged` events (declared and subscribed in `MainWindow.OpenSettings()`) are already
complete and verified by source audit. The net-new work is almost entirely UI wiring (surfacing
existing controls and events in `SettingsWindow`) and content authorship (three new
`IPhraseProvider` implementations).

The recommended build sequence is four steps in dependency order: Japanese provider classes first
(pure `FuzzyClock.Core`, no UI surface, fully testable in isolation), then `PhraseEngine` routing
consolidation via a `ResolveLocaleKey` private helper (eliminating three-way routing duplication
in `MainWindow`), then `SettingsWindow` LCD UI and Japanese style gating, and finally the blinking
colon toggle (a self-contained single-file change parallelizable with Step 3). No settings
migration is required: all `AppSettings` LCD fields and `PhraseStyle`/`PhraseLocale` fields
already exist and serialize correctly.

The primary failure mode is partial updates: three locations in `MainWindow` contain identical
locale-routing switches (`ApplySettings`, `SetLanguage`, `SetPhraseStyle`), and two locations in
`SettingsWindow` disable the style combo for Japanese. Missing any site in a single commit
produces silent runtime regressions — wrong provider on restart, or style combo disabled despite
providers existing. The `ResolveLocaleKey` extraction and atomic `SetClockStyleButtonStates`
updates prescribed by the architecture research directly mitigate both patterns. The only item
carrying genuine uncertainty is Japanese Poetic and Rude phrase vocabulary, which requires
native-speaker review before shipping.

---

## Key Findings

### From STACK.md

**Core technologies — all unchanged from v3.8:**

| Technology | Version | Purpose |
|------------|---------|---------|
| .NET 10 WPF / C# 13 | .NET 10 SDK | UI framework; all controls, XAML, DispatcherTimer |
| System.Text.Json | .NET 10 BCL | Settings serialization |
| MSTest | 4.0.1 (existing) | Test framework; 299 tests currently passing |

**Zero new NuGet packages. Zero csproj changes.**

**Already-complete infrastructure (do not re-implement):**

| Component | Location | State |
|-----------|----------|-------|
| `SevenSegmentDigit` UserControl | `Controls/SevenSegmentDigit.xaml.cs` | Complete — polygon segments, ghost brushes, `SegmentStyle` DP |
| `LcdClockView` UserControl | `Controls/LcdClockView.xaml.cs` | Complete — 1s DispatcherTimer, 8 digit slots, all color/size DPs |
| `SevenSegmentEncoder` | `FuzzyClock.Core/SevenSegmentEncoder.cs` | Complete — bitmask table for 0–9, space (0x00), colon (0x80) |
| `LcdTimeFormatHelper` | `LcdTimeFormatHelper.cs` | Complete — 12hr/24hr, leading-space for single-digit hours |
| `LcdSize` enum + `LcdSizeMap` | `LcdSize.cs` | Complete — Small=32px, Medium=48px, Large=64px |
| `ClockType.Lcd` enum value | `ClockType.cs` | Complete |
| `AppSettings` + `SettingsSnapshot` LCD fields | `AppSettings.cs`, `SettingsSnapshot.cs` | Complete — `LcdUse24Hr`, `LcdShowSeconds`, `LcdStyle`, `LcdSize` |
| `MainWindow` LCD wiring | `MainWindow.xaml.cs` | Complete — `SetClockType(Lcd)`, `ApplyLcdColors()`, event subscriptions |
| `SettingsWindow` LCD events | `SettingsWindow.xaml.cs` | Declared as stubs — no XAML controls fire them yet |
| `JapanesePhraseProvider` (Classic) | `FuzzyClock.Core/JapanesePhraseProvider.cs` | Complete — 12-bucket `{h}`/`{h1}` template system |
| `IPhraseProvider` interface | `FuzzyClock.Core/IPhraseProvider.cs` | Stable — no changes needed for new providers |

**Net-new types needed (no new packages):**

| Type | Assembly | Purpose |
|------|----------|---------|
| `JapaneseTersePhraseProvider` | `FuzzyClock.Core` | `"ja-terse"` registry entry |
| `JapanesePoeticPhraseProvider` | `FuzzyClock.Core` | `"ja-poetic"` registry entry |
| `JapaneseRudePhraseProvider` | `FuzzyClock.Core` | `"ja-rude"` registry entry |

Note: STACK.md proposes an `IsLit` DP on `SevenSegmentDigit` for colon blink; ARCHITECTURE.md
recommends the simpler `_colonVisible` toggle in `LcdClockView` instead (no `SevenSegmentDigit`
changes needed). The toggle approach is preferred.

---

### From FEATURES.md

**Table stakes — must ship:**

| Feature | Delivery | Requirements |
|---------|----------|-------------|
| `BtnLcd` in Settings Clock Style rail | New XAML button; fire `ClockTypeChanged(Lcd)` | LCD-01 |
| LCD settings panel | Visibility-gated; `ChkLcd24Hr`, `ChkLcdShowSeconds`, `CmbLcdStyle` | LCD-02, LCD-04 |
| Blinking colon | `_colonVisible` toggle in `LcdClockView.UpdateTime()` | LCD-03 |
| Persist LCD settings | `PopulateControls` reads `SettingsSnapshot` LCD fields | LCD-01 |
| Japanese Terse provider | `JapaneseTersePhraseProvider`, all 12 buckets + noon + midnight | JA-01 |
| Japanese Poetic provider | `JapanesePoeticPhraseProvider`, all 12 buckets + noon + midnight | JA-02 |
| Japanese Rude provider | `JapaneseRudePhraseProvider`, all 12 buckets + noon + midnight | JA-03 |
| Style selector enabled for Japanese | Remove `"ja"` from `isNonEnglish` disable set (two sites) | JA-01/02/03 |
| `PhraseEngine` routing for `ja-*` | `ResolveLocaleKey()` helper; update three routing sites | JA-01/02/03 |
| Unit tests for all three new providers | All 12 buckets + noon + midnight; isolation tests | JA-01/02/03 |

**Differentiators already built (verify, don't rebuild):**
- Ghost segments (unlit segments at 15% opacity) — already in `SevenSegmentDigit`
- Hexagonal chamfer on segment polygons — already in `SevenSegmentDigit.RebuildGeometry()`
- Classic vs Bold segment styles — already via `SegmentStyle` DP
- Dark style reuses accent color; Paper/Silver use fixed palettes — already in `ApplyLcdColors()`

**Explicit anti-features (do not build):**
- Blinking colon on `Colon2` (seconds separator) — `Colon1` only
- AM/PM label on LCD face
- Custom LCD color palette beyond Dark/Paper/Silver
- LCD digit crossfade animation
- Time-of-day period labels (朝/昼/夕/夜) in Japanese providers
- French/Spanish/German/Polish style variants
- Separate tray menu items for LCD sub-settings
- New `DispatcherTimer` for colon blink (use existing 1s tick)
- New Japanese provider base class (duplicate the 12-bucket pattern directly)

---

### From ARCHITECTURE.md

**Component boundaries:**

| Component | Layer | Responsibility | Communicates With |
|-----------|-------|----------------|-------------------|
| `FuzzyClock.Core` | Library | Phrase providers, `PhraseEngine`, `SevenSegmentEncoder` — zero WPF deps | No WPF references |
| `JapaneseXxxPhraseProvider` (×3) | Core | Style-specific 12-bucket phrase arrays | `PhraseEngine` registry |
| `PhraseEngine` | Core static | Route locale key to active `IPhraseProvider` | `MainWindow` routing sites |
| `LcdClockView` | App UserControl | Digit composition, own 1s timer, blinking colon | `MainWindow` sets DPs; `IsVisibleChanged` auto-manages timer |
| `SevenSegmentDigit` | App UserControl | WPF polygon geometry for one digit slot | `LcdClockView` |
| `AppSettings` / `SettingsSnapshot` | App records | Settings persistence and open-time snapshot | `SettingsService`, `MainWindow`, `SettingsWindow` |
| `SettingsWindow` | App window | Fires per-setting events; LCD panel visibility-gated | `MainWindow.OpenSettings()` handlers |
| `MainWindow` | App window | Runtime state source-of-truth; routes events to Core/XAML/services | All components |

**Key patterns:**
- `LcdClockView` self-manages its timer via `IsVisibleChanged` — `MainWindow` only sets DPs and visibility
- LCD panel visibility gating belongs in `SetClockStyleButtonStates()` alongside the Dial Face row gating
- `_suppressEvents` guard in `PopulateControls` prevents spurious events on window open
- `"ja"` base key preserved for auto-detect path; `"ja-classic"` alias added for symmetric routing
- `ResolveLocaleKey(locale, style)` private helper eliminates three-way routing duplication

**Recommended build order:**
1. Japanese provider classes (`FuzzyClock.Core` — no dependencies, fully testable in isolation)
2. `PhraseEngine` registry + `ResolveLocaleKey` extraction (update `ApplySettings`, `SetLanguage`, `SetPhraseStyle`)
3. `SettingsWindow` LCD UI + Japanese style gating (depends on Step 2 for routing stability)
4. `LcdClockView` blinking colon (self-contained, can parallel Step 3)

**Files to change:**

| File | Change Type |
|------|-------------|
| `FuzzyClock.Core/JapaneseTersePhraseProvider.cs` | New file |
| `FuzzyClock.Core/JapanesePoeticPhraseProvider.cs` | New file |
| `FuzzyClock.Core/JapaneseRudePhraseProvider.cs` | New file |
| `FuzzyClock.Core/PhraseEngine.cs` | Add `ja-classic/terse/poetic/rude` registry entries |
| `FuzzyClock.App/MainWindow.xaml.cs` | Add `ResolveLocaleKey()`; update three routing sites; expand `SetPhraseStyle()` guard |
| `FuzzyClock.App/SettingsWindow.xaml` | Add `BtnLcd`; add `LcdOptionsPanel` with checkboxes + combo |
| `FuzzyClock.App/SettingsWindow.xaml.cs` | Extend `SetClockStyleButtonStates`; `PopulateControls` LCD section; `BtnLcd_Click`; relax Japanese style gate |
| `FuzzyClock.App/Controls/LcdClockView.xaml.cs` | Add `_colonVisible` field; toggle in `UpdateTime()` |

**Not modified (already complete):**
`ClockType.cs`, `AppSettings.cs`, `SettingsSnapshot.cs`, `LcdSize.cs`, `LcdTimeFormatHelper.cs`,
`MainWindow.xaml`, `MainWindow.xaml.cs` (LCD branches), `JapanesePhraseProvider.cs`,
`SevenSegmentEncoder.cs`, `LcdClockView.xaml`

---

### From PITFALLS.md

**Critical pitfalls (silent regressions or blocking bugs):**

| # | Pitfall | Prevention |
|---|---------|------------|
| 1 | `BtnLcd` added to XAML but `SetClockStyleButtonStates` not updated — button never shows selected | Update `SetClockStyleButtonStates` in same commit as XAML addition |
| 2 | LCD options row not visibility-gated — controls visible in wrong clock mode | Extend `SetClockStyleButtonStates` with `LcdOptionsPanel.Visibility` alongside Dial Face row |
| 4 | Japanese providers registered under keys that don't match routing — `PhraseEngine.SetLocale` returns false silently | Define registry keys first; use exact string literals in routing switch |
| 5 | `SetLanguage("ja")` ignores `_currentPhraseStyle` — always routes to Classic | Add parallel `locale == "ja"` style-mapping block alongside `locale == "en"` block |
| 6 | `CmbPhraseStyle.IsEnabled` gate not relaxed for Japanese — style combo stays disabled | Remove `"ja"` from disable set in both `PopulateControls` and `CmbPhraseLanguage_SelectionChanged` |
| 7 | `ApplySettings` locale resolution not updated — Japanese Terse/Poetic/Rude not restored on restart | Update all three routing sites in one commit; use `ResolveLocaleKey` helper |

**Moderate pitfalls:**

| # | Pitfall | Prevention |
|---|---------|------------|
| 9 | LCD 1s timer fires during ghost mode — wasted redraws, potential SizeToContent side effects | Pass `Func<bool> shouldSkip` predicate from `MainWindow.ContentRendered` into `LcdClockView` |
| 10 | Separate 500ms blink timer added instead of using existing 1s tick | Implement as `_colonVisible` toggle inside `UpdateTime()` — no new timer |
| 11 | `STEST-01` may not assert LCD fields — silent settings-persistence regression | Audit round-trip test before LCD persistence work; add assertions if absent |
| 16 | Engine integration tests for `ja-*` not in `[DoNotParallelize]` class — locale contamination | Provider isolation tests in any class; `PhraseEngine.SetLocale` tests only in `PhraseEngineCoordinatorTests` |

---

## Implications for Roadmap

### Suggested Phase Structure

**Phase A: Japanese Providers (Core only)**

Rationale: Zero UI dependencies. Provider classes can be written, reviewed, and unit-tested
completely before any wiring work. Establishes the exact registry keys that all subsequent routing
logic references — defining keys here prevents key-mismatch regressions in later phases.

- Delivers: `JapaneseTersePhraseProvider`, `JapanesePoeticPhraseProvider`,
  `JapaneseRudePhraseProvider`; unit tests (all 12 buckets + noon + midnight per provider);
  `PhraseEngine` registry additions (`ja-classic`, `ja-terse`, `ja-poetic`, `ja-rude`)
- Features: JA-01, JA-02, JA-03 (provider layer)
- Pitfalls: #4 (key mismatch), #16 (test parallelization)
- Research flag: None needed — `JapanesePhraseProvider` is the complete implementation model

**Phase B: Routing Consolidation**

Rationale: All three routing sites in `MainWindow` must be updated atomically. Extracting
`ResolveLocaleKey()` makes the three-site requirement impossible to accidentally miss. This phase
must complete before `SettingsWindow` exposes Japanese style selection, or a style change fires
correctly but restart restores the wrong provider.

- Delivers: `ResolveLocaleKey` private helper; updated `ApplySettings()`, `SetLanguage()`,
  `SetPhraseStyle()`; coordinator tests for `ja-*` locale round-trips
- Features: JA-01, JA-02, JA-03 (routing layer)
- Pitfalls: #5, #7 (routing gaps)
- Research flag: None needed — three affected sites are precisely identified with exact code changes

**Phase C: SettingsWindow LCD UI + Japanese Style Gating**

Rationale: Safe once Phase B's routing is confirmed correct. All LCD events are already declared
and subscribed in `MainWindow.OpenSettings()` — only XAML controls, `SetClockStyleButtonStates`
extension, and `PopulateControls` population are missing. Japanese style gating at two sites is
included here because it is logically complete only once the routing (Phase B) is in place.

- Delivers: `BtnLcd` in Clock Style rail; `LcdOptionsPanel` (24hr / seconds / style controls);
  visibility gating; `PopulateControls` LCD section; Japanese style combo re-enabled (two sites)
- Features: LCD-01, LCD-02, LCD-04 (UI surface); JA-01/02/03 (UI access)
- Pitfalls: #1, #2 (button/panel gating atomicity), #6 (style combo gate), #8 (`_suppressEvents`),
  #13 (snapshot completeness), #14 (`ResetToDefaults`)
- Research flag: None needed — follows the established Dial Face row visibility pattern exactly

**Phase D: Blinking Colon**

Rationale: Fully self-contained to `LcdClockView.xaml.cs`. No other file changes required.
Can be implemented in parallel with Phase C or after.

- Delivers: `_colonVisible` bool field; colon toggle in `UpdateTime()`; `Colon2` gated on `ShowSeconds`
- Features: LCD-03
- Pitfalls: #10 (no new timer), Colon2 visibility guard
- Research flag: None needed

**Phase E: Settings Persistence Hardening**

Rationale: Addresses silent regression risk from `STEST-01` coverage gaps and invalid `LcdStyle`
values from manual `settings.json` edits. Low risk, low effort, high correctness value.

- Delivers: `STEST-01` assertions for LCD fields; `SettingsService.Validate()` guard for `LcdStyle`
- Features: LCD persistence correctness
- Pitfalls: #11 (round-trip test coverage), #12 (`LcdStyle` validation)
- Research flag: None needed

---

## Research Flags

**Needs `/gsd:research-phase`:** None. All five phases have fully established patterns with
precise implementation guidance including line numbers, exact method signatures, and code snippets.
The codebase was audited at file and line level for all affected components.

**Phases with well-documented patterns (skip research):** All phases.

**Needs human review before shipping:** Japanese Poetic and Rude phrase vocabulary. FEATURES.md
explicitly flags these as LOW confidence for naturalness. Terse is MEDIUM confidence and can be
validated structurally. Poetic and Rude phrases should be marked provisional in code comments
until a native speaker reviews them.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All technologies verified by direct source audit; zero new packages confirmed |
| LCD features | HIGH | Rendering infrastructure complete; missing pieces precisely identified |
| LCD architecture | HIGH | Component boundaries, event flow, DP patterns all verified at line level |
| LCD pitfalls | HIGH | All pitfalls confirmed by source audit with exact file paths and line numbers |
| Japanese provider structure | HIGH | `IPhraseProvider` interface stable; 12-bucket pattern proven in existing `JapanesePhraseProvider` |
| Japanese routing | HIGH | Three affected sites identified; `ResolveLocaleKey` pattern specified with full code sample |
| Japanese phrase content — Terse | MEDIUM | Casual Japanese patterns well-established; Arabic numeral + 時 convention confirmed |
| Japanese phrase content — Poetic | LOW | Classical vocabulary plausible; native review required |
| Japanese phrase content — Rude | LOW | Register markers (じゃん, だろ, もう, とっくに) confirmed authentic; specific combinations need native review |

---

## Gaps to Address

1. **Japanese phrase naturalness (Poetic + Rude)** — Phrase buckets need native-speaker review
   before shipping. Not a structural blocker; mark as provisional in code.

2. **`STEST-01` LCD field coverage** — Audit required before Phase E (or before writing LCD
   persistence code). Not a blocker for Phases A–D but should be confirmed early.

3. **Ghost mode + LCD timer** — Pitfall #9 identifies a mitigation (skip predicate), but whether
   to implement it in v3.9 or defer is a roadmap decision. It is moderate, not blocking.

---

## Aggregated Sources

All sources are production codebase files verified 2026-03-23:

- `FuzzyClock.App/Controls/SevenSegmentDigit.xaml.cs`
- `FuzzyClock.App/Controls/LcdClockView.xaml.cs` + `.xaml`
- `FuzzyClock.Core/SevenSegmentEncoder.cs`
- `FuzzyClock.App/LcdTimeFormatHelper.cs`
- `FuzzyClock.App/LcdSize.cs`
- `FuzzyClock.App/ClockType.cs`
- `FuzzyClock.App/AppSettings.cs` + `SettingsSnapshot.cs`
- `FuzzyClock.App/SettingsWindow.xaml` + `SettingsWindow.xaml.cs`
- `FuzzyClock.App/MainWindow.xaml` + `MainWindow.xaml.cs`
- `FuzzyClock.App/GhostModeController.cs`
- `FuzzyClock.Core/PhraseEngine.cs`
- `FuzzyClock.Core/JapanesePhraseProvider.cs`
- `FuzzyClock.Core/IPhraseProvider.cs`
- `.planning/PROJECT.md`

Japanese phrase content confidence: MEDIUM (Terse), LOW (Poetic, Rude).

---

*Summary synthesized for: FuzzyStatsClock v3.9 — LCD Clock + Japanese Styles*
*Synthesized: 2026-03-24*
