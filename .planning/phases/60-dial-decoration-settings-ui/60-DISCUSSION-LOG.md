# Phase 60: Dial Decoration Settings UI - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-23
**Phase:** 60-dial-decoration-settings-ui
**Areas discussed:** Placement in Appearance tab, Section label text, Checkbox layout

---

## Placement in Appearance Tab

| Option | Description | Selected |
|--------|-------------|----------|
| New grid row (Row 5) | Labeled row in the existing 2-column grid, below Phrase Wrap. Consistent with how Phrase Style and Phrase Wrap sit after Clock Style. | ✓ |
| Separate section below the grid | Bold 'Dial Options' header (like 'Backdrop') followed by indented checkboxes, outside the grid. More visual separation from phrase controls. | |

**User's choice:** New grid row (Row 5)
**Notes:** Keeps all per-style controls together in the grid.

---

## Section Label Text

| Option | Description | Selected |
|--------|-------------|----------|
| Dial Face | Matches the visual concept — face decorations on a dial clock. | ✓ |
| Dial Options | Parallel to 'Phrase Style' / 'Phrase Wrap' labeling convention. | |
| Decorations | Generic — describes what they are without referencing clock type. | |

**User's choice:** Dial Face
**Notes:** None.

---

## Checkbox Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Vertical stack | One checkbox per line in a StackPanel, like the Phrase Wrap area. | ✓ |
| Horizontal WrapPanel | All three on one line (or wrapping), like the Stats Rows. | |

**User's choice:** Vertical stack
**Notes:** Preferred for readability given the longer label text.

---

## Claude's Discretion

- Exact XAML element names for checkboxes
- Named panel element for visibility gating
- Margin values within the 4px grid spacing convention

## Deferred Ideas

None.
