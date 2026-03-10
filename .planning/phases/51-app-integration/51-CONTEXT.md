# Phase 51: App Integration - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire the LCD clock into the running application. Add AppSettings LCD fields, implement MainWindow 3-way clock switching with SetClockType(), extend SettingsWindow with LCD button and LCD options panel, add Tray "Clock Type" submenu, and update ResetToDefaults. The LcdClockView and SevenSegmentDigit controls are already built (Phase 50) — this phase wires them in.

</domain>

<decisions>
## Implementation Decisions

### AppSettings LCD fields
- `LcdTheme` (LcdTheme enum, default Green) — persisted with JsonStringEnumConverter
- `LcdUse24Hr` (bool, default false — 12hr)
- `LcdShowSeconds` (bool, default true)
- No separate `LcdSize` field — LCD size is driven by the existing `FontSize` field
- `SegmentHeight = FontSize * 2`: 16pt→32px, 24pt→48px, 32pt→64px, 40pt→80px
- ResetToDefaults restores ClockType to Phrase, LcdTheme to Green, LcdUse24Hr to false, LcdShowSeconds to true

### Settings window LCD panel
- Font Size row stays visible in LCD mode — S/M/L/XL buttons control LCD segment size via SegmentHeight = FontSize * 2
- Phrase Style combo stays visible in LCD mode but is disabled (same pattern as non-English language disabling it)
- LCD options appear as additional rows in the existing 2-column grid (Appearance tab), visible only when ClockType = Lcd:
  - "LCD Theme" row: ComboBox (Green / Amber / Blue / Teal / Red)
  - "Format" row: [12hr] [24hr] segmented toggle buttons
  - "Seconds" row: CheckBox "Show seconds"
- No separate Size row — Font Size drives segment height
- LCD rows use Visibility.Collapsed when not in LCD mode (instant, no animation)
- BtnLcd added to Clock Style segmented button rail alongside Phrase and Dial

### Tray menu Clock Type submenu
- "Clock Type ▶" submenu positioned immediately after "Open Settings..." and its separator — before Ghost Mode
- Three checkable items: Phrase / Dial / LCD; active type has checkmark
- Clicking an inactive type calls SetClockType() via Dispatcher.Invoke (WinForms thread → WPF thread)

### MainWindow integration
- SetClockType(ClockType) method: collapses/shows PhraseArea, DialCanvas, LcdArea
- LcdClockView placed in LcdArea; on switch to LCD, call UpdateTime() for immediate display
- 10s main timer skips phrase/dial update when ClockType = Lcd (LCD has its own 1s DispatcherTimer)
- LcdClockView properties bound/set on switch: Theme, Use24Hr, ShowSeconds; SegmentHeight = FontSize * 2

### Claude's Discretion
- Exact XAML row structure for LCD options panel (Grid vs StackPanel, row indices)
- TrayMenuState and TrayMenuCallbacks additions for clock type switching
- SettingsSnapshot additions for LCD state (LcdTheme, LcdUse24Hr, LcdShowSeconds)

</decisions>

<specifics>
## Specific Ideas

- Font Size intentionally drives LCD size — single unified size control for all clock modes
- The LcdSize enum from the Requirements/Phase 50 context is NOT stored in AppSettings; SegmentHeight is computed at render time from FontSize

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `LcdClockView` UserControl in `FuzzyClock.App/Controls/` — already built (Phase 50); dependency properties: Use24Hr, ShowSeconds, Theme (LcdTheme), Size (LcdSize); UpdateTime() public method
- `ClockType` enum (Phrase/Dial/Lcd) — already in `FuzzyClock.App/ClockType.cs`
- `SettingsWindow.SetClockStyleButtonStates(ClockType)` — stub already present with comment "BtnLcd added in Phase 51"
- `SettingsWindow.ClockTypeChanged` event (Action<ClockType>) — already wired to MainWindow
- `TrayMenuState.ClockType` field — already present in TrayMenuBuilder but no submenu exists yet
- `SegmentButtonStyle` — existing XAML style used for Phrase/Dial/Font Size toggles; BtnLcd reuses it

### Established Patterns
- WinForms tray callbacks use `Dispatcher.Invoke` to marshal onto WPF thread — required for SetClockType()
- `_suppressEvents = true` guard in SettingsWindow prevents event loops during PopulateControls()
- `Visibility.Collapsed` (not Hidden) for panel show/hide — consistent with existing stats panel and seconds slot patterns
- AppSettings fields added to `SettingsSnapshot` record; snapshot passed to SettingsWindow at open time
- Two-column Grid in Appearance tab for label/control rows — add LCD rows to existing Grid by adding RowDefinitions

### Integration Points
- `MainWindow.ApplySettings()` is where LcdTheme/LcdUse24Hr/LcdShowSeconds get applied to LcdClockView
- `MainWindow.ResetToDefaults()` must set ClockType=Phrase and restore LCD defaults
- `TrayMenuBuilder.Build()` needs new Clock Type submenu + TrayMenuCallbacks entry for SetClockType
- `SettingsWindow.PopulateControls()` needs to set LCD combo/buttons and toggle LCD row visibility

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 51-app-integration*
*Context gathered: 2026-03-10*
