# Architecture Patterns

**Project:** FuzzyClock v3.7 — Nixie Clock Re-introduction
**Milestone:** Phase 57 — Re-introduce Nixie into the new architecture
**Researched:** 2026-03-19
**Confidence:** HIGH (verified by direct source audit of all affected files)

---

## Context

This is a subsequent milestone research document. The Nixie rendering layer (`NixieClockView`, `NixieDigit`) is already complete. The `ClockType` enum already includes `Nixie`. `MainWindow` already handles `ClockType.Nixie` in `ApplySettings()`, `SetClockType()`, and `SaveSettings()`. The tray menu already exposes Nixie. The work is entirely in the settings plumbing layer: four data-model records and one UI file.

---

## System Overview

```
MainWindow (orchestrator — source of truth for all runtime state)
├── NixieClockView (UserControl)  — manages its own 1s DispatcherTimer via IsVisibleChanged
│   └── NixieDigit (UserControl)  — pixel-exact Canvas geometry per UI-SPEC
├── DialCanvas (Canvas)           — Visibility-switched in same Row 0 as NixieView
├── PhraseText (TextBlock)        — Visibility-switched in same Row 0
├── StatsPanel (StackPanel)       — always below clock face regardless of type
└── SettingsWindow (modeless)     — fires per-setting Action<T> events; MainWindow subscribes in OpenSettings()

Settings flow:
AppSettings (JSON record) ──load/save──> SettingsService
                                              |
SettingsSnapshot (populate-on-open) <── MainWindow.GetCurrentSettingsSnapshot()
                                              |
SettingsWindow (reads snapshot, fires events) ──ClockTypeChanged──> MainWindow.SetClockType(ct)
```

---

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `AppSettings` | Persistent settings record; serialized to `settings.json` | `SettingsService` (read/write), `MainWindow` (with-expression updates) |
| `SettingsSnapshot` | Immutable read-only view of settings at window-open time; never written back | Produced by `MainWindow.GetCurrentSettingsSnapshot()`; consumed by `SettingsWindow.PopulateControls()` |
| `SettingsWindow` | UI for settings; fires typed `Action<T>?` events per setting change | Receives `SettingsSnapshot` on open; fires events to `MainWindow` |
| `MainWindow` | Source of truth for all runtime state; applies settings and saves them | Subscribes to all `SettingsWindow` events in `OpenSettings()`; owns `_clockType` field |
| `NixieClockView` | Self-contained Nixie clock face; manages its own 1s DispatcherTimer | Activated by `MainWindow.SetClockType(ClockType.Nixie)` via `Visibility` toggle |
| `SettingsService` | File I/O + schema migration for `AppSettings` | Called by `MainWindow` on load/save |
| `TrayMenuBuilder` | Tray menu construction; wires tray-level clock type toggles | Calls `MainWindow.SetClockType()` directly |

---

## Integration Points: New vs Modified

### New (does not currently exist)

| Item | File | Description |
|------|------|-------------|
| `BtnNixie` XAML button | `SettingsWindow.xaml` | Third button in Clock Style rail, after BtnDial |
| `BtnNixie_Click` handler | `SettingsWindow.xaml.cs` | Invokes `ClockTypeChanged?.Invoke(ClockType.Nixie)` |
| `ClockTypeChanged` event | `SettingsWindow.xaml.cs` | Replaces `DialModeChanged: Action<bool>` |
| `LcdUse24HrChanged` event | `SettingsWindow.xaml.cs` | Missing declaration; MainWindow already subscribes |
| `LcdShowSecondsChanged` event | `SettingsWindow.xaml.cs` | Missing declaration |
| `LcdStyleChanged` event | `SettingsWindow.xaml.cs` | Missing declaration |
| `ShowHourTicksChanged` event | `SettingsWindow.xaml.cs` | Missing declaration |
| `ShowMinuteDotsChanged` event | `SettingsWindow.xaml.cs` | Missing declaration |
| `ShowHourNumbersChanged` event | `SettingsWindow.xaml.cs` | Missing declaration |
| `AppSettings.ClockType` | `AppSettings.cs` | Replaces `DialMode: bool`; default `ClockType.Phrase` |
| `AppSettings.LcdUse24Hr` | `AppSettings.cs` | New LCD field; default `false` |
| `AppSettings.LcdShowSeconds` | `AppSettings.cs` | New LCD field; default `true` |
| `AppSettings.LcdStyle` | `AppSettings.cs` | New LCD field; default `"Dark"` |
| `AppSettings.LcdSize` | `AppSettings.cs` | New LCD field; default `LcdSize.Medium` |
| `SettingsSnapshot.ClockType` | `SettingsSnapshot.cs` | Replaces `DialMode: bool` |
| `SettingsSnapshot.LcdUse24Hr` | `SettingsSnapshot.cs` | New LCD field |
| `SettingsSnapshot.LcdShowSeconds` | `SettingsSnapshot.cs` | New LCD field |
| `SettingsSnapshot.LcdStyle` | `SettingsSnapshot.cs` | New LCD field |
| `SettingsSnapshot.LcdSize` | `SettingsSnapshot.cs` | New LCD field |
| `SettingsSnapshot.ShowHourTicks` | `SettingsSnapshot.cs` | New dial decoration field |
| `SettingsSnapshot.ShowMinuteDots` | `SettingsSnapshot.cs` | New dial decoration field |
| `SettingsSnapshot.ShowHourNumbers` | `SettingsSnapshot.cs` | New dial decoration field |

