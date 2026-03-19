# Technology Stack

**Project:** FuzzyStatsClock v3.7 — Nixie Clock Re-introduction
**Researched:** 2026-03-19
**Scope:** Settings plumbing migration only — existing validated stack (C# WPF .NET 10, MSTest 4.0.1, System.Text.Json, PerformanceCounter, UseWindowsForms=true, Velopack 0.0.1298) is unchanged
**Confidence:** HIGH — all claims verified by direct source audit of the current codebase

---

## What Changes vs v3.6.1

v3.6.1 validated stack is not re-researched. This document covers only the delta for v3.7.

| Feature | Stack Change | NuGet Needed |
|---------|-------------|--------------|
| `AppSettings` migration (`DialMode bool` → `ClockType enum` + LCD fields) | Pure C# record property change — no new types, no new packages | None |
| `SettingsSnapshot` migration | Same — add `ClockType` + LCD fields, remove `DialMode` | None |
| `SettingsWindow` 3-button Clock Style rail | XAML `<Button>` addition + `Action<ClockType>` event — built-in WPF | None |
| `SettingsWindow` missing event declarations | Declare `Action<T>` events — built-in C# | None |
| `_dialMode` stale reference fix in `MainWindow` | One-line C# fix | None |
| Build error resolution (`GetSegmentKey` on novelty providers) | C# interface implementation fix | None |

**Zero new NuGet packages. Zero csproj changes. All work is in existing C# and XAML files.**

---

## Recommended Stack

### Core Technologies (unchanged)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| .NET 10 WPF | net10.0-windows | UI framework — all controls, XAML, DispatcherTimer | Already validated; transparent overlay, SettingsWindow, dialogs |
| C# 13 | .NET 10 SDK | Language | `init`-property records, pattern matching on enums |
| System.Text.Json | .NET 10 BCL | Settings serialization to `%LOCALAPPDATA%\FuzzyClock\settings.json` | Already validated; handles `AppSettings` record natively, no attributes needed |
| MSTest | 4.0.1 (existing) | Test framework — 274 tests currently passing | Already validated; CI gate enforced |

### Types Reused (no new packages needed)

| Type | Assembly | Purpose in This Phase |
|------|----------|-----------------------|
| `ClockType` enum (`Phrase / Dial / Lcd / Nixie`) | `FuzzyClock.App/ClockType.cs` | Already complete — the migration target for `DialMode bool` |
| `NixieClockView` UserControl | `FuzzyClock.App/Controls/NixieClockView.xaml(.cs)` | Already complete — manages its own 1s `DispatcherTimer` via `IsVisibleChanged` |
| `NixieDigit` UserControl | `FuzzyClock.App/Controls/NixieDigit.xaml(.cs)` | Already complete — pixel-exact Canvas geometry |
| `NixieSizeMap.ToDigitHeight(LcdSize)` | `FuzzyClock.App/NixieSize.cs` | Already complete — `Small=40, Medium=56, Large=72` |
| `SegmentButtonStyle` | `SettingsWindow.xaml` resources | Already defined — apply to `BtnNixie` without modification |
| `Action<T>` delegate | .NET BCL | Event type for all `SettingsWindow` change events |

---

## Files to Change

All changes are in `FuzzyClock.App/`. No new files are created.

| File | Change Type | What Changes |
|------|-------------|--------------|
| `AppSettings.cs` | Property modification | Remove `DialMode bool`; add `ClockType ClockType`, `LcdUse24Hr bool`, `LcdShowSeconds bool`, `LcdStyle string` |
| `SettingsSnapshot.cs` | Property modification | Remove `DialMode bool`; add `ClockType ClockType`, `LcdUse24Hr bool`, `LcdShowSeconds bool`, `LcdStyle string`, `LcdSize LcdSize` |
| `SettingsWindow.xaml` | XAML addition | Add `BtnNixie` button to the Clock Style rail `StackPanel` |
| `SettingsWindow.xaml.cs` | Event + handler additions | Replace `DialModeChanged: Action<bool>` with `ClockTypeChanged: Action<ClockType>`; add missing event declarations; update `SetClockStyleButtonStates`, `PopulateControls`, button click handlers |
| `MainWindow.xaml.cs` | One-line fix | Replace `_dialMode` with `_clockType != ClockType.Phrase` in `ApplyPhraseWrap()` |
| `(build error file TBD)` | Interface fix | Implement `GetSegmentKey()` on novelty providers that are missing it |
| `SettingsService.cs` | No change | Migration code (lines 53–61) already reads `DialMode` from raw `JsonDocument` — not from the record property — so removing the property does not break it |

---

## Key Integration Points

### AppSettings Record

`AppSettings` uses `{ get; init; }` properties. System.Text.Json deserializes the record natively. The migration safety guarantee: `SettingsService.Load()` reads `DialMode` from `JsonDocument.RootElement.TryGetProperty(...)`, not from the deserialized record object. Removing `public bool DialMode` from the record does not break backward-compat JSON migration.

```csharp
// Fields to remove from AppSettings.cs:
public bool DialMode { get; init; } = false;

// Fields to add to AppSettings.cs:
public ClockType ClockType   { get; init; } = ClockType.Phrase;
public bool   LcdUse24Hr     { get; init; } = false;
public bool   LcdShowSeconds { get; init; } = true;
public string LcdStyle       { get; init; } = "Dark";
// LcdSize is NOT persisted — it is derived from FontSize via FontSizeToLcdSize()
```

### SettingsSnapshot Record

`SettingsSnapshot` is populated on `SettingsWindow` open; changes flow out via events, never back in.

```csharp
// Remove from SettingsSnapshot.cs:
public bool DialMode { get; init; }

// Add to SettingsSnapshot.cs:
public ClockType ClockType   { get; init; } = ClockType.Phrase;
public bool   LcdUse24Hr     { get; init; } = false;
public bool   LcdShowSeconds { get; init; } = true;
public string LcdStyle       { get; init; } = "Dark";
public LcdSize LcdSize       { get; init; } = LcdSize.Medium;
```

### SettingsWindow Event Contract

The `SettingsWindow` per-property event model uses `Action<T>?`. The clock style event becomes:

```csharp
// Replace:
public event Action<bool>? DialModeChanged;

// With:
public event Action<ClockType>? ClockTypeChanged;

// Also add (these are subscribed in MainWindow.OpenSettings() but not yet declared):
public event Action<bool>?   LcdUse24HrChanged;
public event Action<bool>?   LcdShowSecondsChanged;
public event Action<string>? LcdStyleChanged;
public event Action<bool>?   ShowHourTicksChanged;
public event Action<bool>?   ShowMinuteDotsChanged;
public event Action<bool>?   ShowHourNumbersChanged;
```

`MainWindow.xaml.cs` `OpenSettings()` already contains `_settingsWindow.ClockTypeChanged += ct => { ClearActiveTheme(); SetClockType(ct); };`. This line compiles once `ClockTypeChanged` is declared on `SettingsWindow`.

### XAML — BtnNixie Addition

The existing Clock Style rail is a `StackPanel` with `BtnPhrase` and `BtnDial`. Add `BtnNixie` as a third button using the same `SegmentButtonStyle`:

```xml
<Button x:Name="BtnNixie" Content="Nixie"
        Style="{StaticResource SegmentButtonStyle}"
        Click="BtnNixie_Click"/>
```

"Nixie" is 5 characters. `SegmentButtonStyle` uses `Padding="12,4"`. The rail width increase fits within the 480px `SettingsWindow` constraint.

### _dialMode Stale Reference Fix

`MainWindow.xaml.cs` line 718 references `_dialMode` which is not a declared field. The semantically correct replacement:

```csharp
// Current (does not compile):
if (_dialMode || _currentTextStyle == "Split" || !_phraseWrapEnabled)

// Correct:
if (_clockType != ClockType.Phrase || _currentTextStyle == "Split" || !_phraseWrapEnabled)
```

---

## What NOT to Add

| Do Not Add | Why | What to Use Instead |
|------------|-----|---------------------|
| Any NuGet package | Zero new packages needed for this milestone | Existing BCL + WPF types |
| New `DialMode`-based migration code in `SettingsService` | Migration already implemented at lines 53–61 | Keep existing code unchanged |
| New rendering code for Nixie | `NixieClockView` and `NixieDigit` are already complete | Wire existing controls via `SetClockType(ClockType.Nixie)` (already implemented in `MainWindow`) |
| New timer for Nixie in `MainWindow` | `NixieClockView` manages its own 1s `DispatcherTimer` via `IsVisibleChanged` | Use `Visibility` toggle only |
| New `ClockType` enum members | Enum already contains `Phrase / Dial / Lcd / Nixie` | Use existing members |
| `LcdSize` in `AppSettings` | Derived from `FontSize` via `FontSizeToLcdSize()` at runtime | Do not persist; include in `SettingsSnapshot` only |

---

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| No new packages needed | HIGH | All required types exist in BCL, WPF, or existing project files — verified by direct source audit |
| `SettingsService` migration safety | HIGH | Migration reads `DialMode` from `JsonDocument`, not from deserialized record — verified in `SettingsService.cs` lines 53–61 |
| `ClockTypeChanged` subscription pre-wired | HIGH | `MainWindow.OpenSettings()` already contains the subscription — verified in source |
| `NixieClockView` / `NixieDigit` complete | HIGH | Both UserControls exist, are referenced in `MainWindow.xaml`, and handle their own timer lifecycle — verified in source |
| Missing `SettingsWindow` event declarations | HIGH | `MainWindow.OpenSettings()` subscribes to 6 events not declared on `SettingsWindow` — verified by cross-referencing both files |
| `_dialMode` is a stale reference / compile error | HIGH | No `_dialMode` field declared in `MainWindow.xaml.cs` field block (lines 15–63) — verified in source |

---

## Sources

All sources are the current codebase — HIGH confidence, verified by direct file inspection.

- `FuzzyClock.App/AppSettings.cs` — `DialMode` field confirmed present; `ClockType` field absent
- `FuzzyClock.App/SettingsSnapshot.cs` — `DialMode` present; `ClockType` absent
- `FuzzyClock.App/SettingsWindow.xaml.cs` — `DialModeChanged` event confirmed; `ClockTypeChanged` absent; LCD/dial decoration events absent
- `FuzzyClock.App/SettingsWindow.xaml` — 2-button Clock Style rail confirmed; `BtnNixie` absent
- `FuzzyClock.App/MainWindow.xaml.cs` — `_clockType` field present; `ClockTypeChanged` subscription present; `_dialMode` reference at line 718 confirmed stale
- `FuzzyClock.App/SettingsService.cs` — `DialMode → ClockType` migration at lines 53–61 confirmed; reads from `JsonDocument`, not deserialized record
- `FuzzyClock.App/ClockType.cs` — `Phrase / Dial / Lcd / Nixie` enum confirmed complete
- `FuzzyClock.App/Controls/NixieClockView.xaml(.cs)` — UserControl confirmed complete with self-managed `DispatcherTimer`
- `.planning/phases/57-re-introduce-nixie-into-the-new-architecture/57-RESEARCH.md` — Phase research (HIGH confidence)

---
*Stack research for: FuzzyStatsClock v3.7 — Nixie Clock Re-introduction*
*Researched: 2026-03-19*
