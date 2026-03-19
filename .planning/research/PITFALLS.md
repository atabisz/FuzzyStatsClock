# Domain Pitfalls

**Domain:** WPF C# — Adding Nixie clock type; DialMode bool → ClockType enum migration
**Project:** Fuzzy Clock v3.7 Nixie re-introduction
**Researched:** 2026-03-19
**Confidence:** HIGH — all pitfalls verified by direct source audit of MainWindow.xaml.cs, SettingsWindow.xaml.cs, AppSettings.cs, SettingsSnapshot.cs, and SettingsService.cs

---

## Critical Pitfalls

Mistakes that cause build failures or silent runtime regressions.

---

### Pitfall 1: Seven Events Subscribed in MainWindow That Are Not Declared in SettingsWindow

**What goes wrong:** `MainWindow.OpenSettings()` (lines 460–481) subscribes to seven events that do not exist as declared members on `SettingsWindow`. The project cannot compile until all seven are added.

**Why it happens:** The subscription block in MainWindow was written in anticipation of SettingsWindow being updated, but the corresponding `public event Action<T>?` declarations were never written into `SettingsWindow.xaml.cs`. The SettingsWindow event block (lines 22–48) ends with `BackdropOpacityPercentChanged` — none of the seven Nixie/LCD/dial events follow it.

**Confirmed missing declarations** (verified against SettingsWindow.xaml.cs lines 22–48):

| Event | Subscribed in MainWindow | Declared in SettingsWindow |
|-------|--------------------------|---------------------------|
| `ClockTypeChanged` | line 460 | No — `DialModeChanged` (Action<bool>) is declared instead |
| `LcdUse24HrChanged` | line 461 | No |
| `LcdShowSecondsChanged` | line 467 | No |
| `LcdStyleChanged` | line 473 | No |
| `ShowHourTicksChanged` | line 479 | No |
| `ShowMinuteDotsChanged` | line 480 | No |
| `ShowHourNumbersChanged` | line 481 | No |

**Consequences:** Seven CS1061 compile errors. Build is blocked until all seven are present.

**Prevention:** Treat this as a precondition before any feature work. Add all seven declarations to SettingsWindow.xaml.cs in the per-setting events block in a single pass. Do not add them one at a time across separate commits — the project cannot be tested in any intermediate state.

**Detection:** `dotnet build` reveals all seven immediately. Also: grep `_settingsWindow\.\w+Changed\s*\+=` in MainWindow and diff against the declared events in SettingsWindow.

**Phase:** NIX-04 (pre-existing build errors) — address first, before any other work.

---

### Pitfall 2: Stale `_dialMode` Field Reference in `ApplyPhraseWrap`

**What goes wrong:** `MainWindow.xaml.cs` line 718 references `_dialMode` in the phrase-wrap guard:

```csharp
if (_dialMode || _currentTextStyle == "Split" || !_phraseWrapEnabled)
```

There is no `_dialMode` field declared in `MainWindow`. The field was replaced by `_clockType: ClockType` in a prior refactor. This is a pre-existing compile error (CS0103).

**Why it happens:** The phrase-wrap guard was not updated when the field was renamed. The condition semantics are "skip wrap logic when not in phrase mode." The correct replacement is `_clockType != ClockType.Phrase`.

**Consequences:** CS0103 compile error. The entire project fails to build until fixed.

**Prevention:** Replace with `_clockType != ClockType.Phrase` as part of NIX-04. After the fix, grep `_dialMode` across all `.cs` files — zero occurrences should remain.

**Detection:** `dotnet build` identifies line 718 immediately.

**Phase:** NIX-04 (pre-existing build errors).

---

### Pitfall 3: `DialModeChanged` Not Replaced With `ClockTypeChanged` — Three Locations Must Change Together

**What goes wrong:** `SettingsWindow.xaml.cs` declares `public event Action<bool>? DialModeChanged` and fires it in two places: `BtnPhrase_Click` (line 386, fires `false`) and `BtnDial_Click` (line 393, fires `true`). Renaming the event without updating all three locations leaves dangling references or silent dead code.

**Why it happens:** Three locations in one file — easy to update partially: declare the new event but leave old fire sites, or remove the declaration but leave callers.

**Consequences:**
- If `ClockTypeChanged` is declared but `DialModeChanged` is left firing in old handlers: MainWindow subscribes to `ClockTypeChanged` but it is never invoked from Phrase/Dial buttons — silent bug.
- If `DialModeChanged` is removed before handlers are updated: CS0117 compile errors in `BtnPhrase_Click` and `BtnDial_Click`.

