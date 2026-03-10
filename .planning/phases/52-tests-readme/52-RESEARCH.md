# Phase 52: Tests + README — Research

**Researched:** 2026-03-11
**Domain:** MSTest unit tests (C# / MSTest 4.x) + README documentation
**Confidence:** HIGH

## Summary

Phase 52 closes out v3.3 LCD Clock by adding the test coverage and README documentation that
was intentionally deferred from the implementation phases. There are two work streams: (1) write
unit tests for `AppSettings` round-trip on the new LCD fields and for `LcdTimeFormatHelper`
formatting logic, and (2) update the README to describe the LCD clock type.

A blocking gap exists in the current codebase: `AppSettings` is missing the `LcdSize` field even
though the requirements list it as one of the five new fields. This must be added before the
round-trip test can be written. The `LcdTimeFormatHelper` class is `internal`, which prevents
tests in `FuzzyClock.App.Tests` from accessing it without an `InternalsVisibleTo` declaration or a
visibility change to `public`.

The current test count is 237 (25 App + 212 Core). The requirement target is >= 235 total, which
is already exceeded. Adding the new tests will bring the count to approximately 246 or higher.

**Primary recommendation:** Add `LcdSize` to `AppSettings`, make `LcdTimeFormatHelper` public (or
add `InternalsVisibleTo`), write 9 new tests across `AppSettingsTests` and a new
`LcdTimeFormatHelperTests` class, and update README.

<phase_requirements>
## Phase Requirements

| ID  | Description | Research Support |
|-----|-------------|-----------------|
| F10 | AppSettings round-trip for ClockType, LcdTheme, LcdUse24Hr, LcdShowSeconds, LcdSize (5 cases); LcdTimeFormat helper tests 12/24hr with/without seconds (4 cases); target >= 235 total tests | Existing AppSettingsTests pattern supports direct extension; LcdTimeFormatHelper.FormatTime() is pure static, fully testable; InternalsVisibleTo or visibility change needed |
| F11 | README: new "LCD Clock" section with theme list, 12/24hr + seconds options, size variants; Nixie backlog note; updated test count | Existing README structure established; no new libraries required |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| MSTest | 4.0.1 | Test framework | Already in use in both test projects |
| System.Text.Json | (built-in .NET 10) | JSON round-trip serialization | Already used in AppSettingsTests |

### No New Dependencies
All work is additive to existing test files and the README. No new NuGet packages required.

**Test run command:**
```bash
dotnet test FuzzyClock.slnx
```

## Architecture Patterns

### Test Project Placement
- `AppSettings` round-trip tests → `FuzzyClock.App.Tests/AppSettingsTests.cs` (extend existing class)
- `LcdTimeFormatHelper` tests → `FuzzyClock.App.Tests/LcdTimeFormatHelperTests.cs` (new file)

### Pattern: AppSettings Round-Trip Test (from existing AppSettingsTests.cs)
**What:** Construct a fully-populated `AppSettings` record, serialize to JSON, deserialize, assert each field matches.
**When to use:** Every new persisted field needs coverage in `RoundTrip_FullyPopulated_AllFieldsMatch` plus an absent-field default test.

Existing test already covers `ClockType` (see STEST-01 at line 36 of AppSettingsTests.cs —
`ClockType = ClockType.Dial` is already in the fully-populated fixture). New fields to add to
that fixture: `LcdTheme`, `LcdUse24Hr`, `LcdShowSeconds`, `LcdSize`.

```csharp
// Extend the existing fixture in RoundTrip_FullyPopulated_AllFieldsMatch
var original = new AppSettings
{
    // ... existing fields ...
    LcdTheme      = LcdTheme.Amber,
    LcdUse24Hr    = true,
    LcdShowSeconds = false,
    LcdSize       = LcdSize.Large,
};
// Add assertions:
Assert.AreEqual(original.LcdTheme,        result.LcdTheme,        "LcdTheme");
Assert.AreEqual(original.LcdUse24Hr,      result.LcdUse24Hr,      "LcdUse24Hr");
Assert.AreEqual(original.LcdShowSeconds,  result.LcdShowSeconds,  "LcdShowSeconds");
Assert.AreEqual(original.LcdSize,         result.LcdSize,         "LcdSize");
```

Separate absent-field default tests follow the existing STEST-02 pattern:

```csharp
[TestMethod]
public void Deserialize_MissingLcdTheme_DefaultsToGreen()
{
    const string json = """{"FontSize":32}""";
    var result = JsonSerializer.Deserialize<AppSettings>(json)!;
    Assert.AreEqual(LcdTheme.Green, result.LcdTheme);
}
```

### Pattern: LcdTimeFormatHelper Tests
**What:** `LcdTimeFormatHelper.FormatTime(DateTime, bool use24Hr, bool showSeconds)` is pure static — no setup needed.
**When to use:** Four cases cover all combinations of the two boolean parameters.

```csharp
[TestClass]
public class LcdTimeFormatHelperTests
{
    private static readonly DateTime _sample = new DateTime(2026, 3, 11, 14, 5, 9);
    // 2:05:09 PM -> 12hr " 2:05:09", 24hr "14:05:09"

    [TestMethod]
    public void Format_24Hr_WithSeconds() =>
        Assert.AreEqual("14:05:09", LcdTimeFormatHelper.FormatTime(_sample, use24Hr: true,  showSeconds: true));

    [TestMethod]
    public void Format_24Hr_NoSeconds() =>
        Assert.AreEqual("14:05",    LcdTimeFormatHelper.FormatTime(_sample, use24Hr: true,  showSeconds: false));

    [TestMethod]
    public void Format_12Hr_WithSeconds() =>
        Assert.AreEqual(" 2:05:09", LcdTimeFormatHelper.FormatTime(_sample, use24Hr: false, showSeconds: true));

    [TestMethod]
    public void Format_12Hr_NoSeconds() =>
        Assert.AreEqual(" 2:05",    LcdTimeFormatHelper.FormatTime(_sample, use24Hr: false, showSeconds: false));
}
```

**Hour boundary cases to consider:** Hour 12 in 12hr mode should produce "12" not " 0". Hour 0
in 12hr mode (midnight) should produce "12" not " 0". These are edge cases the 4 required tests
do not cover but could be included as bonus coverage.

### Pattern: LcdTheme enum serialization
`LcdTheme` uses `[JsonConverter(typeof(JsonStringEnumConverter))]` in AppSettings (verified in
AppSettings.cs line 26-27 and 29). The round-trip test will confirm string serialization of the
enum works correctly.

### Anti-Patterns to Avoid
- **Testing WPF controls directly from App.Tests:** `SevenSegmentDigit` and `LcdClockView` are
  WPF UserControls that require a UI thread / Dispatcher; do not attempt to instantiate them in
  tests. Only `LcdTimeFormatHelper` (pure static) and `AppSettings` (plain record) are safely
  testable without a dispatcher.
- **Adding LcdSize default test before adding LcdSize to AppSettings:** `LcdSize` is currently
  absent from AppSettings.cs. The field must be added first before any test for it can compile.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON round-trip verification | Custom serializer checks | `System.Text.Json` + existing AppSettings pattern | Already established in AppSettingsTests |
| Time formatting edge cases | Manual string construction in tests | `new DateTime(...)` with known values | Deterministic, readable |

## Common Pitfalls

### Pitfall 1: LcdSize Missing from AppSettings
**What goes wrong:** Compilation error in `AppSettingsTests` when trying to set `LcdSize` in the
fixture — the property does not exist.
**Why it happens:** AppSettings.cs was not updated in Phase 51 to include `LcdSize`. The current
AppSettings.cs (verified by direct read) has `LcdTheme`, `LcdUse24Hr`, `LcdShowSeconds`, but no
`LcdSize`.
**How to avoid:** Add `public LcdSize LcdSize { get; init; } = LcdSize.Medium;` to AppSettings.cs
as a prerequisite step (Wave 0). Also add `[JsonConverter(typeof(JsonStringEnumConverter))]`
decorator since `LcdSize` is an enum.
**Warning signs:** `error CS1061: 'AppSettings' does not contain a definition for 'LcdSize'`

### Pitfall 2: LcdTimeFormatHelper is internal
**What goes wrong:** `LcdTimeFormatHelperTests` fails to compile because `LcdTimeFormatHelper` is
declared `internal static class` in `FuzzyClock.App/LcdTimeFormatHelper.cs`. The test project
`FuzzyClock.App.Tests` is a separate assembly and cannot see `internal` members.
**Why it happens:** No `InternalsVisibleTo` is declared in FuzzyClock.App's AssemblyInfo.cs and
the class was written as `internal`.
**How to avoid:** Two options (use option A):
  - **Option A (recommended):** Change `internal static class LcdTimeFormatHelper` to
    `public static class LcdTimeFormatHelper`. This is a pure logic helper with no security
    concern.
  - **Option B:** Add `[assembly: InternalsVisibleTo("FuzzyClock.App.Tests")]` to
    `FuzzyClock.App/AssemblyInfo.cs`.
**Warning signs:** `error CS0122: 'LcdTimeFormatHelper' is inaccessible due to its protection level`

### Pitfall 3: LcdTheme enum needs JsonConverter decorator on LcdSize too
**What goes wrong:** `LcdSize` serializes as integer (0/1/2) rather than string ("Small"/"Medium"/"Large") in JSON.
**Why it happens:** Without `[JsonConverter(typeof(JsonStringEnumConverter))]`, `System.Text.Json` defaults to integer serialization for enums.
**How to avoid:** When adding `LcdSize` to AppSettings, add the same decorator that `LcdTheme` has (line 26-27 of AppSettings.cs shows the pattern).

### Pitfall 4: RoundTrip test fixture doesn't cover all new fields
**What goes wrong:** Absent-field default tests pass but the round-trip test silently misses new fields.
**Why it happens:** The existing `RoundTrip_FullyPopulated_AllFieldsMatch` test fixture must be manually extended with non-default values for each new field.
**How to avoid:** Use non-default values in the fixture (e.g., `LcdTheme.Amber` not `Green`, `LcdUse24Hr = true` not `false`, `LcdShowSeconds = false` not `true`, `LcdSize.Large` not `Medium`) so that a missing assertion would produce a detectable wrong-default result.

### Pitfall 5: README test count is stale
**What goes wrong:** README says "122 unit tests" (set in Phase 38/40, never updated for phases 41-51).
**Why it happens:** Docs were not updated in milestone v3.2 or v3.3 phases.
**How to avoid:** Run `dotnet test` after writing all new tests and report the actual total count.
Current count before Phase 52 tests: **237 tests** (25 App + 212 Core, verified by running `dotnet test --no-build`).

## Code Examples

### AppSettings — LcdSize field to add
```csharp
// In FuzzyClock.App/AppSettings.cs, after LcdShowSeconds:
[JsonConverter(typeof(JsonStringEnumConverter))]
public LcdSize LcdSize { get; init; } = LcdSize.Medium;
```

### LcdTimeFormatHelper — verified implementation (source: LcdTimeFormatHelper.cs)
```csharp
// 12hr mode: hour 14 (2 PM) -> " 2", hour 12 -> "12", hour 0 (midnight) -> "12"
int h = now.Hour % 12;
if (h == 0) h = 12;
string hourStr = h < 10 ? $" {h}" : $"{h}";
// With seconds: " 2:05:09"
// Without:      " 2:05"
```

### LcdTimeFormatHelper test — complete 4-case class
```csharp
using FuzzyClock.App;

namespace FuzzyClock.App.Tests;

[TestClass]
public class LcdTimeFormatHelperTests
{
    // 14:05:09 = 2:05:09 PM
    private static readonly DateTime _pm = new DateTime(2026, 3, 11, 14, 5, 9);

    [TestMethod]
    public void Format_24Hr_WithSeconds_ReturnsZeroPaddedHHMMSS()
        => Assert.AreEqual("14:05:09", LcdTimeFormatHelper.FormatTime(_pm, use24Hr: true, showSeconds: true));

    [TestMethod]
    public void Format_24Hr_NoSeconds_ReturnsZeroPaddedHHMM()
        => Assert.AreEqual("14:05", LcdTimeFormatHelper.FormatTime(_pm, use24Hr: true, showSeconds: false));

    [TestMethod]
    public void Format_12Hr_WithSeconds_ReturnsSpacePaddedHMMSS()
        => Assert.AreEqual(" 2:05:09", LcdTimeFormatHelper.FormatTime(_pm, use24Hr: false, showSeconds: true));

    [TestMethod]
    public void Format_12Hr_NoSeconds_ReturnsSpacePaddedHMM()
        => Assert.AreEqual(" 2:05", LcdTimeFormatHelper.FormatTime(_pm, use24Hr: false, showSeconds: false));
}
```

### README LCD Clock section structure
```markdown
## LCD Clock

*Screenshot placeholder — v3.3*

A retro 7-segment LCD clock type, rendered entirely with WPF polygon geometry (no fonts or bitmaps).

### Themes

| Theme | Lit color | Background |
|-------|-----------|------------|
| Green | `#00FF41` | `#001A00`  |
| Amber | `#FFAA00` | `#1A0A00`  |
| Blue  | `#00CFFF` | `#00001A`  |
| Teal  | `#00B4B4` | `#001010`  |
| Red   | `#FF2200` | `#1A0000`  |

Ghost (inactive) segments are always visible at a dimmed color — a hallmark of real LCD hardware.

### Size, format, and seconds

| Setting | Options |
|---------|---------|
| Size | Small (32px) / Medium (48px) / Large (64px) |
| Hour format | 12hr (space-padded) or 24hr (zero-padded) |
| Show seconds | Appends `:SS` to the display |

### Backlog

> **Nixie-style clock** — a warm-glow Nixie tube variant is planned for a future milestone.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `Assert.ThrowsException<T>()` | `Assert.Throws<T>()` | MSTest 4.0 | Use `Assert.Throws<T>()` — the old API was removed |
| `bool DialMode` in AppSettings | `ClockType` enum | Phase 48 | Round-trip test fixture uses `ClockType`, not `DialMode` |

## Open Questions

1. **Should LcdSize use `[JsonConverter(typeof(JsonStringEnumConverter))]`?**
   - What we know: LcdTheme uses it (AppSettings.cs line 26). LcdSize is also an enum. Consistent treatment is correct.
   - What's unclear: Nothing — the answer is yes.
   - Recommendation: Add the decorator.

2. **Should absent-field default tests be separate test methods or data-driven?**
   - What we know: Existing pattern uses one method per field (STEST-02, STEST-08).
   - Recommendation: Continue the pattern — one method per new absent-field default (LcdTheme, LcdUse24Hr, LcdShowSeconds, LcdSize). This gives 4 new absent-field tests plus 1 round-trip extension = 5 new AppSettings test cases, matching F10.

## Sources

### Primary (HIGH confidence)
- Direct read of `FuzzyClock.App/AppSettings.cs` — verified current fields
- Direct read of `FuzzyClock.App/LcdTimeFormatHelper.cs` — verified implementation and `internal` access modifier
- Direct read of `FuzzyClock.App.Tests/AppSettingsTests.cs` — verified existing test patterns
- Direct read of `FuzzyClock.Core.Tests/SevenSegmentEncoderTests.cs` — verified `Assert.Throws<T>()` API usage
- `dotnet test --no-build` output — verified current test count: 237 (25 App + 212 Core)
- Direct read of `README.md` — verified current state and stale test count (122)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; all patterns verified from existing files
- Architecture: HIGH — test placement, class access, and field gaps all confirmed by code inspection
- Pitfalls: HIGH — LcdSize absence and internal visibility confirmed by reading source files

**Research date:** 2026-03-11
**Valid until:** 2026-04-10 (stable domain — no external dependencies changing)
