# Feature Landscape: LCD Clock + Japanese Phrase Styles

**Domain:** Desktop overlay widget — adding LCD 7-segment clock (fourth clock style) and Japanese Terse/Poetic/Rude phrase variants
**Milestone:** v3.9
**Researched:** 2026-03-23
**Confidence:** HIGH (findings from direct codebase audit; no external research needed — all infrastructure already exists in-repo)

---

## What Is Already Built (Do Not Re-Implement)

Before listing what to build, the existing infrastructure must be understood to avoid
duplicating work.

| Component | Status | Location |
|-----------|--------|----------|
| `SevenSegmentDigit` UserControl | Complete | `Controls/SevenSegmentDigit.xaml.cs` |
| `SevenSegmentEncoder` (7-seg bitmasks for 0-9, colon, space) | Complete | `FuzzyClock.Core/SevenSegmentEncoder.cs` |
| `LcdClockView` UserControl (HH:MM[:SS], Use24Hr, ShowSeconds, 1s timer) | Complete | `Controls/LcdClockView.xaml.cs` |
| `LcdTimeFormatHelper.FormatTime()` | Complete | `LcdTimeFormatHelper.cs` |
| `LcdSize` enum + `LcdSizeMap.ToSegmentHeight()` | Complete | `LcdSize.cs` |
| `ClockType.Lcd` enum value | Complete | `ClockType.cs` |
| `AppSettings.LcdUse24Hr`, `LcdShowSeconds`, `LcdStyle`, `LcdSize` fields | Complete | `AppSettings.cs` |
| `MainWindow.SetClockType(ClockType.Lcd)` + `ApplyLcdColors()` | Complete | `MainWindow.xaml.cs` |
| Three `LcdStyle` color modes: Dark (accent-colored), Paper (sage green), Silver (neutral gray) | Complete | `MainWindow.xaml.cs` `ApplyLcdColors()` |
| `SettingsWindow` events: `LcdUse24HrChanged`, `LcdShowSecondsChanged`, `LcdStyleChanged` (declared as stubs) | Declared, not wired to UI | `SettingsWindow.xaml.cs` |
| `JapanesePhraseProvider` (Classic, ja locale, all 12 buckets) | Complete | `FuzzyClock.Core/JapanesePhraseProvider.cs` |
| `PhraseEngine` locale registry with `["ja"]` key | Complete | `FuzzyClock.Core/PhraseEngine.cs` |
| `IPhraseProvider` interface (`GetPhrase`, `GetStructuredPhrase`, `GetSegmentKey`) | Complete | `FuzzyClock.Core/IPhraseProvider.cs` |
| `SettingsWindow.CmbPhraseStyle` disabled for Japanese locale | Exists (as gate to relax) | `SettingsWindow.xaml.cs` line 103-104 |

---

## Table Stakes

Features users expect from the LCD clock face and Japanese styles. Missing any of these
makes the feature feel incomplete or broken.

