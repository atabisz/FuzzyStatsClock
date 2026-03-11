# Pitfalls Research

**Domain:** WPF desktop widget — adding Nixie tube rendering, phrase personalities, dial shape/size to existing transparent overlay
**Project:** Fuzzy Clock v3.4
**Researched:** 2026-03-11
**Confidence:** HIGH — all pitfalls grounded in direct reading of `MainWindow.xaml.cs`, `AppSettings.cs`, `SettingsService.cs`, `PhraseEngine.cs`, `ClockType.cs`, `SevenSegmentDigit.xaml.cs`, test files, `MainWindow.xaml`, and `SettingsWindow.xaml`.

---

> **Scope note:** This document covers pitfalls specific to v3.4 additions: Nixie tube clock type (NIXIE-01 through NIXIE-07), phrase personality styles (PHRASE-01 through PHRASE-09), and dial shape/size enhancements (DIAL-01 through DIAL-03). v3.2 pitfalls (settings window architecture, theme atomicity, multilingual bucket coverage) are covered in prior PITFALLS.md versions and are not repeated unless they create new integration risks in v3.4.

---

## Critical Pitfalls

---

### Pitfall 1: ClockType Enum Switch Falls Through on Nixie — Widget Shows Blank or Wrong View

**What goes wrong:**
`MainWindow.xaml.cs` has multiple `if/else if` chains that branch on `_clockType`. Adding `ClockType.Nixie` to the enum without updating every branch point causes the Nixie clock type to silently fall into the `else` (Phrase) branch, showing empty phrase text. There is no compiler warning because `ClockType` is an enum, not a discriminated union.

The chains exist in at least three locations:
1. `ApplySettings()` — initial clock view setup on startup
2. The 10-second `_timer.Tick` handler — determines whether to call `UpdatePhraseIfChanged()` or `UpdateDialDisplay()`
3. `SetClockType()` — live switching from tray menu or settings window

**Why it happens:**
The existing pattern uses open `if/else if` chains ending in `else // Phrase` rather than an exhaustive switch with a compile-error for unhandled cases. Developers adding a fourth value must hunt every site manually.

**How to avoid:**
Before writing any Nixie rendering code, grep for every `ClockType` reference in `MainWindow.xaml.cs` and add a `Nixie` branch to each chain in the same commit. Change the final `else // Phrase` to an explicit `else if (... == ClockType.Phrase)` followed by a final `else { throw new InvalidOperationException($"Unhandled ClockType {_clockType}"); }` so future additions fail loudly.

**Warning signs:**
- Widget shows empty space when Nixie clock type is selected
- 10-second timer still calls `UpdatePhraseIfChanged()` when Nixie is active
- `DialCanvas.Visibility` or `PhraseText.Visibility` is unexpectedly Visible when Nixie is shown

**Phase to address:** Nixie rendering phase — before any NixieClockView control is built

---

### Pitfall 2: WPF UIElement.Effect on AllowsTransparency=True Window Renders as Black Rectangle

**What goes wrong:**
Any `BlurEffect` or `DropShadowEffect` applied to a WPF element inside a window with `AllowsTransparency="True"` silently produces a black rectangle instead of the intended visual. This is a known established constraint in this codebase — it caused the v1.0 shadow workaround — and directly threatens the Nixie glow implementation.

The Nixie glow bloom (NIXIE-02) planned via `RadialGradientBrush` layers is safe. But if any developer adds `<UIElement.Effect><BlurEffect .../></UIElement.Effect>` to a Nixie digit Canvas or its parent (as a "shortcut" for glow), the result is a black box that obscures the entire digit.

**Why it happens:**
`AllowsTransparency="True"` creates a `WS_EX_LAYERED` HWND. WPF's software renderer composites `UIElement.Effect` results through an intermediate render target that cannot be correctly alpha-composited back onto the transparent surface on most GPU/driver combinations.