### Modified (exists, requires change)

| Item | File | Current State | Required State |
|------|------|--------------|----------------|
| `DialModeChanged` event | `SettingsWindow.xaml.cs` | `Action<bool>?` | Remove; replaced by `ClockTypeChanged: Action<ClockType>?` |
| `SetClockStyleButtonStates` | `SettingsWindow.xaml.cs` | `(bool dialMode)` — 2-button | `(ClockType ct)` — 3-button including `BtnNixie.Tag` |
| `PopulateControls` clock style call | `SettingsWindow.xaml.cs` | `SetClockStyleButtonStates(s.DialMode)` | `SetClockStyleButtonStates(s.ClockType)` |
| `BtnPhrase_Click` | `SettingsWindow.xaml.cs` | Fires `DialModeChanged?.Invoke(false)` | Fires `ClockTypeChanged?.Invoke(ClockType.Phrase)` |
| `BtnDial_Click` | `SettingsWindow.xaml.cs` | Fires `DialModeChanged?.Invoke(true)` | Fires `ClockTypeChanged?.Invoke(ClockType.Dial)` |
| `AppSettings.DialMode` | `AppSettings.cs` | `public bool DialMode { get; init; } = false;` | Remove property |
| `SettingsSnapshot.DialMode` | `SettingsSnapshot.cs` | `public bool DialMode { get; init; }` | Remove property |
| `_dialMode` reference in `ApplyPhraseWrap` | `MainWindow.xaml.cs` line ~718 | Stale field reference — compile error | Replace with `_clockType != ClockType.Phrase` |

### Pre-existing (verified complete — no changes needed)

| Item | File | Notes |
|------|------|-------|
| `NixieClockView` UserControl | `Controls/NixieClockView.xaml` + `.cs` | Complete; manages its own 1s timer via IsVisibleChanged |
| `NixieDigit` UserControl | `Controls/NixieDigit.xaml` + `.cs` | Complete pixel geometry |
| `NixieView` in MainWindow XAML | `MainWindow.xaml` line 118 | Declared, `Visibility="Collapsed"` |
| `ClockType` enum | `ClockType.cs` | `Phrase / Dial / Lcd / Nixie` — all four values present |
| `NixieSizeMap` | `NixieSize.cs` | `ToDigitHeight(LcdSize)` — Small=40, Medium=56, Large=72 |
| `_nixieClockItem` in tray | `TrayMenuBuilder.cs` | Wired to `SetClockType(ClockType.Nixie)` |
| `SetClockType(ClockType.Nixie)` branch | `MainWindow.xaml.cs` line 1323 | Sets `NixieView.Size`, shows `NixieView` |
| `ApplySettings` Nixie branch | `MainWindow.xaml.cs` line 272 | Restores Nixie on startup from `s.ClockType` |
| `SaveSettings` ClockType write | `MainWindow.xaml.cs` line 557 | Persists `_clockType` |
| `_clockType` field | `MainWindow.xaml.cs` line 35 | `ClockType _clockType = ClockType.Phrase` |
| `ClockTypeChanged` subscription | `MainWindow.xaml.cs` `OpenSettings()` | Already wired; compiles once the event exists on SettingsWindow |
| `DialMode → ClockType` JSON migration | `SettingsService.cs` lines 53–61 | Already implemented; reads from raw JsonDocument, not from record |

