# Phase 53: v3.3 LCD Tech Debt Cleanup - Research

**Researched:** 2026-03-11
**Domain:** C# record mutation, WPF settings persistence, Markdown documentation consistency
**Confidence:** HIGH

---

## Summary

Phase 53 closes three precise, pre-diagnosed consistency items from the v3.3 milestone audit. All three gaps were identified by the auditor with exact file locations and fix instructions. No new architecture or library research is needed — this phase is pure targeted correction of known deficiencies.

**Gap 1 (Moderate):** `SaveSettings()` in `MainWindow.xaml.cs` builds a `_settings with { ... }` record update that includes `LcdTheme`, `LcdUse24Hr`, and `LcdShowSeconds` but omits `LcdSize`. The field always persists as its init default (`Medium`) regardless of user selection. The workaround — `LcdSize` is recomputed from `FontSize` via `FontSizeToLcdSize()` at runtime — means no user-visible defect exists, but `settings.json` carries a stale field.

**Gap 2 (Low):** `SettingsSnapshot.cs` has `LcdTheme`, `LcdUse24Hr`, and `LcdShowSeconds` but omits `LcdSize`. Since no SettingsWindow UI surface currently exposes LcdSize selection, there is no runtime defect. The omission is a consistency gap that will cause a silent bug if a future phase adds an LcdSize control to SettingsWindow.

**Gap 3 (Minor):** `README.md` theme table (lines 38–44) documents "Lit Color" and "Background" columns but omits the "Ghost color" column. `LcdPalette.Get()` returns a three-value tuple (Lit, Ghost, Background) per the F3 spec. The ghost color is a hallmark feature (mentioned in the text above the table) but absent from the table itself.

**Primary recommendation:** Apply all three fixes in a single plan wave. The three items are independent; each is a one- or two-line change with zero test regressions.

---

## Standard Stack

### Core (already present — no new dependencies)
| Component | File | Purpose |
|-----------|------|---------|
| C# `record with { }` expression | `MainWindow.xaml.cs` | Non-destructive record update — add `LcdSize` field |
| `internal sealed record SettingsSnapshot` | `SettingsSnapshot.cs` | Add `LcdSize LcdSize` property |
| Markdown table syntax | `README.md` | Add Ghost color column |

**Installation:** None — no new packages required.

---

## Architecture Patterns

### Pattern: C# Record Non-Destructive Update
**What:** `_settings = _settings with { ... }` copies the record and replaces specified init properties. Adding a new property to the `with { }` block is additive and cannot break existing fields.

**Exact location:** `MainWindow.xaml.cs`, `SaveSettings()` method, lines 499–532. The `with` block currently sets `LcdTheme`, `LcdUse24Hr`, `LcdShowSeconds` on lines 511–513. `LcdSize` should be added after `LcdShowSeconds`.

**The value to use:** `FontSizeToLcdSize(_currentFontSize)` — this is already the runtime source of truth (used identically in `SetClockType()` at line 1134 and in `ApplySettings()` at line 251). Using it in `SaveSettings()` ensures JSON parity.

### Pattern: SettingsSnapshot Record Field Addition
**What:** `SettingsSnapshot` is an `internal sealed record` with `{ get; init; }` properties. Adding a new field is a one-line change. The field must also be populated in `GetCurrentSettingsSnapshot()` in `MainWindow.xaml.cs`.

**Exact location:** `SettingsSnapshot.cs` lines 17–18 (after `LcdShowSeconds`, before `PhraseStyle`). The companion snapshot builder `GetCurrentSettingsSnapshot()` at `MainWindow.xaml.cs` line 377 must also add `LcdSize = FontSizeToLcdSize(_currentFontSize),`.

### Pattern: Markdown Table Column Addition
**What:** Add a third column "Ghost color" to the existing 2-column theme table in `README.md` lines 38–44. The ghost color values come from REQUIREMENTS.md F3 spec.