### LCD Clock

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| LCD button in SettingsWindow Clock Style rail | LCD is a new clock mode; it must be selectable alongside Phrase/Dial/Nixie | LOW | Extend `BtnPhrase/BtnDial/BtnNixie` rail with `BtnLcd`; fire `ClockTypeChanged(ClockType.Lcd)` |
| LCD settings section in SettingsWindow Appearance tab | 12/24h and seconds toggles are LCD-specific settings; user cannot configure without UI | LOW | Add a visibility-gated panel (visible only when Lcd selected); wire to the three stub events already declared |
| 12-hour / 24-hour toggle in LCD settings | Clock convention varies by locale; 12h is default, 24h is needed for non-US users | LOW | `ChkLcd24Hr` checkbox wired to `LcdUse24HrChanged` event; already handled in MainWindow |
| Optional seconds row toggleable in LCD settings | Seconds are distracting for a glanceable clock; must be off by default but user-accessible | LOW | `ChkLcdShowSeconds` checkbox wired to `LcdShowSecondsChanged`; already handled in MainWindow |
| LCD style selector (Dark / Paper / Silver) | The three styles give the LCD a distinct look; Dark uses accent color; Paper and Silver are fixed palettes | LOW | 3-button segment rail or ComboBox wired to `LcdStyleChanged`; `ApplyLcdColors()` already handles all three |
| 12-hour leading-space handling | 12-hour display uses a leading space for single-digit hours (` 3:45`) to prevent layout shift | LOW | Already implemented in `LcdTimeFormatHelper.FormatTime()`; `SevenSegmentEncoder.Encode(' ')` returns `0x00` (blank) |
| Blinking colon (every second) | All real LCD clocks blink the colon separator; a static colon looks unfinished | MEDIUM | `LcdClockView` ticks every second; colon blink requires toggling `Colon1.Character` between `':'` and `' '` on odd/even seconds; seconds display colons do not blink |
| LCD excluded from accent color application (Dark mode exception) | Dark mode intentionally uses accent color; Paper and Silver must NOT receive accent | LOW | `ApplyLcdColors()` in MainWindow already handles this correctly; accent applied only in Dark branch |
| LCD size follows font size setting | User changes font size in Settings; LCD digits should scale proportionally | LOW | `LcdView.Size = FontSizeToLcdSize(s.FontSize)` already wired in `SetClockType()` and `ApplyFontSize()` |
| Persist LCD settings across restarts | `LcdUse24Hr`, `LcdShowSeconds`, `LcdStyle` already in `AppSettings`; must round-trip through settings.json | LOW | Field storage done; requires `PopulateControls` to read and reflect values on open |

### Japanese Phrase Styles

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Japanese Terse provider (ja-terse) | Matches the English Terse pattern — clipped, compact phrasing without elaboration | MEDIUM | New `JapaneseTersePhraseProvider` class; 12 buckets; same template system as `JapanesePhraseProvider`; register as `["ja-terse"]` in `PhraseEngine` |
| Japanese Poetic provider (ja-poetic) | Matches the English Poetic pattern — imagery-based, atmospheric; Japanese has rich vocabulary for this | MEDIUM | New `JapanesePoeticPhraseProvider` class; multiple candidates per bucket; `Random.Shared` selection; register as `["ja-poetic"]` |
| Japanese Rude provider (ja-rude) | Matches the English Rude pattern — blunt, dismissive, impatient | MEDIUM | New `JapaneseRudePhraseProvider` class; multiple candidates per bucket; register as `["ja-rude"]` |
| Phrase style selector enabled for Japanese locale | Currently `CmbPhraseStyle.IsEnabled = false` when `ja` locale is active; styles must be accessible | LOW | Relax the gate in `PopulateControls` so `CmbPhraseStyle.IsEnabled = true` when locale is `"ja"` (or `"auto"` with Japanese UI culture) |
| PhraseEngine routing for ja-terse / ja-poetic / ja-rude | `SetPhraseStyle()` / `SetLocale()` must map `(locale="ja", style="Terse")` to `["ja-terse"]` | LOW | `PhraseEngine` already uses locale keys; add `["ja-terse"]`, `["ja-poetic"]`, `["ja-rude"]` entries and update `SetPhraseStyle()` locale-style routing logic |
| All 12 time buckets covered in each style | Missing buckets cause runtime exceptions; tests must verify exhaustive coverage | LOW | Follow the existing 12-bucket table (`UpperBound` 2/7/12/17/22/27/32/37/42/47/52/59) and special cases (正午 at 12:00, 真夜中 at 00:00) |
| Unit tests for all three new providers | Existing `MultilingualPhraseProviderTests.cs` exhaustively covers all buckets; same pattern required | LOW | One `[TestClass]` per new provider; test all 12 buckets + noon + midnight special cases |

---

## Differentiators

Features that go beyond minimal correctness and give the implementation character.

