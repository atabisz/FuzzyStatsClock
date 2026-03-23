# Domain Pitfalls

**Domain:** WPF C# — Adding LCD 7-segment clock style and Japanese phrase style variants (Terse/Poetic/Rude) to existing widget
**Project:** Fuzzy Clock v3.9
**Researched:** 2026-03-23
**Confidence:** HIGH — all pitfalls derived from direct source audit of MainWindow.xaml.cs, SettingsWindow.xaml.cs, SettingsWindow.xaml, AppSettings.cs, SettingsSnapshot.cs, LcdClockView.xaml.cs, SevenSegmentDigit.xaml.cs, PhraseEngine.cs, JapanesePhraseProvider.cs, and ClockType.cs

---

## State at Start of Milestone

The LCD infrastructure is already substantially built. Key facts established by source audit:

- `ClockType.Lcd` is already a member of the `ClockType` enum (ClockType.cs).
- `AppSettings` already has `LcdUse24Hr`, `LcdShowSeconds`, `LcdStyle`, `LcdSize` fields with init defaults.
- `SettingsSnapshot` already has the same four LCD fields.
- `LcdClockView` and `SevenSegmentDigit` are complete WPF UserControls with their own 1-second `DispatcherTimer` managed via `IsVisibleChanged`.
- `MainWindow` already handles `ClockType.Lcd` in `ApplySettings`, `SetClockType`, `SaveSettings`, and event subscriptions in `OpenSettings`.
- `SettingsWindow` already declares and fires `LcdUse24HrChanged`, `LcdShowSecondsChanged`, `LcdStyleChanged` events with wired handlers in MainWindow.
- **What is NOT yet built:** `BtnLcd` button in `SettingsWindow.xaml`; the LCD options row (24hr/seconds/style controls) in the Settings Appearance tab; LCD visibility gating in `SetClockStyleButtonStates`; Japanese Terse/Poetic/Rude providers; `SetLanguage` routing for `ja-terse`, `ja-poetic`, `ja-rude`.

This context makes the following pitfalls specific and actionable.

---

## Critical Pitfalls

Mistakes that cause build failures or silent runtime regressions.

---

### Pitfall 1: `BtnLcd` Added to XAML But Not to `SetClockStyleButtonStates` — LCD Button Never Shows Selected

**What goes wrong:** `SetClockStyleButtonStates(ClockType ct)` in SettingsWindow.xaml.cs currently sets `Tag = "selected"` on `BtnPhrase`, `BtnDial`, and `BtnNixie`. When `BtnLcd` is added to the XAML clock style rail, if `SetClockStyleButtonStates` is not updated to include `BtnLcd.Tag = ct == ClockType.Lcd ? "selected" : null`, the LCD button never visually reflects the selected state.

**Why it happens:** XAML and code-behind are edited in separate files. Adding the button element does not cause a compile error from the code-behind method omission — `BtnLcd` gets `Tag = null` permanently, making it appear unselected even when LCD is the active clock type.

**Consequences:** Visual bug — LCD is active but Phrase/Dial/Nixie buttons show as selected, or none do. `PopulateControls` also calls `SetClockStyleButtonStates(s.ClockType)`, so opening Settings while LCD is active will also show the wrong button highlighted.

**Prevention:** Update `SetClockStyleButtonStates` in the same commit as the XAML button addition. The complete required body after this change:

```csharp
BtnPhrase.Tag = ct == ClockType.Phrase ? "selected" : null;
BtnDial.Tag   = ct == ClockType.Dial   ? "selected" : null;
BtnNixie.Tag  = ct == ClockType.Nixie  ? "selected" : null;
BtnLcd.Tag    = ct == ClockType.Lcd    ? "selected" : null;
```

**Detection:** Select LCD via tray → open Settings. The LCD button must be highlighted. If it is not, `SetClockStyleButtonStates` was not updated.

**Phase:** LCD Settings UI wiring phase (first phase of the milestone).

---

### Pitfall 2: LCD Options Row Not Gated on `ClockType.Lcd` — Controls Visible in Wrong Clock Mode

