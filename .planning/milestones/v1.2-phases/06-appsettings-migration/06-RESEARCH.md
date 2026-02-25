# Phase 6: AppSettings Migration - Research

**Researched:** 2026-02-25
**Domain:** C# record type migration + System.Text.Json deserialization + DispatcherTimer guard
**Confidence:** HIGH

---

## Summary

Phase 6 is the foundation layer for all v1.2 stats work. Its sole job is to make `AppSettings` safe to extend with two new fields (`StatsVisible` and `StatsIntervalSeconds`), and to ensure that loading any previous settings file — or a corrupted one — never produces a zero-interval `DispatcherTimer`.

The current `AppSettings` is a positional record: `record AppSettings(double Left, double Top, int FontSize)`. Positional records in .NET 10 fill missing constructor parameters with C# type defaults when deserialized by `System.Text.Json`. Adding `int StatsIntervalSeconds` as a new positional parameter means any v1.1 `settings.json` (which does not contain that field) will deserialize it as `0`. A `DispatcherTimer` with `Interval = TimeSpan.FromSeconds(0)` fires thousands of times per second, spiking CPU — the critical bug this phase prevents.

The fix has two parts: (1) convert `AppSettings` from a positional record to an init-property record with explicit property defaults, and (2) add a guard clause in `SettingsService.Load()` to coerce any `StatsIntervalSeconds <= 0` to the default value. The init-property conversion is the primary fix — it means missing JSON fields use the declared C# default rather than the C# type default. The guard is a belt-and-suspenders defense against files that explicitly contain `0`. Both changes are small, localized, and independently verifiable.

**Primary recommendation:** Convert `AppSettings` to an init-property record with explicit defaults, add the two new fields with safe defaults, update `SettingsService.Defaults()` to object-initializer syntax, and add a single guard clause in `SettingsService.Load()`. No other files need changes in this phase.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| STAT-05 | Stats visibility and update interval persist to settings.json and restore on launch | The AppSettings record change (adding `StatsVisible` and `StatsIntervalSeconds` with correct defaults) and the `SettingsService.Load()` guard are the direct persistence layer foundation. Full round-trip (read, write, restart) is enabled once these fields exist in the record. |
</phase_requirements>

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `System.Text.Json` | In-box .NET 10 | Deserialize/serialize `AppSettings` | Already used; zero additional dependencies; handles init-property records natively |
| C# init-property record | C# 9+ / .NET 10 | Record type with default property values | The correct pattern for JSON-deserialized settings objects with optional fields |

### Supporting

None. This phase adds no new NuGet packages or libraries.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Init-property record | Keep positional record + secondary constructor | Positional records cannot have default parameter values in the positional syntax; workarounds are complex. Init-property record is cleaner and fully supported. |
| Init-property record | Keep positional record + catch on load | The existing `catch { return Defaults(); }` already handles total deserialization failure. But it does NOT handle partial success where `StatsIntervalSeconds` silently becomes `0`. A guard is still required even with that catch. |
| Guard in `SettingsService.Load()` only | Guard only, keep positional record | A load-time guard alone is sufficient to prevent the zero-interval timer bug, but the positional record still silently defaults new fields to `false`/`0` in any future loading scenario. The init-property approach prevents the entire class of problems for all future fields. |

**Installation:** No new packages required.

---

## Architecture Patterns

### Recommended Project Structure

No new files. Two existing files change:

```
FuzzyClock.App/
├── AppSettings.cs          # Convert to init-property record; add two fields
└── SettingsService.cs      # Update Defaults(); add guard in Load()
```

### Pattern 1: Init-Property Record with Explicit Defaults

**What:** Replace the positional record syntax with a non-positional record using `{ get; init; }` properties that carry explicit C# default values.

**When to use:** Any time `System.Text.Json` must deserialize into a record where some JSON properties may be absent (forward or backward compatibility scenarios).

**Example:**