---

## Data Flow: Nixie Selection

```
User clicks "Nixie" in Settings window
    |
    v
BtnNixie_Click (SettingsWindow.xaml.cs)
    SetClockStyleButtonStates(ClockType.Nixie)   -- updates button Tag for visual selection state
    ClockTypeChanged?.Invoke(ClockType.Nixie)     -- fires event
    |
    v
MainWindow.OpenSettings() lambda (wired at line 460)
    ClearActiveTheme()
    SetClockType(ClockType.Nixie)
    |
    v
MainWindow.SetClockType(ClockType.Nixie)
    _clockType = ClockType.Nixie
    NixieView.Size = NixieSizeMap.ToDigitHeight(FontSizeToLcdSize(_currentFontSize))
    NixieView.Visibility = Visible
    DialCanvas.Visibility = Collapsed
    PhraseText.Visibility = Collapsed
    ShadowText.Visibility = Collapsed
    SaveSettings()
    |
    v
NixieClockView.IsVisibleChanged fires
    Starts its internal 1s DispatcherTimer
    Displays current time as Nixie tube digits
```

---

## Data Flow: Settings Persistence

```
MainWindow.SaveSettings()
    builds new AppSettings with { ..., ClockType = _clockType,
        LcdUse24Hr = _lcdUse24Hr, LcdShowSeconds = _lcdShowSeconds,
        LcdStyle = _lcdStyle, LcdSize = FontSizeToLcdSize(_currentFontSize),
        ShowHourTicks = _showHourTicks, ShowMinuteDots = _showMinuteDots,
        ShowHourNumbers = _showHourNumbers }
    SettingsService.Save(settings)
        writes to %LOCALAPPDATA%\FuzzyClock\settings.json (atomic via temp + File.Move)

MainWindow.ApplySettings(s)
    reads s.ClockType -> SetClockType(s.ClockType)
    reads s.LcdUse24Hr, s.LcdShowSeconds, s.LcdStyle -> sets _lcdUse24Hr, etc.
    reads s.ShowHourTicks, s.ShowMinuteDots, s.ShowHourNumbers -> sets decoration state

SettingsService.Load()
    reads raw JsonDocument
    migration: if "DialMode"=true in old JSON and ClockType==Phrase -> set ClockType=Dial
    deserializes into AppSettings record (absent fields use init defaults)
    Validate() corrects invalid values
```

---

## Data Flow: Settings Window Populate

```
MainWindow.OpenSettings()
    snap = GetCurrentSettingsSnapshot()
        returns new SettingsSnapshot {
            ClockType = _clockType,
            LcdUse24Hr = _lcdUse24Hr, LcdShowSeconds = _lcdShowSeconds,
            LcdStyle = _lcdStyle, LcdSize = FontSizeToLcdSize(_currentFontSize),
            ShowHourTicks = _showHourTicks, ...
        }
    _settingsWindow = new SettingsWindow(snap)
    _settingsWindow.ClockTypeChanged       += ct => { ClearActiveTheme(); SetClockType(ct); }
    _settingsWindow.LcdUse24HrChanged      += use24 => { ... }
    _settingsWindow.LcdShowSecondsChanged  += show => { ... }
    _settingsWindow.LcdStyleChanged        += style => { ... }
    _settingsWindow.ShowHourTicksChanged   += v => SetShowHourTicks(v)
    _settingsWindow.ShowMinuteDotsChanged  += v => SetShowMinuteDots(v)
    _settingsWindow.ShowHourNumbersChanged += v => SetShowHourNumbers(v)
    _settingsWindow.Show()

SettingsWindow.PopulateControls(s)
    SetClockStyleButtonStates(s.ClockType)   -- selects correct button visually
    ... (other controls populated from snapshot)
```

---

## Patterns to Follow

### Pattern 1: Visibility-Switch for Clock Face Toggle

`Visibility.Collapsed` / `Visible` toggle is the established pattern for switching between `PhraseText`, `DialCanvas`, and `NixieView`. All three occupy Grid Row 0. No row restructuring is needed.

```csharp
// The existing SetClockType pattern already in MainWindow.xaml.cs line 1323:
case ClockType.Nixie:
    NixieView.Visibility  = Visibility.Visible;
    DialCanvas.Visibility = Visibility.Collapsed;
    PhraseText.Visibility = Visibility.Collapsed;
    ShadowText.Visibility = Visibility.Collapsed;
    NixieView.Size        = NixieSizeMap.ToDigitHeight(FontSizeToLcdSize(_currentFontSize));
    break;
```

