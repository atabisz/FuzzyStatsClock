# Phase 63: SettingsWindow LCD UI - Research

**Researched:** 2026-03-24
**Domain:** WPF XAML + C# code-behind (SettingsWindow extension)
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Add `BtnLcd` with `Content="LCD"` to the Clock Style rail alongside `BtnPhrase`, `BtnDial`, `BtnNixie`. Same `SegmentButtonStyle`, same `Background="#FF3A3A3A"` Border container, same horizontal `StackPanel`.
- **D-02:** `BtnLcd_Click` handler fires `ClockTypeChanged?.Invoke(ClockType.Lcd)` and calls `SetClockStyleButtonStates(ClockType.Lcd)` — mirrors `BtnPhrase_Click`, `BtnDial_Click`, `BtnNixie_Click` exactly.
- **D-03:** `SetClockStyleButtonStates` adds `BtnLcd.Tag = ct == ClockType.Lcd ? "selected" : null;` alongside the existing three button tag assignments.
- **D-04:** Add Row 6 to the Appearance tab Grid's `RowDefinitions`. The Grid currently has 6 rows (0–5); Row 6 is the LCD options row.
- **D-05:** Row label in Column 0: `TextBlock x:Name="LcdOptionsLabel"` with `Text="LCD"`, styled identically to `DialFaceLabel` (VerticalAlignment="Top", HorizontalAlignment="Right", Margin="0,8,10,0").
- **D-06:** Column 1: `StackPanel x:Name="LcdOptionsPanel"` (Margin="0,8,0,0") containing, vertically: `ChkLcdUse24Hr` (Content="24-hour mode"), `ChkLcdShowSeconds` (Content="Show seconds"), `CmbLcdStyle` (Width="120", items: Dark/Paper/Silver).
- **D-07:** `CmbLcdStyle` mirrors `CmbPhraseStyle` pattern (same Width=120, same Margin, same VerticalAlignment).
- **D-08:** `CmbLcdStyle_SelectionChanged` handler (under `_suppressEvents` guard) fires `LcdStyleChanged?.Invoke(selectedContent)` where `selectedContent` is the `Content` string of the selected `ComboBoxItem`.
- **D-09:** In `SetClockStyleButtonStates`, set visibility of both `LcdOptionsLabel` and `LcdOptionsPanel` — `Visibility.Visible` when `ct == ClockType.Lcd`, `Visibility.Collapsed` otherwise.
- **D-10:** Add to `PopulateControls` (under `_suppressEvents = true`): `ChkLcdUse24Hr.IsChecked = s.LcdUse24Hr;`, `ChkLcdShowSeconds.IsChecked = s.LcdShowSeconds;`, `CmbLcdStyle.SelectedIndex` mapped from `s.LcdStyle` ("Dark"→0, "Paper"→1, "Silver"→2).
- **D-11:** `ChkLcdUse24Hr_Changed` fires `LcdUse24HrChanged?.Invoke(ChkLcdUse24Hr.IsChecked == true)` when `_suppressEvents` is false.
- **D-12:** `ChkLcdShowSeconds_Changed` fires `LcdShowSecondsChanged?.Invoke(ChkLcdShowSeconds.IsChecked == true)` when `_suppressEvents` is false.
- Both checkbox handlers use `Checked="X_Changed" Unchecked="X_Changed"` XAML pattern (same method for both events).
- This is SettingsWindow XAML + code-behind only. No new events, no new AppSettings fields, no MainWindow changes.

### Claude's Discretion

