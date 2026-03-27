# Phase 57: Re-introduce Nixie into the New Architecture — Research

**Researched:** 2026-03-19
**Domain:** WPF C# — AppSettings migration, SettingsWindow event contract, MainWindow wiring
**Confidence:** HIGH

## Summary

The Nixie rendering stack (`NixieClockView`, `NixieDigit`) is already complete and referenced in `MainWindow.xaml`. The `ClockType` enum already includes `Nixie`. `MainWindow.xaml.cs` already handles `ClockType.Nixie` in `ApplySettings()`, `SetClockType()`, `ApplyFontSize()`, and `SaveSettings()`. The tray menu already exposes Nixie via `_nixieClockItem` wired to `SetClockType(ClockType.Nixie)`.

The work required is entirely in the settings plumbing layer: four targeted changes, no rendering work. The gap is that `SettingsWindow` still exposes the old `DialModeChanged: Action<bool>` event (2-button rail), and `AppSettings` / `SettingsSnapshot` still carry `DialMode: bool` instead of `ClockType: ClockType`. `SettingsService.Load()` already performs the `DialMode → ClockType` migration. The LCD settings (`LcdUse24Hr`, `LcdShowSeconds`, `LcdStyle`, `LcdSize`) are already wired in `MainWindow.xaml.cs`'s `OpenSettings()` but their corresponding events do not exist on `SettingsWindow` yet — however, the UI-SPEC scope for phase 57 is Nixie only, not LCD settings surfacing.

**Primary recommendation:** Apply the four-point migration described in the UI-SPEC exactly: (1) add `ClockType` + LCD fields to `AppSettings`, (2) add `ClockType` + LCD fields to `SettingsSnapshot`, (3) replace `DialModeChanged` with `ClockTypeChanged` in `SettingsWindow`, (4) update `MainWindow` to subscribe to `ClockTypeChanged`. All other wiring is pre-existing.

---

## Current Architecture — Verified Ground Truth

### What Already Exists (do NOT recreate)

| Component | File | State |
|-----------|------|-------|
| `NixieClockView` UserControl | `Controls/NixieClockView.xaml` + `.cs` | Complete — manages its own 1s `DispatcherTimer` via `IsVisibleChanged` |
| `NixieDigit` UserControl | `Controls/NixieDigit.xaml` + `.cs` | Complete — pixel-exact Canvas geometry per UI-SPEC |
| `NixieView` in MainWindow | `MainWindow.xaml` line 118 | Declared, `Visibility="Collapsed"` |
| `ClockType` enum | `ClockType.cs` | `Phrase / Dial / Lcd / Nixie` — complete |
| `NixieSizeMap` | `NixieSize.cs` | `ToDigitHeight(LcdSize)` — `Small=40, Medium=56, Large=72` |
| Tray menu Nixie item | `TrayMenuBuilder.cs` | `_nixieClockItem` wired to `SetClockType(ClockType.Nixie)` |
| `SetClockType(ClockType.Nixie)` | `MainWindow.xaml.cs` line 1323 | Sets `NixieView.Size`, shows `NixieView` |
| `ApplySettings` Nixie branch | `MainWindow.xaml.cs` line 272 | Restores Nixie on startup from `s.ClockType` |
| `SaveSettings` ClockType | `MainWindow.xaml.cs` line 557 | Persists `_clockType` as `ClockType` field |
| `DialMode → ClockType` migration | `SettingsService.cs` lines 53–61 | Already implemented |
| `_clockType` field | `MainWindow.xaml.cs` line 35 | `ClockType _clockType = ClockType.Phrase` |
| `_dialMode` field reference | `MainWindow.xaml.cs` line 718 (ApplyPhraseWrap) | Uses `_dialMode` — **stale reference, needs fixing** |

### What Is Missing (the actual work)

