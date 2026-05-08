# Phase 66: AppSettings Foundation - Research

**Researched:** 2026-03-27
**Domain:** C# record types, System.Text.Json, MSTest 4.0.1 — data model extension with validation and tests
**Confidence:** HIGH

## Summary

Phase 66 is a pure data-model phase: add one integer field (`GhostFadeRadiusPx`) to `AppSettings`, extend `SettingsService.Validate()` with a range clamp, include it in `Defaults()` and `ResetToDefaults()` paths, and cover it with four MSTest tests. No WPF, no Win32, no behavior changes land here — the phase is deliberately inert to the running widget.

The project has already done this exact pattern many times (LcdStyle, ProcessCountThresholdPercent, BatteryAlertThresholdPercent, TextStyle, DateFormat). Every prior field addition follows the same four-step formula: add init-property to `AppSettings.cs`, add entry to `Defaults()` in `SettingsService.cs`, add guard in `Validate()`, add tests in `AppSettingsTests.cs` and/or `SettingsServiceTests.cs`. Phase 66 follows that formula exactly.

The only subtlety is the init-property default mechanic: `AppSettings` uses `{ get; init; } = <value>` on every field, which means absent JSON fields deserialize to the declared default, NOT the C# type default. For `GhostFadeRadiusPx = 80`, an old settings file that lacks the field will deserialize to 80, not 0. This is the same mechanism that makes `UptimeVisible = true` survive an old file. The validate guard is a secondary safety net for out-of-range values written by a manually edited file or future bugs.

**Primary recommendation:** Add `GhostFadeRadiusPx` as a `{ get; init; } = 80` init-property in `AppSettings.cs`; clamp to range 20–200 in `Validate()`; include in `Defaults()`; write four focused MSTest methods (round-trip, absent-field, validate-low, validate-high).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PROX-12 | AppSettings JSON round-trip test covers `GhostFadeRadiusPx`; absent-field test verifies 80px init default | Existing `AppSettingsTests.cs` pattern with `RoundTrip_FullyPopulated_AllFieldsMatch` + absent-field tests; init-property `= 80` ensures correct JSON default behavior |
| PROX-08 | When radius slider is at minimum (20px), behavior matches current instant-snap ghost mode exactly (backward-compat path) | Range 20–200 confirmed from REQUIREMENTS.md; `Validate()` clamps -1 → 20, 999 → 200; the zero-radius compat path in Phase 67 uses this field but the field itself just needs a valid persisted value |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| System.Text.Json | .NET 10 BCL | JSON serialization of `AppSettings` | Already used throughout project; no third-party deps |
| MSTest | 4.0.1 | Unit testing | Already used in both test projects |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `[TestClass]` / `[TestMethod]` / `[DataRow]` | MSTest 4.0.1 | Test structure | All test classes in this project |

**Installation:** No new packages needed. All dependencies already present.

## Architecture Patterns

### Recommended Project Structure

No new files needed. All changes land in existing files:

```
FuzzyClock.App/
├── AppSettings.cs           — ADD: GhostFadeRadiusPx init-property
└── SettingsService.cs       — ADD: Defaults() entry, Validate() guard

FuzzyClock.App.Tests/
├── AppSettingsTests.cs      — ADD: round-trip assertion + absent-field test
└── SettingsServiceTests.cs  — ADD: Validate clamp tests (low + high)
```

### Pattern 1: Init-Property with Non-Default Default

**What:** `AppSettings` uses `{ get; init; } = <value>` on every field. When `System.Text.Json` deserializes JSON that lacks a field, it leaves the init-property at its declared default, NOT the C# type default (0 for int, false for bool). This is the project's core mechanism for backward-compatible field additions.

**When to use:** Every new `AppSettings` field must use this pattern — never a bare `{ get; init; }` without `= <value>` when the desired default differs from the C# type default.

**Example (from AppSettings.cs):**
```csharp
// Source: AppSettings.cs (existing pattern)
public bool UptimeVisible { get; init; } = true;   // init default = true, not false
public int  BackdropOpacityPercent { get; init; } = 35;  // init default = 35, not 0

// NEW field follows the same pattern:
public int GhostFadeRadiusPx { get; init; } = 80;
```

### Pattern 2: Validate() Clamp Guard