- Exact `Margin` values on the ComboBox (use same as `CmbPhraseStyle`: `Margin="0,8,0,0"`)
- Whether to add `VerticalAlignment="Center"` to the ComboBox (follow CmbPhraseStyle)
- Index-to-string mapping implementation detail for CmbLcdStyle SelectionChanged (may use `((ComboBoxItem)CmbLcdStyle.SelectedItem).Content.ToString()` or equivalent)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LCD-01 | User can select LCD clock style from Settings > Appearance Clock Style rail (BtnLcd added; four mutually exclusive buttons) | BtnLcd added to existing StackPanel in Clock Style row; SetClockStyleButtonStates extended with BtnLcd.Tag; BtnLcd_Click mirrors existing click pattern |
| LCD-02 | User can toggle between 12-hour and 24-hour in Settings when LCD is active; persists and restores on launch | ChkLcdUse24Hr_Changed fires LcdUse24HrChanged (already subscribed in MainWindow ~line 418); persists via SaveSettings() call already in subscription |
| LCD-03 | User can show or hide the seconds row in Settings when LCD is active; persists and restores on launch | ChkLcdShowSeconds_Changed fires LcdShowSecondsChanged (already subscribed ~line 424); PopulateControls reads s.LcdShowSeconds to restore on open |
| LCD-04 | User can select LCD segment style (Dark/Paper/Silver) in Settings when LCD is active; persists and restores on launch | CmbLcdStyle_SelectionChanged fires LcdStyleChanged (already subscribed ~line 430); PopulateControls reads s.LcdStyle to restore |
| LCD-05 | LCD settings panel visible only when LCD is active; collapsed for Phrase/Dial/Nixie | LcdOptionsLabel + LcdOptionsPanel visibility gated in SetClockStyleButtonStates, mirroring DialFaceLabel/DialFacePanel pattern |
</phase_requirements>

---

## Summary

Phase 63 is a pure SettingsWindow extension — no new infrastructure, no new events, no new data fields. All LCD rendering infrastructure (SevenSegmentDigit, LcdClockView, AppSettings LCD fields, SettingsSnapshot LCD fields, MainWindow event subscriptions for all three LCD events) is already complete from prior phases. The three events (`LcdUse24HrChanged`, `LcdShowSecondsChanged`, `LcdStyleChanged`) are already declared in SettingsWindow.xaml.cs at lines 27–29 as stubs generating CS0067 warnings; this phase wires them by invoking them from new handlers.

The work is exactly two files: `SettingsWindow.xaml` (add one `<Button>`, one `<RowDefinition>`, two elements in a new row) and `SettingsWindow.xaml.cs` (extend two methods by a handful of lines each, add four handler methods). Every pattern to replicate exists verbatim in the same files — `BtnNixie` for the button, `DialFaceLabel`/`DialFacePanel` for the options row, `ChkShowHourTicks_Changed` for the checkbox handlers, `CmbPhraseStyle_SelectionChanged` for the ComboBox handler.

**Primary recommendation:** Implement changes file-by-file, XAML first then code-behind, following each named template element exactly. No design decisions remain open.

---

## Standard Stack

### Core (verified by reading actual source files)

| Library / Technology | Version | Purpose | Status |
|----------------------|---------|---------|--------|
| WPF / .NET | In use | UI framework | Already in project |
| C# (code-behind) | In use | Event handlers, state helpers | Already in project |
| XAML | In use | Declarative UI layout | Already in project |

No new packages. No `npm install`. No NuGet packages. This phase adds no dependencies.

---

## Architecture Patterns

### Established SettingsWindow Architecture

The window is a modeless settings dialog. Its architecture:

1. **Populate-then-suppress:** Constructor sets `_suppressEvents = true`, calls `PopulateControls(snapshot)`, sets `_suppressEvents = false`. All handlers check `if (_suppressEvents) return;` at entry.
2. **Fire-and-forget events:** Each control fires a typed event immediately on change; MainWindow subscribes and reacts (updates live widget + saves). SettingsWindow never touches AppSettings directly.
3. **SetXxxButtonStates helpers:** Visibility and Tag assignment for segmented button rails is centralized in private helpers called from both click handlers and `PopulateControls`.
4. **Named label + named panel visibility pattern:** Options rows that are clock-style-specific have a `TextBlock` label (Column 0) and a `StackPanel` panel (Column 1), both named, both set to the same `Visibility` in `SetClockStyleButtonStates`.

### Recommended Structure for This Phase

**XAML changes (SettingsWindow.xaml):**