### LCD Clock

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Ghost segments (unlit segments visible at low opacity) | Real LCD displays show all 8-segment outlines faintly; without it the display looks flat | LOW | Already implemented in `SevenSegmentDigit.UpdateSegments()`: unlit segments use `_ghostBrush` (auto-computed as 15% of lit color, or explicit `GhostColor` for Paper/Silver styles) |
| Hexagonal chamfer on segment polygons | Physical 7-segment displays have beveled segment ends; chamfered polygons convey depth | LOW | Already implemented in `SevenSegmentDigit.RebuildGeometry()` via `ch` parameter; `HorizontalSegment` and `VerticalSegment` helpers produce 6-point polygons |
| Classic vs Bold segment styles | Classic = slender (calculator aesthetic); Bold = thick minimal-gap (Bodet station clock aesthetic); Paper/Silver use Bold | LOW | Already implemented via `SegmentStyle` dependency property; `SegmentStyle == "Bold"` branch in `RebuildGeometry()` |
| Background panel per digit | Real LCD displays have a physical substrate behind each digit; `BgColor` property fills this | LOW | Already implemented via `_backgroundRect` in `SevenSegmentDigit` |
| Blinking colon as liveness indicator | Static colon feels like a frozen screenshot; blink confirms the clock is running | MEDIUM | Requires odd/even second detection in `UpdateTime()`; toggle `Colon1.Character` between `':'` and `' '` |

### Japanese Phrase Styles

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Terse: uses casual spoken registers (口語) | Japanese casual speech is distinctly shorter than written formal — matches the Terse intent precisely | MEDIUM | Use plain form verbs, contracted forms, particles omitted where natural in casual speech |
| Terse: avoids kanji-heavy Sino-Japanese clock vocabulary | 一時 / 二時 etc. are formal; casual speech often uses `1時` (Arabic numerals + 時) or time-of-day words (朝, 昼, 夕) | MEDIUM | Mix Arabic numerals with `時` for compact notation in Terse |
| Poetic: uses nature/season imagery (時候の挨拶 style) | Japanese has a deep tradition of seasonal time expressions (春暁, 払暁, 白夜); poetic phrases can reference atmospheric conditions | HIGH | Requires Japanese language knowledge; examples below; confidence LOW on naturalness — native review recommended |
| Poetic: uses poetic register vocabulary (文語) | Literary Japanese uses classical forms (あけぼの for dawn, 夕暮れ for dusk) that feel genuinely evocative | HIGH | See phrase examples section below |
| Rude: uses coarse/brusque register (rough speech, タメ口) | Japanese casual-rude phrasing is syntactically distinct from English rudeness; requires Japanese-specific vocabulary | HIGH | See phrase examples section below; confidence LOW — native review recommended |
| Rude: uses dismissive sentence-final particles and forms | もう3時じゃん / いい加減〜だろ / とっくに〜 convey impatience in ways that feel authentically Japanese | HIGH | Examples below; do not translate English rude phrases literally |

---

## Japanese Phrase Style Examples by Bucket

These examples cover representative time buckets. Each row shows the Classic baseline
and the three new style variants. Confidence: MEDIUM for Terse (structural patterns
well-established), LOW for Poetic and Rude (cultural register nuance — native speaker
review recommended before shipping).

**Hour variables:** `{h}` = current hour (Sino-Japanese: 一時, 二時 ... 十二時);
`{h1}` = next hour. Terse may use `{hn}` = Arabic numeral hour (1–12).

### Bucket 0: On the hour (minute 0-2)

| Style | 3:00 example | Pattern note |
|-------|-------------|-------------|
| Classic | `三時ちょうど` | Formal Sino-Japanese + ちょうど |
| Terse | `3時` or `3時だ` | Arabic numeral, drop ちょうど |
| Poetic | `三時の鐘が鳴る` / `三時の静けさ` | Bell metaphor, silence metaphor |
| Rude | `もう3時じゃん` / `3時だけど？` | もう (already), じゃん (dismissive) |

### Bucket 1: Five past (minute 3-7)

| Style | 3:05 example | Pattern note |
|-------|-------------|-------------|
| Classic | `三時過ぎ` | hour + 過ぎ (past) |
| Terse | `3時ちょい過ぎ` | ちょい (casual "a little") |
| Poetic | `三時を少し越えた頃` | 頃 (around that time) |
| Rude | `3時過ぎてるし` | してるし = exasperated "it's already past" |

### Bucket 2: Ten past (minute 8-12)

| Style | 3:10 example | Pattern note |
|-------|-------------|-------------|
| Classic | `三時十分過ぎ` | hour + 十分過ぎ |
| Terse | `3時10分` | Bare time, no elaboration |
| Poetic | `三時を十分ほど過ぎた` | ほど = approximately |
| Rude | `3時10分にもなるのに` | にもなる = "has gotten to be" (impatient) |

