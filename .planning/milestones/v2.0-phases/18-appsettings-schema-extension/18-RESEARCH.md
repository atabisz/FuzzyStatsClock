# Phase 18: AppSettings Schema Extension — Research

**Researched:** 2026-02-27
**Domain:** C# init-property record extension, System.Text.Json deserialization backward compatibility, WPF settings persistence
**Confidence:** HIGH

---

## Summary

Phase 18 is a pure data-layer change with zero UI surface. It adds two fields to the existing `AppSettings` record — `AccentColor` (string, hex) and `Opacity` (double) — and extends `SettingsService` with the corresponding defaults and load-time guards. No XAML, no event handlers, no brushes, no timers. Every subsequent v2.0 phase reads from or writes to these fields, so the schema must be locked before any other work starts.

The existing `AppSettings.cs` is a `record` using `init`-property syntax, serialized and deserialized by `System.Text.Json`. The same pattern is validated and stable across v1.1–v1.9 (13 fields, all `{ get; init; }` with explicit defaults). Adding two more fields follows the identical pattern. The only new consideration specific to Phase 18 is that `double`'s C# type default is `0.0`, which would produce an invisible widget on first launch after upgrade from v1.9 if the init default is not set to `1.0`. The `AccentColor` field as a `string` must also have a non-null init default to prevent a `NullReferenceException` during hex parsing.

`SettingsService.Load()` already contains one guard (for `StatsIntervalSeconds <= 0`) — Phase 18 adds two parallel guards using the same `with`-expression pattern. `SettingsService.Defaults()` is updated to include the two new fields. Both changes are additive; no existing code in `SettingsService.cs` is restructured.

**Primary recommendation:** Add both fields with correct init defaults (`"#FFFFFFFF"` and `1.0`), update `Defaults()`, add two load-time guards to `Load()`, verify round-trip JSON, verify backward compat with an absent-fields settings file. This phase is complete when all four success criteria pass.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| THEME-04 | Active theme (preset name or custom hex color) persists to settings.json and restores on launch | `AccentColor` field as `string` with init default `"#FFFFFFFF"` + null/empty guard in `Load()` enables the persistence infrastructure; later phases call `SaveSettings()` with the live value and `ApplySettings()` reads it back |
| OPAC-04 | Opacity setting persists to settings.json and restores on launch | `Opacity` field as `double` with init default `1.0` + `<= 0.0` guard in `Load()` covers the v1.9 upgrade path and the malformed-JSON regression described in success criterion 4 |
</phase_requirements>

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `System.Text.Json` | in-box (.NET 10) | Serialize and deserialize `AppSettings` record | Already used in the project since v1.1; no configuration required; init-property records with explicit defaults work natively — absent JSON fields use the init default value |
| `AppSettings` record (`init`-property pattern) | C# 13, .NET 10 | Schema definition for all persisted widget state | Established pattern in this project across all prior phases; `with`-expression in `Load()` guards produces a clean immutable update |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `System.IO.File` | in-box (.NET 10) | Read/write settings.json via `SettingsService` | Already used — no change needed to the write path; only `Load()` and `Defaults()` and the record itself change |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `string AccentColor` (hex) | `System.Windows.Media.Color` struct | `System.Text.Json` cannot natively serialize `System.Windows.Media.Color` — the struct has 9 properties including `ColorContext` (an object). Storing as hex string is human-readable, compact, and round-trips via `ColorConverter.ConvertFromString()` with no custom converter needed |
| `string AccentColor` (hex) | Separate `byte AccentR`, `AccentG`, `AccentB` fields | Verbose; settings.json harder to read manually; three fields to keep in sync vs one |
| `double Opacity` | `float Opacity` | `UIElement.Opacity` is a `double`; matching types avoids implicit cast noise in `ApplySettings()` |

---

## Architecture Patterns

### Recommended Project Structure

No new files. Changes are confined to two existing files:

```
FuzzyClock.App/
├── AppSettings.cs       ← add 2 new init-property fields
└── SettingsService.cs   ← update Defaults(); add 2 guards in Load()
```

### Pattern 1: Init-Property Record Field Addition

**What:** Add a new field to the `AppSettings` record using the same `{ get; init; } = default` syntax as every existing field.

**When to use:** Every time a new persisted setting is introduced. This is the project's canonical pattern.

