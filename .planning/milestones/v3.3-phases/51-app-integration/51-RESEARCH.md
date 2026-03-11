# Phase 51: App Integration - Research

**Researched:** 2026-03-10
**Domain:** WPF/WinForms hybrid app wiring — AppSettings, MainWindow, SettingsWindow, TrayMenuBuilder
**Confidence:** HIGH

## Summary

This phase is pure integration work: no new algorithms, no new controls. All the building blocks exist — `LcdClockView`, `LcdTheme`, `LcdSize`, `LcdSizeMap`, `LcdTimeFormatHelper`, and `ClockType` are all in place. The task is to add persistence fields to `AppSettings`, wire the `LcdClockView` into `MainWindow` (XAML + code-behind), extend `SettingsWindow` with a third clock-style button and conditional LCD options rows, build the tray "Clock Type" submenu, and ensure `ResetToDefaults` covers the new fields.

All patterns required are already established in the codebase: `Visibility.Collapsed` for panel show/hide, `_suppressEvents` guard in SettingsWindow, `Dispatcher.Invoke` for tray→WPF thread marshalling, `with` expressions for AppSettings updates, and `SettingsSnapshot` for carrying state to the settings window. No external libraries or new patterns are needed.

The single meaningful design tension: `AppSettings` currently has no `LcdTheme`, `LcdUse24Hr`, or `LcdShowSeconds` fields; `SettingsSnapshot` has no LCD fields; and `SetClockType()` has no LCD branch. All three need parallel additions.

**Primary recommendation:** Follow the exact same code structure as the existing Dial mode additions — the pattern is already correct, just extend it to three-way instead of two-way.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- `LcdTheme` (LcdTheme enum, default Green) — persisted with JsonStringEnumConverter
- `LcdUse24Hr` (bool, default false — 12hr)
- `LcdShowSeconds` (bool, default true)
- No separate `LcdSize` field — LCD size is driven by the existing `FontSize` field
- `SegmentHeight = FontSize * 2`: 16pt→32px, 24pt→48px, 32pt→64px, 40pt→80px
- ResetToDefaults restores ClockType to Phrase, LcdTheme to Green, LcdUse24Hr to false, LcdShowSeconds to true
- Font Size row stays visible in LCD mode — S/M/L/XL buttons control LCD segment size via SegmentHeight = FontSize * 2
- Phrase Style combo stays visible in LCD mode but is disabled
- LCD options appear as additional rows in the existing 2-column grid (Appearance tab), visible only when ClockType = Lcd:
  - "LCD Theme" row: ComboBox (Green / Amber / Blue / Teal / Red)
  - "Format" row: [12hr] [24hr] segmented toggle buttons
  - "Seconds" row: CheckBox "Show seconds"
- LCD rows use Visibility.Collapsed when not in LCD mode (instant, no animation)
- BtnLcd added to Clock Style segmented button rail alongside Phrase and Dial
- "Clock Type ▶" submenu positioned immediately after "Open Settings..." and its separator — before Ghost Mode
- Three checkable items: Phrase / Dial / LCD; active type has checkmark
- Clicking an inactive type calls SetClockType() via Dispatcher.Invoke (WinForms thread → WPF thread)
- SetClockType(ClockType) method: collapses/shows PhraseArea, DialCanvas, LcdArea
- LcdClockView placed in LcdArea; on switch to LCD, call UpdateTime() for immediate display
- 10s main timer skips phrase/dial update when ClockType = Lcd (LCD has its own 1s DispatcherTimer)
- LcdClockView properties bound/set on switch: Theme, Use24Hr, ShowSeconds; SegmentHeight = FontSize * 2

