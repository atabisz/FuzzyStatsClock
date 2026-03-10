# Requirements: v3.3 LCD Clock

## Goal

Add a 7-segment LCD clock as a third clock type alongside Phrase and Dial. The LCD renders
retro-style digital time using WPF-drawn segments with ghost (inactive) segments, five color
themes, 12/24hr toggle, optional seconds, and three size variants.

---

## Constraints

- **ClockType enum** replaces `bool DialMode`; existing JSON settings migrate cleanly
  (persisted `"DialMode": true` maps to `ClockType.Dial`; `false` maps to `ClockType.Phrase`)
- **WPF-drawn segments only** — no font files, no bitmaps; all geometry via `Polygon`/`Path`
- **Ghost segments required** — inactive segments rendered at a dimmed color, not hidden
- **Existing 224 tests must pass** with zero regressions; new tests target ≥ 235 total
- Nixie-style clock is **out of scope** (noted in backlog)

---

## Features

### F1 — ClockType Enum Migration

- New enum `ClockType { Phrase, Dial, Lcd }` in `FuzzyClock.App`
- `AppSettings.DialMode` (bool) removed; `AppSettings.ClockType` added (default `Phrase`)
- JSON deserialization backward compat: if persisted file has `"DialMode": true`, load as
  `ClockType.Dial`; `false` or absent → `ClockType.Phrase`
- `MainWindow`, `SettingsWindow`, `TrayMenuBuilder`, `ThemeDefinition` updated throughout
- All 224 existing tests remain green

### F2 — SevenSegmentEncoder (Core, pure logic)

- Static class `SevenSegmentEncoder` in `FuzzyClock.Core`
- `Encode(char c): byte` returns 7-bit mask; bits 0–6 map to segments a–g:
  - bit 0 = a (top horiz), bit 1 = b (top-right vert), bit 2 = c (bottom-right vert)
  - bit 3 = d (bottom horiz), bit 4 = e (bottom-left vert), bit 5 = f (top-left vert)
  - bit 6 = g (middle horiz)
- Supported characters: `'0'–'9'`, `':'`, `' '` (space = all segments off)
- Standard segment patterns:
  | Char | Segments lit         | Mask |
  |------|----------------------|------|
  | 0    | a,b,c,d,e,f          | 0x3F |
  | 1    | b,c                  | 0x06 |
  | 2    | a,b,d,e,g            | 0x5B |
  | 3    | a,b,c,d,g            | 0x4F |
  | 4    | b,c,f,g              | 0x66 |
  | 5    | a,c,d,f,g            | 0x6D |
  | 6    | a,c,d,e,f,g          | 0x7D |
  | 7    | a,b,c                | 0x07 |
  | 8    | a,b,c,d,e,f,g        | 0x7F |
  | 9    | a,b,c,d,f,g          | 0x6F |
  | :    | two dot positions    | 0x80 (sentinel — special-cased in renderer) |
  | ' '  | none                 | 0x00 |
- Throws `ArgumentException` for unsupported characters

### F3 — LcdTheme (5 palettes)

Enum `LcdTheme { Green, Amber, Blue, Teal, Red }` in `FuzzyClock.App`.

| Theme | Lit color | Ghost color | Background |
|-------|-----------|-------------|------------|
| Green | `#00FF41` | `#003310`   | `#001A00`  |
| Amber | `#FFAA00` | `#3D2800`   | `#1A0A00`  |
| Blue  | `#00CFFF` | `#002A35`   | `#00001A`  |
| Teal  | `#00B4B4` | `#002525`   | `#001010`  |
| Red   | `#FF2200` | `#380800`   | `#1A0000`  |

### F4 — SevenSegmentDigit (WPF UserControl)

- `SevenSegmentDigit` in `FuzzyClock.App/Controls/`
- Renders one character slot: 7 segments as WPF `Polygon` shapes; colon slot renders 2 dots
- Dependency properties: `Character` (char), `Theme` (LcdTheme), `SegmentHeight` (double)
- Segment geometry scales with `SegmentHeight`; aspect ratio ~0.6 (width = 0.6 × height)
- Segment thickness ~13% of height; horizontal segs slightly wider with chamfered ends
- Lit segments: theme lit color; ghost segments: theme ghost color
- Background rectangle: theme background color, fills full control bounds

