# Phase 41: PhraseEngine Provider Refactor - Research

**Researched:** 2026-03-08
**Domain:** C# interface extraction / provider pattern refactor on a pure-static class
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- When `SetLocale("fr")` is called but no French provider is registered, silently keep the current active provider — no exception, no fallback to English Classic
- `SetLocale()` returns `bool`: `true` = locale accepted and provider swapped, `false` = locale unknown (provider unchanged)
- Default locale on startup: `"en-classic"` — hardcoded, maps to `EnglishPhraseProvider`, preserves existing behavior
- `PhraseEngine` exposes a `CurrentLocale` string property so callers and tests can verify which locale is active

### Claude's Discretion

- Which methods belong on `IPhraseProvider` (GetPhrase, GetStructuredPhrase, or others) — Claude determines based on current PhraseEngine surface
- How providers are registered (hard-coded, dictionary, etc.) — Claude picks the simplest approach that keeps tests green
- Whether test files are literally unmodified or just logically equivalent — Claude ensures all 122 assertions still hold; minor restructuring of test helpers is acceptable if needed

### Deferred Ideas (OUT OF SCOPE)

- None — discussion stayed within phase scope
</user_constraints>

---

## Summary

`PhraseEngine` is currently a pure `static` class in `FuzzyClock.Core` with two public methods: `GetPhrase(DateTime)` and `GetStructuredPhrase(DateTime)`. All 51 phrase-related tests call these methods as static members on the class. The refactor must extract an `IPhraseProvider` interface, move the English Classic logic into `EnglishPhraseProvider`, and convert `PhraseEngine` from a static dispatch class to an instance-based coordinator that holds the active provider and routes calls through it.

The critical constraint is that `MainWindow.xaml.cs` calls `PhraseEngine.GetPhrase(dt)` and `PhraseEngine.GetStructuredPhrase(dt)` as static calls in four places. These four call sites must continue to work after the refactor — either by keeping `PhraseEngine` as a static facade that delegates to the active provider, or by making the App hold an instance. The simplest approach (lowest App-touch risk) is a static facade: `PhraseEngine` becomes a static class with a private `_activeProvider` field and public static `GetPhrase`/`GetStructuredPhrase` that delegate to it. `SetLocale()` and `CurrentLocale` are then also static members. This requires zero changes to `MainWindow.xaml.cs` and means the 122 existing tests remain green without modification.

Provider registration can be a simple `Dictionary<string, IPhraseProvider>` initialized at class construction with `"en-classic"` mapped to `new EnglishPhraseProvider()`. No DI container, no dynamic loading — just a private static dictionary seeded once in the static constructor. This is the minimum viable shape that unblocks STYLE-01–04 and LANG-01–04 in later phases: each new style/language adds a new class implementing `IPhraseProvider` and a new entry in the dictionary.

**Primary recommendation:** Static facade pattern — keep `PhraseEngine` as a static class, move phrase data and resolution logic into `EnglishPhraseProvider : IPhraseProvider`, and route `PhraseEngine.GetPhrase/GetStructuredPhrase` through `_activeProvider`. Zero changes to MainWindow or existing tests.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| .NET 10 C# | 10.0 (already in use) | Interface extraction, static class pattern | Project baseline; no new dependencies needed |
| MSTest 4.0.1 | 4.0.1 (already in use) | Test regression gate | Already installed in FuzzyClock.Core.Tests |

No new NuGet packages are required for this refactor.

### Supporting

No supporting libraries needed. This is a pure C# structural refactor with no I/O, no external dependencies, and no new framework surface.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Static facade (`PhraseEngine` stays static) | Convert to instance + inject into MainWindow | Instance injection requires touching MainWindow.xaml.cs, App.xaml.cs — higher risk, out of scope for infrastructure phase |
| Dictionary registration | Hard-coded switch in SetLocale | Dictionary is more extensible; switch would need modification for each new locale in phases 45–46 |

---

## Architecture Patterns

### Recommended Project Structure

```
FuzzyClock.Core/
├── IPhraseProvider.cs          # new: interface definition
├── EnglishPhraseProvider.cs    # new: English Classic logic (moved from PhraseEngine)
└── PhraseEngine.cs             # modified: static facade, routes through active provider
```

No new folders. All three files live in the `FuzzyClock.Core` project root alongside `DateFormatter.cs`.

### Pattern 1: Static Facade with Provider Dictionary