**Prevention:** Update all three locations atomically:
1. Remove `public event Action<bool>? DialModeChanged;` — add `public event Action<ClockType>? ClockTypeChanged;`.
2. Replace `BtnPhrase_Click` body to fire `ClockTypeChanged?.Invoke(ClockType.Phrase)`.
3. Replace `BtnDial_Click` body to fire `ClockTypeChanged?.Invoke(ClockType.Dial)`.
4. Add `BtnNixie_Click` to fire `ClockTypeChanged?.Invoke(ClockType.Nixie)`.

After migration, grep `DialModeChanged` — zero occurrences expected.

**Phase:** NIX-02 (SettingsWindow 3-button rail).

---

### Pitfall 4: `PopulateControls` Reads `s.DialMode` After `SettingsSnapshot.DialMode` Is Removed

**What goes wrong:** `SettingsWindow.xaml.cs` line 79 calls `SetClockStyleButtonStates(s.DialMode)`. When `SettingsSnapshot.DialMode` is removed as part of NIX-01, this is a CS1061 compile error.

**Why it happens:** `PopulateControls` reads the snapshot to pre-fill the UI on open. It was written for the bool-era model and was not updated in the prior refactor.

**Consequences:** Build failure immediately after `SettingsSnapshot.DialMode` is removed.

**Prevention:** When removing `SettingsSnapshot.DialMode`, update `PopulateControls` in the same change to call `SetClockStyleButtonStates(s.ClockType)`. These two changes are logically coupled — do not split them across commits.

**Phase:** NIX-01 (AppSettings/SettingsSnapshot migration).

---

### Pitfall 5: Removing `AppSettings.DialMode` Without Auditing All Callers

**What goes wrong:** Before deleting `public bool DialMode { get; init; }` from `AppSettings`, any code reading `settings.DialMode` or constructing `AppSettings` with `DialMode = ...` becomes a compile error.

**Why it happens:** `DialMode` appears in `SettingsSnapshot` (separate class) and may appear in test code, reset logic, or serialization tests. Each site is a separate compile error.

**Consequences:** Cascade of CS1061 errors in any file that constructs or reads `AppSettings.DialMode` or `SettingsSnapshot.DialMode`.

**Prevention:** Before deleting, run: grep `\.DialMode` and `DialMode\s*=` across the entire solution. Enumerate every site. Fix all sites before deleting the field. The `SettingsService.Load()` migration block at lines 53–61 is safe — it reads `DialMode` from the raw `JsonDocument` via `TryGetProperty`, not from the deserialized record field (see Pitfall 8 below for details).

**Detection:** `dotnet build` after field deletion reveals all remaining callers.

**Phase:** NIX-01.

---

### Pitfall 6: `GetCurrentSettingsSnapshot()` Not Updated to Include New Fields — Settings Window Opens With Wrong State

**What goes wrong:** `GetCurrentSettingsSnapshot()` in `MainWindow.xaml.cs` builds the `SettingsSnapshot` passed to SettingsWindow at open time. If `ClockType`, `LcdUse24Hr`, `LcdShowSeconds`, `LcdStyle`, and `LcdSize` are added to `SettingsSnapshot` as `init` fields but `GetCurrentSettingsSnapshot()` is not updated to populate them, the fields carry their C# defaults — `ClockType.Phrase` default means the Settings window shows Phrase selected even when Nixie is active.

**Why it happens:** Adding `init` fields to a record does not cause a compile error if omitted from a `with` expression or constructor call — the default silently fills in. There is no compile-time enforcement that every field is populated.

**Consequences:** Silent visual bug. User selects Nixie via tray menu, opens Settings window — the Phrase button is highlighted, not Nixie. The Settings window misrepresents the current state.

**Prevention:** After adding fields to `SettingsSnapshot`, immediately search for all `SettingsSnapshot` construction sites and verify each one populates the new fields. At minimum verify `GetCurrentSettingsSnapshot()` includes `ClockType = _clockType` and the LCD fields from `_lcdUse24Hr`, `_lcdShowSeconds`, `_lcdStyle`, and `FontSizeToLcdSize(_fontSize)`.

**Detection:** Select Nixie via tray menu. Open Settings window. The Nixie button must appear highlighted (selected state). Visual inspection catches this.