### Claude's Discretion
- Exact XAML row structure for LCD options panel (Grid vs StackPanel, row indices)
- TrayMenuState and TrayMenuCallbacks additions for clock type switching
- SettingsSnapshot additions for LCD state (LcdTheme, LcdUse24Hr, LcdShowSeconds)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| F1 | ClockType enum migration fully wired into MainWindow, SettingsWindow, TrayMenuBuilder | Already in place from Phase 48; this phase adds LCD branch to SetClockType() and all display surfaces |
| F6 | AppSettings new fields: LcdTheme, LcdUse24Hr, LcdShowSeconds (no LcdSize field) | AppSettings is a record with `with` expressions; add three properties with JsonStringEnumConverter on LcdTheme |
| F7 | MainWindow integration: LcdArea, SetClockType() LCD branch, 10s timer skip, LcdClockView properties | SetClockType() pattern fully established; extend existing method body; LcdClockView DPs are set directly |
| F8 | SettingsWindow: BtnLcd, LCD options rows, events for LcdTheme/LcdUse24Hr/LcdShowSeconds | SettingsWindow event pattern established; add three new events and handlers; rows use Visibility.Collapsed toggling |
| F9 | Tray menu: "Clock Type" submenu with checkable Phrase/Dial/LCD items | TrayMenuBuilder pattern established; add submenu item + three checkable children; SyncCheckmarks updated |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| WPF (System.Windows) | .NET 10 | XAML UI, Visibility, DependencyProperty | Project's primary UI framework |
| WinForms (System.Windows.Forms) | .NET 10 | Tray ContextMenuStrip, ToolStripMenuItem | Established pattern throughout TrayMenuBuilder |
| System.Text.Json | .NET 10 | AppSettings serialization, JsonStringEnumConverter | Already used; LcdTheme follows ClockType pattern |

No new NuGet packages required.

---

## Architecture Patterns

### Recommended Project Structure
No structural changes needed. All work is in existing files:
```
FuzzyClock.App/
├── AppSettings.cs              # Add LcdTheme, LcdUse24Hr, LcdShowSeconds fields
├── SettingsSnapshot.cs         # Add LcdTheme, LcdUse24Hr, LcdShowSeconds fields
├── MainWindow.xaml             # Add LcdArea (ContentBorder inner Grid), wire LcdClockView
├── MainWindow.xaml.cs          # Extend SetClockType(), ApplySettings(), SaveSettings(), ResetToDefaults()
├── SettingsWindow.xaml         # Add BtnLcd, LCD rows in Appearance tab Grid
├── SettingsWindow.xaml.cs      # Add events, handlers, SetClockStyleButtonStates() BtnLcd, LCD row toggle
└── TrayMenuBuilder.cs          # Add Clock Type submenu, TrayMenuState/TrayMenuCallbacks entries
```

### Pattern 1: AppSettings Record Field Addition
**What:** Add new `init` properties to the `AppSettings` record following the JsonStringEnumConverter convention.
**When to use:** Any new persisted setting.
```csharp
[JsonConverter(typeof(JsonStringEnumConverter))]
public LcdTheme LcdTheme    { get; init; } = LcdTheme.Green;
public bool     LcdUse24Hr  { get; init; } = false;
public bool     LcdShowSeconds { get; init; } = true;
```
Note: `LcdSize` is NOT added — size is computed as `FontSize * 2` at render time per the locked decision.

### Pattern 2: SettingsSnapshot Additions
**What:** Add LCD fields to `SettingsSnapshot` record so they flow from `GetCurrentSettingsSnapshot()` to the SettingsWindow.
```csharp
public LcdTheme LcdTheme      { get; init; } = LcdTheme.Green;
public bool     LcdUse24Hr    { get; init; } = false;
public bool     LcdShowSeconds { get; init; } = true;
```
Also update `GetCurrentSettingsSnapshot()` in MainWindow to populate these from `_lcdTheme`, `_lcdUse24Hr`, `_lcdShowSeconds` fields.

