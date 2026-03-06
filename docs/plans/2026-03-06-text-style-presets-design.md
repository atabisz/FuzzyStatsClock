# Text Style Presets — Design

**Date:** 2026-03-06
**Milestone target:** v3.0

---

## Problem

The fuzzy phrase text is rendered as a single flat `TextBlock` in Segoe UI Light. It is legible and minimal, but visually inert — the font has no personality and there is no typographic structure that makes the key information (the hour word) stand out.

## Goal

Let users choose from named text style presets that control font family and layout. Some presets add a two-line typographic hierarchy where the qualifier phrase is small and faded and the hour word is large and dominant.

---

## Presets

| Name | Font | Layout | Character |
|------|------|--------|-----------|
| **Classic** | Segoe UI Light | Single-line | Current behavior. Default for all users. |
| **Split** | Segoe UI Light | Two-line hierarchy | Qualifier fades above, hour word large below. |
| **Literary** | Palatino Linotype | Single-line | Serif, warm, slightly relaxed sizing. |
| **Expressive** | Palatino Linotype | Two-line hierarchy | Split layout + serif combined. |

Palatino Linotype ships with every Windows installation.

---

## Visual Layout

### Single-line presets (Classic, Literary)

```
just after twelve       ← uniform weight, single line
```

### Two-line presets (Split, Expressive)

```
just after              ← qualifier: 0.65× base size, 55% opacity
twelve                  ← emphasis:  1.4×  base size, 100% opacity
```

When the qualifier is empty (`noon`, `midnight`, `{h} o'clock`), split layout shows a single emphasis line only — no blank line above.

---

## Phrase Decomposition

`PhraseEngine` gains a new method:

```csharp
public static (string Qualifier, string Emphasis) GetStructuredPhrase(DateTime dt)
```

Decomposition rules:

| Template | Qualifier | Emphasis |
|----------|-----------|----------|
| `{h} o'clock` | `""` | `"twelve o'clock"` (whole expression) |
| `just after {h}` | `"just after"` | `"twelve"` |
| `a quarter past {h}` | `"a quarter past"` | `"twelve"` |
| `almost {h1}` | `"almost"` | `"one"` |
| `noon` | `""` | `"noon"` |
| `midnight` | `""` | `"midnight"` |

General rule for all other templates: everything before the hour token is the qualifier; the resolved hour word is the emphasis. `GetPhrase()` is unchanged — `GetStructuredPhrase()` calls it internally and decomposes the result.

---

## XAML Structure

Grid row 0 currently holds `PhraseText` + `ShadowText` (two `TextBlock`s sharing the same cell for the manual drop-shadow effect). After this change it also holds:

- `QualifierText` — qualifier line (hidden in single-line presets)
- `EmphasisText` — emphasis line (hidden in single-line presets)
- `EmphasisShadow` — manual shadow for EmphasisText (same offset pattern as ShadowText)

A wrapping `StackPanel` (`SplitPhrasePanel`) holds `QualifierText` + `EmphasisText` + `EmphasisShadow` and collapses as a unit in single-line presets.

Visibility toggle on preset change:
- Single-line: `PhraseText/ShadowText` = Visible, `SplitPhrasePanel` = Collapsed
- Two-line: `PhraseText/ShadowText` = Collapsed, `SplitPhrasePanel` = Visible

---

## Font Size Interaction

The existing Small/Medium/Large font size menu (16/24/32pt) continues to work. In split layout:

- Qualifier size = `base × 0.65` (rounds to nearest int)
- Emphasis size = `base × 1.4`

Example at Medium (24pt): qualifier = 15pt, emphasis = 33pt.

---

## Settings

New field on `AppSettings`:

```csharp
public string TextStyle { get; init; } = "Classic";
```

`SettingsService.Validate()` guards invalid/null values — falls back to `"Classic"`.

---

## Tray Menu

New "Text Style" submenu under the tray context menu. Four mutually-exclusive `IsCheckable` items: Classic / Split / Literary / Expressive. Checkmark synced in `TrayContextMenu_Opening` (same pattern as other tray checkmarks). Selecting a preset calls `SetTextStyle(string)` which applies immediately and saves to `settings.json`.

---

## Theming / Auto-Contrast

`ApplyTheme()` and `ApplyDisplayColor()` are extended to cover `QualifierText`, `EmphasisText`, and `EmphasisShadow`. The qualifier stays at 55% opacity even when a display color override is active — the opacity is structural, not a color attribute.

---

## Reset to Defaults

`ResetToDefaults()` sets `TextStyle = "Classic"` and calls `SetTextStyle("Classic")`.

---

## Test Coverage

- `PhraseEngine.GetStructuredPhrase()` — unit tests for all 12 bucket templates, noon, midnight
- Edge cases: empty qualifier (o'clock, noon, midnight), minute boundary values
- `SettingsService.Validate()` — guard test for invalid TextStyle value

---

## Out of Scope

- Custom font picker (system font chooser) — YAGNI; the four presets cover the design intent
- Phrase transition animations — separate concern, not part of this milestone
- Additional presets beyond the four named above
