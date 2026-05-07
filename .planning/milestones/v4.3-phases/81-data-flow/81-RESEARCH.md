# Phase 81: Data Flow - Research

**Researched:** 2026-05-07
**Domain:** C# record-based configuration persistence with System.Text.Json
**Confidence:** HIGH

## Summary

Phase 81 adds three boolean fields (UseCtrl, UseAlt, UseShift) to AppSettings and SettingsSnapshot for configurable ghost override modifiers. The architecture follows established patterns from 56 fields across v1.0–v4.2: init-property record pattern for JSON forward/backward compatibility, explicit init defaults for non-false bools, `SettingsService.Validate()` guards (none needed here — bools are always valid), and System.Text.Json native serialization with absent-field tolerance.

**Primary recommendation:** Add three init-property bool fields with explicit defaults (= true, = true, = false) to AppSettings and SettingsSnapshot; extend round-trip test and absent-field tests following exact patterns from Phase 78 temps fields.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| System.Text.Json | .NET 10 in-box | JSON serialization | Native BCL, handles init-property records without attributes since .NET 5 |
| MSTest | 4.0.1 | Unit testing | Project-wide standard since v2.5 (562 tests green) |

### Supporting
N/A — no additional dependencies needed. All capabilities already validated in production.

**Installation:**
```bash
# No new packages — all capabilities in-box or already present
```

## Architecture Patterns

### Recommended Project Structure
```
FuzzyClock.App/
├── AppSettings.cs           # Add UseCtrl/UseAlt/UseShift init-property fields
├── SettingsSnapshot.cs      # Add UseCtrl/UseAlt/UseShift init-property fields
├── SettingsService.cs       # No changes needed (bools need no validation)

FuzzyClock.App.Tests/
└── AppSettingsTests.cs      # Add 6 test methods (round-trip + 3 absent-field)
```

### Pattern 1: Init-Property Record with Explicit Defaults for Non-False Bools
**What:** C# record with init-only properties; explicit `= value` for non-default init values
**When to use:** AppSettings configuration fields requiring JSON backward compatibility
**Example:**
```csharp
// Source: FuzzyClock.App/AppSettings.cs (existing pattern)
public record AppSettings
{
    // Existing 56 fields...
    
    // v4.3 — configurable ghost override modifiers (Phase 81 CFG-01)
    // Defaults preserve Ctrl+Alt behavior for v4.2 upgrades (CFG-04).
    // Explicit init defaults required: bool JSON-deserializes as false when field absent;
    // UseCtrl/UseAlt MUST be true on upgrade, not C# bool default false.
    public bool UseCtrl  { get; init; } = true;   // Left-Ctrl enabled by default
    public bool UseAlt   { get; init; } = true;   // Left-Alt enabled by default
    public bool UseShift { get; init; } = false;  // Left-Shift disabled by default
}
```

**Critical detail:** System.Text.Json deserializes absent JSON fields to C# type defaults (bool → false, int → 0, string → null). Explicit init defaults (`= true`) override this. Without explicit defaults, v4.2 users upgrading to v4.3 would get UseCtrl=false, UseAlt=false (ghost override disabled) instead of the intended Ctrl+Alt default.

### Pattern 2: SettingsSnapshot Projection
**What:** Immutable snapshot populates at Settings window open-time from AppSettings + live services
**When to use:** Settings window needs read-only view of current state
**Example:**
```csharp
// Source: FuzzyClock.App/SettingsSnapshot.cs (existing pattern)
internal sealed record SettingsSnapshot
{
    // Existing 40 fields...
    
    // v4.3 Phase 81 (CFG-02)
    // SettingsSnapshot mirrors AppSettings modifier configuration so Settings window
    // can populate checkboxes. Default to C# type zero-values (false); MainWindow's
    // GetCurrentSettingsSnapshot populates real values from _settings at open time.
    public bool UseCtrl  { get; init; }   // no explicit default — populated by caller
    public bool UseAlt   { get; init; }   // no explicit default — populated by caller
    public bool UseShift { get; init; }   // no explicit default — populated by caller
}
```

**Critical detail:** SettingsSnapshot is a projection, not a config model. Fields default to C# zero-values; the producer (MainWindow.GetCurrentSettingsSnapshot) is responsible for mapping AppSettings values at call time. This differs from AppSettings where explicit init defaults are mandatory for upgrade safety.