### Pattern 3: SetClockType() Extension
**What:** Extend the existing `SetClockType()` to handle `ClockType.Lcd`. Pattern mirrors the Dial branch exactly.
```csharp
private void SetClockType(ClockType clockType)
{
    _clockType = clockType;

    PhraseText.Visibility       = Visibility.Collapsed;
    SplitPhrasePanel.Visibility = Visibility.Collapsed;
    DialCanvas.Visibility       = Visibility.Collapsed;
    LcdArea.Visibility          = Visibility.Collapsed;

    switch (clockType)
    {
        case ClockType.Dial:
            DialCanvas.Visibility = Visibility.Visible;
            UpdateDialDisplay();
            break;
        case ClockType.Lcd:
            // Apply current LCD settings before making visible
            LcdView.Theme       = _lcdTheme;
            LcdView.Use24Hr     = _lcdUse24Hr;
            LcdView.ShowSeconds = _lcdShowSeconds;
            LcdView.Size        = FontSizeToLcdSize(_currentFontSize);
            LcdArea.Visibility  = Visibility.Visible;
            LcdView.UpdateTime();
            break;
        default: // Phrase
            bool isSplit = _currentTextStyle == "Split";
            PhraseText.Visibility       = isSplit ? Visibility.Collapsed : Visibility.Visible;
            SplitPhrasePanel.Visibility = isSplit ? Visibility.Visible   : Visibility.Collapsed;
            break;
    }

    SaveSettings();
}
```

**SegmentHeight mapping** (per locked decision, SegmentHeight = FontSize * 2):
```csharp
private static LcdSize FontSizeToLcdSize(int fontSize) => fontSize switch
{
    16 => LcdSize.Small,   // 32px
    24 => LcdSize.Medium,  // 48px
    40 => LcdSize.Large,   // 80px (XL maps to Large — LcdSize only has Small/Medium/Large)
    _  => LcdSize.Large,   // 32pt maps to Large (64px); default Large
};
```
Wait — re-reading: CONTEXT.md says `SegmentHeight = FontSize * 2` but `LcdClockView.Size` uses `LcdSize` enum. Looking at `LcdSizeMap`: Small=32, Medium=48, Large=64. But FontSize 40 → SegmentHeight 80 is not covered by LcdSize. The CONTEXT says "No separate LcdSize field — LCD size is driven by the existing FontSize field", which means instead of setting `LcdView.Size`, the planner should set `LcdView` digit `SegmentHeight` directly, OR use a custom `SegmentHeight` DP. However, `LcdClockView` exposes a `Size` DP (LcdSize), not a raw SegmentHeight.

**Resolution:** `LcdClockView.Size` = `LcdSize` enum drives `SegmentHeight` internally via `LcdSizeMap`. The CONTEXT decision maps FontSize→SegmentHeight=FontSize*2, which gives: 16→32 (Small), 24→48 (Medium), 32→64 (Large), 40→80 (no enum value). The planner must decide: either (a) cap at Large for 40pt, or (b) set `SegmentHeight` directly on child digits. Since the CONTEXT says LCD size is driven by FontSize and lists `SegmentHeight = FontSize * 2`, the planner should prefer calling `OnSizeChanged` logic directly or adding an `XLarge` size — but the existing `LcdSize` enum has no XLarge. Most likely the planner should map 40pt→Large (64px) as the closest match, acknowledging XL font won't achieve 80px segments via the current enum. This is a decision-point for the planner to note.

### Pattern 4: 10s Timer LCD Skip
**What:** The main `_timer` currently calls `UpdatePhraseIfChanged()` and `UpdateDialDisplay()` unconditionally (except Dial already has a guard). Add LCD skip.
```csharp
_timer.Tick += (_, _) =>
{
    if (_clockType != ClockType.Lcd)
    {
        UpdatePhraseIfChanged();
        if (_clockType == ClockType.Dial) UpdateDialDisplay();
    }
    UpdateDateDisplay();
};
```

### Pattern 5: SettingsWindow LCD Rows (XAML)
**What:** Add rows to the existing 2-column `Grid` in the Appearance tab. Currently 4 rows (0=Opacity, 1=Font Size, 2=Clock Style, 3=Phrase Style). Add rows 4, 5, 6 for LCD options. All three rows use `Visibility.Collapsed` by default; shown only when ClockType=Lcd.

The `Grid.RowDefinitions` needs three new `RowDefinition Height="Auto"` entries. Each LCD row gets a `Visibility` binding or is toggled programmatically.