**What:** `Validate()` is a pure static method (no I/O, no WPF) that applies safety clamps to deserialized values. Called from `Load()` after deserialization. For range-bounded integers, use `Math.Clamp()`. For string enumerations, use an allowlist array + `.Contains()`.

**When to use:** Every field that has a restricted valid range must have a guard in `Validate()`.

**Example (from SettingsService.cs — analogous integer clamp):**
```csharp
// Source: SettingsService.cs (existing pattern using record `with`)
if (loaded.StatsIntervalSeconds <= 0)
    loaded = loaded with { StatsIntervalSeconds = Defaults().StatsIntervalSeconds };

// For GhostFadeRadiusPx, use Math.Clamp — cleaner than two branches for a bounded range:
if (loaded.GhostFadeRadiusPx < 20 || loaded.GhostFadeRadiusPx > 200)
    loaded = loaded with { GhostFadeRadiusPx = Defaults().GhostFadeRadiusPx };
```

### Pattern 3: Defaults() Entry

**What:** `Defaults()` returns a fully populated `AppSettings` using object initializer syntax. Every new field MUST be listed here — if omitted, `Defaults()` returns an instance with the C# type default for that field, which may differ from the intended app default.

**When to use:** Every new field, always.

**Example (from SettingsService.cs):**
```csharp
// Source: SettingsService.cs Defaults() method
public static AppSettings Defaults() => new()
{
    // ... existing fields ...
    BackdropOpacityPercent = 35,   // explicit, not relying on init default
    // ADD:
    GhostFadeRadiusPx = 80,
};
```

### Pattern 4: Round-Trip Test in AppSettingsTests.cs

**What:** `RoundTrip_FullyPopulated_AllFieldsMatch()` is the project's canonical round-trip test. It constructs a fully populated instance with non-default values, serializes to JSON, deserializes, and asserts every field matches. New fields MUST be added to this test — an omitted field causes a silent gap in coverage.

**Example (from AppSettingsTests.cs — how to extend the existing test):**
```csharp
// In RoundTrip_FullyPopulated_AllFieldsMatch:
var original = new AppSettings
{
    // ... existing fields ...
    GhostFadeRadiusPx = 120,   // non-default value
};
// After deserializing:
Assert.AreEqual(original.GhostFadeRadiusPx, result.GhostFadeRadiusPx, "GhostFadeRadiusPx");
```

### Pattern 5: Absent-Field Test

**What:** A separate `[TestMethod]` deserializes a minimal JSON string (e.g., `{"FontSize":32}`) and asserts the new field equals its init default. This documents and protects the backward-compat contract.

**Example (from AppSettingsTests.cs — exact model for new test):**
```csharp
// Source: AppSettingsTests.cs existing absent-field tests
[TestMethod]
public void Deserialize_MissingGhostFadeRadiusPx_DefaultsTo80()
{
    const string json = """{"FontSize":32}""";
    var result = JsonSerializer.Deserialize<AppSettings>(json)!;
    Assert.AreEqual(80, result.GhostFadeRadiusPx,
        "GhostFadeRadiusPx should default to 80 when absent from JSON (init default), not 0");
}
```

### Anti-Patterns to Avoid

- **Positional constructor:** `AppSettings` is an init-property record, not a positional record. Never switch to positional syntax — it breaks JSON forward/backward compatibility (field order matters for positional deserialization, and we rely on name-based matching).
- **Modifying frozen defaults at runtime:** `Defaults()` returns a fresh instance; never cache and mutate it.
- **Skipping Defaults() entry:** Omitting a field from `Defaults()` means `ResetToDefaults()` in MainWindow silently misses it. Confirmed: `ResetToDefaults()` calls `SettingsService.Defaults()` to produce its reset state.
- **Validate() throwing:** `Validate()` must never throw — it must silently replace invalid values. Callers (including unit tests) cannot catch exceptions from `Load()` calls that exercise `Validate()`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Range clamping | Custom if-ladder | `Math.Clamp(value, 20, 200)` or two-branch guard matching existing style | BCL `Math.Clamp` is cleaner; OR match existing two-branch style for consistency |
| JSON serialization | Custom serializer | `System.Text.Json.JsonSerializer` already used everywhere | Already wired; changing serializer breaks existing settings files |