**Phase:** NIX-01 + NIX-02 boundary — must be verified when SettingsWindow is first exercised with Nixie active.

---

### Pitfall 7: `SetClockStyleButtonStates` Signature Still Takes `bool` — Nixie Button State Never Set

**What goes wrong:** `SetClockStyleButtonStates(bool dialMode)` uses a bool — there is no bool value for "Nixie." After adding BtnNixie, if the method signature is not changed to `SetClockStyleButtonStates(ClockType ct)`, the Nixie button's `Tag` is never set to `"selected"` and appears unselected even when Nixie is active.

**Why it happens:** Changing a method signature requires updating the declaration and every call site. If the declaration is changed but a call site (e.g., `PopulateControls`) still passes a bool, there is a compile error. If the call site is changed but the body still only sets BtnPhrase and BtnDial tags, the Nixie button state is silently wrong.

**Consequences:** Nixie button never visually selected in Settings. Compile error if any caller still passes `bool`.

**Prevention:** Change signature and body together. New required body:

```csharp
BtnPhrase.Tag = ct == ClockType.Phrase ? "selected" : null;
BtnDial.Tag   = ct == ClockType.Dial   ? "selected" : null;
BtnNixie.Tag  = ct == ClockType.Nixie  ? "selected" : null;
```

Update all callers (at minimum `PopulateControls`, `BtnPhrase_Click`, `BtnDial_Click`, and the new `BtnNixie_Click`) in the same pass.

**Detection:** Compile error if any bool caller remains. Visual inspection: select Nixie — Nixie button must appear highlighted.

**Phase:** NIX-02.

---

## Moderate Pitfalls

---

### Pitfall 8: Mistakenly Believing `AppSettings.DialMode` Removal Breaks the JSON Migration

**What goes wrong (misconception):** Developers see the migration block in `SettingsService.Load()` and assume removing `AppSettings.DialMode` breaks it. This is incorrect. The migration reads `DialMode` from `JsonDocument.RootElement.TryGetProperty("DialMode", ...)` on the raw JSON string — it never reads `loaded.DialMode` from the deserialized record.

**Why it matters:** The risk is the developer keeps `DialMode` in the record "just to be safe," which adds unnecessary noise and requires that the field remain in all record construction sites — the opposite of the goal.

**The correct understanding:** Removing `DialMode` from the `AppSettings` record does not affect the migration. The `JsonDocument` path is fully independent. Old `settings.json` files with `"DialMode": true` will still migrate correctly after the field is removed from the record.

**Prevention:** Read `SettingsService.Load()` lines 53–61 before assuming removal breaks migration. Remove the field; leave the migration code unchanged.

**Phase:** NIX-01.

---

### Pitfall 9: `BtnNixie` XAML Element Missing — Handler Compiles but Crashes at Runtime

**What goes wrong:** `BtnNixie_Click` is added to the code-behind and `BtnNixie` is referenced in `SetClockStyleButtonStates`, but `<Button x:Name="BtnNixie">` is never added to `SettingsWindow.xaml`. The project compiles (WPF XAML element absence is not a compile error in code-behind references to named elements), but throws `NullReferenceException` on `BtnNixie.Tag` the first time `SetClockStyleButtonStates` is called.

**Why it happens:** XAML and code-behind are edited separately. It is easy to write the handler and forget the XAML element, especially if the developer is working from the code-behind first.

**Consequences:** NullReferenceException when Settings window opens. Works fine until Settings is opened.

**Prevention:** Add the XAML `<Button x:Name="BtnNixie" Content="Nixie" Style="{StaticResource SegmentButtonStyle}" Click="BtnNixie_Click"/>` and the code-behind handler in the same commit. No style override needed — `SegmentButtonStyle` with `Padding="12,4"` already applies.

**Detection:** Opening the Settings window with any clock type active crashes with a NullReferenceException at BtnNixie.Tag.

**Phase:** NIX-02.

---

### Pitfall 10: `ResetToDefaults` Does Not Reset Clock Type to Phrase

**What goes wrong:** `ResetToDefaults()` in `MainWindow.xaml.cs` may still reference `AppSettings.DialMode` (compile error after removal) or may construct a reset `AppSettings` without setting `ClockType = ClockType.Phrase` (silent behavior bug — reset applies default value which happens to be `ClockType.Phrase`, but should be explicit).

**Why it happens:** `ResetToDefaults` was written before the `ClockType` enum and may not have been updated when the enum was introduced.

