# Architecture Patterns

**Project:** FuzzyClock v3.9 - LCD Clock + Japanese Styles
**Researched:** 2026-03-23
**Confidence:** HIGH - derived entirely from direct source audit of the production codebase

---

## Existing Architecture Baseline

The widget is a single WPF `MainWindow` (WinExe, `SizeToContent=WidthAndHeight`, transparent
frameless, `Topmost=True`). A vertical inner `Grid` contains three rows: Row 0 = the clock
display area (phrase/dial/LCD/Nixie all stacked in the same cell, mutually exclusive by
`Visibility`), Row 1 = date `TextBlock`, Row 2 = stats `StackPanel`. `BackdropBorder` wraps the
entire widget for hover backdrop.

### Phrase/Provider System

```
PhraseEngine (static facade)
  _providers: Dictionary<string, IPhraseProvider>
    "en-classic"     -> EnglishPhraseProvider
    "en-terse"       -> TersePhraseProvider
    "en-poetic"      -> PoeticPhraseProvider
    "en-rude"        -> RudePhraseProvider
    "en-pirate"      -> PiratePhraseProvider
    "en-dwarf"       -> DwarfPhraseProvider
    "en-jive"        -> JivePhraseProvider
    "en-valleygirl"  -> ValleyGirlPhraseProvider
    "en-yoda"        -> YodaPhraseProvider
    "en-shakespeare" -> ShakespearePhraseProvider
    "fr"             -> FrenchPhraseProvider
    "es"             -> SpanishPhraseProvider
    "de"             -> GermanPhraseProvider
    "ja"             -> JapanesePhraseProvider   (Classic only; all styles route here today)
    "pl"             -> PolishPhraseProvider
  _activeProvider: IPhraseProvider   (default = _providers["en-classic"])
  CurrentLocale: string              (tracks active key)
```

`PhraseEngine.SetLocale(key)` swaps `_activeProvider` by exact dictionary key. The routing
logic in `MainWindow.SetLanguage()` and `ApplySettings()` maps `(locale, style)` to a provider
key. For English the compound key form is `"en-{style}"`. For all non-English locales today the
key is a bare two-letter code (`"ja"`, `"fr"`, etc.) with no style suffix - all phrase style
settings are silently ignored when a non-English locale is active.

### Clock Type Switching

`ClockType` enum: `Phrase | Dial | Lcd | Nixie`. The enum was established in v3.7. `AppSettings`
already stores `LcdUse24Hr`, `LcdShowSeconds`, `LcdStyle`, and `LcdSize`. The `SetClockType()` /
`ApplySettings()` branching in `MainWindow` already handles all four enum values including `Lcd`.
`LcdView` (a `LcdClockView` UserControl) is already declared in `MainWindow.xaml` Row 0, collapsed
by default.

---

## Component Map: New vs Modified vs Unchanged

### Already Complete (confirmed in current codebase)