## Common Pitfalls

### Pitfall 1: C# Type Default vs Init Default

**What goes wrong:** Developer adds `public int GhostFadeRadiusPx { get; init; }` (no `= 80`). The init default is then 0, not 80. Old settings files deserialize to 0. Validate() clamps 0 to 20 (not 80), causing unexpected behavior.

**Why it happens:** Easy to omit `= value` when declaring the property.

**How to avoid:** Always declare `= 80` on the init-property. The absent-field test catches this regression immediately if the `= 80` is missing.

**Warning signs:** Absent-field test fails with `0` when expecting `80`.

### Pitfall 2: Omitting Field from RoundTrip Test

**What goes wrong:** `RoundTrip_FullyPopulated_AllFieldsMatch` doesn't include `GhostFadeRadiusPx`. A silent serialization regression (e.g., field renamed) goes undetected.

**Why it happens:** Developer adds the property but forgets to extend the round-trip test.

**How to avoid:** The round-trip test is the canonical coverage check — always add new field with a non-default value.

**Warning signs:** No compile error; test passes even when field is broken.

### Pitfall 3: Omitting Field from Defaults()

**What goes wrong:** `Defaults()` doesn't include `GhostFadeRadiusPx = 80`. When MainWindow calls `ResetToDefaults()`, the field resets to 0 (C# int default) instead of 80.

**Why it happens:** `Defaults()` is an object initializer — omitting a field compiles cleanly.

**How to avoid:** After writing `Defaults()` entry, check against `AppSettings.cs` field list to ensure all fields are covered.

**Warning signs:** A "ResetToDefaults restores 80px" success criterion test would catch this if such a test is written.

### Pitfall 4: Validate() Using Wrong Default Value

**What goes wrong:** Validate() clamp references a hardcoded literal rather than `Defaults().GhostFadeRadiusPx`. If the default changes in the future, the validate guard uses a stale value.

**Why it happens:** Copy-paste from older guards that used hardcoded values.

**How to avoid:** Use `Defaults().GhostFadeRadiusPx` as the replacement value in the guard, matching the existing pattern in `Validate()`.

## Code Examples

### Add to AppSettings.cs

```csharp
// Source: AppSettings.cs — follows existing init-property pattern
public int GhostFadeRadiusPx { get; init; } = 80;  // 20–200px; default 80px per PROX-06/PROX-07
```

Place after `BackdropOpacityPercent` or logically grouped with ghost-mode fields (`GhostModeEnabled`).

### Add to SettingsService.Defaults()

```csharp
// Source: SettingsService.cs Defaults() — explicit field entry
public static AppSettings Defaults() => new()
{
    // ... existing fields ...
    BackdropOpacityPercent = 35,
    GhostFadeRadiusPx      = 80,  // ADD
};
```

### Add to SettingsService.Validate()

```csharp
// Source: SettingsService.cs Validate() — range guard for bounded integer
// GhostFadeRadiusPx guard — valid range 20–200px per PROX-06
if (loaded.GhostFadeRadiusPx < 20 || loaded.GhostFadeRadiusPx > 200)
    loaded = loaded with { GhostFadeRadiusPx = Defaults().GhostFadeRadiusPx };
```

### New Tests in AppSettingsTests.cs

```csharp
// PROX-12: Round-trip — add to RoundTrip_FullyPopulated_AllFieldsMatch
// In the original object initializer, add:
GhostFadeRadiusPx = 120,   // non-default value
// In the assertion block, add:
Assert.AreEqual(original.GhostFadeRadiusPx, result.GhostFadeRadiusPx, "GhostFadeRadiusPx");

// PROX-12: Absent-field test (new [TestMethod])
[TestMethod]
public void Deserialize_MissingGhostFadeRadiusPx_DefaultsTo80()
{
    const string json = """{"FontSize":32}""";
    var result = JsonSerializer.Deserialize<AppSettings>(json)!;
    Assert.AreEqual(80, result.GhostFadeRadiusPx,
        "GhostFadeRadiusPx should default to 80 when absent from JSON");
}
```

### New Tests in SettingsServiceTests.cs