Since the SettingsWindow uses code-behind (no MVVM binding), toggle via a helper method:
```csharp
private void SetLcdRowsVisible(bool visible)
{
    var vis = visible ? Visibility.Visible : Visibility.Collapsed;
    LcdThemeRow.Visibility  = vis;
    LcdFormatRow.Visibility = vis;
    LcdSecondsRow.Visibility = vis;
}
```
Call this from `SetClockStyleButtonStates()` and from `BtnLcd_Click()`.

### Pattern 6: BtnLcd in Clock Style Rail
**What:** Add `BtnLcd` to the existing `StackPanel` inside the Clock Style `Border` in XAML. Same style as BtnPhrase and BtnDial.
```xml
<Button x:Name="BtnLcd" Content="LCD" Style="{StaticResource SegmentButtonStyle}" Click="BtnLcd_Click"/>
```
In code-behind, update `SetClockStyleButtonStates`:
```csharp
private void SetClockStyleButtonStates(ClockType clockType)
{
    BtnPhrase.Tag = clockType == ClockType.Phrase ? "selected" : null;
    BtnDial.Tag   = clockType == ClockType.Dial   ? "selected" : null;
    BtnLcd.Tag    = clockType == ClockType.Lcd    ? "selected" : null;
    SetLcdRowsVisible(clockType == ClockType.Lcd);
}
```

### Pattern 7: Tray Submenu
**What:** Add "Clock Type ▶" submenu after the first separator (after "Open Settings...") and before Ghost Mode. This requires inserting it at index 2 (after openSettingsItem=0, separator=1).

The current menu Insert order is: `Open Settings...` → `separator` → `Ghost Mode` → ...

The new order: `Open Settings...` → `separator` → `Clock Type ▶` (submenu) → `Ghost Mode` → ...

Insert the submenu at position 2:
```csharp
var clockTypeMenu = new System.Windows.Forms.ToolStripMenuItem("Clock Type");

_phraseClockItem = new System.Windows.Forms.ToolStripMenuItem("Phrase") { Checked = initialState.ClockType == ClockType.Phrase };
_phraseClockItem.Click += (_, _) => _cb.SetClockType(ClockType.Phrase);
clockTypeMenu.DropDownItems.Add(_phraseClockItem);

_dialClockItem = new System.Windows.Forms.ToolStripMenuItem("Dial") { Checked = initialState.ClockType == ClockType.Dial };
_dialClockItem.Click += (_, _) => _cb.SetClockType(ClockType.Dial);
clockTypeMenu.DropDownItems.Add(_dialClockItem);

_lcdClockItem = new System.Windows.Forms.ToolStripMenuItem("LCD") { Checked = initialState.ClockType == ClockType.Lcd };
_lcdClockItem.Click += (_, _) => _cb.SetClockType(ClockType.Lcd);
clockTypeMenu.DropDownItems.Add(_lcdClockItem);

menu.Items.Insert(2, clockTypeMenu);
```

Update `SyncCheckmarks`:
```csharp
_phraseClockItem.Checked = s.ClockType == ClockType.Phrase;
_dialClockItem.Checked   = s.ClockType == ClockType.Dial;
_lcdClockItem.Checked    = s.ClockType == ClockType.Lcd;
```

### Pattern 8: TrayMenuCallbacks Extension
**What:** Add `SetClockType` action to `TrayMenuCallbacks` and wire it in `MainWindow`.
```csharp
// In TrayMenuCallbacks:
public required Action<ClockType> SetClockType { get; init; }

// In MainWindow ContentRendered, when building callbacks:
SetClockType = ct => Dispatcher.Invoke(() => SetClockType(ct)),
```

### Pattern 9: LcdArea in MainWindow XAML
**What:** The existing inner `Grid` in `ContentBorder` holds `PhraseText`, `SplitPhrasePanel`, and `DialCanvas` in overlapping cells (all in same Grid row/column). Add `LcdArea` as a fourth overlapping element in the same cell. It starts `Visibility.Collapsed`.

The LcdClockView namespace must be declared in MainWindow.xaml:
```xml
xmlns:controls="clr-namespace:FuzzyClock.App.Controls"
```
Then:
```xml
<controls:LcdClockView x:Name="LcdView"
                        Visibility="Collapsed"
                        HorizontalAlignment="Center"/>
```

