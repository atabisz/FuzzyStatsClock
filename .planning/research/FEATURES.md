# Feature Research

**Domain:** Desktop overlay widget — settings window, themes, battery alert, phrase styles, multilingual (v3.2)
**Researched:** 2026-03-08
**Confidence:** HIGH (WPF patterns, English phrase content, French/Spanish/German: HIGH; Japanese phrases: MEDIUM)

---

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Settings window (tabbed WPF) | Tray menu now has 40+ items; discoverability is broken; any mature widget exposes a proper settings UI | MEDIUM | Single WPF Window, 3 tabs; shown via tray "Settings..." item; one instance |
| Battery low alert (accent → red when low) | Universal OS pattern; every battery indicator turns red near empty; users expect this | LOW | Runtime color override on battery row only; no new AppSettings key |
| Named themes (5 presets) | Desktop customization tools universally offer named presets; one-click look change is expected | MEDIUM | Each theme is a frozen bundle applied via existing setting paths |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Phrase style personalities (Terse/Poetic/Rude) | No other fuzzy clock offers vocabulary personalities; high charm factor | MEDIUM | Parallel bucket arrays in PhraseEngine; English-only |
| Multilingual phrase sets (fr/es/de/ja) | Native cultural phrasing, not word-for-word translation; German "halb" convention alone makes it charming | HIGH | 4 languages x 12 buckets + hour-word arrays; infrastructure work is the bulk of it |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Live theme preview in settings window | Feels polished | Requires binding settings window to MainWindow state; two-Window coupling; threading complexity | Apply on OK/close; one extra click is acceptable |
| Theme editor (custom named themes) | Power users want to save combos | Requires rename UI, new-theme flow, persistent named-theme storage separate from AppSettings; scope bloat | 5 fixed presets + existing custom accent picker covers 99% of need |
| Per-language date format | Different locales format dates differently | DateFormatter already has 4 formats; coupling language to date format creates a matrix of choices | Keep date format independent of phrase language |
| Phrase styles for non-English languages | "Rude" Spanish sounds fun | Style personalities depend on English idiom ("sharp", "honestly", etc.); translations would not land the same way | English styles only; non-English gets native phrasing which is its own reward |

---

## Feature Dependencies

```
[Themes]
    └──bundles──> [AccentColor] (already exists)
    └──bundles──> [Opacity] (already exists)
    └──bundles──> [FontSize] (already exists)
    └──bundles──> [DialMode] (already exists)
    └──bundles──> [StatsVisible] (already exists)
    └──does NOT bundle──> [per-row stats, ghost mode, auto-contrast, date settings, phrase style]

[Settings Window]
    └──reads/writes──> [AppSettings] (already exists)
    └──supplements──> [TrayMenuBuilder] (tray stays for quick toggles; settings for discovery)
    └──must NOT depend on──> [Themes] (themes use settings window, not vice versa)
    └──shows/hides──> [PhraseStyle selector] (enabled only when language == "en")

[Phrase Styles (Terse/Poetic/Rude)]
    └──extends──> [PhraseEngine.GetPhrase + GetStructuredPhrase] (already exists)
    └──gated by──> [PhraseLanguage == "en"] (styles are English-only; hide selector for other languages)
    └──independent of──> [Multilingual Phrases]

[Multilingual Phrases (fr/es/de/ja)]
    └──extends──> [PhraseEngine] (already exists)
    └──driven by──> [AppSettings.PhraseLanguage] (new field; "auto" reads CultureInfo.CurrentUICulture)
    └──independent of──> [Phrase Styles]

[Battery Low Alert]
    └──requires──> [BatteryVisible == true] (already exists)
    └──reads──> [StatsService battery data] (already exists: BatteryPercent, IsPluggedIn)
    └──independent of──> [Themes] (alert is runtime color override, not a theme component)
    └──does NOT modify──> [AppSettings] (always-on; no user toggle needed in v3.2)
```

### Dependency Notes

