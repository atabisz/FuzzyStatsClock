# Phase 63: SettingsWindow LCD UI - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Add `BtnLcd` to the Clock Style rail in Settings > Appearance; add an LCD options panel (Row 6 in the Appearance grid, visible only when LCD is active) containing a 24-hour mode checkbox, a show-seconds checkbox, and a segment style ComboBox; wire each control to its existing event stub; populate from `SettingsSnapshot` in `PopulateControls`; gate visibility in `SetClockStyleButtonStates`.

This is SettingsWindow XAML + code-behind only. No new events, no new AppSettings fields, no MainWindow changes — all infrastructure already exists.

</domain>

<decisions>
## Implementation Decisions

### BtnLcd — Clock Style button
- **D-01:** Add `BtnLcd` with `Content="LCD"` to the Clock Style rail alongside `BtnPhrase`, `BtnDial`, `BtnNixie`. Same `SegmentButtonStyle`, same `Background="#FF3A3A3A"` Border container, same horizontal `StackPanel`.
- **D-02:** `BtnLcd_Click` handler fires `ClockTypeChanged?.Invoke(ClockType.Lcd)` and calls `SetClockStyleButtonStates(ClockType.Lcd)` — mirrors `BtnPhrase_Click`, `BtnDial_Click`, `BtnNixie_Click` exactly.
- **D-03:** `SetClockStyleButtonStates` adds `BtnLcd.Tag = ct == ClockType.Lcd ? "selected" : null;` alongside the existing three button tag assignments.

### LCD Options Panel — layout
- **D-04:** Add Row 6 to the Appearance tab Grid's `RowDefinitions`. The Grid currently has 6 rows (0–5); Row 6 is the LCD options row.
- **D-05:** Row label in Column 0: `TextBlock x:Name="LcdOptionsLabel"` with `Text="LCD"`, styled identically to `DialFaceLabel` (VerticalAlignment="Top", HorizontalAlignment="Right", Margin="0,8,10,0").
- **D-06:** Column 1: `StackPanel x:Name="LcdOptionsPanel"` (Margin="0,8,0,0") containing, vertically:
  1. `CheckBox x:Name="ChkLcdUse24Hr"` with `Content="24-hour mode"`
  2. `CheckBox x:Name="ChkLcdShowSeconds"` with `Content="Show seconds"`
  3. `ComboBox x:Name="CmbLcdStyle"` with items: `Dark`, `Paper`, `Silver` (same Width="120", HorizontalAlignment="Left" as CmbPhraseStyle)

### Segment style selector
- **D-07:** `CmbLcdStyle` ComboBox with three `ComboBoxItem` entries: `Content="Dark"`, `Content="Paper"`, `Content="Silver"`. Mirrors `CmbPhraseStyle` pattern (same style, same width).
- **D-08:** `CmbLcdStyle_SelectionChanged` handler (under `_suppressEvents` guard) fires `LcdStyleChanged?.Invoke(selectedContent)` where `selectedContent` is the `Content` string of the selected `ComboBoxItem`.

### Visibility gating
- **D-09:** In `SetClockStyleButtonStates`, set visibility of both `LcdOptionsLabel` and `LcdOptionsPanel` — `Visibility.Visible` when `ct == ClockType.Lcd`, `Visibility.Collapsed` otherwise. Mirrors how `DialFaceLabel`/`DialFacePanel` are gated.

### PopulateControls
- **D-10:** Add to `PopulateControls` (under `_suppressEvents = true`):
  - `ChkLcdUse24Hr.IsChecked = s.LcdUse24Hr;`
  - `ChkLcdShowSeconds.IsChecked = s.LcdShowSeconds;`
  - Set `CmbLcdStyle.SelectedIndex` to match `s.LcdStyle` string ("Dark"→0, "Paper"→1, "Silver"→2).

### Checkbox event handlers
- **D-11:** `ChkLcdUse24Hr_Changed` fires `LcdUse24HrChanged?.Invoke(ChkLcdUse24Hr.IsChecked == true)` when `_suppressEvents` is false.
- **D-12:** `ChkLcdShowSeconds_Changed` fires `LcdShowSecondsChanged?.Invoke(ChkLcdShowSeconds.IsChecked == true)` when `_suppressEvents` is false.
- Both handlers follow `Checked="X_Changed" Unchecked="X_Changed"` XAML pattern (same method for both events).