```csharp
// BEFORE (positional record — v1.1)
// Source: current AppSettings.cs
public record AppSettings(double Left, double Top, int FontSize);

// AFTER (init-property record — v1.2)
// Source: ARCHITECTURE.md AppSettings section; confirmed by
// https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/immutability
public record AppSettings
{
    public double Left               { get; init; } = -1;
    public double Top                { get; init; } = 20;
    public int    FontSize           { get; init; } = 32;
    public bool   StatsVisible       { get; init; } = false;
    public int    StatsIntervalSeconds { get; init; } = 3;
}
```

`System.Text.Json` populates each property by matching JSON key names (case-insensitive). Missing keys retain the declared C# default. Present keys overwrite the default. This gives correct behavior for both old JSON (missing `StatsVisible`/`StatsIntervalSeconds` → use defaults) and new JSON (all fields present → use file values).

### Pattern 2: Guard Clause in `SettingsService.Load()`

**What:** After deserialization, inspect any field where the type default (`0`, `false`) is an illegal value at runtime, and replace it with the safe default.

**When to use:** When the type default of a field is a valid C# value but an illegal application value — specifically `int` fields that are 0 when only positive values are valid.

**Example:**

```csharp
// Source: PITFALLS.md Pitfall 2; confirmed against current SettingsService.cs
public static AppSettings Load()
{
    try
    {
        if (!File.Exists(FilePath)) return Defaults();
        var json = File.ReadAllText(FilePath);
        var loaded = JsonSerializer.Deserialize<AppSettings>(json) ?? Defaults();
        // Guard: StatsIntervalSeconds=0 means the field was absent in old JSON
        // or the file is corrupted. A zero-interval DispatcherTimer fires at
        // maximum rate and causes a CPU spike.
        if (loaded.StatsIntervalSeconds <= 0)
            loaded = loaded with { StatsIntervalSeconds = Defaults().StatsIntervalSeconds };
        return loaded;
    }
    catch { return Defaults(); }
}
```

### Pattern 3: Updated `SettingsService.Defaults()`

The existing `Defaults()` uses positional constructor syntax: `new(-1, 20, 32)`. After the record conversion, it must use object-initializer syntax:

```csharp
// Source: current SettingsService.cs + ARCHITECTURE.md AppSettings section
public static AppSettings Defaults() => new()
{
    Left = -1, Top = 20, FontSize = 32,
    StatsVisible = false, StatsIntervalSeconds = 3
};
```

`StatsVisible = false` means stats are hidden by default on first launch. This matches the success criterion: "Widget launches with a freshly deleted settings.json and StatsVisible defaults to false."

### Pattern 4: `with` Expression Compatibility

The existing `SettingsService.Clamp()` uses `s with { Left = left, Top = top }`. Init-property records fully support `with` expressions — this call site does not change. Verify: `Clamp()` still compiles and returns the expected type after the record conversion.

```csharp
// This call site in SettingsService.Clamp() is unchanged — verify it still compiles:
return s with { Left = left, Top = top };
```

### Anti-Patterns to Avoid

- **Keeping positional record + adding secondary constructor:** Positional records expose their primary constructor, and `System.Text.Json` uses it for deserialization. A secondary constructor is not used by the deserializer. This does not solve the defaults problem.
- **Setting `StatsIntervalSeconds` default to `3` in the guard but not in `Defaults()`:** The `Defaults()` method is the single source of truth for default values. Hard-coding `3` in the guard creates a second definition that can drift. Use `Defaults().StatsIntervalSeconds` in the guard, not a literal.
- **Guarding `StatsVisible` against `false`:** `StatsVisible = false` is both a valid file value (user has hidden stats) and the correct first-run default. It cannot be distinguished from "field was absent." Do not attempt to guard it — accept `false` as the default, which matches success criterion 1.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON backward compatibility | Custom version-stamped migration runner | Init-property record defaults + single guard clause | The default-value mechanism in `System.Text.Json` handles the missing-field case automatically; a guard handles the explicit-zero case |
| Settings schema validation | A full schema validator | Guard clause in `Load()` for the single dangerous field | Only `StatsIntervalSeconds` has a dangerous type default (0); over-engineering schema validation for a 5-field record adds complexity for no benefit |

