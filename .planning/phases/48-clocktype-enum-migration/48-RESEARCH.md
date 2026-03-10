# Phase 48: ClockType Enum Migration - Research

**Researched:** 2026-03-10
**Domain:** C# enum introduction, JSON backward-compat migration, WPF visibility switching
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID  | Description | Research Support |
|-----|-------------|-----------------|
| F1  | New enum `ClockType { Phrase, Dial, Lcd }` in `FuzzyClock.App`; `AppSettings.DialMode` (bool) removed, `AppSettings.ClockType` added (default `Phrase`); JSON backward-compat: persisted `"DialMode": true` → `ClockType.Dial`, `false`/absent → `ClockType.Phrase`; `MainWindow`, `SettingsWindow`, `TrayMenuBuilder`, `ThemeDefinition` updated; all 224 tests green | Full scope mapped below — every call site identified, migration strategy documented, test impact assessed |
</phase_requirements>

---

## Summary

Phase 48 replaces the `bool DialMode` field with a three-value `ClockType` enum across five C# files and their associated tests. The migration is primarily a rename-and-expand operation: all existing `true/false` dial logic becomes `Dial/Phrase` enum cases, and the new `Lcd` value is added but not yet rendered (that happens in Phase 51).

The only genuinely tricky part is JSON backward-compat. The project uses `System.Text.Json` with `init`-only record properties. An absent field keeps its `init` default — the same mechanism already used for `UptimeVisible`, `ShowDate`, and other fields added in past milestones. The migration strategy is: add `ClockType` alongside `DialMode` temporarily, implement a custom migration step in `SettingsService.Load()` (same pattern as the existing `Left`/`Top` → `MonitorPositions` migration), then remove the old bool field. Because `AppSettings` is a record with `init` properties, the `with` expression approach used everywhere else applies cleanly.

The two tests that reference `DialMode` directly (STEST-01 and the inline JSON string in STEST-02) must be updated. No tests validate runtime dial-switching behavior (that is WPF-thread code), so the test suite impact is contained to `AppSettingsTests.cs`.

**Primary recommendation:** Add `ClockType` to `AppSettings` with `init` default `Phrase`. In `SettingsService.Load()`, detect the presence of `"DialMode"` in the raw JSON document (same `TryGetProperty` pattern already used) and synthesize `ClockType` before discarding the bool. Remove `DialMode` from `AppSettings` last, after all call sites are updated.

---

## Complete DialMode Reference Map (Scope)

This is the authoritative list of every file and every reference that must change. Confirmed by source inspection.

### AppSettings.cs — 1 field declaration
- Line 24: `public bool DialMode { get; init; } = false;`
  - **Action:** Remove; add `public ClockType ClockType { get; init; } = ClockType.Phrase;`

### SettingsService.cs — 3 references
- Line 116: `Defaults()` method — `DialMode = false,` in object initializer
  - **Action:** Replace with `ClockType = ClockType.Phrase,`
- Lines 26-51: `Load()` migration block — add new `"DialMode"` detection here
  - **Action:** After deserializing, if JSON has `"DialMode": true`, set `ClockType = ClockType.Dial`
- Lines 63-101: `Validate()` — no current DialMode guard; no action needed

### ThemeDefinition.cs — 7 references
- Line 13: `public required bool DialMode { get; init; }` — field in record
  - **Action:** Replace with `public required ClockType ClockType { get; init; }`
- Lines 29, 38, 47, 56, 65: `DialMode = false/true` in the five `BuiltInThemes` entries
  - **Action:** Replace each with `ClockType = ClockType.Phrase` or `ClockType = ClockType.Dial`
  - Neon theme: `DialMode = true` → `ClockType = ClockType.Dial`
  - Terminal theme: `DialMode = true` → `ClockType = ClockType.Dial`
  - Midnight, Ghost, Warm themes: `DialMode = false` → `ClockType = ClockType.Phrase`

### SettingsSnapshot.cs — 1 field declaration
- Line 13: `public bool DialMode { get; init; }`
  - **Action:** Replace with `public ClockType ClockType { get; init; }`