**Example (from the live codebase + research):**

```csharp
// AppSettings.cs — current state (v1.9)
public record AppSettings
{
    public double Left                 { get; init; } = -1;
    public double Top                  { get; init; } = 20;
    public int    FontSize             { get; init; } = 32;
    public bool   StatsVisible         { get; init; } = false;
    public int    StatsIntervalSeconds { get; init; } = 3;
    public bool   CpuVisible           { get; init; } = true;
    public bool   GpuVisible           { get; init; } = true;
    public bool   MemVisible           { get; init; } = true;
    public bool   PagVisible           { get; init; } = true;
    public bool   DialMode             { get; init; } = false;
    public bool   ShowHourTicks        { get; init; } = false;
    public bool   ShowMinuteDots       { get; init; } = false;
    public bool   ShowHourNumbers      { get; init; } = false;
    // NEW for Phase 18:
    public string AccentColor          { get; init; } = "#FFFFFFFF";
    public double Opacity              { get; init; } = 1.0;
}
```

**Why `"#FFFFFFFF"` for AccentColor:** Matches the existing hardcoded `Foreground="White"` in XAML — zero visual change for existing users on upgrade. `#FFFFFFFF` is ARGB (full alpha, white RGB).

**Why `1.0` for Opacity:** `double` type default is `0.0` — without an explicit init default of `1.0`, a v1.9 settings.json (missing the `Opacity` field) would deserialize `Opacity` as `0.0`, producing an invisible widget. The init default of `1.0` is non-negotiable.

### Pattern 2: Load-Time Guard (With-Expression)

**What:** After deserialization, check for out-of-range or missing-field values and replace them with the safe default using a `with` expression.

**When to use:** For any field where the C# type default differs from the safe default (e.g., `double`'s type default is `0.0` but `1.0` is required for opacity), or where a malformed JSON file could write a sentinel value that would break the widget.

**Example (based on existing `StatsIntervalSeconds` guard pattern in `SettingsService.cs`):**

```csharp
public static AppSettings Load()
{
    try
    {
        if (!File.Exists(FilePath)) return Defaults();
        var json = File.ReadAllText(FilePath);
        var loaded = JsonSerializer.Deserialize<AppSettings>(json) ?? Defaults();

        // Existing guard (unchanged):
        if (loaded.StatsIntervalSeconds <= 0)
            loaded = loaded with { StatsIntervalSeconds = Defaults().StatsIntervalSeconds };

        // NEW Phase 18 guards:
        if (loaded.Opacity <= 0.0)
            loaded = loaded with { Opacity = Defaults().Opacity };
        if (string.IsNullOrWhiteSpace(loaded.AccentColor))
            loaded = loaded with { AccentColor = Defaults().AccentColor };

        return loaded;
    }
    catch { return Defaults(); }
}
```

**Why guard Opacity <= 0.0:** Covers two cases: (a) v1.9 settings.json missing the field — `System.Text.Json` would use the init default `1.0`, so the guard is a defense-in-depth layer; (b) malformed JSON that writes `"Opacity": 0.0` explicitly — maps directly to success criterion 4 ("a settings.json with Opacity=0.0 is corrected to 1.0 on load").

**Why guard AccentColor null/empty:** `string` type default is `null`, but the init default `"#FFFFFFFF"` protects the deserialization path. The guard is defense-in-depth against a settings.json that writes `"AccentColor": ""` or `"AccentColor": null` explicitly.

### Pattern 3: Defaults() Update

**What:** Add the two new fields to the `Defaults()` factory method.

**When to use:** Every time a new field is added to `AppSettings`.

**Example:**

```csharp
public static AppSettings Defaults() => new()
{
    Left = -1, Top = 20, FontSize = 32,
    StatsVisible = false, StatsIntervalSeconds = 3,
    CpuVisible = true, GpuVisible = true, MemVisible = true,
    PagVisible = true, DialMode = false,
    // NEW for Phase 18:
    AccentColor = "#FFFFFFFF",
    Opacity = 1.0
};
```

Note: `ShowHourTicks`, `ShowMinuteDots`, `ShowHourNumbers` are not in `Defaults()` in the current code (they use the init defaults implicitly). The new fields can follow the same approach (init defaults do the work) — but explicitly including them in `Defaults()` makes the intent visible and consistent with the other fields.

