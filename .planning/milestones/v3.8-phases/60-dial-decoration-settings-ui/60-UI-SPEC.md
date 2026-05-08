---
phase: 60
phase_name: Dial Decoration Settings UI
status: draft
created: 2026-03-23
tool: none
---

# UI-SPEC: Phase 60 — Dial Decoration Settings UI

## Purpose

Define the visual and interaction contract for adding three dial decoration checkboxes
("Hour Ticks", "Minute Dots", "Hour Numbers") to Settings > Appearance. These controls
are visible only when the Dial clock style is active and must match the established
Appearance tab layout precisely.

---

## Design System

**Tool:** None (WPF XAML with inline styles — no shadcn, no shadcn registry)
**Theme:** ThemeMode="Dark" (SettingsWindow only — never applied to MainWindow)
**Source:** Existing `SettingsWindow.xaml` patterns are the design authority

---

## Spacing

The Appearance tab uses a 4px grid. All new elements must conform.

| Context | Value | Source |
|---------|-------|--------|
| Row top margin (label and controls) | `Margin="0,8,10,0"` (label) / `Margin="0,8,0,0"` (controls) | Existing rows 1-4 |
| Checkbox vertical gap within a stacked group | `Margin="0,0,0,6"` (between items) | `WrapStylePanel` pattern |
| Inter-checkbox vertical gap in the Dial Face group | `0` top/bottom on first; none — StackPanel default 0 spacing | Phrase Wrap row |
| Label column width | 90px (fixed `ColumnDefinition Width="90"`) | Grid definition |
| Controls column | `Width="*"` | Grid definition |

**4px grid rule:** All margin values are multiples of 4. No exceptions for this phase.

---

## Typography

Inherited from the SettingsWindow Dark theme. No new type styles are introduced.

| Element | Size | Weight | Color |
|---------|------|--------|-------|
| Row label ("Dial Face") | Inherited (~13px system default) | Regular (400) | System dark-theme foreground |
| Checkbox content labels | Inherited (~13px system default) | Regular (400) | System dark-theme foreground |
| Section headers (SemiBold, e.g. "Backdrop") | Inherited | SemiBold (600) | System dark-theme foreground |

The "Dial Face" row label does NOT use `FontWeight="SemiBold"`. It is a row label, not
a section header — consistent with "Phrase Style", "Phrase Wrap", "Clock Style", etc.

---

## Color