### Pattern 10: ApplySettings() LCD Branch
**What:** The existing `ApplySettings()` has a block for clock type. Extend it to handle `ClockType.Lcd`.
```csharp
// Extend the ClockType block in ApplySettings():
_lcdTheme      = s.LcdTheme;
_lcdUse24Hr    = s.LcdUse24Hr;
_lcdShowSeconds = s.LcdShowSeconds;

if (s.ClockType == ClockType.Lcd)
{
    PhraseText.Visibility       = Visibility.Collapsed;
    SplitPhrasePanel.Visibility = Visibility.Collapsed;
    DialCanvas.Visibility       = Visibility.Collapsed;
    LcdView.Theme               = s.LcdTheme;
    LcdView.Use24Hr             = s.LcdUse24Hr;
    LcdView.ShowSeconds         = s.LcdShowSeconds;
    LcdView.Size                = FontSizeToLcdSize(s.FontSize);
    LcdArea.Visibility          = Visibility.Visible;
    // Do NOT call UpdateTime() here — LcdClockView.IsVisibleChanged will fire when window becomes visible
}
```

### Anti-Patterns to Avoid
- **Setting LcdView.Size in ContentRendered after InitDialDecorations**: LCD doesn't need dial initialization; set LcdView properties in ApplySettings() and SetClockType() directly.
- **Calling UpdateTime() before the window is shown**: LcdClockView's `IsVisibleChanged` event handles the initial render automatically when `LcdArea.Visibility` is set to Visible after Show().
- **Storing SegmentHeight as a field in MainWindow**: Not needed — compute from FontSize at point of use via `FontSizeToLcdSize()`.
- **Adding a separate `LcdSize` field to AppSettings**: Locked decision says no; FontSize drives it.
- **Using Visibility.Hidden**: Use Visibility.Collapsed everywhere — Hidden preserves layout space.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Time formatting | Custom format string | `LcdTimeFormatHelper.FormatTime()` | Already built in Phase 50; handles 12/24hr and seconds |
| Segment sizing | Custom size table | `LcdSizeMap.ToSegmentHeight()` | Already maps LcdSize enum to px values |
| Theme colors | Inline color values | `LcdPalette.Get(LcdTheme)` | Returns lit/ghost/background triple per theme |
| Enum JSON persistence | Manual string parsing | `JsonStringEnumConverter` | Already used for ClockType; same pattern for LcdTheme |
| WPF/WinForms threading | Manual SynchronizationContext | `Dispatcher.Invoke` | Established pattern in all tray callbacks |

---

## Common Pitfalls

### Pitfall 1: SegmentHeight XL Font Gap
**What goes wrong:** `LcdSize` enum has Small/Medium/Large (32/48/64px). FontSize=40 should yield 80px per CONTEXT decision, but no `LcdSize.XLarge` exists.
**Why it happens:** `LcdClockView.Size` is a `LcdSize` DP; `LcdSizeMap` only covers three values. The CONTEXT decision states `SegmentHeight = FontSize * 2` but this exceeds the enum's range at 40pt.
**How to avoid:** Map 40pt → `LcdSize.Large` (64px) as the closest available value, OR set `SegmentHeight` directly on all `SevenSegmentDigit` children via a new path. The simpler choice is to cap at Large. Document this as known behavior.
**Warning signs:** `ArgumentOutOfRangeException` from `LcdSizeMap.ToSegmentHeight()` if a new size value is accidentally passed.

### Pitfall 2: LCD Area Visibility vs. LcdClockView Timer
**What goes wrong:** LcdClockView's internal DispatcherTimer starts only when `IsVisible = true` (via `IsVisibleChanged`). If `LcdArea` is set to `Visible` but the parent window hasn't been shown yet, the timer starts prematurely.
**Why it happens:** `IsVisibleChanged` fires when `Visibility` changes, even before the window's `ContentRendered`.
**How to avoid:** In `ApplySettings()` (called before `Show()`), set `LcdArea.Visibility = Visible` but do NOT call `UpdateTime()` explicitly — the `IsVisibleChanged` handler does it. If the timer starts early it's not harmful (the window won't be visible), but match the existing dial/phrase pattern: apply visibility in `ApplySettings`, let the view self-manage.