**How to avoid:**
The Nixie glow must be implemented exclusively with `RadialGradientBrush` on a stacked `Canvas` element positioned behind (lower Z-order than) the digit shape layer. The glass tube border (NIXIE-04) must use `Border.CornerRadius`, not a blurred or shadowed overlay. The wire mesh (NIXIE-05) must use a `DrawingBrush` tile or `Path`, not a blurred image. No `UIElement.Effect` anywhere in the NixieClockView subtree.

**Warning signs:**
- Any `<UIElement.Effect>` tag anywhere inside NixieClockView or its children
- A black rectangle appears in the digit slot area at runtime on any machine

**Phase to address:** Nixie rendering phase — establish as a design constraint before building NixieClockView

---

### Pitfall 3: New Phrase Providers Not Registered in PhraseEngine._providers — SetLocale Returns false Silently

**What goes wrong:**
`PhraseEngine` is a static class with a `private static readonly Dictionary<string, IPhraseProvider> _providers` initialized at class load. Creating `PiratePhraseProvider`, `DwarfPhraseProvider`, and the other five new provider classes without adding them to this dictionary causes `PhraseEngine.SetLocale("en-pirate")` to return `false` silently. The active provider stays on the previous locale and no exception is thrown. The phrase never changes.

**Why it happens:**
The dictionary is a field initializer, not a registration mechanism. There is no auto-discovery. Creating a new `IPhraseProvider` class does nothing unless an entry is manually added to `_providers`.

**How to avoid:**
Every new provider must be added to `_providers` in the same commit that creates the provider class. The locale key used in `_providers["en-pirate"]` must exactly match the string used in the `_currentPhraseStyle.ToLowerInvariant() switch` in `MainWindow.ApplySettings()` (lines ~319-338). Both the dictionary entry and the switch case must be updated atomically.

Additionally: `SettingsWindow.xaml` has a hardcoded `<ComboBox x:Name="CmbPhraseStyle">` with exactly four `<ComboBoxItem>` elements (Classic/Terse/Poetic/Rude). Each new style needs a new `<ComboBoxItem>` added there.

**Warning signs:**
- `PhraseEngine.SetLocale("en-pirate")` returns `false`
- Selecting a new phrase style in Settings changes nothing about the displayed phrase
- The style setting persists to `settings.json` (the field is written correctly) but has no runtime effect

**Phase to address:** Phase 55 (phrase providers) — `_providers` dictionary entry, `ApplySettings()` switch case, and `CmbPhraseStyle` ComboBox item are three distinct touch points that must be updated in the same commit per provider

---

### Pitfall 4: AppSettings Record Missing Init Default or Validate() Guard for New Fields

**What goes wrong:**
`AppSettings` is an `init`-property record. When `SettingsService.Load()` deserializes a `settings.json` that predates a new field, `System.Text.Json` sets the missing property to the C# type zero-value: `null` for string, `false` for bool, `0` for int, `0` for enum (first value by ordinal). The `init` default expression in the property declaration (`= "Round"`) applies only when constructing via `new AppSettings()`, not during deserialization of JSON missing that field.

Concrete risks for v3.4:
- A new `DialShape` string field defaulting to `null` will cause a NullReferenceException in the dial rendering code on upgrade from v3.3
- A new enum field without `[JsonConverter(typeof(JsonStringEnumConverter))]` serializes as an integer (`0`) rather than its name string, and fails to deserialize if the ordinal order ever changes

**Why it happens:**
Developers add a field to `AppSettings` and assume the init default fires on deserialization. It does not. The `Validate()` method in `SettingsService` exists precisely because this has happened before and caused production bugs.

**How to avoid:**
For every new field added to `AppSettings` in v3.4:
1. Set a safe default in the property declaration: `public string DialShape { get; init; } = "Round";`
2. Add a guard in `SettingsService.Validate()` if the zero/null value is unsafe (same pattern as the existing `TextStyle`, `DateFormat`, `AccentColor` guards)
3. Add the field with its correct default to `SettingsService.Defaults()` explicitly
4. Add `[JsonConverter(typeof(JsonStringEnumConverter))]` to any new enum property (match the `ClockType` and `LcdSize` pattern)
5. Add a round-trip test and an absent-field-isolation test in `SettingsServiceTests`

