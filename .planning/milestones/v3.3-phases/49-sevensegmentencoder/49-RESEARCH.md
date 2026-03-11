# Phase 49: SevenSegmentEncoder - Research

**Researched:** 2026-03-10
**Domain:** Pure C# static class + MSTest unit tests
**Confidence:** HIGH

## Summary

Phase 49 is a narrow, self-contained task: implement `SevenSegmentEncoder` as a
`public static class` in `FuzzyClock.Core`, then write 12 MSTest test cases in
`FuzzyClock.Core.Tests`. The entire domain is well-specified in REQUIREMENTS.md
(F2) — the segment bitmask table, exception contract, and test count are all
locked. No external libraries, no WPF, no IO.

The implementation is a single `Encode(char c): byte` method containing a switch
expression over 12 known characters returning hardcoded byte literals. An unsupported
character throws `ArgumentException`. The tests follow the existing `[DataRow]`
pattern used throughout `FuzzyClock.Core.Tests`.

**Primary recommendation:** Implement as a `switch` expression returning byte
literals. Use `Assert.ThrowsException<ArgumentException>()` (MSTest 4.x) for the
exception case — this is the correct pattern for the test framework already in the
project. The colon returns sentinel value `0x80` (note: this is 8 bits, not 7 —
it is fine as a `byte` but the planner should note it is treated specially by the
renderer, not as a segment mask).

<phase_requirements>
## Phase Requirements

| ID  | Description | Research Support |
|-----|-------------|-----------------|
| F2  | `SevenSegmentEncoder.Encode(char): byte` in FuzzyClock.Core; 7-bit masks for digits 0–9, colon sentinel 0x80, space 0x00; throws `ArgumentException` for unsupported chars | Fully specified in REQUIREMENTS.md; static switch expression pattern is standard for this project |
| F10 | 12 MSTest unit tests: 10 digits + colon + space + 1 unsupported-char exception case | MSTest 4.0.1 already present; `Assert.ThrowsException<T>()` is the correct assertion; `[DataRow]` for bulk cases |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| MSTest  | 4.0.1   | Unit test framework | Already in FuzzyClock.Core.Tests.csproj |
| .NET    | net10.0 | Target framework | Project-wide standard |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none)  | —       | —       | No additional packages needed |

**Installation:** No new packages. All dependencies already present.

## Architecture Patterns

### Recommended Project Structure

New files:

```
FuzzyClock.Core/
└── SevenSegmentEncoder.cs         # new static class

FuzzyClock.Core.Tests/
└── SevenSegmentEncoderTests.cs    # new test class
```

### Pattern 1: Static Class with Switch Expression (matches project conventions)

**What:** A `public static class` with one `public static` method using a C# switch
expression to map characters to byte literals. This matches `DialGeometry`,
`DateFormatter`, and `UptimeFormatter` — all static classes with pure functions.

**When to use:** Always — this is the established pattern for Core pure logic.

**Example (mirroring DateFormatter pattern):**
```csharp
// Mirrors FuzzyClock.Core/DateFormatter.cs style
namespace FuzzyClock.Core;

public static class SevenSegmentEncoder
{
    public static byte Encode(char c) => c switch
    {
        '0' => 0x3F,
        '1' => 0x06,
        '2' => 0x5B,
        '3' => 0x4F,
        '4' => 0x66,
        '5' => 0x6D,
        '6' => 0x7D,
        '7' => 0x07,
        '8' => 0x7F,
        '9' => 0x6F,
        ':' => 0x80,
        ' ' => 0x00,
        _   => throw new ArgumentException($"Unsupported character: '{c}'", nameof(c))
    };
}
```

### Pattern 2: DataRow for Bulk Character Tests (matches project conventions)

**What:** Use a single `[TestMethod]` with multiple `[DataRow]` attributes for the
12 known characters, then a separate method for the exception case. This matches
`UptimeFormatterTests` and `DialGeometryTests` style.

**When to use:** Any time the same assertion logic applies across many inputs.

**Example:**
```csharp
// Mirrors FuzzyClock.Core.Tests/DialGeometryTests.cs style
namespace FuzzyClock.Core.Tests;

[TestClass]
public class SevenSegmentEncoderTests
{
    [TestMethod]
    [DataRow('0', (byte)0x3F)]
    [DataRow('1', (byte)0x06)]
    // ... all 12 chars
    public void Encode_KnownCharacter_ReturnsExpectedMask(char c, byte expected)
    {
        Assert.AreEqual(expected, SevenSegmentEncoder.Encode(c));
    }

    [TestMethod]
    public void Encode_UnsupportedCharacter_ThrowsArgumentException()
    {
        Assert.ThrowsException<ArgumentException>(() => SevenSegmentEncoder.Encode('X'));
    }
}
```