### Pattern 2: SettingsWindow Per-Setting Event Model

All settings changes fire individual `Action<T>?` events. SettingsWindow is one-way out — it never reads back from MainWindow. MainWindow is the sole source of truth.

```csharp
// Correct pattern for the new event declarations:
public event Action<ClockType>? ClockTypeChanged;
public event Action<bool>?      LcdUse24HrChanged;
public event Action<string>?    LcdStyleChanged;

// Correct pattern for click handlers:
private void BtnNixie_Click(object sender, RoutedEventArgs e)
{
    if (_suppressEvents) return;
    SetClockStyleButtonStates(ClockType.Nixie);
    ClockTypeChanged?.Invoke(ClockType.Nixie);
}
```

### Pattern 3: AppSettings Init-Property Record with Safe Defaults

All new `AppSettings` fields use `{ get; init; }` with explicit defaults. JSON absent-field behavior deserializes to the C# `init` value, enabling safe upgrade from old `settings.json` files.

```csharp
// Correct pattern:
public ClockType ClockType      { get; init; } = ClockType.Phrase;  // safe: always-valid
public bool      LcdUse24Hr    { get; init; } = false;              // safe: bool false
public bool      LcdShowSeconds { get; init; } = true;              // deliberate: show seconds
public string    LcdStyle       { get; init; } = "Dark";            // safe: always-valid string
public LcdSize   LcdSize        { get; init; } = LcdSize.Medium;    // safe: middle value
```

### Pattern 4: SettingsSnapshot as Populate-Only Snapshot

`SettingsSnapshot` is constructed once when the Settings window opens. Values flow out via events only; they never flow back into the snapshot. No two-way binding or live-sync is needed.

```csharp
// Correct: populate once on open, never update
private SettingsSnapshot GetCurrentSettingsSnapshot() => new SettingsSnapshot
{
    ClockType       = _clockType,
    LcdUse24Hr      = _lcdUse24Hr,
    LcdShowSeconds  = _lcdShowSeconds,
    LcdStyle        = _lcdStyle,
    LcdSize         = FontSizeToLcdSize(_currentFontSize),
    ShowHourTicks   = _showHourTicks,
    ShowMinuteDots  = _showMinuteDots,
    ShowHourNumbers = _showHourNumbers,
    // ... all other fields
};
```

### Pattern 5: NixieClockView Self-Contained Timer

`NixieClockView` manages its own 1-second `DispatcherTimer` via `IsVisibleChanged`. MainWindow does not start or stop this timer. The correct activation path is simply setting `NixieView.Visibility = Visible`. Do not add Nixie-specific timer logic to MainWindow's phrase or stats timers.

### Pattern 6: GetSegmentKey Delegation

All `IPhraseProvider` implementations must return a segment key that changes when the displayed phrase changes. The correct pattern for all providers is direct delegation to `GetPhrase()`:

```csharp
public string GetSegmentKey(DateTime dt) => GetPhrase(dt);
```

The six novelty providers (`Yoda`, `Jive`, `Pirate`, `Shakespeare`, `Dwarf`, `ValleyGirl`) are missing this implementation — it must be added to all six as the first step of Wave 1.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Reading AppSettings.DialMode After Migration

**What goes wrong:** Referencing `loaded.DialMode` or `s.DialMode` anywhere after the property is removed from the record.

**Why it happens:** Developers assume migration code reads from the deserialized record.

**Prevention:** The `SettingsService.Load()` migration reads `DialMode` from the raw `JsonDocument` via `TryGetProperty("DialMode", ...)`. This operates on the JSON string, not on the deserialized object. Removing the property from the record does not break the migration. Search for all `DialMode` references before and after making the change.

### Anti-Pattern 2: Using the _dialMode Field

**What goes wrong:** `MainWindow.xaml.cs` line ~718 in `ApplyPhraseWrap` contains `if (_dialMode || ...)`. There is no `_dialMode` field declared in the class. This is a pre-existing compile error.

**Prevention:** Replace with `if (_clockType != ClockType.Phrase || ...)`. The semantics are identical: phrase wrapping applies only in Phrase mode. All other clock types (Dial, Lcd, Nixie) skip it.

### Anti-Pattern 3: Adding a Nixie-Specific Timer to MainWindow