**Warning signs:**
- New field appears in `AppSettings` but is absent from `SettingsService.Defaults()`
- New string or enum field has no corresponding guard in `SettingsService.Validate()`
- New enum property omits `[JsonConverter(typeof(JsonStringEnumConverter))]`

**Phase to address:** Any phase that introduces a new `AppSettings` field — applies to Nixie (no new field beyond ClockType.Nixie which uses the existing `ClockType` property), dial shape, and phrase style additions

---

### Pitfall 5: DialCanvas Fixed-Size Hand Geometry Breaks Oval Shape and Size Scaling

**What goes wrong:**
`DialCanvas` in `MainWindow.xaml` is `Width="80" Height="80"`. The clock hands are computed in `UpdateDialDisplay()` against a hard-coded center of `(40, 40)` and a hard-coded radius derived from that size. Adding oval shape support by changing only the canvas dimensions causes the hand pivot to remain at literal `(40, 40)` — hands will originate from the wrong center for any width that differs from height. Adding size scaling by changing `Width`/`Height` also fails because the radius constant does not scale.

**Why it happens:**
The canvas dimensions and the hand center coordinates are not derived from each other in code — `(40, 40)` is the literal half of the literal `80`. `UpdateDialDisplay()` uses trig with a hard-coded radius, not `DialCanvas.ActualWidth / 2`.

**How to avoid:**
Before implementing DIAL-01 and DIAL-02, refactor `UpdateDialDisplay()` to compute:
```
double cx = DialCanvas.Width / 2;
double cy = DialCanvas.Height / 2;
double hourRadius   = Math.Min(cx, cy) * 0.55;
double minuteRadius = Math.Min(cx, cy) * 0.80;
```
After this refactor, dial size changes only require updating `DialCanvas.Width`/`Height`, and oval support only requires setting different values for the two dimensions. For oval clip, apply `DialCanvas.Clip = new EllipseGeometry(new Point(cx, cy), cx, cy)` rather than changing the canvas shape, since `Canvas` does not natively clip to an ellipse.

**Warning signs:**
- `UpdateDialDisplay()` contains any literal `40`, `40.0`, `80`, or `80.0` used as center or radius after the dial enhancement phase
- Oval dial mode shows hands starting from a position that is not the canvas center

**Phase to address:** Dial enhancements phase — refactor geometry math first, before implementing shape or size options

---

### Pitfall 6: PhraseEngine Static State Leaks Between Tests for New Provider Test Classes

**What goes wrong:**
`PhraseEngineCoordinatorTests` is already decorated with `[DoNotParallelize]` and has a `[TestCleanup]` that resets to `"en-classic"`. New test classes for Pirate, Dwarf, Jive, Valley Girl, Yoda, and Shakespearean providers that call `PhraseEngine.SetLocale()` but omit `[TestCleanup]` will leave `_activeProvider` pointing at the wrong provider. Subsequent test methods in other classes that assume Classic locale will then produce wrong phrases, causing intermittent failures that differ between parallel and serial test runs.

**Why it happens:**
`PhraseEngine` is a static class — `_activeProvider` is process-global. The existing `PhraseStyleProviderTests.cs` already demonstrates the correct pattern on `TersePhraseProviderTests`, `PoeticPhraseProviderTests`, and `RudePhraseProviderTests`. New provider test classes written without studying this pattern will inadvertently skip it.

**How to avoid:**
Every new provider test class must follow the exact pattern in `PhraseStyleProviderTests.cs`:
1. Include `[TestCleanup] public void ResetLocale() => PhraseEngine.SetLocale("en-classic");`
2. Call `PhraseEngine.SetLocale("en-pirate")` at the start of each test method (not in `[TestInitialize]`) so the locale is explicit per test
3. Do not add `[DoNotParallelize]` to individual provider test classes — `PhraseEngineCoordinatorTests` already carries this and the reset pattern makes provider tests safe to run in parallel