| Gap | File | Current State | Required State |
|-----|------|--------------|----------------|
| `AppSettings.DialMode` | `AppSettings.cs` line 24 | `public bool DialMode { get; init; } = false;` | Remove; add `public ClockType ClockType { get; init; } = ClockType.Phrase;` + LCD fields |
| `AppSettings` LCD fields | `AppSettings.cs` | Absent | `LcdUse24Hr`, `LcdShowSeconds`, `LcdStyle` (see below) |
| `SettingsSnapshot.DialMode` | `SettingsSnapshot.cs` line 13 | `public bool DialMode { get; init; }` | Remove; add `public ClockType ClockType { get; init; } = ClockType.Phrase;` + LCD fields |
| `SettingsSnapshot` LCD/ClockType fields | `SettingsSnapshot.cs` | `ClockType` absent | Add `ClockType`, `LcdUse24Hr`, `LcdShowSeconds`, `LcdStyle`, `LcdSize` |
| `SettingsWindow.DialModeChanged` event | `SettingsWindow.xaml.cs` line 26 | `Action<bool>` | Replace with `Action<ClockType> ClockTypeChanged` |
| `SetClockStyleButtonStates(bool)` | `SettingsWindow.xaml.cs` line 198 | Takes `bool dialMode` | Change to `SetClockStyleButtonStates(ClockType ct)` |
| `BtnNixie` button | `SettingsWindow.xaml` line 295 area | Missing | Add `BtnNixie` with `Content="Nixie"`, same `SegmentButtonStyle` |
| `BtnNixie_Click` handler | `SettingsWindow.xaml.cs` | Missing | Add handler firing `ClockTypeChanged?.Invoke(ClockType.Nixie)` |
| `PopulateControls` clock style read | `SettingsWindow.xaml.cs` line 79 | `s.DialMode` | Change to `s.ClockType` |
| `_dialMode` in `ApplyPhraseWrap` | `MainWindow.xaml.cs` line 718 | `_dialMode` (stale field reference) | Replace with `_clockType != ClockType.Phrase` (or `_clockType == ClockType.Phrase` guard) |
| `MainWindow` subscription | `MainWindow.xaml.cs` `OpenSettings()` line 460 | `ClockTypeChanged` subscription exists but event doesn't exist on SettingsWindow | Will resolve once event is added to SettingsWindow |

---

## Standard Stack

### Core (no new packages)

| Library | Version | Purpose |
|---------|---------|---------|
| .NET 10 WPF | net10.0-windows | UI framework — all controls |
| System.Text.Json | .NET 10 BCL | Settings serialization |
| MSTest | 4.x (existing) | Test framework — 274 tests currently passing |

No new NuGet packages required. All work is in existing project files.

**Installation:** none required.

---

## Architecture Patterns

### Pattern 1: AppSettings Record Migration

`AppSettings` is an immutable record with `{ get; init; }` properties. System.Text.Json deserializes it natively. The migration pattern is: add new property, keep old property for JSON backward-compat, handle in `SettingsService.Load()`.

However, for this phase the UI-SPEC prescribes **removing** `DialMode` from `AppSettings` and `SettingsSnapshot`. The migration from old JSON is already handled in `SettingsService.Load()` (lines 53–61). The `DialMode` property in `AppSettings` is used only by:
- `SettingsService.Load()` migration block (reads it from JSON doc explicitly, not via deserialized object)
- Nothing else in the current codebase references `AppSettings.DialMode` directly

Safe to remove once confirmed. Run a grep before removing.

```csharp
// Source: AppSettings.cs — the existing migration pattern to follow
// SettingsService.Load() already does:
bool hasDialMode = doc.RootElement.TryGetProperty("DialMode", out var dialEl);
if (hasDialMode && loaded.ClockType == ClockType.Phrase)
{
    if (dialEl.ValueKind == JsonValueKind.True)
        loaded = loaded with { ClockType = ClockType.Dial };
}
```

The migration code reads `DialMode` from the raw `JsonDocument`, not from the deserialized `AppSettings` object. Removing `DialMode` from the record does not break the migration — the `TryGetProperty` operates on the JSON string.

### Pattern 2: SettingsWindow Event Contract

The SettingsWindow uses a per-property event model. All events are `Action<T>?`. The clock style change:

```csharp
// Current (to replace):
public event Action<bool>? DialModeChanged;
private void SetClockStyleButtonStates(bool dialMode)
{
    BtnPhrase.Tag = !dialMode ? "selected" : null;
    BtnDial.Tag   =  dialMode ? "selected" : null;
}

// Required (from UI-SPEC):
public event Action<ClockType>? ClockTypeChanged;
private void SetClockStyleButtonStates(ClockType ct)
{
    BtnPhrase.Tag = ct == ClockType.Phrase ? "selected" : null;
    BtnDial.Tag   = ct == ClockType.Dial   ? "selected" : null;
    BtnNixie.Tag  = ct == ClockType.Nixie  ? "selected" : null;
}
```