**What goes wrong:** Adding `_nixieTimer` or wiring the 10s phrase timer to update Nixie, creating redundant double-update.

**Prevention:** Set `NixieView.Visibility = Visible` in `SetClockType(ClockType.Nixie)`. The view handles everything via its own `IsVisibleChanged` handler.

### Anti-Pattern 4: Declaring Only ClockTypeChanged and Skipping the Other Six Events

**What goes wrong:** `MainWindow.OpenSettings()` already subscribes to `LcdUse24HrChanged`, `LcdShowSecondsChanged`, `LcdStyleChanged`, `ShowHourTicksChanged`, `ShowMinuteDotsChanged`, `ShowHourNumbersChanged`. Without these event declarations in `SettingsWindow.xaml.cs`, the project will not compile.

**Prevention:** Audit all `_settingsWindow.XXXChanged +=` subscriptions in `MainWindow.OpenSettings()` against the event declarations in `SettingsWindow.xaml.cs`. Add all missing declarations in a single edit.

### Anti-Pattern 5: Two-Way SettingsWindow State Sync

**What goes wrong:** Updating `SettingsSnapshot` when settings change and re-populating the window, causing flickering and sync complexity.

**Prevention:** The snapshot is a populate-on-open record. Events fire once per user change; MainWindow applies and saves. The snapshot is not updated until the next window open.

---

## Build Order (Phase Dependencies)

The phase is structured as two sequential waves. Wave 2 depends on the data model records Wave 1 establishes.

### Wave 1 (57-01): Data Model Foundation

**Files touched:**
- `FuzzyClock.Core/YodaPhraseProvider.cs` — add `GetSegmentKey`
- `FuzzyClock.Core/JivePhraseProvider.cs` — add `GetSegmentKey`
- `FuzzyClock.Core/PiratePhraseProvider.cs` — add `GetSegmentKey`
- `FuzzyClock.Core/ShakespearePhraseProvider.cs` — add `GetSegmentKey`
- `FuzzyClock.Core/DwarfPhraseProvider.cs` — add `GetSegmentKey`
- `FuzzyClock.Core/ValleyGirlPhraseProvider.cs` — add `GetSegmentKey`
- `FuzzyClock.App/AppSettings.cs` — remove `DialMode`; add `ClockType` + LCD fields
- `FuzzyClock.App/SettingsSnapshot.cs` — remove `DialMode`; add `ClockType` + LCD + dial decoration fields

**Why first:** `SettingsWindow.xaml.cs` cannot compile `SetClockStyleButtonStates(s.ClockType)` or `PopulateControls` until `SettingsSnapshot.ClockType` exists. `MainWindow.SaveSettings()` `with`-expression cannot compile until `AppSettings.ClockType` exists. The six novelty providers block `FuzzyClock.Core` from compiling entirely.

**Wave 1 output gate:** `FuzzyClock.Core` compiles; `AppSettings` and `SettingsSnapshot` have `ClockType` + LCD + dial-decoration fields; `DialMode` property removed from both.

### Wave 2 (57-02): UI Wiring

**Files touched:**
- `FuzzyClock.App/SettingsWindow.xaml` — add `BtnNixie` to Clock Style rail
- `FuzzyClock.App/SettingsWindow.xaml.cs` — replace `DialModeChanged` with `ClockTypeChanged`; add 6 missing events; update `SetClockStyleButtonStates`, `PopulateControls`, click handlers
- `FuzzyClock.App/MainWindow.xaml.cs` — fix `_dialMode` reference in `ApplyPhraseWrap`

**Depends on:** Wave 1 (`SettingsSnapshot.ClockType` must exist before `SetClockStyleButtonStates(s.ClockType)` compiles)

**Wave 2 output gate:** Full solution builds with 0 errors; `_dialMode` and `DialModeChanged` have zero occurrences in the codebase; `BtnNixie` exists in XAML; `ClockTypeChanged` and all six missing events are declared.

---

## File Change Map