**What:** `PhraseEngine` remains a static class. Internal state (`_activeProvider`, `_currentLocale`, `_providers` dictionary) is held as `private static` fields. Public API surface (`GetPhrase`, `GetStructuredPhrase`, `SetLocale`, `CurrentLocale`) is unchanged from the caller's perspective — they are all still accessed as `PhraseEngine.X`.

**When to use:** When existing call sites must not change and the class is not unit-tested via constructor injection. Correct here because all four App call sites use static dispatch.

**Example:**

```csharp
// FuzzyClock.Core/IPhraseProvider.cs
namespace FuzzyClock.Core;

public interface IPhraseProvider
{
    string GetPhrase(DateTime dt);
    (string Qualifier, string Emphasis) GetStructuredPhrase(DateTime dt);
}
```

```csharp
// FuzzyClock.Core/EnglishPhraseProvider.cs
namespace FuzzyClock.Core;

public class EnglishPhraseProvider : IPhraseProvider
{
    // All HourWords[], Buckets[], GetPhrase logic, and GetStructuredPhrase logic
    // moved verbatim from PhraseEngine.cs
    public string GetPhrase(DateTime dt) { ... }
    public (string Qualifier, string Emphasis) GetStructuredPhrase(DateTime dt) { ... }
}
```

```csharp
// FuzzyClock.Core/PhraseEngine.cs (after refactor)
namespace FuzzyClock.Core;

public static class PhraseEngine
{
    private static readonly Dictionary<string, IPhraseProvider> _providers = new()
    {
        ["en-classic"] = new EnglishPhraseProvider()
    };

    private static IPhraseProvider _activeProvider = _providers["en-classic"];
    public static string CurrentLocale { get; private set; } = "en-classic";

    public static bool SetLocale(string locale)
    {
        if (!_providers.TryGetValue(locale, out var provider))
            return false;
        _activeProvider = provider;
        CurrentLocale = locale;
        return true;
    }

    public static string GetPhrase(DateTime dt) =>
        _activeProvider.GetPhrase(dt);

    public static (string Qualifier, string Emphasis) GetStructuredPhrase(DateTime dt) =>
        _activeProvider.GetStructuredPhrase(dt);
}
```

### Pattern 2: Test Coverage Strategy

**What:** Existing `PhraseEngineTests` and `GetStructuredPhraseTests` call `PhraseEngine.GetPhrase(...)` and `PhraseEngine.GetStructuredPhrase(...)` — both static methods on the facade. After refactor, these calls still compile and still delegate to `EnglishPhraseProvider` via `_activeProvider`. All 51 phrase assertions pass without modification.

**New tests to add:** A small set of `PhraseEngine` coordinator tests covering:
- `CurrentLocale` returns `"en-classic"` on startup
- `SetLocale("en-classic")` returns `true`
- `SetLocale("fr")` returns `false` and `CurrentLocale` is still `"en-classic"`
- `GetPhrase` / `GetStructuredPhrase` output is identical before and after `SetLocale("en-classic")` round-trip

These new tests live in a new file: `FuzzyClock.Core.Tests/PhraseEngineCoordinatorTests.cs`.

### Anti-Patterns to Avoid

- **Converting PhraseEngine to non-static:** If `PhraseEngine` becomes `class` (not `static`), all four `MainWindow.xaml.cs` call sites fail to compile. Static facade is the correct shape.
- **Exposing `_providers` dictionary publicly:** Future phases add providers internally. Public mutation of the registry is not needed and opens risk.
- **Duplicating logic:** The entire `HourWords[]`, `Buckets[]`, `GetPhrase`, and `GetStructuredPhrase` implementations move to `EnglishPhraseProvider` verbatim. `PhraseEngine` contains none of the phrase resolution logic after the refactor — only routing.
- **Making `IPhraseProvider` too broad:** Only `GetPhrase` and `GetStructuredPhrase` belong on the interface. `SetLocale`, `CurrentLocale`, and provider registration are coordinator concerns, not provider concerns.
- **Adding `RegisterProvider()` as public API now:** Premature. Phases 45–46 will add new providers directly inside `PhraseEngine.cs`. Public registration is not needed for v3.2.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Provider discovery / DI | Custom service locator or MEF | Simple private dictionary | DI is overkill for 2–6 known providers; dictionary is readable, fast, testable |
| Version compatibility shims | Adapter layer around IPhraseProvider | Direct implementation | All providers are in-process, in the same assembly or a sibling; no versioning mismatch |

**Key insight:** This refactor is structural, not behavioral. The goal is a seam for future extension, not a new runtime system. The simplest thing that creates the seam without touching MainWindow is correct.

---

## Common Pitfalls