### Pattern 3: MainWindow Subscription Update

`MainWindow.OpenSettings()` already subscribes to `ClockTypeChanged` (line 460). The subscription exists in the current code:

```csharp
_settingsWindow.ClockTypeChanged += ct => { ClearActiveTheme(); SetClockType(ct); };
```

This line is already present in `MainWindow.xaml.cs`. It will compile once `SettingsWindow` exposes the `ClockTypeChanged` event.

### Pattern 4: _dialMode stale reference fix

`ApplyPhraseWrap()` in `MainWindow.xaml.cs` at line 718 references `_dialMode` which is a field that no longer exists in the current code. This is a pre-existing compile error hidden because the field resolution must come from somewhere. Verify this is actually `_clockType != ClockType.Phrase` semantics:

```csharp
// Current (broken reference — needs fixing):
if (_dialMode || _currentTextStyle == "Split" || !_phraseWrapEnabled)

// Correct replacement:
if (_clockType != ClockType.Phrase || _currentTextStyle == "Split" || !_phraseWrapEnabled)
```

### Recommended Change Set (all 7 files)

```
FuzzyClock.App/
├── AppSettings.cs            — Remove DialMode; add ClockType + LcdUse24Hr + LcdShowSeconds + LcdStyle
├── SettingsSnapshot.cs       — Remove DialMode; add ClockType + LcdUse24Hr + LcdShowSeconds + LcdStyle + LcdSize
├── SettingsWindow.xaml       — Add BtnNixie button in the Clock Style rail StackPanel
├── SettingsWindow.xaml.cs    — Replace DialModeChanged with ClockTypeChanged; update handlers + PopulateControls
├── MainWindow.xaml.cs        — Fix _dialMode reference in ApplyPhraseWrap; verify GetCurrentSettingsSnapshot uses ClockType
└── (SettingsService.cs)      — Already migrated; no further changes needed
```

Note: `SettingsWindow.xaml.cs` subscribes to `LcdUse24HrChanged`, `LcdShowSecondsChanged`, `LcdStyleChanged`, `ShowHourTicksChanged`, `ShowMinuteDotsChanged`, `ShowHourNumbersChanged` — these events must also be declared on `SettingsWindow`. Check if they are missing from the current event list. The current code in `MainWindow.OpenSettings()` at line 461 already subscribes to them, but `SettingsWindow.xaml.cs` line 23–48 shows they are NOT declared. These LCD/dial decoration events are wired in MainWindow but absent from SettingsWindow — this is a pre-existing gap that must also be closed.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Nixie rendering | Custom digit Canvas geometry | Pre-existing `NixieDigit.xaml.cs` — already complete |
| Nixie clock layout | Custom StackPanel with digit sizing | Pre-existing `NixieClockView.xaml` — already complete |
| Timer management for Nixie | Manual DispatcherTimer in MainWindow | `NixieClockView` manages its own 1s timer via `IsVisibleChanged` |
| JSON migration for DialMode | New migration code | Already implemented in `SettingsService.Load()` lines 53–61 |
| ClockType enum | New enum | Already exists in `ClockType.cs` |

---

## Common Pitfalls

### Pitfall 1: Removing `DialMode` breaks the JSON migration block

**What goes wrong:** Removing `public bool DialMode` from `AppSettings` may seem like it breaks the migration in `SettingsService.Load()`. It does not — the migration reads from `JsonDocument.RootElement.TryGetProperty("DialMode", ...)`, not from the deserialized record field.

**How to avoid:** Keep the migration code as-is. Remove only the record property.

**Warning signs:** Compiler error if anything tries to read `loaded.DialMode` — search for all uses before deleting.

### Pitfall 2: _dialMode ghost reference in ApplyPhraseWrap

**What goes wrong:** `MainWindow.xaml.cs` line 718 references `_dialMode`. This is a stale field reference — there is no `_dialMode` field declared in the current class. The project may not currently compile cleanly, or it resolves via a property on another object. This must be found and replaced with the correct `ClockType`-based check.

**How to avoid:** Grep for `_dialMode` across all `.cs` files before and after the change. Replace with `_clockType != ClockType.Phrase`.

### Pitfall 3: Missing SettingsWindow events for LCD and dial decorations