```csharp
// PROX-12: Validate clamps below-minimum
[TestMethod]
public void Validate_GhostFadeRadiusPx_BelowMin_ClampsToDefault()
{
    var input  = new AppSettings { GhostFadeRadiusPx = -1 };
    var result = SettingsService.Validate(input);
    Assert.AreEqual(80, result.GhostFadeRadiusPx);
}

// PROX-12: Validate clamps above-maximum
[TestMethod]
public void Validate_GhostFadeRadiusPx_AboveMax_ClampsToDefault()
{
    var input  = new AppSettings { GhostFadeRadiusPx = 999 };
    var result = SettingsService.Validate(input);
    Assert.AreEqual(80, result.GhostFadeRadiusPx);
}

// PROX-12: Validate preserves valid in-range values
[TestMethod]
[DataRow(20)]
[DataRow(80)]
[DataRow(200)]
public void Validate_GhostFadeRadiusPx_ValidRange_Preserved(int radius)
{
    var input  = new AppSettings { GhostFadeRadiusPx = radius };
    var result = SettingsService.Validate(input);
    Assert.AreEqual(radius, result.GhostFadeRadiusPx);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Newtonsoft.Json | System.Text.Json | .NET BCL | No external package needed |
| Positional record | Init-property record | Phase 41+ | JSON field-name-based matching, forward/backward compat |

**Deprecated/outdated:**
- `"DialMode"` bool field: removed in Phase 48, migration logic in `Load()` handles legacy files. System.Text.Json silently ignores unknown fields on deserialization.

## Open Questions

1. **ResetToDefaults() location**
   - What we know: MEMORY.md references `ResetToDefaults()` in MainWindow; success criterion 4 says it must restore 80px.
   - What's unclear: Whether `ResetToDefaults()` in MainWindow.xaml.cs calls `SettingsService.Defaults()` directly or has its own inline reset logic.
   - Recommendation: Planner should verify in MainWindow.xaml.cs that `ResetToDefaults()` uses `SettingsService.Defaults()` — if it has inline field assignments, `GhostFadeRadiusPx` must be added there too. Given that `Defaults()` is the canonical source and the pattern is consistent, this is LOW risk but should be confirmed.

2. **Validate() clamp semantics: clamp-to-default vs clamp-to-nearest-boundary**
   - What we know: ROADMAP success criterion says "clamps out-of-range values (e.g. -1, 999) to the valid range without throwing". The existing pattern for discrete-set fields (ProcessCountThresholdPercent, BatteryAlertThresholdPercent) resets to default when invalid. For continuous ranges (Opacity), it also resets to default.
   - What's unclear: Whether -1 should clamp to 20 (nearest boundary) or 80 (default). Success criterion wording says "clamps to the valid range" which suggests 20, but existing guards all reset to `Defaults()` value.
   - Recommendation: Match existing guard style — replace out-of-range with `Defaults().GhostFadeRadiusPx` (80). This is consistent, simpler, and matches what the test examples in the roadmap imply.

## Sources

### Primary (HIGH confidence)
- `FuzzyClock.App/AppSettings.cs` — full field list, init-property pattern, current 49 lines
- `FuzzyClock.App/SettingsService.cs` — `Validate()`, `Defaults()`, `Load()` full source
- `FuzzyClock.App.Tests/AppSettingsTests.cs` — round-trip + absent-field test patterns
- `FuzzyClock.App.Tests/SettingsServiceTests.cs` — `Validate()` guard test patterns
- `.planning/REQUIREMENTS.md` — PROX-12, PROX-08 definitions, valid range 20–200, default 80
- `.planning/STATE.md` — locked decision: `GhostFadeRadiusPx = 80` (not 0)

### Secondary (MEDIUM confidence)
- `.planning/ROADMAP.md` — Phase 66 success criteria, scope boundaries

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all code read directly from source; no inference
- Architecture: HIGH — phase 66 is a direct repetition of prior field-addition phases (LcdStyle, ProcessCountThresholdPercent, etc.)
- Pitfalls: HIGH — identified from prior patterns in the same codebase; MEMORY.md documents the init-property pattern explicitly
- Test patterns: HIGH — read directly from existing test files

**Research date:** 2026-03-27
**Valid until:** 2026-04-27 (stable, no external dependencies)

**Baseline test count:** 395 total (38 App + 357 Core), 0 failures — confirmed by `dotnet test --no-build` run.
