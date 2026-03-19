# Phase 58: Data Model Foundation — Research

**Researched:** 2026-03-19
**Domain:** C# / WPF — AppSettings, SettingsSnapshot, IPhraseProvider, MSTest
**Confidence:** HIGH

## Summary

Phase 57 (Plans 01 and 02) already executed every change that Phase 58 was designed to perform. All six novelty phrase providers implement `GetSegmentKey`. `AppSettings` and `SettingsSnapshot` use `ClockType` instead of `DialMode`. `SettingsService.Load()` performs the `dialMode:true` → `ClockType.Dial` JSON migration. The full solution builds with 0 errors and 298 tests pass (262 Core + 36 App).

**The only genuine Phase 58 work remaining** is a single missing test: there is no test confirming that deserializing JSON without a `ClockType` field defaults to `ClockType.Phrase`. The ROADMAP success criterion "absent-field test confirms ClockType defaults to Phrase" is unmet. All other success criteria are already satisfied.

**Primary recommendation:** Phase 58 should be a single-task plan that adds the missing `ClockType` absent-field test to `AppSettingsTests.cs`, verifies all 4 success criteria against the current codebase, and closes the phase. No data model changes are needed — the migration is complete.

---

## Current State — Verified Ground Truth

This is the authoritative picture of what Phase 57 delivered, confirmed by direct source audit and live build/test runs.

### Success Criteria Audit

| Success Criterion | Status | Evidence |
|-------------------|--------|---------|
| `dotnet build FuzzyClock.Core` exits 0 — six novelty providers each implement GetSegmentKey | DONE | `dotnet build FuzzyClock.Core` → "Build succeeded. 0 Warning(s). 0 Error(s)". All 17 providers (including Yoda, Jive, Pirate, Shakespeare, Dwarf, ValleyGirl) confirmed to contain `GetSegmentKey` via grep. |
| AppSettings has ClockType field (not DialMode); dialMode:true upgrades to ClockType.Dial | DONE | `AppSettings.cs` line 27: `public ClockType ClockType { get; init; } = ClockType.Phrase;`. No `DialMode` property. `SettingsService.Load()` lines 53–61: migration block reads `dialMode` from raw `JsonDocument`, writes `ClockType.Dial`. |
| SettingsSnapshot has ClockType, LcdUse24Hr, LcdShowSeconds, LcdStyle, ShowHourTicks, ShowMinuteDots, ShowHourNumbers fields | DONE | `SettingsSnapshot.cs` lines 13–20: all 7 fields confirmed present with correct defaults. |
| STEST-01 round-trip test passes with new AppSettings fields | DONE | `AppSettingsTests.RoundTrip_FullyPopulated_AllFieldsMatch` sets `ClockType = ClockType.Dial`, asserts it round-trips. 36 App tests pass. |
| absent-field test confirms ClockType defaults to Phrase | **MISSING** | No test named `Deserialize_MissingClockType_DefaultsToPhrase` or equivalent exists in `AppSettingsTests.cs`. This is the only unmet success criterion. |

### What Currently Exists

| File | Relevant Current State |
|------|----------------------|
| `FuzzyClock.App/AppSettings.cs` | `public ClockType ClockType { get; init; } = ClockType.Phrase;` at line 27. Also has `LcdUse24Hr`, `LcdShowSeconds`, `LcdStyle`, `LcdSize`, `ShowHourTicks`, `ShowMinuteDots`, `ShowHourNumbers`. No `DialMode`. |
| `FuzzyClock.App/SettingsSnapshot.cs` | `public ClockType ClockType { get; init; } = ClockType.Phrase;` at line 13. All LCD and dial-decoration fields present. No `DialMode`. |
| `FuzzyClock.App/SettingsService.cs` | Migration at lines 53–61: `bool hasDialMode = doc.RootElement.TryGetProperty("DialMode", out var dialEl)`. Reads from raw `JsonDocument`, not deserialized record — safe even though `AppSettings.DialMode` no longer exists as a property. |
| `FuzzyClock.App/ClockType.cs` | `public enum ClockType { Phrase, Dial, Lcd, Nixie }` |
| `FuzzyClock.Core/*PhraseProvider.cs` | All 17 providers implement `GetSegmentKey(DateTime dt)`. The 6 novelty providers (Yoda, Jive, Pirate, Shakespeare, Dwarf, ValleyGirl) use `=> GetPhrase(dt)` delegating pattern. |
| `FuzzyClock.App.Tests/AppSettingsTests.cs` | STEST-01 round-trip covers `ClockType`. No absent-field test for `ClockType`. |
| Full solution build | 0 errors, 14 CS0067 warnings (stub events — expected, not errors). |
| Test suite | 298 tests: 262 Core + 36 App. 0 failures. |

---

## Standard Stack

### Core (no new packages)

| Library | Version | Purpose |
|---------|---------|---------|
| .NET 10 WPF | net10.0-windows | UI framework |
| System.Text.Json | .NET 10 BCL | Settings serialization — `init`-property records deserialized natively |
| MSTest | 4.x (existing) | Test framework — 298 tests currently passing |

No new NuGet packages required. All work is in existing test files.