- **Themes bundle existing settings.** A theme write is a multi-field `AppSettings with { ... }` record expression. No new storage layer. Theme selection is one-shot: after applying, individual setting changes do not "belong" to a theme any more.
- **Phrase styles are English-only.** When `PhraseLanguage != "en"`, the style selector should be disabled in the settings window. The existing `TextStyle` (Classic/Split/Literary/Mono) is a display format; `PhraseStyle` (Classic/Terse/Poetic/Rude) is a vocabulary selector — these are orthogonal.
- **Battery low alert is always-on.** It does not mutate AppSettings; it is applied in the render path. The auto-contrast system must not interfere with the red override — the red is intentional, not a contrast adjustment target.
- **Settings window and tray menu coexist.** Settings window handles grouped discovery of all settings. Tray menu keeps quick-access items (Ghost Mode, Quit, Settings shortcut). There is no need to remove tray items.

---

## MVP Definition

### Launch With (v3.2)

- [ ] Settings window (3 tabs: Appearance / Stats / Behavior) — discoverability blocker for existing features
- [ ] Battery low alert (<20%, unplugged → red battery row) — tiny code, high user value
- [ ] 5 named themes — pairs naturally with Appearance tab
- [ ] Phrase styles: Terse, Poetic, Rude (English) — signature v3.2 differentiator
- [ ] French phrase set — most common secondary locale on European Windows
- [ ] Spanish phrase set — second most common
- [ ] German phrase set — third; "halb" convention is delightful
- [ ] Japanese phrase set — distinctly different approach (Arabic numerals + 時); medium complexity

### Add After Validation (v3.x)

- [ ] Additional languages (Italian, Portuguese, Dutch) — validate demand first
- [ ] "Small hours" context-aware Poetic phrases (different vocab 00:00–05:59) — fun but requires time-of-day branching in PhraseEngine

### Future Consideration (v4+)

- [ ] Custom named themes / theme editor — requires separate storage + rename UI
- [ ] Per-locale date format defaults — too many combinations to spec now

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Settings window | HIGH | MEDIUM | P1 |
| Battery low alert | MEDIUM | LOW | P1 |
| Named themes (5) | HIGH | MEDIUM | P1 |
| Phrase styles (Terse/Poetic/Rude) | HIGH | MEDIUM | P1 |
| French phrases | HIGH | LOW | P1 |
| Spanish phrases | HIGH | LOW | P1 |
| German phrases | MEDIUM | LOW | P1 |
| Japanese phrases | MEDIUM | MEDIUM | P1 |

All features are P1 — they are tightly scoped and the four language sets are small once the infrastructure exists.

---

## Detailed Feature Specifications

### A. Settings Window (Tabbed WPF)

**Window properties:**

- `WindowStyle=SingleBorderWindow` — standard chrome; not frameless (user needs to be able to close it)
- `ResizeMode=NoResize` — fixed size, approximately 480 wide x 440 tall
- `ShowInTaskbar=False` — it is a tool window, not a primary app window
- `Owner=mainWindow` — floats above the overlay but not above other apps' windows
- Do NOT set `Topmost=True` on the settings window — that makes it annoying over other apps
- Single instance pattern: if already open, call `Activate()` to bring to front; do not open a second window

**Triggered by:** Tray menu item "Settings..." (add to TrayMenuBuilder). No double-click on tray icon (Windows reserves that behavior inconsistently).

**OK / Cancel pattern:**

- "OK" button: read all controls, build new `AppSettings with { ... }`, call existing `SaveSettings()` + `ApplySettings()`, close.
- "Cancel" button: close without writing settings.
- No "Apply" button: partial-apply with many interdependent settings (e.g., theme + accent) creates confusing intermediate states.
- On open: populate all controls from current `AppSettings` snapshot passed in from MainWindow.

**No MVVM / data binding needed.** This project's existing pattern is "read controls in handler, write controls in Open handler." The settings window is small enough that a ViewModel adds complexity without benefit. Follow the existing tray menu pattern.

**Tab 1 — Appearance:**