| Component | Location | Verified State |
|-----------|----------|---------------|
| `ClockType.Lcd` enum value | `ClockType.cs` | Complete |
| `LcdSize` enum + `LcdSizeMap` | `LcdSize.cs` | Complete |
| `AppSettings` LCD fields | `AppSettings.cs` | `LcdUse24Hr`, `LcdShowSeconds`, `LcdStyle`, `LcdSize` all present |
| `SettingsSnapshot` LCD fields | `SettingsSnapshot.cs` | All four fields present |
| `LcdTimeFormatHelper` | `LcdTimeFormatHelper.cs` | Complete (12hr/24hr, with/without seconds) |
| `SevenSegmentEncoder` | `FuzzyClock.Core/SevenSegmentEncoder.cs` | Complete (digits 0-9, colon, space) |
| `SevenSegmentDigit` UserControl | `Controls/SevenSegmentDigit.xaml.cs` | Complete (Classic/Bold geometry, ghost color, SegmentHeight DP) |
| `LcdClockView` UserControl | `Controls/LcdClockView.xaml.cs` | Complete (own 1s DispatcherTimer, DPs for Use24Hr/ShowSeconds/LitColor/BgColor/GhostColor/Size/SegmentStyle) |
| `LcdView` element in `MainWindow.xaml` | Row 0 inner Grid, line 110 | Declared, `Visibility="Collapsed"` |
| `MainWindow.SetClockType(Lcd)` branch | `MainWindow.xaml.cs` line 1308 | Complete (`ApplyLcdColors()`, sets DPs, sets `Visibility`) |
| `MainWindow.ApplyLcdColors()` | `MainWindow.xaml.cs` line 1689 | Complete (Dark/Paper/Silver style logic) |
| `MainWindow.ApplySettings()` LCD branch | `MainWindow.xaml.cs` line 262 | Complete (startup restore) |
| `MainWindow.SaveSettings()` LCD fields | `MainWindow.xaml.cs` line 558 | Complete |
| `SettingsWindow` LCD events declared | `SettingsWindow.xaml.cs` line 27 | `LcdUse24HrChanged`, `LcdShowSecondsChanged`, `LcdStyleChanged` declared |
| `MainWindow.OpenSettings()` LCD handlers | Lines 460-477 | Complete (all three LCD events subscribed and handled) |
| `MainWindow` phrase timer skips LCD/Nixie | `ContentRendered` lambda, line 112 | `_clockType != ClockType.Lcd && _clockType != ClockType.Nixie` guard in place |

### Still Needed for LCD

| Component | Type | Location |
|-----------|------|----------|
| `BtnLcd` button in Clock Style rail | XAML addition | `SettingsWindow.xaml` |
| `BtnLcd_Click` handler | Code addition | `SettingsWindow.xaml.cs` |
| `SetClockStyleButtonStates` Lcd case | Code modification | `SettingsWindow.xaml.cs` |
| LCD settings panel (24hr/seconds/style controls) | XAML addition + code | `SettingsWindow.xaml`, `SettingsWindow.xaml.cs` |
| `PopulateControls` LCD controls population | Code modification | `SettingsWindow.xaml.cs` |
| Blinking colon toggle in `LcdClockView` | Code modification | `Controls/LcdClockView.xaml.cs` |

### Still Needed for Japanese Styles

| Component | Type | Location |
|-----------|------|----------|
| `JapaneseTersePhraseProvider` | New class | `FuzzyClock.Core/` |
| `JapanesePoeticPhraseProvider` | New class | `FuzzyClock.Core/` |
| `JapaneseRudePhraseProvider` | New class | `FuzzyClock.Core/` |
| `PhraseEngine` registry `ja-terse`, `ja-poetic`, `ja-rude` | Registry addition | `FuzzyClock.Core/PhraseEngine.cs` |
| Routing logic for `ja-{style}` in `ApplySettings()` | Logic modification | `MainWindow.xaml.cs` |
| Routing logic for `ja-{style}` in `SetLanguage()` | Logic modification | `MainWindow.xaml.cs` |
| `SetPhraseStyle()` guard expansion | Logic modification | `MainWindow.xaml.cs` |
| `CmbPhraseStyle` enable/disable gating for Japanese | Logic modification | `SettingsWindow.xaml.cs` |

---

## Question 1: LCD Clock Integration with ClockType Switching

### The existing switching path (no changes needed here)

1. `SettingsWindow` fires `ClockTypeChanged(ClockType.Lcd)`
2. `MainWindow.SetClockType(Lcd)` collapses all four display elements, calls `ApplyLcdColors()`,
   sets `LcdView.Use24Hr`, `LcdView.ShowSeconds`, `LcdView.Size`, then sets `LcdView.Visibility = Visible`
3. `LcdClockView.IsVisibleChanged` fires; the view starts its own `DispatcherTimer(1s)` and calls
   `UpdateTime()` immediately for the first frame
4. `SaveSettings()` persists `ClockType.Lcd`

The `MainWindow` 10-second phrase timer already skips its update branch when
`_clockType == ClockType.Lcd`, so no phrase updates fire while LCD is active. This is correct.

### What the SettingsWindow is missing