```
Appearance tab Grid
├── RowDefinitions (currently 6 entries, indices 0–5)
│   └── ADD: <RowDefinition Height="Auto"/>  ← new index 6
│
├── Row 2, Col 1 — Clock Style rail StackPanel
│   └── ADD: <Button x:Name="BtnLcd" Content="LCD"
│                     Style="{StaticResource SegmentButtonStyle}"
│                     Click="BtnLcd_Click"/>
│
└── ADD Row 6:
    ├── Col 0: <TextBlock x:Name="LcdOptionsLabel" Grid.Row="6" Grid.Column="0"
    │           Text="LCD" VerticalAlignment="Top" HorizontalAlignment="Right"
    │           Margin="0,8,10,0" Visibility="Collapsed"/>
    └── Col 1: <StackPanel x:Name="LcdOptionsPanel" Grid.Row="6" Grid.Column="1"
                Margin="0,8,0,0" Visibility="Collapsed">
                <CheckBox x:Name="ChkLcdUse24Hr" Content="24-hour mode"
                          Checked="ChkLcdUse24Hr_Changed"
                          Unchecked="ChkLcdUse24Hr_Changed"/>
                <CheckBox x:Name="ChkLcdShowSeconds" Content="Show seconds"
                          Checked="ChkLcdShowSeconds_Changed"
                          Unchecked="ChkLcdShowSeconds_Changed"/>
                <ComboBox x:Name="CmbLcdStyle" Width="120" HorizontalAlignment="Left"
                          Margin="0,8,0,0" VerticalAlignment="Center"
                          SelectionChanged="CmbLcdStyle_SelectionChanged">
                    <ComboBoxItem Content="Dark"/>
                    <ComboBoxItem Content="Paper"/>
                    <ComboBoxItem Content="Silver"/>
                </ComboBox>
               </StackPanel>
```

**Code-behind changes (SettingsWindow.xaml.cs):**

```
SetClockStyleButtonStates(ClockType ct):
  ADD: BtnLcd.Tag = ct == ClockType.Lcd ? "selected" : null;
  ADD: var lcdVis = ct == ClockType.Lcd ? Visibility.Visible : Visibility.Collapsed;
       LcdOptionsLabel.Visibility = lcdVis;
       LcdOptionsPanel.Visibility = lcdVis;

PopulateControls(SettingsSnapshot s):
  ADD (under existing _suppressEvents = true block):
    ChkLcdUse24Hr.IsChecked    = s.LcdUse24Hr;
    ChkLcdShowSeconds.IsChecked = s.LcdShowSeconds;
    CmbLcdStyle.SelectedIndex  = s.LcdStyle switch { "Paper" => 1, "Silver" => 2, _ => 0 };

ADD handler methods:
  BtnLcd_Click
  ChkLcdUse24Hr_Changed
  ChkLcdShowSeconds_Changed
  CmbLcdStyle_SelectionChanged
```

### Exact Template Elements (HIGH confidence — read from source)

| New Element | Template to Mirror | Template Location |
|-------------|-------------------|-------------------|
| BtnLcd | BtnNixie | SettingsWindow.xaml line 298 |
| LcdOptionsLabel | DialFaceLabel | SettingsWindow.xaml lines 334–336 |
| LcdOptionsPanel | DialFacePanel | SettingsWindow.xaml lines 337–346 |
| ChkLcdUse24Hr_Changed | ChkShowHourTicks_Changed | SettingsWindow.xaml.cs lines 587–591 |
| ChkLcdShowSeconds_Changed | ChkShowHourTicks_Changed | SettingsWindow.xaml.cs lines 587–591 |
| CmbLcdStyle_SelectionChanged | CmbPhraseStyle_SelectionChanged | SettingsWindow.xaml.cs lines 421–426 |
| BtnLcd_Click | BtnNixie_Click | SettingsWindow.xaml.cs lines 413–418 |
| SetClockStyleButtonStates extension | DialFaceLabel/Panel block | SettingsWindow.xaml.cs lines 215–218 |
| PopulateControls extension | ChkShowHourTicks block | SettingsWindow.xaml.cs lines 163–166 |

### Anti-Patterns to Avoid

- **Do not set `Visibility` in XAML as a static attribute on elements that are dynamically shown/hidden via code-behind.** Instead set the initial visibility via `SetClockStyleButtonStates` call in `PopulateControls` (which is called from the constructor). The `SetClockStyleButtonStates` call at line 85 in the constructor already handles initial state correctly once extended.
- **Do not add `Grid.Row` or `Grid.Column` attributes before the corresponding `RowDefinition` is added.** WPF does not error but silently places the element at row 0, which is very hard to debug.
- **Do not invoke LCD events outside the `if (_suppressEvents) return;` guard.** Doing so during `PopulateControls` would fire live events into MainWindow and trigger redundant saves/renders.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Index-to-string mapping for ComboBox | Custom dictionary or if-chain | C# switch expression | Already used in same file for CmbPhraseStyle, CmbStatsInterval, CmbDateFormat; consistent and compiler-verified |
| Visibility toggling | Property binding to a ViewModel bool | Direct `Visibility` property assignment in `SetClockStyleButtonStates` | The entire window is imperative code-behind; MVVM binding would be inconsistent with the established pattern and add overhead with no benefit |
| CheckBox state change | Separate Checked/Unchecked handlers | Single handler wired to both events | Already the pattern for `ChkPhraseWrap_Changed`, `ChkShowHourTicks_Changed` etc. |