**Warning signs:**
- A new provider test class has no `[TestCleanup]` method
- Tests for Classic phrases fail intermittently when run after a new provider test class
- Test results differ between `dotnet test` and `dotnet test --no-parallel`

**Phase to address:** Phase 55 (phrase providers) — apply the pattern to all 6-7 new provider test classes on creation

---

### Pitfall 7: Rude Provider Rewrite Breaks Existing Tests via Vocabulary Change

**What goes wrong:**
PHRASE-01 requires rewriting `RudePhraseProvider` with much ruder vocabulary (WTF, dafaq, tf). The existing `RudePhraseProviderTests` assert specific phrase content: `StringAssert.Contains(phrase, "move it")` and `Contains("get on with it")`. If these phrases are removed in the rewrite, the tests fail. This drops the test count below 248 and blocks CI even though the feature intent is correct.

**Why it happens:**
The tests assert vocabulary by content rather than structural contract. The rewrite is intentionally changing that vocabulary, so the assertions are simultaneously "correct per spec" and "wrong per the new implementation."

**How to avoid:**
Rewrite `RudePhraseProvider` and update `RudePhraseProviderTests` in the same commit. The updated tests should assert:
- Non-empty output for all 12 buckets
- Midnight and noon special cases return their expected values
- At least one "rude" marker is present in the output (assert one of the new vocabulary items)
- The structural contract: `GetStructuredPhrase()` returns empty Qualifier and non-empty Emphasis

Do not leave the old vocabulary assertions ("move it", "get on with it") — they will fail against the new text.

**Warning signs:**
- PHRASE-01 is committed without a corresponding update to `RudePhraseProviderTests`
- Test count falls below 248 after the rewrite commit
- CI fails on `RudePhraseProviderTests` while the Rude phrases display correctly in the widget

**Phase to address:** Phase 55 (phrase providers) — update provider and its tests atomically in a single commit

---

### Pitfall 8: Nixie Control Canvas Reports Zero DesiredSize — Window Collapses to Minimum Width

**What goes wrong:**
`MainWindow` uses `SizeToContent="WidthAndHeight"`. When `NixieClockView` is toggled visible, the window resizes to fit its content. WPF `Canvas` always reports `DesiredSize = (0, 0)` unless `Width` and `Height` are set explicitly — it does not auto-size to its children. A Nixie digit control that uses `Canvas` for stacking layers without explicitly setting `Canvas.Width`, `Canvas.Height`, and the `UserControl.Width`/`Height` will cause the window to collapse to the `StatsPanel` width floor (`Width="184"`) with no visible Nixie content.

**Why it happens:**
Canvas intentionally ignores children for sizing — it is designed for absolute positioning. `SevenSegmentDigit` already works around this correctly by setting `RootCanvas.Width = digitW` and `Width = digitW` in `RebuildGeometry()`. A new Nixie digit control written from scratch may miss this requirement.

**How to avoid:**
Use `SevenSegmentDigit.RebuildGeometry()` as the reference pattern for any new Nixie digit `UserControl`. After computing digit geometry, explicitly set:
```csharp
RootCanvas.Width  = computedDigitWidth;
RootCanvas.Height = computedDigitHeight;
Width  = computedDigitWidth;
Height = computedDigitHeight;
```
Alternatively, use `Grid` with explicit `ColumnDefinition.Width` values as the Nixie layout container — Grid does participate in WPF measure/arrange correctly without explicit width.

**Warning signs:**
- `NixieDigitControl.ActualWidth` is 0 after the window is shown
- Window width collapses to `184` (the StatsPanel floor) when Nixie mode is active
- NixieClockView is `Visible` but nothing is visible on screen

**Phase to address:** Nixie rendering phase — verify window sizing after the first iteration of NixieClockView

---