**BtnLcd in the Clock Style rail.** The XAML rail currently has three buttons: `BtnPhrase`,
`BtnDial`, `BtnNixie`. A fourth `BtnLcd` must be added to the same `StackPanel`. It fires
`ClockTypeChanged?.Invoke(ClockType.Lcd)` and follows the `SegmentButtonStyle` visual pattern.

`SetClockStyleButtonStates(ClockType ct)` must be extended:

```csharp
BtnLcd.Tag = ct == ClockType.Lcd ? "selected" : null;
```

**LCD settings panel.** The Appearance tab needs a visibility-gated section (same `DialFaceLabel`/
`DialFacePanel` pattern from v3.8) that collapses when clock style is not Lcd. It contains:
- 12hr / 24hr CheckBox wired to `LcdUse24HrChanged`
- Seconds row CheckBox wired to `LcdShowSecondsChanged`
- Style ComboBox (Dark / Paper / Silver) wired to `LcdStyleChanged`

Visibility gating belongs in `SetClockStyleButtonStates()`:

```csharp
var lcdVis = ct == ClockType.Lcd ? Visibility.Visible : Visibility.Collapsed;
LcdSettingsLabel.Visibility = lcdVis;
LcdSettingsPanel.Visibility = lcdVis;
```

`PopulateControls` must populate these under `_suppressEvents` using `SettingsSnapshot.LcdUse24Hr`,
`LcdShowSeconds`, and `LcdStyle`.

### Per-second timer

`LcdClockView` owns its own `DispatcherTimer(1s)` that self-starts via `IsVisibleChanged`. This
is the identical pattern to `NixieClockView`. `MainWindow` does not manage this timer. No new
timer code is needed anywhere in `MainWindow`.

### Blinking colon

The colon currently displays permanently as `':'`. Blinking requires a `bool _colonVisible` field
in `LcdClockView`, flipped on each `_timer.Tick`. The tick replaces the static colon assignment
with a conditional:

```csharp
_colonVisible = !_colonVisible;
Colon1.Character = _colonVisible ? ':' : ' ';
if (ShowSeconds) Colon2.Character = _colonVisible ? ':' : ' ';
```

`SevenSegmentEncoder.Encode(' ')` returns `0x00` (all segments off) - blank colon is already
supported. No Core changes are needed.

### AccentColor propagation

`ApplyLcdColors()` already reads `_accentColor` for the "Dark" style and passes it to
`LcdView.LitColor`. `SetAccentColor()` calls `ApplyLcdColors()` unconditionally. The accent
color path for LCD is closed - no new wiring needed.

### LCD component boundary summary

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `SevenSegmentEncoder` (Core) | Char to 7-segment bitmask | `SevenSegmentDigit.UpdateSegments()` |
| `LcdTimeFormatHelper` (App) | `DateTime` to display string (12hr/24hr, w/wo seconds) | `LcdClockView.UpdateTime()` |
| `SevenSegmentDigit` (UserControl) | WPF polygon geometry for one digit or colon | `LcdClockView` via XAML + `AllDigits()` |
| `LcdClockView` (UserControl) | Compose digits, own 1s timer, blinking colon, expose DPs | `MainWindow` sets DPs; `ApplyLcdColors()` sets color DPs |
| `MainWindow` | Switch visibility; route settings to DPs; propagate accent color | `LcdClockView` via DPs; `SettingsWindow` via event subscriptions |
| `SettingsWindow` | Fire `LcdUse24HrChanged`, `LcdShowSecondsChanged`, `LcdStyleChanged` | `MainWindow.OpenSettings()` handlers |

---

## Question 2: Japanese Style Routing in IPhraseProvider/PhraseEngine

### Current state

`PhraseEngine` has one Japanese entry: `["ja"] = new JapanesePhraseProvider()`. There is no
style suffix. The `SetLanguage()` routing treats `"ja"` identically to `"fr"`, `"es"`, `"de"`,
`"pl"` - it maps the bare locale code directly as the provider key, ignoring `_currentPhraseStyle`.