**What goes wrong:** The Dial Face row uses the pattern: `DialFaceLabel.Visibility` and `DialFacePanel.Visibility` are gated to `Visibility.Visible` only when `ct == ClockType.Dial` inside `SetClockStyleButtonStates`. If the LCD options row (24hr toggle, show-seconds toggle, style selector) is added to the Settings XAML without a parallel gating block in `SetClockStyleButtonStates`, the LCD controls will be visible regardless of the active clock type.

**Why it happens:** The gating pattern for the Dial Face row is in `SetClockStyleButtonStates` but is easy to miss when adding a new clock-type-specific row, especially if the developer adds the XAML first and the gating second.

**Consequences:** LCD-specific controls clutter the Settings window when the user is in Phrase/Dial/Nixie mode. Controls are visible and interactive even though changing them has no visible effect (the LCD view is hidden). Misleading UX.

**Prevention:** Extend `SetClockStyleButtonStates` to include LCD row gating in the same pass as the Dial Face gating. Name the label and panel elements consistently (e.g., `LcdOptionsLabel`, `LcdOptionsPanel`) and set their `Visibility` using the `ct == ClockType.Lcd` condition.

**Detection:** Select Phrase mode → open Settings. The LCD options row must be `Collapsed`. Select LCD mode → open Settings. The LCD options row must be `Visible`.

**Phase:** LCD Settings UI wiring phase.

---

### Pitfall 3: `BtnLcd_Click` Fires `ClockTypeChanged` But `SetClockStyleButtonStates` Inside the Handler Only Updates Three Buttons

**What goes wrong:** The click handler pattern for `BtnPhrase_Click`, `BtnDial_Click`, `BtnNixie_Click` is:

```csharp
private void BtnXxx_Click(object sender, RoutedEventArgs e)
{
    if (_suppressEvents) return;
    SetClockStyleButtonStates(ClockType.Xxx);
    ClockTypeChanged?.Invoke(ClockType.Xxx);
}
```

If `BtnLcd_Click` is added but `SetClockStyleButtonStates` has not yet been updated to include `BtnLcd.Tag`, the LCD button click fires correctly through `ClockTypeChanged` (activating LCD in the widget) but the Settings button row still shows the previous button as selected.

**Why it happens:** `BtnLcd_Click` calls `SetClockStyleButtonStates(ClockType.Lcd)` internally. If that method only sets three tags, the LCD button's own tag is not set.

**Consequences:** The correct clock type is activated (widget switches to LCD) but the Settings window shows an inconsistent button selection state.

**Prevention:** This is prevented by fixing Pitfall 1 first. `SetClockStyleButtonStates` must include all four buttons before `BtnLcd_Click` is wired.

**Phase:** LCD Settings UI wiring phase.

---

### Pitfall 4: Japanese Style Providers Registered Under Keys That Don't Match `SetLanguage` Routing

**What goes wrong:** `PhraseEngine._providers` currently routes Japanese as `"ja"` → `JapanesePhraseProvider`. The new providers must be registered under keys that `SetLanguage` will compute, e.g., `"ja-terse"`, `"ja-poetic"`, `"ja-rude"`. If the registration keys don't match what `SetLanguage` produces, `PhraseEngine.SetLocale` returns `false` silently and the engine stays on the previously active provider.

**Why it happens:** `PhraseEngine.SetLocale` returns a bool but the callers (`SetLanguage`, `ApplySettings`) do not check the return value. A key mismatch is a silent no-op.

**Consequences:** Selecting Japanese + Poetic in Settings fires the event, the field is saved as `"Poetic"`, but the phrase display stays on plain Japanese Classic because the locale key lookup failed.

**Prevention:** Define the keys in PhraseEngine first, then use those exact string literals in `SetLanguage`'s routing switch. The routing logic for Japanese must parallel the English routing:

```
locale == "ja", PhraseStyle == "Terse"  → "ja-terse"
locale == "ja", PhraseStyle == "Poetic" → "ja-poetic"
locale == "ja", PhraseStyle == "Rude"   → "ja-rude"
locale == "ja", default                 → "ja"
```