- Theme selector: 5 radio buttons labeled by theme name. Selecting applies theme to the in-memory controls (accent swatch, opacity slider, etc.) but does not write to AppSettings until OK.
- Accent color: 5 preset color swatches + "Custom..." button (invokes existing custom color picker logic).
- Opacity: Slider 10–100% (step 10). Label shows current %. Mirrors tray menu presets.
- Font size: "Small (24)" / "Medium (32)" / "Large (42)" radio buttons.
- Clock style: "Phrase" / "Dial" radio buttons.

**Tab 2 — Stats:**

- "Show stats panel" checkbox (master toggle).
- Sub-group (enabled only when above checked): CPU / GPU / MEM / PAG / Battery / Uptime checkboxes.
- Update interval: 3 radio buttons (1s / 3s / 10s).
- Process threshold: 3 radio buttons (2% / 5% / 10%).
- Date display section: "Show date" checkbox + 4-item radio group (Short / Long / Numeric / ISO).

**Tab 3 — Behavior:**

- Ghost mode: checkbox.
- Auto-contrast: checkbox.
- Auto-launch at login: checkbox.
- Phrase language: ComboBox with options "Auto (follow Windows)" / "English" / "French (français)" / "Spanish (español)" / "German (Deutsch)" / "Japanese (日本語)". "Auto" stores `"auto"` in AppSettings; others store the ISO two-letter code.
- Phrase style (English only): ComboBox with "Classic" / "Terse" / "Poetic" / "Rude". Enabled only when Phrase language is "Auto" (when Windows language is English) or "English". Disabled and shows "Classic" for non-English selections.

---

### B. Named Themes (5 Presets)

**What a theme contains:**

```
Theme = {
  Name:         string   // display name
  AccentColor:  Color
  Opacity:      double   // 0.25–1.0
  FontSize:     int      // 24, 32, or 42
  DialMode:     bool
  StatsVisible: bool
}
```

Stats per-row visibility, ghost mode, auto-contrast, date settings, and phrase style/language are NOT bundled — they are personal preferences that should survive a theme switch.

**5 recommended themes:**

| Name | Accent | Opacity | Font | Clock | Stats |
|------|--------|---------|------|-------|-------|
| Night Owl | White `#FFFFFFFF` | 85% | 32 | Phrase | off |
| Desert | Amber `#FFFFC000` | 75% | 32 | Phrase | off |
| Tundra | Ice Blue `#FF87CEEB` | 90% | 42 | Dial | off |
| Hacker | Green `#FF00C000` | 100% | 24 | Phrase | on |
| Pastel | Hello Kitty Pink `#FFFF69B4` | 75% | 32 | Phrase | off |

These reuse the 5 existing accent color presets (PresetWhite, PresetAmber, PresetIce, PresetGreen, PresetPink already defined in MainWindow.xaml.cs) — no new colors required.

**Implementation:** A static `ThemePresets` dictionary or array in `FuzzyClock.App`. Applying a theme calls the same setter methods the tray menu already calls (`SetAccentColor`, `SetOpacity`, `SetFontSize`, `SetDialMode`, `SetStatsVisible`). No new apply logic; just a bundled call sequence.

**"No theme selected" state:** After the user changes any individual setting post-theme-apply, no theme shows as selected. Themes are one-shot apply, not a persisted mode. This avoids tracking "current theme" in AppSettings.

---

### C. Battery Low Alert

**Behavior:** When `BatteryPercent < 20` AND `IsPluggedIn == false`, the battery stat row (bar + text) renders in red instead of the accent color. All other rows are unaffected.

**Threshold:** 20% matches the Windows default low-battery notification threshold. Users are trained to this value. No configuration needed.

**Red value:** Use `#FFFF4444` — a warm, slightly desaturated red. Pure `#FFFF0000` reads as "error/crash." `#FFFF4444` reads as "warning." This matches the visual language of battery indicators on other platforms.

**Implementation:** In the stat row color application path (`ApplyDisplayColor` / `UpdateStatsDisplay`), add a branch: if battery row AND `_statsService.BatteryPercent < 20f` AND `!_statsService.IsPluggedIn`, substitute the warning red brush for the accent brush on that row only.

