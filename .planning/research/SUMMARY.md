# Project Research Summary

**Project:** FuzzyStatsClock v3.4 — Personalities & Nixie
**Domain:** C# WPF desktop overlay widget — phrase personalities, Nixie tube clock, dial enhancements
**Researched:** 2026-03-11
**Confidence:** HIGH

## Executive Summary

FuzzyStatsClock v3.4 adds three independent feature areas to an existing, well-structured C# WPF widget: seven new phrase personality styles (plus a Rude vocabulary rewrite), a Nixie tube clock face, and dial shape/size enhancements. All three areas integrate cleanly into established patterns already in the codebase — IPhraseProvider bucket tables, the LcdClockView UserControl template, and the DialGeometry parametric math — with no new NuGet dependencies and no changes to the project file. The recommended approach for each area is purely additive: new classes alongside existing ones, new values in existing enumerations, new XAML elements in existing layouts.

The single most significant implementation constraint is that `MainWindow` uses `AllowsTransparency="True"`, which makes WPF's `UIElement.Effect` system (BlurEffect, DropShadowEffect) produce black rectangles rather than visual effects. This is a pre-existing known codebase issue. All Nixie glow and bloom effects must therefore be implemented exclusively via stacked `RadialGradientBrush` layers and `DrawingBrush` tiles — the REQUIREMENTS.md constraint ("no image assets; WPF-only rendering via RadialGradientBrush") coincidentally mandates the only approach that actually works in this window type. The architecture research confirms WPF vector-only Nixie rendering is both feasible and visually complete at this fidelity level.

The two dominant risks are breadth (three parallel feature areas touching many files simultaneously) and silent integration failures. PhraseEngine's static dictionary, dual locale-switch sites in MainWindow, dual clock-type switch sites in MainWindow, and TrayMenuBuilder's separate clock type list all require coordinated updates. None of these risks involve novel technology — every pattern needed already exists in the codebase. The mitigation is disciplined co-location of changes: each feature area must update all its touch points in the same commit.

## Key Findings

### Recommended Stack

All v3.4 work uses the existing stack: `net10.0-windows`, WPF, MSTest 4.x, `System.Text.Json`, `System.Diagnostics.PerformanceCounter`. No new NuGet packages are needed. The WPF BCL (`RadialGradientBrush`, `DrawingBrush`, `Canvas`, `Border`) provides every visual primitive required for Nixie rendering. The `JsonStringEnumConverter` already on `AppSettings.ClockType` handles the new `Nixie` enum value with zero migration code.

**Core technologies:**
- `System.Windows.Media.RadialGradientBrush` — Nixie active digit glow bloom layer; mandated by REQUIREMENTS.md; already used in LCD palette system
- `System.Windows.Media.DrawingBrush` (TileMode=Tile) — wire mesh/anode grid overlay; no image assets needed
- `System.Windows.Controls.Canvas` with child Z-order — stacked ghost cathode digits; exact same pattern as `SevenSegmentDigit`
- `System.Windows.Controls.Border` with `CornerRadius` — glass tube border per digit slot; no image assets
- `IPhraseProvider` bucket table pattern — one class per personality style; zero new infrastructure
- `DispatcherTimer` with `IsVisibleChanged` start/stop — `NixieClockView` timer lifecycle; exact pattern from `LcdClockView`
- `JsonStringEnumConverter` — already on `ClockType`; handles `Nixie` automatically; must also be added to any new enum `AppSettings` property (e.g., `DialShape` if implemented as enum)

### Expected Features

**Must have (table stakes):**
- New phrase styles appear in Settings Phrase Style ComboBox — any style not in the ComboBox is inaccessible
- Phrase styles and Nixie clock type persist across restarts — every other setting persists; users expect this
- Nixie appears in tray menu Clock Type submenu — tray is the primary quick-switch path
- Dial shape preference persists — per pattern of every other dial setting

**Should have (competitive differentiators):**
- Nixie tube WPF-native visual simulation: stacked ghost digits, warm orange glow, glass tube border, wire mesh — no competitor renders Nixie without image assets
- Six new English personality styles (Pirate, Dwarf, Jive, Valley Girl, Yoda, Shakespearean) — no competing widget has vocabulary personalities
- Rude 2.0 with internet slang (WTF, bruh, smh, dafaq) replacing the existing passive-aggressive British register
- Oval dial option — fits wide desktop layouts; low-cost differentiator

**Defer (v5+):**
- Nixie color variants (blue/green historical Nixie)
- Nixie seconds display (adds width; needs 1s timer)
- Blinking Nixie colon
- Smooth-sweep second hand
- Phrase styles for non-English locales

### Architecture Approach