### Pitfall 3: SaveSettings() Missing LCD Fields
**What goes wrong:** `SaveSettings()` uses `_settings with { ... }` to update the cached record. If `LcdTheme`, `LcdUse24Hr`, `LcdShowSeconds` are not added to the `with` expression, they revert to defaults on next load.
**Why it happens:** AppSettings is immutable; only explicitly listed fields are updated.
**How to avoid:** Add all three fields to the `with` block in `SaveSettings()`. Grep for `_settings = _settings with` and add the three new lines.
**Warning signs:** LCD settings reset to defaults after restart.

### Pitfall 4: SettingsWindow LCD Row RowDefinition Count Mismatch
**What goes wrong:** Adding 3 new `RowDefinition` entries to the Grid but forgetting to update the `Grid.Row` index on existing rows that follow.
**Why it happens:** XAML Grid rows are zero-indexed; inserting rows shifts all subsequent row assignments.
**How to avoid:** LCD rows should be appended after the existing 4 rows (at indices 4, 5, 6) — no existing rows need re-indexing. Phrase Style row at Grid.Row="3" stays at 3.

### Pitfall 5: Tray Submenu Thread Safety
**What goes wrong:** A checkable tray item `Click` handler calling `SetClockType()` directly (without `Dispatcher.Invoke`) will crash because WinForms fires on the WinForms thread.
**Why it happens:** `TrayMenuBuilder` lives in WinForms territory; all callbacks must marshal to WPF dispatcher.
**How to avoid:** Pattern is already established — all tray callbacks use `_cb.SomeAction()` and `TrayMenuCallbacks` items wrap calls in `Dispatcher.Invoke`. The new `SetClockType` callback must follow the same pattern.

### Pitfall 6: SettingsSnapshot Not Including LCD State
**What goes wrong:** Settings window opens and LCD options don't reflect current state (always show defaults).
**Why it happens:** `SettingsSnapshot` doesn't carry `LcdTheme`, `LcdUse24Hr`, `LcdShowSeconds`; `GetCurrentSettingsSnapshot()` returns defaults.
**How to avoid:** Add three fields to `SettingsSnapshot`, populate from `_lcdTheme`/`_lcdUse24Hr`/`_lcdShowSeconds` in `GetCurrentSettingsSnapshot()`, and populate controls in `SettingsWindow.PopulateControls()`.

---

## Code Examples

### LCD fields in AppSettings
```csharp
// Source: existing ClockType field at AppSettings.cs line 27 — same pattern
[JsonConverter(typeof(JsonStringEnumConverter))]
public LcdTheme LcdTheme      { get; init; } = LcdTheme.Green;
public bool     LcdUse24Hr    { get; init; } = false;
public bool     LcdShowSeconds { get; init; } = true;
```

### MainWindow timer tick skip for LCD
```csharp
// Source: existing timer Tick in MainWindow.xaml.cs ~line 98
_timer.Tick += (_, _) =>
{
    if (_clockType != ClockType.Lcd)
    {
        UpdatePhraseIfChanged();
        if (_clockType == ClockType.Dial) UpdateDialDisplay();
    }
    UpdateDateDisplay();
};
```

### WinForms ToolStripMenuItem submenu with checkable children
```csharp
// Source: existing SyncCheckmarks pattern in TrayMenuBuilder.cs
private System.Windows.Forms.ToolStripMenuItem _phraseClockItem = null!;
private System.Windows.Forms.ToolStripMenuItem _dialClockItem   = null!;
private System.Windows.Forms.ToolStripMenuItem _lcdClockItem    = null!;

// In SyncCheckmarks:
_phraseClockItem.Checked = s.ClockType == ClockType.Phrase;
_dialClockItem.Checked   = s.ClockType == ClockType.Dial;
_lcdClockItem.Checked    = s.ClockType == ClockType.Lcd;
```

