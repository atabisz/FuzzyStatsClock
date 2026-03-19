# Feature Landscape: Nixie Clock Re-Introduction

**Domain:** Desktop overlay widget — adding Nixie tube clock as a third selectable clock type
**Milestone:** v3.7 — Phase 57
**Researched:** 2026-03-19
**Confidence:** HIGH (all findings are from direct source audit of the existing codebase + UI-SPEC + phase research)

---

## Table Stakes

Features users expect from a Nixie clock display. Missing any of these makes the
clock type feel incomplete or broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Nixie digit display for HH:MM | A clock must show hours and minutes; warm amber cathode glow is the defining visual | LOW | `NixieClockView` + `NixieDigit` already complete; wiring is the work |
| Real-time update (1s tick) | Nixie tubes are exact clocks, not fuzzy; users expect the minute digit to flip precisely at :00 | LOW | `NixieClockView` manages its own 1s `DispatcherTimer` via `IsVisibleChanged`; no MainWindow timer involvement |
| Selectable in Settings (alongside Phrase and Dial) | Clock style is already a user-facing choice; Nixie must live in the same 3-button rail | LOW | Extend the existing 2-button "Phrase / Dial" rail to 3-button "Phrase / Dial / Nixie" in `SettingsWindow.xaml` |
| Selection persists across restarts | All other clock settings persist; Nixie must too | LOW | Requires migrating `AppSettings.DialMode: bool` to `AppSettings.ClockType: ClockType`; `SettingsService` migration already implemented |
| Ghost cathode effect (all 10 digits faintly visible) | Core visual identity of an IN-18 Nixie tube; without it the display looks like a plain LCD | LOW | Already implemented in `NixieDigit.xaml.cs` with distance-weighted opacity (base/distance-2/distance-1/active four-level system) |
| Correct amber-orange glow color | Nixie tubes emit warm orange — wrong color breaks the aesthetic | LOW | Hardcoded palette already in `NixieDigit.xaml.cs`: active cathode `#FF8C00 FF`, glow center `#FF8C00 A0` |
| Colon separator between hours and minutes | HH:MM format requires a visual separator; colon dots must pulse or be static | LOW | `NixieClockView` already renders two colon dots between the digit pairs |
| Stats panel visible below Nixie clock | Stats panel is the widget's primary secondary feature; must not vanish when switching to Nixie | LOW | `NixieClockView` replaces `PhraseText`/`DialCanvas` in Row 0; stats remain in their own rows unchanged |
| Font size change reflected in tube size | User changes font size in Settings; Nixie digits should scale proportionally | LOW | `NixieView.Size = FontSizeToLcdSize(FontSize)` already wired in `SetClockType()` and `ApplyFontSize()`; `NixieSizeMap` maps Small=40px/Medium=56px/Large=72px digit height |

---

## Differentiators

Features that distinguish this Nixie implementation beyond minimal correctness.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Wire mesh texture inside tube | Physical Nixie tubes have a wire mesh cathode cage; the rendered version simulates this with horizontal strokes at 7px spacing | LOW | Already rendered in `NixieDigit.xaml.cs`; `#FF8C00 18` (9.4% alpha) strokes; no action needed |
| Glass reflection highlight | Top highlight rectangle simulates glass curvature — differentiates from flat LCD-style rendering | LOW | Already implemented: `#FFFFFF 14` (7.8% alpha) rectangle at tube top |
| Dark tube fill (not transparent) | Physical tubes have a dark glass envelope; `#1A0800 CC` (80% alpha) background conveys depth | LOW | Already implemented in `NixieDigit.xaml.cs` |
| Accent color isolation (no accent bleed onto Nixie face) | Nixie authenticity depends on fixed amber colors; user accent color must NOT override tube glow | LOW | UI-SPEC explicitly excludes `NixieClockView` from accent color application; requires validation that `ApplyTheme()` and `ApplyDisplayColor()` do not iterate over Nixie elements |
| Proportional digit geometry (not fixed px) | Digits scale correctly at all three font sizes without distortion | LOW | `NixieDigit.xaml.cs` uses `DigitHeight * 0.62` for width, `DigitHeight * 0.72` for glyph font size; already correct |
| Three-button Settings rail (not a dropdown) | Segment rail is visually consistent with the existing font-size rail; faster to tap than a ComboBox | LOW | Extend the `SegmentButtonStyle` rail with a "Nixie" button at `Padding="12,4"` |