Register exactly those keys in `_providers`.

**Detection:** Set language to Japanese, set style to Terse → phrase must change from the Classic Japanese output. If it does not change, the key lookup failed. Check `PhraseEngine.CurrentLocale` — it must equal `"ja-terse"` not `"ja"`.

**Phase:** Japanese providers phase.

---

### Pitfall 5: `SetLanguage` Routes `"ja"` to a Single Provider, Ignoring `_currentPhraseStyle` — Style × Locale Routing Gap

**What goes wrong:** `SetLanguage("ja")` currently resolves to `effectiveLocale = "ja"` unconditionally. This is correct for v3.8 (no Japanese styles exist). In v3.9, if the user has `PhraseStyle = "Terse"` and switches to Japanese, `SetLanguage` must incorporate `_currentPhraseStyle` into the locale key computation, exactly as it already does for `locale == "en"`.

Looking at the actual code, `SetLanguage` handles `locale == "en"` by checking `_currentPhraseStyle` and mapping to `"en-terse"`, `"en-poetic"`, etc. The `"ja"` branch currently short-circuits before this mapping, assigning `effectiveLocale = locale` directly.

**Why it happens:** The English style routing in `SetLanguage` is a `locale == "en"` branch. Non-English locales (`"fr"`, `"es"`, `"de"`, `"ja"`, `"pl"`) are handled by a single `if (locale is "fr" or ...)` branch that assigns `effectiveLocale = locale` without considering style.

**Consequences:** A user with `PhraseStyle = "Terse"` who switches from English to Japanese will get plain Japanese Classic, not Japanese Terse. The style combo becomes visually active (enabled) but has no effect.

**Prevention:** When adding Japanese styles, add a parallel style-mapping block for `locale == "ja"` in `SetLanguage` and in the `ApplySettings` locale resolution block. Both locations contain the same routing logic and must both be updated. A grep for `effectiveLocale` will show all resolution sites.

**Detection:** Set Japanese language, set style to Terse (if enabled for Japanese), verify phrase output is from the Terse provider. Then switch to English, verify English Terse, then back to Japanese Terse — verify state is preserved after the round-trip.

**Phase:** Japanese providers phase.

---

### Pitfall 6: `CmbPhraseStyle.IsEnabled` Gate Not Updated for Japanese — Style Combo Stays Disabled

**What goes wrong:** `PopulateControls` in SettingsWindow.xaml.cs currently disables `CmbPhraseStyle` when the active locale is any of `"fr"`, `"es"`, `"de"`, `"ja"`, `"pl"`. In v3.9, Japanese now has its own Terse/Poetic/Rude styles, so `"ja"` must not disable the combo. The same logic exists in `CmbPhraseLanguage_SelectionChanged`.

**Why it happens:** The disable condition was written as a flat list of non-English locales (`locale is "fr" or "es" or "de" or "ja" or "pl"`). When Japanese gets styles, `"ja"` must be removed from this list. There are at minimum two code sites: `PopulateControls` line 103 and `CmbPhraseLanguage_SelectionChanged` line 437.

**Consequences:** The Style combo is grayed out when Japanese is active. User cannot select Japanese Terse/Poetic/Rude from the Settings window even though the providers exist. The tray menu has no style selection path, so this is the only UI entry point.

**Prevention:** Before adding Japanese providers, audit both disable sites. Update the condition to exclude `"ja"` from the list. Consider whether other non-English locales (fr/es/de/pl) should eventually support styles and leave a comment.

**Detection:** Set language to Japanese → verify style combo is enabled. Set language to French → verify style combo is disabled.

**Phase:** Japanese providers phase — must be done before any Japanese style can be selected.

---

### Pitfall 7: `ApplySettings` Locale Resolution Block Not Updated to Handle `ja` + Style

**What goes wrong:** `ApplySettings` contains a locale resolution block that duplicates the logic in `SetLanguage` (both are in MainWindow.xaml.cs, approximately lines 330–374). The `"ja"` branch in `ApplySettings` assigns `effectiveLocale = _currentPhraseLocale` without checking `_currentPhraseStyle`. The fix needed in `SetLanguage` (Pitfall 5) is not automatically reflected in `ApplySettings`.