---

## Architecture Patterns

### Pattern 1: Absent-field Default Tests (init-property records)

`AppSettings` is an immutable `record` with `{ get; init; }` properties and inline defaults. When System.Text.Json deserializes JSON that is missing a field, the `init` default is used — NOT the C# type default. This is why absent-field tests are explicit in the test suite (see `Deserialize_MissingUptimeVisible_DefaultsToTrue`, `Deserialize_MissingShowDate_DefaultsToTrue`, etc.).

The missing test follows the same pattern already established in `AppSettingsTests.cs`:

```csharp
// Pattern from existing tests — verified from AppSettingsTests.cs:
[TestMethod]
public void Deserialize_MissingClockType_DefaultsToPhrase()
{
    // JSON from old settings file that predates ClockType field
    const string json = """{"FontSize":32}""";
    var result = JsonSerializer.Deserialize<AppSettings>(json)!;
    Assert.AreEqual(ClockType.Phrase, result.ClockType,
        "ClockType should default to Phrase when absent from JSON (init default)");
}
```

`ClockType.Phrase` has integer value `0`, which IS the C# enum default. However, the test is still important because it documents the contract and protects against future breakage (e.g., if the enum order changes or the default is explicitly changed).

### Pattern 2: SettingsService Migration (not testable via pure deserialization)

The `dialMode:true` → `ClockType.Dial` upgrade path lives in `SettingsService.Load()`, which performs file I/O. This is tested indirectly (the migration code exists and was implemented in Phase 57), but is NOT covered by a pure-unit test (which would require mocking the file system). This is consistent with the existing test strategy — `SettingsService.Load()` is not unit-tested elsewhere either; only `Validate()`, `Clamp()`, and `Defaults()` are tested.

The Phase 58 success criterion "existing settings.json with dialMode:true upgrades to ClockType.Dial without data loss" is satisfied by the production migration code but has no automated unit test. This is acceptable given the project's test strategy.

### Anti-Patterns to Avoid

- **Do not add `DialMode` back to `AppSettings` or `SettingsSnapshot`.** The migration reads from raw JSON, not from the record property. Re-adding would cause duplicate serialization.
- **Do not try to unit-test `SettingsService.Load()`** without file system mocking infrastructure — the project has no such infrastructure and this is out of scope.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| ClockType JSON serialization | Custom converter | System.Text.Json serializes enums as integers natively; `ClockType` round-trips correctly by enum ordinal |
| Absent-field detection | Custom JSON parsing | `init` defaults on record properties — absent fields use the declared default, not C# type default |

**Key insight:** System.Text.Json's handling of `init`-property records with inline defaults is the mechanism that makes absent-field defaults work. No custom serializer configuration is needed.

---

## Common Pitfalls

### Pitfall 1: Assuming Phase 58 has implementation work remaining

**What goes wrong:** Planner scopes implementation tasks for adding ClockType to AppSettings/SettingsSnapshot or adding GetSegmentKey to novelty providers. All of this is already done.

**How to avoid:** Read the Phase 57 summaries (57-01-SUMMARY.md, 57-02-SUMMARY.md) before planning. Scope Phase 58 to: (1) add the missing absent-field test, (2) verify all 4 success criteria, (3) close the phase.

**Warning signs:** Any plan task that modifies `AppSettings.cs`, `SettingsSnapshot.cs`, or any `*PhraseProvider.cs` file — these would be redundant.

### Pitfall 2: ClockType.Phrase has ordinal 0, conflating "default by enum" with "default by init property"

**What goes wrong:** The absent-field test for `ClockType` may seem unnecessary because `ClockType.Phrase == 0` and System.Text.Json would deserialize an absent enum field as `0`. However, the `init` default `= ClockType.Phrase` is the contract the test must document.

**How to avoid:** Write the test anyway, matching the existing absent-field test pattern. It documents intent and protects against future refactoring.

### Pitfall 3: STEST numbering collision

**What goes wrong:** Adding a new test method without checking existing STEST IDs. `AppSettingsTests.cs` uses STEST-01, STEST-02, STEST-03, STEST-08 in comments. `SettingsServiceTests.cs` uses STEST-03 through STEST-08.

**How to avoid:** The new absent-field test for ClockType does not require a new STEST ID in the comment header — or use a new ID that doesn't collide. Inspect the existing header comment before assigning.

---

## Code Examples

### Missing absent-field test — exact implementation

```csharp
// Source: AppSettingsTests.cs — matches existing absent-field test pattern
[TestMethod]
public void Deserialize_MissingClockType_DefaultsToPhrase()
{
    const string json = """{"FontSize":32}""";
    var result = JsonSerializer.Deserialize<AppSettings>(json)!;
    Assert.AreEqual(ClockType.Phrase, result.ClockType,
        "ClockType should default to Phrase when absent from JSON");
}
```

### Existing round-trip test that already covers ClockType (STEST-01)

```csharp
// AppSettingsTests.cs lines 36 and 68 — already passing:
ClockType = ClockType.Dial,            // set in original
Assert.AreEqual(original.ClockType, result.ClockType, "ClockType");  // asserted
```