### Pattern 3: MSTest Round-Trip + Absent-Field Tests
**What:** Serialize→deserialize full instance + deserialize minimal JSON with field absent
**When to use:** Every AppSettings field addition
**Example:**
```csharp
// Source: FuzzyClock.App.Tests/AppSettingsTests.cs (existing pattern from Phase 78)
[TestMethod]
public void RoundTrip_FullyPopulated_AllFieldsMatch()
{
    var original = new AppSettings
    {
        // ...existing 56 fields...
        UseCtrl  = false,  // flipped from default true to prove round-trip
        UseAlt   = false,  // flipped from default true
        UseShift = true,   // flipped from default false
    };
    
    string json = JsonSerializer.Serialize(original);
    var result  = JsonSerializer.Deserialize<AppSettings>(json)!;
    
    Assert.AreEqual(original.UseCtrl,  result.UseCtrl,  "UseCtrl");
    Assert.AreEqual(original.UseAlt,   result.UseAlt,   "UseAlt");
    Assert.AreEqual(original.UseShift, result.UseShift, "UseShift");
}

[TestMethod]
public void Deserialize_MissingUseCtrl_DefaultsToTrue()
{
    const string json = """{"FontSize":32}""";  // v4.2 settings.json simulation
    var result = JsonSerializer.Deserialize<AppSettings>(json)!;
    Assert.IsTrue(result.UseCtrl,
        "UseCtrl should default to true when absent from JSON (init default), not false (C# bool default)");
}

[TestMethod]
public void Deserialize_MissingUseAlt_DefaultsToTrue()
{
    const string json = """{"FontSize":32}""";
    var result = JsonSerializer.Deserialize<AppSettings>(json)!;
    Assert.IsTrue(result.UseAlt,
        "UseAlt should default to true when absent from JSON (init default), not false (C# bool default)");
}

[TestMethod]
public void Deserialize_MissingUseShift_DefaultsToFalse()
{
    const string json = """{"FontSize":32}""";
    var result = JsonSerializer.Deserialize<AppSettings>(json)!;
    Assert.IsFalse(result.UseShift,
        "UseShift should default to false when absent from JSON (init default = C# bool default)");
}
```

**Critical detail:** Absent-field tests MUST verify the init default behavior, not just happy-path round-trips. The test message explains WHY the assertion matters (prevents silent upgrade bug).

### Pattern 4: SettingsService Validation Guards (Not Needed Here)
**What:** `SettingsService.Validate()` clamps/resets invalid deserialized values
**When to use:** Numeric ranges, enum strings, nullable guards
**Example:**
```csharp
// Source: FuzzyClock.App/SettingsService.cs (existing pattern)
public static AppSettings Validate(AppSettings loaded)
{
    // ...existing 10 validation guards...
    
    // Phase 81: No validation guard needed — bool has no invalid states.
    // C# bool can only be true or false; JSON deserializes "true"/"false" correctly.
    // Unlike StatsIntervalSeconds (numeric range) or LcdStyle (string enum),
    // UseCtrl/UseAlt/UseShift cannot be corrupted by manual editing.
    
    return loaded;
}
```

**Critical detail:** Validation guards are only needed for types with invalid states. Bools always deserialize to valid true/false; no guard required.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON serialization | Custom JSON writer with string concatenation | System.Text.Json BCL | Handles records natively, null-safe, battle-tested, 10× faster than reflection-based serializers |
| Init-property record migration | Manual field-by-field copy with version flags | C# `with` expression | One-liner `loaded = loaded with { Field = value }`, compiler-checked, zero runtime overhead |
| Absent-field defaults | Post-deserialization null-checks and fallback logic | Init-property defaults `= value` | Declarative, compiler-enforced, single source of truth |

**Key insight:** System.Text.Json has native support for C# 9 init-property records since .NET 5. Absent JSON fields deserialize to init defaults automatically without any [JsonProperty] attributes or custom converters. This is production-validated across 56 AppSettings fields spanning v1.0–v4.2 (562 MSTest tests green).

## Common Pitfalls

### Pitfall 1: Forgetting Explicit Init Defaults for Non-False Bools
**What goes wrong:** Field absent from v4.2 settings.json → JSON deserializes to C# bool default (false) → UseCtrl=false, UseAlt=false on upgrade → ghost override disabled silently
**Why it happens:** C# bool type default is false; without explicit `= true`, init-property still uses type default for absent JSON fields
**How to avoid:** Explicitly write `= true` for UseCtrl and UseAlt; `= false` for UseShift is optional (matches type default) but recommended for clarity
**Warning signs:** Absent-field test fails; user upgrades from v4.2 and reports "Ctrl+Alt stopped working"

### Pitfall 2: Copying SettingsSnapshot Defaults from AppSettings
**What goes wrong:** SettingsSnapshot fields get explicit init defaults (e.g., `= true`) → GetCurrentSettingsSnapshot compares `_settings.UseCtrl` to snapshot's init default instead of mapping value → checkbox state wrong at open-time
**Why it happens:** Copy-paste from AppSettings.cs without understanding semantic difference: AppSettings is config (needs defaults for absent fields), SettingsSnapshot is projection (populated by caller)
**How to avoid:** SettingsSnapshot fields have NO explicit init defaults — always C# type zero-values; MainWindow.GetCurrentSettingsSnapshot maps `_settings.UseX` to snapshot at call time
**Warning signs:** Settings window opens with wrong checkbox states; toggling checkbox once "fixes" it (first event overwrites stale default with real value)