### Anti-Patterns to Avoid

- **Dictionary lookup:** Don't use `Dictionary<char, byte>` — the switch expression
  is idiomatic C# for this pattern and what the rest of the project uses.
- **Byte arithmetic/bit manipulation to compute masks:** All 12 masks are fixed
  constants; hard-code them from the REQUIREMENTS.md table.
- **Splitting DataRows across multiple test methods:** One `[DataRow]`-decorated
  method covers all 12 known characters; one separate method covers the exception.
  That gives 12 test cases total as required (the DataRow bulk method counts once
  per DataRow in MSTest's test runner).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Exception assertion | `try/catch` in test | `Assert.ThrowsException<ArgumentException>()` | MSTest 4.x built-in; cleaner, fails on wrong exception type |
| Segment mask validation | Runtime bit-count checks | Hardcoded constants from spec | The table in REQUIREMENTS.md is authoritative |

**Key insight:** Every mask is fully specified in REQUIREMENTS.md. There is nothing
to compute or derive at runtime.

## Common Pitfalls

### Pitfall 1: DataRow byte literal casting
**What goes wrong:** C# `[DataRow]` attributes require `(byte)0x3F` explicit cast
for `byte` parameters, not just `0x3F` (which is `int`). Without the cast the
compiler or MSTest runner may fail to match the parameter type.
**Why it happens:** `DataRow` uses `object[]`; MSTest 4.x does coerce `int` to
`byte` at runtime, but explicit `(byte)` casts make intent clear and prevent
surprises.
**How to avoid:** Cast every hex literal in DataRow attributes: `[DataRow('0', (byte)0x3F)]`.
**Warning signs:** `ArgumentException` or `InvalidCastException` from test runner
infrastructure at test discovery time.

### Pitfall 2: Colon mask is 0x80 (8th bit set — not a 7-bit segment mask)
**What goes wrong:** `0x80` sets bit 7, which is outside the 7-segment a–g range
(bits 0–6). It is intentionally a sentinel — the renderer special-cases it. If
someone tries to use it as a segment mask it will appear to light no segments.
**Why it happens:** The colon character is rendered as two dots, not via segment bits.
**How to avoid:** Document this in the class XML comment. The test just verifies the
return value equals `0x80`.
**Warning signs:** Future renderer code reading bit 7 from the mask.

### Pitfall 3: Missing unsupported-character exception test
**What goes wrong:** Implementing only the 12 DataRow happy-path cases and omitting
the `ArgumentException` case gives 12 test cases but doesn't satisfy F10's "one
unsupported-char exception case".
**Why it happens:** The DataRow approach makes the happy path easy to over-count.
**How to avoid:** Add a dedicated `[TestMethod]` for the exception case. The 12
DataRow rows + 1 exception method = 13 test methods but 12 DataRow cases + 1 = 13
test executions. Re-read F10: "12 cases — all 10 digits, colon, space; one
unsupported-char exception case" = 13 total test cases. Implement accordingly.

### Pitfall 4: Namespace mismatch
**What goes wrong:** Placing `SevenSegmentEncoder` in the wrong namespace (e.g.
`FuzzyClock.App` instead of `FuzzyClock.Core`).
**Why it happens:** IDE scaffolding may default to project name.
**How to avoid:** `namespace FuzzyClock.Core;` — matches every other file in the
Core project.

## Code Examples

Verified patterns from project source:

### Static class declaration (source: FuzzyClock.Core/DateFormatter.cs)
```csharp
namespace FuzzyClock.Core;

public static class DateFormatter
{
    public static string Format(string format, DateTime date) => format switch
    {
        ...
        _ => date.ToString("ddd, MMM d"),
    };
}
```

### Test class with DataRow (source: FuzzyClock.Core.Tests/DialGeometryTests.cs)
```csharp
[TestClass]
public class DialGeometryTests
{
    [TestMethod]
    [DataRow(12, 0, 0.0, 0.0)]
    [DataRow(3,  0, 90.0, 0.0)]
    public void CardinalPositions_CorrectAngles(int hour, int minute, double expectedHour, double expectedMinute)
    {
        Assert.AreEqual(expectedHour, DialGeometry.GetHourAngleDegrees(hour, minute), 1e-9);
    }
}
```

### Exception assertion (MSTest 4.x — first use in this project)
```csharp
[TestMethod]
public void Encode_UnsupportedCharacter_ThrowsArgumentException()
{
    Assert.ThrowsException<ArgumentException>(() => SevenSegmentEncoder.Encode('X'));
}
```

## Segment Mask Reference Table

Directly from REQUIREMENTS.md F2 — authoritative, HIGH confidence:

| Char | Segments lit       | Mask  | Binary      |
|------|--------------------|-------|-------------|
| `0`  | a,b,c,d,e,f        | 0x3F  | 0b0011_1111 |
| `1`  | b,c                | 0x06  | 0b0000_0110 |
| `2`  | a,b,d,e,g          | 0x5B  | 0b0101_1011 |
| `3`  | a,b,c,d,g          | 0x4F  | 0b0100_1111 |
| `4`  | b,c,f,g            | 0x66  | 0b0110_0110 |
| `5`  | a,c,d,f,g          | 0x6D  | 0b0110_1101 |
| `6`  | a,c,d,e,f,g        | 0x7D  | 0b0111_1101 |
| `7`  | a,b,c              | 0x07  | 0b0000_0111 |
| `8`  | a,b,c,d,e,f,g      | 0x7F  | 0b0111_1111 |
| `9`  | a,b,c,d,f,g        | 0x6F  | 0b0110_1111 |
| `:`  | sentinel (2 dots)  | 0x80  | 0b1000_0000 |
| `' '`| none              | 0x00  | 0b0000_0000 |

Bit-to-segment mapping (bit 0 = LSB):
- bit 0 = a (top horizontal)
- bit 1 = b (top-right vertical)
- bit 2 = c (bottom-right vertical)
- bit 3 = d (bottom horizontal)
- bit 4 = e (bottom-left vertical)
- bit 5 = f (top-left vertical)
- bit 6 = g (middle horizontal)
- bit 7 = colon sentinel (not a segment)

## Test Case Inventory

F10 requires 12 cases in `SevenSegmentEncoderTests`. The exact count from the
requirement reads: "10 digits, colon, space; one unsupported-char exception case."
That is 10 + 1 + 1 = 12 known-character cases + 1 exception = 13 test executions.

Recommended approach: one `[DataRow]`-decorated test method with 12 rows (all
10 digits + colon + space), plus one standalone exception test method. MSTest counts
each DataRow invocation separately, so this gives 12 + 1 = 13 test runs (net new
tests from this phase: 13; project total moves from 224 to 237, which satisfies
the ≥ 235 target before later phases add more).

## Open Questions

1. **Exact new test count vs ≥ 235 target**
   - What we know: 224 tests after Phase 48. F10 adds 12 SevenSegmentEncoder cases
     (the exception case is the 13th execution but may be a 13th test method).
     REQUIREMENTS.md says "12 cases" in the SevenSegmentEncoder bullet.
   - What's unclear: Whether the exception method is counted as a 13th case or is
     included in the "12". F10 text: "12 cases — all 10 digits, colon, space; one
     unsupported-char exception case." This reads as 12 named known-char cases plus
     1 exception = 13 total, but could be read as 12 total with the exception included.
   - Recommendation: Implement 12 DataRow rows + 1 exception method (13 test
     executions). If the requirement means 12 total, drop one DataRow row (unlikely
     intent). Either way ≥ 235 is satisfied.

## Sources

### Primary (HIGH confidence)
- `.planning/REQUIREMENTS.md` — complete F2 and F10 specification including all masks
- `FuzzyClock.Core/DateFormatter.cs` — static class pattern to mirror
- `FuzzyClock.Core.Tests/DialGeometryTests.cs` — DataRow test pattern to mirror
- `FuzzyClock.Core.Tests/FuzzyClock.Core.Tests.csproj` — MSTest 4.0.1, net10.0, ImplicitUsings, `Using` for MSTest namespace

### Secondary (MEDIUM confidence)
- MSTest 4.x documentation: `Assert.ThrowsException<T>(Action)` is the canonical
  exception assertion (replaces `[ExpectedException]` attribute which is considered
  legacy in MSTest 3+)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all dependencies already in project; no new packages
- Architecture: HIGH — masks fully specified in requirements; pattern directly mirrors existing static classes
- Pitfalls: HIGH — DataRow byte casting and colon sentinel are concrete, verifiable issues

**Research date:** 2026-03-10
**Valid until:** 2026-06-10 (stable domain — pure C# with no external dependencies)