### Bucket 3: Quarter past (minute 13-17)

| Style | 3:15 example | Pattern note |
|-------|-------------|-------------|
| Classic | `三時十五分` | Bare time |
| Terse | `3時15分` | Arabic numerals only |
| Poetic | `三時の四半後` | 四半 = quarter, archaic feel |
| Rude | `とっくに3時過ぎだろ` | とっくに = "long since" |

### Bucket 6: Half past (minute 28-32)

| Style | 3:30 example | Pattern note |
|-------|-------------|-------------|
| Classic | `三時半` | Standard half-hour form |
| Terse | `3時半` | Same — half-hour is already short |
| Poetic | `夜の折り返し地点、三時半` | 折り返し地点 = turnaround point |
| Rude | `3時半か、まだ半分か` | まだ半分か = "still only halfway" |

### Bucket 10: Ten to (minute 48-52)

| Style | 2:50 → "nearly 3" example | Pattern note |
|-------|---------------------------|-------------|
| Classic | `もうすぐ三時` | Standard "soon three" |
| Terse | `3時まであと少し` | あと少し = a little more |
| Poetic | `三時の気配がしてきた` | 気配 = presence/sense, evocative |
| Rude | `まだ3時じゃないの？早くなれよ` | 早くなれよ = "hurry up and arrive" |

### Special: Noon (12:00)

| Style | Example | Note |
|-------|---------|------|
| Classic | `正午` | Standard noon word |
| Terse | `正午` | Same — no shorter form exists |
| Poetic | `お天道様が頂点に立つ` | Sun at zenith; poetic |
| Rude | `もう昼か` | もう (already), か (resigned) |

### Special: Midnight (00:00)

| Style | Example | Note |
|-------|---------|------|
| Classic | `真夜中` | Standard midnight word |
| Terse | `真夜中` | Same — no shorter form |
| Poetic | `丑三つ時` | Classical: witching hour (2-2:30 AM), acceptable at midnight |
| Rude | `こんな時間まで何してんの` | "What are you doing at this hour" |

---

## Anti-Features

Features to explicitly not build in this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Blinking colon in seconds display | The seconds digits already convey time movement; a blinking colon in the seconds position creates visual noise without benefit | Blink only `Colon1` (hours/minutes separator); keep `Colon2` (minutes/seconds separator) static lit |
| AM/PM indicator on LCD face | AM/PM adds a rendered label element that doesn't fit the minimal 7-segment aesthetic; the widget is a glanceable overlay, not an alarm clock | Omit; 12/24h toggle is sufficient |
| Custom LCD color palette separate from accent color | Three preset styles (Dark/Paper/Silver) already cover the design space; a fourth custom palette adds settings complexity without clear value | Dark mode reuses the existing accent color — the user's full color picker already covers custom LCD colors |
| Translating English Rude/Poetic phrases word-for-word into Japanese | Direct translation produces unnatural Japanese; the styles must be re-authored in idiomatic Japanese registers | Author each Japanese style bucket independently using Japanese-appropriate register vocabulary |
| Japanese Terse/Poetic/Rude covering time-of-day periods (morning/afternoon) | Time-of-day labels (朝/昼/夕/夜) would require a day-quadrant lookup in addition to the minute-bucket system; adds significant complexity | Use the same 12-bucket/minute-based system as Classic; rely on clock context for time-of-day orientation |
| LCD-specific tray menu items | The tray menu already handles clock type switching via `_lcdClockItem`; adding LCD sub-items to the tray for 12/24h or seconds would duplicate the SettingsWindow UI | LCD configuration lives entirely in SettingsWindow > Appearance > LCD Settings panel |
| Digit animation (segment crossfade) on LCD | Animated segment transitions require per-segment opacity tweens on every second tick — high rendering cost for a background widget | Instant segment state flip on tick (current implementation) |
| NixieSizeMap rename / unification with LcdSizeMap | Both enums use the same `LcdSize` type but `NixieClockView` uses `NixieSizeMap.ToDigitHeight()` while `LcdClockView` uses `LcdSizeMap.ToSegmentHeight()`; renaming would require migration | Leave both maps as-is; they produce different pixel values appropriate to their respective digit geometries |