### MainWindow.xaml.cs — 14 references across multiple contexts

**Field declaration:**
- Line 32: `private bool _dialMode;`
  - **Action:** Replace with `private ClockType _clockType = ClockType.Phrase;`

**Startup / window loaded (direct visibility setting, NOT via SetDialMode):**
- Lines 223-237: block reading `s.DialMode` to set visibility on startup
  - **Action:** Replace `s.DialMode` with `s.ClockType == ClockType.Dial`
- Lines 332-339: layout visibility block using `s.DialMode`
  - **Action:** Replace with `s.ClockType != ClockType.Dial`
- Line 350: `_dialMode = savedTheme.DialMode;` in startup theme restore block
  - **Action:** Replace with `_clockType = savedTheme.ClockType;`

**Timer tick:**
- Lines 101, 128: `if (_dialMode) UpdateDialDisplay();`
  - **Action:** Replace with `if (_clockType == ClockType.Dial) UpdateDialDisplay();`

**GetCurrentSettingsSnapshot:**
- Line 361: `DialMode = _dialMode,`
  - **Action:** Replace with `ClockType = _clockType,`

**SaveSettings:**
- Line 467: `DialMode = _dialMode,`
  - **Action:** Replace with `ClockType = _clockType,`

**Settings window event wiring:**
- Line 396: `_settingsWindow.DialModeChanged += d => { ClearActiveTheme(); SetDialMode(d); };`
  - **Action:** Replace with `_settingsWindow.ClockTypeChanged += ct => { ClearActiveTheme(); SetClockType(ct); };`

**ResetToDefaults:**
- Line 992: `if (_dialMode) SetDialMode(false);`
  - **Action:** Replace with `if (_clockType != ClockType.Phrase) SetClockType(ClockType.Phrase);`

**ApplyNamedTheme:**
- Line 1046: `SetDialMode(theme.DialMode);`
  - **Action:** Replace with `SetClockType(theme.ClockType);`

**SetDialMode method (lines 1063-1084):**
- Entire method renamed and signature changed
  - **Action:** Rename to `SetClockType(ClockType clockType)`, update body (see Architecture Patterns)

**UpdateDialDisplay guard:**
- Line 1190: `if (!_dialMode)` — early-exit guard
  - **Action:** Replace with `if (_clockType != ClockType.Dial)`

**Line 1425:** `if (!_dialMode) return;` — another early-exit guard
  - **Action:** Replace with `if (_clockType != ClockType.Dial) return;`

### SettingsWindow.xaml.cs — 6 references

- Line 26: `public event Action<bool>? DialModeChanged;`
  - **Action:** Replace with `public event Action<ClockType>? ClockTypeChanged;`
- Line 75: `SetClockStyleButtonStates(s.DialMode);`
  - **Action:** Replace with `SetClockStyleButtonStates(s.ClockType);`
- Lines 183-187: `SetClockStyleButtonStates(bool dialMode)` helper
  - **Action:** Change signature to `SetClockStyleButtonStates(ClockType clockType)`, update body
- Lines 370-378: `BtnPhrase_Click` and `BtnDial_Click` handlers invoking `DialModeChanged`
  - **Action:** Invoke `ClockTypeChanged?.Invoke(ClockType.Phrase)` and `ClockTypeChanged?.Invoke(ClockType.Dial)` respectively

### AppSettingsTests.cs — 3 references (tests that need updating)

- Line 36: `DialMode = true,` in STEST-01 object initializer
  - **Action:** Replace with `ClockType = ClockType.Dial,`
- Line 64: `Assert.AreEqual(original.DialMode, result.DialMode, "DialMode");`
  - **Action:** Replace with `Assert.AreEqual(original.ClockType, result.ClockType, "ClockType");`
- Line 85: inline JSON string in STEST-02 contains `"DialMode":false`
  - **Action:** Remove `"DialMode":false` from the string (or keep it as legacy JSON to test that the migration ignores it cleanly); update assertion comment