### Anti-Patterns to Avoid

- **Omitting init defaults:** Declaring `public double Opacity { get; init; }` without `= 1.0` relies on the C# type default (0.0) — invisible widget on upgrade. Always provide an explicit init default.
- **Storing Color as struct in AppSettings:** `System.Text.Json` cannot natively serialize `System.Windows.Media.Color`. Do not change `AccentColor` to `Color` type. Keep it as `string`.
- **Using `AccentColor = "#FFFFFF"` (6-digit) instead of `"#FFFFFFFF"` (8-digit ARGB):** Both work with `ColorConverter.ConvertFromString()`, but the `SaveSettings()` implementation in later phases will write the full ARGB hex. Use `#FFFFFFFF` as the standard format for consistency.
- **Calling `Defaults()` in guards without updating `Defaults()` first:** If `Defaults()` doesn't include the new fields, `Defaults().Opacity` returns `0.0` (init default), making the guard reset to the wrong value. Update `Defaults()` in the same commit as the record.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Backward-compat deserialization of absent fields | Custom `JsonConverter` with null-check logic | `init`-property record with explicit defaults | `System.Text.Json` uses the init default value for any absent JSON property — this is built-in behavior, no custom converter needed |
| Color value persistence | Custom hex encoder/decoder | `string` field with `ColorConverter.ConvertFromString()` (in later phases) | `ColorConverter` in `PresentationCore.dll` handles `#RRGGBB` and `#AARRGGBB`; the Phase 18 task is only to define the field shape, not to parse it |
| Settings file migration | Version numbering, migration scripts | Init default + load-time guard pattern | The `with`-expression guard in `Load()` is additive; no migration pipeline is needed for adding new fields with safe defaults |

**Key insight:** The init-property record pattern is specifically designed for this scenario — adding fields to a settings schema while remaining backward-compatible with existing files. The pattern has been validated across every prior phase in this project.

---

## Common Pitfalls

### Pitfall 1: Opacity Field C# Type Default Is 0.0 — Produces Invisible Widget on v1.9 Upgrade

**What goes wrong:** If `Opacity` is declared without `= 1.0`, a v1.9 settings.json (missing the `Opacity` field) deserializes to `Opacity = 0.0`. `ApplySettings()` in later phases sets `this.Opacity = 0.0`, making the widget fully transparent and effectively lost.

**Why it happens:** `double` C# type default is `0.0`. `System.Text.Json` uses the init default (not the type default) for absent fields, but only if an init default is specified. Without `= 1.0`, the init default IS the type default: `0.0`.

**How to avoid:** Declare `public double Opacity { get; init; } = 1.0;` — explicitly, not relying on any implicit default. Add the load-time guard `if (loaded.Opacity <= 0.0)` as defense-in-depth.

**Warning signs:** Widget invisible after first launch on a machine that had v1.9 settings.

### Pitfall 2: AccentColor Guard Not Needed for Normal Upgrade — But Required for Malformed JSON

**What goes wrong:** For a v1.9 settings.json (AccentColor absent), `System.Text.Json` correctly uses the init default `"#FFFFFFFF"`. The `null`/empty guard is only needed for a manually-edited or corrupted JSON file that explicitly writes `"AccentColor": null` or `"AccentColor": ""`.

**Why it matters:** Success criterion 2 requires that a freshly-deleted settings.json also produces the default values. This is handled by the `Defaults()` call in `Load()` when the file doesn't exist, combined with the init defaults on the record itself.

**How to avoid:** Keep the null/empty guard anyway — it adds one line and prevents a later `NullReferenceException` in `ColorConverter.ConvertFromString(null)`.

### Pitfall 3: ShowHourTicks / ShowMinuteDots / ShowHourNumbers Not in Defaults() — Phase 18 Doesn't Need to Fix This

**What goes wrong:** `SettingsService.Defaults()` in the current code does not include `ShowHourTicks`, `ShowMinuteDots`, or `ShowHourNumbers` — they implicitly use their init defaults (`false`). This is an existing inconsistency, not a Phase 18 bug.

**How to avoid:** Do not touch the existing `Defaults()` fields. Add only `AccentColor` and `Opacity` to `Defaults()`. Resist the temptation to "fix" the omitted dial fields — that would be scope creep and could affect Phase 17 behavior.

