# Phase 63: SettingsWindow LCD UI - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-24
**Phase:** 63-settingswindow-lcd-ui
**Areas discussed:** Segment style selector, LCD panel layout, BtnLcd label text

---

## Segment Style Selector

| Option | Description | Selected |
|--------|-------------|----------|
| ComboBox | Dropdown with 3 items — mirrors CmbPhraseStyle. Compact, one line, familiar pattern already in this window. | ✓ |
| Button rail | 3 small buttons in a row like the Clock Style and Font Size rails. Visually scannable but adds more horizontal width. | |
| Radio buttons | Like the Phrase Wrap radio buttons. Horizontal or vertical, all values visible at once. | |

**User's choice:** ComboBox (Recommended)
**Notes:** Mirrors CmbPhraseStyle pattern. Items: Dark, Paper, Silver.

---

## LCD Panel Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Simple StackPanel | Vertical StackPanel with CheckBox '24-hour mode', CheckBox 'Show seconds', then ComboBox for Style. No sub-labels — mirrors DialFacePanel exactly. Row label in Col 0 is 'LCD'. | ✓ |
| Style on its own labeled row | Checkboxes in a StackPanel, then a separate horizontal row with TextBlock 'Style' and the ComboBox. More explicit but requires nested layout. | |

**User's choice:** Simple StackPanel (Recommended)
**Notes:** DialFacePanel is the direct template. Row 6 label "LCD", StackPanel with 2 checkboxes + ComboBox.

---

## BtnLcd Label Text

| Option | Description | Selected |
|--------|-------------|----------|
| LCD | Matches the clock type name. Consistent with 'Phrase', 'Dial', 'Nixie'. | ✓ |
| Lcd | Mixed-case. Less standard than all-caps for an acronym. | |

**User's choice:** LCD
**Notes:** All-caps acronym, consistent with clock type terminology.

---

## Claude's Discretion

- Exact margin values for controls (use CmbPhraseStyle / DialFacePanel as templates)
- Index-to-string mapping implementation for CmbLcdStyle SelectionChanged

## Deferred Ideas

None.