### F5 — LcdClockView (WPF UserControl)

- `LcdClockView` in `FuzzyClock.App/Controls/`
- Composes `SevenSegmentDigit` instances for full time display
- **12hr layout** (`LcdUse24Hr = false`): `[ H][:][MM]` — leading hour digit shows blank `' '`
  when hour < 10; no AM/PM indicator
- **24hr layout** (`LcdUse24Hr = true`): `[HH][:][MM]` — zero-padded
- **With seconds** (`LcdShowSeconds = true`): appends `[:][SS]` to either layout
- Dependency properties: `Use24Hr` (bool), `ShowSeconds` (bool), `Theme` (LcdTheme),
  `Size` (LcdSize)
- `LcdSize` enum and corresponding `SegmentHeight`:
  | Size   | SegmentHeight | Approx equivalent |
  |--------|--------------|-------------------|
  | Small  | 32 px        | 16pt phrase text  |
  | Medium | 48 px        | 24pt phrase text  |
  | Large  | 64 px        | 32pt phrase text  |
- Internal `DispatcherTimer` fires every 1 second when `IsVisible = true`; pauses when hidden
- Public `UpdateTime()` method for on-demand refresh (called on clock-type switch)

### F6 — AppSettings New Fields

Four new persisted fields (all in `FuzzyClock.App/AppSettings.cs`):

| Field          | Type      | Default        |
|----------------|-----------|----------------|
| `ClockType`    | ClockType | `Phrase`       |
| `LcdTheme`     | LcdTheme  | `Green`        |
| `LcdUse24Hr`   | bool      | `false` (12hr) |
| `LcdShowSeconds` | bool    | `true`         |
| `LcdSize`      | LcdSize   | `Medium`       |

`ResetToDefaults()` restores all five fields to the values above.

### F7 — MainWindow Integration

- Three mutually-exclusive display areas in XAML: `PhraseArea`, `DialCanvas`, `LcdArea`
- `SetClockType(ClockType)` method replaces `SetDialMode(bool)`; collapses/shows the correct area
- LCD area hosts the `LcdClockView` control; existing phrase/dial areas unchanged
- The main refresh timer (10s) skips phrase/dial update when `ClockType = Lcd` (LCD has its own 1s timer)
- Ghost mode, auto-contrast, stats panel, date line, uptime row are unaffected by clock type

### F8 — SettingsWindow Integration

- Appearance tab: **three** clock-style buttons — `[Phrase]` `[Dial]` `[LCD]`
- LCD options panel (visible only when LCD selected):
  - Theme: dropdown (Green / Amber / Blue / Teal / Red)
  - Hour format: `[12hr]` `[24hr]` toggle buttons
  - Show seconds: checkbox
  - Size: dropdown (Small / Medium / Large)
- `ClockTypeChanged` event replaces `DialModeChanged` event; carries `ClockType` value
- LCD panel collapses/expands reactively on clock type change

### F9 — Tray Menu Integration

- `TrayMenuBuilder` "Clock Type" submenu with three checkable items: Phrase / Dial / LCD
- Replaces any existing "Dial Mode" toggle item (if one exists in tray)
- Checkmark on active type; clicking inactive type switches via `MainWindow.SetClockType()`

### F10 — Tests

- `SevenSegmentEncoderTests`: 12 cases — all 10 digits, colon, space; one unsupported-char
  exception case
- `AppSettingsTests`: round-trip for `ClockType`, `LcdTheme`, `LcdUse24Hr`, `LcdShowSeconds`,
  `LcdSize` (5 new cases)
- `LcdTimeFormatTests`: static helper verifying 12hr/24hr string formatting with and without
  seconds (4 cases)
- Target: ≥ 235 tests total

### F11 — README

- New "LCD Clock" section: screenshot placeholder, theme list, 12/24hr + seconds options,
  size variants
- Backlog callout: "Nixie-style clock (planned)"
- Test count updated

---

## Out of Scope

- Nixie-style rendering (backlog for future milestone)
- Blinking colon separator
- AM/PM indicator
- Countdown / stopwatch
- LCD-specific named themes (LCD has its own theme system; named themes apply only to
  phrase/dial accent color)