### Pitfall 3: Missing Round-Trip Test Coverage
**What goes wrong:** Round-trip test only checks happy-path (field present in JSON) → absent-field bug (UseCtrl absent → false instead of true) not caught until user upgrade
**Why it happens:** Developer adds field to AppSettings + updates RoundTrip test but forgets absent-field tests
**How to avoid:** For each new field, add BOTH round-trip assertion (proves serialization) AND absent-field test (proves init default); pattern is mechanical — see Phase 78 temps fields (6 round-trip + 5 absent-field tests)
**Warning signs:** Test suite passes but user upgrade fails; CI green but production bug

### Pitfall 4: Validating Bools in SettingsService.Validate()
**What goes wrong:** Developer adds unnecessary validation guard `if (!validBools.Contains(loaded.UseCtrl)) loaded = loaded with { UseCtrl = true };` → code bloat, misleading pattern (implies bools can be invalid)
**Why it happens:** Copy-paste from numeric/string validation guards without understanding when validation is needed
**How to avoid:** Validation guards are only for types with invalid states (numbers outside range, string enums with unknown values, null strings); bools are always valid
**Warning signs:** Code review flags unnecessary guard; SettingsServiceTests would need meaningless test cases

## Code Examples

Verified patterns from project codebase:

### AppSettings Field Addition (CFG-01)
```csharp
// Source: FuzzyClock.App/AppSettings.cs line 56
public record AppSettings
{
    // ...existing 56 fields...
    
    // v4.3 — configurable ghost override modifiers (Phase 81 CFG-01)
    // Defaults per requirements CFG-04 (preserve Ctrl+Alt for v4.2 upgrades).
    // Explicit init defaults required: bool JSON-deserializes as false when field absent.
    public bool UseCtrl  { get; init; } = true;   // Left-Ctrl enabled
    public bool UseAlt   { get; init; } = true;   // Left-Alt enabled
    public bool UseShift { get; init; } = false;  // Left-Shift disabled
}
```

### SettingsSnapshot Extension (CFG-02)
```csharp
// Source: FuzzyClock.App/SettingsSnapshot.cs line 54
internal sealed record SettingsSnapshot
{
    // ...existing 40 fields...
    
    // v4.3 Phase 81 (CFG-02) — modifier configuration snapshot
    public bool UseCtrl  { get; init; }
    public bool UseAlt   { get; init; }
    public bool UseShift { get; init; }
}
```

### Round-Trip Test Extension (TST-01)
```csharp
// Source: FuzzyClock.App.Tests/AppSettingsTests.cs RoundTrip_FullyPopulated_AllFieldsMatch
var original = new AppSettings
{
    // ...existing 56 fields...
    UseCtrl  = false,  // flipped to prove serialization
    UseAlt   = false,
    UseShift = true,
};

string json = JsonSerializer.Serialize(original);
var result  = JsonSerializer.Deserialize<AppSettings>(json)!;

Assert.AreEqual(original.UseCtrl,  result.UseCtrl,  "UseCtrl");
Assert.AreEqual(original.UseAlt,   result.UseAlt,   "UseAlt");
Assert.AreEqual(original.UseShift, result.UseShift, "UseShift");
```