**Key insight:** This codebase is deliberately imperative code-behind, not MVVM. Every existing handler follows the populate-suppress-fire pattern. Adding MVVM infrastructure for three controls would be an anti-pattern here.

---

## Runtime State Inventory

Not applicable — this is a greenfield UI addition (no rename, refactor, or migration). No stored data, service config, OS-registered state, secrets, or build artifacts reference "LCD options panel" as a runtime entity. The AppSettings LCD fields already exist with correct defaults; no data migration is needed.

---

## Common Pitfalls

### Pitfall 1: Default Visibility — Collapsed vs Visible

**What goes wrong:** New XAML elements have `Visibility="Visible"` by default. If you forget to collapse `LcdOptionsLabel` and `LcdOptionsPanel` at startup, they will show for all clock styles until the user clicks a style button.

**Why it happens:** The initial state is set by the `SetClockStyleButtonStates(s.ClockType)` call inside `PopulateControls` (SettingsWindow.xaml.cs line 85). As long as `SetClockStyleButtonStates` is correctly extended (D-03, D-09), the call already present will handle this. No additional initialization code is needed.

**How to avoid:** Do NOT add `Visibility="Collapsed"` as a static XAML attribute (the UI-SPEC shows it for documentation but the code path via `SetClockStyleButtonStates` is the correct mechanism). The code-behind extension of `SetClockStyleButtonStates` is what enforces the correct initial state.

**Warning signs:** If both `LcdOptionsLabel` and `LcdOptionsPanel` are visible when opening Settings while Phrase clock is active.

### Pitfall 2: Grid Row Offset — Placing Elements in Wrong Row

**What goes wrong:** The Appearance tab grid has rows 0–5 before this phase. After adding `<RowDefinition Height="Auto"/>` as the seventh entry (index 6), any `Grid.Row="6"` attribute is correct. If the RowDefinition is accidentally placed before an existing row, all subsequent rows shift.

**Why it happens:** XML order of `<RowDefinition>` entries directly maps to row indices. Inserting a row in the middle (instead of appending) renumbers existing rows.

**How to avoid:** Append the new `<RowDefinition Height="Auto"/>` as the last entry in the `<Grid.RowDefinitions>` block (after the existing sixth `<RowDefinition Height="Auto"/>`). Verify that `DialFaceLabel` and `DialFacePanel` carry `Grid.Row="5"` after the addition.

**Warning signs:** DialFace controls appear in wrong position visually.

### Pitfall 3: Missing Grid.Row / Grid.Column on New Elements

**What goes wrong:** If `Grid.Row="6"` or `Grid.Column="0"/"1"` are omitted from the new TextBlock or StackPanel, WPF places them at row 0, column 0 — overlapping Opacity row content.

**Why it happens:** WPF Grid defaults are row=0, column=0 for any unspecified attached property.

**How to avoid:** Verify both attached properties are set on both `LcdOptionsLabel` and `LcdOptionsPanel` before testing.

### Pitfall 4: CS0067 Warnings Disappear Only When All Three Events Are Invoked

**What goes wrong:** After adding the LCD button (which invokes `ClockTypeChanged`) but before adding all three handlers, two of the three `Lcd*Changed` events still generate CS0067 warnings.

**Why it happens:** CS0067 fires for any event that is declared but never raised. All three stubs exist but none are currently invoked; each handler added in this phase resolves one warning.

**How to avoid:** All four handlers should be added in a single pass. The plan should not split them across multiple commits/tasks unless it verifies the build at each step.

### Pitfall 5: `CmbLcdStyle_SelectionChanged` Firing During PopulateControls