### Pitfall 9: Nixie Not Added to Tray Menu Clock Type Submenu

**What goes wrong:**
`TrayMenuBuilder` constructs a Clock Type submenu with items for each `ClockType` value. Adding `ClockType.Nixie` to the enum and to the Settings window Clock Style row without updating `TrayMenuBuilder` leaves Nixie accessible only from the Settings window. The tray menu — which is the primary quick-switch path for most users — will not show Nixie. This is a "looks done but isn't" completeness failure.

**Why it happens:**
`TrayMenuBuilder` and `SettingsWindow.xaml` are separate files. Updating one does not update the other. The tray menu builds its clock type items from an explicit list, not by reflecting the `ClockType` enum at runtime.

**How to avoid:**
When adding the Nixie button to `SettingsWindow.xaml`'s Clock Style segmented control, open `TrayMenuBuilder.cs` in the same commit and add the corresponding Nixie menu item. Treat tray menu and settings window as a pair that must be updated together.

**Warning signs:**
- Settings window shows Phrase / Dial / LCD / Nixie buttons
- Tray menu Clock Type submenu still shows only Phrase / Dial / LCD
- Selecting Nixie from Settings window and then right-clicking the tray shows no Nixie checkmark

**Phase to address:** Nixie settings integration phase — update tray menu and settings window together

---

### Pitfall 10: SettingsWindow Clock Style Row Overflows at Four Buttons

**What goes wrong:**
The Settings window Clock Style row uses a `StackPanel Orientation="Horizontal"` inside a `Border` with `HorizontalAlignment="Left"`. Currently it has three buttons: Phrase / Dial / LCD. Adding a fourth "Nixie" button may overflow the available space in the settings window column (column width is `*` — fills remaining space after the 90px label column in a 480px window). At 100% DPI this may be fine; at 125% DPI or on narrow screens the row may clip.

**Why it happens:**
The existing segmented control rows were designed for 2-3 buttons. No layout stress-testing with a fourth button has been done.

**How to avoid:**
After adding the Nixie button, visually test the Appearance tab at 100%, 125%, and 150% DPI scaling (or with the Settings window manually narrowed). If the four-button row is tight, abbreviate button labels: "Phrase" → "Phrase", "Dial" → "Dial", "LCD" → "LCD", "Nixie" → "Nixie" (all short enough). Do not use icon-only buttons — text labels match the existing style.

**Warning signs:**
- Clock Style buttons are clipped or overlap at 125% DPI
- The fourth button is partially or fully hidden behind the window edge