---

## Anti-Features

Features to explicitly not build in this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Accent color applied to Nixie digit glow | Would make tubes green/blue/pink depending on user theme — destroys the tube aesthetic | Keep `NixieClockView` excluded from all accent-color update loops; hardcoded amber palette is the design contract |
| 24-hour / seconds display toggle surfaced in UI | LCD clock (future) will own 24hr/seconds controls; Nixie shows HH:MM in 12-hour by default | `LcdUse24Hr` and `LcdShowSeconds` are added to `AppSettings`/`SettingsSnapshot` for LCD but should not be wired to Nixie display in this phase |
| Custom Nixie color picker | Authentic Nixie tubes emit one color; a color picker undercuts the nostalgic premise | Fixed amber palette only |
| Digit animation (cathode crossfade) | Animated cathode switching would require a timed opacity transition per digit per tick — significant complexity for a widget | Instant digit swap on tick (current implementation); animation is a post-MVP consideration |
| Tray menu changes | Tray already exposes `_nixieClockItem` wired to `SetClockType(ClockType.Nixie)` and reflects checked state | No tray changes required in this phase |
| Re-implementing NixieDigit / NixieClockView geometry | Already pixel-exact and validated in Phase 56; zero changes to the rendering controls needed | Wire the existing controls; do not touch `Controls/NixieDigit.xaml.cs` or `Controls/NixieClockView.xaml.cs` |
| Separate Nixie settings section in SettingsWindow | Nixie has no user-configurable display options in this phase | The single "Nixie" button in the Clock Style rail is the complete Nixie UI surface |

---

## Feature Dependencies

```
[ClockType enum]
    already exists in ClockType.cs (Phrase/Dial/Lcd/Nixie)
    already used by MainWindow._clockType, SetClockType(), ApplySettings(), SaveSettings()
    already used by TrayMenuBuilder._nixieClockItem

[AppSettings.ClockType migration]
    requires removing: AppSettings.DialMode bool
    requires adding: AppSettings.ClockType ClockType, LcdUse24Hr bool, LcdShowSeconds bool, LcdStyle string
    SettingsService.Load() migration (DialMode → ClockType) already implemented — no changes needed there
    removing DialMode from the record does NOT break the migration (reads from JsonDocument.TryGetProperty, not from deserialized field)

[SettingsSnapshot.ClockType migration]
    requires removing: SettingsSnapshot.DialMode bool
    requires adding: SettingsSnapshot.ClockType ClockType, LcdUse24Hr bool, LcdShowSeconds bool, LcdStyle string, LcdSize LcdSize
    GetCurrentSettingsSnapshot() in MainWindow.xaml.cs already populates ClockType = _clockType — will compile once SettingsSnapshot has the field

[SettingsWindow 3-button rail]
    requires adding BtnNixie to SettingsWindow.xaml Clock Style StackPanel
    requires replacing DialModeChanged: Action<bool> with ClockTypeChanged: Action<ClockType>
    requires updating SetClockStyleButtonStates(bool) to SetClockStyleButtonStates(ClockType)
    requires adding BtnNixie_Click handler
    requires updating PopulateControls to read s.ClockType instead of s.DialMode

[Missing SettingsWindow event declarations]
    MainWindow.OpenSettings() already subscribes to: ClockTypeChanged, LcdUse24HrChanged,
    LcdShowSecondsChanged, LcdStyleChanged, ShowHourTicksChanged, ShowMinuteDotsChanged, ShowHourNumbersChanged
    SettingsWindow.xaml.cs currently only declares: DialModeChanged (and likely the others as missing)
    All missing events must be declared on SettingsWindow for the project to compile

[MainWindow _dialMode stale reference]
    ApplyPhraseWrap() at line 718 references _dialMode (no such field exists)
    must be replaced with: _clockType != ClockType.Phrase
    this is a pre-existing compile error that this phase must resolve (NIX-04)

[NixieClockView visibility wiring]
    already handled in SetClockType(ClockType.Nixie): sets NixieView.Size, sets NixieView.Visibility = Visible
    NixieClockView.IsVisibleChanged starts/stops its own internal 1s timer
    ApplySettings() Nixie branch already restores Nixie from s.ClockType on startup
    no new timer management needed in MainWindow

[Accent color isolation — validation required]
    ApplyTheme() and ApplyDisplayColor() must NOT iterate over NixieClockView elements
    if either method uses a broad XAML-tree walk or catches NixieView by name, the hardcoded amber palette
    would be overwritten by the user's accent color
    requires code audit of the accent-application path; expected to be safe (Nixie controls are not in
    the existing accent element lists), but must be verified
```