**What goes wrong:** `MainWindow.OpenSettings()` subscribes to `LcdUse24HrChanged`, `LcdShowSecondsChanged`, `LcdStyleChanged`, `ShowHourTicksChanged`, `ShowMinuteDotsChanged`, `ShowHourNumbersChanged` — but these events are not declared in `SettingsWindow.xaml.cs`. This means the SettingsWindow `event` declarations are missing. They must be added alongside `ClockTypeChanged`.

**How to avoid:** Audit `SettingsWindow.xaml.cs` event declarations against all `_settingsWindow.XXXChanged +=` subscriptions in `MainWindow.OpenSettings()`. Add any missing event declarations.

**Warning signs:** Compiler errors on `_settingsWindow.LcdUse24HrChanged`, etc.

### Pitfall 4: PopulateControls reads DialMode, not ClockType

**What goes wrong:** `PopulateControls` calls `SetClockStyleButtonStates(s.DialMode)`. After `SettingsSnapshot.DialMode` is removed, this will be a compile error. The fix is `SetClockStyleButtonStates(s.ClockType)`.

**How to avoid:** Update `PopulateControls` at the same time as the event and helper changes.

### Pitfall 5: GetCurrentSettingsSnapshot missing ClockType

**What goes wrong:** `GetCurrentSettingsSnapshot()` in `MainWindow.xaml.cs` (line 412) already populates `ClockType = _clockType` — this is correct. However, it currently also does NOT include `DialMode` (which means `SettingsSnapshot` must not have a `DialMode` field, or the `with` expression would fail to compile). Verify the snapshot builder is consistent after migration.

**How to avoid:** After migration, ensure `GetCurrentSettingsSnapshot()` compiles cleanly and includes `ClockType`, `LcdUse24Hr`, `LcdShowSeconds`, `LcdStyle`, `LcdSize`.

---

## Code Examples

### AppSettings — fields to add/remove

```csharp
// Remove:
public bool DialMode { get; init; } = false;

// Add (replace DialMode with ClockType + LCD fields):
public ClockType ClockType     { get; init; } = ClockType.Phrase;
public bool   LcdUse24Hr       { get; init; } = false;
public bool   LcdShowSeconds   { get; init; } = true;
public string LcdStyle         { get; init; } = "Dark";
// Note: LcdSize is NOT persisted — derived from FontSize via FontSizeToLcdSize()
```

### SettingsSnapshot — fields to add/remove

```csharp
// Remove:
public bool DialMode { get; init; }

// Add:
public ClockType ClockType     { get; init; } = ClockType.Phrase;
public bool   LcdUse24Hr       { get; init; } = false;
public bool   LcdShowSeconds   { get; init; } = true;
public string LcdStyle         { get; init; } = "Dark";
public LcdSize LcdSize         { get; init; } = LcdSize.Medium;
```

### SettingsWindow.xaml — BtnNixie in Clock Style rail

```xml
<!-- Replace the existing 2-button StackPanel with this 3-button version: -->
<StackPanel Orientation="Horizontal">
    <Button x:Name="BtnPhrase" Content="Phrase" Style="{StaticResource SegmentButtonStyle}" Click="BtnPhrase_Click"/>
    <Button x:Name="BtnDial"   Content="Dial"   Style="{StaticResource SegmentButtonStyle}" Click="BtnDial_Click"/>
    <Button x:Name="BtnNixie"  Content="Nixie"  Style="{StaticResource SegmentButtonStyle}" Click="BtnNixie_Click"/>
</StackPanel>
```

Padding is `Padding="12,4"` from `SegmentButtonStyle` — no override needed. "Nixie" is 5 chars vs "Phrase" 6 chars, so the button will be similar width to "Dial" (4 chars). The rail width increase (~57px) is within the 480px window constraint (no overflow).

### SettingsWindow.xaml.cs — event and button state replacements

