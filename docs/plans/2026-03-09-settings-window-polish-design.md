# Settings Window Polish — Design

**Date:** 2026-03-09
**Approach:** Option B — Layout + segmented controls (native WPF, no ControlTemplate overrides)

## Problem

The Phase 42 SettingsWindow uses bare default WPF controls with no layout discipline:
- Labels float inline with varying widths — controls never align vertically
- Toggle buttons (S/M/L/XL, Phrase/Dial) use `FontWeight.Bold` as the only selection indicator — nearly invisible
- Accent swatches are 24×24 flat Borders with no hover or selection feedback
- Stats checkboxes are crammed into a single horizontal row that risks wrapping badly
- Behavior tab looks sparse with 3 checkboxes floating unanchored at the top

## Design

### 1. Layout Foundation

All tab content moves from flat `StackPanel` rows to a two-column `Grid` layout:
- Column 0: fixed 90px, `HorizontalAlignment="Right"` — label text
- Column 1: `*` fill — the control

Vertical rhythm:
- 8px `Margin` between consecutive rows (`Margin="0,8,0,0"` on each row's Grid.Row)
- 16px before a new logical section within a tab

Stats tab row checkboxes move from a single horizontal row to a `WrapPanel` with `ItemWidth="86"` — flows naturally into two rows of three (CPU / GPU / Memory / Paging / Battery / Uptime).

Window height: 480 → 510 to accommodate the extra stats row height.

### 2. Segmented Toggle Controls

Font Size (S/M/L/XL) and Clock Style (Phrase/Dial) become segmented controls:

**Container rail:** `Border` with `Background="#FFE8E8E8"`, `CornerRadius="4"`, `Padding="2"` containing a horizontal `StackPanel` of buttons.

**Button style (`SegmentButtonStyle`):**
- Default: `Background=Transparent`, `BorderThickness=0`, `Padding="10,3"`, no focus rectangle
- Selected (`Tag="selected"`): `Background="#FFFFFFFF"`, `BorderBrush="#FFBDBDBD"`, `BorderThickness="1"`, `CornerRadius="3"` via a `DataTrigger` on `Tag`
- Hover on unselected: `Background="#FFD0D0D0"` via `IsMouseOver` trigger

Code-behind helpers `SetFontSizeButtonStates()` and `SetClockStyleButtonStates()` already exist — they will additionally set `.Tag = "selected"` on the active button and `null` on the rest.

### 3. Accent Color Swatches

- **Size:** 28×28 (up from 24×24)
- **Shape:** `CornerRadius="4"` on each swatch border
- **Hover:** `Opacity="0.8"` on `IsMouseOver` via Style trigger
- **White swatch:** retains 1px `#FFAAAAAA` border for visibility against window background

**Selected ring:** each swatch is wrapped in an outer `Border` (named `RingWhite`, `RingAmber`, etc.) with `Padding="2"` and `CornerRadius="6"`. A code-behind helper `SetActiveSwatch(Border ring)` clears `BorderThickness="0"` on all five ring borders, then sets `BorderThickness="2"` and `BorderBrush="#FF0078D4"` (Windows blue) on the target. Called from swatch click handlers and `PopulateControls()`.

The `AccentColor` in `SettingsSnapshot` is matched against the five preset hex values to determine the initial ring on open; if no preset matches (custom color), no ring is shown.

"Custom..." button: unchanged.

## Files Changed

- `FuzzyClock.App/SettingsWindow.xaml` — layout rewrite + styles + swatch ring wrappers
- `FuzzyClock.App/SettingsWindow.xaml.cs` — `SetActiveSwatch()` helper + Tag updates in toggle helpers

## Out of Scope

- No ControlTemplate overrides
- No custom window chrome
- No dark theme
- No changes to event names, event signatures, or code-behind architecture
- No changes to MainWindow, AppSettings, or SettingsSnapshot