**Auto-contrast interaction:** The auto-contrast system currently samples screen color and adjusts the accent color. The battery low red override is intentional and must not be adjusted by auto-contrast. The simplest guard: in `ApplyDisplayColor`, apply the battery override after auto-contrast color resolution, not before. The red replaces the final resolved accent color for that row.

---

### D. Phrase Styles (English Personalities)

**Architecture:** `PhraseEngine` gains a new overload parameter `string style = "Classic"`. Each style is a parallel static bucket array. `GetPhrase(DateTime dt, string language = "en", string style = "Classic")` routes to the appropriate array.

The existing Buckets array becomes the "Classic" style. The hour word arrays stay as-is.

**AppSettings additions:**

```csharp
public string PhraseLanguage { get; init; } = "auto";   // "auto"|"en"|"fr"|"es"|"de"|"ja"
public string PhraseStyle    { get; init; } = "Classic"; // "Classic"|"Terse"|"Poetic"|"Rude"
```

**`GetStructuredPhrase` for personality styles:** The split-layout logic (Qualifier/Emphasis) works by detecting `{h}` / `{h1}` at end of template. Poetic and Rude templates often have trailing text after the hour token ("almost {h1}, finally"). For these styles, return `("", fullPhrase)` from `GetStructuredPhrase` — collapses to single-block rendering. The split layout visual is optional for personality styles; the Classic-English split layout is unaffected.

---

#### Full Bucket Tables — English Styles

Bucket upper bounds (inclusive minute): 2, 7, 12, 17, 22, 27, 32, 37, 42, 47, 52, 59.
Special cases (applied before bucket lookup): noon → style-specific string, midnight → style-specific string.

**Classic (existing — unchanged):**

| Bucket (≤min) | Template |
|---------------|----------|
| 2 | `{h} o'clock` |
| 7 | `just after {h}` |
| 12 | `ten past {h}` |
| 17 | `a quarter past {h}` |
| 22 | `just after quarter past {h}` |
| 27 | `almost half past {h}` |
| 32 | `half past {h}` |
| 37 | `just past half past {h}` |
| 42 | `almost a quarter before {h1}` |
| 47 | `a quarter before {h1}` |
| 52 | `nearly {h1}` |
| 59 | `almost {h1}` |

Special: noon→`"noon"`, midnight→`"midnight"`

---

**Terse style** — minimal syllables; British-minimalist. The person who checks the time once and moves on:

| Bucket (≤min) | Template |
|---------------|----------|
| 2 | `{h} sharp` |
| 7 | `just gone {h}` |
| 12 | `ten past {h}` |
| 17 | `quarter past {h}` |
| 22 | `quarter past {h}` |
| 27 | `half {h}` |
| 32 | `half {h}` |
| 37 | `half {h}` |
| 42 | `quarter to {h1}` |
| 47 | `quarter to {h1}` |
| 52 | `nearly {h1}` |
| 59 | `{h1} soon` |

Special: noon→`"noon"`, midnight→`"midnight"`

Note: "half three" (bucket 27–37) is standard British English for 3:30. Terse deliberately collapses the 22/32/37 distinctions — precision is not the point. This is correct for the style.

---

**Poetic style** — lyrical, contemplative. The widget as ambient mood object:

| Bucket (≤min) | Template |
|---------------|----------|
| 2 | `the stroke of {h}` |
| 7 | `just past {h}` |
| 12 | `ten minutes into {h}` |
| 17 | `a quarter past {h}` |
| 22 | `past the quarter hour` |
| 27 | `nearing the half` |
| 32 | `the middle of {h}` |
| 37 | `the hour half spent` |
| 42 | `drawing near {h1}` |
| 47 | `a quarter to {h1}` |
| 52 | `nearly {h1}` |
| 59 | `moments before {h1}` |

Special: noon→`"high noon"`, midnight→`"the witching hour"`