**What goes wrong:** Setting `CmbLcdStyle.SelectedIndex` in `PopulateControls` triggers the `SelectionChanged` event before `_suppressEvents` is set to false — but only if the event handler is registered and `_suppressEvents` is still `false` at that point.

**Why it happens:** In this codebase, `PopulateControls` is always called inside a `_suppressEvents = true` block (lines 59–71 in the constructor, and in `RefreshControls`). The guard `if (_suppressEvents) return;` at the top of `CmbLcdStyle_SelectionChanged` will block the spurious call. This is correct behavior — no extra action needed.

**How to avoid:** Ensure the `_suppressEvents` guard is the first line of `CmbLcdStyle_SelectionChanged`. This matches every other handler in the file.

---

## Code Examples

Verified patterns extracted directly from the source files.

### BtnLcd_Click (mirrors BtnNixie_Click exactly)

```csharp
// Source: SettingsWindow.xaml.cs lines 413–418
private void BtnLcd_Click(object sender, RoutedEventArgs e)
{
    if (_suppressEvents) return;
    SetClockStyleButtonStates(ClockType.Lcd);
    ClockTypeChanged?.Invoke(ClockType.Lcd);
}
```

### ChkLcdUse24Hr_Changed (mirrors ChkShowHourTicks_Changed exactly)

```csharp
// Source: SettingsWindow.xaml.cs lines 587–591 (pattern)
private void ChkLcdUse24Hr_Changed(object sender, RoutedEventArgs e)
{
    if (_suppressEvents) return;
    LcdUse24HrChanged?.Invoke(ChkLcdUse24Hr.IsChecked == true);
}
```

### ChkLcdShowSeconds_Changed

```csharp
private void ChkLcdShowSeconds_Changed(object sender, RoutedEventArgs e)
{
    if (_suppressEvents) return;
    LcdShowSecondsChanged?.Invoke(ChkLcdShowSeconds.IsChecked == true);
}
```

### CmbLcdStyle_SelectionChanged (mirrors CmbPhraseStyle_SelectionChanged)

```csharp
// Source: SettingsWindow.xaml.cs lines 421–426 (pattern)
private void CmbLcdStyle_SelectionChanged(object sender, SelectionChangedEventArgs e)
{
    if (_suppressEvents) return;
    if (CmbLcdStyle.SelectedItem is ComboBoxItem item)
        LcdStyleChanged?.Invoke((string)item.Content);
}
```

### SetClockStyleButtonStates extension (add alongside existing Dial block)

```csharp
// Source: SettingsWindow.xaml.cs lines 209–219 (extend this method)
private void SetClockStyleButtonStates(ClockType ct)
{
    BtnPhrase.Tag = ct == ClockType.Phrase ? "selected" : null;
    BtnDial.Tag   = ct == ClockType.Dial   ? "selected" : null;
    BtnNixie.Tag  = ct == ClockType.Nixie  ? "selected" : null;
    BtnLcd.Tag    = ct == ClockType.Lcd    ? "selected" : null;  // ADD

    var dialVis = ct == ClockType.Dial ? Visibility.Visible : Visibility.Collapsed;
    DialFaceLabel.Visibility = dialVis;
    DialFacePanel.Visibility = dialVis;

    // ADD:
    var lcdVis = ct == ClockType.Lcd ? Visibility.Visible : Visibility.Collapsed;
    LcdOptionsLabel.Visibility = lcdVis;
    LcdOptionsPanel.Visibility = lcdVis;
}
```

### PopulateControls extension (add under the Dial face block at lines 163–166)

```csharp
// ADD after dial face checkboxes block:
ChkLcdUse24Hr.IsChecked     = s.LcdUse24Hr;
ChkLcdShowSeconds.IsChecked = s.LcdShowSeconds;
CmbLcdStyle.SelectedIndex   = s.LcdStyle switch { "Paper" => 1, "Silver" => 2, _ => 0 };
```

### BtnLcd XAML (insert after BtnNixie in the Clock Style StackPanel)

```xml
<!-- Source: SettingsWindow.xaml line 298 — BtnNixie is the template -->
<Button x:Name="BtnLcd" Content="LCD"
        Style="{StaticResource SegmentButtonStyle}"
        Click="BtnLcd_Click"/>
```

### LcdOptionsLabel XAML (mirrors DialFaceLabel at lines 334–336)

