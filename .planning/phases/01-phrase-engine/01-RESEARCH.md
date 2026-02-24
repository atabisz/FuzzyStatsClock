# Phase 1: Phrase Engine - Research

**Researched:** 2026-02-25
**Domain:** Pure C# algorithm — DateTime-to-English-phrase mapping, no WPF dependency
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

Full 12-bucket mapping per hour. Decisions confirmed:

| Bucket | Minutes | Phrase |
|--------|---------|--------|
| :00 | 0–2 | `[h] o'clock` (e.g. "3 o'clock") |
| :05 | 3–7 | `just after [h]` |
| :10 | 8–12 | Claude's discretion |
| :15 | 13–17 | `a quarter past [h]` |
| :20 | 18–22 | `just after quarter past [h]` |
| :25 | 23–27 | Claude's discretion |
| :30 | 28–32 | `half past [h]` |
| :35 | 33–37 | Claude's discretion |
| :40 | 38–42 | Claude's discretion |
| :45 | 43–47 | `a quarter before [h+1]` |
| :50 | 48–52 | Claude's discretion |
| :55 | 53–57 | `almost [h+1]` |

Special cases override the bucket logic:
- 12:00 PM → "noon"
- 12:00 AM → "midnight"

Fuzzy buckets near noon/midnight (:55 approaching midnight, :05 after noon) follow the same pattern as regular hours — "almost midnight", "just after noon". No special time-of-day phrasing.

**Number format:** Always use numerals, not words — "3 o'clock" not "three o'clock". :00 slot format: `[h] o'clock`.

**AM/PM context:** Phrases do not indicate morning/afternoon/evening. The hour number alone is sufficient. Exception: only at exact 12:00 PM/AM (noon/midnight special case above).

### Claude's Discretion

- Exact wording for buckets :10, :25, :35, :40, :50 — choose phrases consistent with the confirmed style (informal, poetic, English-idiomatic). Suggestions: "just past [h]" / "almost half past [h]" / "just past half past [h]" / "almost a quarter before [h+1]" / "nearly [h+1]"
- Bucket boundary widths for undecided slots — align to the ~5-min pattern established above
- Unit test structure and coverage strategy

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DISP-01 | App displays the current time as a fuzzy, poetic English phrase (e.g. "just a little after 11", "almost noon", "12 o'clock", "quarter past 3") | Pure C# static method on a class library; DateTime.Hour + DateTime.Minute drive all phrase selection |
| DISP-02 | Phrases map to 5-minute buckets — 12 distinct phrase slots per hour | Bucket selection via integer division of minutes; all 12 slots verified by table-driven unit tests |
| DISP-03 | Exact noon shows "noon", exact midnight shows "midnight" (not "12 o'clock") | Special-case guard before bucket dispatch; tests for DateTime(2000,1,1,12,0,0) and DateTime(2000,1,1,0,0,0) |
</phase_requirements>

---

## Summary

Phase 1 is a pure algorithm problem: map any `DateTime` to one of 12 fixed English phrases per hour, with two special overrides. There are no third-party libraries required or helpful — the entire solution is vanilla C# standard library. The implementation complexity is low; the primary design decision is how cleanly to express the bucket lookup table so it is readable and testable.

The recommended structure is a standalone `classlib` project (`FuzzyClock.Core`) added to a solution alongside the future WPF project. This isolates the phrase logic from any UI dependency and allows it to be independently unit-tested. A separate `classlib` (not a WPF project or a console) is the right target type for a pure logic library on .NET.

MSTest v4 (packaged as `MSTest` 4.1.0 on NuGet) is the current Microsoft-recommended test framework for .NET and is the simplest to scaffold with `dotnet new mstest`. xUnit v3 is also viable and well-supported on .NET 8+, but MSTest v4's `[DataRow]` attribute handles the large table of (minutes → expected phrase) test cases with zero boilerplate. Since Claude's discretion covers the test structure, MSTest v4 with `[DataRow]` is the recommended choice.