Note: Buckets 22, 27, 32, 37 use hour-agnostic phrases ("past the quarter hour", "nearing the half", "the hour half spent"). These work for any hour and read as genuinely poetic. `GetStructuredPhrase` for these returns `("", fullPhrase)` since there is no `{h}` token in those templates.

---

**Rude style** — impatient, sarcastic. British passive-aggression as ambient clock:

| Bucket (≤min) | Template |
|---------------|----------|
| 2 | `{h} o'clock, obviously` |
| 7 | `just gone {h}, keep up` |
| 12 | `ten past {h}, do keep up` |
| 17 | `quarter past {h}, weren't you just here?` |
| 22 | `still only quarter past {h}` |
| 27 | `nearly half {h}, not that it matters` |
| 32 | `half {h}, yes, already` |
| 37 | `just gone half {h}, still` |
| 42 | `not quite quarter to {h1}` |
| 47 | `quarter to {h1}, move it` |
| 52 | `nearly {h1}, honestly` |
| 59 | `almost {h1}, finally` |

Special: noon→`"noon, in case you forgot"`, midnight→`"midnight, go to bed"`

---

### E. Multilingual Phrase Sets

**Language detection:** `CultureInfo.CurrentUICulture.TwoLetterISOLanguageName` is the correct property. It reflects the Windows display language (set in Settings → Time & Language → Language), not the keyboard layout or regional number/date format (`CurrentCulture`). If the detected language is not in the supported set, fall back to `"en"`.

**Architecture:** PhraseEngine routes on `language` parameter:
1. `"en"` (or `"auto"` resolved to English): use English style arrays, route on `style` parameter.
2. `"fr"`, `"es"`, `"de"`, `"ja"`: use the language-specific bucket array; ignore `style` parameter.
3. Each language has its own static bucket array and hour-word array.

**Hour-word arrays note:** Each language bakes the grammatical articles and suffixes into the hour-word array to keep templates clean. The `{h}` and `{h1}` tokens expand to full grammatically-correct noun phrases.

---

#### French (fr)

French time conventions:
- "et quart" = and a quarter; "et demie" = and a half; "moins le quart" = minus the quarter
- Hours: "une heure" (hour 1 is feminine "une"); "deux heures", "trois heures" etc. (all others take "heures")
- "midi" = noon; "minuit" = midnight

Hour-word array (bakes "heure(s)" in to keep templates simple):
`["", "une heure", "deux heures", "trois heures", "quatre heures", "cinq heures", "six heures", "sept heures", "huit heures", "neuf heures", "dix heures", "onze heures", "douze heures"]`

| Bucket (≤min) | Template (fr) | English gloss |
|---------------|---------------|---------------|
| 2 | `{h} pile` | {h} sharp |
| 7 | `un peu après {h}` | a little after {h} |
| 12 | `{h} dix` | ten past {h} |
| 17 | `{h} et quart` | quarter past {h} |
| 22 | `juste après le quart` | just after the quarter |
| 27 | `presque {h} et demie` | almost half past {h} |
| 32 | `{h} et demie` | half past {h} |
| 37 | `un peu après {h} et demie` | just past half past {h} |
| 42 | `presque {h1} moins le quart` | almost quarter to {h1} |
| 47 | `{h1} moins le quart` | quarter to {h1} |
| 52 | `bientôt {h1}` | nearly {h1} |
| 59 | `presque {h1}` | almost {h1} |

Special: noon→`"midi"`, midnight→`"minuit"`

---

#### Spanish (es)

Spanish time conventions:
- "en punto" = o'clock; "y cuarto" = quarter past; "y media" = half past; "menos cuarto" = quarter to
- "la una" for hour 1 (feminine singular); "las dos", "las tres"... for hours 2–12 (feminine plural)
- "mediodía" = noon; "medianoche" = midnight

Hour-word array (bakes article in):
`["", "la una", "las dos", "las tres", "las cuatro", "las cinco", "las seis", "las siete", "las ocho", "las nueve", "las diez", "las once", "las doce"]`