**Phase to address:** Nixie settings integration phase — visual review before marking NIXIE-06 done

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hard-code Nixie warm orange glow color rather than linking to AccentColor | Nixie "just works" visually; simpler implementation | Nixie ignores user accent color; blocks future theme support (NIXIE-X) | Acceptable for v3.4 — color options are explicitly deferred to v5+ |
| Add Nixie as another `else if` branch in the existing ClockType chains rather than refactoring to a strategy/factory pattern | No structural change needed; consistent with current patterns | Every new ClockType requires touching 3+ `if/else` sites; brittle as types grow | Acceptable for 4 clock types; refactor if a 5th type is ever added |
| Store DialShape as a string ("Round"/"Oval") rather than a new enum | No new file needed | String comparison throughout; no compiler help; must add `Validate()` guard manually | Never — use an enum with `[JsonConverter(typeof(JsonStringEnumConverter))]` matching ClockType pattern |
| Skip `Validate()` guards for new AppSettings fields | Faster implementation | Old `settings.json` on upgrade sets null/zero field; widget crashes or silently misconfigures | Never — prior bugs exist precisely because this was skipped |
| Implement dial size scaling by resizing `DialCanvas` without refactoring hand geometry math | Faster dial size implementation | Hard-coded `40.0` center constants break for any non-80px canvas | Never — refactor math first, then add size options |
| Test new phrase providers by running the widget manually without unit tests | Quick visual verification | No regression protection; PHRASE-09 explicitly requires ≥ 2 samples per provider verified by test | Never — 265 test target is a hard requirement |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| PhraseEngine + new style locale keys | Creating a provider but using a key not in the `_currentPhraseStyle.ToLowerInvariant() switch` in `ApplySettings()` | The key in `_providers["en-pirate"]` must exactly match the switch case string used in `ApplySettings()`; update both together |
| ClockType.Nixie + tray menu | Adding Nixie to Settings window only | `TrayMenuBuilder.cs` has its own clock type list; update both files in the same commit |
| Nixie timer pattern | Starting a `DispatcherTimer` in the NixieClockView constructor | `LcdClockView` starts/stops its timer in `IsVisibleChanged` to avoid wasted ticks when collapsed; Nixie must follow the same pattern |
| DialCanvas + SizeToContent | Changing `Width`/`Height` in code without invalidating layout | After resizing the canvas, call `UpdateLayout()` before reading `ActualWidth`/`ActualHeight` for position clamping — the same issue that caused the existing `ApplySettings()` unsafe-before-Show warning |
| AppSettings new enum property | Omitting `[JsonConverter(typeof(JsonStringEnumConverter))]` | Without the converter, the enum serializes as an integer; `settings.json` becomes fragile to reordering; always match the `ClockType` and `LcdSize` property pattern |
| Nixie ghost digits + Canvas.Children | Rebuilding all 10 ghost digit children on every timer tick | Build ghost digit geometry once in constructor; on tick, only update the fill brush of the active digit indicator |
| New phrase styles + PhraseLocale "auto" | New en-pirate etc. styles not included in the "auto" path in `ApplySettings()` | The "auto" path resolves locale from Windows UI culture and then falls into the `_currentPhraseStyle` switch; ensure the switch includes all new style names |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Allocating new `SolidColorBrush` on every Nixie render tick | GC pressure; micro-stutters every second | Cache brushes as fields (pattern from `SevenSegmentDigit._litBrush`); rebuild only when the color parameter changes | Every second if brush is allocated per-tick |
| RadialGradientBrush with many gradient stops on the Nixie glow layer | Frame drops on software renderer (integrated Intel GPU) | Use at most 3 gradient stops; do not animate brush stops — switch between two static cached brushes (lit/ghost) | Immediately visible on software renderer |
| Rebuilding all Nixie digit Canvas children (ghost + active) on every tick | CPU spike every 10 seconds | Geometry is immutable per digit; only the "which digit is lit" needs to change per tick | Every tick if full rebuild is done |
| Dial decoration re-adding elements on every font size change | Brief visual flash, layout thrash | Use `ScaleTransform` on existing `_hourTickElements` / `_minuteDotElements` list elements; do not clear and re-add | Every font size change |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Phrase Style ComboBox shows Pirate/Dwarf/etc. but they only apply in Phrase clock type | User selects Pirate while on LCD clock; nothing changes; confusing | Consider greying out Phrase Style selector when a non-Phrase clock type is active, or add a tooltip |
| Nixie glow RadialGradientBrush radiates visually outside the glass tube Border clip | Glow bleeds into adjacent digit slots or past the widget edge | Clip the glow Canvas to the tube bounds using `Canvas.Clip = new RectangleGeometry(...)` or contain glow within the tube Border |
| Dial "oval" shape visually looks the same as "round" on small sizes | User cannot tell the options apart | Ensure the oval variant has a visibly different aspect ratio (e.g., width:height = 4:3 or 3:2) — not just a 5% difference |
| Nixie clock active at startup but NixieClockView timer fires before window is shown | First tick may run during layout, before `ActualWidth` is valid | Follow the `LcdClockView` `IsVisibleChanged` pattern — start timer only after the control becomes visible |

---

## "Looks Done But Isn't" Checklist