---

## Feature Dependencies

```
[LCD Settings UI in SettingsWindow]
    requires: BtnLcd added to Clock Style rail in SettingsWindow.xaml
    requires: LCD settings panel (ChkLcd24Hr, ChkLcdShowSeconds, LCD style selector) added to Appearance tab
    requires: SetClockStyleButtonStates(ClockType) extended to handle Lcd, gate LCD panel visibility
    requires: PopulateControls to read s.LcdUse24Hr, s.LcdShowSeconds, s.LcdStyle
    events: LcdUse24HrChanged, LcdShowSecondsChanged, LcdStyleChanged already declared in SettingsWindow.xaml.cs
    already handled: MainWindow.OpenSettings() subscribes to all three events; wires to _lcdUse24Hr/_lcdShowSeconds/_lcdStyle fields and LcdView

[Blinking colon]
    requires: LcdClockView.UpdateTime() to toggle Colon1.Character on odd/even seconds
    detect even/odd: DateTime.Now.Second % 2 == 0
    no new timer needed: LcdClockView already ticks every second via its own DispatcherTimer
    colon blank: Character = ' ' → SevenSegmentEncoder.Encode(' ') = 0x00 → all segments ghost

[Japanese Terse/Poetic/Rude providers]
    requires: JapaneseTersePhraseProvider, JapanesePoeticPhraseProvider, JapaneseRudePhraseProvider
    register: ["ja-terse"], ["ja-poetic"], ["ja-rude"] in PhraseEngine._providers
    routing: SetPhraseStyle("Terse") when CurrentLocale starts with "ja" → must route to "ja-terse"
             (currently routes to "en-terse" — the guard "if locale !starts-with en- return" must be extended)
    PhraseEngine.SetPhraseStyle() currently hard-codes English style keys; needs locale-aware dispatch
    or: add a separate SetLocaleAndStyle(locale, style) method to PhraseEngine

[SettingsWindow phrase style gate]
    currently: CmbPhraseStyle.IsEnabled = false when locale is "ja"
    required change: enable CmbPhraseStyle for "ja" locale (styles now exist)
    scope: PopulateControls isNonEnglish gate must exclude "ja" from the disabled set
    keep disabled: "fr", "es", "de", "pl" (no style variants exist for those languages)

[Unit tests]
    JapaneseTersePhraseProvider: all 12 buckets + noon + midnight
    JapanesePoeticPhraseProvider: all 12 buckets + noon + midnight (random selection — test that result is non-null/non-empty)
    JapaneseRudePhraseProvider: all 12 buckets + noon + midnight
    Pattern: follow MultilingualPhraseProviderTests.cs structure

[PhraseEngine routing for Japanese styles]
    Option A: Extend PhraseEngine.SetPhraseStyle() to check CurrentLocale and route ja+Terse → ja-terse
    Option B: Add PhraseEngine.SetLocaleAndStyle(string locale, string style) that resolves the combined key
    Option A is simpler and consistent with the existing "en-terse" / "en-poetic" / "en-rude" pattern
    The existing SetPhraseStyle guard ("early return if !starts-with en-") must become locale-aware
```

---

## MVP Definition

### This Milestone Delivers (v3.9)

Per PROJECT.md active requirements:

- [ ] LCD-01: LCD clock face (7-segment, WPF-drawn, accent-colored) — Surface LCD in Settings rail; verify LcdClockView is correctly activated
- [ ] LCD-02: 12-hour / 24-hour toggle in Settings — LCD settings panel with ChkLcd24Hr
- [ ] LCD-03: Blinking colon (every second) — Toggle Colon1 on odd/even seconds in LcdClockView.UpdateTime()
- [ ] LCD-04: Optional seconds row, toggleable in Settings — ChkLcdShowSeconds in LCD settings panel
- [ ] JA-01: Japanese Terse phrase style — JapaneseTersePhraseProvider registered as ja-terse
- [ ] JA-02: Japanese Poetic phrase style — JapanesePoeticPhraseProvider registered as ja-poetic
- [ ] JA-03: Japanese Rude phrase style — JapaneseRudePhraseProvider registered as ja-rude