| Bucket (≤min) | Template (es) | English gloss |
|---------------|---------------|---------------|
| 2 | `{h} en punto` | {h} o'clock |
| 7 | `un poco después de {h}` | a little after {h} |
| 12 | `{h} y diez` | ten past {h} |
| 17 | `{h} y cuarto` | quarter past {h} |
| 22 | `{h} y veinte` | twenty past {h} |
| 27 | `casi {h} y media` | almost half past {h} |
| 32 | `{h} y media` | half past {h} |
| 37 | `pasada la media` | just past half past |
| 42 | `casi {h1} menos cuarto` | almost quarter to {h1} |
| 47 | `{h1} menos cuarto` | quarter to {h1} |
| 52 | `casi {h1}` | nearly {h1} |
| 59 | `falta poco para {h1}` | almost {h1} |

Special: noon→`"mediodía"`, midnight→`"medianoche"`

---

#### German (de)

German time conventions:
- CRITICAL: "halb {h1}" means HALF BEFORE the next hour. "halb drei" = 2:30 (not 3:30). This is opposite to English "half past."
- "kurz nach" = just after; "kurz vor" = just before; "gleich" = almost (imminent)
- "Viertel nach" = quarter past; "dreiviertel {h1}" = three-quarters (= quarter to in English)
- "dreiviertel" is standard in eastern Germany and Austria; "Viertel vor" is western/Swiss. Use dreiviertel — more distinctive.
- "Mittag" = noon; "Mitternacht" = midnight