```
Wave 1 (57-01):
FuzzyClock.Core/
├── YodaPhraseProvider.cs        — ADD GetSegmentKey
├── JivePhraseProvider.cs        — ADD GetSegmentKey
├── PiratePhraseProvider.cs      — ADD GetSegmentKey
├── ShakespearePhraseProvider.cs — ADD GetSegmentKey
├── DwarfPhraseProvider.cs       — ADD GetSegmentKey
└── ValleyGirlPhraseProvider.cs  — ADD GetSegmentKey

FuzzyClock.App/
├── AppSettings.cs               — REMOVE DialMode; ADD ClockType + LcdUse24Hr + LcdShowSeconds + LcdStyle + LcdSize
└── SettingsSnapshot.cs          — REMOVE DialMode; ADD ClockType + LCD fields + ShowHourTicks + ShowMinuteDots + ShowHourNumbers

Wave 2 (57-02):
FuzzyClock.App/
├── SettingsWindow.xaml          — ADD BtnNixie to Clock Style rail StackPanel
├── SettingsWindow.xaml.cs       — REPLACE DialModeChanged with ClockTypeChanged;
│                                   ADD 6 missing event declarations;
│                                   UPDATE SetClockStyleButtonStates(ClockType);
│                                   UPDATE PopulateControls;
│                                   UPDATE BtnPhrase_Click, BtnDial_Click;
│                                   ADD BtnNixie_Click
└── MainWindow.xaml.cs           — FIX _dialMode reference in ApplyPhraseWrap

NOT MODIFIED (verified complete):
FuzzyClock.App/
├── ClockType.cs                 — enum already has Nixie
├── NixieSize.cs                 — NixieSizeMap already complete
├── TrayMenuBuilder.cs           — _nixieClockItem already wired
├── SettingsService.cs           — DialMode migration already implemented
├── MainWindow.xaml              — NixieView already declared Visibility=Collapsed
└── MainWindow.xaml.cs           — SetClockType(Nixie), ApplySettings Nixie branch, SaveSettings all complete
Controls/
├── NixieClockView.xaml + .cs   — complete
└── NixieDigit.xaml + .cs       — complete
```

---

## Scalability Considerations

This is a single-user desktop widget. The relevant scalability concern is adding a fifth clock type in a future milestone.

| Concern | Current Approach | Why It Holds |
|---------|-----------------|--------------|
| Adding a new clock type | Add enum value, add `case` in `SetClockType`, add XAML view element | Clean switch pattern; no flag explosion |
| New settings fields | Add to `AppSettings` with safe `init` default; add to `SettingsSnapshot`; add event to `SettingsWindow`; subscribe in `MainWindow.OpenSettings()` | Established 4-step pattern; JSON backward compat via init defaults |
| Old `settings.json` files | `SettingsService.Validate()` corrects invalid values; migration block handles schema changes | Pre-existing migration infrastructure handles new cases |

---

## Sources

All findings are HIGH confidence — derived from direct source audit.

| Source | What was verified |
|--------|------------------|
| `FuzzyClock.App/MainWindow.xaml.cs` | Clock type wiring, `OpenSettings()` subscriptions (lines 460–481), `ApplySettings()` Nixie branch (line 272), `SaveSettings()` (line 557), `GetCurrentSettingsSnapshot()` (line 412), `ApplyPhraseWrap()` stale `_dialMode` reference (line 718) |
| `FuzzyClock.App/AppSettings.cs` | `DialMode` field confirmed present; `ClockType` absent |
| `FuzzyClock.App/SettingsSnapshot.cs` | `DialMode` field confirmed present; `ClockType` absent |
| `FuzzyClock.App/SettingsWindow.xaml.cs` | `DialModeChanged` event confirmed; `ClockTypeChanged` absent; LCD/decoration event declarations absent |
| `FuzzyClock.App/SettingsWindow.xaml` | 2-button Clock Style rail (Phrase / Dial) confirmed |
| `FuzzyClock.App/SettingsService.cs` | `DialMode → ClockType` migration at lines 53–61 verified; reads from raw `JsonDocument`, not from deserialized record |
| `FuzzyClock.App/ClockType.cs` | Enum with `Phrase / Dial / Lcd / Nixie` confirmed |
| `FuzzyClock.App/TrayMenuBuilder.cs` | `_nixieClockItem` wired to `SetClockType(ClockType.Nixie)` confirmed |
| `Controls/NixieClockView.xaml.cs` | Self-contained 1s timer via `IsVisibleChanged` confirmed |
| `.planning/phases/57-.../57-RESEARCH.md` | Primary research source — full source audit |
| `.planning/phases/57-.../57-01-PLAN.md` | Wave 1 task specification |
| `.planning/phases/57-.../57-02-PLAN.md` | Wave 2 task specification |

---

*Architecture research for: FuzzyClock v3.7 — Phase 57 Nixie re-introduction*
*Researched: 2026-03-19*