### Pitfall 1: Static initializer order — `_activeProvider` set before `_providers` is populated

**What goes wrong:** If `_activeProvider` is a field initializer that runs before `_providers` is initialized, `new EnglishPhraseProvider()` assignment order could theoretically fail in edge cases with complex field initializer ordering.

**Why it happens:** C# field initializers run in declaration order within a class. If `_providers` is declared after `_activeProvider`, `_activeProvider` would reference a null dictionary lookup.

**How to avoid:** Declare `_providers` first in the class body, then `_activeProvider = _providers["en-classic"]`, then `CurrentLocale`. Or use a static constructor to sequence initialization explicitly.

**Warning signs:** `NullReferenceException` or `KeyNotFoundException` on first call to `GetPhrase` at startup.

### Pitfall 2: Test file imports compile but call wrong target

**What goes wrong:** `PhraseEngineTests.cs` calls `PhraseEngine.GetPhrase(...)`. After refactor, if the static methods are removed or renamed, tests get compile errors. Easy to overlook if the rename is partial.

**Why it happens:** Refactoring tools rename the class members in the implementation but forget the static delegation methods on the facade.

**How to avoid:** Keep the public signature of `PhraseEngine` identical to the pre-refactor signature: `public static string GetPhrase(DateTime dt)` and `public static (string Qualifier, string Emphasis) GetStructuredPhrase(DateTime dt)`. Do not change method names, return types, or parameter types.

**Warning signs:** Any compile error in `PhraseEngineTests.cs` or `GetStructuredPhraseTests.cs` is a regression signal.

### Pitfall 3: `SetLocale` state leaks between tests

**What goes wrong:** New `PhraseEngineCoordinatorTests` call `SetLocale("xx")` to test the false-return path, leaving `_currentLocale` in an unexpected state. If test execution order is not isolated, subsequent tests that assume `"en-classic"` observe a different locale.

**Why it happens:** `PhraseEngine` is a static class — its state persists across all test methods in the process. MSTest parallelization (`Scope = ExecutionScope.MethodLevel` in `MSTestSettings.cs`) can cause interleaving.

**How to avoid:** Each coordinator test that calls `SetLocale` must reset to `"en-classic"` in a `[TestCleanup]` method (or a try/finally block). Alternatively, since `SetLocale("xx")` returns `false` and does not change state, tests for the false path are safe by design — but the true-path test (`SetLocale("en-classic")`) must still reset.

**Warning signs:** Flaky test failures in other PhraseEngine test classes that pass when run in isolation.

### Pitfall 4: `EnglishPhraseProvider` placed in wrong namespace or assembly

**What goes wrong:** If `EnglishPhraseProvider` is accidentally placed in `FuzzyClock.App` instead of `FuzzyClock.Core`, the `FuzzyClock.Core.Tests` project cannot reference it for unit testing.

**Why it happens:** IDE "extract class" refactoring sometimes defaults to the active project.

**How to avoid:** Verify the file header: `namespace FuzzyClock.Core;` and confirm it lives in the `FuzzyClock.Core/` directory.

---

## Code Examples

### IPhraseProvider interface (complete)

```csharp
// FuzzyClock.Core/IPhraseProvider.cs
namespace FuzzyClock.Core;

public interface IPhraseProvider
{
    string GetPhrase(DateTime dt);
    (string Qualifier, string Emphasis) GetStructuredPhrase(DateTime dt);
}
```

### PhraseEngine static facade (complete skeleton)

```csharp
// FuzzyClock.Core/PhraseEngine.cs
namespace FuzzyClock.Core;

public static class PhraseEngine
{
    private static readonly Dictionary<string, IPhraseProvider> _providers = new()
    {
        ["en-classic"] = new EnglishPhraseProvider()
    };

    private static IPhraseProvider _activeProvider = _providers["en-classic"];

    public static string CurrentLocale { get; private set; } = "en-classic";

    /// <summary>
    /// Swaps the active provider. Returns true if locale is known; false if unknown (no change).
    /// </summary>
    public static bool SetLocale(string locale)
    {
        if (!_providers.TryGetValue(locale, out var provider))
            return false;
        _activeProvider = provider;
        CurrentLocale = locale;
        return true;
    }

    public static string GetPhrase(DateTime dt) =>
        _activeProvider.GetPhrase(dt);

    public static (string Qualifier, string Emphasis) GetStructuredPhrase(DateTime dt) =>
        _activeProvider.GetStructuredPhrase(dt);
}
```

### Coordinator test coverage (new test class)