The codebase follows three established layered patterns that v3.4 extends cleanly. `FuzzyClock.Core` is a pure-logic layer (no WPF refs) containing `PhraseEngine` (static locale registry) and `IPhraseProvider` implementations (bucket table classes). `FuzzyClock.App` contains all WPF: `MainWindow` as orchestrator, self-timed UserControls (`LcdClockView`, new `NixieClockView`) in `Controls/`, `SettingsWindow` as a pure `Action<T>` event source that never writes settings directly, and `TrayMenuBuilder` as an independent WinForms tray. `AppSettings` is an `init`-property record serialized via `System.Text.Json`. The key architectural constraint for v3.4 is that `MainWindow` has dual touch points for every new feature — two `ClockType` switch sites and two `PhraseStyle`-to-locale switch sites — that must be updated together or silent regressions result.

**Major components:**
1. `NixieClockView` + `NixieDigit` UserControls — new; mirrors `LcdClockView` + `SevenSegmentDigit` structure exactly
2. Six new `IPhraseProvider` classes + rewritten `RudePhraseProvider` in `FuzzyClock.Core/` — new; established bucket table pattern
3. `PhraseEngine` — modified; add 6 new locale keys to `_providers` dictionary
4. `ClockType` enum — modified; add `Nixie = 3`
5. `AppSettings` record — modified; add `DialShape` string property with safe default and `Validate()` guard
6. `MainWindow` — modified; two clock-type switch sites, two phrase-style switch sites, new `ApplyDialShape()` method
7. `SettingsWindow` — modified; new Nixie button in Clock Style row, new DialShape radio buttons, 7 new ComboBox items
8. `TrayMenuBuilder` — modified; add Nixie to Clock Type submenu

### Critical Pitfalls

1. **UIElement.Effect black-box on AllowsTransparency=True window** — Never use `BlurEffect` or `DropShadowEffect` anywhere in the `NixieClockView` subtree. The `AllowsTransparency="True"` window causes these effects to render as black rectangles. All glow/bloom must use stacked `RadialGradientBrush` layers. This is a hard constraint, not a preference.

2. **ClockType switch fall-through in MainWindow** — Adding `ClockType.Nixie` to the enum without updating all three `if/else if` chains in `MainWindow.xaml.cs` (ApplySettings, timer Tick handler, SetClockType) causes Nixie to silently route to the Phrase branch or show blank. Grep all `ClockType` references in `MainWindow.xaml.cs` and add Nixie branches before writing any NixieClockView code.

3. **Dual locale-switch sites** — The `PhraseStyle`-to-locale mapping switch exists in both `ApplySettings()` and `SetPhraseStyle()` in `MainWindow.xaml.cs`. Missing either site causes new personality styles to work on live change but revert to Classic on restart. Both must be updated in the same commit.

4. **PhraseEngine._providers registration** — Creating a new `IPhraseProvider` class without adding it to the static `_providers` dictionary causes `SetLocale()` to return `false` silently. The ComboBox must also gain a corresponding item. All three touch points (class, dictionary entry, ComboBox item) must land in the same commit.

5. **AppSettings init defaults vs JSON deserialization** — The `init` default (`= "Round"`) applies only when constructing via `new AppSettings()`, not when deserializing JSON that lacks the field. Every new `AppSettings` field needs a `Validate()` guard and a `Defaults()` entry, or upgrade from v3.3 produces null/zero and crashes or misconfigures.

6. **Canvas DesiredSize zero in SizeToContent window** — WPF `Canvas` reports `DesiredSize = (0, 0)` unless `Width` and `Height` are explicitly set. Since `MainWindow` uses `SizeToContent="WidthAndHeight"`, a `NixieDigit` that omits explicit size will collapse the window to the `StatsPanel` minimum width. Follow the `SevenSegmentDigit.RebuildGeometry()` pattern.

## Implications for Roadmap

The three feature areas have no mutual dependencies and can be phased independently. Within each area, a clear build order emerges from architecture and pitfall risk. The suggested structure orders work so that pitfall-mitigation steps always precede the code that depends on them.

### Phase A: Phrase Providers (Core layer — pure C#, fully additive)

**Rationale:** Pure `FuzzyClock.Core` changes with no WPF risk; compiles and tests independently of App; the `IPhraseProvider` pattern is the most battle-tested pattern in the codebase; building this first proves the development workflow before touching the more complex Nixie rendering; all 7 style changes are individually cheap once the first one is complete.

**Delivers:** Rude 2.0 rewrite + 6 new personality providers (Pirate, Dwarf, Jive, Valley Girl, Yoda, Shakespearean) fully registered, UI-exposed in Settings ComboBox, and tested.

**Addresses:** FEATURES.md Rude 2.0, all 6 new personality styles (all P1)