**Key insight:** `System.Text.Json`'s property-matching behavior for init-property records handles the upgrade path automatically. The only hand-rolled piece is the guard for the one field (`StatsIntervalSeconds`) where the type default (`0`) is a runtime-dangerous value.

---

## Common Pitfalls

### Pitfall 1: Zero-Interval Timer from `StatsIntervalSeconds = 0`

**What goes wrong:** A v1.1 `settings.json` does not contain `StatsIntervalSeconds`. If `AppSettings` remains a positional record, deserialization fills the missing parameter with `0`. Later phases construct `new DispatcherTimer { Interval = TimeSpan.FromSeconds(0) }` — a zero-interval timer fires at maximum message-loop frequency, thousands of times per second. CPU spikes immediately.

**Why it happens:** Positional record constructor parameters fill with C# type defaults when the matching JSON key is absent. `int` defaults to `0`. `TimeSpan.FromSeconds(0)` is `TimeSpan.Zero`. `DispatcherTimer` with `Interval = TimeSpan.Zero` is legal but pathological.

**How to avoid:** Two defenses together:
1. Use an init-property record with `StatsIntervalSeconds { get; init; } = 3` — missing JSON key uses `3`, not `0`.
2. Add guard in `Load()`: `if (loaded.StatsIntervalSeconds <= 0) loaded = loaded with { StatsIntervalSeconds = Defaults().StatsIntervalSeconds };`

**Warning signs:** CPU fan spins up immediately on first launch after upgrading from v1.1. `DispatcherTimer.Interval` shows `TimeSpan.Zero` in debugger.

**Source:** PITFALLS.md Pitfall 2; confirmed against `SettingsService.cs` current source (the existing `catch { return Defaults(); }` does NOT cover this case — partial deserialization succeeds, returning a valid record with `StatsIntervalSeconds = 0`).

### Pitfall 2: Positional Record `with` Expression on `Clamp()` Still Compiles but Behaves Differently

**What goes wrong:** After converting to an init-property record, `s with { Left = left, Top = top }` in `Clamp()` still compiles. But if the type was also changed in a way that dropped the positional constructor (it is — the positional syntax is being replaced), any call site using positional construction `new AppSettings(-1, 20, 32)` will fail to compile.

**How to avoid:** Search for all `new AppSettings(...)` positional construction calls and update them to object-initializer syntax. In this project, the only such call is `Defaults()` in `SettingsService.cs`. Confirm there are no others.

**Current call sites:** `Defaults() => new(-1, 20, 32)` in `SettingsService.cs` — this is the only positional construction site (confirmed by reading the source files). `MainWindow.xaml.cs` constructs `AppSettings` via object initializer in `SaveSettings()`.

### Pitfall 3: `StatsVisible` Default — Don't Guard Against `false`

**What goes wrong:** A developer sees `bool StatsVisible { get; init; } = false` and worries that an old settings.json will wrongly give `false` to users who want stats on first run. They add a guard: `if (!loaded.StatsVisible) loaded = loaded with { StatsVisible = true }` — this destroys the ability for users to save `StatsVisible = false`.

**How to avoid:** Accept that `false` is both the correct first-run default AND a valid user preference. The success criteria explicitly state: "Widget launches with a freshly deleted settings.json and StatsVisible defaults to false." Only guard fields where the type default is a dangerous runtime value (like `0` for an interval).

---

## Code Examples

Verified patterns from project source and official docs:

### Final `AppSettings.cs`

```csharp
// Source: current AppSettings.cs (converted) + ARCHITECTURE.md AppSettings section
// System.Text.Json immutability docs: https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/immutability
namespace FuzzyClock.App;

public record AppSettings
{
    public double Left               { get; init; } = -1;
    public double Top                { get; init; } = 20;
    public int    FontSize           { get; init; } = 32;
    public bool   StatsVisible       { get; init; } = false;
    public int    StatsIntervalSeconds { get; init; } = 3;
}
// Left = -1 is the sentinel for "no saved position — use PositionTopRight() fallback"
```