**Consequences:** After `DialMode` removal: compile error if the reset code references the removed field. Even if there is no compile error: if the reset does not call `SetClockType(ClockType.Phrase)` explicitly, the widget stays in Nixie mode after Reset to Defaults.

**Prevention:** Audit `ResetToDefaults()` during NIX-01. Confirm it explicitly calls `SetClockType(ClockType.Phrase)` and constructs any reset `AppSettings` with `ClockType = ClockType.Phrase`.

**Detection:** Select Nixie → tray "Reset to Defaults" → verify widget returns to Phrase mode immediately.

**Phase:** NIX-01.

---

### Pitfall 11: AppSettings Round-Trip Test Fails or Silently Gaps After Schema Change

**What goes wrong:** The existing `STEST-01` (AppSettings JSON round-trip) asserts all fields round-trip. After removing `DialMode` and adding `ClockType` + LCD fields, the test either:
- Fails to compile if it constructs `AppSettings` with `DialMode = ...` or asserts `loaded.DialMode`.
- Silently gaps if it does not assert the new `ClockType`, `LcdUse24Hr`, `LcdShowSeconds`, `LcdStyle` fields.

**Why it happens:** Schema changes require manual test updates. There is no tooling that enforces "every `AppSettings` field must have a round-trip assertion."

**Consequences:** Test compile errors (easily caught). Or a green test suite that does not actually verify the new fields persist correctly (harder to catch — only discovered when a user reports their Nixie preference not persisting across restarts).

**Prevention:** Update `STEST-01` in the same commit as NIX-01: remove `DialMode` assertion, add assertions for `ClockType`, `LcdUse24Hr`, `LcdShowSeconds`, `LcdStyle`. Add one absent-field test: verify that a `settings.json` without a `ClockType` field deserializes to `ClockType.Phrase` (the init default).

**Detection:** `dotnet test` compilation failure if the test references removed field. Green test with missing assertions only caught by manual review.

**Phase:** NIX-01.

---

### Pitfall 12: NixieClockView Timer Double-Start on Re-Activation

**What goes wrong:** `NixieClockView` manages its own 1-second `DispatcherTimer` via `IsVisibleChanged`. If the `IsVisibleChanged` handler starts the timer on `Visible` but does not stop it on `Collapsed`, switching Nixie → Phrase → Nixie results in two timers running simultaneously. The Nixie display updates twice per second — no crash, but digit flickering.

**Why it happens:** `IsVisibleChanged` fires on both `Visible→Collapsed` and `Collapsed→Visible`. A handler that only starts the timer on the Visible transition and never stops it allows accumulation on each re-activation.

**Consequences:** Double-tick rate on Nixie digits. Harmless but visually broken.

**Prevention:** Read `NixieClockView.xaml.cs` `IsVisibleChanged` handler before implementing `SetClockType`. Confirm it explicitly stops the timer when `IsVisible == false` and starts it when `IsVisible == true`.

**Detection:** Select Nixie → select Phrase → select Nixie again. Observe digit update cadence. If digits appear to flicker or update faster than 1s, the timer is double-starting.

**Phase:** NIX-03 (wiring Nixie into the widget).

---

### Pitfall 13: Tray Menu Clock Type Checkmark Not Synced After Settings Window Selection

**What goes wrong:** The tray context menu has a `_nixieClockItem` and peer items for Phrase and Dial. `ContextMenu_Opened` syncs checkmarks from the current `_clockType` field. If changing clock type via the Settings window somehow does not update `_clockType`, the tray menu shows a stale checkmark.

**Why it happens:** `SetClockType()` called from the Settings window `ClockTypeChanged` event must update `_clockType`. If the subscriber in `OpenSettings()` calls `SetClockType(ct)` (correct) but `SetClockType()` has a guard that skips the assignment when the type is already the current type, re-opening Settings and selecting the same type may not update the checkmark on first sync.

**Consequences:** Tray menu shows wrong checkmark — cosmetic but confusing.

**Prevention:** Confirm `SetClockType()` always updates `_clockType` unconditionally (or with a guard only against no-op redraws, not against state updates). Confirm `ContextMenu_Opened` reads from `_clockType` directly.

**Detection:** Select Nixie via Settings window. Right-click tray menu. Verify Nixie is checked and Phrase/Dial are unchecked.

**Phase:** NIX-03.

---

## Minor Pitfalls

---

### Pitfall 14: `ApplyFontSize()` Has a Nixie Branch — Verify It Uses `SetClockType` Not `_dialMode`