### Absent-Field Tests (TST-02)
```csharp
// Source: Pattern from FuzzyClock.App.Tests/AppSettingsTests.cs Phase 78 temps fields
[TestMethod]
public void Deserialize_MissingUseCtrl_DefaultsToTrue()
{
    const string json = """{"FontSize":32}""";  // Minimal v4.2 settings.json
    var result = JsonSerializer.Deserialize<AppSettings>(json)!;
    Assert.IsTrue(result.UseCtrl,
        "UseCtrl should default to true when absent from JSON (init default), not false (C# bool default)");
}

[TestMethod]
public void Deserialize_MissingUseAlt_DefaultsToTrue()
{
    const string json = """{"FontSize":32}""";
    var result = JsonSerializer.Deserialize<AppSettings>(json)!;
    Assert.IsTrue(result.UseAlt,
        "UseAlt should default to true when absent from JSON (init default), not false (C# bool default)");
}

[TestMethod]
public void Deserialize_MissingUseShift_DefaultsToFalse()
{
    const string json = """{"FontSize":32}""";
    var result = JsonSerializer.Deserialize<AppSettings>(json)!;
    Assert.IsFalse(result.UseShift,
        "UseShift should default to false when absent from JSON (init default = C# bool default)");
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Positional records | Init-property records | v1.1 Phase 5 (2026-02-26) | Positional breaks JSON backward compat — adding field changes constructor signature; init-property adds field without breaking deserialization |
| Manual field validation in Load() | Pure Validate() static method | v2.5 Phase 34 (2026-03-04) | Testable validation separate from I/O; Load() delegates to Validate() |
| C# bool default for absent fields | Explicit init defaults `= true` | v2.5 Phase 34 (2026-03-04) | Bool fields with semantic "true" default must use explicit `= true` or upgrades silently break |

**Deprecated/outdated:**
- Positional record constructors for AppSettings — breaks JSON forward/backward compatibility on field additions
- Validation logic inline in Load() — untestable without file I/O mocking

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | MSTest 4.0.1 |
| Config file | `FuzzyClock.App.Tests/MSTestSettings.cs` (assembly-level `[Parallelize]` attribute) |
| Quick run command | `dotnet test --filter "FullyQualifiedName~AppSettingsTests"` |
| Full suite command | `dotnet test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CFG-01 | AppSettings has UseCtrl/UseAlt/UseShift with init defaults (true, true, false) | unit | `dotnet test --filter "FullyQualifiedName~AppSettingsTests.RoundTrip_FullyPopulated_AllFieldsMatch"` | ✅ Extend existing |
| CFG-02 | SettingsSnapshot carries UseCtrl/UseAlt/UseShift fields | unit | `dotnet test --filter "FullyQualifiedName~AppSettingsTests.SettingsSnapshot_AllFieldsAreInitSettable"` | ❌ Wave 0 |
| CFG-03 | Settings persist to settings.json and restore on launch | unit | `dotnet test --filter "FullyQualifiedName~AppSettingsTests.RoundTrip_FullyPopulated_AllFieldsMatch"` | ✅ Extend existing |
| CFG-04 | v4.2 settings.json (missing fields) deserializes with init defaults | unit | `dotnet test --filter "FullyQualifiedName~AppSettingsTests.Deserialize_MissingUseCtrl_DefaultsToTrue"` | ❌ Wave 0 |
| TST-01 | Round-trip test verifies all three modifier bools | unit | `dotnet test --filter "FullyQualifiedName~AppSettingsTests.RoundTrip_FullyPopulated_AllFieldsMatch"` | ✅ Extend existing |
| TST-02 | Absent-field test verifies init defaults | unit | `dotnet test --filter "FullyQualifiedName~AppSettingsTests.Deserialize_Missing"` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `dotnet test --filter "FullyQualifiedName~AppSettingsTests"` (< 5s, 30+ tests)
- **Per wave merge:** `dotnet test` (full 562-test suite, ~15s)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `FuzzyClock.App.Tests/AppSettingsTests.cs` — add 4 new test methods:
  - `SettingsSnapshot_ModifierFieldsAreInitSettable()` — proves CFG-02
  - `Deserialize_MissingUseCtrl_DefaultsToTrue()` — proves CFG-04 + TST-02
  - `Deserialize_MissingUseAlt_DefaultsToTrue()` — proves CFG-04 + TST-02
  - `Deserialize_MissingUseShift_DefaultsToFalse()` — proves CFG-04 + TST-02
- [ ] Extend existing `RoundTrip_FullyPopulated_AllFieldsMatch()` — add UseCtrl/UseAlt/UseShift to original instance + 3 assertions

## Sources

### Primary (HIGH confidence)
- FuzzyClock.App/AppSettings.cs — 56 existing fields with init-property pattern, observed behavior across v1.0–v4.2
- FuzzyClock.App/SettingsSnapshot.cs — 40 existing fields with zero-default projection pattern
- FuzzyClock.App/SettingsService.cs — Validate() guards for 10 field types, Load() migration logic
- FuzzyClock.App.Tests/AppSettingsTests.cs — 75 existing test methods proving JSON round-trip + absent-field behavior
- Microsoft Learn: System.Text.Json with C# records — https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/immutability (accessed 2026-05-07, confirms init-property records supported since .NET 5)

### Secondary (MEDIUM confidence)
- PROJECT.md Key Decisions table — documents init-property record decision rationale (v1.1 Phase 5)
- MEMORY.md milestone summaries — confirms 562 MSTest green across 4 test projects

### Tertiary (LOW confidence)
None.

## Metadata

**Confidence breakdown:**
- AppSettings schema extension: HIGH — exact pattern used 56 times in production, zero regressions across 17 milestones
- SettingsSnapshot projection: HIGH — exact pattern used 40 times, established in v3.2 Phase 42 (2026-03-09)
- MSTest patterns: HIGH — 562 tests green, round-trip + absent-field pattern validated in Phase 78 (2026-05-04)
- Validation guards: HIGH — 10 existing guards document when guards needed (numbers, enums, nulls); bools explicitly excluded

**Research date:** 2026-05-07
**Valid until:** 90 days (stable architectural patterns, no external dependencies, C# language features stable since C# 9 / .NET 5)
