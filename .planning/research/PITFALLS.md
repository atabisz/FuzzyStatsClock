# Pitfalls Research

**Domain:** Adding Settings Window, Themes, Battery Alert, Phrase Styles, Multilingual to an existing WPF transparent overlay widget
**Project:** Fuzzy Clock v3.2
**Researched:** 2026-03-08
**Confidence:** HIGH — all pitfalls grounded in direct reading of `MainWindow.xaml.cs`, `AppSettings.cs`, `SettingsService.cs`, `PhraseEngine.cs`, test files, and `PROJECT.md` Key Decisions log.

---

> **Scope note:** This document covers pitfalls specific to v3.2 additions: a settings window (SETT-01 through SETT-07), named themes (THM-01 through THM-03), phrase styles (STYLE-01 through STYLE-04), multilingual phrase engine (LANG-01 through LANG-04), and battery alert (ALERT-01 through ALERT-03). Prior milestone pitfalls (WS_EX_TRANSPARENT, ghost mode, frozen brushes, DragMove, AltGr, click-through) are covered in prior PITFALLS.md versions and are not repeated here.

---

## Critical Pitfalls

Mistakes that cause incorrect behavior or require a rewrite to fix.

---

### Pitfall 1: Settings Window Writes Directly to AppSettings Fields — Widget State Gets Out of Sync

**What goes wrong:**
The settings window directly mutates individual fields in `AppSettings` and calls `SettingsService.Save()`. Meanwhile, `MainWindow` holds its own in-memory state in private fields (`_accentColor`, `_windowOpacity`, `_currentFontSize`, `_currentTextStyle`, `_dialMode`, etc.) that are authoritative for the live widget. `SaveSettings()` in `MainWindow` builds the record from these private fields. If the settings window bypasses these private fields and writes directly to `AppSettings`, the persisted JSON reflects the settings window's view while the live widget reflects `MainWindow`'s stale private fields. Closing and reopening the app produces the settings window's version; the live widget never applied the change.

**Why it happens:**
The pattern is tempting: the settings window has a reference to the `AppSettings` record or `SettingsService`, writes a field, saves, and considers the job done. But `MainWindow` does not observe `SettingsService` — it only reads settings at startup via `ApplySettings()`. There is no reactive binding between the JSON file and the live widget's private fields.

**How to avoid:**
Route all settings changes through `MainWindow`'s existing `Set*()` methods. The settings window must call into `MainWindow` (or a thin callback interface) for each change, not write to `AppSettings` directly. Example: changing font size must call `MainWindow.ApplyFontSize(size)`, not `settings = settings with { FontSize = size }; SettingsService.Save(settings)`. The existing `TrayMenuCallbacks` pattern (a struct of `Action` delegates) is the correct model — extend it for the settings window callbacks.

**Warning signs:**
- Widget does not update when a setting is changed in the settings window.
- After app restart, the widget shows the settings window's value but the live widget showed something different.
- `MainWindow._currentFontSize` diverges from `AppSettings.FontSize` in the debugger.

**Phase to address:** Settings window architecture phase — establish the callback interface before building any controls.

---

### Pitfall 2: Settings Window IsChecked / Control State Out of Sync on Open

**What goes wrong:**
The settings window opens and shows stale control states. A checkbox labeled "Ghost Mode" shows checked but ghost mode is actually disabled (the user toggled it via tray). A font size slider shows 32pt but the widget is displaying 16pt. The user changes a setting, clicks OK, and the "change" is a no-op because the control was already wrong and its final value matches the (stale) previous persisted state.

**Why it happens:**
The existing codebase's established pattern (from `ContextMenu_Opened`) is: sync control state from authoritative sources on every open, never in click handlers. The settings window is a WPF `Window`, not a `ContextMenu`, so there is no `ContextMenu_Opened` event — but the problem is identical. If the settings window is populated once (in the constructor or at creation time) and kept alive, it goes stale.

**How to avoid:**
Populate all settings window controls from `MainWindow`'s private fields (not from saved `AppSettings`) every time the settings window becomes visible. Do this in the `Loaded` handler or by calling a `Refresh()` method from the caller before showing. Concretely: `GetCurrentTrayState()` already builds a snapshot of all current state — use or extend that snapshot to populate the settings window on open.

**Warning signs:**
- Opening the settings window after a tray menu toggle shows the old value.
- Making a change in the settings window, closing and reopening: control shows the new value, but the widget still shows the old one (the widget was never updated because the "change" was a no-op from stale initial state).

**Phase to address:** Settings window population phase — enforce the "populate on open" invariant from the first commit.

---

### Pitfall 3: Settings Window Topmost / Owner Interaction Puts Widget Behind Settings Window