**Primary recommendation:** Implement a single `static string GetPhrase(DateTime dt)` method in a `FuzzyClock.Core` classlib; test it exhaustively with MSTest v4 `[DataRow]` table tests covering all 12 buckets and the two special cases.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| .NET SDK (C# classlib) | 10.0.103 (installed) | Host the pure logic | No UI dependency; independently testable |
| System (BCL) | Built-in | `DateTime.Hour`, `DateTime.Minute`, `string` | Zero dependency; no install needed |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| MSTest | 4.1.0 | Unit test framework | Table-driven tests via `[DataRow]`; scaffolded by `dotnet new mstest` |
| Microsoft.Testing.Platform | Bundled with MSTest 4.x | Modern test runner (MTP mode) | Automatic when using MSTest 4.x on .NET 10 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| MSTest 4.x `[DataRow]` | xUnit v3 `[Theory][InlineData]` | xUnit v3 also works well on .NET 10; MSTest `[DataRow]` is syntactically identical in practice; either is fine — MSTest is already in-box with `dotnet new mstest` |
| MSTest 4.x `[DataRow]` | NUnit `[TestCase]` | NUnit `[TestCase]` is idiomatic but adds a third framework; unnecessary here |

**Installation:**
```bash
# Create solution (run once at project root)
dotnet new sln -n FuzzyClock

# Create the core logic library
dotnet new classlib -n FuzzyClock.Core -o FuzzyClock.Core --framework net10.0

# Create the test project
dotnet new mstest -n FuzzyClock.Core.Tests -o FuzzyClock.Core.Tests --framework net10.0

# Add both to solution
dotnet sln add FuzzyClock.Core/FuzzyClock.Core.csproj
dotnet sln add FuzzyClock.Core.Tests/FuzzyClock.Core.Tests.csproj

# Add reference from tests to core
dotnet add FuzzyClock.Core.Tests/FuzzyClock.Core.Tests.csproj reference FuzzyClock.Core/FuzzyClock.Core.csproj
```

---

## Architecture Patterns

### Recommended Project Structure

```
FuzzyClock.sln
FuzzyClock.Core/
├── FuzzyClock.Core.csproj      # <TargetFramework>net10.0</TargetFramework>
└── PhraseEngine.cs             # static class; single public method
FuzzyClock.Core.Tests/
├── FuzzyClock.Core.Tests.csproj
└── PhraseEngineTests.cs        # [TestClass] with [DataRow] table tests
```

The WPF project (`FuzzyClock.App`) will be added in Phase 2. It will reference `FuzzyClock.Core`. Keeping them separate now means Phase 2 starts from a clean WPF scaffold without any logic mixed in.

### Pattern 1: Static Method With Guard-Then-Lookup

**What:** A single `public static string GetPhrase(DateTime dt)` method that (1) checks for the two special cases first, then (2) maps the minute-of-hour to a bucket index and selects a phrase template, then (3) substitutes the 12-hour display number.

**When to use:** The phrase vocabulary is fixed at compile time. No instance state is needed. A static method on a static class is the simplest correct shape.

**Example:**
```csharp
// FuzzyClock.Core/PhraseEngine.cs
namespace FuzzyClock.Core;

public static class PhraseEngine
{
    // Bucket boundaries (inclusive lower, exclusive upper)
    // Each entry: (maxMinute, phraseTemplate)
    // Use {h} for the current 12-hour value, {h1} for current+1
    private static readonly (int UpperBound, string Template)[] s_buckets =
    [
        (2,  "{h} o'clock"),
        (7,  "just after {h}"),
        (12, "ten past {h}"),           // :10 slot — Claude's discretion
        (17, "a quarter past {h}"),
        (22, "just after quarter past {h}"),
        (27, "almost half past {h}"),   // :25 slot — Claude's discretion
        (32, "half past {h}"),
        (37, "just past half past {h}"),// :35 slot — Claude's discretion
        (42, "almost a quarter before {h1}"), // :40 slot — Claude's discretion
        (47, "a quarter before {h1}"),
        (52, "nearly {h1}"),            // :50 slot — Claude's discretion
        (57, "almost {h1}"),
    ];

    public static string GetPhrase(DateTime dt)
    {
        int totalMinutes = dt.Hour * 60 + dt.Minute;

        // Special cases: exact noon and exact midnight only
        if (totalMinutes == 12 * 60) return "noon";
        if (totalMinutes == 0)       return "midnight";

        int hour12 = dt.Hour % 12;
        if (hour12 == 0) hour12 = 12;

        int nextHour12 = (hour12 % 12) + 1;

        int minute = dt.Minute;
        foreach (var (upperBound, template) in s_buckets)
        {
            if (minute <= upperBound)
            {
                return template
                    .Replace("{h}",  hour12.ToString())
                    .Replace("{h1}", nextHour12.ToString());
            }
        }

        // Minutes 58–59 fall through (no bucket covers them)
        // Treat as "almost [h+1]" — same as :55 bucket
        return $"almost {nextHour12}";
    }
}
```

**Note on discretion slot wording:** The suggested phrases above are consistent with the locked style (informal, numerals, American English). The planner should lock these in during Wave 0 before writing tests, since tests are table-driven against exact strings.

### Pattern 2: Table-Driven MSTest Tests With [DataRow]

**What:** A single `[TestMethod]` decorated with multiple `[DataRow]` attributes, one per bucket boundary and edge case. Tests verify the exact string returned.

**When to use:** Any time the domain has a fixed input→output table. Avoids duplicating test boilerplate for 12 buckets × 2 boundary samples = 24 cases minimum.

**Example:**
```csharp
// FuzzyClock.Core.Tests/PhraseEngineTests.cs
using Microsoft.VisualStudio.TestTools.UnitTesting;
using FuzzyClock.Core;

namespace FuzzyClock.Core.Tests;

[TestClass]
public class PhraseEngineTests
{
    // Special cases
    [TestMethod]
    [DataRow(12, 0, "noon")]
    [DataRow(0,  0, "midnight")]
    public void GetPhrase_SpecialCases_ReturnsExactWord(int hour, int minute, string expected)
    {
        var dt = new DateTime(2000, 1, 1, hour, minute, 0);
        Assert.AreEqual(expected, PhraseEngine.GetPhrase(dt));
    }

    // :00 bucket — 3 o'clock
    [TestMethod]
    [DataRow(3, 0,  "3 o'clock")]
    [DataRow(3, 1,  "3 o'clock")]
    [DataRow(3, 2,  "3 o'clock")]
    public void GetPhrase_OClockBucket(int hour, int minute, string expected)
    {
        var dt = new DateTime(2000, 1, 1, hour, minute, 0);
        Assert.AreEqual(expected, PhraseEngine.GetPhrase(dt));
    }

    // ... (similar blocks for each bucket)
}
```

### Anti-Patterns to Avoid

- **Using `DateTime.Now` inside `GetPhrase`:** The method must accept a `DateTime` parameter, not call `DateTime.Now` internally. If the clock is called inside the method, unit tests cannot inject specific times. Always accept the `DateTime` as a parameter.
- **Treating minute 58–59 as unhandled:** Minutes 58 and 59 fall outside the declared bucket table (which ends at 57). The implementation must handle the fallthrough explicitly to avoid an empty return or exception. Either extend the :55 bucket upper bound to 59, or add an explicit fallthrough clause.
- **Using string-name hours ("three o'clock"):** Requirements explicitly mandate numerals. Do not add a number-to-word lookup. The format is always the numeric hour value.
- **Using 24-hour values for [h]:** `dt.Hour` is 0–23. The display value must be converted to 12-hour (1–12) before substitution.
- **Checking noon/midnight with hour alone:** Noon is `hour == 12 && minute == 0`. Checking only `hour == 12` would incorrectly return "noon" for 12:05, 12:10, etc. The guard must check both hour and minute.
- **Mixing phrase logic into the WPF layer:** The phrase engine must have zero WPF/System.Windows reference. Keep it in the standalone `classlib` project.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Test parameterization | Custom loop or copy-pasted test methods | MSTest `[DataRow]` attribute | 24+ test cases with zero boilerplate duplication; failure messages include the data row values |
| 12-hour conversion | Manual `if/else` hour conversion | `int hour12 = dt.Hour % 12; if (hour12 == 0) hour12 = 12;` (2-line BCL pattern) | The `%` operator handles all 24 cases; this is the canonical C# idiom |
| String template substitution | StringBuilder-based phrase builder | Simple `string.Replace("{h}", ...)` | The template strings are short and fixed; Replace is readable, correct, and fast enough |

**Key insight:** The entire phrase engine is 30–40 lines of C# with zero dependencies. The complexity risk is not in the code length but in the completeness of edge case coverage — which is handled by exhaustive table-driven tests, not by a clever algorithm.

---

## Common Pitfalls

### Pitfall 1: Off-By-One at Bucket Boundaries

**What goes wrong:** Minute 2 gets assigned to :05 bucket instead of :00 bucket (or vice versa), producing wrong phrases at boundary minutes.

**Why it happens:** Inclusive vs. exclusive boundary confusion. If the table uses `minute < upperBound` but the upper bound is 2, then minute 2 falls through to the next bucket.

**How to avoid:** Use `minute <= upperBound` (inclusive upper bound). Write explicit tests for the first and last minute in every bucket (e.g., for :00 bucket, test minute 0, 1, and 2; for :05 bucket, test minute 3 and 7).

**Warning signs:** A test for minute 2 returns "just after [h]" instead of "[h] o'clock".

### Pitfall 2: Missing Fallthrough for Minutes 58–59

**What goes wrong:** The bucket table covers 0–57. Minutes 58 and 59 return an empty string or throw an exception.

**Why it happens:** The table is designed for "nice" 5-minute slots but a real clock produces minutes 0–59. The :55 slot covers 53–57 (5 minutes), leaving 58 and 59 uncovered.

**How to avoid:** Either extend the :55 bucket bound to 59 (logical — "almost [h+1]" is still correct at minute 58 and 59), or add an explicit fallthrough at the bottom of the method. Add unit tests for minute 58 and 59 explicitly.

**Warning signs:** `GetPhrase(new DateTime(2000,1,1,3,58,0))` throws or returns empty string.

### Pitfall 3: Noon/Midnight Special Case Too Broad

**What goes wrong:** "noon" is returned for 12:05, 12:10, or any time in the 12 o'clock hour.

**Why it happens:** Guard checks only `dt.Hour == 12` without also checking `dt.Minute == 0`.

**How to avoid:** The guard must be `dt.Hour == 12 && dt.Minute == 0` (or equivalently `totalMinutes == 12 * 60`). Test 12:01, 12:30, and 12:59 to confirm they return normal bucket phrases, not "noon".

**Warning signs:** `GetPhrase(new DateTime(2000,1,1,12,5,0))` returns "noon" instead of "just after 12".

### Pitfall 4: Wrong 12-Hour Value for Hour 0 and Hour 12

**What goes wrong:** Midnight hour (hour 0) produces "0 o'clock" instead of being caught by the special case; hour 12 produces "0 o'clock" for non-exact times.

**Why it happens:** `0 % 12 == 0` and `12 % 12 == 0`. Both map to zero before the correction `if (hour12 == 0) hour12 = 12` is applied.

**How to avoid:** Apply the correction `if (hour12 == 0) hour12 = 12` after the modulo. Test midnight+1 (00:01) → "just after 12", noon+5 (12:05) → "just after 12".

**Warning signs:** Any phrase containing "0" in it (e.g., "just after 0").

### Pitfall 5: `{h1}` Wrapping at Hour 12

**What goes wrong:** At 11:45–11:57 the next hour is 12. At 12:45–12:57 the next hour should be 1 (since we wrap back). `nextHour12 = (12 % 12) + 1 = 1` is correct, but a naive `hour12 + 1` produces 13 for hour 12.

**Why it happens:** Adding 1 to the 12-hour value without wrapping.

**How to avoid:** Compute `nextHour12 = (hour12 % 12) + 1`. This gives 1 for hour12=12, 2 for hour12=1, ..., 12 for hour12=11.

**Warning signs:** `GetPhrase(new DateTime(2000,1,1,12,45,0))` returns "a quarter before 13" instead of "a quarter before 1".

---

## Code Examples

Verified patterns from official C# BCL (DateTime API confirmed via Microsoft Learn official documentation, updated 2025-2026):

### DateTime Hour and Minute Extraction

```csharp
// Source: https://learn.microsoft.com/en-us/dotnet/api/system.datetime
// DateTime.Hour: 0–23
// DateTime.Minute: 0–59
DateTime dt = new DateTime(2000, 1, 1, 15, 45, 0); // 3:45 PM
int hour   = dt.Hour;    // 15
int minute = dt.Minute;  // 45
```

### 12-Hour Conversion (Canonical Idiom)

```csharp
// Source: standard C# idiom; dt.Hour is 0-23
int hour12 = dt.Hour % 12;
if (hour12 == 0) hour12 = 12; // 0 → 12, 12 → 12
// Result: 1..12 always
```

### Next-Hour Wrap

```csharp
// For phrases like "a quarter before {h1}"
int nextHour12 = (hour12 % 12) + 1;
// hour12=12 → nextHour12=1
// hour12=11 → nextHour12=12
// hour12=3  → nextHour12=4
```

### MSTest v4 DataRow Pattern

```csharp
// Source: https://learn.microsoft.com/en-us/dotnet/core/testing/unit-testing-csharp-with-mstest
// MSTest 4.1.0 — [DataRow] attribute for table-driven tests
[TestMethod]
[DataRow(3, 0,  "3 o'clock")]
[DataRow(3, 2,  "3 o'clock")]
[DataRow(3, 3,  "just after 3")]
[DataRow(3, 7,  "just after 3")]
[DataRow(3, 8,  "ten past 3")]   // confirm :10 slot starts at minute 8
public void GetPhrase_BucketBoundaries(int hour, int minute, string expected)
{
    var dt = new DateTime(2000, 1, 1, hour, minute, 0);
    Assert.AreEqual(expected, PhraseEngine.GetPhrase(dt));
}
```

### MSTest Project Scaffold Commands

```bash
# Source: https://learn.microsoft.com/en-us/dotnet/core/testing/unit-testing-csharp-with-mstest
dotnet new mstest -n FuzzyClock.Core.Tests --framework net10.0
# Generates .csproj with: <PackageReference Include="MSTest" Version="4.1.0" />
dotnet test FuzzyClock.Core.Tests/FuzzyClock.Core.Tests.csproj
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| MSTest v1/v2 with separate runner install | MSTest v4 self-contained, supports MTP mode | ~2023–2024 | `dotnet test` works without VSTest adapter install |
| `dotnet test` VSTest mode only | MTP mode in .NET 10 SDK via `global.json` | .NET 10 (2024) | Cleaner CLI for MTP-based frameworks; VSTest mode still the default |
| Separate `xunit.runner.visualstudio` NuGet | xUnit v3 self-contained runner | xUnit v3 (2024) | Fewer NuGet packages; both v2 and v3 still supported |

**Deprecated/outdated:**
- VSTest-only `dotnet test` flow: Not deprecated but no longer the only option. For this project, the default VSTest mode with MSTest 4.x works without any extra configuration.
- `Microsoft.Testing.Platform` MTP mode: Opt-in for .NET 10 via `global.json`. Not needed for this project's scale; omit it to keep setup simple.

---

## Open Questions

1. **Exact wording for the five discretion slots (:10, :25, :35, :40, :50)**
   - What we know: The locked slots establish the register — informal, American English, numerals, no "to/past" split (uses "before" not "to" for :45)
   - What's unclear: Whether "ten past {h}" for :10 fits better than "just past {h}" — both are idiomatic
   - Recommendation: Lock the five phrases before writing tests, since tests are string-equality assertions. Suggested set: `:10 → "ten past {h}"`, `:25 → "almost half past {h}"`, `:35 → "just past half past {h}"`, `:40 → "almost a quarter before {h1}"`, `:50 → "nearly {h1}"`. These are internally consistent with the locked phrases and unambiguous.

2. **Minutes 58–59 bucket assignment**
   - What we know: The bucket table as specified ends at minute 57 (the :55 slot covers 53–57)
   - What's unclear: Whether 58–59 should fall in the :55 bucket (extend to 59) or be handled as a separate edge case
   - Recommendation: Extend the :55 bucket upper bound to 59. "Almost [h+1]" remains correct at minute 58 and 59. This avoids a dead zone in the table and is the simplest correct behavior. Add explicit tests for minutes 58 and 59.

---

## Sources

### Primary (HIGH confidence)
- https://learn.microsoft.com/en-us/dotnet/core/testing/unit-testing-csharp-with-mstest — MSTest v4.1.0 project structure, `[DataRow]` pattern, `dotnet new mstest` scaffold (updated 2026-02-09)
- https://learn.microsoft.com/en-us/dotnet/core/testing/unit-testing-with-dotnet-test — dotnet test VSTest vs MTP modes, .NET 10 SDK behavior (updated 2025-10-15)
- `dotnet --version` output: 10.0.103 — confirmed installed SDK version

### Secondary (MEDIUM confidence)
- https://xunit.net/ — xUnit v3 (3.2.2) current version, .NET 8+ requirement; confirmed xUnit v3 is a viable alternative to MSTest for this project

### Tertiary (LOW confidence)
- None — all claims are supported by official Microsoft Learn documentation or direct SDK inspection.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no external libraries needed; BCL DateTime API is stable and verified via official docs; MSTest 4.1.0 version confirmed from official tutorial scaffold output (2026-02-09 update)
- Architecture: HIGH — static method + separate classlib is canonical .NET pattern; solution/project structure confirmed by official MSTest tutorial
- Pitfalls: HIGH — all five pitfalls are derived directly from the algorithm's arithmetic properties (modulo, boundary inclusion, fallthrough); no third-party library behavior uncertainty

**Research date:** 2026-02-25
**Valid until:** 2026-08-25 (BCL DateTime API and MSTest project structure are stable; valid for ~6 months)