| Role | Value | Reserved For |
|------|-------|-------------|
| Window background (60%) | System Dark (#FF1E1E1E approx) | ThemeMode="Dark" auto-applied |
| Controls surface (30%) | `#FF3A3A3A` | Segmented rail backgrounds |
| Accent (10%) | `#FF0078D4` (Windows blue) | Active swatch ring, selected button pill border |
| Checkbox tick | System dark-theme default | CheckBox.IsChecked = true |

No new colors are introduced. The three checkboxes use WPF default dark-theme
CheckBox rendering — same as `ChkPhraseWrap`, `ChkBackdropAlwaysVisible`, etc.

---

## Layout Contract

### Grid Placement

The Dial Face row is added as **Row 5** in the existing 2-column Appearance tab Grid
(which currently declares 5 `RowDefinition Height="Auto"` entries for rows 0-4).

The Grid `RowDefinitions` must be extended from 5 rows to 6 rows to accommodate Row 5.

```
Row 0  — Opacity
Row 1  — Font Size
Row 2  — Clock Style
Row 3  — Phrase Style
Row 4  — Phrase Wrap
Row 5  — Dial Face       ← NEW
```

### Column Assignment

- **Column 0:** `TextBlock` with `Text="Dial Face"` — right-aligned label, same style as all other row labels
- **Column 1:** `StackPanel` (vertical) containing three `CheckBox` elements

### Label element

```
<TextBlock Grid.Row="5" Grid.Column="0"
           Text="Dial Face" VerticalAlignment="Top"
           HorizontalAlignment="Right" Margin="0,8,10,0"/>
```

`VerticalAlignment="Top"` because the column 1 content is a multi-line StackPanel —
same as the "Phrase Wrap" label which also uses `VerticalAlignment="Top"`.

### Controls element (StackPanel)

```
<StackPanel x:Name="DialFacePanel"
            Grid.Row="5" Grid.Column="1"
            Margin="0,8,0,0">
    <CheckBox x:Name="ChkShowHourTicks"   Content="Hour Ticks"    ... />
    <CheckBox x:Name="ChkShowMinuteDots"  Content="Minute Dots"   ... />
    <CheckBox x:Name="ChkShowHourNumbers" Content="Hour Numbers"  ... />
</StackPanel>
```

The `DialFacePanel` name covers both the TextBlock label and the StackPanel for
visibility gating — visibility is toggled on both elements independently using the same
`Visibility.Visible` / `Visibility.Collapsed` mechanism that the `WrapStylePanel` uses.

**Checkbox vertical spacing:** Default StackPanel spacing (0). No explicit Margin needed
on each CheckBox — the three items are visually cohesive as a group at default WPF
dark-theme CheckBox height (~20px each).

---

## Visibility Gating

The Dial Face row (label TextBlock + DialFacePanel StackPanel) is:

- `Visibility.Visible` when `ClockType == ClockType.Dial`
- `Visibility.Collapsed` when `ClockType == ClockType.Phrase` or `ClockType.Nixie`

This is implemented in `SetClockStyleButtonStates(ClockType ct)` in code-behind, which
is already called at open-time (`PopulateControls` calls it) and on every Clock Style
button click. No XAML data binding is used — code-behind assignment mirrors the existing
Phrase Style / Phrase Wrap pattern.

**Named elements that need Visibility set:**
- `DialFaceLabel` — the `TextBlock` for "Dial Face" (needs an `x:Name` in XAML)
- `DialFacePanel` — the `StackPanel` containing the three checkboxes

---

## Interaction Contract

### Checkbox state at open

`PopulateControls(SettingsSnapshot s)` sets all three checkboxes from the snapshot:

```csharp
ChkShowHourTicks.IsChecked   = s.ShowHourTicks;
ChkShowMinuteDots.IsChecked  = s.ShowMinuteDots;
ChkShowHourNumbers.IsChecked = s.ShowHourNumbers;
```

This assignment occurs while `_suppressEvents = true`, so no events fire during population.

### Checkbox event handlers

Each checkbox has `Checked` and `Unchecked` pointing to the same handler method.
Pattern identical to `ChkPhraseWrap_Changed`:

```csharp
private void ChkShowHourTicks_Changed(object sender, RoutedEventArgs e)
{
    if (_suppressEvents) return;
    ShowHourTicksChanged?.Invoke(ChkShowHourTicks.IsChecked == true);
}

private void ChkShowMinuteDots_Changed(object sender, RoutedEventArgs e)
{
    if (_suppressEvents) return;
    ShowMinuteDotsChanged?.Invoke(ChkShowMinuteDots.IsChecked == true);
}

private void ChkShowHourNumbers_Changed(object sender, RoutedEventArgs e)
{
    if (_suppressEvents) return;
    ShowHourNumbersChanged?.Invoke(ChkShowHourNumbers.IsChecked == true);
}
```

### Live-apply behavior

MainWindow already subscribes to `ShowHourTicksChanged`, `ShowMinuteDotsChanged`, and
`ShowHourNumbersChanged` (backend complete from prior phase). Toggling any checkbox
immediately updates the live widget — no Settings window close required.

### No confirmation dialogs

None of the three toggles are destructive. No confirmation prompt is required.

---

## Copywriting

| Element | Text |
|---------|------|
| Row label | `Dial Face` |
| Checkbox 1 | `Hour Ticks` |
| Checkbox 2 | `Minute Dots` |
| Checkbox 3 | `Hour Numbers` |

No description text, no helper text, no empty state, no error state. The checkboxes
are self-explanatory in context and match the visual concepts visible on the dial clock face.

---

## States and Transitions

| State | Visual |
|-------|--------|
| Dial style active, decoration enabled | Checkbox checked; dial widget shows the decoration live |
| Dial style active, decoration disabled | Checkbox unchecked; dial widget hides the decoration live |
| Phrase or Nixie style active | Entire Dial Face row (label + StackPanel) collapsed; zero height, no layout space consumed |
| Switching to Dial from another style | Dial Face row becomes visible; checkboxes show persisted state |
| Switching away from Dial | Dial Face row collapses immediately |

---

## Element Naming Convention

Follow existing naming conventions in `SettingsWindow.xaml` and `.xaml.cs`:

| XAML element | x:Name |
|---|---|
| Row label TextBlock | `DialFaceLabel` |
| Controls StackPanel | `DialFacePanel` |
| Hour Ticks CheckBox | `ChkShowHourTicks` |
| Minute Dots CheckBox | `ChkShowMinuteDots` |
| Hour Numbers CheckBox | `ChkShowHourNumbers` |

Handler method names:

| Handler | Fires event |
|---|---|
| `ChkShowHourTicks_Changed` | `ShowHourTicksChanged` |
| `ChkShowMinuteDots_Changed` | `ShowMinuteDotsChanged` |
| `ChkShowHourNumbers_Changed` | `ShowHourNumbersChanged` |

---

## Accessibility

- All three CheckBoxes use WPF's built-in CheckBox accessibility tree — no extra AutomationProperties needed
- Labels are set via `Content` property, which is the accessible name
- Focus navigation follows natural tab order within the StackPanel
- No keyboard shortcuts are needed; standard Space to toggle applies

---

## Out of Scope

Per REQUIREMENTS.md and CONTEXT.md deferred/out-of-scope sections:

- LCD settings controls (`LcdUse24Hr`, `LcdShowSeconds`, `LcdStyle`) — deferred to future milestone
- Right-click context menu entries for dial decorations — removed in v3.2, not restored
- Any new decoration types beyond the three specified

---

## Registry

Not applicable. This project uses WPF XAML, not shadcn/React. No third-party component
registries are involved.

---

## Pre-Population Sources

| Source | Decisions Used |
|--------|---------------|
| CONTEXT.md (D-01 through D-05) | 5 decisions: placement, label text, checkbox layout, visibility gating, handler pattern |
| REQUIREMENTS.md (DIAL-10, DIAL-11) | 2 requirements: visibility conditions, persist + live-apply behavior |
| SettingsWindow.xaml (existing XAML) | Grid structure, margin values, naming conventions, column widths |
| SettingsWindow.xaml.cs (existing code) | `_suppressEvents` pattern, `SetClockStyleButtonStates`, `PopulateControls` structure |
| STATE.md | 4px grid spacing, 480x600 window, Appearance tab grid constraints |

No questions were put to the user — all design contract fields were resolved from upstream
artifacts and existing codebase patterns.

---

*Phase: 60-dial-decoration-settings-ui*
*UI-SPEC created: 2026-03-23*