---

## Code Examples

Verified patterns from official sources and live codebase:

### Complete AppSettings.cs After Phase 18

```csharp
// Source: existing AppSettings.cs + Phase 18 additions
// System.Text.Json init-property record — absent JSON fields use init default value
namespace FuzzyClock.App;

public record AppSettings
{
    public double Left                 { get; init; } = -1;
    public double Top                  { get; init; } = 20;
    public int    FontSize             { get; init; } = 32;
    public bool   StatsVisible         { get; init; } = false;
    public int    StatsIntervalSeconds { get; init; } = 3;
    public bool   CpuVisible           { get; init; } = true;
    public bool   GpuVisible           { get; init; } = true;
    public bool   MemVisible           { get; init; } = true;
    public bool   PagVisible           { get; init; } = true;
    public bool   DialMode             { get; init; } = false;
    public bool   ShowHourTicks        { get; init; } = false;
    public bool   ShowMinuteDots       { get; init; } = false;
    public bool   ShowHourNumbers      { get; init; } = false;
    public string AccentColor          { get; init; } = "#FFFFFFFF";  // AARRGGBB hex; default = White
    public double Opacity              { get; init; } = 1.0;           // 0.0–1.0; default = fully opaque
}
// Left = -1 is the sentinel for "no saved position — use PositionTopRight() fallback"
```

### SettingsService.Load() After Phase 18 (Guards Only)

```csharp
// Source: existing SettingsService.cs Load() + Phase 18 guard additions
public static AppSettings Load()
{
    try
    {
        if (!File.Exists(FilePath)) return Defaults();
        var json = File.ReadAllText(FilePath);
        var loaded = JsonSerializer.Deserialize<AppSettings>(json) ?? Defaults();

        // Existing guard (unchanged):
        if (loaded.StatsIntervalSeconds <= 0)
            loaded = loaded with { StatsIntervalSeconds = Defaults().StatsIntervalSeconds };

        // NEW: Opacity guard — prevents invisible-widget regression on v1.9 upgrade
        // (C# type default for double is 0.0; a missing field or "Opacity":0.0 from malformed JSON
        // would make the widget fully transparent with no way to recover without deleting settings)
        if (loaded.Opacity <= 0.0)
            loaded = loaded with { Opacity = Defaults().Opacity };

        // NEW: AccentColor guard — prevents NullReferenceException in ColorConverter.ConvertFromString
        if (string.IsNullOrWhiteSpace(loaded.AccentColor))
            loaded = loaded with { AccentColor = Defaults().AccentColor };

        return loaded;
    }
    catch { return Defaults(); }
}
```

### SettingsService.Defaults() After Phase 18

```csharp
// Source: existing SettingsService.cs Defaults() + Phase 18 additions
public static AppSettings Defaults() => new()
{
    Left = -1, Top = 20, FontSize = 32,
    StatsVisible = false, StatsIntervalSeconds = 3,
    CpuVisible = true, GpuVisible = true, MemVisible = true,
    PagVisible = true, DialMode = false,
    AccentColor = "#FFFFFFFF",
    Opacity = 1.0
};
```

### Round-Trip Verification Pattern (Manual Test Steps)