### SettingsService migration block — already complete, no changes needed

```csharp
// SettingsService.cs lines 53-61 — source-verified:
bool hasDialMode = doc.RootElement.TryGetProperty("DialMode", out var dialEl);
if (hasDialMode && loaded.ClockType == ClockType.Phrase)
{
    if (dialEl.ValueKind == System.Text.Json.JsonValueKind.True)
        loaded = loaded with { ClockType = ClockType.Dial };
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `AppSettings.DialMode: bool` | `AppSettings.ClockType: ClockType` | Phase 57 Plan 01 (commit cf63c46) | Supports 4 clock types without additional booleans |
| `SettingsSnapshot.DialMode: bool` | `SettingsSnapshot.ClockType: ClockType` | Phase 57 Plan 01 (commit cf63c46) | Consistent with AppSettings; SettingsWindow reads ClockType directly |
| 6 novelty providers missing `GetSegmentKey` | All 17 providers implement `GetSegmentKey` | Phase 57 Plan 01 (commit a25a0d9) | IPhraseProvider interface fully satisfied; Core compiles |
| `DialModeChanged: Action<bool>` in SettingsWindow | `ClockTypeChanged: Action<ClockType>` | Phase 57 Plan 02 (commit 8f21ede) | All 4 clock types dispatched via single event |

**No deprecated patterns remain in this domain.** The migration is complete.

---

## Open Questions

1. **Should Phase 58 be considered complete at the start, or should the planner add the missing absent-field test?**
   - What we know: All 4 success criteria are satisfied EXCEPT the absent-field test for ClockType.
   - What's unclear: Whether the ROADMAP criterion "absent-field test confirms ClockType defaults to Phrase" was meant to be written as part of Phase 58, or was implicitly completed by Phase 57 (it was not — Phase 57 did not add this specific test).
   - Recommendation: Phase 58 plan should add this one test. It closes the success criterion cleanly and is a minimal, safe task.

2. **Are there any other absent-field tests that should be added alongside?**
   - What we know: `ShowHourTicks`, `ShowMinuteDots`, `ShowHourNumbers` are now in `AppSettings` and `SettingsSnapshot` but have no absent-field tests. The LCD fields (`LcdUse24Hr`, `LcdShowSeconds`, `LcdStyle`, `LcdSize`) do have absent-field tests.
   - Recommendation: Out of scope for Phase 58 unless the planner chooses to group them. They are not in the success criteria.

---

## Sources

### Primary (HIGH confidence)

- `FuzzyClock.App/AppSettings.cs` — direct source read; current state confirmed
- `FuzzyClock.App/SettingsSnapshot.cs` — direct source read; current state confirmed
- `FuzzyClock.App/SettingsService.cs` — migration code lines 53–61 verified
- `FuzzyClock.App.Tests/AppSettingsTests.cs` — STEST-01 covers ClockType; no absent-field test for ClockType confirmed missing
- `FuzzyClock.Core/IPhraseProvider.cs` — `GetSegmentKey` method signature confirmed
- All 17 `*PhraseProvider.cs` files — grep confirmed all contain `GetSegmentKey`
- `dotnet build FuzzyClock.slnx` — Build succeeded, 0 errors (14 CS0067 warnings only)
- `dotnet test FuzzyClock.slnx` — 298 passed, 0 failed
- `.planning/phases/57-re-introduce-nixie-into-the-new-architecture/57-01-SUMMARY.md` — confirms Phase 57 Plan 01 completed NIX-01 and NIX-04 (GetSegmentKey) work
- `.planning/phases/57-re-introduce-nixie-into-the-new-architecture/57-02-SUMMARY.md` — confirms Phase 57 Plan 02 completed NIX-02 and NIX-03 work

---

## Metadata

**Confidence breakdown:**
- Current codebase state: HIGH — verified by direct file reads and live build/test runs
- Missing test identification: HIGH — exhaustive grep of `AppSettingsTests.cs` confirms no absent-field test for ClockType
- Phase 58 scope: HIGH — one missing test; all other success criteria already met

**Research date:** 2026-03-19
**Valid until:** Stable — closed codebase; findings hold until next commit to AppSettingsTests.cs

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| NIX-01 | `AppSettings` and `SettingsSnapshot` use `ClockType` enum instead of `DialMode` bool; LCD fields added; JSON migration preserves existing dial/phrase preferences on upgrade | ALREADY COMPLETE — Phase 57 Plan 01 (commit cf63c46). AppSettings.ClockType defaults to Phrase; SettingsService.Load() migrates dialMode:true to ClockType.Dial. |
| NIX-04 (GetSegmentKey) | Pre-existing build errors resolved — novelty providers implement GetSegmentKey; FuzzyClock.Core compiles clean | ALREADY COMPLETE — Phase 57 Plan 01 (commit a25a0d9). All 6 novelty providers have GetSegmentKey. Core builds with 0 errors. |

**Phase 58 remaining work:** Add one absent-field unit test (`Deserialize_MissingClockType_DefaultsToPhrase`) to `FuzzyClock.App.Tests/AppSettingsTests.cs` to satisfy the final ROADMAP success criterion.
</phase_requirements>