### TrayMenuBuilder.cs — 0 current DialMode references
The tray menu currently has NO dial-mode toggle. `TrayMenuState` and `TrayMenuCallbacks` do not include DialMode at all. Phase 48 adds `ClockType` support here per F1 requirement. The requirement says to update TrayMenuBuilder — but since no existing tray item references DialMode, the Phase 48 change is additive only (no removal needed). Per the roadmap, a full "Clock Type" submenu belongs to Phase 51 (F9). Phase 48 should ensure `TrayMenuState` is ready to carry `ClockType` if needed, or defer the full submenu to Phase 51.

**Clarification:** F1 says "TrayMenuBuilder updated throughout." Inspection shows no current DialMode in TrayMenuBuilder. The update required for Phase 48 is minimal: ensure `TrayMenuState` can represent `ClockType` for Phase 51's submenu. Full submenu wiring deferred to Phase 51 per roadmap.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| System.Text.Json | .NET 10 built-in | JSON serialization of `AppSettings` | Already in use throughout project |
| MSTest | 4.0.1 | Unit test framework | Already in use in `FuzzyClock.App.Tests` |

No new library dependencies are needed for Phase 48.

## Architecture Patterns

### AppSettings Serialization Model

`AppSettings` is a C# `record` with all `init`-only properties. `System.Text.Json` handles `init` records natively (documented in source comment at top of AppSettings.cs). Key behavior:

- Absent JSON fields keep their `init` default (NOT the C# type default). This is **documented and tested** by STEST-02 (`UptimeVisible` absent → `true`) and similar tests.
- Unknown JSON fields are silently ignored (documented in STEST-02 comment).
- This means adding `ClockType` with `init` default `Phrase` is safe: any old settings.json lacking `"ClockType"` will correctly default to `Phrase` after deserialization.

### Migration Strategy: `"DialMode"` Backward Compat

The existing `SettingsService.Load()` already performs JSON migration using `JsonDocument.TryGetProperty`. Apply the same pattern:

```csharp
// In SettingsService.Load(), after deserializing:
bool hasDialMode = doc.RootElement.TryGetProperty("DialMode", out var dialModeEl);
if (hasDialMode && loaded.ClockType == ClockType.Phrase) // only migrate if ClockType absent
{
    bool wasDialMode = dialModeEl.GetBoolean();
    if (wasDialMode)
        loaded = loaded with { ClockType = ClockType.Dial };
    // false → Phrase (already the default, no action needed)
}
```

This handles both cases:
- Old file with `"DialMode": true` → migrates to `ClockType.Dial`
- Old file with `"DialMode": false` → remains `ClockType.Phrase` (default)
- New file with `"ClockType": "Dial"` and no `"DialMode"` → works via normal deserialization

**Note:** `System.Text.Json` serializes enums as strings by default only with `JsonStringEnumConverter`. Without it, enums serialize as integers. The existing codebase serializes `PhraseStyle`, `TextStyle`, `DateFormat` as **strings** stored directly (they are `string` properties). For `ClockType`, the idiomatic approach is to store as a **string** (e.g., `"Phrase"`, `"Dial"`, `"Lcd"`) using `[JsonConverter(typeof(JsonStringEnumConverter))]` on the property or globally. Check the existing approach for any enum fields — there are none currently, so this is a new decision.

**Recommended approach:** Declare `ClockType` as a `string`-backed value (store as `string`) OR add `[JsonConverter(typeof(JsonStringEnumConverter))]`. Using `JsonStringEnumConverter` produces human-readable JSON (`"ClockType": "Dial"`) and is consistent with the string-based patterns elsewhere. Add it at the property level or via `JsonSerializerOptions` in `SettingsService`.

**Simplest option consistent with codebase style:** Store `ClockType` as a `string` property on `AppSettings` (matching `PhraseStyle`, `TextStyle`, etc.) and use a computed property or parse in consuming code. However, the requirement explicitly calls for a proper enum type, so use `[JsonConverter(typeof(JsonStringEnumConverter))]`.

### SetClockType Method (replaces SetDialMode)

```csharp
private void SetClockType(ClockType clockType)
{
    _clockType = clockType;

    if (clockType == ClockType.Dial)
    {
        PhraseText.Visibility       = Visibility.Collapsed;
        SplitPhrasePanel.Visibility = Visibility.Collapsed;
        DialCanvas.Visibility       = Visibility.Visible;
    }
    else
    {
        DialCanvas.Visibility = Visibility.Collapsed;
        bool isSplit = _currentTextStyle == "Split";
        PhraseText.Visibility       = isSplit ? Visibility.Collapsed : Visibility.Visible;
        SplitPhrasePanel.Visibility = isSplit ? Visibility.Visible   : Visibility.Collapsed;
    }

    if (clockType == ClockType.Dial) UpdateDialDisplay();

    SaveSettings();
}
```

The `Lcd` case in Phase 48 behaves identically to `Phrase` for visibility (no `LcdArea` exists yet — that's Phase 50/51). The `else` branch above correctly handles both `Phrase` and `Lcd` for this phase.

### SetClockStyleButtonStates (SettingsWindow)

```csharp
private void SetClockStyleButtonStates(ClockType clockType)
{
    BtnPhrase.Tag = clockType == ClockType.Phrase ? "selected" : null;
    BtnDial.Tag   = clockType == ClockType.Dial   ? "selected" : null;
    // BtnLcd added in Phase 51
}
```

### Startup Initialization Pattern

The startup block in `Window_Loaded` (around line 223) directly assigns visibility WITHOUT calling `SetClockType` (to avoid unsafe pre-Show WPF calls). The pattern must be preserved:

```csharp
// Direct assignment — NOT via SetClockType (unsafe before Show())
_clockType = s.ClockType;
if (s.ClockType == ClockType.Dial)
{
    PhraseText.Visibility       = Visibility.Collapsed;
    SplitPhrasePanel.Visibility = Visibility.Collapsed;
    DialCanvas.Visibility       = Visibility.Visible;
}
else
{
    DialCanvas.Visibility = Visibility.Collapsed;
    PhraseText.Visibility = Visibility.Visible;
    SplitPhrasePanel.Visibility = Visibility.Collapsed;
}
```

### Anti-Patterns to Avoid

- **Removing `DialMode` before updating all call sites:** The record `with` syntax will fail to compile the moment `DialMode` is removed — build breaks tell you where. Remove `DialMode` last.
- **Forgetting JsonStringEnumConverter:** Without it, `ClockType.Phrase` serializes as `0`, not `"Phrase"`. Old settings with `"DialMode"` would correctly migrate but new settings would be less readable. Worse: the `Validate()` method has no guard for integer-serialized enum values.
- **Using `bool isSplit = _currentTextStyle == "Split"` inside SetClockType for the Lcd case:** Fine for Phase 48 (Lcd falls through to the else branch), but Phase 51 must add an explicit `Lcd` case before showing `LcdArea`.
- **Changing SettingsWindow.xaml:** The XAML buttons `BtnPhrase` and `BtnDial` already exist. Phase 48 does NOT add `BtnLcd` (that is Phase 51). Do not touch the XAML file in this phase.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Enum JSON serialization | Custom converter writing `"Phrase"/"Dial"/"Lcd"` strings | `[JsonConverter(typeof(JsonStringEnumConverter))]` | Built-in .NET 10; handles all 3 values including future additions |
| JSON migration detection | String-search in raw JSON | `JsonDocument.TryGetProperty("DialMode", ...)` | Already the pattern in `SettingsService.Load()` for `Left`/`Top` migration |

---

## Common Pitfalls

### Pitfall 1: Enum Serializes as Integer
**What goes wrong:** `AppSettings.ClockType` is an enum. Without `[JsonConverter(typeof(JsonStringEnumConverter))]`, `System.Text.Json` serializes it as `0`, `1`, `2`. Settings files become `"ClockType": 0` which is unreadable and may confuse future migration steps.
**Why it happens:** `System.Text.Json` default behavior for enums.
**How to avoid:** Add `[JsonConverter(typeof(JsonStringEnumConverter))]` to the `ClockType` property in `AppSettings`.
**Warning signs:** Serialized JSON shows a number instead of a string for `ClockType`.

### Pitfall 2: Forgetting the Startup Direct-Assignment Block
**What goes wrong:** The `Window_Loaded` handler applies DialMode directly (not via `SetDialMode`) for safety before `Show()`. If only `SetDialMode` is renamed to `SetClockType` but the startup block (lines 223-237) is not updated from `s.DialMode` to `s.ClockType`, the field reads `false` (the bool default) and always starts in Phrase mode regardless of saved settings.
**Why it happens:** There are TWO code paths that apply dial mode: startup (direct) and runtime (via method). Both must be updated.
**How to avoid:** Grep for `s.DialMode` and `_dialMode = s.` after the rename to catch missed occurrences.

### Pitfall 3: AppSettings Record `with` Compilation Failures
**What goes wrong:** `AppSettings` is used with `with { DialMode = ... }` in multiple places (`SaveSettings`, `SettingsService.Load`, `SettingsService.Validate`). Removing `DialMode` causes compile errors at each `with` expression.
**Why it happens:** C# `with` requires the property to exist on the record.
**How to avoid:** Use the compiler errors as a guide — remove `DialMode` last and let the build tell you every remaining reference. Fix all `with` expressions to use `ClockType`.

### Pitfall 4: Test STEST-01 References DialMode
**What goes wrong:** `AppSettingsTests.RoundTrip_FullyPopulated_AllFieldsMatch` sets `DialMode = true` and asserts `result.DialMode`. After removing `DialMode` this test fails to compile.
**Why it happens:** The test was written against the old API.
**How to avoid:** Update STEST-01 to use `ClockType = ClockType.Dial` and assert `result.ClockType`.

### Pitfall 5: STEST-02 Inline JSON Contains `"DialMode"`
**What goes wrong:** `Deserialize_MissingUptimeVisible_DefaultsToTrue` has a hardcoded JSON string with `"DialMode":false`. This is harmless as an unknown field after migration (it will be silently ignored), but the test description and purpose should remain valid.
**Why it happens:** The JSON was written when `DialMode` was the current field name.
**How to avoid:** Either remove `"DialMode":false` from the inline JSON (clean), or leave it as intentional legacy-field-ignored test data (also acceptable — documents that unknown fields are safe).

### Pitfall 6: ThemeDefinition `required` Properties
**What goes wrong:** `ThemeDefinition` uses `required bool DialMode`. If renamed to `required ClockType ClockType`, all five `BuiltInThemes` object initializers must be updated simultaneously or the build breaks.
**Why it happens:** `required` properties must be set in every object initializer.
**How to avoid:** Update `ThemeDefinition.cs` (the type) and `BuiltInThemes` (the five usages) in the same edit.

---

## Code Examples

### Adding JsonStringEnumConverter
```csharp
// Source: https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/customize-properties
using System.Text.Json.Serialization;

public record AppSettings
{
    // ... existing properties ...
    [JsonConverter(typeof(JsonStringEnumConverter))]
    public ClockType ClockType { get; init; } = ClockType.Phrase;
}
```

### DialMode Migration in SettingsService.Load()
```csharp
// After: var loaded = JsonSerializer.Deserialize<AppSettings>(json) ?? Defaults();
// Add:
bool hasDialMode = doc.RootElement.TryGetProperty("DialMode", out var dialEl);
if (hasDialMode && loaded.ClockType == ClockType.Phrase)
{
    // Only apply migration if new ClockType field was absent (would have defaulted to Phrase)
    if (dialEl.ValueKind == JsonValueKind.True)
        loaded = loaded with { ClockType = ClockType.Dial };
}
```

### ClockType Enum Definition
```csharp
namespace FuzzyClock.App;

public enum ClockType
{
    Phrase,
    Dial,
    Lcd
}
```

Place in a new file `FuzzyClock.App/ClockType.cs`.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `bool DialMode` — two states | `ClockType` enum — three states | Phase 48 | Enables Lcd as a first-class type without more booleans |

**Deprecated after this phase:**
- `AppSettings.DialMode` (bool): removed
- `SettingsSnapshot.DialMode` (bool): removed
- `ThemeDefinition.DialMode` (bool): removed
- `MainWindow._dialMode` (bool field): removed
- `MainWindow.SetDialMode(bool)` method: removed
- `SettingsWindow.DialModeChanged` event (Action\<bool\>): removed
- `SettingsService.Defaults()` DialMode entry: removed

---

## Safe Order of Changes

To keep the build green at every step:

1. **Add `ClockType.cs`** — new enum file, no dependencies break
2. **Add `ClockType` to `AppSettings`** (keep `DialMode` for now) — additive, build green
3. **Add migration in `SettingsService.Load()`** — reads old `DialMode` JSON, populates new `ClockType`; update `Defaults()` to include `ClockType = ClockType.Phrase`
4. **Update `ThemeDefinition` + `BuiltInThemes`** — rename `DialMode` → `ClockType`; build may break at MainWindow line 350 (`_dialMode = savedTheme.DialMode`)
5. **Update `SettingsSnapshot`** — rename `DialMode` → `ClockType`; breaks MainWindow usages of `s.DialMode`
6. **Update `MainWindow`** — rename field, rename method, update all references; build compiles after this step
7. **Update `SettingsWindow`** — rename event, rename helper method signature
8. **Update `AppSettingsTests`** — update STEST-01 field reference and assertion
9. **Remove `AppSettings.DialMode`** — compile errors reveal any missed references; fix them
10. **Remove `SettingsService.Defaults()` DialMode entry** — cleanup after removal above
11. **Run all 224 tests** — confirm zero regressions

Alternatively, steps 4-8 can be done atomically in a single commit if preferred.

---

## Open Questions

1. **JsonStringEnumConverter scope: per-property vs. global options?**
   - What we know: The existing codebase uses no `JsonSerializerOptions` customization in `SettingsService.Save/Load` — plain `JsonSerializer.Serialize(s)` and `JsonSerializer.Deserialize<AppSettings>(json)`.
   - What's unclear: Whether a global `JsonSerializerOptions` should be introduced or the attribute approach is preferable.
   - Recommendation: Use the per-property `[JsonConverter(typeof(JsonStringEnumConverter))]` attribute — minimal blast radius, consistent with not touching `JsonSerializerOptions`.

2. **TrayMenuBuilder scope in Phase 48 vs Phase 51**
   - What we know: TrayMenuBuilder currently has zero DialMode references. F1 says "updated throughout" but the roadmap assigns the Clock Type submenu to Phase 51 (F9).
   - What's unclear: Whether Phase 48 should add `ClockType` to `TrayMenuState` for forward-compat.
   - Recommendation: Phase 48 makes `TrayMenuState` ClockType-aware (add the field), but does NOT wire a submenu yet. Full submenu deferred to Phase 51. This keeps Phase 48 minimal.

---

## Sources

### Primary (HIGH confidence)
- Source code: `FuzzyClock.App/AppSettings.cs` — confirmed `init`-only record with `System.Text.Json`
- Source code: `FuzzyClock.App/SettingsService.cs` — confirmed migration pattern with `JsonDocument.TryGetProperty`
- Source code: `FuzzyClock.App/MainWindow.xaml.cs` — all 14 DialMode references confirmed by grep
- Source code: `FuzzyClock.App/SettingsWindow.xaml.cs` — 6 references confirmed
- Source code: `FuzzyClock.App/ThemeDefinition.cs` — 7 references confirmed
- Source code: `FuzzyClock.App/SettingsSnapshot.cs` — 1 reference confirmed
- Source code: `FuzzyClock.App.Tests/AppSettingsTests.cs` — 3 test-side references confirmed
- Source code: `FuzzyClock.App/TrayMenuBuilder.cs` — 0 references confirmed

### Secondary (MEDIUM confidence)
- `[JsonConverter(typeof(JsonStringEnumConverter))]` per-property usage — consistent with official .NET docs for System.Text.Json enum handling

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all serialization already in use, no new libraries
- Architecture: HIGH — migration pattern is already established in the codebase (`Left`/`Top` migration)
- Pitfalls: HIGH — all identified from direct source inspection, not inference

**Research date:** 2026-03-10
**Valid until:** Stable until Phase 51 modifies the same files