**What goes wrong:**
The widget is `Topmost="True"`. A standard WPF `Window` is not topmost by default. Opening the settings window causes it to appear behind the always-on-top widget. Alternatively: if the settings window is also set to `Topmost="True"`, it appears above all other applications' windows, which is annoying. A third failure mode: the widget and settings window fight for Z-order, causing flicker.

**Why it happens:**
WPF `Topmost="True"` uses `HWND_TOPMOST` in `SetWindowPos`. When the settings window is opened as a non-topmost window, it lands in the normal Z-order, below the topmost widget. The user cannot interact with the settings window because the widget is covering parts of it.

**How to avoid:**
Set `Owner` on the settings window to the main widget window. Setting `Owner` causes the settings window to always appear above its owner in Z-order, regardless of topmost status. The settings window should NOT be `Topmost="True"` — it should be owned by the main window. Pattern:

```csharp
var settingsWin = new SettingsWindow(callbacks);
settingsWin.Owner = this;  // 'this' is MainWindow
settingsWin.Show();
```

This causes the settings window to float above the overlay widget without fighting topmost Z-order. It also means the settings window appears in the Alt+Tab list (since it has a normal `WindowStyle`), which is correct — users should be able to Alt+Tab to the settings window.

Do NOT set the settings window as modal (`ShowDialog`) unless the intent is to block interaction with the widget entirely. The requirements specify "non-modal" (PROJECT.md Constraints).