```
Scenario A — v1.9 settings.json (missing new fields):
  1. Write: {"Left":100,"Top":50,"FontSize":32,"StatsVisible":false,"StatsIntervalSeconds":3,
             "CpuVisible":true,"GpuVisible":true,"MemVisible":true,"PagVisible":true,
             "DialMode":false,"ShowHourTicks":false,"ShowMinuteDots":false,"ShowHourNumbers":false}
  2. Call SettingsService.Load()
  3. Assert: loaded.AccentColor == "#FFFFFFFF"
  4. Assert: loaded.Opacity == 1.0

Scenario B — Freshly deleted settings.json:
  1. Ensure FilePath does not exist
  2. Call SettingsService.Load()
  3. Assert: returns Defaults() → AccentColor == "#FFFFFFFF", Opacity == 1.0

Scenario C — Malformed JSON with Opacity=0.0:
  1. Write: {..., "AccentColor":"#FFFFFFFF", "Opacity":0.0}
  2. Call SettingsService.Load()
  3. Assert: loaded.Opacity == 1.0  (guard corrected it)

Scenario D — Non-default values round-trip:
  1. Write: {..., "AccentColor":"#FFFFBF00", "Opacity":0.75}
  2. Call SettingsService.Load()
  3. Assert: loaded.AccentColor == "#FFFFBF00"
  4. Assert: loaded.Opacity == 0.75
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `JsonProperty` attribute-based deserialization (Newtonsoft.Json) | `System.Text.Json` init-property record (in-box, no NuGet) | v1.1 of this project | No attributes needed; init defaults handle absent fields natively |
| Manual file versioning for settings schema evolution | Init default + load-time guard per field | v1.5 (StatsIntervalSeconds guard added) | Additive and backward-compatible; no migration scripts |

**Deprecated/outdated:**
- Newtonsoft.Json: not used in this project; `System.Text.Json` is the standard for new .NET projects.

---

## Open Questions

1. **Should `ShowHourTicks`, `ShowMinuteDots`, `ShowHourNumbers` be added to `Defaults()` for consistency?**
   - What we know: They are omitted from the current `Defaults()` but have `init` defaults of `false` on the record.
   - What's unclear: Whether this inconsistency was intentional or an oversight in Phase 16.
   - Recommendation: Do NOT change them in Phase 18. The scope is `AccentColor` and `Opacity` only. Flag this as a future cleanup item if desired.

2. **`AccentColor` field name: `AccentColor` vs `AccentColorHex`?**
   - ARCHITECTURE.md uses `AccentColor` (no `Hex` suffix). STACK.md uses `AccentColorHex`. Both work identically; the suffix is stylistic.
   - What's unclear: No authoritative decision was made in prior research.
   - Recommendation: Use `AccentColor` (no suffix) — shorter, matches the field's conceptual role ("the accent color"), and is consistent with how `StatsIntervalSeconds` is named (not `StatsIntervalSecondsInt`). The hex format is a storage detail, not a semantic distinction.

3. **`Opacity` field name: `Opacity` vs `WindowOpacity`?**
   - ARCHITECTURE.md uses `Opacity` in `AppSettings`; `_windowOpacity` as the backing field in `MainWindow`.
   - Recommendation: Use `Opacity` in `AppSettings` (no `Window` prefix — the record doesn't know it's a window opacity). The `Window` qualification belongs in `MainWindow.xaml.cs`.

---

## Sources

### Primary (HIGH confidence)

- `C:/src/FuzzyStatsClock/FuzzyClock.App/AppSettings.cs` — live v1.9 record with 13 init-property fields; inspected 2026-02-27
- `C:/src/FuzzyStatsClock/FuzzyClock.App/SettingsService.cs` — live Load()/Save()/Defaults()/Clamp(); existing guard pattern verified; inspected 2026-02-27
- `.planning/research/ARCHITECTURE.md` — Phase 18 field definitions, `Defaults()` update, `Load()` guard pattern; researched 2026-02-27
- `.planning/research/PITFALLS.md` — Pitfall 5 (Opacity=0 invisible widget) and Pitfall 10 (hex string persistence); researched 2026-02-27
- `.planning/research/STACK.md` — AppSettings record extension, why hex string not struct; researched 2026-02-27
- `.planning/research/SUMMARY.md` — Phase 1 rationale ("AppSettings schema must be locked first"), backward-compat requirements; researched 2026-02-27

### Secondary (MEDIUM confidence)

- `System.Text.Json` init-property record absent-field behavior — inferred from existing `AppSettings.cs` pattern validated across v1.1–v1.9; consistent with official `System.Text.Json` docs on `required` vs optional init properties
- Official `System.Text.Json` docs: https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/overview — init-property handling confirmed

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — `System.Text.Json` init-property pattern is confirmed by 13 existing fields across multiple project milestones; no new libraries; no new APIs
- Architecture: HIGH — `AppSettings.cs` and `SettingsService.cs` read directly; exact change set is known; `with`-expression guard pattern already present for `StatsIntervalSeconds`
- Pitfalls: HIGH — the two critical pitfalls (Opacity=0, AccentColor null) are documented in PITFALLS.md with official source references and verified by codebase inspection

**Research date:** 2026-02-27
**Valid until:** 2026-03-29 (30 days — stable, in-box .NET 10 APIs with no external dependencies)