### Updated `SettingsService.Defaults()`

```csharp
// Source: current SettingsService.cs (updated to object-initializer syntax)
public static AppSettings Defaults() => new()
{
    Left = -1, Top = 20, FontSize = 32,
    StatsVisible = false, StatsIntervalSeconds = 3
};
```

### Updated `SettingsService.Load()` with Guard

```csharp
// Source: current SettingsService.cs + PITFALLS.md Pitfall 2
public static AppSettings Load()
{
    try
    {
        if (!File.Exists(FilePath)) return Defaults();
        var json = File.ReadAllText(FilePath);
        var loaded = JsonSerializer.Deserialize<AppSettings>(json) ?? Defaults();
        // Guard: StatsIntervalSeconds=0 means the field was absent in an old settings
        // file or the file is corrupted. A zero-interval DispatcherTimer fires at
        // maximum rate, causing a CPU spike. Replace with the safe default.
        if (loaded.StatsIntervalSeconds <= 0)
            loaded = loaded with { StatsIntervalSeconds = Defaults().StatsIntervalSeconds };
        return loaded;
    }
    catch { return Defaults(); }
}
```

### `SettingsService.Clamp()` — Unchanged, Verify Compiles

```csharp
// Source: current SettingsService.cs — this call site does NOT change
// Verify: compiles correctly after record conversion (with-expression is supported on init-property records)
return s with { Left = left, Top = top };
```

### Confirming `MainWindow.SaveSettings()` Construction Pattern

Looking ahead to Phase 9 (full persistence), `SaveSettings()` in `MainWindow.xaml.cs` constructs `AppSettings` via object initializer. Confirm the existing `SaveSettings()` uses object initializer syntax (not positional), which will allow adding the two new fields without breaking the current build:

```csharp
// Phase 9 will extend this to:
SettingsService.Save(new AppSettings
{
    Left = Left, Top = Top,
    FontSize = _currentFontSize,
    StatsVisible = _statsVisible,
    StatsIntervalSeconds = _currentStatsInterval
});
// Phase 6 does NOT change MainWindow.xaml.cs — that is Phase 9's job.
// Phase 6 only needs AppSettings.cs and SettingsService.cs to be correct.
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Positional record `record AppSettings(double, double, int)` | Init-property record with explicit defaults | v1.2 Phase 6 | Missing JSON fields use declared defaults instead of C# type defaults |
| `Defaults() => new(-1, 20, 32)` | `Defaults() => new() { Left = -1, Top = 20, FontSize = 32, StatsVisible = false, StatsIntervalSeconds = 3 }` | v1.2 Phase 6 | Object-initializer syntax required after positional constructor is removed |
| No guard in `Load()` | Guard for `StatsIntervalSeconds <= 0` | v1.2 Phase 6 | Prevents zero-interval timer CPU spike on upgrade from v1.1 |

**Deprecated/outdated:**
- Positional record syntax for `AppSettings`: replaced by init-property record. The positional primary constructor `AppSettings(double Left, double Top, int FontSize)` will be removed.

---

## Open Questions

1. **Does `MainWindow.xaml.cs` use positional construction for `AppSettings`?**
   - What we know: `SettingsService.Defaults()` uses `new(-1, 20, 32)` (confirmed). `SettingsService.Clamp()` uses `with` expression (confirmed).
   - What's unclear: Whether `MainWindow.xaml.cs` constructs `AppSettings` with positional syntax anywhere.
   - Recommendation: Grep `MainWindow.xaml.cs` for `new AppSettings(` before making the change. If found, update those sites to object-initializer syntax. Based on architecture research, `SaveSettings()` in `MainWindow` already uses object-initializer syntax — but verify before editing.

2. **Should `StatsVisible` default to `false` or `true`?**
   - What we know: Success criterion 1 explicitly states "StatsVisible defaults to false" on first launch. STATE.md roadmap decision also notes stats hidden by default on first run.
   - What's unclear: Nothing — `false` is confirmed.
   - Recommendation: Use `false` as declared in the code examples above.

3. **Valid values for `StatsIntervalSeconds` — only 1, 3, 10?**
   - What we know: The additional context states "Valid values for StatsIntervalSeconds: 1, 3, 10 only." The guard only needs to prevent `0` (the dangerous case). Values like `5` or `7` would be unusual but are not dangerous.
   - What's unclear: Whether the guard should also reject values not in {1, 3, 10} and replace with `3`.
   - Recommendation: For Phase 6, guard only against `<= 0`. The interval selector in Phase 9 will enforce {1, 3, 10} via menu choices. A value of `5` in a hand-edited settings.json is odd but not dangerous, and is out of scope for this phase.

---

## Verification Checklist (for Planner)

The phase has four discrete success criteria. Each maps to a specific verifiable state:

| Success Criterion | What to Verify | How |
|-------------------|----------------|-----|
| 1. Fresh settings.json (deleted) → StatsVisible=false, StatsIntervalSeconds=3 | `Defaults()` returns correct values; `Load()` calls `Defaults()` when file absent | Read `Defaults()` output; confirm no file → returns `{ StatsVisible=false, StatsIntervalSeconds=3 }` |
| 2. v1.1 settings.json (no stats fields) → loads without throwing, correct defaults | Init-property record uses declared defaults for missing fields; guard not triggered | Deserialize `{"Left":100,"Top":100,"FontSize":32}` → `StatsVisible=false, StatsIntervalSeconds=3` |
| 3. StatsVisible=true + StatsIntervalSeconds=10 round-trip across restart | `Save()` serializes all fields; `Load()` reads them back correctly | Save settings, read file contents, confirm all fields present; reload confirms values |
| 4. StatsIntervalSeconds=0 in file → loads with StatsIntervalSeconds=3 | Guard clause in `Load()` fires and replaces `0` with `Defaults().StatsIntervalSeconds` | Deserialize `{"Left":0,"Top":0,"FontSize":32,"StatsVisible":false,"StatsIntervalSeconds":0}` → result has `StatsIntervalSeconds=3` |

---

## Sources

### Primary (HIGH confidence)

- Current `AppSettings.cs` (read directly): `C:\src\gsd1\FuzzyClock.App\AppSettings.cs` — confirms positional record shape `record AppSettings(double Left, double Top, int FontSize)`
- Current `SettingsService.cs` (read directly): `C:\src\gsd1\FuzzyClock.App\SettingsService.cs` — confirms `Load()` structure, `Defaults()` positional call, `Clamp()` `with` expression usage
- `System.Text.Json` immutability / positional record deserialization: https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/immutability — positional record constructor parameters are optional (type defaults used when missing from JSON)
- `System.Text.Json` required properties: https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/required-properties — confirms .NET 10 treats all constructor parameters as optional unless `RespectRequiredConstructorParameters = true`
- ARCHITECTURE.md `AppSettings Record Changes` section — init-property record pattern with exact code example
- PITFALLS.md Pitfall 2 — zero-interval timer root cause, guard clause pattern, both approach A and B documented

### Secondary (MEDIUM confidence)

- SUMMARY.md `Phase 1: AppSettings Migration and Settings Plumbing` — phase rationale, confirmed by primary sources above
- STATE.md `Accumulated Context / Decisions` — `[v1.2 Roadmap]` decision: "AppSettings positional record must be converted to init-property record before any new fields are added"

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — `System.Text.Json` init-property record behavior verified against official docs; current `AppSettings.cs` and `SettingsService.cs` read directly
- Architecture: HIGH — two-file change with exact code examples derived from current source; no speculative patterns
- Pitfalls: HIGH — zero-interval timer root cause fully documented in PITFALLS.md with official source; confirmed against current `SettingsService.Load()` which does NOT guard against partial deserialization success with `StatsIntervalSeconds=0`

**Research date:** 2026-02-25
**Valid until:** 2026-03-27 (stable — .NET 10 and `System.Text.Json` behavior for init-property records is not changing)