**Warning signs:**
- Settings window appears behind the widget (can't interact with it).
- Settings window disappears when user clicks on another app (it fell behind other windows).
- Widget flickers when settings window is dragged.

**Phase to address:** Settings window creation phase — set `Owner` in the first iteration.

---

### Pitfall 4: AppSettings Record Migration — New Fields Silently Revert to C# Default, Not Init Default

**What goes wrong:**
v3.2 adds new fields to `AppSettings` (e.g., `PhraseStyle`, `Language`, `BatteryAlertThreshold`, `ActiveThemeName`). When an existing user's `settings.json` is loaded, `System.Text.Json` deserializes the fields it finds and leaves new fields at their C# type defaults: `bool` → `false`, `int` → `0`, `double` → `0.0`, `string` → `null`. The init defaults (`= "English"`, `= 20`, etc.) in the record declaration are NOT applied by the deserializer — they are only applied when the `new AppSettings()` constructor is called without specifying the field.

**Why it happens:**
`AppSettings` is an init-property record. `JsonSerializer.Deserialize<AppSettings>(json)` creates an instance using the parameterless constructor, which does apply init defaults — BUT only for fields not present in the JSON. Fields present in the JSON override the init default. Fields absent from the JSON get the init default. This is the correct behavior for backward compat.

The trap: a developer adds `public string PhraseStyle { get; init; } = "Classic";` to `AppSettings` and assumes `= "Classic"` will always fire. It will — for absent fields. But if `PhraseStyle` was somehow written as `null` or empty string by a bug in a prior version, the `= "Classic"` init default is bypassed and `null` enters the system.

More critically: `Validate()` must be extended for every new string/enum field. Without a `Validate()` guard, an empty or invalid persisted value reaches `MainWindow` and crashes (e.g., `PhraseStyle = null` causes NullReferenceException in the phrase lookup).

**How to avoid:**
For every new string field that maps to an enum set of valid values, add a guard to `SettingsService.Validate()` matching the existing pattern:

```csharp
string[] validPhraseStyles = { "Classic", "Terse", "Poetic", "Rude" };
if (string.IsNullOrWhiteSpace(loaded.PhraseStyle) || !validPhraseStyles.Contains(loaded.PhraseStyle))
    loaded = loaded with { PhraseStyle = Defaults().PhraseStyle };
```

For numeric fields with valid ranges, add range guards (e.g., `BatteryAlertThreshold` must be 10, 15, or 20).

Also: update `SettingsService.Defaults()` with every new field. The `Defaults()` method is the single source of truth for all default values — the test suite verifies round-trip and absent-field isolation. Add tests for each new field.

**Warning signs:**
- Widget crashes on startup after upgrading from a prior version (old `settings.json` missing new fields).
- A new field persists correctly from the settings window, but after closing and reopening, the widget ignores the setting.
- `Validate()` tests pass but the field was never added to `Validate()`.

**Phase to address:** AppSettings extension phase — every new field must have a Validate() guard and a Defaults() entry in the same commit.

---

### Pitfall 5: Theme Application Is Partial — New Elements Added to XAML but Not to ApplyTheme() and ApplyDisplayColor()

**What goes wrong:**
A new XAML element is added for v3.2 (e.g., a theme name label, a battery alert indicator, a settings button). `ApplyTheme()` is not updated to include the new element. The element shows the XAML default color (usually `White` or the XAML `Foreground` from inheritance) rather than the accent color. When the user changes accent color or when auto-contrast fires, the new element does not update. The bug is invisible on the default White theme but immediately visible when the user switches to Amber or Ice Blue.

**Why it happens:**
`ApplyTheme()` and `ApplyDisplayColor()` (lines 1071–1159 of `MainWindow.xaml.cs`) each contain an explicit list of every UI element that must be colored. There is no mechanism to discover new elements automatically — it is a manual list. Every new colored element must be added to BOTH methods. The two methods must cover identical element sets.

The existing code already has a documented precedent: MEMORY.md notes "Stats label TextBlocks must have x:Name (CpuLabel/GpuLabel/MemLabel/PagLabel) — both `ApplyDisplayColor` and `ApplyTheme` must cover the same full element set." This exact pitfall has happened before.

**How to avoid:**
- Immediately after adding any new XAML element that should be accent-colored, add it to `ApplyTheme()` AND `ApplyDisplayColor()` in the same commit.
- Run a visual test with Amber accent color after every UI addition — White is deceptively forgiving (XAML default `Foreground="White"` matches the White preset).
- Consider: add a code comment block at the top of `ApplyTheme()` listing "elements that must also be in ApplyDisplayColor" as a cross-check.

**Warning signs:**
- Element shows white text when accent is Amber/Ice Blue after applying theme.
- Element does not update when auto-contrast fires (stays accent-colored while everything else switches to black/white).
- Element reverts to XAML default color on "Reset to Defaults."

**Phase to address:** Every phase that adds new accent-colored XAML elements — verify theme coverage before marking done.

---

### Pitfall 6: Theme Application Is Not Atomic — Partial Theme State Visible During Apply

**What goes wrong:**
Applying a named theme (THM-02: "sets accent color, opacity, font size, clock style, and stats panel visibility atomically") via multiple sequential calls produces intermediate visible states. Example: `SetAccentColor()` calls `ApplyTheme()` then `SaveSettings()`. Then `ApplyFontSize()` calls `UpdateLayout()` and `SaveSettings()` again. Each call triggers a WPF layout pass and a file write. The user sees the widget reflow mid-theme-apply (phrases resize, widget jumps) and `settings.json` is written 3-4 times.

**Why it happens:**
Each `Set*()` method is self-contained and calls `SaveSettings()` independently. This was designed for tray menu one-at-a-time changes. For theme application (multiple changes at once), this pattern produces N layout passes and N file writes.

**How to avoid:**
Implement a batch-apply path for themes. Instead of calling `SetAccentColor()` then `ApplyFontSize()` then `SetDialMode()` sequentially, apply all changes to private fields at once and call `ApplyTheme()` + `UpdateLayout()` + `SaveSettings()` once at the end:

```csharp
private void ApplyNamedTheme(NamedTheme theme)
{
    // Update all private fields without any layout passes or saves
    _accentColor    = theme.AccentColor;
    _windowOpacity  = theme.Opacity;
    this.Opacity    = theme.Opacity;
    _currentFontSize = theme.FontSize;
    PhraseText.FontSize = theme.FontSize;
    // ... etc.

    // Single layout pass and save
    ApplyTheme();
    UpdateLayout();
    if (_hasUserPosition) { /* clamp */ }
    SaveSettings();
}
```

This avoids the multi-save and multi-layout issue.

**Warning signs:**
- Widget visibly flickers or jumps when applying a named theme.
- `settings.json` is written 4-5 times in rapid succession during theme apply (visible in file modification timestamps).
- Theme application is noticeably slower than single-setting changes.

**Phase to address:** Theme implementation phase — design batch-apply from the start.

---

### Pitfall 7: Multilingual Phrase Engine — CultureInfo from Windows Locale vs. UI Language

**What goes wrong:**
`CultureInfo.CurrentCulture` returns the user's regional format settings (date format, number format) — not the UI display language. A user whose Windows is set to display UI in French but has their regional format as English (US) will get `CurrentCulture = "en-US"` and the phrase engine falls back to English, ignoring the French UI. The correct source is `CultureInfo.CurrentUICulture`, which reflects the Windows display language.

**Why it happens:**
`CurrentCulture` and `CurrentUICulture` are different concepts in .NET. `CurrentCulture` is for formatting; `CurrentUICulture` is for language/display. Most developers reach for `CurrentCulture` first.

**How to avoid:**
Use `CultureInfo.CurrentUICulture.TwoLetterISOLanguageName` to detect the Windows display language:

```csharp
string lang = CultureInfo.CurrentUICulture.TwoLetterISOLanguageName; // "fr", "de", "es", "ja", "en"
```

Fall back to English for any language not in the supported set. The supported set (LANG-02) is: `en`, `fr`, `es`, `de`, `ja`.

**Warning signs:**
- French Windows user gets English phrases.
- User with French language but UK regional settings gets English phrases.
- Setting Windows language to French in a test VM does not change the phrase language.

**Phase to address:** Multilingual phrase engine phase — first line of language detection code.

---

### Pitfall 8: Multilingual Phrase Engine — Missing Time Bucket Coverage for Non-English Languages

**What goes wrong:**
The English phrase engine has 12 buckets per hour plus noon and midnight special cases. A partial multilingual implementation provides phrases for the most "interesting" buckets (noon, midnight, o'clock, half past, quarter past) but omits the fill-in buckets. At runtime, `GetPhrase()` throws `InvalidOperationException` ("No bucket matched") for any time that falls in an unmapped bucket. Since time advances continuously, this crash will occur within minutes of running the foreign-language widget.

**Why it happens:**
The bucket table in `PhraseEngine` is walk-ordered with an exhaustive fallthrough — every minute from 0 to 59 must match a bucket. The English implementation covers all 12 buckets exhaustively (verified by the test suite). A new language implementation that covers only 6 buckets leaves minutes 33-59 unmatched for most hours.

**How to avoid:**
Every language implementation must cover all 12 buckets for every minute 0-59. The test suite must verify exhaustive coverage for each language. The existing `PhraseEngineTests` pattern (DataRow per bucket boundary) must be replicated for each supported language. A parametric test across all 1440 minutes of the day (0:00–23:59) is the simplest completeness check:

```csharp
[TestMethod]
public void AllMinutesProduceNonEmptyPhrase_French()
{
    for (int h = 0; h < 24; h++)
        for (int m = 0; m < 60; m++)
            Assert.IsFalse(string.IsNullOrEmpty(
                PhraseEngine.GetPhrase(new DateTime(2024, 1, 1, h, m, 0), "fr")));
}
```

**Warning signs:**
- Widget crashes within minutes of switching to a non-English language.
- `InvalidOperationException: No bucket matched minute=X` in the event log.
- The crash only occurs at certain times of day.

**Phase to address:** Multilingual phrase engine phase — add exhaustive coverage tests before the language data is considered done.

---

### Pitfall 9: Multilingual Phrase Engine — Japanese Requires Character-Level Consideration, Not Template Substitution

**What goes wrong:**
The English phrase engine uses string template substitution (`{h}`, `{h1}`) for hour words. For Japanese (`ja`), this approach fails because Japanese time expressions have different grammatical structures. "3時" (san-ji) is "three o'clock" but the template `"{h} 時"` assumes the hour word comes first with a space — Japanese doesn't work that way. Time expressions in Japanese also use different forms depending on whether the time is "past" or "before": the template `"almost a quarter before {h1}"` would need to be `"{h1}時15分前ごろ"` — the hour token comes first, not last.

This breaks the assumption that templates always end with `{h}` or `{h1}` (see `GetStructuredPhrase()` which relies on `template.EndsWith("{h}")` and `template.EndsWith("{h1}")`).

**Why it happens:**
The template system was designed for Western European languages where hour words typically appear at the end of a phrase ("quarter past THREE", "almost FOUR"). Japanese and other non-SVO languages may place the hour reference at a different position.

**How to avoid:**
For Japanese, either:
1. Accept that `GetStructuredPhrase()` will always return the full phrase as `Emphasis` with empty `Qualifier` (degrade gracefully for split-layout modes), or
2. Design a separate phrase table without template substitution — each of the 12 buckets × 12 hours = 144 entries hardcoded in Japanese.

Option 2 is the correct approach for production quality. Option 1 is acceptable for an MVP if split-layout is documented as English-only.

Document in the phase plan which approach is chosen.

**Warning signs:**
- Japanese phrases appear with odd word ordering (hour number at wrong position).
- `GetStructuredPhrase()` splits Japanese phrases at the wrong point (returns the hour-word as qualifier, not as emphasis).
- Template substitution produces grammatically incorrect Japanese.

**Phase to address:** Multilingual phrase engine phase — evaluate Japanese phrase structure before designing the template system.

---

### Pitfall 10: Settings Window and Tray Menu State Diverge — Both Act as Independent Sources of Truth

**What goes wrong:**
The user opens the settings window. The tray menu is also open (or opened while settings window is visible). The user changes accent color in the settings window. The tray menu is not refreshed — its color-swatch indicator (if any) shows the old color. Conversely, the user changes a setting via the tray menu while the settings window is open. The settings window does not reflect the tray change.

More critically: if both the tray menu and the settings window call `Set*()` methods on MainWindow without coordination, and each does a `SaveSettings()`, rapid changes can produce a settings.json write storm.

**Why it happens:**
The tray menu uses `ContextMenu_Opened` to sync its checkmarks from `GetCurrentTrayState()` — but only on open. The settings window is a persistent (non-modal) window. Unlike a context menu that is rebuilt on open, the settings window controls can become stale while open.

**How to avoid:**
- The settings window must subscribe to a state-changed notification from `MainWindow` (or use the same `GetCurrentTrayState()` snapshot pattern) and refresh its controls whenever a setting changes via any other path (tray, scroll wheel, etc.).
- Alternatively, keep the settings window simple: close it whenever a tray menu change is made. This is aggressive but avoids stale state entirely.
- The simplest defensible approach: the settings window is non-modal and shows current state at open time. State divergence between tray and settings window is documented as "settings window shows values at time of open; use tray menu for quick changes." This is acceptable for v3.2 if clearly documented.

**Warning signs:**
- Tray menu checkmark doesn't match settings window checkbox for the same setting.
- User changes opacity via scroll wheel; settings window still shows old opacity.
- Rapid tray+settings changes corrupt `settings.json`.

**Phase to address:** Settings window architecture phase — decide on the refresh strategy before building controls.

---

### Pitfall 11: Battery Alert Color Conflicts with Auto-Contrast Color Override

**What goes wrong:**
The battery alert (ALERT-01) changes the battery row's accent color to red when the battery is low. `ApplyTheme()` sets `BattBar.Background = brush` and `BattText.Foreground = brush` (the accent color). The battery alert overrides these to red. Auto-contrast (`ApplyDisplayColor()`) also overrides these to black or white. The three systems conflict: auto-contrast fires 500ms after the battery alert sets red, resetting the battery row to the auto-contrast color (black/white). The red alert is never visible when auto-contrast is enabled.

**Why it happens:**
`ApplyDisplayColor()` unconditionally overrides all named elements including `BattBar` and `BattText`. The battery alert color is a transient per-element override that `ApplyDisplayColor` does not know about.

**How to avoid:**
Keep a `_batteryAlertActive` bool. In `ApplyDisplayColor()`, skip the battery row if `_batteryAlertActive` is true:

```csharp
if (!_batteryAlertActive)
{
    BattBar.Background  = brush;
    BattText.Foreground = brush;
}
// else: battery alert red is preserved
```

Symmetrically, when auto-contrast fires `Cleared` (restores accent color via `ApplyTheme()`), `ApplyTheme()` must also respect `_batteryAlertActive` for the battery row.

**Warning signs:**
- Battery alert red color flashes briefly, then disappears every 500ms when auto-contrast is enabled.
- Battery alert works when auto-contrast is off but not when it is on.

**Phase to address:** Battery alert phase — add the interaction guard at implementation time, not as a followup.

---

### Pitfall 12: SaveSettings() Must Include Every New AppSettings Field — Forgetting One Field Causes Silent Data Loss

**What goes wrong:**
A new field (`PhraseStyle`, `Language`, `BatteryAlertThreshold`, `ActiveThemeName`) is added to `AppSettings`. `ApplySettings()` reads it correctly on startup. But `SaveSettings()` in `MainWindow` builds the `AppSettings with { ... }` expression by explicitly listing every field. If the new field is not added to that expression, it silently reverts to the init default on every save. The user sets the language to French; `SaveSettings()` is called (e.g., on drag); the next startup shows English.

**Why it happens:**
`SaveSettings()` uses `_settings with { field1 = ..., field2 = ... }` — an explicit enumeration. This pattern requires manual synchronization. The test `STEST-08` pattern (round-trip test for new fields) catches this if the test is written — but only if the test is written.

**How to avoid:**
For every new `AppSettings` field, update `SaveSettings()` in the same commit that adds the field. The round-trip test (pattern from `AppSettingsTests.cs`) must cover every field. The existing test file already tests round-trip for all fields — extend it with DataRow entries for each new field.

**Warning signs:**
- A setting persists correctly in one session but reverts to default after any drag (which calls `SaveSettings()`).
- The `_settings` field in the debugger shows the correct value but `settings.json` on disk shows the default.
- Round-trip test catches this if the new field is included in the test.

**Phase to address:** AppSettings extension phase — enforced by the round-trip test that must be added.

---

### Pitfall 13: PhraseEngine Refactoring Breaks GetStructuredPhrase() — Split Layout Becomes Incorrect

**What goes wrong:**
Adding phrase styles (STYLE-01 through STYLE-04) requires changing `PhraseEngine.GetPhrase()` to return different text based on a style parameter. If `GetStructuredPhrase()` is not updated in parallel, the structured decomposition (Qualifier / Emphasis split) no longer matches the phrase text. Example: Terse style returns "half three" but `GetStructuredPhrase()` still decomposes based on the Classic "half past three" template. The `QualifierText` shows "half past" and `EmphasisText` shows "three" — but `PhraseText` would show "half three" if the views were not coordinated.

**Why it happens:**
`GetPhrase()` and `GetStructuredPhrase()` share the `Buckets` template table and `HourWords` array but are implemented independently. Adding phrase style changes the output of `GetPhrase()` but `GetStructuredPhrase()` is a separate method that may not be updated.

**How to avoid:**
`GetStructuredPhrase()` must accept the same style parameter as `GetPhrase()` and produce a decomposition consistent with the styled phrase text. Both methods must be updated atomically. The test suite must verify that `GetPhrase(dt, style)` and `GetStructuredPhrase(dt, style)` produce consistent output:

```csharp
// Invariant: Qualifier + " " + Emphasis == GetPhrase(dt, style) (modulo whitespace normalization)
```

This invariant should be a test.

**Warning signs:**
- In Split layout mode, `QualifierText` shows the Classic phrase qualifier while the phrase text shows the Terse/Poetic form.
- Split layout text is grammatically incorrect for non-Classic styles.
- Test suite passes because `GetStructuredPhrase` was not updated to accept a style parameter and tests only cover the Classic case.

**Phase to address:** Phrase style implementation phase — update both methods together, add consistency test.

---

### Pitfall 14: Test Coverage Gaps When Refactoring PhraseEngine — Existing Tests Are English-Only and Style-Agnostic

**What goes wrong:**
`PhraseEngineTests.cs` covers all 12 buckets and special cases (noon, midnight, hour conversion edge cases) for the Classic English style. Adding phrase styles and multilingual support changes the method signatures. The tests pass because they only test `GetPhrase(dt)` — the no-style, English-only overload. The new `GetPhrase(dt, "fr")` and `GetPhrase(dt, "Terse")` overloads have zero test coverage. Regressions in new overloads are invisible to CI.

**How to avoid:**
- Each new language must have its own exhaustive test class covering all 12 buckets × representative hours.
- Each new phrase style must have its own test class covering the expected output for each bucket.
- The completeness test (all 1440 minutes produce non-empty output) must run for every language and style combination.
- Do not rely on the existing English tests to validate new code paths — they test a different code path.

**Warning signs:**
- CI passes but the widget shows empty or incorrect phrases in French.
- A bucket mapping error in the German implementation is never caught by tests.
- `GetPhrase(dt, "Rude")` throws for certain minute values but this is not covered by any test.

**Phase to address:** Phrase style phase and multilingual phase — each must include comprehensive tests as a done-criteria, not as a followup.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Settings window reads from `AppSettings` record directly instead of `MainWindow` callbacks | Simpler settings window code | Widget state and settings window diverge; live widget not updated | Never — callbacks required |
| Apply theme by calling `SetAccentColor()` + `ApplyFontSize()` sequentially | Reuses existing code | N layout passes + N file writes; visible flicker | Acceptable for MVP if user won't notice; must be fixed before v3.2 ships |
| Use `CultureInfo.CurrentCulture` for language detection | Familiar API | Returns regional format, not display language; French users get English | Never — must use `CurrentUICulture` |
| Add new XAML element without updating `ApplyTheme()` + `ApplyDisplayColor()` | Saves one step | Element stays white on non-white accent; breaks auto-contrast | Never |
| Hardcode English phrase structure assumptions in `GetStructuredPhrase()` | Less refactoring | Japanese and other non-SVO languages produce incorrect splits | Acceptable with documentation: split-layout is English-only in v3.2 |
| Omit `Validate()` guard for new string fields | Less boilerplate | Null/invalid values from old settings.json crash the widget | Never — every new string enum field needs a guard |
| Omit new fields from `SaveSettings()` with { ... } | Easy to miss | Silent data loss — setting reverts to default on every drag | Never — caught by round-trip test if test is written |
| Battery alert color applied without `_batteryAlertActive` guard | Simpler code | Auto-contrast resets red alert color every 500ms | Never — interaction guard required |

---

## Integration Gotchas

Common mistakes when connecting new features to the existing MainWindow system.

| Integration Point | Common Mistake | Correct Approach |
|-------------------|----------------|------------------|
| Settings window → MainWindow | Settings window calls `SettingsService.Save()` directly | Route through `MainWindow.Set*()` callbacks (extend `TrayMenuCallbacks` pattern) |
| Settings window open state | Populate controls once at creation | Populate every time the window becomes visible from `GetCurrentTrayState()` snapshot |
| Settings window Z-order | Set `Topmost=True` on settings window | Set `Owner = mainWindow` — owned window floats above owner without needing topmost |
| Named theme apply | Call `SetAccentColor()` then `ApplyFontSize()` sequentially | Batch all field mutations, then single `ApplyTheme()` + `UpdateLayout()` + `SaveSettings()` |
| Battery alert + auto-contrast | `ApplyDisplayColor()` overrides battery row to black/white | Guard battery row in `ApplyDisplayColor()` with `_batteryAlertActive` bool |
| Battery alert + `ApplyTheme()` | `ApplyTheme()` overrides red alert back to accent color | Same guard — `ApplyTheme()` skips battery row when `_batteryAlertActive` |
| Language detection | `CultureInfo.CurrentCulture` | `CultureInfo.CurrentUICulture.TwoLetterISOLanguageName` |
| Multilingual `GetPhrase()` signature | Add overload `GetPhrase(dt, lang)` only | Also update `GetStructuredPhrase(dt, lang)` — they must be consistent |
| New AppSettings fields | Add to record, forget `SaveSettings()` and `Validate()` | Three-part atomic update: field in record + entry in `Defaults()` + guard in `Validate()` + row in `SaveSettings() with {}` |
| New accent-colored XAML elements | Only add to `ApplyTheme()` | Must add to BOTH `ApplyTheme()` and `ApplyDisplayColor()` |
| Settings window dismiss | `ShowDialog()` modal | `Show()` non-modal with `Owner = this` — PROJECT.md requires non-modal |
| Phrase style + split layout | Ignore `GetStructuredPhrase()` for non-Classic styles | Keep `GetPhrase()` and `GetStructuredPhrase()` consistent for every style; or document split-layout as English Classic only |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Settings window triggers `SaveSettings()` on every control change event | `settings.json` written on every slider tick; file I/O during typing | Debounce or save only on OK/close; use `PreviewMouseUp` for sliders | Any interactive slider or text field |
| Named theme calls multiple `Set*()` methods sequentially | N layout passes; widget visibly reflows during theme apply | Batch-apply pattern — mutate fields, then single `ApplyTheme()` + `UpdateLayout()` + `SaveSettings()` | Always visible during theme apply |
| Exhaustive multilingual test (1440 minutes × 5 languages × 4 styles) | Test suite slow | DataRow parametric tests — MSTest handles large DataRow tables efficiently; acceptable | Not a performance trap for test runtime |
| Language detection called on every `GetPhrase()` tick | `CultureInfo.CurrentUICulture` lookup every 10s | Cache language detection at startup; only re-detect on settings change | 10-second interval — effectively no impact |

---

## "Looks Done But Isn't" Checklist

- [ ] **Settings window sync:** Open settings window, change accent color via tray menu — settings window reflects the tray change (if live-sync is implemented) or vice-versa.
- [ ] **Settings window on open:** Toggle ghost mode via tray. Open settings window. Ghost mode checkbox shows correct current state.
- [ ] **Settings window Z-order:** Open settings window while widget is showing. Settings window is interactive and not hidden behind widget.
- [ ] **AppSettings round-trip for all new fields:** Add `PhraseStyle`, `Language`, `BatteryAlertThreshold`, `ActiveThemeName` to `AppSettingsTests.cs` round-trip test. All new fields appear in the serialized JSON and deserialize correctly.
- [ ] **Absent-field isolation for each new field:** Add test: `AppSettings` with new field absent deserializes to init default, not C# type default.
- [ ] **Validate() guards all new string enums:** `PhraseStyle = "NotAStyle"` → `Validate()` resets to `"Classic"`. Same for `Language`, `ActiveThemeName`.
- [ ] **SaveSettings() includes all new fields:** Drag widget after setting language to French. Close and reopen app. Language is still French.
- [ ] **Theme is atomic:** Apply a named theme. Observe widget — no intermediate flicker. `settings.json` written exactly once.
- [ ] **Battery alert + auto-contrast:** Enable auto-contrast. Simulate low battery. Red alert color is visible (not overridden by auto-contrast to black/white).
- [ ] **Battery alert cleared on plugin:** Plug in (or set IsPluggedIn=true). Red alert immediately disappears; accent color restored.
- [ ] **Multilingual exhaustive coverage:** `GetPhrase(dt, "fr")` does not throw for any minute 0–59, any hour 0–23. Same for `"de"`, `"es"`, `"ja"`.
- [ ] **Phrase style consistency:** For every style, `GetPhrase()` output is consistent with `GetStructuredPhrase()` output. Qualifier + space + Emphasis equals or is consistent with the full phrase.
- [ ] **ApplyTheme() + ApplyDisplayColor() element parity:** List all elements in `ApplyTheme()`. Verify same list appears in `ApplyDisplayColor()`. Test with Amber accent + auto-contrast: every accent element changes to black/white.
- [ ] **Language detection uses CurrentUICulture:** Set Windows display language to French. Widget shows French phrases. (Without this test, `CurrentCulture` bug is invisible on US-English setups.)

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Widget state / settings window out of sync (P1) | HIGH — architectural | Add callback interface to `MainWindow`; route all settings changes through it; remove direct `AppSettings` writes from settings window |
| Settings window shows stale state on open (P2) | LOW | Add `Refresh()` call using `GetCurrentTrayState()` before `Show()` |
| Settings window behind widget (P3) | LOW | Set `settingsWin.Owner = this` — one line |
| Missing Validate() guard for new field (P4) | LOW | Add guard + test; deploy patch settings.json with correct default |
| Partial theme application — element not in ApplyTheme/ApplyDisplayColor (P5) | LOW | Add element to both methods; test with all accent presets |
| Non-atomic theme apply causing flicker (P6) | MEDIUM | Refactor to batch-apply method; one layout pass |
| Wrong CultureInfo type for language detection (P7) | LOW | Change `CurrentCulture` to `CurrentUICulture` — one-line fix |
| Missing multilingual bucket coverage → crash (P8) | HIGH — data work | Write all missing bucket translations; add exhaustive test |
| Japanese template substitution incorrect (P9) | HIGH — redesign | Replace template system with full phrase table for Japanese |
| Battery alert overridden by auto-contrast (P11) | LOW | Add `_batteryAlertActive` guard in `ApplyDisplayColor()` and `ApplyTheme()` |
| New field missing from SaveSettings() (P12) | LOW | Add field to `with {}` expression; add round-trip test |
| GetStructuredPhrase() inconsistent after PhraseEngine refactor (P13) | MEDIUM | Update `GetStructuredPhrase()` to match `GetPhrase()` for each new style |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Settings window writes directly — widget not updated (P1) | Settings window architecture | Change a setting via window; verify widget updates live |
| Settings window stale state on open (P2) | Settings window population | Toggle ghost mode via tray; open settings window; checkbox correct |
| Settings window behind widget (P3) | Settings window creation | Open settings window; confirm it is interactive and in front of widget |
| New AppSettings fields missing Validate() (P4) | AppSettings extension | Inject invalid string into `settings.json`; verify Validate() corrects it |
| New XAML elements missing from ApplyTheme/ApplyDisplayColor (P5) | Any phase adding UI elements | Test with Amber and Ice Blue accent; verify all elements change color |
| Non-atomic theme apply (P6) | Theme implementation | Apply named theme; observe widget — no intermediate reflow |
| Wrong CultureInfo for language detection (P7) | Multilingual phase | Set Windows to French display language; verify French phrases |
| Missing bucket coverage in non-English languages (P8) | Multilingual phase | Exhaustive 1440-minute test for each language |
| Japanese template substitution (P9) | Multilingual phase | Review all Japanese phrase outputs manually; compare to native speaker |
| Tray / settings window state divergence (P10) | Settings window architecture | Change setting via tray while settings window open; document behavior |
| Battery alert + auto-contrast conflict (P11) | Battery alert phase | Enable auto-contrast; simulate low battery; red alert persists |
| Missing field in SaveSettings() (P12) | AppSettings extension | Round-trip test in `AppSettingsTests.cs` for each new field |
| GetStructuredPhrase() inconsistency after refactor (P13) | Phrase style phase | Add consistency invariant test |
| Test coverage gaps for new styles/languages (P14) | Phrase style and multilingual phases | CI gate: exhaustive DataRow tests for every new overload |

---

## Sources

| Source | Confidence |
|--------|------------|
| `MainWindow.xaml.cs` — `ApplyTheme()`, `ApplyDisplayColor()`, `SaveSettings()`, `ApplySettings()`, `TrayMenuCallbacks` pattern, `GetCurrentTrayState()`; read directly from source | HIGH |
| `AppSettings.cs` — init-property record pattern; all current fields and defaults; read directly from source | HIGH |
| `SettingsService.cs` — `Validate()` guards for each existing string enum field; `Defaults()`; read directly from source | HIGH |
| `PhraseEngine.cs` — `GetPhrase()`, `GetStructuredPhrase()`, `Buckets` table, template substitution pattern; read directly from source | HIGH |
| `PhraseEngineTests.cs` — existing test coverage (12 buckets, edge cases, English-only); read directly from source | HIGH |
| `SettingsServiceTests.cs` + `AppSettingsTests.cs` — existing round-trip and Validate test patterns; read directly from source | HIGH |
| `PROJECT.md` Key Decisions — "ApplySettings() before Show()" invariant, "SetStatsVisible() separate from ApplySettings()" invariant, "ContextMenu_Opened for IsChecked sync", "init-property record for JSON forward/backward compat", "AppSettings → init-property record" decision; read directly from source | HIGH |
| `MEMORY.md` — "Stats label TextBlocks must have x:Name — both ApplyDisplayColor and ApplyTheme must cover the same full element set" (documented from past regression); project memory file | HIGH |
| .NET documentation — `CultureInfo.CurrentCulture` vs `CultureInfo.CurrentUICulture`: `CurrentUICulture` reflects the OS display language; `CurrentCulture` reflects regional format. Confirmed from .NET BCL docs (learn.microsoft.com/en-us/dotnet/api/system.globalization.cultureinfo.currentuiculture) | HIGH |
| WPF Window ownership — `Window.Owner` causes owned window to always appear above owner in Z-order; owned window follows owner when it is minimized/restored. Standard WPF pattern documented in MSDN. | HIGH |

---

*Pitfalls research for: Fuzzy Clock v3.2 — Settings Window, Themes, Battery Alert, Phrase Styles, Multilingual*
*Researched: 2026-03-08*