### Deferred (Not This Milestone)

- LCD digit crossfade animation — cosmetic, high rendering cost
- Japanese time-of-day period labels (朝/昼/夕/夜) integrated into phrase display
- Additional LCD styles beyond Dark/Paper/Silver
- French/Spanish/German/Polish style variants

---

## Complexity Assessment

### LCD Clock (Overall: LOW)

The rendering stack is fully pre-built and validated. `SevenSegmentDigit`, `LcdClockView`,
`LcdTimeFormatHelper`, `LcdSizeMap`, and all MainWindow wiring exist and work.
The work is:
1. SettingsWindow XAML: add `BtnLcd` to the clock style rail, add the LCD settings panel
2. SettingsWindow code-behind: extend `SetClockStyleButtonStates()`, `PopulateControls()`, add three click handlers
3. `LcdClockView.UpdateTime()`: add one-line colon blink toggle

Blinking colon is MEDIUM only because it requires understanding that `Colon2` (seconds separator)
must NOT blink while `Colon1` (HH:MM separator) must blink; also requires verifying that
`SevenSegmentDigit` renders a blank cleanly (it does — `Encode(' ')` = `0x00`).

### Japanese Phrase Styles (Overall: MEDIUM)

Infrastructure is fully built. Adding three providers requires:
1. Authoring phrase content for each style across all 12 buckets + noon + midnight
2. Extending `PhraseEngine.SetPhraseStyle()` to be locale-aware
3. Relaxing the SettingsWindow `isNonEnglish` gate for Japanese
4. Writing unit tests for all three providers

The highest uncertainty is phrase naturalness for Poetic and Rude registers.
Japanese Terse is the most straightforward (casual contracted forms have clear patterns).
Japanese Poetic requires cultural knowledge of classical/evocative vocabulary.
Japanese Rude requires knowledge of coarse registers — タメ口, sentence-final particles
like じゃん/だろ/か, and constructions like もう/とっくに/まだ.

**Native speaker review is recommended before shipping Poetic and Rude phrases.**
Terse is lower risk and can be validated mechanically.

---

## Sources

- Direct codebase audit (2026-03-23): HIGH confidence for all structural findings
  - `FuzzyClock.App/Controls/SevenSegmentDigit.xaml.cs` — segment geometry, ghost, bitmask rendering
  - `FuzzyClock.App/Controls/LcdClockView.xaml.cs` — time update loop, Use24Hr/ShowSeconds/Size/Style DPs
  - `FuzzyClock.App/LcdTimeFormatHelper.cs` — 12/24h formatting, leading-space behavior
  - `FuzzyClock.Core/SevenSegmentEncoder.cs` — supported characters, bitmask values
  - `FuzzyClock.App/AppSettings.cs` — LcdUse24Hr/LcdShowSeconds/LcdStyle/LcdSize field status
  - `FuzzyClock.App/MainWindow.xaml.cs` — SetClockType(Lcd), ApplyLcdColors(), style modes
  - `FuzzyClock.App/SettingsWindow.xaml.cs` + `.xaml` — stub events, missing LCD panel, phrase style gate
  - `FuzzyClock.Core/JapanesePhraseProvider.cs` — Classic ja bucket structure and HourWords
  - `FuzzyClock.Core/PhraseEngine.cs` — provider registry, SetLocale, SetPhraseStyle routing
  - `.planning/PROJECT.md` — active requirements LCD-01..LCD-04, JA-01..JA-03

- Japanese phrase style assessment: MEDIUM confidence for Terse; LOW confidence for Poetic/Rude
  - Terse patterns: well-established casual Japanese spoken forms; Arabic numeral + 時 usage confirmed
  - Poetic vocabulary (丑三つ時, 鐘が鳴る, 気配, 折り返し地点): literature-based; plausible but requires review
  - Rude register (じゃん, だろ, もう, とっくに, まだ): confirmed as authentic dismissive/impatient markers in
    contemporary Japanese casual speech; specific phrase combinations require native review

---

*Feature landscape for: FuzzyStatsClock v3.9 — LCD Clock + Japanese Phrase Styles*
*Researched: 2026-03-23*