### Claude's Discretion
- Exact `Margin` values on the ComboBox (use same as `CmbPhraseStyle`: `Margin="0,8,0,0"`)
- Whether to add `VerticalAlignment="Center"` to the ComboBox (follow CmbPhraseStyle)
- Index-to-string mapping implementation detail for CmbLcdStyle SelectionChanged (may use `((ComboBoxItem)CmbLcdStyle.SelectedItem).Content.ToString()` or equivalent)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §LCD Clock UI — LCD-01, LCD-02, LCD-03, LCD-04, LCD-05 definitions and acceptance criteria

### SettingsWindow — primary files to modify
- `FuzzyClock.App/SettingsWindow.xaml` — Appearance tab grid structure (rows 0–5, 2-column layout); Clock Style rail (BtnPhrase/BtnDial/BtnNixie); DialFacePanel pattern to replicate for LCD options
- `FuzzyClock.App/SettingsWindow.xaml.cs` — `PopulateControls`, `SetClockStyleButtonStates`, event declarations (LcdUse24HrChanged, LcdShowSecondsChanged, LcdStyleChanged stubs at lines 27–29), `_suppressEvents` guard pattern

### AppSettings / SettingsSnapshot
- `FuzzyClock.App/AppSettings.cs` — LcdUse24Hr (bool, default false), LcdShowSeconds (bool, default true), LcdStyle (string, default "Dark")
- `FuzzyClock.App/SettingsSnapshot.cs` — same three LCD fields

### MainWindow wiring (READ ONLY — do not modify)
- `FuzzyClock.App/MainWindow.xaml.cs` §LcdUse24HrChanged/LcdShowSecondsChanged/LcdStyleChanged subscriptions (~lines 418–435) — shows what events are expected and how they are consumed

### Prior phase context
- `.planning/phases/60-dial-decoration-settings-ui/60-CONTEXT.md` — DialFacePanel and SetClockStyleButtonStates patterns this phase replicates

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SetClockStyleButtonStates(ClockType ct)` — extend with `BtnLcd.Tag` assignment and `LcdOptionsLabel`/`LcdOptionsPanel` visibility toggle
- `PopulateControls(SettingsSnapshot s)` — extend with 3 LCD field assignments under `_suppressEvents = true`
- `CmbPhraseStyle` ComboBox — template for `CmbLcdStyle` (same style, same width, same SelectionChanged pattern)
- `DialFaceLabel`/`DialFacePanel` elements — exact template for `LcdOptionsLabel`/`LcdOptionsPanel` naming and visibility pattern
- `ChkShowHourTicks_Changed` handler — template for `ChkLcdUse24Hr_Changed` and `ChkLcdShowSeconds_Changed` (checked+unchecked → same handler, `_suppressEvents` guard, event invoke)

### Established Patterns
- Appearance tab grid: 2 columns (Col 0 width=90 right-aligned labels, Col 1 left-aligned controls), `Margin="0,8,0,0"` per row
- Clock Style rail: `Border Background="#FF3A3A3A" CornerRadius="4" Padding="2"` wrapping a horizontal `StackPanel` of `SegmentButtonStyle` buttons
- Visibility gating: named label + named panel, both set to same `Visibility` value in `SetClockStyleButtonStates`

### Integration Points
- `SettingsWindow.xaml` — add 1 button to Clock Style rail StackPanel, add 1 RowDefinition, add Row 6 label + panel
- `SettingsWindow.xaml.cs` — extend `SetClockStyleButtonStates` (2 lines) + `PopulateControls` (3 lines) + add `BtnLcd_Click` + 3 handlers (`ChkLcdUse24Hr_Changed`, `ChkLcdShowSeconds_Changed`, `CmbLcdStyle_SelectionChanged`)
- No changes to MainWindow, AppSettings, SettingsSnapshot, or test files

</code_context>

<specifics>
## Specific Ideas

- The CS0067 "event declared but never used" warnings for `LcdUse24HrChanged`, `LcdShowSecondsChanged`, `LcdStyleChanged` will resolve once the handlers in this phase invoke them.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 63-settingswindow-lcd-ui*
*Context gathered: 2026-03-24*