`SettingsWindow.PopulateControls` disables `CmbPhraseStyle` when the locale is `"ja"` or any
other non-English code. This prevents phrase style changes from having any effect.

`SetPhraseStyle()` in `MainWindow` has an early-return guard:

```csharp
if (!PhraseEngine.CurrentLocale.StartsWith("en-", StringComparison.Ordinal))
    return;
```

This guard blocks all style changes when `CurrentLocale` is `"ja"`.

### Step 1 - New provider classes in FuzzyClock.Core

Add three new classes following the identical structure of `JapanesePhraseProvider`:

- `JapaneseTersePhraseProvider : IPhraseProvider`
- `JapanesePoeticPhraseProvider : IPhraseProvider`
- `JapaneseRudePhraseProvider : IPhraseProvider`

Each implements all three `IPhraseProvider` methods. The 12-bucket `(UpperBound, Template)[]`
array is unique per style; the `HourWords[]` array is identical across all four Japanese providers.
`GetSegmentKey(DateTime dt) => GetPhrase(dt)` is the correct pattern, already used in the
existing `JapanesePhraseProvider`.

### Step 2 - PhraseEngine registry additions

Add four entries; keep the existing `"ja"` entry unchanged for backward compatibility with the
auto-detect path (`uiLang == "ja"` routes to `"ja"`):

```csharp
["ja"]         = new JapanesePhraseProvider(),      // unchanged - auto-detect fallback
["ja-classic"] = new JapanesePhraseProvider(),      // alias for explicit classic selection
["ja-terse"]   = new JapaneseTersePhraseProvider(),
["ja-poetic"]  = new JapanesePoeticPhraseProvider(),
["ja-rude"]    = new JapaneseRudePhraseProvider(),
```

Keeping `"ja"` as-is ensures that `uiLang == "ja"` auto-detect continues to resolve without any
change to the auto-detect branch. The `"ja-classic"` alias allows clean symmetric routing in the
explicit-style case.

### Step 3 - Routing logic changes

Three locations in `MainWindow.xaml.cs` contain the locale-to-provider-key routing switch. All
three must be updated identically. The current block treating `"ja"` the same as other
non-English locales:

```csharp
if (locale is "fr" or "es" or "de" or "ja" or "pl")
    effectiveLocale = locale;
```

must expand to apply the style suffix when locale is `"ja"`:

```csharp
if (locale == "ja")
{
    effectiveLocale = _currentPhraseStyle.ToLowerInvariant() switch
    {
        "terse"  => "ja-terse",
        "poetic" => "ja-poetic",
        "rude"   => "ja-rude",
        _        => "ja",   // "Classic" or unrecognized
    };
}
else if (locale is "fr" or "es" or "de" or "pl")
{
    effectiveLocale = locale;   // other languages have no style variants
}
```

The three locations where this change is needed:
1. `ApplySettings()` - startup restore path (around line 332)
2. `SetLanguage()` - runtime language change (around line 1403)
3. `SetPhraseStyle()` - runtime style change for Japanese (not currently reached due to guard;
   the guard removal in Step 4 opens this path)

Because this logic is duplicated three times, extract a private helper
`ResolveLocaleKey(string locale, string phraseStyle)` called from all three sites:

```csharp
private static string ResolveLocaleKey(string locale, string phraseStyle) =>
    locale switch
    {
        "ja" => phraseStyle.ToLowerInvariant() switch
        {
            "terse"  => "ja-terse",
            "poetic" => "ja-poetic",
            "rude"   => "ja-rude",
            _        => "ja",
        },
        "en" => phraseStyle.ToLowerInvariant() switch
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
        },
        "fr" or "es" or "de" or "pl" => locale,
        _ => "en-classic",   // "auto" is handled before calling this helper
    };
```

This eliminates the current code duplication and makes adding future non-English style variants
a one-line change.

### Step 4 - SetPhraseStyle guard expansion

The current guard in `SetPhraseStyle()`:

```csharp
if (!PhraseEngine.CurrentLocale.StartsWith("en-", StringComparison.Ordinal))
    return;
```