- [ ] **ClockType.Nixie enum:** Value added to `ClockType.cs` — verify all `if/else if` chains in `MainWindow.xaml.cs` have a `Nixie` branch (at least 3 sites)
- [ ] **Nixie Settings window:** Clock Style segmented control has a 4th "Nixie" button in `SettingsWindow.xaml`
- [ ] **Nixie tray menu:** Tray menu Clock Type submenu lists Nixie — verify `TrayMenuBuilder.cs` includes Nixie item
- [ ] **Nixie persistence:** Selecting Nixie, closing, and reopening the app still shows Nixie — `ClockType.Nixie` round-trips through `settings.json` correctly via `JsonStringEnumConverter`
- [ ] **New phrase providers registered:** `PhraseEngine.SetLocale("en-pirate")` returns `true` — verify all 7 new locale keys are in `_providers`
- [ ] **New phrase styles in ApplySettings switch:** `_currentPhraseStyle = "Pirate"` (etc.) routes to correct locale key — verify all 7 new style names are in the switch in `ApplySettings()`
- [ ] **New phrase styles in ComboBox:** `CmbPhraseStyle` in `SettingsWindow.xaml` has all 11 items (Classic / Terse / Poetic / Rude + 7 new)
- [ ] **Rude provider rewrite tests updated:** `RudePhraseProviderTests` vocabulary assertions match new phrases — test count >= 248 after rewrite
- [ ] **All new provider test classes have TestCleanup:** Each of the 7 new provider test files includes `[TestCleanup] public void ResetLocale() => PhraseEngine.SetLocale("en-classic");`
- [ ] **PHRASE-09 coverage met:** Each new provider has >= 2 test methods with verified phrase samples
- [ ] **Dial hand geometry refactored:** `UpdateDialDisplay()` derives center from `DialCanvas.Width / 2` — no literal `40` or `40.0` as center coordinate
- [ ] **Dial shape persists:** Selecting oval shape, closing, reopening — oval shape is restored (new `AppSettings` field with `Validate()` guard and `Defaults()` entry)
- [ ] **AppSettings new fields have Defaults() entries:** Every new field in `AppSettings` for v3.4 appears in `SettingsService.Defaults()`
- [ ] **Nixie canvas has explicit Width/Height:** `NixieDigitControl.ActualWidth > 0` after window is shown — window does not collapse to StatsPanel width

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| ClockType switch fall-through (Nixie shows blank) | LOW | Grep all `ClockType` branches in `MainWindow.xaml.cs`; add `Nixie` case to each; retest |
| GPU effect black-box on layered HWND | MEDIUM | Remove all `UIElement.Effect` from Nixie subtree; reimplement glow with `RadialGradientBrush` layers |
| Provider not in `_providers` dictionary | LOW | Add single-line entry to `PhraseEngine._providers`; rerun test suite |
| `ApplySettings()` switch missing new style key | LOW | Add case to switch in `MainWindow.ApplySettings()`; test by selecting style in Settings |
| `AppSettings` missing `Validate()` guard on upgrade | LOW | Add guard to `Validate()`; add absent-field isolation test to `SettingsServiceTests` |
| Dial hand origin wrong after canvas resize | MEDIUM | Refactor `UpdateDialDisplay()` to use `DialCanvas.Width / 2` as center; verify with `DialGeometryTests` |
| Static test state leak from missing `[TestCleanup]` | LOW | Add `[TestCleanup]` to offending test class; run full suite serially to confirm fix |
| Rude provider rewrite breaks tests | LOW | Update `RudePhraseProviderTests` assertions to match new vocabulary in same commit |
| Nixie canvas reports zero `ActualWidth` | LOW | Set `RootCanvas.Width`, `RootCanvas.Height`, `Width`, `Height` explicitly after geometry computation |
| Nixie missing from tray menu | LOW | Add Nixie item to `TrayMenuBuilder.cs`; test by right-clicking tray icon |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| ClockType switch fall-through | Nixie rendering phase | Zero occurrences of `ClockType.Lcd` branch without adjacent `ClockType.Nixie` branch in `MainWindow.xaml.cs` |
| GPU effect on layered HWND | Nixie rendering phase | No `UIElement.Effect` in NixieClockView or its children; black-box regression test at runtime |
| Provider not registered in `_providers` | Phase 55 (phrase providers) | `PhraseEngine.SetLocale("en-pirate")` returns `true` in a unit test for each new key |
| `ApplySettings()` switch missing new style keys | Phase 55 (phrase providers) | Selecting each new style in Settings changes the displayed phrase |
| AppSettings missing init defaults / Validate() guards | Any phase adding new AppSettings fields | Absent-field isolation test: deserializing JSON without new field produces safe default, not null/0 |
| DialCanvas fixed-size center coordinates | Dial enhancements phase | `UpdateDialDisplay()` has no literal `40.0` center constants; hands are centered correctly at all dial sizes |
| Static test state leaks | Phase 55 (phrase providers) | Full test suite passes at expected count in both serial and default parallel modes |
| Rude provider rewrite breaks tests | Phase 55 (phrase providers) | Test count >= 248 after rewrite; all tests green |
| Nixie canvas zero `DesiredSize` | Nixie rendering phase | `NixieClockView.ActualWidth > 0` after window shown; window does not collapse |
| Nixie missing from tray menu | Nixie settings integration phase | Tray menu Clock Type submenu lists all four types including Nixie |
| Settings window Clock Style row overflow | Nixie settings integration phase | Visual review at 100% and 125% DPI; four buttons all visible and readable |