**Current table (lines 38–44):**
```
| Theme | Lit color | Background |
|-------|-----------|------------|
| Green | `#00FF41` | `#001A00`  |
| Amber | `#FFAA00` | `#1A0A00`  |
| Blue  | `#00CFFF` | `#00001A`  |
| Teal  | `#00B4B4` | `#001010`  |
| Red   | `#FF2200` | `#1A0000`  |
```

**Target table (from REQUIREMENTS.md F3, HIGH confidence):**
```
| Theme | Lit color | Ghost color | Background |
|-------|-----------|-------------|------------|
| Green | `#00FF41` | `#003310`   | `#001A00`  |
| Amber | `#FFAA00` | `#3D2800`   | `#1A0A00`  |
| Blue  | `#00CFFF` | `#002A35`   | `#00001A`  |
| Teal  | `#00B4B4` | `#002525`   | `#001010`  |
| Red   | `#FF2200` | `#380800`   | `#1A0000`  |
```

### Anti-Patterns to Avoid
- **Adding an LcdSize backing field:** `MainWindow.xaml.cs` has `_lcdTheme`, `_lcdUse24Hr`, `_lcdShowSeconds` backing fields but does NOT have a `_lcdSize` backing field — LcdSize is always derived from `_currentFontSize`. Do not add one. Use `FontSizeToLcdSize(_currentFontSize)` directly in both `SaveSettings()` and `GetCurrentSettingsSnapshot()`.
- **Touching `SettingsService.Defaults()`:** The defaults method does not need changing — `AppSettings.LcdSize` already has a `= LcdSize.Medium` default value at the record property level and `Defaults()` already omits fields that have record-level defaults.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Ghost color values | Re-derive from hex math | Copy verbatim from REQUIREMENTS.md F3 table | Values are already canonical spec; no derivation needed |

---

## Common Pitfalls

### Pitfall 1: Missing GetCurrentSettingsSnapshot() update
**What goes wrong:** Adding `LcdSize` to `SettingsSnapshot.cs` but forgetting to populate it in `GetCurrentSettingsSnapshot()` in `MainWindow.xaml.cs`. The property will compile but always carry its `init` default value (derived from `LcdSize.Medium` default).
**Why it happens:** Two files must be updated for Gap 2; it is easy to update only one.
**How to avoid:** Update both `SettingsSnapshot.cs` AND the `GetCurrentSettingsSnapshot()` method in `MainWindow.xaml.cs` as part of the same plan task.
**Warning signs:** If the property exists on `SettingsSnapshot` but is not initialized in `GetCurrentSettingsSnapshot()`, the C# compiler will not warn — `init` properties can be left at their default.

### Pitfall 2: Using wrong ghost color values
**What goes wrong:** Typo in ghost color hex strings for the README table.
**Why it happens:** Five rows, each with three hex values — easy to transpose digits.
**How to avoid:** Copy directly from REQUIREMENTS.md F3 table (lines 63–68), which is the single authoritative source.

### Pitfall 3: Breaking test count claims
**What goes wrong:** Adding no new tests when the existing README states 245.
**Why it happens:** These three gaps are all non-logic fixes — no new test cases are strictly required by the changes. The test count stays at 245.
**How to avoid:** Do not update the README test count unless actual new tests are added. The README (line 90) currently states "245 unit tests" — this remains correct.

---

## Code Examples

### Gap 1: SaveSettings() fix
```csharp
// File: FuzzyClock.App/MainWindow.xaml.cs
// In SaveSettings(), within the _settings with { ... } block
// Add after LcdShowSeconds (line 513):
LcdSize            = FontSizeToLcdSize(_currentFontSize),
```

**Full block context (lines 510–513 + new line):**
```csharp
ClockType            = _clockType,
LcdTheme             = _lcdTheme,
LcdUse24Hr           = _lcdUse24Hr,
LcdShowSeconds       = _lcdShowSeconds,
LcdSize              = FontSizeToLcdSize(_currentFontSize),   // ADD THIS LINE
ShowHourTicks        = _showHourTicks,
```

### Gap 2: SettingsSnapshot field addition
```csharp
// File: FuzzyClock.App/SettingsSnapshot.cs
// Add after LcdShowSeconds (line 17):
public LcdSize   LcdSize                              { get; init; } = LcdSize.Medium;
```

**GetCurrentSettingsSnapshot() update (MainWindow.xaml.cs ~line 385):**
```csharp
LcdTheme               = _lcdTheme,
LcdUse24Hr             = _lcdUse24Hr,
LcdShowSeconds         = _lcdShowSeconds,
LcdSize                = FontSizeToLcdSize(_currentFontSize),   // ADD THIS LINE
PhraseStyle            = _currentPhraseStyle,
```

### Gap 3: README table fix
Replace lines 38–44 in README.md:
```markdown
| Theme | Lit color | Ghost color | Background |
|-------|-----------|-------------|------------|
| Green | `#00FF41` | `#003310`   | `#001A00`  |
| Amber | `#FFAA00` | `#3D2800`   | `#1A0A00`  |
| Blue  | `#00CFFF` | `#002A35`   | `#00001A`  |
| Teal  | `#00B4B4` | `#002525`   | `#001010`  |
| Red   | `#FF2200` | `#380800`   | `#1A0000`  |
```

---

## Exact File Locations Summary

| Gap | File | Location | Change |
|-----|------|----------|--------|
| 1 — SaveSettings LcdSize | `FuzzyClock.App/MainWindow.xaml.cs` | `SaveSettings()` method, `_settings with { }` block, after line 513 | Add `LcdSize = FontSizeToLcdSize(_currentFontSize),` |
| 2a — SettingsSnapshot field | `FuzzyClock.App/SettingsSnapshot.cs` | After `LcdShowSeconds` (line 17) | Add `public LcdSize LcdSize { get; init; } = LcdSize.Medium;` |
| 2b — Snapshot builder | `FuzzyClock.App/MainWindow.xaml.cs` | `GetCurrentSettingsSnapshot()` method ~line 385 | Add `LcdSize = FontSizeToLcdSize(_currentFontSize),` |
| 3 — README Ghost column | `README.md` | Lines 38–44 (theme table) | Add Ghost color column with values from REQUIREMENTS.md F3 |

---

## Open Questions

None. All three gaps are fully diagnosed with exact locations, values, and fixes documented in the v3.3 milestone audit.

---

## Sources

### Primary (HIGH confidence)
- `.planning/v3.3-MILESTONE-AUDIT.md` — authoritative diagnosis of all three gaps with exact file/line references
- `.planning/REQUIREMENTS.md` F3 — canonical ghost color values for the README table
- `FuzzyClock.App/MainWindow.xaml.cs` — verified current state of `SaveSettings()` (line 499–533) and `GetCurrentSettingsSnapshot()` (line 377–404)
- `FuzzyClock.App/SettingsSnapshot.cs` — verified current state (LcdSize absent, LcdTheme/LcdUse24Hr/LcdShowSeconds present)
- `README.md` — verified current theme table (lines 38–44, Ghost column absent)

---

## Metadata

**Confidence breakdown:**
- Gap identification: HIGH — all three gaps confirmed by direct code inspection against audit findings
- Fix values: HIGH — ghost color values sourced from REQUIREMENTS.md F3 spec; code patterns sourced from existing identical usages in the same file
- Test impact: HIGH — no new tests required; test count stays at 245

**Research date:** 2026-03-11
**Valid until:** Stable — these are point-in-time code gaps, no staleness risk