must be expanded to also pass through when `CurrentLocale` is a Japanese key:

```csharp
bool isEnglish  = PhraseEngine.CurrentLocale.StartsWith("en-", StringComparison.Ordinal)
                  || PhraseEngine.CurrentLocale == "en";
bool isJapanese = PhraseEngine.CurrentLocale.StartsWith("ja", StringComparison.Ordinal);
if (!isEnglish && !isJapanese)
    return;
```

After the guard passes, the locale-key derivation calls `ResolveLocaleKey(_currentPhraseLocale, style)`.

### Step 5 - SettingsWindow style selector gating

`CmbPhraseStyle` is currently disabled for `"ja"` locale. With Japanese style variants added,
the selector must be re-enabled for Japanese. The four options (Classic/Terse/Poetic/Rude) apply
equally to English and Japanese; the routing logic handles the provider key difference.

In `PopulateControls`:

```csharp
// Current: disables for ja/fr/es/de/pl
bool isNonEnglish = nonEnglishActive || (s.PhraseLocale is "fr" or "es" or "de" or "ja" or "pl");
CmbPhraseStyle.IsEnabled = !isNonEnglish;

// Replacement: re-enables for ja (has style variants)
bool styleDisabled = s.PhraseLocale is "fr" or "es" or "de" or "pl"
    || (s.PhraseLocale == "auto" && nonEnglishActive
        && System.Globalization.CultureInfo.CurrentUICulture.TwoLetterISOLanguageName != "ja");
CmbPhraseStyle.IsEnabled = !styleDisabled;
```

In `CmbPhraseLanguage_SelectionChanged`:

```csharp
// Current: "ja" in disabled set
bool isNonEnglish = locale is "fr" or "es" or "de" or "ja" or "pl";

// Replacement: "ja" removed from disabled set
bool isNonEnglish = locale is "fr" or "es" or "de" or "pl";
CmbPhraseStyle.IsEnabled = !isNonEnglish;
```

### Data flow - Japanese style change at runtime

```
User selects "Terse" in CmbPhraseStyle while PhraseLocale = "ja"
    -> CmbPhraseStyle_SelectionChanged (_suppressEvents is false)
    -> PhraseStyleChanged?.Invoke("Terse")
    -> MainWindow.SetPhraseStyle("Terse")
        guard: CurrentLocale starts with "ja" -> passes
        _currentPhraseStyle = "Terse"
        localeKey = ResolveLocaleKey("ja", "Terse") -> "ja-terse"
        PhraseEngine.SetLocale("ja-terse")
        _currentRawPhrase = ""   (invalidate cache)
        _lastSegmentKey   = ""
        UpdatePhraseIfChanged()  -> new phrase rendered
        SaveSettings()           -> PhraseStyle="Terse" persisted
```

On restart, `ApplySettings()` reads `PhraseLocale="ja"` and `PhraseStyle="Terse"`, calls
`ResolveLocaleKey("ja", "Terse")` -> `"ja-terse"`, and calls `PhraseEngine.SetLocale("ja-terse")`.

---

## Component Boundaries - Full v3.9 Picture

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `FuzzyClock.Core` (pure library) | Phrase providers, segment encoding, formatting - zero WPF deps | No WPF references |
| `JapaneseXxxPhraseProvider` (Core) | Style-specific Japanese phrase buckets | `PhraseEngine` registry |
| `PhraseEngine` (Core static facade) | Route locale key to active provider | `MainWindow.ApplySettings()`, `SetLanguage()`, `SetPhraseStyle()` |
| `SevenSegmentEncoder` (Core) | Char to 7-segment bitmask | `SevenSegmentDigit.UpdateSegments()` |
| `LcdClockView` (App UserControl) | Digit display, own 1s timer, blinking colon, expose DPs | `MainWindow` sets DPs; `IsVisibleChanged` auto-manages timer |
| `SevenSegmentDigit` (App UserControl) | WPF polygon geometry per digit | `LcdClockView` |
| `AppSettings` (App record) | Persist all settings including LCD fields, `PhraseStyle`, `PhraseLocale` | `SettingsService`, `MainWindow.SaveSettings()` |
| `SettingsSnapshot` (App record) | Immutable open-time snapshot | `SettingsWindow` constructor |
| `SettingsWindow` (App window) | Fire per-setting events; LCD panel visibility-gated; style combo enabled for en+ja | `MainWindow.OpenSettings()` handlers |
| `MainWindow` (App window) | Source of truth for all runtime state; routes events to Core/XAML/services | All components |

