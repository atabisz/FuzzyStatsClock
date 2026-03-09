# Phase 47: Tech Debt Cleanup - Research

**Researched:** 2026-03-09
**Domain:** C# WPF — targeted code cleanup (three isolated cosmetic/structural issues)
**Confidence:** HIGH

## Summary

Phase 47 closes four tech debt items surfaced by the v3.2 milestone audit. All three actionable items are surgical, single-file edits with zero risk of side effects. No new libraries, no architectural changes, no cross-cutting concerns.

Item 1 (Ghost theme FontSize): The audit flagged that `BuiltInThemes.cs` sets Ghost `FontSize = 28`, which is not representable by the four font-size toggle buttons in `SettingsWindow` (16/24/32/40). The widget renders and persists 28 correctly; only the visual feedback in Settings is broken. The fix is to change Ghost `FontSize` from 28 to 24 in `ThemeDefinition.cs`. This aligns with the audit recommendation ("change Ghost FontSize to 24 or 32") and requires no XAML changes.

Item 2 (stale comment in AppSettings.cs): Line 35 has a trailing comment `// "Classic" is the only option in v3.2; Phase 45 adds Terse/Poetic/Rude` — Phase 45 shipped in this milestone. Removing the comment (not the property or its value) is a one-character change with no behavioral impact.

Item 3 (redundant `_suppressEvents = true`): In `SettingsWindow.xaml.cs`, the constructor sets `_suppressEvents = true` on line 49, then sets it again on line 60 before calling `PopulateControls`. The second assignment is redundant. Removing line 60 leaves the constructor behavior identical. The fourth audit item (Japanese phrase quality) is a content concern requiring human review, not a code change; it is out of scope for this phase.

**Primary recommendation:** Make the three targeted single-line edits in `ThemeDefinition.cs`, `AppSettings.cs`, and `SettingsWindow.xaml.cs`; run `dotnet test` to confirm all 224 tests remain green.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| MSTest | 4.0.1 | Test runner for both Core.Tests and App.Tests | Already in use throughout project |
| .NET 10 WPF | 10.0 | Target framework for App project | Project baseline; no change |

No new libraries are introduced. This phase uses only the existing project stack.

**Build/test commands:**
```bash
dotnet build FuzzyClock.sln
dotnet test FuzzyClock.sln
```

## Architecture Patterns

### Pattern 1: Surgical Single-Line Edits

**What:** Each fix targets exactly one line in one file. No new types, methods, or properties.
**When to use:** Cosmetic/structural issues where the surrounding code is already correct.

**Edit A — ThemeDefinition.cs (Ghost FontSize 28 → 24):**
```csharp
// Before (line 46)
FontSize = 28,
// After
FontSize = 24,
```
Source: Direct inspection of `FuzzyClock.App/ThemeDefinition.cs` line 46.

**Edit B — AppSettings.cs (remove stale comment on line 35):**
```csharp
// Before
public string PhraseStyle  { get; init; } = "Classic";  // "Classic" is the only option in v3.2; Phase 45 adds Terse/Poetic/Rude
// After
public string PhraseStyle  { get; init; } = "Classic";
```
Source: Direct inspection of `FuzzyClock.App/AppSettings.cs` line 35.

**Edit C — SettingsWindow.xaml.cs (remove redundant line 60):**
```csharp
// Before (constructor body, lines 49-62)
_suppressEvents = true;
InitializeComponent();
// ... position restore ...
_suppressEvents = true;      // ← remove this line
PopulateControls(snapshot);
_suppressEvents = false;

// After
_suppressEvents = true;
InitializeComponent();
// ... position restore ...
PopulateControls(snapshot);
_suppressEvents = false;
```
Source: Direct inspection of `FuzzyClock.App/SettingsWindow.xaml.cs` lines 49 and 60.

### Anti-Patterns to Avoid

- **Adding a 28px button to SettingsWindow XAML:** The audit explicitly recommends changing the value rather than adding a fifth button. A fifth non-standard size (28) would be an unusual choice on a 16/24/32/40 scale. Change the value; do not touch XAML.
- **Changing the comment to updated text rather than removing it:** The comment no longer adds value. Remove it entirely rather than rewriting it.
- **Touching any test files:** No test changes are needed. All 224 tests already cover the relevant code paths.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Verifying font button state after Ghost theme | Custom test for button Tag states | Existing test run (`dotnet test`) | App.Tests already cover SettingsWindow construction; 224 tests are the gate |

**Key insight:** These are cosmetic fixes, not feature additions. The correct verification is "all existing tests still pass" — no new tests are required.