**Why it happens:** The resolution logic is intentionally duplicated: `SetLanguage` runs at runtime when the user changes language; the `ApplySettings` block runs at startup. Both must be kept in sync. The English style mapping is already duplicated in both places across ~20 lines. Adding Japanese style mapping requires updating both places.

**Consequences:** The widget restores correctly to Japanese Terse after restart **only if** the `ApplySettings` block also handles the mapping. If only `SetLanguage` is updated, users who save Japanese Terse, restart the app, and observe Classic Japanese have a silent settings-restoration bug.

**Prevention:** When updating `SetLanguage` for Japanese styles, immediately search for the `ApplySettings` locale resolution block (search for `effectiveLocale` in MainWindow.xaml.cs) and apply the same mapping there. The two blocks should remain structurally identical.

**Detection:** Set language to Japanese + Poetic → save → restart app → verify widget displays Japanese Poetic phrasing, not Classic Japanese. If it shows Classic, `ApplySettings` was not updated.

**Phase:** Japanese providers phase.

---

### Pitfall 8: `_suppressEvents` Guard in `PopulateControls` — Style Combo Content Change While Suppressed Fires Event Anyway

**What goes wrong:** `CmbPhraseStyle` items are `ComboBoxItem` elements with `Content` strings (e.g., `"Classic"`, `"Terse"`, `"Poetic"`, `"Rude"`). If v3.9 needs to add Japanese-specific style items (e.g., displaying as `"Casual"` / `"Poetic"` / `"Brusque"` in Japanese locale, if localized labels are desired) by replacing the ComboBoxItem content dynamically during `PopulateControls`, the `_suppressEvents` guard prevents the `SelectionChanged` event from firing — which is correct. But if items are swapped at a time when `_suppressEvents = false`, the selection change during item replacement will fire the event unexpectedly.

**Why it happens:** `PopulateControls` runs under `_suppressEvents = true`. If item content is swapped in a separate method called outside that guard (e.g., in `CmbPhraseLanguage_SelectionChanged`), the guard is no longer active.

**Consequences:** Spurious `PhraseStyleChanged` events with stale or default style values, causing a flicker of the wrong phrase style.

**Prevention:** Keep style combo items as static ComboBoxItem elements. Use only `SelectedIndex` changes within `_suppressEvents` blocks, never dynamic item replacement. Map internal style keys to fixed indices. If Japanese styles need different display labels, use a separate label mechanism rather than mutating ComboBoxItem content at runtime.

**Detection:** Switch language to Japanese — verify the phrase style combo does not fire a `PhraseStyleChanged` event during the language switch. Set a breakpoint or log in the `PhraseStyleChanged` handler.

**Phase:** Japanese providers phase.

---

## Moderate Pitfalls

---

### Pitfall 9: LCD Timer (`LcdClockView`) Ghost Mode Interaction — 1s Timer Fires While Widget Is Opacity=0

**What goes wrong:** `LcdClockView` starts its internal 1-second `DispatcherTimer` when `IsVisible == true`. Ghost mode sets `Window.Opacity = 0` and applies `WS_EX_TRANSPARENT`, but does **not** set `LcdView.Visibility = Collapsed`. The timer continues firing, calling `UpdateTime()` every second, including during ghost mode.

**Why it happens:** Ghost mode was designed for the phrase/dial/Nixie display modes where the 10s phrase timer already fires while ghost mode is active with no ill effects. The LCD timer fires 6× more frequently (every second) and performs layout-affecting work (swapping character assignments that trigger canvas redraws). The widget is invisible during ghost mode, so the work is wasted.

**Consequences:** No visual artifact (the widget is invisible). No crash. However, the redraw cost persists during the entire ghost period. On machines with low GPU memory or resource-constrained environments, this is unnecessary overhead. More importantly, if `UpdateTime` has any side effects outside the Canvas (e.g., SizeToContent layout recalculation), it may cause the window size to recalculate while ghost mode is active, potentially interfering with the `GetWindowRect` polling used by `GhostModeController` to detect cursor departure.