```csharp
// FuzzyClock.Core.Tests/PhraseEngineCoordinatorTests.cs
using FuzzyClock.Core;

namespace FuzzyClock.Core.Tests;

[TestClass]
public class PhraseEngineCoordinatorTests
{
    [TestCleanup]
    public void ResetLocale() => PhraseEngine.SetLocale("en-classic");

    [TestMethod]
    public void DefaultLocale_IsEnClassic()
    {
        Assert.AreEqual("en-classic", PhraseEngine.CurrentLocale);
    }

    [TestMethod]
    public void SetLocale_KnownLocale_ReturnsTrue()
    {
        bool result = PhraseEngine.SetLocale("en-classic");
        Assert.IsTrue(result);
        Assert.AreEqual("en-classic", PhraseEngine.CurrentLocale);
    }

    [TestMethod]
    public void SetLocale_UnknownLocale_ReturnsFalse_LocaleUnchanged()
    {
        bool result = PhraseEngine.SetLocale("fr");
        Assert.IsFalse(result);
        Assert.AreEqual("en-classic", PhraseEngine.CurrentLocale);
    }

    [TestMethod]
    public void GetPhrase_DelegatesCorrectly_AfterSetLocaleRoundTrip()
    {
        PhraseEngine.SetLocale("en-classic");
        var dt = new DateTime(2024, 1, 15, 3, 30, 0);
        Assert.AreEqual("half past three", PhraseEngine.GetPhrase(dt));
    }
}
```

---

## State of the Art

| Old Shape | New Shape | When Changed | Impact |
|-----------|-----------|--------------|--------|
| `PhraseEngine` — monolithic static class, all logic inline | `PhraseEngine` — static facade; `EnglishPhraseProvider` — implementation | Phase 41 | Enables STYLE-01–04 (new phrase styles) and LANG-01–04 (multilingual) in later phases |
| No locale concept | `CurrentLocale` string + `SetLocale(string)` returning bool | Phase 41 | Runtime provider swapping; groundwork for CultureInfo-driven auto-select in Phase 46 |

---

## Open Questions

1. **Thread safety of static state**
   - What we know: `_activeProvider` and `CurrentLocale` are written by `SetLocale()` and read by `GetPhrase/GetStructuredPhrase`. In Phase 41 (English-only), `SetLocale` is never called from the timer thread — only from the tray menu, which is UI thread. No concurrency risk today.
   - What's unclear: Phase 46 will call `SetLocale` from startup code. If the DispatcherTimer fires concurrently during startup, there could be a narrow race.
   - Recommendation: For Phase 41, no locking needed. Add a note in Phase 46 research to consider `volatile` on `_activeProvider` if startup + timer overlap is a concern.

2. **EnglishPhraseProvider visibility**
   - What we know: `IPhraseProvider` must be `public` so future phase providers in a sibling assembly can implement it. `EnglishPhraseProvider` only needs to be `public` if test code constructs it directly.
   - What's unclear: The coordinator tests above don't directly instantiate `EnglishPhraseProvider` — they go through the facade. If direct-construction tests are desired for isolation, `public` is required.
   - Recommendation: Make both `IPhraseProvider` and `EnglishPhraseProvider` `public`. Minimal cost, maximum testability for later phases.

---

## Sources

### Primary (HIGH confidence)

- Direct code inspection: `C:/src/FuzzyStatsClock/FuzzyClock.Core/PhraseEngine.cs` — current public API surface confirmed
- Direct code inspection: `C:/src/FuzzyStatsClock/FuzzyClock.Core.Tests/PhraseEngineTests.cs` — all call sites use static `PhraseEngine.GetPhrase` and `PhraseEngine.GetStructuredPhrase`
- Direct code inspection: `C:/src/FuzzyStatsClock/FuzzyClock.App/MainWindow.xaml.cs` lines 398, 401, 439, 445 — all four App call sites use static dispatch
- `C:/src/FuzzyStatsClock/.planning/phases/41-phraseengine-provider-refactor/41-CONTEXT.md` — locked decisions on locale behavior

### Secondary (MEDIUM confidence)

- C# language specification on static class patterns and field initialization order — well-established behavior, no external verification needed

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; pure C# refactor on known .NET 10 codebase
- Architecture: HIGH — static facade pattern is directly verified against all call sites in the codebase
- Pitfalls: HIGH — all pitfalls derived from direct code inspection of existing test patterns and static-class semantics

**Research date:** 2026-03-08
**Valid until:** 2026-04-08 (stable — no third-party libraries involved)