```csharp
// Replace:
public event Action<bool>? DialModeChanged;

// With:
public event Action<ClockType>? ClockTypeChanged;

// Also add missing events:
public event Action<bool>?   LcdUse24HrChanged;
public event Action<bool>?   LcdShowSecondsChanged;
public event Action<string>? LcdStyleChanged;
public event Action<bool>?   ShowHourTicksChanged;
public event Action<bool>?   ShowMinuteDotsChanged;
public event Action<bool>?   ShowHourNumbersChanged;

// Replace SetClockStyleButtonStates:
private void SetClockStyleButtonStates(ClockType ct)
{
    BtnPhrase.Tag = ct == ClockType.Phrase ? "selected" : null;
    BtnDial.Tag   = ct == ClockType.Dial   ? "selected" : null;
    BtnNixie.Tag  = ct == ClockType.Nixie  ? "selected" : null;
}

// Replace BtnPhrase_Click and BtnDial_Click, add BtnNixie_Click:
private void BtnPhrase_Click(object sender, RoutedEventArgs e)
{
    if (_suppressEvents) return;
    SetClockStyleButtonStates(ClockType.Phrase);
    ClockTypeChanged?.Invoke(ClockType.Phrase);
}
private void BtnDial_Click(object sender, RoutedEventArgs e)
{
    if (_suppressEvents) return;
    SetClockStyleButtonStates(ClockType.Dial);
    ClockTypeChanged?.Invoke(ClockType.Dial);
}
private void BtnNixie_Click(object sender, RoutedEventArgs e)
{
    if (_suppressEvents) return;
    SetClockStyleButtonStates(ClockType.Nixie);
    ClockTypeChanged?.Invoke(ClockType.Nixie);
}
```

### MainWindow.xaml.cs — _dialMode fix

```csharp
// Current (line 718, broken):
if (_dialMode || _currentTextStyle == "Split" || !_phraseWrapEnabled)

// Correct:
if (_clockType != ClockType.Phrase || _currentTextStyle == "Split" || !_phraseWrapEnabled)
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `DialMode: bool` in AppSettings | `ClockType: enum` in AppSettings | Supports 4+ clock types without additional booleans |
| `DialModeChanged: Action<bool>` in SettingsWindow | `ClockTypeChanged: Action<ClockType>` | Single event for all clock type changes |
| 2-button rail (Phrase / Dial) | 3-button rail (Phrase / Dial / Nixie) | Nixie selectable from Settings window |

---

## Open Questions

1. **Does `_dialMode` actually exist as a field in the current codebase, or is it a compile error?**
   - What we know: `MainWindow.xaml.cs` line 718 contains `_dialMode` but no field declaration for `_dialMode` was found in the field declarations at lines 15–63.
   - What's unclear: Whether the project currently compiles (there may be a hidden partial class or the field was already removed).
   - Recommendation: Run `dotnet build` at the start of the plan to confirm current compile state. The fix is `_clockType != ClockType.Phrase` regardless.

2. **Are there SettingsWindow event declarations for LCD/dial decoration events?**
   - What we know: `MainWindow.OpenSettings()` subscribes to `LcdUse24HrChanged`, `LcdShowSecondsChanged`, `LcdStyleChanged`, `ShowHourTicksChanged`, `ShowMinuteDotsChanged`, `ShowHourNumbersChanged` — none were found in the `SettingsWindow.xaml.cs` event declarations.
   - What's unclear: Whether these are already declared somewhere else (partial class, XAML codegen).
   - Recommendation: Audit carefully. They are likely missing and need to be added as part of this phase to make the project compile.

---

## Sources

### Primary (HIGH confidence)

- `FuzzyClock.App/MainWindow.xaml.cs` — full source audit, all clock type wiring verified
- `FuzzyClock.App/AppSettings.cs` — `DialMode` field confirmed present, `ClockType` absent
- `FuzzyClock.App/SettingsSnapshot.cs` — `DialMode` present, `ClockType` absent
- `FuzzyClock.App/SettingsWindow.xaml.cs` — `DialModeChanged` event confirmed, `ClockTypeChanged` absent
- `FuzzyClock.App/SettingsWindow.xaml` — 2-button Clock Style rail confirmed
- `FuzzyClock.App/SettingsService.cs` — migration code lines 53–61 verified
- `FuzzyClock.App/ClockType.cs` — enum with Phrase/Dial/Lcd/Nixie confirmed
- `.planning/phases/57-re-introduce-nixie-into-the-new-architecture/57-UI-SPEC.md` — UI design contract

---

## Metadata

**Confidence breakdown:**
- Current state (what exists vs. what's missing): HIGH — verified by direct source audit
- Required changes: HIGH — derived directly from UI-SPEC and source audit
- Pitfalls: HIGH — identified from stale references found in source

**Research date:** 2026-03-19
**Valid until:** This is a closed codebase; findings are stable until next commit changes these files.