**Prevention:** The `ContrastRefreshController` uses a skip condition: `() => _ghostMode.IsActive || _windowOpacity == 0.0 || _isDragging`. The LCD timer should consult the same condition. The cleanest approach is to add an early-return guard at the top of `LcdClockView.UpdateTime()` — or, since `LcdClockView` does not have access to the ghost mode state, pass a `Func<bool> shouldSkip` predicate into `LcdClockView` that `MainWindow` sets to `() => _ghostMode.IsActive`.

**Detection:** Activate ghost mode → hover over the widget area → confirm via Debug.WriteLine or a tick counter that `UpdateTime` is not called during the ghost period. Given the widget is invisible, this pitfall may not surface as a user-visible bug but is worth addressing for correctness.

**Phase:** LCD widget wiring phase — add the skip predicate when wiring `LcdView` in `ContentRendered`.

---

### Pitfall 10: Blinking Colon — `SevenSegmentDigit` Has No Blink State; Blink Must Be Driven from `LcdClockView`

**What goes wrong:** `SevenSegmentDigit` with `Character = ':'` always renders the colon dots as lit. There is no blink state in `SevenSegmentDigit`. If the blinking colon feature (LCD-03) is implemented by toggling `Colon1.Character` between `':'` and `' '` at every `_timer.Tick`, the timer already fires every second — the colon will toggle on every second, which is correct for a standard blinking colon (on for 1s, off for 1s). **But** if the implementation mistakenly adds a separate blink timer with a 500ms interval alongside the existing 1s display timer, two timers will run simultaneously.

**Why it happens:** The natural intuition for "blink every half second" is a 500ms timer. But a colon that is on for 1 second and off for 1 second (driven by the existing 1s tick via character toggling) is the correct behaviour and requires no additional timer.

**Consequences of adding a 500ms timer:** Three concurrent DispatcherTimers in the application (10s phrase timer, stats timer, and 500ms blink timer) — adding unnecessary timer proliferation. The `IsBusyHint` on the WPF Dispatcher increases marginally, and the 500ms timer adds complexity without benefit.

**Prevention:** Implement colon blink as a state toggle inside `LcdClockView.UpdateTime()` using a `_colonVisible` bool that flips on each call. No separate timer is needed. Pseudocode:

```csharp
_colonVisible = !_colonVisible;
Colon1.Character = _colonVisible ? ':' : ' ';
if (ShowSeconds) Colon2.Character = _colonVisible ? ':' : ' ';
```