---

## Recommended Build Order

### 1. Japanese provider classes - first (no dependencies)

`JapaneseTersePhraseProvider`, `JapanesePoeticPhraseProvider`, `JapaneseRudePhraseProvider` are
pure Core classes. They depend on nothing new and can be written, reviewed, and unit-tested
completely before any other step. Tests follow the exhaustive bucket pattern of
`MultilingualPhraseProviderTests` - every time bucket for every provider must pass.

### 2. PhraseEngine registry + ResolveLocaleKey extraction - second (depends on Step 1)

Register `ja-classic`, `ja-terse`, `ja-poetic`, `ja-rude` in `PhraseEngine._providers`. Extract
`ResolveLocaleKey()` helper to replace the three duplicated switch blocks in `MainWindow`. Update
`ApplySettings()`, `SetLanguage()`, and `SetPhraseStyle()` to call the helper. Update the
`SetPhraseStyle()` guard. Add coordinator tests for `ja-*` locale round-trips.

### 3. SettingsWindow LCD UI + Japanese style gating - third (depends on Step 2 for style logic)

Add `BtnLcd` to the Clock Style rail. Add the LCD settings panel. Extend
`SetClockStyleButtonStates()`. Update `PopulateControls()` for LCD controls and for the revised
`CmbPhraseStyle` enable/disable logic. Wire `BtnLcd_Click` and LCD control event handlers. The
LCD events are already declared and subscribed in `MainWindow.OpenSettings()` - only the XAML
controls and `PopulateControls` population are missing.

### 4. LcdClockView blinking colon - fourth (self-contained)

Add `bool _colonVisible` field, toggle it in `_timer.Tick`, and apply it conditionally to
`Colon1` and `Colon2`. No other file changes required. Can be done in parallel with Step 3 or
after.

### Build order rationale

- Steps 1 and 2 are pure Core work with no UI surface - they compile and test independently
  before any UI work touches them.
- Step 3 is safe the moment Step 2's `ResolveLocaleKey` helper is confirmed correct, because the
  SettingsWindow changes rely on the routing logic being stable.
- Step 4 is fully isolated to a single UserControl file and carries no risk to other steps.
- No settings migration is required: all `AppSettings` LCD fields and `PhraseStyle`/`PhraseLocale`
  fields already exist and serialize/deserialize correctly.

---

## File Change Map