### SettingsWindow new events
```csharp
// Source: existing ClockTypeChanged event pattern in SettingsWindow.xaml.cs line 26
public event Action<LcdTheme>? LcdThemeChanged;
public event Action<bool>?     LcdUse24HrChanged;
public event Action<bool>?     LcdShowSecondsChanged;
```

### LCD rows visibility toggle in SettingsWindow
```csharp
private void SetClockStyleButtonStates(ClockType clockType)
{
    BtnPhrase.Tag = clockType == ClockType.Phrase ? "selected" : null;
    BtnDial.Tag   = clockType == ClockType.Dial   ? "selected" : null;
    BtnLcd.Tag    = clockType == ClockType.Lcd    ? "selected" : null;
    // Toggle LCD-specific rows
    var lcdVis = clockType == ClockType.Lcd ? Visibility.Visible : Visibility.Collapsed;
    LcdThemeRow.Visibility   = lcdVis;
    LcdFormatRow.Visibility  = lcdVis;
    LcdSecondsRow.Visibility = lcdVis;
}
```

### LcdArea in MainWindow XAML (inner Grid alongside existing elements)
```xml
<!-- In MainWindow.xaml, same inner Grid as PhraseText/SplitPhrasePanel/DialCanvas -->
<controls:LcdClockView x:Name="LcdView"
                        Visibility="Collapsed"
                        HorizontalAlignment="Center"
                        VerticalAlignment="Center"/>
```
xmlns declaration at Window level: `xmlns:controls="clr-namespace:FuzzyClock.App.Controls"`

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `bool DialMode` | `ClockType` enum (Phrase/Dial/Lcd) | Phase 48 | `SetClockType()` already handles Phrase/Dial; add Lcd branch |
| Two-way clock switching | Three-way clock switching | This phase | SetClockType(), SettingsWindow, TrayMenu all go 3-way |

**Deprecated/outdated:**
- The Phase 48 `SetClockType()` stub handled only Phrase and Dial; the Lcd branch is explicitly missing (evidenced by the else block treating everything non-Dial as phrase mode).

---

## Open Questions

1. **XL font size (40pt) → SegmentHeight 80px**
   - What we know: `LcdSize` enum has no XLarge; `LcdSizeMap` maps Small/Medium/Large to 32/48/64px. CONTEXT says SegmentHeight=FontSize*2 which would be 80px for 40pt.
   - What's unclear: Should the planner cap at Large (64px), or add LcdSize.XLarge (new enum value + LcdSizeMap entry)?
   - Recommendation: Cap at Large for this phase to stay within scope. The 80px case is a minor visual discrepancy (64 vs 80px segments). Adding XLarge is a one-line enum + one-line map change if needed.

2. **`LcdArea` as named Border vs. direct LcdClockView**
   - What we know: CONTEXT refers to `LcdArea`; the XAML currently has no such named element.
   - What's unclear: Whether to wrap `LcdClockView` in a named `ContentPresenter`/`Border` called `LcdArea`, or name the control itself `LcdView` and use the control directly.
   - Recommendation: Name the `LcdClockView` element `LcdView` (the actual control) — no wrapper needed. `LcdArea` in CONTEXT is a conceptual reference; Visibility is set on the control directly. This matches how `DialCanvas` works.

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `MainWindow.xaml.cs`, `SettingsWindow.xaml.cs`, `TrayMenuBuilder.cs`, `AppSettings.cs`, `SettingsSnapshot.cs`, `LcdClockView.xaml.cs`, `LcdTheme.cs`, `LcdSize.cs`, `SettingsWindow.xaml`, `MainWindow.xaml`
- `51-CONTEXT.md` — locked decisions and integration points

### Secondary (MEDIUM confidence)
- `REQUIREMENTS.md` F1/F6/F7/F8/F9 specifications

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all existing .NET 10 WPF/WinForms
- Architecture: HIGH — all patterns have working implementations in the codebase; extension is mechanical
- Pitfalls: HIGH — identified from direct code inspection, not speculation

**Research date:** 2026-03-10
**Valid until:** Stable — no external dependencies; valid until codebase changes