**What goes wrong:** `ApplyFontSize()` contains a branch for non-phrase modes (dial size scaling). After the `_dialMode` reference is removed, this branch may reference `_dialMode` as well — causing another stale reference compile error that is separate from the one in `ApplyPhraseWrap`.

**Why it happens:** `_dialMode` was used in multiple conditional branches; the `ApplyPhraseWrap` reference is documented, but there may be additional sites.

**Consequences:** Additional CS0103 compile error if any other `_dialMode` reference is missed during NIX-04.

**Prevention:** Grep `_dialMode` before marking NIX-04 complete. The post-fix count must be exactly zero.

**Phase:** NIX-04.

---

### Pitfall 15: LCD Fields Added to `AppSettings` But Not to `SettingsService.Validate()`

**What goes wrong:** `SettingsService.Validate()` guards numeric fields against out-of-range values (e.g., `StatsIntervalSeconds`, `Opacity`, `AccentColor`). New LCD fields like `LcdStyle` (a string) may need validation. If `LcdStyle` is persisted as a string and a user manually edits `settings.json` to an unknown value, `SetClockType(ClockType.Lcd)` would use the bad value directly.

**Why it happens:** New fields are added to `AppSettings` but validation rules are only added when someone remembers to update `Validate()`.

**Consequences:** No crash, but potentially a visual glitch (unknown style string applied to the LCD view).

**Prevention:** When adding `LcdStyle` to `AppSettings`, add a guard in `Validate()`: if `LcdStyle` is not in the known set (`"Dark"`, `"Light"`, `"Classic"`), reset to `"Dark"`. Follow the same pattern as the existing `AccentColor` null/whitespace guard.

**Detection:** Manually edit `settings.json` to `"LcdStyle": "bogus"`. Launch app. LCD should degrade gracefully or reset to default — not crash.

**Phase:** NIX-01.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| NIX-04: Fix pre-existing build errors | Seven missing event declarations + one stale `_dialMode` reference — project does not compile | Run `dotnet build` as the very first step; fix all compile errors before touching any feature code; grep `_dialMode` to zero |
| NIX-01: AppSettings/SettingsSnapshot migration | Removing `DialMode` cascades to `PopulateControls`, `ResetToDefaults`, round-trip tests | Grep `DialMode` across entire solution; fix all sites in one pass; update `STEST-01` in the same commit |
| NIX-02: SettingsWindow 3-button rail | `DialModeChanged` → `ClockTypeChanged` rename touches three locations; `SetClockStyleButtonStates` signature must change | Treat event rename and method signature as a single atomic change; add BtnNixie XAML element and handler together |
| NIX-03: Widget Nixie wiring | `NixieClockView` timer lifecycle; tray menu sync; `GetCurrentSettingsSnapshot` accuracy | Test the select-Nixie → select-Phrase → select-Nixie cycle; open Settings after each selection and verify button state matches |
| Test coverage | New fields must be in round-trip test; absent-field test for `DialMode`-less JSON | Update `STEST-01`; add one absent-field test; verify 274 → 275+ tests pass after NIX-01 |

---

## Sources

| Source | Confidence |
|--------|------------|
| `FuzzyClock.App/MainWindow.xaml.cs` lines 460–481 — subscription block, all seven missing events confirmed | HIGH |
| `FuzzyClock.App/SettingsWindow.xaml.cs` lines 22–48 — declared event list, `DialModeChanged` present, seven events absent | HIGH |
| `FuzzyClock.App/SettingsWindow.xaml.cs` line 79 — `PopulateControls` reads `s.DialMode` | HIGH |
| `FuzzyClock.App/SettingsWindow.xaml.cs` lines 386, 393 — `DialModeChanged` fire sites | HIGH |
| `FuzzyClock.App/MainWindow.xaml.cs` line 718 — `_dialMode` stale reference confirmed by grep | HIGH |
| `FuzzyClock.App/SettingsService.cs` lines 53–61 — `JsonDocument` migration path confirmed independent of record field | HIGH |
| `.planning/phases/57-re-introduce-nixie-into-the-new-architecture/57-RESEARCH.md` — primary phase research, all gaps documented | HIGH |
| `.planning/PROJECT.md` — active requirements NIX-01 through NIX-04 | HIGH |

---

*Pitfalls research for: Fuzzy Clock v3.7 — Nixie clock type re-introduction*
*Researched: 2026-03-19*