```xml
<TextBlock x:Name="LcdOptionsLabel"
           Grid.Row="6" Grid.Column="0"
           Text="LCD"
           VerticalAlignment="Top"
           HorizontalAlignment="Right"
           Margin="0,8,10,0"/>
```

### LcdOptionsPanel XAML (mirrors DialFacePanel at lines 337–346)

```xml
<StackPanel x:Name="LcdOptionsPanel"
            Grid.Row="6" Grid.Column="1"
            Margin="0,8,0,0">
    <CheckBox x:Name="ChkLcdUse24Hr" Content="24-hour mode"
              Checked="ChkLcdUse24Hr_Changed"
              Unchecked="ChkLcdUse24Hr_Changed"/>
    <CheckBox x:Name="ChkLcdShowSeconds" Content="Show seconds"
              Checked="ChkLcdShowSeconds_Changed"
              Unchecked="ChkLcdShowSeconds_Changed"/>
    <ComboBox x:Name="CmbLcdStyle"
              Width="120" HorizontalAlignment="Left"
              Margin="0,8,0,0" VerticalAlignment="Center"
              SelectionChanged="CmbLcdStyle_SelectionChanged">
        <ComboBoxItem Content="Dark"/>
        <ComboBoxItem Content="Paper"/>
        <ComboBoxItem Content="Silver"/>
    </ComboBox>
</StackPanel>
```

---

## State of the Art

| Item | Current State | Impact |
|------|--------------|--------|
| LCD event stubs (LcdUse24HrChanged, LcdShowSecondsChanged, LcdStyleChanged) | Declared at lines 27–29 in SettingsWindow.xaml.cs, never invoked — CS0067 warnings | This phase resolves all three warnings by adding invoking handlers |
| MainWindow subscriptions (~lines 418–435) | Already registered, waiting for events | No action needed — subscriptions are complete and correct |
| AppSettings LCD fields | LcdUse24Hr (bool, false), LcdShowSeconds (bool, true), LcdStyle (string, "Dark") — all exist | No new fields needed |
| SettingsSnapshot LCD fields | Same three fields, same defaults | PopulateControls already has access; just needs three new assignments |
| ClockType.Lcd | Already defined in ClockType enum | BtnLcd_Click can use it directly |

---

## Environment Availability

Step 2.6: SKIPPED — this phase is code/config changes only within an existing WPF project. No external CLI tools, services, databases, or runtimes beyond the project's existing .NET build chain are required.

---

## Open Questions

None. All decisions are locked in CONTEXT.md and verified against source files. The implementation is fully specified with zero ambiguity.

---

## Project Constraints (from CLAUDE.md)

| Directive | Scope |
|-----------|-------|
| Do not add `Co-Authored-By` trailers to commit messages | All git commits in this project |

---

## Sources

### Primary (HIGH confidence)

All findings are based on direct source file reads — no external research required for this phase.

- `FuzzyClock.App/SettingsWindow.xaml` — full file read; Clock Style rail (lines 288–300), DialFaceLabel/Panel (lines 334–346), Grid structure (lines 244–256), CmbPhraseStyle (lines 306–315)
- `FuzzyClock.App/SettingsWindow.xaml.cs` — full file read; SetClockStyleButtonStates (lines 209–219), PopulateControls (lines 77–198), all handler patterns
- `FuzzyClock.App/AppSettings.cs` — verified LcdUse24Hr (bool, false), LcdShowSeconds (bool, true), LcdStyle (string, "Dark") exist at lines 28–30
- `FuzzyClock.App/SettingsSnapshot.cs` — verified same three fields at lines 14–16
- `FuzzyClock.App/MainWindow.xaml.cs` lines 418–435 — verified all three LCD event subscriptions are already wired
- `.planning/phases/63-settingswindow-lcd-ui/63-CONTEXT.md` — all implementation decisions
- `.planning/phases/63-settingswindow-lcd-ui/63-UI-SPEC.md` — component inventory, spacing, interaction contract

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — pure WPF, no new dependencies, verified from source
- Architecture patterns: HIGH — all patterns extracted from existing code in the same files
- Pitfalls: HIGH — derived from direct inspection of the initialization flow and WPF Grid behavior
- Integration points: HIGH — all three events already declared and subscribed; verified from source

**Research date:** 2026-03-24
**Valid until:** 2026-09-24 (stable — WPF patterns, no third-party library churn)