---

## Sources

| Source | Confidence |
|--------|------------|
| `FuzzyClock.App/ClockType.cs` — existing enum with 3 values; Nixie adds as 4th; read directly | HIGH |
| `FuzzyClock.App/MainWindow.xaml.cs` — `ApplySettings()`, `_timer.Tick` handler, `SetClockType()` chains; static `_clockType` field; read directly | HIGH |
| `FuzzyClock.App/AppSettings.cs` — init-property record pattern; all current fields; `[JsonConverter]` attribute pattern for `ClockType` and `LcdSize`; read directly | HIGH |
| `FuzzyClock.App/SettingsService.cs` — `Validate()` guards; `Defaults()` method; read directly | HIGH |
| `FuzzyClock.Core/PhraseEngine.cs` — static `_providers` dictionary; `SetLocale()` return-false-on-unknown pattern; read directly | HIGH |
| `FuzzyClock.Core.Tests/PhraseEngineCoordinatorTests.cs` — `[DoNotParallelize]`, `[TestCleanup]` reset pattern; read directly | HIGH |
| `FuzzyClock.Core.Tests/PhraseStyleProviderTests.cs` — `[TestCleanup]` pattern on per-provider test classes; read directly | HIGH |
| `FuzzyClock.App/Controls/SevenSegmentDigit.xaml.cs` — `RebuildGeometry()` explicit Canvas size pattern; brush caching pattern; read directly | HIGH |
| `FuzzyClock.App/MainWindow.xaml` — `AllowsTransparency="True"`, `DialCanvas Width="80" Height="80"`, `SizeToContent="WidthAndHeight"`, `StatsPanel Width="184"`; read directly | HIGH |
| `FuzzyClock.App/SettingsWindow.xaml` — `CmbPhraseStyle` with 4 hardcoded items; Clock Style segmented control with 3 buttons; fixed `Width="480"`; read directly | HIGH |
| Established v1.0 known issue: `DropShadowEffect` fails on `AllowsTransparency=True` layered HWND — manual offset shadow used instead; documented in project history | HIGH |
| WPF `Canvas` layout behavior: `DesiredSize = (0, 0)` unless `Width`/`Height` set explicitly — standard WPF layout system behavior, confirmed by `SevenSegmentDigit` workaround pattern in this codebase | HIGH |

---

*Pitfalls research for: Fuzzy Clock v3.4 — Nixie Tube Rendering, Phrase Personalities, Dial Shape/Size*
*Researched: 2026-03-11*