**Avoids:**
- Pitfall 3 (provider not in `_providers`) — register in same commit as class
- Pitfall 5/Architecture (locale switch only updated in one MainWindow site) — update both `ApplySettings` and `SetPhraseStyle` together
- Pitfall 6 (static test state leak) — `[TestCleanup]` in every new provider test class
- Pitfall 7 (Rude rewrite breaks tests) — update `RudePhraseProviderTests` atomically with the rewrite

**Sub-steps by build layer:**
1. Rewrite `RudePhraseProvider` + update its tests (PHRASE-01)
2. Add 6 new provider classes; register all 6 in `PhraseEngine._providers` (PHRASE-02 through PHRASE-07)
3. Extend `SettingsService.Validate()` valid styles list
4. Add 7 new `CmbPhraseStyle` ComboBox items to `SettingsWindow.xaml`
5. Extend both locale-switch sites in `MainWindow.xaml.cs`
6. Add >= 2 test methods per new provider (PHRASE-09)

### Phase B: Nixie Tube Clock (App layer — new UserControl + full wiring)

**Rationale:** Highest-complexity and highest-risk feature; the UIEffect constraint and Canvas zero-size trap require establishing constraints before any visual work begins; the dual ClockType switch sites and TrayMenuBuilder omission are silent failures that are hard to diagnose post-hoc; isolating this phase allows focused visual iteration.

**Delivers:** Fully functional Nixie HH:MM clock with warm orange glow, stacked ghost digits, glass tube border, wire mesh overlay, correct window sizing, Settings window Clock Style button, tray menu item, and persistence through settings.json round-trip.

**Addresses:** FEATURES.md Nixie tube clock (P1 HIGH value/HIGH complexity)

**Avoids:**
- Pitfall 1 (UIElement.Effect black-box) — `RadialGradientBrush` only; no `<UIElement.Effect>` anywhere in NixieClockView subtree
- Pitfall 2 (ClockType switch fall-through) — add all three MainWindow branch sites before building NixieClockView
- Pitfall 8 (Canvas zero DesiredSize) — explicit Width/Height on NixieDigit following SevenSegmentDigit pattern
- Pitfall 9 (Nixie missing from tray) — update TrayMenuBuilder in same commit as SettingsWindow
- Pitfall 10 (Clock Style row overflow at 4 buttons) — visual test at 125% DPI before marking done

**Sub-steps by build layer:**
1. Add `ClockType.Nixie = 3` to `ClockType.cs`; add all three ClockType branch sites in `MainWindow.xaml.cs` (pitfall mitigation first, before any UserControl work)
2. Build `NixieClockView.xaml/.xaml.cs` and `NixieDigit.xaml/.xaml.cs` (stacked ghost + glow + tube + mesh)
3. Wire `NixieClockView` into `MainWindow.xaml` and both clock-type switch sites
4. Add Nixie button to `SettingsWindow.xaml` Clock Style row; add Nixie item to `TrayMenuBuilder.cs` in same commit
5. Verify `ClockType.Nixie` round-trips through `settings.json`; verify window does not collapse

### Phase C: Dial Enhancements (App layer — math refactor + new setting)

**Rationale:** Lowest complexity of the three areas; a math refactor followed by a new AppSettings field; no new controls needed; placed last because it is independent and the dial geometry refactor is safest done after phrase and Nixie work has stabilized.

**Delivers:** Round/oval dial shape toggle persisted in `AppSettings.DialShape`; dial canvas dimensions scaling with the existing Small/Medium/Large font size setting.

**Addresses:** FEATURES.md dial shape (P1 MEDIUM value/LOW complexity), dial size scaling (P1 MEDIUM value/LOW complexity)

**Avoids:**
- Pitfall 5 (dial hand geometry breaks with resized canvas) — refactor `UpdateDialDisplay()` to derive center from `DialCanvas.Width / 2` before adding shape or size options
- Pitfall 4 (AppSettings missing init default) — add `DialShape` with `= "Round"` default, `Validate()` guard, `Defaults()` entry, absent-field isolation test

**Sub-steps by build layer:**
1. Refactor `UpdateDialDisplay()` — replace literal `40.0` center constants with `DialCanvas.Width / 2`, `DialCanvas.Height / 2` (pitfall mitigation before any shape/size options)
2. Add `DialShape` string property to `AppSettings`; update `SettingsService.Validate()` and `Defaults()`
3. Add oval/round radio buttons to `SettingsWindow.xaml`; wire `DialShapeChanged` event
4. Implement `ApplyDialShape()` in `MainWindow` using a size lookup table mapping FontSize to canvas dimensions
5. Add absent-field isolation test for `DialShape`

### Phase Ordering Rationale

- Phrases first: pure Core with no WPF risk; establishes development momentum; validates the provider pattern before Nixie work begins
- Nixie second: highest-risk area (UIEffect constraint, Canvas sizing, 3+ ClockType sites); benefits from clean passing test suite before starting; most iteration time needed for visual tuning
- Dial last: lowest risk, smallest scope, purely self-contained; the math refactor is the only non-trivial step
- Within each phase, pitfall-mitigation steps are ordered explicitly first — enum/switch wiring before UserControl authoring; geometry math refactor before shape options — so the groundwork is safe before building on it