```
Step 1 - Japanese providers (FuzzyClock.Core):
  ADD FuzzyClock.Core/JapaneseTersePhraseProvider.cs
  ADD FuzzyClock.Core/JapanesePoeticPhraseProvider.cs
  ADD FuzzyClock.Core/JapaneseRudePhraseProvider.cs
  ADD FuzzyClock.Core.Tests/* (new test cases)

Step 2 - Registry + routing (FuzzyClock.Core + FuzzyClock.App):
  MODIFY FuzzyClock.Core/PhraseEngine.cs
      ADD ["ja-classic"], ["ja-terse"], ["ja-poetic"], ["ja-rude"] entries
  MODIFY FuzzyClock.App/MainWindow.xaml.cs
      ADD ResolveLocaleKey() private helper
      UPDATE ApplySettings() Japanese routing block
      UPDATE SetLanguage() Japanese routing block
      UPDATE SetPhraseStyle() guard + locale-key derivation
  ADD FuzzyClock.Core.Tests/* (PhraseEngineCoordinatorTests ja-* round-trips)

Step 3 - SettingsWindow LCD UI + style gating (FuzzyClock.App):
  MODIFY FuzzyClock.App/SettingsWindow.xaml
      ADD BtnLcd to Clock Style rail StackPanel
      ADD LCD settings panel (LcdSettingsLabel + LcdSettingsPanel with CheckBoxes + ComboBox)
  MODIFY FuzzyClock.App/SettingsWindow.xaml.cs
      UPDATE SetClockStyleButtonStates(): add BtnLcd.Tag + LcdSettingsLabel/Panel visibility
      UPDATE PopulateControls(): populate LCD controls + revised CmbPhraseStyle enable logic
      ADD BtnLcd_Click handler
      ADD LCD control event handlers
      UPDATE CmbPhraseLanguage_SelectionChanged: remove "ja" from disabled set

Step 4 - Blinking colon (FuzzyClock.App):
  MODIFY FuzzyClock.App/Controls/LcdClockView.xaml.cs
      ADD _colonVisible field
      UPDATE _timer.Tick handler to toggle colon

NOT MODIFIED (already complete):
  FuzzyClock.App/ClockType.cs
  FuzzyClock.App/AppSettings.cs               (LCD fields already present)
  FuzzyClock.App/SettingsSnapshot.cs          (LCD fields already present)
  FuzzyClock.App/LcdSize.cs
  FuzzyClock.App/LcdTimeFormatHelper.cs
  FuzzyClock.App/MainWindow.xaml              (LcdView element already declared)
  FuzzyClock.App/MainWindow.xaml.cs           (SetClockType/ApplySettings/SaveSettings LCD branches complete)
  FuzzyClock.Core/JapanesePhraseProvider.cs   (kept as-is; "ja" key preserved)
  FuzzyClock.Core/SevenSegmentEncoder.cs
  FuzzyClock.App/Controls/SevenSegmentDigit.xaml.cs
  FuzzyClock.App/Controls/LcdClockView.xaml   (no structural XAML changes needed)
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Adding a second timer to MainWindow for LCD

**What:** Adding a new `DispatcherTimer(1s)` to `MainWindow` to call `LcdView.UpdateTime()`.

**Why bad:** `LcdClockView` already owns its own 1s `DispatcherTimer` that auto-starts via
`IsVisibleChanged`. A second timer in `MainWindow` would double-tick the display and create
ownership confusion over the update cadence.

**Instead:** `LcdClockView` self-manages its timer. `MainWindow` only sets DPs and visibility.

### Anti-Pattern 2: Routing all Japanese styles through a disabled CmbPhraseStyle

**What:** Keeping `CmbPhraseStyle.IsEnabled = false` for Japanese locale and adding a separate
per-language style control.

**Why bad:** Diverges from the clean locale+style orthogonality the system already has for English.
Creates two style-selection paths and doubles the event wiring surface.

**Instead:** Re-enable `CmbPhraseStyle` for `"ja"` locale. The four options (Classic/Terse/Poetic/
Rude) map symmetrically to `ja-*` keys. `ResolveLocaleKey()` handles the routing.

### Anti-Pattern 3: Partially updating the routing duplication

**What:** Updating `SetLanguage()` for Japanese but leaving the duplicate switch in `ApplySettings()`
and `SetPhraseStyle()` unchanged.

**Why bad:** On app restart, `ApplySettings()` still routes `ja` to Classic regardless of the
persisted `PhraseStyle`. The widget displays Classic Japanese after restart even though the user
selected Terse.

**Instead:** Update all three routing sites in the same commit. Extract `ResolveLocaleKey()` to
make the triple-site pattern impossible to miss.

### Anti-Pattern 4: Blinking colon on Colon2 when ShowSeconds is false

**What:** Applying the blink toggle to `Colon2.Character` unconditionally in the tick handler.

**Why bad:** `Colon2` has `Visibility.Collapsed` when `ShowSeconds = false`. Writing its
`Character` when collapsed is harmless but indicates the blink logic is not accounting for
visibility state. If visibility is toggled while the colon is in the blank phase it could
appear stuck.

**Instead:** Guard: `if (ShowSeconds) Colon2.Character = _colonVisible ? ':' : ' ';`

### Anti-Pattern 5: Renaming JapanesePhraseProvider

**What:** Renaming the existing class to `JapaneseClassicPhraseProvider` for naming symmetry.

**Why bad:** The registry key `"ja"` must remain pointing to the same provider for the auto-detect
path (`uiLang == "ja"`). Renaming would require a refactor that risks a build break with no
behavioral benefit.

**Instead:** Keep `JapanesePhraseProvider` as-is. Add `"ja-classic"` as an alias in the registry
pointing to the same instance if symmetric naming is desired.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Japanese phrase content | Phrase naturalness requires native-speaker review (flagged in existing `JapanesePhraseProvider` source comment) | Mark as provisional; exhaustive bucket tests verify coverage regardless of phrase quality |
| `_suppressEvents` in PopulateControls | New LCD controls must be populated under the existing guard or spurious events fire on window open | Follow the exact `PopulateControls` pattern: set controls between `_suppressEvents = true` and `false` |
| `SetPhraseStyle` guard expansion | The guard uses `StartsWith("en-")` - expanding to cover `"ja"` must not accidentally pass through `"fr"`, `"de"`, `"es"`, `"pl"` | Use `StartsWith("ja", StringComparison.Ordinal)` - not a generic removal of the guard |
| `ResolveLocaleKey` extraction | Three copies of the routing switch exist in `MainWindow` - partial extraction leaves one copy stale and creates a restart regression | Extract all three call sites in the same commit |
| Blinking colon and ShowSeconds toggle | `OnVisualPropertyChanged` already calls `UpdateTime()` when `ShowSeconds` DP changes, so a blank-phase colon corrects within the same call | No extra handling needed - existing DP callback covers this |

---

## Sources

All findings are HIGH confidence - derived from direct source audit of the production codebase.
No external documentation or web search was performed.

| File audited | Key findings |
|-------------|-------------|
| `FuzzyClock.App/ClockType.cs` | `Lcd` enum value confirmed present |
| `FuzzyClock.App/AppSettings.cs` | All LCD fields present; `PhraseStyle`/`PhraseLocale` present |
| `FuzzyClock.App/SettingsSnapshot.cs` | All LCD fields present |
| `FuzzyClock.App/MainWindow.xaml` | `LcdView` element at line 110, `Visibility="Collapsed"` |
| `FuzzyClock.App/MainWindow.xaml.cs` | `SetClockType(Lcd)` at line 1308; `ApplyLcdColors()` at line 1689; `SetLanguage()` at line 1397; `SetPhraseStyle()` at line 1370; phrase timer guard at line 112; `OpenSettings()` LCD subscriptions at line 460 |
| `FuzzyClock.App/SettingsWindow.xaml` | 3-button Clock Style rail (Phrase/Dial/Nixie) confirmed; no BtnLcd |
| `FuzzyClock.App/SettingsWindow.xaml.cs` | LCD events declared at lines 27-29; `SetClockStyleButtonStates` has no Lcd case; `PopulateControls` has no LCD controls; `CmbPhraseLanguage_SelectionChanged` disables style for "ja" |
| `FuzzyClock.App/Controls/LcdClockView.xaml.cs` | Own 1s timer confirmed; colon blink not implemented |
| `FuzzyClock.App/Controls/SevenSegmentDigit.xaml.cs` | `' '` -> `0x00` (blank) path confirmed |
| `FuzzyClock.Core/PhraseEngine.cs` | `"ja"` -> `JapanesePhraseProvider()` only; no `ja-*` variants |
| `FuzzyClock.Core/JapanesePhraseProvider.cs` | 12-bucket structure; `GetSegmentKey` returns `GetPhrase(dt)` |
| `FuzzyClock.Core/IPhraseProvider.cs` | `GetPhrase`, `GetStructuredPhrase`, `GetSegmentKey` confirmed |

---

*Architecture research for: FuzzyClock v3.9 - LCD Clock + Japanese Styles*
*Researched: 2026-03-23*