## Common Pitfalls

### Pitfall 1: Changing FontSize to 32 Instead of 24

**What goes wrong:** Choosing 32 is equally valid per the audit, but 24 is the smaller and more "ghost-like" size. Either works, but inconsistent choice later causes confusion.
**Why it happens:** The audit listed both 24 and 32 as options.
**How to avoid:** Choose 24 — Ghost theme is low-opacity and subtle; 24pt is the natural step down from the current 28 within the defined button set.
**Warning signs:** N/A — both values are correct; just pick one and document it.

### Pitfall 2: Accidentally Removing the Wrong _suppressEvents = false Line

**What goes wrong:** Removing line 62 (`_suppressEvents = false`) instead of line 60 (the redundant `= true`) would cause all SettingsWindow event handlers to be permanently suppressed after construction — a catastrophic silent bug.
**Why it happens:** Three adjacent lines all reference `_suppressEvents`.
**How to avoid:** Remove only the second `_suppressEvents = true` (line 60, immediately before `PopulateControls`). Confirm `_suppressEvents = false` remains on the line after `PopulateControls`.

### Pitfall 3: Editing the Wrong PhraseStyle Comment

**What goes wrong:** AppSettings.cs line 34 has a separate comment for `TextStyle` (`// "Classic"|"Split"|"Literary"|"Mono"`). Only line 35 (the `PhraseStyle` property) has the stale comment.
**Why it happens:** Both properties are adjacent and both have trailing comments.
**How to avoid:** Target only the `PhraseStyle` property comment on line 35. Do not touch `TextStyle` on line 34.

## Code Examples

### Before/After for All Three Edits

**ThemeDefinition.cs — Ghost entry (lines 41-49):**
```csharp
// BEFORE
["Ghost"] = new ThemeDefinition
{
    Name         = "Ghost",
    AccentColor  = Color.FromArgb(0xFF, 0xC0, 0xC8, 0xD8),
    Opacity      = 0.35,
    FontSize     = 28,   // ← change to 24
    DialMode     = false,
    StatsVisible = false,
},
```

**AppSettings.cs — PhraseStyle property (line 35):**
```csharp
// BEFORE
public string PhraseStyle  { get; init; } = "Classic";  // "Classic" is the only option in v3.2; Phase 45 adds Terse/Poetic/Rude
// AFTER
public string PhraseStyle  { get; init; } = "Classic";
```

**SettingsWindow.xaml.cs — constructor (lines 47-65):**
```csharp
// AFTER (redundant line removed)
internal SettingsWindow(SettingsSnapshot snapshot)
{
    _suppressEvents = true;
    InitializeComponent();

    if (!double.IsNaN(_savedLeft))
    {
        WindowStartupLocation = WindowStartupLocation.Manual;
        Left = _savedLeft;
        Top  = _savedTop;
    }

    PopulateControls(snapshot);
    _suppressEvents = false;

    Closing += (_, _) => { _savedLeft = Left; _savedTop = Top; };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Ghost FontSize=28 (non-standard) | Ghost FontSize=24 (matches button) | Phase 47 | Settings Appearance tab shows correct selected button after Ghost theme applied |
| Stale Phase 45 comment | Comment removed | Phase 47 | AppSettings.cs self-consistent with shipped feature set |
| Redundant _suppressEvents=true | Single assignment retained | Phase 47 | Constructor marginally cleaner; behavior unchanged |

## Open Questions

None. All three fixes are fully understood from code inspection. The fourth audit item (Japanese phrase quality) is a human content review task; it is not addressed in this phase.

## Sources

### Primary (HIGH confidence)
- Direct inspection: `FuzzyClock.App/ThemeDefinition.cs` — confirmed Ghost `FontSize = 28` at line 46
- Direct inspection: `FuzzyClock.App/AppSettings.cs` — confirmed stale comment at line 35
- Direct inspection: `FuzzyClock.App/SettingsWindow.xaml.cs` — confirmed duplicate `_suppressEvents = true` at lines 49 and 60
- Direct inspection: `FuzzyClock.App/SettingsWindow.xaml.cs` lines 176-182 — confirmed `SetFontSizeButtonStates` maps only 16/24/32/40
- `.planning/v3.2-MILESTONE-AUDIT.md` — source of all three debt items, with specific line references

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; existing MSTest + dotnet CLI
- Architecture: HIGH — three surgical single-line edits, all verified against actual source
- Pitfalls: HIGH — identified from direct code inspection of the exact lines being changed

**Research date:** 2026-03-09
**Valid until:** N/A — codebase-specific; valid until any of the three files are modified