**Detection:** After implementing blink, verify only two timers exist in the process: the 10s phrase timer and the stats timer (plus the LCD view's own 1s timer, which is internal to `LcdClockView`). Grep for `new DispatcherTimer` across all files — the count should not increase from its current state.

**Phase:** LCD blink implementation phase.

---

### Pitfall 11: `AppSettings` JSON Round-Trip Test Does Not Cover LCD Fields — Silent Regression Risk

**What goes wrong:** `STEST-01` in `SettingsServiceTests.cs` asserts that every `AppSettings` field survives a serialize/deserialize round-trip. `AppSettings` already contains `LcdUse24Hr`, `LcdShowSeconds`, `LcdStyle`, `LcdSize`. If STEST-01 was not updated when these fields were added (audit required), it does not assert them. Any JSON serialization regression on these fields would not be caught by the test suite.

**Why it happens:** Init-property records in C# do not fail the round-trip test when a field is added but not asserted — they simply carry their default value silently.

**Consequences:** A user who saves LCD preferences finds them reset to defaults on next launch, with no test failure surfacing the regression.

**Prevention:** Audit `STEST-01` before the milestone begins. Confirm it asserts `LcdUse24Hr`, `LcdShowSeconds`, `LcdStyle`, `LcdSize`. If absent, add the assertions. Also add absent-field tests for each LCD field: confirm that a `settings.json` without `"LcdUse24Hr"` key deserializes to `false` (the init default).

**Detection:** `dotnet test` passes but user reports LCD preferences not persisting. Absent-field tests would have caught this.

**Phase:** LCD settings persistence phase.

---

### Pitfall 12: `SettingsService.Validate()` Has No Guard for `LcdStyle` — Manually Edited `settings.json` Passes Bad Value

**What goes wrong:** `SettingsService.Validate()` currently guards `StatsIntervalSeconds`, `Opacity`, and `AccentColor`. `LcdStyle` is persisted as a string (`"Dark"`, `"Paper"`, `"Silver"`). If a user manually edits `settings.json` to `"LcdStyle": "bogus"`, `ApplyLcdColors()` falls through the `if/else` chain to the `else // "Dark"` branch, applying Dark style silently. This is tolerable but inconsistent — the saved value is bogus but the rendered value is `"Dark"`.

**Prevention:** Add a guard in `Validate()`:

```csharp
if (s.LcdStyle is not ("Dark" or "Paper" or "Silver"))
    s = s with { LcdStyle = "Dark" };
```

This follows the existing `AccentColor` guard pattern.

**Phase:** LCD settings persistence phase.

---

### Pitfall 13: `GetCurrentSettingsSnapshot()` Must Include `LcdSize` — Verify It Is Already Populated

**What goes wrong:** `GetCurrentSettingsSnapshot()` currently includes `LcdSize = FontSizeToLcdSize(_currentFontSize)`. This was confirmed by source audit (MainWindow.xaml.cs line 419). However, if `LcdSize` were absent, opening the Settings window while LCD is active would populate the size control from the default init value (`LcdSize.Medium`) rather than the actual active size. This pitfall is a reminder to verify the snapshot is complete, not a confirmed gap.

**Prevention:** Before writing any LCD Settings UI code, audit the full snapshot in `GetCurrentSettingsSnapshot()` against every `LcdXxx` field in `SettingsSnapshot`. Run: confirm `LcdUse24Hr = _lcdUse24Hr`, `LcdShowSeconds = _lcdShowSeconds`, `LcdStyle = _lcdStyle`, `LcdSize = FontSizeToLcdSize(_currentFontSize)` are all present.

**Phase:** LCD Settings UI wiring phase.

---

### Pitfall 14: `ResetToDefaults` Does Not Reset LCD Options — Widget Restores to LCD After Reset

**What goes wrong:** `ResetToDefaults()` calls `SetClockType(ClockType.Phrase)` (confirmed in MainWindow.xaml.cs line 1202), which correctly resets the clock type. However, `_lcdUse24Hr`, `_lcdShowSeconds`, and `_lcdStyle` are also set in `ResetToDefaults()` (lines 1205–1207). If these lines are absent or if new LCD fields are added during v3.9 without updating `ResetToDefaults`, the reset state will carry stale LCD settings.

**Prevention:** After adding any new `_lcdXxx` field (e.g., `_lcdSize` if it becomes independently tracked), add its reset line to `ResetToDefaults()` and verify the reset `AppSettings` `with` expression includes the field.

**Detection:** Set LCD mode with 24hr on → tray "Reset to Defaults" → open Settings → switch to LCD → verify 24hr is off (reset to `false` default).

**Phase:** LCD Settings UI wiring phase.

---

### Pitfall 15: `PhraseWrapService.allowNatural` Guard Does Not Account for Japanese Locale

**What goes wrong:** `ApplyPhraseWrap` guards natural pause wrapping with:

```csharp
bool allowNatural = PhraseEngine.CurrentLocale.StartsWith("en-", StringComparison.Ordinal);
```

Japanese phrases (`"ja"`, `"ja-terse"`, `"ja-poetic"`, `"ja-rude"`) use Japanese CJK characters with no space boundaries. `PhraseWrapService.ComputeSplit` uses space-based splitting for natural pause. If a Japanese phrase somehow reaches the wrap path (it is short enough that it normally would not), natural pause wrap on a spaceless string would produce a null split and fall through to midpoint, which splits at a character boundary in the middle of a multi-byte Unicode grapheme cluster.

**Why it happens:** CJK strings have no spaces. The `allowNatural` guard already prevents this for English-only providers. The new `"ja-"` prefix means the `StartsWith("en-")` guard correctly excludes Japanese — this pitfall is about verifying the guard covers `"ja-"` rather than adding a new guard.

**Prevention:** Confirm by inspection that `StartsWith("en-")` returns `false` for `"ja"`, `"ja-terse"`, `"ja-poetic"`, `"ja-rude"` — it does. No code change needed. Document this as a known invariant in a comment in `ApplyPhraseWrap`.

**Detection:** Set locale to Japanese Terse, enable phrase wrap. Verify the wrap is either absent (phrase is short enough not to wrap) or splits at a reasonable visual boundary.

**Phase:** Japanese providers phase — verify, no change expected.

---

### Pitfall 16: `[DoNotParallelize]` on `PhraseEngineCoordinatorTests` Must Cover Japanese-Locale Tests

**What goes wrong:** `PhraseEngineCoordinatorTests` has `[DoNotParallelize]` applied because `PhraseEngine` uses static state (`_activeProvider`, `CurrentLocale`). Tests that exercise the new `"ja-terse"`, `"ja-poetic"`, `"ja-rude"` locale keys must be in `PhraseEngineCoordinatorTests` (or in a class that also has `[DoNotParallelize]`), not in a separate parallelizable test class.

**Why it happens:** Adding new providers triggers the natural instinct to add new test classes for them. If those classes are placed in `MultilingualPhraseProviderTests` (which tests providers in isolation, not via the engine), they are safe to parallelize. But if they exercise `PhraseEngine.SetLocale` and `PhraseEngine.GetPhrase`, they must be in the non-parallelizable class.

**Consequences:** Locale contamination between test methods. Flaky tests that pass in isolation and fail in parallel runs.

**Prevention:** Provider unit tests (testing `JapaneseTersePhraseProvider.GetPhrase` directly, not through `PhraseEngine`) are safe in any class. Engine integration tests (testing `PhraseEngine.SetLocale("ja-terse")`) must go in `PhraseEngineCoordinatorTests` under `[DoNotParallelize]`.

**Phase:** Japanese providers phase.

---

## Minor Pitfalls

---

### Pitfall 17: 12-Hour LCD Display — Leading Space in Hour Digit

**What goes wrong:** `LcdTimeFormatHelper.FormatTime` in 12-hour mode uses `hourStr = h < 10 ? $" {h}" : $"{h}"` — a leading space for single-digit hours. `SevenSegmentDigit` with `Character = ' '` renders a blank digit (0x00 mask, all segments off). This is correct behaviour. The pitfall is assuming the space causes a layout shift: `SevenSegmentDigit` sets its own `Width` based on `_builtDigitW` and does not narrow for a blank character the way it narrows for `':'`. A leading blank digit has full digit width, keeping the clock display width stable between, say, `" 1:00"` and `"10:00"`. This is intentional and correct — do not "fix" it.

**Prevention:** No code change needed. Document the intent in a comment so future developers do not inadvertently "optimize" the leading space to an empty string.

**Phase:** Not a blocker — awareness only.

---

### Pitfall 18: `SaveSettings()` Includes `LcdSize` Via `FontSizeToLcdSize` — Verify `LcdSize` Is Not Also Tracked as an Independent Field

**What goes wrong:** `AppSettings.LcdSize` is saved as `FontSizeToLcdSize(_currentFontSize)` in `SaveSettings()`. There is no independent `_lcdSize` field in `MainWindow` — the size derives from font size. If during v3.9 work someone adds a separate `_lcdSize` field to MainWindow for fine-grained LCD sizing, they would create a discrepancy: `SaveSettings()` uses `FontSizeToLcdSize(_currentFontSize)` while `ApplySettings()` and `SetClockType()` use the new field.

**Prevention:** Keep LCD size purely derived from font size. Do not add a separate `_lcdSize` field. The `LcdSize` enum in `AppSettings` and `SettingsSnapshot` exists for serialization and snapshot convenience, not as an independent dimension.

**Phase:** Awareness only.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| LCD Settings UI — BtnLcd XAML + gating | `BtnLcd` added to XAML but `SetClockStyleButtonStates` not updated; LCD options row not gated on `ct == ClockType.Lcd` | Update `SetClockStyleButtonStates` atomically with XAML change; add LCD row gating in the same method alongside the Dial Face row gating |
| LCD blinking colon | Separate 500ms blink timer added alongside existing 1s timer | Implement blink as a `_colonVisible` toggle inside `UpdateTime()` — no new timer |
| LCD ghost mode interaction | 1s timer fires during ghost mode (wasted redraws, potential SizeToContent side effects) | Pass a skip predicate into `LcdClockView` from `MainWindow.ContentRendered` |
| Japanese provider registration | Keys like `"ja-terse"` not registered; `PhraseEngine.SetLocale` returns false silently | Register keys in `_providers` first; verify `CurrentLocale` after `SetLocale` call |
| Japanese style routing in `SetLanguage` | `"ja"` branch ignores `_currentPhraseStyle`; style combo stays disabled for Japanese | Update both `SetLanguage` and `ApplySettings` locale resolution blocks; remove `"ja"` from the disable-combo condition |
| Japanese providers + `[DoNotParallelize]` | Engine integration tests not marked non-parallelizable; locale contamination | Provider tests (isolation) in any class; engine tests in `PhraseEngineCoordinatorTests` |
| AppSettings round-trip test | LCD fields not asserted in `STEST-01` | Audit and add assertions before writing LCD persistence code |

---

## Sources

| Source | Confidence |
|--------|------------|
| `FuzzyClock.App/ClockType.cs` — `ClockType.Lcd` confirmed as existing enum member | HIGH |
| `FuzzyClock.App/AppSettings.cs` — `LcdUse24Hr`, `LcdShowSeconds`, `LcdStyle`, `LcdSize` confirmed present with init defaults | HIGH |
| `FuzzyClock.App/SettingsSnapshot.cs` — same four fields confirmed present | HIGH |
| `FuzzyClock.App/Controls/LcdClockView.xaml.cs` — 1s `DispatcherTimer` lifecycle via `IsVisibleChanged` confirmed; `_colonVisible` blink toggle not present | HIGH |
| `FuzzyClock.App/Controls/SevenSegmentDigit.xaml.cs` — no blink state; `Character = ' '` renders full-width blank digit | HIGH |
| `FuzzyClock.App/SettingsWindow.xaml` — `BtnLcd` absent from clock style rail; no LCD options row present | HIGH |
| `FuzzyClock.App/SettingsWindow.xaml.cs` `SetClockStyleButtonStates` — three buttons only (`BtnPhrase`, `BtnDial`, `BtnNixie`); no `BtnLcd` | HIGH |
| `FuzzyClock.App/MainWindow.xaml.cs` lines 330–374 — `ApplySettings` locale resolution block: `"ja"` branch uses `effectiveLocale = locale` without style mapping | HIGH |
| `FuzzyClock.App/MainWindow.xaml.cs` lines 1397–1441 — `SetLanguage` `"ja"` branch same shortcut | HIGH |
| `FuzzyClock.App/SettingsWindow.xaml.cs` line 103 — `CmbPhraseStyle.IsEnabled = !isNonEnglish`; `"ja"` in the disable list | HIGH |
| `FuzzyClock.App/SettingsWindow.xaml.cs` line 437 — `CmbPhraseLanguage_SelectionChanged`: same `"ja"` disable condition | HIGH |
| `FuzzyClock.Core/PhraseEngine.cs` — no `"ja-terse"`, `"ja-poetic"`, `"ja-rude"` keys in `_providers` dictionary | HIGH |
| `FuzzyClock.App/GhostModeController.cs` — ghost mode sets `Window.Opacity = 0` + `WS_EX_TRANSPARENT`; does not collapse `LcdView` | HIGH |
| `.planning/PROJECT.md` — active requirements LCD-01 through LCD-04, JA-01 through JA-03 | HIGH |

---

*Pitfalls research for: Fuzzy Clock v3.9 — LCD Clock + Japanese Styles*
*Researched: 2026-03-23*