---

## MVP Definition

### This Phase Delivers (v3.7)

These four requirements are the complete scope of this phase:

- [ ] NIX-01: `AppSettings` and `SettingsSnapshot` use `ClockType` enum instead of `DialMode` bool; LCD fields added
- [ ] NIX-02: `SettingsWindow` exposes a 3-button Clock Style rail (Phrase / Dial / Nixie) with `ClockTypeChanged` event
- [ ] NIX-03: Selecting Nixie in Settings activates the Nixie tube clock face on the widget
- [ ] NIX-04: Pre-existing build errors resolved (`_dialMode` reference in `ApplyPhraseWrap`, `GetSegmentKey` on novelty providers); project compiles clean

### Deferred (Not This Phase)

- Nixie digit crossfade animation — cosmetic, high complexity
- Nixie 24hr display option — belongs to a future Nixie settings panel
- LCD clock type surfaced in SettingsWindow — separate future phase
- Dial decoration toggles surfaced via new events — events declared here as stubs; UI controls deferred
- Custom Nixie color — explicitly out of scope (anti-feature)

---

## Complexity Notes

### Why This Phase Is Low Complexity Overall

The rendering stack is pre-existing and validated (Phase 56). The `ClockType` enum is pre-existing. `MainWindow` already handles `ClockType.Nixie` in all key paths. The tray menu already works. The migration code in `SettingsService` is already written.

The work is entirely settings-plumbing: four targeted changes across five files plus resolving two pre-existing compile errors.

### Highest-Risk Change

Removing `AppSettings.DialMode` and ensuring `SettingsService.Load()` migration still works. The migration reads from the raw `JsonDocument`, not the deserialized object, so the removal is safe — but this requires careful verification before and after the change.

### Most Likely Source of Surprises

Missing `SettingsWindow` event declarations. `MainWindow.OpenSettings()` subscribes to six events that may not be declared on `SettingsWindow`. A compile-time audit of all `_settingsWindow.XXXChanged +=` subscriptions against the declared events in `SettingsWindow.xaml.cs` is the critical first step.

---

## Sources

- `.planning/phases/57-re-introduce-nixie-into-the-new-architecture/57-RESEARCH.md` — direct source audit, HIGH confidence
- `.planning/phases/57-re-introduce-nixie-into-the-new-architecture/57-UI-SPEC.md` — UI design contract, HIGH confidence
- `.planning/PROJECT.md` — validated requirements list through v3.6.1, HIGH confidence
- `FuzzyClock.App/MainWindow.xaml.cs` (audited in phase research) — clock type wiring confirmed
- `FuzzyClock.App/Controls/NixieDigit.xaml.cs` (audited in phase research) — rendering geometry confirmed

---

*Feature landscape for: FuzzyStatsClock v3.7 — Nixie tube clock re-introduction*
*Researched: 2026-03-19*