Hour-word array (bare cardinals; "Uhr" is in the bucket template for the o'clock case):
`["", "eins", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun", "zehn", "elf", "zwölf"]`

Note: "eins Uhr" is grammatically acceptable in colloquial German for 1 o'clock. If this sounds wrong in testing, the alternative is a special-case for hour 1: "ein Uhr" (using a separate first-slot override).

| Bucket (≤min) | Template (de) | English gloss |
|---------------|---------------|---------------|
| 2 | `{h} Uhr` | {h} o'clock |
| 7 | `kurz nach {h}` | just after {h} |
| 12 | `zehn nach {h}` | ten past {h} |
| 17 | `Viertel nach {h}` | quarter past {h} |
| 22 | `kurz nach Viertel {h1}` | just past quarter to {h1} |
| 27 | `kurz vor halb {h1}` | just before half (to {h1}) |
| 32 | `halb {h1}` | half before {h1} (= :30) |
| 37 | `kurz nach halb {h1}` | just after half |
| 42 | `kurz vor dreiviertel {h1}` | almost three-quarters (= almost quarter to) |
| 47 | `dreiviertel {h1}` | three-quarters (= quarter to {h1}) |
| 52 | `kurz vor {h1}` | nearly {h1} |
| 59 | `gleich {h1}` | almost {h1} |

Special: noon→`"Mittag"`, midnight→`"Mitternacht"`

CRITICAL IMPLEMENTATION NOTE: Buckets 22–47 use `{h1}` (next hour), not `{h}`. "halb drei" is produced when the current hour is 2 and `{h1}` = "drei". This is the opposite token from English for those buckets. Verify the template-to-token mapping carefully in tests.

---

#### Japanese (ja)

Japanese time conventions:
- Standard spoken time: "{h}時{m}分" ("[hour] ji [minute] fun/pun")
- Approximate time uses "ごろ" (goro = approximately/around)
- "ちょうど {h}時" = exactly {h} o'clock
- "正午" (shōgo) = noon; "真夜中" (mayonaka) = midnight
- "{h}時半" = half past {h} (literally "{h} hours half") — "半" (han) means half

Hour-word array: Use Arabic numerals — this is natural in Japanese casual writing and avoids rare kanji rendering issues in non-Japanese fonts.
`["", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]`

Templates include the kanji "時" directly: `"ちょうど{h}時"` → `"ちょうど3時"`. This is clean and correct.

| Bucket (≤min) | Template (ja) | English gloss |
|---------------|---------------|---------------|
| 2 | `ちょうど{h}時` | exactly {h} o'clock |
| 7 | `{h}時を少し過ぎた` | just past {h} |
| 12 | `{h}時10分ごろ` | around 10 past {h} |
| 17 | `{h}時15分ごろ` | around quarter past {h} |
| 22 | `{h}時15分を過ぎた` | past quarter past {h} |
| 27 | `もうすぐ{h}時半` | almost half past {h} |
| 32 | `{h}時半ごろ` | around half past {h} |
| 37 | `{h}時半を過ぎた` | just past half {h} |
| 42 | `もうすぐ{h1}時15分前` | almost quarter to {h1} |
| 47 | `{h1}時15分前ごろ` | around quarter to {h1} |
| 52 | `もうすぐ{h1}時` | nearly {h1} |
| 59 | `あと少しで{h1}時` | almost {h1} |

Special: noon→`"正午"`, midnight→`"真夜中"`

Font note: WPF's default font stack (`Segoe UI` → system fallback) includes `Meiryo` or `Yu Gothic` on Windows 10/11. Japanese characters render correctly without any special font configuration. No action needed.

Confidence note: Japanese temporal phrasing has some regional/register variation. The templates above use standard casual written Japanese. The Arabic numeral + 時 pattern is conservative and correct across all regions. MEDIUM confidence on exact phrasing naturalness; HIGH confidence on correctness.

---

### F. PhraseEngine Architecture — Routing Summary

```csharp
// Revised signatures (backwards compatible with default params):
public static string GetPhrase(DateTime dt, string language = "en", string style = "Classic")
public static (string Qualifier, string Emphasis) GetStructuredPhrase(DateTime dt, string language = "en", string style = "Classic")
```

Routing logic:
1. Resolve special cases first (noon, midnight) — each language has its own noon/midnight strings.
2. If `language != "en"`: route to language-specific bucket + hour-word array; ignore `style`.
3. If `language == "en"`: route to style-specific bucket array (Classic/Terse/Poetic/Rude); use English hour words.

`GetStructuredPhrase` rules:
- Classic English: existing logic (split on {h}/{h1} position).
- Terse English: most templates end with hour token; existing split logic works. Exception: `"{h1} soon"` — return `("", fullPhrase)`.
- Poetic/Rude English: templates often have trailing text; return `("", fullPhrase)` for all. The split layout is a Classic-English feature.
- All non-English: return `("", fullPhrase)`.

---

## Competitor Feature Analysis

| Feature | Rainmeter / other clock widgets | Our Approach |
|---------|-------------------------------------|--------------|
| Settings UI | Config file (.ini) or clunky dialog | Tabbed WPF window with grouped sections |
| Themes | Skin files / manual config edit | 5 named presets applied one-shot via existing setter paths |
| Multilingual | English-only for almost all fuzzy clocks | Native phrase sets per language, not translation |
| Battery alert | OS taskbar indicator only | Inline row color shift — ambient, non-disruptive |
| Phrase personality | Not a concept in other widgets | Terse/Poetic/Rude English vocabularies — unique differentiator |

---

## Sources

- `FuzzyClock.Core/PhraseEngine.cs` — direct codebase inspection (HIGH confidence)
- `FuzzyClock.App/AppSettings.cs`, `TrayMenuBuilder.cs`, `MainWindow.xaml.cs` — direct codebase inspection (HIGH confidence)
- French time grammar (l'heure): standard French language reference (HIGH confidence)
- Spanish time grammar (la hora): standard Spanish language reference (HIGH confidence)
- German time conventions (halb, dreiviertel): established German time idiom; "halb drei" = 2:30 is a well-known feature (HIGH confidence)
- Japanese time conventions: standard casual Japanese; Arabic numeral + 時 approach is conservative (MEDIUM confidence on naturalness)
- WPF Window/TabControl patterns: standard WPF .NET 10 knowledge (HIGH confidence)
- Battery low alert 20% threshold: Windows default low-battery notification level (HIGH confidence)

---

*Feature research for: FuzzyStatsClock v3.2 — settings window, themes, battery alert, phrase styles, multilingual*
*Researched: 2026-03-08*
