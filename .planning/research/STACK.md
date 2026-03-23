# Technology Stack

**Project:** FuzzyStatsClock v3.9 — LCD Clock + Japanese Styles
**Researched:** 2026-03-23
**Scope:** Net-new stack changes only for LCD 7-segment UI wiring, colon blink, and Japanese phrase style variants. The validated stack (C# WPF .NET 10, MSTest 4.0.1, System.Text.Json, DispatcherTimer, UseWindowsForms=true) is unchanged. Confidence: HIGH — all claims verified by direct source audit.

---

## What Already Exists (Do Not Re-Implement)

These items are complete and require only wiring or extension, not creation:

| Component | Location | State |
|-----------|----------|-------|
| `SevenSegmentDigit` UserControl | `FuzzyClock.App/Controls/SevenSegmentDigit.xaml(.cs)` | Complete — Polygon-based segments, colon dot rectangles, `LitColor`/`GhostColor`/`BgColor`/`SegmentHeight`/`SegmentStyle` DPs |
| `LcdClockView` UserControl | `FuzzyClock.App/Controls/LcdClockView.xaml(.cs)` | Complete — 8 digit slots (D0–D5 + Colon1/2), 1s `DispatcherTimer`, `Use24Hr`/`ShowSeconds`/`LitColor`/`BgColor`/`GhostColor`/`Size`/`SegmentStyle` DPs, `IsVisibleChanged` lifecycle |
| `SevenSegmentEncoder` | `FuzzyClock.Core/SevenSegmentEncoder.cs` | Complete — bitmask table for `'0'–'9'`, `' '`, `':'` sentinel (0x80) |
| `LcdTimeFormatHelper` | `FuzzyClock.App/LcdTimeFormatHelper.cs` | Complete — `FormatTime(DateTime, bool use24Hr, bool showSeconds)` returning 5-char or 8-char string |
| `LcdSize` enum + `LcdSizeMap` | `FuzzyClock.App/LcdSize.cs` | Complete — `Small=32px`, `Medium=48px`, `Large=64px` segment heights |
| `ClockType` enum | `FuzzyClock.App/ClockType.cs` | Complete — `Phrase / Dial / Lcd / Nixie` |
| `AppSettings` LCD fields | `FuzzyClock.App/AppSettings.cs` | Complete — `LcdUse24Hr bool`, `LcdShowSeconds bool`, `LcdStyle string`, `LcdSize LcdSize` |
| `SettingsSnapshot` LCD fields | `FuzzyClock.App/SettingsSnapshot.cs` | Complete — same four LCD fields present |
| `MainWindow` LCD event handlers | `FuzzyClock.App/MainWindow.xaml.cs` | Complete — `LcdUse24HrChanged`, `LcdShowSecondsChanged`, `LcdStyleChanged` subscriptions wired in `OpenSettings()` |
| `SettingsWindow` LCD event declarations | `FuzzyClock.App/SettingsWindow.xaml.cs` | Events declared: `LcdUse24HrChanged`, `LcdShowSecondsChanged`, `LcdStyleChanged` — no XAML controls fire them yet |
| `JapanesePhraseProvider` (Classic) | `FuzzyClock.Core/JapanesePhraseProvider.cs` | Complete — 12-bucket template system with `{h}`/`{h1}` hour-word substitution, registered as `["ja"]` |
| `IPhraseProvider` interface | `FuzzyClock.Core/IPhraseProvider.cs` | Stable — `GetPhrase`, `GetStructuredPhrase`, `GetSegmentKey` |
| `PhraseEngine` registry | `FuzzyClock.Core/PhraseEngine.cs` | Complete — `SetLocale(string)` lookup; add new keys without interface changes |

---

## What Is Missing (Net-New Work for v3.9)

### Gap 1: Colon Blink — Missing from `LcdClockView`

`LcdClockView.UpdateTime()` always assigns `Colon1.Character = ':'`. The `SevenSegmentDigit` colon character renders both dots as lit. There is no mechanism to toggle the colon off on odd seconds.

**What to add:**

`SevenSegmentDigit` needs an `IsLit` dependency property (bool, default `true`). When `IsLit = false` on a colon digit, `UpdateSegments()` renders both dots with `_ghostBrush` instead of `_litBrush`. No structural change to `SevenSegmentDigit` geometry is needed — only the brush selection in `UpdateSegments()` is gated.

`LcdClockView.UpdateTime()` needs to toggle `Colon1.IsLit = (DateTime.Now.Second % 2 == 0)` on each 1s tick. The existing `_timer` at 1s cadence is the correct driver — no new timer is needed.

**Why this approach:**
- The `_timer` is already a `DispatcherTimer` at 1s; adding a second timer would be redundant.
- `IsLit` is a cleaner abstraction than toggling `Character` between `':'` and `' '`, because `' '` renders a ghost-colored background block that shifts the digit's rendered width (the colon slot narrows to `_builtColonW = digitW * 0.30` for `':'`; assigning `' '` would expand it back to full `digitW`, causing layout jitter).
- `IsLit = false` keeps the narrow colon width and renders ghost dots — visually correct LCD blink without layout shift.

| Type | Assembly | Change |
|------|----------|--------|
| `SevenSegmentDigit` | `FuzzyClock.App` | Add `IsLit` DP (bool, default true); gate dot brush in `UpdateSegments()` |
| `LcdClockView` | `FuzzyClock.App` | Toggle `Colon1.IsLit` in `UpdateTime()` based on `DateTime.Now.Second % 2` |

**NuGet needed:** None.

---

### Gap 2: LCD Settings UI — Missing from `SettingsWindow`

`SettingsWindow.xaml` has no `BtnLcd` button in the Clock Style rail (only `BtnPhrase`, `BtnDial`, `BtnNixie`). `SetClockStyleButtonStates(ClockType ct)` does not handle `ClockType.Lcd`. There are no XAML controls for `LcdUse24Hr`, `LcdShowSeconds`, or `LcdStyle`.

**What to add:**

1. **`BtnLcd` in the Clock Style rail** — same `SegmentButtonStyle` as the three existing buttons. Add `BtnLcd_Click` handler that calls `SetClockStyleButtonStates(ClockType.Lcd)` and fires `ClockTypeChanged?.Invoke(ClockType.Lcd)`.

2. **`SetClockStyleButtonStates` update** — add `BtnLcd.Tag = ct == ClockType.Lcd ? "selected" : null;` alongside the existing three assignments.

3. **LCD Face settings row** (visibility-gated to `ClockType.Lcd`, same pattern as Dial Face row) containing:
   - `ChkLcd24Hr` — CheckBox bound to `LcdUse24HrChanged`
   - `ChkLcdShowSeconds` — CheckBox bound to `LcdShowSecondsChanged`
   - `CmbLcdStyle` — ComboBox with items `Dark / Paper / Silver`, bound to `LcdStyleChanged`

4. **`PopulateControls` additions** — set `ChkLcd24Hr.IsChecked`, `ChkLcdShowSeconds.IsChecked`, `CmbLcdStyle.SelectedIndex` from `SettingsSnapshot` fields; set LCD Face row visibility via `SetClockStyleButtonStates`.

**Visibility gating pattern** (mirrors Dial Face row, already in `SetClockStyleButtonStates`):
```csharp
LcdFaceRow.Visibility = ct == ClockType.Lcd ? Visibility.Visible : Visibility.Collapsed;
```

| File | Change Type | What Changes |
|------|-------------|--------------|
| `SettingsWindow.xaml` | XAML addition | `BtnLcd` button; `LcdFaceRow` Grid row with checkboxes + combo |
| `SettingsWindow.xaml.cs` | Code addition | `BtnLcd_Click`; `SetClockStyleButtonStates` extension; `PopulateControls` LCD section; checkbox/combo handlers |

**NuGet needed:** None.

---

### Gap 3: Japanese Phrase Style Variants — Missing from `PhraseEngine` and `SettingsWindow`

`PhraseEngine._providers` contains only `["ja"]` (Classic). There is no `["ja-terse"]`, `["ja-poetic"]`, or `["ja-rude"]`. `SettingsWindow.PopulateControls` sets `CmbPhraseStyle.IsEnabled = false` when Japanese locale is active, blocking style selection.

**What to add:**

1. **Three new provider classes in `FuzzyClock.Core`:**
   - `JapaneseTersePhraseProvider` — clipped, casual phrasing (e.g. `三時`, `三時ちょい過ぎ`) registered as `"ja-terse"`
   - `JapanesePoeticPhraseProvider` — atmospheric imagery (e.g. `夜が更けて三時`) registered as `"ja-poetic"`
   - `JapaneseRudePhraseProvider` — brusque, impatient phrasing (e.g. `もう三時じゃないか`) registered as `"ja-rude"`

   Each implements `IPhraseProvider` with the same three methods. The `{h}`/`{h1}` template substitution pattern from `JapanesePhraseProvider` is the correct structural model. `GetSegmentKey` returns `GetPhrase(dt)` (same stable-bucket idiom as all other providers).

2. **`PhraseEngine` registry additions:**
   ```csharp
   ["ja-terse"]  = new JapaneseTersePhraseProvider(),
   ["ja-poetic"] = new JapanesePoeticPhraseProvider(),
   ["ja-rude"]   = new JapaneseRudePhraseProvider(),
   ```

3. **`SettingsWindow` style selector enablement for Japanese:**

   `PopulateControls` currently sets `CmbPhraseStyle.IsEnabled = !isNonEnglish`. This must be relaxed: when `PhraseLocale == "ja"` (or auto-detected Japanese), `CmbPhraseStyle.IsEnabled = true` and the combo items remain the same (`Classic / Terse / Poetic / Rude`).

4. **`MainWindow` locale routing update:**

   `SetPhraseStyle()` currently has a guard `if (!CurrentLocale.StartsWith("en-")) return;`. This must be extended to also allow `ja-*` routing:
   ```csharp
   // Before (English-only):
   if (!CurrentLocale.StartsWith("en-")) return;

   // After (English + Japanese):
   bool isJa = CurrentLocale.StartsWith("ja");
   string prefix = isJa ? "ja" : "en";
   PhraseEngine.SetLocale($"{prefix}-{style.ToLower()}");
   ```

   The `SetPhraseLocale()` path that resolves `"ja"` base locale must remain the entry point for locale switching; style is a sub-key layered on top.

| File | Change Type | What Changes |
|------|-------------|--------------|
| `FuzzyClock.Core/JapaneseTersePhraseProvider.cs` | New file | `IPhraseProvider` implementation, `"ja-terse"` provider |
| `FuzzyClock.Core/JapanesePoeticPhraseProvider.cs` | New file | `IPhraseProvider` implementation, `"ja-poetic"` provider |
| `FuzzyClock.Core/JapaneseRudePhraseProvider.cs` | New file | `IPhraseProvider` implementation, `"ja-rude"` provider |
| `FuzzyClock.Core/PhraseEngine.cs` | Registry addition | Three new `["ja-*"]` entries in `_providers` |
| `FuzzyClock.App/SettingsWindow.xaml.cs` | Logic change | `CmbPhraseStyle.IsEnabled = true` when locale is `"ja"`; `PopulateControls` style index mapping unchanged |
| `FuzzyClock.App/MainWindow.xaml.cs` | Logic change | `SetPhraseStyle()` guard extended to route `ja-terse/poetic/rude` |

**NuGet needed:** None.

---

## Recommended Stack

### Core Technologies (unchanged from v3.8)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| .NET 10 WPF | net10.0-windows | UI framework — all controls, XAML, DispatcherTimer | Already validated; transparent overlay, UserControls, Settings window |
| C# 13 | .NET 10 SDK | Language | `init`-property records, pattern matching, collection expressions |
| System.Text.Json | .NET 10 BCL | Settings serialization | Already validated; handles `AppSettings` init-property record natively |
| MSTest | 4.0.1 (existing) | Test framework — 299 tests currently passing | Already validated; CI gate enforced |
| WPF `Polygon` / `Rectangle` / `Canvas` | System.Windows.Shapes / System.Windows.Controls | 7-segment rendering | Already in use via `SevenSegmentDigit` |
| `DispatcherTimer` | System.Windows.Threading | Per-second tick for LCD colon blink | Already in use in `LcdClockView` at 1s; no new timer needed |

### Types Added (no new packages)

| Type | Assembly | Purpose |
|------|----------|---------|
| `SevenSegmentDigit.IsLit` DP | `FuzzyClock.App` | Colon blink toggle — ghost vs lit dots |
| `JapaneseTersePhraseProvider` | `FuzzyClock.Core` | `"ja-terse"` registry entry |
| `JapanesePoeticPhraseProvider` | `FuzzyClock.Core` | `"ja-poetic"` registry entry |
| `JapaneseRudePhraseProvider` | `FuzzyClock.Core` | `"ja-rude"` registry entry |

**Zero new NuGet packages. Zero csproj changes.**

---

## Files to Change

| File | Change Type | What Changes |
|------|-------------|--------------|
| `Controls/SevenSegmentDigit.xaml.cs` | DP addition | Add `IsLit` bool DP; gate colon dot brush on `IsLit` in `UpdateSegments()` |
| `Controls/LcdClockView.xaml.cs` | Logic addition | Toggle `Colon1.IsLit` on each `UpdateTime()` tick based on `second % 2` |
| `SettingsWindow.xaml` | XAML addition | `BtnLcd` in Clock Style rail; `LcdFaceRow` with `ChkLcd24Hr`, `ChkLcdShowSeconds`, `CmbLcdStyle` |
| `SettingsWindow.xaml.cs` | Code additions | `BtnLcd_Click`; extend `SetClockStyleButtonStates`; `PopulateControls` LCD section; checkbox/combo handlers for three LCD settings; enable `CmbPhraseStyle` for Japanese locale |
| `FuzzyClock.Core/JapaneseTersePhraseProvider.cs` | New file | Terse Japanese `IPhraseProvider` |
| `FuzzyClock.Core/JapanesePoeticPhraseProvider.cs` | New file | Poetic Japanese `IPhraseProvider` |
| `FuzzyClock.Core/JapaneseRudePhraseProvider.cs` | New file | Rude Japanese `IPhraseProvider` |
| `FuzzyClock.Core/PhraseEngine.cs` | Registry addition | Add `["ja-terse"]`, `["ja-poetic"]`, `["ja-rude"]` entries |
| `FuzzyClock.App/MainWindow.xaml.cs` | Logic change | Extend `SetPhraseStyle()` guard to route Japanese sub-styles |

---

## Key Integration Points

### Colon Blink — `IsLit` DP on `SevenSegmentDigit`

`SevenSegmentDigit.UpdateSegments()` currently selects `_litBrush` for the colon dots unconditionally when `Character == ':'`. The change:

```csharp
// In UpdateSegments(), colon branch:
_dot1.Fill = IsLit ? _litBrush : _ghostBrush;
_dot2.Fill = IsLit ? _litBrush : _ghostBrush;
```

`LcdClockView.UpdateTime()` drives the toggle:

```csharp
Colon1.IsLit = (DateTime.Now.Second % 2 == 0);
// Colon2 (seconds separator) blinks in sync if seconds row is visible
if (ShowSeconds) Colon2.IsLit = Colon1.IsLit;
```

The existing 1s `DispatcherTimer` already calls `UpdateTime()` on each tick — no cadence change needed.

### Japanese Style Routing — `SetPhraseStyle()` in `MainWindow`

The existing routing for English:
```csharp
// Existing:
private void SetPhraseStyle(string style)
{
    if (!PhraseEngine.CurrentLocale.StartsWith("en-")) return;
    PhraseEngine.SetLocale($"en-{style.ToLower()}");
    ...
}
```

The locale key convention for Japanese is `ja-terse` / `ja-poetic` / `ja-rude` — parallel to `en-terse` / `en-poetic` / `en-rude`. The style string values (`"Classic"`, `"Terse"`, `"Poetic"`, `"Rude"`) come from `AppSettings.PhraseStyle` unchanged.

The base locale `"ja"` registered in `PhraseEngine` maps to Classic. When style is `"Classic"` for Japanese, `SetLocale("ja")` is correct. When style is `"Terse"`, `SetLocale("ja-terse")` is correct.

### Japanese Style — `SettingsWindow` Enablement

`CmbPhraseStyle` currently has four items (index 0–3: Classic/Terse/Poetic/Rude). The index mapping is locale-independent. No new combo items are needed. The only change is removing the `isNonEnglish` guard for Japanese:

```csharp
// Current logic (blocks style for ALL non-English):
bool isNonEnglish = nonEnglishActive || (s.PhraseLocale is "fr" or "es" or "de" or "ja" or "pl");
CmbPhraseStyle.IsEnabled = !isNonEnglish;

// Updated logic (blocks style for non-English EXCEPT Japanese):
bool styleAllowed = !nonEnglishActive
    || uiLang == "ja"
    || s.PhraseLocale == "ja";
CmbPhraseStyle.IsEnabled = styleAllowed
    && !(s.PhraseLocale is "fr" or "es" or "de" or "pl")
    && !(nonEnglishActive && uiLang is "fr" or "es" or "de" or "pl");
```

A simpler equivalent: disable only when active locale is in `{fr, es, de, pl}` (the four without style variants).

### `AppSettings.PhraseStyle` — No Change

`PhraseStyle` stores `"Classic"` / `"Terse"` / `"Poetic"` / `"Rude"` regardless of locale. The routing logic in `MainWindow` applies the style key to the active locale prefix (`en-` or `ja-`). No new settings field is needed for Japanese style — the existing field is reused.

---

## What NOT to Add

| Do Not Add | Why | What to Use Instead |
|------------|-----|---------------------|
| Any NuGet package | Zero new packages needed | Existing BCL + WPF types |
| New `DispatcherTimer` for colon blink | `LcdClockView` already has a 1s timer | Toggle `IsLit` inside the existing `UpdateTime()` call |
| New `LcdStyle` setting for blink on/off | Blink is a standard LCD behavior — not a user preference for this milestone | Always blink when LCD clock is active |
| New `PhraseStyle` settings field for Japanese | `AppSettings.PhraseStyle` string is locale-independent | Route same value through `ja-` prefix in `SetPhraseStyle()` |
| `LcdSize` in `AppSettings` | Already documented as derived-from-FontSize; already absent from persistence | Derive at runtime via `FontSizeToLcdSize()` |
| Separate `Action<bool>? LcdColonBlinkChanged` event | Blink has no toggle in this milestone | Always blink |
| `LcdSizeChanged` event on `SettingsWindow` | Size is driven by `FontSizeChanged` via `FontSizeToLcdSize()` | No separate event; `ApplyFontSize()` already sets `LcdView.Size` |
| New Japanese provider base class | Three Japanese variant providers are small (12 buckets each); shared base adds indirection with no benefit | Duplicate the `{h}`/`{h1}` pattern directly in each class |

---

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| LCD rendering infrastructure complete | HIGH | `SevenSegmentDigit`, `LcdClockView`, `SevenSegmentEncoder`, `LcdTimeFormatHelper`, `LcdSize` all verified by direct source audit |
| Colon blink gap confirmed | HIGH | `LcdClockView.UpdateTime()` source-verified always-lit; no `IsLit` DP exists on `SevenSegmentDigit` |
| LCD Settings UI gap confirmed | HIGH | `SettingsWindow.xaml` source-verified: only 3 clock style buttons (Phrase/Dial/Nixie); no LCD face controls |
| Japanese style gap confirmed | HIGH | `PhraseEngine._providers` source-verified: only `["ja"]` key; `SettingsWindow` disables style for `"ja"` locale |
| `IPhraseProvider` interface stable | HIGH | Interface source-verified; no changes needed for new providers |
| Zero new NuGet packages | HIGH | All required types in BCL + WPF + existing project files — verified by source audit |
| Japanese phrase content | LOW | Phrase vocabulary (Terse/Poetic/Rude Japanese) requires native speaker review; the structural pattern (`{h}`/`{h1}` bucket templates) is HIGH confidence |

---

## Sources

All sources are the current codebase — verified by direct file inspection on 2026-03-23.

- `FuzzyClock.App/Controls/SevenSegmentDigit.xaml.cs` — segment rendering, colon dot logic, no `IsLit` DP confirmed
- `FuzzyClock.App/Controls/LcdClockView.xaml.cs` — 1s DispatcherTimer, `UpdateTime()` always-lit colon confirmed
- `FuzzyClock.App/Controls/LcdClockView.xaml` — 8 digit slot XAML structure confirmed
- `FuzzyClock.Core/SevenSegmentEncoder.cs` — bitmask table confirmed; colon sentinel 0x80 confirmed
- `FuzzyClock.App/LcdTimeFormatHelper.cs` — `FormatTime()` signature and 12/24hr logic confirmed
- `FuzzyClock.App/LcdSize.cs` — `Small=32, Medium=48, Large=64` confirmed
- `FuzzyClock.App/ClockType.cs` — `Phrase/Dial/Lcd/Nixie` confirmed complete
- `FuzzyClock.App/AppSettings.cs` — LCD fields present; `LcdSize` absent from persistence confirmed
- `FuzzyClock.App/SettingsSnapshot.cs` — LCD fields present confirmed
- `FuzzyClock.App/SettingsWindow.xaml` — 3-button rail (no `BtnLcd`) confirmed; no LCD face controls confirmed
- `FuzzyClock.App/SettingsWindow.xaml.cs` — LCD event declarations present; no handlers; `CmbPhraseStyle` disabled for `"ja"` locale confirmed
- `FuzzyClock.App/MainWindow.xaml.cs` — LCD event subscriptions wired in `OpenSettings()`; `SetPhraseStyle()` English-only guard confirmed
- `FuzzyClock.Core/PhraseEngine.cs` — `["ja"]` only; no `ja-terse/poetic/rude` entries confirmed
- `FuzzyClock.Core/JapanesePhraseProvider.cs` — `{h}`/`{h1}` template pattern; 12 buckets confirmed
- `FuzzyClock.Core/IPhraseProvider.cs` — interface signature confirmed stable
- `.planning/PROJECT.md` — v3.9 requirements LCD-01 through LCD-04, JA-01 through JA-03 confirmed

---
*Stack research for: FuzzyStatsClock v3.9 — LCD Clock + Japanese Styles*
*Researched: 2026-03-23*