### Research Flags

Phases with well-documented patterns (no deeper research needed):
- **Phase A (Phrase Providers):** Pattern proven across 4 existing providers; bucket tables are the simplest structure in the codebase; all vocabulary specified in FEATURES.md
- **Phase C (Dial Enhancements):** Oval ellipse math with `rx`/`ry` is elementary trigonometry; `AppSettings` field pattern is repeated 8+ times in the existing codebase

Phase requiring empirical tuning during implementation (not pre-phase research):
- **Phase B (Nixie Rendering):** Architecture is clear but specific WPF parameter values (gradient stop offsets, ghost opacity, tile density, glow spread) must be validated at runtime. Budget explicit visual-review task steps inside this phase. No additional pre-phase research needed.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All techniques verified against direct codebase reads; every API is .NET 10 BCL WPF stable; no novel dependencies introduced |
| Features | HIGH | Scope directly from REQUIREMENTS.md; vocabulary sourced from primary historical documents (Hepster's Dictionary, Shakespeare corpus, canonical film dialog); Jive naturalness is MEDIUM (see Gaps) |
| Architecture | HIGH | All analysis from direct codebase inspection of specific files and line numbers; every pattern recommended already exists and works |
| Pitfalls | HIGH | All pitfalls grounded in direct reading of specific source files; AllowsTransparency UIEffect constraint confirmed from documented v1.0 workaround in project history |

**Overall confidence:** HIGH

### Gaps to Address

- **Jive vocabulary naturalness (MEDIUM confidence):** The documented 1940s Jive lexicon is well-sourced from Cab Calloway's Hepster's Dictionary, but whether the specific bucket phrases read as charming vs. awkward is an implementation judgment call. Treat the FEATURES.md bucket table as a starting point; budget one revision pass after visual testing.

- **Nixie visual parameter tuning:** Exact values for `RadialGradientBrush` stop offsets, ghost digit opacity (suggested 0.10–0.15), `DrawingBrush` tile density (suggested 8×8 DIP), and glow spread must be validated at runtime. The FEATURES.md color palette (`#FFFF8C2F` active, `#18FF8C2F` ghost, `#FF0A0500` tube background) is a grounded starting point, not a final spec. This is expected iteration, not a research gap.

- **SettingsWindow Clock Style row at 4 buttons:** PITFALLS.md flags that the 3-button row was not stress-tested for a fourth button. A visual review at 125% DPI must be a formal task in Phase B, not an afterthought.

## Sources

### Primary (HIGH confidence)
- `FuzzyClock.App/MainWindow.xaml.cs` — ClockType switch sites, locale switch sites, ApplySettings invariants (direct codebase read)
- `FuzzyClock.App/AppSettings.cs` — init-property record pattern, JsonConverter usage (direct codebase read)
- `FuzzyClock.App/SettingsService.cs` — Validate() and Defaults() patterns (direct codebase read)
- `FuzzyClock.Core/PhraseEngine.cs` — static _providers dictionary, SetLocale() behavior (direct codebase read)
- `FuzzyClock.App/Controls/SevenSegmentDigit.xaml.cs` — Canvas explicit sizing pattern, brush caching pattern (direct codebase read)
- `FuzzyClock.App/Controls/LcdClockView.xaml.cs` — DispatcherTimer + IsVisibleChanged start/stop pattern (direct codebase read)
- `FuzzyClock.App/MainWindow.xaml` — AllowsTransparency="True", SizeToContent="WidthAndHeight", DialCanvas dimensions (direct codebase read)
- `FuzzyClock.App/SettingsWindow.xaml` — CmbPhraseStyle with 4 hardcoded items; Clock Style segmented control with 3 buttons (direct codebase read)
- `.planning/REQUIREMENTS.md` v3.4 — feature scope and hard constraints (direct read)
- Microsoft Docs: WPF `RadialGradientBrush`, `DrawingBrush`, `Canvas`, `Border.CornerRadius` — standard BCL APIs (HIGH)
- Project v1.0 known issue: UIElement.Effect on AllowsTransparency HWND produces black rectangle — documented in project history (HIGH)

### Secondary (MEDIUM confidence)
- Cab Calloway's Hepster's Dictionary (1938, 1944 editions) — Jive vocabulary; primary source but phrase naturalness depends on implementation judgment
- Nixie tube visual characteristics (IN-12/IN-14/Z573M tube appearance) — WPF color value suggestions need runtime tuning; hobbyist Nixie clock community documentation corroborates visual elements

---
*Research completed: 2026-03-11*
*Ready for roadmap: yes*
